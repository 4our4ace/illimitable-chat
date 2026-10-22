// Chat
// ====
// The agent: the chat of the project illi runs in (Projects.ts), one that
// never ends (Memory.ts), in config.DIR/chat, run in this process, and its
// views (View.ts), each fed by a pipe (Chat.link): the chat's events one
// way, the person's acts the other (Chat.apply), each answered once what
// it logged is on disk. One process at a time holds a project's chat
// (Chat.lock).
//
// One turn at a time. A message is logged as it arrives; the running call
// takes it between tool calls if it goes whole beside its view, else the
// next call does, on the chat's pick (Pick.ts), as its main agent (a
// primary agent of the user's, Custom.ts: Shift+Tab, /agent; none: illi's own). A quit cuts what runs;
// the next start resumes it (Chat.resume), told so. A turn that ends
// answered asks for the user's likely next message, on the cache
// (Chat.suggest), shown till a message or the next turn.

import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as net from "node:net";
import { AskAI, type Call, type End, type Event, type Kind, type Say } from "../ai/AskAI.ts";
import { Custom, type Profile } from "../config/Custom.ts";
import { Disk } from "./Disk.ts";
import { Memory, type Share } from "./Memory.ts";
import { Pick } from "../ai/Pick.ts";
import { Projects } from "./Projects.ts";
import { MASTER, SEARCHES, Tools, type Agent, type Live, type Reply } from "../tools/Tools.ts";
import { ANSWERED, IMAGES, live_push, SUMMARIES, TURN, type Answer, type Link, type Part, type Pipe, type Question, type Server as Out, type Wait } from "../ui/View.ts";
import * as config from "../config/Config.ts";

// Types
// =====

// the chat's end of a view's pipe: the parts it was shown (Chat.teach)
type Sock = { data: { seen: Set<string> }; send: (text: string) => void };

// a message logged: its pages [id, end)
type Msg = { id: number; end: number };

// a project's lock held: what stops its views' socket, what lets it go
// (the socket too)
export type Held = { views: () => void; stop: () => void };

// what the agent saw at its last call: the view before message `from`,
// then every message from it on
type Eye = { parts: Part[]; from: number };

// a goal check (Chat.check): its call, the goal it asks of
type Check = { call: Call; goal: string };

// a suggested reply (Chat.suggest): whether one is asked (a screen shows
// it: Term.ts, config.SUGGEST), whether the turn's last call was answered
// (one is asked as the turn ends), the one shown ("": none; kept in the
// memory's state, mem.suggest, so a start shows it again), its call
// running, how many in a row went unused
type Suggest = { on: boolean; due: boolean; text: string; call: Call | null; unused: number };

// a chat: model: what the turn's call runs on, as picked when it began
// (a /model since picks the next call's); asked: a request out, nothing
// back; open: tool calls without results; sent, wait: messages given and
// waiting; next: those sent as a stopped turn winds down, a new turn's;
// after: the commands run after turns (config.AFTER); writes,
// held: the posts logging, one after another, and the logging held
// meanwhile (null: none); switched: a main agent switch not noted in the
// chat yet, was: the agent and pick noted before it; picks: what each
// main agent ran on when left, if not its own (by name, "": illi's);
// suggest: the suggested reply; fit: the share of its context a turn
// gets (Chat.refit makes it smaller, till illi starts again), refits: the
// refits since a call was last answered
export type Chat = {
  mem   : Memory;
  tools : Tools;
  pick  : Pick;
  socks : Set<Sock>;
  busy  : boolean;
  call  : Call | null;
  model : string;
  asked : boolean;
  open  : number;
  sent  : Msg[];
  wait  : Msg[];
  next  : Msg[];
  halt  : AbortController;
  live  : Live[];
  calls : Record<string, string>; // its tool calls awaiting their results, by id (Chat.on)
  eye   : Eye;
  after : Promise<void>;
  writes: Promise<unknown>;
  held  : Array<() => void> | null;
  switched: boolean;
  was   : { agent: string | null; pick: string } | null;
  picks : Map<string, Pick>;
  suggest: Suggest;
  fit   : number;
  refits: number;
  asks  : Asked[];
};

// a question asked of the user (Chat.question), and what its answer does
type Asked = Question & { done: (reply: Reply) => void };

// Constants
// =========

// the locks, a socket a project (Projects.lock names it)
const LOCKS      = config.DIR + "/locks";
// how long a lock's taking waits on another's, ms: illis starting at once
// would each hold the file shared and fail to take it whole; waiting,
// SQLite has one let go (the others' wait would deadlock), one wins
const GRIP       = 50;
// a turn's head, as a summary's is "Compaction:": one prompt serves both
const HEAD       = "Turn: the user's new message:\n\n";
// a goal's check (Chat.check): its own system prompt (illi's, which says
// a call is a turn or a compaction, made the model summarize the chat
// instead of answering), asked after the chat (the view, its latest
// messages whole) of its goal; unmet, the user's nudge
const GOAL       = "You check a goal. Below is a chat between a user and illi, an AI agent: its older messages as summary lines (id+n|text), then its latest messages whole, then the goal the user set with /goal. Answer yes if the chat shows the goal fully satisfied now, else no. Write that one word, nothing else.";
const GOAL_ASK   = "\nThe goal:\n\n";
const GOAL_NO    = "The goal isn't satisfied yet: keep working.";

// a no to a question (Chat.question): the user's, without a reason and
// before one; no one at the screen to ask; its request stopped. illi's
// own skipped, or no one there to answer (answered: View ANSWERED, then
// the answers)
const SAID_NO    = "The user said no, asked at illi's screen.";
const SAID_WHY   = "The user said no, asked at illi's screen: ";
const NO_ONE     = "No one is at illi's screen to ask, so it isn't allowed.";
const STOPPED    = "The request was stopped.";
const SKIPPED    = "The user skipped the questions: decide yourself, or ask in your reply.";
const NO_ANSWER  = "No one is at illi's screen to answer: decide yourself, or ask in your reply.";

// a chat that outgrew its model's window (Chat.refit): a turn's share of
// the context made this much smaller, when the request itself was too
// long; the most refits in a row; a turn's room, of the model's window;
// the note the turn goes on from (#: the model), the one it ends with
const FIT        = 0.8;
const REFITS     = 3;
const ROOM       = 0.9;
const REFIT      = "The chat outgrew #'s window: more of it is summarized now, each summary a zoom away. Go on where you were.";
const NO_FIT     = "No reply: the chat won't fit #'s window even summarized. /clear starts a fresh screen, or /model picks a model with a bigger window.";

