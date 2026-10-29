// Member
// ======
// illi as one profile of a window (Window.ts: on a terminal, the process
// that owns it, every profile's illi under it on a PTY of its own). The
// window names its wire (Wire.ts) and how this one starts in ILLI_WINDOW,
// taken out of the environment as this loads, so no tool, hook or MCP
// server inherits it (put back for a restart in place: member_env; and
// so is `off`, which runs illi alone).
//
// This one says who it is as it starts (hello), and its state (a question
// waits, at work, its background jobs, whether it holds its chat) each
// time it changes. Hidden (member_hide: a switch; member_suspend: Ctrl+Z,
// the window stopping), it paints nothing (Screen.ts, and no paint is
// even laid out: Frame.ts term_draw), takes no keys (any sent as it hid
// are dropped) and runs no status line command; a switch lets a device
// login waiting go too (its code is on the screen left; Ctrl+Z keeps it,
// for a sign-in in the shell meanwhile). All else runs on: its turn,
// subagents, jobs, MCP servers, hooks and plugins, a question waiting for
// the person.
// Shown again (`show`), it paints whole; shown by a switch, it is kept as
// the profile used last (anywhere, and in this project). Shown, it hears
// of the others open (`roster`): what the side panel (a spinner moving
// while one works), the title and a quit's warning say of them, and a
// note as one asks something or is done. The side marks the profiles
// open in other terminals too: the illi holding a chat tells its state
// beside its lock (Lock.tell), and one shown on a terminal looks at the
// others' every LOOK (member_watch; Lock.states). The person's
// quit goes to the window first (`quit`), which ends the others; `end`
// quits this one as a quit does, once (a quit under way goes on; a second
// Ctrl+D still quits at once). Lines said after leaving the screen go to
// the window (member_say), which prints them as it ends. The PTY lost is
// the window gone: a hangup.

import * as config from "../config/Config.ts";
import { Lock } from "../chat/Lock.ts";
import { term_note } from "./Notices.ts";
import * as Profiles from "../config/Profiles.ts";
import * as Screen from "../ui/Screen.ts";
import { status_end, status_set } from "./Status.ts";
import { term_draw, term_side_again } from "./Frame.ts";
import { term_unwait } from "./Keys.ts";
import { term_quit, type Term } from "./Term.ts";
import * as View from "../ui/View.ts";
import { VERSION, wire_env, wire_env_parse, wire_frame, type Down, type How, type Open, type State, type Up } from "./Wire.ts";

// Types
// =====

// this illi in its window: the wire's nonce; how it started; whether it
// is shown; the others open, as last told; its terminal (once it's up);
// whether the window asked it to quit; whether it told the window of the
// person's quit
type Win = { nonce: string; how: How; shown: boolean; open: Open[]; t: Term | null; ended: boolean; quit: boolean };

// Constants
// =========

// ILLI_WINDOW as this illi found it (taken out of the environment as it
// loads); in a window: this illi's end of it (null: not in one, as with
// none or `off`)
const FOUND = process.env.ILLI_WINDOW;
export const WIN: Win | null = member_open();

// how often the side's spinner of a profile at work hidden here moves
// (ms: as the subagents'); its clock, while one does
const SPIN = 160;
let spin: Timer | undefined;

// how often the chats other illis hold are looked at (ms), for the side's
// profiles: the states they told (Lock.states), as last looked at
const LOOK = 2000;
let seen: Open[] = [];
let look: Timer | undefined;

// this one's state as last said (to the window, beside its lock)
let said = "";

// Member
// ======

// ILLI_WINDOW read, and taken out of the environment
function member_open(): Win | null {
  const env = wire_env_parse(process.env.ILLI_WINDOW);
  delete process.env.ILLI_WINDOW;
  return env === null ? null : { nonce: env.nonce, how: env.how, shown: env.how !== "hidden", open: [], t: null, ended: false, quit: false };
}

// a message to the window, in order after what was painted before it
function member_send(msg: Up): void {
  if (WIN !== null) {
    process.stdout.write(wire_frame(msg, WIN.nonce));
  }
}

