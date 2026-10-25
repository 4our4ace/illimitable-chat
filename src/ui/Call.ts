// Call
// ====
// A tool call as people read it. Logged as its tool's name, a space and its
// input's JSON (`zoom {"id":6243,"n":1}`; illi's own as Claude Code names
// them, `mcp__illi__zoom`, by their own name), it shows as its name in bold
// (after a mark, if the theme gives it one: Theme.TOOL; an MCP server's or
// a plugin's tool after its server, `github: get_issue`) and a head, as its
// tool reads (READS): a command as itself; a file tool its path, read's
// lines after it, edit's files (the diff comes in its result); zoom and
// date the message (`#6243`, a line `#6243+8`, an agent by name); spawn
// its tasks, tell its agent's name and its text in blocks; todo how far
// its list is, its items in a block, each marked; a web search its
// queries, or the page it opened. Any other call, or an edit whose edits
// are no list, shows its name and short values as arguments (`get_issue
// 42`; short: JSON within SHORT chars, and a string without spaces or
// escapes), over a code block for each other value, keyed by its name
// unless alone. A call still streaming reads as its input so far: its
// open string and brackets closed, else up to its last whole field.
//
// A run of work (View.ts) lists each call on one line instead: what it
// did in plain words (call_label, by its tool: LABELS; a command by the
// description its caller gave it, else its first line; a file by its
// path from the working dir, else from ~: path_said), then how it
// ended (call_outcome: a command's exit, the lines a read showed, the
// lines a write or an edit changed; a failure, how).
//
// An agent's report is logged as `[Name]` on its own line, its replies,
// and a line naming its whole chat (the model reads who sent it); it
// shows as its replies alone, framed and named by its agent.

import { history_bare } from "../tools/Clip.ts";
import type * as Md from "./Md.ts";
import { GLYPH } from "./Theme.ts";

// Types
// =====

// name: the bare tool name ("": no call), shown bold; from: the MCP
// server or plugin whose tool it is ("": illi's own, or its vendor's);
// raw: its name as logged (illi's own as Claude Code names them, by
// their own name; a theme may mark a tool by it: Paint.ts); head: the
// rest of its line (a command's lines); input: what it was called with,
// as read (a label reads it: call_label)
export type Call = { name: string; from: string; raw: string; head: string; blocks: Md.Code[]; input: Input };

type Input = Record<string, unknown>;

type Shown = { head: string; blocks: Md.Code[] };

// Constants
// =========

const SHORT = 60;

