// Paint
// =====
// The terminal's emitter: View's rows, pick and tabs as lines of
// styled runs, and a line as ANSI (Theme's ink as the text, any other
// dimmed; fills in the terminal's own palette, Theme.ANSI; every other
// color a token's, Draw.draw_tokens: the user's frame, a diff's lines, a
// chip, the profile's name).
// `rows_lines` lays rows out as the site: what the machine wrote
// filled (Theme.FILLED), half blocks rounding the fill's top and
// bottom: a block, its level in a gutter, its summary and its first
// message's id (`#6840`, for /open); a tool call, its name
// bold; its result its own fill. The user's words
// framed, unnamed; an agent's report framed, its name on the top edge
// (Theme.FRAMED); illi's words bare, drawn from their markdown
// (Reply.ts: its code, diagrams, tables, headings, lists and quotes, and
// buttons that copy them); thinking and a note drawn so too, in their
// look, without buttons. A run of work (View's Act) is one dim line,
// [+] what was done (Theme's GLYPH.shut) over its calls, a line each
// (✓ done, ✗ failed: GLYPH.ok, GLYPH.failed), or [-] (GLYPH.open) over
// its rows behind a dim bar, a message in it folded by a click to one
// dim line too; a recap (View's Rule) so too, its line across the chat,
// naming it. An open block
// framed, its bar in the frame's top edge; a call's code framed on the
// call's fill; a file's lines (a read, a diff) framed, the file on the
// top edge, each numbered. Control characters never reach the terminal.
// A row's lines are laid out once per width and look (a reply streaming,
// only past its finished blocks: Reply.ts); a chat's rows from its last
// up, only as far as asked (laid_up: a paint asks for what shows, so the
// top of a long chat waits till it is scrolled to). Each thing a click
// acts on is marked in them by its key (Mark: a block, a run of work, a
// message in an open run, the innermost holding a line), and the runs
// that light with it are tagged with that key (Tag: a run's glyph, its
// label, its bar), so what lights and what a click finds are told at
// layout, never by columns (line_lit).

import type { Kind } from "../ai/AskAI.ts";
import * as Call from "./Call.ts";
import * as config from "../config/Config.ts";
import * as Draw from "./Draw.ts";
import * as Md from "./Md.ts";
import { Plugins, type Piece } from "../config/Plugins.ts";
import { DEFAULT } from "../config/Profiles.ts";
import * as Reply from "./Reply.ts";
import * as Theme from "./Theme.ts";
import * as View from "./View.ts";

// Types
// =====

// an ink: dim, bold, italic, underlined, reversed, struck through, a
// link's url ("": none), its color and its fill (an ANSI palette index
// "0"-"15", a palette's #rrggbb, or "": the terminal's own)
export type Ink = { d: boolean; b: boolean; i: boolean; u: boolean; v: boolean; t: boolean; k: string; c: string; g: string };

// text in an ink; a button's: what a click copies (Reply.ts, Term.ts);
// a part of a mark's: it lights with it (Tag)
export type Run = { x: string; s: Ink; copy?: () => string; mark?: Tag };

// a run's part in the mark it lights with, by the mark's key (line_lit):
// its glyph (a run of work's mark, open or shut, a folded message's:
// Theme.GLYPH), a run of work's label (a shut one's calls' words too:
// act_calls), its bar down the left of its rows
// (a click on it is the run's), or a block's text that lights (its
// gutter and /open, an open block's bar). Each is the mark's own
// control, no word: a click on one acts at once (Select.ts term_wordy)
export type Tag = { key: string; as: "glyph" | "label" | "bar" | "text" };

export type Line = Run[];

// a thing a click acts on, in lines laid out (Term.ts): its first line,
// the line past its last, its key (mark_key: a click's pin and the light
// find it by it), its first message's id and size, whether open. A
// block's: a summary (a click opens it), an open block, its whole frame
// (a click shuts it); a run of work's or a recap's (act, n 0): its head
// and every line under it (a click on its head or its bar opens or
// closes it); a message's in an open run, whole or folded (fold, n 0: a
// click folds or unfolds it). Inside a run or an open block, a gap line
// is the block's above it; up: the run it is in (the run's bar beside it
// lights with it)
export type Mark = { from: number; to: number; key: string; id: number; n: number; open: boolean; act?: true; fold?: true; up?: string };

// rows laid out from the last up, only as far as asked (laid_up): the
// rows, the first of them laid out, their lines as from line `at` on,
// the blocks marked in them, at a width and look
export type Laid = { rows: View.Row[]; from: number; at: number; w: number; look: number; lines: Line[]; marks: Mark[] };

// Constants
// =========

export const INK: Ink = { d: false, b: false, i: false, u: false, v: false, t: false, k: "", c: "", g: "" };
export const DIM: Ink = { ...INK, d: true };

// the gutter of a block: its level, and the space after it
const GUTTER = 7;

// the narrowest last line the mode shows on (tabs_mode)
const MODE_ROOM = 50;

// the most lines a shut run lists its calls on (act_calls)
const CALLS = 6;

const GRAPHEMES = new Intl.Segmenter("en", { granularity: "grapheme" });

