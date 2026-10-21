// Tools
// =====
// Illi's prompts, tools and agents. Calls get the tools as MCP over one
// local port, at a URL with the chat's secret and the caller ("main", an
// agent; a compaction has none).
// shell, read, write and edit run here, on the user's computer, in the
// working dir: where illi was started (each call's message names it). A
// request dropped (its call stopped) stops its job.
// An agent (a subagent) has a name and a log (one spawned as a user's
// subagent: that agent's name, numbered while another so named is at
// work or of this run, as reviewer-2; else a random one; a name freed
// is used again, each log its own); each call gets its context and its
// whole log, so a told agent goes on even after a restart; its replies
// reach the chat as one "[Name]" message. One spawned as a user's
// subagent (Custom.ts) runs on its model, with its instructions and
// tools; so does the master, given a primary agent (Shift+Tab, /agent).
// Beside these, the user's: their skills (one tool, skill, listing them)
// and their MCP servers' tools (Mcp.ts), for the master and agents alike;
// a listing waits for the servers still starting. The master keeps a
// to-do list as it works (todo: the whole list each time), in the chat's
// folder (TODO_FILE), which the views show with what its calls use
// (Tools.state).
// A call on claude-code runs in Claude Code, with its own prompt and
// tools: it gets the tools Claude Code lacks (a `lean` list: no shell or
// files), and prompts that say it works inside illi (Tools.hosted), the
// project's CLAUDE.md left to Claude Code, which reads it itself.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AskAI, type Ask, type Block, type Call, type Event, type Kind, type Vendor } from "../ai/AskAI.ts";
import type { Out } from "../ai/Agent.ts";
import { report_text } from "../ui/Call.ts";
import { ChatGPT } from "../ai/ChatGPT.ts";
import { clip_page } from "./Clip.ts";
import * as config from "../config/Config.ts";
import { Custom, type Skill } from "../config/Custom.ts";
import { INT, STR, TOOLS, Machine, spec, type Spec } from "./Machine.ts";
import { Mcp } from "./Mcp.ts";
import { MAIN, Memory } from "../chat/Memory.ts";
import PROMPT from "./prompt.txt" with { type: "text" };
import { EFFORTS, Pick } from "../ai/Pick.ts";
import type { Live, State, Todo } from "../ui/View.ts";

export type { Live };

// Types
// =====

// at work, the view its calls get and its replies so far; its role: its
// effort if spawned with one, the user's agent it runs as (null: none);
// the run it was spawned in (Memory.run; -1: taken back from its log),
// its log (Memory.agent_log: the name may go on to another agent)
export type Agent = {
  name    : string;
  run     : number;
  log?    : string;
  role    : { $: "sub"; effort: string | null; agent: string | null };
  call    : Call | null;
  live    : Live[];
  calls   : Record<string, string>; // its tool calls awaiting their results, by id (Chat.on)
  stop    : boolean; // its call was stopped: the report stays unanswered
  view    : Block[];
  replies : string[];
};

// what the chat does for agents (report: work stopped, or cut by the
// vendor busy or out of reach, stays unanswered: a turn would fail alike;
// pick: the chat's pick; halt: what stops its turn; main: the master's
// agent, null: none)
type Hooks = {
  push   : (agent: Agent, kind: Kind, text: string) => void;
  on     : (agent: Agent, ev: Event) => void;
  report : (agent: Agent, text: string, stopped: boolean) => void;
  change : () => void;
  pick   : () => Pick;
  halt   : () => AbortSignal;
  main   : () => string | null;
};

// the tools: their secret and URL, the working dir, the master's to-do
// list (none: not read yet)
export type Tools = {
  mem    : Memory;
  agents : Map<string, Agent>;
  key    : string;
  url    : string;
  cwd    : string;
  hooks  : Hooks;
  todo?  : Todo[];
};

// Constants
// =========

// the most web searches a request of a turn or a subagent runs
export const SEARCHES = 10;

// the chats' tools, by their secret; the server, once one is
const CHATS = new Map<string, Tools>();
let HTTP: ReturnType<typeof Bun.serve> | null = null;

// the master's prompt (a turn's and a compaction's): prompt.txt
export const MASTER = PROMPT.trim();

