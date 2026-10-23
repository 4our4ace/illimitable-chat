// Hooks
// =====
// Shell commands of the user's, run at what illi does, in Claude Code's
// hook format (hooks.json holds its `hooks` block, pasted as it is):
// before a tool's call (PreToolUse: refuse it, change its input, allow it,
// have it asked, tell the model more), after one that ran (PostToolUse:
// tell the model more), a message of the user's (UserPromptSubmit: keep
// it back, add context), a turn ending of itself (Stop: go on), the user
// waited on a while (Notification), the chat opening (SessionStart:
// context for every call of the run) and illi quitting (SessionEnd).
// Read once as illi starts: the plugins' (each bundle's hooks/hooks.json
// and its manifest's hooks: Bundle.ts), then the global hooks.json, the
// profile's and, in a trusted folder, the project's .illi/hooks.json, all
// in that order (the user's last, so their check sees the input as the
// plugins left it), a command given twice running once (read); none if
// one of the user's files says disableAllHooks (a plugin's can't), or
// the `off` setting names hooks.json. A plugin's commands are given its
// folder and data folder (CLAUDE_PLUGIN_ROOT, CLAUDE_PLUGIN_DATA, and
// ILLI_ spellings), and its notes name it. A matcher naming Claude
// Code's Bash takes illi's shell too (its input alike: { command }); one
// naming only Claude Code's other tools is said, as illi's inputs differ.
// They run as a plugin of illi's own, after the user's code plugins
// (Plugins.own), so they share their order, failure rules and call
// sites.
//
// A command runs in sh, in the project's folder, given the event as JSON
// on its input (run); it answers as Claude Code's do (answer): exit 2
// blocks, its stderr why; output that is a JSON object decides (on any
// other exit), else, for the events that take context, exit 0's output
// is context. A command that fails (it can't start or run, runs past its
// time, exits otherwise with no JSON, or gives JSON that won't parse) is
// told once and passed over, but a PreToolUse one refuses the call (a
// check never lets one through by failing), as `onFailure` may set for
// any.
//
//     { "hooks": {
//         "PreToolUse": [{ "matcher": "shell",
//                          "hooks": [{ "type": "command", "command": "~/.illi/hooks/guard.sh" }] }] } }

import * as fs from "node:fs";
import * as path from "node:path";
import { Bundle } from "./Bundle.ts";
import * as config from "./Config.ts";
import { Plugins, type Output, type ToolCall, type Wait } from "./Plugins.ts";
import { Run, type Ran } from "./Run.ts";
import { Seen } from "./Seen.ts";
import { Trusted } from "./Trusted.ts";

// Types
// =====

export type Event = "PreToolUse" | "PostToolUse" | "UserPromptSubmit" | "Stop" | "Notification" | "SessionStart" | "SessionEnd";

// a command to run at an event: the event, its matcher as written and
// what it takes (null: all), the command, its time limit (ms), what its
// failure does (block: as exit 2; continue: nothing), the file it is in,
// its plugin (null: the user's own) and what it is given of it (its
// variables: Bundle.vars)
export type Entry = { event: Event; match: string; matcher: ((what: string) => boolean) | null; command: string; timeout: number; fail: "block" | "continue"; file: string; plugin: string | null; vars: Record<string, string> };

// what a command's answer says, in illi's terms: refuse, or keep back
// (block: why; Stop's: go on, why); allow; ask (why); the input to run
// on; context for the model; a note to the user; its failure (why); the
// turn stopped (why)
export type Said = { block?: string; allow?: boolean; ask?: string; input?: unknown; context?: string; note?: string; fail?: string; stop?: string };

// Constants
// =========

export const EVENTS: Event[] = ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop", "Notification", "SessionStart", "SessionEnd"];

// the hooks' name in the `off` setting, /agents and the log (no plugin's
// holds a dot)
export const NAME = "hooks.json";

// the events whose matcher is matched, and against what: a tool's name,
// what started the session, the kind of wait, why the session ended
const MATCHED: Partial<Record<Event, true>> = { PreToolUse: true, PostToolUse: true, SessionStart: true, Notification: true, SessionEnd: true };

