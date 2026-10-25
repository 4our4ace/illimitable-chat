// Select test
// ===========
// `bun test Select.test.ts`. Empty space is chosen too, as in Claude
// Code: a drag lights the cells past a short line's text and a blank
// line's whole width, it may start or end in empty space, and what it
// copies drops each line's end spaces (a blank line an empty one). A
// right drag over the chat quotes what it covers in the input (not into
// an agent's read-only page; a reply's buttons left out, none started on
// one), and a right click soon after takes the quote out. A press on the
// input, as a terminal reports it, puts its cursor where it lands, at
// once, the side on either hand or none (typing goes there; nothing
// sent, the text as it was; on the rule under it, the text's end); a
// drag from there still chooses and copies, a double click a word, the
// cursor where the press put it; a scrolled input stays put under it.
// No press moves it that only focused the window, nor a right one, nor
// one under a popup, on a question in the input's place or with a pane
// open; on an agent's page, and with the commands suggested, one does.
// (Under a popup the mouse is the popup's: Popup.test.ts.)

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import type { Line } from "../ui/Paint.ts";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-select-");
process.env.ILLI_DIR = DIR;

const { term_area, term_mouse, term_selected } = await import("./Select.ts");
const { term_chooser, term_question } = await import("./Commands.ts");
const { term_paint } = await import("./Frame.ts");
const { term_grab, term_press, term_type } = await import("./Keys.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const { status_new } = await import("./Status.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal with no screen, one area of three lines 20 wide (its middle
// blank) at the screen's top left; a paint always due
const AREA = { key: "chat", lines: [[Paint.Run("hello world")], [], [Paint.Run("hi")]], first: 0, row: 0, col: 0, w: 20, tall: 3 };
const term = () => ({ areas: [], sel: null, due: true, acted: null, scr: { point: { row: 0, col: 0 }, clicks: 1 } }) as any;

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

test("a right drag over the chat quotes what it covers at the input's end, a line each; a right click soon after takes it out, later not; none into an agent's read-only page", () => {
  const t = { ...term(), v: View.view_new(), notices: [], quoted: null, choose: null, question: null, scr: { point: { row: 0, col: 0 }, clicks: 1, ed: Screen.ed_new() } } as any;
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
  t.v.page = "reviewer";
  quote([0, 0], [0, 4]);
  expect([t.scr.ed.text, t.notices.at(-1).text]).toEqual(["my reply\n> hello\n", "Not quoted: this page's input is read-only"]);
});

test("a reply's buttons are never quoted: a right drag over them leaves them out (a line of buttons alone whole), and none starts on one", () => {
  const t    = { ...term(), v: View.view_new(), notices: [], quoted: null, choose: null, question: null, scr: { point: { row: 0, col: 0 }, clicks: 1, ed: Screen.ed_new() } } as any;
  const btn  = (x: string) => ({ ...Paint.Run(x), copy: () => "the code" });
  const area = { ...AREA, lines: [[Paint.Run("── ts       "), btn("⧉ copy")], [Paint.Run("let x = 1")], [Paint.Run("  "), btn("⧉ copy"), Paint.Run("  "), btn("⧉ art")]] };
  const quote = (from: [number, number], to: [number, number]) => {
    t.areas = [];
    term_area(t, area);
    t.scr.point = { row: from[0], col: from[1] };
    term_mouse(t, "RightPress");
    t.scr.point = { row: to[0], col: to[1] };
    term_mouse(t, "RightDrag");
    term_mouse(t, "RightRelease");
  };
  quote([0, 0], [2, 19]);
  expect(t.scr.ed.text).toBe("> ── ts\n> let x = 1\n");
  Screen.ed_set(t.scr.ed, "");
  t.quoted = null;
  quote([0, 12], [1, 8]);
  expect(t.scr.ed.text).toBe("");
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

// a terminal on a screen fed by hand (its keys, text and mouse to the
// terminal), nothing painted yet, its paints written nowhere
function terminal(): any {
  const scr: any = { tty: true, kitty: false, ed: Screen.ed_new(), rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, left: true };
  const t: any = {
    v: View.view_new(), scr, due: false, notices: [], scroll: 0, seen: { total: 0, marks: [], row: 0, first: 0, tall: 1, col: 0, end: 0 }, ver: 0, body: null, find: null,
    pane: null, agents: [], choose: null, question: null, profs: [], hits: [], since: 0, spin: undefined, ruled: null, doing: null, subs: new Map(), side: { place: "right", width: "25%" }, status: status_new(),
    todo: false, areas: [], sel: null, sug: null, dropped: "", asking: null, box: null, aim: { row: -1, in: false, press: null, first: null }, pin: null, lit: null, pointed: false, wait: null, acted: null, quit: 0, pending: 0, imgs: new Map(), quoted: null, lead: false,
  };
  [scr.grab, scr.on, scr.type] = [(k: string) => term_grab(t, k), (k: string) => term_press(t, k), (x: string) => term_type(t, x)];
  return t;
}

// a paint now, none asked for after (a paint always due)
const paint = (t: any) => {
  term_paint(t);
  t.due = true;
};

// the mouse at a screen row and column, as a terminal reports it: the
// left button pressed (a new click), pressed again (a double click), let
// go, dragged; the right button pressed and let go
const sgr    = (b: number, row: number, col: number, end = "M") => "\x1b[<" + b + ";" + (col + 1) + ";" + (row + 1) + end;
const press  = (t: any, row: number, col: number) => ((t.scr.pressed = 0), Screen.screen_feed(t.scr, sgr(0, row, col)));
const again  = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(0, row, col));
const let_go = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(0, row, col, "m"));
const click  = (t: any, row: number, col: number) => (press(t, row, col), let_go(t, row, col));
const pull   = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(32, row, col));
const right  = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(2, row, col) + sgr(2, row, col, "m"));

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

