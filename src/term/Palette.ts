// Palette
// =======
// Ctrl+P: all a person can do, in one list typed to search, as OpenCode's
// command palette, a box in the screen's middle, in groups (/help's, then
// the settings) while nothing is searched: each command (term_groups:
// its /name, else its first key), what it does (its first clause) and, at
// the right, its keys (the others); then each setting (Config SETTINGS,
// as `set <key>`), what it is and its value. A search finds a word in any
// (what a command does, all of it): rows matched by name first, then the
// rest, each the more picked here first (its own count, apart from the
// commands typed: picked.json). Enter runs a command, but
// one that needs words after it (<...>, #id) goes in the input to finish;
// a setting's row takes what /settings does (Left, Right and Enter step
// it, Enter on a pick or a text opens it, Delete puts its default back).

import { PICKED, term_chooser, term_command, term_groups, term_tally, term_tally_one } from "./Commands.ts";
import * as config from "../config/Config.ts";
import * as Screen from "../ui/Screen.ts";
import { setting_foot, setting_key, setting_open, setting_value } from "./Settings.ts";
import type { Cmd, Term } from "./Term.ts";

// the keys that mean something only pressed: the input's, the scroll's,
// the pick's steps (/model and /effort do those), the palette's own
const PRESSED = new Set(["Enter", "Esc", "Ctrl+C", "Ctrl+D", "Tab", "PgUp, PgDn", "Ctrl+Home, Ctrl+End", "Shift+Left, Shift+Right", "Shift+Up, Shift+Down", "Ctrl+P"]);

// a setting's row's name, before its key
const SET = "set ";

// the most columns the palette takes, the screen's width allowing; the
// most a value at a row's right end shows; the settings' group
const WIDE  = 72;
const ASIDE = 24;
const GROUP = "Settings";

// Ctrl+P: the palette; the user's commands and skills read anew
export function term_palette(t: Term): void {
  const all   = term_groups(true).flatMap(([group, cmds]) => cmds.filter(([use, keys]) => use !== "" || !PRESSED.has(keys)).map((cmd) => [group, cmd] as const));
  const cmds  = all.map(([, cmd]) => cmd);
  const keys  = Object.keys(config.SETTINGS) as config.Key[];
  const names = [...cmds.map(([use, keys]) => (use === "" ? keys.split(", ")[0] : use.split(" ")[0])), ...keys.map((key) => SET + key)];
  const whole = [...cmds.map(([, , text]) => text), ...keys.map((key) => config.SETTINGS[key].what)];
  const about = whole.map(palette_short);
  const aside = () => [
    ...cmds.map(([use, keys]) => (use === "" ? keys.split(", ").slice(1).join(", ") : keys)),
    ...keys.map((key) => palette_cut(setting_value(key))),
  ];
  const setting = (k: number) => (k >= cmds.length ? keys[k - cmds.length] : null);
  const press   = (k: number, key: string) => {
    const s = setting(k);
    if (s === null || !setting_key(t, s, key)) {
      return false;
    }
    if (t.choose !== null) {
      t.choose.aside = aside();
    }
    return true;
  };
  const pick = (k: number) => {
    term_tally_one(PICKED, names[k]);
    const s = setting(k);
    return s !== null ? setting_open(t, s) : palette_run(t, cmds[k]);
  };
  const picked = term_tally(PICKED);
  const foot  = (k: number) => {
    const s = setting(k);
    return s !== null ? setting_foot(s) : palette_needs(cmds[k][0]) ? "Enter type it in" : "Enter run";
  };
  const right = aside();
  term_chooser(t, "Commands", names, about, -1, pick, { find: true, keys: press, foot, hay: names.map((name, k) => name + "  " + whole[k] + "  " + right[k]), used: (k) => picked[names[k]] ?? 0, aside: right, middle: WIDE, heads: [...all.map(([group]) => group), ...keys.map(() => GROUP)] });
}

// a command chosen: one that needs words, in the input to finish (the
// commands it matches suggested); else run as typed, or as its first
// key pressed
function palette_run(t: Term, [use, keys, , run]: Cmd): void {
  const word = use.split(" ")[0];
  if (palette_needs(use)) {
    Screen.ed_set(t.scr.ed, word + " ");
    t.scr.typed = true;
  } else if (use !== "") {
    term_command(t, word, false);
  } else {
    void run(t, keys.split(", ")[0]);
  }
}

// what a command does, its first clause: no (...), nothing after a ;
function palette_short(text: string): string {
  return text.replace(/ \([^)]*\)/g, "").split("; ")[0];
}

// a value cut to ASIDE columns
function palette_cut(text: string): string {
  return text.length <= ASIDE ? text : text.slice(0, ASIDE - 1) + "…";
}

// whether a command needs words after its name: <...>, #id
function palette_needs(use: string): boolean {
  return /[<#]/.test(use);
}
