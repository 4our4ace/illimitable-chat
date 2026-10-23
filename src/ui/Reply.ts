// Reply
// =====
// illi's reply as the terminal shows it, drawn from its markdown
// (Markdown.ts) in the palette's colors (Draw.draw_theme: a slot left
// out is the terminal's ink, a faint one dimmed): a block a blank line
// from the next, figures (tables, diagrams that draw) side by side while
// the width holds them. Prose is wrapped between words, code at any
// character; nothing is wider than the width but where a block's frame
// can't be narrower. Each block that can be copied has buttons (a dim
// [ ], its label in the accent) over it (a list, a table, a diagram,
// code beside its header) or beside its first line (a quote, an alert);
// a reply of more blocks than one ends in one that copies it whole.
// Without buttons (a thought, a note, a pipe), nothing copies.
//
// A table's columns take their natural widths if those fit, else the
// room shared out (column_widths): no column wider than its widest
// cell, none narrower than its longest word while the words fit, so
// words break only when they can't; a box that can't be as narrow as
// the width at all is its rows as records, a cell a line under its
// header's name. Its art (the ⧉ art button) is the same table as plain
// text, 100 columns wide, its links' targets shown.
//
// A reply streaming grows (reply_grow): its blocks before its last blank
// line outside code are finished, as no text after them changes them,
// so their lines are kept and only the text after is read and laid out
// again (but after a figure: the next may sit beside it; after a list,
// till a whole line after the blank isn't its own).

import { markdown_parse, markdown_shown, markdown_text, type Block, type Inline, type Item } from "./Markdown.ts";
import * as Draw from "./Draw.ts";
import * as Paint from "./Paint.ts";
import { ANSI, COMMENTS, theme_colors, type Token } from "./Theme.ts";

// Types
// =====

type Ink   = Paint.Run["s"];
type Line  = Paint.Line;
type Pal   = Record<string, string>;

// a block drawn: its lines, whether a figure (a table, a diagram: those
// sit side by side)
type Drawn = { lines: Line[]; fig: boolean };

// a button: its label, what it copies
type Button = [label: string, copy: () => string];

// a column's alignment
type Align = "left" | "right" | "center";

// Constants
// =========

// the buttons' labels
const COPY   = "⧉ copy";
const WHOLE  = "⧉ copy reply";
const MD     = "⧉ md";
const ART    = "⧉ art";
const SOURCE = "⧉ source";

// the slots drawn faint: dimmed where the palette lacks them
const FAINT = ["codeComment", "quote", "rule", "tableRule"];

// the slot each kind of code token takes (Theme.SYNTAX's kinds; a
// comment's, codeComment): calls a command's, words a language keeps a
// flag's, text a string's, values a number's, names a path's; a diff's
// lines (DIFF) as every diff's; any other kind (an operator, plain) the
// code's own ink
const CODE: Record<string, string> = {
  function    : "codeCommand",
  builtin     : "codeCommand",
  "class-name": "codeCommand",
  namespace   : "codeCommand",
  keyword     : "codeFlag",
  atrule      : "codeFlag",
  selector    : "codeFlag",
  important   : "codeFlag",
  tag         : "codeFlag",
  string      : "codeString",
  char        : "codeString",
  "attr-value": "codeString",
  regex       : "codeString",
  url         : "codeString",
  number      : "number",
  boolean     : "number",
  constant    : "number",
  symbol      : "number",
  entity      : "number",
  "attr-name" : "number",
  property    : "path",
  variable    : "path",
};

// a diff's lines, added and removed, by the colors a tool's diff takes
// (Theme.ANSI's add and del, else the success and error tokens)
const DIFF: Record<string, ["add" | "del", Token]> = { inserted: ["add", "success"], deleted: ["del", "error"] };

// an alert's title and the token its box is in, by its level
const ALERTS: Record<string, [string, Token]> = {
  note     : ["Note", "link"],
  tip      : ["Tip", "success"],
  important: ["Important", "accent"],
  warning  : ["Warning", "warning"],
  caution  : ["Caution", "error"],
};

// the widest rule; the columns between figures side by side, and between
// a table's columns; how wide a table's art is drawn
const RULE  = 80;
const APART = 4;
const GAP   = 3;
const PAGE  = 100;

