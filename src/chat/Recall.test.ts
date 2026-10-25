// Recall test
// ===========
// `bun test Recall.test.ts`. The radar's strong lines given to the model:
// a line is strong when anchored (a path or an error's name), of two
// units at least, past the bar (STRONG, then from the counts of the
// lines opened and pinned at the side: their lower quartile, up or down,
// never under its floor; words alone and counts that won't read change
// nothing). A line the caller holds whole already (its id as the side
// pins it and recall gives it, or as a zoom or a search wrote it) is
// never given again, #16 never naming #160, nor one its view holds at an
// episode's detail or finer; a subagent's run and what it holds are its
// log. illi's own memory and meta tools never start a search. Never
// slower: a search not answered a few ms after the tool is done gives no
// line and keeps the call no longer; one search at a time, a later call
// of its step sharing it (the line a fast call's search found late goes
// after a slower call of the step); one line a step, a step's calls
// sharing it. A line the user dismissed is left out of the search, and
// dropped if dismissed while it ran. `related` screen or off: no search.
// No line after a result with images, an empty one, nor one the line
// would push onto a page of its own. End to end on the search thread: a
// command naming a path and an error the chat met before gets that
// episode's line, last, after what it printed, under its <history> tags,
// and the leaf of its result holds none of it.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import { temp_dir, temp_repo } from "../../test/repo.ts";

const DIR = temp_dir("illi-recall-");
process.env.ILLI_DIR = DIR;
delete process.env.ILLI_PROFILE;

// the project the calls run in: a throwaway repository
const REPO = temp_repo("illi-recall-work-");

const config = await import("../config/Config.ts");
const { CAP, history_bare, history_block } = await import("../tools/Clip.ts");
const { Memory } = await import("./Memory.ts");
const { Projects } = await import("./Projects.ts");
const { Radar, ENOUGH, LOWEST, STRONG } = await import("./Radar.ts");
const { Recall, SKIP, WAIT } = await import("./Recall.ts");
const { Store } = await import("./Store.ts");
const { Tools } = await import("../tools/Tools.ts");
type Found = import("./Radar.ts").Found;
type Out = import("../ai/Agent.ts").Out;

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

const DAY = 86400000;

// The chat
// --------

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

// a hundred episodes (each unit's rarity as in a chat of 1,600 messages),
// the search thread's at 256, then the run now (1600 on): the user's
// message about the same error
const EPISODE = 256;
const START   = 1600;
const HISTORY = Array.from({ length: 100 }, (_, k) => (k === EPISODE / 16 ? SEEKER : noise(k))).flat();
const RUN: Array<[string, string]> = [["user", "SQLITE_BUSY again in the search thread"]];

// the chat's file: these messages (30 days ago, a minute apart), its
// whole tree built as the compactor builds one with no call (a leaf its
// message, a node its halves' lines joined while they fit, else their
// heads), then the memory over it, its cut at the run (all before it in
// the view's lines), nothing built after
const PLACE = Projects.place(REPO);
{
  const store = Store.open(DIR + "/chat", PLACE);
  const msgs  = [...HISTORY, ...RUN];
  const at    = Date.now() - 30 * DAY;
  Store.push(store, msgs.map(([kind, text], i) => ({ i, kind: kind as any, text, date: new Date(at + i * 60000).toISOString(), size: text.length })), REPO);
  let level = HISTORY.map(([kind, text]) => kind + ": " + text);
  for (let n = 1; level.length > 0; n *= 2) {
    Store.nodes(store, level.map((text, i) => ({ first: i * n, n, text })));
    level = Array.from({ length: Math.floor(level.length / 2) }, (_, i) => {
      const both = level[2 * i] + " " + level[2 * i + 1];
      return both.length <= 512 ? both : level[2 * i].slice(0, 250) + " " + level[2 * i + 1].slice(0, 250);
    });
  }
  Store.close(store);
}
const mem = Memory.load(DIR + "/chat", () => ({}) as any, PLACE);
mem.hold = true;
mem.cut = mem.show = START;

