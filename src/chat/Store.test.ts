// Store test
// ==========
// `bun test Store.test.ts`. A new file gives space back as rows go and
// bears illi's mark (a forget cut off undone at the next open); illis
// making it at once each get their project. A newer illi's file opens
// while it only added; one that needs a newer illi is refused. Each place
// is its own project with its own chat, home outside repos, the same
// place the same chat; a name another's already, numbered. The projects
// are listed the one used last first, with their latest line, a message
// of two pages counted once; a search finds lines with all the words
// (else any), in a project or all, every match ranked however old, each
// chat's best first (a big chat's never crowd out a small one's, the
// projects with lines left out named), as the file was when the search
// began; a big chat leaves out a word in most lines all along while a
// rarer one is in, a word common only of late kept. A project forgotten
// is gone from the file, its words (its index dropped), images and to-do
// list too, its space given back, a later version's rows of its chats
// too; the others stay, and no number is used again. One while a reader
// holds an older snapshot doesn't wait for it, and the next open gives
// its space back. A file of version 1 moves on to 3, its facts as they
// were, the words moved to an index per chat.

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

test("a new file gives space back as rows go and bears illi's mark; one a forget cut off left in auto_vacuum full opens incremental again", () => {
  const store = Store.open(DIR + "/new");
  const get = (pragma: string, s = store) => Object.values(s.db.query("pragma " + pragma).get() as object)[0];
  expect([get("auto_vacuum"), get("application_id"), get("journal_mode"), get("user_version")]).toEqual([2, 0x696c6c69, "wal", 3]);
  store.db.run("pragma auto_vacuum = full");
  Store.close(store);
  const again = Store.open(DIR + "/new");
  expect(get("auto_vacuum", again)).toBe(2);
  Store.close(again);
});

test("a file of version 1 moves on to 3: its facts as they were, an image and a to-do table added, the words in an index per chat, compat 3", () => {
  const store = Store.open(DIR + "/v1", APP);
  say(store, "a fact from version 1");
  say(store, "a second fact");
  Store.save(store, { goal: "kept" });
  Store.work_push(store, "Scout.x", "Scout", { i: 0, kind: "note", text: "logged", date });
  store.db.run(`drop table image; drop table todo; drop table find_${store.chat};
    create virtual table find using fts5(text, chat unindexed, first unindexed, n unindexed, tokenize = 'unicode61 remove_diacritics 2');
    insert into find (find, rank) values ('secure-delete', 1);
    insert into find (text, chat, first, n) select text, chat, first, n from node order by first;
    update meta set value = '1' where key = 'compat'; pragma user_version = 1`);
  const facts = (db: any) => ["meta", "project", "chat", "msg", "node", "state", "log", "work"].map((t) => [t, db.query("select * from " + t).all()]);
  const schema = (db: any) => db.query("select sql from sqlite_master where name not in ('image', 'todo') and name not like 'sqlite_autoindex_image%' and name not like 'find%' order by name").all();
  const [rows, tables] = [JSON.stringify(facts(store.db)).replace(`"value":"1"`, `"value":"3"`), schema(store.db)];
  Store.close(store);
  const after = Store.open(DIR + "/v1", APP);
  expect((after.db.query("pragma user_version").get() as any).user_version).toBe(3);
  expect(JSON.stringify(facts(after.db))).toBe(rows);
  expect(schema(after.db)).toEqual(tables);
  expect(after.db.query("select name from sqlite_master where name = 'find'").get()).toBeNull();
  expect(after.db.query(`select first, text from find_${after.chat} order by rowid`).all()).toEqual([{ first: 0, text: "user: a fact from version 1" }, { first: 1, text: "user: a second fact" }]);
  expect(Store.search(after, ["second"], null).map((f) => f.first)).toEqual([1]);
  Store.image_put(after, "0123456789abcdef.png", new Uint8Array([1, 2, 3]), null);
  Store.todo_save(after, [{ text: "go on", status: "pending" }]);
  expect([Store.image(after, "0123456789abcdef.png")!.data, Store.todo(after)]).toEqual([new Uint8Array([1, 2, 3]), [{ text: "go on", status: "pending" }]]);
  Store.close(after);
});

