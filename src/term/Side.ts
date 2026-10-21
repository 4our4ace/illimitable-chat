// Side
// ====
// The side panel, on a wide screen: the primary agents, the subagents of
// this run, the profiles, a ChatGPT plan's use, the chat's (the context,
// the memory), the MCP servers, a hint for the keys or Illi's to-do list; /side
// places it.

import { term_choose, term_mcp } from "./Commands.ts";
import * as config from "../config/Config.ts";
import * as Draw from "../ui/Draw.ts";
import { term_spinner } from "./Frame.ts";
import { Mcp, type Server } from "../tools/Mcp.ts";
import { term_note } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import { term_profile_go, term_profile_pick } from "./ProfileCommands.ts";
import * as Screen from "../ui/Screen.ts";
import { setting_set } from "./Settings.ts";
import { term_act, type Item, type Term } from "./Term.ts";
import { agent_name, GLYPH } from "../ui/Theme.ts";
import * as View from "../ui/View.ts";

// the side's narrowest, its line included; the narrowest chat beside it;
// the narrowest screen it shows on
const SIDE  = 20;
const ROOM  = 60;
const WIDE  = 100;

// the side's hint at its foot, faint
const HINT = "/help for all keys";

// the side's: the width of its labels (Context, 5h, Week, Memory); its
// bars' widest, every one alike; the to-do items a folded list shows;
// how often its clocks (a plan window's reset) move (ms)
const LABEL   = 9;
const BAR     = 24;
const FOLDED  = 3;
export const CLOCK   = 60000;

// the side, w wide and tall: Illi and the primary agents (a click makes
// one the main agent), the tabs (a click shows one), the profiles (a
// click on the head: /profile), a ChatGPT plan's use, the chat's (its
// context, the memory), the MCP servers (a click: /mcp); at its foot Illi's to-do list, which, longer than the room,
// pushes the rest up (its head stays); with none, a faint hint for the
// keys (HINT), if it fits
export function term_side(t: Term, w: number, tall: number): Item[] {
  const bold  = { ...Paint.INK, b: true };
  const head  = (text: string, run: (() => void) | null = null): Item => [[Paint.Run(text, bold)], run];
  const item  = (here: boolean, text: string, run: () => void): Item => [[Paint.Run((here ? GLYPH.here : GLYPH.tab) + " " + text, here ? Paint.INK : Paint.DIM)], run];
  const about = (k: number) => (k === 0 ? "" : t.agents[k - 1].description);
  const mains = [null, ...t.agents.map((a) => a.name)].map((name, k): Item => {
    const [line, run] = item(name === t.v.agent, agent_name(name ?? View.MAIN), () => term_choose(t, name));
    const room = w - Paint.line_width(line) - 2;
    return [room >= 12 && about(k) !== "" ? [...line, Paint.Run("  " + about(k), Paint.DIM)] : line, run];
  });
  const subs  = term_side_subs(t);
  const mcp   = term_side_mcp(t);
  const todo  = term_side_todo(t, w);
  const keys  = [[[Paint.Run(HINT, Paint.DIM)], null] as Item];
  const gap   = [[], null] as Item;
  const fill  = (n: number) => Array.from({ length: n }, (): Item => [[], null]);
  const plan  = term_side_plan(t, w);
  const top   = [head("Agents"), ...mains, gap, ...(subs.length === 0 ? [] : [head("Subagents"), ...subs, gap]), ...term_side_profiles(t), ...(plan.length === 0 ? [] : [...plan, gap]), head("Chat"), ...term_side_use(t, w), ...(mcp.length === 0 ? [] : [gap, head("MCP", () => term_mcp(t)), ...mcp])];
  const foot  = todo.length === 0 ? keys : todo;
  const room  = tall - top.length - foot.length;
  const items = room > 0 ? [...top, ...fill(room), ...foot]
    : todo.length === 0 ? top
    : todo.length < tall ? [...top, gap, ...todo].slice(-tall)
    : todo;
  return items.slice(0, tall).map(([line, run]) => [Paint.runs_wrap(line, w, true)[0], run]);
}