// Claude Code's tool names a matcher may name: Bash, whose input is
// illi's shell's, taken for it; the others, whose inputs differ, said
const CLAUDE_TOOLS = ["Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "LS", "WebFetch", "WebSearch", "NotebookEdit", "TodoWrite", "Task"];

// the events whose output, as text, is context for the model
const CONTEXT: Partial<Record<Event, true>> = { UserPromptSubmit: true, SessionStart: true };

// the events a command may stop at (continue: false): a tool's call (the
// turn stopped, the call refused), a tool's answer (the turn stopped), a
// message (kept back; no turn stopped)
const STOPS: Partial<Record<Event, true>> = { PreToolUse: true, PostToolUse: true, UserPromptSubmit: true };

// a command's time limit unless it sets one (s; SessionEnd's at most
// SPAN, as illi waits for them as it quits)
const TIMEOUTS: Record<Event, number> = { PreToolUse: 60, PostToolUse: 60, UserPromptSubmit: 30, Stop: 60, Notification: 60, SessionStart: 60, SessionEnd: 1.5 };
const SPAN = 60;

// the most of the context the model is told from one event's commands
// (characters)
const TOLD_MAX = 10000;

// the commands loaded, the project's folder and its top they run in and
// are given, whether this illi runs the chat (the start told it), why
// none runs ("": they do), the failures told once (by command, event
// and plugin)
let ENTRIES: Entry[] = [];
let CWD = "";
let TOP = "";
let HOLDS = false;
let OFF = "";
const TOLD = new Set<string>();

// Hooks
// =====

export namespace Hooks {

  // the hooks files read (what won't do said; a project's, new or changed
  // since illi last started with it, said too), their commands run as a
  // plugin of illi's own, after the user's (Plugins.own): each event's on
  // the plugin hook it rides on. None if `off` names hooks.json, or a file
  // says disableAllHooks
  export function load(cwd: string, trusted: (cwd: string) => boolean): void {
    if (config.config_off(NAME)) {
      OFF = "the off setting names " + NAME;
      return;
    }
    const { entries, troubles, off } = Hooks.read(cwd, trusted);
    troubles.forEach((t) => Plugins.say(t));
    if (off !== null) {
      OFF = config.config_home(off) + " says disableAllHooks";
      Plugins.say("Hooks are off: " + OFF + ".");
      return;
    }
    [ENTRIES, CWD, TOP] = [entries, cwd, Trusted.folder(cwd)];
    if (entries.length === 0) {
      return;
    }
    hooks_seen(path.join(cwd, ".illi", "hooks.json"));
    hooks_claude();
    const at = (event: Event) => ENTRIES.some((e) => e.event === event);
    Plugins.own(NAME, entries[0].file, "your hooks", [
      { hook: "start", run: hooks_start },
      ...(at("SessionEnd") ? [{ hook: "quit" as const, run: hooks_quit }] : []),
      ...(at("SessionStart") ? [{ hook: "context" as const, run: hooks_context }] : []),
      ...(at("PreToolUse") ? [{ hook: "tool.before" as const, run: hooks_before }] : []),
      ...(at("PostToolUse") ? [{ hook: "tool.after" as const, run: hooks_after }] : []),
      ...(at("UserPromptSubmit") ? [{ hook: "message.before" as const, run: hooks_message }] : []),
      ...(at("Stop") ? [{ hook: "turn.stop" as const, run: hooks_stop }] : []),
      ...(at("Notification") ? [{ hook: "notify" as const, run: hooks_notify }] : []),
    ]);
  }

  // the hooks files: the global one, the profile's, the project's if its
  // folder is trusted
  export function files(cwd: string, trusted: (cwd: string) => boolean): string[] {
    const own = config.DIR === config.ROOT ? [] : [path.join(config.ROOT, "hooks.json")];
    return [...own, path.join(config.DIR, "hooks.json"), ...(trusted(cwd) ? [path.join(cwd, ".illi", "hooks.json")] : [])];
  }

  // the commands of the plugins' hooks (Plugins.bundles), then of those
  // files, in order, one given twice (its event, matcher, command and
  // plugin alike) kept once; what won't do, each said why (a file that
  // won't read: none of its own run; an entry that won't do: left out);
  // the user's file that turns them all off, if any
  export function read(cwd: string, trusted: (cwd: string) => boolean): { entries: Entry[]; troubles: string[]; off: string | null } {
    const entries: Entry[] = [];
    const troubles: string[] = [];
    let off: string | null = null;
    const take = (got: { entries: Entry[]; troubles: string[] }, said: string) => {
      entries.push(...got.entries.filter((e) => !entries.some((x) => x.event === e.event && x.match === e.match && x.command === e.command && x.plugin === e.plugin)));
      troubles.push(...got.troubles.map((t) => said + ": " + t));
    };
    for (const b of Plugins.bundles()) {
      for (const source of b.hooks) {
        const got = source.data !== undefined ? hooks_of_map(source.data, source.file, b) : file_read(source.file, b);
        if (typeof got === "string") {
          troubles.push("The plugin " + b.name + "'s " + config.config_home(source.file) + " won't read: " + got + "; its hooks are off till illi starts again.");
          continue;
        }
        take(got, "The plugin " + b.name + "'s " + config.config_home(source.file));
      }
    }
    for (const file of Hooks.files(cwd, trusted)) {
      const got = file_read(file, null);
      if (typeof got === "string") {
        troubles.push(config.config_home(file) + " won't read: " + got + "; its hooks are off till illi starts again.");
        continue;
      }
      off ??= got.off ? file : null;
      take(got, config.config_home(file));
    }
    return { entries, troubles, off };
  }

  // the commands loaded, in order, and why none runs ("": they do) (for
  // /agents)
  export function entries(): Entry[] {
    return ENTRIES;
  }

  export function off(): string {
    return OFF;
  }

  // whether an entry's matcher takes what its event is about (a tool's
  // name, what started the session, the kind of wait, why it ended; illi's
  // shell as Claude Code's Bash too); the events that match none take all
  export function matches(entry: Entry, what: string): boolean {
    return entry.matcher === null || !MATCHED[entry.event] || entry.matcher(what) || (what === "shell" && entry.matcher("Bash"));
  }

  // a command run (Run.ts), in a folder, the project's top in
  // ILLI_PROJECT_DIR (and CLAUDE_PROJECT_DIR, as pasted Claude Code hooks
  // read it), more variables given, its input as JSON: its exit code,
  // output and errors. One not tracked (SessionEnd's) outlives illi's
  // quit (Run.end)
  export function run(command: string, input: object, cwd: string, top: string, timeout: number, signal?: AbortSignal, tracked = true, vars: Record<string, string> = {}): Promise<Ran> {
    return Run.run(command, { cwd, env: { ILLI_PROJECT_DIR: top, CLAUDE_PROJECT_DIR: top, ...vars }, input: JSON.stringify(input) + "\n", timeout, signal, tracked });
  }

  // a command's answer, as Claude Code reads one: exit 2 blocks (stderr
  // why); output that is a JSON object decides; exit 0's output, as
  // text, is context for the events taking it. A failure (no answer, a
  // command that can't run: 126, 127; another exit with no JSON; JSON
  // that won't parse) is said why, and blocks too where its entry says
  export function answer(e: Entry, ran: Ran): Said {
    const short = clip(e.command);
    const first = ran.err.trim().split("\n")[0];
    const own = hooks_whose(e, true) + " " + e.event + " hook " + short;
    const off = e.plugin === null ? "" : " (the off setting turns the plugin " + e.plugin + " off)";
    const failed = (why: string): Said => (e.fail === "block" ? { ...blocked(e.event, own + " " + why + (e.event === "PreToolUse" ? ", so the call was refused" + off + "." : ".")), fail: why } : { fail: why });
    if (ran.code === null) {
      return failed(ran.why);
    }
    if (ran.code === 126 || ran.code === 127) {
      return failed("couldn't run (exit " + ran.code + (first === "" ? "" : ": " + first) + ")");
    }
    if (ran.code === 2) {
      return blocked(e.event, ran.err.trim() || own + " said no.");
    }
    const text = ran.out.trim();
    if (text.startsWith("{")) {
      const json = json_parse(text);
      return json === null ? failed("gave output that isn't JSON") : decided(e.event, own, json);
    }
    if (ran.code !== 0) {
      return failed("exited " + ran.code + (first === "" ? "" : ": " + first));
    }
    return CONTEXT[e.event] && text !== "" ? { context: text } : {};
  }

  // none loaded (a test's start)
  export function reset(): void {
    [ENTRIES, CWD, TOP, HOLDS, OFF] = [[], "", "", false, ""];
    TOLD.clear();
  }

}

// the start: whether this illi runs the chat (only there illi quits with
// SessionEnd's commands)
function hooks_start(ev: { chat: boolean }): void {
  HOLDS = ev.chat;
}

// illi quitting, where the chat ran: SessionEnd's commands that take why,
// all at once, not killed as illi quits; done when they are (each in its
// own time)
async function hooks_quit(ev: { reason: string }): Promise<void> {
  if (HOLDS) {
    await Promise.all(hooks_of("SessionEnd", ev.reason).map((e) => hooks_one(e, { reason: ev.reason }, undefined, false)));
  }
}

// the chat opening: SessionStart's commands; what they add, the model's
// context in every call of the run
async function hooks_context(): Promise<{ context: string } | void> {
  const context: string[] = [];
  for (const e of hooks_of("SessionStart", "startup")) {
    const said = await hooks_one(e, { source: "startup" });
    if (said.context !== undefined) {
      context.push(said.context);
    }
  }
  if (context.length > 0) {
    return { context: cap(context.join("\n\n")) };
  }
}

// a tool's call, before it runs: PreToolUse's commands that match its
// tool, one after another, each given the input as the one before left it
// (its file tools' paths whole); the first refusal final (a stop too),
// else asked if any asks, else allowed if any allowed the input as it
// runs; what they add for the model, after its answer. The turn stopped,
// the rest don't run (so with each event's below)
async function hooks_before(call: ToolCall): Promise<{ block: string } | { input: unknown; allow?: boolean; ask?: string; context?: string }> {
  let input = call.input;
  let ask: string | undefined;
  let allow = false;
  const context: string[] = [];
  for (const e of hooks_of("PreToolUse", call.tool)) {
    const said = await hooks_one(e, { ...hooks_agent(call), tool_name: hooks_tool(e, call.tool), tool_input: hooks_paths(call, input) }, call.signal);
    if (call.signal?.aborted) {
      return { block: "Stopped." };
    }
    if (said.block !== undefined || said.stop !== undefined) {
      return { block: said.block ?? said.stop! };
    }
    if (said.input !== undefined) {
      [input, allow] = [said.input, false];
    }
    ask ??= said.ask;
    allow ||= said.allow === true;
    if (said.context !== undefined) {
      context.push(said.context);
    }
  }
  return { input, ...(ask !== undefined ? { ask } : allow ? { allow } : {}), ...(context.length > 0 ? { context: cap(context.join("\n\n")) } : {}) };
}

// a tool's answer, if it ran without failing: PostToolUse's commands that
// match its tool; what they say for the model added after it
async function hooks_after(call: ToolCall & { output: Output }): Promise<{ text: string } | void> {
  if (call.output.fail) {
    return;
  }
  const more: string[] = [];
  for (const e of hooks_of("PostToolUse", call.tool)) {
    const said = await hooks_one(e, { ...hooks_agent(call), tool_name: hooks_tool(e, call.tool), tool_input: hooks_paths(call, call.input), tool_response: call.output }, call.signal);
    if (call.signal?.aborted) {
      return;
    }
    if (said.context !== undefined) {
      more.push(said.context);
    }
  }
  if (more.length > 0) {
    return { text: call.output.text + "\n\nFrom your hooks:\n" + cap(more.join("\n\n")) };
  }
}

// a message of the user's: UserPromptSubmit's commands; the first that
// keeps it back final (a stop too), else what they add for the model
async function hooks_message(ev: { text: string; signal?: AbortSignal }): Promise<{ block: string } | { context: string } | void> {
  const context: string[] = [];
  for (const e of hooks_of("UserPromptSubmit", "")) {
    const said = await hooks_one(e, { prompt: ev.text }, ev.signal);
    if (ev.signal?.aborted) {
      return { block: "Stopped." };
    }
    if (said.block !== undefined || said.stop !== undefined) {
      return { block: said.block ?? said.stop! };
    }
    if (said.context !== undefined) {
      context.push(said.context);
    }
  }
  if (context.length > 0) {
    return { context: cap(context.join("\n\n")) };
  }
}

// a turn ending of itself: Stop's commands, given whether a hook made it
// go on already and illi's last reply; the first that blocks makes it go
// on, its why for the model
async function hooks_stop(ev: { again: boolean; reply: string; signal?: AbortSignal }): Promise<{ continue: string } | void> {
  for (const e of hooks_of("Stop", "")) {
    const said = await hooks_one(e, { stop_hook_active: ev.again, last_assistant_message: ev.reply }, ev.signal);
    if (ev.signal?.aborted) {
      return;
    }
    if (said.block !== undefined) {
      return { continue: cap(said.block) };
    }
  }
}

// the user waited on a while: Notification's commands that take its kind,
// started and not waited for (they tell the user; nothing waits on them)
function hooks_notify(ev: { type: Wait; text: string }): void {
  hooks_of("Notification", ev.type).forEach((e) => void hooks_one(e, { message: ev.text, title: "illi", notification_type: ev.type }));
}

// an event's commands that take what it is about
function hooks_of(event: Event, what: string): Entry[] {
  return ENTRIES.filter((e) => e.event === event && Hooks.matches(e, what));
}

// a tool's name as an entry is told it: Bash where it took illi's shell
// as Claude Code's (its matcher names Bash, not shell)
function hooks_tool(e: Entry, tool: string): string {
  return tool === "shell" && e.matcher !== null && !e.matcher("shell") ? "Bash" : tool;
}

// whose an entry is, as a note names it: the user's, or its plugin's
function hooks_whose(e: Entry, capital: boolean): string {
  return e.plugin === null ? (capital ? "Your" : "your") : (capital ? "The" : "the") + " plugin " + e.plugin + "'s";
}

// who calls a tool, as Claude Code says it: a subagent's name, else none
function hooks_agent(call: ToolCall): object {
  return call.agent === null ? {} : { agent_id: call.agent, agent_type: call.agent };
}

// a tool's input as a hook is given it: illi's file tools' paths whole
// (absolute), so a check on a path can't be passed by another spelling
function hooks_paths(call: ToolCall, input: any): unknown {
  const whole = (p: unknown) => (typeof p === "string" && p !== "" ? path.resolve(call.cwd, p) : p);
  if ((call.tool === "read" || call.tool === "write") && typeof input === "object" && input !== null) {
    return { ...input, path: whole(input.path) };
  }
  if (call.tool === "edit" && Array.isArray(input?.edits)) {
    return { ...input, edits: input.edits.map((e: any) => (typeof e === "object" && e !== null ? { ...e, path: whole(e.path) } : e)) };
  }
  return input;
}

// a command run and its answer read: a note it gives said, a stop it asks
// for done (a message's is only kept back), its failure said once (by
// command and event) and logged each time (not a stop's: the user stopped
// it)
async function hooks_one(e: Entry, more: object, signal?: AbortSignal, tracked = true): Promise<Said> {
  const input = { hook_event_name: e.event, cwd: CWD, permission_mode: Plugins.mode(), ...more };
  const ran = await Hooks.run(e.command, input, CWD, TOP, e.timeout, signal, tracked, e.vars);
  const said = Hooks.answer(e, ran);
  if (said.note !== undefined) {
    Plugins.say(said.note);
  }
  if (said.stop !== undefined && e.event !== "UserPromptSubmit") {
    Plugins.halt(said.stop);
  }
  if (said.fail !== undefined && !signal?.aborted) {
    console.error("illi: hook " + e.event + " " + e.command + " (" + e.file + "): " + said.fail + (ran.err.trim() === "" ? "" : "\n" + ran.err.trim()));
    const key = e.event + "\0" + e.command + "\0" + (e.plugin ?? "");
    if (!TOLD.has(key)) {
      TOLD.add(key);
      Plugins.say(hooks_whose(e, true) + " " + e.event + " hook " + clip(e.command) + " failed: " + said.fail + (said.block === undefined ? "" : ", so it said no") + " (illi.log has more).");
    }
  }
  return said;
}

// a project's hooks file new or changed since illi last started with it
// (Seen.ts): said once (it runs from now on)
function hooks_seen(file: string): void {
  const n = ENTRIES.filter((e) => e.file === file).length;
  if (n > 0 && Seen.changed("hooks " + file, [file])) {
    Plugins.say("This project's " + config.config_home(file) + " is new or changed since illi last started here: its " + (n === 1 ? "hook runs" : n + " hooks run") + " as you work (/agents lists them).");
  }
}

// each tool hook whose matcher names only Claude Code's tools that illi
// doesn't take for its own (all but Bash): said once, as it runs only on
// claude-code's own calls
function hooks_claude(): void {
  for (const e of ENTRIES.filter((e) => e.event === "PreToolUse" || e.event === "PostToolUse")) {
    const names = /^[A-Za-z0-9_\- ,|]+$/.test(e.match) ? e.match.split(/[|,]/).map((x) => x.trim()).filter(Boolean) : [];
    if (names.length > 0 && names.every((n) => CLAUDE_TOOLS.includes(n))) {
      Plugins.say(hooks_whose(e, true) + " " + e.event + " hook " + clip(e.command) + " matches " + names.join("|") + ", Claude Code's tools: illi's are shell, read, write, edit..., whose input differs, so it runs only on claude-code's own calls.");
    }
  }
}

// a hooks file's commands, whether it turns all hooks off, and what in it
// won't do; why it won't read (none: no file, nothing). A plugin's,
// its variables given
function file_read(file: string, b: Bundle | null): { entries: Entry[]; troubles: string[]; off: boolean } | string {
  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err: any) {
    return err?.code === "ENOENT" ? { entries: [], troubles: [], off: false } : String(err?.message ?? err);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return "it isn't a JSON object";
  }
  const got = hooks_of_map(data.hooks ?? {}, file, b);
  return typeof got === "string" ? got : { ...got, off: b === null && data.disableAllHooks === true };
}

