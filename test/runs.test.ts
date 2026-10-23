// Runs test
// =========
// `bun test runs.test.ts`. Runs of work in a chat painted (Frame.ts),
// clicked as a terminal reports it. A click on a run's head, or anywhere
// down its bar, opens or closes the whole run, the runs led by a thought
// each its own; a click inside a message of an open run folds it to one
// line, its siblings staying, and a click on that line unfolds it; an
// open block shuts from any line of its frame, a block inside it opening
// itself; a gap line in a run is the block's above it.

import { expect, test } from "bun:test";
import { term_paint } from "../src/term/Frame.ts";
import { term_grab, term_press, term_type } from "../src/term/Keys.ts";
import { status_new } from "../src/term/Status.ts";
import * as Paint from "../src/ui/Paint.ts";
import * as Screen from "../src/ui/Screen.ts";
import * as View from "../src/ui/View.ts";

// a chat: the user's words, a run of work (two calls, a long result, a
// short one), illi's reply; again, a run of one call; messages before
// `turn` summed up (each its summary, a call's word for word)
function chat(turn = 0): View.View {
  const v = View.view_new();
  const whole: Record<string, View.Entry> = {
    1 : { kind: "user", text: "Run the tests" },
    2 : { kind: "tool", text: 'shell {"command":"npm test"}' },
    3 : { kind: "echo", text: Array.from({ length: 30 }, (_, k) => "ok " + k).join("\n") },
    4 : { kind: "tool", text: 'shell {"command":"ls"}' },
    5 : { kind: "echo", text: "a.ts" },
    6 : { kind: "illi", text: "Done, they pass." },
    7 : { kind: "user", text: "Again" },
    8 : { kind: "tool", text: 'shell {"command":"npm test"}' },
    9 : { kind: "echo", text: "ok" },
    10: { kind: "illi", text: "Still passing." },
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
    choose: null, profs: [], hits: [], since: 0, spin: undefined, ruled: null, doing: null, subs: new Map(), side: { place: "off", width: "" }, status: status_new(),
    todo: false, login: null, areas: [], sel: null, hover: undefined, drift: undefined, sug: null, dropped: "", lead: false, quoted: null, asking: null, box: null,
    aim: { row: -1, in: false, press: null, first: null },
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
  click(t, row_of(t, "r2", -3), left(t) + 1);
  paint(t);
  expect(mark(t, "r2").open).toBe(false);
  click(t, row_of(t, "r2"), left(t));
  click(t, row_of(t, "r2"), left(t));
  paint(t);
  expect([mark(t, "r2").open, mark(t, "r8").open]).toEqual([false, false]);
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
  click(t, row_of(t, "#3", -5), left(t) + 8);
  let area = paint(t);
  expect([mark(t, "#3").open, mark(t, "#3").to - mark(t, "#3").from, mark(t, "#2").open, mark(t, "#4").open]).toEqual([false, 2, true, true]);
  expect(text(area)[mark(t, "#3").from]).toBe("│ [+] result · 30 lines");
  click(t, row_of(t, "#3"), left(t) + 6);
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
  click(t, row_of(t, Paint.block_key(3, 1)), left(t) + 12);
  paint(t);
  expect([mark(t, Paint.block_key(3, 1)).open, mark(t, Paint.block_key(2, 2)).open]).toEqual([true, true]);
  const inner = mark(t, Paint.block_key(3, 1));
  click(t, row_of(t, inner.key, -3), left(t) + 6);
  paint(t);
  expect([mark(t, inner.key).open, mark(t, outer.key).open]).toEqual([false, true]);
  click(t, row_of(t, outer.key, -1), left(t) + 10);
  paint(t);
  expect(mark(t, outer.key).open).toBe(false);
});

