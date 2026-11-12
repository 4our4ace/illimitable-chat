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
// then a search of their summary lines and messages (Projects.seek: by
// words, in a thread of its own, Seeker.ts; by meaning, in the index
// thread, where the model is: Embed.ts), then a zoom into one
// (Tools.chat_of). The radar's searches (Radar.ts) run in another thread
// of that module, so the model's never wait on them, and recall's
// (Recall.ts: the radar's strong lines for the model, as its tool calls
// run) in a third, so neither the side's nor the model's ever waits on
// one. A fourth, the index thread, puts each project's messages in its
// index of their words and gives its summary lines their vectors, a
// slice at a time (Projects.index).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Embed, VECTORS, type Model } from "./Embed.ts";
import type { Ask, Found, Recall } from "./Radar.ts";
import { FOUND, HOME, Store, type Cut, type Found as Place_found, type Place, type Store as File } from "./Store.ts";
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

// the thread messages are put in their chat's index of words in
// (Projects.fill), a fourth, so no search waits on it; the files being
// indexed, each with whether it was asked again meanwhile (a slice once
// more, after); whether this run caught up with the other projects'
// files yet (once a run, after this one's)
const INDEX: Thread = { worker: null, asked: new Map() };
const FILLING = new Map<string, { again: boolean }>();
let OTHERS = false;

// what one slice of indexing puts in at most, in characters (about 47 MB
// a second, measured on a 15 MB chat): in the thread, about 20 ms, so a
// slice's write never holds the chat's own long; here, if the thread
// won't run, about 5 ms, the screen going on between
const SLICE      = 2 ** 20;
const SLICE_HERE = 2 ** 18;

// the summary lines one slice gives their vectors (Embed: about 0.12 ms
// each, so about 20 ms), in the thread alone
const LINES = 160;

// the least cosine a line found by meaning has (an unrelated query's
// best, on a real chat of 6,184 lines: 0.2; a related one's: 0.37 to
// 0.49); the rank a place's share of the fused search is reckoned from
// (reciprocal rank fusion: 1 / (RRF + its rank) from each list it is in);
// the most lines by meaning alone after the places holding every word
// (on that chat, fused by rank, they pushed out up to 8 of an
// identifier's 20 exact matches)
const FLOOR = 0.3;
const RRF   = 60;
const BESIDE = 5;

// the models a thread read (by their folder), each once
const MODELS = new Map<string, Model>();