const SUB_HEAD = `You are a subagent of illi, an AI agent that works for one user in a
single chat that never ends. illi gave you a task. Do it yourself, with
your tools, following the user's instructions at the end of this
prompt: they say who the user is, how their files are organized and how
they want work done.

Your first message holds the view below, then your chat with illi so far,
its lines as "i|kind: text": what you are (note), your task (user), and
later all you did and were told. The view shows you what illi knows: what the user wants,
decided and taught. Use it as context only, and do what your task says,
not what the user's last message says, since illi may have given you
just part of the work. Your final reply is your report to illi. illi may
send you more messages, even while you work: answer the last.`;

const VIEW_DOC = `The view: the whole chat between illi and the user, oldest first, inside
<chat> tags, as one-line summaries. Each line is

  id+n|text   the n messages from id on, summarized (newlines shown as spaces)

A summary tags each item with its kind: user (the user's words), illi
(illi's replies), tool (illi's tool calls), echo (their results), note
(illi's own notices: a stop, a goal met, a new session, a restart), or
work (the report of an agent, starting "[Name]"). A short message is its own line, word for word. Recent lines
cover one message each; the older the messages, the more a line covers.
A message not summarized yet shows as "(not summarized yet: zoom it)".
No message appears in full, not even the last ones. A text too long for
one message is split over several in a row.

Navigating: zoom(id, n) opens line id+n into the two lines of n/2
messages it was made from; zoom(id, 1) gives message id in full, with
the images its "[image <file>]" lines name. Zoom whenever a summary
only mentions something you need, such as what your last reply said, a
decision, a past attempt or where a file is, before you act, guess or
ask. date(id) gives the date and time of message id. zoom("Name") gives
an agent's whole chat.`;

// an agent's log starts with a note of what it is: SUB_NOTE, the user's
// agent it runs as, and its effort if not the configured one
const SUB_NOTE = "subagent";
const SUB_AT   = " at effort ";
const SUB_RE   = /^subagent(?: ([a-z0-9][a-z0-9_-]*))?(?: at effort (\S+))?$/i;

// where the tools run, in the system prompt (HERE_DOC); the working dir,
// at the start of each call's message (Tools.here), so a start elsewhere
// changes a call's tail, never its cached prefix
const HERE_DOC = `Your shell, read, write and edit tools run on the user's computer, in
the working dir named at the start of each message: the folder where the
user started illi. Relative paths start there.`;

// a subagent's prompt: its part, then the view's and the tools' docs
export const SUB = SUB_HEAD + "\n\n" + VIEW_DOC + "\n\n" + HERE_DOC;

// a prompt's words for a call in Claude Code (Tools.hosted): who it is
// is Claude Code's to say, its tools its own; illi's come from illi
const HOSTED: Array<[string | RegExp, string]> = [
  [/^You are illi \(short for Illimitable\), an AI agent that works for one user in a\nsingle chat that never ends\./, "Here you work inside illi (short for Illimitable), for one user in a single\nchat that never ends: your replies show in it as illi's."],
  [/^You are a subagent of illi, an AI agent that works for one user in a\nsingle chat that never ends\./, "Here you work as a subagent of illi (short for Illimitable), an app that\nworks for one user in a single chat that never ends."],
  [/Your shell, read, write and edit tools run/, "Your tools run"],
];
const HOSTED_TOOLS = `illi's own tools (zoom, date, todo, spawn, tell, skill and the user's
MCP servers in illi) come from illi, as its MCP server's (mcp__illi__):
keep your to-do list with illi's todo, which the user sees beside the
chat.`;

// the tools of everyone (OWN), the master's (BOSS), and those that run
// on this computer (Machine.ts's TOOLS)
const OWN: Spec[] = [
  spec("zoom", "Open the line id+n of the view into the two lines of n/2 under it; n = 1 gives the message whole. With an agent's name as id, give that agent's whole chat. A long text comes in pages from character at, saying where to go on.", { id: { type: ["integer", "string"] }, n: INT, at: INT }, ["id"]),
  spec("date", "The date and time of message id.", { id: INT }, ["id"]),
];
const SPAWN = "Start one subagent per task, in parallel, and return their names at once. Each one's report reaches you as a message \"[Name] report\" when it finishes. A subagent sees the view and the user's instructions, but knows what you want only from its task.";
const EFFORT = { type: "string", enum: EFFORTS, description: "How hard they think. Leave it out to use their agent's effort (or, with none, yours); set it only to override that." };
const TELL: Spec = spec("tell", "Send a message to a subagent, by name. One at work reads it between its tool calls, and its report answers it; an idle one goes on from its chat, and its reply reaches you as a message \"[Name] reply\".", { name: STR, message: STR }, ["name", "message"]);

