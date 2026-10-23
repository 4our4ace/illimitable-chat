// Runs test
// =========
// `bun test runs.test.ts`. Runs of work in a chat painted (Frame.ts),
// clicked as a terminal reports it. A click on a run's head, or anywhere
// down its bar, opens or closes the whole run, the runs led by a thought
// each its own (shown by Ctrl+O, a click closes one alone, and Ctrl+O
// again forgets the clicks); a click inside a message of an open run folds it to one
// line, its siblings staying, and a click on that line unfolds it; an
// open block shuts from any line of its frame, a block inside it opening
// itself; a gap line in a run is the block's above it. What a click
// acted on keeps its first line on the row clicked, the chat scrolled up
// or at its end (an open there leaves the end, the jump to it shown; a
// close there lands lower, as the chat never scrolls past its end). The
// live tail takes no click. What a click would act on lights, one thing
// at a time, once the pointer has moved: a run's head and its whole bar
// (heavier), a message's bar beside it, a folded line's glyph, a
// summary's gutter and /open, an open block's bar; never under a hit
// (the jump to the end); gone as the pointer leaves, as the chat moves
// by itself while followed, at a key, as the window loses the focus,
// while text chosen shows (the click that lets it go folds nothing;
// scrolled away, it holds no click back). A click on a word inside a
// message or a summary waits out a double click, what it acts on shown
// pressed meanwhile (a second press chooses the word; a key, the wheel,
// a right press give it up; a drag never folds; its mark gone by then,
// nothing), on a mark's own control (a summary's gutter and /open, an
// open block's bar) at once; a press again soon on the cell whose click
// just acted does nothing, nor does the press that only focuses the
// window. A pin past the chat's rows is held inside them.

import { expect, test } from "bun:test";
import { term_paint } from "../src/term/Frame.ts";
import { term_grab, term_press, term_type } from "../src/term/Keys.ts";
import { status_new } from "../src/term/Status.ts";
import * as Paint from "../src/ui/Paint.ts";
import * as Screen from "../src/ui/Screen.ts";
import * as View from "../src/ui/View.ts";
import * as Theme from "../src/ui/Theme.ts";

// a run's marks, open and shut, as the theme draws them
const OPEN = Theme.GLYPH.open + " ";
const SHUT = Theme.GLYPH.shut + " ";

// a chat: the user's words (`top` lines more), a run of work (two
// calls, a long result, a short one), illi's reply; again, a run of one
// call and a long result, illi's reply (`end` lines more); messages
// before `turn` summed up (each its summary, a call's word for word)
function chat(turn = 0, top = 0, end = 0): View.View {
  const v = View.view_new();
  const whole: Record<string, View.Entry> = {
    1 : { kind: "user", text: "Run the tests" + "\nplease".repeat(top) },
    2 : { kind: "tool", text: 'shell {"command":"npm test"}' },
    3 : { kind: "echo", text: Array.from({ length: 30 }, (_, k) => "ok " + k).join("\n") },
    4 : { kind: "tool", text: 'shell {"command":"ls"}' },
    5 : { kind: "echo", text: "a.ts" },
    6 : { kind: "illi", text: "Done, they pass." },
    7 : { kind: "user", text: "Again" },
    8 : { kind: "tool", text: 'shell {"command":"npm test"}' },
    9 : { kind: "echo", text: Array.from({ length: 20 }, (_, k) => "fine " + k).join("\n") },
    10: { kind: "illi", text: "Still passing." + "\n\nYes.".repeat(end) },
  };
  const nodes = Object.fromEntries(Object.entries(whole).map(([id, e]) => [id + "+1", { text: e.kind + ": " + e.text.split("\n")[0], to: "" }]));
  View.view_hear(v, { $: "know", nodes, whole });
  View.view_hear(v, { $: "view", parts: Object.keys(whole).map((id): View.Part => [Number(id), 1]), turn });
  return v;
}

