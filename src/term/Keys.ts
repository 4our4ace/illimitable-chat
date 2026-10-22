// Keys
// ====
// A key, as Screen.ts reads it: the mouse's (Select.ts), the wheel, the
// keys of term_groups (Commands.ts), the key after the leader (its
// shortcut, before all else), and what the lists and panes over the chat
// take first (a picker searched, the text typed too); Enter (a skill
// named mid-message told), Esc, Ctrl+C and Ctrl+D, Tab (the suggested
// reply), Shift+Tab and the pages.

import { term_form_key, term_form_type } from "./Asks.ts";
import { Chat } from "../chat/Chat.ts";
import { term_after, term_chooser_find, term_command, term_commands, term_main, term_named, term_suggest, term_suggest_key } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { Custom } from "../config/Custom.ts";
import { term_draw } from "./Frame.ts";
import { term_note, term_toast, term_unnote } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import * as Screen from "../ui/Screen.ts";
import { term_copied, term_hover, term_mouse, term_selected, term_under } from "./Select.ts";
import { term_act, term_primaries, term_quit, type Chooser, type Cmd, type Term } from "./Term.ts";
import * as View from "../ui/View.ts";

// the editing keys a picker's search leaves to its rows: a new line, a
// line up or down
const ROWS = ["Up", "Down", "Shift+Enter", "Ctrl+J"];

// the keys that leave text chosen (any other lets it go)
const KEEP   = ["", "Canvas", "Press", "Drag", "Release", "RightPress", "RightDrag", "RightRelease", "WheelUp", "WheelDown", "Esc", "PgUp", "PgDn", "Ctrl+Home", "Ctrl+End"];

// how soon a second Ctrl+C quits (ms)
const AGAIN = 2000;

// the lines a turn of the wheel scrolls
const WHEEL = 3;

// the commands by their keys (term_keyed), made at the first key, again
// once the leader changes: only illi's own have keys (the user's commands
// and skills are typed), and the rest never change
let keyed: { leader: string; cmds: Map<string, Cmd> } | null = null;

// a key ("": the input may have changed): the mouse (a click lets the
// leader go), the wheel, the terminal's background told (the chat laid
// out anew: diagrams draw over it), or its line of term_groups. Text chosen is let go at a key not KEEP's
// or at typing; Ctrl+C copies it again instead. Text in the input
// dismisses the suggested reply
export function term_press(t: Term, key: string): void {
  if (key === "Move") {
    term_hover(t);
    return;
  }
  if (key === "Press" || key === "RightPress") {
    t.lead = false;
  }
  if (t.scr.ed.text !== "") {
    t.dropped = t.v.suggest;
  }
  const cmd    = term_keyed(key);
  const chosen = key === "Ctrl+C" && t.sel?.moved === true && !t.sel.held ? term_selected(t) : null;
  if (t.scr.typed || !KEEP.includes(key)) {
    t.sel = null;
  }
  t.scr.typed = false;
  if (key === "Canvas" && t.scr.canvas !== undefined) {
    if (Paint.paint_canvas(t.scr.canvas)) {
      t.ver += 1;
    }
  } else if (["Press", "Drag", "Release", "RightPress", "RightDrag", "RightRelease"].includes(key)) {
    term_mouse(t, key);
  } else if (chosen !== null) {
    term_copied(t, chosen);
  } else if (key === "WheelUp" || key === "WheelDown") {
    t.scroll = Math.max(0, t.scroll + (key === "WheelUp" ? WHEEL : -WHEEL));
  } else if (cmd !== undefined) {
    cmd[3](t, cmd[0] === "" ? key : "");
  }
  term_draw(t);
}

// the command a key runs, if any: the first whose keys name it
function term_keyed(key: string): Cmd | undefined {
  if (keyed?.leader !== config.LEADER) {
    const pairs = term_commands().flatMap((c) => (c[1] === "" ? [] : c[1].split(", ").map((k): [string, Cmd] => [k, c])));
    keyed = { leader: config.LEADER, cmds: new Map(pairs.reverse()) };
  }
  return keyed.cmds.get(key);
}

