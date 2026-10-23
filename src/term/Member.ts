// Member
// ======
// illi as one profile of a window (Window.ts: on a terminal, the process
// that owns it, every profile's illi under it on a PTY of its own). The
// window names its wire (Wire.ts) and how this one starts in ILLI_WINDOW,
// taken out of the environment as this loads, so no tool, hook or MCP
// server inherits it (put back for a restart in place: member_env).
//
// This one says who it is as it starts (hello), and its state (a question
// waits, at work, its background jobs, whether it holds its chat) each
// time it changes. Hidden (member_hide: a switch; member_suspend: Ctrl+Z,
// the window stopping), it paints nothing (Screen.ts, and no paint is
// even laid out: Frame.ts term_draw), runs no status line command and
// lets a device login waiting go; all else runs on: its turn, subagents,
// jobs, MCP servers, hooks and plugins, a question waiting for the person.
// Shown again (`show`), it paints whole; shown by a switch, it is kept as
// the profile used last (anywhere, and in this project). Shown, it hears
// of the others open (`roster`): what the side panel and a quit's warning
// say of them, and a note as one asks something or is done. The person's
// quit goes to the window first (`quit`), which ends the others; `end`
// quits this one as a quit does, once (a quit under way goes on; a second
// Ctrl+D still quits at once). Lines said after leaving the screen go to
// the window (member_say), which prints them as it ends. The PTY lost is
// the window gone: a hangup.

import * as config from "../config/Config.ts";
import { term_note } from "./Notices.ts";
import * as Profiles from "../config/Profiles.ts";
import * as Screen from "../ui/Screen.ts";
import { status_end, status_set } from "./Status.ts";
import { term_draw } from "./Frame.ts";
import { term_quit, type Term } from "./Term.ts";
import * as View from "../ui/View.ts";
import { VERSION, wire_env, wire_env_parse, wire_frame, type Down, type How, type Open, type State, type Up } from "./Wire.ts";

// Types
// =====

// this illi in its window: the wire's nonce; how it started; whether it
// is shown; the others open, as last told; its terminal (once it's up)
// and screen; its state as last said; whether the window asked it to
// quit; whether it told the window of the person's quit
type Win = { nonce: string; how: How; shown: boolean; open: Open[]; t: Term | null; scr: Screen.Screen | null; said: string; ended: boolean; quit: boolean };

// Constants
// =========

// in a window: this illi's end of it (null: not in one)
export const WIN: Win | null = member_open();

// Member
// ======

// ILLI_WINDOW read, and taken out of the environment
function member_open(): Win | null {
  const env = wire_env_parse(process.env.ILLI_WINDOW);
  delete process.env.ILLI_WINDOW;
  return env === null ? null : { nonce: env.nonce, how: env.how, shown: env.how !== "hidden", open: [], t: null, scr: null, said: "", ended: false, quit: false };
}

// a message to the window, in order after what was painted before it
function member_send(msg: Up): void {
  if (WIN !== null) {
    process.stdout.write(wire_frame(msg, WIN.nonce));
  }
}

// ILLI_WINDOW again, for this illi run again in place (a restart: shown
// or hidden as it is now)
export function member_env(): Record<string, string> {
  return WIN === null ? {} : { ILLI_WINDOW: wire_env(WIN.nonce, WIN.shown ? "shown" : "hidden") };
}

// who this is, to the window, as it starts
export function member_hello(): void {
  member_send({ $: "hello", v: VERSION, pid: process.pid, profile: config.PROFILE, root: config.ROOT });
}

// the screen's end of the window (none outside one): its frames heard,
// the frame saying it's up, Ctrl+Z, the PTY lost
export function member_screen(): Screen.Windowed | undefined {
  if (WIN === null) {
    return undefined;
  }
  return {
    nonce  : WIN.nonce,
    hidden : !WIN.shown,
    heard  : (msg, scr) => member_heard(scr, msg as Down),
    up     : () => wire_frame({ $: "up" }, WIN.nonce),
    suspend: () => member_suspend(),
    lost   : () => process.kill(process.pid, "SIGHUP"),
  };
}

// the terminal up: the window's messages reach it from now on
export function member_attach(t: Term): void {
  if (WIN !== null) {
    WIN.t = t;
  }
}

// whether this illi is hidden in a window
export function member_hidden(): boolean {
  return WIN !== null && !WIN.shown;
}

// the other profiles open in the window, as last told (none outside one)
export function member_others(): Open[] {
  return WIN?.open ?? [];
}