test("illis making the file at once each get their own project and chat", async () => {
  const at = Date.now() + 1500;
  const script = DIR + "/race.ts";
  fs.writeFileSync(script, `
    const { Store } = await import(${JSON.stringify(import.meta.dir + "/Store.ts")});
    const k = Number(process.argv[2]);
    while (Date.now() < ${at}) {}
    const store = Store.open(${JSON.stringify(DIR + "/race")}, { key: "git:/work/p" + k, name: "p" + k, path: "/work/p" + k });
    Store.push(store, [{ i: 0, kind: "user", text: "hi from p" + k, date: "${date}", size: 5 }], "/work");
    console.log(store.project + " " + store.chat);
    Store.close(store);
    process.exit(0);
  `);
  const runs = Array.from({ length: 6 }, (_, k) => Bun.spawn(["bun", script, String(k)], { env: { ...process.env, ILLI_DIR: DIR }, stdout: "pipe", stderr: "pipe" }));
  const outs = await Promise.all(runs.map(async (p) => [await new Response(p.stdout).text(), await new Response(p.stderr).text(), await p.exited]));
  expect(outs.map((o) => [o[1], o[2]])).toEqual(Array.from({ length: 6 }, () => ["", 0]));
  expect(new Set(outs.map((o) => o[0])).size).toBe(6);
  const store = Store.open(DIR + "/race");
  expect(Store.projects(store).map((p) => p.name + " " + p.count).sort()).toEqual(["home 0", "p0 1", "p1 1", "p2 1", "p3 1", "p4 1", "p5 1"]);
  expect((store.db.query("pragma auto_vacuum").get() as any).auto_vacuum).toBe(2);
  Store.close(store);
}, 20000);

test("a newer illi's file opens while it only added; one that needs a newer illi is refused", () => {
  const store = Store.open(DIR + "/newer");
  store.db.run("pragma user_version = 7");
  Store.close(store);
  expect(() => Store.close(Store.open(DIR + "/newer"))).not.toThrow();
  const db = new Database(DIR + "/newer/memory.sqlite");
  db.run("update meta set value = '7' where key = 'compat'");
  db.close();
  expect(() => Store.open(DIR + "/newer")).toThrow("of a newer illi");
});

test("each place is its own project with its own chat; the same place, the same chat", () => {
  const home = Store.open(DIR + "/places");
  const app = Store.open(DIR + "/places", APP);
  const again = Store.open(DIR + "/places", APP);
  expect(new Set([home.chat, app.chat]).size).toBe(2);
  expect([again.project, again.chat]).toEqual([app.project, app.chat]);
  say(app, "the audio player seeks");
  expect([Store.count(app), Store.count(home)]).toEqual([1, 0]);
  expect(Store.project(home, "app-k3f9x2")).toEqual({ project: app.project, chat: app.chat });
  expect(Store.project(home, "nope")).toBeNull();
  const twin = Store.open(DIR + "/places", { ...APP, key: "git:/elsewhere/app" });
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
  expect(list[1]).toMatchObject({ path: "/work/app", first: date, last: date, lately: "user: the login token refresh" });
  expect(list[2]).toMatchObject({ first: null, last: null, lately: "" });
  const where = (found: any[]) => found.map((f) => f.project + " " + f.first + "+" + f.n);
  expect(where(Store.search(home, ["audio"], null)).sort()).toEqual(["app-k3f9x2 0+1", "site-7q2m0d 0+1"]);
  expect(where(Store.search(home, ["audio", "seek"], null))).toEqual(["app-k3f9x2 0+1"]);
  expect(where(Store.search(home, ["audio", "token"], [app.project])).sort()).toEqual(["app-k3f9x2 0+1", "app-k3f9x2 1+1"]);
  expect(where(Store.search(home, ["audio"], [site.project]))).toEqual(["site-7q2m0d 0+1"]);
  expect(Store.search(home, ['say "hi"'], null)).toEqual([]);
  expect(Store.search(home, ["—", ""], null)).toEqual([]);
  [home, app, site].forEach(Store.close);
});