// a terminal showing a chat, its side off, its screen left (nothing is
// written) and fed by hand; a paint always due, so a key asks for none
function term(v: View.View): any {
  const t: any = {
    v, chat: null, ended: false, pending: 0, due: true, settle: undefined, imgs: new Map(), quit: 0, esc: 0, notices: [], expire: undefined,
    scroll: 0, seen: { total: 0, marks: [], row: 0, first: 0, tall: 1, col: 0, end: 0 }, ver: 0, body: null, find: null, pane: null, agents: [],
    choose: null, question: null, profs: [], hits: [], since: 0, spin: undefined, ruled: null, doing: null, subs: new Map(), side: { place: "off", width: "" }, status: status_new(),
    todo: false, login: null, areas: [], sel: null, hover: undefined, drift: undefined, sug: null, dropped: "", lead: false, quoted: null, asking: null, box: null,
    aim: { row: -1, in: false, press: null, first: null }, pin: null, lit: null, pointed: false, wait: null, acted: null,
  };
  t.scr = { tty: true, kitty: false, ed: Screen.ed_new(), rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, left: true };
  [t.scr.grab, t.scr.on, t.scr.type] = [(k: string) => term_grab(t, k), (k: string) => term_press(t, k), (x: string) => term_type(t, x)];
  return t;
}

// f run on a screen 100 columns by 40 rows
function sized<T>(f: () => T): T {
  const was = [Object.getOwnPropertyDescriptor(process.stdout, "columns"), Object.getOwnPropertyDescriptor(process.stdout, "rows")];
  Object.defineProperty(process.stdout, "columns", { value: 100, configurable: true });
  Object.defineProperty(process.stdout, "rows", { value: 40, configurable: true });
  try {
    return f();
  } finally {
    Object.defineProperty(process.stdout, "columns", was[0] ?? { value: undefined, configurable: true });
    Object.defineProperty(process.stdout, "rows", was[1] ?? { value: undefined, configurable: true });
  }
}

// a paint; the chat's area as painted
function paint(t: any): any {
  sized(() => term_paint(t));
  t.due = true;
  return t.areas.find((a: any) => a.key === "chat");
}

// the mouse at a screen row and column, as a terminal reports it: a
// click (pressed, never a double click, and let go), the pointer moved
const sgr   = (b: number, row: number, col: number, end = "M") => "\x1b[<" + b + ";" + (col + 1) + ";" + (row + 1) + end;
const click = (t: any, row: number, col: number) => {
  t.scr.pressed = 0;
  Screen.screen_feed(t.scr, sgr(0, row, col) + sgr(0, row, col, "m"));
};
const move  = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(35, row, col));
const again = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(0, row, col) + sgr(0, row, col, "m"));

// till a click's fold waiting out a double click is done
const waited = () => Bun.sleep(Screen.TWICE + 40);

// what f writes to the terminal (a copy: OSC 52)
function written(f: () => void): string {
  let out = "";
  const write = process.stdout.write;
  process.stdout.write = ((x: string) => ((out += x), true)) as any;
  try {
    f();
  } finally {
    process.stdout.write = write;
  }
  return out;
}

// the runs lit as last painted (a tagged run drawn undimmed): each its
// screen row and text
const lit = (t: any): Array<[number, string]> => t.ruled.rows.flatMap((r: any[], row: number) => (r[0]?.line ?? []).filter((x: Paint.Run) => x.mark !== undefined && !x.s.d).map((x: Paint.Run) => [row, x.x]));

// the mark keyed `key` as last painted; the screen row of its line k
// (from its first; below 0, from the line past its last), and the column
// of the chat's lines' left end
const mark   = (t: any, key: string) => t.seen.marks.find((m: Paint.Mark) => m.key === key);
const row_of = (t: any, key: string, k = 0) => {
  const area = t.areas.find((a: any) => a.key === "chat");
  const m    = mark(t, key);
  return area.row + (k < 0 ? m.to : m.from) + k - area.first;
};
const left = (t: any) => t.areas.find((a: any) => a.key === "chat").col;

// the chat's lines as last painted, as text
const text = (area: any) => area.lines.map((l: Paint.Line) => l.map((r) => r.x).join("").trimEnd());

test("a click on a run's head, or anywhere down its bar, closes the whole run; on its line again, opens it", () => {
  const t = term(chat());
  View.view_toggle(t.v, 2);
  paint(t);
  expect(mark(t, "r2").open).toBe(true);
  click(t, row_of(t, "r2", -5), left(t));
  paint(t);
  expect(mark(t, "r2").open).toBe(false);
  click(t, row_of(t, "r2"), left(t) + 4);
  paint(t);
  expect(mark(t, "r2").open).toBe(true);
  click(t, row_of(t, "r2", 3), left(t) + 1);
  paint(t);
  expect(mark(t, "r2").open).toBe(false);
  click(t, row_of(t, "r2"), left(t));
  paint(t);
  expect([mark(t, "r2").open, mark(t, "r8").open]).toEqual([true, false]);
});

