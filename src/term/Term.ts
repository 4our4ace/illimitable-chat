// Term
// ====
// `illi`: the agent (Chat.ts), run in this process, and a terminal view
// of it, full screen (Screen.ts): a head (the folder, the page shown);
// the chat as its agent sees it (View.ts, laid out by Paint.ts), its end
// followed till it is scrolled up (the wheel, PgUp); beside it, on a wide
// screen, the side panel (Side.ts); under it the input and its bars. A
// paint (Frame.ts) lays the chat out anew (each row's lines made once)
// and writes only the rows that changed. A drag anywhere chooses text
// and copies it as it's let go (Select.ts). Every act is a command
// (Commands.ts, /help), a key's too (Keys.ts), and so is each of the
// user's commands (Custom.ts) and skills; images attach by a path, a
// drop or the clipboard (Attach.ts). The user's MCP servers start with
// it (Mcp.ts). The agent's tools work in the folder illi starts in; all
// they left running dies as illi quits. Started in a project whose chat
// runs in another terminal, illi is one more view of it (Remote.ts): no
// chat, agents or MCP servers of its own; as that illi quits, this one
// runs again and holds the chat. Each profile (Profiles.ts) is its
// own chat and settings; /profile switches by letting all go, as a quit
// does, and running illi again, in place, in the one chosen
// (ProfileCommands.ts). From a pipe, each line is a message, and each
// message the chat logs prints as text. As a turn ends, the reply the
// chat suggests shows in the empty input, dim (Chat.suggest; none from a
// pipe): Tab takes it, typing dismisses it (Keys.ts).
//
// This file: the terminal's state (Term), its link to the chat, and
// what every part shares (notes, toasts, quitting).

import * as fs from "node:fs";
import { term_paste } from "./Attach.ts";
import { Chat } from "../chat/Chat.ts";
import { ChatGPT } from "../ai/ChatGPT.ts";
import { term_models } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { Custom, type Profile } from "../config/Custom.ts";
import * as Draw from "../ui/Draw.ts";
import { term_draw, term_paint, term_print, term_resize } from "./Frame.ts";
import { term_enter, term_grab, term_press, term_type } from "./Keys.ts";
import { Machine } from "../tools/Machine.ts";
import { Mcp } from "../tools/Mcp.ts";
import { Memory } from "../chat/Memory.ts";
import { term_note, term_notify, term_unnotify, type Notice } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import { term_restart } from "./ProfileCommands.ts";
import * as Profiles from "../config/Profiles.ts";
import { Projects } from "../chat/Projects.ts";
import { Remote } from "../chat/Remote.ts";
import * as Reply from "../ui/Reply.ts";
import * as Screen from "../ui/Screen.ts";
import { CLOCK } from "./Side.ts";
import { Store } from "../chat/Store.ts";
import { THEME_TROUBLE } from "../ui/Theme.ts";
import * as View from "../ui/View.ts";

// the terminal: the chat, run here (null: another terminal's, this one a
// view of it: Remote.ts); mem: its memory, to read; ended: input's; pending: commands at work;
// due: a paint; settle: a new size's; imgs: the images attached, by
// their tokens' numbers (kept: a message sent again from the history
// names them still); quit: when Ctrl+C was last pressed on an empty
// input (ms), esc: Esc while illi's turn ran (ms); notices: the notes and the toast said for a while, expire:
// the clock that lets them go (Notices.ts); scroll: lines up from the
// chat's end (0: following it); seen: the chat as last painted; ver: a
// count of the changes to the chat's rows (a stream's aside), body: its
// lines as laid
// out at one; find: a block to scroll to; pane: a text over the chat
// (/help, /agents); agents: the user's primary agents, as last read; choose: the
// picker (null: closed); profs: the profiles, as last read; hits: what a
// click on the screen does;
// since: when the work running began, spin: the spinner's clock,
// ruled: the screen as last painted, for the clock to write the rule and
// the side's rows again alone (null: none yet): the rule's row and width,
// the cursor, the rows, the side (where, how wide, its rows; null: a box
// over it), the subagents' spinner then; doing: what ran then (null:
// nothing); subs:
// the subagents of this run, whether at work (false: done, till the
// person's next message); side: where the side panel shows and how wide
// (config.SIDE, SIDE_WIDTH); todo: whether illi's to-do list shows
// whole there (else folded); login: the device login waiting for
// the person (/login; null: none); areas: the parts of the screen as last
// painted, sel: the text chosen in one (null: none), hover: the button
// under the pointer as last painted, drift: a drag's scrolling past an
// area's edge; sug: the commands suggested as a /word is typed (null:
// closed); dropped: the suggested reply typing dismissed ("": none);
// lead: the leader pressed, the next key its shortcut's (the screen grey
// meanwhile: Frame.ts)
export type Term = {
  v       : View.View;
  scr     : Screen.Screen;
  chat    : Chat | null;
  mem     : () => Memory;
  ended   : boolean;
  pending : number;
  due     : boolean;
  settle  : Timer | undefined;
  imgs    : Map<number, Blob>;
  quit    : number;
  esc     : number;
  notices : Notice[];
  expire  : Timer | undefined;
  scroll  : number;
  seen    : Seen;
  ver     : number;
  body    : Body | null;
  find    : View.Part | null;
  pane    : Pane | null;
  agents  : Profile[];
  choose  : Chooser | null;
  profs   : string[];
  hits    : Hit[];
  since   : number;
  spin    : Timer | undefined;
  ruled   : { row: number; w: number; at: Screen.Spot | null; rows: Screen.Piece[][]; side: { at: number; w: number; sw: number; left: boolean; tall: number; with: number[] } | null; spin: string } | null;
  doing   : View.Doing | null;
  subs    : Map<string, boolean>;
  side    : { place: string; width: string };
  todo    : boolean;
  login   : AbortController | null;
  areas   : Area[];
  sel     : Sel | null;
  hover   : (() => string) | undefined;
  drift   : { d: number; timer: Timer } | undefined;
  sug     : Sug | null;
  dropped : string;
  lead    : boolean;
  asking  : { id: string; c: Chooser | null; done: boolean; form: Form | null } | null; // the question shown (Asks.ts): its picker or form, whether answered
};

