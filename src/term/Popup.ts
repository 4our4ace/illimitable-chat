// Popup
// =====
// Every list a person picks from opens in one popup (term_popup): the
// picker of a list (Term.ts Chooser: /model, /settings, /profile, Ctrl+P
// and the rest), else illi's own questions (their form: Asks.ts), in the
// screen's middle whatever the side panel does, over the rest of the
// screen dimmed in one ink (the backdrop: a pane, the input as typed, a
// question at the input), the box on a background of its own. The other
// questions take the input's place instead (Question.ts). One rule
// places and sizes a popup, from the screen and what it shows alone
// (popup_size): as wide as its options' names ask, POP_MIN at least,
// what they say widening it to POP_CAP (the form: the room's full
// width), the room allowing; as tall as its lines, every option counted
// as unsearched (a search shows fewer in the same box; the form as its
// tallest tab), SHARE of the screen's rows at most (the form: all but
// two); centered, the head row and the bottom line left uncovered. While
// it stays open it only grows (a value stepped wider), never shrinks; a
// new size measures it afresh. A name is never cut: what an option is
// gives way first, then its aside, and on a screen too narrow for it the
// name wraps, under itself. While it is open it has every key (Keys.ts),
// the wheel and the pages moving in it (popup_wheel, popup_page; the
// form's lines under its tabs scroll: popup_form_wheel), and the whole
// mouse (popup_mouse): the pointer moving to a row lights it (one lit
// row, shared with the keys), a click on an option does what Enter does
// there (in the form, Space where any may be picked; on a tab, that
// tab), a click outside closes a list (the form stays), the click that
// only focuses the terminal does nothing; nothing reaches the chat, a
// pane, the side, the tabs or the input under it (no button lights, no
// text is chosen), and a paste goes to its search or words, if any.
// What is at the input takes only the mouse on it: the question there
// (the row under the pointer lit, a press on an answer its; its lead's
// text may be chosen), the commands suggested as a /word is typed (no
// popup, they belong to typing, but a press on them is theirs: no text
// chosen; a click does what Enter does there). Panes stay in the chat's
// place.

import { term_asks, term_form, term_form_key, term_form_lines, term_form_type } from "./Asks.ts";
import { term_suggest, term_suggest_key } from "./Commands.ts";
import * as Draw from "../ui/Draw.ts";
import { MARGIN, term_draw } from "./Frame.ts";
import { term_choose_key } from "./Keys.ts";
import * as Paint from "../ui/Paint.ts";
import { term_let_go } from "./Select.ts";
import * as Screen from "../ui/Screen.ts";
import { question_of } from "./Question.ts";
import type { Box, Chooser, Form, Target, Term } from "./Term.ts";
import { GLYPH } from "../ui/Theme.ts";

// the narrowest a popup is (a two-option list still reads as one), the
// widest what its options say widens it (a wide screen draws no table
// across itself; a name is never held to it): each the room allowing
const POP_MIN = 40;
const POP_CAP = 96;

// the share of the screen's rows a list takes at most (all but two on
// a short screen, LEAST at least; illi's form, all but two always); the
// lines its list keeps before the lit one's detail takes any
const SHARE = 0.6;
const LEAST = 10;
const KEEP  = 6;

// how far from the background all else under a popup is drawn (the
// backdrop), and the box's own background (a pane's too), toward white
// (toward black on a light one)
const BACKDROP = 0.16;
export const PANEL = 0.05;

// the least of an option's next column shown cut (popup_about)
const CUT = 8;

// the most entries a turn of the wheel scrolls a list (fewer on a short
// one: a third of those shown, one at least)
const STEP = 3;

// what the pointer is on in a popup, as painted: a row's target, the box
// (its frame, a head, a blank), or outside it
type Pointed = Target | "box" | "out";

// a popup's place on the screen: its top row, its first column, its
// width and height
type Place = { row: number; col: number; w: number; h: number };

// a popup's list as laid out (Box's): the box's row its list starts at,
// its lines, the entries they show; no lines lead it (none shown, of
// none: only a question's lead, Question.ts)
type Shape = Pick<Box, "list" | "lines" | "tall" | "ahead" | "lead">;

// a popup laid out: its place, its lines framed, what each stands for
// (Box rows), the cursor's spot in it (none: it takes no typing), its
// Shape
type Laid = { place: Place; lines: Paint.Line[]; rows: Box["rows"]; at?: Screen.Spot; shape: Shape };

// what a popup's content asks of its box, in columns with its frame: its
// options' names whole, with their marks (names); all it shows whole
// (wants); the least it takes (least); its rows with its frame at an
// inner width (tall); whether it is illi's form (stays: all but two of
// the screen's rows)
type Measure = { names: number; wants: number; least: number; tall: (iw: number) => number; stays: boolean };