test("shown by Ctrl+O, a click closes the run it lights, alone; Ctrl+O again forgets the clicks", () => {
  const t = term(chat());
  paint(t);
  Screen.screen_feed(t.scr, "\x0f");
  paint(t);
  expect([mark(t, "r2").open, mark(t, "r8").open]).toEqual([true, true]);
  move(t, row_of(t, "r8"), left(t) + 4);
  paint(t);
  expect(lit(t)[0]).toEqual([row_of(t, "r8"), OPEN]);
  click(t, row_of(t, "r8"), left(t) + 4);
  paint(t);
  expect([mark(t, "r2").open, mark(t, "r8").open]).toEqual([true, false]);
  Screen.screen_feed(t.scr, "\x0f\x0f");
  paint(t);
  expect([mark(t, "r2").open, mark(t, "r8").open, t.v.acts.size]).toEqual([true, true, 0]);
});

test("runs led by a thought each open and close alone", () => {
  const v = chat();
  v.minds.set(1, ["think on the tests"]);
  v.minds.set(7, ["think again"]);
  v.turn = 0;
  const t = term(v);
  paint(t);
  expect([mark(t, "r-3").open, mark(t, "r-9").open]).toEqual([false, false]);
  click(t, row_of(t, "r-9"), left(t));
  paint(t);
  expect([mark(t, "r-3").open, mark(t, "r-9").open]).toEqual([false, true]);
});

test("a click inside a message of an open run folds it to one line, its siblings staying; a click on that line unfolds it", () => {
  const t = term(chat());
  View.view_toggle(t.v, 2);
  paint(t);
  click(t, row_of(t, "#3", -5), left(t) + 80);
  let area = paint(t);
  expect([mark(t, "#3").open, mark(t, "#3").to - mark(t, "#3").from, mark(t, "#2").open, mark(t, "#4").open]).toEqual([false, 2, true, true]);
  expect(text(area)[mark(t, "#3").from]).toBe("│ " + SHUT + "result · 30 lines");
  click(t, row_of(t, "#3"), left(t) + 2);
  area = paint(t);
  expect(mark(t, "#3").open).toBe(true);
  expect(text(area).slice(mark(t, "#3").from, mark(t, "#3").to).join("\n")).toContain("ok 29");
});

test("an open block shuts from any line of its frame; a gap line in a run is the summary's above it", () => {
  const t = term(chat(11));
  View.view_toggle(t.v, 2);
  paint(t);
  const sum = mark(t, Paint.block_key(2, 1));
  click(t, row_of(t, sum.key, -1), left(t) + 20);
  paint(t);
  const box = mark(t, sum.key);
  expect([box.open, box.up]).toEqual([true, "r2"]);
  click(t, row_of(t, box.key, -2), left(t) + 3);
  paint(t);
  expect(mark(t, sum.key).open).toBe(false);
});

test("in an open block, a summary opens itself, an open block inside shuts itself, the frame around them shuts the whole", () => {
  const v = chat(11);
  View.view_hear(v, { $: "know", nodes: { "2+2": { text: "the tests run", to: "" } } });
  View.view_hear(v, { $: "view", parts: [[1, 1], [2, 2], [4, 1], [5, 1], [6, 1]], turn: 11 });
  v.open.set("2+2", true);
  const t = term(v);
  paint(t);
  const outer = mark(t, Paint.block_key(2, 2));
  click(t, row_of(t, Paint.block_key(3, 1)), left(t) + 80);
  paint(t);
  expect([mark(t, Paint.block_key(3, 1)).open, mark(t, Paint.block_key(2, 2)).open]).toEqual([true, true]);
  const inner = mark(t, Paint.block_key(3, 1));
  click(t, row_of(t, inner.key, 1), left(t) + 6);
  paint(t);
  expect([mark(t, inner.key).open, mark(t, outer.key).open]).toEqual([false, true]);
  click(t, row_of(t, outer.key, -1), left(t) + 10);
  paint(t);
  expect(mark(t, outer.key).open).toBe(false);
});