// a reply laid out as far as it is finished (reply_grow): its text to
// there (newlines as \n), its blocks there, counted and laid out, at a
// width, with buttons or not
export type Grown = { text: string; n: number; lines: Line[]; w: number; copy: boolean };

// whether buttons are drawn
let buttons = true;

// Reply
// =====

export function reply_buttons(on: boolean): void {
  buttons = on;
}

// a reply's lines, w wide; with copy false, no buttons at all
export function reply_lines(text: string, w: number, copy = true): Line[] {
  return reply_grow(text, w, null, copy)[0];
}

// a reply's lines, w wide, and how far it is finished; was: as far as an
// earlier text of it was (none, or another reply's: all laid out anew)
export function reply_grow(text: string, w: number, was: Grown | null, copy = true): [Line[], Grown] {
  const on = buttons;
  buttons  = on && copy;
  try {
    const pal    = Draw.draw_theme();
    const src    = text.includes("\r") ? text.replace(/\r\n?/g, "\n") : text;
    const from   = was !== null && was.w === w && was.copy === buttons && src.startsWith(was.text) ? was : { text: "", n: 0, lines: [], w, copy: buttons };
    const rest   = src.slice(from.text.length);
    const blocks = markdown_parse(rest, { numbers: true, paths: true });
    const drawn  = blocks.map((b) => block_drawn(pal, b, w));
    const [k, at] = reply_done(rest, blocks, drawn);
    const head   = lines_after(from.lines, from.n, reply_join(drawn.slice(0, k), w), k);
    const lines  = lines_after(head, from.n + k, reply_join(drawn.slice(k), w), blocks.length - k);
    const grown  = { text: from.text + rest.slice(0, at), n: from.n + k, lines: head, w, copy: buttons };
    return [reply_whole(pal, lines, text, from.n + blocks.length, w), grown];
  } finally {
    buttons = on;
  }
}

// how many of a text's blocks are finished, and where the text after
// them starts: those before its last blank line (not its last line, which
// may grow) between two blocks or after the last, unless a figure is
// right before it, or a list the line after the blank lines may yet
// join (none, or the last). Only blank lines lie between blocks (the
// parser's)
function reply_done(text: string, blocks: Block[], drawn: Drawn[]): [number, number] {
  const lines = text.split("\n");
  let [line, at] = [0, 0];
  let done: [number, number] = [0, 0];
  const blank = (n: number) => n < lines.length && lines[n].trim() === "";
  const next  = () => (at += lines[line++].length + 1);
  for (const [k, b] of blocks.entries()) {
    while (blank(line)) {
      next();
    }
    for (let n = b.raw.split("\n").length; n > 0 && line < lines.length; n--) {
      next();
    }
    let after = line;
    while (blank(after)) {
      after++;
    }
    if (!drawn[k].fig && line < lines.length - 1 && blank(line) && (b.kind !== "list" || after < lines.length - 1)) {
      done = [k + 1, at + lines[line].length + 1];
    }
  }
  return done;
}

// a reply's lines, then, with buttons and more than one block, a blank
// line and the button that copies its text whole, at the right of w
function reply_whole(pal: Pal, lines: Line[], text: string, n: number, w: number): Line[] {
  return buttons && n > 1 ? [...lines, [], line_right(buttons_line(pal, [[WHOLE, () => text]]), w)] : lines;
}

// blocks' lines, a blank line between each two; figures following one
// another in rows (reply_row), a figure joining a row while all its
// figures, APART between each, fit in w
function reply_join(drawn: Drawn[], w: number): Line[] {
  const parts: Line[][] = [];
  let row: Line[][] = [];
  const close = () => {
    if (row.length > 0) {
      parts.push(reply_row(row));
      row = [];
    }
  };
  for (const d of drawn) {
    if (!d.fig) {
      close();
      parts.push(d.lines);
      continue;
    }
    if (row.reduce((n, f) => n + lines_width(f) + APART, 0) + lines_width(d.lines) > w) {
      close();
    }
    row.push(d.lines);
  }
  close();
  return parts.flatMap((lines, k) => (k === 0 ? lines : [[], ...lines]));
}

