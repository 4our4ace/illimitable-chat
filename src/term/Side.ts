// Side
// ====
// The side panel, on a wide screen: the primary agents and the sticky
// skills beside them, the subagents of this run, the background jobs,
// the profiles (two or more; those open in this window marked as they
// are), a ChatGPT plan's use, the chat's (the
// context, the memory), the MCP servers, the requests refused, the
// plugins' lines, a hint for the keys or illi's to-do list; the side and
// side_width settings place it.

import { term_background, term_choose, term_mcp, term_stick } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { Custom, type Skill } from "../config/Custom.ts";
import * as Draw from "../ui/Draw.ts";
import { term_spinner } from "./Frame.ts";
import { member_others } from "./Member.ts";
import { Mcp, type Server } from "../tools/Mcp.ts";
import * as Paint from "../ui/Paint.ts";
import { Plugins } from "../config/Plugins.ts";
import { term_permissions } from "./PermCommands.ts";
import { term_profile_go, term_profile_pick } from "./ProfileCommands.ts";
import { setting_open } from "./Settings.ts";
import { term_act, type Item, type Term } from "./Term.ts";
import { GLYPH } from "../ui/Theme.ts";
import * as View from "../ui/View.ts";
import type { Open } from "./Wire.ts";

// the side's narrowest, its line included; the narrowest chat beside it;
// the narrowest screen it shows on
const SIDE  = 20;
const ROOM  = 60;
const WIDE  = 100;

// the side's hint at its foot, faint
const HINT = "/help for all keys";

// the side's: the width of its labels (Context, 5h, Week, Memory); its
// bars' widest, every one alike; the to-do items a folded list shows; the
// refused requests it shows; the background jobs it shows before folding
// the rest into a count;
// how often its clocks (a plan window's reset, a job's age) move (ms)
const LABEL      = 9;
const BAR        = 24;
const FOLDED     = 3;
const REFUSED    = 5;
const BACKGROUND = 3;
export const CLOCK   = 60000;

// the sticky skills' head; the columns between them and the agents
// when beside them
const STICKY = "Sticky skills";
const GAP    = 3;

// the side, w wide and tall: illi and the primary agents by name (a click
// makes one the main agent), the sticky skills beside them (a click
// turns one on or off; under them when a name won't fit whole:
// term_side_beside), the tabs (a click shows one), the background jobs
// (a click: /background), the profiles, once there are two (a click on
// the head: /profile), a ChatGPT plan's use, the chat's (its context, the
// memory), the MCP servers (a click: /mcp), the requests refused (a
// click: /permissions on it), each plugin's lines (Plugins.side); at its
// foot illi's to-do list, which, longer than the room, pushes the rest up
// (its head stays); with none, a faint hint for the keys (HINT), if it
// fits
export function term_side(t: Term, w: number, tall: number): Item[] {
  return term_side_drawn(t, w, tall).items;
}

