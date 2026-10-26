// Custom test
// ===========
// `bun test Custom.test.ts`. The user's agents and commands: a file's
// front matter and body (its tools list's Claude Code tools, but those
// illi gives itself, spawn and todo; the list as YAML writes it too;
// one empty gives none, one left out all), the project's over the
// user's, its mode, a command's arguments; an agent's model as a pick;
// /agent makes a primary agent the main agent (its model, instructions
// and tools, Claude Code's too), noted before the next message, each
// keeping its pick; spawn's agent runs a subagent as it, with its Claude
// Code tools (none on a ChatGPT model whose window isn't told: never
// guessed).
// A skill: its folder's SKILL.md (a folded description), the
// project's over theirs, listed by the skill tool and loaded by it; a
// sticky one turned on and off by it, while on in every turn's prompt;
// those shared with other agents (.agents/skills) under illi's own. The
// project is trusted first: only then do its own files load.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import { temp_dir, temp_repo } from "../../test/repo.ts";

const DIR = temp_dir("illi-custom-");
// the project the chat is opened in: a throwaway repository, never this
// checkout
const CWD = temp_repo("illi-project-");
process.env.ILLI_DIR = DIR;
process.env.ILLI_VENDORS = "chatgpt,claude-api";
process.env.ILLI_PICK = "chatgpt:gpt-6.1-sol:medium:slow";

function put(file: string, text: string): void {
  fs.mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(file, text);
}

// ChatGPT's models as its catalog told them at a start before (a window
// is never guessed there)
put(DIR + "/models.json", JSON.stringify({ vendors: { chatgpt: ["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra"].map((id) => ({ label: id, id, speeds: ["slow"], window: 872000 })) } }));
put(DIR + "/agents/reviewer.md", "---\ndescription: theirs\n---\nTheirs.");
put(CWD + "/.illi/agents/reviewer.md", "---\ndescription: Reviews\nmodel: gpt-6-luna\neffort: high\ntools: zoom, read\n---\nYou review.\n");
put(DIR + "/agents/coder.md", "---\ndescription: \"Codes\"\nmodel: claude-api:opus-5.5:low:slow\n---\nYou code.");
put(DIR + "/agents/bad.md", "---\nmodel: gpt-9\n---\nNo.");
put(DIR + "/agents/planner.md", "---\ndescription: Plans\nmode: primary\n---\nYou plan.");
put(DIR + "/agents/scout.md", "---\ndescription: Scouts\nmode: Subagent\n---\nYou scout.");
put(DIR + "/commands/review.md", "---\ndescription: Review it\n---\nReview $ARGUMENTS now.");
put(CWD + "/.illi/commands/plain.md", "Do the thing.");
put(DIR + "/skills/pdf/SKILL.md", "---\nname: pdf\ndescription: >\n  Fills PDF forms.\n  Use for any .pdf.\n---\nRun scripts/fill.py on it.");
put(DIR + "/skills/pdf/scripts/fill.py", "print(1)");
put(DIR + "/skills/Deploy/SKILL.md", "---\ndescription: theirs\n---\nTheirs.");
put(CWD + "/.illi/skills/Deploy/SKILL.md", "---\ndescription: Ships it\n---\nShip.");
put(DIR + "/skills/notes/README.md", "no SKILL.md: no skill");

const { AskAI } = await import("../ai/AskAI.ts");
const { Chat } = await import("../chat/Chat.ts");
const { Custom } = await import("./Custom.ts");
const { Trusted } = await import("./Trusted.ts");
const { Logs } = await import("../chat/Logs.ts");
const { Memory } = await import("../chat/Memory.ts");
const { Tools } = await import("../tools/Tools.ts");
const { ChatGPT } = await import("../ai/ChatGPT.ts");
const { Pick } = await import("../ai/Pick.ts");

// the project's own agents, commands and skills load only once it is trusted
Trusted.trust(Trusted.folder(CWD));
const config = await import("./Config.ts");

