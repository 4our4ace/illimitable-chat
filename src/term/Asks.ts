// Asks
// ====
// A question the chat asks (View Question: leave to run a call the
// checks stopped, Tools.guard) in the picker, as it comes: Yes; Yes, and
// don't ask again for what it keeps, in this project (offered only when
// it keeps something); No (Esc too); No, and say why (a line typed, for
// the model). What it would do and why it was asked show over the
// answers, and as a note.
// illi's own questions (ask) show in the popup too, as a form (Popup.ts:
// over a pane too, the input as typed left under it), a tab each: the
// question, its options (one to pick, or several), and a row for words
// of the user's own, which they may type beside the options they pick or
// instead of them; then a tab with all the answers, to look over and
// send. Esc skips them all.
// One answered elsewhere, or dropped (a stop), closes its picker; one
// that comes while another picker is open waits for it to close. A
// pipe has no one to ask: no, at once.

import { term_ask, term_chooser } from "./Commands.ts";
import * as Draw from "../ui/Draw.ts";
import { term_note } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import { popup_held } from "./Popup.ts";
import * as Screen from "../ui/Screen.ts";
import { GLYPH } from "../ui/Theme.ts";
import { term_send, type Form, type Span, type Target, type Term } from "./Term.ts";
import type { Query, Question } from "../ui/View.ts";


// the form's keys, at its foot: a question's, the answers'
const KEYS = "↑↓ move · Space pick · type your own · Enter next · Tab switch · Esc skip";
const SEND = "Enter send · Shift+Tab back · Esc skip";

// illi's questions, as the form asks them
type Asked = Question & { queries: Query[] };

// the question first asked, shown till it is answered or gone (while
// the leader waits for its key, after it)
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
    t.asking = { id: q.id, c: null, done: false, form: q.queries === undefined ? null : { tab: 0, top: 0, each: q.queries.map(() => ({ ed: Screen.ed_new(), at: 0, picked: [] })) }, shown: null };
    if (q.queries === undefined) {
      term_note(t, q.who + " asks to use " + q.tool + (q.what === "" ? "" : ": " + q.what) + (q.why === undefined || q.why === "" ? "." : ". Why: " + q.why));
    }
    if (!t.scr.tty) {
      return term_answer(t, q, false, false, "");
    }
  }
  if (!t.asking.done && t.asking.form === null && t.choose === null && !t.lead) {
    term_ask_open(t, q);
  }
}

// illi's questions open, and their form
export function term_form(t: Term): [Asked, Form] | null {
  const q = t.v.asks[0];
  const f = t.asking?.form ?? null;
  return f === null || q?.id !== t.asking!.id || q.queries === undefined ? null : [q as Asked, f];
}

// a key to illi's questions (true: taken). On a question, Up and Down
// move round its options and the words' row; Enter picks the lit option
// (of several, only while none is picked nor typed) and goes on; the
// rest edit the words, as the input's keys do. Tab and Shift+Tab (Left
// and Right off the words) go round the questions and the answers,
// where Enter sends them (no editing key reaches the input there). PgUp
// and Ctrl+Home go to the first row, PgDn and Ctrl+End to the last (the
// words'); Home and End edit the words there, else go so too. Esc,
// Ctrl+C and Ctrl+D skip them all; Enter does nothing while they are
// held (Popup.ts popup_held: just shown)
export function term_form_key(t: Term, press: string): boolean {
  const open = term_form(t);
  if (open === null) {
    return false;
  }
  const key    = press === "Ctrl+D" ? "Esc" : press;
  const [q, f] = open;
  const n      = q.queries.length;
  const e      = f.each[f.tab];
  const query  = q.queries[f.tab];
  const o      = query?.options.length ?? 0;
  const side   = e === undefined || e.at < o ? { Left: -1, Right: 1 } : {};
  const tab    = ({ Tab: 1, "Shift+Tab": -1, ...side } as Record<string, number>)[key];
  const row    = ({ Up: -1, Down: 1 } as Record<string, number>)[key];
  const ends   = ({ PgUp: 0, "Ctrl+Home": 0, PgDn: o, "Ctrl+End": o, ...(e === undefined || e.at < o ? { Home: 0, End: o } : {}) } as Record<string, number>)[key];
  if (key === "Esc" || key === "Ctrl+C") {
    term_answer(t, q, false, false, "");
  } else if (key === "Enter" && popup_held(t)) {
    return true;
  } else if (tab !== undefined) {
    f.tab = (f.tab + tab + n + 1) % (n + 1);
  } else if (e === undefined) {
    if (key === "Enter") {
      const said = term_said(q, f);
      term_answer(t, q, said !== "", false, said);
    }
    return key === "Enter" || row !== undefined || ends !== undefined || Screen.ed_key(Screen.ed_new(), key);
  } else if (row !== undefined) {
    e.at = (e.at + row + o + 1) % (o + 1);
  } else if (ends !== undefined) {
    e.at = ends;
  } else if (key === "Enter") {
    if (e.at < o && (!query.multi || (e.picked.length === 0 && e.ed.text.trim() === ""))) {
      e.picked = [e.at];
    }
    f.tab += 1;
  } else if (Screen.ed_key(e.ed, key)) {
    e.at = o;
  } else {
    return false;
  }
  return true;
}

