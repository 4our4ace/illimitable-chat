// Commands test
// =============
// `bun test Commands.test.ts`. The pickers over the chat's foot: /model's
// searches the models as you type (Backspace too), sets the lit one's
// effort by Left and Right and its speed by Tab, and sends all three as
// one pick by Enter (Esc: none); /agent's and /profile's take no typing,
// and Tab moves in them. /help fits a narrow pane, a row a key, the setup
// commands their own group; /agents' lists have no copy buttons (a pane
// is no reply). /speed says standard for slow; /tab finds the chat's tab
// by the main agent's name; the dead ends (/stop, /fold, /image, /mcp
// with nothing to act on) say something.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import type { Match } from "../ui/Screen.ts";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-commands-");
process.env.ILLI_DIR = DIR;

const { term_chooser, term_commands } = await import("./Commands.ts");
const { term_grab, term_type } = await import("./Keys.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal with no screen, its chat on sonnet at medium effort, two
// vendors offered; a paint always due, so none is asked for
const term = () => {
  const v = View.view_new();
  View.view_hear(v, { $: "state", ...v, vendors: ["claude-api", "openai-api"], pick: { vendor: "claude-api", model: "sonnet-5.5", effort: "medium", speed: "slow" } });
  return { v, scr: { tty: true, ed: Screen.ed_new() }, choose: null, pane: null, sug: null, ver: 0, scroll: 0, notices: [], due: true } as any;
};

// /model typed with no name
const model = (t: any) => term_commands().find(([use]) => use.startsWith("/model "))![3](t, "");

// a command typed, by its name, with its argument; the last note
const run  = (t: any, name: string, arg = "") => term_commands().find(([use]) => use.split(" ")[0] === name)![3](t, arg);
const note = (t: any) => t.notices.at(-1)?.text ?? "";

// the names shown, the lit one, what the foot says of it
const shown = (t: any) => t.choose.shown.map((m: Match) => t.choose.names[m.k]);
const lit   = (t: any) => t.choose.names[t.choose.shown[t.choose.at].k];
const foot  = (t: any) => t.choose.foot(t.choose.shown[t.choose.at].k);

test("the model picker lists each vendor's models, at the pick's", () => {
  const t = term();
  model(t);
  expect(t.choose.names).toEqual(["opus-5.5", "sonnet-5.5", "haiku-5.5", "gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra"]);
  expect(t.choose.about[0]).toBe("claude-api");
  expect(t.choose.about[4]).toBe("openai-api  500k context");
  expect([t.choose.here, lit(t)]).toEqual([1, "sonnet-5.5"]);
  expect(foot(t)).toBe("effort: ◂ medium ▸ · no fast mode");
});

test("typing searches the models, Backspace takes a character off; emptied, the one lit stays lit", () => {
  const t = term();
  model(t);
  term_type(t, "so");
  term_type(t, "l");
  expect(shown(t)).toEqual(["gpt-6.1-sol"]);
  expect(term_grab(t, "Backspace")).toBe(true);
  expect(shown(t)).toEqual(["sonnet-5.5", "gpt-6.1-sol"]);
  term_grab(t, "Backspace");
  expect(shown(t)).toEqual(["sonnet-5.5", "opus-5.5", "gpt-6.1-sol", "gpt-6-astra"]);
  term_grab(t, "Down");
  term_grab(t, "Backspace");
  expect(shown(t)).toHaveLength(6);
  expect(lit(t)).toBe("opus-5.5");
  expect(t.scr.ed.text).toBe("");
  term_type(t, "xyz");
  expect(shown(t)).toEqual([]);
  term_grab(t, "Enter");
  expect(t.choose).not.toBeNull();
  expect(t.v.out).toEqual([]);
});

test("Left and Right set the lit model's effort, Tab its speed; Enter sends all three as one pick, one note", () => {
  const t = term();
  model(t);
  term_grab(t, "Up");
  expect(lit(t)).toBe("opus-5.5");
  term_grab(t, "Right");
  expect(foot(t)).toBe("effort: ◂ high ▸ · Tab speed: standard");
  term_grab(t, "Tab");
  expect(foot(t)).toBe("effort: ◂ high ▸ · Tab speed: fast");
  term_grab(t, "Down");
  term_grab(t, "Tab");
  expect(foot(t)).toBe("effort: ◂ high ▸ · no fast mode");
  ["Down", "Down", "Down"].forEach((key) => term_grab(t, key));
  expect([lit(t), foot(t)]).toEqual(["gpt-6.1-sol", "effort: ◂ high ▸ · Tab speed: fast"]);
  ["Right", "Right", "Right"].forEach((key) => term_grab(t, key));
  expect(foot(t)).toBe("effort: ◂ max · Tab speed: fast");
  term_grab(t, "Enter");
  expect(t.choose).toBeNull();
  expect(t.v.out.map((p: any) => p.msg)).toEqual([{ id: expect.any(String), $: "pick", to: { vendor: "openai-api", model: "gpt-6.1-sol", effort: "max", speed: "fast" } }]);
  expect(t.v.notes).toEqual(["Now on gpt-6.1-sol (openai-api), max effort, fast."]);
});

test("Esc closes the model picker, the pick as it was", () => {
  const t = term();
  model(t);
  term_grab(t, "Right");
  term_grab(t, "Esc");
  expect(t.choose).toBeNull();
  expect(t.v.out).toEqual([]);
});

test("a picker without a search takes no typing; Tab moves in it", () => {
  const t = term();
  const picked: number[] = [];
  term_chooser(t, "Agent", ["illi", "reviewer"], ["illi's own", "reviews"], 0, (k) => picked.push(k));
  expect(term_type(t, "r")).toBe(false);
  term_grab(t, "Tab");
  term_grab(t, "Enter");
  expect(picked).toEqual([1]);
});

test("/help fits a narrow pane: how each is typed on its own line, what it does under it", () => {
  const t = term();
  term_commands().find(([use]) => use === "/help")![3](t, "");
  for (const w of [30, 44, 100]) {
    const lines = t.pane.make(w);
    expect(Math.max(...lines.map(Paint.line_width))).toBeLessThanOrEqual(w);
    expect(lines.map((l: any) => l.map((r: any) => r.x).join("")).join("\n")).toContain("this list");
  }
  const narrow = t.pane.make(30).map((l: any) => l.map((r: any) => r.x).join("").trimEnd());
  expect(narrow).toContain("/help");
  expect(narrow).toContain("  this list");
});

test("/agents' pane has no copy buttons: a pane is no reply", () => {
  const t = term();
  t.agents = [];
  term_commands().find(([use]) => use === "/agents")![3](t, "");
  expect(t.pane.make(80).flat().filter((r: any) => r.copy !== undefined)).toEqual([]);
});

test("/help: Ctrl+C and Ctrl+D a row each, the setup commands in a group of their own", () => {
  const t = term();
  run(t, "/help");
  const text = t.pane.make(120).map((l: any) => l.map((r: any) => r.x).join("").trimEnd());
  expect(text.filter((l: string) => /^Ctrl\+[CD] /.test(l))).toHaveLength(2);
  const setup = text.indexOf("Setup");
  expect(setup).toBeGreaterThan(text.indexOf("Agents"));
  expect(text.slice(setup).find((l: string) => l.startsWith("/login"))).toBeDefined();
  expect(text.join("\n")).not.toMatch(/zoom|token|view's lines/);
});

test("/speed lists slow as standard, and takes standard for it", () => {
  const t = term();
  t.v.pick = { vendor: "claude-api", model: "opus-5.5", effort: "medium", speed: "fast" };
  run(t, "/speed");
  expect(note(t)).toBe("Speeds: standard, fast (now). Pick one with /speed <speed>.");
  run(t, "/speed", "standard");
  expect(t.v.out.map((p: any) => p.msg.to.speed)).toEqual(["slow"]);
});

test("/tab finds the chat's tab by the main agent's name, or illi's; none lists the tabs", () => {
  const t = term();
  t.v.agent = "build";
  for (const name of ["build", "illi"]) {
    t.v.page = { name: "scout", log: [], live: [] };
    run(t, "/tab", name);
    expect(t.v.page).toBeNull();
  }
  run(t, "/tab");
  expect(note(t)).toMatch(/^Tabs: /);
});

test("the dead ends say something: /stop with nothing running, /fold on an agent's tab, /image with no path, /mcp with no servers", () => {
  const t = term();
  run(t, "/stop");
  expect([note(t), t.v.out]).toEqual(["Nothing is running.", []]);
  t.v.page = { name: "scout", log: [], live: [] };
  run(t, "/fold");
  expect([note(t), t.v.fold]).toEqual(["Only the chat folds: Ctrl+PgUp goes back to it.", null]);
  run(t, "/image");
  expect(note(t)).toBe("Which image? /image <path>, or paste or drop the file.");
  run(t, "/mcp");
  expect(t.pane.make(200).map((l: any) => l.map((r: any) => r.x).join("")).join("\n")).toMatch(/^No MCP servers yet\. Add them to .*mcp\.json/);
});
