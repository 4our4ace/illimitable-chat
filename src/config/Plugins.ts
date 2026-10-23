// Plugins
// =======
// What the user adds to illi, from a plugins folder: global
// (config.ROOT/plugins: every profile's), the profile's own
// (config.DIR/plugins) or the project's (.illi/plugins), the project's
// only for a folder trusted (the `trusted` load is given: what it runs
// comes with the repository, so a clone would run it as it opened). A
// plugin is a file (name.ts, .js, .mjs) of code, or a folder: a bundle
// (Bundle.ts), in Claude Code's plugin layout, of skills, commands,
// agents, hooks and MCP servers (Custom.ts, Hooks.ts and Mcp.ts read
// those, from the plugins found at the load: bundles()), and code
// (illi.ts; an index.ts alone, as a plugin folder always was). By name,
// the later folder's wins, and one named in the `off` setting is left
// out, all of it. Which plugins there are is read once, as illi starts
// (find); a project's new or changed since illi last started there is
// said (Seen.ts). Code runs inside illi, with all illi's rights (as
// OpenCode's plugins do). Its default export is a function, called once as
// illi starts with what it may use (Api): hooks on what the chat does
// (Hooks: illi's start and quit, a turn's start and end, a message
// logged; context for the model in every call of the run; a message of
// the user's before it is sent, to keep it back or add context; a turn
// ending of itself, to make it go on; the user waited on a while; a
// tool's call before it runs, to refuse it, change its input, allow it,
// have it asked or add to what the model reads, and after, to change what
// it reads), commands, tools of its own, lines in the side panel, a piece
// of the bottom line, the theme's colors (Theme.theme_plug), notes and
// messages. illi's own hooks file (Hooks.ts) runs as one more, after the
// user's (own).
//
// Hooks run one after another: the plugins in the order they loaded
// (global, profile, project; by name within each), each one's in the
// order it gave them. What happened is told in that order too, from one
// queue (emit), each hook given SLOW at most before the queue goes on. A
// plugin that won't load, or a hook that fails, is told once (a note) and
// logged, and illi goes on without it; a side's or bottom line's maker
// that fails is dropped for the run. A tool's call whose check fails is
// refused: a hook that guards never lets a call through by failing.
//
// Where illi calls them: Term.ts loads them (load), gives them the screen
// (attach) and the chat (attach_chat) and tells the start and the quit
// (waiting for the quit a while); Chat.ts asks the run's context as the
// chat opens (context), tells a turn's start and end, each message logged
// and the user waited on (emit), and asks before a message is sent and a
// turn ends (before_message, before_stop); Commands.ts, Side.ts and
// Paint.ts show their commands, lines and pieces. The tool hooks and
// tools are Tools.ts's to call at each tool's call (before_tool,
// after_tool; tools, run).
//
//     export default function (illi) {
//       illi.on("turn.end", () => illi.note("Done."));
//       illi.on("tool.before", (call) =>
//         /\brm -rf\b/.test(call.input.command ?? "") ? { block: "Not that." } : undefined);
//     }

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { Bundle, type Scope } from "./Bundle.ts";
import * as config from "./Config.ts";
import { Seen } from "./Seen.ts";
import type { Spec } from "../tools/Machine.ts";
import * as Theme from "../ui/Theme.ts";
import { VERSION } from "./Update.ts";

// Types
// =====

// a tool's call, as a hook is given it: the tool, its input, who calls
// (null: illi's own turn; else the agent's name), the project's folder,
// what stops it (the turn's stop)
export type ToolCall = { tool: string; input: any; agent: string | null; cwd: string; signal?: AbortSignal };

// what a tool answers: its text, whether it failed
export type Output = { text: string; fail: boolean };

// what a tool's check decides: refused, and why (the model reads it), or
// run on this input: allowed (illi's own checks passed over, the user's
// rules kept: Tools.guard), or asked of the user whatever they find
// (why); with what the model reads after its answer (each, whose)
export type Verdict = { block: string } | { input: unknown; allow?: boolean; ask?: string; context?: string[] };

