// Frame
// =====
// The screen painted, a frame at most each FRAME ms: the head; the chat
// (or a pane; over its foot the commands suggested, else the picker, the
// cursor in its search if it has one), the side beside it (Side.ts); the
// notes, the toast and the jump to the end; the rule (what runs, the ∞
// traced), the input, the pages, the pick. A pipe gets text.

import { term_asks, term_form_lines } from "./Asks.ts";
import { term_suggest, term_suggested } from "./Commands.ts";
import * as config from "../config/Config.ts";
import * as Draw from "../ui/Draw.ts";
import { term_hint } from "./Keys.ts";
import * as Paint from "../ui/Paint.ts";
import { term_shown } from "./Notices.ts";
import { term_profile_pick } from "./ProfileCommands.ts";
import * as Screen from "../ui/Screen.ts";
import { term_area, term_under } from "./Select.ts";
import { term_side, term_side_width, term_tokens } from "./Side.ts";
import { term_act, type Area, type Item, type Pane, type Sug, type Term } from "./Term.ts";
import { GLYPH } from "../ui/Theme.ts";
import * as View from "../ui/View.ts";

// the folder illi works in, as the head shows it
const HERE = config.config_home(process.cwd());

// the margin left and right of the chat and the input
const MARGIN = 2;

// a note's indent: its text starts where the rule's does
const NOTE_IN = 3;

// the jump to the chat's end, and how many rows over the chat's last it
// floats
const JUMP    = " ↓ Jump to Bottom · Ctrl+End ";
const JUMP_UP = 1;

// a pipe's lines' width
const PIPE = 76;

// a paint's frame: a stream's pieces come faster than a screen shows
// them (ms)
const FRAME = 16;

// a size held this long is settled: a drag's sizes come faster (ms)
const SETTLE = 30;

// the mark over the input while work runs, as illimitable has no end:
// an infinity sign traced for ever, in braille (a cell 2 dots wide and 4
// high, so 4 cells hold a ∞ 8 by 4): its path, round its left loop and
// its right, crossing in the middle; a trail of TRAIL dots runs along it,
// a dot each TRACE (ms). A cell takes one color: the cell holding the
// head is in the accent, each other fades by its newest dot's age, so the
// tail dies away; where the path crosses itself, a dot more than CROSS
// older than its cell's newest is left out. Each subagent at work in the
// side gets the same in one cell: a trail of ORBIT_TRAIL round its edge,
// a dot each 2 TRACE. One clock draws them all, waking only as they
// change (term_wake)
const INFINITY: [number, number][] = [[3, 2], [2, 3], [1, 3], [0, 2], [0, 1], [1, 0], [2, 0], [3, 1], [4, 2], [5, 3], [6, 3], [7, 2], [7, 1], [6, 0], [5, 0], [4, 1]];
const TRAIL       = 8;
const CROSS       = 3;
const TRACE       = 80;
const ORBIT: [number, number][] = [[0, 0], [1, 0], [1, 1], [1, 2], [1, 3], [0, 3], [0, 2], [0, 1]];
const ORBIT_TRAIL = 3;

// a braille dot's bit, by its column (0, 1) and row (0 to 3)
const DOT = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]];

// the rule's start, before the trace while work runs
const RULE_HEAD = "── ";

// the input's hint on an agent's tab, the main agent's name after it (in
// the chat's: the suggested reply, if any)
const OFF = "Read-only · Ctrl+PgUp back to ";

// the commands suggested: the most lines shown, the keys said in its top
// edge; the picker's widest
const SUGGEST   = 10;
const SUGGESTED = "Commands · ↑↓ · Tab fills in · Enter runs · Esc";
const PICKER_W  = 72;

// the box in the screen's middle (Chooser middle): the share of the
// screen's rows it takes at most; how far from the background all else under it
// is drawn, and the box's own background, toward white (toward black on
// a light one)
const MIDDLE    = 1 / 2;
const BACKDROP  = 0.16;
const PANEL     = 0.05;

// the least of a picker's option's next column shown cut (term_about)
const CUT       = 8;

// a new size: every row written again, once the size settles
export function term_resize(t: Term): void {
  clearTimeout(t.settle);
  t.settle = setTimeout(() => term_redraw(t), SETTLE);
}

export function term_redraw(t: Term): void {
  Screen.screen_wipe(t.scr);
  term_draw(t);
}

// a paint, a frame from now, unless one is due
export function term_draw(t: Term): void {
  if (!t.due) {
    t.due = true;
    setTimeout(() => term_paint(t), FRAME);
  }
}

