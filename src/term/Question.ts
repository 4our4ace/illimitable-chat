// Question
// ========
// A question takes the input's place (Frame.ts): anything that asks the
// person to decide, whether illi asks or a command confirms. Its picker
// (Term question, never a list's popup): the permission question
// (Asks.ts), a confirmation (Switch to X?, Delete profile X?, Forget X?,
// Read-only mode refused it, what a new profile starts with), a line
// asked for (Commands.ts term_ask: a name, a path, why not); else illi's
// own questions, their form (Asks.ts). The lists a person opens are
// popups (Popup.ts); one opened over a question (Ctrl+P) shows over it,
// the question back as it closes. A question has the rows between the
// rules round the input, its full width (under the side panel too): the
// rule over it says its title (the form's: who asks), its keys and what
// the lit answer takes besides (its foot); under it, the lines leading
// its answers (why it asks; what it would do, bold), then its answers,
// the lit one marked, or the line asked, as the input shows a message
// typed; the form, its tabs, the question shown, its options, its words
// and its keys. As tall as its lines, half the screen's rows at most (and
// no more than the rest of the screen leaves it: Frame.ts), the chat
// keeping the rest: too tall, its lead gives way, cut to fit, a dim line
// after it saying how much more, and scrolls by the wheel over it and
// PgUp, PgDn (too short for a line of it and that one, it gives way
// whole). A long command in its lead (the permission question's, told
// where in it the checks found what made them ask: Chooser fold) folds,
// taller than FOLD rows: its first line, the lines holding what made
// them ask and its last show, each run of the rest one dim line saying
// how many lines it hides ("… 37 lines"), and each of those lines
// wrapping to many rows (a one-liner) so too by its rows: its first,
// those holding what made them ask and its last ("… 12 rows"; folded
// anew at each width), so a fold never hides why it asks, nor a row
// alone; Ctrl+O shows it whole and folds it again (its rule says which:
// "Ctrl+O all", "Ctrl+O fold"), as a click on such a line shows it whole,
// its lead from its top, the lit answer and the hold as they were; folded
// or whole, too tall it is cut as above, such a line last in view taking
// the cut's words after its own (never two such lines one over the
// other). Its answers always show, each whole (one taller than ANSWER,
// naming what it keeps by a long command: its start and its end), on a
// screen too short for them a line each, as many as fit about the lit
// one; the form, as tall as its tallest tab (tabbing never moves the
// chat), its lines between its tabs and its keys scrolling, the lit row
// kept in view. Each row is one line, drawn once, no control character
// in it (its lead and names cleaned where laid out: question_lead,
// Popup.ts popup_name_lines), its lead laid out once a width (a command
// whole may run long: Tools.whole). Nothing is dimmed, and the input as
// typed is kept under it, back once it is answered. It has every key but
// Ctrl+L, Ctrl+Z, Ctrl+P and the leader (Keys.ts); Esc, Ctrl+C and
// Ctrl+D close it (the permission question's No, the form's skip; Ctrl+C
// copies text chosen instead, as ever). On its rows the row under the
// pointer lights and a click does what Enter does (Popup.ts popup_mouse;
// on a tab of the form, goes there; on a line saying what a fold hides,
// lit while the pointer is on it, shows the command whole, held by
// nothing as it answers nothing), the wheel scrolls its lead or the
// form's lines (its answers never move by it); all else on the screen
// works as with no question (the wheel scrolls the chat, text is chosen
// and copied, the side and the tabs answer; a click outside never answers
// it). A question illi asks (the permission question, its form) holds
// Enter, Space and a click for ARM after it first shows (question_held),
// so the key that ended a sentence never answers it; Esc, its no, never
// waits.

import { term_form, term_form_lines } from "./Asks.ts";
import * as Paint from "../ui/Paint.ts";
import { STEP, popup_at, popup_entries, popup_foot, popup_rows, popup_view } from "./Popup.ts";
import * as Screen from "../ui/Screen.ts";
import type { Box, Chooser, Form, Target, Term } from "./Term.ts";

// how long a question just shown holds Enter, Space and a click (ms):
// less than it takes to read it
const ARM = 500;

// the most lines an answer takes: one taller (one naming what it keeps
// by a long command, which the lead shows) shows its first lines and,
// after an ellipsis, how it ends (its scope)
const ANSWER = 3;