test("a fold or an open keeps the first line of what it acted on on the row clicked, the chat scrolled up", () => {
  const t = term(chat(0, 40, 40));
  View.view_toggle(t.v, 2);
  t.scroll = Infinity;
  paint(t);
  t.scroll = t.seen.total - t.seen.tall - mark(t, "r2").from + 2;
  paint(t);
  const row = row_of(t, "#3", 10);
  click(t, row, left(t) + 60);
  paint(t);
  expect([mark(t, "#3").open, row_of(t, "#3"), t.scroll > 0]).toEqual([false, row, true]);
  click(t, row, left(t) + 2);
  paint(t);
  expect([mark(t, "#3").open, row_of(t, "#3")]).toEqual([true, row]);
  const head = row_of(t, "r2");
  click(t, head, left(t) + 4);
  paint(t);
  expect([mark(t, "r2").open, row_of(t, "r2")]).toEqual([false, head]);
});

test("at the chat's end, an open keeps its head, leaving the end (the jump shown); a close lands lower, the chat never past its end", () => {
  const t = term(chat(0, 40));
  paint(t);
  const row = row_of(t, "r8");
  click(t, row, left(t) + 4);
  paint(t);
  const jump = t.ruled.rows.some((r: any[]) => r.some((p: any) => p.line.some((x: Paint.Run) => x.x.includes("Jump to Bottom"))));
  expect([mark(t, "r8").open, row_of(t, "r8"), t.scroll > 0, jump]).toEqual([true, row, true, true]);
  t.scroll = 0;
  paint(t);
  const bar = row_of(t, "r8", 2);
  click(t, bar, left(t));
  paint(t);
  expect([mark(t, "r8").open, t.scroll]).toEqual([false, 0]);
  expect(row_of(t, "r8")).toBeGreaterThan(bar);
});

test("the live tail takes no click", () => {
  const t = term(chat());
  t.v.live = [{ kind: "illi", text: "Working on it, line one\nline two\nline three" }];
  t.v.busy = true;
  const area = paint(t);
  const ver  = t.ver;
  click(t, area.row + area.tall - 2, left(t) + 3);
  expect([t.ver, t.v.acts.size, t.v.folds.size, t.v.open.size]).toEqual([ver, 0, 0, 0]);
});

test("what a click would act on lights once the pointer moves: a message's bar beside it, a run's head and its whole bar heavier, a folded line's glyph", () => {
  const t = term(chat());
  View.view_toggle(t.v, 2);
  t.scroll = Infinity;
  paint(t);
  t.scr.point = { row: row_of(t, "#3", 3), col: left(t) + 8 };
  paint(t);
  expect(lit(t)).toEqual([]);
  move(t, row_of(t, "#3", 3), left(t) + 8);
  paint(t);
  const area = t.areas.find((a: any) => a.key === "chat");
  const rows = (key: string) => Array.from({ length: mark(t, key).to - mark(t, key).from }, (_, k) => row_of(t, key, k)).filter((r) => r < area.row + area.tall);
  expect(lit(t)).toEqual(rows("#3").map((r) => [r, "│ "]));
  move(t, row_of(t, "r2"), left(t) + 30);
  paint(t);
  expect(lit(t)).toEqual([[row_of(t, "r2"), OPEN], [row_of(t, "r2"), "Ran 2 commands"], ...rows("r2").slice(1).map((r): [number, string] => [r, "┃ "])]);
  click(t, row_of(t, "#2"), left(t) + 80);
  paint(t);
  expect(lit(t)).toEqual([[row_of(t, "#2"), "│ "], [row_of(t, "#2"), SHUT], [row_of(t, "#2", 1), "│ "]]);
});

test("a summary lights its gutter and /open, an open block its bar, each its bar in the run beside it; nothing over a line no click acts on", () => {
  const t = term(chat(11));
  View.view_toggle(t.v, 2);
  paint(t);
  const sum = Paint.block_key(4, 1);
  move(t, row_of(t, sum), left(t) + 12);
  paint(t);
  expect(lit(t)).toEqual([[row_of(t, sum), "│ "], [row_of(t, sum), " 1x     "], [row_of(t, sum), "/open #4"], [row_of(t, sum, 1), "│ "]]);
  click(t, row_of(t, sum), left(t) + 2);
  paint(t);
  const box = lit(t);
  expect(box[1]).toEqual([row_of(t, sum), " 1x · /close #4 "]);
  expect(box.filter(([, x]) => x !== "│ ").length).toBe(1);
  t.v.open.set("1+1", false);
  t.ver += 1;
  paint(t);
  move(t, row_of(t, Paint.block_key(1, 1)), left(t) + 12);
  paint(t);
  expect(lit(t)).toEqual([[row_of(t, Paint.block_key(1, 1)), " 1x     "], [row_of(t, Paint.block_key(1, 1)), "/open #1"]]);
  move(t, 0, 4);
  paint(t);
  expect(lit(t)).toEqual([]);
});

