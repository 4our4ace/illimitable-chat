// Reply test
// ==========
// `bun test Reply.test.ts`. A reply as illi draws it: code under its
// header and copy button, unfilled; a table boxed and a diagram side by
// side under their buttons; headings, lists, quotes and alerts; text's
// colors from the palette, the terminal's own while its background is
// untold; each button copying its block, the last the reply; no buttons
// in a pipe. A reply streaming, laid out as it grows, is the reply laid
// out whole at each length, its finished blocks' lines kept. A table too
// wide shares the room by column_widths; a button that won't fit beside
// moves over its block, or is left out.

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
  expect(text(lines)).toEqual(["Run it:", "", "── bash · [ ⧉ copy ]", "  grep -n 'x' ~/a.log # look", "", " ".repeat(44) + "[ ⧉ copy reply ]"]);
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

test("headings, lists, quotes and alerts as a reply draws them", () => {
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
  expect(ink(lit, "x").c).toBe("#94e2d5");
  expect(ink(lit, "3")).toMatchObject({ b: true, c: "#fab387" });
  expect(ink(lit, "https://x.co")).toMatchObject({ u: true, k: "https://x.co" });
});

test("a pipe's reply has no buttons", () => {
  Reply.reply_buttons(false);
  const lines = Reply.reply_lines(CODE + "\n\n" + TABLE, 60);
  expect(lines.flat().some((r) => r.copy !== undefined || r.x.includes("⧉"))).toBe(false);
  Reply.reply_buttons(true);
});

// every kind of block, figures side by side, a fence holding blank lines
// and one never closed, CRLF too: grown a piece at a time, each length
// lays out as it does whole (its text, inks, what each button copies);
// a finished block's lines are those laid out before
test("a reply grown a piece at a time is the reply laid out whole", () => {
  const md   = "# Plan\n\nRead **this** at /tmp/a.log, 3 times.\n\n" + TABLE + "\n\n" + FLOW + "\n\n- one\n- two\n  more\n\n> said\n\n```ts\nconst x = 1;\n\nconst y = 2;\n```\n\n---\r\n\r\nlast words\n\n```sh\nls -l";
  const seen = (lines: Paint.Line[]) => lines.map((l) => l.map((r) => [r.x, r.s, r.copy?.()]));
  for (const step of [1, 7, 40]) {
    let was: Reply.Grown | null = null;
    let kept = 0;
    for (let at = step; at < md.length + step; at += step) {
      const text = md.slice(0, at);
      const [lines, grown] = Reply.reply_grow(text, 70, was);
      expect(seen(lines)).toEqual(seen(Reply.reply_lines(text, 70)));
      expect((was?.lines ?? []).every((l, k) => lines[k] === l)).toBe(true);
      kept = Math.max(kept, grown.n);
      was = grown;
    }
    expect(kept).toBeGreaterThan(5);
  }
});

// columns at their widths if they fit; else each at least its longest
// word (while those fit, else one), filled to one level, the room left
// one more a column from the left
test("columns share the room: their words kept, filled level, the rest to the left", () => {
  expect(Reply.column_widths([10, 40, 5], 100, 3, [4, 12, 5])).toEqual([10, 40, 5]);
  expect(Reply.column_widths([10, 40, 5], 30, 3, [4, 12, 5])).toEqual([7, 12, 5]);
  expect(Reply.column_widths([10, 10, 10], 21, 1, [1, 1, 1])).toEqual([7, 6, 6]);
  expect(Reply.column_widths([10, 40, 5], 15, 3, [4, 12, 5])).toEqual([3, 3, 3]);
  expect(Reply.column_widths([10, 40, 5], 4, 3, [4, 12, 5])).toEqual([1, 1, 1]);
  for (const room of [9, 20, 33, 47, 60]) {
    const got = Reply.column_widths([12, 30, 8, 3], room, 3, [5, 9, 8, 3]);
    expect(got.reduce((a, b) => a + b, 0)).toBe(Math.min(53, Math.max(4, room - 9)));
    expect(got.every((x, k) => x >= 1 && x <= [12, 30, 8, 3][k])).toBe(true);
  }
});

// a table wider than the reply: its cells wrap in the widths it gets
test("a table too wide wraps its cells", () => {
  const shown = text(Reply.reply_lines("| Name | Notes |\n| --- | --- |\n| a | the quick brown fox jumps over the lazy dog |", 30));
  expect(shown.slice(1)).toEqual([
    "┌──────┬─────────────────────┐",
    "│ Name │ Notes               │",
    "╞══════╪═════════════════════╡",
    "│ a    │ the quick brown fox │",
    "│      │ jumps over the lazy │",
    "│      │ dog                 │",
    "└──────┴─────────────────────┘",
  ]);
});

// a table's art: its rows ruled between each, fenced as code
test("a table's art button copies it ruled and fenced", () => {
  const lines = Reply.reply_lines("| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |", 40);
  expect(button(lines, "⧉ art")).toBe("```\n┌───┬───┐\n│ a │ b │\n├───┼───┤\n│ 1 │ 2 │\n├───┼───┤\n│ 3 │ 4 │\n└───┴───┘\n```");
});

// a code block's button beside its header while it fits, else over its
// lines at the right; narrower than the button, none (the reply's too)
test("a button that won't fit beside moves over its block, or is left out", () => {
  expect(text(Reply.reply_lines("```ts\nconst a = 1;\n```", 14))).toEqual(["── ts", "    [ ⧉ copy ]", "  const a = 1;"]);
  expect(text(Reply.reply_lines("```ts\nconst a = 1;\n```", 8))).toEqual(["── ts", "  const", "  a = 1;"]);
});

// figures side by side only while both fit, else one over the other
test("figures that won't fit side by side stack", () => {
  const shown = text(Reply.reply_lines(TABLE + "\n\n" + FLOW, 30));
  expect(shown[0]).toMatch(/^ *\[ ⧉ md \] \[ ⧉ art \]$/);
  expect(shown.filter((l) => l.includes("⧉ source"))).toHaveLength(1);
  expect(shown.every((l) => Paint.text_width(l) <= 30)).toBe(true);
});
