// Popup test
// ==========
// `bun test Popup.test.ts`. Every list opens in one popup in the
// screen's middle: the same column, top and width with the side panel
// left, right or off, the head row and the bottom line uncovered, all
// else dimmed in one ink, and no click on the side or the tabs under it.
// Its size from its content and the screen alone: POP_MIN wide for a
// two-answer question, what options say widening it to POP_CAP, a name
// never held to it, a line asked for ASK_MIN wide; a share of the rows
// at most, all but two on a short screen.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-popup-");
process.env.ILLI_DIR = DIR;

const { term_chooser } = await import("./Commands.ts");
const { term_paint } = await import("./Frame.ts");
const { popup_size } = await import("./Popup.ts");
const Screen = await import("../ui/Screen.ts");
const { status_new } = await import("./Status.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal on a screen fed by hand, nothing painted yet, its paints
// written nowhere
function term(): any {
  const scr = { tty: true, kitty: false, ed: Screen.ed_new(), rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, grab: null, on: () => {}, left: true };
  return {
    v: View.view_new(), scr, due: false, notices: [], scroll: 0, seen: { total: 0, marks: [], row: 0, first: 0, tall: 1, col: 0, end: 0 }, ver: 0, body: null, find: null,
    pane: null, agents: [], choose: null, profs: [], hits: [], since: 0, spin: undefined, ruled: null, doing: null, subs: new Map(), side: { place: "right", width: "25%" }, status: status_new(),
    todo: false, areas: [], sel: null, sug: null, dropped: "", asking: null, box: null,
  };
}

// f run on a screen cols by rows
function sized<T>(cols: number, rows: number, f: () => T): T {
  const was = [Object.getOwnPropertyDescriptor(process.stdout, "columns"), Object.getOwnPropertyDescriptor(process.stdout, "rows")];
  Object.defineProperty(process.stdout, "columns", { value: cols, configurable: true });
  Object.defineProperty(process.stdout, "rows", { value: rows, configurable: true });
  try {
    return f();
  } finally {
    Object.defineProperty(process.stdout, "columns", was[0] ?? { value: undefined, configurable: true });
    Object.defineProperty(process.stdout, "rows", was[1] ?? { value: undefined, configurable: true });
  }
}

// a row as painted, its pieces laid over one another, cols wide
const text = (row: any[], cols: number) => {
  const cells = Array(cols).fill(" ");
  for (const p of row) {
    [...p.line.map((r: any) => r.x).join("")].slice(0, p.w).forEach((ch, k) => (cells[p.col + k] = ch));
  }
  return cells.join("");
};

// a measure: names, wants, least wide, tall rows at any width
const measure = (names: number, wants: number, least: number, tall = 6) => ({ names, wants, least, tall: () => tall });

test("a list opens in the screen's middle, the same with the side left, right or off; the head and the bottom line uncovered, all else dimmed, no click under it", () => {
  const places = ["left", "right", "off"].map((place) => sized(160, 40, () => {
    const t = term();
    t.side.place = place;
    term_chooser(t, "Agent", ["illi", "reviewer"], ["illi's own", "reviews"], 0, () => {});
    term_paint(t);
    const { row, col, w, h } = t.box;
    const rows = t.ruled.rows;
    const box  = rows.slice(row, row + h).map((r: any[]) => text(r, 160).slice(col, col + w));
    expect(box[0]).toStartWith("╭─ Agent · ↑↓ Enter · Esc ");
    expect(box.at(-1)).toStartWith("╰");
    expect(row).toBeGreaterThan(0);
    expect(row + h).toBeLessThan(39);
    const under = rows.flatMap((r: any[], k: number) => (k >= row && k < row + h ? r.slice(0, -1) : r)).flatMap((p: any) => p.line);
    expect(under.length).toBeGreaterThan(0);
    expect(new Set(under.map((run: any) => JSON.stringify(run.s))).size).toBe(1);
    expect(t.hits.every((hit: any) => hit.row >= row && hit.row < row + h && hit.col >= col && hit.to <= col + w)).toBe(true);
    return [row, col, w, h];
  }));
  expect(places[1]).toEqual(places[0]);
  expect(places[2]).toEqual(places[0]);
  expect(places[0][2]).toBe(40);
});

test("its size from its content and the screen alone: POP_MIN for two answers, what they say up to POP_CAP, a name never held to it, a line asked ASK_MIN; a share of the rows, all but two on a short screen", () => {
  expect(popup_size(measure(20, 30, 40), 160, 40)).toEqual({ row: 17, col: 59, w: 40, h: 6 });
  expect(popup_size(measure(30, 140, 40), 160, 40).w).toBe(96);
  expect(popup_size(measure(120, 140, 40), 160, 40).w).toBe(120);
  expect(popup_size(measure(120, 140, 40), 100, 40).w).toBe(95);
  expect(popup_size(measure(8, 20, 60), 160, 40).w).toBe(60);
  expect(popup_size(measure(20, 30, 40, 100), 160, 24).h).toBe(14);
  expect(popup_size(measure(20, 30, 40, 100), 160, 10)).toEqual({ row: 1, col: 59, w: 40, h: 8 });
});
