// Status
// ======
// The status line: a shell command of the user's (the statusline
// setting) draws a few rows at the screen's foot, between the input and
// the bottom line, from what illi tells it as JSON on its stdin, as
// Claude Code's statusLine does, so a script written for it works with
// little change (docs/customize.md lists the fields; status_input).
//
// It runs (Run.ts) once the chat's state is first told, then as what it
// is told changes: a key of its input, the width and the command, made as
// a state comes, the screen is resized or the setting changes, never as
// the screen paints. Runs are throttled (THROTTLE after the last change,
// MOST at most after the first waiting), and come every refreshInterval
// too, if set. One runs at a time: a change meanwhile runs it again once
// it ends. Only its time limit (LIMIT), its output past CAP, a change of
// the setting or illi's leaving kills one; a result of the setting
// before is dropped. A job it leaves running is killed once its output
// is in, as it runs again and again.
//
// Its output on exit 0 is its rows (ROWS at most), parsed into the
// screen's own runs (status_parse): colors, bold, dim, italic,
// underline, inverse, strike and links kept, any other escape dropped,
// so a script can't move the cursor or retitle the terminal. A non-zero
// exit (or too much output) blanks them; a run past its time keeps them. A failure is said
// once a command (illi.log has each). The rows' height is held at the
// most seen since the setting was set (one from the start), so the chat
// above doesn't jump as they come and go. A pipe has none.

import * as config from "../config/Config.ts";
import { Projects } from "../chat/Projects.ts";
import { Run, type Ran } from "../config/Run.ts";
import { Trusted } from "../config/Trusted.ts";
import { VERSION } from "../config/Update.ts";
import { MARGIN, term_draw } from "./Frame.ts";
import { term_note } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import * as Screen from "../ui/Screen.ts";
import type { Term } from "./Term.ts";
import type * as View from "../ui/View.ts";

// Types
// =====

// the status line's state: the setting it runs (null: none), its
// generation (a change: one more, the results of the one before
// dropped), its input's key as last asked for, its rows, their height
// held; the run in flight (its stop) and whether another is due once it
// ends; the throttle's timer and when the first change waiting came; the
// refresh's timer; whether a failure was said; the chat's id, as told
export type Status = {
  set   : config.Statusline | null;
  gen   : number;
  key   : string;
  rows  : Paint.Line[];
  held  : number;
  run   : AbortController | null;
  due   : boolean;
  wait  : ReturnType<typeof setTimeout> | null;
  since : number;
  every : ReturnType<typeof setInterval> | null;
  said  : boolean;
  id    : string;
};

// Constants
// =========

// the most rows it draws; its time limit, the most of its output read
// (more: killed, as one that never stops printing), the throttle's wait
// after a change and its most after the first waiting (ms)
const ROWS     = 3;
const LIMIT    = 5000;
const CAP      = 16 * 1024;
const THROTTLE = 300;
const MOST     = 1000;

// a link's schemes kept, and its longest URL
const SCHEMES = /^(https?|file|mailto):/i;
const URL_MAX = 2048;

// Status
// ======

export function status_new(): Status {
  return { set: null, gen: 0, key: "", rows: [], held: 0, run: null, due: false, wait: null, since: 0, every: null, said: false, id: "" };
}

// the setting read anew (at the start; after /set): the run in flight
// killed (no failure), its rows dropped, a row held for the new one's,
// the failure said again if it fails, its refresh set, and a run at once
// (once the chat's state is known)
export function status_set(t: Term): void {
  const s = t.status;
  status_stop(t);
  s.set = t.scr.tty ? config.STATUSLINE : null;
  s.id ||= Projects.code(config.PROFILE + "\0" + Projects.place(process.cwd()).key, 16);
  [s.rows, s.held, s.said, s.key] = [[], s.set === null ? 0 : 1, false, ""];
  if (s.set !== null && s.set.refresh > 0) {
    s.every = setInterval(() => status_due(t, false), s.set.refresh * 1000);
    s.every.unref?.();
  }
  status_hear(t, true);
}

