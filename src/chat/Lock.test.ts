// Lock test
// =========
// `bun test Lock.test.ts`. A chat's state as its holder tells it, beside
// its lock: another illi's (a process of its own) read by its profile,
// asked without waiting; this process's own chat left out; a state left
// by an illi killed (its lock let go) says nothing; one let go cleanly
// takes its state with it, and a lock taken again starts with none.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-lock-");
for (const k of Object.keys(process.env).filter((k) => k.startsWith("ILLI_"))) {
  delete process.env[k];
}
process.env.ILLI_DIR = DIR;
fs.mkdirSync(DIR + "/profiles/home", { recursive: true });

const { Lock } = await import("./Lock.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// another illi in profile `profile`, holding the chat of a project of its
// own and telling its state, till killed
async function holder(profile: string, state: object) {
  const cwd = fs.mkdtempSync(DIR + "/project-");
  const code = "const { Lock } = await import(" + JSON.stringify(import.meta.dir + "/Lock.ts") + "); await Lock.take(" + JSON.stringify(cwd) + "); Lock.tell(" + JSON.stringify(state) + "); console.log('held'); setInterval(() => {}, 1000);";
  const proc = Bun.spawn(["bun", "-e", code], { env: { ...process.env, ILLI_PROFILE: profile }, stdout: "pipe", stderr: "inherit" });
  const reader = proc.stdout.getReader();
  await reader.read();
  return proc;
}

const DIRS = [{ profile: "default", dir: DIR }, { profile: "home", dir: DIR + "/profiles/home" }];

// this process's own project
const MINE = fs.mkdtempSync(DIR + "/mine-");

test("another illi's chat state is read by its profile, asked without waiting; this process's own is left out", async () => {
  const other = await holder("home", { asks: false, working: true, jobs: 2, holds: true });
  try {
    expect(await Lock.take(MINE)).toBe(true);
    Lock.tell({ asks: true, working: true, jobs: 1, holds: true });
    const t0 = performance.now();
    expect(Lock.states(DIRS)).toEqual([{ profile: "home", asks: false, working: true, jobs: 2, holds: true }]);
    expect(performance.now() - t0).toBeLessThan(40);
  } finally {
    other.kill("SIGKILL");
    await other.exited;
  }
});

test("a state left by an illi killed says nothing, its lock let go; one let go cleanly takes its state with it, and a lock taken again starts with none", async () => {
  expect(Lock.states(DIRS)).toEqual([]);
  expect(fs.readdirSync(DIR + "/profiles/home/locks").some((f) => f.endsWith(".state"))).toBe(true);
  const own = DIR + "/locks/" + fs.readdirSync(DIR + "/locks").find((f) => f.endsWith(".state"));
  Lock.release();
  expect(fs.existsSync(own)).toBe(false);
  fs.writeFileSync(own, JSON.stringify({ asks: false, working: true, jobs: 0, holds: true }));
  expect(await Lock.take(MINE)).toBe(true);
  expect(fs.existsSync(own)).toBe(false);
  Lock.release();
});
