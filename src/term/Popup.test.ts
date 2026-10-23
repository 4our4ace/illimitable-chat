// Popup test
// ==========
// `bun test Popup.test.ts`. Every list opens in one popup in the
// screen's middle: the same column, top and width with the side panel
// left, right or off, the head row and the bottom line uncovered, all
// else dimmed in one ink, and no click on the side or the tabs under it.
// Its size from its content and the screen alone: POP_MIN wide for a
// two-answer question, what options say widening it to POP_CAP, a name
// never held to it, a line asked for ASK_MIN wide; a share of the rows
// at most, all but two on a short screen or for a question. A name is
// never cut (what an option is is, with an ellipsis); on a screen too
// narrow for it, it wraps under itself. A search keeps the box's place
// and size; a value stepped wider grows it, never shrinks it, till a new
// size. A question's answers always show, its long lead cut. The wheel
// scrolls a long list (a third of what shows, three at most), stopping at
// its ends, the option brought under the pointer lit, or off the list
// the lit one held in view; a list shown whole never moves, nor the chat.
// A lead cut scrolls by the wheel and the pages, the answers staying.
// The mouse is the popup's alone: the pointer moving to another row
// lights it (along its row, at rest, or as the popup first shows under
// it: not); a press and a release on one option do what Enter does
// there, on two rows nothing; a click outside closes a list, never a
// question (the line asked why goes back to it), and goes no further; no
// text is chosen, no button lights or copies, the right button does
// nothing; a double click picks once; a box no longer open (a new size,
// a question answered elsewhere) does nothing; a question just shown
// holds a click as it holds Enter; the click that only focuses the
// terminal's window picks nothing and closes nothing. The wheel over a
// group's head scrolls on. The commands suggested as a /word is typed: a
// click on one does what Enter does there, a press on them chooses no
// text; a drag from elsewhere goes on over them. illi's own questions
// show in the popup, the room's full width, who asks its title, the
// input still drawn under it, the cursor in the words; going from tab to
// tab never moves it; over a pane too, typing and a paste going to the
// words, Esc skipping them, the pane kept. A click on an option picks it
// (one to pick: and goes on; of any: toggled), on a tab goes there, on
// the words lights them, outside does nothing. Taller than the screen,
// its tabs and keys hold and its lines scroll, by the keys (the lit row
// kept in view) and by the wheel (the lit row held while it shows, else
// the nearest; the one under the pointer lit).

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-popup-");
process.env.ILLI_DIR = DIR;

const { term_chooser } = await import("./Commands.ts");
const { term_paint } = await import("./Frame.ts");
const { term_grab, term_press, term_type } = await import("./Keys.ts");
const { popup_size } = await import("./Popup.ts");
const { term_under } = await import("./Select.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const { status_new } = await import("./Status.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal on a screen fed by hand (its keys, text and mouse to the
// terminal), nothing painted yet, its paints written nowhere
function term(): any {
  const scr: any = { tty: true, kitty: false, ed: Screen.ed_new(), rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, left: true };
  const t: any = {
    v: View.view_new(), scr, due: false, notices: [], scroll: 0, seen: { total: 0, marks: [], row: 0, first: 0, tall: 1, col: 0, end: 0 }, ver: 0, body: null, find: null,
    pane: null, agents: [], choose: null, profs: [], hits: [], since: 0, spin: undefined, ruled: null, doing: null, subs: new Map(), side: { place: "right", width: "25%" }, status: status_new(),
    todo: false, areas: [], sel: null, sug: null, dropped: "", asking: null, box: null, aim: { row: -1, in: false, press: null, first: null }, quit: 0, pending: 0, imgs: new Map(), quoted: null, lead: false,
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
// left button pressed (a new click: never a double one), let go, the
// pointer moved, dragged; the right button pressed, dragged, let go
const sgr   = (b: number, row: number, col: number, end = "M") => "\x1b[<" + b + ";" + (col + 1) + ";" + (row + 1) + end;
const press = (t: any, row: number, col: number) => ((t.scr.pressed = 0), Screen.screen_feed(t.scr, sgr(0, row, col)));
const again = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(0, row, col));
const let_go = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(0, row, col, "m"));
const click = (t: any, row: number, col: number) => (press(t, row, col), let_go(t, row, col));
const move  = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(35, row, col));
const drag  = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(32, row, col));
const right = (t: any, row: number, col: number, to: number) => Screen.screen_feed(t.scr, sgr(2, row, col) + sgr(34, row, to) + sgr(2, row, to, "m"));