// the chat's tools, auto mode, no one to ask
const ask   = async () => ({ yes: false, always: false, said: "No one is at illi's screen to ask, so it isn't allowed." });
const tools = { mem, agents: new Map(), perm: { mode: "auto" as const, granted: new Set<string>(), refused: [], calls: new Map<string, string[]>() }, url: "", cwd: REPO, hooks: { main: () => null, ask, change: () => {}, halt: () => new AbortController().signal } as any, gone: [] as Array<[number, number]>, steps: new Map<string, number>(), given: new Map<string, number>() };
const signal = new AbortController().signal;

// the call now, as logged
const CALL = 'shell {"command":"bun test src/chat/Seeker.ts 2>&1 | grep SQLITE_BUSY"}';

// a recall of the chat's own agent, as Recall.ask makes it, with its call
const recall = (call = CALL, bar = STRONG) => ({ ...Recall.ask(tools, "main", call.split(" ")[0], JSON.parse(call.slice(call.indexOf(" ") + 1)))!, bar });

// the file, read as the search thread does: its own connection
const peek = <T>(read: (store: ReturnType<typeof Store.peek>) => T): T => {
  const store = Store.peek(mem.store.file);
  try {
    return read(store);
  } finally {
    Store.close(store);
  }
};

// a line found, as the thread answers
const found = (first: number, n: number, score = 30): Found => ({ first, n, text: "user: the search thread dies; echo: SQLITE_BUSY", score, units: 3, anchored: true, date: new Date(Date.now() - 3 * DAY).toISOString() });

// Projects.recall, stood in for while `f` runs: each ask counted, each
// answered as `answer` says
async function stood<T>(answer: (ask: unknown) => Promise<Found | null>, f: (asks: unknown[]) => Promise<T>): Promise<T> {
  const real = Projects.recall;
  const asks: unknown[] = [];
  (Projects as any).recall = (_file: string, ask: unknown) => (asks.push(ask), answer(ask));
  try {
    return await f(asks);
  } finally {
    (Projects as any).recall = real;
  }
}

// a result, plain
const result = (text: string, more: Partial<Out> = {}): Out => ({ text, fail: false, ...more });

// The bar
// -------

test("the bar is STRONG till twenty lines matching a path or an error were opened or pinned, then their lower quartile, up or down, never under its floor", () => {
  expect(Radar.bar(null)).toBe(STRONG);
  expect(Radar.bar({ opened: { anchored: { "30": ENOUGH - 1 } } })).toBe(STRONG);
  expect(Radar.bar({ opened: { anchored: { "12": 5, "20": 10 } }, pinned: { anchored: { "40": 5 } } })).toBe(12);
  expect(Radar.bar({ opened: { anchored: { "12": 4, "20": 10 } }, pinned: { anchored: { "40": 6 } } })).toBe(20);
  expect(Radar.bar({ opened: { anchored: { "24": 20 } } })).toBe(24);
  expect(Radar.bar({ opened: { anchored: { "6": 20 } } })).toBe(LOWEST);
  // words alone, the shown and the dismissed, and what won't read: no say
  expect(Radar.bar({ opened: { words: { "3": 50 } }, shown: { anchored: { "6": 90 } }, dismissed: { anchored: { "6": 90 } } })).toBe(STRONG);
  expect(Radar.bar({ opened: { anchored: { "x": 30, "16": "many", "18": -2 } } })).toBe(STRONG);
  expect(Radar.bar({ opened: 7, pinned: [] })).toBe(STRONG);
  expect(STRONG).toBeGreaterThanOrEqual(3 * 5);
  expect(LOWEST).toBeGreaterThan(5);
});

test("the bar is read from the side's counts in the root (a temp folder here), kept a minute", () => {
  expect(config.RELATED_FILE).toBe(DIR + "/related.json");
  expect(config.RELATED_FILE.startsWith(DIR)).toBe(true);
  const later = Date.now() + 3600000;
  fs.rmSync(config.RELATED_FILE, { force: true });
  expect(Recall.bar(later)).toBe(STRONG);
  fs.writeFileSync(config.RELATED_FILE, JSON.stringify({ opened: { anchored: { "22": 30 } } }));
  expect(Recall.bar(later + 1000)).toBe(STRONG);
  expect(Recall.bar(later + 61000)).toBe(22);
  fs.writeFileSync(config.RELATED_FILE, "not json");
  expect(Recall.bar(later + 122000)).toBe(STRONG);
  fs.rmSync(config.RELATED_FILE, { force: true });
});

