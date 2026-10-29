// Tools
// =====
// illi's prompts, tools and agents. Calls get the tools as MCP over one
// local port, at a URL with the chat's secret and the caller ("main", an
// agent; a compaction has none).
// shell, read, write and edit run here, on the user's computer, in the
// working dir: where illi was started (each call's message names it, its
// project and the time now). A request dropped (its call stopped) stops
// its job. zoom and date read the chat, or another project's
// (Tools.chat_of): date a message's date, or a span of time's lines
// (Memory.days); projects and search look across them all (Projects.ts),
// search in a span too.
// An agent (a subagent) has a name and a log (one spawned as a user's
// subagent: that agent's name, numbered while another so named is at
// work or of this run, as reviewer-2; else a random one; a name freed
// is used again, each log its own); each call gets its context and its
// log (whole till a call outgrows its model's window: then its own
// recap stands for its work before it, its first note and illi's
// messages to it kept whole: Logs.view, Tools.refit), so a told agent
// goes on even after a restart; its replies reach the chat as one
// "[Name]" message. It starts with a map of the chat (Memory.map: a few
// dozen lines over it from the view's first message, a /clear's or a
// recap's, the newest messages each its own), and zooms or searches for
// what its task needs. One
// started fresh (its agent's `fresh: true`, or spawn's) gets none of the
// chat: no map, no tool reading it (MEMORY), no radar's line; its own
// log alone. One spawned as a user's subagent (Custom.ts) runs on its
// model, with its instructions and tools; so does the master, given a
// primary agent (Shift+Tab, /agent).
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
// have it asked or add to what the model reads after it), then, as
// Claude Code asks leave for one of its own too (approve), it is judged
// on that input (Tools.guard: what it asks leave for, Access.ts, by
// illi's rules, the user's and the approvals saved, Permissions.ts, in
// the mode, /mode's or the setting's, default unless trust; one a hook
// allowed as trust mode would, one it asks about asked whatever): run,
// asked about with why, or refused, each refusal recorded for the side
// panel and /permissions. What a call that ran answers goes to the
// plugins last (after_tool), then, if it is strong and in time, the
// radar's line of a past episode related to it goes after it (Recall.ts:
// searched beside the call's run, one a step, never after illi's own
// memory and meta tools).
// The plugins' own tools are theirs to run (plugin__...).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AskAI, type Ask, type Block, type Call, type End, type Event, type Kind, type Vendor } from "../ai/AskAI.ts";
import type { Out } from "../ai/Agent.ts";
import { report_text } from "../ui/Call.ts";
import { ChatGPT } from "../ai/ChatGPT.ts";
import { ClaudeCode } from "../ai/ClaudeCode.ts";
import { clip_page } from "./Clip.ts";
import * as config from "../config/Config.ts";
import { Custom, type Skill } from "../config/Custom.ts";
import { Plugins } from "../config/Plugins.ts";
import { Trusted } from "../config/Trusted.ts";
import { Access, type Request as Want, type Where } from "./Access.ts";
import type { Span } from "./Shell.ts";
import { Permissions, type Effect, type Mode, type Rule } from "./Permissions.ts";
import { INT, STR, TOOLS, Machine, spec, type Spec } from "./Machine.ts";
import { Mcp } from "./Mcp.ts";
import { Logs, MAIN } from "../chat/Logs.ts";
import { Memory, TOKEN } from "../chat/Memory.ts";
import PROMPT from "./prompt.txt" with { type: "text" };
import { EFFORTS, Pick } from "../ai/Pick.ts";
import { Projects } from "../chat/Projects.ts";
import { Recall } from "../chat/Recall.ts";
import { Store } from "../chat/Store.ts";
import { When } from "../chat/When.ts";
import type { Background, Live, Perms, Plan, Query, Question, Refused, State, Todo } from "../ui/View.ts";

export type { Live };

// Types
// =====

// at work, the map of the chat its calls get (Tools.view) and its
// replies so far; its role: its
// effort if spawned with one, the user's agent it runs as (null: none),
// whether it started fresh (none of the chat: Tools.ask);
// the run it was spawned in (Memory.run; -1: taken back from its log),
// its log (Logs.log: the name may go on to another agent)
export type Agent = {
  name    : string;
  run     : number;
  log?    : string;
  role    : { $: "sub"; effort: string | null; agent: string | null; fresh?: boolean };
  call    : Call | null;
  live    : Live[];
  calls   : Record<string, string>; // its tool calls awaiting their results, by id (Chat.on)
  stop    : boolean; // its call was stopped: the report stays unanswered
  view    : Block[];
  replies : string[];
};

// what the chat does for agents (report: work stopped, or cut by the
// vendor busy or out of reach, stays unanswered: a turn would fail alike;
// pick: the chat's pick; halt: what stops its turn; stop: a caller's work
// stopped, the master's turn or an agent's, after the user's plain no to
// its question: Tools.question; main: the master's agent, null: none)
// a question's answer (Hooks ask): yes (illi's own: answered), and
// whether not to ask again (its approvals saved: Tools.question); what
// the user said, for the model: a no's reason, the answer to illi's own;
// whether it was the user's plain no (no words: the caller's turn stops)
export type Reply = { yes: boolean; always: boolean; said: string; stop?: boolean };

type Hooks = {
  ask    : (q: Omit<Question, "id">, signal: AbortSignal) => Promise<Reply>;
  push   : (agent: Agent, kind: Kind, text: string) => void;
  on     : (agent: Agent, ev: Event) => void;
  report : (agent: Agent, text: string, stopped: boolean) => void;
  change : () => void;
  pick   : () => Pick;
  halt   : () => AbortSignal;
  stop   : (who: string) => void;
  main   : () => string | null;
};

// the tools: their URL (a secret in it), the working dir, the main agent's to-do
// list (none: not read yet), the permissions of this run (Perm), the
// radar's lines the user dismissed at the side, as [first, end) (any
// view's, Chat.act: never given to a model, till illi quits); each
// caller's steps, counted (Chat.on), and the last it was given a line
// in (Recall.ts: one a step)
export type Tools = {
  mem    : Memory;
  agents : Map<string, Agent>;
  perm   : Perm;
  url    : string;
  cwd    : string;
  hooks  : Hooks;
  todo?  : Todo[];
  gone   : Array<[number, number]>;
  steps  : Map<string, number>;
  given  : Map<string, number>;
};

