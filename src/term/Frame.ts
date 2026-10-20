// Frame
// =====
// The screen painted, a frame at most each FRAME ms: the head; the chat
// (or a pane; over its foot the commands suggested, else the picker), the
// side beside it (Side.ts); the notes, the toast and the jump to the end;
// the rule (what runs, the merge), the input, the pages, the pick. A pipe
// gets text.

import * as os from "node:os";
import { term_suggest, term_suggested } from "./Commands.ts";
import * as Draw from "../ui/Draw.ts";
import * as Paint from "../ui/Paint.ts";
import { term_shown } from "./Notices.ts";
import { term_profile_pick } from "./ProfileCommands.ts";
import * as Screen from "../ui/Screen.ts";
import { term_area, term_under } from "./Select.ts";
import { term_side, term_side_width } from "./Side.ts";
import { term_act, type Area, type Item, type Pane, type Sug, type Term } from "./Term.ts";
import { GLYPH } from "../ui/Theme.ts";
import * as View from "../ui/View.ts";

// the folder illi works in, as the head shows it
const HERE = process.cwd().startsWith(os.homedir()) ? "~" + process.cwd().slice(os.homedir().length) : process.cwd();

// the margin left and right of the chat and the input
const MARGIN = 2;

// a note's indent: its text starts where the rule's does
const NOTE_IN = 3;

// the jump to the chat's end, and how many rows over the chat's last it
// floats
const JUMP    = " ↓ Jump to Bottom · Ctrl+End ";
const JUMP_UP = 1;

// a pipe's lines' width
const PIPE = 76;

// a paint's frame: a stream's pieces come faster than a screen shows
// them (ms)
const FRAME = 16;

// a size held this long is settled: a drag's sizes come faster (ms)
const SETTLE = 30;

// the merge over the input, as the memory's lines merge: four dots land
// one by one, each pair steps together and fuses where its dots meet
// (· · into •), the two step toward each other and fuse (●), which
// holds, fades and the next begins; each frame and how long it shows
// (ms), quicker as the dots close in. A dot is in one place at a time: a
// step or a fusion is instant, only a dot landing fades in (MERGE_IN)
// and the last one out (MERGE_OUT)
const MERGE: [string, number][] = [
  ["·      ", 150],
  ["· ·    ", 150],
  ["· · ·  ", 150],
  ["· · · ·", 320],
  [" •   • ", 260],
  ["  • •  ", 150],
  ["   ●   ", 700],
  ["       ", 200],
];
const MERGE_IN  = 140;
const MERGE_OUT = 350;
const MERGE_ALL = MERGE.reduce((n, [, ms]) => n + ms, 0);

// how often the merge paints, and its ticks a step (the side's spinners
// step with it, and a whole paint comes once a step): 30 frames a
// second, a step about a quarter second
export const STEP  = 7;
export const TICK  = 33;

// the rule's start, before the merge while work runs
const RULE_HEAD = "── ";

// the input's hint on an agent's page
const OFF = "Commands only: /help";

// the commands suggested: the most lines shown, the keys said in its top
// edge; the picker's widest
const SUGGEST   = 10;
const SUGGESTED = "Commands · ↑↓ · Tab fills in · Enter runs · Esc";
const PICKER_W  = 72;

// a new size: every row written again, once the size settles
export function term_resize(t: Term): void {
  clearTimeout(t.settle);
  t.settle = setTimeout(() => term_redraw(t), SETTLE);
}

export function term_redraw(t: Term): void {
  Screen.screen_wipe(t.scr);
  term_draw(t);
}

// a paint, a frame from now, unless one is due
export function term_draw(t: Term): void {
  if (!t.due) {
    t.due = true;
    setTimeout(() => term_paint(t), FRAME);
  }
}

