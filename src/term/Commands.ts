// Commands
// ========
// All a person can do here, by group (COMMANDS, /help), and the commands
// themselves: a /word typed runs one, and, as it's typed, the commands it
// matches show over the input (suggested); the picker (/agent, /profile,
// /model, /settings), the panes over the chat (/help, /agents, /mcp), the
// pick, the login, the pages, the blocks, the memory's exports.

import type { Vendor } from "../ai/AskAI.ts";
import { term_clip, term_image } from "./Attach.ts";
import { Chat } from "../chat/Chat.ts";
import { ChatGPT } from "../ai/ChatGPT.ts";
import * as config from "../config/Config.ts";
import { Custom, type Command, type Profile, type Skill } from "../config/Custom.ts";
import { term_redraw } from "./Frame.ts";
import { term_away, term_clear, term_cycle, term_enter, term_esc, term_next, term_page, term_shots, term_take, term_verbose } from "./Keys.ts";
import { Mcp, type Server } from "../tools/Mcp.ts";
import { Memory } from "../chat/Memory.ts";
import { term_note, term_notify, term_unnote, term_unnotify, type Notice } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import { type Model, type Move, Pick } from "../ai/Pick.ts";
import { term_profile } from "./ProfileCommands.ts";
import * as Screen from "../ui/Screen.ts";
import { term_set, term_settings } from "./Settings.ts";
import { term_side_set, term_tokens } from "./Side.ts";
import { term_act, term_idle, term_primaries, term_quit, term_send, type Chooser, type Cmd, type Sug, type Term } from "./Term.ts";
import { agent_name } from "../ui/Theme.ts";
import * as View from "../ui/View.ts";

// how long the login's code shows: as long as it is good (ms), or till
// the login ends
const LOGIN = 15 * 60000;

// the pick's moves by Shift and an arrow
const ARROWS: Record<string, Move> = { "Shift+Left": "prev", "Shift+Right": "next", "Shift+Up": "up", "Shift+Down": "down" };

