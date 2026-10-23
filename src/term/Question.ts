// Question
// ========
// A question takes the input's place (Frame.ts): anything that asks the
// person to decide, whether illi asks or a command confirms. Its picker
// (Term question, never a list's popup): the permission question
// (Asks.ts), a confirmation (Switch to X?, Delete profile X?, Forget X?,
// Read-only mode refused it, what a new profile starts with), a line
// asked for (Commands.ts term_ask: a name, a path, why not); else illi's
// own questions, their form (Asks.ts). The lists a person opens are
// popups (Popup.ts); one opened over a question (Ctrl+P) shows over it,
// the question back as it closes. A question has the rows between the
// rules round the input, its full width (under the side panel too): the
// rule over it says its title (the form's: who asks), its keys and what
// the lit answer takes besides (its foot); under it, the lines leading
// its answers (why it asks; what it would do, bold), then its answers,
// the lit one marked, or the line asked, as the input shows a message
// typed; the form, its tabs, the question shown, its options, its words
// and its keys. As tall as its lines, half the screen's rows at most,
// the chat keeping the rest: too tall, its lead gives way, cut to fit, a
// dim line after it saying how much more, and scrolls by the wheel over
// it and PgUp, PgDn; its answers always show, each whole (one taller
// than ANSWER, naming what it keeps by a long command: its start and its
// end); the form's lines between its tabs and its keys scroll, the lit
// row kept in view. Each row is one line, drawn once, no control
// character in it (Popup.ts popup_name_lines). Nothing is dimmed, and
// the input as typed is kept under it, back once it is answered. It has
// every key but Ctrl+L, Ctrl+Z, Ctrl+P and the leader (Keys.ts); Esc,
// Ctrl+C and Ctrl+D close it (the permission question's No, the form's
// skip; Ctrl+C copies text chosen instead, as ever). On its rows the row
// under the pointer lights and a click does what Enter does (Popup.ts
// popup_mouse; on a tab of the form, goes there), the wheel scrolls its
// lead or the form's lines; all else on the screen works as with no
// question (the wheel scrolls the chat, text is chosen and copied, the
// side and the tabs answer; a click outside never answers it). A
// question illi asks (the permission question, its form) holds Enter,
// Space and a click for ARM after it first shows (question_held), so the
// key that ended a sentence never answers it; Esc, its no, never waits.

import { term_form, term_form_lines } from "./Asks.ts";
import * as Paint from "../ui/Paint.ts";
import { STEP, popup_at, popup_entries, popup_foot, popup_rows } from "./Popup.ts";
import * as Screen from "../ui/Screen.ts";
import type { Box, Chooser, Form, Target, Term } from "./Term.ts";

// how long a question just shown holds Enter, Space and a click (ms):
// less than it takes to read it
const ARM = 500;

// the most lines an answer takes: one taller (one naming what it keeps
// by a long command, which the lead shows) shows its first lines and,
// after an ellipsis, how it ends (its scope)
const ANSWER = 3;

// a question laid out at the input: what it was laid out for (its
// picker, illi's form), the rule over it, its lines and what each stands for (Box
// rows), the cursor's spot in them (null: hidden), its answers and lead
// as laid out (Box's)
export type Asked = { of: object; rule: Paint.Line; lines: Paint.Line[]; rows: Box["rows"]; at: Screen.Spot | null; shape: Pick<Box, "list" | "lines" | "tall" | "ahead" | "lead"> };

// the question shown at the input: its picker, else illi's form (null:
// none)
export function question_of(t: Term): Chooser | Form | null {
  return t.question ?? term_form(t)?.[1] ?? null;
}

// whether the chat's question (t.asking: the permission question, the
// line it asks why, illi's form) is the one shown, no list over it
function question_illi(t: Term): boolean {
  const a = t.asking;
  return a != null && !a.done && t.choose === null && (t.question !== null ? t.question === a.c : term_form(t) !== null);
}