const SKILL = "Load a skill, the user's or illi's own: instructions for a kind of task, and the folder of any files it comes with. When a task matches a skill's description below, load it before starting and follow it.";

// the master's to-do list, which the user sees beside the chat: its
// tool, its items' states, its file in the chat's folder
const TODO: Spec = spec("todo", "Keep your to-do list for the work at hand; the user sees it beside the chat. Give the whole list each time: it replaces the one before. Use it for work of three steps or more, or when the user asks for several things: write the steps as you plan them, pending; mark one active as you start it, and only one at a time; mark it done as soon as it is, before starting the next, not in batches at the end; add the steps you find on the way, and drop those no longer needed. Skip it for a question or a quick one-step task. New work replaces a finished list; an empty list clears it.", {
  items: { type: "array", items: { type: "object", properties: { text: { type: "string", description: "The step, in a few words: Run the tests" }, status: { type: "string", enum: ["pending", "active", "done"] } }, required: ["text", "status"] } },
}, ["items"]);
const STATUSES: Todo["status"][] = ["pending", "active", "done"];
const TODO_FILE = "/todo.json";

// the most of a skill's files named when it loads
const FILES = 50;

// the most bytes of a rules file sent (a longer one cut, saying so), and
// a project's rules files, in each folder the first there
const RULES_MOST = 40000;
const PROJECT    = ["AGENTS.md", "CLAUDE.md"];

// a rules file's text, cut past RULES_MOST bytes (saying so); null if it
// can't be read (none there, a folder): a missing file is no rules
function rules_read(file: string): string | null {
  try {
    const all  = fs.readFileSync(file);
    const text = all.subarray(0, RULES_MOST).toString("utf8").trim();
    return all.length > RULES_MOST ? text + "\n(cut here: only its first " + RULES_MOST / 1000 + " KB are read)" : text;
  } catch {
    return null;
  }
}

// the skill tool, listing the user's skills (none: no tool)
function skill_tools(cwd: string): Spec[] {
  const skills = Custom.skills(cwd);
  const list = skills.map((s) => "- " + s.name + (s.description === "" ? "" : ": " + s.description)).join("\n");
  return skills.length === 0 ? [] : [spec("skill", SKILL + "\n\n" + list, { name: { type: "string", enum: skills.map((s) => s.name) } }, ["name"])];
}

// the master's tools: spawn, with the user's subagents to run tasks as,
// if any; tell; todo
function boss(cwd: string): Spec[] {
  const agents = Custom.subagents(cwd).map((a) => a.name + (a.description === "" ? "" : " (" + a.description + ")"));
  const agent = { type: "string", description: "The user's agent to run each task as, by name, with its own instructions, model and tools: " + agents.join("; ") + ". None: a plain subagent." };
  const fields = agents.length === 0 ? { tasks: { type: "array", items: STR }, effort: EFFORT } : { tasks: { type: "array", items: STR }, agent, effort: EFFORT };
  return [spec("spawn", SPAWN, fields, ["tasks"]), TELL, TODO];
}

// Tools
// =====

export namespace Tools {

  export function serve(mem: Memory, hooks: Hooks, cwd: string): Tools {
    const key = crypto.randomUUID();
    const url = Tools.base() + key + "/";
    const tools: Tools = { mem, agents: new Map(), key, url, cwd, hooks };
    CHATS.set(key, tools);
    return tools;
  }

  // this process's tools URL
  export function base(): string {
    HTTP ??= Bun.serve({ port: 0, hostname: "127.0.0.1", idleTimeout: 0, fetch: Tools.fetch });
    return "http://127.0.0.1:" + HTTP.port + "/";
  }

  export function at(tools: Tools, who: string): string {
    return tools.url + who;
  }

