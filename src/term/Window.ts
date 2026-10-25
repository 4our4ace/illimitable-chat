// Window
// ======
// What `illi` is on a terminal (main.ts): a small process that owns the
// terminal, under which each profile's illi (a member: Term.ts, its end
// of the wire Member.ts) runs on a PTY of its own. The window sets the
// terminal raw for its whole life and is its one reader and writer: the
// shown member's output is copied to the terminal, the terminal's input
// to the shown member, the modes written on once (as the first member is
// up) and off once (as the window ends). A profile switched away from
// stays open, hidden: its turn, subagents, jobs and MCP servers run on;
// its output (only frames, while hidden) reaches no screen. Switching
// back shows that same process again, as it was left.
//
// The members talk over their PTYs (Wire.ts). A member says it is up
// (from then on its output is the screen), its state as it changes, that
// it hid to show another profile, that the person quit, lines to print at
// the end, Ctrl+Z; the window tells a member to paint again (`show`), the
// one shown which others are open and how they are (`roster`, a note on
// one that ended), and every member to quit (`end`). Keys typed while no
// member is up to take them wait (mouse reports are dropped: a click
// must not land on a screen that wasn't there) and go to the next one up.
//
// A member is a session leader with its PTY as its controlling terminal:
// a resize of the PTY sends it SIGWINCH, and the PTY's close, or the
// window's death however it comes, sends it SIGHUP, so no member outlives
// the window. A member's exit counts once its process ended and its PTY
// did (all its output read), or EOF_WAIT after its process. A member
// that ends unasked: hidden, a note to the one shown; shown, the one
// shown before it comes back, with a note; none left, the window ends
// with its exit code and its lines. A quit (the shown member's `quit`)
// or a hangup, SIGTERM or SIGINT of the window tells every member to
// quit as a quit does, waits for them (WAIT at most, then SIGKILL), puts
// the terminal back, prints the lines said and exits with the shown
// member's code. Ctrl+Z (the shown member's `suspend`) hides it, puts
// the terminal back and stops the window alone: every profile's work
// goes on, and `fg` shows that member again. Where the kernel drops the
// stop (an orphaned process group: no shell with job control to come
// back to, as under `tmux new-window illi`), the screen comes back at
// once, with a note.
//
// window_step is the window as a pure step, an event in, effects out
// (tested without a terminal); window_run runs it. The window imports
// nothing that reads a setting (Config.ts takes the API keys out of the
// environment its members need).

import * as fs from "node:fs";
import * as os from "node:os";
import { MODES_END, RESET, TITLE_AGAIN, WINDOW_ON } from "../ui/Modes.ts";
import { VERSION, wire_cut, wire_env, wire_frame, wire_nonce, type Down, type How, type Open, type State, type Up } from "./Wire.ts";

// Types
// =====

// a member: its id (the window's count), the profile it runs (asked as
// it was spawned, then as its hello says; "": not known yet), whether
// starting (spawned or asked to show, not up yet), shown (up, on the
// screen) or hidden; its state; the lines it said; the last TAIL bytes
// of its output that reached no screen (for a note on why it ended);
// what its last chunk left of a frame; when it was last shown (a count);
// refused: of another wire version, let go
export type Member = { id: number; profile: string; phase: "starting" | "shown" | "hidden"; state: State; said: string[]; tail: string; carry: string; last: number; refused: boolean };

// the window: its nonce; its members; the one whose output is the screen
// (the first already, before it's up; null while a switch is under way);
// the one asked to show (a switch's, a resume's: null when none), the one
// shown before a switch (shown again if the switch fails); the last one
// up; whether the terminal's modes are on; input waiting for a member up;
// notes for the shown one's next roster; whether it ends, and with what
// code, the lines to print then; whether Ctrl+Z stopped it; illi's root
// (the first hello's); the ids given, the times a member was shown
export type Window = {
  nonce    : string;
  members  : Member[];
  shown    : number | null;
  pending  : number | null;
  came     : number | null;
  last     : number | null;
  on       : boolean;
  queue    : string;
  notes    : string[];
  ending   : boolean;
  code     : number;
  lines    : string[];
  suspended: boolean;
  root     : string;
  ids      : number;
  shows    : number;
};

