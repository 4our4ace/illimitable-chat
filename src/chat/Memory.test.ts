// Memory test
// ===========
// `bun test Memory.test.ts`. The cut: a turn's call gets the messages from
// it whole, the view's lines before it; it holds while they fit, so each
// call starts as the one before did, and past the call's size moves on
// till they fill half (the oldest fold into the view); kept on disk. The
// recent messages come in blocks, one marked in place of the view's. An
// agent spawned as the user's is named after it.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-memory-");
process.env.ILLI_DIR = DIR;

const { Memory } = await import("./Memory.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a chat whose summaries never build (its side held): no call is made
function chat(name: string, n: number) {
  const mem = Memory.load(DIR + "/" + name, () => ({}) as any);
  mem.hold[0] = "held for the test";
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
  again.hold[0] = "held for the test";
  expect(again.count).toBe(12);
  expect(texts(again, 12)).toEqual(kept);
  Memory.push(again, [{ kind: "user", text: "after" }]);
  expect(texts(again, 13)).toEqual([...kept, "after"]);
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

test("an agent spawned as the user's is named after it, numbered from the second on; a plain one gets a random name", () => {
  const mem = chat("agents", 1);
  expect([1, 2, 3].map(() => Memory.agent_new(mem, "reviewer"))).toEqual(["reviewer", "reviewer-2", "reviewer-3"]);
  expect(Memory.agent_new(Memory.load(DIR + "/agents", () => ({}) as any), "reviewer")).toBe("reviewer-4");
  expect(Memory.agent_new(mem, "1st/../x")).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
  expect(Memory.agent_new(mem)).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
  expect(Memory.agent(mem, "reviewer-2")).toEqual([]);
});