// what a hook may answer before a tool's call: refuse it, run it on
// other input, allow it, have it asked, add to what the model reads
// after it (the input with any of those). An allow vouches for the input
// it was given: a later hook's change to it takes the allow back
export type Before = { block: string } | { input?: unknown; allow?: boolean; ask?: string; context?: string };

// how illi waits on the user: a question for leave to run a call, or its
// question tool's, unanswered a while; a reply left a while with no
// message after it
export type Wait = "permission_prompt" | "question" | "idle_prompt";

// each hook: what it is given, what it may answer
export type Hooks = {
  "start"         : [{ cwd: string; profile: string; chat: boolean }, void];
  "quit"          : [{ cwd: string; reason: "prompt_input_exit" | "other" }, void];
  "context"       : [{ cwd: string }, { context: string } | void];
  "turn.start"    : [{ cwd: string }, void];
  "turn.end"      : [{ cwd: string; stopped: string | null }, void];
  "turn.stop"     : [{ cwd: string; again: boolean; reply: string; signal?: AbortSignal }, { continue: string } | void];
  "message"       : [{ id: number; kind: string; text: string; agent: string | null }, void];
  "message.before": [{ text: string; cwd: string; signal?: AbortSignal }, { block: string } | { context: string } | void];
  "notify"        : [{ cwd: string; type: Wait; text: string }, void];
  "tool.before"   : [ToolCall, Before | void];
  "tool.after"    : [ToolCall & { output: Output }, Partial<Output> | void];
};
export type Hook = keyof Hooks;

// the hooks that only tell what happened, in order (emit)
type Told = "start" | "turn.start" | "turn.end" | "message" | "notify";

// what the chat does for plugins (Term.ts, where the chat runs): the mode
// its tools are judged in now; its turn stopped, why noted
export type ChatSink = { mode: () => string; halt: (why: string) => void };

// a piece of a plugin's line: its text, the theme's token it is colored
// in (none: the ink), bold, dim; a line as a plugin gives it: text, a
// piece, or pieces
export type Piece = { text: string; tone?: Theme.Token; bold?: boolean; dim?: boolean };
export type Line = string | Piece | Piece[];

// a plugin's command: its name, what it does, the plugin's name, what
// runs it (the words after it; its answer, a note: "" none)
export type Command = { name: string; about: string; plugin: string; run: (args: string) => Promise<string> };

// a plugin's tool as it gives it: its name, what it does (the model reads
// it), its input's JSON schema, what runs it (its text, or its output)
export type Tool = { name: string; description: string; schema?: object; run: (input: any, call: ToolCall) => string | Output | Promise<string | Output> };

// what a plugin may use, given to its function: the API's version
// (API), its name, folder, the project's folder, the profile, illi's
// version; and what it adds
export type Api = {
  api     : number;
  name    : string;
  dir     : string;
  cwd     : string;
  profile : string;
  version : string;
  on<K extends Hook>(hook: K, run: (ev: Hooks[K][0]) => Hooks[K][1] | Promise<Hooks[K][1]>): void;
  command(name: string, about: string, run: (args: string) => string | void | Promise<string | void>): void;
  tool(tool: Tool): void;
  side(make: (w: number) => Line[]): void;
  status(make: () => Line): void;
  theme(over: { accent?: string; tokens?: Partial<Record<Theme.Token, string>>; colors?: Record<string, string> }): void;
  note(text: string): void;
  send(text: string): void;
  redraw(): void;
  log(...args: unknown[]): void;
};

// what the screen does for plugins (Term.ts): a note, a message sent as
// the user's, a paint
export type Screen = { note: (text: string) => void; send: (text: string) => void; redraw: () => void };

// a plugin found: its name, its code's file ("": none), its folder ("":
// a file plugin), where it is, its bundle as read at the load (null: a
// file plugin), whether off (the `off` setting) and, once loaded,
// whether its code runs (one with none: true)
export type Found = { name: string; file: string; dir: string; scope: Scope; bundle: Bundle | null; off: boolean; runs: boolean };

// a folder in a plugins folder that is no plugin, though it looks meant
// as one: where, why
export type Misfit = { dir: string; why: string };

