// Draw
// ====
// What Paint.ts draws in color. A ```mermaid block: a diagram on the
// terminal's cell grid (Pele lays it out with each character one cell,
// pelext draws the layout in box lines, block fills, braille and text),
// laid out again narrower till it fits the width; else none (its code
// shows). Code: Prism's tokens (Prism.ts), by kind, and a shell's own
// (its commands, flags, strings, comments).
//
// A diagram's colors are a palette (Palettes.ts, Theme.PALETTE) over the
// terminal's background, which the terminal tells when asked (Screen.ts,
// draw_canvas): "auto" picks a dark or light palette by it, and, untold
// (a pipe, a terminal that never answers), draws in the terminal's own
// ink, its series told apart by shades (▓▒░). Each drawing is made once
// per width and palette. A reply's colors are the same palette's
// (draw_theme). Pele and Prism are loaded only as the first diagram or
// code is drawn (Prism alone takes tens of ms), so a start
// that shows neither never loads them.
//
// The theme's tokens (Theme.TOKENS) are made here, as they take the
// palette's colors and the background (draw_tokens): the accent illi's
// aqua under "auto" (a named palette: its own accent), the links the
// palette's (blue), the frame round the user's words the accent mixed
// toward the background, the rest as the theme asks; a token naming
// another takes that one's. An accent that isn't the palette's own (one
// asked for: the setting, the theme's, a plugin's; auto's aqua) is the
// palette's accent and bullets too, so a reply's buttons, quotes and
// lists follow it; links asked for, its links. All of it is made once
// per look (draw_stamp: the background told, the theme changed), so a
// new accent recolors all at once.
//
// An agent's mark has a color of its own (draw_agent): illi's is the
// brand's; another's, the one its file pins, else one made for it as the
// agents are read, from its name and theirs, so it holds while they do.

import type { PelePalette } from "pelext";
import { CANVAS, PALETTES, type PaletteName } from "./Palettes.ts";
import type { PrismToken } from "./Prism.ts";
import * as Theme from "./Theme.ts";

// Types
// =====

// a piece of a drawing's row: its text, its colors (#rrggbb; none: the
// terminal's), bold, reversed
export type Cell = { text: string; fg?: string; bg?: string; bold?: boolean; inverse?: boolean };

// a piece of code: its text, its token's kind (Theme.SYNTAX's, a comment's;
// "": none)
export type Token = { text: string; kind: string };

// what draws a diagram: pelext's drawing of Pele's layout, Pele (the
// diagrams pelext draws); and what reads code
type Art   = { cells: typeof import("pelext"); pele: typeof import("pelext/pele") };
type Prism = typeof import("./Prism.ts");

// Constants
// =========

// the longest diagram source drawn (characters, lines): past them its
// code shows, so laying out a reply stays quick
const LONGEST = 8000;
const LINES   = 150;

// the longest code highlighted
const CODE = 100000;

// the drawings and highlights kept
const KEPT = 64;

// names code is often given that Prism knows by another
const ALIASES: Record<string, string> = {
  "c#": "csharp", "c++": "cpp", cc: "cpp", h: "c", hpp: "cpp", rs: "rust", golang: "go", jsonc: "json", tf: "hcl", terraform: "hcl",
};

// the shells, whose code is read here (draw_shell), never by Prism
const SHELLS = ["bash", "sh", "shell", "zsh", "fish", "console", "shell-session", "powershell", "ps1"];