// illi's own questions, in place of the input (Asks.ts): the tab shown
// (past the last question: the answers, to look over), and for each
// question the words typed beside its options, the row lit (past the
// options: the words'), the options picked
export type Form = { tab: number; each: Array<{ ed: Screen.Ed; at: number; picked: number[] }> };

// the chat as last painted: its lines, its blocks in them, the screen
// row of its first line shown and that line, the rows it had, its first
// column and the one past its right end
type Seen = { total: number; marks: Paint.Mark[]; row: number; first: number; tall: number; col: number; end: number };

// a part of the screen a drag chooses text in: which (chat, pane, side,
// head, foot), its lines, the first shown (at screen row `row`, column
// `col`), how wide and tall it shows; scroll: it moved a line up (d -1)
// or down (1), for a drag past its edge (none: it holds still)
export type Area = { key: string; lines: Paint.Line[]; first: number; row: number; col: number; w: number; tall: number; scroll?: (d: number) => void };

// a place in an area's lines: a line, a column
export type Cell = { line: number; col: number };

// text chosen: in which area, from where to where (either way round),
// whether the button is still down, whether it left its first cell; by
// what it grows as it's dragged (1: a character, 2: a word, 3: a line,
// as many times as it was pressed) and the first it took, first and last
export type Sel = { key: string; a: Cell; b: Cell; held: boolean; moved: boolean; unit: number; root: [Cell, Cell] };

export type Ink = Paint.Run["s"];

// the chat's rows laid out (from the last up, as far as shown: Frame.ts),
// at which change
type Body = Paint.Laid & { ver: number };

// a text over the chat: its title, its lines made for a width (made
// again at another), how far it is scrolled down
export type Pane = { title: string; make: (w: number) => Paint.Line[]; w: number; lines: Paint.Line[]; scroll: number };

// a place on the screen (a row, its columns from, to) and its click
type Hit = { row: number; col: number; to: number; run: () => void };

// the picker over the chat's foot (/agent, /profile, /model, /settings):
// its title, its options' names and what each is, the one marked as now
// (-1: none), what picking option k does; find: the search typed, an
// input as the chat's, its editing keys too (null: none, typing goes to
// the input), shown: the options it matches
// (Screen.ed_rank), best first, at: the one lit among them, top: the
// first in view; keys: what else the lit option k takes (true: taken; the
// model picker's effort and speed, a setting's steps), foot: what the
// box's foot says of it ("": nothing); ask: a line asked for instead of
// options (a profile's name, a file): typed in `find`, its hint shown
// while it is empty, given by Enter to `done`, whose answer null closes
// the box (what it opened stays) and a reason keeps it open, in the foot;
// hay: what a search looks in, an option's each (none: its name); used:
// how often an option was picked (a search ranks the more used first);
// aside: what shows at an option's right end, each (its keys, its value);
// middle: the box in the screen's middle, over all else, this many
// columns wide at most (none: over the chat's foot, Frame.ts); heads:
// each option's group, a head over its first while nothing is searched
export type Chooser = {
  title  : string;
  names  : string[];
  about  : string[];
  hay?   : string[];
  used?  : (k: number) => number;
  aside? : string[];
  middle?: number;
  heads? : string[];
  here   : number;
  pick   : (k: number) => void;
  find   : Screen.Ed | null;
  shown  : Screen.Match[];
  at     : number;
  top    : number;
  keys   : (k: number, key: string) => boolean;
  foot   : (k: number) => string;
  ask    : { hint: string; done: (text: string) => string | null } | null;
};

