// Select
// ======
// Choosing text, as in Claude Code: a drag anywhere on the screen (the
// chat, a pane, the side, the head, the foot) chooses the text it goes
// over and copies it as it's let go; a double click a word (a path, a
// link), three a line, dragged on, more of them; past a chat's edge, it
// scrolls. A reply's button under the pointer lights, and a click copies
// what it holds.

import * as Draw from "../ui/Draw.ts";
import { term_draw, term_mix } from "./Frame.ts";
import { term_click } from "./Keys.ts";
import { term_toast } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import * as Screen from "../ui/Screen.ts";
import type { Area, Cell, Ink, Sel, Term } from "./Term.ts";

// a drag past a chat's edge scrolls it a line each DRIFT ms; text chosen
// shows on a fill SELECT of the way from the background to the accent; a
// button under the pointer, on a fill LIT of the way from the text's
// color to its label's
const DRIFT  = 50;
const SELECT = 0.3;
const LIT    = 0.3;

// a word's characters, for a double click (a path's, a link's, an
// address's too), and those its end drops
const WORDY  = /^[\p{L}\p{N}\p{M}_\-+.\/\\~:@%?=&#$*]+$/u;
const ENDING = /^[.:?]$/;

// what the button at column col of a line copies (none: no button there)
function term_button(line: Paint.Line, col: number): (() => string) | undefined {
  let at = 0;
  for (const r of line) {
    const w = Paint.text_width(r.x);
    if (col >= at && col < at + w) {
      return r.copy;
    }
    at += w;
  }
  return undefined;
}

// the left button: pressed, a drag starts choosing text in the area under
// it (twice in a row there: from the word under it, a word at a time;
// three times: from its line, a line at a time; a button's own click
// comes first); dragged, the choice follows the pointer (a chat scrolls
// while it's past an edge); let go, the text chosen is copied, else it
// was a click
export function term_mouse(t: Term, key: string): void {
  const p = t.scr.point;
  if (key === "Press") {
    const area = term_area_at(t, p);
    const at   = area === undefined ? null : term_cell(area, p);
    t.sel = null;
    if (area !== undefined && at !== null) {
      const unit = term_under(t, p) === undefined ? t.scr.clicks : 1;
      const root = term_unit(area, at, unit);
      t.sel = { key: area.key, a: root[0], b: root[1], held: true, moved: unit > 1 && !term_after(root[0], root[1]), unit, root };
    }
  } else if (key === "Drag" && t.sel?.held) {
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
      term_click(t);
    }
  }
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

// the text chosen: each line's columns chosen, their ends' spaces dropped
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
    out.push(Paint.line_cut(area.lines[n] ?? [], from, to)[1].map((r) => r.x).join("").trimEnd());
  }
  return out.join("\n");
}

// the word at column col of a line, its columns from to to: a run of
// WORDY characters (a path, a link, an address, a number each one), its
// end's punctuation dropped; else the one character there
function term_word(line: Paint.Line, col: number): [number, number] {
  const cells: { g: string; at: number; w: number }[] = [];
  for (const g of Paint.text_graphemes(line.map((r) => r.x).join(""))) {
    const at = cells.length === 0 ? 0 : cells[cells.length - 1].at + cells[cells.length - 1].w;
    cells.push({ g, at, w: Paint.text_width(g) });
  }
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

// the button under a spot (none: no button there)
export function term_under(t: Term, p: Screen.Spot): (() => string) | undefined {
  const area = t.areas.find((a) => p.row >= a.row && p.row < a.row + a.tall && p.col >= a.col && p.col < a.col + a.w);
  return area === undefined ? undefined : term_button(area.lines[area.first + p.row - area.row] ?? [], p.col - area.col);
}

// the pointer moved: painted again only if it's over another button
export function term_hover(t: Term): void {
  if (!t.sel?.held && term_under(t, t.scr.point) !== t.hover) {
    term_draw(t);
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

// an area's row k: the text chosen in it on the chosen fill (else
// reversed), the button under the pointer lit, as Claude Code lights one:
// in the background's color on a fill near the text's (else reversed)
function term_marked(t: Term, area: Area, k: number): Paint.Line {
  const n      = area.first + k;
  const span   = t.sel?.key === area.key && t.sel.moved ? term_span(t.sel, n) : null;
  const p      = t.scr.point;
  const canvas = t.scr.canvas ?? "";
  const theme  = Draw.draw_theme();
  const hex    = (...cs: (string | undefined)[]) => canvas.startsWith("#") && cs.every((c) => c?.startsWith("#"));
  let line     = area.lines[n] ?? [];
  if (span !== null) {
    const c = theme.accent;
    line = Paint.line_mark(line, span[0], span[1], hex(c) ? (s) => ({ ...s, g: term_mix(canvas, c!, SELECT), v: false }) : (s) => ({ ...s, v: !s.v }));
  }
  const copy = t.sel?.held || p.row !== area.row + k ? undefined : term_button(line, p.col - area.col);
  if (copy !== undefined) {
    const runs  = line.filter((r) => r.copy === copy);
    const from  = Paint.line_width(line.slice(0, line.indexOf(runs[0])));
    const label = runs.find((r) => r.s.c.startsWith("#"))?.s.c;
    const lit: Ink = hex(label, theme.codeText) ? { ...Paint.INK, c: canvas, g: term_mix(theme.codeText, label!, LIT) } : { ...Paint.INK, v: true };
    line = Paint.line_mark(line, from, from + Paint.line_width(runs), () => lit);
  }
  return line;
}

// a text copied (OSC 52), said for a moment over the input (none: all
// blank, nothing copied)
export function term_copied(t: Term, text: string): void {
  if (text.trim() !== "") {
    Screen.screen_copy(text);
    term_toast(t, "Copied " + text.length + " characters");
  }
}
