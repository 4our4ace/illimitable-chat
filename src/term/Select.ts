// Select
// ======
// Choosing text, as in Claude Code: a drag anywhere on the screen (the
// chat, a pane, the side, the head, the foot) chooses the text it goes
// over and copies it as it's let go; a double click a word (a path, a
// link), three a line, dragged on, more of them; past a chat's edge, it
// scrolls. A press on the input (its rows, the rule under them) puts its
// cursor where it lands first, as a key moves it (Screen.ts ed_at): a
// drag from there still chooses, a double click still a word, the cursor
// left where the press put it. Empty space is chosen too, as in Claude
// Code: past a line's text and on a blank line, the choice lights to its
// end (or the area's width); what's copied drops each line's end spaces.
// A reply's button under the pointer lights, and a click copies what it
// holds; buttons are no text, so what's copied or quoted leaves them
// out. The right
// button dragged over the chat chooses the same way (not from a button),
// and as it's let go the text is quoted in the input, to reply to it (not
// on an agent's read-only page); a right click soon after takes the quote
// out again. What's under a point is told once for a click and the light
// (term_target): in the chat, what a click would act on lights (an item
// of a run of work, a run's More line, a recap, a page in it, a block:
// term_light), one thing at a time, once
// the pointer itself has moved; it goes as the chat moves by itself while
// followed, at a key, as the window loses the focus, and while text
// chosen shows: the press that lets that go acts on nothing in the chat
// (term_showing), so a click to clear it never folds what it lands on. A
// click on a word there waits out a double click (Keys.ts term_click), so
// a second press still chooses the word; on a mark's own control (an
// item's line and its bar, a glyph, a summary's gutter and /open, an
// open block's bar: term_wordy) it acts at once. A press again soon on the cell whose click just
// acted, or one that only focused the window, clicks nothing and chooses
// no word (term_dead). Under a popup the mouse is its alone (Popup.ts
// popup_mouse, before all of this): nothing is chosen there, and nothing
// lights; a question at the input takes the presses on its answers
// alone (and on a line of a folded command saying what it hides; its
// lead's other text is chosen as any other), and on it only its answers
// and such a line light.

import * as Draw from "../ui/Draw.ts";
import { term_draw } from "./Frame.ts";
import { term_click, term_unwait } from "./Keys.ts";
import { term_toast } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import { term_popup } from "./Popup.ts";
import * as Screen from "../ui/Screen.ts";
import type { Area, Box, Cell, Ink, Sel, Term, Under } from "./Term.ts";
import * as View from "../ui/View.ts";

// a drag past a chat's edge scrolls it a line each DRIFT ms; text chosen
// shows on a fill SELECT of the way from the background to the accent; a
// button under the pointer, on a fill LIT of the way from the text's
// color to its label's
const DRIFT  = 50;
const SELECT = 0.3;
const LIT    = 0.3;

// how long after a quote a right click takes it out (ms)
const UNDO   = 5000;

