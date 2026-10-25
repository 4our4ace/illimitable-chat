// Custom
// ======
// What the user defines, as markdown files: agents, commands and skills,
// in config.ROOT (global: ~/.illi/agents, ~/.illi/commands,
// ~/.illi/skills), a profile's folder (config.DIR, its own beside them)
// and the working dir's .illi (the project's, only in a folder the user
// trusts: Trusted.ts); by name, the later wins. Skills shared with other
// agents (opencode's, Codex's) are read too, each under illi's own of
// its scope: ~/.agents/skills (config.AGENTS_DIR) under the global ones,
// a trusted project's .agents/skills, from its top down to the working
// dir (config_down), under its .illi. The plugins' bundles
// (Plugins.bundles) add theirs, under the user's own: a file of the
// user's always wins over a plugin's of its name, a later plugin's over
// an earlier's, and a plugin never takes a name built into illi; one
// hidden so is listed as plugin:name, and every plugin's part answers to
// that name too (parts, lookup). A plugin's part reads its variables
// (Bundle.fill); its command takes $1..$9 too, as Claude Code's do.
// One named in the `off` setting is left out (a plugin's part also as
// plugin:name). Each is read anew at each use, so an edit applies at the
// next call.
//
// An agent (agents/<name>.md) is, by its mode (as opencode's), a
// primary agent (primary: illi runs as it, by Shift+Tab or /agent, named
// in the view), a subagent (subagent: only an agent spawns it, as
// spawn's `agent`), or both (all, the default). Its front matter also says what
// it does (description), runs on (model: a label or
// vendor:model:effort:speed; effort), may use (tools, by name, on
// claude-code Claude Code's built-in tools too; none: all its role has)
// and the color of its mark (color: #rrggbb; none: one made for it); its
// body is its instructions, added to the system prompt of its calls.
//
// A command (commands/<name>.md) is a message typed as /name: its body,
// $ARGUMENTS in it the words after the name (none there: they go after
// it).
//
// A skill (skills/<name>/SKILL.md, as Claude Code's) is instructions for
// a kind of task, loaded when one comes (Tools.ts skill): its front
// matter says when (description), its body how; its folder may hold
// files the body names. illi comes with some of its own (BUILT_IN, in
// the binary), the user's or a project's over them by name: one,
// customize-illi, teaches it all this, so it can customize itself.
//
// A sticky skill (sticky: true) is one for every reply, not a task: a
// way to write, a language. Its command turns it on and off (stick),
// and while on, its instructions are in every turn's system prompt
// (Tools.stuck), so no summary drops them. It is on in the `sticky`
// setting where its file is: a global one's (or one built in) the
// root's, so in every profile; else the profile's (Config ADDS).
//
//     ---
//     description: Reviews a change for bugs, reading only
//     mode: subagent
//     model: gpt-6.1-sol
//     effort: high
//     tools: zoom, date, shell, read
//     ---
//     You review changes for bugs. Read the diff, then ...

import * as fs from "node:fs";
import * as path from "node:path";
import { EFFORTS, Pick, type Offer } from "../ai/Pick.ts";
import { Bundle } from "./Bundle.ts";
import * as config from "./Config.ts";
import { Plugins } from "./Plugins.ts";
import { Trusted } from "./Trusted.ts";
import CUSTOMIZE from "../skills/customize-illi/SKILL.md" with { type: "text" };

// Types
// =====

// what an agent may be: primary, a subagent, or both
export type Mode = "primary" | "subagent" | "all";

// an agent: its name (its file's; a plugin's hidden by another:
// plugin:name), what it does, what it may be, runs on and may use (null:
// as its role has; Claude Code's tool names read as illi's), its mark's
// color (#rrggbb; null: one made for it), its instructions, its file, its
// plugin (null: the user's own), what to know of it (a tool it lost), the
// Claude Code built-in tools it may use on claude-code (null: it has no
// tools list, so all; a list naming none of them: none)
export type Profile = {
  name        : string;
  description : string;
  mode        : Mode;
  model       : string | null;
  effort      : string | null;
  tools       : string[] | null;
  color       : string | null;
  body        : string;
  file        : string;
  plugin?     : string | null;
  notes?      : string[];
  builtins?   : string[] | null;
};

