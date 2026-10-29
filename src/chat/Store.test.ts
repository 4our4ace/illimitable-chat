// Store test
// ==========
// `bun test Store.test.ts`. A project's file is named after it, under
// projects/, in WAL mode with illi's mark; illis starting at once each
// get their project's file, two at one place the same. A newer illi's
// file opens while it only added; one that needs a newer illi is
// refused, and left out of the projects; an older one, refused. Each
// place is its own project with its own file and chat; a file another
// place's already, numbered; a name looked up only among the files. The
// projects are listed the one used last first, with their latest line,
// a message of two pages counted once; a search finds lines with all
// the words (else any), in a project or all, every match ranked however
// old, each chat's best first (a big chat's never crowd out a small
// one's, the projects with lines left out named), a project forgotten
// meanwhile left out; a big chat leaves out a word in most lines all
// along while a rarer one is in, a word common only of late kept. A
// project forgotten is gone, its file deleted; a reader of it goes on
// as it was, and its close leaves the place's new file alone. A file
// that won't open is named. A span of time is found by bisection, in
// point reads alone: whole messages (one of three pages stands where its
// first is dated), a clock set back ending it all the same; a search in
// a span keeps the lines over its messages alone, the best of those, not
// the best of all cut down, in each chat's own span.

import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-store-");
process.env.ILLI_DIR = DIR;