test("a search of all: each chat's best first, so a big chat's many matches never crowd out a small one's, the projects with lines left out named; it reads the file as it began, an index dropped meanwhile", () => {
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
  const reader = { ...home, db: new Database(home.file, { readonly: true }) };
  const seek = Store.seek;
  Store.seek = (db, chat, terms, or) => {
    if (chat === home.chat) {
      home.db.run(`drop table find_${site.chat}`);
    }
    return seek(db, chat, terms, or);
  };
  try {
    expect(where(Store.search(reader, ["needle"], null))).toEqual(fair);
  } finally {
    Store.seek = seek;
  }
  reader.db.close();
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

test("a forget while a reader holds an older snapshot doesn't wait for it: the project is gone and overwritten, and the next open gives its space back", () => {
  const home = Store.open(DIR + "/held");
  const app = Store.open(DIR + "/held", APP);
  for (let k = 0; k < 200; k++) {
    say(app, "held-secret-" + k + " " + "y".repeat(5000));
  }
  home.db.run("pragma wal_checkpoint(truncate)");
  say(home, "a line in the WAL, so the reader's snapshot is of it");
  const before = fs.statSync(home.file).size;
  const reader = new Database(home.file, { readonly: true });
  reader.run("begin");
  reader.query("select count(*) from msg").get();
  const t0 = Date.now();
  expect(Store.forget(home, app.project)).toBe(false);
  expect(Date.now() - t0).toBeLessThan(2000);
  const free = () => (home.db.query("pragma freelist_count").get() as { freelist_count: number }).freelist_count;
  expect([(home.db.query("pragma auto_vacuum").get() as any).auto_vacuum, free() > 256, Store.projects(home).map((p) => p.name)]).toEqual([2, true, ["home"]]);
  reader.run("commit");
  reader.close();
  Store.close(app);
  const next = Store.open(DIR + "/held");
  expect([(next.db.query("pragma freelist_count").get() as any).freelist_count, fs.statSync(home.file).size < before / 2]).toEqual([0, true]);
  expect(fs.readFileSync(DIR + "/held/memory.sqlite").includes("held-secret")).toBe(false);
  Store.close(next);
  Store.close(home);
});

test("a project forgotten is gone from the file and its WAL at once (a line not checkpointed yet too), its words too, its space given back, the images only it named said; the others stay", () => {
  const home = Store.open(DIR + "/forget");
  const app = Store.open(DIR + "/forget", APP);
  const secret = "client-secret-plan-" + "z".repeat(40);
  for (let k = 0; k < 300; k++) {
    say(app, secret + " " + k + " " + "y".repeat(400), k === 0 ? ["aaaaaaaaaaaaaaaa.png", "bbbbbbbbbbbbbbbb.png"] : undefined);
  }
  say(home, "kept at home", ["bbbbbbbbbbbbbbbb.png"]);
  const picture = Buffer.from("secret-screenshot-bytes-" + "q".repeat(5000));
  Store.image_put(app, "aaaaaaaaaaaaaaaa.png", picture, picture.subarray(0, 100));
  Store.image_put(app, "bbbbbbbbbbbbbbbb.png", Buffer.from("shared"), null);
  Store.image_put(home, "bbbbbbbbbbbbbbbb.png", Buffer.from("shared"), null);
  Store.todo_save(app, [{ text: secret, status: "active" }]);
  Store.save(app, { goal: "ship" });
  Store.work_push(app, "Scout.x", "Scout", { i: 0, kind: "note", text: secret, date });
  home.db.run("create table later (chat integer not null references chat (id) on delete cascade, text text)");
  home.db.query("insert into later values (?, ?), (?, ?)").run(app.chat, secret, home.chat, "kept");
  home.db.run("pragma wal_checkpoint(truncate)");
  const before = fs.statSync(home.file).size;
  say(app, secret + " still in the WAL as it's forgotten");
  expect([Store.pictures(home, app.project), Store.pictures(home, home.project)]).toEqual([2, 1]);
  expect(Store.forget(home, app.project)).toBe(true);
  const held = (end: string) => !fs.existsSync(home.file + end) || fs.readFileSync(home.file + end).includes("client-secret-plan");
  expect([held(""), held("-wal")]).toEqual([false, false]);
  expect(Store.projects(home).map((p) => p.name)).toEqual(["home"]);
  expect([home.db.query("pragma auto_vacuum").get(), home.db.query("pragma freelist_count").get()]).toEqual([{ auto_vacuum: 2 }, { freelist_count: 0 }]);
  expect([Store.image(home, "bbbbbbbbbbbbbbbb.png")?.data.length, home.db.query("select count(*) as n from image").get(), home.db.query("select count(*) as n from todo").get()]).toEqual([6, { n: 1 }, { n: 0 }]);
  expect(Store.search(home, ["client"], null)).toEqual([]);
  expect(home.db.query(`select name from sqlite_master where name like 'find_${app.chat}%'`).all()).toEqual([]);
  expect([Store.count(home), Store.msg(home, 0)!.text]).toEqual([1, "kept at home"]);
  expect(home.db.query("select text from later").all()).toEqual([{ text: "kept" }]);
  expect(home.db.query("select count(*) as n from work").get()).toEqual({ n: 0 });
  Store.close(app);
  Store.close(home);
  expect(fs.readdirSync(DIR + "/forget")).toEqual(["memory.sqlite"]);
  expect(fs.statSync(DIR + "/forget/memory.sqlite").size).toBeLessThan(before / 4);
  expect(fs.readFileSync(DIR + "/forget/memory.sqlite").includes("client-secret-plan")).toBe(false);
  expect(fs.readFileSync(DIR + "/forget/memory.sqlite").includes("secret-screenshot-bytes")).toBe(false);
  const back = Store.open(DIR + "/forget", APP);
  expect([Store.count(back), Store.state(back)]).toEqual([0, null]);
  expect([back.project, back.chat]).toEqual([app.project + 1, app.chat + 1]);
  Store.close(back);
});