// a plugin loaded: its name and file, as notes and the chat name it
// (said), whether it runs (false: it failed to load), whether its
// function returned, how long a hook of it is waited for (0: no end, as
// illi's own hooks file's commands keep their own); what it gave: hooks,
// commands, tools (named plugin__<plugin>__<tool>), side and bottom line
// makers, themes (applied once it has loaded)
type Plugin = {
  name     : string;
  file     : string;
  said     : string;
  runs     : boolean;
  ready    : boolean;
  slow     : number;
  hooks    : Array<{ hook: Hook; run: (ev: any) => any }>;
  commands : Command[];
  tools    : Array<Spec & { run: Tool["run"] }>;
  sides    : Array<(w: number) => Line[]>;
  statuses : Array<() => Line>;
  themes   : unknown[];
};

// Constants
// =========

// a plugin's name, a command's: a file's, as typed; a tool's
const NAME = /^[a-z0-9][a-z0-9_-]*$/i;
const TOOL = /^[a-z0-9_-]+$/i;

// the files a plugin may be, a folder's index
const FILES = [".ts", ".js", ".mjs"];

// the API's version: what a plugin is given only grows within one (a
// hook, a member, a field added); a change that would break a plugin is
// a new one
export const API = 1;

// the hooks there are
export const HOOKS: Hook[] = ["start", "quit", "context", "turn.start", "turn.end", "turn.stop", "message", "message.before", "notify", "tool.before", "tool.after"];

// the longest a plugin's function or a hook is waited for, and a quit
// hook as illi quits (ms)
const SLOW = 30000;
const QUIT = 1500;

// the plugins found at the load, and those loaded, in their order
let FOUND: Found[] = [];
let MISFITS: Misfit[] = [];
let LOADED: Plugin[] = [];

// the screen (null: not yet: notes wait for it), the notes waiting; the
// chat (null: not yet, or not in this illi); those told once (by plugin
// and what failed), what is told, in order (emit); whether the quit was
// told
let SCREEN: Screen | null = null;
let WAITING: string[] = [];
let CHAT: ChatSink | null = null;
let QUITTED = false;
let TOLD = new Set<string>();
let QUEUE: Promise<void> = Promise.resolve();

// Plugins
// =======

export namespace Plugins {

  // where plugins are: the global folder first, then the profile's, the
  // project's last, if its folder is trusted
  export function dirs(cwd: string, trusted: (cwd: string) => boolean): string[] {
    const own = config.DIR === config.ROOT ? [] : [path.join(config.ROOT, "plugins")];
    return [...own, path.join(config.DIR, "plugins"), ...(trusted(cwd) ? [path.join(cwd, ".illi", "plugins")] : [])];
  }

  // the plugins in those folders, by name, the later folder's over the
  // earlier's, in the order they load (by folder, then name); those off
  // too, marked
  export function find(cwd: string, trusted: (cwd: string) => boolean): Found[] {
    const out = new Map<string, Found & { at: number }>();
    MISFITS = [];
    Plugins.dirs(cwd, trusted).forEach((dir, at) => {
      const scope: Scope = dir === path.join(cwd, ".illi", "plugins") ? "project" : config.DIR !== config.ROOT && dir === path.join(config.DIR, "plugins") ? "profile" : "global";
      for (const found of plugin_files(dir, scope)) {
        out.set(found.name, { ...found, at });
      }
    });
    return [...out.values()].sort((x, y) => x.at - y.at || x.name.localeCompare(y.name)).map(({ at, ...found }) => found);
  }

  // the bundles of the plugins found at the load, not off, in order, each
  // read anew (its parts as they are now; one gone since, left out)
  export function bundles(): Bundle[] {
    return FOUND.filter((f) => !f.off && f.bundle !== null).flatMap((f) => Bundle.read(f.dir, f.name, f.scope) ?? []);
  }

  // the real folders of the bundles found at the load, but those off (as
  // they were then: a set fixed at the start, read at each tool's call)
  export function roots(): string[] {
    return FOUND.filter((f) => !f.off && f.bundle !== null).map((f) => f.bundle!.dir);
  }

