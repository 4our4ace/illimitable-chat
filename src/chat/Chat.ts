// Chat
// ====
// The agent: one chat that never ends (Memory.ts), at config.DIR/chat, run
// in this process, and its views (View.ts), each fed by an in-process pipe
// shaped as the socket a remote view would use (Chat.link): the chat's
// events one way, the person's acts the other, each act done once
// (Chat.apply). One process at a time holds the chat (Chat.lock).
//
// One turn at a time. A message is logged as it arrives; the running call
// takes it between tool calls if it goes whole beside its view, else the
// next call does, on the chat's pick (Pick.ts), as its main agent (a
// primary agent of the user's, Custom.ts: Shift+Tab, /agent; none: Illi's own). A quit cuts what runs;
// the next start resumes it (Chat.resume), told so.

import * as fs from "node:fs";
import * as net from "node:net";
import { AskAI, type Call, type Event, type Kind } from "../ai/AskAI.ts";
import { Custom, type Profile } from "../config/Custom.ts";
import { Disk } from "./Disk.ts";
import { Memory, type Share } from "./Memory.ts";
import { Pick } from "../ai/Pick.ts";
import { MASTER, SEARCHES, Tools, type Agent, type Live } from "../tools/Tools.ts";
import { agent_name } from "../ui/Theme.ts";
import { IMAGES, live_push, PING, SUMMARIES, TICK, TURN, type Answer, type Link, type Part, type Server as Out, type Wait } from "../ui/View.ts";
import * as config from "../config/Config.ts";

// Types
// =====

// a view's end of its pipe: the parts it was shown (Chat.teach)
type Sock = { data: { seen: Set<string> }; send: (text: string) => void; close: (code?: number) => void };

// a message logged: its pages [id, end)
type Msg = { id: number; end: number };

// what the agent saw at its last call: the view before message `from`,
// then every message from it on
type Eye = { parts: Part[]; from: number };

// a goal check (Chat.check): its call, the goal it asks of
type Check = { call: Call; goal: string };

// a chat: posts: acts being taken, its start till what it resumed runs,
// and the command after a turn; model: what the turn's call runs on, as
// picked when it began (a /model since picks the next call's); asked: a
// request out, nothing back; open: tool calls without results; check: the
// turn's goal check running (Chat.check); sent, wait: messages given and
// waiting; ending: what to do once at rest (all: nothing runs); writes,
// held: the posts logging, one after another, and the logging held
// meanwhile (null: none); switched: a main agent switch not noted in the
// chat yet, was: the agent and pick noted before it; picks: what each
// main agent ran on when left, if not its own (by name, "": Illi's)
export type Chat = {
  mem   : Memory;
  tools : Tools;
  pick  : Pick;
  socks : Set<Sock>;
  busy  : boolean;
  posts : number;
  call  : Call | null;
  model : string;
  check : Check | null;
  asked : boolean;
  open  : number;
  sent  : Msg[];
  wait  : Msg[];
  halt  : AbortController;
  live  : Live[];
  calls : Record<string, string>; // its tool calls awaiting their results, by id (Chat.on)
  eye   : Eye;
  after : Promise<void>;
  ending: { all: boolean; then: () => void } | null;
  writes: Promise<unknown>;
  held  : Array<() => void> | null;
  switched: boolean;
  was   : { agent: string | null; pick: string } | null;
  picks : Map<string, Pick>;
};

// Constants
// =========

const LOCK       = config.DIR + "/lock";
// a turn's head, as a summary's is "Compaction:": one prompt serves both
const HEAD       = "Turn: the user's new message:\n\n";
// a goal's check (Chat.check): its own system prompt (Illi's, which says
// a call is a turn or a compaction, made the model summarize the chat
// instead of answering), asked after the chat (the view, its latest
// messages whole) of its goal; unmet, the user's nudge
const GOAL       = "You check a goal. Below is a chat between a user and Illi, an AI agent: its older messages as summary lines (id+n|text), then its latest messages whole, then the goal the user set with /goal. Answer yes if the chat shows the goal fully satisfied now, else no. Write that one word, nothing else.";
const GOAL_ASK   = "\nThe goal:\n\n";
const GOAL_NO    = "The goal isn't satisfied yet: keep working.";