// the popup open: a list's picker, else illi's questions (their form,
// over a pane too); none: null
export function term_popup(t: Term): "list" | "form" | null {
  return t.choose !== null ? "list" : term_form(t) !== null ? "form" : null;
}

// what the popup open is (a list's picker, illi's form; none: null), as
// its box keeps it
function popup_of(t: Term): object | null {
  return t.choose ?? term_form(t)?.[1] ?? null;
}

// a popup's place and size on a screen w by h, from its measure alone
// (never the side panel, the input or the chat): as wide as its names
// ask, its least at least, what it shows widening it to POP_CAP, and as
// wide as it was (was: it only grows while open), the room allowing
// (MARGIN each side, the last column blank); as tall as its rows, SHARE
// of the screen's at most (all but two on a short screen, LEAST at
// least; illi's form, all but two); centered, under the head row and
// over the bottom line
export function popup_size(m: Measure, w: number, h: number, was = 0): Place {
  const full = w - 1;
  const room = full - 2 * MARGIN;
  const bw   = Math.max(5, Math.min(room, Math.max(m.least, m.names, Math.min(m.wants, POP_CAP), was)));
  const most = m.stays ? h - 2 : Math.max(Math.min(h - 2, LEAST), Math.floor(SHARE * h));
  const bh   = Math.max(3, Math.min(most, m.tall(bw - 4)));
  return { row: Math.max(1, Math.floor((h - bh) / 2)), col: Math.max(0, Math.floor((full - bw) / 2)), w: bw, h: bh };
}

// the popup over the screen's rows as painted (w columns, h rows): all
// else re-inked in one ink near the background (the backdrop; dim, the
// background not told), the box on a background of its own, at its
// place (popup_size; as wide as it was painted last, if it is still the
// one open: illi's form, as tall); kept as painted (t.box), the
// pointer's row seen as it first shows (it lights a row once it moves).
// The cursor's spot in it, if it takes the typing (null: none)
export function popup_paint(t: Term, rows: Screen.Piece[][], w: number, h: number): Screen.Spot | null {
  const of    = popup_of(t)!;
  const was   = t.box?.of === of ? t.box : null;
  const box   = t.choose !== null ? popup_picker(t.choose, w, h, was?.w ?? 0) : popup_form(t, of as Form, w, h, was?.h ?? 0);
  const at    = box.place;
  const fade  = Draw.draw_off(t.scr.canvas, BACKDROP);
  const panel = Draw.draw_off(t.scr.canvas, PANEL);
  const ink   = fade === undefined ? Paint.DIM : { ...Paint.INK, c: fade };
  for (const piece of rows.flat()) {
    piece.line = piece.line.map((run) => ({ ...run, s: ink }));
  }
  box.lines.forEach((line, k) => {
    rows[at.row + k].push({ col: at.col, w: at.w, line: panel === undefined ? line : line.map((r) => ({ ...r, s: { ...r.s, g: panel } })) });
  });
  t.box = { of, ...at, inset: 2, rows: box.rows, ...box.shape };
  if (was === null) {
    t.aim.row = t.scr.point.row;
    t.aim.in  = popup_at(t.box, t.scr.point) !== "out";
  }
  return box.at === undefined ? null : { row: at.row + box.at.row, col: at.col + box.at.col };
}

// the picker laid out on a screen w by h, as wide as it was (was)
function popup_picker(c: Chooser, w: number, h: number, was: number): Laid {
  const place = popup_size(popup_measure(c), w, h, was);
  return { place, ...popup_list(c, place.w, place.h) };
}