// the most rows a command in a question's lead takes before it folds
// (Chooser fold)
const FOLD = 4;

// a lead folded (question_folded): its lines, and what each stands for
// (a line saying how many it hides: a click shows them all)
type Folded = { lines: Paint.Line[]; aims: Array<Target | null> };

// the leads as laid out last (question_lead), by the lead: the fold and
// the width they were laid out for, all their lines, and folded (null:
// they don't fold at that width)
const LEADS = new WeakMap<Paint.Line[], { fold: Chooser["fold"]; w: number; all: Paint.Line[]; folded: Folded | null }>();

// a question laid out at the input: what it was laid out for (its
// picker, illi's form), the rule over it, its lines and what each stands
// for (Box rows), the cursor's spot in them (null: hidden), its answers
// and lead as laid out (Box's)
export type Asked = { of: object; rule: Paint.Line; lines: Paint.Line[]; rows: Box["rows"]; at: Screen.Spot | null; shape: Pick<Box, "list" | "lines" | "tall" | "ahead" | "lead" | "folds"> };

// the question shown at the input: its picker, else illi's form (null:
// none)
export function question_of(t: Term): Chooser | Form | null {
  return t.question ?? term_form(t)?.[1] ?? null;
}

// whether the chat's question (t.asking: the permission question, the
// line it asks why, illi's form) is the one shown, no list over it
function question_illi(t: Term): boolean {
  const a = t.asking;
  return a != null && !a.done && t.choose === null && (t.question !== null ? t.question === a.c : term_form(t) !== null);
}

// a paint: the chat's question shown stamped as it first shows
// (t.asking.shown), the stamp kept while it shows (the line asked why,
// another of the form's tabs too); hidden (a list over it, another
// question in its place, another profile shown in the window:
// Member.ts), it shows anew after
export function question_shown(t: Term): void {
  if (t.asking != null) {
    t.asking.shown = question_illi(t) ? t.asking.shown ?? Date.now() : null;
  }
}

// whether the chat's question still holds Enter, Space and a click: till
// ARM after it first showed, as painted (not painted yet: held, as one
// read may bring the question and the keys after it)
export function question_held(t: Term): boolean {
  const a = t.asking;
  return question_illi(t) && (a!.shown == null || Date.now() - a!.shown < ARM);
}

// the most lines a question takes on a screen h rows tall, free of them
// for it (Frame.ts: all but those the rest of the screen keeps), one at
// least; and of them the most a line typed takes
function question_most(h: number, free: number): number {
  return Math.max(1, Math.min(Math.floor(h / 2), free));
}

function question_words(h: number): number {
  return Math.max(1, Math.floor(h / 4));
}

// the question at the input laid out, w wide, on a screen h rows tall,
// free of them for it (none: null)
export function question_laid(t: Term, w: number, h: number, free: number): Asked | null {
  const f = term_form(t)?.[1] ?? null;
  return t.question !== null ? question_picker(t, t.question, w, h, free) : f !== null ? question_form(t, f, w, h, free) : null;
}

