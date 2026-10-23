// Reply
// =====
// illi's replies drawn from their markdown: Markdown.ts reads the text,
// and each block draws in Paint's lines, in a palette (Palettes.ts,
// Draw.draw_theme: the one named, or by
// the terminal's background; the terminal's own colors while untold):
//
// - code: a header (`── lang`, a copy button at its right) over its lines,
//   indented and unfilled, so a selection takes the code alone; Prism's
//   tokens and a shell's in the palette's code colors (Draw.ts)
// - a ```mermaid block, once whole: its diagram (Draw.ts) under buttons
//   that copy its source and its art; one that won't draw stays code
// - a table: boxed, its header bold over a double rule, its columns
//   aligned and fit to the width, under buttons that copy its markdown
//   and its art
// - headings by level (the first boxed in heavy lines, the second over a
//   heavy rule), lists (• ◦, numbers kept, tasks [ ] [✓]), a quote's bar,
//   an alert (> [!NOTE] ...) in a round box of its color, a rule
// - in text: code, links, numbers and paths in their colors; bold,
//   italics, struck through
//
// Tables and diagrams one after another sit side by side while they fit.
// A list, a quote and an alert have a copy button too; a reply of more
// blocks than one ends with one that copies it whole. A button's runs
// hold what it copies (Paint.Run's `copy`): a click copies it (Term.ts).
// A pipe's text has none (reply_buttons).
//
// A reply streaming grows (reply_grow): its blocks before its last blank
// line outside code are finished, as no text after them changes them,
// so their lines are kept and only the text after is read and laid out
// again (but after a figure: the next may sit beside it).

import { markdown_parse, markdown_shown, markdown_text, type Block, type Inline } from "./Markdown.ts";
import * as Draw from "./Draw.ts";
import * as Paint from "./Paint.ts";
import type { Token } from "./Theme.ts";

// Types
// =====

type Ink   = Paint.Run["s"];
type Line  = Paint.Line;
type Pal   = Record<string, string>;
type Table = Extract<Block, { kind: "table" }>;
type Item  = Extract<Block, { kind: "list" }>["items"][number];

// a block drawn: its lines, whether a figure (a table, a diagram: those
// sit side by side)
type Drawn = { lines: Line[]; fig: boolean };

// a button: its label, what it copies
type Button = [label: string, copy: () => string];

// a reply laid out as far as it is finished (reply_grow): its text to
// there (newlines as \n), its blocks there, counted and laid out, at a
// width, with buttons or not
export type Grown = { text: string; n: number; lines: Line[]; w: number; copy: boolean };

// Constants
// =========

// a code token's palette slot by its kind (Draw.ts names a
// shell's command a function, its flag a keyword); none: the code's own
const SLOT: Record<string, string> = {
  comment: "codeComment", prolog: "codeComment", doctype: "codeComment", cdata: "codeComment",
  string: "codeString", char: "codeString", "template-string": "codeString", "attr-value": "codeString", url: "codeString",
  number: "number", boolean: "number", constant: "number", symbol: "number", inserted: "number",
  keyword: "codeFlag", important: "codeFlag", atrule: "codeFlag", rule: "codeFlag", deleted: "codeFlag",
  function: "codeCommand", "class-name": "codeCommand", builtin: "codeCommand", key: "codeCommand", selector: "codeCommand",
  property: "link", tag: "link", "attr-name": "emphasis", variable: "emphasis", regex: "path",
};

// the slots dimmed where the palette leaves them out
const FAINT = ["codeComment", "quote", "rule", "tableRule"];

// an alert's color by its kind: the theme's token (Draw.draw_tokens)
const ALERT: Record<string, Token> = { note: "link", tip: "success", important: "accent", warning: "warning", caution: "error" };

// the longest rule; the room between figures side by side; the widest a
// table's art is copied
const RULE = 80;
const GAP  = 4;
const ART  = 100;

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
    return [buttons && from.n + blocks.length > 1 ? [...lines, [], line_right(button_line(pal, [["⧉ copy reply", () => text]]), w)] : lines, grown];
  } finally {
    buttons = on;
  }
}

// how many of a text's blocks are finished, and where the text after
// them starts: those before its last blank line (not its last line, which
// may grow) between two blocks or after the last, unless a figure is
// right before it. Only blank lines lie between blocks (the parser's)
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
    if (!drawn[k].fig && line < lines.length - 1 && blank(line)) {
      done = [k + 1, at + lines[line].length + 1];
    }
  }
  return done;
}

