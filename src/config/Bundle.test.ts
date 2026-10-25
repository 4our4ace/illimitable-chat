// Bundle test
// ===========
// `bun test Bundle.test.ts`. A plugin's folder read as a bundle, in
// Claude Code's layout: its skills, commands, agents, hooks, MCP servers
// and illi code; its manifest moving parts (commands and agents
// replaced, skills added, hooks and servers merged after the default
// file, inline too); a part linked out of the folder dropped, said; an
// index beside other parts not loaded; what illi doesn't use listed. A
// folder of nothing is no plugin; a marketplace or a name illi can't
// take is said. Loaded (Plugins.load), a plugin's parts go under the
// user's by name, a later plugin's over an earlier's, the one hidden
// listed as plugin:name, which names a winner too; its bodies get its
// folder; a Claude Code agent's tools and model are read as illi's
// (Claude Code's own tools kept as named, for claude-code).
// Its hooks run before the user's, its file's disableAllHooks ignored,
// its folder and the project's in their environment, a Bash matcher
// taking illi's shell, its own MCP servers' names as illi gives them;
// one naming only Claude Code's other tools is said. Its MCP servers go
// under the user's, its variables filled in; a trusted project's
// mcp.json is read. / takes the user's commands and skills before the
// plugins', a plugin's winner answering to plugin:name too. What is
// seen is said once, till it changes.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const DIR  = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + "/illi-bundle-"));
const ROOT = DIR + "/illi";
const REPO = DIR + "/repo";
const KIT  = ROOT + "/plugins/kit";
process.env.ILLI_DIR = ROOT;
process.env.ILLI_OFF = "kit:lint";

// a file written, its folder made
const put = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const json = (file: string, data: object) => put(file, JSON.stringify(data));

// a Claude Code plugin, as one is copied in: its manifest moving parts
json(KIT + "/.claude-plugin/plugin.json", {
  name: "kit", description: "Reviews and ships", version: "1.2.0",
  skills: "./more", agents: ["./agents/reviewer.md"], outputStyles: "./styles", mcpServers: "./extra.json",
  hooks: { PostToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: "echo inline" }] }] },
});
put(KIT + "/commands/review.md", "---\ndescription: Reviews\n---\nReview $1 then $2 in ${CLAUDE_PLUGIN_ROOT}.\n@notes.md and !`git status`");
put(KIT + "/commands/ship.md", "Ship as the kit does.");
put(KIT + "/skills/check/SKILL.md", "---\ndescription: Checks\ndisable-model-invocation: true\n---\nCheck in ${CLAUDE_SKILL_DIR}.");
put(KIT + "/more/lint/SKILL.md", "---\ndescription: Lints\n---\nLint.");
put(KIT + "/agents/reviewer.md", "---\ndescription: Reviews code\ntools: Read, Grep, Bash, mcp__plugin_kit_docs__search\nmodel: sonnet\n---\nYou review.");
put(KIT + "/agents/scout.md", "---\ndescription: Not listed\n---\nNo.");
json(KIT + "/hooks/hooks.json", { disableAllHooks: true, hooks: {
  PreToolUse: [
    { matcher: "Bash", hooks: [{ type: "command", command: "echo \"$CLAUDE_PLUGIN_ROOT|$CLAUDE_PLUGIN_DATA|$CLAUDE_PROJECT_DIR\"" }] },
    { matcher: "mcp__plugin_kit_docs__.*", hooks: [{ type: "command", command: "echo docs" }] },
  ],
} });
json(KIT + "/.mcp.json", { docs: { command: "${CLAUDE_PLUGIN_ROOT}/server", args: ["${CLAUDE_PLUGIN_DATA}", "${HOME_NOT_SET:-plain}"] } });
json(KIT + "/extra.json", { mcpServers: { github: { url: "https://example.com/kit" } } });
put(KIT + "/index.js", "throw new Error('an MCP server, never imported');");
put(KIT + "/settings.json", "{}");
put(DIR + "/outside/SKILL.md", "---\ndescription: Out\n---\nOut.");
fs.symlinkSync(DIR + "/outside", KIT + "/skills/out");

// illi's own plugin of code and a command, loading after kit
put(ROOT + "/plugins/tool/illi.ts", "export default function () { (globalThis as any).tool = true; }");
put(ROOT + "/plugins/tool/commands/review.md", "Review as the tool does.");

// what is no plugin: nothing, a marketplace, a name illi can't take
fs.mkdirSync(ROOT + "/plugins/empty", { recursive: true });
json(ROOT + "/plugins/market/.claude-plugin/marketplace.json", { plugins: [] });
put(ROOT + "/plugins/Bad Name/skills/x/SKILL.md", "X.");

// the user's own: a command of kit's name, a server of its, hooks; the
// project's servers
put(ROOT + "/commands/ship.md", "Ship as I do.");
json(ROOT + "/mcp.json", { mcpServers: { github: { url: "https://example.com/mine" } } });
json(ROOT + "/hooks.json", { hooks: { PreToolUse: [{ matcher: "shell", hooks: [{ type: "command", command: "echo mine" }] }] } });
json(REPO + "/.illi/mcp.json", { mcpServers: { local: { command: "local-server" } } });