// a paint: the chat's question shown stamped as it first shows
// (t.asking.shown), the stamp kept while it shows (the line asked why,
// another of the form's tabs too); hidden (a list over it, another
// question in its place, another profile shown in the window:
// Member.ts), it shows anew after
export function question_shown(t: Term): void {
  if (t.asking != null) {
    t.asking.shown = question_illi(t) ? t.asking.shown ?? Date.now() : null;
  }
}

// whether the chat's question still holds Enter, Space and a click: till
// ARM after it first showed, as painted (not painted yet: held, as one
// read may bring the question and the keys after it)
export function question_held(t: Term): boolean {
  const a = t.asking;
  return question_illi(t) && (a!.shown == null || Date.now() - a!.shown < ARM);
}

// the most lines a question takes on a screen h rows tall (more only for
// more answers than that, a line each), and of them the most a line
// typed takes
function question_most(h: number): number {
  return Math.max(1, Math.floor(h / 2));
}

function question_words(h: number): number {
  return Math.max(1, Math.floor(h / 4));
}

// the question at the input laid out, w wide, on a screen h rows tall
// (none: null)
export function question_laid(t: Term, w: number, h: number): Asked | null {
  const f = term_form(t)?.[1] ?? null;
  return t.question !== null ? question_picker(t, t.question, w, h) : f !== null ? question_form(t, f, w, h) : null;
}

// a question's picker laid out w wide, on a screen h rows tall: over its
// answers (or the line asked) the lines leading them (Chooser lead: why
// it asks, what it would do), wrapped, from those scrolled past (Chooser
// past), as many as leave its answers room in question_most (a line at
// least); cut, a dim line after them says how many more follow (none:
// how many are above) and how they scroll. Its answers as a list's
// options are (Popup.ts popup_rows), all of them, the lit one marked,
// each whole up to question_cap's lines (past them: question_cut); a line
// asked, as the input shows a message typed (its hint while empty),
// question_words at most (its cursor's and those before), the cursor in
// it. Its rule: its title, then its keys (where it has answers) and what
// the lit one takes besides (its foot; a line's: what it takes, or why it
// won't do)
function question_picker(t: Term, c: Chooser, w: number, h: number): Asked {
  const lead  = (c.lead ?? []).flatMap((l) => Paint.runs_wrap(l, Math.max(1, w), false));
  const list  = popup_entries(c);
  const most  = question_most(h);
  const each  = c.ask !== null ? [] : list.map((_, e) => popup_rows(c, list, [e], w));
  const cap   = question_cap(each.map((e) => e.length), most - Math.min(lead.length, 2));
  const opts  = each.flatMap((lines, e) => question_cut(lines, typeof list[e] === "number" ? c.names[c.shown[list[e]].k] : "", cap, w));
  const line  = c.ask === null ? null : Screen.screen_input({ ...t.scr, ed: c.find! }, w, question_words(h), c.ask.hint, false);
  const ends  = line === null ? opts.length : line.lines.length;
  const fit   = Math.max(0, most - ends);
  const ahead = lead.length <= fit ? lead.length : Math.max(1, fit - 1);
  const past  = (c.past = Math.max(0, Math.min(c.past ?? 0, lead.length - ahead)));
  const below = lead.length - past - ahead;
  const said  = below > 0 ? below + (below === 1 ? " more line" : " more lines") : past + (past === 1 ? " line above" : " lines above");
  const more  = ahead < lead.length ? [[Paint.Run("… " + said + " · wheel, PgUp/PgDn", Paint.DIM)]] : [];
  const read  = [...lead.slice(past, past + ahead), ...more];
  const rows  = [...read.map(() => null), ...(line === null ? opts.map(([, aim]) => aim) : line.lines.map(() => null))];
  const at    = line === null ? null : { row: read.length + line.at.row, col: line.at.col };
  const rule  = question_rule(w, c.title, [c.ask === null ? "↑↓ Enter" : "", popup_foot(c)]);
  return { of: c, rule, lines: [...read, ...(line === null ? opts.map(([l]) => l) : line.lines)], rows, at, shape: { list: read.length, lines: opts.length, tall: list.length, ahead, lead: lead.length } };
}

