// Memory
// ======
// The chat, kept forever, and the views of it calls see (a subagent's,
// a map of it). Sizes are bytes of UTF-8. A message is logged in pages
// (Clip.ts CAP chars, PICS images).
//
// Over the messages grows a binary tree: node (0,i) is message i (or
// the line it was logged with; a result without the <history> line
// recall appended: Memory.source) in at most NODE bytes, node (l,i) merges
// (l-1,2i) and (l-1,2i+1). A node is ready once its halves are built
// (`ready`, by level, in order); the compactor builds it (Compactor.ts),
// a source that fits as it is.
//
// A view lists nodes covering the chat from its first message (`from`) to its
// end, oldest first; each message it reaches appends its node. Past `high`
// bytes, a batch merges the adjacent siblings whose parent is built and most
// due (oldest since its last message, to the view's end, in halves: detail
// fades with age) down to half, so a view changes only at its end between
// batches. Two, each on its own: the chat's (turns'), from the last /clear
// (or the recap of the last /compact) to the last message (what came before
// is never sent, not even as lines: it is found by search and zoom), and the
// compactions', from the first message to the first not built.
// A call gets one in BLOCK-line blocks, the last whole one marked for the
// cache, and so are the messages from the cut (recent): a wire keeps the
// last marks its vendor takes (AskAI.marks); few lines, as those past it
// are read anew (a compaction's view ends at its node, then its task,
// both unmarked).
//
// Kept in the project's SQLite file (Store.ts): the messages, each
// with the folder illi ran in, the nodes, the agents' logs (Logs.ts), and the state
// (the views, the chat's pick, goal and suggested reply...), written
// over. A message's pages are logged in one write. Memory holds only the
// view's nodes and those built above them; any other is read from the
// file, and so are images, by their hash.
//
// A span of time (the date tool's: Memory.days) is told from the lines
// built already, no model asked: its messages found by date (Store.span),
// then the coarsest lines over them split while a cap holds
// (Memory.lines); so is a subagent's map of the chat (Memory.map): the
// chat's view's messages in a few dozen lines, the newest each its own,
// detail fading with age.

import type { Ask, Block, Call, Img, Kind, Say } from "../ai/AskAI.ts";
import { Compactor } from "./Compactor.ts";
import { clip_page, clip_pages, history_bare } from "../tools/Clip.ts";
import { HOME, Store, type Place } from "./Store.ts";
import { FIT, IMAGE, PICS, PIXELS, image_fit } from "../ai/Image.ts";
import { image_kind } from "../ui/View.ts";
import { When, type Span } from "./When.ts";

// Types
// =====

// a message (a page): its index, kind, text, size, date, images, its
// node (if written with it), whether it is logged as one with the next
export type Root = Msg & { i: number; size: number; date: string };

// a message to log: a Root but its index and size; no date: now
export type Msg = { kind: Kind; text: string; date?: string; images?: string[]; line?: string; more?: boolean };

// node (l,i), as a line of a view
export type Part = { l: number; i: number };

// a view: its lines, the bytes of those built, a batch under way, the
// bytes past which it merges to half, the first message it holds (the
// chat's: the last /clear's, or the last /compact's recap, as nothing
// before it is sent; older ones are only the memory's, summarized on, a
// search or zoom away; the compactions': 0)
type View = { parts: Part[]; size: number; batch: boolean; high: number; from: number };

// what a compaction shares with the chat's turns: all but the blocks
export type Share = Omit<Ask, "blocks">;

// a view as saved
type Kept = { parts: Array<[number, number]>; batch: boolean };

// the state: the chat's view, the compactions' (none: the chat's); top:
// the chat's view's first message (`from`)
type Saved = Kept & { seen?: Kept; pick: object | null; goal?: string | null; suggest?: string; work?: string[]; agent?: string | null; cut?: number; show?: number; top?: number };