// a new chat's first message, its node written with it, so no compactor
// call summarizes it
const HELLO      = "Hi, I'm Illi, short for Illimitable: one chat that never ends, kept in a memory tree, recent days in more detail. I work in the folder you start illi in. Ask me anything, for days, weeks, years; /help lists the commands.";
const HELLO_LINE = "illi: hello: Illi (Illimitable), one endless chat in a memory tree; works in the folder illi starts in; /help for commands.";

// Globals
// =======

// the lock's socket, while this process holds the chat (Chat.lock)
let held: { stop: (closeActive?: boolean) => void } | null = null;

// Chat
// ====

export namespace Chat {

  // holds the chat for this process: a unix socket one listens on at a
  // time; one a crash left refuses connections and is taken; one held
  // means illi runs elsewhere
  export async function lock(): Promise<void> {
    fs.mkdirSync(config.DIR, { recursive: true });
    while (true) {
      try {
        held = Bun.listen({ unix: LOCK, socket: { data() {} } });
        return;
      } catch (err: any) {
        if (err.code !== "EADDRINUSE") {
          throw err;
        }
      }
      const live = await new Promise<boolean>((done) => {
        const sock = net.connect(LOCK);
        sock.on("connect", () => {
          sock.destroy();
          done(true);
        });
        sock.on("error", () => done(false));
      });
      if (live) {
        throw new Error("illi is already open in another terminal (" + config.DIR + ")");
      }
      fs.rmSync(LOCK, { force: true });
    }
  }

  // lets the chat go (a profile's switch): the socket closed and gone, so
  // the next illi to open this folder takes it at once
  export function unlock(): void {
    held?.stop(true);
    held = null;
    fs.rmSync(LOCK, { force: true });
  }

