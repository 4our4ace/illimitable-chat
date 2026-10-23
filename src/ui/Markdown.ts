// Markdown
// ========
// A reply's markdown read into blocks (headings, paragraphs, lists with
// their tasks, code, quotes, alerts, rules, tables, $$ math as code) and
// their inline nodes (code, links, bold, italics, struck, $ math as text,
// and numbers and paths picked out of the plain text), which Reply.ts
// draws. From prismantis's parser (THIRD_PARTY_NOTICES.md). Each block
// keeps the source lines it was read from (raw). A line too long to look
// into (MAX_INLINE) is plain text.

// Types
// =====

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "emphasis"; children: Inline[] }
  | { kind: "strike"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "math"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "number"; text: string }
  | { kind: "path"; text: string }
  | { kind: "dim"; text: string };

export type Block = { raw: string } & (
  | { kind: "heading"; level: number; inline: Inline[] }
  | { kind: "paragraph"; inline: Inline[] }
  | { kind: "list"; ordered: boolean; items: Item[] }
  | { kind: "code"; lang: string; lines: string[]; isOpen?: true }
  | { kind: "quote"; inline: Inline[] }
  | { kind: "alert"; level: AlertLevel; inline: Inline[] }
  | { kind: "rule" }
  | { kind: "table"; header: Inline[][]; align: ("left" | "right" | "center")[]; rows: Inline[][][] }
);

// a list's item: its marker, how deep (each 2 columns of indent), done
// or not (a task: [x], [ ]), its text
export type Item = { marker: string; depth: number; task?: boolean; inline: Inline[] };

export type AlertLevel = "note" | "tip" | "important" | "warning" | "caution";

// what the plain text has picked out of it
export type Highlight = { numbers: boolean; paths: boolean };

// a block before its raw lines are put to it
type Draft = Block extends infer B ? (B extends unknown ? Omit<B, "raw"> : never) : never;

// Constants
// =========

// the longest text looked into for inline marks
const MAX_INLINE = 4000;

