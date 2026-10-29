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
// Claude Code gets only the tools it lacks (?lean), its permission prompt
// whatever tools its agent lists (no other caller ever gets it; a yes
// never echoes the input, a long one past what Claude Code takes from a
// tool, only one a hook changed), and
// prompts that say it works inside illi (a subagent named only illi's
// tools it has, one started fresh none that read the chat), the
// project's CLAUDE.md left to Claude Code. Its
// permission prompt, and illi's own tools, pass the permission checks
// (Permissions.ts, Access.ts; in a throwaway repository): what stays in
// the project runs, a folder outside asked with why, the question given
// the command whole up to 32,000 characters, how many more left out (a
// note and the refused list, cut short), and where what asked is (a
// file's: nowhere); past 32,000 each line holding it still, after a line
// saying how much was left out (a minified line's from just before it;
// lines one after another as one); what don't ask again saves, saved
// for the project; trust mode runs what is asked; a rule's deny refuses,
// a file that won't read asks; a refusal recorded and told to the
// model; a plugin's hooks come before them and after the tool. The projects: their table,
// a search across them, a zoom into another's chat. date both ways: a
// message's date (Wed 21 Oct 2026 14:05), a span's lines (another
// project's too, its project named for the zoom), what isn't a span
// refused, a field sent as null or "" read as left out; a search kept to
// a span (to alone: all up to it), one whose span won't read searching
// every date, saying so; the projects' days in illi's zone. The time
// now in each call's message, short on claude-code, after every cache
// mark a later call reads. A subagent outgrowing its model's window
// (its room a turn's) recaps its own log and goes on from the recap,
// unasked: the recap's request cut to fit in bytes, each long line to
// its head and tail (a surrogate pair kept whole), halved while still
// too long; its task, and a message told meanwhile, kept whole, a
// restart reading it so, and only what its calls get naming the lines
// it holds (recall); three recaps in a row with no call grown end its
// run, saying why, as a recap that fails does. A subagent's call refused
// for its cache marks goes on from a note, its next call unmarked, once
// (refused so again, its run ends, saying why).

import { expect, setSystemTime, test } from "bun:test";
import * as fs from "node:fs";
import { temp_dir, temp_repo } from "../../test/repo.ts";

const DIR = temp_dir("illi-tools-");
process.env.ILLI_DIR = DIR;

// the chat's project: a throwaway repository (no remote), so what its
// calls run acts there, never on this checkout; folders outside it (its
// files asked about): one not this user's to write, one that is there
const REPO = temp_repo("illi-tools-repo-");
const AWAY = "/illi-tools-away";
const OUT  = temp_dir("illi-tools-out-");

const { Chat } = await import("../chat/Chat.ts");
const config = await import("../config/Config.ts");
const { MASTER, SUB, SUB_FRESH, Tools } = await import("./Tools.ts");
const { Projects } = await import("../chat/Projects.ts");
const { Store } = await import("../chat/Store.ts");
const { Memory } = await import("../chat/Memory.ts");
const { AskAI } = await import("../ai/AskAI.ts");
const { When } = await import("../chat/When.ts");
const { Logs } = await import("../chat/Logs.ts");
const { Pick } = await import("../ai/Pick.ts");
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