const { HOME, Store } = await import("./Store.ts");
const { Projects } = await import("./Projects.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

const APP  = { key: "git:/work/app", name: "app-k3f9x2", path: "/work/app" };
const SITE = { key: "git:/work/site", name: "site-7q2m0d", path: "/work/site" };
const date = "2026-10-21T10:00:00.000Z";

// a message pushed to a store's chat, its summary line built
function say(store: any, text: string, images?: string[]): void {
  const i = Store.count(store);
  Store.push(store, [{ i, kind: "user", text, date, size: text.length, images }], "/work");
  Store.nodes(store, [{ first: i, n: 1, text: "user: " + text }]);
}

test("a project's file is named after it, under projects/, in WAL mode with illi's mark, at this version", () => {
  const store = Store.open(DIR + "/new", APP);
  const get = (pragma: string) => Object.values(store.db.query("pragma " + pragma).get() as object)[0];
  expect(store.file).toBe(DIR + "/new/projects/app-k3f9x2.sqlite");
  expect([get("application_id"), get("journal_mode"), get("user_version")]).toEqual([0x696c6c69, "wal", 3]);
  Store.close(store);
  expect([fs.readdirSync(DIR + "/new"), fs.readdirSync(DIR + "/new/projects")]).toEqual([["projects"], ["app-k3f9x2.sqlite"]]);
});

test("illis starting at once each get their project's file, two at one place the same project and chat", async () => {
  const at = Date.now() + 1500;
  const script = DIR + "/race.ts";
  fs.writeFileSync(script, `
    const { Store } = await import(${JSON.stringify(import.meta.dir + "/Store.ts")});
    const k = Number(process.argv[2]) % 3;
    while (Date.now() < ${at}) {}
    const store = Store.open(${JSON.stringify(DIR + "/race")}, { key: "git:/work/p" + k, name: "p" + k, path: "/work/p" + k });
    Store.push(store, [{ i: Number(process.argv[2]) < 3 ? 0 : 1, kind: "user", text: "hi from p" + k, date: "${date}", size: 5 }], "/work");
    console.log(store.file + " " + store.project + " " + store.chat);
    Store.close(store);
    process.exit(0);
  `);
  const runs = Array.from({ length: 6 }, (_, k) => Bun.spawn(["bun", script, String(k)], { env: { ...process.env, ILLI_DIR: DIR }, stdout: "pipe", stderr: "pipe" }));
  const outs = await Promise.all(runs.map(async (p) => [await new Response(p.stdout).text(), await new Response(p.stderr).text(), await p.exited]));
  expect(outs.map((o) => [o[1], o[2]])).toEqual(Array.from({ length: 6 }, () => ["", 0]));
  expect(outs.map((o) => o[0])).toEqual([0, 1, 2, 0, 1, 2].map((k) => DIR + "/race/projects/p" + k + ".sqlite 1 1\n"));
  const store = Store.open(DIR + "/race");
  expect(Store.projects(store).map((p) => p.name + " " + p.count).sort()).toEqual(["home 0", "p0 2", "p1 2", "p2 2"]);
  Store.close(store);
}, 20000);

test("a newer illi's file opens while it only added; one that needs a newer illi is refused, and left out of the projects (logged)", () => {
  const app = Store.open(DIR + "/newer", APP);
  const store = Store.open(DIR + "/newer");
  store.db.run("pragma user_version = 7");
  Store.close(store);
  expect(() => Store.close(Store.open(DIR + "/newer"))).not.toThrow();
  const db = new Database(store.file);
  db.run("update meta set value = '7' where key = 'compat'");
  db.close();
  expect(() => Store.open(DIR + "/newer")).toThrow("chat: home.sqlite is of a newer illi: update illi to open it.");
  const error = console.error;
  const logged: string[] = [];
  console.error = (text: string) => logged.push(text);
  try {
    expect(Store.projects(app).map((p) => p.name)).toEqual(["app-k3f9x2"]);
  } finally {
    console.error = error;
  }
  expect(logged).toEqual(["illi: chat: home.sqlite is of a newer illi: update illi to open it."]);
  Store.close(app);
});

test("a file of an older version is refused, said by its name", () => {
  const store = Store.open(DIR + "/older", APP);
  store.db.run("pragma user_version = 2");
  Store.close(store);
  expect(() => Store.open(DIR + "/older", APP)).toThrow("chat: app-k3f9x2.sqlite is of an older illi this one can't open: move it away to start the project fresh.");
});

test("each place is its own project with its own file and chat; the same place, the same chat; a file another place's already, numbered; a name looked up among the files only", () => {
  const home = Store.open(DIR + "/places");
  const app = Store.open(DIR + "/places", APP);
  const again = Store.open(DIR + "/places", APP);
  expect([home.file, app.file]).toEqual([DIR + "/places/projects/home.sqlite", DIR + "/places/projects/app-k3f9x2.sqlite"]);
  expect([again.file, again.project, again.chat]).toEqual([app.file, app.project, app.chat]);
  say(app, "the audio player seeks");
  expect([Store.count(app), Store.count(home)]).toEqual([1, 0]);
  expect([Store.lookup(home, "app-k3f9x2"), Store.lookup(home, "nope"), Store.lookup(home, "../projects/home")]).toEqual([app.file, null, null]);
  const twin = Store.open(DIR + "/places", { ...APP, key: "git:/elsewhere/app" });
  expect([twin.file, Store.named(twin)]).toEqual([DIR + "/places/projects/app-k3f9x2-2.sqlite", { name: "app-k3f9x2-2", path: "/work/app" }]);
  expect(Store.projects(home).map((p) => p.name).sort()).toEqual(["app-k3f9x2", "app-k3f9x2-2", "home"]);
  [home, app, again, twin].forEach(Store.close);
  expect(HOME.key).toBe("home");
});

test("the projects, the one used last first, with their latest line; a search, all the words else any, in a project or all", () => {
  const home = Store.open(DIR + "/search");
  const app = Store.open(DIR + "/search", APP);
  const site = Store.open(DIR + "/search", SITE);
  say(app, "fix the audio player seek bug");
  say(app, "the login token refresh");
  say(site, "the audio waveform on the landing page");
  Store.push(site, [{ i: 1, kind: "illi", text: "later, page one", date: "2026-10-22T10:00:00.000Z", size: 5, more: true }, { i: 2, kind: "illi", text: "page two", date: "2026-10-22T10:00:00.000Z", size: 5 }], "/work/site");
  const list = Store.projects(home);
  expect(list.map((p) => [p.name, p.count])).toEqual([["site-7q2m0d", 2], ["app-k3f9x2", 2], ["home", 0]]);
  expect(list[1]).toMatchObject({ file: app.file, path: "/work/app", first: date, last: date, lately: "user: the login token refresh" });
  expect(list[2]).toMatchObject({ first: null, last: null, lately: "" });
  const where = (found: any[]) => found.map((f) => f.project + " " + f.first + "+" + f.n);
  expect(where(Store.search(home, ["audio"], null)).sort()).toEqual(["app-k3f9x2 0+1", "site-7q2m0d 0+1"]);
  expect(where(Store.search(home, ["audio", "seek"], null))).toEqual(["app-k3f9x2 0+1"]);
  expect(where(Store.search(home, ["audio", "token"], [app.file])).sort()).toEqual(["app-k3f9x2 0+1", "app-k3f9x2 1+1"]);
  expect(where(Store.search(home, ["audio"], [site.file]))).toEqual(["site-7q2m0d 0+1"]);
  expect(Store.search(home, ['say "hi"'], null)).toEqual([]);
  expect(Store.search(home, ["—", ""], null)).toEqual([]);
  [home, app, site].forEach(Store.close);
});

test("a search of all: each chat's best first, so a big chat's many matches never crowd out a small one's, the projects with lines left out named; a project forgotten meanwhile left out", () => {
  const home = Store.open(DIR + "/fair");
  const app = Store.open(DIR + "/fair", APP);
  const site = Store.open(DIR + "/fair", SITE);
  Store.nodes(app, Array.from({ length: 2000 }, (_, k) => ({ first: k, n: 1, text: "user: step " + k + (k % 50 === 0 ? " needle needle" : "") })));
  say(site, "a needle in a small project");
  const where = (found: any[]) => found.map((f) => f.project + " " + f.first);
  const fair = where(Store.search(home, ["needle"], null));
  expect([fair.length, fair[0], fair[1], fair.filter((f) => f.startsWith("site")).length]).toEqual([20, "app-k3f9x2 0", "site-7q2m0d 0", 1]);
  const cut = new Map();
  Store.search(home, ["needle"], null, cut);
  expect([...cut]).toEqual([["app-k3f9x2", { n: 1, more: true }]]);
  expect(Projects.search(home, "needle", "all").split("\n").slice(19)).toEqual(["app-k3f9x2 900+1|user: step 900 needle needle", "More lines in: app-k3f9x2 (1+); search with project to see them."]);
  expect(Projects.search(home, "small needle", "all")).toBe("site-7q2m0d 0+1|user: a needle in a small project");
  expect(Projects.search(home, "needle", "nope")).toBe("No project nope: projects lists them.");
  const seek = Store.seek;
  Store.seek = (db, chat, terms, or) => {
    if (db === home.db) {
      Store.forget(site.file);
    }
    return seek(db, chat, terms, or);
  };
  try {
    expect(where(Store.search(home, ["needle"], null))).toEqual(where(Store.search(app, ["needle"], [app.file])));
  } finally {
    Store.seek = seek;
  }
  [home, app, site].forEach(Store.close);
});

test("a big chat: every match ranked however old; a word in most lines all along left out while a rarer one is in, one common only of late kept", () => {
  const store = Store.open(DIR + "/big", APP);
  const text = (k: number) => "user: the step " + k + (k % 2 === 0 ? " even" : "") + (k === 3 ? " even even even" : "") + (k === 5 ? " the ancient sqlite design" : "") + (k >= 39000 ? " recent" : "") + (k === 100 || k === 39500 ? " lock" : "");
  Store.nodes(store, Array.from({ length: 40100 }, (_, k) => ({ first: k, n: 1, text: text(k) })));
  const firsts = (words: string[]) => Store.search(store, words, null).map((f) => f.first);
  expect(firsts(["even"])[0]).toBe(3);
  expect(firsts(["the"])[0]).toBe(5);
  expect(firsts(["the", "sqlite"])).toEqual([5]);
  expect(firsts(["the", "step", "17"])).toEqual([17]);
  expect(firsts(["recent", "lock"])).toEqual([39500]);
  expect(firsts(["—", "the", "sqlite"])).toEqual([5]);
  Store.close(store);
});

test("a project forgotten is gone, its file deleted, its WAL too, the others kept; a reader of it goes on as it was, and its close leaves the place's new file alone", () => {
  const home = Store.open(DIR + "/forget");
  const app = Store.open(DIR + "/forget", APP);
  say(app, "client-secret-plan", ["aaaaaaaaaaaaaaaa.png"]);
  Store.image_put(app, "aaaaaaaaaaaaaaaa.png", Buffer.from("secret-screenshot"), null);
  say(home, "kept at home");
  expect([Store.visit(home, app.file, Store.pictures), Store.pictures(home)]).toEqual([1, 0]);
  const reader = Store.peek(app.file);
  reader.db.run("begin");
  expect(Store.count(reader)).toBe(1);
  Store.close(app);
  expect(fs.existsSync(app.file + "-wal")).toBe(true);
  Store.forget(app.file);
  expect(fs.readdirSync(DIR + "/forget/projects").filter((f) => f.startsWith("app"))).toEqual([]);
  expect(Store.projects(home).map((p) => p.name)).toEqual(["home"]);
  expect(Store.msg(reader, 0)!.text).toBe("client-secret-plan");
  const back = Store.open(DIR + "/forget", APP);
  expect([Store.count(back), Store.state(back), back.project, back.chat]).toEqual([0, null, 1, 1]);
  say(back, "a new start");
  reader.db.run("commit");
  Store.close(reader);
  expect(fs.existsSync(back.file + "-wal")).toBe(true);
  Store.close(back);
  const again = Store.open(DIR + "/forget", APP);
  expect([Store.count(again), Store.msg(again, 0)!.text]).toEqual([1, "a new start"]);
  [again, home].forEach(Store.close);
  expect(fs.readdirSync(DIR + "/forget/projects").sort()).toEqual(["app-k3f9x2.sqlite", "home.sqlite"]);
});

test("a chat file that won't open is said by its name", () => {
  fs.mkdirSync(DIR + "/junk/projects", { recursive: true });
  fs.writeFileSync(DIR + "/junk/projects/app-k3f9x2.sqlite", "not a database, a few bytes more than a header would take".repeat(4));
  expect(() => Store.open(DIR + "/junk", APP)).toThrow("chat: app-k3f9x2.sqlite won't open: file is not a database");
});

// the reads of a statement on a store's connection, counted as it runs
// (prepared on its first use: Store's own cache keeps it after)
function reads(store: any, sql: string): { n: number } {
  const count = { n: 0 };
  const prepare = store.db.prepare.bind(store.db);
  store.db.prepare = (text: string) => {
    const st = prepare(text);
    if (text === sql) {
      const get = st.get.bind(st);
      st.get = (...args: any[]) => (count.n++, get(...args));
    }
    return st;
  };
  return count;
}

test("a span of time by bisection, in point reads: whole messages, one of three pages standing where its first is dated", () => {
  const store = Store.open(DIR + "/span", APP);
  const t0 = Date.parse("2026-10-21T08:00:00.000Z");
  const iso = (ms: number) => new Date(ms).toISOString();
  // 1,000 messages a minute apart, 500 to 502 one message in three pages a millisecond apart
  Store.push(store, Array.from({ length: 1000 }, (_, i) => {
    const page = i >= 500 && i <= 502;
    const at = page ? t0 + 500 * 60e3 + (i - 500) : t0 + i * 60e3;
    return { i, kind: "user" as const, text: "m" + i, date: iso(at), size: 2, more: page && i < 502 ? true : undefined };
  }), "/work");
  const probes = reads(store, "select date, more from msg where chat = ? and i = ?");
  expect(Store.span(store, { from: t0 + 100 * 60e3, to: t0 + 200 * 60e3 })).toEqual([100, 200]);
  expect(probes.n).toBeGreaterThan(10);
  expect(probes.n).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(1001)) + 2);
  expect(Store.span(store, { from: t0 + 100 * 60e3 + 1, to: t0 + 100 * 60e3 + 2 })).toEqual([101, 101]);
  expect(Store.span(store, { from: t0 - 3600e3, to: t0 })).toEqual([0, 0]);
  expect(Store.span(store, { from: t0 + 2000 * 60e3, to: t0 + 3000 * 60e3 })).toEqual([1000, 1000]);
  expect(Store.span(store, { from: 0, to: Infinity })).toEqual([0, 1000]);
  // its first page before from: the message is before the span; before to: in it
  expect(Store.span(store, { from: t0 + 500 * 60e3 + 1, to: t0 + 600 * 60e3 })).toEqual([503, 600]);
  expect(Store.span(store, { from: t0 + 400 * 60e3, to: t0 + 500 * 60e3 + 1 })).toEqual([400, 503]);
  expect(Store.span(store, { from: t0 + 400 * 60e3, to: t0 + 500 * 60e3 })).toEqual([400, 500]);
  Store.close(store);
});

