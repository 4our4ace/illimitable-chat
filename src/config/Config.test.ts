// Config test
// ===========
// `bun test Config.test.ts`. A pick on a vendor added is refused till the
// next start, as config_live reads it on the vendors running, and the
// settings after it are still read anew; `contexts` from a variable; a
// relative path from the folder of the config.json naming it; a number
// in config.json taken as its text. Each key set is checked at the
// start: one that won't do stops illi with one line on why, no trace;
// a pick set that isn't offered gives way to its default, told. The
// picks' defaults follow the vendors, so vendors alone start; the start
// tells of an API key set whose vendor isn't offered, and of the pick's
// key missing. An unknown argument is named.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import { LABELS, type Offer } from "../ai/Pick.ts";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-config-");
for (const k of Object.keys(process.env).filter((k) => k.startsWith("ILLI_"))) {
  delete process.env[k];
}
process.env.ILLI_DIR      = DIR;
process.env.ILLI_CONTEXTS = "{\"gpt-6.1-sol\": 100000}";
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.OPENAI_API_KEY    = "";
fs.writeFileSync(DIR + "/config.json", JSON.stringify({ jobs: 16, rules: "rules.md" }));
fs.writeFileSync(DIR + "/rules.md", "be brief\n");

const config = await import("./Config.ts");

afterAll(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
});

// illi started on this folder, these variables and arguments, from a
// pipe with nothing in it: its exit code, what it printed on stderr (and
// on stdout: out)
function start(env: Record<string, string>, args: string[] = []): { code: number; err: string; out?: string } {
  const dir = fs.mkdtempSync(os.tmpdir() + "/illi-config-start-");
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("ILLI_"))) as Record<string, string>;
  try {
    const run = Bun.spawnSync(["bun", import.meta.dir + "/../main.ts", ...args], { env: { ...clean, ILLI_DIR: dir, ...env }, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    return { code: run.exitCode, err: run.stderr.toString(), out: run.stdout.toString() };
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

test("a setting that won't do stops Illi at the start, one line on why", () => {
  for (const [env, why] of [
    [{ ILLI_JOBS: "0" }, "illi: config: jobs takes a number, 1 or more. (ILLI_JOBS)"],
    [{ ILLI_JOBS: "abc" }, "illi: config: jobs takes a number, 1 or more. (ILLI_JOBS)"],
    [{ ILLI_PICK: "bogus" }, "illi: config: pick is no vendor:model:effort:speed offered here: bogus (ILLI_PICK)"],
    [{ ILLI_CONTEXTS: "[1]" }, "illi: config: contexts takes each model's context, like {\"gpt-6.1-sol\": 350000}. (ILLI_CONTEXTS)"],
  ] as const) {
    expect(start(env)).toMatchObject({ code: 1, err: why + "\n" });
  }
  const none = start({ ILLI_PROFILE: "nope" });
  expect(none.code).toBe(1);
  expect(none.err).toMatch(/^illi: config: no profile "nope" in .*: start illi without ILLI_PROFILE, then \/profile makes it\.\n$/);
});

test("vendors alone start, the picks' defaults theirs; a pick set that isn't offered gives way to its default, told where it's set", () => {
  for (const vendors of ["claude-api", "openai-api", "claude-api,chatgpt"]) {
    expect(start({ ILLI_VENDORS: vendors })).toMatchObject({ code: 0, err: "" });
  }
  const gone = start({ ILLI_VENDORS: "claude-api", ILLI_COMPACTOR: "chatgpt:gpt-6-luna:medium:slow" });
  expect(gone).toMatchObject({ code: 0, err: "" });
  expect(gone.out!.replace(/\s+/g, " ")).toContain("compactor chatgpt:gpt-6-luna:medium:slow isn't offered here, so Illi runs on claude-api:haiku-5.5:medium:slow instead: change it in ILLI_COMPACTOR.");
});

test("the picks' defaults are the first vendor's that is offered; the vendors change while the picks are unset", () => {
  const all = { vendors: ["claude-api", "chatgpt"], models: LABELS } as Offer;
  expect([config.config_def("pick", all), config.config_def("compactor", all)]).toEqual(["claude-api:sonnet-5.5:medium:slow", "claude-api:haiku-5.5:medium:slow"]);
  expect(config.config_def("pick", { vendors: ["openai-api"], models: LABELS })).toBe("openai-api:gpt-6.1-sol:medium:slow");
  expect(config.config_def("compactor", { vendors: ["claude-api", "chatgpt"], models: ["opus-5.5"] })).toBe("claude-api:opus-5.5:medium:slow");
  expect(config.config_def("jobs")).toBe("8");
  expect(config.config_check("vendors", "claude-api")).toBeNull();
  expect(config.config_check("vendors", "openai-api")).toBeNull();
});

test("the start tells of an API key set whose vendor isn't offered, and of the pick's key missing", () => {
  expect(config.config_tips(config.PICK, false)).toEqual(["ANTHROPIC_API_KEY is set, but Illi doesn't offer claude-api: /set vendors claude-api,chatgpt, then start Illi again."]);
  expect(config.config_tips(config.PICK, true)).toEqual(["ANTHROPIC_API_KEY is set, but Illi doesn't offer claude-api: /set vendors chatgpt,claude-api, then start Illi again."]);
  const openai = { vendor: "openai-api", model: "gpt-6-luna", effort: "medium", speed: "slow" } as const;
  expect(config.config_tips(openai, true)).toContain("The chat runs on openai-api, but OPENAI_API_KEY isn't set: set it and start Illi again, or /model picks another.");
});

test("an unknown argument is named; one meaning to sign in, told where", () => {
  const odd = start({}, ["frob"]);
  expect(odd.code).toBe(1);
  expect(odd.err).toStartWith("illi: unknown argument frob.\n");
  expect(start({}, ["login"]).err).toStartWith("illi: unknown argument login. Sign in inside the chat: run illi, then type /login.\n");
});
