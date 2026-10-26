// Memory test
// ===========
// `bun test Memory.test.ts`. The cut: a turn's call gets the messages from
// it whole, the view's lines before it (sized by the first cutoff: none
// merged at load); it holds while they fit, so each
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
// message's kind, the compactor's or added; its labels taken off (never
// what happened at a line's head), and an answer declining the job in
// words is no line (one in its input's own words is). Past a /clear, the
// chat's view waits on no summary before it, nor holds a node wholly
// before it.
// As a chat grows, each view tiles it (the chat's from its first message,
// a /clear's too), its lines before the cut merging to fit (none more
// than a level coarser than the older one before it), those from the cut
// single messages. A span of time (in a zone set for the test) gives a
// head (its day, its messages, their first and last times), then the
// lines over its messages, oldest first, each with only the times its
// head doesn't say: as fine as SPAN_LINES lines and SPAN_BYTES bytes
// allow (a few messages, each its own line; a busy day, lines of many),
// coarser past them, never more; lines not built opened to their halves,
// a message not summarized as such; the roots alone past the lines and
// the bytes stay, each text cut to its share. A span with no message says so, with the lines
// just before and after it. A subagent's map: the chat (from the view's
// first message) in a few dozen lines, the newest messages each its own,
// detail fading with age, within its bytes; lines not built said so, one
// over a line built opened first, and with summaries lagging detail
// still fading with age; its first lines past its bytes stay, each text
// cut to its share.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import { png } from "../../test/png.ts";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-memory-");
process.env.ILLI_DIR = DIR;

const { Memory } = await import("./Memory.ts");
const { Compactor } = await import("./Compactor.ts");
const { Export } = await import("./Export.ts");
const { Logs } = await import("./Logs.ts");
const { Store } = await import("./Store.ts");
const { When } = await import("./When.ts");
type Span = import("./When.ts").Span;

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

