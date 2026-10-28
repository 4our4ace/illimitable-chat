// Permissions
// ===========
// Whether a tool call may run: each call asks for an action on
// resources (Access.ts: a shell command's simple commands, a file's
// path, a folder outside the project), and rules say allow, ask or
// deny, by wildcard (match):
//
//     { "action": "shell", "resource": "git push *", "effect": "ask" }
//
// A resource takes the effect of the last rule matching its action and
// itself (none: ask). A request is refused if any of its resources is
// denied by illi's rules and the user's (configured: the project's saved
// approvals can't undo a deny), else asked if any is asked once the
// saved approvals count too, else run. illi's own rules come first (base:
// all runs; a .env read asks, a .env.example's doesn't; a folder outside
// the project asks, illi's customization places don't), the user's after
// them, so theirs win. Two modes: default, the rules as they are; trust,
// what they ask runs too (a deny still refuses).
//
// The user's rules and the approvals "don't ask again" saves are in one
// file (config.PERMISSIONS: permissions.json in illi's folder, a
// profile's in its own):
//
//     { "rules":    { "shell": { "git push *": "ask", "rm -rf /*": "deny" },
//                     "external_directory": { "~/notes/*": "allow" },
//                     "webfetch": "ask" },
//       "projects": { "/home/me/app": { "saved": [{ "action": "shell", "resource": "git push *" }] } } }
//
// rules: by action (* any), a resource pattern's effect, or one effect
// for every resource; in the file's order, the later over the earlier. A
// pattern's leading ~/ is home (not a shell one's: a command is matched
// as written). saved, by project (its folder: Trusted.folder), each an
// action and resource allowed. Read again whenever the file changes, so
// a hand edit counts at the next call. An older illi's file is read as
// this one (legacy: its write rules as edit's, its mcp rules as rules
// on the MCP tools they name, its grants as saved approvals; a save
// changes a project's grants into approvals for good, the rules never;
// the new rules' order and paths hold for it). A file that won't
// read, or a rule that isn't allow, ask or deny, is said, never taken as
// no rules: the caller asks about everything but illi's chat tools then
// (Tools.guard). A save reads the file again just before, so what
// another illi or a hand edit put there stays, then writes a temporary
// file and renames it over, so a crash never leaves half a file; one
// that won't read isn't written.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Types
// =====

export type Effect = "allow" | "ask" | "deny";

// a rule: the action it is about (a pattern: * any), the resources (a
// pattern; exact: the resource itself, its * and ? as they are, as an
// approval of just what was refused is: Tools.allow), its effect
export type Rule = { action: string; resource: string; effect: Effect; exact?: boolean };

// what runs without asking: what the rules allow (default); also what
// they ask (trust)
export type Mode = "default" | "trust";
export const MODES: Mode[] = ["default", "trust"];

// what the checks read of the file: the user's rules, a project's saved
// approvals (each an allow)
export type Read = { rules: Rule[]; saved: Rule[] };

// a request's verdict: its effect, and which of its resources made it so
// (by index: those denied, else those asked; none for allow)
export type Verdict = { effect: Effect; by: number[] };

// the file as last read: which (its path, and its change time and size:
// another one means read again), the object in it (null: none there), or
// why it won't read
type Seen = { file: string; stamp: string; data: Record<string, any> | null | string };

// Constants
// =========

const EFFECTS: Effect[] = ["allow", "ask", "deny"];

// how strict each effect is (Permissions.shadowed)
const STRICT: Record<Effect, number> = { allow: 0, ask: 1, deny: 2 };

// the patterns compiled, by pattern
const COMPILED = new Map<string, RegExp>();

let SEEN: Seen | null = null;

// Permissions
// ===========

export namespace Permissions {