// each row's lines, at the width and look they were laid out at
// (row_cached; the look: Draw.draw_stamp, counted up as the colors
// change); the terminal's background, as told (null: not yet)
const LAID = new WeakMap<View.Row, { w: number; look: number; lines: Line[] }>();
let CANVAS: string | null = null;

// the reply last laid out, as far as it was finished (Reply.reply_grow),
// at the look it was: a stream's next text lays out only what follows
let GROWN: { look: number; grown: Reply.Grown } | null = null;

// how much a fill lightens a dark background, darkens a light one; the
// fill (the user's ANSI.block, else a shade of the background once told;
// "": none)
const SHADE_DARK  = 0.08;
const SHADE_LIGHT = 0.06;
let FILL = Theme.ANSI.block ?? "";

// Constructors
// ============

export function Run(x: string, s: Ink = INK, mark?: Tag): Run {
  return mark === undefined ? { x, s } : { x, s, mark };
}

// Text
// ====

export function text_width(s: string): number {
  return Bun.stringWidth(s);
}

// text on one line, without control characters: newlines as spaces,
// tabs as two
export function text_clean(s: string): string {
  return s.replace(/\t/g, "  ").replace(/\n/g, " ").replace(/[\x00-\x1f\x7f-\x9f]/g, "");
}

// text on one line, cleaned (text_clean), each run of spaces one, none
// at its ends: a command as a list shows it
export function text_line(s: string): string {
  return text_clean(s).replace(/\s+/g, " ").trim();
}

export function text_graphemes(s: string): string[] {
  return [...GRAPHEMES.segment(s)].map((g) => g.segment);
}

// Line
// ====

// runs into lines of w columns: prose breaks between words (the space at a
// break dropped), a word made of several runs (`code`, **bold**) kept
// whole; code (hard) and a word wider than a line, a link's too, at any
// character (a link's pieces keep its url, so each opens it whole; a
// run's pieces keep its button and its tag). A run that fits in the rest
// of its line goes whole, unless it would start a line that a break
// began.
export function runs_wrap(runs: Line, w: number, hard: boolean): Line[] {
  const out: Line[] = [[]];
  let col = 0;
  for (const r of runs) {
    const whole  = col + text_width(r.x) <= w && (col > 0 || out.length === 1);
    const words  = whole ? [r.x] : hard ? [] : r.x.split(/(\s+)/).filter((p) => p !== "");
    const broken = hard && !whole ? text_graphemes(r.x) : words.flatMap((p) => (text_width(p) <= w ? [] : text_graphemes(p)));
    const pieces = hard && !whole ? broken : words.flatMap((p) => (text_width(p) <= w ? [p] : text_graphemes(p)));
    for (const p of pieces) {
      const pw = text_width(p);
      if (col > 0 && col + pw > w) {
        const word = hard || broken.length > 0 || !/^\S/.test(p) ? [] : line_word(out[out.length - 1], w - pw);
        out.push(word);
        col = line_width(word);
      }
      if (!(!hard && /^\s+$/.test(p) && col === 0 && out.length > 1)) {
        out[out.length - 1].push({ ...r, x: p });
        col += pw;
      }
    }
  }
  return out;
}

// the word a line ends in, taken off it to start the next line with
// (back to its last space), if it is no wider than room; none (the line
// ends in a space, or is all one word, or it's too wide): nothing taken
function line_word(l: Line, room: number): Line {
  for (let k = l.length - 1; k >= 0; k--) {
    const tail = /\S*$/.exec(l[k].x)![0];
    if (tail.length < l[k].x.length) {
      const word = [...(tail === "" ? [] : [{ ...l[k], x: tail }]), ...l.slice(k + 1)];
      if (line_width(word) > room) {
        return [];
      }
      l.splice(k, l.length - k, { ...l[k], x: l[k].x.slice(0, l[k].x.length - tail.length) });
      return word;
    }
  }
  return [];
}

export function line_width(l: Line): number {
  return l.reduce((n, r) => n + text_width(r.x), 0);
}

// a line cut at columns from and to: its runs before, between, after (a
// character either cuts taken whole, between)
export function line_cut(l: Line, from: number, to: number): [Line, Line, Line] {
  const out: [Line, Line, Line] = [[], [], []];
  let col = 0;
  for (const r of l) {
    const w = text_width(r.x);
    const pieces = col >= from && col + w <= to ? [r.x] : text_graphemes(r.x);
    for (const p of pieces) {
      const pw   = text_width(p);
      const side = col >= to ? 2 : col + Math.max(pw, 1) <= from ? 0 : 1;
      const last = out[side][out[side].length - 1];
      if (last !== undefined && last.s === r.s && last.copy === r.copy && last.mark === r.mark) {
        out[side][out[side].length - 1] = { ...last, x: last.x + p };
      } else {
        out[side].push({ ...r, x: p });
      }
      col += pw;
    }
  }
  return out;
}

