// Agy test
// ========
// `bun test Agy.test.ts`. Google's agent as illi finds and downloads it,
// with no real download: the registry's entry taken only from Google's
// own host over https, with its checksum and a command by its own name;
// the build for this machine read from the registry (stubbed); an archive
// (served here) checked against its sha256 as it comes, unpacked (each
// file by its own name, runnable), put in place in one rename, found as
// the agent's command, an older one gone; one that doesn't match, or
// holds a file in a folder, leaves nothing and keeps what was there; a
// write that fails (a full disk) is said, never a crash; an empty file
// stored as it is unpacks; another terminal's download, still under
// way, is left be.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as zlib from "node:zlib";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-agy-");
delete process.env.ILLI_ANTIGRAVITY;
process.env.ILLI_DIR = DIR;

const { Agy } = await import("./Agy.ts");

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

// archives served by name
const SERVED: Record<string, Buffer> = {};
const HOST = Bun.serve({ port: 0, fetch: (req) => {
  const b = SERVED[new URL(req.url).pathname.slice(1)];
  return b === undefined ? new Response(null, { status: 404 }) : new Response(new Uint8Array(b));
} });
const URL_OF = (name: string) => "http://127.0.0.1:" + HOST.port + "/" + name;

afterAll(() => {
  HOST.stop(true);
  fs.rmSync(DIR, { recursive: true, force: true });
});

test("a registry's entry taken only from Google's host over https, with its checksum and a command by its own name", () => {
  const good = { archive: "https://dl.google.com/agy-extensions/releases/linux/agy-acp-server-1.4.5-linux-x86_64.zip", cmd: "./agy_acp_server.par", args: ["--uid="], sha256: "a".repeat(64) };
  expect(Agy.build("1.4.5", good)).toEqual({ version: "1.4.5", archive: good.archive, sha256: "a".repeat(64), cmd: "agy_acp_server.par", args: ["--uid="] });
  for (const bad of [{ ...good, archive: "http://dl.google.com/x.zip" }, { ...good, archive: "https://dl.google.com.evil.test/x.zip" }, { ...good, sha256: "" }, { ...good, cmd: "../bin/sh" }, { ...good, cmd: "bin/agent" }]) {
    expect(() => Agy.build("1.4.5", bad)).toThrow("isn't one illi takes");
  }
  expect(() => Agy.build("latest", good)).toThrow("isn't one illi takes");
  expect(Agy.machine()).toMatch(/^(linux|darwin|windows)-/);
  expect(["1.4.5", "1.10.0", "1.4.12"].sort(Agy.newer)).toEqual(["1.10.0", "1.4.12", "1.4.5"]);
});

test("the build for this machine, as the registry lists it", async () => {
  const real = globalThis.fetch;
  const entry = { archive: "https://dl.google.com/agy.zip", cmd: "./agy_acp_server.par", sha256: "b".repeat(64) };
  globalThis.fetch = (async () => Response.json({ agents: [{ id: "other" }, { id: "antigravity-acp", version: "1.4.6", distribution: { binary: { [Agy.machine()]: entry } } }] })) as any;
  try {
    expect((await Agy.latest()).version).toBe("1.4.6");
    globalThis.fetch = (async () => Response.json({ agents: [{ id: "antigravity-acp", version: "1.4.6", distribution: { binary: {} } }] })) as any;
    await expect(Agy.latest()).rejects.toThrow("has no build for this machine");
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as any;
    await expect(Agy.latest()).rejects.toThrow("can't be reached");
  } finally {
    globalThis.fetch = real;
  }
});

test("a download checked as it comes, unpacked runnable, put in place and found; an older one gone; one that doesn't match, or holds a folder, leaves nothing", async () => {
  expect(Agy.command()).toBeNull();
  const one = zip([{ name: "agy_acp_server.par", data: "#!/bin/sh\necho one\n" }, { name: "localharness_external", data: "helper" }]);
  SERVED["one.zip"] = one;
  const got: number[] = [];
  await Agy.download({ version: "1.4.5", archive: URL_OF("one.zip"), sha256: sha(one), cmd: "agy_acp_server.par", args: ["--uid="] }, new AbortController().signal, (bytes) => got.push(bytes));
  const at = Agy.home() + "/1.4.5";
  expect([Agy.command(), got.at(-1), fs.readFileSync(at + "/localharness_external", "utf8")]).toEqual([[at + "/agy_acp_server.par", "--uid="], one.length, "helper"]);
  expect([fs.statSync(at + "/agy_acp_server.par").mode & 0o777, fs.statSync(at + "/localharness_external").mode & 0o777]).toEqual([0o755, 0o755]);
  const two = zip([{ name: "agy_acp_server.par", data: "two" }]);
  SERVED["two.zip"] = two;
  await expect(Agy.download({ version: "1.4.6", archive: URL_OF("two.zip"), sha256: sha(one), cmd: "agy_acp_server.par", args: [] }, new AbortController().signal, () => {})).rejects.toThrow("didn't match the checksum");
  const sneaky = zip([{ name: "agy_acp_server.par", data: "x" }, { name: "../escape", data: "x" }]);
  SERVED["sneaky.zip"] = sneaky;
  await expect(Agy.download({ version: "1.4.7", archive: URL_OF("sneaky.zip"), sha256: sha(sneaky), cmd: "agy_acp_server.par", args: [] }, new AbortController().signal, () => {})).rejects.toThrow("holds a file in a folder");
  expect([fs.readdirSync(Agy.home()), fs.existsSync(DIR + "/escape"), Agy.kept()?.version]).toEqual([["1.4.5"], false, "1.4.5"]);
  await Agy.download({ version: "1.4.6", archive: URL_OF("two.zip"), sha256: sha(two), cmd: "agy_acp_server.par", args: [] }, new AbortController().signal, () => {});
  expect([fs.readdirSync(Agy.home()), Agy.command()]).toEqual([["1.4.6"], [Agy.home() + "/1.4.6/agy_acp_server.par"]]);
});

test("a write that fails is said, never a crash; an empty file stored as it is unpacks; another terminal's download under way is left be, a day-old one goes", async () => {
  const one = zip([{ name: "agy_acp_server.par", data: "x" }]);
  SERVED["w.zip"] = one;
  await expect(Agy.get({ version: "1.4.8", archive: URL_OF("w.zip"), sha256: sha(one), cmd: "agy_acp_server.par", args: [] }, DIR + "/no/such/folder/agent.zip", new AbortController().signal, () => {})).rejects.toThrow("ENOENT");
  const empty = zip([{ name: "agy_acp_server.par", data: "run" }, { name: "EMPTY", data: "", store: true }]);
  SERVED["e.zip"] = empty;
  const young = Agy.home() + "/.new-other";
  const old   = Agy.home() + "/.new-stale";
  fs.mkdirSync(young, { recursive: true });
  fs.mkdirSync(old, { recursive: true });
  fs.utimesSync(old, new Date(Date.now() - 2 * 86400e3), new Date(Date.now() - 2 * 86400e3));
  await Agy.download({ version: "1.4.9", archive: URL_OF("e.zip"), sha256: sha(empty), cmd: "agy_acp_server.par", args: [] }, new AbortController().signal, () => {});
  expect([fs.readFileSync(Agy.home() + "/1.4.9/EMPTY", "utf8"), fs.existsSync(young), fs.existsSync(old)]).toEqual(["", true, false]);
});