// figures side by side, their tops level: each padded to its widest
// line, APART after it, but the last
function reply_row(figs: Line[][]): Line[] {
  if (figs.length === 1) {
    return figs[0];
  }
  const widths = figs.map(lines_width);
  const height = Math.max(...figs.map((f) => f.length));
  return Array.from({ length: height }, (_, k) => figs.flatMap((f, j) => (j === figs.length - 1 ? (f[k] ?? []) : line_padded(f[k] ?? [], widths[j] + APART))));
}

// Blocks
// ======

// a block's lines, w wide, and whether a figure
function block_drawn(pal: Pal, b: Block, w: number): Drawn {
  switch (b.kind) {
    case "paragraph": {
      return { lines: Paint.runs_wrap(inline_runs(pal, b.inline, Paint.INK), Math.max(1, w), false), fig: false };
    }
    case "heading": {
      return { lines: heading_lines(pal, b.level, b.inline, w), fig: false };
    }
    case "list": {
      return { lines: buttons_over(pal, list_lines(pal, b.items, w), [[COPY, () => b.raw]], w), fig: false };
    }
    case "quote": {
      const bar  = tone(pal, "accent");
      const rows = Paint.runs_wrap(inline_runs(pal, b.inline, { ...tone(pal, "quote"), i: true }), Math.max(1, w - 2), false);
      return { lines: buttons_beside(pal, rows.map((r) => [Paint.Run("│ ", bar), ...r]), [[COPY, () => quote_said(b.raw)]], w), fig: false };
    }
    case "alert": {
      return { lines: buttons_beside(pal, alert_lines(pal, b.level, b.inline, w), [[COPY, () => alert_said(b.raw)]], w), fig: false };
    }
    case "rule": {
      return { lines: [[Paint.Run("─".repeat(Math.max(0, Math.min(w, RULE))), tone(pal, "rule"))]], fig: false };
    }
    case "code": {
      return code_drawn(pal, b, w);
    }
    case "table": {
      return { lines: buttons_over(pal, table_lines(pal, b, w), [[MD, () => b.raw], [ART, () => table_art(b)]], w), fig: true };
    }
  }
}

// a heading, bold: the heading's color (a third level's the accent, else
// the heading's; the fourth on the strong's). The first boxed in heavy
// lines, the second over a heavy rule as long as its text (at most w)
function heading_lines(pal: Pal, level: number, inline: Inline[], w: number): Line[] {
  const color = level <= 2 ? pal.heading : level === 3 ? pal.accent || pal.heading : pal.strong;
  const edge  = { ...Paint.INK, c: color || "" };
  const runs  = inline_runs(pal, inline, { ...edge, b: true });
  if (level === 1) {
    const rows = Paint.runs_wrap(runs, Math.max(1, w - 4), false);
    const iw   = lines_width(rows);
    const side = (r: Line) => [Paint.Run("┃", edge), Paint.Run(" "), ...line_padded(r, iw), Paint.Run(" "), Paint.Run("┃", edge)];
    return [[Paint.Run("┏" + "━".repeat(iw + 2) + "┓", edge)], ...rows.map(side), [Paint.Run("┗" + "━".repeat(iw + 2) + "┛", edge)]];
  }
  const rows = Paint.runs_wrap(runs, Math.max(1, w), false);
  const long = Math.min(w, Paint.text_width(Paint.text_clean(markdown_text(inline))));
  return level === 2 ? [...rows, [Paint.Run("━".repeat(Math.max(0, long)), edge)]] : rows;
}

// a list's items: each its lead (two columns a level, its glyph: a
// task's box, a number as written, else a bullet, • or ◦ deeper) in the
// bullet's tone, its text wrapped after it and hung under its own start;
// a task done dim and struck through. An item's paragraph (no marker)
// hangs under its item's text; a blank line before an item stays
function list_lines(pal: Pal, items: Item[], w: number): Line[] {
  const bullet = tone(pal, "bullet");
  const hung   : number[] = [];
  return items.flatMap((item, n) => {
    const glyph = item.task !== undefined ? (item.task ? "[✓]" : "[ ]") : /\d/.test(item.marker) ? item.marker : item.depth > 0 ? "◦" : "•";
    const lead  = item.marker === "" ? " ".repeat(hung[item.depth] ?? 2 * item.depth) : "  ".repeat(item.depth) + glyph + " ";
    const lw    = (hung[item.depth] = Paint.text_width(lead));
    const ink   = item.task === true ? { ...Paint.INK, d: true, t: true } : Paint.INK;
    const rows  = Paint.runs_wrap(inline_runs(pal, item.inline, ink), Math.max(1, w - lw), false);
    return [...(item.gap && n > 0 ? [[]] : []), ...rows.map((r, k) => [k === 0 ? Paint.Run(lead, bullet) : Paint.Run(" ".repeat(lw)), ...r])];
  });
}

