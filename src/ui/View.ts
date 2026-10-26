// View
// ====
// What a view of the chat holds and draws (Term.ts): `view_hear` takes
// the chat's messages, `view_act` the person's acts, and both answer what
// to send (by the Link). The main chat shows what its agent sees (Chat.ts): the
// view's parts as blocks ("nx"), from the turn on each message whole
// (0x) and its thoughts, then what streams or what the turn waits on. The
// work between the person's words and illi's (tool calls, their results,
// thinking, the agents' reports: ACTIVITY) shows as one line per run
// (an "Act" row: what was done, counted, keyed by its first message:
// row_key), over its items, a line each (an "Item" row: what a call did
// in plain words and how it ended, Call.ts; a report, or a thought or a
// result standing alone, so too). An item opens alone, by a click or
// /open (its call and its result whole, the thoughts before it), or all
// at once (verbose: Ctrl+O; a click then closes one alone); past CALLS
// the rest are counted on a "More" row, a click showing them all (the
// newest kept in view while the run is at work; any opened alone kept
// too). What streams of the
// work shows only on the line over the input (Term.ts), unless verbose.
// A result's <history> line (what recall gave the model of its memory:
// Recall.ts) never shows: a result's lines, how its call ended and its
// count of lines read the result without it (history_bare, Clip.ts); the
// side's Related lines are where the user sees what the radar found.
// A recap (/compact) shows as a line across the chat (a "Rule" row),
// the recap under it once opened by a click or verbose, each of its
// pages folded by a click to a line (a "Fold" row, keyed: row_fold);
// what the screen showed before it stays above. An agent's page is its
// log, kept live, whole, its work in runs as the chat's (each page its
// own clicks: Shown).

import type { Kind, Vendor } from "../ai/AskAI.ts";
import type { Mode } from "../tools/Guard.ts";
import * as Call from "./Call.ts";
import { history_bare } from "../tools/Clip.ts";
import * as Md from "./Md.ts";
import { LABELS, type Model, type Move, Pick } from "../ai/Pick.ts";
import { GLYPH, WHO } from "./Theme.ts";

// Types
// =====

// the n messages from id on (n a power of two)
export type Part = [number, number];

// a message logged: its kind, its text, its date (ISO), its images
export type Entry = { kind: Kind; text: string; date?: string; images?: string[] };

// a summary: its text, its last message's date
export type Node = { text: string; to: string };

export type Live = { kind: Kind; text: string };

// what clicks opened or shut in a chat or an agent's page, against the
// mode (verbose): the recaps (by their key: row_key) and the pages folded
// in them (row_fold); the items of runs (by key: "c" and their message's,
// row_name), the runs that show all their items (by key)
export type Shown = { acts: Set<number>; folds: Set<string>; items: Set<string>; mores: Set<number> };

// log: null while it loads; shown: what clicks opened on it (none yet:
// view_shown makes it)
export type Page = { name: string; log: Entry[] | null; live: Live[]; shown?: Shown };

// what a turn waits on while nothing streams: nothing (""), SUMMARIES,
// or the first piece of the model it names (a request out, no tool
// running; a running tool shows its call); COMPACTING: a recap being
// written in the turn's place (/compact)
export const SUMMARIES = "summaries";
export const COMPACTING = "compaction";
export type Wait = string;

// what runs, in words (view_doing): the step it is at, about how many
// tokens the models have written since work began (made), and how fast
// they write now (tokens a second, over the last RATE ms; 0: nothing
// streams)
export type Doing = { verb: string; tokens: number; rate: number };

// a plan's rate limit, as its last response told it (ChatGPT.ts,
// ClaudeCode.ts): its window (minutes), the share of it used (%), when it
// starts anew (ms)
export type Limit = { window: number; used: number; reset: number };

// how full the chat a turn sends is (tokens), the most it holds before
// its oldest messages fold into the tree (its auto compact, as it
// applies), its model's window; the auto compact set for the model (set:
// as written, "60%" or "400k"; own: the model's own, else the global
// one), the most it may be (tokens)
export type Fill = { used: number; cap: number; window: number; set: string; own: boolean; most: number };

// the auto compacts set: the global one and each model's own, by label
// (the /model gauge's, whatever the chat's model's window)
export type Compacts = { global: string; sets: Record<string, string> };

// a plan, as its vendor tells it (ChatGPT.ts, ClaudeCode.ts told): whose
// it is (ChatGPT, Claude), which one (plus, pro…; "": not known, as
// Claude's always is), its limits (none: not told, and the side shows no
// plan)
export type Plan = { brand: string; tier: string; limits: Limit[] };

// what the main agent's calls use: the plan of the vendor picked (null:
// none told, or a vendor that tells none); how full the chat is (null:
// not told yet, or its model's window isn't known); the auto compacts
// set (none: not told yet)
export type Use = { plan: Plan | null; fill?: Fill | null; compacts?: Compacts };

// an item of illi's to-do list (Tools.ts todo): what to do, how it stands
export type Todo = { text: string; status: "pending" | "active" | "done" };

// a background job (Machine.ts): a shell call that ended leaving a
// process running; its number, the call's command, who called it (illi,
// or a subagent's name), when it ended (ms)
export type Background = { id: number; command: string; agent: string; since: number };

// a question the chat asks the user, answered by a view: who asks
// (illi, an agent), the tool, what it would do (Tools.what: cut short,
// for a note): leave to run a call the checks stopped (Tools.guard: what
// it would do as the question shows it, whole up to Tools.whole's most,
// and how many characters past that are left out; where in it what made
// them ask is, spots, offsets into whole: a question folding it shows
// those lines (a long one, its rows holding them), none given or none
// placed: it doesn't fold; where whole says that text
// was left out between the lines it keeps for a spot, cuts; why they
// stopped it; what a "don't ask again" keeps, as said, "": none offered;
// the middle of a long why or keep left out); or illi's own (ask: its
// queries, one or more, answered at once)
export type Question = { id: string; who: string; tool: string; what: string; whole?: string; more?: number; spots?: Array<[number, number]>; cuts?: Array<[number, number]>; why?: string; keep?: string; queries?: Query[] };

// a request refused (Tools.guard): its id, who asked (illi, an agent),
// the tool, what (a command, a file), why; how: the user said no (or no
// one was there to), the mode refused it, the user's rules did; what the
// user said, when (ms), the exact grants that would let it run (none:
// only the user's rules can)
export type Refused = { id: string; who: string; tool: string; what: string; why: string; how: "no" | "mode" | "rule"; said: string; at: number; exact: string[] };

// the permissions (Tools.perms): the mode now and the one the setting
// gives, the requests refused (newest last), the grants (kept for the
// project, or this run's), the rules file and why it won't read ("": it
// reads)
export type Perms = { mode: Mode; set: Mode; refused: Refused[]; grants: Grant[]; file: string; broken: string };

// a grant: as kept (Guard: kind=subject, kind:pattern), as said, whether
// kept in the file (else for this run only)
export type Grant = { grant: string; said: string; saved: boolean };

// one of illi's questions: what it asks, its tab's label, the options it
// offers, whether several may be picked
export type Query = { text: string; head: string; options: Option[]; multi: boolean };

// an option a query offers: its label, what it means ("": none)
export type Option = { label: string; about: string };

// the answers to illi's question, as the model gets them (Chat.ts): this,
// then each query and what was said to it. The view shows them as the
// user's, not as work (entry_rows)
export const ANSWERED = "The user answered at illi's screen:\n";