test("a clock set back: the bisection ends all the same, at a message dated from or later whose one before is earlier, the span never inverted", () => {
  const store = Store.open(DIR + "/back", APP);
  const t0 = Date.parse("2026-10-21T08:00:00.000Z");
  // 0 to 599 a minute apart; at 600 the clock goes back 5 hours, then on a minute apart
  const at = (i: number) => t0 + (i < 600 ? i : i - 300) * 60e3;
  Store.push(store, Array.from({ length: 1200 }, (_, i) => ({ i, kind: "user" as const, text: "m" + i, date: new Date(at(i)).toISOString(), size: 2 })), "/work");
  for (const [from, to] of [[350, 400], [250, 450], [590, 620], [0, 900], [400, 900], [899, 905]]) {
    const span = { from: t0 + from * 60e3, to: t0 + to * 60e3 };
    const [a, b] = Store.span(store, span);
    expect(a).toBeLessThanOrEqual(b);
    for (const [k, ms] of [[a, span.from], [b, span.to]]) {
      expect(k === 0 || at(k - 1) < ms).toBe(true);
      expect(k === 1200 || at(k) >= ms).toBe(true);
    }
  }
  expect(Store.span(store, { from: t0 + 850 * 60e3, to: t0 + 880 * 60e3 })).toEqual([1150, 1180]);
  const [a, b] = Store.span(store, { from: t0 + 400 * 60e3, to: t0 + 351 * 60e3 });
  expect(a).toBeLessThanOrEqual(b);
  Store.close(store);
});

