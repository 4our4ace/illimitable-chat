// Md
// ==
// What the view draws (Paint.ts) of a message that isn't markdown
// (markdown is Reply.ts's): spans (inline code, links, bold, italics,
// agent names, `[FireAnt]`, linked to its chat), flattened for a summary
// by `md_flat`; a code block, as a tool call holds it. `md_plain` reads
// text as it is: its lines, blank ones kept, names, an image as its
// token, and a long paste (sent marked, paste_mark) whole, as pasted.
// `md_output` reads a tool's result as a file's lines: a read's as its
// lines, a unified diff (Machine.ts writes them, git too) as its file
// and hunks, any other text as lines named "result" (a command's exit
// and time in that name), so every result looks as a read does (the
// <history> line recall may have appended never shown: history_bare,
// Clip.ts). Tokens
// hold raw text; each emitter escapes it. A span is the first mark at
// its point.

import * as Names from "../chat/Names.ts";
import { history_bare } from "../tools/Clip.ts";

// Types
// =====

export type Span =
  | { $: "Text"; x: string }            // x
  | { $: "Code"; x: string }            // `x`
  | { $: "Bold"; x: string }            // **x**
  | { $: "Ital"; x: string }            // *x*
  | { $: "Link"; x: string; k: string } // [x](k) (k: a url or a /path), or a bare url
  | { $: "Name"; x: string }            // [x]: an agent, x its name
  | { $: "Chip"; x: string }            // [Pasted text #1 +12 lines], [Image #2]: what the user's message holds

// k: a label, or ""; open: its fence never closed (a message streaming:
// a diagram draws once it is whole)
export type Code = { $: "Code"; k: string; x: string; open?: true }; // ```k x ```

// a line of a diff: kept (" "), dropped ("-") or added ("+"), its number
// in the old file if dropped, else in the new one
export type Line = { s: " " | "-" | "+"; n: number; x: string };

export type Block =
  | { $: "Para"; x: Span[][] }             // its lines
  | { $: "Diff"; k: string; x: Line[][] }  // --- k, +++ k, then hunks (@@ -1,2 +1,3 @@)
  | { $: "File"; k: string; n: number; x: string[] } // a file's lines x, from line n, named k (a read's "lines 4-7 of 15", else "result")

// Constants
// =========