// how a failed call's result starts, as it is logged (Agent.ts, ClaudeCode.ts)
export const FAILED = "error: ";

// agents: those at work; agent: the main agent (null: illi's own);
// vendors and models: those offered; use: what its calls use; todo:
// illi's to-do list; suggest: the user's likely next message, asked as
// the last turn ended (Suggest.ask; "": none); asks: the questions
// waiting for an answer, the first shown; perm: the permissions. None
// is ever undefined: a view is told only the fields that move
// (Chat.tell), and JSON drops an undefined one, so the view's would stay
export type State = {
  busy    : boolean;
  wait    : Wait;
  agents  : string[];
  pick    : Pick | null;
  agent   : string | null;
  vendors : Vendor[];
  models  : string[];
  catalog : Partial<Record<Vendor, Model[]>>;
  use     : Use;
  todo    : Todo[];
  background: Background[];
  suggest : string;
  asks    : Question[];
  perm    : Perms;
};

// fold: the tops shown (null: not folded); nodes and whole: the summaries
// ("id+n") and messages known; open: the blocks opened (true) or shut by
// hand; the Shown's: what clicks opened or shut in the chat; verbose:
// every run's items and recap open (Ctrl+O); minds: the thoughts after
// each message; pages: the agents' asked
// for; page: the one shown (null: illi's); made: the characters the
// models streamed (replies, thoughts, calls) since work began; flow:
// the last RATE ms of them (when, how many); the Link's: acts not
// answered, the pipe (up: it showed the chat), what sends those not sent
export type View = State & Shown & {
  parts : Part[];
  turn  : number;
  fold  : Part[] | null;
  nodes : Map<string, Node>;
  whole : Map<number, Entry>;
  open  : Map<string, boolean>;
  verbose: boolean;
  made  : number;
  flow  : Array<[number, number]>;
  live  : Live[];
  minds : Map<number, string[]>;
  pages : Map<string, Page>;
  page  : Page | null;
  notes : string[];
  out   : Post[];
  ws    : Pipe | null;
  up    : boolean;
  flush : () => void;
};

export type Pack = { nodes?: Record<string, Node>; whole?: Record<string, Entry> };

// the chat's messages (Chat.ts documents them)
export type Server =
  | ({ $: "know" } & Pack)
  | { $: "view"; parts: Part[]; turn: number }
  | { $: "zoom"; id: number; n: number; parts: Part[] }
  | { $: "root"; parts: Part[] }
  | ({ $: "entry"; agent?: string; id?: number } & Entry)
  | { $: "delta"; agent?: string; kind: Kind; text: string; fresh?: boolean }
  | { $: "live"; agent?: string; live: Live[] }
  | ({ $: "state" } & Partial<State>) // the fields moved since the view was last told, all as it joins (Chat.tell)
  | { $: "agent"; name: string; found: boolean }
  | { $: "note"; text: string }
  | { $: "settings" } // config.json read again by the chat's illi, as a terminal changed a setting: a view's illi reads it again too, redoing what its terminal keeps of the settings (Settings.ts setting_told); a view of an older illi passes it over
  | ({ $: "ack"; id: string } & Answer);

// a message a person sends: its text, its images
export type Sent = { text: string; images?: Blob[] };

// an act's answer: why refused; a body, made anew for each post
export type Answer = { error?: string };
export type Body   = () => any;

// the acts a view sends: changes, then reads; a message's body is its
// images (sizes given), then its text
export type Client =
  | { $: "say"; sizes: number[]; body: Body }
  | { $: "stop"; name?: string } // all work, or the agent named, or TURN
  | { $: "goal"; text: string | null } // the goal set (/goal), or none (/halt)
  | { $: "clear" } // a fresh session: the chat so far leaves the view, kept for search and zoom (/clear)
  | { $: "compact"; focus?: string } // illi writes its recap, the turn's view starting at it, the screen kept (/compact); focus: what it should keep
  | { $: "pick"; to: Pick }
  | { $: "main"; name: string | null } // the main agent (/agent), or illi's own
  | { $: "zoom"; part: Part }
  | { $: "root" }
  | { $: "agent"; name: string }
  | { $: "answer"; ask: string; yes: boolean; always: boolean; said?: string } // a question (State asks, its id) answered; said: a no's reason, or the answer to illi's own
  | { $: "mode"; mode: Mode | null } // the mode for this run (/mode), or back to the setting's
  | { $: "allow"; refused: string } // a refused request (State perm, by its id) allowed for this run, the one who asked told (/permissions)
  | { $: "background"; stop: number } // a background job (State background, by its id) stopped (/background)
  | { $: "revoke"; grant: string } // a grant let go, kept or this run's (/permissions)
  | { $: "dismiss"; part: Part } // a radar's line dismissed at the side (Related.ts): never given to the model either (Recall.ts), till illi quits
  | { $: "related" } // config.json written by a terminal (any setting; named for `related`, the first it told of): the chat's illi reads it again, so the change holds for the chat as one made in its own terminal does (Settings.ts setting_follow)
  | { $: "autocompact"; label: string; value: string | null }; // a model's autocompact set (/autocompact, /model), or its own taken out

// an act not answered: with its id, whether it was sent, what its
// answer does
export type Post = { msg: Client & { id: string }; sent: boolean; done: (a: Answer) => void };

// the view's end of a pipe to the chat (Chat.pipe): an act sent as JSON,
// the end; the chat's messages come to onmessage
export type Pipe = { send: (text: string) => void; close: () => void; onmessage: ((ev: { data: string }) => void) | null };

// how a view reaches the chat: its pipe, an act with a body (its fields,
// its body), what it does with a message
export type Link = {
  open : () => Pipe;
  post : (msg: object, body: Blob) => Promise<Answer>;
  hear : (msg: Server) => void;
};

// what a person does
export type Act =
  | ({ $: "Send" } & Sent)                      // Enter: a message (empty: nothing)
  | { $: "Stop" }                               // Esc twice, Ctrl+C: illi's turn and its subagents stopped (none running: nothing)
  | { $: "Move"; move: Move; to?: string }      // the pick moves (to: to that value)
  | { $: "Pick"; to: Pick }                     // the pick set whole (the /model picker)
  | { $: "Open"; id: number; n: number }        // a click on a block
  | { $: "Shut"; id: number; n: number }        // a click on an open block's bar
  | { $: "Fold"; on: boolean }                  // fold all, unfold all
  | { $: "Goto"; name: string | null }          // a tab, a name, the logo (null: illi)

