// Custom test
// ===========
// `bun test Custom.test.ts`. The user's agents and commands: a file's
// front matter and body, the project's over the user's, its mode, a
// command's arguments; an agent's model as a pick; /agent makes a primary
// agent the main agent (its model, instructions and tools), noted before
// the next message, each keeping its pick; spawn's agent runs a subagent
// as it. A skill: its folder's SKILL.md (a folded description), the
// project's over theirs, listed by the skill tool and loaded by it.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-custom-");
const CWD = fs.mkdtempSync(os.tmpdir() + "/illi-project-");
process.env.ILLI_DIR = DIR;
process.env.ILLI_VENDORS = "chatgpt,claude-api";
process.env.ILLI_PICK = "chatgpt:gpt-6.1-sol:medium:slow";

function put(file: string, text: string): void {
  fs.mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(file, text);
}

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
const { Memory } = await import("../chat/Memory.ts");
const { Tools } = await import("../tools/Tools.ts");
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

test("an agent file's front matter and body; the project's wins", () => {
  const r = Custom.agent(CWD, "reviewer")!;
  expect(r).toMatchObject({ name: "reviewer", description: "Reviews", mode: "all", model: "gpt-6-luna", effort: "high", tools: ["zoom", "read"], body: "You review." });
  expect(Custom.agent(CWD, "coder")!.description).toBe("Codes");
  expect(Custom.agent(CWD, "Coder")!.name).toBe("coder");
  expect(Custom.agent(CWD, "nobody")).toBeNull();
  expect(Custom.agents(CWD).map((a) => a.name)).toEqual(["bad", "coder", "planner", "reviewer", "scout"]);
});

test("an agent's mode: primary, a subagent, or both", () => {
  expect(Custom.primaries(CWD).map((a) => a.name)).toEqual(["bad", "coder", "planner", "reviewer"]);
  expect(Custom.subagents(CWD).map((a) => a.name)).toEqual(["bad", "coder", "reviewer", "scout"]);
});

test("a command's arguments go where it says, else after it", () => {
  expect(Custom.expand(Custom.command(CWD, "review")!, "the diff")).toBe("Review the diff now.");
  expect(Custom.expand(Custom.command(CWD, "plain")!, "fast")).toBe("Do the thing.\n\nfast");
  expect(Custom.expand(Custom.command(CWD, "plain")!, "")).toBe("Do the thing.");
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
  const log = Array.from({ length: chat.mem.count }, (_, i) => Memory.message(chat.mem, i)!.text);
  expect(log.indexOf("hi") - log.indexOf("Main agent: Reviewer, on chatgpt:gpt-6-luna:high:slow.")).toBe(1);
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
  await Chat.act(chat, "low", { $: "pick", to: { vendor: "chatgpt", model: "gpt-6-luna", effort: "low", speed: "slow" } });
  expect(Chat.main(chat, null)).toEqual({});
  expect(chat.pick).toEqual(config.PICK);
  expect(Chat.main(chat, "reviewer")).toEqual({});
  expect(chat.pick.effort).toBe("low");
  expect(chat.switched).toBe(false);
  expect(Chat.main(chat, null)).toEqual({});
  Chat.push(chat, null, "user", "next");
  expect(notes()).toEqual(["Main agent: Reviewer, on chatgpt:gpt-6-luna:high:slow.", "Main agent: Illi's own, on chatgpt:gpt-6.1-sol:medium:slow."]);
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
  expect(asks[0].system).toContain("You are a subagent of Illi");
  expect(asks[0].system).toContain("# Agent: reviewer\n\nYou review.");
  expect(asks[0]).toMatchObject({ model: "gpt-6-luna", effort: "high" });
  expect(Tools.list(chat.tools, name).map((t) => t.name)).toEqual(["zoom", "read"]);
  expect(Memory.agent(chat.mem, name)![0].text).toBe("subagent reviewer");
  chat.tools.agents.delete(name);
  expect(Tools.agent(chat.tools, name)!.role).toEqual({ $: "sub", effort: null, agent: "reviewer" });
  await until(() => !chat.busy);
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

test("Illi's own skill, customize-illi: listed first, loaded with its folders named; the user's of its name takes its place", async () => {
  const own = Custom.skills(CWD)[0];
  expect([own.name, own.dir]).toEqual(["customize-illi", ""]);
  expect(own.description).toStartWith("Customize Illi itself");
  const out = await Tools.call(chat.tools, "main", "skill", { name: "customize-illi" }, new AbortController().signal);
  expect(out.text).toStartWith("Skill customize-illi: its instructions, whole, below (built into Illi)\n\n");
  expect(out.text).toContain("- Illi's folder: " + DIR + "\n");
  expect(out.text).toContain("- This project's: " + CWD + "/.illi (");
  expect(out.text).not.toContain("{{");
  put(DIR + "/skills/customize-illi/SKILL.md", "---\ndescription: mine\n---\nMine.");
  expect(Custom.skill(CWD, "customize-illi")).toMatchObject({ description: "mine", body: "Mine.", dir: DIR + "/skills/customize-illi" });
  fs.rmSync(DIR + "/skills/customize-illi", { recursive: true });
});