// the screen, top to bottom: the head; the chat (or a pane), the side
// beside it on a wide screen; over their foot, its last line right on
// the input, a box: as a /word is typed, the commands it matches (as
// wide as the input), else the picker (at the chat's left; the palette's
// in the screen's middle, all else dimmed under it); a row with, at the chat's right
// end, a toast in the theme's blue (its links'); a rule (what runs,
// while it does), the input, a rule, the pages, the agent
// and the pick. The notes, however the chat is scrolled, end over the
// input: the newest in the rule, the one before it, faded, in the row
// above (unless the toast leaves it no room); while work runs (its
// status has the rule), the newest alone, in the row above. Only what is
// left over takes rows from the chat. Scrolled up, a button floats over
// the chat's foot, in its middle: a jump to its end (a click goes there,
// as Ctrl+End does). A pipe gets the notes as text
export function term_paint(t: Term): void {
  t.due   = false;
  term_asks(t);
  const said = term_shown(t);
  if (!t.scr.tty) {
    term_print(said.notes.map(View.Cap));
    return;
  }
  t.hits  = [];
  t.areas = [];
  const { w, h } = Screen.screen_size();
  const full  = w - 1;
  const side  = term_side_width(t, w);
  const left  = t.side.place === "left" ? side : 0;
  const cw    = full - side - 2 * MARGIN;
  const iw    = full - 2 * MARGIN;
  const off   = !View.view_typing(t.v);
  const paned = t.pane !== null;
  const form  = t.choose === null ? term_form_lines(t, iw, Math.max(1, Math.floor(h / 4))) : null;
  const input = paned ? { lines: [], at: null } : form ?? Screen.screen_input(t.scr, iw, Math.max(1, Math.floor(h / 3)), off ? OFF + (t.v.agent ?? View.MAIN) : term_hint(t), off);
  const idle  = View.view_doing(t.v) === null;
  const notes = term_notes(idle ? said.notes : said.notes.slice(-1), iw - 2 * NOTE_IN);
  const ruled = idle ? notes.pop() : undefined;
  const last  = notes.at(-1);
  const roomy = last !== undefined && NOTE_IN + Paint.line_width(last) + 1 + Paint.text_width(said.toast) <= left + cw;
  const lead  = roomy ? [Paint.Run(" ".repeat(NOTE_IN)), ...notes.pop()!] : [];
  const above = notes.slice(-Math.floor(h / 4)).map((l) => [Paint.Run(" ".repeat(NOTE_IN)), ...l]);
  const tall  = Math.max(1, h - (paned ? 4 : 5) - input.lines.length - above.length);
  const mid   = t.choose?.middle !== undefined;
  const box   = mid ? term_middle(t, full, h) : term_box(t, iw, Math.min(cw, PICKER_W), left + MARGIN, tall + 1 + above.length);
  const top   = box === null ? Infinity : mid ? Math.floor((h - box.items.length) / 2) : 2 + tall + above.length - box.items.length;
  const view  = term_view(t, cw, tall, 1, left + MARGIN);
  for (let r = top; r <= tall && !mid; r++) {
    view.lines[view.first + r - 1] = [];
  }
  const shown = term_area(t, view);
  const sw    = side - (left > 0 ? 3 : 2);
  const at    = left > 0 ? 0 : full - side;
  const sides = side === 0 ? [] : term_side(t, sw, tall);
  const sided = term_area(t, { key: "side", lines: sides.map((s) => s[0]), first: 0, row: 1, col: left > 0 ? 1 : at + 2, w: sw, tall: sides.length });
  const blue  = { ...Paint.INK, c: Draw.draw_theme().link ?? "4" };
  const toast = box !== null ? [] : [...lead, Paint.Run(" ".repeat(Math.max(1, left + cw - Paint.line_width(lead) - Paint.text_width(said.toast)))), Paint.Run(said.toast, blue)];
  const lines = [...above, toast, term_rule(t, iw, ruled), ...input.lines, ...(paned ? [] : [Paint.rule(iw)]), Paint.tabs_line(t.v, iw, side === 0)];
  const foot  = term_area(t, { key: "foot", lines, first: 0, row: 1 + tall, col: MARGIN, w: iw, tall: lines.length });
  const head  = term_area(t, { key: "head", lines: [term_head(t, full)], first: 0, row: 0, col: 0, w: full, tall: 1 });
  const rows: Screen.Piece[][] = [[{ col: 0, w: full, line: head[0] }]];
  for (let k = 0; k < tall; k++) {
    const by = sides[k] === undefined || (box?.wide && 1 + k >= top) ? [] : [{ col: at, w: side, line: term_side_line(sided[k], sw, left > 0) }];
    rows.push([{ col: left + MARGIN, w: cw, line: shown[k] }, ...by]);
    term_hit(t, 1 + k, at, at + side, by.length === 0 ? null : sides[k]?.[1] ?? null);
  }
  rows.push(...foot.map((line) => [{ col: MARGIN, w: iw, line }]));
  if (box !== null) {
    term_over(t, rows, box, top, mid);
  } else if (t.pane === null && t.scroll > 0) {
    term_jump(t, rows, tall, left + MARGIN, cw, blue);
  }
  t.hover = t.sel?.held ? undefined : term_under(t, t.scr.point);
  term_tabs(t, h - 1, side === 0);
  const cursor = box?.at !== undefined ? { row: top + box.at.row, col: box.col + box.at.col } : input.at === null ? null : { row: 3 + tall + above.length + input.at.row, col: MARGIN + input.at.col };
  const with_ = sides.map((_, k) => k).filter((k) => rows[1 + k].length > 1 && !(box?.wide && 1 + k >= top));
  t.ruled = { row: 2 + tall + above.length, w: iw, at: cursor, rows, side: box === null ? { at, w: side, sw, left: left > 0, tall, with: with_ } : null, spin: term_spinner(Date.now() - t.since) };
  t.scr.blink = idle || form !== null;
  Screen.screen_paint(t.scr, rows, cursor);
}