  // whether a text matches a pattern: * any characters (/ too), ? one; a
  // pattern ending in " *" matches the text without its last words too
  // (git push * matches git push). Backslashes are slashes, in both
  export function match(text: string, pattern: string): boolean {
    let re = COMPILED.get(pattern);
    if (re === undefined) {
      const flat = pattern.replaceAll("\\", "/");
      const tail = flat.endsWith(" *");
      const each = (c: string) => (c === "*" ? "[^]*" : c === "?" ? "[^]" : /[\w\s/]/.test(c) ? c : "\\u{" + c.codePointAt(0)!.toString(16) + "}");
      re = new RegExp("^" + [...(tail ? flat.slice(0, -2) : flat)].map(each).join("") + (tail ? "(?: [^]*)?" : "") + "$", "u");
      COMPILED.set(pattern, re);
    }
    return re.test(text.replaceAll("\\", "/"));
  }

  // patterns, those another of them covers left out (it matches them as
  // text: ~/x/* covers ~/x/y/*, git * covers git push *), so a question
  // says, and "don't ask again" saves, the widest alone; of patterns
  // covering each other, the first
  export function fold(patterns: string[]): string[] {
    const all = [...new Set(patterns)];
    return all.filter((p, k) => !all.some((o, j) => j !== k && Permissions.match(p, o) && (j < k || !Permissions.match(o, p))));
  }

  // the rule a resource falls under: the last matching it and its action
  // (none: ask)
  export function evaluate(action: string, resource: string, ...rules: Rule[][]): Rule {
    return rules.flat().findLast((r) => match(action, r.action) && (r.exact === true ? resource === r.resource : match(resource, r.resource))) ?? { action, resource: "*", effect: "ask" };
  }

  // the denies and asks that never decide, as the last match wins: each
  // whose last later rule covering it whole (covers: on its action or
  // all, git * after git push --force*) is looser (an allow after a deny
  // or an ask, an ask after a deny). An older illi took deny over ask
  // over allow, whatever the order, so its file may hold such a rule;
  // said at the start
  export function shadowed(rules: Rule[]): Array<{ rule: Rule; by: Rule }> {
    return rules.flatMap((rule, k) => {
      const by = rules.slice(k + 1).findLast((o) => covers(o.action, rule.action) && covers(o.resource, rule.resource));
      return by === undefined || STRICT[by.effect] >= STRICT[rule.effect] ? [] : [{ rule, by }];
    });
  }

  // whether a pattern matches all a narrower one does: the narrower
  // taken as text, each wildcard in it one only a * meets (its * two
  // characters a ? can't take alone, its ? one), and, ending in " *",
  // its bare command too (git push ?* doesn't cover git push *)
  export function covers(wide: string, narrow: string): boolean {
    const text = (p: string) => p.replace(/\*/g, "\u0001\u0002").replace(/\?/g, "\u0001");
    return match(text(narrow), wide) && (!narrow.endsWith(" *") || match(text(narrow.slice(0, -2)), wide));
  }

  // a request's verdict: denied if any resource is, by the configured
  // rules (illi's and the user's) alone; else asked if any is, the saved
  // approvals counted too; else allowed. In trust mode, what is asked
  // runs
  export function decide(action: string, resources: string[], configured: Rule[], saved: Rule[], mode: Mode = "default"): Verdict {
    const denied = resources.flatMap((r, k) => (evaluate(action, r, configured).effect === "deny" ? [k] : []));
    if (denied.length > 0) {
      return { effect: "deny", by: denied };
    }
    const all = [...configured, ...saved];
    const asked = resources.flatMap((r, k) => (evaluate(action, r, all).effect === "ask" ? [k] : []));
    return asked.length === 0 || mode === "trust" ? { effect: "allow", by: [] } : { effect: "ask", by: asked };
  }

  // illi's own rules, before the user's: all runs; a .env file's read
  // asks, a .env.example's doesn't; a folder outside the project asks,
  // but illi's customization places (patterns: Access.places)
  export function base(places: string[]): Rule[] {
    return [
      { action: "*", resource: "*", effect: "allow" },
      { action: "read", resource: "*.env", effect: "ask" },
      { action: "read", resource: "*.env.*", effect: "ask" },
      { action: "read", resource: "*.env.example", effect: "allow" },
      { action: "external_directory", resource: "*", effect: "ask" },
      ...places.map((resource): Rule => ({ action: "external_directory", resource, effect: "allow" })),
    ];
  }