// a shell line's pieces: a comment (a # starting a piece) to the line's
// end; a string ('...', "..." its escapes in it; one left open to the
// end); a redirection (2>&1, >>, &>); an operator; a flag (-x, --long);
// whitespace; a word (anything else up to those)
const PIECE = /(?<comment>#.*)|(?<string>'[^']*(?:'|$)|"(?:\\.?|[^"\\])*(?:"|$))|(?<redirect>\d*(?:<<?|>>?)&?(?:\d+(?![^\s|;&'"])|-)?|&>>?)|(?<operator>\|\||&&|[|;&])|(?<flag>--?\w[\w-]*)|(?<space>\s+)|(?<word>[^\s|;&'"]+)/y;

// a shell's prompt, a line's first word in a session: none of its
// command
const PROMPT = /^[$%]$/;

// the diagram palette's series: the reply palette's hues, in the order
// charts and nodes take them
const SERIES = ["link", "codeString", "number", "codeFlag", "tableHeader", "path", "codeCommand", "inlineCode", "heading", "emphasis"];

// how near red (degrees of hue) and how saturated a color the critical
// one is (draw_red)
const RED = { hue: 40, saturation: 0.35 };

// illimitable's color, illi's: the aqua its wordmark ends in (the
// README's header); on a dark background, on a light one (the same hue,
// deeper), and the terminal's own, untold; its hue (OKLCH)
const BRAND     = { dark: "#81f8fb", light: "#0c9297", own: "6" };
const BRAND_HUE = 198;

// how far the frame round the user's words (the you token, unset) is
// mixed from the accent toward the background: the accent's hue, calmer
const SOFT = 0.4;

// the other agents' colors, made: HUES hues round the wheel (OKLCH), a
// step apart from the brand's, then a ring of deeper ones between them,
// each ring's lightness and chroma by the background (RING); none within
// NEAR (degrees) of the brand's. Untold, the terminal's own colors, by
// their hues (its cyan is the brand's)
const HUES = 12;
const RING = { dark: [[0.78, 0.15], [0.66, 0.15]], light: [[0.56, 0.15], [0.44, 0.13]] };
const NEAR = 30;
const OWN  = [["1", 29], ["3", 110], ["2", 142], ["4", 264], ["5", 328]] as const;

// Draw
// ====

// the terminal's background (#rrggbb), once told; the palette drawn in,
// at the look it was made at
let canvas: string | null = null;
let palette: { key: string; colors: PelePalette; look: number } | null = null;

// the look: counted up as the colors change (draw_stamp), with what it
// was made of (the background, the theme's changes); the theme made for
// it (draw_made: a reply's palette, each token's color)
let look = 0;
let looked: { canvas: string | null; theme: number } = { canvas: null, theme: 0 };
let made: { look: number; theme: Record<string, string>; tokens: Record<Theme.Token, string> } | null = null;

// what draws a diagram, and Prism, each loaded as it is first needed
let art: Art | null = null;
let prism: Prism | null = null;

const DRAWN = new Map<string, Cell[][] | null>();
const LIT   = new Map<string, Token[][] | null>();

// each of the user's agents' slot (a ring and hue), or the color its
// file pins, by its name in small letters (draw_agents); a passing
// agent's slot (a subagent of no file of its own), held for the run; each
// slot's color, by the background
let slots = new Map<string, number | string>();
const PASSING = new Map<string, number>();
const HUED    = new Map<string, string>();

// the terminal's background, as told: the palette made anew
export function draw_canvas(hex: string): void {
  canvas = hex;
}

// the look now: counted up as the background is told or the theme
// changes (Theme.theme_changes: a plugin's, the accent setting), so what
// was drawn in the old one is made anew (Paint.ts lays rows out again)
export function draw_stamp(): number {
  const theme = Theme.theme_changes();
  if (looked.canvas !== canvas || looked.theme !== theme) {
    looked = { canvas, theme };
    look  += 1;
  }
  return look;
}

// a diagram's rows, at most w wide; null: it can't be drawn
export function draw_diagram(source: string, w: number): Cell[][] | null {
  if (source.length > LONGEST || source.split("\n").length > LINES) {
    return null;
  }
  const { key, colors } = draw_palette();
  return draw_kept(DRAWN, w + "\0" + key + "\0" + source, () => {
    const drawn = draw_art().cells.drawPele(draw_art().pele.render, source, colors, w);
    return drawn !== null && drawn.rows.length > 0 && drawn.width <= w ? drawn.rows : null;
  });
}

// the palette: the one named, or by the background (auto), the theme's
// true colors over it (draw_theme: the user's, the accent's); its key
function draw_palette(): { key: string; colors: PelePalette } {
  const now = draw_stamp();
  if (palette !== null && palette.look === now) {
    return palette;
  }
  const name   = draw_name();
  const own    = Object.fromEntries(Object.entries(draw_theme()).filter(([, c]) => c.startsWith("#")));
  const colors = draw_colors({ ...PALETTES[name], ...own }, canvas ?? CANVAS[name]);
  palette = { key: JSON.stringify(colors), colors, look: now };
  return palette;
}

// the diagram palette from a reply's slots (#rrggbb) over the
// background: its text the diagram's (else code's), its lines and
// borders the diagram's, secondary text the comments', the accent, the
// reddest hue the critical one (else the accent), the heading the
// highlight (else the accent); charts and nodes cycling through the
// palette's hues (SERIES), each once, those it lacks left out (none:
// pelext tells them apart by shades)
function draw_colors(colors: Record<string, string | undefined>, canvas: string): PelePalette {
  const series = [...new Set(SERIES.map((s) => colors[s]).filter((c): c is string => c !== undefined))];
  return {
    canvas,
    text     : colors.diagramText ?? colors.codeText,
    muted    : colors.codeComment ?? colors.quote,
    line     : colors.diagram,
    border   : colors.diagram,
    accent   : colors.accent,
    critical : draw_red(series) ?? colors.accent,
    highlight: colors.heading ?? colors.accent,
    series,
    hues     : series,
  };
}

// the reddest of colors (#rrggbb): the one whose hue is nearest red,
// within RED's degrees and saturated enough; none: undefined
function draw_red(colors: string[]): string | undefined {
  const hsl = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
    const [hi, lo] = [Math.max(r, g, b), Math.min(r, g, b)];
    const d = hi - lo;
    const l = (hi + lo) / 2;
    const h = d === 0 ? 0 : hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { hue: (h * 60 + 360) % 360, saturation: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)) };
  };
  const red = colors.map((c) => ({ c, ...hsl(c) })).filter((x) => x.saturation >= RED.saturation && draw_apart(x.hue, 0) <= RED.hue);
  return red.sort((a, b) => draw_apart(a.hue, 0) - draw_apart(b.hue, 0))[0]?.c;
}

