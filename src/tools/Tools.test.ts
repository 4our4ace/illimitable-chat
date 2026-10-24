// Tools test
// ==========
// `bun test Tools.test.ts`. The master's to-do list (todo), its alone: a
// list given whole replaces the one before, kept in the chat's file (the
// project's own) and told to a view at once, and named in its calls'
// messages; one with two items active, or an item without text or a
// status, changes nothing; an empty one clears it; a restart reads it
// back; one all done is let go (as a turn starts and ends, and at the
// start), one still going kept. What the views are told
// of the calls: the input the main agent's last request read. A caller in
// Claude Code gets only the tools it lacks (?lean), and prompts that say
// it works inside illi, the project's CLAUDE.md left to Claude Code. Its
// permission prompt, and illi's own shell, files and MCP tools, pass the
// checks (Guard.ts; careful mode, in a throwaway repository): a
// risk asked with why, the question given the command whole up to 32,000
// characters, how many more left out (a note and the refused list, cut
// short), what don't ask again keeps by its ends past 1,000; a refusal
// recorded and told to the model; a plugin's hooks come before them and
// after the tool. The loop guard (auto): a call the same as its caller's
// two before it asked, illi's own tools too; a yes starts its count
// again. The projects: their table,
// a search across them, a zoom into another's chat. A subagent's view
// fits its model: the oldest lines left out.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import { temp_dir, temp_repo } from "../../test/repo.ts";

const DIR = temp_dir("illi-tools-");
process.env.ILLI_DIR = DIR;

// the chat's project: a throwaway repository (no remote), so what its
// calls run acts there, never on this checkout; a folder outside it, not
// scratch (writing there is asked) and not this user's to write
const REPO = temp_repo("illi-tools-repo-");
const AWAY = "/illi-tools-away";

// careful, whose questions (git reset --hard, a plain push) these tests
// answer; the loop guard's test switches to auto
process.env.ILLI_MODE = "careful";

const { Chat } = await import("../chat/Chat.ts");
const config = await import("../config/Config.ts");
const { MASTER, SUB, Tools } = await import("./Tools.ts");
const { Projects } = await import("../chat/Projects.ts");
const { Store } = await import("../chat/Store.ts");
const View = await import("../ui/View.ts");

const chat = Chat.open(REPO);
const kept = () => Store.todo(chat.mem.store);

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

test("a list given whole replaces the one before, kept in the chat's file (the project's own) and told to a view at once", async () => {
  const v = View.view_new();
  View.link_open(v, Chat.link(chat, (msg) => void View.view_hear(v, msg)));
  await until(() => v.up);
  expect(v.todo).toEqual([]);
  expect(await todo([{ text: "Old", status: "active" }])).toMatchObject({ fail: false });
  const list = [{ text: "Read the code", status: "done" }, { text: "Write  the\ntests", status: "active" }, { text: "Run them", status: "pending" }];
  expect(await todo(list)).toEqual({ text: "1 of 3 done; active: Write the tests.", fail: false });
  await until(() => v.todo.length === 3);
  expect(v.todo.map((x) => x.text)).toEqual(["Read the code", "Write the tests", "Run them"]);
  expect(kept()).toEqual(v.todo);
  const other = Store.open(DIR + "/chat", { key: "git:/work/other", name: "other-k3f9x2", path: "/work/other" });
  expect(Store.todo(other)).toBeNull();
  Store.close(other);
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
  expect(JSON.stringify(kept())).toContain("Write the tests");
});

test("a restart reads the list back; an empty one clears it", async () => {
  const again = () => Tools.todo({ ...chat.tools, todo: undefined });
  expect(again()).toEqual(Tools.todo(chat.tools));
  expect(again().length).toBe(3);
  expect(await todo([])).toEqual({ text: "The to-do list is cleared.", fail: false });
  expect([kept(), again()]).toEqual([[], []]);
  expect(Tools.at_work(chat.tools).text).not.toContain("to-do");
});

