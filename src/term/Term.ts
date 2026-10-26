// Term
// ====
// `illi`: the agent (Chat.ts), run in this process, and a terminal view
// of it, full screen (Screen.ts): a head (the folder, the page shown);
// the chat as its agent sees it (View.ts, laid out by Paint.ts), its end
// followed till it is scrolled up (the wheel, PgUp); beside it, on a wide
// screen, the side panel (Side.ts); under it the input and its bars. A
// paint (Frame.ts) lays the chat out anew (each row's lines made once)
// and writes only the rows that changed. A drag anywhere chooses text
// and copies it as it's let go (Select.ts); in the chat, a click opens,
// closes or folds what's under it, which lights as the pointer goes over
// it, and it stays under the pointer (Keys.ts, Select.ts); in a line
// typed in (the input, a question's, a list's search), a press puts the
// cursor where it lands. Every act is a command
// (Commands.ts, /help), a key's too (Keys.ts), and so is each of the
// user's commands (Custom.ts) and skills; images attach by a path, a
// drop or the clipboard (Attach.ts). The user's MCP servers start with
// it (Mcp.ts); on a terminal, so does the daily look for a new release
// of illi, installed in the background or only told of (Update.ts,
// `autoupdate`), its outcome a note. The agent's tools work in the
// folder illi starts in; all they left running dies as illi quits.
// Started in a project whose chat runs in another terminal, illi is one
// more view of it (Remote.ts): no chat, agents or MCP servers of its
// own; as that illi quits, this one runs again and holds the chat. The
// user's plugins (Plugins.ts) load as it starts, before the chat opens,
// so their hooks see all it does; a project's only in a folder trusted
// (Trusted.ts). On a terminal, illi runs under a window (Window.ts), one
// process that owns the terminal for every profile's illi under it; this
// one's end of it is Member.ts. Each profile (Profiles.ts) is its own
// chat and settings; /profile switches (ProfileCommands.ts): in a window,
// at once, this illi running on hidden till the window closes or illi
// quits; alone, by letting all go, as a quit does, and running illi
// again, in place, in the one chosen. From a pipe, each line is a
// message, and each message the chat logs prints as text. As a turn
// ends, the reply the chat suggests shows in the empty input, dim
// (Suggest.ask; none from a pipe): Tab takes it, typing dismisses it, a
// message of your own leaves it, to send as well, till illi answers
// (Keys.ts).
//
// This file: the terminal's state (Term), its link to the chat, and
// what every part shares (notes, toasts, quitting).

import * as fs from "node:fs";
import { term_paste } from "./Attach.ts";
import { Chat } from "../chat/Chat.ts";
import { Lock } from "../chat/Lock.ts";
import { ChatGPT } from "../ai/ChatGPT.ts";
import { term_account } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { Custom, type Profile } from "../config/Custom.ts";
import * as Draw from "../ui/Draw.ts";
import { term_draw, term_paint, term_print, term_resize } from "./Frame.ts";
import { term_enter, term_grab, term_press, term_type } from "./Keys.ts";
import { Machine } from "../tools/Machine.ts";
import { WIN, member_attach, member_hello, member_keep, member_quit, member_say, member_screen, member_state } from "./Member.ts";
import { Hooks } from "../config/Hooks.ts";
import { Mcp } from "../tools/Mcp.ts";
import { Memory } from "../chat/Memory.ts";
import { Plugins } from "../config/Plugins.ts";
import { term_note, term_notify, term_toast, term_unnotify, type Notice } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import { term_restart } from "./ProfileCommands.ts";
import * as Profiles from "../config/Profiles.ts";
import { Projects } from "../chat/Projects.ts";
import { related_hear } from "./Related.ts";
import { Remote } from "../chat/Remote.ts";
import { status_hear, status_new, status_set, type Status } from "./Status.ts";
import { Run } from "../config/Run.ts";
import * as Reply from "../ui/Reply.ts";
import * as Screen from "../ui/Screen.ts";
import { setting_follow } from "./Settings.ts";
import { CLOCK } from "./Side.ts";
import { Store } from "../chat/Store.ts";
import { Tools } from "../tools/Tools.ts";
import { THEME_TROUBLE } from "../ui/Theme.ts";
import { Trust } from "./Trust.ts";
import { Trusted } from "../config/Trusted.ts";
import { AGAIN, HERE, Update } from "../config/Update.ts";
import * as View from "../ui/View.ts";

