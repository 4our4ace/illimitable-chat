// Update
// ======
// illi keeping itself new: the compiled file only (install.sh's, one
// per system: bun build --compile); a source run never replaces itself
// (`illi upgrade` pulls a git clone). The latest release is the one
// GitHub's page for it redirects to (RELEASES/latest, to .../tag/vX.Y.Z:
// no API asked, so no rate limit), compared with VERSION as semver. One
// newer is installed (install): the release's SHA256SUMS read, its file
// for this system streamed into a folder of its own beside the running
// file (its name unique: two illis at once never meet), checked against
// the sum, made runnable and run once (`--version` must name it), then
// renamed over the running file in one step. The illi running goes on,
// its code in memory; the next start runs the new one. Anything short of
// that changes nothing: the folder is removed (as illi quits or runs
// again in place, too: Update.drop; one left by an illi killed mid-way
// is cleared at the next install, once unwritten for STALE), the file as
// it was.
// As the chat starts on a terminal and each AGAIN while it runs (check,
// Term.ts), in the background, looking at most once a day (STATE in the
// root keeps when it last did: one file, every profile's; a look that
// fails is tried again at the next), by `autoupdate`: "on" installs,
// "notify" only tells, "off" never looks. An illi whose file was replaced
// since it started (by it, another, a new install) looks no more: the
// next start runs the new one and looks from there. What it did is one
// note; a failure (offline, a timeout, a download that stalls, a file
// missing or not matching its sum) is logged (illi.log), never told, but
// for a folder it can't write: that is told once a release (before any
// download), so the person knows to upgrade with rights. `illi upgrade`
// runs the same in the foreground (upgrade), saying each step. It reads no setting
// itself (Config.ts stops on one that won't do, and an upgrade must work
// whatever they say): its caller gives the root and the mode.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { json_object } from "../tools/Clip.ts";

// Types
// =====

// what `autoupdate` asks: install a new release, only tell of it, never
// look
export type Mode = "on" | "notify" | "off";

// an illi as an update sees it: where its releases are, its version, its
// file (the one replaced), that file as it started from (Update.stamp)
export type Place = { base: string; version: string; exec: string; stamp: string };

// Constants
// =========

// this illi's version; whether it is one file (bun build --compile: its
// modules under /$bunfs), not run by bun from its source
export const VERSION  = pkg.version;
const COMPILED = /\$bunfs|~BUN/.test(import.meta.path);

// illi's releases on GitHub
const RELEASES = "https://github.com/4our4ace/illimitable-chat/releases";

// how long a look for the latest, the sums and the file's run may take
// (ms), and the file's download without a byte coming (a slow one goes
// on, a stalled one gives up); the least time between looks; how long a
// folder left beside the file must go unwritten to be taken as an
// illi's that died mid-way (one downloading writes at least each IDLE)
const LOOK  = 10e3;
const SUMS  = 30e3;
const RUN   = 30e3;
const IDLE  = 60e3;
const DAY   = 24 * 3600e3;
const STALE = 3600e3;

// how often a running illi asks for a look (check: one a day at most), so
// a chat kept open for weeks gets a new release ready for its next start
export const AGAIN = 3600e3;

// the signals that end `illi upgrade`, turned into an exit, so its
// download's folder goes as it does
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

// the root's file that keeps when illi last looked, and the release it
// last told it couldn't install (a folder it can't write)
export const STATE = "update.json";

// the start of a download's folder's name (mkdtemp's), beside the file
const AWAY = ".illi-update-";

// the error codes of a folder illi can't write
const DENIED = ["EACCES", "EPERM", "EROFS"];

// this illi, its file's links resolved; null: a source run, never
// replaced
export const HERE: Place | null = COMPILED ? update_place(update_real(process.execPath)) : null;

