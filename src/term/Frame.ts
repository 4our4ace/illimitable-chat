// Frame
// =====
// The screen painted as the work at hand is done (a key's at once), a
// frame at most each FRAME ms: the head; the chat (or a pane; over its
// foot the commands suggested), the side beside it (Side.ts); the notes,
// the toast and the jump to the end; the rule (what runs, the ∞ traced),
// the input, the pages, the pick; a popup open (the picker, illi's
// questions: Popup.ts) over all of it, all else dimmed, the cursor in its
// search or words if it has them; all of it grey while the leader waits
// for its key (Commands.ts term_lead); the terminal's title. A pipe gets
// text.

import * as path from "node:path";
import { term_asks } from "./Asks.ts";
import { term_background, term_suggest } from "./Commands.ts";
import * as config from "../config/Config.ts";
import * as Draw from "../ui/Draw.ts";
import { term_hint } from "./Keys.ts";
import { member_others } from "./Member.ts";
import * as Paint from "../ui/Paint.ts";
import { PANEL, popup_paint, popup_shown, term_popup } from "./Popup.ts";
import { term_shown } from "./Notices.ts";
import { term_mode } from "./PermCommands.ts";
import { term_profile_pick } from "./ProfileCommands.ts";
import { DEFAULT } from "../config/Profiles.ts";
import { Projects } from "../chat/Projects.ts";
import * as Screen from "../ui/Screen.ts";
import { term_area, term_light, term_under } from "./Select.ts";
import { term_side, term_side_drawn, term_side_width, term_tokens } from "./Side.ts";
import { status_rows } from "./Status.ts";
import { term_act, type Area, type Pane, type Sug, type Target, type Term } from "./Term.ts";
import * as View from "../ui/View.ts";

// the folder illi works in, as the head shows it
const HERE = config.config_home(process.cwd());

// the margin left and right of the chat and the input
export const MARGIN = 2;

// the chat's rows the status line's leave at least (Status.ts)
const STATUS_ROOM = 3;

// a note's indent: its text starts where the rule's does
const NOTE_IN = 3;

// the jump to the chat's end, and how many rows over the chat's last it
// floats
const JUMP    = " ↓ Jump to Bottom · Ctrl+End ";
const JUMP_UP = 1;

// a pipe's lines' width
const PIPE = 76;

// a paint's frame: a stream's pieces come faster than a screen shows
// them (ms); when the last paint began, and once done, ended
const FRAME = 16;
let painted = 0;

// a size held this long is settled: a drag's sizes come faster (ms)
const SETTLE = 30;

// the screen's rows as last painted, each its pieces: one list, filled
// anew by each paint (each row a new one: Screen.ts keeps them)
const ROWS: Screen.Piece[][] = [];

// the mark over the input while work runs, as illimitable has no end:
// an infinity sign traced for ever, in braille (a cell 2 dots wide and 4
// high, so 4 cells hold a ∞ 8 by 4): its path, round its left loop and
// its right, crossing in the middle; a trail of TRAIL dots runs along it,
// a dot each TRACE (ms). A cell takes one color: the cell holding the
// head is in the accent, each other fades by its newest dot's age, so the
// tail dies away; where the path crosses itself, a dot more than CROSS
// older than its cell's newest is left out. Each subagent at work in the
// side gets a small one in one cell: a trail of ORBIT_TRAIL on a figure
// of eight over its six dots (ORBIT: 1 4 5 2, 3 6 5 2; the dots by
// braille's numbers, 1 2 3 down the left, 4 5 6 down the right), a dot
// each 2 TRACE. One clock draws them all, waking only as they
// change (term_wake); a dot of the ∞ writes only the cells it changed
const INFINITY: [number, number][] = [[3, 2], [2, 3], [1, 3], [0, 2], [0, 1], [1, 0], [2, 0], [3, 1], [4, 2], [5, 3], [6, 3], [7, 2], [7, 1], [6, 0], [5, 0], [4, 1]];
const TRAIL       = 8;
const CROSS       = 3;
const TRACE       = 80;
const ORBIT: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2], [1, 2], [1, 1], [0, 1]];
const ORBIT_TRAIL = 3;

// a braille dot's bit, by its column (0, 1) and row (0 to 3)
const DOT = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]];

// the rule's words (how long work ran, how fast the models write) looked
// at again this often while it runs (ms): the rate moves at most twice
// a second (View.ts); between, and while they say the same, a tick writes
// the ∞'s cells alone
const WORDS = 500;

// the ∞ as the clock last wrote it on the screen as last painted (of):
// its frame (-1: none since the paint), the words' step and second
let traced: { of: Term["ruled"]; head: number; step: number; sec: number } | null = null;

// the rule's start, before the trace while work runs
const RULE_HEAD = "── ";

// the terminal's title (term_title): its mark at rest, waiting on the
// user's answer; while work runs, one braille cell, the side's spinner
// (term_orbit), a dot each TITLE_STEP (ms: a tab's title changed no
// faster)
const TITLE_REST = "∞";
const TITLE_ASK  = "?";
const TITLE_STEP = 250;