// what it is told may have changed (a state came, the screen was
// resized): a run, throttled, if its key did (now: at once, whatever it
// is); none till the chat's state is known
export function status_hear(t: Term, now = false): void {
  const s = t.status;
  if (s.set === null || t.v.pick === null) {
    return;
  }
  const key = status_key(t, s.set);
  if (key !== s.key || now) {
    s.key = key;
    status_due(t, now);
  }
}

// none any more, as illi leaves (its screen let go, then an execve):
// stopped, and nothing it hears runs it again
export function status_end(t: Term): void {
  status_stop(t);
  [t.status.set, t.status.rows, t.status.held] = [null, [], 0];
}

// the run in flight killed, its result dropped, the timers stopped: as
// the setting changes, or illi leaves (status_end)
export function status_stop(t: Term): void {
  const s = t.status;
  s.gen += 1;
  s.run?.abort();
  clearTimeout(s.wait ?? undefined);
  clearInterval(s.every ?? undefined);
  [s.run, s.due, s.wait, s.since, s.every] = [null, false, null, 0, null];
}

// its rows as the foot draws them, w wide, room rows at most: each cut
// to the width after its padding, blank ones to the height held
export function status_rows(t: Term, w: number, room: number): Paint.Line[] {
  const s = t.status;
  const pad = s.set?.padding ?? 0;
  const n = Math.min(s.held, ROWS, Math.max(0, room));
  return Array.from({ length: n }, (_, k) => [Paint.Run(" ".repeat(pad)), ...Paint.line_cut(s.rows[k] ?? [], 0, Math.max(0, w - pad))[1]]);
}

// what the command is told, as Claude Code's statusLine is (its fields
// where illi has them; illi's own beside them): the view's state (its
// pick known), the folder, the chat's id. A field illi doesn't know is
// left out, but the context's shares, null till told, as Claude Code's;
// a plan's limit past its reset is 0% used, as the side shows it
export function status_input(v: View.State, cwd: string, id: string): object {
  const pick = v.pick!;
  const top = Trusted.folder(cwd);
  const fill = v.use.fill ?? null;
  const used = fill === null || fill.window <= 0 ? null : Math.min(100, Math.round((fill.used / fill.window) * 100));
  const limit = (minutes: number) => v.use.plan?.limits.find((l) => l.window === minutes);
  const rate = (l: View.Limit) => ({ used_percentage: l.reset > Date.now() ? l.used : 0, resets_at: Math.round(l.reset / 1000) });
  const [hours, week] = [limit(300), limit(10080)];
  return {
    hook_event_name: "Status",
    session_id: id,
    cwd,
    workspace: { current_dir: cwd, project_dir: top },
    model: { id: pick.model, display_name: pick.model, vendor: pick.vendor },
    effort: { level: pick.effort },
    fast_mode: pick.speed !== "slow",
    version: VERSION,
    context_window: fill === null
      ? { used_percentage: null, remaining_percentage: null }
      : { context_window_size: fill.window, total_input_tokens: fill.used, used_percentage: used, remaining_percentage: used === null ? null : 100 - used, summarize_at: fill.cap },
    ...(v.agent === null ? {} : { agent: { name: v.agent } }),
    permission_mode: v.perm.mode,
    ...(hours === undefined && week === undefined ? {} : { rate_limits: { ...(hours === undefined ? {} : { five_hour: rate(hours) }), ...(week === undefined ? {} : { seven_day: rate(week) }) } }),
    profile: config.PROFILE,
    busy: v.busy,
    agents: v.agents,
  };
}

