// Flock
// =====
// flock(2) on a lock file beside the file it guards: illis changing the
// accounts file (Accounts.edit: sync, the thread held while it waits, as
// a change under it takes a moment), opencode's tools and illi renewing
// a ChatGPT login (ChatGPT.locked: its wait async). flock(2) is loaded
// from the system's C library through bun:ffi (libc.so.6 on Linux,
// libSystem.B.dylib on macOS; its operations' numbers the same on both),
// with errno (__errno_location, __error) to tell a lock another holds
// (EWOULDBLOCK, or EINTR: tried again) from one the file system refuses
// (no locks there, as NFS without lockd: the change goes on without
// one, as before there was a lock). The system lets a flock go however
// its holder ends, so no lock outlives a crash. Where libc won't load
// (no flock here), none is taken; where errno won't, a refusal reads as
// held.

import { dlopen, read, type Pointer } from "bun:ffi";
import * as fs from "node:fs";

// flock(2)'s operations
const EX = 2;
const NB = 4;
const UN = 8;

// the errnos of a lock held (EWOULDBLOCK: Linux's, macOS's) or a call
// cut short (EINTR), each tried again
const BUSY = process.platform === "darwin" ? [35, 4] : [11, 4];

// Types
// =====

// flock(2) as loaded, and the calling thread's errno (null: unknown)
type Lib = { flock: (fd: number, op: number) => number; errno: () => number | null };

// a lock file's flock asked without waiting: taken; held by another;
// none to take (no flock here, or the file system refuses one)
export type Took = "taken" | "held" | "none";

// Globals
// =======

// flock(2) as loaded (undefined: not yet; null: none here)
let LIB: Lib | null | undefined;

// Flock
// =====

export namespace Flock {

  // flock(2) and errno, loaded once; null: no flock here
  export function lib(): Lib | null {
    if (LIB !== undefined) {
      return LIB;
    }
    const libc = process.platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6";
    const where = process.platform === "darwin" ? "__error" : "__errno_location";
    try {
      const own = dlopen(libc, { flock: { args: ["i32", "i32"], returns: "i32" } });
      let errno: () => number | null = () => null;
      try {
        const err = dlopen(libc, { [where]: { args: [], returns: "ptr" } });
        errno = () => {
          const at = err.symbols[where]() as Pointer | null;
          return at === null ? null : read.i32(at, 0);
        };
      } catch {}
      LIB = { flock: (fd, op) => own.symbols.flock(fd, op) as number, errno };
    } catch {
      LIB = null;
    }
    return LIB;
  }

  // a lock file's (open: fd) flock asked without waiting
  export function take(fd: number): Took {
    const lib = Flock.lib();
    if (lib === null) {
      return "none";
    }
    if (lib.flock(fd, EX | NB) === 0) {
      return "taken";
    }
    const errno = lib.errno();
    return errno === null || BUSY.includes(errno) ? "held" : "none";
  }

  // a flock taken let go
  export function free(fd: number): void {
    Flock.lib()?.flock(fd, UN);
  }

  // f run holding `lock`'s flock, its file (made readable by its owner
  // alone, if it isn't there) holding nothing, waiting `wait` ms at most
  // while another holds it (the thread held: a change under it takes a
  // moment); none to take, without it. Held still: undefined
  export function sync<T>(lock: string, wait: number, f: () => T): T | undefined {
    const fd = fs.openSync(lock, "w", 0o600);
    let took: Took = "none";
    try {
      const until = Date.now() + wait;
      while ((took = Flock.take(fd)) === "held") {
        if (Date.now() > until) {
          return undefined;
        }
        Bun.sleepSync(20);
      }
      return f();
    } finally {
      if (took === "taken") {
        Flock.free(fd);
      }
      fs.closeSync(fd);
    }
  }

  // the same, async: f awaited, the wait a sleep; held still past `wait`:
  // thrown, `held` saying why
  export async function hold<T>(lock: string, wait: number, held: string, f: () => Promise<T>): Promise<T> {
    const fd = fs.openSync(lock, "w", 0o600);
    let took: Took = "none";
    try {
      const until = Date.now() + wait;
      while ((took = Flock.take(fd)) === "held") {
        if (Date.now() > until) {
          throw new Error(held);
        }
        await Bun.sleep(50);
      }
      return await f();
    } finally {
      if (took === "taken") {
        Flock.free(fd);
      }
      fs.closeSync(fd);
    }
  }

}
