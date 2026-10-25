// Related
// =======
// The radar on screen (Radar.ts): while illi works, the summary lines of
// past topics that may be related, at the side under Related (Side.ts),
// or counted on the bottom line where the side doesn't show. A search
// runs after each step of a turn: a message the user sent, a step's
// results all logged (its calls run one after another: the last of
// them; what comes with it waits out STEP), the turn's end; never as
// text streams. It runs in a thread of its own (Projects.radar), one at a
// time: a step while one runs asks again once it ends, the stale answer
// dropped. Nothing of it reaches the model.
//
// A click on a line opens it at full detail: a pane over the chat, its
// messages whole, drawn as the chat draws them. A click on its id pins
// it: the id typed into the input (#1234+16, a block's name:
// View.block_name), for the next message to name (the model zooms an id
// it is given: its view's lines are id+n). A line opened or pinned stays
// till the user's next message (touched), then fades and leaves as any
// other. A click on the head lists them: Enter opens one, Tab pins it,
// Del dismisses it (left out from then on, till illi quits). Each line
// shown, opened, pinned and dismissed is counted by its score (RELATED:
// counts alone, no text, no id), so where a line counts as a strong
// match can be set from where those opened sit. `related` off: none of
// it.

import * as fs from "node:fs";
import { term_chooser } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { term_draw } from "./Frame.ts";
import * as Paint from "../ui/Paint.ts";
import { Projects } from "../chat/Projects.ts";
import { Radar, type Found, type Said, type Shown } from "../chat/Radar.ts";
import * as Reply from "../ui/Reply.ts";
import * as Screen from "../ui/Screen.ts";
import { term_age } from "./Side.ts";
import { Store, type Store as File } from "../chat/Store.ts";
import type { Term } from "./Term.ts";
import { json_object } from "../tools/Clip.ts";
import * as View from "../ui/View.ts";

// Types
// =====

// a terminal's radar: the lines shown, in order; the spans dismissed;
// the chat's file, read as first needed (null: not yet); the step's timer;
// whether a search runs, and whether a step came while it did; whether
// work ran as last told
type State = { shown: Shown[]; gone: Array<[number, number]>; store: File | null; timer: Timer | undefined; busy: boolean; again: boolean; ran: boolean };

// what is counted of a line: shown, opened, pinned, dismissed
type Event = "shown" | "opened" | "pinned" | "dismissed";

// Constants
// =========

// how long a step's messages are waited on before its search (ms): the
// results of calls run at once come within it
const STEP = 250;

// the most of a line's summary its list names it by (columns)
const NAME = 60;

// the counts, in a file of the root's (every profile's, every illi's):
// by what happened to a line, whether a path or an error's name was among
// what it matched (anchored) or words alone, its best score (a whole
// number, rounded down), how many; those counted since, kept KEEP after
// the last (ms), added to the file as it is then
export const RELATED = config.ROOT + "/related.json";
const KEEP = 2000;
let queued: Array<{ e: Event; s: Shown }> = [];
let keep: Timer | undefined;

// each terminal's radar
const RADARS = new WeakMap<Term, State>();

// Radar
// =====

// a terminal's radar, made at its first use
function related_of(t: Term): State {
  let r = RADARS.get(t);
  if (r === undefined) {
    RADARS.set(t, (r = { shown: [], gone: [], store: null, timer: undefined, busy: false, again: false, ran: false }));
  }
  return r;
}

// the lines shown (`related` off, none)
export function related_shown(t: Term): Shown[] {
  return config.RELATED ? related_of(t).shown : [];
}

// a message of the chat, as the terminal hears it: a step's end (the
// user's message, the last of a step's results, the turn's end)
// searches, once what comes with it is in (STEP); the user's message
// lets the lines opened or pinned go (Radar.merge's touched); none from
// a pipe, nor with `related` off
export function related_hear(t: Term, msg: View.Server): void {
  if (!config.RELATED || !t.scr.tty) {
    return;
  }
  const r    = related_of(t);
  const ran  = r.ran;
  r.ran      = View.view_running(t.v);
  const main = msg.$ === "entry" && msg.agent === undefined && msg.id !== undefined;
  const step = main && (msg.kind === "user" || (msg.kind === "echo" && related_settled(t.v)));
  if (main && msg.kind === "user" && r.shown.some((s) => s.touched)) {
    r.shown = r.shown.map((s) => ({ ...s, touched: false }));
  }
  if (step || (msg.$ === "state" && ran && !r.ran)) {
    clearTimeout(r.timer);
    r.timer = setTimeout(() => related_seek(t), STEP);
    r.timer.unref?.();
  }
}