test("a list all done is let go, so it leaves the side; one with an item left is kept", async () => {
  const going = [{ text: "Read", status: "done" }, { text: "Write", status: "pending" }];
  expect(await todo(going)).toMatchObject({ fail: false });
  Tools.todo_finished(chat.tools);
  expect(kept()).toEqual(going);
  expect(await todo(going.map((x) => ({ ...x, status: "done" })))).toMatchObject({ fail: false });
  Tools.todo_finished(chat.tools);
  expect([Tools.todo(chat.tools), kept()]).toEqual([[], []]);
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
  expect(upfront.sort()).toEqual(["ask", "date", "projects", "search", "spawn", "tell", "todo", "zoom"]);
  const hosted = Tools.hosted(MASTER);
  expect(hosted).toStartWith("Here you work inside illi (short for illimitable)");
  expect(hosted).not.toContain("You are illi");
  expect(hosted).not.toContain("Your shell, read, write and edit tools");
  expect(hosted).toContain("mcp__illi__");
  expect(Tools.hosted(SUB)).toStartWith("Here you work as a subagent of illi");
  expect(Tools.hosted(SUB)).not.toContain("Your shell, read, write and edit tools");
  const project = temp_repo("illi-tools-project-");
  fs.writeFileSync(project + "/CLAUDE.md", "a rule of the project");
  expect(Tools.system("head", project)).toContain("a rule of the project");
  expect(Tools.system("head", project, "claude-code")).not.toContain("a rule of the project");
}, 20000);

test("Claude Code's permission prompt is judged as illi's own calls: routine work unasked, a risk asked with why, the command whole for the question; yes, no with a reason, don't ask again kept for the project; stopped or no one there, no", async () => {
  const v = View.view_new();
  View.link_open(v, Chat.link(chat, (msg) => void View.view_hear(v, msg)));
  await until(() => v.up);
  const approve = async (tool: string, input: unknown, signal = new AbortController().signal) => JSON.parse((await Tools.call(chat.tools, "main", "approve", { tool_name: tool, input }, signal)).text);
  const answer  = async (yes: boolean, always: boolean, why = "") => {
    await until(() => v.asks.length === 1);
    View.link_send(v, { $: "answer", ask: v.asks[0].id, yes, always, said: why });
  };
  const AGAIN = " Don't run it again as is: ask the user, or do it another way. They can allow it in /permissions.";
  expect(await approve("Bash", { command: "ls -la" })).toEqual({ behavior: "allow", updatedInput: { command: "ls -la" } });
  expect(await approve("Task", { prompt: "look" })).toMatchObject({ behavior: "allow" });
  const yes = approve("Bash", { command: "git push --force origin main" });
  await until(() => v.asks.length === 1);
  expect(v.asks[0]).toMatchObject({ who: "illi", tool: "Bash", what: "git push --force origin main", why: "git push --force origin main rewrites the remote's history", keep: "git push --force origin main" });
  await answer(true, false);
  expect(await yes).toEqual({ behavior: "allow", updatedInput: { command: "git push --force origin main" } });
  await until(() => v.asks.length === 0);
  const no = approve("Bash", { command: "git reset --hard" });
  await answer(false, false, "use the clean script");
  const said = (await no).message;
  expect(said).toStartWith("The user said no, asked at illi's screen: use the clean script. Asked because ");
  expect(said).toEndWith(AGAIN);
  await until(() => v.asks.length === 0);
  expect(chat.tools.perm.refused.at(-1)).toMatchObject({ who: "illi", tool: "Bash", what: "git reset --hard", how: "no", said: "The user said no, asked at illi's screen: use the clean script", exact: ["shell=git reset --hard"] });
  const long = "git reset --hard && echo " + "abcdefghij".repeat(200);
  const cut  = approve("Bash", { command: long });
  await until(() => v.asks.length === 1);
  expect([v.asks[0].what.length, v.asks[0].whole]).toEqual([400, long]);
  await answer(false, false);
  await cut;
  await until(() => v.asks.length === 0);
  expect(chat.tools.perm.refused.at(-1)!.what).toHaveLength(400);
  const doc  = "cat <<'EOF' | git push --force origin main\n" + Array.from({ length: 4000 }, (_, k) => "line " + k + " of a file").join("\n") + "\nEOF";
  const huge = approve("Bash", { command: doc });
  await until(() => v.asks.length === 1);
  const q = v.asks[0];
  expect([q.whole!.length, q.more, q.whole + doc.slice(32000) === doc]).toEqual([32000, doc.length - 32000, true]);
  expect([q.keep!.length <= 1003, q.keep!.startsWith("cat <<'EOF' | git push --force origin main\nline 0 of a file"), q.keep!.includes(" … "), q.keep!.endsWith("line 3999 of a file\nEOF")]).toEqual([true, true, true, true]);
  await answer(false, false);
  await huge;
  await until(() => v.asks.length === 0);
  const always = approve("Bash", { command: "git push origin main" });
  await until(() => v.asks.length === 1);
  expect(v.asks[0].keep).toBe("git push *");
  await answer(true, true);
  expect((await always).behavior).toBe("allow");
  await until(() => v.asks.length === 0);
  expect(await approve("Bash", { command: "git push origin dev" })).toMatchObject({ behavior: "allow" });
  expect(chat.asks).toEqual([]);
  const stop    = new AbortController();
  const count   = chat.tools.perm.refused.length;
  const stopped = approve("Write", { file_path: AWAY + "/a-illi-test.txt", content: "x" }, stop.signal);
  await until(() => v.asks.length === 1);
  expect(v.asks[0].what).toBe(AWAY + "/a-illi-test.txt");
  stop.abort();
  expect((await stopped).message).toStartWith("The request was stopped. Asked because ");
  expect(chat.tools.perm.refused).toHaveLength(count);
  await until(() => v.asks.length === 0);
  chat.tools.perm.mode = "read-only";
  expect(await approve("Edit", { file_path: "src/x-illi-test.ts" })).toEqual({ behavior: "deny", message: "Not run: illi is in read-only mode: changing src/x-illi-test.ts. The user can switch with /mode, or allow just this in /permissions." });
  expect(chat.tools.perm.refused.at(-1)).toMatchObject({ how: "mode", exact: ["write=" + REPO + "/src/x-illi-test.ts"] });
  chat.tools.perm.mode = null;
  v.ws!.close();
  await until(() => chat.socks.size === 0);
  expect((await approve("Edit", { file_path: AWAY + "/b-illi-test.txt" })).message).toStartWith("No one is at illi's screen to ask, so it isn't allowed. Asked because ");
  chat.tools.perm.refused.length = 0;
});

