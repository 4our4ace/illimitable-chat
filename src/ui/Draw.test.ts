// Draw test
// =========
// `bun test Draw.test.ts`. What illi draws for a message: a mermaid
// block whole as a diagram, in the width, in the terminal's ink till its
// background is told, then in a palette over it; one still streaming as
// its code, one too long as its code; code's tokens by kind, a shell's
// too, a language by its common names, each kind's color the terminal's
// own till a palette colors it.
// Prism and Pele are loaded only as they are first needed.

import { expect, test } from "bun:test";
import * as Draw from "./Draw.ts";
import * as Paint from "./Paint.ts";
import * as Theme from "./Theme.ts";
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

// the background untold, each kind of code is drawn in the terminal's
// own color for it (Theme.SYNTAX: each kind, not only the three a reply
// names); a palette colors code by its slots instead (the last test)
test("each code kind's color the terminal's own while the background is untold", () => {
  expect(Draw.draw_syntax()).toBe(Theme.SYNTAX);
  expect(Object.keys(Draw.draw_syntax())).toEqual(expect.arrayContaining(["keyword", "string", "function", "class-name", "regex", "tag", "attr-name", "deleted"]));
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

// a shell's prompt sign before its command is left plain, a redirect
// is one piece, plain; after an operator a command again
test("a shell's prompt sign and redirects", () => {
  const sh = Draw.draw_code("sh", "$ npm i x 2>&1 >/dev/null | grep -v y")!;
  expect(sh[0].filter((t) => t.kind !== "").map((t) => [t.text, t.kind])).toEqual([["npm", "function"], ["|", "operator"], ["grep", "function"], ["-v", "keyword"]]);
  expect(sh[0].map((t) => t.text)).toContain("2>&1");
  expect(Draw.draw_code("sh", "% ls")![0].map((t) => [t.text, t.kind])).toEqual([["%", ""], [" ", ""], ["ls", "function"]]);
});

// every language a reply names reads (its first word, any case); plain
// text is plain; a name no grammar has, an Object's own too, is none;
// the same code twice is read once
test("Prism's languages by name; plain text plain; none for the rest", () => {
  const names = ["ts", "tsx", "js", "jsx", "json", "yaml", "md", "diff", "py", "c", "cpp", "cs", "java", "kotlin", "scala", "go", "rust",
    "swift", "dart", "ruby", "php", "perl", "lua", "r", "haskell", "elixir", "zig", "sql", "graphql", "css", "scss", "toml", "ini",
    "docker", "makefile", "nix", "hcl", "latex", "html", "xml", "svg", "regex"];
  expect(names.filter((n) => Draw.draw_code(n, "x") === null)).toEqual([]);
  expect(Draw.draw_code("Python {.line-numbers}", "def f(): pass")![0][0]).toEqual({ text: "def", kind: "keyword" });
  expect(Draw.draw_code("text", "if (a) { b }")).toEqual([[{ text: "if (a) { b }", kind: "" }]]);
  expect(["constructor", "toString", "__proto__", "extend"].map((n) => Draw.draw_code(n, "x"))).toEqual([null, null, null, null]);
  expect(Draw.draw_code("go", "func f() {}")).toBe(Draw.draw_code("go", "func f() {}"));
});

// names code is often given that Prism knows by another: C#, C++, rs
test("a language's common names", () => {
  expect(["c#", "C++", "rs", "golang", "tf"].filter((n) => Draw.draw_code(n, "x") === null)).toEqual([]);
  expect(Draw.draw_code("c#", "class A {}")![0][0]).toEqual({ text: "class", kind: "keyword" });
});

// a diagram too long to draw at once is none: its code shows instead
test("a diagram past its limits is none", () => {
  expect(Draw.draw_diagram("flowchart TD\n" + "  A --> B\n".repeat(200), 100)).toBeNull();
});

// a palette, once the background is told: code's colors are its slots
// (Reply.ts), none of the terminal's own
test("in a palette, code's colors are its slots", () => {
  Paint.paint_canvas("#1e1e2e");
  expect(Draw.draw_syntax()).toEqual({});
});