  // the user's rules, and a project's saved approvals; a string: why the
  // file won't read
  export function read(file: string, folder: string): Read | string {
    const data = Permissions.data(file);
    if (typeof data === "string") {
      return data;
    }
    const rules = Permissions.rules(data?.rules ?? {});
    if (typeof rules === "string") {
      return file + ": " + rules;
    }
    return { rules, saved: Permissions.saved(data?.projects?.[folder]) };
  }

  // approvals saved for a project ("don't ask again"): an action on
  // resources; null: saved, else why not
  export function save(file: string, folder: string, action: string, resources: string[]): string | null {
    return Permissions.change(file, folder, (saved) => [...saved, ...[...new Set(resources)].filter((r) => !saved.some((s) => s.action === action && s.resource === r)).map((resource): Rule => ({ action, resource, effect: "allow" }))]);
  }

  // a project's saved approval let go (/permissions); null: done, else
  // why not
  export function revoke(file: string, folder: string, action: string, resource: string): string | null {
    return Permissions.change(file, folder, (saved) => saved.filter((s) => s.action !== action || s.resource !== resource));
  }

  // the user's rules as read: by action, a pattern's effect or one effect
  // for all; an older illi's kinds as their actions now (legacy). A
  // string: what is wrong with them
  export function rules(raw: unknown): Rule[] | string {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return "rules must be an object of actions";
    }
    const rules: Rule[] = [];
    for (const [action, each] of Object.entries(raw)) {
      const patterns = typeof each === "string" ? { "*": each } : each;
      if (patterns === null || typeof patterns !== "object" || Array.isArray(patterns)) {
        return "rules." + action + " must be allow, ask, deny or an object of patterns";
      }
      for (const [resource, effect] of Object.entries(patterns)) {
        if (!EFFECTS.includes(effect as Effect)) {
          return "rules." + action + (typeof each === "string" ? "" : "[" + JSON.stringify(resource) + "]") + " is " + JSON.stringify(effect) + ": allow, ask or deny";
        }
        rules.push(...legacy(action, resource, effect as Effect));
      }
    }
    return rules;
  }

  // a project's saved approvals: its own, and an older illi's grants as
  // the approvals they stand for (legacy_grant)
  export function saved(project: any): Rule[] {
    const own: unknown[] = Array.isArray(project?.saved) ? project.saved : [];
    const kept = own.flatMap((s: any): Rule[] => (typeof s?.action === "string" && typeof s?.resource === "string" ? [{ action: s.action, resource: s.resource, effect: "allow" }] : []));
    const old = (Array.isArray(project?.granted) ? project.granted : []).flatMap((g: unknown) => (typeof g === "string" ? legacy_grant(g) : []));
    const all = [...kept, ...old];
    return all.filter((r, k) => all.findIndex((o) => o.action === r.action && o.resource === r.resource) === k);
  }

  // the file's object (null: no file), read again if it changed; a
  // string: why it won't read
  export function data(file: string): Record<string, any> | null | string {
    let stamp = "";
    try {
      const st = fs.statSync(file);
      stamp = st.mtimeMs + ":" + st.size + ":" + st.ino;
    } catch {}
    if (SEEN === null || SEEN.file !== file || SEEN.stamp !== stamp) {
      SEEN = { file, stamp, data: Permissions.parse(file) };
    }
    return SEEN.data;
  }

  // the file's object read now (null: no file); a string: why it won't
  export function parse(file: string): Record<string, any> | null | string {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (err: any) {
      return err?.code === "ENOENT" ? null : file + ": " + String(err?.message ?? err);
    }
    try {
      const got = text.trim() === "" ? {} : JSON.parse(text);
      return got !== null && typeof got === "object" && !Array.isArray(got) ? got : file + ": not a JSON object";
    } catch (err: any) {
      return file + ": " + String(err?.message ?? err);
    }
  }

  // a project's saved approvals changed: the file read now, the project's
  // approvals (an older illi's grants among them, kept as approvals from
  // now on) changed, the file written to a temporary one and renamed
  // over it; null: done, else why not (one that won't read is left as it
  // is)
  export function change(file: string, folder: string, edit: (saved: Rule[]) => Rule[]): string | null {
    const got = Permissions.parse(file);
    if (typeof got === "string") {
      return got;
    }
    const data = got ?? {};
    const object = (x: unknown): x is Record<string, any> => x !== null && typeof x === "object" && !Array.isArray(x);
    const projects = object(data.projects) ? data.projects : (data.projects = {});
    const { granted: _, ...project } = object(projects[folder]) ? projects[folder] : {};
    projects[folder] = { ...project, saved: edit(Permissions.saved(projects[folder])).map((s) => ({ action: s.action, resource: s.resource })) };
    const tmp = file + "." + process.pid + ".tmp";
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
      fs.renameSync(tmp, file);
      return null;
    } catch (err: any) {
      fs.rmSync(tmp, { force: true });
      return file + ": " + String(err?.message ?? err);
    }
  }

  // a mode as set: trust (an older illi's yolo too), else default (its
  // auto, careful, ask and read-only: they ask more than trust does)
  export function mode_of(text: string): Mode {
    return text === "trust" || text === "yolo" ? "trust" : "default";
  }

  // a pattern's leading ~/ as home (a shell pattern's kept: a command is
  // matched as written)
  export function home(action: string, pattern: string): string {
    return action !== "shell" && (pattern === "~" || pattern.startsWith("~/")) ? os.homedir() + pattern.slice(1) : pattern;
  }

}

