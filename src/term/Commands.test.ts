// Commands test
// =============
// `bun test Commands.test.ts`. The pickers over the chat's foot: /model's
// searches the models as you type (Backspace too), sets the lit one's
// effort by Left and Right and its speed by Tab, and sends all three as
// one pick by Enter (Esc: none); /agent's and /profile's take no typing,
// and Tab moves in them. /help fits a narrow pane, a row a key, the setup
// commands their own group; /agents' lists have no copy buttons (a pane
// is no reply). /model's gauge steps the lit model's autocompact (Enter
// sends it, Esc drops it) and fits its width; /tab finds the chat's tab
// by the main agent's name; the dead ends (/stop, /fold, /image, /mcp
// with nothing to act on) say something. A sticky skill's name alone
// turns it on and off; with words, on, the words sent; it shows at the
// side beside the agents (under them when a name won't fit whole), on or
// off, where a click turns it on or off. The leader (Ctrl+X) greys the
// screen (a picker open closed first), and the next key runs its
// shortcut; /shortcuts lists them and the leader, to change (one a
// variable sets, said so, unchanged); the leader is never a key illi
// takes itself. A skill named mid-message is suggested as it's typed,
// filled in there, and illi told to use it as the message goes. A /word
// finds commands by what they do too, after those by name (Enter fills
// such a one in first); mid-message, names only. A use
// counted weighs half as much 100 uses on, a name faded under a tenth
// forgotten; two illis counting at once each keep theirs over the
// other's. The side shows any vendor's plan alike: each window's share
// used, its bar as full. A /word finds every setting too, by its key or
// what it does, as `/set <key>`.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import type { Match } from "../ui/Screen.ts";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-commands-");
process.env.ILLI_DIR = DIR;

const { term_chooser, term_command, term_commands, term_gauge, term_named, term_suggest, term_tally, term_tally_keep, term_tally_one } = await import("./Commands.ts");
const { term_grab, term_press, term_type } = await import("./Keys.ts");
const { term_side } = await import("./Side.ts");
const Draw = await import("../ui/Draw.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");
const { GLYPH } = await import("../ui/Theme.ts");

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
  expect(t.choose.about[0]).toBe("claude-api  1M context");
  expect(t.choose.about[4]).toBe("openai-api  1.05M context");
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

test("the leader greys the screen till the next key, which runs its shortcut; Esc, the leader again or the wheel, none; a key with none says so; a picker open, or the commands suggested, close first", () => {
  const t = term();
  term_press(t, "Ctrl+X");
  expect([t.lead, t.choose]).toEqual([true, null]);
  term_type(t, "M");
  expect([t.lead, t.choose.title]).toEqual([false, "Model"]);
  t.choose = null;
  for (const key of ["Esc", "Ctrl+X"]) {
    term_press(t, "Ctrl+X");
    expect([term_grab(t, key), t.lead, t.choose]).toEqual([true, false, null]);
  }
  term_press(t, "Ctrl+X");
  expect([term_grab(t, "WheelUp"), t.lead]).toEqual([false, false]);
  term_press(t, "Ctrl+X");
  term_type(t, "q");
  expect([t.lead, t.choose, note(t)]).toEqual([false, null, "No shortcut on q · /shortcuts lists them"]);
  term_press(t, "Ctrl+X");
  term_type(t, "sx");
  expect([t.choose.title, t.choose.find.text]).toEqual(["Settings", "x"]);
  term_press(t, "Ctrl+X");
  expect([t.lead, t.choose]).toEqual([true, null]);
  term_grab(t, "Esc");
  Screen.ed_set(t.scr.ed, "/mod");
  term_press(t, "Ctrl+X");
  expect([t.lead, term_suggest(t)]).toEqual([true, null]);
  term_type(t, "q");
  Screen.ed_set(t.scr.ed, "");
});