// an alert: its level's title, bold, over its text in a round box, both
// in its token's color (ALERTS)
function alert_lines(pal: Pal, level: string, inline: Inline[], w: number): Line[] {
  const [title, token] = ALERTS[level];
  const edge = { ...Paint.INK, c: Draw.draw_tokens()[token] };
  const text = inline.length === 0 ? [] : Paint.runs_wrap(inline_runs(pal, inline, Paint.INK), Math.max(1, w - 4), false);
  const rows = [[Paint.Run(title, { ...edge, b: true })], ...text];
  const iw   = lines_width(rows);
  const side = (r: Line) => [Paint.Run("│", edge), Paint.Run(" "), ...line_padded(r, iw), Paint.Run(" "), Paint.Run("│", edge)];
  return [[Paint.Run("╭" + "─".repeat(iw + 2) + "╮", edge)], ...rows.map(side), [Paint.Run("╰" + "─".repeat(iw + 2) + "╯", edge)]];
}

// a quote's lines as said: each without its > and a space after
function quote_said(raw: string): string {
  return raw.split("\n").map((l) => l.replace(/^\s*> ?/, "")).join("\n");
}

// an alert's lines as said, without its [!NOTE]
function alert_said(raw: string): string {
  return quote_said(raw).replace(/^\[![a-z]+\][ \t]*\n?/i, "");
}

// Code
// ====

// a code block: a closed ```mermaid one a figure if it draws (its rows
// under buttons that copy its source and its art), else its code
function code_drawn(pal: Pal, b: Block & { kind: "code" }, w: number): Drawn {
  if (b.isOpen === undefined && b.lang.toLowerCase() === "mermaid") {
    const source = b.lines.join("\n");
    const rows   = Draw.draw_diagram(source, w);
    if (rows !== null) {
      const art = () => rows.map((r) => r.map((c) => c.text).join("").trimEnd()).join("\n");
      return { lines: buttons_over(pal, rows.map(Paint.cells_line), [[SOURCE, () => source], [ART, art]], w), fig: true };
    }
  }
  return { lines: code_lines(pal, b, w), fig: false };
}

// code: its header (── and its language, or "code"; faint, cut at w),
// the copy button after it if both fit, else on a line of its own at
// the right; then each line's tokens in their inks (code_ink), wrapped
// at any character two columns in. A fence just opened shows its header
// alone
function code_lines(pal: Pal, b: Block & { kind: "code" }, w: number): Line[] {
  const faint = tone(pal, "codeComment");
  const head  = Paint.runs_wrap([Paint.Run("── " + (b.lang === "" ? "code" : Paint.text_clean(b.lang)), faint)], Math.max(1, w), true)[0];
  const row   = buttons_line(pal, [[COPY, () => b.lines.join("\n")]]);
  const top   = !buttons ? [head] : Paint.line_width(head) + 3 + Paint.line_width(row) <= w ? [[...head, Paint.Run(" · ", faint), ...row]] : Paint.line_width(row) <= w ? [head, line_right(row, w)] : [head];
  if (b.lines.length === 0 && b.isOpen) {
    return top;
  }
  const text  = b.lines.join("\n");
  const lines = Draw.draw_code(b.lang === "" ? "sh" : b.lang, text) ?? text.split("\n").map((x) => [{ text: x, kind: "" }]);
  const ink   = code_ink(pal);
  const runs  = (l: { text: string; kind: string }[]) => l.map((t) => Paint.Run(Paint.text_clean(t.text), ink(t.kind))).filter((r) => r.x !== "");
  return [...top, ...lines.flatMap((l) => Paint.runs_wrap(runs(l), Math.max(1, w - 2), true).map((r) => [Paint.Run("  "), ...r]))];
}