test("the light goes as the chat moves by itself while followed, at a key, as the focus is lost; and never under the jump to the end", () => {
  const t = term(chat());
  View.view_toggle(t.v, 8);
  paint(t);
  const at = () => move(t, row_of(t, "#9", -3), left(t) + 8);
  at();
  paint(t);
  expect(lit(t).length).toBeGreaterThan(0);
  View.view_hear(t.v, { $: "entry", id: 11, kind: "user", text: "One more" });
  t.ver += 1;
  paint(t);
  expect(lit(t)).toEqual([]);
  at();
  paint(t);
  expect(lit(t).length).toBeGreaterThan(0);
  Screen.screen_feed(t.scr, "x");
  paint(t);
  expect(lit(t)).toEqual([]);
  at();
  paint(t);
  Screen.screen_feed(t.scr, "\x1b[O");
  paint(t);
  expect(lit(t)).toEqual([]);
  Screen.screen_feed(t.scr, "\x1b[I");
  paint(t);
  expect(lit(t)).toEqual([]);
  t.scroll = 5;
  paint(t);
  const area = t.areas.find((a: any) => a.key === "chat");
  const jump = t.hits.find((h: any) => h.row >= area.row && h.row < area.row + area.tall);
  move(t, jump.row, jump.col - 2);
  paint(t);
  expect(lit(t).length).toBeGreaterThan(0);
  move(t, jump.row, jump.col + 2);
  paint(t);
  expect(lit(t)).toEqual([]);
});

test("a click on a word in a message waits out a double click, shown pressed, then folds; a second press chooses the word instead", async () => {
  const t = term(chat());
  View.view_toggle(t.v, 2);
  paint(t);
  const row = row_of(t, "#3", -5);
  click(t, row, left(t) + 8);
  paint(t);
  const pressed = t.ruled.rows[row][0].line.filter((x: Paint.Run) => x.mark !== undefined);
  expect([mark(t, "#3").open, pressed.map((x: Paint.Run) => [x.x, x.s.v])]).toEqual([true, [["│ ", true]]]);
  await waited();
  paint(t);
  expect(mark(t, "#3").open).toBe(false);
  const word = row_of(t, "#4");
  const out  = written(() => {
    click(t, word, left(t) + 6);
    again(t, word, left(t) + 6);
  });
  await waited();
  paint(t);
  expect([mark(t, "#4").open, out]).toEqual([true, "\x1b]52;c;" + Buffer.from("shell").toString("base64") + "\x07"]);
});

test("a key, the wheel or a right press gives a waiting fold up; a drag never folds", async () => {
  const t = term(chat());
  View.view_toggle(t.v, 2);
  paint(t);
  const row = row_of(t, "#3", -5);
  for (const then of ["x", sgr(65, row, 10), sgr(2, row, 10) + sgr(2, row, 10, "m")]) {
    click(t, row, left(t) + 8);
    expect(t.wait?.key).toBe("#3");
    Screen.screen_feed(t.scr, then);
    expect(t.wait).toBeNull();
  }
  written(() => Screen.screen_feed(t.scr, sgr(0, row, left(t) + 8) + sgr(32, row, left(t) + 20) + sgr(0, row, left(t) + 20, "m")));
  await waited();
  paint(t);
  expect([mark(t, "#3").open, t.wait]).toEqual([true, null]);
});

test("a press again soon on the cell whose click just acted does nothing, chooses no word; later, it acts", () => {
  const t = term(chat());
  paint(t);
  const row = row_of(t, "r8");
  click(t, row, left(t) + 4);
  const out = written(() => again(t, row, left(t) + 4));
  paint(t);
  expect([mark(t, "r8").open, out, t.sel]).toEqual([true, "", null]);
  t.acted.until -= 1000;
  click(t, row, left(t) + 4);
  paint(t);
  expect(mark(t, "r8").open).toBe(false);
});

