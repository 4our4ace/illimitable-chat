// Theme
// =====
// The colors and glyphs of the view. What the machine wrote is filled,
// what a person or
// illi said is framed: a block (a summary) and a tool call sit on a
// fill, a shade of the terminal's own background; every result is a file's lines (a read's, a write's or
// edit's diff, any other output's): framed, its name on the top edge,
// each line numbered; the user's message and
// a report sit in a frame; illi's answer, its thinking and a note are bare.
// A call is named by its tool, a report or note by WHO; thinking
// is unnamed, told by its faint italic. Every tool
// is in ink, its name in bold (a theme may mark one: TOOL); a diff's lines are
// green and red. Text is in the terminal's own palette (ANSI), so it
// fits any theme, light or dark; the fill is the terminal's background a
// little lighter (a dark one) or darker (a light one), once the terminal
// tells it (Paint.ts), and none while it doesn't: a dim bar marks what
// it fills. Code's tokens are in the palette too (SYNTAX). illi's replies
// and diagrams paint true color (Reply.ts, Draw.ts): a palette
// (PALETTE, Palettes.ts) over the terminal's own background, or, the
// background untold, the terminal's palette (REPLY); those parts as
// prismantis has them (THIRD_PARTY_NOTICES.md).
//
// Every colored part of the screen takes its color from one of a few
// tokens (TOKENS), never a color of its own, so one change recolors all
// of a kind alike: the accent (copy buttons, the side's bars, the
// spinner and the ∞, a pane's title, a list's matches, the profile's
// name, a pasted text's chip, the text chosen), you (the frame round the
// user's words: the accent, softer, unless set), a reply's links,
// success, warning and error, and the secondary text (dim). Draw.ts
// makes each one's color (draw_tokens): the accent illi's aqua (a named
// palette's own accent), the links the palette's, the rest the
// terminal's own; an accent not the palette's own is its accent and
// bullets too. The user's theme (config.THEME, a JSON file) may set
// any entry of ANSI, GLYPH, TOOL and SYNTAX, the PALETTE, any of its
// colors (COLORS) and any token (its accent the one-word way, `accent`);
// a plugin's theme goes over the file's (theme_plug), the `accent`
// setting over both. A color that won't do is left out, a glyph's
// control characters too (theme_check); a file that won't read is told
// once the screen is up (THEME_TROUBLE):
//
//     { "accent": "#7dcfff", "tokens": { "you": "accent", "dim": "8" },
//       "ansi": { "block": "7", "ink": "0" }, "glyph": { "input": "$ " },
//       "tool": { "shell": "$" }, "syntax": { "keyword": "4" },
//       "palette": "nord", "colors": { "heading": "#ff9e64" } }

import * as fs from "node:fs";
import type { Kind } from "../ai/AskAI.ts";
import * as config from "../config/Config.ts";

// Types
// =====

// a kind of message's look: whether dim (the secondary ink), whether in
// italics
type Look = { dim: boolean; it: boolean };

// a token: the color every part of the screen of its kind takes (TOKENS)
export type Token = "accent" | "you" | "link" | "success" | "warning" | "error" | "dim";

// a theme's entries, as read (theme_check)
type Own = {
  ansi?   : Record<string, string>;
  glyph?  : Record<string, string>;
  tool?   : Record<string, string>;
  syntax? : Record<string, string>;
  palette?: string;
  colors? : Record<string, string>;
  tokens? : Partial<Record<Token, string>>;
};

// Constants
// =========

// the tokens' names
const NAMES: Token[] = ["accent", "you", "link", "success", "warning", "error", "dim"];

// the colors a token may name, the terminal's own (its palette's
// indexes), so they read on its background, light or dark; "illi" names
// illi's aqua too (Draw.ts). The accent setting offers these
// (config.SETTINGS)
export const NAMED: Record<string, string> = { red: "1", green: "2", yellow: "3", blue: "4", magenta: "5", cyan: "6" };

// why the user's theme file won't read ("": it does, or there is none),
// for the screen to say once it is up (Term.ts)
export let THEME_TROUBLE = "";

// the user's theme: its entries over these (none: these)
const OWN = theme_read();

// the fill and the text on it ("": a shade of the terminal's background,
// its own ink; "7", "0": its light gray, its black), as ANSI palette
// colors, so they follow the terminal's theme; a diff's lines (add, del)
// and the user's frame (you) if the theme sets them, else their tokens'
// (success, error, you)
export const ANSI: Record<string, string | undefined> = { block: "", ink: "", ...OWN.ansi };