// the project as the title names it, by the folder illi runs in
let titled: { cwd: string; name: string } | null = null;

// the input's hint on an agent's tab, the main agent's name after it (in
// the chat's: the suggested reply, if any)
const OFF = "Read-only · Ctrl+PgUp back to ";

// the commands suggested: the most lines shown, the keys said in its top
// edge (a skill's name mid-message: NAMED's)
const SUGGEST   = 10;
const SUGGESTED = "Commands · ↑↓ · Tab fills in · Enter runs · Esc";
const NAMED     = "Skills · ↑↓ · Tab or Enter fills in · Esc";

// a new size: every row written again, once the size settles; a popup
// measured afresh, and till painted again, its box as last painted
// stands for nothing
export function term_resize(t: Term): void {
  t.box = null;
  clearTimeout(t.settle);
  t.settle = setTimeout(() => term_redraw(t), SETTLE);
}

export function term_redraw(t: Term): void {
  Screen.screen_wipe(t.scr);
  term_draw(t);
}

// a paint, unless one is due: as soon as the work at hand is done (a
// key's and all it set off, in one paint); within FRAME of the last
// one's end, once that frame is up (all asked for meanwhile in it). None
// while hidden in a window (Member.ts): shown, it paints whole
export function term_draw(t: Term): void {
  if (t.due || t.scr.hidden) {
    return;
  }
  t.due = true;
  const wait = painted + FRAME - Date.now();
  if (wait > 0) {
    setTimeout(() => term_paint(t), wait);
  } else {
    setImmediate(() => term_paint(t));
  }
}