const CALL = /^(\S+) (\{[\s\S]*)$/;

// illi's own tools as Claude Code names them (its MCP server's); a tool
// of the user's MCP servers (Mcp.ts) or of a plugin (Plugins.ts), its
// server and its name
const OWN  = /^mcp__illi__/;
const FROM = /^(?:mcp|plugin)__(.+?)__(.+)$/;

const READS = new Map<string, (x: Input) => Shown>([
  ["shell",      (x) => ({ head: String(x.command ?? ""), blocks: [] })],
  ["read",       (x) => ({ head: String(x.path ?? "") + lines_show(x.offset, x.limit), blocks: [] })],
  ["write",      (x) => ({ head: String(x.path ?? ""), blocks: [] })],
  ["edit",       (x) => (Array.isArray(x.edits) ? { head: edits_files(x.edits), blocks: [] } : input_shown(x))],
  ["zoom",       (x) => ({ head: msg_show(x.id, x.n) + (x.at === undefined ? "" : " from char " + x.at), blocks: [] })],
  ["date",       (x) => ({ head: msg_show(x.id, 1), blocks: [] })],
  ["spawn",      (x) => ({ head: tasks_show(x.tasks, x.agent, x.effort), blocks: (Array.isArray(x.tasks) ? x.tasks : []).flatMap(text_block) })],
  ["tell",       (x) => ({ head: String(x.name ?? ""), blocks: text_block(x.message) })],
  ["todo",       (x) => todo_shown(x.items)],
  ["web_search", (x) => web_shown(x)],
]);

// the most characters of a label (call_label) kept before it is laid out
// (Paint.ts fits it to the row): a command of any length costs about
// what a short one does
const LABEL = 200;

// what each tool's call did, in plain words, by its input (and its
// result: spawn's names); "": none of its own, or the field it is about
// missing or blank (about), so it reads as any tool's (call_named).
// illi's tools first, then Claude Code's (the claude-code vendor's
// calls; its subagents' tool is Agent, once Task)
const LABELS = new Map<string, (x: Input, result: string | null) => string>([
  ["shell",      (x) => text_first(x.description) || command_first(x.command)],
  ["read",       (x) => about(path_said(x.path), (path) => "Read " + path + read_lines(x.offset, x.limit))],
  ["write",      (x) => about(path_said(x.path), (path) => "Wrote " + path)],
  ["edit",       (x) => (Array.isArray(x.edits) ? about(names_few(x.edits.map((e: any) => path_said(e?.path))), (files) => "Edited " + files) : "")],
  ["web_search", (x) => web_label(x)],
  ["search",     (x) => about(x.words, (words) => 'Searched memory for "' + words + '"' + project_in(x.project))],
  ["zoom",       (x) => about(typeof x.id === "string" && x.id !== "" ? x.id + "'s chat" : msg_show(x.id, x.n), (what) => "Looked back at " + what + project_in(x.project))],
  ["date",       (x) => about(msg_show(x.id, 1), (what) => "Checked the date of " + what + project_in(x.project))],
  ["projects",   () => "Listed the projects"],
  ["spawn",      (x, result) => about(started(result) || agents_said(x.tasks, x.agent), (who) => "Started " + who)],
  ["tell",       (x) => about(x.name, (name) => "Messaged " + name)],
  ["skill",      (x) => about(x.name, (name) => (x.on === true ? "Turned on skill " : x.on === false ? "Turned off skill " : "Loaded skill ") + name)],
  ["todo",       (x) => (Array.isArray(x.items) && x.items.length === 0 ? "Cleared the to-do list" : "Updated the to-do list")],
  ["ask",        (x) => asked(x.questions)],
  ["Bash",       (x) => text_first(x.description) || command_first(x.command)],
  ["Read",       (x) => about(path_said(x.file_path), (path) => "Read " + path + read_lines(x.offset, x.limit))],
  ["Write",      (x) => about(path_said(x.file_path), (path) => "Wrote " + path)],
  ["Edit",       (x) => about(path_said(x.file_path), (path) => "Edited " + path)],
  ["MultiEdit",  (x) => about(path_said(x.file_path), (path) => "Edited " + path)],
  ["NotebookEdit", (x) => about(path_said(x.notebook_path), (path) => "Edited " + path)],
  ["Glob",       (x) => about(x.pattern, (pattern) => "Listed files matching " + pattern)],
  ["Grep",       (x) => about(x.pattern, (pattern) => 'Searched for "' + pattern + '"' + (typeof x.path === "string" && x.path !== "" ? " in " + text_first(path_said(x.path)) : ""))],
  ["WebSearch",  (x) => about(x.query, (query) => 'Searched "' + query + '"')],
  ["WebFetch",   (x) => about(url_short(x.url), (url) => "Opened " + url)],
  ["TodoWrite",  () => "Updated the to-do list"],
  ["Task",       (x) => "Started " + (text_first(x.subagent_type) || "an agent")],
  ["Agent",      (x) => "Started " + (text_first(x.subagent_type) || "an agent")],
]);

// the input's fields that tell most what an unknown tool's call did, in
// turn (Tools.does reads those from command to pattern so too)
const TELLING = ["description", "command", "file_path", "path", "notebook_path", "url", "query", "pattern", "name", "id"];

// a command's leading `cd <dir> &&` (or `;`), left out of its label: the
// command after it says what it does
const CD = /^cd\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+)\s*(?:&&|;)\s*/;

// how a shell call ended, at its result's end (Machine.shell: exit 0,
// stopped, killed by a signal, by its name or its number: `killed by
// signal 34`); Claude Code's Bash, failing, says its
// code first; a read's lines shown, at its result's end (Machine.read);
// what a call stopped answers (Agent.use); how far from a result's end
// each is looked for
const EXIT    = /\((exit -?\d+|stopped|killed by (?:signal )?\S+) in [\d.]+ ?s\)\s*$/;
const CODE    = /^Exit code (-?\d+)/;
const SHOWN   = /\[lines (\d+)-(\d+) of \d+[^\]\n]*\]\s*$/;
const STOPPED = "(stopped)";
const TAIL    = 160;

