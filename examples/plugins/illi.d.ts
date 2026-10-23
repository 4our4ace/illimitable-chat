// illi's plugin API, version 1: the types of what a plugin is given.
// Copy this file beside your plugin and import its types:
//
//     import type { Illi } from "./illi.d.ts";
//     export default function (illi: Illi) { ... }
//
// illi never loads a .d.ts as a plugin. docs/customize.md says what each
// member and hook does.

// a theme's token: the color every part of the screen of its kind takes
export type Token = "accent" | "you" | "link" | "success" | "warning" | "error" | "dim";

// a tool's call, as a hook is given it: the tool, its input, who calls
// (null: illi's own turn; else the agent's name), the project's folder,
// what stops it (the turn's stop)
export type ToolCall = { tool: string; input: any; agent: string | null; cwd: string; signal?: AbortSignal };

// what a tool answers: its text, whether it failed
export type Output = { text: string; fail: boolean };

// what a tool's check decides: refused (the model reads why), or run on
// this input
export type Verdict = { block: string } | { input: unknown };

// each hook: what it is given, what it may return
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

// a piece of a line (at the side, on the bottom line): its text, the
// token it is colored in, bold, dim; a line: text, a piece, or pieces
export type Piece = { text: string; tone?: Token; bold?: boolean; dim?: boolean };
export type Line = string | Piece | Piece[];

// a tool of the plugin's: its name (offered as plugin__<plugin>__<name>),
// what it does (the model reads it), its input's JSON schema, what runs it
export type Tool = { name: string; description: string; schema?: object; run: (input: any, call: ToolCall) => string | Output | Promise<string | Output> };

// what a plugin's function is given
export type Illi = {
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
  theme(over: { accent?: string; tokens?: Partial<Record<Token, string>>; colors?: Record<string, string> }): void;
  note(text: string): void;
  send(text: string): void;
  redraw(): void;
  log(...args: unknown[]): void;
};