// illi's form laid out on a screen w by h (Asks.ts term_form_lines), as
// tall as it was (was: it only grows while open): the room's full width
// (what will be typed isn't known); as tall as its tallest tab (the
// answers' too: going from tab to tab never moves it; a shorter one blank
// under), all but two of the screen's rows at most; centered as any
// popup (popup_size), framed, who asks its title. Its tabs hold at its
// top and its keys at its foot (the room allowing); its lines between
// scroll (Form top), kept to show the lit row (popup_form_row; the
// answers have none: only the wheel scrolls them). The cursor in the
// words, while they show
function popup_form(t: Term, f: Form, w: number, h: number, was: number): Laid {
  const max   = popup_words(h);
  const tabs  = Array.from({ length: f.each.length + 1 }, (_, k) => k);
  const tall  = (iw: number) => Math.max(was, ...tabs.map((k) => {
    const each = term_form_lines(t, iw, max, k)!;
    return 2 + each.tabs.length + each.body.length + each.keys.length;
  }));
  const place = popup_size({ names: 0, wants: 0, least: w, tall, stays: true }, w, h);
  const iw    = place.w - 4;
  const laid  = term_form_lines(t, iw, max)!;
  const inner = place.h - 2;
  const head  = laid.tabs.slice(0, inner);
  const keys  = laid.keys.slice(0, Math.max(0, inner - head.length - 1));
  const room  = Math.max(0, inner - head.length - keys.length);
  const e     = f.each[f.tab];
  const keep  = e === undefined ? null : popup_form_row(laid.body, laid.at, e.at);
  const top   = Math.max(0, Math.min(f.top, laid.body.length - room));
  f.top       = keep === null ? top : Math.max(0, Math.min(keep[0], Math.max(top, keep[1] - room + 1)));
  const view  = laid.body.slice(f.top, f.top + room);
  const blank = Array.from({ length: room - view.length }, (): [Paint.Line, null] => [[], null]);
  const title = [Paint.Run(popup_cut(" " + laid.who + " asks ", iw + 1), { ...Paint.DIM, b: true })];
  const lines = Paint.frame([...head, ...[...view, ...blank].map(([l]) => l), ...keys], place.w, title);
  const rows  = [null, ...laid.spans.slice(0, head.length), ...[...view, ...blank].map(([, aim]) => aim), ...keys.map(() => null), null];
  const cur   = laid.at;
  const at    = cur === null || cur.row < f.top || cur.row >= f.top + room ? undefined : { row: 1 + head.length + cur.row - f.top, col: 2 + cur.col };
  return { place, lines, rows, at, shape: { list: 1 + head.length, lines: room, tall: laid.body.length, ahead: 0, lead: 0 } };
}

// the most lines the words typed at illi's questions take, on a screen
// h rows tall
function popup_words(h: number): number {
  return Math.max(1, Math.floor(h / 4));
}

// the lines row k of illi's form takes in its lines as laid out (body,
// the cursor at `at`): its first, its last (the words', the last row:
// their cursor's line); none such: null
function popup_form_row(body: Array<[Paint.Line, Target | null]>, at: Screen.Spot | null, k: number): [number, number] | null {
  const words = body.at(-1)?.[1];
  if (at !== null && words?.$ === "row" && words.k === k) {
    return [at.row, at.row];
  }
  const on = body.flatMap(([, aim], j) => (aim?.$ === "row" && aim.k === k ? [j] : []));
  return on.length === 0 ? null : [on[0], on.at(-1)!];
}

// what a list's picker asks of its box (popup_size): each option's name
// whole with its marks; each option whole (its name, what it is from one
// column for all, its aside two spaces after), its title with its keys,
// its foot, its search with its hint, each option's detail as wide as it
// would be. Its rows: its frame, the search, every option (its name
// wrapped, if it must) with its groups' heads and gaps as unsearched, and
// the lit one's detail after a blank line, as tall as any option's
function popup_measure(c: Chooser): Measure {
  const lw    = Paint.text_width(Paint.lit_lead(true));
  const mark  = c.here < 0 ? 0 : 2;
  const wide  = Math.max(0, ...c.names.map((name) => popup_name_width(c, name)));
  const whole = c.names.map((_, k) => {
    const about = Paint.text_width(Paint.text_clean(c.about[k]));
    const side  = Paint.text_width(Paint.text_clean(c.aside?.[k] ?? ""));
    return lw + mark + wide + (about === 0 ? 0 : 2 + about) + (side === 0 ? 0 : 2 + side);
  });
  const title = Paint.text_width(popup_title(c, Infinity)) + 3;
  const foot  = popup_foot(c);
  const hint  = c.find === null ? 0 : Paint.text_width(GLYPH.find) + Paint.text_width("type to search");
  const more  = c.detail === undefined ? [] : c.names.flatMap((_, k) => c.detail!(k, POP_CAP - 4).map(Paint.line_width));
  const wants = Math.max(title, foot === "" ? 0 : Paint.text_width(foot) + 5, ...[...whole, hint, ...more].map((x) => x + 4));
  const heads = c.heads === undefined ? 0 : 2 * new Set(c.heads).size - 1;
  const tall  = (iw: number) => {
    const list = heads + c.names.reduce((n, name) => n + popup_name_lines(c, name, iw).length, 0);
    const more = c.detail === undefined ? 0 : Math.max(0, ...c.names.map((_, k) => c.detail!(k, iw).length));
    return 2 + (c.find === null ? 0 : 1) + list + (more === 0 ? 0 : 1 + more);
  };
  return { names: 4 + lw + mark + wide + 2, wants, least: POP_MIN, tall, stays: false };
}