// the terminal: the chat, run here (null: another terminal's, this one a
// view of it: Remote.ts); mem: its memory, to read; ended: input's; pending: commands at work;
// due: a paint; settle: a new size's; imgs: the images attached, by
// their tokens' numbers (kept: a message sent again from the history
// names them still); quit: when Ctrl+C (or Ctrl+D) last asked to quit on
// an empty input (ms), quitting: a quit under way (a key quits at once),
// esc: Esc while illi's turn ran (ms); notices: the notes and the toast said for a while, expire:
// the clock that lets them go (Notices.ts); scroll: lines up from the
// chat's end (0: following it); seen: the chat as last painted; ver: a
// count of the changes to the chat's rows (a stream's aside), body: its
// lines as laid
// out at one; find: the mark of a block or an item to scroll to (Paint.mark_key); pane: a text over the chat
// (/help, /agents); agents: the user's primary agents, as last read; choose: the
// picker of a list, a popup (Popup.ts; null: closed); question: the
// picker of a question, in the input's place (Question.ts: a
// confirmation, a line asked for, the permission question; null: none,
// or illi's form: asking);
// profs: the profiles, as last read; hits: what a click on the screen does;
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
// painted, fields: the lines typed in as last painted (a press puts the
// cursor in one), sel: the text chosen in one (null: none), hover: the button
// under the pointer as last painted, drift: a drag's scrolling past an
// area's edge; sug: the commands suggested as a /word is typed (null:
// closed); dropped: the suggested reply typing dismissed, till a message
// goes (one that sent it keeps it so, as the chat lets it go; "": none);
// lead: the leader pressed, the next key its shortcut's (the screen grey
// meanwhile: Frame.ts); quoted: the quote a right drag put in the input
// last, when and what it added (Select.ts; null: none); box: the box the
// mouse goes to as last painted (a popup, else the question at the input
// or the commands suggested; null: none, or a new size since), aim: the
// mouse as it saw it; pin: a mark a click acted on, by its key, and the
// screen row clicked, where the next paint puts its first line (Frame.ts
// term_chat; null: none); lit: the mark lit as last painted, by its key
// (what a click would act on: Select.ts term_light; null: none),
// pointed: whether the pointer's place is known to light it (it moved,
// pressed or let go since the chat last moved by itself while followed,
// a key, or the focus lost); wait: a click's fold waiting out a double
// click, the mark's key and its clock (Keys.ts term_click; null: none);
// acted: the cell whose click acted last, and till when a press there
// acts on nothing (null: none)
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
  quitting: boolean;
  esc     : number;
  notices : Notice[];
  expire  : Timer | undefined;
  scroll  : number;
  seen    : Seen;
  ver     : number;
  body    : Body | null;
  find    : string | null;
  pane    : Pane | null;
  agents  : Profile[];
  choose  : Chooser | null;
  question: Chooser | null;
  profs   : string[];
  hits    : Hit[];
  since   : number;
  spin    : Timer | undefined;
  ruled   : { row: number; w: number; at: Screen.Spot | null; rows: Screen.Piece[][]; side: { at: number; w: number; sw: number; left: boolean; tall: number; with: number[] } | null; spin: string } | null;
  doing   : View.Doing | null;
  subs    : Map<string, boolean>;
  side    : { place: string; width: string };
  status  : Status;
  todo    : boolean;
  login   : AbortController | null;
  areas   : Area[];
  fields  : Field[];
  sel     : Sel | null;
  hover   : (() => string) | undefined;
  drift   : { d: number; timer: Timer } | undefined;
  sug     : Sug | null;
  dropped : string;
  lead    : boolean;
  quoted  : { at: number; add: string } | null;
  asking  : { id: string; c: Chooser | null; done: boolean; form: Form | null; shown: number | null } | null; // the chat's question (Asks.ts): its picker (or the line it asks why) or form, whether answered, when it showed (Question.ts question_shown; null: not since it last opened)
  box     : Box | null;
  aim     : Aim;
  pin     : { key: string; row: number } | null;
  lit     : string | null;
  pointed : boolean;
  wait    : { key: string; timer: Timer } | null;
  acted   : { at: Screen.Spot; until: number } | null;
};