// a question's picker laid out w wide, on a screen h rows tall, free of
// them for it: over its answers (or the line asked) the lines leading
// them (Chooser lead: why it asks, what it would do; question_lead;
// a long command folded: question_folded), from those scrolled past
// (Chooser past), as many as leave its answers room in question_most;
// cut, a dim line after them says how many more follow (none: how many
// are above) and how they scroll, so a cut lead takes two lines at
// least, else gives way whole (with one line free, that line alone says
// how many there are); a line saying what a fold hides last in view takes
// that line's words after its own, never two such lines one over the
// other. The line a fold hides under the pointer lit (question_under).
// Its answers as a list's options are (Popup.ts popup_rows), the lit one
// marked, its dot filled, each whole up to question_cap's lines (past
// them: question_cut), all of them (on a screen too short for them:
// question_view); a line asked, as the input shows a message typed (its
// hint while empty), question_words at most (scrolled only as its
// cursor leaves them: Screen.ts screen_input), the cursor in it. Its
// rule: its title, then its keys (where it
// has answers; Ctrl+O where its command folds: "all" folded, "fold"
// shown whole) and what the lit one takes besides (its foot; a line's:
// what it takes, or why it won't do), then Esc, the no every question
// takes, unless the foot says it already
function question_picker(t: Term, c: Chooser, w: number, h: number, free: number): Asked {
  const laid  = c.lead === undefined ? null : question_lead(c, w);
  const folds = laid?.folded != null;
  const shut  = folds && c.fold?.open !== true;
  const lead  = laid === null ? [] : shut ? laid.folded!.lines : laid.all;
  const aim   = (k: number): Target | null => (shut ? laid!.folded!.aims[k] ?? null : null);
  const list  = popup_entries(c);
  const most  = question_most(h, free);
  const each  = c.ask !== null ? [] : popup_rows(c, list, list.map((_, e) => e), w);
  const cap   = question_cap(each.map((e) => e.length), most - Math.min(lead.length, 2));
  const cut   = each.map((lines, e) => question_cut(lines, typeof list[e] === "number" ? c.names[c.shown[list[e]].k] : "", cap, w));
  const view  = question_view(c, list, cut.map((lines) => lines.length), most);
  const opts  = view.flatMap((e) => cut[e]);
  const line  = c.ask === null ? null : Screen.screen_input({ ...t.scr, ed: c.find! }, w, question_words(h), c.ask.hint, false);
  const ends  = line === null ? opts.length : line.lines.length;
  const fit   = Math.max(0, most - ends);
  const ahead = lead.length <= fit ? lead.length : Math.max(0, fit - 1);
  const past  = ahead === 0 ? 0 : (c.past = Math.max(0, Math.min(c.past ?? 0, lead.length - ahead)));
  const below = lead.length - past - ahead;
  const said  = below > 0 ? below.toLocaleString("en-US") + (below === 1 ? " more line" : " more lines") : past.toLocaleString("en-US") + (past === 1 ? " line above" : " lines above");
  const cuts  = ahead < lead.length && fit > 0;
  const joins = cuts && ahead > 0 && aim(past + ahead - 1) !== null;
  const tail  = (joins ? " · " : "… ") + said + (ahead > 0 ? " · wheel, PgUp/PgDn" : "");
  const shown = lead.slice(past, past + ahead);
  const under = question_under(t, c);
  const lit   = (l: Paint.Line, j: number) => (j === under && aim(past + j) !== null ? l.map((r) => ({ ...r, s: Paint.INK })) : l);
  const read  = [...shown.map(lit).map((l, j) => (joins && j === ahead - 1 ? [...l, Paint.Run(tail, Paint.DIM)] : l)), ...(cuts && !joins ? [[Paint.Run(tail, Paint.DIM)]] : [])];
  const rows  = [...read.map((_, j) => (j < ahead ? aim(past + j) : null)), ...(line === null ? opts.map(([, aim]) => aim) : line.lines.map(() => null))];
  const at    = line === null ? null : { row: read.length + line.at.row, col: line.at.col };
  const foot  = popup_foot(c);
  const rule  = question_rule(w, c.title, [c.ask === null ? "↑↓ Enter" : "", folds ? (shut ? "Ctrl+O all" : "Ctrl+O fold") : "", foot, /\bEsc\b/.test(foot) ? "" : "Esc"]);
  return { of: c, rule, lines: [...read, ...(line === null ? opts.map(([l]) => l) : line.lines)], rows, at, shape: { list: read.length, lines: opts.length, tall: view.length, ahead, lead: lead.length, folds } };
}

// the lines leading a question's answers (Chooser lead) wrapped w wide,
// each run cleaned as text is (Paint.text_clean: no control character
// reaches the screen, whoever made them), all of them and folded
// (question_folded); made once a lead, fold and width, as a paint lays
// the question out again and again and a command whole may run to many
// lines (a new width wraps and folds it anew)
function question_lead(c: Chooser, w: number): { all: Paint.Line[]; folded: Folded | null } {
  const lead  = c.lead ?? [];
  const known = LEADS.get(lead);
  if (known?.w === w && known.fold === c.fold) {
    return known;
  }
  const clean = lead.map((l) => l.map((r) => ({ ...r, x: Paint.text_clean(r.x) })));
  const each  = clean.map((l) => Paint.runs_wrap(l, Math.max(1, w), false));
  const laid  = { fold: c.fold, w, all: each.flat(), folded: c.fold === undefined ? null : question_folded(clean.map((l) => l.map((r) => r.x).join("")), each, c.fold) };
  LEADS.set(lead, laid);
  return laid;
}

