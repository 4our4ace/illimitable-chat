// Paint test
// ==========
// `bun test Paint.test.ts`. A row's lines are laid out once per width
// and look: the background told again as it was lays nothing out anew,
// another lays all of it out again. A chat laid out from its last row
// up, a few rows at a time, is the chat laid out whole; a block asked
// for is laid out with all under it. An open run of work is marked
// whole, each message in it too (a folded one as its one line), a gap
// line the block's above it; its glyph, label and bar tagged with its
// key. A shut run lists its calls under its line, a line each, the
// latest six at most, each fit to the width whatever it holds. An open
// block is marked over its whole frame, the innermost mark the smaller.
// A recap's pages fold as a run's messages do. A mark lit lights its
// tagged runs: a run's glyph in the accent, its label in the ink, its
// bar heavier; a message its own and its run's bar beside it; pressed,
// reversed.

import { expect, test } from "bun:test";
import * as Call from "./Call.ts";
import * as Draw from "./Draw.ts";
import * as Paint from "./Paint.ts";
import * as View from "./View.ts";
import * as Theme from "./Theme.ts";

// a run's marks, open and shut, as the theme draws them
const OPEN = Theme.GLYPH.open + " ";
const SHUT = Theme.GLYPH.shut + " ";

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
// and closed (a shut one's calls listed: done, failed, cut, not known),
// messages (one with an image), a caption
function chat(): View.Row[] {
  const sum   = (id: number, n: number): View.Row => ({ $: "Sum", id, n, text: "a summary of what was said " + id, call: null, kind: null });
  const call  = (text: string, ok: boolean | null): View.Done => ({ call: Call.call_parse(text), ok });
  const calls = [call('shell {"command":"bun test"}', true), call('shell {"command":"git push ' + "中".repeat(40) + '"}', false), call('read {"path":"a.log"}', null)];
  const out: View.Row[] = [View.Cap("The whole chat."), sum(0, 4)];
  for (let id = 4; id < 40; id += 4) {
    out.push({ $: "Box", id, n: 2, rows: [sum(id, 1), sum(id + 1, 1)] });
    out.push({ $: "Act", id: id + 2, text: "Ran a command", open: id % 8 === 0, rows: [sum(id + 2, 1)], calls });
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

// a block asked for (by its mark's key) is found among the rows, inside
// an open block or a run of work too, and the rows laid out as far as it;
// a run of work by its key too
test("a block's row is found, and the rows laid out as far as it", () => {
  const rows = chat();
  expect(Paint.rows_find(rows, Paint.block_key(0, 4))).toBe(1);
  expect(Paint.rows_find(rows, Paint.block_key(13, 1))).toBe(rows.findIndex((r) => r.$ === "Box" && r.id === 12));
  expect(Paint.rows_find(rows, Paint.block_key(14, 1))).toBe(rows.findIndex((r) => r.$ === "Act" && r.id === 14));
  expect(Paint.rows_find(rows, "r14")).toBe(rows.findIndex((r) => r.$ === "Act" && r.id === 14));
  expect(Paint.rows_find(rows, Paint.block_key(99, 1))).toBe(-1);
  const laid = Paint.laid_new(rows, 60, 1);
  Paint.laid_up(laid, 0, 1);
  expect(laid.from).toBe(1);
  expect(laid.marks.find((m) => m.key === Paint.block_key(0, 4))).toBeDefined();
  expect(Paint.laid_stale(laid, 60)).toBe(false);
  expect(Paint.laid_stale(laid, 61)).toBe(true);
});

// an open run: marked whole, its head and every line under it; each
// message in it with the gap under it (a folded one as its one line), its
// run noted; the head's glyph and label and the bar tagged with the
// run's key, a folded line's glyph with its own
test("an open run of work is marked whole, each message in it with its gap, a folded one as its one line; its glyph, label and bar tagged", () => {
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
  expect(marks.map((m) => [m.key, m.act ?? false, m.fold ?? false, m.open, m.from, m.to, m.up ?? ""])).toEqual([
    ["r3", true, false, true, 0, 6, ""],
    ["#3", false, true, true, 1, 5, "r3"],
    ["#4", false, true, false, 5, 6, "r3"],
  ]);
  expect(lines[0].map((r) => [r.x, r.mark])).toEqual([[OPEN, { key: "r3", as: "glyph" }], ["Ran a command", { key: "r3", as: "label" }]]);
  expect(lines.slice(1).map((l) => l[0].mark)).toEqual(Array(5).fill({ key: "r3", as: "bar" }));
  expect(text(lines[5])).toBe("│ " + SHUT + "result · 1,204 lines");
  expect(lines[5][1].mark).toEqual({ key: "#4", as: "glyph" });
  View.view_fold(v, "#4");
  expect(Paint.rows_lines(View.view_acts(v, rows), 60).length).toBeGreaterThan(10);
});

// a shut run lists its calls under its line, a line each from its words
// on: how each ended (GLYPH.ok; GLYPH.failed in the error's color; not
// known: as wide, blank; the names line up whatever the theme makes the
// marks), its tool's name (after the theme's mark for it, if any) and
// the call on one line, its control characters dropped, cut to the
// width (its line too, "…" where); past six, the latest five, the rest
// counted over them; all in the run's mark, the words tagged as its
// label. Open, the run lists none: its rows show
test("a shut run lists its calls, a line each: how each ended, its tool and call cut to the width; past six, the latest", () => {
  const v     = View.view_new();
  const call  = (id: number, command: string, out: string | null) => [
    ...View.entry_rows(id, "tool", "shell " + JSON.stringify({ command })),
    ...(out === null ? [] : View.entry_rows(id + 1, "echo", out)),
  ];
  const rows  = [...call(3, "bun test", "ok"), ...call(5, "git push \x1b[31m--tags", View.FAILED + "rejected"), ...call(7, "echo " + "x".repeat(80), "x"), ...call(9, "ls", null)];
  const marks: Paint.Mark[] = [];
  const lines = Paint.rows_lines(View.view_acts(v, rows), 40, marks);
  const lead  = " ".repeat(SHUT.length);
  expect(text(lines)).toEqual([
    SHUT + "Ran 4 commands",
    lead + Theme.GLYPH.ok + " shell bun test",
    lead + Theme.GLYPH.failed + " shell git push [31m--tags",
    lead + Theme.GLYPH.ok + " shell echo " + "x".repeat(22) + "…",
    lead + "  shell ls",
  ]);
  expect(lines.every((l) => Paint.line_width(l) <= 40)).toBe(true);
  expect(marks).toEqual([{ from: 0, to: 5, key: "r3", id: 3, n: 0, open: false, act: true }]);
  expect(lines[2][1].s.c).toBe(Draw.draw_tokens().error);
  expect(lines[1].slice(2).map((r) => r.mark)).toEqual([{ key: "r3", as: "label" }, { key: "r3", as: "label" }]);
  const many  = Array.from({ length: 8 }, (_, k) => call(20 + 2 * k, "step " + k, "ok")).flat();
  expect(text(Paint.rows_lines(View.view_acts(v, many), 40)).slice(1)).toEqual([
    lead + "… 3 earlier",
    ...[3, 4, 5, 6, 7].map((k) => lead + Theme.GLYPH.ok + " shell step " + k),
  ]);
  const said  = [...call(40, "ls", "ok"), ...View.entry_rows(42, "tool", 'read {"path":"a"}'), ...View.entry_rows(43, "work", "[explorer] found it")];
  expect(text(Paint.rows_lines(View.view_acts(v, said), 30))[0]).toBe(SHUT + "Ran a command, read a fil…");
  const glyphs = [Theme.GLYPH.ok, Theme.GLYPH.failed];
  try {
    Theme.TOOL.shell = "$";
    expect(text(Paint.rows_lines(View.view_acts(v, rows), 40))[1]).toBe(lead + Theme.GLYPH.ok + " $ shell bun test");
    delete Theme.TOOL.shell;
    [Theme.GLYPH.ok, Theme.GLYPH.failed] = ["ok", "FAIL"];
    expect(text(Paint.rows_lines(View.view_acts(v, rows), 40)).slice(1, 5).map((l) => l.slice(0, lead.length + 10))).toEqual([lead + "ok   shell", lead + "FAIL shell", lead + "ok   shell", lead + "     shell"]);
  } finally {
    delete Theme.TOOL.shell;
    [Theme.GLYPH.ok, Theme.GLYPH.failed] = glyphs;
  }
  View.view_toggle(v, 3);
  expect(text(Paint.rows_lines(View.view_acts(v, rows), 40))[0]).toBe(OPEN + "Ran 4 commands");
  expect(text(Paint.rows_lines(View.view_acts(v, rows), 40)).filter((l) => l.startsWith(lead))).toEqual([]);
});

// a shut run's lines fit the width whatever they hold: a wide character
// that would cross the edge left out, the "…" after what fits (so a line
// may end a column short); its head so too; at a width under its lead,
// the lead cut as well. A call of any length costs about what a short one
// does: past the width nothing of it is taken apart
test("a shut run's lines never pass the width: wide characters, a width under the lead, a call of any length", () => {
  const v     = View.view_new();
  const rows  = [
    ...View.entry_rows(3, "tool", 'shell {"command":"echo a' + "中".repeat(40) + '"}'),
    ...View.entry_rows(4, "echo", "ok"),
    ...View.entry_rows(5, "tool", '工具 {"emoji":"' + "😀".repeat(30) + '"}'),
  ];
  const lead  = " ".repeat(SHUT.length);
  const lines = Paint.rows_lines(View.view_acts(v, rows), 40);
  expect(text(lines)[1]).toBe(lead + Theme.GLYPH.ok + " shell echo a" + "中".repeat(10) + "…");
  expect(Paint.line_width(lines[1])).toBe(39);
  for (let w = 0; w <= 48; w++) {
    expect(Paint.rows_lines(View.view_acts(v, rows), w).map((l) => Paint.line_width(l)).filter((n) => n > w)).toEqual([]);
  }
  expect(text(Paint.rows_lines(View.view_acts(v, rows), 3))).toEqual([SHUT.slice(0, 2) + "…", "  …", "  …"]);
  const big   = View.view_acts(v, [...View.entry_rows(7, "tool", "shell " + JSON.stringify({ command: "cat > a.txt <<EOF\n" + "lorem ipsum dolor ".repeat(60000) + "\nEOF" })), ...View.entry_rows(8, "echo", "ok")]);
  const start = performance.now();
  for (let k = 0; k < 5; k++) {
    Paint.rows_lines(big, 80);
  }
  expect(performance.now() - start).toBeLessThan(400);
});

// an open block: marked from its top edge to its bottom one; the blocks
// in it each with the gap under it, the smaller, so the innermost holds a
// line; its bar and a summary's gutter and /open tagged
test("an open block is marked over its whole frame, the blocks in it with their gaps; bars, gutters and /open tagged", () => {
  const sum = (id: number): View.Row => ({ $: "Sum", id, n: 1, text: "said " + id, call: null, kind: null });
  const marks: Paint.Mark[] = [];
  const lines = Paint.rows_lines([{ $: "Box", id: 4, n: 2, rows: [sum(4), sum(5)] }], 60, marks);
  const [box, a, b] = marks;
  expect([box.key, box.from, box.to, lines.length]).toEqual(["b4+2", 0, lines.length, lines.length]);
  expect([a.key, a.from, b.key, b.from - a.to, b.to]).toEqual(["b4+1", 1, "b5+1", 0, lines.length - 1]);
  expect(lines[0].find((r) => r.mark !== undefined)?.mark).toEqual({ key: "b4+2", as: "text" });
  const tagged = lines[a.from + 1].filter((r) => r.mark?.key === "b4+1").map((r) => r.x.trim());
  expect(tagged).toEqual(["1x", "/open #4"]);
});

// a recap opened: its pages fold to a line as a run's messages do
test("a recap's pages fold to a line by their key", () => {
  const v    = View.view_new();
  const rows = View.entry_rows(9, "recap", "a\nb\nc");
  View.view_toggle(v, 9);
  View.view_fold(v, "#9");
  const marks: Paint.Mark[] = [];
  const lines = Paint.rows_lines(View.view_acts(v, rows), 60, marks);
  expect(marks.map((m) => m.key)).toEqual(["r9", "#9"]);
  expect(lines[1].map((r) => r.x).join("")).toBe("│ " + SHUT + "recap · 3 lines");
});

// lit by its tags alone: a run's glyph in the accent, its label in the
// ink, its bar heavier in the accent, nothing else; a message in it, its
// glyph and its run's bar beside it (the bar as it was), pressed reversed
test("a mark lit lights its tagged runs alone: a run's glyph, label and heavier bar; a message's glyph and its run's bar, pressed reversed", () => {
  const v = View.view_new();
  View.view_toggle(v, 3);
  View.view_fold(v, "#4");
  const marks: Paint.Mark[] = [];
  const rows  = [...View.entry_rows(3, "tool", 'shell {"command":"ls"}'), ...View.entry_rows(4, "echo", "a\nb")];
  const lines = Paint.rows_lines(View.view_acts(v, rows), 60, marks);
  const [run, , msg] = marks;
  const c     = Draw.draw_tokens().accent;
  const head  = Paint.line_lit(lines[0], run, false);
  expect(head.map((r) => [r.x, r.s.d, r.s.c])).toEqual([[OPEN, false, c], ["Ran a command", false, ""]]);
  const fold  = lines[msg.from];
  expect(Paint.line_lit(fold, run, false).map((r) => r.x).join("")).toBe("┃ " + SHUT + "result · 2 lines");
  const own   = Paint.line_lit(fold, msg, true);
  expect(own.map((r) => [r.x, r.s.d, r.s.c, r.s.v])).toEqual([["│ ", false, c, true], [SHUT, false, c, true], ["result · 2 lines", true, "", false]]);
});
