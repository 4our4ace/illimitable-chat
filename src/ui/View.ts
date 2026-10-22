// View
// ====
// What a view of the chat holds and draws (Term.ts): `view_hear` takes
// the chat's messages, `view_act` the person's acts, and both answer what
// to send (by the Link). The main chat shows what its agent sees (Chat.ts): the
// view's parts as blocks ("nx"), from the turn on each message whole
// (0x) and its thoughts, then what streams or what the turn waits on. The
// work between the person's words and illi's (tool calls, their results,
// thinking, the agents' reports: ACTIVITY) shows as one line per run
// (an "Act" row: what was done, counted), opened by a click or all at
// once (verbose: Ctrl+O); while closed, what streams of it shows only on
// the line over the input (Term.ts). An agent's page is its log, kept
// live, whole.

import type { Kind, Vendor } from "../ai/AskAI.ts";
import * as Call from "./Call.ts";
import * as Md from "./Md.ts";
import { LABELS, type Move, Pick } from "../ai/Pick.ts";
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

// log: null while it loads
export type Page = { name: string; log: Entry[] | null; live: Live[] };

// what a turn waits on while nothing streams: nothing (""), SUMMARIES,
// or the first piece of the model it names (a request out, no tool
// running; a running tool shows its call)
export const SUMMARIES = "summaries";
export type Wait = string;

// what runs, in words (view_doing): the step it is at, about how many
// tokens the models have written since work began (made), and how fast
// they write now (tokens a second, over the last RATE ms; 0: nothing
// streams)
export type Doing = { verb: string; tokens: number; rate: number };

// a plan's rate limit, as its last response told it (ChatGPT.ts): its
// window (minutes), the share of it used (%), when it starts anew (ms)
export type Limit = { window: number; used: number; reset: number };

// how full the chat a turn sends is (tokens), the most it holds before
// its oldest messages fold into the tree, its model's window
export type Fill = { used: number; cap: number; window: number };

// a plan, as its vendor tells it (ChatGPT.ts told): whose it is
// (ChatGPT), which one (plus, pro…; "": not known), its limits (none:
// not told)
export type Plan = { brand: string; tier: string; limits: Limit[] };

// what the main agent's calls use: the plan of the vendor picked (null:
// none told, or a vendor that tells none); how full the chat is (null:
// not told yet)
export type Use = { plan: Plan | null; fill?: Fill | null };

// an item of illi's to-do list (Tools.ts todo): what to do, how it stands
export type Todo = { text: string; status: "pending" | "active" | "done" };

// a question the chat asks the user, answered by a view: who asks
// (illi, an agent), the tool, what it would do: Claude Code asking leave
// to use a tool (Tools.ts approve); or illi's own (ask: its queries, one
// or more, answered at once)
export type Question = { id: string; who: string; tool: string; what: string; queries?: Query[] };

// one of illi's questions: what it asks, its tab's label, the options it
// offers, whether several may be picked
export type Query = { text: string; head: string; options: Option[]; multi: boolean };

// an option a query offers: its label, what it means ("": none)
export type Option = { label: string; about: string };

// the answers to illi's question, as the model gets them (Chat.ts): this,
// then each query and what was said to it. The view shows them as the
// user's, not as work (entry_rows)
export const ANSWERED = "The user answered at illi's screen:\n";

// agents: those at work; agent: the main agent (null: illi's own);
// vendors and models: those offered; use: what its calls use; todo:
// illi's to-do list; suggest: the user's likely next message, asked as
// the last turn ended (Chat.suggest; "": none); asks: the questions
// waiting for an answer, the first shown
export type State = {
  busy    : boolean;
  wait    : Wait;
  agents  : string[];
  pick    : Pick | null;
  agent   : string | null;
  vendors : Vendor[];
  models  : string[];
  use     : Use;
  todo    : Todo[];
  suggest : string;
  asks    : Question[];
};