// a lead (texts: its lines' text, cleaned; each: their rows, as wrapped)
// with its command folded (fold): the lines before the command, then its
// first line, those kept (holding what made the checks ask, a cut's)
// and the lead's last, each of them taller than a row its first row,
// those holding a spot and its last (question_rows); each run of the
// rest one dim line saying how many lines it hides ("… 37 lines"), or
// how many rows of a line ("… 12 rows"): a click shows them all; a run
// of one row shown as it is (its line takes no more). Each line kept
// showing its first row and its last, no two such lines ever meet, and
// a fold never puts one right over the cut's (question_picker). Null:
// it doesn't fold, the command FOLD rows at most or nothing hidden
function question_folded(texts: string[], each: Paint.Line[][], fold: NonNullable<Chooser["fold"]>): Folded | null {
  const keep = new Set([...fold.keep, ...fold.spots.map(([k]) => k), fold.from, each.length - 1]);
  const on   = new Map<number, Array<[number, number]>>();
  for (const [k, a, b] of fold.spots) {
    if (!on.has(k)) {
      on.set(k, []);
    }
    on.get(k)!.push([a, b]);
  }
  const all  = each.flatMap((rows, k) => {
    const shows = k < fold.from ? rows.map(() => true) : keep.has(k) ? question_rows(texts[k], rows, on.get(k) ?? []) : rows.map(() => false);
    return rows.map((row, j) => ({ row, k, hid: shows[j] ? null : keep.has(k) ? ("row" as const) : ("line" as const) }));
  });
  const lines: Paint.Line[] = [];
  const aims: Array<Target | null> = [];
  let gaps   = 0;
  for (let i = 0; i < all.length;) {
    let j = i + 1;
    while (all[i].hid !== null && j < all.length && all[j].hid !== null) {
      j++;
    }
    const n    = all[i].hid === "line" ? all[j - 1].k - all[i].k + 1 : j - i;
    const said = all[i].hid === "line" ? (n === 1 ? " line" : " lines") : " rows";
    lines.push(j - i > 1 ? [Paint.Run("… " + n.toLocaleString("en-US") + said, Paint.DIM)] : all[i].row);
    aims.push(j - i > 1 ? { $: "fold", k: gaps++ } : null);
    i = j;
  }
  return all.filter((r) => r.k >= fold.from).length > FOLD && gaps > 0 ? { lines, aims } : null;
}

// the rows a fold shows of a line it keeps (rows: as runs_wrap wrapped
// it, each a stretch of its text in turn, the spaces at a break
// dropped): its first, its last and each a spot is on (spots: from, to
// by character of its text; one on no character, the row where it
// sits), each row found where it is in the text, so a line whose rows
// aren't there as wrapped shows whole, never hiding a spot
function question_rows(text: string, rows: Paint.Line[], spots: Array<[number, number]>): boolean[] {
  const starts: number[] = [];
  let end = 0;
  for (const row of rows) {
    const x  = row.map((r) => r.x).join("");
    const at = text.indexOf(x, end);
    if (at < 0 || text.slice(end, at).trim() !== "") {
      return rows.map(() => true);
    }
    starts.push(at);
    end = at + x.length;
  }
  const shows = rows.map((_, j) => j === 0 || j === rows.length - 1);
  let [j, upto] = [0, -1];
  for (const [a, b] of [...spots].sort((x, y) => x[0] - y[0])) {
    while (j + 1 < rows.length && starts[j + 1] <= a) {
      j++;
    }
    for (let k = Math.max(j, upto + 1); k < rows.length && (k === j || starts[k] < Math.max(b, a + 1)); k++) {
      shows[k] = true;
      upto     = k;
    }
  }
  return shows;
}

// the row of the question at the input the pointer is on, as last painted
// (none: -1), while what is under the pointer lights (Select.ts: it
// moved since a key, the window focused)
function question_under(t: Term, c: Chooser): number {
  const box = t.box;
  const p   = t.scr.point;
  return box?.of === c && t.pointed && t.scr.away !== true && popup_at(box, p) !== "out" ? p.row - box.row : -1;
}

// whether the question at the input has a command that folds, as last
// painted (Ctrl+O folds it or shows it whole: Keys.ts)
export function question_folds(t: Term): boolean {
  return t.question !== null && t.box?.of === t.question && t.box.folds;
}