// the blocks a blank line apart; figures one after another side by side,
// GAP apart, while they fit, a blank line under each row of them
function reply_join(drawn: Drawn[], w: number): Line[] {
  const out: Line[] = [];
  for (let k = 0; k < drawn.length; k++) {
    if (k > 0) {
      out.push([]);
    }
    if (!drawn[k].fig) {
      out.push(...drawn[k].lines);
      continue;
    }
    let row = [drawn[k].lines];
    while (k + 1 < drawn.length && drawn[k + 1].fig) {
      const next = drawn[++k].lines;
      if (row.reduce((n, fig) => n + lines_width(fig) + GAP, 0) + lines_width(next) <= w) {
        row.push(next);
      } else {
        out.push(...lines_beside(row), []);
        row = [next];
      }
    }
    out.push(...lines_beside(row));
  }
  return out;
}

function block_drawn(pal: Pal, b: Block, w: number): Drawn {
  switch (b.kind) {
    case "heading": {
      return { lines: heading_lines(pal, b.level, b.inline, w), fig: false };
    }
    case "paragraph": {
      return { lines: Paint.runs_wrap(inline_runs(pal, b.inline, Paint.INK), w, false), fig: false };
    }
    case "quote": {
      return { lines: lines_aside(pal, quote_lines(pal, b.inline, w), () => quote_text(b.raw), w), fig: false };
    }
    case "alert": {
      return { lines: lines_aside(pal, alert_lines(pal, b.level, b.inline, w), () => quote_text(b.raw), w), fig: false };
    }
    case "rule": {
      return { lines: [[Paint.Run("─".repeat(Math.min(w, Math.max(8, RULE))), tone(pal, "rule"))]], fig: false };
    }
    case "code": {
      const art = b.lang.toLowerCase() === "mermaid" && b.isOpen !== true ? Draw.draw_diagram(b.lines.join("\n"), w) : null;
      return art === null ? { lines: code_lines(pal, b.lang, b.lines, w), fig: false } : { lines: diagram_lines(pal, b.lines.join("\n"), art, w), fig: true };
    }
    case "list": {
      return { lines: lines_over(pal, [["⧉ copy", () => b.raw]], list_lines(pal, b.items, w), w), fig: false };
    }
    case "table": {
      return { lines: lines_over(pal, [["⧉ md", () => b.raw], ["⧉ art", () => table_art(b)]], table_lines(pal, b, w), w), fig: true };
    }
  }
}

// Blocks
// ======

// a heading: the first boxed in heavy lines, the second over a heavy
// rule, both in the heading's color; the third in the accent; the rest
// in the strong color; all bold
function heading_lines(pal: Pal, level: number, inline: Inline[], w: number): Line[] {
  const c   = (level <= 2 ? pal.heading : level === 3 ? pal.accent ?? pal.heading : pal.strong) ?? "";
  const ink = { ...Paint.INK, b: true, c };
  if (level === 1) {
    return lines_boxed(Paint.runs_wrap(inline_runs(pal, inline, ink), Math.max(1, w - 4), false), { ...Paint.INK, c }, "┏━┓┃┗┛");
  }
  const rows = Paint.runs_wrap(inline_runs(pal, inline, ink), w, false);
  return level === 2 ? [...rows, [Paint.Run("━".repeat(Math.min(w, Paint.text_width(markdown_text(inline)))), { ...Paint.INK, c })]] : rows;
}

// a quote: the accent's bar, its text italic in the quote's color
function quote_lines(pal: Pal, inline: Inline[], w: number): Line[] {
  const rows = Paint.runs_wrap(inline_runs(pal, inline, { ...tone(pal, "quote"), i: true }), Math.max(1, w - 2), false);
  return rows.map((l) => [Paint.Run("│ ", tone(pal, "accent")), ...l]);
}

// a quote's text as copied: its lines without their `> `
function quote_text(raw: string): string {
  return raw.split("\n").map((l) => l.replace(/^\s*>\s?/, "")).join("\n");
}

// an alert: a round box of its color, its kind bold over its text
function alert_lines(pal: Pal, level: string, inline: Inline[], w: number): Line[] {
  const edge  = { ...Paint.INK, c: level in ALERT ? Draw.draw_tokens()[ALERT[level]] : "" };
  const title = [Paint.Run(level[0].toUpperCase() + level.slice(1), { ...edge, b: true })];
  const text  = inline.length === 0 ? [] : Paint.runs_wrap(inline_runs(pal, inline, Paint.INK), Math.max(1, w - 4), false);
  return lines_boxed([title, ...text], edge, "╭─╮│╰╯");
}

