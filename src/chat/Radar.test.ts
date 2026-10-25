// Radar test
// ==========
// `bun test Radar.test.ts`. A query keeps what is distinctive (a path as
// its file's name with its ending, short ones too, an error's name, an
// errno by name alone, a name in code, an acronym, a rare word) and
// drops what every chat holds (stop words, tool names and their keys,
// folders, endings, shell commands, flags, numbers, hashes, words in
// capitals said loud); a result counts only if it failed, and then only
// its errors' names. On a synthetic chat full of boilerplate, the
// episodes sharing a path or an error with the query rank first, each
// widened to its summary node; boilerplate alone finds nothing; a rare
// word is found however many words come with it; a topic come back in a
// young chat is still told; what the view holds at message detail
// or recent, or the user dismissed, is never found nor widened into. The
// list shown stays still: found again it keeps its place, new lines join
// at the foot; one not found fades, and leaves under the floor, or for
// one far stronger, one a step; one opened or pinned stays.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-radar-");
process.env.ILLI_DIR = DIR;

const { Radar } = await import("./Radar.ts");
const { Store } = await import("./Store.ts");
type Found = import("./Radar.ts").Found;
type Shown = import("./Radar.ts").Shown;

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

const DAY = 86400000;

// Synthetic chats
// ---------------

// a chat of these messages ([kind, text], the first `days` days ago, a
// minute apart), its whole tree built as the compactor builds one with
// no call: a leaf its message ("kind: text"), a node its halves' lines
// joined while they fit 512 bytes, else their heads (a summary's stand-in)
function chat(name: string, msgs: Array<[string, string]>, days = 30): ReturnType<typeof Store.open> {
  const store = Store.open(DIR + "/" + name, { key: "git:/work/" + name, name, path: "/work/" + name });
  const at = Date.now() - days * DAY;
  Store.push(store, msgs.map(([kind, text], i) => ({ i, kind: kind as any, text, date: new Date(at + i * 60000).toISOString(), size: text.length })), "/work");
  let level = msgs.map(([kind, text]) => kind + ": " + text);
  for (let n = 1; level.length > 0; n *= 2) {
    Store.nodes(store, level.map((text, i) => ({ first: i * n, n, text })));
    const up: string[] = [];
    for (let i = 0; i + 1 < level.length; i += 2) {
      const both = level[i] + " " + level[i + 1];
      up.push(both.length <= 512 ? both : level[i].slice(0, 250) + " " + level[i + 1].slice(0, 250));
    }
    level = up;
  }
  return store;
}

// a work episode of 16 messages that touches only what every chat holds
function noise(k: number): Array<[string, string]> {
  const files = ["src/ui/View.ts", "src/term/Term.ts", "src/chat/Chat.ts", "test/run.test.ts"];
  const file  = files[k % files.length];
  return [
    ["user", "please run the tests again and check the output"],
    ["tool", 'read {"path":"' + file + '"}'],
    ["echo", "export function view_new() { return {} }"],
    ["tool", 'shell {"command":"bun test 2>&1 | tail -20"}'],
    ["echo", "42 pass\n0 fail\n(exit 0 in 3.1 s)"],
    ["illi", "The tests pass; I read " + file + " and checked the command output."],
    ["tool", 'edit {"path":"' + file + '","edits":[{"old":"const a = 1","new":"const a = 2"}]}'],
    ["echo", "edited " + file],
    ["tool", 'shell {"command":"bun run check"}'],
    ["echo", "(exit 0 in 1.2 s)"],
    ["illi", "Done: the change is in and the check passes."],
    ["user", "thanks, commit it"],
    ["tool", 'shell {"command":"git add -A && git commit -m \\"update ' + k + '\\""}'],
    ["echo", "[main 3f9a2c1] update " + k + "\n(exit 0 in 0.1 s)"],
    ["illi", "Committed."],
    ["note", "turn " + k + " ended"],
  ];
}

// the episode about the search thread's lock (16 messages)
const SEEKER: Array<[string, string]> = [
  ["user", "the search thread dies when two illis open one file"],
  ["tool", 'read {"path":"src/chat/Seeker.ts"}'],
  ["echo", "self.onmessage = (e) => {}"],
  ["tool", 'shell {"command":"bun test src/chat/Store.test.ts"}'],
  ["echo", "error: SQLITE_BUSY: database is locked\n(exit 1 in 2.0 s)"],
  ["illi", "The worker opens its own connection; SQLITE_BUSY comes from the WAL switch."],
  ["tool", 'edit {"path":"src/chat/Store.ts","edits":[{"old":"db.run(\\"pragma journal_mode = wal\\")","new":"Store.wal(db)"}]}'],
  ["echo", "edited src/chat/Store.ts"],
  ["tool", 'shell {"command":"bun test src/chat/Store.test.ts"}'],
  ["echo", "12 pass\n0 fail\n(exit 0 in 2.2 s)"],
  ["illi", "Store.wal retries while another illi holds the lock; Seeker.ts reads beside the writes."],
  ["user", "good"],
  ["tool", 'shell {"command":"git commit -am \\"wal retried\\""}'],
  ["echo", "(exit 0 in 0.1 s)"],
  ["illi", "Committed."],
  ["note", "turn ended"],
];