// a command's output as rows: each line one, SGR (colors of 16, 256 and
// #rrggbb, bold, dim, italic, underline, inverse, strike, their offs,
// colon forms too) and OSC 8 links (http, https, file, mailto) kept, as
// they carry across lines; every other escape (cursor moves, modes,
// titles, the clipboard, device strings, an unfinished one: an OSC to its
// line's end) and control character dropped, their 8-bit forms too.
// Trailing empty lines (escapes alone too) aren't rows
export function status_parse(text: string): Paint.Line[] {
  const lines: Paint.Line[] = [];
  let ink = Paint.INK;
  let line: Paint.Line = [];
  const add = (x: string) => {
    const clean = Paint.text_clean(x);
    const last = line[line.length - 1];
    if (clean === "") {
      return;
    }
    if (last !== undefined && Object.entries(ink).every(([k, x]) => last.s[k as keyof Paint.Ink] === x)) {
      last.x += clean;
    } else {
      line.push(Paint.Run(clean, ink));
    }
  };
  const C1: Record<string, string> = { "\x90": "\x1bP", "\x98": "\x1bX", "\x9b": "\x1b[", "\x9d": "\x1b]", "\x9e": "\x1b^", "\x9f": "\x1b_" };
  const body = text.replace(/\r\n/g, "\n").replace(/[\x90\x98\x9b\x9d\x9e\x9f]/g, (c) => C1[c]);
  // an escape: a CSI (its parameters, its final byte), one cut short; an
  // OSC (its text: ended by BEL, ST, the next escape, the line's end or
  // the end); a device string to its ST; any other; a lone ESC at the
  // end. Or a line's end
  const ESC = /\x1b(?:\[([0-?]*)[ -/]*([@-~])|\[[0-?]*[ -/]*|\]([^\x07\x1b\x9c\n]*)(?:\x07|\x1b\\|\x9c|(?=[\x1b\n])|$)|[P_^X][\s\S]*?(?:\x1b\\|\x07|\x9c|$)|[ -/]*[0-~]|$)|\n/g;
  let at = 0;
  for (const m of body.matchAll(ESC)) {
    add(body.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[0] === "\n") {
      lines.push(line);
      line = [];
    } else if (m[2] === "m" && /^[0-9;:]*$/.test(m[1] ?? "")) {
      ink = status_sgr(ink, m[1]);
    } else if (m[3] !== undefined && /^8;[^;]*;/.test(m[3])) {
      ink = { ...ink, k: status_url(m[3].slice(m[3].indexOf(";", 2) + 1)) };
    }
  }
  add(body.slice(at));
  lines.push(line);
  while (lines.length > 0 && lines[lines.length - 1].every((r) => r.x === "")) {
    lines.pop();
  }
  return lines;
}

// an ink changed by an SGR's parameters (none: a reset); a link stays
function status_sgr(was: Paint.Ink, params: string): Paint.Ink {
  const groups = (params === "" ? "0" : params).split(";");
  let s = { ...was };
  for (let k = 0; k < groups.length; k++) {
    const sub = groups[k].split(":");
    const n = Number(sub[0] || "0");
    const color = (): string => {
      // 38;5;n and 38;2;r;g;b, or as one group: 38:5:n, 38:2:r:g:b (a
      // color space before r, as some write it, passed over)
      const rest = sub.length > 1 ? sub.slice(1) : groups.slice(k + 1);
      const kind = Number(rest[0]);
      const take = kind === 5 ? 2 : kind === 2 ? 4 : 1;
      if (sub.length === 1) {
        k += Math.min(take, rest.length);
      }
      const rgb = kind === 2 ? (rest.length >= 5 && sub.length > 1 ? rest.slice(2, 5) : rest.slice(1, 4)).map(Number) : [];
      return kind === 5 && Number(rest[1]) >= 0 && Number(rest[1]) <= 255 ? String(Number(rest[1]))
        : kind === 2 && rgb.length === 3 && rgb.every((c) => c >= 0 && c <= 255) ? "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("")
        : "";
    };
    if (n === 0) {
      s = { ...Paint.INK, k: s.k };
    } else if (n === 1) {
      s.b = true;
    } else if (n === 2) {
      s.d = true;
    } else if (n === 3) {
      s.i = true;
    } else if (n === 4 || n === 21) {
      s.u = sub[1] !== "0";
    } else if (n === 7) {
      s.v = true;
    } else if (n === 9) {
      s.t = true;
    } else if (n === 22) {
      [s.b, s.d] = [false, false];
    } else if (n === 23) {
      s.i = false;
    } else if (n === 24) {
      s.u = false;
    } else if (n === 27) {
      s.v = false;
    } else if (n === 29) {
      s.t = false;
    } else if (n >= 30 && n <= 37) {
      s.c = String(n - 30);
    } else if (n >= 90 && n <= 97) {
      s.c = String(n - 82);
    } else if (n === 38) {
      s.c = color();
    } else if (n === 39) {
      s.c = "";
    } else if (n >= 40 && n <= 47) {
      s.g = String(n - 40);
    } else if (n >= 100 && n <= 107) {
      s.g = String(n - 92);
    } else if (n === 48) {
      s.g = color();
    } else if (n === 49) {
      s.g = "";
    }
  }
  return s;
}

// a link's URL as kept: one of SCHEMES, URL_MAX long at most, no spaces
// or control characters; else none (its text stays, unlinked)
function status_url(url: string): string {
  return SCHEMES.test(url) && url.length <= URL_MAX && !/[\x00-\x20\x7f-\x9f]/.test(url) ? url : "";
}

// a run asked for: at once, or THROTTLE after the last change (MOST at
// most after the first waiting); one in flight: another once it ends
function status_due(t: Term, now: boolean): void {
  const s = t.status;
  if (s.set === null || t.v.pick === null) {
    return;
  }
  if (s.run !== null) {
    s.due = true;
    return;
  }
  const at = Date.now();
  s.since ||= at;
  clearTimeout(s.wait ?? undefined);
  s.wait = setTimeout(() => {
    [s.wait, s.since] = [null, 0];
    void status_run(t);
  }, now ? 0 : Math.max(0, Math.min(THROTTLE, s.since + MOST - at)));
  s.wait.unref?.();
}

// the command run, told what the screen shows now, its rows taken (a
// result of a setting before dropped); one due meanwhile asked for. One
// that throws is logged, and the next run goes on
async function status_run(t: Term): Promise<void> {
  const s = t.status;
  const set = s.set;
  if (set === null || t.v.pick === null) {
    return;
  }
  const [gen, stop, cwd] = [s.gen, new AbortController(), process.cwd()];
  s.run = stop;
  let ran: Ran | null = null;
  try {
    const top = Trusted.folder(cwd);
    const cols = status_width() - set.padding;
    ran = await Run.run(set.command, { cwd, env: { COLUMNS: String(Math.max(1, cols)), LINES: String(Screen.screen_size().h), ILLI_PROJECT_DIR: top, CLAUDE_PROJECT_DIR: top }, input: JSON.stringify(status_input(t.v, cwd, s.id)) + "\n", timeout: LIMIT, signal: stop.signal, cap: CAP, full: true, reap: true });
  } catch (err: any) {
    console.error("illi: status line: " + String(err?.stack ?? err));
  }
  if (gen !== s.gen) {
    return;
  }
  s.run = null;
  if (ran !== null) {
    status_took(t, set, ran);
  }
  if (s.due) {
    s.due = false;
    status_due(t, false);
  }
  term_draw(t);
}

// a run's result: its rows on exit 0 (the height held grows to them);
// past its time, the rows kept; else none. A failure logged, and said
// once a command
function status_took(t: Term, set: config.Statusline, ran: Ran): void {
  const s = t.status;
  if (ran.code === 0) {
    s.rows = status_parse(ran.out).slice(0, ROWS);
    s.held = Math.max(s.held, s.rows.length);
    return;
  }
  const first = ran.err.trim().split("\n")[0];
  const why = ran.code === null ? ran.why : ran.code === 126 || ran.code === 127 ? "couldn't run (exit " + ran.code + (first === "" ? "" : ": " + first) + ")" : "exited " + ran.code + (first === "" ? "" : ": " + first);
  if (!ran.why.startsWith("ran past")) {
    s.rows = [];
  }
  console.error("illi: status line " + set.command + ": " + why);
  if (!s.said) {
    s.said = true;
    term_note(t, "Your status line command " + (set.command.length > 60 ? set.command.slice(0, 59) + "…" : set.command) + " " + why + " (illi.log has more).");
  }
}

// the width its rows may take: the foot's
function status_width(): number {
  return Screen.screen_size().w - 1 - 2 * MARGIN;
}

// what a run is given, as a key: its input, the width and the command
function status_key(t: Term, set: config.Statusline): string {
  return JSON.stringify(status_input(t.v, process.cwd(), t.status.id)) + "\0" + status_width() + "\0" + set.command + "\0" + set.padding;
}
