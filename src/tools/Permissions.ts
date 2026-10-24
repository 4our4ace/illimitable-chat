// Permissions
// ===========
// The user's permission file (config.PERMISSIONS: permissions.json in
// illi's folder, a profile's in its own), read by the checks (Guard.ts)
// before each call they judge, in every mode:
//
//     { "rules":    { "shell": { "git push *": "ask", "rm -rf /*": "deny", "bun *": "allow" },
//                     "read":  { "~/notes/*": "allow" },
//                     "write": { "~/scratch/*": "allow" },
//                     "mcp":   { "mcp__github__*": "ask" } },
//       "projects": { "/home/me/app": { "granted": ["read:/home/me/lib/*", "shell:git push *", "write=/home/me/app/.npmrc"] } } }
//
// rules are the user's, written by hand (Guard.Rules); granted, by
// project (its folder: Trusted.folder), illi's, kept by a question's
// "don't ask again" (Guard's grants: in auto mostly a folder outside the
// project, read:/x/*; in careful a family too). Read again whenever the
// file changes, so a hand edit counts at the next call. A file that
// won't read, or a rule that isn't allow, ask or deny, is said, never
// taken as no rules: the caller asks about everything then (Tools.guard). A save
// reads the file again just before, so what another illi or a hand edit
// put there stays, then writes a temporary file and renames it over, so
// a crash never leaves half a file; one that won't read isn't written.

import * as fs from "node:fs";
import * as path from "node:path";
import type { Kind, Rule, Rules } from "./Guard.ts";

// Types
// =====

// what the checks read of it: the rules, a project's grants
export type Read = { rules: Rules; granted: string[] };

// the file as last read: which (its path, and its change time and size:
// another one means read again), the object in it (null: none there), or
// why it won't read
type Seen = { file: string; stamp: string; data: Record<string, any> | null | string };

// Constants
// =========

const KINDS: Kind[] = ["shell", "read", "write", "mcp"];
const RULES: Rule[] = ["allow", "ask", "deny"];

let SEEN: Seen | null = null;

// Permissions
// ===========

export namespace Permissions {

  // the rules, and a project's grants; a string: why the file won't read
  export function read(file: string, folder: string): Read | string {
    const data = Permissions.data(file);
    if (typeof data === "string") {
      return data;
    }
    const rules = data?.rules ?? {};
    const bad = Permissions.bad(rules);
    if (bad !== null) {
      return file + ": " + bad;
    }
    const granted = data?.projects?.[folder]?.granted;
    return { rules, granted: Array.isArray(granted) ? granted.filter((g): g is string => typeof g === "string") : [] };
  }

  // grants kept for a project; null: kept, else why not
  export function grant(file: string, folder: string, grants: string[]): string | null {
    return Permissions.change(file, (data) => {
      const projects = (data.projects ??= {});
      const was = Array.isArray(projects[folder]?.granted) ? projects[folder].granted : [];
      projects[folder] = { ...projects[folder], granted: [...new Set([...was, ...grants])] };
    });
  }

  // a project's grant let go (/permissions); null: done, else why not
  export function revoke(file: string, folder: string, grant: string): string | null {
    return Permissions.change(file, (data) => {
      const was = data.projects?.[folder]?.granted;
      if (Array.isArray(was)) {
        data.projects[folder].granted = was.filter((g: unknown) => g !== grant);
      }
    });
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

  // what is wrong with the rules (null: nothing): each kind's, a pattern's
  // rule allow, ask or deny
  export function bad(rules: unknown): string | null {
    if (rules === null || typeof rules !== "object" || Array.isArray(rules)) {
      return "rules must be an object of shell, read, write and mcp";
    }
    for (const [kind, each] of Object.entries(rules)) {
      if (!KINDS.includes(kind as Kind)) {
        return "rules." + kind + ": no such kind (" + KINDS.join(", ") + ")";
      }
      if (each === null || typeof each !== "object" || Array.isArray(each)) {
        return "rules." + kind + " must be an object of patterns";
      }
      const wrong = Object.entries(each).find(([, r]) => !RULES.includes(r as Rule));
      if (wrong !== undefined) {
        return "rules." + kind + "[" + JSON.stringify(wrong[0]) + "] is " + JSON.stringify(wrong[1]) + ": allow, ask or deny";
      }
    }
    return null;
  }

  // the file changed: read now, changed, written to a temporary file and
  // renamed over it; null: done, else why not (one that won't read is
  // left as it is)
  export function change(file: string, edit: (data: Record<string, any>) => void): string | null {
    const got = Permissions.parse(file);
    if (typeof got === "string") {
      return got;
    }
    const data = got ?? {};
    edit(data);
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

}
