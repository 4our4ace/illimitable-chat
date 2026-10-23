// Popup
// =====
// Every list a person picks from opens in one popup (term_popup): the
// picker (Term.ts Chooser: /model, /settings, /profile, Ctrl+P and the
// rest, a line asked for, the permission question), in the screen's
// middle whatever the side panel does, over the rest of the screen dimmed
// in one ink (the backdrop), the box on a background of its own. One rule
// places and sizes it, from the screen and what it shows alone
// (popup_size): as wide as its options' names ask, POP_MIN at least (a
// two-answer question still reads as a dialog), what they say widening it
// to POP_CAP (a line asked for: ASK_MIN at least), the room allowing; as
// tall as its lines, every option counted as unsearched (a search shows
// fewer in the same box), SHARE of the screen's rows at most (a question:
// all but two); centered, the head row and the bottom line left
// uncovered. While it stays open it only grows (a value stepped wider),
// never shrinks; a new size measures it afresh. A name is never cut:
// what an option is gives way first, then its aside, and on a screen too
// narrow for it the name wraps, under itself. The commands suggested as
// a /word is typed stay at the input, and panes in the chat's place
// (Frame.ts).

import * as Draw from "../ui/Draw.ts";
import { MARGIN } from "./Frame.ts";
import * as Paint from "../ui/Paint.ts";
import type * as Screen from "../ui/Screen.ts";
import type { Chooser, Target, Term } from "./Term.ts";
import { GLYPH } from "../ui/Theme.ts";

// the narrowest a popup is (a two-answer question still reads as a
// dialog), the widest what its options say widens it (a wide screen
// draws no table across itself; a name is never held to it), the
// narrowest a line asked for is (what will be typed isn't known yet):
// each the room allowing
const POP_MIN = 40;
const POP_CAP = 96;
const ASK_MIN = 60;

// the share of the screen's rows a list takes at most (all but two on
// a short screen, LEAST at least; a question, all but two always); the
// lines its list keeps before the lines leading it take any
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

// a popup's place on the screen: its top row, its first column, its
// width and height
type Place = { row: number; col: number; w: number; h: number };

// what a popup's content asks of its box, in columns with its frame: its
// options' names whole, with their marks (names); all it shows whole
// (wants); the least it takes (least); its rows with its frame at an
// inner width (tall); whether it is a question (stays: all but two of the
// screen's rows)
type Measure = { names: number; wants: number; least: number; tall: (iw: number) => number; stays: boolean };

// the popup open: the picker (a list, or a line asked for); none: null
export function term_popup(t: Term): "list" | null {
  return t.choose !== null ? "list" : null;
}

// a popup's place and size on a screen w by h, from its measure alone
// (never the side panel, the input or the chat): as wide as its names
// ask, its least at least, what it shows widening it to POP_CAP, and as
// wide as it was (was: it only grows while open), the room allowing
// (MARGIN each side, the last column blank); as tall as its rows, SHARE
// of the screen's at most (all but two on a short screen, LEAST at
// least; a question, all but two); centered, under the head row and over
// the bottom line
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
// one open); kept as painted (t.box). The cursor's spot in it, if it
// takes the typing (null: none)
export function popup_paint(t: Term, rows: Screen.Piece[][], w: number, h: number): Screen.Spot | null {
  const c     = t.choose!;
  const at    = popup_size(popup_measure(c), w, h, t.box?.of === c ? t.box.w : 0);
  const box   = popup_list(c, at.w, at.h);
  const fade  = Draw.draw_off(t.scr.canvas, BACKDROP);
  const panel = Draw.draw_off(t.scr.canvas, PANEL);
  const ink   = fade === undefined ? Paint.DIM : { ...Paint.INK, c: fade };
  for (const piece of rows.flat()) {
    piece.line = piece.line.map((run) => ({ ...run, s: ink }));
  }
  box.lines.forEach((line, k) => {
    rows[at.row + k].push({ col: at.col, w: at.w, line: panel === undefined ? line : line.map((r) => ({ ...r, s: { ...r.s, g: panel } })) });
  });
  t.box = { of: c, ...at, rows: box.rows };
  box.rows.forEach((aim, k) => {
    if (aim !== null) {
      t.hits.push({ row: at.row + k, col: at.col, to: at.col + at.w, run: () => {
        t.choose = null;
        c.pick(aim.k);
      } });
    }
  });
  return box.at === undefined ? null : { row: at.row + box.at.row, col: at.col + box.at.col };
}