// the episode about the side panel's width (16 messages)
const SIDE: Array<[string, string]> = [
  ["user", "the side panel squeezes the chat on narrow screens"],
  ["tool", 'read {"path":"src/term/Side.ts"}'],
  ["echo", "export function term_side_width(t, w) {}"],
  ["illi", "term_side_width keeps ROOM columns for the chat; I'll raise WIDE."],
  ["tool", 'edit {"path":"src/term/Side.ts","edits":[{"old":"const WIDE = 90","new":"const WIDE = 100"}]}'],
  ["echo", "edited src/term/Side.ts"],
  ["tool", 'shell {"command":"bun test"}'],
  ["echo", "(exit 0 in 3.0 s)"],
  ["illi", "The side shows from 100 columns on."],
  ["user", "ok"],
  ["tool", 'shell {"command":"git commit -am \\"wide\\""}'],
  ["echo", "(exit 0 in 0.1 s)"],
  ["illi", "Committed."],
  ["note", "turn ended"],
  ["user", "next"],
  ["illi", "Ready."],
];

// noise, the search thread's episode at 32, noise, the side's at 80,
// more noise, then the run now (176 on)
const RUN: Array<[string, string]> = [
  ["user", "SQLITE_BUSY again in the search thread"],
  ["tool", 'read {"path":"src/chat/Seeker.ts"}'],
  ["echo", "self.onmessage = (e) => {}"],
];
const MSGS = [...noise(0), ...noise(1), ...SEEKER, ...noise(2), ...noise(3), ...SIDE, ...noise(4), ...noise(5), ...noise(6), ...noise(7), ...noise(8), ...RUN];
const store = chat("app", MSGS);
const END = 176;

// the lines a run's messages find, before message `end` (the run's
// first), the ranges given left out too
function find(run: Array<[string, string]>, end = END, out: Array<[number, number]> = []): Found[] {
  const said = run.map(([kind, text]) => ({ kind, text }));
  const user = said.findLast((m) => m.kind === "user")?.text ?? null;
  return Radar.search(store, { chat: store.chat, units: Radar.units(user, said.filter((m) => m.kind !== "user")), end, out });
}

const spans = (found: Found[]) => found.map((f) => f.first + "+" + f.n);

// Query
// -----

test("a query keeps a path as its file's name with its ending, an error's name, a name in code and rare words; drops the rest", () => {
  const qs = (user: string | null, run: Array<[string, string]>) => Radar.units(user, run.map(([kind, text]) => ({ kind, text }))).map((u) => u.k + ":" + u.q);
  expect(qs(null, [["tool", 'read {"path":"src/chat/Seeker.ts"}']])).toEqual(["path:seeker ts"]);
  expect(qs(null, [["tool", 'shell {"command":"bun test 2>&1 | tail -20"}']])).toEqual([]);
  expect(qs(null, [["tool", 'shell {"command":"git commit -am \\"wip 3f9a2c1\\" && cd src/ && ls -la test/"}']])).toEqual([]);
  expect(qs(null, [["tool", 'zoom {"id":6243,"n":8}'], ["tool", 'read {"path":"/work/app/package.json"}']])).toEqual(["path:package json"]);
  expect(qs("Why does `Store.seek` drop words in term_side_drawn and the TypeError in Memory.ts:613?", [])).toEqual(["path:memory ts", "error:typeerror", "name:store seek", "name:term side drawn", "word:drop"]);
  expect(qs(null, [["echo", "export const tokens = parse(output)\n(exit 0 in 1 s)"]])).toEqual([]);
  expect(qs(null, [["echo", "error: ENOENT: no such file, open 'x.txt'"]])).toEqual(["error:enoent"]);
  expect(qs(null, [["echo", "TypeError: x is undefined\n(exit 1 in 0.3 s)"]])).toEqual(["error:typeerror"]);
  expect(qs(null, [["illi", "SIDE_WIDTH is read; then ERR_MODULE_NOT_FOUND came up"]])).toEqual(["error:err module not found", "name:side width"]);
});

