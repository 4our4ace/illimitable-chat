// Window test
// ===========
// `bun test Window.test.ts`. The window as a pure step, event in, effects
// out: the first member's output before it's up prints as it comes and
// its up turns the modes on, keys waiting delivered without mouse
// reports; a switch starts a profile not open (its output till it's up
// reaching no screen) or shows one open, and one that never comes up
// shows the one before again, saying why; the others' states and ends
// reach the shown one; one shown that ends shows the one before, or
// ends the window; a quit or a signal ends every member, WAIT then
// SIGKILL, the modes off once the shown one is gone, its code and every
// line said at the end; Ctrl+Z stops the window and shows the same
// member back; a member of another wire version is let go.

import { expect, test } from "bun:test";
import { MODES_END, RESET, TITLE_AGAIN, WINDOW_ON } from "../ui/Modes.ts";
import { window_new, window_step, type Effect, type Window } from "./Window.ts";
import { wire_cut, wire_frame, type Up } from "./Wire.ts";

const NONCE = "0123456789abcdef0123456789abcdef";

// a member's output: its frames and bytes, in turn
const out = (w: Window, id: number, ...parts: Array<Up | string>) => window_step(w, { $: "out", id, data: parts.map((p) => (typeof p === "string" ? p : wire_frame(p, NONCE))).join("") });

// effects made readable: a send's frames as messages, its bytes as text
const read = (fx: Effect[]) => fx.map((f) => (f.$ === "send" && f.data.startsWith("\x1b_illi:") ? { send: f.id, got: wire_cut("", f.data, NONCE).parts } : f));

const hello = (profile: string): Up => ({ $: "hello", v: 1, pid: 1, profile, root: "/r" });

// a window whose first member (id 1, profile default) is up, and the
// effects of that
const started = () => {
  const w = window_new(NONCE);
  window_step(w, { $: "start" });
  out(w, 1, hello("default"));
  const fx = out(w, 1, { $: "up" });
  return { w, fx };
};

// a window with default (1) hidden and work (2) shown
const two = () => {
  const { w } = started();
  out(w, 1, { $: "hide", to: "work" });
  out(w, 2, hello("work"), { $: "up" });
  return w;
};

test("the first member's output before it's up prints as it comes; its up turns the modes on, keys waiting delivered without mouse reports", () => {
  const w = window_new(NONCE);
  expect(window_step(w, { $: "start" })).toEqual([{ $: "spawn", id: 1, profile: "", how: "shown" }]);
  expect(out(w, 1, "illi: starting\r\n")).toEqual([{ $: "term", data: "illi: starting\r\n" }]);
  expect(window_step(w, { $: "in", data: "hi\x1b[<0;3;4M!" })).toEqual([]);
  expect(read(out(w, 1, hello("default"), { $: "up" }, "\x1b[2Jpaint"))).toEqual([
    { $: "term", data: WINDOW_ON + RESET },
    { $: "send", id: 1, data: "hi!" },
    { send: 1, got: [{ $: "roster", open: [] }] },
    { $: "term", data: "\x1b[2Jpaint" },
  ]);
  expect(window_step(w, { $: "in", data: "x" })).toEqual([{ $: "send", id: 1, data: "x" }]);
  expect(window_step(w, { $: "resize", cols: 100, rows: 30 })).toEqual([{ $: "resize", cols: 100, rows: 30 }]);
});

test("the first member ending before it's up ends the window with its code, no modes to turn off", () => {
  const w = window_new(NONCE);
  window_step(w, { $: "start" });
  out(w, 1, "illi: config: nope\r\n");
  expect(window_step(w, { $: "exit", id: 1, code: 1 })).toEqual([{ $: "exit", code: 1, lines: [] }]);
});

test("a switch to a profile not open starts it, its output reaching no screen till it's up, keys waiting for it; then the title saved comes back", () => {
  const { w } = started();
  expect(out(w, 1, "last paint", { $: "hide", to: "work" }, "stray")).toEqual([{ $: "term", data: "last paint" }, { $: "spawn", id: 2, profile: "work", how: "switch" }]);
  expect(window_step(w, { $: "in", data: "/x\r" })).toEqual([]);
  expect(out(w, 2, hello("work"), "early")).toEqual([]);
  expect(read(out(w, 2, { $: "up" }, "screen"))).toEqual([
    { $: "term", data: RESET + TITLE_AGAIN },
    { $: "send", id: 2, data: "/x\r" },
    { send: 2, got: [{ $: "roster", open: [{ profile: "default", asks: false, working: false, jobs: 0, holds: false }] }] },
    { $: "term", data: "screen" },
  ]);
  expect(w.members.map((m) => [m.profile, m.phase])).toEqual([["default", "hidden"], ["work", "shown"]]);
});

test("a switch to a profile open here shows it again", () => {
  const w = two();
  expect(read(out(w, 2, { $: "hide", to: "default" }))).toEqual([{ send: 1, got: [{ $: "show", switch: true }] }]);
  expect(read(out(w, 1, { $: "up" }))[0]).toEqual({ $: "term", data: RESET + TITLE_AGAIN });
  expect(w.shown).toBe(1);
});