  // a call's system prompt: its instructions, then the user's rules
  // (Tools.rules) for a call working in cwd; one on claude-code, its
  // instructions as they read in Claude Code (Tools.hosted)
  export function system(head: string, cwd: string, vendor?: Vendor): string {
    const hosted = vendor === "claude-code";
    return (hosted ? Tools.hosted(head) : head) + "\n\n" + Tools.rules(cwd, hosted);
  }

  // a prompt as Claude Code gets it, after its own: who it is and its
  // tools left to Claude Code (HOSTED), illi's tools named
  export function hosted(head: string): string {
    return HOSTED.reduce((text, [from, to]) => text.replace(from, to), head) + "\n\n" + HOSTED_TOOLS;
  }

  // the working dir and the computer it is on
  export function here(tools: Tools): Block {
    return { text: "Working dir: " + tools.cwd + " on " + os.hostname() + " (" + process.platform + ")\n\n", mark: false };
  }

  // a skill loaded: its folder, its instructions, the other files in its
  // folder (at most FILES), to read as it says; one built in, none
  export function skill(skill: Skill): string {
    if (skill.dir === "") {
      return "Skill " + skill.name + ": its instructions, whole, below (built into illi)\n\n" + skill.body;
    }
    const all   = (fs.readdirSync(skill.dir, { recursive: true }) as string[]).filter((f) => f !== "SKILL.md" && fs.statSync(skill.dir + "/" + f).isFile()).sort();
    const files = all.length === 0 ? "" : "\n\nIts files, in its folder: " + all.slice(0, FILES).join(", ") + (all.length > FILES ? ", and " + (all.length - FILES) + " more." : ".");
    return "Skill " + skill.name + ": its SKILL.md's instructions, whole, below; its folder: " + skill.dir + "\n\n" + skill.body + files;
  }

  // the master's agents at work now, and its to-do list if any, at the
  // start of each of its calls' messages: read from their calls (the
  // list from its file), so neither is kept apart nor drifts from the
  // truth, and a restart's call goes on with the list
  export function at_work(tools: Tools): Block {
    const names = Tools.working(tools).map((a) => a.name);
    const list  = Tools.todo(tools);
    const todo  = list.length === 0 ? "" : "\nYour to-do list (todo): " + Tools.todo_said(list) + "\n" + list.map((x) => "- " + x.status + ": " + x.text).join("\n") + "\n";
    return { text: "Agents at work now: " + (names.length === 0 ? "none." : names.join(", ") + ".") + "\n" + todo + "\n", mark: false };
  }

  // the user's rules: theirs for every project (config.RULES, RULES.md in
  // illi's folder; named even while there is none, so Illi knows where it
  // goes), then the project's (Tools.project), each whole up to RULES_MOST
  export function rules(cwd: string, hosted = false): string {
    const own  = rules_read(config.RULES);
    const top  = Tools.top(cwd);
    const each = Tools.project(cwd).filter((file) => !hosted || path.basename(file) !== "CLAUDE.md").flatMap((file) => {
      const text = rules_read(file);
      return text === null ? [] : ["This project's, in " + path.relative(top, file) + ":\n\n" + text];
    });
    return ["# The user's rules", "For every project, in " + config.RULES + ":\n\n" + (own || "(none yet)"), ...each].join("\n\n");
  }