// what a page draws, top to bottom
export type Row =
  | { $: "Sum"; id: number; n: number; text: string; call: Call.Call | null; kind: Kind | null }  // a block: nx, its summary (as written: drawn flat, Paint.ts; call: a tool call's, word for word; kind: its message's, of one known)
  | { $: "Box"; id: number; n: number; rows: Row[] }                                            // a block open: its rows (its bar Paint's: nx · /close #id)
  | { $: "Act"; id: number; text: string; rows: Row[]; held: Array<[name: string, key: string]> } // a run of work (ACTIVITY), from message id: what was done, a line over its items (Item rows; past CALLS, a More row); held: each message its items hold (its name: row_name), with that item's key, shown or not
  | { $: "Item"; key: string; call: Call.Call | null; label: string; outcome: string; ok: boolean | null; open: boolean; rows: Row[] } // an item of a run: a call (none: a report, or a thought or a result alone), what it did and how it ended (Call.ts; ok: true done, false failed, its result FAILED, null not known: row_echo), a line; open, its rows whole under it
  | { $: "More"; id: number; n: number; open: boolean; earlier: boolean }                       // a run's items past CALLS, counted (id: the run's): shut, n more not shown (earlier: over the newest, the run at work); open, all shown
  | { $: "Rule"; id: number; text: string; open: boolean; rows: Row[] }                        // a recap (/compact), message id: a line across the chat naming it, the recap's rows if open
  | { $: "Msg"; id: number | null; kind: Kind; who: string; text: string; body: Md.Block[]; call: Call.Call | null; images: string[]; after?: number; nth?: number } // a message whole: 0x (who: its speaker or "↳ result", named on its block; body: its blocks, none for illi's (drawn from its text); call: a tool call's, drawn as Call.ts reads it; after, nth: a thought's, the message it follows and which of its thoughts)
  | { $: "Fold"; key: string; text: string }                                                    // a page of an open recap folded by a click (key: View.row_fold): one dim line saying what it is
  | { $: "Cap"; text: string }                                                                  // a line about the page

// a tab: its page (null: the chat), whether it's shown, its mark, its
// text (the mark, then the agent illi runs as, or the page's agent's
// name) and the agent whose color its mark takes (a subagent's own: its
// name, unnumbered)
export type Tab = { name: string | null; here: boolean; mark: string; text: string; agent: string };

// hint: what the knob's value means (a tooltip; the site's note when it
// changes)
export type Knob = { text: string; move: Move; hint: string };

// Constants
// =========

// the app's name, as the head shows it; MAIN: its agent's, a nickname
export const NAME = "illimitable";
export const MAIN = "illi";

// illi's turn, as a stop names it among the agents at work
export const TURN = "illi's turn";

// what a model writes, as the work's count of tokens takes it (made);
// about how many characters make a token; the time its speed is taken
// over, and how often it is taken anew (ms)
const MADE  = new Set<Kind>(["illi", "mind", "tool"]);
const CHARS = 4;
const RATE  = 2000;
const STEP  = 500;

const WAIT = "compressing…";
const SUMS = "compressing earlier messages…";
const RECAPS = "writing the recap…";

// the line across the chat at a recap (/compact)
const RULE = "Compaction";

// the most items a run shows before a click on its More row shows them
// all (the rest counted on it, two at least: a line for one is as long
// as the item), so a run of any length lays out about as many lines as a
// short one
export const CALLS = 5;

// the kinds an image may be, each by its mark at a byte of its first HEAD
const MARKS: Array<[string, number, string]> = [
  ["image/png", 0, "\x89PNG"],
  ["image/jpeg", 0, "\xFF\xD8\xFF"],
  ["image/gif", 0, "GIF8"],
  ["image/webp", 8, "WEBP"],
];
export const HEAD   = 12;
export const IMAGES = "Images are png, jpeg, gif or webp.";

// how a line of one tool call starts
const TOOL = "tool: ";
const FOLD = "The whole chat, folded into the fewest blocks.";

// the kinds of the work between the person's words and illi's, shown as
// one line per run; a summary's kind, read off its line (Memory.plain)
const ACTIVITY: Kind[] = ["tool", "echo", "mind", "work"];
const KINDED   = /^(user|illi|tool|echo|mind|note|work|recap): /;

// the name on the answers to illi's question
const ANSWERS = "your answers";

// what a run's tool calls did, by tool: one, many (the rest: "called");
// Claude Code's own tools as illi's alike (ALIKE), or as their own
const DID: Record<string, [string, string]> = {
  shell      : ["ran a command", "ran # commands"],
  read       : ["read a file", "read # files"],
  write      : ["wrote a file", "wrote # files"],
  edit       : ["edited a file", "edited # files"],
  web_search : ["searched the web", "searched the web # times"],
  search     : ["searched memory", "searched memory # times"],
  spawn      : ["started an agent", "started # agents"],
  tell       : ["messaged an agent", "messaged # agents"],
  zoom       : ["looked back", "looked back # times"],
  date       : ["checked the date", "checked the date # times"],
  projects   : ["listed the projects", "listed the projects # times"],
  skill      : ["used a skill", "used # skills"],
  todo       : ["updated the to-do list", "updated the to-do list # times"],
  ask        : ["asked you", "asked you # times"],
  Glob       : ["listed files", "listed files # times"],
  Grep       : ["searched the code", "searched the code # times"],
  WebFetch   : ["opened a page", "opened # pages"],
};
const ALIKE: Record<string, string> = { Bash: "shell", Read: "read", Write: "write", Edit: "edit", MultiEdit: "edit", NotebookEdit: "edit", WebSearch: "web_search", TodoWrite: "todo", Task: "spawn", Agent: "spawn" };

// Constructors
// ============

export function Cap(text: string): Row {
  return { $: "Cap", text };
}

// View
// ====

// each vendor's models as the chat's process knows them (its catalogs
// told: ChatGPT's list, the windows), learned here as they change, so a
// view in another process offers and shows the same
function view_catalog(was: View["catalog"], now: View["catalog"] | undefined): void {
  for (const [vendor, models] of Object.entries(now ?? {}) as Array<[Vendor, Model[]]>) {
    if (JSON.stringify(models) !== JSON.stringify(was[vendor]) && JSON.stringify(models) !== JSON.stringify(Pick.list(vendor))) {
      Pick.learn(vendor, models, "replace");
    }
  }
}

export function view_new(): View {
  return {
    busy      : false,
    wait      : "",
    agents    : [],
    pick      : null,
    agent     : null,
    vendors   : [],
    models    : LABELS,
    catalog   : {},
    use       : { plan: null },
    todo      : [],
    background: [],
    suggest   : "",
    asks      : [],
    perm      : { mode: "auto", set: "auto", refused: [], grants: [], file: "", broken: "" },
    parts     : [],
    turn      : Infinity,
    fold      : null,
    nodes     : new Map(),
    whole     : new Map(),
    open      : new Map(),
    acts      : new Set(),
    folds     : new Set(),
    items     : new Set(),
    mores     : new Set(),
    verbose   : false,
    made      : 0,
    flow      : [],
    live      : [],
    minds     : new Map(),
    pages     : new Map(),
    page      : null,
    notes     : [],
    out       : [],
    ws        : null,
    up        : false,
    flush     : () => {},
  };
}

export function view_hear(v: View, msg: Server): Client[] {
  switch (msg.$) {
    case "know": {
      view_learn(v, msg);
      return [];
    }
    case "view": {
      v.parts = msg.parts;
      v.turn  = msg.turn;
      return v.fold === null ? [] : [{ $: "root" }];
    }
    case "zoom": {
      return [];
    }
    case "root": {
      v.fold = v.fold === null ? null : msg.parts;
      return [];
    }
    case "entry": {
      view_entry(v, msg);
      return [];
    }
    case "delta": {
      const live = view_live(v, msg.agent);
      if (live !== null) {
        live_push(live, msg.kind, msg.text, msg.fresh);
      }
      if (MADE.has(msg.kind)) {
        v.made += msg.text.length;
        v.flow.push([Date.now(), msg.text.length]);
        v.flow = v.flow.filter(([at]) => at > Date.now() - RATE - STEP);
      }
      return [];
    }
    case "live": {
      const live = view_live(v, msg.agent);
      if (live !== null) {
        live_set(live, msg.live);
      }
      return [];
    }
    case "state": {
      const { $, ...state } = msg;
      const was = view_running(v);
      view_catalog(v.catalog, state.catalog);
      Object.assign(v, state);
      if (!was && view_running(v)) {
        [v.made, v.flow] = [0, []];
      }
      return [];
    }
    case "agent": {
      const page = v.pages.get(msg.name);
      if (page === undefined) {
        return [];
      }
      if (msg.found) {
        page.log = [];
        return [];
      }
      v.pages.delete(msg.name);
      if (v.page === page) {
        v.page = null;
      }
      v.notes.push("No agent " + msg.name + ".");
      return [];
    }
    case "note": {
      v.notes.push(msg.text);
      return [];
    }
    case "ack": {
      const post = v.out.find((p) => p.msg.id === msg.id);
      v.out = v.out.filter((p) => p !== post);
      post?.done(msg);
      return [];
    }
    default: {
      return [];
    }
  }
}