const NAME  = new RegExp("\\[(" + Names.NAME + ")\\]", "g");
const CHIP  = new RegExp(/\[(?:Pasted text #\d+[^\]\n]*|Image #\d+)\]/.source + "|" + NAME.source, "g");
export const PASTE = /<pasted n="(\d+)">\n([\s\S]*?)\n<\/pasted>/g;
const SPAN  = new RegExp([
  /`([^`\n]+)`/.source,
  /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|\/(?!\/)[^\s)]*)\)/.source,
  NAME.source,
  /\*\*([^*\n]+)\*\*/.source,
  // *x*: no word or star either side, no space after the first star, on
  // one line (2*3*4 stays as it is)
  /(?<![\w*])\*([^\s*][^*\n]*)\*(?![\w*])/.source,
  // a bare url as a reply reads one (Markdown.ts): two characters at
  // least after the scheme, the stop or bracket after it left out
  /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/.source,
].join("|"), "g");
const NEW   = /^\+\+\+ (.*)$/;
const READ  = /^\[(lines (\d+)-\d+ of \d+[^\]]*)\]$/;
const HUNK  = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const EXIT  = /^\((exit -?\d+|stopped|killed by \w+) in (\d+(?:\.\d+)?) s\)$/;

// Constructors
// ============

export function Text(x: string): Span {
  return { $: "Text", x };
}

export function Name(x: string): Span {
  return { $: "Name", x };
}

// Parse
// =====

// the text between the matches of re, and each match as mark reads it
function spans_by(s: string, re: RegExp, mark: (m: RegExpMatchArray) => Span): Span[] {
  const out: Span[] = [];
  let at = 0;
  for (const m of s.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > at) {
      out.push(Text(s.slice(at, i)));
    }
    out.push(mark(m));
    at = i + m[0].length;
  }
  if (at < s.length) {
    out.push(Text(s.slice(at)));
  }
  return out;
}

export function span_parse(s: string): Span[] {
  return spans_by(s, SPAN, span_mark);
}

function span_mark(m: RegExpMatchArray): Span {
  if (m[1] !== undefined) {
    return { $: "Code", x: m[1] };
  }
  if (m[2] !== undefined) {
    return { $: "Link", x: m[2], k: m[3] };
  }
  if (m[4] !== undefined) {
    return Name(m[4]);
  }
  if (m[5] !== undefined) {
    return { $: "Bold", x: m[5] };
  }
  if (m[6] !== undefined) {
    return { $: "Ital", x: m[6] };
  }
  return { $: "Link", x: m[7], k: m[7] };
}

// a line's text, its marks dropped (a summary is plain text: Paint.ts)
export function md_flat(s: string): string {
  return span_parse(s).map((span) => span.x).join("");
}

// a message as typed: one line per line, its blank lines kept (those at
// its ends dropped), each line's names and tokens read (plain_line); a
// marked paste's lines as they are, between
export function md_plain(s: string): Block[] {
  const text  = s.replace(/\r/g, "");
  const typed = (x: string): Block[] => {
    const lines = x.split("\n");
    const from  = lines.findIndex((l) => l.trim() !== "");
    const upto  = lines.findLastIndex((l) => l.trim() !== "");
    return from < 0 ? [] : [{ $: "Para", x: lines.slice(from, upto + 1).map((l) => (l.trim() === "" ? [] : plain_line(l))) }];
  };
  const out: Block[] = [];
  let at = 0;
  for (const m of text.matchAll(PASTE)) {
    out.push(...typed(text.slice(at, m.index)), { $: "Para", x: m[2].split("\n").map((l) => (l === "" ? [] : [Text(l)])) });
    at = (m.index ?? 0) + m[0].length;
  }
  return [...out, ...typed(text.slice(at).replace(at > 0 ? /^[ \t]+/ : /^$/, ""))];
}

function plain_line(s: string): Span[] {
  return spans_by(s, CHIP, (m) => (m[1] === undefined ? { $: "Chip", x: m[0] } : Name(m[1])));
}

// a long paste as sent: its text marked (its token's number), so the
// model sees where it starts and ends, and the history puts its token
// back (Screen.ts); the user's message shows it whole (md_plain)
export function paste_mark(n: number, x: string): string {
  return '<pasted n="' + n + '">\n' + x.replace(/\n$/, "") + "\n</pasted>";
}

// a paste's token: its lines (a last newline ends one, not starts one),
// or its characters if it is one
export function paste_label(n: number | string, x: string): string {
  const body  = x.replace(/\n$/, "");
  const lines = body.split("\n").length;
  return "[Pasted text #" + n + (lines > 1 ? " +" + lines + " lines]" : ", " + body.length + " chars]");
}

// a tool's result: a read's lines a File, each unified diff in it a
// Diff, the text around them a File named "result" (none if blank); a
// command's exit and time, its last line (Machine.ts), in the last
// result's name, never a numbered line (no output: a result of its own).
// Its own text: the <history> line recall appended left out
// (history_bare), so its last line is the result's
export function md_output(s: string): Block[] {
  const all   = history_bare(s).replace(/\r/g, "").split("\n");
  const read  = READ.exec(all[all.length - 1]);
  if (read !== null) {
    return [{ $: "File", k: read[1], n: Number(read[2]), x: all.slice(0, -1) }];
  }
  const exit  = EXIT.exec(all[all.length - 1]);
  const lines = exit === null ? all : all.slice(0, -1);
  const out   = output_parts(lines);
  const last  = out[out.length - 1];
  if (exit === null) {
    return out;
  }
  const name = "result · " + exit[1] + " · " + exit[2] + " s";
  return last?.$ === "File" && last.k === "result" ? [...out.slice(0, -1), { ...last, k: name }] : [...out, { $: "File", k: name, n: 1, x: [] }];
}

// a result's lines: each unified diff in them, the text around them
function output_parts(lines: string[]): Block[] {
  const out: Block[] = [];
  let [i, at] = [0, 0];
  while (i < lines.length) {
    const [diff, next] = diff_parse(lines, i);
    if (diff !== null) {
      out.push(...output_lines(lines.slice(at, i)), diff);
      at = next;
    }
    i = next;
  }
  return [...out, ...output_lines(lines.slice(at))];
}

// a result's text as a File named "result", its blank lines at either
// end dropped; none if all blank
function output_lines(lines: string[]): Block[] {
  const from = lines.findIndex((l) => l.trim() !== "");
  const upto = lines.findLastIndex((l) => l.trim() !== "");
  return from < 0 ? [] : [{ $: "File", k: "result", n: 1, x: lines.slice(from, upto + 1) }];
}

// null: no diff starts at line i (its "---" and "+++" lines, then hunks,
// each exactly as long as its header counts); and the line after it
function diff_parse(lines: string[], i: number): [Block | null, number] {
  const file  = NEW.exec(lines[i + 1] ?? "");
  const hunks : Line[][] = [];
  if (file === null || !lines[i].startsWith("--- ")) {
    return [null, i + 1];
  }
  let j = i + 2;
  for (let h = HUNK.exec(lines[j] ?? ""); h !== null; h = HUNK.exec(lines[j] ?? "")) {
    const [hunk, next] = hunk_parse(lines, j + 1, h);
    if (hunk === null) {
      return [null, i + 1];
    }
    hunks.push(hunk);
    j = next;
  }
  return hunks.length === 0 ? [null, i + 1] : [{ $: "Diff", k: file[1], x: hunks }, j];
}

// null: the lines from j don't fill the header's counts
function hunk_parse(lines: string[], j: number, h: RegExpExecArray): [Line[] | null, number] {
  let [olds, news] = [Number(h[2] ?? 1), Number(h[4] ?? 1)];
  let [o, n] = [Number(h[1]), Number(h[3])];
  const out: Line[] = [];
  for (; olds > 0 || news > 0; j++) {
    const s = lines[j]?.[0];
    const x = lines[j]?.slice(1) ?? "";
    if (s === " " && olds > 0 && news > 0) {
      out.push({ s, n: n++, x });
      [o, olds, news] = [o + 1, olds - 1, news - 1];
    } else if (s === "-" && olds > 0) {
      out.push({ s, n: o++, x });
      olds--;
    } else if (s === "+" && news > 0) {
      out.push({ s, n: n++, x });
      news--;
    } else if (s !== "\\") {
      return [null, j];
    }
  }
  return [out, j];
}

