// Agent
// =====
// claude-api, openai-api and chatgpt in Illi's own loop; a Wire
// (Anthropic.ts, OpenAI.ts, ChatGPT.ts) shapes requests and reads streams,
// signed with its API key or, chatgpt's, a login's token it renews (one
// the vendor refused, renewed, is asked again); a response's headers are
// its wire's to read (chatgpt's plan limits), and the input each caller's
// last request read is kept (AskAI.held: the context the view shows), a
// turn's whole, with its answer (AskAI.last).
// Each step sends every item and streams one output; tool calls run in
// order, a message sent mid-run follows the next results, and the call
// ends at a step with no tools and nothing sent. A call that goes on from
// another's request (AskAI.ts `from`: a suggested reply) sends that one's
// items and answer before its own, naming its tools but running none: it
// takes one step, unanswered if it calls a tool. A request goes again,
// TRIES times at most, after its retry-after or a doubling wait, for a
// passing reason (`busy`: no connection, a retry status, a stream error,
// cut short or silent for the wire's `idle`), dropping what it streamed.
// A busy model is logged as its first request asks again and as its
// last is done, never each try (a storm logged ~600 lines a second).
// A call ends answered (`fail`: the model's answer failed, a refusal or
// a stop reason: its input's doing) or not: `down`, the vendor's (a
// refusal of the request, as when the API key is wrong or its credit
// gone, or busy past TRIES); `lost`, ours (a stop), saying why. A
// vendor's why goes to the log; a refusal's is the call's end too (the
// keys are the user's own, so is what to do about it), while a busy
// vendor's reads only that the AI service is busy, as the call's end,
// each retry's thought and where a call is cut. A stop ends the call
// and cuts its request at once. A request takes its place in single
// flight (AskAI.wait) as it is sent.

import { AskAI, type Ask, type Block, type Flight, type Try, type End, type Event, type Img, type Kind, type Say } from "./AskAI.ts";
import { Anthropic } from "./Anthropic.ts";
import { ChatGPT } from "./ChatGPT.ts";
import { OpenAI } from "./OpenAI.ts";
import type { Usage } from "./Price.ts";
import { live_push } from "../ui/View.ts";
import { Machine, type Spec } from "../tools/Machine.ts";
import * as config from "../config/Config.ts";

// Types
// =====

export type Out = { text: string; fail: boolean; imgs?: Img[] };

export type Tool = Spec;

// what a request's stream read: whether it ended (its last event read,
// its usage all told)
export type Read = { done: boolean };

// a running call: the messages sent mid-run not taken yet
type Run = {
  ask   : Ask;
  on    : (ev: Event) => void;
  sent  : Say[];
  abort : AbortController;
  end   : End;
};

export type Back = { id: string; out: Out };

export type Item =
  | { $: "User"; parts: Block[]; imgs: Img[] } // user text, images
  | { $: "Turn"; out: unknown[] }             // the model's output, as its API gave it
  | { $: "Back"; backs: Back[] };             // tool results

// a tool call: its input (null: not JSON)
export type Use = { id: string; name: string; input: unknown };

export type Entry = { kind: Kind; text: string; of?: string };

// note: what it did other than asked
export type Step = {
  out     : unknown[];
  uses    : Use[];
  entries : Entry[];
  stop    : "done" | "tools" | "again" | "busy" | "down" | "lost" | "fail";
  why     : string;
  note    : string;
};

export type Emit = (kind: Kind, text: string, fresh?: boolean) => void;

// an API: its key's name in config.KEYS (or, with `auth`, a login's token
// for each request, and what spoils one it refused), what a response's
// headers tell it (heard: chatgpt's plan limits), and how its stream
// reads into a step (S: what it read so far)
export type Wire<S> = {
  key     : string;
  idle    : number;
  url     : string;
  auth?   : { token: () => Promise<string>; spoil: (token: string) => void };
  heard?  : (res: Response) => void;
  headers : (key: string, ask: Ask) => Record<string, string>;
  body    : (ask: Ask, items: Item[], tools: Tool[], max: number) => unknown;
  start   : (ask: Ask) => S;
  read    : (st: S, ev: any, on: Emit) => boolean;
  begun   : (ev: any) => boolean;
  step    : (st: S, ask: Ask) => Step;
  usage   : (st: S) => Usage;
};