// The line
// --------

test("a strong line is anchored, of two units at least, past the bar; the side's weaker lines never are", () => {
  const first = peek((store) => Radar.recall(store, recall()));
  expect(first).toMatchObject({ first: EPISODE, n: 16, anchored: true });
  expect(first!.units).toBeGreaterThanOrEqual(2);
  expect(first!.score).toBeGreaterThanOrEqual(STRONG);
  expect(peek((store) => Radar.recall(store, recall(CALL, first!.score + 1)))).toBeNull();
  // the path alone, the error alone (the user's message said it), words
  // alone: found at the side, never strong
  const side = (call: string) => peek((store) => Radar.search(store, { chat: mem.store.chat, units: Radar.units(null, [{ kind: "tool", text: call }]), end: START, out: [] }));
  const path = 'read {"path":"src/chat/Seeker.ts"}';
  expect(side(path).map((f) => f.first)).toContain(EPISODE);
  expect(side(path).every((f) => !Radar.strong(f, STRONG))).toBe(true);
  expect(Radar.strong({ ...first!, units: 1 }, STRONG)).toBe(false);
  expect(Radar.strong({ ...first!, anchored: false }, STRONG)).toBe(false);
  expect(Radar.strong({ ...first!, score: STRONG - 0.01 }, STRONG)).toBe(false);
});

test("a line given reads its id as zoom and the side take it, its age, its summary on one line, cut short", () => {
  const line = Recall.line({ ...found(EPISODE, 16), text: "user: the search thread\ndies " + "and more ".repeat(60) });
  expect(line).toStartWith("#256+16 · 3d ago · the search thread dies and more");
  expect(line.endsWith("…")).toBe(true);
  expect(line.length).toBeLessThan(240);
  expect(Recall.line({ ...found(40, 1), date: "" })).toBe("#40 · the search thread dies; echo: SQLITE_BUSY");
});

test("a subagent's run is its log, from its task on; what it holds whole is its log; its view's lines at message detail are left out", () => {
  peek((store) => {
    Store.work_push(store, "Ada.t1", "Ada", { i: 0, kind: "note", text: "subagent", date: new Date().toISOString() });
    Store.work_push(store, "Ada.t1", "Ada", { i: 1, kind: "user", text: "find why SQLITE_BUSY comes back", date: new Date().toISOString() });
    Store.work_push(store, "Ada.t1", "Ada", { i: 2, kind: "tool", text: 'read {"path":"README.md"}', date: new Date().toISOString() });
  });
  const view = [{ text: "<chat>\n", mark: false }, { text: "0+1024|user: a\n1024+512|illi: b\n1536+32|x\n1568+1|y\n1569+1|z\n</chat>\n", mark: true }];
  tools.agents.set("Ada", { name: "Ada", run: 0, log: "Ada.t1", role: { $: "sub", effort: null, agent: null }, call: null, live: [], calls: {}, stop: false, view, replies: [] });
  expect(Recall.parts(view)).toEqual([[0, 1024], [1024, 512], [1536, 32], [1568, 1], [1569, 1]]);
  expect(Recall.parts(view)).toBe(Recall.parts(view));
  const asked = Recall.ask(tools, "Ada", "shell", { command: "bun test src/chat/Seeker.ts" })!;
  expect([asked.log, asked.end, asked.out, asked.from]).toEqual(["Ada.t1", 1568, [], 0]);
  expect(peek((store) => Radar.ran(store, "Ada.t1"))).toEqual({ user: "find why SQLITE_BUSY comes back", run: [{ kind: "tool", text: 'read {"path":"README.md"}' }] });
  expect(peek((store) => Radar.recall(store, asked))).toMatchObject({ first: EPISODE, n: 16 });
  peek((store) => Store.work_push(store, "Ada.t1", "Ada", { i: 3, kind: "echo", text: "x\n\n<history>#256+16 · 3d ago · y</history>", date: new Date().toISOString() }));
  expect(peek((store) => Radar.recall(store, asked))).toBeNull();
  expect(Recall.ask(tools, "Nobody", "shell", {})).toBeNull();
  tools.agents.delete("Ada");
});