// the screen, top to bottom: the head; the chat (or a pane), the side
// beside it on a wide screen; as a /word is typed, over their foot, its
// last line right on the input, the commands it matches (as wide as the
// input); a row with, at the chat's right end, a toast in the accent; a
// rule (what runs, while it does), the input, a rule, the pages, the
// agent and the pick. The notes, however the chat is scrolled, end over
// the input: the newest in the rule, the one before it, faded, in the row
// above (unless the toast leaves it no room); while work runs (its
// status has the rule), the newest alone, in the row above. Only what is
// left over takes rows from the chat. Scrolled up, a button floats over
// the chat's foot, in its middle: a jump to its end (a click goes there,
// as Ctrl+End does). What a click in the chat would act on lit, once
// every hit is placed (Select.ts term_light). A popup open (Popup.ts)
// over all of it, all else dimmed, the cursor in its search or words
// (none: hidden; blinking in illi's questions, which wait on you), and
// nothing under it takes a click or lights. A pipe gets the notes as text
export function term_paint(t: Term): void {
  t.due   = false;
  painted = Date.now();
  term_asks(t);
  const said = term_shown(t);
  if (!t.scr.tty) {
    term_print(said.notes.map(View.Cap));
    return;
  }
  term_title(t);
  t.hits  = [];
  t.areas = [];
  const { w, h } = Screen.screen_size();
  const full  = w - 1;
  const side  = term_side_width(t, w);
  const left  = t.side.place === "left" ? side : 0;
  const cw    = full - side - 2 * MARGIN;
  const iw    = full - 2 * MARGIN;
  const off   = !View.view_typing(t.v);
  const paned = t.pane !== null;
  const input = paned ? { lines: [], at: null } : Screen.screen_input(t.scr, iw, Math.max(1, Math.floor(h / 3)), off ? OFF + (t.v.agent ?? View.MAIN) : term_hint(t), off);
  const idle  = View.view_doing(t.v) === null;
  const notes = term_notes(idle ? said.notes : said.notes.slice(-1), iw - 2 * NOTE_IN);
  const ruled = idle ? notes.pop() : undefined;
  const last  = notes.at(-1);
  const roomy = last !== undefined && NOTE_IN + Paint.line_width(last) + 1 + Paint.text_width(said.toast) <= left + cw;
  const lead  = roomy ? [Paint.Run(" ".repeat(NOTE_IN)), ...notes.pop()!] : [];
  const above = notes.slice(-Math.floor(h / 4)).map((l) => [Paint.Run(" ".repeat(NOTE_IN)), ...l]);
  const status = status_rows(t, iw, h - (paned ? 4 : 5) - input.lines.length - above.length - STATUS_ROOM);
  const tall  = Math.max(1, h - (paned ? 4 : 5) - input.lines.length - above.length - status.length);
  const pop   = term_popup(t) !== null;
  popup_shown(t);
  const box   = pop ? null : term_box(t, iw, tall + 1 + above.length);
  const top   = box === null ? Infinity : 2 + tall + above.length - box.lines.length;
  const view  = term_view(t, cw, tall, 1, left + MARGIN);
  for (let r = top; r <= tall; r++) {
    view.lines[view.first + r - 1] = [];
  }
  const shown = term_area(t, view);
  const sw    = side - (left > 0 ? 3 : 2);
  const at    = left > 0 ? 0 : full - side;
  const panel = side === 0 ? null : term_side_drawn(t, sw, tall);
  const sides = panel?.items ?? [];
  const jobs  = panel?.background !== true;
  const sided = term_area(t, { key: "side", lines: sides.map((s) => s[0]), first: 0, row: 1, col: left > 0 ? 1 : at + 2, w: sw, tall: sides.length });
  const lit   = { ...Paint.INK, c: Draw.draw_tokens().accent };
  const toast = box !== null ? [] : [...lead, Paint.Run(" ".repeat(Math.max(1, left + cw - Paint.line_width(lead) - Paint.text_width(said.toast)))), Paint.Run(said.toast, lit)];
  const lines = [...above, toast, term_rule(t, iw, ruled), ...input.lines, ...(paned ? [] : [Paint.rule(iw)]), ...status, Paint.tabs_line(t.v, iw, side === 0, jobs)];
  const foot  = term_area(t, { key: "foot", lines, first: 0, row: 1 + tall, col: MARGIN, w: iw, tall: lines.length });
  const head  = term_area(t, { key: "head", lines: [term_head(t, full)], first: 0, row: 0, col: 0, w: full, tall: 1 });
  const rows  = ROWS;
  const with_: number[] = [];
  rows.length = 0;
  rows.push([{ col: 0, w: full, line: head[0] }]);
  for (let k = 0; k < tall; k++) {
    const row: Screen.Piece[] = [{ col: left + MARGIN, w: cw, line: shown[k] }];
    if (sides[k] !== undefined && 1 + k < top) {
      row.push({ col: at, w: side, line: term_side_line(sided[k], sw, left > 0) });
      with_.push(k);
    }
    rows.push(row);
    // a side row's click: its item's, but from a second column on (Item's
    // aside, its col into the line, which starts 1 in on the left side
    // and 2 in on the right) that column's; none under a popup
    const aside = row.length === 1 ? undefined : sides[k][2];
    const split = aside === undefined ? at + side : at + (left > 0 ? 1 : 2) + aside.col;
    term_hit(t, 1 + k, at, split, row.length === 1 || pop ? null : sides[k][1]);
    term_hit(t, 1 + k, split, at + side, pop ? null : aside?.run ?? null);
  }
  for (const line of foot) {
    rows.push([{ col: MARGIN, w: iw, line }]);
  }
  if (box !== null) {
    term_over(t, rows, box, top, MARGIN, iw);
  } else if (!pop) {
    t.box = null;
  }
  if (box === null && t.pane === null && t.scroll > 0 && !pop) {
    term_jump(t, rows, tall, left + MARGIN, cw, lit);
  }
  if (!pop) {
    term_tabs(t, h - 1, side === 0, iw, jobs);
  }
  term_light(t, rows);
  const popped = pop ? popup_paint(t, rows, w, h) : null;
  t.hover = t.sel?.held ? undefined : term_under(t, t.scr.point);
  const cursor = pop ? popped : input.at === null ? null : { row: 3 + tall + above.length + input.at.row, col: MARGIN + input.at.col };
  const drawn  = t.lead ? rows.map((row) => row.map((p) => ({ ...p, line: p.line.map((r) => ({ ...r, s: { ...r.s, d: true, c: "", g: "" } })) }))) : rows;
  t.ruled ={ row: 2 + tall + above.length, w: iw, at: cursor, rows: drawn, side: box === null && !pop ? { at, w: side, sw, left: left > 0, tall, with: with_ } : null, spin: term_spinner(Date.now() - t.since) };
  t.scr.blink = idle || term_popup(t) === "form";
  Screen.screen_paint(t.scr, drawn, cursor);
  painted = Date.now();
}

// a line of the side, w wide, with its edge toward the chat: the side
// on the left, its line at its right; else at its left
function term_side_line(line: Paint.Line, w: number, left: boolean): Paint.Line {
  return left ? [Paint.Run(" "), ...line, Paint.Run(" ".repeat(Math.max(0, w - Paint.line_width(line))) + " │", Paint.DIM)] : [Paint.Run("│ ", Paint.DIM), ...line];
}

// the notes' lines, oldest first, w wide: the newest in the ink, the
// ones before it faded
function term_notes(notes: string[], w: number): Paint.Line[] {
  return notes.flatMap((text, k) => Paint.runs_wrap([Paint.Run(Paint.text_clean(text), { ...(k === notes.length - 1 ? Paint.INK : Paint.DIM), i: true })], w, false));
}

