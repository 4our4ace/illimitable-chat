// Agy
// ===
// Google's agent itself (antigravity-acp), as illi runs it unmodified:
// where it is, and its download. ILLI_ANTIGRAVITY names one of the
// user's own: its command line, the program's path and its arguments
// (Google's Linux builds take `--uid=`, else they look for a group
// "nobody" and end), split at spaces, run whatever its version (keeping
// it current is the user's). Else illi runs the one build this illi is
// pinned to (Pinned.ts: the version tried with this illi, as pin.ts takes
// it from the ACP registry), as /login downloads it into
// antigravity/agent/<version>/ of illi's root beside the accounts'
// folders, with what illi took it as (agent.json: its command, arguments
// and sha256). Another version there (an older illi's, or a newer one's)
// is never run: /login offers this illi's in its place (Agy.why says so
// to a call). A download is taken only from Google's own host
// (dl.google.com), its archive checked against the pinned sha256 as it
// comes, unpacked by illi (each file by its own name, none in a folder:
// nothing outside the version's folder), made runnable, then moved into
// place in one rename, so a download stopped halfway leaves nothing that
// looks installed. An illi that runs a version, or downloads it, marks
// it in use while it lives (.users/<its pid>); an older version than this
// illi's goes once no live illi uses it, as this illi first runs its own
// or puts it in place. A newer version stays: it's a newer illi's, which
// may run in another terminal. A download's folder left beside them
// (.new-*) goes a day old.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as config from "../../config/Config.ts";
import { PINNED } from "./Pinned.ts";

// Types
// =====

// a build of the agent for one machine: its version, its archive's URL,
// sha256 and size, its files' size unpacked (bytes), the command in it and
// its arguments
export type Build = { version: string; archive: string; sha256: string; bytes: number; unpacked: number; cmd: string; args: string[] };

// a file in a zip archive, as its central directory lists it
type Entry = { name: string; method: number; packed: number; size: number; at: number };

// a zip archive's end (its end of central directory record): how many
// files it lists, its central directory's size and where it starts
type End = { count: number; bytes: number; at: number };

// Constants
// =========

// the only host an archive is taken from: Google's own
const HOST = "dl.google.com";

// a version's name: numbers between dots
const VERSION = /^\d+(\.\d+)*$/;

// the folder in a version's where each illi running it marks itself
const USERS = ".users";

// how old a download's folder left beside the builds must be to go (ms):
// one younger may be another terminal's, still downloading
const LEFT = 24 * 60 * 60e3;

// how many of an archive's last bytes hold its end: the end record and
// the longest note it may carry
export const TAIL = 65557;

// how each sentence Agy.why says starts
const AGENT = "Google's Antigravity agent ";

// the sentences Agy.why said (Agy.told)
const TOLD = new Set<string>();

// whether this illi has marked its own build in use and tidied (Agy.mark)
let marked = false;

// Agy
// ===

export namespace Agy {

  // the agent named by ILLI_ANTIGRAVITY (a test's own, too), else none
  export let bin: string[] | null = process.env.ILLI_ANTIGRAVITY?.trim() ? process.env.ILLI_ANTIGRAVITY.trim().split(/\s+/) : null;

  // this machine as the ACP registry names it (linux-x86_64,
  // darwin-aarch64, windows-x86_64...)
  export function machine(): string {
    const os   = process.platform === "win32" ? "windows" : process.platform;
    const arch = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : process.arch;
    return os + "-" + arch;
  }

  // this illi's build for this machine (Pinned.ts; a test's own); null:
  // none for this machine
  export let pin: Build | null = PINNED[machine()] ?? null;

  // where downloaded builds are kept
  export function home(): string {
    return path.join(config.ROOT, "antigravity", "agent");
  }

  // the agent's command: ILLI_ANTIGRAVITY's, else this illi's build if it
  // is downloaded (marked in use: Agy.mark); null: none to run (Agy.why
  // tells why)
  export function command(): string[] | null {
    if (Agy.bin !== null) {
      return Agy.bin;
    }
    const b = Agy.pin;
    if (b === null || !Agy.has(b)) {
      return null;
    }
    Agy.mark();
    return [path.join(Agy.home(), b.version, b.cmd), ...b.args];
  }