// a list: each item at its depth's indent, its glyph (its number, • or ◦
// deeper, a task's [ ] or [✓]) in the bullet's color, its text hung after
// it; a task done dim and struck through
function list_lines(pal: Pal, items: Item[], w: number): Line[] {
  return items.flatMap((item) => {
    const glyph = item.task !== undefined ? (item.task ? "[✓]" : "[ ]") : /\d/.test(item.marker) ? item.marker : item.depth > 0 ? "◦" : "•";
    const lead  = " ".repeat(item.depth * 2) + glyph + " ";
    const lw    = Paint.text_width(lead);
    const ink   = item.task === true ? { ...Paint.INK, d: true, t: true } : Paint.INK;
    const rows  = Paint.runs_wrap(inline_runs(pal, item.inline, ink), Math.max(1, w - lw), false);
    return rows.map((l, k) => [Paint.Run(k === 0 ? lead : " ".repeat(lw), tone(pal, "bullet")), ...l]);
  });
}

// code: its header (`── lang · [ ⧉ copy ]`; too narrow, the button on a
// line of its own) over its lines, two columns in, its tokens in the
// palette's code colors (an unlabeled block's as a shell's); its label
// cleaned, cut at the width
function code_lines(pal: Pal, lang: string, lines: string[], w: number): Line[] {
  const text  = lines.join("\n");
  const name  = Paint.runs_wrap([Paint.Run("── " + Paint.text_clean(lang === "" ? "code" : lang))], Math.max(1, w), true)[0];
  const label = Paint.Run(name.map((r) => r.x).join(""), tone(pal, "codeComment"));
  const code  = { ...Paint.INK, c: pal.codeText ?? "" };
  const toks  = Draw.draw_code(lang === "" ? "sh" : lang, text) ?? lines.map((x) => [{ text: x, kind: "" }]);
  const rows  = toks.flatMap((l) => Paint.runs_wrap(l.map((t) => Paint.Run(Paint.text_clean(t.text), token_ink(pal, t.kind, code))), Math.max(1, w - 2), true));
  const body  = rows.map((l) => [Paint.Run("  "), ...l]);
  if (!buttons) {
    return [[label], ...body];
  }
  const btn  = button_line(pal, [["⧉ copy", () => text]]);
  const head = [label, Paint.Run(" · ", tone(pal, "codeComment")), ...btn];
  return [...(Paint.line_width(head) <= w ? [head] : [[label], line_right(btn, w)]), ...body];
}

// a code token's ink: its slot's color (a comment's italic, dim if the
// palette has none), else the code's
function token_ink(pal: Pal, kind: string, code: Ink): Ink {
  const slot = SLOT[kind];
  const ink  = slot === undefined ? code : pal[slot] === undefined ? { ...code, d: FAINT.includes(slot) } : { ...code, c: pal[slot] };
  return slot === "codeComment" ? { ...ink, i: true } : ink;
}

// a diagram: its rows under buttons that copy its source and its art
function diagram_lines(pal: Pal, source: string, art: Draw.Cell[][], w: number): Line[] {
  const plain = art.map((row) => row.map((c) => c.text).join("").trimEnd()).join("\n");
  return lines_over(pal, [["⧉ source", () => source], ["⧉ art", () => plain]], art.map(Paint.cells_line), w);
}

// a table: boxed in the table rule's color, its header bold in its color
// over a double rule, a rule between rows; each column as its alignment
// says, its width fit to w (column_widths), each cell wrapped in it
function table_lines(pal: Pal, t: Table, w: number): Line[] {
  const rows    = [t.header, ...t.rows];
  const widths  = column_widths(table_widths(rows, markdown_text, Paint.text_width), w - 4, 3, table_widths(rows, markdown_text, longest_word));
  const rule    = tone(pal, "tableRule");
  const head    = { ...Paint.INK, b: true, c: pal.tableHeader ?? "" };
  const edge    = (c: string): Line => [Paint.Run(c[0] + widths.map((cw) => c[1].repeat(cw + 2)).join(c[2]) + c[3], rule)];
  const row     = (cells: Inline[][], top: boolean): Line[] => {
    const wrapped = widths.map((cw, c) => Paint.runs_wrap(top ? [Paint.Run(Paint.text_clean(markdown_text(cells[c] ?? [])), head)] : inline_runs(pal, cells[c] ?? [], Paint.INK), cw, false));
    const tall    = Math.max(...wrapped.map((x) => x.length));
    return Array.from({ length: tall }, (_, k) => [
      Paint.Run("│ ", rule),
      ...widths.flatMap((cw, c) => [...(c > 0 ? [Paint.Run(" │ ", rule)] : []), ...line_aligned(wrapped[c][k] ?? [], cw, t.align[c] ?? "left")]),
      Paint.Run(" │", rule),
    ]);
  };
  return [edge("┌─┬┐"), ...row(t.header, true), edge("╞═╪╡"), ...t.rows.flatMap((r, k) => [...(k > 0 ? [edge("├─┼┤")] : []), ...row(r, false)]), edge("└─┴┘")];
}