export function view_act(v: View, act: Act): Client[] {
  switch (act.$) {
    case "Send": {
      const text   = act.text.trim();
      const images = act.images ?? [];
      // a `/word` reaching here is no command (the terminal ran its
      // own), but /goal (a message, sent as typed, set as the goal),
      // /halt, /clear and /compact: it errs, never goes to the AI as a
      // message
      const word   = /^\/[a-z]+(?=\s|$)/i.exec(text)?.[0];
      const goal   = word === "/goal" ? text.slice(word.length).trim() : null;
      if (text === "" && images.length === 0) {
        return [];
      }
      if (!view_typing(v)) {
        return [];
      }
      if (word === "/halt") {
        return [{ $: "goal", text: null }];
      }
      if (word === "/clear") {
        return [{ $: "clear" }];
      }
      if (word === "/compact") {
        const focus = text.slice(word.length).trim();
        return [focus === "" ? { $: "compact" } : { $: "compact", focus }];
      }
      if (goal === "") {
        v.notes.push("/goal needs one: /goal <message>.");
        return [];
      }
      if (word !== undefined && goal === null) {
        v.notes.push(word + " is no command; nothing was sent. /help lists the commands.");
        return [];
      }
      const blob = new Blob([...images, text]);
      const say: Client = { $: "say", sizes: images.map((b) => b.size), body: () => blob };
      v.fold = null;
      return goal === null ? [say] : [{ $: "goal", text: goal }, say];
    }
    case "Move": {
      const from = view_asked(v);
      if (from === null) {
        return [];
      }
      const to = Pick.move(from, act.move, v, act.to);
      if (act.move === "speed" && Pick.options(from, "speed", v).length === 1) {
        v.notes.push(from.model + " has no fast.");
        return [];
      }
      if (to === null) {
        const parts = Pick.options(from, act.move, v).map(([part]) => (act.move === "speed" ? Pick.speed(part) : part));
        v.notes.push("No " + [act.move, act.to].join(" ").trim() + "; one of: " + [...new Set(parts)].join(", ") + ".");
        return [];
      }
      return [{ $: "pick", to }];
    }
    case "Pick": {
      // model, effort and speed as one change, one note saying it (as it
      // runs: an effort or speed the model lacks fitted); none if it is
      // the pick already
      const from = view_asked(v);
      const to   = Pick.read(act.to, v);
      if (to === null) {
        v.notes.push("No pick " + Pick.shown(act.to) + " here.");
        return [];
      }
      if (from !== null && Pick.label(from) === Pick.label(to)) {
        return [];
      }
      const runs   = Pick.fit(to);
      const vendor = v.vendors.length > 1 ? " (" + to.vendor + ")" : "";
      v.notes.push("Now on " + to.model + vendor + ", " + runs.effort + " effort" + (runs.speed === "slow" ? "" : ", " + runs.speed) + ".");
      return [{ $: "pick", to }];
    }
    case "Open": {
      v.open.set(act.id + "+" + act.n, true);
      return act.n === 1 ? [] : [{ $: "zoom", part: [act.id, act.n] }];
    }
    case "Shut": {
      v.open.set(act.id + "+" + act.n, false);
      return [];
    }
    case "Fold": {
      v.open.clear();
      v.fold = act.on ? [] : null;
      return act.on ? [{ $: "root" }] : [];
    }
    case "Stop": {
      return view_running(v) ? [{ $: "stop" }] : [];
    }
    case "Goto": {
      if (act.name === null) {
        v.page = null;
        return [];
      }
      const known = v.pages.get(act.name);
      v.page = known ?? { name: act.name, log: null, live: [] };
      v.pages.set(act.name, v.page);
      return known === undefined ? [{ $: "agent", name: act.name }] : [];
    }
  }
}

// the page shown: an agent's (its runs as the chat's), the chat folded
// (its tops), or the chat; while its work goes on (the turn running, the
// agent at work) its last run keeps its newest items in view
export function view_body(v: View): Row[] {
  if (v.page !== null) {
    return page_rows(v, v.page);
  }
  if (v.fold !== null) {
    const tops = v.fold.flatMap(([id, n]) => part_rows(v, id, n, Infinity, false));
    return [Cap(FOLD), ...tops];
  }
  return view_acts(v, view_rows(v, v.parts).flat(), v, v.busy);
}

// rows with each run of work (ACTIVITY) one Act row over its items
// (act_row), and each recap (its pages) a Rule, open by a click or the
// mode, its pages folded by a click one line each (row_folded): as the
// clicks on that page say (shown: the chat's, or an agent's page's); the
// last run, while its work goes on (working), at work
export function view_acts(v: View, rows: Row[], shown: Shown = v, working = false): Row[] {
  const out: Row[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (row_recap(row) && last?.$ === "Rule") {
      last.rows.push(row);
    } else if (row_recap(row) && row.$ !== "Cap" && row.$ !== "Fold" && row.$ !== "Item" && row.$ !== "More" && row.id !== null) {
      out.push({ $: "Rule", id: row.id, text: RULE, open: v.verbose !== shown.acts.has(row.id), rows: [row] });
    } else if (!row_busy(row)) {
      out.push(row);
    } else if (last?.$ === "Act") {
      last.rows.push(row);
    } else {
      out.push({ $: "Act", id: row_key(row), text: "", rows: [row], held: [] });
    }
  }
  const folded = (rows: Row[]) => rows.map((r) => row_folded(shown, r));
  return out.map((row, k) => (row.$ === "Act" ? act_row(v, shown, row, out[k + 1], working && k === out.length - 1) : row.$ === "Rule" ? { ...row, rows: folded(row.rows) } : row));
}

// a run of work as shown: what it did (act_text), over its items
// (act_items): all of them, the run showing them all (its More row
// clicked; Ctrl+O), or two at most left out; else those kept (CALLS of
// them: the first, or, the run at work (live), the newest; and any a
// click opened alone, Ctrl+O not on) and a More row counting the rest:
// under them, or, live, over them. Only the items shown are made
function act_row(v: View, shown: Shown, run: Row & { $: "Act" }, after: Row | undefined, live: boolean): Row {
  const items = act_items(v, run.rows, after);
  const all   = v.verbose !== shown.mores.has(run.id);
  const kept  = (d: Did, k: number) => (live ? k >= items.length - CALLS : k < CALLS) || (!v.verbose && shown.items.has(d.key));
  const left  = items.filter((d, k) => !kept(d, k)).length;
  const some  = left < 2 || all ? items : items.filter(kept);
  const more  : Row[] = left < 2 ? [] : [{ $: "More", id: run.id, n: left, open: all, earlier: live }];
  const each  = some.map((d) => item_row(v, shown, d));
  const held  = items.flatMap((d) => d.names.map((name): [string, string] => [name, d.key]));
  return { $: "Act", id: run.id, text: act_text(v, run.rows), rows: live ? [...more, ...each] : [...each, ...more], held };
}

