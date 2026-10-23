// Keys
// ====
// A key, as Screen.ts reads it: the mouse's (Select.ts), the wheel, the
// keys of term_groups (Commands.ts), the key after the leader (its
// shortcut, before all else), and what takes keys first: a popup open
// (Popup.ts: a list, illi's questions) every key but PASS's, so none
// reaches the chat, a pane, the input or the commands suggested under it
// (its search or words the text typed too); then the commands suggested
// and a pane; Enter (a skill named mid-message told), Esc, Ctrl+C and
// Ctrl+D, Tab (the suggested reply), Shift+Tab and the pages.

import { term_form_key, term_form_type } from "./Asks.ts";
import { Chat } from "../chat/Chat.ts";
import { term_after, term_chooser_find, term_command, term_commands, term_main, term_named, term_suggest, term_suggest_key } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { Custom } from "../config/Custom.ts";
import { term_draw } from "./Frame.ts";
import { member_others } from "./Member.ts";
import { term_note, term_toast, term_unnote } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import { popup_form_wheel, popup_held, popup_mouse, popup_page, popup_wheel, term_popup } from "./Popup.ts";
import * as Screen from "../ui/Screen.ts";
import { term_copied, term_hover, term_mouse, term_selected, term_target, term_typing, term_wordy } from "./Select.ts";
import { term_act, term_primaries, term_quit, type Chooser, type Cmd, type Term } from "./Term.ts";
import * as View from "../ui/View.ts";

// the editing keys a picker's search leaves to its rows: a new line, a
// line up or down
const ROWS = ["Up", "Down", "Shift+Enter", "Ctrl+J"];

// the keys a popup leaves to what is under it: the screen drawn again,
// a suspend, the palette (in the popup's place), the leader (its own
// key: config.LEADER)
const PASS = ["Ctrl+L", "Ctrl+Z", "Ctrl+P"];

// the keys that leave text chosen (any other lets it go)
const KEEP   = ["", "Canvas", "Press", "Drag", "Release", "RightPress", "RightDrag", "RightRelease", "WheelUp", "WheelDown", "Esc", "PgUp", "PgDn", "Ctrl+Home", "Ctrl+End"];

// the mouse's reports, a popup's before all else
const MOUSE  = ["Move", "Press", "Drag", "Release", "RightPress", "RightDrag", "RightRelease"];

// how soon a second Ctrl+C quits (ms)
const AGAIN = 2000;

// the lines a turn of the wheel scrolls
const WHEEL = 3;

// the commands by their keys (term_keyed), made at the first key, again
// once the leader changes: only illi's own have keys (the user's commands
// and skills are typed), and the rest never change
let keyed: { leader: string; cmds: Map<string, Cmd> } | null = null;