test("a query weighs a path and an error most, the newest message most, the user's message never faded; a long value gives its longest names", () => {
  const units = Radar.units("fix the scrolling", [["tool", 'read {"path":"src/a/Old.ts"}'], ["illi", "Looking at the scrolling code now"], ["tool", 'read {"path":"src/a/New.ts"}']].map(([kind, text]) => ({ kind, text })));
  const w = (q: string) => units.find((u) => u.q === q)?.w ?? 0;
  expect(w("new ts")).toBe(3);
  expect(w("old ts")).toBeCloseTo(3 * 0.85 ** 2);
  expect(w("scrolling")).toBe(1.2);
  const long = Radar.units(null, [{ kind: "tool", text: JSON.stringify({ x: 1 }).replace("{", 'write {"path":"a/Big.ts","content":' + JSON.stringify("const veryLongName_here = otherThing.call(); ".repeat(10)) + ",") }]);
  expect(long.map((u) => u.k + ":" + u.q)).toEqual(["path:big ts", "name:otherthing call", "name:verylongname here"]);
});

// Search
// ------

test("the episode sharing a path and an error ranks first, widened to its summary node; boilerplate alone finds nothing", () => {
  const found = find(RUN);
  expect(spans(found)).toEqual(["32+16"]);
  expect(found[0].anchored).toBe(true);
  expect(found[0].units).toBeGreaterThanOrEqual(2);
  expect(found[0].text.startsWith("user: the search thread dies")).toBe(true);
  expect(found[0].date).toBe(new Date(Date.now() - 30 * DAY + 47 * 60000).toISOString().slice(0, 11) + found[0].date.slice(11));
  expect(spans(find([["user", "the side panel is too narrow again"], ["tool", 'read {"path":"src/term/Side.ts"}']]))).toEqual(["80+16"]);
  expect(find([["user", "please run the tests again and check the output"], ["tool", 'shell {"command":"bun test 2>&1 | tail -20"}'], ["tool", 'read {"path":"src/ui/View.ts"}']])).toEqual([]);
  expect(find([["user", "hello"]])).toEqual([]);
});

test("what is left out is never found nor widened into: the turn's and the detail's messages, the dismissed", () => {
  expect(find(RUN, 40).map((f) => [f.first, f.n])).toEqual([[32, 8]]);
  expect(find(RUN, END, [[44, 46]])[0]).toMatchObject({ first: 32, n: 8 });
  expect(spans(find(RUN, END, [[32, 48]]))).not.toContain("32+16");
  expect(find(RUN, END, [[32, 48]]).every((f) => f.first + f.n <= 32 || f.first >= 48)).toBe(true);
  expect(find(RUN, 30)).toEqual([]);
});

test("what a view leaves out: its messages at message detail and from its turn on, and the dismissed, the end apart", () => {
  expect(Radar.left([[0, 64], [64, 32], [96, 16], [112, 1], [113, 1], [114, 1]], Infinity, [])).toEqual({ end: 112, out: [] });
  expect(Radar.left([[0, 64], [64, 1], [65, 32], [97, 1], [98, 1]], 98, [[10, 12]])).toEqual({ end: 97, out: [[10, 12], [64, 65]] });
  expect(Radar.left([[0, 8], [8, 1], [9, 1]], 9, [[9, 10]])).toEqual({ end: 8, out: [] });
  expect(Radar.left([], Infinity, [])).toEqual({ end: 0, out: [] });
});

// Shown
// -----

const line = (first: number, score: number, n = 16): Found => ({ first, n, text: "line " + first, score, units: 2, anchored: true, date: "" });
const shown = (first: number, score: number, touched = false): Shown => ({ ...line(first, score), peak: score, touched });

test("the list stays still: a line found again keeps its place, its score the new; new lines join at the foot; never two over the same messages", () => {
  const one = Radar.merge([], [line(32, 20), line(96, 10)]);
  expect(one.map((s) => s.first)).toEqual([32, 96]);
  const two = Radar.merge(one, [line(96, 30), line(160, 8), line(32, 7), line(96, 9, 8)]);
  expect(two.map((s) => [s.first, s.score, s.peak])).toEqual([[32, 7, 20], [96, 30, 30], [160, 8, 8]]);
  expect(Radar.merge(two, [line(100, 40, 4)]).map((s) => s.first)).toEqual([32, 96, 160]);
});

