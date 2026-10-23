// Lock
// ====
// One process at a time holds a project's chat (Chat.ts): its lock, an
// exclusive SQLite transaction on a file in config.DIR/locks, which the
// system lets go however the process ends; beside it the socket where
// another terminal's view joins (Remote.ts), only its user's to reach.

import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as net from "node:net";
import * as config from "../config/Config.ts";
import { Projects } from "./Projects.ts";

// Types
// =====

// a project's lock held: what stops its views' socket, what lets it go
// (the socket too)
export type Held = { views: () => void; stop: () => void };

// Constants
// =========

// the locks, a socket a project (Projects.lock names it)
const LOCKS = config.DIR + "/locks";
// how long a lock's taking waits on another's, ms: illis starting at once
// would each hold the file shared and fail to take it whole; waiting,
// SQLite has one let go (the others' wait would deadlock), one wins
const GRIP  = 50;

// Globals
// =======

// the project's lock and its file, while this process holds its chat
// (Lock.take)
let held: Held | null = null;
let LOCK = "";

// Lock
// ====

export namespace Lock {

  // holds the chat of the project at cwd for this process (Lock.claim),
  // let go once the chat is closed (Chat.close); a connection to its
  // socket goes to `serve` (another terminal's view: Remote.ts). false:
  // another illi holds it
  export async function take(cwd = process.cwd(), serve?: (sock: net.Socket) => void): Promise<boolean> {
    const name = Projects.lock(Projects.place(cwd).path);
    const got = await Lock.claim(name, serve);
    if (got === null) {
      return false;
    }
    [held, LOCK] = [got, Lock.file(name)];
    return true;
  }

  // a project's lock (by its name, Projects.lock) taken: its lock file
  // held in an exclusive transaction, which the system lets go however
  // the process ends (a crash leaves nothing that holds it), so one
  // process holds it at a time; in a folder only its user can open. With
  // `serve`, a socket beside it too, where another terminal's view joins
  // (a view can do what the person can): only the lock's holder makes
  // one, so one there is a crash's, replaced. null: another holds it
  export async function claim(name: string, serve?: (sock: net.Socket) => void): Promise<Held | null> {
    fs.mkdirSync(LOCKS, { recursive: true, mode: 0o700 });
    fs.chmodSync(LOCKS, 0o700);
    const db = Lock.grip(Lock.file(name));
    if (db === null) {
      return null;
    }
    if (serve === undefined) {
      return { views: () => {}, stop: () => db.close() };
    }
    try {
      const file = Lock.socket(name);
      fs.rmSync(file, { force: true });
      const views = await Lock.listen(file, serve);
      return { views, stop: () => {
        views();
        db.close();
      } };
    } catch (err) {
      db.close();
      throw err;
    }
  }

  // a lock file held: an exclusive transaction on it, its journal in
  // memory (no file a crash leaves); null: another connection has one
  export function grip(file: string): Database | null {
    const db = new Database(file, { create: true });
    try {
      db.run("pragma busy_timeout = " + GRIP);
      db.run("pragma journal_mode = memory");
      db.run("begin exclusive");
      return db;
    } catch (err: any) {
      db.close();
      if (err?.code === "SQLITE_BUSY") {
        return null;
      }
      throw err;
    }
  }

  // a server on a lock's socket, only its user's to reach; what stops it
  // (its connections ended, its file gone), once
  export function listen(file: string, serve: (sock: net.Socket) => void): Promise<() => void> {
    return new Promise((done, fail) => {
      const socks  = new Set<net.Socket>();
      const server = net.createServer((sock) => {
        socks.add(sock);
        sock.on("close", () => socks.delete(sock));
        sock.on("error", () => {});
        serve(sock);
      });
      server.once("error", fail);
      server.listen(file, () => {
        fs.chmodSync(file, 0o600);
        let up = true;
        done(() => {
          if (up) {
            up = false;
            server.close();
            socks.forEach((sock) => sock.destroy());
          }
        });
      });
    });
  }

  // how many projects other illis hold in a profile's folder (dir)
  export function others(dir: string): number {
    const locks = fs.existsSync(dir + "/locks") ? fs.readdirSync(dir + "/locks").filter((f) => f.endsWith(".lock")) : [];
    return locks.map((f) => dir + "/locks/" + f).filter((file) => {
      if (file === LOCK) {
        return false;
      }
      const db = Lock.grip(file);
      db?.close();
      return db === null;
    }).length;
  }

  // a project's lock file, by its name (Projects.lock)
  export function file(name: string): string {
    return LOCKS + "/" + name + ".lock";
  }

  // a project's socket, where views join, by its name
  export function socket(name: string): string {
    return LOCKS + "/" + name + ".sock";
  }

  // lets the chat go (its close; a run again in place, as a switch with
  // illi alone: ProfileCommands.ts term_leave): the views' socket
  // closed and gone, then the lock, so the next illi in this project
  // takes it at once. keep: the lock kept, till illi runs again or ends
  // (this project forgotten meanwhile: no illi opens it)
  export function release(keep = false): void {
    if (keep) {
      return held?.views();
    }
    held?.stop();
    [held, LOCK] = [null, ""];
  }
}
