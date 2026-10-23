// Hooks test
// ==========
// `bun test Hooks.test.ts`. The hooks files are read in order (global,
// profile, a trusted project's), a command given twice kept once, what
// won't do said, disableAllHooks turning all off; matchers read as
// Claude Code's (names exactly, else a pattern found anywhere). A
// command's answer is read as Claude Code's: exit 2 blocks, a JSON object
// decides on any other exit, exit 0's text is context where it may be; a
// failure is passed over but refuses a tool's call (onFailure sets it).
// A command runs with its input on stdin, its time limit and a stop
// ending it, its output cut, a job it leaves not waited for. Loaded, the
// commands run at what illi does, through the plugin hooks: a tool's call
// (refused, changed, asked, allowed, told more; paths whole), its answer,
// a message, a turn's end, the chat's start and illi's quit (only where
// the chat ran), a wait on the user (by its kind); a failure told once; a
// project's new or changed file said once; illi's quit kills what still
// runs.

import { beforeEach, afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR  = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + "/illi-hooks-"));
const ROOT = DIR + "/illi";
const OWN  = ROOT + "/profiles/work";
const REPO = DIR + "/repo";
const BIN  = DIR + "/bin";
fs.mkdirSync(OWN, { recursive: true });
fs.mkdirSync(REPO + "/.illi", { recursive: true });
fs.mkdirSync(BIN, { recursive: true });
process.env.ILLI_DIR     = ROOT;
process.env.ILLI_PROFILE = "work";

const { Hooks } = await import("./Hooks.ts");
const { Plugins } = await import("./Plugins.ts");
type Entry = ReturnType<typeof Hooks.entries>[number];

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// the notes said, once the screen is up
let notes: string[] = [];
const halts: string[] = [];

beforeEach(() => {
  Hooks.reset();
  Plugins.reset();
  notes = [];
  halts.length = 0;
  Plugins.attach({ note: (text) => notes.push(text), send: () => {}, redraw: () => {} });
  Plugins.attach_chat({ mode: () => "auto", halt: (why) => halts.push(why) });
  for (const file of [ROOT + "/hooks.json", OWN + "/hooks.json", REPO + "/.illi/hooks.json"]) {
    fs.rmSync(file, { force: true });
  }
});

// a script of the test's, its body after #!/bin/sh: its path
function sh(name: string, body: string): string {
  const file = BIN + "/" + name;
  fs.writeFileSync(file, "#!/bin/sh\n" + body + "\n");
  fs.chmodSync(file, 0o755);
  return file;
}

// a hooks file: its events' commands, each [matcher, command, more]
function hooks(file: string, events: Record<string, Array<[string, string, object?]>>, more: object = {}): void {
  const hooks = Object.fromEntries(Object.entries(events).map(([event, list]) => [event, list.map(([matcher, command, extra]) => ({ matcher, hooks: [{ type: "command", command, ...extra }] }))]));
  fs.writeFileSync(file, JSON.stringify({ hooks, ...more }));
}

// an entry as a file gives it, for answer's tests
function entry(event: Entry["event"], fail?: "block" | "continue"): Entry {
  return { event, match: "", matcher: null, command: "x.sh", timeout: 1000, fail: fail ?? (event === "PreToolUse" ? "block" : "continue"), file: "", plugin: null, vars: {} };
}

// a run's result, for answer's tests
const ran = (code: number | null, out = "", err = "", why = "") => ({ code, out, err, why });

