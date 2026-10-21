// Commands
// ========
// All a person can do here, by group (term_groups, /help), and the commands
// themselves: a /word typed runs one, and, as it's typed, the commands it
// matches show over the input (suggested, the ones run most first among
// those it matches alike); the picker (/agent, /profile,
// /model, /settings), the panes over the chat (/help, /agents, /mcp), the
// pick, the login, the tabs, the blocks, the memory's exports.

import type { Vendor } from "../ai/AskAI.ts";
import { term_clip, term_image } from "./Attach.ts";
import { Chat } from "../chat/Chat.ts";
import { ChatGPT } from "../ai/ChatGPT.ts";
import { json_object } from "../tools/Clip.ts";
import * as config from "../config/Config.ts";
import { Custom, type Command, type Profile, type Skill } from "../config/Custom.ts";
import { term_redraw } from "./Frame.ts";
import { term_away, term_clear, term_cycle, term_enter, term_esc, term_next, term_page, term_shots, term_take, term_verbose } from "./Keys.ts";
import { Mcp, type Server } from "../tools/Mcp.ts";
import { Memory } from "../chat/Memory.ts";
import { term_note, term_notify, term_unnote, term_unnotify, type Notice } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import { term_palette } from "./Palette.ts";
import { type Model, type Move, Pick } from "../ai/Pick.ts";
import { term_profile } from "./ProfileCommands.ts";
import * as Reply from "../ui/Reply.ts";
import * as Screen from "../ui/Screen.ts";
import { term_set, term_settings } from "./Settings.ts";
import { term_tokens } from "./Side.ts";
import { term_act, term_idle, term_primaries, term_send, term_unhint, type Chooser, type Cmd, type Sug, type Term } from "./Term.ts";
import * as View from "../ui/View.ts";

// how long the login's code shows: as long as it is good (ms), or till
// the login ends; how long its failure shows, till Esc or a message
const LOGIN        = 15 * 60000;
const LOGIN_FAILED = 60000;

// the pick's moves by Shift and an arrow
const ARROWS: Record<string, Move> = { "Shift+Left": "prev", "Shift+Right": "next", "Shift+Up": "up", "Shift+Down": "down" };

// how often each command was run, by its /word: the root's, every
// profile's; kept KEEP after the last run (ms)
const USED_FILE = config.ROOT + "/used.json";
const KEEP      = 2000;

// the counts, read once, at the first command suggested
let used: Record<string, number> | null = null;
let keep: ReturnType<typeof setTimeout> | undefined;

