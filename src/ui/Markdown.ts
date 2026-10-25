// Markdown
// ========
// A reply's markdown, read for Reply.ts to draw: `markdown_parse` reads
// its lines into blocks, `markdown_inline` a line of text into its marks.
// Blocks are read a line at a time, the first rule that fits winning: a
// fence (``` or ~~~, closed by a run as long), display math ($$, as code
// named "math"), a blank line, a heading (# to ######), a rule (---,
// ***, ___), a table (a line holding | over a row of dashes), a quote or
// a GitHub alert (> [!NOTE]), a list (-, *, +, 1., 1)), else a
// paragraph, whose lines join with spaces till another block starts.
// A list goes on past a blank line while an item or an indented line
// follows, but ends at a fence (code under an item is a block of its
// own, its fence's indent taken off its lines).
// Every block keeps its own lines (raw), so a reply streaming can tell
// where a block ends (Reply.reply_grow) and a button can copy it.
//
// Inline marks are found left to right, the first to start winning (a
// tie: the earlier in MARKS): a character escaped (\*, \$: itself, no
// mark), code, a link, bold, struck, italics, a bare url, inline math
// (TeX, written as text: $\alpha$, α; money, $5, stays as it is).
// Between them, file paths and numbers are marked as asked (Highlight).
// A line too long to read is left as text.

// Types
// =====

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong" | "emphasis" | "strike"; children: Inline[] }
  | { kind: "code" | "math" | "number" | "path"; text: string }
  | { kind: "link"; text: string; href: string };

// a list's item: its marker as written ("": a paragraph of the item
// before it at its depth, after a blank line), its depth (how many items
// it is indented under), whether a task done (none: no task), whether a
// blank line is before it (gap)
export type Item = { marker: string; depth: number; task?: boolean; gap?: true; inline: Inline[] };

export type AlertLevel = "note" | "tip" | "important" | "warning" | "caution";

// what plain text has marked: numbers, file paths
export type Highlight = { numbers: boolean; paths: boolean };

// a block, its lines as written (raw: its first to its last, blank lines
// after it left out); code's lines verbatim, isOpen while its fence is
// unclosed; a table's rows each as wide as its header
export type Block = { raw: string } & (
  | { kind: "heading"; level: number; inline: Inline[] }
  | { kind: "paragraph"; inline: Inline[] }
  | { kind: "list"; ordered: boolean; items: Item[] }
  | { kind: "code"; lang: string; lines: string[]; isOpen?: true }
  | { kind: "quote"; inline: Inline[] }
  | { kind: "alert"; level: AlertLevel; inline: Inline[] }
  | { kind: "rule" }
  | { kind: "table"; header: Inline[][]; align: Align[]; rows: Inline[][][] });

type Align = "left" | "right" | "center";

// a block read at a line, and the line after it
type Read = [Block, number];

// a list's item as read: the column its text starts at, its marker's
type Listed = { item: Item; at: number; indent: number };

// Constants
// =========

// the longest line read for marks (UTF-16 code units)
const LONGEST = 4000;