// the screen row of the popup's option named name, and a column on it
const row_of = (t: any, name: string) => t.box.row + t.box.rows.findIndex((aim: any) => aim?.k === t.choose.names.indexOf(name));
const col = (t: any) => t.box.col + 6;
const lit = (t: any) => t.choose.names[t.choose.shown[t.choose.at].k];

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

// a measure: names, wants, least wide, tall rows at any width; a
// question's, if it stays
const measure = (names: number, wants: number, least: number, tall = 6, stays = false) => ({ names, wants, least, tall: () => tall, stays });

// the popup as last painted: its rows' text, inside its frame, cols wide
// on the screen
const inside = (t: any, cols: number) => t.ruled.rows.slice(t.box.row + 1, t.box.row + t.box.h - 1).map((r: any[]) => text(r, cols).slice(t.box.col + 2, t.box.col + t.box.w - 2));

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
  expect(popup_size(measure(20, 30, 40, 100, true), 160, 24).h).toBe(22);
  expect(popup_size(measure(20, 30, 40), 160, 40, 70).w).toBe(70);
});

test("a name is never cut: the longest shows whole past POP_CAP; what options say stops at it, cut with an ellipsis", () => {
  const long = "Yes, and don't ask again for git -C /home/someone/work/a/project/with/a/long/path push origin main in this project";
  sized(160, 40, () => {
    const t = term();
    term_chooser(t, "Allow Bash?", ["Yes", long, "No", "No, and say why"], ["", "", "", ""], -1, () => {}, { stays: true });
    term_paint(t);
    expect(t.box.w).toBe(4 + 2 + long.length + 2);
    expect(inside(t, 160)).toContain("  " + long + "  ");
    const u = term();
    term_chooser(u, "Projects", ["here", "app"], ["last 2026-10-10 · " + "x".repeat(150), "short"], -1, () => {});
    term_paint(u);
    expect(u.box.w).toBe(96);
    expect(inside(u, 160)[0]).toMatch(/^› here  last 2026-10-10 · x+…$/);
  });
});

test("on a screen narrower than a name, the name wraps at its words, whole, under itself; both its rows stand for it", () => {
  const long = "a profile with a name far longer than any screen this narrow could show on one line";
  sized(60, 30, () => {
    const t = term();
    term_chooser(t, "Profile", ["default", long], ["", "the one with the long name"], 0, () => {});
    term_paint(t);
    const rows = inside(t, 60);
    const at   = rows.findIndex((r: string) => r.startsWith("  ◯ a profile"));
    expect(at).toBeGreaterThan(0);
    expect(rows[at + 1]).toMatch(/^ {4}\S/);
    expect((rows[at].trim().slice(2) + " " + rows[at + 1].trim()).replace(/ +/g, " ")).toStartWith(long.slice(0, 40));
    expect(rows.join("")).not.toContain("…");
    expect([t.box.rows[1 + at], t.box.rows[2 + at]]).toEqual([{ $: "option", k: 1 }, { $: "option", k: 1 }]);
  });
});

test("a search keeps the popup's place and size; a value stepped wider grows it, a narrower one doesn't shrink it, till a new size measures it afresh", async () => {
  const { term_resize } = await import("./Frame.ts");
  const { term_type } = await import("./Keys.ts");
  sized(160, 40, () => {
    const t = term();
    const about = ["on", "a short one"];
    term_chooser(t, "Settings", ["tps", "side"], about, -1, () => {}, { find: true });
    term_paint(t);
    const first = { ...t.box };
    term_type(t, "side");
    term_paint(t);
    expect([t.box.row, t.box.col, t.box.w, t.box.h]).toEqual([first.row, first.col, first.w, first.h]);
    about[1] = "a much longer value than before, wider than the box was at the start of it";
    term_paint(t);
    const wider = t.box.w;
    about[1] = "short";
    term_paint(t);
    expect([first.w, wider > first.w, t.box.w]).toEqual([40, true, wider]);
    term_resize(t);
    term_paint(t);
    expect(t.box.w).toBe(40);
  });
});

