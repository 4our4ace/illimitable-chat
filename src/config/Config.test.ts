// Config test
// ===========
// `bun test Config.test.ts`. The vendors apply at once: a pick on a
// vendor added is taken, vendors leaving a pick set unoffered refused,
// and the settings after them are still read anew; `autocompacts` from
// a variable (its old name, ILLI_CONTEXTS, too); a
// relative path from the folder of the config.json naming it; a number
// in config.json taken as its text. Each key set is checked at the
// start: one that won't do stops illi with one line on why, no trace;
// a pick set that isn't offered gives way to its default, told. The
// picks' defaults follow the vendors, so vendors alone start. Each
// provider's roles are its own: summaries on its small model or the one
// set for it, subagents on the chat's pick or the one set for it; the start
// tells of an API key set whose vendor isn't offered, and of the pick's
// key missing. autoupdate's values (true and false too) as its mode;
// related's (on, screen, off; true and false as the old on and off) as
// the radar at the side and its lines given to the model. An unknown
// argument is named. A provider let go that leaves no pick offered keeps
// the picks as they were, never ending illi.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import { LABELS, type Offer } from "../ai/Pick.ts";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-config-");
for (const k of Object.keys(process.env).filter((k) => k.startsWith("ILLI_"))) {
  delete process.env[k];
}
process.env.ILLI_DIR      = DIR;
process.env.XDG_DATA_HOME = DIR + "/data";
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

test("the vendors apply at once: a pick on a vendor added is taken; vendors that leave a pick set unoffered refused; the settings after them still apply at once", () => {
  config.config_set("vendors", "chatgpt,claude-api");
  expect(config.OFFER.vendors).toEqual(["chatgpt", "claude-api"]);
  config.config_set("pick", "claude-api:sonnet-5.5:medium:slow");
  expect(config.PICK.vendor).toBe("claude-api");
  expect(config.config_check("vendors", "chatgpt")).toBe("pick is no vendor:model:effort:speed offered here: claude-api:sonnet-5.5:medium:slow");
  config.config_set("pick", null);
  expect(config.PICK.vendor).toBe("chatgpt");
  config.config_set("side", "left");
  expect(config.SIDE).toBe("left");
});

test("autocompacts from a variable under its old name, as JSON", () => {
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
    [{ ILLI_CONTEXTS: "[1]" }, "illi: config: autocompacts takes each model's autocompact, like {\"gpt-6.1-sol\": \"50%\"}. (ILLI_CONTEXTS)"],
    [{ ILLI_AUTOUPDATE: "weekly" }, "illi: config: autoupdate takes on, notify or off. (ILLI_AUTOUPDATE)"],
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
  const gone = start({ ILLI_VENDORS: "claude-api", ILLI_COMPACTOR: "chatgpt:gpt-6-luna:medium:slow,claude-api:nope-1:medium:slow" });
  expect(gone).toMatchObject({ code: 0, err: "" });
  const said = gone.out!.replace(/\s+/g, " ");
  expect(said).toContain("compactor claude-api:nope-1:medium:slow isn't offered here, so illi runs on claude-api:haiku-5.5:medium:slow instead: change it in ILLI_COMPACTOR.");
  expect(said).not.toContain("gpt-6-luna");
});

test("each provider's roles stay its own: summaries on its small model or the one set for it, subagents on the chat's pick or the one set for it", () => {
  const luna = { vendor: "chatgpt", model: "gpt-6-luna", effort: "medium", speed: "slow" } as const;
  const sol  = { vendor: "chatgpt", model: "gpt-6.1-sol", effort: "high", speed: "slow" } as const;
  expect(config.config_role("compactor", sol)).toEqual(luna);
  expect(config.config_role("agents", sol)).toEqual(sol);
  config.config_set("compactor", "claude-api:haiku-5.5:low:slow,chatgpt:gpt-6.1-sol:low:slow");
  config.config_set("agents", "chatgpt:gpt-6-luna:medium:slow");
  expect(config.config_role("compactor", sol)).toEqual({ ...sol, effort: "low" });
  expect(config.config_role("agents", sol)).toEqual(luna);
  expect(config.config_role_set("compactor", luna)).toBe("claude-api:haiku-5.5:low:slow,chatgpt:gpt-6-luna:medium:slow");
  expect(config.config_check("compactor", "chatgpt:gpt-6-luna:medium:slow,chatgpt:gpt-6.1-sol:low:slow")).toBe("compactor takes one pick per provider: two for chatgpt");
  expect(config.config_check("compactor", "chatgpt:nope:medium:slow")).toBe("compactor is no vendor:model:effort:speed offered here: chatgpt:nope:medium:slow");
  config.config_set("compactor", null);
  config.config_set("agents", null);
  expect(config.config_role("compactor", sol)).toEqual(luna);
});

test("the picks' defaults are the first vendor's that is offered; the vendors change while the picks are unset", () => {
  const all = { vendors: ["claude-api", "chatgpt"], models: LABELS } as Offer;
  expect([config.config_def("pick", all), config.config_def("compactor", all)]).toEqual(["claude-api:sonnet-5.5:medium:slow", ""]);
  expect(config.config_def("pick", { vendors: ["openai-api"], models: LABELS })).toBe("openai-api:gpt-6.1-sol:medium:slow");
  expect(config.config_def("jobs")).toBe("8");
  expect(config.config_check("vendors", "claude-api")).toBeNull();
  expect(config.config_check("vendors", "openai-api")).toBeNull();
});