test("illi's own shell, files and MCP tools pass the same checks: the user's rules first, a file that won't read asks; what runs runs", async () => {
  const call = (name: string, args: object) => Tools.call(chat.tools, "main", name, args, new AbortController().signal);
  expect(await call("shell", { command: "echo hi" })).toMatchObject({ text: expect.stringMatching(/^hi\n/), fail: false });
  expect((await call("shell", { command: "git push --force" })).text).toStartWith("No one is at illi's screen to ask");
  fs.writeFileSync(config.PERMISSIONS, JSON.stringify({ rules: { shell: { "echo *": "deny" }, read: { "~/.bashrc": "allow" } } }));
  expect(await call("shell", { command: "echo hi" })).toEqual({ text: "Not run: the user's permission rules refuse it (your rules refuse echo hi). Don't run it, nor anything that does the same: ask the user if you need it.", fail: true });
  expect(chat.tools.perm.refused.at(-1)).toMatchObject({ how: "rule", exact: [] });
  fs.writeFileSync(config.PERMISSIONS, "{ broken");
  expect((await call("shell", { command: "ls" })).text).toContain("Asked because illi can't read your permission rules (" + config.PERMISSIONS + ": ");
  fs.rmSync(config.PERMISSIONS);
  chat.tools.perm.refused.length = 0;
});

test("the loop guard, in auto: a call the same (tool and input) as its caller's two before it is asked, saying so, illi's own tools too; another call between, another caller or another mode, not", async () => {
  const call = (name: string, args: object, who = "main") => Tools.call(chat.tools, who, name, args, new AbortController().signal);
  const looped = "No one is at illi's screen to ask, so it isn't allowed. Asked because the same call a third time in a row";
  chat.tools.perm.calls.clear();
  chat.tools.perm.mode = "auto";
  try {
    expect((await call("projects", {})).fail).toBe(false);
    expect((await call("projects", {})).fail).toBe(false);
    expect((await call("projects", {})).text).toStartWith(looped);
    expect((await call("projects", {})).text).toStartWith(looped);
    expect(chat.tools.perm.refused.at(-1)).toMatchObject({ how: "no", tool: "projects", why: "the same call a third time in a row", exact: [] });
    expect((await call("search", { words: "loop" })).fail).toBe(false);
    expect((await call("projects", {})).fail).toBe(false);
    expect((await call("shell", { command: "echo loop" })).text).toStartWith("loop\n");
    expect((await call("shell", { command: "echo loop" })).text).toStartWith("loop\n");
    expect((await call("shell", { command: "echo loop", timeout: 5 })).text).toStartWith("loop\n");
    expect((await call("shell", { command: "echo loop" })).text).toStartWith("loop\n");
    expect((await call("shell", { command: "echo loop" })).text).toStartWith("loop\n");
    expect((await call("projects", {}, "Scout")).fail).toBe(false);
    expect((await call("shell", { command: "echo loop" })).text).toStartWith(looped);
    chat.tools.perm.mode = "careful";
    expect((await call("shell", { command: "echo loop" })).text).toStartWith("loop\n");
  } finally {
    chat.tools.perm.mode = null;
    chat.tools.perm.calls.clear();
    chat.tools.perm.refused.length = 0;
  }
});

