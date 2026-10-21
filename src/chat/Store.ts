// Store
// =====
// The chats' facts in one SQLite file (bun:sqlite): memory.sqlite in the
// profile's chat folder. It keeps what the memory tree (Memory.ts) reads
// and writes, never how the tree works, so a change to the tree needs
// none here.
//
// A project is where illi ran (Projects.ts): a git repo's top folder, by
// its path, or home; its name is unique; it holds one chat for now, and
// room for more. Each has a random uid beside its number (two files may
// merge one day; numbers are never used again) and `extra`, a JSON object
// for what may come.
//
// Facts are added once, never changed; only forgetting a project
// (Store.forget) deletes them, by deleting its row: all of its chats'
// rows go with it, by foreign keys (on delete cascade):
// - msg: a message (a page), by its chat and index, with the folder illi
//   ran in;
// - node: a summary line, by the messages it covers (its first, how
//   many: the zoom's id+n), so any shape of tree fits; one built twice
//   keeps the first, which a view may hold already;
// - log, work: an agent's log (a name and a tag) and its entries.
// One row a chat is written over: its state (the saved view, pick, goal,
// work, cut...), never rebuilt from the facts (the cache holds by it).
// Derived from node: find, the summary lines' words, for search (an FTS
// table, which has no keys: deleted by hand, its words gone from its
// index at once, secure-delete).
//
// Durable as files were: each write is one transaction, in WAL mode at
// synchronous NORMAL, so a crash never leaves half a write and no write
// waits on the disk; the WAL goes to Disk.ts, whose flush (one syncfs) an
// act waits on. Closed, it checkpoints and leaves the one file. A file is
// made with auto_vacuum incremental (only a new one can be: set before
// WAL mode, which writes the file) and secure_delete, so what is forgotten
// is overwritten and its space given back.
//
// The schema's version is user_version: an older one moves on by each
// STEP in turn, in one transaction each. A STEP only adds (a table, an
// index, a column with a default), so an older illi may still write the
// file; one that doesn't sets meta's compat to its version, and an illi
// older than compat refuses the file. A table a STEP adds for a chat's
// rows references chat (id) on delete cascade, so an older illi's forget
// reaches it; one that names images elsewhere sets compat (an older
// illi's forget would delete them). The files of illi before it are
// read in once (Import.ts).

import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import type { Kind } from "../ai/AskAI.ts";
import { Disk } from "./Disk.ts";
import { Import } from "./Import.ts";

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

// a project, for a model's first look: its name, folder, first and last
// message (null: none yet), messages, its latest summary line
export type Project = { id: number; name: string; path: string; first: string | null; last: string | null; count: number; lately: string };

// a summary line found: its project, chat, the messages it covers, text
export type Found = { project: string; chat: number; first: number; n: number; text: string };

// the file, its connection, the project and chat its rows are of
export type Store = { file: string; db: Database; project: number; chat: number };

// Constants
// =========

export const FILE = "/memory.sqlite";

// the chats outside any git repo
export const HOME: Place = { key: "home", name: "home", path: "" };

// the file's mark (application_id): "illi"
const MARK = 0x696c6c69;

// each moves the schema one version on: STEPS[k], from k to k + 1
const STEPS = [`
create table meta (key text primary key, value text not null) without rowid;
insert into meta (key, value) values ('compat', '1');
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
create virtual table find using fts5(text, chat unindexed, first unindexed, n unindexed, tokenize = 'unicode61 remove_diacritics 2');
insert into find (find, rank) values ('secure-delete', 1);
pragma application_id = ${MARK};
`];

// the most lines a search gives
const FOUND = 20;

// how long a connection waits for another's lock, ms
const WAIT = 10000;

// Store
// =====

export namespace Store {

