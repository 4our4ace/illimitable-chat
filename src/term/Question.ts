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
// and its keys. As tall as its lines, half the screen's rows at most (and
// no more than the rest of the screen leaves it: Frame.ts), the chat
// keeping the rest: too tall, its lead gives way, cut to fit, a dim line
// after it saying how much more, and scrolls by the wheel over it and
// PgUp, PgDn (too short for a line of it and that one, it gives way
// whole); its answers always show, each whole (one taller than ANSWER,
// naming what it keeps by a long command: its start and its end), on a
// screen too short for them a line each, as many as fit about the lit
// one; the form, as tall as its tallest tab (tabbing never moves the
// chat), its lines between its tabs and its keys scrolling, the lit row
// kept in view. Each row is one line, drawn once, no control character
// in it (its lead and names cleaned where laid out: question_lead,
// Popup.ts popup_name_lines), its lead laid out once a width (a command
// whole may run long: Tools.whole). Nothing is dimmed, and the input as
// typed is kept under it, back once it is answered. It has every key but
// Ctrl+L, Ctrl+Z, Ctrl+P and the leader (Keys.ts); Esc, Ctrl+C and
// Ctrl+D close it (the permission question's No, the form's skip; Ctrl+C
// copies text chosen instead, as ever). On its rows the row under the
// pointer lights and a click does what Enter does (Popup.ts popup_mouse;
// on a tab of the form, goes there), the wheel scrolls its lead or the
// form's lines (its answers never move by it); all else on the screen
// works as with no question (the wheel scrolls the chat, text is chosen
// and copied, the side and the tabs answer; a click outside never answers
// it). A question illi asks (the permission question, its form) holds
// Enter, Space and a click for ARM after it first shows (question_held),
// so the key that ended a sentence never answers it; Esc, its no, never
// waits.

import { term_form, term_form_lines } from "./Asks.ts";
import * as Paint from "../ui/Paint.ts";
import { STEP, popup_at, popup_entries, popup_foot, popup_rows, popup_view } from "./Popup.ts";
import * as Screen from "../ui/Screen.ts";
import type { Box, Chooser, Form, Target, Term } from "./Term.ts";

// how long a question just shown holds Enter, Space and a click (ms):
// less than it takes to read it
const ARM = 500;

// the most lines an answer takes: one taller (one naming what it keeps
// by a long command, which the lead shows) shows its first lines and,
// after an ellipsis, how it ends (its scope)
const ANSWER = 3;

// the leads as laid out last (question_lead), by the lead and its width
const LEADS = new WeakMap<Paint.Line[], { w: number; lines: Paint.Line[] }>();

// a question laid out at the input: what it was laid out for (its
// picker, illi's form), the rule over it, its lines and what each stands
// for (Box rows), the cursor's spot in them (null: hidden), its answers
// and lead as laid out (Box's)
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

// the most lines a question takes on a screen h rows tall, free of them
// for it (Frame.ts: all but those the rest of the screen keeps), one at
// least; and of them the most a line typed takes
function question_most(h: number, free: number): number {
  return Math.max(1, Math.min(Math.floor(h / 2), free));
}

function question_words(h: number): number {
  return Math.max(1, Math.floor(h / 4));
}

// the question at the input laid out, w wide, on a screen h rows tall,
// free of them for it (none: null)
export function question_laid(t: Term, w: number, h: number, free: number): Asked | null {
  const f = term_form(t)?.[1] ?? null;
  return t.question !== null ? question_picker(t, t.question, w, h, free) : f !== null ? question_form(t, f, w, h, free) : null;
}