// the side, as term_side, and whether its background jobs show whole
// (none running: yes); not (a long to-do list pushed them out, or a short
// screen cut them), the last line counts them (Paint.tabs_line)
export function term_side_drawn(t: Term, w: number, tall: number): { items: Item[]; background: boolean } {
  const bold  = { ...Paint.INK, b: true };
  const head  = (text: string, run: (() => void) | null = null): Item => [[Paint.Run(text, bold)], run];
  const item  = (here: boolean, text: string, run: () => void): Item => [[Paint.Run((here ? GLYPH.here : GLYPH.tab) + " " + text, here ? Paint.INK : Paint.DIM)], run];
  const mains = [null, ...t.agents.map((a) => a.name)].map((name): Item => item(name === t.v.agent, name ?? View.MAIN, () => term_choose(t, name)));
  const subs  = term_side_subs(t);
  const bg    = term_side_background(t, w);
  const mcp   = term_side_mcp(t);
  const nos   = term_side_refused(t);
  const todo  = term_side_todo(t, w);
  const keys  = [[[Paint.Run(HINT, Paint.DIM)], null] as Item];
  const gap   = [[], null] as Item;
  const fill  = (n: number) => Array.from({ length: n }, (): Item => [[], null]);
  const plan  = term_side_plan(t, w);
  const top   = [...term_side_beside([head("Agents"), ...mains], (room, whole) => term_side_sticky(t, room, whole), w), gap, ...(subs.length === 0 ? [] : [head("Subagents"), ...subs, gap]), ...(bg.length === 0 ? [] : [...bg, gap]), ...term_side_profiles(t), ...(plan.length === 0 ? [] : [...plan, gap]), head("Chat"), ...term_side_use(t, w), ...(mcp.length === 0 ? [] : [gap, head("MCP", () => term_mcp(t)), ...mcp]), ...(nos.length === 0 ? [] : [gap, head("Refused", () => term_permissions(t)), ...nos]), ...term_side_plugins(w)];
  const foot  = todo.length === 0 ? keys : todo;
  const room  = tall - top.length - foot.length;
  const items = room > 0 ? [...top, ...fill(room), ...foot]
    : todo.length === 0 ? top
    : todo.length < tall ? [...top, gap, ...todo].slice(-tall)
    : todo;
  const kept  = items.slice(0, tall);
  return { items: kept.map(([line, run, aside]) => [Paint.runs_wrap(line, w, true)[0], run, aside]), background: bg.every((x) => kept.includes(x)) };
}

// two lists, w wide: the second beside the first, GAP after the first's
// widest line, each of its lines a click of its own (Item's aside), when
// it shows whole in the room left (second, w columns and whole: null if
// it won't), else under it, a gap between (none: the first alone)
function term_side_beside(first: Item[], second: (w: number, whole: boolean) => Item[] | null, w: number): Item[] {
  const col   = Math.max(...first.map(([line]) => Paint.line_width(line))) + GAP;
  const right = second(w - col, true);
  if (right === null) {
    const under = second(w, false) ?? [];
    return under.length === 0 ? first : [...first, [[], null], ...under];
  }
  return Array.from({ length: Math.max(first.length, right.length) }, (_, k): Item => {
    const [line, run] = first[k] ?? [[], null];
    return right[k] === undefined ? [line, run] : [[...line, Paint.Run(" ".repeat(col - Paint.line_width(line))), ...right[k][0]], run, { col, run: right[k][1] }];
  });
}

// the background jobs (Machine.ts), w wide (none: nothing): a head, then
// a line each, BACKGROUND of them at most and how many more: ● (in the
// theme's success), its command cut to fit, how long it has run (dim); a
// click on any line: /background
function term_side_background(t: Term, w: number): Item[] {
  const jobs = t.v.background;
  if (jobs.length === 0) {
    return [];
  }
  const open  = () => term_background(t);
  const ok    = { ...Paint.INK, c: Draw.draw_tokens().success };
  const shown = jobs.length - BACKGROUND > 1 ? jobs.slice(0, BACKGROUND) : jobs;
  const line  = (j: View.Background): Item => {
    const age = "  " + term_age(Date.now() - j.since);
    return [[Paint.Run("● ", ok), Paint.Run(term_side_cut(Paint.text_line(j.command), w - 2 - Paint.text_width(age))), Paint.Run(age, Paint.DIM)], open];
  };
  const more  = jobs.length - shown.length;
  return [[[Paint.Run("Background", { ...Paint.INK, b: true })], open], ...shown.map(line), ...(more > 0 ? [[[Paint.Run("… " + more + " more", Paint.DIM)], open] as Item] : [])];
}

// a text cut to w columns, an ellipsis ending it if cut
function term_side_cut(text: string, w: number): string {
  return Paint.text_width(text) <= w ? text : w < 2 ? "" : Paint.line_cut([Paint.Run(text)], 0, w - 1)[1].map((r) => r.x).join("") + "…";
}

// how long something has run, ms, in its largest unit: <1m, 12m, 3h, 2d
export function term_age(ms: number): string {
  const m = Math.floor(ms / 60000);
  return m < 1 ? "<1m" : m < 60 ? m + "m" : m < 1440 ? Math.floor(m / 60) + "h" : Math.floor(m / 1440) + "d";
}

