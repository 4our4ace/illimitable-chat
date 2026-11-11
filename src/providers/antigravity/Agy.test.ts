// Agy test
// ========
// `bun test Agy.test.ts`. Google's Antigravity CLI as illi finds and
// downloads it, with no real download: the build each machine's illi is
// pinned to, each one illi takes (the CLI's releases on GitHub, its
// checksum and sizes, a command by its own name, 1.5.2 or later), one
// for every machine illi is released for; an archive (a .tar.gz, served
// here) checked against its sha256 as it comes, unpacked (each file by
// its own name, runnable; a pax header passed over), put in place in one
// rename, found as the CLI's command; one that doesn't match, holds a
// file in a folder, or a link, leaves nothing and keeps what was there.
// The user's own `agy` runs in place of illi's build once it is 1.5.2 or
// later (its version asked once, kept by its path, size and time; asked
// again once it changed); an older one is said. Only this illi's build
// runs of those downloaded: another version here is said (older: /login
// updates it; newer: downloads this one), never run, though a logout may
// use it; none for this machine is said. Every other version goes once
// no live illi uses it (its mark's process ended), this illi's own too
// while the user's own CLI runs; a write that fails (a full disk) is
// said, never a crash; an empty file unpacks; another terminal's
// download, still under way, is left be. With autoupdate on and an
// account connected, this illi's build downloads by itself, once a run,
// one illi at a time on the machine (one whose illi lives, its lock
// written within the minute, is left to it; a lock gone unwritten for
// longer is dead though a process has its pid, and one illi alone claims
// the download in its place), a call meanwhile told it's downloading,
// its end told (updated, from which); the same build put in place
// meanwhile by another illi is kept as it is.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as zlib from "node:zlib";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-agy-");
delete process.env.ILLI_ANTIGRAVITY;
process.env.ILLI_DIR = DIR;

const { Agy, MINIMUM, RELEASES } = await import("./Agy.ts");
const { PINNED } = await import("./Pinned.ts");

// none of the user's own CLI, till a test gives one (the lookup itself
// kept: which)
const which = Agy.which;
Agy.which = async () => null;