// store: its file (Store.ts); cwd: the folder illi runs in, logged with
// each message ("": unknown); count: the pages logged; pick: the chat's,
// as last set;
// goal: the user's (/goal; null: none), till met or halted (Chat.ts);
// suggest: the suggested reply shown as the last turn ended
// (Suggest.ask; "": none), so a start shows it again; agent: the main
// agent's profile (Custom.ts; null: illi's own); work:
// what ran, as last saved; cut: the first message a turn's call gets
// whole (Memory.cutoff; those before, as the view's lines), show: the
// first the screen shows whole (at the cut, or before it, as /compact
// leaves it: the screen keeps what it showed above the recap), tail: the
// bytes of those from the cut, as last counted (Memory.fill); nodes: the
// texts of the views' nodes
// built and of those above them, by slot; agents: their logs' lengths,
// logs: each name's log as now (a name freed takes a new one: Logs.start);
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

// the bytes a token is taken for (UTF-8 text's rough mean): sizes here
// are bytes, a model's limits tokens
export const TOKEN = 4;
// a turn's call gets its model's autocompact of the chat (Chat.cap, in
// bytes: Memory.cutoff): its latest messages whole, the view's lines
// before them. A view past its `high` merges to half: the chat's, half a
// call's (so its lines leave the messages at least half), set by the
// first cutoff (till then none: a restart never merges it, whatever the
// model's window), the compactions' 16-32 KB (24 KB)
const SEEN  = 32000;
const BLOCK = 4;


// what an image's hash takes between turns of the event loop
export const PIECE = 2 ** 20;

const WAIT = "(not summarized yet: zoom it)";

// the date tool's cap on a span's lines (Memory.lines): they split finer
// only while they stay SPAN_LINES at most and their texts SPAN_BYTES
// (TOKEN each: about 1,200 tokens), so a span of more messages (or
// longer lines) gets coarser lines, never more of them, however long or
// short it is in time; only the tree's roots over a span, if more, pass it
const SPAN_LINES = 12;
const SPAN_BYTES = 4800;

// a subagent's map of the chat (Memory.map): its newest MAP_RECENT
// messages each a line of its own, lines split while they stay MAP_LINES
// at most and MAP_BYTES (about 4,000 tokens): enough to see what the
// chat holds and zoom where a task needs
const MAP_RECENT = 8;
const MAP_LINES  = 48;
const MAP_BYTES  = 16000;

// the most messages a line covers just before or after a span with none
// (Memory.near)
const NEAR = 8;

