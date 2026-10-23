// Tools
// =====
// illi's prompts, tools and agents. Calls get the tools as MCP over one
// local port, at a URL with the chat's secret and the caller ("main", an
// agent; a compaction has none).
// shell, read, write and edit run here, on the user's computer, in the
// working dir: where illi was started (each call's message names it, and
// its project). A request dropped (its call stopped) stops its job.
// zoom and date read the chat, or another project's (Tools.chat_of);
// projects and search look across them all (Projects.ts).
// An agent (a subagent) has a name and a log (one spawned as a user's
// subagent: that agent's name, numbered while another so named is at
// work or of this run, as reviewer-2; else a random one; a name freed
// is used again, each log its own); each call gets its context and its
// whole log, so a told agent goes on even after a restart; its replies
// reach the chat as one "[Name]" message. One spawned as a user's
// subagent (Custom.ts) runs on its model, with its instructions and
// tools; so does the master, given a primary agent (Shift+Tab, /agent).
// Beside these, the user's: their skills (one tool, skill, listing them;
// it turns a sticky one on and off too, Custom.ts)
// and their MCP servers' tools (Mcp.ts), for the master and agents alike;
// a listing waits for the servers still starting. The master keeps a
// to-do list as it works (todo: the whole list each time), the
// project's, in the chat's file (Store.todo), which the views show with
// what its calls use (Tools.state); one with every item done is let go
// as a turn starts or ends (todo_finished).
// A call on claude-code runs in Claude Code, with its own prompt and
// tools: it gets the tools Claude Code lacks (a `lean` list: no shell or
// files), and prompts that say it works inside illi (Tools.hosted), the
// project's CLAUDE.md left to Claude Code, which reads it itself.
// Every call goes first to the user's plugins and hooks
// (Plugins.before_tool: they may refuse it, change its input, allow it,
// have it asked or add to what the model reads after it), then, for
// shell, read, write, edit or an MCP tool, and as Claude Code asks leave
// for one of its own (approve), it is judged on that input (Tools.guard: Guard.ts, by the user's rules and grants in
// Permissions.ts and the mode; one a hook allowed as yolo mode would,
// one it asks about asked whatever): run, asked about with why, or
// refused, each refusal recorded for the side panel and /permissions;
// what a call that ran answers goes to the plugins last (after_tool).
// The plugins' own tools are theirs to run (plugin__...).

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
import { Plugins } from "../config/Plugins.ts";
import { Trusted } from "../config/Trusted.ts";
import { Guard, MODES, type Mode, type Verdict, type Where } from "./Guard.ts";
import { Permissions } from "./Permissions.ts";
import { INT, STR, TOOLS, Machine, spec, type Spec } from "./Machine.ts";
import { Mcp } from "./Mcp.ts";
import { Logs, MAIN } from "../chat/Logs.ts";
import { Memory, TOKEN } from "../chat/Memory.ts";
import PROMPT from "./prompt.txt" with { type: "text" };
import { EFFORTS, Pick } from "../ai/Pick.ts";
import { Projects } from "../chat/Projects.ts";
import { Store } from "../chat/Store.ts";
import type { Background, Live, Perms, Plan, Query, Question, Refused, State, Todo } from "../ui/View.ts";

export type { Live };

// Types
// =====

// at work, the view its calls get and its replies so far; its role: its
// effort if spawned with one, the user's agent it runs as (null: none);
// the run it was spawned in (Memory.run; -1: taken back from its log),
// its log (Logs.log: the name may go on to another agent)
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
// a question's answer (Hooks ask): yes (illi's own: answered), and
// whether not to ask again (its grants kept: Tools.guard); what the user
// said, for the model: a no's reason, the answer to illi's own
export type Reply = { yes: boolean; always: boolean; said: string };

type Hooks = {
  ask    : (q: Omit<Question, "id">, signal: AbortSignal) => Promise<Reply>;
  push   : (agent: Agent, kind: Kind, text: string) => void;
  on     : (agent: Agent, ev: Event) => void;
  report : (agent: Agent, text: string, stopped: boolean) => void;
  change : () => void;
  pick   : () => Pick;
  halt   : () => AbortSignal;
  main   : () => string | null;
};

// the tools: their URL (a secret in it), the working dir, the main agent's to-do
// list (none: not read yet), the permissions of this run (Perm)
export type Tools = {
  mem    : Memory;
  agents : Map<string, Agent>;
  perm   : Perm;
  url    : string;
  cwd    : string;
  hooks  : Hooks;
  todo?  : Todo[];
};

// the permissions of this run (Tools.guard): the mode /mode set (null:
// the `mode` setting's), the grants /permissions gave (exact, for this
// run only), the requests refused (the latest REFUSALS, oldest first)
export type Perm = { mode: Mode | null; granted: Set<string>; refused: Refused[] };

// Constants
// =========

// the most web searches a request of a turn or a subagent runs
export const SEARCHES = 10;