// the model: the asks it got, each answered "done" at once
const asks: any[] = [];
AskAI.ask = (ask, on) => {
  asks.push(ask);
  const [call, feed] = AskAI.tie(on, () => {}, () => {});
  queueMicrotask(() => feed.end({ ok: true, text: "done", left: [] }));
  return call;
};

async function until(ok: () => boolean): Promise<void> {
  for (let k = 0; !ok(); k++) {
    if (k > 200) {
      throw new Error("never");
    }
    await Bun.sleep(5);
  }
}

test("an agent file's front matter and body (its tools list's Claude Code tools as well); the project's wins", () => {
  const r = Custom.agent(CWD, "reviewer")!;
  expect(r).toMatchObject({ name: "reviewer", description: "Reviews", mode: "all", model: "gpt-6-luna", effort: "high", tools: ["zoom", "read"], builtins: ["Read"], body: "You review." });
  expect(Custom.agent(CWD, "coder")!.description).toBe("Codes");
  expect(Custom.agent(CWD, "coder")!.builtins).toBeNull();
  expect(Custom.agent(CWD, "Coder")!.name).toBe("coder");
  expect(Custom.agent(CWD, "nobody")).toBeNull();
  expect(Custom.agents(CWD).map((a) => a.name)).toEqual(["bad", "coder", "planner", "reviewer", "scout"]);
});

test("an agent's tools list as YAML writes it: in [ ], each name quoted or not, or as - lines; illi's own as Claude Code's, MultiEdit as Edit", () => {
  put(DIR + "/lists/flow.md", "---\ntools: [\"Read\", 'Grep', zoom]\n---\n");
  put(DIR + "/lists/block.md", "---\ntools:\n  - Read\n  - \"MultiEdit\"\n  - shell\nmodel: sonnet\n---\n");
  const flow = Custom.profile("flow", DIR + "/lists/flow.md");
  expect([flow.tools, flow.builtins]).toEqual([["read", "zoom"], ["Read", "Grep"]]);
  const block = Custom.profile("block", DIR + "/lists/block.md");
  expect([block.tools, block.builtins, block.model]).toEqual([["read", "edit", "shell"], ["Read", "Edit", "Bash"], "sonnet"]);
});

test("Claude Code's Agent, Task, TodoWrite and task tools in a tools list are illi's spawn and todo, never Claude Code's own on claude-code", () => {
  put(DIR + "/lists/lead.md", "---\ntools: Read, Agent, Task, TodoWrite, Bash\n---\n");
  put(DIR + "/lists/boss.md", "---\ntools: Task, TodoWrite\n---\n");
  put(DIR + "/lists/tasks.md", "---\ntools: TaskCreate, TaskUpdate, TaskList, TaskGet, Grep\n---\n");
  const tasks = Custom.profile("tasks", DIR + "/lists/tasks.md");
  expect([tasks.tools, tasks.builtins]).toEqual([["todo"], ["Grep"]]);
  const lead = Custom.profile("lead", DIR + "/lists/lead.md");
  expect([lead.tools, lead.builtins]).toEqual([["read", "spawn", "todo", "shell"], ["Read", "Bash"]]);
  const boss = Custom.profile("boss", DIR + "/lists/boss.md");
  expect([boss.tools, boss.builtins]).toEqual([["spawn", "todo"], []]);
});

test("an empty tools list gives an agent none of illi's tools nor Claude Code's built-in ones, as Claude Code reads it; only one left out gives all", () => {
  put(DIR + "/lists/all.md", "---\ndescription: All\n---\n");
  put(DIR + "/lists/bare.md", "---\ntools:\ndescription: Bare\n---\n");
  put(DIR + "/lists/quoted.md", "---\ntools: \"\"\n---\n");
  put(DIR + "/lists/brackets.md", "---\ntools: []\n---\n");
  const all = Custom.profile("all", DIR + "/lists/all.md");
  expect([all.tools, all.builtins]).toEqual([null, null]);
  for (const name of ["bare", "quoted", "brackets"]) {
    const none = Custom.profile(name, DIR + "/lists/" + name + ".md");
    expect([name, none.tools, none.builtins]).toEqual([name, [], []]);
  }
  expect(Custom.allow(Custom.profile("bare", DIR + "/lists/bare.md"), [{ name: "zoom" }, { name: "shell" }])).toEqual([]);
});

