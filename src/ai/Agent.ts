// Agent
// =====
// claude-api, openai-api and chatgpt in illi's own loop (claude-code
// runs in Claude Code's: ClaudeCode.ts); a Wire
// (Anthropic.ts, OpenAI.ts, ChatGPT.ts) shapes requests and reads streams,
// signed with its API key or, chatgpt's, a login's token it renews (one
// the vendor refused, renewed, is asked again); a response's headers are
// its wire's to read (chatgpt's plan limits), and a turn's last request
// is kept whole, with its answer (AskAI.last).
// Each step sends every item (at most PICS images: Agent.thin) and
// streams one output; tool calls run in order, a message sent mid-run follows the next results, and the call
// ends at a step with no tools and nothing sent. A call `once` (a recap)
// takes one step, naming its tools but running none, unanswered if it
// calls one; so does one that goes on from another's request (AskAI.ts
// `from`: a suggested reply), sending that one's items and answer before
// its own. A request goes again,
// TRIES times at most, after its retry-after or a doubling wait, for a
// passing reason (`busy`: no connection, a retry status, a stream error,
// cut short or silent for the wire's `idle`), dropping what it streamed;
// no wait longer than MOST, and none begun past LONGEST (a retry-after
// past MOST ends the call, saying when it may go). A busy model is
// logged as its first request asks again and as its last is done, never
// each try (a storm logged ~600 lines a second).
// A call ends answered (`fail`: the model's answer failed, a refusal or
// a stop reason: its input's doing) or not: `full`, the request too long
// for the model's window (a vendor's refusal saying so, or a step past
// the call's `room` in tokens once its tools ran: Chat.refit makes the
// chat fit and goes on); `down`, the vendor's (a
// refusal of the request, as when the API key is wrong or its credit or
// plan used up, or busy past the tries: End.again); `lost`, ours (a
// stop), saying why. A vendor's why goes to the log (a refused body
// whole); a refusal's is the call's end too, in plain words and with
// what to do about it (the keys are the user's own), while a busy
// vendor's reads only that the AI service is busy, or that its host
// can't be reached (no connection), as the call's end and each retry's
// thought; a reply cut short is marked so. A stop ends the call and cuts
// its request at once. A request takes its place in single flight
// (AskAI.wait) as it is sent.

import { AskAI, type Ask, type Block, type Flight, type Try, type End, type Event, type Img, type Kind, type Say, type Usage, type Vendor } from "./AskAI.ts";
import { Anthropic } from "./Anthropic.ts";
import { ChatGPT } from "./ChatGPT.ts";
import { ClaudeCode } from "./ClaudeCode.ts";
import { OpenAI } from "./OpenAI.ts";
import { live_push } from "../ui/View.ts";
import { stream_events } from "../tools/Clip.ts";
import { Machine, type Spec } from "../tools/Machine.ts";
import * as config from "../config/Config.ts";
import { PICS } from "./Image.ts";

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

// note: what it did other than asked; again: a later try may answer
// (down, the vendor busy or out of reach)
export type Step = {
  out     : unknown[];
  uses    : Use[];
  entries : Entry[];
  stop    : "done" | "tools" | "again" | "busy" | "down" | "lost" | "fail" | "full";
  why     : string;
  note    : string;
  read?   : number;
  again?  : boolean;
};

export type Emit = (kind: Kind, text: string, fresh?: boolean) => void;

