// Store
// =====
// The chats' facts in SQLite files (bun:sqlite), one a project, in the
// profile's chat folder: projects/<name>.sqlite. It keeps what the memory
// tree (Memory.ts) reads and writes, never how the tree works, so a change
// to the tree needs none here.
//
// A project is where illi ran (Projects.ts): a git repo's top folder, by
// its path, or home. Its file bears its name (another place's already, by
// its key: numbered) and holds it alone: its row, with a random uid and
// `extra`, a JSON object for what may come, and its chats, one for now
// and room for more. Forgetting a project (Store.forget) deletes its
// file: all of it goes at once, and its space with it.
//
// Facts are added once, never changed:
// - msg: a message (a page), by its chat and index, with the folder illi
//   ran in;
// - node: a summary line, by the messages it covers (its first, how
//   many: the zoom's id+n), so any shape of tree fits; one built twice
//   keeps the first, which a view may hold already;
// - log, work: an agent's log (a name and a tag) and its entries;
// - image: an image a message names, by its chat and its name (its
//   hash: one pasted twice kept once), its bytes, and its copy for
//   models if made (smaller), as BLOBs.
// One row a chat is written over: its state (the saved view, pick, goal,
// work, cut...), never rebuilt from the facts (the cache holds by it);
// and its to-do list (todo), the agent's, given whole each time.
// Derived from node: each chat's index of its summary lines' words, for
// search (find_<chat>, an FTS table made with the chat).
//
// Durable as files were: each write is one transaction, in WAL mode at
// synchronous NORMAL, so a crash never leaves half a write and no write
// waits on the disk; the WAL goes to Disk.ts, whose flush (an fsync) an
// act waits on. Closed, it checkpoints and leaves the one file. An illi
// reads other projects' files too (the projects, a search, a zoom), each
// on a connection of its own, closed after (Store.visit); one deleted
// meanwhile reads as it was, or not at all if not begun, and its close
// leaves alone a new file by the same name (SQLite checks the file is
// still the one it opened).
//
// The schema's version is user_version (VERSION): a new file gets the
// schema whole, at it, in one transaction. A file of a newer illi is
// opened as it is if meta's compat, the oldest version that may still
// write it, allows, else refused. A later schema moves an older file on
// by steps that only add (a table, an index, a column with a default),
// or raises compat. A table for each chat (find_<chat>) is made with the
// chat (Store.place: Store.words). All of it, step by step:
// docs/storage.md.

import { Database, type Statement } from "bun:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Kind } from "../ai/AskAI.ts";
import { Disk } from "./Disk.ts";

// Types
// =====

// a message as kept: its index, kind, text, date, its size as models read
// it, its images, its node (if written with it), whether it is logged as
// one with the next
export type Row = { i: number; kind: Kind; text: string; date: string; size: number; images?: string[]; line?: string; more?: boolean };

// an agent's entry: its index, kind, text, date
export type Entry = { i: number; kind: Kind; text: string; date: string };

// a summary line: the messages it covers (first, n), its text
export type Line = { first: number; n: number; text: string };

// where illi runs: its key (a git repo's "git:" and top folder, or
// "home"), its name, its folder ("": none)
export type Place = { key: string; name: string; path: string };

// a project, for a model's first look: its file, name, folder, first and
// last message (null: none yet), messages, its latest summary line
export type Project = { file: string; name: string; path: string; first: string | null; last: string | null; count: number; lately: string };

// a summary line found: its project, chat, the messages it covers, text
export type Found = { project: string; chat: number; first: number; n: number; text: string };

// a project's lines a search found but left out (more: maybe more still)
export type Cut = { n: number; more: boolean };

// a project's file, its connection, the project and chat its rows are of
export type Store = { file: string; db: Database; project: number; chat: number };

// Constants
// =========

// the projects' folder in the chat folder
const PROJECTS = "/projects";

// a project's file's ending
const SQLITE = ".sqlite";

