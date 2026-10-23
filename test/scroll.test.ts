// Scroll test
// ===========
// `bun test scroll.test.ts`. A long chat painted (Frame.ts) is laid out
// from its end up, only as far as it shows and a screen more: scrolled by
// pages, the wheel, to its top and back to its end, it shows what the
// chat laid out whole shows there; scrolled up, the lines read stay in
// place as more come, and text chosen stays on its lines as more are
// laid out over them; a block asked for shows at the top. The palette
// opened, searched and closed lays out none of the chat again; while it
// is open, the wheel and the pages leave the chat where it was.

import { expect, test } from "bun:test";
import { term_paint } from "../src/term/Frame.ts";
import { term_grab, term_press, term_type } from "../src/term/Keys.ts";
import { term_palette } from "../src/term/Palette.ts";
import { term_selected } from "../src/term/Select.ts";
import { status_new } from "../src/term/Status.ts";
import * as Paint from "../src/ui/Paint.ts";
import * as Screen from "../src/ui/Screen.ts";
import * as View from "../src/ui/View.ts";

const text = (lines: Paint.Line[]) => lines.map((l) => l.map((r) => r.x).join("").trimEnd());

// a chat of a summary block, then n messages whole, the user's and illi's
function chat(n: number): View.View {
  const v = View.view_new();
  const whole: Record<string, View.Entry> = {};
  for (let id = 4; id < 4 + n; id++) {
    whole[id] = id % 2 === 0 ? { kind: "user", text: "Question " + id } : { kind: "illi", text: "## Answer " + id + "\n\nSome words, enough of them to wrap at least once at the width of this chat.\n\n- one\n- two" };
  }
  View.view_hear(v, { $: "know", nodes: { "0+4": { text: "what was said first", to: "" } }, whole });
  View.view_hear(v, { $: "view", parts: [[0, 4], ...Object.keys(whole).map((id): View.Part => [Number(id), 1])], turn: 4 });
  return v;
}

// a terminal showing a chat, its side off, its screen left (nothing is
// written); a paint always due, so a key asks for none
function term(v: View.View): any {
  const t: any = {
    v, chat: null, ended: false, pending: 0, due: true, settle: undefined, imgs: new Map(), quit: 0, esc: 0, notices: [], expire: undefined,
    scroll: 0, seen: { total: 0, marks: [], row: 0, first: 0, tall: 1, col: 0, end: 0 }, ver: 0, body: null, find: null, pane: null, agents: [],
    choose: null, profs: [], hits: [], since: 0, spin: undefined, ruled: null, doing: null, subs: new Map(), side: { place: "off", width: "" }, status: status_new(),
    todo: false, login: null, areas: [], sel: null, hover: undefined, drift: undefined, sug: null, dropped: "", asking: null, box: null, aim: { row: -1, in: false, press: null, first: null }, pin: null,
  };
  t.scr = { tty: true, kitty: false, ed: Screen.ed_new(), rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, grab: null, on: () => {}, left: true };
  return t;
}

// a paint: the chat's area, its lines shown
function paint(t: any): { area: any; shown: string[] } {
  term_paint(t);
  t.due = true;
  const area = t.areas.find((a: any) => a.key === "chat");
  return { area, shown: text(area.lines.slice(area.first, area.first + area.tall)) };
}

// what the chat laid out whole shows, scrolled up s lines
function whole(t: any, w: number, tall: number, s: number): string[] {
  const lines = text([[], ...Paint.rows_lines(View.view_body(t.v), w, [], 1)]);
  const up    = Math.max(0, Math.min(s, lines.length - tall));
  return lines.slice(lines.length - tall - up, lines.length - up);
}

test("scrolled by pages, the wheel, to the top and back, the chat shows what it shows laid out whole", () => {
  const t = term(chat(400));
  const { area } = paint(t);
  expect(t.body.from).toBeGreaterThan(0);
  const keys = ["PgUp", "PgUp", "WheelUp", "PgUp", "WheelDown", "PgDn", "Ctrl+Home", "PgDn", "WheelUp", "Ctrl+End"];
  const laid: number[] = [];
  for (const key of keys) {
    term_press(t, key);
    const { shown } = paint(t);
    expect(shown).toEqual(whole(t, area.w, area.tall, t.scroll));
    laid.push(t.body.from);
  }
  expect(laid[5]).toBeGreaterThan(0);
  expect(laid[6]).toBe(0);
  expect(t.scroll).toBe(0);
});

test("scrolled up, the lines read stay as more come; text chosen stays on its lines", () => {
  const t = term(chat(400));
  paint(t);
  term_press(t, "PgUp");
  term_press(t, "PgUp");
  const { area, shown } = paint(t);
  View.view_hear(t.v, { $: "entry", id: 404, kind: "user", text: "One more" });
  t.ver += 1;
  expect(paint(t).shown).toEqual(shown);
  t.sel = { key: "chat", a: { line: area.first + 2, col: 0 }, b: { line: area.first + 6, col: 12 }, held: false, moved: true, unit: 1, root: [{ line: area.first + 2, col: 0 }, { line: area.first + 2, col: 0 }] };
  const chosen = term_selected(t);
  const from   = t.body.from;
  for (let k = 0; k < 4; k++) {
    term_press(t, "PgUp");
    paint(t);
  }
  expect(t.body.from).toBeLessThan(from);
  expect(term_selected(t)).toBe(chosen);
});

test("a block asked for shows at the top, all under it laid out", () => {
  const t = term(chat(400));
  paint(t);
  t.find = [0, 4];
  const { area } = paint(t);
  const mark = t.seen.marks.find((m: Paint.Mark) => m.id === 0 && m.n === 4);
  expect(area.first).toBe(mark.from - 1);
  expect(text(area.lines.slice(mark.from, mark.to)).join("\n")).toContain("what was said first");
});

test("the palette opened, searched and closed lays out none of the chat again: a long chat costs it nothing", () => {
  const t = term(chat(2000));
  paint(t);
  const body = t.body;
  const from = body.from;
  term_palette(t);
  paint(t);
  for (const ch of "settings") {
    term_type(t, ch);
    paint(t);
  }
  expect(t.choose.shown.length).toBeGreaterThan(0);
  term_grab(t, "Esc");
  const { shown } = paint(t);
  expect(t.choose).toBeNull();
  expect(t.body).toBe(body);
  expect(t.body.from).toBe(from);
  expect(shown.join("\n")).toContain("Answer 2003");
});

test("with the palette open, the wheel and the pages move in it, the chat where it was", () => {
  const t = term(chat(400));
  paint(t);
  term_press(t, "PgUp");
  const { shown } = paint(t);
  const [scroll, body, from] = [t.scroll, t.body, t.body.from];
  term_palette(t);
  paint(t);
  for (const key of ["WheelUp", "WheelDown", "PgUp", "PgDn", "Ctrl+Home", "Ctrl+End"]) {
    if (!term_grab(t, key)) {
      term_press(t, key);
    }
    paint(t);
  }
  expect([t.choose.title, t.scroll, t.body, t.body.from]).toEqual(["Commands", scroll, body, from]);
  term_grab(t, "Esc");
  expect(paint(t).shown).toEqual(shown);
});