test("/shortcuts: the leader and each key after it; Enter changes one, Del puts illi's back or drops it (one written in capitals too), the last row adds one; the leader never a key illi takes", () => {
  const config = require("../config/Config.ts");
  const t = term();
  const at = (name: string) => {
    t.choose.at = t.choose.shown.findIndex((m: Match) => t.choose.names[m.k] === name);
  };
  const about = (name: string) => t.choose.about[t.choose.names.indexOf(name)];
  const enter = (name: string, text: string) => {
    at(name);
    term_grab(t, "Enter");
    Screen.ed_set(t.choose.find, text);
    term_grab(t, "Enter");
  };
  run(t, "/shortcuts");
  expect(t.choose.names).toEqual(["leader", "Ctrl+X a", "Ctrl+X e", "Ctrl+X h", "Ctrl+X l", "Ctrl+X m", "Ctrl+X p", "Ctrl+X s", "Ctrl+X t", "Ctrl+X y", "add one"]);
  expect([about("leader"), about("Ctrl+X m"), about("Ctrl+X y")]).toEqual(["Ctrl+X · the key before a shortcut", "/model · model, effort, speed and autocompact in one list", "Ctrl+Y · copy illi's last reply"]);
  enter("Ctrl+X m", "/settings");
  expect([config.SHORTCUTS.m, t.choose.title, lit(t), about("Ctrl+X m"), foot(t)]).toEqual(["/settings", "Shortcuts", "Ctrl+X m", "/settings · all the settings (illi's: /model)", "Enter change · Del illi's"]);
  term_grab(t, "Delete");
  expect([config.SHORTCUTS.m, about("Ctrl+X m")]).toEqual(["/model", "/model · model, effort, speed and autocompact in one list"]);
  at("Ctrl+X t");
  expect(foot(t)).toBe("Enter change · Del drop it");
  term_grab(t, "Delete");
  expect([config.SHORTCUTS.t, about("Ctrl+X t"), foot(t)]).toEqual([undefined, "none · illi's: /tab", "Enter change · Del illi's"]);
  term_grab(t, "Delete");
  expect(config.SHORTCUTS.t).toBe("/tab");
  enter("add one", "c");
  expect(t.choose.foot(-1)).toBe("a key, a space, then what it runs: c /compact");
  Screen.ed_set(t.choose.find, "c /compact");
  term_grab(t, "Enter");
  expect([config.SHORTCUTS.c, t.choose.names.includes("Ctrl+X c")]).toEqual(["/compact", true]);
  enter("leader", "ctrl+p");
  expect(t.choose.foot(-1)).toBe("leader takes a key illi doesn't take itself; Ctrl+P is one.");
  Screen.ed_set(t.choose.find, "alt+l");
  term_grab(t, "Enter");
  expect([config.LEADER, t.choose.names[1], about("leader")]).toEqual(["Alt+L", "Alt+L a", "Alt+L · the key before a shortcut (illi's: Ctrl+X)"]);
  term_press(t, "Alt+L");
  term_type(t, "c");
  expect(t.lead).toBe(false);
  expect(JSON.parse(fs.readFileSync(DIR + "/config.json", "utf8"))).toMatchObject({ shortcuts: { c: "/compact" }, leader: "alt+l" });
  run(t, "/shortcuts");
  at("leader");
  term_grab(t, "Delete");
  expect(config.LEADER).toBe("Ctrl+X");
  expect([config.config_check("shortcuts", { mm: "/model" }), config.config_check("shortcuts", "[1]"), config.config_check("leader", "x")]).toEqual([
    "shortcuts takes each key after the leader and what it runs, like {\"m\": \"/model\"}.",
    "shortcuts takes each key after the leader and what it runs, like {\"m\": \"/model\"}.",
    "leader takes Ctrl or Alt and a letter, like Ctrl+X.",
  ]);
  const letters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].flatMap((c) => ["Ctrl+" + c, "Alt+" + c]);
  const edits   = (key: string) => {
    const ed = Screen.ed_new();
    Screen.ed_set(ed, "one two three");
    ed.pos = 4;
    return Screen.ed_key(ed, key);
  };
  const own     = new Set(term_commands().flatMap(([, keys]) => keys.split(", ")).filter((k) => k !== config.LEADER));
  expect(letters.filter((k) => (own.has(k) || edits(k)) && !config.TAKEN.includes(k))).toEqual([]);
  config.config_set("shortcuts", { M: "/compact" });
  run(t, "/shortcuts");
  at("Ctrl+X m");
  expect([config.SHORTCUTS.m, foot(t)]).toEqual(["/compact", "Enter change · Del illi's"]);
  term_grab(t, "Delete");
  expect([config.SHORTCUTS.m, JSON.parse(fs.readFileSync(DIR + "/config.json", "utf8")).shortcuts]).toEqual(["/model", undefined]);
  t.choose = null;
  config.config_set("shortcuts", null);
  expect(Object.keys(config.SHORTCUTS).length).toBe(9);
});

