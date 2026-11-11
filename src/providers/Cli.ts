// Cli
// ===
// A vendor's CLI that illi runs unmodified (Google's Antigravity CLI:
// antigravity/Agy.ts; GitHub's Copilot CLI: github-copilot/CopilotCli.ts):
// where it is, and its download, each CLI by its Spec. A command line of
// the user's own named by the spec's variable (ILLI_ANTIGRAVITY,
// ILLI_COPILOT), split at spaces, runs whatever its version (keeping it
// current is the user's). Else the user's own program on PATH (its
// absolute folders alone: a relative one is the project's, which), once
// it is the spec's minimum or later (look: its version asked once in the
// background, as a CLI may take a second or more to tell it, and kept by
// its path, size and time in a file beside the builds, so a start never
// waits on it; its own updates keep it current, as the user installed
// it). Else illi runs the one build this illi is pinned to (the CLI's
// Pinned.ts: the version tried with this illi, as its pin.ts takes it
// from the CLI's releases on GitHub), as /login downloads it into a
// version's folder of illi's root, with what illi took it as (agent.json:
// its command, arguments and sha256). Another version there is never
// run: /login offers this illi's in its place (why says so to a call).
// A download is taken only from the CLI's releases on GitHub (the spec's
// releases), its archive checked against the pinned sha256 as it comes,
// unpacked by illi (each file by its own name, none in a folder, none but
// plain files: nothing outside the version's folder), made runnable, then
// moved into place in one rename, so a download stopped halfway leaves
// nothing that looks installed. An illi that runs a version, or downloads
// it, marks it in use while it lives (.users/<its pid>). Each version but
// this illi's own build goes once no live illi uses it (none kept while
// the user's own CLI runs in its place, which lasts: illi's download is
// then dead weight; the variable's command line keeps it, being mostly
// for a while), as this illi first runs a CLI, downloads one, and ends
// (the providers' close), so a version an illi update left never
// lingers. A download's folder left beside them (.new-*) goes a day old.
// With autoupdate on, illi downloads its own build by itself once an
// account is connected and no CLI is here (an illi update moved the pin:
// update), in the background, one illi at a time on the machine: a lock
// names the one doing it (.updating-<n>, its pid), which writes it anew
// as it goes (each BEAT) and removes it as it's done or as illi ends
// (unlock, the providers' close). A lock whose illi ended, or one not
// written for STALE (its illi killed, its pid since another process's:
// a reboot), is dead, whatever its pid: the next illi claims the
// download in its place, one alone (claim). A download by itself that
// gets no byte for STALL gives up, so none holds the lock stuck. A call
// meanwhile says it's downloading; its end is told the chat, a note
// (notes: Provider.ts notes). `illi uninstall` removes the
// downloads (programs).

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as config from "../config/Config.ts";

// Types
// =====

// a build of a CLI for one machine: its version, its archive's URL,
// sha256 and size, its files' size unpacked (bytes), the command in it and
// its arguments (Antigravity's ACP server's: acp)
export type Build = { version: string; archive: string; sha256: string; bytes: number; unpacked: number; cmd: string; args: string[] };

// the user's own CLI as found: where, its version
export type Theirs = { at: string; version: string };

// a file in a tar archive: its name, size, its type (0: a plain file)
export type Tarred = { name: string; size: number; type: string };

// a download's lock (LOCK): its file and number, the pid it names (NaN:
// none written yet), how long since it was written (ms)
export type Lock = { at: string; n: number; pid: number; idle: number };

