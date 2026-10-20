// Disk
// ====
// Durability by group commit. What the server writes under config.DIR
// goes at once to the OS's cache, so no chat waits on the disk; flushes
// run one at a time, each making durable every write before it began: on
// Linux one syncfs of the disk, as cheap for one file as for thousands,
// by a shell kept for it (Bun has no syncfs); elsewhere an fsync per
// file. A process crash loses nothing; a machine's, about the last
// flush. An act is answered, and a charge sent, only once flushed.

import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import type { FileSink } from "bun";
import * as config from "../config/Config.ts";

// Types
// =====

// the shell that flushes: what it reads, what it answered not yet read,
// its end
type Shell = { stdin: FileSink; out: ReadableStreamDefaultReader<Uint8Array>; got: string; exited: Promise<number> };

// Globals
// =======

// the files written since the flush running began, the asks waiting on
// them, the flushes running (null: none), the shell that flushes (null:
// none started, or it ended)
const DIRTY = new Set<string>();
let WAITS: Array<() => void> = [];
let RUN: Promise<void> | null = null;
let SHELL: Shell | null = null;

// Disk
// ====

export namespace Disk {

  // a db the processes share, each waiting its turn to write (the wait
  // set first: the switch to WAL locks too)
  export function db(file: string): Database {
    const db = new Database(file, { create: true });
    db.exec("pragma busy_timeout = 10000; pragma journal_mode = wal; pragma synchronous = normal;");
    return db;
  }

  // a file written: flushed soon; answers once it is
  export function wrote(file: string): Promise<void> {
    DIRTY.add(file);
    return Disk.synced();
  }

  // answers once all written so far is flushed
  export function synced(): Promise<void> {
    if (DIRTY.size === 0) {
      return RUN ?? Promise.resolve();
    }
    const done = new Promise<void>((ok) => WAITS.push(ok));
    RUN ??= Disk.run();
    return done;
  }

  export async function run(): Promise<void> {
    while (DIRTY.size > 0) {
      const files = [...DIRTY];
      const waits = WAITS;
      DIRTY.clear();
      WAITS = [];
      await Disk.flush(files).catch((err: Error) => console.error("disk: a flush failed: " + err.message));
      waits.forEach((ok) => ok());
    }
    RUN = null;
  }

  export async function flush(files: string[]): Promise<void> {
    if (process.platform !== "linux") {
      await Promise.all(files.map(Disk.fsync));
      return;
    }
    const shell = (SHELL ??= Disk.shell());
    shell.stdin.write("\n");
    shell.stdin.flush();
    while (!shell.got.includes("\n")) {
      const got = await shell.out.read();
      // the shell ended (a stop's signal): each file by itself
      if (got.done) {
        SHELL = null;
        await Promise.all(files.map(Disk.fsync));
        return;
      }
      shell.got += new TextDecoder().decode(got.value);
    }
    const code = shell.got.slice(0, shell.got.indexOf("\n"));
    shell.got = shell.got.slice(code.length + 1);
    if (code !== "0") {
      throw new Error("sync -f " + config.DIR + " exited " + code);
    }
  }

  export function shell(): Shell {
    const run = 'while read _; do sync -f "$0"; echo $?; done';
    const proc = Bun.spawn(["sh", "-c", run, config.DIR], { stdin: "pipe", stdout: "pipe", stderr: "inherit" });
    return { stdin: proc.stdin, out: proc.stdout.getReader(), got: "", exited: proc.exited };
  }

  // all written so far flushed, then the shell that flushes ended (a
  // profile's switch: illi runs again, leaving no process of its own)
  export async function end(): Promise<void> {
    await Disk.synced();
    const shell = SHELL;
    SHELL = null;
    shell?.stdin.end();
    await shell?.exited;
  }

  // a file gone since needs none
  export async function fsync(file: string): Promise<void> {
    const handle = await fs.promises.open(file, "r").catch((err) => {
      if (err.code !== "ENOENT") {
        throw err;
      }
      return null;
    });
    try {
      await handle?.sync();
    } finally {
      await handle?.close();
    }
  }

}