test("the press that only focuses the window acts on nothing: one while the focus is lost, or just after it comes back", () => {
  const t = term(chat());
  paint(t);
  const row = row_of(t, "r8");
  Screen.screen_feed(t.scr, "\x1b[O");
  click(t, row, left(t) + 4);
  Screen.screen_feed(t.scr, "\x1b[I");
  click(t, row, left(t) + 5);
  paint(t);
  expect(mark(t, "r8").open).toBe(false);
  t.scr.gained -= 200;
  click(t, row, left(t) + 6);
  paint(t);
  expect(mark(t, "r8").open).toBe(true);
});

test("while text chosen shows, nothing lights and the click that lets it go acts on nothing in the chat; scrolled away, a click acts", async () => {
  const t = term(chat());
  View.view_toggle(t.v, 2);
  t.scroll = Infinity;
  paint(t);
  const row = row_of(t, "#3", 4);
  written(() => Screen.screen_feed(t.scr, sgr(0, row, left(t) + 8) + sgr(32, row, left(t) + 20) + sgr(0, row, left(t) + 20, "m")));
  paint(t);
  move(t, row_of(t, "#3", 8), left(t) + 8);
  paint(t);
  expect([t.sel?.moved, lit(t)]).toEqual([true, []]);
  click(t, row_of(t, "#3", 8), left(t) + 8);
  paint(t);
  expect([t.sel, t.wait, lit(t).length > 0]).toEqual([null, null, true]);
  click(t, row_of(t, "#2"), left(t) + 80);
  paint(t);
  expect(mark(t, "#2").open).toBe(false);
  written(() => Screen.screen_feed(t.scr, sgr(0, row, left(t) + 8) + sgr(32, row, left(t) + 20) + sgr(0, row, left(t) + 20, "m")));
  t.scroll = 0;
  paint(t);
  expect(t.sel.b.line).toBeLessThan(t.areas.find((a: any) => a.key === "chat").first);
  click(t, row_of(t, "r8"), left(t) + 4);
  paint(t);
  expect([t.sel, mark(t, "r8").open]).toEqual([null, true]);
});

test("a click on a mark's own control acts at once: a summary's /open and gutter, an open block's bar; on a summary's words it waits", async () => {
  const t = term(chat(11));
  View.view_toggle(t.v, 2);
  paint(t);
  const sum  = Paint.block_key(4, 1);
  const line = (k = 0) => t.areas.find((a: any) => a.key === "chat").lines[mark(t, sum).from + k].map((r: Paint.Run) => r.x).join("");
  click(t, row_of(t, sum), left(t) + line().indexOf("/open") + 2);
  expect([t.wait, mark(t, sum).open]).toEqual([null, false]);
  paint(t);
  expect(mark(t, sum).open).toBe(true);
  t.acted = null;
  click(t, row_of(t, sum), left(t) + line().indexOf("/close") + 2);
  paint(t);
  expect([t.wait, mark(t, sum).open]).toEqual([null, false]);
  t.acted = null;
  click(t, row_of(t, sum), left(t) + line().indexOf("1x"));
  paint(t);
  expect([t.wait, mark(t, sum).open]).toEqual([null, true]);
  View.view_act(t.v, { $: "Shut", id: 4, n: 1 });
  t.ver += 1;
  paint(t);
  click(t, row_of(t, sum), left(t) + line().indexOf("ls") + 1);
  expect(t.wait?.key).toBe(sum);
  await waited();
  paint(t);
  expect(mark(t, sum).open).toBe(true);
});

test("a click's fold waiting acts on its mark as painted then: gone by then (its run closed), nothing", async () => {
  const t = term(chat());
  View.view_toggle(t.v, 2);
  paint(t);
  click(t, row_of(t, "#3", -5), left(t) + 8);
  expect(t.wait?.key).toBe("#3");
  View.view_toggle(t.v, 2);
  t.ver += 1;
  paint(t);
  await waited();
  paint(t);
  expect([t.wait, t.v.folds.size, mark(t, "r2").open]).toEqual([null, 0, false]);
});

test("a pin past the chat's rows (a new size since the click) is held inside them", () => {
  const t = term(chat(0, 40, 40));
  View.view_toggle(t.v, 2);
  t.scroll = Infinity;
  paint(t);
  const area = t.areas.find((a: any) => a.key === "chat");
  t.pin = { key: "#3", row: area.row + area.tall + 20 };
  paint(t);
  expect(row_of(t, "#3")).toBe(area.row + area.tall - 1);
  t.pin = { key: "#3", row: 0 };
  paint(t);
  expect(row_of(t, "#3")).toBe(area.row);
});