// a line of the side, w wide, with its edge toward the chat: the side
// on the left, its line at its right; else at its left
function term_side_line(line: Paint.Line, w: number, left: boolean): Paint.Line {
  return left ? [Paint.Run(" "), ...line, Paint.Run(" ".repeat(Math.max(0, w - Paint.line_width(line))) + " │", Paint.DIM)] : [Paint.Run("│ ", Paint.DIM), ...line];
}

// the notes' lines, oldest first, w wide: the newest in the ink, the
// ones before it faded
function term_notes(notes: string[], w: number): Paint.Line[] {
  return notes.flatMap((text, k) => Paint.runs_wrap([Paint.Run(Paint.text_clean(text), { ...(k === notes.length - 1 ? Paint.INK : Paint.DIM), i: true })], w, false));
}

// the jump to the chat's end, floating over its foot (JUMP_UP rows over
// its last), in its middle: reversed, in the theme's blue, a space clear
// on each side; a click goes there, as Ctrl+End does. Too narrow: its
// arrow alone
function term_jump(t: Term, rows: Screen.Piece[][], tall: number, col: number, w: number, blue: typeof Paint.INK): void {
  const said = JUMP.length + 2 <= w ? JUMP : " ↓ ";
  const bw   = said.length + 2;
  const row  = 1 + Math.max(0, tall - 1 - JUMP_UP);
  const at   = col + Math.max(0, Math.floor((w - bw) / 2));
  rows[row].push({ col: at, w: bw, line: [Paint.Run(" "), Paint.Run(said, { ...blue, v: true, b: true }), Paint.Run(" ")] });
  term_hit(t, row, at, at + bw, () => (t.scroll = 0));
}

// the rule over the input; while work runs: what runs (term_working),
// kept for the clock to write again alone; else a note's line, if one
// is given
function term_rule(t: Term, w: number, note?: Paint.Line): Paint.Line {
  const doing = View.view_doing(t.v);
  term_spin(t, doing !== null);
  t.doing = doing;
  if (doing === null) {
    return note === undefined ? Paint.rule(w) : [Paint.Run("─".repeat(NOTE_IN - 1) + " ", Paint.DIM), ...note, Paint.Run(" " + "─".repeat(Math.max(0, w - NOTE_IN - 1 - Paint.line_width(note))), Paint.DIM)];
  }
  return term_working(t, doing, w, Date.now());
}

// the rule while work runs, w wide, at a time: the ∞ traced, the step
// it is at (bold, in the accent), how long it has run, the tokens the
// models wrote (once any) and how fast they write now (while they do,
// unless the tps setting is off), cut to the width
function term_working(t: Term, doing: View.Doing, w: number, now: number): Paint.Line {
  const c    = Draw.draw_theme().accent ?? "5";
  const head = [Paint.Run(RULE_HEAD, Paint.DIM), ...term_trace(now - t.since, c, t.scr.canvas), Paint.Run(" "), Paint.Run(doing.verb, { ...Paint.INK, c, b: true })];
  const tail = [term_elapsed(now - t.since), doing.tokens > 0 ? "↓ " + term_tokens(doing.tokens) + " tokens" : "", doing.rate > 0 && config.TPS ? doing.rate + " tok/s" : ""].filter((x) => x !== "").join(" · ");
  const room = w - Paint.line_width(head) - 6;
  const said = Paint.text_width(tail) <= room ? tail : room < 2 ? "" : Paint.runs_wrap([Paint.Run(tail)], room - 1, true)[0].map((r) => r.x).join("") + "…";
  const used = Paint.line_width(head) + Paint.text_width(said) + 4;
  return [...head, Paint.Run(" · " + said + " ", Paint.DIM), Paint.Run("─".repeat(Math.max(0, w - used)), Paint.DIM)];
}