// a line in w columns: whole if it fits, else as much of it as fits
// before `more` (a "…"), no character crossing the edge (line_cut takes
// one whole); past the edge no character is taken one by one, so a long
// line (a heredoc's command) costs about what a short one does
export function line_fit(l: Line, w: number, more: Run): Line {
  if (line_width(l) <= w) {
    return l;
  }
  const out: Line = [];
  let room = w - text_width(more.x);
  for (const r of l) {
    const rw = text_width(r.x);
    if (rw <= room) {
      out.push(r);
      room -= rw;
      continue;
    }
    let x = "";
    for (const { segment } of GRAPHEMES.segment(r.x)) {
      const pw = text_width(segment);
      if (pw > room) {
        break;
      }
      [x, room] = [x + segment, room - pw];
    }
    if (x !== "") {
      out.push({ ...r, x });
    }
    break;
  }
  return room < 0 ? out : [...out, more];
}

// a line, its columns from to to in another ink (f of each run's)
export function line_mark(l: Line, from: number, to: number, f: (s: Ink) => Ink): Line {
  const [before, mid, after] = line_cut(l, from, to);
  return [...before, ...mid.map((r) => ({ ...r, s: f(r.s) })), ...after];
}

// a line as ANSI: an ink's codes only where the ink changes (a link open
// over all its runs), back to the plain ink at its end; its end's spaces
// dropped unless filled or reversed
export function line_ansi(l: Line): string {
  let out = "";
  let was: Ink | null = null;
  for (const r of l) {
    out += ink_ansi(was, r.s) + r.x;
    was = r.s;
  }
  return (was?.g || was?.v ? out : out.trimEnd()) + ink_ansi(was, INK);
}

// the codes that change ink was (null: a line's start) to s; dim text
// of no color of its own in the theme's dim, if it has one (else the
// terminal's faint)
function ink_ansi(was: Ink | null, s: Ink): string {
  if (was !== null && was.d === s.d && was.b === s.b && was.i === s.i && was.u === s.u && was.v === s.v && was.t === s.t && was.k === s.k && was.c === s.c && was.g === s.g) {
    return "";
  }
  const dim  = s.d && s.c === "" ? Draw.draw_tokens().dim : "";
  const end  = was !== null && was.k !== "" ? "\x1b]8;;\x1b\\" : "";
  const sgr  = "\x1b[0" + (s.b ? ";1" : "") + (s.i ? ";3" : "") + (s.u ? ";4" : "") + (s.d && dim === "" ? ";2" : "") + (s.v ? ";7" : "") + (s.t ? ";9" : "") + color_sgr(38, s.c || dim) + color_sgr(48, s.g) + "m";
  const link = s.k === "" ? "" : "\x1b]8;;" + s.k + "\x1b\\";
  return end + sgr + link;
}

// a palette color as the SGR that sets it (at 38: the text, 48: the
// fill; "": none), its basic code (30-37/90-97 or 40-47/100-107), past 15
// the 256 colors' (38;5;n); a #rrggbb as true color; any other none
export function color_sgr(at: number, c: string): string {
  if (c === "") {
    return "";
  }
  if (c.startsWith("#")) {
    return ";" + at + ";2;" + [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16)).join(";");
  }
  const i = Number(c);
  if (!Number.isInteger(i) || i < 0 || i > 255) {
    return "";
  }
  return i < 16 ? ";" + (at - 8 + (i < 8 ? i : 60 + i - 8)) : ";" + at + ";5;" + i;
}

// lines on a fill iw columns wide inside, a column of it each side, a
// half block above and below; a run without its color in the fill's ink.
// No fill (the background untold): a dim bar at their left
function fill_lines(body: Line[], iw: number): Line[] {
  const g    = FILL;
  if (g === "") {
    return body.map((l) => [Run("▎", DIM), ...l]);
  }
  const pad  = { ...INK, g };
  const edge = (c: string) => [Run(c.repeat(Math.max(0, iw + 2)), { ...INK, c: g })];
  const ink  = (r: Run): Run => ({ ...r, s: { ...r.s, g, c: r.s.c || (Theme.ANSI.ink ?? "") } });
  const mid  = body.map((l) => [Run(" ", pad), ...l.map(ink), Run(" ".repeat(Math.max(0, iw - line_width(l))) + " ", pad)]);
  return [edge("▄"), ...mid, edge("▀")];
}

// lines in a frame iw columns wide inside, a title in its top edge and
// a foot in its bottom one (none: a plain edge), each cut at the edge's
// end
function frame_lines(body: Line[], iw: number, edge: Ink, title: Line, foot: Line = []): Line[] {
  const head = runs_wrap(title, iw + 1, true)[0];
  const tail = runs_wrap(foot, iw + 1, true)[0];
  const bar  = "─".repeat(Math.max(0, iw + 1 - line_width(head)));
  const top  = [Run("╭─", edge), ...head, Run(bar + "╮", edge)];
  const end  = foot.length === 0 ? [Run("╰" + "─".repeat(Math.max(0, iw + 2)) + "╯", edge)] : [Run("╰─", edge), ...tail, Run("─".repeat(Math.max(0, iw + 1 - line_width(tail))) + "╯", edge)];
  const pad  = (l: Line) => Run(" ".repeat(Math.max(0, iw - line_width(l))));
  const mid  = body.map((l) => [Run("│ ", edge), ...l, pad(l), Run(" │", edge)]);
  return [top, ...mid, end];
}

// each x's lines, a blank line between each two
function lines_join<T>(xs: T[], f: (x: T) => Line[]): Line[] {
  return xs.flatMap((x, k) => (k === 0 ? f(x) : [[], ...f(x)]));
}

