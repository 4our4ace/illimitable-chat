// Anthropic
// =========
// The wire of claude-api (Agent.ts): the Messages API, streamed, with
// adaptive thinking summarized and fast as `speed`. Outputs go back
// whole, items of one role joined. A marked block gets cache_control (the
// latest the request has room for), a marked end (AskAI.tail) the
// top-level one too (a request takes BREAKS in all), and so does the
// system prompt:
// what every call shares (tools, system) stays cached whatever its view
// does, so a view written anew writes only itself. A stream builds blocks
// from pieces; tool_use and end_turn end a step, pause_turn asks again,
// any other stop fails (in plain words: Agent.stopped), an error event is
// busy. It pings while the model thinks, so 5 silent
// minutes mean it is dead. The Models API tells each model's window
// (models), learned at the start.

import { AskAI, type Ask, type Img, type Usage } from "./AskAI.ts";
import { Agent, type Emit, type Entry, type Item, type Step, type Tool, type Use, type Wire } from "./Agent.ts";
import { Pick } from "./Pick.ts";
import * as config from "../config/Config.ts";
import { FAILED } from "../ui/View.ts";

// Types
// =====

// a stream read so far: the content blocks, the JSON of each tool input
// that came in pieces, how it stopped and why, its usage, an error
type State = {
  blocks : any[];
  json   : string[];
  stop   : string;
  why    : any;
  use    : Usage;
  error  : any;
};

// Constants
// =========

const MARK  = { type: "ephemeral" };

// the cache breakpoints a request takes: the system prompt's, the
// top-level's (a marked end), the rest its blocks'
const BREAKS = 4;
const WEB   = { type: "web_search_20260318", name: "web_search" };
const FAST  = "fast-mode-2026-02-01";
// the models a key may use, a page of them at a time (at most PAGES)
const LIST  = "https://api.anthropic.com/v1/models?limit=1000";
const PAGES = 10;

// the key's models asked (once a key: /login may change the one in use),
// and the key they were asked with
let listed: Promise<boolean> | null = null;
let listed_by = "";

// Anthropic
// =========

export namespace Anthropic {

  // the windows of the models the key may use (Models API: list), each
  // built-in model's learned and kept for the next start; asked once a
  // key, a failure changing nothing (the built-in windows hold). true: a
  // window changed
  export function models(key: string): Promise<boolean> {
    if (listed_by !== key) {
      [listed, listed_by] = [null, key];
    }
    listed ??= Anthropic.list(key).then((all) => {
      const news = all.filter((m) => Pick.told("claude-api", m.id, m.window)).length > 0;
      if (news) {
        config.config_models_keep("claude-api", Pick.list("claude-api"));
      }
      return news;
    }, (err) => {
      console.error("claude-api: the models' windows weren't told: " + (key === "" ? String(err?.message) : String(err?.message).split(key).join("<key>")));
      return false;
    });
    return listed;
  }