// the jump to the chat's end, floating over its foot (JUMP_UP rows over
// its last), in its middle: reversed, in the accent, a space clear
// on each side; a click goes there, as Ctrl+End does. Too narrow: its
// arrow alone
function term_jump(t: Term, rows: Screen.Piece[][], tall: number, col: number, w: number, lit: typeof Paint.INK): void {
  const said = JUMP.length + 2 <= w ? JUMP : " ↓ ";
  const bw   = said.length + 2;
  const row  = 1 + Math.max(0, tall - 1 - JUMP_UP);
  const at   = col + Math.max(0, Math.floor((w - bw) / 2));
  rows[row].push({ col: at, w: bw, line: [Paint.Run(" "), Paint.Run(said, { ...lit, v: true, b: true }), Paint.Run(" ")] });
  term_hit(t, row, at, at + bw, () => (t.scroll = 0));
}

// the rule over the input; while work runs: what runs (term_working),
// kept for the clock to write again alone; else a note's line, if one
// is given
function term_rule(t: Term, w: number, note?: Paint.Line): Paint.Line {
  const doing = View.view_doing(t.v);
  term_spin(t, doing !== null);
  t.doing = doing;
  if (doing === null) {
    return note === undefined ? Paint.rule(w) : [Paint.Run("─".repeat(NOTE_IN - 1) + " ", Paint.DIM), ...note, Paint.Run(" " + "─".repeat(Math.max(0, w - NOTE_IN - 1 - Paint.line_width(note))), Paint.DIM)];
  }
  return term_working(t, doing, w, Date.now());
}

// the rule while work runs, w wide, at a time: the ∞ traced, the step
// it is at (bold, in the accent), how long it has run, the tokens the
// models wrote (once any) and how fast they write now (while they do,
// unless the tps setting is off), cut to the width
function term_working(t: Term, doing: View.Doing, w: number, now: number): Paint.Line {
  const c    = Draw.draw_tokens().accent;
  const head = [Paint.Run(RULE_HEAD, Paint.DIM), ...term_trace(now - t.since, c, t.scr.canvas), Paint.Run(" "), Paint.Run(doing.verb, { ...Paint.INK, c, b: true })];
  const tail = [term_elapsed(now - t.since), doing.tokens > 0 ? "↓ " + term_tokens(doing.tokens) + " tokens" : "", doing.rate > 0 && config.TPS ? doing.rate + " tok/s" : ""].filter((x) => x !== "").join(" · ");
  const room = w - Paint.line_width(head) - 6;
  const said = Paint.text_width(tail) <= room ? tail : room < 2 ? "" : Paint.runs_wrap([Paint.Run(tail)], room - 1, true)[0].map((r) => r.x).join("") + "…";
  const used = Paint.line_width(head) + Paint.text_width(said) + 4;
  return [...head, Paint.Run(" · " + said + " ", Paint.DIM), Paint.Run("─".repeat(Math.max(0, w - used)), Paint.DIM)];
}

// the terminal's title, unless the title setting is off: `∞ illi ·
// <project>` (its git repo's folder, or home outside any), the profile
// after it but for the default; while work runs, a cell's dots going
// round (term_orbit), and a question waiting on the user, here or in a profile
// open hidden in this window, ? (Screen writes it only as it changes)
export function term_title(t: Term): void {
  if (!config.TITLE) {
    return Screen.screen_title(t.scr, null);
  }
  const mark  = t.v.asks.length > 0 || member_others().some((o) => o.asks) ? TITLE_ASK : View.view_running(t.v) ? term_orbit(Math.floor((Date.now() - t.since) / TITLE_STEP)) : TITLE_REST;
  const cwd   = process.cwd();
  if (titled?.cwd !== cwd) {
    const top = Projects.place(cwd).path;
    titled = { cwd, name: top === "" ? "home" : path.basename(top) };
  }
  Screen.screen_title(t.scr, mark + " illi · " + titled.name + (config.PROFILE === DEFAULT ? "" : " · " + config.PROFILE));
}

// the trace's clock: it starts as work does (when kept), stops as it
// ends; it wakes only when the rule would look different (term_wake)
function term_spin(t: Term, on: boolean): void {
  if (on && t.spin === undefined) {
    t.since = Date.now();
    term_wake(t);
  } else if (!on && t.spin !== undefined) {
    clearTimeout(t.spin);
    t.spin = undefined;
  }
}

// the clock set for the trace's next dot; the work's second shows with
// it, at most TRACE late. Nothing between: the side's spinners change
// with every other dot
function term_wake(t: Term): void {
  t.spin = setTimeout(() => {
    term_tick(t);
    if (t.spin !== undefined) {
      term_wake(t);
    }
  }, TRACE - ((Date.now() - t.since) % TRACE) + 1);
}