// ILLI_WINDOW again, for this illi run again in place (a restart): in a
// window, shown or hidden as it is now; alone, as found, so one started
// with ILLI_WINDOW=off stays alone (unset, the execve would make it a
// window)
export function member_env(): Record<string, string> {
  return WIN !== null ? { ILLI_WINDOW: wire_env(WIN.nonce, WIN.shown ? "shown" : "hidden") } : FOUND === undefined ? {} : { ILLI_WINDOW: FOUND };
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

// the terminal up: the window's messages reach it from now on, and the
// others open, as told while it started, are heard again by it (a
// question waiting noted, the side's spinner moving); on a terminal, the
// chats other illis hold looked at from now on
export function member_attach(t: Term): void {
  if (WIN !== null) {
    const open = WIN.open;
    [WIN.t, WIN.open] = [t, []];
    member_roster(open, "");
  }
  if (t.scr.tty) {
    look ??= setInterval(() => member_look(t), LOOK);
    look.unref?.();
    member_look(t);
  }
}

// the other profiles open in the window, as last told (none outside one)
export function member_others(): Open[] {
  return WIN?.open ?? [];
}

// the other profiles open anywhere, as the side marks them: those hidden
// in the window (as last told) and those whose chats illis hold in other
// terminals (as last looked at), each once: a question waiting or at
// work in either, its background jobs counted once (a hidden one's,
// which holds its chat, are told both ways)
export function member_seen(): Open[] {
  const all = [...member_others(), ...seen].filter((o) => o.profile !== config.PROFILE);
  return [...new Set(all.map((o) => o.profile))].map((profile) => {
    const of   = all.filter((o) => o.profile === profile);
    const told = seen.filter((o) => o.profile === profile).reduce((n, o) => n + o.jobs, 0);
    return { profile, asks: of.some((o) => o.asks), working: of.some((o) => o.working), jobs: Math.max(member_others().find((o) => o.profile === profile)?.jobs ?? 0, told), holds: of.some((o) => o.holds) };
  });
}

// the chats other illis hold looked at (while this one is shown and
// there are other profiles to mark): one changed, the side painted again
// and its spinner on or off
export function member_look(t: Term): void {
  if ((WIN !== null && !WIN.shown) || t.profs.length < 2) {
    return;
  }
  const now = Lock.states(t.profs.map((profile) => ({ profile, dir: Profiles.profile_dir(config.ROOT, profile) })));
  if (JSON.stringify(now) !== JSON.stringify(seen)) {
    seen = now;
    member_spin(t);
    term_draw(t);
  }
}

// a message from the window
function member_heard(scr: Screen.Screen, msg: Down): void {
  if (WIN === null) {
    return;
  }
  if (msg.$ === "show") {
    member_show(scr, msg.switch === true, typeof msg.note === "string" ? msg.note : "");
  } else if (msg.$ === "roster" && Array.isArray(msg.open)) {
    member_roster(msg.open, typeof msg.note === "string" ? msg.note : "");
  } else if (msg.$ === "end") {
    member_end();
  }
}

// shown again: the status line run again, the note said, every row
// painted anew (up first: Screen.screen_show), the other terminals'
// chats looked at once (hidden, it didn't); shown by a switch, kept as
// the profile used last. The others' questions waiting are noted by the
// roster that follows
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
  if (t !== null) {
    member_look(t);
  }
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
// line's command stopped, a sign-in waiting let go (/login's: ChatGPT's
// device login, Claude Code's), text chosen and the leader let go
export function member_hide(t: Term, to: string): void {
  t.login?.abort();
  member_rest(t);
  member_send({ $: "hide", to });
}

// Ctrl+Z: hidden (a sign-in waiting kept), and the window told,
// which puts the terminal back and stops itself (this illi's work goes
// on); shown again as the window comes back
function member_suspend(): void {
  const t = WIN?.t;
  if (t !== null && t !== undefined) {
    member_rest(t);
    member_send({ $: "suspend" });
  }
}

// the terminal hidden: nothing painted, the status line's command
// stopped, text chosen, the leader and a press a popup took let go, the
// pointer's place forgotten (shown again, nothing lights till it moves)
// and a click's fold waiting given up; the chat's question shows anew
// once this one is shown again, holding Enter and a click again
// (Question.ts question_held), as it comes up then
function member_rest(t: Term): void {
  WIN!.shown = false;
  member_spin(t);
  status_end(t);
  t.sel       = null;
  t.lead      = false;
  t.aim.press = null;
  t.pointed   = false;
  term_unwait(t);
  if (t.asking !== null) {
    t.asking.shown = null;
  }
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
  member_spin(t);
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

// while this one is shown (alone: always) and another profile open
// works, here or in another terminal, the side's spinner for it moves:
// the side's rows written again alone, each SPIN (none while a paint is
// due, or text chosen, the leader or a picker would need a whole one)
function member_spin(t: Term): void {
  const on = (WIN === null || WIN.shown) && member_seen().some((o) => o.working && !o.asks);
  if (on && spin === undefined) {
    spin = setInterval(() => !t.due && t.ruled !== null && t.ruled.side !== null && t.sel === null && !t.lead && t.choose === null && term_side_again(t), SPIN);
    spin.unref?.();
  } else if (!on && spin !== undefined) {
    clearInterval(spin);
    spin = undefined;
  }
}

// this one's state, if it changed: to the window, and, holding its chat,
// beside its lock for the other terminals (Lock.tell)
export function member_state(t: Term): void {
  const state: State = { asks: t.v.asks.length > 0, working: View.view_running(t.v), jobs: t.chat === null ? 0 : t.v.background.length, holds: t.chat !== null };
  const now = JSON.stringify(state);
  if (now === said) {
    return;
  }
  said = now;
  if (t.chat !== null) {
    Lock.tell(state);
  }
  member_send({ $: "state", ...state });
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
