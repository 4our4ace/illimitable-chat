// Store test
// ==========
// `bun test Store.test.ts`. A project's file is named after it, under
// projects/, in WAL mode with illi's mark; illis starting at once each
// get their project's file, two at one place the same. A file of version
// 1 moves on to 3. A newer illi's file opens while it only added; one
// that needs a newer illi is refused, and left out of the projects. Each
// place is its own project with its own file and chat; a file another
// place's already, numbered; a name looked up only among the files. The
// projects are listed the one used last first, with their latest line, a
// message of two pages counted once; a search finds lines with all the
// words (else any), in a project or all, every match ranked however old,
// each chat's best first (a big chat's never crowd out a small one's, the
// projects with lines left out named), a project forgotten meanwhile left
// out; a big chat leaves out a word in most lines all along while a
// rarer one is in, a word common only of late kept. A project forgotten
// is gone, its file deleted; a reader of it goes on as it was, and its
// close leaves the place's new file alone. An older illi's one file moves
// to a file per project, each project's rows as they were, then is left
// a stub an older illi refuses; not while another illi has it open; one
// cut off midway goes on, its own copies made again; one brought back
// after its move drops nothing, copied beside the files there, even one
// saved midway through its move (a file in use bears no mark); two illis
// starting at once move it once. A file that won't open is named.

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

// an older illi's one file (memory.sqlite) in `dir`, these places'
// projects in it, each with a chat of `lines` messages, an image, a to-do
// list, a state and an agent's log; its connection, and each project's
// store by its name
function older(dir: string, places: Array<typeof APP>, lines = 1): { db: Database; stores: Map<string, any> } {
  fs.mkdirSync(dir, { recursive: true });
  const db = Store.connect(dir + "/memory.sqlite", true);
  const stores = new Map<string, any>();
  for (const place of places) {
    const project = Number(db.query("insert into project (uid, key, name, path, made) values (?, ?, ?, ?, ?)").run(crypto.randomUUID(), place.key, place.name, place.path, date).lastInsertRowid);
    const chat = Number(db.query("insert into chat (uid, project, made) values (?, ?, ?)").run(crypto.randomUUID(), project, date).lastInsertRowid);
    Store.words(db, chat);
    const store = { file: dir + "/memory.sqlite", db, project, chat };
    for (let k = 0; k < lines; k++) {
      say(store, "work on " + place.name + " step " + k, k === 0 ? ["aaaaaaaaaaaaaaaa.png"] : undefined);
    }
    Store.image_put(store, "aaaaaaaaaaaaaaaa.png", Buffer.from("an image of " + place.name), null);
    Store.todo_save(store, [{ text: "ship " + place.name, status: "pending" }]);
    Store.save(store, { goal: place.name });
    Store.work_push(store, "Scout.x", "Scout", { i: 0, kind: "note", text: "looked at " + place.name, date });
    stores.set(place.name, store);
  }
  return { db, stores };
}

// a chat's rows, its project's, its index's
function facts(db: Database, chat: number): unknown[] {
  return [
    db.query("select * from project where id = (select project from chat where id = ?)").all(chat),
    db.query("select * from chat where id = ?").all(chat),
    ...["msg", "node", "state", "image", "todo", "log"].map((t) => db.query(`select * from ${t} where chat = ?`).all(chat)),
    db.query("select w.* from work w join log l on l.id = w.log where l.chat = ?").all(chat),
    db.query(`select rowid, * from find_${chat}`).all(),
  ];
}

// what an act writes to stderr meanwhile
function said(act: () => void): string {
  const out: string[] = [];
  const write = process.stderr.write;
  process.stderr.write = ((text: string) => out.push(text) > 0) as any;
  try {
    act();
  } finally {
    process.stderr.write = write;
  }
  return out.join("");
}

