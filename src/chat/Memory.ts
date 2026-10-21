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
// Files: main/ (messages) and tree/ (nodes), JSON lines in a file per
// day, flushed (Disk.ts); a day's file PACK days old is gzipped in its
// place (.jsonl.gz: pack), and read whole, unpacked, as a line of it is;
// main.index and tree.index give each line's place by slot (its bytes in
// the file unpacked); view.json keeps the view, the chat's pick and goal,
// written over. A message's pages are logged in one write; pages `more`
// after the last that isn't (a crash cut the write) are not in the chat.
// Older chats' lines may name an act (`act`, `ans`, or a line of its own
// with no index): read as any other, the act ignored.
// Memory holds only the view's nodes and those built above them; any
// other line is read by its index. Images are in docs/images/ by their
// hash; an agent's log in docs/agent/<Name>.jsonl.

import * as fs from "node:fs";
import * as zlib from "node:zlib";
import { AskAI, type Ask, type Block, type Call, type Img, type Kind, type Say } from "../ai/AskAI.ts";
import { clip_page, clip_pages } from "../tools/Clip.ts";
import * as config from "../config/Config.ts";
import { Disk } from "./Disk.ts";
import { Pick } from "../ai/Pick.ts";
import * as names from "./Names.ts";
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

// a log: of messages (main) or of nodes (tree)
type Stream = "main" | "tree";

// how far a log is indexed: its last file's day (since 1970), size
type End = [number, number];

// a view in view.json
type Kept = { parts: Array<[number, number]>; batch: boolean };

// view.json: the chat's view, the compactions' (none: the chat's)
type Saved = Kept & { seen?: Kept; main: End; tree: End; pick: object | null; goal?: string | null; work?: string[]; agent?: string | null; cut?: number; show?: number; top?: number };

