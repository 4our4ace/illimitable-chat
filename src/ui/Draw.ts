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
// deeper), and the terminal's own, untold
const BRAND = { dark: "#81f8fb", light: "#0c9297", own: "6" };

// the other agents' colors, hues told apart at a glance, round the wheel,
// none near the brand's (by the background, as BRAND's); how many steps
// apart two agents' are kept, while there's room
const AGENT = {
  dark : ["#f87171", "#fb923c", "#facc15", "#4ade80", "#60a5fa", "#a78bfa", "#f472b6"],
  light: ["#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed", "#db2777"],
  own  : ["1", "3", "2", "4", "5"],
};
const AGENT_APART = 2;

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

// an agent's color: one of AGENT's by its name's hash, if it's
// AGENT_APART from those the agents before it took (among, in order),
// else the one farthest from them (the nearest its hash's of those), so
// each stands apart from the others and an agent's stays its own; a name
// not among them: its hash's
export function draw_agent(name: string, among: string[]): string {
  const hues = AGENT[draw_tone()];
  const n    = hues.length;
  const hash = (x: string) => [...x.toLowerCase()].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261) % n;
  const took = new Map<string, number>();
  for (const x of among) {
    const used = [...took.values()];
    const far  = (k: number) => Math.min(n, ...used.map((u) => Math.min(Math.abs(k - u), n - Math.abs(k - u))));
    const own  = hash(x);
    took.set(x.toLowerCase(), far(own) >= AGENT_APART ? own : Array.from({ length: n }, (_, i) => (own + i) % n).reduce((a, b) => (far(b) > far(a) ? b : a)));
  }
  return hues[took.get(name.toLowerCase()) ?? hash(name)];
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