// Constants
// =========

// a request's most output tokens: the models' own cap
const MAX   = 128000;
export const TRIES = 8;

// what a call the vendor never answered says
const BUSY  = "the AI service is busy or unavailable right now";

// the requests asking a busy model again, by model, logged as they go
// from none to some and back (Agent.step)
const ASKING = new Map<string, number>();

// Agent
// =====

export namespace Agent {

  export function ask(ask: Ask, on: (ev: Event) => void): Try {
    const end = AskAI.end("");
    const run: Run = { ask, on, sent: [], abort: new AbortController(), end };
    const send = (say: Say) => run.sent.push(say);
    const stop = () => {
      end.text = "stopped";
      run.abort.abort();
    };
    const done = (async () => {
      try {
        if (ask.vendor === "claude-api") {
          await Agent.loop(Anthropic.wire, run);
        } else if (ask.vendor === "chatgpt") {
          await Agent.loop(ChatGPT.wire, run);
        } else {
          await Agent.loop(OpenAI.wire, run);
        }
      } catch (err: any) {
        end.text ||= err.message;
      }
      end.ok   = end.ok && !run.abort.signal.aborted;
      end.left = run.sent;
      return end;
    })();
    return { send, stop, done };
  }

  export async function loop<S>(wire: Wire<S>, run: Run): Promise<void> {
    const { ask, on, end } = run;
    const signal = run.abort.signal;
    const key = wire.auth ? "" : config.KEYS[wire.key];
    if (!wire.auth && !key) {
      throw new Error("no API key: set " + wire.key.toUpperCase() + "_API_KEY");
    }
    const tools = ask.from?.tools ?? (await Agent.server(run));
    const parts = ask.blocks.filter((b) => b.text !== "");
    const items: Item[] = [...(ask.from?.items ?? []), { $: "User", parts, imgs: ask.imgs ?? [] }];
    while (!signal.aborted) {
      const step = await Agent.step(wire, run, key, (max) => wire.body(ask, items, tools, max));
      for (const entry of step.entries) {
        on({ $: "Entry", ...entry });
      }
      if (step.stop === "down" || step.stop === "lost" || step.stop === "fail") {
        end.text ||= step.why;
        end.stop = step.stop;
        return;
      }
      if (ask.from !== undefined && (step.stop !== "done" || step.entries.some((e) => e.kind === "tool"))) {
        end.text = "it called a tool";
        return;
      }
      items.push({ $: "Turn", out: step.out });
      if (ask.keep) {
        AskAI.keep({ ask, items: [...items], tools });
      }
      end.note = step.note || end.note;
      if (step.stop === "again") {
        continue;
      }
      const backs: Back[] = [];
      for (const use of step.uses) {
        if (signal.aborted) {
          return;
        }
        const out = await Agent.use(run, tools, use);
        on({ $: "Entry", kind: "echo", text: (out.fail ? "error: " : "") + out.text, of: use.id });
        backs.push({ id: use.id, out });
      }
      if (signal.aborted) {
        return;
      }
      const says = run.sent.splice(0);
      const replies = step.entries.filter((e) => e.kind === "illi");
      const text = replies.map((e) => e.text).join("\n\n");
      if (backs.length === 0 && says.length === 0) {
        end.ok   = true;
        end.text = text;
        return;
      }
      for (const say of says) {
        on({ $: "Entry", kind: "user", text: say.text });
      }
      if (backs.length > 0) {
        items.push({ $: "Back", backs });
      }
      if (says.length > 0) {
        const parts = says.filter((say) => say.text !== "").map((say) => ({ text: say.text, mark: false }));
        const imgs = says.flatMap((say) => say.imgs);
        items.push({ $: "User", parts, imgs });
      }
    }
  }