// a word's characters, for a double click (a path's, a link's, an
// address's too), and those its end drops
const WORDY  = /^[\p{L}\p{N}\p{M}_\-+.\/\\~:@%?=&#$*]+$/u;
const ENDING = /^[.:?]$/;

// the run at column col of a line (none: past its end)
function term_run(line: Paint.Line, col: number): Paint.Run | undefined {
  let at = 0;
  for (const r of line) {
    const w = Paint.text_width(r.x);
    if (col >= at && col < at + w) {
      return r;
    }
    at += w;
  }
  return undefined;
}

// what the button at column col of a line copies (none: no button there)
function term_button(line: Paint.Line, col: number): (() => string) | undefined {
  return term_run(line, col)?.copy;
}

// the left button: pressed, a drag starts choosing text in the area under
// it (twice in a row there: from the word under it, a word at a time;
// three times: from its line, a line at a time; a button's own click
// comes first, and a press that acts on nothing chooses no word:
// term_dead; on the input, one that acts puts its cursor there first:
// term_put); dragged, the choice follows the pointer (a chat scrolls
// while it's past an edge); let go, the text chosen is copied, else it
// was a click (none from a press that acts on nothing; none on the chat's
// marks from one that let text chosen go: term_showing). The right
// button: the same in the chat, a character at a time (never from a
// reply's button), the text chosen quoted as it's let go (term_quote),
// else it was a right click, which takes a quote just made out
// (term_unquote)
export function term_mouse(t: Term, key: string): void {
  const p = t.scr.point;
  if (key === "RightPress") {
    const area = term_area_at(t, p);
    const at   = area?.key === "chat" && term_under(t, p) === undefined ? term_cell(area, p) : null;
    t.sel      = area !== undefined && at !== null ? { key: area.key, a: at, b: at, held: true, moved: false, unit: 1, root: [at, at] } : null;
  } else if (key === "RightRelease") {
    term_drift(t, 0);
    term_follow(t);
    const sel = t.sel;
    if (sel?.held && sel.moved) {
      sel.held = false;
      term_quote(t, term_selected(t));
    } else {
      t.sel = null;
      term_unquote(t);
    }
  } else if (key === "Press") {
    const area = term_area_at(t, p);
    const at   = area === undefined ? null : term_cell(area, p);
    const dead = term_dead(t, true);
    const drop = term_showing(t) ? { drop: true as const } : {};
    t.sel = null;
    if (area !== undefined && at !== null) {
      const unit = term_under(t, p) === undefined && !dead ? t.scr.clicks : 1;
      const root = term_unit(area, at, unit);
      t.sel = { key: area.key, a: root[0], b: root[1], held: true, moved: unit > 1 && !term_after(root[0], root[1]), unit, root, ...drop };
      if (!dead) {
        term_put(t, area, at);
      }
    }
  } else if ((key === "Drag" || key === "RightDrag") && t.sel?.held) {
    const area = t.areas.find((a) => a.key === t.sel!.key);
    term_follow(t);
    term_drift(t, area?.scroll === undefined ? 0 : p.row < area.row ? -1 : p.row >= area.row + area.tall ? 1 : 0);
  } else if (key === "Release") {
    term_drift(t, 0);
    term_follow(t);
    const sel = t.sel;
    if (sel?.held && sel.moved) {
      sel.held = false;
      term_copied(t, term_selected(t));
    } else if (sel === null || sel.held) {
      t.sel = null;
      if (!term_dead(t)) {
        term_click(t, sel?.drop !== true);
      }
    }
  }
}

// a press on the input as last painted (Area input): its cursor put
// where it landed on its rows (Screen.ed_at), and on the rule under them
// at the text's end (rows hidden under the view too), as Left or Right
// moves it (moved: so Up and Down past its ends stay in it); none if its
// text changed since it was painted
function term_put(t: Term, area: Area, at: Cell): void {
  const put = area.input;
  const ed  = t.scr.ed;
  const row = at.line - (put?.line ?? 0);
  if (put !== undefined && row >= 0 && row < put.tall && put.laid.text === ed.text) {
    ed.pos   = Screen.ed_at(put.laid, put.top, row < put.tall - 1 ? row : Infinity, at.col);
    ed.moved = true;
  }
}

// whether text chosen shows: dragged, or let go and on a row its area
// shows (scrolled away, it is no longer seen). While it does, nothing in
// the chat lights, and the press that lets it go clicks nothing there
function term_showing(t: Term): boolean {
  const sel  = t.sel;
  const area = t.areas.find((a) => a.key === sel?.key);
  if (sel === null || !sel.moved || area === undefined) {
    return false;
  }
  const [a, b] = term_ends(sel);
  return sel.held || (b.line >= area.first && a.line < area.first + area.tall);
}

// whether the left press down acts on nothing as a click, nor chooses a
// word or a line (a drag from it still chooses text): it only focused the
// window (Screen.ts focusing), or it is swallowed, again on the cell
// whose click just acted, within TWICE of it (t.acted; a press there
// holds the cell TWICE more)
function term_dead(t: Term, press = false): boolean {
  const a     = t.acted;
  const again = a !== null && t.scr.click.row === a.at.row && t.scr.click.col === a.at.col && t.scr.pressed < a.until;
  if (again && press) {
    a!.until = t.scr.pressed + Screen.TWICE;
  }
  return again || t.scr.focusing === true;
}

// a held choice grown to the pointer, inside its area: from the first it
// took to the character, word or line the pointer's on, either way
function term_follow(t: Term): void {
  const sel  = t.sel;
  const area = t.areas.find((a) => a.key === sel?.key);
  const at   = area === undefined ? null : term_cell(area, t.scr.point);
  if (sel?.held && area !== undefined && at !== null) {
    const [from, to] = term_unit(area, at, sel.unit);
    const [first, last] = sel.root;
    [sel.a, sel.b] = term_after(first, from) ? [from, last] : term_after(to, last) ? [first, to] : [first, last];
    sel.moved = sel.moved || at.line !== first.line || at.col !== first.col;
  }
}

// what pressing a place n times takes in, its first and last cell: the
// place (1), its word (2), its line (3); a word's last before its first
// if there's none
function term_unit(area: Area, at: Cell, n: number): [Cell, Cell] {
  const [from, to] = n === 1 ? [at.col, at.col + 1] : n === 2 ? term_word(area.lines[at.line] ?? [], at.col) : [0, area.w + 1];
  return [{ line: at.line, col: from }, { line: at.line, col: to - 1 }];
}

// whether a cell comes after another
function term_after(x: Cell, y: Cell): boolean {
  return x.line > y.line || (x.line === y.line && x.col > y.col);
}

// a choice let go unfinished (a popup opened under a drag): nothing
// copied, its scrolling past the edge stopped
export function term_let_go(t: Term): void {
  term_drift(t, 0);
  t.sel = null;
}

// a drag past its area's edge: it scrolls a line each DRIFT ms, up (d
// -1) or down (1), till the drag's back inside (0) or let go
function term_drift(t: Term, d: number): void {
  if (t.drift !== undefined && t.drift.d !== d) {
    clearInterval(t.drift.timer);
    t.drift = undefined;
  }
  if (d !== 0 && t.drift === undefined) {
    const timer = setInterval(() => {
      t.areas.find((a) => a.key === t.sel?.key)?.scroll?.(d);
      term_draw(t);
    }, DRIFT);
    t.drift = { d, timer };
  }
}

// the area a spot is in (by its row, then the nearest by its column)
function term_area_at(t: Term, p: Screen.Spot): Area | undefined {
  const off = (a: Area) => (p.col < a.col ? a.col - p.col : Math.max(0, p.col - (a.col + a.w - 1)));
  return t.areas.filter((a) => p.row >= a.row && p.row < a.row + a.tall).sort((x, y) => off(x) - off(y))[0];
}

// the place of a spot in an area, held inside it (its column may be one
// past the end: the rest of the line; null: the area has no lines)
function term_cell(area: Area, p: Screen.Spot): Cell | null {
  const row = Math.max(0, Math.min(area.tall - 1, p.row - area.row));
  const end = area.lines.length - 1;
  return end < 0 ? null : { line: Math.min(end, area.first + row), col: Math.max(0, Math.min(area.w, p.col - area.col)) };
}

// a choice's ends, the first first
function term_ends(sel: Sel): [Cell, Cell] {
  return term_after(sel.a, sel.b) ? [sel.b, sel.a] : [sel.a, sel.b];
}

// the columns chosen in line n, from to to (null: none)
function term_span(sel: Sel, n: number): [number, number] | null {
  const [a, b] = term_ends(sel);
  return n < a.line || n > b.line ? null : [n === a.line ? a.col : 0, n === b.line ? b.col + 1 : Infinity];
}

// the text chosen: each line's columns chosen, their ends' spaces
// dropped; a reply's buttons are no text (a line of buttons alone is
// left out whole)
export function term_selected(t: Term): string {
  const sel  = t.sel;
  const area = t.areas.find((a) => a.key === sel?.key);
  if (sel === null || area === undefined) {
    return "";
  }
  const [a, b] = term_ends(sel);
  const out: string[] = [];
  for (let n = a.line; n <= b.line; n++) {
    const [from, to] = term_span(sel, n)!;
    const runs = Paint.line_cut(area.lines[n] ?? [], from, to)[1];
    const text = runs.filter((r) => r.copy === undefined).map((r) => r.x).join("").trimEnd();
    if (text !== "" || !runs.some((r) => r.copy !== undefined)) {
      out.push(text);
    }
  }
  return out.join("\n");
}

// a line's characters, each its column and width
function term_cells(line: Paint.Line): Array<{ g: string; at: number; w: number }> {
  const cells: { g: string; at: number; w: number }[] = [];
  for (const g of Paint.text_graphemes(line.map((r) => r.x).join(""))) {
    const at = cells.length === 0 ? 0 : cells[cells.length - 1].at + cells[cells.length - 1].w;
    cells.push({ g, at, w: Paint.text_width(g) });
  }
  return cells;
}

// the word at column col of a line, its columns from to to: a run of
// WORDY characters (a path, a link, an address, a number each one), its
// end's punctuation dropped; else the one character there
function term_word(line: Paint.Line, col: number): [number, number] {
  const cells = term_cells(line);
  const k = cells.findIndex((c) => col >= c.at && col < c.at + Math.max(1, c.w));
  if (k < 0) {
    return [col, col];
  }
  if (!WORDY.test(cells[k].g)) {
    return [cells[k].at, cells[k].at + cells[k].w];
  }
  let [i, j] = [k, k];
  while (i > 0 && WORDY.test(cells[i - 1].g)) i--;
  while (j < cells.length - 1 && WORDY.test(cells[j + 1].g)) j++;
  while (j > k && ENDING.test(cells[j].g)) j--;
  return [cells[i].at, cells[j].at + cells[j].w];
}

// whether a word is under a spot as last painted (a double click there
// would choose it): none past a line's end, on a blank line, on a frame's
// edge or a space, nor on a mark's own control, tagged to light with it
// (Paint.Tag: an item's line and its bar, a More line, a glyph, a
// summary's gutter and /open, an open block's bar)
export function term_wordy(t: Term, p: Screen.Spot): boolean {
  const area = t.areas.find((a) => p.row >= a.row && p.row < a.row + a.tall && p.col >= a.col && p.col < a.col + a.w);
  const line = area === undefined ? [] : area.lines[area.first + p.row - area.row] ?? [];
  const col  = p.col - (area?.col ?? 0);
  const cell = term_cells(line).find((c) => col >= c.at && col < c.at + Math.max(1, c.w));
  return cell !== undefined && WORDY.test(cell.g) && term_run(line, col)?.mark === undefined;
}

// the button under a spot (none: no button there, or a popup over all)
export function term_under(t: Term, p: Screen.Spot): (() => string) | undefined {
  const area = t.areas.find((a) => p.row >= a.row && p.row < a.row + a.tall && p.col >= a.col && p.col < a.col + a.w);
  return area === undefined || term_popup(t) ? undefined : term_button(area.lines[area.first + p.row - area.row] ?? [], p.col - area.col);
}

// what's under a spot, as last painted, for a click and the light alike:
// a popup open, or the question at the input or the commands suggested
// where they show, before all; then a hit (the side, the tabs, the jump
// to the end); a reply's button; in the chat (no pane over it), the mark
// a tag there names (a run's bar: the run's), else the innermost mark
// holding the line; else nothing. The live tail under the chat's rows
// has no marks
export function term_target(t: Term, p: Screen.Spot): Under {
  if (term_popup(t) || (t.box !== null && term_boxed(t.box, p))) {
    return { $: "popup" };
  }
  const hit = t.hits.find((h) => h.row === p.row && p.col >= h.col && p.col < h.to);
  if (hit !== undefined) {
    return { $: "hit", hit };
  }
  const copy = term_under(t, p);
  if (copy !== undefined) {
    return { $: "copy", copy };
  }
  const area = t.pane === null ? t.areas.find((a) => a.key === "chat") : undefined;
  if (area === undefined || p.row < area.row || p.row >= area.row + area.tall || p.col < area.col || p.col >= area.col + area.w) {
    return { $: "none" };
  }
  const line = area.first + p.row - area.row;
  const tag  = term_run(area.lines[line] ?? [], p.col - area.col)?.mark;
  const held = t.seen.marks.filter((m) => m.from <= line && line < m.to);
  const most = held.reduce<Paint.Mark | undefined>((a, m) => (a === undefined || m.to - m.from <= a.to - a.from ? m : a), undefined);
  const mark = held.find((m) => m.key === tag?.key) ?? most;
  return mark === undefined ? { $: "none" } : { $: "mark", mark };
}

// whether a spot is in a box as last painted
function term_boxed(box: Box, p: Screen.Spot): boolean {
  return p.row >= box.row && p.row < box.row + box.h && p.col >= box.col && p.col < box.col + box.w;
}

// the pointer moved: painted again only if it's over another button,
// or another mark would light (told apart by their keys)
export function term_hover(t: Term): void {
  if (!t.sel?.held && (term_under(t, t.scr.point) !== t.hover || (term_lit(t)?.mark.key ?? null) !== t.lit)) {
    term_draw(t);
  }
}

// the chat's rows as painted (rows: the screen's, the chat's piece first
// on each), once every hit is placed: what a click would act on lit
// (Paint.line_lit; one waiting on a click, pressed), kept as lit (t.lit)
export function term_light(t: Term, rows: Screen.Piece[][]): void {
  const lit  = term_lit(t);
  const area = t.areas.find((a) => a.key === "chat");
  t.lit      = lit?.mark.key ?? null;
  if (lit === undefined || area === undefined) {
    return;
  }
  const { mark, pressed } = lit;
  for (let k = 0; k < area.tall; k++) {
    const piece = rows[area.row + k]?.[0];
    if (area.first + k >= mark.from && area.first + k < mark.to && piece !== undefined) {
      piece.line = Paint.line_lit(piece.line, mark, pressed);
    }
  }
}

// what lights (none: undefined): the mark a click's fold waits on,
// pressed (Keys.ts term_wait); else the mark under the pointer
// (term_target), once the pointer's place is known (t.pointed: it moved,
// pressed or let go since the chat last moved by itself, a key, the focus
// lost), the window focused, no text chosen showing (a click would only
// let it go: term_showing)
function term_lit(t: Term): { mark: Paint.Mark; pressed: boolean } | undefined {
  const waits = t.wait === null ? undefined : t.seen.marks.find((m) => m.key === t.wait!.key);
  if (waits !== undefined) {
    return { mark: waits, pressed: true };
  }
  if (!t.pointed || t.scr.away === true || term_showing(t)) {
    return undefined;
  }
  const at = term_target(t, t.scr.point);
  return at.$ === "mark" ? { mark: at.mark, pressed: false } : undefined;
}

// a key pressed or text typed (Keys.ts, Attach.ts), as the mouse takes
// it: a click's fold waiting given up; the light out till the pointer
// moves again (but by the wheel, which moves the chat under the pointer:
// what's under it lights)
export function term_typing(t: Term, key: string): void {
  term_unwait(t);
  if (key !== "WheelUp" && key !== "WheelDown") {
    t.pointed = false;
  }
}

// an area's rows as shown (a held choice's end where the pointer is
// first): the text chosen in each marked, and the button under the
// pointer lit
export function term_area(t: Term, area: Area): Paint.Line[] {
  t.areas.push(area);
  if (t.sel?.key === area.key) {
    term_follow(t);
  }
  return Array.from({ length: area.tall }, (_, k) => term_marked(t, area, k));
}

// an area's row k: the cells chosen in it on the chosen fill (else
// reversed), past its text too (to the choice's end, at most the area's
// width), the button under the pointer lit, as Claude Code lights one:
// in the background's color on a fill near the text's (else reversed);
// none under a popup
function term_marked(t: Term, area: Area, k: number): Paint.Line {
  const n      = area.first + k;
  const span   = t.sel?.key === area.key && t.sel.moved ? term_span(t.sel, n) : null;
  const p      = t.scr.point;
  const canvas = t.scr.canvas ?? "";
  const theme  = Draw.draw_theme();
  const hex    = (...cs: (string | undefined)[]) => canvas.startsWith("#") && cs.every((c) => c?.startsWith("#"));
  let line     = area.lines[n] ?? [];
  if (span !== null) {
    const c    = Draw.draw_tokens().accent;
    const room = Math.min(span[1], area.w) - Paint.line_width(line);
    line = room > 0 ? [...line, Paint.Run(" ".repeat(room))] : line;
    line = Paint.line_mark(line, span[0], span[1], hex(c) ? (s) => ({ ...s, g: Draw.draw_mix(canvas, c!, SELECT), v: false }) : (s) => ({ ...s, v: !s.v }));
  }
  const copy = t.sel?.held || p.row !== area.row + k || term_popup(t) ? undefined : term_button(line, p.col - area.col);
  if (copy !== undefined) {
    const runs  = line.filter((r) => r.copy === copy);
    const from  = Paint.line_width(line.slice(0, line.indexOf(runs[0])));
    const label = runs.find((r) => r.s.c.startsWith("#"))?.s.c;
    const lit: Ink = hex(label, theme.codeText) ? { ...Paint.INK, c: canvas, g: Draw.draw_mix(theme.codeText, label!, LIT) } : { ...Paint.INK, v: true };
    line = Paint.line_mark(line, from, from + Paint.line_width(runs), () => lit);
  }
  return line;
}

// a text quoted in the input, to reply to it: each of its lines after
// "> " (a blank one ">"), at the input's end on lines of their own, the
// cursor after them (none: all blank, nothing quoted); said for a moment.
// On an agent's page, whose input is read-only, nothing is quoted: said
export function term_quote(t: Term, text: string): void {
  if (text.trim() === "") {
    return;
  }
  if (!View.view_typing(t.v)) {
    return term_toast(t, "Not quoted: this page's input is read-only");
  }
  const ed    = t.scr.ed;
  const lines = text.split("\n");
  const add   = (ed.text === "" || ed.text.endsWith("\n") ? "" : "\n") + lines.map((l) => (l === "" ? ">" : "> " + l)).join("\n") + "\n";
  ed.text     = ed.text + add;
  ed.pos      = ed.text.length;
  t.quoted    = { at: Date.now(), add };
  term_toast(t, "Quoted " + lines.length + (lines.length === 1 ? " line" : " lines") + " · right click to take it out");
}

// a right click: the quote made last taken out of the input, if made
// within UNDO and still there (the cursor kept on the same text)
export function term_unquote(t: Term): void {
  const q = t.quoted;
  t.quoted = null;
  const ed = t.scr.ed;
  const at = q === null || Date.now() - q.at > UNDO ? -1 : ed.text.lastIndexOf(q.add);
  if (at < 0) {
    return;
  }
  ed.text = ed.text.slice(0, at) + ed.text.slice(at + q!.add.length);
  ed.pos  = ed.pos <= at ? ed.pos : Math.max(at, ed.pos - q!.add.length);
  term_toast(t, "Quote taken out");
}

// a text copied (OSC 52), said for a moment over the input (none: all
// blank, nothing copied)
export function term_copied(t: Term, text: string): void {
  if (text.trim() !== "") {
    Screen.screen_copy(text);
    term_toast(t, "Copied " + text.length + " characters");
  }
}
