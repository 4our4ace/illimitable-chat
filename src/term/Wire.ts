// Wire
// ====
// What the window (Window.ts) and each profile's illi under it
// (Member.ts) say to each other: frames in band, over the member's own
// PTY, as APC sequences, ESC _ illi:<nonce>:<json> ESC \. In band keeps
// order exact: a member's `hide` comes after its last painted byte, its
// last words before its exit. The member's frames go in its output, which
// the window cuts them out of (wire_cut); the window's go in the member's
// input, which its screen reads them out of before keys (wire_take). The
// nonce is new for each window and given only in ILLI_WINDOW, which the
// member takes out of its environment as it loads; paint text is cleaned
// of control characters, so neither a chat's text nor a paste can make a
// frame. It isn't secret from the user's own processes (/proc), which are
// trusted anyway: no frame does anything destructive. A frame is ASCII
// (its JSON's other characters escaped), so it reads alike as bytes and
// as text, and holds no newline a PTY could change. One with another
// nonce passes as bytes, and so does one with no end past CAP. ILLI_WINDOW
// (`<version>:<nonce>:<how>`) and `hello` keep their shape in every
// version: an illi updated on disk meanwhile still says which it is, and
// the window, if the versions differ, lets it go.

import * as crypto from "node:crypto";

// Types
// =====

// how a member starts: shown, painting at once (the window's first, or
// the one shown run again in place); switch, as shown, started by a
// switch (kept as the profile used last); hidden, painting once shown
// (one hidden run again in place)
export type How = "shown" | "switch" | "hidden";

// what ILLI_WINDOW says: the window's wire version, its nonce, how this
// member starts
export type Env = { v: number; nonce: string; how: How };

// a profile's state, as the others show it: a question waits on the
// person, a turn or subagents at work, its background jobs, whether it
// holds its chat (else a view of another terminal's)
export type State = { asks: boolean; working: boolean; jobs: number; holds: boolean };

// a profile open in the window, as the one shown hears of it
export type Open = State & { profile: string };

// a member to the window: who it is (as it loads: its wire version, pid,
// profile, illi's root); its screen up, from here on its output is the
// screen (as it starts, and as shown again); its state, as it changes;
// it stopped painting, to show profile `to`; the person quit; a line to
// print once illi has left the screen; Ctrl+Z
export type Up =
  | { $: "hello"; v: number; pid: number; profile: string; root: string }
  | { $: "up" }
  | ({ $: "state" } & State)
  | { $: "hide"; to: string }
  | { $: "quit" }
  | { $: "say"; text: string }
  | { $: "suspend" };

// the window to a member: paint again, whole (switch: shown by a
// switch, kept as the profile used last; a note to show); the other
// profiles open (to the one shown) and a note on them; quit, as a quit
// does
export type Down =
  | { $: "show"; switch?: boolean; note?: string }
  | { $: "roster"; open: Open[]; note?: string }
  | { $: "end" };

// Constants
// =========

// the wire's version: a member of another isn't spoken to
export const VERSION = 1;

// a frame's start and end
const APC = "\x1b_";
const ST  = "\x1b\\";

// a frame with no end past this many bytes is given up, as bytes
export const CAP = 65536;

const HOW = /^(\d+):([0-9a-f]{32}):(shown|switch|hidden)$/;

// Wire
// ====

// a new window's nonce: 128 random bits
export function wire_nonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

// ILLI_WINDOW for a member
export function wire_env(nonce: string, how: How): string {
  return VERSION + ":" + nonce + ":" + how;
}

// ILLI_WINDOW read (null: none, or not of this shape)
export function wire_env_parse(text: string | undefined): Env | null {
  const m = HOW.exec(text ?? "");
  return m === null ? null : { v: Number(m[1]), nonce: m[2], how: m[3] as How };
}

// a message as a frame: ASCII, every other character escaped
export function wire_frame(msg: Up | Down, nonce: string): string {
  const json = JSON.stringify(msg).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  return APC + "illi:" + nonce + ":" + json + ST;
}

// a frame of this nonce at data's start: its message (null: its JSON
// unreadable, the frame dropped) and length; 0: one cut short by data's
// end (the rest awaited); null: none
export function wire_take(data: string, nonce: string): { msg: object | null; n: number } | 0 | null {
  const head = APC + "illi:" + nonce + ":";
  if (data.length < head.length) {
    return head.startsWith(data) ? 0 : null;
  }
  if (!data.startsWith(head)) {
    return null;
  }
  const end = data.indexOf(ST, head.length);
  if (end < 0) {
    return 0;
  }
  let msg: unknown = null;
  try {
    msg = JSON.parse(data.slice(head.length, end));
  } catch {}
  return { msg: msg !== null && typeof msg === "object" ? (msg as object) : null, n: end + ST.length };
}

// the frames of this nonce cut out of a stream (carry: what the last
// chunk left, then this chunk), in order with the bytes between them
// (a part that is a string: bytes; else a message; a frame unreadable
// is dropped); what this chunk leaves (a frame cut by its end, or the
// start of one: kept for the next). A frame cut short past CAP passes
// as bytes
export function wire_cut(carry: string, chunk: string, nonce: string): { parts: Array<string | object>; carry: string } {
  const data  = carry + chunk;
  const parts: Array<string | object> = [];
  const bytes = (to: number, from: number) => {
    if (to > from) {
      const last = parts.length - 1;
      if (typeof parts[last] === "string") {
        parts[last] += data.slice(from, to);
      } else {
        parts.push(data.slice(from, to));
      }
    }
  };
  let from = 0;
  let look = 0;
  for (;;) {
    const at = data.indexOf(APC, look);
    if (at < 0) {
      const keep = data.endsWith("\x1b") ? 1 : 0;
      bytes(data.length - keep, from);
      return { parts, carry: data.slice(data.length - keep) };
    }
    const took = wire_take(data.slice(at), nonce);
    if (took === 0 && data.length - at <= CAP) {
      bytes(at, from);
      return { parts, carry: data.slice(at) };
    }
    if (took === null || took === 0) {
      look = at + APC.length;
      continue;
    }
    bytes(at, from);
    if (took.msg !== null) {
      parts.push(took.msg);
    }
    from = look = at + took.n;
  }
}
