// Plugins
// =======
// Code of the user's that runs inside illi, with all illi's rights (as
// OpenCode's plugins do): a TS or JS module in a plugins folder, global
// (config.ROOT/plugins: every profile's), the profile's own
// (config.DIR/plugins) or the project's (.illi/plugins), the project's
// only for a folder trusted (the `trusted` load is given: its code comes
// with the repository, so a clone would run it as it opened). A plugin is
// a file (name.ts, .js, .mjs) or a folder holding an index.ts, .js or
// .mjs; by name, the later folder's wins, and one named in the `off`
// setting is left out. Its default export is a function, called once as
// illi starts with what it may use (Api): hooks on what the chat does
// (Hooks: illi's start and quit, a turn's start and end, a message
// logged; a tool's call before it runs, to refuse it or change its
// input, and after, to change what the model reads), commands, tools of
// its own, lines in the side panel, a piece of the bottom line, the
// theme's colors (Theme.theme_plug), notes and messages.
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
// (attach) and tells the start and the quit; Chat.ts tells a turn's
// start and end and each message logged (emit); Commands.ts, Side.ts and
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
import * as config from "./Config.ts";
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
// run on this input
export type Verdict = { block: string } | { input: unknown };

// each hook: what it is given, what it may answer
export type Hooks = {
  "start"      : [{ cwd: string; profile: string; chat: boolean }, void];
  "quit"       : [{ cwd: string }, void];
  "turn.start" : [{ cwd: string }, void];
  "turn.end"   : [{ cwd: string; stopped: string | null }, void];
  "message"    : [{ id: number; kind: string; text: string; agent: string | null }, void];
  "tool.before": [ToolCall, Verdict | void];
  "tool.after" : [ToolCall & { output: Output }, Partial<Output> | void];
};
export type Hook = keyof Hooks;

// the hooks that only tell what happened, in order (emit)
type Told = "start" | "turn.start" | "turn.end" | "message";

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

