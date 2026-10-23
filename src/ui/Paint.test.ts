// Paint test
// ==========
// `bun test Paint.test.ts`. A row's lines are laid out once per width
// and look: the background told again as it was lays nothing out anew,
// another lays all of it out again. A chat laid out from its last row
// up, a few rows at a time, is the chat laid out whole; a block asked
// for is laid out with all under it. An open run of work marks its head
// and each message in it (a folded one as its one line).

import { expect, test } from "bun:test";
import * as Paint from "./Paint.ts";
import * as View from "./View.ts";

test("the background told again as it was lays nothing out anew; another, all", () => {
  const rows: View.Row[] = [{ $: "Sum", id: 7, n: 2, text: "read the logs", call: null, kind: null }];
  expect(Paint.paint_canvas("#101418")).toBe(true);
  const lit = Paint.rows_lines(rows, 60);
  expect(Paint.paint_canvas("#101418")).toBe(false);
  expect(Paint.rows_lines(rows, 60)[1]).toBe(lit[1]);
  expect(Paint.paint_canvas("#fdf6e3")).toBe(true);
  expect(Paint.rows_lines(rows, 60)[1]).not.toBe(lit[1]);
});

// a chat of every kind of row: blocks, an open one, runs of work open
// and closed, messages (one with an image), a caption
function chat(): View.Row[] {
  const sum = (id: number, n: number): View.Row => ({ $: "Sum", id, n, text: "a summary of what was said " + id, call: null, kind: null });
  const out: View.Row[] = [View.Cap("The whole chat."), sum(0, 4)];
  for (let id = 4; id < 40; id += 4) {
    out.push({ $: "Box", id, n: 2, text: "", rows: [sum(id, 1), sum(id + 1, 1)] });
    out.push({ $: "Act", id: id + 2, text: "Ran a command", open: id % 8 === 0, rows: [sum(id + 2, 1)] });
    out.push(...View.entry_rows(id + 3, id % 8 === 0 ? "user" : "illi", "Words " + id + "\n\n- one\n- two", id === 8 ? ["a.png"] : []));
  }
  return out;
}

const text = (lines: Paint.Line[]) => lines.map((l) => l.map((r) => r.x).join(""));

// laid out from the last up, a few lines more each time, the chat's lines
// and marks are those laid out whole; each step adds lines over those it
// had, as many as it says, and none once it has the lines asked for
test("rows laid out from the last up are the rows laid out whole", () => {
  const rows  = chat();
  const marks: Paint.Mark[] = [];
  const whole = Paint.rows_lines(rows, 60, marks, 1);
  const laid  = Paint.laid_new(rows, 60, 1);
  while (laid.from > 0) {
    const had   = laid.lines;
    const added = Paint.laid_up(laid, had.length + 7);
    expect(laid.lines.slice(added)).toEqual(had);
    expect(laid.from === 0 || laid.lines.length >= had.length + 7).toBe(true);
    expect(Paint.laid_up(laid, had.length + 7)).toBe(0);
  }
  expect(text(laid.lines)).toEqual(text(whole));
  expect(laid.marks).toEqual(marks);
});

// a block asked for is found among the rows, inside an open block or a
// run of work too, and the rows laid out as far as it
test("a block's row is found, and the rows laid out as far as it", () => {
  const rows = chat();
  expect(Paint.rows_find(rows, 0, 4)).toBe(1);
  expect(Paint.rows_find(rows, 13, 1)).toBe(rows.findIndex((r) => r.$ === "Box" && r.id === 12));
  expect(Paint.rows_find(rows, 14, 1)).toBe(rows.findIndex((r) => r.$ === "Act" && r.id === 14));
  expect(Paint.rows_find(rows, 99, 1)).toBe(-1);
  const laid = Paint.laid_new(rows, 60, 1);
  Paint.laid_up(laid, 0, 1);
  expect(laid.from).toBe(1);
  expect(laid.marks.find((m) => m.id === 0 && m.n === 4)).toBeDefined();
  expect(Paint.laid_stale(laid, 60)).toBe(false);
  expect(Paint.laid_stale(laid, 61)).toBe(true);
});

test("an open run of work marks its head and each message in it, a folded one as its one line", () => {
  const v    = View.view_new();
  const rows = [
    ...View.entry_rows(3, "tool", 'shell {"command":"npm test"}'),
    ...View.entry_rows(4, "echo", "ok\n".repeat(1204).trimEnd()),
  ];
  View.view_toggle(v, 3);
  View.view_fold(v, "#4");
  const run   = View.view_acts(v, rows);
  const marks: Paint.Mark[] = [];
  const lines = Paint.rows_lines(run, 60, marks);
  const text  = (l: Paint.Line) => l.map((r) => r.x).join("");
  expect(marks.map((m) => [m.act ?? false, m.fold ?? "", m.open, m.to - m.from])).toEqual([[true, "", true, 1], [false, "#3", true, 3], [false, "#4", false, 1]]);
  expect([marks[1].from, marks[2].from - marks[1].to]).toEqual([1, 1]);
  expect(text(lines[marks[2].from])).toBe("│ [+] result · 1,204 lines");
  View.view_fold(v, "#4");
  expect(Paint.rows_lines(View.view_acts(v, rows), 60).length).toBeGreaterThan(10);
});