  // make: the request's body, writing `max` tokens at most. Asking again,
  // it counts among its model's requests asking again (ASKING)
  export async function step<S>(wire: Wire<S>, run: Run, key: string, make: (max: number) => unknown): Promise<Step> {
    const signal = run.abort.signal;
    const model = run.ask.model;
    let asking = false;
    try {
      for (let k = 1; !signal.aborted; k++) {
        const seen: Entry[] = [];
        const sent = Agent.request(wire, run, key, make, seen);
        const stopped = new Promise<null>((done) => signal.addEventListener("abort", () => done(null), { once: true }));
        const got = await Promise.race([sent, stopped]);
        if (got === null) {
          return Agent.fail("stopped", seen);
        }
        const { res, step } = got;
        if (step.stop === "down") {
          console.error(model + ": " + step.why.slice(0, 300));
        }
        if (step.stop !== "busy" || k >= TRIES) {
          return step.stop === "busy" ? { ...step, stop: "down", why: BUSY } : step;
        }
        if (!asking) {
          Agent.hold(model, step.why);
          asking = true;
        }
        const after = Number(res?.headers.get("retry-after") ?? "");
        const wait = after > 0 ? after : 2 ** k;
        run.on({ $: "Entry", kind: "mind", text: "The AI service is busy: asking again in " + wait + " s." });
        await Machine.nap(wait * 1000, signal);
      }
      return Agent.fail("stopped", []);
    } finally {
      if (asking) {
        Agent.free(model);
      }
    }
  }

  // a request asks `model` again; the first says why
  export function hold(model: string, why: string): void {
    const n = ASKING.get(model) ?? 0;
    if (n === 0) {
      console.error(model + ": " + why.slice(0, 300) + ": its requests ask again");
    }
    ASKING.set(model, n + 1);
  }

  // ... and is done, answered or not; the last says so
  export function free(model: string): void {
    const n = (ASKING.get(model) ?? 1) - 1;
    if (n === 0) {
      ASKING.delete(model);
      console.error(model + ": none asks again");
    } else {
      ASKING.set(model, n);
    }
  }

  // one request, writing its call's max tokens at most (Ask.max; none:
  // MAX), signed (a login's token, renewed if need be: one that won't
  // renew ends the call, saying why, never asked again as busy), then
  // sent once single flight lets it (AskAI.wait): its response, if any,
  // and step
  export async function request<S>(wire: Wire<S>, run: Run, key: string, make: (max: number) => unknown, seen: Entry[]): Promise<{ res: Response | null; step: Step }> {
    let token = key;
    try {
      token = wire.auth ? await wire.auth.token() : key;
    } catch (err: any) {
      return { res: null, step: Agent.fail(String(err?.message ?? err), [], "down") };
    }
    const flight = await AskAI.wait(run.ask);
    if (run.abort.signal.aborted) {
      flight.end();
      return { res: null, step: Agent.fail("stopped", []) };
    }
    return Agent.send(wire, run, token, make(Math.min(MAX, run.ask.max ?? MAX)), flight, seen);
  }

  export async function send<S>(wire: Wire<S>, run: Run, token: string, body: unknown, flight: Flight, seen: Entry[]): Promise<{ res: Response | null; step: Step }> {
    const idle = new AbortController();
    const timer = setTimeout(() => idle.abort(new Error("no word from the API in " + wire.idle / 1e3 + " s")), wire.idle);
    const st = wire.start(run.ask);
    const read: Read = { done: false };
    let res: Response | null = null;
    let step: Step;
    try {
      res = await fetch(wire.url, {
        method  : "POST",
        headers : wire.headers(token, run.ask),
        body    : JSON.stringify(body),
        signal  : AbortSignal.any([run.abort.signal, idle.signal]),
        timeout : false,
      } as RequestInit);
      wire.heard?.(res);
      const spoilt = res.status === 401 && wire.auth !== undefined;
      if (spoilt) {
        wire.auth!.spoil(token);
      }
      const why = res.ok && res.body ? "" : "HTTP " + res.status + ": " + Agent.reason(await res.text());
      step = why ? Agent.fail(why, [], spoilt || Agent.passing(res) ? "busy" : "down") : await Agent.stream(wire, run, res.body!, timer, seen, st, flight.begun, read);
    } catch (err: any) {
      step = Agent.fail(err.message, [], "busy");
    }
    clearTimeout(timer);
    flight.end();
    if (res?.ok && read.done) {
      const use = wire.usage(st);
      AskAI.read(run.ask.server, use.input + use.write + use.read);
    }
    return { res, step };
  }