// all a person can do here, by group (the editing keys are Screen's);
// with `custom`, the user's commands and skills too (read anew: never at
// each key; a command wins a skill's name)
function term_groups(v: View.View, custom = false): [group: string, cmds: Cmd[]][] {
  const cmds   = custom ? Custom.commands(process.cwd()) : [];
  const skills = custom ? Custom.skills(process.cwd()).filter((s) => !cmds.some((c) => c.name === s.name)) : [];
  const yours  = [
    ...cmds.map((c): Cmd => ["/" + c.name + " [...]", "", c.description || "your command (" + c.file + ")", (t, a) => term_custom(t, c, a, "/" + c.name)]),
    ...skills.map((s): Cmd => ["/" + s.name + " [...]", "", "skill: " + (s.description || s.dir), (t, a) => term_skill(t, s, a, "/" + s.name)]),
  ];
  return [
    ["Chat", [
      ["",                  "Enter",                   "send; on an empty input, interrupt Illi",        term_enter],
      ["",                  "Esc",                     "close a list; else clear the notes and interrupt Illi's turn (agents go on)", term_esc],
      ["",                  "Ctrl+C, Ctrl+D",          "clear; on an empty input, interrupt (Ctrl+C again: quit), quit", term_clear],
      ["",                  "Tab",                     "take the suggested reply",                       term_take],
      ["/goal <message>",   "",                        "send a message as the goal: at each turn's end, Illi asks itself if it is met, and goes on till it is", (t, a) => term_say(t, "/goal " + a)],
      ["/halt",             "",                        "drop the goal; the turn running ends as it would", (t) => term_say(t, "/halt")],
      ["/clear",            "",                        "a fresh session for a new topic: the screen starts empty, and Illi gets the chat so far only as its memory tree's summaries (each a zoom away, so it still remembers)", (t) => term_say(t, "/clear")],
      ["/compact",          "",                        "fold all but the last two exchanges into Illi's memory tree, so each turn sends less; unlike /clear, the screen still shows them all", (t) => term_say(t, "/compact")],
      ["/image <path>",     "",                        "attach an image: its token goes in the input, the image with it as it's sent (or paste or drop its file)", term_image],
      ["",                  "Alt+V, Ctrl+V",           "attach the clipboard's image (the terminal's own paste brings text alone)", term_clip],
      ["/open #id",         "",                        "open block #id and keep it open (or click it)",  (t, a) => term_block(t, a, true)],
      ["/close #id",        "",                        "close block #id and keep it closed (or click its top edge)", (t, a) => term_block(t, a, false)],
      ["/fold",             "Ctrl+F",                  "the chat in the fewest blocks; again: unfold (Ctrl+F eaten? type /fold)", term_fold],
      ["",                  "Ctrl+Y",                  "copy Illi's last reply (a drag copies the text it goes over, anywhere; a double click, a word, a path or a link; three, a line; dragged on, more of them)", term_copy],
      ["",                  "Ctrl+O",                  "show the work between replies (tool calls, results, thinking, agents' reports), or hide it again; a click on one run shows that one", term_verbose],
      ["/export",           "",                        "save the memory as ./illi-memory.json",          term_export],
      ["/tree",             "",                        "the whole memory tree as a page, ./illi-tree.html", term_tree],
      ["",                  "Ctrl+L",                  "draw the screen anew",                           term_redraw],
      ["",                  "Ctrl+Z",                  "suspend; fg brings it back",                     (t) => Screen.screen_suspend(t.scr)],
      ["/quit",             "",                        "leave: what runs stops, and goes on at the next start", term_quit],
      ["/help",             "",                        "this list",                                      term_help],
    ]],
    ["Scroll", [
      ["",                  "PgUp, PgDn",              "a page up, down (or the wheel); at the end, the chat follows what comes", term_page],
      ["",                  "Ctrl+Home, Ctrl+End",     "the chat's top, its end",                        term_page],
    ]],
    ["Pick", [
      ["",                  "Shift+Left, Shift+Right", "the model before, the next",                     (t, k) => term_move(t, ARROWS[k])],
      ["",                  "Shift+Up, Shift+Down",    "more effort, less",                              (t, k) => term_move(t, ARROWS[k])],
      ["/model [name]",     "",                        "pick the model, its effort and speed at once: type to search, Up and Down a model, Left and Right its effort, Tab fast, Enter; with a name, that model", term_model],
      ["/effort [level]",   "",                        "the efforts; with one, that one",                (t, a) => term_pick(t, "effort", a)],
      ["/speed [speed]",    "",                        "the speeds; with one, that one",                 (t, a) => term_pick(t, "speed", a)],
    ]],
    ["Agents", [
      ["",                  "Shift+Tab",               "Illi runs as the next primary agent (or click one at the side)", term_next],
      ["/agent [name]",     "",                        "the primary agent named (illi: Illi's own); none: pick from a list", term_agent_set],
      ["/agents",           "",                        "your agents, commands and skills, and where their files go", term_agents],
      ["/mcp",              "",                        "your MCP servers: each one's tools, or why it failed", term_mcp],
      ["/side [where|width]", "",                      "the side panel: right, left or off; or its width, in columns (40) or of the screen (30%)", term_side_set],
      ["/settings",         "",                        "all the settings, each one's value: type to search, Left and Right (or Enter) change it, Enter on a model or a file changes that, Delete puts its default back", (t) => term_settings(t)],
      ["/set <key> [value]", "",                       "a setting changed (default: its default back); with no value, what it is", term_set],
      ["/login",            "",                        "sign in to ChatGPT (Plus or Pro) with a code, no opencode needed; Illi keeps and renews its own login", term_login],
      ["/logout",           "",                        "remove Illi's own ChatGPT login (opencode's, if any, is used again)", term_logout],
      ["",                  "Ctrl+PgDn, Ctrl+PgUp",    "the next page, the one before: Illi's, each subagent's at work", term_cycle],
      ["/tab [name]",       "",                        "the pages; with a name, that one",               term_tab],
      ["/stop [name]",      "",                        "stop all work, agents too; or that agent",       term_stop],
    ]],
    ["Profiles", [
      ["/profile [name]",   "",                        "switch to the profile named (each its own chat, settings, agents and MCP servers; the login is shared); none: pick from a list", term_profile],
      ["/profile new <name> [--copy]", "",             "make a profile and switch to it: empty, or with this one's settings, agents, commands and skills (never its chat)", term_profile],
      ["/profile export [name] [file]", "",            "this profile (or that one) as one archive, ./illi-profile-<name>.tar.gz: no login, no lock, its config's secrets left out", term_profile],
      ["/profile import <file> [name]", "",            "an archive as a new profile, named by its file (or as given); untrusted: its MCP servers come disabled, its config's commands out", term_profile],
    ]],
    ...(yours.length === 0 ? [] : [["Yours", yours] as [string, Cmd[]]]),
  ];
}

export function term_commands(v: View.View, custom = false): Cmd[] {
  return term_groups(v, custom).flatMap(([, cmds]) => cmds);
}

