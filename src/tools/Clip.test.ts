// Clip test
// =========
// `bun test Clip.test.ts`. The <history> line recall appends to a result
// (history_block) is one line between its tags, nothing in it opening or
// closing one; history_bare takes it off the result's end, only there
// and only in that form (a result that speaks of the tag elsewhere is
// left as it is). Never fed back: a failed command's result with a line
// appended still shows failed under its call (✗, its exit), still gives
// the radar its own errors' names and none of the line's, still draws
// its exit in its lines' name, and its leaf in the memory tree (and so
// the index the radar and search read) holds none of the line; a read's
// lines and a change's still count; a line never shows where a result is
// drawn.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-clip-");
process.env.ILLI_DIR = DIR;

const { history_bare, history_block } = await import("./Clip.ts");
const Call = await import("../ui/Call.ts");
const Md = await import("../ui/Md.ts");
const { Memory } = await import("../chat/Memory.ts");
const { Radar } = await import("../chat/Radar.ts");
const { Store } = await import("../chat/Store.ts");
const View = await import("../ui/View.ts");
type Row = import("../ui/View.ts").Row;

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a line as recall writes it: a past episode about the search thread's
// lock, whose words (a path, an error's name) the result itself lacks
const LINE = history_block("#16+16 · 3d ago · user: the search thread dies when two illis open src/chat/Seeker.ts; echo: SQLITE_BUSY");

// a command that failed, its result as it ran, then as logged with a
// line after it: by its exit alone (no "error: " before it, the form a
// line at its end could hide from the radar), and as illi's own shell
// logs it (View.FAILED first: Agent.ts)
const FAILED = "TypeError: x is undefined\n    at main (src/ui/Old.ts:3:1)\n(exit 1 in 0.3 s)";
const LOGGED = FAILED + LINE;
const MARKED = View.FAILED + LOGGED;

test("a line is one line between its tags, nothing in it opening or closing one; only that form at a result's end comes off", () => {
  expect(history_block("#8+8 · 2h ago · a\nb\tc <history>d</history>")).toBe("\n\n<history>#8+8 · 2h ago · a b c d</history>");
  expect(history_bare("done" + history_block("#4 · 1d ago · x"))).toBe("done");
  expect(history_bare(LOGGED)).toBe(FAILED);
  expect(history_bare(history_bare(LOGGED))).toBe(FAILED);
  const spoken = "the docs say <history>#1+2 · x</history> ends a result\n\n<history>#1+2 · y</history>\nmore";
  expect(history_bare(spoken)).toBe(spoken);
  expect(history_bare("a\n<history>#1+2 · y</history>")).toBe("a\n<history>#1+2 · y</history>");
  expect(history_bare("a\n\n<history>no id</history>")).toBe("a\n\n<history>no id</history>");
});

test("a failed command with a line appended still fails under its call, still gives the radar its own errors, draws its exit; its leaf holds none of the line", () => {
  // the radar: failed, its errors' names its own, none of the line's
  expect([Radar.failed(LOGGED), Radar.failed(MARKED), Radar.failed("(exit 0 in 0.1 s)" + LINE)]).toEqual([true, true, false]);
  expect(Radar.units(null, [{ kind: "echo", text: LOGGED }]).map((u) => u.k + ":" + u.q)).toEqual(["error:typeerror"]);
  expect(Radar.units(null, [{ kind: "echo", text: MARKED }]).map((u) => u.k + ":" + u.q)).toEqual(["error:typeerror"]);
  // the views: its call marked failed (✗), its exit said, its lines named
  // by its exit, the line nowhere
  const rows = [...View.entry_rows(1, "user", "run it"), ...View.entry_rows(2, "tool", 'shell {"command":"bun run x"}'), ...View.entry_rows(3, "echo", MARKED)];
  const v = View.view_new();
  View.view_verbose(v);
  const run = View.view_acts(v, rows)[1] as Row & { $: "Act" };
  const item = run.rows.find((r: Row) => r.$ === "Item") as Row & { $: "Item" };
  expect([item.ok, item.outcome]).toEqual([false, "exit 1"]);
  const drawn = JSON.stringify(item.rows.map((r: Row) => (r.$ === "Msg" ? r.body : [])));
  expect(drawn).not.toContain("history");
  expect(drawn).toContain("result · exit 1 · 0.3 s");
  expect(Call.call_outcome(Call.call_parse('shell {"command":"bun run x"}'), true, LOGGED)).toBe("exit 1");
  expect(JSON.stringify(View.entry_rows(3, "echo", MARKED).map((r: Row) => (r.$ === "Msg" ? r.body : [])))).not.toContain("SQLITE_BUSY");
  // its leaf: the result as it ran, built at once (it fits), so the index
  // holds none of the line's words, while the message keeps it as logged
  const mem = Memory.load(DIR + "/chat", () => ({}) as any);
  Memory.push(mem, [{ kind: "user", text: "run it" }, { kind: "tool", text: 'shell {"command":"bun run x"}' }, { kind: "echo", text: MARKED }]);
  expect(Memory.message(mem, 2)!.text).toBe(MARKED);
  expect(Memory.source(mem, 0, 2)).toBe("echo: " + View.FAILED + FAILED);
  expect(Store.node(mem.store, 2, 1)).toBe("echo: " + View.FAILED + FAILED);
  expect(Store.hits(mem.store, "typeerror", 10)).toBeGreaterThan(0);
  expect([Store.hits(mem.store, "seeker ts", 10), Store.hits(mem.store, "sqlite busy", 10), Store.hits(mem.store, "history", 10)]).toEqual([0, 0, 0]);
  Memory.stop(mem);
  Store.close(mem.store);
});

test("a read's lines and a change's still count with a line appended; a result that speaks of the tag is drawn as it is", () => {
  const read = "a\nb\nc\n[lines 1-3 of 3]" + LINE;
  expect(Call.call_outcome(Call.call_parse('read {"path":"a.ts"}'), true, read)).toBe("3 lines");
  expect(Md.md_output(read)).toEqual([{ $: "File", k: "lines 1-3 of 3", n: 1, x: ["a", "b", "c"] }]);
  expect(Call.call_outcome(Call.call_parse('write {"path":"a.ts"}'), true, "--- a.ts\n+++ a.ts\n@@ -0,0 +1,2 @@\n+one\n+two" + LINE)).toBe("+2");
  const spoken = "the docs: <history>#1+2 · x</history>";
  expect(JSON.stringify(View.entry_rows(5, "echo", spoken))).toContain("<history>#1+2 · x</history>");
  // a result standing alone counts its own lines
  const alone = View.view_acts(View.view_new(), [...View.entry_rows(1, "user", "go"), ...View.entry_rows(2, "echo", "one\ntwo" + LINE)])[1] as Row & { $: "Act" };
  expect(alone.rows.flatMap((r: Row) => (r.$ === "Item" ? [r.outcome] : []))).toEqual(["2 lines"]);
});