test("a line the caller's view holds at an episode's detail or finer is never given: its view says as much; one it holds coarser is", () => {
  const was = mem.view.parts;
  const tile = (parts: Array<{ l: number; i: number }>) => [...parts, ...Memory.roots(START, parts.reduce((m, p) => Math.max(m, Memory.span(p)[1]), 0))];
  const line = () => peek((store) => Radar.recall(store, recall()));
  try {
    // the episode in two lines of 8: what the side's search leaves out
    // (message detail alone) finds the view's own line, never given
    mem.view.parts = tile([{ l: 8, i: 0 }, { l: 3, i: 32 }, { l: 3, i: 33 }]);
    const side = Radar.left(Memory.before(mem.view.parts, START).map((p): [number, number] => [Memory.span(p)[0], 2 ** p.l]), START, []);
    expect(peek((store) => Radar.recall(store, { ...recall(), ...side }))).toMatchObject({ first: EPISODE, n: 8 });
    expect(recall().out.some(([a, b]) => a <= EPISODE && b >= EPISODE + 16)).toBe(true);
    expect(line()?.first ?? -1).not.toBe(EPISODE);
    // as one line of 16, the same
    mem.view.parts = tile([{ l: 8, i: 0 }, { l: 4, i: 16 }]);
    expect(line()?.first ?? -1).not.toBe(EPISODE);
    // inside a line of 512: given
    mem.view.parts = tile([{ l: 9, i: 0 }]);
    expect(line()).toMatchObject({ first: EPISODE, n: 16 });
  } finally {
    mem.view.parts = was;
  }
  // a subagent's view alike
  const view = [{ text: "<chat>\n256+8|user: the search thread dies\n264+8|illi: Store.wal\n272+16|x\n</chat>\n", mark: true }];
  tools.agents.set("Cy", { name: "Cy", run: 0, log: "Cy.t1", role: { $: "sub", effort: null, agent: null }, call: null, live: [], calls: {}, stop: false, view, replies: [] });
  const cy = Recall.ask(tools, "Cy", "shell", { command: "ls" })!;
  expect([cy.end, cy.out]).toEqual([288, [[256, 288]]]);
  // its end where the side's is, so a unit's rarity is counted alike
  expect(Recall.left([[0, 256], [256, 8], [264, 8]], Infinity, [])).toEqual({ end: 272, out: [[256, 272]] });
  expect(Recall.left([[0, 256], [256, 8], [264, 1]], Infinity, [])).toEqual({ end: 264, out: [[256, 264]] });
  expect(Recall.left([[0, 256], [256, 32]], Infinity, [])).toEqual({ end: 288, out: [] });
  tools.agents.delete("Cy");
});

// When
// ----

test("illi's own memory and meta tools never start a search; shell, files, MCP and plugin tools do", async () => {
  await stood(async () => null, async (asks) => {
    for (const name of SKIP) {
      expect([name, Recall.start(tools, "main", name, {})]).toEqual([name, null]);
    }
    expect(asks).toHaveLength(0);
    for (const name of ["shell", "read", "write", "edit", "mcp__github__get_issue", "plugin__notes__add"]) {
      const pending = Recall.start(tools, "main", name, { path: "src/chat/Seeker.ts" });
      expect([name, pending === null]).toEqual([name, false]);
      await pending!.found;
    }
    expect(asks).toHaveLength(6);
    expect(await Tools.call(tools, "main", "date", { id: 3 }, signal)).toMatchObject({ fail: false });
    expect(asks).toHaveLength(6);
  });
  expect([...SKIP].sort()).toEqual(["approve", "ask", "date", "projects", "search", "skill", "spawn", "tell", "todo", "zoom"]);
});