// the trace's clock: it starts as work does (when kept), stops as it
// ends; it wakes only when the rule would look different (term_wake)
function term_spin(t: Term, on: boolean): void {
  if (on && t.spin === undefined) {
    t.since = Date.now();
    term_wake(t);
  } else if (!on && t.spin !== undefined) {
    clearTimeout(t.spin);
    t.spin = undefined;
  }
}

// the clock set for the trace's next dot; the work's second shows with
// it, at most TRACE late. Nothing between: the side's spinners change
// with every other dot
function term_wake(t: Term): void {
  t.spin = setTimeout(() => {
    term_tick(t);
    if (t.spin !== undefined) {
      term_wake(t);
    }
  }, TRACE - ((Date.now() - t.since) % TRACE) + 1);
}

// a wake of the clock: the rule written again alone, where it was last
// painted, from what ran then; with agents at work and their spinner
// changed, the side's rows too (term_side_again). No paint, no layout of
// the chat; a whole paint only once work ended, with text chosen (its
// look may cover them) or the box in the middle open (the rule dimmed
// under it); nothing while a paint is due
function term_tick(t: Term): void {
  const r = t.ruled;
  if (t.due) {
    return;
  }
  if (r === null || t.doing === null || t.sel !== null || t.choose?.middle !== undefined || !View.view_running(t.v)) {
    return term_paint(t);
  }
  const now = Date.now();
  t.doing   = View.view_doing(t.v, now) ?? t.doing;
  Screen.screen_row(t.scr, r.row, [{ col: MARGIN, w: r.w, line: term_working(t, t.doing, r.w, now) }], r.at);
  const spin = term_spinner(now - t.since);
  if (t.v.agents.length > 0 && spin !== r.spin) {
    r.spin = spin;
    term_side_again(t);
  }
}

// the side's rows written again alone, beside the chat's as last painted
// (each written only if it changed); a box over them: a whole paint
function term_side_again(t: Term): void {
  const r = t.ruled!;
  if (r.side === null) {
    return term_paint(t);
  }
  const { at, w, sw, left, tall } = r.side;
  const sides = term_side(t, sw, tall);
  for (const k of r.side.with) {
    if (sides[k] !== undefined) {
      r.rows[1 + k][1] = { col: at, w, line: term_side_line(sides[k][0], sw, left) };
      Screen.screen_row(t.scr, 1 + k, r.rows[1 + k], r.at);
    }
  }
}

// a subagent's spinner, ms into the work: ORBIT_TRAIL dots round one
// braille cell, a dot each 2 TRACE
export function term_spinner(ms: number): string {
  const head = Math.floor(ms / (2 * TRACE)) % ORBIT.length;
  let bits = 0;
  for (let k = 0; k < ORBIT_TRAIL; k++) {
    const [x, y] = ORBIT[(head - k + ORBIT.length) % ORBIT.length];
    bits |= DOT[x][y];
  }
  return String.fromCharCode(0x2800 + bits);
}

// the ∞ ms into its work, in its 4 cells: the trail's TRAIL dots on
// INFINITY, newest first, its head a dot each TRACE; a dot CROSS older
// than its cell's newest left out. Each cell in the accent faded by its
// newest dot's age, a TRAIL-th a step (toward the background, if told;
// else dim from half the trail on)
function term_trace(ms: number, c: string, canvas: string | undefined): Paint.Line {
  const head  = Math.floor(ms / TRACE) % INFINITY.length;
  const cells = [0, 0, 0, 0];
  const young: number[] = [];
  for (let age = 0; age < TRAIL; age++) {
    const [x, y] = INFINITY[(head - age + INFINITY.length) % INFINITY.length];
    young[x >> 1] ??= age;
    if (age - young[x >> 1] <= CROSS) {
      cells[x >> 1] |= DOT[x & 1][y];
    }
  }
  const hex = c.startsWith("#") && canvas !== undefined;
  return cells.map((bits, i) => bits === 0 ? Paint.Run(" ")
    : Paint.Run(String.fromCharCode(0x2800 + bits), hex ? { ...Paint.INK, c: term_mix(c, canvas!, young[i] / TRAIL) } : { ...Paint.INK, c, d: young[i] >= TRAIL / 2 }));
}

// a color f of the way to another (#rrggbb)
export function term_mix(a: string, b: string, f: number): string {
  const at = (hex: string, k: number) => parseInt(hex.slice(k, k + 2), 16);
  return "#" + [1, 3, 5].map((k) => Math.round(at(a, k) + (at(b, k) - at(a, k)) * f).toString(16).padStart(2, "0")).join("");
}