// the screen, top to bottom: the head; the chat (or a pane), the side
// beside it on a wide screen; over their foot, its last line right on
// the input, a box: as a /word is typed, the commands it matches (as
// wide as the input), else the picker (at the chat's left); a row with, at the chat's right
// end, a toast in the theme's blue (its links'); a rule (what runs,
// while it does), the input, a rule (offline), the pages, the agent
// and the pick. The notes, however the chat is scrolled, end over the
// input: the newest in the rule, the one before it, faded, in the row
// above (unless the toast leaves it no room); while work runs (its
// status has the rule), the newest alone, in the row above. Only what is
// left over takes rows from the chat. Scrolled up, a button floats over
// the chat's foot, in its middle: a jump to its end (a click goes there,
// as Ctrl+End does). A pipe gets the notes as text
export function term_paint(t: Term): void {
  t.due   = false;
  const said = term_shown(t);
  if (!t.scr.tty) {
    term_print(t, said.notes.map(View.Cap));
    return;
  }
  t.hits  = [];
  t.areas = [];
  const { w, h } = Screen.screen_size();
  const full  = w - 1;
  const side  = term_side_width(t, w);
  const left  = t.side.place === "left" ? side : 0;
  const cw    = full - side - 2 * MARGIN;
  const iw    = full - 2 * MARGIN;
  const off   = !View.view_typing(t.v);
  const hint  = off ? OFF : "Message " + (t.v.agent ?? View.MAIN) + " · Tab agents · /help";
  const input = Screen.screen_input(t.scr, iw, Math.max(1, Math.floor(h / 3)), hint, off);
  const idle  = View.view_doing(t.v) === null;
  const notes = term_notes(idle ? said.notes : said.notes.slice(-1), iw - 2 * NOTE_IN);
  const ruled = idle ? notes.pop() : undefined;
  const last  = notes.at(-1);
  const roomy = last !== undefined && NOTE_IN + Paint.line_width(last) + 1 + Paint.text_width(said.toast) <= left + cw;
  const lead  = roomy ? [Paint.Run(" ".repeat(NOTE_IN)), ...notes.pop()!] : [];
  const above = notes.slice(-Math.floor(h / 4)).map((l) => [Paint.Run(" ".repeat(NOTE_IN)), ...l]);
  const tall  = Math.max(1, h - 5 - input.lines.length - above.length);
  const box   = term_box(t, iw, Math.min(cw, PICKER_W), left + MARGIN, tall + 1 + above.length);
  const top   = box === null ? Infinity : 2 + tall + above.length - box.items.length;
  const view  = term_view(t, cw, tall, 1, left + MARGIN);
  for (let r = top; r <= tall; r++) {
    view.lines[view.first + r - 1] = [];
  }
  const shown = term_area(t, view);
  const sw    = side - (left > 0 ? 3 : 2);
  const at    = left > 0 ? 0 : full - side;
  const sides = side === 0 ? [] : term_side(t, sw, tall);
  const sided = term_area(t, { key: "side", lines: sides.map((s) => s[0]), first: 0, row: 1, col: left > 0 ? 1 : at + 2, w: sw, tall: sides.length });
  const blue  = { ...Paint.INK, c: Draw.draw_theme().link ?? "4" };
  const toast = box !== null ? [] : [...lead, Paint.Run(" ".repeat(Math.max(1, left + cw - Paint.line_width(lead) - Paint.text_width(said.toast)))), Paint.Run(said.toast, blue)];
  const under = !t.v.up ? "offline" : "";
  const lines = [...above, toast, term_rule(t, iw, ruled), ...input.lines, Paint.rule_text(under, iw), Paint.tabs_line(t.v, iw, side === 0)];
  const foot  = term_area(t, { key: "foot", lines, first: 0, row: 1 + tall, col: MARGIN, w: iw, tall: lines.length });
  const head  = term_area(t, { key: "head", lines: [term_head(t, full)], first: 0, row: 0, col: 0, w: full, tall: 1 });
  const rows: Screen.Piece[][] = [[{ col: 0, w: full, line: head[0] }]];
  for (let k = 0; k < tall; k++) {
    const by = sides[k] === undefined || (box?.wide && 1 + k >= top) ? [] : [{ col: at, w: side, line: left > 0 ? [Paint.Run(" "), ...sided[k], Paint.Run(" ".repeat(Math.max(0, sw - Paint.line_width(sided[k]))) + " │", Paint.DIM)] : [Paint.Run("│ ", Paint.DIM), ...sided[k]] }];
    rows.push([{ col: left + MARGIN, w: cw, line: shown[k] }, ...by]);
    term_hit(t, 1 + k, at, at + side, by.length === 0 ? null : sides[k]?.[1] ?? null);
  }
  rows.push(...foot.map((line) => [{ col: MARGIN, w: iw, line }]));
  if (box !== null) {
    term_over(t, rows, box, top);
  } else if (t.pane === null && t.scroll > 0) {
    term_jump(t, rows, tall, left + MARGIN, cw, blue);
  }
  t.hover = t.sel?.held ? undefined : term_under(t, t.scr.point);
  term_tabs(t, h - 1, side === 0);
  const cursor = { row: 3 + tall + above.length + input.at.row, col: MARGIN + input.at.col };
  t.ruled = { row: 2 + tall + above.length, at: cursor, beat: Math.floor(Date.now() / (STEP * TICK)) };
  Screen.screen_paint(t.scr, rows, cursor);
}

