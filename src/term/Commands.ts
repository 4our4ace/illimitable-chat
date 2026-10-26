// Commands
// ========
// All a person can do here, by group (term_groups, /help), and the commands
// themselves: a /word typed runs one, and, as it's typed, the commands it
// matches show over the input (suggested, the ones run most first among
// those it matches alike), then the settings it matches, as `/set <key>`;
// the picker (/agent, /profile, /model, /settings), the panes over the
// chat (/help, /agents, /mcp), the pick, the login, the tabs, the blocks,
// the memory's exports; the leader (Ctrl+X, as OpenCode's), then a key: a
// shortcut (term_lead), each listed and changed in /shortcuts.

import * as fs from "node:fs";
import type { Vendor } from "../ai/AskAI.ts";
import { term_clip, term_image } from "./Attach.ts";
import { browser_open } from "./Browser.ts";
import { Bundle } from "../config/Bundle.ts";
import { Anthropic } from "../ai/Anthropic.ts";
import { Chat } from "../chat/Chat.ts";
import { ChatGPT } from "../ai/ChatGPT.ts";
import { json_object } from "../tools/Clip.ts";
import * as config from "../config/Config.ts";
import * as Draw from "../ui/Draw.ts";
import { Custom, type Command, type Profile, type Skill } from "../config/Custom.ts";
import { term_redraw } from "./Frame.ts";
import { term_away, term_clear, term_cycle, term_enter, term_esc, term_next, term_page, term_shots, term_take, term_verbose } from "./Keys.ts";
import { Mcp } from "../tools/Mcp.ts";
import * as Md from "../ui/Md.ts";
import { ClaudeCode, type Theirs } from "../ai/ClaudeCode.ts";
import { Export } from "../chat/Export.ts";
import { Plugins, type Command as Plugged, type Found } from "../config/Plugins.ts";
import { Hooks, type Entry } from "../config/Hooks.ts";
import { term_note, term_notify, term_toast, term_unnote, term_unnotify, type Notice } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import { term_palette } from "./Palette.ts";
import { type Model, type Move, Pick } from "../ai/Pick.ts";
import { term_mode, term_permissions } from "./PermCommands.ts";
import { term_profile } from "./ProfileCommands.ts";
import { term_projects } from "./ProjectCommands.ts";
import * as Reply from "../ui/Reply.ts";
import * as Screen from "../ui/Screen.ts";
import { setting_on, setting_toggle, setting_value, term_set, term_settings } from "./Settings.ts";
import { Trusted } from "../config/Trusted.ts";
import { term_age, term_tokens } from "./Side.ts";
import { term_act, term_idle, term_primaries, term_send, term_unhint, type Chooser, type Cmd, type Sug, type Term } from "./Term.ts";
import * as View from "../ui/View.ts";

// how long the login's code shows: as long as it is good (ms), or till
// the login ends; how long its failure shows, till Esc or a message
const LOGIN        = 15 * 60000;
const LOGIN_FAILED = 60000;

// the pick's moves by Shift and an arrow
const ARROWS: Record<string, Move> = { "Shift+Left": "prev", "Shift+Right": "next", "Shift+Up": "up", "Shift+Down": "down" };

// the shortcuts' list's title (term_shortcuts)
const LEAD = "Shortcuts";

// the most lines /mcp's lit server shows of its tools (… past them)
const MCP_DETAIL = 4;

// the /model gauge: a model's auto compact as set (as written), its
// tokens, the most it may be, the model's window; the gauge's bar at most
// GAUGE columns, stepped STEP points of the window
type Gauge = { set: string; tokens: number; most: number; window: number };
const GAUGE = 20;
const STEP  = 5;

// how often each was used, by its name, in a file of the root's (every
// profile's, every illi's): its counts, read once, as first needed (a
// use, the order of the commands suggested, Ctrl+P's); the
// uses since, kept KEEP after the last (ms), played over the file as it
// is then (term_tally_keep); a use weighs half as much HALF uses on (old
// habits fade), and a name weighing under GONE is forgotten (the file
// holds what's used, never what was)
type Tally = { file: string; count: Record<string, number> | null; uses?: string[]; keep?: ReturnType<typeof setTimeout> };
const KEEP = 2000;
const HALF = 100;
const FADE = 0.5 ** (1 / HALF);
const GONE = 0.1;

// the commands typed, by /word (their suggestions rank by it), and
// apart, the palette's rows picked (Ctrl+P's search ranks by it)
export const USED: Tally = { file: config.ROOT + "/used.json", count: null };
export const PICKED: Tally = { file: config.ROOT + "/picked.json", count: null };

// a command or skill of the user's or a plugin's, as / takes it: its
// word, its plugin's winner's other name (plugin:name; null: none)
type Yours = { word: string; also: string | null; command: Command | null; skill: Skill | null };