// a ChatGPT plan's use, w wide (another vendor, or nothing told yet:
// nothing): its head, the plan named (ChatGPT Pro; as Pro, else not at
// all, if it won't fit), then each of its windows, a label a line: the
// share used and when it starts anew, a bar under it (in the theme's
// blue, as term_bar colors it); none told yet, a line says when it will
// be. What won't fit says less
function term_side_plan(t: Term, w: number): Item[] {
  const tier  = t.v.use.plan ?? "";
  if (t.v.pick?.vendor !== "chatgpt" || (tier === "" && t.v.use.limits.length === 0)) {
    return [];
  }
  const plan  = tier === "" ? "" : tier[0].toUpperCase() + tier.slice(1);
  const says  = plan === "" ? [] : [" · ChatGPT " + plan, " · " + plan].filter((x) => Paint.text_width("Usage" + x) <= w);
  const head  = [[Paint.Run("Usage", { ...Paint.INK, b: true }), ...says.slice(0, 1).map((x) => Paint.Run(x, Paint.DIM))], null] as Item;
  const blue  = Draw.draw_theme().link ?? "4";
  const shown = t.v.use.limits.flatMap((l) => {
    const left  = l.reset - Date.now();
    const share = left > 0 ? l.used / 100 : 0;
    const used  = term_pct(share, blue);
    return [term_row(w, term_window(l.window), [used, Paint.Run(left > 0 ? " · resets " + term_left(left) : " · reset", Paint.DIM)], [used]), term_bar(share, w, blue)];
  });
  return [head, ...(shown.length > 0 ? shown : [[[Paint.Run("shown after a reply", Paint.DIM)], null] as Item])];
}

// what the calls use, w wide, a label a line: how full the chat a turn
// sends is, of the most it holds before its oldest messages fold into the
// tree (summarized), the share, a bar under it (in the accent, as
// term_bar colors it), then where it folds and its model's window; the
// memory's size. What won't fit says less
function term_side_use(t: Term, w: number): Item[] {
  const c      = Draw.draw_theme().accent ?? "5";
  const fill   = t.v.use.fill ?? null;
  const window = fill?.cap;
  const tokens = fill?.used ?? null;
  const share  = tokens === null || window === undefined ? null : tokens / window;
  const read   = Paint.Run(tokens === null ? "–" : term_tokens(tokens), tokens === null ? Paint.DIM : Paint.INK);
  const of     = window === undefined ? [] : [Paint.Run(" / " + term_tokens(window), Paint.DIM)];
  const part   = share === null ? [] : [Paint.Run(" · ", Paint.DIM), term_pct(share, c)];
  const bar    = share === null ? [] : [term_bar(tokens! > 0 ? Math.max(share, 1e-9) : 0, w, c)];
  const says   = fill === null ? [] : ["summarizes at " + term_tokens(fill.cap) + " · window " + term_tokens(fill.window), "summarizes at " + term_tokens(fill.cap), "at " + term_tokens(fill.cap)];
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

// a share as a percentage, in c (yellow past 70%, red past 90%)
function term_pct(f: number, c: string): Paint.Run {
  return Paint.Run(Math.round(f * 100) + "%", { ...Paint.INK, c: term_level(f, c) });
}

// a share's color: c, yellow past 70%, red past 90%
function term_level(f: number, c: string): string {
  return f >= 0.9 ? "1" : f >= 0.7 ? "3" : c;
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
// (green; its tools counted), ✗ failed (red), ◌ starting; a file that
// won't read; a click on any: /mcp
function term_side_mcp(t: Term): Item[] {
  const { servers, trouble } = Mcp.status();
  const wide = Math.max(0, ...servers.map((s) => Paint.text_width(s.name)));
  const red  = { ...Paint.INK, c: "1" };
  const line = (s: Server): Paint.Line => {
    const name = s.name + " ".repeat(wide - Paint.text_width(s.name));
    const n    = s.own.size;
    return s.state === "ready" ? [Paint.Run("● ", { ...Paint.INK, c: "2" }), Paint.Run(name), Paint.Run("  " + n + (n === 1 ? " tool" : " tools"), Paint.DIM)]
      : s.state === "failed" ? [Paint.Run("✗ ", red), Paint.Run(name, Paint.DIM), Paint.Run("  failed", { ...Paint.DIM, c: "1" })]
      : [Paint.Run("◌ " + name + "  starting", Paint.DIM)];
  };
  const file = trouble === "" ? [] : [[Paint.Run("✗ ", red), Paint.Run("mcp.json won't read", Paint.DIM)]];
  return [...servers.map(line), ...file].map((l): Item => [l, () => term_mcp(t)]);
}

// Illi's to-do list, w wide (none: nothing): its head (how many done; a
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
  const c      = Draw.draw_theme().accent ?? "5";
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
    [folds ? Paint.ends_line(title, t.todo ? "▴" : "▾", w) : title, toggle],
    ...shown.flatMap(item),
    ...(more > 0 ? [[[Paint.Run("… " + more + " more", Paint.DIM)], toggle] as Item] : []),
  ];
}

