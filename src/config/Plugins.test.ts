// Plugins test
// ============
// `bun test Plugins.test.ts`. The user's plugins load in order: the
// global ones, then the profile's (one of the same name over the
// global's), by name; one turned off and one in an untrusted project
// never load, a trusted project's do; one that fails to load leaves
// nothing it gave, said once. What happened is told to the hooks in
// order, one queue; a tool's call is checked by each tool.before hook
// in turn (its input changed, the first refusal final, a hook that
// fails refusing it) and its output changed by tool.after. Their
// tools, commands, side lines and pieces of the bottom line are given;
// a maker that fails is dropped, said once. The types for authors name
// every hook and member, and the sample plugin loads. The run's context,
// a message's check and a turn's end take each hook's say, whose; a
// later hook's change to a call takes an earlier allow back; the quit is
// told once, with why, and waited for.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR  = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + "/illi-plugins-"));
const ROOT = DIR + "/illi";
const OWN  = ROOT + "/profiles/work";
const REPO = DIR + "/repo";
fs.mkdirSync(ROOT + "/plugins", { recursive: true });
fs.mkdirSync(OWN + "/plugins/c", { recursive: true });
fs.mkdirSync(REPO + "/.illi/plugins", { recursive: true });
process.env.ILLI_DIR     = ROOT;
process.env.ILLI_PROFILE = "work";
process.env.ILLI_OFF     = "skipped";

// what the plugins saw, in order
const seen: string[] = [];
(globalThis as any).seen = seen;

// a plugin's file: its function's body, `illi` the API, `seen` the
// list; a .js one without TypeScript's types
const plugin = (file: string, body: string) => {
  const head = "export default async function (illi: any) {\n  const seen = (globalThis as any).seen;\n" + body + "\n}\n";
  fs.writeFileSync(file, file.endsWith(".js") ? head.replace(/: any| as any|: string/g, "") : head);
};

plugin(ROOT + "/plugins/a.ts", `
  seen.push("a:load " + illi.api + " " + illi.name);
  (globalThis as any).keys = Object.keys(illi);
  illi.on("turn.start", async () => { await new Promise((r) => setTimeout(r, 20)); seen.push("a:turn.start"); });
  illi.on("message", (ev: any) => { seen.push("a:message " + ev.text); });
  illi.on("tool.before", (call: any) => call.tool === "shell" ? { input: { command: call.input.command + " --color" } } : undefined);
  illi.on("tool.after", (call: any) => call.tool === "read" ? { text: call.output.text.toUpperCase() } : undefined);
  illi.command("hello", "says hello", (args: string) => "hello " + args);
`);
plugin(ROOT + "/plugins/b.js", `
  illi.on("turn.start", () => { seen.push("b:turn.start"); });
  illi.on("tool.before", (call: any) => /forbidden/.test(call.input.command ?? "") ? { block: "Not that." } : undefined);
  illi.side(() => ["B", [{ text: "ok", tone: "success" }, { text: " x", tone: "nope" }]]);
`);
plugin(ROOT + "/plugins/skipped.ts", `seen.push("skipped:load");`);
plugin(ROOT + "/plugins/broken.ts", `
  illi.on("turn.start", () => { seen.push("broken:turn.start"); });
  illi.theme({ accent: "#ff0000" });
  throw new Error("boom");
`);
plugin(ROOT + "/plugins/dup.ts", `seen.push("dup:global");`);
plugin(OWN + "/plugins/dup.ts", `
  seen.push("dup:profile");
  illi.on("tool.before", (call: any) => { if (call.tool === "explode") throw new Error("kaboom"); seen.push("dup:saw " + JSON.stringify(call.input)); });
  illi.side(() => { throw new Error("no lines"); });
`);
plugin(OWN + "/plugins/c/index.ts", `
  illi.on("turn.start", () => { seen.push("c:turn.start"); });
  illi.tool({ name: "echo", description: "echoes x", schema: { type: "object", properties: { x: { type: "number" } } }, run: (input: any) => "echo " + input.x });
  illi.status(() => ({ text: "c", tone: "accent" }));
  illi.status(() => "");
`);
plugin(REPO + "/.illi/plugins/project.ts", `seen.push("project:load");`);

