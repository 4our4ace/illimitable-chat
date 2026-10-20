// Reply test
// ==========
// `bun test Reply.test.ts`. A reply as cellsmith draws it: code under its
// header and copy button, unfilled; a table boxed and a diagram side by
// side under their buttons; headings, lists, quotes and alerts; text's
// colors from the palette, the terminal's own while its background is
// untold; each button copying its block, the last the reply; no buttons
// in a pipe.

import { expect, test } from "bun:test";
import * as Paint from "./Paint.ts";
import * as Reply from "./Reply.ts";

const text   = (lines: Paint.Line[]) => lines.map((l) => l.map((r) => r.x).join("").trimEnd());
const button = (lines: Paint.Line[], label: string) => lines.flat().find((r) => r.x === label && r.copy !== undefined)?.copy?.();

const CODE  = "Run it:\n\n```bash\ngrep -n 'x' ~/a.log # look\n```";
const TABLE = "| Step | Gap |\n| --- | ---: |\n| clamped | 2.796 s |";
const FLOW  = "```mermaid\nflowchart TD\n  A[Start] --> B[Go]\n```";

test("code: its header and copy button over its lines, two in, unfilled", () => {
  const lines = Reply.reply_lines(CODE, 60);
  expect(text(lines)).toEqual(["Run it:", "", "── bash           [ ⧉ copy ]", "  grep -n 'x' ~/a.log # look", "", " ".repeat(44) + "[ ⧉ copy reply ]"]);
  expect(lines.flat().every((r) => r.s.g === "")).toBe(true);
  expect(button(lines, "⧉ copy")).toBe("grep -n 'x' ~/a.log # look");
  expect(button(lines, "⧉ copy reply")).toBe(CODE);
});

test("a table boxed and a diagram beside it, each under its buttons", () => {
  const lines = Reply.reply_lines(TABLE + "\n\n" + FLOW, 100);
  const shown = text(lines);
  expect(shown[0]).toMatch(/\[ ⧉ md \] \[ ⧉ art \] +\[ ⧉ source \] \[ ⧉ art \]$/);
  expect(shown[1]).toMatch(/^┌─+┬─+┐ +┌/);
  expect(shown[2]).toMatch(/^│ Step +│ +Gap │/);
  expect(shown[3]).toMatch(/^╞═+╪═+╡/);
  expect(shown[4]).toMatch(/^│ clamped │ 2\.796 s │/);
  expect(shown.join("\n")).toContain("Start");
  const arts = lines.flat().filter((r) => r.x === "⧉ art").map((r) => r.copy!());
  expect(arts[0]).toStartWith("```\n┌");
  expect(arts[1]).toContain("Start");
  expect(button(lines, "⧉ md")).toBe(TABLE);
  expect(button(lines, "⧉ source")).toBe("flowchart TD\n  A[Start] --> B[Go]");
});

test("headings, lists, quotes and alerts as cellsmith draws them", () => {
  const md = "# Report\n\n## Steps\n\n1. one\n   - two\n   - [x] done\n\n> said so\n\n> [!TIP]\n> try it";
  const shown = text(Reply.reply_lines(md, 60));
  expect(shown.slice(0, 7)).toEqual(["┏━━━━━━━━┓", "┃ Report ┃", "┗━━━━━━━━┛", "", "Steps", "━━━━━", ""]);
  expect(shown).toContain("1. one");
  expect(shown).toContain("  ◦ two");
  expect(shown).toContain("  [✓] done");
  expect(shown).toContain("│ said so  [ ⧉ copy ]");
  expect(shown.join("\n")).toContain("╭────────╮  [ ⧉ copy ]\n│ Tip    │\n│ try it │\n╰────────╯");
});

test("text's colors: the palette's once the background is told, the terminal's before", () => {
  const md   = "Read `x` at /tmp/a.log, **3** times, https://x.co";
  const ink  = (lines: Paint.Line[], x: string) => lines.flat().find((r) => r.x === x)!.s;
  const bare = Reply.reply_lines(md, 80);
  expect(ink(bare, "x").c).toBe("6");
  expect(ink(bare, "/tmp/a.log").c).toBe("6");
  Paint.paint_canvas("#1e1e2e");
  const lit = Reply.reply_lines(md, 80);
  expect(ink(lit, "x").c).toBe("#89dceb");
  expect(ink(lit, "3")).toMatchObject({ b: true, c: "#a6e3a1" });
  expect(ink(lit, "https://x.co")).toMatchObject({ u: true, k: "https://x.co" });
});

test("a pipe's reply has no buttons", () => {
  Reply.reply_buttons(false);
  const lines = Reply.reply_lines(CODE + "\n\n" + TABLE, 60);
  expect(lines.flat().some((r) => r.copy !== undefined || r.x.includes("⧉"))).toBe(false);
  Reply.reply_buttons(true);
});
