// Markdown test
// =============
// `bun test Markdown.test.ts`. A reply's markdown read into blocks and
// marks: each block its own lines, a fence never closed holding the rest;
// a table on one dash, a quote's lines joined, a heading's closing hashes
// only when apart; marks nested as written, code's padding dropped, TeX
// written as text and money left as it is, numbers and paths as asked.

import { expect, test } from "bun:test";
import * as Markdown from "./Markdown.ts";

const HL    = { numbers: true, paths: true };
const read  = (s: string) => Markdown.markdown_parse(s, HL);
const marks = (s: string) => Markdown.markdown_inline(s, HL);

// each block keeps its lines as written; a fence never closed holds
// every line after it, its blank ones too (a reply streaming)
test("blocks keep their own lines; an open fence holds the rest", () => {
  const blocks = read("# Title\n\ntext\nmore\n\n```ts\nconst a = 1;\n\n");
  expect(blocks.map((b) => [b.kind, b.raw])).toEqual([["heading", "# Title"], ["paragraph", "text\nmore"], ["code", "```ts\nconst a = 1;\n\n"]]);
  expect(blocks[2]).toMatchObject({ lang: "ts", lines: ["const a = 1;", "", ""], isOpen: true });
  expect(read("```\nx\n```")[0]).not.toHaveProperty("isOpen");
  expect(read("$$\n\\frac{a}{b}\n$$")[0]).toMatchObject({ kind: "code", lang: "math", lines: ["\\frac{a}{b}"] });
});

// a heading's closing hashes go only when apart from its words (C#
// stays); a table's separator takes one dash (GitHub's); a quote's
// lines join, its blank ones dropped
test("a heading's hashes, a one-dash table, a quote's lines", () => {
  expect(read("## C# notes ##")[0]).toMatchObject({ level: 2, inline: [{ kind: "text", text: "C# notes" }] });
  expect(read("## C#")[0]).toMatchObject({ inline: [{ kind: "text", text: "C#" }] });
  expect(read("| a | b |\n| - | :-: |\n| 1 | x |")[0]).toMatchObject({ kind: "table", align: ["left", "center"] });
  expect(read("> one\n>\n> two")[0]).toMatchObject({ kind: "quote", inline: [{ kind: "text", text: "one two" }] });
  expect(read("> [!WARNING]\n> careful")[0]).toMatchObject({ kind: "alert", level: "warning" });
});

// a list's items, their depth by indent, a task's state; a line indented
// under an item continues it; a rule ends the list
test("a list: depth, tasks, continued lines, a rule after it", () => {
  const blocks = read("1. one\n   more\n   - [x] done\n---\nafter");
  expect(blocks.map((b) => b.kind)).toEqual(["list", "rule", "paragraph"]);
  const list = blocks[0] as Extract<Markdown.Block, { kind: "list" }>;
  expect(list.ordered).toBe(true);
  expect(list.items.map((i) => [i.marker, i.depth, i.task, Markdown.markdown_text(i.inline)])).toEqual([["1.", 0, undefined, "one more"], ["-", 1, true, "done"]]);
});

// marks nest as written; code drops one space each side (only both);
// numbers, versions and units, and paths are marked in plain text
test("marks: nested, code's padding, numbers and paths", () => {
  expect(marks("**a *b* c**")).toEqual([{ kind: "strong", children: [{ kind: "text", text: "a " }, { kind: "emphasis", children: [{ kind: "text", text: "b" }] }, { kind: "text", text: " c" }] }]);
  expect(marks("`` a ``")).toEqual([{ kind: "code", text: "a" }]);
  expect(marks("` a`")).toEqual([{ kind: "code", text: " a" }]);
  expect(marks("run v1.2.3 in 40ms at ./src/a.ts").filter((m) => m.kind !== "text")).toEqual([{ kind: "number", text: "v1.2.3" }, { kind: "number", text: "40ms" }, { kind: "path", text: "./src/a.ts" }]);
  expect(Markdown.markdown_inline("3 at /tmp/x", { numbers: false, paths: false })).toEqual([{ kind: "text", text: "3 at /tmp/x" }]);
});

// TeX between dollars written as text; money ($5) stays as it is
test("inline math as text; money left alone", () => {
  expect(marks("$\\alpha \\le \\mathbb{R}$")).toEqual([{ kind: "math", text: "α ≤ ℝ" }]);
  expect(marks("$\\frac{a+1}{b}$")).toEqual([{ kind: "math", text: "(a+1)/b" }]);
  expect(marks("$\\sum_i x_i$")).toEqual([{ kind: "math", text: "∑_i x_i" }]);
  expect(Markdown.markdown_text(marks("$5 and $10"))).toBe("$5 and $10");
  expect(marks("$5 and $10").some((m) => m.kind === "math")).toBe(false);
});

// the text a block copies, and as shown (a link's target after it)
test("text as copied and as shown", () => {
  const inline = marks("**a** `b` [c](d)");
  expect(Markdown.markdown_text(inline)).toBe("a b c");
  expect(Markdown.markdown_shown(inline)).toBe("a b c (d)");
});