// how long, as a person says it: 7s, 2m 05s, 1h 03m
function term_elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return s < 60 ? s + "s" : s < 3600 ? Math.floor(s / 60) + "m " + two(s % 60) + "s" : Math.floor(s / 3600) + "h " + two(Math.floor(s / 60) % 60) + "m";
}

// a pipe's rows, as text
export function term_print(rows: View.Row[]): void {
  if (rows.length > 0) {
    Screen.screen_print(term_inset([[], ...Paint.rows_lines(rows, PIPE)]));
  }
}

function term_inset(lines: Paint.Line[]): Paint.Line[] {
  const pad = Paint.Run(" ".repeat(MARGIN));
  return lines.map((l) => [pad, ...l]);
}

// a click's place on the screen (none without a run)
function term_hit(t: Term, row: number, col: number, to: number, run: (() => void) | null): void {
  if (run !== null) {
    t.hits.push({ row, col, to, run });
  }
}

// the head: illimitable, the page shown, the folder; at its right, a pane's
// title, else what works
function term_head(t: Term, w: number): Paint.Line {
  const bold  = { ...Paint.INK, b: true };
  const page  = t.v.page === null ? [] : [Paint.Run(" › " + t.v.page.name, bold)];
  const left  = [Paint.Run(" " + View.NAME, bold), ...page, Paint.Run("  " + HERE, Paint.DIM)];
  const work  = t.v.agents.length === 0 ? "" : t.v.agents.length + " at work";
  return Paint.ends_line(left, work === "" ? "" : work + " ", w);
}

// the area over the input, tall rows from screen row `row`, column
// `col`: a pane's lines, else the chat's (each scrolled by a drag past
// its edge)
function term_view(t: Term, w: number, tall: number, row: number, col: number): Area {
  const pane  = t.pane;
  const [lines, first] = pane !== null ? term_paned(t, pane, w, tall) : term_chat(t, w, tall, row, col);
  const scroll = pane !== null ? (d: number) => void (pane.scroll = Math.max(0, pane.scroll + d)) : (d: number) => void (t.scroll = Math.max(0, t.scroll - d));
  return { key: pane !== null ? "pane" : "chat", lines, first, row, col, w, tall, scroll };
}

// the box over the chat's foot, room lines at most: as a /word is typed,
// the commands it matches, iw wide (wide: over the side too), else the
// picker, pw wide at column col (none: null); at: the cursor's place in
// it, if it takes the typing (a search)
function term_box(t: Term, iw: number, pw: number, col: number, room: number): { items: Item[]; col: number; w: number; wide: boolean; at?: Screen.Spot } | null {
  const sug = t.asking?.form == null ? term_suggest(t) : null;
  if (sug !== null) {
    return { items: term_suggestions(t, sug, iw, room), col: MARGIN, w: iw, wide: true };
  }
  if (t.choose === null) {
    return null;
  }
  const { items, at } = term_picker(t, pw, room);
  return { items: items.slice(0, room), col, w: pw, wide: false, at };
}

// the picker in the screen's middle (Chooser middle): as wide as it
// asks, the screen allowing, MIDDLE of the screen's rows tall at most
function term_middle(t: Term, full: number, h: number): { items: Item[]; col: number; w: number; wide: boolean; at?: Screen.Spot } {
  const w = Math.min(full - 2 * MARGIN, t.choose!.middle!);
  const { items, at } = term_picker(t, w, Math.min(h - 2, Math.max(4, Math.floor(h * MIDDLE))));
  return { items, col: Math.floor((full - w) / 2), w, wide: false, at };
}

// the box laid over the rows from screen row top on (the chat's under it
// blanked by the caller); a click on its lines goes to it before what
// is under it. Over all (the middle's), all else fades, in one ink near
// the background (dim, if the background wasn't told), and takes no
// click; the box has a background of its own
function term_over(t: Term, rows: Screen.Piece[][], box: { items: Item[]; col: number; w: number }, top: number, all = false): void {
  const under = all ? [] : t.hits;
  const fade  = term_off(t.scr.canvas, BACKDROP);
  const panel = term_off(t.scr.canvas, PANEL);
  const ink   = fade === undefined ? Paint.DIM : { ...Paint.INK, c: fade };
  t.hits = [];
  for (const piece of all ? rows.flat() : []) {
    piece.line = piece.line.map((run) => ({ ...run, s: ink }));
  }
  for (const [k, [line, run]] of box.items.entries()) {
    const own = all && panel !== undefined ? line.map((r) => ({ ...r, s: { ...r.s, g: panel } })) : line;
    rows[top + k].push({ col: box.col, w: box.w, line: own });
    term_hit(t, top + k, box.col, box.col + box.w, run);
  }
  t.hits.push(...under);
}