  // a failed request's why: the API's message (Anthropic's and OpenAI's
  // errors are {error: {message}}), else the start of its body
  export function reason(body: string): string {
    try {
      const why = JSON.parse(body)?.error?.message;
      return typeof why === "string" ? why : body.slice(0, 2000);
    } catch {
      return body.slice(0, 2000);
    }
  }

  export function passing(res: Response): boolean {
    const should = res.headers.get("x-should-retry");
    const busy = [408, 409, 429].includes(res.status) || res.status >= 500;
    return should === "true" || (should !== "false" && busy);
  }

  // seen: what streamed, as told to the call (none once it stopped); st:
  // what it read, its usage; begun: its response began (Flight)
  export async function stream<S>(wire: Wire<S>, run: Run, body: ReadableStream<Uint8Array>, timer: Timer, seen: Entry[], st: S, begun: () => void, read: Read): Promise<Step> {
    const ask = run.ask;
    const on: Emit = (kind, text, fresh) => {
      if (!run.abort.signal.aborted) {
        live_push(seen, kind, text, fresh);
        run.on({ $: "Delta", kind, text, fresh });
      }
    };
    try {
      for await (const ev of Agent.events(body)) {
        timer.refresh();
        if (wire.begun(ev)) {
          begun();
        }
        if (wire.read(st, ev, on)) {
          read.done = true;
          const step = wire.step(st, ask);
          return step.stop === "fail" || step.stop === "busy" ? Agent.fail(step.why, seen, step.stop) : step;
        }
      }
      return Agent.fail("the stream ended early", seen, "busy");
    } catch (err: any) {
      return Agent.fail(err.message, seen, "busy");
    }
  }

  export function fail(why: string, seen: Entry[], stop: Step["stop"] = "lost"): Step {
    const mark = "\n[cut off: " + (stop === "busy" ? BUSY : why).slice(0, 300) + "]";
    const entries = seen.filter((e) => e.text.trim()).map((e) => ({ kind: e.kind, text: e.text.trim() + mark }));
    return { out: [], uses: [], entries, stop, why, note: "" };
  }

  export async function* events(stream: ReadableStream<Uint8Array>) {
    for await (const line of AskAI.lines(stream)) {
      if (line.startsWith("data:") && line.slice(5).trim() !== "[DONE]") {
        yield JSON.parse(line.slice(5));
      }
    }
  }

  // null: not JSON
  export function parse(json: string): unknown {
    try {
      return JSON.parse(json || "{}");
    } catch {
      return null;
    }
  }

  // Tools
  // -----

  export async function use(run: Run, tools: Tool[], use: Use): Promise<Out> {
    if (!tools.some((t) => t.name === use.name)) {
      return { text: "No tool " + use.name + ".", fail: true };
    }
    if (use.input === null || typeof use.input !== "object") {
      return { text: "The input is not a JSON object.", fail: true };
    }
    try {
      const out = await Agent.call(run, use.name, use.input);
      return { ...out, text: out.text || "(no output)" };
    } catch (err: any) {
      const why = run.abort.signal.aborted ? "(stopped)" : err.message;
      return { text: why, fail: true };
    }
  }

  export async function server(run: Run): Promise<Tool[]> {
    if (!run.ask.server) {
      return [];
    }
    const list = await Agent.rpc(run, "tools/list", {});
    return list.tools.map((t: any) => ({ name: t.name, info: t.description, schema: t.inputSchema }));
  }

  export async function call(run: Run, name: string, input: unknown): Promise<Out> {
    const res = await Agent.rpc(run, "tools/call", { name, arguments: input });
    const pics = res.content.filter((part: any) => part.type === "image");
    const imgs = pics.map((part: any) => ({ type: part.mimeType, data: part.data }));
    return { text: AskAI.show(res.content), fail: res.isError === true, imgs };
  }

  export async function rpc(run: Run, method: string, params: unknown): Promise<any> {
    const res = await fetch(run.ask.server, {
      method  : "POST",
      headers : { "content-type": "application/json" },
      body    : JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal  : run.abort.signal,
      timeout : false,
    } as RequestInit);
    const msg = await res.json();
    if (msg.error) {
      throw new Error(method + ": " + msg.error.message);
    }
    return msg.result;
  }

}
