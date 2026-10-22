// Update test
// ===========
// `bun test Update.test.ts`. illi updating itself, against a release
// server of the test's own (127.0.0.1: GitHub is never asked), a script
// in a temp folder standing for the running file. Versions compare as
// semver; the latest is where the page redirects. A newer release
// installs over the file (which then says its version), nothing else
// left beside it; the same or an older one does nothing. A file that
// doesn't match its sum, or won't say its version, a release with no
// build for this system, no connection: nothing changed, logged, never
// told. A folder illi can't write: nothing downloaded, told once a
// release. notify only tells; off never asks; a source run never looks;
// a look at most once a day, one that fails again next time; an illi
// whose file was replaced since it started never again. Two at once both
// install, safely. A folder left mid-way goes as illi quits or runs again
// in place, or, an illi killed, once unwritten for an hour. `illi
// upgrade` says each step, and why it changed nothing. A file run with
// --version says exactly what an update checks it by, whatever its
// settings.

import { afterAll, beforeEach, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import { STATE, Update, VERSION, type Place } from "./Update.ts";

const TMP = fs.mkdtempSync(os.tmpdir() + "/illi-update-");
process.env.ILLI_DIR = TMP + "/illi";

// what the update logs (illi.log, on a terminal), kept here
const logged: string[] = [];
spyOn(console, "error").mockImplementation((...args: unknown[]) => void logged.push(args.join(" ")));
spyOn(console, "log").mockImplementation((...args: unknown[]) => void logged.push(args.join(" ")));

// the release served: its version, what its file says run with
// --version, its SHA256SUMS (null: the right ones), whether its file
// never ends (a download that hangs); each path asked
const SERVED = { version: "0.2.0", says: "illi 0.2.0", sums: null as string | null, hang: false };
const release = { ...SERVED };
const asked: string[] = [];

// a release server, as GitHub's: /releases/latest redirects to the
// latest's tag; its files under /releases/download/<tag>/
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req): Response => {
  const at   = new URL(req.url).pathname;
  const from = "/releases/download/v" + release.version + "/";
  const file = "#!/bin/sh\necho '" + release.says + "'\n";
  asked.push(at);
  if (at === "/releases/latest") {
    return new Response(null, { status: 302, headers: { location: BASE + "/tag/v" + release.version } });
  }
  if (at === from + "SHA256SUMS") {
    return new Response(release.sums ?? new Bun.CryptoHasher("sha256").update(file).digest("hex") + "  " + Update.asset() + "\n");
  }
  if (at === from + Update.asset()) {
    return new Response(release.hang ? new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode(file)) }) : file);
  }
  return new Response("Not Found", { status: 404 });
} });
const BASE: string = "http://127.0.0.1:" + server.port + "/releases";

// a port nothing listens on: no connection
const gone = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
const PORT    = gone.port;
const OFFLINE = "http://127.0.0.1:" + PORT + "/releases";
gone.stop(true);

beforeEach(() => {
  Object.assign(release, SERVED);
  asked.length  = 0;
  logged.length = 0;
});

afterAll(() => {
  server.stop(true);
  fs.rmSync(TMP, { recursive: true, force: true });
});

// a new folder holding a script that stands for the running illi (it
// says its version, run with --version), and a root for the state: the
// place an update sees, its folder, its root
let made = 0;
function here(version = "0.1.0"): { place: Place; bin: string; root: string } {
  const dir = TMP + "/" + (made += 1);
  fs.mkdirSync(dir + "/bin", { recursive: true });
  fs.writeFileSync(dir + "/bin/illi", "#!/bin/sh\necho 'illi " + version + "'\n", { mode: 0o755 });
  return { place: { base: BASE, version, exec: dir + "/bin/illi", stamp: Update.stamp(dir + "/bin/illi") }, bin: dir + "/bin", root: dir + "/root" };
}

// what a file says it is, run with --version
function says(file: string): string {
  return Bun.spawnSync([file, "--version"]).stdout.toString().trim();
}

// the release's files asked for (not the page)
function downloads(): string[] {
  return asked.filter((at) => at.startsWith("/releases/download/"));
}