// Row
// ===

// rows a blank line apart: one block per message, in its order; each
// thing a click acts on marked (Mark), as laid out from line `at` on: a
// summary, an open block, a run of work or a recap, and in an open run
// (run: its key) each message, whole or folded. Inside a run or an open
// block (inner), a gap line is the block's above it, so the pointer
// going down a run of summaries never falls between them
export function rows_lines(rows: View.Row[], w: number, marks: Mark[] = [], at = 0, run: string | null = null, inner = false): Line[] {
  const out: Line[] = [];
  let last: Mark | null = null;
  for (const [k, row] of rows.entries()) {
    if (k > 0) {
      out.push([]);
      if (inner && last !== null) {
        last.to += 1;
      }
    }
    const from  = at + out.length;
    const mark  = row_mark(row, from, run);
    if (mark !== null) {
      marks.push(mark);
    }
    const lines = [...(row.$ === "Box" ? box_lines(row, w, marks, from) : row.$ === "Act" || row.$ === "Rule" ? act_lines(row, w, marks, from) : row_cached(row, w)), ...images_lines(row)];
    if (mark !== null) {
      mark.to = from + lines.length;
    }
    last = mark;
    out.push(...lines);
  }
  return out;
}

// a row's mark, from line `at` (its end set once it is laid out; none:
// null): a summary's or an open block's; a run of work's or a recap's;
// in a run (its key), a message's, whole or folded, and the run noted
// on each of its marks (up)
function row_mark(row: View.Row, at: number, run: string | null): Mark | null {
  const key = mark_key(row);
  const up  = run === null ? {} : { up: run };
  switch (row.$) {
    case "Sum":
    case "Box": {
      return { from: at, to: at, key: key!, id: row.id, n: row.n, open: row.$ === "Box", ...up };
    }
    case "Act":
    case "Rule": {
      return { from: at, to: at, key: key!, id: row.id, n: 0, open: row.open, act: true };
    }
    case "Msg":
    case "Fold": {
      return run === null || key === null ? null : { from: at, to: at, key, id: row.$ === "Msg" ? row.id ?? -1 : -1, n: 0, open: row.$ === "Msg", fold: true, ...up };
    }
    case "Cap": {
      return null;
    }
  }
}

// the key a row's mark has (none: null): a block's, the same summed up
// or open ("b" id "+" n: block_key); a run of work's or a recap's ("r"
// and its key: View.view_acts); a message's, whole or folded
// (View.row_fold: "#" id, a thought's "m" ...)
export function mark_key(row: View.Row): string | null {
  switch (row.$) {
    case "Sum":
    case "Box": {
      return block_key(row.id, row.n);
    }
    case "Act":
    case "Rule": {
      return "r" + row.id;
    }
    case "Msg": {
      return View.row_fold(row);
    }
    case "Fold": {
      return row.key;
    }
    case "Cap": {
      return null;
    }
  }
}

// a block's mark key, summed up or open (block id, n)
export function block_key(id: number, n: number): string {
  return "b" + id + "+" + n;
}

// rows to lay out, w wide, as from line `at` on: none yet
export function laid_new(rows: View.Row[], w: number, at = 0): Laid {
  return { rows, from: rows.length, at, w, look: Draw.draw_stamp(), lines: [], marks: [] };
}

// whether rows laid out are at another width or look than now
export function laid_stale(laid: Laid, w: number): boolean {
  return laid.w !== w || laid.look !== Draw.draw_stamp();
}

// more of the rows laid out, up from the first laid out, till they have
// `need` lines and row `top` is among them (or all are): their lines and
// marks as rows_lines lays them out; the lines added at the top
export function laid_up(laid: Laid, need: number, top = laid.rows.length): number {
  const made: Array<{ lines: Line[]; marks: Mark[] }> = [];
  const end  = laid.from;
  let count  = laid.lines.length;
  while (laid.from > 0 && (count < need || laid.from > top)) {
    const marks: Mark[] = [];
    const lines = rows_lines([laid.rows[--laid.from]], laid.w, marks);
    count += lines.length + (laid.from + 1 < laid.rows.length ? 1 : 0);
    made.push({ lines, marks });
  }
  if (made.length === 0) {
    return 0;
  }
  const head: Line[] = [];
  const marks: Mark[] = [];
  for (const [k, row] of made.reverse().entries()) {
    if (k > 0) {
      head.push([]);
    }
    marks.push(...row.marks.map((m) => ({ ...m, from: m.from + laid.at + head.length, to: m.to + laid.at + head.length })));
    head.push(...row.lines);
  }
  if (end < laid.rows.length) {
    head.push([]);
  }
  laid.marks = [...marks, ...laid.marks.map((m) => ({ ...m, from: m.from + head.length, to: m.to + head.length }))];
  laid.lines = [...head, ...laid.lines];
  return head.length;
}

// the first of rows holding the mark keyed `key` (mark_key): itself, or
// an open block or a run of work it is in; -1: none
export function rows_find(rows: View.Row[], key: string): number {
  return rows.findIndex((r) => mark_key(r) === key || ((r.$ === "Box" || r.$ === "Act" || r.$ === "Rule") && rows_find(r.rows, key) >= 0));
}

