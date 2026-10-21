// Import
// ======
// A chat in the files of illi before SQLite, read once into memory.sqlite
// (Store.ts): main/ (messages) and tree/ (nodes), JSON lines in a file a
// day, a month-old day's gzipped (both, if a crash cut its packing: the
// file read); view.json (the state); docs/agent/ (agents' logs). The
// indexes are not read: the day files are the facts, a later line of an
// index winning. A line not JSON (cut short by a crash) or without an
// index (an old act's) is skipped, and so is a gzipped day that won't
// unpack (said); the messages end at the first missing, and pages `more`
// after the last that isn't (a crash cut the write) are not in the chat;
// a node is kept if its messages are. A message without its kind or text
// is kept as a note that it was lost (the rest keep their places); one
// without its date takes its day's.
//
// Data that still won't go in (what this file never thought of) doesn't
// stop illi: the chat starts empty, the old files kept, and the chat
// says why (Import.told, Chat.open). Only the disk failing stops it, and
// the next start tries again.
//
// They become the home project's chat. Written beside the chat's file
// (.<pid>.new: each process its own) in one transaction, synced at its
// commit, then linked in place, which fails if another illi's got there
// first (that one is used, this one dropped); then the old files move
// into before-sqlite/, kept. A crash before the link redoes it all at the
// next start (the file it left swept once its process is gone); one
// after, finishes the move.

import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

// Constants
// =========

// what the files before SQLite were, under the chat's folder
const OLD = ["main", "tree", "main.index", "tree.index", "view.json", "view.json.new", "docs/agent"];

// where they go once read in
const KEPT = "/before-sqlite";

const DAY = /^(\d{4}-\d{2}-\d{2})\.jsonl(\.gz)?$/;

// an agent's log's file: a name and a tag
const LOG = /^([A-Za-z][A-Za-z0-9_-]*)(?:\.([0-9a-z]+))?\.jsonl$/;

// the kinds a message may be
const KINDS = new Set(["user", "work", "mind", "illi", "tool", "echo", "note"]);

// a message that won't read, as kept
const LOST = "(a message here didn't read in from the files before SQLite)";

// the errors that are the disk's, not the data's: the import tried
// again at the next start
const DISK = /^(ENOSPC|EDQUOT|EACCES|EPERM|EROFS|EIO|EMFILE|ENFILE|SQLITE_(FULL|IOERR|READONLY|CANTOPEN|PERM|BUSY|LOCKED|NOMEM))/;

// Import
// ======

export namespace Import {

  // what an import that fell back to an empty chat says, for the chat
  // to tell (Chat.open)
  export const told: string[] = [];

  // the chat folder's old files read in, if there are any and no
  // memory.sqlite yet (schema: makes the tables); a move a crash cut,
  // finished
  export function run(dir: string, schema: (db: Database) => void): void {
    const file = dir + "/memory.sqlite";
    Import.sweep(dir);
    if (fs.existsSync(file)) {
      return Import.keep(dir);
    }
    if (!fs.existsSync(dir + "/main") && !fs.existsSync(dir + "/view.json")) {
      return;
    }
    const tmp = file + "." + process.pid + ".new";
    try {
      try {
        Import.write(tmp, schema, (db) => Import.fill(db, dir));
      } catch (err: any) {
        if (DISK.test(String(err?.code ?? "")) || fs.existsSync(file)) {
          throw err;
        }
        Import.told.push("The chat from before SQLite didn't read in (" + (err?.message ?? err) + "): this one starts empty, and the old files are kept in " + dir + KEPT + ".");
        Import.write(tmp, schema, () => {});
      }
      Import.place(tmp, file);
    } catch (err) {
      if (!fs.existsSync(file)) {
        throw err;
      }
    } finally {
      for (const part of ["", "-journal"]) {
        fs.rmSync(tmp + part, { force: true });
      }
    }
    Import.keep(dir);
  }

  // a new file at `tmp` (any there dropped), its tables made and filled
  // in one transaction, synced at its commit
  export function write(tmp: string, schema: (db: Database) => void, fill: (db: Database) => void): void {
    for (const part of ["", "-journal"]) {
      fs.rmSync(tmp + part, { force: true });
    }
    const db = new Database(tmp, { create: true });
    try {
      db.run("pragma synchronous = full");
      db.run("pragma foreign_keys = on");
      schema(db);
      db.transaction(() => fill(db))();
    } finally {
      db.close();
    }
  }

  // a file read in, put in place unless one is there: linked, which
  // fails if it is (where links can't be made, moved, once it isn't)
  export function place(tmp: string, file: string): void {
    try {
      fs.linkSync(tmp, file);
    } catch (err: any) {
      if (!["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV"].includes(err.code) || fs.existsSync(file)) {
        throw err;
      }
      fs.renameSync(tmp, file);
    }
  }