// text typed at illi's questions (true: taken): a space on an option
// picks it (the one picked, but where several may be; again: not; held
// just shown, as Enter is: nothing), else to the words; on the answers,
// nowhere
export function term_form_type(t: Term, text: string): boolean {
  const open = term_form(t);
  if (open === null) {
    return false;
  }
  const [q, f] = open;
  const e      = f.each[f.tab];
  const query  = q.queries[f.tab];
  if (e === undefined) {
    return true;
  }
  if (text === " " && e.at < query.options.length) {
    if (popup_held(t)) {
      return true;
    }
    e.picked = e.picked.includes(e.at) ? e.picked.filter((k) => k !== e.at) : query.multi ? [...e.picked, e.at] : [e.at];
  } else {
    Screen.ed_type(e.ed, text);
    e.at = query.options.length;
  }
  return true;
}

// a paste at illi's questions: to the words of the one shown (true:
// taken; on the answers, nowhere)
export function term_form_paste(t: Term, text: string): boolean {
  const open = term_form(t);
  const e    = open?.[1].each[open[1].tab];
  if (open !== null && e !== undefined) {
    Screen.ed_paste(e.ed, text);
    e.at = open[0].queries[open[1].tab].options.length;
  }
  return open !== null;
}

// what was said to each question, as the model gets it (after View
// ANSWERED) and the chat shows it: the question, the options picked,
// the words written, else no answer; "": nothing said to any
function term_said(q: Asked, f: Form): string {
  const each = q.queries.map((query, k) => {
    const picked = [...f.each[k].picked].sort((a, b) => a - b).map((i) => query.options[i].label);
    const words  = Screen.ed_expand(f.each[k].ed, f.each[k].ed.text).trim();
    return [picked.length === 0 ? "" : "picked: " + picked.join(", "), words === "" ? "" : "wrote: " + words].filter((x) => x !== "");
  });
  return each.every((said) => said.length === 0) ? "" : q.queries.map((query, k) => [query.text, ...(each[k].length === 0 ? ["no answer"] : each[k])].join("\n")).join("\n\n");
}

// illi's questions laid out for their popup (Popup.ts), w columns
// inside, the words at most max lines, at tab `tab` (none: the one shown;
// null: none open): who asks (the popup's title); the tabs (the one shown
// lit, one answered ticked), wrapped, each where it is on its line (a
// click goes there); then the question, its options (the lit one marked,
// those picked filled; several: squares), the words' row as the input
// looks, each line with the row it stands for (a click takes it), or the
// answers, each under its question; and the keys, wrapped. The cursor in
// the words (on the answers: none)
export function term_form_lines(t: Term, w: number, max: number, tab?: number): { who: string; tabs: Paint.Line[]; spans: Span[][]; body: Array<[Paint.Line, Target | null]>; keys: Paint.Line[]; at: Screen.Spot | null } | null {
  const open = term_form(t);
  if (open === null) {
    return null;
  }
  const [q, f] = open;
  const shown  = tab ?? f.tab;
  const bold   = { ...Paint.INK, b: true };
  const accent = { ...bold, c: Draw.draw_tokens().accent };
  const said   = (k: number) => f.each[k].picked.length > 0 || f.each[k].ed.text.trim() !== "";
  const names  = [...q.queries.map((query, k) => (said(k) ? "✓ " : "") + Paint.text_clean(query.head)), "Review"];
  const tabs   = form_tabs(names.map((name, k) => Paint.Run(" " + name + " ", k === shown ? { ...bold, v: true } : k < q.queries.length && said(k) ? Paint.INK : Paint.DIM)), w);
  const keys   = (text: string) => Paint.runs_wrap([Paint.Run(text, Paint.DIM)], w, false);
  const plain  = (l: Paint.Line): [Paint.Line, null] => [l, null];
  const e      = f.each[shown];
  if (e === undefined) {
    const answer = (k: number) => {
      const picked = [...f.each[k].picked].sort((a, b) => a - b).map((i) => q.queries[k].options[i].label);
      const words  = Screen.ed_expand(f.each[k].ed, f.each[k].ed.text).trim();
      const lines  = [...(picked.length === 0 ? [] : [[Paint.Run("  ● ", accent), Paint.Run(Paint.text_clean(picked.join(", ")))]]), ...(words === "" ? [] : [[Paint.Run("  > ", Paint.DIM), Paint.Run(Paint.text_clean(words))]])];
      return lines.length === 0 ? [[Paint.Run("  no answer", Paint.DIM)]] : lines.flatMap((l) => Paint.runs_wrap(l, w, false));
    };
    const each = q.queries.flatMap((query, k) => [...Paint.runs_wrap([Paint.Run(Paint.text_clean(query.text), bold)], w, false), ...answer(k)]);
    return { who: q.who, ...tabs, body: each.map(plain), keys: keys(SEND), at: null };
  }
  const query  = q.queries[shown];
  const lead   = (k: number) => Paint.Run(k === e.at ? GLYPH.lit + " " : "  ", bold);
  const marks  = query.multi ? ["□ ", "■ "] : ["○ ", "● "];
  const option = (o: { label: string; about: string }, k: number) => {
    const runs = [Paint.Run(Paint.text_clean(o.label), k === e.at ? bold : Paint.INK), ...(o.about === "" ? [] : [Paint.Run("  " + Paint.text_clean(o.about), Paint.DIM)])];
    const rows = Paint.runs_wrap(runs, Math.max(1, w - 4), false);
    const mark = Paint.Run(marks[e.picked.includes(k) ? 1 : 0], e.picked.includes(k) ? accent : Paint.DIM);
    const aim: Target = { $: "row", k, tab: shown };
    return rows.map((l, j): [Paint.Line, Target] => [j === 0 ? [lead(k), mark, ...l] : [Paint.Run("    "), ...l], aim]);
  };
  const ask    = Paint.runs_wrap([Paint.Run(Paint.text_clean(query.text)), Paint.Run(query.multi ? "  pick any" : "  pick one", Paint.DIM)], w, false);
  const opts   = query.options.flatMap(option);
  const words  = Screen.screen_input({ ...t.scr, ed: e.ed }, w - 2, max, "Something else: type your own", false);
  const mine: Target = { $: "row", k: query.options.length, tab: shown };
  const own    = words.lines.map((l, j): [Paint.Line, Target] => [[j === 0 ? lead(query.options.length) : Paint.Run("  "), ...l], mine]);
  return { who: q.who, ...tabs, body: [...ask.map(plain), ...opts, ...own], keys: keys(KEYS), at: { row: ask.length + opts.length + words.at.row, col: 2 + words.at.col } };
}