// what a plugin may use, given to its function: its name, folder, the
// project's folder, the profile, illi's version; and what it adds
export type Api = {
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

// a plugin found: its name, its file (a folder's index), whether off
// (the `off` setting) and, once loaded, whether it runs
export type Found = { name: string; file: string; off: boolean; runs: boolean };

// a plugin loaded: its name and file, whether it runs (false: it failed
// to load), whether its function returned; what it gave: hooks,
// commands, tools (named plugin__<plugin>__<tool>), side and bottom
// line makers, themes (applied once it has loaded)
type Plugin = {
  name     : string;
  file     : string;
  runs     : boolean;
  ready    : boolean;
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

// the hooks there are
const HOOKS: Hook[] = ["start", "quit", "turn.start", "turn.end", "message", "tool.before", "tool.after"];

// the longest a plugin's function or a hook is waited for (ms)
const SLOW = 30000;

// the plugins found at the load, and those loaded, in their order
let FOUND: Found[] = [];
let LOADED: Plugin[] = [];

// the screen (null: not yet: notes wait for it), the notes waiting, those
// told once (by plugin and what failed), what is told, in order (emit)
let SCREEN: Screen | null = null;
let WAITING: string[] = [];
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
    const out = new Map<string, { file: string; at: number }>();
    Plugins.dirs(cwd, trusted).forEach((dir, at) => {
      for (const [name, file] of plugin_files(dir)) {
        out.set(name, { file, at });
      }
    });
    return [...out].sort(([a, x], [b, y]) => x.at - y.at || a.localeCompare(b)).map(([name, { file }]) => ({ name, file, off: config.config_off(name), runs: false }));
  }

  // the plugins loaded, each one's function called (SLOW at most), one
  // after another; the project's only if trusted(cwd), so a repository's
  // code runs only in a folder the user trusts. One that won't load is
  // told and left out, all it gave with it
  export async function load(cwd: string, trusted: (cwd: string) => boolean): Promise<void> {
    FOUND = Plugins.find(cwd, trusted);
    for (const found of FOUND.filter((f) => !f.off)) {
      const p: Plugin = { name: found.name, file: found.file, runs: true, ready: false, hooks: [], commands: [], tools: [], sides: [], statuses: [], themes: [] };
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

  // the plugins found at the load, those off and those that failed too
  export function found(): Found[] {
    return FOUND;
  }

  // the screen, once it is up: the notes waiting said
  export function attach(screen: Screen): void {
    SCREEN = screen;
    WAITING.splice(0).forEach((text) => screen.note(text));
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
          await plugin_wait(run(given), SLOW);
        } catch (err) {
          plugin_trouble(p, hook, err);
        }
      }
    });
    return QUEUE;
  }

  // illi quitting, told at once: its process ends, so a hook's promise
  // is never waited for
  export function quit(cwd: string): void {
    for (const [p, run] of plugin_hooks("quit")) {
      try {
        Promise.resolve(run(Object.freeze({ cwd }))).catch(() => {});
      } catch (err) {
        console.error("illi: plugin " + p.name + ": quit: " + String((err as any)?.message ?? err));
      }
    }
  }

  // a tool's call checked by each tool.before hook, before it runs (and
  // before the user is asked to allow it, so they're asked of what will
  // run): refused by the first that refuses it, else run on the input as
  // the hooks changed it (each given the one before's). A hook that fails
  // refuses it, saying why; a call stopped meanwhile is refused so
  export async function before_tool(call: ToolCall): Promise<Verdict> {
    let input = call.input;
    for (const [p, run] of plugin_hooks("tool.before")) {
      try {
        const said = await plugin_wait(run(Object.freeze({ ...call, input })), SLOW, call.signal);
        if (typeof said === "object" && said !== null && "block" in said) {
          return { block: String(said.block ?? "").trim() || "The plugin " + p.name + " refused this call." };
        }
        if (typeof said === "object" && said !== null && "input" in said) {
          input = said.input;
        }
      } catch (err) {
        if (call.signal?.aborted) {
          return { block: "Stopped." };
        }
        return { block: "The plugin " + p.name + " couldn't check this call (" + plugin_trouble(p, "tool.before", err) + "), so it was refused." };
      }
    }
    return { input };
  }

  // a tool's output, as each tool.after hook changes it (its text, whether
  // it failed; each given the one before's), what else it holds (its
  // images) kept. A hook that fails leaves it as it was
  export async function after_tool<O extends Output>(call: ToolCall, out: O): Promise<O> {
    let now = out;
    for (const [p, run] of plugin_hooks("tool.after")) {
      try {
        const said = await plugin_wait(run(Object.freeze({ ...call, output: { text: now.text, fail: now.fail } })), SLOW, call.signal);
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

  // all let go: none loaded, no screen, nothing waiting (a test's start)
  export function reset(): void {
    FOUND   = [];
    LOADED  = [];
    SCREEN  = null;
    WAITING = [];
    TOLD    = new Set();
    QUEUE   = Promise.resolve();
  }

}

// the plugins in a folder, by name: each file of FILES (not a .d.ts), each
// folder holding an index of them, as named; none if the folder isn't
function plugin_files(dir: string): Array<[string, string]> {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
  return names.flatMap((entry): Array<[string, string]> => {
    const file = path.join(dir, entry);
    const ext  = FILES.find((x) => entry.endsWith(x) && !entry.endsWith(".d.ts"));
    if (ext !== undefined && NAME.test(entry.slice(0, -ext.length)) && fs.statSync(file).isFile()) {
      return [[entry.slice(0, -ext.length), file]];
    }
    const index = FILES.map((x) => path.join(file, "index" + x)).find((f) => fs.existsSync(f));
    return ext === undefined && NAME.test(entry) && index !== undefined && fs.statSync(file).isDirectory() ? [[entry, index]] : [];
  });
}

// what a plugin may use (Api), all it adds kept in its record; once it
// failed to load, all it asks is ignored. A hook, command or tool that
// won't do throws, so its author learns why as it loads
function plugin_api(p: Plugin, cwd: string): Api {
  const live = () => p.runs;
  return {
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

// a note on the screen, or, till it's up, kept for it
function plugin_say(text: string): void {
  if (SCREEN === null) {
    WAITING.push(text);
  } else {
    SCREEN.note(text);
  }
}
