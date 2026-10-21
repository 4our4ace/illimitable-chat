// Memory test
// ===========
// `bun test Memory.test.ts`. The cut: a turn's call gets the messages from
// it whole, the view's lines before it; it holds while they fit, so each
// call starts as the one before did, and past the call's size moves on
// till they fill half (the oldest fold into the view); kept on disk. The
// recent messages come in blocks, one marked in place of the view's.
// Closed, the chat is one file. /compact counts a user's message of many
// pages once. An agent spawned as the user's is named after it; a freed
// name is used again, each log its own; one named main, the chat's own
// caller, is refused. A leaf's summary starts with its message's kind,
// the compactor's or added.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-memory-");
process.env.ILLI_DIR = DIR;

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

test("closed, the chat is one file", () => {
  const mem = chat("closed", 3);
  Memory.stop(mem);
  expect(fs.readdirSync(DIR + "/closed")).toEqual(["memory.sqlite"]);
});

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