// the chats' tools, by their secret; the server, once one is
const CHATS = new Map<string, Tools>();

// the vendors that tell a plan (View.Plan: its limits shown at the side),
// each by how: one added here shows as the others do
const PLANS: Partial<Record<Vendor, () => Plan | null>> = { chatgpt: ChatGPT.told };
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

// what stands for a subagent's view's oldest lines, left out to fit its
// model (Tools.fitted)
const LEFT_OUT = "(older lines left out to fit your model: zoom and search find them)\n";

const VIEW_DOC = `The view: the chat between illi and the user (since its last new session,
if any: search finds what came before), oldest first, inside <chat> tags,
as one-line summaries. Each line is

  id+n|text   the n messages from id on, summarized (newlines shown as spaces)

A summary tags each item with its kind: user (the user's words), illi
(illi's replies), tool (illi's tool calls), echo (their results), note
(illi's own notices: a stop, a goal met, a new session, a restart),
recap (illi's recap of the chat before it, at the user's /compact), or
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
an agent's whole chat.

Each project has its own chat: the git repo illi runs in, or home outside
any repo; this one is named at the start of each message. projects()
lists them all; search(words) finds summary lines holding the words,
with project in that project's chat, or in all ("all"); zoom and date
take a project too.`;

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
  [/^You are illi \(short for illimitable\), an AI agent that works for one user in a\nsingle chat that never ends\./, "Here you work inside illi (short for illimitable), for one user in a single\nchat that never ends: your replies show in it as illi's."],
  [/^You are a subagent of illi, an AI agent that works for one user in a\nsingle chat that never ends\./, "Here you work as a subagent of illi (short for illimitable), an app that\nworks for one user in a single chat that never ends."],
  [/Your shell, read, write and edit tools run/, "Your tools run"],
];
// Claude Code's permission prompt (--permission-prompt-tool), answered
// by the user at illi's screen; illi's own tools that Claude Code loads
// up front (the user's MCP servers' wait for its tool search)
const APPROVE: Spec = spec("approve", "Claude Code's permission prompt, answered by the user at illi's screen. Not a tool to call yourself.", { tool_name: STR, input: { type: "object" }, tool_use_id: STR }, ["tool_name", "input"]);
const UPFRONT = new Set(["zoom", "date", "projects", "search", "spawn", "tell", "todo", "ask"]);

const HOSTED_TOOLS = `illi's own tools (zoom, date, projects, search, todo, spawn, tell, ask, skill
and the user's MCP servers in illi) come from illi, as its MCP server's (mcp__illi__):
keep your to-do list with illi's todo, which the user sees beside the
chat.`;

// the tools of everyone (OWN), the main agent's (boss), and those that run
// on this computer (Machine.ts's TOOLS)
const OWN: Spec[] = [
  spec("zoom", "Open the line id+n of the view into the two lines of n/2 under it; n = 1 gives the message whole. With an agent's name as id, give that agent's whole chat. A long text comes in pages from character at, saying where to go on. With project (its name, from projects), the line, message or agent of that project's chat.", { id: { type: ["integer", "string"] }, n: INT, at: INT, project: STR }, ["id"]),
  spec("date", "The date and time of message id; with project, of that project's chat.", { id: INT, project: STR }, ["id"]),
  spec("projects", "The user's projects, each with a chat of its own (a git repo illi ran in, or home: outside any repo), the one used last first: its folder, its first and last day, its messages, its latest summary line. Look here first when the user means work that isn't in your view.", {}, []),
  spec("search", "Find summary lines holding all the words (else any of them), the best first, as \"project id+n|text\": in this project's chat; with project (its name, from projects), in that one's; with project \"all\", in every one, then the projects with more lines named, to search in. Zoom a line with its project.", { words: STR, project: STR }, ["words"]),
];
const SPAWN = "Start one subagent per task, in parallel, and return their names at once. Each one's report reaches you as a message \"[Name] report\" when it finishes. A subagent sees the view and the user's instructions, but knows what you want only from its task.";
const EFFORT = { type: "string", enum: EFFORTS, description: "How hard they think. Leave it out to use their agent's effort (or, with none, yours); set it only to override that." };
const TELL: Spec = spec("tell", "Send a message to a subagent, by name. One at work reads it between its tool calls, and its report answers it; an idle one goes on from its chat, and its reply reaches you as a message \"[Name] reply\".", { name: STR, message: STR }, ["name", "message"]);

const SKILL = "Load a skill, the user's or illi's own: instructions for a kind of task, and the folder of any files it comes with. When a task matches a skill's description below, load it before starting and follow it. A sticky one is for every reply, not a task: when the user asks for it to last, call skill with on: true; when they ask to stop it, on: false.";
const ON    = { type: "boolean", description: "A sticky skill's only: true turns it on for every reply from now on, false turns it off. Leave it out to load a skill for the task at hand." };

