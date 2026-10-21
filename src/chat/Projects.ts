// Projects
// ========
// Where illi runs picks the chat it opens. In a git repo (the nearest
// folder up holding .git, though never the home folder itself), that
// repo's project: its top folder, by its absolute path, links resolved.
// Outside any, home. A project is named after its folder, with a code made
// from its path (chechen-learning-app-k3f9x2), so two copies of one repo
// are two projects, and a repo moved starts a new one. Each has its own
// chat in the one file (Store.ts), and its own lock (Chat.lock).
//
// A model looks across them by tools: first the table (Projects.table:
// each project's folder, when it was used, its size, its latest line),
// then a search of their summary lines (Projects.search), then a zoom
// into one (Memory.glance).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { HOME, Store, type Place, type Store as File } from "./Store.ts";

// Constants
// =========

// the code's characters, from the path's hash: in a name, and in a lock's
// (never shown: longer, so two projects never share one)
const CODE   = 6;
const LOCKED = 12;

// the most of a line the table shows
const LATELY = 300;

// Projects
// ========

export namespace Projects {

  // the project illi runs in, from its folder (and the user's home)
  export function place(cwd: string, user = os.homedir()): Place {
    const home = Projects.real(user);
    for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, ".git"))) {
        const top = Projects.real(dir);
        return top === home ? HOME : { key: "git:" + top, name: path.basename(top) + "-" + Projects.code(top), path: top };
      }
      if (dir === path.dirname(dir)) {
        return HOME;
      }
    }
  }

  // a folder, its links resolved (as far as it exists)
  export function real(dir: string): string {
    try {
      return fs.realpathSync(dir);
    } catch {
      return path.resolve(dir);
    }
  }

  // a short code for a path: n letters and digits of its hash
  export function code(text: string, n = CODE): string {
    const hash = new Bun.CryptoHasher("sha256").update(text).digest();
    return BigInt("0x" + hash.subarray(0, 8).toString("hex")).toString(36).padStart(n, "0").slice(-n);
  }

  // a project's lock's name, by its folder: a longer code (home: home)
  export function lock(folder: string): string {
    return folder === "" ? "home" : Projects.code(folder, LOCKED);
  }

  // every project, as a model's first look: the one used last first, the
  // one here marked; each its folder, its first and last day, its
  // messages, its latest summary line
  export function table(store: File): string {
    const day = (date: string | null) => date?.slice(0, 10) ?? "";
    const lines = Store.projects(store).map((p) => {
      const head = [p.name + (p.id === store.project ? " (this chat's)" : ""), p.path || "outside any git repo"];
      const when = p.count === 0 ? ["no messages yet"] : [day(p.first) === day(p.last) ? day(p.last) : day(p.first) + " to " + day(p.last), p.count + (p.count === 1 ? " message" : " messages")];
      const lately = p.lately === "" ? "" : "\n  lately: " + Projects.clip(p.lately);
      return head.concat(when).join(" · ") + lately;
    });
    return lines.join("\n");
  }

  // summary lines with these words, as a model reads them ("project
  // id+n|text"): in this project, one by its name, or "all"
  export function search(store: File, words: string, project = ""): string {
    const terms = words.split(/\s+/).filter((w) => w !== "");
    const named = project === "" || project === "all" ? null : Store.project(store, project);
    if (project !== "" && project !== "all" && named === null) {
      return "No project " + project + ": projects lists them.";
    }
    const scope = project === "all" ? null : [named?.project ?? store.project];
    const found = Store.search(store, terms, scope);
    if (found.length === 0) {
      return "No summary line holds " + (terms.length === 1 ? "that word" : "those words") + (project === "all" ? " in any project." : " in " + (project || "this project") + ".");
    }
    return found.map((f) => f.project + " " + f.first + "+" + f.n + "|" + f.text.replace(/\s*\n\s*/g, " ")).join("\n");
  }

  // a line cut to LATELY characters, its newlines spaces
  export function clip(text: string): string {
    const flat = text.replace(/\s*\n\s*/g, " ");
    return flat.length <= LATELY ? flat : flat.slice(0, LATELY - 1) + "…";
  }

}