// a message from the window
function member_heard(scr: Screen.Screen, msg: Down): void {
  if (WIN === null) {
    return;
  }
  WIN.scr = scr;
  if (msg.$ === "show") {
    member_show(scr, msg.switch === true, typeof msg.note === "string" ? msg.note : "");
  } else if (msg.$ === "roster" && Array.isArray(msg.open)) {
    member_roster(msg.open, typeof msg.note === "string" ? msg.note : "");
  } else if (msg.$ === "end") {
    member_end();
  }
}

// shown again: the status line run again, the note said, every row
// painted anew (up first: Screen.screen_show); shown by a switch, kept
// as the profile used last. The others' questions waiting are noted by
// the roster that follows
function member_show(scr: Screen.Screen, switched: boolean, note: string): void {
  const t = WIN!.t;
  [WIN!.shown, WIN!.open] = [true, []];
  if (t !== null) {
    status_set(t);
    if (note !== "") {
      term_note(t, note);
    }
  }
  Screen.screen_show(scr);
  if (switched) {
    member_keep(true);
  }
}

// the profile running kept as the project's, for its next start
// (Profiles.profile_here_keep), and, shown by a switch, as the one used
// last anywhere (as a restart keeps it)
export function member_keep(switched: boolean): void {
  try {
    Profiles.profile_here_keep(config.ROOT, process.cwd(), config.PROFILE);
    if (switched) {
      Profiles.profile_keep(config.ROOT, config.PROFILE);
    }
  } catch (err: any) {
    console.error("illi: the profile used last wasn't kept: " + err.message);
  }
}

// hidden, to show profile `to` (a switch): nothing painted, the status
// line's command stopped, a device login waiting let go, text chosen and
// the leader let go
export function member_hide(t: Term, to: string): void {
  member_rest(t);
  member_send({ $: "hide", to });
}

// Ctrl+Z: hidden as for a switch, and the window told, which puts the
// terminal back and stops itself (this illi's work goes on); shown again
// as the window comes back
function member_suspend(): void {
  const t = WIN?.t;
  if (t !== null && t !== undefined) {
    member_rest(t);
    member_send({ $: "suspend" });
  }
}

// the terminal hidden (member_hide)
function member_rest(t: Term): void {
  WIN!.shown = false;
  status_end(t);
  t.login?.abort();
  t.sel  = null;
  t.lead = false;
  clearTimeout(t.drift?.timer);
  t.drift = undefined;
  Screen.screen_hide(t.scr);
}

// the others open, as the window tells the one shown: a note as one asks
// something (or already did, as this one is shown) or its work ends; the
// window's own note (one that ended)
function member_roster(open: Open[], note: string): void {
  const was = WIN!.open;
  const t   = WIN!.t;
  WIN!.open = open;
  if (t === null) {
    return;
  }
  for (const o of open) {
    const before = was.find((p) => p.profile === o.profile);
    if (o.asks && before?.asks !== true) {
      term_note(t, "illi in profile " + o.profile + " asks you something: /profile " + o.profile + " answers it.");
    } else if (before?.working === true && !o.working && !o.asks) {
      term_note(t, "illi in profile " + o.profile + " is done.");
    }
  }
  if (note !== "") {
    term_note(t, note);
  }
  term_draw(t);
}

// this one's state, to the window, if it changed
export function member_state(t: Term): void {
  if (WIN === null) {
    return;
  }
  const state: State = { asks: t.v.asks.length > 0, working: View.view_running(t.v), jobs: t.chat === null ? 0 : t.v.background.length, holds: t.chat !== null };
  const said = JSON.stringify(state);
  if (said !== WIN.said) {
    WIN.said = said;
    member_send({ $: "state", ...state });
  }
}

// the person quit, here: the window told first (it ends the others), once
export function member_quit(): void {
  if (WIN !== null && WIN.shown && !WIN.ended && !WIN.quit) {
    WIN.quit = true;
    member_send({ $: "quit" });
  }
}

// the window ends: this one quits as a quit does, unless one is under
// way; not up yet, at once
function member_end(): void {
  const t = WIN!.t;
  WIN!.ended = true;
  if (t === null) {
    process.exit(0);
  }
  if (!t.quitting) {
    term_quit(t);
  }
}

// a line said once illi has left the screen, for the window to print as
// it ends (or to note, if another profile is shown then)
export function member_say(text: string): void {
  member_send({ $: "say", text });
}