test("the start tells of an API key set whose vendor isn't offered (/login connects it; the vendors setting set, how to name it there), and of the pick's key missing (/login adds one)", () => {
  config.config_set("vendors", null);
  expect(config.config_tips(config.PICK, false)).toEqual(["ANTHROPIC_API_KEY is set, but illi doesn't offer the Anthropic API: /login connects it."]);
  const openai = { vendor: "openai-api", model: "gpt-6-luna", effort: "medium", speed: "slow" } as const;
  expect(config.config_tips(openai, true)).toContain("The chat runs on the OpenAI API, but it has no key: /login adds one, or /model picks another.");
  process.env.ILLI_VENDORS = "chatgpt";
  expect(config.config_tips(config.PICK, false)).toEqual(["ANTHROPIC_API_KEY is set, but illi doesn't offer the Anthropic API: ILLI_VENDORS=claude-api,chatgpt, then start illi again."]);
  expect(config.config_tips(config.PICK, true)).toEqual(["ANTHROPIC_API_KEY is set, but illi doesn't offer the Anthropic API: ILLI_VENDORS=chatgpt,claude-api, then start illi again."]);
  expect(config.config_tips(openai, true)).toContain("The chat runs on the OpenAI API, but it has no key: /login adds one, or /model picks another.");
  delete process.env.ILLI_VENDORS;
  config.config_set("vendors", "chatgpt");
  expect(config.config_tips(config.PICK, false)).toEqual(["ANTHROPIC_API_KEY is set, but illi doesn't offer the Anthropic API: /set vendors claude-api,chatgpt."]);
  config.config_set("vendors", null);
});

test("autoupdate: on by default, notify, or off (true and false too, as config.json's)", () => {
  expect(config.AUTOUPDATE).toBe("on");
  for (const value of ["on", "notify", "off", "Notify", true, false, 0]) {
    expect([value, config.config_check("autoupdate", value)]).toEqual([value, null]);
  }
  expect(config.config_check("autoupdate", "daily")).toBe("autoupdate takes on, notify or off.");
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("ILLI_"))) as Record<string, string>;
  for (const [value, mode] of [["false", "off"], ["0", "off"], ["NOTIFY", "notify"], ["true", "on"]]) {
    const run = Bun.spawnSync(["bun", "-e", "console.log((await import(" + JSON.stringify(import.meta.dir + "/Config.ts") + ")).AUTOUPDATE)"], { env: { ...clean, ILLI_DIR: DIR, ILLI_AUTOUPDATE: value }, stdout: "pipe", stderr: "pipe" });
    expect([value, run.stdout.toString().trim()]).toEqual([value, mode]);
  }
});

test("related: on (the radar at the side, its strong lines given to illi too), screen (the side alone) or off; true and false too, as the old on and off", () => {
  expect([config.RELATED, config.RECALL]).toEqual([true, true]);
  expect(config.SETTINGS.related.values).toEqual(["on", "screen", "off"]);
  const states: Array<[unknown, boolean, boolean]> = [["screen", true, false], ["off", false, false], ["on", true, true], [false, false, false], [true, true, true], ["Screen", true, false], ["0", false, false], ["1", true, true]];
  for (const [value, side, model] of states) {
    config.config_set("related", value);
    expect([value, config.RELATED, config.RECALL]).toEqual([value, side, model]);
  }
  expect(config.config_check("related", "side")).toBe("related takes on, screen or off.");
  config.config_set("related", null);
  expect([config.RELATED, config.RECALL]).toEqual([true, true]);
});

test("an unknown argument is named; one meaning to sign in, told where", () => {
  const odd = start({}, ["frob"]);
  expect(odd.code).toBe(1);
  expect(odd.err).toStartWith("illi: unknown argument frob.\n");
  expect(start({}, ["login"]).err).toStartWith("illi: unknown argument login. Sign in inside the chat: run illi, then type /login.\n");
});

test("a provider let go that leaves no pick offered (the models offered all another's) keeps the picks as they were, never ending illi", () => {
  const vendors = config.config_value("vendors");
  const models  = [...config.OFFER.models];
  config.config_set("vendors", null);
  fs.writeFileSync(config.OWN_LOGIN, JSON.stringify({ openai: { type: "oauth", access: "a", refresh: "r" } }));
  fs.writeFileSync(DIR + "/accounts.json", JSON.stringify({ "claude-api": { use: "env", keys: [] } }));
  config.OFFER.models.splice(0, Infinity, "gpt-6.1-sol");
  try {
    config.config_accounts(true);
    const pick = config.PICK;
    expect([config.OFFER.vendors, pick.vendor]).toEqual([["chatgpt", "claude-api"], "chatgpt"]);
    fs.rmSync(config.OWN_LOGIN);
    expect(() => config.config_accounts(true)).not.toThrow();
    expect([config.OFFER.vendors, config.PICK]).toEqual([["claude-api"], pick]);
  } finally {
    config.OFFER.models.splice(0, Infinity, ...models);
    fs.rmSync(config.OWN_LOGIN, { force: true });
    fs.rmSync(DIR + "/accounts.json", { force: true });
    config.config_set("vendors", vendors === "" ? null : vendors);
    config.config_accounts(true);
  }
});