test("a question takes all but two rows at most: its answers show whole, a long lead cut, its last line shown ending in an ellipsis", () => {
  sized(100, 24, () => {
    const t = term();
    const lead = Array.from({ length: 40 }, (_, k) => [Paint.Run("line " + k + " of a long command")]);
    term_chooser(t, "Allow Bash?", ["Yes", "No", "No, and say why"], ["", "", ""], -1, () => {}, { lead, stays: true });
    term_paint(t);
    const rows = inside(t, 100);
    expect(t.box.h).toBe(22);
    expect(rows.slice(-3).map((r: string) => r.trim())).toEqual(["› Yes", "No", "No, and say why"]);
    expect(rows[0].trim()).toBe("line 0 of a long command");
    expect(rows.at(-4).trim()).toBe("line 16 of a long command…");
  });
});

test("the wheel scrolls a long list three entries a turn, stopping at its ends, the option brought under the pointer lit; off the list, the lit one held in view; a list shown whole never moves, nor the chat", () => {
  sized(100, 24, () => {
    const t = term();
    term_chooser(t, "List", Array.from({ length: 40 }, (_, k) => "o" + k), Array(40).fill(""), -1, () => {});
    term_paint(t);
    expect([t.box.lines, t.box.tall]).toEqual([12, 12]);
    t.scr.point = { row: t.box.row + t.box.list + 2, col: t.box.col + 5 };
    const turn = (key: string) => {
      term_grab(t, key);
      term_paint(t);
      return [t.choose.top, t.choose.at];
    };
    expect([turn("WheelDown"), turn("WheelUp"), turn("WheelUp")]).toEqual([[3, 5], [0, 2], [0, 2]]);
    t.scr.point = { row: 0, col: 0 };
    for (let k = 0; k < 10; k++) {
      turn("WheelDown");
    }
    expect([t.choose.top, t.choose.at, t.scroll]).toEqual([28, 28, 0]);
    expect(inside(t, 100)[0].trim()).toBe("› o28");
    const u = term();
    term_chooser(u, "List", ["a", "b", "c"], ["", "", ""], -1, () => {});
    term_paint(u);
    u.scr.point = { row: u.box.row + u.box.list + 2, col: u.box.col + 5 };
    term_grab(u, "WheelDown");
    expect([u.choose.top, u.choose.at]).toEqual([0, 0]);
  });
});

test("a question's lead cut scrolls by the wheel and the pages, its answers staying", () => {
  sized(100, 24, () => {
    const t = term();
    const lead = Array.from({ length: 40 }, (_, k) => [Paint.Run("line " + k + " of a long command")]);
    term_chooser(t, "Allow Bash?", ["Yes", "No", "No, and say why"], ["", "", ""], -1, () => {}, { lead, stays: true });
    term_paint(t);
    term_grab(t, "WheelDown");
    term_paint(t);
    expect(inside(t, 100)[0].trim()).toBe("line 3 of a long command");
    term_grab(t, "PgDn");
    term_grab(t, "PgDn");
    term_paint(t);
    const rows = inside(t, 100);
    expect([rows[0].trim(), rows.at(-4).trim(), t.choose.at]).toEqual(["line 23 of a long command", "line 39 of a long command", 0]);
    expect(rows.slice(-3).map((r: string) => r.trim())).toEqual(["› Yes", "No", "No, and say why"]);
  });
});

