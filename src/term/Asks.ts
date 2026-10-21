// Asks
// ====
// A question the chat asks (View Question: Claude Code asking leave to
// use a tool, Tools.approve) in the picker, as it comes: Yes; Yes, and
// not again for that tool this run; No (Esc too); No, and say why (a
// line typed, for the model). What it would do shows at its foot, and
// as a note.
// illi's own question (ask) shows in place of the input instead (its
// form): the question, its options, and a row for words of the user's
// own, which they may type beside the options they pick or instead of
// them; Esc skips it.
// One answered elsewhere, or dropped (a stop), closes its picker; one
// that comes while another picker is open waits for it to close. A
// pipe has no one to ask: no, at once.

import { term_ask, term_chooser } from "./Commands.ts";
import * as Draw from "../ui/Draw.ts";
import { term_note } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import * as Screen from "../ui/Screen.ts";
import { term_send, type Form, type Term } from "./Term.ts";
import type { Question } from "../ui/View.ts";

// the answers, in the picker's order
const YES = 0, ALWAYS = 1, NO = 2, WHY = 3;

// the form's keys, at its foot
const KEYS = "↑↓ move · Space pick · type your own · Enter send · Esc skip";

// the question first asked, shown till it is answered or gone
export function term_asks(t: Term): void {
  const q = t.v.asks[0] ?? null;
  if (t.asking !== null && t.asking.id !== q?.id) {
    if (t.asking.c !== null && t.choose === t.asking.c) {
      t.choose = null;
    }
    t.asking = null;
  }
  if (q === null) {
    return;
  }
  if (t.asking === null) {
    t.asking = { id: q.id, c: null, done: false, form: q.options === undefined ? null : { ed: Screen.ed_new(), at: 0, picked: [] } };
    if (q.options === undefined) {
      term_note(t, q.who + " asks to use " + q.tool + (q.what === "" ? "." : ": " + q.what));
    }
    if (!t.scr.tty) {
      return term_answer(t, q, false, false, "");
    }
  }
  if (!t.asking.done && t.asking.form === null && t.choose === null) {
    term_ask_open(t, q);
  }
}

// illi's question open, and its form
function term_form(t: Term): [Question & { options: NonNullable<Question["options"]> }, Form] | null {
  const q = t.v.asks[0];
  const f = t.asking?.form ?? null;
  return f === null || q?.id !== t.asking!.id || q.options === undefined ? null : [q as Question & { options: NonNullable<Question["options"]> }, f];
}

// a key to illi's question (true: taken): Up and Down (Tab too) move
// round its options and the words' row; Enter sends the options picked
// (none: the lit one) and the words; Esc and Ctrl+C skip it; the rest
// edit the words, as the input's keys do
export function term_form_key(t: Term, key: string): boolean {
  const open = term_form(t);
  if (open === null) {
    return false;
  }
  const [q, f] = open;
  const n      = q.options.length;
  const move   = ({ Up: -1, "Shift+Tab": -1, Down: 1, Tab: 1 } as Record<string, number>)[key];
  if (move !== undefined) {
    f.at = (f.at + move + n + 1) % (n + 1);
  } else if (key === "Enter") {
    const picked = f.picked.length > 0 ? [...f.picked].sort((a, b) => a - b) : f.at < n ? [f.at] : [];
    const words  = Screen.ed_expand(f.ed, f.ed.text).trim();
    const said   = [picked.length === 0 ? "" : "picked: " + picked.map((k) => q.options[k].label).join(", "), words === "" ? "" : "wrote: " + words];
    if (picked.length > 0 || words !== "") {
      term_answer(t, q, true, false, said.filter((x) => x !== "").join("\n"));
    }
  } else if (key === "Esc" || key === "Ctrl+C") {
    term_answer(t, q, false, false, "");
  } else if (Screen.ed_key(f.ed, key)) {
    f.at = n;
  } else {
    return false;
  }
  return true;
}

