// Keys
// ====
// A key, as Screen.ts reads it: the mouse's (Select.ts), the wheel, the
// keys of COMMANDS (Commands.ts), and what the lists and panes over the
// chat take first; Enter, Esc, Ctrl+C and Ctrl+D, Tab and the pages.

import { Chat } from "../chat/Chat.ts";
import { term_command, term_commands, term_main, term_suggest, term_suggest_key } from "./Commands.ts";
import { Custom } from "../config/Custom.ts";
import { term_draw } from "./Frame.ts";
import { term_note, term_toast, term_unnote } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import * as Screen from "../ui/Screen.ts";
import { term_copied, term_hover, term_mouse, term_selected, term_under } from "./Select.ts";
import { term_act, term_primaries, term_quit, type Term } from "./Term.ts";
import * as View from "../ui/View.ts";

// the keys that leave text chosen (any other lets it go)
const KEEP   = ["", "Canvas", "Press", "Drag", "Release", "WheelUp", "WheelDown", "Esc", "PgUp", "PgDn", "Ctrl+Home", "Ctrl+End"];

// how soon a second Ctrl+C quits (ms)
const AGAIN = 2000;

// the lines a turn of the wheel scrolls
const WHEEL = 3;

// a key ("": the input may have changed): the mouse, the wheel, the
// terminal's background told (the chat laid out anew: diagrams draw over
// it), or its line of COMMANDS. Text chosen is let go at a key not KEEP's
// or at typing; Ctrl+C copies it again instead
export function term_press(t: Term, key: string): void {
  if (key === "Move") {
    term_hover(t);
    return;
  }
  const cmd    = term_commands(t.v).find((c) => c[1] !== "" && c[1].split(", ").includes(key));
  const chosen = key === "Ctrl+C" && t.sel?.moved === true && !t.sel.held ? term_selected(t) : null;
  if (t.scr.typed || !KEEP.includes(key)) {
    t.sel = null;
  }
  t.scr.typed = false;
  if (key === "Canvas" && t.scr.canvas !== undefined) {
    Paint.paint_canvas(t.scr.canvas);
    t.ver += 1;
  } else if (key === "Press" || key === "Drag" || key === "Release") {
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

// a key while the commands suggested show, the picker or a pane is open:
// theirs first (true: taken). The commands move by Up and Down, fill one
// in by Tab, run it by Enter; the picker moves by the arrows (or Tab),
// picks by Enter; a pane scrolls by the arrows, the pages and the wheel;
// Esc closes any, and so does Enter a pane, the input empty
export function term_grab(t: Term, key: string): boolean {
  const sug = term_suggest(t);
  if (sug !== null && term_suggest_key(t, sug, key)) {
    return true;
  }
  const pick = t.choose;
  if (pick !== null) {
    const n    = pick.names.length;
    const move = ({ Up: -1, "Shift+Tab": -1, Down: 1, Tab: 1 } as Record<string, number>)[key];
    if (move !== undefined) {
      pick.at = (pick.at + move + n) % n;
    } else if (key === "Enter") {
      t.choose = null;
      pick.pick(pick.at);
    } else if (key === "Esc") {
      t.choose = null;
    }
    return move !== undefined || key === "Enter" || key === "Esc";
  }
  if (t.pane === null) {
    return false;
  }
  const page = Math.max(1, t.seen.tall - 2);
  const move = ({ Up: -1, Down: 1, PgUp: -page, PgDn: page, WheelUp: -WHEEL, WheelDown: WHEEL, "Ctrl+Home": -Infinity, "Ctrl+End": Infinity } as Record<string, number>)[key];
  const shut = key === "Esc" || (key === "Enter" && t.scr.ed.text.trim() === "");
  if (move !== undefined) {
    t.pane.scroll = Math.max(0, t.pane.scroll + move);
  }
  if (shut) {
    t.pane = null;
  }
  return move !== undefined || shut;
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
// the notes gone); text not sent stays (it was lost: an unknown /word)
export function term_enter(t: Term): void {
  const typed = Screen.ed_take(t.scr.ed);
  const text  = Screen.ed_expand(t.scr.ed, typed);
  t.pane = null;
  if (term_command(t, text)) {
    return;
  }
  if (!View.view_typing(t.v)) {
    term_note(t, "Messages go to Illi: Tab or /tab goes back.");
  } else if (term_act(t, { $: "Send", text, images: term_shots(t, text) }).length > 0) {
    term_unnote(t);
    t.scroll = 0;
    return;
  }
  Screen.ed_type(t.scr.ed, typed);
}

// the images a text names by their tokens, each once
export function term_shots(t: Term, text: string): Blob[] {
  return [...new Set(Screen.ed_images(text))].flatMap((n) => t.imgs.get(n) ?? []);
}

// Esc: the notes cleared, Illi's turn interrupted
export function term_esc(t: Term): void {
  term_unnote(t);
  term_act(t, { $: "Send", text: "" });
}

// Ctrl+C or Ctrl+D: clears the input; on an empty one, Ctrl+C interrupts
// Illi's turn and says how to quit, a second within AGAIN quits; Ctrl+D
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

// Tab: Illi runs as the next primary agent that can run (Illi's own
// among them), after the one asked for last if not answered yet
export function term_next(t: Term): void {
  term_primaries(t);
  const names = [null, ...t.agents.filter((a) => typeof Chat.own(a) !== "string").map((a) => a.name)];
  const asked = t.v.out.flatMap((p) => (p.msg.$ === "main" ? [p.msg.name] : []));
  const now   = asked.length > 0 ? asked[asked.length - 1] : t.v.agent;
  if (names.length === 1) {
    return term_note(t, "No primary agents yet: an agent file with mode: primary (or none) in " + Custom.dirs(process.cwd(), "agents").join(" or ") + ". /agents shows yours.");
  }
  term_main(t, names[(names.indexOf(now) + 1) % names.length]);
}

// Ctrl+PgDn, Ctrl+PgUp: the next page, the one before
export function term_cycle(t: Term, key: string): void {
  const tabs = View.view_tabs(t.v);
  const at   = tabs.findIndex((tab) => tab.here) + (key === "Ctrl+PgUp" ? tabs.length - 1 : 1);
  term_act(t, { $: "Goto", name: tabs[at % tabs.length].name });
}