test("never slower: a search not answered a few ms after the tool is done gives no line and holds the call no longer; a later call of its step shares it, and gets the line once it answers; one answered gives its line, last", async () => {
  let let_go = () => {};
  const slow = new Promise<Found | null>((done) => (let_go = () => done(found(EPISODE, 16))));
  await stood(() => slow, async (asks) => {
    tools.given.clear();
    Recall.step(tools, "main");
    const pending = Recall.start(tools, "main", "read", { path: "a.ts" })!;
    // one search at a time: a later call of the same step shares it,
    // another caller's gets none
    const later = Recall.start(tools, "main", "shell", { command: "bun test" });
    expect(later).toBe(pending);
    expect(Recall.start(tools, "Di", "shell", { command: "ls" })).toBeNull();
    const at  = performance.now();
    const out = await Recall.end(tools, pending, result("a"), signal);
    expect(performance.now() - at).toBeLessThan(WAIT + 40);
    expect(out.text).toBe("a");
    expect(asks).toHaveLength(1);
    let_go();
    await slow;
    await Bun.sleep(0);
    // the slower call, ending after it answered, takes the line
    expect((await Recall.end(tools, later, result("12 pass\n(exit 0 in 2.0 s)"), signal)).text).toEndWith("</history>");
    // the next step's first call starts a search of its own
    Recall.step(tools, "main");
    const next = Recall.start(tools, "main", "read", { path: "b.ts" });
    expect(next).not.toBe(pending);
    expect(asks).toHaveLength(2);
    await next!.found;
  });
  await stood(async () => found(EPISODE, 16), async () => {
    tools.given.clear();
    const out = await Tools.call(tools, "main", "shell", { command: "echo hi" }, signal);
    expect(out.text).toStartWith("hi\n(exit 0 in ");
    expect(out.text).toEndWith("\n\n<history>#256+16 · 3d ago · the search thread dies; echo: SQLITE_BUSY</history>");
    expect(history_bare(out.text)).toMatch(/^hi\n\(exit 0 in [\d.]+ s\)$/);
  });
});

test("one line a step: a step's calls share it, the next step may have one", async () => {
  await stood(async () => found(EPISODE, 16), async () => {
    tools.given.clear();
    Recall.step(tools, "main");
    const first  = await Recall.end(tools, Recall.start(tools, "main", "shell", { command: "a" }), result("one"), signal);
    const second = await Recall.end(tools, Recall.start(tools, "main", "shell", { command: "b" }), result("two"), signal);
    expect([first.text.includes("<history>"), second.text]).toEqual([true, "two"]);
    // two at once: the first to end has it
    Recall.step(tools, "main");
    const a = Recall.start(tools, "main", "read", { path: "a" });
    const b = { ...a!, found: Promise.resolve(found(EPISODE, 16)) };
    const [x, y] = await Promise.all([Recall.end(tools, a, result("x"), signal), Recall.end(tools, b, result("y"), signal)]);
    expect([x.text, y.text].filter((t) => t.includes("<history>"))).toHaveLength(1);
    Recall.step(tools, "main");
    expect((await Recall.end(tools, Recall.start(tools, "main", "shell", { command: "c" }), result("three"), signal)).text).toContain("<history>");
    // another caller's steps are its own
    expect(Recall.start(tools, "main", "shell", { command: "d" })).toBeNull();
    tools.agents.set("Bo", { name: "Bo", run: 0, log: "Bo.t1", role: { $: "sub", effort: null, agent: null }, call: null, live: [], calls: {}, stop: false, view: [], replies: [] });
    const bo = Recall.start(tools, "Bo", "shell", { command: "d" });
    expect(bo).not.toBeNull();
    await bo!.found;
    tools.agents.delete("Bo");
  });
});

test("a line the user dismissed is left out of the search, and dropped if dismissed while the search ran", async () => {
  tools.gone.push([EPISODE, EPISODE + 16]);
  expect(recall().out).toContainEqual([EPISODE, EPISODE + 16]);
  expect(peek((store) => Radar.recall(store, recall()))?.first ?? -1).not.toBe(EPISODE);
  tools.gone.length = 0;
  await stood(async () => found(EPISODE, 16), async () => {
    Recall.step(tools, "main");
    const pending = Recall.start(tools, "main", "shell", { command: "ls" });
    tools.gone.push([EPISODE + 8, EPISODE + 16]);
    expect((await Recall.end(tools, pending, result("ls"), signal)).text).toBe("ls");
  });
  tools.gone.length = 0;
});

