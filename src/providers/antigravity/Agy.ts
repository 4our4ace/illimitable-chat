// Agy
// ===
// Google's Antigravity CLI itself (agy), whose `agy acp` is the agent
// illi runs, unmodified: where it is, and its download. ILLI_ANTIGRAVITY
// names a command line of the user's own that starts its ACP server
// (`agy acp`, say), split at spaces, run whatever its version (keeping it
// current is the user's). Else the user's own `agy` on PATH (its absolute
// folders alone: a relative one is the project's, Agy.which), once it is
// MINIMUM or later (Agy.look: its version asked once in the background,
// as `agy --version` takes a second or more, and kept by its path, size
// and time in agy.json beside the builds, so a start never waits on it;
// its own updates keep it current, as the user installed it). Else illi
// runs the one build this illi is pinned to (Pinned.ts: the version tried
// with this illi, as pin.ts takes it from Google's releases), as /login
// downloads it into antigravity/agent/<version>/ of illi's root beside the
// accounts' folders, with what illi took it as (agent.json: its command,
// arguments and sha256). Another version there is never run: /login
// offers this illi's in its place (Agy.why says so to a call). A download
// is taken only from the CLI's releases on GitHub (RELEASES), its archive
// checked against the pinned sha256 as it comes, unpacked by illi (each
// file by its own name, none in a folder, none but plain files: nothing
// outside the version's folder), made runnable, then moved into place in
// one rename, so a download stopped halfway leaves nothing that looks
// installed. An illi that runs a version, or downloads it, marks it in
// use while it lives (.users/<its pid>). Each version but this illi's own
// build goes once no live illi uses it (none kept while the user's own CLI
// runs in its place, which lasts: illi's download is then dead weight;
// ILLI_ANTIGRAVITY's keeps it, being mostly for a while), as this illi
// first runs a CLI, downloads one, and ends (the providers' close), so a
// version an illi update left (Google's old agy-acp-server, 1.4.5) never
// lingers. A download's folder left beside them (.new-*) goes a day old.
// With autoupdate on, illi downloads its own build by itself once an
// account is connected and no CLI is here (an
// illi update moved the pin: Agy.update), in the background, one illi at
// a time on the machine (.updating names the one doing it); a call
// meanwhile says it's downloading.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as config from "../../config/Config.ts";
import { PINNED } from "./Pinned.ts";

// Types
// =====

// a build of the CLI for one machine: its version, its archive's URL,
// sha256 and size, its files' size unpacked (bytes), the command in it and
// its arguments (the ACP server's: acp)
export type Build = { version: string; archive: string; sha256: string; bytes: number; unpacked: number; cmd: string; args: string[] };

// the user's own CLI as found: where, its version
export type Theirs = { at: string; version: string };

// a file in a tar archive: its name, size, its type (0: a plain file)
export type Tarred = { name: string; size: number; type: string };

// Constants
// =========

// where every archive is taken from: the CLI's releases on GitHub (each
// a version's folder of them)
export const RELEASES = "https://github.com/google-antigravity/antigravity-cli/releases/download/";

// the oldest version illi runs: the one `agy acp` was first tried with
// (1.5.0 put Google's ACP server in the CLI; 1.5.1 lists every model an
// account offers to every client; 1.5.2 shows a session its own agent's
// commands). A later pin may be newer; one older is never taken
export const MINIMUM = "1.5.2";

// a version's name: numbers between dots
const VERSION = /^\d+(\.\d+)*$/;

// the folder in a version's where each illi running it marks itself
const USERS = ".users";

// how old a download's folder left beside the builds must be to go (ms):
// one younger may be another terminal's, still downloading
const LEFT = 24 * 60 * 60e3;

// how long the user's own CLI may take to tell its version (ms)
const ASKING = 30e3;

// a tar archive's blocks
const BLOCK = 512;

// how each sentence Agy.why says starts
const CLI = "Google's Antigravity CLI ";

// the sentences Agy.why said (Agy.told)
const TOLD = new Set<string>();

// whether this illi has marked the build it runs in use and tidied
// (Agy.settle)
let settled = false;