test("a version is newer as semver: by number, a release over its prerelease", () => {
  expect(Update.newer("0.2.0", "0.1.0")).toBe(true);
  expect(Update.newer("0.10.0", "0.9.9")).toBe(true);
  expect(Update.newer("1.0.0", "0.99.99")).toBe(true);
  expect(Update.newer("1.0.0", "1.0.0-rc.2")).toBe(true);
  expect(Update.newer("1.0.0-rc.10", "1.0.0-rc.9")).toBe(true);
  expect(Update.newer("0.1.0", "0.1.0")).toBe(false);
  expect(Update.newer("0.1.0", "0.2.0")).toBe(false);
  expect(Update.newer("1.0.0-rc.1", "1.0.0")).toBe(false);
  expect(Update.newer("latest", "0.1.0")).toBe(false);
});

test("the latest release is where its page redirects, no API asked; a page that won't say throws", async () => {
  expect(await Update.latest(BASE)).toBe("0.2.0");
  expect(asked).toEqual(["/releases/latest"]);
  await expect(Update.latest("http://127.0.0.1:" + server.port + "/none")).rejects.toThrow("won't give latest now (HTTP 404)");
  await expect(Update.latest(OFFLINE)).rejects.toThrow("can't reach 127.0.0.1:" + PORT + " (offline?)");
});

test("a newer release installs over the running file, runnable, nothing else left beside it; the note says so", async () => {
  const { place, bin, root } = here();
  expect(await Update.check(root, "on", place)).toBe("illi 0.2.0 is installed: it runs from the next start.");
  expect(says(place.exec)).toBe("illi 0.2.0");
  expect(fs.statSync(place.exec).mode & 0o777).toBe(0o755);
  expect(fs.readdirSync(bin)).toEqual(["illi"]);
  expect(downloads()).toEqual(["/releases/download/v0.2.0/SHA256SUMS", "/releases/download/v0.2.0/" + Update.asset()]);
  expect(Date.parse(JSON.parse(fs.readFileSync(root + "/" + STATE, "utf8")).checked)).toBeGreaterThan(Date.now() - 60e3);
  expect(logged).toEqual(["update: installed illi 0.2.0 in " + place.exec]);
});

test("the same release, or an older one, does nothing: only the page is asked", async () => {
  for (const version of ["0.2.0", "0.3.0"]) {
    const { place, root } = here(version);
    expect(await Update.check(root, "on", place)).toBe("");
    expect(says(place.exec)).toBe("illi " + version);
  }
  expect(asked).toEqual(["/releases/latest", "/releases/latest"]);
});

test("a file that doesn't match its sum, won't say its version, or isn't built for this system changes nothing: logged, never told", async () => {
  const cases: Array<[Partial<typeof SERVED>, string]> = [
    [{ sums: "0".repeat(64) + "  " + Update.asset() + "\n" }, Update.asset() + " doesn't match the release's SHA256SUMS"],
    [{ says: "illi 0.1.9" }, "the new illi won't run here (illi 0.1.9)"],
    [{ sums: "0".repeat(64) + "  illi-plan9-mips\n" }, "illi 0.2.0 has no build for " + Update.asset().slice(5) + " (install.sh builds one from the source)"],
  ];
  for (const [served, why] of cases) {
    Object.assign(release, SERVED, served);
    logged.length = 0;
    const { place, bin, root } = here();
    expect(await Update.check(root, "on", place)).toBe("");
    expect(says(place.exec)).toBe("illi 0.1.0");
    expect(fs.readdirSync(bin)).toEqual(["illi"]);
    expect(logged).toEqual(["update: " + why]);
  }
});

test("no connection: nothing changed, logged, never told; the next look not a day away", async () => {
  const { place, root } = here();
  expect(await Update.check(root, "on", { ...place, base: OFFLINE })).toBe("");
  expect(says(place.exec)).toBe("illi 0.1.0");
  expect(logged).toEqual(["update: can't reach 127.0.0.1:" + PORT + " (offline?)"]);
  expect(fs.existsSync(root + "/" + STATE)).toBe(false);
  expect(await Update.check(root, "notify", place)).toBe("illi 0.2.0 is out: illi upgrade installs it.");
});