// the plan's use, w wide, any vendor's alike (a vendor that tells none,
// or nothing told yet: nothing): its head, the plan named (ChatGPT Pro;
// as Pro, else not at all, if it won't fit), then each of its windows, a
// label a line: the share used and when it starts anew, a bar under it
// (in the accent, as the context's: term_bar); none told, a line says
// why: being asked, a plan with no limits, else that a reply tells them.
// What won't fit says less
function term_side_plan(t: Term, w: number): Item[] {
  const told  = t.v.use.plan;
  if (told === null) {
    return [];
  }
  const plan  = told.tier === "" ? "" : told.tier[0].toUpperCase() + told.tier.slice(1);
  const says  = plan === "" ? [] : [" · " + told.brand + " " + plan, " · " + plan].filter((x) => Paint.text_width("Usage" + x) <= w);
  const head  = [[Paint.Run("Usage", { ...Paint.INK, b: true }), ...says.slice(0, 1).map((x) => Paint.Run(x, Paint.DIM))], null] as Item;
  const c     = Draw.draw_tokens().accent;
  const shown = told.limits.flatMap((l) => {
    const left  = l.reset - Date.now();
    const share = left > 0 ? l.used / 100 : 0;
    const used  = term_pct(share, c);
    return [term_row(w, term_window(l.window), [used, Paint.Run(left > 0 ? " · resets " + term_left(left) : " · reset", Paint.DIM)], [used]), term_bar(share, w, c)];
  });
  const none  = told.state === "asking" ? "asking…" : told.state === "told" ? "no limits" : "shown after a reply";
  return [head, ...(shown.length > 0 ? shown : [[[Paint.Run(none, Paint.DIM)], null] as Item])];
}

// what the calls use, w wide, a label a line: how full the chat a turn
// sends is, of the most it holds before its oldest messages fold into the
// tree (summarized), the share, a bar under it (in the accent, as
// term_bar colors it), then where it folds and its model's window; the
// memory's size. What won't fit says less
function term_side_use(t: Term, w: number): Item[] {
  const c      = Draw.draw_tokens().accent;
  const fill   = t.v.use.fill ?? null;
  const window = fill?.cap;
  const tokens = fill?.used ?? null;
  const share  = tokens === null || window === undefined ? null : tokens / window;
  const read   = Paint.Run(tokens === null ? "–" : term_tokens(tokens), tokens === null ? Paint.DIM : Paint.INK);
  const of     = window === undefined ? [] : [Paint.Run(" / " + term_tokens(window), Paint.DIM)];
  const part   = share === null ? [] : [Paint.Run(" · ", Paint.DIM), term_pct(share, c)];
  const bar    = share === null ? [] : [term_bar(tokens! > 0 ? Math.max(share, 1e-9) : 0, w, c)];
  const says   = fill === null ? [] : ["auto compact at " + term_tokens(fill.cap) + " · window " + term_tokens(fill.window), "auto compact at " + term_tokens(fill.cap), "at " + term_tokens(fill.cap)];
  const folds  = says.length === 0 ? [] : [[[Paint.Run(says.find((x) => Paint.text_width(x) <= w) ?? says[says.length - 1], Paint.DIM)], null] as Item];
  const count  = View.view_count(t.v);
  const n      = Paint.Run(count + (count === 1 ? " message" : " messages"));
  const blocks = t.v.parts.length;
  const memory = term_row(w, "Memory", [n, Paint.Run(" · " + blocks + " blocks in view", Paint.DIM)], [n, Paint.Run(" · " + blocks + " blocks", Paint.DIM)], [n]);
  return [term_row(w, "Context", [read, ...of, ...part], [read, ...part]), ...bar, ...folds, memory];
}