// a gzipped tar archive of these files (each a plain file, else of the
// type named: a link, a pax header; its name's folder in the ustar
// prefix, if named), as Google's is made
function tar(files: Array<{ name: string; data: string; type?: string; prefix?: string }>): Buffer {
  const blocks: Buffer[] = [];
  for (const f of files) {
    const data = Buffer.from(f.data);
    const h = Buffer.alloc(512);
    h.write(f.name, 0, 100, "utf8");
    h.write("0000755\0", 100);
    h.write("0000000\0", 108);
    h.write("0000000\0", 116);
    h.write(data.length.toString(8).padStart(11, "0") + "\0", 124);
    h.write("00000000000\0", 136);
    h.write("        ", 148);
    h.write(f.type ?? "0", 156);
    h.write("ustar\0", 257);
    h.write("00", 263);
    if (f.prefix !== undefined) {
      h.write(f.prefix, 345);
    }
    h.write(h.reduce((n, x) => n + x, 0).toString(8).padStart(6, "0") + "\0 ", 148);
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return zlib.gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}

const sha = (b: Buffer) => new Bun.CryptoHasher("sha256").update(b).digest("hex");

// archives served by name, one held back till its promise ends
const SERVED: Record<string, Buffer> = {};
const HELD: Record<string, Promise<void>> = {};
const HOST = Bun.serve({ port: 0, fetch: async (req) => {
  const name = new URL(req.url).pathname.slice(1);
  await HELD[name];
  const b = SERVED[name];
  return b === undefined ? new Response(null, { status: 404 }) : new Response(new Uint8Array(b));
} });
const URL_OF = (name: string) => "http://127.0.0.1:" + HOST.port + "/" + name;

// a build of the CLI served here, by this archive
const BUILT = (version: string, name: string, archive: Buffer) => ({ version, archive: URL_OF(name), sha256: sha(archive), bytes: archive.length, unpacked: 1, cmd: "antigravity", args: ["acp"] });

// a program of the user's own that says this version (the CLI's
// `--version`), counting how often it's asked
function theirs(version: string): string {
  const at = DIR + "/bin/agy";
  fs.mkdirSync(DIR + "/bin", { recursive: true });
  fs.writeFileSync(at, "#!/bin/sh\necho x >> " + DIR + "/bin/asked\n[ \"$1\" = --version ] && echo " + version + "\n");
  fs.chmodSync(at, 0o755);
  return at;
}
const ASKED = () => (fs.existsSync(DIR + "/bin/asked") ? fs.readFileSync(DIR + "/bin/asked", "utf8").split("\n").length - 1 : 0);

afterAll(() => {
  HOST.stop(true);
  fs.rmSync(DIR, { recursive: true, force: true });
});

test("the user's own agy is found on PATH's absolute folders alone, never a relative one's (a project's node_modules/.bin)", async () => {
  const bin = DIR + "/which";
  fs.mkdirSync(bin + "/node_modules/.bin", { recursive: true });
  fs.mkdirSync(bin + "/abs");
  for (const at of [bin + "/node_modules/.bin/agy", bin + "/abs/agy"]) {
    fs.writeFileSync(at, "#!/bin/sh\n", { mode: 0o755 });
  }
  const [path, cwd] = [process.env.PATH, process.cwd()];
  try {
    process.chdir(bin);
    process.env.PATH = ["node_modules/.bin", bin + "/abs"].join(":");
    expect(await which()).toBe(bin + "/abs/agy");
    process.env.PATH = "node_modules/.bin";
    expect(await which()).toBeNull();
  } finally {
    process.env.PATH = path;
    process.chdir(cwd);
  }
});

test("each machine's pinned build is one illi takes, one for every machine illi is released for, all one version, 1.5.2 or later", () => {
  const all = Object.values(PINNED);
  expect(all.every((b) => Agy.takes(b))).toBe(true);
  expect(new Set(all.map((b) => b.version)).size).toBe(1);
  expect(Object.keys(PINNED).sort()).toEqual(["darwin-aarch64", "darwin-x86_64", "linux-aarch64", "linux-x86_64"]);
  expect(Agy.least(all[0].version)).toBe(true);
  const good = PINNED["linux-x86_64"];
  expect([good.cmd, good.args, good.archive.startsWith(RELEASES + good.version + "/")]).toEqual(["antigravity", ["acp"], true]);
  const other = (name: string) => ({ ...good, archive: RELEASES + good.version + "/" + name });
  for (const bad of [{ ...good, archive: "http://github.com/google-antigravity/antigravity-cli/releases/download/" + good.version + "/agy_cli_linux_x64.tar.gz" }, { ...good, archive: "https://github.com.evil.test/x.tar.gz" }, { ...good, archive: RELEASES + "1.5.3/agy_cli_linux_x64.tar.gz" }, other("x/agy_cli_linux_x64.tar.gz"), other("agy_cli_linux_x64.zip"), { ...good, sha256: "" }, { ...good, cmd: "../bin/sh" }, { ...good, cmd: "bin/agy" }, { ...good, bytes: 0 }, { ...good, version: "latest" }, { ...other("agy.tar.gz"), version: "1.5.1", archive: RELEASES + "1.5.1/agy.tar.gz" }]) {
    expect(Agy.takes(bad)).toBe(false);
  }
  expect(Agy.machine()).toMatch(/^(linux|darwin|windows)-/);
  expect(["1.4.5", "1.10.0", "1.5.12"].sort(Agy.newer)).toEqual(["1.10.0", "1.5.12", "1.4.5"]);
  expect([MINIMUM, Agy.least("1.5.2"), Agy.least("1.6"), Agy.least("1.5.1"), Agy.least("1.4.5"), Agy.least("v1.6")]).toEqual(["1.5.2", true, true, false, false, false]);
});

test("a download checked as it comes, unpacked runnable, put in place, run; one that doesn't match, holds a folder or a link, leaves nothing", async () => {
  const one = tar([{ name: "pax", data: "20 path=antigravity\n", type: "x" }, { name: "antigravity-cut-short", data: "#!/bin/sh\necho one\n" }, { name: "pax", data: "13 mtime=1.5\n", type: "x" }, { name: "NOTICE", data: "notice" }]);
  SERVED["one.tgz"] = one;
  Agy.pin = BUILT("1.5.2", "one.tgz", one);
  expect([Agy.command(), Agy.ready(), Agy.why()]).toEqual([null, false, "Google's Antigravity CLI isn't here: /login downloads it"]);
  expect(Agy.told(Agy.why())).toBe(true);
  const got: number[] = [];
  await Agy.download(Agy.pin, new AbortController().signal, (bytes) => got.push(bytes));
  const at = Agy.home() + "/1.5.2";
  expect([Agy.command(), Agy.ready(), got.at(-1), fs.readFileSync(at + "/NOTICE", "utf8")]).toEqual([[at + "/antigravity", "acp"], true, one.length, "notice"]);
  expect([fs.statSync(at + "/antigravity").mode & 0o777, fs.statSync(at + "/NOTICE").mode & 0o777]).toEqual([0o755, 0o755]);
  expect(fs.existsSync(at + "/.users/" + process.pid)).toBe(true);
  const two = tar([{ name: "antigravity", data: "two" }]);
  SERVED["two.tgz"] = two;
  await expect(Agy.download({ ...BUILT("1.5.3", "two.tgz", two), sha256: sha(one) }, new AbortController().signal, () => {})).rejects.toThrow("didn't match the checksum");
  for (const [name, files, why] of [
    ["climb.tgz", [{ name: "antigravity", data: "x" }, { name: "../escape", data: "x" }], "holds a file in a folder"],
    ["folder.tgz", [{ name: "antigravity", data: "x", prefix: "bin" }], "holds a file in a folder"],
    ["link.tgz", [{ name: "antigravity", data: "", type: "2" }], "isn't a plain file"],
    ["none.tgz", [{ name: "other", data: "x" }], "has no antigravity"],
  ] as const) {
    const bad = tar([...files]);
    SERVED[name] = bad;
    await expect(Agy.download(BUILT("1.5.4", name, bad), new AbortController().signal, () => {})).rejects.toThrow(why);
  }
  const short = tar([{ name: "antigravity", data: "x".repeat(2000) }]);
  SERVED["short.tgz"] = zlib.gzipSync(zlib.gunzipSync(short).subarray(0, 1024));
  await expect(Agy.download(BUILT("1.5.4", "short.tgz", SERVED["short.tgz"]), new AbortController().signal, () => {})).rejects.toThrow("ended short");
  expect([fs.readdirSync(Agy.home()), fs.existsSync(DIR + "/escape"), Agy.versions()]).toEqual([["1.5.2"], false, ["1.5.2"]]);
});

test("the user's own agy runs once it's 1.5.2 or later, its version asked once and kept till it changes; an older one is said", async () => {
  const at = theirs("1.5.3");
  Agy.which = async () => at;
  Agy.unlook();
  expect(Agy.installed()).toBeNull();
  expect(await Agy.look()).toEqual({ at, version: "1.5.3" });
  expect([Agy.command(), Agy.ready(), ASKED()]).toEqual([[at, "acp"], true, 1]);
  Agy.unlook();
  expect([Agy.installed(), await Agy.look(), ASKED()]).toEqual([{ at, version: "1.5.3" }, { at, version: "1.5.3" }, 1]);
  theirs("1.5.1");
  fs.utimesSync(at, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
  Agy.unlook();
  expect([Agy.installed(), await Agy.look(), ASKED(), Agy.stale()]).toEqual([null, null, 2, "1.5.1"]);
  Agy.pin = { ...Agy.pin!, sha256: "f".repeat(64) };
  expect(Agy.why()).toBe("Google's Antigravity CLI isn't here: /login downloads it (your own agy is 1.5.1, older than the 1.5.2 illi runs: `agy update` brings it current)");
  fs.writeFileSync(at, "#!/bin/sh\nexit 1\n");
  Agy.unlook();
  expect([await Agy.look(), Agy.stale()]).toEqual([null, null]);
  Agy.which = async () => null;
  Agy.unlook();
  Agy.pin = BUILT("1.5.2", "one.tgz", SERVED["one.tgz"]);
});

test("only this illi's build runs of those downloaded: another version here is said, never run, though a logout may use it; none for this machine is said", () => {
  const here = Agy.pin!;
  const at = Agy.home() + "/1.5.2/antigravity";
  Agy.pin = { ...here, version: "1.5.3" };
  expect([Agy.command(), Agy.ready(), Agy.other(), Agy.any()]).toEqual([null, false, "1.5.2", [at, "acp"]]);
  expect(Agy.why()).toBe("Google's Antigravity CLI 1.5.2 is here, and this illi runs 1.5.3: /login updates it");
  Agy.pin = { ...here, version: "1.5.1" };
  expect(Agy.why()).toBe("Google's Antigravity CLI 1.5.2 is here, and this illi runs 1.5.1: /login downloads it");
  Agy.pin = { ...here, sha256: "f".repeat(64) };
  expect([Agy.command(), Agy.other(), Agy.why()]).toEqual([null, null, "Google's Antigravity CLI isn't here: /login downloads it"]);
  Agy.pin = null;
  expect(Agy.why()).toBe("Google's Antigravity CLI has no build for this machine (" + Agy.machine() + ") that illi runs: install agy 1.5.2 or later, or let ILLI_ANTIGRAVITY name one of your own");
  expect(Agy.told("Google's Antigravity CLI isn't here")).toBe(false);
  Agy.bin = ["/opt/agy/agy", "acp"];
  expect([Agy.command(), Agy.ready()]).toEqual([["/opt/agy/agy", "acp"], true]);
  Agy.pin = here;
  Agy.tidy();
  expect(Agy.versions()).toEqual(["1.5.2"]);
  Agy.bin = null;
  Agy.pin = here;
});

test("every other version goes once no live illi uses it, this illi's own too while the user's own CLI runs; one in use stays", async () => {
  const keep = (version: string, pid?: number) => {
    fs.mkdirSync(Agy.home() + "/" + version + "/.users", { recursive: true });
    fs.writeFileSync(Agy.home() + "/" + version + "/agent.json", JSON.stringify({ cmd: "antigravity", args: ["acp"], sha256: "a".repeat(64) }));
    fs.writeFileSync(Agy.home() + "/" + version + "/antigravity", "x");
    if (pid !== undefined) {
      fs.writeFileSync(Agy.home() + "/" + version + "/.users/" + pid, "");
    }
  };
  const ended = Bun.spawn(["true"]);
  await ended.exited;
  const live = Bun.spawn(["sleep", "30"]);
  keep("1.5.1", live.pid);
  keep("1.4.5", ended.pid);
  keep("1.4.2");
  keep("1.9.0");
  Agy.tidy();
  expect(Agy.versions()).toEqual(["1.5.2", "1.5.1"]);
  expect(fs.existsSync(Agy.home() + "/1.5.2/.users/" + process.pid)).toBe(true);
  live.kill();
  await live.exited;
  Agy.tidy();
  expect(Agy.versions()).toEqual(["1.5.2"]);
  const at = theirs("1.6.0");
  Agy.which = async () => at;
  Agy.unlook();
  await Agy.look();
  fs.rmSync(Agy.home() + "/1.5.2/.users", { recursive: true, force: true });
  Agy.tidy();
  expect(Agy.versions()).toEqual([]);
  fs.rmSync(at);
  Agy.which = async () => null;
  Agy.unlook();
  expect([Agy.installed(), Agy.remembered()]).toEqual([null, null]);
});

test("a tar header's ustar prefix is POSIX's alone: GNU's keeps other fields there; a pax record's fields read", () => {
  const block = (magic: string) => {
    const h = Buffer.alloc(512);
    h.write("antigravity", 0);
    h.write("00000000001\0", 124);
    h.write("0", 156);
    h.write(magic, 257, "latin1");
    h.write("\x01\x02", 345, "latin1");
    h.write("        ", 148);
    h.write(h.reduce((n, x) => n + x, 0).toString(8).padStart(6, "0") + "\0 ", 148);
    return h;
  };
  expect(Agy.header(block("ustar  \0")).name).toBe("antigravity");
  expect(Agy.header(block("ustar\x0000")).name).toBe("\x01\x02/antigravity");
  expect(Agy.paxed(Buffer.from("20 path=antigravity\n13 mtime=1.5\nbad"))).toEqual({ path: "antigravity", mtime: "1.5" });
});

test("a write that fails is said, never a crash; an empty file unpacks; another terminal's download under way is left be, a day-old one goes", async () => {
  const one = tar([{ name: "antigravity", data: "x" }]);
  SERVED["w.tgz"] = one;
  await expect(Agy.get(BUILT("1.5.8", "w.tgz", one), DIR + "/no/such/folder/cli.tar.gz", new AbortController().signal, () => {})).rejects.toThrow("ENOENT");
  const empty = tar([{ name: "antigravity", data: "run" }, { name: "EMPTY", data: "" }]);
  SERVED["e.tgz"] = empty;
  const young = Agy.home() + "/.new-other";
  const old   = Agy.home() + "/.new-stale";
  fs.mkdirSync(young, { recursive: true });
  fs.mkdirSync(old, { recursive: true });
  fs.utimesSync(old, new Date(Date.now() - 2 * 86400e3), new Date(Date.now() - 2 * 86400e3));
  Agy.pin = BUILT("1.5.9", "e.tgz", empty);
  await Agy.download(Agy.pin, new AbortController().signal, () => {});
  expect([fs.readFileSync(Agy.home() + "/1.5.9/EMPTY", "utf8"), fs.existsSync(young), fs.existsSync(old)]).toEqual(["", true, false]);
  expect(Agy.versions()).toEqual(["1.5.9"]);
});

test("with autoupdate on and an account connected, this illi's build downloads by itself, once, one illi at a time on the machine: a fresh lock is left to its illi, one unwritten for a minute is taken over though its pid lives, one whose illi ended too; a call meanwhile told it's downloading; the same build put in place by another illi meanwhile kept", async () => {
  const lock  = (n = 1) => Agy.home() + "/.updating-" + n;
  const locks = () => fs.readdirSync(Agy.home()).filter((n) => n.startsWith(".updating")).sort();
  const other = Bun.spawn(["sleep", "30"]);
  Agy.pin = BUILT("2.0.0", "lock.tgz", tar([{ name: "antigravity", data: "x" }]));
  expect([Agy.auto("notify", true), Agy.auto("off", true), Agy.auto("on", false)]).toEqual([null, null, null]);
  fs.writeFileSync(lock(), String(other.pid));
  expect([await Agy.auto("on", true), Agy.progress(), Agy.why()]).toEqual([false, { share: null }, "Google's Antigravity CLI 2.0.0 is downloading in another illi: try again once it's done"]);
  expect(Agy.told(Agy.why())).toBe(true);
  expect([Agy.claim(), locks()]).toEqual([null, [".updating-1"]]);
  fs.utimesSync(lock(), new Date(Date.now() - 120e3), new Date(Date.now() - 120e3));
  expect([Agy.lives(other.pid), Agy.progress(), Agy.why()]).toEqual([true, null, "Google's Antigravity CLI 1.5.9 is here, and this illi runs 2.0.0: /login updates it"]);
  expect([Agy.claim(), locks(), fs.readFileSync(lock(2), "utf8")]).toEqual([lock(2), [".updating-2"], String(process.pid)]);
  expect([Agy.claim(), Agy.progress()]).toEqual([null, null]);
  fs.writeFileSync(lock(7), String(other.pid));
  expect([Agy.progress(), fs.existsSync(lock(2))]).toEqual([{ share: null }, true]);
  Agy.unlock();
  expect(locks()).toEqual([".updating-7"]);
  other.kill();
  await other.exited;
  expect(Agy.progress()).toBeNull();
  const said: string[] = [];
  Agy.notes((text) => said.push(text));
  const one = tar([{ name: "antigravity", data: "#!/bin/sh\necho auto\n" }]);
  let release = () => {};
  HELD["auto.tgz"] = new Promise<void>((done) => (release = done));
  SERVED["auto.tgz"] = one;
  Agy.pin = BUILT("2.0.1", "auto.tgz", one);
  const done = Agy.auto("on", true)!;
  await Bun.sleep(50);
  expect([Agy.update() === Agy.update(), locks(), fs.readFileSync(lock(8), "utf8"), Agy.progress(), Agy.why()]).toEqual([true, [".updating-8"], String(process.pid), { share: 0 }, "Google's Antigravity CLI 2.0.1 is downloading (0%): try again once it's done"]);
  release();
  expect(await done).toBe(true);
  expect([Agy.ready(), locks(), Agy.progress(), await Agy.update()]).toEqual([true, [], null, false]);
  expect(said).toEqual(["Google's Antigravity CLI is updated to 2.0.1 (from 1.5.9): the Google AI plan runs on it now."]);
  const cmd = Agy.home() + "/2.0.1/antigravity";
  const ino = fs.statSync(cmd).ino;
  await Agy.download(Agy.pin, new AbortController().signal, () => {});
  expect([fs.statSync(cmd).ino, fs.readdirSync(Agy.home()).filter((n) => n.startsWith(".new-") && n !== ".new-other")]).toEqual([ino, []]);
});
