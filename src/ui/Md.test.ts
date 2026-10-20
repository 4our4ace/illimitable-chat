// Md test
// =======
// `bun test Md.test.ts`. How the little markdown of a message reads; a
// message typed keeps its blank lines; a command's exit names its result.

import { expect, test } from "bun:test";
import * as Md from "./Md.ts";
import * as Paint from "./Paint.ts";
import * as View from "./View.ts";

const kinds = (src: string) => Md.md_parse(src).map((b) => (b.$ === "List" ? "List:" + (b.k ? "1." : "-") + b.x.length : b.$));

// a list is of one kind: numbered items after bullets start a list of
// their own, and bullets after numbered ones
test("a list holds items of one kind", () => {
  expect(kinds("- a\n  more\n- b\n1. c\n2. d\n- e")).toEqual(["List:-2", "List:1.2", "List:-1"]);
});

// a rule ends the paragraph above it, as a heading or a list does
test("a rule right under a paragraph is a rule", () => {
  expect(kinds("para\n---\nnext")).toEqual(["Para", "Rule", "Para"]);
  expect(kinds("a\n|x|y|\n|-|-|\n|1|2|")).toEqual(["Para", "Tabl"]);
  expect(kinds("a\n| not a table |\nb")).toEqual(["Para"]);
});

// a message typed (a short paste is typed too) shows as it was: each
// blank line kept, those at its ends dropped; a long paste's too
test("a message typed keeps its blank lines", () => {
  const lines = (b: Md.Block[]) => b.flatMap((x) => (x.$ === "Para" ? x.x.map((l) => l.map((s) => s.x).join("")) : []));
  expect(lines(Md.md_plain("\na\n\n\n\nb\n\n"))).toEqual(["a", "", "", "", "b"]);
  expect(lines(Md.md_plain('see <pasted n="1">\nx\n\n\ny\n</pasted>'))).toEqual(["see ", "x", "", "", "y"]);
});

// a shell's "(exit 0 in 0.4 s)" is in its result's name, never a
// numbered line; with no output, a result of its own still says it
test("a command's exit and time name its result, unnumbered", () => {
  const shown = (text: string) => Paint.rows_lines(View.entry_rows(1, "echo", text), 50).map((l) => l.map((r) => r.x).join("").trimEnd());
  expect(Md.md_output("a\nb\n(exit 0 in 0.4 s)")).toEqual([{ $: "File", k: "result · exit 0 · 0.4 s", n: 1, x: ["a", "b"] }]);
  expect(Md.md_output("(killed by SIGTERM in 2.0 s)")).toEqual([{ $: "File", k: "result · killed by SIGTERM · 2.0 s", n: 1, x: [] }]);
  expect(shown("a\n(exit 1 in 0.0 s)")).toEqual(["╭─ result · exit 1 · 0.0 s ──────────────────────╮", "│ 1 a                                            │", "╰────────────────────────────────────────────────╯"]);
});