// the download folders in use, removed as illi quits (an exit) or runs
// again in place (Update.drop: an execve fires no exit); once dropped,
// none starts (a look or a download landing as illi leaves)
const LIVE = new Set<string>();
let dropped = false;

// Update
// ======

export namespace Update {

  // as illi starts on a terminal, and each AGAIN while it runs: a release
  // newer than this illi's looked for (none to look for: "off", a source
  // run, or a file replaced, or gone, since this illi started), at most
  // once a day (a look that fails, again next time), and installed ("on")
  // or only told of ("notify"). The note to show ("": none). It never
  // throws: a failure is logged, but for a folder it can't write, told
  // once a release
  export async function check(root: string, mode: Mode, place = HERE, now = Date.now()): Promise<string> {
    if (dropped || mode === "off" || place === null || Update.stamp(place.exec) !== place.stamp) {
      return "";
    }
    const file = path.join(root, STATE);
    try {
      const was = json_object(file) ?? {};
      // a look stamped past a day from now, ahead too (the clock set
      // back), or not at all, looks again
      if (Math.abs(now - Date.parse(String(was.checked))) < DAY) {
        return "";
      }
      const version = await Update.latest(place.base);
      // the look kept once it succeeds, before any install: an AGAIN
      // later, the download still running, looks no more (so never two
      // at once from one illi); one that failed is kept not at all
      update_keep(file, { ...(json_object(file) ?? {}), checked: new Date(now).toISOString() });
      if (!Update.newer(version, place.version)) {
        return "";
      }
      if (mode === "notify") {
        return "illi " + version + " is out: illi upgrade installs it.";
      }
      try {
        await Update.install(place, version);
      } catch (err) {
        if (!Update.denied(err) || was.told === version) {
          throw err;
        }
        update_keep(file, { ...(json_object(file) ?? {}), told: version });
        console.error("update: can't write " + path.dirname(place.exec) + ": " + (err as Error).message);
        return "illi " + version + " is out, but illi can't write " + update_home(path.dirname(place.exec)) + " to install it: run sudo illi upgrade.";
      }
      console.log("update: installed illi " + version + " in " + place.exec);
      return "illi " + version + " is installed: it runs from the next start.";
    } catch (err: any) {
      console.error("update: " + (err?.message ?? err));
      return "";
    }
  }

  // `illi upgrade` of the compiled file: the latest release installed now
  // (install), each step said (out); a failure said (err), nothing
  // changed, Ctrl+C too (an exit: the download's folder goes). The exit
  // code
  export async function upgrade(place: Place, out = console.log, err = console.error): Promise<number> {
    const quit = () => process.exit(130);
    SIGNALS.forEach((sig) => process.on(sig, quit));
    try {
      const version = await Update.latest(place.base);
      if (!Update.newer(version, place.version)) {
        out("illi " + place.version + " is the latest.");
        return 0;
      }
      await Update.install(place, version, out);
      out("Installed illi " + version + " in " + place.exec);
      return 0;
    } catch (e: any) {
      const why = Update.denied(e) ? "can't write " + path.dirname(place.exec) + ": run sudo illi upgrade, or install illi again in a folder of yours" : e?.message + ": nothing changed";
      err("illi: " + why + ".");
      return 1;
    } finally {
      SIGNALS.forEach((sig) => process.off(sig, quit));
    }
  }

  // the latest release's version: where GitHub's page for it redirects
  // (.../tag/vX.Y.Z), no API asked; one it doesn't name throws
  export async function latest(base: string): Promise<string> {
    const res = await update_get(base + "/latest", AbortSignal.timeout(LOOK), "manual");
    const to  = res.headers.get("location") ?? "";
    void res.body?.cancel();
    const tag = /\/tag\/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(to);
    if (tag === null) {
      throw new Error(new URL(base).host + " names no latest release (" + (to || "HTTP " + res.status) + ")");
    }
    return tag[1];
  }