// each column's widest by a measure of its cells' text
function table_widths(rows: Inline[][][], text: (cell: Inline[]) => string, measure: (s: string) => number): number[] {
  return rows[0].map((_, c) => Math.max(0, ...rows.map((r) => measure(text(r[c] ?? [])))));
}

// a table as text, boxed in plain lines, at most ART wide, in a fence (a
// chat pastes it as is)
function table_art(t: Table): string {
  const rows   = [t.header, ...t.rows];
  const cells  = rows.map((r) => t.header.map((_, c) => markdown_shown(r[c] ?? [])));
  const widths = column_widths(table_widths(rows, markdown_shown, Paint.text_width), ART - 4, 3, table_widths(rows, markdown_shown, longest_word));
  const rule   = (l: string, m: string, r: string) => l + widths.map((cw) => "─".repeat(cw + 2)).join(m) + r;
  const row    = (r: string[], top: boolean) => {
    const wrapped = r.map((x, c) => Paint.runs_wrap([Paint.Run(x)], widths[c], false).map((l) => l.map((run) => run.x).join("")));
    const tall    = Math.max(...wrapped.map((x) => x.length));
    const cell    = (x: string, c: number) => line_aligned([Paint.Run(x)], widths[c], top ? "center" : t.align[c] ?? "left").map((run) => run.x).join("");
    return Array.from({ length: tall }, (_, k) => "│ " + wrapped.map((x, c) => cell(x[k] ?? "", c)).join(" │ ") + " │");
  };
  const art = [rule("┌", "┬", "┐"), ...row(cells[0], true), ...cells.slice(1).flatMap((r) => [rule("├", "┼", "┤"), ...row(r, false)]), rule("└", "┴", "┘")];
  return ["```", ...art, "```"].join("\n");
}

// columns' widths in `room` columns, `gap` between each two: each its
// natural width if all fit; else the narrow whole and the rest sharing
// what is left, none under its longest word while those fit, the widest
// cut till they fit
function column_widths(natural: number[], room: number, gap: number, words: number[]): number[] {
  const free = Math.max(natural.length, room - gap * (natural.length - 1));
  if (natural.reduce((a, b) => a + b, 0) <= free) {
    return natural;
  }
  const least  = natural.map((w, c) => Math.min(w, Math.max(1, words[c] ?? 1)));
  const widths = natural.map(() => 0);
  let open = natural.map((_, c) => c);
  let left = free;
  for (let fixed = [-1]; fixed.length > 0; ) {
    const share = Math.floor(left / open.length);
    const claim = (c: number) => (natural[c] <= share ? natural[c] : least[c]);
    const fits  = open.reduce((a, c) => a + least[c], 0) <= left;
    fixed = open.filter((c) => natural[c] <= share);
    if (fits && (fixed.length === 0 || open.reduce((a, c) => a + claim(c), 0) > left)) {
      fixed = open.filter((c) => least[c] > share);
    }
    for (const c of fixed) {
      widths[c] = claim(c);
      left -= widths[c];
    }
    open = open.filter((c) => !fixed.includes(c));
  }
  open.forEach((c, k) => (widths[c] = Math.max(1, Math.floor(left / open.length) + (k < left % open.length ? 1 : 0))));
  while (widths.reduce((a, b) => a + b, 0) > free) {
    const widest = widths.indexOf(Math.max(...widths));
    if (widths[widest] <= 1) {
      break;
    }
    widths[widest] -= 1;
  }
  return widths;
}

// Inline
// ======