// a list's title, its keys after it, as fits in w columns: its keys go
// first, then the title is cut, an ellipsis at its end
function popup_title(c: Chooser, w: number): string {
  const title = Paint.text_clean(c.title);
  const all   = " " + title + " · ↑↓ Enter · Esc ";
  return Paint.text_width(all) <= w ? all : popup_cut(" " + title + " ", w);
}

// what the picker's foot says of the lit option ("": nothing; a line
// asked for, of it)
export function popup_foot(c: Chooser): string {
  return c.ask !== null ? c.foot(-1) : c.shown.length === 0 ? "" : c.foot(c.shown[c.at].k);
}

// a text as fits in w columns: whole, else cut, an ellipsis at its end
function popup_cut(text: string, w: number): string {
  return Paint.text_width(text) <= w ? text : w < 1 ? "" : Paint.line_cut([Paint.Run(text)], 0, w - 1)[1].map((r) => r.x).join("") + "…";
}

// the lines leading a question's answers (why it asks, what it would
// do), wrapped to iw columns
export function popup_lead(c: Chooser, iw: number): Paint.Line[] {
  return (c.lead ?? []).flatMap((l) => Paint.runs_wrap(l, Math.max(1, iw), false));
}

// whether an option's name makes something new ("+ ..."), its "+" in the
// mark's place (only where one is marked)
function popup_act(c: Chooser, name: string): boolean {
  return c.here >= 0 && name.startsWith("+ ");
}

// the columns an option's name takes after the marks (one that makes
// something new: its "+" in the mark's place)
function popup_name_width(c: Chooser, name: string): number {
  return Paint.text_width(Paint.text_clean(name)) - (popup_act(c, name) ? 2 : 0);
}

// an option's name as its rows show it, in ink (the characters at `at`
// lit; none: plain), within iw columns after its marks: one line, or,
// too wide, wrapped at its words (a word too long at its characters),
// whole. No control character reaches the screen (a new line written
// there would draw the rest of the row over the rows under it): each
// cleaned as text is (Paint.text_clean), where the search counts it
function popup_name_lines(c: Chooser, name: string, iw: number, ink = Paint.INK, lit = Paint.INK, at: number[] = []): Paint.Line[] {
  const room = iw - Paint.text_width(Paint.lit_lead(true)) - (c.here < 0 || popup_act(c, name) ? 0 : 2);
  const runs: Paint.Line = [];
  [...name].forEach((ch, j) => {
    const s    = at.includes(j) ? lit : ink;
    const x    = Paint.text_clean(ch);
    const last = runs.at(-1);
    if (last !== undefined && last.s === s) {
      last.x += x;
    } else if (x !== "") {
      runs.push(Paint.Run(x, s));
    }
  });
  return Paint.line_width(runs) <= room ? [runs] : Paint.runs_wrap(runs, Math.max(1, room), false);
}

// the picker's entries as shown now: each option by its index among
// those shown, and while nothing is searched, each group's head over its
// first (a blank before each but the first)
export function popup_entries(c: Chooser): Array<string | number> {
  const group = c.heads !== undefined && (c.find?.text ?? "") === "";
  return c.shown.flatMap((m, i): Array<string | number> => {
    const head = c.heads?.[m.k] ?? "";
    return !group || (i > 0 && head === c.heads![c.shown[i - 1].k]) ? [i] : i === 0 ? [head, i] : ["", head, i];
  });
}

// the lines each of the picker's entries takes at inner width iw (an
// option's name may wrap)
function popup_heights(c: Chooser, list: Array<string | number>, iw: number): number[] {
  return list.map((e) => (typeof e === "string" ? 1 : popup_name_lines(c, c.names[c.shown[e].k], iw).length));
}