const config = await import("./Config.ts");
const { Bundle } = await import("./Bundle.ts");
const { Plugins } = await import("./Plugins.ts");
const { Custom } = await import("./Custom.ts");
const { Hooks } = await import("./Hooks.ts");
const { Seen } = await import("./Seen.ts");
const { Trusted } = await import("./Trusted.ts");
const { Mcp } = await import("../tools/Mcp.ts");
const { term_commands, term_named, term_plugin } = await import("../term/Commands.ts");

Trusted.trust(Trusted.folder(REPO));
const trusted = (cwd: string) => Trusted.has(Trusted.folder(cwd));
const notes: string[] = [];
Plugins.attach({ note: (text: string) => notes.push(text), send: () => {}, redraw: () => {} } as any);
await Plugins.load(REPO, trusted);

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

test("a Claude Code plugin's folder read as a bundle: its parts as its manifest moves them, a part linked out dropped, an index beside parts not loaded, what illi doesn't use", () => {
  const b = Bundle.read(KIT, "kit", "global")!;
  const names = (parts: Array<{ name: string }>) => parts.map((p) => p.name);
  expect([b.claude, b.about, b.version, b.code]).toEqual([true, "Reviews and ships", "1.2.0", null]);
  expect([names(b.commands), names(b.agents), names(b.skills)]).toEqual([["review", "ship"], ["reviewer"], ["check", "lint"]]);
  expect(b.hooks.map((s) => [path.relative(KIT, s.file), s.data === undefined])).toEqual([["hooks/hooks.json", true], [".claude-plugin/plugin.json", false]]);
  expect(b.mcp.map((s) => path.relative(KIT, s.file))).toEqual([".mcp.json", "extra.json"]);
  expect(b.unused).toEqual(["settings.json", "output styles"]);
  expect(b.notes).toEqual(["its index.js isn't loaded as illi code beside other parts (illi's code goes in illi.ts)"]);
  expect(b.troubles).toEqual(["skills/out leads out of the plugin's folder, so it is left out"]);
  expect(Bundle.inspect(b)).toEqual(["a command runs !`...` lines, which illi doesn't run", "a command names @files, which illi doesn't attach"]);
});

test("no plugin: a folder of nothing; a marketplace or a name illi can't take, said; one SKILL.md at its root, the plugin is that skill", () => {
  expect(Bundle.read(ROOT + "/plugins/empty", "empty", "global")).toBeNull();
  expect(Bundle.misfit(ROOT + "/plugins/empty", "empty")).toBeNull();
  expect(Plugins.misfits().map((m) => [path.basename(m.dir), m.why.split(":")[0]])).toEqual([["Bad Name", "a name illi can't take"], ["market", "a Claude Code marketplace, not a plugin"]]);
  put(DIR + "/lone/SKILL.md", "---\ndescription: Alone\n---\nAlone.");
  expect(Bundle.read(DIR + "/lone", "lone", "global")!.skills).toEqual([{ name: "lone", file: DIR + "/lone" }]);
});

test("loaded: plugins in order, a code-less one running, its troubles said once; /agents lists what each gives", () => {
  expect(Plugins.found().map((p) => [p.name, p.runs, p.file === "" ? "" : path.basename(p.file)])).toEqual([["kit", true, ""], ["tool", true, "illi.ts"]]);
  expect((globalThis as any).tool).toBe(true);
  expect(notes).toContain("The plugin kit: skills/out leads out of the plugin's folder, so it is left out (/agents lists it).");
  const kit = term_plugin(Plugins.found()[0]);
  expect(kit[0]).toBe("- **kit** 1.2.0 · 2 skills · 2 commands · 1 agent · hooks · MCP servers · " + config.config_home(KIT));
  expect(kit.slice(1)).toEqual(["  - Reviews and ships", "  - illi doesn't use its settings.json, output styles", "  - its index.js isn't loaded as illi code beside other parts (illi's code goes in illi.ts)", "  - a command runs !`...` lines, which illi doesn't run", "  - a command names @files, which illi doesn't attach", "  - skills/out leads out of the plugin's folder, so it is left out"]);
  expect(term_plugin(Plugins.found()[1])[0]).toBe("- **tool** · code · 1 command · " + config.config_home(ROOT + "/plugins/tool"));
});

test("a plugin's parts go under the user's by name, a later plugin's over an earlier's; one hidden is plugin:name, which names a winner too; one off by plugin:name", () => {
  expect(Custom.commands(REPO).map((c) => c.name + " " + (c.plugin ?? "mine"))).toEqual(["kit:review kit", "kit:ship kit", "review tool", "ship mine"]);
  expect(Custom.skills(REPO).map((s) => s.name)).toEqual(["check", "customize-illi"]);
  expect(Custom.skills(REPO, true).map((s) => s.name)).toContain("lint");
  expect(Custom.skill(REPO, "kit:check")?.name).toBe("check");
  expect(Custom.agent(REPO, "kit:reviewer")?.name).toBe("reviewer");
  expect(Custom.agents(REPO).map((a) => a.name)).toEqual(["reviewer"]);
});