// a fence: its run (a backtick one with no backtick after it), the
// language after it (its first word); a heading; a rule; a
// separator row's cell (GitHub's: one dash will do); a quoted line; a
// list's item (its indent, its marker, its text); a task; an alert's
// first line; a continuation line (indented, holding text)
const FENCE  = /^\s*(`{3,}(?!.*`)|~{3,})\s*([^\s`]*)/;
const HEAD   = /^(#{1,6})\s+(.*)$/;
const RULE   = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const DASHES = /^:?-+:?$/;
const QUOTE  = /^\s*>/;
const ITEM   = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TASK   = /^\[([ xX])\]\s+(.*)$/;
const ALERT  = /^\[!(note|tip|important|warning|caution)\]/i;
const MORE   = /^\s{2,}\S/;

// the inline marks, in the order they win a tie: an ASCII punctuation
// character escaped, code (a run of backticks, closed by a run exactly
// as long), a link (a bracket in its words escaped), bold (***x*** bold
// and italic), struck, italics (bold inside them too), a bare url
// (trailing punctuation left out), inline math (not after \, $ or a
// word, nor spaced inside its dollars). No mark but code closes on a
// character escaped
const MARKS = new RegExp([
  /\\(?<escaped>[!-/:-@[-`{-~])/.source,
  /(?<ticks>`+)(?!`)(?<code>[\s\S]+?)(?<!`)\k<ticks>(?!`)/.source,
  /\[(?<label>(?:\\.|[^\]\\])+)\]\((?<href>[^)\s]+)\)/.source,
  /\*\*\*(?<both>[^*]+)(?<!\\)\*\*\*/.source,
  /\*\*(?!\*)(?<bold>(?:[^*]|\*(?!\*))+?)(?<!\\)\*\*/.source,
  /(?<!\w)__(?!_)(?<under>(?:[^_]|_(?!_))+?)(?<!\\)__(?!\w)/.source,
  /~~(?<struck>[^~]+)(?<!\\)~~/.source,
  /(?<![\w*])\*(?![\s*])(?<star>(?:[^*]|\*\*(?![\s*])[^*]+?\*\*)+?)(?<![\s\\])\*(?![\w*])/.source,
  /(?<!\w)_(?<low>[^\s_][^_]*)(?<!\\)_(?!\w)/.source,
  /(?<url>https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/.source,
  /(?<![\\$\w])\$(?![\s$])(?<math>(?:\\\$|[^$\n])*?(?:\\\$|[^\s$\\]))\$(?![\w$])/.source,
].join("|"), "g");