// the palette's name: the one named, else dark or light by the
// background, mono untold
function draw_name(): PaletteName {
  const auto = canvas === null ? "mono" : draw_dark(canvas) ? "catppuccin-mocha" : "catppuccin-latte";
  return (Theme.PALETTE in PALETTES ? Theme.PALETTE : auto) as PaletteName;
}

// a reply's colors by the palette's slots (Reply.ts): the palette's, or the
// terminal's own (Theme.REPLY) while "auto" is untold; the user's over
// them; an accent or links asked for over theirs (draw_made)
export function draw_theme(): Record<string, string> {
  return draw_made().theme;
}

// each token's color now (Theme.TOKENS), as draw_made makes it: a
// palette's #rrggbb, an ANSI palette index, or "" (the terminal's own:
// its ink; dim, its faint)
export function draw_tokens(): Record<Theme.Token, string> {
  return draw_made().tokens;
}

// the palette's own slots, the user's colors over them (theme.json's, a
// plugin's): the theme before its tokens
function draw_own(): Record<string, string> {
  const name = draw_name();
  return { ...(name === "mono" && !(Theme.PALETTE in PALETTES) ? Theme.REPLY : (PALETTES[name] as Record<string, string>)), ...Theme.theme_colors() };
}

// the theme for the look now, made once per look: each token's color
// (draw_token), and a reply's palette: the theme's own, its accent and
// bullets in the accent where that isn't the palette's own accent (one
// asked for; auto's, illi's aqua), its links in the links where those
// aren't its own; but where the user's colors name those slots
function draw_made(): { theme: Record<string, string>; tokens: Record<Theme.Token, string> } {
  const now = draw_stamp();
  if (made !== null && made.look === now) {
    return made;
  }
  const own    = draw_own();
  const asked  = Theme.theme_tokens();
  const colors = Theme.theme_colors();
  const tokens = Object.fromEntries((Object.keys(asked) as Theme.Token[]).map((t) => [t, draw_token(t, asked, own, [])])) as Record<Theme.Token, string>;
  const theme  = { ...own };
  for (const [t, slots] of [["link", ["link"]], ["accent", ["accent", "bullet"]]] as const) {
    for (const slot of tokens[t] !== own[t] ? slots.filter((x) => !(x in colors)) : []) {
      theme[slot] = tokens[t];
    }
  }
  made = { look: now, theme, tokens };
  return made;
}

// whether a token's value asks for a color ("", auto: its default)
function draw_asked(value: string): boolean {
  return value !== "" && value !== "auto";
}

