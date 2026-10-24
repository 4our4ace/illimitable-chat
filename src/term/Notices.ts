// Notices
// =======
// Everything the terminal tells the person for a while, one list with one
// clock: a toast (one line at the chat's right end, in the accent:
// a copy, Ctrl+C's quit hint; a new one takes the last one's place) or a
// note (in the rule over the input: what a command did, what was
// refused). Every one goes by itself once its time is up: a toast's
// TOAST, a note's NOTE (a long one's as long as reading it takes:
// NOTE_CHAR a character past NOTE_READ, NOTE_MAX at most), or what its
// caller asks (the login's code, while it waits: held, so no other note
// pushes it out). NOTES notes at most, one while work runs (its status
// has the rule): one more pushes the oldest out; a note said again only
// lives longer. Esc and a message sent take the notes away sooner. The
// view's own (View.ts notes) come in as notes. A pipe prints each note
// as it comes. A few are said once ever (term_once).

import * as config from "../config/Config.ts";
import { Seen } from "../config/Seen.ts";
import * as View from "../ui/View.ts";
import { term_draw } from "./Frame.ts";
import type { Term } from "./Term.ts";

// Types
// =====

// a notice: what it says, whether a toast (else a note), when it goes
// (ms since 1970), whether held (its caller's own time: no note pushes it
// out)
export type Notice = { text: string; toast: boolean; until: number; held: boolean };

// Constants
// =========

// how long a toast shows; a note, the characters read in that time, a
// character more, a note at most (ms); the notes kept, the newest
const TOAST            = 2500;
const NOTE             = 3000;
const NOTE_READ        = 60;
const NOTE_CHAR        = 50;
const NOTE_MAX         = 8000;
const NOTES            = 2;

// Notices
// =======

// a notice told, for ms (none: as its kind lasts); the one it is, to let
// it go sooner (term_unnotify). A note past NOTES (one while work runs)
// pushes out the oldest not held
export function term_notify(t: Term, text: string, toast: boolean, ms?: number): Notice {
  const until = Date.now() + (ms ?? (toast ? TOAST : Math.min(NOTE_MAX, NOTE + Math.max(0, text.length - NOTE_READ) * NOTE_CHAR)));
  const same  = (n: Notice) => (toast ? n.toast : !n.toast && n.text === text);
  const was   = t.notices.find(same);
  const notice = { text, toast, until: Math.max(until, was !== undefined && !toast ? was.until : 0), held: ms !== undefined };
  t.notices = [...t.notices.filter((n) => !same(n)), notice];
  const most  = View.view_running(t.v) ? 1 : NOTES;
  const notes = t.notices.filter((n) => !n.toast);
  const out   = notes.filter((n) => !n.held && n !== notice).slice(0, Math.max(0, notes.length - most));
  t.notices = t.notices.filter((n) => !out.includes(n));
  term_due(t);
  term_draw(t);
  return notice;
}

// a note over the input, for ms (none: as long as reading it takes)
export function term_note(t: Term, text: string, ms?: number): void {
  term_notify(t, text, false, ms);
}

// the start's notes said once ever, on a terminal (a pipe's script never
// reads them, so none is spent there), each for ms: a mode of auto, what
// it asks now (config.AUTO_NOTE); kept as said in illi's folder (Seen)
export function term_once(t: Term, ms: number): void {
  if (t.scr.tty && config.AUTO_NOTE !== "" && Seen.first("note auto 0.3.1")) {
    term_note(t, config.AUTO_NOTE, ms);
  }
}

// a toast at the chat's right end, for ms (none: TOAST)
export function term_toast(t: Term, text: string, ms?: number): void {
  term_notify(t, text, true, ms);
}

// a notice let go before its time
export function term_unnotify(t: Term, notice: Notice): void {
  if (t.notices.includes(notice)) {
    t.notices = t.notices.filter((n) => n !== notice);
    term_due(t);
    term_draw(t);
  }
}

// the notes let go (Esc, a message sent); a toast stays its time
export function term_unnote(t: Term): void {
  t.notices = t.notices.filter((n) => n.toast);
  term_due(t);
}

// the clock: the notices whose time is up let go, a paint, and the clock
// set for the next to go (none left: stopped)
function term_due(t: Term): void {
  clearTimeout(t.expire);
  t.expire = undefined;
  const now = Date.now();
  if (t.notices.some((n) => n.until <= now)) {
    t.notices = t.notices.filter((n) => n.until > now);
    term_draw(t);
  }
  if (t.notices.length > 0) {
    const next = Math.min(...t.notices.map((n) => n.until));
    t.expire = setTimeout(() => term_due(t), Math.max(0, next - now) + 1);
    t.expire.unref?.();
  }
}

// what a paint shows: the view's notes taken in, the notes (oldest
// first; a pipe gets them once, here, and keeps none), the toast ("":
// none)
export function term_shown(t: Term): { notes: string[]; toast: string } {
  t.v.notes.splice(0).forEach((text) => term_note(t, text));
  const notes = t.notices.filter((n) => !n.toast).map((n) => n.text);
  if (!t.scr.tty) {
    t.notices = [];
    term_due(t);
    return { notes, toast: "" };
  }
  return { notes, toast: t.notices.find((n) => n.toast)?.text ?? "" };
}