test("a line not found fades; a full list lets its weakest go only for one far stronger, one a step; one opened or pinned stays", () => {
  const full = [shown(0, 10), shown(16, 12), shown(32, 14), shown(48, 16)];
  const faded = Radar.merge(full, [line(64, 20)]);
  expect(faded.map((s) => [s.first, s.score])).toEqual([[0, 8.5], [16, 10.2], [32, 11.9], [48, 13.6]]);
  expect(Radar.merge(full, [line(64, 22), line(80, 21), line(0, 10), line(16, 12), line(32, 14), line(48, 16)]).map((s) => s.first)).toEqual([0, 16, 32, 48]);
  const swapped = Radar.merge(full, [line(64, 30), line(80, 30), line(0, 10), line(16, 12), line(32, 14), line(48, 16)]);
  expect(swapped.map((s) => s.first)).toEqual([16, 32, 48, 64]);
  const kept = Radar.merge([shown(0, 1, true), shown(16, 12), shown(32, 14), shown(48, 16)], [line(64, 40), line(16, 12), line(32, 14), line(48, 16)]);
  expect(kept.map((s) => s.first)).toEqual([0, 32, 48, 64]);
  expect(Radar.prune(full, 40, [[0, 4]]).map((s) => s.first)).toEqual([16]);
});

test("a line faded under the floor leaves, one a step, a new one joining at the foot in its room; one opened or pinned never", () => {
  const one = Radar.merge([shown(0, 5.5), shown(16, 5.2), shown(32, 20)], []);
  expect(one.map((s) => [s.first, s.score])).toEqual([[0, 4.68], [32, 17]]);
  expect(Radar.merge(one, []).map((s) => s.first)).toEqual([32]);
  expect(Radar.merge([shown(0, 5.5), shown(16, 12), shown(32, 14), shown(48, 16)], [line(64, 8)]).map((s) => s.first)).toEqual([16, 32, 48, 64]);
  expect(Radar.merge([shown(0, 1, true)], []).map((s) => s.first)).toEqual([0]);
});

// Short names, errnos, many words, young chats
// --------------------------------------------

const qs = (text: string) => Radar.units(text, []).map((u) => u.k + ":" + u.q);

test("an errno is an error by its name alone: a word in capitals that starts with E is none (a name, as any word in capitals)", () => {
  expect(qs("ENTER the EMPTY state; EXPECTED an EXCEPTION")).toEqual(["name:empty", "name:enter", "name:exception", "name:expected", "word:state"]);
  expect(qs("press enter on an empty line")).toEqual(["word:empty", "word:enter", "word:press"]);
  expect(qs("ENOENT, then E2BIG and EADDRINUSE")).toEqual(["error:e2big", "error:eaddrinuse", "error:enoent"]);
});

test("an acronym of three letters is a name, a word said loud not; a file's short name counts", () => {
  expect(qs("the MCP server's JWT over SSH, TLS and the API's CSV; OOM on CJK")).toEqual(["name:api", "name:cjk", "name:csv", "name:jwt", "name:mcp", "name:oom", "name:ssh", "name:tls", "word:server"]);
  expect(qs("NOT now, FYI: THE fix is IMPORTANT, TODO")).toEqual(["word:important"]);
  expect(qs("src/db.ts and io.go, not a.ts nor 01.md")).toEqual(["path:db ts", "path:io go"]);
});

// a young chat: ten episodes, a pool's resets met in three of them (2,
// 5, 8), and the zebu and the yurt and the kiwi in one (6), the rest
// noise; then a run at 160
const POOL = (k: number): Array<[string, string]> => [
  ["user", "the pool drops connections again " + k],
  ["tool", 'read {"path":"src/net/Pool.ts"}'],
  ["echo", "error: ECONNRESET on the socket\n(exit 1 in 0.4 s)"],
  ...noise(k).slice(3),
];
const ZOO: Array<[string, string]> = [["user", "the zebu sleeps in the yurt beside the kiwi"], ...noise(60).slice(1)];
const YOUNG = chat("young", [...noise(10), ...noise(11), ...POOL(12), ...noise(13), ...noise(14), ...POOL(15), ...ZOO, ...noise(17), ...POOL(18), ...noise(19), ["user", "next"]]);

test("in a young chat a topic come back in three episodes is still told", () => {
  const units = Radar.units("ECONNRESET in Pool.ts again", []);
  expect(Radar.search(YOUNG, { chat: YOUNG.chat, units, end: 160, out: [] }).map((f) => f.first + "+" + f.n).sort()).toEqual(["128+16", "32+16", "80+16"]);
});

test("rare words are found however many words come with them, wherever they sort", () => {
  const many = "accordingly beforehand candidates delightful elaborate fortunately generously happiness imagination juxtaposed knowledgeable lighthearted magnificent nevertheless outstanding particularly quarterbacks remarkable spectacular tremendously undoubtedly vocabulary wonderfully xenophobic yesterdays zealously";
  const zoo  = Radar.units(many + " kiwi yurt zebu", []);
  expect(Radar.search(YOUNG, { chat: YOUNG.chat, units: zoo, end: 160, out: [] }).map((f) => f.first + "+" + f.n)).toEqual(["96+16"]);
  expect(zoo.length).toBe(29);
  expect(zoo.map((u) => u.q)).toEqual(expect.arrayContaining(["kiwi", "yurt", "zebu"]));
});