// what makes a CLI: what its sentences call it (its maker's, as its
// archive is called), and /login's page (CliLogin.ts): its short name,
// the plan that runs on it, where it comes from, what more it unpacks of
// itself as it first runs ("": nothing); the log line's vendor; the
// user's own program on PATH, its arguments, the variable that names a
// command line of the user's own, and what brings the user's own
// current; where its archives are (its releases' download URL, a tag's
// start before the version: "v" for v1.0.109), the oldest version illi
// runs, the builds this illi is pinned to by machine; the folder of
// illi's root its builds are kept in, the file beside it the user's own
// program's version is kept in; how its version is asked (the
// arguments, and what more of the environment keeps the ask from
// updating it or unpacking it elsewhere)
export type Spec = {
  name     : string;
  maker    : string;
  short    : string;
  plan     : string;
  from     : string;
  grows    : string;
  vendor   : string;
  program  : string;
  args     : string[];
  named    : string;
  update   : string;
  releases : string;
  tag      : string;
  minimum  : string;
  pinned   : Record<string, Build>;
  folder   : string[];
  file     : string;
  asks     : string[];
  quiet    : () => Record<string, string>;
};

// a CLI as illi finds and downloads it (cli: each part's own comment)
export type Cli = {
  spec      : Spec;
  bin       : string[] | null;
  which     : () => Promise<string | null>;
  pin       : Build | null;
  machine   : () => string;
  home      : () => string;
  least     : (version: string) => boolean;
  installed : () => Theirs | null;
  look      : () => Promise<Theirs | null>;
  unlook    : () => void;
  remembered: () => Theirs | null;
  recalled  : (at: string) => string | null;
  recall    : (at: string, version: string) => void;
  asked     : (at: string) => Promise<string | null>;
  command   : () => string[] | null;
  ready     : () => boolean;
  has       : (b: Build) => boolean;
  kept      : (version: string) => { cmd: string; args: string[]; sha256: string } | null;
  versions  : () => string[];
  other     : () => string | null;
  any       : () => string[] | null;
  ours      : (cmd: string[]) => string | null;
  why       : () => string;
  older     : (version: string) => string;
  stale     : () => string | null;
  told      : (text: string) => boolean;
  notes     : (f: (text: string) => void) => void;
  newer     : (a: string, b: string) => number;
  takes     : (b: Build) => boolean;
  plain     : (name: string) => boolean;
  settle    : (version: string | null) => void;
  use       : (version: string) => void;
  used      : (version: string) => boolean;
  lives     : (pid: number) => boolean;
  tidy      : () => void;
  programs  : () => string[];
  download  : (b: Build, signal: AbortSignal, got: (bytes: number, of: number) => void) => Promise<void>;
  auto      : (mode: string, account: boolean) => Promise<boolean> | null;
  update    : () => Promise<boolean>;
  progress  : () => { share: number | null } | null;
  lock      : () => Lock | null;
  dead      : (lock: Lock) => boolean;
  claim     : () => string | null;
  unlock    : () => void;
  get       : (b: Build, file: string, signal: AbortSignal, got: (bytes: number, of: number) => void) => Promise<void>;
  untar     : (from: Readable, into: string | null) => Promise<Tarred[]>;
  paxed     : (data: Buffer) => Record<string, string>;
  header    : (block: Buffer) => Tarred;
};

// Constants
// =========

// a version's name: numbers between dots
const VERSION = /^\d+(\.\d+)*$/;

// a version as a CLI tells it, the end of its first line ("1.5.2",
// "GitHub Copilot CLI 1.0.109.")
const TOLD_VERSION = /(?:^|\s)v?(\d+(?:\.\d+)*)\.?$/;

// the folder in a version's where each illi running it marks itself
const USERS = ".users";

// how old a download's folder left beside the builds must be to go (ms):
// one younger may be another terminal's, still downloading
const LEFT = 24 * 60 * 60e3;

// how long the user's own CLI may take to tell its version (ms)
const ASKING = 30e3;

// a tar archive's blocks
const BLOCK = 512;

// the files naming the illi that downloads its build by itself (its
// pid), in the CLI's folder, one at a time on the machine (update): LOCK
// and a number, the highest the one that counts, each made new by the
// illi that claims the download (claim), never written over. Its illi
// writes it anew each BEAT while it downloads and unpacks (ms); one not
// written for STALE is dead, though a process has its pid (as
// config/Update.ts takes a folder unwritten for its STALE as a dead
// illi's). A download by itself gives up once no byte comes for STALL
// (as Update.ts's does past its IDLE)
const LOCK  = ".updating-";
const BEAT  = 5e3;
const STALE = 60e3;
const STALL = 30e3;