// all a person can do here, by group (the editing keys are Screen's);
// with `custom`, the user's commands and skills too (read anew: never at
// each key; a command wins a skill's name)
export function term_groups(custom = false): [group: string, cmds: Cmd[]][] {
  const cmds   = custom ? Custom.commands(process.cwd()) : [];
  const skills = custom ? Custom.skills(process.cwd()).filter((s) => !cmds.some((c) => c.name === s.name)) : [];
  const yours  = [
    ...cmds.map((c): Cmd => ["/" + c.name + " [...]", "", c.description || "your command (" + c.file + ")", (t, a) => term_custom(t, c, a, "/" + c.name)]),
    ...skills.map((s): Cmd => ["/" + s.name + " [...]", "", (!s.sticky ? "skill: " : config.config_sticky(s.name) ? "sticky skill, on: " : "sticky skill, off: ") + (s.description || s.dir), (t, a) => term_skill(t, s, a, "/" + s.name)]),
  ];
  return [
    ["Chat", [
      ["",                  "Enter",                   "send; on an empty input, interrupt illi",        term_enter],
      ["",                  "Esc",                     "close a list; else clear the notes, and twice: interrupt illi (agents go on)", term_esc],
      ["",                  "Ctrl+C",                  "clear the input; on an empty one, interrupt illi (again: quit)", term_clear],
      ["",                  "Ctrl+D",                  "clear the input; on an empty one, quit",         term_clear],
      ["",                  "Tab",                     "take the suggested reply",                       term_take],
      ["",                  "Ctrl+P",                  "all commands and settings in one list, typed to search", term_palette],
      ["/goal <message>",   "",                        "send a goal: illi goes on until it is met",      (t, a) => term_say(t, "/goal " + a)],
      ["/halt",             "",                        "drop the goal; the turn running ends as it would", (t) => term_say(t, "/halt")],
      ["/clear",            "",                        "an empty screen for a new topic; illi still remembers the chat before", (t) => term_say(t, "/clear")],
      ["/compact",          "",                        "summarize all but the last two exchanges, so each turn sends less; the screen keeps them", (t) => term_say(t, "/compact")],
      ["/image <path>",     "",                        "attach an image to the next message (or paste or drop the file)", term_image],
      ["",                  "Alt+V, Ctrl+V",           "attach the clipboard's image (the terminal's own paste brings text)", term_clip],
      ["/open #id",         "",                        "open block #id and keep it open (or click it)",  (t, a) => term_block(t, a, true)],
      ["/close #id",        "",                        "close block #id and keep it closed (or click its top edge)", (t, a) => term_block(t, a, false)],
      ["/fold",             "Ctrl+F",                  "fold the chat into the fewest blocks; again: unfold", term_fold],
      ["",                  "Ctrl+Y",                  "copy illi's last reply (a drag copies the text it covers, a double click a word)", term_copy],
      ["",                  "Ctrl+O",                  "show or hide the work between replies: tools, thinking, agents' reports", term_verbose],
      ["/export",           "",                        "save the memory as ./illi-memory.json",          term_export],
      ["/tree",             "",                        "save the whole memory tree as ./illi-tree.html", term_tree],
      ["",                  "Ctrl+L",                  "draw the screen again",                          term_redraw],
      ["",                  "Ctrl+Z",                  "suspend; fg brings it back",                     (t) => Screen.screen_suspend(t.scr)],
      ["/help",             "",                        "this list",                                      term_help],
    ]],
    ["Scroll", [
      ["",                  "PgUp, PgDn",              "a page up, down (or the wheel); at the end, the chat follows what comes", term_page],
      ["",                  "Ctrl+Home, Ctrl+End",     "the chat's top, its end",                        term_page],
    ]],
    ["Pick", [
      ["",                  "Shift+Left, Shift+Right", "the model before, the next",                     (t, k) => term_move(t, ARROWS[k])],
      ["",                  "Shift+Up, Shift+Down",    "more effort, less",                              (t, k) => term_move(t, ARROWS[k])],
      ["/model [name]",     "",                        "model, effort and speed in one list (Left and Right: effort, Tab: speed); a name: that model", term_model],
      ["/effort [level]",   "",                        "set the effort; no level: lists them",           (t, a) => term_pick(t, "effort", a)],
      ["/speed [speed]",    "",                        "set the speed; no speed: lists them",            (t, a) => term_pick(t, "speed", a)],
    ]],
    ["Agents", [
      ["",                  "Shift+Tab",               "illi runs as the next primary agent (or click one at the side)", term_next],
      ["/agent [name]",     "",                        "illi runs as that primary agent (illi: its own); no name: opens a list", term_agent_set],
      ["/agents",           "",                        "your agents, commands and skills, and where their files go", term_agents],
      ["",                  "Ctrl+PgDn, Ctrl+PgUp",    "the next tab, the one before: the chat's, each subagent's at work", term_cycle],
      ["/tab [name]",       "",                        "go to that agent's tab; no name: lists the tabs", term_tab],
      ["/stop [name]",      "",                        "stop all work, agents too; a name: only that agent", term_stop],
    ]],
    ["Setup", [
      ["/login",            "",                        "sign in to ChatGPT (Plus or Pro) with a code; illi keeps the login and renews it", term_login],
      ["/logout",           "",                        "remove illi's own ChatGPT login (opencode's, if any, is used again)", term_logout],
      ["/settings",         "",                        "all the settings: type to search, Left, Right or Enter change one, Del puts its default back", (t) => term_settings(t)],
      ["/set <key> [value]", "",                       "change a setting (default: back to its default); no value: says what it is", term_set],
      ["/mcp",              "",                        "your MCP servers: their tools, or why one failed", term_mcp],
    ]],
    ["Profiles", [
      ["/profile [name]",   "",                        "switch to that profile (its own chat, on the global setup; one login for all); no name: opens a list to make, rename, export, import or delete one", term_profile],
    ]],
    ...(yours.length === 0 ? [] : [["Yours", yours] as [string, Cmd[]]]),
  ];
}