test("a search in a span keeps the lines over its messages alone, the best of those, not the best of all cut down, in each chat's own span", () => {
  const home = Store.open(DIR + "/spans");
  const app = Store.open(DIR + "/spans", APP);
  const site = Store.open(DIR + "/spans", SITE);
  const day = (d: number, h: number) => new Date(Date.UTC(2026, 9, d, h)).toISOString();
  // app: 40 messages on the 20th, 4 on the 21st; site: 2 on the 21st
  Store.push(app, Array.from({ length: 44 }, (_, i) => ({ i, kind: "user" as const, text: "m", date: i < 40 ? day(20, 8) : day(21, 9), size: 1 })), "/work/app");
  Store.push(site, [0, 1].map((i) => ({ i, kind: "user" as const, text: "m", date: day(21, 12), size: 1 })), "/work/site");
  Store.nodes(app, [
    ...Array.from({ length: 40 }, (_, k) => ({ first: k, n: 1, text: "user: the cache bug cache bug again " + k })),
    { first: 40, n: 1, text: "user: a cache bug, found at last" },
    { first: 40, n: 4, text: "user: the cache bug day" },
    { first: 32, n: 16, text: "user: weeks on the cache bug" },
  ]);
  Store.nodes(site, [{ first: 0, n: 2, text: "user: no cache bug here" }]);
  const where = (found: any[]) => found.map((f) => f.project + " " + f.first + "+" + f.n).sort();
  const span = { from: Date.parse(day(21, 0)), to: Date.parse(day(22, 0)) };
  expect(Store.search(home, ["cache", "bug"], [app.file]).length).toBe(20);
  expect(where(Store.search(home, ["cache", "bug"], [app.file], undefined, span))).toEqual(["app-k3f9x2 40+1", "app-k3f9x2 40+4"]);
  expect(where(Store.search(home, ["cache", "bug"], null, undefined, span))).toEqual(["app-k3f9x2 40+1", "app-k3f9x2 40+4", "site-7q2m0d 0+2"]);
  expect(Store.search(home, ["cache"], null, undefined, { from: Date.parse(day(23, 0)), to: Date.parse(day(24, 0)) })).toEqual([]);
  [home, app, site].forEach(Store.close);
});