// the sticky skills on, atop their section of a turn's system prompt
const STUCK = "# Sticky skills on\n\nThe user turned these on: follow each in every reply until they turn it off, by its command (/<name>) or by asking you to stop it (then call skill with its name and on: false).";

// the master's to-do list, which the user sees beside the chat: its
// tool, its items' states, its file in the chat's folder
const TODO: Spec = spec("todo", "Keep your to-do list for the work at hand; the user sees it beside the chat. Give the whole list each time: it replaces the one before. Use it for work of three steps or more, or when the user asks for several things: write the steps as you plan them, pending; mark one active as you start it, and only one at a time; mark it done as soon as it is, before starting the next, not in batches at the end; add the steps you find on the way, and drop those no longer needed. Skip it for a question or a quick one-step task. New work replaces a finished list; an empty list clears it.", {
  items: { type: "array", items: { type: "object", properties: { text: { type: "string", description: "The step, in a few words: Run the tests" }, status: { type: "string", enum: ["pending", "active", "done"] } }, required: ["text", "status"] } },
}, ["items"]);
const STATUSES: Todo["status"][] = ["pending", "active", "done"];

// the most questions an ask holds, options a question offers, and
// characters of a question's tab
const QUERIES = 4;
const OPTIONS = 6;
const HEAD    = 12;

// the master's questions for the user, shown in place of their input,
// each on a tab: options to pick (one, or several), words of their own
// beside them; then all the answers to look over, and send
const ASK: Spec = spec("ask", "Ask the user one or more questions and wait for the answers, when you need their decisions or preferences to go on and can offer the likely answers. They see each question with your options in place of their input, pick one (or several, where multi is true), may type words of their own beside or instead of them, then look over all their answers and send them. For an open question, ask in your reply instead.", {
  questions: { type: "array", minItems: 1, maxItems: QUERIES, items: { type: "object", properties: {
    question : { type: "string", description: "The question, in a sentence or two." },
    head     : { type: "string", description: "Its tab's label, " + HEAD + " characters at most: Database, Auth, Scope." },
    options  : { type: "array", minItems: 2, maxItems: OPTIONS, items: { type: "object", properties: { label: { type: "string", description: "The option, in a few words." }, about: { type: "string", description: "What it means or costs, in a short line." } }, required: ["label"] } },
    multi    : { type: "boolean", description: "true: several options may be picked; false or none: one only." },
  }, required: ["question", "options"] } },
}, ["questions"]);

// the most of a skill's files named when it loads
const FILES = 50;

// the most characters of what a tool would do that a note, the side's
// refused list and /permissions show (the question shows it whole)
const WHAT = 400;

// the most refused requests kept (Perm)
const REFUSALS = 50;

// what the model is told of a call refused (Tools.refuse): after the
// user's no (or no one there to ask), why it was asked; the mode's
// refusal; the user's rules'
const REFUSED = {
  no   : "Asked because #. Don't run it again as is: ask the user, or do it another way. They can allow it in /permissions.",
  mode : "Not run: illi is in #. The user can switch with /mode, or allow just this in /permissions.",
  rule : "Not run: the user's permission rules refuse it (#). Don't run it, nor anything that does the same: ask the user if you need it.",
};

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
  const skills = Custom.skills(cwd).filter((s) => s.model !== false);
  const list = skills.map((s) => "- " + s.name + (s.sticky ? " (sticky)" : "") + (s.description === "" ? "" : ": " + s.description)).join("\n");
  return skills.length === 0 ? [] : [spec("skill", SKILL + "\n\n" + list, { name: { type: "string", enum: skills.map((s) => s.name) }, on: ON }, ["name"])];
}

// a skill's files but its SKILL.md, each a path in its folder: none
// under a hidden folder or node_modules, none that won't read
function skill_files(dir: string): string[] {
  let all: string[] = [];
  try {
    all = fs.readdirSync(dir, { recursive: true }) as string[];
  } catch {
    return [];
  }
  const file = (f: string) => {
    try {
      return fs.statSync(path.join(dir, f)).isFile();
    } catch {
      return false;
    }
  };
  return all.filter((f) => f !== "SKILL.md" && !f.split(path.sep).some((x) => x.startsWith(".") || x === "node_modules") && file(f)).sort();
}

// the master's tools: spawn, with the user's subagents to run tasks as,
// if any; tell; todo
function boss(cwd: string): Spec[] {
  const agents = Custom.subagents(cwd).map((a) => a.name + (a.description === "" ? "" : " (" + a.description + ")"));
  const agent = { type: "string", description: "The user's agent to run each task as, by name, with its own instructions, model and tools: " + agents.join("; ") + ". None: a plain subagent." };
  const fields = agents.length === 0 ? { tasks: { type: "array", items: STR }, effort: EFFORT } : { tasks: { type: "array", items: STR }, agent, effort: EFFORT };
  return [spec("spawn", SPAWN, fields, ["tasks"]), TELL, TODO, ASK];
}

// Tools
// =====

export namespace Tools {