// fold: the tops shown (null: not folded); nodes and whole: the summaries
// ("id+n") and messages known; open: the blocks opened (true) or shut by
// hand; acts: the runs of work opened (by their first message's id),
// verbose: all of them; minds: the thoughts after each message; pages: the agents' asked
// for; page: the one shown (null: illi's); made: the characters the
// models streamed (replies, thoughts, calls) since work began; flow:
// the last RATE ms of them (when, how many); the Link's: acts not
// answered, the pipe (up: it showed the chat), what sends those not sent
export type View = State & {
  parts : Part[];
  turn  : number;
  fold  : Part[] | null;
  nodes : Map<string, Node>;
  whole : Map<number, Entry>;
  open  : Map<string, boolean>;
  acts  : Set<number>;
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
  | ({ $: "state" } & State)
  | { $: "agent"; name: string; found: boolean }
  | { $: "note"; text: string }
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
  | { $: "compact" } // all but the last exchanges fold into the view, still shown (/compact)
  | { $: "pick"; to: Pick }
  | { $: "main"; name: string | null } // the main agent (/agent), or illi's own
  | { $: "zoom"; part: Part }
  | { $: "root" }
  | { $: "agent"; name: string }
  | { $: "answer"; ask: string; yes: boolean; always: boolean; said?: string }; // a question (State asks, its id) answered; said: a no's reason, or the answer to illi's own

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
  | { $: "Stop" }                               // Esc twice, Ctrl+C: illi's turn interrupted (none running: nothing)
  | { $: "Move"; move: Move; to?: string }      // the pick moves (to: to that value)
  | { $: "Pick"; to: Pick }                     // the pick set whole (the /model picker)
  | { $: "Open"; id: number; n: number }        // a click on a block
  | { $: "Shut"; id: number; n: number }        // a click on an open block's bar
  | { $: "Fold"; on: boolean }                  // fold all, unfold all
  | { $: "Goto"; name: string | null }          // a tab, a name, the logo (null: illi)

// what a page draws, top to bottom
export type Row =
  | { $: "Sum"; id: number; n: number; text: string; call: Call.Call | null; kind: Kind | null }  // a block: nx, its summary (as written: drawn flat, Paint.ts; call: a tool call's, word for word; kind: its message's, of one known)
  | { $: "Box"; id: number; n: number; text: string; rows: Row[] }                              // a block open: its bar
  | { $: "Act"; id: number; text: string; open: boolean; rows: Row[] }                         // a run of work (ACTIVITY), from message id: what was done, its rows if open
  | { $: "Msg"; id: number | null; kind: Kind; who: string; text: string; body: Md.Block[]; call: Call.Call | null; images: string[] } // a message whole: 0x (who: its speaker or "↳ result", named on its block; body: its blocks, none for illi's (drawn from its text); call: a tool call's, drawn as Call.ts reads it)
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
const KINDED   = /^(user|illi|tool|echo|mind|note|work): /;

// the name on the answers to illi's question
const ANSWERS = "your answers";

// what a run's tool calls did, by tool: one, many (the rest: "called")
const DID: Record<string, [string, string]> = {
  shell : ["ran a command", "ran # commands"],
  read  : ["read a file", "read # files"],
  write : ["wrote a file", "wrote # files"],
  edit  : ["edited a file", "edited # files"],
  spawn : ["started an agent", "started # agents"],
  tell  : ["messaged an agent", "messaged # agents"],
  zoom  : ["looked back", "looked back # times"],
  date  : ["checked the date", "checked the date # times"],
  skill : ["used a skill", "used # skills"],
  todo  : ["updated the to-do list", "updated the to-do list # times"],
};

// Constructors
// ============

export function Cap(text: string): Row {
  return { $: "Cap", text };
}

// View
// ====

export function view_new(): View {
  return {
    busy      : false,
    wait      : "",
    agents    : [],
    pick      : null,
    agent     : null,
    vendors   : [],
    models    : LABELS,
    use       : { plan: null },
    todo      : [],
    suggest   : "",
    asks      : [],
    parts     : [],
    turn      : Infinity,
    fold      : null,
    nodes     : new Map(),
    whole     : new Map(),
    open      : new Map(),
    acts      : new Set(),
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
        return [{ $: "compact" }];
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
      // model, effort and speed as one change, one note saying it; none
      // if it is the pick already
      const from = view_asked(v);
      const to   = Pick.read(act.to, v);
      if (to === null) {
        v.notes.push("No pick " + Pick.shown(act.to) + " here.");
        return [];
      }
      if (from !== null && Pick.label(from) === Pick.label(to)) {
        return [];
      }
      const vendor = v.vendors.length > 1 ? " (" + to.vendor + ")" : "";
      v.notes.push("Now on " + to.model + vendor + ", " + to.effort + " effort" + (to.speed === "slow" ? "" : ", " + to.speed) + ".");
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
      return v.busy ? [{ $: "stop", name: TURN }] : [];
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

export function view_body(v: View): Row[] {
  if (v.page !== null) {
    return page_rows(v, v.page);
  }
  if (v.fold !== null) {
    const tops = v.fold.flatMap(([id, n]) => part_rows(v, id, n, Infinity, false));
    return [Cap(FOLD), ...tops];
  }
  return view_acts(v, view_rows(v, v.parts).flat());
}

// rows with each run of work (ACTIVITY) one Act row
export function view_acts(v: View, rows: Row[]): Row[] {
  const out: Row[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (!row_busy(row)) {
      out.push(row);
    } else if (last?.$ === "Act") {
      last.rows.push(row);
    } else {
      const id = row.$ === "Cap" || row.id === null ? -1 : row.id;
      out.push({ $: "Act", id, text: "", open: v.verbose || v.acts.has(id), rows: [row] });
    }
  }
  return out.map((row) => (row.$ === "Act" ? { ...row, text: act_text(row.rows) } : row));
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

// a run of work, said: its calls counted by tool, then whether it
// thought, then the agents that reported (a run of results alone: their
// count)
function act_text(rows: Row[]): string {
  const flat  = rows.flatMap((r) => (r.$ === "Box" ? r.rows : [r]));
  const calls = new Map<string, number>();
  const who   = new Set<string>();
  let [mind, results] = [false, 0];
  for (const r of flat) {
    const call = r.$ === "Msg" || r.$ === "Sum" ? r.call : null;
    const kind = r.$ === "Msg" ? r.kind : r.$ === "Sum" ? r.kind : null;
    if (call !== null && call.name !== "") {
      calls.set(call.name, (calls.get(call.name) ?? 0) + 1);
    }
    mind    ||= kind === "mind";
    results += kind === "echo" ? 1 : 0;
    if (kind === "work" && r.$ === "Msg" && r.who !== "") {
      who.add(r.who);
    }
  }
  const did   = [...calls].map(([name, n]) => (DID[name] === undefined ? "called " + (n === 1 ? name : name + " ×" + n) : DID[name][n === 1 ? 0 : 1].replace("#", String(n))));
  const parts = [did.join(", "), mind ? "thought" : "", who.size === 0 ? "" : [...who].join(", ") + " reported"].filter((x) => x !== "");
  const text  = parts.length > 0 ? parts.join(" · ") : results + (results === 1 ? " result" : " results");
  const named = did.length === 0 && !mind && who.size > 0;
  return named ? text : text[0].toUpperCase() + text.slice(1);
}

// a run of work opened, or closed
export function view_toggle(v: View, id: number): void {
  if (v.acts.has(id)) {
    v.acts.delete(id);
  } else {
    v.acts.add(id);
  }
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
  return [Cap(v.wait === SUMMARIES ? SUMS : "waiting for " + v.wait + "…")];
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

// the pick's parts, as the last line shows them (the standard speed: no
// text)
export function view_pick(v: View): Knob[] {
  if (v.pick === null) {
    return [];
  }
  const { vendor, model, effort, speed } = v.pick;
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
    const log = v.pages.get(agent)?.log;
    if (Array.isArray(log)) {
      log.splice(0, id === 0 ? log.length : 0);
      log.push(entry);
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
    const after = minds.flatMap((x) => entry_rows(null, "mind", x));
    return [...whole_rows(id, entry), ...after];
  }
  const open  = talk && n === 1 && ["user", "illi"].includes(entry?.kind ?? "");
  if (!(v.open.get(key) ?? open)) {
    return sum_rows(id, n, v.nodes.get(key), n === 1 ? v.whole.get(id)?.kind : undefined);
  }
  if (open && v.open.get(key) === undefined && entry !== undefined) {
    return whole_rows(id, entry);
  }
  const text = n === 1 ? "fold" : GLYPH.open + " " + n + "x · fold";
  if (n > 1) {
    const rows = [...part_rows(v, id, half, t, talk), ...part_rows(v, id + half, half, t, talk)];
    return [{ $: "Box", id, n, text, rows }];
  }
  const rows = entry === undefined ? [] : whole_rows(id, entry);
  return [{ $: "Box", id, n, text, rows }];
}

// a message's rows, or a summary's block, made once: neither changes once
// known, so a redraw remakes only the rows that changed
const ROWS = new WeakMap<Entry | Node, Row[]>();

function whole_rows(id: number | null, entry: Entry): Row[] {
  const rows = ROWS.get(entry) ?? entry_rows(id, entry.kind, entry.text, entry.images);
  ROWS.set(entry, rows);
  return rows;
}

// a block whose summary isn't known yet says WAIT; one message's kind,
// if not known, read off its line
function sum_rows(id: number, n: number, node: Node = { text: WAIT, to: "" }, kind?: Kind): Row[] {
  const said = n === 1 ? (KINDED.exec(node.text)?.[1] as Kind | undefined) : undefined;
  const rows = ROWS.get(node) ?? [{ $: "Sum", id, n, text: node.text, call: sum_call(n, node.text), kind: kind ?? said ?? null }];
  ROWS.set(node, rows);
  return rows;
}

// Page
// ====

// an agent's page, its log (once it comes) from message `from` on
export function page_rows(v: View, page: Page, from = 0): Row[] {
  const head = Cap(page.name + (v.agents.includes(page.name) ? " · at work" : " · done"));
  return [head, ...(page.log ?? []).slice(from).flatMap((e) => whole_rows(null, e))];
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
// word for word (the compactor keeps a short message as it is)
function sum_call(n: number, text: string): Call.Call | null {
  const call = n === 1 && text.startsWith(TOOL) ? Call.call_parse(text.slice(TOOL.length)) : null;
  return call === null || call.name === "" ? null : call;
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
// illi's question show as the user's words, framed so, named
export function entry_rows(id: number | null, kind: Kind, text: string, images: string[] = []): Row[] {
  if (entry_answer(kind, text)) {
    const said = text.slice(ANSWERED.length);
    return [{ $: "Msg", id, kind: "user", who: ANSWERS, text: said, body: Md.md_plain(said), call: null, images }];
  }
  const call = kind === "tool" ? Call.call_parse(text) : null;
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
// lines (the rest, markdown, draw from their text: Paint.ts)
function entry_body(kind: Kind, text: string): Md.Block[] {
  return kind === "echo" ? Md.md_output(text) : Md.md_plain(text);
}
