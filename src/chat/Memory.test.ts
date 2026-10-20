// Memory test
// ===========
// `bun test Memory.test.ts`. The cut: a turn's call gets the messages from
// it whole, the view's lines before it; it holds while they fit, so each
// call starts as the one before did, and past the call's size moves on
// till they fill half (the oldest fold into the view); kept on disk. The
// recent messages come in blocks, one marked in place of the view's. An
// older chat's act lines still read; old days are gzipped daily. /compact
// counts a user's message of many pages once. An agent spawned as the
// user's is named after it; a freed name is used again, each log its own;
// one named main, the chat's own caller, is refused.

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

test("a month-old day's file is gzipped: its lines read the same, open, from an index made anew, and written to again", async () => {
  const mem   = chat("pack", 12);
  const texts = (m: any, n: number) => Array.from({ length: n }, (_, k) => Memory.message(m, k)!.text);
  const kept  = texts(mem, 12);
  expect(await Memory.pack(mem, Date.now() + 40 * 864e5)).toBeGreaterThan(0);
  expect(fs.readdirSync(DIR + "/pack/main").every((f) => f.endsWith(".jsonl.gz"))).toBe(true);
  expect(texts(mem, 12)).toEqual(kept);
  fs.rmSync(DIR + "/pack/main.index");
  const again = Memory.load(DIR + "/pack", () => ({}) as any);
  again.hold = true;
  expect(again.count).toBe(12);
  expect(texts(again, 12)).toEqual(kept);
  Memory.push(again, [{ kind: "user", text: "after" }]);
  expect(texts(again, 13)).toEqual([...kept, "after"]);
});

test("an older chat's lines naming acts read as any other, the acts ignored", () => {
  chat("acts", 2);
  const day  = fs.readdirSync(DIR + "/acts/main")[0];
  const date = new Date().toISOString();
  const old  = [{ i: 2, kind: "user", text: "said with an act", size: 22, date, act: "a1" }, { act: "a2", ans: { ok: true } }, { i: 3, kind: "illi", text: "after", size: 11, date }];
  fs.appendFileSync(DIR + "/acts/main/" + day, old.map((r) => JSON.stringify(r) + "\n").join(""));
  fs.rmSync(DIR + "/acts/main.index");
  const again = Memory.load(DIR + "/acts", () => ({}) as any);
  again.hold = true;
  expect(again.count).toBe(4);
  expect(Memory.message(again, 2)!.text).toBe("said with an act");
  expect(Memory.message(again, 3)!.text).toBe("after");
});

test("old days are gzipped daily while the chat is open", () => {
  const every = setInterval;
  const set: Array<[() => void, number]> = [];
  globalThis.setInterval = ((go: () => void, ms: number) => (set.push([go, ms]), every(go, 2 ** 30))) as any;
  try {
    chat("daily", 1);
  } finally {
    globalThis.setInterval = every;
  }
  expect(set.map(([, ms]) => ms)).toEqual([864e5]);
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