test("the pointer moving to another row lights its option, one lit row with the keys; along its row, at rest, or as the popup first shows under it, the keys' lit row holds; a search under a resting pointer keeps its best match lit", () => {
  sized(100, 30, () => {
    const t = term();
    t.scr.point = { row: 14, col: 50 };
    term_chooser(t, "Agent", ["illi", "reviewer", "writer", "tester"], ["", "", "", ""], -1, () => {}, { find: true });
    paint(t);
    move(t, 14, 52);
    expect(lit(t)).toBe("illi");
    move(t, row_of(t, "writer"), col(t));
    expect(lit(t)).toBe("writer");
    term_grab(t, "Down");
    move(t, row_of(t, "writer"), col(t) + 3);
    expect(lit(t)).toBe("tester");
    move(t, row_of(t, "reviewer"), col(t));
    term_type(t, "te");
    paint(t);
    expect(lit(t)).toBe("tester");
    move(t, 1, 1);
    expect(lit(t)).toBe("tester");
  });
});

test("a press and a release on one option do what Enter does there: a setting stepped, a palette row run, a question answered; pressed on one row and let go on another, nothing", async () => {
  const config = await import("../config/Config.ts");
  const { term_settings } = await import("./Settings.ts");
  const { term_palette } = await import("./Palette.ts");
  const { term_asks } = await import("./Asks.ts");
  sized(120, 40, () => {
    const t = term();
    term_settings(t, "tps");
    paint(t);
    const tps = row_of(t, "tps");
    click(t, tps, col(t));
    expect([config.TPS, t.choose.title]).toEqual([false, "Settings"]);
    press(t, tps, col(t));
    let_go(t, row_of(t, "side"), col(t));
    expect(config.TPS).toBe(false);
    click(t, tps, col(t));
    expect(config.TPS).toBe(true);
    t.choose = null;
    term_palette(t);
    term_type(t, "Ctrl+O");
    paint(t);
    click(t, row_of(t, "Ctrl+O"), col(t));
    expect([t.choose, t.v.verbose]).toEqual([null, true]);
    t.v.asks = [{ id: "q1", who: "illi", tool: "Bash", what: "ls", why: "", keep: "" }];
    term_asks(t);
    paint(t);
    t.asking.shown -= 600;
    click(t, row_of(t, "No"), col(t));
    expect(t.v.out.map((o: any) => o.msg).filter((m: any) => m.$ === "answer").map((m: any) => [m.ask, m.yes])).toEqual([["q1", false]]);
  });
});

test("a click outside closes a list and goes no further (no side, no tab, no block); outside a question, nothing; outside the line asked why, back to its question", async () => {
  const { term_asks } = await import("./Asks.ts");
  sized(160, 40, () => {
    const t = term();
    term_chooser(t, "Agent", ["illi", "reviewer"], ["", ""], 0, () => {});
    paint(t);
    expect(t.hits).toEqual([]);
    click(t, 39, 5);
    expect([t.choose, t.v.out]).toEqual([null, []]);
    t.v.asks = [{ id: "q1", who: "illi", tool: "Bash", what: "ls", why: "", keep: "" }];
    term_asks(t);
    paint(t);
    t.asking.shown -= 600;
    click(t, 2, 2);
    expect([t.choose.title, t.v.out]).toEqual(["Allow Bash?", []]);
    click(t, row_of(t, "No, and say why"), col(t));
    paint(t);
    expect(t.choose.title).toBe("Why not Bash?");
    click(t, 2, 2);
    paint(t);
    expect([t.choose.title, t.v.out]).toEqual(["Allow Bash?", []]);
  });
});

test("under a popup no text is chosen and nothing copied, no button lights or copies, the right button quotes nothing; a drag begun before it opened is let go", () => {
  sized(120, 30, () => {
    const t = term();
    Screen.ed_set(t.scr.ed, "my reply");
    term_chooser(t, "Agent", ["illi", "reviewer"], ["", ""], 0, () => {});
    paint(t);
    const button = { key: "chat", lines: [[{ x: "copy", s: Paint.INK, copy: () => "secret" }]], first: 0, row: 2, col: 2, w: 20, tall: 1 };
    t.areas.push(button);
    t.scr.point = { row: 2, col: 3 };
    expect(term_under(t, t.scr.point)).toBeUndefined();
    press(t, 2, 3);
    drag(t, 2, 10);
    expect(t.sel).toBeNull();
    right(t, 2, 3, 10);
    expect([t.scr.ed.text, t.notices]).toEqual(["my reply", []]);
    const u = term();
    paint(u);
    u.areas.push(button);
    press(u, 2, 3);
    drag(u, 2, 6);
    expect(u.sel?.held).toBe(true);
    term_chooser(u, "Agent", ["illi", "reviewer"], ["", ""], 0, () => {});
    drag(u, 2, 8);
    let_go(u, 2, 8);
    expect([u.sel, u.notices, u.choose.title]).toEqual([null, [], "Agent"]);
  });
});