  // whether there's an agent to run (ILLI_ANTIGRAVITY's, or this illi's
  // build downloaded), as Agy.command finds it, marking nothing
  export function ready(): boolean {
    return Agy.bin !== null || (Agy.pin !== null && Agy.has(Agy.pin));
  }

  // whether a build is downloaded: its folder's agent.json names its
  // sha256, its program is there
  export function has(b: Build): boolean {
    const kept = Agy.kept(b.version);
    return kept !== null && kept.sha256 === b.sha256 && kept.cmd === b.cmd;
  }

  // a downloaded version's agent.json, its program there; null: none
  export function kept(version: string): { cmd: string; args: string[]; sha256: string } | null {
    try {
      const k   = JSON.parse(fs.readFileSync(path.join(Agy.home(), version, "agent.json"), "utf8"));
      const cmd = String(k?.cmd ?? "");
      return Agy.plain(cmd) && fs.existsSync(path.join(Agy.home(), version, cmd)) ? { cmd, args: Array.isArray(k.args) ? k.args.map(String) : [], sha256: String(k.sha256 ?? "") } : null;
    } catch {
      return null;
    }
  }

  // the versions downloaded, newest first
  export function versions(): string[] {
    try {
      return fs.readdirSync(Agy.home()).filter((n) => VERSION.test(n) && Agy.kept(n) !== null).sort(Agy.newer);
    } catch {
      return [];
    }
  }

  // the newest version downloaded that isn't this illi's; null: none
  export function other(): string | null {
    return Agy.versions().find((v) => v !== Agy.pin?.version) ?? null;
  }

  // a command to log an account out with: the agent's, else any version
  // downloaded (marked in use), as a logout asks no model; null: none
  export function any(): string[] | null {
    const cmd = Agy.command();
    if (cmd !== null) {
      return cmd;
    }
    for (const v of Agy.versions()) {
      const k = Agy.kept(v);
      if (k !== null) {
        Agy.use(v);
        return [path.join(Agy.home(), v, k.cmd), ...k.args];
      }
    }
    return null;
  }

  // why there's no agent to run (Agy.command null), as a call or /login
  // says it: no build for this machine, another version here (an older
  // one: /login updates it; a newer illi's: /login downloads this one), or
  // none (/login downloads it)
  export function why(): string {
    const b    = Agy.pin;
    const was  = Agy.other();
    const text = b === null ? AGENT + "has no build for this machine (" + Agy.machine() + ") that illi runs: ILLI_ANTIGRAVITY can name one of your own"
      : was !== null ? AGENT + was + " is here, and this illi runs " + b.version + ": /login " + (Agy.newer(was, b.version) > 0 ? "updates" : "downloads") + " it"
      : AGENT + "isn't here: /login downloads it";
    TOLD.add(text);
    return text;
  }

  // whether a call's failure is one Agy.why said
  export function told(text: string): boolean {
    return TOLD.has(text);
  }

  // versions newest first
  export function newer(a: string, b: string): number {
    const x = a.split(".").map(Number);
    const y = b.split(".").map(Number);
    for (let k = 0; k < Math.max(x.length, y.length); k++) {
      if ((x[k] ?? 0) !== (y[k] ?? 0)) {
        return (y[k] ?? 0) - (x[k] ?? 0);
      }
    }
    return 0;
  }

  // whether illi takes a build: a version, an archive from Google's host
  // over https, a sha256, its sizes, a command in it by its own name (no
  // folder)
  export function takes(b: Build): boolean {
    const url = URL.canParse(b.archive) ? new URL(b.archive) : null;
    return VERSION.test(b.version) && url?.protocol === "https:" && url.hostname === HOST && /^[0-9a-f]{64}$/.test(b.sha256) && b.bytes > 0 && b.unpacked > 0 && Agy.plain(b.cmd) && b.args.every((a) => typeof a === "string");
  }

  // a file's name with no folder in it
  export function plain(name: string): boolean {
    return name !== "" && name !== "." && name !== ".." && !/[\\/]/.test(name);
  }

  // this illi's build marked in use, then what's left beside it tidied
  // (Agy.tidy), once a run
  export function mark(): void {
    if (!marked && Agy.pin !== null) {
      marked = true;
      Agy.use(Agy.pin.version);
      Agy.tidy();
    }
  }

