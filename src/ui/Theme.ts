// Theme
// =====
// The colors and glyphs of the view. What the machine wrote is filled,
// what a person or
// Illi said is framed: a block (a summary) and a tool call sit on a
// fill, a shade of the terminal's own background; every result is a file's lines (a read's, a write's or
// edit's diff, any other output's): framed, its name on the top edge,
// each line numbered; the user's message and
// a report sit in a frame; Illi's answer, its thinking and a note are bare.
// A call is named by its tool, a report or note by WHO; thinking
// is unnamed, told by its faint italic. Every tool
// is in ink, its emoji telling it at a glance (TOOL); a diff's lines are
// green and red. Text is in the terminal's own palette (ANSI), so it
// fits any theme, light or dark; the fill is the terminal's background a
// little lighter (a dark one) or darker (a light one), once the terminal
// tells it (Paint.ts), and none while it doesn't: a dim bar marks what
// it fills. Code's tokens are in the palette too (SYNTAX). Illi's replies
// and diagrams paint true color, as cellsmith does (Reply.ts, Draw.ts): a
// cellsmith palette (PALETTE) over the terminal's own background, or, the
// background untold, the terminal's palette (REPLY). The user's theme
// (config.THEME, a JSON file) may set any entry of ANSI, GLYPH, TOOL and
// SYNTAX, the PALETTE, and any of its colors (COLORS); a color that won't
// do is left out, a glyph's control characters too (theme_check); a file
// that won't read is told once the screen is up (THEME_TROUBLE):
//
//     { "ansi": { "block": "7", "ink": "0" }, "glyph": { "input": "❯ " },
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

// Constants
// =========

// why the user's theme file won't read ("": it does, or there is none),
// for the screen to say once it is up (Term.ts)
export let THEME_TROUBLE = "";

// the user's theme: its entries over these (none: these)
const OWN = theme_read();

// the fill and the text on it ("": a shade of the terminal's background,
// its own ink; "7", "0": its light gray, its black), a diff's lines ("2":
// its green, "1": its red), the user's frame, as ANSI palette colors, so
// they follow the terminal's theme
export const ANSI: Record<string, string> = { block: "", ink: "", add: "2", del: "1", you: "4", ...OWN.ansi };

// what a message is, named on its top (a report's frame edge, a note's
// first line; a result names itself on its frame's edge; a report: its agent's name, else this; a
// call: its tool). The user's words (framed) and Illi's (bare) need none
export const WHO: Record<string, string> = { work: "Report", note: "Note" };

export const KIND: Record<Kind, Look> = {
  user : { dim: false, it: false },
  work : { dim: false, it: false },
  illi : { dim: false, it: false },
  tool : { dim: true, it: false },
  echo : { dim: true, it: false },
  note : { dim: true, it: true },
  mind : { dim: true, it: true },
};

// the kinds filled (the machine's); framed (the user's, an agent's); the
// rest (Illi's, thinking, notes) bare, any name over it
export const FILLED: Kind[] = ["tool"];
export const FRAMED: Kind[] = ["user", "work"];

// each tool's emoji, in both views; any other's is TOOL_ANY
export const TOOL: Record<string, string> = {
  zoom     : "🔍",
  date     : "📅",
  shell    : "⌨️",
  read     : "📖",
  write    : "📄",
  edit     : "📝",
  spawn    : "🤖",
  tell     : "💬",
  todo     : "📋",
  ...OWN.tool,
};
export const TOOL_ANY = "🔧";

export const GLYPH = {
  tab     : "◯",  // a chat's tab
  here    : "●",  // the tab of the chat shown
  input   : "> ", // before the message typed (its other lines indented as far)
  find    : "⌕ ", // before a list's search (the model picker's)
  open    : "▾",  // an open block's bar
  pending : "□",  // a to-do item not begun
  active  : "▸",  // the one at work
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

// the palette replies and diagrams draw in: one of cellsmith's
// (cellsmith/presets.ts), "mono" (the terminal's ink: bold and dim, shades
// for a diagram's series), or "auto": a dark or light one by the
// terminal's background; untold, replies in REPLY, diagrams mono
export const PALETTE = OWN.palette ?? OWN.diagrams ?? "auto";

// a reply's colors in the terminal's own palette, for "auto" untold:
// cellsmith's slots (Reply.ts); a slot left out is the ink (a comment, a
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
export const COLORS: Record<string, string> = theme_entries(OWN.colors, theme_color);

// an agent's name as shown: its first letter a capital (reviewer-2:
// Reviewer-2); typed, and in the model's tools, as it is
export function agent_name(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function tool_glyph(name: string): string {
  return TOOL[name] ?? TOOL_ANY;
}

// the user's theme file, read once, each entry checked (theme_check);
// one that won't parse is kept to say (THEME_TROUBLE)
function theme_read(): { ansi?: Record<string, string>; glyph?: Record<string, string>; tool?: Record<string, string>; syntax?: Record<string, string>; palette?: string; diagrams?: string; colors?: Record<string, string> } {
  if (!fs.existsSync(config.THEME)) {
    return {};
  }
  try {
    return theme_check(JSON.parse(fs.readFileSync(config.THEME, "utf8")));
  } catch (err: any) {
    THEME_TROUBLE = "The theme file " + config.THEME + " won't read (" + err.message + "), so Illi uses its own colors.";
    return {};
  }
}

// a theme's entries that will do: colors a palette index ("0"-"255") or
// #rrggbb ("": the terminal's own, for ANSI's), glyphs and tools' emoji
// text without control characters (an imported profile's theme could
// otherwise send the terminal escapes); any other left out
export function theme_check(own: any): ReturnType<typeof theme_read> {
  const text  = (x: unknown) => (typeof x === "string" ? x.replace(/[\x00-\x1f\x7f-\x9f]/g, "") : null);
  const name  = (x: unknown) => (typeof x === "string" ? x : undefined);
  const color = (x: unknown) => (x === "" ? "" : theme_color(x));
  return {
    ansi     : theme_entries(own?.ansi, color),
    glyph    : theme_entries(own?.glyph, text),
    tool     : theme_entries(own?.tool, text),
    syntax   : theme_entries(own?.syntax, theme_color),
    palette  : name(own?.palette),
    diagrams : name(own?.diagrams),
    colors   : own?.colors,
  };
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