test("a double click on an option picks once, its second press going nowhere once the popup is gone; one on the mode opens /mode and leaves it open", () => {
  sized(120, 30, () => {
    const t = term();
    const picked: number[] = [];
    term_chooser(t, "Agent", ["illi", "reviewer"], ["", ""], 0, (k) => picked.push(k));
    paint(t);
    const [r, c] = [row_of(t, "reviewer"), col(t)];
    click(t, r, c);
    paint(t);
    again(t, r, c);
    let_go(t, r, c);
    expect([picked, t.scr.clicks, t.sel, t.notices]).toEqual([[1], 2, null, []]);
    const u = term();
    paint(u);
    const mode = u.hits.find((h: any) => h.row === 29 && h.to === 2 + 115);
    click(u, 29, mode.col);
    paint(u);
    expect(u.choose.title).toBe("Mode, this session");
    again(u, 29, mode.col);
    let_go(u, 29, mode.col);
    expect([u.choose?.title, u.sel, u.notices]).toEqual(["Mode, this session", null, []]);
  });
});

test("a report for a box no longer open does nothing: after a new size, before it is painted again; a question answered elsewhere; a question just shown holds a click", async () => {
  const { term_resize } = await import("./Frame.ts");
  const { term_asks } = await import("./Asks.ts");
  sized(120, 30, () => {
    const t = term();
    const picked: number[] = [];
    term_chooser(t, "Agent", ["illi", "reviewer"], ["", ""], 0, (k) => picked.push(k));
    paint(t);
    const [r, c] = [row_of(t, "reviewer"), col(t)];
    term_resize(t);
    clearTimeout(t.settle);
    click(t, r, c);
    expect([picked, t.choose.title]).toEqual([[], "Agent"]);
    t.choose = null;
    t.v.asks = [{ id: "q1", who: "illi", tool: "Bash", what: "ls", why: "", keep: "" }];
    term_asks(t);
    paint(t);
    const yes = row_of(t, "Yes");
    click(t, yes, col(t));
    expect(t.v.out).toEqual([]);
    t.asking.shown -= 600;
    t.v.asks = [];
    click(t, yes, col(t));
    expect([t.v.out, t.choose]).toEqual([[], null]);
  });
});

test("the click that only focuses the terminal picks nothing and closes nothing: one while the focus is lost, or just after it comes back", () => {
  sized(120, 30, () => {
    const t = term();
    const picked: number[] = [];
    term_chooser(t, "Agent", ["illi", "reviewer"], ["", ""], 0, (k) => picked.push(k));
    paint(t);
    const [r, c] = [row_of(t, "reviewer"), col(t)];
    Screen.screen_feed(t.scr, "\x1b[O");
    click(t, r, c);
    Screen.screen_feed(t.scr, "\x1b[I");
    click(t, 2, 2);
    expect([picked, t.choose?.title]).toEqual([[], "Agent"]);
    t.scr.gained -= 200;
    click(t, r, c);
    expect(picked).toEqual([1]);
  });
});

