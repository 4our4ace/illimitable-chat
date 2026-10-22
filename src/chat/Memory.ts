// Memory
// ======
// The chat, kept forever, and the view of it every call sees. Sizes are
// bytes of UTF-8. A message is logged in pages (Clip.ts CAP chars, PICS
// images).
//
// Over the messages grows a binary tree: node (0,i) is message i
// (or the line it was logged with) in at most NODE bytes, node (l,i)
// merges (l-1,2i) and (l-1,2i+1). A source that fits is its node; else a
// compaction writes it: a call like a turn, on the chat's compactor (its
// pick's vendor's: config_role),
// with the same system prompt (`share`), no tools, and its
// own view (`seen`) up to the node's `ctx`; a line too long is asked
// anew (build). The call asks till it is answered (AskAI patient: an
// outage only delays a node, never harms it); answered with no line (a
// refusal: its input's doing), its node is its source clipped. JOBS
// build at once, in the order the messages came. A try cut after a line
// keeps the best one.
//
// A view lists nodes covering the chat to its end, oldest first; each message
// it reaches appends its node. Past `high` bytes, a batch merges the adjacent
// siblings whose parent is built and most due (oldest since its last message,
// to the view's end, in halves: detail fades with age) down to half, so a view
// changes only at its end between batches. Two, each on its own: the chat's
// (turns'), to the last message, and the compactions', to the first not built.
// A call gets one in BLOCK-line blocks, the last whole one marked for the cache
// (AskAI.ts); few lines, as those past it are read anew (a compaction's view
// ends at its node, then its task, both unmarked).
//
// Kept in one SQLite file, memory.sqlite (Store.ts): the messages, each
// with the folder illi ran in, the nodes, the agents' logs, and the state
// (the views, the chat's pick, goal and suggested reply...), written over. A message's
// pages are logged in one write. Memory holds only the view's nodes and
// those built above them; any other is read from the file, and so are
// images, by their hash.

import { AskAI, type Ask, type Block, type Call, type Img, type Kind, type Say } from "../ai/AskAI.ts";
import { clip_page, clip_pages } from "../tools/Clip.ts";
import * as config from "../config/Config.ts";
import { Pick } from "../ai/Pick.ts";
import * as names from "./Names.ts";
import { HOME, Store, type Place } from "./Store.ts";
import { image_kind } from "../ui/View.ts";

// Types
// =====

// a message (a page): its index, kind, text, size, date, images, its
// node (if written with it), whether it is logged as one with the next
type Root = Msg & { i: number; size: number; date: string };

// a message to log: a Root but its index and size; no date: now
export type Msg = { kind: Kind; text: string; date?: string; images?: string[]; line?: string; more?: boolean };

// node (l,i), as a line of a view
type Part = { l: number; i: number };

// a view: its lines, the bytes of those built, a batch under way, the
// bytes past which it merges to half
type View = { parts: Part[]; size: number; batch: boolean; high: number };

// what a compaction shares with the chat's turns: all but the blocks
export type Share = Omit<Ask, "blocks">;

// a view as saved
type Kept = { parts: Array<[number, number]>; batch: boolean };

// the state: the chat's view, the compactions' (none: the chat's)
type Saved = Kept & { seen?: Kept; pick: object | null; goal?: string | null; suggest?: string; work?: string[]; agent?: string | null; cut?: number; show?: number; top?: number };

// store: its file (Store.ts); cwd: the folder illi runs in, logged with
// each message ("": unknown); count: the pages logged; pick: the chat's,
// as last set;
// goal: the user's (/goal; null: none), till met or halted (Chat.ts);
// suggest: the suggested reply shown as the last turn ended (Chat.suggest;
// "": none), so a start shows it again; agent: the main agent's profile (Custom.ts; null: illi's own); work:
// what ran, as last saved; cut: the first message a turn's call gets
// whole (Memory.cutoff; those before, as the view's lines), show: the
// first the screen shows whole (at the cut, or behind it, as /compact
// leaves it: Memory.kept), top: the first it shows at all (the last
// /clear's: older ones are only the memory's), tail: the bytes of those
// from the cut, as last counted (Memory.fill); nodes: the
// texts of the views' nodes
// built and of those above them, by slot; agents: their logs' lengths,
// logs: each name's log as now (a name freed takes a new one: agent_new);
// view: the chat's view; seen: the compactions'; ready: the nodes not
// built whose halves are, by level, in order; busy: nodes building, by
// slot; calls: those building's calls;
// hold: no summary starts (a test's chat, which no model answers);
// wait: checks run as the views change; share: what compactions share
// with the chat's turns; made: told of each node built; stuck: told why
// a summary's try failed, as it waits to ask again ("": one was built)
export type Memory = {
  dir    : string;
  store  : Store;
  cwd    : string;
  count  : number;
  pick   : object | null;
  goal   : string | null;
  suggest: string;
  agent  : string | null;
  work   : string[];
  cut    : number;
  show   : number;
  top    : number;
  tail   : { cut: number; count: number; bytes: number };
  nodes  : Map<number, string>;
  agents : Map<string, number>;
  logs   : Map<string, string>;
  view   : View;
  seen   : View;
  ready  : number[][];
  busy   : Set<number>;
  calls  : Map<Call, Part>;
  hold   : boolean;
  done   : boolean;
  wait   : Set<() => void>;
  share  : () => Share;
  made?  : (l: number, i: number) => void;
  stuck? : (why: string) => void;
};

// Constants
// =========

const NODE  = 512;
export const JOBS = config.JOBS;
const TRIES = 5;
// a turn's call gets config.CONTEXT tokens of the chat (HIGH bytes, 4 a
// token: 1.6 MB at the default 400k; less for a model's smaller window):
// its latest messages whole, the view's lines before them (Memory.cutoff).
// A view past its `high` merges to half: the chat's LINES, half a call's
// (so its lines leave the messages at least half), the compactions'
// 16-32 KB (24 KB)
const HIGH  = config.CONTEXT * 4;
const LINES = HIGH / 2;
const SEEN  = 32000;
const BLOCK = 4;