  // whether version a is newer than b, as semver: X.Y.Z by number, then
  // one with no -prerelease over one with; one not of that shape never is
  export function newer(a: string, b: string): boolean {
    const [x, y] = [a, b].map((v) => /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(v));
    if (x === null || y === null) {
      return false;
    }
    for (const k of [1, 2, 3]) {
      if (Number(x[k]) !== Number(y[k])) {
        return Number(x[k]) > Number(y[k]);
      }
    }
    return y[4] !== undefined && (x[4] === undefined || x[4].localeCompare(y[4], "en", { numeric: true }) > 0);
  }

  // a release installed over place's file: its file for this system
  // (Update.asset) downloaded into a folder of its own beside it, checked
  // against the release's SHA256SUMS, run once (it must say its version),
  // then renamed over the file in one step; each step said (say). It
  // throws why it didn't, nothing changed (a folder it can't write
  // throws first, before any download: Update.denied)
  export async function install(place: Place, version: string, say: (text: string) => void = () => {}): Promise<void> {
    const asset = Update.asset();
    const dir   = path.dirname(place.exec);
    const from  = place.base + "/download/v" + version + "/";
    if (dropped) {
      throw new Error("illi is leaving");
    }
    update_clear(dir);
    const away  = fs.mkdtempSync(path.join(dir, AWAY));
    const file  = path.join(away, "illi");
    const gone  = () => {
      LIVE.delete(away);
      fs.rmSync(away, { recursive: true, force: true });
    };
    LIVE.add(away);
    process.on("exit", gone);
    try {
      const sums = await (await update_get(from + "SHA256SUMS", AbortSignal.timeout(SUMS))).text();
      const want = Update.sum(sums, asset, version);
      say("Downloading illi " + version + " (" + asset + ")");
      if ((await update_download(from + asset, file)) !== want) {
        throw new Error(asset + " doesn't match the release's SHA256SUMS");
      }
      fs.chmodSync(file, 0o755);
      const said = await update_run(file);
      if (said !== "illi " + version) {
        throw new Error("the new illi won't run here (" + (said || "it printed nothing") + ")");
      }
      say("Checked: it matches the release's SHA256SUMS and runs");
      fs.renameSync(file, place.exec);
    } finally {
      process.off("exit", gone);
      gone();
    }
  }

  // the download folders in use removed, as illi runs again in place
  // (ProfileCommands.ts: an execve, which fires no exit), and no look or
  // download started after; one that won't go is left for a later
  // install to clear. A download still writing
  // goes on into its unlinked file till the execve, and puts nothing in
  // place: its next step (the chmod, the rename) finds no file and
  // throws, which check logs
  export function drop(): void {
    dropped = true;
    for (const away of [...LIVE]) {
      LIVE.delete(away);
      try {
        fs.rmSync(away, { recursive: true, force: true });
      } catch {}
    }
  }

  // a file as it is now: its inode and its last write ("": it won't
  // read); a rename over it, or a write, makes another
  export function stamp(file: string): string {
    return update_stamp(file);
  }

  // this system's file in a release (as the release workflow names it)
  export function asset(): string {
    return "illi-" + process.platform + "-" + process.arch;
  }

  // a file's SHA-256 in a release's SHA256SUMS (sha256sum's lines: the
  // hash, then the name, * before it for a binary read); none listed
  // throws: the release has no build for this system
  export function sum(sums: string, asset: string, version: string): string {
    for (const line of sums.split("\n")) {
      const [hash, name] = line.trim().split(/\s+/);
      if (name === asset || name === "*" + asset) {
        return hash.toLowerCase();
      }
    }
    throw new Error("illi " + version + " has no build for " + asset.replace(/^illi-/, "") + " (install.sh builds one from the source)");
  }

  // whether an error is a folder illi can't write (no permission, a
  // read-only disk)
  export function denied(err: unknown): boolean {
    return DENIED.includes((err as { code?: string } | null)?.code ?? "");
  }
}