  export function serve(mem: Memory, hooks: Hooks, cwd: string): Tools {
    const key = crypto.randomUUID();
    const url = Tools.base() + key + "/";
    const tools: Tools = { mem, agents: new Map(), perm: { mode: null, granted: new Set(), refused: [] }, url, cwd, hooks };
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

  // the working dir and the computer it is on, the project as kept
  export function here(tools: Tools): Block {
    const place = Store.named(tools.mem.store);
    const project = place.path === "" ? "home (outside any git repo)" : place.name;
    return { text: "Working dir: " + tools.cwd + " on " + os.hostname() + " (" + process.platform + "), project " + project + "\n\n", mark: false };
  }

  // what a tool reads of a chat (`read`): this one, or a project's by its
  // name (a model got from projects), its file open meanwhile; none (or
  // forgotten since), why
  export function chat_of(mem: Memory, project: unknown, read: (of: Memory) => Out): Out {
    const name = project === undefined || project === null ? "" : String(project);
    const file = name === "" ? mem.store.file : Store.lookup(mem.store, name);
    if (file === null) {
      return { text: "No project " + name + ": projects lists them.", fail: true };
    }
    if (file === mem.store.file) {
      return read(mem);
    }
    try {
      return Store.visit(mem.store, file, (store) => read(Memory.glance(mem, store)));
    } catch (err) {
      if (fs.existsSync(file)) {
        throw err;
      }
      return { text: "No project " + name + ": projects lists them.", fail: true };
    }
  }

  // a skill loaded: its folder, its instructions, the other files in its
  // folder (at most FILES; none hidden, nor a package's: a skill cloned
  // with its .git, its node_modules), to read as it says; one built in,
  // none
  export function skill(skill: Skill): string {
    if (skill.dir === "") {
      return "Skill " + skill.name + ": its instructions, whole, below (built into illi)\n\n" + skill.body;
    }
    const all   = skill_files(skill.dir);
    const files = all.length === 0 ? "" : "\n\nIts files, in its folder: " + all.slice(0, FILES).join(", ") + (all.length > FILES ? ", and " + (all.length - FILES) + " more." : ".");
    return "Skill " + skill.name + ": its SKILL.md's instructions, whole, below; its folder: " + skill.dir + "\n\n" + skill.body + files;
  }

  // the sticky skills on (Custom.stuck), as a turn's section of its
  // system prompt: each whole, as it loads, so no summary drops it
  export function stuck(cwd: string): string {
    const on = Custom.stuck(cwd);
    return on.length === 0 ? "" : "\n\n" + STUCK + on.map((s) => "\n\n" + Tools.skill(s)).join("");
  }

  // the master's agents at work now, the background jobs running
  // (Machine.background: whose, and for how long) and its to-do list if
  // any, at the start of each of its calls' messages: read from their
  // calls (the list from its file), so none is kept apart nor drifts
  // from the truth, and a restart's call goes on with the list
  export function at_work(tools: Tools): Block {
    const names = Tools.working(tools).map((a) => a.name);
    const list  = Tools.todo(tools);
    const jobs  = Machine.background();
    const todo  = list.length === 0 ? "" : "\nYour to-do list (todo): " + Tools.todo_said(list) + "\n" + list.map((x) => "- " + x.status + ": " + x.text).join("\n") + "\n";
    const bg    = jobs.length === 0 ? "none." : "\n" + jobs.map((j) => "- " + j.command + " (" + j.agent + "'s, running " + Math.max(1, Math.round((Date.now() - j.since) / 60000)) + " min)").join("\n");
    return { text: "Agents at work now: " + (names.length === 0 ? "none." : names.join(", ") + ".") + "\nBackground jobs now (what shell calls left running): " + bg + "\n" + todo + "\n", mark: false };
  }

  // the user's rules: theirs for every project (config.RULES, RULES.md in
  // illi's folder; named even while there is none, so illi knows where it
  // goes), then the project's (Tools.project), each whole up to RULES_MOST
  export function rules(cwd: string, hosted = false): string {
    const own  = rules_read(config.RULES);
    const top  = config.config_top(cwd);
    const each = Tools.project(cwd).filter((file) => !hosted || path.basename(file) !== "CLAUDE.md").flatMap((file) => {
      const text = rules_read(file);
      return text === null ? [] : ["This project's, in " + path.relative(top, file) + ":\n\n" + text];
    });
    return ["# The user's rules", "For every project, in " + config.RULES + ":\n\n" + (own || "(none yet)"), ...each].join("\n\n");
  }

  // a project's rules files: from its top down to cwd (config_down), in
  // each folder the first of PROJECT there
  export function project(cwd: string): string[] {
    return config.config_down(cwd).flatMap((dir) => PROJECT.map((name) => path.join(dir, name)).filter((file) => fs.existsSync(file)).slice(0, 1));
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
        const upfront = (name: string) => (lean && UPFRONT.has(name) ? { _meta: { "anthropic/alwaysLoad": true } } : {});
        return { tools: Tools.list(tools, who, lean).map((t) => ({ name: t.name, description: t.info, inputSchema: t.schema, ...upfront(t.name) })) };
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
  // Code, none it has (shell, files: TOOLS), and its permission prompt
  export function list(tools: Tools, who: string, lean = false): Spec[] {
    const user = [...skill_tools(tools.cwd), ...Mcp.tools(), ...Plugins.tools(), ...(lean ? [APPROVE] : [])];
    const here = lean ? [] : TOOLS;
    if (who === MAIN) {
      return Custom.allow(Custom.agent(tools.cwd, tools.hooks.main()), [...OWN, ...boss(tools.cwd), ...here, ...user]);
    }
    return Custom.allow(Custom.agent(tools.cwd, tools.agents.get(who)?.role.agent ?? null), [...OWN, ...here, ...user]);
  }

  // a call, past the plugins' hooks, then judged (Tools.guard: illi's own
  // tools run, unless a hook asks of them), run, its answer past the
  // plugins' hooks again, then what the first hooks added for the model
  // after it (approve: Claude Code's, which judges its own)
  export async function call(tools: Tools, who: string, name: string, args: any, signal: AbortSignal): Promise<Out> {
    if (name === "approve") {
      return Tools.approve(tools, who, String(args.tool_name ?? ""), args.input ?? {}, signal);
    }
    const call = { tool: name, input: args, agent: who === MAIN ? null : who, cwd: tools.cwd, signal };
    const told = await Plugins.before_tool(call);
    if ("block" in told) {
      return { text: told.block, fail: true };
    }
    const stop = await Tools.guard(tools, who, name, told.input, signal, undefined, told);
    if (stop !== null) {
      return stop;
    }
    const out = await Plugins.after_tool({ ...call, input: told.input }, await Tools.handle(tools, who, name, told.input as any, signal));
    return told.context === undefined ? out : { ...out, text: out.text + "\n\n" + told.context.join("\n\n") };
  }

  // a call run (judged already: Tools.call): illi's own tools here; shell,
  // files and MCP tools on the machine or their server; a plugin's by its
  // plugin
  export async function handle(tools: Tools, who: string, name: string, args: any, signal: AbortSignal): Promise<Out> {
    const mem = tools.mem;
    switch (name) {
      case "zoom": {
        const id = String(args.id);
        const n = Number(args.n ?? 1);
        const at = Number(args.at ?? 0);
        return Tools.chat_of(mem, args.project, (of) => {
          if (/^[A-Za-z]/.test(id)) {
            return { text: clip_page(Logs.show(of, id), at), fail: false };
          }
          const imgs = n === 1 && at === 0 ? Memory.images(of, Number(id)) : [];
          return { text: Memory.zoom(of, Number(id), n, at), fail: false, imgs };
        });
      }
      case "date": {
        return Tools.chat_of(mem, args.project, (of) => ({ text: Memory.date(of, Number(args.id)), fail: false }));
      }
      case "projects": {
        return { text: Projects.table(mem.store), fail: false };
      }
      case "search": {
        return { text: await Projects.seek(mem.store, String(args.words ?? ""), args.project === undefined ? "" : String(args.project)), fail: false };
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
        const found = Custom.skill(tools.cwd, String(args.name));
        const skill = found?.model === false ? null : found;
        const names = Custom.skills(tools.cwd).filter((s) => s.model !== false).map((s) => s.name).join(", ") || "none";
        if (skill === null || typeof args.on !== "boolean") {
          return skill === null ? { text: "No skill " + args.name + "; the skills: " + names + ".", fail: true } : { text: Tools.skill(skill), fail: false };
        }
        const why = !skill.sticky ? skill.name + " isn't sticky: load it without on, for the task at hand." : who !== MAIN ? "Only illi's own turns turn a sticky skill on or off." : Custom.stick(skill, args.on);
        return why !== null ? { text: why, fail: true } : { text: args.on ? skill.name + " is on: follow it in every reply from now on (from the next turn it is in your system prompt).\n\n" + Tools.skill(skill) : skill.name + " is off: its rules no longer apply.", fail: false };
      }
      case "ask": {
        const queries = Tools.queries(args.questions);
        if (typeof queries === "string") {
          return { text: queries, fail: true };
        }
        return { text: (await tools.hooks.ask({ who: "illi", tool: "ask", what: queries[0].text, queries }, signal)).said, fail: false };
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
        if (name.startsWith("plugin__")) {
          return Plugins.run({ tool: name, input: args, agent: who === MAIN ? null : who, cwd: tools.cwd, signal });
        }
        return name.startsWith("mcp__") ? Mcp.call(name, args, signal) : Machine.run({ name, input: args, cwd: tools.cwd, agent: who === MAIN ? "illi" : who }, signal);
      }
    }
  }

  // Agents
  // ------

  export async function spawn(tools: Tools, tasks: string[], role: Agent["role"]): Promise<string> {
    const view = tasks.length === 0 ? "No tasks." : await Tools.view(tools, role);
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
    const view = await Tools.view(tools, agent.role);
    if (typeof view === "string") {
      return view;
    }
    tools.hooks.push(agent, "user", message);
    Tools.run(tools, Object.assign(agent, { view, replies: [], stop: false }));
    return "Sent. " + name + "'s reply will reach you as a message.";
  }

  export function start(tools: Tools, role: Agent["role"], task: string, view: Block[]): string {
    const run = Memory.run(tools.mem);
    const name = Logs.start(tools.mem, role.agent, (name) => {
      const was = tools.agents.get(name);
      return was !== undefined && (was.call !== null || was.run === run);
    });
    const agent = { name, run, log: Logs.log(tools.mem, name) ?? name, role, call: null, live: [], calls: {}, stop: false, view, replies: [] };
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
    const log = tools.agents.has(name) ? null : Logs.read(tools.mem, name);
    const note = log !== null && log.length > 0 && log[0].kind === "note" ? log[0].text : "";
    const sub = SUB_RE.exec(note);
    if (sub !== null) {
      const role = { $: "sub" as const, effort: sub[2] ?? null, agent: sub[1] ?? null };
      tools.agents.set(name, { name, run: -1, log: Logs.log(tools.mem, name) ?? name, role, call: null, live: [], calls: {}, stop: false, view: [], replies: [] });
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

  // what an agent of this role runs on: its user's agent's model, else
  // the agents pick of the chat's vendor, else the chat's pick (an
  // agent's model not offered gives way to them)
  export function pick(tools: Tools, role: Agent["role"]): Pick {
    const profile = Custom.agent(tools.cwd, role.agent);
    const base = config.config_role("agents", tools.hooks.pick());
    const own = profile === null ? base : Custom.pick(profile, base, config.OFFER);
    return typeof own === "string" ? base : own;
  }

  // a call of an agent, on its pick (Tools.pick): the chat's view as much
  // as half its model's autocompact holds (a smaller model's window than
  // the chat's; its window not told, which Tools.view waits on: its
  // opening and last block alone, as a window is never guessed)
  export function ask(tools: Tools, agent: Agent): Ask {
    const log = { text: Logs.show(tools.mem, agent.name), mark: true };
    const server = Tools.at(tools, agent.name);
    const profile = Custom.agent(tools.cwd, agent.role.agent);
    const pick = Tools.pick(tools, agent.role);
    const run = Pick.ask(pick);
    const system = Tools.system(SUB + Custom.section(profile), tools.cwd, run.vendor);
    const window = Pick.window(pick);
    const most = window === undefined ? 0 : (config.config_context(pick.model, window, 0, Pick.room(pick)) * TOKEN) / 2;
    const blocks = [...Tools.fitted(agent.view, most), Tools.here(tools), log];
    const effort = agent.role.effort ?? run.effort;
    return { ...run, effort, system, blocks, searches: SEARCHES, server };
  }

  // a view (Memory.view's blocks) in `bytes`: its oldest blocks of lines
  // left out, said so (each line still a zoom away), its opening and its
  // last block kept
  export function fitted(view: Block[], bytes: number): Block[] {
    let size = view.reduce((n, b) => n + b.text.length, 0);
    let k    = 1;
    for (; k < view.length - 1 && size > bytes; k++) {
      size -= view[k].text.length;
    }
    return k === 1 ? view : [view[0], { text: LEFT_OUT, mark: false }, ...view.slice(k)];
  }

  // Claude Code asking leave to use a tool (its permission prompt): past
  // the plugins' hooks first (they may refuse it or change its input; what
  // it answers stays Claude Code's), then judged as illi's own would be
  // (Guard.hosted), so the same rules, grants and mode hold there. Its
  // answer as Claude Code reads it: the input to run, or a no with what
  // the model is told
  export async function approve(tools: Tools, who: string, tool: string, input: unknown, signal: AbortSignal): Promise<Out> {
    const told = await Plugins.before_tool({ tool, input, agent: who === MAIN ? null : who, cwd: tools.cwd, signal });
    const used = "block" in told ? undefined : told.input;
    const stop = "block" in told ? { text: told.block, fail: true } : await Tools.guard(tools, who, tool, used, signal, (where) => Guard.hosted(where, tool, used), told);
    const answer = stop === null ? { behavior: "allow", updatedInput: used } : { behavior: "deny", message: stop.text };
    return { text: JSON.stringify(answer), fail: false };
  }

  // Permissions
  // -----------

  // a call judged before it runs (Guard.check: shell, read, write, edit,
  // an MCP tool by what its server says of it; any other runs), by the
  // user's rules and the grants kept for the project (Permissions.ts),
  // those given this run, and the mode: null runs it, else what the model
  // is told. One a hook allowed is judged as in yolo mode (the user's
  // rules still hold); one it asks about is asked, its why first, with no
  // "don't ask again". One asked runs on the user's yes, "don't ask again"
  // keeping its grants for the project (one that can't be saved: for this
  // run). A rules file that won't read leaves nothing run unasked
  export async function guard(tools: Tools, who: string, tool: string, input: unknown, signal: AbortSignal, judge = (where: Where) => Guard.check(where, tool, input, Mcp.hints(tool)), hooked: { allow?: boolean; ask?: string } = {}): Promise<Out | null> {
    const folder = Trusted.folder(tools.cwd);
    const perms  = Permissions.read(config.PERMISSIONS, folder);
    const ok     = typeof perms !== "string";
    const grants = new Set([...(ok ? perms.granted : []), ...tools.perm.granted]);
    const got    = judge({ mode: hooked.allow === true ? "yolo" : Tools.mode(tools), cwd: Projects.real(tools.cwd), top: folder, rules: ok ? perms.rules : {}, grants, reads: Custom.dirs(tools.cwd, "skills").map(Projects.real), plugins: Plugins.roots() });
    const broken = "illi can't read your permission rules (" + perms + ")";
    const judged: Verdict = ok || got.$ === "deny" ? got : { $: "ask", why: got.$ === "ask" ? got.why + "; " + broken : broken, always: [], exact: got.$ === "ask" ? got.exact : [] };
    const verdict: Verdict = hooked.ask === undefined || judged.$ === "deny" ? judged : { $: "ask", why: judged.$ === "ask" ? hooked.ask + "; " + judged.why : hooked.ask, always: [], exact: judged.$ === "ask" ? judged.exact : [] };
    if (verdict.$ === "allow") {
      return null;
    }
    const asked = { who: who === MAIN ? "illi" : who, tool, what: Tools.what(input), why: verdict.why };
    if (verdict.$ === "deny") {
      return Tools.refuse(tools, { ...asked, how: verdict.rule ? "rule" : "mode", said: "", exact: verdict.exact });
    }
    const reply = await tools.hooks.ask({ ...asked, whole: Tools.whole(input), keep: verdict.always.map((g) => Guard.said(g, folder)).join(", ") }, signal);
    if (!reply.yes) {
      return Tools.refuse(tools, { ...asked, how: "no", said: reply.said, exact: verdict.exact }, !signal.aborted);
    }
    const unsaved = reply.always && verdict.always.length > 0 ? Permissions.grant(config.PERMISSIONS, folder, verdict.always) : null;
    if (unsaved !== null) {
      verdict.always.forEach((g) => tools.perm.granted.add(g));
      console.error("illi: a grant kept for this run only: " + unsaved);
    }
    return null;
  }

  // the mode now: /mode's for this run, else the setting's
  export function mode(tools: Tools): Mode {
    return tools.perm.mode ?? Tools.mode_set();
  }

  // the `mode` setting's (one not known: ask)
  export function mode_set(): Mode {
    const mode = config.config_value("mode");
    return MODES.includes(mode as Mode) ? (mode as Mode) : "ask";
  }

  // the permissions as the views show them: the grants kept for the
  // project (none while the file won't read), then this run's
  export function perms(tools: Tools): Perms {
    const folder = Trusted.folder(tools.cwd);
    const read   = Permissions.read(config.PERMISSIONS, folder);
    const saved  = typeof read === "string" ? [] : read.granted;
    const grants = [...saved.map((grant) => ({ grant, saved: true })), ...[...tools.perm.granted].filter((g) => !saved.includes(g)).map((grant) => ({ grant, saved: false }))];
    return { mode: Tools.mode(tools), set: Tools.mode_set(), refused: tools.perm.refused, grants: grants.map((g) => ({ ...g, said: Guard.said(g.grant, folder) })), file: config.PERMISSIONS, broken: typeof read === "string" ? read : "" };
  }

  // a refused request allowed for this run (/permissions): its exact
  // grants given, and every refusal they now clear taken off the list;
  // null: none such, or one only the user's rules can allow
  export function allow(tools: Tools, id: string): Refused | null {
    const refused = tools.perm.refused.find((r) => r.id === id);
    if (refused === undefined || refused.exact.length === 0) {
      return null;
    }
    refused.exact.forEach((g) => tools.perm.granted.add(g));
    tools.perm.refused = tools.perm.refused.filter((r) => r.exact.length === 0 || !r.exact.every((g) => tools.perm.granted.has(g)));
    tools.hooks.change();
    return refused;
  }

  // a grant let go (/permissions): this run's, and the project's kept
  // one; null: done, else why the file wasn't changed
  export function revoke(tools: Tools, grant: string): string | null {
    tools.perm.granted.delete(grant);
    const why = Permissions.revoke(config.PERMISSIONS, Trusted.folder(tools.cwd), grant);
    tools.hooks.change();
    return why;
  }

  // a refusal, recorded for the side panel and /permissions (kept: a
  // stopped request's isn't), and what the model is told
  export function refuse(tools: Tools, refused: Omit<Refused, "id" | "at">, kept = true): Out {
    if (kept) {
      tools.perm.refused.push({ ...refused, id: crypto.randomUUID(), at: Date.now() });
      tools.perm.refused.splice(0, Math.max(0, tools.perm.refused.length - REFUSALS));
      tools.hooks.change();
    }
    const said = refused.said === "" || /[.!?]$/.test(refused.said) ? refused.said : refused.said + ".";
    const told = REFUSED[refused.how].replace("#", () => refused.why);
    return { text: refused.how === "no" ? said + " " + told : told, fail: true };
  }

  // the ask tool's questions, each its text, its tab's label (none: its
  // first words), its options (each a label and what it means), whether
  // several may be picked; a string: why they make none
  export function queries(raw: unknown): Query[] | string {
    const list = Array.isArray(raw) ? raw : [];
    const each = list.map((q): Query => ({
      text    : String(q?.question ?? "").trim(),
      head    : (String(q?.head ?? "").trim() || String(q?.question ?? "").trim()).slice(0, HEAD).trim(),
      options : Array.isArray(q?.options) ? q.options.map((o: any) => ({ label: String(o?.label ?? "").trim(), about: String(o?.about ?? "").trim() })) : [],
      multi   : q?.multi === true,
    }));
    const bad = list.length < 1 || list.length > QUERIES || each.some((q) => q.text === "" || q.options.length < 2 || q.options.length > OPTIONS || q.options.some((o) => o.label === ""));
    return bad ? "Ask 1 to " + QUERIES + " questions, each with its text and 2 to " + OPTIONS + " options, each with a label." : each;
  }

  // what a tool would do, whole, as the question shows it (its lead
  // scrolls): a command, a file (an edit's files), a URL or a query, else
  // its input
  export function whole(input: any): string {
    const edits = Array.isArray(input?.edits) && input?.file_path === undefined ? [...new Set(input.edits.map((e: any) => String(e?.path ?? "")))].join(", ") : undefined;
    const one = input?.command ?? input?.file_path ?? input?.notebook_path ?? input?.path ?? edits ?? input?.url ?? input?.query ?? input?.pattern;
    return typeof one === "string" ? one : JSON.stringify(input ?? {});
  }

  // what a tool would do (Tools.whole), WHAT characters at most, where
  // the room is small and nothing scrolls: a note, the side's refused
  // list, /permissions
  export function what(input: any): string {
    const text = Tools.whole(input);
    return text.length > WHAT ? text.slice(0, WHAT - 1) + "…" : text;
  }

  // the chat's view, once its summaries are built, for an agent of this
  // role once its model's window is told too (on ChatGPT: ChatGPT.ready,
  // as a turn waits; never guessed); a string: why there is none
  // (Memory.settle, the window)
  export async function view(tools: Tools, role?: Agent["role"]): Promise<Block[] | string> {
    const why = await Memory.settle(tools.mem, tools.mem.count, tools.hooks.halt());
    const pick = role === undefined ? null : Tools.pick(tools, role);
    const unready = why === null && pick?.vendor === "chatgpt" ? await ChatGPT.ready(pick.model, tools.hooks.halt()) : null;
    return why ?? (unready === null ? Memory.view(tools.mem) : "Not started: " + unready + ".");
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

  // what the views show of the tools (Chat.state): the plan of the vendor
  // the master is on, its to-do list
  export function state(tools: Tools, vendor: Vendor): { use: State["use"]; todo: Todo[]; perm: Perms; background: Background[] } {
    return { use: { plan: PLANS[vendor]?.() ?? null }, todo: Tools.todo(tools), perm: Tools.perms(tools), background: Machine.background() };
  }

  // the master's to-do list: as last set, else as the chat's file keeps
  // it (one that won't read: none)
  export function todo(tools: Tools): Todo[] {
    if (tools.todo === undefined) {
      const list = Tools.todo_check(Store.todo(tools.mem.store) ?? []);
      tools.todo = typeof list === "string" ? [] : list;
    }
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

  // a list with every item done let go (Chat.turn as a turn starts and
  // ends, Chat.open): finished work leaves the side, rather than waiting
  // for the model to write the next list, which it may never do
  export function todo_finished(tools: Tools): void {
    const list = Tools.todo(tools);
    if (list.length > 0 && list.every((x) => x.status === "done")) {
      Tools.todo_set(tools, []);
    }
  }

  // the list set: kept in the chat's file, and shown at once
  export function todo_set(tools: Tools, list: Todo[]): void {
    tools.todo = list;
    Store.todo_save(tools.mem.store, list);
    tools.hooks.change();
  }

  // a list, as its tool answers: how far along, what is active
  export function todo_said(list: Todo[]): string {
    const done   = list.filter((x) => x.status === "done").length;
    const active = list.find((x) => x.status === "active");
    return list.length === 0 ? "The to-do list is cleared." : done + " of " + list.length + " done" + (active === undefined ? "." : "; active: " + active.text + ".");
  }

}
