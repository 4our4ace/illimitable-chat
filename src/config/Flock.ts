// Flock
// =====
// flock(2) on a lock file beside the file it guards: illis changing the
// accounts file (Accounts.edit: sync, the thread held while it waits, as
// a change under it takes a moment), opencode's tools and illi renewing
// a ChatGPT login (ChatGPT.locked: its wait async). flock(2) is loaded
// from the system's C library through bun:ffi (libc.so.6 on Linux,
// libSystem.B.dylib on macOS; its operations' numbers the same on both).
// The system lets a flock go however its holder ends, so no lock
// outlives a crash. Where libc won't load (no flock here), none is
// taken. A flock refused for any reason reads as held: errno isn't read.

import { dlopen } from "bun:ffi";
import * as fs from "node:fs";

// flock(2)'s operations
export const EX = 2;
export const NB = 4;
export const UN = 8;

// Globals
// =======

// flock(2) as loaded (undefined: not yet; null: none here)
let FLOCK: ((fd: number, op: number) => number) | null | undefined;

// Flock
// =====

export namespace Flock {

  // flock(2), loaded once; null: none here
  export function fn(): ((fd: number, op: number) => number) | null {
    if (FLOCK !== undefined) {
      return FLOCK;
    }
    try {
      const libc = process.platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6";
      const lib = dlopen(libc, { flock: { args: ["i32", "i32"], returns: "i32" } });
      FLOCK = (fd, op) => lib.symbols.flock(fd, op) as number;
    } catch {
      FLOCK = null;
    }
    return FLOCK;
  }

  // f run holding `lock`'s flock, its file (made readable by its owner
  // alone, if it isn't there) holding nothing, waiting `wait` ms at most
  // while another holds it (the thread held: a change under it takes a
  // moment); held still: undefined
  export function sync<T>(lock: string, wait: number, f: () => T): T | undefined {
    const flock = Flock.fn();
    const fd = fs.openSync(lock, "w", 0o600);
    try {
      const until = Date.now() + wait;
      while (flock !== null && flock(fd, EX | NB) !== 0) {
        if (Date.now() > until) {
          return undefined;
        }
        Bun.sleepSync(20);
      }
      return f();
    } finally {
      flock?.(fd, UN);
      fs.closeSync(fd);
    }
  }

}