// all a person can do here, by group (the editing keys are Screen's);
// with `custom`, the user's commands and skills too, theirs and the
// plugins' (read anew: never at each key; term_yours), then the plugins'
// code's commands (Plugins.ts), but those a command before them names
export function term_groups(custom = false): [group: string, cmds: Cmd[]][] {
  const groups: [group: string, cmds: Cmd[]][] = [
    ["Chat", [
      ["",                  "Enter",                   "send",                                           term_enter],
      ["",                  "Esc",                     "close a list; else clear the notes, and twice: stop illi and its subagents (background jobs go on)", term_esc],
      ["",                  "Ctrl+C",                  "clear the input; on an empty one, stop illi and its subagents (again: quit)", term_clear],
      ["",                  "Ctrl+D",                  "clear the input; on an empty one, quit",         term_clear],
      ["",                  "Tab",                     "take the suggested reply",                       term_take],
      ["",                  "Ctrl+P",                  "all commands and settings in one list, typed to search", term_palette],
      ["",                  config.LEADER,             "the leader: the screen greys, and the next key runs its shortcut (/shortcuts lists them)", term_lead],
      ["/goal <message>",   "",                        "send a goal: illi goes on until it is met",      (t, a) => term_say(t, "/goal " + a)],
      ["/halt",             "",                        "drop the goal; the turn running ends as it would", (t) => term_say(t, "/halt")],
      ["/clear",            "",                        "start a new topic: the chat before is kept and looked up when needed, not sent", (t) => term_say(t, "/clear")],
      ["/compact [focus]",  "",                        "illi writes a recap of the chat and goes on from it alone (the chat before is kept and looked up when needed, not sent); focus: what the recap should keep", (t, a) => term_say(t, ("/compact " + a).trim())],
      ["/image <path>",     "",                        "attach an image to the next message (or paste or drop the file)", term_image],
      ["",                  "Alt+V, Ctrl+V",           "attach the clipboard's image (the terminal's own paste brings text)", term_clip],
      ["/open #id",         "",                        "open block #id, or a run's call #id, and keep it open (or click it)",  (t, a) => term_block(t, a, true)],
      ["/close #id",        "",                        "close block #id, or a run's call #id, and keep it closed (or click anywhere in its frame, or the call's line)", (t, a) => term_block(t, a, false)],
      ["/fold",             "Ctrl+F",                  "fold the chat into the fewest blocks; again: unfold", term_fold],
      ["",                  "Ctrl+Y",                  "copy illi's last reply (a drag copies the text it covers, a double click a word)", term_copy],
      ["",                  "Ctrl+O",                  "show or hide the work between replies: every call open, thinking, agents' reports", term_verbose],
      ["/export",           "",                        "save this project's memory as ./illi-memory.json",          term_export],
      ["/tree",             "",                        "save this project's whole memory tree as ./illi-tree.html", term_tree],
      ["",                  "Ctrl+L",                  "draw the screen again",                          term_redraw],
      ["",                  "Ctrl+Z",                  "back to the shell, illi's work going on; fg brings it back", (t) => Screen.screen_suspend(t.scr)],
      ["/help",             "",                        "this list",                                      term_help],
    ]],
    ["Scroll", [
      ["",                  "PgUp, PgDn",              "half a page up, down (or the wheel); at the end, the chat follows what comes", term_page],
      ["",                  "Ctrl+Home, Ctrl+End",     "the chat's top, its end",                        term_page],
    ]],
    ["Pick", [
      ["",                  "Shift+Left, Shift+Right", "the model before, the next",                     (t, k) => term_move(t, ARROWS[k])],
      ["",                  "Shift+Up, Shift+Down",    "more effort, less",                              (t, k) => term_move(t, ARROWS[k])],
      ["/model [name]",     "",                        "model, effort, speed and auto compact in one list (Left and Right: effort, Tab: speed, Shift+Left and Shift+Right: auto compact); a name: that model", term_model],
      ["/effort [level]",   "",                        "set the effort; no level: lists them",           (t, a) => term_pick(t, "effort", a)],
      ["/autocompact [value]", "",                     "how much of the chat a turn sends before older messages fold, for the chat's model: a share of its window (50%), a size (300k) or default; no value: says it", term_autocompact],
    ]],
    ["Agents", [
      ["",                  "Shift+Tab",               "illi runs as the next primary agent (or click one at the side)", term_next],
      ["/agent [name]",     "",                        "illi runs as that primary agent (illi: its own); no name: opens a list", term_agent_set],
      ["/agents",           "",                        "your agents, commands, skills and plugins, and where their files go", term_agents],
      ["",                  "Ctrl+PgDn, Ctrl+PgUp",    "the next tab, the one before: the chat's, each subagent's at work", term_cycle],
      ["/tab [name]",       "",                        "go to that agent's tab; no name: lists the tabs", term_tab],
      ["/stop [name]",      "",                        "stop all work, agents too; a name: only that agent", term_stop],
      ["/background",       "",                        "the background jobs: what a shell call left running (a dev server, a watcher); Enter or Del stops one", term_background],
    ]],
    ["Setup", [
      ["/login",            "",                        "sign in to ChatGPT (Plus or Pro) with a code, its page opened in your browser; illi keeps the login and renews it", term_login],
      ["/logout",           "",                        "remove illi's own ChatGPT login (opencode's, if any, is used again)", term_logout],
      ["/settings",         "",                        "all the settings: type to search, Left, Right or Enter change one, Del puts its default back", (t) => term_settings(t)],
      ["/shortcuts",        "",                        "the leader and its shortcuts: Enter changes one, Del puts illi's back (or drops it), the last row adds one", (t) => term_shortcuts(t)],
      ["/set <key> [value]", "",                       "change a setting (default: back to its default); no value: /settings at it. / finds each setting by its key or what it does", term_set],
      ["/mcp",              "",                        "your MCP servers and, on claude-code, Claude Code's: on or off, their tools, or why one failed", term_mcp],
      ["/mode [mode]",      "",                        "what runs without asking, this session: auto, careful, ask, read-only or yolo; no mode: opens a list (or click it on the bottom line)", term_mode],
      ["/permissions",      "",                        "the requests refused (Enter allows one again, this session), the grants kept (Del removes one), your rules", (t) => term_permissions(t)],
    ]],
    ["Projects and profiles", [
      ["/projects",         "",                        "your projects, each a git repo with its own chat (outside any: home), this one first: Enter says more, Del forgets one", term_projects],
      ["/profile [name]",   "",                        "switch to that profile (its own chats, on the global setup; one login for all); no name: opens a list to make, rename, export, import or delete one", term_profile],
    ]],
  ];
  const mine  = (custom ? term_yours(term_builtin(groups)) : []).map(({ word, also, command: c, skill: s }): Cmd => (c !== null
    ? ["/" + word + " [...]", "", c.description || (c.plugin == null ? "your command (" : "plugin " + c.plugin + "'s command (") + c.file + ")", (t, a) => term_custom(t, c, a, "/" + word), also ?? undefined, c.description]
    : ["/" + word + " [...]", "", (!s!.sticky ? "skill: " : config.config_sticky(s!.name) ? "sticky skill, on: " : "sticky skill, off: ") + (s!.description || s!.dir), (t, a) => term_skill(t, s!, a, "/" + word), also ?? undefined, s!.description]));
  const taken = new Set([...groups.flatMap(([, own]) => own), ...mine].map(([use]) => use.split(" ")[0]));
  const plugs = (custom ? Plugins.commands() : []).filter((c) => !taken.has("/" + c.name)).map((c): Cmd => ["/" + c.name + " [...]", "", c.about || "plugin " + c.plugin + "'s command", (t, a) => term_plugged(t, c, a), undefined, c.about]);
  const yours = [...mine, ...plugs];
  return [...groups, ...(yours.length === 0 ? [] : [["Yours", yours] as [string, Cmd[]]])];
}

export function term_commands(custom = false): Cmd[] {
  return term_groups(custom).flatMap(([, cmds]) => cmds);
}

// each setting as / suggests it, by its key: `/set <key> [value]`, what
// it is and its value now (Enter: /settings at it; Tab: its value next)
function term_setting_rows(): [key: string, cmd: Cmd][] {
  return (Object.keys(config.SETTINGS) as config.Key[]).map((key) => {
    const what = config.SETTINGS[key].what;
    return [key, ["/set " + key + " [value]", "", what + " (now " + setting_value(key) + ")", term_set, undefined, what]];
  });
}

// a plugin's command, on the words after its name: what it answers, a
// note
async function term_plugged(t: Term, cmd: Plugged, arg: string): Promise<void> {
  const said = await cmd.run(arg);
  if (said !== "") {
    term_note(t, said);
  }
}