// the notes' lines, oldest first, w wide: the newest in the ink, the
// ones before it faded
function term_notes(notes: string[], w: number): Paint.Line[] {
  return notes.flatMap((text, k) => Paint.runs_wrap([Paint.Run(Paint.text_clean(text), { ...(k === notes.length - 1 ? Paint.INK : Paint.DIM), i: true })], w, false));
}

// the jump to the chat's end, floating over its foot (JUMP_UP rows over
// its last), in its middle: reversed, in the theme's blue, a space clear
// on each side; a click goes there, as Ctrl+End does. Too narrow: its
// arrow alone
function term_jump(t: Term, rows: Screen.Piece[][], tall: number, col: number, w: number, blue: typeof Paint.INK): void {
  const said = JUMP.length + 2 <= w ? JUMP : " ↓ ";
  const bw   = said.length + 2;
  const row  = 1 + Math.max(0, tall - 1 - JUMP_UP);
  const at   = col + Math.max(0, Math.floor((w - bw) / 2));
  rows[row].push({ col: at, w: bw, line: [Paint.Run(" "), Paint.Run(said, { ...blue, v: true, b: true }), Paint.Run(" ")] });
  term_hit(t, row, at, at + bw, () => (t.scroll = 0));
}

// the rule over the input; while work runs, at its left: the merge,
// what runs (bold, in the accent), how long it has run, what it is at,
// how to stop it, cut to the width; else a note's line, if one is given
function term_rule(t: Term, w: number, note?: Paint.Line): Paint.Line {
  const doing = View.view_doing(t.v);
  term_spin(t, doing !== null);
  if (doing === null) {
    return note === undefined ? Paint.rule_text("", w) : [Paint.Run("─".repeat(NOTE_IN - 1) + " ", Paint.DIM), ...note, Paint.Run(" " + "─".repeat(Math.max(0, w - NOTE_IN - 1 - Paint.line_width(note))), Paint.DIM)];
  }
  const now  = Date.now();
  const c    = Draw.draw_theme().accent ?? "5";
  const head = [Paint.Run(RULE_HEAD, Paint.DIM), ...term_merge(now - t.since, c, t.scr.canvas), Paint.Run(" "), Paint.Run(doing.verb, { ...Paint.INK, c, b: true })];
  const tail = [term_elapsed(now - t.since), doing.what, doing.stop ? "Esc to interrupt" : ""].filter((x) => x !== "").join(" · ");
  const room = w - Paint.line_width(head) - 6;
  const said = Paint.text_width(tail) <= room ? tail : room < 2 ? "" : Paint.runs_wrap([Paint.Run(tail)], room - 1, true)[0].map((r) => r.x).join("") + "…";
  const used = Paint.line_width(head) + Paint.text_width(said) + 4;
  return [...head, Paint.Run(" · " + said + " ", Paint.DIM), Paint.Run("─".repeat(Math.max(0, w - used)), Paint.DIM)];
}