// Anthropic takes 32 MB a request, 20 images at full size: 20 of IMAGE
// bytes, in base64; PIXELS, the most decoded: a larger image goes as is
const PICS   = 20;
const FIT    = 1568;
const IMAGE  = 2 ** 20;
const PIXELS = 2 ** 28;

// what an image's hash takes between turns of the event loop
const PIECE = 2 ** 20;

// a ruler, not a sample line: the compactor copied a sample's content
const SCALE = "-".repeat(NODE);

const WAIT = "(not summarized yet: zoom it)";

// an agent's name: a letter, then letters, digits, _ and -; its log's,
// the name and a tag (one name, freed, is used again: each log its own),
// the tag and the name back from a file
const AGENT = /^[A-Za-z][A-Za-z0-9_-]*$/;
const LOG   = /^([A-Za-z][A-Za-z0-9_-]*)(?:\.([0-9a-z]+))?$/;

// the caller name of the chat's own agent (its tools URL's: Tools.ts),
// never an agent's
export const MAIN = "main";

// a compaction's task, before its <input>: one message to compress
// (level 0), or two lines to merge
const LEAF = `Compaction: compress message {id} into one line of at most ${NODE} bytes
(about 70 words), the length of this ruler:
${SCALE}
<input>
`;

const MERGE = `Compaction: merge lines {a} and {b}, adjacent, into one line of at most
${NODE} bytes (about 70 words), the length of this ruler:
${SCALE}
<chat> may hold their messages, {id} to {end}, in more detail: take details
of them from there too.
<input>
`;

// Memory
// ======

export namespace Memory {

  // the chat of the project at `place` (none: home)
  export function load(dir: string, share: Memory["share"], place: Place = HOME): Memory {
    const mem = Memory.read(dir, Store.open(dir, place), share, false);
    Memory.roots(mem.count).flatMap((part) => Memory.todo(mem, part)).forEach((part) => Memory.ready(mem, part, true));
    Memory.fit(mem);
    Memory.save(mem);
    return mem;
  }