// the permissions of this run (Tools.guard): the mode /mode set (null:
// the `mode` setting's), the approvals given for this run only (by
// /permissions, or kept as the file wouldn't take them), the requests
// refused (the latest REFUSALS, oldest first), the questions waiting
// for an answer, by id (Pending)
export type Perm = { mode: Mode | null; allowed: Rule[]; refused: Refused[]; pending: Map<string, Pending> };

// a request to ask (Tools.guard): the request, which of its resources
// asked (by index), why, the mode it was judged in, whether "don't ask
// again" is offered (not for a hook's ask, nor while the rules won't
// read); all: it stands for the whole call (a hook's ask), so the
// question shows all of it
export type Asking = { req: Want; by: number[]; why: string; mode: Mode; keep: boolean; all?: boolean };

// a question waiting: who asked, what, how to drop it, and the answer
// another answer settled it with (Tools.settle)
export type Pending = { who: string; ask: Asking; ctl: AbortController; outcome?: Reply };

// Constants
// =========

// the most web searches a request of a turn or a subagent runs
export const SEARCHES = 10;

// the chats' tools, by their secret; the server, once one is
const CHATS = new Map<string, Tools>();

// the vendors that tell a plan (View.Plan: its limits shown at the side),
// each by how: one added here shows as the others do
const PLANS: Partial<Record<Vendor, () => Plan | null>> = { chatgpt: ChatGPT.told, "claude-code": ClaudeCode.told };
let HTTP: ReturnType<typeof Bun.serve> | null = null;

// the master's prompt (a turn's and a compaction's): prompt.txt
export const MASTER = PROMPT.trim();

const SUB_HEAD = `You are a subagent of illi, an AI agent that works for one user in a
single chat that never ends. illi gave you a task. Do it yourself, with
your tools, following the user's instructions at the end of this
prompt: they say who the user is, how their files are organized and how
they want work done.`;

// what a subagent's first message holds: the map, then its own chat;
// one started fresh, its own chat alone
const SUB_VIEW = `Your first message holds the map below, then your chat with illi so far,
its lines as "i|kind: text": what you are (note), your task (user), and
later all you did and were told; once your context fills, your recap
(recap) stands for what came before it. The map shows, coarsely, all
that illi knows: what the user wants, decided and taught, each a zoom
away. Use it as context only, and do what your task says, not what the
user's last message says, since illi may have given you just part of the
work. Your final reply is your report to illi. illi may send you more
messages, even while you work: answer the last.`;

const SUB_ALONE = `You start fresh: you see none of illi's chat with the user, only what
illi tells you. Your first message holds your chat with illi so far, its
lines as "i|kind: text": what you are (note), your task (user), and
later all you did and were told; once your context fills, your recap
(recap) stands for what came before it. Your final reply is your report
to illi. illi may send you more messages, even while you work: answer
the last.`;

const VIEW_DOC = `The map: the chat between illi and the user (since its last new session,
if any: search finds what came before), oldest first, inside <chat> tags,
as a few dozen one-line summaries. Each line is

  id+n|text   the n messages from id on, summarized (newlines shown as spaces)

A summary tags each item with its kind: user (the user's words), illi
(illi's replies), tool (illi's tool calls), echo (their results), note
(illi's own notices: a stop, a goal met, a new session, a restart),
recap (illi's recap of the chat before it, at the user's /compact), or
work (the report of an agent, starting "[Name]"). A short message is its own line, word for word. The newest
lines cover one message each; the others many, so a line only hints at
what happened. A line not summarized yet shows as "(not summarized yet:
zoom it)". No message appears in full, not even the last ones. A
text too long for one message is split over several in a row.

Navigating: zoom(id, n) opens line id+n into the two lines of n/2
messages it was made from; zoom(id, 1) gives message id in full, with
the images its "[image <file>]" lines name. When your task leans on
what came before, look before you act, guess or ask: zoom the lines it
touches, down to the messages, for a decision, what the user prefers, a
past attempt or where a file is; search when the map names no line for
it. date(id) gives the date and time of message id; date(from, to) the
lines of a span, as 2026-10-21 or 2026-10-21 14:00, a month (2026-10),
a year (2026), today or yesterday (no to: till the end of from's day,
month or year).
zoom("Name") gives an agent's whole chat. A tool result may end with a
<history> line: the summary of a past episode that illi's search found
related, its id first (#id+n: zoom(id, n) opens it). It tells what was
then, not what is now: zoom it if it helps, else ignore it.

Each project has its own chat: the git repo illi runs in, or home outside
any repo; this one is named at the start of each message. projects()
lists them all; search(words) finds summary lines holding the words,
with project in that project's chat, or in all ("all"), with from and
to only in that span; zoom and date take a project too.`;

// an agent's log starts with a note of what it is: SUB_NOTE, the user's
// agent it runs as (a plugin's as plugin:name), its effort if not the
// configured one, and SUB_WITHOUT if it started fresh
const SUB_NOTE    = "subagent";
const SUB_AT      = " at effort ";
const SUB_WITHOUT = ", without the chat";
const SUB_RE      = /^subagent(?: ([a-z0-9][a-z0-9_-]*(?::[a-z0-9][a-z0-9_-]*)?))?(?: at effort ([^\s,]+))?(, without the chat)?$/i;

// an agent outgrowing its model's window (Tools.refit): its recap's task
// (Chat's RECAP, an agent's), after its log as its calls get it, cut to
// fit (Logs.fit: at most MOST of the window, TOKEN bytes a token); what
// the views are told as it is written (a thought); the note it goes on
// from (#: how it reads what the recap left out, RECAP_ZOOM, $ its log;
// none for one started fresh); the most recaps in
// a row with no work between (a call answered or grown starts the count
// anew), the most tries of one, its log's cut halved each time, and why
// it ends past either (#: the model)
const RECAP_SUB  = `Recap: your context is full. Write your recap of your work so far: from
now on, your log starts at it, and what came before it leaves your view,
but for what you are and illi's messages to you, kept whole. Write it for
yourself, to go on working from it alone, as well as if you remembered
everything.

Output exactly this Markdown, every section in this order, "(none)" for an
empty one:

## Task
- what illi asked of you, and what your report must give it, in a
  sentence or two; what it asked since

## Important details
- decisions and why, facts learned, the exact context needed to go on

## Work state
### Done
- finished and verified work, changes made
### Active
- work under way, partial changes, the state of an investigation
### Blocked
- blockers, failing commands, unknowns

## Next move
1. the immediate concrete action
2. the next one, if known

## Relevant files
- path: why it matters

Rules:
- Terse bullets, not paragraphs.
- Copy names, paths, symbols, commands, errors, URLs, ids, numbers and
  versions exactly.
- Keep what was tried and ruled out, and the evidence.
- An earlier recap in your log: carry forward what still matters from it;
  where later lines differ, they win.
- Never make anything look further along than it was.
- Don't mention the recap.
- Call no tools; output only the recap.`;
const RECAPPED   = "Your context filled up: your log before the recap above is summarized in it, but for what you are and illi's messages to you, kept whole#. Go on where you were: your final reply is still your report to illi.";
const RECAP_ZOOM = ' (zoom("$") reads all of it)';
const RECAPPING  = "Its context is full: writing a recap of its work to go on from.";
const REFITS     = 3;
const NO_FIT     = "its work won't fit #'s window even recapped";