// a label (dim, LABEL wide) and the first of says that fits w after it
// (else the last)
function term_row(w: number, label: string, ...says: Paint.Line[]): Item {
  return [[Paint.Run(label.padEnd(LABEL), Paint.DIM), ...(says.find((l) => LABEL + Paint.line_width(l) <= w) ?? says[says.length - 1])], null];
}

// a share as a percentage, in c (warning past 70%, error past 90%)
function term_pct(f: number, c: string): Paint.Run {
  return Paint.Run(Math.round(f * 100) + "%", { ...Paint.INK, c: term_level(f, c) });
}

// a share's color: c, the theme's warning past 70%, its error past 90%
function term_level(f: number, c: string): string {
  const tokens = Draw.draw_tokens();
  return f >= 0.9 ? tokens.error : f >= 0.7 ? tokens.warning : c;
}

// a bar, every one on the side alike: BAR wide (w less two at most),
// thick, share f of it filled (a cell at least, if any) in its color
// (term_level), the rest dim
function term_bar(f: number, w: number, c: string): Item {
  const bw   = Math.max(1, Math.min(BAR, w - 2));
  const full = Math.max(f > 0 ? 1 : 0, Math.min(bw, Math.round(f * bw)));
  return [[Paint.Run("█".repeat(full), { ...Paint.INK, c: term_level(f, c) }), Paint.Run("█".repeat(bw - full), Paint.DIM)], null];
}

// the user's MCP servers, a line each, their names aligned: ● ready
// (in the theme's success; its tools counted), ✗ failed (its error), ◌
// starting; a file that won't read; a click on any: /mcp
function term_side_mcp(t: Term): Item[] {
  const { servers, troubles } = Mcp.status();
  const wide = Math.max(0, ...servers.map((s) => Paint.text_width(s.name)));
  const tone = Draw.draw_tokens();
  const red  = { ...Paint.INK, c: tone.error };
  const line = (s: Server): Paint.Line => {
    const name = s.name + " ".repeat(wide - Paint.text_width(s.name));
    const n    = s.own.size;
    return s.state === "ready" ? [Paint.Run("● ", { ...Paint.INK, c: tone.success }), Paint.Run(name), Paint.Run("  " + n + (n === 1 ? " tool" : " tools"), Paint.DIM)]
      : s.state === "failed" ? [Paint.Run("✗ ", red), Paint.Run(name, Paint.DIM), Paint.Run("  failed", { ...Paint.DIM, c: tone.error })]
      : [Paint.Run("◌ " + name + "  starting", Paint.DIM)];
  };
  const file = troubles.length === 0 ? [] : [[Paint.Run("✗ ", red), Paint.Run((troubles.length === 1 ? "an MCP file" : troubles.length + " MCP files") + " won't read", Paint.DIM)]];
  return [...servers.map(line), ...file].map((l): Item => [l, () => term_mcp(t)]);
}

// the requests refused, the latest REFUSED, newest first, a line each:
// ✗ (in the theme's error), what, why (dim); a click: /permissions on it
function term_side_refused(t: Term): Item[] {
  const red = { ...Paint.INK, c: Draw.draw_tokens().error };
  return t.v.perm.refused.slice(-REFUSED).reverse().map((r): Item => [[Paint.Run("✗ ", red), Paint.Run(r.what.replace(/\s+/g, " ").trim() || r.tool, Paint.DIM), Paint.Run(" · " + r.why, Paint.DIM)], () => term_permissions(t, r.id)]);
}

// each plugin's lines, w wide, a gap before each plugin's (its first line
// its head, if it makes one: bold, as it says)
function term_side_plugins(w: number): Item[] {
  return Plugins.side(w).flatMap((lines) => [[[], null] as Item, ...lines.map((l): Item => [Paint.pieces_line(l), null])]);
}