// each token's color as the theme asks it: a color, a color's name
// (NAMED, illi), another token's name (it follows that one), or "" (its
// default, Draw.ts: the accent illi's aqua, or a named palette's own;
// the links the palette's; the user's frame the accent, softer; the
// rest the terminal's own, its ink, dim its faint). The theme's ansi
// sets the user's frame too, as an older theme does
export const TOKENS: Record<Token, string> = { accent: "", you: OWN.ansi?.you ?? "", link: "", success: "2", warning: "3", error: "1", dim: "", ...OWN.tokens };

// what a message is, named on its top (a report's frame edge, a note's
// first line; a result names itself on its frame's edge; a report: its agent's name, else this; a
// call: its tool). The user's words (framed) and illi's (bare) need none
export const WHO: Record<string, string> = { work: "Report", note: "Note" };

export const KIND: Record<Kind, Look> = {
  user : { dim: false, it: false },
  work : { dim: false, it: false },
  illi : { dim: false, it: false },
  tool : { dim: true, it: false },
  echo : { dim: true, it: false },
  note : { dim: true, it: true },
  mind : { dim: true, it: true },
  recap: { dim: false, it: false },
};

// the kinds filled (the machine's); framed (the user's, an agent's); the
// rest (illi's, thinking, notes) bare, any name over it
export const FILLED: Kind[] = ["tool"];
export const FRAMED: Kind[] = ["user", "work"];

// a mark before a tool's name, by tool, as the theme sets it (none of
// its own: a call reads by its name)
export const TOOL: Record<string, string> = { ...OWN.tool };

export const GLYPH = {
  tab     : "◯",  // one of a set: a chat's tab, a list's row, the side's agents, skills, profiles
  here    : "●",  // the one in use: the tab shown, the model, agent or profile picked, a skill on
  input   : "> ", // before the message typed (its other lines indented as far)
  find    : "⌕ ", // before a list's search
  open    : "[-]", // an open run's head, the side's to-do shown whole (a click shuts it)
  shut    : "[+]", // a shut run's head, a message folded, the side's to-do folded (a click opens it)
  lit     : ">",  // the lit row of a list or a question
  pending : "□",  // a to-do item not begun
  active  : ">",  // the one at work
  done    : "■",  // one done
  ...OWN.glyph,
};

// a code token's color by its kind (Prism's names, the shell's too: Draw.ts):
// the palette's plain hues, which read on its background and a shade of
// it; a comment is dimmed
export const SYNTAX: Record<string, string> = {
  string     : "2",
  char       : "2",
  url        : "2",
  inserted   : "2",
  number     : "1",
  boolean    : "1",
  constant   : "1",
  symbol     : "1",
  deleted    : "1",
  regex      : "1",
  keyword    : "5",
  important  : "5",
  atrule     : "5",
  rule       : "5",
  variable   : "5",
  "attr-name": "5",
  "template-string": "2",
  "attr-value": "2",
  function   : "4",
  "class-name": "4",
  builtin    : "4",
  key        : "4",
  selector   : "4",
  property   : "4",
  tag        : "4",
  ...OWN.syntax,
};

// the kinds of a comment, drawn dim
export const COMMENTS = ["comment", "prolog", "doctype", "cdata"];

// the palette replies and diagrams draw in: one of Palettes.ts's, "mono"
// (the terminal's ink: bold and dim, shades
// for a diagram's series), or "auto": a dark or light one by the
// terminal's background; untold, replies in REPLY, diagrams mono
export const PALETTE = OWN.palette ?? "auto";

// a reply's colors in the terminal's own palette, for "auto" untold:
// the palettes' slots (Reply.ts); a slot left out is the ink (a comment, a
// rule, a quote dimmed)
export const REPLY: Record<string, string> = {
  accent     : "5",
  heading    : "3",
  tableHeader: "3",
  inlineCode : "6",
  codeCommand: SYNTAX.function,
  codeFlag   : SYNTAX.keyword,
  codeString : SYNTAX.string,
  link       : "4",
  path       : "6",
  number     : "2",
  bullet     : "5",
};

// the user's colors over the palette's, by slot: #rrggbb, or a palette
// index ("0"-"255")
const COLORS: Record<string, string> = theme_entries(OWN.colors, theme_color);

// what plugins set over the theme file's (theme_plug): tokens and colors;
// the changes counted (theme_changes), and the accent setting as last
// seen
const PLUGGED: { tokens: Partial<Record<Token, string>>; colors: Record<string, string> } = { tokens: {}, colors: {} };
let changes = 0;
let accent  = config.ACCENT;