test("/shortcuts while a variable sets them: a change, or a Del, says so and changes nothing", () => {
  const config = require("../config/Config.ts");
  const t = term();
  const why = "shortcuts is set by ILLI_SHORTCUTS, over config.json: unset it to change it here.";
  const at = (name: string) => {
    t.choose.at = t.choose.shown.findIndex((m: Match) => t.choose.names[m.k] === name);
  };
  process.env.ILLI_SHORTCUTS = '{"c": "/compact"}';
  try {
    run(t, "/shortcuts");
    at("Ctrl+X m");
    term_grab(t, "Enter");
    Screen.ed_set(t.choose.find, "/settings");
    term_grab(t, "Enter");
    expect(t.choose.foot(-1)).toBe(why);
    term_grab(t, "Esc");
    run(t, "/shortcuts");
    at("Ctrl+X t");
    term_grab(t, "Delete");
    expect([note(t), config.SHORTCUTS.m, config.SHORTCUTS.t]).toEqual([why, "/model", "/tab"]);
    expect(fs.existsSync(DIR + "/config.json") ? JSON.parse(fs.readFileSync(DIR + "/config.json", "utf8")).shortcuts : undefined).toBeUndefined();
  } finally {
    delete process.env.ILLI_SHORTCUTS;
    t.choose = null;
  }
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

test("/model's gauge: the lit model's autocompact, stepped 5 points by Shift+Right and Shift+Left (at most its cap), kept per model and sent with the pick by Enter; Esc drops them; Shift+Up and Shift+Down move the effort", () => {
  const t = term();
  t.v.use = { ...t.v.use, fill: { used: 0, cap: 600000, window: 1000000, set: "60%", own: false, most: 700000, global: "60%", sets: { "opus-5.5": "50%" } } };
  model(t);
  const gauge = () => t.choose.detail(t.choose.shown[t.choose.at].k, 76).map((l: any) => l.map((r: any) => r.x).join(""));
  expect(gauge()).toEqual(["autocompact ▕████████████░░░░░░░░▏ 60% · 600k of 1M  ⇧◂▸"]);
  ["Shift+Right", "Shift+Right", "Shift+Right"].forEach((key) => expect(term_grab(t, key)).toBe(true));
  expect(gauge()[0]).toEndWith(" 70% · 700k of 1M  ⇧◂▸");
  term_grab(t, "Up");
  expect([lit(t), gauge()[0]]).toEqual(["opus-5.5", "autocompact ▕██████████░░░░░░░░░░▏ 50% · 500k of 1M  ⇧◂▸"]);
  term_grab(t, "Shift+Up");
  expect(foot(t)).toBe("effort: ◂ high ▸ · Tab speed: standard");
  term_grab(t, "Enter");
  expect(t.v.out.map((p: any) => p.msg)).toEqual([
    { id: expect.any(String), $: "pick", to: { vendor: "claude-api", model: "opus-5.5", effort: "high", speed: "slow" } },
    { id: expect.any(String), $: "autocompact", label: "sonnet-5.5", value: "70%" },
  ]);
  model(t);
  term_grab(t, "Shift+Left");
  term_grab(t, "Esc");
  expect(t.v.out).toHaveLength(2);
});

test("the gauge fits its width: past the standard window the fill turns the warning color and a line says why; narrow, the share and tokens, then the share", () => {
  const g    = { set: "60%", tokens: 523200, most: 610400, window: 872000, standard: 272000 };
  const text = (w: number) => term_gauge(g, w).map((l: any) => l.map((r: any) => r.x).join(""));
  expect(text(96)).toEqual(["autocompact ▕████████████░░░░░░░░▏ 60% · 523k of 872k  ⇧◂▸", "past 272k your plan's usage drains faster"]);
  const cells = term_gauge(g, 96)[0].slice(2, 22);
  expect([cells[5].s.c, cells[6].s.c]).toEqual([Draw.draw_tokens().accent, Draw.draw_tokens().warning]);
  expect(text(40)).toEqual(["autocompact 60% · 523k  ⇧◂▸"]);
  expect(text(20)).toEqual(["60%"]);
  expect(term_gauge({ ...g, tokens: 200000 }, 96).map((l: any) => l.map((r: any) => r.x).join(""))).toEqual(["autocompact ▕████▌░┊░░░░░░░░░░░░░▏ 23% · 200k of 872k  ⇧◂▸"]);
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

test("a /word finds commands by what they do too, after those by name, the word lit; Enter fills such a one in, a second runs it; mid-message, names only", () => {
  const t = term();
  const found = (word: string) => {
    Screen.ed_set(t.scr.ed, word);
    const sug = term_suggest(t)!;
    return sug.found.map((m) => sug.cmds[m.k][0].split(" ")[0] + (m.hay ? "*" : ""));
  };
  expect(found("/new")[0]).toBe("/clear*");
  expect(found("/new")).not.toContain("/login*");
  expect(found("/mod")[0]).toBe("/model");
  expect(found("/ne")).not.toContain("/clear*");
  Screen.ed_set(t.scr.ed, "/new");
  term_grab(t, "Enter");
  expect([t.scr.ed.text, t.v.out]).toEqual(["/clear ", []]);
  Screen.ed_set(t.scr.ed, "see /new");
  expect(term_suggest(t)).toBeNull();
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

test("two illis counting at once each keep their uses over the other's: the file holds both, and each takes it as its counts; one that can't write leaves nothing beside it", () => {
  const [one, two] = [{ file: DIR + "/both.json", count: null }, { file: DIR + "/both.json", count: null }] as any[];
  term_tally_one(one, "/model");
  term_tally_one(two, "/agent");
  term_tally_keep(one);
  term_tally_keep(two);
  const fade = 0.5 ** (1 / 100);
  const file = () => JSON.parse(fs.readFileSync(DIR + "/both.json", "utf8"));
  expect(file()).toEqual({ "/model": Math.round(fade * 1000) / 1000, "/agent": 1 });
  term_tally_one(one, "/model");
  term_tally_keep(one);
  expect([file()["/agent"], term_tally(one)["/agent"], file()["/model"]]).toEqual([Math.round(fade * 1000) / 1000, fade, Math.round((0.993 * fade + 1) * 1000) / 1000]);
  expect(fs.readdirSync(DIR).filter((f) => f.startsWith("both.json."))).toEqual([]);
  clearTimeout(one.keep);
  clearTimeout(two.keep);
  fs.mkdirSync(DIR + "/blocked.json");
  const blocked = { file: DIR + "/blocked.json", count: null } as any;
  term_tally_one(blocked, "/model");
  term_tally_keep(blocked);
  clearTimeout(blocked.keep);
  expect([fs.statSync(DIR + "/blocked.json").isDirectory(), fs.readdirSync(DIR).filter((f) => f.startsWith("blocked.json."))]).toEqual([true, []]);
});

test("the side shows any vendor's plan alike: each window's share used, a bar as full, in the accent, the theme's error as it fills; one past its reset, none", () => {
  const t = term();
  Object.assign(t, { agents: [], profs: ["default"], since: Date.now() });
  t.v.use.plan = { brand: "Claude", tier: "max", limits: [{ window: 300, used: 23, reset: Date.now() + 7200e3 }, { window: 10080, used: 95, reset: Date.now() + 3 * 86400e3 }, { window: 1440, used: 50, reset: Date.now() - 1 }] };
  const lines = term_side(t, 30, 40).map(([line]) => line);
  const at    = lines.findIndex((l) => l[0]?.x === "Usage");
  const text  = (l: any[]) => l.map((r) => r.x).join("").trim();
  const bar   = (l: any[]) => [l[0].x.length, l[1].x.length, l[0].s.c];
  expect(lines.slice(at, at + 7).filter((_, k) => k % 2 === 1).map(text)).toEqual(["5h       23% · resets 2h", "Week     95% · resets 3d", "Day      0% · reset"]);
  const { accent, error } = Draw.draw_tokens();
  expect([0, 1, 2].map((k) => bar(lines[at + 2 + 2 * k]))).toEqual([[6, 18, accent], [23, 1, error], [0, 24, accent]]);
  expect(text(lines[at])).toBe("Usage · Claude Max");
  t.v.use.plan = null;
  expect(term_side(t, 30, 40).map(([line]) => text(line))).not.toContain("Usage");
});

test("a skill named mid-message: suggested as it's typed (skills alone, none shown till one matches, read once), filled in there by Enter, and illi told to use it as the message goes", () => {
  fs.mkdirSync(DIR + "/skills/imagegen", { recursive: true });
  fs.writeFileSync(DIR + "/skills/imagegen/SKILL.md", "---\ndescription: Make images\n---\nDraw.");
  const t = term();
  const { Custom } = require("../config/Custom.ts");
  const skills = Custom.skills;
  let reads = 0;
  Custom.skills = (...args: any[]) => (reads++, skills(...args));
  Screen.ed_set(t.scr.ed, "use the /ima");
  const sug = term_suggest(t)!;
  const once = reads;
  Screen.ed_set(t.scr.ed, "use the /imag");
  term_suggest(t);
  term_suggest(t);
  Custom.skills = skills;
  expect(reads).toBe(once);
  expect([sug.mid, sug.cmds.map(([use]: any) => use), sug.cmds[sug.found[0].k][0]]).toEqual([8, ["/customize-illi [...]", "/imagegen [...]"], "/imagegen [...]"]);
  term_grab(t, "Enter");
  expect([t.scr.ed.text, t.scr.ed.pos, t.v.out]).toEqual(["use the /imagegen ", 18, []]);
  Screen.ed_set(t.scr.ed, "see /usr");
  expect(term_suggest(t)).toBeNull();
  Screen.ed_set(t.scr.ed, "/ima");
  expect(term_suggest(t)!.mid).toBeNull();
  expect(term_named("Use the /imagegen skill, then /model and /usr/bin.")).toBe("Use the /imagegen skill, then /model and /usr/bin.\n\nUse your skill imagegen.");
  expect(term_named("no skill here, /nope")).toBe("no skill here, /nope");
  fs.rmSync(DIR + "/skills/imagegen", { recursive: true });
});

test("a sticky skill: its name alone turns it on, again off, each said; with words, on, then the words sent; at the side beside the agents (under them when narrow), on or off, a click turning it on or off in place; gone once no skill is sticky", () => {
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
  const side = (w = 30) => term_side(t, w, 40).map(([line, run, aside]) => [line.map((r) => r.x).join("").trim(), run, aside] as const).filter(([text]) => text !== "");
  expect(side(15).slice(0, 4).map(([text]) => text)).toEqual(["Agents", GLYPH.here + " " + View.MAIN, "Sticky skills", GLYPH.here + " terse"]);
  expect(side(16).slice(0, 2).map(([text]) => text)).toEqual(["Agents   Sticky", GLYPH.here + " " + View.MAIN + "   " + GLYPH.here + " terse"]);
  const on   = side();
  expect(on.slice(0, 2).map(([text]) => text)).toEqual(["Agents   Sticky skills", GLYPH.here + " " + View.MAIN + "   " + GLYPH.here + " terse"]);
  expect(on[1][2]!.col).toBe(9);
  on[1][2]!.run!();
  expect([config.STICKY, note(t)]).toEqual([[], "terse is off."]);
  const off = side();
  expect(off[1][0]).toBe(GLYPH.here + " " + View.MAIN + "   " + GLYPH.tab + " terse");
  off[1][2]!.run!();
  expect([config.STICKY, note(t)]).toEqual([["terse"], "terse is on: every reply follows it (global). A click on it again turns it off."]);
  fs.rmSync(DIR + "/skills/terse", { recursive: true });
  term_command(t, "/set sticky default");
  expect(side().map(([text]) => text)).toEqual(expect.not.arrayContaining([expect.stringContaining("Sticky")]));
});

test("/ finds every setting once a word is typed, by its key or what it does: /set <key>, its value now; Enter opens /settings at it, Tab fills it in for a value", () => {
  const t = term();
  const found = (word: string) => {
    Screen.ed_set(t.scr.ed, word);
    const sug = term_suggest(t)!;
    return sug.found.map((m) => sug.cmds[m.k][0] + (m.hay ? "*" : ""));
  };
  expect(found("/").some((use) => use.startsWith("/set side"))).toBe(false);
  expect(found("/sid")[0]).toBe("/set side [value]");
  expect(found("/mode").slice(0, 2)).toEqual(["/mode [mode]", "/model [name]"]);
  term_command(t, "/mcp");
  t.pane = null;
  const m = found("/m");
  const first = m.findIndex((use) => use.startsWith("/set "));
  expect([m[0], m.slice(first).every((use) => use.startsWith("/set ")), m.slice(0, first).some((use) => use.startsWith("/set "))]).toEqual(["/mcp", true, false]);
  expect(found("/panel")).toEqual(expect.arrayContaining(["/set side [value]*", "/set side_width [value]*"]));
  expect(term_suggest(t)!.cmds.find(([use]) => use === "/set side_width [value]")![2]).toBe("the side panel's width (now 25%)");
  Screen.ed_set(t.scr.ed, "/sid");
  term_grab(t, "Tab");
  expect(t.scr.ed.text).toBe("/set side ");
  Screen.ed_set(t.scr.ed, "/sid");
  term_grab(t, "Enter");
  expect([t.choose.title, t.choose.names[t.choose.at]]).toEqual(["Settings", "side"]);
  expect(term_commands(true).some(([use]) => use.startsWith("/side"))).toBe(false);
});

test("each command and key is in docs/keys.md", () => {
  const doc = fs.readFileSync(import.meta.dir + "/../../docs/keys.md", "utf8");
  for (const [use, keys] of term_commands()) {
    for (const said of [use === "" ? [] : ["`" + use.replace("|", "\\|") + "`"], keys === "" ? [] : keys.split(", ")].flat()) {
      expect(doc).toContain(said);
    }
  }
});