// a command: its name (as listed), what it does, its message, its file,
// its plugin (null: the user's own) and its name there
export type Command = { name: string; description: string; body: string; file: string; plugin?: string | null; own?: string };

// a skill: its name (its folder's; as listed), when to use it, its
// instructions, its folder ("": one built into illi), whether it's
// sticky, whether the model is offered it (disable-model-invocation:
// only /name loads it), its plugin (null: none) and its name there,
// whether its on and off is every profile's (Custom.global)
export type Skill = { name: string; description: string; body: string; dir: string; sticky: boolean; model?: boolean; plugin?: string | null; own?: string; global?: boolean };

// a part of a kind as found: its name as listed (a plugin's hidden by
// another of its name: plugin:name), its name in its folder, its file (a
// skill: its folder), its plugin's bundle (null: the user's own)
export type Listed = { name: string; own: string; file: string; plugin: Bundle | null };

// Constants
// =========

// a name an agent or command may have: a file's, as typed
const NAME = /^[a-z0-9][a-z0-9_-]*$/i;

const MODES: Mode[] = ["primary", "subagent", "all"];

// a front matter's yes (sticky: true)
const YES = /^\s*(true|yes|on)\s*$/i;

// Claude Code's tool names in an agent's tools list, as illi's (its
// subagents' tool, Agent, once Task, as spawn); its searches (Glob, Grep,
// LS) are illi's shell, given only where the list gives that power
// already (Bash, Write, Edit); its model families, each the newest of it
// offered (inherit: the pick's)
const CLAUDE_TOOLS = new Map([["Read", "read"], ["Write", "write"], ["Edit", "edit"], ["MultiEdit", "edit"], ["Bash", "shell"], ["Agent", "spawn"], ["Task", "spawn"], ["TodoWrite", "todo"]]);
const CLAUDE_SEARCH = ["Glob", "Grep", "LS"];
const CLAUDE_STRONG = ["Bash", "Write", "Edit", "MultiEdit", "shell", "write", "edit"];

// illi's tools in an agent's tools list as Claude Code's built-in ones,
// which an agent on claude-code uses in their place (Tools.list `lean`)
const CLAUDE_OWN = new Map([["read", "Read"], ["write", "Write"], ["edit", "Edit"], ["shell", "Bash"]]);
const FAMILIES = ["sonnet", "opus", "haiku", "fable"];

// the skills illi comes with: SKILL.md files, named in their front
// matter; {{illi}}, {{root}} and {{project}} in one are illi's folder,
// its root's and the project's .illi
const BUILT_IN = [CUSTOMIZE];

// Custom
// ======

export namespace Custom {

  // where the user's files of a kind are: the global ones first (for
  // skills, those shared with other agents before illi's own), then the
  // profile's, the project's last (a trusted folder's only; for skills,
  // its .agents/skills from its top down, then its .illi's); each once
  export function dirs(cwd: string, kind: "agents" | "commands" | "skills"): string[] {
    const skills  = kind === "skills";
    const shared  = skills ? [path.join(config.AGENTS_DIR, "skills")] : [];
    const own     = config.DIR === config.ROOT ? [] : [path.join(config.ROOT, kind)];
    const trusted = Trusted.has(Trusted.folder(cwd));
    const tree    = trusted && skills ? config.config_down(cwd).map((dir) => path.join(dir, ".agents", "skills")) : [];
    const project = trusted ? [path.join(cwd, ".illi", kind)] : [];
    return [...new Set([...shared, ...own, path.join(config.DIR, kind), ...tree, ...project])];
  }

  // whether a skill's folder is a global one's: in the root's skills, or
  // those shared with other agents (~/.agents/skills)
  export function global_dir(file: string): boolean {
    return [path.join(config.ROOT, "skills"), path.join(config.AGENTS_DIR, "skills")].some((dir) => file.startsWith(dir + path.sep));
  }

