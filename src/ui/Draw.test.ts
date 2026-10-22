// Draw test
// =========
// `bun test Draw.test.ts`. What cellsmith draws for a message: a mermaid
// block whole as a diagram, in the width, in the terminal's ink till its
// background is told, then in a palette over it; one still streaming as
// its code; code's tokens by kind, a shell's too. Prism and Pele are
// loaded only as they are first needed.

import { expect, test } from "bun:test";
import * as Draw from "./Draw.ts";
import * as Paint from "./Paint.ts";
import * as View from "./View.ts";

const FLOW = "flowchart TD\n  A[Start] --> B{Ready?}\n  B -->|yes| C[Go]\n  B -->|no| D[Wait]";

const text = (lines: Paint.Line[]) => lines.map((l) => l.map((r) => r.x).join("")).join("\n");
const colors = (lines: Paint.Line[]) => new Set(lines.flatMap((l) => l.flatMap((r) => [r.s.c, r.s.g])).filter((c) => c.startsWith("#")));

// what is loaded only as it is first needed: Prism at the first code not
// a shell's, Pele at the first diagram
test("Prism loads at the first code it reads, Pele at the first diagram", () => {
  const which = (k: string) => /node_modules[\\/](pelext|pele|prismjs)[\\/]/.exec(k)?.[1] ?? (/[\\/]ui[\\/]Prism\.ts$/.test(k) ? "Prism.ts" : null);
  const loaded = () => [...new Set(Object.keys(require.cache).map(which).filter((k) => k !== null))].sort();
  expect(loaded()).toEqual([]);
  Draw.draw_code("bash", "ls -l");
  expect(loaded()).toEqual([]);
  Draw.draw_code("ts", "const x = 1;");
  expect(loaded()).toEqual(["Prism.ts", "prismjs"]);
  Draw.draw_diagram(FLOW, 60);
  expect(loaded()).toEqual(["Prism.ts", "pele", "pelext", "prismjs"]);
});

test("a mermaid block whole is a diagram, in the width; streaming, its code", () => {
  const whole = Paint.rows_lines(View.entry_rows(1, "illi", "See:\n\n```mermaid\n" + FLOW + "\n```"), 60);
  expect(text(whole)).toContain("Ready?");
  expect(text(whole)).toMatch(/[│─╭╮╰╯┌┐└┘]/);
  expect(text(whole)).not.toContain("-->");
  expect(whole.every((l) => Paint.text_width(l.map((r) => r.x).join("")) <= 60)).toBe(true);
  const open = Paint.rows_lines(View.entry_rows(null, "illi", "See:\n\n```mermaid\n" + FLOW), 60);
  expect(text(open)).toContain("-->");
});

test("a diagram is the terminal's ink till its background is told, then a palette's", () => {
  const before = Draw.draw_diagram(FLOW, 60)!;
  expect(before.flat().some((c) => c.fg?.startsWith("#") || c.bg?.startsWith("#"))).toBe(false);
  Paint.paint_canvas("#1e1e2e");
  const lines = Paint.rows_lines(View.entry_rows(2, "illi", "```mermaid\n" + FLOW + "\n```"), 60);
  expect(colors(lines).size).toBeGreaterThan(1);
  expect(Paint.line_ansi(lines.find((l) => l.some((r) => r.s.c.startsWith("#")))!)).toMatch(/\x1b\[0[;\d]*;38;2;\d+;\d+;\d+/);
});

test("a diagram too narrow to draw is none, and its code shows", () => {
  expect(Draw.draw_diagram("sequenceDiagram\n" + "A->>B: a very long message indeed\n".repeat(3) + "B->>C: and another long one", 12)).toBeNull();
  expect(Draw.draw_diagram("not mermaid at all", 60)).toBeNull();
});

test("code's tokens by kind; a shell's commands, flags, strings and comments", () => {
  const ts = Draw.draw_code("ts", "const x = 1; // one\nfoo('a')")!;
  expect(ts[0].filter((t) => t.kind !== "").map((t) => [t.text, t.kind])).toEqual([["const", "keyword"], ["1", "number"], ["// one", "comment"]]);
  expect(ts[1].find((t) => t.text === "foo")!.kind).toBe("function");
  const sh = Draw.draw_code("bash", "git log --oneline 'a b' | head -3 # first\nls")!;
  const kinds = sh[0].filter((t) => t.kind !== "").map((t) => [t.text, t.kind]);
  expect(kinds).toEqual([["git", "function"], ["--oneline", "keyword"], ["'a b'", "string"], ["|", "operator"], ["head", "function"], ["-3", "keyword"], ["# first", "comment"]]);
  expect(sh[1]).toEqual([{ text: "ls", kind: "function" }]);
  expect(Draw.draw_code("klingon", "x")).toBeNull();
});