test("the loop guard: a yes starts that caller's count again from none, so a poll goes on two more times before it asks again; no ends it", async () => {
  const v = View.view_new();
  View.link_open(v, Chat.link(chat, (msg) => void View.view_hear(v, msg)));
  await until(() => v.up);
  const poll  = () => Tools.call(chat.tools, "main", "shell", { command: "echo poll" }, new AbortController().signal);
  const reply = async (yes: boolean) => {
    await until(() => v.asks.length === 1);
    expect(v.asks[0]).toMatchObject({ tool: "shell", what: "echo poll", why: "the same call a third time in a row", keep: "" });
    View.link_send(v, { $: "answer", ask: v.asks[0].id, yes, always: false, said: "" });
  };
  chat.tools.perm.calls.clear();
  chat.tools.perm.mode = "auto";
  try {
    expect((await poll()).text).toStartWith("poll\n");
    expect((await poll()).text).toStartWith("poll\n");
    const third = poll();
    await reply(true);
    expect((await third).text).toStartWith("poll\n");
    await until(() => v.asks.length === 0);
    expect((await poll()).text).toStartWith("poll\n");
    expect((await poll()).text).toStartWith("poll\n");
    const sixth = poll();
    await reply(false);
    expect((await sixth).text).toContain("Asked because the same call a third time in a row");
    await until(() => v.asks.length === 0);
  } finally {
    chat.tools.perm.mode = null;
    chat.tools.perm.calls.clear();
    chat.tools.perm.refused.length = 0;
    v.ws!.close();
    await until(() => chat.socks.size === 0);
  }
});