// a plain subagent given `task`, its model a window of `window` tokens
// (asked by its label, as the catalog knows it) till it reports, so the
// chat's turn then gets its own:
// the agent's calls answered in turn by `work` (k: the call's place
// among them), its recaps by `recap` (k: the recap's), any other call
// (the chat's turn as the report comes, a summary) at once; its calls,
// its recaps', the report the chat got and the turns it started
async function sub(task: string, window: number, work: (k: number, feed: any, name: string) => void, recap: (k: number, feed: any, name: string) => void) {
  const real = { ask: AskAI.ask, window: Pick.window, report: chat.tools.hooks.report };
  let running = true;
  chat.tools.hooks.report = (agent, text, stopped) => ((running = false), real.report(agent, text, stopped));
  const [calls, recaps, turns]: [any[], any[], any[]] = [[], [], []];
  let name = "";
  Pick.window = (p) => (!running ? real.window(p) : Pick.model(p.vendor, p.model) === undefined ? undefined : window);
  AskAI.ask = (a, on) => {
    const [call, feed] = AskAI.tie(on, () => {}, () => {});
    const list = !a.system.includes("You are a subagent of illi") ? null : a.once ? recaps : calls;
    list?.push(a);
    (a.keep ? turns : []).push(a);
    queueMicrotask(() => (list === null ? feed.end({ ok: true, text: "noted", left: [] }) : (list === calls ? work : recap)(list.length - 1, feed, name)));
    return call;
  };
  try {
    name = Tools.start(chat.tools, { $: "sub", effort: null, agent: null }, task, []);
    const report = () => Array.from({ length: chat.mem.count }, (_, i) => Memory.message(chat.mem, i)!).find((m) => m.kind === "work" && m.text.startsWith("[" + name + "]"));
    await until(() => report() !== undefined);
    await Bun.sleep(20);
    await until(() => !chat.busy);
    return { name, calls, recaps, report: report()!.text, turns: turns.length };
  } finally {
    [AskAI.ask, Pick.window, chat.tools.hooks.report] = [real.ask, real.window, real.report];
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

test("a user's subagent that lists its tools, in Claude Code, still gets the permission prompt Claude Code asks through", () => {
  fs.mkdirSync(DIR + "/agents", { recursive: true });
  fs.writeFileSync(DIR + "/agents/limited.md", "---\ndescription: reads only\nmode: subagent\ntools: zoom\n---\nRead, never edit.\n");
  chat.tools.agents.set("limited", { name: "limited", run: 0, role: { $: "sub", effort: null, agent: "limited" }, call: null, live: [], calls: {}, stop: false, view: [], replies: [] });
  try {
    expect(Tools.list(chat.tools, "limited", true).map((t) => t.name)).toEqual(["zoom", "approve"]);
    expect(Tools.list(chat.tools, "limited", false).map((t) => t.name)).toEqual(["zoom"]);
  } finally {
    chat.tools.agents.delete("limited");
    fs.rmSync(DIR + "/agents/limited.md");
  }
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
  expect(Tools.hosted(SUB_FRESH)).toStartWith("Here you work as a subagent of illi");
  expect(Tools.hosted(SUB_FRESH)).not.toContain("Your shell, read, write and edit tools");
  expect(Tools.hosted(SUB_FRESH + "\n\n# Agent: tester")).toContain("mcp__illi__");
  expect(Tools.hosted(SUB_FRESH + "\n\n# Agent: tester")).not.toMatch(/\b(zoom|date|projects|search|todo)\b/);
  expect(Tools.hosted(SUB)).toContain("zoom");
  expect(Tools.hosted(SUB + "\n\n# Agent: reviewer").split("\n\n").at(-1)).toBe("illi's own tools (zoom, date, projects, search, skill and the user's MCP\nservers in illi) come from illi, as its MCP server's (mcp__illi__).");
  expect(Tools.hosted(MASTER)).toContain("illi's todo");
  expect(Tools.hosted(SUB)).not.toContain("Your shell, read, write and edit tools");
  const project = temp_repo("illi-tools-project-");
  fs.writeFileSync(project + "/CLAUDE.md", "a rule of the project");
  expect(Tools.system("head", project)).toContain("a rule of the project");
  expect(Tools.system("head", project, "claude-code")).not.toContain("a rule of the project");
}, 20000);

test("Claude Code's permission prompt is judged as illi's own calls, a yes never echoing the input (a long one would pass what Claude Code takes from a tool): what stays in the project unasked, a folder outside asked with why, the command whole for the question; yes, no with a reason, don't ask again saved for the project; trust runs it; stopped or no one there, no", async () => {
  const v = View.view_new();
  View.link_open(v, Chat.link(chat, (msg) => void View.view_hear(v, msg)));
  await until(() => v.up);
  const approve = async (tool: string, input: unknown, signal = new AbortController().signal) => JSON.parse((await Tools.call(chat.tools, "main", "approve", { tool_name: tool, input }, signal)).text);
  const answer  = async (yes: boolean, always: boolean, why = "") => {
    await until(() => v.asks.length === 1);
    View.link_send(v, { $: "answer", ask: v.asks[0].id, yes, always, said: why });
  };
  const AGAIN = " Don't run it again as is: ask the user, or do it another way. They can allow it in /permissions.";
  const OUTSIDE = "it reaches outside the project: " + OUT + "/";
  expect(await approve("Bash", { command: "rm -rf build && git push --force origin main" })).toEqual({ behavior: "allow" });
  expect(await approve("Write", { file_path: "page.html", content: "<p>long</p>\n".repeat(20000) })).toEqual({ behavior: "allow" });
  expect(await approve("Task", { prompt: "look" })).toMatchObject({ behavior: "allow" });
  const yes = approve("Bash", { command: "cat " + OUT + "/notes.txt" });
  await until(() => v.asks.length === 1);
  expect(v.asks[0]).toMatchObject({ who: "illi", tool: "Bash", what: "cat " + OUT + "/notes.txt", why: OUTSIDE, keep: "files in " + OUT + "/" });
  await answer(true, false);
  expect(await yes).toEqual({ behavior: "allow" });
  await until(() => v.asks.length === 0);
  const nested = approve("Bash", { command: "ls " + OUT + "/a/b/x.txt " + OUT + "/a/y.txt " + OUT + "/z.txt" });
  await until(() => v.asks.length === 1);
  expect(v.asks[0]).toMatchObject({ why: OUTSIDE, keep: "files in " + OUT + "/" });
  await answer(true, true);
  await nested;
  await until(() => v.asks.length === 0);
  expect(JSON.parse(fs.readFileSync(config.PERMISSIONS, "utf8")).projects[chat.tools.cwd]).toEqual({ saved: [{ action: "external_directory", resource: OUT + "/*" }] });
  fs.rmSync(config.PERMISSIONS);
  const wild = approve("Bash", { command: "cat \"" + OUT + "/*/x\" " + OUT + "/a/y.txt" });
  await until(() => v.asks.length === 1);
  expect(v.asks[0]).toMatchObject({ why: "it reaches outside the project: " + OUT + "/*/, " + OUT + "/a/", keep: "files in " + OUT + "/a/" });
  await answer(true, false);
  await wild;
  await until(() => v.asks.length === 0);
  const no = approve("Write", { file_path: OUT + "/a-illi-test.txt", content: "x" });
  await answer(false, false, "keep it in the repo");
  expect((await no).message).toBe("The user said no, asked at illi's screen: keep it in the repo. Asked because " + OUTSIDE + "." + AGAIN);
  await until(() => v.asks.length === 0);
  expect(chat.tools.perm.refused.at(-1)).toMatchObject({ who: "illi", tool: "Write", what: OUT + "/a-illi-test.txt", how: "no", said: "The user said no, asked at illi's screen: keep it in the repo", exact: [{ action: "external_directory", resource: OUT + "/*" }] });
  const long = "cat " + OUT + "/x && echo " + "abcdefghij".repeat(200);
  const cut  = approve("Bash", { command: long });
  await until(() => v.asks.length === 1);
  expect([v.asks[0].what.length, v.asks[0].whole, v.asks[0].spots!.map((s) => long.slice(...s))]).toEqual([400, long, ["cat " + OUT + "/x"]]);
  await answer(false, false, "no");
  await cut;
  await until(() => v.asks.length === 0);
  expect(chat.tools.perm.refused.at(-1)!.what).toHaveLength(400);
  const doc  = "cat <<'EOF' > ok.txt\n" + Array.from({ length: 4000 }, (_, k) => "line " + k + " of a file").join("\n") + "\nEOF\ncp ok.txt " + OUT + "/";
  const huge = approve("Bash", { command: doc });
  await until(() => v.asks.length === 1);
  const q = v.asks[0];
  expect([q.whole!.startsWith(doc.slice(0, 32000)), q.whole!.endsWith("\ncp ok.txt " + OUT + "/"), q.cuts!.length, q.more, q.spots!.map((s) => q.whole!.slice(...s))]).toEqual([true, true, 1, 0, ["cp ok.txt " + OUT + "/"]]);
  await answer(false, false, "no");
  await huge;
  await until(() => v.asks.length === 0);
  fs.writeFileSync(config.PERMISSIONS, JSON.stringify({ rules: { shell: { "git push *": "ask" } } }));
  const always = approve("Bash", { command: "ls && git push origin main" });
  await until(() => v.asks.length === 1);
  expect(v.asks[0]).toMatchObject({ why: "your rule asks about git push *", keep: "git push *" });
  await answer(true, true);
  expect((await always).behavior).toBe("allow");
  await until(() => v.asks.length === 0);
  expect(await approve("Bash", { command: "git push origin dev" })).toMatchObject({ behavior: "allow" });
  expect(JSON.parse(fs.readFileSync(config.PERMISSIONS, "utf8")).projects[chat.tools.cwd]).toEqual({ saved: [{ action: "shell", resource: "git push *" }] });
  fs.rmSync(config.PERMISSIONS);
  expect(chat.asks).toEqual([]);
  const stop    = new AbortController();
  const count   = chat.tools.perm.refused.length;
  const stopped = approve("Write", { file_path: AWAY + "/a-illi-test.txt", content: "x" }, stop.signal);
  await until(() => v.asks.length === 1);
  expect([v.asks[0].what, v.asks[0].spots]).toEqual([AWAY + "/a-illi-test.txt", undefined]);
  stop.abort();
  expect((await stopped).message).toStartWith("The request was stopped. Asked because ");
  expect(chat.tools.perm.refused).toHaveLength(count);
  await until(() => v.asks.length === 0);
  chat.tools.perm.mode = "trust";
  expect(await approve("Edit", { file_path: AWAY + "/b-illi-test.txt" })).toMatchObject({ behavior: "allow" });
  chat.tools.perm.mode = null;
  v.ws!.close();
  await until(() => chat.socks.size === 0);
  expect((await approve("Edit", { file_path: AWAY + "/b-illi-test.txt" })).message).toStartWith("No one is at illi's screen to ask, so it isn't allowed. Asked because ");
  chat.tools.perm.refused.length = 0;
});
test("a folder refused, allowed for the run (/permissions), allows it and those in it; one whose path holds a wildcard character, that folder alone", () => {
  const was = chat.tools.perm.allowed.length;
  const refused = (id: string, resource: string) => ({ id, who: "illi", tool: "shell", what: "cat x", why: "", how: "no", said: "", at: 1, exact: [{ action: "external_directory", resource }] }) as any;
  chat.tools.perm.refused.push(refused("w1", OUT + "/*/*"), refused("w2", OUT + "/b/*"));
  Tools.allow(chat.tools, "w1");
  Tools.allow(chat.tools, "w2");
  expect(chat.tools.perm.allowed.slice(was).map((a: any) => [a.resource, a.exact])).toEqual([[OUT + "/*/*", true], [OUT + "/b/*", false]]);
  chat.tools.perm.allowed.length = was;
});

test("illi customizes itself unasked: a skill, a command, an agent, its rules written by its tools or its shell; its settings, hooks and permissions beside them asked", async () => {
  const guard = (tool: string, input: object) => Tools.guard(chat.tools, "main", tool, input, new AbortController().signal);
  const NO = "No one is at illi's screen to ask, so it isn't allowed. Asked because it reaches outside the project: ";
  expect(await guard("write", { path: config.ROOT + "/skills/notes/SKILL.md", content: "x" })).toBeNull();
  expect(await guard("edit", { edits: [{ path: config.ROOT + "/commands/ship.md" }, { path: config.ROOT + "/agents/scout.md" }] })).toBeNull();
  expect(await guard("write", { path: config.ROOT + "/RULES.md", content: "x" })).toBeNull();
  expect(await guard("shell", { command: "mkdir -p " + config.ROOT + "/skills/pdf && cat > " + config.ROOT + "/skills/pdf/SKILL.md <<'EOF'\nx\nEOF" })).toBeNull();
  expect((await guard("write", { path: config.ROOT + "/hooks.json", content: "{}" }))!.text).toStartWith(NO);
  expect((await guard("shell", { command: "echo '{}' > " + config.ROOT + "/permissions.json" }))!.text).toStartWith(NO);
  expect((await guard("write", { path: config.ROOT + "/config.json", content: "{}" }))!.text).toStartWith(NO);
  chat.tools.perm.refused.length = 0;
});

test("illi's own tools pass the same checks: what stays in the project runs; the user's rules after illi's, a deny refusing; a file that won't read asks; what runs runs", async () => {
  const call = (name: string, args: object) => Tools.call(chat.tools, "main", name, args, new AbortController().signal);
  expect(await call("shell", { command: "echo hi" })).toMatchObject({ text: expect.stringMatching(/^hi\n/), fail: false });
  expect((await call("shell", { command: "ls " + OUT })).text).toStartWith("No one is at illi's screen to ask");
  expect((await call("read", { path: ".env" })).text).toBe("No one is at illi's screen to ask, so it isn't allowed. Asked because it reads a .env file, which may hold secrets. Don't run it again as is: ask the user, or do it another way. They can allow it in /permissions.");
  fs.writeFileSync(config.PERMISSIONS, JSON.stringify({ rules: { shell: { "echo *": "deny" }, external_directory: { [OUT + "/*"]: "allow" } } }));
  expect(await call("shell", { command: "echo hi" })).toEqual({ text: "Not run: your rule denies echo *. Don't run it, nor anything that does the same: ask the user if you need it.", fail: true });
  expect(chat.tools.perm.refused.at(-1)).toMatchObject({ how: "rule", exact: [] });
  expect((await call("shell", { command: "ls " + OUT })).fail).toBe(false);
  fs.writeFileSync(config.PERMISSIONS, "{ broken");
  expect((await call("shell", { command: "ls" })).text).toContain("Asked because illi can't read your permission rules (" + config.PERMISSIONS + ": ");
  expect((await call("projects", {})).fail).toBe(false);
  fs.rmSync(config.PERMISSIONS);
  chat.tools.perm.refused.length = 0;
});
test("a plugin's hooks come first: its input is what the checks judge and Claude Code runs, its refusal final, its ask asked, its allow run (a folder outside the project too), what it adds after the answer, what the model reads its last say; its tools run", async () => {
  const { Plugins } = await import("../config/Plugins.ts");
  fs.mkdirSync(DIR + "/plugins", { recursive: true });
  fs.writeFileSync(DIR + "/plugins/p.ts", `export default function (illi: any) {
  illi.on("tool.before", (call: any) => call.input?.command === "echo swap" ? { input: { command: "cat ~/.illi-tools-swap" } } : call.input?.command === "echo old" ? { input: { command: "ls" } } : call.input?.command === "echo nope" ? { block: "The plugin says no." } : undefined);
  illi.on("tool.before", (call: any) => call.input?.command === "echo told" ? { context: "told more" } : call.input?.command === "echo asked" ? { ask: "the plugin wants a look" } : /illi-hooked-secret/.test(call.input?.command ?? call.input?.path ?? "") ? { allow: true } : undefined);
  illi.on("tool.after", (call: any) => call.input?.command === "echo seen" ? { text: call.output.text + "(seen)" } : undefined);
  illi.tool({ name: "twice", description: "doubles x", run: (input: any) => String(2 * input.x) });
}
`);
  await Plugins.load(REPO, () => false);
  const call = (name: string, args: object) => Tools.call(chat.tools, "main", name, args, new AbortController().signal);
  try {
    expect((await call("shell", { command: "echo swap" })).text).toStartWith("No one is at illi's screen to ask, so it isn't allowed. Asked because it reaches outside the project: ~/");
    expect(await call("shell", { command: "echo nope" })).toEqual({ text: "The plugin says no.", fail: true });
    expect((await call("shell", { command: "echo seen" })).text).toEndWith("(seen)");
    expect((await call("shell", { command: "echo told" })).text).toEndWith("\n\nFrom the plugin p:\ntold more");
    expect((await call("shell", { command: "echo asked" })).text).toStartWith("No one is at illi's screen to ask, so it isn't allowed. Asked because the plugin wants a look");
    expect((await call("read", { path: "illi-hooked-secret.env" })).text).not.toContain("No one is at illi's screen");
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
  expect((await call("date", { id: 0, project: "site-7q2m0d" })).text).toBe(When.moment(Date.parse(date)));
  expect(await call("zoom", { id: 0, project: "nope" })).toEqual({ text: "No project nope: projects lists them.", fail: true });
  expect((await call("zoom", { id: 0, n: 1, project: here })).text).toStartWith("0+0|");
  expect(Tools.here(chat.tools).text).toContain(", project " + here + "\n");
  Store.close(other);
});

// a run in New York's zone at a set time, whatever the machine's
async function zoned(at: number, run: () => Promise<void> | void): Promise<void> {
  const zone = process.env.TZ;
  process.env.TZ = "America/New_York";
  setSystemTime(new Date(at));
  try {
    await run();
  } finally {
    setSystemTime();
    if (zone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = zone;
    }
  }
}

test("date both ways: a span's lines in another project's chat, its project named for the zoom; what isn't a span refused; a search kept to a span (to alone: all up to it), one that won't read searching every date, saying so", () => zoned(Date.UTC(2026, 9, 25, 18, 5), async () => {
  const other = Store.open(DIR + "/chat", { key: "git:/work/shop", name: "shop-9x1a2b", path: "/work/shop" });
  const dates = ["2026-10-20T16:00:00.000Z", "2026-10-20T17:00:00.000Z", "2026-10-22T16:00:00.000Z"];
  const texts = ["user: the cache bug in checkout", "illi: fixed the cache bug", "user: cache warmup"];
  Store.push(other, dates.map((date, i) => ({ i, kind: "user" as const, text: "m" + i, date, size: 2 })), "/work/shop");
  Store.nodes(other, [...texts.map((text, first) => ({ first, n: 1, text })), { first: 0, n: 2, text: "user, illi: the cache bug, fixed" }]);
  const call = (name: string, args: object) => Tools.call(chat.tools, "main", name, args, new AbortController().signal);
  expect((await call("date", { from: "2026-10-20", project: "shop-9x1a2b" })).text).toBe([
    "Tue 20 Oct 2026 · 2 messages · 12:00–13:00", "0+1|12:00 user: the cache bug in checkout", "1+1|13:00 illi: fixed the cache bug", "Zoom a line to go deeper, with project shop-9x1a2b.",
  ].join("\n"));
  expect((await call("date", { from: "2026-10-21", project: "shop-9x1a2b" })).text).toBe("Nothing on Wed 21 Oct 2026. Before and after it:\n0+2|Tue 20 12:00–13:00 user, illi: the cache bug, fixed\n2+1|Thu 22 12:00 user: cache warmup\nZoom a line to go deeper, with project shop-9x1a2b.");
  expect((await call("date", { id: 2, project: "shop-9x1a2b" })).text).toBe("Thu 22 Oct 2026 12:00");
  expect(await call("date", { from: "last Tuesday" })).toEqual({ text: "from: a local date or date and time, as 2026-10-21 or 2026-10-21 14:00 (or a month, 2026-10; a year, 2026; today, yesterday or now).", fail: true });
  expect(await call("date", { from: "2026-10-21", to: "2026-10-20 12:00" })).toEqual({ text: "to comes before from.", fail: true });
  expect(await call("date", {})).toEqual({ text: "Give id, or from (and to).", fail: true });
  expect(await call("date", { from: "2026-10-21", project: "nope" })).toEqual({ text: "No project nope: projects lists them.", fail: true });
  const found = async (args: object) => (await call("search", { words: "cache", project: "shop-9x1a2b", ...args })).text.split("\n").sort();
  expect(await found({})).toEqual(["shop-9x1a2b 0+1|user: the cache bug in checkout", "shop-9x1a2b 0+2|user, illi: the cache bug, fixed", "shop-9x1a2b 1+1|illi: fixed the cache bug", "shop-9x1a2b 2+1|user: cache warmup"]);
  expect(await found({ from: "2026-10-22" })).toEqual(["shop-9x1a2b 2+1|user: cache warmup"]);
  expect(await found({ from: "2026-10-20 12:30", to: "2026-10-22" })).toEqual(["shop-9x1a2b 1+1|illi: fixed the cache bug", "shop-9x1a2b 2+1|user: cache warmup"]);
  expect(await found({ to: "2026-10-20" })).toEqual(["shop-9x1a2b 0+1|user: the cache bug in checkout", "shop-9x1a2b 0+2|user, illi: the cache bug, fixed", "shop-9x1a2b 1+1|illi: fixed the cache bug"]);
  expect(await found({ from: "2026-10" })).toEqual(await found({}));
  const loose = await call("search", { words: "cache", project: "shop-9x1a2b", from: "last Tuesday" });
  expect(loose.fail).toBe(false);
  expect(loose.text.split("\n\n")[0]).toBe("Every date searched: the span won't read (from: a local date or date and time, as 2026-10-21 or 2026-10-21 14:00 (or a month, 2026-10; a year, 2026; today, yesterday or now)).");
  expect(loose.text.split("\n\n")[1].split("\n").sort()).toEqual(await found({}));
  // a field the model leaves out may come as null or "": left out all the same
  for (const none of [null, ""]) {
    expect((await call("date", { id: 2, from: none, to: none, project: "shop-9x1a2b" })).text).toBe("Thu 22 Oct 2026 12:00");
    expect(await call("date", { id: none, from: none })).toEqual({ text: "Give id, or from (and to).", fail: true });
    expect(await found({ from: none, to: none })).toEqual(await found({}));
    expect(await found({ from: "2026-10-22", to: none })).toEqual(["shop-9x1a2b 2+1|user: cache warmup"]);
  }
  expect(await call("search", { words: "cache", project: null })).toEqual(await call("search", { words: "cache" }));
  // the projects' days are local: 02:00 UTC on the 2nd is the 1st's evening in New York
  const late = Store.open(DIR + "/chat", { key: "git:/work/late", name: "late-4k2p9q", path: "/work/late" });
  Store.push(late, [0, 1].map((i) => ({ i, kind: "user" as const, text: "m", date: ["2026-10-01T14:00:00.000Z", "2026-10-02T02:00:00.000Z"][i], size: 1 })), "/work/late");
  expect((await call("projects", {})).text).toContain("late-4k2p9q · /work/late · 2026-10-01 · 2 messages");
  expect((await call("projects", {})).text).toContain("shop-9x1a2b · /work/shop · 2026-10-20 to 2026-10-22 · 3 messages");
  Store.close(late);
  Store.close(other);
}));

test("the time now, after where illi works, in about ten tokens (on claude-code without the date its own prompt gives); in a subagent's call too, unmarked, after every mark a later call reads", () => zoned(Date.UTC(2026, 9, 25, 18, 5), () => {
  expect(Tools.here(chat.tools).text).toEndWith(", project " + Projects.place(REPO).name + "\nNow: Sun 2026-10-25 14:05 UTC-4\n\n");
  expect(Tools.here(chat.tools, "claude-code").text).toEndWith("\nNow: Sun 14:05 UTC-4\n\n");
  const agent = { name: "Ada", run: 0, role: { $: "sub" as const, effort: null, agent: null }, call: null, live: [], calls: {}, stop: false, view: Memory.view(chat.mem), replies: [] };
  const ask = Tools.ask(chat.tools, agent);
  const at = ask.blocks.findIndex((b) => b.text.startsWith("Working dir: "));
  expect(ask.blocks[at]).toEqual(Tools.here(chat.tools, ask.vendor));
  expect(ask.blocks[at].mark).toBe(false);
  expect(AskAI.keys(ask).length).toBeLessThanOrEqual(at);
  expect(SUB).toContain("(Now:)");
}));

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

test("past 32,000 characters the question still gets each line holding a spot (what made the checks ask), after a line saying how many characters were left out there (where it is told: cuts), the spots moved with them; a minified line's from just before its spot; one in the first 32,000 needs nothing more", () => {
  const doc  = "cat <<'EOF' > notes.txt\n" + Array.from({ length: 3000 }, (_, k) => "echo line " + k + " of a file").join("\n") + "\nEOF\nrm -rf ~/old-site\necho done";
  const at   = doc.indexOf("rm -rf ~/old-site");
  const got  = Tools.whole({ command: doc }, [[0, 23], [at, at + 17]]);
  expect([got.whole.slice(0, 32000) === doc.slice(0, 32000), got.whole.slice(32000), got.more]).toEqual([true, "\n… " + (at - 32000).toLocaleString("en-US") + " characters left out\nrm -rf ~/old-site", "\necho done".length]);
  expect([got.spots!.map((s) => got.whole.slice(...s)), got.cuts!.map((s) => got.whole.slice(...s))]).toEqual([["cat <<'EOF' > notes.txt", "rm -rf ~/old-site"], ["… " + (at - 32000).toLocaleString("en-US") + " characters left out"]]);
  const line = "x=1;".repeat(10000) + "rm -rf ~/old-site;" + "y=2;".repeat(2000);
  const one  = Tools.whole({ command: line }, [[40000, 40017]]);
  expect([one.whole.slice(32000), one.spots!.map((s) => one.whole.slice(...s)), one.more]).toEqual(["\n… 7,800 characters left out\n" + line.slice(39800, 41800), ["rm -rf ~/old-site"], line.length - 41800]);
  expect(Tools.whole({ command: "ls && rm -rf x" }, [[6, 14]])).toEqual({ whole: "ls && rm -rf x", more: 0, spots: [[6, 14]] });
  const lines = "x".repeat(33000) + "\nrm -rf ~/a\nrm -rf ~/b\necho done";
  const [a, b] = [lines.indexOf("rm -rf ~/a"), lines.indexOf("rm -rf ~/b")];
  const next  = Tools.whole({ command: lines }, [[0, lines.length], [a, a + 10], [b, b + 10]]);
  expect([next.whole.slice(32000), next.more, next.spots!.slice(-2).map((s) => next.whole.slice(...s))]).toEqual(["\n… 1,001 characters left out\nrm -rf ~/a\nrm -rf ~/b", "\necho done".length, ["rm -rf ~/a", "rm -rf ~/b"]]);
});

test("a long text by its ends: whole up to the most, else its start and its end about an ellipsis, a surrogate pair kept whole", () => {
  expect(Tools.ends("abcdef", 6)).toBe("abcdef");
  expect(Tools.ends("abcdefgh", 6)).toBe("abc … fgh");
  expect(Tools.ends("ab😀cdefgh😀ij", 6)).toBe("ab … 😀ij");
});

test("an agent's log as its calls get it: whole till a recap; past one, what it is and illi's messages whole, then the last recap on, and only those name lines it holds (recall); cut to fit in bytes, marks counted, each line past a common length to its head and tail, a surrogate pair kept whole, none cut longer", () => {
  const root = (i: number, kind: any, text: string) => Memory.root(i, { kind, text });
  const log = [root(0, "note", "subagent"), root(1, "user", "list it"), root(2, "echo", "a".repeat(50)), root(3, "recap", "r1"), root(4, "user", "and count"), root(5, "echo", "b"), root(6, "recap", "r2"), root(7, "echo", "c")];
  expect(Logs.fit(log.slice(0, 3))).toBe("0|note: subagent\n\n1|user: list it\n\n2|echo: " + "a".repeat(50));
  const name = Logs.start(chat.mem, null, () => false);
  log.forEach((e) => Logs.push(chat.mem, name, e.kind, e.text));
  expect(Logs.view(chat.mem, name).map((e) => e.i)).toEqual([0, 1, 4, 6, 7]);
  expect(Logs.view(chat.mem, "nobody")).toEqual([]);
  const whole = Logs.start(chat.mem, null, () => false);
  log.slice(0, 3).forEach((e) => Logs.push(chat.mem, whole, e.kind, e.text));
  expect(Logs.view(chat.mem, whole).map((e) => e.i)).toEqual([0, 1, 2]);
  // what names a line counts as held only while the agent's calls get it
  const named = Logs.start(chat.mem, null, () => false);
  for (const [kind, text] of [["note", "subagent"], ["user", "look at #12"], ["echo", "0+2|the cache bug"], ["recap", "## Task"], ["echo", "#30+4 · warmup"]]) {
    Logs.push(chat.mem, named, kind as any, text);
  }
  expect(Store.work_naming(chat.mem.store, Logs.log(chat.mem, named)!)).toEqual(["look at #12", "#30+4 · warmup"]);
  Logs.push(chat.mem, whole, "echo", "0+2|the cache bug");
  expect(Store.work_naming(chat.mem.store, Logs.log(chat.mem, whole)!)).toEqual(["0+2|the cache bug"]);
  const cut = Logs.fit([root(0, "user", "short"), root(1, "echo", "h".repeat(400) + "t".repeat(400))], 200);
  expect(cut).toStartWith("0|user: short\n\n1|echo: hhh");
  expect(cut).toEndWith("ttt");
  expect(cut).toContain("characters cut ...]");
  expect(cut.length).toBeLessThan(300);
  for (const most of [101, 102, 103, 150, 151]) {
    const pairs = Logs.fit([root(0, "echo", "😀".repeat(400))], most);
    expect([most, /\uFFFD/.test(pairs), pairs.replace(/\n\[\.\.\. \d+ characters cut \.\.\.\]\n/, "").replace(/^0\|echo: /, "").replace(/😀/g, "")]).toEqual([most, false, ""]);
  }
  const many = Array.from({ length: 3000 }, (_, i) => root(i, "echo", "line " + i + " of a short result"));
  const uncut = Memory.bytes(Logs.fit(many));
  for (const part of [2, 8]) {
    expect(Memory.bytes(Logs.fit(many, uncut / part))).toBeLessThanOrEqual(uncut);
  }
  const cjk = Logs.fit([root(0, "echo", "漢".repeat(3000))], 3000);
  expect(Memory.bytes(cjk)).toBeLessThan(3000 + 60);
  // cut by bytes, not by characters: wide ends round a narrow middle fit too, never longer than uncut
  const ends = (n: number, mid: number) => [root(0, "echo", "中".repeat(n) + "a".repeat(mid) + "中".repeat(n))];
  const near = Memory.bytes(Logs.fit(ends(2000, 30)));
  expect(Memory.bytes(Logs.fit(ends(2000, 30), near - 1))).toBeLessThan(near);
  for (const most of [20000, 12000, 6000]) {
    expect([most, Memory.bytes(Logs.fit(ends(3000, 30000), most)) <= most]).toEqual([most, true]);
  }
});

test("a subagent outgrowing its model's window recaps its own log and goes on from the recap, unasked: its room a turn's; the recap's request cut to fit, halved while still too long; its task, and a message told meanwhile, kept whole; after a restart its calls start at the recap", async () => {
  const big = "EARLY " + "x".repeat(100000) + " LATE";
  const got = await sub("list the folder", 10000, (k, feed) => {
    if (k === 0) {
      feed.on({ $: "Entry", kind: "tool", text: "shell: ls", of: "t1" });
      feed.on({ $: "Entry", kind: "echo", text: big, of: "t1" });
      feed.end({ ok: false, text: "", left: [], stop: "full", grew: true });
    } else {
      feed.end({ ok: true, text: "listed: 3 files", left: [] });
    }
  }, (k, feed, name) => {
    if (k === 0) {
      feed.end({ ok: false, text: "HTTP 400: prompt is too long", left: [], stop: "full" });
    } else {
      void Tools.tell(chat.tools, name, "also count the files");
      feed.on({ $: "Delta", kind: "illi", text: "## Task" });
      feed.end({ ok: true, text: "## Task\n- list the folder", left: [] });
    }
  });
  expect([got.calls.length, got.recaps.length]).toEqual([2, 2]);
  expect([got.calls[0].room, got.calls[0].once, got.recaps[0].room, got.recaps[0].once]).toEqual([9000, undefined, undefined, true]);
  const [first, second] = got.recaps.map((a) => a.blocks.at(-2).text as string);
  expect(got.recaps[0].blocks.at(-1).text).toStartWith("Recap: your context is full.");
  expect([first.length < 7000 * 4 + 200, first.includes("1|user: list the folder"), first.includes("EARLY"), first.includes("LATE"), first.includes("characters cut")]).toEqual([true, true, true, true, true]);
  expect(second.length).toBeLessThan(first.length / 2 + 200);
  const view = got.calls[1].blocks.at(-1).text as string;
  expect(view).not.toContain("EARLY");
  for (const line of ["0|note: subagent", "1|user: list the folder", "4|user: also count the files", "5|recap: ## Task\n- list the folder", "6|note: Your context filled up", 'zoom("' + Logs.log(chat.mem, got.name) + '")']) {
    expect(view).toContain(line);
  }
  expect(Logs.read(chat.mem, got.name)!.map((e) => e.kind)).toEqual(["note", "user", "tool", "echo", "user", "recap", "note"]);
  expect(got.report).toStartWith("[" + got.name + "]\nlisted: 3 files\n");
  chat.tools.agents.delete(got.name);
  expect(Tools.ask(chat.tools, Tools.agent(chat.tools, got.name)!).blocks.at(-1)!.text).toBe(view);
});

test("a subagent's call refused for its cache marks goes on from a note, its next call unmarked, once: refused so again, its run ends saying why", async () => {
  const why = "API Error: 400 A maximum of 4 blocks with cache_control may be provided. Found 5.";
  const none = () => {};
  const once = await sub("look", 10000, (k, feed) => feed.end(k === 0 ? { ok: false, text: why, left: [], stop: "marks" } : { ok: true, text: "looked", left: [] }), none);
  expect(once.calls.map((a) => a.blocks.some((b: any) => b.mark))).toEqual([true, false]);
  expect(once.calls[1].blocks.at(-1).text).toContain("note: Claude Code's request was refused over a technical limit, so your work goes on a simpler way.");
  expect(once.report).toStartWith("[" + once.name + "]\nlooked\n");
  const twice = await sub("look", 10000, (_, feed) => feed.end({ ok: false, text: why, left: [], stop: "marks" }), none);
  expect(twice.calls.map((a) => a.blocks.some((b: any) => b.mark))).toEqual([true, false]);
  expect(twice.report).toContain("failed: " + why);
});

test("a subagent's recaps that never let a call grow end its run after three in a row, saying why; a call that grew starts the count anew; a recap refused ends it answered, one the vendor was too busy for unanswered, as a call's", async () => {
  const full = (grew: boolean[]) => (k: number, feed: any) => feed.end({ ok: false, text: "HTTP 400: prompt is too long", left: [], stop: "full", grew: grew[k] ?? false });
  const recap = (k: number, feed: any) => feed.end({ ok: true, text: "recap " + k, left: [] });
  const stuck = await sub("look", 10000, full([]), recap);
  expect([stuck.calls.length, stuck.recaps.length]).toEqual([4, 3]);
  expect(stuck.report).toContain("failed: its work won't fit " + Tools.pick(chat.tools, { $: "sub", effort: null, agent: null }).model + "'s window even recapped");
  const grown = await sub("look", 10000, full([false, true]), recap);
  expect([grown.calls.length, grown.recaps.length]).toEqual([5, 4]);
  const none = await sub("look", 10000, full([]), (_, feed) => feed.end({ ok: false, text: "your Anthropic API credit is used up", left: [], stop: "down" }));
  expect([none.calls.length, none.recaps.length, none.turns]).toEqual([1, 1, 1]);
  expect(none.report).toContain("failed: no recap: your Anthropic API credit is used up");
  const busy = await sub("look", 10000, full([]), (_, feed) => feed.end({ ok: false, text: "the AI service is busy or unavailable right now", left: [], stop: "down", again: true }));
  expect([busy.report.includes("failed: no recap: the AI service is busy"), busy.turns]).toEqual([true, 0]);
});