// each kind of code token's ink: the code's own (codeText's color, never
// dim), in its slot's color (CODE; a comment's codeComment) where it has
// one, faint where the palette lacks a faint one, a diff's line in a
// diff's (DIFF); a comment italic. In the terminal's own palette a kind
// takes the theme's syntax color for it (Draw.draw_syntax), but where the
// user's colors set its slot
function code_ink(pal: Pal): (kind: string) => Ink {
  const base   = { ...Paint.INK, c: pal.codeText || "" };
  const syntax = Draw.draw_syntax();
  const mine   = theme_colors();
  const tokens = Draw.draw_tokens();
  return (kind) => {
    const note  = COMMENTS.includes(kind);
    const slot  = note ? "codeComment" : Object.hasOwn(CODE, kind) ? CODE[kind] : undefined;
    const own   = slot !== undefined && slot in mine ? undefined : Object.hasOwn(syntax, kind) ? syntax[kind] : undefined;
    const diff  = Object.hasOwn(DIFF, kind) ? ANSI[DIFF[kind][0]] ?? tokens[DIFF[kind][1]] : undefined;
    const color = own ?? diff ?? (slot === undefined ? undefined : pal[slot]);
    const ink   = color ? { ...base, c: color } : slot !== undefined && FAINT.includes(slot) ? { ...base, d: true } : base;
    return note ? { ...ink, i: true } : ink;
  };
}

// Tables
// ======

// a table boxed: its header (each cell's text, bold, in the header's
// color) over its rows (each cell's marks), each column as wide as
// column_widths makes it in w (less the frame's), each cell wrapped and
// aligned in it; a double rule under the header, a single between rows.
// A box that can't be as narrow as w (a column a character, and its
// frame) is its rows as records (table_records)
function table_lines(pal: Pal, b: Block & { kind: "table" }, w: number): Line[] {
  const head   = colored(pal, "tableHeader", { ...Paint.INK, b: true });
  const header = b.header.map((c) => [Paint.Run(Paint.text_clean(markdown_text(c)), head)]);
  const rows   = b.rows.map((r) => r.map((c) => inline_runs(pal, c, Paint.INK)));
  const widths = table_widths([b.header, ...b.rows].map((r) => r.map(markdown_text)), w - 4);
  const align  = b.header.map((_, k) => b.align[k] ?? "left");
  const ink    = tone(pal, "tableRule");
  if (widths.reduce((a, x) => a + x + 3, 1) > w) {
    return table_records(header, rows, ink, w);
  }
  const body   = rows.flatMap((r, k) => [...(k === 0 ? [] : [grid_edge("├─┼┤", widths, ink)]), ...grid_row(r, widths, align, ink)]);
  return [grid_edge("┌─┬┐", widths, ink), ...grid_row(header, widths, align, ink), grid_edge("╞═╪╡", widths, ink), ...body, grid_edge("└─┴┘", widths, ink)];
}

// a table too wide for w as records: each row its cells, one a line
// after its header's text and a colon (no header text: neither; an
// empty cell: no colon), wrapped at w and hung two columns in; a rule in
// the table's ink between rows. A table of no rows: its header's texts
function table_records(header: Line[], rows: Line[][], ink: Ink, w: number): Line[] {
  const rule   = [Paint.Run("─".repeat(Math.max(1, Math.min(w, RULE))), ink)];
  const record = (r: Line[]) => r.flatMap((cell, k) => {
    const label = Paint.line_width(header[k]) === 0 ? [] : [...header[k], ...(cell.length === 0 ? [] : [Paint.Run(": ", header[k][0].s)])];
    return Paint.runs_wrap([...label, ...cell], Math.max(1, w - 2), false).map((l, j) => (j === 0 ? l : [Paint.Run("  "), ...l]));
  });
  return (rows.length === 0 ? [header.map(() => [])] : rows).flatMap((r, k) => [...(k === 0 ? [] : [rule]), ...record(r)]);
}

// a table's art: plain text, PAGE columns wide (less the frame's), its
// cells' text with links' targets shown, its header centered, a single
// rule between every two rows; fenced as code
function table_art(b: Block & { kind: "table" }): string {
  const rows   = [b.header, ...b.rows].map((r) => r.map(markdown_shown));
  const widths = table_widths(rows, PAGE - 4);
  const cells  = rows.map((r) => r.map((c) => [Paint.Run(Paint.text_clean(c))]));
  const align  = b.header.map((_, k) => b.align[k] ?? "left");
  const lines  = cells.flatMap((r, k) => [...(k === 0 ? [] : [grid_edge("├─┼┤", widths, Paint.INK)]), ...grid_row(r, widths, k === 0 ? align.map(() => "center") : align, Paint.INK)]);
  const all    = [grid_edge("┌─┬┐", widths, Paint.INK), ...lines, grid_edge("└─┴┘", widths, Paint.INK)];
  return "```\n" + all.map((l) => l.map((r) => r.x).join("")).join("\n") + "\n```";
}