// a row's lines, laid out once per width: a message's and a summary's rows
// never change once known (View.ts ROWS), so a paint lays out only what
// is new; an open block's are made anew, around its rows' own
function row_cached(row: View.Row, w: number): Line[] {
  const known = LAID.get(row);
  const look  = Draw.draw_stamp();
  if (known?.w === w && known.look === look) {
    return known.lines;
  }
  const lines = row_lines(row, w);
  LAID.set(row, { w, look, lines });
  return lines;
}

// the terminal told its background: diagrams draw in a new palette, so
// every row is laid out anew (the look moves: Draw.draw_stamp); told the
// one it was, nothing changes (false)
export function paint_canvas(hex: string): boolean {
  if (hex === CANVAS) {
    return false;
  }
  CANVAS = hex;
  Draw.draw_canvas(hex);
  FILL = (Theme.ANSI.block ?? "") === "" ? canvas_shade(hex) : FILL;
  return true;
}

// a shade of a background: a dark one lighter, a light one darker
function canvas_shade(hex: string): string {
  const dark = Draw.draw_dark(hex);
  const rgb  = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  return "#" + rgb.map((v) => Math.round(dark ? v + (255 - v) * SHADE_DARK : v * (1 - SHADE_LIGHT)).toString(16).padStart(2, "0")).join("");
}

// a run of work: one dim line saying what was done (after GLYPH.shut; fit
// to the width, "…" where: line_fit), its calls under it (act_calls), or
// opened (GLYPH.open) over its rows, a dim bar at their left, each
// message marked (a click folds it to a line, and back); a click on the
// line, a call's or the bar opens or closes the whole run. A recap so
// too, its line a rule across the chat, its name in the middle. The
// glyph, the label, the calls' words and the bar tagged, to light with
// the run (line_lit; a rule's dashes never light)
function act_lines(row: View.Row & { $: "Act" | "Rule" }, w: number, marks: Mark[], at: number): Line[] {
  const key   = mark_key(row)!;
  const glyph = Run((row.open ? Theme.GLYPH.open : Theme.GLYPH.shut) + " ", DIM, { key, as: "glyph" });
  const label = Run(text_clean(row.text), DIM, { key, as: "label" });
  const fill  = Math.max(0, w - text_width(glyph.x + label.x) - 2);
  const line  = row.$ === "Rule" ? [Run("─".repeat(fill >> 1) + " ", DIM), glyph, label, Run(" " + "─".repeat(fill - (fill >> 1)), DIM)] : [glyph, label];
  const head  = line_fit(line, w, Run("…", DIM, { key, as: "label" }));
  if (!row.open) {
    return row.$ === "Act" ? [head, ...act_calls(row.calls, key, text_width(glyph.x), w)] : [head];
  }
  const bar   = Run("│ ", DIM, { key, as: "bar" });
  return [head, ...rows_lines(row.rows, w - 2, marks, at + 1, key, true).map((l) => [bar, ...l])];
}

// a shut run's calls, a line each under its head, from its words on
// (lead: the glyph's width): how it ended (GLYPH.ok, dim; GLYPH.failed in
// the error's color; not known: as wide, blank), its tool's name in bold
// after its mark (verb_runs) and the call on one line (Call.call_line),
// each line fit to the width, lead and all (line_fit). The last CALLS at
// most, the rest counted on a line over them; its words tagged as the
// run's label
function act_calls(calls: View.Done[], key: string, lead: number, w: number): Line[] {
  const tag   = { key, as: "label" } as const;
  const pad   = Run(" ".repeat(lead));
  const mark  = Math.max(text_width(Theme.GLYPH.ok), text_width(Theme.GLYPH.failed));
  const fit   = (l: Line) => line_fit([pad, ...l], w, Run("…", DIM, tag));
  const more  = calls.length > CALLS ? [fit([Run("… " + (calls.length - CALLS + 1) + " earlier", DIM, tag)])] : [];
  const shown = calls.slice(more.length === 0 ? 0 : 1 - CALLS);
  return [...more, ...shown.map(({ call, ok }) => {
    const glyph = ok === null ? "" : ok ? Theme.GLYPH.ok : Theme.GLYPH.failed;
    const sign  = Run(glyph + " ".repeat(mark - text_width(glyph) + 1), ok === false ? { ...INK, c: Draw.draw_tokens().error } : DIM);
    const verb  = verb_runs(call).map((r) => Run(text_clean(r.x), { ...r.s, d: true }, tag));
    return fit([sign, ...verb, Run(text_line(Call.call_line(call)), DIM, tag)]);
  })];
}

// an open block: its rows framed, its bar on the top edge, tagged to
// light (a click anywhere in the frame shuts it: but on a block inside)
function box_lines(row: View.Row & { $: "Box" }, w: number, marks: Mark[], at: number): Line[] {
  const bar = [Run(" " + row.n + "x · /close " + View.block_name(row.id, row.n) + " ", { ...DIM, b: true }, { key: block_key(row.id, row.n), as: "text" })];
  return frame_lines(rows_lines(row.rows, w - 4, marks, at + 1, null, true), w - 4, DIM, bar);
}

