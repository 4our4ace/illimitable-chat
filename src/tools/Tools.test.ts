// Tools test
// ==========
// `bun test Tools.test.ts`. The master's to-do list (todo), its alone: a
// list given whole replaces the one before, kept in the chat's folder and
// told to a view at once, and named in its calls' messages; one with two
// items active, or an item without text or a status, changes nothing; an
// empty one clears it; a restart reads it back. What the views are told
// of the calls: the input the main agent's last request read. A caller in
// Claude Code gets only the tools it lacks (?lean), and prompts that say
// it works inside illi, the project's CLAUDE.md left to Claude Code.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-tools-");
process.env.ILLI_DIR = DIR;

const { AskAI } = await import("../ai/AskAI.ts");
const { Chat } = await import("../chat/Chat.ts");
const { MASTER, SUB, Tools } = await import("./Tools.ts");
const View = await import("../ui/View.ts");

const chat = Chat.open(process.cwd());
const FILE = DIR + "/chat/todo.json";

// the todo tool called by the master
function todo(items: unknown) {
  return Tools.call(chat.tools, "main", "todo", { items }, new AbortController().signal);
}

async function until(ok: () => boolean): Promise<void> {
  for (let k = 0; !ok(); k++) {
    if (k > 200) {
      throw new Error("never");
    }
    await Bun.sleep(5);
  }
}

test("the todo tool is the master's alone", () => {
  expect(Tools.list(chat.tools, "main").map((t) => t.name)).toContain("todo");
  expect(Tools.list(chat.tools, "Ada").map((t) => t.name)).not.toContain("todo");
});

test("a list given whole replaces the one before, kept in the chat's folder and told to a view at once", async () => {
  const v = View.view_new();
  View.link_open(v, Chat.link(chat, (msg) => void View.view_hear(v, msg)));
  await until(() => v.up);
  expect(v.todo).toEqual([]);
  expect(await todo([{ text: "Old", status: "active" }])).toMatchObject({ fail: false });
  const list = [{ text: "Read the code", status: "done" }, { text: "Write  the\ntests", status: "active" }, { text: "Run them", status: "pending" }];
  expect(await todo(list)).toEqual({ text: "1 of 3 done; active: Write the tests.", fail: false });
  await until(() => v.todo.length === 3);
  expect(v.todo.map((x) => x.text)).toEqual(["Read the code", "Write the tests", "Run them"]);
  expect(JSON.parse(fs.readFileSync(FILE, "utf8"))).toEqual(v.todo);
  expect(Tools.at_work(chat.tools).text).toContain("1 of 3 done; active: Write the tests.\n- done: Read the code\n- active: Write the tests\n- pending: Run them\n");
  v.ws!.close();
});

test("two items active, or an item without text or a status, changes nothing", async () => {
  const before = JSON.stringify(Tools.todo(chat.tools));
  expect(await todo([{ text: "a", status: "active" }, { text: "b", status: "active" }])).toMatchObject({ fail: true, text: expect.stringContaining("one active at a time") });
  expect(await todo([{ text: " ", status: "pending" }])).toMatchObject({ fail: true });
  expect(await todo([{ text: "a", status: "started" }])).toMatchObject({ fail: true });
  expect(await todo("a")).toMatchObject({ fail: true });
  expect(JSON.stringify(Tools.todo(chat.tools))).toBe(before);
  expect(fs.readFileSync(FILE, "utf8")).toContain("Write the tests");
});

test("a restart reads the list back; an empty one clears it", async () => {
  expect(Tools.todo_load(FILE)).toEqual(Tools.todo(chat.tools));
  expect(await todo([])).toEqual({ text: "The to-do list is cleared.", fail: false });
  expect(Tools.todo_load(FILE)).toEqual([]);
  expect(Tools.at_work(chat.tools).text).not.toContain("to-do");
  expect(Tools.todo_load(DIR + "/none.json")).toEqual([]);
});