test("the commands suggested: a click on one does what Enter does there (found by what it does: filled in; by name: run), a press on them chooses no text; a drag begun in the chat goes on over them", () => {
  sized(120, 30, () => {
    const t = term();
    Screen.ed_set(t.scr.ed, "/new");
    paint(t);
    expect(t.box.of).toBe(t.sug);
    const first = t.box.row + t.box.rows.findIndex((aim: any) => aim?.$ === "command" && aim.k === 0);
    click(t, first, 10);
    expect([t.scr.ed.text, t.v.out]).toEqual(["/clear ", []]);
    Screen.ed_set(t.scr.ed, "/hel");
    paint(t);
    const help = t.box.row + 1;
    press(t, help, 10);
    drag(t, help, 30);
    expect(t.sel).toBeNull();
    let_go(t, help, 30);
    expect(t.pane?.title).toBe("Help");
    const u = term();
    paint(u);
    u.areas.push({ key: "chat", lines: [[Paint.Run("some words in the chat")], [], [], [], []], first: 0, row: 20, col: 2, w: 60, tall: 5 });
    press(u, 20, 2);
    Screen.ed_set(u.scr.ed, "/hel");
    paint(u);
    u.areas.push({ key: "chat", lines: [[Paint.Run("some words in the chat")], [], [], [], []], first: 0, row: 20, col: 2, w: 60, tall: 5 });
    drag(u, u.box.row + 1, 12);
    let_go(u, u.box.row + 1, 12);
    expect([u.pane, u.sel?.key]).toEqual([null, "chat"]);
  });
});

// illi's own questions now, each a tab: which database (one of three),
// which caches (any of two), or others given
const DB    = { text: "Which database?", head: "Database", options: [{ label: "Postgres", about: "you know it" }, { label: "SQLite", about: "" }, { label: "MySQL", about: "" }], multi: false };
const CACHE = { text: "Which caches?", head: "Cache", options: [{ label: "Redis", about: "" }, { label: "Memcached", about: "" }], multi: true };
const own   = (t: any, queries: any[]) => (t.v.asks = [{ id: "a1", who: "illi", tool: "ask", what: queries[0].text, queries }]);

// the screen row of illi's form's row k (an option; past them, the words)
const form_row = (t: any, k: number) => t.box.row + t.box.rows.findIndex((aim: any) => aim?.$ === "row" && aim.k === k);

test("illi's questions show in the popup, the room's full width, who asks its title: tabs, question, options, words, keys; the input as typed drawn under it, the cursor in the words; tab to tab it never moves", () => {
  sized(110, 34, () => {
    const t = term();
    Screen.ed_set(t.scr.ed, "my draft");
    own(t, [DB, CACHE]);
    paint(t);
    expect(t.box.of).toBe(t.asking.form);
    const { row, col, w, h } = t.box;
    expect([col, w, h]).toEqual([2, 105, 9]);
    expect(text(t.ruled.rows[row], 110).slice(col)).toStartWith("╭─ illi asks ─");
    expect(inside(t, 110).map((l: string) => l.trimEnd())).toEqual([" Database   Cache   Review", "Which database?  pick one", "› ○ Postgres  you know it", "  ○ SQLite", "  ○ MySQL", "  > Something else: type your own", "↑↓ move · Space pick · type your own · Enter next · Tab switch · Esc skip"]);
    expect(t.ruled.rows.slice(t.ruled.row + 1).map((r: any[]) => text(r, 110)).join("\n")).toContain("my draft");
    expect([t.ruled.at, t.scr.blink]).toEqual([{ row: row + 6, col: col + 6 }, true]);
    for (const key of ["Tab", "Tab"]) {
      term_grab(t, key);
      paint(t);
      expect([t.box.row, t.box.col, t.box.w, t.box.h]).toEqual([row, col, w, h]);
    }
    expect(inside(t, 110)[1].trimEnd()).toBe("Which database?");
    expect(t.ruled.at).toBeNull();
  });
});

test("with a pane open illi's questions show over it: typing and a paste go to their words, the pane kept under them; Esc skips them, the pane back", async () => {
  const { term_paste } = await import("./Attach.ts");
  sized(110, 34, () => {
    const t = term();
    t.pane = { title: "Help", make: () => [[Paint.Run("help text")]], w: 0, lines: [], scroll: 0 };
    own(t, [DB]);
    paint(t);
    expect(t.box?.of).toBe(t.asking.form);
    term_type(t, "near");
    term_paste(t, "by\nme");
    expect([t.asking.form.each[0].ed.text, t.pane?.title, t.scr.ed.text]).toEqual(["nearby\nme", "Help", ""]);
    term_grab(t, "Esc");
    paint(t);
    expect([t.v.out.map((o: any) => o.msg.$), t.box, t.pane?.title]).toEqual([["answer"], null, "Help"]);
  });
});