// what text holds for a mark to start in it (MARKS: each mark's first
// character, a url's scheme), so text without it is read no further
const MARKED = /[\\`[*_~$]|https?:/;

// a file path (/, ~/, ./, ../, then ASCII names; not inside a word, a
// path or a url); a number (v1.2.3, 2.796, 1,000, 12:30, a unit glued
// on: its digits taken whole, none of it touching a word or a path)
const PATH   = /(?<![\w/.:])(?:~|\.\.?)?\/[A-Za-z0-9_.@+-]+(?:\/[A-Za-z0-9_.@+-]*)*/g;
const NUMBER = /(?<![\w.#/-])(?=(v?\d+(?:[.,:]\d+)*))\1(?:ms|Gi|Mi|GB|MB|KB|[%smhdx])?(?![\w/])/g;

// what makes math TeX: a command, a power or index, an equation, a group,
// or one letter alone
const TEX = /[\\^_={}]|^[A-Za-z]$/;

// TeX's commands that stand for one character (LaTeX's own symbols, as
// unicode-math names them), and those that read as their name
const SYMBOL: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ",
  pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ",
  phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ",
  Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", ast: "∗", star: "⋆", circ: "∘", bullet: "•",
  oplus: "⊕", ominus: "⊖", otimes: "⊗", odot: "⊙", cap: "∩", cup: "∪", wedge: "∧", land: "∧",
  vee: "∨", lor: "∨", neg: "¬", lnot: "¬", setminus: "∖",
  le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", equiv: "≡", sim: "∼",
  simeq: "≃", cong: "≅", propto: "∝", ll: "≪", gg: "≫", prec: "≺", succ: "≻", subset: "⊂",
  supset: "⊃", subseteq: "⊆", supseteq: "⊇", in: "∈", notin: "∉", ni: "∋", perp: "⊥",
  parallel: "∥", mid: "∣", vdash: "⊢", models: "⊨",
  to: "→", rightarrow: "→", leftarrow: "←", gets: "←", leftrightarrow: "↔", Rightarrow: "⇒",
  Leftarrow: "⇐", Leftrightarrow: "⇔", implies: "⟹", impliedby: "⟸", iff: "⟺", mapsto: "↦",
  uparrow: "↑", downarrow: "↓", longrightarrow: "⟶", longleftarrow: "⟵", Longrightarrow: "⟹",
  hookrightarrow: "↪",
  sum: "∑", prod: "∏", coprod: "∐", int: "∫", iint: "∬", oint: "∮", bigcup: "⋃", bigcap: "⋂",
  infty: "∞", partial: "∂", nabla: "∇", forall: "∀", exists: "∃", nexists: "∄", emptyset: "∅",
  varnothing: "∅", sqrt: "√", angle: "∠", triangle: "△", prime: "′", hbar: "ℏ", ell: "ℓ",
  Re: "ℜ", Im: "ℑ", aleph: "ℵ", top: "⊤", bot: "⊥", ldots: "…", dots: "…", cdots: "⋯",
  vdots: "⋮", ddots: "⋱", lceil: "⌈", rceil: "⌉", lfloor: "⌊", rfloor: "⌋", langle: "⟨",
  rangle: "⟩", quad: " ", qquad: "  ", left: "", right: "",
  ...Object.fromEntries("sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln lg exp lim max min sup inf det gcd deg arg ker dim mod Pr".split(" ").map((f) => [f, f])),
  bmod: "mod",
};

// the double-struck letters TeX names (\mathbb{R}: the reals)
const BLACKBOARD: Record<string, string> = { C: "ℂ", N: "ℕ", P: "ℙ", Q: "ℚ", R: "ℝ", Z: "ℤ" };

// Blocks
// ======

// a reply's blocks, its line endings any of \n, \r\n, \r
export function markdown_parse(source: string, hl: Highlight): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  for (let i = 0; i < lines.length;) {
    const read = block_read(lines, i, hl);
    if (read === null) {
      i += 1;
    } else {
      out.push(read[0]);
      i = read[1];
    }
  }
  return out;
}

// the block at line i (null: a blank line), by the first rule that fits
function block_read(lines: string[], i: number, hl: Highlight): Read | null {
  const line = lines[i];
  const read = fence_read(lines, i) ?? math_read(lines, i);
  if (read !== null) {
    return read;
  }
  if (line.trim() === "") {
    return null;
  }
  return heading_read(lines, i, hl) ?? (RULE.test(line) ? [{ kind: "rule", raw: line }, i + 1] : null) ?? table_read(lines, i, hl) ?? quote_read(lines, i, hl) ?? list_read(lines, i, hl) ?? para_read(lines, i, hl);
}

// whether a block other than a paragraph starts at line i: what ends a
// paragraph
function block_starts(lines: string[], i: number): boolean {
  const line = lines[i];
  return line.trim() === "" || FENCE.test(line) || HEAD.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line) || table_align(lines, i) !== null || math_read(lines, i) !== null;
}

// a fence's code: its lines till a run of its own character as long or
// longer alone on a line (none: to the end, still open), each without as
// much of its indent as the fence has (code under a list's item)
function fence_read(lines: string[], i: number): Read | null {
  const open = FENCE.exec(lines[i]);
  if (open === null) {
    return null;
  }
  const close  = new RegExp("^\\s*" + open[1][0] + "{" + open[1].length + ",}\\s*$");
  const end    = lines.findIndex((l, k) => k > i && close.test(l));
  const indent = /^\s*/.exec(lines[i])![0].length;
  const code   = (xs: string[]) => (indent === 0 ? xs : xs.map((x) => x.slice(Math.min(indent, /^\s*/.exec(x)![0].length))));
  if (end < 0) {
    return [{ kind: "code", lang: open[2], lines: code(lines.slice(i + 1)), isOpen: true, raw: lines.slice(i).join("\n") }, lines.length];
  }
  return [{ kind: "code", lang: open[2], lines: code(lines.slice(i + 1, end)), raw: lines.slice(i, end + 1).join("\n") }, end + 1];
}

// display math as code named "math": $$x$$ on a line, or from a line
// starting $$ to one ending $$, no blank line between; its text what is
// between, blank parts left out, its ends trimmed. None there (unclosed,
// empty): not math
function math_read(lines: string[], i: number): Read | null {
  const head = lines[i].trim();
  if (!head.startsWith("$$")) {
    return null;
  }
  const rest = head.slice(2);
  let end = i;
  let parts = [rest.slice(0, -2)];
  if (rest.length < 2 || !rest.endsWith("$$")) {
    for (end = i + 1; end < lines.length && !lines[end].trim().endsWith("$$"); end++) {
      if (lines[end].trim() === "") {
        return null;
      }
    }
    if (end >= lines.length || lines[end].trim() === "") {
      return null;
    }
    parts = [rest, ...lines.slice(i + 1, end), lines[end].trim().slice(0, -2)];
  }
  const kept = parts.filter((p) => p.trim() !== "");
  if (kept.length === 0) {
    return null;
  }
  kept[0] = kept[0].trim();
  kept[kept.length - 1] = kept[kept.length - 1].trim();
  return [{ kind: "code", lang: "math", lines: kept, raw: lines.slice(i, end + 1).join("\n") }, end + 1];
}

// a heading: # to ###### and a space at the line's start; a closing run
// of # after a space is left out (C# keeps its own)
function heading_read(lines: string[], i: number, hl: Highlight): Read | null {
  const m = HEAD.exec(lines[i]);
  if (m === null) {
    return null;
  }
  const text = m[2].trimEnd().replace(/(?:^|\s+)#+$/, "").trimEnd();
  return [{ kind: "heading", level: m[1].length, inline: markdown_inline(text, hl), raw: lines[i] }, i + 1];
}

// a table: a line holding | over a separator row, then each line holding
// | after; its header read without numbers or paths, its rows as wide as
// it (a cell missing empty, those past it left out)
function table_read(lines: string[], i: number, hl: Highlight): Read | null {
  const align = table_align(lines, i);
  if (align === null) {
    return null;
  }
  const header = table_cells(lines[i]).map((c) => markdown_inline(c, { numbers: false, paths: false }));
  let end = i + 2;
  while (end < lines.length && lines[end].includes("|") && lines[end].trim() !== "") {
    end++;
  }
  const rows = lines.slice(i + 2, end).map((l) => {
    const cells = table_cells(l);
    return header.map((_, k) => (k < cells.length ? markdown_inline(cells[k], hl) : []));
  });
  return [{ kind: "table", header, align, rows, raw: lines.slice(i, end).join("\n") }, end];
}

// a table's alignments, by its separator row's cells (:-: centered, -:
// right, any other left), if line i holds | and the next is one, as many
// cells as it (GitHub's rule)
function table_align(lines: string[], i: number): Align[] | null {
  if (!lines[i].includes("|") || i + 1 >= lines.length || !lines[i + 1].includes("-")) {
    return null;
  }
  const cells = table_cells(lines[i + 1]);
  if (!cells.every((c) => DASHES.test(c)) || cells.length !== table_cells(lines[i]).length) {
    return null;
  }
  return cells.map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left"));
}

// a row's cells, trimmed: its outer pipes dropped (an escaped last one
// kept), split at each pipe not escaped; \| a pipe in its cell
function table_cells(line: string): string[] {
  let row = line.trim();
  row = row.startsWith("|") ? row.slice(1) : row;
  row = row.endsWith("|") && !row.endsWith("\\|") ? row.slice(0, -1) : row;
  return row.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
}

// a quote: lines starting >, each without it and a space after; one
// whose first line starts [!NOTE] (TIP, IMPORTANT, WARNING, CAUTION) an
// alert, its text after that. The text's lines join with spaces, blank
// ones left out
function quote_read(lines: string[], i: number, hl: Highlight): Read | null {
  let end = i;
  while (end < lines.length && QUOTE.test(lines[end])) {
    end++;
  }
  if (end === i) {
    return null;
  }
  const said  = lines.slice(i, end).map((l) => l.replace(/^\s*> ?/, ""));
  const alert = ALERT.exec(said[0]);
  const raw   = lines.slice(i, end).join("\n");
  const text  = (xs: string[]) => markdown_inline(xs.map((x) => x.trim()).filter((x) => x !== "").join(" "), hl);
  if (alert !== null) {
    return [{ kind: "alert", level: alert[1].toLowerCase() as AlertLevel, inline: text([said[0].slice(alert[0].length), ...said.slice(1)]), raw }, end];
  }
  return [{ kind: "quote", inline: text(said), raw }, end];
}

// a list: items (a marker, a space, its text), each as deep as the
// items open left of its indent; and lines indented two or more holding
// text, each added to its owner: the last item whose text starts at or
// left of it, else the last whose marker is left of it, else the last.
// A blank line goes on to an item after it (at the first item's indent,
// one ordered as it is) or an indented line, that starts a paragraph of
// its owner; else it ends the list, as any other line does, a fence too
// (a rule isn't an item). Ordered by its first item's marker
function list_read(lines: string[], i: number, hl: Highlight): Read | null {
  if (!ITEM.test(lines[i])) {
    return null;
  }
  const items   : Listed[] = [];
  const open    : number[] = [];
  const first   = ITEM.exec(lines[i])!;
  const base    = list_indent(first[1]);
  const ordered = /\d/.test(first[2]);
  let [end, gap] = [i, false];
  for (let k = i; k < lines.length; k++) {
    const line = lines[k];
    if (line.trim() === "") {
      gap = true;
      continue;
    }
    const m      = RULE.test(line) || FENCE.test(line) ? null : ITEM.exec(line);
    const indent = list_indent(/^\s*/.exec(line)![0]);
    if (m !== null && !(gap && indent <= base && /\d/.test(m[2]) !== ordered)) {
      items.push(list_item(m, open, gap, hl));
    } else if (m === null && MORE.test(line) && !FENCE.test(line)) {
      const owner = items.findLast((x) => x.at <= indent) ?? items.findLast((x) => x.indent < indent) ?? items[items.length - 1];
      if (gap) {
        items.push({ item: { marker: "", depth: owner.item.depth, gap: true, inline: markdown_inline(line.trim(), hl) }, at: owner.at, indent: owner.indent });
      } else {
        owner.item.inline.push({ kind: "text", text: " " }, ...markdown_inline(line.trim(), hl));
      }
    } else {
      break;
    }
    [end, gap] = [k + 1, false];
  }
  return [{ kind: "list", ordered, items: items.map((x) => x.item), raw: lines.slice(i, end).join("\n") }, end];
}

// an item as read, its depth the count of the items open (their
// indents, outermost first) left of its own, which it closes those
// right of; the column its text starts at, its marker's. [ ] or [x] and
// a space before its text: a task
function list_item(m: RegExpExecArray, open: number[], gap: boolean, hl: Highlight): Listed {
  const indent = list_indent(m[1]);
  while (open.length > 0 && open[open.length - 1] > indent) {
    open.pop();
  }
  if (open.length === 0 || open[open.length - 1] < indent) {
    open.push(indent);
  }
  const task = TASK.exec(m[3]);
  const text = (task === null ? m[3] : task[2]).trimEnd();
  const item : Item = { marker: m[2], depth: open.length - 1, inline: markdown_inline(text, hl) };
  if (task !== null) {
    item.task = task[1] !== " ";
  }
  if (gap) {
    item.gap = true;
  }
  return { item, at: indent + m[2].length + 1, indent };
}

// an indent's width: a tab two columns
function list_indent(lead: string): number {
  return [...lead].reduce((n, ch) => n + (ch === "\t" ? 2 : 1), 0);
}

// a paragraph: its lines till a blank one or another block, each
// trimmed, joined with spaces
function para_read(lines: string[], i: number, hl: Highlight): Read {
  let end = i + 1;
  while (end < lines.length && !block_starts(lines, end)) {
    end++;
  }
  const said = lines.slice(i, end);
  return [{ kind: "paragraph", inline: markdown_inline(said.map((l) => l.trim()).join(" "), hl), raw: said.join("\n") }, end];
}

// Inline
// ======

// a line's marks; nested marks read inside bold, struck and italics,
// never inside code or a link's text
export function markdown_inline(text: string, hl: Highlight): Inline[] {
  if (text.length > LONGEST) {
    return [{ kind: "text", text }];
  }
  if (!MARKED.test(text)) {
    return inline_plain(text, hl);
  }
  const out: Inline[] = [];
  let at = 0;
  for (const m of text.matchAll(MARKS)) {
    const node = inline_mark(m.groups!, hl);
    if (node !== null) {
      out.push(...inline_plain(text.slice(at, m.index), hl), node);
      at = m.index + m[0].length;
    }
  }
  return [...out, ...inline_plain(text.slice(at), hl)];
}

// a mark as its groups tell (a character escaped: itself, as text);
// null: math that isn't TeX (money), text
function inline_mark(g: Record<string, string | undefined>, hl: Highlight): Inline | null {
  if (g.escaped !== undefined) {
    return { kind: "text", text: g.escaped };
  }
  if (g.code !== undefined) {
    const spaced = g.code.startsWith(" ") && g.code.endsWith(" ") && g.code.trim() !== "";
    return { kind: "code", text: spaced ? g.code.slice(1, -1) : g.code };
  }
  if (g.label !== undefined) {
    return { kind: "link", text: g.label.replace(/\\([!-/:-@[-`{-~])/g, "$1"), href: g.href! };
  }
  if (g.both !== undefined) {
    return { kind: "emphasis", children: [{ kind: "strong", children: markdown_inline(g.both, hl) }] };
  }
  const nest = g.bold ?? g.under;
  if (nest !== undefined) {
    return { kind: "strong", children: markdown_inline(nest, hl) };
  }
  if (g.struck !== undefined) {
    return { kind: "strike", children: markdown_inline(g.struck, hl) };
  }
  const it = g.star ?? g.low;
  if (it !== undefined) {
    return { kind: "emphasis", children: markdown_inline(it, hl) };
  }
  if (g.url !== undefined) {
    return { kind: "link", text: g.url, href: g.url };
  }
  return TEX.test(g.math!) ? { kind: "math", text: tex_text(g.math!) } : null;
}