  // the folders found at the load that are no plugins, and why
  export function misfits(): Misfit[] {
    return MISFITS;
  }

  // the plugins loaded, each one's function called (SLOW at most), one
  // after another; the project's only if trusted(cwd), so a repository's
  // code runs only in a folder the user trusts. One that won't load is
  // told and left out, all it gave with it; what of a bundle won't read
  // is told, the rest of it applying
  export async function load(cwd: string, trusted: (cwd: string) => boolean): Promise<void> {
    FOUND = Plugins.find(cwd, trusted);
    FOUND.filter((f) => !f.off && f.scope === "project").forEach(plugin_seen);
    FOUND.filter((f) => !f.off).forEach((f) => f.bundle?.troubles.forEach((t) => plugin_say("The plugin " + f.name + ": " + t + " (/agents lists it).")));
    for (const found of FOUND.filter((f) => !f.off)) {
      if (found.file === "") {
        found.runs = true;
        continue;
      }
      const p: Plugin = { name: found.name, file: found.file, said: "the plugin " + found.name, runs: true, ready: false, slow: SLOW, hooks: [], commands: [], tools: [], sides: [], statuses: [], themes: [] };
      LOADED.push(p);
      try {
        const mod = await import(pathToFileURL(found.file).href);
        const run = typeof mod.default === "function" ? mod.default : mod.plugin;
        if (typeof run !== "function") {
          throw new Error("it exports no function (export default function (illi) { ... })");
        }
        await plugin_wait(run(plugin_api(p, cwd)), SLOW);
        p.ready = true;
        p.themes.splice(0).forEach(Theme.theme_plug);
        found.runs = true;
      } catch (err) {
        p.runs = false;
        LOADED = LOADED.filter((x) => x !== p);
        plugin_trouble(p, "loading", err);
      }
    }
  }

  // a plugin of illi's own (Hooks.ts: the hooks file's commands), after
  // the user's: its name, file, its name in notes and the chat (said), its
  // hooks, each keeping its own time limit
  export function own(name: string, file: string, said: string, hooks: Array<{ hook: Hook; run: (ev: any) => any }>): void {
    LOADED.push({ name, file, said, runs: true, ready: true, slow: 0, hooks, commands: [], tools: [], sides: [], statuses: [], themes: [] });
  }

  // the plugins found at the load, those off and those that failed too
  export function found(): Found[] {
    return FOUND;
  }

  // a note on the screen (illi's own plugin's), or, till it's up, kept
  export function say(text: string): void {
    plugin_say(text);
  }

  // the mode the chat's tools are judged in now (no chat here: the
  // setting's)
  export function mode(): string {
    return CHAT?.mode() ?? config.config_value("mode");
  }

  // the chat's turn stopped (illi's own plugin's: a hook said not to go
  // on), why noted; none here, nothing
  export function halt(why: string): void {
    CHAT?.halt(why);
  }

  // the screen, once it is up: the notes waiting said
  export function attach(screen: Screen): void {
    SCREEN = screen;
    WAITING.splice(0).forEach((text) => screen.note(text));
  }

  // the chat, where it runs, once open
  export function attach_chat(chat: ChatSink): void {
    CHAT = chat;
  }

  // what happened told to each plugin's hook of it, in order: after all
  // told before (one queue), one hook after another, each SLOW at most;
  // what it is given frozen, so no hook changes what the next is given.
  // Done once all have run (none fails it)
  export function emit<K extends Told>(hook: K, ev: Hooks[K][0]): Promise<void> {
    const runs = plugin_hooks(hook);
    if (runs.length === 0) {
      return QUEUE;
    }
    const given = Object.freeze({ ...ev });
    QUEUE = QUEUE.then(async () => {
      for (const [p, run] of runs) {
        try {
          await plugin_wait(run(given), p.slow);
        } catch (err) {
          plugin_trouble(p, hook, err);
        }
      }
    });
    return QUEUE;
  }