// what the date tool's lines end with: how to go deeper
const DEEPER = "Zoom a line to go deeper";


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
      dir, store, cwd: "", count: Store.count(store), pick: null, goal: null, suggest: "", agent: null, work: [], cut: 0, show: 0, tail: { cut: 0, count: 0, bytes: 0 }, nodes: new Map(), agents: new Map(), logs: new Map(), ready: [],
      view: { parts: [], size: 0, batch: false, high: Infinity, from: 0 }, seen: { parts: [], size: 0, batch: false, high: SEEN, from: 0 },
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
    // from <= cut <= count, show <= cut, whatever was saved
    mem.view.from = Math.min(index(saved?.top, 0), mem.count);
    mem.cut = Math.max(Math.min(index(saved?.cut, 0), mem.count), mem.view.from);
    mem.show = Math.min(index(saved?.show, mem.cut), mem.cut);
    Memory.open(mem, mem.view, kept(saved));
    Memory.open(mem, mem.seen, kept(saved?.seen) ?? kept(saved));
    return mem;
  }

  // a view as kept, from its first message (none kept: the highest nodes
  // built)
  export function open(mem: Memory, view: View, kept: Kept | null): void {
    const keys = kept === null ? null : new Set(kept.parts.map(([l, i]) => Memory.slot(l, i)));
    view.parts = Memory.roots(mem.count, view.from).flatMap((part) => Memory.down(mem, part, keys));
    view.size = view.parts.reduce((n, part) => n + Memory.size(mem, part), 0);
    view.batch = kept?.batch ?? false;
  }

  // another project's chat, its file open (Store.visit), to read (zoom,
  // date, images, an agent's log): no view, nothing built, saved or
  // stopped
  export function glance(mem: Memory, store: Store): Memory {
    return {
      ...mem, store, count: Store.count(store), nodes: new Map(), agents: new Map(), logs: new Map(), ready: [], busy: new Set(), calls: new Map(), hold: true, done: true, wait: new Set(),
      view: { parts: [], size: 0, batch: false, high: Infinity, from: 0 }, seen: { parts: [], size: 0, batch: false, high: SEEN, from: 0 },
    };
  }

  // the state, written over (none once the chat is stopped: its file is
  // closed)
  export function save(mem: Memory): void {
    if (mem.done) {
      return;
    }
    const [chat, seen] = [mem.view, mem.seen].map((view): Kept => ({ parts: view.parts.map((part) => [part.l, part.i]), batch: view.batch }));
    Store.save(mem.store, { ...chat, seen, pick: mem.pick, goal: mem.goal, suggest: mem.suggest, agent: mem.agent, work: mem.work, cut: mem.cut, show: mem.show, top: mem.view.from });
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
    root.size = Memory.bytes(Memory.plain(root));
    return root;
  }

  // a message as plain text, as models read it: its kind, then its text
  // (its images named)
  export function plain(root: Root): string {
    const pics = (root.images ?? []).map((name) => "\n[image " + name + "]");
    return root.kind + ": " + root.text + pics.join("");
  }

  // the pages [a, b) of the message page `id` is one of (Memory.pages:
  // each but its last says more)
  export function paged(mem: Memory, id: number): [number, number] {
    let [a, b] = [id, id + 1];
    while (a > 0 && Memory.message(mem, a - 1)?.more) {
      a -= 1;
    }
    while (b < mem.count && Memory.message(mem, b - 1)?.more) {
      b += 1;
    }
    return [a, b];
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
    Compactor.pump(mem);
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
  export function whole(mem: Memory, from: number, high: number, most = PICS): number {
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
  // folds with it (show), one a /compact left behind the view's start
  // too: what it kept above the recap goes with the cut's first move
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

  // what a turn sends of the chat, at its cut `from` (cutoff), for its
  // new messages (each its pages [id, end)): its chat to the first of
  // them (chat), and its new text: all logged from that one on, each new
  // one as sent, any other entry between (a stop's note, a stopped
  // agent's report) tagged with its kind; their images
  export function turn(mem: Memory, from: number, msgs: Array<{ id: number; end: number }>): { view: Block[]; text: string; imgs: Img[] } {
    const says: Say[] = [];
    for (let i = Math.max(msgs[0].id, from); i < mem.count; ) {
      const msg = msgs.find((m) => i >= m.id && i < m.end);
      says.push(msg === undefined ? { text: Memory.plain(Memory.message(mem, i)!), imgs: [] } : Memory.say(mem, i, msg.end));
      i = msg === undefined ? i + 1 : msg.end;
    }
    return { view: Memory.chat(mem, from, msgs[0].id), text: says.map((say) => say.text).join("\n\n"), imgs: says.flatMap((say) => say.imgs) };
  }

  // a turn's chat: the view's lines before the cut `from`, then the
  // messages from it to its new ones (`end`) whole; each marked where its
  // cache entry is (a wire keeps the last its vendor takes: Wire.marks)
  export function chat(mem: Memory, from: number, end: number): Block[] {
    return [...Memory.view(mem, from), ...Memory.recent(mem, from, Math.max(from, end))];
  }

  // messages [a, b) whole, as a turn's call gets the latest before its new
  // ones: each "id|kind: text" (an image named, a zoom away), in blocks of
  // BLOCK from the cut, the last whole one marked for the cache (a turn
  // adds a few, so the next finds it), the rest in the last block
  export function recent(mem: Memory, a: number, b: number): Block[] {
    const texts = Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k + "|" + Memory.plain(Memory.message(mem, a + k)!) + "\n\n");
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
  // copy for models (Image.ts) if it is larger than they take (FIT,
  // IMAGE; one of more than PIXELS goes as is); hashed and scaled off the
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
    const big = Math.max(size.width, size.height) > FIT || bytes.length > IMAGE;
    const fit = big ? await image_fit(bytes, PIXELS) : null;
    Store.image_put(mem.store, name, bytes, fit === null || typeof fit === "string" ? null : fit.bytes);
    return name;
  }

  // what models get of message id's images: their copies, if any (a
  // JPEG, or a WebP: by its bytes), else themselves (one not kept: left
  // out)
  export function images(mem: Memory, id: number): Img[] {
    const names = Memory.message(mem, id)?.images ?? [];
    return names.flatMap((name) => {
      const img = Store.image(mem.store, name);
      if (img === null) {
        return [];
      }
      const data = Buffer.from(img.fit ?? img.data).toString("base64");
      return [{ type: img.fit !== null ? image_kind(img.fit) ?? "image/jpeg" : "image/" + name.split(".")[1], data }];
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

  // the tree's roots from message `from` on: the largest nodes that tile
  // [from, count), in order (from the first: a node per power of two in
  // the count, largest first)
  export function roots(count: number, from = 0): Part[] {
    const out: Part[] = [];
    for (let id = from; id < count; ) {
      let l = 0;
      while (id % 2 ** (l + 1) === 0 && id + 2 ** (l + 1) <= count) {
        l += 1;
      }
      out.push({ l, i: id / 2 ** l });
      id += 2 ** l;
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

  // node (l,i)'s source, what the compactor builds it from (null: a half
  // not built yet): a leaf's, its message as models read it (or the line
  // it was logged with), a result without the <history> line recall
  // appended (history_bare: never summarized, so never indexed nor found
  // again as if it had happened); a merge's, its halves' lines
  export function source(mem: Memory, l: number, i: number): string | null {
    if (l === 0) {
      const root = Memory.message(mem, i);
      return root === null ? null : root.line ?? Memory.plain(root.kind === "echo" ? { ...root, text: history_bare(root.text) } : root);
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

  // the first message the chat's view sends not built, else the count:
  // one before its `from` (a /clear, a recap) is never sent, so never
  // waited on
  export function due(mem: Memory): number {
    return (mem.ready[0] ?? []).find((i) => i >= mem.view.from) ?? mem.count;
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

  // no node starts again, nor runs: those running are cut
  export function stop(mem: Memory): void {
    mem.done = true;
    mem.calls.forEach((_, call) => call.stop());
    Store.close(mem.store);
  }

  // nodes built: logged in one write, kept
  export function keep(mem: Memory, parts: Array<Part & { text: string }>): void {
    Store.nodes(mem.store, parts.map(({ l, i, text }) => ({ first: i * 2 ** l, n: 2 ** l, text })));
    for (const { l, i, text } of parts) {
      Memory.ready(mem, { l, i }, false);
      mem.nodes.set(Memory.slot(l, i), text);
      [mem.view, mem.seen].forEach((view) => (view.size += l === 0 && i >= view.from && i < Memory.end(view) ? Memory.bytes(text) : 0));
    }
    for (const { l, i } of parts) {
      const up = { l: l + 1, i: i >> 1 };
      if (Memory.built(mem, l, i ^ 1) && !Memory.built(mem, up.l, up.i)) {
        Memory.ready(mem, up, true);
      }
    }
    parts.forEach(({ l, i }) => mem.made?.(l, i));
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

  // a view to message `end`, from its first: its lines before that dropped
  // (a /clear's), its lines from `end` dropped (the compactions', as
  // loaded, past the first not built), the messages to it appended
  export function reach(mem: Memory, view: View, end: number): void {
    for (const part of view.parts.splice(0, Memory.cover(view, view.from))) {
      view.size -= Memory.size(mem, part);
    }
    for (const part of view.parts.splice(Memory.cover(view, end))) {
      view.size -= Memory.size(mem, part);
    }
    for (let i = Memory.end(view); i < end; i++) {
      view.parts.push({ l: 0, i });
      view.size += Memory.size(mem, { l: 0, i });
    }
  }

  // the message after a view's last line (none: its first)
  export function end({ parts, from }: View): number {
    return parts.length === 0 ? from : Memory.span(parts[parts.length - 1])[1] + 1;
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

  // whether a view holds `part` or a node under it, or will (not there);
  // never one wholly before the view's `from`
  export function held(mem: Memory, part: Part): boolean {
    return [mem.view, mem.seen].some((view) => {
      if (Memory.span(part)[1] < view.from) {
        return false;
      }
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

  // once the messages the chat's view sends before `end` are built: null;
  // else "Stopped." (signal aborted)
  export function settle(mem: Memory, end: number, signal: AbortSignal): Promise<string | null> {
    return new Promise((resolve) => {
      const check = () => {
        const built = Memory.due(mem) >= end;
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
  // short), one marked for the cache: the last whole one, else the
  // opening one
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
      return id + "+0|" + Memory.plain({ ...root, text: clip_page(root.text, at), images });
    }
    return Memory.halves(part).map((half) => Memory.line(half, Memory.node(mem, half) ?? WAIT)).join("\n");
  }

  // message id's date and time, in illi's zone, as the date tool's other
  // answers say a day (When.moment: Wed 21 Oct 2026 14:05)
  export function date(mem: Memory, id: number): string {
    const root = Memory.message(mem, id);
    return root === null ? "No message " + id + "." : When.moment(Date.parse(root.date));
  }

  // Spans of time
  // -------------

  // a span of time (When.Span) as the date tool gives it: a head (the
  // span, its messages, the times of its first and last), its lines
  // (Memory.lines), oldest first, each "id+n|" then its times (When.range:
  // only what the head doesn't say) and its text, then how to go deeper
  // (with the project named: zoom takes it too). A span with no message:
  // said so, with the lines just before and after it (Memory.near)
  export function days(mem: Memory, span: Span, project = ""): string {
    const [a, b] = Store.span(mem.store, span);
    const date = (i: number) => Date.parse(Store.date(mem.store, i) ?? "");
    const said = (part: Part, text: string | null) => Memory.ref(part) + "|" + When.range(date(Memory.span(part)[0]), date(Memory.span(part)[1]), span) + " " + Memory.flat(text ?? WAIT);
    const deeper = DEEPER + (project === "" ? "." : ", with project " + project + ".");
    if (a === b) {
      const near = Memory.near(mem, a);
      const head = "Nothing " + When.on(span) + (near.length === 0 ? ": no messages yet." : a === 0 ? ". After it:" : a === mem.count ? ". Before it:" : ". Before and after it:");
      return [head, ...near.map((part) => said(part, Memory.node(mem, part))), ...(near.length === 0 ? [] : [deeper])].join("\n");
    }
    const head = When.said(span) + " · " + (b - a).toLocaleString("en-US") + (b - a === 1 ? " message" : " messages") + " · " + When.range(date(a), date(b - 1), span);
    return [head, ...Memory.lines(mem, a, b).map((line) => said(line.part, line.text)), deeper].join("\n");
  }

  // the lines over messages [a, b), oldest first, each its text (null:
  // not built): first the tree's roots over them (Memory.roots, the
  // coarsest lines that tile the chat), then, a batch at a time, those not
  // built, else all of the largest, each split into the halves it was
  // made from that reach [a, b), while the lines stay SPAN_LINES at most
  // and their texts SPAN_BYTES (a line not built as WAIT): so a span of a
  // few messages gets them each, one of many coarser lines, never more of
  // them. A
  // line not built that can't split (a message, or no room) is left so,
  // and zoom opens it all the same. The roots alone can pass both (one for
  // each set bit of the chat's count: 13 over a chat of 8,191), and stay:
  // past SPAN_BYTES, each text is cut to an even share of it
  export function lines(mem: Memory, a: number, b: number): Array<{ part: Part; text: string | null }> {
    const reach = (part: Part) => Memory.span(part)[0] < b && Memory.span(part)[1] >= a;
    const read  = (part: Part) => ({ part, text: Memory.node(mem, part) });
    const bytes = (all: Array<{ text: string | null }>) => all.reduce((n, line) => n + Memory.bytes(line.text ?? WAIT), 0);
    let lines = Memory.roots(mem.count).filter(reach).map(read);
    for (;;) {
      const open  = lines.filter((line) => line.part.l > 0);
      const top   = Math.max(...open.map((line) => line.part.l));
      const bare  = open.filter((line) => line.text === null);
      const batch = new Set(bare.length > 0 ? bare : open.filter((line) => line.part.l === top));
      const next  = lines.flatMap((line) => (batch.has(line) ? Memory.halves(line.part).filter(reach).map(read) : [line]));
      if (batch.size === 0 || next.length > SPAN_LINES || bytes(next) > SPAN_BYTES) {
        break;
      }
      lines = next;
    }
    const share = Math.floor(SPAN_BYTES / lines.length);
    return bytes(lines) <= SPAN_BYTES ? lines : lines.map((line) => ({ ...line, text: line.text === null ? null : Memory.cut(line.text, share) }));
  }

  // a subagent's map of the chat (Tools.view), in one block marked for
  // the cache: the chat's view's messages (from its first: what came
  // before is a search away), oldest first, the newest MAP_RECENT each
  // its line, those before them tiled by the tree's largest nodes
  // (Memory.roots), then split one at a time, the most due first (one
  // not built over a half that is, else the most messages for its
  // distance from the chat's end, built or not: detail fades with age,
  // as in a view, so summaries lagging or stuck never spend the lines on
  // the oldest messages), while MAP_LINES and MAP_BYTES hold. Read from
  // the lines built (each read once), no model asked: one not built says
  // so, and zoom opens it. Lines past MAP_BYTES as they start (the
  // roots, many over a long chat) each cut to a share of it
  export function map(mem: Memory): Block[] {
    const from   = Math.min(mem.view.from, mem.count);
    const recent = Math.max(from, mem.count - MAP_RECENT);
    const texts  = new Map<number, string | null>();
    const read   = (part: Part) => {
      const slot = Memory.slot(part.l, part.i);
      if (!texts.has(slot)) {
        texts.set(slot, Memory.node(mem, part));
      }
      return { part, text: texts.get(slot) ?? null };
    };
    const bytes  = (all: Array<{ text: string | null }>) => all.reduce((n, line) => n + Memory.bytes(line.text ?? WAIT), 0);
    const shows  = (line: { part: Part; text: string | null }) => line.text === null && Memory.halves(line.part).some((half) => read(half).text !== null);
    const due    = (line: { part: Part; text: string | null }) => (shows(line) ? Infinity : 2 ** line.part.l / (mem.count - Memory.span(line.part)[0]));
    let lines = [...Memory.roots(recent, from), ...Array.from({ length: mem.count - recent }, (_, k) => ({ l: 0, i: recent + k }))].map(read);
    for (;;) {
      const open = lines.filter((line) => line.part.l > 0);
      if (open.length === 0) {
        break;
      }
      const most = open.reduce((a, b) => (due(b) > due(a) ? b : a));
      const next = lines.flatMap((line) => (line === most ? Memory.halves(line.part).map(read) : [line]));
      if (next.length > MAP_LINES || bytes(next) > MAP_BYTES) {
        break;
      }
      lines = next;
    }
    const share = Math.floor(MAP_BYTES / Math.max(1, lines.length));
    const text  = (line: { text: string | null }) => (line.text === null ? WAIT : bytes(lines) <= MAP_BYTES ? line.text : Memory.cut(line.text, share));
    return [{ text: "<chat>\n" + lines.map((line) => Memory.line(line.part, text(line)) + "\n").join("") + "</chat>\n", mark: true }];
  }

  // the lines just before and after message a, where a span of time with
  // no message falls: before it, the largest built node of NEAR messages
  // at most that ends just before a; after it, the largest that starts
  // at a (none built: the message alone); none past the chat's start or
  // end
  export function near(mem: Memory, a: number): Part[] {
    const out: Part[] = [];
    for (const after of [false, true]) {
      if (after ? a >= mem.count : a === 0) {
        continue;
      }
      const sizes = Array.from({ length: Math.log2(NEAR) + 1 }, (_, k) => Math.log2(NEAR) - k);
      const fits  = sizes.map((l) => ({ l, i: a / 2 ** l - (after ? 0 : 1) })).filter((part) => Number.isInteger(part.i) && Memory.span(part)[1] < mem.count);
      out.push(fits.find((part) => Memory.node(mem, part) !== null) ?? { l: 0, i: after ? a : a - 1 });
    }
    return out;
  }

  // a text in `most` bytes at most: whole, else its start and an ellipsis
  // (a character never cut in two)
  export function cut(text: string, most: number): string {
    if (Memory.bytes(text) <= most) {
      return text;
    }
    return Buffer.from(text, "utf8").subarray(0, Math.max(0, most - 3)).toString("utf8").replace(/\uFFFD+$/, "") + "…";
  }

}