// the mark before a tool's name ("": none)
export function tool_glyph(name: string): string {
  return TOOL[name] ?? "";
}

// each token as asked now: the theme file's, a plugin's over them, the
// accent setting over all (but "auto": the theme's)
export function theme_tokens(): Record<Token, string> {
  const set = theme_token(config.ACCENT);
  return { ...TOKENS, ...PLUGGED.tokens, ...(set === null || set === "auto" || set === "" ? {} : { accent: set }) };
}

// the user's colors over the palette's, by slot: the theme file's, a
// plugin's over them
export function theme_colors(): Record<string, string> {
  return { ...COLORS, ...PLUGGED.colors };
}

// a plugin's theme (Plugins.ts) over the file's: its accent, tokens and
// colors, each checked as the file's are (theme_check); those it leaves
// out stay as they were
export function theme_plug(over: unknown): void {
  const o   = typeof over === "object" && over !== null ? (over as Record<string, unknown>) : {};
  const own = theme_check({ accent: o.accent, tokens: o.tokens });
  Object.assign(PLUGGED.tokens, own.tokens);
  Object.assign(PLUGGED.colors, theme_entries(o.colors, theme_color));
  changes += 1;
}

// the theme's changes counted: a plugin's theme, the accent setting
// changed (config_set). What is drawn in the theme is made anew as the
// count moves (Draw.draw_stamp)
export function theme_changes(): number {
  if (accent !== config.ACCENT) {
    accent  = config.ACCENT;
    changes += 1;
  }
  return changes;
}

// whether a value names a token
export function theme_named(x: string): x is Token {
  return (NAMES as string[]).includes(x);
}

// the user's theme file, read once, each entry checked (theme_check);
// one that won't parse is kept to say (THEME_TROUBLE)
function theme_read(): Own {
  if (!fs.existsSync(config.THEME)) {
    return {};
  }
  try {
    return theme_check(JSON.parse(fs.readFileSync(config.THEME, "utf8")));
  } catch (err: any) {
    THEME_TROUBLE = "The theme file " + config.THEME + " won't read (" + err.message + "), so illi uses its own colors.";
    return {};
  }
}

// a theme's entries that will do: colors a palette index ("0"-"255") or
// #rrggbb ("": the terminal's own, for ANSI's), glyphs and tools' marks
// text without control characters (an imported profile's theme could
// otherwise send the terminal escapes), tokens as theme_token takes them
// (`accent` alone the accent's, under `tokens` its own); any other left
// out
export function theme_check(own: any): Own {
  const text  = (x: unknown) => (typeof x === "string" ? x.replace(/[\x00-\x1f\x7f-\x9f]/g, "") : null);
  const name  = (x: unknown) => (typeof x === "string" ? x : undefined);
  const color = (x: unknown) => (x === "" ? "" : theme_color(x));
  const asked = { ...(own?.accent === undefined ? {} : { accent: own.accent }), ...(typeof own?.tokens === "object" ? own.tokens : {}) };
  return {
    ansi     : theme_entries(own?.ansi, color),
    glyph    : theme_entries(own?.glyph, text),
    tool     : theme_entries(own?.tool, text),
    syntax   : theme_entries(own?.syntax, theme_color),
    palette  : name(own?.palette),
    colors   : own?.colors,
    tokens   : Object.fromEntries(Object.entries(theme_entries(asked, theme_token)).filter(([k]) => theme_named(k))),
  };
}

// a token's value as a theme gives it: a color (theme_color), a color's
// name (NAMED, illi; "auto", the accent setting's own), another token's
// name, or "" (its default's); names in small letters; null: none of
// these
export function theme_token(x: unknown): string | null {
  if (typeof x !== "string") {
    return null;
  }
  const word = x.trim().toLowerCase();
  return word === "" || word === "illi" || word === "auto" || word in NAMED || theme_named(word) ? word : theme_color(x.trim());
}

// a color as a theme gives it: a palette index (0-255) or #rrggbb; null:
// neither
function theme_color(x: unknown): string | null {
  return typeof x === "string" && (/^#[0-9a-f]{6}$/i.test(x) || (/^\d{1,3}$/.test(x) && Number(x) <= 255)) ? x : null;
}

// an object's entries as f takes them, those it refuses (null) left out
function theme_entries(xs: unknown, f: (x: unknown) => string | null): Record<string, string> {
  const all = typeof xs === "object" && xs !== null ? Object.entries(xs) : [];
  return Object.fromEntries(all.flatMap(([k, x]) => {
    const y = f(x);
    return y === null ? [] : [[k, y]];
  }));
}