  // illi quitting, told once, each hook at once; done when all are (QUIT
  // at most each; illi's own keeps its own limits), so illi quits after.
  // From the process's exit (a crash, or a quit not told yet), the same,
  // though nothing can wait then
  export function quit(cwd: string, reason: Hooks["quit"][0]["reason"]): Promise<void> {
    if (QUITTED) {
      return Promise.resolve();
    }
    QUITTED = true;
    const given = Object.freeze({ cwd, reason });
    return Promise.all(plugin_hooks("quit").map(async ([p, run]) => {
      try {
        await plugin_wait(run(given), p.slow === 0 ? 0 : QUIT);
      } catch (err) {
        console.error("illi: plugin " + p.name + ": quit: " + String((err as any)?.message ?? err));
      }
    })).then(() => {});
  }

  // what the model is told in every call of this run, asked of each
  // context hook once, as the chat opens: each one's, whose, in order. A
  // hook that fails is told and passed over
  export async function context(ev: Hooks["context"][0]): Promise<string[]> {
    const out: string[] = [];
    for (const [p, run] of plugin_hooks("context")) {
      try {
        const said = await plugin_wait(run(Object.freeze({ ...ev })), p.slow);
        if (typeof said === "object" && said !== null && typeof said.context === "string" && said.context.trim() !== "") {
          out.push("From " + p.said + ":\n" + said.context.trim());
        }
      } catch (err) {
        plugin_trouble(p, "context", err);
      }
    }
    return out;
  }

  // a tool's call checked by each tool.before hook, before it runs (and
  // before the user is asked to allow it, so they're asked of what will
  // run): refused by the first that refuses it, else run on the input as
  // the hooks changed it (each given the one before's), asked about if
  // any asks (the first one's why), else allowed if any allows. A hook
  // that fails refuses it, saying why; a call stopped meanwhile is
  // refused so
  export async function before_tool(call: ToolCall): Promise<Verdict> {
    let input = call.input;
    let ask: string | undefined;
    let allow = false;
    const context: string[] = [];
    for (const [p, run] of plugin_hooks("tool.before")) {
      try {
        const said = await plugin_wait(run(Object.freeze({ ...call, input })), p.slow, call.signal);
        if (typeof said !== "object" || said === null) {
          continue;
        }
        if ("block" in said) {
          return { block: String(said.block ?? "").trim() || capital(p.said) + " refused this call." };
        }
        if (said.input !== undefined && said.input !== input) {
          [input, allow] = [said.input, false];
        }
        if (typeof said.ask === "string") {
          ask ??= said.ask.trim() || p.said + " asks";
        }
        allow ||= said.allow === true;
        if (typeof said.context === "string" && said.context.trim() !== "") {
          context.push("From " + p.said + ":\n" + said.context.trim());
        }
      } catch (err) {
        if (call.signal?.aborted) {
          return { block: "Stopped." };
        }
        return { block: capital(p.said) + " couldn't check this call (" + plugin_trouble(p, "tool.before", err) + "), so it was refused." };
      }
    }
    return { input, ...(ask !== undefined ? { ask } : allow ? { allow } : {}), ...(context.length > 0 ? { context } : {}) };
  }

  // a message of the user's checked by each message.before hook, before
  // it is logged and sent: kept back by the first that keeps it (why,
  // said to the user), else sent, with what each adds for the model (a
  // note after it: whose, and what). A hook that fails is told and passed
  // over
  export async function before_message(ev: Hooks["message.before"][0]): Promise<{ block: string } | { context: string[] }> {
    const context: string[] = [];
    for (const [p, run] of plugin_hooks("message.before")) {
      try {
        const said = await plugin_wait(run(Object.freeze({ ...ev })), p.slow, ev.signal);
        if (typeof said === "object" && said !== null && "block" in said) {
          return { block: String(said.block ?? "").trim() || capital(p.said) + " kept your message back." };
        }
        if (typeof said === "object" && said !== null && typeof (said as any).context === "string" && (said as any).context.trim() !== "") {
          context.push("From " + p.said + ":\n" + (said as any).context.trim());
        }
      } catch (err) {
        if (ev.signal?.aborted) {
          return { block: "Stopped." };
        }
        plugin_trouble(p, "message.before", err);
      }
    }
    return { context };
  }