// a color f of the way from the background (canvas) toward white, or
// toward black on a light one; the background not told: none
function term_off(canvas: string | undefined, f: number): string | undefined {
  if (canvas === undefined) {
    return undefined;
  }
  const light = [1, 3, 5].reduce((n, k) => n + parseInt(canvas.slice(k, k + 2), 16), 0) > 3 * 128;
  return term_mix(canvas, light ? "#000000" : "#ffffff", f);
}

// the chat's lines and the first shown, tall of them: its rows (laid out
// again only once they changed), then what streams or is waited on.
// Scrolled up, the lines read stay in place as more come below, and about
// in place at a new width; a block asked for (/open, /close) shows at the
// top
function term_chat(t: Term, w: number, tall: number, row: number, col: number): [Paint.Line[], number] {
  if (t.body === null || t.body.ver !== t.ver || t.body.w !== w) {
    const marks: Paint.Mark[] = [];
    t.body = { ver: t.ver, w, lines: Paint.rows_lines(View.view_body(t.v), w, marks, 1), marks };
  }
  const tail  = Paint.rows_lines(View.view_tail(t.v, false), w);
  const lines = [[], ...t.body.lines, ...(tail.length === 0 ? [] : [[], ...tail])];
  const find  = t.find === null ? undefined : t.body.marks.find((m) => m.id === t.find![0] && m.n === t.find![1]);
  const wider = t.seen.end - t.seen.col !== w;
  if (t.scroll > 0 && t.seen.total > 0) {
    t.scroll = wider ? Math.round((t.scroll * lines.length) / t.seen.total) : t.scroll + Math.max(0, lines.length - t.seen.total);
  }
  if (find !== undefined) {
    t.scroll = lines.length - tall - find.from + 1;
  }
  t.find   = null;
  t.scroll = Math.max(0, Math.min(t.scroll, lines.length - tall));
  const first = Math.max(0, lines.length - tall - t.scroll);
  t.seen = { total: lines.length, marks: t.body.marks, row, first, tall, col, end: col + w };
  return [lines, first];
}

// a pane, tall lines w wide in the chat's place: its title on a rule
// over it, its keys on one under it (both kept as it scrolls), between
// them as many of its lines (made for the width inside) as fit from its
// scroll; all on the panel's background, the background told, so it
// stands apart from the chat
function term_paned(t: Term, pane: Pane, w: number, tall: number): [Paint.Line[], number] {
  if (pane.w !== w - 2) {
    [pane.w, pane.lines] = [w - 2, pane.make(w - 2)];
  }
  const room  = Math.max(1, tall - 2);
  pane.scroll = Math.max(0, Math.min(pane.scroll, pane.lines.length - room));
  const body  = pane.lines.slice(pane.scroll, pane.scroll + room);
  const rule  = (said: Paint.Line) => [Paint.Run("─ ", Paint.DIM), ...said, Paint.Run(" " + "─".repeat(Math.max(0, w - 3 - Paint.line_width(said))), Paint.DIM)];
  const keys  = [Paint.Run("Esc", { ...Paint.INK, b: true }), Paint.Run(" close" + (pane.lines.length > room ? " · ↑↓ PgUp PgDn scroll" : "") + " · typing goes back to the chat", Paint.DIM)];
  const lines = [rule([Paint.Run(pane.title, { ...Paint.INK, b: true, c: Draw.draw_theme().accent ?? "5" })]), ...body.map((l) => [Paint.Run(" "), ...l]), ...Array.from({ length: room - body.length }, (): Paint.Line => []), rule(keys)];
  const panel = term_off(t.scr.canvas, PANEL);
  const pad   = (l: Paint.Line): Paint.Line => [...l, Paint.Run(" ".repeat(Math.max(0, w - Paint.line_width(l))))];
  return [panel === undefined ? lines : lines.map((l) => pad(l).map((r) => ({ ...r, s: { ...r.s, g: r.s.g || panel } }))), 0];
}