export function term_commands(custom = false): Cmd[] {
  return term_groups(custom).flatMap(([, cmds]) => cmds);
}

// a command typed (`/name arg`): runs it (pending while it works on);
// false if the text is none
export function term_command(t: Term, text: string): boolean {
  const word = text.trim().split(/\s+/)[0];
  const cmd = word.startsWith("/") ? term_commands(true).find(([use]) => use !== "" && use.split(" ")[0] === word) : undefined;
  if (cmd !== undefined) {
    term_used_one(word);
  }
  const run = cmd?.[3](t, text.trim().slice(word.length).trim());
  if (run instanceof Promise) {
    t.pending += 1;
    run.finally(() => {
      t.pending -= 1;
      term_idle(t);
    });
  }
  return cmd !== undefined;
}

// the commands suggested, kept to the input: opened (all of them read)
// as it becomes a /word, matched again as the word changes (the best
// lit), closed as it is none; null while closed or closed by Esc
export function term_suggest(t: Term): Sug | null {
  const word = Screen.ed_slash(t.scr.ed);
  if (word === null) {
    t.sug = null;
    return null;
  }
  t.sug ??= { cmds: term_commands(true).filter(([use]) => use !== ""), word: "", found: [], at: 0, top: 0, tall: 1, off: null };
  const sug = t.sug;
  if (sug.word !== word) {
    const names = sug.cmds.map(([use]) => use.split(" ")[0].slice(1));
    const count = term_used();
    Object.assign(sug, { word, found: Screen.ed_rank(word.slice(1), names, (k) => count["/" + names[k]] ?? 0), at: 0, top: 0, off: null });
  }
  return sug.off === word ? null : sug;
}

// how often each command was run (USED_FILE), read once
function term_used(): Record<string, number> {
  return (used ??= json_object(USED_FILE) ?? {});
}

// a command run, counted; the counts kept once runs pause (never in the
// way: written in the background, never holding illi open)
function term_used_one(word: string): void {
  const count = term_used();
  count[word] = (count[word] ?? 0) + 1;
  clearTimeout(keep);
  keep = setTimeout(() => void Bun.write(USED_FILE, JSON.stringify(count)).catch(() => {}), KEEP);
  keep.unref?.();
}

// a key to the commands suggested (true: taken): Up and Down move round
// them, Tab fills the one lit in, Enter takes it; Esc closes them till
// the word changes. None matching, they take Esc alone
export function term_suggest_key(t: Term, sug: Sug, key: string): boolean {
  const n    = sug.found.length;
  const move = ({ Up: -1, Down: 1 } as Record<string, number>)[key];
  if (key === "Esc") {
    sug.off = sug.word;
  } else if (n > 0 && move !== undefined) {
    sug.at  = (sug.at + move + n) % n;
    sug.top = Math.max(Math.min(sug.top, sug.at), sug.at - sug.tall + 1);
  } else if (n > 0 && (key === "Tab" || key === "Enter")) {
    term_suggested(t, sug.cmds[sug.found[sug.at].k][0], key === "Enter");
  } else {
    return false;
  }
  return true;
}