  // whether a key works, asked of the Models API ("": it does; else why
  // not, in a few words, never the error's own: a header's may hold the
  // key), as /login takes it
  export async function check(key: string): Promise<string> {
    try {
      const res = await fetch(LIST, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(15e3) });
      return res.ok ? "" : res.status === 401 || res.status === 403 ? "Anthropic refused the key" : "Anthropic answered HTTP " + res.status;
    } catch (err: any) {
      return "illi couldn't reach Anthropic (" + (err?.name === "TimeoutError" ? "no answer in 15 seconds" : "no connection") + ")";
    }
  }

  // each model the key may use, by id, with its window (max_input_tokens),
  // page after page
  export async function list(key: string): Promise<Array<{ id: string; window: number }>> {
    const out: Array<{ id: string; window: number }> = [];
    let after = "";
    for (let page = 0; page < PAGES; page++) {
      const res = await fetch(LIST + (after === "" ? "" : "&after_id=" + encodeURIComponent(after)), { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(15e3) });
      if (!res.ok) {
        throw new Error("HTTP " + res.status);
      }
      const body: any = await res.json();
      for (const m of Array.isArray(body?.data) ? body.data : []) {
        if (typeof m?.id === "string" && Number(m.max_input_tokens) > 0) {
          out.push({ id: m.id, window: Number(m.max_input_tokens) });
        }
      }
      if (body?.has_more !== true || typeof body.last_id !== "string") {
        break;
      }
      after = body.last_id;
    }
    return out;
  }

  export function headers(key: string, ask: Ask): Record<string, string> {
    const out: Record<string, string> = {
      "x-api-key"         : key,
      "anthropic-version" : "2023-06-01",
      "content-type"      : "application/json",
    };
    if (ask.speed === "fast") {
      out["anthropic-beta"] = FAST;
    }
    return out;
  }

  export function body(ask: Ask, items: Item[], tools: Tool[], max: number): unknown {
    const defs: object[] = tools.map((t) => ({ name: t.name, description: t.info, input_schema: t.schema, eager_input_streaming: true }));
    if (ask.searches > 0) {
      defs.push({ ...WEB, max_uses: ask.searches });
    }
    const messages: any[] = [];
    for (const item of items) {
      const msg = Anthropic.message(item);
      const top = messages[messages.length - 1];
      if (top?.role === msg.role) {
        top.content.push(...msg.content);
      } else {
        messages.push(msg);
      }
    }
    const cache = AskAI.tail(ask) ? MARK : undefined;
    return {
      model         : ask.model,
      max_tokens    : max,
      stream        : true,
      system        : [{ type: "text", text: ask.system, cache_control: MARK }],
      thinking      : { type: "adaptive", display: "summarized" },
      output_config : { effort: ask.effort },
      cache_control : cache,
      tools         : defs.length > 0 ? defs : undefined,
      speed         : ask.speed === "fast" ? "fast" : undefined,
      messages,
    };
  }

  export function message(item: Item): { role: string; content: any[] } {
    switch (item.$) {
      case "User": {
        const texts = item.parts.map((p) => ({ type: "text", text: p.text, cache_control: p.mark ? MARK : undefined }));
        return { role: "user", content: [...texts, ...item.imgs.map(Anthropic.image)] };
      }
      case "Turn": {
        return { role: "assistant", content: [...item.out] };
      }
      case "Back": {
        const content = item.backs.map((b) => ({
          type         : "tool_result",
          tool_use_id : b.id,
          content     : Anthropic.content([b.out.text], b.out.imgs ?? []),
          is_error    : b.out.fail,
        }));
        return { role: "user", content };
      }
    }
  }

  // content blocks: the texts (none empty), then the images
  export function content(texts: string[], imgs: Img[]): unknown[] {
    const blocks = texts.filter((text) => text !== "").map((text) => ({ type: "text", text }));
    return [...blocks, ...imgs.map(Anthropic.image)];
  }

  export function image(img: Img): unknown {
    return { type: "image", source: { type: "base64", media_type: img.type, data: img.data } };
  }

  // one stream event; whether it is the last
  export function read(st: State, ev: any, on: Emit): boolean {
    switch (ev.type) {
      case "message_start": {
        Anthropic.usage(st.use, ev.message.usage ?? {});
        return false;
      }
      case "content_block_start": {
        st.blocks[ev.index] = { ...ev.content_block };
        Anthropic.live(ev, on);
        return false;
      }
      case "content_block_delta": {
        Anthropic.delta(st, ev.index, ev.delta);
        Anthropic.live(ev, on);
        return false;
      }
      case "message_delta": {
        st.stop = ev.delta.stop_reason ?? st.stop;
        st.why  = ev.delta.stop_details ?? st.why;
        Anthropic.usage(st.use, ev.usage ?? {});
        return false;
      }
      case "error": {
        st.error = ev.error;
        return true;
      }
    }
    return ev.type === "message_stop";
  }

  export function usage(use: Usage, u: any): void {
    use.input    = u.input_tokens ?? use.input;
    use.write    = u.cache_creation_input_tokens ?? use.write;
    use.read     = u.cache_read_input_tokens ?? use.read;
    use.speed    = u.speed === undefined ? use.speed : u.speed === "fast" ? "fast" : "slow";
  }

  // a piece of a content block, added to it
  export function delta(st: State, k: number, delta: any): void {
    const block = st.blocks[k];
    switch (delta.type) {
      case "thinking_delta": {
        block.thinking += delta.thinking;
        return;
      }
      case "text_delta": {
        block.text += delta.text;
        return;
      }
      case "signature_delta": {
        block.signature = delta.signature;
        return;
      }
      case "input_json_delta": {
        st.json[k] = (st.json[k] ?? "") + delta.partial_json;
        return;
      }
      case "citations_delta": {
        block.citations = [...(block.citations ?? []), delta.citation];
        return;
      }
    }
  }

  // what an event shows live: thoughts, replies, a tool call as it forms
  // (its name, then its input's JSON in pieces, as Call.ts reads it)
  export function live(ev: any, on: Emit): void {
    const block = ev.content_block ?? {};
    const delta = ev.delta ?? {};
    if (ev.type === "content_block_start" && block.type.endsWith("tool_use")) {
      on("tool", block.name + " ", true);
    }
    if (delta.type === "thinking_delta") {
      on("mind", delta.thinking);
    }
    if (delta.type === "text_delta") {
      on("illi", delta.text);
    }
    if (delta.type === "input_json_delta") {
      on("tool", delta.partial_json);
    }
  }

  // the step a stream gave
  export function step(st: State, ask: Ask): Step {
    const uses: Use[] = [];
    st.blocks.forEach((b, k) => {
      if (st.json[k] !== undefined) {
        b.input = Agent.parse(st.json[k]);
      }
      if (b.type === "tool_use") {
        uses.push({ id: b.id, name: b.name, input: b.input });
      }
      if (b.input === null) {
        b.input = {};
      }
    });
    const out = st.blocks.filter((b) => b.type !== "text" || b.text);
    const slow = ask.speed === "fast" && st.use.speed !== "fast";
    const note = slow ? "ran at " + st.use.speed + " speed" : "";
    const step: Step = { out, uses, entries: Anthropic.entries(out), stop: "done", why: "", note };
    if (st.error) {
      return { ...step, stop: "busy", why: st.error.type + ": " + st.error.message };
    }
    switch (st.stop) {
      case "end_turn":
      case "tool_use": {
        return { ...step, stop: uses.length > 0 ? "tools" : "done" };
      }
      case "pause_turn": {
        return { ...step, stop: "again" };
      }
    }
    return { ...step, stop: st.stop === "model_context_window_exceeded" ? "full" : "fail", why: Agent.stopped(st.stop, "stopped: " + st.stop, st.why?.explanation) };
  }

  // the messages of an output, in order (a run of text blocks, split
  // where citations go, is one reply)
  export function entries(out: any[]): Entry[] {
    const entries: Entry[] = [];
    for (const b of out) {
      const entry = Anthropic.entry(b);
      const top = entries[entries.length - 1];
      if (entry?.kind === "illi" && top?.kind === "illi") {
        top.text += entry.text;
      } else if (entry !== null) {
        entries.push(entry);
      }
    }
    return entries.map((e) => ({ ...e, text: e.text.trim() })).filter((e) => e.text);
  }

  // the message of a block, if any
  export function entry(b: any): Entry | null {
    const c = b.content;
    switch (b.type) {
      case "text": {
        return { kind: "illi", text: b.text };
      }
      case "thinking": {
        return { kind: "mind", text: b.thinking };
      }
      case "tool_use":
      case "server_tool_use": {
        return { kind: "tool", text: b.name + " " + JSON.stringify(b.input), of: b.id };
      }
    }
    if (!b.type.endsWith("_tool_result")) {
      return null;
    }
    return { kind: "echo", text: (Anthropic.failed(c) ? FAILED : "") + (Anthropic.result(c) || "(no output)"), of: b.tool_use_id };
  }

  // whether a server tool's result says it failed: an error in its place
  // (web_search_tool_result_error, ...), or a command that exited non-zero
  export function failed(c: any): boolean {
    return String(c?.type).endsWith("_error") || (typeof c?.return_code === "number" && c.return_code !== 0);
  }

  // the text of a server tool's result. Every call gets one, even empty
  // or kept secret (code execution under web search gives its output
  // encrypted), since a call is logged with its result: one without
  // would wait to the turn's end, below the reply
  export function result(c: any): string {
    if (Array.isArray(c)) {
      return c.map((r: any) => r.title + " " + r.url).join("\n");
    }
    if (String(c?.type).startsWith("encrypted")) {
      return ("(output encrypted by the API)\n" + (c.stderr ?? "")).trim();
    }
    if (typeof c?.stdout === "string") {
      return (c.stdout + (c.stderr ?? "")).trim();
    }
    return JSON.stringify(c);
  }

  export const wire: Wire<State> = {
    key     : "anthropic",
    idle    : 300e3,
    url     : "https://api.anthropic.com/v1/messages",
    headers : Anthropic.headers,
    body    : Anthropic.body,
    marks   : (ask) => BREAKS - 1 - (AskAI.tail(ask) ? 1 : 0),
    start   : () => ({ blocks: [], json: [], stop: "", why: null, use: { input: 0, write: 0, read: 0, speed: "slow" }, error: null }),
    read    : Anthropic.read,
    begun   : (ev) => ev.type === "message_start",
    step    : Anthropic.step,
    usage   : (st) => st.use,
  };

}