// the most lines each answer takes (tall: each one's lines), ANSWER at
// most, fewer while they would take more than room (the lead's first
// line and the one saying it is cut left out of question_most); one
// each at least
function question_cap(tall: number[], room: number): number {
  let cap = ANSWER;
  while (cap > 1 && tall.reduce((n, x) => n + Math.min(x, cap), 0) > room) {
    cap--;
  }
  return cap;
}

// an answer's lines (each with what it stands for; its name's), cap at
// most: taller, its first lines and then how its name ends (its scope:
// "in this project"), after an ellipsis, as much as a line holds; cap 1:
// its first line, an ellipsis at its end. w wide
function question_cut(lines: Array<[Paint.Line, Target | null]>, name: string, cap: number, w: number): Array<[Paint.Line, Target | null]> {
  if (lines.length <= cap) {
    return lines;
  }
  const aim  = lines[0][1];
  const pad  = lines[1][0][0];
  const said = Paint.text_clean(name);
  const room = Math.max(1, w - Paint.text_width(pad.x) - 1);
  const ends = Paint.line_cut([Paint.Run(said, lines.at(-1)![0].at(-1)!.s)], Paint.text_width(said) - room, Infinity)[1];
  const cut  = [...Paint.line_cut(lines[0][0], 0, w - 1)[1], Paint.Run("…", Paint.DIM)];
  return cap === 1 ? [[cut, aim]] : [...lines.slice(0, cap - 1), [[pad, Paint.Run("…", Paint.DIM), ...ends], aim]];
}

// illi's form laid out w wide, on a screen h rows tall (Asks.ts
// term_form_lines, the words question_words at most): as tall as the tab
// shown, question_most at most; its tabs hold at its top and its keys at
// its foot (the room allowing), its lines between scroll (Form top),
// kept to show the lit row (question_row; the answers have none: only
// the wheel scrolls them). The cursor in the words, while they show. Its
// rule: who asks
function question_form(t: Term, f: Form, w: number, h: number): Asked {
  const laid = term_form_lines(t, w, question_words(h))!;
  const most = question_most(h);
  const head = laid.tabs.slice(0, most);
  const keys = laid.keys.slice(0, Math.max(0, most - head.length - 1));
  const room = Math.max(0, Math.min(laid.body.length, most - head.length - keys.length));
  const e    = f.each[f.tab];
  const keep = e === undefined ? null : question_row(laid.body, laid.at, e.at);
  const top  = Math.max(0, Math.min(f.top, laid.body.length - room));
  f.top      = keep === null ? top : Math.max(0, Math.min(keep[0], Math.max(top, keep[1] - room + 1)));
  const view = laid.body.slice(f.top, f.top + room);
  const cur  = laid.at;
  const at   = cur === null || cur.row < f.top || cur.row >= f.top + room ? null : { row: head.length + cur.row - f.top, col: cur.col };
  const rows = [...laid.spans.slice(0, head.length), ...view.map(([, aim]) => aim), ...keys.map(() => null)];
  return { of: f, rule: question_rule(w, laid.who + " asks", []), lines: [...head, ...view.map(([l]) => l), ...keys], rows, at, shape: { list: head.length, lines: room, tall: laid.body.length, ahead: 0, lead: 0 } };
}

// the lines row k of illi's form takes in its lines as laid out (body,
// the cursor at `at`): its first, its last (the words', the last row:
// their cursor's line); none such: null
function question_row(body: Array<[Paint.Line, Target | null]>, at: Screen.Spot | null, k: number): [number, number] | null {
  const words = body.at(-1)?.[1];
  if (at !== null && words?.$ === "row" && words.k === k) {
    return [at.row, at.row];
  }
  const on = body.flatMap(([, aim], j) => (aim?.$ === "row" && aim.k === k ? [j] : []));
  return on.length === 0 ? null : [on[0], on.at(-1)!];
}