// Report
// ======

export type Report = { name: string; text: string };

// an agent's report: its name, what it said, how to open its whole chat
// (by its log: the name may go on to another agent)
export function report_text(name: string, log: string, text: string): string {
  return "[" + name + "]\n" + text + "\n\nFull chat: zoom(\"" + log + "\")";
}

export function report_read(text: string): Report | null {
  const m = /^\[([^\]\n]+)\]\s*([\s\S]*?)(?:\s*Full chat: zoom\("[^"\n]*"\))?\s*$/.exec(text);
  return m === null ? null : { name: m[1], text: m[2] };
}

// Parse
// =====

export function call_parse(text: string): Call {
  const m     = CALL.exec(text);
  const input = m === null ? null : input_parse(m[2]);
  if (m === null || input === null) {
    return { name: "", from: "", raw: "", head: text, blocks: [], input: {} };
  }
  const [from, name] = call_name(m[1]);
  const read = from === "" ? READS.get(name) : undefined;
  return { name, from, raw: m[1].replace(OWN, ""), input, ...(read ?? input_shown)(input) };
}

// a tool's name as logged: the server or plugin whose tool it is ("":
// none; illi's own as Claude Code names them, by their own name), and
// its own name
function call_name(logged: string): [string, string] {
  const bare = logged.replace(OWN, "");
  const m    = FROM.exec(bare);
  return m === null ? ["", bare] : [m[1], m[2]];
}

// a call's name as its head shows it: an MCP server's or a plugin's tool
// after its server
export function call_tool(c: Call): string {
  return c.from === "" ? c.name : c.from + ": " + c.name;
}

// the call on one line, after its name: its head, then each block,
// spaces folded
export function call_line(c: Call): string {
  const blocks = c.blocks.map((b) => (b.k === "" ? "" : b.k + ": ") + b.x);
  return [c.head, ...blocks].join(" ").replace(/\s+/g, " ").trim();
}

// Label
// =====

// what a call did, in plain words: its tool's own (LABELS; spawn's agents
// named by its result, if given), else its name and its most telling
// short value (call_named); a tool message that isn't `name {input}`,
// its first line; on one line, LABEL characters at most
export function call_label(c: Call, result: string | null = null): string {
  const own  = c.from === "" ? LABELS.get(c.name) : undefined;
  const said = own === undefined ? "" : own(c.input, result).trim();
  return text_cap(c.name === "" ? text_first(c.head) : said !== "" ? said : call_named(c));
}

// how a call ended, in a word or a few ("": nothing to say past its mark,
// or not known: ok null): a command's exit (EXIT; Claude Code's Bash
// failing, CODE), else stopped (Agent.use) or failed; a read's lines
// shown, the lines a write or an edit added and removed (diff_said).
// Only a result's TAIL is looked at for its end, so a long one costs
// what a short one does: its own end, the <history> line recall may have
// appended left out (history_bare)
export function call_outcome(c: Call, ok: boolean | null, result: string): string {
  const own  = c.from === "" ? c.name : "";
  const bare = history_bare(result);
  const tail = bare.slice(-TAIL);
  const code = own === "shell" || own === "Bash" ? EXIT.exec(tail)?.[1] ?? CODE.exec(bare.slice(0, TAIL))?.[1] : undefined;
  if (ok === null) {
    return "";
  }
  if (code !== undefined) {
    return /^-?\d+$/.test(code) ? "exit " + code : code;
  }
  if (!ok) {
    return bare === STOPPED ? "stopped" : "failed";
  }
  if (own === "read") {
    const m = SHOWN.exec(tail);
    return m === null ? "" : lines_said(Number(m[2]) - Number(m[1]) + 1);
  }
  return own === "write" || own === "edit" ? diff_said(bare) : "";
}