// a question's command folded, or shown whole (Ctrl+O; a click on a line
// saying what the fold hides: Popup.ts), its lead from its top again; the
// lit answer and the hold on Enter as they were
export function question_toggle(c: Chooser): void {
  if (c.fold !== undefined) {
    c.fold.open = !c.fold.open;
    c.past      = 0;
  }
}

// a question's answers in view (their entries' indices in list; tall:
// each one's lines): all of them, as fit in most lines; on a screen too
// short for them (more answers than its rows), as many as fit, the lit
// one among them, as a list scrolls (Popup.ts popup_view)
function question_view(c: Chooser, list: Array<string | number>, tall: number[], most: number): number[] {
  if (tall.reduce((n, x) => n + x, 0) <= most) {
    c.top = 0;
    return list.map((_, e) => e);
  }
  return popup_view(c, list, tall, most);
}

// the most lines each answer takes (tall: each one's lines), ANSWER at
// most, fewer while they would take more than room (the lead's first
// line and the one saying it is cut left out of question_most); one
// each at least
function question_cap(tall: number[], room: number): number {
  let cap = ANSWER;
  while (cap > 1 && tall.reduce((n, x) => n + Math.min(x, cap), 0) > room) {
    cap--;
  }
  return cap;
}

// an answer's lines (each with what it stands for; its name's), cap at
// most: taller, its first lines and then how its name ends (its scope:
// "in this project"), after an ellipsis, as much as a line holds; cap 1:
// its first line, an ellipsis at its end. w wide
function question_cut(lines: Array<[Paint.Line, Target | null]>, name: string, cap: number, w: number): Array<[Paint.Line, Target | null]> {
  if (lines.length <= cap) {
    return lines;
  }
  const aim  = lines[0][1];
  const pad  = lines[1][0][0];
  const said = Paint.text_clean(name);
  const room = Math.max(1, w - Paint.text_width(pad.x) - 1);
  const ends = Paint.line_cut([Paint.Run(said, lines.at(-1)![0].at(-1)!.s)], Paint.text_width(said) - room, Infinity)[1];
  const cut  = [...Paint.line_cut(lines[0][0], 0, w - 1)[1], Paint.Run("…", Paint.DIM)];
  return cap === 1 ? [[cut, aim]] : [...lines.slice(0, cap - 1), [[pad, Paint.Run("…", Paint.DIM), ...ends], aim]];
}

// illi's form laid out w wide, on a screen h rows tall, free of them
// for it (Asks.ts term_form_lines, the words question_words at most): as
// tall as its tallest tab (the answers' too), question_most at most, so
// going from tab to tab moves nothing; its tabs hold at its top and its
// keys at its foot (the room allowing), its lines between scroll (Form
// top), kept to show the lit row (question_row; the answers have none:
// only the wheel scrolls them), a shorter tab's blank under them. The
// cursor in the words, while they show. Its rule: who asks
function question_form(t: Term, f: Form, w: number, h: number, free: number): Asked {
  const max  = question_words(h);
  const tabs = Array.from({ length: f.each.length + 1 }, (_, k) => term_form_lines(t, w, max, k)!);
  const tall = Math.min(question_most(h, free), Math.max(...tabs.map((e) => e.tabs.length + e.body.length + e.keys.length)));
  const laid = tabs[f.tab];
  const head = laid.tabs.slice(0, tall);
  const keys = laid.keys.slice(0, Math.max(0, tall - head.length - 1));
  const room = Math.max(0, tall - head.length - keys.length);
  const e    = f.each[f.tab];
  const keep = e === undefined ? null : question_row(laid.body, laid.at, e.at);
  const top  = Math.max(0, Math.min(f.top, laid.body.length - room));
  f.top      = keep === null ? top : Math.max(0, Math.min(keep[0], Math.max(top, keep[1] - room + 1)));
  const view = laid.body.slice(f.top, f.top + room);
  const pad  = Array.from({ length: room - view.length }, (): [Paint.Line, null] => [[], null]);
  const cur  = laid.at;
  const at   = cur === null || cur.row < f.top || cur.row >= f.top + room ? null : { row: head.length + cur.row - f.top, col: cur.col };
  const rows = [...laid.spans.slice(0, head.length), ...[...view, ...pad].map(([, aim]) => aim), ...keys.map(() => null)];
  return { of: f, rule: question_rule(w, laid.who + " asks", []), lines: [...head, ...[...view, ...pad].map(([l]) => l), ...keys], rows, at, shape: { list: head.length, lines: room, tall: laid.body.length, ahead: 0, lead: 0, folds: false } };
}