// a command (`/name arg`): runs it (pending while it works on), counted
// if typed (not: the palette's, which keeps its own); false if the text
// is none
export function term_command(t: Term, text: string, typed = true): boolean {
  const word = text.trim().split(/\s+/)[0];
  const all = word.startsWith("/") ? term_commands(true) : [];
  const cmd = all.find(([use]) => use !== "" && use.split(" ")[0] === word) ?? all.find(([, , , , also]) => also !== undefined && "/" + also.toLowerCase() === word.toLowerCase());
  if (cmd !== undefined && typed) {
    term_tally_one(USED, word);
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
// lit; by name, and by what each does: Screen.ed_find), then the
// settings (by key: term_setting_rows), once a word is typed; closed as
// it is none; null while closed or closed by Esc. A /word mid-message: the
// user's skills alone (no command runs there), by name only (a path
// would find what they do), none shown till one matches
export function term_suggest(t: Term): Sug | null {
  const slash = Screen.ed_slash(t.scr.ed);
  const mid   = slash === null || slash.word === t.scr.ed.text ? null : slash.from;
  if (slash === null || (t.sug !== null && (t.sug.mid === null) !== (mid === null))) {
    t.sug = null;
  }
  if (slash === null) {
    return null;
  }
  if (t.sug === null) {
    const skills = mid === null ? [] : term_skills().map((y) => "/" + y.word);
    const cmds   = term_commands(true).filter(([use]) => use !== "" && (mid === null || skills.includes(use.split(" ")[0])));
    const sets   = mid === null ? term_setting_rows() : [];
    t.sug = { cmds: [...cmds, ...sets.map(([, cmd]) => cmd)], names: [...cmds.map(([use]) => use.split(" ")[0].slice(1)), ...sets.map(([key]) => key)], commands: cmds.length, word: "", found: [], at: 0, top: 0, tall: 1, off: null, mid };
  }
  const sug  = t.sug;
  const word = slash.word;
  sug.mid    = mid;
  if (sug.word !== word) {
    const hays  = sug.cmds.map(([, , text, , , said]) => (mid === null ? Paint.text_clean(said ?? text) : undefined));
    const count = term_tally(USED);
    const found = Screen.ed_find(word.slice(1), sug.names, hays, (k) => (k < sug.commands ? count["/" + sug.names[k]] ?? 0 : 0));
    const sets  = word === "/" ? [] : found.filter((m) => m.k >= sug.commands);
    Object.assign(sug, { word, found: [...found.filter((m) => m.k < sug.commands), ...sets], at: 0, top: 0, off: null });
  }
  return sug.off === word || (mid !== null && sug.found.length === 0) ? null : sug;
}

// the names illi's own commands take (groups: as term_groups has them,
// if made already), without their /
function term_builtin(groups: [group: string, cmds: Cmd[]][] = term_groups()): Set<string> {
  return new Set(groups.flatMap(([, cmds]) => cmds).filter(([use]) => use !== "").map(([use]) => use.split(" ")[0].slice(1).toLowerCase()));
}

// the commands and skills / takes, by origin: the user's commands, their
// skills (illi's own among them), the plugins' commands, the plugins'
// skills (in each kind, one a part before it hides is plugin:name
// already: Custom.parts); the first of a name, in any case, takes it
// from those after: a plugin's is then plugin:name, one of the user's is
// left out (a command over a skill), and none takes the name of one of
// illi's own commands (taken). A plugin's that keeps its name answers to
// plugin:name too
function term_yours(taken: Set<string>): Yours[] {
  const cwd    = process.cwd();
  const cmds   = Custom.commands(cwd);
  const skills = Custom.skills(cwd);
  const all: Yours[] = [
    ...cmds.filter((c) => c.plugin == null).map((c) => ({ word: c.name, also: null, command: c, skill: null })),
    ...skills.filter((s) => s.plugin == null).map((s) => ({ word: s.name, also: null, command: null, skill: s })),
    ...cmds.filter((c) => c.plugin != null).map((c) => ({ word: c.name, also: c.plugin + ":" + c.own, command: c, skill: null })),
    ...skills.filter((s) => s.plugin != null).map((s) => ({ word: s.name, also: s.plugin + ":" + s.own, command: null, skill: s })),
  ];
  return all.flatMap((y): Yours[] => {
    const word = y.word.toLowerCase();
    if (!taken.has(word)) {
      taken.add(word);
      return [{ ...y, also: y.also?.toLowerCase() === word ? null : y.also }];
    }
    if (y.also === null || taken.has(y.also.toLowerCase())) {
      return [];
    }
    taken.add(y.also.toLowerCase());
    return [{ ...y, word: y.also, also: null }];
  });
}

// the skills / takes (term_yours)
function term_skills(): Yours[] {
  return term_yours(term_builtin()).filter((y) => y.skill !== null);
}

// a message's skills named in it, each a /name (a plugin's as
// /plugin:name too) as a word after a space or a line's start (Use the
// /imagegen skill to…): illi told to use them, in a line after it, as a
// /name that starts a message tells it (term_skill)
export function term_named(text: string): string {
  const skills = term_skills().flatMap((y) => [y.word, ...(y.also === null ? [] : [y.also])]);
  const named  = [...new Set([...text.matchAll(/(?:^|\s)\/([^\s/.,;:!?()]+(?::[^\s/.,;:!?()]+)?)(?=$|[\s.,;:!?)])/g)].map((m) => m[1]))].filter((name) => skills.includes(name));
  return named.length === 0 ? text : text + "\n\nUse your skill" + (named.length === 1 ? " " : "s ") + named.join(", ") + ".";
}

// a tally's counts, read once
export function term_tally(tally: Tally): Record<string, number> {
  return (tally.count ??= json_object(tally.file) ?? {});
}

// one more use counted, and queued to keep once uses pause (the timer
// never holds illi open)
export function term_tally_one(tally: Tally, name: string): void {
  tally_use(term_tally(tally), name);
  (tally.uses ??= []).push(name);
  clearTimeout(tally.keep);
  tally.keep = setTimeout(() => term_tally_keep(tally), KEEP);
  tally.keep.unref?.();
}

// a tally's queued uses played over its file as it is now, so another
// illi's uses kept meanwhile stay; written whole beside it, to a
// thousandth, then moved over it (no reader sees half a file), and taken
// as the counts here too. Never in the way: a failure keeps nothing (nor
// the file beside)
export function term_tally_keep(tally: Tally): void {
  const uses = tally.uses ?? [];
  const temp = tally.file + "." + process.pid;
  tally.uses = [];
  try {
    const count = json_object(tally.file) ?? {};
    for (const name of uses) {
      tally_use(count, name);
    }
    fs.writeFileSync(temp, JSON.stringify(count, (_, n) => (typeof n === "number" ? Math.round(n * 1000) / 1000 : n)));
    fs.renameSync(temp, tally.file);
    tally.count = count;
  } catch {
    fs.rmSync(temp, { force: true });
  }
}

// one more use of a name, the others faded (one under GONE, or no
// number, gone)
function tally_use(count: Record<string, number>, name: string): void {
  for (const k of Object.keys(count)) {
    count[k] *= FADE;
    if (!(count[k] >= GONE)) {
      delete count[k];
    }
  }
  count[name] = (count[name] ?? 0) + 1;
}

// a key to the commands suggested (true: taken): Up and Down move round
// them, Tab fills the one lit in, Enter takes it (one found only by what
// it does, filled in, so a second Enter runs what shows); Esc closes them
// till the word changes. None matching, they take Esc alone
export function term_suggest_key(t: Term, sug: Sug, key: string): boolean {
  const n    = sug.found.length;
  const move = ({ Up: -1, Down: 1 } as Record<string, number>)[key];
  if (key === "Esc") {
    sug.off = sug.word;
  } else if (n > 0 && move !== undefined) {
    sug.at  = (sug.at + move + n) % n;
    sug.top = Math.max(Math.min(sug.top, sug.at), sug.at - sug.tall + 1);
  } else if (n > 0 && (key === "Tab" || key === "Enter")) {
    const lit = sug.found[sug.at];
    term_suggested(t, sug.cmds[lit.k][0], key === "Enter" && lit.hay !== true);
  } else {
    return false;
  }
  return true;
}

// a command suggested (as /help shows how it's typed), taken: run
// (Enter, a click), unless it needs an argument (<path>, #id: not
// [name]); else filled in, a space after it. Its words before the first
// argument go whole. A skill's mid-message: its name filled in, there
export function term_suggested(t: Term, use: string, run: boolean): void {
  const mid = t.sug?.mid ?? null;
  if (mid !== null) {
    const ed   = t.scr.ed;
    const name = use.split(" ")[0] + " ";
    ed.text    = ed.text.slice(0, mid) + name + ed.text.slice(ed.pos).replace(/^ /, "");
    ed.pos     = mid + name.length;
    t.scr.typed = true;
    return;
  }
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
export function term_pane_text(t: Term, title: string, text: string): void {
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

// a sticky skill turned on or off (Custom.stick), said (again: what
// turns it off once on); why it wasn't (null: it was)
export function term_stick(t: Term, skill: Skill, on: boolean, again: string): string | null {
  const why = Custom.stick(skill, on);
  term_note(t, why ?? (on ? skill.name + " is on: every reply follows it (" + (Custom.global(skill) ? "global" : config.PROFILE) + "). " + again + " turns it off." : skill.name + " is off."));
  return why;
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
    if (term_stick(t, skill, !on, word + " again") !== null) {
      return;
    }
  }
  if (arg !== "") {
    term_custom(t, { name: skill.name, description: "", body: "$ARGUMENTS", file: skill.dir }, arg, word);
  }
}

// the MCP servers, illi's own (where each is from: a plugin, a file;
// one `off` names, not started, too), then, while the pick is on
// claude-code, Claude Code's as its last call told them (term_theirs),
// each how it is (term_mcp_state) and on or off (setting_on); the lit
// one's tools under them, or why it failed, or the login it needs;
// Enter, Left or Right turns it off or on (setting_toggle: `off`; illi's
// own at the next start, Claude Code's from the next call; by name, so
// one of each so named together); the files
// that won't read after them. None of either: where the user's go (none
// there yet: config.MCPS), and, claude-code offered, that Claude Code's
// own show while the pick is on it, once a call has loaded them. `at`:
// the server lit, illi's or Claude Code's (cc: a click on one at the
// side)
export function term_mcp(t: Term, at = "", cc = false): void {
  const { servers, troubles, files } = Mcp.status();
  const idle   = Object.entries(Mcp.read(process.cwd(), true)).filter(([name]) => config.config_off(name) && !servers.some((s) => s.name === name));
  const theirs = term_theirs(t);
  const where  = files.map((f, k) => config.config_home(f) + (files.length === 1 ? "" : k === 0 ? " (every profile)" : " (this profile's)")).join(" or ");
  const from   = (s: { plugin: string | null; file: string }) => (s.plugin !== null ? "plugin " + s.plugin : config.config_home(s.file));
  if (servers.length === 0 && idle.length === 0 && theirs.length === 0) {
    const later = t.v.vendors.includes("claude-code") ? " Claude Code's own servers show here while the pick is on claude-code, once a call has loaded them." : "";
    const text  = ["No MCP servers yet. Add them to " + where + ", as Claude Code's mcpServers (illi's docs/customize.md shows the shape); they run from illi's next start." + later, ...(troubles.length === 0 ? [] : ["", "Won't read:", ...troubles.map((x) => "- " + x)])];
    return term_pane_text(t, "MCP", text.join("\n"));
  }
  const tools = (names: string[]) => (names.length === 0 ? "no tools" : names.join(", "));
  // `off` holds names: one of illi's and one of Claude Code's so named
  // go off and on together, as each one's foot says
  const twin  = (name: string, cc: boolean) => (cc ? [...servers.map((s) => s.name), ...idle.map(([n]) => n)] : theirs.map((s) => s.name)).some((n) => n.toLowerCase() === name.toLowerCase());
  const own   = (name: string) => "Enter on/off · at the next start" + (twin(name, false) ? ", Claude Code's of this name too" : "");
  const rows: Array<{ name: string; about: string; head: string; detail: string; foot: string }> = [
    ...servers.map((s) => ({
      name   : s.name,
      about  : term_mcp_state(s.state === "ready" ? "connected" : s.state, s.own.size) + " · " + from(s),
      head   : "illi's",
      detail : s.state === "ready" ? tools([...s.own.values()]) : s.state === "failed" ? "failed: " + s.why : "",
      foot   : own(s.name),
    })),
    ...idle.map(([name, f]) => ({ name, about: "not started · " + from(f), head: "illi's", detail: "", foot: own(name) })),
    ...theirs.map((s) => ({
      name   : s.name,
      about  : s.over ? "illi's own " + s.name + " in its place" : term_mcp_state(s.status, s.tools?.length ?? null),
      head   : "Claude Code's, as last told",
      detail : s.over ? "illi's calls use illi's own server of this name instead, so the model gets one copy" : s.status === "needs-auth" ? "Claude Code needs a login to it: claude mcp login \"" + s.name + "\"" : s.status !== "connected" || s.tools === null ? "" : tools(s.tools.map((x) => x.slice(("mcp__" + ClaudeCode.spell(s.name) + "__").length))),
      foot   : "Enter on/off in illi's calls · from the next call" + (twin(s.name, true) ? ", illi's own of this name too at the next start" : ""),
    })),
    ...troubles.map((x) => ({ name: x, about: "", head: "Won't read", detail: "", foot: "read again at the next start" })),
  ];
  const named  = servers.length + idle.length + theirs.length;
  const aside  = () => rows.map((r, k) => (k < named ? setting_on(r.name) : ""));
  const detail = (k: number, w: number) => {
    const lines = rows[k].detail === "" ? [] : Paint.runs_wrap([Paint.Run(rows[k].detail, Paint.DIM)], Math.max(2, w), false);
    return lines.length <= MCP_DETAIL ? lines : [...lines.slice(0, MCP_DETAIL - 1), [...Paint.line_cut(lines[MCP_DETAIL - 1], 0, Math.max(1, w - 1))[1], Paint.Run("…", Paint.DIM)]];
  };
  const keys   = (k: number, press: string) => {
    if (!["Enter", "Left", "Right"].includes(press)) {
      return false;
    }
    if (k < named && setting_toggle(t, rows[k].name) && t.choose !== null) {
      t.choose.aside = aside();
    }
    return true;
  };
  term_chooser(t, "MCP servers", rows.map((r) => r.name), rows.map((r) => r.about), -1, () => {}, { find: true, keys, foot: (k) => rows[k].foot, detail, aside: aside(), heads: rows.map((r) => r.head) });
  const lit = rows.findIndex((r, k) => r.name === at && (k >= servers.length + idle.length) === cc && k < named);
  if (lit >= 0 && t.choose !== null) {
    t.choose.at = Math.max(0, t.choose.shown.findIndex((m) => m.k === lit));
  }
}

// Claude Code's own MCP servers as /mcp and the side show them: as its
// last call that loaded them told them (ClaudeCode.servers), only while
// the chat's pick (the main agent's) is on claude-code, the one vendor
// whose calls load them; on any other, none, as none of its calls has
// them
export function term_theirs(t: Term): Theirs[] {
  return t.v.pick?.vendor === "claude-code" ? (ClaudeCode.servers() ?? []) : [];
}

// how an MCP server is, in words: connected, its tools counted (once
// told), else failed, starting, or as Claude Code says it (needs-auth: a
// login it needs, disabled: turned off in Claude Code itself)
export function term_mcp_state(state: string, tools: number | null): string {
  switch (state) {
    case "connected"  : return tools === null ? "connected" : tools + (tools === 1 ? " tool" : " tools");
    case "needs-auth" : return "needs a login";
    case "disabled"   : return "off in Claude Code";
    default           : return state;
  }
}

// the background jobs (Machine.ts), each its command, who started it and
// how long it has run; Enter or Del stops the lit one; none: what they
// are
export function term_background(t: Term): void {
  const jobs = t.v.background;
  if (jobs.length === 0) {
    return term_note(t, "No background jobs: a shell call that leaves a process running (a dev server, a watcher) shows here, and it stops when illi quits.");
  }
  const stop = (k: number) => {
    term_send(t, { $: "background", stop: jobs[k].id });
    term_note(t, "Stopped: " + Paint.text_line(jobs[k].command) + ".");
  };
  const keys = (k: number, key: string) => {
    if (key !== "Delete") {
      return false;
    }
    t.choose = null;
    stop(k);
    return true;
  };
  const names = jobs.map((j) => Paint.text_line(j.command));
  const about = jobs.map((j) => j.agent + " · " + term_age(Date.now() - j.since));
  term_chooser(t, "Background jobs", names, about, -1, stop, { keys, foot: () => "Enter or Del stop it; all stop when illi quits" });
}

// the user's agents, primary (the main one marked) and subagents (one
// started fresh said so), their commands and skills (as / takes them:
// term_yours), plugins (each one's parts, what illi doesn't use of it,
// what to know; off, or its code failed, said so), folders that look
// meant as plugins and aren't, hooks (all off, said why), and the dirs
// of all; a plugin's part says so
function term_agents(t: Term): void {
  const cwd   = process.cwd();
  const from  = (plugin: string | null | undefined) => (plugin == null ? "" : " (plugin " + plugin + ")");
  const agent = (a: Profile) => ["- **" + a.name + "**" + (a.name === t.v.agent ? " (main)" : "") + from(a.plugin) + (a.description === "" ? "" : ": " + a.description) + [a.model, a.effort, a.fresh ? "fresh" : null].filter(Boolean).map((x) => " · " + x).join("") + (a.tools === null ? "" : " · tools: " + a.tools.join(", ")), ...(a.notes ?? []).map((n) => "  - " + n)];
  const yours = term_yours(term_builtin());
  const about = (description: string) => (description === "" ? "" : ": " + description);
  const list  = (title: string, xs: string[]) => ["", title + (xs.length === 0 ? ": none yet." : ":"), ...xs];
  const dirs  = (kind: "agents" | "commands" | "skills") => Custom.dirs(cwd, kind).map(config.config_home).join(" or ");
  const plugins = Plugins.dirs(cwd, (dir) => Trusted.has(Trusted.folder(dir))).map(config.config_home).join(" or ");
  const line  = (cmd: string) => (cmd.includes("`") ? cmd : "`" + cmd + "`");
  const hook  = (e: Entry) => "- **" + e.event + "**" + (e.match === "" ? "" : " " + e.match) + " · " + line(e.command.replace(/\s+/g, " ").trim()) + " · " + (e.plugin === null ? config.config_home(e.file) : "plugin " + e.plugin);
  const hooks = Hooks.files(cwd, (dir) => Trusted.has(Trusted.folder(dir))).map(config.config_home).join(" or ");
  term_primaries(t);
  const text  = [
    "Main agent: " + (t.v.agent === null ? "illi's own" : t.v.agent) + ". Shift+Tab runs illi as the next primary agent; so does a click at the side, and /agent <name>.",
    ...list("Primary agents (illi runs as them)", t.agents.flatMap(agent)),
    ...list("Subagents (only an agent spawns them)", Custom.subagents(cwd).flatMap(agent)),
    ...list("Commands", yours.flatMap(({ word, command: c }) => (c === null ? [] : ["- **/" + word + "**" + from(c.plugin) + about(c.description)]))),
    ...list("Skills (the agent loads one when a task matches; /name asks for it)", yours.flatMap(({ word, skill: s }) => (s === null ? [] : ["- **" + word + "**" + from(s.plugin) + about(s.description)]))),
    ...list("Plugins (commands, skills, agents, hooks, MCP servers and code, read as illi starts)", Plugins.found().flatMap(term_plugin)),
    ...(Plugins.misfits().length === 0 ? [] : list("Not plugins (in a plugins folder, though they look meant as one)", Plugins.misfits().map((m) => "- " + config.config_home(m.dir) + ": " + m.why))),
    ...(Hooks.off() !== "" ? ["", "Hooks: off (" + Hooks.off() + ")."] : list("Hooks (shell commands run at what illi does, read as it starts)", Hooks.entries().map(hook))),
    "", "An agent is a markdown file in " + dirs("agents") + " (the project's wins); its mode is primary, subagent, or all (both, the default). A command is one in " + dirs("commands") + ", a skill a folder with a SKILL.md in " + dirs("skills") + ", hooks in " + hooks + ". A plugin is a folder of those (a Claude Code plugin as it is), or a .ts or .js file of code, in " + plugins + "; a plugin's part answers to plugin:name too, and the off setting takes either. illi's docs/customize.md shows their shape.",
  ];
  term_pane_text(t, "Agents", text.join("\n"));
}

// a plugin as /agents lists it: its name, version, what it gives (its
// parts as read now; off: as it was at the start), its folder (a file
// plugin: its file); off, or its code that failed, said so; its
// description; what illi doesn't use of it, what to know, what won't
// read
export function term_plugin(p: Found): string[] {
  const b = p.bundle === null ? null : (Bundle.read(p.dir, p.name, p.scope) ?? p.bundle);
  const n = (count: number, one: string) => (count === 0 ? [] : [count + " " + one + (count === 1 ? "" : "s")]);
  const gives = b === null ? ["code"] : [
    ...(b.code === null ? [] : ["code"]), ...n(b.skills.length, "skill"), ...n(b.commands.length, "command"), ...n(b.agents.length, "agent"),
    ...(b.hooks.length === 0 ? [] : ["hooks"]), ...(b.mcp.length === 0 ? [] : ["MCP servers"]),
  ];
  const state = p.off ? " (off)" : p.file !== "" && !p.runs ? " (its code didn't load: illi.log says why)" : "";
  const head  = "- **" + p.name + "**" + (b?.version ? " " + b.version : "") + state + " · " + [...gives, config.config_home(p.dir || p.file)].join(" · ");
  const more  = b === null ? [] : [
    ...(b.about === "" ? [] : [b.about]),
    ...(b.unused.length === 0 ? [] : ["illi doesn't use its " + b.unused.join(", ")]),
    ...b.notes, ...Bundle.inspect(b), ...b.troubles,
  ];
  return [head, ...more.map((x) => "  - " + x)];
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

// a list's picker opened, a popup (Popup.ts; the pane closed; a
// question at the input waits under it), at the option marked as now;
// with `more`, a search (typing ranks the names, or each option's hay;
// with `used`, the more used first among matches as good), what else the
// lit option takes and what the foot says of it (the model picker's),
// what shows at each option's right end, each option's group (the
// palette's) and the key that opened it, to close it
export function term_chooser(t: Term, title: string, names: string[], about: string[], here: number, pick: (k: number) => void, more: { find?: boolean; keys?: Chooser["keys"]; foot?: Chooser["foot"]; detail?: Chooser["detail"]; hay?: string[]; used?: Chooser["used"]; aside?: string[]; heads?: string[]; key?: string } = {}): void {
  const shown = Screen.ed_rank("", names);
  t.choose = { title, names, about, hay: more.hay, used: more.used, aside: more.aside, heads: more.heads, key: more.key, here, pick, find: more.find ? Screen.ed_new() : null, shown, at: Math.max(0, here), top: 0, keys: more.keys ?? (() => false), foot: more.foot ?? (() => ""), detail: more.detail, ask: null };
  t.pane   = null;
}

// a question's picker opened in the input's place (Question.ts: a
// confirmation, the permission question), in place of the question
// there and of the list that asked it (a pane stays), its first answer
// lit: its title, its answers and what each is, what picking answer k
// does; with `more`, what else a key does on answer k (the permission
// question's Esc), what its rule says of the lit one, the lines leading
// the answers (why it asks, what it would do) and how a long command in
// them folds (Chooser fold)
export function term_question(t: Term, title: string, names: string[], about: string[], pick: (k: number) => void, more: { keys?: Chooser["keys"]; foot?: Chooser["foot"]; lead?: Chooser["lead"]; fold?: Chooser["fold"] } = {}): void {
  t.question = { title, names, about, lead: more.lead, fold: more.fold, answers: true, here: -1, pick, find: null, shown: Screen.ed_rank("", names), at: 0, top: 0, keys: more.keys ?? (() => false), foot: more.foot ?? (() => ""), ask: null };
  t.choose   = null;
}

// the leader pressed (config.LEADER): the screen greys till the next key,
// which runs its shortcut (term_after); nothing else shows, a shortcut is
// found by trying, or in /shortcuts. A list open is closed first, the
// commands suggested too (as Esc would), so the shortcut has the screen;
// a question at the input stays (one the chat asks waits for the
// shortcut: Asks.ts)
export function term_lead(t: Term): void {
  t.choose = null;
  const sug = term_suggest(t);
  if (sug !== null) {
    sug.off = sug.word;
  }
  t.lead = true;
}

// the key after the leader (a character typed, or a key's name): its
// shortcut run; Esc or the leader again, none; a key with none says so
export function term_after(t: Term, key: string): void {
  t.lead = false;
  const run = config.SHORTCUTS[key.toLowerCase()];
  if (key === "Esc" || key === config.LEADER) {
    return;
  }
  if (run === undefined) {
    return term_toast(t, "No shortcut on " + key + " · /shortcuts lists them");
  }
  term_shortcut(t, run);
}

// /shortcuts: the leader, then each key after it and what it runs (one
// of illi's dropped: none), then a row to add one. Enter changes the lit
// one in a line (a key's: what it runs; empty: none); Del puts back what
// the user changed (the leader, one of illi's), else drops the key
export function term_shortcuts(t: Term, at = 0): void {
  const own   = config.OWN_SHORTCUTS;
  const keys  = [...new Set([...Object.keys(config.SHORTCUTS), ...Object.keys(own)])].sort();
  const names = ["leader", ...keys.map((k) => config.LEADER + " " + k), "add one"];
  const about = [
    config.LEADER + " · the key before a shortcut" + (config.LEADER === config.config_def("leader") ? "" : " (illi's: " + config.config_def("leader") + ")"),
    ...keys.map((k) => {
      const run = config.SHORTCUTS[k];
      return run === undefined ? "none · illi's: " + own[k] : run + " · " + term_does(run) + (own[k] !== undefined && own[k] !== run ? " (illi's: " + own[k] + ")" : "");
    }),
    "a key and what it runs, like: c /compact",
  ];
  const edit = (k: number) => {
    const key  = keys[k - 1];
    const back = () => term_shortcuts(t, k);
    if (k === 0) {
      return term_ask(t, "Leader", "Ctrl or Alt and a letter", config.LEADER, "Enter keeps it · Esc", (text) => term_shortcut_set("leader", () => config.config_set("leader", text), back));
    }
    if (k === names.length - 1) {
      return term_ask(t, "Add a shortcut", "a key, a space, then a /command or a key's name", "", "Enter adds it · Esc", (text) => {
        const [ch = "", ...rest] = [...text.trim()];
        const run = rest.join("").trim();
        return ch === "" || run === "" || rest[0] !== " " ? "a key, a space, then what it runs: c /compact" : term_shortcut_set("shortcuts", () => config.config_shortcut(ch, run), back);
      });
    }
    term_ask(t, config.LEADER + " " + key, "a /command with its words, or a key's name; empty: none", config.SHORTCUTS[key] ?? "", "Enter keeps it · Esc", (text) => term_shortcut_set("shortcuts", () => config.config_shortcut(key, text.trim()), back));
  };
  const del = (k: number, name: string) => {
    if (name !== "Delete" || k === names.length - 1) {
      return false;
    }
    const key = keys[k - 1];
    const why = term_shortcut_set(k === 0 ? "leader" : "shortcuts", () => (k === 0 ? config.config_set("leader", null) : config.config_shortcut(key, config.config_shortcut_mine(key) ? null : "")), () => term_shortcuts(t, k));
    if (why !== null) {
      term_note(t, why);
    }
    return true;
  };
  const foot = (k: number) => {
    const key = keys[k - 1];
    return k === names.length - 1 ? "Enter add one" : "Enter change · Del " + (k === 0 || (config.config_shortcut_mine(key) && own[key] !== undefined) ? "illi's" : "drop it");
  };
  term_chooser(t, LEAD, names, about, -1, edit, { keys: del, foot });
  t.choose!.at = Math.min(at, names.length - 1);
}

// a change to the leader or the shortcuts (`key`) made, then `then` (the
// list again); why it won't do instead (one a variable sets, as
// /settings says, else config_check's), kept in the line asked for
function term_shortcut_set(key: config.Key, change: () => void, then: () => void): string | null {
  const env = config.config_env_set(key);
  if (env !== null) {
    return key + " is set by " + env + ", over config.json: unset it to change it here.";
  }
  try {
    change();
  } catch (err: any) {
    return err.message;
  }
  then();
  return null;
}

// what a shortcut does: its command's or key's first clause ("": none such)
function term_does(run: string): string {
  const word = run.split(" ")[0];
  const cmd  = term_commands(true).find(([use, keys]) => (word.startsWith("/") ? use.split(" ")[0] === word : keys.split(", ").includes(run)));
  return cmd === undefined ? "no such command" : cmd[2].replace(/ \([^)]*\)/g, "").split(/[;:] /)[0];
}

// a shortcut run: a /command with its words, as if typed (not counted as
// typed), else a key's name, as if pressed; one that names neither says so
export function term_shortcut(t: Term, run: string): void {
  const cmd = run.startsWith("/") ? undefined : term_commands().find(([, keys]) => keys.split(", ").includes(run));
  if (run.startsWith("/") ? !term_command(t, run, false) : cmd === undefined) {
    return term_note(t, run + " is no command or key of illi's: the shortcuts setting names it.");
  }
  void cmd?.[3](t, cmd[0] === "" ? run : "");
}

// a line asked for, a question in the input's place (Chooser ask;
// Question.ts), in place of the question there and of the list that
// asked it (a pane stays): its title, the hint while it is empty, what it
// starts as, what its rule says, what Enter does with it (a reason: it
// stays, saying it)
export function term_ask(t: Term, title: string, hint: string, start: string, foot: string, done: (text: string) => string | null): void {
  const find = Screen.ed_new();
  Screen.ed_set(find, start);
  t.question = { title, names: [], about: [], here: -1, pick: () => {}, find, shown: [], at: 0, top: 0, keys: () => false, foot: () => foot, ask: { hint, done } };
  t.choose   = null;
}

// the picker's search changed: the options it matches, the best lit
// (with hay, by name and by what each does: Screen.ed_find; each the more
// used first); emptied, all in their order, the one lit before still lit
// (none: the one marked as now)
export function term_chooser_find(c: Chooser): void {
  const was  = c.shown[c.at]?.k ?? c.here;
  const find = c.find?.text ?? "";
  const used = find === "" ? undefined : c.used;
  c.shown = c.hay === undefined ? Screen.ed_rank(find, c.names, used) : Screen.ed_find(find, c.names, c.hay, used);
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
    const until   = Date.now() + LOGIN;
    const opening = t.scr.tty ? browser_open(url) : null;
    const open    = (why: string) => "Sign in to ChatGPT: " + why + "open " + url + " and enter the code " + code + " (copied; it is good for 15 minutes). illi waits for it.";
    asked = term_notify(t, opening === null ? open("") : "Sign in to ChatGPT at " + url + " (opening in your browser) with the code " + code + " (copied; it is good for 15 minutes). illi waits for it.", false, LOGIN);
    void opening?.then((why) => {
      if (why !== "" && t.login === stop && asked !== null) {
        term_unnotify(t, asked);
        asked = term_notify(t, open("your browser didn't open (" + why + "), so "), false, Math.max(0, until - Date.now()));
      }
    });
    await done;
    term_unhint(t);
    term_note(t, "Signed in to ChatGPT. illi keeps the login in " + ChatGPT.own() + (config.LOGIN_SET === null ? "" : " (the file `login` names)") + " and renews it there.");
    term_account(t);
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

// the accounts as they are now (run here, not in another terminal's
// view): ChatGPT's (ChatGPT.ts; signed in) plan and usage asked together,
// the login followed for a change of account, and its catalog learned
// (the chatgpt list: each model's window, efforts and speeds); the
// Anthropic key's models' windows (Anthropic.models); the chat tells its
// views
export function term_account(t: Term): void {
  if (t.chat === null) {
    return;
  }
  const chat = t.chat;
  if (config.OFFER.vendors.includes("claude-api") && config.KEYS.anthropic) {
    void Anthropic.models(config.KEYS.anthropic).then((news) => news && Chat.change(chat));
  }
  if (!config.OFFER.vendors.includes("chatgpt")) {
    return;
  }
  ChatGPT.sync();
  ChatGPT.follow();
  if (ChatGPT.signed()) {
    void ChatGPT.usage();
    void ChatGPT.models();
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
  term_account(t);
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
// open or closed, whatever it shows now: it holds until Fold all; or, #id
// a message an item of a run on the page shown holds (a call, its
// result, a report, a thought), that item opened or shut alone, as a
// click on it does (till Ctrl+O). The chat scrolls to it
function term_block(t: Term, arg: string, open: boolean): void {
  const name = /^#?(\d+)(?:\+(\d+))?$/.exec(arg);
  const id   = Number(name?.[1]);
  const n    = Number(name?.[2] ?? 1);
  const item = name !== null && n === 1 ? View.view_reach(t.v, "#" + id, open) : null;
  if (item !== null) {
    t.find = item;
    t.ver += 1;
    return;
  }
  if (name === null || block_row(View.view_body(t.v), id, n) === undefined) {
    term_note(t, arg === "" ? "Which block? " + (open ? "/open" : "/close") + " #id, as each block shows it." : "No block " + arg + " here.");
    return;
  }
  term_act(t, { $: open ? "Open" : "Shut", id, n });
  t.find = Paint.block_key(id, n);
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
  term_model_pick(t, rows, undefined, undefined, undefined, true);
}

// the model picker: each model offered (its vendor too, if more than one
// is; its window, if known), the pick's marked and lit; the one lit takes
// its effort by Left and Right (Shift+Down and Shift+Up too; stopping at
// the ends), its speed by Tab (round its speeds: one alone stays), the
// foot saying both; Enter, or a click, sets the three as one pick. The
// effort and speed asked go along as another model is lit (one lacking
// the speed takes its fastest below). With the gauge (/model's), the lit
// model's autocompact under the list (term_gauge), stepped by Shift+Left
// and Shift+Right and kept per model while the picker is open: Enter
// sends each one changed with the pick, Esc drops them. From another pick
// than the chat's, the choice goes to `done` (a setting's: Settings.ts)
export function term_model_pick(t: Term, rows: Array<[Vendor, Model]>, title = "Model", from = View.view_asked(t.v)!, done = (p: Pick): unknown => term_act(t, { $: "Pick", to: p }), gauge = false): void {
  let want    = from;
  const many  = t.v.vendors.length > 1;
  const vw    = Math.max(...rows.map(([vendor]) => vendor.length));
  const about = rows.map(([vendor, m]) => [many ? vendor.padEnd(vw) : "", m.window === undefined ? "" : term_tokens(m.window) + " context"].filter((x) => x !== "").join("  "));
  const here  = rows.findIndex(([vendor, m]) => vendor === want.vendor && m.label === want.model);
  const pick  = (k: number) => Pick.on(want, rows[k][0], rows[k][1]);
  const moved = new Map<string, number>();
  const keys  = (k: number, key: string) => {
    if (key === "Shift+Left" || key === "Shift+Right") {
      const now = term_autocompact_at(t, rows[k], moved);
      if (gauge && now !== null) {
        const top = Math.floor((now.most / now.window) * 20) * 5;
        const at  = Math.round((now.tokens / now.window) * 20) * 5;
        moved.set(rows[k][1].label, Math.max(STEP, Math.min(top, at + (key === "Shift+Right" ? STEP : -STEP))));
      }
      return true;
    }
    const move = ({ Left: "down", Right: "up", "Shift+Down": "down", "Shift+Up": "up", Tab: "speed" } as Record<string, Move>)[key];
    if (move === undefined) {
      return false;
    }
    const p  = pick(k);
    const to = Pick.move(p, move, t.v) ?? p;
    want = { ...want, effort: to.effort, speed: move === "speed" && Pick.options(p, "speed", t.v).length > 1 ? to.speed : want.speed };
    return true;
  };
  const foot  = (k: number) => {
    const p       = Pick.fit(pick(k));
    const efforts = Pick.options(p, "effort", t.v).map(([effort]) => effort);
    const e       = efforts.indexOf(p.effort);
    const speeds  = Pick.options(p, "speed", t.v).length;
    const speed   = speeds < 2 ? "no fast mode" : "Tab speed: " + Pick.speed(p.speed);
    return "effort: " + (e > 0 ? "<- " : "") + p.effort + (e < efforts.length - 1 ? " ->" : "") + " · " + speed;
  };
  const detail = (k: number, w: number) => {
    const now = term_autocompact_at(t, rows[k], moved);
    return now === null ? [] : term_gauge(now, w);
  };
  const chosen = (k: number) => {
    done(pick(k));
    moved.forEach((share, label) => term_send(t, { $: "autocompact", label, value: share + "%" }));
  };
  term_chooser(t, title, rows.map(([, m]) => m.label), about, here, chosen, { find: true, keys, foot, detail: gauge ? detail : undefined });
}

// a model's auto compact as the picker shows it: its share stepped while
// the picker is open (moved), else as set (its own, else the global
// one); its tokens (at most `most`: MOST of its window, and its room
// less what a request takes beside the chat on the chat's own model:
// config_most), its window;
// null: the chat's process told none yet, or the model's window isn't
// known (its vendor hasn't told it: none is guessed). Another model's
// shows whatever the chat's model's window
function term_autocompact_at(t: Term, [vendor, m]: [Vendor, Model], moved: Map<string, number>): Gauge | null {
  const fill   = t.v.use.fill ?? null;
  const told   = t.v.use.compacts;
  const window = m.window;
  const chat   = t.v.pick?.vendor === vendor && t.v.pick.model === m.label;
  if (told === undefined || window === undefined || (chat && fill === null)) {
    return null;
  }
  const most   = chat ? fill!.most : config.config_most(window, 0, m.room);
  const step   = moved.get(m.label);
  const set    = step !== undefined ? step + "%" : told.sets[m.label] ?? told.global;
  const tokens = Math.max(1, Math.min(config.config_tokens(set, window) ?? config.config_tokens(config.SETTINGS.autocompact.def, window)!, most));
  return { set, tokens, most, window };
}

// the auto compact gauge, for w columns: `auto compact at ██████▌░░░░░
// 60% · 523k of 872k   Shift + <-/->`; narrower, `auto compact at 60% ·
// 523k`, then `60%`
export function term_gauge(g: Gauge, w: number): Paint.Line[] {
  const ink   = { ...Paint.INK, c: Draw.draw_tokens().accent };
  const share = Math.round((g.tokens / g.window) * 100) + "%";
  const keys  = Paint.Run("   Shift + <-/->", Paint.DIM);
  const said  = Paint.Run("  " + share + " · " + term_tokens(g.tokens) + " of " + term_tokens(g.window), Paint.INK);
  const name  = Paint.Run("auto compact at ", Paint.DIM);
  const bw    = Math.min(GAUGE, w - Paint.line_width([name, said, keys]));
  if (bw >= GAUGE / 2) {
    const halves = Math.round((g.tokens / g.window) * bw * 2);
    const cells  = Array.from({ length: bw }, (_, i) => (halves >= 2 * (i + 1) ? "█" : halves === 2 * i + 1 ? "▌" : ""));
    return [[name, Paint.Run(cells.join(""), ink), Paint.Run("░".repeat(cells.filter((c) => c === "").length), Paint.DIM), said, keys]];
  }
  const short = [name, Paint.Run(share + " · " + term_tokens(g.tokens), Paint.INK)];
  return [Paint.line_width(short) <= w ? short : [Paint.Run(share, Paint.INK)]];
}

// /autocompact: the chat's model's autocompact said (no value), or set
// for it (by the chat's process: from another terminal too): a share of
// its window, tokens, or default (its own taken out, the global one
// holds), said once the chat took it (a variable setting them: why not)
function term_autocompact(t: Term, arg: string): void {
  const fill  = t.v.use.fill ?? null;
  const model = t.v.pick?.model;
  const text  = arg.trim().toLowerCase();
  if (model === undefined) {
    return term_note(t, "No chat to set it for here.");
  }
  if (fill === null) {
    return term_note(t, model + "'s window isn't known yet: its vendor hasn't told it.");
  }
  if (text === "") {
    return term_note(t, "Auto compact for " + model + " at " + fill.set + (fill.own ? "" : " (the global one)") + ": " + term_tokens(fill.cap) + " of its " + term_tokens(fill.window) + " window. /autocompact 50%, 300k or default changes it; in /model, Shift + <-/->.");
  }
  const value = text === "default" ? null : text;
  const want  = value === null ? null : config.config_tokens(value, fill.window);
  if (value !== null && want === null) {
    return term_note(t, "/autocompact takes a share of the window (50%), a size (300k) or default.");
  }
  const said = want === null ? ": back to the global one" : " at " + value + ": " + (want > fill.most ? "held to " : "") + term_tokens(Math.min(want, fill.most)) + " of its " + term_tokens(fill.window) + " window";
  term_send(t, { $: "autocompact", label: model, value }, undefined, "Auto compact for " + model + said + ".");
}

// a part of the pick (its model, its effort): to the value given, or,
// none, the values it may take, the pick's marked
function term_pick(t: Term, move: Move, arg: string): void {
  const knob = View.view_pick(t.v).find((k) => k.move === move);
  if (arg !== "" || knob === undefined || t.v.pick === null) {
    term_act(t, { $: "Move", move, to: arg });
    return;
  }
  const parts = [...new Set(Pick.options(t.v.pick, move, t.v).map(([part]) => part))];
  const list  = parts.map((part) => part + (part === knob.text ? " (now)" : ""));
  term_note(t, move[0].toUpperCase() + move.slice(1) + "s: " + list.join(", ") + ". Pick one with /" + move + " <" + move + ">.");
}

// illi's last reply on the tab shown, to the terminal's clipboard, as
// the screen shows it (its citation marks off: Md.cites_hide)
function term_copy(t: Term): void {
  const log  = t.v.page === null ? [...t.v.whole].sort((a, b) => a[0] - b[0]).map(([, e]) => e) : t.v.page.log ?? [];
  const last = log.filter((e) => e.kind === "illi").at(-1);
  if (last === undefined) {
    return term_note(t, "No reply to copy yet.");
  }
  const text = Md.cites_hide(last.text);
  Screen.screen_copy(text);
  term_note(t, "Copied the last reply (" + text.length + " characters).");
}

// the memory, as JSON
async function term_export(t: Term): Promise<void> {
  const file = process.cwd() + "/illi-memory.json";
  await Bun.write(file, [...Export.dump(t.mem())].join(""));
  term_note(t, "Your memory is in " + config.config_home(file) + ".");
}

// the memory tree, as a page
async function term_tree(t: Term): Promise<void> {
  const file = process.cwd() + "/illi-tree.html";
  await Bun.write(file, [...Export.page(t.mem())].join(""));
  term_note(t, "The memory tree is in " + config.config_home(file) + ".");
}