// a line of a mark lit (Term.ts: what a click would act on), by its
// tags: a run of work's (act) glyph in the accent, its label in the
// ink, its bar in the accent and heavier (┃); any other's own runs in the
// accent, and beside it its run's bar (up). Pressed (a click waiting on
// it), reversed too
export function line_lit(l: Line, m: Mark, pressed: boolean): Line {
  const c = Draw.draw_tokens().accent;
  return l.map((r) => {
    const tag = r.mark;
    if (tag === undefined || (tag.key !== m.key && !(tag.key === m.up && tag.as === "bar"))) {
      return r;
    }
    const s = tag.as === "label" ? { ...r.s, d: false } : { ...r.s, d: false, c };
    return { ...r, x: m.act === true && tag.as === "bar" ? r.x.replace("│", "┃") : r.x, s: pressed ? { ...s, v: !s.v } : s };
  });
}

// lines framed w columns wide, dim, a title on the top edge, a foot on
// the bottom one (Term's lists)
export function frame(body: Line[], w: number, title: Line, foot: Line = []): Line[] {
  return frame_lines(body, w - 4, DIM, title, foot);
}

// the names of a message's images, a dim line each
function images_lines(row: View.Row): Line[] {
  const names = row.$ === "Msg" ? row.images : [];
  return names.map((name) => [Run("  [image " + name + "]", DIM)]);
}

// a row's own lines (an open block's, a run of work's and a recap's are
// made by rows_lines, around their rows')
function row_lines(row: View.Row, w: number): Line[] {
  switch (row.$) {
    case "Sum": {
      const head = row.call === null ? [] : verb_runs(row.call);
      const text = row.call === null ? Md.md_flat(row.text) : Call.call_line(row.call);
      return fill_lines(sum_lines(row.id, row.n, head, text, w - 2), w - 2);
    }
    case "Box":
    case "Act":
    case "Rule": {
      return [];
    }
    case "Msg": {
      return row.call !== null ? fill_lines(call_lines(row.call, w - 2), w - 2) : row.kind === "illi" ? reply_lines(row.text, w) : msg_lines(row.kind, row.who, row.body, row.text, w);
    }
    case "Fold": {
      return runs_wrap([Run(Theme.GLYPH.shut + " ", DIM, { key: row.key, as: "glyph" }), Run(text_clean(row.text), DIM)], w, false).slice(0, 1);
    }
    case "Cap": {
      return runs_wrap([Run(text_clean(row.text), { ...DIM, i: true })], w, false);
    }
  }
}

// illi's reply, from its finished blocks on if it grew from the last one
// laid out (GROWN): a stream's text grows a piece each paint
function reply_lines(text: string, w: number): Line[] {
  const look = Draw.draw_stamp();
  const [lines, grown] = Reply.reply_grow(text, w, GROWN?.look === look ? GROWN.grown : null);
  GROWN = { look, grown };
  return lines;
}

// a block's summary (a tool call's: after its glyph and verb); the
// command that opens it ends its last line, else has a line of its own:
// copied whole, never split by a wrap. Its gutter and the command tagged,
// to light (line_lit)
function sum_lines(id: number, n: number, head: Line, text: string, w: number): Line[] {
  const room = w - GUTTER - 2;
  const tag  = { key: block_key(id, n), as: "text" } as const;
  const cmd  = Run("/open " + View.block_name(id, n), DIM, tag);
  const rows = runs_wrap([...head, Run(text_clean(text))], room, false);
  const last = rows.pop() ?? [];
  const ends = line_width(last) + 2 + text_width(cmd.x) <= room ? [[...last, Run("  "), cmd]] : [last, [cmd]];
  const lvl  = { ...DIM, b: true };
  return [...rows, ...ends].map((l, k) => [Run(" " + (k === 0 ? n + "x" : "").padEnd(GUTTER), lvl, tag), ...l]);
}

// a message as its kind looks: its blocks (a person's words, a result's
// lines, Md.md_plain, Md.md_output), else its text as markdown, drawn as
// illi's replies are (Reply.ts) in its kind's look (a note and thinking
// dim and italic); a call filled; a result bare, its lines framed as a
// file's, the frame naming them; a person's words (the user's, a report)
// framed in ink (the user's in the theme's you: the accent's, unless
// set), named on its top; thinking bare,
// its name over it; all at the left, the column's width; none framed
// nor filled without text (images alone)
function msg_lines(kind: Kind, who: string, body: Md.Block[], text: string, w: number): Line[] {
  const look = Theme.KIND[kind];
  const ink  = { ...INK, d: look.dim, i: look.it };
  const own  = (iw: number) => body.length > 0 ? blocks_lines(body, iw, ink) : Reply.reply_lines(text, iw, false).map((l) => l.map((r) => ({ ...r, s: { ...r.s, d: r.s.d || look.dim, i: r.s.i || look.it } })));
  if (body.length === 0 && text.trim() === "") {
    return [];
  }
  if (Theme.FILLED.includes(kind)) {
    return fill_lines(own(w - 2), w - 2);
  }
  if (Theme.FRAMED.includes(kind)) {
    const edge = kind === "user" ? { ...INK, c: Draw.draw_tokens().you } : INK;
    return frame_lines(own(w - 4), w - 4, edge, who === "" ? [] : [Run(" " + who + " ", { ...edge, b: true })]);
  }
  const name = who === "" ? [] : [[Run(who, { ...DIM, b: true })]];
  return [...name, ...own(w)];
}

