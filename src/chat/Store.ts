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
// search (find_<chat>, an FTS table made with the chat). Derived from
// msg: each chat's index of its messages' own words (said_<chat>, an FTS
// table that keeps no text: a message's is in msg), its rows the
// messages' indexes, filled in order from the first not indexed yet
// (Store.said_fill), by the index thread (Projects.index), so a long
// chat's never holds the screen up, and one an older illi wrote to is
// caught up with. Derived from find_<chat>: each chat's vectors of its
// summary lines (vec_<chat>, by a line's row there, with the messages it
// covers: Embed.ts), filled in order the same way (Store.vec_fill), a
// file's all of one model (meta's `vectors`: another's, made anew).
// Messages are logged as they come, so their dates rise: a span of time
// is found by bisection over their keys (Store.span), with no index of
// dates.
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
// chat (Store.place: Store.words); said_<chat>, as the chat is opened
// (Store.open: Store.said_make), since an older illi makes chats without
// it; vec_<chat>, by the index thread once the model is there
// (Projects.fill: Store.vec_make). All of it, step by step:
// docs/storage.md.

import { Database, type Statement } from "bun:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Kind } from "../ai/AskAI.ts";
import { history_bare } from "../tools/Clip.ts";
import { Disk } from "./Disk.ts";
import type { Span } from "./When.ts";

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

// a summary line found, or a message by its own words (said: its text the
// passage holding them, its kind first): its project, chat, the messages
// it covers (a message: its index, n 1), text
export type Found = { project: string; chat: number; first: number; n: number; text: string; said: boolean };

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
export const FOUND = 20;

// a chat of more summary lines has its words' shares seen, a word in
// most lines left out (Store.seek); one of fewer, every word as given
const LARGE = 20000;

// the lines of each stretch a word's share is seen in
const SAMPLE = 1000;

// the most of a message a search shows, around the words it holds, and
// how much of that comes before the first of them
const PASSAGE = 300;
const LEAD    = 80;

// the most places of the words in one message weighed for its passage
// (a word all through a long log: its first ones)
const HITS = 400;

// the messages read at once as they're indexed (Store.said_fill)
const BATCH = 256;

// the lines closest in meaning one chat's search keeps as it reads its
// vectors, before those over or under a better one go (Store.near)
const NEAREST = 200;