test("an agent's mode: primary, a subagent, or both", () => {
  expect(Custom.primaries(CWD).map((a) => a.name)).toEqual(["bad", "coder", "planner", "reviewer"]);
  expect(Custom.subagents(CWD).map((a) => a.name)).toEqual(["bad", "coder", "reviewer", "scout"]);
});

test("a command's arguments go where it says, else after it", () => {
  const command = (name: string) => Custom.commands(CWD).find((c) => c.name === name)!;
  expect(Custom.expand(command("review"), "the diff")).toBe("Review the diff now.");
  expect(Custom.expand(command("plain"), "fast")).toBe("Do the thing.\n\nfast");
  expect(Custom.expand(command("plain"), "")).toBe("Do the thing.");
});

test("an agent's model: a label, a whole pick, or why not", () => {
  const base = config.PICK;
  expect(Custom.pick(Custom.agent(CWD, "reviewer")!, base, config.OFFER)).toEqual({ vendor: "chatgpt", model: "gpt-6-luna", effort: "high", speed: "slow" });
  expect(Custom.pick(Custom.agent(CWD, "coder")!, base, config.OFFER)).toEqual({ vendor: "claude-api", model: "opus-5.5", effort: "low", speed: "slow" });
  expect(Custom.pick(Custom.agent(CWD, "bad")!, base, config.OFFER)).toContain("isn't offered");
});

const chat = Chat.open(CWD);

// the chat's notes, in order
function notes(): string[] {
  return Array.from({ length: chat.mem.count }, (_, i) => Memory.message(chat.mem, i)!).filter((m) => m.kind === "note").map((m) => m.text);
}

test("/agent makes a primary agent the main agent: its model, instructions and tools", async () => {
  expect(Chat.main(chat, "nobody").error).toContain("No agent nobody");
  expect(Chat.main(chat, "bad").error).toContain("isn't offered");
  expect(Chat.main(chat, "scout").error).toContain("scout is a subagent");
  expect(Chat.main(chat, "reviewer")).toEqual({});
  expect(chat.mem.agent).toBe("reviewer");
  expect(chat.pick).toEqual({ vendor: "chatgpt", model: "gpt-6-luna", effort: "high", speed: "slow" });
  expect(Chat.system(chat)).toContain("# Agent: reviewer\n\nYou review.");
  expect(Tools.list(chat.tools, "main").map((t) => t.name)).toEqual(["zoom", "read"]);
  expect(notes()).toEqual([]);
  Chat.take(chat, Chat.push(chat, null, "user", "hi"));
  await until(() => asks.length > 0 && !chat.busy);
  expect(asks.at(-1).system).toContain("You review.");
  expect(asks.at(-1).model).toBe("gpt-6-luna");
  expect(asks.at(-1).builtins).toEqual(["Read"]);
  const log = Array.from({ length: chat.mem.count }, (_, i) => Memory.message(chat.mem, i)!.text);
  expect(log.indexOf("hi") - log.indexOf("Main agent: reviewer, on gpt-6-luna · high.")).toBe(1);
  expect(Chat.main(chat, null)).toEqual({});
  expect(Chat.system(chat)).not.toContain("# Agent:");
  expect(Tools.list(chat.tools, "main").map((t) => t.name)).toContain("spawn");
  expect(chat.pick).toEqual(config.PICK);
});