// the mouse as a box saw it (Popup.ts popup_mouse): the pointer's row as
// last seen, and whether it was in the box; the press it took (none:
// null), in the box painted for what (null: one let go: a box stale, a
// click again), and what it landed on (a row's target, the box,
// outside); what was open at the last first press (a popup's picker or
// the question's, none: null), for the presses again after it
export type Aim = { row: number; in: boolean; press: { of: object | null; on: Target | "box" | "out" | null } | null; first: object | null };

// a box as last painted: a popup (Popup.ts), the question at the input
// (Question.ts), or the commands suggested (Frame.ts); what it was
// painted for (the picker, illi's form, the commands), its place and
// size, how far in from its edge its lines start (a frame's 2; the
// question's, none), what each of its rows stands for, top first (null:
// nothing to point at: its frame, a head, the lead, a blank; spans:
// things side by side, the form's tabs); its list (the form's: what
// scrolls under its tabs): the box's row it starts at, its lines, the
// entries they show (the form's: all its lines, shown or not); the lines
// leading it: how many show, of how many; whether they fold (the
// permission question's long command: Chooser fold, as it was laid out)
export type Box = { of: object; row: number; col: number; w: number; h: number; inset: number; rows: Array<Target | Span[] | null>; list: number; lines: number; tall: number; ahead: number; lead: number; folds: boolean };

// what a row of a box stands for: one of a popup's options (by its
// index among the names), one of the commands suggested (by its index
// among those found), a tab of illi's form, a row of one of its tabs
// (an option, past them its words), a line of a folded command saying
// how many lines it hides (fold: the kth such; a click shows them all)
export type Target = { $: "option" | "command" | "tab" | "fold"; k: number } | { $: "row"; k: number; tab: number };

// a thing on a row of a box beside others: its columns inside the frame,
// from, to (past its end), and what it stands for
export type Span = { col: number; to: number; aim: Target };

// illi's own questions, at the input (Asks.ts, Question.ts): the tab shown
// (past the last question: the answers, to look over), the first of its
// lines in view (under the tabs, as it scrolls), and for each question
// the words typed beside its options, the row lit (past the options: the
// words'), the options picked
export type Form = { tab: number; top: number; each: Array<{ ed: Screen.Ed; at: number; picked: number[] }> };

// the chat as last painted: its lines, its marks in them, the screen
// row of its first line shown and that line, the rows it had, its first
// column and the one past its right end, how far it was scrolled up
type Seen = { total: number; marks: Paint.Mark[]; row: number; first: number; tall: number; col: number; end: number; scroll: number };

// a part of the screen a drag chooses text in: which (chat, pane, side,
// head, foot), its lines, the first shown (at screen row `row`, column
// `col`), how wide and tall it shows; scroll: it moved a line up (d -1)
// or down (1), for a drag past its edge (none: it holds still)
export type Area = { key: string; lines: Paint.Line[]; first: number; row: number; col: number; w: number; tall: number; scroll?: (d: number) => void };