// a file a command wrote, once it has (2 s at most)
async function written(file: string): Promise<string> {
  for (let i = 0; i < 100 && !fs.existsSync(file); i++) {
    await Bun.sleep(20);
  }
  await Bun.sleep(20);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

const shell = (command: string, agent: string | null = null) => ({ tool: "shell", input: { command }, agent, cwd: REPO });

test("the files in order (global, profile, a trusted project's), a command given twice kept once; what won't do said; disableAllHooks turns all off", () => {
  hooks(ROOT + "/hooks.json", { PreToolUse: [["shell", "/g.sh"]], Stop: [["", "/same.sh"]] });
  hooks(OWN + "/hooks.json", { PreToolUse: [["read", "/p.sh"]], Stop: [["", "/same.sh"]], Nope: [["", "/x.sh"]] });
  hooks(REPO + "/.illi/hooks.json", { PostToolUse: [["(", "/bad.sh"]], SessionEnd: [["", "/end.sh", { timeout: 600 }]] });
  const trusted = Hooks.read(REPO, () => true);
  expect(trusted.entries.map((e) => e.event + " " + e.command)).toEqual(["PreToolUse /g.sh", "Stop /same.sh", "PreToolUse /p.sh", "SessionEnd /end.sh"]);
  expect(trusted.entries.map((e) => [e.timeout, e.fail])).toEqual([[60000, "block"], [60000, "continue"], [60000, "block"], [60000, "continue"]]);
  expect(trusted.troubles).toHaveLength(2);
  expect(trusted.troubles[0]).toStartWith(OWN + "/hooks.json: no event Nope");
  expect(trusted.troubles[1]).toContain("PostToolUse's matcher \"(\" won't do");
  expect(trusted.off).toBeNull();
  expect(Hooks.read(REPO, () => false).entries.map((e) => e.command)).toEqual(["/g.sh", "/same.sh", "/p.sh"]);
  fs.writeFileSync(OWN + "/hooks.json", "{ broken");
  expect(Hooks.read(REPO, () => false).troubles[0]).toStartWith(OWN + "/hooks.json won't read: ");
  hooks(OWN + "/hooks.json", {}, { disableAllHooks: true });
  expect(Hooks.read(REPO, () => false).off).toBe(OWN + "/hooks.json");
  Hooks.load(REPO, () => false);
  expect(Hooks.entries()).toEqual([]);
  expect(Hooks.off()).toBe(OWN + "/hooks.json says disableAllHooks");
  expect(notes).toEqual(["Hooks are off: " + OWN + "/hooks.json says disableAllHooks."]);
});

test("matchers as Claude Code reads them: none, \"\" or * all; plain names exactly; else a pattern found anywhere; events with no matcher take all", () => {
  hooks(ROOT + "/hooks.json", { PreToolUse: [["", "/all.sh"], ["*", "/star.sh"], ["shell|read, write", "/names.sh"], ["sh", "/sh.sh"], ["mcp__.*", "/re.sh"], ["^re", "/anchored.sh"]], UserPromptSubmit: [["shell", "/any.sh"]] });
  const by = Object.fromEntries(Hooks.read(REPO, () => false).entries.map((e) => [e.command, e]));
  const takes = (command: string, what: string) => Hooks.matches(by[command], what);
  expect([takes("/all.sh", "edit"), takes("/star.sh", "edit")]).toEqual([true, true]);
  expect(["shell", "read", "write", "edit", "shellx"].map((t) => takes("/names.sh", t))).toEqual([true, true, true, false, false]);
  expect([takes("/sh.sh", "shell"), takes("/sh.sh", "sh")]).toEqual([false, true]);
  expect([takes("/re.sh", "mcp__github__issue"), takes("/re.sh", "x_mcp__y"), takes("/re.sh", "shell")]).toEqual([true, true, false]);
  expect([takes("/anchored.sh", "read"), takes("/anchored.sh", "shell_read")]).toEqual([true, false]);
  expect(takes("/any.sh", "anything")).toBe(true);
});

test("an answer as Claude Code's: exit 2 blocks where its event can; exit 0's text is context where it may be; anything else failing is passed over, but refuses a tool's call", () => {
  expect(Hooks.answer(entry("PreToolUse"), ran(2, "", "no rm\n"))).toEqual({ block: "no rm" });
  expect(Hooks.answer(entry("PreToolUse"), ran(2))).toEqual({ block: "Your PreToolUse hook x.sh said no." });
  expect(Hooks.answer(entry("PostToolUse"), ran(2, "", "lint failed"))).toEqual({ context: "lint failed" });
  expect(Hooks.answer(entry("UserPromptSubmit"), ran(2, "", "not that"))).toEqual({ block: "not that" });
  expect(Hooks.answer(entry("Stop"), ran(2, "", "tests fail"))).toEqual({ block: "tests fail" });
  expect(Hooks.answer(entry("Notification"), ran(2, "", "hm"))).toEqual({ note: "hm" });
  expect(Hooks.answer(entry("UserPromptSubmit"), ran(0, "the date is today\n"))).toEqual({ context: "the date is today" });
  expect(Hooks.answer(entry("SessionStart"), ran(0, "branch main"))).toEqual({ context: "branch main" });
  expect(Hooks.answer(entry("PreToolUse"), ran(0, "plain text"))).toEqual({});
  expect(Hooks.answer(entry("PreToolUse"), ran(1, "", "oops\nmore"))).toEqual({ block: "Your PreToolUse hook x.sh exited 1: oops, so the call was refused.", fail: "exited 1: oops" });
  expect(Hooks.answer(entry("PreToolUse", "continue"), ran(1))).toEqual({ fail: "exited 1" });
  expect(Hooks.answer(entry("PostToolUse"), ran(127, "", "sh: x.sh: not found"))).toEqual({ fail: "couldn't run (exit 127: sh: x.sh: not found)" });
  expect(Hooks.answer(entry("UserPromptSubmit", "block"), ran(126))).toEqual({ block: "Your UserPromptSubmit hook x.sh couldn't run (exit 126).", fail: "couldn't run (exit 126)" });
  expect(Hooks.answer(entry("PreToolUse"), ran(null, "", "", "ran past its 1 s"))).toEqual({ block: "Your PreToolUse hook x.sh ran past its 1 s, so the call was refused.", fail: "ran past its 1 s" });
  expect(Hooks.answer(entry("Stop"), ran(0, "{ oops"))).toEqual({ fail: "gave output that isn't JSON" });
});

test("a JSON answer as Claude Code's fields say, read on any exit but 2: decisions, changed input, context, notes, a stop", () => {
  const json = (event: Entry["event"], data: object, code = 0) => Hooks.answer(entry(event), ran(code, JSON.stringify(data)));
  const own = (o: object) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", ...o } });
  expect(json("PreToolUse", own({ permissionDecision: "deny", permissionDecisionReason: "not here" }))).toEqual({ block: "not here" });
  expect(json("PreToolUse", own({ permissionDecision: "deny" }))).toEqual({ block: "Your PreToolUse hook x.sh refused this call." });
  expect(json("PreToolUse", own({ permissionDecision: "ask", permissionDecisionReason: "check it" }))).toEqual({ ask: "check it" });
  expect(json("PreToolUse", own({ permissionDecision: "allow", updatedInput: { command: "ls" }, additionalContext: "ran ls instead" }))).toEqual({ allow: true, input: { command: "ls" }, context: "ran ls instead" });
  expect(json("PreToolUse", own({ updatedInput: ["not", "an object"] }))).toEqual({});
  expect(json("PreToolUse", { decision: "approve" })).toEqual({ allow: true });
  expect(json("PreToolUse", { decision: "block", reason: "old style" })).toEqual({ block: "old style" });
  expect(json("PreToolUse", own({ permissionDecision: "allow" }), 1)).toEqual({ allow: true });
  expect(json("PreToolUse", { continue: false, stopReason: "enough", systemMessage: "stopping" })).toEqual({ note: "stopping", stop: "enough" });
  expect(json("Notification", { continue: false, stopReason: "enough" })).toEqual({ note: "enough" });
  expect(json("PostToolUse", { decision: "block", reason: "fix the lint", hookSpecificOutput: { additionalContext: "3 warnings" } })).toEqual({ context: "fix the lint\n\n3 warnings" });
  expect(json("UserPromptSubmit", { decision: "block", reason: "no secrets" })).toEqual({ block: "no secrets" });
  expect(json("UserPromptSubmit", { hookSpecificOutput: { additionalContext: "it's Friday" } })).toEqual({ context: "it's Friday" });
  expect(json("Stop", { decision: "block", reason: "tests fail" })).toEqual({ block: "tests fail" });
  expect(json("Stop", { hookSpecificOutput: { additionalContext: "one more thing" } })).toEqual({ block: "one more thing" });
  expect(json("Stop", { continue: false })).toEqual({ note: "Your Stop hook x.sh stopped illi." });
  expect(json("SessionStart", { hookSpecificOutput: { additionalContext: "on main" }, systemMessage: "hello" })).toEqual({ note: "hello", context: "on main" });
});

test("a command runs in sh with its input on stdin and the project's top named; its time limit and a stop end it; its output is cut; a job it leaves isn't waited for", async () => {
  const echo = sh("echo.sh", "cat; echo; echo \"$ILLI_PROJECT_DIR\" >&2");
  expect(await Hooks.run(echo, { a: 1 }, REPO, "/top", 5000)).toEqual({ code: 0, why: "", out: "{\"a\":1}\n\n", err: "/top\n" });
  const slow = sh("slow.sh", "sleep 5");
  let at = Date.now();
  expect(await Hooks.run(slow, {}, REPO, REPO, 300)).toMatchObject({ code: null, why: "ran past its 0.3 s" });
  expect(Date.now() - at).toBeLessThan(2500);
  const stop = new AbortController();
  setTimeout(() => stop.abort(), 100);
  at = Date.now();
  expect(await Hooks.run(slow, {}, REPO, REPO, 5000, stop.signal)).toMatchObject({ code: null, why: "was stopped" });
  expect(Date.now() - at).toBeLessThan(2500);
  const big = await Hooks.run(sh("big.sh", "head -c 200000 /dev/zero | tr '\\0' 'x'"), {}, REPO, REPO, 5000);
  expect([big.code, big.out.length]).toEqual([0, 64 * 1024]);
  at = Date.now();
  expect(await Hooks.run(sh("leave.sh", "sleep 5 & echo hi"), {}, REPO, REPO, 5000)).toMatchObject({ code: 0, out: "hi\n" });
  expect(Date.now() - at).toBeLessThan(2500);
  const lost = await Hooks.run("exit 7", {}, DIR + "/no-such-folder", REPO, 5000);
  expect([lost.code, lost.why.startsWith("couldn't start (")]).toEqual([null, true]);
});

test("before a tool's call: refused, changed (the next given the change, an allow taken back), asked, allowed, told more; file paths whole, a subagent named; a failure refuses it and is told once", async () => {
  const pre = sh("pre.sh", `input=$(cat); echo "$input" >> ${DIR}/pre.log
case "$input" in
  *'"rm '*) echo "no rm" >&2; exit 2 ;;
  *'"git push'*) echo '{"hookSpecificOutput":{"permissionDecision":"ask","permissionDecisionReason":"pushing?"}}' ;;
  *'"ls -l"'*) echo '{"hookSpecificOutput":{"permissionDecision":"allow","updatedInput":{"command":"ls -la"},"additionalContext":"ls -la instead"}}' ;;
  *'"make"'*) echo '{"hookSpecificOutput":{"permissionDecision":"allow"}}' ;;
esac`);
  const swap = sh("swap.sh", `input=$(cat); case "$input" in *'"make"'*) echo '{"hookSpecificOutput":{"updatedInput":{"command":"make all"}}}' ;; esac`);
  hooks(ROOT + "/hooks.json", { PreToolUse: [["shell|read", pre], ["shell", swap], ["edit", sh("broken.sh", "exit 1")]] });
  Hooks.load(REPO, () => false);
  expect(await Plugins.before_tool(shell("rm -rf src"))).toEqual({ block: "no rm" });
  expect(await Plugins.before_tool(shell("git push"))).toEqual({ input: { command: "git push" }, ask: "pushing?" });
  expect(await Plugins.before_tool(shell("ls -l"))).toEqual({ input: { command: "ls -la" }, allow: true, context: ["From your hooks:\nls -la instead"] });
  expect(await Plugins.before_tool(shell("make"))).toEqual({ input: { command: "make all" } });
  expect(await Plugins.before_tool(shell("pwd"))).toEqual({ input: { command: "pwd" } });
  fs.rmSync(DIR + "/pre.log");
  await Plugins.before_tool({ tool: "read", input: { path: "src/a.ts" }, agent: "Scout-1", cwd: REPO });
  expect(JSON.parse(fs.readFileSync(DIR + "/pre.log", "utf8"))).toEqual({ hook_event_name: "PreToolUse", cwd: REPO, permission_mode: "auto", agent_id: "Scout-1", agent_type: "Scout-1", tool_name: "read", tool_input: { path: REPO + "/src/a.ts" } });
  const edit = { tool: "edit", input: { edits: [{ path: "a", old: "x", new: "y" }] }, agent: null, cwd: REPO };
  expect(await Plugins.before_tool(edit)).toEqual({ block: "Your PreToolUse hook " + BIN + "/broken.sh exited 1, so the call was refused." });
  expect(await Plugins.before_tool(edit)).toMatchObject({ block: expect.any(String) });
  expect(notes).toEqual(["Your PreToolUse hook " + BIN + "/broken.sh failed: exited 1, so it said no (illi.log has more)."]);
});

test("a continue: false stops the turn (the call refused, why noted); after a call that ran, its hooks add to what the model reads; one that failed isn't told", async () => {
  hooks(ROOT + "/hooks.json", {
    PreToolUse: [["shell", sh("halt.sh", `cat | grep -q '"halt"' && echo '{"continue":false,"stopReason":"Halted by policy."}'; exit 0`)]],
    PostToolUse: [["shell", sh("post.sh", `input=$(cat); echo "$input" > ${DIR}/post.json; echo '{"hookSpecificOutput":{"additionalContext":"formatted"}}'`)]],
  });
  Hooks.load(REPO, () => false);
  expect(await Plugins.before_tool(shell("halt"))).toEqual({ block: "Halted by policy." });
  expect(halts).toEqual(["Halted by policy."]);
  expect(await Plugins.after_tool(shell("ls"), { text: "a b", fail: false })).toEqual({ text: "a b\n\nFrom your hooks:\nformatted", fail: false });
  expect(JSON.parse(fs.readFileSync(DIR + "/post.json", "utf8"))).toMatchObject({ hook_event_name: "PostToolUse", tool_name: "shell", tool_input: { command: "ls" }, tool_response: { text: "a b", fail: false } });
  fs.rmSync(DIR + "/post.json");
  expect(await Plugins.after_tool(shell("ls"), { text: "boom", fail: true })).toEqual({ text: "boom", fail: true });
  expect(fs.existsSync(DIR + "/post.json")).toBe(false);
});

test("a message: kept back by exit 2 or a stop (no turn stopped), else sent with what the hooks add; a stop ends a slow hook", async () => {
  hooks(ROOT + "/hooks.json", { UserPromptSubmit: [["", sh("prompt.sh", `input=$(cat)
case "$input" in
  *secret*) echo "That looks like a secret." >&2; exit 2 ;;
  *halt*) echo '{"continue":false,"stopReason":"Not now."}' ;;
  *slow*) sleep 5 ;;
  *) echo "Today is a test day." ;;
esac`)]] });
  Hooks.load(REPO, () => false);
  expect(await Plugins.before_message({ text: "my secret is x", cwd: REPO })).toEqual({ block: "That looks like a secret." });
  expect(await Plugins.before_message({ text: "halt", cwd: REPO })).toEqual({ block: "Not now." });
  expect(halts).toEqual([]);
  expect(await Plugins.before_message({ text: "hello", cwd: REPO })).toEqual({ context: ["From your hooks:\nToday is a test day."] });
  const stop = new AbortController();
  setTimeout(() => stop.abort(), 100);
  const at = Date.now();
  await Plugins.before_message({ text: "slow", cwd: REPO, signal: stop.signal });
  expect(Date.now() - at).toBeLessThan(2500);
  expect(notes).toEqual([]);
});

test("a turn's end: a Stop hook makes it go on, given whether one did already and illi's last reply", async () => {
  hooks(ROOT + "/hooks.json", { Stop: [["", sh("stop.sh", `input=$(cat); echo "$input" > ${DIR}/stop.json
case "$input" in *'"stop_hook_active":true'*) exit 0 ;; esac
echo '{"decision":"block","reason":"Run the tests first."}'`)]] });
  Hooks.load(REPO, () => false);
  expect(await Plugins.before_stop({ cwd: REPO, again: false, reply: "All done." })).toBe("From your hooks:\nRun the tests first.");
  expect(JSON.parse(fs.readFileSync(DIR + "/stop.json", "utf8"))).toEqual({ hook_event_name: "Stop", cwd: REPO, permission_mode: "auto", stop_hook_active: false, last_assistant_message: "All done." });
  expect(await Plugins.before_stop({ cwd: REPO, again: true, reply: "Tests pass." })).toBeNull();
});

test("the chat's start: SessionStart's output, context for every call; illi's quit: SessionEnd's, with why, only where the chat ran, outliving the quit's kill", async () => {
  hooks(ROOT + "/hooks.json", {
    SessionStart: [["startup", sh("start.sh", "cat > /dev/null; echo 'On branch main.'")]],
    SessionEnd: [["prompt_input_exit", sh("end.sh", `sleep 0.3; cat > ${DIR}/end.json`)], ["other", sh("other.sh", `cat > ${DIR}/other.json`)]],
  });
  Hooks.load(REPO, () => false);
  expect(await Plugins.context({ cwd: REPO })).toEqual(["From your hooks:\nOn branch main."]);
  await Plugins.emit("start", { cwd: REPO, profile: "work", chat: false });
  await Plugins.quit(REPO, "prompt_input_exit");
  expect(fs.existsSync(DIR + "/end.json")).toBe(false);
  Plugins.reset();
  Hooks.reset();
  Hooks.load(REPO, () => false);
  await Plugins.emit("start", { cwd: REPO, profile: "work", chat: true });
  const quitting = Plugins.quit(REPO, "prompt_input_exit");
  Hooks.end();
  await quitting;
  expect(JSON.parse(fs.readFileSync(DIR + "/end.json", "utf8"))).toMatchObject({ hook_event_name: "SessionEnd", reason: "prompt_input_exit" });
  expect(fs.existsSync(DIR + "/other.json")).toBe(false);
});

test("a wait on the user: its kind's Notification hooks, not waited for", async () => {
  hooks(ROOT + "/hooks.json", { Notification: [["idle_prompt", sh("idle.sh", `sleep 0.2; cat > ${DIR}/idle.json`)], ["permission_prompt", sh("perm.sh", `cat > ${DIR}/perm.json`)]] });
  Hooks.load(REPO, () => false);
  const at = Date.now();
  await Plugins.emit("notify", { cwd: REPO, type: "idle_prompt", text: "illi is waiting for your input" });
  expect(Date.now() - at).toBeLessThan(150);
  expect(JSON.parse(await written(DIR + "/idle.json"))).toEqual({ hook_event_name: "Notification", cwd: REPO, permission_mode: "auto", message: "illi is waiting for your input", title: "illi", notification_type: "idle_prompt" });
  expect(fs.existsSync(DIR + "/perm.json")).toBe(false);
});

test("a project's hooks file, new or changed since illi last started there, is said once", () => {
  hooks(REPO + "/.illi/hooks.json", { Stop: [["", "/a.sh"], ["", "/b.sh"]] });
  Hooks.load(REPO, () => true);
  expect(notes).toEqual(["This project's " + REPO + "/.illi/hooks.json is new or changed since illi last started here: its 2 hooks run as you work (/agents lists them)."]);
  for (const [change, said] of [[false, 0], [true, 1]] as const) {
    if (change) {
      hooks(REPO + "/.illi/hooks.json", { Stop: [["", "/a.sh"]] });
    }
    Hooks.reset();
    Plugins.reset();
    notes = [];
    Plugins.attach({ note: (text) => notes.push(text), send: () => {}, redraw: () => {} });
    Hooks.load(REPO, () => true);
    expect(notes).toHaveLength(said);
  }
  expect(notes[0]).toContain("its hook runs as you work");
});

test("illi's quit kills a hook still running: the call it checked is refused at once", async () => {
  hooks(ROOT + "/hooks.json", { PreToolUse: [["shell", sh("hang.sh", "sleep 10")]] });
  Hooks.load(REPO, () => false);
  const at = Date.now();
  const told = Plugins.before_tool(shell("ls"));
  await Bun.sleep(150);
  Hooks.end();
  expect(await told).toMatchObject({ block: expect.stringContaining("so the call was refused") });
  expect(Date.now() - at).toBeLessThan(2500);
});