test("a switch that never comes up shows the one before again, saying why", () => {
  const { w } = started();
  out(w, 1, { $: "hide", to: "work" });
  out(w, 2, "illi: config: work/config.json: bad JSON\r\n");
  expect(read(window_step(w, { $: "exit", id: 2, code: 1 }))).toEqual([{ send: 1, got: [{ $: "show", note: "Not switched: illi in profile work didn't start: config: work/config.json: bad JSON." }] }]);
  expect(window_step(w, { $: "in", data: "k" })).toEqual([]);
  expect(out(w, 1, { $: "up" })).toContainEqual({ $: "send", id: 1, data: "k" });
});

test("a hidden profile's state and end reach the one shown; the shown one's own state doesn't", () => {
  const w = two();
  expect(read(out(w, 1, { $: "state", asks: true, working: true, jobs: 2, holds: true }))).toEqual([{ send: 2, got: [{ $: "roster", open: [{ profile: "default", asks: true, working: true, jobs: 2, holds: true }] }] }]);
  expect(out(w, 2, { $: "state", asks: false, working: true, jobs: 0, holds: true })).toEqual([]);
  out(w, 1, { $: "say", text: "illi: crashed: boom (details in /x/illi.log)" });
  expect(read(window_step(w, { $: "exit", id: 1, code: 1 }))).toEqual([{ send: 2, got: [{ $: "roster", open: [], note: "illi in profile default ended: crashed: boom (details in /x/illi.log)." }] }]);
});

test("the shown member ending unasked shows the one shown before it; none left, the window ends with its code and lines", () => {
  const w = two();
  out(w, 2, { $: "say", text: "illi: not started: ~/x isn't trusted." });
  expect(read(window_step(w, { $: "exit", id: 2, code: 1 }))).toEqual([{ send: 1, got: [{ $: "show", note: "illi in profile work ended: not started: ~/x isn't trusted." }] }]);
  out(w, 1, { $: "up" });
  out(w, 1, { $: "say", text: "illi: crashed: boom" });
  expect(window_step(w, { $: "exit", id: 1, code: 1 })).toEqual([{ $: "term", data: MODES_END }, { $: "exit", code: 1, lines: ["illi: crashed: boom"] }]);
});

test("a quit ends every other member, the modes off once the shown one is gone, the end once all are, with its code and every line said", () => {
  const w = two();
  expect(read(out(w, 2, { $: "quit" }))).toEqual([{ send: 1, got: [{ $: "end" }] }, { $: "wait" }]);
  expect(window_step(w, { $: "in", data: "\x04" })).toEqual([{ $: "send", id: 2, data: "\x04" }]);
  out(w, 1, { $: "say", text: "illi: in default" });
  expect(window_step(w, { $: "exit", id: 2, code: 3 })).toEqual([{ $: "term", data: MODES_END }]);
  expect(window_step(w, { $: "exit", id: 1, code: 0 })).toEqual([{ $: "exit", code: 3, lines: ["illi: in default"] }]);
});

test("a signal ends every member; WAIT over, those left are killed", () => {
  const w = two();
  expect(read(window_step(w, { $: "signal" }))).toEqual([{ send: 1, got: [{ $: "end" }] }, { send: 2, got: [{ $: "end" }] }, { $: "wait" }]);
  expect(window_step(w, { $: "signal" })).toEqual([]);
  window_step(w, { $: "exit", id: 2, code: 0 });
  expect(window_step(w, { $: "late" })).toEqual([{ $: "kill", id: 1, signal: "SIGKILL" }]);
  expect(window_step(w, { $: "exit", id: 1, code: 137 })).toEqual([{ $: "exit", code: 0, lines: [] }]);
});

test("Ctrl+Z stops the window, the shown member hidden; back, the modes on and the same member shown, a note if the stop was dropped", () => {
  const { w } = started();
  expect(out(w, 1, { $: "suspend" })).toEqual([{ $: "suspend" }]);
  expect([w.on, w.shown, window_step(w, { $: "in", data: "a" })]).toEqual([false, null, []]);
  expect(read(window_step(w, { $: "resumed", dropped: false }))).toEqual([{ $: "term", data: WINDOW_ON }, { send: 1, got: [{ $: "show" }] }]);
  expect(out(w, 1, { $: "up" })).toContainEqual({ $: "send", id: 1, data: "a" });
  out(w, 1, { $: "suspend" });
  expect(read(window_step(w, { $: "resumed", dropped: true }))[1]).toEqual({ send: 1, got: [{ $: "show", note: "Ctrl+Z can't suspend illi here: no shell is there to bring it back with fg." }] });
});

test("a member of another wire version is let go, and the one before shown again, saying why", () => {
  const { w } = started();
  out(w, 1, { $: "hide", to: "work" });
  expect(out(w, 2, { ...hello("work"), v: 2 } as Up, { $: "up" })).toEqual([{ $: "kill", id: 2, signal: "SIGTERM" }]);
  expect(read(window_step(w, { $: "exit", id: 2, code: 0 }))).toEqual([{ send: 1, got: [{ $: "show", note: "illi was updated meanwhile: quit illi and start it again to switch profiles." }] }]);
});