// the chats outside any git repo
export const HOME: Place = { key: "home", name: "home", path: "" };

// the file's mark (application_id): "illi"
const MARK = 0x696c6c69;

// the schema's version
const VERSION = 3;

// the schema, as a new file gets it (each chat's index made with the
// chat: Store.words)
const SCHEMA = `
create table meta (key text primary key, value text not null) without rowid;
insert into meta (key, value) values ('compat', '${VERSION}');
create table project (id integer primary key autoincrement, uid text not null unique, key text not null unique, name text not null unique, path text not null, made text not null,
  extra text not null default '{}');
create table chat (id integer primary key autoincrement, uid text not null unique, project integer not null references project (id) on delete cascade, made text not null,
  extra text not null default '{}');
create index chat_of on chat (project);
create table msg (chat integer not null references chat (id) on delete cascade, i integer not null, kind text not null, text text not null, date text not null, size integer not null,
  images text, line text, more integer, cwd text, primary key (chat, i)) without rowid;
create index msg_page on msg (chat) where more is not null;
create table node (chat integer not null references chat (id) on delete cascade, first integer not null, n integer not null, text text not null,
  primary key (chat, first, n)) without rowid;
create index node_end on node (chat, first + n);
create table state (chat integer primary key references chat (id) on delete cascade, saved text not null);
create table log (id integer primary key autoincrement, chat integer not null references chat (id) on delete cascade, log text not null, name text not null, unique (chat, log));
create table work (log integer not null references log (id) on delete cascade, i integer not null, kind text not null, text text not null, date text not null,
  primary key (log, i)) without rowid;
create table image (id integer primary key autoincrement, chat integer not null references chat (id) on delete cascade, name text not null, data blob not null, fit blob,
  unique (chat, name));
create table todo (chat integer primary key references chat (id) on delete cascade, list text not null);
pragma application_id = ${MARK};
pragma user_version = ${VERSION};
`;

// the most lines a search gives
const FOUND = 20;

// a chat of more summary lines has its words' shares seen, a word in
// most lines left out (Store.seek); one of fewer, every word as given
const LARGE = 20000;

// the lines of each stretch a word's share is seen in
const SAMPLE = 1000;

// how long a connection waits for another's lock, ms
const WAIT = 10000;

// a connection's statements, each prepared once, all finalized as it
// closes (Store.shut): bun:sqlite's own cache (db.query) keeps twenty,
// and one past them, left to the GC, keeps the connection open after
// close(), so it never checkpoints nor leaves the one file
const PREPARED = new WeakMap<Database, Map<string, Statement>>();

// a connection's statement, prepared at its first use
function query(db: Database, sql: string): Statement {
  let all = PREPARED.get(db);
  if (all === undefined) {
    PREPARED.set(db, (all = new Map()));
  }
  let statement = all.get(sql);
  if (statement === undefined) {
    all.set(sql, (statement = db.prepare(sql)));
  }
  return statement;
}

// Store
// =====

export namespace Store {

  // the file of the project at `place`, made if new (a file another
  // place's already: the next number's); the project's first chat, made
  // if new
  export function open(dir: string, place: Place = HOME): Store {
    fs.mkdirSync(dir + PROJECTS, { recursive: true });
    for (let k = 1; ; k++) {
      const file = dir + PROJECTS + "/" + place.name + (k === 1 ? "" : "-" + k) + SQLITE;
      const db = Store.connect(file, true);
      try {
        const at = Store.place(db, place, Store.name(file));
        if (at !== null) {
          return { file, db, ...at };
        }
      } catch (err) {
        Store.shut(db);
        throw err;
      }
      Store.shut(db);
    }
  }

  // another project's file (it must be there), its project and first
  // chat (0: none), to read; closed by the caller (Store.close)
  export function peek(file: string): Store {
    const db = Store.connect(file, false);
    try {
      const at = query(db, "select p.id as project, coalesce(min(c.id), 0) as chat from project p left join chat c on c.project = p.id group by p.id order by p.id limit 1").get() as { project: number; chat: number } | null;
      return { file, db, project: at?.project ?? 0, chat: at?.chat ?? 0 };
    } catch (err) {
      Store.shut(db);
      throw err;
    }
  }