// a new chat's first message, its node written with it, so no compactor
// call summarizes it
const HELLO      = "Hi, I'm illi, short for illimitable: an AI, so I can make mistakes. One chat that never ends, kept in a memory tree, recent days in more detail. I work in the folder you start me in; each git repo gets a chat of its own. Ask me anything, for days, weeks, years; /help lists the commands.";
const HELLO_LINE = "illi: hello: illi (illimitable), one endless chat in a memory tree, one per git repo; works in the folder it starts in; /help for commands.";

// a suggested reply (Chat.suggest): what the model is asked after the
// turn's last request and its answer, none its answer unless the next
// step is plain; the most tokens it writes, its thinking's too (a line is
// some 20; gpt-6-luna at high effort thought 30 to 120 more); how many in
// a row going unused stop them till illi starts again; twice the words
// it's asked for, past which one is none; answers that are none (one that
// says so, thanks or praise, illi's own voice)
const SUGGEST     = [
  "Suggest the user's next message to illi: what they'd type next, not what illi thinks they should do. They should think: I was about to type that.",
  "2 to 12 words, in their own voice and style, and specific: \"run the tests\", not \"continue\". illi offered choices: the one they'd pick. illi asked to go on: \"yes\". The work is done and the next step plain: that step, like \"commit it\".",
  "Never thanks or praise, a question, illi's voice (\"Let me\", \"I'll\"), an idea they didn't ask for, or more than one sentence.",
  "After an error or a misunderstanding, or when the next step isn't plain from what they said, answer with nothing: none beats a wrong guess. Output only the message, or nothing.",
].join("\n");
const SUGGEST_MAX = 256;
const UNUSED      = 5;
const WORDS       = 24;
const NONE        = /^\W*(nothing|none|no suggestion|silence|n\/a|thanks|thank you|looks good|lgtm|great|perfect|nice|awesome)\W*$|^(let me|i'll|i will|i've|here's|here is)\b/i;

// Globals
// =======

// the project's lock and its file, while this process holds its chat
// (Chat.lock)
let held: Held | null = null;
let LOCK = "";

// Chat
// ====

export namespace Chat {

  // holds the chat of the project at cwd for this process (Chat.claim),
  // let go once the chat is closed (Chat.close); a connection to its
  // socket goes to `serve` (another terminal's view: Remote.ts). false:
  // another illi holds it
  export async function lock(cwd = process.cwd(), serve?: (sock: net.Socket) => void): Promise<boolean> {
    const name = Projects.lock(Projects.place(cwd).path);
    const got = await Chat.claim(name, serve);
    if (got === null) {
      return false;
    }
    [held, LOCK] = [got, Chat.lock_file(name)];
    return true;
  }

  // a project's lock (by its name, Projects.lock) taken: its lock file
  // held in an exclusive transaction, which the system lets go however
  // the process ends (a crash leaves nothing that holds it), so one
  // process holds it at a time; in a folder only its user can open. With
  // `serve`, a socket beside it too, where another terminal's view joins
  // (a view can do what the person can): only the lock's holder makes
  // one, so one there is a crash's, replaced. null: another holds it
  export async function claim(name: string, serve?: (sock: net.Socket) => void): Promise<Held | null> {
    fs.mkdirSync(LOCKS, { recursive: true, mode: 0o700 });
    fs.chmodSync(LOCKS, 0o700);
    const db = Chat.grip(Chat.lock_file(name));
    if (db === null) {
      return null;
    }
    if (serve === undefined) {
      return { views: () => {}, stop: () => db.close() };
    }
    try {
      const file = Chat.socket(name);
      fs.rmSync(file, { force: true });
      const views = await Chat.listen(file, serve);
      return { views, stop: () => {
        views();
        db.close();
      } };
    } catch (err) {
      db.close();
      throw err;
    }
  }

  // a lock file held: an exclusive transaction on it, its journal in
  // memory (no file a crash leaves); null: another connection has one
  export function grip(file: string): Database | null {
    const db = new Database(file, { create: true });
    try {
      db.run("pragma busy_timeout = " + GRIP);
      db.run("pragma journal_mode = memory");
      db.run("begin exclusive");
      return db;
    } catch (err: any) {
      db.close();
      if (err?.code === "SQLITE_BUSY") {
        return null;
      }
      throw err;
    }
  }

  // a server on a lock's socket, only its user's to reach; what stops it
  // (its connections ended, its file gone), once
  export function listen(file: string, serve: (sock: net.Socket) => void): Promise<() => void> {
    return new Promise((done, fail) => {
      const socks  = new Set<net.Socket>();
      const server = net.createServer((sock) => {
        socks.add(sock);
        sock.on("close", () => socks.delete(sock));
        sock.on("error", () => {});
        serve(sock);
      });
      server.once("error", fail);
      server.listen(file, () => {
        fs.chmodSync(file, 0o600);
        let up = true;
        done(() => {
          if (up) {
            up = false;
            server.close();
            socks.forEach((sock) => sock.destroy());
          }
        });
      });
    });
  }

  // how many projects other illis hold in a profile's folder (dir)
  export function others(dir: string): number {
    const locks = fs.existsSync(dir + "/locks") ? fs.readdirSync(dir + "/locks").filter((f) => f.endsWith(".lock")) : [];
    return locks.map((f) => dir + "/locks/" + f).filter((file) => {
      if (file === LOCK) {
        return false;
      }
      const db = Chat.grip(file);
      db?.close();
      return db === null;
    }).length;
  }

  // a project's lock file, by its name (Projects.lock)
  export function lock_file(name: string): string {
    return LOCKS + "/" + name + ".lock";
  }

  // a project's socket, where views join, by its name
  export function socket(name: string): string {
    return LOCKS + "/" + name + ".sock";
  }

  // lets the chat go (its close, a profile's switch): the views' socket
  // closed and gone, then the lock, so the next illi in this project
  // takes it at once. keep: the lock kept, till illi runs again or ends
  // (this project forgotten meanwhile: no illi opens it)
  export function unlock(keep = false): void {
    if (keep) {
      return held?.views();
    }
    held?.stop();
    [held, LOCK] = [null, ""];
  }

  // the chat, its tools working in cwd; what a quit cut goes on
  export function open(cwd: string): Chat {
    const dir = config.DIR + "/chat";
    fs.mkdirSync(dir, { recursive: true });
    const mem = Memory.load(dir, () => Chat.share(chat), Projects.place(cwd));
    mem.cwd = cwd;
    const tools = Tools.serve(mem, {
      ask    : (q, signal) => Chat.question(chat, q, signal),
      push   : (agent, kind, text) => Chat.push(chat, agent, kind, text),
      on     : (agent, ev) => Chat.on(chat, agent, ev),
      report : (agent, text, stopped) => Chat.report(chat, agent, text, stopped),
      change : () => Chat.change(chat),
      pick   : () => chat.pick,
      halt   : () => chat.halt.signal,
      main   : () => chat.mem.agent,
    }, cwd);
    const pick = Pick.load(mem.pick, config.OFFER, config.PICK);
    const chat: Chat = {
      mem, tools, pick, socks: new Set(), busy: false, call: null, model: "", asked: false, open: 0, sent: [], wait: [], next: [],
      halt: new AbortController(), live: [], calls: {}, eye: { parts: [], from: 0 }, after: Promise.resolve(),
      writes: Promise.resolve(), held: null, switched: false, was: null, picks: new Map(),
      suggest: { on: false, due: false, text: mem.suggest, call: null, unused: 0 }, fit: 1, refits: 0, asks: [],
    };
    // a saved pick not offered gave way: told once
    const saved = mem.pick as Pick | null;
    if (saved !== null && Pick.label(saved) !== Pick.label(pick)) {
      mem.pick = pick;
      Memory.save(mem);
      Chat.note(chat, Pick.shown(saved) + " (" + saved.vendor + ") isn't offered here, so the chat now runs on " + Pick.shown(pick) + ".");
    }
    if (mem.count === 0) {
      Memory.push(mem, [{ kind: "illi", text: HELLO, line: HELLO_LINE }]);
    }
    chat.eye = Chat.eye(mem, Math.min(mem.show, Chat.from(chat)));
    mem.made = (l, i) => Chat.made(chat, l, i);
    // summaries stuck: told once till one is built again ("")
    let stuck = false;
    mem.stuck = (why) => {
      if (why !== "" && !stuck) {
        Chat.stuck(chat, why);
      }
      stuck = why !== "";
    };
    const work = mem.work;
    Tools.todo_finished(tools);
    Memory.pump(mem);
    Chat.resume(chat, work).finally(() => Chat.change(chat)).catch((err) => console.error("illi: resume: " + (err?.message ?? err)));
    return chat;
  }

  // what every call of the chat starts with, a summary's too: its system
  // prompt. A summary gets no tools: one it called, ours or the API's
  // own (web search brings code execution), sent its whole input again
  export function share(chat: Chat): Share {
    const system = Tools.system(MASTER, chat.tools.cwd, chat.pick.vendor);
    return { ...Pick.ask(chat.pick), system, searches: 0, server: "" };
  }

  // a turn's system prompt: illi's, with its main agent's instructions
  // and the sticky skills on (a summary's has neither)
  export function system(chat: Chat): string {
    return Tools.system(MASTER + Custom.section(Custom.agent(chat.tools.cwd, chat.mem.agent)) + Tools.stuck(chat.tools.cwd), chat.tools.cwd, chat.pick.vendor);
  }

  // stops all at once, as a quit does: what ran stays saved (mem.work), so
  // the next start resumes it, and the suggested reply shown (a suggestion
  // still being asked, dropped); then the lock let go (keep: kept,
  // Chat.unlock), so the next illi in the project (another terminal's
  // view: Remote.ts) opens it as left
  export function close(chat: Chat, keep = false): void {
    Chat.stop(chat, null);
    chat.suggest.call?.stop();
    chat.suggest.call = null;
    Memory.stop(chat.mem);
    Chat.unlock(keep);
  }

  // a message (its body: its images, sizes given, then its text), logged
  // and taken
  export async function say(chat: Chat, sizes: number[], body: Buffer): Promise<Answer> {
    const images: string[] = [];
    let at = 0;
    for (const size of sizes) {
      const name = await Memory.image_add(chat.mem, body.subarray(at, at + size));
      if (name === null) {
        return { error: IMAGES };
      }
      images.push(name);
      at += size;
    }
    const text = body.subarray(at).toString("utf8");
    Chat.used(chat, text);
    await Chat.writing(chat, async () => Chat.take(chat, Chat.push(chat, null, "user", text, images)));
    return {};
  }

  // a post's logging, after the chat's earlier ones, holding its other
  // logging (Chat.hold) till it ends
  export function writing<T>(chat: Chat, write: () => Promise<T>): Promise<T> {
    const run = chat.writes.then(async () => {
      chat.held = [];
      try {
        return await write();
      } finally {
        const held = chat.held ?? [];
        chat.held = null;
        held.forEach((step) => step());
      }
    });
    chat.writes = run.catch(() => {});
    return run;
  }

  // a step that logs to the chat: now, or once the post logging ends
  export function hold(chat: Chat, step: () => void): void {
    if (chat.held === null) {
      step();
    } else {
      chat.held.push(step);
    }
  }

  // a message logged: to the running call if it goes whole in what the
  // chat's model takes (Chat.cap: its pages, and a page alone, as the
  // last always goes whole), else to the next; while a stopped turn
  // winds down, to a new turn after it
  export function take(chat: Chat, msg: Msg): void {
    const mem  = chat.mem;
    const high = Chat.cap(chat) * 4;
    if (chat.busy && chat.halt.signal.aborted) {
      chat.next.push(msg);
      return;
    }
    if (chat.call !== null && Memory.whole(mem, msg.id, high) === msg.id && Memory.message(mem, msg.id)!.size <= high) {
      chat.sent.push(msg);
      chat.call.send(Memory.say(mem, msg.id, msg.end));
      return;
    }
    chat.wait.push(msg);
    if (!chat.busy) {
      Chat.turn(chat);
    }
  }

  // a turn: its calls, one after another while messages wait; one that
  // ends answered asks for a suggested reply. The messages sent as a
  // stopped one wound down start a new one. A to-do list all done goes as
  // it starts and ends (Tools.todo_finished)
  export async function turn(chat: Chat): Promise<void> {
    chat.busy = true;
    Chat.unsuggest(chat);
    Tools.todo_finished(chat.tools);
    try {
      let go = true;
      while (go && chat.wait.length > 0) {
        go = await Chat.call(chat);
      }
    } catch (err: any) {
      chat.suggest.due = false;
      Chat.failed(chat, String(err?.message ?? err));
    } finally {
      const why: string | null = chat.halt.signal.aborted ? chat.halt.signal.reason : null;
      if (why !== null) {
        Chat.note(chat, why);
      }
      chat.call = null;
      chat.sent = [];
      chat.wait = chat.next.splice(0);
      chat.busy = false;
      Tools.todo_finished(chat.tools);
      Chat.live(chat, null, []);
      Chat.after(chat);
      Chat.change(chat);
      if (chat.wait.length > 0) {
        void Chat.turn(chat);
      } else if (why === null && chat.suggest.due) {
        Chat.suggest(chat);
      }
    }
  }

  // where a call's messages go whole from (Memory.cutoff; a message
  // meanwhile may move it): as many of the chat's tokens as its model
  // takes (config_context), 4 bytes each
  export function from(chat: Chat): number {
    return Memory.cutoff(chat.mem, Chat.cap(chat) * 4);
  }

  // the tokens of the chat a turn sends on the chat's model, its share as
  // the chat's refits left it (fit)
  export function cap(chat: Chat): number {
    return Math.round(config.config_context(chat.pick.model, Pick.window(chat.pick)) * chat.fit);
  }

  // false: the turn ends. Its new text: all logged from the first message
  // waiting, each waiting one as sent, any other entry between (a stop's
  // note, a stopped agent's report) tagged with its kind
  export async function call(chat: Chat): Promise<boolean> {
    const mem = chat.mem;
    const halt = (chat.halt = new AbortController());
    chat.suggest.due = false;
    Chat.change(chat);
    let from = -1;
    while (from !== Chat.from(chat)) {
      from = Chat.from(chat);
      const why = await Memory.settle(mem, from, halt.signal);
      if (why !== null) {
        if (!halt.signal.aborted) {
          Chat.failed(chat, why);
        }
        return false;
      }
    }
    const msgs = (chat.sent = chat.wait.splice(0));
    const says: Say[] = [];
    for (let i = Math.max(msgs[0].id, from); i < mem.count; ) {
      const msg = msgs.find((m) => i >= m.id && i < m.end);
      says.push(msg === undefined ? { text: Memory.show(Memory.message(mem, i)!), imgs: [] } : Memory.say(mem, i, msg.end));
      i = msg === undefined ? i + 1 : msg.end;
    }
    const view = Memory.chat(mem, from, msgs[0].id);
    const text = says.map((say) => say.text).join("\n\n");
    const imgs = says.flatMap((say) => say.imgs);
    const server = Tools.at(chat.tools, "main");
    chat.eye = Chat.eye(mem, mem.show);
    chat.socks.forEach((sock) => Chat.show(chat, sock));
    const blocks = [...view, Tools.here(chat.tools), Tools.at_work(chat.tools), { text: HEAD + text, mark: true }];
    const window = Pick.window(chat.pick);
    const ask = { ...Chat.share(chat), system: Chat.system(chat), searches: SEARCHES, server, blocks, imgs, keep: true, room: window === undefined ? undefined : Math.round(window * ROOM) };
    chat.model = chat.pick.model;
    chat.asked = true;
    chat.open = 0;
    const call = (chat.call = AskAI.ask(ask, (ev) => Chat.on(chat, null, ev)));
    Chat.change(chat);
    return Chat.ended(chat, call, halt);
  }

  // the turn's call ends; false: the turn ends
  export async function ended(chat: Chat, call: Call, halt: AbortController): Promise<boolean> {
    const end = await call.done;
    chat.call = null;
    Chat.unanswered(chat, null);
    Chat.live(chat, null, []);
    chat.wait.unshift(...chat.sent.slice(chat.sent.length - end.left.length));
    chat.suggest.due = end.ok && !halt.signal.aborted;
    chat.refits = end.ok ? 0 : chat.refits;
    const full = end.stop === "full" && !halt.signal.aborted;
    if (!end.ok && !halt.signal.aborted && !full) {
      Chat.failed(chat, end.text, end);
    }
    if (end.note) {
      Chat.all(chat, { $: "note", text: end.note });
    }
    if (full) {
      return Chat.refit(chat, end.text !== "");
    }
    const goal = chat.mem.goal;
    if (end.ok && !halt.signal.aborted && chat.wait.length === 0 && goal !== null) {
      return Chat.checked(chat, Chat.check(chat, goal), halt);
    }
    return !halt.signal.aborted;
  }

  // the user's goal (/goal), asked of the chat's model, without tools, on
  // the chat as it is now, as much of it whole as a turn gets (Chat.from)
  export function check(chat: Chat, goal: string): Check {
    const mem  = chat.mem;
    const at   = Chat.from(chat);
    const tail = Array.from({ length: mem.count - at }, (_, k) => at + k).map((i) => {
      const msg = Memory.message(mem, i)!;
      return Memory.line({ l: 0, i }, msg.kind + ": " + msg.text) + "\n";
    });
    const blocks = [...Memory.view(mem, at), { text: tail.join("") + GOAL_ASK + goal, mark: true }];
    return { call: AskAI.ask({ ...Chat.share(chat), system: GOAL, blocks }, () => {}), goal };
  }

  // a goal check's answer, as the turn's call's is: unmet (any answer but
  // yes), the user's nudge goes to the turn as their message; met, the
  // goal ends; failed, noted, the goal kept. A stop or a /halt meanwhile
  // end it with no nudge, so the turn ends; a message meanwhile drops its
  // answer, the turn going on with that message. false: the turn ends
  export async function checked(chat: Chat, check: Check, halt: AbortController): Promise<boolean> {
    const { call, goal } = check;
    halt.signal.addEventListener("abort", () => call.stop(), { once: true });
    const end = await call.done;
    const mem = chat.mem;
    const on = !halt.signal.aborted && mem.goal === goal && chat.wait.length === 0;
    if (on && !end.ok) {
      Chat.note(chat, "No goal check: " + end.text.replace(/\.$/, "") + ". The goal stays; /halt drops it.");
    } else if (on && /^\W*yes\b/i.test(end.text)) {
      mem.goal = null;
      Memory.save(mem);
      Chat.note(chat, "Goal met.");
    } else if (on) {
      await Chat.writing(chat, async () => Chat.take(chat, Chat.push(chat, null, "user", GOAL_NO)));
    }
    return !halt.signal.aborted;
  }

  // the user's likely next message, asked as a turn ends answered (not
  // from a pipe, nor once UNUSED in a row went unused): after the turn's
  // last request and its answer (AskAI.last), SUGGEST, on what it ran on,
  // with its system prompt and tools, so all before SUGGEST is read from
  // the cache. Its line is shown till a message or the next turn; a tool
  // call, a failure or nothing back shows none. A turn of Claude Code's
  // keeps no request, so one kept on another vendor never stands in
  export function suggest(chat: Chat): void {
    const s = chat.suggest;
    const last = AskAI.last(Tools.at(chat.tools, "main"));
    if (!s.on || s.unused >= UNUSED || last === null || last.ask.vendor !== chat.pick.vendor) {
      return;
    }
    const blocks = [{ text: SUGGEST, mark: false }];
    const ask = { ...last.ask, blocks, imgs: [], server: "", keep: false, from: last, max: SUGGEST_MAX };
    const call = (s.call = AskAI.ask(ask, () => {}));
    call.done.then((end) => {
      if (s.call === call) {
        s.call = null;
        s.text = end.ok ? Chat.line(end.text) : "";
        chat.mem.suggest = s.text;
        Memory.save(chat.mem);
        Chat.change(chat);
      }
    });
  }

  // a suggested reply as shown: its first line, out of any quotes round
  // it; none if it says nothing (or is NONE), or runs past WORDS words
  export function line(text: string): string {
    const line = text.trim().split("\n")[0].trim().replace(/^["“'‘](.*)["”'’]$/, "$1").trim();
    return NONE.test(line) || line.split(/\s+/).length > WORDS ? "" : line;
  }

  // the suggested reply goes, saved so, and the one being asked (a turn
  // begins)
  export function unsuggest(chat: Chat): void {
    chat.suggest.call?.stop();
    chat.suggest.call = null;
    chat.suggest.text = "";
    if (chat.mem.suggest !== "") {
      chat.mem.suggest = "";
      Memory.save(chat.mem);
    }
  }

  // a message sent while a suggested reply shows: it used it (it starts
  // with it), so the count of those unused starts anew; else one more
  export function used(chat: Chat, text: string): void {
    const s = chat.suggest;
    if (s.text !== "") {
      s.unused = text.trim().startsWith(s.text) ? 0 : s.unused + 1;
    }
  }

  // the chat outgrew the model's window (a call ended `full`): the
  // request itself too long (shrink: a vendor's refusal, or past its room
  // at its first step: the chat's text is more tokens than its bytes
  // told), a turn's share made FIT smaller; either way a note says so,
  // and the turn goes on from it, the chat as it now is, more of it as
  // summary lines (Chat.from moves on). Past REFITS in a row, the turn
  // ends, saying why. false: the turn ends
  export function refit(chat: Chat, shrink: boolean): boolean {
    chat.refits += 1;
    if (chat.refits > REFITS) {
      chat.refits = 0;
      Chat.note(chat, NO_FIT.replace("#", chat.model));
      return false;
    }
    chat.fit *= shrink ? FIT : 1;
    Chat.hold(chat, () => Chat.take(chat, Chat.push(chat, null, "note", REFIT.replace("#", chat.model))));
    return true;
  }

  // a failed turn's why, as a note: a reply cut off, or none; asking to
  // try again only if a later try may answer (all but the vendor's
  // refusal, whose why says what to do)
  export function failed(chat: Chat, why: string, end?: End): void {
    const again = end?.stop !== "down" || end.again === true;
    Chat.note(chat, (end?.cut ? "Reply cut off: " : "No reply: ") + why.replace(/\.$/, "") + "." + (again ? " Send a message to try again." : ""));
  }

  // a summary's try failed (Memory's stuck): why, as a note; how to stop
  // a turn waiting on it
  export function stuck(chat: Chat, why: string): void {
    const turn = Chat.waits(chat) === SUMMARIES ? " (Esc stops this turn)" : "";
    Chat.note(chat, "Summaries are stuck: " + why.replace(/\.$/, "") + "; retrying every minute" + turn + ".");
  }

  // a note in the chat, why work ended as it did
  export function note(chat: Chat, text: string): void {
    Chat.hold(chat, () => Chat.push(chat, null, "note", text));
  }

  // to the chat (in pages), or an agent's log; each told to every view. A
  // main agent switch not noted yet is noted first, an entry of its own
  // just before the message (the turn gets it among the recent ones)
  export function push(chat: Chat, agent: Agent | null, kind: Kind, text: string, images: string[] = []): Msg {
    if (agent !== null) {
      const id = Memory.agent_push(chat.mem, agent.name, kind, text);
      Chat.all(chat, { $: "entry", agent: agent.name, id, kind, text });
      return { id, end: id + 1 };
    }
    const note = chat.switched ? [{ kind: "note" as Kind, text: Chat.switch_note(chat) }] : [];
    if (note.length > 0) {
      [chat.switched, chat.was] = [false, null];
    }
    const roots = Memory.push(chat.mem, [...note, { kind, text, images }]);
    for (const { i, kind, text, date, images } of roots) {
      Chat.all(chat, { $: "entry", id: i, kind, text, date, images });
    }
    return { id: roots[note.length].i, end: chat.mem.count };
  }

  // a message the call took was logged as it came
  export function on(chat: Chat, agent: Agent | null, ev: Event): void {
    const at = agent ?? chat;
    const name = agent?.name;
    if (agent === null) {
      Chat.asks(chat, ev);
    }
    if (ev.$ === "Delta") {
      live_push(at.live, ev.kind, ev.text, ev.fresh);
      Chat.all(chat, { $: "delta", agent: name, kind: ev.kind, text: ev.text, fresh: ev.fresh });
      return;
    }
    if (ev.kind === "tool" && ev.of !== undefined) {
      at.calls[ev.of] = ev.text;
    } else if (ev.kind === "mind") {
      Chat.all(chat, { $: "entry", agent: name, kind: ev.kind, text: ev.text });
    } else if (ev.kind !== "user") {
      const call = ev.of === undefined ? undefined : at.calls[ev.of];
      delete at.calls[ev.of ?? ""];
      Chat.hold(chat, () => {
        if (call !== undefined) {
          Chat.push(chat, agent, "tool", call);
        }
        Chat.push(chat, agent, ev.kind, ev.text);
      });
    }
    Chat.live(chat, agent, Chat.waiting(at));
  }

  // what streams once an entry came: the tool calls awaiting their
  // results, as they will be logged; what was drawn never vanishes
  // before it is logged
  export function waiting(at: { calls: Record<string, string> }): Live[] {
    return Object.values(at.calls).map((text) => ({ kind: "tool", text }));
  }

  // a call's tool calls left without a result (it was stopped), logged
  // as they are, once it ends
  export function unanswered(chat: Chat, agent: Agent | null): void {
    const at = agent ?? chat;
    const calls = Object.values(at.calls);
    at.calls = {};
    Chat.hold(chat, () => calls.forEach((call) => Chat.push(chat, agent, "tool", call)));
    Chat.live(chat, agent, []);
  }

  // the model is asked again once handed all it waits for, until its
  // answer starts
  export function asks(chat: Chat, ev: Event): void {
    const kind = ev.$ === "Entry" ? ev.kind : "";
    const step = kind === "tool" ? 1 : kind === "echo" ? -1 : 0;
    chat.open = ev.$ === "Delta" ? 0 : Math.max(0, chat.open + step);
    const asked = (kind === "echo" || kind === "user") && chat.open === 0;
    if (asked !== chat.asked) {
      chat.asked = asked;
      Chat.change(chat);
    }
  }

  // what streams for the chat (agent: null) or an agent, set and told
  export function live(chat: Chat, agent: Agent | null, live: Live[]): void {
    (agent ?? chat).live = live;
    Chat.all(chat, { $: "live", agent: agent?.name, live });
  }

  // an agent's report, once it ends: a turn of its own, unless stopped
  // (or cut by the vendor busy or out of reach: Tools.run)
  export function report(chat: Chat, agent: Agent, text: string, stopped: boolean): void {
    Chat.unanswered(chat, agent);
    Chat.live(chat, agent, []);
    Chat.hold(chat, () => {
      const msg = Chat.push(chat, null, "work", text);
      if (!stopped) {
        Chat.take(chat, msg);
      }
      Chat.change(chat);
    });
  }

  // config.AFTER, a shell command, after each turn
  export function after(chat: Chat): void {
    if (!config.AFTER) {
      return;
    }
    chat.after = chat.after.then(async () => {
      const proc = Bun.spawn(["/bin/sh", "-c", config.AFTER], { cwd: chat.tools.cwd, stdout: "ignore", stderr: "pipe" });
      const err = await new Response(proc.stderr).text();
      if ((await proc.exited) !== 0) {
        Chat.all(chat, { $: "note", text: "after: " + err.trim() });
      }
    }).catch((err) => Chat.all(chat, { $: "note", text: "after: " + (err?.message ?? err) }));
  }

  // the work a quit cut goes on, told so: each agent, and illi's turn by a
  // note
  export async function resume(chat: Chat, work: string[]): Promise<void> {
    if (work.length === 0) {
      return;
    }
    const text = "illi restarted, cutting " + work.join(", ") + "; nothing was lost: go on.";
    const msg = Chat.push(chat, null, "note", text);
    await Promise.all(work.map((w) => (w === TURN ? Chat.take(chat, msg) : Tools.tell(chat.tools, w, text))));
  }

  // what runs: illi's turn, the agents at work
  export function running(chat: Chat): string[] {
    return [...(chat.busy ? [TURN] : []), ...Tools.working(chat.tools).map((a) => a.name)];
  }

  // illi's turn only, with the spawns and tells it waits on (for the view:
  // Tools.view, on chat.halt); agents go on. why: the note the turn's end
  // logs (Chat.turn), so after the reply the stop cut; null: none
  export function interrupt(chat: Chat, why: string | null): void {
    chat.halt.abort(why);
    chat.call?.stop();
  }

  // all work, agents too; its why noted at the turn's end, or at once if
  // no turn is left to end
  export function stop(chat: Chat, why: string | null): void {
    const turn = chat.busy && !chat.halt.signal.aborted;
    Chat.interrupt(chat, turn ? why : null);
    Tools.stop(chat.tools, null);
    if (!turn && why !== null) {
      Chat.note(chat, why);
    }
  }

  // Views
  // -----
  // A pipe message carries at most one log entry or summary.

  // a view's way to the chat: its acts reach the chat, the chat's
  // messages reach it, each in order, a step of the event loop later;
  // acts with a body come as posts
  export function link(chat: Chat, hear: Link["hear"]): Link {
    return { open: () => Chat.pipe(chat), post: (msg, body) => Chat.posted(chat, msg, body), hear };
  }

  // the view's end and the chat's (a Sock), joined, till the view's ends
  export function pipe(chat: Chat): Pipe {
    let shut = false;
    const sock: Sock = { data: { seen: new Set() }, send: (text) => queueMicrotask(() => shut || view.onmessage?.({ data: text })) };
    const view: Pipe = {
      onmessage : null,
      send      : (data) => queueMicrotask(() => shut || Chat.answer(chat, sock, data)),
      close     : () => {
        shut = true;
        Chat.leave(chat, sock);
      },
    };
    queueMicrotask(() => Chat.join(chat, sock));
    return view;
  }

  // an act with a body, posted (View.ts upload)
  export async function posted(chat: Chat, msg: object, body: Blob): Promise<Answer> {
    return Chat.apply(chat, { ...msg, body: Buffer.from(await body.arrayBuffer()) }).catch(Chat.fail);
  }

  export function all(chat: Chat, msg: Out): void {
    chat.socks.forEach((sock) => Chat.send(sock, msg));
  }

  export function send(sock: Sock, msg: object): void {
    sock.send(JSON.stringify(msg));
  }

  export function state(chat: Chat): Out {
    const agents = Tools.working(chat.tools).map((a) => a.name);
    const tools  = Tools.state(chat.tools, chat.pick.vendor);
    const fill   = { used: Math.round(Memory.fill(chat.mem) / 4), cap: Chat.cap(chat), window: Pick.window(chat.pick) ?? config.GUESS };
    const asks   = chat.asks.map(({ done, ...q }) => q);
    return { $: "state", busy: chat.busy, wait: Chat.waits(chat), agents, pick: chat.pick, agent: chat.mem.agent, ...config.OFFER, ...tools, use: { ...tools.use, fill }, suggest: chat.suggest.on ? chat.suggest.text : "", asks };
  }

  // a question for the user (Claude Code asking leave to use a tool,
  // illi's own), shown by the views till one answers, or its request
  // drops (a stop: no); with no view to ask, no at once
  export function question(chat: Chat, q: Omit<Question, "id">, signal: AbortSignal): Promise<Reply> {
    if (chat.socks.size === 0 || signal.aborted) {
      return Promise.resolve({ yes: false, always: false, said: q.queries === undefined ? NO_ONE : NO_ANSWER });
    }
    return new Promise((done) => {
      const id = crypto.randomUUID();
      chat.asks.push({ ...q, id, done });
      signal.addEventListener("abort", () => Chat.answered(chat, id, false, false, STOPPED), { once: true });
      Chat.change(chat);
    });
  }

  // a question answered (none: one answered already); said: what the
  // user said, for the model (a no's reason, the answer to illi's own)
  export function answered(chat: Chat, id: string, yes: boolean, always: boolean, said: string): void {
    const k = chat.asks.findIndex((q) => q.id === id);
    if (k < 0) {
      return;
    }
    const [q] = chat.asks.splice(k, 1);
    q.done({ yes, always, said: yes && q.queries === undefined ? "" : said });
    Chat.change(chat);
  }

  export function waits(chat: Chat): Wait {
    if (chat.call !== null) {
      return chat.asked ? chat.model : "";
    }
    const summing = chat.busy && chat.wait.length > 0 && Memory.first(chat.mem) < Chat.from(chat);
    return summing ? SUMMARIES : "";
  }

  // what runs changed: saved (a quit's next start resumes it; a save
  // that fails told to the views, never logged), and told
  export function change(chat: Chat): void {
    const work = Chat.running(chat);
    if (String(work) !== String(chat.mem.work)) {
      chat.mem.work = work;
      try {
        Memory.save(chat.mem);
      } catch (err: any) {
        console.error("illi: saving the chat: " + err.message);
        Chat.all(chat, { $: "note", text: "Can't save the chat: " + Chat.unsaved(err) + " (" + chat.mem.dir + ")." });
      }
    }
    Chat.all(chat, Chat.state(chat));
  }

  // why a file won't write, in plain words (its own, or SQLite's)
  export function unsaved(err: any): string {
    const why: Record<string, string> = {
      ENOSPC: "disk full", EDQUOT: "disk quota used up", EACCES: "no permission", EPERM: "no permission", EROFS: "read-only disk",
      SQLITE_FULL: "disk full", SQLITE_READONLY: "read-only disk", SQLITE_PERM: "no permission", SQLITE_CANTOPEN: "can't open the file", SQLITE_IOERR: "the disk failed to write",
      SQLITE_BUSY: "another illi kept the file busy too long", SQLITE_LOCKED: "another illi kept the file busy too long",
    };
    const code = String(err?.code ?? "");
    return why[code] ?? why[code.replace(/^(SQLITE_[A-Z]+)_.*$/, "$1")] ?? String(err?.message ?? err);
  }

  // a view joins on the chat as it is now
  export function join(chat: Chat, sock: Sock): void {
    chat.socks.add(sock);
    Chat.send(sock, Chat.state(chat));
    Chat.show(chat, sock);
    Chat.send(sock, { $: "live", live: chat.live });
  }

  export function leave(chat: Chat, sock: Sock): void {
    chat.socks.delete(sock);
  }

  // a view's message answered (ack): a read at once, else as Chat.apply
  // does it; one that fails is answered its error
  export async function answer(chat: Chat, sock: Sock, data: string): Promise<void> {
    let msg: any = null;
    const out = await Promise.try(() => {
      msg = JSON.parse(data);
      return Chat.ask(chat, sock, msg) ?? Chat.apply(chat, msg);
    }).catch(Chat.fail);
    Chat.send(sock, { $: "ack", id: msg?.id, ...out });
  }

  // what a message or act that threw answers
  export function fail(err: any): Answer {
    return { error: String(err?.message ?? err) };
  }

  // a read, answered by what it sends; null: no read
  export function ask(chat: Chat, sock: Sock, msg: any): Answer | null {
    switch (msg.$) {
      case "zoom": {
        const [id, n] = [...msg.part].map(Number);
        if (n > 1 && Memory.part(chat.mem, id, n) !== null) {
          const parts: Part[] = [[id, n / 2], [id + n / 2, n / 2]];
          Chat.teach(chat, sock, parts);
          Chat.send(sock, { $: "zoom", id, n, parts });
        }
        return {};
      }
      case "root": {
        const parts = Memory.roots(chat.mem.count).map(({ l, i }): Part => [i * 2 ** l, 2 ** l]);
        Chat.teach(chat, sock, parts);
        Chat.send(sock, { $: "root", parts });
        return {};
      }
      case "agent": {
        const name = String(msg.name);
        const log = Memory.agent(chat.mem, name);
        Chat.send(sock, { $: "agent", name, found: log !== null });
        log?.forEach(({ kind, text, date }) => Chat.send(sock, { $: "entry", agent: name, kind, text, date }));
        Chat.send(sock, { $: "live", agent: name, live: chat.tools.agents.get(name)?.live ?? [] });
        return {};
      }
    }
    return null;
  }

  // an act changes the chat, answered once what it logged is on disk
  export async function apply(chat: Chat, msg: any): Promise<Answer> {
    const out = await Chat.act(chat, msg);
    await Disk.synced();
    return out;
  }

  export async function act(chat: Chat, msg: any): Promise<Answer> {
    switch (msg.$) {
      case "say": {
        return Chat.say(chat, msg.sizes ?? [], msg.body);
      }
      case "stop": {
        const name = msg.name === undefined ? null : String(msg.name);
        const what = Chat.running(chat).filter((w) => name === null || w === name);
        const why = "Stopped by the user: " + what.join(", ") + ".";
        const turn = what.includes(TURN);
        if (what.length === 0) {
          return {};
        }
        if (turn) {
          Chat.interrupt(chat, why);
        }
        what.forEach((w) => Tools.stop(chat.tools, w));
        if (!turn) {
          Chat.note(chat, why);
        }
        return {};
      }
      case "goal": {
        const goal = msg.text === null ? null : String(msg.text);
        if (goal === chat.mem.goal) {
          return {};
        }
        chat.mem.goal = goal;
        Memory.save(chat.mem);
        if (goal === null) {
          Chat.note(chat, "Goal halted by the user.");
        }
        return {};
      }
      case "clear": {
        return Chat.clear(chat);
      }
      case "answer": {
        const said = typeof msg.said === "string" ? msg.said.trim() : "";
        const own  = chat.asks.find((q) => q.id === msg.ask)?.queries !== undefined;
        const yes  = msg.yes === true && (!own || said !== "");
        Chat.answered(chat, String(msg.ask), yes, msg.always === true, own ? (yes ? ANSWERED + said : SKIPPED) : said === "" ? SAID_NO : SAID_WHY + said);
        return {};
      }
      case "compact": {
        return Chat.compact(chat);
      }
      case "main": {
        return Chat.main(chat, msg.name == null ? null : String(msg.name));
      }
      case "pick": {
        const pick = Pick.read(msg.to, config.OFFER);
        if (pick === null) {
          return { error: "No pick " + JSON.stringify(msg.to) + "." };
        }
        chat.pick = chat.mem.pick = pick;
        Memory.save(chat.mem);
        Chat.change(chat);
        return {};
      }
    }
    return { error: "No act " + msg.$ + "." };
  }

  // a fresh session (/clear): the cut at the chat's end, so every message
  // so far folds into the view's lines (each a zoom away) and the next
  // turn sends none whole; noted for the agent (the note itself whole);
  // the screen starts anew from the note (the memory's `top`: what came
  // before is only the memory's, a zoom away for the agent); the views
  // told the context it now holds. Not while a turn runs
  export function clear(chat: Chat): Answer {
    const mem = chat.mem;
    if (chat.busy) {
      return { error: "illi is at work: /clear once it's done (Esc interrupts it)." };
    }
    if (mem.cut === mem.count) {
      return {};
    }
    mem.cut = mem.show = mem.top = mem.count;
    Memory.fit(mem);
    Memory.save(mem);
    Chat.note(chat, "New session, for a new topic. illi still remembers the chat before this note: it is in the summaries, and a zoom brings back any part of it.");
    chat.eye = Chat.eye(mem, mem.cut);
    chat.socks.forEach((sock) => Chat.show(chat, sock));
    Chat.change(chat);
    return {};
  }

  // the chat compacted (/compact): the cut moved on to Memory.kept, so
  // all but the last exchanges fold into the view's lines (each a zoom
  // away) and each turn sends less; the screen still shows them whole
  // (the memory's `show` stays). Noted for the agent; not while a turn
  // runs. A call holds Chat.cap tokens, 4 bytes each: the exchanges kept
  // get a quarter at most
  export function compact(chat: Chat): Answer {
    const mem = chat.mem;
    if (chat.busy) {
      return { error: "illi is at work: /compact once it's done (Esc interrupts it)." };
    }
    const from = Memory.kept(mem, Chat.cap(chat));
    if (from <= mem.cut) {
      return { error: "Nothing to summarize: illi gets only the latest messages whole already." };
    }
    const folded = from - mem.cut;
    mem.cut = from;
    Memory.fit(mem);
    Memory.save(mem);
    const n = (k: number, what: string) => k + " " + what + (k === 1 ? "" : "s");
    Chat.note(chat, "Summarized " + n(folded, "older message") + "; the latest " + n(mem.count - from, "message") + " still go whole. A zoom brings back any part of the summaries.");
    chat.eye = Chat.eye(mem, mem.show);
    chat.socks.forEach((sock) => Chat.show(chat, sock));
    Chat.change(chat);
    return {};
  }

  // the main agent: a primary agent of the user's, by name (Custom.ts), or
  // illi's own (null); on what it ran on when last left, if not its own,
  // else on its own (its file's model, or the configured pick). Noted in
  // the chat before the next message, so the agent knows who it was when,
  // and an agent only passed through (a Shift+Tab) is never noted
  export function main(chat: Chat, name: string | null): Answer {
    const cwd = chat.tools.cwd;
    const profile = Custom.agent(cwd, name);
    if (name !== null && profile === null) {
      return { error: "No agent " + name + ". " + Custom.primaries_said(cwd) };
    }
    if (profile?.mode === "subagent") {
      return { error: name + " is a subagent: only an agent spawns it. " + Custom.primaries_said(cwd) };
    }
    name = profile?.name ?? null;
    const pick = chat.picks.get(name ?? "") ?? Chat.own(profile);
    if (typeof pick === "string") {
      return { error: pick + "." };
    }
    const left = chat.mem.agent;
    const own  = Chat.own(Custom.agent(cwd, left));
    if (typeof own === "string" || Pick.label(own) !== Pick.label(chat.pick)) {
      chat.picks.set(left ?? "", chat.pick);
    } else {
      chat.picks.delete(left ?? "");
    }
    const was = chat.was ?? { agent: left, pick: Pick.label(chat.pick) };
    chat.mem.agent = name;
    chat.pick = chat.mem.pick = pick;
    Memory.save(chat.mem);
    chat.switched = was.agent !== name || was.pick !== Pick.label(pick);
    chat.was = chat.switched ? was : null;
    Chat.change(chat);
    return {};
  }

  // what an agent runs on by its file (null: illi's own, on the configured
  // pick); a string: why it can't
  export function own(profile: Profile | null): Pick | string {
    return profile === null ? config.PICK : Custom.pick(profile, config.PICK, config.OFFER);
  }

  // the note of the main agent now, as a switch to it
  export function switch_note(chat: Chat): string {
    const who = chat.mem.agent === null ? "illi's own" : chat.mem.agent;
    return "Main agent: " + who + ", on " + Pick.shown(chat.pick) + ".";
  }

  // what the screen shows: the view's lines before `from` (none of before
  // the last /clear's top), then each message from it whole
  export function eye(mem: Memory, from: number): Eye {
    const start = Math.max(from, mem.top);
    const parts = Memory.before(mem.view.parts, start).filter((part) => Memory.span(part)[1] >= mem.top).map((part): Part => [Memory.span(part)[0], 2 ** part.l]);
    return { parts, from: start };
  }

  // what the agent saw: the eye's parts, then each message after them
  export function show(chat: Chat, sock: Sock): void {
    const { parts: eye, from } = chat.eye;
    const raw = Array.from({ length: Math.max(0, chat.mem.count - from) }, (_, k): Part => [from + k, 1]);
    const parts = [...eye, ...raw];
    Chat.teach(chat, sock, parts);
    Chat.send(sock, { $: "view", parts, turn: from });
  }

  // a summary built (Memory's made): sent to each view shown its block
  // (Chat.teach)
  export function made(chat: Chat, l: number, i: number): void {
    const [a] = Memory.span({ l, i });
    for (const sock of chat.socks) {
      if (sock.data.seen.has(a + "+" + 2 ** l)) {
        Chat.know(chat, sock, a, 2 ** l);
      }
    }
  }

  // what a view lacks of parts, before the parts themselves: each
  // message or summary a message of its own; a summary not built yet,
  // once built (Chat.made)
  export function teach(chat: Chat, sock: Sock, parts: Part[]): void {
    for (const [id, n] of parts.filter(([id, n]) => !sock.data.seen.has(id + "+" + n))) {
      sock.data.seen.add(id + "+" + n);
      if (n === 1) {
        const m = Memory.message(chat.mem, id)!;
        Chat.send(sock, { $: "know", whole: { [id]: { kind: m.kind, text: m.text, date: m.date, images: m.images } } });
      }
      Chat.know(chat, sock, id, n);
    }
  }

  // a summary, if built, to a view shown its block
  export function know(chat: Chat, sock: Sock, id: number, n: number): void {
    const text = Memory.node(chat.mem, { l: Math.log2(n), i: id / n });
    if (text !== null) {
      Chat.send(sock, { $: "know", nodes: { [id + "+" + n]: { text, to: Memory.message(chat.mem, id + n - 1)!.date } } });
    }
  }

}