  // a turn ending of itself, asked of each turn.stop hook: the first that
  // says go on, its why (whose, and what), for the model; null: it ends.
  // A hook that fails is told and passed over; a stop ends it
  export async function before_stop(ev: Hooks["turn.stop"][0]): Promise<string | null> {
    const signal = ev.signal;
    for (const [p, run] of plugin_hooks("turn.stop")) {
      try {
        const said = await plugin_wait(run(Object.freeze({ ...ev })), p.slow, signal);
        if (typeof said === "object" && said !== null && typeof said.continue === "string") {
          return "From " + p.said + ":\n" + (said.continue.trim() || "Go on.");
        }
      } catch (err) {
        if (signal?.aborted) {
          return null;
        }
        plugin_trouble(p, "turn.stop", err);
      }
    }
    return null;
  }

  // a tool's output, as each tool.after hook changes it (its text, whether
  // it failed; each given the one before's), what else it holds (its
  // images) kept. A hook that fails leaves it as it was
  export async function after_tool<O extends Output>(call: ToolCall, out: O): Promise<O> {
    let now = out;
    for (const [p, run] of plugin_hooks("tool.after")) {
      try {
        const said = await plugin_wait(run(Object.freeze({ ...call, output: { text: now.text, fail: now.fail } })), p.slow, call.signal);
        if (typeof said === "object" && said !== null) {
          now = { ...now, ...(typeof said.text === "string" ? { text: said.text } : {}), ...(typeof said.fail === "boolean" ? { fail: said.fail } : {}) };
        }
      } catch (err) {
        if (!call.signal?.aborted) {
          plugin_trouble(p, "tool.after", err);
        }
      }
    }
    return now;
  }

  // the plugins' tools, as the model is offered them
  export function tools(): Spec[] {
    return LOADED.flatMap((p) => p.tools.map(({ name, info, schema }) => ({ name, info, schema })));
  }

  // a plugin's tool run (its name plugin__<plugin>__<tool>): its text,
  // whether it failed (it threw: why); one stopped, as its signal stops
  // it; no such tool, a failure saying so
  export async function run(call: ToolCall): Promise<Output> {
    const p = LOADED.find((x) => x.tools.some((t) => t.name === call.tool));
    const tool = p?.tools.find((t) => t.name === call.tool);
    if (p === undefined || tool === undefined) {
      return { text: "No tool " + call.tool + ".", fail: true };
    }
    try {
      const said = await plugin_wait(tool.run(call.input, call), 0, call.signal);
      return typeof said === "string" ? { text: said, fail: false } : { text: String(said?.text ?? ""), fail: said?.fail === true };
    } catch (err) {
      const why = String((err as any)?.message ?? err);
      console.error("illi: plugin " + p.name + ": " + call.tool + ": " + ((err as any)?.stack ?? why));
      return { text: call.signal?.aborted ? "Stopped." : p.name + ": " + why, fail: true };
    }
  }

  // the plugins' commands, in their order
  export function commands(): Command[] {
    return LOADED.flatMap((p) => p.commands);
  }

  // the plugins' lines for the side panel, w wide: each plugin's own,
  // each line its pieces; a maker that fails is told and dropped
  export function side(w: number): Piece[][][] {
    return LOADED.flatMap((p) => plugin_made(p, p.sides, "side", (make) => make(w)).map((lines) => lines.map(plugin_pieces)));
  }

  // the plugins' pieces of the bottom line, each a maker's (none: those
  // with no text)
  export function status(): Piece[][] {
    return LOADED.flatMap((p) => plugin_made(p, p.statuses, "status", (make) => [make()]).flat().map(plugin_pieces)).filter((l) => l.some((x) => x.text !== ""));
  }

  // all let go: none loaded, no screen nor chat, nothing waiting, no quit
  // told (a test's start)
  export function reset(): void {
    FOUND   = [];
    MISFITS = [];
    LOADED  = [];
    SCREEN  = null;
    WAITING = [];
    CHAT    = null;
    QUITTED = false;
    TOLD    = new Set();
    QUEUE   = Promise.resolve();
  }

}