  // a connection to a project's file (make: made if not there), in WAL
  // mode before its first write, at this schema; one that won't open,
  // said by the file's name
  export function connect(file: string, make: boolean): Database {
    let db: Database | null = null;
    try {
      db = make ? new Database(file, { create: true }) : new Database(file, { readwrite: true });
      db.run("pragma busy_timeout = " + WAIT);
      db.run("pragma foreign_keys = on");
      db.run("pragma synchronous = normal");
      Store.wal(db);
      Store.schema(db);
      return db;
    } catch (err) {
      if (db !== null) {
        Store.shut(db);
      }
      throw Store.why(path.basename(file) + " won't open", err);
    }
  }

  // an error as a chat file's, said at start in one line (main.ts: "chat:
  // ..."): what failed, then SQLite's words; one said so already, as is
  export function why(what: string, err: any): Error {
    const text = String(err?.message ?? err);
    return text.startsWith("chat: ") ? err : new Error("chat: " + what + ": " + text, { cause: err });
  }

  // a connection's file in WAL mode, which it keeps once set: tried
  // again while another illi opening it at once holds it (switching
  // doesn't wait as other locks do)
  export function wal(db: Database): void {
    for (let waited = 0; ; waited += 10) {
      try {
        db.run("pragma journal_mode = wal");
        return;
      } catch (err: any) {
        if (err?.code !== "SQLITE_BUSY" || waited >= WAIT) {
          throw err;
        }
        Bun.sleepSync(10);
      }
    }
  }

  // a connection's file at this schema: a new one (version 0) given it in
  // one transaction, which another process may have done meanwhile; one
  // older refused (none is left: each was brought to this one before the
  // steps that did so went); one newer kept as it is, unless it needs a
  // newer illi
  export function schema(db: Database): void {
    const version = () => (query(db, "pragma user_version").get() as { user_version: number }).user_version;
    if (version() === 0) {
      db.transaction(() => {
        if (version() === 0) {
          db.run(SCHEMA);
        }
      }).immediate();
    }
    if (version() < VERSION) {
      throw new Error("chat: " + path.basename(db.filename) + " is of an older illi this one can't open: move it away to start the project fresh.");
    }
    if (version() > VERSION) {
      const compat = Number((query(db, "select value from meta where key = 'compat'").get() as { value: string } | null)?.value ?? Infinity);
      if (!(compat <= VERSION)) {
        throw new Error("chat: " + path.basename(db.filename) + " is of a newer illi: update illi to open it.");
      }
    }
  }

  // the project at a place, named `name`, and its first chat, made if new
  // (the file empty); null: the file is another place's
  export function place(db: Database, place: Place, name: string): { project: number; chat: number } | null {
    return db.transaction(() => {
      const now = new Date().toISOString();
      const known = query(db, "select id, key from project").all() as Array<{ id: number; key: string }>;
      if (known.length === 0) {
        query(db, "insert into project (uid, key, name, path, made) values (?, ?, ?, ?, ?)").run(crypto.randomUUID(), place.key, name, place.path, now);
      } else if (!known.some((p) => p.key === place.key)) {
        return null;
      }
      const project = (query(db, "select id from project where key = ?").get(place.key) as { id: number }).id;
      const first = query(db, "select id from chat where project = ? order by id limit 1").get(project) as { id: number } | null;
      if (first !== null) {
        return { project, chat: first.id };
      }
      const chat = Number(query(db, "insert into chat (uid, project, made) values (?, ?, ?)").run(crypto.randomUUID(), project, now).lastInsertRowid);
      Store.words(db, chat);
      return { project, chat };
    }).immediate();
  }

