// Custom
// ======
// What the user defines, as markdown files: agents, commands and skills,
// in config.ROOT (global: ~/.illi/agents, ~/.illi/commands,
// ~/.illi/skills), a profile's folder (config.DIR, its own beside them)
// and the working dir's .illi (the project's); by name, the later wins.
// One named in the `off` setting is left out. Each is read anew at each
// use, so an edit applies at the next call.
//
// An agent (agents/<name>.md) is, by its mode (as opencode's), a
// primary agent (primary: illi runs as it, by Shift+Tab or /agent, named
// in the view), a subagent (subagent: only an agent spawns it, as
// spawn's `agent`), or both (all, the default). Its front matter also says what
// it does (description), runs on (model: a label or
// vendor:model:effort:speed; effort), may use (tools, by name; none:
// all its role has) and the color of its mark (color: #rrggbb; none: one
// made for it); its body is its instructions, added to the system prompt
// of its calls.
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
import * as config from "./Config.ts";
import CUSTOMIZE from "../skills/customize-illi/SKILL.md" with { type: "text" };

// Types
// =====

// what an agent may be: primary, a subagent, or both
export type Mode = "primary" | "subagent" | "all";

// an agent: its name (its file's), what it does, what it may be, runs on
// and may use (null: as its role has), its mark's color (#rrggbb; null:
// one made for it), its instructions, its file
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
};

// a command: its name, what it does, its message, its file
export type Command = { name: string; description: string; body: string; file: string };

// a skill: its name (its folder's), when to use it, its instructions, its
// folder ("": one built into illi), whether it's sticky
export type Skill = { name: string; description: string; body: string; dir: string; sticky: boolean };

// Constants
// =========

// a name an agent or command may have: a file's, as typed
const NAME = /^[a-z0-9][a-z0-9_-]*$/i;

const MODES: Mode[] = ["primary", "subagent", "all"];

// a front matter's yes (sticky: true)
const YES = /^\s*(true|yes|on)\s*$/i;

// the skills illi comes with: SKILL.md files, named in their front
// matter; {{illi}}, {{root}} and {{project}} in one are illi's folder,
// its root's and the project's .illi
const BUILT_IN = [CUSTOMIZE];

// Custom
// ======

export namespace Custom {

  // where the user's files of a kind are: the global ones first, then
  // the profile's, the project's last
  export function dirs(cwd: string, kind: "agents" | "commands" | "skills"): string[] {
    const own = config.DIR === config.ROOT ? [] : [path.join(config.ROOT, kind)];
    return [...own, path.join(config.DIR, kind), path.join(cwd, ".illi", kind)];
  }

  // the markdown files of a kind, by name, the later dir's over the
  // earlier's; but those turned off (all: those too)
  export function files(cwd: string, kind: "agents" | "commands", all = false): Map<string, string> {
    const out = new Map<string, string>();
    for (const dir of Custom.dirs(cwd, kind)) {
      const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : [];
      for (const f of names.filter((f) => NAME.test(f.slice(0, -3)) && (all || !config.config_off(f.slice(0, -3))))) {
        out.set(f.slice(0, -3), path.join(dir, f));
      }
    }
    return out;
  }