// what a search by words found (Projects.look): the places (Store.search),
// whether they hold any of the words, not all (or), the projects with
// more left out, by name (Cut), and what to say instead if it asked of a
// project there isn't (else null)
export type Look = { found: Place_found[]; or: boolean; cut: Array<[string, Cut]>; none: string | null };

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

  // a search, as the model reads it: by words (Projects.look) in a thread
  // of its own, on its own connections to the files, so however long it
  // takes the screen goes on (one the thread can't run is run here); and,
  // with the model's folder (`model`: Embed.use; null: words alone), by
  // meaning (Projects.near) at once in the index thread, where the model
  // is (never here: failing, by words alone); the two fused
  // (Projects.fuse), as Projects.said writes them
  export async function seek(store: File, words: string, project = "", span: Span | null = null, model: string | null = null): Promise<string> {
    const look = Projects.thread<Look>(SEEKER, { $: "search", file: store.file, words, scope: project, span }, () => Projects.look(store, words, project, span));
    const near = model === null ? Promise.resolve([]) : Projects.thread<Place_found[]>(INDEX, { $: "near", file: store.file, words, scope: project, span, model }, null).catch(() => []);
    const [l, n] = await Promise.all([look, near]);
    return Projects.said({ ...l, found: Projects.fuse(l.found, n, l.or) }, words, project, span, n);
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

  // the messages of the store's project not in their chat's index of
  // words yet put in it, a slice at a time (Projects.fill), in the index
  // thread (one it can't run, here, on the store's own connection, a
  // smaller slice, the event loop turning between), till none is left;
  // asked again while under way (a message logged meanwhile), a slice
  // once more after. Then, once a run, every other project's file in
  // turn, in the thread alone, so a search of another project or all
  // finds their messages too (one an older illi kept, its chats'
  // indexes made). A slice that fails ends that file's: the next ask
  // starts again where it stopped
  export function index(store: File, model: string | null = null): void {
    Projects.filling(store.file, model, () => Projects.fill(store, SLICE_HERE, null), () => {
      if (!OTHERS) {
        OTHERS = true;
        Projects.others(Store.files(store).filter((file) => file !== store.file), model);
      }
    });
  }

  // the other projects' files indexed one after another, in the thread
  // alone
  export function others(files: string[], model: string | null): void {
    const [file, ...rest] = files;
    if (file !== undefined) {
      Projects.filling(file, model, null, () => Projects.others(rest, model));
    }
  }

  // a project's file indexed, a slice at a time, till none is left, its
  // lines' vectors too with the model's folder (model; null: none);
  // here: how a slice the thread can't run is run here (null: it isn't);
  // done: told once it is, or a slice failed. Asked while under way: once
  // more after, done told then
  export function filling(file: string, model: string | null, here: (() => number) | null, done: () => void): void {
    const on = FILLING.get(file);
    if (on !== undefined) {
      on.again = true;
      return;
    }
    const state = { again: false };
    const end   = () => {
      FILLING.delete(file);
      done();
    };
    FILLING.set(file, state);
    const slice = (): void => {
      state.again = false;
      Projects.thread<number>(INDEX, { $: "index", file, most: SLICE, model }, here).then((left) => (left > 0 || state.again ? void setTimeout(slice, 0).unref() : end()), end);
    };
    slice();
  }

  // a slice of a project's indexing, where its file is written (the
  // index thread, or here): each chat's index of its messages' words made
  // if not there (Store.said_make), and the first chat with messages not
  // in it given `most` characters of them (Store.said_fill); with every
  // chat's messages in, and the model's folder (model), each chat's
  // vectors made if not there (Store.vec_make), and the first with lines
  // without one given LINES of theirs (Store.vec_fill). What's left: that
  // chat's messages or lines still out, or 1 if it took them all (another
  // may want a slice); 0, every chat's are in
  export function fill(store: File, most: number, model: string | null): number {
    for (const chat of Store.chats(store)) {
      const of   = { ...store, chat };
      Store.said_make(store.db, chat);
      const from = Store.said_end(of);
      const left = Store.said_fill(of, most);
      if (Store.said_end(of) > from) {
        return Math.max(1, left);
      }
    }
    const m = model === null ? null : Projects.model(model);
    for (const chat of m === null ? [] : Store.chats(store)) {
      const of   = { ...store, chat };
      Store.vec_make(store.db, chat, VECTORS);
      const from = Store.vec_end(of);
      const left = Store.vec_fill(of, (text) => Embed.pack(Embed.vector(m!, Embed.line(text))), LINES);
      if (Store.vec_end(of) > from) {
        return Math.max(1, left);
      }
    }
    return 0;
  }

  // the model in its folder, read once (Embed.load); null: its files
  // aren't all there yet, or won't read (each ask tries again)
  export function model(folder: string): Model | null {
    const kept = MODELS.get(folder);
    if (kept !== undefined || !Embed.present(folder)) {
      return kept ?? null;
    }
    try {
      const read = Embed.load(folder);
      MODELS.set(folder, read);
      return read;
    } catch {
      return null;
    }
  }

  // the summary lines closest in meaning to the words (Store.near: those
  // FLOOR close at least), where the index thread reads the model: in
  // this project, one by its name, or "all"; with a span, only lines over
  // messages all dated in it. None: the model not there, or the words
  // telling it nothing (no token it knows)
  export function near(store: File, words: string, project: string, span: Span | null, model: string): Place_found[] {
    const m = Projects.model(model);
    const files = project === "" ? [store.file] : project === "all" ? Store.files(store) : [Store.lookup(store, project)].filter((f): f is string => f !== null);
    if (m === null || Embed.tokens(m, words).length === 0) {
      return [];
    }
    const q = Embed.vector(m, words);
    return Store.near(store, files, (v) => Embed.cosine(q, v), span, FLOOR).map(({ score, ...f }) => f);
  }

  // the places found by words and by meaning as one list, FOUND at most.
  // Those holding every word (or the one word) first, as they ranked, so
  // an exact match is never pushed out; the lines found by meaning alone
  // after them, in the room left, BESIDE at most. Those holding any of
  // the words (or: none held them all) are as loose a match as meaning's:
  // the two fused by reciprocal rank, each place 1 / (RRF + its rank) from
  // each list it is in, so one in both rises; equal, the one by words
  // first
  export function fuse(words: Place_found[], meaning: Place_found[], or = true): Place_found[] {
    const at = (f: Place_found) => f.project + "/" + f.chat + "/" + f.first + "+" + f.n;
    if (!or) {
      const held = new Set(words.map(at));
      return [...words, ...meaning.filter((f) => !held.has(at(f))).slice(0, BESIDE)].slice(0, FOUND);
    }
    const all = new Map<string, { f: Place_found; score: number; k: number }>();
    words.forEach((f, k) => all.set(at(f), { f, score: 1 / (RRF + k + 1), k }));
    meaning.forEach((f, k) => {
      const was = all.get(at(f));
      if (was === undefined) {
        all.set(at(f), { f, score: 1 / (RRF + k + 1), k: k + 0.5 });
      } else {
        was.score += 1 / (RRF + k + 1);
      }
    });
    return [...all.values()].sort((a, b) => b.score - a.score || a.k - b.k).slice(0, FOUND).map((x) => x.f);
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

  // summary lines and messages with these words, as a model reads them
  // (Projects.said): by words alone, as the thread's search, where the
  // model isn't (the tests', one run here)
  export function search(store: File, words: string, project = "", span: Span | null = null): string {
    return Projects.said(Projects.look(store, words, project, span), words, project, span);
  }

  // summary lines and messages with these words (Store.search): in this
  // project, one by its name, or "all"; with a span, only lines over
  // messages all dated in it, and those messages; the projects with
  // places left out, by name. A project there isn't: none, and why
  export function look(store: File, words: string, project = "", span: Span | null = null): Look {
    const terms = words.split(/\s+/).filter((w) => w !== "");
    const file  = project === "" ? store.file : project === "all" ? null : Store.lookup(store, project);
    if (project !== "" && project !== "all" && file === null) {
      return { found: [], or: false, cut: [], none: "No project " + project + ": projects lists them." };
    }
    const cut = new Map<string, Cut>();
    const how = { or: false };
    const found = Store.search(store, terms, file === null ? null : [file], cut, span, how);
    return { found, or: how.or, cut: [...cut], none: null };
  }

  // what a search found, as a model reads it: "project id+n|text" a line,
  // newlines flattened (a message by its own words: "project id+1|kind:
  // passage", the passage holding them, "…" where cut; a line found by
  // meaning alone, among `near`, not holding the words: "≈ " first);
  // nothing found, said so, with the scope and the span; in all, the
  // projects with places left out named after, by how many, so the model
  // can search in one for them
  export function said(look: Look, words: string, project = "", span: Span | null = null, near: Place_found[] = []): string {
    if (look.none !== null) {
      return look.none;
    }
    const terms = words.split(/\s+/).filter((w) => w !== "");
    if (look.found.length === 0) {
      const when = span === null ? "" : " " + When.on(span);
      return "No summary line or message holds " + (terms.length === 1 ? "that word" : "those words") + (project === "all" ? " in any project" : " in " + (project || "this project")) + when + ".";
    }
    const by    = new Set(near.filter((f) => !f.said).map((f) => f.project + "/" + f.chat + "/" + f.first + "+" + f.n));
    const alone = (f: Place_found) => by.has(f.project + "/" + f.chat + "/" + f.first + "+" + f.n) && !Projects.holds(f.text, terms);
    const lines = look.found.map((f) => (alone(f) ? "≈ " : "") + f.project + " " + f.first + "+" + f.n + "|" + f.text.replace(/\s*\n\s*/g, " ")).join("\n");
    const more  = [...look.cut].sort((a, b) => b[1].n - a[1].n).map(([name, c]) => name + " (" + c.n + (c.more ? "+" : "") + ")");
    return project !== "all" || more.length === 0 ? lines : lines + "\nMore in: " + more.join(", ") + "; search with project to see them.";
  }

  // whether a text holds any of the terms, as the index's words are
  // matched (case and accents aside, whole words side by side)
  export function holds(text: string, terms: string[]): boolean {
    const fold  = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^\p{L}\p{N}\p{Co}]+/u).filter((w) => w !== "");
    const words = " " + fold(text).join(" ") + " ";
    return terms.some((t) => fold(t).length > 0 && words.includes(" " + fold(t).join(" ") + " "));
  }

  // a line cut to LATELY characters, its newlines spaces
  export function clip(text: string): string {
    const flat = text.replace(/\s*\n\s*/g, " ");
    return flat.length <= LATELY ? flat : flat.slice(0, LATELY - 1) + "…";
  }

}
