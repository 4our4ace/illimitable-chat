// Paint test
// ==========
// `bun test Paint.test.ts`. A row's lines are laid out once per width
// and look: the background told again as it was lays nothing out anew,
// another lays all of it out again. A chat laid out from its last row
// up, a few rows at a time, is the chat laid out whole; a block asked
// for is laid out with all under it. A run of work lists its items
// under its line, a line each (what it did · how it ended, cut to the
// width whatever it holds), five at most, then a More line; an open item
// is marked over its line and its rows, nothing inside it marked, its
// line and its bar tagged with its key. An open block is marked over its
// whole frame, the innermost mark the smaller. A recap's pages fold to a
// line. A mark lit lights its tagged runs: a glyph in the accent, a
// label in the ink, a bar heavier; a page its own and its recap's bar
// beside it; pressed, reversed.

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

// a chat of every kind of row: blocks, an open one, runs of work (their
// items done, failed, cut, not known; an open one's rows a summary and a
// call; past five, a More line), messages (one with an image), a caption
function chat(): View.Row[] {
  const sum   = (id: number, n: number): View.Row => ({ $: "Sum", id, n, text: "a summary of what was said " + id, call: null, kind: null });
  const item  = (key: string, text: string, ok: boolean | null, open = false, rows: View.Row[] = []): View.Row => {
    const call = Call.call_parse(text);
    return { $: "Item", key, call, label: Call.call_label(call), outcome: Call.call_outcome(call, ok, "(exit 1 in 1 s)"), ok, open, rows };
  };
  const out: View.Row[] = [View.Cap("The whole chat."), sum(0, 4)];
  for (let id = 4; id < 40; id += 4) {
    const items = [
      item("c#" + (id + 2), 'shell {"command":"bun test"}', true, id % 8 === 0, [sum(id + 2, 1), ...View.entry_rows(id + 2, "tool", 'shell {"command":"bun test"}')]),
      item("c#" + (id + 2) + "b", 'shell {"command":"git push ' + "中".repeat(40) + '"}', false),
      item("c#" + (id + 2) + "c", 'read {"path":"a.log"}', null),
    ];
    out.push({ $: "Box", id, n: 2, rows: [sum(id, 1), sum(id + 1, 1)] });
    out.push({ $: "Act", id: id + 2, text: "Ran a command", rows: id % 8 === 0 ? [...items, { $: "More", id: id + 2, n: 4, open: false, earlier: false }] : items, held: [] });
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
// an open block, a run of work or an open item too, and the rows laid out
// as far as it; a run of work by its key, an item by its own
test("a block's row is found, and the rows laid out as far as it", () => {
  const rows = chat();
  expect(Paint.rows_find(rows, Paint.block_key(0, 4))).toBe(1);
  expect(Paint.rows_find(rows, Paint.block_key(13, 1))).toBe(rows.findIndex((r) => r.$ === "Box" && r.id === 12));
  expect(Paint.rows_find(rows, Paint.block_key(10, 1))).toBe(rows.findIndex((r) => r.$ === "Act" && r.id === 10));
  expect(Paint.rows_find(rows, Paint.block_key(14, 1))).toBe(-1);
  expect(Paint.rows_find(rows, "r14")).toBe(rows.findIndex((r) => r.$ === "Act" && r.id === 14));
  expect(Paint.rows_find(rows, "c#14b")).toBe(rows.findIndex((r) => r.$ === "Act" && r.id === 14));
  expect(Paint.rows_find(rows, "+10")).toBe(rows.findIndex((r) => r.$ === "Act" && r.id === 10));
  expect(Paint.rows_find(rows, Paint.block_key(99, 1))).toBe(-1);
  const laid = Paint.laid_new(rows, 60, 1);
  Paint.laid_up(laid, 0, 1);
  expect(laid.from).toBe(1);
  expect(laid.marks.find((m) => m.key === Paint.block_key(0, 4))).toBeDefined();
  expect(Paint.laid_stale(laid, 60)).toBe(false);
  expect(Paint.laid_stale(laid, 61)).toBe(true);
});

// a run: its line (no mark: it takes no click) over its items, a line
// each; an open item marked over its line and its rows, behind a bar
// under its mark, a gap line inside it its own, nothing inside it marked
// (a click anywhere in it is the item's); its line's runs and its bar
// tagged with its key; the More line marked and tagged with its own
test("an open item is marked over its line and its rows, nothing inside it marked; its line and its bar tagged; the run's line takes no click", () => {
  const v    = View.view_new();
  const rows = [
    ...View.entry_rows(3, "tool", 'shell {"command":"npm test","description":"Run the tests"}'),
    ...View.entry_rows(4, "echo", "ok\n".repeat(1204) + "(exit 0 in 9.1 s)"),
    ...View.entry_rows(5, "tool", 'shell {"command":"ls"}'),
    ...View.entry_rows(6, "echo", "a\n(exit 0 in 0.1 s)"),
  ];
  View.view_item(v, "c#3");
  const marks: Paint.Mark[] = [];
  const lines = Paint.rows_lines(View.view_acts(v, rows), 60, marks);
  const run   = Theme.GLYPH.run + " ";
  const lead  = " ".repeat(run.length);
  expect(marks.map((m) => [m.key, m.item ?? false, m.open, m.from, m.to, m.act ?? false, m.up ?? ""])).toEqual([
    ["c#3", true, true, 1, lines.length - 1, false, ""],
    ["c#5", true, false, lines.length - 1, lines.length, false, ""],
  ]);
  expect(text(lines)[0]).toBe(run + "Ran 2 commands");
  expect(lines[0].every((r) => r.mark === undefined)).toBe(true);
  expect(text(lines)[1]).toBe(lead + Theme.GLYPH.ok + " Run the tests · exit 0");
  expect(lines[1].slice(1).map((r) => r.mark)).toEqual(Array(lines[1].length - 1).fill({ key: "c#3", as: "label" }));
  const inside = lines.slice(2, lines.length - 1);
  expect(inside.map((l) => [l[0].x, l[1].x, l[1].mark])).toEqual(inside.map(() => [lead, "│ ", { key: "c#3", as: "bar" }]));
  expect(text(inside).join("\n")).toContain("npm test");
  expect(text(inside).some((l) => l === lead + "│ ")).toBe(true);
  expect(text(inside).join("\n")).toContain("1204 ok");
  expect(text(lines).at(-1)).toBe(lead + Theme.GLYPH.ok + " ls · exit 0");
  const many  = Array.from({ length: 7 }, (_, k) => View.entry_rows(20 + k, "tool", 'read {"path":"f' + k + '"}')).flat();
  const more: Paint.Mark[] = [];
  const said  = Paint.rows_lines(View.view_acts(v, many), 60, more);
  expect(text(said).slice(-1)).toEqual([lead + "+2 more"]);
  expect(more.at(-1)).toMatchObject({ key: "+20", id: 20, more: true, open: false, from: 6, to: 7 });
  expect(said[6][1].mark).toEqual({ key: "+20", as: "label" });
  View.view_more(v, 20);
  expect(text(Paint.rows_lines(View.view_acts(v, many), 60)).slice(-2)).toEqual([lead + "  Read f6", lead + "show fewer"]);
  expect(text(Paint.rows_lines(View.view_acts(v, many, v, true), 60))[1]).toBe(lead + "show fewer");
  View.view_more(v, 20);
  expect(text(Paint.rows_lines(View.view_acts(v, many, v, true), 60)).slice(1, 3)).toEqual([lead + "+2 earlier", lead + "  Read f2"]);
});

// a run lists its items under its line, a line each from its words on:
// how each ended (GLYPH.ok; GLYPH.failed in the error's color; not
// known: as wide, blank; the words line up whatever the theme makes the
// marks), the theme's mark for its tool if any, what it did and how it
// ended, its control characters dropped; what it did cut to the room its
// outcome leaves ("…" where); no raw input. Past five, a More line
test("a run lists its items, a line each: how each ended, what it did cut to the room its outcome leaves; past five, a More line", () => {
  const v     = View.view_new();
  const call  = (id: number, command: string, out: string | null, description?: string) => [
    ...View.entry_rows(id, "tool", "shell " + JSON.stringify({ command, description })),
    ...(out === null ? [] : View.entry_rows(id + 1, "echo", out)),
  ];
  const rows  = [...call(3, "bun test", "ok\n(exit 0 in 1 s)"), ...call(5, "git push \x1b[31m--tags", View.FAILED + "rejected\n(exit 1 in 1 s)"), ...call(7, "echo " + "x".repeat(80), "x\n(exit 0 in 1 s)", "Print a long line of x, to see where it is cut"), ...call(9, "ls", null)];
  const marks: Paint.Mark[] = [];
  const lines = Paint.rows_lines(View.view_acts(v, rows), 40, marks);
  const run   = Theme.GLYPH.run + " ";
  const lead  = " ".repeat(run.length);
  expect(text(lines)).toEqual([
    run + "Ran 4 commands",
    lead + Theme.GLYPH.ok + " bun test · exit 0",
    lead + Theme.GLYPH.failed + " git push [31m--tags · exit 1",
    lead + Theme.GLYPH.ok + " Print a long line of x, to… · exit 0",
    lead + "  ls",
  ]);
  expect(lines.every((l) => Paint.line_width(l) <= 40)).toBe(true);
  expect(marks.map((m) => [m.key, m.from, m.to])).toEqual([["c#3", 1, 2], ["c#5", 2, 3], ["c#7", 3, 4], ["c#9", 4, 5]]);
  expect(lines[2][1].s.c).toBe(Draw.draw_tokens().error);
  expect(lines.slice(1).every((l) => l.slice(1).every((r) => r.mark?.key === marks[lines.indexOf(l) - 1].key && r.s.d !== false || r.s.c === Draw.draw_tokens().error))).toBe(true);
  const many  = Array.from({ length: 8 }, (_, k) => call(20 + 2 * k, "step " + k, "ok\n(exit 0 in 1 s)")).flat();
  expect(text(Paint.rows_lines(View.view_acts(v, many), 40)).slice(1)).toEqual([
    ...[0, 1, 2, 3, 4].map((k) => lead + Theme.GLYPH.ok + " step " + k + " · exit 0"),
    lead + "+3 more",
  ]);
  const said  = [...call(40, "ls", "ok"), ...View.entry_rows(42, "tool", 'read {"path":"a"}'), ...View.entry_rows(43, "work", "[explorer] found it")];
  expect(text(Paint.rows_lines(View.view_acts(v, said), 29))[0]).toBe(run + "Ran a command, read a file…");
  const glyphs = [Theme.GLYPH.ok, Theme.GLYPH.failed, Theme.GLYPH.run];
  try {
    Theme.TOOL.shell = "$";
    expect(text(Paint.rows_lines(View.view_acts(v, rows), 40))[1]).toBe(lead + Theme.GLYPH.ok + " $ bun test · exit 0");
    delete Theme.TOOL.shell;
    Theme.TOOL.mcp__github__get_issue = "◆";
    View.view_item(v, "c#60");
    const issue = text(Paint.rows_lines(View.view_acts(v, View.entry_rows(60, "tool", 'mcp__github__get_issue {"id":4}')), 40));
    View.view_item(v, "c#60");
    expect([issue[0], issue[1], issue.slice(2).some((l) => l.includes("│  ◆ github: get_issue 4"))]).toEqual([run + "Called github: get_issue", lead + "  ◆ github: get_issue 4", true]);
    delete Theme.TOOL.mcp__github__get_issue;
    [Theme.GLYPH.ok, Theme.GLYPH.failed, Theme.GLYPH.run] = ["ok", "FAIL", "*"];
    expect(text(Paint.rows_lines(View.view_acts(v, rows), 40)).map((l) => l.slice(0, 12))).toEqual(["* Ran 4 comm", "  ok   bun t", "  FAIL git p", "  ok   Print", "       ls"]);
  } finally {
    delete Theme.TOOL.shell;
    delete Theme.TOOL.mcp__github__get_issue;
    [Theme.GLYPH.ok, Theme.GLYPH.failed, Theme.GLYPH.run] = glyphs;
  }
});

// a run's lines fit the width whatever they hold: a wide character that
// would cross the edge left out, the "…" after what fits (so a line may
// end a column short), the outcome kept whole while it fits; its line so
// too, and an open item's rows; at a width under its lead, the lead cut
// as well; with no room for what it did, how it ended alone, no " · "
// before it. A call of any
// length costs about what a short one does: past the width nothing of it
// is taken apart, and its label is made once
test("a run's lines never pass the width: wide characters, a width under the lead, a call of any length", () => {
  const v     = View.view_new();
  const rows  = [
    ...View.entry_rows(3, "tool", 'shell {"command":"echo ab' + "中".repeat(40) + '"}'),
    ...View.entry_rows(4, "echo", "ok\n(exit 0 in 1 s)"),
    ...View.entry_rows(5, "tool", '工具 {"emoji":"' + "😀".repeat(30) + '"}'),
  ];
  const lead  = " ".repeat((Theme.GLYPH.run + " ").length);
  const lines = Paint.rows_lines(View.view_acts(v, rows), 40);
  expect(text(lines)[1]).toBe(lead + Theme.GLYPH.ok + " echo ab" + "中".repeat(9) + "… · exit 0");
  expect(Paint.line_width(lines[1])).toBe(39);
  expect(text(lines)[2]).toBe(lead + "  工具 " + "😀".repeat(15) + "…");
  for (let w = 0; w <= 48; w++) {
    expect(Paint.rows_lines(View.view_acts(v, rows), w).map((l) => Paint.line_width(l)).filter((n) => n > w)).toEqual([]);
  }
  View.view_item(v, "c#3");
  for (let w = 0; w <= 48; w++) {
    expect(Paint.rows_lines(View.view_acts(v, rows), w).map((l) => Paint.line_width(l)).filter((n) => n > w)).toEqual([]);
  }
  View.view_item(v, "c#3");
  expect(text(Paint.rows_lines(View.view_acts(v, rows), 3))).toEqual([Theme.GLYPH.run + " …", "  …", "  …"]);
  const lost  = View.view_acts(v, [...View.entry_rows(9, "tool", 'shell {"command":"nope"}'), ...View.entry_rows(10, "echo", View.FAILED + "nope: not found\n(exit 127 in 0 s)")]);
  expect(text(Paint.rows_lines(lost, 12))[1]).toBe(lead + Theme.GLYPH.failed + " exit 127");
  expect(text(Paint.rows_lines(lost, 16))[1]).toBe(lead + Theme.GLYPH.failed + " … · exit 127");
  const big   = View.view_acts(v, [...View.entry_rows(7, "tool", "shell " + JSON.stringify({ command: "cat > a.txt <<EOF\n" + "lorem ipsum dolor ".repeat(60000) + "\nEOF" })), ...View.entry_rows(8, "echo", "ok")]);
  expect(text(Paint.rows_lines(big, 80))[1]).toBe(lead + Theme.GLYPH.ok + " cat > a.txt <<EOF …");
  const start = performance.now();
  for (let k = 0; k < 5; k++) {
    Paint.rows_lines(View.view_acts(v, [...View.entry_rows(7, "tool", "shell " + JSON.stringify({ command: "cat > a.txt <<EOF\n" + "lorem ipsum dolor ".repeat(60000) + "\nEOF" })), ...View.entry_rows(8, "echo", "ok")]), 80);
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

// a recap opened: its pages fold to a line by their key
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

// lit by its tags alone: a recap's glyph in the accent, its label in the
// ink, its bar heavier in the accent, nothing else; a page in it, its
// glyph and its recap's bar beside it (the bar as it was); an item's
// line in the ink (a failed one's mark keeping its color), its bar
// heavier in the accent; pressed reversed
test("a mark lit lights its tagged runs alone: a recap's glyph, label and heavier bar, a page's glyph and its recap's bar; an item's line and heavier bar; pressed reversed", () => {
  const v = View.view_new();
  View.view_toggle(v, 3);
  View.view_fold(v, "#4");
  const marks: Paint.Mark[] = [];
  const rows  = [...View.entry_rows(3, "recap", "a\nb"), ...View.entry_rows(4, "recap", "c\nd")];
  const lines = Paint.rows_lines(View.view_acts(v, rows), 60, marks);
  const [rule, , page] = marks;
  const c     = Draw.draw_tokens().accent;
  const head  = Paint.line_lit(lines[0], rule, false).filter((r) => r.mark !== undefined);
  expect(head.map((r) => [r.x, r.s.d, r.s.c])).toEqual([[OPEN, false, c], ["Compaction", false, ""]]);
  const fold  = lines[page.from];
  expect(Paint.line_lit(fold, rule, false).map((r) => r.x).join("")).toBe("┃ " + SHUT + "recap · 2 lines");
  const own   = Paint.line_lit(fold, page, true);
  expect(own.map((r) => [r.x, r.s.d, r.s.c, r.s.v])).toEqual([["│ ", false, c, true], [SHUT, false, c, true], ["recap · 2 lines", true, "", false]]);
  const items = [...View.entry_rows(5, "tool", 'shell {"command":"false"}'), ...View.entry_rows(6, "echo", View.FAILED + "(exit 1 in 0.1 s)")];
  View.view_item(v, "c#5");
  const said: Paint.Mark[] = [];
  const call  = Paint.rows_lines(View.view_acts(v, items), 60, said);
  const item  = said[0];
  const line  = Paint.line_lit(call[1], item, false);
  expect(line.slice(1).map((r) => [r.x, r.s.d, r.s.c])).toEqual([[Theme.GLYPH.failed + " ", false, Draw.draw_tokens().error], ["false", false, ""], [" · exit 1", false, ""]]);
  expect(line[0].s.d).toBe(false);
  const bar   = Paint.line_lit(call[2], item, true);
  expect(bar.slice(0, 2).map((r) => [r.x, r.s.c, r.s.v])).toEqual([[call[2][0].x, "", false], ["┃ ", c, true]]);
});