// the picker, framed, w wide, room lines at most: its search first, if
// it has one (the cursor in it: at); each option shown (illi's own and
// each of the user's primary agents; each profile; each model; each
// setting), what it is, the one now marked (none: no marks; one that
// makes something new, "+ ...", has its "+" in the mark's place), the one
// lit bold, the characters the search matched bold in the accent; with
// groups, while nothing is searched, each group's head over its first (a
// blank line before each but the first): as many lines as fit from the
// first in view (moved to keep the lit one in it), the box as tall as all
// of them would be (blank past those shown; none: a note says so), and at its right end what it has aside (its keys, its
// value). Its foot says what the lit one takes besides; a click on one
// picks it. A line asked for (Chooser ask) is its one line, as the input
// shows a message typed, its hint while empty; a search or a line too
// long shows its end
function term_picker(t: Term, w: number, room: number): { items: Item[]; at?: Screen.Spot } {
  const c     = t.choose!;
  const bold  = { ...Paint.INK, b: true };
  const lit   = { ...bold, c: Draw.draw_theme().accent ?? "5" };
  const act   = (name: string) => c.here >= 0 && name.startsWith("+ ");
  const wide  = Math.max(...c.names.map((name) => Paint.text_width(name) - (act(name) ? 2 : 0)));
  const glyph = c.ask === null ? GLYPH.find : GLYPH.input;
  const fits  = w - 5 - Paint.text_width(glyph);
  const text  = c.find?.text ?? "";
  const typed = Paint.text_width(text) <= fits ? text : "…" + Paint.text_graphemes(text).slice(1 - fits).join("");
  const find  = c.find === null ? [] : [[Paint.Run(glyph, Paint.DIM), typed === "" ? Paint.Run(c.ask?.hint ?? "type to search", Paint.DIM) : Paint.Run(typed)]];
  const group = c.heads !== undefined && text === "";
  const heads = group ? 2 * new Set(c.heads).size - 1 : 0;
  const rows  = c.ask !== null ? 0 : Math.max(1, Math.min(c.names.length + heads, room - 2 - find.length));
  const pick  = (k: number) => {
    t.choose = null;
    c.pick(k);
  };
  const item  = (m: Screen.Match, i: number): Item => {
    const name = c.names[m.k];
    const here = i === c.at;
    const head = [
      Paint.Run(here ? "› " : "  ", bold),
      ...(c.here < 0 || act(name) ? [] : [Paint.Run((m.k === c.here ? GLYPH.here : GLYPH.tab) + " ", Paint.DIM)]),
      ...[...name].map((ch, j) => Paint.Run(ch, m.at.includes(j) ? lit : here ? bold : Paint.INK)),
      Paint.Run(" ".repeat(wide - Paint.text_width(name) + (act(name) ? 4 : 2))),
    ];
    const side  = Paint.text_clean(c.aside?.[m.k] ?? "");
    const room  = w - 4 - Paint.line_width(head) - (side === "" ? 0 : Paint.text_width(side) + 2);
    const about = term_about(Paint.text_clean(c.about[m.k]), room);
    const right = side === "" ? [] : [Paint.Run(" ".repeat(Math.max(2, room - Paint.text_width(about) + 2))), Paint.Run(side, Paint.DIM)];
    return [[...head, Paint.Run(about, Paint.DIM), ...right], () => pick(m.k)];
  };
  const list  = c.shown.flatMap((m, i): Array<string | number> => {
    const head = c.heads?.[m.k] ?? "";
    return !group || (i > 0 && head === c.heads![c.shown[i - 1].k]) ? [i] : i === 0 ? [head, i] : ["", head, i];
  });
  const lit_at = list.indexOf(c.at);
  c.top       = Math.max(0, Math.min(c.top, lit_at - (typeof list[lit_at - 1] === "string" ? 1 : 0)), lit_at - rows + 1);
  const line  = (e: string | number): Item => (typeof e === "number" ? item(c.shown[e], e) : [[Paint.Run(e, lit)], null]);
  const none  = [[Paint.Run("  Nothing matches " + Paint.text_clean(text), Paint.DIM)], null] as Item;
  const shown = c.ask !== null ? [] : c.shown.length === 0 ? [none] : list.slice(c.top, c.top + rows).map(line);
  const items = [...find.map((l): Item => [l, null]), ...shown, ...Array.from({ length: rows - shown.length }, (): Item => [[], null])];
  const title = [Paint.Run(" " + c.title + (c.ask === null ? " · ↑↓ Enter · Esc " : " · Enter · Esc "), { ...Paint.DIM, b: true })];
  const said  = c.ask !== null ? c.foot(-1) : c.shown.length === 0 ? "" : c.foot(c.shown[c.at].k);
  const foot  = said === "" ? [] : [Paint.Run(" " + said + " ", { ...Paint.DIM, b: true })];
  const lines = Paint.frame(items.map(([l]) => Paint.runs_wrap(l, w - 4, true)[0]), w, title, foot);
  const after = Paint.text_width(text.slice(c.find?.pos ?? 0));
  const at    = c.find === null ? undefined : { row: 1, col: Math.min(w - 3, 2 + Paint.text_width(glyph) + Math.max(0, Paint.text_width(typed) - after)) };
  return { items: lines.map((l, k) => [l, items[k - 1]?.[1] ?? null]), at };
}