test("related screen or off: no search, no line; on: both", async () => {
  await stood(async () => found(EPISODE, 16), async (asks) => {
    for (const value of ["screen", "off", false]) {
      config.config_set("related", value);
      Recall.step(tools, "main");
      expect([value, Recall.start(tools, "main", "shell", { command: "ls" })]).toEqual([value, null]);
    }
    expect(asks).toHaveLength(0);
    config.config_set("related", "on");
    Recall.step(tools, "main");
    const pending = Recall.start(tools, "main", "shell", { command: "ls" });
    config.config_set("related", "screen");
    expect((await Recall.end(tools, pending, result("ls"), signal)).text).toBe("ls");
    config.config_set("related", null);
    Recall.step(tools, "main");
    expect((await Recall.end(tools, Recall.start(tools, "main", "shell", { command: "ls" }), result("ls"), signal)).text).toContain("<history>");
  });
});

test("no line after a result with images, an empty one, nor one the line would push onto a page of its own; a long result's line ends its last page", async () => {
  await stood(async () => found(EPISODE, 16), async () => {
    const give = async (out: Out) => {
      Recall.step(tools, "main");
      return Recall.end(tools, Recall.start(tools, "main", "read", { path: "a.png" }), out, signal);
    };
    expect((await give(result("Image a.png", { imgs: [{ type: "image/png", data: "" }] }))).text).toBe("Image a.png");
    // an empty one keeps its "(no output)" (Agent.use)
    expect((await give(result(""))).text).toBe("");
    const full = "x".repeat(CAP - 50);
    expect((await give(result(full))).text).toBe(full);
    expect((await give(result("y".repeat(CAP - 400)))).text).toContain("<history>");
    // a failed one is logged with FAILED first (Agent.ts): its page too
    const block  = history_block(Recall.line(found(EPISODE, 16)));
    const failed = "z".repeat(CAP - block.length - 3);
    expect((await give(result(failed, { fail: true }))).text).toBe(failed);
    expect((await give(result(failed))).text).toBe(failed + block);
    const long = "a\n".repeat((CAP * 3) / 4);
    const given = (await give(result(long))).text;
    expect(given).toContain("<history>");
    const pages = Memory.pages({ kind: "echo", text: given }).map((p) => p.text);
    expect(pages.slice(0, -1).some((p) => p.includes("<history>"))).toBe(false);
    expect(history_bare(pages[pages.length - 1])).not.toContain("<history>");
  });
});

// End to end
// ----------

test("end to end: a command naming a path and an error the chat met before gets that episode's line from the search thread, and its leaf holds none of it", async () => {
  tools.given.clear();
  Recall.step(tools, "main");
  const out = await Tools.call(tools, "main", "shell", { command: "sleep 0.5; echo src/chat/Seeker.ts: SQLITE_BUSY" }, signal);
  expect(out.text).toMatch(/^src\/chat\/Seeker\.ts: SQLITE_BUSY\n\(exit 0 in [\d.]+ s\)\n\n<history>#256\+16 · \d+d ago · the search thread dies when two illis open one file[^\n]*<\/history>$/);
  const [logged] = Memory.push(mem, [{ kind: "echo", text: out.text }]);
  expect(Memory.source(mem, 0, logged.i)).toBe("echo: " + history_bare(out.text));
});

// Named already (last: the messages it logs stay in the chat)
// -------------

test("a line the caller holds whole by its id (a pin, a recall before) or as a zoom or a search wrote it is never given again; #16 never names #160", () => {
  expect(Radar.named(["see #256+16 and #40", "256+8|user: a\n264+8|illi: b", "app-x 512+16|x", "a16+8|", "#2560 x", "40+0|user: hi"])).toEqual([[256, 272], [40, 41], [256, 264], [264, 272], [512, 528], [2560, 2561], [40, 41]]);
  const said = (text: string) => {
    const at = Memory.push(mem, [{ kind: "echo", text }])[0].i;
    return { at, line: peek((store) => Radar.recall(store, { ...recall(), from: at })) };
  };
  const pinned = said("the user pinned #256+16");
  expect(pinned.line).toBeNull();
  expect(peek((store) => Radar.recall(store, { ...recall(), from: pinned.at + 1 }))).toMatchObject({ first: EPISODE });
  expect(said("zoomed:\n256+8|user: the search thread dies\n264+8|illi: Store.wal").line).toBeNull();
  expect(said("done\n\n<history>#256+16 · 3d ago · the search thread dies</history>").line).toBeNull();
  expect(said("issue #2560 and #25 are other things").line).toMatchObject({ first: EPISODE });
  expect(said("half of it: 260+4|tool: shell").line).toBeNull();
});