test("a click in illi's form: on an option, one to pick picks it and goes on, of any toggles it (just shown: lit only); on a tab, there; on the words, lit; outside, nothing", () => {
  sized(110, 34, () => {
    const t = term();
    own(t, [DB, CACHE]);
    paint(t);
    const f = t.asking.form;
    click(t, form_row(t, 1), col(t));
    expect([f.each[0].at, f.each[0].picked, f.tab]).toEqual([1, [], 0]);
    t.asking.shown -= 600;
    click(t, form_row(t, 1), col(t));
    expect([f.each[0].picked, f.tab]).toEqual([[1], 1]);
    paint(t);
    click(t, form_row(t, 1), col(t));
    click(t, form_row(t, 0), col(t));
    click(t, form_row(t, 1), col(t));
    expect([f.each[1].picked, f.tab]).toEqual([[0], 1]);
    click(t, form_row(t, 2), col(t));
    expect(f.each[1].at).toBe(2);
    const tabs = t.box.rows[1];
    click(t, t.box.row + 1, t.box.col + 2 + tabs[0].col + 2);
    expect(f.tab).toBe(0);
    paint(t);
    click(t, 0, 0);
    click(t, t.box.row + t.box.h - 2, col(t));
    expect([f.tab, f.each[0].picked, t.v.out, t.asking.done]).toEqual([0, [1], [], false]);
  });
});

test("illi's form taller than the screen: its tabs and keys hold, its lines scroll to keep the lit row in view; the wheel scrolls them, the lit row held while it shows, else the nearest, the row under the pointer lit; stopping at their ends", () => {
  sized(100, 14, () => {
    const t = term();
    const many = { text: "Which one?", head: "One", options: Array.from({ length: 20 }, (_, k) => ({ label: "o" + k, about: "" })), multi: false };
    own(t, [many]);
    paint(t);
    const f = t.asking.form;
    expect([t.box.h, t.box.lines]).toEqual([12, 8]);
    for (let k = 0; k < 10; k++) {
      term_grab(t, "Down");
    }
    paint(t);
    const shown = inside(t, 100).map((l: string) => l.trim());
    expect([f.top, shown[0], shown[1], shown.at(-2), shown.at(-1)]).toEqual([4, "One   Review", "○ o3", "› ○ o10", "↑↓ move · Space pick · type your own · Enter next · Tab switch · Esc skip"]);
    const turn = (key: string) => {
      term_grab(t, key);
      paint(t);
      return [f.top, f.each[0].at];
    };
    expect([turn("WheelDown"), turn("WheelDown"), turn("WheelDown"), turn("WheelDown")]).toEqual([[6, 10], [8, 10], [10, 10], [12, 11]]);
    expect([turn("WheelDown"), turn("WheelDown")]).toEqual([[14, 13], [14, 13]]);
    t.scr.point = { row: t.box.row + t.box.list + 2, col: t.box.col + 5 };
    expect(turn("WheelUp")).toEqual([12, 13]);
    expect(turn("WheelUp")).toEqual([10, 11]);
    term_grab(t, "Ctrl+End");
    paint(t);
    expect([f.top, t.ruled.at]).toEqual([14, { row: t.box.row + 1 + 1 + 21 - 14, col: t.box.col + 6 }]);
  });
});

test("the wheel over a group's head scrolls on: the lit option gone from view, the nearest still in it lit", () => {
  sized(100, 24, () => {
    const t = term();
    const names = Array.from({ length: 40 }, (_, k) => "o" + k);
    term_chooser(t, "List", names, names.map(() => ""), -1, () => {}, { heads: names.map((_, k) => "Group " + Math.floor(k / 5)) });
    paint(t);
    t.scr.point = { row: t.box.row + t.box.list, col: t.box.col + 5 };
    for (const _ of [1, 2]) {
      term_grab(t, "WheelDown");
      paint(t);
    }
    expect([t.choose.top, lit(t)]).toEqual([6, "o5"]);
  });
});