test("a plugin's bodies get its folder; its commands take $1..$9; a skill not for the model is no tool's", () => {
  const review = Custom.commands(REPO).find((c) => c.name === "kit:review")!;
  expect(Custom.expand(review, "a b").split("\n")[0]).toBe("Review a then b in " + KIT + ".");
  expect(Custom.skill(REPO, "check")!).toMatchObject({ body: "Check in " + KIT + "/skills/check.", model: false, plugin: "kit", global: true });
});

test("a Claude Code agent's tools and model, read as illi's: its own MCP servers by illi's names, Claude Code's own tools as named; a family's newest model", () => {
  const reviewer = Custom.agent(REPO, "reviewer")!;
  expect([reviewer.tools, reviewer.plugin]).toEqual([["read", "shell", "mcp__docs__search"], "kit"]);
  expect(reviewer.builtins).toEqual(["Read", "Grep", "Bash"]);
  const base = { vendor: "claude-api" as const, model: "opus-5.5", effort: "high", speed: "slow" };
  const pick = Custom.pick(reviewer, base, config.OFFER) as { vendor: string; model: string };
  expect([pick.vendor, pick.model.startsWith("sonnet-")]).toEqual(["claude-api", true]);
  expect(Custom.pick({ ...reviewer, model: "inherit" }, base, config.OFFER)).toEqual(base);
});

test("a plugin's hooks run before the user's, its disableAllHooks ignored; given its folders and the project's; Bash takes illi's shell; its own servers by illi's names", async () => {
  const { entries, troubles, off } = Hooks.read(REPO, trusted);
  expect([troubles, off]).toEqual([[], null]);
  expect(entries.map((e) => [e.event, e.match, e.plugin])).toEqual([["PreToolUse", "Bash", "kit"], ["PreToolUse", "mcp__docs__.*", "kit"], ["PostToolUse", "Write|Edit", "kit"], ["PreToolUse", "shell", null]]);
  const bash = entries[0];
  expect([Hooks.matches(bash, "shell"), Hooks.matches(bash, "read"), Hooks.matches(entries[1], "mcp__docs__search")]).toEqual([true, false, true]);
  const ran = await Hooks.run(bash.command, {}, REPO, REPO, 5000, undefined, false, bash.vars);
  expect(ran.out.trim()).toBe(KIT + "|" + ROOT + "/plugin-data/kit|" + REPO);
});

test("a plugin's hook naming only Claude Code's other tools is said once at the start", () => {
  Hooks.load(REPO, trusted);
  expect(notes.filter((n) => n.includes("Claude Code's tools"))).toEqual(["The plugin kit's PostToolUse hook echo inline matches Write|Edit, Claude Code's tools: illi's are shell, read, write, edit..., whose input differs, so it runs only on claude-code's own calls."]);
});

test("a plugin's MCP servers go under the user's by name, its variables filled in; a trusted project's mcp.json is read", () => {
  const found = Mcp.read(REPO);
  expect(Object.entries(found).map(([name, f]) => [name, f.plugin, path.relative(DIR, f.file)])).toEqual([["docs", "kit", "illi/plugins/kit/.mcp.json"], ["github", null, "illi/mcp.json"], ["local", null, "repo/.illi/mcp.json"]]);
  const docs = found.docs;
  expect([Mcp.expand(docs.def.command!, docs.vars), ...docs.def.args!.map((a) => Mcp.expand(a, docs.vars))]).toEqual([KIT + "/server", ROOT + "/plugin-data/kit", "plain"]);
  expect(Mcp.files(DIR + "/elsewhere")).toEqual([ROOT + "/mcp.json"]);
});

test("/ takes the user's commands and skills, then the plugins'; a plugin's winner answers to plugin:name too; a skill named so mid-message", () => {
  const cmds = term_commands(true).filter(([use]) => use.endsWith(" [...]")).map(([use, , , , also]) => use.split(" ")[0] + (also === undefined ? "" : " " + also));
  expect(cmds).toEqual(["/ship", "/customize-illi", "/kit:review", "/kit:ship", "/review tool:review", "/check kit:check"]);
  expect(term_named("use /kit:check: then /check.")).toBe("use /kit:check: then /check.\n\nUse your skills kit:check, check.");
});

test("what is seen is said once, till it changes", () => {
  const file = DIR + "/seen.txt";
  put(file, "one");
  expect([Seen.changed("x", [file]), Seen.changed("x", [file])]).toEqual([true, false]);
  put(file, "two");
  expect([Seen.changed("x", [file]), Seen.changed("x", [DIR + "/none"])]).toEqual([true, false]);
  expect(Seen.changed("x", [file])).toBe(false);
});