// text typed at illi's question (true: taken): a space on an option picks
// it (the one picked, but with multi; again: not), else to the words
export function term_form_type(t: Term, text: string): boolean {
  const open = term_form(t);
  if (open === null) {
    return false;
  }
  const [q, f] = open;
  if (text === " " && f.at < q.options.length) {
    f.picked = f.picked.includes(f.at) ? f.picked.filter((k) => k !== f.at) : q.multi === true ? [...f.picked, f.at] : [f.at];
  } else {
    Screen.ed_type(f.ed, text);
    f.at = q.options.length;
  }
  return true;
}

// a paste at illi's question: to its words (true: taken)
export function term_form_paste(t: Term, text: string): boolean {
  const open = term_form(t);
  if (open !== null) {
    Screen.ed_paste(open[1].ed, text);
    open[1].at = open[0].options.length;
  }
  return open !== null;
}

// illi's question as lines in place of the input, w wide, its words at
// most max lines (null: none open): who asks, the question, its options
// (the lit one marked, those picked filled; several: squares), the
// words' row as the input looks, the keys; the cursor in the words
export function term_form_lines(t: Term, w: number, max: number): { lines: Paint.Line[]; at: Screen.Spot } | null {
  const open = term_form(t);
  if (open === null) {
    return null;
  }
  const [q, f] = open;
  const bold   = { ...Paint.INK, b: true };
  const accent = { ...bold, c: Draw.draw_theme().accent ?? "5" };
  const lead   = (k: number) => Paint.Run(k === f.at ? "› " : "  ", bold);
  const marks  = q.multi === true ? ["□ ", "■ "] : ["○ ", "● "];
  const option = (o: { label: string; about: string }, k: number) => {
    const runs = [Paint.Run(Paint.text_clean(o.label), k === f.at ? bold : Paint.INK), ...(o.about === "" ? [] : [Paint.Run("  " + Paint.text_clean(o.about), Paint.DIM)])];
    const rows = Paint.runs_wrap(runs, Math.max(1, w - 4), false);
    const mark = Paint.Run(marks[f.picked.includes(k) ? 1 : 0], f.picked.includes(k) ? accent : Paint.DIM);
    return rows.map((l, j) => (j === 0 ? [lead(k), mark, ...l] : [Paint.Run("    "), ...l]));
  };
  const head   = [Paint.Run(q.who + " asks" + (q.multi === true ? " · pick any" : ""), accent)];
  const ask    = Paint.runs_wrap([Paint.Run(Paint.text_clean(q.what))], w, false);
  const opts   = q.options.flatMap(option);
  const words  = Screen.screen_input({ ...t.scr, ed: f.ed }, w - 2, max, "Something else: type your own", false);
  const own    = words.lines.map((l, j) => [j === 0 ? lead(q.options.length) : Paint.Run("  "), ...l]);
  const lines  = [head, ...ask, ...opts, ...own, [Paint.Run(KEYS, Paint.DIM)]];
  return { lines, at: { row: 1 + ask.length + opts.length + words.at.row, col: 2 + words.at.col } };
}

// the picker for a question
function term_ask_open(t: Term, q: Question): void {
  const names = ["Yes", "Yes, and don't ask again for " + q.tool + " this run", "No", "No, and say why"];
  const keys  = (_k: number, key: string) => {
    if (key !== "Esc" && key !== "Ctrl+C") {
      return false;
    }
    t.choose = null;
    term_answer(t, q, false, false, "");
    return true;
  };
  const pick = (k: number) => {
    if (k === WHY) {
      term_ask(t, "Why not " + q.tool + "?", "your reason, for the model", "", "Enter send · Esc back", (why) => (term_answer(t, q, false, false, why), null));
      t.asking!.c = t.choose;
      return;
    }
    term_answer(t, q, k !== NO, k === ALWAYS, "");
  };
  const title = "Allow " + q.tool + (q.who === "illi" ? "" : " for " + q.who) + "?";
  term_chooser(t, title, names, names.map(() => ""), YES, pick, { keys, foot: () => q.what === "" ? "Esc no" : q.what });
  t.asking!.c = t.choose;
}

// a question answered; said: a no's reason, the answer to illi's own
function term_answer(t: Term, q: Question, yes: boolean, always: boolean, said: string): void {
  t.asking = { id: q.id, c: null, done: true, form: null };
  term_send(t, { $: "answer", ask: q.id, yes, always, said });
}