test.skipIf(process.getuid?.() === 0)("a folder illi can't write: nothing downloaded, nothing changed; told once a release", async () => {
  const { place, bin, root } = here();
  fs.chmodSync(bin, 0o555);
  try {
    const now = Date.now();
    expect(await Update.check(root, "on", place, now)).toBe("illi 0.2.0 is out, but illi can't write " + bin + " to install it: run sudo illi upgrade.");
    expect(downloads()).toEqual([]);
    expect(says(place.exec)).toBe("illi 0.1.0");
    expect(fs.readdirSync(bin)).toEqual(["illi"]);
    expect(await Update.check(root, "on", place, now + 25 * 3600e3)).toBe("");
    Object.assign(release, { version: "0.3.0", says: "illi 0.3.0" });
    expect(await Update.check(root, "on", place, now + 50 * 3600e3)).toContain("illi 0.3.0 is out, but illi can't write ");
  } finally {
    fs.chmodSync(bin, 0o755);
  }
});

test("notify only tells; off never asks; a source run never looks", async () => {
  const { place, root } = here();
  expect(await Update.check(root, "notify", place)).toBe("illi 0.2.0 is out: illi upgrade installs it.");
  expect(says(place.exec)).toBe("illi 0.1.0");
  expect(asked).toEqual(["/releases/latest"]);
  const off = here();
  expect(await Update.check(off.root, "off", off.place)).toBe("");
  expect(await Update.check(off.root, "on", null)).toBe("");
  expect(asked).toEqual(["/releases/latest"]);
  expect(fs.existsSync(off.root + "/" + STATE)).toBe(false);
});

test("a look at most once a day, every illi's (the root keeps when)", async () => {
  const { place, root } = here("0.2.0");
  const now = Date.now();
  await Update.check(root, "on", place, now);
  await Update.check(root, "on", place, now + 3600e3);
  await Update.check(root, "notify", place, now + 23 * 3600e3);
  expect(asked).toEqual(["/releases/latest"]);
  await Update.check(root, "on", place, now + 24 * 3600e3);
  expect(asked).toEqual(["/releases/latest", "/releases/latest"]);
});

test("an illi whose file was replaced since it started looks no more, a day on too; the next start, from the new file, does", async () => {
  const { place, root } = here();
  const now = Date.now();
  expect(await Update.check(root, "on", place, now)).toBe("illi 0.2.0 is installed: it runs from the next start.");
  const seen = asked.length;
  expect(await Update.check(root, "on", place, now + 25 * 3600e3)).toBe("");
  expect(await Update.check(root, "notify", place, now + 25 * 3600e3)).toBe("");
  expect(asked).toHaveLength(seen);
  const next = { ...place, version: "0.2.0", stamp: Update.stamp(place.exec) };
  expect(await Update.check(root, "on", next, now + 25 * 3600e3)).toBe("");
  expect(asked.slice(seen)).toEqual(["/releases/latest"]);
});

test("two illis installing at once both do, safely: the new file whole, nothing left beside it", async () => {
  const { place, bin } = here();
  await Promise.all([Update.install(place, "0.2.0"), Update.install(place, "0.2.0")]);
  expect(says(place.exec)).toBe("illi 0.2.0");
  expect(fs.readdirSync(bin)).toEqual(["illi"]);
});

test("a download's folder goes as illi quits mid-way; one left by an illi killed goes once unwritten for an hour, one in use stays", async () => {
  const { place, bin } = here();
  release.hang = true;
  const code = `
    import * as fs from "node:fs";
    import { Update } from ${JSON.stringify(import.meta.dir + "/Update.ts")};
    void Update.install(${JSON.stringify(place)}, "0.2.0");
    while (!fs.readdirSync(${JSON.stringify(bin)}).some((n) => n.startsWith(".illi-update-"))) await Bun.sleep(10);
    await Bun.sleep(100);
    process.exit(0);
  `;
  const run = Bun.spawnSync([process.execPath, "-e", code], { stdout: "pipe", stderr: "pipe", timeout: 20e3 });
  expect([run.exitCode, run.stderr.toString()]).toEqual([0, ""]);
  expect(fs.readdirSync(bin)).toEqual(["illi"]);
  release.hang = false;
  const ago = new Date(Date.now() - 2 * 3600e3);
  for (const away of ["old", "new", "busy"]) {
    fs.mkdirSync(bin + "/.illi-update-" + away);
  }
  fs.writeFileSync(bin + "/.illi-update-old/illi", "half");
  fs.writeFileSync(bin + "/.illi-update-busy/illi", "half, and growing");
  fs.utimesSync(bin + "/.illi-update-old/illi", ago, ago);
  fs.utimesSync(bin + "/.illi-update-old", ago, ago);
  fs.utimesSync(bin + "/.illi-update-busy", ago, ago);
  await Update.install(place, "0.2.0");
  expect(fs.readdirSync(bin).sort()).toEqual([".illi-update-busy", ".illi-update-new", "illi"]);
});

