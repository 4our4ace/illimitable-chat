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
// that won't open is named.

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
  expect(fs.readdirSync(DIR + "/forget/projects")).toEqual(["app-k3f9x2.sqlite", "home.sqlite"]);
});

test("a chat file that won't open is said by its name", () => {
  fs.mkdirSync(DIR + "/junk/projects", { recursive: true });
  fs.writeFileSync(DIR + "/junk/projects/app-k3f9x2.sqlite", "not a database, a few bytes more than a header would take".repeat(4));
  expect(() => Store.open(DIR + "/junk", APP)).toThrow("chat: app-k3f9x2.sqlite won't open: file is not a database");
});