// an event map's commands (a hooks file's "hooks", or a plugin
// manifest's inline hooks), and what in it won't do; why it won't (not
// an object). A plugin's matchers name its own MCP servers as illi does
// (mcp__plugin_<plugin>_<server>: mcp__<server>)
function hooks_of_map(hooks: unknown, file: string, b: Bundle | null): { entries: Entry[]; troubles: string[] } | string {
  if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
    return "its \"hooks\" isn't an object";
  }
  const entries: Entry[] = [];
  const troubles: string[] = [];
  const vars = b === null ? {} : Bundle.vars(b);
  for (const [event, list] of Object.entries(hooks)) {
    if (!EVENTS.includes(event as Event)) {
      troubles.push("no event " + event + " (illi's: " + EVENTS.join(", ") + ")");
      continue;
    }
    if (!Array.isArray(list)) {
      troubles.push(event + " isn't a list");
      continue;
    }
    for (const group of list) {
      const given = typeof group?.matcher === "string" ? group.matcher : "";
      const match = b === null ? given : given.split("mcp__plugin_" + b.name + "_").join("mcp__");
      const matcher = matcher_of(match);
      if (typeof matcher === "string") {
        troubles.push(event + "'s matcher " + JSON.stringify(given) + " won't do: " + matcher);
        continue;
      }
      for (const hook of Array.isArray(group?.hooks) ? group.hooks : []) {
        if (hook?.type !== "command" || typeof hook.command !== "string" || hook.command.trim() === "") {
          troubles.push(event + ": only { \"type\": \"command\", \"command\": \"...\" } hooks run");
          continue;
        }
        const secs = typeof hook.timeout === "number" && hook.timeout > 0 ? hook.timeout : TIMEOUTS[event as Event];
        const fail = hook.onFailure === "block" || hook.onFailure === "continue" ? hook.onFailure : event === "PreToolUse" ? "block" : "continue";
        entries.push({ event: event as Event, match, matcher, command: hook.command, timeout: Math.min(secs, event === "SessionEnd" ? SPAN : Infinity) * 1000, fail, file, plugin: b?.name ?? null, vars });
      }
    }
  }
  return { entries, troubles };
}