test("an agent only passed through is never noted; each keeps its pick", async () => {
  expect(chat.switched).toBe(true);
  expect(Chat.main(chat, "Planner")).toEqual({});
  expect(chat.mem.agent).toBe("planner");
  expect(Chat.main(chat, "reviewer")).toEqual({});
  expect(chat.switched).toBe(false);
  await Chat.act(chat, { $: "pick", to: { vendor: "chatgpt", model: "gpt-6-luna", effort: "low", speed: "slow" } });
  expect(Chat.main(chat, null)).toEqual({});
  expect(chat.pick).toEqual(config.PICK);
  expect(Chat.main(chat, "reviewer")).toEqual({});
  expect(chat.pick.effort).toBe("low");
  expect(chat.switched).toBe(false);
  expect(Chat.main(chat, null)).toEqual({});
  Chat.push(chat, null, "user", "next");
  expect(notes()).toEqual(["Main agent: reviewer, on gpt-6-luna · high.", "Main agent: illi's own, on gpt-6.1-sol · medium."]);
});

test("spawn's agent runs a subagent as it, and names the user's agents", async () => {
  const spawn = Tools.list(chat.tools, "main").find((t) => t.name === "spawn")!;
  expect(JSON.stringify(spawn.schema)).toContain("reviewer (Reviews)");
  expect(JSON.stringify(spawn.schema)).toContain("scout (Scouts)");
  expect(JSON.stringify(spawn.schema)).not.toContain("planner");
  const no = await Tools.call(chat.tools, "main", "spawn", { tasks: ["x"], agent: "nobody" }, new AbortController().signal);
  expect(no).toMatchObject({ fail: true, text: "No agent nobody; the user's subagents: bad, coder, reviewer, scout." });
  const main = await Tools.call(chat.tools, "main", "spawn", { tasks: ["x"], agent: "planner" }, new AbortController().signal);
  expect(main).toMatchObject({ fail: true, text: "planner is a primary agent, never spawned; the user's subagents: bad, coder, reviewer, scout." });
  asks.length = 0;
  const out = await Tools.call(chat.tools, "main", "spawn", { tasks: ["review it"], agent: "reviewer" }, new AbortController().signal);
  const name = /Started (\w+)/.exec(out.text)![1];
  await until(() => asks.length > 0);
  expect(asks[0].system).toContain("You are a subagent of illi");
  expect(asks[0].system).toContain("# Agent: reviewer\n\nYou review.");
  expect(asks[0]).toMatchObject({ model: "gpt-6-luna", effort: "high" });
  expect(Tools.list(chat.tools, name).map((t) => t.name)).toEqual(["zoom", "read"]);
  expect(Logs.read(chat.mem, name)![0].text).toBe("subagent reviewer");
  chat.tools.agents.delete(name);
  expect(Tools.agent(chat.tools, name)!.role).toEqual({ $: "sub", effort: null, agent: "reviewer" });
  await until(() => !chat.busy);
});

test("a subagent on a ChatGPT model whose window isn't told starts on no guess: spawn says why, no model asked; its view, if asked, its opening and last block alone", async () => {
  const luna = Pick.model("chatgpt", "gpt-6-luna")!;
  const [window, listed, models] = [luna.window, ChatGPT.listed, ChatGPT.models];
  ChatGPT.listed = async () => {};
  ChatGPT.models = async () => null;
  luna.window = undefined;
  asks.length = 0;
  try {
    const out = await Tools.call(chat.tools, "main", "spawn", { tasks: ["review it"], agent: "reviewer" }, new AbortController().signal);
    expect(out.text).toBe("Not started: ChatGPT hasn't told gpt-6-luna's context window (its model list didn't answer), and illi never guesses one.");
    const ask = Tools.ask(chat.tools, { name: "x", run: 0, log: "x", role: { $: "sub", effort: null, agent: "reviewer" }, call: null, live: [], calls: {}, stop: false, view: [{ text: "first\n", mark: false }, { text: "middle\n", mark: false }, { text: "last\n", mark: false }], replies: [] } as any);
    expect(ask.blocks.map((b: any) => b.text).join("")).toStartWith("first\n(older lines left out to fit your model: zoom and search find them)\nlast\n");
    expect(ask.builtins).toEqual(["Read"]);
    await Bun.sleep(20);
    expect(asks).toEqual([]);
  } finally {
    [luna.window, ChatGPT.listed, ChatGPT.models] = [window, listed, models];
  }
});