// illi's to-do list, w wide (none: nothing): its head (how many done; a
// click shows the list whole, or folded), each item marked by how it
// stands, wrapped under its mark: the active one bold in the accent,
// those done dim, struck through. Folded: the active one (else the next)
// and those after it, FOLDED in all, and how many more (a click shows
// them)
function term_side_todo(t: Term, w: number): Item[] {
  const list = t.v.todo;
  if (list.length === 0) {
    return [];
  }
  const c      = Draw.draw_tokens().accent;
  const done   = list.filter((x) => x.status === "done").length;
  const now    = list.findIndex((x) => x.status === "active");
  const next   = now >= 0 ? now : list.findIndex((x) => x.status === "pending");
  const from   = Math.max(0, Math.min(next >= 0 ? next : list.length, list.length - FOLDED));
  const folds  = list.length - FOLDED > 1;
  const shown  = t.todo || !folds ? list : list.slice(from, from + FOLDED);
  const more   = list.length - shown.length;
  const toggle = folds ? () => void (t.todo = !t.todo) : null;
  const title  = [Paint.Run("Todo", { ...Paint.INK, b: true }), Paint.Run("  " + done + "/" + list.length, Paint.DIM)];
  const item   = (x: View.Todo): Item[] => {
    const [mark, ink] = x.status === "done" ? [GLYPH.done, { ...Paint.DIM, t: true }] : x.status === "active" ? [GLYPH.active, { ...Paint.INK, c, b: true }] : [GLYPH.pending, Paint.INK];
    const lines = Paint.runs_wrap([Paint.Run(Paint.text_clean(x.text), ink)], Math.max(1, w - 2), false);
    return lines.map((l, k): Item => [[Paint.Run(k === 0 ? mark + " " : "  ", x.status === "active" ? ink : Paint.DIM), ...l], null]);
  };
  return [
    [folds ? Paint.ends_line(title, t.todo ? GLYPH.open : GLYPH.shut, w) : title, toggle],
    ...shown.flatMap(item),
    ...(more > 0 ? [[[Paint.Run("… " + more + " more", Paint.DIM)], toggle] as Item] : []),
  ];
}

