// Agy
// ===
// Google's agent itself (antigravity-acp), as illi runs it unmodified:
// where it is, and its download. ILLI_ANTIGRAVITY names one of the user's
// own: its command line, the program's path and its arguments as the
// ACP registry lists them (Google's Linux builds take `--uid=`, else
// they look for a group "nobody" and end), split at spaces; else the one
// /login downloaded, kept in
// antigravity/agent/<version>/ of illi's root beside the accounts'
// folders, with what the registry said of it (agent.json: its command and
// arguments). A download is the build the ACP registry
// (agentclientprotocol.com's list of agents) lists for this machine, only
// from Google's own host (dl.google.com), its archive checked against the
// registry's sha256 as it comes, unpacked by illi (each file by its own
// name, none in a folder: nothing outside the version's folder), made
// runnable, then moved into place in one rename, so a download stopped
// halfway leaves nothing that looks installed. Once one is in place,
// every other version kept goes, and every download's folder left beside
// them (.new-*).

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as config from "../../config/Config.ts";

// Types
// =====

// a build of the agent the registry lists for this machine: its version,
// its archive's URL and sha256, the command in it and its arguments
export type Build = { version: string; archive: string; sha256: string; cmd: string; args: string[] };

// a file in a zip archive, as its central directory lists it
type Entry = { name: string; method: number; packed: number; size: number; at: number };

// Constants
// =========

// the ACP registry, and the agent's id in it
const REGISTRY = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
const ID = "antigravity-acp";

// the only host an archive is taken from: Google's own
const HOST = "dl.google.com";

// what the agent takes on disk once unpacked, about (bytes), said before a
// download: its archive's size is the registry's server's to tell
export const UNPACKED = 960e6;

// how long the registry may take to answer (ms)
const ASK = 15e3;

// how old a download's folder left beside the builds must be to go (ms):
// one younger may be another terminal's, still downloading
const LEFT = 24 * 60 * 60e3;

// Agy
// ===

export namespace Agy {

  // the agent named by ILLI_ANTIGRAVITY (a test's own, too), else none
  export let bin: string[] | null = process.env.ILLI_ANTIGRAVITY?.trim() ? process.env.ILLI_ANTIGRAVITY.trim().split(/\s+/) : null;

  // where downloaded builds are kept
  export function home(): string {
    return path.join(config.ROOT, "antigravity", "agent");
  }

  // the agent's command: ILLI_ANTIGRAVITY's, else the newest downloaded;
  // null: none here
  export function command(): string[] | null {
    if (Agy.bin !== null) {
      return Agy.bin;
    }
    const kept = Agy.kept();
    return kept === null ? null : [path.join(Agy.home(), kept.version, kept.cmd), ...kept.args];
  }

