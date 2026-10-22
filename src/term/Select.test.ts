// Select test
// ===========
// `bun test Select.test.ts`. Empty space is chosen too, as in Claude
// Code: a drag lights the cells past a short line's text and a blank
// line's whole width, it may start or end in empty space, and what it
// copies drops each line's end spaces (a blank line an empty one). A
// right drag over the chat quotes what it covers in the input, and a
// right click soon after takes the quote out.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import type { Line } from "../ui/Paint.ts";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-select-");
process.env.ILLI_DIR = DIR;

const { term_area, term_mouse, term_selected } = await import("./Select.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal with no screen, one area of three lines 20 wide (its middle
// blank) at the screen's top left; a paint always due
const AREA = { key: "chat", lines: [[Paint.Run("hello world")], [], [Paint.Run("hi")]], first: 0, row: 0, col: 0, w: 20, tall: 3 };
const term = () => ({ areas: [], sel: null, due: true, scr: { point: { row: 0, col: 0 }, clicks: 1 } }) as any;

// a drag from one spot to another; the area's rows as then shown
function drag(t: any, from: [number, number], to: [number, number]): Line[] {
  term_area(t, AREA);
  t.scr.point = { row: from[0], col: from[1] };
  term_mouse(t, "Press");
  t.scr.point = { row: to[0], col: to[1] };
  term_mouse(t, "Drag");
  t.areas = [];
  return term_area(t, AREA);
}

// the columns of a row shown chosen (reversed: no background told)
const lit = (line: Line) => {
  const out: number[] = [];
  for (let col = 0; col < 25; col++) {
    const cell = Paint.line_cut(line, col, col + 1)[1];
    if (cell.length > 0 && cell.every((r) => r.s.v)) {
      out.push(col);
    }
  }
  return out;
};
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, k) => a + k);

test("a choice lights a short line past its text and a blank line whole; it copies the text alone", () => {
  const t    = term();
  const rows = drag(t, [0, 6], [2, 10]);
  expect(rows.map(lit)).toEqual([range(6, 20), range(0, 20), range(0, 11)]);
  expect(term_selected(t)).toBe("world\n\nhi");
});

test("a right drag over the chat quotes what it covers at the input's end, a line each; a right click soon after takes it out, later not", () => {
  const t = { ...term(), v: View.view_new(), notices: [], quoted: null, scr: { point: { row: 0, col: 0 }, clicks: 1, ed: Screen.ed_new() } };
  const quote = (from: [number, number], to: [number, number], area = AREA) => {
    t.areas = [];
    term_area(t, area);
    t.scr.point = { row: from[0], col: from[1] };
    term_mouse(t, "RightPress");
    t.scr.point = { row: to[0], col: to[1] };
    term_mouse(t, "RightDrag");
    term_mouse(t, "RightRelease");
  };
  const click = () => {
    term_mouse(t, "RightPress");
    term_mouse(t, "RightRelease");
  };
  Screen.ed_set(t.scr.ed, "my reply");
  quote([0, 6], [2, 10]);
  expect([t.scr.ed.text, t.scr.ed.pos, t.notices.at(-1).text]).toEqual(["my reply\n> world\n>\n> hi\n", 24, "Quoted 3 lines · right click to take it out"]);
  click();
  expect([t.scr.ed.text, t.scr.ed.pos, t.notices.at(-1).text]).toEqual(["my reply", 8, "Quote taken out"]);
  quote([0, 0], [0, 4]);
  expect(t.scr.ed.text).toBe("my reply\n> hello\n");
  t.quoted.at -= 6000;
  click();
  expect(t.scr.ed.text).toBe("my reply\n> hello\n");
  quote([0, 0], [0, 4], { ...AREA, key: "side" });
  expect(t.scr.ed.text).toBe("my reply\n> hello\n");
});

test("a choice may start and end in empty space", () => {
  const t    = term();
  const rows = drag(t, [1, 5], [2, 15]);
  expect(rows.map(lit)).toEqual([[], range(5, 20), range(0, 16)]);
  expect(term_selected(t)).toBe("\nhi");
  const word = term();
  term_area(word, AREA);
  word.scr = { point: { row: 1, col: 4 }, clicks: 2 };
  expect(() => term_mouse(word, "Press")).not.toThrow();
});