  // a chat's index of its summary lines' words (find_<chat>), made empty
  export function words(db: Database, chat: number): void {
    db.run(`create virtual table find_${chat} using fts5(text, first unindexed, n unindexed, tokenize = 'unicode61 remove_diacritics 2')`);
  }

  // a store's connection closed (Store.shut)
  export function close(store: Store): void {
    Store.shut(store.db);
  }

  // a connection closed, its statements finalized first so it closes at
  // once (the last: checkpointed, its WAL gone, the one file left)
  export function shut(db: Database): void {
    for (const statement of PREPARED.get(db)?.values() ?? []) {
      statement.finalize();
    }
    PREPARED.delete(db);
    db.close();
  }

  // written: its WAL flushed soon (Disk.ts)
  export function wrote(store: Store): void {
    void Disk.wrote(store.file + "-wal");
  }

// Messages
  // --------

  // the messages logged
  export function count(store: Store): number {
    return (query(store.db, "select coalesce(max(i) + 1, 0) as n from msg where chat = ?").get(store.chat) as { n: number }).n;
  }

  // message i; null: none
  export function msg(store: Store, i: number): Row | null {
    const row = query(store.db, "select i, kind, text, date, size, images, line, more from msg where chat = ? and i = ?").get(store.chat, i) as any;
    return row === null ? null : Store.row(row);
  }

  // as kept: its fields absent, not null
  export function row(row: any): Row {
    const out: Row = { i: row.i, kind: row.kind, text: row.text, date: row.date, size: row.size };
    if (row.images !== null) {
      out.images = JSON.parse(row.images);
    }
    if (row.line !== null) {
      out.line = row.line;
    }
    if (row.more) {
      out.more = true;
    }
    return out;
  }

  // the latest message of a kind before `end`; -1: none
  export function last(store: Store, kind: Kind, end: number): number {
    return (query(store.db, "select max(i) as i from msg where chat = ? and kind = ? and i < ?").get(store.chat, kind, end) as { i: number | null }).i ?? -1;
  }

  // the latest `most` messages after message `after` of these kinds, oldest
  // first, each its kind and text (the radar's query of a run: Radar.ran)
  export function latest(store: Store, after: number, kinds: string[], most: number): Array<{ kind: string; text: string }> {
    const rows = query(store.db, "select kind, text from msg where chat = ? and i > ? and kind in (" + kinds.map(() => "?").join(", ") + ") order by i desc limit ?").all(store.chat, after, ...kinds, most);
    return (rows as Array<{ kind: string; text: string }>).reverse();
  }

  // the texts of the messages from `from` on that may name a line: a
  // digit after a #, or a + between digits before a | (#16+16, as the side
  // pins a line and recall gives one; 16+8|, as the view, a zoom and a
  // search write one: Radar.named reads them)
  export function naming(store: Store, from: number): string[] {
    return (query(store.db, "select text from msg where chat = ? and i >= ? and (text glob '*#[0-9]*' or text glob '*[0-9]+[0-9]*|*')").all(store.chat, from) as Array<{ text: string }>).map((r) => r.text);
  }