// a command suggested (as /help shows how it's typed), taken: run
// (Enter, a click), unless it needs an argument (<path>, #id: not
// [name]); else filled in, a space after it. Its words before the first
// argument go whole
export function term_suggested(t: Term, use: string, run: boolean): void {
  const name = use.split(/ (?=[<[#])/)[0];
  const need = /^ +[^ []/.test(use.slice(name.length));
  Screen.ed_set(t.scr.ed, run && !need ? name : name + " ");
  t.scr.typed = true;
  if (run && !need) {
    term_enter(t);
  }
}

// a pane over the chat, its lines made for the width shown
function term_pane(t: Term, title: string, make: (w: number) => Paint.Line[]): void {
  t.pane   = { title, make, w: 0, lines: [], scroll: 0 };
  t.choose = null;
}

// a pane of markdown, drawn as illi's words are but without a reply's
// copy buttons (a pane is no reply)
function term_pane_text(t: Term, title: string, text: string): void {
  const rows = View.entry_rows(null, "illi", text);
  term_pane(t, title, (w) => {
    Reply.reply_buttons(false);
    try {
      return Paint.rows_lines(rows, w);
    } finally {
      Reply.reply_buttons(t.scr.tty);
    }
  });
}

// the commands and keys by group, in two columns (too narrow for 20
// columns of what one does: how it's typed on a line of its own, what it
// does under it, indented), then the editing keys
function term_help(t: Term): void {
  const groups = term_groups(true);
  term_pane(t, "Help", (w) => {
    const how   = (c: Cmd) => [c[0], c[1]].filter((x) => x !== "").join(", ");
    const left  = Math.max(...groups.flatMap(([, cmds]) => cmds).map((c) => Paint.text_width(how(c)))) + 2;
    const right = w - left;
    const wrap  = (c: Cmd) => Paint.runs_wrap([Paint.Run(c[2])], right, false).map((l, k) => [Paint.Run((k === 0 ? how(c) : "").padEnd(left)), ...l]);
    const under = (c: Cmd) => [...Paint.runs_wrap([Paint.Run(how(c))], w, false), ...Paint.runs_wrap([Paint.Run(c[2])], w - 2, false).map((l) => [Paint.Run("  "), ...l])];
    const row   = (c: Cmd) => (right < 20 ? under(c) : wrap(c));
    const bold  = { ...Paint.INK, b: true };
    const group = ([name, cmds]: [string, Cmd[]]) => [[Paint.Run(name, bold)], ...cmds.flatMap(row), []];
    const edit  = Paint.runs_wrap([Paint.Run(Screen.EDITING)], w, false);
    return [...groups.flatMap(group), [Paint.Run("Editing", bold)], ...edit];
  });
}

// a command of the chat's (/goal, /halt, /clear, /compact) sent as typed;
// from an agent's tab, not sent, the input has it back (term_away)
function term_say(t: Term, text: string): void {
  if (!term_away(t, text.trim())) {
    term_act(t, { $: "Send", text });
  }
}

// the user's command (typed as `word`): its message sent, with the images
// its words name; from an agent's tab, not sent (term_away)
function term_custom(t: Term, cmd: Command, arg: string, word: string): void {
  if (term_away(t, (word + " " + arg).trim())) {
    return;
  }
  if (term_act(t, { $: "Send", text: Custom.expand(cmd, arg), images: term_shots(t, arg) }).length > 0) {
    term_unnote(t);
  }
}

// the user's skill (typed as `word`): illi told to use it, for the words
// after its name. A sticky one is turned on or off by its name alone
// (Custom.stick), on by its name with words, then the words sent
function term_skill(t: Term, skill: Skill, arg: string, word: string): void {
  if (!skill.sticky) {
    return term_custom(t, { name: skill.name, description: "", body: "Use your skill " + skill.name + (arg === "" ? "." : ": $ARGUMENTS"), file: skill.dir }, arg, word);
  }
  const on = config.config_sticky(skill.name);
  if (arg === "" || !on) {
    const why = Custom.stick(skill, !on);
    term_note(t, why ?? (on ? skill.name + " is off." : skill.name + " is on: every reply follows it (" + (Custom.global(skill) ? "global" : config.PROFILE) + "). " + word + " again turns it off."));
    if (why !== null) {
      return;
    }
  }
  if (arg !== "") {
    term_custom(t, { name: skill.name, description: "", body: "$ARGUMENTS", file: skill.dir }, arg, word);
  }
}

// the user's MCP servers: each one's tools, or how it is; the files (none
// yet: where they go)
export function term_mcp(t: Term): void {
  const { servers, trouble, files } = Mcp.status();
  const where  = files.map((f, k) => config.config_home(f) + (files.length === 1 ? "" : k === 0 ? " (every profile)" : " (this profile's)")).join(" or ");
  const server = (s: Server) => "- **" + s.name + "**: " + (s.state === "ready" ? s.own.size + " tools: " + [...s.own.values()].join(", ") : s.state === "starting" ? "starting…" : "failed: " + s.why);
  const text = [
    servers.length === 0 ? "No MCP servers yet. Add them to " + where + ", as Claude Code's mcpServers (illi's docs/customize.md shows the shape); they run from illi's next start." : "MCP servers (their tools are named mcp__<server>__<tool>):", ...servers.map(server),
    ...(trouble === "" ? [] : ["", "The file won't read: " + trouble]),
    ...(servers.length === 0 ? [] : ["", "They are in " + where + ", as Claude Code's mcpServers; illi's docs/customize.md shows the shape. A change there applies at illi's next start."]),
  ];
  term_pane_text(t, "MCP", text.join("\n"));
}

// the user's agents, primary (the main one marked) and subagents, their
// commands and skills, and the dirs of all
function term_agents(t: Term): void {
  const cwd   = process.cwd();
  const agent = (a: Profile) => "- **" + a.name + "**" + (a.name === t.v.agent ? " (main)" : "") + (a.description === "" ? "" : ": " + a.description) + [a.model, a.effort].filter(Boolean).map((x) => " · " + x).join("") + (a.tools === null ? "" : " · tools: " + a.tools.join(", "));
  const cmd   = (c: Command) => "- **/" + c.name + "**" + (c.description === "" ? "" : ": " + c.description);
  const list  = (title: string, xs: string[]) => ["", title + (xs.length === 0 ? ": none yet." : ":"), ...xs];
  const dirs  = (kind: "agents" | "commands" | "skills") => Custom.dirs(cwd, kind).map(config.config_home).join(" or ");
  term_primaries(t);
  const text  = [
    "Main agent: " + (t.v.agent === null ? "illi's own" : t.v.agent) + ". Shift+Tab runs illi as the next primary agent; so does a click at the side, and /agent <name>.",
    ...list("Primary agents (illi runs as them)", t.agents.map(agent)),
    ...list("Subagents (only an agent spawns them)", Custom.subagents(cwd).map(agent)),
    ...list("Commands", Custom.commands(cwd).map(cmd)),
    ...list("Skills (the agent loads one when a task matches; /name asks for it)", Custom.skills(cwd).map((s) => "- **" + s.name + "**" + (s.description === "" ? "" : ": " + s.description))),
    "", "An agent is a markdown file in " + dirs("agents") + " (the project's wins); its mode is primary, subagent, or all (both, the default). A command is one in " + dirs("commands") + ", a skill a folder with a SKILL.md in " + dirs("skills") + ". illi's docs/customize.md shows their shape.",
  ];
  term_pane_text(t, "Agents", text.join("\n"));
}

// the main agent: the primary agent named (illi: illi's own); none opens
// the picker, at the main agent
function term_agent_set(t: Term, arg: string): void {
  if (arg !== "") {
    return term_main(t, arg.toLowerCase() === "illi" ? null : arg);
  }
  term_primaries(t);
  const names = [null, ...t.agents.map((a) => a.name)];
  const about = names.map((_, k) => (k === 0 ? "illi's own, on " + Pick.shown(config.PICK) : t.agents[k - 1].description));
  term_chooser(t, "Agent", names.map((name) => name ?? View.MAIN), about, names.indexOf(t.v.agent), (k) => term_choose(t, names[k]));
}

// the picker opened (closing the pane), at the option marked as now; with
// `more`, a search (typing ranks the names, or each option's hay), what
// else the lit option takes and what the foot says of it (the model
// picker's), what shows at each option's right end, the screen's middle
// as its place and each option's group (the palette's)
export function term_chooser(t: Term, title: string, names: string[], about: string[], here: number, pick: (k: number) => void, more: { find?: boolean; keys?: Chooser["keys"]; foot?: Chooser["foot"]; hay?: string[]; aside?: string[]; middle?: number; heads?: string[] } = {}): void {
  const shown = Screen.ed_rank("", names);
  t.choose = { title, names, about, hay: more.hay, aside: more.aside, middle: more.middle, heads: more.heads, here, pick, find: more.find ? Screen.ed_new() : null, shown, at: Math.max(0, here), top: 0, keys: more.keys ?? (() => false), foot: more.foot ?? (() => ""), ask: null };
  t.pane   = null;
}

// a line asked for in the picker's box (Chooser ask): its title, the hint
// while it is empty, what it starts as, what the foot says, what Enter
// does with it (a reason: the box stays, saying it)
export function term_ask(t: Term, title: string, hint: string, start: string, foot: string, done: (text: string) => string | null): void {
  const find = Screen.ed_new();
  Screen.ed_set(find, start);
  t.choose = { title, names: [], about: [], here: -1, pick: () => {}, find, shown: [], at: 0, top: 0, keys: () => false, foot: () => foot, ask: { hint, done } };
  t.pane   = null;
}

// the picker's search changed: the options it matches, the best lit;
// emptied, all, the one lit before still lit (none: the one marked as
// now)
export function term_chooser_find(c: Chooser): void {
  const was  = c.shown[c.at]?.k ?? c.here;
  const find = c.find?.text ?? "";
  c.shown = Screen.ed_rank(find, c.hay ?? c.names);
  c.at    = find === "" ? Math.max(0, c.shown.findIndex((m) => m.k === was)) : 0;
  c.top   = 0;
}

// the picker's choice: the picker closed, the main agent that one
export function term_choose(t: Term, name: string | null): void {
  t.choose = null;
  if (name !== t.v.agent) {
    term_main(t, name);
  }
}

export function term_main(t: Term, name: string | null): void {
  term_send(t, { $: "main", name });
}

// /login: ChatGPT's device login: its page and code said (the code
// copied), the login kept once the person gives it (in the file `login`
// names, else as illi's own); again, a new code (the last one let go)
async function term_login(t: Term): Promise<void> {
  t.login?.abort();
  const stop = new AbortController();
  t.login = stop;
  let asked: Notice | null = null;
  try {
    const { url, code, done } = await ChatGPT.device(stop.signal);
    Screen.screen_copy(code);
    asked = term_notify(t, "Sign in to ChatGPT: open " + url + " and enter the code " + code + " (copied; it is good for 15 minutes). illi waits for it.", false, LOGIN);
    await done;
    term_unhint(t);
    term_note(t, "Signed in to ChatGPT. illi keeps the login in " + ChatGPT.own() + (config.LOGIN_SET === null ? "" : " (the file `login` names)") + " and renews it there.");
    term_models(t);
  } catch (err: any) {
    if (!stop.signal.aborted) {
      term_notify(t, "Login failed: " + err.message + ".", false, LOGIN_FAILED);
    }
  } finally {
    t.login = t.login === stop ? null : t.login;
    if (asked !== null) {
      term_unnotify(t, asked);
    }
  }
}

// the models ChatGPT lists, learned (ChatGPT.ts models; signed in): a
// new one offered, each one's window known; the chat tells its views
export function term_models(t: Term): void {
  if (config.OFFER.vendors.includes("chatgpt") && ChatGPT.signed()) {
    void ChatGPT.models().then((fresh) => fresh !== null && Chat.change(t.chat));
  }
}

// /logout: illi's own login removed; a file `login` names is left
function term_logout(t: Term): void {
  t.login?.abort();
  if (config.LOGIN_SET !== null) {
    return term_note(t, "illi uses the login in " + config.config_home(config.LOGIN_SET) + " (the login setting): /logout leaves it. /set login default switches back at the next start.");
  }
  const gone = ChatGPT.logout();
  const left = ChatGPT.signed() ? " Now on opencode's login." : " /login signs in again.";
  term_note(t, (gone ? "Signed out of ChatGPT." : "illi has no login of its own.") + left);
}

// stops all that runs, or the agent named; nothing running, says so
function term_stop(t: Term, arg: string): void {
  const name = term_agent(t, arg);
  if (arg === "" && !View.view_running(t.v)) {
    return term_note(t, "Nothing is running.");
  }
  if (arg !== "" && !t.v.agents.includes(name)) {
    term_note(t, "No agent " + arg + " at work.");
    return;
  }
  term_send(t, arg === "" ? { $: "stop" } : { $: "stop", name });
}

// an agent at work whose name starts with arg, else arg
function term_agent(t: Term, arg: string): string {
  return t.v.agents.find((a) => a.toLowerCase().startsWith(arg.toLowerCase())) ?? arg;
}

// the person's choice for block #id or #id+n (its name, View.block_name),
// open or closed, whatever it shows now: it holds until Fold all; the
// chat scrolls to it
function term_block(t: Term, arg: string, open: boolean): void {
  const name = /^#?(\d+)(?:\+(\d+))?$/.exec(arg);
  const id   = Number(name?.[1]);
  const n    = Number(name?.[2] ?? 1);
  if (name === null || block_row(View.view_body(t.v), id, n) === undefined) {
    term_note(t, arg === "" ? "Which block? " + (open ? "/open" : "/close") + " #id, as each block shows it." : "No block " + arg + " here.");
    return;
  }
  term_act(t, { $: open ? "Open" : "Shut", id, n });
  t.find = [id, n];
}

// the row of block #id+n, among rows or inside their boxes
function block_row(rows: View.Row[], id: number, n: number): View.Row | undefined {
  for (const r of rows) {
    if ((r.$ === "Sum" || r.$ === "Box") && r.id === id && r.n === n) {
      return r;
    }
    const inner = r.$ === "Box" ? block_row(r.rows, id, n) : undefined;
    if (inner !== undefined) {
      return inner;
    }
  }
  return undefined;
}

// folds all (shown when the tops come), or unfolds; on an agent's tab,
// says it folds the chat's alone
function term_fold(t: Term): void {
  if (t.v.page !== null) {
    return term_note(t, "Only the chat folds: Ctrl+PgUp goes back to it.");
  }
  term_act(t, { $: "Fold", on: t.v.fold === null });
  t.scroll = 0;
}

// shows an agent's chat, by the start of its name, or the chat's (by
// illi's name or the main agent's); no name lists the tabs
function term_tab(t: Term, arg: string): void {
  const main = [View.MAIN, t.v.agent ?? View.MAIN].some((name) => name.toLowerCase() === arg.toLowerCase());
  if (arg === "") {
    return term_note(t, "Tabs: " + View.view_tabs(t.v).map((tab) => tab.text).join("  "));
  }
  term_act(t, { $: "Goto", name: main ? null : term_agent(t, arg) });
}

// moves the pick one step (a key)
function term_move(t: Term, move: Move): void {
  term_act(t, { $: "Move", move });
}

// /model: the model named, else the model picker
function term_model(t: Term, arg: string): void {
  const rows = Pick.models(t.v.vendors, t.v.models);
  if (arg !== "" || t.v.pick === null || rows.length === 0) {
    return term_pick(t, "model", arg);
  }
  term_model_pick(t, rows);
}

// the model picker: each model offered (its vendor too, if more than one
// is; its window, if known), the pick's marked and lit; the one lit takes
// its effort by Left and Right (stopping at the ends), its speed by Tab
// (round its speeds: one alone stays), the foot saying both; Enter, or a
// click, sets the three as one pick. The effort and speed asked go along
// as another model is lit (one lacking the speed takes its fastest below).
// From another pick than the chat's, the choice goes to `done` (a
// setting's: Settings.ts)
export function term_model_pick(t: Term, rows: Array<[Vendor, Model]>, title = "Model", from = View.view_asked(t.v)!, done = (p: Pick): unknown => term_act(t, { $: "Pick", to: p })): void {
  let want    = from;
  const many  = t.v.vendors.length > 1;
  const vw    = Math.max(...rows.map(([vendor]) => vendor.length));
  const about = rows.map(([vendor, m]) => [many ? vendor.padEnd(vw) : "", m.window === undefined ? "" : term_tokens(m.window) + " context"].filter((x) => x !== "").join("  "));
  const here  = rows.findIndex(([vendor, m]) => vendor === want.vendor && m.label === want.model);
  const pick  = (k: number) => Pick.on(want, rows[k][0], rows[k][1]);
  const keys  = (k: number, key: string) => {
    const move = ({ Left: "down", Right: "up", Tab: "speed" } as Record<string, Move>)[key];
    if (move === undefined) {
      return false;
    }
    const p  = pick(k);
    const to = Pick.move(p, move, t.v) ?? p;
    want = { ...want, effort: to.effort, speed: move === "speed" && Pick.options(p, "speed", t.v).length > 1 ? to.speed : want.speed };
    return true;
  };
  const foot  = (k: number) => {
    const p       = pick(k);
    const efforts = Pick.options(p, "effort", t.v).map(([effort]) => effort);
    const e       = efforts.indexOf(p.effort);
    const speeds  = Pick.options(p, "speed", t.v).length;
    const speed   = speeds < 2 ? "no fast mode" : "Tab speed: " + Pick.speed(p.speed);
    return "effort: " + (e > 0 ? "◂ " : "") + p.effort + (e < efforts.length - 1 ? " ▸" : "") + " · " + speed;
  };
  term_chooser(t, title, rows.map(([, m]) => m.label), about, here, (k) => done(pick(k)), { find: true, keys, foot });
}

// a part of the pick: to the value given (a speed as shown: standard
// is slow), or, none, the values it may take, the pick's marked
function term_pick(t: Term, move: Move, arg: string): void {
  const knob = View.view_pick(t.v).find((k) => k.move === move);
  if (arg !== "" || knob === undefined || t.v.pick === null) {
    term_act(t, { $: "Move", move, to: move === "speed" && arg.toLowerCase() === "standard" ? "slow" : arg });
    return;
  }
  const now   = move === "speed" ? t.v.pick.speed : knob.text;
  const parts = [...new Set(Pick.options(t.v.pick, move, t.v).map(([part]) => part))];
  const list  = parts.map((part) => (move === "speed" ? Pick.speed(part) : part) + (part === now ? " (now)" : ""));
  term_note(t, move[0].toUpperCase() + move.slice(1) + "s: " + list.join(", ") + ". Pick one with /" + move + " <" + move + ">.");
}

// illi's last reply on the tab shown, to the terminal's clipboard
function term_copy(t: Term): void {
  const log  = t.v.page === null ? [...t.v.whole].sort((a, b) => a[0] - b[0]).map(([, e]) => e) : t.v.page.log ?? [];
  const last = log.filter((e) => e.kind === "illi").at(-1);
  if (last === undefined) {
    return term_note(t, "No reply to copy yet.");
  }
  Screen.screen_copy(last.text);
  term_note(t, "Copied the last reply (" + last.text.length + " characters).");
}

// the memory, as JSON
async function term_export(t: Term): Promise<void> {
  const file = process.cwd() + "/illi-memory.json";
  await Bun.write(file, [...Memory.dump(t.chat.mem)].join(""));
  term_note(t, "Your memory is in " + config.config_home(file) + ".");
}

// the memory tree, as a page
async function term_tree(t: Term): Promise<void> {
  const file = process.cwd() + "/illi-tree.html";
  await Bun.write(file, [...Memory.page(t.chat.mem)].join(""));
  term_note(t, "The memory tree is in " + config.config_home(file) + ".");
}