// a line typed in as painted, where a press puts its cursor (Select.ts
// term_put): the input, a question's line asked, illi's form's words, a
// list's search. What it was painted for (a picker, illi's form; the
// input: null), its editor and the text it showed; the rows and columns
// a press there takes, from its first row and column on the screen (the
// input's and a line asked's: their rows whole, the rule under them too,
// for the text's end); where a press at a row and column of those, from
// its first, puts the cursor
export type Field = { of: object | null; ed: Screen.Ed; text: string; row: number; col: number; w: number; tall: number; at: (row: number, col: number) => number };

// a line typed in as laid out in a box (a picker's, illi's form), before
// it is painted (Field): its rows and columns from the box's first; wide:
// its rows whole, past the box (a line asked, as the input)
export type Typed = Omit<Field, "of" | "text"> & { wide?: true };

// a place in an area's lines: a line, a column
export type Cell = { line: number; col: number };

// text chosen: in which area, from where to where (either way round),
// whether the button is still down, whether it left its first cell; by
// what it grows as it's dragged (1: a character, 2: a word, 3: a line,
// as many times as it was pressed) and the first it took, first and last;
// drop: its press let go of text chosen that showed, so as a click it
// acts on nothing in the chat (Select.ts term_showing)
export type Sel = { key: string; a: Cell; b: Cell; held: boolean; moved: boolean; unit: number; root: [Cell, Cell]; drop?: true };

export type Ink = Paint.Run["s"];

// the chat's rows laid out (from the last up, as far as shown: Frame.ts),
// at which change
type Body = Paint.Laid & { ver: number };

// a text over the chat: its title, its lines made for a width (made
// again at another), how far it is scrolled down
export type Pane = { title: string; make: (w: number) => Paint.Line[]; w: number; lines: Paint.Line[]; scroll: number };

// a place on the screen (a row, its columns from, to) and its click
export type Hit = { row: number; col: number; to: number; run: () => void };

// what's under a spot of the screen, for a click and the light alike
// (Select.ts term_target): a box (a popup, the question at the input,
// the commands suggested) over it, a hit, a reply's button, a mark of
// the chat, or nothing
export type Under = { $: "popup" } | { $: "hit"; hit: Hit } | { $: "copy"; copy: () => string } | { $: "mark"; mark: Paint.Mark } | { $: "none" };

// the picker: a list, a popup in the screen's middle (Popup.ts: /agent,
// /profile, /model, /settings, Ctrl+P and the rest), or a question, in
// the input's place (Question.ts: a confirmation, a line asked for, the
// permission question): its title, its options' names and what each
// is, the one marked as now (-1: none), what picking option k does;
// find: the search typed (a question's: the line asked), an input as the
// chat's, its editing keys too (null: none, typing goes nowhere), shown:
// the options it matches (Screen.ed_rank), best first, at: the one lit
// among them, top: the first in view; keys: what else the lit option k
// takes (true: taken; the model picker's effort and speed, a setting's
// steps), foot: what the box's foot (a question's rule) says of it ("":
// nothing); ask: a line asked for instead of options (a profile's name,
// a file), always a question: typed in `find`, its hint shown while it
// is empty, given by Enter to `done`, whose answer null closes it (what
// it opened stays) and a reason keeps it open, saying it;
// hay: what a search looks in, an option's each (none: its name); used:
// how often an option was picked (a search ranks the more used first);
// aside: what shows at an option's right end, each (its keys, its value);
// heads: each option's group, a head over its first while nothing is
// searched; key: the key that opened it, which closes it (Ctrl+P's);
// past: the lines leading it scrolled past; lead: lines over a
// question's answers (why it asks, what it would do), wrapped and
// cleaned as laid out (Question.ts); fold: how a long command in them
// folds (from: the lead's line it starts on; keep: lines shown while it
// is folded besides its first, the lead's last and those holding what
// made the checks ask; spots: where that is, a line and from, to by
// character of its text, cleaned: a long line shows its rows holding
// it; open: shown whole, Ctrl+O's); answers: a question's options, each
// marked an answer (GLYPH.option) as nothing is picked yet;
// detail: lines under them of the lit option k, made for w columns (the
// model picker's autocompact gauge)
export type Chooser = {
  title  : string;
  names  : string[];
  about  : string[];
  hay?   : string[];
  used?  : (k: number) => number;
  aside? : string[];
  heads? : string[];
  key?   : string;
  past?  : number;
  lead?  : Paint.Line[];
  fold?  : { from: number; keep: number[]; spots: Array<[number, number, number]>; open: boolean };
  answers?: boolean;
  here   : number;
  pick   : (k: number) => void;
  find   : Screen.Ed | null;
  shown  : Screen.Match[];
  at     : number;
  top    : number;
  keys   : (k: number, key: string) => boolean;
  foot   : (k: number) => string;
  detail?: (k: number, w: number) => Paint.Line[];
  ask    : { hint: string; done: (text: string) => string | null } | null;
};