// a count of tokens, as a person says it: 812, 4.2k, 41k, 1.2M
export function term_tokens(n: number): string {
  return n < 1000 ? String(n) : n < 10000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : n < 1e6 ? Math.round(n / 1000) + "k" : (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
}

// a plan's window, by its minutes: 5h, Week, Day, 3d, 90m
function term_window(minutes: number): string {
  return minutes === 10080 ? "Week" : minutes === 1440 ? "Day" : minutes % 1440 === 0 ? minutes / 1440 + "d" : minutes % 60 === 0 ? minutes / 60 + "h" : minutes + "m";
}

// how long till a time, ms from now, in two units at most: 12m, 2h 10m,
// 3d 4h
function term_left(ms: number): string {
  const m    = Math.ceil(ms / 60000);
  const unit = (n: number, a: string, rest: number, b: string) => n + a + (rest > 0 ? " " + rest + b : "");
  return m < 60 ? m + "m" : m < 1440 ? unit(Math.floor(m / 60), "h", m % 60, "m") : unit(Math.floor(m / 1440), "d", Math.floor((m % 1440) / 60), "h");
}

// the side's width on a screen w wide, its line included: none if off or
// the screen is narrow; else the columns asked, or the share of the
// screen ("25%"), at least SIDE, leaving the chat ROOM
export function term_side_width(t: Term, w: number): number {
  if (t.side.place === "off" || w < WIDE) {
    return 0;
  }
  const share = /^(\d+(?:\.\d+)?)%$/.exec(t.side.width);
  const want  = share !== null ? Math.floor((w * Number(share[1])) / 100) : Number(t.side.width) || Math.floor(w / 4);
  return Math.max(SIDE, Math.min(want, w - ROOM));
}

// the side's subagents: the way back to the chat while an agent's tab
// shows (named as the main agent); each subagent of this run, at work
// (the spinner, in the accent) or done (✓, in the theme's success), its
// tab shown bold; a click shows its tab
function term_side_subs(t: Term): Item[] {
  const shown = t.v.page?.name ?? null;
  const c     = Draw.draw_tokens().accent;
  const spin  = term_spinner(Date.now() - t.since);
  const names = shown === null || t.subs.has(shown) ? [...t.subs] : [...t.subs, [shown, t.v.agents.includes(shown)] as [string, boolean]];
  const back  = shown === null ? [] : [[[Paint.Run("<- " + (t.v.agent ?? View.MAIN), Paint.DIM)], () => term_act(t, { $: "Goto", name: null })] as Item];
  const subs  = names.map(([name, working]): Item => [
    [Paint.Run((working ? spin : "✓") + " ", working ? { ...Paint.INK, c, b: true } : { ...Paint.INK, c: Draw.draw_tokens().success }), Paint.Run(name, name === shown ? { ...Paint.INK, b: true } : working ? Paint.INK : Paint.DIM)],
    () => term_act(t, { $: "Goto", name }),
  ]);
  return [...back, ...subs];
}

// the sticky skills, w wide (beside the agents, or under them): one on
// marked as the agent running is, one off as the others are, a click
// turning it on or off in place (its head, Sticky where Sticky skills
// won't fit: the list of them, /settings), a name too long cut; none (no
// skill sticky, or each turned off by `off`): nothing; whole, null if a
// name, or the head as Sticky, won't fit. Read anew only once the settings change (new lists),
// never at a paint
let stuck: { on: string[]; off: string[]; skills: Skill[] } | null = null;
function term_side_sticky(t: Term, w: number, whole: boolean): Item[] | null {
  if (stuck?.on !== config.STICKY || stuck.off !== config.OFF) {
    stuck = { on: config.STICKY, off: config.OFF, skills: Custom.skills(process.cwd()).filter((s) => s.sticky) };
  }
  if (whole && (w < Paint.text_width("Sticky") || stuck.skills.some((s) => 2 + Paint.text_width(s.name) > w))) {
    return null;
  }
  const items = stuck.skills.map((s): Item => {
    const on = config.config_sticky(s.name);
    return [[Paint.Run((on ? GLYPH.here : GLYPH.tab) + " " + term_side_cut(s.name, w - 2), on ? Paint.INK : Paint.DIM)], () => void term_stick(t, s, !on, "A click on it again")];
  });
  const name  = Paint.text_width(STICKY) <= w ? STICKY : "Sticky";
  return items.length === 0 ? [] : [[[Paint.Run(name, { ...Paint.INK, b: true })], () => setting_open(t, "sticky")], ...items];
}

// the side's profiles, once there are two: a head (a click: /profile's
// picker), each profile (the one running marked; one open hidden in this
// window in the ink, its state after it: term_side_open), a gap; a click
// on another switches to it
function term_side_profiles(t: Term): Item[] {
  if (t.profs.length < 2) {
    return [];
  }
  const others = member_others();
  const items = t.profs.map((name): Item => {
    const here = name === config.PROFILE;
    const open = here ? undefined : others.find((o) => o.profile === name);
    return [[Paint.Run((here ? GLYPH.here : GLYPH.tab) + " " + name, here || open !== undefined ? Paint.INK : Paint.DIM), ...term_side_open(open)], here ? null : () => void term_profile_go(t, name)];
  });
  return [[[Paint.Run("Profiles", { ...Paint.INK, b: true })], () => term_profile_pick(t)], ...items, [[], null]];
}

// a profile open hidden in this window, as the side marks it: ? (bold,
// in the accent) while a question waits on you; while its turn or
// subagents run, a spinner as the subagents' (Member.ts moves it); while
// only its background jobs run, ● and how many (in the theme's success);
// at rest, or not open, nothing
function term_side_open(o: Open | undefined): Paint.Run[] {
  const tone = Draw.draw_tokens();
  return o === undefined ? []
    : o.asks ? [Paint.Run(" ?", { ...Paint.INK, c: tone.accent, b: true })]
    : o.working ? [Paint.Run(" " + term_spinner(Date.now()), { ...Paint.INK, c: tone.accent, b: true })]
    : o.jobs > 0 ? [Paint.Run(" ● " + o.jobs, { ...Paint.INK, c: tone.success })]
    : [];
}