// a tool call: its glyph and verb, its head after them if it fits on
// that line, else under it (a command's lines); over its blocks
function call_lines(c: Call.Call, w: number): Line[] {
  const verb  = verb_runs(c);
  const one   = !c.head.includes("\n") && line_width(verb) + text_width(c.head) <= w;
  const top   = one ? [...verb, Run(text_clean(c.head))] : verb;
  const heads = one || c.head === "" ? [] : c.head.split("\n").flatMap((l) => runs_wrap([Run(text_clean(l))], w, true));
  return [top, ...heads, ...c.blocks.flatMap((b) => code_lines(b.k, b.x, w))];
}

// a call's name, bold, after its mark if the theme gives one
function verb_runs(c: Call.Call): Line {
  const ink  = { ...INK, b: true };
  const mark = Theme.tool_glyph(c.name);
  return [...(mark === "" ? [] : [Run(mark + " ", ink)]), ...(c.name === "" ? [] : [Run(c.name + " ", ink)])];
}

// Block
// =====

function blocks_lines(blocks: Md.Block[], w: number, ink: Ink): Line[] {
  return lines_join(blocks, (b) => block_lines(b, w, ink));
}

function block_lines(b: Md.Block, w: number, ink: Ink): Line[] {
  switch (b.$) {
    case "Para": {
      return b.x.flatMap((spans) => runs_wrap(spans_runs(spans, ink), w, false));
    }
    case "Diff": {
      return diff_lines(b.k, b.x, w);
    }
    case "File": {
      return file_lines(b.k, b.n, b.x, w);
    }
  }
}

// a call's block: its label (a key: cleaned, cut at the width) over its
// lines in a frame, all dim
function code_lines(label: string, text: string, w: number): Line[] {
  const head = label === "" ? [] : [runs_wrap([Run(text_clean(label), DIM)], Math.max(1, w), true)[0]];
  const body = text.split("\n").flatMap((x) => runs_wrap([Run(text_clean(x), DIM)], w - 4, true));
  return [...head, ...frame_lines(body, w - 4, DIM, [])];
}

// a diagram's row: each cell in its colors
export function cells_line(row: Draw.Cell[]): Line {
  return row.map((c) => Run(text_clean(c.text), { ...INK, c: c.fg ?? "", g: c.bg ?? "", b: c.bold === true, v: c.inverse === true }));
}

// a diff: framed, its file and its lines added and dropped in the top
// edge; each line its number (dimmed), its mark and its text in the
// mark's ink (diff_marks), hung after the number; a ⋯ between hunks
function diff_lines(file: string, hunks: Md.Line[][], w: number): Line[] {
  const all   = hunks.flat();
  const adds  = all.filter((l) => l.s === "+").length;
  const dels  = all.filter((l) => l.s === "-").length;
  const nw    = all.reduce((w, l) => Math.max(w, String(l.n).length), 0);
  const mark  = diff_marks();
  const title = [Run(" " + text_clean(file) + " ", { ...INK, b: true }), Run("+" + adds, mark["+"]), Run(" "), Run("-" + dels, mark["-"]), Run(" ")];
  const line  = (l: Md.Line) => runs_wrap([Run(text_clean(l.x), mark[l.s])], w - nw - 7, true).map((r, k) => [Run((k === 0 ? String(l.n) : "").padStart(nw) + " ", DIM), Run((k === 0 ? l.s : " ") + " ", mark[l.s]), ...r]);
  const gap   = [[Run(" ".repeat(nw) + " ⋯", DIM)]];
  const body  = hunks.flatMap((h, k) => [...(k === 0 ? [] : gap), ...h.flatMap(line)]);
  return frame_lines(body, w - 4, DIM, title);
}

// a diff line's ink, by its mark: kept dim, added in the theme's success
// (its ansi.add, if set), dropped in its error (ansi.del)
function diff_marks(): Record<Md.Line["s"], Ink> {
  const tokens = Draw.draw_tokens();
  return { " ": DIM, "-": { ...INK, c: Theme.ANSI.del ?? tokens.error }, "+": { ...INK, c: Theme.ANSI.add ?? tokens.success } };
}

// a read's lines: framed as a diff is, the lines shown in the top edge;
// each line its number (dimmed) and its text, hung after the number
function file_lines(shown: string, from: number, lines: string[], w: number): Line[] {
  const nw    = String(from + lines.length - 1).length;
  const title = [Run(" " + text_clean(shown) + " ", { ...INK, b: true })];
  const line  = (x: string, k: number) => runs_wrap([Run(text_clean(x))], w - nw - 5, true).map((r, j) => [Run((j === 0 ? String(from + k) : "").padStart(nw) + " ", DIM), ...r]);
  return frame_lines(lines.flatMap(line), w - 4, DIM, title);
}

function spans_runs(spans: Md.Span[], ink: Ink): Line {
  return spans.map((s) => span_run(s, ink));
}