// a wake of the clock, where the rule was last painted: the ∞'s cells
// that changed written again alone (term_traced); each WORDS, from what
// runs now, the rule written whole if its words changed (too narrow for
// the ∞ whole: at each wake). With agents at work and their spinner
// changed, the side's rows too (term_side_again). No paint, no layout of
// the chat; a whole paint only once work ended, with text chosen (its
// look may cover them), a popup open (the rule dimmed under it) or the
// leader waiting (all grey); nothing while a paint is due
function term_tick(t: Term): void {
  const r = t.ruled;
  if (t.due) {
    return;
  }
  term_title(t);
  if (r === null || t.doing === null || t.sel !== null || t.lead || term_popup(t) !== null || !View.view_running(t.v)) {
    return term_paint(t);
  }
  const now  = Date.now();
  const ms   = now - t.since;
  const head = Math.floor(ms / TRACE) % INFINITY.length;
  const fits = r.w >= Paint.text_width(RULE_HEAD) + 4;
  const tr   = traced?.of === r ? traced : (traced = { of: r, head: -1, step: -1, sec: -1 });
  if (!fits || Math.floor(ms / WORDS) !== tr.step) {
    const was = t.doing;
    t.doing   = View.view_doing(t.v, now) ?? was;
    tr.step   = Math.floor(ms / WORDS);
    if (!fits || Math.floor(ms / 1000) !== tr.sec || t.doing.verb !== was.verb || t.doing.tokens !== was.tokens || t.doing.rate !== was.rate) {
      [tr.head, tr.sec] = [head, Math.floor(ms / 1000)];
      Screen.screen_row(t.scr, r.row, [{ col: MARGIN, w: r.w, line: term_working(t, t.doing, r.w, now) }], r.at);
    }
  }
  if (head !== tr.head) {
    Screen.screen_cells(t.scr, r.row, term_traced(t, head, tr.head), r.at);
    tr.head = head;
  }
  const spin = term_spinner(ms);
  if (t.v.agents.length > 0 && spin !== r.spin) {
    r.spin = spin;
    term_side_again(t);
  }
}

// the ∞'s frame `head`, as pieces of the rule's row: the cells that
// changed from frame `was` (-1: none known, all of them), those side by
// side in one piece. Made at each wake: frames made once and written
// again made Bun's collector run more, not less (each wake allocating
// next to nothing, it collects again and again, finding nothing)
function term_traced(t: Term, head: number, was: number): Screen.Piece[] {
  const c      = Draw.draw_tokens().accent;
  const cells  = term_trace(head * TRACE, c, t.scr.canvas);
  const before = was < 0 ? [] : term_trace(was * TRACE, c, t.scr.canvas);
  const col    = MARGIN + Paint.text_width(RULE_HEAD);
  const pieces: Screen.Piece[] = [];
  cells.forEach((run, k) => {
    const last = pieces.at(-1);
    if (run.x === before[k]?.x && run.s.c === before[k].s.c && run.s.d === before[k].s.d) {
      return;
    }
    if (last !== undefined && last.col + last.w === col + k) {
      last.w += 1;
      last.line.push(run);
    } else {
      pieces.push({ col: col + k, w: 1, line: [run] });
    }
  });
  return pieces;
}

// the side's rows written again alone, beside the chat's as last painted
// (each written only if it changed); a box over them: a whole paint
export function term_side_again(t: Term): void {
  const r = t.ruled!;
  if (r.side === null) {
    return term_paint(t);
  }
  const { at, w, sw, left, tall } = r.side;
  const sides = term_side(t, sw, tall);
  for (const k of r.side.with) {
    if (sides[k] !== undefined) {
      r.rows[1 + k][1] = { col: at, w, line: term_side_line(sides[k][0], sw, left) };
      Screen.screen_row(t.scr, 1 + k, r.rows[1 + k], r.at);
    }
  }
}

// one braille cell at a step: ORBIT_TRAIL dots along its figure of
// eight, the head at the step's (the title's mark while work runs, a
// subagent's)
export function term_orbit(step: number): string {
  let bits = 0;
  for (let k = 0; k < ORBIT_TRAIL; k++) {
    const [x, y] = ORBIT[(((step - k) % ORBIT.length) + ORBIT.length) % ORBIT.length];
    bits |= DOT[x][y];
  }
  return String.fromCharCode(0x2800 + bits);
}

// a subagent's spinner, ms into the work: a dot each 2 TRACE
export function term_spinner(ms: number): string {
  return term_orbit(Math.floor(ms / (2 * TRACE)));
}

// the ∞ ms into its work, in its 4 cells: the trail's TRAIL dots on
// INFINITY, newest first, its head a dot each TRACE; a dot CROSS older
// than its cell's newest left out. Each cell in the accent faded by its
// newest dot's age, a TRAIL-th a step (toward the background, if told;
// else dim from half the trail on)
function term_trace(ms: number, c: string, canvas: string | undefined): Paint.Line {
  const head  = Math.floor(ms / TRACE) % INFINITY.length;
  const cells = [0, 0, 0, 0];
  const young: number[] = [];
  for (let age = 0; age < TRAIL; age++) {
    const [x, y] = INFINITY[(head - age + INFINITY.length) % INFINITY.length];
    young[x >> 1] ??= age;
    if (age - young[x >> 1] <= CROSS) {
      cells[x >> 1] |= DOT[x & 1][y];
    }
  }
  const hex = c.startsWith("#") && canvas !== undefined;
  return cells.map((bits, i) => bits === 0 ? Paint.Run(" ")
    : Paint.Run(String.fromCharCode(0x2800 + bits), hex ? { ...Paint.INK, c: Draw.draw_mix(c, canvas!, young[i] / TRAIL) } : { ...Paint.INK, c, d: young[i] >= TRAIL / 2 }));
}