// what happens to the window: it starts; a member's output; the
// terminal's input; a member's end; a signal; the terminal's new size;
// back from Ctrl+Z (dropped: never stopped); WAIT over while ending.
// Bytes are latin1 text (each char a byte)
export type Event =
  | { $: "start" }
  | { $: "out"; id: number; data: string }
  | { $: "in"; data: string }
  | { $: "exit"; id: number; code: number; why?: string }
  | { $: "signal" }
  | { $: "resize"; cols: number; rows: number }
  | { $: "resumed"; dropped: boolean }
  | { $: "late" };

// what the window does: spawns a member (in profile, "": the one illi
// picks), writes to the terminal, to a member's PTY, resizes every PTY,
// stops itself (Ctrl+Z: the terminal put back first), signals a member,
// waits WAIT, ends (the terminal put back, the lines printed)
export type Effect =
  | { $: "spawn"; id: number; profile: string; how: How }
  | { $: "term"; data: string }
  | { $: "send"; id: number; data: string }
  | { $: "resize"; cols: number; rows: number }
  | { $: "suspend" }
  | { $: "kill"; id: number; signal: "SIGINT" | "SIGTERM" | "SIGKILL" }
  | { $: "wait" }
  | { $: "exit"; code: number; lines: string[] };

// Constants
// =========

// the bytes of a member's unshown output kept, for a note on its end
const TAIL = 4096;

// input kept while no member is up (bytes): more is dropped
const QUEUE = 1 << 20;

// how long a quit waits for every member before SIGKILL (ms): their quit
// hooks take 1.5 s at most (Plugins.ts); how long after its process a
// member's PTY may still be read (ms); how soon after Ctrl+Z the window,
// not stopped, takes the stop as dropped (ms)
const WAIT        = 5000;
const EOF_WAIT    = 200;
const SUSPEND_LOOK = 100;

