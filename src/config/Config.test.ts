// Config test
// ===========
// `bun test Config.test.ts`. A pick on a vendor added is refused till the
// next start, as config_live reads it on the vendors running, and the
// settings after it are still read anew; `contexts` from a variable; a
// relative path from the folder of the config.json naming it; a number
// in config.json taken as its text. Each key set is checked at the
// start: one that won't do stops illi with one line on why, no trace.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-config-");
for (const k of Object.keys(process.env).filter((k) => k.startsWith("ILLI_"))) {
  delete process.env[k];
}
process.env.ILLI_DIR      = DIR;
process.env.ILLI_CONTEXTS = "{\"gpt-6.1-sol\": 100000}";
fs.writeFileSync(DIR + "/config.json", JSON.stringify({ jobs: 16, rules: "rules.md" }));
fs.writeFileSync(DIR + "/rules.md", "be brief\n");

const config = await import("./Config.ts");

afterAll(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
});

// illi started on this folder and these variables: its exit code and
// what it printed on stderr
function start(env: Record<string, string>): { code: number; err: string } {
  const dir = fs.mkdtempSync(os.tmpdir() + "/illi-config-start-");
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("ILLI_"))) as Record<string, string>;
  try {
    const run = Bun.spawnSync(["bun", import.meta.dir + "/../main.ts"], { env: { ...clean, ILLI_DIR: dir, ...env }, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    return { code: run.exitCode, err: run.stderr.toString() };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a pick on a vendor added is refused till the next start; the settings after it still apply at once", () => {
  config.config_set("vendors", "chatgpt,claude-api");
  expect(() => config.config_set("pick", "claude-api:sonnet-5.5:medium:slow")).toThrow("offered from the next start");
  expect(JSON.parse(fs.readFileSync(DIR + "/config.json", "utf8")).pick).toBeUndefined();
  expect(config.PICK.vendor).toBe("chatgpt");
  config.config_set("side", "left");
  expect(config.SIDE).toBe("left");
});

test("contexts from a variable, as JSON", () => {
  expect(config.config_context("gpt-6.1-sol", 500000)).toBe(100000);
});

test("a relative path from the folder of the config.json that names it; a number taken as its text", () => {
  expect(config.RULES).toBe(DIR + "/rules.md");
  expect(config.JOBS).toBe(16);
  expect(config.config_check("jobs", 4)).toBeNull();
});

test("a setting that won't do stops illi at the start, one line on why", () => {
  for (const [env, why] of [
    [{ ILLI_JOBS: "0" }, "illi: config: jobs takes a number, 1 or more. (ILLI_JOBS)"],
    [{ ILLI_JOBS: "abc" }, "illi: config: jobs takes a number, 1 or more. (ILLI_JOBS)"],
    [{ ILLI_PICK: "bogus" }, "illi: config: pick is no vendor:model:effort:speed offered here: bogus (ILLI_PICK)"],
    [{ ILLI_CONTEXTS: "[1]" }, "illi: config: contexts takes each model's context, like {\"gpt-6.1-sol\": 350000}. (ILLI_CONTEXTS)"],
  ] as const) {
    expect(start(env)).toEqual({ code: 1, err: why + "\n" });
  }
  const none = start({ ILLI_PROFILE: "nope" });
  expect(none.code).toBe(1);
  expect(none.err).toMatch(/^illi: config: no profile "nope" in .*: start illi without ILLI_PROFILE, then \/profile makes it\.\n$/);
});