// what the picker asks of its box (popup_size): each option's name whole
// with its marks; each option whole (its name, what it is from one
// column for all, its aside two spaces after), its title with its keys,
// its foot, each line leading it, its search with its hint, each
// option's detail as wide as it would be; a line asked for, ASK_MIN at
// least. Its rows: its frame, the lines leading it (wrapped), the search
// (or the line asked), every option (its name wrapped, if it must) with
// its groups' heads and gaps as unsearched, and the lit one's detail
// after a blank line, as tall as any option's
function popup_measure(c: Chooser): Measure {
  const mark  = c.here < 0 ? 0 : 2;
  const wide  = Math.max(0, ...c.names.map((name) => popup_name_width(c, name)));
  const whole = c.names.map((_, k) => {
    const about = Paint.text_width(Paint.text_clean(c.about[k]));
    const side  = Paint.text_width(Paint.text_clean(c.aside?.[k] ?? ""));
    return 2 + mark + wide + (about === 0 ? 0 : 2 + about) + (side === 0 ? 0 : 2 + side);
  });
  const title = Paint.text_width(popup_title(c, Infinity)) + 3;
  const foot  = popup_foot(c);
  const hint  = c.find === null ? 0 : Paint.text_width(c.ask === null ? GLYPH.find : GLYPH.input) + Paint.text_width(c.ask?.hint ?? "type to search");
  const lead  = (c.lead ?? []).map(Paint.line_width);
  const more  = c.ask !== null || c.detail === undefined ? [] : c.names.flatMap((_, k) => c.detail!(k, POP_CAP - 4).map(Paint.line_width));
  const wants = Math.max(title, foot === "" ? 0 : Paint.text_width(foot) + 5, ...[...whole, hint, ...lead, ...more].map((x) => x + 4));
  const heads = c.heads === undefined ? 0 : 2 * new Set(c.heads).size - 1;
  const tall  = (iw: number) => {
    const list = c.ask !== null ? 0 : heads + c.names.reduce((n, name) => n + popup_name_lines(c, name, iw).length, 0);
    const more = c.ask !== null || c.detail === undefined ? 0 : Math.max(0, ...c.names.map((_, k) => c.detail!(k, iw).length));
    return 2 + popup_lead(c, iw).length + (c.find === null ? 0 : 1) + list + (more === 0 ? 0 : 1 + more);
  };
  return { names: 4 + 2 + mark + wide + 2, wants, least: c.ask !== null ? ASK_MIN : POP_MIN, tall, stays: c.stays === true };
}

// the picker's title, its keys after it, as fits in w columns: its keys
// go first, then the title is cut, an ellipsis at its end
function popup_title(c: Chooser, w: number): string {
  const keys = c.ask === null ? " · ↑↓ Enter · Esc " : " · Enter · Esc ";
  const all  = " " + c.title + keys;
  return Paint.text_width(all) <= w ? all : popup_cut(" " + c.title + " ", w);
}

// what the picker's foot says of the lit option ("": nothing; a line
// asked for, of it)
function popup_foot(c: Chooser): string {
  return c.ask !== null ? c.foot(-1) : c.shown.length === 0 ? "" : c.foot(c.shown[c.at].k);
}

// a text as fits in w columns: whole, else cut, an ellipsis at its end
function popup_cut(text: string, w: number): string {
  return Paint.text_width(text) <= w ? text : w < 1 ? "" : Paint.line_cut([Paint.Run(text)], 0, w - 1)[1].map((r) => r.x).join("") + "…";
}

// the lines leading the picker (a question's what and why), wrapped to
// iw columns
function popup_lead(c: Chooser, iw: number): Paint.Line[] {
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
  return Paint.text_width(name) - (popup_act(c, name) ? 2 : 0);
}

// an option's name as its rows show it, in ink (the characters at `at`
// lit; none: plain), within iw columns after its marks: one line, or,
// too wide, wrapped at its words (a word too long at its characters),
// whole
function popup_name_lines(c: Chooser, name: string, iw: number, ink = Paint.INK, lit = Paint.INK, at: number[] = []): Paint.Line[] {
  const room = iw - 2 - (c.here < 0 || popup_act(c, name) ? 0 : 2);
  const runs: Paint.Line = [];
  [...name].forEach((ch, j) => {
    const s    = at.includes(j) ? lit : ink;
    const last = runs.at(-1);
    if (last !== undefined && last.s === s) {
      last.x += ch;
    } else {
      runs.push(Paint.Run(ch, s));
    }
  });
  return Paint.line_width(runs) <= room ? [runs] : Paint.runs_wrap(runs, Math.max(1, room), false);
}