// a key after the leader: its shortcut's (term_after; the wheel lets the
// leader go and scrolls). A key while the commands suggested show, the
// picker, illi's question or a pane is open: theirs first (true: taken).
// The commands move by Up
// and Down, fill one in by Tab, run it by Enter; the picker as
// term_choose_key; the question as Asks.ts says; a pane scrolls by the
// arrows, the pages and the wheel, Esc and Enter close it, and no
// editing key reaches the input hidden under it
export function term_grab(t: Term, key: string): boolean {
  if (t.lead) {
    if (key === "WheelUp" || key === "WheelDown") {
      t.lead = false;
      return false;
    }
    term_after(t, key);
    return true;
  }
  if (t.choose === null && term_form_key(t, key)) {
    return true;
  }
  const sug = term_suggest(t);
  if (sug !== null && term_suggest_key(t, sug, key)) {
    return true;
  }
  if (t.choose !== null) {
    return term_choose_key(t, t.choose, key);
  }
  if (t.pane === null) {
    return false;
  }
  const page = Math.max(1, t.seen.tall - 2);
  const move = ({ Up: -1, Down: 1, PgUp: -page, PgDn: page, WheelUp: -WHEEL, WheelDown: WHEEL, "Ctrl+Home": -Infinity, "Ctrl+End": Infinity } as Record<string, number>)[key];
  const shut = key === "Esc" || key === "Enter";
  if (move !== undefined) {
    t.pane.scroll = Math.max(0, t.pane.scroll + move);
  }
  if (shut) {
    t.pane = null;
  }
  return move !== undefined || shut || Screen.ed_key(Screen.ed_new(), key);
}

// a key to the picker (true: taken): the lit option's own first (the
// model picker's effort and speed); then Up and Down (or Tab) move round
// the options shown, Enter picks the lit one (none matching the search:
// nothing; a line asked for: given, the box kept with a reason if it
// won't do), Esc and Ctrl+C close (Ctrl+C neither interrupts nor quits
// here), and the search takes the input's editing keys (but its rows')
function term_choose_key(t: Term, c: Chooser, key: string): boolean {
  const n    = c.shown.length;
  const lit  = c.shown[c.at]?.k;
  const move = ({ Up: -1, "Shift+Tab": -1, Down: 1, Tab: 1 } as Record<string, number>)[key];
  if (lit !== undefined && c.keys(lit, key)) {
    return true;
  }
  if (key === "Enter" && c.ask !== null) {
    t.choose  = null;
    const why = c.ask.done((c.find?.text ?? "").trim());
    if (why !== null) {
      t.choose = c;
      c.foot   = () => why;
    }
    return true;
  }
  if (move !== undefined) {
    c.at = n === 0 ? 0 : (c.at + move + n) % n;
  } else if (key === "Enter" && lit !== undefined) {
    t.choose = null;
    c.pick(lit);
  } else if (key === "Esc" || key === "Ctrl+C") {
    t.choose = null;
  } else if (c.find !== null && !ROWS.includes(key) && Screen.ed_key(c.find, key)) {
    term_chooser_find(c);
  } else if (key !== "Enter") {
    return false;
  }
  return true;
}

// text typed after the leader: its first character the shortcut's key,
// the rest as typed after it; while the picker searches: to its search,
// not the input; while illi asks, to its question (Asks.ts); over a pane,
// to the input, the pane closed
export function term_type(t: Term, text: string): boolean {
  const c = t.choose;
  if (t.lead) {
    const ch   = [...text][0];
    const rest = text.slice(ch.length);
    term_after(t, ch);
    if (rest !== "" && !term_type(t, rest)) {
      Screen.ed_type(t.scr.ed, rest);
      t.scr.typed = true;
    }
    return true;
  }
  if (c === null && t.pane !== null) {
    t.pane = null;
  }
  if (c === null || c.find === null) {
    return c === null && term_form_type(t, text);
  }
  Screen.ed_type(c.find, text);
  term_chooser_find(c);
  return true;
}

// a click: what was drawn there does its own (the side, the picker, the
// tabs, a reply's button copies); in the chat, a run of work opens or
// closes, a block opens, an open one's top edge shuts it; outside the
// picker, it closes
export function term_click(t: Term): void {
  const { row, col } = t.scr.click;
  const hit  = t.hits.find((h) => h.row === row && col >= h.col && col < h.to);
  const s    = t.seen;
  const line = s.first + row - s.row;
  const mark = row >= s.row && row < s.row + s.tall && col >= s.col && col < s.end ? s.marks.find((m) => m.from <= line && line < m.to) : undefined;
  const copy = term_under(t, t.scr.click);
  if (hit !== undefined) {
    hit.run();
  } else if (copy !== undefined) {
    term_copied(t, copy());
  } else if (t.choose !== null) {
    t.choose = null;
  } else if (t.pane === null && mark?.act === true) {
    View.view_toggle(t.v, mark.id);
    t.ver += 1;
  } else if (t.pane === null && mark !== undefined) {
    term_act(t, { $: mark.open ? "Shut" : "Open", id: mark.id, n: mark.n });
  }
}

// Ctrl+O: every run of work shown whole, or each one line again
export function term_verbose(t: Term): void {
  t.v.verbose = !t.v.verbose;
  t.ver += 1;
}

// PgUp, PgDn: a page up, down; Ctrl+Home, Ctrl+End: the chat's top, its
// end (the paint holds the scroll inside the chat)
export function term_page(t: Term, key: string): void {
  const page = Math.max(1, t.seen.tall - 2);
  const to: Record<string, number> = { PgUp: t.scroll + page, PgDn: t.scroll - page, "Ctrl+Home": Infinity, "Ctrl+End": 0 };
  t.scroll = Math.max(0, to[key] ?? t.scroll);
}