// a line of the side drawn and what a click on it does (null: nothing);
// a second column in it (Side.term_side_beside): where it starts,
// columns into the line, and what a click from there on does
export type Item = [Paint.Line, (() => void) | null, { col: number; run: (() => void) | null }?];

// the commands suggested as a `/word` is typed, as in Claude Code: all
// of them (the user's too, read as the list opened: never at each key)
// and after them the settings, each by the name it is matched by (a
// setting's: its key), how many are commands (the settings shown only
// once a word is typed); the word they're matched to, those it matches
// (best first), the one lit, the first shown; how many fit as last
// shown (their descriptions wrapped, up to Frame.ts SUGGEST lines); the
// word Esc closed it at (null: none); mid: where the word starts in a
// message, the user's skills alone suggested, a pick filling it in
// (null: the input is the word alone)
export type Sug = { cmds: Cmd[]; names: string[]; commands: number; word: string; found: Screen.Match[]; at: number; top: number; tall: number; off: string | null; mid: number | null };

// a line of /help: how it is typed ("": keys only), its keys, what it
// does; it runs on its argument, or by a key on "" (or the key's name);
// the other name it answers to; what it does as searched (none: text; a
// command or skill of the user's or a plugin's: its own description,
// without what illi says around it)
export type Cmd = [use: string, keys: string, text: string, run: (t: Term, arg: string) => void | Promise<void>, also?: string, said?: string];

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

// how long a quit waits on the plugins and hooks told of it before a
// toast says so, ms
const SLOW_QUIT = 300;

