// Projects
// ========
// Where illi runs picks the chat it opens. In a git repo (the nearest
// folder up holding .git, though never the home folder itself), that
// repo's project: its top folder, by its absolute path, links resolved.
// Outside any, home. A project is named after its folder, with a code made
// from its path (chechen-learning-app-k3f9x2), so two copies of one repo
// are two projects, and a repo moved starts a new one. Each has its own
// chat in its own file (Store.ts), and its own lock (Lock.take).
//
// A model looks across them by tools: first the table (Projects.table:
// each project's folder, when it was used, its size, its latest line),
// then a search of their summary lines (Projects.search, in a thread of
// its own: Seeker.ts), then a zoom into one (Tools.chat_of). The radar's
// searches (Radar.ts) run in another thread of that module, so the
// model's never wait on them, and recall's (Recall.ts: the radar's strong
// lines for the model, as its tool calls run) in a third, so neither the
// side's nor the model's ever waits on one.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Ask, Found, Recall } from "./Radar.ts";
import { HOME, Store, type Cut, type Place, type Store as File } from "./Store.ts";
import { When, type Span } from "./When.ts";

// Constants
// =========

// the code's characters, from the path's hash: in a name, and in a lock's
// (never shown: longer, so two projects never share one)
const CODE   = 6;
const LOCKED = 12;

// the most of a line the table shows
const LATELY = 300;

// the threads' module: beside this one; in illi's binary (bun build
// --compile, given it as an entry: one bundle, under /$bunfs), where the
// build put it, chat/ beside main
const SEEK = /\$bunfs|~BUN/.test(import.meta.path) ? "./chat/Seeker.ts" : new URL("./Seeker.ts", import.meta.url).href;

// Globals
// =======

// a thread searches run in (Seeker.ts): its worker, started at the first
// (null: none yet, or it failed), and the searches asked of it, by
// number: what takes each one's answer, or its failure, and how one the
// thread can't run is run here (null: it isn't)
type Thread = { worker: Worker | null; asked: Map<number, { done: (out: any) => void; fail: (err: Error) => void; here: (() => unknown) | null }> };