// plain text, its paths and numbers marked as asked (a number in a path
// the path's)
function inline_plain(text: string, hl: Highlight): Inline[] {
  if (text === "") {
    return [];
  }
  if (!hl.paths || !text.includes("/")) {
    return inline_numbers(text, hl);
  }
  const out: Inline[] = [];
  let at = 0;
  for (const m of text.matchAll(PATH)) {
    out.push(...inline_numbers(text.slice(at, m.index), hl), { kind: "path", text: m[0] });
    at = m.index + m[0].length;
  }
  return [...out, ...inline_numbers(text.slice(at), hl)];
}

// text, its numbers marked if asked
function inline_numbers(text: string, hl: Highlight): Inline[] {
  if (text === "" || !hl.numbers || !/\d/.test(text)) {
    return text === "" ? [] : [{ kind: "text", text }];
  }
  const out: Inline[] = [];
  let at = 0;
  for (const m of text.matchAll(NUMBER)) {
    if (m.index > at) {
      out.push({ kind: "text", text: text.slice(at, m.index) });
    }
    out.push({ kind: "number", text: m[0] });
    at = m.index + m[0].length;
  }
  return at < text.length ? [...out, { kind: "text", text: text.slice(at) }] : out;
}

// TeX as text: \text{x} (\mathrm, \mathbf...) its x; \frac{a}{b} a/b,
// \sqrt{x} √x (each in parentheses unless one word); \mathbb{R} ℝ; a
// command its character (SYMBOL; one unknown as written); \, \; \: \!
// and "\ " a space; the braces left dropped
function tex_text(tex: string): string {
  const group = (x: string) => (/^[A-Za-z0-9.\\]+$/.test(x) ? x : "(" + x + ")");
  return tex
    .replace(/\\(?:text|textrm|textbf|textit|mathrm|mathit|mathbf|mathsf|mathtt|boldsymbol|operatorname)\{([^{}]*)\}/g, "$1")
    .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => group(a) + "/" + group(b))
    .replace(/\\sqrt\{([^{}]*)\}/g, (_, x: string) => "√" + group(x))
    .replace(/\\mathbb\{([A-Z])\}/g, (all, x: string) => BLACKBOARD[x] ?? all)
    .replace(/\\([A-Za-z]+)/g, (all, name: string) => (Object.hasOwn(SYMBOL, name) ? SYMBOL[name] : all))
    .replace(/\\[,;:! ]/g, " ")
    .replace(/[{}]/g, "");
}

// Text
// ====

// inline nodes as plain text
export function markdown_text(inline: Inline[]): string {
  return inline.map((n) => ("children" in n ? markdown_text(n.children) : n.text)).join("");
}

// inline nodes as plain text, a link's target after its text unless the
// same: docs (https://x.co)
export function markdown_shown(inline: Inline[]): string {
  return inline.map((n) => ("children" in n ? markdown_shown(n.children) : n.kind === "link" && n.text !== n.href ? n.text + " (" + n.href + ")" : n.text)).join("");
}