// a line drawn and what a click on it does (null: nothing)
export type Item = [Paint.Line, (() => void) | null];

// the commands suggested as a `/word` is typed, as in Claude Code: all
// of them (the user's too, read as the list opened: never at each key),
// the word they're matched to, those it matches (best first), the one
// lit, the first shown; how many fit as last shown (their descriptions
// wrapped, up to Frame.ts SUGGEST lines); the word Esc closed it at
// (null: none)
export type Sug = { cmds: Cmd[]; word: string; found: Screen.Match[]; at: number; top: number; tall: number; off: string | null };

// a line of /help: how it is typed ("": keys only), its keys, what it
// does; it runs on its argument, or by a key on "" (or the key's name)
export type Cmd = [use: string, keys: string, text: string, run: (t: Term, arg: string) => void | Promise<void>];

// where the agent's log lines go on a terminal
const LOG = config.DIR + "/illi.log";

// how long the start's notes hold (ms): till the first message or Esc
// lets them go, the login's till signing in too (term_unhint); hint: that
// one, while it shows
const HOLD = 24 * 3600 * 1000;
let hint: Notice | null = null;

// how long the note that the other terminal's illi quit shows before
// this one runs again in its place, ms; how many times in a row one not
// reached is tried again
const GONE   = 600;
const REJOIN = 20;

function term_new(chat: Chat | null, mem: () => Memory): Term {
  const t: Term = {
    v       : View.view_new(),
    scr     : Screen.screen_new((key) => term_press(t, key)),
    chat,
    mem,
    ended   : false,
    pending : 0,
    due     : false,
    settle  : undefined,
    imgs    : new Map(),
    quit    : 0,
    esc     : 0,
    notices : [],
    expire  : undefined,
    scroll  : 0,
    seen    : { total: 0, marks: [], row: 0, first: 0, tall: 1, col: 0, end: 0 },
    ver     : 0,
    body    : null,
    find    : null,
    pane    : null,
    agents  : [],
    choose  : null,
    profs   : Profiles.profile_list(config.ROOT),
    hits    : [],
    since   : 0,
    spin    : undefined,
    ruled   : null,
    doing   : null,
    subs    : new Map(),
    side    : { place: config.SIDE, width: config.SIDE_WIDTH },
    todo    : false,
    login   : null,
    areas   : [],
    sel     : null,
    hover   : undefined,
    drift   : undefined,
    sug     : null,
    dropped : "",
    lead    : false,
    asking  : null,
  };
  // the chat suggests replies to a screen that shows them, never a pipe
  if (chat !== null) {
    chat.suggest.on = t.scr.tty && config.SUGGEST;
  }
  term_primaries(t);
  Reply.reply_buttons(t.scr.tty);
  t.scr.grab  = (key) => term_grab(t, key);
  t.scr.type  = (text) => term_type(t, text);
  t.scr.paste = (text) => term_paste(t, text);
  process.stdin.on("end", () => {
    if (!t.scr.tty && t.scr.ed.text.trim() !== "") {
      term_enter(t);
    }
    t.ended = true;
    term_idle(t);
  });
  process.stdout.on("resize", () => term_resize(t));
  process.on("exit", () => {
    if (chat !== null) {
      Chat.close(chat);
    }
    Machine.end();
    Mcp.stop();
  });
  for (const sig of ["SIGHUP", "SIGTERM", "SIGINT"]) {
    process.on(sig, () => term_bye(t));
  }
  setInterval(() => term_draw(t), CLOCK).unref();
  return t;
}

// the user's agents read again: the primary ones kept (t.agents), each
// new one given its color (Draw.draw_agents)
export function term_primaries(t: Term): void {
  const all = Custom.agents(process.cwd());
  t.agents  = Custom.primaries(process.cwd(), all);
  Draw.draw_agents(all);
}

// connects to the chat, by View's link: in this process, or another
// terminal's (Remote.ts; it gone, term_gone)
function term_connect(t: Term): void {
  const hear = (msg: View.Server) => term_hear(t, msg);
  const file = Chat.socket(Projects.lock(Projects.place(process.cwd()).path));
  View.link_open(t.v, t.chat !== null ? Chat.link(t.chat, hear) : Remote.link(file, hear, (why, heard) => term_gone(t, why, heard)));
}

