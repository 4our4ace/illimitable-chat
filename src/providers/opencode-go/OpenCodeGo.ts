// OpenCode Go
// ===========
// The wire of opencode-go (Agent.ts): OpenCode Go's Chat Completions
// API, streamed, on a key (Bearer). illi names itself (its user agent)
// and the chat (x-opencode-session: one for all of a chat's requests,
// which OpenCode caches the prefix by), as OpenCode asks of coding agents
// other than its own. Its models are the plan's catalog (its public
// list; the key is checked against it too): each one OpenCode serves on
// Chat Completions itself (the others it reaches by translating, which
// illi leaves out), with tools, neither free (those answer OpenCode's own
// app alone) nor a contributor's (they train on what's sent), the newest
// of each family (Pick.family); learned and kept for the next start, and
// asked before a turn till told. A model's thoughts stream as
// reasoning_content (or reasoning), sent back with its turn (DeepSeek
// asks for them in a run of tool calls) to a model that streams them; an
// effort goes as reasoning_effort to a model that lists efforts, fitted
// to those; images go to a model that takes them, else a note in their
// place (a tool's in a message after its results, as Chat Completions
// takes none in a tool's); the reply is capped at the model's own most.
// The usage comes in a last chunk (stream_options); a stream that ends
// without it still ends its step once its finish came (Wire.ended). A
// model's share of the plan used up (429 GoUsageLimitError: each model
// has its own 5-hour, weekly and monthly limit) is down, said plainly; a
// refused key, a request too long for the window and any other failure
// as Agent.ts takes them. No cache marks (OpenCode caches by the session),
// no web search. Silent while it reasons, it is dead after 20 min.

import type { Ask, Img, Usage } from "../../ai/AskAI.ts";
import { Agent, type Back, type Emit, type Entry, type Item, type Step, type Tool, type Use, type Wire } from "../../ai/Agent.ts";
import { EFFORTS, Pick, type Model } from "../../ai/Pick.ts";
import * as config from "../../config/Config.ts";
import pkg from "../../../package.json" with { type: "json" };
import { FACTS } from "./Facts.ts";
import type { Provider } from "../Provider.ts";

// Types
// =====

// a tool call as it streams: its id, its name, its arguments so far
type Call = { id: string; name: string; args: string };

// a stream read so far: the reply, the thoughts, the calls (by their
// index), why it finished ("": not yet), its usage (told: its chunk
// came), an error it sent
type State = { text: string; mind: string; calls: Call[]; finish: string; told: boolean; use: Usage; error: any };

// what the catalog tells of a model beyond its Model: whether it takes
// images, the most it writes at once, whether it streams its thoughts
// (as reasoning_content)
export type Info = { images: boolean; output: number; thinks: boolean };

// a model as the catalog lists it: its Model and Info, and whether illi
// offers it (what Chat Completions serves itself, with tools, not free
// nor a contributor's)
export type Listed = { model: Model; info: Info; fits: boolean };

// Constants
// =========

const BASE = "https://opencode.ai/inference/go";
const CHAT = BASE + "/openai/v1/chat/completions";
const LIST = BASE + "/v1/models";

// how illi names itself to OpenCode
const AGENT = "illi/" + pkg.version;

// a refusal that means the model's share of the plan is used up, and
// what to do about it
const LIMIT = /GoUsageLimit/i;
const USED  = "this model's share of your OpenCode Go plan is used up for now (each model has its own 5-hour, weekly and monthly limit): /model picks another, or wait till it resets";

// what a request's images become for a model that takes none
const NO_IMAGES = (n: number) => "[" + (n === 1 ? "an image" : n + " images") + " left out: this model takes none]";

// the catalog asked (once a key: /login may change the one in use; again
// AGAIN after it failed), the key it was asked with, when it last failed;
// what it told of each model, by id
let asked: Promise<boolean> | null = null;
let asked_by = "";
let failed = 0;
const INFO = new Map<string, Info>();
const AGAIN = 300e3;

// OpenCode Go
// ===========

export namespace OpenCodeGo {