// text's runs from an ink: code, links, numbers and paths in their
// colors; bold and italics in theirs; struck through dim
function inline_runs(pal: Pal, nodes: Inline[], ink: Ink): Line {
  return nodes.flatMap((n): Line => {
    switch (n.kind) {
      case "text": {
        return [Paint.Run(Paint.text_clean(n.text), ink)];
      }
      case "strong": {
        return inline_runs(pal, n.children, { ...ink, b: true, c: pal.strong ?? ink.c });
      }
      case "emphasis": {
        return inline_runs(pal, n.children, { ...ink, i: true, c: pal.emphasis ?? ink.c });
      }
      case "strike": {
        return inline_runs(pal, n.children, { ...ink, t: true, d: true });
      }
      case "code": {
        return [Paint.Run(Paint.text_clean(n.text), { ...ink, c: pal.inlineCode ?? ink.c })];
      }
      case "math": {
        return [Paint.Run(Paint.text_clean(n.text), { ...ink, i: true, c: pal.emphasis ?? ink.c })];
      }
      case "link": {
        const web = /^(https?:|mailto:)/i.test(n.href);
        return [Paint.Run(Paint.text_clean(n.text), { ...ink, u: true, c: pal.link ?? ink.c, k: web ? Paint.text_clean(n.href) : "" })];
      }
      case "number": {
        return [Paint.Run(n.text, { ...ink, c: pal.number ?? ink.c })];
      }
      case "path": {
        return [Paint.Run(n.text, { ...ink, c: pal.path ?? ink.c })];
      }
      case "dim": {
        return [Paint.Run(Paint.text_clean(n.text), { ...ink, d: true })];
      }
    }
  });
}

// a slot's ink: its color, else the ink (dim for a faint slot)
function tone(pal: Pal, slot: string): Ink {
  return pal[slot] === undefined ? { ...Paint.INK, d: FAINT.includes(slot) } : { ...Paint.INK, c: pal[slot] };
}

// Buttons
// =======

// buttons a space apart: each `[ label ]`, its label in the accent, each
// of its runs copying what it holds
function button_line(pal: Pal, btns: Button[]): Line {
  return btns.flatMap(([label, copy], k) => {
    const run = (x: string, s: Ink): Paint.Run => ({ ...Paint.Run(x, s), copy });
    return [...(k === 0 ? [] : [Paint.Run(" ")]), run("[ ", Paint.DIM), run(label, { ...Paint.INK, c: pal.accent ?? "" }), run(" ]", Paint.DIM)];
  });
}

// lines under their buttons, at the right of the lines' width (none if
// they won't fit in w)
function lines_over(pal: Pal, btns: Button[], lines: Line[], w: number): Line[] {
  const row = button_line(pal, btns);
  const rw  = Paint.line_width(row);
  return !buttons || rw > w ? lines : [line_right(row, Math.max(rw, lines_width(lines))), ...lines];
}

// lines with a copy button two columns right of their first line, or
// over them where it won't fit
function lines_aside(pal: Pal, lines: Line[], copy: () => string, w: number): Line[] {
  const btn = button_line(pal, [["⧉ copy", copy]]);
  const lw  = lines_width(lines);
  if (!buttons || lw + 2 + Paint.line_width(btn) > w) {
    return lines_over(pal, [["⧉ copy", copy]], lines, w);
  }
  return lines.map((l, k) => (k === 0 ? [...line_padded(l, lw), Paint.Run("  "), ...btn] : l));
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

// lines boxed: the corners and edges in `edge` (top left, top, top
// right, side, bottom left, bottom right), a column of room each side
function lines_boxed(rows: Line[], edge: Ink, glyphs: string): Line[] {
  const [tl, top, tr, side, bl, br] = [...glyphs];
  const iw = lines_width(rows);
  return [
    [Paint.Run(tl + top.repeat(iw + 2) + tr, edge)],
    ...rows.map((l) => [Paint.Run(side + " ", edge), ...line_padded(l, iw), Paint.Run(" " + side, edge)]),
    [Paint.Run(bl + top.repeat(iw + 2) + br, edge)],
  ];
}

// figures side by side, each its own width, GAP apart
function lines_beside(figs: Line[][]): Line[] {
  const tall = figs.reduce((n, f) => Math.max(n, f.length), 0);
  const ws   = figs.map(lines_width);
  return Array.from({ length: tall }, (_, k) => figs.flatMap((f, j) => [...(j === 0 ? [] : [Paint.Run(" ".repeat(GAP))]), ...line_padded(f[k] ?? [], ws[j])]));
}

function line_padded(l: Line, w: number): Line {
  return [...l, Paint.Run(" ".repeat(Math.max(0, w - Paint.line_width(l))))];
}

// a line at the right end of w columns
function line_right(l: Line, w: number): Line {
  return [Paint.Run(" ".repeat(Math.max(0, w - Paint.line_width(l)))), ...l];
}

// a line in w columns as an alignment says
function line_aligned(l: Line, w: number, align: string): Line {
  const room = Math.max(0, w - Paint.line_width(l));
  const left = align === "right" ? room : align === "center" ? Math.floor(room / 2) : 0;
  return [Paint.Run(" ".repeat(left)), ...l, Paint.Run(" ".repeat(room - left))];
}

function longest_word(s: string): number {
  return s.split(/\s+/).reduce((n, word) => Math.max(n, Paint.text_width(word)), 0);
}