// a list's box, w by h: its lines, framed, and what each stands for
// (popup_paint); the cursor's spot in it, if it has a search; its list as
// laid out (Shape). Inside, its search first, if it has one; each option
// shown (illi's own and each of the user's primary agents; each profile;
// each model; each setting), what it is from one column for all (after
// the widest name on one line: popup_rows), the one now marked (none: no
// marks; one that makes something new, "+ ...", has its "+" in the mark's
// place), the one lit bold, the characters the search matched bold in the
// accent; with groups, while nothing is searched, each group's head over
// its first (a blank line before each but the first). The list keeps KEEP
// lines before the lit one's detail shows under all, after a blank one
// (none where it won't fit), then the list the rest: as many whole as fit
// from the first in view (moved to keep the lit one in it), blank past
// those shown (none: a note says so). Its foot says what the lit one
// takes besides. A search too long shows its end
function popup_list(c: Chooser, w: number, h: number): Omit<Laid, "place"> {
  const iw    = w - 4;
  const room  = h - 2;
  const fits  = iw - 1 - Paint.text_width(GLYPH.find);
  const text  = c.find?.text ?? "";
  const typed = Paint.text_width(text) <= fits ? text : "…" + Paint.text_graphemes(text).slice(1 - fits).join("");
  const find  = c.find === null ? [] : [[Paint.Run(GLYPH.find, Paint.DIM), typed === "" ? Paint.Run("type to search", Paint.DIM) : Paint.Run(typed)]];
  const all   = (c.heads === undefined ? 0 : 2 * new Set(c.heads).size - 1) + c.names.reduce((n, name) => n + popup_name_lines(c, name, iw).length, 0);
  const more  = c.detail === undefined || c.shown.length === 0 ? [] : c.detail(c.shown[c.at].k, iw);
  const keep  = Math.min(all, KEEP, Math.max(0, room - find.length));
  const under = more.length > 0 && room - find.length - keep >= more.length + 1 ? [[], ...more] : [];
  const rows  = Math.min(all, Math.max(0, room - find.length - under.length));
  const list  = popup_entries(c);
  const tall  = popup_heights(c, list, iw);
  const view  = c.shown.length === 0 ? [] : popup_view(c, list, tall, rows);
  const shown = c.shown.length === 0 ? [[[Paint.Run("  Nothing matches " + Paint.text_clean(text), Paint.DIM)], null] as [Paint.Line, null]] : popup_rows(c, list, view, iw);
  const blank = (n: number) => Array.from({ length: Math.max(0, n) }, (): [Paint.Line, null] => [[], null]);
  const items = [...find.map((l): [Paint.Line, null] => [l, null]), ...shown, ...blank(rows - shown.length), ...under.map((l): [Paint.Line, null] => [l, null])];
  const said  = popup_foot(c);
  const foot  = said === "" ? [] : [Paint.Run(popup_cut(" " + said + " ", iw + 1), { ...Paint.DIM, b: true })];
  const title = [Paint.Run(popup_title(c, iw + 1), { ...Paint.DIM, b: true })];
  const fill  = [...items, ...blank(room - items.length)];
  const after = Paint.text_width(text.slice(c.find?.pos ?? 0));
  const at    = c.find === null ? undefined : { row: 1, col: Math.min(w - 3, 2 + Paint.text_width(GLYPH.find) + Math.max(0, Paint.text_width(typed) - after)) };
  return { lines: Paint.frame(fill.map(([l]) => l), w, title, foot), rows: [null, ...fill.map(([, aim]) => aim), null], at, shape: { list: 1 + find.length, lines: rows, tall: view.length, ahead: 0, lead: 0 } };
}

// the picker's entries in view (view: their indices in list), laid out
// iw wide (popup_entry), each with what it stands for: what an option is
// from the column after the widest name on one line
export function popup_rows(c: Chooser, list: Array<string | number>, view: number[], iw: number): Array<[Paint.Line, Target | null]> {
  const wide = Math.max(0, ...c.names.filter((n) => popup_name_lines(c, n, iw).length === 1).map((n) => popup_name_width(c, n)));
  return view.flatMap((e) => popup_entry(c, list[e], iw, wide));
}

// the entries of the picker's list in view (their indices), rows lines at
// most, each whole: from the first in view (Chooser top), moved to keep
// the lit one in it (going up to the first of a group, its head too)
function popup_view(c: Chooser, list: Array<string | number>, tall: number[], rows: number): number[] {
  const lit  = list.indexOf(c.at);
  const span = (from: number, to: number) => tall.slice(from, to + 1).reduce((n, x) => n + x, 0);
  let top    = Math.max(0, Math.min(c.top, lit - (typeof list[lit - 1] === "string" ? 1 : 0)));
  while (top < lit && span(top, lit) > rows) {
    top++;
  }
  c.top = top;
  return popup_fit(tall, top, rows);
}

// the entries that show whole in rows lines from entry top (the first at
// least), each tall[e] lines
function popup_fit(tall: number[], top: number, rows: number): number[] {
  const view: number[] = [];
  for (let e = top, used = 0; e < tall.length && (view.length === 0 || used + tall[e] <= rows); used += tall[e], e++) {
    view.push(e);
  }
  return view;
}