// how long, as a person says it: 7s, 2m 05s, 1h 03m
function term_elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return s < 60 ? s + "s" : s < 3600 ? Math.floor(s / 60) + "m " + two(s % 60) + "s" : Math.floor(s / 3600) + "h " + two(Math.floor(s / 60) % 60) + "m";
}

// a pipe's rows, as text
export function term_print(rows: View.Row[]): void {
  if (rows.length > 0) {
    Screen.screen_print(term_inset([[], ...Paint.rows_lines(rows, PIPE)]));
  }
}

function term_inset(lines: Paint.Line[]): Paint.Line[] {
  const pad = Paint.Run(" ".repeat(MARGIN));
  return lines.map((l) => [pad, ...l]);
}

// a click's place on the screen (none without a run)
function term_hit(t: Term, row: number, col: number, to: number, run: (() => void) | null): void {
  if (run !== null) {
    t.hits.push({ row, col, to, run });
  }
}

// the head: illimitable, the page shown, the folder; at its right, a pane's
// title, else what works
function term_head(t: Term, w: number): Paint.Line {
  const bold  = { ...Paint.INK, b: true };
  const page  = t.v.page === null ? [] : [Paint.Run(" > " + t.v.page.name, bold)];
  const left  = [Paint.Run(" " + View.NAME, bold), ...page, Paint.Run("  " + HERE, Paint.DIM)];
  const work  = t.v.agents.length === 0 ? "" : t.v.agents.length + " at work";
  return Paint.ends_line(left, work === "" ? "" : work + " ", w);
}

// the area over the input, tall rows from screen row `row`, column
// `col`: a pane's lines, else the chat's (each scrolled by a drag past
// its edge)
function term_view(t: Term, w: number, tall: number, row: number, col: number): Area {
  const pane  = t.pane;
  const [lines, first] = pane !== null ? term_paned(t, pane, w, tall) : term_chat(t, w, tall, row, col);
  const scroll = pane !== null ? (d: number) => void (pane.scroll = Math.max(0, pane.scroll + d)) : (d: number) => void (t.scroll = Math.max(0, t.scroll - d));
  return { key: pane !== null ? "pane" : "chat", lines, first, row, col, w, tall, scroll };
}

// the commands suggested as a /word is typed (none: null), over the
// chat's foot, room lines at most, iw wide (over the side too), each
// line with the command it stands for
function term_box(t: Term, iw: number, room: number): { sug: Sug; lines: Array<[Paint.Line, Target | null]> } | null {
  const sug = term_suggest(t);
  return sug === null ? null : { sug, lines: term_suggestions(sug, iw, room) };
}

// the commands suggested laid over the rows from screen row top on, at
// column col, w wide (the chat's under them blanked by the caller), kept
// as painted (t.box: the mouse over them is Popup.ts's)
function term_over(t: Term, rows: Screen.Piece[][], box: { sug: Sug; lines: Array<[Paint.Line, Target | null]> }, top: number, col: number, w: number): void {
  box.lines.forEach(([line], k) => rows[top + k].push({ col, w, line }));
  t.box = { of: box.sug, row: top, col, w, h: box.lines.length, rows: box.lines.map(([, aim]) => aim), list: 1, lines: box.lines.length - 2, tall: box.sug.tall, ahead: 0, lead: 0 };
}