  // the chat folder's file, made (or read in from the files before it)
  // and moved on to this schema; the chat of the project at `place`,
  // made if new (null: none, the file alone, for upkeep)
  export function open(dir: string, place: Place | null = HOME): Store {
    fs.mkdirSync(dir, { recursive: true });
    Import.run(dir, Store.schema);
    const file = dir + FILE;
    const db = new Database(file, { create: true });
    db.run("pragma busy_timeout = " + WAIT);
    db.run("pragma foreign_keys = on");
    Store.schema(db);
    Store.wal(db);
    db.run("pragma synchronous = normal");
    db.run("pragma secure_delete = on");
    const { project, chat } = place === null ? { project: 0, chat: 0 } : Store.place(db, place);
    return { file, db, project, chat };
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

  // a connection's file moved on to this schema (a new file first made to
  // give space back), each step in one transaction with its version,
  // which another process may have taken it to meanwhile; one newer, kept
  // as it is, unless it needs a newer illi
  export function schema(db: Database): void {
    const version = () => (db.query("pragma user_version").get() as { user_version: number }).user_version;
    if (version() > STEPS.length) {
      const compat = Number((db.query("select value from meta where key = 'compat'").get() as { value: string } | null)?.value ?? Infinity);
      if (!(compat <= STEPS.length)) {
        throw new Error("the chat (memory.sqlite) is of a newer illi: update illi to open it");
      }
      return;
    }
    if (version() === 0 && (db.query("pragma page_count").get() as { page_count: number }).page_count === 0) {
      db.run("pragma auto_vacuum = incremental");
    }
    for (let k = version(); k < STEPS.length; k++) {
      db.transaction(() => {
        if (version() === k) {
          db.run(STEPS[k]);
          db.run("pragma user_version = " + (k + 1));
        }
      }).immediate();
    }
  }

  // the project at a place and its first chat, made if new (its name
  // another's already: numbered)
  export function place(db: Database, place: Place): { project: number; chat: number } {
    return db.transaction(() => {
      const now = new Date().toISOString();
      if (db.query("select 1 from project where key = ?").get(place.key) === null) {
        let name = place.name;
        for (let k = 2; db.query("select 1 from project where name = ?").get(name) !== null; k++) {
          name = place.name + "-" + k;
        }
        db.query("insert into project (uid, key, name, path, made) values (?, ?, ?, ?, ?)").run(crypto.randomUUID(), place.key, name, place.path, now);
      }
      const project = (db.query("select id from project where key = ?").get(place.key) as { id: number }).id;
      const known = db.query("select id from chat where project = ? order by id limit 1").get(project) as { id: number } | null;
      const chat = known?.id ?? Number(db.query("insert into chat (uid, project, made) values (?, ?, ?)").run(crypto.randomUUID(), project, now).lastInsertRowid);
      return { project, chat };
    }).immediate();
  }

  // checkpointed, its WAL gone: the one file left
  export function close(store: Store): void {
    store.db.close();
  }

  // written: its WAL flushed soon (Disk.ts)
  export function wrote(store: Store): void {
    void Disk.wrote(store.file + "-wal");
  }

  // the same file, read as another chat of it
  export function as(store: Store, project: number, chat: number): Store {
    return { ...store, project, chat };
  }

  // Messages
  // --------

  // the messages logged
  export function count(store: Store): number {
    return (store.db.query("select coalesce(max(i) + 1, 0) as n from msg where chat = ?").get(store.chat) as { n: number }).n;
  }

  // message i; null: none
  export function msg(store: Store, i: number): Row | null {
    const row = store.db.query("select i, kind, text, date, size, images, line, more from msg where chat = ? and i = ?").get(store.chat, i) as any;
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
    return (store.db.query("select max(i) as i from msg where chat = ? and kind = ? and i < ?").get(store.chat, kind, end) as { i: number | null }).i ?? -1;
  }

  // messages logged in one write, each with the folder illi runs in
  export function push(store: Store, rows: Row[], cwd: string): void {
    const add = store.db.query("insert into msg (chat, i, kind, text, date, size, images, line, more, cwd) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
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
    return (store.db.query("select text from node where chat = ? and first = ? and n = ?").get(store.chat, first, n) as { text: string } | null)?.text ?? null;
  }

  // lines built, logged in one write, their words found by search
  export function nodes(store: Store, lines: Line[]): void {
    const add  = store.db.query("insert into node (chat, first, n, text) values (?, ?, ?, ?) on conflict do nothing");
    const find = store.db.query("insert into find (text, chat, first, n) values (?, ?, ?, ?)");
    store.db.transaction(() => {
      for (const { first, n, text } of lines) {
        if (add.run(store.chat, first, n, text).changes === 1) {
          find.run(text, store.chat, first, n);
        }
      }
    })();
    Store.wrote(store);
  }

  // State
  // -----

  // the chat's state as last saved; null: none
  export function state(store: Store): any {
    const row = store.db.query("select saved from state where chat = ?").get(store.chat) as { saved: string } | null;
    return row === null ? null : JSON.parse(row.saved);
  }

  // written over
  export function save(store: Store, saved: object): void {
    store.db.query("insert into state (chat, saved) values (?, ?) on conflict (chat) do update set saved = excluded.saved").run(store.chat, JSON.stringify(saved));
    Store.wrote(store);
  }

  // Agents
  // ------

  // a log made, by its name (a name and a tag); false: there already
  export function log_new(store: Store, log: string, name: string): boolean {
    const made = store.db.query("insert into log (chat, log, name) values (?, ?, ?) on conflict do nothing").run(store.chat, log, name).changes === 1;
    if (made) {
      Store.wrote(store);
    }
    return made;
  }

  // the log a name took last; null: none
  export function log_of(store: Store, name: string): string | null {
    return (store.db.query("select log from log where chat = ? and name = ? order by id desc limit 1").get(store.chat, name) as { log: string } | null)?.log ?? null;
  }

  // every log, oldest first
  export function logs(store: Store): string[] {
    return (store.db.query("select log from log where chat = ? order by id").all(store.chat) as Array<{ log: string }>).map((r) => r.log);
  }

  // a log's entries; null: no such log
  export function work(store: Store, log: string): Entry[] | null {
    const id = Store.log_id(store, log);
    return id === null ? null : (store.db.query("select i, kind, text, date from work where log = ? order by i").all(id) as Entry[]);
  }

  // an entry logged (its log made, if not yet)
  export function work_push(store: Store, log: string, name: string, e: Entry): void {
    store.db.transaction(() => {
      store.db.query("insert into log (chat, log, name) values (?, ?, ?) on conflict do nothing").run(store.chat, log, name);
      store.db.query("insert into work (log, i, kind, text, date) values (?, ?, ?, ?, ?)").run(Store.log_id(store, log), e.i, e.kind, e.text, e.date);
    })();
    Store.wrote(store);
  }

  export function log_id(store: Store, log: string): number | null {
    return (store.db.query("select id from log where chat = ? and log = ?").get(store.chat, log) as { id: number } | null)?.id ?? null;
  }

  // the entries a log holds
  export function work_count(store: Store, log: string): number {
    const id = Store.log_id(store, log);
    return id === null ? 0 : (store.db.query("select count(*) as n from work where log = ?").get(id) as { n: number }).n;
  }

  // Projects
  // --------

  // every project, the one used last first (those with no message last):
  // each chat's first and last message and its pages looked up by key, its
  // latest line by index, never a scan of its rows; its messages, not
  // pages, counted
  export function projects(store: Store): Project[] {
    const db    = store.db;
    const out   = (db.query("select id, name, path from project").all() as Array<Pick<Project, "id" | "name" | "path">>).map((p): Project => ({ ...p, first: null, last: null, count: 0, lately: "" }));
    const by    = new Map(out.map((p) => [p.id, p]));
    const start = db.query("select date from msg where chat = ? order by i limit 1");
    const end   = db.query("select i, date from msg where chat = ? order by i desc limit 1");
    const pages = db.query("select count(*) as n from msg where chat = ? and more is not null");
    const line  = db.query("select text from node where chat = ? order by first + n desc, n desc limit 1");
    for (const c of db.query("select id, project from chat order by id").all() as Array<{ id: number; project: number }>) {
      const p = by.get(c.project);
      const e = end.get(c.id) as { i: number; date: string } | null;
      if (p === undefined || e === null) {
        continue;
      }
      const first = (start.get(c.id) as { date: string }).date;
      p.count += e.i + 1 - (pages.get(c.id) as { n: number }).n;
      p.first = p.first === null || first < p.first ? first : p.first;
      if (p.last === null || e.date > p.last) {
        [p.last, p.lately] = [e.date, (line.get(c.id) as { text: string } | null)?.text ?? ""];
      }
    }
    const when = (p: Project) => p.last ?? "";
    return out.sort((a, b) => (a.last === null ? 1 : 0) - (b.last === null ? 1 : 0) || (when(a) > when(b) ? -1 : when(a) < when(b) ? 1 : 0) || a.id - b.id);
  }

  // the store's project: its name and folder ("": home's none)
  export function named(store: Store): { name: string; path: string } {
    return store.db.query("select name, path from project where id = ?").get(store.project) as { name: string; path: string };
  }

  // a project by its name, and its first chat; null: none
  export function project(store: Store, name: string): { project: number; chat: number } | null {
    return store.db.query("select p.id as project, min(c.id) as chat from project p join chat c on c.project = p.id where p.name = ? group by p.id").get(name) as { project: number; chat: number } | null;
  }

  // the summary lines holding all of the words (none: any of them), the
  // best first, in the projects given (null: every one)
  export function search(store: Store, words: string[], projects: number[] | null): Found[] {
    const terms = words.map((w) => '"' + w.replace(/"/g, '""') + '"');
    const where = projects === null ? "" : " and c.project in (" + projects.map(() => "?").join(", ") + ")";
    const query = store.db.query(`select p.name as project, f.chat as chat, f.first as first, f.n as n, f.text as text
      from find f join chat c on c.id = f.chat join project p on p.id = c.project
      where find match ?${where} order by bm25(find) limit ${FOUND}`);
    const ask = (match: string) => query.all(match, ...(projects ?? [])) as Found[];
    if (terms.length === 0) {
      return [];
    }
    const all = ask(terms.join(" "));
    return all.length > 0 || terms.length === 1 ? all : ask(terms.join(" OR "));
  }

  // a project's chats
  export function chats(store: Store, project: number): number[] {
    return (store.db.query("select id from chat where project = ?").all(project) as Array<{ id: number }>).map((c) => c.id);
  }

  // the images a project's messages name and no other project's do
  export function only(store: Store, project: number): string[] {
    const chats = Store.chats(store, project);
    const ids = chats.map(() => "?").join(", ") || "null";
    const named = (not: string) => new Set((store.db.query(`select distinct j.value as value from msg m, json_each(m.images) j where m.chat ${not}in (${ids})`).all(...chats) as Array<{ value: string }>).map((r) => r.value));
    const rest = named("not ");
    return [...named("")].filter((name) => !rest.has(name)).sort();
  }

  // a project forgotten: its row deleted, and with it all its chats'
  // rows (foreign keys), find's by hand; overwritten (secure delete, in
  // find's index too), its space given back. The images only it named,
  // which the caller deletes
  export function forget(store: Store, project: number): string[] {
    const db = store.db;
    const images = db.transaction(() => {
      const chats = Store.chats(store, project);
      const only = Store.only(store, project);
      db.query(`delete from find where chat in (${chats.map(() => "?").join(", ") || "null"})`).run(...chats);
      db.query("delete from project where id = ?").run(project);
      return only;
    }).immediate();
    db.run("pragma incremental_vacuum");
    db.run("pragma wal_checkpoint(truncate)");
    Store.wrote(store);
    return images;
  }

}