  // the newest build downloaded (its agent.json read, its program there);
  // null: none
  export function kept(): Build | null {
    let names: string[];
    try {
      names = fs.readdirSync(Agy.home());
    } catch {
      return null;
    }
    const builds = names.filter((n) => /^\d+(\.\d+)*$/.test(n)).sort(Agy.newer).flatMap((n): Build[] => {
      try {
        const b = JSON.parse(fs.readFileSync(path.join(Agy.home(), n, "agent.json"), "utf8"));
        return fs.existsSync(path.join(Agy.home(), n, String(b.cmd))) ? [{ ...b, version: n }] : [];
      } catch {
        return [];
      }
    });
    return builds[0] ?? null;
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

  // this machine as the registry names it (linux-x86_64, darwin-aarch64,
  // windows-x86_64...)
  export function machine(): string {
    const os   = process.platform === "win32" ? "windows" : process.platform;
    const arch = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : process.arch;
    return os + "-" + arch;
  }

  // the build the registry lists for this machine; thrown, why not (the
  // registry out of reach, no build for this machine, one not Google's)
  export async function latest(signal?: AbortSignal): Promise<Build> {
    let res: Response;
    try {
      res = await globalThis.fetch(REGISTRY, { headers: { "user-agent": "illi" }, signal: signal ?? AbortSignal.timeout(ASK) });
    } catch {
      throw new Error("the ACP registry, which lists Google's agent, can't be reached: check your connection");
    }
    if (!res.ok) {
      throw new Error("the ACP registry, which lists Google's agent, answered " + res.status);
    }
    const all  = await res.json().catch(() => null);
    const it   = (Array.isArray(all?.agents) ? all.agents : []).find((a: any) => a?.id === ID);
    const here = it?.distribution?.binary?.[Agy.machine()];
    if (it === undefined || here === undefined) {
      throw new Error(it === undefined ? "the ACP registry no longer lists Google's Antigravity agent" : "Google's Antigravity agent has no build for this machine (" + Agy.machine() + ")");
    }
    return Agy.build(String(it.version ?? ""), here);
  }

  // a registry's build for this machine, checked: a version, an archive
  // from Google's host over https, a sha256, a command in it by its own
  // name (no folder)
  export function build(version: string, b: any): Build {
    const url  = String(b?.archive ?? "");
    const host = URL.canParse(url) ? new URL(url) : null;
    const cmd  = String(b?.cmd ?? "").replace(/^\.\//, "");
    if (!/^\d+(\.\d+)*$/.test(version) || host?.protocol !== "https:" || host.hostname !== HOST || !/^[0-9a-f]{64}$/.test(String(b?.sha256 ?? "")) || !Agy.plain(cmd)) {
      throw new Error("the ACP registry's entry for Google's agent isn't one illi takes (not from " + HOST + ", or without its checksum)");
    }
    return { version, archive: url, sha256: b.sha256, cmd, args: Array.isArray(b?.args) ? b.args.map(String) : [] };
  }

  // a file's name with no folder in it
  export function plain(name: string): boolean {
    return name !== "" && name !== "." && name !== ".." && !/[\\/]/.test(name);
  }

  // the archive's size, as Google's host tells it (bytes; 0: not told)
  export async function size(b: Build, signal?: AbortSignal): Promise<number> {
    try {
      const res = await globalThis.fetch(b.archive, { method: "HEAD", headers: { "user-agent": "illi" }, signal: signal ?? AbortSignal.timeout(ASK) });
      return Number(res.headers.get("content-length")) || 0;
    } catch {
      return 0;
    }
  }

  // a build downloaded and put in place (its archive checked as it comes,
  // `got` told the bytes so far and of how many), what's left beside it
  // tidied (Agy.tidy); thrown, why not (a stop: the signal's), nothing
  // left behind
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
    Agy.tidy(b.version);
  }

  // what's left beside a build put in place: the other versions, and the
  // download folders a day old (a younger one may be another terminal's
  // download); one that won't go is left, never failing the download
  export function tidy(version: string): void {
    for (const n of fs.readdirSync(Agy.home())) {
      const at = path.join(Agy.home(), n);
      try {
        const old = n.startsWith(".new-") && Date.now() - fs.statSync(at).mtimeMs > LEFT;
        if ((n !== version && /^\d+(\.\d+)*$/.test(n)) || old) {
          fs.rmSync(at, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  // the archive to a file, its sha256 reckoned as it comes and checked;
  // thrown: the host's refusal, a write that failed (a full disk), a stop
  export async function get(b: Build, file: string, signal: AbortSignal, got: (bytes: number, of: number) => void): Promise<void> {
    let res: Response;
    try {
      res = await globalThis.fetch(b.archive, { headers: { "user-agent": "illi" }, signal });
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
      throw new Error("Google's archive didn't match the checksum the registry lists, so illi didn't keep it");
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
      const tail = Buffer.alloc(Math.min(size, 65557));
      fs.readSync(fd, tail, 0, tail.length, size - tail.length);
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
      const dir = Buffer.alloc(bytes);
      fs.readSync(fd, dir, 0, bytes, at);
      const out: Entry[] = [];
      for (let k = 0, p = 0; k < count; k++) {
        if (dir.readUInt32LE(p) !== 0x02014b50) {
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
    } finally {
      fs.closeSync(fd);
    }
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