// a turn of the wheel in the picker (d -1: up), as last painted (none
// yet: nothing): a question's lead scrolled, while it is cut (Question.ts;
// its answers, all shown, never move); else its list scrolled STEP
// entries (a third of those shown, on a short one), stopping at its ends
// (it never goes round; one shown whole never moves). The list moved:
// with the pointer on an option, that option lit; else, the lit one gone
// from view, the nearest still in it, so Enter picks what shows
export function popup_wheel(t: Term, c: Chooser, d: number): void {
  const box = t.box?.of === c ? t.box : null;
  if (box === null) {
    return;
  }
  const step = (n: number) => Math.max(1, Math.min(STEP, Math.floor(n / 3)));
  if (c === question_of(t)) {
    c.past = Math.max(0, Math.min(box.lead - box.ahead, (c.past ?? 0) + d * step(box.ahead)));
    return;
  }
  const list = popup_entries(c);
  const tall = popup_heights(c, list, box.w - 2 * box.inset);
  let last   = list.length;
  while (last > 0 && tall.slice(last - 1).reduce((n, x) => n + x, 0) <= box.lines) {
    last--;
  }
  const top = Math.max(0, Math.min(last, c.top + d * step(box.tall)));
  if (top === c.top || c.shown.length === 0) {
    return;
  }
  c.top      = top;
  const view = popup_fit(tall, top, box.lines);
  const p    = t.scr.point;
  const line = p.row - box.row - box.list;
  const over = line >= 0 && line < box.lines && p.col >= box.col && p.col < box.col + box.w;
  const opts = view.filter((e) => typeof list[e] === "number");
  let at     = -1;
  for (let k = 0, from = 0; over && k < view.length; from += tall[view[k]], k++) {
    at = line >= from && line < from + tall[view[k]] ? view[k] : at;
  }
  const lit  = list.indexOf(c.at);
  const near = lit < view[0] ? opts[0] : opts.at(-1);
  const to   = over && typeof list[at] === "number" ? at : view.includes(lit) ? -1 : near ?? -1;
  if (to >= 0) {
    c.at = list[to] as number;
  }
}