test("a chat read back merges none of its view's lines till a turn's cutoff sizes it, so a restart never shrinks it", () => {
  const mem = chat("restart", 12);
  Memory.cutoff(mem, 1e6);
  expect(mem.view.high).toBe(5e5);
  Memory.stop(mem);
  const back = Memory.load(DIR + "/restart", () => ({}) as any);
  expect(back.view.high).toBe(Infinity);
  Memory.cutoff(back, 4e5);
  expect(back.view.high).toBe(2e5);
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

test("closed, the chat is its project's one file, its images in it: a model gets a big one's smaller copy, a small one whole; an export, each image itself", async () => {
  const mem = chat("closed", 1);
  const [small, big] = [png(4, 4), png(2400, 8)];
  const names = [await Memory.image_add(mem, small), await Memory.image_add(mem, big), await Memory.image_add(mem, small)];
  expect(names[0]).toMatch(/^[0-9a-f]{16}\.png$/);
  expect(names[2]).toBe(names[0]);
  expect(await Memory.image_add(mem, Buffer.from("no image"))).toBeNull();
  Memory.push(mem, [{ kind: "user", text: "two screenshots", images: [names[0]!, names[1]!] }]);
  const got = Memory.images(mem, 1);
  expect(got.map((g) => g.type)).toEqual(["image/png", "image/webp"]);
  expect(got[0].data).toBe(small.toString("base64"));
  expect(Buffer.from(got[1].data, "base64").subarray(8, 12).toString()).toBe("WEBP");
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
  expect(Compactor.bare("Compacted line for msgs 32–35: user msg 16: add /health")).toBe("user msg 16: add /health");
  expect(Compactor.bare("Compacted line (under 512 bytes):\n\nCompacted: `src/server.ts` has /health")).toBe("`src/server.ts` has /health");
  expect(Compactor.bare("Merged line (msg 28–31): README.md gained a line")).toBe("README.md gained a line");
  expect(Compactor.bare("Compacted msgs 80-87: tests pass")).toBe("tests pass");
  expect(Compactor.bare("<line>0+2|user: bun test fails</line>")).toBe("user: bun test fails");
  expect(Compactor.bare("16+8|illi: done")).toBe("illi: done");
  expect(Compactor.bare("one test failed: TypeError")).toBe("one test failed: TypeError");
  // what happened kept at a line's head, the job's own labels alone taken
  expect(Compactor.bare("Merged PR #12 into main: tests pass")).toBe("Merged PR #12 into main: tests pass");
  expect(Compactor.bare("Combined the configs: one file now")).toBe("Combined the configs: one file now");
  expect(Compactor.bare("Compressed images in assets/: 2 MB saved")).toBe("Compressed images in assets/: 2 MB saved");
  expect(Compactor.bare("Merged: a then b")).toBe("a then b");
  expect(Compactor.bare("Combined lines 4 and 5: a then b")).toBe("a then b");
  expect(Compactor.bare("<line>user: bun test fails</line>")).toBe("user: bun test fails");
  // a label alone is no line
  expect(Compactor.bare("Merged line (msg 28–31):")).toBe("");
});

test("an answer declining the job in words is no line, however it says so; one opening as its input does is the input's own words", () => {
  const leaf = "illi: here is the plan";
  for (const said of ["I can't write the merged line: the input is only a tool call.", "I cannot compress this.", "I can’t help with that.", "I'm unable to summarize it.", "I’m sorry, but I can't.", "I am sorry", "Sorry, I won't.", "I won't do that.", "I am not able to.", "Unable to compress: no content."]) {
    expect([said, Compactor.declined(said, leaf)]).toEqual([said, true]);
  }
  expect(Compactor.declined("I can't log in to the box; asks for the VPN steps", "user: I can't log in to the box since the update")).toBe(false);
  expect(Compactor.declined("I’m sorry, the build broke: reverted", "illi: I'm sorry, the build broke because of the lockfile")).toBe(false);
  expect(Compactor.declined("user: I can't log in", "user: hello")).toBe(false);
  expect(Compactor.declined("the user is sorry", "user: x")).toBe(false);
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

// a held chat of messages at these instants, and every node over them
// built (none above level `top`), its text "l<level>i<index>" and `pad`
// bytes more (a node over a message of `bare`: left unbuilt)
function dated(name: string, times: number[], pad = 0, top = Infinity, bare = new Set<number>()) {
  const mem = Memory.load(DIR + "/" + name, () => ({}) as any);
  mem.hold = true;
  Memory.push(mem, times.map((ms, k) => ({ kind: "user" as const, text: "m" + k, date: new Date(ms).toISOString() })));
  const lines: Array<{ first: number; n: number; text: string }> = [];
  for (let l = 0; l <= top && 2 ** l <= times.length; l++) {
    for (let i = 0; (i + 1) * 2 ** l <= times.length; i++) {
      const over = Array.from({ length: 2 ** l }, (_, k) => i * 2 ** l + k);
      if (!over.some((k) => bare.has(k))) {
        lines.push({ first: i * 2 ** l, n: 2 ** l, text: "l" + l + "i" + i + " " + "x".repeat(pad) });
      }
    }
  }
  Store.nodes(mem.store, lines);
  return mem;
}

// a test run in New York's zone, whatever the machine's
function zoned(run: () => void): void {
  const zone = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    run();
  } finally {
    if (zone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = zone;
    }
  }
}

// a date's lines: their ids and texts' bytes
const parts = (text: string) => text.split("\n").filter((l) => /^\d+\+\d+\|/.test(l)).map((l) => {
  const [first, n] = l.split("|")[0].split("+").map(Number);
  return { first, n, line: l };
});

// New York local time
const ny = (d: number, h: number, mi = 0) => new Date(2026, 9, d, h, mi).getTime();

test("a busy day: its head, then lines as fine as the line cap allows, oldest first, tiling its messages, each with only the times the head doesn't say", () => zoned(() => {
  // 5 on the evening before, 200 every 3 minutes from 09:00, 5 the morning after
  const times = [...Array.from({ length: 5 }, (_, k) => ny(20, 20, k)), ...Array.from({ length: 200 }, (_, k) => ny(21, 9, 3 * k)), ...Array.from({ length: 5 }, (_, k) => ny(22, 8, k))];
  const mem = dated("busy", times, 300);
  const text = Memory.days(mem, When.span("2026-10-21", undefined) as Span);
  const lines = parts(text);
  expect(text.split("\n")[0]).toBe("Wed 21 Oct 2026 · 200 messages · 09:00–18:57");
  expect(lines.map((l) => l.first + "+" + l.n)).toEqual(["0+32", "32+32", "64+32", "96+32", "128+32", "160+32", "192+16"]);
  expect(lines[0].line).toBe("0+32|Tue 20 20:00–10:18 l5i0 " + "x".repeat(300));
  expect(lines[1].line).toStartWith("32+32|10:21–11:54 l5i1 ");
  expect(lines[6].line).toStartWith("192+16|18:21–Thu 22 08:02 l4i12 ");
  expect(text.split("\n").at(-1)).toBe("Zoom a line to go deeper.");
  expect(Memory.days(mem, When.span("2026-10-21", undefined) as Span, "site-7q2m0d").split("\n").at(-1)).toBe("Zoom a line to go deeper, with project site-7q2m0d.");
  // a few messages: each its own line
  const few = Memory.days(mem, When.span("2026-10-21 09:00", "2026-10-21 09:09") as Span);
  expect(few).toBe(["Wed 21 Oct 2026 09:00–09:09 · 3 messages · 09:00–09:06", "5+1|09:00 l0i5 " + "x".repeat(300), "6+1|09:03 l0i6 " + "x".repeat(300), "7+1|09:06 l0i7 " + "x".repeat(300), "Zoom a line to go deeper."].join("\n"));
}));

test("past the bytes, coarser lines, never more of them; lines not built opened to their halves, a message not summarized as such", () => zoned(() => {
  const times = Array.from({ length: 600 }, (_, k) => ny(19, 0) + k * 7 * 60e3);
  const mem = dated("long", times, 480);
  const span = When.span("2026-10-19", "2026-10-21") as Span;
  const [a, b] = Store.span(mem.store, span);
  const lines = Memory.lines(mem, a, b);
  expect([a, b]).toEqual([0, 600]);
  expect(lines.reduce((n, l) => n + Buffer.byteLength(l.text!), 0)).toBeLessThanOrEqual(4800);
  // a level finer, 11 lines, would pass the bytes: the tail's roots (576+16, 592+8) stay as they are
  expect(lines.map((l) => Memory.ref(l.part))).toEqual(["0+128", "128+128", "256+128", "384+128", "512+64", "576+16", "592+8"]);
  expect(parts(Memory.days(mem, span))[0].line).toStartWith("0+128|Mon 19 00:00–14:49 l7i0 ");
  // messages 4 and 5 not summarized, so neither is the root over them, 4+2
  const thin = dated("thin", Array.from({ length: 6 }, (_, k) => ny(21, 9, k)), 0, Infinity, new Set([4, 5]));
  expect(Memory.lines(thin, 0, 6).map((l) => Memory.ref(l.part) + " " + l.text)).toEqual(["0+1 l0i0 ", "1+1 l0i1 ", "2+1 l0i2 ", "3+1 l0i3 ", "4+1 null", "5+1 null"]);
  const got = parts(Memory.days(thin, When.span("2026-10-21", undefined) as Span)).map((l) => l.line);
  expect(got.slice(3)).toEqual(["3+1|09:03 l0i3 ", "4+1|09:04 (not summarized yet: zoom it)", "5+1|09:05 (not summarized yet: zoom it)"]);
  // message 40 not summarized: the root over it, 32+16, opened first, down to its built pieces, then the largest while the cap holds
  const wide = dated("wide", Array.from({ length: 48 }, (_, k) => ny(21, 9, k)), 400, Infinity, new Set([40]));
  expect(Memory.lines(wide, 0, 48).map((l) => Memory.ref(l.part) + (l.text === null ? " null" : ""))).toEqual(["0+8", "8+8", "16+8", "24+8", "32+8", "40+1 null", "41+1", "42+2", "44+4"]);
}));

test("the roots alone past the lines and the bytes: they stay, each text cut to its share", () => {
  const mem = Memory.load(DIR + "/roots", () => ({}) as any);
  mem.hold = true;
  Memory.push(mem, Array.from({ length: 8191 }, (_, k) => ({ kind: "user" as const, text: "m" + k })));
  const roots = Memory.roots(8191);
  Store.nodes(mem.store, roots.map((p) => ({ first: p.i * 2 ** p.l, n: 2 ** p.l, text: "é".repeat(300) })));
  const lines = Memory.lines(mem, 0, 8191);
  expect(lines.map((l) => l.part)).toEqual(roots);
  expect(lines.length).toBe(13);
  expect(lines.every((l) => Buffer.byteLength(l.text!) <= Math.floor(4800 / 13) && l.text!.endsWith("…") && !l.text!.includes("\uFFFD"))).toBe(true);
});

test("a subagent's map: the chat in 48 lines at most, the newest 8 messages each its own, detail fading with age, from the view's first message; lines not built said so; one block, marked", () => {
  const times = Array.from({ length: 600 }, (_, k) => ny(21, 9) + k * 60e3);
  const mem = dated("map", times, 100);
  const refs = (blocks: Array<{ text: string }>) => blocks[0].text.split("\n").filter((l) => /^\d+\+\d+\|/.test(l)).map((l) => l.split("|")[0]);
  const map = Memory.map(mem);
  expect([map.length, map[0].mark]).toEqual([1, true]);
  expect(refs(map)).toEqual(["0+64", "64+64", "128+64", "192+32", "224+32", "256+32", "288+32", "320+32", "352+32", "384+16", "400+16", "416+16", "432+16", "448+16", "464+16", "480+16", "496+8", "504+8", "512+8", "520+8", "528+8", "536+8", "544+4", "548+4", "552+4", "556+4", "560+4", "564+4", "568+4", "572+4", "576+2", "578+2", "580+2", "582+2", "584+2", "586+2", "588+1", "589+1", "590+1", "591+1", "592+1", "593+1", "594+1", "595+1", "596+1", "597+1", "598+1", "599+1"]);
  expect(map[0].text).toStartWith("<chat>\n0+64|l6i0 ");
  expect(map[0].text).toEndWith("\n599+1|l0i599 " + "x".repeat(100) + "\n</chat>\n");
  // past a /clear, from its first message
  mem.view.from = 100;
  expect(refs(Memory.map(mem)).slice(0, 4)).toEqual(["100+4", "104+8", "112+16", "128+64"]);
  // longer lines: fewer, within the bytes
  const long = Memory.map(dated("map-long", times, 600));
  expect([refs(long).length, Buffer.byteLength(long[0].text) <= 16000 + "<chat>\n</chat>\n".length]).toEqual([26, true]);
  // a message not summarized: its line says so, the lines over it opened first
  const bare = Memory.map(dated("map-bare", times, 100, Infinity, new Set([300, 597])))[0].text;
  expect([bare.includes("\n300+1|(not summarized yet: zoom it)\n"), bare.includes("\n597+1|(not summarized yet: zoom it)\n")]).toEqual([true, true]);
  // a short chat: each message
  expect(Memory.map(dated("map-few", times.slice(0, 3)))).toEqual([{ text: "<chat>\n0+1|l0i0 \n1+1|l0i1 \n2+1|l0i2 \n</chat>\n", mark: true }]);
});

test("a map whose first lines pass its bytes: they stay, each text cut to its share", () => {
  const mem = Memory.load(DIR + "/map-roots", () => ({}) as any);
  mem.hold = true;
  Memory.push(mem, Array.from({ length: 8191 }, (_, k) => ({ kind: "user" as const, text: "m" + k })));
  const roots = Memory.roots(8183);
  Store.nodes(mem.store, roots.map((p) => ({ first: p.i * 2 ** p.l, n: 2 ** p.l, text: "é".repeat(4000) })));
  const lines = Memory.map(mem)[0].text.split("\n").filter((l) => /^\d+\+\d+\|/.test(l));
  expect(lines.map((l) => l.split("|")[0])).toEqual([...roots.map((p) => Memory.ref(p)), ...Array.from({ length: 8 }, (_, k) => 8183 + k + "+1")]);
  const share = Math.floor(16000 / lines.length);
  expect(lines.slice(0, roots.length).every((l) => Buffer.byteLength(l.split("|")[1]) <= share && l.endsWith("…") && !l.includes("\uFFFD"))).toBe(true);
});

test("a map over summaries lagging or stuck (each message summarized, no line merged): detail fades with age all the same, never the oldest messages opened first", () => {
  const times = Array.from({ length: 600 }, (_, k) => ny(21, 9) + k * 60e3);
  const text = Memory.map(dated("map-unmerged", times, 100, 0))[0].text;
  const refs = text.split("\n").filter((l) => /^\d+\+\d+\|/.test(l)).map((l) => l.split("|")[0]);
  expect(refs).toEqual(["0+64", "64+64", "128+64", "192+64", "256+32", "288+32", "320+32", "352+32", "384+32", "416+16", "432+16", "448+16", "464+16", "480+16", "496+16", "512+8", "520+8", "528+8", "536+8", "544+8", "552+4", "556+4", "560+4", "564+4", "568+4", "572+4", "576+2", "578+2", ...Array.from({ length: 20 }, (_, k) => 580 + k + "+1")]);
  expect([text.includes("\n0+64|(not summarized yet: zoom it)\n"), text.includes("\n580+1|l0i580 ")]).toEqual([true, true]);
});

test("a span with no message says so, with the lines just before and after it; at the chat's start or end, the one side; none at all, so", () => zoned(() => {
  const times = [...Array.from({ length: 12 }, (_, k) => ny(19, 10, k)), ...Array.from({ length: 4 }, (_, k) => ny(23, 9, k))];
  const mem = dated("gap", times);
  const on = (from: string, to?: string) => Memory.days(mem, When.span(from, to) as Span);
  expect(on("2026-10-21")).toBe(["Nothing on Wed 21 Oct 2026. Before and after it:", "8+4|Mon 19 10:08–10:11 l2i2 ", "12+4|Fri 23 09:00–09:03 l2i3 ", "Zoom a line to go deeper."].join("\n"));
  expect(on("2026-10-18")).toBe(["Nothing on Sun 18 Oct 2026. After it:", "0+8|Mon 19 10:00–10:07 l3i0 ", "Zoom a line to go deeper."].join("\n"));
  expect(on("2026-10-24", "2026-10-30")).toBe(["Nothing within Sat 24–Fri 30 Oct 2026. Before it:", "8+8|Mon 19 10:08–Fri 23 09:03 l3i1 ", "Zoom a line to go deeper."].join("\n"));
  const none = Memory.load(DIR + "/none", () => ({}) as any);
  expect(Memory.days(none, When.span("2026-10-21", undefined) as Span)).toBe("Nothing on Wed 21 Oct 2026: no messages yet.");
}));
