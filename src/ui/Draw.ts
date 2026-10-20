// Draw
// ====
// What cellsmith (cellsmith/, from github.com/4our4ace/cellsmith) draws
// for Paint.ts. A ```mermaid block: a diagram on the terminal's cell grid
// (Pele lays it out with each character one cell, cellsmith/pele.ts
// draws the layout in box lines, block fills, braille and text), laid out
// again narrower till it fits the width; else beautiful-mermaid's box
// art; else none (its code shows). Code: Prism's tokens, by kind, and a
// shell's own (its commands, flags, strings, comments).
//
// A diagram's colors are a cellsmith palette (Theme.PALETTE) over the
// terminal's background, which the terminal tells when asked (Screen.ts,
// draw_canvas): "auto" picks a dark or light palette by it, and, untold
// (a pipe, a terminal that never answers), draws in the terminal's own
// ink, its series told apart by shades (▓▒░). Each drawing is made once
// per width and palette. A reply's colors are the same palette's
// (draw_theme).
//
// An agent's mark has a color of its own, made for it (draw_agent): Illi's
// is the brand's; each other agent, the first time it's seen, takes the
// free hue farthest from the brand's and the others', and keeps it in a
// file (SLOTS), so it's the same in every run.

import * as fs from "node:fs";
import * as config from "../config/Config.ts";
import { drawPele, pelePalette, type PelePalette } from "../../vendor/cellsmith/pele.ts";
import { CANVAS, PRESETS } from "../../vendor/cellsmith/presets.ts";
import { renderMermaidAscii } from "../../vendor/cellsmith/vendor/mermaid-text.js";
import { loadPele } from "../../vendor/cellsmith/vendor/pele.js";
import { languages, tokenize, type PrismToken } from "../../vendor/cellsmith/vendor/prism.js";
import * as Theme from "./Theme.ts";

// Types
// =====

// a piece of a drawing's row: its text, its colors (#rrggbb; none: the
// terminal's), bold, reversed
export type Cell = { text: string; fg?: string; bg?: string; bold?: boolean; inverse?: boolean };

// a piece of code: its text, its token's kind (Theme.SYNTAX's, a comment's;
// "": none)
export type Token = { text: string; kind: string };

// Constants
// =========

// the longest diagram drawn (characters, lines: cellsmith's), the longest
// code highlighted
const LONGEST = 8000;
const LINES   = 80;
const CODE    = 100000;

// the drawings and highlights kept
const KEPT = 64;

// Illimitable's color, Illi's: the aqua its wordmark ends in (the
// README's header); on a dark background, on a light one (the same hue,
// deeper), and the terminal's own, untold; its hue (OKLCH)
const BRAND     = { dark: "#81f8fb", light: "#0c9297", own: "6" };
const BRAND_HUE = 198;

// the other agents' colors, made: HUES hues round the wheel (OKLCH), a
// step apart from the brand's, then a ring of deeper ones between them,
// each ring's lightness and chroma by the background (RING); none within
// NEAR (degrees) of the brand's. Untold, the terminal's own colors, by
// their hues (its cyan is the brand's). Each agent's slot (ring, hue) is
// kept in SLOTS
const HUES  = 12;
const RING  = { dark: [[0.78, 0.15], [0.66, 0.15]], light: [[0.56, 0.15], [0.44, 0.13]] };
const NEAR  = 30;
const OWN   = [["1", 29], ["3", 110], ["2", 142], ["4", 264], ["5", 328]] as const;
const SLOTS = config.DIR + "/agent-colors.json";

// a flowchart that runs sideways, which the box art may stand up
const SIDEWAYS = /^(\s*(?:flowchart|graph)[ \t]+)(LR|RL)\b/;