const { Plugins } = await import("./Plugins.ts");
const Theme = await import("../ui/Theme.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// the notes the plugins said, once the screen is up
const notes: string[] = [];
const screen = { note: (text: string) => notes.push(text), send: () => {}, redraw: () => {} };

test("global plugins, then the profile's (one over the global's of its name), by name; off, broken and an untrusted project's left out", async () => {
  await Plugins.load(REPO, () => false);
  expect(Plugins.found().map((p) => [p.name, p.off, p.runs])).toEqual([["a", false, true], ["b", false, true], ["broken", false, false], ["skipped", true, false], ["c", false, true], ["dup", false, true]]);
  expect(seen).toEqual(["a:load 1 a", "dup:profile"]);
  expect(Plugins.found()[4].file).toBe(OWN + "/plugins/c/index.ts");
  Plugins.attach(screen);
  expect(notes).toEqual(["The plugin broken didn't load: boom (illi.log has more)."]);
  expect(Theme.theme_tokens().accent).toBe("");
});

test("what happened is told in order: the plugins' order, each hook done before the next, one queue across emits", async () => {
  seen.length = 0;
  void Plugins.emit("turn.start", { cwd: REPO });
  await Plugins.emit("message", { id: 1, kind: "user", text: "hi", agent: null });
  expect(seen).toEqual(["a:turn.start", "b:turn.start", "c:turn.start", "a:message hi"]);
});

test("a tool's call: its input as each tool.before hook changes it; the first refusal final; a hook that fails refuses it", async () => {
  seen.length = 0;
  expect(await Plugins.before_tool({ tool: "shell", input: { command: "ls" }, agent: null, cwd: REPO })).toEqual({ input: { command: "ls --color" } });
  expect(seen).toEqual(['dup:saw {"command":"ls --color"}']);
  seen.length = 0;
  expect(await Plugins.before_tool({ tool: "shell", input: { command: "forbidden" }, agent: "reviewer", cwd: REPO })).toEqual({ block: "Not that." });
  expect(seen).toEqual([]);
  expect(await Plugins.before_tool({ tool: "explode", input: {}, agent: null, cwd: REPO })).toEqual({ block: "The plugin dup couldn't check this call (kaboom), so it was refused." });
  const stop = new AbortController();
  stop.abort();
  expect(await Plugins.before_tool({ tool: "explode", input: {}, agent: null, cwd: REPO, signal: stop.signal })).toEqual({ block: "Stopped." });
});

test("a tool's output as each tool.after hook changes it, what else it holds kept", async () => {
  const out = { text: "abc", fail: false, imgs: [{ data: "x", type: "image/png" }] };
  expect(await Plugins.after_tool({ tool: "read", input: {}, agent: null, cwd: REPO }, out)).toEqual({ ...out, text: "ABC" });
  expect(await Plugins.after_tool({ tool: "shell", input: {}, agent: null, cwd: REPO }, out)).toBe(out);
});

test("a plugin's tools, offered by their names, run; one not there fails saying so", async () => {
  expect(Plugins.tools()).toEqual([{ name: "plugin__c__echo", info: "echoes x", schema: { type: "object", properties: { x: { type: "number" } } } }]);
  expect(await Plugins.run({ tool: "plugin__c__echo", input: { x: 3 }, agent: null, cwd: REPO })).toEqual({ text: "echo 3", fail: false });
  expect(await Plugins.run({ tool: "plugin__c__nope", input: {}, agent: null, cwd: REPO })).toEqual({ text: "No tool plugin__c__nope.", fail: true });
});

test("commands, side lines and the bottom line's pieces; a maker that fails is dropped, said once", async () => {
  const [hello] = Plugins.commands();
  expect([hello.name, hello.about, hello.plugin, await hello.run("world")]).toEqual(["hello", "says hello", "a", "hello world"]);
  expect(Plugins.side(30)).toEqual([[[{ text: "B" }], [{ text: "ok", tone: "success", bold: false, dim: false }, { text: " x", bold: false, dim: false }]]]);
  expect(notes.at(-1)).toBe("The plugin dup failed in side: no lines (illi.log has more).");
  Plugins.side(30);
  expect(notes.filter((n) => n.includes("no lines")).length).toBe(1);
  expect(Plugins.status()).toEqual([[{ text: "c", tone: "accent", bold: false, dim: false }]]);
});

test("the API's types for authors (examples/plugins/illi.d.ts) name every hook and member a plugin is given", () => {
  const types = fs.readFileSync(import.meta.dir + "/../../examples/plugins/illi.d.ts", "utf8");
  const { HOOKS } = require("./Plugins.ts");
  for (const name of [...HOOKS.map((h: string) => '"' + h + '"'), ...(globalThis as any).keys.map((k: string) => "  " + k)]) {
    expect([name, types.includes(name)]).toEqual([name, true]);
  }
});

test("the sample plugin loads and gives what it says: a check, side lines, a command", async () => {
  Plugins.reset();
  fs.copyFileSync(import.meta.dir + "/../../examples/plugins/guard.ts", ROOT + "/plugins/guard.ts");
  fs.copyFileSync(import.meta.dir + "/../../examples/plugins/illi.d.ts", ROOT + "/plugins/illi.d.ts");
  await Plugins.load(REPO, () => false);
  expect(Plugins.found().find((p) => p.name === "guard")?.runs).toBe(true);
  expect(Plugins.found().some((p) => p.name.startsWith("illi"))).toBe(false);
  expect(await Plugins.before_tool({ tool: "shell", input: { command: "rm -rf build" }, agent: null, cwd: REPO })).toEqual({ block: "rm -rf is refused here: move what should go to a trash folder instead." });
  expect(Plugins.commands().map((c) => c.name)).toContain("turns");
  fs.rmSync(ROOT + "/plugins/guard.ts");
});

test("a trusted project's plugins load after the rest; an unknown hook refuses to load", async () => {
  Plugins.reset();
  seen.length = 0;
  plugin(REPO + "/.illi/plugins/wrong.ts", `illi.on("turn.middle", () => {});`);
  await Plugins.load(REPO, (cwd) => cwd === REPO);
  expect(Plugins.found().map((p) => p.name)).toEqual(["a", "b", "broken", "skipped", "c", "dup", "project", "wrong"]);
  expect(seen).toContain("project:load");
  expect(Plugins.found().find((p) => p.name === "wrong")!.runs).toBe(false);
});

test("context, a message's check, a turn's end and a quit: each hook's say, whose; an allow taken back by a later hook's change; the quit told once, with why, waited for", async () => {
  Plugins.reset();
  const quits: string[] = [];
  Plugins.own("one", "", "the plugin one", [
    { hook: "context", run: () => ({ context: "on main" }) },
    { hook: "message.before", run: (ev: any) => (ev.text === "no" ? { block: "" } : { context: "it's Friday" }) },
    { hook: "turn.stop", run: (ev: any) => (ev.again ? undefined : { continue: "  " }) },
    { hook: "tool.before", run: (call: any) => ({ allow: true, context: "one saw " + call.input.command }) },
    { hook: "quit", run: async (ev: any) => (await new Promise((done) => setTimeout(done, 50)), quits.push(ev.reason)) },
  ]);
  Plugins.own("two", "", "the plugin two", [
    { hook: "context", run: () => undefined },
    { hook: "tool.before", run: (call: any) => (call.input.command === "make" ? { input: { command: "make all" } } : undefined) },
  ]);
  expect(await Plugins.context({ cwd: REPO })).toEqual(["From the plugin one:\non main"]);
  expect(await Plugins.before_message({ text: "no", cwd: REPO })).toEqual({ block: "The plugin one kept your message back." });
  expect(await Plugins.before_message({ text: "hi", cwd: REPO })).toEqual({ context: ["From the plugin one:\nit's Friday"] });
  expect(await Plugins.before_stop({ cwd: REPO, again: false, reply: "done" })).toBe("From the plugin one:\nGo on.");
  expect(await Plugins.before_stop({ cwd: REPO, again: true, reply: "done" })).toBeNull();
  expect(await Plugins.before_tool({ tool: "shell", input: { command: "ls" }, agent: null, cwd: REPO })).toEqual({ input: { command: "ls" }, allow: true, context: ["From the plugin one:\none saw ls"] });
  expect(await Plugins.before_tool({ tool: "shell", input: { command: "make" }, agent: null, cwd: REPO })).toEqual({ input: { command: "make all" }, context: ["From the plugin one:\none saw make"] });
  await Plugins.quit(REPO, "prompt_input_exit");
  expect(quits).toEqual(["prompt_input_exit"]);
  await Plugins.quit(REPO, "other");
  expect(quits).toEqual(["prompt_input_exit"]);
});
