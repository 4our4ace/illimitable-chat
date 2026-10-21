// Settings test
// =============
// `bun test Settings.test.ts`. /settings lists each setting, its value
// and what it does (one a variable sets says so, and stays); Left, Right
// and Enter step one through its values, kept in config.json at once and
// read anew; Delete puts its default back; Enter on a pick opens the
// model picker, its choice the setting's; on one typed in, /set in the
// input. /set checks a value first: its shape and the picks still
// offered (a file named needn't be there). A pick set while illi's own
// agent is the main one is the chat's at once. /side changes its settings as /set does. Each
// setting is in the README and the customize-illi skill.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-settings-");
process.env.ILLI_DIR = DIR;
process.env.ILLI_VENDORS = "claude-api";
process.env.ILLI_PICK = "claude-api:sonnet-5.5:medium:slow";
process.env.ILLI_COMPACTOR = "claude-api:haiku-5.5:high:slow";
delete process.env.ILLI_SIDE_WIDTH;
delete process.env.ILLI_AGENTS;
delete process.env.ILLI_AFTER;
delete process.env.ILLI_JOBS;

const config = await import("../config/Config.ts");
const { term_commands } = await import("./Commands.ts");
const { term_grab, term_type } = await import("./Keys.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal with no screen, its chat on sonnet at medium effort; a
// paint always due, so none is asked for
const term = () => {
  const v = View.view_new();
  View.view_hear(v, { $: "state", ...v, vendors: ["claude-api"], pick: { vendor: "claude-api", model: "sonnet-5.5", effort: "medium", speed: "slow" } });
  return { v, scr: { tty: true, ed: Screen.ed_new() }, side: { place: "right", width: "25%" }, choose: null, pane: null, sug: null, ver: 0, scroll: 0, notices: [], due: true } as any;
};

// a command typed, by its name
const run = (t: any, name: string, arg = "") => term_commands().find(([use]) => use.split(" ")[0] === name)![3](t, arg);

// the lit option, what the picker says of it, what the foot says, the
// last note, config.json as kept
const lit   = (t: any) => t.choose.names[t.choose.shown[t.choose.at].k];
const about = (t: any) => t.choose.about[t.choose.shown[t.choose.at].k];
const foot  = (t: any) => t.choose.foot(t.choose.shown[t.choose.at].k);
const note  = (t: any) => t.notices.at(-1)?.text ?? "";
const file  = () => JSON.parse(fs.readFileSync(DIR + "/config.json", "utf8"));

test("/settings lists each setting, its value and what it does; one a variable sets says so, and stays", () => {
  const t = term();
  run(t, "/settings");
  expect(t.choose.names).toEqual(["pick", "agents", "compactor", "suggest", "side", "side_width", "context", "contexts", "rules", "after", "vendors", "models", "jobs", "theme", "mcp", "login"]);
  expect(about(t)).toMatch(/^sonnet-5\.5 · medium +illi's own default model/);
  expect(foot(t)).toBe("set by ILLI_PICK");
  term_grab(t, "Enter");
  expect(note(t)).toBe("pick is set by ILLI_PICK: unset it to change it here.");
  run(t, "/settings");
  term_type(t, "jobs");
  expect([lit(t), foot(t)]).toEqual(["jobs", "◂ ▸ Enter change · Del default · at the next start"]);
});

test("Left, Right and Enter step a setting, kept in config.json at once; Delete puts its default back", () => {
  const t = term();
  run(t, "/settings");
  term_type(t, "side_w");
  expect([lit(t), foot(t)]).toEqual(["side_width", "◂ ▸ Enter change · Del default · applies now"]);
  term_grab(t, "Right");
  expect([file().side_width, config.SIDE_WIDTH, t.side.width]).toEqual(["30%", "30%", "30%"]);
  expect(about(t)).toMatch(/^30% +the side panel's width/);
  term_grab(t, "Left");
  term_grab(t, "Left");
  expect(config.SIDE_WIDTH).toBe("20%");
  term_grab(t, "Enter");
  expect([config.SIDE_WIDTH, t.choose?.title]).toEqual(["25%", "Settings"]);
  term_grab(t, "Delete");
  expect(file().side_width).toBeUndefined();
  expect(config.SIDE_WIDTH).toBe("25%");
});

test("Enter on a pick opens the model picker at the chat's pick; its choice is the setting's, read anew, and the settings come back", () => {
  const t = term();
  run(t, "/settings");
  term_type(t, "agents");
  expect(about(t)).toMatch(/^the chat's pick/);
  term_grab(t, "Enter");
  expect([t.choose.title, lit(t)]).toEqual(["Settings: agents", "sonnet-5.5"]);
  term_grab(t, "Down");
  term_grab(t, "Enter");
  expect(file().agents).toBe("claude-api:haiku-5.5:medium:slow");
  expect(config.AGENTS).toEqual({ vendor: "claude-api", model: "haiku-5.5", effort: "medium", speed: "slow" });
  expect(note(t)).toMatch(/^agents: haiku-5\.5 · medium, kept in .*config\.json; it applies now\.$/);
  expect([t.choose.title, lit(t)]).toEqual(["Settings", "agents"]);
  term_grab(t, "Delete");
  expect(config.AGENTS).toBeNull();
});

test("Enter on one typed in puts /set in the input; /set checks the value, then keeps it", () => {
  const t = term();
  run(t, "/settings");
  term_type(t, "after");
  term_grab(t, "Enter");
  expect([t.choose, t.scr.ed.text]).toEqual([null, "/set after "]);
  run(t, "/set", "after echo done");
  expect(config.AFTER).toBe("echo done");
  run(t, "/set", "after default");
  expect(config.AFTER).toBe("");
  run(t, "/set", "rules /no/such/file");
  expect(config.RULES).toBe("/no/such/file");
  run(t, "/set", "rules default");
  expect(config.RULES).toBe(DIR + "/RULES.md");
  run(t, "/set", "jobs none");
  expect(note(t)).toBe("jobs takes a number, 1 or more.");
  run(t, "/set", "contexts {\"sonnet-5.5\": 100000}");
  expect(config.config_context("sonnet-5.5", 200000)).toBe(100000);
  for (const bad of ["[1]", "{nope"]) {
    run(t, "/set", "contexts " + bad);
    expect(note(t)).toBe("contexts takes each model's context, like {\"gpt-6.1-sol\": 350000}.");
  }
  run(t, "/set", "nope 1");
  expect(note(t)).toMatch(/^No setting nope\./);
  run(t, "/set", "side");
  expect(note(t)).toBe("side: right. Where the side panel shows. /set side <value> changes it; /set side default puts back right.");
});

test("the pick set while illi's own agent is the main one is the chat's at once; under another agent, only kept", () => {
  const pick = process.env.ILLI_PICK;
  delete process.env.ILLI_PICK;
  try {
    const t = term();
    run(t, "/set", "pick claude-api:haiku-5.5:high:slow");
    expect(t.v.out.map((p: any) => p.msg.$ === "pick" && p.msg.to)).toEqual([{ vendor: "claude-api", model: "haiku-5.5", effort: "high", speed: "slow" }]);
    const other = term();
    other.v.agent = "reviewer";
    run(other, "/set", "pick claude-api:opus-5.5:high:slow");
    expect([file().pick, other.v.out]).toEqual(["claude-api:opus-5.5:high:slow", []]);
    run(other, "/set", "pick default");
  } finally {
    process.env.ILLI_PICK = pick;
  }
});

test("/side changes its settings as /set does: not over a variable, nor into a config.json that won't read", () => {
  const t = term();
  run(t, "/side", "left");
  expect([file().side, t.side.place]).toEqual(["left", "left"]);
  process.env.ILLI_SIDE = "right";
  try {
    run(t, "/side", "off");
    expect(note(t)).toBe("side is set by ILLI_SIDE, over config.json: unset it to change it here.");
    expect(file().side).toBe("left");
  } finally {
    delete process.env.ILLI_SIDE;
  }
  const kept = fs.readFileSync(DIR + "/config.json", "utf8");
  fs.writeFileSync(DIR + "/config.json", "{ nope");
  try {
    expect(() => run(t, "/side", "40")).not.toThrow();
    expect(note(t)).not.toMatch(/^The side panel/);
  } finally {
    fs.writeFileSync(DIR + "/config.json", kept);
  }
  run(t, "/side", "right");
});

test("a vendor or a model taken out that a pick runs on won't do", () => {
  expect(config.config_check("vendors", "chatgpt")).toMatch(/^pick is no vendor:model:effort:speed offered here/);
  expect(config.config_check("models", "opus-5.5")).toMatch(/^pick is no vendor:model:effort:speed offered here/);
  expect(config.config_check("models", "sonnet-5.5, haiku-5.5")).toBeNull();
});

test("each setting is said where a person or illi reads of it: the README's Config, the customize-illi skill", () => {
  const readme = fs.readFileSync(import.meta.dir + "/../../README.md", "utf8");
  const config_part = readme.slice(readme.indexOf("\nConfig\n"), readme.indexOf("\nCode\n"));
  const skill = fs.readFileSync(import.meta.dir + "/../skills/customize-illi/SKILL.md", "utf8");
  for (const key of Object.keys(config.SETTINGS)) {
    expect([key, config_part.includes("`" + key + "`")]).toEqual([key, true]);
    expect([key, new RegExp("\\b" + key + "\\b").test(skill)]).toEqual([key, true]);
  }
});
