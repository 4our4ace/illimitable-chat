// AskAI
// =====
// One way to call a model: a system prompt and a user message in;
// Deltas (live pieces) and an Entry per finished message out. send()
// hands the agent a message at its next chance, stop() aborts, `left`
// holds those never taken. Every vendor is an API run in our loop
// (Agent.ts), but claude-code: the user's Claude Code, run whole in its
// own (ClaudeCode.ts). A patient call (a summary's) asks again, AGAIN after each
// try nothing answered (the vendor down or refusing it, as when the API
// key's credit is gone; our setup failing), each time telling why (its
// `stuck`), till one is answered or we stop it: an outage only delays it, and no summary is made of a failure
// that isn't its input's (Memory.ts). A call's events and end go to its
// sink.
//
// Cache: a marked block ends a prefix the vendor caches; a request keeps
// the last marks its vendor takes (Wire.marks, AskAI.marks). Single flight
// (AskAI.wait), as a request is sent: one whose prefix no call cached
// within TTL leads; one whose prefix a leader is writing waits until the
// leader's response begins (only then can it read the entry).
//
// A turn's last request is kept whole, with its answer (AskAI.last), for
// a call to go on from it (a suggested reply: Suggest.ask) on the same
// prefix, so on the cache.

import { Agent, type Item, type Tool } from "./Agent.ts";
import { stream_lines } from "../tools/Clip.ts";
import { Machine } from "../tools/Machine.ts";
import type { Pick } from "./Pick.ts";

// Types
// =====

// the user's, an agent's report ("[Name]\n...", a user turn to the
// model), a thought (shown, never logged), a reply, a tool call, its
// result, a note of illi's own (a stop, a goal met, a new session, a
// main agent switch, a restart), illi's recap of the chat before it (the
// user's /compact: Chat.compact)
export type Kind = "user" | "work" | "mind" | "illi" | "tool" | "echo" | "note" | "recap";

export type Vendor = "claude-api" | "openai-api" | "chatgpt" | "claude-code";

// what a request used, as its vendor tells it: tokens read (input, cache
// writes and reads), the speed it ran at; Agent.ts keeps the input each
// caller's last request read
export type Usage = { input: number; write: number; read: number; speed: string };

// an image: its mime type, its bytes in base64
export type Img = { type: string; data: string };

// a message for the agent
export type Say = { text: string; imgs: Img[] };

// a text block of a call's message; `mark`: a cache entry ends after it
export type Block = { text: string; mark: boolean };

// searches: the most web searches it runs (0: no web tools); keep: its
// last request is kept whole (AskAI.last: a turn's); once: one step,
// naming its tools but running none, unanswered if it calls one (a
// recap's: Chat.compact, on the turn's cache); from: the request it goes
// on from, its blocks after that one's items and answer, once (a
// suggested reply's: Suggest.ask); max: the most tokens it writes, its
// thinking's too (none: the model's cap); room: the most tokens a step
// may read before the call ends `full` once its tools ran (a turn's:
// Chat.refit goes on from the chat as it then is; none: no end); stuck:
// a patient call's try failed, why, as it waits to ask again; builtins:
// the Claude Code built-in tools it may use on claude-code, as its
// agent's tools list gives them (Custom.profile; none: all)
export type Ask = Pick & {
  system    : string;
  blocks    : Block[];
  imgs?     : Img[];
  searches  : number;
  server    : string;
  patient?  : boolean;
  keep?     : boolean;
  once?     : boolean;
  from?     : Last;
  max?      : number;
  room?     : number;
  stuck?    : (why: string) => void;
  builtins? : string[] | null;
};

// a request kept whole (Ask.keep): what it asked, the items it sent with
// the answer they got (Agent.loop), the tools it named
export type Last = { ask: Ask; items: Item[]; tools: Tool[] };

// a prefix cached: until when; while its leader's response has not
// begun, what its waiters wait on
type Cached = { until: number; ready: Promise<void> | null };