// the file naming the illi that downloads its build by itself (its pid),
// in the CLI's folder: one at a time on the machine (Agy.update)
const LOCK = ".updating";

// this illi's download by itself (Agy.update): its build, how far it got
// (bytes of `of`), its end; the version it was tried for this run
let updating: { b: Build; bytes: number; of: number; done: Promise<boolean> } | null = null;
let tried = "";

// the user's own CLI looked for this run (Agy.look): what it found (null:
// none, or too old to run), and the look itself
let found: Theirs | null | undefined;
let looking: Promise<Theirs | null> | null = null;

// Agy
// ===

export namespace Agy {

  // the command line named by ILLI_ANTIGRAVITY (a test's own, too), else
  // none
  export let bin: string[] | null = process.env.ILLI_ANTIGRAVITY?.trim() ? process.env.ILLI_ANTIGRAVITY.trim().split(/\s+/) : null;

  // the program that is the user's own CLI (`agy`), where PATH finds it
  // first, looked for without holding illi up: each folder at once (a
  // PATH of many slow folders, WSL's Windows ones, takes a second looked
  // through one by one, as Bun.which does), an absolute one alone (a
  // relative one, . or node_modules/.bin, is the project's: its own agy
  // would run); null: none (a test's own)
  export let which = async (): Promise<string | null> => {
    const dirs = (process.env.PATH ?? "").split(path.delimiter).filter((d) => path.isAbsolute(d));
    const runs = (at: string) => fs.promises.access(at, fs.constants.X_OK).then(() => fs.promises.stat(at)).then((st) => (st.isFile() ? at : null), () => null);
    return (await Promise.all(dirs.map((d) => runs(path.join(d, "agy"))))).find((at) => at !== null) ?? null;
  };

  // this machine as Pinned.ts names it (linux-x86_64, darwin-aarch64...)
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

  // whether a version is one illi runs: MINIMUM or later
  export function least(version: string): boolean {
    return VERSION.test(version) && Agy.newer(version, MINIMUM) <= 0;
  }

  // the user's own CLI, MINIMUM or later, as this run's look found it, else
  // as agy.json kept it, while it's the same program (PATH isn't looked
  // through: that's Agy.look's, in the background); null: none, too old,
  // or not known yet
  export function installed(): Theirs | null {
    if (found !== undefined) {
      return found;
    }
    const kept = Agy.remembered();
    return kept !== null && Agy.least(kept.version) ? kept : null;
  }

  // the user's own CLI looked for, once a run: `agy` on PATH, its version
  // as agy.json kept it for this program, else asked of it (`agy
  // --version`, its own update not started by it) and kept; MINIMUM or
  // later, it's run in place of illi's build. null: none, too old, or it
  // told no version
  export function look(): Promise<Theirs | null> {
    looking ??= (async () => {
      const at = await Agy.which();
      let version = at === null ? null : Agy.recalled(at);
      if (at !== null && version === null) {
        version = await Agy.asked(at);
        if (version !== null) {
          Agy.recall(at, version);
        }
      }
      found = at !== null && version !== null && Agy.least(version) ? { at, version } : null;
      return found;
    })();
    return looking;
  }

  // the look let go, the next asking again (a test's fresh look)
  export function unlook(): void {
    [found, looking] = [undefined, null];
  }

  // the program agy.json keeps, and its version, while it's the same
  // file (its size and time as then); null: none kept, or it changed
  export function remembered(): Theirs | null {
    try {
      const kept = JSON.parse(fs.readFileSync(path.join(Agy.home(), "..", "agy.json"), "utf8"));
      const now  = fs.statSync(String(kept?.at ?? ""));
      return kept.size === now.size && kept.time === now.mtimeMs && typeof kept.version === "string" && VERSION.test(kept.version) ? { at: kept.at, version: kept.version } : null;
    } catch {
      return null;
    }
  }

  // the version agy.json keeps for a program, while it's the same file;
  // null: none kept for it, or it changed
  export function recalled(at: string): string | null {
    const kept = Agy.remembered();
    return kept?.at === at ? kept.version : null;
  }

