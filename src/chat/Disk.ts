// Disk
// ====
// Durability by group commit. What illi writes under config.DIR goes at
// once to the OS's cache, so no chat waits on the disk; flushes run one
// at a time, each making durable every write before it began, by an
// fsync of each file written since (the chat's WAL: one file, so no
// flush of the whole disk would be cheaper). A process crash loses
// nothing; a machine's, about the last flush. An act is answered only
// once flushed.

import * as fs from "node:fs";

// Globals
// =======

// the files written since the flush running began, the asks waiting on
// them, the flushes running (null: none)
const DIRTY = new Set<string>();
let WAITS: Array<() => void> = [];
let RUN: Promise<void> | null = null;

// Disk
// ====

export namespace Disk {

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
      await Promise.all(files.map(Disk.fsync)).catch((err: Error) => console.error("disk: a flush failed: " + err.message));
      waits.forEach((ok) => ok());
    }
    RUN = null;
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