// a request's place in single flight: its response began; it ended
export type Flight = { begun: () => void; end: () => void };

export type Event =
  | { $: "Delta"; kind: Kind; text: string; fresh?: boolean }
  | { $: "Entry"; kind: Kind; text: string; of?: string }; // of: the tool call it is or answers (a call is logged with its result)

// stop: who ended a call that failed (Agent.ts): the model (`fail`: it
// answered, so the failure is its input's doing, a refusal or a stop
// reason; asked again, it fails alike), the request's length (`full`:
// too long for the model's window, or past its room), we (`lost`: a
// stop), the vendor (`down`), or none (our setup threw); again: down, but
// a later try may answer (the vendor busy or out of reach); cut: a reply
// had begun; first: the tokens its first request read, as its vendor told
// (the chat learns from it what a request takes beside the chat: Chat.cap;
// none: that request was refused, or read nothing told)
export type End = {
  ok     : boolean;
  text   : string;
  left   : Say[];
  note?  : string;
  stop?  : "fail" | "lost" | "down" | "full";
  again? : boolean;
  cut?   : boolean;
  first? : number;
};

// one try at a vendor
export type Try = {
  send : (say: Say) => void;
  stop : () => void;
  done : Promise<End>;
};

// where a call's events and end go
export type Sink = { on: (ev: Event) => void; end: (end: End) => void };

// a call: its done is its sink's end
export type Call = Try;

// Constants
// =========

// how long a patient call waits to ask again: short enough that summaries
// go on within a minute of an outage's end, long enough not to flood the
// vendor meanwhile (a chat's JOBS each asking once a minute)
const AGAIN = 60e3;

// how long a vendor keeps a cache entry unused, in ms
export const TTL: Record<Vendor, number> = {
  "claude-api" : 300e3,
  "openai-api" : 1800e3,
  "chatgpt"    : 300e3,
  "claude-code": 300e3,
};

// the prefixes cached, by key (AskAI.keys)
const CACHE = new Map<string, Cached>();

// the last request of each caller that keeps it (Ask.keep: a chat's main
// agent), whole, by its tools URL
const LAST = new Map<string, Last>();

// AskAI
// =====

export namespace AskAI {

  // a call: its tries, one after another (a patient one's)
  export function ask(ask: Ask, on: (ev: Event) => void): Call {
    const halt = new AbortController();
    const send = (say: Say) => call.send(say);
    const stop = () => {
      halt.abort();
      call.stop();
    };
    const [out, feed] = AskAI.tie(on, send, stop);
    let call = AskAI.start(ask, feed.on);
    const run = async (): Promise<End> => {
      let end = await call.done;
      for (;;) {
        const wait = ask.patient === true && !end.ok && end.stop !== "fail" && end.stop !== "full" && end.stop !== "lost";
        if (wait) {
          ask.stuck?.(end.text);
          await Machine.nap(AGAIN, halt.signal);
        }
        if (halt.signal.aborted || !wait) {
          return end;
        }
        call = AskAI.start(ask, feed.on);
        end.left.forEach(send);
        end = await call.done;
      }
    };
    run().then(feed.end, (err) => feed.end(AskAI.end(String(err?.message ?? err))));
    return out;
  }

  // a call fed by its sink (its tries), which passes all to `on` and
  // its done
  export function tie(on: Sink["on"], send: Try["send"], stop: Try["stop"]): [Call, Sink] {
    const { promise, resolve } = Promise.withResolvers<End>();
    return [{ send, stop, done: promise }, { on, end: resolve }];
  }

  // one try; a vendor that throws gives a failed one
  export function start(ask: Ask, on: (ev: Event) => void): Try {
    try {
      return Agent.ask(ask, on);
    } catch (err: any) {
      const end = AskAI.end(err.message);
      const send = (say: Say) => end.left.push(say);
      return { send, stop: () => {}, done: Promise.resolve(end) };
    }
  }