  // a program's version kept in agy.json, by its path, size and time (one
  // that can't be kept: asked again next run, never failing)
  export function recall(at: string, version: string): void {
    try {
      const now = fs.statSync(at);
      fs.mkdirSync(path.join(Agy.home(), ".."), { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(Agy.home(), "..", "agy.json"), JSON.stringify({ at, size: now.size, time: now.mtimeMs, version }) + "\n");
    } catch {}
  }

  // a program's version as `--version` tells it, its first line alone
  // (numbers between dots); null: none told in ASKING (its output never
  // waited on past it, though a child of its own holds it open)
  export async function asked(at: string): Promise<string | null> {
    try {
      const run  = Bun.spawn([at, "--version"], { stdin: "ignore", stdout: "pipe", stderr: "ignore", env: { ...process.env, AGY_CLI_DISABLE_AUTO_UPDATE: "1" }, timeout: ASKING });
      const late = Bun.sleep(ASKING + 1e3).then(() => null);
      const text = await Promise.race([new Response(run.stdout).text(), late]);
      const code = await Promise.race([run.exited, late]);
      const said = text?.trim().split("\n")[0]?.trim() ?? "";
      return code === 0 && VERSION.test(said) ? said : null;
    } catch {
      return null;
    }
  }

  // the command that starts the CLI's ACP server: ILLI_ANTIGRAVITY's, else
  // the user's own CLI (MINIMUM or later), else this illi's build if it is
  // downloaded (marked in use: Agy.settle); null: none to run (Agy.why
  // tells why)
  export function command(): string[] | null {
    if (Agy.bin !== null) {
      Agy.settle(null);
      return Agy.bin;
    }
    const theirs = Agy.installed();
    if (theirs !== null) {
      Agy.settle(null);
      return [theirs.at, "acp"];
    }
    const b = Agy.pin;
    if (b === null || !Agy.has(b)) {
      return null;
    }
    Agy.settle(b.version);
    return [path.join(Agy.home(), b.version, b.cmd), ...b.args];
  }

  // whether there's an agent to run (ILLI_ANTIGRAVITY's, the user's own
  // CLI as known, or this illi's build downloaded), as Agy.command finds
  // it, marking nothing
  export function ready(): boolean {
    return Agy.bin !== null || Agy.installed() !== null || (Agy.pin !== null && Agy.has(Agy.pin));
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

  // the newest version downloaded that isn't this illi's, MINIMUM or
  // later (an older one is no ACP server illi runs, never offered as one);
  // null: none
  export function other(): string | null {
    return Agy.versions().find((v) => v !== Agy.pin?.version && Agy.least(v)) ?? null;
  }

  // a command to log an account out with: the agent's, else any version
  // downloaded MINIMUM or later (marked in use), as a logout asks no
  // model; null: none
  export function any(): string[] | null {
    const cmd = Agy.command();
    if (cmd !== null) {
      return cmd;
    }
    for (const v of Agy.versions().filter(Agy.least)) {
      const k = Agy.kept(v);
      if (k !== null) {
        Agy.use(v);
        return [path.join(Agy.home(), v, k.cmd), ...k.args];
      }
    }
    return null;
  }

  // why there's no agent to run (Agy.command null), as a call or /login
  // says it: no build for this machine, this illi's downloading, another
  // version here (an older one: /login updates it; a newer illi's:
  // /login downloads this one), or none (/login downloads it; the user's
  // own CLI too old said)
  export function why(): string {
    const b    = Agy.pin;
    const was  = Agy.other();
    const now  = Agy.progress();
    const old  = Agy.stale();
    const text = b === null ? CLI + "has no build for this machine (" + Agy.machine() + ") that illi runs: install agy " + MINIMUM + " or later, or let ILLI_ANTIGRAVITY name one of your own"
      : now !== null ? CLI + b.version + " is downloading" + (now.share === null ? " in another illi" : " (" + now.share + "%)") + ": try again once it's done"
      : was !== null ? CLI + was + " is here, and this illi runs " + b.version + ": /login " + (Agy.newer(was, b.version) > 0 ? "updates" : "downloads") + " it"
      : CLI + "isn't here: /login downloads it" + (old === null ? "" : " (your own agy is " + old + ", older than the " + MINIMUM + " illi runs: `agy update` brings it current)");
    TOLD.add(text);
    return text;
  }

  // why a CLI that says it's this version isn't run (older than MINIMUM:
  // ILLI_ANTIGRAVITY's may be), said as Agy.why's are (Agy.told)
  export function older(version: string): string {
    const text = CLI + version + " is older than the " + MINIMUM + " illi runs: `agy update` brings it current";
    TOLD.add(text);
    return text;
  }

  // the version of the user's own CLI that is too old to run, as agy.json
  // kept it (null: none, or one MINIMUM or later)
  export function stale(): string | null {
    const v = Agy.remembered()?.version ?? null;
    return v !== null && !Agy.least(v) ? v : null;
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

  // whether illi takes a build: a version MINIMUM or later, an archive of
  // that version's release on GitHub (a .tar.gz), a sha256, its sizes, a
  // command in it by its own name (no folder)
  export function takes(b: Build): boolean {
    return Agy.least(b.version) && b.archive.startsWith(RELEASES + b.version + "/") && !b.archive.slice(RELEASES.length + b.version.length + 1).includes("/") && b.archive.endsWith(".tar.gz") && /^[0-9a-f]{64}$/.test(b.sha256) && b.bytes > 0 && b.unpacked > 0 && Agy.plain(b.cmd) && b.args.every((a) => typeof a === "string");
  }

  // a file's name with no folder in it
  export function plain(name: string): boolean {
    return name !== "" && name !== "." && name !== ".." && !/[\\/]/.test(name);
  }

  // the build this illi runs (a version: its own; null: another program)
  // marked in use, then what's left beside it tidied (Agy.tidy), once a
  // run
  export function settle(version: string | null): void {
    if (!settled) {
      settled = true;
      if (version !== null) {
        Agy.use(version);
      }
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

  // what's left beside the build this illi runs: each version no live
  // illi uses but this illi's own build (none kept while the user's own
  // CLI runs in its place, as it lasts; kept while ILLI_ANTIGRAVITY's
  // does, as that's mostly for a while), and each download's folder a
  // day old (a younger one may be another terminal's download). One that
  // won't go is left, never failing
  export function tidy(): void {
    const keep = Agy.installed() !== null ? null : Agy.pin?.version ?? null;
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
        } else if (VERSION.test(n) && n !== keep && !Agy.used(n)) {
          fs.rmSync(at, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  // a build downloaded and put in place (its archive checked as it comes,
  // `got` told the bytes so far and of how many; the same build put there
  // meanwhile by another illi kept as it is, as it may be running), marked
  // in use by this illi (before it's in place, so another illi's tidy
  // never finds it unmarked), what's left beside it tidied (Agy.tidy);
  // thrown, why not (a stop: the signal's), nothing left behind
  export async function download(b: Build, signal: AbortSignal, got: (bytes: number, of: number) => void): Promise<void> {
    fs.mkdirSync(Agy.home(), { recursive: true, mode: 0o700 });
    const tmp = fs.mkdtempSync(path.join(Agy.home(), ".new-"));
    try {
      const tgz = path.join(tmp, "cli.tar.gz");
      await Agy.get(b, tgz, signal, got);
      const into = path.join(tmp, "cli");
      fs.mkdirSync(into);
      await Agy.untar(fs.createReadStream(tgz, { signal }), into);
      fs.rmSync(tgz, { force: true });
      if (!fs.existsSync(path.join(into, b.cmd))) {
        throw new Error("Google's archive has no " + b.cmd);
      }
      fs.writeFileSync(path.join(into, "agent.json"), JSON.stringify({ cmd: b.cmd, args: b.args, sha256: b.sha256 }, null, 2) + "\n");
      fs.mkdirSync(path.join(into, USERS), { mode: 0o700 });
      fs.writeFileSync(path.join(into, USERS, String(process.pid)), "");
      if (!Agy.has(b)) {
        const at = path.join(Agy.home(), b.version);
        fs.rmSync(at, { recursive: true, force: true });
        fs.renameSync(into, at);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    Agy.use(b.version);
    Agy.tidy();
  }

  // this illi's build downloaded by itself where autoupdate is on (mode)
  // and a Google account is connected (account), no agent being here (the
  // user's own CLI looked for first): the download under way (Agy.update);
  // null: none
  export function auto(mode: string, account: boolean): Promise<boolean> | null {
    return mode === "on" && account && !Agy.ready() ? Agy.look().then((theirs) => (theirs === null && !Agy.ready() ? Agy.update() : false)) : null;
  }

  // this illi's build downloaded by itself, in the background: once a run
  // for a version (one asked again shares the first), one illi at a time
  // on the machine
  // (LOCK: another's, its process alive, is left to it; one whose illi
  // ended goes). true: downloaded now; false: not (none to take, here
  // already, another illi's under way, or it failed: logged, /login
  // offers it as before)
  export function update(): Promise<boolean> {
    if (updating !== null) {
      return updating.done;
    }
    const b = Agy.pin;
    if (b === null || tried === b.version || Agy.ready()) {
      return Promise.resolve(false);
    }
    tried = b.version;
    const lock = path.join(Agy.home(), LOCK);
    try {
      fs.mkdirSync(Agy.home(), { recursive: true, mode: 0o700 });
      if (Agy.lives(Number(fs.readFileSync(lock, "utf8")))) {
        return Promise.resolve(false);
      }
    } catch {}
    try {
      fs.rmSync(lock, { force: true });
      fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
    } catch {
      return Promise.resolve(false);
    }
    const now = { b, bytes: 0, of: b.bytes, done: Promise.resolve(false) };
    now.done = Agy.download(b, new AbortController().signal, (bytes, of) => {
      [now.bytes, now.of] = [bytes, of || b.bytes];
    }).then(() => true, (err: any) => {
      console.error("antigravity: Google's Antigravity CLI " + b.version + " wasn't downloaded: " + String(err?.message ?? err));
      return false;
    }).finally(() => {
      updating = null;
      try {
        if (fs.readFileSync(lock, "utf8") === String(process.pid)) {
          fs.rmSync(lock, { force: true });
        }
      } catch {}
    });
    updating = now;
    return now.done;
  }

  // the download of this illi's build under way by itself: in this illi,
  // its share done (%); in another (LOCK, its process alive), share null;
  // none: null
  export function progress(): { share: number | null } | null {
    if (updating !== null) {
      return { share: Math.min(100, Math.floor((updating.bytes / (updating.of || 1)) * 100)) };
    }
    try {
      const pid = Number(fs.readFileSync(path.join(Agy.home(), LOCK), "utf8"));
      return pid !== process.pid && Agy.lives(pid) && !Agy.ready() ? { share: null } : null;
    } catch {
      return null;
    }
  }

  // the archive to a file, its sha256 reckoned as it comes and checked;
  // thrown: the host's refusal, a write that failed (a full disk), a stop
  export async function get(b: Build, file: string, signal: AbortSignal, got: (bytes: number, of: number) => void): Promise<void> {
    let res: Response;
    try {
      res = await globalThis.fetch(b.archive, { headers: { "user-agent": "illi", "accept-encoding": "identity" }, signal });
    } catch (err) {
      throw signal.aborted ? err : new Error("GitHub can't be reached: check your connection");
    }
    if (!res.ok || res.body === null) {
      throw new Error("GitHub answered " + res.status + " for Google's Antigravity CLI");
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

  // a gzipped tar archive's files, unpacked into a folder (null: only
  // listed): each a plain file by its own name, runnable (one in a folder,
  // named to climb out, or no plain file: a link, a folder, refused); a
  // pax header's path taken as the next file's name (a long one), its
  // other fields passed over, as are a global header's. Thrown: an
  // archive illi can't read
  export async function untar(from: Readable, into: string | null): Promise<Tarred[]> {
    const files: Tarred[] = [];
    let buf: Buffer = Buffer.alloc(0);
    let file: { fd: number | null; left: number; size: number } | null = null;
    let skip = 0;
    let done = false;
    let pax: { left: number; size: number; data: Buffer[] } | null = null;
    let named: string | null = null;
    const pad = (n: number) => (BLOCK - (n % BLOCK)) % BLOCK;
    const take = (chunk: Buffer) => {
      buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]);
      while (!done) {
        if (file !== null) {
          const n = Math.min(file.left, buf.length);
          if (n > 0 && file.fd !== null) {
            fs.writeSync(file.fd, buf, 0, n);
          }
          file.left -= n;
          buf = buf.subarray(n);
          if (file.left > 0) {
            return;
          }
          if (file.fd !== null) {
            fs.closeSync(file.fd);
          }
          skip = pad(file.size);
          file = null;
        }
        if (pax !== null) {
          const n = Math.min(pax.left, buf.length);
          pax.data.push(Buffer.from(buf.subarray(0, n)));
          pax.left -= n;
          buf = buf.subarray(n);
          if (pax.left > 0) {
            return;
          }
          named = Agy.paxed(Buffer.concat(pax.data)).path ?? null;
          skip = pad(pax.size);
          pax = null;
        }
        const n = Math.min(skip, buf.length);
        skip -= n;
        buf = buf.subarray(n);
        if (skip > 0 || buf.length < BLOCK) {
          return;
        }
        const block = buf.subarray(0, BLOCK);
        buf = buf.subarray(BLOCK);
        if (block.every((x) => x === 0)) {
          done = true;
          return;
        }
        const h = Agy.header(block);
        if (h.type === "x") {
          pax = { left: h.size, size: h.size, data: [] };
          continue;
        }
        if (h.type === "g") {
          skip = h.size + pad(h.size);
          continue;
        }
        if (named !== null) {
          [h.name, named] = [named, null];
        }
        if (h.type !== "0" && h.type !== "\0") {
          throw new Error("Google's archive holds " + h.name + ", which isn't a plain file, so illi doesn't unpack it");
        }
        if (!Agy.plain(h.name)) {
          throw new Error("Google's archive holds a file in a folder (" + h.name + "), which illi doesn't unpack");
        }
        files.push(h);
        file = { fd: into === null ? null : fs.openSync(path.join(into, h.name), "wx", 0o755), left: h.size, size: h.size };
      }
    };
    const sink = new Writable({
      write(chunk: Buffer, _, next) {
        try {
          take(chunk);
          next();
        } catch (err: any) {
          next(err);
        }
      },
      final(next) {
        next(file !== null || !done ? new Error("Google's archive ended short") : null);
      },
    });
    try {
      await pipeline(from, zlib.createGunzip(), sink);
    } finally {
      const open = file as { fd: number | null } | null;
      if (open?.fd != null) {
        fs.closeSync(open.fd);
      }
    }
    if (into !== null) {
      files.forEach((f) => fs.chmodSync(path.join(into, f.name), 0o755));
    }
    return files;
  }

  // a pax header's fields (its records: "<length> <key>=<value>\n")
  export function paxed(data: Buffer): Record<string, string> {
    const fields: Record<string, string> = {};
    for (let at = 0; at < data.length; ) {
      const space = data.indexOf(0x20, at);
      const len   = Number(data.toString("ascii", at, space));
      if (space < 0 || !Number.isSafeInteger(len) || len <= space - at) {
        break;
      }
      const record = data.toString("utf8", space + 1, at + len - 1);
      const eq = record.indexOf("=");
      if (eq > 0) {
        fields[record.slice(0, eq)] = record.slice(eq + 1);
      }
      at += len;
    }
    return fields;
  }

  // a tar header block read: its file's name (a POSIX ustar prefix before
  // it: GNU's header keeps other fields there), size and type; thrown: its
  // checksum doesn't match, or its size won't read
  export function header(block: Buffer): Tarred {
    const text = (from: number, len: number) => block.toString("utf8", from, from + len).replace(/\0[\s\S]*$/, "");
    const sum  = block.reduce((n, x, k) => n + (k >= 148 && k < 156 ? 32 : x), 0);
    if (parseInt(text(148, 8).trim(), 8) !== sum) {
      throw new Error("Google's archive won't read (a file's header doesn't add up)");
    }
    const prefix = block.toString("latin1", 257, 263) === "ustar\0" ? text(345, 155) : "";
    const size   = parseInt(text(124, 12).trim() || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error("Google's archive won't read (a file's size)");
    }
    return { name: (prefix === "" ? "" : prefix + "/") + text(0, 100), size, type: String.fromCharCode(block[156]) };
  }

}