// the picker's entries as shown now: each option by its index among
// those shown, and while nothing is searched, each group's head over its
// first (a blank before each but the first)
function popup_entries(c: Chooser): Array<string | number> {
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

// the picker's box, w by h: its lines, framed, and what each stands for
// (popup_paint); the cursor's spot in it, if it has a search or a line
// asked. Inside, its search first, if it has one; each option shown
// (illi's own and each of the user's primary agents; each profile; each
// model; each setting), what it is from one column for all (after the
// widest name on one line), the one now marked (none: no marks; one that
// makes something new, "+ ...", has its "+" in the mark's place), the
// one lit bold, the characters the search matched bold in the accent;
// with groups, while nothing is searched, each group's head over its
// first (a blank line before each but the first). The list keeps KEEP
// lines before the lines leading it (a question's what and why, wrapped,
// over all of it) take what's left, their first line at least, from
// those scrolled past (Chooser past; the last shown ends in an ellipsis
// while more follow), then the lit one's detail under all, after a blank
// one (none where it won't fit), then the list the rest: as many whole
// as fit from the first in view (moved to keep the lit one in it), blank
// past those shown (none: a note says so). Its foot says what the lit
// one takes besides. A line asked for (Chooser ask) is its one line, as
// the input shows a message typed, its hint while empty; a search or a
// line too long shows its end
function popup_list(c: Chooser, w: number, h: number): { lines: Paint.Line[]; rows: Array<Target | null>; at?: Screen.Spot } {
  const iw    = w - 4;
  const room  = h - 2;
  const glyph = c.ask === null ? GLYPH.find : GLYPH.input;
  const fits  = iw - 1 - Paint.text_width(glyph);
  const text  = c.find?.text ?? "";
  const typed = Paint.text_width(text) <= fits ? text : "…" + Paint.text_graphemes(text).slice(1 - fits).join("");
  const find  = c.find === null ? [] : [[Paint.Run(glyph, Paint.DIM), typed === "" ? Paint.Run(c.ask?.hint ?? "type to search", Paint.DIM) : Paint.Run(typed)]];
  const lead  = popup_lead(c, iw);
  const all   = c.ask !== null ? 0 : (c.heads === undefined ? 0 : 2 * new Set(c.heads).size - 1) + c.names.reduce((n, name) => n + popup_name_lines(c, name, iw).length, 0);
  const more  = c.ask !== null || c.detail === undefined || c.shown.length === 0 ? [] : c.detail(c.shown[c.at].k, iw);
  let rows    = Math.min(all, KEEP, Math.max(0, room - find.length));
  const ahead = Math.min(lead.length, Math.max(lead.length === 0 ? 0 : 1, room - find.length - rows));
  rows        = Math.min(rows, Math.max(0, room - find.length - ahead));
  const under = more.length > 0 && room - find.length - rows - ahead >= more.length + 1 ? [[], ...more] : [];
  rows        = Math.min(all, Math.max(0, room - find.length - ahead - under.length));
  const past  = (c.past = Math.max(0, Math.min(c.past ?? 0, lead.length - ahead)));
  const read  = lead.slice(past, past + ahead).map((l, k) => (k === ahead - 1 && past + ahead < lead.length ? [...Paint.line_cut(l, 0, iw - 1)[1], Paint.Run("…", Paint.DIM)] : l));
  const list  = popup_entries(c);
  const tall  = popup_heights(c, list, iw);
  const wide  = Math.max(0, ...c.names.filter((n) => popup_name_lines(c, n, iw).length === 1).map((n) => popup_name_width(c, n)));
  const shown = c.ask !== null ? [] : c.shown.length === 0 ? [[[Paint.Run("  Nothing matches " + Paint.text_clean(text), Paint.DIM)], null] as [Paint.Line, null]] : popup_view(c, list, tall, rows).flatMap((e) => popup_entry(c, list[e], iw, wide));
  const blank = (n: number) => Array.from({ length: Math.max(0, n) }, (): [Paint.Line, null] => [[], null]);
  const items = [...read.map((l): [Paint.Line, null] => [l, null]), ...find.map((l): [Paint.Line, null] => [l, null]), ...shown, ...blank(rows - shown.length), ...under.map((l): [Paint.Line, null] => [l, null])];
  const said  = popup_foot(c);
  const foot  = said === "" ? [] : [Paint.Run(popup_cut(" " + said + " ", iw + 1), { ...Paint.DIM, b: true })];
  const title = [Paint.Run(popup_title(c, iw + 1), { ...Paint.DIM, b: true })];
  const fill  = [...items, ...blank(room - items.length)];
  const after = Paint.text_width(text.slice(c.find?.pos ?? 0));
  const at    = c.find === null ? undefined : { row: 1 + ahead, col: Math.min(w - 3, 2 + Paint.text_width(glyph) + Math.max(0, Paint.text_width(typed) - after)) };
  return { lines: Paint.frame(fill.map(([l]) => l), w, title, foot), rows: [null, ...fill.map(([, aim]) => aim), null], at };
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
  const view: number[] = [];
  for (let e = top, used = 0; e < list.length && (view.length === 0 || used + tall[e] <= rows); used += tall[e], e++) {
    view.push(e);
  }
  return view;
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
  const marks = [Paint.Run(here ? "› " : "  ", bold), ...(c.here < 0 || act ? [] : [Paint.Run((m.k === c.here ? GLYPH.here : GLYPH.tab) + " ", Paint.DIM)])];
  const lines = popup_name_lines(c, name, iw, here ? bold : Paint.INK, lit, m.hay === true ? [] : m.at);
  const aim: Target = { $: "option", k: m.k };
  const pad   = Paint.Run(" ".repeat(Paint.line_width(marks)));
  if (lines.length > 1) {
    return lines.map((l, j) => [[...(j === 0 ? marks : [pad]), ...l], aim]);
  }
  const head  = [...marks, ...lines[0]];
  const side  = Paint.text_clean(c.aside?.[m.k] ?? "");
  const keep  = side !== "" && Paint.line_width(head) + 2 + Paint.text_width(side) <= iw;
  const from  = 2 + (c.here < 0 ? 0 : 2) + wide + 2;
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