// the plugins in a folder, by name: each file of FILES (not a .d.ts), and
// each folder that is a bundle (Bundle.read: its code, if any, is the
// plugin's file); a folder meant as one that isn't, kept as a misfit;
// none if the folder isn't one. Off by the `off` setting
function plugin_files(dir: string, scope: Scope): Found[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
  return names.flatMap((entry): Found[] => {
    const file = path.join(dir, entry);
    const ext  = FILES.find((x) => entry.endsWith(x) && !entry.endsWith(".d.ts"));
    const kind = plugin_kind(file);
    if (ext !== undefined && NAME.test(entry.slice(0, -ext.length)) && kind === "file") {
      const name = entry.slice(0, -ext.length);
      return [{ name, file, dir: "", scope, bundle: null, off: config.config_off(name), runs: false }];
    }
    if (kind !== "dir") {
      return [];
    }
    const bundle = NAME.test(entry) ? Bundle.read(file, entry, scope) : null;
    if (bundle === null) {
      const why = Bundle.misfit(file, entry);
      if (why !== null) {
        MISFITS.push({ dir: file, why });
      }
      return [];
    }
    return [{ name: entry, file: bundle.code ?? "", dir: file, scope, bundle, off: config.config_off(entry), runs: false }];
  });
}

// what a path is: a file, a folder, or neither (gone, a broken link)
function plugin_kind(file: string): "file" | "dir" | null {
  try {
    const st = fs.statSync(file);
    return st.isFile() ? "file" : st.isDirectory() ? "dir" : null;
  } catch {
    return null;
  }
}

// a project's plugin new or changed since illi last started here: said,
// if it runs anything as you work (code, hooks, MCP servers)
function plugin_seen(found: Found): void {
  const b = found.bundle;
  const runs = [found.file !== "" ? "code" : "", (b?.hooks.length ?? 0) > 0 ? "hooks" : "", (b?.mcp.length ?? 0) > 0 ? "MCP servers" : ""].filter(Boolean);
  const files = [found.file, ...(b === null ? [] : [path.join(b.dir, ".claude-plugin", "plugin.json"), ...b.hooks.map((h) => h.file), ...b.mcp.map((m) => m.file)])].filter(Boolean);
  if (runs.length > 0 && Seen.changed("plugin " + (found.dir || found.file), files)) {
    plugin_say("This project's plugin " + found.name + " is new or changed since illi last started here: its " + runs.join(" and ").replace(/ and (?=.* and )/, ", ") + " run as you work (/agents lists it).");
  }
}

// what a plugin may use (Api), all it adds kept in its record; once it
// failed to load, all it asks is ignored. A hook, command or tool that
// won't do throws, so its author learns why as it loads
function plugin_api(p: Plugin, cwd: string): Api {
  const live = () => p.runs;
  return {
    api     : API,
    name    : p.name,
    dir     : path.dirname(p.file),
    cwd,
    profile : config.PROFILE,
    version : VERSION,
    on(hook, run) {
      if (!HOOKS.includes(hook) || typeof run !== "function") {
        throw new Error("on(" + JSON.stringify(hook) + "): no such hook, or no function; the hooks: " + HOOKS.join(", "));
      }
      if (live()) {
        p.hooks.push({ hook, run });
      }
    },
    command(name, about, run) {
      if (typeof name !== "string" || !NAME.test(name) || typeof run !== "function") {
        throw new Error("command(" + JSON.stringify(name) + "): a name is letters, digits, - and _, and it needs a function");
      }
      const go = async (args: string) => {
        try {
          const said = await run(args);
          return typeof said === "string" ? said : "";
        } catch (err) {
          plugin_trouble(p, "/" + name, err);
          return "";
        }
      };
      if (live()) {
        p.commands.push({ name, about: String(about ?? ""), plugin: p.name, run: go });
      }
    },
    tool(tool) {
      const name = "plugin__" + p.name + "__" + String(tool?.name);
      if (typeof tool?.name !== "string" || !TOOL.test(tool.name) || typeof tool.run !== "function" || p.tools.some((t) => t.name === name)) {
        throw new Error("tool(" + JSON.stringify(tool?.name) + "): a name is letters, digits, - and _, once, and it needs a run function");
      }
      if (live()) {
        p.tools.push({ name, info: String(tool.description ?? ""), schema: tool.schema ?? { type: "object", properties: {} }, run: tool.run });
      }
    },
    side(make) {
      if (live() && typeof make === "function") {
        p.sides.push(make);
      }
    },
    status(make) {
      if (live() && typeof make === "function") {
        p.statuses.push(make);
      }
    },
    theme(over) {
      if (live() && !p.ready) {
        p.themes.push(over);
      } else if (live()) {
        Theme.theme_plug(over);
        SCREEN?.redraw();
      }
    },
    note(text) {
      plugin_say(String(text));
    },
    send(text) {
      if (SCREEN === null) {
        console.error("illi: plugin " + p.name + ": send before the screen is up: " + String(text));
      } else {
        SCREEN.send(String(text));
      }
    },
    redraw() {
      SCREEN?.redraw();
    },
    log(...args) {
      console.error("illi: plugin " + p.name + ": " + args.map(String).join(" "));
    },
  };
}