// a tool call as logged: its name, a space, its input's JSON
const CALL = /^(\S+) (\{[\s\S]*)$/;

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
  // if new, its index of its messages' words too
  export function open(dir: string, place: Place = HOME): Store {
    fs.mkdirSync(dir + PROJECTS, { recursive: true });
    for (let k = 1; ; k++) {
      const file = dir + PROJECTS + "/" + place.name + (k === 1 ? "" : "-" + k) + SQLITE;
      const db = Store.connect(file, true);
      try {
        const at = Store.place(db, place, Store.name(file));
        if (at !== null) {
          Store.said_make(db, at.chat);
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

  // a chat's index of its messages' own words (said_<chat>), made empty if
  // not there: it keeps no text (content ''), only where each word is,
  // its rows the messages' indexes (Store.said_fill)
  export function said_make(db: Database, chat: number): void {
    if (!Store.said_has(db, chat)) {
      db.transaction(() => db.run(`create virtual table if not exists said_${chat} using fts5(text, content = '', tokenize = 'unicode61 remove_diacritics 2')`)).immediate();
    }
  }

  // a chat's vectors of its summary lines (vec_<chat>), made empty if not
  // there; a file whose vectors are another model's (meta's `vectors`,
  // none: none yet) has every chat's dropped first, so the model's own
  // are made anew (one write)
  export function vec_make(db: Database, chat: number, model: string): void {
    const kept = () => (query(db, "select value from meta where key = 'vectors'").get() as { value: string } | null)?.value ?? null;
    if (kept() === model && Store.vec_has(db, chat)) {
      return;
    }
    db.transaction(() => {
      if (kept() !== model) {
        for (const { name } of query(db, "select name from sqlite_schema where type = 'table' and name glob 'vec_[0-9]*'").all() as Array<{ name: string }>) {
          db.run(`drop table ${name}`);
        }
        query(db, "insert into meta (key, value) values ('vectors', ?) on conflict (key) do update set value = excluded.value").run(model);
      }
      db.run(`create table if not exists vec_${chat} (id integer primary key, first integer not null, n integer not null, v blob not null)`);
    }).immediate();
  }

  // whether a chat has its vectors' table
  export function vec_has(db: Database, chat: number): boolean {
    return query(db, "select 1 as y from sqlite_schema where type = 'table' and name = ?").get("vec_" + chat) !== null;
  }

  // whether a chat has its index of its messages' words (one an older
  // illi made, not opened by this one since: not)
  export function said_has(db: Database, chat: number): boolean {
    return query(db, "select 1 as y from sqlite_schema where type = 'table' and name = ?").get("said_" + chat) !== null;
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

  // the messages of the store's chat dated in a span (When.Span), as
  // [a, b): the first, and the one after the last (a = b: none). Each end
  // is a bisection (Store.since), then moved on to a message's first page
  // (Store.first): a message stands where its first page is dated, so the
  // span holds whole messages. Point reads, never a scan: about 2 log2(n)
  // rows, and a long message's later pages
  export function span(store: Store, span: Span): [number, number] {
    const n = Store.count(store);
    const a = Store.first(store, n, Store.since(store, n, span.from));
    return [a, Math.max(a, Store.first(store, n, Store.since(store, n, span.to)))];
  }

  // the first of the n messages dated `ms` or later (n: none), by
  // bisection: messages are logged as they come, so their dates rise. A
  // clock set back makes them fall somewhere, and the bisection ends all
  // the same, at a message dated `ms` or later whose one before is dated
  // earlier (or at 0, or n): a message logged while the clock was off may
  // fall on the wrong side of a span's end
  export function since(store: Store, n: number, ms: number): number {
    const row = query(store.db, "select date, more from msg where chat = ? and i = ?");
    let [a, z] = [0, n];
    while (a < z) {
      const m = (a + z) >> 1;
      const at = row.get(store.chat, m) as { date: string } | null;
      [a, z] = at !== null && Date.parse(at.date) < ms ? [m + 1, z] : [a, m];
    }
    return a;
  }

  // the first index from i on that is a message's first page, not a
  // later one (n: none)
  export function first(store: Store, n: number, i: number): number {
    const row = query(store.db, "select date, more from msg where chat = ? and i = ?");
    while (i > 0 && i < n && (row.get(store.chat, i - 1) as { more: number | null } | null)?.more) {
      i += 1;
    }
    return i;
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

  // the first message of the store's chat its index of words doesn't hold
  // yet: they're indexed in order, so the one after its last
  export function said_end(store: Store): number {
    const last = query(store.db, `select rowid from said_${store.chat} order by rowid desc limit 1`).get() as { rowid: number } | null;
    return last === null ? 0 : last.rowid + 1;
  }

  // the store's chat's messages not indexed yet put in its index of words
  // (each by its own words: Store.said_text), in order, in one write,
  // till `most` characters of them: the messages left after (0: all
  // held). Never two at once nor one twice: the first not held is read
  // inside the write. A chat without the index (an older illi's, not
  // opened by this one): 0
  export function said_fill(store: Store, most: number): number {
    return store.db.transaction(() => {
      if (!Store.said_has(store.db, store.chat)) {
        return 0;
      }
      const add  = query(store.db, `insert into said_${store.chat} (rowid, text) values (?, ?)`);
      const read = query(store.db, "select i, kind, text from msg where chat = ? and i >= ? order by i limit ?");
      let [at, size] = [Store.said_end(store), 0];
      while (size < most) {
        const rows = read.all(store.chat, at, BATCH) as Array<{ i: number; kind: string; text: string }>;
        for (const r of rows) {
          if (size >= most) {
            break;
          }
          add.run(r.i, Store.said_text(r.kind, r.text));
          [at, size] = [r.i + 1, size + r.text.length];
        }
        if (rows.length < BATCH) {
          break;
        }
      }
      return Math.max(0, Store.count(store) - at);
    }).immediate();
  }

  // the first summary line (its row in find_<chat>) of the store's chat
  // without a vector yet: they're made in order, so the one after the last
  export function vec_end(store: Store): number {
    const last = query(store.db, `select id from vec_${store.chat} order by id desc limit 1`).get() as { id: number } | null;
    return last === null ? 1 : last.id + 1;
  }

  // the store's chat's summary lines without a vector given theirs
  // (`vector`: a line's text to its vector, kept small), in order, `most`
  // at most: read and made first, then written in one write, unless
  // another wrote them meanwhile (the first without one moved); the lines
  // left after (0: all have theirs). A chat without the table: 0
  export function vec_fill(store: Store, vector: (text: string) => Uint8Array, most: number): number {
    if (!Store.vec_has(store.db, store.chat)) {
      return 0;
    }
    const from = Store.vec_end(store);
    const rows = query(store.db, `select rowid as id, first, n, text from find_${store.chat} where rowid >= ? order by rowid limit ?`).all(from, most) as Array<{ id: number; first: number; n: number; text: string }>;
    const made = rows.map((r) => ({ ...r, v: vector(r.text) }));
    store.db.transaction(() => {
      if (Store.vec_end(store) === from) {
        const add = query(store.db, `insert into vec_${store.chat} (id, first, n, v) values (?, ?, ?, ?)`);
        made.forEach((r) => add.run(r.id, r.first, r.n, r.v));
      }
    }).immediate();
    return Math.max(0, Store.indexed(store) - Store.vec_end(store) + 1);
  }

  // the summary lines closest in meaning to a query, in the projects'
  // files given, each chat's by its vectors (`near`: a vector's cosine
  // to the query's), those at `floor` or more, read one at a time (a big
  // chat's never all at once), the NEAREST best kept as they come; with a
  // span, only lines over messages all dated in it (Store.span). Of each
  // chat's, one a stretch of messages: a line over or under a better one
  // left out (the levels of one episode would fill every place). The
  // FOUND best of all, best first, each its cosine as its score. Another
  // project's file that won't read: none
  export function near(store: Store, files: string[], near: (v: Uint8Array) => number, span: Span | null, floor: number): Array<Found & { score: number }> {
    const out: Array<Found & { score: number }> = [];
    for (const file of files) {
      const project = Store.name(file);
      const read = (s: Store) => s.db.transaction(() => {
        for (const chat of Store.chats(s).filter((c) => Store.vec_has(s.db, c))) {
          const within = span === null ? null : Store.span({ ...s, chat }, span);
          if (within !== null && within[0] === within[1]) {
            continue;
          }
          const best: Array<{ id: number; first: number; n: number; score: number }> = [];
          const rows = query(s.db, `select id, first, n, v from vec_${chat}` + (within === null ? "" : " where first >= ? and first + n <= ?"));
          for (const r of rows.iterate(...(within ?? [])) as IterableIterator<{ id: number; first: number; n: number; v: Uint8Array }>) {
            const score = near(r.v);
            if (score >= floor && (best.length < NEAREST || score > best[best.length - 1].score)) {
              const at = best.findIndex((b) => b.score < score);
              best.splice(at < 0 ? best.length : at, 0, { id: r.id, first: r.first, n: r.n, score });
              best.length = Math.min(best.length, NEAREST);
            }
          }
          const kept: typeof best = [];
          for (const b of best) {
            if (kept.length < FOUND && !kept.some((k) => b.first < k.first + k.n && k.first < b.first + b.n)) {
              kept.push(b);
            }
          }
          const text = query(s.db, `select text from find_${chat} where rowid = ?`);
          for (const k of kept) {
            out.push({ project, chat, first: k.first, n: k.n, text: (text.get(k.id) as { text: string } | null)?.text ?? "", said: false, score: k.score });
          }
        }
      })();
      try {
        Store.visit(store, file, read);
      } catch (err) {
        if (file === store.file) {
          throw err;
        }
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, FOUND);
  }

  // the words a message is found by: its own text; a tool call's (`name
  // {input}`), its name and the values its input holds, each on a line,
  // unescaped (in JSON a newline's \n would join two words); a result's,
  // without the <history> line recall appended to it (never found again
  // as if it had happened)
  export function said_text(kind: string, text: string): string {
    if (kind === "echo") {
      return history_bare(text);
    }
    const m = kind === "tool" ? CALL.exec(text) : null;
    if (m === null) {
      return text;
    }
    try {
      const out: string[] = [m[1]];
      const walk = (x: unknown): unknown => (typeof x === "string" || typeof x === "number" ? out.push(String(x)) : Array.isArray(x) ? x.forEach(walk) : x !== null && typeof x === "object" ? Object.values(x).forEach(walk) : undefined);
      walk(JSON.parse(m[2]));
      return out.join("\n");
    } catch {
      return text;
    }
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
  // an agent: those its calls get, Logs.view: its whole log till a
  // recap; past one, its first entry, illi's messages to it and all from
  // its last recap on)
  export function work_naming(store: Store, log: string): string[] {
    const id = Store.log_id(store, log);
    const held = "(i = 0 or kind = 'user' or i >= coalesce((select max(i) from work where log = ?1 and kind = 'recap'), 0))";
    return id === null ? [] : (query(store.db, "select text from work where log = ?1 and " + held + " and (text glob '*#[0-9]*' or text glob '*[0-9]+[0-9]*|*')").all(id) as Array<{ text: string }>).map((r) => r.text);
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

  // the summary lines and messages holding all of the words (none: any of
  // them), in the projects' files given (null: every one), each chat's
  // lines from its index of them and its messages from its index of their
  // own words (Store.seek), each its own list: every list's best first,
  // the best of those first, then each one's second, and so on, as one
  // index's scores weigh its words by how rare they are in it, not in all,
  // so a big chat's would crowd out every small one's, and its messages'
  // its lines'. One place once: a message found by its words and its own
  // line too, as the line, ranked where the first of them is (a short
  // message's line is its text). With a span (When.Span), only lines over
  // messages all dated in it, and those messages, each chat's own
  // (Store.span). The places past the FOUND given are counted in `cut`, by
  // project (more: a list of it had FOUND, its most, so it may hold more
  // still); a message given, its passage holding the words (Store.passage).
  // how.or: set true when it searched for any of the words
  export function search(store: Store, words: string[], files: string[] | null, cut?: Map<string, Cut>, span: Span | null = null, how?: { or: boolean }): Found[] {
    const terms = words.filter((w) => /[\p{L}\p{N}\p{Co}]/u.test(w));
    if (terms.length === 0) {
      return [];
    }
    const from   = files ?? Store.files(store);
    const ask    = (or: boolean) => from.flatMap((file) => Store.lines(store, file, terms, or, span)).sort((a, b) => a.k - b.k || a.score - b.score);
    const and    = ask(false);
    const sorted = and.length > 0 || terms.length === 1 ? and : ask(true);
    if (how !== undefined) {
      how.or = sorted !== and;
    }
    const place  = (f: Found) => f.project + "/" + f.chat + "/" + f.first + "+" + f.n;
    const lined  = new Map(sorted.filter((f) => !f.said).map((f) => [place(f), f]));
    const seen   = new Set<string>();
    const all    = sorted.flatMap((f) => {
      const at = place(f);
      if (seen.has(at)) {
        return [];
      }
      seen.add(at);
      return [lined.get(at) ?? f];
    });
    for (const { project, full } of all.slice(FOUND)) {
      const was = cut?.get(project);
      cut?.set(project, { n: (was?.n ?? 0) + 1, more: (was?.more ?? false) || full });
    }
    return Store.passages(store, from, all.slice(0, FOUND).map(({ score, k, full, ...found }) => found), terms);
  }

  // a project's lines and messages with the words (or: any), each list's
  // best (Store.seek) with its rank in it (k), as its file was when they
  // began (one read transaction); with a span, each chat's messages in it
  // found first (Store.span); another project's file that won't read
  // (gone meanwhile): none
  export function lines(store: Store, file: string, terms: string[], or: boolean, span: Span | null = null): Array<Found & { score: number; k: number; full: boolean }> {
    const project = Store.name(file);
    const seek = (s: Store, chat: number) => {
      const within = span === null ? null : Store.span({ ...s, chat }, span);
      return [false, true].flatMap((said) => Store.seek(s.db, chat, terms, or, within, said).map((l, k, all) => ({ project, chat, k, full: all.length === FOUND, said, ...l })));
    };
    const read = (s: Store) => s.db.transaction(() => Store.chats(s).flatMap((chat) => seek(s, chat)))();
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
  // scores: every match ranked, however old; said: its best messages, by
  // their own words (said_<chat>: each its index, n 1, no text; a chat
  // without that index, none). With `within` ([a, b)), only lines over
  // messages a… b - 1, or those messages, kept by the query itself, so
  // the best of those are found, not the best of all cut down. In an index
  // of more rows than LARGE, a word in most rows all along (over half of
  // each of three stretches of SAMPLE: the oldest, the middle, the newest)
  // is left out while a rarer one is in: bm25 gives it next to no weight,
  // so the ranking stays, and its rows are the most to read
  export function seek(db: Database, chat: number, terms: string[], or: boolean, within: [number, number] | null = null, said = false): Array<Line & { score: number }> {
    const table = (said ? "said_" : "find_") + chat;
    if ((within !== null && within[0] === within[1]) || (said && !Store.said_has(db, chat))) {
      return [];
    }
    // a line's row is from 1, a message's its index (from 0): the rows
    // are never deleted, so the last tells how many
    const base  = said ? 0 : 1;
    const quote = (words: string[]) => words.map((w) => '"' + w.replace(/"/g, '""') + '"').join(or ? " OR " : " ");
    const last  = (query(db, `select rowid from ${table} order by rowid desc limit 1`).get() as { rowid: number } | null)?.rowid;
    const rows  = last === undefined ? 0 : last + 1 - base;
    const held  = query(db, `select count(*) as n from (select 1 from ${table} where ${table} match ? and rowid >= ? and rowid < ?)`);
    const most  = (word: string) => rows > LARGE && [rows - SAMPLE, Math.floor((rows - SAMPLE) / 2), 0].every((from) => (held.get(quote([word]), base + from, base + from + SAMPLE) as { n: number }).n > SAMPLE / 2);
    const rare  = terms.filter((w) => !most(w));
    const span  = within === null ? "" : said ? " and rowid >= ? and rowid < ?" : " and first >= ? and first + n <= ?";
    const what  = said ? "rowid as first, 1 as n, '' as text" : "first, n, text";
    return query(db, `select ${what}, bm25(${table}) as score from ${table} where ${table} match ?${span} order by score limit ${FOUND}`).all(quote(rare.length > 0 ? rare : terms), ...(within ?? [])) as Array<Line & { score: number }>;
  }

  // the places found, each message's text its kind and the passage of it
  // holding the terms (Store.passage), read from its project's file
  // (among `files`); one whose file or message won't read meanwhile (its
  // project forgotten): left out
  export function passages(store: Store, files: string[], found: Found[], terms: string[]): Found[] {
    const texts = new Map<Found, string>();
    for (const file of files) {
      const here = found.filter((f) => f.said && f.project === Store.name(file));
      if (here.length === 0) {
        continue;
      }
      try {
        Store.visit(store, file, (s) => here.forEach((f) => {
          const row = query(s.db, "select kind, text from msg where chat = ? and i = ?").get(f.chat, f.first) as { kind: string; text: string } | null;
          if (row !== null) {
            texts.set(f, row.kind + ": " + Store.passage(Store.said_text(row.kind, row.text), terms));
          }
        }));
      } catch (err) {
        if (file === store.file) {
          throw err;
        }
      }
    }
    return found.flatMap((f) => (!f.said ? [f] : texts.has(f) ? [{ ...f, text: texts.get(f)! }] : []));
  }

  // the PASSAGE characters of a text, on one line, around the terms where
  // the most of them meet (the first such place), from LEAD before the
  // first of them, cut at spaces (else between characters), "…" where
  // cut. A term is the index's words of it side by side (as the index
  // matches it: case and accents aside); a text holding none: its start
  export function passage(text: string, terms: string[]): string {
    const flat = text.replace(/\s+/g, " ").trim();
    if (flat.length <= PASSAGE) {
      return flat;
    }
    const fold  = (w: string) => w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const split = (s: string) => [...s.matchAll(/[\p{L}\p{M}\p{N}\p{Co}]+/gu)];
    const words = split(flat).map((m) => ({ at: m.index, w: fold(m[0]) }));
    const asked = terms.map((t) => split(t).map((m) => fold(m[0]))).filter((t) => t.length > 0);
    const hits  = words.flatMap((_, j) => asked.flatMap((t, k) => (t.every((w, d) => words[j + d]?.w === w) ? [{ at: words[j].at, k }] : []))).slice(0, HITS);
    const meet  = (from: number) => new Set(hits.filter((h) => h.at >= from && h.at < from + PASSAGE - LEAD).map((h) => h.k)).size;
    const best  = hits.reduce<{ at: number; n: number } | null>((b, h) => {
      const n = meet(h.at);
      return b === null || n > b.n ? { at: h.at, n } : b;
    }, null);
    let a = Math.max(0, (best?.at ?? 0) - LEAD);
    let z = Math.min(flat.length, a + PASSAGE);
    a = Math.max(0, Math.min(a, z - PASSAGE));
    if (a > 0) {
      const space = flat.indexOf(" ", a);
      a = space >= 0 && space < (best?.at ?? a) ? space + 1 : a;
    }
    if (z < flat.length) {
      const space = flat.lastIndexOf(" ", z);
      z = space > a ? space : z;
    }
    // never between a surrogate pair's halves (an emoji's)
    const low = (k: number) => k > 0 && k < flat.length && /[\udc00-\udfff]/.test(flat[k]);
    a = low(a) ? a + 1 : a;
    z = low(z) ? z - 1 : z;
    return (a > 0 ? "…" : "") + flat.slice(a, z) + (z < flat.length ? "…" : "");
  }

  // the lines the store's chat's index holds (its last rowid: lines are
  // never deleted); said: the messages its index of their words holds
  // (the radar's: Radar.ts)
  export function indexed(store: Store, said = false): number {
    if (said) {
      return Store.said_has(store.db, store.chat) ? Store.said_end(store) : 0;
    }
    const table = "find_" + store.chat;
    return (query(store.db, `select rowid from ${table} order by rowid desc limit 1`).get() as { rowid: number } | null)?.rowid ?? 0;
  }

  // how many lines of the store's chat hold a phrase (its words side by
  // side), anywhere, `most` at most, from the index's lists of where each
  // word is alone, no line read; said: how many messages, by their own
  // words (the radar's: Radar.ts)
  export function hits(store: Store, phrase: string, most: number, said = false): number {
    const table = (said ? "said_" : "find_") + store.chat;
    if (said && !Store.said_has(store.db, store.chat)) {
      return 0;
    }
    return (query(store.db, `select count(*) as n from (select 1 from ${table} where ${table} match ? limit ?)`).get('"' + phrase.replace(/"/g, '""') + '"', most) as { n: number }).n;
  }

  // the lines of the store's chat holding a phrase (its words side by
  // side), each before message `end` (it and all after left out), `most`
  // at most: the messages each covers; said: the messages holding it by
  // their own words, each its index, n 1 (the radar's: Radar.ts)
  export function held(store: Store, phrase: string, end: number, most: number, said = false): Array<{ first: number; n: number }> {
    const table = (said ? "said_" : "find_") + store.chat;
    if (said && !Store.said_has(store.db, store.chat)) {
      return [];
    }
    const at = said ? "rowid as first, 1 as n" : "first, n";
    const to = said ? "rowid < ?" : "first + n <= ?";
    return query(store.db, `select ${at} from ${table} where ${table} match ? and ${to} limit ?`).all('"' + phrase.replace(/"/g, '""') + '"', end, most) as Array<{ first: number; n: number }>;
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