  // a kind's parts as listed: the plugins' first (in their order), then
  // the user's own (global, profile, project), the later over the
  // earlier of a name, so the user's own always win; a plugin never over
  // a name taken (built into illi). One hidden so: the user's, gone; a
  // plugin's, listed as plugin:name. Those off left out (all: kept), by
  // name or, a plugin's, as plugin:name
  export function parts(cwd: string, kind: "agents" | "commands" | "skills", all = false, taken: Set<string> = new Set()): Listed[] {
    const found: Listed[] = [];
    for (const b of Plugins.bundles()) {
      found.push(...b[kind].map((p) => ({ name: p.name, own: p.name, file: p.file, plugin: b })));
    }
    for (const dir of Custom.dirs(cwd, kind)) {
      found.push(...own_parts(dir, kind).map((name) => ({ name, own: name, file: path.join(dir, kind === "skills" ? name : name + ".md"), plugin: null })));
    }
    const live = found.filter((f) => all || !(config.config_off(f.own) || (f.plugin !== null && config.config_off(f.plugin.name + ":" + f.own))));
    const wins = new Map<string, Listed>();
    for (const f of live.filter((f) => f.plugin === null || !taken.has(f.own.toLowerCase()))) {
      wins.set(f.own.toLowerCase(), f);
    }
    return live.flatMap((f) => (wins.get(f.own.toLowerCase()) === f ? [f] : f.plugin === null ? [] : [{ ...f, name: f.plugin.name + ":" + f.own }])).sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  }

  // a part by name, in any case: as listed, or a plugin's as
  // plugin:name (its winner's too); null: none
  export function lookup(parts: Listed[], name: string): Listed | null {
    const want = name.toLowerCase();
    const at = want.indexOf(":");
    return parts.find((p) => p.name.toLowerCase() === want) ?? (at < 0 ? undefined : parts.find((p) => p.plugin?.name.toLowerCase() === want.slice(0, at) && p.own.toLowerCase() === want.slice(at + 1))) ?? null;
  }

  export function agents(cwd: string): Profile[] {
    return Custom.parts(cwd, "agents").map((p) => Custom.profile(p.name, p.file, p.plugin));
  }

  // the agents illi may run as (Shift+Tab, /agent), of all (as read, if they
  // were), and those an agent may spawn
  export function primaries(cwd: string, all = Custom.agents(cwd)): Profile[] {
    return all.filter((a) => a.mode !== "subagent");
  }

  // the primary agents, as a note names them; none yet: where an agent's
  // file goes (from ~)
  export function primaries_said(cwd: string): string {
    const names = Custom.primaries(cwd).map((a) => a.name);
    const dirs  = Custom.dirs(cwd, "agents").map(config.config_home);
    return names.length > 0 ? "Your primary agents: " + names.join(", ") + "." : "No primary agents yet: add an agent file (mode: primary, or none) to " + dirs.join(" or ") + "; /agents shows how.";
  }

  export function subagents(cwd: string): Profile[] {
    return Custom.agents(cwd).filter((a) => a.mode !== "primary");
  }

  // an agent by name, in any case (Reviewer.md is reviewer too; a
  // plugin's as plugin:name too)
  export function agent(cwd: string, name: string | null): Profile | null {
    const found = name === null ? null : Custom.lookup(Custom.parts(cwd, "agents"), name);
    return found === null ? null : Custom.profile(found.name, found.file, found.plugin);
  }