// an item of a run, before it is shown (act_items): its key, its call
// (null: a report, or a thought or a result standing alone), the result
// logged right after it (null: none), the run's row it is, its rows as
// it opens, the names of the messages it holds (row_name: its own, its
// result's, its thoughts')
type Did = { key: string; call: Call.Call | null; echo: string | null; row: Row; rows: Row[]; names: string[] };

// a run's items, in order: each call (row_call) with the result logged
// right after it (Chat.on logs a call with its result; the row after the
// run too, `after`: the answers to illi's question end the run, shown as
// the user's words), the thoughts before it (those after the run's last
// item, after that one); a report, a result after no call, the thoughts
// of a run of no other item, an item each. Each opens as its rows whole
// (row_whole; a failed result after its call, FAILED left out:
// row_marked)
function act_items(v: View, rows: Row[], after: Row | undefined): Did[] {
  const own   = rows.flatMap((r) => (r.$ === "Box" ? r.rows : [r]));
  const flat  = [...own, ...(after === undefined ? [] : after.$ === "Box" ? after.rows : [after])];
  const out   : Did[] = [];
  let minds   : Row[] = [];
  for (let k = 0; k < own.length; k++) {
    const r    = own[k];
    const call = row_call(v, r);
    const echo = call === null ? null : row_echo(v, flat[k + 1]);
    const ends = echo !== null && k + 1 < own.length ? [own[k + 1]] : [];
    if (call === null && r.$ === "Msg" && r.kind === "mind") {
      minds.push(r);
      continue;
    }
    const lead = call === null ? [] : minds;
    const mine = [r, ...ends].flatMap((x) => row_whole(v, x));
    out.push({ key: "c" + row_name(r), call, echo, row: r, rows: [...lead, ...(call === null ? mine : mine.map(row_marked))], names: [...lead, r, ...ends].map(row_name) });
    minds = call === null ? minds : [];
    k += ends.length;
  }
  if (minds.length > 0 && out.length > 0) {
    out[out.length - 1].rows.push(...minds);
    out[out.length - 1].names.push(...minds.map(row_name));
  } else if (minds.length > 0) {
    out.push({ key: "c" + row_name(minds[0]), call: null, echo: null, row: minds[0], rows: minds, names: minds.map(row_name) });
  }
  return out;
}

// a failed result opened under its call, whose mark says it failed: its
// lines without FAILED (nor the <history> line recall appended, as
// md_output reads every result: history_bare), made once a row (MARKED);
// any other row as it is. Drawn anywhere with no mark (a result with no
// call, a pipe, a related block's pane, a block of the chat folded) it
// keeps FAILED
const MARKED = new WeakMap<Row, Row>();

function row_marked(r: Row): Row {
  if (r.$ !== "Msg" || r.kind !== "echo" || !r.text.startsWith(FAILED)) {
    return r;
  }
  const shed = MARKED.get(r) ?? { ...r, body: Md.md_output(r.text.slice(FAILED.length)) };
  MARKED.set(r, shed);
  return shed;
}

// an item as a run shows it: what it did and how it ended (item_said),
// open as a click (on its page: shown) or the mode says
function item_row(v: View, shown: Shown, d: Did): Row {
  const ok = d.call === null || d.echo === null ? null : !d.echo.startsWith(FAILED);
  const { label, outcome } = item_said(d, ok);
  return { $: "Item", key: d.key, call: d.call, label, outcome, ok, open: v.verbose !== shown.items.has(d.key), rows: d.rows };
}

// what an item did and how it ended, made once for its row, its call,
// the result after it and the message it reads (a summed-up call, or its
// result, or a summed-up report or result, known later is read anew):
// a call's label and outcome (Call.ts, its result without FAILED); a
// thought, its first line (its markdown's marks left out); a report, its
// agent's and its lines; a result, its lines; a summary, its line
const SAID = new WeakMap<Row, { call: Call.Call | null; echo: string | null; msg: Row | undefined; label: string; outcome: string }>();