// a mouse report (SGR), dropped from input that waits
const MOUSE = /\x1b\[<\d+;\d+;\d+[Mm]/g;

// a sequence, stripped from a member's output for a note: CSI, OSC, APC
// (to BEL or ST), or a lone escape
const ESCAPES = /\x1b(?:\[[0-?]*[ -\/]*[@-~]|[\]_P^][^\x07\x1b]*(?:\x07|\x1b\\)?|.)?/g;

// a member at rest
const IDLE: State = { asks: false, working: false, jobs: 0, holds: false };

// said where Ctrl+Z can't stop the window
const DROPPED = "Ctrl+Z can't suspend illi here: no shell is there to bring it back with fg.";

// said where a profile's illi is of another version (updated meanwhile)
const UPDATED = "illi was updated meanwhile: quit illi and start it again to switch profiles.";

// Window
// ======

// a window of this nonce, before its first member
export function window_new(nonce: string): Window {
  return { nonce, members: [], shown: null, pending: null, came: null, last: null, on: false, queue: "", notes: [], ending: false, code: 0, lines: [], suspended: false, root: "", ids: 0, shows: 0 };
}

// an event: the window changed, the effects it takes, in order
export function window_step(w: Window, e: Event): Effect[] {
  const fx: Effect[] = [];
  const m = "id" in e ? w.members.find((x) => x.id === e.id) : undefined;
  switch (e.$) {
    case "start":
      w.shown = window_spawn(w, fx, "", "shown").id;
      break;
    case "out":
      if (m !== undefined) {
        window_out(w, fx, m, e.data);
      }
      break;
    case "in":
      window_in(w, fx, e.data);
      break;
    case "exit":
      if (m !== undefined) {
        window_gone(w, fx, m, e.code, e.why);
      }
      break;
    case "signal":
      window_end(w, fx, null);
      break;
    case "resize":
      fx.push({ $: "resize", cols: e.cols, rows: e.rows });
      break;
    case "resumed":
      window_resumed(w, fx, e.dropped);
      break;
    case "late":
      w.members.forEach((x) => fx.push({ $: "kill", id: x.id, signal: "SIGKILL" }));
      break;
  }
  return fx;
}

// a member spawned in profile ("": illi's pick), starting
function window_spawn(w: Window, fx: Effect[], profile: string, how: How): Member {
  const m: Member = { id: ++w.ids, profile, phase: "starting", state: IDLE, said: [], tail: "", carry: "", last: 0, refused: false };
  w.members.push(m);
  fx.push({ $: "spawn", id: m.id, profile, how });
  return m;
}

// a message to a member
function window_send(w: Window, fx: Effect[], m: Member, msg: Down): void {
  fx.push({ $: "send", id: m.id, data: wire_frame(msg, w.nonce) });
}

// a member's output: its frames heard, its bytes to the screen if it's
// the screen's, else kept as its tail
function window_out(w: Window, fx: Effect[], m: Member, data: string): void {
  const { parts, carry } = wire_cut(m.carry, data, w.nonce);
  m.carry = carry;
  for (const part of parts) {
    if (typeof part === "string") {
      window_bytes(w, fx, m, part);
    } else {
      window_heard(w, fx, m, part as Up);
    }
  }
}

// a member's bytes: to the terminal if its output is the screen, else
// kept as its tail
function window_bytes(w: Window, fx: Effect[], m: Member, data: string): void {
  if (data === "") {
    return;
  }
  if (w.shown === m.id) {
    fx.push({ $: "term", data });
  } else {
    m.tail = (m.tail + data).slice(-TAIL);
  }
}

// a member's message
function window_heard(w: Window, fx: Effect[], m: Member, msg: Up): void {
  switch (msg.$) {
    case "hello":
      m.profile = typeof msg.profile === "string" ? msg.profile : m.profile;
      w.root ||= typeof msg.root === "string" ? msg.root : "";
      if (msg.v !== VERSION && !m.refused) {
        m.refused = true;
        fx.push({ $: "kill", id: m.id, signal: "SIGTERM" });
      }
      break;
    case "up":
      window_up(w, fx, m);
      break;
    case "state":
      m.state = { asks: msg.asks === true, working: msg.working === true, jobs: Number(msg.jobs) || 0, holds: msg.holds === true };
      if (w.shown !== m.id) {
        window_roster(w, fx);
      }
      break;
    case "hide":
      window_hide(w, fx, m, String(msg.to));
      break;
    case "quit":
      if (w.shown === m.id) {
        window_end(w, fx, m);
      }
      break;
    case "say":
      m.said.push(String(msg.text));
      break;
    case "suspend":
      if (w.shown === m.id && !w.ending) {
        [m.phase, w.shown, w.pending, w.came, w.on, w.suspended] = ["hidden", null, m.id, null, false, true];
        fx.push({ $: "suspend" });
      }
      break;
  }
}

// a member up: the screen's, if it was asked to show (or is the screen's
// already: the first, or the one shown run again). The terminal's modes
// on, the first time; what another may have left put right, and the
// title saved put back (each member writes its own, or none); the input
// waiting delivered, the others' states told
function window_up(w: Window, fx: Effect[], m: Member): void {
  if (m.refused || (w.pending !== m.id && w.shown !== m.id)) {
    return;
  }
  const other = w.last !== null && w.last !== m.id;
  fx.push({ $: "term", data: (w.on ? "" : WINDOW_ON) + RESET + (other ? TITLE_AGAIN : "") });
  [w.on, w.shown, w.pending, w.came, w.last, m.phase, m.last] = [true, m.id, null, null, m.id, "shown", ++w.shows];
  const keys = w.queue.replace(MOUSE, "");
  w.queue = "";
  if (keys !== "") {
    fx.push({ $: "send", id: m.id, data: keys });
  }
  window_roster(w, fx);
}

// the shown member hid, to show profile `to`: open here, it's asked to
// show; else it starts. Keys wait meanwhile
function window_hide(w: Window, fx: Effect[], m: Member, to: string): void {
  if (w.shown !== m.id || w.ending) {
    return;
  }
  [m.phase, w.shown, w.came] = ["hidden", null, m.id];
  const open = w.members.find((x) => x.profile === to && x.phase === "hidden" && !x.refused);
  if (open !== undefined) {
    w.pending = open.id;
    window_send(w, fx, open, { $: "show", switch: open !== m });
  } else {
    w.pending = window_spawn(w, fx, to, "switch").id;
  }
}

// the terminal's input: to the member up on the screen, else kept for
// the next one up. Ctrl+C before the first is up interrupts its start,
// as on a terminal of its own
function window_in(w: Window, fx: Effect[], data: string): void {
  const m = w.members.find((x) => x.id === w.shown);
  if (m?.phase === "shown") {
    fx.push({ $: "send", id: m.id, data });
  } else if (m !== undefined && !w.on && data.includes("\x03")) {
    fx.push({ $: "kill", id: m.id, signal: "SIGINT" });
  } else if (w.queue.length + data.length <= QUEUE) {
    w.queue += data;
  }
}

// the other open profiles and their states, to the one shown (once it's
// up), with the notes waiting
function window_roster(w: Window, fx: Effect[]): void {
  const m = w.members.find((x) => x.id === w.shown && x.phase === "shown");
  if (m === undefined) {
    return;
  }
  const open: Open[] = w.members.filter((x) => x !== m && x.phase === "hidden" && !x.refused).map((x) => ({ profile: x.profile, ...x.state }));
  const note = w.notes.join(" ");
  w.notes = [];
  window_send(w, fx, m, note === "" ? { $: "roster", open } : { $: "roster", open, note });
}

// the window ends: every member but the one that quit (by), told to
// quit; WAIT for them. None left: the end
function window_end(w: Window, fx: Effect[], by: Member | null): void {
  if (w.ending) {
    return;
  }
  w.ending = true;
  w.members.filter((x) => x !== by).forEach((x) => window_send(w, fx, x, { $: "end" }));
  if (w.members.length === 0) {
    return window_finish(w, fx);
  }
  fx.push({ $: "wait" });
}

// the end: the terminal's modes off (if on), then the lines said
function window_finish(w: Window, fx: Effect[]): void {
  if (w.on) {
    fx.push({ $: "term", data: MODES_END });
    w.on = false;
  }
  fx.push({ $: "exit", code: w.code, lines: w.lines });
}

// a member's process ended (code; why: it couldn't start). Ending, its
// lines kept for the end, the modes off once the shown one is gone, the
// end once all are. Else: one asked to show (a switch's) that never came
// up, the one shown before comes back, saying why; the one shown, the one
// shown before it comes back, saying so (kept as the profile used last,
// as a switch to it would be); one hidden, a note to the one shown. None
// left to show: the end, with its code and lines
function window_gone(w: Window, fx: Effect[], m: Member, code: number, why?: string): void {
  window_bytes(w, fx, m, m.carry);
  w.members = w.members.filter((x) => x !== m);
  if (why !== undefined) {
    m.said.push("illi: " + why);
  }
  if (w.ending) {
    w.lines.push(...m.said);
    if (w.shown === m.id && w.on) {
      fx.push({ $: "term", data: MODES_END });
      w.on = false;
    }
    if (w.shown === m.id) {
      [w.shown, w.code] = [null, code];
    }
    if (w.members.length === 0) {
      window_finish(w, fx);
    }
    return;
  }
  const line  = m.refused ? UPDATED : window_line(m, code);
  const named = "illi in profile " + (m.profile || "?");
  if (w.pending === m.id || w.shown === m.id) {
    const switched = w.pending === m.id && w.came !== null && m.phase === "starting";
    const back = w.members.find((x) => x.id === w.came) ?? w.members.filter((x) => !x.refused).sort((a, b) => b.last - a.last)[0];
    [w.pending, w.came] = [null, null];
    w.shown = w.shown === m.id ? null : w.shown;
    if (back === undefined) {
      [w.code, w.lines] = [code, [...w.lines, ...m.said]];
      return window_finish(w, fx);
    }
    w.pending = back.id;
    const note = m.refused ? UPDATED : switched ? "Not switched: " + named + " didn't start" + (line === "" ? "." : ": " + line) : named + " ended" + (line === "" ? "." : ": " + line);
    return window_send(w, fx, back, switched || m.refused ? { $: "show", note } : { $: "show", switch: true, note });
  }
  w.notes.push(named + " ended" + (line === "" ? "." : ": " + line));
  window_roster(w, fx);
}

// why a member ended, in a line: the last it said, else the last line of
// its output that reached no screen (its sequences stripped), else its
// exit code if not 0; "illi: " and the end's stop dropped; "": nothing
function window_line(m: Member, code: number): string {
  const text = m.said.length > 0 ? m.said[m.said.length - 1] : Buffer.from(m.tail, "latin1").toString("utf8").replace(ESCAPES, "");
  const last = text.split(/\r?\n|\r/).map((l) => l.trim()).filter((l) => l !== "").pop() ?? "";
  const said = last.replace(/^illi: /, "").replace(/\.$/, "").slice(0, 200);
  return said !== "" ? said + "." : code !== 0 ? "exit code " + code + "." : "";
}

// back from Ctrl+Z (dropped: never stopped): the modes on again, the
// member that was shown asked to show
function window_resumed(w: Window, fx: Effect[], dropped: boolean): void {
  if (!w.suspended || w.ending) {
    return;
  }
  w.suspended = false;
  fx.push({ $: "term", data: WINDOW_ON });
  w.on = true;
  const m = w.members.find((x) => x.id === w.pending);
  if (m !== undefined) {
    window_send(w, fx, m, dropped ? { $: "show", note: DROPPED } : { $: "show" });
  }
}

// Run
// ===

// illi as it runs itself again: the binary, or bun with the script
export function window_self(): string[] {
  const self = /\$bunfs|~BUN/.test(import.meta.path) ? [] : [...process.execArgv, process.argv[1]];
  return [process.execPath, ...self, ...process.argv.slice(2)];
}

// the window, on this terminal, its members run as `self` (in this
// folder, with this environment, ILLI_WINDOW added, ILLI_PROFILE for a
// profile asked, and ILLI_DIR as illi's root where it was set); never
// returns: the window exits with its end
export function window_run(self = window_self()): void {
  const w     = window_new(wire_nonce());
  const procs = new Map<number, Bun.Subprocess>();
  const left  = new Map<number, { proc?: number; pty?: boolean; timer?: Timer }>();
  let stopped = false;
  const size  = () => ({ cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 });
  const write = (data: string) => process.stdout.write(Buffer.from(data, "latin1"));
  const step  = (e: Event): void => window_step(w, e).forEach(act);
  // a member's end, once its process and its PTY both ended (or
  // EOF_WAIT after its process)
  const ended = (id: number, part: { proc?: number; pty?: boolean }) => {
    if (!procs.has(id)) {
      return;
    }
    const seen = { ...left.get(id), ...part };
    left.set(id, seen);
    if (seen.proc !== undefined && seen.pty === true) {
      clearTimeout(seen.timer);
      left.delete(id);
      procs.get(id)?.terminal?.close();
      procs.delete(id);
      step({ $: "exit", id, code: seen.proc });
    } else if (seen.proc !== undefined && seen.timer === undefined) {
      seen.timer = setTimeout(() => ended(id, { pty: true }), EOF_WAIT);
    }
  };
  // a member started on a PTY of the terminal's size, its output and
  // end heard; one that can't start, an end saying why
  const spawn = (id: number, profile: string, how: How) => {
    const env = { ...process.env, ILLI_WINDOW: wire_env(w.nonce, how), ...(profile === "" ? {} : { ILLI_PROFILE: profile }), ...(process.env.ILLI_DIR !== undefined && w.root !== "" ? { ILLI_DIR: w.root } : {}) };
    try {
      const proc = Bun.spawn(self, {
        cwd     : process.cwd(),
        env,
        terminal: { ...size(), data: (_t, data) => step({ $: "out", id, data: Buffer.from(data).toString("latin1") }), exit: () => ended(id, { pty: true }) },
      });
      procs.set(id, proc);
      // a signal with no name (a real-time one) comes as its number
      const signal = (s: NodeJS.Signals | number) => (typeof s === "number" ? s : os.constants.signals[s] ?? 0);
      void proc.exited.then((code) => ended(id, { proc: proc.signalCode === null ? code : 128 + signal(proc.signalCode) }));
    } catch (err: any) {
      queueMicrotask(() => step({ $: "exit", id, code: 1, why: "can't start illi in profile " + (profile || "default") + ": " + err.message }));
    }
  };
  // Ctrl+Z: the terminal as found, then the window stopped; back (fg),
  // or found running SUSPEND_LOOK on (the stop dropped), raw again
  const suspend = () => {
    process.stdout.write(MODES_END, () => {
      process.stdin.setRawMode(false);
      stopped = true;
      process.kill(0, "SIGTSTP");
      setTimeout(() => resume(true), SUSPEND_LOOK);
    });
  };
  const resume = (dropped: boolean) => {
    if (stopped) {
      stopped = false;
      process.stdin.setRawMode(true);
      step({ $: "resumed", dropped });
    }
  };
  // the end: every PTY closed, the terminal cooked once all written, the
  // lines said, the exit (EOF_WAIT at most for the terminal)
  const finish = (code: number, lines: string[]) => {
    procs.forEach((p) => p.terminal?.close());
    const said = lines.map((l) => l + "\n").join("");
    process.stdout.write("", () => {
      try {
        process.stdin.setRawMode(false);
        fs.writeSync(2, said);
      } catch {}
      process.exit(code);
    });
    setTimeout(() => process.exit(code), EOF_WAIT).unref();
  };
  // an effect of window_step, done
  const act = (f: Effect): void => {
    switch (f.$) {
      case "spawn":   return spawn(f.id, f.profile, f.how);
      case "term":    return void (f.data !== "" && write(f.data));
      case "send":    return void procs.get(f.id)?.terminal?.write(Buffer.from(f.data, "latin1"));
      case "resize":  return procs.forEach((p) => p.terminal?.resize(f.cols, f.rows));
      case "suspend": return suspend();
      case "kill":    return void procs.get(f.id)?.kill(f.signal);
      case "wait":    return void setTimeout(() => step({ $: "late" }), WAIT);
      case "exit":    return finish(f.code, f.lines);
    }
  };
  process.stdout.on("error", () => {});
  process.on("exit", () => {
    if (w.on) {
      try {
        fs.writeSync(1, MODES_END);
        process.stdin.setRawMode(false);
      } catch {}
    }
  });
  process.on("uncaughtException", (err) => {
    try {
      fs.writeSync(1, w.on ? MODES_END : "");
      w.on = false;
      process.stdin.setRawMode(false);
      fs.writeSync(2, "illi: crashed: " + err.message + "\n");
    } catch {}
    process.exit(1);
  });
  for (const sig of ["SIGHUP", "SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => step({ $: "signal" }));
  }
  process.on("SIGCONT", () => resume(false));
  process.stdout.on("resize", () => step({ $: "resize", ...size() }));
  process.stdin.setRawMode(true);
  window_read((data) => step({ $: "in", data }), () => step({ $: "signal" }));
  step({ $: "start" });
}

// the terminal's input, read raw as it comes (latin1: a byte each); a
// read cut by a signal, or with nothing ready, tried again; the terminal
// gone (a read error, its end): lost
function window_read(heard: (data: string) => void, lost: () => void): void {
  const buf  = Buffer.alloc(65536);
  const next = (): void => fs.read(0, buf, 0, buf.length, null, (err, n) => {
    if (err?.code === "EINTR" || err?.code === "EAGAIN") {
      setTimeout(next, err.code === "EAGAIN" ? 10 : 0);
    } else if (err === null && n > 0) {
      heard(buf.toString("latin1", 0, n));
      next();
    } else {
      lost();
    }
  });
  next();
}