  // the skills, by name: illi's own (BUILT_IN), then each folder holding
  // a SKILL.md (parts: the plugins', then the user's, a user's over one
  // built in, never a plugin's); but those turned off (all: those too)
  export function skills(cwd: string, all = false): Skill[] {
    const out = new Map<string, Skill>();
    for (const { head, body } of BUILT_IN.map(Custom.parse)) {
      const filled = body.replaceAll("{{illi}}", config.DIR).replaceAll("{{root}}", config.ROOT).replaceAll("{{project}}", path.join(cwd, ".illi"));
      out.set(head.name.toLowerCase(), { name: head.name, description: head.description ?? "", body: filled, dir: "", sticky: YES.test(head.sticky ?? ""), model: true, plugin: null, own: head.name, global: true });
    }
    for (const p of Custom.parts(cwd, "skills", all, new Set(out.keys()))) {
      const { head, body } = safe_read(path.join(p.file, "SKILL.md"));
      const global = p.plugin === null ? Custom.global_dir(p.file) : p.plugin.scope === "global";
      out.set(p.name.toLowerCase(), { name: p.name, description: head.description ?? "", body: p.plugin === null ? body : Bundle.fill(body, p.plugin, p.file), dir: p.file, sticky: YES.test(head.sticky ?? ""), model: !YES.test(head["disable-model-invocation"] ?? ""), plugin: p.plugin?.name ?? null, own: p.own, global });
    }
    return [...out.values()].filter((s) => all || !config.config_off(s.name)).sort((a, b) => a.name.localeCompare(b.name));
  }

  // a skill by name, in any case (a plugin's as plugin:name too)
  export function skill(cwd: string, name: string): Skill | null {
    const all = Custom.skills(cwd);
    const want = name.toLowerCase();
    const at = want.indexOf(":");
    return all.find((s) => s.name.toLowerCase() === want) ?? (at < 0 ? undefined : all.find((s) => s.plugin?.toLowerCase() === want.slice(0, at) && s.own?.toLowerCase() === want.slice(at + 1))) ?? null;
  }

  // the sticky skills on
  export function stuck(cwd: string): Skill[] {
    return Custom.skills(cwd).filter((s) => s.sticky && config.config_sticky(s.name));
  }

  // whether a skill's on and off is global (the root's list): in the
  // default profile, or a global skill's (a global plugin's too), or one
  // built in
  export function global(skill: Skill): boolean {
    return config.DIR === config.ROOT || skill.dir === "" || skill.global === true || Custom.global_dir(skill.dir);
  }

  // a sticky skill turned on, in the list where its file is (global: the
  // root's), or off, out of both lists; null: done, else why not (a
  // variable sets the lists)
  export function stick(skill: Skill, on: boolean): string | null {
    const env  = config.config_env_set("sticky");
    const name = skill.name.toLowerCase();
    if (env !== null) {
      return "sticky is set by " + env + ": unset it to turn " + skill.name + " " + (on ? "on" : "off") + " here.";
    }
    const home = Custom.global(skill);
    for (const root of config.DIR === config.ROOT ? [true] : [true, false]) {
      const was  = config.config_names("sticky", root);
      const next = [...was.filter((n) => n !== name), ...(on && root === home ? [name] : [])];
      if (next.join() !== was.join()) {
        config.config_set("sticky", next.length === 0 ? null : next.join(", "), root);
      }
    }
    return null;
  }

  export function commands(cwd: string): Command[] {
    return Custom.parts(cwd, "commands").map((p) => {
      const { head, body } = safe_read(p.file);
      return { name: p.name, description: head.description ?? "", body: p.plugin === null ? body : Bundle.fill(body, p.plugin), file: p.file, plugin: p.plugin?.name ?? null, own: p.own };
    });
  }

  // a command's message, given the words after its name: $ARGUMENTS in
  // it those words (none there: they go after it); a plugin's, as Claude
  // Code's, takes each word as $1..$9 too
  export function expand(cmd: Command, args: string): string {
    const words = args.split(/\s+/).filter(Boolean);
    const spread = cmd.plugin != null && /\$[1-9]\b/.test(cmd.body);
    const body = spread ? cmd.body.replace(/\$([1-9])\b/g, (_, n: string) => words[Number(n) - 1] ?? "") : cmd.body;
    return body.includes("$ARGUMENTS") ? body.replaceAll("$ARGUMENTS", args) : spread ? body : body + (args === "" ? "" : "\n\n" + args);
  }