  // the plan's models (OpenCodeGo.list), those illi offers (lineup) the
  // list it offers now (one new offered, unless `models` names those
  // offered; one gone gone), learned and kept for the next start; asked
  // once a key, a failure changing nothing (the list held) and asked
  // again past AGAIN (what the wire knows of each model comes with it:
  // Info). true: the list changed
  export function models(key: string): Promise<boolean> {
    if (asked_by !== key || (failed > 0 && Date.now() - failed > AGAIN)) {
      [asked, asked_by, failed] = [null, key, 0];
    }
    asked ??= OpenCodeGo.list(key).then((all) => {
      const lineup = OpenCodeGo.lineup(all);
      const shape  = (models: Model[]) => JSON.stringify(models.map((m) => [m.label, m.efforts ?? [], m.window, m.price]));
      const news   = lineup.length > 0 && shape(lineup) !== shape(Pick.list(FACTS.id));
      if (news) {
        const fresh = Pick.learn(FACTS.id, lineup, "replace");
        if (!config.MODELS_SET) {
          config.OFFER.models.push(...fresh.filter((label) => !config.OFFER.models.includes(label)));
        }
        config.config_models_keep(FACTS.id, Pick.list(FACTS.id));
      }
      return news;
    }, (err) => {
      failed = Date.now();
      console.error("opencode-go: the models weren't told: " + (key === "" ? String(err?.message) : String(err?.message).split(key).join("<key>")));
      return false;
    });
    return asked;
  }