  // a project's rules files: from its top (Tools.top) down to cwd, in
  // each folder the first of PROJECT there
  export function project(cwd: string): string[] {
    const top  = Tools.top(cwd);
    const dirs: string[] = [];
    for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
      dirs.unshift(dir);
      if (dir === top || dir === path.dirname(dir)) {
        break;
      }
    }
    return dirs.flatMap((dir) => PROJECT.map((name) => path.join(dir, name)).filter((file) => fs.existsSync(file)).slice(0, 1));
  }

  // a project's top: the nearest folder up from cwd holding .git, else
  // cwd itself
  export function top(cwd: string): string {
    for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, ".git"))) {
        return dir;
      }
      if (dir === path.dirname(dir)) {
        return path.resolve(cwd);
      }
    }
  }

  // MCP
  // ---

  // a notification gets no answer; a request dropped stops its job. A
  // URL with ?lean is a caller's in Claude Code (Tools.list)
  export async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const [, key, who, ...rest] = url.pathname.split("/");
    const lean = url.searchParams.has("lean");
    const tools = CHATS.get(key);
    const caller = who === MAIN || tools?.agents.has(who);
    const msg = await req.json().catch(() => ({}));
    if (tools === undefined || rest.length > 0 || !caller) {
      return new Response(null, { status: 404 });
    }
    if (req.method !== "POST") {
      return new Response(null, { status: 405 });
    }
    if (msg.id === undefined) {
      return new Response(null, { status: 202 });
    }
    const no = { error: { code: -32601, message: "no method " + msg.method } };
    const out = await Tools.answer(tools, who, msg.method, msg.params ?? {}, req.signal, lean).then(
      (result) => (result === null ? no : { result }),
      (err) => ({ error: { code: -32603, message: String(err?.message ?? err) } }),
    );
    return Response.json({ jsonrpc: "2.0", id: msg.id, ...out });
  }

  // null: no such method
  export async function answer(tools: Tools, who: string, method: string, params: any, signal: AbortSignal, lean = false): Promise<object | null> {
    switch (method) {
      case "initialize": {
        const protocolVersion = params.protocolVersion ?? "2025-06-18";
        return { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "illi", version: "1" } };
      }
      case "tools/list": {
        await Mcp.settle();
        return { tools: Tools.list(tools, who, lean).map((t) => ({ name: t.name, description: t.info, inputSchema: t.schema })) };
      }
      case "tools/call": {
        const name = String(params.name);
        const has = Tools.list(tools, who, lean).some((t) => t.name === name);
        const out = has ? await Tools.call(tools, who, name, params.arguments ?? {}, signal) : { text: "No tool " + name + ".", fail: true };
        const imgs = (out.imgs ?? []).map((img) => ({ type: "image", data: img.data, mimeType: img.type }));
        return { content: [{ type: "text", text: out.text }, ...imgs], isError: out.fail };
      }
      case "ping": {
        return {};
      }
    }
    return null;
  }

  // a caller's tools, as its agent allows; `lean`, a caller in Claude
  // Code, none it has (shell, files: TOOLS)
  export function list(tools: Tools, who: string, lean = false): Spec[] {
    const user = [...skill_tools(tools.cwd), ...Mcp.tools()];
    const here = lean ? [] : TOOLS;
    if (who === MAIN) {
      return Custom.allow(Custom.agent(tools.cwd, tools.hooks.main()), [...OWN, ...boss(tools.cwd), ...here, ...user]);
    }
    return Custom.allow(Custom.agent(tools.cwd, tools.agents.get(who)?.role.agent ?? null), [...OWN, ...here, ...user]);
  }

  export async function call(tools: Tools, who: string, name: string, args: any, signal: AbortSignal): Promise<Out> {
    const mem = tools.mem;
    switch (name) {
      case "zoom": {
        const id = String(args.id);
        const n = Number(args.n ?? 1);
        const at = Number(args.at ?? 0);
        if (/^[A-Za-z]/.test(id)) {
          return { text: clip_page(Memory.agent_show(mem, id), at), fail: false };
        }
        const imgs = n === 1 && at === 0 ? Memory.images(mem, Number(id)) : [];
        return { text: Memory.zoom(mem, Number(id), n, at), fail: false, imgs };
      }
      case "date": {
        return { text: Memory.date(mem, Number(args.id)), fail: false };
      }
      case "spawn": {
        const effort = args.effort === undefined ? null : String(args.effort);
        const agent = args.agent === undefined || args.agent === "" ? null : String(args.agent);
        if (effort !== null && !EFFORTS.includes(effort)) {
          return { text: "No effort " + effort + "; one of " + EFFORTS.join(", ") + ".", fail: true };
        }
        const profile = agent === null ? null : Custom.agent(tools.cwd, agent);
        if (agent !== null && (profile === null || profile.mode === "primary")) {
          const names = Custom.subagents(tools.cwd).map((a) => a.name).join(", ") || "none";
          const what  = profile === null ? "No agent " + agent : agent + " is a primary agent, never spawned";
          return { text: what + "; the user's subagents: " + names + ".", fail: true };
        }
        return { text: await Tools.spawn(tools, (args.tasks ?? []).map(String), { $: "sub", effort, agent: profile?.name ?? null }), fail: false };
      }
      case "tell": {
        return { text: await Tools.tell(tools, String(args.name), String(args.message)), fail: false };
      }
      case "skill": {
        const skill = Custom.skill(tools.cwd, String(args.name));
        const names = Custom.skills(tools.cwd).map((s) => s.name).join(", ") || "none";
        return skill === null ? { text: "No skill " + args.name + "; the skills: " + names + ".", fail: true } : { text: Tools.skill(skill), fail: false };
      }
      case "todo": {
        const list = Tools.todo_check(args.items);
        if (typeof list === "string") {
          return { text: list, fail: true };
        }
        Tools.todo_set(tools, list);
        return { text: Tools.todo_said(list), fail: false };
      }
      default: {
        return name.startsWith("mcp__") ? Mcp.call(name, args, signal) : Machine.run({ name, input: args, cwd: tools.cwd }, signal);
      }
    }
  }

  // Agents
  // ------

  export async function spawn(tools: Tools, tasks: string[], role: Agent["role"]): Promise<string> {
    const view = tasks.length === 0 ? "No tasks." : await Tools.view(tools);
    if (typeof view === "string") {
      return view;
    }
    const names = tasks.map((task) => Tools.start(tools, role, task, view));
    return "Started " + names.join(", ") + ". Each one's report will reach you as a message when it finishes.";
  }

  export async function tell(tools: Tools, name: string, message: string): Promise<string> {
    const agent = Tools.agent(tools, name);
    if (agent === null) {
      return "No agent " + name + " to tell.";
    }
    if (agent.call !== null) {
      tools.hooks.push(agent, "user", message);
      agent.call.send({ text: message, imgs: [] });
      return "Sent. " + name + " reads it between its tool calls, and its report answers it.";
    }
    const view = await Tools.view(tools);
    if (typeof view === "string") {
      return view;
    }
    tools.hooks.push(agent, "user", message);
    Tools.run(tools, Object.assign(agent, { view, replies: [], stop: false }));
    return "Sent. " + name + "'s reply will reach you as a message.";
  }

  export function start(tools: Tools, role: Agent["role"], task: string, view: Block[]): string {
    const run = Memory.run(tools.mem);
    const name = Memory.agent_new(tools.mem, role.agent, (name) => {
      const was = tools.agents.get(name);
      return was !== undefined && (was.call !== null || was.run === run);
    });
    const agent = { name, run, log: Memory.agent_log(tools.mem, name) ?? name, role, call: null, live: [], calls: {}, stop: false, view, replies: [] };
    tools.agents.set(name, agent);
    tools.hooks.push(agent, "note", SUB_NOTE + (role.agent === null ? "" : " " + role.agent) + (role.effort === null ? "" : SUB_AT + role.effort));
    tools.hooks.push(agent, "user", task);
    Tools.run(tools, agent);
    return name;
  }

  // one not loaded is taken back from its log, idle; none is MAIN
  export function agent(tools: Tools, name: string): Agent | null {
    if (name === MAIN) {
      return null;
    }
    const log = tools.agents.has(name) ? null : Memory.agent(tools.mem, name);
    const note = log !== null && log.length > 0 && log[0].kind === "note" ? log[0].text : "";
    const sub = SUB_RE.exec(note);
    if (sub !== null) {
      const role = { $: "sub" as const, effort: sub[2] ?? null, agent: sub[1] ?? null };
      tools.agents.set(name, { name, run: -1, log: Memory.agent_log(tools.mem, name) ?? name, role, call: null, live: [], calls: {}, stop: false, view: [], replies: [] });
    }
    return tools.agents.get(name) ?? null;
  }

  // calls while a message waits in its log (told too late for the call
  // before); then its report, unanswered if stopped or the vendor was busy
  // or out of reach (End.again). Detached: a throw ends it as a failed
  // reply, still reported
  export async function run(tools: Tools, agent: Agent, call: Call | null = null): Promise<void> {
    let away = false;
    try {
      for (let more = true; more; call = null) {
        agent.call = call ?? AskAI.ask(Tools.ask(tools, agent), (ev) => tools.hooks.on(agent, ev));
        tools.hooks.change();
        const end = await agent.call.done;
        agent.call = null;
        agent.replies.push(end.ok ? end.text : "failed: " + end.text);
        more = end.ok && end.left.length > 0;
        away = !end.ok && end.again === true;
      }
    } catch (err: any) {
      agent.call = null;
      agent.replies.push("failed: " + String(err?.message ?? err));
    }
    tools.hooks.report(agent, report_text(agent.name, agent.log ?? agent.name, agent.replies.join("\n\n")), agent.stop || away);
  }

  // a call of an agent: on its user's agent's model, else the agents
  // pick of the chat's vendor, else the chat's pick (an agent's model not
  // offered gives way to them)
  export function ask(tools: Tools, agent: Agent): Ask {
    const log = { text: Memory.agent_show(tools.mem, agent.name), mark: true };
    const server = Tools.at(tools, agent.name);
    const profile = Custom.agent(tools.cwd, agent.role.agent);
    const base = config.config_role("agents", tools.hooks.pick());
    const own = profile === null ? base : Custom.pick(profile, base, config.OFFER);
    const run = Pick.ask(typeof own === "string" ? base : own);
    const system = Tools.system(SUB + Custom.section(profile), tools.cwd, run.vendor);
    const blocks = [...agent.view, Tools.here(tools), log];
    const effort = agent.role.effort ?? run.effort;
    return { ...run, effort, system, blocks, searches: SEARCHES, server };
  }

  // a string: why there is none (Memory.settle)
  export async function view(tools: Tools): Promise<Block[] | string> {
    const why = await Memory.settle(tools.mem, tools.mem.count, tools.hooks.halt());
    return why ?? Memory.view(tools.mem);
  }

  export function working(tools: Tools): Agent[] {
    return [...tools.agents.values()].filter((a) => a.call !== null);
  }

  // every agent at work (name null), or the one named
  export function stop(tools: Tools, name: string | null): void {
    for (const agent of Tools.working(tools).filter((a) => name === null || a.name === name)) {
      agent.stop = true;
      agent.call?.stop();
    }
  }

  // To-do
  // -----

  // what the views show of the tools (Chat.state): what the master's
  // calls use (the input its last request read, the plan's limits and
  // name), its to-do list
  export function state(tools: Tools): { use: State["use"]; todo: Todo[] } {
    return { use: { tokens: AskAI.held(Tools.at(tools, "main")), limits: ChatGPT.limits(), plan: ChatGPT.tier() }, todo: Tools.todo(tools) };
  }

  // the master's to-do list: as last set, else as its file keeps it
  export function todo(tools: Tools): Todo[] {
    tools.todo ??= Tools.todo_load(tools.mem.dir + TODO_FILE);
    return tools.todo;
  }

  // the todo tool's items as a list; a string: why they make none (an
  // item without text or a status; more than one active)
  export function todo_check(items: unknown): Todo[] | string {
    if (!Array.isArray(items)) {
      return "items must be a list of {text, status}.";
    }
    const list = items.map((x): Todo => ({ text: String(x?.text ?? "").replace(/\s+/g, " ").trim(), status: x?.status }));
    const bad  = list.findIndex((x) => x.text === "" || !STATUSES.includes(x.status));
    const busy = list.filter((x) => x.status === "active").length;
    if (bad >= 0) {
      return "Item " + (bad + 1) + " needs a text and a status: pending, active or done. Nothing was changed.";
    }
    if (busy > 1) {
      return busy + " items are active: keep one active at a time, the one you work on. Nothing was changed.";
    }
    return list;
  }

  // the list set: kept in its file, and shown at once
  export function todo_set(tools: Tools, list: Todo[]): void {
    tools.todo = list;
    fs.writeFileSync(tools.mem.dir + TODO_FILE, JSON.stringify(list, null, 2) + "\n");
    tools.hooks.change();
  }

  // a list's file, read; none, or one that won't read: no list
  export function todo_load(file: string): Todo[] {
    try {
      const list = Tools.todo_check(JSON.parse(fs.readFileSync(file, "utf8")));
      return typeof list === "string" ? [] : list;
    } catch {
      return [];
    }
  }

  // a list, as its tool answers: how far along, what is active
  export function todo_said(list: Todo[]): string {
    const done   = list.filter((x) => x.status === "done").length;
    const active = list.find((x) => x.status === "active");
    return list.length === 0 ? "The to-do list is cleared." : done + " of " + list.length + " done" + (active === undefined ? "." : "; active: " + active.text + ".");
  }

}
