// Memory test
// ===========
// `bun test Memory.test.ts`. The cut: a turn's call gets the messages from
// it whole, the view's lines before it; it holds while they fit, so each
// call starts as the one before did, and past the call's size moves on
// till they fill half (the oldest fold into the view); kept on disk. The
// recent messages come in blocks, one marked in place of the view's.
// Closed, the chat is one file, its images in it too: a model gets each
// one's copy if one was made (a big one, smaller, as JPEG), else the
// image; an export, the image itself. The screen folds with a cut that
// moves on by itself, and stays behind one moved for it (a /compact's
// recap). An agent spawned as the user's is named after it;
// a freed name is used again, each log its own; one named main, the
// chat's own caller, is refused. A leaf's summary starts with its
// message's kind, the compactor's or added. Past a /clear, the chat's
// view waits on no summary before it, nor holds a node wholly before it.
// As a chat grows, each view tiles it (the chat's from its first message,
// a /clear's too), its lines before the cut merging to fit (none more
// than a level coarser than the older one before it), those from the cut
// single messages.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as zlib from "node:zlib";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-memory-");
process.env.ILLI_DIR = DIR;

const { Memory } = await import("./Memory.ts");
const { Compactor } = await import("./Compactor.ts");
const { Export } = await import("./Export.ts");
const { Logs } = await import("./Logs.ts");

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

test("a turn's chat: the messages from the cut whole, in blocks, the last whole one marked, and the view's", () => {
  const mem = chat("recent", 10);
  const blocks = Memory.chat(mem, 2, 9);
  const text = blocks.map((b) => b.text).join("");
  expect(text).toContain("<recent>\n2|user: message 2 x");
  expect(text).toContain("8|user: message 8");
  expect(text).not.toContain("9|user");
  expect(text.endsWith("</recent>\n")).toBe(true);
  expect(blocks.filter((b) => b.mark).map((b) => b.text.slice(0, 7))).toEqual(["<chat>\n", "2|user:"]);
  expect(blocks.findLast((b) => b.mark)!.text).toContain("5|user");
  expect(Memory.chat(mem, 9, 9).filter((b) => b.mark).length).toBe(1);
});