// a token's color: the one it asks for (a color; a color's name, the
// terminal's own; illi, the brand's; another token's name, that one's,
// a loop of them none), else its default: the accent the user's colors'
// accent, else auto's illi's aqua (the brand's), a named palette's its
// own (none: the terminal's magenta); the links the palette's (blue);
// the user's frame the accent, softer (draw_soft); the rest none
function draw_token(t: Theme.Token, asked: Record<Theme.Token, string>, own: Record<string, string>, seen: Theme.Token[]): string {
  const value = asked[t];
  if (Theme.theme_named(value)) {
    return seen.includes(value) || value === t ? "" : draw_token(value, asked, own, [...seen, t]);
  }
  if (draw_asked(value)) {
    return value === "illi" ? draw_brand() : Theme.NAMED[value] ?? value;
  }
  switch (t) {
    case "accent": {
      return "accent" in Theme.theme_colors() || Theme.PALETTE in PALETTES ? own.accent ?? "5" : draw_brand();
    }
    case "link": {
      return own.link ?? "4";
    }
    case "you": {
      return seen.includes("accent") ? "" : draw_soft(draw_token("accent", asked, own, [...seen, t]));
    }
    default: {
      return "";
    }
  }
}

// a color made softer: SOFT of the way toward the background, its hue
// kept; as it is where either isn't #rrggbb (the background untold, a
// terminal's own color)
function draw_soft(c: string): string {
  return c.startsWith("#") && canvas !== null ? draw_mix(c, canvas, SOFT) : c;
}

// a color f of the way to another (#rrggbb)
export function draw_mix(a: string, b: string, f: number): string {
  const at = (hex: string, k: number) => parseInt(hex.slice(k, k + 2), 16);
  return "#" + [1, 3, 5].map((k) => Math.round(at(a, k) + (at(b, k) - at(a, k)) * f).toString(16).padStart(2, "0")).join("");
}

// a color f of the way from the background (canvas) toward white, or
// toward black on a light one (a popup's backdrop and box, a pane's
// background); the background not told: none
export function draw_off(canvas: string | undefined, f: number): string | undefined {
  if (canvas === undefined) {
    return undefined;
  }
  const light = [1, 3, 5].reduce((n, k) => n + parseInt(canvas.slice(k, k + 2), 16), 0) > 3 * 128;
  return draw_mix(canvas, light ? "#000000" : "#ffffff", f);
}

// the brand's color (BRAND), as the background has it
export function draw_brand(): string {
  return BRAND[draw_tone()];
}

// the user's agents, as read, given their colors, in the order of their
// names: the one a file pins, else a slot (draw_slot). An agent's holds
// while they do; one coming or going may move the agents after it that
// want its slot
export function draw_agents(agents: { name: string; color: string | null }[]): void {
  const named = new Map(agents.map((a) => [a.name.toLowerCase(), a.color]));
  const took  = new Map<string, number | string>();
  for (const name of [...named.keys()].sort()) {
    took.set(name, named.get(name) ?? draw_slot(name, [...took.values()].filter((s) => typeof s === "number")));
  }
  slots = took;
}

// an agent's color: the one its file pins, else its slot's (draw_hue);
// one not read (a passing subagent) takes the slot it would be given
// now, for the run
export function draw_agent(name: string): string {
  const key = name.toLowerCase();
  const own = slots.get(key);
  if (typeof own === "string") {
    return own;
  }
  if (own === undefined && !PASSING.has(key)) {
    PASSING.set(key, draw_slot(key, [...[...slots.values()].filter((s) => typeof s === "number"), ...PASSING.values()]));
  }
  return draw_hue(own ?? PASSING.get(key)!);
}