// a count of tokens, as a person says it: 812, 4.2k, 41k, 1.2M
export function term_tokens(n: number): string {
  return n < 1000 ? String(n) : n < 10000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : n < 1e6 ? Math.round(n / 1000) + "k" : (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
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

// /side: where the side panel shows (right, left, off) or how wide (40,
// 30%), kept in config.json (as /set does it: not over a variable, nor
// into a config.json that won't read); none: says how it is. On a screen
// too narrow, says it is hidden there
export function term_side_set(t: Term, arg: string): void {
  const how = arg.trim().toLowerCase();
  const key = ["right", "left", "off"].includes(how) ? "side" : /^\d+(?:\.\d+)?%?$/.test(how) ? "side_width" : null;
  if (key === null && how !== "") {
    return term_note(t, "/side takes right, left or off, or a width: columns (40) or a share of the screen (30%).");
  }
  if (key !== null && !setting_set(t, key, how)) {
    return;
  }
  const w    = Screen.screen_size().w;
  const hid  = t.side.place !== "off" && w < WIDE ? " Hidden on this screen: it shows from " + WIDE + " columns, this one has " + w + "." : "";
  term_note(t, "The side panel: " + t.side.place + ", " + t.side.width + " wide" + (how === "" ? " (/side right, left, off, or a width like 40 or 30%)." : "; kept in config.json.") + hid);
}

// the side's subagents: the way back to the chat while an agent's tab
// shows (named as the main agent); each subagent of this run, at work
// (the spinner) or done (✓), its tab shown bold; a click shows its tab
function term_side_subs(t: Term): Item[] {
  const shown = t.v.page?.name ?? null;
  const c     = Draw.draw_theme().accent ?? "5";
  const spin  = term_spinner(Date.now() - t.since);
  const names = shown === null || t.subs.has(shown) ? [...t.subs] : [...t.subs, [shown, t.v.agents.includes(shown)] as [string, boolean]];
  const back  = shown === null ? [] : [[[Paint.Run("‹ " + agent_name(t.v.agent ?? View.MAIN), Paint.DIM)], () => term_act(t, { $: "Goto", name: null })] as Item];
  const subs  = names.map(([name, working]): Item => [
    [Paint.Run((working ? spin : "✓") + " ", working ? { ...Paint.INK, c, b: true } : { ...Paint.INK, c: "2" }), Paint.Run(agent_name(name), name === shown ? { ...Paint.INK, b: true } : working ? Paint.INK : Paint.DIM)],
    () => term_act(t, { $: "Goto", name }),
  ]);
  return [...back, ...subs];
}

// the side's profiles: a head (a click: /profile's picker), each profile
// (the one running marked), a gap; a click on another switches to it
function term_side_profiles(t: Term): Item[] {
  const items = t.profs.map((name): Item => {
    const here = name === config.PROFILE;
    return [[Paint.Run((here ? GLYPH.here : GLYPH.tab) + " " + name, here ? Paint.INK : Paint.DIM)], here ? null : () => void term_profile_go(t, name)];
  });
  return [[[Paint.Run("Profiles", { ...Paint.INK, b: true })], () => term_profile_pick(t)], ...items, [[], null]];
}