// where the tools run, in the system prompt (HERE_DOC); the working dir
// and the time now, at the start of each call's message (Tools.here), so
// a start elsewhere, or a later minute, changes a call's tail, never its
// cached prefix
const HERE_DOC = `Your shell, read, write and edit tools run on the user's computer, in
the working dir named at the start of each message: the folder where the
user started illi. Relative paths start there. The user's time follows
it (Now:): work out "yesterday" or "last Tuesday" from it.`;

// a subagent's prompt: its part, then the map's and the tools' docs;
// one started fresh, no map's
export const SUB       = SUB_HEAD + "\n\n" + SUB_VIEW + "\n\n" + VIEW_DOC + "\n\n" + HERE_DOC;
export const SUB_FRESH = SUB_HEAD + "\n\n" + SUB_ALONE + "\n\n" + HERE_DOC;

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
// illi's tools named to a subagent (no todo, spawn, tell or ask: the
// master's); to one started fresh, none that reads the chat (MEMORY)
const HOSTED_SUB   = `illi's own tools (zoom, date, projects, search, skill and the user's MCP
servers in illi) come from illi, as its MCP server's (mcp__illi__).`;
const HOSTED_ALONE = `illi's own tools (skill and the user's MCP servers in illi) come from
illi, as its MCP server's (mcp__illi__).`;

// the tools of everyone (OWN), the main agent's (boss), and those that run
// on this computer (Machine.ts's TOOLS); those of OWN that read the chat
// (MEMORY: none for an agent started fresh)
const MEMORY = new Set(["zoom", "date", "projects", "search"]);
const OWN: Spec[] = [
  spec("zoom", "Open the line id+n of the view into the two lines of n/2 under it; n = 1 gives the message whole. With an agent's name as id, give that agent's whole chat. A long text comes in pages from character at, saying where to go on. With project (its name, from projects), the line, message or agent of that project's chat.", { id: { type: ["integer", "string"] }, n: INT, at: INT, project: STR }, ["id"]),
  spec("date", "The date and time of message id. Or, with from (and to), local times as 2026-10-21 or 2026-10-21 14:00, a month (2026-10), a year, today or yesterday (no to: till the end of from's day, month or year), the lines of that span. With project, in that project's chat.", { id: INT, from: STR, to: STR, project: STR }, []),
  spec("projects", "The user's projects, each with a chat of its own (a git repo illi ran in, or home: outside any repo), the one used last first: its folder, its first and last day, its messages, its latest summary line. Look here first when the user means work that isn't in your view.", {}, []),
  spec("search", "Find summary lines holding all the words (else any of them), the best first, as \"project id+n|text\": in this project's chat; with project (its name, from projects), in that one's; with project \"all\", in every one, then the projects with more lines named, to search in. Zoom a line with its project. With from, to or both (as date's; to alone: all up to it), only lines inside that span; a span that won't read is left out, saying so.", { words: STR, project: STR, from: STR, to: STR }, ["words"]),
];
const SPAWN = "Start one subagent per task, in parallel, and return their names at once. Each one's report reaches you as a message \"[Name] report\" when it finishes. A subagent gets a map of the chat (a few dozen lines; it zooms and searches for more) and the user's instructions, but knows what you want only from its task: put in it what matters. With fresh, it gets no map nor any of the chat, only its task and the user's instructions: for a test or review that must not be swayed by what came before.";
const FRESH = { type: "boolean", description: "Start them without the chat: no map, and no tools that read it. Leave it out to give them the map (an agent listed as fresh starts so always)." };
const EFFORT = { type: "string", enum: EFFORTS, description: "How hard they think. Leave it out to use their agent's effort (or, with none, yours); set it only to override that." };
const TELL: Spec = spec("tell", "Send a message to a subagent, by name. One at work reads it between its tool calls, and its report answers it; an idle one goes on from its chat, and its reply reaches you as a message \"[Name] reply\".", { name: STR, message: STR }, ["name", "message"]);

const SKILL  = "Load a skill, the user's or illi's own: instructions for a kind of task, and the folder of any files it comes with. When a task matches a skill's description below, load it before starting and follow it. Loading is all a skill for a task needs: it is never unloaded after.";
const STICKY = " A sticky one (marked so below) is for every reply, not a task: when the user asks for it to last, call skill with on: true; when they ask to stop it, on: false.";
const ON     = { type: "boolean", description: "A sticky skill's only: true turns it on for every reply from now on, false turns it off. Leave it out for any other skill." };

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
// refused list and /permissions show; that the question shows of it, and
// of why it asks, its lead scrolling (a heredoc may carry a whole file,
// and a why may quote it: the question goes to every view at each change
// of the chat's state, and is laid out on their paints); of what a "don't
// ask again" keeps that it names (its answer shows three lines of it at
// most: its start and its end)
const WHAT  = 400;
const WHOLE = 32000;
const KEPT  = 1000;

// past WHOLE, the most characters the question shows of a line holding a
// spot (what made the checks ask: Tools.whole), from REACH before the
// spot on (a minified script is one long line)
const PIECE = 2000;
const REACH = 200;

// the most refused requests kept (Perm)
const REFUSALS = 50;

// what the model is told of a call refused (Tools.refuse): after the
// user's no with words (or no one there to ask), why it was asked; after
// their plain no, which stopped the turn; the user's rules' refusal
const REFUSED = {
  no   : "Asked because #. Don't run it again as is: ask the user, or do it another way. They can allow it in /permissions.",
  stop : "The user said no (asked because #) and stopped the turn: wait for them to say how to go on.",
  rule : "Not run: #. Don't run it, nor anything that does the same: ask the user if you need it.",
};