// a key ("": the input may have changed): the mouse (a click lets the
// leader go; a popup's first: Popup.ts; a move, a press or a release
// tells the pointer's place, to light what's under it), the window's
// focus lost (Away: the light goes), the wheel, the terminal's background
// told (the chat laid out anew: diagrams draw over it), or its line of
// term_groups. Text chosen is let go at a key not KEEP's or at typing;
// Ctrl+C copies it again instead. Text in the input dismisses the
// suggested reply
export function term_press(t: Term, key: string): void {
  if (key === "Away") {
    t.pointed = false;
    if (t.lit !== null) {
      term_draw(t);
    }
    return;
  }
  if (key === "Move" || key === "Press" || key === "Release") {
    t.pointed = true;
  }
  if (key === "Press" || key === "RightPress") {
    t.lead = false;
    term_unwait(t);
  }
  if (MOUSE.includes(key) && popup_mouse(t, key)) {
    if (key !== "Move") {
      term_draw(t);
    }
    return;
  }
  if (key === "Move") {
    term_hover(t);
    return;
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
// leader go and goes on to what has it: the popup, a pane, else the
// chat). A key while a popup (the picker, illi's questions), the
// commands suggested or a pane is open: theirs first (true: taken). The
// picker as term_choose_key, every key but PASS's; illi's questions every
// key but PASS's and the leader too, as Asks.ts says (the wheel scrolls
// them: Popup.ts); the commands move by Up and Down, fill one in by Tab,
// run it by Enter; a pane scrolls by the arrows, the pages and the
// wheel, Esc and Enter close it, and no editing key reaches the input
// hidden under it. Any key puts the pointer's light out first (but the
// wheel: Select.ts term_typing)
export function term_grab(t: Term, key: string): boolean {
  term_typing(t, key);
  if (t.lead && key !== "WheelUp" && key !== "WheelDown") {
    term_after(t, key);
    return true;
  }
  t.lead    = false;
  const pop = term_popup(t);
  if (pop === "list") {
    return term_choose_key(t, t.choose!, key);
  }
  if (pop === "form" && (PASS.includes(key) || key === config.LEADER)) {
    return false;
  }
  if (pop === "form") {
    if (key === "WheelUp" || key === "WheelDown") {
      popup_form_wheel(t, key === "WheelUp" ? -1 : 1);
    } else {
      term_form_key(t, key);
    }
    return true;
  }
  const sug = term_suggest(t);
  if (sug !== null && term_suggest_key(t, sug, key)) {
    return true;
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

// a key to the picker (true: taken: all but PASS's and the leader, which
// go on to open what they open in its place). Ctrl+C and Ctrl+D are Esc
// here (neither interrupts, clears the input nor quits); the key that
// opened it closes it (Ctrl+P's); a question just shown holds Enter
// (Popup.ts popup_held); the lit option's own keys first (the model
// picker's effort and speed); then Up and Down (or Tab) move round
// the options shown, PgUp and PgDn a page, Ctrl+Home and Ctrl+End to the
// first and the last (Home and End too, with nothing to type in), the
// wheel scrolls (Popup.ts), Enter picks the lit one (none matching the
// search: nothing; a line asked for: given, the box kept with a reason
// if it won't do), Esc closes, and the search takes the input's editing
// keys (but its rows'); any other key does nothing
export function term_choose_key(t: Term, c: Chooser, press: string): boolean {
  const key  = press === "Ctrl+C" || press === "Ctrl+D" ? "Esc" : press;
  const n    = c.shown.length;
  const lit  = c.shown[c.at]?.k;
  const move = ({ Up: -1, "Shift+Tab": -1, Down: 1, Tab: 1 } as Record<string, number>)[key];
  const page = ["PgUp", "PgDn", "Ctrl+Home", "Ctrl+End", ...(c.find === null ? ["Home", "End"] : [])].includes(key);
  if (key === c.key) {
    t.choose = null;
    return true;
  }
  if (PASS.includes(key) || key === config.LEADER) {
    return false;
  }
  if (key === "Enter" && popup_held(t)) {
    return true;
  }
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
  } else if (key === "WheelUp" || key === "WheelDown") {
    popup_wheel(t, c, key === "WheelUp" ? -1 : 1);
  } else if (page) {
    popup_page(t, c, key);
  } else if (key === "Enter" && lit !== undefined) {
    t.choose = null;
    c.pick(lit);
  } else if (key === "Esc") {
    t.choose = null;
  } else if (c.find !== null && !ROWS.includes(key) && Screen.ed_key(c.find, key)) {
    term_chooser_find(c);
  }
  return true;
}

// text typed after the leader: its first character the shortcut's key,
// the rest as typed after it; while the picker is open: to its search,
// none: nowhere, never the input; while illi asks, to its question
// (Asks.ts; a pane under it stays); over a pane, to the input, the pane
// closed. The pointer's light goes out first, as at a key
export function term_type(t: Term, text: string): boolean {
  const c = t.choose;
  term_typing(t, "");
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
  if (c !== null) {
    if (c.find !== null) {
      Screen.ed_type(c.find, text);
      term_chooser_find(c);
    }
    return true;
  }
  if (term_form_type(t, text)) {
    return true;
  }
  t.pane = null;
  return false;
}

// a click (never under a popup, nor on the commands suggested: Popup.ts
// has those; never the press that focused the window, nor one again on
// what a click just acted on: Select.ts), on what's under it (Select.ts
// term_target): what was drawn there does its own (the side, the tabs,
// the jump, a reply's button copies); in the chat, a run of work's head
// or its bar opens or closes the whole run, at once; inside an open one,
// a message folds to a line, or unfolds; a block opens, and an open one
// shuts from any line of its frame (the innermost thing holding the line
// acts). Those wait till TWICE after the press (term_wait), so a double
// click still chooses the word under it; where no word is (past a line's
// end, a blank line, a frame's edge, a glyph), at once. Whatever a click
// acted on keeps its place under the pointer
export function term_click(t: Term): void {
  const at  = t.scr.click;
  const aim = term_target(t, at);
  if (aim.$ === "hit") {
    aim.hit.run();
  } else if (aim.$ === "copy") {
    term_copied(t, aim.copy());
  } else if (aim.$ === "mark" && (aim.mark.act === true || !term_wordy(t, at))) {
    term_fold(t, aim.mark, at);
  } else if (aim.$ === "mark") {
    term_wait(t, aim.mark, at);
  }
}

// a click's fold waiting out a double click: done at the press's TWICE
// (the screen painted), unless a press, the wheel or a key comes first
// (term_unwait); meanwhile what it acts on shows pressed (Select.ts)
function term_wait(t: Term, m: Paint.Mark, at: Screen.Spot): void {
  term_unwait(t);
  const timer = setTimeout(() => {
    t.wait = null;
    term_fold(t, m, at);
    term_draw(t);
  }, Math.max(0, t.scr.pressed + Screen.TWICE - Date.now()));
  t.wait = { key: m.key, timer };
}

// a click's fold waiting given up (none: nothing)
export function term_unwait(t: Term): void {
  if (t.wait !== null) {
    clearTimeout(t.wait.timer);
    t.wait = null;
  }
}

// a mark acted on by a click at a spot: a run of work (or a recap)
// opened or closed, a message in one folded or unfolded, a block opened
// or shut; its first line kept on the row clicked (t.pin), so what was
// under the pointer stays there, and a press on that cell within TWICE
// acts on nothing (t.acted: a slow double click never undoes it)
function term_fold(t: Term, m: Paint.Mark, at: Screen.Spot): void {
  t.pin   = { key: m.key, row: at.row };
  t.acted = { at, until: Date.now() + Screen.TWICE };
  if (m.act === true) {
    View.view_toggle(t.v, m.id);
    t.ver += 1;
  } else if (m.fold === true) {
    View.view_fold(t.v, m.key);
    t.ver += 1;
  } else {
    term_act(t, { $: m.open ? "Shut" : "Open", id: m.id, n: m.n });
  }
}

// Ctrl+O: every run of work (and recap) shown whole, or each one line
// again
export function term_verbose(t: Term): void {
  View.view_verbose(t.v);
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
// the notes gone, a suggested reply typing dismissed shown again, unless
// this sent it); empty, nothing (Esc twice and Ctrl+C interrupt); text
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
    t.dropped = t.v.suggest !== "" && text.trim().startsWith(t.v.suggest) ? t.v.suggest : "";
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
    term_act(t, { $: "Stop" });
    return;
  }
  t.esc = Date.now();
  term_toast(t, "Esc again to interrupt", AGAIN);
}

// Ctrl+C or Ctrl+D: clears the input; on an empty one, Ctrl+C interrupts
// illi's turn and says how to quit, a second within AGAIN quits; Ctrl+D
// quits, but while a quit would stop more than a turn (term_stops) it
// says what first, as Ctrl+C does, and a second within AGAIN quits; a
// quit under way (waiting on hooks), at once
export function term_clear(t: Term, key: string): void {
  const stops = term_stops(t);
  if (t.scr.ed.text !== "") {
    Screen.ed_take(t.scr.ed);
  } else if (t.quitting || Date.now() - t.quit < AGAIN || (key === "Ctrl+D" && stops === "")) {
    term_quit(t);
  } else {
    t.quit = Date.now();
    if (key === "Ctrl+C") {
      term_act(t, { $: "Stop" });
    }
    term_toast(t, key + " again to quit · " + (stops || "what runs stops, and goes on at the next start"), AGAIN);
  }
}

// what a quit stops besides a turn, said (nothing, or a view of another
// terminal's chat, whose quit stops nothing: ""): the background jobs,
// gone for good, and the subagents at work, which go on at the next start;
// each profile open hidden in this window at work or running jobs, which
// the quit ends too (those at rest end without a word: nothing of theirs
// is lost)
function term_stops(t: Term): string {
  const jobs = t.chat === null ? 0 : t.v.background.length;
  const subs = t.chat === null ? 0 : t.v.agents.length;
  const busy = (n: number) => n + (n === 1 ? " background job" : " background jobs");
  const said = [
    jobs === 0 ? "" : "stops " + busy(jobs) + " (/background)",
    subs === 0 ? "" : subs + (subs === 1 ? " subagent pauses" : " subagents pause") + " till the next start",
    ...member_others().filter((o) => o.working || o.jobs > 0).map((o) => "also ends profile " + o.profile + " (" + [o.working ? "at work" : "", o.jobs > 0 ? busy(o.jobs) : ""].filter((x) => x !== "").join(", ") + ")"),
  ];
  return said.filter((x) => x !== "").join(" · ");
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