test("a project's file is named after it, under projects/, in WAL mode with illi's mark, at this version", () => {
  const store = Store.open(DIR + "/new", APP);
  const get = (pragma: string) => Object.values(store.db.query("pragma " + pragma).get() as object)[0];
  expect(store.file).toBe(DIR + "/new/projects/app-k3f9x2.sqlite");
  expect([get("application_id"), get("journal_mode"), get("user_version")]).toEqual([0x696c6c69, "wal", 3]);
  Store.close(store);
  expect([fs.readdirSync(DIR + "/new"), fs.readdirSync(DIR + "/new/projects")]).toEqual([["projects"], ["app-k3f9x2.sqlite"]]);
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
  const rows = (db: any) => ["meta", "project", "chat", "msg", "node", "state", "log", "work"].map((t) => [t, db.query("select * from " + t).all()]);
  const schema = (db: any) => db.query("select sql from sqlite_master where name not in ('image', 'todo') and name not like 'sqlite_autoindex_image%' and name not like 'find%' order by name").all();
  const [before, tables] = [JSON.stringify(rows(store.db)).replace(`"value":"1"`, `"value":"3"`), schema(store.db)];
  Store.close(store);
  const after = Store.open(DIR + "/v1", APP);
  expect((after.db.query("pragma user_version").get() as any).user_version).toBe(3);
  expect(JSON.stringify(rows(after.db))).toBe(before);
  expect(schema(after.db)).toEqual(tables);
  expect(after.db.query("select name from sqlite_master where name = 'find'").get()).toBeNull();
  expect(after.db.query(`select first, text from find_${after.chat} order by rowid`).all()).toEqual([{ first: 0, text: "user: a fact from version 1" }, { first: 1, text: "user: a second fact" }]);
  expect(Store.search(after, ["second"], null).map((f) => f.first)).toEqual([1]);
  Store.image_put(after, "0123456789abcdef.png", new Uint8Array([1, 2, 3]), null);
  Store.todo_save(after, [{ text: "go on", status: "pending" }]);
  expect([Store.image(after, "0123456789abcdef.png")!.data, Store.todo(after)]).toEqual([new Uint8Array([1, 2, 3]), [{ text: "go on", status: "pending" }]]);
  Store.close(after);
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

test("an older illi's one file moves to a file per project, once, said: each project's rows as they were, by their numbers, its words searchable; the old file a stub an older illi refuses; nothing left beside", () => {
  const dir = DIR + "/moved";
  const { db, stores } = older(dir, [HOME, APP, SITE]);
  const before = [...stores.values()].map((s) => facts(db, s.chat));
  Store.shut(db);
  let store: any;
  expect(said(() => (store = Store.open(dir, APP)))).toBe("illi: moving the chats to a file per project (once)\n");
  expect([store.project, store.chat, Store.count(store), Store.state(store)]).toEqual([2, 2, 1, { goal: "app-k3f9x2" }]);
  const after = [HOME, APP, SITE].map((p, k) => Store.visit(store, dir + "/projects/" + p.name + ".sqlite", (s) => facts(s.db, [...stores.values()][k].chat)));
  expect(after).toEqual(before);
  expect(Store.search(store, ["site"], null).map((f) => f.project + " " + f.chat)).toEqual(["site-7q2m0d 3"]);
  Store.close(store);
  expect([fs.readdirSync(dir).sort(), fs.readdirSync(dir + "/projects").sort()]).toEqual([["memory.sqlite", "projects"], ["app-k3f9x2.sqlite", "home.sqlite", "site-7q2m0d.sqlite"]]);
  const old = new Database(dir + "/memory.sqlite", { readwrite: true });
  expect([old.query("pragma user_version").get(), old.query("select name from sqlite_master").all(), old.query("select key from meta order by key").all()]).toEqual([{ user_version: 4 }, [{ name: "meta" }], [{ key: "compat" }, { key: "moved" }]]);
  expect(() => Store.schema(old)).toThrow("is of a newer illi");
  old.close();
  expect(fs.statSync(dir + "/memory.sqlite").size).toBeLessThan(16384);
  expect(said(() => Store.close(Store.open(dir, SITE)))).toBe("");
  expect(fs.readdirSync(dir).sort()).toEqual(["memory.sqlite", "projects"]);
});

test("an older illi's file another illi has open isn't moved: said, nothing done; once it's quit, moved", () => {
  const dir = DIR + "/held-old";
  const { db } = older(dir, [HOME, APP]);
  expect(() => said(() => Store.open(dir, APP))).toThrow("chat: the chats move to a file per project once, but another illi has them open: quit it, then start illi again.");
  expect([db.query("pragma journal_mode").get(), db.query("pragma user_version").get(), fs.existsSync(dir + "/projects")]).toEqual([{ journal_mode: "wal" }, { user_version: 3 }, false]);
  say({ file: dir + "/memory.sqlite", db, project: 2, chat: 2 }, "written after");
  Store.shut(db);
  let store: any;
  said(() => (store = Store.open(dir, APP)));
  expect([Store.count(store), Store.msg(store, 1)!.text]).toEqual([2, "written after"]);
  Store.close(store);
  expect(fs.readdirSync(dir).sort()).toEqual(["memory.sqlite", "projects"]);
});

test("a move cut off midway goes on: the copies it made made again, with what the old file got since, a half-made file too; nothing numbered", () => {
  const dir = DIR + "/cut";
  const { db, stores } = older(dir, [HOME, APP, SITE]);
  Store.shut(db);
  const stub = Store.stub;
  Store.stub = () => {
    throw new Error("cut off");
  };
  try {
    expect(() => said(() => Store.open(dir, SITE))).toThrow("chat: memory.sqlite couldn't move to a file per project: cut off");
  } finally {
    Store.stub = stub;
  }
  expect(fs.readdirSync(dir + "/projects").sort()).toEqual(["app-k3f9x2.sqlite", "home.sqlite", "site-7q2m0d.sqlite"]);
  const old = new Database(dir + "/memory.sqlite", { readwrite: true });
  say({ ...stores.get(APP.name), db: old }, "written by an older illi after the crash");
  Store.shut(old);
  fs.writeFileSync(dir + "/projects/site-7q2m0d.sqlite-new", "half a file");
  let store: any;
  said(() => (store = Store.open(dir, SITE)));
  expect([store.chat, Store.count(store), Store.visit(store, dir + "/projects/app-k3f9x2.sqlite", Store.count)]).toEqual([3, 1, 2]);
  Store.close(store);
  expect([fs.readdirSync(dir).sort(), fs.readdirSync(dir + "/projects").sort()]).toEqual([["memory.sqlite", "projects"], ["app-k3f9x2.sqlite", "home.sqlite", "site-7q2m0d.sqlite"]]);
});

test("an older illi's file brought back after its move (a backup put back) drops nothing: each project the files hold already copied beside it, numbered", () => {
  const dir = DIR + "/back";
  Store.shut(older(dir, [HOME, APP]).db);
  fs.copyFileSync(dir + "/memory.sqlite", DIR + "/back-up.sqlite");
  let app: any;
  said(() => (app = Store.open(dir, APP)));
  say(app, "written after the move");
  Store.close(app);
  fs.copyFileSync(DIR + "/back-up.sqlite", dir + "/memory.sqlite");
  expect(said(() => (app = Store.open(dir, APP)))).toBe("illi: moving the chats to a file per project (once)\n");
  expect([app.file, Store.count(app)]).toEqual([dir + "/projects/app-k3f9x2.sqlite", 2]);
  expect(Store.projects(app).map((p) => p.name + " " + p.count + " " + Store.visit(app, p.file, (s) => Store.named(s).name)).sort()).toEqual(["app-k3f9x2 2 app-k3f9x2", "app-k3f9x2-2 1 app-k3f9x2-2", "home 1 home", "home-2 1 home-2"]);
  Store.close(app);
});

test("an older illi's file saved midway through its move and put back later drops nothing: a file in use bears no move's mark, so it's copied beside; one never opened since is made again, the same", () => {
  const dir = DIR + "/mid";
  Store.shut(older(dir, [HOME, APP]).db);
  const stub = Store.stub;
  Store.stub = () => {
    throw new Error("cut off");
  };
  try {
    expect(() => said(() => Store.open(dir, APP))).toThrow("cut off");
  } finally {
    Store.stub = stub;
  }
  fs.copyFileSync(dir + "/memory.sqlite", DIR + "/mid-saved.sqlite");
  let app: any;
  said(() => (app = Store.open(dir, APP)));
  say(app, "written after the move");
  Store.close(app);
  fs.copyFileSync(DIR + "/mid-saved.sqlite", dir + "/memory.sqlite");
  said(() => (app = Store.open(dir, APP)));
  expect([app.file, Store.count(app)]).toEqual([dir + "/projects/app-k3f9x2.sqlite", 2]);
  expect(Store.projects(app).map((p) => p.name + " " + p.count).sort()).toEqual(["app-k3f9x2 2", "app-k3f9x2-2 1", "home 1"]);
  Store.close(app);
});

test("a chat file that won't open is said by its name", () => {
  fs.mkdirSync(DIR + "/junk/projects", { recursive: true });
  fs.writeFileSync(DIR + "/junk/projects/app-k3f9x2.sqlite", "not a database, a few bytes more than a header would take".repeat(4));
  expect(() => Store.open(DIR + "/junk", APP)).toThrow("chat: app-k3f9x2.sqlite won't open: file is not a database");
  fs.writeFileSync(DIR + "/junk/memory.sqlite", "not a database either".repeat(10));
  expect(() => Store.open(DIR + "/junk", APP)).toThrow("chat: memory.sqlite couldn't move to a file per project: file is not a database");
});

test("two illis starting at once move an older illi's file once: the second waits, then finds it moved", async () => {
  const dir = DIR + "/race-old";
  Store.shut(older(dir, [HOME, APP, SITE], 3000).db);
  const at = Date.now() + 1500;
  const script = DIR + "/race-old.ts";
  fs.writeFileSync(script, `
    const { Store } = await import(${JSON.stringify(import.meta.dir + "/Store.ts")});
    const place = ${JSON.stringify([APP, SITE])}[Number(process.argv[2])];
    while (Date.now() < ${at}) {}
    const store = Store.open(${JSON.stringify(dir)}, place);
    console.log(store.chat + " " + Store.count(store));
    Store.close(store);
    process.exit(0);
  `);
  const runs = [0, 1].map((k) => Bun.spawn(["bun", script, String(k)], { env: { ...process.env, ILLI_DIR: DIR }, stdout: "pipe", stderr: "pipe" }));
  const outs = await Promise.all(runs.map(async (p) => [await new Response(p.stdout).text(), await new Response(p.stderr).text(), await p.exited]));
  expect(outs.map((o) => [o[0], o[2]])).toEqual([["2 3000\n", 0], ["3 3000\n", 0]]);
  const told = outs.map((o) => String(o[1])).join("").split("\n").filter((l) => l !== "");
  expect(told.filter((l) => l === "illi: moving the chats to a file per project (once)").length).toBe(1);
  expect(told.filter((l) => l !== "illi: moving the chats to a file per project (once)" && l !== "illi: another illi is moving the chats to a file per project: waiting for it")).toEqual([]);
  expect(fs.readdirSync(dir).sort()).toEqual(["memory.sqlite", "projects"]);
}, 30000);