  // messages logged in one write, each with the folder illi runs in
  export function push(store: Store, rows: Row[], cwd: string): void {
    const add = query(store.db, "insert into msg (chat, i, kind, text, date, size, images, line, more, cwd) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    store.db.transaction(() => {
      for (const r of rows) {
        add.run(store.chat, r.i, r.kind, r.text, r.date, r.size, r.images?.length ? JSON.stringify(r.images) : null, r.line ?? null, r.more ? 1 : null, cwd || null);
      }
    })();
    Store.wrote(store);
  }

  // Nodes
  // -----

  // the line over messages [first, first + n); null: not built
  export function node(store: Store, first: number, n: number): string | null {
    return (query(store.db, "select text from node where chat = ? and first = ? and n = ?").get(store.chat, first, n) as { text: string } | null)?.text ?? null;
  }

  // lines built, logged in one write, their words found by search
  export function nodes(store: Store, lines: Line[]): void {
    const add  = query(store.db, "insert into node (chat, first, n, text) values (?, ?, ?, ?) on conflict do nothing");
    const find = query(store.db, `insert into find_${store.chat} (text, first, n) values (?, ?, ?)`);
    store.db.transaction(() => {
      for (const { first, n, text } of lines) {
        if (add.run(store.chat, first, n, text).changes === 1) {
          find.run(text, first, n);
        }
      }
    })();
    Store.wrote(store);
  }

  // State
  // -----

  // the chat's state as last saved; null: none
  export function state(store: Store): any {
    const row = query(store.db, "select saved from state where chat = ?").get(store.chat) as { saved: string } | null;
    return row === null ? null : JSON.parse(row.saved);
  }

  // written over
  export function save(store: Store, saved: object): void {
    query(store.db, "insert into state (chat, saved) values (?, ?) on conflict (chat) do update set saved = excluded.saved").run(store.chat, JSON.stringify(saved));
    Store.wrote(store);
  }

  // Agents
  // ------

  // a log made, by its name (a name and a tag); false: there already
  export function log_new(store: Store, log: string, name: string): boolean {
    const made = query(store.db, "insert into log (chat, log, name) values (?, ?, ?) on conflict do nothing").run(store.chat, log, name).changes === 1;
    if (made) {
      Store.wrote(store);
    }
    return made;
  }

  // the log a name took last; null: none
  export function log_of(store: Store, name: string): string | null {
    return (query(store.db, "select log from log where chat = ? and name = ? order by id desc limit 1").get(store.chat, name) as { log: string } | null)?.log ?? null;
  }

  // every log, oldest first
  export function logs(store: Store): string[] {
    return (query(store.db, "select log from log where chat = ? order by id").all(store.chat) as Array<{ log: string }>).map((r) => r.log);
  }

  // a log's entries; null: no such log
  export function work(store: Store, log: string): Entry[] | null {
    const id = Store.log_id(store, log);
    return id === null ? null : (query(store.db, "select i, kind, text, date from work where log = ? order by i").all(id) as Entry[]);
  }

  // an entry logged (its log made, if not yet)
  export function work_push(store: Store, log: string, name: string, e: Entry): void {
    store.db.transaction(() => {
      query(store.db, "insert into log (chat, log, name) values (?, ?, ?) on conflict do nothing").run(store.chat, log, name);
      query(store.db, "insert into work (log, i, kind, text, date) values (?, ?, ?, ?, ?)").run(Store.log_id(store, log), e.i, e.kind, e.text, e.date);
    })();
    Store.wrote(store);
  }

  // a log's number, by its name; null: no such log
  export function log_id(store: Store, log: string): number | null {
    return (query(store.db, "select id from log where chat = ? and log = ?").get(store.chat, log) as { id: number } | null)?.id ?? null;
  }

  // the entries a log holds
  export function work_count(store: Store, log: string): number {
    const id = Store.log_id(store, log);
    return id === null ? 0 : (query(store.db, "select count(*) as n from work where log = ?").get(id) as { n: number }).n;
  }

  // a log's latest entry of a kind; -1: none (or no such log)
  export function work_last(store: Store, log: string, kind: Kind): number {
    const id = Store.log_id(store, log);
    return id === null ? -1 : (query(store.db, "select max(i) as i from work where log = ? and kind = ?").get(id, kind) as { i: number | null }).i ?? -1;
  }

  // a log's latest `most` entries after entry `after` of these kinds,
  // oldest first, each its kind and text (Store.latest's, of an agent)
  export function work_latest(store: Store, log: string, after: number, kinds: string[], most: number): Array<{ kind: string; text: string }> {
    const id   = Store.log_id(store, log);
    const rows = id === null ? [] : query(store.db, "select kind, text from work where log = ? and i > ? and kind in (" + kinds.map(() => "?").join(", ") + ") order by i desc limit ?").all(id, after, ...kinds, most);
    return (rows as Array<{ kind: string; text: string }>).reverse();
  }

  // a log's entry `i`, its text; null: none
  export function work_text(store: Store, log: string, i: number): string | null {
    const id = Store.log_id(store, log);
    return id === null ? null : (query(store.db, "select text from work where log = ? and i = ?").get(id, i) as { text: string } | null)?.text ?? null;
  }

  // the texts of a log's entries that may name a line (Store.naming's, of
  // an agent: it holds its whole log)
  export function work_naming(store: Store, log: string): string[] {
    const id = Store.log_id(store, log);
    return id === null ? [] : (query(store.db, "select text from work where log = ? and (text glob '*#[0-9]*' or text glob '*[0-9]+[0-9]*|*')").all(id) as Array<{ text: string }>).map((r) => r.text);
  }

  // Images
  // ------

  // an image put in, by its name, with its copy for models (null: none);
  // one there already kept
  export function image_put(store: Store, name: string, data: Uint8Array, fit: Uint8Array | null): void {
    query(store.db, "insert into image (chat, name, data, fit) values (?, ?, ?, ?) on conflict do nothing").run(store.chat, name, data, fit);
    Store.wrote(store);
  }

  // an image's bytes and its copy for models (null: none); null: no such
  // image
  export function image(store: Store, name: string): { data: Uint8Array; fit: Uint8Array | null } | null {
    return query(store.db, "select data, fit from image where chat = ? and name = ?").get(store.chat, name) as { data: Uint8Array; fit: Uint8Array | null } | null;
  }

  // To-do list
  // ----------

  // the chat's to-do list as last given; null: none
  export function todo(store: Store): unknown {
    const row = query(store.db, "select list from todo where chat = ?").get(store.chat) as { list: string } | null;
    return row === null ? null : JSON.parse(row.list);
  }

  // written over
  export function todo_save(store: Store, list: unknown): void {
    query(store.db, "insert into todo (chat, list) values (?, ?) on conflict (chat) do update set list = excluded.list").run(store.chat, JSON.stringify(list));
    Store.wrote(store);
  }

  // Projects
  // --------

  // a project's name: its file's
  export function name(file: string): string {
    return path.basename(file, SQLITE);
  }

  // every project's file, beside the store's
  export function files(store: Store): string[] {
    const folder = path.dirname(store.file);
    return fs.readdirSync(folder).filter((f) => f.endsWith(SQLITE)).sort().map((f) => folder + "/" + f);
  }

  // a project's file by its name (a model's: only one there); null: none
  export function lookup(store: Store, name: string): string | null {
    return Store.files(store).find((file) => Store.name(file) === name) ?? null;
  }

  // what `read` gets of a project's file: the store's own, or another's
  // opened for it, closed after however it ends
  export function visit<T>(store: Store, file: string, read: (store: Store) => T): T {
    if (file === store.file) {
      return read(store);
    }
    const other = Store.peek(file);
    try {
      return read(other);
    } finally {
      Store.close(other);
    }
  }

  // every project, the one used last first (those with no message last);
  // one whose file won't read left out (logged), one gone meanwhile too
  export function projects(store: Store): Project[] {
    const out = Store.files(store).flatMap((file) => {
      try {
        return Store.visit(store, file, Store.about) ?? [];
      } catch (err: any) {
        if (fs.existsSync(file)) {
          const why = String(err?.message ?? err);
          console.error("illi: " + (why.startsWith("chat: ") ? why : "the chat in " + file + " won't read: " + why));
        }
        return [];
      }
    });
    const when = (p: Project) => p.last ?? "";
    return out.sort((a, b) => (a.last === null ? 1 : 0) - (b.last === null ? 1 : 0) || (when(a) > when(b) ? -1 : when(a) < when(b) ? 1 : 0) || (a.name < b.name ? -1 : 1));
  }

  // the store's project (null: its file holds none yet): each chat's
  // first and last message looked up by key, its pages and latest line by
  // their indexes, named (the planner, without statistics, would scan the
  // chat's rows instead); its messages, not pages, counted
  export function about(store: Store): Project | null {
    const db  = store.db;
    const row = query(db, "select path from project where id = ?").get(store.project) as { path: string } | null;
    if (row === null) {
      return null;
    }
    const p: Project = { file: store.file, name: Store.name(store.file), path: row.path, first: null, last: null, count: 0, lately: "" };
    const start = query(db, "select date from msg where chat = ? order by i limit 1");
    const end   = query(db, "select i, date from msg where chat = ? order by i desc limit 1");
    const pages = query(db, "select count(*) as n from msg indexed by msg_page where chat = ? and more is not null");
    const line  = query(db, "select text from node indexed by node_end where chat = ? order by first + n desc, n desc limit 1");
    for (const chat of Store.chats(store)) {
      const e = end.get(chat) as { i: number; date: string } | null;
      if (e === null) {
        continue;
      }
      const first = (start.get(chat) as { date: string }).date;
      p.count += e.i + 1 - (pages.get(chat) as { n: number }).n;
      p.first = p.first === null || first < p.first ? first : p.first;
      if (p.last === null || e.date > p.last) {
        [p.last, p.lately] = [e.date, (line.get(chat) as { text: string } | null)?.text ?? ""];
      }
    }
    return p;
  }

  // the store's project: its name and folder ("": home's none)
  export function named(store: Store): { name: string; path: string } {
    return { name: Store.name(store.file), path: (query(store.db, "select path from project where id = ?").get(store.project) as { path: string }).path };
  }

  // the summary lines holding all of the words (none: any of them), in
  // the projects' files given (null: every one), each chat's from its own
  // index (Store.seek): each chat's best first, the best of those first,
  // then each one's second, and so on, as one index's scores weigh its
  // words by how rare they are in it, not in all, so a big chat's would
  // crowd out every small one's. The lines past the FOUND given are
  // counted in `cut`, by project (more: a chat of it had FOUND lines, its
  // most, so it may hold more still)
  export function search(store: Store, words: string[], files: string[] | null, cut?: Map<string, Cut>): Found[] {
    const terms = words.filter((w) => /[\p{L}\p{N}\p{Co}]/u.test(w));
    if (terms.length === 0) {
      return [];
    }
    const ask = (or: boolean) => (files ?? Store.files(store)).flatMap((file) => Store.lines(store, file, terms, or)).sort((a, b) => a.k - b.k || a.score - b.score);
    const and = ask(false);
    const all = and.length > 0 || terms.length === 1 ? and : ask(true);
    for (const { project, full } of all.slice(FOUND)) {
      const was = cut?.get(project);
      cut?.set(project, { n: (was?.n ?? 0) + 1, more: (was?.more ?? false) || full });
    }
    return all.slice(0, FOUND).map(({ score, k, full, ...found }) => found);
  }

  // a project's lines with the words (or: any), each chat's best
  // (Store.seek) with its rank in it (k), as its file was when they began
  // (one read transaction); another project's file that won't read (gone
  // meanwhile): none
  export function lines(store: Store, file: string, terms: string[], or: boolean): Array<Found & { score: number; k: number; full: boolean }> {
    const project = Store.name(file);
    const read = (s: Store) => s.db.transaction(() => Store.chats(s).flatMap((chat) => Store.seek(s.db, chat, terms, or).map((l, k, all) => ({ project, chat, k, full: all.length === FOUND, ...l }))))();
    try {
      return Store.visit(store, file, read);
    } catch (err) {
      if (file === store.file) {
        throw err;
      }
      return [];
    }
  }

  // one chat's best lines with the words (or: any), by bm25, with their
  // scores: every match ranked, however old. In a chat of more lines than
  // LARGE, a word in most lines all along (over half of each of three
  // stretches of SAMPLE: the oldest, the middle, the newest) is left out
  // while a rarer one is in: bm25 gives it next to no weight, so the
  // ranking stays, and its lines are the most to read
  export function seek(db: Database, chat: number, terms: string[], or: boolean): Array<Line & { score: number }> {
    const table = "find_" + chat;
    const quote = (words: string[]) => words.map((w) => '"' + w.replace(/"/g, '""') + '"').join(or ? " OR " : " ");
    const lines = (query(db, `select rowid from ${table} order by rowid desc limit 1`).get() as { rowid: number } | null)?.rowid ?? 0;
    const held = query(db, `select count(*) as n from (select 1 from ${table} where ${table} match ? and rowid >= ? and rowid < ?)`);
    const most = (word: string) => lines > LARGE && [lines - SAMPLE + 1, Math.floor((lines - SAMPLE) / 2) + 1, 1].every((from) => (held.get(quote([word]), from, from + SAMPLE) as { n: number }).n > SAMPLE / 2);
    const rare = terms.filter((w) => !most(w));
    return query(db, `select first, n, text, bm25(${table}) as score from ${table} where ${table} match ? order by score limit ${FOUND}`).all(quote(rare.length > 0 ? rare : terms)) as Array<Line & { score: number }>;
  }

  // the lines the store's chat's index holds (its last rowid: lines are
  // never deleted; the radar's: Radar.ts)
  export function indexed(store: Store): number {
    const table = "find_" + store.chat;
    return (query(store.db, `select rowid from ${table} order by rowid desc limit 1`).get() as { rowid: number } | null)?.rowid ?? 0;
  }

  // how many lines of the store's chat hold a phrase (its words side by
  // side), anywhere, `most` at most, from the index's lists of where each
  // word is alone, no line read (the radar's: Radar.ts)
  export function hits(store: Store, phrase: string, most: number): number {
    const table = "find_" + store.chat;
    return (query(store.db, `select count(*) as n from (select 1 from ${table} where ${table} match ? limit ?)`).get('"' + phrase.replace(/"/g, '""') + '"', most) as { n: number }).n;
  }

  // the lines of the store's chat holding a phrase (its words side by
  // side), each before message `end` (it and all after left out), `most`
  // at most: the messages each covers (the radar's: Radar.ts)
  export function held(store: Store, phrase: string, end: number, most: number): Array<{ first: number; n: number }> {
    const table = "find_" + store.chat;
    return query(store.db, `select first, n from ${table} where ${table} match ? and first + n <= ? limit ?`).all('"' + phrase.replace(/"/g, '""') + '"', end, most) as Array<{ first: number; n: number }>;
  }

  // the date of message i (null: none), its text not read
  export function date(store: Store, i: number): string | null {
    return (query(store.db, "select date from msg where chat = ? and i = ?").get(store.chat, i) as { date: string } | null)?.date ?? null;
  }

  // the store's project's chats
  export function chats(store: Store): number[] {
    return (query(store.db, "select id from chat where project = ? order by id").all(store.project) as Array<{ id: number }>).map((c) => c.id);
  }

  // the images the store's project's chats hold
  export function pictures(store: Store): number {
    return (query(store.db, "select count(*) as n from image i join chat c on c.id = i.chat where c.project = ?").get(store.project) as { n: number }).n;
  }

  // a project forgotten: its file deleted, its WAL and shared memory too
  // (a crash's, or a reader's: one reading it goes on with it as it was),
  // the file first, so none opens it after, then the folder flushed. A
  // crash between leaves the WAL with no file: the next open there makes
  // an empty file, and SQLite drops a WAL beside an empty file, never
  // replays it
  export function forget(file: string): void {
    for (const end of ["", "-wal", "-shm"]) {
      fs.rmSync(file + end, { force: true });
    }
    Store.fsync(path.dirname(file));
  }

  // a file made durable, or a folder's entries (the files put in it)
  export function fsync(file: string): void {
    const fd = fs.openSync(file, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

}