// Cli
// ===

// this machine as a Pinned.ts names it (linux-x86_64, darwin-aarch64...)
export function cli_machine(): string {
  const os   = process.platform === "win32" ? "windows" : process.platform;
  const arch = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : process.arch;
  return os + "-" + arch;
}

// versions newest first
export function cli_newer(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let k = 0; k < Math.max(x.length, y.length); k++) {
    if ((x[k] ?? 0) !== (y[k] ?? 0)) {
      return (y[k] ?? 0) - (x[k] ?? 0);
    }
  }
  return 0;
}

// a file's name with no folder in it
export function cli_plain(name: string): boolean {
  return name !== "" && name !== "." && name !== ".." && !/[\\/]/.test(name);
}

// whether a process lives (one illi can't signal: alive)
export function cli_lives(pid: number): boolean {
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

// a CLI as its spec makes it: each part below, the one a test may put in
// place of its own (bin, which, pin) read through the CLI itself
export function cli(spec: Spec): Cli {

  // the sentences why said (told)
  const TOLD = new Set<string>();

  // whether this illi has marked the build it runs in use and tidied
  // (settle)
  let settled = false;

  // this illi's download by itself (update): its build, how far it got
  // (bytes of `of`), its end; the version it was tried for this run; the
  // lock this illi holds for it (claim; null: none)
  let updating: { b: Build; bytes: number; of: number; done: Promise<boolean> } | null = null;
  let note = (_: string): void => {};
  let tried = "";
  let held: string | null = null;

  // the user's own CLI looked for this run (look): what it found (null:
  // none, or too old to run), and the look itself
  let found: Theirs | null | undefined;
  let looking: Promise<Theirs | null> | null = null;

  const named = process.env[spec.named]?.trim() ?? "";

  const c: Cli = {

    spec,

    // the command line the spec's variable names (a test's own, too),
    // else none
    bin: named !== "" ? named.split(/\s+/) : null,

    // the program that is the user's own CLI, where PATH finds it first,
    // looked for without holding illi up: each folder at once (a PATH of
    // many slow folders, WSL's Windows ones, takes a second looked through
    // one by one, as Bun.which does), an absolute one alone (a relative
    // one, . or node_modules/.bin, is the project's: its own program would
    // run); null: none (a test's own)
    which: async () => {
      const dirs = (process.env.PATH ?? "").split(path.delimiter).filter((d) => path.isAbsolute(d));
      const runs = (at: string) => fs.promises.access(at, fs.constants.X_OK).then(() => fs.promises.stat(at)).then((st) => (st.isFile() ? at : null), () => null);
      return (await Promise.all(dirs.map((d) => runs(path.join(d, spec.program))))).find((at) => at !== null) ?? null;
    },

    // this illi's build for this machine (the spec's pinned; a test's
    // own); null: none for this machine
    pin: spec.pinned[cli_machine()] ?? null,

    machine: cli_machine,

    // where downloaded builds are kept
    home() {
      return path.join(config.ROOT, ...spec.folder);
    },

    // whether a version is one illi runs: the minimum or later
    least(version) {
      return VERSION.test(version) && cli_newer(version, spec.minimum) <= 0;
    },

    // the user's own CLI, the minimum or later, as this run's look found
    // it, else as the spec's file kept it, while it's the same program
    // (PATH isn't looked through: that's look's, in the background); null:
    // none, too old, or not known yet
    installed() {
      if (found !== undefined) {
        return found;
      }
      const kept = c.remembered();
      return kept !== null && c.least(kept.version) ? kept : null;
    },

    // the user's own CLI looked for, once a run: the program on PATH, its
    // version as the spec's file kept it for this program, else asked of
    // it (its own update not started by it) and kept; the minimum or
    // later, it's run in place of illi's build. null: none, too old, or
    // it told no version
    look() {
      looking ??= (async () => {
        const at = await c.which();
        let version = at === null ? null : c.recalled(at);
        if (at !== null && version === null) {
          version = await c.asked(at);
          if (version !== null) {
            c.recall(at, version);
          }
        }
        found = at !== null && version !== null && c.least(version) ? { at, version } : null;
        return found;
      })();
      return looking;
    },

    // the look let go, the next asking again (a test's fresh look)
    unlook() {
      [found, looking] = [undefined, null];
    },

    // the program the spec's file keeps, and its version, while it's the
    // same file (its size and time as then); null: none kept, or it
    // changed
    remembered() {
      try {
        const kept = JSON.parse(fs.readFileSync(path.join(c.home(), "..", spec.file), "utf8"));
        const now  = fs.statSync(String(kept?.at ?? ""));
        return kept.size === now.size && kept.time === now.mtimeMs && typeof kept.version === "string" && VERSION.test(kept.version) ? { at: kept.at, version: kept.version } : null;
      } catch {
        return null;
      }
    },

    // the version the spec's file keeps for a program, while it's the same
    // file; null: none kept for it, or it changed
    recalled(at) {
      const kept = c.remembered();
      return kept?.at === at ? kept.version : null;
    },

    // a program's version kept in the spec's file, by its path, size and
    // time (one that can't be kept: asked again next run, never failing)
    recall(at, version) {
      try {
        const now = fs.statSync(at);
        fs.mkdirSync(path.join(c.home(), ".."), { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(c.home(), "..", spec.file), JSON.stringify({ at, size: now.size, time: now.mtimeMs, version }) + "\n");
      } catch {}
    },

    // a program's version as it tells it (the spec's asks), its first
    // line's end alone (numbers between dots); null: none told in ASKING
    // (its output never waited on past it, though a child of its own
    // holds it open)
    async asked(at) {
      try {
        const run  = Bun.spawn([at, ...spec.asks], { stdin: "ignore", stdout: "pipe", stderr: "ignore", env: { ...process.env, ...spec.quiet() }, timeout: ASKING });
        const late = Bun.sleep(ASKING + 1e3).then(() => null);
        const text = await Promise.race([new Response(run.stdout).text(), late]);
        const code = await Promise.race([run.exited, late]);
        const said = TOLD_VERSION.exec(text?.trim().split("\n")[0]?.trim() ?? "")?.[1] ?? "";
        return code === 0 && VERSION.test(said) ? said : null;
      } catch {
        return null;
      }
    },

    // the command that starts the CLI: the variable's, else the user's
    // own CLI (the minimum or later), else this illi's build if it is
    // downloaded (marked in use: settle); null: none to run (why tells
    // why)
    command() {
      if (c.bin !== null) {
        c.settle(null);
        return c.bin;
      }
      const theirs = c.installed();
      if (theirs !== null) {
        c.settle(null);
        return [theirs.at, ...spec.args];
      }
      const b = c.pin;
      if (b === null || !c.has(b)) {
        return null;
      }
      c.settle(b.version);
      return [path.join(c.home(), b.version, b.cmd), ...b.args];
    },

    // whether there's a CLI to run (the variable's, the user's own as
    // known, or this illi's build downloaded), as command finds it,
    // marking nothing
    ready() {
      return c.bin !== null || c.installed() !== null || (c.pin !== null && c.has(c.pin));
    },

    // whether a build is downloaded: its folder's agent.json names its
    // sha256, its program is there
    has(b) {
      const kept = c.kept(b.version);
      return kept !== null && kept.sha256 === b.sha256 && kept.cmd === b.cmd;
    },

    // a downloaded version's agent.json, its program there; null: none
    kept(version) {
      try {
        const k   = JSON.parse(fs.readFileSync(path.join(c.home(), version, "agent.json"), "utf8"));
        const cmd = String(k?.cmd ?? "");
        return cli_plain(cmd) && fs.existsSync(path.join(c.home(), version, cmd)) ? { cmd, args: Array.isArray(k.args) ? k.args.map(String) : [], sha256: String(k.sha256 ?? "") } : null;
      } catch {
        return null;
      }
    },

    // the versions downloaded, newest first
    versions() {
      try {
        return fs.readdirSync(c.home()).filter((n) => VERSION.test(n) && c.kept(n) !== null).sort(cli_newer);
      } catch {
        return [];
      }
    },

    // the newest version downloaded that isn't this illi's, the minimum
    // or later (an older one is no CLI illi runs, never offered as one);
    // null: none
    other() {
      return c.versions().find((v) => v !== c.pin?.version && c.least(v)) ?? null;
    },

    // a command to log an account out with: the CLI's, else any version
    // downloaded the minimum or later (marked in use), as a logout asks no
    // model; null: none
    any() {
      const cmd = c.command();
      if (cmd !== null) {
        return cmd;
      }
      for (const v of c.versions().filter(c.least)) {
        const k = c.kept(v);
        if (k !== null) {
          c.use(v);
          return [path.join(c.home(), v, k.cmd), ...k.args];
        }
      }
      return null;
    },

    // the version's folder a command runs illi's own download from (null:
    // another program: the user's own, the variable's)
    ours(cmd) {
      const dir = path.dirname(cmd[0] ?? "");
      return path.dirname(dir) === c.home() && VERSION.test(path.basename(dir)) ? dir : null;
    },

    // why there's no CLI to run (command null), as a call or /login says
    // it: no build for this machine, this illi's downloading, another
    // version here (an older one: /login updates it; a newer illi's:
    // /login downloads this one), or none (/login downloads it; the user's
    // own CLI too old said)
    why() {
      const b    = c.pin;
      const was  = c.other();
      const now  = c.progress();
      const old  = c.stale();
      const text = b === null ? spec.name + " has no build for this machine (" + cli_machine() + ") that illi runs: install " + spec.program + " " + spec.minimum + " or later, or let " + spec.named + " name one of your own"
        : now !== null ? spec.name + " " + b.version + " is downloading" + (now.share === null ? " in another illi" : " (" + now.share + "%)") + ": try again once it's done"
        : was !== null ? spec.name + " " + was + " is here, and this illi runs " + b.version + ": /login " + (cli_newer(was, b.version) > 0 ? "updates" : "downloads") + " it"
        : spec.name + " isn't here: /login downloads it" + (old === null ? "" : " (your own " + spec.program + " is " + old + ", older than the " + spec.minimum + " illi runs: `" + spec.update + "` brings it current)");
      TOLD.add(text);
      return text;
    },

    // why a CLI that says it's this version isn't run (older than the
    // minimum: the variable's may be), said as why's are (told)
    older(version) {
      const text = spec.name + " " + version + " is older than the " + spec.minimum + " illi runs: `" + spec.update + "` brings it current";
      TOLD.add(text);
      return text;
    },

    // the version of the user's own CLI that is too old to run, as the
    // spec's file kept it (null: none, or one the minimum or later)
    stale() {
      const v = c.remembered()?.version ?? null;
      return v !== null && !c.least(v) ? v : null;
    },

    // whether a call's failure is one why said
    told(text) {
      return TOLD.has(text);
    },

    newer: cli_newer,

    // whether illi takes a build: a version the minimum or later, an
    // archive of that version's release on GitHub (a .tar.gz), a sha256,
    // its sizes, a command in it by its own name (no folder)
    takes(b) {
      const at = spec.releases + spec.tag + b.version + "/";
      return c.least(b.version) && b.archive.startsWith(at) && !b.archive.slice(at.length).includes("/") && b.archive.endsWith(".tar.gz") && /^[0-9a-f]{64}$/.test(b.sha256) && b.bytes > 0 && b.unpacked > 0 && cli_plain(b.cmd) && b.args.every((a) => typeof a === "string");
    },

    plain: cli_plain,

    // the build this illi runs (a version: its own; null: another
    // program) marked in use, then what's left beside it tidied (tidy),
    // once a run
    settle(version) {
      if (!settled) {
        settled = true;
        if (version !== null) {
          c.use(version);
        }
        c.tidy();
      }
    },

    // a version marked in use by this illi while it lives (a mark that
    // can't be made: none, never failing)
    use(version) {
      try {
        const dir = path.join(c.home(), version, USERS);
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(dir, String(process.pid)), "");
      } catch {}
    },

    // whether a live illi uses a version (its mark's process lives; a mark
    // of one ended goes). A process that took an ended illi's number keeps
    // its version a while more, never one that goes in use
    used(version) {
      const dir = path.join(c.home(), version, USERS);
      let pids: string[];
      try {
        pids = fs.readdirSync(dir);
      } catch {
        return false;
      }
      let live = false;
      for (const pid of pids) {
        if (cli_lives(Number(pid))) {
          live = true;
        } else {
          fs.rmSync(path.join(dir, pid), { force: true });
        }
      }
      return live;
    },

    lives: cli_lives,

    // what's left beside the build this illi runs: each version no live
    // illi uses but this illi's own build (none kept while the user's own
    // CLI runs in its place, as it lasts; kept while the variable's does,
    // as that's mostly for a while), and each download's folder a day old
    // (a younger one may be another terminal's download). One that won't
    // go is left, never failing
    tidy() {
      const keep = c.installed() !== null ? null : c.pin?.version ?? null;
      let names: string[];
      try {
        names = fs.readdirSync(c.home());
      } catch {
        return;
      }
      for (const n of names) {
        const at = path.join(c.home(), n);
        try {
          if (n.startsWith(".new-")) {
            if (Date.now() - fs.statSync(at).mtimeMs > LEFT) {
              fs.rmSync(at, { recursive: true, force: true });
            }
          } else if (VERSION.test(n) && n !== keep && !c.used(n)) {
            fs.rmSync(at, { recursive: true, force: true });
          }
        } catch {}
      }
    },

    // what of the CLI illi keeps as a program, not an account's: the
    // downloads' folder, and the file the user's own program's version is
    // kept in (`illi uninstall`)
    programs() {
      return [c.home(), path.join(c.home(), "..", spec.file)];
    },

    // a build downloaded and put in place (its archive checked as it
    // comes, `got` told the bytes so far and of how many; the same build
    // put there meanwhile by another illi kept as it is, as it may be
    // running), marked in use by this illi (before it's in place, so
    // another illi's tidy never finds it unmarked), what's left beside it
    // tidied (tidy); thrown, why not (a stop: the signal's), nothing left
    // behind
    async download(b, signal, got) {
      fs.mkdirSync(c.home(), { recursive: true, mode: 0o700 });
      const tmp = fs.mkdtempSync(path.join(c.home(), ".new-"));
      try {
        const tgz = path.join(tmp, "cli.tar.gz");
        await c.get(b, tgz, signal, got);
        const into = path.join(tmp, "cli");
        fs.mkdirSync(into);
        await c.untar(fs.createReadStream(tgz, { signal }), into);
        fs.rmSync(tgz, { force: true });
        if (!fs.existsSync(path.join(into, b.cmd))) {
          throw new Error(spec.maker + " archive has no " + b.cmd);
        }
        fs.writeFileSync(path.join(into, "agent.json"), JSON.stringify({ cmd: b.cmd, args: b.args, sha256: b.sha256 }, null, 2) + "\n");
        fs.mkdirSync(path.join(into, USERS), { mode: 0o700 });
        fs.writeFileSync(path.join(into, USERS, String(process.pid)), "");
        if (!c.has(b)) {
          const at = path.join(c.home(), b.version);
          fs.rmSync(at, { recursive: true, force: true });
          fs.renameSync(into, at);
        }
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
      c.use(b.version);
      c.tidy();
    },

    // this illi's build downloaded by itself where autoupdate is on (mode)
    // and an account is connected (account), no CLI being here (the
    // user's own looked for first): the download under way (update);
    // null: none
    auto(mode, account) {
      return mode === "on" && account && !c.ready() ? c.look().then((theirs) => (theirs === null && !c.ready() ? c.update() : false)) : null;
    },

    // this illi's build downloaded by itself, in the background: once a
    // run for a version (one asked again shares the first), one illi at a
    // time on the machine (claim: another's lock, alive, is left to it;
    // a dead one's download is taken in its place). The lock is written
    // anew each BEAT while it goes, and the download given up once no
    // byte comes for STALL, so a lock is fresh only while its illi gets
    // on. true: downloaded now; false: not (none to take, here already,
    // another illi's under way, or it failed: logged, /login offers it as
    // before). Its end is told (notes): downloaded (an older version
    // here: updated, from which), or why not
    // what a download by itself tells as it ends (update), a line, told
    // f from now on (one listener: the chat's, which shows it as a note)
    notes(f) {
      note = f;
    },

    update() {
      if (updating !== null) {
        return updating.done;
      }
      const b = c.pin;
      if (b === null || tried === b.version || c.ready()) {
        return Promise.resolve(false);
      }
      tried = b.version;
      const lock = c.claim();
      if (lock === null) {
        return Promise.resolve(false);
      }
      if (c.ready()) {
        c.unlock();
        return Promise.resolve(false);
      }
      const now   = { b, bytes: 0, of: b.bytes, done: Promise.resolve(false) };
      const stall = new AbortController();
      let [seen, last] = [0, Date.now()];
      const beat = setInterval(() => {
        const at = Date.now();
        if (now.bytes !== seen) {
          [seen, last] = [now.bytes, at];
        }
        if (now.bytes < now.of && at - last > STALL) {
          stall.abort();
          return;
        }
        try {
          fs.utimesSync(lock, at / 1e3, at / 1e3);
        } catch {}
      }, BEAT);
      beat.unref();
      const was = c.other();
      now.done = c.download(b, stall.signal, (bytes, of) => {
        [now.bytes, now.of] = [bytes, of || b.bytes];
      }).then(() => {
        const up = was !== null && c.newer(was, b.version) > 0;
        note(spec.name + (up ? " is updated to " + b.version + " (from " + was + ")" : " " + b.version + " is downloaded") + ": " + spec.plan + " runs on it now.");
        return true;
      }, (err: any) => {
        const why = stall.signal.aborted ? "GitHub sent nothing for " + STALL / 1e3 + " seconds" : String(err?.message ?? err);
        console.error(spec.vendor + ": " + spec.name + " " + b.version + " wasn't downloaded: " + why);
        note(spec.name + " " + b.version + " didn't download (" + why.replace(/\.$/, "") + "): /login offers it again.");
        return false;
      }).finally(() => {
        clearInterval(beat);
        updating = null;
        c.unlock();
      });
      updating = now;
      return now.done;
    },

    // the download of this illi's build under way by itself: in this
    // illi, its share done (%); in another (its lock alive), share null;
    // none: null
    progress() {
      if (updating !== null) {
        return { share: Math.min(100, Math.floor((updating.bytes / (updating.of || 1)) * 100)) };
      }
      const lock = c.lock();
      return lock !== null && lock.pid !== process.pid && !c.dead(lock) && !c.ready() ? { share: null } : null;
    },

    // the lock that counts: the highest numbered in the CLI's folder
    // (null: none)
    lock() {
      try {
        const ns = fs.readdirSync(c.home()).filter((f) => f.startsWith(LOCK) && /^\d+$/.test(f.slice(LOCK.length))).map((f) => Number(f.slice(LOCK.length)));
        if (ns.length === 0) {
          return null;
        }
        const n  = Math.max(...ns);
        const at = path.join(c.home(), LOCK + n);
        return { at, n, pid: Number(fs.readFileSync(at, "utf8") || NaN), idle: Math.abs(Date.now() - fs.statSync(at).mtimeMs) };
      } catch {
        return null;
      }
    },

    // whether a lock's illi downloads no more: the lock wasn't written
    // for STALE (a time ahead of now counts as one behind: a clock set
    // back), whatever process has its pid, or its illi ended (one just
    // made, its pid not written yet, lives)
    dead(lock) {
      return lock.idle > STALE || (!Number.isNaN(lock.pid) && !cli_lives(lock.pid));
    },

    // the download claimed by this illi: a lock made new, numbered past
    // the one that counts, once that one is dead or none is. A file is
    // made by one illi alone (never written over, never moved), so of
    // those claiming at once one gets it; one that made a lock under
    // another's (made and let go meanwhile) lets its own go. The dead
    // ones before it go. Its file; null: another illi's lives, or none
    // can be made
    claim() {
      const was = c.lock();
      if (was !== null && !c.dead(was)) {
        return null;
      }
      const at = path.join(c.home(), LOCK + ((was?.n ?? 0) + 1));
      try {
        fs.mkdirSync(c.home(), { recursive: true, mode: 0o700 });
        fs.writeFileSync(at, String(process.pid), { flag: "wx" });
      } catch {
        return null;
      }
      held = at;
      if (c.lock()?.at !== at) {
        c.unlock();
        return null;
      }
      try {
        for (const f of fs.readdirSync(c.home()).filter((f) => f.startsWith(LOCK) && Number(f.slice(LOCK.length)) <= (was?.n ?? 0))) {
          fs.rmSync(path.join(c.home(), f), { force: true });
        }
      } catch {}
      return at;
    },

    // this illi's lock gone, if it holds one still (its download by
    // itself done, or illi ends: the providers' close), so another illi
    // may claim the download at once
    unlock() {
      const at = held;
      held = null;
      try {
        if (at !== null && fs.readFileSync(at, "utf8") === String(process.pid)) {
          fs.rmSync(at, { force: true });
        }
      } catch {}
    },

    // the archive to a file, its sha256 reckoned as it comes and checked;
    // thrown: the host's refusal, a write that failed (a full disk), a
    // stop
    async get(b, file, signal, got) {
      let res: Response;
      try {
        res = await globalThis.fetch(b.archive, { headers: { "user-agent": "illi", "accept-encoding": "identity" }, signal });
      } catch (err) {
        throw signal.aborted ? err : new Error("GitHub can't be reached: check your connection");
      }
      if (!res.ok || res.body === null) {
        throw new Error("GitHub answered " + res.status + " for " + spec.name);
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
        throw new Error(spec.maker + " archive didn't match the checksum this illi takes it by, so illi didn't keep it");
      }
    },

    // a gzipped tar archive's files, unpacked into a folder (null: only
    // listed): each a plain file by its own name, runnable (one in a
    // folder, named to climb out, or no plain file: a link, a folder,
    // refused); a pax header's path taken as the next file's name (a long
    // one), its other fields passed over, as are a global header's.
    // Thrown: an archive illi can't read
    async untar(from, into) {
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
            named = c.paxed(Buffer.concat(pax.data)).path ?? null;
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
          const h = c.header(block);
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
            throw new Error(spec.maker + " archive holds " + h.name + ", which isn't a plain file, so illi doesn't unpack it");
          }
          if (!cli_plain(h.name)) {
            throw new Error(spec.maker + " archive holds a file in a folder (" + h.name + "), which illi doesn't unpack");
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
          next(file !== null || !done ? new Error(spec.maker + " archive ended short") : null);
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
    },

    // a pax header's fields (its records: "<length> <key>=<value>\n")
    paxed(data) {
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
    },

    // a tar header block read: its file's name (a POSIX ustar prefix
    // before it: GNU's header keeps other fields there), size and type;
    // thrown: its checksum doesn't match, or its size won't read
    header(block) {
      const text = (from: number, len: number) => block.toString("utf8", from, from + len).replace(/\0[\s\S]*$/, "");
      const sum  = block.reduce((n, x, k) => n + (k >= 148 && k < 156 ? 32 : x), 0);
      if (parseInt(text(148, 8).trim(), 8) !== sum) {
        throw new Error(spec.maker + " archive won't read (a file's header doesn't add up)");
      }
      const prefix = block.toString("latin1", 257, 263) === "ustar\0" ? text(345, 155) : "";
      const size   = parseInt(text(124, 12).trim() || "0", 8);
      if (!Number.isSafeInteger(size) || size < 0) {
        throw new Error(spec.maker + " archive won't read (a file's size)");
      }
      return { name: (prefix === "" ? "" : prefix + "/") + text(0, 100), size, type: String.fromCharCode(block[156]) };
    },

  };
  return c;
}