  // the files imports left whose processes are gone
  export function sweep(dir: string): void {
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      const m = /^memory\.sqlite\.(\d+)\.new(?:-journal)?$/.exec(f);
      if (m !== null && !Import.alive(Number(m[1]))) {
        fs.rmSync(dir + "/" + f, { force: true });
      }
    }
  }

  // whether a process runs (one of another user's: yes)
  export function alive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      return err.code === "EPERM";
    }
  }

  // the old files moved into before-sqlite/, those still there (one
  // kept there already: beside it, numbered; one another illi moved
  // meanwhile: left to it)
  export function keep(dir: string): void {
    for (const part of OLD.filter((part) => fs.existsSync(dir + "/" + part))) {
      let to = dir + KEPT + "/" + part;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      for (let k = 1; fs.existsSync(to); k++) {
        to = dir + KEPT + "/" + part + "." + k;
      }
      try {
        fs.renameSync(dir + "/" + part, to);
      } catch (err: any) {
        if (err.code !== "ENOENT") {
          throw err;
        }
      }
    }
  }

  // the home project's chat, from the old files
  export function fill(db: Database, dir: string): void {
    const now = new Date().toISOString();
    db.query("insert into project (id, uid, key, name, path, made) values (1, ?, 'home', 'home', '', ?)").run(crypto.randomUUID(), now);
    db.query("insert into chat (id, uid, project, made) values (1, ?, 1, ?)").run(crypto.randomUUID(), now);
    const msgs = Import.stream(dir + "/main", (rec) => rec.i);
    let count = 0;
    while (msgs.has(count)) {
      count += 1;
    }
    while (count > 0 && msgs.get(count - 1).more) {
      count -= 1;
    }
    const add = db.query("insert into msg (chat, i, kind, text, date, size, images, line, more) values (1, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (let i = 0; i < count; i++) {
      const r = msgs.get(i);
      const whole = KINDS.has(r.kind) && typeof r.text === "string";
      const [kind, text] = whole ? [r.kind, r.text] : ["note", LOST];
      const images = whole && Array.isArray(r.images) && r.images.length > 0 && r.images.every((x: unknown) => typeof x === "string") ? r.images : null;
      const date = typeof r.date === "string" ? r.date : r.$day + "T00:00:00.000Z";
      const size = whole && typeof r.size === "number" ? r.size : Import.size(kind, text, images ?? []);
      add.run(i, kind, text, date, size, images === null ? null : JSON.stringify(images), whole && typeof r.line === "string" ? r.line : null, r.more ? 1 : null);
    }
    const node = db.query("insert into node (chat, first, n, text) values (1, ?, ?, ?)");
    const find = db.query("insert into find (text, chat, first, n) values (?, 1, ?, ?)");
    for (const r of Import.stream(dir + "/tree", (rec) => (Number.isInteger(rec.l) ? (2 * rec.i + 1) * 2 ** rec.l - 1 : undefined)).values()) {
      const [first, n] = [r.i * 2 ** r.l, 2 ** r.l];
      if (first + n <= count && typeof r.text === "string") {
        node.run(first, n, r.text);
        find.run(r.text, first, n);
      }
    }
    const saved = Import.json(dir + "/view.json");
    if (saved !== null) {
      const { main: _main, tree: _tree, ...state } = saved;
      db.query("insert into state (chat, saved) values (1, ?)").run(JSON.stringify(state));
    }
    Import.agents(db, dir + "/docs/agent");
  }

  // each agent's log, the newest of a name last (an untagged one, old,
  // first; then by its tag, the time), its entries
  export function agents(db: Database, dir: string): void {
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => LOG.exec(f)).filter((m) => m !== null) : [];
    files.sort((a, b) => (a[2] ?? "").length - (b[2] ?? "").length || ((a[2] ?? "") < (b[2] ?? "") ? -1 : (a[2] ?? "") > (b[2] ?? "") ? 1 : 0));
    const log  = db.query("insert into log (chat, log, name) values (1, ?, ?)");
    const work = db.query("insert into work (log, i, kind, text, date) values (?, ?, ?, ?, ?)");
    for (const m of files) {
      const id = Number(log.run(m[0].slice(0, -".jsonl".length), m[1]).lastInsertRowid);
      const recs = Import.lines(dir + "/" + m[0]).filter((r) => Number.isInteger(r.i));
      const each = new Map(recs.map((r) => [r.i, r]));
      for (const r of [...each.values()].sort((a, b) => a.i - b.i)) {
        const whole = KINDS.has(r.kind) && typeof r.text === "string";
        work.run(id, r.i, whole ? r.kind : "note", whole ? r.text : LOST, typeof r.date === "string" ? r.date : new Date(0).toISOString());
      }
    }
  }

  // a log's records by key (a later one winning), its days in order, each
  // with its day ($day)
  export function stream(dir: string, key: (rec: any) => number | undefined): Map<number, any> {
    const out = new Map<number, any>();
    const days = fs.existsSync(dir) ? [...new Set(fs.readdirSync(dir).map((f) => DAY.exec(f)?.[1]).filter((d) => d !== undefined))].sort() : [];
    for (const day of days) {
      const file = dir + "/" + day + ".jsonl";
      for (const rec of Import.lines(fs.existsSync(file) ? file : file + ".gz")) {
        const k = key(rec);
        if (Number.isInteger(k)) {
          out.set(k!, { ...rec, $day: day });
        }
      }
    }
    return out;
  }

  // a file's JSON lines (gzipped: unpacked; one that won't: none, said),
  // those that aren't skipped
  export function lines(file: string): any[] {
    let data = fs.readFileSync(file);
    if (file.endsWith(".gz")) {
      try {
        data = zlib.gunzipSync(data);
      } catch (err: any) {
        console.error("illi: skipped " + file + ": it won't unpack (" + err.message + ")");
        return [];
      }
    }
    return data.toString("utf8").split("\n").flatMap((line) => {
      try {
        const rec = line === "" ? null : JSON.parse(line);
        return rec !== null && typeof rec === "object" ? [rec] : [];
      } catch {
        console.error("illi: skipped a line of " + file + ": not JSON");
        return [];
      }
    });
  }

  // null: none, or unreadable
  export function json(file: string): any {
    try {
      const out = JSON.parse(fs.readFileSync(file, "utf8"));
      return out !== null && typeof out === "object" ? out : null;
    } catch {
      return null;
    }
  }

  // a message's bytes as models read it (Memory.show), for a line that
  // lacks it
  export function size(kind: string, text: string, images: string[]): number {
    return Buffer.byteLength(kind + ": " + text + images.map((name) => "\n[image docs/images/" + name + "]").join(""), "utf8");
  }

}