// what a picker's option is, as fits in w columns: whole, else its
// columns (two spaces or more apart) up to the last that fits whole, and
// as much of the next as fits, an ellipsis at its end, if more than CUT
// of it would show; not even the first: cut so
function term_about(text: string, w: number): string {
  if (Paint.text_width(text) <= w) {
    return text;
  }
  const end  = [...text.matchAll(/ {2,}/g)].map((m) => m.index + m[0].length).reverse().find((e) => Paint.text_width(text.slice(0, e)) <= w);
  const cut  = end === undefined || w - Paint.text_width(text.slice(0, end)) > CUT;
  return cut ? (w < 2 ? "" : Paint.line_cut([Paint.Run(text)], 0, w - 1)[1].map((r) => r.x).join("") + "…") : text.slice(0, end).trimEnd();
}

// the commands suggested, framed as the picker is, fw wide, room lines
// at most: each as /help shows how it's typed (its argument dim), then
// what it does (dim), wrapped under itself; the characters the word
// matched bold in the accent, the one lit all in it, marked as the
// picker marks its choice; a click takes one. As many as fit from the
// first shown (moved to keep the one lit whole in view; sug.tall: how
// many fit), the box as tall as all of them would be, SUGGEST lines at
// most (blank past them). None matching, a note says so
function term_suggestions(t: Term, sug: Sug, fw: number, room: number): Item[] {
  const w    = fw - 4;
  const lit  = { ...Paint.INK, c: Draw.draw_theme().accent ?? "5" };
  const bold = { ...lit, b: true };
  const wide = Math.min(Math.max(0, ...sug.found.map((m) => Paint.text_width(sug.cmds[m.k][0]))), Math.floor(w / 2)) + 4;
  const item = (m: Screen.Match, k: number): Item[] => {
    const [use, , text] = sug.cmds[m.k];
    const name = use.split(" ")[0];
    const here = k === sug.at;
    const head = [
      Paint.Run(here ? "› " : "  ", bold),
      ...[...name].map((c, i) => Paint.Run(c, here || m.at.includes(i - 1) ? bold : Paint.INK)),
      Paint.Run(use.slice(name.length), here ? lit : Paint.DIM),
    ];
    const cut  = Paint.line_cut(head, 0, wide - 2)[1];
    const pad  = Paint.Run(" ".repeat(wide - Paint.line_width(cut)));
    const said = Paint.runs_wrap([Paint.Run(Paint.text_clean(text), here ? lit : Paint.DIM)], Math.max(1, w - wide), false);
    const run  = () => term_suggested(t, use, true);
    return said.map((l, i): Item => [i === 0 ? [...cut, pad, ...l] : [Paint.Run(" ".repeat(wide)), ...l], run]);
  };
  const none  = [[Paint.Run("  No command matches " + Paint.text_clean(sug.word), Paint.DIM)], null] as Item;
  const all   = sug.found.length === 0 ? [[none]] : sug.found.map(item);
  const rows  = Math.min(SUGGEST, Math.max(1, room - 2), all.flat().length);
  const fits  = (from: number, to: number) => all.slice(from, to + 1).flat().length <= rows;
  sug.top     = Math.min(sug.top, sug.at);
  while (sug.top < sug.at && !fits(sug.top, sug.at)) {
    sug.top++;
  }
  let end = sug.top;
  while (end + 1 < all.length && fits(sug.top, end + 1)) {
    end++;
  }
  sug.tall    = end - sug.top + 1;
  const shown = all.slice(sug.top).flat().slice(0, rows);
  const items = [...shown, ...Array.from({ length: rows - shown.length }, (): Item => [[], null])];
  const lines = Paint.frame(items.map(([line]) => line), fw, [Paint.Run(" " + SUGGESTED + " ", { ...Paint.DIM, b: true })]);
  return lines.map((l, k) => [l, items[k - 1]?.[1] ?? null]);
}

// the pages' line at screen row `row` (all of them, or the one shown
// alone: the side lists them), then the profile's name, if shown: a click
// on a page shows it, on the name opens the profiles
function term_tabs(t: Term, row: number, all: boolean): void {
  let col = MARGIN;
  for (const tab of View.view_tabs(t.v).filter((tab) => all || tab.here)) {
    const tw = Paint.text_width(tab.text);
    term_hit(t, row, col, col + tw, () => term_act(t, { $: "Goto", name: tab.name }));
    col += tw + 2;
  }
  const pw = Paint.line_width(Paint.tabs_profile(all));
  if (pw > 0) {
    term_hit(t, row, col + 1, col - 2 + pw, () => term_profile_pick(t));
  }
}