// a PNG w x h, one grey, made by hand
function png(w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(Bun.hash.crc32(body), 8 + data.length);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(3 * w, 0x80)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", head), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

test("closed, the chat is its project's one file, its images in it: a model gets a big one's smaller copy, a small one whole; an export, each image itself", async () => {
  const mem = chat("closed", 1);
  const [small, big] = [png(4, 4), png(2400, 8)];
  const names = [await Memory.image_add(mem, small), await Memory.image_add(mem, big), await Memory.image_add(mem, small)];
  expect(names[0]).toMatch(/^[0-9a-f]{16}\.png$/);
  expect(names[2]).toBe(names[0]);
  expect(await Memory.image_add(mem, Buffer.from("no image"))).toBeNull();
  Memory.push(mem, [{ kind: "user", text: "two screenshots", images: [names[0]!, names[1]!] }]);
  const got = Memory.images(mem, 1);
  expect(got.map((g) => g.type)).toEqual(["image/png", "image/jpeg"]);
  expect(got[0].data).toBe(small.toString("base64"));
  expect(Buffer.from(got[1].data, "base64").subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  expect(Memory.plain(Memory.message(mem, 1)!)).toBe("user: two screenshots\n[image " + names[0] + "]\n[image " + names[1] + "]");
  const out = JSON.parse([...Export.dump(mem)].join(""));
  expect(out.images).toEqual({ [names[0]!]: small.toString("base64"), [names[1]!]: big.toString("base64") });
  Memory.stop(mem);
  expect([fs.readdirSync(DIR + "/closed"), fs.readdirSync(DIR + "/closed/projects")]).toEqual([["projects"], ["home.sqlite"]]);
});

test("the screen folds with the cut as it moves on by itself, and stays behind a cut moved for it", () => {
  const mem  = chat("show", 40);
  const high = 20 * size(mem, 0, 1);
  mem.cut    = 38;
  expect(mem.show).toBe(0);
  expect(Memory.cutoff(mem, 1e9)).toBe(38);
  expect(mem.show).toBe(0);
  Memory.push(mem, Array.from({ length: 40 }, (_, k) => ({ kind: "illi" as const, text: "reply " + k + " " + "y".repeat(78) })));
  const cut = Memory.cutoff(mem, high);
  expect(cut).toBeGreaterThan(38);
  expect(mem.show).toBe(cut);
});

test("an agent spawned as the user's is named after it, numbered while one so named is taken; a freed name is used again, each log its own; main is refused", () => {
  const mem   = chat("agents", 1);
  const taken = new Set<string>();
  const spawn = (own: string | null) => {
    const name = Logs.start(mem, own, (n) => taken.has(n));
    taken.add(name);
    return name;
  };
  expect([1, 2, 3].map(() => spawn("reviewer"))).toEqual(["reviewer", "reviewer-2", "reviewer-3"]);
  Logs.push(mem, "reviewer", "note", "the first");
  const first = Logs.log(mem, "reviewer")!;
  taken.clear();
  expect(spawn("reviewer")).toBe("reviewer");
  Logs.push(mem, "reviewer", "note", "the second");
  expect(Logs.log(mem, "reviewer")).not.toBe(first);
  expect(Logs.read(mem, "reviewer")!.map((r) => r.text)).toEqual(["the second"]);
  expect(Logs.read(mem, first)!.map((r) => r.text)).toEqual(["the first"]);
  expect(Logs.read(Memory.load(DIR + "/agents", () => ({}) as any), "reviewer")!.map((r) => r.text)).toEqual(["the second"]);
  expect(spawn("1st/../x")).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
  expect(spawn(null)).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
  expect(Logs.read(mem, "../reviewer")).toBeNull();
  expect(() => spawn("main")).toThrow("Rename the agent's file (main.md)");
  expect(spawn("Main")).toBe("Main");
});

test("a leaf's summary starts with its message's kind, added where the compactor left it out; a merge's stays as it is", () => {
  expect(Compactor.tagged(0, "user: Notes for later: launch moves to April 14", "Project notes: launch Apr 14")).toBe("user: Project notes: launch Apr 14");
  expect(Compactor.tagged(0, "tool: shell {\"command\":\"ls\"}", "tool: shell ls")).toBe("tool: shell ls");
  expect(Compactor.tagged(0, "tool: Bash {}", "echo: no output")).toBe("echo: no output");
  expect(Compactor.tagged(1, "user: a\nilli: b", "a then b")).toBe("a then b");
  expect(Compactor.bare("Merged line: user asked for a file")).toBe("user asked for a file");
  expect(Compactor.bare("Line: done")).toBe("done");
  expect(Compactor.bare("line 42: the bug")).toBe("line 42: the bug");
  expect(Compactor.bare("user: Summary: none yet")).toBe("user: Summary: none yet");
});

test("past a /clear, the chat's view waits on no summary before it, nor holds a node wholly before it", async () => {
  const mem = chat("clear", 16);
  Memory.push(mem, [{ kind: "note", text: "a new session" }]);
  expect(Memory.due(mem)).toBe(0);
  mem.view.from = 16;
  mem.view.parts = [{ l: 0, i: 16 }];
  mem.seen.parts = [{ l: 4, i: 0 }, { l: 0, i: 16 }];
  expect(Memory.due(mem)).toBe(16);
  expect(await Memory.settle(mem, 16, new AbortController().signal)).toBeNull();
  expect(Memory.held(mem, { l: 1, i: 0 })).toBe(false);
  expect(Memory.held(mem, { l: 4, i: 0 })).toBe(true);
  expect(Memory.held(mem, { l: 0, i: 16 })).toBe(true);
});

// every node ready built, level by level (as compactions would: those a
// node built makes ready too), each line `bytes()` long
function build(mem: any, bytes: () => number): void {
  for (let l = 0; l < mem.ready.length; l++) {
    Memory.keep(mem, (mem.ready[l] ?? []).map((i: number) => ({ l, i, text: "line " + l + "/" + i + " " + "x".repeat(bytes()) })));
  }
}

// a view's lines tile it from its first message to `end`, in order, no gap
// nor overlap; each line above a message built; its size the sum of its
// lines'
function tiles(mem: any, view: any, end: number): void {
  let at = view.from;
  for (const part of view.parts) {
    expect(Memory.span(part)[0]).toBe(at);
    expect(part.l === 0 || Memory.built(mem, part.l, part.i)).toBe(true);
    at = Memory.span(part)[1] + 1;
  }
  expect(at).toBe(end);
  expect(view.size).toBe(view.parts.reduce((n: number, part: any) => n + Memory.size(mem, part), 0));
}

test("as a chat grows, each view tiles it, the chat's from its first message (a /clear's too); its lines before the cut merge to fit, none more than a level coarser than the one before it, those from it single", () => {
  const mem = chat("grows", 0);
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const high = 8000;
  const coarse = [false, false];
  for (let round = 0; round < 40; round++) {
    Memory.push(mem, Array.from({ length: 10 }, (_, k) => ({ kind: "user" as const, text: "m " + round + "/" + k + " " + "y".repeat(Math.floor(rand() * 300)) })));
    build(mem, () => 60 + Math.floor(rand() * 400));
    if (round === 25) {
      mem.cut = mem.show = mem.view.from = mem.count;
      Memory.fit(mem);
    }
    Memory.cutoff(mem, high);
    Memory.fit(mem);
    tiles(mem, mem.view, mem.count);
    tiles(mem, mem.seen, mem.count);
    const k = Memory.cover(mem.view, mem.cut);
    const head = mem.view.parts.slice(0, k);
    expect(head.reduce((n: number, part: any) => n + Memory.size(mem, part), 0)).toBeLessThanOrEqual(mem.view.high);
    expect(mem.view.parts.slice(k).every((part: any) => part.l === 0)).toBe(true);
    for (let j = 1; j < head.length; j++) {
      expect(head[j].l).toBeLessThanOrEqual(head[j - 1].l + 1);
    }
    coarse[round < 25 ? 0 : 1] ||= head.some((part: any) => part.l > 1);
  }
  expect(mem.view.from).toBe(260);
  expect(coarse).toEqual([true, true]);
  expect(mem.seen.parts[0].l).toBeGreaterThan(mem.view.parts[0].l);
});