// a row as last painted, its pieces laid over one another; the row whose
// text starts with s after the margin
const text   = (row: any[]) => {
  const cells = Array(160).fill(" ");
  for (const p of row) {
    [...p.line.map((r: any) => r.x).join("")].slice(0, p.w).forEach((ch, k) => (cells[p.col + k] = ch));
  }
  return cells.join("").trimEnd();
};
const row_of = (t: any, s: string) => t.ruled.rows.findIndex((row: any[]) => text(row).slice(2).startsWith(s));

// what f writes to the terminal (a copy's OSC 52)
function written(f: () => void): string[] {
  const out: string[] = [];
  const write = process.stdout.write;
  process.stdout.write = ((s: string) => out.push(s)) as any;
  try {
    f();
  } finally {
    process.stdout.write = write;
  }
  return out;
}

test("a press on the input puts its cursor where it lands, at once, as a key moves it: typing goes there, nothing sent, the text as it was; past a row's text at its end, on the margin or the indent at its start, on the rule under it at the text's end; the side on either hand or none", () => {
  for (const place of ["right", "left", "off"]) {
    sized(100, 30, () => {
      const t = terminal();
      t.side.place = place;
      Screen.ed_set(t.scr.ed, "first line\nsecond line here");
      paint(t);
      expect(t.areas.some((a: any) => a.key === "side" && a.tall > 0)).toBe(place !== "off");
      const r = row_of(t, "> first line");
      expect(text(t.ruled.rows[r + 1])).toBe("    second line here");
      press(t, r + 1, 11);
      expect([t.scr.ed.pos, t.scr.ed.moved, t.scr.ed.text, t.v.out]).toEqual([18, true, "first line\nsecond line here", []]);
      let_go(t, r + 1, 11);
      paint(t);
      expect([t.scr.ed.pos, t.ruled.at]).toEqual([18, { row: r + 1, col: 11 }]);
      Screen.screen_feed(t.scr, "X");
      expect(t.scr.ed.text).toBe("first line\nsecond Xline here");
      paint(t);
      click(t, r, 40);
      expect(t.scr.ed.pos).toBe(10);
      click(t, r + 1, 0);
      expect(t.scr.ed.pos).toBe(11);
      expect(text(t.ruled.rows[r + 2]).trim()).toMatch(/^─+$/);
      click(t, r + 2, 30);
      expect([t.scr.ed.pos, t.scr.ed.text, t.v.out]).toEqual([t.scr.ed.text.length, "first line\nsecond Xline here", []]);
    });
  }
});