// a question's picker laid out w wide, on a screen h rows tall, free of
// them for it: over its answers (or the line asked) the lines leading
// them (Chooser lead: why it asks, what it would do; question_lead), from
// those scrolled past (Chooser past), as many as leave its answers room
// in question_most; cut, a dim line after them says how many more follow
// (none: how many are above) and how they scroll, so a cut lead takes two
// lines at least, else gives way whole (with one line free, that line
// alone says how many there are). Its answers as a list's options are
// (Popup.ts popup_rows), the lit one marked, each whole up to
// question_cap's lines (past them: question_cut), all of them (on a
// screen too short for them: question_view); a line asked, as the input
// shows a message typed (its hint while empty), question_words at most
// (its cursor's and those before), the cursor in it. Its rule: its title,
// then its keys (where it has answers) and what the lit one takes besides
// (its foot; a line's: what it takes, or why it won't do), then Esc, the
// no every question takes, unless the foot says it already
function question_picker(t: Term, c: Chooser, w: number, h: number, free: number): Asked {
  const lead  = c.lead === undefined ? [] : question_lead(c.lead, w);
  const list  = popup_entries(c);
  const most  = question_most(h, free);
  const each  = c.ask !== null ? [] : popup_rows(c, list, list.map((_, e) => e), w);
  const cap   = question_cap(each.map((e) => e.length), most - Math.min(lead.length, 2));
  const cut   = each.map((lines, e) => question_cut(lines, typeof list[e] === "number" ? c.names[c.shown[list[e]].k] : "", cap, w));
  const view  = question_view(c, list, cut.map((lines) => lines.length), most);
  const opts  = view.flatMap((e) => cut[e]);
  const line  = c.ask === null ? null : Screen.screen_input({ ...t.scr, ed: c.find! }, w, question_words(h), c.ask.hint, false);
  const ends  = line === null ? opts.length : line.lines.length;
  const fit   = Math.max(0, most - ends);
  const ahead = lead.length <= fit ? lead.length : Math.max(0, fit - 1);
  const past  = ahead === 0 ? 0 : (c.past = Math.max(0, Math.min(c.past ?? 0, lead.length - ahead)));
  const below = lead.length - past - ahead;
  const said  = below > 0 ? below.toLocaleString("en-US") + (below === 1 ? " more line" : " more lines") : past.toLocaleString("en-US") + (past === 1 ? " line above" : " lines above");
  const more  = ahead < lead.length && fit > 0 ? [[Paint.Run("… " + said + (ahead > 0 ? " · wheel, PgUp/PgDn" : ""), Paint.DIM)]] : [];
  const read  = [...lead.slice(past, past + ahead), ...more];
  const rows  = [...read.map(() => null), ...(line === null ? opts.map(([, aim]) => aim) : line.lines.map(() => null))];
  const at    = line === null ? null : { row: read.length + line.at.row, col: line.at.col };
  const foot  = popup_foot(c);
  const rule  = question_rule(w, c.title, [c.ask === null ? "↑↓ Enter" : "", foot, /\bEsc\b/.test(foot) ? "" : "Esc"]);
  return { of: c, rule, lines: [...read, ...(line === null ? opts.map(([l]) => l) : line.lines)], rows, at, shape: { list: read.length, lines: opts.length, tall: view.length, ahead, lead: lead.length } };
}

// the lines leading a question's answers (Chooser lead) wrapped w wide,
// each run cleaned as text is (Paint.text_clean: no control character
// reaches the screen, whoever made them); made once a lead and width, as
// a paint lays the question out again and again and a command whole may
// run to many lines
function question_lead(lead: Paint.Line[], w: number): Paint.Line[] {
  const known = LEADS.get(lead);
  if (known?.w === w) {
    return known.lines;
  }
  const lines = lead.flatMap((l) => Paint.runs_wrap(l.map((r) => ({ ...r, x: Paint.text_clean(r.x) })), Math.max(1, w), false));
  LEADS.set(lead, { w, lines });
  return lines;
}

// a question's answers in view (their entries' indices in list; tall:
// each one's lines): all of them, as fit in most lines; on a screen too
// short for them (more answers than its rows), as many as fit, the lit
// one among them, as a list scrolls (Popup.ts popup_view)
function question_view(c: Chooser, list: Array<string | number>, tall: number[], most: number): number[] {
  if (tall.reduce((n, x) => n + x, 0) <= most) {
    c.top = 0;
    return list.map((_, e) => e);
  }
  return popup_view(c, list, tall, most);
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

// illi's form laid out w wide, on a screen h rows tall, free of them
// for it (Asks.ts term_form_lines, the words question_words at most): as
// tall as its tallest tab (the answers' too), question_most at most, so
// going from tab to tab moves nothing; its tabs hold at its top and its
// keys at its foot (the room allowing), its lines between scroll (Form
// top), kept to show the lit row (question_row; the answers have none:
// only the wheel scrolls them), a shorter tab's blank under them. The
// cursor in the words, while they show. Its rule: who asks
function question_form(t: Term, f: Form, w: number, h: number, free: number): Asked {
  const max  = question_words(h);
  const tabs = Array.from({ length: f.each.length + 1 }, (_, k) => term_form_lines(t, w, max, k)!);
  const tall = Math.min(question_most(h, free), Math.max(...tabs.map((e) => e.tabs.length + e.body.length + e.keys.length)));
  const laid = tabs[f.tab];
  const head = laid.tabs.slice(0, tall);
  const keys = laid.keys.slice(0, Math.max(0, tall - head.length - 1));
  const room = Math.max(0, tall - head.length - keys.length);
  const e    = f.each[f.tab];
  const keep = e === undefined ? null : question_row(laid.body, laid.at, e.at);
  const top  = Math.max(0, Math.min(f.top, laid.body.length - room));
  f.top      = keep === null ? top : Math.max(0, Math.min(keep[0], Math.max(top, keep[1] - room + 1)));
  const view = laid.body.slice(f.top, f.top + room);
  const pad  = Array.from({ length: room - view.length }, (): [Paint.Line, null] => [[], null]);
  const cur  = laid.at;
  const at   = cur === null || cur.row < f.top || cur.row >= f.top + room ? null : { row: head.length + cur.row - f.top, col: cur.col };
  const rows = [...laid.spans.slice(0, head.length), ...[...view, ...pad].map(([, aim]) => aim), ...keys.map(() => null)];
  return { of: f, rule: question_rule(w, laid.who + " asks", []), lines: [...head, ...[...view, ...pad].map(([l]) => l), ...keys], rows, at, shape: { list: head.length, lines: room, tall: laid.body.length, ahead: 0, lead: 0 } };
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