// the shell's languages, and its pieces: a comment, a string, a flag, an
// operator (a command follows), a word, a space
const SHELLS = ["bash", "sh", "shell", "zsh", "fish", "console", "shell-session", "powershell", "ps1"];
const SHELL  = /(#.*)|('[^']*'?|"(?:\\.|[^"\\])*"?)|(--?\w[\w-]*)|(\|\||&&|[|;&])|([^\s|;&'"]+)|(\s+)/g;

// Draw
// ====

// the terminal's background (#rrggbb), once told; the palette drawn in
let canvas: string | null = null;
let palette: { key: string; colors: PelePalette } | null = null;

// Pele, made at the first diagram (its 346 KB evaluated only then)
let pele: ReturnType<typeof loadPele> | null = null;

const DRAWN = new Map<string, Cell[][] | null>();
const LIT   = new Map<string, Token[][] | null>();

// each agent's slot, by its name (in small letters), as kept (SLOTS); a
// passing one's (a subagent of no file of its own), held for the run;
// each slot's color, by the background
let slots: Record<string, number> | null = null;
const PASSING = new Map<string, number>();
const HUED    = new Map<string, string>();

// the terminal's background, as told: the palette made anew
export function draw_canvas(hex: string): void {
  canvas  = hex;
  palette = null;
}

// a diagram's rows, at most w wide; null: it can't be drawn
export function draw_diagram(source: string, w: number): Cell[][] | null {
  if (source.length > LONGEST || source.split("\n").length > LINES) {
    return null;
  }
  const { key, colors } = draw_palette();
  return draw_kept(DRAWN, w + "\0" + key + "\0" + source, () => {
    const art = drawPele((src, opts) => (pele ??= loadPele()).render(src, opts), source, colors, w);
    if (art !== null && art.rows.length > 0 && art.width <= w) {
      return art.rows;
    }
    const box = draw_box(source, w);
    return box === null ? null : box.split("\n").map((text) => [{ text }]);
  });
}

// the palette: the one named, or by the background (auto); its key
function draw_palette(): { key: string; colors: PelePalette } {
  if (palette !== null) {
    return palette;
  }
  const name = draw_name();
  const own    = Object.fromEntries(Object.entries(Theme.COLORS).filter(([, c]) => c.startsWith("#")));
  const colors = pelePalette({ ...PRESETS[name], ...own }, canvas ?? CANVAS[name]);
  palette = { key: JSON.stringify(colors), colors };
  return palette;
}

// the palette's name: the one named, else dark or light by the
// background, mono untold
function draw_name(): keyof typeof PRESETS {
  const auto = canvas === null ? "mono" : draw_dark(canvas) ? "catppuccin-mocha" : "catppuccin-latte";
  return (Theme.PALETTE in PRESETS ? Theme.PALETTE : auto) as keyof typeof PRESETS;
}

// a reply's colors by cellsmith's slots (Reply.ts): the palette's, or the
// terminal's own (Theme.REPLY) while "auto" is untold; the user's over them
export function draw_theme(): Record<string, string> {
  const name = draw_name();
  return { ...(name === "mono" && !(Theme.PALETTE in PRESETS) ? Theme.REPLY : (PRESETS[name] as Record<string, string>)), ...Theme.COLORS };
}

// the brand's color (BRAND), as the background has it
export function draw_brand(): string {
  return BRAND[draw_tone()];
}

// the user's agents, as read: each new one given a slot (draw_slot) and
// kept, the file read anew first (another illi may have added some); a
// folder that can't be written: the slots hold for this run
export function draw_agents(names: string[]): void {
  const kept = draw_slots();
  let added  = false;
  for (const name of names.map((n) => n.toLowerCase())) {
    if (!(name in kept)) {
      kept[name] = draw_slot(name, Object.values(kept));
      added = true;
    }
  }
  slots = kept;
  if (added) {
    try {
      fs.writeFileSync(SLOTS, JSON.stringify(kept, null, 2) + "\n");
    } catch {}
  }
}

// an agent's color: its slot's (draw_hue); one not kept (a passing
// subagent) takes the slot it would be given now, for the run
export function draw_agent(name: string): string {
  slots ??= draw_slots();
  const key = name.toLowerCase();
  if (!(key in slots) && !PASSING.has(key)) {
    PASSING.set(key, draw_slot(key, [...Object.values(slots), ...PASSING.values()]));
  }
  return draw_hue(slots[key] ?? PASSING.get(key)!);
}

// the slots kept (SLOTS), by name; none, or not read: none
function draw_slots(): Record<string, number> {
  try {
    const kept = JSON.parse(fs.readFileSync(SLOTS, "utf8"));
    return Object.fromEntries(Object.entries(kept).filter(([, s]) => Number.isInteger(s) && (s as number) >= 0 && (s as number) < 2 * HUES)) as Record<string, number>;
  } catch {
    return {};
  }
}

// a new agent's slot, given those taken: of those not NEAR the brand's,
// the least shared, the first ring before the second, the farthest from
// the brand's hue and the others' in its ring, then the nearest the hue
// its name's hash points at (so the colors look picked at random)
function draw_slot(name: string, taken: number[]): number {
  const want  = [...name].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261) % 360;
  const ring  = (s: number) => Math.floor(s / HUES);
  const far   = (s: number) => Math.min(draw_apart(draw_turn(s), 0), ...taken.filter((u) => u !== s && ring(u) === ring(s)).map((u) => draw_apart(draw_turn(s), draw_turn(u))));
  const rank  = (s: number) => [taken.filter((u) => u === s).length, ring(s), -far(s), draw_apart(draw_turn(s), want)];
  const ahead = (a: number[], b: number[]) => {
    const k = a.findIndex((x, i) => x !== b[i]);
    return k >= 0 && a[k] < b[k];
  };
  const open  = Array.from({ length: 2 * HUES }, (_, s) => s).filter((s) => draw_apart(draw_turn(s), 0) > NEAR);
  return open.reduce((a, b) => (ahead(rank(b), rank(a)) ? b : a));
}

// a slot's hue, turned from the brand's (degrees): its step round the
// wheel, the second ring's half a step on
function draw_turn(s: number): number {
  return ((s % HUES) + (s >= HUES ? 0.5 : 0)) * (360 / HUES);
}