// an API: its key's name in config.KEYS (or, with `auth`, a login's token
// for each request, and what spoils one it refused), what a response's
// headers tell it (heard: chatgpt's plan limits), how many cache marks a
// request takes (marks: the last ones are kept, AskAI.marks), and how its
// stream reads into a step (S: what it read so far)
export type Wire<S> = {
  key     : string;
  idle    : number;
  url     : string;
  auth?   : { token: () => Promise<string>; spoil: (token: string) => void };
  heard?  : (res: Response, token: string) => void;
  headers : (key: string, ask: Ask) => Record<string, string>;
  body    : (ask: Ask, items: Item[], tools: Tool[], max: number) => unknown;
  marks   : (ask: Ask) => number;
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

// a retry's longest wait (s); how long after its first try a request
// is tried again at most (ms)
const MOST    = 60;
const LONGEST = 600e3;

// what a call the vendor never answered says; one whose host it never
// reached starts so (Agent.unreached)
const BUSY  = "the AI service is busy or unavailable right now";
const AWAY  = "can't reach ";

// a failed request's why, shown, at most this long (its body whole goes
// to the log)
const SAID  = 200;

// the API keys' vendors, by their names in config.KEYS
const VENDORS: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI" };

// what to do when an API key's money is used up
const CREDIT: Record<string, string> = {
  "claude-api" : "your Anthropic API credit is used up: add credit at console.anthropic.com, then send a message",
  "openai-api" : "your OpenAI API quota is used up: add credit at platform.openai.com, then send a message",
};

// stop reasons, in plain words
const STOPS: Record<string, string> = {
  max_tokens        : "the reply reached the most the model may write at once",
  max_output_tokens : "the reply reached the most the model may write at once",
  refusal           : "the model declined to answer",
  content_filter    : "the vendor's content filter stopped the reply",
};

// a refusal's body saying the request is too long for the model's window
const FULL  = /prompt is too long|exceed(s|ed)? (the )?context (limit|window|length)|context_length_exceeded|maximum context length|context window of this model/i;

// the requests asking a busy model again, by model, logged as they go
// from none to some and back (Agent.step)
const ASKING = new Map<string, number>();

// Agent
// =====

export namespace Agent {

  export function ask(ask: Ask, on: (ev: Event) => void): Try {
    if (ask.vendor === "claude-code") {
      return ClaudeCode.ask(ask, on);
    }
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
      end.text = "no API key: set " + wire.key.toUpperCase() + "_API_KEY and restart illi";
      end.stop = "down";
      return;
    }
    const tools = ask.from?.tools ?? (await Agent.server(run));
    // the marks a call it goes on from kept count against its vendor's
    const before = (ask.from?.items ?? []).flatMap((item) => (item.$ === "User" ? item.parts : [])).filter((p) => p.mark).length;
    const parts = AskAI.marks(ask.blocks.filter((b) => b.text !== ""), Math.max(0, wire.marks(ask) - before));
    const items: Item[] = [...(ask.from?.items ?? []), { $: "User", parts, imgs: ask.imgs ?? [] }];
    let steps = 0;
    while (!signal.aborted) {
      const step = await Agent.step(wire, run, key, (max) => wire.body(ask, Agent.thin(items), tools, max));
      steps += 1;
      for (const entry of step.entries) {
        on({ $: "Entry", ...entry });
      }
      if (step.stop === "down" || step.stop === "lost" || step.stop === "fail" || step.stop === "full") {
        end.text ||= step.why;
        end.stop  = step.stop;
        end.again = step.again;
        end.cut   = step.entries.some((e) => e.kind === "illi");
        return;
      }
      if ((ask.once || ask.from !== undefined) && (step.stop !== "done" || step.entries.some((e) => e.kind === "tool"))) {
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
      if (backs.length > 0 && ask.room !== undefined && (step.read ?? 0) > ask.room) {
        end.text = steps === 1 ? "the turn starts past " + ask.room + " tokens" : "";
        end.stop = "full";
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
    const first = Date.now();
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
        if (step.stop !== "busy" || k >= TRIES || Date.now() - first > LONGEST) {
          return step.stop === "busy" ? { ...step, stop: "down", why: Agent.gone(step.why), again: true } : step;
        }
        const wait = Agent.wait(res, k);
        if (wait > MOST) {
          return { ...step, stop: "down", why: "the AI service is busy: it asks to wait till " + Agent.when(Date.now() + wait * 1000), again: true };
        }
        if (!asking) {
          Agent.hold(model, step.why);
          asking = true;
        }
        const away = step.why.startsWith(AWAY);
        const said = away ? "C" + step.why.slice(1) + ". Asking" : "The AI service is busy: asking";
        run.on({ $: "Entry", kind: "mind", text: said + " again in " + Math.ceil(wait) + " s." });
        await Machine.nap(wait * 1000, signal);
      }
      return Agent.fail("stopped", []);
    } finally {
      if (asking) {
        Agent.free(model);
      }
    }
  }

  // how long a busy request waits before its kth try again (s): its
  // retry-after (seconds or a date), else a doubling wait, MOST at most
  export function wait(res: Response | null, k: number): number {
    const after = res?.headers.get("retry-after") ?? "";
    const secs = /^\s*\d/.test(after) ? Number(after) : (Date.parse(after) - Date.now()) / 1000;
    return secs > 0 ? secs : Math.min(MOST, 2 ** k);
  }

  // a time, as a person reads it: 14:05 today, Mon 14:05 within a week,
  // else Oct 30 14:05
  export function when(ms: number): string {
    const at = new Date(ms);
    const hm = String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0");
    if (at.toDateString() === new Date().toDateString()) {
      return hm;
    }
    const day = ms - Date.now() < 6 * 86400e3 ? at.toLocaleDateString("en-US", { weekday: "short" }) : at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return day + " " + hm;
  }

  // what a call busy past its tries says: that its host can't be reached,
  // or BUSY
  export function gone(why: string): string {
    return why.startsWith(AWAY) ? why : BUSY;
  }

  // a request that never reached its host (no connection, no DNS, refused)
  export function unreached(url: string): string {
    return AWAY + new URL(url).host + ": check your connection";
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
      const why = String(err?.message ?? err);
      return { res: null, step: Agent.fail(why, [], why.startsWith(AWAY) ? "busy" : "down") };
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
      wire.heard?.(res, token);
      const spoilt = res.status === 401 && wire.auth !== undefined;
      if (spoilt) {
        wire.auth!.spoil(token);
      }
      step = res.ok && res.body ? await Agent.stream(wire, run, res.body, timer, seen, st, flight.begun, read) : Agent.refused(wire, run.ask, res, await res.text(), spoilt);
    } catch (err: any) {
      const away = res === null && !idle.signal.aborted && !run.abort.signal.aborted;
      if (away) {
        console.error(run.ask.model + ": " + err.message);
      }
      step = Agent.fail(away ? Agent.unreached(wire.url) : err.message, [], "busy");
    }
    clearTimeout(timer);
    flight.end();
    if (res?.ok && read.done) {
      const use = wire.usage(st);
      step.read = use.input + use.write + use.read;
    }
    return { res, step };
  }

  // whether a refused request's body says it was too long for the model's
  // window (Anthropic: "prompt is too long", input and max_tokens past
  // the limit; OpenAI's and ChatGPT's context_length_exceeded)
  export function full(body: string): boolean {
    return FULL.test(body);
  }

  // a response that failed, its body: busy if asking again may answer (a
  // login's token spoilt, a passing status), else down, saying what to do:
  // a plan or credit used up (Agent.spent), too long for the model's
  // window (full: Agent.full), a key refused (its variable named), else
  // its status and why. A body its why shortens goes whole
  // to the log, once down
  export function refused<S>(wire: Wire<S>, ask: Ask, res: Response, body: string, spoilt: boolean): Step {
    const err = Agent.error(body);
    const spent = Agent.spent(ask.vendor, res.status, err);
    const said = Agent.reason(body);
    const why = "HTTP " + res.status + (said === "" ? "" : ": " + said);
    const down = !spoilt && !Agent.passing(res);
    if (down && said !== body.trim()) {
      console.error(ask.model + ": HTTP " + res.status + ", whole: " + body);
    }
    if (spent !== "") {
      return Agent.fail(spent, [], "down");
    }
    if (Agent.full(body)) {
      return Agent.fail(why, [], "full");
    }
    if (down && (res.status === 401 || res.status === 403) && !wire.auth) {
      const name = wire.key.toUpperCase() + "_API_KEY";
      return Agent.fail((VENDORS[wire.key] ?? wire.key) + " refused the API key (" + why + "): check " + name + " and restart illi", [], "down");
    }
    return Agent.fail(why, [], down ? "down" : "busy");
  }

  // a failed response's error, as its body gives it (Anthropic's and
  // OpenAI's are {error: {...}}, others' {error: "..."} or {detail}); null:
  // none
  export function error(body: string): any {
    const json: any = body.trim().startsWith("{") ? Agent.parse(body) : null;
    return json?.error ?? json?.detail ?? json;
  }

  // a failed request's why, shown: the API's message, else its body as
  // text, SAID characters at most; an HTML page's is none
  export function reason(body: string): string {
    const err = Agent.error(body);
    const msg = typeof err === "string" ? err : err?.message ?? err?.detail;
    const text = (typeof msg === "string" ? msg : body).replace(/\s+/g, " ").trim();
    if (/^<|<html|<!doctype/i.test(text)) {
      return "";
    }
    return text.length > SAID ? text.slice(0, SAID - 1) + "…" : text;
  }

  // a refusal that means the money behind it is used up ("": not one),
  // what to do about it: a ChatGPT plan's usage limit (ChatGPT.spent), or
  // without Codex; an API key's credit or quota. status: its response's
  // (0: an error in its stream)
  export function spent(vendor: Vendor, status: number, err: any): string {
    const said = (typeof err === "string" ? [err] : [err?.type, err?.code, err?.message].filter((x) => typeof x === "string")).join(" ");
    if (said === "" || status >= 500) {
      return "";
    }
    if (vendor === "chatgpt" && /usage_not_included/i.test(said)) {
      return "your ChatGPT plan doesn't include Codex, which illi runs on: /login with a plan that does (Plus or Pro)";
    }
    if (vendor === "chatgpt" && /usage.?limit/i.test(said)) {
      return ChatGPT.spent(typeof err === "object" ? err : {});
    }
    if (/insufficient_quota|exceeded your current quota|credit balance|billing/i.test(said)) {
      return CREDIT[vendor] ?? "";
    }
    return "";
  }

  // a stop reason, in plain words (unknown: as `none` says it), then what
  // the vendor added
  export function stopped(reason: string, none: string, more = ""): string {
    return (STOPS[reason] ?? none) + (more ? ": " + more : "");
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

  // a step that failed: what streamed marked as cut off (the why is the
  // call's end)
  export function fail(why: string, seen: Entry[], stop: Step["stop"] = "lost"): Step {
    const mark = "\n[cut off]";
    const entries = seen.filter((e) => e.text.trim()).map((e) => ({ kind: e.kind, text: e.text.trim() + mark }));
    return { out: [], uses: [], entries, stop, why, note: "" };
  }

  export async function* events(stream: ReadableStream<Uint8Array>) {
    for await (const data of stream_events(stream)) {
      if (data.trim() !== "[DONE]") {
        yield JSON.parse(data);
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

  // the items as a request carries them: at most PICS images, the newest
  // (the user's or a tool's). Past PICS the oldest are left out by halves
  // (down to half of PICS, then each half more), so a turn's requests
  // keep one prefix for many steps (the vendors' caches), a suggestion's
  // (Suggest.ts, the same items) too; the last tool results', not seen
  // yet, are kept before any other. One left out leaves a line in its
  // place. The items given are left as they are
  export function thin(items: Item[]): Item[] {
    const all: string[] = [];
    const last = items.findLastIndex((item) => item.$ === "Back");
    let fresh = 0;
    items.forEach((item, i) => {
      const imgs = item.$ === "User" ? [item.imgs] : item.$ === "Back" ? item.backs.map((b) => b.out.imgs ?? []) : [];
      imgs.forEach((list, j) => list.forEach((_, k) => all.push(i + "." + j + "." + k)));
      fresh += i === last ? imgs.flat().length : 0;
    });
    if (all.length <= PICS) {
      return items;
    }
    const half  = PICS / 2;
    const older = all.length - fresh;
    const drop  = fresh >= PICS ? all.length - PICS : Math.min(older, half * Math.floor((all.length - half) / half));
    const gone  = new Set(all.slice(0, drop));
    const left  = "[image left out of this request (at most " + PICS + " go in one): ask for it again to see it]";
    return items.map((item, i): Item => {
      if (item.$ === "User") {
        const imgs = item.imgs.filter((_, k) => !gone.has(i + ".0." + k));
        return imgs.length === item.imgs.length ? item : { ...item, imgs, parts: [...item.parts, { text: left, mark: false }] };
      }
      if (item.$ === "Back") {
        const backs = item.backs.map((b, j) => {
          const imgs = (b.out.imgs ?? []).filter((_, k) => !gone.has(i + "." + j + "." + k));
          return imgs.length === (b.out.imgs ?? []).length ? b : { ...b, out: { ...b.out, text: b.out.text + "\n" + left, imgs } };
        });
        return { ...item, backs };
      }
      return item;
    });
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