// a URL fetched till `stop` (a timeout, or a stall); one that isn't
// reached, is stopped first, or answers an error (4xx, 5xx) throws,
// saying so as the person reads it
async function update_get(url: string, stop: AbortSignal, redirect: RequestRedirect = "follow"): Promise<Response> {
  const host = new URL(url).host;
  const name = url.slice(url.lastIndexOf("/") + 1);
  let res: Response;
  try {
    res = await fetch(url, { redirect, signal: stop });
  } catch {
    throw new Error(stop.aborted ? host + " took too long to answer" : "can't reach " + host + " (offline?)");
  }
  if (res.status >= 400) {
    void res.body?.cancel();
    throw new Error(host + " won't give " + name + " now (HTTP " + res.status + ")");
  }
  return res;
}

// a file downloaded into `file`, a new one, as it streams (never whole in
// memory), given up once no byte comes for IDLE; its SHA-256, in hex
async function update_download(url: string, file: string): Promise<string> {
  const stall = new AbortController();
  const wait  = setTimeout(() => stall.abort(), IDLE);
  const hash  = new Bun.CryptoHasher("sha256");
  const fd    = fs.openSync(file, "wx", 0o600);
  wait.unref();
  try {
    const reader = (await update_get(url, stall.signal)).body!.getReader();
    for (let got = await reader.read(); !got.done; got = await reader.read()) {
      wait.refresh();
      hash.update(got.value);
      for (let at = 0; at < got.value.length; ) {
        at += fs.writeSync(fd, got.value, at);
      }
    }
  } catch (err) {
    throw stall.signal.aborted ? new Error(new URL(url).host + " stopped sending " + path.basename(url)) : err;
  } finally {
    clearTimeout(wait);
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

// what a file run with --version prints, trimmed, the API keys kept from
// it; "": it failed, or took past RUN
async function update_run(file: string): Promise<string> {
  const { ANTHROPIC_API_KEY, OPENAI_API_KEY, ...env } = process.env;
  try {
    const proc = Bun.spawn([file, "--version"], { env, stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout: RUN });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return code === 0 ? out.trim() : "";
  } catch {
    return "";
  }
}

// the folders beside the file that an illi left mid-way (killed during a
// download: one quit removes its own) cleared, once neither one nor its
// file was written for STALE, so none still in use
function update_clear(dir: string): void {
  for (const away of update_list(dir).filter((n) => n.startsWith(AWAY)).map((n) => path.join(dir, n))) {
    try {
      const last = Math.max(...[away, ...update_list(away).map((n) => path.join(away, n))].map((f) => fs.statSync(f).mtimeMs));
      if (Date.now() - last > STALE) {
        fs.rmSync(away, { recursive: true, force: true });
      }
    } catch {}
  }
}

// a folder's names (none: it won't read)
function update_list(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

// the state kept: written whole beside its file, then moved over it (no
// reader sees half of it)
function update_keep(file: string, state: object): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + "." + process.pid;
  fs.writeFileSync(temp, JSON.stringify(state) + "\n");
  fs.renameSync(temp, file);
}

// a path as a note shows it: ~ for the home folder (as Config.ts
// config_home, which this file can't import)
function update_home(file: string): string {
  return file.startsWith(os.homedir() + "/") ? "~" + file.slice(os.homedir().length) : file;
}

// the compiled illi at `exec` as an update sees it, its file as it starts
// (HERE's, made before the namespace is: update_stamp, not Update.stamp)
function update_place(exec: string): Place {
  return { base: RELEASES, version: VERSION, exec, stamp: update_stamp(exec) };
}

// Update.stamp
function update_stamp(file: string): string {
  try {
    const st = fs.statSync(file);
    return st.ino + ":" + st.mtimeMs;
  } catch {
    return "";
  }
}

// a file's real path, its links resolved (as it is, should that fail)
function update_real(file: string): string {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
}