// whether a step's results are all in: as many results as calls since
// the last message that is neither (a step's calls run one after
// another, each result logged as its call ends)
export function related_settled(v: View.View): boolean {
  let [calls, results] = [0, 0];
  for (let k = v.parts.length - 1; k >= 0; k--) {
    const [id, n] = v.parts[k];
    const kind = n === 1 ? v.whole.get(id)?.kind : undefined;
    if (kind !== "tool" && kind !== "echo") {
      break;
    }
    [calls, results] = kind === "tool" ? [calls + 1, results] : [calls, results + 1];
  }
  return results >= calls;
}

// the search of the run as it is now, in the radar's thread; one
// running, asked again once it ends. Its lines merged into those shown
// (Radar.merge), those that join counted; a run that says nothing to
// search finds none, so the lines shown fade all the same; a failure
// (the thread gone) shows none new. `related` turned off meanwhile:
// nothing, nor the answer of one asked before
export function related_seek(t: Term): Promise<void> {
  const r = related_of(t);
  if (!config.RELATED) {
    return Promise.resolve();
  }
  if (r.busy) {
    r.again = true;
    return Promise.resolve();
  }
  const store = related_store(t);
  if (store === null) {
    return Promise.resolve();
  }
  const { user, run } = related_run(t.v);
  const units = Radar.units(user, run);
  if (units.length === 0) {
    related_found(t, []);
    term_draw(t);
    return Promise.resolve();
  }
  const { end, out } = Radar.left(t.v.parts, t.v.turn, r.gone);
  r.busy = true;
  return Projects.radar(store.file, { chat: store.chat, units, end, out }).then((found) => {
    r.busy = false;
    if (!config.RELATED) {
      r.again = false;
      return;
    }
    if (r.again) {
      r.again = false;
      return related_seek(t);
    }
    related_found(t, found);
    term_draw(t);
  }, () => {
    r.busy = r.again = false;
  });
}

// the lines a search found, merged into those shown, kept still (what
// is left out now, as the view moved on or the user dismissed since the
// search was asked, gone first, from both); those that join counted as
// shown
export function related_found(t: Term, found: Found[]): void {
  const r = related_of(t);
  const { end, out } = Radar.left(t.v.parts, t.v.turn, r.gone);
  const was = new Set(r.shown.map((s) => View.block_name(s.first, s.n)));
  r.shown = Radar.merge(Radar.prune(r.shown, end, out), Radar.prune(found, end, out));
  r.shown.filter((s) => !was.has(View.block_name(s.first, s.n))).forEach((s) => related_count("shown", s));
}

// a line as shown now (a search's merge makes each anew), opened or
// pinned: it stays till the user's next message (null: shown no more)
function related_touch(t: Term, s: Shown): Shown | null {
  const r = related_of(t);
  r.shown = r.shown.map((x) => (x.first === s.first && x.n === s.n ? { ...x, touched: true } : x));
  return r.shown.find((x) => x.first === s.first && x.n === s.n) ?? null;
}

// the chat's file and chat, read once (a view of another terminal's
// reads its whole state at each t.mem); null: none to read
function related_store(t: Term): File | null {
  const r = related_of(t);
  try {
    return (r.store ??= t.mem().store);
  } catch {
    return null;
  }
}

// the run as the query reads it: the latest message the user sent (null:
// none known), then each message after it
export function related_run(v: View.View): { user: string | null; run: Said[] } {
  const ids = v.parts.filter(([, n]) => n === 1).map(([id]) => id);
  let k = ids.length - 1;
  while (k >= 0 && v.whole.get(ids[k])?.kind !== "user") {
    k--;
  }
  const run = ids.slice(k + 1).flatMap((id) => {
    const e = v.whole.get(id);
    return e === undefined ? [] : [{ kind: e.kind, text: e.text }];
  });
  return { user: k >= 0 ? v.whole.get(ids[k])!.text : null, run };
}

// Lines
// -----

// a line's summary as the side shows it: one line, its first item's kind
// ("user: ") left out
export function related_text(s: Shown): string {
  return Paint.text_line(s.text).replace(/^(user|illi|tool|echo|mind|note|work|recap): /, "").trim();
}

// a summary cut to w columns at a word's end (one ending in its last
// third), an ellipsis ending it if cut
export function related_cut(text: string, w: number): string {
  if (Paint.text_width(text) <= w) {
    return text;
  }
  const head  = Paint.line_cut([Paint.Run(text)], 0, Math.max(0, w - 1))[1].map((r) => r.x).join("");
  const space = head.lastIndexOf(" ");
  const words = /\s/.test(text[head.length] ?? " ") || space < (head.length * 2) / 3 ? head : head.slice(0, space);
  return w < 2 ? "" : words.replace(/[\s,;:.]+$/, "") + "…";
}

// how long ago a line's episode ended: 12m, 3h, 2d ("": not known)
export function related_age(s: Shown): string {
  const at = Date.parse(s.date);
  return Number.isNaN(at) ? "" : term_age(Date.now() - at);
}