// a command typed (`/name arg`): runs it (pending while it works on);
// false if the text is none
export function term_command(t: Term, text: string): boolean {
  const word = text.trim().split(/\s+/)[0];
  const cmd = word.startsWith("/") ? term_commands(t.v, true).find(([use]) => use !== "" && use.split(" ")[0] === word) : undefined;
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
  t.sug ??= { cmds: term_commands(t.v, true).filter(([use]) => use !== ""), word: "", found: [], at: 0, top: 0, tall: 1, off: null };
  const sug = t.sug;
  if (sug.word !== word) {
    const names = sug.cmds.map(([use]) => use.split(" ")[0].slice(1));
    Object.assign(sug, { word, found: Screen.ed_rank(word.slice(1), names), at: 0, top: 0, off: null });
  }
  return sug.off === word ? null : sug;
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
// argument go whole (/profile new)
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

// the commands and keys by group, in two columns (too narrow for 20
// columns of what one does: how it's typed on a line of its own, what it
// does under it, indented), then the editing keys
function term_help(t: Term): void {
  const groups = term_groups(t.v, true);
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
// from an agent's page, not sent, the input has it back (term_away)
function term_say(t: Term, text: string): void {
  if (!term_away(t, text.trim())) {
    term_act(t, { $: "Send", text });
  }
}

// the user's command (typed as `word`): its message sent, with the images
// its words name; from an agent's page, not sent (term_away)
function term_custom(t: Term, cmd: Command, arg: string, word: string): void {
  if (term_away(t, (word + " " + arg).trim())) {
    return;
  }
  if (term_act(t, { $: "Send", text: Custom.expand(cmd, arg), images: term_shots(t, arg) }).length > 0) {
    term_unnote(t);
  }
}

// the user's skill (typed as `word`): Illi told to use it, for the words
// after its name
function term_skill(t: Term, skill: Skill, arg: string, word: string): void {
  term_custom(t, { name: skill.name, description: "", body: "Use your skill " + skill.name + (arg === "" ? "." : ": $ARGUMENTS"), file: skill.dir }, arg, word);
}

// the user's MCP servers: each one's tools, or how it is; the file
export function term_mcp(t: Term): void {
  const { servers, trouble, file } = Mcp.status();
  const server = (s: Server) => "- **" + s.name + "**: " + (s.state === "ready" ? s.own.size + " tools: " + [...s.own.values()].join(", ") : s.state === "starting" ? "starting…" : "failed: " + s.why);
  const text = [
    servers.length === 0 ? "No MCP servers." : "MCP servers (their tools are named mcp__<server>__<tool>):", ...servers.map(server),
    ...(trouble === "" ? [] : ["", "The file won't read: " + trouble]),
    "", "They are in " + file + ", as Claude Code's mcpServers; the README shows its shape. A change there applies at illi's next start.",
  ];
  const rows = View.entry_rows(null, "illi", text.join("\n"));
  term_pane(t, "MCP", (w) => Paint.rows_lines(rows, w));
}

// the user's agents, primary (the main one marked) and subagents, their
// commands and skills, and the dirs of all
function term_agents(t: Term): void {
  const cwd   = process.cwd();
  const agent = (a: Profile) => "- **" + agent_name(a.name) + "**" + (a.name === t.v.agent ? " (main)" : "") + (a.description === "" ? "" : ": " + a.description) + [a.model, a.effort].filter(Boolean).map((x) => " · " + x).join("") + (a.tools === null ? "" : " · tools: " + a.tools.join(", "));
  const cmd   = (c: Command) => "- **/" + c.name + "**" + (c.description === "" ? "" : ": " + c.description);
  const list  = (title: string, xs: string[]) => ["", title + (xs.length === 0 ? ": none yet." : ":"), ...xs];
  term_primaries(t);
  const text  = [
    "Main agent: " + (t.v.agent === null ? "Illi's own" : agent_name(t.v.agent)) + ". Shift+Tab runs Illi as the next primary agent; so does a click at the side, and /agent <name>.",
    ...list("Primary agents (Illi runs as them)", t.agents.map(agent)),
    ...list("Subagents (only an agent spawns them)", Custom.subagents(cwd).map(agent)),
    ...list("Commands", Custom.commands(cwd).map(cmd)),
    ...list("Skills (the agent loads one when a task matches; /name asks for it)", Custom.skills(cwd).map((s) => "- **" + s.name + "**" + (s.description === "" ? "" : ": " + s.description))),
    "", "An agent is a markdown file in " + Custom.dirs(cwd, "agents").join(" or ") + " (the project's wins); its mode is primary, subagent, or all (both, the default). A command is one in " + Custom.dirs(cwd, "commands").join(" or ") + ", a skill a folder with a SKILL.md in " + Custom.dirs(cwd, "skills").join(" or ") + ". The README shows their shape.",
  ];
  const rows = View.entry_rows(null, "illi", text.join("\n"));
  term_pane(t, "Agents", (w) => Paint.rows_lines(rows, w));
}

// the main agent: the primary agent named (illi: Illi's own); none opens
// the picker, at the main agent
function term_agent_set(t: Term, arg: string): void {
  if (arg !== "") {
    return term_main(t, arg.toLowerCase() === "illi" ? null : arg);
  }
  term_primaries(t);
  const names = [null, ...t.agents.map((a) => a.name)];
  const about = names.map((name, k) => (k === 0 ? "Illi's own, on " + Pick.label(config.PICK) : t.agents[k - 1].description));
  term_chooser(t, "Agent", names.map((name) => agent_name(name ?? View.MAIN)), about, names.indexOf(t.v.agent), (k) => term_choose(t, names[k]));
}

// the picker opened (closing the pane), at the option marked as now; with
// `more`, a search (typing ranks the names), what else the lit option
// takes and what the foot says of it (the model picker's)
export function term_chooser(t: Term, title: string, names: string[], about: string[], here: number, pick: (k: number) => void, more: { find?: boolean; keys?: Chooser["keys"]; foot?: Chooser["foot"] } = {}): void {
  const shown = Screen.ed_rank("", names);
  t.choose = { title, names, about, here, pick, find: more.find ? "" : null, shown, at: Math.max(0, here), top: 0, keys: more.keys ?? (() => false), foot: more.foot ?? (() => "") };
  t.pane   = null;
}

// the picker's search changed: the options it matches, the best lit;
// emptied, all, the one lit before still lit (none: the one marked as
// now)
export function term_chooser_find(c: Chooser, find: string): void {
  const was = c.shown[c.at]?.k ?? c.here;
  c.find  = find;
  c.shown = Screen.ed_rank(find, c.names);
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
// copied), the login kept as Illi's own once the person gives it; again,
// a new code (the last one let go)
async function term_login(t: Term): Promise<void> {
  t.login?.abort();
  const stop = new AbortController();
  t.login = stop;
  let asked: Notice | null = null;
  try {
    const { url, code, done } = await ChatGPT.device(stop.signal);
    Screen.screen_copy(code);
    asked = term_notify(t, "Sign in to ChatGPT: open " + url + " and enter the code " + code + " (copied; it is good for 15 minutes). Illi waits for it.", false, LOGIN);
    await done;
    term_note(t, "Signed in to ChatGPT. Illi keeps its own login in " + config.OWN_LOGIN + " and renews it there.");
    term_models(t);
  } catch (err: any) {
    if (!stop.signal.aborted) {
      term_note(t, "Login: " + err.message);
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

// /logout: Illi's own login removed
function term_logout(t: Term): void {
  t.login?.abort();
  const gone = ChatGPT.logout();
  const left = ChatGPT.signed() ? " Illi runs on opencode's login now." : " /login signs in again.";
  term_note(t, (gone ? "Signed out: Illi's own ChatGPT login is removed." : "Illi has no login of its own.") + left);
}

// stops all that runs, or the agent named
function term_stop(t: Term, arg: string): void {
  const name = term_agent(t, arg);
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

// folds all (shown when the tops come), or unfolds
function term_fold(t: Term): void {
  if (t.v.page === null) {
    term_act(t, { $: "Fold", on: t.v.fold === null });
    t.scroll = 0;
  }
}

// shows an agent's chat, by the start of its name, or Illi's; no
// name lists the pages
function term_tab(t: Term, arg: string): void {
  const main = arg.toLowerCase() === View.MAIN.toLowerCase();
  if (arg === "") {
    return term_note(t, "Pages: " + View.view_tabs(t.v).map((tab) => tab.text).join("  "));
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
    const speed   = speeds < 2 ? "no fast" : "Tab " + (p.speed === "slow" ? "fast off" : p.speed + " on");
    return "effort " + (e > 0 ? "◂ " : "") + p.effort + (e < efforts.length - 1 ? " ▸" : "") + " · " + speed;
  };
  term_chooser(t, title, rows.map(([, m]) => m.label), about, here, (k) => done(pick(k)), { find: true, keys, foot });
}

// a part of the pick: to the value given, or, none, the values it may
// take, the pick's marked
function term_pick(t: Term, move: Move, arg: string): void {
  const knob = View.view_pick(t.v).find((k) => k.move === move);
  if (arg !== "" || knob === undefined || t.v.pick === null) {
    term_act(t, { $: "Move", move, to: arg });
    return;
  }
  const parts = [...new Set(Pick.options(t.v.pick, move, t.v).map(([part]) => part))];
  const list  = parts.map((part) => (part === knob.text ? part + " (now)" : part));
  term_note(t, move[0].toUpperCase() + move.slice(1) + "s: " + list.join(", ") + ". Pick one with /" + move + " <" + move + ">.");
}

// Illi's last reply on the page shown, to the terminal's clipboard
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
  await Bun.write(file, [...Memory.dump(t.chat.mem, {})].join(""));
  term_note(t, "Your memory is in " + file + ".");
}

// the memory tree, as a page
async function term_tree(t: Term): Promise<void> {
  const file = process.cwd() + "/illi-tree.html";
  await Bun.write(file, [...Memory.page(t.chat.mem)].join(""));
  term_note(t, "The memory tree is in " + file + ".");
}