// Enter: runs a command, or sends the input, its pastes' text in place
// of their tokens and the images it names (the chat shown from its end,
// the notes gone); empty, it interrupts illi's turn, on any page; text
// not sent stays (it was lost: an unknown /word)
export function term_enter(t: Term): void {
  const typed = Screen.ed_take(t.scr.ed);
  const text  = Screen.ed_expand(t.scr.ed, typed);
  t.pane = null;
  if (term_command(t, text) || (text.trim() !== "" && term_away(t, text, typed))) {
    return;
  }
  if (term_act(t, { $: "Send", text: term_named(text), images: term_shots(t, text) }).length > 0) {
    term_unnote(t);
    t.scroll = 0;
    return;
  }
  Screen.ed_type(t.scr.ed, typed);
}

// a message for illi (or /goal, /halt, /clear, /compact, the user's
// commands and skills) sent from an agent's page: not sent, a note says
// where messages go, and the input has it back as typed (its tokens: a
// paste's text found in the history; none: text); true if so
export function term_away(t: Term, text: string, typed?: string): boolean {
  if (View.view_typing(t.v)) {
    return false;
  }
  term_note(t, "Messages go to illi: Ctrl+PgUp or /tab illi goes back.");
  if (t.scr.ed.text === "") {
    Screen.ed_type(t.scr.ed, typed ?? t.scr.ed.hist.findLast((h) => Screen.ed_expand(t.scr.ed, h) === text) ?? text);
  }
  return true;
}

// the images a text names by their tokens, each once
export function term_shots(t: Term, text: string): Blob[] {
  return [...new Set(Screen.ed_images(text))].flatMap((n) => t.imgs.get(n) ?? []);
}

// the suggested reply the input shows, dim: the chat's, while the input
// is empty on illi's page and nothing typed dismissed it; "": none
export function term_hint(t: Term): string {
  const shown = t.v.suggest !== "" && t.v.suggest !== t.dropped && t.scr.ed.text === "" && View.view_typing(t.v);
  return shown ? t.v.suggest : "";
}

// Tab: the suggested reply shown, put in the input (not sent: Enter sends
// it); none shown, nothing
export function term_take(t: Term): void {
  const hint = term_hint(t);
  if (hint !== "") {
    Screen.ed_set(t.scr.ed, hint);
    t.scr.typed = true;
  }
}

// Esc: the notes cleared; while illi's turn runs, it says Esc again
// interrupts it, and a second within AGAIN does, so a stray one never
export function term_esc(t: Term): void {
  term_unnote(t);
  if (!t.v.busy) {
    return;
  }
  if (Date.now() - t.esc < AGAIN) {
    t.esc = 0;
    term_act(t, { $: "Send", text: "" });
    return;
  }
  t.esc = Date.now();
  term_toast(t, "Esc again to interrupt", AGAIN);
}

// Ctrl+C or Ctrl+D: clears the input; on an empty one, Ctrl+C interrupts
// illi's turn and says how to quit, a second within AGAIN quits; Ctrl+D
// quits
export function term_clear(t: Term, key: string): void {
  if (t.scr.ed.text !== "") {
    Screen.ed_take(t.scr.ed);
  } else if (key === "Ctrl+D" || Date.now() - t.quit < AGAIN) {
    term_quit(t);
  } else {
    t.quit = Date.now();
    term_act(t, { $: "Send", text: "" });
    term_toast(t, "Ctrl+C again to quit · what runs stops, and goes on at the next start", AGAIN);
  }
}

// Shift+Tab: illi runs as the next primary agent that can run (illi's own
// among them), after the one asked for last if not answered yet; one that
// can't run any more goes back to illi's own; none to go to, a note says
// why
export function term_next(t: Term): void {
  term_primaries(t);
  const names = [null, ...t.agents.filter((a) => typeof Chat.own(a) !== "string").map((a) => a.name)];
  const asked = t.v.out.flatMap((p) => (p.msg.$ === "main" ? [p.msg.name] : []));
  const now   = asked.length > 0 ? asked[asked.length - 1] : t.v.agent;
  if (names.length === 1 && now === null) {
    return term_note(t, t.agents.length === 0 ? Custom.primaries_said(process.cwd()) : "None of your primary agents can run here: " + Chat.own(t.agents[0]) + ".");
  }
  term_main(t, names[(names.indexOf(now) + 1) % names.length]);
}

// Ctrl+PgDn, Ctrl+PgUp: the next page, the one before
export function term_cycle(t: Term, key: string): void {
  const tabs = View.view_tabs(t.v);
  const at   = tabs.findIndex((tab) => tab.here) + (key === "Ctrl+PgUp" ? tabs.length - 1 : 1);
  term_act(t, { $: "Goto", name: tabs[at % tabs.length].name });
}
