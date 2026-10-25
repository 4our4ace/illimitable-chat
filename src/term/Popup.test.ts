// Popup test
// ==========
// `bun test Popup.test.ts`. Every list opens in one popup in the
// screen's middle: the same column, top and width with the side panel
// left, right or off, the head row and the bottom line uncovered, all
// else dimmed in one ink, and no click on the side or the tabs under it.
// Its size from its content and the screen alone: POP_MIN wide for two
// options, what options say widening it to POP_CAP, a name never held to
// it; a share of the rows at most, all but two on a short screen. A name
// is never cut (what an option is is, with an ellipsis); on a screen too
// narrow for it, it wraps under itself. No control character in a name
// or a title reaches the screen. A search keeps the box's place and
// size; a value stepped wider grows it, never shrinks it, till a new
// size. The wheel scrolls a long list (a third of what shows, three at
// most), stopping at its ends, the option brought under the pointer lit,
// or off the list the lit one held in view; a list shown whole never
// moves, nor the chat. The mouse is the popup's alone: the pointer
// moving to another row lights it (along its row, at rest, or as the
// popup first shows under it: not); a press and a release on one option
// do what Enter does there, on two rows nothing; a press on its search
// puts the cursor where it lands (one too long to show whole: on its
// ellipsis, where what shows starts); a click outside closes a list and
// goes no further; no text is chosen, no button lights or copies, the
// right button does nothing; a double click picks once; a box no longer
// open (a new size) does nothing; the click that only focuses the
// terminal's window picks nothing and closes nothing. The wheel over a
// group's head scrolls on. The commands suggested as a /word is typed:
// a click on one does what Enter does there, a press on them chooses no
// text; a drag from elsewhere goes on over them. A theme's lit mark of
// any width leads every row as wide, lists and commands alike. Only a
// list with one in use dots its rows (the palette and /permissions
// none), what /mode's say whole on 100 columns.
// (Questions, illi's form too, take the input's place instead, their
// answers dotted: Question.test.ts.)

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-popup-");
process.env.ILLI_DIR = DIR;