test("a skill: its folder's SKILL.md, the project's over theirs; listed and loaded by the skill tool", async () => {
  expect(Custom.skills(CWD).map((k) => [k.name, k.description]).slice(1)).toEqual([["Deploy", "Ships it"], ["pdf", "Fills PDF forms. Use for any .pdf."]]);
  const skill = Tools.list(chat.tools, "main").find((t) => t.name === "skill")!;
  expect(skill.info).toContain("- pdf: Fills PDF forms. Use for any .pdf.");
  expect(JSON.stringify(skill.schema)).toContain('"enum":["customize-illi","Deploy","pdf"]');
  const out = await Tools.call(chat.tools, "main", "skill", { name: "PDF" }, new AbortController().signal);
  expect(out.text).toBe("Skill pdf: its SKILL.md's instructions, whole, below; its folder: " + DIR + "/skills/pdf\n\nRun scripts/fill.py on it.\n\nIts files, in its folder: scripts/fill.py.");
  expect((await Tools.call(chat.tools, "main", "skill", { name: "nope" }, new AbortController().signal)).fail).toBe(true);
  expect(Chat.main(chat, "reviewer")).toEqual({});
  expect(Tools.list(chat.tools, "main").map((t) => t.name)).toEqual(["zoom", "read"]);
  expect(Chat.main(chat, null)).toEqual({});
});

test("skills shared with other agents: ~/.agents/skills under illi's global ones, a trusted project's .agents/skills from its top down under its .illi; global for the on/off lists", () => {
  const shared = config.AGENTS_DIR + "/skills";
  const top    = temp_dir("illi-tree-");
  const cwd    = top + "/pkg";
  put(top + "/.git/HEAD", "ref: refs/heads/main\n");
  put(shared + "/pdf/SKILL.md", "---\ndescription: shared pdf\n---\nShared.");
  put(shared + "/lint/SKILL.md", "---\ndescription: Lints\n---\nLint.");
  put(top + "/.agents/skills/up/SKILL.md", "---\ndescription: from the top\n---\nTop.");
  put(top + "/.agents/skills/near/SKILL.md", "---\ndescription: from the top\n---\nTop.");
  put(cwd + "/.agents/skills/near/SKILL.md", "---\ndescription: from here\n---\nHere.");
  put(cwd + "/.agents/skills/lint/SKILL.md", "---\ndescription: the project's lint\n---\nLint here.");
  put(cwd + "/.illi/skills/near/SKILL.md", "---\ndescription: illi's own here\n---\nOwn.");
  try {
    const said = (dir: string) => Object.fromEntries(Custom.skills(dir).map((k) => [k.name, k.description]));
    expect(said(cwd)).toEqual({ "customize-illi": expect.any(String), Deploy: "theirs", lint: "Lints", pdf: "Fills PDF forms. Use for any .pdf." });
    Trusted.trust(Trusted.folder(cwd));
    expect(said(cwd)).toEqual({ "customize-illi": expect.any(String), Deploy: "theirs", lint: "the project's lint", near: "illi's own here", pdf: "Fills PDF forms. Use for any .pdf.", up: "from the top" });
    expect(Custom.dirs(cwd, "skills")).toEqual([shared, DIR + "/skills", top + "/.agents/skills", cwd + "/.agents/skills", cwd + "/.illi/skills"]);
    expect(Custom.dirs(cwd, "agents")).toEqual([DIR + "/agents", cwd + "/.illi/agents"]);
    expect(Custom.global(Custom.skills(CWD).find((k) => k.name === "lint")!)).toBe(true);
  } finally {
    fs.rmSync(shared, { recursive: true, force: true });
  }
});