// the other terminal's illi gone: this one runs again in its place
// (term_restart) and holds the chat, or joins one that got there first;
// one not reached (its socket not up yet, as it starts) tried again,
// REJOIN times in a row at most. One that refused this view, or never
// spoke, said as this one quits
function term_gone(t: Term, why: string, heard: boolean): void {
  const tries = heard ? 0 : Number(process.env.ILLI_REJOIN ?? 0) + 1;
  if (why === "" && tries <= REJOIN) {
    process.env.ILLI_REJOIN = String(tries);
    if (heard) {
      term_note(t, "The other terminal's illi quit: this one takes the chat on.");
      term_draw(t);
    }
    setTimeout(() => void term_restart(t, config.PROFILE), GONE);
    return;
  }
  const name = Store.named(t.mem().store).name;
  process.on("exit", () => process.stderr.write("illi: " + name + " is open in another terminal, but " + (why || "it can't be reached") + ": quit illi there, then start it here again.\n"));
  process.exit(1);
}

// an act to the chat; a message refused goes back in the input
export function term_send(t: Term, msg: View.Client, sent?: View.Sent): void {
  View.link_send(t.v, msg, (a) => {
    if (a.error !== undefined) {
      term_note(t, a.error);
    }
    if (a.error !== undefined && sent !== undefined) {
      term_back(t, sent);
    }
    term_idle(t);
  });
}

// a message of the chat: to the view (all but a stream's piece changes
// its rows), then to the screen, or a pipe
function term_hear(t: Term, msg: View.Server): void {
  const first = msg.$ === "view" && t.v.parts.length === 0;
  const was   = t.v.page;
  const agent = t.v.agent;
  for (const out of View.view_hear(t.v, msg)) {
    term_send(t, out);
  }
  t.ver += msg.$ === "delta" || msg.$ === "live" ? 0 : 1;
  t.dropped = t.v.suggest === "" ? "" : t.dropped;
  term_went(t, was);
  term_subs(t);
  if (t.v.agent !== agent) {
    term_primaries(t);
  }
  if (!t.scr.tty && msg.$ === "entry" && msg.agent === undefined && msg.id !== undefined) {
    term_print(View.entry_rows(msg.id, msg.kind, msg.text, msg.images));
  }
  if (first) {
    term_history(t);
  }
  term_draw(t);
  if (msg.$ === "state") {
    term_idle(t);
  }
}

// an act of the person: to the view; the messages it sends the chat
export function term_act(t: Term, act: View.Act): View.Client[] {
  const was = t.v.page;
  const out = View.view_act(t.v, act);
  t.ver += 1;
  out.forEach((msg) => term_send(t, msg, act.$ === "Send" ? act : undefined));
  term_went(t, was);
  if (act.$ === "Send" && act.text.trim() !== "" && out.length > 0) {
    term_forget(t);
  }
  return out;
}

// the subagents at work kept as such, those gone from work as done
function term_subs(t: Term): void {
  for (const name of t.v.agents) {
    t.subs.set(name, true);
  }
  for (const [name, working] of t.subs) {
    if (working && !t.v.agents.includes(name)) {
      t.subs.set(name, false);
    }
  }
}

// a new message: the subagents done are let go (one used again comes back)
function term_forget(t: Term): void {
  for (const [name, working] of t.subs) {
    if (!working) {
      t.subs.delete(name);
    }
  }
}

// a message the chat refused, back in the input as typed (its tokens),
// unless another is in it; from a pipe, the end, failed
function term_back(t: Term, sent: View.Sent): void {
  if (!t.scr.tty) {
    process.exitCode = 1;
    term_quit(t);
    return;
  }
  if (t.scr.ed.text !== "") {
    return;
  }
  Screen.ed_type(t.scr.ed, t.scr.ed.hist.findLast((h) => Screen.ed_expand(t.scr.ed, h) === sent.text) ?? sent.text);
}

// the page shown was `was`: another shows from its end
function term_went(t: Term, was: View.Page | null): void {
  if (t.v.page !== was) {
    t.scroll = 0;
  }
}

// the input's history: the user's messages known
function term_history(t: Term): void {
  Screen.ed_history(t.scr.ed, [...t.v.whole].sort((a, b) => a[0] - b[0]).flatMap(([, e]) => (e.kind === "user" ? [e.text] : [])));
}

// input's end: quits once all it sent is answered and no work runs
export function term_idle(t: Term): void {
  if (t.ended && t.pending <= 0 && t.v.out.length === 0 && !View.view_running(t.v)) {
    term_quit(t);
  }
}