// the merge's clock: it starts as work does (when kept), stops as it
// ends; each tick of it paints at once (no frame's wait, which would
// make the ticks uneven)
function term_spin(t: Term, on: boolean): void {
  if (on && t.spin === undefined) {
    t.since = Date.now();
    t.spin  = setInterval(() => term_tick(t), TICK);
  } else if (!on && t.spin !== undefined) {
    clearInterval(t.spin);
    t.spin = undefined;
  }
}

// a tick of the merge: its cells alone written again, where the rule
// was last painted (the rest of it, its clock too, changes far less
// often than the merge does); all of it once a step has passed (the
// side's spinners step with it), work ended or text is chosen (its look
// may cover the rule); nothing while a paint is due
function term_tick(t: Term): void {
  const r = t.ruled;
  if (t.due) {
    return;
  }
  if (r === null || t.sel !== null || !View.view_running(t.v) || Math.floor(Date.now() / (STEP * TICK)) !== r.beat) {
    return term_paint(t);
  }
  const c = Draw.draw_theme().accent ?? "5";
  Screen.screen_cells(t.scr, r.row, MARGIN + RULE_HEAD.length, term_merge(Date.now() - t.since, c, t.scr.canvas), r.at);
}

// the merge ms into its work: the frame of MERGE it is at, in the
// accent (●, the last dot, bold); a dot landing in it (a frame with more
// dots than the one before) fades in over MERGE_IN, the one before an
// empty frame out over its last MERGE_OUT, eased (toward the background,
// if told; else dim)
function term_merge(ms: number, c: string, canvas: string | undefined): Paint.Line {
  let at = ms % MERGE_ALL;
  let k  = 0;
  while (at >= MERGE[k][1]) {
    at -= MERGE[k][1];
    k++;
  }
  const [now, long] = MERGE[k];
  const was  = MERGE.at(k - 1)![0];
  const next = MERGE[(k + 1) % MERGE.length][0];
  const dots = (row: string) => row.replaceAll(" ", "").length;
  const out  = next.trim() === "" ? term_ease(Math.max(0, at - (long - MERGE_OUT)) / MERGE_OUT) : 0;
  const land = dots(now) > dots(was) ? 1 - term_ease(Math.min(1, at / MERGE_IN)) : 0;
  return [...now].map((x, i) => {
    const fade = x === " " ? 0 : Math.max(out, was[i] === " " ? land : 0);
    if (fade <= 0.01) {
      return Paint.Run(x, { ...Paint.INK, c, b: x === "●" });
    }
    return Paint.Run(x, c.startsWith("#") && canvas !== undefined ? { ...Paint.INK, c: term_mix(c, canvas, fade), b: x === "●" } : { ...Paint.INK, c, d: fade > 0.2 });
  });
}

// a ramp eased: slow at its ends, quick between (0 to 1)
function term_ease(u: number): number {
  return u * u * (3 - 2 * u);
}

// a color f of the way to another (#rrggbb)
export function term_mix(a: string, b: string, f: number): string {
  const at = (hex: string, k: number) => parseInt(hex.slice(k, k + 2), 16);
  return "#" + [1, 3, 5].map((k) => Math.round(at(a, k) + (at(b, k) - at(a, k)) * f).toString(16).padStart(2, "0")).join("");
}

// how long, as a person says it: 7s, 2m 05s, 1h 03m
function term_elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return s < 60 ? s + "s" : s < 3600 ? Math.floor(s / 60) + "m " + two(s % 60) + "s" : Math.floor(s / 3600) + "h " + two(Math.floor(s / 60) % 60) + "m";
}