  // a version marked in use by this illi while it lives (a mark that
  // can't be made: none, never failing)
  export function use(version: string): void {
    try {
      const dir = path.join(Agy.home(), version, USERS);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(dir, String(process.pid)), "");
    } catch {}
  }

  // whether a live illi uses a version (its mark's process lives; a mark
  // of one ended goes). A process that took an ended illi's number keeps
  // its version a while more, never one that goes in use
  export function used(version: string): boolean {
    const dir = path.join(Agy.home(), version, USERS);
    let pids: string[];
    try {
      pids = fs.readdirSync(dir);
    } catch {
      return false;
    }
    let live = false;
    for (const pid of pids) {
      if (Agy.lives(Number(pid))) {
        live = true;
      } else {
        fs.rmSync(path.join(dir, pid), { force: true });
      }
    }
    return live;
  }

  // whether a process lives (one illi can't signal: alive)
  export function lives(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) {
      return false;
    }
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      return err?.code === "EPERM";
    }
  }

  // what's left beside this illi's build: each version older than it
  // that no live illi uses, and each download's folder a day old (a
  // younger one may be another terminal's download); a newer version
  // stays (a newer illi's), its marks of ended illis go. One that won't go
  // is left, never failing
  export function tidy(): void {
    const b = Agy.pin;
    let names: string[];
    try {
      names = fs.readdirSync(Agy.home());
    } catch {
      return;
    }
    for (const n of names) {
      const at = path.join(Agy.home(), n);
      try {
        if (n.startsWith(".new-")) {
          if (Date.now() - fs.statSync(at).mtimeMs > LEFT) {
            fs.rmSync(at, { recursive: true, force: true });
          }
        } else if (VERSION.test(n) && !Agy.used(n) && b !== null && Agy.newer(n, b.version) > 0) {
          fs.rmSync(at, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  // a build downloaded and put in place (its archive checked as it comes,
  // `got` told the bytes so far and of how many), marked in use by this
  // illi, what's left beside it tidied (Agy.tidy); thrown, why not (a
  // stop: the signal's), nothing left behind
  export async function download(b: Build, signal: AbortSignal, got: (bytes: number, of: number) => void): Promise<void> {
    fs.mkdirSync(Agy.home(), { recursive: true, mode: 0o700 });
    const tmp = fs.mkdtempSync(path.join(Agy.home(), ".new-"));
    try {
      const zip = path.join(tmp, "agent.zip");
      await Agy.get(b, zip, signal, got);
      const into = path.join(tmp, "agent");
      fs.mkdirSync(into);
      await Agy.unzip(zip, into, signal);
      fs.rmSync(zip, { force: true });
      if (!fs.existsSync(path.join(into, b.cmd))) {
        throw new Error("Google's archive has no " + b.cmd);
      }
      fs.writeFileSync(path.join(into, "agent.json"), JSON.stringify({ cmd: b.cmd, args: b.args, sha256: b.sha256 }, null, 2) + "\n");
      const at = path.join(Agy.home(), b.version);
      fs.rmSync(at, { recursive: true, force: true });
      fs.renameSync(into, at);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    Agy.use(b.version);
    Agy.tidy();
  }

  // the archive to a file, its sha256 reckoned as it comes and checked;
  // thrown: the host's refusal, a write that failed (a full disk), a stop
  export async function get(b: Build, file: string, signal: AbortSignal, got: (bytes: number, of: number) => void): Promise<void> {
    let res: Response;
    try {
      res = await globalThis.fetch(b.archive, { headers: { "user-agent": "illi", "accept-encoding": "identity" }, signal });
    } catch (err) {
      throw signal.aborted ? err : new Error(HOST + " can't be reached: check your connection");
    }
    if (!res.ok || res.body === null) {
      throw new Error(HOST + " answered " + res.status + " for Google's agent");
    }
    const of   = Number(res.headers.get("content-length")) || 0;
    const hash = new Bun.CryptoHasher("sha256");
    let bytes = 0;
    const count = new Transform({
      transform(chunk: Buffer, _, done) {
        hash.update(chunk);
        bytes += chunk.length;
        got(bytes, of);
        done(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body as any), count, fs.createWriteStream(file, { mode: 0o600 }), { signal });
    if (hash.digest("hex") !== b.sha256) {
      throw new Error("Google's archive didn't match the checksum this illi takes it by, so illi didn't keep it");
    }
  }

  // a zip archive's files unpacked into a folder: each by its own name
  // (one in a folder, or named to climb out, refused), runnable; thrown:
  // an archive illi can't read (zip64, an unknown compression)
  export async function unzip(zip: string, into: string, signal?: AbortSignal): Promise<void> {
    for (const e of Agy.entries(zip)) {
      if (e.name.endsWith("/")) {
        continue;
      }
      if (!Agy.plain(e.name)) {
        throw new Error("Google's archive holds a file in a folder (" + e.name + "), which illi doesn't unpack");
      }
      const start = Agy.data(zip, e);
      const out   = path.join(into, e.name);
      if (e.packed === 0 && e.method === 0) {
        fs.writeFileSync(out, "", { mode: 0o755 });
        if (e.size !== 0) {
          throw new Error("Google's archive unpacked " + e.name + " short");
        }
        continue;
      }
      const from  = fs.createReadStream(zip, { start, end: start + e.packed - 1, signal });
      const to    = fs.createWriteStream(out, { mode: 0o755 });
      if (e.method === 8) {
        await pipeline(from, zlib.createInflateRaw(), to);
      } else if (e.method === 0) {
        await pipeline(from, to);
      } else {
        throw new Error("Google's archive packs " + e.name + " in a way illi can't unpack");
      }
      if (fs.statSync(out).size !== e.size) {
        throw new Error("Google's archive unpacked " + e.name + " short");
      }
      fs.chmodSync(out, 0o755);
    }
  }

  // a zip archive's files, as its central directory lists them
  export function entries(zip: string): Entry[] {
    const fd = fs.openSync(zip, "r");
    try {
      const size = fs.fstatSync(fd).size;
      const tail = Buffer.alloc(Math.min(size, TAIL));
      fs.readSync(fd, tail, 0, tail.length, size - tail.length);
      const end = Agy.end(tail);
      const dir = Buffer.alloc(end.bytes);
      fs.readSync(fd, dir, 0, end.bytes, end.at);
      return Agy.list(dir, end.count);
    } finally {
      fs.closeSync(fd);
    }
  }

  // a zip archive's end, found in its last bytes (TAIL of them, or all);
  // thrown: none there, or a zip64's
  export function end(tail: Buffer): End {
    const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0) {
      throw new Error("Google's archive isn't a zip illi can read");
    }
    const count = tail.readUInt16LE(end + 10);
    const bytes = tail.readUInt32LE(end + 12);
    const at    = tail.readUInt32LE(end + 16);
    if (count === 0xffff || at === 0xffffffff) {
      throw new Error("Google's archive is a zip64, which illi can't read");
    }
    return { count, bytes, at };
  }

  // a central directory's files (`count` of them); thrown: one that won't
  // read, or a zip64's
  export function list(dir: Buffer, count: number): Entry[] {
    const out: Entry[] = [];
    for (let k = 0, p = 0; k < count; k++) {
      if (p + 46 > dir.length || dir.readUInt32LE(p) !== 0x02014b50) {
        throw new Error("Google's archive's list of files won't read");
      }
      const names = dir.readUInt16LE(p + 28);
      const extra = dir.readUInt16LE(p + 30);
      const note  = dir.readUInt16LE(p + 32);
      const e = { name: dir.toString("utf8", p + 46, p + 46 + names), method: dir.readUInt16LE(p + 10), packed: dir.readUInt32LE(p + 20), size: dir.readUInt32LE(p + 24), at: dir.readUInt32LE(p + 42) };
      if (e.packed === 0xffffffff || e.size === 0xffffffff || e.at === 0xffffffff) {
        throw new Error("Google's archive is a zip64, which illi can't read");
      }
      out.push(e);
      p += 46 + names + extra + note;
    }
    return out;
  }

  // where a file's packed bytes start: past its local header
  export function data(zip: string, e: Entry): number {
    const fd = fs.openSync(zip, "r");
    try {
      const head = Buffer.alloc(30);
      fs.readSync(fd, head, 0, 30, e.at);
      if (head.readUInt32LE(0) !== 0x04034b50) {
        throw new Error("Google's archive's " + e.name + " won't read");
      }
      return e.at + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    } finally {
      fs.closeSync(fd);
    }
  }

}