function span_run(s: Md.Span, ink: Ink): Run {
  const x = text_clean(s.x);
  switch (s.$) {
    case "Text":
    case "Code": {
      return Run(x, ink);
    }
    case "Bold": {
      return Run(x, { ...ink, b: true });
    }
    case "Ital": {
      return Run(x, { ...ink, i: true });
    }
    case "Link": {
      return Run(x, { ...ink, u: true, k: text_clean(s.k) });
    }
    case "Name": {
      return Run("[" + x + "]", { ...ink, b: true, u: true });
    }
    case "Chip": {
      return Run(x, { ...ink, c: Draw.draw_tokens().accent });
    }
  }
}

// Bars
// ====

// a line w wide: left at its start, right (dim) at its end, if it fits
export function ends_line(left: Line, right: string, w: number): Line {
  const room = w - line_width(left) - text_width(right);
  return room < 1 ? left : [...left, Run(" ".repeat(room) + right, DIM)];
}

// a row's lead in a list or a question: the lit one's mark
// (Theme.GLYPH.lit) and a space, any other as many spaces, so the rows
// line up whatever the theme makes the mark
export function lit_lead(lit: boolean): string {
  const mark = Theme.GLYPH.lit + " ";
  return lit ? mark : " ".repeat(text_width(mark));
}

// a rule, w wide
export function rule(w: number): Line {
  return [Run("─".repeat(Math.max(0, w)), DIM)];
}

// the last line, w wide: a tab for the chat (named as the agent illi
// runs as) and each agent at work (or the shown alone: all false, the
// side lists them), each mark in its agent's color (illi's own: the
// brand's; else Draw.draw_agent), the shown bold, then the profile
// running (tabs_profile), then the pick (the standard speed left out),
// then the plugins' pieces (Plugins.status), all cut before the right
// end: the background jobs counted (jobs: the side doesn't show them
// whole; tabs_background) and the mode (tabs_mode; neither on a line too
// narrow); with agents, the keys that move along them, if they fit
export function tabs_line(v: View.View, w: number, all = true, jobs = all): Line {
  const bg   = tabs_background(v, w, jobs);
  const mode = [...bg, ...(bg.length === 0 ? [] : [Run(" · ", DIM)]), ...tabs_mode(v, w)];
  const room = w - line_width(mode);
  const left = tabs_left(v, mode.length === 0 ? w : room - 2, all);
  return mode.length === 0 ? left : [...left, Run(" ".repeat(Math.max(2, room - line_width(left)))), ...mode];
}

// the mode (Guard.ts), as the last line ends: dim, read-only in the
// theme's warning, yolo bold in its error; none on a line under MODE_ROOM
export function tabs_mode(v: View.View, w: number): Line {
  const tone = Draw.draw_tokens();
  const mode = v.perm.mode;
  return w < MODE_ROOM ? [] : [Run(mode + " mode", mode === "yolo" ? { ...INK, b: true, c: tone.error } : mode === "read-only" ? { ...INK, c: tone.warning } : DIM)];
}

// the background jobs running, counted for the last line (jobs false:
// the side shows them; none, or a line under MODE_ROOM: nothing): ● (in
// the theme's success) and how many, dim
export function tabs_background(v: View.View, w: number, jobs: boolean): Line {
  const n = v.background.length;
  return !jobs || n === 0 || w < MODE_ROOM ? [] : [Run("● ", { ...INK, c: Draw.draw_tokens().success }), Run(n + " in background", DIM)];
}

// the last line but the mode, w wide
function tabs_left(v: View.View, w: number, all: boolean): Line {
  const tabs  = View.view_tabs(v).filter((tab) => all || tab.here).map((tab) => [Run(tab.mark, { ...INK, c: tab.agent === View.MAIN ? Draw.draw_brand() : Draw.draw_agent(tab.agent) }), Run(tab.text.slice(tab.mark.length), tab.here ? { ...INK, b: true } : DIM)]);
  const knobs = View.view_pick(v).map((knob) => knob.text).filter((text) => text !== "");
  const plugs = Plugins.status().flatMap((l) => [Run(" · ", DIM), ...pieces_line(l)]);
  const line  = [...tabs.flatMap((r, k) => (k === 0 ? r : [Run("  "), ...r])), ...tabs_profile(all), ...(knobs.length === 0 ? [] : [Run(" · " + knobs.join(" · "), DIM)]), ...plugs];
  const hint  = [Run("  · Ctrl+PgDn to cycle", DIM)];
  return tabs.length > 1 && line_width([...line, ...hint]) <= w ? [...line, ...hint] : runs_wrap(line, w, true)[0] ?? [];
}

// a plugin's line as runs: each piece's text cleaned, in its token's
// color (none: the ink), bold, dim
export function pieces_line(pieces: Piece[]): Line {
  const tokens = Draw.draw_tokens();
  return pieces.map((x) => Run(text_clean(x.text), { ...INK, c: x.tone === undefined ? "" : tokens[x.tone], b: x.bold === true, d: x.dim === true }));
}

// the profile running, after the last line's tabs, in the accent: none
// for the default, nor beside the side panel (all false: it lists them)
export function tabs_profile(all: boolean): Line {
  return !all || config.PROFILE === DEFAULT ? [] : [Run(" · ", DIM), Run(config.PROFILE, { ...INK, c: Draw.draw_tokens().accent })];
}
