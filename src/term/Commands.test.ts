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
// with nothing to act on) say something. A sticky skill's name alone
// turns it on and off; with words, on, the words sent; while on, it shows
// at the side, where a click turns it off. The leader (Ctrl+X), then a
// key, runs that key's shortcut, from a list of them all; the shortcuts
// and the leader are settings, and the leader is never a key illi takes
// itself. A use counted weighs half as
// much 100 uses on, a name faded under a tenth forgotten. The side shows
// any vendor's plan alike: each window's share used, its bar as full.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import type { Match } from "../ui/Screen.ts";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-commands-");
process.env.ILLI_DIR = DIR;

const { term_chooser, term_command, term_commands, term_suggest, term_tally, term_tally_one } = await import("./Commands.ts");
const { term_grab, term_press, term_type } = await import("./Keys.ts");
const { term_side } = await import("./Side.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal with no screen, its chat on sonnet at medium effort, two
// vendors offered; a paint always due, so none is asked for
const term = () => {
  const v = View.view_new();
  View.view_hear(v, { $: "state", ...v, vendors: ["claude-api", "openai-api"], pick: { vendor: "claude-api", model: "sonnet-5.5", effort: "medium", speed: "slow" } });
  return { v, scr: { tty: true, ed: Screen.ed_new() }, choose: null, pane: null, sug: null, ver: 0, scroll: 0, notices: [], subs: new Map(), seen: { tall: 20 }, due: true } as any;
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
  expect(shown(t)).toEqual(["sonnet-5.5", "gpt-6.1-sol", "opus-5.5", "gpt-6-astra"]);
  term_grab(t, "Down");
  term_grab(t, "Backspace");
  expect(shown(t)).toHaveLength(6);
  expect(lit(t)).toBe("gpt-6.1-sol");
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

test("the leader, then a key: its shortcut, from a list of them all (again: closed; a key with none says so, the list kept)", () => {
  const t = term();
  term_press(t, "Ctrl+X");
  expect([t.choose.title, t.choose.names]).toEqual(["Shortcuts", ["a", "e", "h", "l", "m", "p", "s", "t", "y"]]);
  expect([t.choose.about[t.choose.names.indexOf("m")], t.choose.about[t.choose.names.indexOf("y")]]).toEqual(["/model · model, effort and speed in one list", "Ctrl+Y · copy illi's last reply"]);
  term_type(t, "q");
  expect([t.choose.title, foot(t)]).toEqual(["Shortcuts", "No shortcut on q · Esc closes"]);
  term_press(t, "Ctrl+X");
  expect(t.choose).toBeNull();
  term_press(t, "Ctrl+X");
  term_type(t, "S");
  expect(t.choose.title).toBe("Settings");
  term_press(t, "Ctrl+X");
  expect(t.choose.title).toBe("Shortcuts");
  for (let k = 0; k < 6; k++) {
    term_grab(t, "Down");
  }
  expect(lit(t)).toBe("s");
  term_grab(t, "Enter");
  expect(t.choose.title).toBe("Settings");
});

test("the shortcuts and the leader are settings: a key changed, added or dropped, a key's name run as pressed; the leader never a key illi takes", () => {
  const config = require("../config/Config.ts");
  const t = term();
  config.config_set("shortcuts", { m: "", x: "/settings", "?": "Ctrl+P", w: "/nope" });
  config.config_set("leader", "alt+l");
  term_press(t, "Ctrl+X");
  expect(t.choose).toBeNull();
  term_press(t, "Alt+L");
  expect(t.choose.names).toEqual(["?", "a", "e", "h", "l", "p", "s", "t", "w", "x", "y"]);
  term_type(t, "x");
  expect(t.choose.title).toBe("Settings");
  term_press(t, "Alt+L");
  term_type(t, "?");
  expect(t.choose.title).toBe("Commands");
  t.choose = null;
  term_press(t, "Alt+L");
  term_type(t, "w");
  expect([t.choose, note(t)]).toEqual([null, "/nope is no command or key of illi's: the shortcuts setting names it."]);
  expect([config.config_check("shortcuts", { mm: "/model" }), config.config_check("shortcuts", "[1]"), config.config_check("leader", "ctrl+p"), config.config_check("leader", "x")]).toEqual([
    "shortcuts takes each key after the leader and what it runs, like {\"m\": \"/model\"}.",
    "shortcuts takes each key after the leader and what it runs, like {\"m\": \"/model\"}.",
    "leader takes a key illi doesn't take itself; Ctrl+P is one.",
    "leader takes Ctrl or Alt and a letter, like Ctrl+X.",
  ]);
  const letters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].flatMap((c) => ["Ctrl+" + c, "Alt+" + c]);
  const edits   = (key: string) => {
    const ed = Screen.ed_new();
    Screen.ed_set(ed, "one two three");
    ed.at = 4;
    return Screen.ed_key(ed, key);
  };
  const own     = new Set(term_commands().flatMap(([, keys]) => keys.split(", ")).filter((k) => k !== config.LEADER));
  expect(letters.filter((k) => (own.has(k) || edits(k)) && !config.TAKEN.includes(k))).toEqual([]);
  config.config_set("shortcuts", null);
  config.config_set("leader", null);
  expect([config.LEADER, Object.keys(config.SHORTCUTS).length]).toEqual(["Ctrl+X", 9]);
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

test("a pane: Esc and Enter close it, no editing key reaches the input under it, typing closes it and goes to the input", () => {
  const t = term();
  Screen.ed_set(t.scr.ed, "draft");
  for (const key of ["Esc", "Enter"]) {
    run(t, "/help");
    expect(term_grab(t, "Backspace")).toBe(true);
    term_grab(t, key);
    expect([t.pane, t.scr.ed.text]).toEqual([null, "draft"]);
  }
  run(t, "/help");
  expect(term_type(t, "x")).toBe(false);
  expect(t.pane).toBeNull();
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

test("the commands suggested: those run most first among those a word matches alike; the counts kept in the root", async () => {
  const t = term();
  const top = (word: string) => {
    Screen.ed_set(t.scr.ed, word);
    const sug = term_suggest(t)!;
    return sug.cmds[sug.found[0].k][0].split(" ")[0];
  };
  expect(top("/set")).toBe("/set");
  term_command(t, "/settings");
  t.choose = null;
  expect(top("/sett")).toBe("/settings");
  expect(top("/set")).toBe("/settings");
  await Bun.sleep(2100);
  expect(JSON.parse(fs.readFileSync(DIR + "/used.json", "utf8"))).toEqual({ "/settings": 1 });
});

test("a use weighs half as much 100 uses on; a name faded under a tenth, or no number, is forgotten; the file kept to a thousandth", async () => {
  const tally = { file: DIR + "/faded.json", count: { "/broken": "x" } } as any;
  term_tally_one(tally, "/old");
  expect(term_tally(tally)).toEqual({ "/old": 1 });
  const uses = (n: number) => Array.from({ length: n }, () => term_tally_one(tally, "/new"));
  uses(100);
  expect(term_tally(tally)["/old"]).toBeCloseTo(0.5, 9);
  uses(232);
  expect(term_tally(tally)["/old"]).toBeGreaterThan(0.1);
  uses(1);
  expect(Object.keys(term_tally(tally))).toEqual(["/new"]);
  uses(5000);
  expect(term_tally(tally)["/new"]).toBeLessThan(1 / (1 - 0.5 ** (1 / 100)));
  await Bun.sleep(2100);
  expect(JSON.parse(fs.readFileSync(DIR + "/faded.json", "utf8"))).toEqual({ "/new": Math.round(term_tally(tally)["/new"] * 1000) / 1000 });
});

test("the side shows any vendor's plan alike: each window's share used, a bar as full, yellow and red as it fills; one past its reset, none", () => {
  const t = term();
  Object.assign(t, { agents: [], profs: ["default"], since: Date.now() });
  t.v.use.plan = { brand: "Claude", tier: "max", limits: [{ window: 300, used: 23, reset: Date.now() + 7200e3 }, { window: 10080, used: 95, reset: Date.now() + 3 * 86400e3 }, { window: 1440, used: 50, reset: Date.now() - 1 }] };
  const lines = term_side(t, 30, 40).map(([line]) => line);
  const at    = lines.findIndex((l) => l[0]?.x === "Usage");
  const text  = (l: any[]) => l.map((r) => r.x).join("").trim();
  const bar   = (l: any[]) => [l[0].x.length, l[1].x.length, l[0].s.c];
  expect(lines.slice(at, at + 7).filter((_, k) => k % 2 === 1).map(text)).toEqual(["5h       23% · resets 2h", "Week     95% · resets 3d", "Day      0% · reset"]);
  expect([0, 1, 2].map((k) => bar(lines[at + 2 + 2 * k]))).toEqual([[6, 18, "4"], [23, 1, "1"], [0, 24, "4"]]);
  expect(text(lines[at])).toBe("Usage · Claude Max");
  t.v.use.plan = null;
  expect(term_side(t, 30, 40).map(([line]) => text(line))).not.toContain("Usage");
});

test("a sticky skill: its name alone turns it on, again off, each said; with words, on, then the words sent; on, at the side, where a click turns it off", () => {
  fs.mkdirSync(DIR + "/skills/terse", { recursive: true });
  fs.writeFileSync(DIR + "/skills/terse/SKILL.md", "---\ndescription: Short replies\nsticky: true\n---\nBe terse.");
  const config = require("../config/Config.ts");
  const t = term();
  term_command(t, "/terse");
  expect([config.STICKY, note(t)]).toEqual([["terse"], "terse is on: every reply follows it (global). /terse again turns it off."]);
  expect(term_commands(true).find(([use]) => use.startsWith("/terse"))![2]).toBe("sticky skill, on: Short replies");
  term_command(t, "/terse");
  expect([config.STICKY, note(t), t.v.out]).toEqual([[], "terse is off.", []]);
  term_command(t, "/terse just the gist");
  expect([config.STICKY, t.v.out.map((p: any) => p.msg.$)]).toEqual([["terse"], ["say"]]);
  term_command(t, "/terse and again");
  expect(config.STICKY).toEqual(["terse"]);
  Object.assign(t, { agents: [], profs: ["default"], since: Date.now() });
  const side = () => term_side(t, 30, 40).map(([line, run]) => [line.map((r) => r.x).join("").trim(), run] as const).filter(([text]) => text !== "");
  const on   = side();
  const at   = on.findIndex(([text]) => text === "Sticky skills");
  expect(on[at + 1][0]).toEndWith(" terse");
  on[at + 1][1]!();
  expect([config.STICKY, note(t)]).toEqual([[], "terse is off."]);
  expect(side().map(([text]) => text)).not.toContain("Sticky skills");
  fs.rmSync(DIR + "/skills/terse", { recursive: true });
});

test("each command and key is in docs/keys.md", () => {
  const doc = fs.readFileSync(import.meta.dir + "/../../docs/keys.md", "utf8");
  for (const [use, keys] of term_commands()) {
    for (const said of [use === "" ? [] : ["`" + use.replace("|", "\\|") + "`"], keys === "" ? [] : keys.split(", ")].flat()) {
      expect(doc).toContain(said);
    }
  }
});