  export function agents(cwd: string): Profile[] {
    return [...Custom.files(cwd, "agents")].map(([name, file]) => Custom.profile(name, file));
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

  // an agent by name, in any case (Reviewer.md is reviewer too)
  export function agent(cwd: string, name: string | null): Profile | null {
    const found = [...Custom.files(cwd, "agents")].find(([own]) => own.toLowerCase() === name?.toLowerCase());
    return found === undefined ? null : Custom.profile(...found);
  }

  // the skills, by name: each folder holding a SKILL.md, the later dir's
  // over the earlier's; but those turned off (all: those too)
  export function skills(cwd: string, all = false): Skill[] {
    const out = new Map<string, Skill>();
    for (const { head, body } of BUILT_IN.map(Custom.parse)) {
      const filled = body.replaceAll("{{illi}}", config.DIR).replaceAll("{{root}}", config.ROOT).replaceAll("{{project}}", path.join(cwd, ".illi"));
      out.set(head.name.toLowerCase(), { name: head.name, description: head.description ?? "", body: filled, dir: "", sticky: YES.test(head.sticky ?? "") });
    }
    for (const dir of Custom.dirs(cwd, "skills")) {
      const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => NAME.test(f)).sort() : [];
      for (const name of names.filter((n) => fs.existsSync(path.join(dir, n, "SKILL.md")))) {
        const { head, body } = Custom.read(path.join(dir, name, "SKILL.md"));
        out.set(name.toLowerCase(), { name, description: head.description ?? "", body, dir: path.join(dir, name), sticky: YES.test(head.sticky ?? "") });
      }
    }
    return [...out.values()].filter((s) => all || !config.config_off(s.name)).sort((a, b) => a.name.localeCompare(b.name));
  }

  export function skill(cwd: string, name: string): Skill | null {
    return Custom.skills(cwd).find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  // the sticky skills on
  export function stuck(cwd: string): Skill[] {
    return Custom.skills(cwd).filter((s) => s.sticky && config.config_sticky(s.name));
  }

  // whether a skill's on and off is global (the root's list): in the
  // default profile, or a global skill's, or one built in
  export function global(skill: Skill): boolean {
    return config.DIR === config.ROOT || skill.dir === "" || skill.dir.startsWith(path.join(config.ROOT, "skills") + path.sep);
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
    return [...Custom.files(cwd, "commands")].map(([name, file]) => {
      const { head, body } = Custom.read(file);
      return { name, description: head.description ?? "", body, file };
    });
  }

  // a command's message, given the words after its name
  export function expand(cmd: Command, args: string): string {
    return cmd.body.includes("$ARGUMENTS") ? cmd.body.replaceAll("$ARGUMENTS", args) : (cmd.body + (args === "" ? "" : "\n\n" + args));
  }

  export function profile(name: string, file: string): Profile {
    const { head, body } = Custom.read(file);
    const list = head.tools?.replace(/^\[|\]$/g, "").split(",").map((t) => t.trim()).filter(Boolean);
    const mode = (head.mode ?? "").toLowerCase() as Mode;
    return {
      name,
      description : head.description ?? "",
      mode        : MODES.includes(mode) ? mode : "all",
      model       : head.model || null,
      effort      : head.effort || null,
      tools       : list === undefined ? null : list,
      color       : /^#[0-9a-f]{6}$/i.test(head.color ?? "") ? head.color : null,
      body,
      file,
    };
  }

  // a file's front matter (`key: value` lines between --- lines; a value
  // of > or | is the indented lines under it, as YAML's: folded into one,
  // or kept) and body
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
      const value = lines[k].slice(at + 1).trim();
      const block = /^([>|])[-+]?$/.exec(value);
      const under = [];
      while (block !== null && k + 1 < lines.length && (/^\s/.test(lines[k + 1]) || lines[k + 1].trim() === "")) {
        under.push(lines[++k].trim());
      }
      const whole = block === null ? value : under.join(block[1] === ">" ? " " : "\n").trim();
      head[lines[k - under.length].slice(0, at).trim().toLowerCase()] = whole.replace(/^(["'])(.*)\1$/, "$2");
    }
    return { head, body: text.slice(match?.[0].length ?? 0).trim() };
  }

  // what an agent runs on: its model (a label of the pick's vendor or of
  // the first offered, or vendor:model:effort:speed) and effort over the
  // pick given; a string: why it can't
  export function pick(profile: Profile, base: Pick, offer: Offer): Pick | string {
    let pick: Pick | null = base;
    if (profile.model !== null) {
      const [a, b, c, d] = profile.model.split(":");
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