function item_said(d: Did, ok: boolean | null): { label: string; outcome: string } {
  const known = SAID.get(d.row);
  const msg   = d.rows.find((r) => r.$ === "Msg" && r.kind !== "mind") ?? d.rows[0];
  if (known !== undefined && known.call === d.call && known.echo === d.echo && known.msg === msg) {
    return known;
  }
  const result = d.echo === null ? "" : ok === false ? d.echo.slice(FAILED.length) : d.echo;
  const said   =
    d.call !== null ? { label: Call.call_label(d.call, d.echo === null ? null : result), outcome: Call.call_outcome(d.call, ok, result) }
    : msg?.$ === "Msg" && msg.kind === "mind" ? { label: Call.label_line(msg.text.replace(/\*\*|__|`/g, "").replace(/^\s*#+\s*/, "")) || "Thought", outcome: "" }
    : msg?.$ === "Msg" && msg.kind === "work" ? { label: msg.who === WHO.work ? "A report" : msg.who + "'s report", outcome: text_lines(Call.report_read(msg.text)?.text ?? msg.text) }
    : msg?.$ === "Msg" ? { label: "Result", outcome: text_lines(msg.kind === "echo" ? history_bare(msg.text) : msg.text) }
    : msg?.$ === "Sum" ? { label: Call.label_line(Md.md_flat(msg.text).replace(KINDED, "")), outcome: "" }
    : { label: "", outcome: "" };
  SAID.set(d.row, { call: d.call, echo: d.echo, msg, ...said });
  return said;
}

// the call a run's row holds (null: none): a message's (a tool's, even
// one not read as `name {input}`: its first line its label); a summed-up
// one's, word for word in its line (sum_call), else as its message whole
// reads (known by then: Chat.teach)
function row_call(v: View, r: Row): Call.Call | null {
  return r.$ === "Msg" ? r.call : r.$ === "Sum" ? r.call ?? sum_whole(v, r)?.find((x) => x.$ === "Msg")?.call ?? null : null;
}

// a summary's message whole, as rows (whole_rows); undefined: not of
// one message, or not known yet
function sum_whole(v: View, r: Row & { $: "Sum" }): Row[] | undefined {
  const entry = r.n === 1 ? v.whole.get(r.id) : undefined;
  return entry === undefined ? undefined : whole_rows(r.id, entry);
}

// a run's row as an item open shows it: a summary by its message whole
// (as it is till that is known), any other as it is
function row_whole(v: View, r: Row): Row[] {
  return r.$ === "Sum" ? sum_whole(v, r) ?? [r] : [r];
}

// the key of a run's row's message, as an item's key takes it: a logged
// one's "#id", a thought's (row_fold), a summary's "#id"
function row_name(r: Row): string {
  return r.$ === "Sum" || r.$ === "Box" ? "#" + r.id : row_fold(r) ?? "";
}

// a message's key as a click folds it in an open recap: a logged one's
// "#id", a thought's "m" + the message it follows + "." + which of its
// thoughts; null: none (a summary, a block)
export function row_fold(row: Row): string | null {
  return row.$ !== "Msg" ? null : row.id !== null ? "#" + row.id : row.after !== undefined ? "m" + row.after + "." + (row.nth ?? 0) : null;
}

// a recap's row as shown: a page folded by a click, one Fold line saying
// what it is (its kind and how long it is)
function row_folded(shown: Shown, row: Row): Row {
  const key = row_fold(row);
  if (key === null || !shown.folds.has(key) || row.$ !== "Msg") {
    return row;
  }
  const name  = row.kind === "echo" ? "result" : row.kind === "mind" ? "thought" : row.kind === "work" && row.who !== "" ? row.who + " reported" : row.who || row.kind;
  return { $: "Fold", key, text: row.call !== null ? Call.call_line(row.call) : name + " · " + text_lines(row.kind === "echo" ? history_bare(row.text) : row.text) };
}

// a text's lines, counted: `1 line`, `1,204 lines`
function text_lines(text: string): string {
  const n = text.split("\n").length;
  return n.toLocaleString("en-US") + (n === 1 ? " line" : " lines");
}

// what clicks opened or shut on the page shown: the chat's, or the agent
// page's (page_shown)
export function view_shown(v: View): Shown {
  return v.page === null ? v : page_shown(v.page);
}

// what clicks opened or shut on an agent's page: none, as it is first
// asked for
function page_shown(page: Page): Shown {
  page.shown ??= { acts: new Set(), folds: new Set(), items: new Set(), mores: new Set() };
  return page.shown;
}

// a page of a recap open, folded or unfolded (by its key: row_fold)
export function view_fold(s: Shown, key: string): void {
  toggle(s.folds, key);
}

// an item of a run opened or shut, alone (by its key: Item's)
export function view_item(s: Shown, key: string): void {
  toggle(s.items, key);
}

// a run's items all shown, or CALLS of them again (by its key: row_key)
export function view_more(s: Shown, id: number): void {
  toggle(s.mores, id);
}

// a recap opened or closed (by its key: row_key)
export function view_toggle(s: Shown, id: number): void {
  toggle(s.acts, id);
}

// a key put in a set, or taken out if it was there
function toggle<T>(set: Set<T>, key: T): void {
  if (!set.delete(key)) {
    set.add(key);
  }
}

// the key of a run of work led by a row: its message's id; a thought's
// (no id: never logged), from the message it follows, below -1 (-2 after
// message 0), so it holds as the run's first call arrives and no two
// runs share one
function row_key(row: Row): number {
  return row.$ === "Cap" || row.$ === "Fold" || row.$ === "Item" || row.$ === "More" ? -1 : row.id !== null ? row.id : row.$ === "Msg" && row.after !== undefined ? -2 - row.after : -1;
}

// whether a row is a recap's, whole or summed up
function row_recap(row: Row): boolean {
  return (row.$ === "Msg" || (row.$ === "Sum" && row.n === 1)) && row.kind === "recap";
}

// whether a row is work: a message of ACTIVITY's kinds, whole, summed up
// or opened alone
function row_busy(row: Row): boolean {
  switch (row.$) {
    case "Msg": {
      return ACTIVITY.includes(row.kind);
    }
    case "Sum": {
      return row.n === 1 && row.kind !== null && ACTIVITY.includes(row.kind);
    }
    case "Box": {
      return row.n === 1 && row.rows.length > 0 && row.rows.every(row_busy);
    }
    default: {
      return false;
    }
  }
}

// a run of work, said: its calls (row_call: those its items are)
// counted by tool (Claude Code's as illi's alike: ALIKE; one not read as
// `name {input}` by its first word; a summed-up one not known yet, as a
// tool used), then whether it thought, then the agents that reported
// (by name, a summed-up report's read off its message whole; not known
// yet, how many) (a run of results alone: that it got them)
function act_text(v: View, rows: Row[]): string {
  const flat  = rows.flatMap((r) => (r.$ === "Box" ? r.rows : [r]));
  const calls = new Map<string, number>();
  const who   = new Set<string>();
  let [mind, results, tools, reports] = [false, 0, 0, 0];
  for (const r of flat) {
    const call = row_call(v, r);
    const kind = r.$ === "Msg" ? r.kind : r.$ === "Sum" ? r.kind : null;
    const own  = call === null ? "" : call.name === "" ? /^\S*/.exec(call.head.trim())![0] : call.name;
    const name = call === null ? "" : call.from === "" ? ALIKE[own] ?? own : Call.call_tool(call);
    if (name !== "") {
      calls.set(name, (calls.get(name) ?? 0) + 1);
    }
    mind    ||= kind === "mind";
    results += kind === "echo" ? 1 : 0;
    tools   += kind === "tool" && call === null ? 1 : 0;
    const msg  = kind !== "work" ? undefined : r.$ === "Msg" ? r : r.$ === "Sum" ? sum_whole(v, r)?.find((x) => x.$ === "Msg") : undefined;
    if (msg?.$ === "Msg" && msg.who !== "" && msg.who !== WHO.work) {
      who.add(msg.who);
    } else if (kind === "work") {
      reports += 1;
    }
  }
  const used  = tools === 0 ? [] : [tools === 1 ? "used a tool" : "used " + tools + " tools"];
  const did   = [...[...calls].map(([name, n]) => (DID[name] === undefined ? "called " + (n === 1 ? name : name + " ×" + n) : DID[name][n === 1 ? 0 : 1].replace("#", String(n)))), ...used];
  const told  = who.size > 0 ? [...who].join(", ") + " reported" : reports === 0 ? "" : reports === 1 ? "an agent reported" : reports + " agents reported";
  const parts = [did.join(", "), mind ? "thought" : "", told].filter((x) => x !== "");
  const text  = parts.length > 0 ? parts.join(" · ") : results === 1 ? "got a result" : "got " + results + " results";
  const named = did.length === 0 && !mind && who.size > 0;
  return named ? text : text[0].toUpperCase() + text.slice(1);
}

// a result's text as logged, of a row (null: no result): a result's, its
// message whole even summed up (known by then: Chat.teach), the answers
// to illi's question (ANSWERED, shown as the user's). None follows a call
// logged alone: one stopped before it answered (Chat.unanswered: not run
// yet, or Claude Code's, cut off; illi's own tools answer a stop, as
// failed; an OpenAI web search left unfinished too), or an OpenAI web
// search logged before 0.3.1, which logged none (OpenAI.entries)
function row_echo(v: View, row: Row | undefined): string | null {
  return row?.$ === "Msg" ? (row.kind === "echo" ? row.text : row.kind === "user" && row.who === ANSWERS ? ANSWERED + row.text : null)
    : row?.$ === "Sum" && row.n === 1 && row.kind === "echo" ? v.whole.get(row.id)?.text ?? null
    : null;
}

// verbose (Ctrl+O): every run's items and every recap open, or none but
// those opened alone; what clicks opened or shut, in the chat and on
// every agent's page, forgotten, so each shows as the mode says
export function view_verbose(v: View): void {
  v.verbose = !v.verbose;
  for (const s of [v, ...[...v.pages.values()].flatMap((p) => p.shown ?? [])]) {
    [s.acts, s.folds, s.items, s.mores].forEach((set: Set<unknown>) => set.clear());
  }
}

// the item of a run on the page shown holding a message (by its name:
// row_name, "#id": its call's, its result's, a thought's), opened or shut
// alone, as /open and /close ask: opened, it shows (kept: act_row; Ctrl+O
// on, its run made to show all its items, if its More line still counts
// it). Its key (an Item's, its mark's too); null: no such item there
export function view_reach(v: View, name: string, open: boolean): string | null {
  const find  = () => view_body(v).find((r): r is Row & { $: "Act" } => r.$ === "Act" && r.held.some(([n]) => n === name));
  const run   = find();
  const key   = run?.held.find(([n]) => n === name)?.[1];
  const shown = view_shown(v);
  if (run === undefined || key === undefined) {
    return null;
  }
  if ((v.verbose !== shown.items.has(key)) !== open) {
    toggle(shown.items, key);
  }
  if (open && !find()!.rows.some((r) => r.$ === "Item" && r.key === key)) {
    toggle(shown.mores, run.id);
  }
  return key;
}

// the chat's parts given, in order, as rows each
export function view_rows(v: View, parts: Part[]): Row[][] {
  return parts.map(([id, n]) => part_rows(v, id, n, v.turn, true));
}

// what streams on the page shown, or what the turn waits on (unless the
// screen says it otherwise: caption false)
export function view_tail(v: View, caption = true): Row[] {
  const live = view_stream(v);
  if (v.page === null && v.fold !== null) {
    return [];
  }
  const shown = v.page !== null || v.verbose ? live : live.filter((l) => !ACTIVITY.includes(l.kind) || entry_answer(l.kind, l.text));
  const rows  = shown.flatMap(live_rows);
  if (v.page !== null || rows.length > 0 || v.wait === "" || !caption) {
    return rows;
  }
  return [Cap(v.wait === SUMMARIES ? SUMS : v.wait === COMPACTING ? RECAPS : "waiting for " + v.wait + "…")];
}

// what streams on the page shown
export function view_stream(v: View): Live[] {
  return v.page === null ? v.live : v.page.live;
}

// the chat, each agent at work, and the page shown while its agent is
// done (so it can be left: the tabs were the way back, and hid)
export function view_tabs(v: View): Tab[] {
  const at    = v.page === null ? null : v.page.name;
  const names = at === null || v.agents.includes(at) ? v.agents : [...v.agents, at];
  return [null, ...names].map((name) => {
    const here = name === at;
    const mark = here ? GLYPH.here : GLYPH.tab;
    return { name, here, mark, text: mark + " " + (name ?? v.agent ?? MAIN), agent: name?.replace(/-\d+$/, "") ?? v.agent ?? MAIN };
  });
}

export function view_typing(v: View): boolean {
  return v.page === null;
}

export function view_running(v: View): boolean {
  return v.busy || v.agents.length > 0;
}

// what runs, in words; null: nothing. A turn: a question the user is
// asked, else the last thing streaming (a tool's call: its tool;
// thinking; the reply), else what it waits on. No turn: the agents
// waited on. Its tokens, as many as the characters streamed make (about
// CHARS each); its rate, those of the RATE ms before the last STEP's
// start, a second's share (so it holds a STEP)
export function view_doing(v: View, now = Date.now()): Doing | null {
  if (!view_running(v)) {
    return null;
  }
  const last   = v.live[v.live.length - 1];
  const call   = last?.kind === "tool" ? Call.call_parse(last.text) : null;
  const tokens = Math.round(v.made / CHARS);
  const end    = Math.floor(now / STEP) * STEP;
  const recent = v.flow.reduce((n, [at, chars]) => (at > end - RATE && at <= end ? n + chars : n), 0);
  const rate   = Math.round(recent / CHARS / (RATE / 1000));
  const verb   =
    !v.busy ? "Waiting on agents"
    : v.asks.length > 0 ? "Waiting for your answer"
    : v.wait === COMPACTING ? "Compacting the chat"
    : call !== null ? ("Running " + call.name).trim()
    : last?.kind === "mind" ? "Thinking"
    : last?.kind === "illi" ? "Writing"
    : v.wait === SUMMARIES ? "Summarizing earlier messages"
    : v.wait !== "" ? "Waiting for " + v.wait
    : "Working";
  return { verb, tokens, rate };
}

// the pick as last asked for and not acked yet, else the chat's (null:
// none told yet)
export function view_asked(v: View): Pick | null {
  return v.out.flatMap((p) => (p.msg.$ === "pick" ? [p.msg.to] : [])).at(-1) ?? v.pick;
}

// the pick's parts, as the last line shows them: as it runs (fit: an
// effort or speed its model lacks, the nearest it has; the standard
// speed: no text)
export function view_pick(v: View): Knob[] {
  if (v.pick === null) {
    return [];
  }
  const { vendor, model, effort, speed } = Pick.fit(v.pick);
  return [
    { text: model, move: "model", hint: model + " on " + vendor },
    { text: effort, move: "effort", hint: effort + " effort: how long it thinks first; more is smarter and slower" },
    { text: speed === "slow" ? "" : speed, move: "speed", hint: Pick.speed(speed) },
  ];
}

// the chat's messages: to the end of the last part shown, and every one
// before the first shown whole (the turn's: all of them after a /clear,
// the screen empty)
export function view_count(v: View): number {
  return v.parts.reduce((end, [id, n]) => Math.max(end, id + n), v.turn);
}

function view_learn(v: View, pack: Pack): void {
  for (const [key, node] of Object.entries(pack.nodes ?? {})) {
    v.nodes.set(key, node);
  }
  for (const [id, entry] of Object.entries(pack.whole ?? {})) {
    v.whole.set(Number(id), entry);
  }
}

// a message: on its agent's page (its log's first: a new agent so named,
// the page starts anew), in illi's chat, or, a thought (not logged),
// after the last message
function view_entry(v: View, msg: Server & { $: "entry" }): void {
  const { $, agent, id, ...entry } = msg;
  const last = v.parts[v.parts.length - 1];
  if (agent !== undefined) {
    const page = v.pages.get(agent);
    if (Array.isArray(page?.log)) {
      page.log.splice(0, id === 0 ? page.log.length : 0);
      page.log.push(entry);
      page.shown = id === 0 ? undefined : page.shown;
    }
  } else if (id !== undefined) {
    v.whole.set(id, entry);
    v.parts.push([id, 1]);
  } else if (msg.kind === "mind" && last !== undefined) {
    const at = last[0] + last[1] - 1;
    v.minds.set(at, [...(v.minds.get(at) ?? []), msg.text]);
  }
}

// null: a page not asked for
function view_live(v: View, agent: string | undefined): Live[] | null {
  if (agent === undefined) {
    return v.live;
  }
  return v.pages.get(agent)?.live ?? null;
}

// Link
// ====
// A view's end of the chat, in this process (Chat.link). Each act has an
// id and is kept till answered (its ack); those made before the chat was
// first shown go once it is. An act with a body goes as a post.

export function link_open(v: View, link: Link): void {
  const pipe = link.open();
  // sends, in order, the acts not sent yet
  function flush(): void {
    for (const post of v.up ? v.out.filter((p) => !p.sent) : []) {
      post.sent = true;
      if ("body" in post.msg) {
        void upload(post);
      } else {
        pipe.send(JSON.stringify(post.msg));
      }
    }
  }
  async function upload(post: Post): Promise<void> {
    const { body, ...rest } = post.msg as any;
    const out = await Promise.try(async () => link.post(rest, await body())).catch((err): Answer => ({ error: String(err?.message ?? err) }));
    link.hear({ $: "ack", id: post.msg.id, ...out });
  }
  [v.ws, v.flush] = [pipe, flush];
  pipe.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    const join = msg.$ === "view" && !v.up;
    v.up ||= join;
    link.hear(msg);
    if (join) {
      flush();
    }
  };
}

// an act, kept until answered; by default a refusal is a note
export function link_send(v: View, msg: Client, done = (a: Answer) => link_note(v, a)): void {
  v.out.push({ msg: { id: crypto.randomUUID(), ...msg }, sent: false, done });
  v.flush();
}

export function link_note(v: View, a: Answer): void {
  if (a.error !== undefined) {
    v.notes.push(a.error);
  }
}

// Part
// ====

// a block's name, as /open and /close take it: its first message's id,
// then its size past 1x
export function block_name(id: number, n: number): string {
  return "#" + id + (n === 1 ? "" : "+" + n);
}


// t: the turn; talk: whether talk opens by itself (not in Fold all). Open:
// the person's choice (Open, Shut) if made, else a message of the user or
// illi (tool calls, reports and the rest stay folded)
function part_rows(v: View, id: number, n: number, t: number, talk: boolean): Row[] {
  const key   = id + "+" + n;
  const entry = v.whole.get(id);
  const half  = n / 2;
  if (n === 1 && id >= t && entry !== undefined) {
    const minds = v.minds.get(id) ?? [];
    const after = minds.flatMap((x, nth) => entry_rows(null, "mind", x).map((row) => ({ ...row, after: id, nth })));
    return [...whole_rows(id, entry), ...after];
  }
  const open  = talk && n === 1 && ["user", "illi"].includes(entry?.kind ?? "");
  if (!(v.open.get(key) ?? open)) {
    return sum_rows(id, n, v.nodes.get(key), n === 1 ? v.whole.get(id)?.kind : undefined);
  }
  if (open && v.open.get(key) === undefined && entry !== undefined) {
    return whole_rows(id, entry);
  }
  if (n > 1) {
    const rows = [...part_rows(v, id, half, t, talk), ...part_rows(v, id + half, half, t, talk)];
    return [{ $: "Box", id, n, rows }];
  }
  const rows = entry === undefined ? [] : whole_rows(id, entry);
  return [{ $: "Box", id, n, rows }];
}

// a message's rows, or a summary's block, made once: neither changes once
// known, so a redraw remakes only the rows that changed
const ROWS = new WeakMap<Entry | Node, Row[]>();

function whole_rows(id: number | null, entry: Entry): Row[] {
  const rows = ROWS.get(entry) ?? entry_rows(id, entry.kind, entry.text, entry.images, entry.date);
  ROWS.set(entry, rows);
  return rows;
}

// a block whose summary isn't known yet says WAIT; one message's kind,
// if not known, read off its line
function sum_rows(id: number, n: number, node: Node = { text: WAIT, to: "" }, kind?: Kind): Row[] {
  const said = n === 1 ? (KINDED.exec(node.text)?.[1] as Kind | undefined) : undefined;
  const rows = ROWS.get(node) ?? [{ $: "Sum", id, n, text: node.text, call: sum_call(n, node.text, node.to), kind: kind ?? said ?? null }];
  ROWS.set(node, rows);
  return rows;
}

// Page
// ====

// an agent's page: its name and whether it works, then its log (once it
// comes), each message keyed by its place in it, the work in runs as the
// chat's (view_acts, as the clicks on this page say: view_shown), its
// last run at work while the agent is
export function page_rows(v: View, page: Page): Row[] {
  const work = v.agents.includes(page.name);
  const head = Cap(page.name + (work ? " · at work" : " · done"));
  const rows = (page.log ?? []).flatMap((e, k) => whole_rows(k, e));
  return [head, ...view_acts(v, rows, page_shown(page), work)];
}

// Live
// ====

// a piece joins the message streaming, if of its kind, unless it starts
// one (fresh: a tool call, as two calls never join)
export function live_push(live: Live[], kind: Kind, text: string, fresh = false): void {
  const top = live[live.length - 1];
  if (top !== undefined && top.kind === kind && !fresh) {
    top.text += text;
  } else {
    live.push({ kind, text });
  }
}

// what streams, as rows: a message's made again only as its text grows,
// so a paint lays out anew only the one still streaming (Paint.ts)
const LIVE = new WeakMap<Live, { text: string; rows: Row[] }>();

function live_rows(l: Live): Row[] {
  const known = LIVE.get(l);
  if (known?.text === l.text) {
    return known.rows;
  }
  const rows = entry_rows(null, l.kind, l.text);
  LIVE.set(l, { text: l.text, rows });
  return rows;
}

// the whole stream, told anew (a view joining, a call's entry): one that
// goes on with the stream held extends it in place, each message staying
// the one it was, as after a reconnect; another replaces it
function live_set(live: Live[], now: Live[]): void {
  const goes = live.every((l, k) => now[k]?.kind === l.kind && now[k].text.startsWith(l.text));
  const held = goes ? live : [];
  const next = now.map((l, k) => (k < held.length ? Object.assign(held[k], l) : l));
  live.splice(0, live.length, ...next);
}

// the call a line of one message holds, when the line is a tool call
// word for word (the compactor keeps a short message as it is), made
// when that message was (date)
function sum_call(n: number, text: string, date: string): Call.Call | null {
  const call = n === 1 && text.startsWith(TOOL) ? Call.call_parse(text.slice(TOOL.length), when(date)) : null;
  return call === null || call.name === "" ? null : call;
}

// a message's date as ms (none, or not one: now)
function when(date: string | undefined): number {
  const at = date === undefined ? NaN : Date.parse(date);
  return Number.isNaN(at) ? Date.now() : at;
}

// Image
// =====

// an image's kind by its first HEAD bytes (each kind's mark, at its
// byte); null: none of them. Said as IMAGES where one is refused.
export function image_kind(head: Uint8Array): string | null {
  const text = String.fromCharCode(...head.subarray(0, HEAD));
  return MARKS.find(([, at, mark]) => text.slice(at, at + mark.length) === mark)?.[0] ?? null;
}

// Entry
// =====

// a message's row (none: nothing to show); illi's reply is drawn from its
// text (Reply.ts), so only whether it has any is asked, never its blocks
// (a reply streaming would be parsed at every paint). The answers to
// illi's question show as the user's words, framed so, named. A tool
// call reads as of its date (none: now; Call.call_parse)
export function entry_rows(id: number | null, kind: Kind, text: string, images: string[] = [], date?: string): Row[] {
  if (entry_answer(kind, text)) {
    const said = text.slice(ANSWERED.length);
    return [{ $: "Msg", id, kind: "user", who: ANSWERS, text: said, body: Md.md_plain(said), call: null, images }];
  }
  const call = kind === "tool" ? Call.call_parse(text, when(date)) : null;
  const report = kind === "work" ? Call.report_read(text) : null;
  const plain = kind === "user" || kind === "work" || kind === "echo";
  const body = call === null && plain ? entry_body(kind, report?.text ?? text) : [];
  const who = report === null ? WHO[kind] ?? "" : report.name;
  const none = call === null && (plain ? body.length === 0 : text.trim() === "");
  return none && images.length === 0 ? [] : [{ $: "Msg", id, kind, who, text, body, call, images }];
}

// whether a message is the answers to illi's question (ANSWERED)
export function entry_answer(kind: Kind, text: string): boolean {
  return kind === "echo" && text.startsWith(ANSWERED);
}

// a person's words (the user's, a report) as typed; a result as a file's
// lines (Md.md_output: the <history> line recall appended never drawn),
// a failed one's FAILED kept (only its call's mark leaves it out:
// row_marked); the rest, markdown, draw from their text: Paint.ts
function entry_body(kind: Kind, text: string): Md.Block[] {
  return kind === "echo" ? Md.md_output(text) : Md.md_plain(text);
}