// the chat's lines and the first shown, tall of them: its rows (made
// again only once they changed), laid out from the last up as far as
// shown and a screen more (those above as it is scrolled to them, any
// text chosen in it kept on its lines), then what streams or is waited
// on (no marks: nothing in it lights or takes a click). Scrolled up, the
// lines read stay in place as more come below (the rows laid out before
// laid out again, as with text chosen at the same width), and about in
// place at a new width; a block asked for (/open, /close) shows at the
// top; a mark a click acted on (t.pin) has its first line on the row
// clicked (held inside the chat, which a new size may have made
// shorter since): an open while the chat's end is followed leaves it
// (the jump to the end shows), and a close there lands lower, as the
// chat never scrolls past its end. The chat moving by itself while
// followed (more came, or a new size) puts the pointer's light out till
// it moves
function term_chat(t: Term, w: number, tall: number, row: number, col: number): [Paint.Line[], number] {
  const was   = t.body;
  const body  = was !== null && was.ver === t.ver && !Paint.laid_stale(was, w) ? was : { ver: t.ver, ...Paint.laid_new(View.view_body(t.v), w, 1) };
  if (body !== was) {
    const keep = was !== null && (t.scroll > 0 || (t.sel?.key === "chat" && !Paint.laid_stale(was, w)));
    Paint.laid_up(body, 0, keep ? was.from : Infinity);
    t.body = body;
  }
  const tail  = Paint.rows_lines(View.view_tail(t.v, false), w);
  const below = tail.length === 0 ? 0 : 1 + tail.length;
  const wider = t.seen.end - t.seen.col !== w;
  if (t.scroll > 0 && t.seen.total > 0) {
    const total = 1 + body.lines.length + below;
    t.scroll = wider ? Math.round((t.scroll * total) / t.seen.total) : t.scroll + Math.max(0, total - t.seen.total);
  }
  const aim   = t.find !== null ? { key: Paint.block_key(t.find[0], t.find[1]), row: row + 1 } : t.pin;
  const at    = aim === null ? -1 : Paint.rows_find(body.rows, aim.key);
  const up    = Paint.laid_up(body, 0, at < 0 ? Infinity : at);
  const kept  = aim === null ? undefined : body.marks.find((m) => m.key === aim.key);
  if (kept !== undefined) {
    t.scroll = 1 + body.lines.length + below - tall - kept.from + Math.max(0, Math.min(tall - 1, aim!.row - row));
  }
  [t.find, t.pin] = [null, null];
  term_chosen(t, up + Paint.laid_up(body, t.scroll + 2 * tall - 1 - below));
  const lines = [[], ...body.lines, ...(tail.length === 0 ? [] : [[], ...tail])];
  t.scroll = Math.max(0, Math.min(t.scroll, lines.length - tall));
  const first = Math.max(0, lines.length - tall - t.scroll);
  if (t.seen.scroll === 0 && t.scroll === 0 && aim === null && first !== t.seen.first) {
    t.pointed = false;
  }
  t.seen = { total: lines.length, marks: body.marks, row, first, tall, col, end: col + w, scroll: t.scroll };
  return [lines, first];
}

// lines laid out over the chat's top: text chosen in it moves down with
// the lines it is on
function term_chosen(t: Term, added: number): void {
  const sel = t.sel;
  if (added > 0 && sel?.key === "chat") {
    const down = (c: typeof sel.a) => ({ ...c, line: c.line + added });
    [sel.a, sel.b, sel.root] = [down(sel.a), down(sel.b), [down(sel.root[0]), down(sel.root[1])]];
  }
}

// a pane, tall lines w wide in the chat's place: its title on a rule
// over it, its keys on one under it (both kept as it scrolls), between
// them as many of its lines (made for the width inside) as fit from its
// scroll; all on the panel's background, the background told, so it
// stands apart from the chat
function term_paned(t: Term, pane: Pane, w: number, tall: number): [Paint.Line[], number] {
  if (pane.w !== w - 2) {
    [pane.w, pane.lines] = [w - 2, pane.make(w - 2)];
  }
  const room  = Math.max(1, tall - 2);
  pane.scroll = Math.max(0, Math.min(pane.scroll, pane.lines.length - room));
  const body  = pane.lines.slice(pane.scroll, pane.scroll + room);
  const rule  = (said: Paint.Line) => [Paint.Run("─ ", Paint.DIM), ...said, Paint.Run(" " + "─".repeat(Math.max(0, w - 3 - Paint.line_width(said))), Paint.DIM)];
  const keys  = [Paint.Run("Esc", { ...Paint.INK, b: true }), Paint.Run(" close" + (pane.lines.length > room ? " · ↑↓ PgUp PgDn scroll" : "") + " · typing goes back to the chat", Paint.DIM)];
  const lines = [rule([Paint.Run(pane.title, { ...Paint.INK, b: true, c: Draw.draw_tokens().accent })]), ...body.map((l) => [Paint.Run(" "), ...l]), ...Array.from({ length: room - body.length }, (): Paint.Line => []), rule(keys)];
  const panel = Draw.draw_off(t.scr.canvas, PANEL);
  const pad   = (l: Paint.Line): Paint.Line => [...l, Paint.Run(" ".repeat(Math.max(0, w - Paint.line_width(l))))];
  return [panel === undefined ? lines : lines.map((l) => pad(l).map((r) => ({ ...r, s: { ...r.s, g: r.s.g || panel } }))), 0];
}