// fds: files read lately, open, oldest first; unpacked: the gzipped
// day files read lately, unpacked, oldest first; count: the pages logged
// whole; pick: the chat's, as last set;
// goal: the user's (/goal; null: none), till met or halted (Chat.ts);
// agent: the main agent's profile (Custom.ts; null: illi's own); work:
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
// built whose halves are, by level, in order; ends: how far each log is
// indexed; busy: nodes building, by slot; calls: those building's calls;
// hold: no summary starts (a test's chat, which no model answers);
// wait: checks run as the views change; share: what compactions share
// with the chat's turns; made: told of each node built; stuck: told why
// a summary's try failed, as it waits to ask again ("": one was built)
export type Memory = {
  dir    : string;
  fds    : Map<string, number>;
  unpacked: Map<string, Buffer>;
  count  : number;
  pick   : object | null;
  goal   : string | null;
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
  ends   : Record<Stream, End>;
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
const SLOT  = 16;
const DAY   = 864e5;

// the files a chat keeps open to read: its two indexes and the day files
// read lately (mostly its last days), so a chat however old holds a few
const FDS   = 8;

// a day's file this many days old is gzipped (pack), the chat's start
// PACK_WAIT ms behind, then each DAY while it is open; the gzipped files
// read lately kept unpacked
const PACK      = 30;
const PACK_WAIT = 10000;
const UNPACKED  = 4;

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

const IMAGES = "/docs/images/";

const AGENTS = "/docs/agent/";

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

  export function load(dir: string, share: Memory["share"]): Memory {
    const mem: Memory = {
      dir, fds: new Map(), unpacked: new Map(), count: 0, pick: null, goal: null, agent: null, work: [], cut: 0, show: 0, top: 0, tail: { cut: 0, count: 0, bytes: 0 }, nodes: new Map(), agents: new Map(), logs: new Map(), ready: [], ends: { main: [0, 0], tree: [0, 0] },
      view: { parts: [], size: 0, batch: false, high: LINES }, seen: { parts: [], size: 0, batch: false, high: SEEN },
      busy: new Set(), calls: new Map(), hold: false, done: false, wait: new Set(), share,
    };
    const saved = Memory.saved(dir);
    mem.pick = saved?.pick ?? null;
    mem.goal = saved?.goal ?? null;
    mem.agent = saved?.agent ?? null;
    mem.work = saved?.work ?? [];
    mem.cut = saved?.cut ?? 0;
    mem.show = Math.min(saved?.show ?? mem.cut, mem.cut);
    mem.top = saved?.top ?? 0;
    mem.ends.main = Memory.index(mem, "main", saved?.main ?? [0, 0]);
    mem.ends.tree = Memory.index(mem, "tree", saved?.tree ?? [0, 0]);
    mem.count = fs.statSync(dir + "/main.index").size / SLOT;
    while (Memory.message(mem, mem.count - 1)?.more) {
      mem.count -= 1;
    }
    Memory.open(mem, mem.view, saved);
    Memory.open(mem, mem.seen, saved?.seen ?? saved);
    Memory.roots(mem.count).flatMap((part) => Memory.todo(mem, part)).forEach((part) => Memory.ready(mem, part, true));
    Memory.fit(mem);
    Memory.save(mem);
    const pack = () => void Memory.pack(mem).catch((err) => console.error("memory: packing old days failed: " + err.message));
    const daily = setInterval(() => (mem.done ? clearInterval(daily) : pack()), DAY);
    setTimeout(pack, PACK_WAIT).unref();
    daily.unref();
    return mem;
  }

  // view.json; null: none, or unreadable
  export function saved(dir: string): Saved | null {
    try {
      return JSON.parse(fs.readFileSync(dir + "/view.json", "utf8"));
    } catch {
      return null;
    }
  }

  // a view as kept (none: the highest nodes built)
  export function open(mem: Memory, view: View, kept: Kept | null): void {
    const keys = kept === null ? null : new Set(kept.parts.map(([l, i]) => Memory.slot(l, i)));
    view.parts = Memory.roots(mem.count).flatMap((part) => Memory.down(mem, part, keys));
    view.size = view.parts.reduce((n, part) => n + Memory.size(mem, part), 0);
    view.batch = kept?.batch ?? false;
  }

  // written whole, then moved in place; flushed soon (Disk.ts)
  export function save(mem: Memory): void {
    const file = mem.dir + "/view.json";
    const [chat, seen] = [mem.view, mem.seen].map((view): Kept => ({ parts: view.parts.map((part) => [part.l, part.i]), batch: view.batch }));
    fs.writeFileSync(file + ".new", JSON.stringify({ ...chat, seen, pick: mem.pick, goal: mem.goal, agent: mem.agent, work: mem.work, cut: mem.cut, show: mem.show, top: mem.top, ...mem.ends }));
    fs.renameSync(file + ".new", file);
    Disk.wrote(file);
  }

  // indexes the log's lines past `from` (none, or no index: all, in an
  // index made anew); answers how far
  export function index(mem: Memory, stream: Stream, from: End): End {
    const file = mem.dir + "/" + stream + ".index";
    let end: End = fs.existsSync(file) ? from : [0, 0];
    fs.mkdirSync(mem.dir + "/" + stream, { recursive: true });
    const fd = fs.openSync(file, end[0] === 0 ? "w+" : "r+");
    const names = fs.readdirSync(mem.dir + "/" + stream).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl(\.gz)?$/.test(f));
    const days = [...new Set(names.map((f) => Date.parse(f.slice(0, 10)) / DAY))];
    try {
      for (const day of days.filter((day) => day >= end[0]).sort((a, b) => a - b)) {
        end = [day, Memory.scan(mem, stream, day, day === end[0] ? end[1] : 0, fd)];
      }
    } finally {
      fs.closeSync(fd);
    }
    return end;
  }

  // indexes, into fd, the lines of a day's file from byte `at` (gzipped:
  // of it unpacked); answers the file's end. A line a crash cut short is
  // skipped (a file gzipped has none)
  export function scan(mem: Memory, stream: Stream, day: number, at: number, fd: number): number {
    const file = Memory.path(mem, stream, day);
    const data = fs.existsSync(file) ? Memory.slice(file, at, fs.statSync(file).size - at) : Memory.unpacked(mem, file).subarray(at);
    let k = 0;
    for (let nl = data.indexOf(10); nl >= 0; nl = data.indexOf(10, k)) {
      const rec = Memory.parse(data.subarray(k, nl).toString("utf8"), file);
      if (rec !== null) {
        Memory.place(fd, stream, rec, day, at + k, nl - k);
      }
      k = nl + 1;
    }
    if (k < data.length) {
      console.error("skipped the last line of " + file + ": cut short");
      fs.appendFileSync(file, "\n");
      return at + data.length + 1;
    }
    return at + k;
  }

  export function slot(l: number, i: number): number {
    return (2 * i + 1) * 2 ** l - 1;
  }

  // a record's line, in its log's index (an old act's line of its own
  // has none)
  export function place(fd: number, stream: Stream, rec: any, day: number, at: number, length: number): void {
    const buf = Buffer.alloc(SLOT);
    if (rec.i === undefined) {
      return;
    }
    buf.writeDoubleLE(at, 0);
    buf.writeUInt32LE(day, 8);
    buf.writeUInt32LE(length, 12);
    fs.writeSync(fd, buf, 0, SLOT, (stream === "main" ? rec.i : Memory.slot(rec.l, rec.i)) * SLOT);
  }

  // the record at a slot of a log; null: none
  export function read(mem: Memory, stream: Stream, slot: number): any {
    const rec = Memory.pread(Memory.fd(mem, mem.dir + "/" + stream + ".index"), slot * SLOT, SLOT);
    const day = rec.length < SLOT ? 0 : rec.readUInt32LE(8);
    if (day === 0) {
      return null;
    }
    const line = Memory.bytes_at(mem, Memory.path(mem, stream, day), rec.readDoubleLE(0), rec.readUInt32LE(12));
    return JSON.parse(line.toString("utf8"));
  }

  // n bytes of a day's file from byte `at`: of the file, or, gzipped, of
  // it unpacked
  export function bytes_at(mem: Memory, file: string, at: number, n: number): Buffer {
    if (mem.fds.has(file) || fs.existsSync(file)) {
      return Memory.pread(Memory.fd(mem, file), at, n);
    }
    return Memory.unpacked(mem, file).subarray(at, at + n);
  }

  // a gzipped day's file unpacked, kept (the UNPACKED read last)
  export function unpacked(mem: Memory, file: string): Buffer {
    const data = mem.unpacked.get(file) ?? zlib.gunzipSync(fs.readFileSync(file + ".gz"));
    mem.unpacked.delete(file);
    mem.unpacked.set(file, data);
    for (const old of mem.unpacked.keys()) {
      if (mem.unpacked.size <= UNPACKED) {
        break;
      }
      mem.unpacked.delete(old);
    }
    return data;
  }

  // each day's file PACK days old or more gzipped in its place, one at a
  // time, while the chat is open: the archive written, checked against the
  // file and flushed before the file goes (a crash between leaves both,
  // the file read first, packed again next time); answers how many
  export async function pack(mem: Memory, now = Date.now()): Promise<number> {
    const today = Date.parse(new Date(now).toLocaleDateString("sv-SE")) / DAY;
    let n = 0;
    for (const stream of ["main", "tree"] as Stream[]) {
      const names = fs.readdirSync(mem.dir + "/" + stream).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
      for (const name of names.filter((f) => Date.parse(f.slice(0, 10)) / DAY <= today - PACK)) {
        const file = mem.dir + "/" + stream + "/" + name;
        const data = await fs.promises.readFile(file);
        if (mem.done || (data.length > 0 && data[data.length - 1] !== 10)) {
          continue;
        }
        const gz = await new Promise<Buffer>((ok, fail) => zlib.gzip(data, (err, out) => (err ? fail(err) : ok(out))));
        if (!zlib.gunzipSync(gz).equals(data)) {
          throw new Error(file + " won't gzip back to itself");
        }
        await fs.promises.writeFile(file + ".gz.new", gz);
        await fs.promises.rename(file + ".gz.new", file + ".gz");
        await Disk.wrote(file + ".gz");
        const fd = mem.fds.get(file);
        if (fd !== undefined) {
          fs.closeSync(fd);
          mem.fds.delete(file);
        }
        await fs.promises.unlink(file);
        n += 1;
      }
    }
    return n;
  }

  // a file of the chat to read, kept open (the FDS read last) while the
  // chat is in memory
  export function fd(mem: Memory, file: string): number {
    const fd = mem.fds.get(file) ?? fs.openSync(file, "r");
    mem.fds.delete(file);
    mem.fds.set(file, fd);
    for (const [old, gone] of mem.fds) {
      if (mem.fds.size <= FDS) {
        break;
      }
      fs.closeSync(gone);
      mem.fds.delete(old);
    }
    return fd;
  }

  // up to n bytes of an open file, from byte `at`
  export function pread(fd: number, at: number, n: number): Buffer {
    const buf = Buffer.alloc(n);
    return buf.subarray(0, fs.readSync(fd, buf, 0, n, at));
  }

  // up to n bytes of a file, from byte `at`
  export function slice(file: string, at: number, n: number): Buffer {
    const fd = fs.openSync(file, "r");
    try {
      return Memory.pread(fd, at, n);
    } finally {
      fs.closeSync(fd);
    }
  }

  export function path(mem: Memory, stream: Stream, day: number): string {
    return mem.dir + "/" + stream + "/" + new Date(day * DAY).toISOString().slice(0, 10) + ".jsonl";
  }

  export function file(file: string): any[] {
    const data = fs.readFileSync(file, "utf8");
    if (data !== "" && !data.endsWith("\n")) {
      fs.appendFileSync(file, "\n");
    }
    return data.split("\n").flatMap((line) => Memory.parse(line, file) ?? []);
  }

  // null: not JSON
  export function parse(line: string, file: string): any {
    try {
      return JSON.parse(line);
    } catch {
      if (line !== "") {
        console.error("skipped a line of " + file + ": not JSON");
      }
      return null;
    }
  }

  // appended to the file of the local date and synced, then indexed
  export function log(mem: Memory, stream: Stream, recs: object[]): void {
    const day = Date.parse(new Date().toLocaleDateString("sv-SE")) / DAY;
    const lines = recs.map((rec) => JSON.stringify(rec));
    const file = Memory.path(mem, stream, day);
    // a day gzipped written to again (the clock set back): unpacked first,
    // the file read before the archive
    if (!fs.existsSync(file) && fs.existsSync(file + ".gz")) {
      fs.writeFileSync(file, Memory.unpacked(mem, file));
    }
    let at = Memory.append(file, lines);
    const fd = fs.openSync(mem.dir + "/" + stream + ".index", "r+");
    try {
      for (const [k, line] of lines.entries()) {
        Memory.place(fd, stream, recs[k], day, at, Memory.bytes(line));
        at += Memory.bytes(line) + 1;
      }
    } finally {
      fs.closeSync(fd);
    }
    mem.ends[stream] = [day, at];
  }

  // where they start; flushed soon (Disk.ts)
  export function append(file: string, lines: string[]): number {
    const fd = fs.openSync(file, "a");
    try {
      const at = fs.fstatSync(fd).size;
      fs.writeSync(fd, lines.map((line) => line + "\n").join(""));
      return at;
    } finally {
      fs.closeSync(fd);
      Disk.wrote(file);
    }
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
    const pics = (root.images ?? []).map((name) => "\n[image docs/images/" + name + "]");
    return root.kind + ": " + root.text + pics.join("");
  }

  // message i, from its file; null: none
  export function message(mem: Memory, i: number): Root | null {
    return Number.isInteger(i) && i >= 0 && i < mem.count ? Memory.read(mem, "main", i) : null;
  }

  // the messages' pages logged, in one write
  export function push(mem: Memory, msgs: Msg[]): Root[] {
    const roots = msgs.flatMap(Memory.pages).map((msg, k) => Memory.root(mem.count + k, msg));
    Memory.log(mem, "main", roots);
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
    for (let i = mem.count - 1; i >= 0; i--) {
      if (Memory.message(mem, i)!.kind === "user") {
        return i;
      }
    }
    return -1;
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

  // an image's bytes put in place, by their hash, its copy for models
  // beside it; hashed and scaled off the event loop; null: no image kind
  // or unreadable
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
    fs.mkdirSync(mem.dir + IMAGES, { recursive: true });
    if (fit) {
      const out = img.resize(Math.round(size.width * k), Math.round(size.height * k)).jpeg({ quality: 85 });
      await Bun.write(mem.dir + IMAGES + name + ".jpg", await out.bytes());
      Disk.wrote(mem.dir + IMAGES + name + ".jpg");
    }
    await Bun.write(mem.dir + IMAGES + name, bytes);
    Disk.wrote(mem.dir + IMAGES + name);
    return name;
  }

  export function image_file(mem: Memory, name: string): string | null {
    const file = mem.dir + IMAGES + name;
    return /^[0-9a-f]{16}\.[a-z]+$/.test(name) && fs.existsSync(file) ? file : null;
  }

  // what models get of message id's images: their copies, if any
  export function images(mem: Memory, id: number): Img[] {
    const names = Memory.message(mem, id)?.images ?? [];
    return names.map((name) => {
      const fit = fs.existsSync(mem.dir + IMAGES + name + ".jpg");
      const data = fs.readFileSync(mem.dir + IMAGES + name + (fit ? ".jpg" : "")).toString("base64");
      return { type: fit ? "image/jpeg" : "image/" + name.split(".")[1], data };
    });
  }

  // Tree
  // ----

  // of a node the view or a node above it may need
  export function built(mem: Memory, l: number, i: number): boolean {
    return mem.nodes.has(Memory.slot(l, i));
  }

  // node (l,i)'s text, kept or from its file; null: not built
  export function node(mem: Memory, part: Part): string | null {
    const slot = Memory.slot(part.l, part.i);
    return mem.nodes.get(slot) ?? Memory.read(mem, "tree", slot)?.text ?? null;
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
    mem.fds.forEach((fd) => fs.closeSync(fd));
    mem.fds.clear();
  }

  // node (l,i)'s summary: its view to the node and its task, asked till
  // a line fits, TRIES lines at most, the shortest kept. Each try sends
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
      const line = end.text.trim();
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

  // nodes built: logged in one write, kept
  export function store(mem: Memory, parts: Array<Part & { text: string }>): void {
    Memory.log(mem, "tree", parts.map(({ l, i, text }) => ({ l, i, text, size: Memory.bytes(text) })));
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

  // /export: the messages, the summaries, the agents' logs, then every
  // image, each its base64, read a PIECE at a time
  export function* dump(mem: Memory): Generator<string> {
    const ls = (sub: string) => (fs.existsSync(mem.dir + sub) ? fs.readdirSync(mem.dir + sub).sort() : []);
    let sep = "\n";
    yield '{"messages": [';
    for (let i = 0; i < mem.count; i++) {
      const { kind, text, date, images, more } = Memory.message(mem, i)!;
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
    for (const name of ls(AGENTS).map((file) => file.replace(/\.jsonl$/, ""))) {
      const log = Memory.agent(mem, name);
      if (log === null) {
        continue;
      }
      const entries = log.map(({ i, kind, text, date }) => ({ id: i, kind, text, date }));
      yield sep + JSON.stringify(name) + ": " + JSON.stringify(entries);
      sep = ",\n";
    }
    yield '},\n"images": {';
    sep = "\n";
    for (const name of ls(IMAGES)) {
      const file = Memory.image_file(mem, name);
      if (file === null) {
        continue;
      }
      yield sep + JSON.stringify(name) + ': "';
      for (let at = 0, size = fs.statSync(file).size; at < size; at += 3 * PIECE) {
        yield Memory.slice(file, at, 3 * PIECE).toString("base64");
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
    const file = mem.dir + AGENTS + log + ".jsonl";
    return log !== null && fs.existsSync(file) ? Memory.file(file) : null;
  }

  // a name's log as now: the one it last took (kept), else on disk the
  // newest so named (an old one, untagged, first); none: null
  export function agent_log(mem: Memory, name: string): string | null {
    const known = mem.logs.get(name);
    if (known !== undefined || !AGENT.test(name)) {
      return known ?? null;
    }
    const files = fs.existsSync(mem.dir + AGENTS) ? fs.readdirSync(mem.dir + AGENTS) : [];
    const tags  = files.map((f) => LOG.exec(f.replace(/\.jsonl$/, ""))).filter((m) => m !== null && m[1] === name).map((m) => m![2] ?? "");
    const tag   = tags.sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).at(-1);
    const log   = tag === undefined ? null : tag === "" ? name : name + "." + tag;
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
    fs.mkdirSync(mem.dir + AGENTS, { recursive: true });
    const base = own !== null && AGENT.test(own) ? own : null;
    for (let n = 1; ; n++) {
      const name = base === null ? names.name_random() : n === 1 ? base : base + "-" + n;
      for (let k = 0; !taken(name); k++) {
        const log = name + "." + (Date.now() * 100 + k).toString(36);
        try {
          fs.writeFileSync(mem.dir + AGENTS + log + ".jsonl", "", { flag: "wx" });
        } catch (err: any) {
          if (err.code === "EEXIST") {
            continue;
          }
          throw err;
        }
        mem.logs.set(name, log);
        mem.agents.set(name, 0);
        return name;
      }
    }
  }

  // its length read once, then counted (mem.agents)
  export function agent_push(mem: Memory, name: string, kind: Kind, text: string): number {
    const n = mem.agents.get(name) ?? Memory.agent(mem, name)?.length ?? 0;
    const root = Memory.root(n, { kind, text });
    Memory.append(mem.dir + AGENTS + (Memory.agent_log(mem, name) ?? name) + ".jsonl", [JSON.stringify(root)]);
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