test("the views are told the input the main agent's last request read, not an agent's", () => {
  expect(Chat.state(chat)).toMatchObject({ use: { tokens: null, limits: [] } });
  AskAI.read(Tools.at(chat.tools, "main"), 41000);
  AskAI.read(Tools.at(chat.tools, "Ada"), 9);
  AskAI.read("", 7);
  expect(Chat.state(chat)).toMatchObject({ use: { tokens: 41000 } });
});

test("a caller in Claude Code gets only the tools it lacks, served at ?lean; its prompts say it works inside illi, CLAUDE.md left to Claude Code", async () => {
  const names = (lean: boolean) => Tools.list(chat.tools, "main", lean).map((t) => t.name);
  expect(names(false)).toEqual(expect.arrayContaining(["shell", "read", "write", "edit"]));
  expect(names(true)).not.toEqual(expect.arrayContaining(["shell"]));
  expect(names(true).filter((n) => ["shell", "read", "write", "edit"].includes(n))).toEqual([]);
  expect(names(true)).toEqual(expect.arrayContaining(["zoom", "date", "spawn", "tell", "todo"]));
  const res = await fetch(Tools.at(chat.tools, "main") + "?lean", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  const listed = (await res.json()).result.tools;
  expect(listed.map((t: any) => t.name)).toEqual(names(true));
  expect(names(true)).toContain("approve");
  expect(names(false)).not.toContain("approve");
  const upfront = listed.filter((t: any) => t._meta?.["anthropic/alwaysLoad"] === true).map((t: any) => t.name);
  expect(upfront.sort()).toEqual(["ask", "date", "spawn", "tell", "todo", "zoom"]);
  const hosted = Tools.hosted(MASTER);
  expect(hosted).toStartWith("Here you work inside illi (short for illimitable)");
  expect(hosted).not.toContain("You are illi");
  expect(hosted).not.toContain("Your shell, read, write and edit tools");
  expect(hosted).toContain("mcp__illi__");
  expect(Tools.hosted(SUB)).toStartWith("Here you work as a subagent of illi");
  expect(Tools.hosted(SUB)).not.toContain("Your shell, read, write and edit tools");
  const project = fs.mkdtempSync(os.tmpdir() + "/illi-tools-project-");
  fs.mkdirSync(project + "/.git");
  fs.writeFileSync(project + "/CLAUDE.md", "a rule of the project");
  try {
    expect(Tools.system("head", project)).toContain("a rule of the project");
    expect(Tools.system("head", project, "claude-code")).not.toContain("a rule of the project");
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test("Claude Code's permission prompt is a question at illi's screen: yes, no with a reason, yes for the rest of the run; stopped or no one there, no", async () => {
  const v = View.view_new();
  View.link_open(v, Chat.link(chat, (msg) => void View.view_hear(v, msg)));
  await until(() => v.up);
  const approve = async (tool: string, input: unknown, signal = new AbortController().signal) => JSON.parse((await Tools.call(chat.tools, "main", "approve", { tool_name: tool, input }, signal)).text);
  const answer  = async (yes: boolean, always: boolean, why = "") => {
    await until(() => v.asks.length === 1);
    View.link_send(v, { $: "answer", ask: v.asks[0].id, yes, always, said: why });
  };
  const yes = approve("Bash", { command: "ls -la" });
  await until(() => v.asks.length === 1);
  expect(v.asks[0]).toMatchObject({ who: "illi", tool: "Bash", what: "ls -la" });
  await answer(true, false);
  expect(await yes).toEqual({ behavior: "allow", updatedInput: { command: "ls -la" } });
  await until(() => v.asks.length === 0);
  const no = approve("Bash", { command: "rm -r build" });
  await answer(false, false, "use the clean script");
  expect(await no).toEqual({ behavior: "deny", message: "The user said no, asked at illi's screen: use the clean script" });
  await until(() => v.asks.length === 0);
  const flat = approve("Bash", { command: "rm -r out" });
  await answer(false, false);
  expect(await flat).toEqual({ behavior: "deny", message: "The user said no, asked at illi's screen." });
  await until(() => v.asks.length === 0);
  const always = approve("Bash", { command: "pwd" });
  await answer(true, true);
  expect((await always).behavior).toBe("allow");
  await until(() => v.asks.length === 0);
  expect(await approve("Bash", { command: "date" })).toEqual({ behavior: "allow", updatedInput: { command: "date" } });
  expect(chat.asks).toEqual([]);
  const stop    = new AbortController();
  const stopped = approve("Write", { file_path: "a.txt", content: "x" }, stop.signal);
  await until(() => v.asks.length === 1);
  expect(v.asks[0].what).toBe("a.txt");
  stop.abort();
  expect(await stopped).toEqual({ behavior: "deny", message: "The request was stopped." });
  await until(() => v.asks.length === 0);
  v.ws!.close();
  await until(() => chat.socks.size === 0);
  expect((await approve("Edit", { file_path: "b.txt" })).message).toContain("No one is at illi's screen");
  chat.tools.allowed.clear();
});

test("illi's own questions (ask): the main agent's; each checked; answered as the user said, skipped when they skip", async () => {
  const v = View.view_new();
  View.link_open(v, Chat.link(chat, (msg) => void View.view_hear(v, msg)));
  await until(() => v.up);
  expect(Tools.list(chat.tools, "main").map((t) => t.name)).toContain("ask");
  expect(Tools.list(chat.tools, "Scout").map((t) => t.name)).not.toContain("ask");
  const ask = (questions: object[]) => Tools.call(chat.tools, "main", "ask", { questions }, new AbortController().signal);
  const options = [{ label: "Postgres", about: "you know it" }, { label: "SQLite" }];
  const wrong = "Ask 1 to 4 questions, each with its text and 2 to 6 options, each with a label.";
  expect((await ask([{ question: "Which?", options: [{ label: "one" }] }])).text).toBe(wrong);
  expect((await ask([])).text).toBe(wrong);
  expect((await ask(Array(5).fill({ question: "Which?", options }))).text).toBe(wrong);
  const answered = ask([{ question: "Which database for the demo?", options, multi: true }, { question: "Cache?", head: "Cache", options }]);
  await until(() => v.asks.length === 1);
  expect(v.asks[0]).toMatchObject({ who: "illi", tool: "ask", what: "Which database for the demo?", queries: [{ text: "Which database for the demo?", head: "Which databa", options: [{ label: "Postgres", about: "you know it" }, { label: "SQLite", about: "" }], multi: true }, { head: "Cache", multi: false }] });
  View.link_send(v, { $: "answer", ask: v.asks[0].id, yes: true, always: false, said: "Which database for the demo?\npicked: Postgres\n\nCache?\nno answer" });
  expect(await answered).toEqual({ text: View.ANSWERED + "Which database for the demo?\npicked: Postgres\n\nCache?\nno answer", fail: false });
  await until(() => v.asks.length === 0);
  const skipped = ask([{ question: "Which database?", options }]);
  await until(() => v.asks.length === 1);
  View.link_send(v, { $: "answer", ask: v.asks[0].id, yes: false, always: false });
  expect((await skipped).text).toBe("The user skipped the questions: decide yourself, or ask in your reply.");
  await until(() => v.asks.length === 0);
  v.ws!.close();
  await until(() => chat.socks.size === 0);
  expect((await ask([{ question: "Which database?", options }])).text).toBe("No one is at illi's screen to answer: decide yourself, or ask in your reply.");
});

test("what a question shows: a command, a file, a URL or a query, else the input, cut short", () => {
  expect(Tools.what({ command: "git status", description: "x" })).toBe("git status");
  expect(Tools.what({ file_path: "src/a.ts", old_string: "a" })).toBe("src/a.ts");
  expect(Tools.what({ url: "https://example.com", prompt: "p" })).toBe("https://example.com");
  expect(Tools.what({ pattern: "TODO" })).toBe("TODO");
  expect(Tools.what({ n: 1 })).toBe('{"n":1}');
  expect(Tools.what({ command: "x".repeat(1000) })).toHaveLength(400);
});