test("a drag from the input still chooses its text and copies it as it's let go, the cursor where the press put it; a double click still a word, the cursor where its presses put it", () => {
  sized(100, 30, () => {
    const t = terminal();
    Screen.ed_set(t.scr.ed, "pick these words");
    paint(t);
    const r = row_of(t, "> pick these words");
    press(t, r, 9);
    expect(t.scr.ed.pos).toBe(5);
    paint(t);
    pull(t, r, 13);
    expect([t.sel.key, t.sel.moved, term_selected(t)]).toEqual(["foot", true, "these"]);
    expect(written(() => let_go(t, r, 13))).toEqual(["\x1b]52;c;" + Buffer.from("these").toString("base64") + "\x07"]);
    expect([t.scr.ed.pos, t.scr.ed.text]).toEqual([5, "pick these words"]);
    paint(t);
    click(t, r, 17);
    paint(t);
    again(t, r, 17);
    expect([t.sel.unit, term_selected(t), t.scr.ed.pos]).toEqual([2, "words", 13]);
    expect(written(() => let_go(t, r, 17))).toEqual(["\x1b]52;c;" + Buffer.from("words").toString("base64") + "\x07"]);
    expect([t.scr.ed.pos, t.scr.ed.text]).toEqual([13, "pick these words"]);
  });
});

test("an input taller than it shows stays put under a press on a row it shows: a double click there chooses the word it showed, the cursor on it; a press on the rule under it, rows hidden there, goes to the text's end", () => {
  sized(100, 30, () => {
    const t    = terminal();
    const body = Array.from({ length: 15 }, (_, k) => "row " + k).join("\n");
    Screen.ed_set(t.scr.ed, body);
    paint(t);
    const r    = row_of(t, "  row 5");
    const rows = t.ruled.rows.slice(r, r + 10).map(text);
    expect([rows[0], rows[9]]).toEqual(["    row 5", "    row 14"]);
    click(t, r, 5);
    paint(t);
    expect([t.scr.ed.pos, t.ruled.rows.slice(r, r + 10).map(text)]).toEqual([body.indexOf("row 5") + 1, rows]);
    again(t, r, 5);
    expect([term_selected(t), t.scr.ed.pos]).toEqual(["row", body.indexOf("row 5") + 1]);
    written(() => let_go(t, r, 5));
    t.scr.ed.pos = 0;
    paint(t);
    const first = row_of(t, "> row 0");
    expect(text(t.ruled.rows[first + 9])).toBe("    row 9");
    expect(text(t.ruled.rows[first + 10]).trim()).toMatch(/^─+$/);
    click(t, first + 10, 30);
    paint(t);
    expect([t.scr.ed.pos, text(t.ruled.rows[first + 9])]).toEqual([body.length, "    row 14"]);
  });
});

test("no press moves the cursor that only focused the window, nor a right one, nor one under a popup, on a question in the input's place or with a pane open; on an agent's page, and with the commands suggested, one does", () => {
  sized(100, 30, () => {
    const t = terminal();
    Screen.ed_set(t.scr.ed, "some text");
    paint(t);
    const r = row_of(t, "> some text");
    t.scr.gained = Date.now();
    click(t, r, 6);
    t.scr.gained = undefined;
    right(t, r, 6);
    expect(t.scr.ed.pos).toBe(9);
    term_chooser(t, "Pick", ["one", "two"], ["", ""], 0, () => {});
    paint(t);
    click(t, r, 6);
    expect([t.scr.ed.pos, t.choose]).toEqual([9, null]);
    term_question(t, "Sure?", ["Yes", "No"], ["", ""], () => {});
    paint(t);
    expect(t.areas.find((a: any) => a.key === "foot").input).toBeUndefined();
    press(t, r, 6);
    let_go(t, 0, 60);
    expect([t.scr.ed.pos, t.question?.title]).toEqual([9, "Sure?"]);
    t.question = null;
    t.pane = { title: "Help", make: () => [[Paint.Run("some help")]], w: 0, lines: [], scroll: 0 };
    paint(t);
    expect(t.areas.find((a: any) => a.key === "foot").input).toBeUndefined();
    click(t, r, 6);
    expect(t.scr.ed.pos).toBe(9);
    t.pane = null;
    t.v.page = { name: "reviewer", log: [], live: [] };
    paint(t);
    click(t, row_of(t, "> some text"), 6);
    expect(t.scr.ed.pos).toBe(2);
    t.v.page = null;
    Screen.ed_set(t.scr.ed, "/hel");
    paint(t);
    expect(t.box?.of).toBe(t.sug);
    click(t, row_of(t, "> /hel"), 5);
    expect([t.scr.ed.pos, t.scr.ed.text, t.pane, t.v.out]).toEqual([1, "/hel", null, []]);
  });
});