  // a call's end, before it ends: failed, saying `text`
  export function end(text: string): End {
    return { ok: false, text, left: [] };
  }

  // a caller's request, kept whole with its answer (Ask.keep; its tools
  // URL "": none, kept for no one)
  export function keep(last: Last): void {
    if (last.ask.server !== "") {
      LAST.set(last.ask.server, last);
    }
  }

  // the last request a caller kept, with its answer; null: none yet
  export function last(server: string): Last | null {
    return LAST.get(server) ?? null;
  }

  // blocks with only their last `most` marks (a vendor's cache
  // breakpoints are few: each wire says how many it takes, Wire.marks)
  export function marks(blocks: Block[], most: number): Block[] {
    let left = most;
    return blocks.toReversed().map((b) => (b.mark && left-- > 0 ? b : { ...b, mark: false })).reverse();
  }

  // whether a call's end is cached: its last block is marked; one that
  // goes on from another's request (Ask.from), as that one's was
  export function tail(ask: Ask): boolean {
    const own = ask.from?.ask ?? ask;
    return own.blocks[own.blocks.length - 1]?.mark === true;
  }

  // Cache
  // -----

  // the keys of a call's prefix at each block end through its last mark
  // before its end: what it runs on, its system prompt, tools and blocks,
  // each block's hash seeded by the one before (64 bits)
  export function keys(ask: Ask): string[] {
    const last = ask.blocks.slice(0, -1).findLastIndex((b) => b.mark);
    const head = [ask.vendor, ask.model, ask.effort, ask.speed, ask.system, ask.searches > 0];
    let key = Bun.hash(JSON.stringify(head));
    return ask.blocks.slice(0, last + 1).map((b) => String((key = Bun.hash(b.text, key))));
  }

  // single flight: waits while a leader writes the longest cached part of
  // the call's prefix; then leads, unless its whole prefix is cached
  export async function wait(ask: Ask): Promise<Flight> {
    const keys = AskAI.keys(ask);
    const ttl = TTL[ask.vendor];
    for (;;) {
      const now = Date.now();
      const live = (key: string) => CACHE.get(key)?.ready || (CACHE.get(key)?.until ?? 0) > now;
      const k = keys.findLastIndex(live);
      const got = k < 0 ? null : CACHE.get(keys[k])!;
      if (got?.ready) {
        await got.ready;
        continue;
      }
      if (got !== null) {
        got.until = now + ttl;
        CACHE.delete(keys[k]);
        CACHE.set(keys[k], got);
      }
      if (k === keys.length - 1) {
        return { begun: () => {}, end: () => {} };
      }
      return AskAI.lead(keys[keys.length - 1], ttl, now);
    }
  }

  // the call writing `key`; old entries go as a new one comes, the least
  // lately used first, up to the first still live (a process's calls of
  // all its chats share CACHE)
  export function lead(key: string, ttl: number, now: number): Flight {
    for (const [k, c] of CACHE) {
      if (c.ready !== null || c.until >= now) {
        break;
      }
      CACHE.delete(k);
    }
    let free = () => {};
    const own: Cached = { until: 0, ready: new Promise((ok) => (free = ok)) };
    CACHE.set(key, own);
    const begun = () => {
      if (own.ready !== null) {
        own.ready = null;
        own.until = Date.now() + ttl;
        free();
      }
    };
    const end = () => {
      if (own.ready !== null) {
        CACHE.delete(key);
        own.ready = null;
        free();
      }
    };
    return { begun, end };
  }

  // the non-empty lines of a byte stream
  export async function* lines(stream: ReadableStream<Uint8Array>) {
    for await (const lines of stream_lines(stream)) {
      yield* lines.map((line) => line.trim()).filter((line) => line !== "");
    }
  }

  // a tool result's content (a string, or MCP parts) as text
  export function show(content: any): string {
    if (typeof content === "string") {
      return content;
    }
    return (content ?? []).map((part: any) => part.text ?? "[" + part.type + "]").join("\n");
  }

}