// a line opened at full detail: a pane over the chat, titled by its id
// and age, its summary over its messages, each whole, drawn as the chat
// draws them (read once, now); it stays shown, and is counted
export function related_open(t: Term, s: Shown): void {
  const store = related_store(t);
  if (store === null) {
    return;
  }
  const rows  = Array.from({ length: s.n }, (_, k) => Store.msg(store, s.first + k)).flatMap((m) => (m === null ? [] : View.entry_rows(m.i, m.kind, m.text, m.images)));
  const age   = related_age(s);
  const title = View.block_name(s.first, s.n) + (age === "" ? "" : " · " + age + " ago");
  const lead  = [Paint.Run(related_text(s), { ...Paint.DIM, i: true })];
  t.pane   = {
    title,
    make: (w) => {
      Reply.reply_buttons(false);
      try {
        return [...Paint.runs_wrap(lead, w, false), [], ...Paint.rows_lines(rows, w)];
      } finally {
        Reply.reply_buttons(t.scr.tty);
      }
    },
    w: 0, lines: [], scroll: 0,
  };
  t.choose = null;
  related_count("opened", related_touch(t, s) ?? s);
}

// a line pinned: its id typed into the input where the cursor is, a
// space round it (the suggested reply dismissed, as typing does), for the
// next message to name; it stays shown, and is counted
export function related_pin(t: Term, s: Shown): void {
  const ed = t.scr.ed;
  if (ed.text === "") {
    t.dropped = t.v.suggest;
  }
  Screen.ed_type(ed, (ed.pos === 0 || /\s$/.test(ed.text.slice(0, ed.pos)) ? "" : " ") + View.block_name(s.first, s.n) + " ");
  t.scr.typed = true;
  t.choose = null;
  related_count("pinned", related_touch(t, s) ?? s);
}

// a line dismissed: gone from the side, and left out of every search
// after, till illi quits; counted
export function related_dismiss(t: Term, s: Shown): void {
  const r = related_of(t);
  r.shown = r.shown.filter((x) => x.first !== s.first || x.n !== s.n);
  r.gone.push([s.first, s.first + s.n]);
  related_count("dismissed", s);
}

// the lines listed (a click on the side's head, or on the bottom line's
// count), at line `at` (the last, if fewer): Enter opens one, Tab pins
// it, Del dismisses it, the list staying with the rest as they are now
// (searches may have changed them since it opened), at the line that was
// under it (none: closed)
export function related_list(t: Term, at = 0): void {
  const shown = related_shown(t);
  if (shown.length === 0) {
    t.choose = null;
    return;
  }
  const about = shown.map((s) => [related_age(s) === "" ? "" : related_age(s) + " ago", View.block_name(s.first, s.n)].filter((x) => x !== "").join(" · "));
  const keys  = (k: number, key: string) => {
    if (key === "Tab") {
      related_pin(t, shown[k]);
      return true;
    }
    if (key === "Delete") {
      const now = related_shown(t).findIndex((s) => s.first === shown[k].first && s.n === shown[k].n);
      related_dismiss(t, shown[k]);
      related_list(t, now < 0 ? k : now);
      return true;
    }
    return false;
  };
  term_chooser(t, "Related", shown.map((s) => related_cut(related_text(s), NAME)), about, -1, (k) => related_open(t, shown[k]), { keys, foot: () => "Enter opens · Tab pins its id · Del dismisses" });
  t.choose!.at = Math.max(0, Math.min(at, shown.length - 1));
}

// Counts
// ------

// a line counted, by what happened to it, and queued to keep once counts
// pause (the timer never holds illi open)
export function related_count(e: Event, s: Shown): void {
  queued.push({ e, s });
  clearTimeout(keep);
  keep = setTimeout(related_keep, KEEP);
  keep.unref?.();
}

// the counts queued added to the file as it is now, so another illi's
// kept meanwhile stay; written whole beside it, then moved over it (no
// reader sees half a file). Never in the way: a failure keeps nothing
// (nor the file beside)
export function related_keep(): void {
  const temp = RELATED + "." + process.pid;
  const some = queued;
  queued = [];
  try {
    const count = json_object(RELATED) ?? {};
    for (const { e, s } of some) {
      const by = (count[e] = related_object(count[e]));
      const of = (by[s.anchored ? "anchored" : "words"] = related_object(by[s.anchored ? "anchored" : "words"]));
      const at = String(Math.floor(s.peak));
      of[at] = (typeof of[at] === "number" ? of[at] : 0) + 1;
    }
    fs.writeFileSync(temp, JSON.stringify(count, null, 1) + "\n");
    fs.renameSync(temp, RELATED);
  } catch {
    fs.rmSync(temp, { force: true });
  }
}

// a value as an object of the counts (not one: an empty one)
function related_object(x: unknown): Record<string, any> {
  return typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, any>) : {};
}