// the rule over a question, w wide, as the rule over the input starts:
// its title, bold, then what it says besides ("": nothing), dim, a dot
// before each; too wide, cut at its end, an ellipsis there
function question_rule(w: number, title: string, said: string[]): Paint.Line {
  const room = w - 6;
  const runs = [Paint.Run(Paint.text_clean(title), { ...Paint.INK, b: true }), Paint.Run(said.filter((x) => x !== "").map((x) => " · " + Paint.text_clean(x)).join(""), Paint.DIM)];
  const fits = Paint.line_width(runs) <= room ? runs : [...Paint.line_cut(runs, 0, Math.max(0, room - 1))[1], Paint.Run("…", Paint.DIM)];
  return [Paint.Run("── ", Paint.DIM), ...fits, Paint.Run(" " + "─".repeat(Math.max(0, w - 4 - Paint.line_width(fits))), Paint.DIM)];
}

// the question at the input as painted, its first line on screen row
// `row`, column `col`, w wide, kept (t.box: the mouse over it is
// Popup.ts's); the pointer's row seen as it first shows (it lights a row
// once it moves)
export function question_kept(t: Term, asked: Asked, row: number, col: number, w: number): void {
  const was = t.box?.of === asked.of;
  t.box     = { of: asked.of, row, col, w, h: asked.lines.length, inset: 0, rows: asked.rows, ...asked.shape };
  if (!was) {
    t.aim.row = t.scr.point.row;
    t.aim.in  = popup_at(t.box, t.scr.point) !== "out";
  }
}

// whether the pointer is on the question at the input, as last painted
export function question_over(t: Term): boolean {
  const of = question_of(t);
  return of !== null && t.box?.of === of && popup_at(t.box, t.scr.point) !== "out";
}

// a turn of the wheel over illi's form (d -1: up), as last painted (none
// yet: nothing): its lines under the tabs scrolled STEP (a third of those
// shown, on a short one), stopping at their ends. On a question, with
// the pointer on a row that shows whole (the words: their cursor's line),
// that row lit; else, the lit one gone from view, the nearest still in
// it (none shows whole: nothing moves), so what is lit always shows
export function question_form_wheel(t: Term, d: number): void {
  const f   = term_form(t)?.[1] ?? null;
  const box = f !== null && t.box?.of === f ? t.box : null;
  if (f === null || box === null) {
    return;
  }
  const laid  = term_form_lines(t, box.w, question_words(Screen.screen_size().h))!;
  const step  = Math.max(1, Math.min(STEP, Math.floor(box.lines / 3)));
  const top   = Math.max(0, Math.min(laid.body.length - box.lines, f.top + d * step));
  const e     = f.each[f.tab];
  const shows = (k: number) => {
    const rows = question_row(laid.body, laid.at, k);
    return rows !== null && rows[0] >= top && rows[1] < top + box.lines;
  };
  if (top === f.top || e === undefined) {
    f.top = top;
    return;
  }
  const p     = t.scr.point;
  const line  = p.row - box.row - box.list;
  const over  = line >= 0 && line < box.lines && p.col >= box.col && p.col < box.col + box.w;
  const under = over ? laid.body[top + line]?.[1] : undefined;
  const words = laid.body.at(-1)?.[1];
  const all   = Array.from({ length: words?.$ === "row" ? words.k + 1 : 0 }, (_, k) => k).filter(shows);
  const lit   = under?.$ === "row" && shows(under.k) ? under.k : shows(e.at) ? e.at : question_row(laid.body, laid.at, e.at)![0] < top ? all[0] : all.at(-1);
  if (lit !== undefined) {
    e.at  = lit;
    f.top = top;
  }
}