// an unknown tool's call (any other of illi's, an MCP server's, a
// plugin's, a vendor's): its name (after its server: call_tool), then the
// first of its telling fields given (TELLING), else its first short value
function call_named(c: Call): string {
  const x    = c.input;
  const tell = TELLING.find((k) => arg_said(x[k], LABEL) !== "");
  const key  = tell ?? Object.keys(x).find((k) => arg_said(x[k], SHORT) !== "");
  const arg  = key === undefined ? "" : arg_said(x[key], tell === undefined ? SHORT : LABEL);
  return call_tool(c) + (arg === "" ? "" : " " + arg);
}

// a value as a label shows it: a number as it is, a string's first line,
// quoted if it holds a space; "": anything else, a blank string, one
// longer than most
function arg_said(v: unknown, most: number): string {
  const line = typeof v === "number" ? String(v) : text_first(v);
  return line === "" || line.length > most ? "" : /\s/.test(line) ? '"' + line + '"' : line;
}

// a text's first line as a label shows it (text_first): a thought's,
// a summary's
export function label_line(text: string): string {
  return text_first(text);
}

// a string's first line that holds anything, its spaces folded, " …"
// after it when it goes on (cut, or more lines after it), LABEL
// characters in all at most; "": not a string, or blank. A long text is
// never copied whole
function text_first(v: unknown): string {
  if (typeof v !== "string") {
    return "";
  }
  const from = v.search(/\S/);
  if (from < 0) {
    return "";
  }
  const end  = v.indexOf("\n", from);
  const stop = end < 0 ? v.length : end;
  const cut  = Math.min(stop, from + LABEL - 2);
  const line = v.slice(from, cut < v.length && v.charCodeAt(cut - 1) >> 10 === 0x36 ? cut - 1 : cut).replace(/\s+/g, " ").trim();
  const more = /\S/g;
  more.lastIndex = stop;
  return line + (stop - from > LABEL - 2 || more.test(v) ? " …" : "");
}

// a label LABEL characters at most (a character in two halves kept
// whole), "…" where it was cut
function text_cap(s: string): string {
  const end = s.length <= LABEL ? s.length : s.charCodeAt(LABEL - 1) >> 10 === 0x36 ? LABEL - 1 : LABEL;
  return end === s.length ? s : s.slice(0, end) + "…";
}

// a command's first line, a leading `cd <dir> &&` left out (CD)
function command_first(v: unknown): string {
  const line = text_first(v);
  return line.replace(CD, "") || line;
}

// a path as a label names it: one in the working dir from there (the
// dir itself `.`; Claude Code's tools give theirs whole), one under home
// from ~ (home itself `~`; a HOME ending in a slash too); any other (the
// working dir `/` names none), or not a string, as it is
function path_said(v: unknown): unknown {
  if (typeof v !== "string" || !v.startsWith("/")) {
    return v;
  }
  const cwd  = process.cwd();
  const home = (process.env.HOME ?? "").replace(/\/+$/, "");
  const here = cwd === "/" ? null : path_under(v, cwd);
  const away = home === "" ? null : path_under(v, home);
  return here !== null ? here || "." : away !== null ? (away === "" ? "~" : "~/" + away) : v;
}

// what follows dir in a path, the slashes after it left out ("": dir
// itself); null: a path not under it
function path_under(v: string, dir: string): string | null {
  return v === dir ? "" : v.startsWith(dir + "/") ? v.slice(dir.length + 1).replace(/^\/+/, "") : null;
}

// words about a field's first line (say), or "" when it is missing or
// blank: the call then reads as any tool's (call_named), never as words
// left hanging (`Read`, `Messaged`)
function about(v: unknown, say: (line: string) => string): string {
  const line = text_first(v);
  return line === "" ? "" : say(line);
}

// a read's lines, if only some: `, lines 40-79`, ` from line 40` ("":
// the whole file)
function read_lines(offset: unknown, limit: unknown): string {
  const from = typeof offset === "number" && offset > 1 ? offset : 1;
  return typeof limit === "number" ? ", lines " + from + "-" + (from + limit - 1) : from > 1 ? " from line " + from : "";
}

// names, each once: two at most, then how many more, in words, so the
// count never reads as an edit's lines added (`a.ts, b.ts and 3 more`)
function names_few(xs: unknown[]): string {
  const names = [...new Set(xs.map(text_first).filter((x) => x !== ""))];
  return names.slice(0, 2).join(", ") + (names.length > 2 ? " and " + (names.length - 2) + " more" : "");
}