test("illi's own skill, customize-illi: listed first, loaded with its folders named; the user's of its name takes its place", async () => {
  const own = Custom.skills(CWD)[0];
  expect([own.name, own.dir]).toEqual(["customize-illi", ""]);
  expect(own.description).toStartWith("Customize illi itself");
  const out = await Tools.call(chat.tools, "main", "skill", { name: "customize-illi" }, new AbortController().signal);
  expect(out.text).toStartWith("Skill customize-illi: its instructions, whole, below (built into illi)\n\n");
  expect(out.text).toContain("- The global folder, every profile's: " + DIR + "\n");
  expect(out.text).toContain("- illi's folder, this profile's own: " + DIR + " (");
  expect(out.text).toContain("- This project's: " + CWD + "/.illi (");
  expect(out.text).not.toContain("{{");
  put(DIR + "/skills/customize-illi/SKILL.md", "---\ndescription: mine\n---\nMine.");
  expect(Custom.skill(CWD, "customize-illi")).toMatchObject({ description: "mine", body: "Mine.", dir: DIR + "/skills/customize-illi" });
  fs.rmSync(DIR + "/skills/customize-illi", { recursive: true });
});

test("with no skill sticky, the skill tool offers no switch: nothing to turn on or off", () => {
  const skill = Tools.list(chat.tools, "main").find((t) => t.name === "skill")!;
  expect(skill.schema).toEqual({ type: "object", properties: { name: expect.any(Object) }, required: ["name"] });
  expect(skill.info).not.toContain("on: true");
  expect(skill.info).toContain("Loading is all a skill for a task needs: it is never unloaded after.");
});

test("a sticky skill: listed so, turned on by the skill tool (illi's own turns only) and then in every turn's prompt, never a summary's; off again; on or off for one not sticky does nothing and fails nothing; the tool never says a skill can't be turned off while it offers off", async () => {
  put(DIR + "/skills/terse/SKILL.md", "---\ndescription: Short replies\nsticky: true\n---\nBe terse.");
  const call = (who: string, args: object) => Tools.call(chat.tools, who, "skill", args, new AbortController().signal);
  const info = Tools.list(chat.tools, "main").find((t) => t.name === "skill")!.info;
  expect([info.includes("on: false"), info.includes("turned off after")]).toEqual([true, false]);
  expect(info).toContain("- terse (sticky): Short replies");
  expect(Tools.list(chat.tools, "main").find((t) => t.name === "skill")!.schema).toMatchObject({ properties: { on: expect.any(Object) } });
  const pdf = await call("main", { name: "pdf", on: true });
  expect([pdf.fail, pdf.text]).toEqual([false, expect.stringMatching(/^pdf isn't sticky: loaded for the task at hand\.\n\nSkill pdf: /)]);
  expect(await call("main", { name: "pdf", on: false })).toEqual({ text: "pdf isn't sticky, so it was never on: nothing to turn off.", fail: false });
  expect((await call("Scout", { name: "terse", on: true })).fail).toBe(true);
  expect(Chat.system(chat)).not.toContain("Be terse.");
  const on = await call("main", { name: "terse", on: true });
  expect([on.fail, on.text]).toEqual([false, expect.stringMatching(/^terse is on: follow it in every reply from now on .*\n\nSkill terse: .*\n\nBe terse\.$/s)]);
  expect([config.STICKY, Chat.system(chat)]).toEqual([["terse"], expect.stringContaining("# Sticky skills on\n\nThe user turned these on")]);
  expect(Chat.system(chat)).toContain("Be terse.");
  expect(Chat.share(chat).system).not.toContain("Be terse.");
  expect((await call("main", { name: "terse", on: false })).text).toBe("terse is off: its rules no longer apply.");
  expect([config.STICKY, Chat.system(chat).includes("Be terse.")]).toEqual([[], false]);
  fs.rmSync(DIR + "/skills/terse", { recursive: true });
});
