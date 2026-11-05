// Agy test
// ========
// `bun test Agy.test.ts`. Google's agent as illi finds and downloads it,
// with no real download: the build each machine's illi is pinned to, each
// one illi takes (Google's own host over https, its checksum and sizes, a
// command by its own name), one for every machine illi is released for;
// an archive (served here) checked against its sha256 as it comes,
// unpacked (each file by its own name, runnable), put in place in one
// rename, found as the agent's command; one that doesn't match, or holds
// a file in a folder, leaves nothing and keeps what was there. Only this
// illi's build runs: another version here is said (older: /login updates
// it; newer: downloads this one), never run, though a logout may use it;
// none for this machine is said. An older version goes once no live illi
// uses it (its mark's process ended), one in use or newer stays; a write
// that fails (a full disk) is said, never a crash; an empty file stored as
// it is unpacks; another terminal's download, still under way, is left
// be. With autoupdate on and an account connected, this illi's build
// downloads by itself, once a run, one illi at a time on the machine (one
// whose illi lives is left to it), a call meanwhile told it's
// downloading; the same build put in place meanwhile by another illi is
// kept as it is.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as zlib from "node:zlib";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-agy-");
delete process.env.ILLI_ANTIGRAVITY;
process.env.ILLI_DIR = DIR;

const { Agy } = await import("./Agy.ts");
const { PINNED } = await import("./Pinned.ts");

