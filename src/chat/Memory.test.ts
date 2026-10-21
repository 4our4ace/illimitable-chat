// Memory test
// ===========
// `bun test Memory.test.ts`. The cut: a turn's call gets the messages from
// it whole, the view's lines before it; it holds while they fit, so each
// call starts as the one before did, and past the call's size moves on
// till they fill half (the oldest fold into the view); kept on disk. The
// recent messages come in blocks, one marked in place of the view's. A
// chat in the files before SQLite is read in once (a gzipped day, an
// act's line, a line cut short, a page cut off; a message lacking its kind
// or date, a day that won't unpack), its files kept aside; one whose data
// won't go in, kept aside too, the chat starting empty, saying why; an
// import a crash cut is redone (its file swept, a running one's left), a
// move finished; illis started at once read it in once. Closed, the chat
// is one file. /compact counts a user's message of many pages once. An
// agent spawned as the user's is named after it; a freed name is used
// again, each log its own; one named main, the chat's own caller, is
// refused. A leaf's summary starts with its message's kind, the
// compactor's or added.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as zlib from "node:zlib";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-memory-");
process.env.ILLI_DIR = DIR;

const { Import } = await import("./Import.ts");
const { Memory } = await import("./Memory.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a chat whose summaries never build (held): no call is made
function chat(name: string, n: number) {
  const mem = Memory.load(DIR + "/" + name, () => ({}) as any);
  mem.hold = true;
  Memory.push(mem, Array.from({ length: n }, (_, k) => ({ kind: "user" as const, text: "message " + k + " " + "x".repeat(80) })));
  return mem;
}

const size = (mem: any, a: number, b: number) => Array.from({ length: b - a }, (_, k) => Memory.message(mem, a + k)!.size).reduce((x, y) => x + y, 0);

test("the cut holds while the messages fit, then moves on till they fill half, and holds again", () => {
  const mem = chat("cut", 30);
  const high = 40 * size(mem, 0, 1);
  expect(Memory.cutoff(mem, high)).toBe(0);
  Memory.push(mem, Array.from({ length: 15 }, (_, k) => ({ kind: "illi" as const, text: "reply " + k + " " + "y".repeat(78) })));
  const cut = Memory.cutoff(mem, high);
  expect(cut).toBeGreaterThan(0);
  expect(size(mem, cut, mem.count)).toBeLessThanOrEqual(high / 2);
  expect(size(mem, cut - 1, mem.count)).toBeGreaterThan(high / 2);
  Memory.push(mem, [{ kind: "user", text: "one more" }]);
  expect(Memory.cutoff(mem, high)).toBe(cut);
  expect(Memory.load(DIR + "/cut", () => ({}) as any).cut).toBe(cut);
});

test("a turn's chat: the messages from the cut whole, in blocks, the last whole one marked instead of the view's", () => {
  const mem = chat("recent", 10);
  const blocks = Memory.chat(mem, 2, 9);
  const text = blocks.map((b) => b.text).join("");
  expect(text).toContain("<recent>\n2|user: message 2 x");
  expect(text).toContain("8|user: message 8");
  expect(text).not.toContain("9|user");
  expect(text.endsWith("</recent>\n")).toBe(true);
  expect(blocks.filter((b) => b.mark).length).toBe(1);
  expect(blocks.find((b) => b.mark)!.text).toContain("5|user");
  expect(Memory.chat(mem, 9, 9).filter((b) => b.mark).length).toBeLessThanOrEqual(1);
});

// a chat in the files before SQLite: two messages in a gzipped day; then
// an act's line, two messages (one naming an act), a page cut off (more)
// and a line cut short; nodes (one built twice, one past the messages);
// its state; an agent's logs, an old untagged one and a newer; an index
// that would mislead; an image
function old(name: string): string {
  const dir  = DIR + "/" + name;
  const date = "2026-10-20T10:00:00.000Z";
  const msg  = (i: number, text: string, more?: boolean) => JSON.stringify({ i, kind: "user", text, size: 6 + text.length, date, ...(more ? { more } : {}) });
  for (const sub of ["main", "tree", "docs/agent", "docs/images"]) {
    fs.mkdirSync(dir + "/" + sub, { recursive: true });
  }
  fs.writeFileSync(dir + "/main/2026-09-01.jsonl.gz", zlib.gzipSync(msg(0, "zero") + "\n" + msg(1, "one") + "\n"));
  fs.writeFileSync(dir + "/main/2026-10-20.jsonl", [JSON.stringify({ act: "a1", ans: { ok: true } }), JSON.stringify({ ...JSON.parse(msg(2, "two")), act: "a2" }), msg(3, "three"), msg(4, "four, cut", true), '{"i": 5, "kind": "us'].join("\n"));
  fs.writeFileSync(dir + "/tree/2026-10-20.jsonl", [{ l: 0, i: 0, text: "zero, first" }, { l: 1, i: 0, text: "zero and one" }, { l: 0, i: 0, text: "zero, again" }, { l: 0, i: 6, text: "past the end" }].map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(dir + "/view.json", JSON.stringify({ parts: [[1, 0], [0, 2], [0, 3]], batch: false, pick: null, goal: "ship it", cut: 2, show: 2, top: 0, main: [1, 9], tree: [1, 9] }));
  fs.writeFileSync(dir + "/main.index", Buffer.alloc(16 * 9, 7));
  fs.writeFileSync(dir + "/docs/agent/Scout.jsonl", JSON.stringify({ i: 0, kind: "note", text: "older", size: 11, date }) + "\n");
  fs.writeFileSync(dir + "/docs/agent/Scout.mf0abc.jsonl", JSON.stringify({ i: 0, kind: "note", text: "newer", size: 11, date }) + "\n");
  fs.writeFileSync(dir + "/docs/images/0123456789abcdef.png", "png");
  return dir;
}

test("a chat in the files before SQLite is read in once: its messages, nodes, state and agents' logs; the files kept aside", () => {
  const dir = old("old");
  const mem = Memory.load(dir, () => ({}) as any);
  mem.hold = true;
  expect(mem.count).toBe(4);
  expect(Array.from({ length: 4 }, (_, i) => Memory.message(mem, i)!.text)).toEqual(["zero", "one", "two", "three"]);
  expect(Memory.message(mem, 2)).toEqual({ i: 2, kind: "user", text: "two", size: 9, date: "2026-10-20T10:00:00.000Z" });
  expect([Memory.node(mem, { l: 1, i: 0 }), Memory.node(mem, { l: 0, i: 0 }), Memory.node(mem, { l: 0, i: 6 })]).toEqual(["zero and one", "zero, again", null]);
  expect([mem.goal, mem.cut, mem.view.parts]).toEqual(["ship it", 2, [{ l: 1, i: 0 }, { l: 0, i: 2 }, { l: 0, i: 3 }]]);
  expect(Memory.agent(mem, "Scout")!.map((r) => r.text)).toEqual(["newer"]);
  expect(Memory.agent(mem, "Scout.mf0abc")!.map((r) => r.text)).toEqual(["newer"]);
  expect(fs.readdirSync(dir).sort()).toEqual(["before-sqlite", "docs", "memory.sqlite", "memory.sqlite-shm", "memory.sqlite-wal"]);
  expect(fs.readdirSync(dir + "/docs")).toEqual(["images"]);
  expect(fs.readdirSync(dir + "/before-sqlite").sort()).toEqual(["docs", "main", "main.index", "tree", "view.json"]);
  Memory.push(mem, [{ kind: "illi", text: "after" }]);
  Memory.stop(mem);
  const again = Memory.load(dir, () => ({}) as any);
  again.hold = true;
  expect([again.count, Memory.message(again, 4)!.text, again.goal]).toEqual([5, "after", "ship it"]);
  expect(fs.readdirSync(dir + "/before-sqlite/main").sort()).toEqual(["2026-09-01.jsonl.gz", "2026-10-20.jsonl"]);
  Memory.stop(again);
});

test("an import a crash cut is redone, its file swept, a running one's left; a move a crash cut is finished; closed, the chat is one file", () => {
  const dir = old("crash");
  const gone = Bun.spawnSync(["true"]).pid;
  const running = "memory.sqlite." + process.ppid + ".new";
  fs.writeFileSync(dir + "/memory.sqlite." + gone + ".new", "half an import");
  fs.writeFileSync(dir + "/" + running, "another illi's, at work");
  const mem = Memory.load(dir, () => ({}) as any);
  mem.hold = true;
  expect(mem.count).toBe(4);
  Memory.stop(mem);
  expect(fs.readdirSync(dir).sort()).toEqual(["before-sqlite", "docs", "memory.sqlite", running]);
  fs.rmSync(dir + "/" + running);
  fs.writeFileSync(dir + "/view.json", "{}");
  Memory.stop(Memory.load(dir, () => ({}) as any));
  expect(fs.existsSync(dir + "/view.json")).toBe(false);
  expect(fs.readdirSync(dir + "/before-sqlite").sort()).toEqual(["docs", "main", "main.index", "tree", "view.json", "view.json.1"]);
});

test("an old chat with a message lacking its kind, one lacking its date, and a gzipped day that won't unpack still reads in", () => {
  const dir = old("odd");
  const date = "2026-10-20T10:00:00.000Z";
  fs.writeFileSync(dir + "/main/2026-08-01.jsonl.gz", "not gzip at all");
  fs.writeFileSync(dir + "/main/2026-10-21.jsonl", [{ i: 4, kind: "user", text: "four, whole", size: 15, date }, { i: 5, text: "no kind", size: 7, date }, { i: 6, kind: "illi", text: "no date" }].map((r) => JSON.stringify(r)).join("\n") + "\n");
  const mem = Memory.load(dir, () => ({}) as any);
  mem.hold = true;
  expect(mem.count).toBe(7);
  expect([Memory.message(mem, 0)!.text, Memory.message(mem, 4)!.text]).toEqual(["zero", "four, whole"]);
  expect(Memory.message(mem, 5)).toMatchObject({ kind: "note", text: "(a message here didn't read in from the files before SQLite)" });
  expect(Memory.message(mem, 6)).toMatchObject({ kind: "illi", text: "no date", date: "2026-10-21T00:00:00.000Z" });
  Memory.stop(mem);
});

test("an old chat whose data still won't go in starts empty, its files kept, saying why", () => {
  const dir = old("refused");
  const fill = Import.fill;
  (Import as any).fill = () => {
    throw new Error("a shape never seen");
  };
  try {
    const mem = Memory.load(dir, () => ({}) as any);
    mem.hold = true;
    expect(mem.count).toBe(0);
    Memory.stop(mem);
  } finally {
    (Import as any).fill = fill;
  }
  expect(Import.told.splice(0)).toEqual(["The chat from before SQLite didn't read in (a shape never seen): this one starts empty, and the old files are kept in " + dir + "/before-sqlite."]);
  expect(fs.readdirSync(dir + "/before-sqlite").sort()).toEqual(["docs", "main", "main.index", "tree", "view.json"]);
});

test("illis started at once read the old chat in once, each opening it whole", async () => {
  const dir = old("race");
  const at = Date.now() + 1500;
  const script = DIR + "/race.ts";
  fs.writeFileSync(script, `
    const { Memory } = await import(${JSON.stringify(import.meta.dir + "/Memory.ts")});
    while (Date.now() < ${at}) {}
    const mem = Memory.load(${JSON.stringify(dir)}, () => ({}));
    mem.hold = true;
    console.log(mem.count + " " + Memory.message(mem, 3).text);
    Memory.stop(mem);
    process.exit(0);
  `);
  const runs = Array.from({ length: 6 }, () => Bun.spawn(["bun", script], { env: { ...process.env, ILLI_DIR: DIR }, stdout: "pipe", stderr: "pipe" }));
  const outs = await Promise.all(runs.map(async (p) => [await new Response(p.stdout).text(), (await new Response(p.stderr).text()).replace(/^illi: skipped a line .*\n/gm, ""), await p.exited]));
  expect(outs).toEqual(Array.from({ length: 6 }, () => ["4 three\n", "", 0]));
  expect(fs.readdirSync(dir).sort()).toEqual(["before-sqlite", "docs", "memory.sqlite"]);
  expect(fs.readdirSync(dir + "/before-sqlite").sort()).toEqual(["docs", "main", "main.index", "tree", "view.json"]);
}, 20000);

test("the screen folds with the cut as it moves on by itself, and stays behind a cut moved for it", () => {
  const mem  = chat("show", 40);
  const high = 20 * size(mem, 0, 1);
  mem.cut    = Memory.kept(mem, Infinity);
  expect(mem.cut).toBe(38);
  expect(mem.show).toBe(0);
  expect(Memory.cutoff(mem, 1e9)).toBe(38);
  expect(mem.show).toBe(0);
  Memory.push(mem, Array.from({ length: 40 }, (_, k) => ({ kind: "illi" as const, text: "reply " + k + " " + "y".repeat(78) })));
  const cut = Memory.cutoff(mem, high);
  expect(cut).toBeGreaterThan(38);
  expect(mem.show).toBe(cut);
});

test("/compact keeps a user's message of many pages whole, counting it once", () => {
  const mem = chat("pages", 4);
  Memory.push(mem, [{ kind: "user", text: "big ".repeat(20000) }, { kind: "illi", text: "read it" }]);
  const first = mem.count - 4;
  expect(Memory.message(mem, first)!.more).toBe(true);
  expect(Memory.kept(mem, Infinity)).toBe(3);
  expect(Memory.message(mem, first - 1)!.text).toStartWith("message 3");
});

test("an agent spawned as the user's is named after it, numbered while one so named is taken; a freed name is used again, each log its own; main is refused", () => {
  const mem   = chat("agents", 1);
  const taken = new Set<string>();
  const spawn = (own: string | null) => {
    const name = Memory.agent_new(mem, own, (n) => taken.has(n));
    taken.add(name);
    return name;
  };
  expect([1, 2, 3].map(() => spawn("reviewer"))).toEqual(["reviewer", "reviewer-2", "reviewer-3"]);
  Memory.agent_push(mem, "reviewer", "note", "the first");
  const first = Memory.agent_log(mem, "reviewer")!;
  taken.clear();
  expect(spawn("reviewer")).toBe("reviewer");
  Memory.agent_push(mem, "reviewer", "note", "the second");
  expect(Memory.agent_log(mem, "reviewer")).not.toBe(first);
  expect(Memory.agent(mem, "reviewer")!.map((r) => r.text)).toEqual(["the second"]);
  expect(Memory.agent(mem, first)!.map((r) => r.text)).toEqual(["the first"]);
  expect(Memory.agent(Memory.load(DIR + "/agents", () => ({}) as any), "reviewer")!.map((r) => r.text)).toEqual(["the second"]);
  expect(spawn("1st/../x")).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
  expect(spawn(null)).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
  expect(Memory.agent(mem, "../reviewer")).toBeNull();
  expect(() => spawn("main")).toThrow("Rename the agent's file (main.md)");
  expect(spawn("Main")).toBe("Main");
});

test("a leaf's summary starts with its message's kind, added where the compactor left it out; a merge's stays as it is", () => {
  expect(Memory.tagged(0, "user: Notes for later: launch moves to April 14", "Project notes: launch Apr 14")).toBe("user: Project notes: launch Apr 14");
  expect(Memory.tagged(0, "tool: shell {\"command\":\"ls\"}", "tool: shell ls")).toBe("tool: shell ls");
  expect(Memory.tagged(0, "tool: Bash {}", "echo: no output")).toBe("echo: no output");
  expect(Memory.tagged(1, "user: a\nilli: b", "a then b")).toBe("a then b");
  expect(Memory.bare("Merged line: user asked for a file")).toBe("user asked for a file");
  expect(Memory.bare("Line: done")).toBe("done");
  expect(Memory.bare("line 42: the bug")).toBe("line 42: the bug");
  expect(Memory.bare("user: Summary: none yet")).toBe("user: Summary: none yet");
});