// a block's first line: a table's separator row, a list's item, a fence
// (its run of backticks or tildes, its language), an alert's ([!NOTE])
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE     = /^\s*(`{3,}|~{3,})\s*([\w+-]*)/;
const ALERT     = /^\[!(note|tip|important|warning|caution)\]\s*(.*)$/i;

// the inline marks, in one pass: `code`, [a](link), **bold**, __bold__,
// ~~struck~~, *italics*, _italics_, a bare url, $math$; a number (with
// its unit), a path, in what's left
const INLINE = /(`+)(?!`)(.+?)(?<!`)\1(?!`)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+?)\*\*|(?<![\w_])__([^_]+?)__(?![\w_])|~~([^~]+?)~~|(?<![\w*])\*([^*\s][^*]*?)\*(?!\w)|(?<![\w_])_([^_\s][^_]*?)_(?!\w)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(?<![\\$\w])\$(?=\S)((?:\\.|[^$\n\\])+?)(?<=\S)\$(?![\w$])/g;
const NUMBER = /(?<![\w.#/-])(v?\d+(?:[.,:]\d+)*(?:%|ms|s|m|h|d|Gi|Mi|GB|MB|KB|x)?)(?![\w/])/g;
const PATH   = /(?<![\w/.:])((?:~|\.{1,2})?\/[\w.@+-]+(?:\/[\w.@+-]*)*)/g;

// TeX's names written as the characters they stand for
const TEX: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", epsilon: "ε", theta: "θ", lambda: "λ", mu: "μ", pi: "π", rho: "ρ", sigma: "σ", Sigma: "Σ", tau: "τ", phi: "φ", omega: "ω", Omega: "Ω",
  cdot: "·", times: "×", div: "÷", pm: "±", le: "≤", leq: "≤", ge: "≥", geq: "≥", neq: "≠", ne: "≠", approx: "≈", infty: "∞", to: "→", rightarrow: "→", Rightarrow: "⇒", sum: "Σ", sqrt: "√", lceil: "⌈", rceil: "⌉", lfloor: "⌊", rfloor: "⌋",
};

// Reading
// =======

// a source's blocks, the plain text's numbers and paths picked out as hl
// asks (a table's header never)
export function markdown_parse(source: string, hl: Highlight): Block[] {
  const lines  = source.replace(/\r\n?/g, "\n").split("\n");
  const at     = (n: number) => lines[n] ?? "";
  const blocks: Block[] = [];
  const add    = (block: Draft, from: number, to: number) => blocks.push({ ...block, raw: lines.slice(from, to).join("\n") } as Block);
  let paraStart = 0;
  let para: string[] = [];
  const flush = (end: number) => {
    if (para.length) {
      add({ kind: "paragraph", inline: markdown_inline(para.join(" "), hl) }, paraStart, end);
    }
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line  = at(i);
    const fence = FENCE.exec(line);
    if (fence) {
      flush(i);
      const start  = i;
      const run    = fence[1] ?? "```";
      const closer = new RegExp(`^\\s*\\${run[0]}{${run.length},}\\s*$`);
      const body: string[] = [];
      i++;
      while (i < lines.length && !closer.test(at(i))) {
        body.push(at(i++));
      }
      add({ kind: "code", lang: fence[2] ?? "", lines: body, ...(i < lines.length ? {} : { isOpen: true as const }) }, start, i + 1);
      continue;
    }
    const math = math_at(lines, i);
    if (math) {
      flush(i);
      add({ kind: "code", lang: "math", lines: math.lines }, i, math.end + 1);
      i = math.end;
      continue;
    }
    if (line.trim() === "") {
      flush(i);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush(i);
      add({ kind: "heading", level: (heading[1] ?? "#").length, inline: markdown_inline(heading[2] ?? "", hl) }, i, i + 1);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush(i);
      add({ kind: "rule" }, i, i + 1);
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(at(i + 1))) {
      flush(i);
      const start  = i;
      const header = split_row(line);
      const align  = split_row(at(i + 1)).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left"));
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && at(i).includes("|") && at(i).trim() !== "") {
        const cells = split_row(at(i++));
        rows.push(header.map((_, c) => markdown_inline(cells[c] ?? "", hl)));
      }
      add({ kind: "table", header: header.map((c) => markdown_inline(c, { numbers: false, paths: false })), align, rows }, start, i);
      i--;
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush(i);
      const start = i;
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(at(i))) {
        body.push(at(i++).replace(/^\s*>\s?/, ""));
      }
      const alert = ALERT.exec(body[0] ?? "");
      if (alert) {
        add({ kind: "alert", level: alert[1]!.toLowerCase() as AlertLevel, inline: markdown_inline([alert[2]!, ...body.slice(1)].join(" ").trim(), hl) }, start, i);
      } else {
        add({ kind: "quote", inline: markdown_inline(body.join(" "), hl) }, start, i);
      }
      i--;
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flush(i);
      const start   = i;
      const ordered = /\d/.test(item[2] ?? "");
      const items: Item[] = [];
      const indents: number[] = [];
      while (i < lines.length) {
        const it = LIST_ITEM.exec(at(i));
        if (it) {
          indents.push((it[1] ?? "").replace(/\t/g, "  ").length + (it[2] ?? "").length + 1);
          const task = /^\[([ xX])\]\s+(.*)$/.exec(it[3] ?? "");
          items.push({ marker: it[2] ?? "-", depth: Math.floor((it[1] ?? "").replace(/\t/g, "  ").length / 2), ...(task ? { task: task[1] !== " " } : {}), inline: markdown_inline(task ? task[2]! : it[3] ?? "", hl) });
        } else if (/^\s{2,}\S/.test(at(i)) && items.length) {
          // a line indented under an item: the text of the deepest item
          // whose own text starts no further in
          const indent = (at(i).match(/^\s*/)?.[0] ?? "").replace(/\t/g, "  ").length;
          let owner = items.length - 1;
          while (owner > 0 && indents[owner]! > indent) {
            owner--;
          }
          const target  = items[owner]!;
          target.inline = [...target.inline, { kind: "text", text: " " }, ...markdown_inline(at(i).trim(), hl)];
        } else {
          break;
        }
        i++;
      }
      add({ kind: "list", ordered, items }, start, i);
      i--;
      continue;
    }
    if (!para.length) {
      paraStart = i;
    }
    para.push(line.trim());
  }
  flush(lines.length);
  return blocks;
}