// each running plugin's hooks of a kind, in their order
function plugin_hooks(hook: Hook): Array<[Plugin, (ev: any) => any]> {
  return LOADED.filter((p) => p.runs).flatMap((p) => p.hooks.filter((h) => h.hook === hook).map((h): [Plugin, (ev: any) => any] => [p, h.run]));
}

// what a plugin's makers made (side, status); one that throws is told
// and dropped for the run
function plugin_made<F>(p: Plugin, makers: F[], what: string, make: (f: F) => Line[]): Line[][] {
  return [...makers].flatMap((f) => {
    try {
      const made = make(f);
      return Array.isArray(made) && made.length > 0 ? [made] : [];
    } catch (err) {
      makers.splice(makers.indexOf(f), 1);
      plugin_trouble(p, what, err);
      return [];
    }
  });
}

// a line as pieces: text one piece, a piece's tone kept only if a token's
function plugin_pieces(l: unknown): Piece[] {
  const piece = (x: any): Piece => (typeof x === "object" && x !== null
    ? { text: String(x.text ?? ""), ...(Theme.theme_named(String(x.tone)) ? { tone: x.tone } : {}), bold: x.bold === true, dim: x.dim === true }
    : { text: String(x ?? "") });
  return Array.isArray(l) ? l.map(piece) : [piece(l)];
}

// what a hook answers, at most ms (0: no end) after, else it throws (its
// work goes on, unheeded); at once if the signal stops it. A promise left
// is never left failing unheeded (illi would take it as its own crash)
function plugin_wait<T>(value: T | Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  if (!(value instanceof Promise)) {
    return Promise.resolve(value);
  }
  value.catch(() => {});
  return new Promise<T>((done, fail) => {
    const timer = ms > 0 ? setTimeout(() => fail(new Error("no answer in " + ms / 1000 + " s")), ms) : undefined;
    const stop  = () => fail(new Error("stopped"));
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) {
      stop();
    }
    value.then(done, fail).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
    });
  });
}

// a plugin's failure: logged whole (illi.log, on a terminal), told once
// by plugin and what failed; why, in a word
function plugin_trouble(p: Plugin, what: string, err: unknown): string {
  const why = String((err as any)?.message ?? err).replace(/\.$/, "");
  console.error("illi: plugin " + p.name + " (" + p.file + "): " + what + ": " + ((err as any)?.stack ?? why));
  if (!TOLD.has(p.name + "\0" + what)) {
    TOLD.add(p.name + "\0" + what);
    plugin_say("The plugin " + p.name + (what === "loading" ? " didn't load" : " failed in " + what) + ": " + why + " (illi.log has more).");
  }
  return why;
}

// a text with its first letter a capital
function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// a note on the screen, or, till it's up, kept for it
function plugin_say(text: string): void {
  if (SCREEN === null) {
    WAITING.push(text);
  } else {
    SCREEN.note(text);
  }
}