const { term_chooser } = await import("./Commands.ts");
const { term_paint } = await import("./Frame.ts");
const { term_grab, term_press, term_type } = await import("./Keys.ts");
const { term_palette } = await import("./Palette.ts");
const { term_mode, term_permissions } = await import("./PermCommands.ts");
const { popup_size } = await import("./Popup.ts");
const { term_under } = await import("./Select.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const { status_new } = await import("./Status.ts");
const Theme = await import("../ui/Theme.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal on a screen fed by hand (its keys, text and mouse to the
// terminal), nothing painted yet, its paints written nowhere
function term(): any {
  const scr: any = { tty: true, kitty: false, ed: Screen.ed_new(), rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, left: true };
  const t: any = {
    v: View.view_new(), scr, due: false, notices: [], scroll: 0, seen: { total: 0, marks: [], row: 0, first: 0, tall: 1, col: 0, end: 0 }, ver: 0, body: null, find: null,
    pane: null, agents: [], choose: null, question: null, profs: [], hits: [], since: 0, spin: undefined, ruled: null, doing: null, subs: new Map(), side: { place: "right", width: "25%" }, status: status_new(),
    todo: false, areas: [], fields: [], sel: null, sug: null, dropped: "", asking: null, box: null, aim: { row: -1, in: false, press: null, first: null }, pin: null, lit: null, pointed: false, wait: null, acted: null, quit: 0, pending: 0, imgs: new Map(), quoted: null, lead: false,
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

// a measure: names, wants, least wide, tall rows at any width
const measure = (names: number, wants: number, least: number, tall = 6) => ({ names, wants, least, tall: () => tall });

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

test("its size from its content and the screen alone: POP_MIN for two options, what they say up to POP_CAP, a name never held to it, the least it asks; a share of the rows, all but two on a short screen", () => {
  expect(popup_size(measure(20, 30, 40), 160, 40)).toEqual({ row: 17, col: 59, w: 40, h: 6 });
  expect(popup_size(measure(30, 140, 40), 160, 40).w).toBe(96);
  expect(popup_size(measure(120, 140, 40), 160, 40).w).toBe(120);
  expect(popup_size(measure(120, 140, 40), 100, 40).w).toBe(95);
  expect(popup_size(measure(8, 20, 60), 160, 40).w).toBe(60);
  expect(popup_size(measure(20, 30, 40, 100), 160, 24).h).toBe(14);
  expect(popup_size(measure(20, 30, 40, 100), 160, 10)).toEqual({ row: 1, col: 59, w: 40, h: 8 });
  expect(popup_size(measure(20, 30, 40), 160, 40, 70).w).toBe(70);
});

test("a name is never cut: the longest shows whole past POP_CAP; what options say stops at it, cut with an ellipsis", () => {
  const long = "a grant kept for git -C /somewhere/work/a/project/with/a/long/path push origin main in this project";
  sized(160, 40, () => {
    const t = term();
    term_chooser(t, "Grants", ["one", long, "two", "three"], ["", "", "", ""], -1, () => {});
    term_paint(t);
    expect(t.box.w).toBe(4 + 2 + long.length + 2);
    expect(inside(t, 160)).toContain("  " + long + "  ");
    const u = term();
    term_chooser(u, "Projects", ["here", "app"], ["last 2026-10-10 · " + "x".repeat(150), "short"], -1, () => {});
    term_paint(u);
    expect(u.box.w).toBe(96);
    expect(inside(u, 160)[0]).toMatch(/^> here  last 2026-10-10 · x+…$/);
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

test("a name or a title holding a new line or a tab writes none to the screen: each a space, a tab two, the name as wide as it shows", () => {
  sized(120, 30, () => {
    const t = term();
    term_chooser(t, "Forget\nthis?", ["keep", "line one\nline\ttwo"], ["", ""], -1, () => {});
    term_paint(t);
    const runs = t.ruled.rows.flatMap((r: any[]) => r.flatMap((p: any) => p.line));
    expect(runs.filter((r: any) => /[\x00-\x1f\x7f-\x9f]/.test(r.x))).toEqual([]);
    const rows = t.ruled.rows.slice(t.box.row, t.box.row + t.box.h).map((r: any[]) => text(r, 120).slice(t.box.col, t.box.col + t.box.w));
    expect(rows[0]).toStartWith("╭─ Forget this? · ↑↓ Enter · Esc ");
    expect(rows.some((r: string) => r.includes("line one line  two"))).toBe(true);
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
    expect(inside(t, 100)[0].trim()).toBe("> o28");
    const u = term();
    term_chooser(u, "List", ["a", "b", "c"], ["", "", ""], -1, () => {});
    term_paint(u);
    u.scr.point = { row: u.box.row + u.box.list + 2, col: u.box.col + 5 };
    term_grab(u, "WheelDown");
    expect([u.choose.top, u.choose.at]).toEqual([0, 0]);
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

test("a press and a release on one option do what Enter does there: a setting stepped, a palette row run; pressed on one row and let go on another, nothing", async () => {
  const config = await import("../config/Config.ts");
  const { term_settings } = await import("./Settings.ts");
  const { term_palette } = await import("./Palette.ts");
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
  });
});

test("a press on a list's search puts its cursor where it lands, typing going in there: on its mark at its start, past it at its end; one too long for the box, on the ellipsis where what shows starts; a double click keeps the cursor; none from the click that only focuses the window, nor on a search changed since the paint; a click outside closes the list, the search as it was", () => {
  sized(100, 30, () => {
    const t = term();
    term_chooser(t, "Agent", ["illi", "reviewer"], ["", ""], -1, () => {}, { find: true });
    paint(t);
    const find = t.choose.find;
    const row  = t.box.row + 1;
    const left = t.box.col + 4;
    term_type(t, "review");
    paint(t);
    expect([inside(t, 100)[0].trimEnd(), t.ruled.at]).toEqual(["⌕ review", { row, col: left + 6 }]);
    click(t, row, left + 3);
    term_type(t, "x");
    paint(t);
    expect([find.text, find.pos, t.ruled.at, t.choose.title]).toEqual(["revxiew", 4, { row, col: left + 4 }, "Agent"]);
    click(t, row, left - 2);
    expect(find.pos).toBe(0);
    click(t, row, left + 20);
    expect(find.pos).toBe(7);
    const long = "abcdefghij".repeat(5);
    Screen.ed_set(find, long);
    paint(t);
    const shown = inside(t, 100)[0].trimEnd();
    expect([shown, t.ruled.at]).toEqual(["⌕ …" + long.slice(18), { row, col: left + 33 }]);
    click(t, row, left);
    expect(find.pos).toBe(18);
    click(t, row, left + 3);
    expect(find.pos).toBe(20);
    click(t, row, left + 33);
    expect(find.pos).toBe(50);
    click(t, row, left + 6);
    again(t, row, left + 6);
    let_go(t, row, left + 6);
    expect([find.pos, t.scr.clicks]).toEqual([23, 2]);
    t.scr.gained = Date.now();
    click(t, row, left + 9);
    t.scr.gained = undefined;
    expect([find.pos, t.choose.title]).toEqual([23, "Agent"]);
    term_type(t, "!");
    click(t, row, left + 9);
    expect([find.text, find.pos]).toEqual([long.slice(0, 23) + "!" + long.slice(23), 24]);
    paint(t);
    click(t, 29, left + 3);
    expect([t.choose, find.pos]).toEqual([null, 24]);
  });
});

test("a click outside closes a list and goes no further (no side, no tab, no block)", () => {
  sized(160, 40, () => {
    const t = term();
    term_chooser(t, "Agent", ["illi", "reviewer"], ["", ""], 0, () => {});
    paint(t);
    expect(t.hits).toEqual([]);
    click(t, 39, 5);
    expect([t.choose, t.v.out, t.notices]).toEqual([null, [], []]);
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

test("a report for a box no longer open does nothing: after a new size, before it is painted again", async () => {
  const { term_resize } = await import("./Frame.ts");
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

// a theme's own mark for the lit row, wider than >: every row leads as
// wide (Paint.lit_lead), so a list's names and what they are, the
// commands suggested and what they do, stay in line
test("a lit mark wider than >: every row leads as wide, a list's names and what they are in line, the commands suggested", () => {
  const was = Theme.GLYPH.lit;
  Theme.GLYPH.lit = "->";
  try {
    sized(160, 40, () => {
      const t = term();
      term_chooser(t, "Agent", ["illi", "reviewer"], ["illi's own", "reviews"], 0, () => {});
      term_paint(t);
      const rows = inside(t, 160).filter((r: string) => /illi|reviewer/.test(r));
      expect(rows.map((r: string) => r.trimEnd())).toEqual(["-> ● illi      illi's own", "   ◯ reviewer  reviews"]);
      const v = term();
      Screen.ed_set(v.scr.ed, "/cl");
      paint(v);
      const [a, b] = inside(v, 160);
      expect([a.slice(0, 10), b.slice(0, 10)]).toEqual(["-> /clear ", "   /close "]);
      expect(a.indexOf("start a new topic")).toBe(b.indexOf("close block"));
    });
  } finally {
    Theme.GLYPH.lit = was;
  }
});

// a dot after the lit mark is a list's one in use (and the rest of its
// set) alone, or a question's answers (Question.test.ts): the palette and
// /permissions, lists of what to do, carry none; /mode's every row one,
// and what each does whole, the longest too beside "the setting's" (the
// widest row), at the box's cap and on 100 columns. (A paint's rows are
// one list, each paint's own: each read as painted)
test("only a list with one in use dots its rows: the palette and /permissions none; /mode each, what each mode does whole, beside the setting's too, on 100 columns too", () => {
  const options = (t: any) => inside(t, 160).filter((r: string) => /^(> | {2})\S/.test(r));
  const dotted  = (t: any) => options(t).filter((r: string) => /^(> | {2})[◯●○] /.test(r));
  sized(160, 40, () => {
    const palette = term();
    term_palette(palette);
    term_paint(palette);
    expect([options(palette).length > 10, dotted(palette)]).toEqual([true, []]);
    const perms = term();
    perms.v.perm = { ...perms.v.perm, refused: [{ id: "r1", who: "illi", tool: "shell", what: "git push --force", why: "it rewrites history", how: "no", said: "", at: 1, exact: [] }], grants: [{ grant: "shell=ls", said: "ls", saved: false }] };
    term_permissions(perms);
    term_paint(perms);
    expect([options(perms).map((r: string) => r.slice(2, 4)), dotted(perms)]).toEqual([["gi", "ls", "Yo"], []]);
  });
  for (const [cols, set] of [[160, "yolo"], [100, "yolo"], [100, "auto"]] as const) {
    sized(cols, 40, () => {
      const mode = term();
      mode.v.perm = { ...mode.v.perm, mode: "yolo", set };
      term_mode(mode, "");
      term_paint(mode);
      const rows = dotted(mode);
      const at   = mode.choose.names.indexOf(set);
      expect(rows.map((r: string) => r.slice(2, 4))).toEqual(["◯ ", "◯ ", "◯ ", "◯ ", "● "]);
      expect(rows[at]).toEndWith(mode.choose.about[at] + "  the setting's");
      expect(rows.map((r: string) => r.replace(/^.{4}\S+ +/, "").replace(/ +the setting's$/, "").trimEnd())).toEqual(mode.choose.about);
    });
  }
});