  // the catalog's models, each with what it tells (OpenCodeGo.listed),
  // its Info kept for the wire
  export async function list(key: string): Promise<Listed[]> {
    const res = await fetch(LIST, { headers: { authorization: "Bearer " + key, "user-agent": AGENT }, signal: AbortSignal.timeout(15e3) });
    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }
    const body: any = await res.json();
    const all = (Array.isArray(body?.data) ? body.data : []).map(OpenCodeGo.listed).filter((m: Listed | null): m is Listed => m !== null);
    for (const m of all) {
      INFO.set(m.model.id, m.info);
    }
    return all;
  }

  // a catalog entry read: its label its id, its window (limit.context),
  // efforts (those of illi's it lists; none: it takes none), price
  // (dollars a million tokens in), images, most output, thoughts; null:
  // no id
  export function listed(m: any): Listed | null {
    if (typeof m?.id !== "string" || m.id === "") {
      return null;
    }
    const effort  = m.capabilities?.reasoning?.effort;
    const efforts = Array.isArray(effort) ? EFFORTS.filter((e) => effort.includes(e)) : [];
    const price   = Number(m.cost?.text?.input?.price);
    const chat    = m.api?.["chat-completions"];
    const window  = Number(m.limit?.context) || undefined;
    const model: Model = { label: m.id, id: m.id, speeds: ["slow"], window, efforts: efforts.length > 0 ? efforts : undefined, price: Number.isFinite(price) ? price : undefined };
    const images  = (m.modalities?.input ?? []).some((t: unknown) => typeof t === "string" && t.startsWith("image/"));
    const info: Info = { images, output: Number(m.limit?.output) || 0, thinks: chat?.compatibility?.reasoning_field === "reasoning_content" };
    const fits    = chat !== undefined && (m.type ?? "chat") === "chat" && m.capabilities?.tools?.supported === true && price > 0 && !/contributor|(^|-)free$/i.test(m.id);
    return { model, info, fits };
  }

  // the models illi offers of the catalog: those it fits (Listed), the
  // newest of each family (Pick.version), in the catalog's order
  export function lineup(all: Listed[]): Model[] {
    const fit  = all.filter((m) => m.fits).map((m) => m.model);
    const best = new Map<string, Model>();
    for (const m of fit) {
      const was = best.get(Pick.family(m.label));
      if (was === undefined || Pick.later(Pick.version(m.label), Pick.version(was.label))) {
        best.set(Pick.family(m.label), m);
      }
    }
    return fit.filter((m) => best.get(Pick.family(m.label)) === m);
  }

  // what the catalog told of a model (none: not told yet)
  export function info(id: string): Info | undefined {
    return INFO.get(id);
  }

  // whether a key works, asked of the catalog ("": it does; else why not,
  // in a few words, never the error's own), as /login takes it. The list
  // is public, so a key it refuses is one OpenCode doesn't know; one
  // whose workspace has no Go plan is told by its first call
  export async function check(key: string): Promise<string> {
    try {
      const res = await fetch(LIST, { headers: { authorization: "Bearer " + key, "user-agent": AGENT }, signal: AbortSignal.timeout(15e3) });
      return res.ok ? "" : res.status === 401 || res.status === 403 ? "OpenCode refused the key" : "OpenCode answered HTTP " + res.status;
    } catch (err: any) {
      return "illi couldn't reach OpenCode (" + (err?.name === "TimeoutError" ? "no answer in 15 seconds" : "no connection") + ")";
    }
  }

  // the session a call's requests name, which all a chat's share (its
  // system prompt's hash: the same for a chat's every call, whatever its
  // model)
  export function session(ask: Ask): string {
    return Bun.hash(ask.system).toString(16);
  }

  export function headers(key: string, ask: Ask): Record<string, string> {
    return {
      authorization        : "Bearer " + key,
      "content-type"       : "application/json",
      accept               : "text/event-stream",
      "user-agent"         : AGENT,
      "x-opencode-session" : OpenCodeGo.session(ask),
    };
  }

  // a request: its messages, its tools as functions, its effort (to a
  // model that lists efforts: the nearest of those, Pick.fit), the most
  // it writes (at most the model's own; its own not told yet, none sent
  // unless the call caps it)
  export function body(ask: Ask, items: Item[], tools: Tool[], max: number): unknown {
    const model  = Pick.by_id(FACTS.id, ask.model);
    const info   = INFO.get(ask.model);
    const effort = model?.efforts !== undefined ? Pick.fit({ vendor: ask.vendor, model: model.label, effort: ask.effort, speed: ask.speed }).effort : undefined;
    return {
      model            : ask.model,
      stream           : true,
      stream_options   : { include_usage: true },
      messages         : [{ role: "system", content: ask.system }, ...items.flatMap((item) => OpenCodeGo.messages(item, info))],
      tools            : tools.length === 0 ? undefined : tools.map((t) => ({ type: "function", function: { name: t.name, description: t.info, parameters: t.schema } })),
      reasoning_effort : effort,
      max_tokens       : info !== undefined && info.output > 0 ? Math.min(max, info.output) : ask.max !== undefined ? max : undefined,
    };
  }

  // an item's messages: the user's text (one string; with images, its
  // parts), a turn as the model gave it (its thoughts left out for a
  // model that streams none), tool results each a tool message (their
  // images in a user message after them)
  export function messages(item: Item, info: Info | undefined): unknown[] {
    const images = info?.images ?? true;
    switch (item.$) {
      case "User": {
        const text = item.parts.map((p) => p.text).join("");
        if (item.imgs.length === 0) {
          return [{ role: "user", content: text }];
        }
        return [{ role: "user", content: images ? [{ type: "text", text }, ...item.imgs.map(OpenCodeGo.image)] : text + "\n" + NO_IMAGES(item.imgs.length) }];
      }
      case "Turn": {
        return item.out.map((m: any) => (info !== undefined && !info.thinks && m.reasoning_content !== undefined ? { ...m, reasoning_content: undefined } : m));
      }
      case "Back": {
        return OpenCodeGo.backs(item.backs, images);
      }
    }
  }

  // tool results: each its tool message, its images said in it, then
  // (to a model that takes them) one user message holding them
  export function backs(backs: Back[], images: boolean): unknown[] {
    const imgs = backs.flatMap((b) => b.out.imgs ?? []);
    const told = backs.map((b) => {
      const n = b.out.imgs?.length ?? 0;
      const said = n === 0 ? "" : images ? "\n[" + (n === 1 ? "its image follows" : "its " + n + " images follow") + " in the next message]" : "\n" + NO_IMAGES(n);
      return { role: "tool", tool_call_id: b.id, content: b.out.text + said };
    });
    return images && imgs.length > 0 ? [...told, { role: "user", content: [{ type: "text", text: "The images the tool results above returned:" }, ...imgs.map(OpenCodeGo.image)] }] : told;
  }

  export function image(img: Img): unknown {
    return { type: "image_url", image_url: { url: "data:" + img.type + ";base64," + img.data } };
  }

  // one stream chunk; whether it is the last (its finish and its usage
  // both read: they may come in one chunk or two)
  export function read(st: State, ev: any, on: Emit): boolean {
    if (ev?.error !== undefined) {
      st.error = ev.error;
      return true;
    }
    for (const c of Array.isArray(ev?.choices) ? ev.choices : []) {
      const d = c.delta ?? {};
      const mind = d.reasoning_content ?? d.reasoning;
      if (typeof mind === "string" && mind !== "") {
        st.mind += mind;
        on("mind", mind);
      }
      if (typeof d.content === "string" && d.content !== "") {
        st.text += d.content;
        on("illi", d.content);
      }
      for (const t of Array.isArray(d.tool_calls) ? d.tool_calls : []) {
        OpenCodeGo.call(st, t, on);
      }
      if (typeof c.finish_reason === "string" && c.finish_reason !== "") {
        st.finish = c.finish_reason;
      }
    }
    if (ev?.usage) {
      OpenCodeGo.usage(st.use, ev.usage);
      st.told = true;
    }
    return st.told && st.finish !== "";
  }

  // a piece of a tool call: the call it's of (by its index; none given,
  // a new id starts one), shown live as it starts (its name), then its
  // arguments' pieces
  export function call(st: State, t: any, on: Emit): void {
    const last = st.calls.length - 1;
    const k    = typeof t.index === "number" ? t.index : t.id && st.calls[last]?.id !== t.id ? st.calls.length : Math.max(0, last);
    let call   = st.calls[k];
    if (call === undefined) {
      call = st.calls[k] = { id: String(t.id ?? ""), name: String(t.function?.name ?? ""), args: "" };
      on("tool", call.name + " ", true);
    } else if (t.id && call.id === "") {
      call.id = String(t.id);
    }
    const args = t.function?.arguments;
    if (typeof args === "string" && args !== "") {
      call.args += args;
      on("tool", args);
    }
  }

  // the usage chunk: the prompt's tokens, those read from the cache
  // apart (and those written to it, if told)
  export function usage(use: Usage, u: any): void {
    use.read  = Number(u.prompt_tokens_details?.cached_tokens) || 0;
    use.write = Number(u.prompt_tokens_details?.cache_write_tokens) || 0;
    use.input = Math.max(0, (Number(u.prompt_tokens) || 0) - use.read - use.write);
  }

  // the step a stream gave: an error it sent (the plan's limit: down;
  // too long for the window: full; else busy, asked again), a reply cut
  // at the most it may write or by a filter (failed), its calls (tools),
  // else done
  export function step(st: State, ask: Ask): Step {
    const calls = st.calls.filter((c) => c !== undefined).map((c, k) => ({ ...c, id: c.id || "call_" + k }));
    const turn  = { role: "assistant", content: st.text === "" ? null : st.text, reasoning_content: st.mind === "" ? undefined : st.mind, tool_calls: calls.length === 0 ? undefined : calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args || "{}" } })) };
    const uses: Use[] = calls.map((c) => ({ id: c.id, name: c.name, input: Agent.parse(c.args) }));
    const entries: Entry[] = [
      ...(st.mind.trim() === "" ? [] : [{ kind: "mind" as const, text: st.mind.trim() }]),
      ...(st.text.trim() === "" ? [] : [{ kind: "illi" as const, text: st.text.trim() }]),
      ...calls.map((c) => ({ kind: "tool" as const, text: c.name + " " + (c.args || "{}"), of: c.id })),
    ];
    const step: Step = { out: [turn], uses, entries, stop: "done", why: "", note: "" };
    if (st.error !== null) {
      const spent = Agent.spent(ask.vendor, 0, st.error);
      const why   = String(st.error?.message ?? st.error ?? "failed");
      return { ...step, stop: spent !== "" ? "down" : Agent.full(why) ? "full" : "busy", why: spent || why };
    }
    if (st.finish === "length") {
      return { ...step, stop: "fail", why: Agent.stopped("max_tokens", "") };
    }
    if (st.finish === "content_filter") {
      return { ...step, stop: "fail", why: Agent.stopped("content_filter", "") };
    }
    return { ...step, stop: uses.length > 0 ? "tools" : "done" };
  }

  export const wire: Wire<State> = {
    key     : FACTS.key.name,
    idle    : 1200e3,
    url     : CHAT,
    headers : OpenCodeGo.headers,
    body    : OpenCodeGo.body,
    marks   : () => 0,
    start   : (ask) => ({ text: "", mind: "", calls: [], finish: "", told: false, use: { input: 0, write: 0, read: 0, speed: ask.speed }, error: null }),
    read    : OpenCodeGo.read,
    begun   : (ev) => Array.isArray(ev?.choices) && ev.choices.length > 0,
    step    : OpenCodeGo.step,
    usage   : (st) => st.use,
    ended   : (st) => st.finish !== "",
  };

}

// opencode-go's code, as the rest of illi asks it (Provider.ts): a call
// on its wire in illi's loop, a key checked, a model's share of the plan
// used up said plainly, and the plan's models asked at the start (as the
// key changes, and before a turn till told)
export const PROVIDER: Provider = {
  facts   : FACTS,
  wire    : OpenCodeGo.wire,
  check   : OpenCodeGo.check,
  spent   : (said) => (LIMIT.test(said) ? USED : ""),
  ready   : async () => {
    const key = config.KEYS[FACTS.key.name];
    if (key) {
      await OpenCodeGo.models(key);
    }
    return null;
  },
  account : () => (config.KEYS[FACTS.key.name] ? OpenCodeGo.models(config.KEYS[FACTS.key.name]) : undefined),
};
