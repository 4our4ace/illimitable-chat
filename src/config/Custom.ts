// Custom
// ======
// What the user defines, as markdown files: agents, commands and skills,
// in config.DIR (theirs: ~/.illi/agents, ~/.illi/commands, ~/.illi/skills)
// and in the working dir's .illi (the project's, which wins by name).
// Each is read anew at each use, so an edit applies at the next call.
//
// An agent (agents/<name>.md) is, by its mode (as opencode's), a
// primary agent (primary: Illi runs as it, by Tab or /agent, named in the
// view), a subagent (subagent: only an agent spawns it, as spawn's
// `agent`), or both (all, the default). Its front matter also says what
// it does (description), runs on (model: a label or
// vendor:model:effort:speed; effort) and may use (tools, by name; none:
// all its role has); its body is its instructions, added to the system
// prompt of its calls.
//
// A command (commands/<name>.md) is a message typed as /name: its body,
// $ARGUMENTS in it the words after the name (none there: they go after
// it).
//
// A skill (skills/<name>/SKILL.md, as Claude Code's) is instructions for
// a kind of task, loaded when one comes (Tools.ts skill): its front
// matter says when (description), its body how; its folder may hold
// files the body names.
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

// Types
// =====

// what an agent may be: primary, a subagent, or both
export type Mode = "primary" | "subagent" | "all";

// an agent: its name (its file's), what it does, what it may be, runs on
// and may use (null: as its role has), its instructions, its file
export type Profile = {
  name        : string;
  description : string;
  mode        : Mode;
  model       : string | null;
  effort      : string | null;
  tools       : string[] | null;
  body        : string;
  file        : string;
};

// a command: its name, what it does, its message, its file
export type Command = { name: string; description: string; body: string; file: string };

// a skill: its name (its folder's), when to use it, its instructions, its
// folder
export type Skill = { name: string; description: string; body: string; dir: string };

// Constants
// =========

// a name an agent or command may have: a file's, as typed
const NAME = /^[a-z0-9][a-z0-9_-]*$/i;

const MODES: Mode[] = ["primary", "subagent", "all"];

// Custom
// ======

export namespace Custom {

  // where the user's files of a kind are, theirs first, the project's last
  export function dirs(cwd: string, kind: "agents" | "commands" | "skills"): string[] {
    return [path.join(config.DIR, kind), path.join(cwd, ".illi", kind)];
  }

  // the markdown files of a kind, by name: the project's over theirs
  export function files(cwd: string, kind: "agents" | "commands"): Map<string, string> {
    const out = new Map<string, string>();
    for (const dir of Custom.dirs(cwd, kind)) {
      const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : [];
      for (const f of names.filter((f) => NAME.test(f.slice(0, -3)))) {
        out.set(f.slice(0, -3), path.join(dir, f));
      }
    }
    return out;
  }

  export function agents(cwd: string): Profile[] {
    return [...Custom.files(cwd, "agents")].map(([name, file]) => Custom.profile(name, file));
  }

  // the agents Illi may run as (Tab, /agent), and those an agent may spawn
  export function primaries(cwd: string): Profile[] {
    return Custom.agents(cwd).filter((a) => a.mode !== "subagent");
  }

  export function subagents(cwd: string): Profile[] {
    return Custom.agents(cwd).filter((a) => a.mode !== "primary");
  }

  // an agent by name, in any case (Reviewer.md is reviewer too)
  export function agent(cwd: string, name: string | null): Profile | null {
    const found = [...Custom.files(cwd, "agents")].find(([own]) => own.toLowerCase() === name?.toLowerCase());
    return found === undefined ? null : Custom.profile(...found);
  }

  // the skills, by name: each folder holding a SKILL.md, the project's
  // over theirs
  export function skills(cwd: string): Skill[] {
    const out = new Map<string, Skill>();
    for (const dir of Custom.dirs(cwd, "skills")) {
      const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => NAME.test(f)).sort() : [];
      for (const name of names.filter((n) => fs.existsSync(path.join(dir, n, "SKILL.md")))) {
        const { head, body } = Custom.read(path.join(dir, name, "SKILL.md"));
        out.set(name.toLowerCase(), { name, description: head.description ?? "", body, dir: path.join(dir, name) });
      }
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  export function skill(cwd: string, name: string): Skill | null {
    return Custom.skills(cwd).find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  export function commands(cwd: string): Command[] {
    return [...Custom.files(cwd, "commands")].map(([name, file]) => {
      const { head, body } = Custom.read(file);
      return { name, description: head.description ?? "", body, file };
    });
  }

  export function command(cwd: string, name: string): Command | null {
    return Custom.commands(cwd).find((c) => c.name === name) ?? null;
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
      body,
      file,
    };
  }

  // a file's front matter (`key: value` lines between --- lines; a value
  // of > or | is the indented lines under it, as YAML's: folded into one,
  // or kept) and body
  export function read(file: string): { head: Record<string, string>; body: string } {
    const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
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