test("a download's folder goes as illi runs again in place (/profile: Update.drop, then an execve, which fires no exit); no look nor download starts after", async () => {
  const { place, bin, root } = here();
  release.hang = true;
  const code = `
    import * as fs from "node:fs";
    import { Update } from ${JSON.stringify(import.meta.dir + "/Update.ts")};
    void Update.install(${JSON.stringify(place)}, "0.2.0");
    while (!fs.readdirSync(${JSON.stringify(bin)}).some((n) => n.startsWith(".illi-update-"))) await Bun.sleep(10);
    Update.drop();
    const late = await Update.install(${JSON.stringify(place)}, "0.2.0").then(() => "installed", (err) => err.message);
    const note = await Update.check(${JSON.stringify(root)}, "on", ${JSON.stringify(place)}, Date.now());
    fs.writeSync(1, late + "|" + note);
    process.kill(process.pid, "SIGKILL");
  `;
  const run = Bun.spawnSync([process.execPath, "-e", code], { stdout: "pipe", stderr: "pipe", timeout: 20e3 });
  expect([run.signalCode, run.stderr.toString(), run.stdout.toString()]).toEqual(["SIGKILL", "", "illi is leaving|"]);
  expect(fs.readdirSync(bin)).toEqual(["illi"]);
  expect(fs.existsSync(root + "/" + STATE)).toBe(false);
});

test("a file run with --version says exactly illi X.Y.Z, as an update checks it by, its settings never read (a broken one too)", () => {
  const dir = TMP + "/broken";
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dir + "/config.json", "{ not json");
  const run = Bun.spawnSync([process.execPath, import.meta.dir + "/../main.ts", "--version"], { env: { ...process.env, ILLI_DIR: dir }, stdout: "pipe", stderr: "pipe" });
  expect([run.exitCode, run.stdout.toString(), run.stderr.toString()]).toEqual([0, "illi " + VERSION + "\n", ""]);
});

test("illi upgrade says each step; the latest already, so; a failure why, nothing changed", async () => {
  const out: string[] = [];
  const err: string[] = [];
  const upgrade = (place: Place) => Update.upgrade(place, (line) => out.push(line), (line) => err.push(line));
  const { place } = here();
  expect(await upgrade(place)).toBe(0);
  expect(out).toEqual(["Downloading illi 0.2.0 (" + Update.asset() + ")", "Checked: it matches the release's SHA256SUMS and runs", "Installed illi 0.2.0 in " + place.exec]);
  out.length = 0;
  expect(await upgrade({ ...place, version: "0.2.0" })).toBe(0);
  expect(out).toEqual(["illi 0.2.0 is the latest."]);
  out.length = 0;
  release.sums = "0".repeat(64) + "  " + Update.asset() + "\n";
  const bad = here();
  expect(await upgrade(bad.place)).toBe(1);
  expect(says(bad.place.exec)).toBe("illi 0.1.0");
  expect(await upgrade({ ...bad.place, base: OFFLINE })).toBe(1);
  expect(err).toEqual([
    "illi: " + Update.asset() + " doesn't match the release's SHA256SUMS: nothing changed.",
    "illi: can't reach 127.0.0.1:" + PORT + " (offline?): nothing changed.",
  ]);
  expect(out).toEqual(["Downloading illi 0.2.0 (" + Update.asset() + ")"]);
});

test.skipIf(process.getuid?.() === 0)("illi upgrade into a folder it can't write says how to", async () => {
  const err: string[] = [];
  const { place, bin } = here();
  fs.chmodSync(bin, 0o555);
  try {
    expect(await Update.upgrade(place, () => {}, (line) => err.push(line))).toBe(1);
  } finally {
    fs.chmodSync(bin, 0o755);
  }
  expect(err).toEqual(["illi: can't write " + bin + ": run sudo illi upgrade, or install illi again in a folder of yours."]);
  expect(downloads()).toEqual([]);
});