  // the chat, its tools working in cwd; what a quit cut goes on
  export function open(cwd: string): Chat {
    const dir = config.DIR + "/chat";
    fs.mkdirSync(dir, { recursive: true });
    const mem = Memory.load(dir, () => Chat.share(chat));
    const tools = Tools.serve(mem, {
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
      mem, tools, pick, socks: new Set(), busy: false, posts: 1, call: null, model: "", check: null, asked: false, open: 0, sent: [], wait: [],
      halt: new AbortController(), live: [], calls: {}, eye: { parts: [], from: 0 }, after: Promise.resolve(), ending: null,
      writes: Promise.resolve(), held: null, switched: false, was: null, picks: new Map(),
    };
    // a saved pick not offered gave way: told once
    const saved = mem.pick === null ? null : Pick.label(mem.pick as Pick);
    if (saved !== null && saved !== Pick.label(pick)) {
      mem.pick = pick;
      Memory.save(mem);
      Chat.note(chat, saved + " isn't offered here, so the chat now runs on " + Pick.label(pick) + ".");
    }
    if (mem.count === 0) {
      Memory.push(mem, [{ kind: "illi", text: HELLO, line: HELLO_LINE }]);
    }
    chat.eye = Chat.eye(mem, Math.min(mem.show, Chat.from(chat)));
    mem.made = (l, i) => Chat.made(chat, l, i);
    mem.wait.add(() => Chat.free(chat));
    const work = mem.work;
    Memory.pump(mem);
    Chat.resume(chat, work).finally(() => {
      chat.posts -= 1;
      Chat.change(chat);
    }).catch((err) => console.error("illi: resume: " + (err?.message ?? err)));
    return chat;
  }

  // what every call of the chat starts with, a summary's too: its system
  // prompt. A summary gets no tools: one it called, ours or the API's
  // own (web search brings code execution), sent its whole input again
  export function share(chat: Chat): Share {
    const system = Tools.system(MASTER);
    return { ...Pick.ask(chat.pick), system, searches: 0, server: "" };
  }

  // a turn's system prompt: Illi's, with its main agent's instructions
  export function system(chat: Chat): string {
    return Tools.system(MASTER + Custom.section(Custom.agent(chat.tools.cwd, chat.mem.agent)));
  }

  // at rest (nothing runs): one ending does what it waited for
  export function free(chat: Chat): void {
    const ending = chat.ending;
    if (ending !== null && chat.posts === 0 && (!ending.all || Chat.idle(chat))) {
      chat.ending = null;
      ending.then();
    }
  }

  // no turn, post, agent or summary runs
  export function idle(chat: Chat): boolean {
    return !chat.busy && chat.posts === 0 && Tools.working(chat.tools).length === 0 && chat.mem.busy.size === 0;
  }

  // stops all at once, as a quit does: what ran stays saved (mem.work), so
  // the next start resumes it
  export function close(chat: Chat): void {
    Chat.stop(chat, null);
    Memory.stop(chat.mem);
  }

  // a message (its body: its images, sizes given, then its text), logged
  // and taken
  export async function say(chat: Chat, id: string, sizes: number[], body: Buffer): Promise<Answer> {
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
    await Chat.writing(chat, async () => Chat.take(chat, Chat.push(chat, null, "user", text, images, false, id)));
    return {};
  }

  // a post's logging, after the chat's earlier ones, holding its other
  // logging (Chat.hold) till it ends, so a long post's pages stay together
  export function writing<T>(chat: Chat, write: () => Promise<T>): Promise<T> {
    const run = chat.writes.then(async () => {
      chat.held = [];
      try {
        return await write();
      } finally {
        const held = chat.held ?? [];
        chat.held = null;
        chat.mem.open = 0;
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

  // a message logged: to the running call if whole beside its view, else
  // to the next
  export function take(chat: Chat, msg: Msg): void {
    const mem = chat.mem;
    if (chat.call !== null && Memory.whole(mem, msg.id) === msg.id) {
      chat.sent.push(msg);
      chat.call.send(Memory.say(mem, msg.id, msg.end));
      return;
    }
    chat.wait.push(msg);
    if (!chat.busy) {
      Chat.turn(chat);
    }
  }

  export async function turn(chat: Chat): Promise<void> {
    chat.busy = true;
    try {
      let go = true;
      while (go && chat.wait.length > 0) {
        go = await Chat.call(chat);
      }
    } catch (err: any) {
      Chat.failed(chat, String(err?.message ?? err));
    } finally {
      const why: string | null = chat.halt.signal.aborted ? chat.halt.signal.reason : null;
      if (why !== null) {
        Chat.note(chat, why);
      }
      chat.call = null;
      chat.sent = [];
      chat.wait = [];
      chat.busy = false;
      Chat.live(chat, null, []);
      Chat.after(chat);
      Chat.change(chat);
    }
  }

  // where a call's messages go whole from (Memory.cutoff; a message
  // meanwhile may move it): as many of the chat's tokens as its model
  // takes (config_context), 4 bytes each
  export function from(chat: Chat): number {
    return Memory.cutoff(chat.mem, Chat.cap(chat) * 4);
  }

  // the tokens of the chat a turn sends on the chat's model
  export function cap(chat: Chat): number {
    return config.config_context(chat.pick.model, Pick.window(chat.pick));
  }

  // false: the turn ends
  export async function call(chat: Chat): Promise<boolean> {
    const mem = chat.mem;
    const halt = (chat.halt = new AbortController());
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
    const says = msgs.filter((m) => m.end > from).map((m) => Memory.say(mem, Math.max(m.id, from), m.end));
    const view = Memory.chat(mem, from, msgs[0].id);
    const text = says.map((say) => say.text).join("\n\n");
    const imgs = says.flatMap((say) => say.imgs);
    const server = Tools.at(chat.tools, "main");
    chat.eye = Chat.eye(mem, mem.show);
    chat.socks.forEach((sock) => Chat.show(chat, sock));
    const bill = mem.pay?.("chat", String(msgs[0].id));
    const blocks = [...view, Tools.here(chat.tools), Tools.at_work(chat.tools), { text: HEAD + text, mark: true }];
    const ask = { ...Chat.share(chat), system: Chat.system(chat), searches: SEARCHES, server, blocks, imgs, bill };
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
    if (!end.ok && !halt.signal.aborted) {
      Chat.failed(chat, end.text);
    }
    if (end.note) {
      Chat.all(chat, { $: "note", text: end.note });
    }
    const goal = chat.mem.goal;
    if (end.ok && !halt.signal.aborted && chat.wait.length === 0 && goal !== null) {
      return Chat.checked(chat, Chat.check(chat, goal), halt);
    }
    return !halt.signal.aborted;
  }

  // the user's goal (/goal), asked of the chat's model, without tools, on
  // the chat as it is now
  export function check(chat: Chat, goal: string): Check {
    const mem  = chat.mem;
    const at   = Memory.whole(mem, 0);
    const tail = Array.from({ length: mem.count - at }, (_, k) => at + k).map((i) => {
      const msg = Memory.message(mem, i)!;
      return Memory.line({ l: 0, i }, msg.kind + ": " + msg.text) + "\n";
    });
    const blocks = [...Memory.view(mem, at), { text: tail.join("") + GOAL_ASK + goal, mark: true }];
    return { call: AskAI.ask({ ...Chat.share(chat), system: GOAL, blocks, bill: mem.pay?.("chat", "goal") }, () => {}), goal };
  }

  // a goal check's answer, as the turn's call's is: unmet (any answer but
  // yes), the user's nudge goes to the turn as their message; met, the
  // goal ends. A check that fails, a stop, a message or a /halt meanwhile
  // end it with no nudge, so the turn ends; false: it ends
  export async function checked(chat: Chat, check: Check, halt: AbortController): Promise<boolean> {
    const { call, goal } = (chat.check = check);
    halt.signal.addEventListener("abort", () => call.stop(), { once: true });
    const end = await call.done;
    const mem = chat.mem;
    const on = !halt.signal.aborted && mem.goal === goal && chat.wait.length === 0;
    chat.check = null;
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

  // a failed turn's why, as a note
  export function failed(chat: Chat, why: string): void {
    Chat.note(chat, "No reply: " + why.replace(/\.$/, "") + ". Send a message to try again.");
  }

  // a note in the chat, why work ended as it did
  export function note(chat: Chat, text: string): void {
    Chat.hold(chat, () => Chat.push(chat, null, "note", text));
  }

  // to the chat (in pages), or an agent's log; each told to every view. A
  // main agent switch not noted yet is noted first, so the message after
  // it carries it to the agent
  export function push(chat: Chat, agent: Agent | null, kind: Kind, text: string, images: string[] = [], more = false, act?: string): Msg {
    if (agent !== null) {
      const id = Memory.agent_push(chat.mem, agent.name, kind, text);
      Chat.all(chat, { $: "entry", agent: agent.name, id, kind, text });
      return { id, end: id + 1 };
    }
    const note = chat.switched && chat.mem.open === 0 ? [{ kind: "note" as Kind, text: Chat.switch_note(chat) }] : [];
    if (note.length > 0) {
      [chat.switched, chat.was] = [false, null];
    }
    const roots = Memory.push(chat.mem, [...note, { kind, text, images, more, act }]);
    for (const { i, kind, text, date, images } of roots) {
      Chat.all(chat, { $: "entry", id: i, kind, text, date, images });
    }
    return { id: roots[0].i, end: chat.mem.count };
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

  // an agent's report, once it ends: a turn of its own, unless stopped.
  // It is taken as a post is, so the chat never rests between logging it
  // and its turn
  export function report(chat: Chat, agent: Agent, text: string, stopped: boolean): void {
    Chat.unanswered(chat, agent);
    Chat.live(chat, agent, []);
    Chat.hold(chat, () => {
      chat.posts += 1;
      const msg = Chat.push(chat, null, "work", text);
      if (!stopped) {
        Chat.take(chat, msg);
      }
      chat.posts -= 1;
      Chat.change(chat);
    });
  }

  // config.AFTER, a shell command, after each turn
  export function after(chat: Chat): void {
    if (!config.AFTER) {
      return;
    }
    chat.posts += 1;
    chat.after = chat.after.then(async () => {
      const proc = Bun.spawn(["/bin/sh", "-c", config.AFTER], { cwd: chat.tools.cwd, stdout: "ignore", stderr: "pipe" });
      const err = await new Response(proc.stderr).text();
      if ((await proc.exited) !== 0) {
        Chat.all(chat, { $: "note", text: "after: " + err.trim() });
      }
    }).catch((err) => Chat.all(chat, { $: "note", text: "after: " + (err?.message ?? err) })).finally(() => {
      chat.posts -= 1;
      Chat.free(chat);
    });
  }

  // the work a quit cut goes on, told so: each agent, and Illi's turn by a
  // note
  export async function resume(chat: Chat, work: string[]): Promise<void> {
    if (work.length === 0) {
      return;
    }
    const text = "illi restarted, cutting " + work.join(", ") + "; nothing was lost: go on.";
    const msg = Chat.push(chat, null, "note", text);
    await Promise.all(work.map((w) => (w === TURN ? Chat.take(chat, msg) : Tools.tell(chat.tools, w, text))));
  }

  // what runs: Illi's turn, the agents at work
  export function running(chat: Chat): string[] {
    return [...(chat.busy ? [TURN] : []), ...Tools.working(chat.tools).map((a) => a.name)];
  }

  // Illi's turn only, with the spawns and tells it waits on (for the view:
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
  // A pipe message carries at most one log entry or summary, as a socket
  // message would.

  // a view in this process, by the Link a remote one would use: its acts
  // reach the chat, the chat's messages reach it, each in order, a step
  // of the event loop later (as a socket's would); acts with a body come
  // as posts
  export function link(chat: Chat, hear: Link["hear"], lost: Link["lost"]): Link {
    return {
      open : () => Chat.pipe(chat),
      post : async (path, body) => Response.json(await Chat.posted(chat, path, body)),
      hear,
      lost,
    };
  }

  // the view's end, as a WebSocket, and the chat's (a Sock), joined; ticks
  // as a server's socket does, so the view never thinks it lost
  export function pipe(chat: Chat): WebSocket {
    const view: any = { onmessage: null, onclose: null };
    const tick = setInterval(() => view.onmessage?.({ data: TICK }), PING / 2);
    tick.unref();
    let shut = false;
    const end = () => {
      shut = true;
      clearInterval(tick);
      Chat.leave(chat, sock);
    };
    const sock: Sock = {
      data  : { seen: new Set() },
      send  : (text) => queueMicrotask(() => shut || view.onmessage?.({ data: text })),
      close : (code) => queueMicrotask(() => {
        if (!shut) {
          end();
          view.onclose?.({ code });
        }
      }),
    };
    view.send = (data: string) => queueMicrotask(() => shut || Chat.answer(chat, sock, data));
    view.close = () => shut || end();
    queueMicrotask(() => Chat.join(chat, sock));
    return view;
  }

  // an act with a body, posted (View.ts upload): its fields in the query
  export async function posted(chat: Chat, path: string, body: Blob): Promise<Answer> {
    const msg = Object.fromEntries(new URL(path, "http://illi").searchParams);
    const bytes = Buffer.from(await body.arrayBuffer());
    return Chat.apply(chat, { ...msg, body: bytes }).catch(Chat.fail);
  }

  export function all(chat: Chat, msg: Out): void {
    chat.socks.forEach((sock) => Chat.send(sock, msg));
  }

  export function send(sock: Sock, msg: object): void {
    sock.send(JSON.stringify(msg));
  }

  export function state(chat: Chat): Out {
    const agents = Tools.working(chat.tools).map((a) => a.name);
    const tools  = Tools.state(chat.tools);
    const fill   = { used: Math.round(Memory.fill(chat.mem) / 4), cap: Chat.cap(chat), window: Pick.window(chat.pick) ?? config.GUESS };
    return { $: "state", busy: chat.busy, wait: Chat.waits(chat), agents, pick: chat.pick, agent: chat.mem.agent, ...config.OFFER, ...tools, use: { ...tools.use, fill } };
  }

  export function waits(chat: Chat): Wait {
    if (chat.call !== null) {
      return chat.asked ? chat.model : "";
    }
    const summing = chat.busy && chat.wait.length > 0 && Memory.first(chat.mem) < Chat.from(chat);
    return summing ? SUMMARIES : "";
  }

  // what runs changed: saved (a quit's next start resumes it), and told
  export function change(chat: Chat): void {
    const work = Chat.running(chat);
    if (String(work) !== String(chat.mem.work)) {
      chat.mem.work = work;
      Memory.save(chat.mem);
    }
    Chat.all(chat, Chat.state(chat));
    Chat.free(chat);
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
    Chat.free(chat);
  }

  // a view's message answered (ack): a read at once, else as Chat.apply
  // does it; one that fails is answered its error
  export async function answer(chat: Chat, sock: Sock, data: string): Promise<void> {
    chat.posts += 1;
    let msg: any = null;
    const out = await Promise.try(() => {
      msg = JSON.parse(data);
      return Chat.ask(chat, sock, msg) ?? Chat.apply(chat, msg);
    }).catch(Chat.fail);
    chat.posts -= 1;
    Chat.send(sock, { $: "ack", id: msg?.id, ...out });
    Chat.free(chat);
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
    const out = await Chat.act(chat, String(msg.id), msg);
    await Disk.synced();
    return out;
  }

  export async function act(chat: Chat, id: string, msg: any): Promise<Answer> {
    switch (msg.$) {
      case "say": {
        return Chat.say(chat, id, String(msg.sizes ?? "").split(",").filter(Boolean).map(Number), msg.body);
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
  // before is only the memory's, a zoom away for the agent). Not while a
  // turn runs
  export function clear(chat: Chat): Answer {
    const mem = chat.mem;
    if (chat.busy) {
      return { error: "Illi is at work: /clear once it's done (Esc stops it)" };
    }
    if (mem.cut === mem.count) {
      return {};
    }
    mem.cut = mem.show = mem.top = mem.count;
    Memory.fit(mem);
    Memory.save(mem);
    Chat.note(chat, "New session: the user cleared the chat for a new topic. Everything before this note is in the view's lines; zoom into them when the user refers to it.");
    chat.eye = Chat.eye(mem, mem.cut);
    chat.socks.forEach((sock) => Chat.show(chat, sock));
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
      return { error: "Illi is at work: /compact once it's done (Esc stops it)" };
    }
    const from = Memory.kept(mem, Chat.cap(chat));
    if (from <= mem.cut) {
      return { error: "Nothing to compact: Illi gets only the latest messages whole already." };
    }
    const folded = from - mem.cut;
    mem.cut = from;
    Memory.fit(mem);
    Memory.save(mem);
    const n = (k: number, what: string) => k + " " + what + (k === 1 ? "" : "s");
    Chat.note(chat, "Compacted: the user folded " + n(folded, "older message") + " into the view's lines; the latest " + n(mem.count - from, "message") + " still go whole. Zoom into the lines when you need what they hold.");
    chat.eye = Chat.eye(mem, mem.show);
    chat.socks.forEach((sock) => Chat.show(chat, sock));
    Chat.change(chat);
    return {};
  }

  // the main agent: a primary agent of the user's, by name (Custom.ts), or
  // Illi's own (null); on what it ran on when last left, if not its own,
  // else on its own (its file's model, or the configured pick). Noted in
  // the chat before the next message, so the agent knows who it was when,
  // and an agent only passed through (a Shift+Tab) is never noted
  export function main(chat: Chat, name: string | null): Answer {
    const cwd = chat.tools.cwd;
    const profile = Custom.agent(cwd, name);
    const names = Custom.primaries(cwd).map((a) => a.name).join(", ") || "none yet";
    if (name !== null && profile === null) {
      return { error: "No agent " + name + ". Your primary agents: " + names + " (files in " + Custom.dirs(cwd, "agents").join(" and ") + ")." };
    }
    if (profile?.mode === "subagent") {
      return { error: name + " is a subagent: only an agent spawns it. Your primary agents: " + names + "." };
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

  // what an agent runs on by its file (null: Illi's own, on the configured
  // pick); a string: why it can't
  export function own(profile: Profile | null): Pick | string {
    return profile === null ? config.PICK : Custom.pick(profile, config.PICK, config.OFFER);
  }

  // the note of the main agent now, as a switch to it
  export function switch_note(chat: Chat): string {
    const who = chat.mem.agent === null ? "Illi's own" : agent_name(chat.mem.agent);
    return "Main agent: " + who + ", on " + Pick.label(chat.pick) + ".";
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