// what a matcher takes, as Claude Code reads one: "", * or none, all;
// only letters, digits, _, -, spaces, | and commas, those names exactly;
// else a regular expression found anywhere in the name; why it won't do
function matcher_of(match: string): ((what: string) => boolean) | null | string {
  if (match === "" || match === "*") {
    return null;
  }
  if (/^[A-Za-z0-9_\- ,|]+$/.test(match)) {
    const names = new Set(match.split(/[|,]/).map((x) => x.trim()).filter((x) => x !== ""));
    return (what) => names.has(what);
  }
  try {
    const re = new RegExp(match);
    return (what) => re.test(what);
  } catch (err: any) {
    return String(err?.message ?? err);
  }
}

// exit 2's block, where its event sends it: a tool's call refused, or
// what the model reads after it; a message kept back; a turn going on;
// elsewhere, said to the user
function blocked(event: Event, why: string): Said {
  switch (event) {
    case "PreToolUse":
    case "UserPromptSubmit":
    case "Stop": {
      return { block: why };
    }
    case "PostToolUse": {
      return { context: why };
    }
    default: {
      return { note: why };
    }
  }
}

// a JSON answer, as Claude Code's fields say: a note to the user
// (systemMessage); the turn stopped (continue: false, why its
// stopReason: where there is nothing to stop, said), over anything else
// it says; a tool's call refused,
// allowed, asked about, its input changed (hookSpecificOutput's
// permissionDecision, its reason and updatedInput; the older decision
// approve or block); a block (decision block, its reason); context
// (additionalContext: a Stop's makes the turn go on). A field of the
// wrong type is passed over
function decided(event: Event, label: string, json: any): Said {
  const own = typeof json.hookSpecificOutput === "object" && json.hookSpecificOutput !== null ? json.hookSpecificOutput : {};
  const text = (x: unknown) => (typeof x === "string" && x.trim() !== "" ? x.trim() : undefined);
  const said: Said = {};
  const note = text(json.systemMessage);
  if (note !== undefined) {
    said.note = note;
  }
  if (json.continue === false) {
    const why = text(json.stopReason) ?? label + " stopped illi.";
    return STOPS[event] ? { ...said, stop: why } : { note: said.note === undefined ? why : said.note + "\n" + why };
  }
  const context = text(own.additionalContext);
  if (event === "PreToolUse") {
    const decision = own.permissionDecision ?? (json.decision === "approve" ? "allow" : json.decision === "block" ? "deny" : undefined);
    const why = text(own.permissionDecisionReason) ?? text(json.reason);
    if (decision === "deny") {
      return { ...said, block: why ?? label + " refused this call." };
    }
    if (decision === "ask") {
      said.ask = why ?? label.charAt(0).toLowerCase() + label.slice(1) + " asks";
    } else if (decision === "allow") {
      said.allow = true;
    }
    if (typeof own.updatedInput === "object" && own.updatedInput !== null && !Array.isArray(own.updatedInput)) {
      said.input = own.updatedInput;
    }
    return context === undefined ? said : { ...said, context };
  }
  const block = json.decision === "block" ? text(json.reason) ?? (event === "Stop" ? label + " asks you to go on." : label + " said no.") : undefined;
  switch (event) {
    case "PostToolUse": {
      const more = [block, context].filter((x) => x !== undefined).join("\n\n");
      return more === "" ? said : { ...said, context: more };
    }
    case "UserPromptSubmit": {
      return block !== undefined ? { ...said, block } : context !== undefined ? { ...said, context } : said;
    }
    case "Stop": {
      const why = block ?? context;
      return why === undefined ? said : { ...said, block: why };
    }
    case "SessionStart": {
      return context === undefined ? said : { ...said, context };
    }
    default: {
      return said;
    }
  }
}

// a JSON object (null: not one)
function json_parse(text: string): any {
  try {
    const data = JSON.parse(text);
    return typeof data === "object" && data !== null && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

// context as the model is told it: TOLD_MAX characters at most, said so
// where cut
function cap(text: string): string {
  return text.length <= TOLD_MAX ? text : text.slice(0, TOLD_MAX) + "\n[cut at " + TOLD_MAX + " characters]";
}

// a command as a note names it: one line, cut
function clip(command: string): string {
  const one = command.replace(/\s+/g, " ").trim();
  return one.length > 60 ? one.slice(0, 59) + "…" : one;
}