  // an agent's file read: its tools list's Claude Code names as illi's
  // (a plugin's own MCP servers, as mcp__plugin_<plugin>_<server>, as
  // illi names them), and the Claude Code built-in tools it gives
  // (agent_builtins); a search it can't do said. The list as YAML writes
  // it too: in [ ], each name quoted or not (a `- name` list: parse)
  export function profile(name: string, file: string, plugin: Bundle | null = null): Profile {
    const { head, body } = safe_read(file);
    const list = head.tools?.replace(/^\[|\]$/g, "").split(",").map((t) => unquote(t.trim())).filter(Boolean);
    const mode = (head.mode ?? "").toLowerCase() as Mode;
    const tools = list === undefined ? null : agent_tools(list, plugin?.name ?? null);
    const lost = list !== undefined && list.some((t) => CLAUDE_SEARCH.includes(t)) && !list.some((t) => CLAUDE_STRONG.includes(t));
    return {
      name,
      description : head.description ?? "",
      mode        : MODES.includes(mode) ? mode : "all",
      model       : head.model || null,
      effort      : head.effort || null,
      tools,
      color       : /^#[0-9a-f]{6}$/i.test(head.color ?? "") ? head.color : null,
      body        : plugin === null ? body : Bundle.fill(body, plugin),
      file,
      plugin      : plugin?.name ?? null,
      notes       : lost ? ["its tools name Claude Code's searches (Glob, Grep, LS), which illi does with shell; it names no Bash, Write or Edit, so it gets no shell"] : [],
      builtins    : list === undefined ? null : agent_builtins(list),
    };
  }

  // a file's front matter (`key: value` lines between --- lines; a value
  // of > or | is the indented lines under it, as YAML's: folded into one,
  // or kept; none, the `- item` lines under it, as YAML's list: each
  // unquoted, joined by commas, as a tools list reads them) and body
  export function read(file: string): { head: Record<string, string>; body: string } {
    return Custom.parse(fs.readFileSync(file, "utf8"));
  }

  // a file's text, as read does
  export function parse(file: string): { head: Record<string, string>; body: string } {
    const text = file.replace(/\r\n/g, "\n");
    const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
    const lines = match === null ? [] : match[1].split("\n");
    const head: Record<string, string> = {};
    for (let k = 0; k < lines.length; k++) {
      const at = lines[k].indexOf(":");
      if (at <= 0 || /^\s/.test(lines[k])) {
        continue;
      }
      const key = lines[k].slice(0, at).trim().toLowerCase();
      const value = lines[k].slice(at + 1).trim();
      const block = /^([>|])[-+]?$/.exec(value);
      const under = [];
      while (block !== null && k + 1 < lines.length && (/^\s/.test(lines[k + 1]) || lines[k + 1].trim() === "")) {
        under.push(lines[++k].trim());
      }
      const items = [];
      while (value === "" && k + 1 < lines.length && /^\s*-\s+\S/.test(lines[k + 1])) {
        items.push(unquote(lines[++k].replace(/^\s*-\s+/, "").trim()));
      }
      const whole = block !== null ? under.join(block[1] === ">" ? " " : "\n").trim() : value;
      head[key] = items.length > 0 ? items.join(", ") : unquote(whole);
    }
    return { head, body: text.slice(match?.[0].length ?? 0).trim() };
  }

  // what an agent runs on: its model (a label of the pick's vendor or of
  // the first offered, or vendor:model:effort:speed) and effort over the
  // pick given; a string: why it can't
  export function pick(profile: Profile, base: Pick, offer: Offer): Pick | string {
    let pick: Pick | null = base;
    const model = agent_model(profile.model, offer);
    if (model !== null) {
      const [a, b, c, d] = model.split(":");
      const full = b === undefined ? null : Pick.read({ vendor: a, model: b, effort: c ?? base.effort, speed: d ?? "slow" }, offer);
      const vendors = [base.vendor, ...offer.vendors.filter((v) => v !== base.vendor)];
      const label = vendors.map((vendor) => Pick.read({ vendor, model: a, effort: base.effort, speed: "slow" }, offer)).find((p) => p !== null) ?? null;
      pick = b === undefined ? label : full;
    }
    if (pick === null) {
      return profile.name + "'s model " + profile.model + " isn't offered (" + offer.models.join(", ") + ")";
    }
    if (profile.effort !== null && !EFFORTS.includes(profile.effort)) {
      return profile.name + "'s effort " + profile.effort + " is none of " + EFFORTS.join(", ");
    }
    return { ...pick, effort: profile.effort ?? pick.effort };
  }