// an agent's slot, given those taken: the first free in its own order of
// them (those not NEAR the brand's): the first ring's every other hue
// first (with the brand's, 60° apart), then those between, then the
// second ring; within each, as its name shuffles them (each slot by the
// hash of the two), so the colors look picked at random. All taken: its
// first
function draw_slot(name: string, taken: number[]): number {
  const hash = (x: string) => [...x].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const tier = (s: number) => (s >= HUES ? 2 : s % 2);
  const mine = Array.from({ length: 2 * HUES }, (_, s) => s).filter((s) => draw_apart(draw_turn(s), 0) > NEAR).sort((a, b) => tier(a) - tier(b) || hash(name + "/" + a) - hash(name + "/" + b));
  return mine.find((s) => !taken.includes(s)) ?? mine[0];
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
// one, else the terminal's own (the theme's own accent tells which: one
// asked for never does)
function draw_tone(): "dark" | "light" | "own" {
  return !draw_own().accent?.startsWith("#") ? "own" : draw_dark(canvas ?? CANVAS[draw_name()]) ? "dark" : "light";
}

// whether a background is dark: its luminance under half
export function draw_dark(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

// code's tokens, line by line, as its language (the first word of lang,
// any case; ALIASES) reads them: a shell's here (draw_shell), any other
// by Prism's grammar of that name or alias (loading Prism); null: a
// language neither knows, or code too long. Each is kept (draw_kept)
export function draw_code(lang: string, text: string): Token[][] | null {
  const word = lang.trim().split(/\s+/)[0].toLowerCase();
  const name = Object.hasOwn(ALIASES, word) ? ALIASES[word] : word;
  if (text.length > CODE) {
    return null;
  }
  if (SHELLS.includes(name)) {
    return draw_kept(LIT, "shell\0" + text, () => text.split("\n").map(draw_shell));
  }
  const languages = draw_prism().languages;
  const grammar   = Object.hasOwn(languages, name) ? languages[name] : null;
  if (typeof grammar !== "object" || grammar === null) {
    return null;
  }
  return draw_kept(LIT, name + "\0" + text, () => draw_lines(draw_prism().tokenize(text, grammar)));
}

// a shell's line as tokens (PIECE): comments, strings, operators, flags
// (keywords, but where a command goes: plain), and the command (a
// function) where one goes: the line's start, after an operator,
// whitespace and a session's prompt ($ or %) keeping it, any other piece
// ending it (a redirection too: what follows is its file)
function draw_shell(line: string): Token[] {
  const out: Token[] = [];
  let [at, cmd] = [0, true];
  while (at < line.length) {
    PIECE.lastIndex = at;
    const m = PIECE.exec(line);
    if (m === null) {
      out.push({ text: line.slice(at), kind: "" });
      break;
    }
    const g = m.groups!;
    const x = m[0];
    at += x.length;
    if (g.space !== undefined || (g.word !== undefined && cmd && PROMPT.test(x) && out.every((t) => t.text.trim() === ""))) {
      out.push({ text: x, kind: "" });
    } else if (g.operator !== undefined) {
      out.push({ text: x, kind: "operator" });
      cmd = true;
    } else {
      const kind = g.comment !== undefined ? "comment" : g.string !== undefined ? "string" : g.flag !== undefined ? (cmd ? "" : "keyword") : g.word !== undefined && cmd ? "function" : "";
      out.push({ text: x, kind });
      cmd = false;
    }
  }
  return out;
}

// Prism's tokens as lines of tokens: each of its kind (draw_kind), the
// text it holds of its kind, split at each line's end
function draw_lines(tokens: PrismToken[]): Token[][] {
  const lines: Token[][] = [[]];
  const walk  = (t: PrismToken | PrismToken[], kind: string): void => {
    if (Array.isArray(t)) {
      t.forEach((x) => walk(x, kind));
    } else if (typeof t !== "string") {
      walk(t.content, draw_kind(t, kind));
    } else {
      t.split("\n").forEach((part, k) => {
        if (k > 0) {
          lines.push([]);
        }
        if (part !== "") {
          lines[lines.length - 1].push({ text: part, kind });
        }
      });
    }
  };
  walk(tokens, "");
  return lines;
}

// a Prism token's kind: its type if a kind known (Theme.SYNTAX's, a
// comment's), else its first alias known, else the kind it sits in
function draw_kind(t: Exclude<PrismToken, string>, outer: string): string {
  const aliases = t.alias === undefined ? [] : Array.isArray(t.alias) ? t.alias : [t.alias];
  return [t.type, ...aliases].find((k) => Object.hasOwn(Theme.SYNTAX, k) || Theme.COMMENTS.includes(k)) ?? outer;
}

// each code kind's color in the terminal's own palette (auto, the
// background untold: Theme.SYNTAX, the theme's syntax entries over it);
// none in a palette, whose slots color code (Reply.ts)
export function draw_syntax(): Record<string, string> {
  return draw_name() === "mono" && !(Theme.PALETTE in PALETTES) ? Theme.SYNTAX : {};
}

// what draws a diagram, loaded as the first is drawn
function draw_art(): Art {
  return (art ??= { cells: require("pelext"), pele: require("pelext/pele") });
}

// Prism, loaded at the first code it reads
function draw_prism(): Prism {
  return (prism ??= require("./Prism.ts"));
}

// what make makes, kept by key: the KEPT used last, the one used least
// lately let go
function draw_kept<T>(kept: Map<string, T>, key: string, make: () => T): T {
  if (kept.has(key)) {
    const x = kept.get(key)!;
    kept.delete(key);
    kept.set(key, x);
    return x;
  }
  const x = make();
  kept.set(key, x);
  if (kept.size > KEPT) {
    kept.delete(kept.keys().next().value!);
  }
  return x;
}
