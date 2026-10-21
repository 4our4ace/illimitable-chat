// Md test
// =======
// `bun test Md.test.ts`. A message typed keeps its blank lines; a
// command's exit names its result; a note or a thought draws as a reply
// does, in its look.

import { expect, test } from "bun:test";
import * as Md from "./Md.ts";
import * as Paint from "./Paint.ts";
import * as View from "./View.ts";

// a thought: markdown drawn as a reply's (its list's bullet), all of it
// dim and italic; with no text, nothing
test("a thought draws as a reply does, dim and italic", () => {
  const lines = Paint.rows_lines(View.entry_rows(1, "mind", "**Plan**\n\n- one\n- two"), 40);
  const text  = lines.map((l) => l.map((r) => r.x).join("").trim()).filter((x) => x !== "");
  expect(text).toEqual(["Plan", "• one", "• two"]);
  expect(lines.flat().filter((r) => r.x.trim() !== "").every((r) => r.s.d && r.s.i)).toBe(true);
  expect(View.entry_rows(1, "mind", "  ")).toEqual([]);
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