// how far apart two hues are, round the wheel (degrees)
function draw_apart(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

// a slot's color, by the background: OKLCH, its ring's lightness and
// chroma, its hue turned from the brand's; untold, the terminal's own
// color nearest that hue
function draw_hue(s: number): string {
  const tone = draw_tone();
  const hue  = (BRAND_HUE + draw_turn(s)) % 360;
  if (tone === "own") {
    return OWN.reduce((a, b) => (draw_apart(b[1], hue) < draw_apart(a[1], hue) ? b : a))[0];
  }
  const [l, c] = RING[tone][s >= HUES ? 1 : 0];
  return draw_kept(HUED, tone + s, () => draw_oklch(l, c, hue));
}

// an OKLCH color as #rrggbb, its chroma lessened till sRGB holds it
function draw_oklch(l: number, c: number, h: number): string {
  for (; ; c -= 0.005) {
    const [a, b] = [c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
    const [x, y, z] = [l + 0.3963377774 * a + 0.2158037573 * b, l - 0.1055613458 * a - 0.0638541728 * b, l - 0.0894841775 * a - 1.291485548 * b].map((v) => v ** 3);
    const rgb = [4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z, -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z, -0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z];
    if (c <= 0 || rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) {
      const srgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
      return "#" + rgb.map((v) => Math.round(srgb(Math.min(1, Math.max(0, v))) * 255).toString(16).padStart(2, "0")).join("");
    }
  }
}

// the colors to draw in: the palette's on a dark background or a light
// one, else the terminal's own
function draw_tone(): "dark" | "light" | "own" {
  return !draw_theme().accent?.startsWith("#") ? "own" : draw_dark(canvas ?? CANVAS[draw_name()]) ? "dark" : "light";
}

// whether a background is dark: its luminance under half
export function draw_dark(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

// beautiful-mermaid's box art, w wide at most (a sideways flowchart stood
// up if it's wider); null: none fits
function draw_box(source: string, w: number): string | null {
  for (const src of [source, source.replace(SIDEWAYS, "$1TD")]) {
    try {
      const art = renderMermaidAscii(src, { colorMode: "none", paddingX: 3, paddingY: 1 }).replace(/[ \t]+$/gm, "").trimEnd();
      if (art !== "" && art.split("\n").every((l) => Bun.stringWidth(l) <= w)) {
        return art;
      }
    } catch {
      return null;
    }
  }
  return null;
}

// code's lines as tokens, by its language (a fence's first word); null: a
// language not known
export function draw_code(lang: string, text: string): Token[][] | null {
  const name = lang.trim().split(/\s/)[0].toLowerCase();
  const grammar = Object.hasOwn(languages, name) ? languages[name] : undefined;
  const shell = SHELLS.includes(name);
  if (text.length > CODE || (!shell && (grammar === null || typeof grammar !== "object"))) {
    return null;
  }
  return draw_kept(LIT, name + "\0" + text, () => (shell ? draw_shell(text) : draw_lines(draw_flat(tokenize(text, grammar), ""))));
}

// Prism's tokens, flat, each its kind: its own, an alias's, else the one
// it is inside
function draw_flat(tokens: PrismToken[], kind: string): Token[] {
  return tokens.flatMap((t) => {
    if (typeof t === "string") {
      return [{ text: t, kind }];
    }
    const names = [t.type, ...(Array.isArray(t.alias) ? t.alias : t.alias === undefined ? [] : [t.alias])];
    const own   = names.find((n) => n in Theme.SYNTAX || Theme.COMMENTS.includes(n));
    return draw_flat(Array.isArray(t.content) ? t.content : [t.content], own ?? kind);
  });
}

// tokens cut at their newlines into lines
function draw_lines(tokens: Token[]): Token[][] {
  const out: Token[][] = [[]];
  for (const t of tokens) {
    t.text.split("\n").forEach((piece, k) => {
      if (k > 0) {
        out.push([]);
      }
      if (piece !== "") {
        out[out.length - 1].push({ text: piece, kind: t.kind });
      }
    });
  }
  return out;
}

// a shell's lines: the first word of each command a function, a flag a
// keyword, a string, a comment; a command starts each line and follows
// each operator
function draw_shell(text: string): Token[][] {
  return text.split("\n").map((line) => {
    let head = true;
    return [...line.matchAll(SHELL)].map((m): Token => {
      const kind = m[1] ? "comment" : m[2] ? "string" : m[3] && !head ? "keyword" : m[4] ? "operator" : m[5] && head ? "function" : "";
      head = m[4] !== undefined || (head && m[6] !== undefined);
      return { text: m[0], kind };
    });
  });
}

// a value made once per key, the latest KEPT kept
function draw_kept<T>(kept: Map<string, T>, key: string, make: () => T): T {
  if (kept.has(key)) {
    const hit = kept.get(key)!;
    kept.delete(key);
    kept.set(key, hit);
    return hit;
  }
  const made = make();
  kept.set(key, made);
  if (kept.size > KEPT) {
    kept.delete(kept.keys().next().value!);
  }
  return made;
}