// Legacy
// ======
// An older illi's file, read as this one: its rules by kind (shell, read,
// write, mcp) and its grants (kind:pattern, kind=exact). Its rules are
// taken as the new ones are: the last match winning (an older illi took
// deny over ask over allow, whatever their order), a relative path from
// the working dir (it took one from the project's top), a backslash as
// a slash (its \* was a star).

// a rule as read: its pattern's ~/ as home; an older illi's write rule
// as edit's (one allowing a folder outside also allowing the folder: it
// let changes there run; its read rule allows no folder), its mcp rule
// as one for the MCP tools its pattern names (mcp__ before it if not
// there: * as mcp__*, never every action)
function legacy(action: string, resource: string, effect: Effect): Rule[] {
  if (action === "mcp") {
    return [{ action: mcp(resource), resource: "*", effect }];
  }
  const kind = action === "write" ? "edit" : action;
  const pattern = Permissions.home(kind, resource);
  const outside = action === "write" && effect === "allow" && path.isAbsolute(pattern) && pattern.endsWith("/*");
  return [{ action: kind, resource: pattern, effect }, ...(outside ? [{ action: "external_directory", resource: pattern, effect } as Rule] : [])];
}

// an older illi's grant as the approval it stands for: a family of
// commands or an exact one, as a shell approval; a folder's changes, as
// the folder's (external_directory); an MCP tool's, as its own action.
// A folder's reads stand for none (the folder's approval would let
// changes there run), nor does an exact file's (a secret, a protected
// file): asked again, if still asked
function legacy_grant(grant: string): Rule[] {
  const m = /^(shell|read|write|mcp)([:=])(.*)$/s.exec(grant);
  if (m === null) {
    return [];
  }
  const [, kind, how, what] = m;
  const allow = (action: string, resource: string): Rule[] => [{ action, resource, effect: "allow" }];
  if (kind === "shell") {
    return allow("shell", what.replace(/\\\*/g, "*"));
  }
  if (kind === "mcp") {
    return allow(mcp(what), "*");
  }
  return kind === "write" && how === ":" && what.endsWith("/*") ? allow("external_directory", what.replace(/\\\*/g, "*")) : [];
}

// an older illi's mcp pattern as the actions it names: MCP tools'
function mcp(pattern: string): string {
  return pattern.startsWith("mcp__") ? pattern : "mcp__" + pattern;
}