test("a plugin's hooks come first: its input is what the checks judge and Claude Code runs, its refusal final, its ask asked, its allow run, what it adds after the answer, what the model reads its last say; its tools run", async () => {
  const { Plugins } = await import("../config/Plugins.ts");
  fs.mkdirSync(DIR + "/plugins", { recursive: true });
  fs.writeFileSync(DIR + "/plugins/p.ts", `export default function (illi: any) {
  illi.on("tool.before", (call: any) => call.input?.command === "echo swap" ? { input: { command: "git push --force" } } : call.input?.command === "echo old" ? { input: { command: "ls" } } : call.input?.command === "echo nope" ? { block: "The plugin says no." } : undefined);
  illi.on("tool.before", (call: any) => call.input?.command === "echo told" ? { context: "told more" } : call.input?.command === "echo asked" ? { ask: "the plugin wants a look" } : /illi-hooked-secret/.test(call.input?.command ?? "") ? { allow: true } : undefined);
  illi.on("tool.after", (call: any) => call.input?.command === "echo seen" ? { text: call.output.text + "(seen)" } : undefined);
  illi.tool({ name: "twice", description: "doubles x", run: (input: any) => String(2 * input.x) });
}
`);
  await Plugins.load(REPO, () => false);
  const call = (name: string, args: object) => Tools.call(chat.tools, "main", name, args, new AbortController().signal);
  try {
    expect((await call("shell", { command: "echo swap" })).text).toStartWith("No one is at illi's screen to ask, so it isn't allowed. Asked because git push --force ");
    expect(await call("shell", { command: "echo nope" })).toEqual({ text: "The plugin says no.", fail: true });
    expect((await call("shell", { command: "echo seen" })).text).toEndWith("(seen)");
    expect((await call("shell", { command: "echo told" })).text).toEndWith("\n\nFrom the plugin p:\ntold more");
    expect((await call("shell", { command: "echo asked" })).text).toStartWith("No one is at illi's screen to ask, so it isn't allowed. Asked because the plugin wants a look");
    expect((await call("shell", { command: "cat ~/.ssh/illi-hooked-secret" })).text).not.toContain("No one is at illi's screen");
    expect(Tools.list(chat.tools, "main").map((t) => t.name)).toContain("plugin__p__twice");
    expect(await call("plugin__p__twice", { x: 21 })).toMatchObject({ text: "42", fail: false });
    const approve = async (input: object) => JSON.parse((await call("approve", { tool_name: "Bash", input })).text);
    expect(await approve({ command: "echo nope" })).toEqual({ behavior: "deny", message: "The plugin says no." });
    expect((await approve({ command: "echo swap" })).message).toStartWith("No one is at illi's screen to ask");
    expect(await approve({ command: "echo old" })).toEqual({ behavior: "allow", updatedInput: { command: "ls" } });
  } finally {
    Plugins.reset();
    chat.tools.perm.refused.length = 0;
  }
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

test("projects: the table, this chat's marked; a search in this project, another or all; zoom and date in another project's chat; each call names the project", async () => {
  const here  = Projects.place(REPO).name;
  const other = Store.open(DIR + "/chat", { key: "git:/work/site", name: "site-7q2m0d", path: "/work/site" });
  const date  = "2026-10-01T10:00:00.000Z";
  Store.push(other, [{ i: 0, kind: "user", text: "the waveform on the landing page", date, size: 38 }], "/work/site");
  Store.nodes(other, [{ first: 0, n: 1, text: "user: the waveform on the landing page" }]);
  const call = (name: string, args: object) => Tools.call(chat.tools, "main", name, args, new AbortController().signal);
  const table = (await call("projects", {})).text;
  expect(table).toContain(here + " (this chat's) · " + REPO);
  expect(table).toContain("site-7q2m0d · /work/site · 2026-10-01 · 1 message\n  lately: user: the waveform on the landing page");
  expect((await call("search", { words: "waveform" })).text).toBe("No summary line holds that word in this project.");
  expect((await call("search", { words: "landing waveform", project: "all" })).text).toBe("site-7q2m0d 0+1|user: the waveform on the landing page");
  expect((await call("search", { words: "waveform", project: "site-7q2m0d" })).text).toStartWith("site-7q2m0d 0+1|");
  expect((await call("zoom", { id: 0, n: 1, project: "site-7q2m0d" })).text).toBe("0+0|user: the waveform on the landing page");
  expect((await call("date", { id: 0, project: "site-7q2m0d" })).text).toBe(new Date(date).toLocaleString("sv-SE"));
  expect(await call("zoom", { id: 0, project: "nope" })).toEqual({ text: "No project nope: projects lists them.", fail: true });
  expect((await call("zoom", { id: 0, n: 1, project: here })).text).toStartWith("0+0|");
  expect(Tools.here(chat.tools).text).toContain(", project " + here + "\n");
  Store.close(other);
});

test("what a tool would do: a command, a file, a URL or a query, else the input; whole for the question, cut short elsewhere", () => {
  expect(Tools.what({ command: "git status", description: "x" })).toBe("git status");
  expect(Tools.what({ file_path: "src/a.ts", old_string: "a" })).toBe("src/a.ts");
  expect(Tools.what({ url: "https://example.com", prompt: "p" })).toBe("https://example.com");
  expect(Tools.what({ pattern: "TODO" })).toBe("TODO");
  expect(Tools.what({ n: 1 })).toBe('{"n":1}');
  expect(Tools.what({ command: "x".repeat(1000) })).toHaveLength(400);
  expect(Tools.whole({ command: "x".repeat(1000) })).toEqual({ whole: "x".repeat(1000), more: 0 });
  expect(Tools.whole({ command: "x".repeat(40000) })).toEqual({ whole: "x".repeat(32000), more: 8000 });
  expect(Tools.whole({ command: "x".repeat(31999) + "😀" + "x".repeat(10) })).toEqual({ whole: "x".repeat(31999), more: 12 });
});

test("a long text by its ends: whole up to the most, else its start and its end about an ellipsis, a surrogate pair kept whole", () => {
  expect(Tools.ends("abcdef", 6)).toBe("abcdef");
  expect(Tools.ends("abcdefgh", 6)).toBe("abc … fgh");
  expect(Tools.ends("ab😀cdefgh😀ij", 6)).toBe("ab … 😀ij");
});

test("a subagent's view within its model's budget: the oldest lines left out, said so; the opening and the newest kept", () => {
  const view = [{ text: "<chat>\n", mark: false }, ...["a", "b", "c", "d"].map((x) => ({ text: x.repeat(100), mark: false })), { text: "</chat>\n", mark: true }];
  expect(Tools.fitted(view, 10000)).toBe(view);
  const cut = Tools.fitted(view, 250);
  expect(cut.map((b) => b.text[0])).toEqual(["<", "(", "c", "d", "<"]);
  expect(cut[1].text).toContain("zoom and search find them");
  expect(Tools.fitted(view, 1).map((b) => b.text[0])).toEqual(["<", "(", "<"]);
});