// the first of several texts, quoted, then how many more (`"bend" +2`;
// "": none)
function firsts(xs: unknown[]): string {
  const said = xs.map(text_first).filter((x) => x !== "");
  return said.length === 0 ? "" : '"' + said[0] + '"' + (said.length > 1 ? " +" + (said.length - 1) : "");
}

// a URL as a label shows it: no scheme, no www.
function url_short(v: unknown): string {
  return text_first(v).replace(/^https?:\/\//, "").replace(/^www\./, "");
}

// a web search's call (OpenAI's and ChatGPT's action; Anthropic's, its
// query alone): its query (several: the first, then how many more), the
// page it opened, the text it looked for in a page
function web_label(x: Input): string {
  if (x.type === "open_page") {
    return "Opened " + (url_short(x.url) || "a page");
  }
  if (x.type === "find" || x.type === "find_in_page") {
    return about(x.pattern, (pattern) => 'Found "' + pattern + '" in ' + (url_short(x.url) || "page"));
  }
  const said = firsts(Array.isArray(x.queries) && x.queries.length > 0 ? x.queries : [x.query]);
  return said === "" ? "Searched the web" : "Searched " + said;
}

// a web search's call as its head shows it: its queries, a line each;
// the page it opened; the page it looked in, the text it looked for in a
// block (an action of another kind: as any tool's input)
function web_shown(x: Input): Shown {
  const queries = Array.isArray(x.queries) && x.queries.length > 0 ? x.queries : x.query === undefined ? [] : [x.query];
  if (x.type === "open_page") {
    return { head: String(x.url ?? ""), blocks: [] };
  }
  if (x.type === "find" || x.type === "find_in_page") {
    return { head: String(x.url ?? ""), blocks: typeof x.pattern === "string" ? [{ $: "Code", k: "find", x: x.pattern }] : [] };
  }
  return queries.length === 0 ? input_shown(x) : { head: queries.map(String).join("\n"), blocks: [] };
}

// the project a memory tool looked in, after its words (" in every
// project"; "": this one's)
function project_in(project: unknown): string {
  return typeof project !== "string" || project === "" ? "" : project === "all" ? " in every project" : " in " + project;
}

// a spawn's agents as its result names them (Tools.spawn: `Started A,
// B.`); "": no result, or none named
function started(result: string | null): string {
  return /^Started (.+?)\.(?:\s|$)/.exec(result ?? "")?.[1] ?? "";
}

// a spawn's agents before its result names them: one (the user's agent
// it runs as, else "an agent"), or how many ("": no tasks)
function agents_said(tasks: unknown, agent: unknown): string {
  const n   = Array.isArray(tasks) ? tasks.length : 0;
  const who = typeof agent === "string" ? agent : "";
  return n === 0 ? "" : n === 1 ? who || "an agent" : n + " " + (who === "" ? "agents" : who + " agents");
}

// an ask's questions: the first (its tab's label, else its text), then
// how many more
function asked(questions: unknown): string {
  const said = Array.isArray(questions) ? firsts(questions.map((q: any) => q?.head || q?.question)) : "";
  return said === "" ? "" : "Asked " + said;
}

// lines counted: `1 line`, `1,204 lines`
function lines_said(n: number): string {
  return n.toLocaleString("en-US") + (n === 1 ? " line" : " lines");
}

// a unified diff's lines added and removed (Machine.ts text_diff, a
// file's after another's; each one's head left out, `--- ` and `+++ `
// over its first hunk's `@@`): `+12 -3`, `+40`; none: unchanged
function diff_said(text: string): string {
  const lines = text.split("\n");
  const head_at = (k: number) => lines[k]?.startsWith("--- ") === true && lines[k + 1]?.startsWith("+++ ") === true && lines[k + 2]?.startsWith("@@") === true;
  let [adds, dels] = [0, 0];
  for (const [k, l] of lines.entries()) {
    const head = head_at(k) || head_at(k - 1);
    adds += !head && l.startsWith("+") ? 1 : 0;
    dels += !head && l.startsWith("-") ? 1 : 0;
  }
  const said = [adds > 0 ? "+" + adds : "", dels > 0 ? "-" + dels : ""].filter((x) => x !== "");
  return said.length === 0 ? "unchanged" : said.join(" ");
}

// any tool's input: its short values as arguments, the rest in blocks
function input_shown(input: Input): Shown {
  const keys   = Object.keys(input);
  const args   : string[] = [];
  const blocks : Md.Code[] = [];
  for (const k of keys) {
    const v    = input[k];
    const json = JSON.stringify(v);
    const word = typeof v !== "string" || /^[^\s"\\]*$/.test(v);
    if (json.length <= SHORT && word) {
      args.push(json);
    } else {
      const x = typeof v === "string" ? v : JSON.stringify(v, null, 2);
      blocks.push({ $: "Code", k: keys.length > 1 ? k : "", x });
    }
  }
  return { head: args.join(" "), blocks };
}

// a text as a block ([]: none)
function text_block(x: unknown): Md.Code[] {
  return typeof x === "string" && x !== "" ? [{ $: "Code", k: "", x: x.replace(/\n$/, "") }] : [];
}

// a to-do list: how many of its items are done, each item marked by
// how it stands (GLYPH), in a block
function todo_shown(items: unknown): Shown {
  const list = Array.isArray(items) ? items.filter((x) => typeof x?.text === "string") : [];
  const mark = (s: unknown) => (s === "done" ? GLYPH.done : s === "active" ? GLYPH.active : GLYPH.pending);
  const done = list.filter((x) => x.status === "done").length;
  return { head: list.length === 0 ? "cleared" : done + " of " + list.length + " done", blocks: text_block(list.map((x) => mark(x.status) + " " + x.text).join("\n")) };
}

// the message or line zoom and date name: `#6243`, `#6243+8` (n > 1), an
// agent's name as is
function msg_show(id: unknown, n: unknown): string {
  const many = typeof n === "number" && n > 1 ? "+" + n : "";
  return typeof id === "number" ? "#" + id + many : String(id ?? "");
}

// a spawn's count of tasks, the user's agent they run as, and its effort
// if named
function tasks_show(tasks: unknown, agent: unknown, effort: unknown): string {
  const n = Array.isArray(tasks) ? tasks.length : 0;
  const who = typeof agent === "string" && agent !== "" ? " " + agent : n === 1 ? " agent" : " agents";
  return n + who + (typeof effort === "string" ? " · " + effort : "");
}

// a read's lines, as path:4-7 shows them ("": the whole file)
function lines_show(offset: unknown, limit: unknown): string {
  const from = typeof offset === "number" ? offset : 1;
  const to   = typeof limit === "number" ? String(from + limit - 1) : "";
  return offset === undefined && limit === undefined ? "" : ":" + from + "-" + to;
}

// the files an edit's list names, each once
function edits_files(edits: unknown[]): string {
  const paths = edits.map((e: any) => e?.path).filter((p) => typeof p === "string");
  return [...new Set(paths)].join(", ");
}

// null: no JSON object, nor a prefix of one; `field`: where the input's
// last whole field ends (just after its "{" if none)
function input_parse(text: string): Record<string, unknown> | null {
  const shut: string[] = [];
  let quote = false;
  let esc   = false;
  let field = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      quote = esc || c !== '"';
      esc   = !esc && c === "\\";
    } else if (c === '"') {
      quote = true;
    } else if (c === "{" || c === "[") {
      shut.push(c === "{" ? "}" : "]");
      field = shut.length === 1 ? i + 1 : field;
    } else if (c === "}" || c === "]") {
      shut.pop();
    } else if (c === "," && shut.length === 1) {
      field = i;
    }
  }
  const open = quote ? (esc ? text.slice(0, -1) : text) + '"' : text;
  const full = open.replace(/[\s,]*$/, "") + shut.reverse().join("");
  return object_parse(full) ?? object_parse(text.slice(0, field) + "}");
}

// null: no JSON object
function object_parse(text: string): Record<string, unknown> | null {
  try {
    const x = JSON.parse(text);
    return typeof x === "object" && x !== null && !Array.isArray(x) ? x : null;
  } catch {
    return null;
  }
}
