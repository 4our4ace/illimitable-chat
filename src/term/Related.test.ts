// Related test
// ============
// `bun test Related.test.ts`. The radar on screen: a search in the
// search thread after a step of a turn (the user's message, the last of
// its results, the turn's end), never as text streams, finds the past
// episode the run shares a path and an error with, and the side shows
// it under Related: its age, its summary, its id (left out when
// narrow). A click on it opens it at full detail (a pane: its messages
// whole); on its id pins it (the id typed into the input); on the head
// lists them (Enter opens, Tab pins, Del dismisses, never found again).
// Without the side the bottom line counts them. Each shown, opened,
// pinned and dismissed is counted by its score in related.json, no text
// in it. `related` off: nothing.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-related-");
process.env.ILLI_DIR = DIR;
delete process.env.ILLI_PROFILE;

const config = await import("../config/Config.ts");
const { Projects } = await import("../chat/Projects.ts");
const { Store } = await import("../chat/Store.ts");
const Related = await import("./Related.ts");
const { term_side_drawn } = await import("./Side.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

const DAY = 86400000;

// a chat of these messages ([kind, text], 3½ days ago, a minute apart),
// its tree built as the compactor builds one with no call: a leaf its
// message, a node its halves' lines joined while they fit, else their
// heads
function chat(msgs: Array<[string, string]>): ReturnType<typeof Store.open> {
  const store = Store.open(DIR + "/chat", { key: "git:/work/app", name: "app", path: "/work/app" });
  const at = Date.now() - 3.5 * DAY;
  Store.push(store, msgs.map(([kind, text], i) => ({ i, kind: kind as any, text, date: new Date(at + i * 60000).toISOString(), size: text.length })), "/work");
  let level = msgs.map(([kind, text]) => kind + ": " + text);
  for (let n = 1; level.length > 0; n *= 2) {
    Store.nodes(store, level.map((text, i) => ({ first: i * n, n, text })));
    level = Array.from({ length: Math.floor(level.length / 2) }, (_, i) => {
      const both = level[2 * i] + " " + level[2 * i + 1];
      return both.length <= 512 ? both : level[2 * i].slice(0, 250) + " " + level[2 * i + 1].slice(0, 250);
    });
  }
  return store;
}

// 16 messages of work on what every chat holds
const noise = (k: number): Array<[string, string]> => Array.from({ length: 16 }, (_, i): [string, string] =>
  i % 4 === 0 ? ["user", "please run the tests again " + k] : i % 4 === 1 ? ["tool", 'shell {"command":"bun test"}'] : i % 4 === 2 ? ["echo", "(exit 0 in 1 s)"] : ["illi", "The tests pass."]);

// the episode about the search thread's lock
const SEEKER: Array<[string, string]> = [
  ["user", "the search thread dies when two illis open one file"],
  ["tool", 'read {"path":"src/chat/Seeker.ts"}'],
  ["echo", "error: SQLITE_BUSY: database is locked"],
  ["illi", "Store.wal retries while another illi holds the lock."],
  ...noise(9).slice(4),
];

// the run now: from message 64, the turn's
const RUN: Array<[string, string]> = [
  ["user", "SQLITE_BUSY again in the search thread"],
  ["tool", 'read {"path":"src/chat/Seeker.ts"}'],
  ["echo", "self.onmessage = (e) => {}"],
];
const store = chat([...noise(0), ...SEEKER, ...noise(1), ...noise(2), ...RUN]);

// a terminal with no screen, its view of the chat above (the older
// messages in blocks, the run whole from its turn), the side 40 wide; a
// paint always due
const term = () => {
  const v = View.view_new();
  v.parts = [[0, 32], [32, 16], [48, 8], [56, 4], [60, 2], [62, 1], [63, 1], [64, 1], [65, 1], [66, 1]];
  v.turn  = 64;
  RUN.forEach(([kind, text], k) => v.whole.set(64 + k, { kind: kind as any, text }));
  return { v, chat: null, mem: () => ({ store }), scr: { tty: true, ed: Screen.ed_new() }, choose: null, question: null, wait: null, pane: null, sug: null, notices: [], agents: [], profs: ["default"], subs: new Map(), since: Date.now(), todo: false, quit: 0, due: true, ver: 0, dropped: "" } as any;
};

// whether `f` holds within `ms` (looked at every 20 ms)
const until = async (f: () => boolean, ms = 5000) => {
  for (const end = Date.now() + ms; !f() && Date.now() < end; ) {
    await Bun.sleep(20);
  }
  return f();
};

// the side's lines as text from the Related head on (blank ones left
// out), each with its clicks
const related = (t: any, w = 40) => {
  const items = term_side_drawn(t, w, 60).items.map(([line, run, aside]) => [line.map((r) => r.x).join(""), run, aside] as const);
  const at = items.findIndex(([text]) => text === "Related");
  return at < 0 ? [] : items.slice(at).filter(([text]) => text.trim() !== "").slice(0, 1 + Related.related_shown(t).length);
};

test("a search after a step finds the episode the run shares a path and an error with; the side shows it: its age, its summary, its id", async () => {
  const t = term();
  await Related.related_seek(t);
  expect(Related.related_shown(t).map((s) => s.first + "+" + s.n)).toEqual(["16+16"]);
  const [head, line] = related(t);
  expect(head[0]).toBe("Related");
  expect(line[0]).toBe("3d  the search thread dies when…  #16+16");
  expect(Paint.text_width(line[0])).toBe(40);
  expect(related(t, 22)[1][0]).toBe("3d  the search thread…");
  expect(related(t, 22)[1][2]).toBeUndefined();
});

test("a click on a line opens it at full detail, on its id pins it, on the head lists them: Enter opens, Tab pins, Del dismisses", async () => {
  const t = term();
  await Related.related_seek(t);
  const [head, line] = related(t);
  line[1]!();
  expect(t.pane.title).toBe("#16+16 · 3d ago");
  const text = t.pane.make(60).map((l: any) => l.map((r: any) => r.x).join("")).join("\n");
  expect(text).toContain("the search thread dies when two illis open one file");
  expect(text).toContain("SQLITE_BUSY: database is locked");
  expect(Related.related_shown(t)[0].touched).toBe(true);
  t.pane = null;
  Screen.ed_type(t.scr.ed, "see");
  line[2]!.run!();
  expect(t.scr.ed.text).toBe("see #16+16 ");
  head[1]!();
  expect([t.choose.title, t.choose.names.length, t.choose.about, t.choose.foot(0)]).toEqual(["Related", 1, ["3d ago · #16+16"], "Enter opens · Tab pins its id · Del dismisses"]);
  expect(t.choose.names[0]).toBe("the search thread dies when two illis open one file tool…");
  expect(t.choose.keys(0, "Tab")).toBe(true);
  expect(t.scr.ed.text).toBe("see #16+16 #16+16 ");
  head[1]!();
  expect(t.choose.keys(0, "Delete")).toBe(true);
  expect([t.choose, Related.related_shown(t), related(t)]).toEqual([null, [], []]);
  await Related.related_seek(t);
  expect(Related.related_shown(t)).toEqual([]);
});

test("each line shown, opened, pinned and dismissed is counted by its score, anchored or words alone; no text, no id", async () => {
  Related.related_keep();
  fs.rmSync(Related.RELATED, { force: true });
  const t = term();
  await Related.related_seek(t);
  const s = Related.related_shown(t)[0];
  Related.related_open(t, s);
  Related.related_pin(t, s);
  Related.related_dismiss(t, s);
  Related.related_keep();
  const at = String(Math.floor(s.peak));
  const kept = JSON.parse(fs.readFileSync(Related.RELATED, "utf8"));
  expect(kept).toEqual({ shown: { anchored: { [at]: 1 } }, opened: { anchored: { [at]: 1 } }, pinned: { anchored: { [at]: 1 } }, dismissed: { anchored: { [at]: 1 } } });
  Related.related_count("opened", { ...s, peak: 3.9, anchored: false });
  Related.related_keep();
  expect(JSON.parse(fs.readFileSync(Related.RELATED, "utf8")).opened).toEqual({ anchored: { [at]: 1 }, words: { "3": 1 } });
  expect(fs.readFileSync(Related.RELATED, "utf8")).not.toMatch(/thread|seeker|16/i);
});

test("a step's end searches, once its results are all in: the user's message, the last result, the turn's end; never a stream's piece; none from a pipe", async () => {
  const radar = Projects.radar;
  let asked = 0;
  (Projects as any).radar = (...args: Parameters<typeof radar>) => (asked++, radar(...args));
  try {
    const t = term();
    const hear = (msg: any) => {
      View.view_hear(t.v, msg);
      Related.related_hear(t, msg);
    };
    hear({ $: "delta", kind: "illi", text: "SQLITE_BUSY" });
    hear({ $: "entry", id: 67, kind: "illi", text: "Looking." });
    hear({ $: "entry", id: 68, kind: "tool", text: 'read {"path":"src/chat/Seeker.ts"}' });
    hear({ $: "entry", id: 69, kind: "tool", text: 'read {"path":"src/chat/Store.ts"}' });
    hear({ $: "entry", id: 70, kind: "echo", text: "a" });
    await Bun.sleep(400);
    expect(asked).toBe(0);
    hear({ $: "entry", id: 71, kind: "echo", text: "b" });
    hear({ $: "entry", agent: "Ann", kind: "echo", text: "ok" });
    expect(await until(() => asked === 1 && Related.related_shown(t).length === 1)).toBe(true);
    hear({ $: "state", busy: true });
    hear({ $: "state", busy: true });
    hear({ $: "state", busy: false });
    expect(await until(() => asked === 2)).toBe(true);
    const pipe = { ...term(), scr: { tty: false, ed: Screen.ed_new() } };
    Related.related_hear(pipe, { $: "entry", id: 64, kind: "user", text: "SQLITE_BUSY" });
    await Bun.sleep(400);
    expect(asked).toBe(2);
  } finally {
    (Projects as any).radar = radar;
  }
});

test("without the side the bottom line counts them, a narrow one doesn't; `related` off, nothing", async () => {
  const t = term();
  await Related.related_seek(t);
  expect(Paint.tabs_line(t.v, 80, true, true, Related.related_shown(t).length).map((r) => r.x).join("")).toMatch(/1 related · auto mode$/);
  expect(Paint.tabs_line(t.v, 30, true, true, 1).map((r) => r.x).join("")).not.toContain("related");
  config.config_set("related", "off");
  try {
    expect([Related.related_shown(t), related(t)]).toEqual([[], []]);
  } finally {
    config.config_set("related", null);
  }
  expect(Related.related_shown(t).length).toBe(1);
});