  // an agent's instructions, as its system prompt's section
  export function section(profile: Profile | null): string {
    return profile === null || profile.body === "" ? "" : "\n\n# Agent: " + profile.name + "\n\n" + profile.body;
  }

  // the tools of a role its agent may use: each named, or each under a
  // name (mcp__github: all of that server's; mcp: every server's)
  export function allow<T extends { name: string }>(profile: Profile | null, tools: T[]): T[] {
    const only = profile?.tools;
    return only == null ? tools : tools.filter((t) => only.some((o) => t.name === o || t.name.startsWith(o + "__")));
  }

}

// the user's own parts in a folder: its .md files' names (agents,
// commands), or its folders holding a SKILL.md (skills); none if it
// isn't one
function own_parts(dir: string, kind: "agents" | "commands" | "skills"): string[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
  return kind === "skills" ? names.filter((n) => NAME.test(n) && fs.existsSync(path.join(dir, n, "SKILL.md"))) : names.filter((f) => f.endsWith(".md") && NAME.test(f.slice(0, -3))).map((f) => f.slice(0, -3));
}

// a file read as read does; one that won't read (gone since it was
// listed), empty, logged
function safe_read(file: string): { head: Record<string, string>; body: string } {
  try {
    return Custom.read(file);
  } catch (err: any) {
    console.error("illi: " + file + ": " + String(err?.message ?? err));
    return { head: {}, body: "" };
  }
}

// an agent's tools list with Claude Code's names as illi's: each as
// CLAUDE_TOOLS says, its searches as shell where it may have it, its
// plugin's own MCP servers as illi names them; any other as written
function agent_tools(list: string[], plugin: string | null): string[] {
  const strong = list.some((t) => CLAUDE_STRONG.includes(t));
  const own = plugin === null ? null : "mcp__plugin_" + plugin + "_";
  const out = list.flatMap((t) => (CLAUDE_TOOLS.has(t) ? [CLAUDE_TOOLS.get(t)!] : CLAUDE_SEARCH.includes(t) ? (strong ? ["shell"] : []) : own !== null && t.startsWith(own) ? ["mcp__" + t.slice(own.length)] : [t]));
  return [...new Set(out)];
}

// the Claude Code built-in tools an agent's tools list gives on
// claude-code, as Claude Code's own subagent would have them: Claude
// Code's names as they are (Glob, Grep: searches kept, though illi's own
// loop has none without a shell), but one illi reads as its read, write,
// edit or shell, and illi's own of those, as the Claude Code tool for it
// (CLAUDE_OWN: MultiEdit, gone from Claude Code, as Edit); one illi reads
// as another of its own (Agent, Task: spawn; TodoWrite: todo) none, nor
// illi's other tools and MCP servers, as illi gives those itself (so the
// agent spawns one way, its subagents at illi's side, and keeps one to-do
// list). --tools reaches only Claude Code's built-in tools: its own MCP
// servers and plugins stay
function agent_builtins(list: string[]): string[] {
  const out = list.map((t) => {
    const own = CLAUDE_TOOLS.get(t) ?? t;
    return CLAUDE_OWN.get(own) ?? (own === t && /^[A-Z][A-Za-z]*$/.test(t) ? t : null);
  });
  return [...new Set(out.filter((t): t is string => t !== null))];
}

// a value without the quotes round it, as YAML reads it
function unquote(text: string): string {
  return text.replace(/^(["'])(.*)\1$/, "$2");
}

// an agent's model as its pick reads it: inherit, none (the pick's); a
// model family alone (sonnet), the newest offered of it, else none
function agent_model(model: string | null, offer: Offer): string | null {
  if (model === null || model.toLowerCase() === "inherit") {
    return null;
  }
  if (!FAMILIES.includes(model.toLowerCase())) {
    return model;
  }
  const kin = offer.models.filter((m) => m.toLowerCase().startsWith(model.toLowerCase() + "-"));
  return kin.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1) ?? null;
}