// a turn of the wheel in illi's form (d -1: up), as last painted (none
// yet: nothing): its lines under the tabs scrolled STEP (a third of those
// shown, on a short one), stopping at their ends. On a question, with
// the pointer on a row that shows whole (the words: their cursor's line),
// that row lit; else, the lit one gone from view, the nearest still in
// it (none shows whole: nothing moves), so what is lit always shows
export function popup_form_wheel(t: Term, d: number): void {
  const f   = term_form(t)?.[1] ?? null;
  const box = f !== null && t.box?.of === f ? t.box : null;
  if (f === null || box === null) {
    return;
  }
  const laid  = term_form_lines(t, box.w - 4, popup_words(Screen.screen_size().h))!;
  const step  = Math.max(1, Math.min(STEP, Math.floor(box.lines / 3)));
  const top   = Math.max(0, Math.min(laid.body.length - box.lines, f.top + d * step));
  const e     = f.each[f.tab];
  const shows = (k: number) => {
    const rows = popup_form_row(laid.body, laid.at, k);
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
  const lit   = under?.$ === "row" && shows(under.k) ? under.k : shows(e.at) ? e.at : popup_form_row(laid.body, laid.at, e.at)![0] < top ? all[0] : all.at(-1);
  if (lit !== undefined) {
    e.at  = lit;
    f.top = top;
  }
}

// PgUp, PgDn in the picker: a question's lead a page, while it is cut
// (as last painted); else the lit option a page (those shown, less one),
// stopping at the ends. Ctrl+Home, Ctrl+End (and Home, End where nothing
// is typed): the first option, the last
export function popup_page(t: Term, c: Chooser, key: string): void {
  const box = t.box?.of === c ? t.box : null;
  const n   = c.shown.length;
  const d   = key === "PgUp" ? -1 : key === "PgDn" ? 1 : 0;
  if (d !== 0 && box !== null && box.ahead < box.lead) {
    c.past = Math.max(0, Math.min(box.lead - box.ahead, (c.past ?? 0) + d * Math.max(1, box.ahead - 1)));
  } else if (d !== 0) {
    c.at = Math.max(0, Math.min(n - 1, c.at + d * Math.max(1, (box?.tall ?? n) - 1)));
  } else {
    c.at = key === "Ctrl+Home" || key === "Home" ? 0 : Math.max(0, n - 1);
  }
}

// an entry of the picker's list as its lines, iw wide, each with what it
// stands for: a group's head (in the accent) or the blank before it;
// else an option (its index among those shown): its name (its first
// line after the marks, the rest indented under it), what it is from the
// column after the widest name on one line (wide), cut first
// (popup_about), and at its right end its aside, which gives way next; a
// name too wide for a line wraps, without the rest
function popup_entry(c: Chooser, e: string | number, iw: number, wide: number): Array<[Paint.Line, Target | null]> {
  const bold  = { ...Paint.INK, b: true };
  const lit   = { ...bold, c: Draw.draw_tokens().accent };
  if (typeof e === "string") {
    return [[[Paint.Run(e, lit)], null]];
  }
  const m     = c.shown[e];
  const name  = c.names[m.k];
  const here  = e === c.at;
  const act   = popup_act(c, name);
  const marks = [Paint.Run(Paint.lit_lead(here), bold), ...(c.here < 0 || act ? [] : [Paint.Run((m.k === c.here ? GLYPH.here : GLYPH.tab) + " ", Paint.DIM)])];
  const lines = popup_name_lines(c, name, iw, here ? bold : Paint.INK, lit, m.hay === true ? [] : m.at);
  const aim: Target = { $: "option", k: m.k };
  const pad   = Paint.Run(" ".repeat(Paint.line_width(marks)));
  if (lines.length > 1) {
    return lines.map((l, j) => [[...(j === 0 ? marks : [pad]), ...l], aim]);
  }
  const head  = [...marks, ...lines[0]];
  const side  = Paint.text_clean(c.aside?.[m.k] ?? "");
  const keep  = side !== "" && Paint.line_width(head) + 2 + Paint.text_width(side) <= iw;
  const from  = Paint.text_width(Paint.lit_lead(true)) + (c.here < 0 ? 0 : 2) + wide + 2;
  const space = iw - from - (keep ? Paint.text_width(side) + 2 : 0);
  const about = space < 1 ? "" : popup_about(Paint.text_clean(c.about[m.k]), space);
  const line  = about === "" ? head : [...head, Paint.Run(" ".repeat(Math.max(0, from - Paint.line_width(head)))), Paint.Run(about, Paint.DIM)];
  const right = keep ? [Paint.Run(" ".repeat(Math.max(2, iw - Paint.line_width(line) - Paint.text_width(side)))), Paint.Run(side, Paint.DIM)] : [];
  return [[[...line, ...right], aim]];
}

// what an option is, as fits in w columns: whole, else its columns (two
// spaces or more apart) up to the last that fits whole, and as much of
// the next as fits, an ellipsis at its end, if more than CUT of it would
// show; not even the first: cut so
function popup_about(text: string, w: number): string {
  if (Paint.text_width(text) <= w) {
    return text;
  }
  const end = [...text.matchAll(/ {2,}/g)].map((m) => m.index + m[0].length).reverse().find((e) => Paint.text_width(text.slice(0, e)) <= w);
  const cut = end === undefined || w - Paint.text_width(text.slice(0, end)) > CUT;
  return cut ? (w < 2 ? "" : Paint.line_cut([Paint.Run(text)], 0, w - 1)[1].map((r) => r.x).join("") + "…") : text.slice(0, end).trimEnd();
}

// a mouse report (Keys.ts term_press, before all else; true: taken).
// While a popup is open every report is its, wherever the pointer is
// (none but its own: a drag begun before it opened is let go, nothing
// copied). With none, what is at the input takes the reports on it, all
// else going on as if it weren't there: the question (Question.ts) the
// presses on its answers (a press on its lead chooses text, as
// anywhere) and the moves over it; the commands
// suggested the presses anywhere on them, so no text is chosen there. A
// move to another row of a popup or the question, or into it, lights
// the option there, a paint only as the lit one changes (popup_hover); a
// press arms what it lands on (an option, a row, a command, the box,
// outside) and a release on the same takes it (popup_click), so a slip
// never picks; a drag, the right button, nothing; in a popup or the
// question, the click that only focused the terminal's window (Screen
// focusing), nothing either. A press taken keeps its release, though its
// box be gone since; a press again (a double or triple click) goes
// nowhere if a popup or a question opened or closed since the first; a
// report for a box no longer open (a new size, a question answered
// elsewhere: asked again first) does nothing
export function popup_mouse(t: Term, key: string): boolean {
  const aim = t.aim;
  if (key === "Press" || key === "Release") {
    term_asks(t);
  }
  const of   = popup_of(t);
  const ask  = of === null ? question_of(t) : null;
  const open = of ?? ask;
  const on   = open ?? term_suggest(t);
  const box  = on !== null && t.box?.of === on ? t.box : null;
  const at   = box === null ? null : popup_at(box, t.scr.point);
  if (key === "Move") {
    if (open !== null) {
      popup_hover(t, on!, box);
    }
    return of !== null;
  }
  const over = of !== null || (ask !== null ? typeof at === "object" && at !== null : at !== null && at !== "out");
  if (key === "Press" || key === "RightPress") {
    const again = key === "Press" && t.scr.clicks > 1 && aim.first !== open;
    const live  = key === "Press" && !again && box !== null && !(open !== null && t.scr.focusing);
    aim.first   = key === "Press" && t.scr.clicks === 1 ? open : aim.first;
    aim.press   = again || over ? { of: live ? on : null, on: live ? at : null } : null;
    return aim.press !== null;
  }
  const took = of !== null || aim.press !== null;
  if (of !== null && t.sel?.held) {
    term_let_go(t);
  }
  if (key === "Release" || key === "RightRelease") {
    const press = aim.press;
    aim.press   = null;
    if (key === "Release" && on !== null && press?.of === on && at !== null && popup_same(press.on, at)) {
      popup_click(t, on, at);
    }
  }
  return took;
}

// what a spot of the screen is in a box as painted (on a row of things
// side by side, the one under it)
export function popup_at(box: Box, p: Screen.Spot): Pointed {
  const inside = p.row >= box.row && p.row < box.row + box.h && p.col >= box.col && p.col < box.col + box.w;
  const row    = inside ? box.rows[p.row - box.row] ?? null : null;
  const col    = p.col - box.col - box.inset;
  return !inside ? "out" : Array.isArray(row) ? row.find((s) => col >= s.col && col < s.to)?.aim ?? "box" : row ?? "box";
}

// whether two spots are one: the same place, or what they stand for
function popup_same(a: Pointed | null, b: Pointed): boolean {
  const tab = (x: Target) => (x.$ === "row" ? x.tab : -1);
  return typeof a === "object" && a !== null && typeof b === "object" ? a.$ === b.$ && a.k === b.k && tab(a) === tab(b) : a === b;
}

// the pointer moved, in the box of a popup or the question (on: what it
// was painted for) as painted (none: nothing): to another row, or into
// the box, the option there lit (a head, a gap, the lead, the frame:
// none); along its row, or at rest, the keys' lit row kept; leaving the
// box leaves it lit. A paint only as it changes
function popup_hover(t: Term, on: object, box: Box | null): void {
  if (box === null) {
    return;
  }
  const p     = t.scr.point;
  const at    = popup_at(box, p);
  const moved = p.row !== t.aim.row || (at !== "out" && !t.aim.in);
  t.aim.row   = p.row;
  t.aim.in    = at !== "out";
  if (moved && typeof at === "object" && popup_light(t, on, at)) {
    term_draw(t);
  }
}

// an option lit in the picker or illi's form (on), if it still shows (the
// form's: a row of the tab shown) (true: it changed)
function popup_light(t: Term, on: object, at: Target): boolean {
  const f = term_form(t)?.[1];
  if (f !== undefined && on === f) {
    const e   = f.each[f.tab];
    const lit = e !== undefined && at.$ === "row" && at.tab === f.tab && at.k !== e.at;
    if (lit) {
      e.at = at.k;
    }
    return lit;
  }
  const c = on as Chooser;
  const i = at.$ === "option" ? c.shown.findIndex((m) => m.k === at.k) : -1;
  if (i < 0 || i === c.at) {
    return false;
  }
  c.at = i;
  return true;
}

// a click, pressed and let go on one spot of the box painted for `on`:
// in a picker (a list, the question), an option (still shown), lit, then
// what Enter does there, its own keys first (a setting stepped, a toggle,
// a question's answer; held as Enter is, just shown); outside a list, it
// closes as Esc closes it (a question never takes a click outside: it
// never answers for you). In illi's form, a tab: that tab; an option of
// the tab shown: lit, then what Enter does where one is picked (picked,
// and on to the next), what Space does where any are (picked or not; both
// held as the keys are, just shown); the words' row: lit (typing goes
// there anyway). On the commands suggested, one (still found) lit, then
// what Enter does there (run, or filled in: one found by what it does,
// one that needs words). The box, nothing
function popup_click(t: Term, on: object, at: Pointed): void {
  const open = term_form(t);
  const sug  = term_suggest(t);
  if (open !== null && on === open[1]) {
    const [q, f] = open;
    const query  = q.queries[f.tab];
    if (typeof at !== "object") {
      return;
    } else if (at.$ === "tab") {
      f.tab = at.k;
    } else if (at.$ === "row" && at.tab === f.tab) {
      popup_light(t, on, at);
      if (at.k < (query?.options.length ?? 0) && query.multi) {
        term_form_type(t, " ");
      } else if (at.k < (query?.options.length ?? 0)) {
        term_form_key(t, "Enter");
      }
    }
  } else if (sug !== null && on === sug) {
    if (typeof at === "object" && at.$ === "command" && sug.found[at.k] !== undefined) {
      sug.at = at.k;
      term_suggest_key(t, sug, "Enter");
    }
  } else if (at === "out" && on === t.choose) {
    term_choose_key(t, t.choose, "Esc");
  } else if (typeof at === "object" && at.$ === "option") {
    const c = on as Chooser;
    popup_light(t, c, at);
    if (c.shown[c.at]?.k === at.k) {
      term_choose_key(t, c, "Enter");
    }
  }
}