// illi's tools that touch nothing but the chat: run while the rules
// won't read (Tools.guard), as all else is asked
const CHAT = new Set(["zoom", "date", "projects", "search", "todo", "tell", "question", "skill", "subagent"]);

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

// the skill tool, listing the user's skills (none: no tool); `on` and
// what it does only while one of them is sticky, so a skill for a task
// is never offered a switch
function skill_tools(cwd: string): Spec[] {
  const skills = Custom.skills(cwd).filter((s) => s.model !== false);
  const sticky = skills.some((s) => s.sticky);
  const list = skills.map((s) => "- " + s.name + (s.sticky ? " (sticky)" : "") + (s.description === "" ? "" : ": " + s.description)).join("\n");
  return skills.length === 0 ? [] : [spec("skill", SKILL + (sticky ? STICKY : "") + "\n\n" + list, { name: { type: "string", enum: skills.map((s) => s.name) }, ...(sticky ? { on: ON } : {}) }, ["name"])];
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
// if any, each one started fresh said so (only: those its agent may
// spawn, one of which it must name; null: any, or none for a plain
// subagent; none of them there: no spawn, as it could start nothing);
// tell; todo
function boss(cwd: string, only: string[] | null = null): Spec[] {
  const subs = Custom.subagents(cwd).filter((a) => only === null || Custom.called(a).some((n) => only.includes(n)));
  const agents = subs.map((a) => a.name + (a.description === "" ? "" : " (" + a.description + ")") + (a.fresh ? ", fresh" : ""));
  const agent = { type: "string", description: "The user's agent to run each task as, by name, with its own instructions, model and tools: " + agents.join("; ") + (only === null ? ". None: a plain subagent." : ". Name one of them: no other is allowed.") };
  const fields = agents.length === 0 ? { tasks: { type: "array", items: STR }, effort: EFFORT, fresh: FRESH } : { tasks: { type: "array", items: STR }, agent, effort: EFFORT, fresh: FRESH };
  const spawn = only !== null && agents.length === 0 ? [] : [spec("spawn", SPAWN, fields, only === null ? ["tasks"] : ["tasks", "agent"])];
  return [...spawn, TELL, TODO, ASK];
}

// Tools
// =====

export namespace Tools {

  export function serve(mem: Memory, hooks: Hooks, cwd: string): Tools {
    const key = crypto.randomUUID();
    const url = Tools.base() + key + "/";
    const tools: Tools = { mem, agents: new Map(), perm: { mode: null, allowed: [], refused: [], pending: new Map() }, url, cwd, hooks, gone: [], steps: new Map(), given: new Map() };
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
  // tools left to Claude Code (HOSTED), illi's tools named (a
  // subagent's, its own: HOSTED_SUB; one started fresh, none that reads
  // the chat: HOSTED_ALONE)
  export function hosted(head: string): string {
    const own = head.startsWith(SUB_FRESH) ? HOSTED_ALONE : head.startsWith(SUB) ? HOSTED_SUB : HOSTED_TOOLS;
    return HOSTED.reduce((text, [from, to]) => text.replace(from, to), head) + "\n\n" + own;
  }

  // the working dir and the computer it is on, the project as kept, and
  // the time now (When.now; on claude-code, short: its own prompt gives
  // the day's date). Built once a call (Chat.call, Chat.recap, Tools.ask)
  // and sent with every step of it; unmarked, after every mark a later
  // call reads (the view's and recent's), so a new minute changes only
  // what a call sends anew (as at_work's running minutes do), never a
  // cached prefix
  export function here(tools: Tools, vendor?: Vendor): Block {
    const place = Store.named(tools.mem.store);
    const project = place.path === "" ? "home (outside any git repo)" : place.name;
    return { text: "Working dir: " + tools.cwd + " on " + os.hostname() + " (" + process.platform + "), project " + project + "\nNow: " + When.now(vendor === "claude-code") + "\n\n", mark: false };
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
  // whatever the agent allows (Claude Code is told to ask through it,
  // and won't start without it)
  export function list(tools: Tools, who: string, lean = false): Spec[] {
    const user = [...skill_tools(tools.cwd), ...Mcp.tools(), ...Plugins.tools()];
    const here = lean ? [] : TOOLS;
    const asks = lean ? [APPROVE] : [];
    if (who === MAIN) {
      const lead = Custom.agent(tools.cwd, tools.hooks.main());
      return [...Custom.allow(lead, [...OWN, ...boss(tools.cwd, lead?.spawns ?? null), ...here, ...user]), ...asks];
    }
    const role = tools.agents.get(who)?.role;
    const own  = role?.fresh ? OWN.filter((t) => !MEMORY.has(t.name)) : OWN;
    return [...Custom.allow(Custom.agent(tools.cwd, role?.agent ?? null), [...own, ...here, ...user]), ...asks];
  }

  // a call, past the plugins' hooks, then judged (Tools.guard: illi's own
  // tools run, unless a hook or a rule of the user's asks or denies them,
  // or, but its chat tools, the rules won't read), run (recall's search
  // beside it: Recall.start), its answer past the plugins' hooks again,
  // then what the first hooks added for the model after it, then the line
  // recall found, if strong and in time (Recall.end) (approve: Claude
  // Code's, which judges its own)
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
    const recall = Recall.start(tools, who, name, told.input);
    const out = await Plugins.after_tool({ ...call, input: told.input }, await Tools.handle(tools, who, name, told.input as any, signal));
    return Recall.end(tools, recall, told.context === undefined ? out : { ...out, text: out.text + "\n\n" + told.context.join("\n\n") }, signal);
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
        const span = When.given(args.from) ? When.span(args.from, args.to) : null;
        if (typeof span === "string" || (span === null && !When.given(args.id))) {
          return { text: span ?? "Give id, or from (and to).", fail: true };
        }
        const project = args.project === undefined || args.project === null ? "" : String(args.project);
        return Tools.chat_of(mem, args.project, (of) => ({ text: span === null ? Memory.date(of, Number(args.id)) : Memory.days(of, span, project), fail: false }));
      }
      case "projects": {
        return { text: Projects.table(mem.store), fail: false };
      }
      case "search": {
        const asked = When.given(args.from) || When.given(args.to) ? When.span(args.from, args.to) : null;
        const span = typeof asked === "string" ? null : asked;
        const note = typeof asked === "string" ? "Every date searched: the span won't read (" + asked.replace(/\.$/, "") + ").\n\n" : "";
        const project = args.project === undefined || args.project === null ? "" : String(args.project);
        return { text: note + (await Projects.seek(mem.store, String(args.words ?? ""), project, span)), fail: false };
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
        // the main agent's tools list may hold spawn to some agents
        // (Agent(worker, researcher)): another, or none, is refused
        const only = who === MAIN ? (Custom.agent(tools.cwd, tools.hooks.main())?.spawns ?? null) : null;
        if (only !== null && (profile === null || !Custom.called(profile).some((n) => only.includes(n)))) {
          return { text: (profile === null ? "A plain subagent" : profile.name) + " isn't one this agent may spawn; name one of: " + (only.join(", ") || "none") + ".", fail: true };
        }
        const fresh = args.fresh === true || profile?.fresh === true;
        return { text: await Tools.spawn(tools, (args.tasks ?? []).map(String), { $: "sub", effort, agent: profile?.name ?? null, ...(fresh ? { fresh } : {}) }), fail: false };
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
        // a skill for a task was never on: off has nothing to do, on loads
        // it; neither failed, so nothing to try again
        if (!skill.sticky) {
          return { text: args.on ? skill.name + " isn't sticky: loaded for the task at hand.\n\n" + Tools.skill(skill) : skill.name + " isn't sticky, so it was never on: nothing to turn off.", fail: false };
        }
        const why = who !== MAIN ? "Only illi's own turns turn a sticky skill on or off." : Custom.stick(skill, args.on);
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
    tools.hooks.push(agent, "note", SUB_NOTE + (role.agent === null ? "" : " " + role.agent) + (role.effort === null ? "" : SUB_AT + role.effort) + (role.fresh ? SUB_WITHOUT : ""));
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
      const role = { $: "sub" as const, effort: sub[2] ?? null, agent: sub[1] ?? null, ...(sub[3] ? { fresh: true } : {}) };
      tools.agents.set(name, { name, run: -1, log: Logs.log(tools.mem, name) ?? name, role, call: null, live: [], calls: {}, stop: false, view: [], replies: [] });
    }
    return tools.agents.get(name) ?? null;
  }

  // calls while a message waits in its log (told too late for the call
  // before), or once one outgrew its model's window and its log was
  // recapped (Tools.refit; refits: those in a row with no work between,
  // a call answered or grown starting them anew); then its report,
  // unanswered if stopped or the vendor was busy or out of reach
  // (End.again), its recap's too. Detached: a throw ends it as a failed
  // reply, still reported
  export async function run(tools: Tools, agent: Agent, call: Call | null = null): Promise<void> {
    let away = false;
    let refits = 0;
    try {
      for (let more = true; more; call = null) {
        agent.call = call ?? AskAI.ask(Tools.ask(tools, agent), (ev) => tools.hooks.on(agent, ev));
        tools.hooks.change();
        const end = await agent.call.done;
        agent.call = null;
        refits = end.ok || end.grew ? 0 : refits;
        const last = end.stop === "full" && !agent.stop ? await Tools.refit(tools, agent, ++refits) : end;
        if (last === null) {
          continue;
        }
        agent.replies.push(last.ok ? last.text : "failed: " + last.text);
        more = last.ok && last.left.length > 0;
        away = !last.ok && last.again === true;
      }
    } catch (err: any) {
      agent.call = null;
      agent.replies.push("failed: " + String(err?.message ?? err));
    }
    tools.hooks.report(agent, report_text(agent.name, agent.log ?? agent.name, agent.replies.join("\n\n")), agent.stop || away);
  }

  // an agent's call outgrew its model's window (it ended `full`): its log
  // recapped (Tools.recap), and its run goes on from the recap and a note
  // (RECAPPED), as a turn goes on from the chat refitted (Chat.refit);
  // the refits-th in a row with no work between past REFITS, it ends
  // instead, no recap asked (a call answered or grown starts the count
  // anew, so an agent may work for hours). null: it goes on; else how
  // its run ends (failed: why; again: the vendor busy, so its report
  // stays unanswered)
  export async function refit(tools: Tools, agent: Agent, refits: number): Promise<End | null> {
    if (refits > REFITS) {
      return AskAI.end(NO_FIT.replace("#", Tools.pick(tools, agent.role).model));
    }
    const end = await Tools.recap(tools, agent);
    if (end === null) {
      tools.hooks.push(agent, "note", RECAPPED.replace("#", agent.role.fresh ? "" : RECAP_ZOOM.replace("$", agent.log ?? agent.name)));
    }
    return end;
  }

  // an agent's recap of its own work (RECAP_SUB), by its model, after its
  // log as its calls get it, on their cache but for the log (not Claude
  // Code's, run without tools), cut to fit (Logs.fit: at most MOST of
  // the window in bytes, TOKEN a token, halved while the request is
  // still too long, REFITS tries at most, then NO_FIT; a window not
  // told: the log whole first) and left unmarked (no later request reads
  // it: the next call's log differs, as a halved try's does); once (no
  // tool runs), the views told it is being written (RECAPPING, a thought:
  // never logged), its pieces streamed as its work's are (none of its
  // entries), then logged as the log's recap. Its call is the agent's
  // while it runs, so a stop reaches it (its why the stop's, as a
  // call's) and a message told meanwhile is logged, left by the recap's
  // one step (Agent.ts once) and kept whole past it (Logs.view). null:
  // logged; else its failed end, saying why
  export async function recap(tools: Tools, agent: Agent): Promise<End | null> {
    const ask = Tools.ask(tools, agent);
    const pick = Tools.pick(tools, agent.role);
    const log = Logs.view(tools.mem, agent.name);
    const window = Pick.window(pick);
    let most = window === undefined ? Memory.bytes(Logs.fit(log)) : config.config_most(window, 0, Pick.room(pick)) * TOKEN;
    tools.hooks.on(agent, { $: "Entry", kind: "mind", text: RECAPPING });
    for (let k = 0; k < REFITS; k++, most /= 2) {
      const blocks = [...ask.blocks.slice(0, -1), { text: Logs.fit(log, most), mark: false }, { text: RECAP_SUB, mark: false }];
      agent.call = AskAI.ask({ ...ask, blocks, once: true, room: undefined }, (ev) => ev.$ === "Delta" && tools.hooks.on(agent, ev));
      tools.hooks.change();
      const end = await agent.call.done;
      agent.call = null;
      const text = end.ok ? end.text.trim() : "";
      if (text !== "") {
        tools.hooks.on(agent, { $: "Entry", kind: "recap", text });
        return null;
      }
      if (agent.stop || end.stop !== "full") {
        return { ...end, ok: false, text: agent.stop ? end.text : "no recap: " + (end.ok ? "none came" : end.text), left: [] };
      }
    }
    return AskAI.end(NO_FIT.replace("#", pick.model));
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

  // a call of an agent, on its pick (Tools.pick): its map of the chat
  // (Agent.view), where it works and its log (past a recap, its first
  // note and illi's messages to it, then the log from its last recap on:
  // Logs.view); one started fresh, no map, nor the map's docs
  // (SUB_FRESH). Its room is a turn's (Chat.call; a window not told:
  // none), so one outgrowing its model's window ends `full` and its log
  // is recapped (Tools.refit), on claude-code too (Claude Code's
  // compaction off: ClaudeCode.env)
  export function ask(tools: Tools, agent: Agent): Ask {
    const log = { text: Logs.fit(Logs.view(tools.mem, agent.name)), mark: true };
    const server = Tools.at(tools, agent.name);
    const profile = Custom.agent(tools.cwd, agent.role.agent);
    const pick = Tools.pick(tools, agent.role);
    const run = Pick.ask(pick);
    const system = Tools.system((agent.role.fresh ? SUB_FRESH : SUB) + Custom.section(profile), tools.cwd, run.vendor);
    const blocks = [...agent.view, Tools.here(tools, run.vendor), log];
    const effort = agent.role.effort ?? run.effort;
    const window = Pick.window(pick);
    const room = window === undefined ? undefined : Math.round(window * (Pick.room(pick) ?? config.ROOM));
    return { ...run, effort, system, blocks, searches: SEARCHES, server, builtins: profile?.builtins, listed: profile?.tools, room };
  }

  // Claude Code asking leave to use a tool (its permission prompt): past
  // the plugins' hooks first (they may refuse it or change its input; what
  // it answers stays Claude Code's), then judged as illi's own would be
  // (Access.hosted: what illi's like tool asks), so the same rules,
  // approvals and mode hold there. Its answer as Claude Code reads it:
  // the input to run, or a no with what the model is told
  export async function approve(tools: Tools, who: string, tool: string, input: unknown, signal: AbortSignal): Promise<Out> {
    const told = await Plugins.before_tool({ tool, input, agent: who === MAIN ? null : who, cwd: tools.cwd, signal });
    const used = "block" in told ? undefined : told.input;
    const stop = "block" in told ? { text: told.block, fail: true } : await Tools.guard(tools, who, tool, used, signal, (where) => Access.hosted(where, tool, used), told);
    const answer = stop === null ? { behavior: "allow", updatedInput: used } : { behavior: "deny", message: stop.text };
    return { text: JSON.stringify(answer), fail: false };
  }

  // Permissions
  // -----------

  // a call judged before it runs (Permissions.ts): its requests
  // (Access.ts; ones it fails to make: the whole call, asked), by illi's
  // rules and the user's, the approvals saved for the project and those
  // given this run (Tools.ruleset), in the mode: null runs it, else what
  // the model is told. Any request denied refuses it, before anything is
  // asked; then each one asked is asked in turn (one an earlier answer
  // approved meanwhile, not), given what the call would do and why, WHOLE
  // characters of each at most (Tools.whole: past that, the lines holding
  // what made it ask: the request's spots), and what "don't ask again"
  // saves (its save, in words, by its ends past KEPT). One a hook allowed
  // is judged as in trust mode (the rules' denies still hold); one it
  // asks about is asked though the rules allow it, its why first on the
  // call's first question, which offers no "don't ask again". A rules
  // file that won't read leaves nothing that touches the computer or
  // beyond run unasked (no "don't ask again"), trust mode and a hook's
  // allow too. The answer (Tools.question): yes runs it, "don't ask
  // again" saving the request's approvals for the project (one that can't
  // be saved: for this run) and answering every question waiting that
  // they now allow; no refuses it, and every other question its caller
  // has waiting; a plain no (no words) also stops the caller's turn,
  // while a no with words goes to the model as the user's, which goes on
  export async function guard(tools: Tools, who: string, tool: string, input: unknown, signal: AbortSignal, requests = (where: Where) => Access.requests(where, tool, input), hooked: { allow?: boolean; ask?: string } = {}): Promise<Out | null> {
    const folder = Trusted.folder(tools.cwd);
    const where: Where = { cwd: path.resolve(tools.cwd), top: folder, files: Access.own() };
    const mode = hooked.allow === true ? "trust" : Tools.mode(tools);
    const rules = Tools.ruleset(tools);
    const asked = { who: who === MAIN ? "illi" : who, tool, what: Tools.what(input) };
    const all: Want[] = (() => {
      try {
        return requests(where);
      } catch (err: any) {
        return [{ action: tool, resources: [Tools.does(input)], save: [], spots: [null], failed: String(err?.message ?? err) }];
      }
    })();
    const asks: Asking[] = [];
    for (const req of all) {
      const v = Permissions.decide(req.action, req.resources, [...rules.base, ...rules.user], rules.saved, mode);
      if (v.effect === "deny") {
        return Tools.refuse(tools, { ...asked, why: Tools.why(rules, req, v, folder), how: "rule", said: "", exact: [] });
      }
      const failed = (req as { failed?: string }).failed;
      const unread = failed !== undefined ? "illi's check of it failed (" + failed + ")" : rules.broken !== null && !CHAT.has(req.action) ? "illi can't read your permission rules (" + rules.broken + ")" : null;
      if (unread !== null || v.effect === "ask") {
        asks.push({ req, by: unread !== null ? req.resources.map((_, k) => k) : v.by, why: unread ?? Tools.why(rules, req, v, folder), mode, keep: unread === null });
      }
    }
    if (hooked.ask !== undefined) {
      asks.splice(0, 1, asks.length === 0 ? { req: { action: tool, resources: [], save: [], spots: [] }, by: [], why: hooked.ask, mode, keep: false, all: true } : { ...asks[0], why: hooked.ask + "; " + asks[0].why, keep: false });
    }
    for (const ask of asks) {
      if (ask.keep && Tools.decided(tools, ask) === "allow") {
        continue;
      }
      const out = await Tools.question(tools, who, asked, input, ask, signal);
      if (out !== null) {
        return out;
      }
    }
    return null;
  }

  // a request asked of the user, waiting (Perm pending) till answered or
  // settled by another answer; null: yes. Yes, and don't ask again: the
  // approvals of what asked saved (a shell request's, the families of
  // the commands that asked, not of its every one; one another covers
  // left out, Permissions.fold: a folder's, not those in it; for this
  // run, if the file won't take them), every question waiting that they
  // now allow answered yes. No: refused, and every other question of its caller
  // waiting with it, the same answer; a plain no stops the caller's turn
  // too (the master's: its subagents with it)
  export async function question(tools: Tools, who: string, asked: { who: string; tool: string; what: string }, input: unknown, ask: Asking, signal: AbortSignal): Promise<Out | null> {
    const folder = Trusted.folder(tools.cwd);
    const entry: Pending = { who, ask, ctl: new AbortController() };
    const id = crypto.randomUUID();
    const spots = ask.all === true ? [[0, Tools.does(input).length] as Span] : ask.by.flatMap((k) => (ask.req.spots[k] === null ? [] : [ask.req.spots[k]!]));
    const saves = Permissions.fold(ask.req.save.filter((s) => ask.by.some((k) => Permissions.match(ask.req.resources[k], s))));
    const keep = ask.keep ? [...new Set(saves.map((s) => Access.said(ask.req.action, s, folder)))].join(", ") : "";
    tools.perm.pending.set(id, entry);
    let reply: Reply;
    try {
      reply = await tools.hooks.ask({ ...asked, ...Tools.whole(input, spots.length === 0 ? undefined : spots), why: Tools.ends(ask.why, WHOLE), keep: Tools.ends(keep, KEPT) }, AbortSignal.any([signal, entry.ctl.signal]));
    } finally {
      tools.perm.pending.delete(id);
    }
    const got = entry.outcome ?? reply;
    const exact = ask.keep ? ask.by.map((k) => ({ action: ask.req.action, resource: ask.req.resources[k] })) : [];
    if (got.yes) {
      if (got.always && ask.keep && entry.outcome === undefined) {
        const unsaved = Permissions.save(config.PERMISSIONS, folder, ask.req.action, saves);
        if (unsaved !== null) {
          tools.perm.allowed.push(...saves.map((resource): Rule => ({ action: ask.req.action, resource, effect: "allow" })));
          console.error("illi: an approval kept for this run only: " + unsaved);
        }
        for (const p of tools.perm.pending.values()) {
          if (p.ask.keep && Tools.decided(tools, p.ask) === "allow") {
            Tools.settle(p, { yes: true, always: false, said: "" });
          }
        }
        tools.hooks.change();
      }
      return null;
    }
    if (entry.outcome === undefined && !signal.aborted) {
      [...tools.perm.pending.values()].filter((p) => p.who === who).forEach((p) => Tools.settle(p, { ...got, always: false }));
      if (got.stop === true) {
        tools.hooks.stop(who);
      }
    }
    return Tools.refuse(tools, { ...asked, why: ask.why, how: got.stop === true ? "stop" : "no", said: got.said, exact }, !signal.aborted);
  }

  // a question waiting, answered by another answer: its question dropped
  // (Chat.question: its signal), its call reading this answer instead
  export function settle(p: Pending, reply: Reply): void {
    if (p.outcome === undefined) {
      p.outcome = reply;
      p.ctl.abort();
    }
  }

  // a request asked, judged again by the rules now (an approval saved
  // since may allow it)
  export function decided(tools: Tools, ask: Asking): Effect {
    const rules = Tools.ruleset(tools);
    return Permissions.decide(ask.req.action, ask.req.resources, [...rules.base, ...rules.user], rules.saved, ask.mode).effect;
  }

  // the rules a call is judged by: illi's own (Permissions.base, with its
  // customization places: Access.places), the user's, the approvals saved
  // for the project and those given this run; while the file won't read,
  // the user's none, and why
  export function ruleset(tools: Tools): { base: Rule[]; user: Rule[]; saved: Rule[]; broken: string | null } {
    const read = Permissions.read(config.PERMISSIONS, Trusted.folder(tools.cwd));
    const ok = typeof read !== "string";
    return { base: Permissions.base(Access.places(tools.cwd)), user: ok ? read.rules : [], saved: [...(ok ? read.saved : []), ...tools.perm.allowed], broken: ok ? null : read };
  }

  // why a request is asked or refused: the folders outside, which (one
  // inside another said as that one: Permissions.fold); a .env read; the
  // user's rule that says so
  export function why(rules: { base: Rule[]; user: Rule[]; saved: Rule[] }, req: Want, v: { effect: Effect; by: number[] }, top: string): string {
    const folder = (r: string) => Access.said("external_directory", r, top).replace(/^files in /, "");
    const rule = Permissions.evaluate(req.action, req.resources[v.by[0]] ?? "*", v.effect === "deny" ? [...rules.base, ...rules.user] : [...rules.base, ...rules.user, ...rules.saved]);
    if (rules.base.includes(rule)) {
      return req.action === "external_directory" ? "it reaches outside the project: " + Permissions.fold(v.by.map((k) => req.resources[k])).map(folder).join(", ") : req.action === "read" ? "it reads a .env file, which may hold secrets" : "illi's rules ask about " + req.action;
    }
    return "your rule " + (v.effect === "deny" ? "denies " : "asks about ") + (rule.action === "shell" ? "" : rule.action + " ") + rule.resource;
  }

  // the mode now: /mode's for this run, else the setting's
  export function mode(tools: Tools): Mode {
    return tools.perm.mode ?? Tools.mode_set();
  }

  // the `mode` setting's (Permissions.mode_of: an older illi's too)
  export function mode_set(): Mode {
    return Permissions.mode_of(config.config_value("mode"));
  }

  // the permissions as the views show them: the approvals saved for the
  // project (none while the file won't read), then this run's
  export function perms(tools: Tools): Perms {
    const folder = Trusted.folder(tools.cwd);
    const read   = Permissions.read(config.PERMISSIONS, folder);
    const saved  = typeof read === "string" ? [] : read.saved;
    const run    = tools.perm.allowed.filter((a) => !saved.some((s) => s.action === a.action && s.resource === a.resource));
    const grants = [...saved.map((r) => ({ r, saved: true })), ...run.map((r) => ({ r, saved: false }))];
    return { mode: Tools.mode(tools), set: Tools.mode_set(), refused: tools.perm.refused, grants: grants.map(({ r, saved }) => ({ action: r.action, resource: r.resource, said: Access.said(r.action, r.resource, folder), saved })), file: config.PERMISSIONS, broken: typeof read === "string" ? read : "" };
  }

  // a refused request allowed for this run (/permissions): its very
  // resources approved (exact: a command's * and ? as they are; a
  // folder's request, that folder and those in it), and every refusal
  // they now clear taken off the list; null: none such, or one only the
  // user's rules can allow
  export function allow(tools: Tools, id: string): Refused | null {
    const refused = tools.perm.refused.find((r) => r.id === id);
    if (refused === undefined || refused.exact.length === 0) {
      return null;
    }
    const has = (e: { action: string; resource: string }) => tools.perm.allowed.some((a) => a.action === e.action && a.resource === e.resource);
    refused.exact.filter((e) => !has(e)).forEach((e) => tools.perm.allowed.push({ ...e, effect: "allow", exact: e.action !== "external_directory" }));
    tools.perm.refused = tools.perm.refused.filter((r) => r.exact.length === 0 || !r.exact.every(has));
    tools.hooks.change();
    return refused;
  }

  // an approval let go (/permissions): this run's, and the project's
  // saved one; null: done, else why the file wasn't changed
  export function revoke(tools: Tools, action: string, resource: string): string | null {
    tools.perm.allowed = tools.perm.allowed.filter((a) => a.action !== action || a.resource !== resource);
    const why = Permissions.revoke(config.PERMISSIONS, Trusted.folder(tools.cwd), action, resource);
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

  // what a tool would do: a command, a file (an edit's files), a URL or a
  // query, else its input
  export function does(input: any): string {
    const edits = Array.isArray(input?.edits) && input?.file_path === undefined ? [...new Set(input.edits.map((e: any) => String(e?.path ?? "")))].join(", ") : undefined;
    const one = input?.command ?? input?.file_path ?? input?.notebook_path ?? input?.path ?? edits ?? input?.url ?? input?.query ?? input?.pattern;
    return typeof one === "string" ? one : JSON.stringify(input ?? {});
  }

  // what a tool would do (Tools.does) as the question shows it: WHOLE
  // characters at most (a character in two halves, a surrogate pair, kept
  // whole); past them, each line holding a spot (where the checks found
  // what made them ask: Request spots), PIECE characters of it at
  // most from REACH before the spot, WHOLE of all such at most (spots
  // past that: only the why names them), lines one after another kept
  // as one, a line before each saying how many characters were left out
  // there (cuts: where those lines are, so the question tells them from
  // the command); how many past the last shown are left out (more: the
  // question says so); the spots, moved to where they are in what it
  // shows (none given: none). So a risk deep in a heredoc carrying a
  // whole file still shows
  export function whole(input: any, spots?: Span[]): { whole: string; more: number; spots?: Span[]; cuts?: Span[] } {
    const text   = Tools.does(input);
    const ends   = (e: number) => (e < text.length && text.charCodeAt(e - 1) >> 10 === 0x36 ? e - 1 : e);
    const starts = (a: number) => (a > 0 && text.charCodeAt(a) >> 10 === 0x37 ? a - 1 : a);
    const head   = text.length <= WHOLE ? text.length : ends(WHOLE);
    const shown: Span[] = [[0, head]];
    let used = 0;
    for (const [from, to] of [...(spots ?? [])].sort((a, b) => a[0] - b[0])) {
      if (from < head || from >= text.length || used >= WHOLE) {
        continue;
      }
      const nl   = text.indexOf("\n", Math.max(from, to - 1));
      const a    = starts(Math.max(text.lastIndexOf("\n", from - 1) + 1, head, from - REACH));
      const b    = ends(Math.min(nl < 0 ? text.length : nl, a + PIECE));
      const last = shown.at(-1)!;
      used += Math.max(0, b - Math.max(a, last[1]));
      if (a <= last[1] || (a === last[1] + 1 && text[last[1]] === "\n")) {
        last[1] = Math.max(last[1], b);
      } else {
        shown.push([a, b]);
      }
    }
    let out = "";
    let end = 0;
    const cuts: Span[] = [];
    const moves: Array<[number, number, number]> = [];
    for (const [a, b] of shown) {
      if (a > end) {
        const said = "… " + (a - end).toLocaleString("en-US") + (a - end === 1 ? " character" : " characters") + " left out";
        cuts.push([out.length + 1, out.length + 1 + said.length]);
        out += "\n" + said + "\n";
      }
      moves.push([a, b, out.length - a]);
      out += text.slice(a, b);
      end = b;
    }
    const moved = (spots ?? []).flatMap(([from, to]) => moves.flatMap(([a, b, d]): Span[] => (from < b && a < to ? [[Math.max(from, a) + d, Math.min(to, b) + d]] : [])));
    return { whole: out, more: text.length - end, ...(spots === undefined ? {} : { spots: moved }), ...(cuts.length === 0 ? {} : { cuts }) };
  }

  // what a tool would do (Tools.does), WHAT characters at most, where
  // the room is small and nothing scrolls: a note, the side's refused
  // list, /permissions
  export function what(input: any): string {
    const text = Tools.does(input);
    return text.length > WHAT ? text.slice(0, WHAT - 1) + "…" : text;
  }

  // a text, most characters at most: whole, else its start and its end
  // about an ellipsis, half each (a character in two halves, a surrogate
  // pair, kept whole)
  export function ends(text: string, most: number): string {
    if (text.length <= most) {
      return text;
    }
    const half = Math.floor(most / 2);
    const head = half - (text.charCodeAt(half - 1) >> 10 === 0x36 ? 1 : 0);
    const tail = text.length - half - (text.charCodeAt(text.length - half) >> 10 === 0x37 ? 1 : 0);
    return text.slice(0, head) + " … " + text.slice(tail);
  }

  // the chat's map (Memory.map: from the lines built, waiting on no
  // summary), for an agent of this role once its model's window is told
  // (on ChatGPT: ChatGPT.ready, as a turn waits; never guessed); a
  // string: why there is none. One started fresh gets none
  export async function view(tools: Tools, role: Agent["role"]): Promise<Block[] | string> {
    const pick = Tools.pick(tools, role);
    const unready = pick.vendor === "chatgpt" ? await ChatGPT.ready(pick.model, tools.hooks.halt()) : null;
    return unready !== null ? "Not started: " + unready + "." : role.fresh ? [] : Memory.map(tools.mem);
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