// the form's tabs, each a run, laid on lines w wide a space apart (one
// too wide for the rest of a line starts the next), and where each is on
// its line (a click on it goes there)
function form_tabs(tabs: Paint.Run[], w: number): { tabs: Paint.Line[]; spans: Span[][] } {
  const lines: Paint.Line[] = [[]];
  const spans: Span[][]     = [[]];
  tabs.forEach((run, k) => {
    const tw = Paint.text_width(run.x);
    if (lines.at(-1)!.length > 0 && Paint.line_width(lines.at(-1)!) + 1 + tw > w) {
      lines.push([]);
      spans.push([]);
    }
    const line = lines.at(-1)!;
    const from = line.length === 0 ? 0 : Paint.line_width(line) + 1;
    line.push(...(line.length === 0 ? [] : [Paint.Run(" ")]), run);
    spans.at(-1)!.push({ col: from, to: from + tw, aim: { $: "tab", k } });
  });
  return { tabs: lines, spans };
}

// the picker for a question, which stays (Chooser stays): its answers,
// "don't ask again" only where it keeps something
function term_ask_open(t: Term, q: Question): void {
  const keep  = q.keep ?? "";
  const names = ["Yes", ...(keep === "" ? [] : ["Yes, and don't ask again for " + keep + " in this project"]), "No", "No, and say why"];
  const [always, no, why] = keep === "" ? [-1, 1, 2] : [1, 2, 3];
  const keys  = (_k: number, key: string) => {
    if (key !== "Esc") {
      return false;
    }
    t.choose = null;
    term_answer(t, q, false, false, "");
    return true;
  };
  const pick = (k: number) => {
    if (k === why) {
      term_ask(t, "Why not " + q.tool + "?", "your reason, for the model", "", "Enter send · Esc back", (why) => (term_answer(t, q, false, false, why), null));
      t.asking!.c = t.choose;
      return;
    }
    term_answer(t, q, k !== no, k === always, "");
  };
  const title = "Allow " + q.tool + (q.who === "illi" ? "" : " for " + q.who) + "?";
  const lead  = [...(q.what === "" ? [] : [[Paint.Run(Paint.text_clean(q.what), { ...Paint.INK, b: true })]]), ...(q.why === undefined || q.why === "" ? [] : [[Paint.Run("Why: ", Paint.DIM), Paint.Run(Paint.text_clean(q.why))]])];
  term_chooser(t, title, names, names.map(() => ""), -1, pick, { keys, lead, foot: () => "Esc no", stays: true });
  t.asking!.c = t.choose;
}

// a question answered; said: a no's reason, the answer to illi's own
function term_answer(t: Term, q: Question, yes: boolean, always: boolean, said: string): void {
  t.asking = { id: q.id, c: null, done: true, form: null, shown: null };
  term_send(t, { $: "answer", ask: q.id, yes, always, said });
}