function term_new(chat: Chat | null, mem: () => Memory, scr: Screen.Screen): Term {
  const t: Term = {
    v       : View.view_new(),
    scr,
    chat,
    mem,
    ended   : false,
    pending : 0,
    due     : false,
    settle  : undefined,
    imgs    : new Map(),
    quit    : 0,
    quitting: false,
    esc     : 0,
    notices : [],
    expire  : undefined,
    scroll  : 0,
    seen    : { total: 0, marks: [], row: 0, first: 0, tall: 1, col: 0, end: 0, scroll: 0 },
    ver     : 0,
    body    : null,
    find    : null,
    pane    : null,
    agents  : [],
    choose  : null,
    question: null,
    profs   : Profiles.profile_list(config.ROOT),
    hits    : [],
    since   : 0,
    spin    : undefined,
    ruled   : null,
    doing   : null,
    subs    : new Map(),
    side    : { place: config.SIDE, width: config.SIDE_WIDTH },
    status  : status_new(),
    todo    : false,
    login   : null,
    areas   : [],
    fields  : [],
    sel     : null,
    hover   : undefined,
    drift   : undefined,
    sug     : null,
    dropped : "",
    lead    : false,
    quoted  : null,
    asking  : null,
    box     : null,
    aim     : { row: -1, in: false, press: null, first: null },
    pin     : null,
    lit     : null,
    pointed : false,
    wait    : null,
    acted   : null,
  };
  // the chat suggests replies to a screen that shows them, never a pipe
  // (while `suggest` is on: Suggest.ask); a setting changed, here or in
  // another terminal, is followed (setting_follow)
  if (chat !== null) {
    chat.suggest.on = t.scr.tty;
  }
  setting_follow(t);
  term_primaries(t);
  Reply.reply_buttons(t.scr.tty);
  member_attach(t);
  t.scr.on    = (key) => term_press(t, key);
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
  process.stdout.on("resize", () => {
    term_resize(t);
    status_hear(t);
  });
  process.on("exit", () => {
    void Plugins.quit(process.cwd(), "other");
    Run.end();
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
  const file = Lock.socket(Projects.lock(Projects.place(process.cwd()).path));
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
  term_after("illi: " + name + " is open in another terminal, but " + (why || "it can't be reached") + ": quit illi there, then start it here again.");
  process.exit(1);
}

// an act to the chat; a message refused goes back in the input; taken,
// what `ok` says is noted (a refusal says why instead)
export function term_send(t: Term, msg: View.Client, sent?: View.Sent, ok?: string): void {
  View.link_send(t.v, msg, (a) => {
    if (a.error !== undefined || ok !== undefined) {
      term_note(t, a.error ?? ok!);
    }
    if (a.error !== undefined && sent !== undefined) {
      term_back(t, sent);
    }
    term_idle(t);
  });
}

// a message of the chat: to the view (all but a stream's piece changes
// its rows) and the radar (Related.ts), then to the screen, or a pipe
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
  related_hear(t, msg);
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
    status_hear(t);
    term_idle(t);
  }
  member_state(t);
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

// quits, its work cut (the next start resumes it), once the plugins and
// hooks told of it are done (Plugins.quit: a while at most; a toast says
// so if they take one, and a second quit doesn't wait) and all painted is
// out (a write's callback comes after those before it), with exitCode.
// In a window, the window is told first: it ends the other profiles
export function term_quit(t: Term): void {
  member_quit();
  t.quitting = true;
  t.v.ws?.close();
  term_paint(t);
  const told = Plugins.quit(process.cwd(), "prompt_input_exit");
  const slow = setTimeout(() => term_toast(t, "Quitting once your hooks are done · Ctrl+D quits now", HOLD), SLOW_QUIT);
  void told.then(() => {
    clearTimeout(slow);
    process.stdout.write("", () => process.exit());
  });
}

// quits at a signal (the terminal may be gone: nothing painted), once the
// plugins and hooks told of it are done (a second signal doesn't wait)
function term_bye(t: Term): void {
  t.v.ws?.close();
  void Plugins.quit(process.cwd(), "other").then(() => process.exit(0));
}

// a crash (an error nothing caught): its stack to LOG, the terminal left
// as found (the screen's own exit handler, which runs first), then one
// line on why and where the details are; exit code 1
export function term_crash(err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  try {
    fs.appendFileSync(LOG, new Date().toISOString() + " illi: crashed: " + (e.stack ?? e.message) + "\n");
  } catch {}
  term_after("illi: crashed: " + e.message + " (details in " + LOG + ")");
  process.exit(1);
}

// a line said once illi has left the screen: on the terminal as illi
// exits (after the screen's own exit handler puts it back); in a window,
// to the window, which prints it as it ends (or notes it, another
// profile shown)
export function term_after(text: string): void {
  if (WIN !== null) {
    return member_say(text);
  }
  process.on("exit", () => process.stderr.write(text + "\n"));
}

// what went wrong before the screen was up, or out of sight, said once
// it is: a theme file that won't read; each MCP servers' file that
// won't, and each server that fails to start (once a session; /mcp says
// more)
function term_trouble(t: Term, told: Set<string>): void {
  const { servers, troubles } = Mcp.status();
  const says: Array<[key: string, text: string]> = [
    ["theme", THEME_TROUBLE],
    ...troubles.map((x): [string, string] => ["mcp file " + x, "An MCP servers' file won't read (" + x + "): /mcp says more."]),
    ...servers.filter((s) => s.state === "failed").map((s): [string, string] => ["mcp " + s.name, "The MCP server " + s.name + " didn't start: " + s.why.replace(/\.$/, "") + " (/mcp says more)."]),
  ];
  for (const [key, text] of says.filter(([key, text]) => text !== "" && !told.has(key))) {
    told.add(key);
    term_note(t, text);
  }
}

// the chat of the working folder's project opened (its lock taken: one
// illi a project; the profile running kept as the project's, for its
// next start: Profiles.profile_here_keep), on the terminal (its log
// lines to LOG; a crash said, the terminal left as found: term_crash)
// or a pipe; the user's plugins loaded before it (their start told; a
// project's only in a trusted folder) and given the screen once it is
// up; the MCP servers started (a failure told: term_trouble); the models
// ChatGPT lists learned; a new release looked for (term_update). First
// of all, on a terminal, the folder trusted (Trust.ts): not, illi leaves
// as it came, saying so. The screen is taken here only on a terminal,
// for that question; a pipe's is made where the chat's is (term_new), so
// its input's end, which can come at once, finds Term listening
export async function term_start(): Promise<void> {
  process.on("uncaughtException", term_crash);
  process.on("unhandledRejection", term_crash);
  member_hello();
  const tty = process.stdin.isTTY === true && process.stdout.isTTY === true;
  const scr = tty ? Screen.screen_new(() => {}, member_screen()) : null;
  if (scr !== null && !(await Trust.check(scr, process.cwd()))) {
    await Screen.screen_leave(scr);
    term_after("illi: not started: " + Trusted.folder(process.cwd()) + " isn't trusted.");
    process.exit(1);
  }
  const holds = await Lock.take(process.cwd(), Remote.serve).catch((err) => {
    term_after("illi: " + err.message);
    process.exit(1);
  });
  // on a terminal, what the agent logs goes to LOG, never over the screen
  if (process.stdout.isTTY) {
    const log = (...args: unknown[]) => fs.appendFileSync(LOG, new Date().toISOString() + " " + args.map(String).join(" ") + "\n");
    console.log = console.warn = console.error = log;
  }
  // the profile a person works in here, kept for the project's next start
  // (a script's run through a pipe changes nothing; one hidden in a
  // window, once shown); started by a window's switch, the one used last
  if (tty && WIN?.how !== "hidden") {
    member_keep(WIN?.how === "switch");
  }
  if (holds) {
    delete process.env.ILLI_REJOIN;
  }
  await Plugins.load(process.cwd(), (cwd) => Trusted.has(Trusted.folder(cwd)));
  Hooks.load(process.cwd(), (cwd) => Trusted.has(Trusted.folder(cwd)));
  void Plugins.emit("start", { cwd: process.cwd(), profile: config.PROFILE, chat: holds });
  const chat = holds ? Chat.open(process.cwd()) : null;
  if (chat !== null) {
    Plugins.attach_chat({ mode: () => Tools.mode(chat.tools), halt: (why) => Chat.stop(chat, why) });
  }
  const t = term_new(chat, chat !== null ? () => chat.mem : term_reader(), scr ?? Screen.screen_new(() => {}));
  Plugins.attach({ note: (text) => term_note(t, text), send: (text) => term_send(t, { $: "say", sizes: [], body: () => new Blob([text]) }), redraw: () => term_draw(t) });
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
  status_set(t);
  term_account(t);
  term_update(t);
}

// on a terminal, a new release of illi looked for in the background, at
// the start and each Update.AGAIN after (Update.check: the compiled
// file's, at most once a day, by `autoupdate`; the timer never keeps
// illi running), what it did or found a note held as the start's are;
// never from a pipe, whose output is a script's, nor where it never
// looks (a source run, `autoupdate` off)
function term_update(t: Term): void {
  if (!t.scr.tty || HERE === null || config.AUTOUPDATE === "off") {
    return;
  }
  const look = () => void Update.check(config.ROOT, config.AUTOUPDATE).then((note) => note !== "" && term_note(t, note, HOLD));
  look();
  setInterval(look, AGAIN).unref();
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