// the lines row k of illi's form takes in its lines as laid out (body,
// the cursor at `at`): its first, its last (the words', the last row:
// their cursor's line); none such: null
function question_row(body: Array<[Paint.Line, Target | null]>, at: Screen.Spot | null, k: number): [number, number] | null {
  const words = body.at(-1)?.[1];
  if (at !== null && words?.$ === "row" && words.k === k) {
    return [at.row, at.row];
  }
  const on = body.flatMap(([, aim], j) => (aim?.$ === "row" && aim.k === k ? [j] : []));
  return on.length === 0 ? null : [on[0], on.at(-1)!];
}

// the rule over a question, w wide, as the rule over the input starts:
// its title, bold, then what it says besides ("": nothing), dim, a dot
// before each; too wide, cut at its end, an ellipsis there
function question_rule(w: number, title: string, said: string[]): Paint.Line {
  const room = w - 6;
  const runs = [Paint.Run(Paint.text_clean(title), { ...Paint.INK, b: true }), Paint.Run(said.filter((x) => x !== "").map((x) => " · " + Paint.text_clean(x)).join(""), Paint.DIM)];
  const fits = Paint.line_width(runs) <= room ? runs : [...Paint.line_cut(runs, 0, Math.max(0, room - 1))[1], Paint.Run("…", Paint.DIM)];
  return [Paint.Run("── ", Paint.DIM), ...fits, Paint.Run(" " + "─".repeat(Math.max(0, w - 4 - Paint.line_width(fits))), Paint.DIM)];
}

// the question at the input as painted, its first line on screen row
// `row`, column `col`, w wide, kept (t.box: the mouse over it is
// Popup.ts's); the pointer's row seen as it first shows (it lights a row
// once it moves)
export function question_kept(t: Term, asked: Asked, row: number, col: number, w: number): void {
  const was = t.box?.of === asked.of;
  t.box     = { of: asked.of, row, col, w, h: asked.lines.length, inset: 0, rows: asked.rows, ...asked.shape };
  if (!was) {
    t.aim.row = t.scr.point.row;
    t.aim.in  = popup_at(t.box, t.scr.point) !== "out";
  }
}

// whether the pointer is on the question at the input, as last painted
export function question_over(t: Term): boolean {
  const of = question_of(t);
  return of !== null && t.box?.of === of && popup_at(t.box, t.scr.point) !== "out";
}

// a turn of the wheel over illi's form (d -1: up), as last painted (none
// yet: nothing): its lines under the tabs scrolled STEP (a third of those
// shown, on a short one), stopping at their ends. On a question, with
// the pointer on a row that shows whole (the words: their cursor's line),
// that row lit; else, the lit one gone from view, the nearest still in
// it (none shows whole: nothing moves), so what is lit always shows
export function question_form_wheel(t: Term, d: number): void {
  const f   = term_form(t)?.[1] ?? null;
  const box = f !== null && t.box?.of === f ? t.box : null;
  if (f === null || box === null) {
    return;
  }
  const laid  = term_form_lines(t, box.w, question_words(Screen.screen_size().h))!;
  const step  = Math.max(1, Math.min(STEP, Math.floor(box.lines / 3)));
  const top   = Math.max(0, Math.min(laid.body.length - box.lines, f.top + d * step));
  const e     = f.each[f.tab];
  const shows = (k: number) => {
    const rows = question_row(laid.body, laid.at, k);
    return rows !== null && rows[0] >= top && rows[1] < top + box.lines;
  };
  if (top === f.top || e === undefined) {
    f.top = top;
    return;
  }
  const p     = t.scr.point;
  const line  = p.row - box.row - box.list;
  const over  = line >= 0 && line < box.lines && p.col >= box.col && p.col < box.col + box.w;
  const under = over ? laid.body[top + line]?.[1] : undefined;
  const words = laid.body.at(-1)?.[1];
  const all   = Array.from({ length: words?.$ === "row" ? words.k + 1 : 0 }, (_, k) => k).filter(shows);
  const lit   = under?.$ === "row" && shows(under.k) ? under.k : shows(e.at) ? e.at : question_row(laid.body, laid.at, e.at)![0] < top ? all[0] : all.at(-1);
  if (lit !== undefined) {
    e.at  = lit;
    f.top = top;
  }
}