// a pipe's rows, as text
export function term_print(t: Term, rows: View.Row[]): void {
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

// the head: Illimitable, the page shown, the folder; at its right, a pane's
// title, else what works
function term_head(t: Term, w: number): Paint.Line {
  const bold  = { ...Paint.INK, b: true };
  const page  = t.v.page === null ? [] : [Paint.Run(" › " + t.v.page.name, bold)];
  const left  = [Paint.Run(" " + View.NAME, bold), ...page, Paint.Run("  " + HERE, Paint.DIM)];
  const work  = t.v.agents.length === 0 ? "" : t.v.agents.length + " at work";
  const right = t.pane !== null ? t.pane.title + " · Esc closes" : work;
  return Paint.ends_line(left, right === "" ? "" : right + " ", w);
}

// the area over the input, tall rows from screen row `row`, column
// `col`: a pane's lines, else the chat's (each scrolled by a drag past
// its edge)
function term_view(t: Term, w: number, tall: number, row: number, col: number): Area {
  const pane  = t.pane;
  const [lines, first] = pane !== null ? term_paned(pane, w, tall) : term_chat(t, w, tall, row, col);
  const scroll = pane !== null ? (d: number) => void (pane.scroll = Math.max(0, pane.scroll + d)) : (d: number) => void (t.scroll = Math.max(0, t.scroll - d));
  return { key: pane !== null ? "pane" : "chat", lines, first, row, col, w, tall, scroll };
}

// the box over the chat's foot, room lines at most: as a /word is typed,
// the commands it matches, iw wide (wide: over the side too), else the
// picker, pw wide at column col (none: null)
function term_box(t: Term, iw: number, pw: number, col: number, room: number): { items: Item[]; col: number; w: number; wide: boolean } | null {
  const sug = term_suggest(t);
  if (sug !== null) {
    return { items: term_suggestions(t, sug, iw, room), col: MARGIN, w: iw, wide: true };
  }
  return t.choose === null ? null : { items: term_picker(t, pw).slice(0, room), col, w: pw, wide: false };
}

// the box laid over the rows from screen row top on (the chat's under it
// blanked by the caller); a click on its lines goes to it before what
// is under it
function term_over(t: Term, rows: Screen.Piece[][], box: { items: Item[]; col: number; w: number }, top: number): void {
  const under = t.hits;
  t.hits = [];
  for (const [k, [line, run]] of box.items.entries()) {
    rows[top + k].push({ col: box.col, w: box.w, line });
    term_hit(t, top + k, box.col, box.col + box.w, run);
  }
  t.hits.push(...under);
}

// the chat's lines and the first shown, tall of them: its rows (laid out
// again only once they changed), then what streams or is waited on.
// Scrolled up, the lines read stay in place as more come below, and about
// in place at a new width; a block asked for (/open, /close) shows at the
// top
function term_chat(t: Term, w: number, tall: number, row: number, col: number): [Paint.Line[], number] {
  if (t.body === null || t.body.ver !== t.ver || t.body.w !== w) {
    const marks: Paint.Mark[] = [];
    t.body = { ver: t.ver, w, lines: Paint.rows_lines(View.view_body(t.v), w, marks, 1), marks };
  }
  const tail  = Paint.rows_lines(View.view_tail(t.v, false), w);
  const lines = [[], ...t.body.lines, ...(tail.length === 0 ? [] : [[], ...tail])];
  const find  = t.find === null ? undefined : t.body.marks.find((m) => m.id === t.find![0] && m.n === t.find![1]);
  const wider = t.seen.end - t.seen.col !== w;
  if (t.scroll > 0 && t.seen.total > 0) {
    t.scroll = wider ? Math.round((t.scroll * lines.length) / t.seen.total) : t.scroll + Math.max(0, lines.length - t.seen.total);
  }
  if (find !== undefined) {
    t.scroll = lines.length - tall - find.from + 1;
  }
  t.find   = null;
  t.scroll = Math.max(0, Math.min(t.scroll, lines.length - tall));
  const first = Math.max(0, lines.length - tall - t.scroll);
  t.seen = { total: lines.length, marks: t.body.marks, row, first, tall, col, end: col + w };
  return [lines, first];
}

// a pane's lines, made for this width, and the first shown
function term_paned(pane: Pane, w: number, tall: number): [Paint.Line[], number] {
  if (pane.w !== w) {
    [pane.w, pane.lines] = [w, pane.make(w)];
  }
  const lines = [[], ...pane.lines];
  pane.scroll = Math.max(0, Math.min(pane.scroll, lines.length - tall));
  return [lines, pane.scroll];
}

// the picker, framed, w wide: each option (Illi's own and each of the
// user's primary agents; each profile), what it is, the one now marked,
// the choice bold; a click on one picks it
function term_picker(t: Term, w: number): Item[] {
  const c     = t.choose!;
  const bold  = { ...Paint.INK, b: true };
  const wide  = Math.max(...c.names.map((name) => name.length));
  const line  = (name: string, k: number): Paint.Line => [
    Paint.Run(k === c.at ? "› " : "  ", bold),
    Paint.Run((k === c.here ? GLYPH.here : GLYPH.tab) + " ", Paint.DIM),
    Paint.Run(name.padEnd(wide), k === c.at ? bold : Paint.INK),
    Paint.Run("  " + Paint.text_clean(c.about[k]), Paint.DIM),
  ];
  const title = [Paint.Run(" " + c.title + " · ↑↓ Enter · Esc ", { ...Paint.DIM, b: true })];
  const lines = Paint.frame(c.names.map((name, k) => Paint.runs_wrap(line(name, k), w - 4, true)[0]), w, title);
  const pick  = (k: number) => {
    t.choose = null;
    c.pick(k);
  };
  return lines.map((l, k) => [l, k >= 1 && k <= c.names.length ? () => pick(k - 1) : null]);
}

// the commands suggested, framed as the picker is, fw wide, room lines
// at most: each as /help shows how it's typed (its argument dim), then
// what it does (dim), wrapped under itself; the characters the word
// matched bold in the accent, the one lit all in it, marked as the
// picker marks its choice; a click takes one. As many as fit from the
// first shown (moved to keep the one lit whole in view; sug.tall: how
// many fit), the box as tall as all of them would be, SUGGEST lines at
// most (blank past them). None matching, a note says so
function term_suggestions(t: Term, sug: Sug, fw: number, room: number): Item[] {
  const w    = fw - 4;
  const lit  = { ...Paint.INK, c: Draw.draw_theme().accent ?? "5" };
  const bold = { ...lit, b: true };
  const wide = Math.min(Math.max(0, ...sug.found.map((m) => Paint.text_width(sug.cmds[m.k][0]))), Math.floor(w / 2)) + 4;
  const item = (m: Screen.Match, k: number): Item[] => {
    const [use, , text] = sug.cmds[m.k];
    const name = use.split(" ")[0];
    const here = k === sug.at;
    const head = [
      Paint.Run(here ? "› " : "  ", bold),
      ...[...name].map((c, i) => Paint.Run(c, here || m.at.includes(i - 1) ? bold : Paint.INK)),
      Paint.Run(use.slice(name.length), here ? lit : Paint.DIM),
    ];
    const cut  = Paint.line_cut(head, 0, wide - 2)[1];
    const pad  = Paint.Run(" ".repeat(wide - Paint.line_width(cut)));
    const said = Paint.runs_wrap([Paint.Run(Paint.text_clean(text), here ? lit : Paint.DIM)], Math.max(1, w - wide), false);
    const run  = () => term_suggested(t, use, true);
    return said.map((l, i): Item => [i === 0 ? [...cut, pad, ...l] : [Paint.Run(" ".repeat(wide)), ...l], run]);
  };
  const none  = [[Paint.Run("  No command matches " + Paint.text_clean(sug.word), Paint.DIM)], null] as Item;
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
  const items = [...shown, ...Array.from({ length: rows - shown.length }, (): Item => [[], null])];
  const lines = Paint.frame(items.map(([line]) => line), fw, [Paint.Run(" " + SUGGESTED + " ", { ...Paint.DIM, b: true })]);
  return lines.map((l, k) => [l, items[k - 1]?.[1] ?? null]);
}

// the pages' line at screen row `row` (all of them, or the one shown
// alone: the side lists them), after the profile's name (a click opens
// the profiles): a click on a page shows it
function term_tabs(t: Term, row: number, all: boolean): void {
  let col = MARGIN + Paint.line_width(Paint.tabs_profile());
  term_hit(t, row, MARGIN, col, col === MARGIN ? null : () => term_profile_pick(t));
  for (const tab of View.view_tabs(t.v).filter((tab) => all || tab.here)) {
    const tw = Paint.text_width(tab.text);
    term_hit(t, row, col, col + tw, () => term_act(t, { $: "Goto", name: tab.name }));
    col += tw + 2;
  }
}