// the widths of a table's columns, by its rows' cells as plain text, to
// fit room: each column's natural width (its widest cell) and its
// longest word
function table_widths(rows: string[][], room: number): number[] {
  const texts   = rows.map((r) => r.map(Paint.text_clean));
  const natural = texts[0].map((_, k) => Math.max(...texts.map((r) => Paint.text_width(r[k]))));
  const words   = texts[0].map((_, k) => Math.max(...texts.flatMap((r) => r[k].split(/\s+/).map(Paint.text_width))));
  return column_widths(natural, room, GAP, words);
}

// columns' widths to fit in room, gap between each two: their natural
// widths if those fit; else the room left by the gaps (at least one a
// column) shared to the last column, each column at most its natural
// width (no column narrower than one, unless empty) and at least its
// longest word while all of those fit (else at least one): the columns
// filled to one level, the narrow ones whole, the room left after it
// one more a column from the left
export function column_widths(natural: number[], room: number, gap: number, words: number[]): number[] {
  const n    = natural.length;
  const free = Math.max(n, room - gap * (n - 1));
  const sum  = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  if (sum(natural) <= free) {
    return [...natural];
  }
  const floors = natural.map((x, k) => Math.min(x, Math.max(1, words[k])));
  const least  = sum(floors) <= free ? floors : natural.map((x) => Math.min(x, 1));
  const level  = (x: number) => least.map((lo, k) => Math.min(natural[k], Math.max(lo, x)));
  let [lo, hi] = [0, Math.max(...natural)];
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    [lo, hi]  = sum(level(mid)) <= free ? [mid, hi] : [lo, mid - 1];
  }
  const widths = level(lo);
  let left = free - sum(widths);
  for (let k = 0; k < n && left > 0; k++) {
    if (widths[k] === lo && lo >= least[k] && lo < natural[k]) {
      widths[k] += 1;
      left -= 1;
    }
  }
  return widths;
}

// a rule across a table: its glyphs (its left end, its line, a column's
// meeting, its right end), each column's width and a space each side
function grid_edge(glyphs: string, widths: number[], ink: Ink): Line {
  return [Paint.Run(glyphs[0] + widths.map((x) => glyphs[1].repeat(x + 2)).join(glyphs[2]) + glyphs[3], ink)];
}

// a table's row: each cell wrapped to its column (its lines' trailing
// spaces dropped) and aligned in it (center: an odd space at the right),
// as tall as its tallest, between bars
function grid_row(cells: Line[], widths: number[], align: Align[], ink: Ink): Line[] {
  const wrapped = cells.map((c, k) => Paint.runs_wrap(c, Math.max(1, widths[k]), false).map(line_trimmed));
  const height  = Math.max(...wrapped.map((c) => c.length));
  const fit     = (l: Line, k: number): Line => {
    const pad  = Math.max(0, widths[k] - Paint.line_width(l));
    const left = align[k] === "right" ? pad : align[k] === "center" ? Math.floor(pad / 2) : 0;
    return [...(left > 0 ? [Paint.Run(" ".repeat(left))] : []), ...l, ...(pad > left ? [Paint.Run(" ".repeat(pad - left))] : [])];
  };
  return Array.from({ length: height }, (_, j) => [
    Paint.Run("│ ", ink),
    ...wrapped.flatMap((c, k) => [...(k === 0 ? [] : [Paint.Run(" │ ", ink)]), ...fit(c[j] ?? [], k)]),
    Paint.Run(" │", ink),
  ]);
}

// Inline
// ======