// quits, its work cut (the next start resumes it), once all painted is
// out (a write's callback comes after those before it), with exitCode
export function term_quit(t: Term): void {
  t.v.ws?.close();
  term_paint(t);
  process.stdout.write("", () => process.exit());
}

// quits at a signal (the terminal may be gone: nothing painted)
function term_bye(t: Term): void {
  t.v.ws?.close();
  process.exit(0);
}

// a crash (an error nothing caught): its stack to LOG, the terminal left
// as found (the screen's own exit handler, which runs first), then one
// line on why and where the details are; exit code 1
export function term_crash(err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  try {
    fs.appendFileSync(LOG, new Date().toISOString() + " illi: crashed: " + (e.stack ?? e.message) + "\n");
  } catch {}
  process.on("exit", () => process.stderr.write("illi: crashed: " + e.message + " (details in " + LOG + ")\n"));
  process.exit(1);
}

// what went wrong before the screen was up, or out of sight, said once
// it is: a theme file that won't read; the MCP servers' file that won't,
// and each server that fails to start (once a session; /mcp says more)
function term_trouble(t: Term, told: Set<string>): void {
  const { servers, trouble } = Mcp.status();
  const says: Array<[key: string, text: string]> = [
    ["theme", THEME_TROUBLE],
    ["mcp", trouble === "" ? "" : "The MCP servers' file won't read (" + trouble + "): /mcp says more."],
    ...servers.filter((s) => s.state === "failed").map((s): [string, string] => ["mcp " + s.name, "The MCP server " + s.name + " didn't start: " + s.why.replace(/\.$/, "") + " (/mcp says more)."]),
  ];
  for (const [key, text] of says.filter(([key, text]) => text !== "" && !told.has(key))) {
    told.add(key);
    term_note(t, text);
  }
}

// the chat of the working folder's project opened (its lock taken: one
// illi a project), on the terminal (its log lines to LOG; a crash said, the
// terminal left as found: term_crash) or a pipe; the MCP servers started
// (a failure told: term_trouble); the models ChatGPT lists learned
export async function term_start(): Promise<void> {
  process.on("uncaughtException", term_crash);
  process.on("unhandledRejection", term_crash);
  const holds = await Chat.lock(process.cwd(), Remote.serve).catch((err) => {
    console.error("illi: " + err.message);
    process.exit(1);
  });
  // on a terminal, what the agent logs goes to LOG, never over the screen
  if (process.stdout.isTTY) {
    const log = (...args: unknown[]) => fs.appendFileSync(LOG, new Date().toISOString() + " " + args.map(String).join(" ") + "\n");
    console.log = console.warn = console.error = log;
  }
  if (holds) {
    delete process.env.ILLI_REJOIN;
  }
  const chat = holds ? Chat.open(process.cwd()) : null;
  const t = term_new(chat, chat !== null ? () => chat.mem : term_reader());
  const told = new Set<string>();
  if (chat !== null) {
    Remote.share(chat);
    Mcp.start(process.cwd(), () => {
      term_trouble(t, told);
      term_draw(t);
    });
  }
  term_connect(t);
  term_trouble(t, told);
  term_hints(t);
  term_models(t);
}

// the start's notes, held (HOLD): a pick set that gave way (config.NOTES);
// on a terminal, the ChatGPT login unreadable or missing, and what the
// API keys need (config.config_tips)
function term_hints(t: Term): void {
  const signed = ChatGPT.signed();
  const chatgpt = config.OFFER.vendors.includes("chatgpt");
  const unread = chatgpt ? ChatGPT.unread() : "";
  config.NOTES.forEach((text) => term_note(t, text, HOLD));
  if (!t.scr.tty) {
    return;
  }
  if (unread !== "" || (chatgpt && !signed)) {
    hint = term_notify(t, unread !== "" ? unread : "No ChatGPT login yet: type /login to sign in with your ChatGPT plan.", false, HOLD);
  }
  if (t.chat !== null) {
    config.config_tips(t.chat.pick, signed).forEach((text) => term_note(t, text, HOLD));
  }
}

// the project's chat to read, in a view of another terminal's: as saved,
// read anew each time
function term_reader(): () => Memory {
  const dir   = config.DIR + "/chat";
  const store = Store.open(dir, Projects.place(process.cwd()));
  return () => Memory.read(dir, store, () => {
    throw new Error("a view's chat to read builds nothing");
  }, true);
}

// the start's login note let go (signed in)
export function term_unhint(t: Term): void {
  if (hint !== null) {
    term_unnotify(t, hint);
    hint = null;
  }
}