// a zip archive of these files (deflated, or stored), as Google's is made
function zip(files: Array<{ name: string; data: string; store?: boolean }>): Buffer {
  const parts: Buffer[] = [];
  const dir: Buffer[] = [];
  let at = 0;
  for (const f of files) {
    const raw  = Buffer.from(f.data);
    const body = f.store ? raw : zlib.deflateRawSync(raw);
    const how  = f.store ? 0 : 8;
    const name = Buffer.from(f.name);
    const crc  = Bun.hash.crc32(raw);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(how, 8);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(how, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(at, 42);
    dir.push(central, name);
    parts.push(head, name, body);
    at += 30 + name.length + body.length;
  }
  const cd  = Buffer.concat(dir);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(at, 16);
  return Buffer.concat([...parts, cd, end]);
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

// a build of the agent served here, by this archive
const BUILT = (version: string, name: string, archive: Buffer, args: string[] = []) => ({ version, archive: URL_OF(name), sha256: sha(archive), bytes: archive.length, unpacked: 1, cmd: "agy_acp_server.par", args });

afterAll(() => {
  HOST.stop(true);
  fs.rmSync(DIR, { recursive: true, force: true });
});

test("each machine's pinned build is one illi takes, one for every machine illi is released for, all one version", () => {
  const all = Object.values(PINNED);
  expect(all.every((b) => Agy.takes(b))).toBe(true);
  expect(new Set(all.map((b) => b.version)).size).toBe(1);
  expect(Object.keys(PINNED)).toEqual(expect.arrayContaining(["linux-x86_64", "linux-aarch64", "darwin-x86_64", "darwin-aarch64"]));
  expect(PINNED["linux-x86_64"].args).toEqual(["--uid="]);
  const good = PINNED["linux-x86_64"];
  for (const bad of [{ ...good, archive: "http://dl.google.com/x.zip" }, { ...good, archive: "https://dl.google.com.evil.test/x.zip" }, { ...good, sha256: "" }, { ...good, cmd: "../bin/sh" }, { ...good, cmd: "bin/agent" }, { ...good, bytes: 0 }, { ...good, version: "latest" }]) {
    expect(Agy.takes(bad)).toBe(false);
  }
  expect(Agy.machine()).toMatch(/^(linux|darwin|windows)-/);
  expect(["1.4.5", "1.10.0", "1.4.12"].sort(Agy.newer)).toEqual(["1.10.0", "1.4.12", "1.4.5"]);
});

test("a download checked as it comes, unpacked runnable, put in place, run; one that doesn't match, or holds a folder, leaves nothing", async () => {
  const one = zip([{ name: "agy_acp_server.par", data: "#!/bin/sh\necho one\n" }, { name: "localharness_external", data: "helper" }]);
  SERVED["one.zip"] = one;
  Agy.pin = BUILT("1.4.5", "one.zip", one, ["--uid="]);
  expect([Agy.command(), Agy.ready(), Agy.why()]).toEqual([null, false, "Google's Antigravity agent isn't here: /login downloads it"]);
  expect(Agy.told(Agy.why())).toBe(true);
  const got: number[] = [];
  await Agy.download(Agy.pin, new AbortController().signal, (bytes) => got.push(bytes));
  const at = Agy.home() + "/1.4.5";
  expect([Agy.command(), Agy.ready(), got.at(-1), fs.readFileSync(at + "/localharness_external", "utf8")]).toEqual([[at + "/agy_acp_server.par", "--uid="], true, one.length, "helper"]);
  expect([fs.statSync(at + "/agy_acp_server.par").mode & 0o777, fs.statSync(at + "/localharness_external").mode & 0o777]).toEqual([0o755, 0o755]);
  expect(fs.existsSync(at + "/.users/" + process.pid)).toBe(true);
  const two = zip([{ name: "agy_acp_server.par", data: "two" }]);
  SERVED["two.zip"] = two;
  await expect(Agy.download({ ...BUILT("1.4.6", "two.zip", two), sha256: sha(one) }, new AbortController().signal, () => {})).rejects.toThrow("didn't match the checksum");
  const sneaky = zip([{ name: "agy_acp_server.par", data: "x" }, { name: "../escape", data: "x" }]);
  SERVED["sneaky.zip"] = sneaky;
  await expect(Agy.download(BUILT("1.4.7", "sneaky.zip", sneaky), new AbortController().signal, () => {})).rejects.toThrow("holds a file in a folder");
  expect([fs.readdirSync(Agy.home()), fs.existsSync(DIR + "/escape"), Agy.versions()]).toEqual([["1.4.5"], false, ["1.4.5"]]);
});

test("only this illi's build runs: another version here is said, never run, though a logout may use it; none for this machine is said", () => {
  const here = Agy.pin!;
  const at = Agy.home() + "/1.4.5/agy_acp_server.par";
  Agy.pin = { ...here, version: "1.4.6" };
  expect([Agy.command(), Agy.ready(), Agy.other(), Agy.any()]).toEqual([null, false, "1.4.5", [at, "--uid="]]);
  expect(Agy.why()).toBe("Google's Antigravity agent 1.4.5 is here, and this illi runs 1.4.6: /login updates it");
  Agy.pin = { ...here, version: "1.4.4" };
  expect(Agy.why()).toBe("Google's Antigravity agent 1.4.5 is here, and this illi runs 1.4.4: /login downloads it");
  Agy.pin = { ...here, sha256: "f".repeat(64) };
  expect([Agy.command(), Agy.other(), Agy.why()]).toEqual([null, null, "Google's Antigravity agent isn't here: /login downloads it"]);
  Agy.pin = null;
  expect(Agy.why()).toBe("Google's Antigravity agent has no build for this machine (" + Agy.machine() + ") that illi runs: ILLI_ANTIGRAVITY can name one of your own");
  expect(Agy.told("Google's Antigravity agent isn't here")).toBe(false);
  Agy.bin = ["/opt/agy/agy_acp_server.par", "--uid="];
  expect([Agy.command(), Agy.ready()]).toEqual([["/opt/agy/agy_acp_server.par", "--uid="], true]);
  Agy.bin = null;
  Agy.pin = here;
});

test("an older version goes once no live illi uses it; one in use, or newer, stays", async () => {
  const keep = (version: string, pid?: number) => {
    fs.mkdirSync(Agy.home() + "/" + version + "/.users", { recursive: true });
    fs.writeFileSync(Agy.home() + "/" + version + "/agent.json", JSON.stringify({ cmd: "agy_acp_server.par", args: [], sha256: "a".repeat(64) }));
    fs.writeFileSync(Agy.home() + "/" + version + "/agy_acp_server.par", "x");
    if (pid !== undefined) {
      fs.writeFileSync(Agy.home() + "/" + version + "/.users/" + pid, "");
    }
  };
  const ended = Bun.spawn(["true"]);
  await ended.exited;
  const live = Bun.spawn(["sleep", "30"]);
  keep("1.4.3", live.pid);
  keep("1.4.4", ended.pid);
  keep("1.4.2");
  keep("1.4.9");
  Agy.tidy();
  expect(Agy.versions()).toEqual(["1.4.9", "1.4.5", "1.4.3"]);
  expect(fs.existsSync(Agy.home() + "/1.4.5/.users/" + process.pid)).toBe(true);
  live.kill();
  await live.exited;
  Agy.tidy();
  expect(Agy.versions()).toEqual(["1.4.9", "1.4.5"]);
  fs.rmSync(Agy.home() + "/1.4.9", { recursive: true, force: true });
});

test("a write that fails is said, never a crash; an empty file stored as it is unpacks; another terminal's download under way is left be, a day-old one goes", async () => {
  const one = zip([{ name: "agy_acp_server.par", data: "x" }]);
  SERVED["w.zip"] = one;
  await expect(Agy.get(BUILT("1.4.8", "w.zip", one), DIR + "/no/such/folder/agent.zip", new AbortController().signal, () => {})).rejects.toThrow("ENOENT");
  const empty = zip([{ name: "agy_acp_server.par", data: "run" }, { name: "EMPTY", data: "", store: true }]);
  SERVED["e.zip"] = empty;
  const young = Agy.home() + "/.new-other";
  const old   = Agy.home() + "/.new-stale";
  fs.mkdirSync(young, { recursive: true });
  fs.mkdirSync(old, { recursive: true });
  fs.utimesSync(old, new Date(Date.now() - 2 * 86400e3), new Date(Date.now() - 2 * 86400e3));
  Agy.pin = BUILT("1.4.9", "e.zip", empty);
  await Agy.download(Agy.pin, new AbortController().signal, () => {});
  expect([fs.readFileSync(Agy.home() + "/1.4.9/EMPTY", "utf8"), fs.existsSync(young), fs.existsSync(old)]).toEqual(["", true, false]);
  expect(Agy.versions()).toEqual(["1.4.9", "1.4.5"]);
});

test("with autoupdate on and an account connected, this illi's build downloads by itself, once, one illi at a time on the machine; a call meanwhile told it's downloading; the same build put in place by another illi meanwhile kept", async () => {
  const lock = () => Agy.home() + "/.updating";
  const other = Bun.spawn(["sleep", "30"]);
  Agy.pin = BUILT("2.0.0", "lock.zip", zip([{ name: "agy_acp_server.par", data: "x" }]));
  expect([Agy.auto("notify", true), Agy.auto("off", true), Agy.auto("on", false)]).toEqual([null, null, null]);
  fs.writeFileSync(lock(), String(other.pid));
  expect([await Agy.auto("on", true), Agy.progress(), Agy.why()]).toEqual([false, { share: null }, "Google's Antigravity agent 2.0.0 is downloading in another illi: try again once it's done"]);
  expect(Agy.told(Agy.why())).toBe(true);
  other.kill();
  await other.exited;
  expect(Agy.progress()).toBeNull();
  const one = zip([{ name: "agy_acp_server.par", data: "#!/bin/sh\necho auto\n" }]);
  let release = () => {};
  HELD["auto.zip"] = new Promise<void>((done) => (release = done));
  SERVED["auto.zip"] = one;
  Agy.pin = BUILT("2.0.1", "auto.zip", one, ["--uid="]);
  const done = Agy.auto("on", true)!;
  expect([Agy.update() === done, fs.readFileSync(lock(), "utf8"), Agy.progress(), Agy.why()]).toEqual([true, String(process.pid), { share: 0 }, "Google's Antigravity agent 2.0.1 is downloading (0%): try again once it's done"]);
  release();
  expect(await done).toBe(true);
  expect([Agy.ready(), fs.existsSync(lock()), Agy.progress(), await Agy.update()]).toEqual([true, false, null, false]);
  const cmd = Agy.home() + "/2.0.1/agy_acp_server.par";
  const ino = fs.statSync(cmd).ino;
  await Agy.download(Agy.pin, new AbortController().signal, () => {});
  expect([fs.statSync(cmd).ino, fs.readdirSync(Agy.home()).filter((n) => n.startsWith(".new-") && n !== ".new-other")]).toEqual([ino, []]);
});