// the commands suggested, framed as the picker is, fw wide, room lines
// at most: each as /help shows how it's typed (its argument dim), then
// what it does (dim), wrapped under itself; the characters the word
// matched (in the name it is matched by: a setting's key, after
// `/set `) bold in the accent, the one lit all in it, marked as the
// picker marks its choice; each line with the command it stands for (a
// click on it does what Enter does there: Popup.ts). As many as fit from the
// first shown (moved to keep the one lit whole in view; sug.tall: how
// many fit), the box as tall as all of them would be, SUGGEST lines at
// most (blank past them). None matching, a note says so
function term_suggestions(sug: Sug, fw: number, room: number): Array<[Paint.Line, Target | null]> {
  const w    = fw - 4;
  const lit  = { ...Paint.INK, c: Draw.draw_tokens().accent };
  const bold = { ...lit, b: true };
  const wide = Math.min(Math.max(0, ...sug.found.map((m) => Paint.text_width(sug.cmds[m.k][0]))), Math.floor(w / 2)) + Paint.text_width(Paint.lit_lead(true)) + 2;
  const item = (m: Screen.Match, k: number): Array<[Paint.Line, Target | null]> => {
    const [use, , text, , , about] = sug.cmds[m.k];
    const from = use.indexOf(sug.names[m.k]);
    const end  = from + sug.names[m.k].length;
    const here = k === sug.at;
    const head = [
      Paint.Run(Paint.lit_lead(here), bold),
      ...[...use.slice(0, end)].map((c, i) => Paint.Run(c, here || (m.hay !== true && m.at.includes(i - from)) ? bold : Paint.INK)),
      Paint.Run(use.slice(end), here ? lit : Paint.DIM),
    ];
    const cut  = Paint.line_cut(head, 0, wide - 2)[1];
    const pad  = Paint.Run(" ".repeat(wide - Paint.line_width(cut)));
    const ink  = here ? lit : Paint.DIM;
    const said = Paint.runs_wrap(term_found(Paint.text_clean(text), m.hay === true ? Paint.text_clean(about ?? text) : "", m.at, ink), Math.max(1, w - wide), false);
    const aim: Target = { $: "command", k };
    return said.map((l, i): [Paint.Line, Target] => [i === 0 ? [...cut, pad, ...l] : [Paint.Run(" ".repeat(wide)), ...l], aim]);
  };
  const none  = [[Paint.Run("  No command matches " + Paint.text_clean(sug.word), Paint.DIM)], null] as [Paint.Line, null];
  const all   = sug.found.length === 0 ? [[none]] : sug.found.map(item);
  const rows  = Math.min(SUGGEST, Math.max(1, room - 2), all.flat().length);
  const fits  = (from: number, to: number) => all.slice(from, to + 1).flat().length <= rows;
  sug.top     = Math.min(sug.top, sug.at);
  while (sug.top < sug.at && !fits(sug.top, sug.at)) {
    sug.top++;
  }
  let end = sug.top;
  while (end + 1 < all.length && fits(sug.top, end + 1)) {
    end++;
  }
  sug.tall    = end - sug.top + 1;
  const shown = all.slice(sug.top).flat().slice(0, rows);
  const items = [...shown, ...Array.from({ length: rows - shown.length }, (): [Paint.Line, null] => [[], null])];
  const lines = Paint.frame(items.map(([line]) => line), fw, [Paint.Run(" " + (sug.mid === null ? SUGGESTED : NAMED) + " ", { ...Paint.DIM, b: true })]);
  return lines.map((l, k) => [l, items[k - 1]?.[1] ?? null]);
}

// a suggested command's text, in ink, the word found in what it does
// (about, the part of text searched; at, its places there; none: "")
// bold in the accent
function term_found(text: string, about: string, at: number[], ink: Paint.Ink): Paint.Line {
  const from = about === "" || at.length === 0 ? -1 : text.indexOf(about);
  if (from < 0) {
    return [Paint.Run(text, ink)];
  }
  const [a, b] = [from + at[0], from + at[at.length - 1] + 1];
  return [Paint.Run(text.slice(0, a), ink), Paint.Run(text.slice(a, b), { ...ink, d: false, b: true, c: Draw.draw_tokens().accent }), Paint.Run(text.slice(b), ink)];
}

// the pages' line at screen row `row`, w wide (all of them, or the one
// shown alone: the side lists them), then the profile's name, if shown,
// the background jobs' count (jobs: shown) and the mode at its end: a
// click on a page shows it, on the name opens the profiles, on the count
// /background, on the mode /mode. The right end's first: a click takes
// the first hit, and tabs too many for the line run under it
function term_tabs(t: Term, row: number, all: boolean, w: number, jobs: boolean): void {
  const mw = Paint.line_width(Paint.tabs_mode(t.v, w));
  if (mw > 0) {
    term_hit(t, row, MARGIN + w - mw, MARGIN + w, () => term_mode(t, ""));
  }
  const bw = Paint.line_width(Paint.tabs_background(t.v, w, jobs));
  if (bw > 0) {
    const end = MARGIN + w - mw - (mw > 0 ? 3 : 0);
    term_hit(t, row, end - bw, end, () => term_background(t));
  }
  let col = MARGIN;
  for (const tab of View.view_tabs(t.v).filter((tab) => all || tab.here)) {
    const tw = Paint.text_width(tab.text);
    term_hit(t, row, col, col + tw, () => term_act(t, { $: "Goto", name: tab.name }));
    col += tw + 2;
  }
  const pw = Paint.line_width(Paint.tabs_profile(all));
  if (pw > 0) {
    term_hit(t, row, col + 1, col - 2 + pw, () => term_profile_pick(t));
  }
}