// the model's searches' thread, the radar's (Radar.ts) and recall's
// (Recall.ts): three workers of the one module, so a search the model
// asks never waits on the radar's, nor the side's on recall's (a search
// runs to its end however late its answer: recall's would hold the
// side's line back)
const SEEKER: Thread = { worker: null, asked: new Map() };
const RADAR: Thread  = { worker: null, asked: new Map() };
const RECALL: Thread = { worker: null, asked: new Map() };
let ASKS = 0;

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
  // one here marked; each its folder, its first and last day (in illi's
  // zone, as the time now each call is told: When.ymd), its messages, its
  // latest summary line
  export function table(store: File): string {
    const day = (date: string | null) => (date === null ? "" : When.ymd(Date.parse(date)));
    const lines = Store.projects(store).map((p) => {
      const head = [p.name + (p.file === store.file ? " (this chat's)" : ""), p.path || "outside any git repo"];
      const when = p.count === 0 ? ["no messages yet"] : [day(p.first) === day(p.last) ? day(p.last) : day(p.first) + " to " + day(p.last), p.count + (p.count === 1 ? " message" : " messages")];
      const lately = p.lately === "" ? "" : "\n  lately: " + Projects.clip(p.lately);
      return head.concat(when).join(" · ") + lately;
    });
    return lines.join("\n");
  }

  // a search (Projects.search) in a thread of its own, on its own
  // connections to the files, so however long it takes the screen goes
  // on; one the thread can't run is run here
  export function seek(store: File, words: string, project = "", span: Span | null = null): Promise<string> {
    return Projects.thread(SEEKER, { $: "search", file: store.file, words, scope: project, span }, () => Projects.search(store, words, project, span));
  }

  // the radar's search (Radar.search) of a project's file in its own
  // thread: the lines found. Never run here: the thread failing, it
  // fails, and the screen goes on without it
  export function radar(file: string, ask: Ask): Promise<Found[]> {
    return Projects.thread(RADAR, { $: "radar", file, ask }, null);
  }

  // recall's search (Radar.recall) of a project's file in its own thread:
  // the strong line to give the model, if any. Never run here, as the
  // radar's: the thread failing, it fails, and the call goes on without
  export function recall(file: string, ask: Recall): Promise<Found | null> {
    return Projects.thread(RECALL, { $: "recall", file, ask }, null);
  }

  // recall's thread started before its first search (Recall.wake): one
  // that won't start starts at that search, or runs none
  export function wake(): void {
    try {
      RECALL.worker ??= Projects.seeker(RECALL);
    } catch {}
  }

  // a message to a thread (Seeker.ts), its worker started at the first,
  // answered by its `out`; one the thread can't run is run here (here;
  // null: failed)
  export function thread<T>(on: Thread, msg: object, here: (() => T) | null): Promise<T> {
    return new Promise((done, fail) => {
      const id = ++ASKS;
      on.asked.set(id, { done, fail, here });
      try {
        on.worker ??= Projects.seeker(on);
        on.worker.postMessage({ id, ...msg });
      } catch {
        Projects.here(on, id);
      }
    });
  }

  // a thread's worker, started: each answer to its ask; if it fails, the
  // searches asked of it run here, and the thread's next search starts
  // another
  export function seeker(on: Thread): Worker {
    const worker = new Worker(SEEK, { ref: false });
    worker.onmessage = (e: MessageEvent<{ id: number; out?: unknown; error?: string }>) => {
      const ask = on.asked.get(e.data.id);
      on.asked.delete(e.data.id);
      e.data.error !== undefined ? ask?.fail(new Error(e.data.error)) : ask?.done(e.data.out);
    };
    worker.onerror = () => {
      worker.terminate();
      if (on.worker === worker) {
        on.worker = null;
        [...on.asked.keys()].forEach((id) => Projects.here(on, id));
      }
    };
    return worker;
  }

  // an ask a thread couldn't run, run here, or failed if it isn't run
  // here (one answered already: nothing)
  export function here(on: Thread, id: number): void {
    const ask = on.asked.get(id);
    if (ask === undefined) {
      return;
    }
    on.asked.delete(id);
    try {
      if (ask.here === null) {
        throw new Error("the search thread failed");
      }
      ask.done(ask.here());
    } catch (err: any) {
      ask.fail(err);
    }
  }

  // summary lines with these words, as a model reads them ("project
  // id+n|text"): in this project, one by its name, or "all"; with a span,
  // only lines over messages all dated in it (Store.search); in all, the
  // projects with lines left out are named after, by how many, so the
  // model can search in one for them
  export function search(store: File, words: string, project = "", span: Span | null = null): string {
    const terms = words.split(/\s+/).filter((w) => w !== "");
    const file  = project === "" ? store.file : project === "all" ? null : Store.lookup(store, project);
    if (project !== "" && project !== "all" && file === null) {
      return "No project " + project + ": projects lists them.";
    }
    const cut   = new Map<string, Cut>();
    const found = Store.search(store, terms, file === null ? null : [file], cut, span);
    if (found.length === 0) {
      const when = span === null ? "" : " " + When.on(span);
      return "No summary line holds " + (terms.length === 1 ? "that word" : "those words") + (project === "all" ? " in any project" : " in " + (project || "this project")) + when + ".";
    }
    const lines = found.map((f) => f.project + " " + f.first + "+" + f.n + "|" + f.text.replace(/\s*\n\s*/g, " ")).join("\n");
    const more  = [...cut].sort((a, b) => b[1].n - a[1].n).map(([name, c]) => name + " (" + c.n + (c.more ? "+" : "") + ")");
    return project !== "all" || more.length === 0 ? lines : lines + "\nMore lines in: " + more.join(", ") + "; search with project to see them.";
  }

  // a line cut to LATELY characters, its newlines spaces
  export function clip(text: string): string {
    const flat = text.replace(/\s*\n\s*/g, " ");
    return flat.length <= LATELY ? flat : flat.slice(0, LATELY - 1) + "…";
  }

}