// inline marks as runs on a block's ink: bold, italics (math too),
// struck (dim), underlined (a link; its url linked if a web or mail
// one), each in its slot's color if the palette has it, else the
// block's; marks inside take their own over it
function inline_runs(pal: Pal, nodes: Inline[], ink: Ink): Line {
  return nodes.flatMap((n): Line => {
    switch (n.kind) {
      case "strong": {
        return inline_runs(pal, n.children, colored(pal, "strong", { ...ink, b: true }));
      }
      case "emphasis": {
        return inline_runs(pal, n.children, colored(pal, "emphasis", { ...ink, i: true }));
      }
      case "strike": {
        return inline_runs(pal, n.children, { ...ink, t: true, d: true });
      }
      case "link": {
        const url = /^(?:https?|mailto):/i.test(n.href) ? Paint.text_clean(n.href) : "";
        return inline_run(n.text, colored(pal, "link", { ...ink, u: true, k: url }));
      }
      case "code": {
        return inline_run(n.text, colored(pal, "inlineCode", ink));
      }
      case "math": {
        return inline_run(n.text, colored(pal, "emphasis", { ...ink, i: true }));
      }
      case "number":
      case "path": {
        return inline_run(n.text, colored(pal, n.kind, ink));
      }
      case "text": {
        return inline_run(n.text, ink);
      }
    }
  });
}

// text as a run, cleaned; none if empty
function inline_run(text: string, ink: Ink): Line {
  const x = Paint.text_clean(text);
  return x === "" ? [] : [Paint.Run(x, ink)];
}

// Inks
// ====

// a slot's tone: the plain ink in its color; the palette lacking it, the
// plain ink, dimmed if the slot is faint
function tone(pal: Pal, slot: string): Ink {
  return pal[slot] ? { ...Paint.INK, c: pal[slot] } : FAINT.includes(slot) ? Paint.DIM : Paint.INK;
}

// an ink in a slot's color, if the palette has it
function colored(pal: Pal, slot: string, ink: Ink): Ink {
  return pal[slot] ? { ...ink, c: pal[slot] } : ink;
}

// Buttons
// =======

// buttons in a row, a plain space between each two: each [ ] dim, its
// label in the accent (plain if none), every run of it copying
function buttons_line(pal: Pal, bs: Button[]): Line {
  const label = tone(pal, "accent");
  return bs.flatMap(([text, copy], k) => [
    ...(k === 0 ? [] : [Paint.Run(" ")]),
    ...[["[", Paint.DIM], [" ", Paint.INK], [text, label], [" ", Paint.INK], ["]", Paint.DIM]].map(([x, s]) => ({ x: x as string, s: s as Ink, copy })),
  ]);
}

// a block under its buttons, at the right of its width (or theirs, if
// wider); without buttons, or with buttons wider than w, the block alone
function buttons_over(pal: Pal, lines: Line[], bs: Button[], w: number): Line[] {
  const row = buttons_line(pal, bs);
  const bw  = Paint.line_width(row);
  return !buttons || bw > w ? lines : [line_right(row, Math.max(bw, lines_width(lines))), ...lines];
}

// a block with its buttons beside its first line, two columns after its
// width, if they fit in w; else over it
function buttons_beside(pal: Pal, lines: Line[], bs: Button[], w: number): Line[] {
  const row = buttons_line(pal, bs);
  const lw  = lines_width(lines);
  if (!buttons || lw + 2 + Paint.line_width(row) > w) {
    return buttons_over(pal, lines, bs, w);
  }
  return [[...line_padded(lines[0], lw), Paint.Run("  "), ...row], ...lines.slice(1)];
}

// Lines
// =====

// the lines of n blocks after those of m blocks, a blank line between
function lines_after(head: Line[], m: number, tail: Line[], n: number): Line[] {
  return m === 0 ? tail : n === 0 ? head : [...head, [], ...tail];
}

function lines_width(lines: Line[]): number {
  return lines.reduce((n, l) => Math.max(n, Paint.line_width(l)), 0);
}

function line_padded(l: Line, w: number): Line {
  return [...l, Paint.Run(" ".repeat(Math.max(0, w - Paint.line_width(l))))];
}

// a line at the right end of w columns
function line_right(l: Line, w: number): Line {
  return [Paint.Run(" ".repeat(Math.max(0, w - Paint.line_width(l)))), ...l];
}

// a line without the spaces it ends in
function line_trimmed(l: Line): Line {
  const out = [...l];
  while (out.length > 0) {
    const last = out[out.length - 1];
    const x    = last.x.replace(/\s+$/, "");
    if (x !== "") {
      out[out.length - 1] = { ...last, x };
      break;
    }
    out.pop();
  }
  return out;
}