// a line's inline nodes: the marks INLINE finds, $…$ as math where it
// reads as TeX (else as it was), what's between decorated
export function markdown_inline(text: string, hl: Highlight): Inline[] {
  if (text.length > MAX_INLINE) {
    return [{ kind: "text", text }];
  }
  const out: Inline[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > at) {
      out.push(...decorate(text.slice(at, m.index), hl));
    }
    if (m[2] !== undefined) {
      out.push({ kind: "code", text: m[2] });
    } else if (m[3] !== undefined) {
      out.push({ kind: "link", text: m[3], href: m[4] ?? "" });
    } else if (m[5] !== undefined || m[6] !== undefined) {
      out.push({ kind: "strong", children: markdown_inline(m[5] ?? m[6] ?? "", hl) });
    } else if (m[7] !== undefined) {
      out.push({ kind: "strike", children: markdown_inline(m[7], hl) });
    } else if (m[8] !== undefined || m[9] !== undefined) {
      out.push({ kind: "emphasis", children: markdown_inline(m[8] ?? m[9] ?? "", hl) });
    } else if (m[10] !== undefined) {
      out.push({ kind: "link", text: m[10], href: m[10] });
    } else if (m[11] !== undefined) {
      out.push(...(tex_is(m[11]) ? [{ kind: "math" as const, text: tex_text(m[11]) }] : decorate(m[0], hl)));
    }
    at = m.index + m[0].length;
  }
  if (at < text.length) {
    out.push(...decorate(text.slice(at), hl));
  }
  return out;
}

// inline nodes as plain text
export function markdown_text(inline: Inline[]): string {
  return inline.map((n) => ("children" in n ? markdown_text(n.children) : n.text)).join("");
}

// inline nodes as text, a link's target after its words where they differ
export function markdown_shown(inline: Inline[]): string {
  return inline.map((n) => (n.kind === "link" && n.text !== n.href ? `${n.text} (${n.href})` : "children" in n ? markdown_shown(n.children) : n.text)).join("");
}

// a table row's cells, \| kept in a cell
function split_row(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "\\" && trimmed[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (ch === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

// plain text with its numbers and paths picked out, as hl asks (a number
// inside a path is the path's)
function decorate(text: string, hl: Highlight): Inline[] {
  if (!hl.numbers && !hl.paths) {
    return [{ kind: "text", text }];
  }
  const marks: { start: number; end: number; kind: "number" | "path" }[] = [];
  if (hl.paths) {
    for (const m of text.matchAll(PATH)) {
      marks.push({ start: m.index, end: m.index + m[0].length, kind: "path" });
    }
  }
  if (hl.numbers) {
    for (const m of text.matchAll(NUMBER)) {
      const start = m.index;
      if (!marks.some((p) => start < p.end && start + m[0].length > p.start)) {
        marks.push({ start, end: start + m[0].length, kind: "number" });
      }
    }
  }
  marks.sort((a, b) => a.start - b.start);
  const out: Inline[] = [];
  let at = 0;
  for (const m of marks) {
    if (m.start > at) {
      out.push({ kind: "text", text: text.slice(at, m.start) });
    }
    out.push({ kind: m.kind, text: text.slice(m.start, m.end) });
    at = m.end;
  }
  if (at < text.length) {
    out.push({ kind: "text", text: text.slice(at) });
  }
  return out;
}

// whether $…$ holds TeX (a command, a sub- or superscript, a brace, or a
// lone letter), not money
function tex_is(tex: string): boolean {
  return /[\\^_={}]/.test(tex) || /^[A-Za-z]$/.test(tex);
}

// TeX as text: \text{…} and its kin as their words, a known name as its
// character, a spacing command a space, braces gone
function tex_text(tex: string): string {
  return tex
    .replace(/\\(?:text|mathrm|mathit|operatorname)\{([^{}]*)\}/g, "$1")
    .replace(/\\([A-Za-z]+)/g, (all, name: string) => TEX[name] ?? all)
    .replace(/\\[,;:! ]/g, " ")
    .replace(/[{}]/g, "");
}

// a $$ block from line start: its lines (blank ones dropped, the first
// and last trimmed) and the line it ends on; null where it doesn't close
// before a blank line or the end, or holds nothing
function math_at(lines: string[], start: number): { lines: string[]; end: number } | null {
  const trimmed = (n: number) => (lines[n] ?? "").trim();
  const first   = trimmed(start);
  if (!first.startsWith("$$")) {
    return null;
  }
  const open = first.slice(2);
  let end = start;
  if (!(open.length >= 2 && open.endsWith("$$"))) {
    end = start + 1;
    while (end < lines.length && !trimmed(end).endsWith("$$")) {
      if (trimmed(end) === "") {
        return null;
      }
      end++;
    }
    if (end === lines.length) {
      return null;
    }
  }
  const body = end === start ? [open.slice(0, -2)] : [open, ...lines.slice(start + 1, end), trimmed(end).slice(0, -2)];
  const tex  = body.filter((line) => line.trim() !== "").map((line, i, all) => (i === 0 || i === all.length - 1 ? line.trim() : line));
  return tex.length ? { lines: tex, end } : null;
}