  // a store's chat as saved; alone: to read while another illi runs it
  // (Remote.ts), never saved, nothing built
  export function read(dir: string, store: Store, share: Memory["share"], alone: boolean): Memory {
    const mem: Memory = {
      dir, store, cwd: "", count: Store.count(store), pick: null, goal: null, suggest: "", agent: null, work: [], cut: 0, show: 0, top: 0, tail: { cut: 0, count: 0, bytes: 0 }, nodes: new Map(), agents: new Map(), logs: new Map(), ready: [],
      view: { parts: [], size: 0, batch: false, high: LINES }, seen: { parts: [], size: 0, batch: false, high: SEEN },
      busy: new Set(), calls: new Map(), hold: alone, done: alone, wait: new Set(), share,
    };
    // a field of another shape than illi writes: as if not saved
    const saved = Store.state(store) as Saved | null;
    const index = (v: unknown, or: number) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : or);
    const kept  = (k: any): Kept | null => (Array.isArray(k?.parts) && k.parts.every((p: unknown) => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger)) ? k : null);
    mem.pick = saved?.pick !== null && typeof saved?.pick === "object" ? saved.pick : null;
    mem.goal = typeof saved?.goal === "string" ? saved.goal : null;
    mem.suggest = typeof saved?.suggest === "string" ? saved.suggest : "";
    mem.agent = typeof saved?.agent === "string" ? saved.agent : null;
    mem.work = Array.isArray(saved?.work) ? saved.work : [];
    mem.cut = Math.min(index(saved?.cut, 0), mem.count);
    mem.show = Math.min(index(saved?.show, mem.cut), mem.cut);
    mem.top = index(saved?.top, 0);
    Memory.open(mem, mem.view, kept(saved));
    Memory.open(mem, mem.seen, kept(saved?.seen) ?? kept(saved));
    return mem;
  }

  // a view as kept (none: the highest nodes built)
  export function open(mem: Memory, view: View, kept: Kept | null): void {
    const keys = kept === null ? null : new Set(kept.parts.map(([l, i]) => Memory.slot(l, i)));
    view.parts = Memory.roots(mem.count).flatMap((part) => Memory.down(mem, part, keys));
    view.size = view.parts.reduce((n, part) => n + Memory.size(mem, part), 0);
    view.batch = kept?.batch ?? false;
  }

  // another chat of the same file, to read (zoom, date, images, an
  // agent's log): no view, nothing built, saved or stopped
  export function glance(mem: Memory, project: number, chat: number): Memory {
    const store = Store.as(mem.store, project, chat);
    return {
      ...mem, store, count: Store.count(store), nodes: new Map(), agents: new Map(), logs: new Map(), ready: [], busy: new Set(), calls: new Map(), hold: true, done: true, wait: new Set(),
      view: { parts: [], size: 0, batch: false, high: LINES }, seen: { parts: [], size: 0, batch: false, high: SEEN },
    };
  }

  // the state, written over (none once the chat is stopped: its file is
  // closed)
  export function save(mem: Memory): void {
    if (mem.done) {
      return;
    }
    const [chat, seen] = [mem.view, mem.seen].map((view): Kept => ({ parts: view.parts.map((part) => [part.l, part.i]), batch: view.batch }));
    Store.save(mem.store, { ...chat, seen, pick: mem.pick, goal: mem.goal, suggest: mem.suggest, agent: mem.agent, work: mem.work, cut: mem.cut, show: mem.show, top: mem.top });
  }

  export function slot(l: number, i: number): number {
    return (2 * i + 1) * 2 ** l - 1;
  }

  export function bytes(text: string): number {
    return Buffer.byteLength(text, "utf8");
  }

  export function root(i: number, msg: Msg): Root {
    const date   = msg.date ?? new Date().toISOString();
    const images = msg.images?.length ? msg.images : undefined;
    const root: Root = { ...msg, text: msg.text.toWellFormed(), i, size: 0, date, images };
    root.size = Memory.bytes(Memory.show(root));
    return root;
  }

  // a message as models read it, tagged by its kind
  export function show(root: Root): string {
    const pics = (root.images ?? []).map((name) => "\n[image " + name + "]");
    return root.kind + ": " + root.text + pics.join("");
  }

  // message i, from the file; null: none
  export function message(mem: Memory, i: number): Root | null {
    return Number.isInteger(i) && i >= 0 && i < mem.count ? Store.msg(mem.store, i) : null;
  }

  // the messages' pages logged, in one write
  export function push(mem: Memory, msgs: Msg[]): Root[] {
    const roots = msgs.flatMap(Memory.pages).map((msg, k) => Memory.root(mem.count + k, msg));
    Store.push(mem.store, roots, mem.cwd);
    mem.count += roots.length;
    roots.forEach(({ i }) => Memory.ready(mem, { l: 0, i }, true));
    Memory.fit(mem, true);
    Memory.pump(mem);
    return roots;
  }

  // its text and images on the last pages (a call takes them whole), its
  // line on the first
  export function pages(msg: Msg): Msg[] {
    const texts = clip_pages(msg.text);
    const pics = msg.images ?? [];
    const n = Math.max(texts.length, Math.ceil(pics.length / PICS));
    return Array.from({ length: n }, (_, k) => {
      const end = Math.max(0, pics.length - (n - 1 - k) * PICS);
      const images = pics.slice(Math.max(0, end - PICS), end);
      const more = k < n - 1 ? true : undefined;
      return { ...msg, text: texts[k - n + texts.length] ?? "", images, line: k === 0 ? msg.line : undefined, more };
    });
  }

  // the first message, from `from` on, from which those to the end go
  // whole in a call: `high` bytes, `most` images (the last always)
  export function whole(mem: Memory, from: number, high = HIGH, most = PICS): number {
    let [k, size, pics] = [mem.count, 0, 0];
    for (; k > from; k--) {
      const root = Memory.message(mem, k - 1)!;
      size += root.size;
      pics += root.images?.length ?? 0;
      if (k < mem.count && (size > high || pics > most)) {
        return k;
      }
    }
    return k;
  }

  // the first message a turn's call gets whole, the cut: kept while those
  // from it and the view's lines before it fit `high` bytes, so a call
  // starts as the one before did (cached); past it, moved on till the
  // messages fill half of what the lines leave: the oldest fold into the
  // view a batch at a time, as Claude Code compacts, yet each one stays a
  // zoom away. Never inside one of the view's lines (moved back to its
  // start). The view merges past half of `high` (a model's smaller window
  // makes it smaller); the messages get at least a quarter. The screen
  // folds with it (show)
  export function cutoff(mem: Memory, high: number): number {
    const was  = mem.cut;
    const room = () => Math.max(high / 4, high - Memory.before(mem.view.parts, mem.cut).reduce((n, part) => n + Memory.size(mem, part), 0));
    if (mem.view.high !== high / 2) {
      mem.view.high = high / 2;
      Memory.fit(mem);
    }
    if (Memory.whole(mem, mem.cut, room(), Infinity) !== mem.cut) {
      mem.cut = mem.show = Memory.whole(mem, mem.cut, room() / 2, Infinity);
    }
    const part = mem.view.parts[Memory.cover(mem.view, mem.cut)];
    mem.cut = part === undefined ? mem.cut : Math.min(mem.cut, Memory.span(part)[0]);
    mem.show = Math.min(mem.show, mem.cut);
    if (mem.cut !== was) {
      Memory.save(mem);
    }
    return mem.cut;
  }

  // the run, as a number: the latest message the user sent (-1: none)
  export function run(mem: Memory): number {
    return Store.last(mem.store, "user", mem.count);
  }

  // where /compact has the chat go whole from (its rule of thumb): the
  // user's second-to-last message, the last two exchanges with their tool
  // steps; past `most` bytes, the user's last; past it too, the latest
  // messages that fit. A user's message is counted from its first page
  export function kept(mem: Memory, most: number): number {
    const users: number[] = [];
    for (let i = mem.count - 1; i >= mem.cut && users.length < 2; i--) {
      if (Memory.message(mem, i)!.kind === "user") {
        while (i > 0 && Memory.message(mem, i - 1)!.more) {
          i -= 1;
        }
        users.unshift(i);
      }
    }
    return users.find((from) => Memory.whole(mem, from, most, Infinity) === from) ?? Memory.whole(mem, mem.cut, most, Infinity);
  }

  // the bytes of the chat the next turn sends (none of its new messages
  // yet): the view's lines before the cut, the messages from it (counted
  // on as they come: `tail`, made anew as the cut moves)
  export function fill(mem: Memory): number {
    const tail = mem.tail.cut === mem.cut && mem.tail.count <= mem.count ? mem.tail : { cut: mem.cut, count: mem.cut, bytes: 0 };
    for (let i = tail.count; i < mem.count; i++) {
      tail.bytes += Memory.message(mem, i)!.size;
    }
    mem.tail = { ...tail, count: mem.count };
    return Memory.before(mem.view.parts, mem.cut).reduce((n, part) => n + Memory.size(mem, part), 0) + mem.tail.bytes;
  }

  // a turn's chat: the view's lines before the cut `from`, then the
  // messages from it to its new ones (`end`) whole
  export function chat(mem: Memory, from: number, end: number): Block[] {
    const past = Memory.recent(mem, from, Math.max(from, end));
    const view = Memory.view(mem, from);
    return [...(past.some((b) => b.mark) ? view.map((b) => ({ ...b, mark: false })) : view), ...past];
  }

  // messages [a, b) whole, as a turn's call gets the latest before its new
  // ones: each "id|kind: text" (an image named, a zoom away), in blocks of
  // BLOCK from the cut, the last whole one marked for the cache in place of
  // the view's (a turn adds a few, so the next finds it), the rest in the
  // last block
  export function recent(mem: Memory, a: number, b: number): Block[] {
    const texts = Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k + "|" + Memory.show(Memory.message(mem, a + k)!) + "\n\n");
    const whole = Math.floor(texts.length / BLOCK);
    if (texts.length === 0) {
      return [];
    }
    const blocks: Block[] = [{ text: "<recent>\n", mark: false }];
    for (let k = 0; k < whole; k++) {
      blocks.push({ text: texts.slice(k * BLOCK, (k + 1) * BLOCK).join(""), mark: k === whole - 1 });
    }
    blocks.push({ text: texts.slice(whole * BLOCK).join("") + "</recent>\n", mark: false });
    return blocks;
  }

  // the pages [a, b) of a message as a model gets them: one text, their
  // images
  export function say(mem: Memory, a: number, b: number): Say {
    const ids = Array.from({ length: b - a }, (_, k) => a + k);
    const text = ids.map((id) => Memory.message(mem, id)!.text).join("");
    return { text, imgs: ids.flatMap((id) => Memory.images(mem, id)) };
  }

  // Images
  // ------

  // an image's bytes kept in the chat's file, by their hash, with its
  // copy for models (smaller) if one is made; hashed and scaled off the
  // event loop; null: no image kind or unreadable
  export async function image_add(mem: Memory, bytes: Buffer): Promise<string | null> {
    const kind = image_kind(bytes);
    if (kind === null) {
      return null;
    }
    const img = new Bun.Image(bytes);
    const size = await img.metadata().catch(() => null);
    if (size === null) {
      return null;
    }
    const hash = new Bun.CryptoHasher("sha256");
    for (let at = 0; at < bytes.length; at += PIECE) {
      hash.update(bytes.subarray(at, at + PIECE));
      await new Promise((ok) => setImmediate(ok));
    }
    const name = hash.digest("hex").slice(0, 16) + "." + kind.split("/")[1];
    const k = Math.min(1, FIT / Math.max(size.width, size.height));
    const fit = (k < 1 || bytes.length > IMAGE) && size.width * size.height <= PIXELS;
    const out = fit ? await img.resize(Math.round(size.width * k), Math.round(size.height * k)).jpeg({ quality: 85 }).bytes() : null;
    Store.image_put(mem.store, name, bytes, out);
    return name;
  }

  // what models get of message id's images: their copies, if any (one
  // not kept: left out)
  export function images(mem: Memory, id: number): Img[] {
    const names = Memory.message(mem, id)?.images ?? [];
    return names.flatMap((name) => {
      const img = Store.image(mem.store, name);
      if (img === null) {
        return [];
      }
      const data = Buffer.from(img.fit ?? img.data).toString("base64");
      return [{ type: img.fit !== null ? "image/jpeg" : "image/" + name.split(".")[1], data }];
    });
  }

  // Tree
  // ----

  // of a node the view or a node above it may need
  export function built(mem: Memory, l: number, i: number): boolean {
    return mem.nodes.has(Memory.slot(l, i));
  }

  // node (l,i)'s text, kept or from the file; null: not built
  export function node(mem: Memory, part: Part): string | null {
    return mem.nodes.get(Memory.slot(part.l, part.i)) ?? Store.node(mem.store, part.i * 2 ** part.l, 2 ** part.l);
  }

  // the tree's roots: a node per power of two in the count, largest first
  export function roots(count: number): Part[] {
    const out: Part[] = [];
    for (let l = 30, id = 0; l >= 0; l--) {
      if (id + 2 ** l <= count) {
        out.push({ l, i: id / 2 ** l });
        id += 2 ** l;
      }
    }
    return out;
  }

  // the view under `part`, down from it, keeping the built nodes met:
  // the nodes of `keys` built (none: any built), or messages
  export function down(mem: Memory, part: Part, keys: Set<number> | null): Part[] {
    const key = Memory.slot(part.l, part.i);
    const text = Memory.node(mem, part);
    if (text !== null) {
      mem.nodes.set(key, text);
    }
    if (part.l === 0 || (text !== null && (keys === null || keys.has(key)))) {
      return [part];
    }
    return Memory.halves(part).flatMap((half) => Memory.down(mem, half, keys));
  }

  export function halves(part: Part): Part[] {
    return part.l === 0 ? [] : [{ l: part.l - 1, i: 2 * part.i }, { l: part.l - 1, i: 2 * part.i + 1 }];
  }

  export function source(mem: Memory, l: number, i: number): string | null {
    if (l === 0) {
      const root = Memory.message(mem, i);
      return root === null ? null : root.line ?? Memory.show(root);
    }
    const [a, b] = Memory.halves({ l, i }).map((half) => Memory.node(mem, half));
    return a === null || b === null ? null : Memory.flat(a) + "\n" + Memory.flat(b);
  }

  export function ctx(l: number, i: number): number {
    return l === 0 ? i : (i + 1) * 2 ** l;
  }

  // the message of the view's (k+1)th line not built, else the count
  export function first(mem: Memory, k = 0): number {
    return (mem.ready[0] ?? [])[k] ?? mem.count;
  }

  // a node ready (on), or no more (built)
  export function ready(mem: Memory, { l, i }: Part, on: boolean): void {
    const queue = (mem.ready[l] ??= []);
    let [a, z] = [0, queue.length];
    while (a < z) {
      const m = (a + z) >> 1;
      [a, z] = queue[m] < i ? [m + 1, z] : [a, m];
    }
    if (on !== (queue[a] === i)) {
      queue.splice(a, on ? 0 : 1, ...(on ? [i] : []));
    }
  }

  // the nodes to build; those whose source fits take no call: built at
  // once, together (as jobs, a chain of them held the event loop)
  export function pump(mem: Memory): void {
    let built = false;
    for (let free = Memory.starts(mem); free.length > 0 && !mem.done; free = Memory.starts(mem)) {
      Memory.store(mem, free);
      built = true;
    }
    if (built) {
      Memory.fit(mem);
    }
  }

  // unless held, the nodes ready up to the JOBS-th line not built, in
  // the order the messages came (`ctx`; at a tie, a merge first), while
  // JOBS run. The jobs started; the nodes whose source fits
  export function starts(mem: Memory): Array<Part & { text: string }> {
    const free: Array<Part & { text: string }> = [];
    if (mem.hold) {
      return free;
    }
    const end = Memory.first(mem, JOBS - 1);
    const next: Part[] = [];
    mem.ready.forEach((queue, l) => {
      for (let k = 0; k < queue.length && Memory.ctx(l, queue[k]) <= end; k++) {
        next.push({ l, i: queue[k] });
      }
    });
    next.sort((a, b) => Memory.ctx(a.l, a.i) - Memory.ctx(b.l, b.i) || b.l - a.l);
    for (const { l, i } of next) {
      if (mem.done || mem.busy.size >= JOBS) {
        break;
      }
      const text = mem.busy.has(Memory.slot(l, i)) ? null : Memory.source(mem, l, i);
      if (text !== null && Memory.bytes(text) <= NODE) {
        free.push({ l, i, text });
      } else if (text !== null) {
        Memory.job(mem, l, i, text);
      }
    }
    return free;
  }

  // the nodes under `part` not built whose sources are: only nodes not
  // built and their halves are visited
  export function todo(mem: Memory, part: Part): Part[] {
    if (Memory.built(mem, part.l, part.i)) {
      return [];
    }
    const halves = Memory.halves(part);
    const here = halves.every((half) => Memory.built(mem, half.l, half.i)) ? [part] : [];
    return [...here, ...halves.flatMap((half) => Memory.todo(mem, half))];
  }

  // a node cut (the chat ended: Memory.stop) builds at the next start
  export function job(mem: Memory, l: number, i: number, text: string): void {
    const key = Memory.slot(l, i);
    mem.busy.add(key);
    Memory.build(mem, l, i, text).finally(() => {
      mem.busy.delete(key);
      Memory.pump(mem);
      Memory.fit(mem);
    }).catch((err) => {
      console.error("compactor: node " + l + "/" + i + ": " + (err?.message ?? err));
    });
  }

  // no node starts again, nor runs: those running are cut
  export function stop(mem: Memory): void {
    mem.done = true;
    mem.calls.forEach((_, call) => call.stop());
    Store.close(mem.store);
  }

  // node (l,i)'s summary: its view to the node and its task, asked till
  // a line fits (a leaf's tagged with its message's kind: Memory.tagged),
  // TRIES lines at most, the shortest kept. Each try sends
  // those blocks, never a try's words or thoughts; one after a line too
  // long adds only its size and where the limit cuts it (`over`): never
  // more than the first and that note. No line (a refusal: its input's
  // doing; or too long for the compactor's window): its source clipped;
  // a try cut (a stop) throws, unless a line came
  export async function build(mem: Memory, l: number, i: number, text: string): Promise<void> {
    const task = { text: Memory.task(l, i) + text + "\n</input>", mark: false };
    const upto = Math.min(Memory.ctx(l, i), Memory.first(mem));
    const blocks = [...Memory.view(mem, upto, mem.seen.parts), task];
    const lines: string[] = [];
    let end = await Memory.compact(mem, l, i, Memory.ask(mem, blocks));
    while (end.ok && end.text.trim() !== "") {
      const line = Memory.tagged(l, text, Memory.bare(end.text.trim()));
      lines.push(line);
      if (Memory.bytes(line) <= NODE || lines.length === TRIES || mem.done) {
        break;
      }
      const note = { text: Memory.over(line), mark: false };
      end = await Memory.compact(mem, l, i, Memory.ask(mem, [...blocks, note]));
    }
    if (lines.length === 0 && !end.ok && end.stop !== "fail" && end.stop !== "full") {
      throw new Error(end.text);
    }
    if (lines.length === 0) {
      console.error("compactor: node " + l + "/" + i + ": " + (end.ok ? "an empty line" : end.text) + "; clipped");
    }
    const line = lines.length === 0 ? Memory.cut(Memory.flat(text)) : lines.reduce((a, b) => (Memory.bytes(b) < Memory.bytes(a) ? b : a));
    Memory.store(mem, [{ l, i, text: line }]);
    mem.stuck?.("");
  }

  // a line without a label the compactor put first ("Merged line:"),
  // though the prompt asks for none
  export function bare(line: string): string {
    return line.replace(/^(?:(?:merged|compressed|combined|one) )?(?:line|summary):\s*/i, "");
  }

  // a leaf's line starting with its message's kind, as the task asks
  // ("user: ..."), where the compactor left it out: one message is one
  // item. A line tagged already, or a merge's, as it is
  export function tagged(l: number, source: string, line: string): string {
    const kind = l === 0 ? /^([a-z]+): /.exec(source)?.[1] : undefined;
    const has = /^(user|work|mind|illi|tool|echo|note):/.test(line);
    return kind === undefined || has ? line : kind + ": " + line;
  }

  // nodes built: logged in one write, kept
  export function store(mem: Memory, parts: Array<Part & { text: string }>): void {
    Store.nodes(mem.store, parts.map(({ l, i, text }) => ({ first: i * 2 ** l, n: 2 ** l, text })));
    for (const { l, i, text } of parts) {
      Memory.ready(mem, { l, i }, false);
      mem.nodes.set(Memory.slot(l, i), text);
      [mem.view, mem.seen].forEach((view) => (view.size += l === 0 && i < Memory.end(view) ? Memory.bytes(text) : 0));
    }
    for (const { l, i } of parts) {
      const up = { l: l + 1, i: i >> 1 };
      if (Memory.built(mem, l, i ^ 1) && !Memory.built(mem, up.l, up.i)) {
        Memory.ready(mem, up, true);
      }
    }
    parts.forEach(({ l, i }) => mem.made?.(l, i));
  }

  // a call of a summary, its blocks, on the compactor of the chat's
  // pick's vendor; a try that failed told (mem.stuck)
  export function ask(mem: Memory, blocks: Block[]): Call {
    const share = mem.share();
    return AskAI.ask({ ...share, ...Pick.ask(config.config_role("compactor", share)), blocks, patient: true, stuck: (why) => mem.stuck?.(why) }, () => {});
  }

  // a summary's try: its call's end, the call held in `calls` till then
  export function compact(mem: Memory, l: number, i: number, call: Call): Call["done"] {
    mem.calls.set(call, { l, i });
    return call.done.finally(() => mem.calls.delete(call));
  }

  // node (l,i)'s task, but its input
  export function task(l: number, i: number): string {
    const [a, z] = Memory.span({ l, i });
    const n = 2 ** l / 2;
    const fill: Array<[string, string]> = [["{a}", a + "+" + n], ["{b}", a + n + "+" + n], ["{id}", String(a)], ["{end}", String(z)]];
    return fill.reduce((t, [k, v]) => t.replace(k, v), l === 0 ? LEAF : MERGE);
  }

  // a text's first NODE bytes
  export function cut(text: string): string {
    return Buffer.from(text, "utf8").subarray(0, NODE).toString("utf8").replace(/\uFFFD+$/, "");
  }

  export function over(line: string): string {
    return `Too long: your last line for this <input> was ${Memory.bytes(line)} bytes,
over the ${NODE}-byte limit. Write the whole line again, cutting just
enough of the least valuable items to fit before this cut:
${Memory.cut(line)}| ← LIMIT`;
  }

  // View
  // ----

  // of the view or a node above it: kept, or not built
  export function text(mem: Memory, part: Part): string {
    return mem.nodes.get(Memory.slot(part.l, part.i)) ?? WAIT;
  }

  // a line's bytes as calls get it: none until built
  export function size(mem: Memory, part: Part): number {
    return Memory.built(mem, part.l, part.i) ? Memory.bytes(Memory.text(mem, part)) : 0;
  }

  // each view to its end; a batch starts as a view passes `high`, or goes
  // on at a message (`next`) if a missing parent stopped it; between
  // messages, only a whole batch, to half or, as parents not built keep
  // it over (the compactions' lag JOBS calls a level), by `high`: each change
  // makes every call after write the view anew. The chat's merges only
  // its lines before the cut (those after are a turn's whole messages). A
  // node merged away no view holds, nor one under it, is let go
  export function fit(mem: Memory, next = false): void {
    const gone: Part[] = [];
    let changed = false;
    Memory.reach(mem, mem.view, mem.count);
    Memory.reach(mem, mem.seen, mem.hold ? mem.count : Memory.first(mem));
    for (const view of [mem.view, mem.seen]) {
      const [parts, batch] = [view.parts.length, view.batch];
      const k    = view === mem.view ? Memory.cover(view, mem.cut) : view.parts.length;
      const rest = view.parts.slice(k);
      const more = rest.reduce((n, part) => n + Memory.size(mem, part), 0);
      const head = { ...view, parts: view.parts.slice(0, k), size: view.size - more };
      if (head.size > view.high || (next && view.batch)) {
        const merged = Memory.merge(mem, head);
        if (next || merged.size <= Math.max(view.high / 2, head.size - view.high)) {
          [view.parts, view.size, head.size] = [[...merged.parts, ...rest], merged.size + more, merged.size];
          gone.push(...merged.gone);
        }
        view.batch = head.size > view.high / 2;
      }
      changed ||= view.parts.length !== parts || view.batch !== batch;
    }
    gone.filter((part) => !Memory.held(mem, part)).forEach((part) => mem.nodes.delete(Memory.slot(part.l, part.i)));
    if (changed) {
      Memory.save(mem);
    }
    mem.wait.forEach((check) => check());
  }

  // a view to message `end`: its lines from it dropped (the compactions',
  // as loaded, past the first not built), the messages to it appended
  export function reach(mem: Memory, view: View, end: number): void {
    for (const part of view.parts.splice(Memory.cover(view, end))) {
      view.size -= Memory.size(mem, part);
    }
    for (let i = Memory.end(view); i < end; i++) {
      view.parts.push({ l: 0, i });
      view.size += Memory.size(mem, { l: 0, i });
    }
  }

  // the message after a view's last line
  export function end({ parts }: View): number {
    return parts.length === 0 ? 0 : Memory.span(parts[parts.length - 1])[1] + 1;
  }

  // the index of a view's line holding message id (past its end: none)
  export function cover({ parts }: View, id: number): number {
    let [a, z] = [0, parts.length];
    while (a < z) {
      const m = (a + z) >> 1;
      [a, z] = Memory.span(parts[m])[1] < id ? [m + 1, z] : [a, m];
    }
    return a;
  }

  // whether a view holds `part` or a node under it, or will (not there)
  export function held(mem: Memory, part: Part): boolean {
    return [mem.view, mem.seen].some((view) => {
      const k = Memory.cover(view, Memory.span(part)[0]);
      return k === view.parts.length || view.parts[k].l <= part.l;
    });
  }

  // a view's most due pairs merged down to half, as their parents allow:
  // a pair whose parent is built, most due first ((T + 1) / 2^l - i, T
  // the view's end: its age from its last message, in halves; from its
  // first, old pairs won near ties, so a merge rewrote old lines a view
  // should keep), the oldest of equals; a heap of pairs over the view as
  // a linked list, so a view of thousands merges in milliseconds
  export function merge(mem: Memory, from: View): { parts: Part[]; size: number; gone: Part[] } {
    const [t, low] = [Memory.end(from), from.high / 2];
    const view: Array<Part | null> = [...from.parts];
    const gone: Part[] = [];
    const next = view.map((_, k) => k + 1);
    const prev = view.map((_, k) => k - 1);
    const heap: Array<{ d: number; k: number; a: Part; b: Part }> = [];
    const over = (x: (typeof heap)[0], y: (typeof heap)[0]) => x.d > y.d || (x.d === y.d && x.k < y.k);
    const swap = (x: number, y: number) => ([heap[x], heap[y]] = [heap[y], heap[x]]);
    const offer = (k: number) => {
      const [a, b] = [view[k], view[next[k]]];
      if (k < 0 || !a || !b || a.i % 2 !== 0 || b.l !== a.l || b.i !== a.i + 1 || !Memory.built(mem, a.l + 1, a.i / 2)) {
        return;
      }
      heap.push({ d: (t + 1) / 2 ** a.l - a.i, k, a, b });
      for (let x = heap.length - 1; x > 0 && over(heap[x], heap[(x - 1) >> 1]); x = (x - 1) >> 1) {
        swap(x, (x - 1) >> 1);
      }
    };
    const take = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        for (let x = 0; ; ) {
          const m = [x, 2 * x + 1, 2 * x + 2].reduce((m, c) => (c < heap.length && over(heap[c], heap[m]) ? c : m));
          if (m === x) {
            break;
          }
          swap(x, m);
          x = m;
        }
      }
      return top;
    };
    let size = from.size;
    view.forEach((_, k) => offer(k));
    while (heap.length > 0 && size > low) {
      const { k, a, b } = take();
      const j = next[k];
      if (view[k] !== a || view[j] !== b) {
        continue;
      }
      const up = { l: a.l + 1, i: a.i / 2 };
      size += Memory.size(mem, up) - Memory.size(mem, a) - Memory.size(mem, b);
      [view[k], view[j]] = [up, null];
      next[k] = next[j];
      prev[next[j]] = k;
      gone.push(a, b);
      offer(prev[k]);
      offer(k);
    }
    return { parts: view.filter((part) => part !== null), size, gone };
  }

  // once the chat's messages before `end` are built: null; else "Stopped." (signal aborted)
  export function settle(mem: Memory, end: number, signal: AbortSignal): Promise<string | null> {
    return new Promise((resolve) => {
      const check = () => {
        const built = Memory.first(mem) >= end;
        const why = signal.aborted ? "Stopped." : null;
        if (built || why !== null) {
          mem.wait.delete(check);
          signal.removeEventListener("abort", check);
          resolve(why);
        }
      };
      mem.wait.add(check);
      signal.addEventListener("abort", check);
      check();
    });
  }

  export function span(part: Part): [number, number] {
    const a = part.i * 2 ** part.l;
    return [a, a + 2 ** part.l - 1];
  }

  // the regex tries every position; most lines have no newline at all
  export function flat(text: string): string {
    if (!text.includes("\n")) {
      return text;
    }
    return text.replace(/\s*\n\s*/g, " ");
  }

  // its zoom target, "id+n"
  export function ref(part: Part): string {
    return part.i * 2 ** part.l + "+" + 2 ** part.l;
  }

  export function line(part: Part, text: string): string {
    return Memory.ref(part) + "|" + Memory.flat(text);
  }

  export function before(view: Part[], end: number): Part[] {
    return view.filter((part) => Memory.span(part)[1] < end);
  }

  // the view's lines built before message `end`, in blocks (the last cut
  // short), one marked: the last whole one, else the opening one. One
  // mark only: a request takes four, and Anthropic.ts adds three (the
  // system prompt's, a reply's end's, the top-level)
  export function view(mem: Memory, end = mem.count, parts = mem.view.parts): Block[] {
    const lines = Memory.before(parts, end).filter((part) => Memory.built(mem, part.l, part.i)).map((part) => Memory.line(part, Memory.text(mem, part)) + "\n");
    const whole = Math.floor(lines.length / BLOCK);
    const blocks: Block[] = [{ text: "<chat>\n", mark: whole === 0 }];
    for (let k = 0; k < whole; k++) {
      blocks.push({ text: lines.slice(k * BLOCK, (k + 1) * BLOCK).join(""), mark: k === whole - 1 });
    }
    blocks.push({ text: lines.slice(whole * BLOCK).join("") + "</chat>\n", mark: false });
    return blocks;
  }

  export function part(mem: Memory, id: number, n: number): Part | null {
    const l = Math.log2(n);
    const ok = Number.isInteger(id) && Number.isInteger(l) && id >= 0 && id % n === 0 && id + n <= mem.count;
    return ok ? { l, i: id / n } : null;
  }

  // a message (n = 1) whole, a long one a page from `at` (Clip.ts), its
  // images on the first; else the two lines under id+n
  export function zoom(mem: Memory, id: number, n: number, at: number): string {
    const part = Memory.part(mem, id, n);
    const root = n === 1 ? Memory.message(mem, id) : null;
    if (part === null) {
      const roots = Memory.roots(mem.count).map((root) => Memory.ref(root)).join(", ");
      return "No line " + id + "+" + n + ": n is a power of 2, id a multiple of n. The tree's roots: " + roots + ".";
    }
    if (root !== null) {
      const images = at === 0 ? root.images : undefined;
      return id + "+0|" + Memory.show({ ...root, text: clip_page(root.text, at), images });
    }
    return Memory.halves(part).map((half) => Memory.line(half, Memory.node(mem, half) ?? WAIT)).join("\n");
  }

  export function date(mem: Memory, id: number): string {
    const root = Memory.message(mem, id);
    return root === null ? "No message " + id + "." : new Date(root.date).toLocaleString("sv-SE");
  }

  // the tree's levels: as many as the count's bits
  export function levels(mem: Memory): number[] {
    return Array.from({ length: mem.count.toString(2).length }, (_, l) => l);
  }

  // level l's nodes built, in order
  export function* level(mem: Memory, l: number): Generator<[Part, string]> {
    for (let i = 0; (i + 1) * 2 ** l <= mem.count; i++) {
      const text = Memory.node(mem, { l, i });
      if (text !== null) {
        yield [{ l, i }, text];
      }
    }
  }

  // /export: the chat's messages, summaries and agents' logs, then each
  // image its messages name, its base64 read a PIECE at a time
  export function* dump(mem: Memory): Generator<string> {
    const pics = new Set<string>();
    let sep = "\n";
    yield '{"messages": [';
    for (let i = 0; i < mem.count; i++) {
      const { kind, text, date, images, more } = Memory.message(mem, i)!;
      images?.forEach((name) => pics.add(name));
      yield (i === 0 ? "\n" : ",\n") + JSON.stringify({ id: i, kind, text, date, images, more });
    }
    yield '],\n"summaries": [';
    for (const l of Memory.levels(mem)) {
      for (const [part, text] of Memory.level(mem, l)) {
        yield sep + JSON.stringify({ id: Memory.span(part)[0], n: 2 ** l, text });
        sep = ",\n";
      }
    }
    yield '],\n"agents": {';
    sep = "\n";
    for (const log of Store.logs(mem.store)) {
      const entries = Store.work(mem.store, log)!.map(({ i, kind, text, date }) => ({ id: i, kind, text, date }));
      yield sep + JSON.stringify(log) + ": " + JSON.stringify(entries);
      sep = ",\n";
    }
    yield '},\n"images": {';
    sep = "\n";
    for (const name of [...pics].sort()) {
      const img = Store.image(mem.store, name);
      if (img === null) {
        continue;
      }
      const data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
      yield sep + JSON.stringify(name) + ': "';
      for (let at = 0; at < data.length; at += 3 * PIECE) {
        yield data.subarray(at, at + 3 * PIECE).toString("base64");
      }
      yield '"';
      sep = ",\n";
    }
    yield "}}\n";
  }

  // /tree: a section for the view, the messages and each level
  export function* page(mem: Memory): Generator<string> {
    const esc  = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const item = (head: string[], text: string) => "<h4>" + esc(head.join(" · ")) + "</h4><pre>" + esc(text) + "</pre>";
    const date = (id: number) => new Date(Memory.message(mem, id)!.date).toLocaleString("sv-SE");
    const when = (a: number, b: number) => date(a) + (a === b ? "" : " – " + date(b));
    const node = (part: Part, text: string) => {
      const [a, b] = Memory.span(part);
      const head = ["LVL" + part.l + " #" + a + "-" + b, when(a, b), Memory.bytes(text) + " B"];
      return item(head, text);
    };
    const levels = Memory.levels(mem);
    const menu = ["VIEW", "ROOT", ...levels.map((l) => "LVL" + l)].map((name) => `<a href="#${name}">${name}</a>`);
    yield `<!doctype html><meta charset="utf-8"><title>illimitable memory</title>
<style>
body { font: 13px/1.4 ui-monospace, monospace; margin: 2em; } nav a { margin-right: 1em; }
section { display: none; } section:target { display: block; }
h4 { margin: .8em 0 .2em; color: #888; font-weight: normal; } pre { margin: 0; white-space: pre-wrap; font: inherit; }
</style>
<script>location.hash = location.hash || "VIEW";</script>
<nav>${menu.join("")}</nav>
<section id="VIEW">`;
    yield mem.view.parts.map((part) => node(part, Memory.text(mem, part))).join("");
    yield '</section>\n<section id="ROOT">';
    for (let i = 0; i < mem.count; i++) {
      const r = Memory.message(mem, i)!;
      yield item(["ROOT #" + i, when(i, i), r.kind, r.size + " B"], r.text);
    }
    for (const l of levels) {
      yield '</section>\n<section id="LVL' + l + '">';
      for (const [part, text] of Memory.level(mem, l)) {
        yield node(part, text);
      }
    }
    yield "</section>\n";
  }

  // Agents
  // ------

  // read whole, by name (its log as now) or by log (a name and its tag,
  // as a report names it: that one, though the name went on to another);
  // never a path
  export function agent(mem: Memory, name: string): Root[] | null {
    const log  = LOG.test(name) ? (name.includes(".") ? name : Memory.agent_log(mem, name)) : null;
    const work = log === null ? null : Store.work(mem.store, log);
    return work?.map((e) => ({ ...e, size: Memory.bytes(Memory.show({ ...e, size: 0 })) })) ?? null;
  }

  // a name's log as now: the one it last took (kept), else in the file
  // the newest so named; none: null
  export function agent_log(mem: Memory, name: string): string | null {
    const known = mem.logs.get(name);
    if (known !== undefined || !AGENT.test(name)) {
      return known ?? null;
    }
    const log = Store.log_of(mem.store, name);
    if (log !== null) {
      mem.logs.set(name, log);
    }
    return log;
  }

  // a new agent's name, its log made: its user's agent's name (own), else
  // numbered past those taken (own-2 on); none (or not a name): a random
  // one (Names.ts) not taken. A name is taken while its agent is (taken
  // tells: at work, or of this run); one freed is used again, with a log
  // of its own (the name and a tag: the time). A user's agent named MAIN
  // is refused: its calls would pass for the chat's own
  export function agent_new(mem: Memory, own: string | null, taken: (name: string) => boolean): string {
    if (own === MAIN) {
      throw new Error("No agent can be named " + MAIN + ": that name is illi's own. Rename the agent's file (" + MAIN + ".md) to spawn it.");
    }
    const base = own !== null && AGENT.test(own) ? own : null;
    for (let n = 1; ; n++) {
      const name = base === null ? names.name_random() : n === 1 ? base : base + "-" + n;
      for (let k = 0; !taken(name); k++) {
        const log = name + "." + (Date.now() * 100 + k).toString(36);
        if (!Store.log_new(mem.store, log, name)) {
          continue;
        }
        mem.logs.set(name, log);
        mem.agents.set(name, 0);
        return name;
      }
    }
  }

  // its length read once, then counted (mem.agents)
  export function agent_push(mem: Memory, name: string, kind: Kind, text: string): number {
    const log = Memory.agent_log(mem, name) ?? name;
    const n = mem.agents.get(name) ?? Store.work_count(mem.store, log);
    const root = Memory.root(n, { kind, text });
    Store.work_push(mem.store, log, name, root);
    mem.agents.set(name, n + 1);
    return root.i;
  }

  export function agent_show(mem: Memory, name: string): string {
    return Memory.agent(mem, name)?.map(Memory.agent_line).join("\n\n") ?? "No agent " + name + ".";
  }

  export function agent_line(root: Root): string {
    return root.i + "|" + Memory.show(root);
  }

}
