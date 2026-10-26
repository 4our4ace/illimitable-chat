// Screen
// ======
// The terminal of Term.ts, whole: its alternate screen, drawn as rows,
// each paint writing only the rows that changed (none: nothing; a
// spinner's frame only its cells; rows moved as a block, as a chat grows
// or scrolls, moved by the terminal), in one synchronized write; the
// terminal's own scrollback stays as it was, and is back as illi quits,
// or hands the terminal on (screen_leave). A pipe gets lines
// as text. Input is read raw (macOS cuts a
// cooked line at 1024 bytes) as one stream, into one buffer (Bun's own
// reader takes half a megabyte a read); a paste comes bracketed and
// is typed whole. Kitty's keys at flag 1 only, so dead keys still
// compose. The mouse reports its wheel (where it turned too), its left
// button pressed (counted: a double click, a triple), dragged and let go,
// and each move (SGR), for Term.ts to choose text and light buttons;
// Shift and a drag still select as the terminal's own. The terminal tells
// as its window gains and loses the focus, so a press that only focuses
// it is marked (focusing): no key, no paint; the focus lost is told
// (Away), so what the pointer lit goes out. The terminal is asked its
// background (OSC 11), which diagrams draw over (Draw.ts); its answer
// comes as input, and is never typed. The input (Ed) draws as rows
// starting `> `, wrapped between words (ed_wrap: a chip one word, a word
// wider than a row at any character), and takes its editing keys
// (ed_key, EDITING) here, and the place a click on it puts the cursor
// (ed_at; the press is Select.ts's); taller than it shows, it scrolls
// only as the cursor leaves the rows shown, so what a click lands on
// stays put; Up and Down past its ends walk the messages sent. A long
// paste shows in it as one token, [Pasted text #n +L lines], an
// attached image as [Image #n]: each erased whole, a paste's text put
// back in its place as it's sent (ed_expand). A lone /word is a command
// being typed, and one the cursor ends mid-message a skill's name,
// matched to the names (ed_slash, ed_rank, ed_find: Term.ts lists them
// under the input). A list open (grab) takes keys before the input
// does, and a list searched (type) the text typed.
//
// In a window (term/Window.ts, which owns the terminal for every
// profile's illi under it; Member.ts sets it up), the screen is a PTY of
// its own: the window writes the modes, the screen only its rows, its
// queries and frames (Wire.ts). It says it is up as it starts and as
// it's shown again (asking the kitty flags and the background then, so
// the answers reach the screen that uses them); hidden, it paints
// nothing and keeps reading (only frames count then: keys that reach it,
// sent as it hid, are dropped, the focus told too, so shown again it
// takes the focus as had); frames in its input are the window's,
// cut out before keys wherever they fall (in a key, a paste) and awaited
// however slow; Ctrl+Z goes to the window; the PTY lost (its read fails
// or ends) means the window is gone.

import * as fs from "node:fs";
import { StringDecoder } from "node:string_decoder";
import * as Draw from "./Draw.ts";
import * as Md from "./Md.ts";
import { ASK, BLINK, CLEAR, FLAGS_ASK, HIDE, MODES_OFF, MODES_ON, PASTE_OFF, PASTE_ON, SHOW, STEADY, SYNC_OFF, SYNC_ON, TITLE_AGAIN, TITLE_END, TITLE_NONE, TITLE_POP, TITLE_SET } from "./Modes.ts";
import * as Paint from "./Paint.ts";
import * as Theme from "./Theme.ts";
import { CAP, wire_cut, wire_head, wire_take } from "../term/Wire.ts";

// Types
// =====

// the input: its text, cursor, the messages sent before, the one Up and
// Down are at (hist.length: the new one), the new one meanwhile, whether
// Left or Right (or a click) moved the cursor, the width its rows wrap
// at, the first of its rows shown (screen_input); the long pastes by
// their token's number, the last number given; its layout as last made
// (ed_layout)
export type Ed = {
  text  : string;
  pos   : number;
  hist  : string[];
  at    : number;
  draft : string;
  moved : boolean;
  w     : number;
  top   : number;
  pastes: Map<number, string>;
  n     : number;
  laid? : Laid;
};

// a line of the input (between newlines) wrapped (ed_wrap): its rows,
// each place of the cursor in it (pos and row from the line's start)
type Wrap = { rows: string[]; places: Place[] };

// the input laid out (ed_layout): for what text and width, its rows,
// each line's first character and first row, and its wrap; the wraps by
// line, for the next layout at that width (a key changes one line: only
// it is wrapped again, so a long text costs a key little)
export type Laid = { text: string; w: number; rows: string[]; lines: { pos: number; row: number; wrap: Wrap }[]; wraps: Map<string, Wrap> };

// where the cursor shows: a row, a column
export type Spot = { row: number; col: number };

// a place of the cursor in the input: its index in the text, its spot
type Place = Spot & { pos: number };

// a piece of a screen's row: a line, cut at w columns, from column col
export type Piece = { col: number; w: number; line: Paint.Line };

// a name a word typed matches: its index, the places of the characters
// matched in it (hay: matched in what it does, not its name: the places
// are the hay's, ed_find)
export type Match = { k: number; at: number[]; hay?: true };

// the screen: whether a terminal, whether it answered kitty's flags (so
// Esc comes as CSI 27u, and a bare ESC only starts a sequence), the
// input, input not read yet (cut by a read's end) and the wait for the
// rest of it (screen_alone), the rows as last
// written ([]: none, the screen to clear), where the left button was last
// pressed, how many times there in a row (2: a double click, 3: a triple)
// and when, where the pointer is; whether the window lost the focus (not
// told it's back), when it last gained it (ms; none: never told), whether
// the last press only focused it; whether the input was typed in since
// Term.ts last looked; what takes keys first (true: it took the key),
// where keys go, what takes text typed first (true: it took it; none:
// the input), what takes a paste (none: typed); the terminal's
// background (#rrggbb) once told, and whether it is awaited; whether it
// was left (screen_leave: it paints no more); whether the cursor blinks
// (illi waits), its look and its spot as last written (null: hidden);
// the pieces of the rows as last written; in a window, its end of it, and
// whether hidden (it paints nothing)
export type Screen = {
  tty      : boolean;
  kitty    : boolean;
  ed       : Ed;
  rest     : string;
  alone?   : ReturnType<typeof setTimeout>;
  shown    : string[];
  click    : Spot;
  clicks   : number;
  pressed  : number;
  point    : Spot;
  away?    : boolean;
  gained?  : number;
  focusing?: boolean;
  typed    : boolean;
  grab     : ((key: string) => boolean) | null;
  on       : (key: string) => void;
  type?    : (text: string) => boolean;
  paste?   : (text: string) => void;
  canvas?  : string;
  asked?   : boolean;
  left?    : boolean;
  blink?   : boolean;
  styled?  : string;
  at?      : Spot | null;
  drawn?   : Piece[][];
  title?   : string;
  titled?  : boolean;
  win?     : Windowed;
  hidden?  : boolean;
};

// a screen in a window (Member.ts): the wire's nonce; whether it starts
// hidden; a message heard from the window (by this screen); the frame
// that says the screen is up; Ctrl+Z; the PTY lost (the window gone)
export type Windowed = { nonce: string; hidden: boolean; heard: (msg: object, scr: Screen) => void; up: () => string; suspend: () => void; lost: () => void };

// Constants
// =========

// the editing keys, as /help lists them
export const EDITING = "Arrows, Home, End, Ctrl+A, E, U, K, W, Alt+B, F, D, as in a shell; a click puts the cursor where it lands; Shift+Enter or Ctrl+J, a new line; Up and Down past the ends, the messages sent. A / first lists the commands that match as you type (by name, then by a word of what they do), in a box over the input: Up and Down choose, Tab fills one in, Enter (or a click) runs it (or fills it in, if it needs an argument or was found by what it does), Esc closes the list.";

// the fewest characters a word finds options by what they do (ed_find):
// a shorter one would find most
const HAY = 3;

// a paste longer than these (lines, characters) shows as a token; a
// token in the input (as a split keeps it); a pasted one's number
const LONG_LINES = 5;
const LONG_CHARS = 500;
const TOKEN  = /(\[(?:Pasted text #\d+[^\]\n]*|Image #\d+)\])/g;
const PASTED = /\[Pasted text #(\d+)[^\]\n]*\]/g;

// the terminal's window gained the focus, lost it (never a key); a press
// within FOCUS of the focus gained (ms), or while it's lost (the report
// comes after it), is the click that focused the window
const FOCUS_IN  = "\x1b[I";
const FOCUS_OUT = "\x1b[O";
const FOCUS     = 150;

// the background's answer (OSC 11 ; rgb:r/g/b, ended by BEL or ST) and
// one cut by a read's end; how long it is awaited (ms): a bare ESC ] then
// is Alt+]
const OSC      = /^\x1b\](\d+);([^\x07\x1b]*)(?:\x07|\x1b\\)/;
const OSC_CUT  = /^\x1b\](?:\d+(?:;[^\x07\x1b]*)?)?\x1b?$/;
const RGB      = /^rgba?:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})/i;
const AWAIT    = 1000;

// a sequence: CSI params [intermediates] final, or SS3 final (kitty's:
// CSI code[:alts] [; mods] u; modifyOtherKeys': CSI 27 ; mods ; code ~;
// the mouse's: CSI < button ; col ; row M, or m as it's let go); CUT: one
// cut by the end of a read (a bare ESC too, where Esc is CSI 27u, and
// in a window, where it may start a frame);
// FLAGS: kitty's answer to the flags asked
const SEQ   = /^\x1b(?:\[([0-9;:?<=>]*)[\x20-\x2f]*|O)([\x40-\x7e])/;
const CUT   = /^\x1b(?:\[[0-9;:?<=>\x20-\x2f]*|O)$/;
const FLAGS = /^\?\d*$/;
const MOUSE = /^<(\d+);(\d+);(\d+)$/;

// a read that is only the pointer moving, no button down (whatever the
// modifiers), or the focus told: nothing for Term.ts to paint
const MOVED = /^(?:\x1b\[<(?:35|39|43|47|51|55|59|63);\d+;\d+M|\x1b\[[IO])+$/;

// key names by code (a byte, kitty's), by a sequence's final, or by its
// number and `~`; any other code is its character, byte Ctrl+letter
const KEYS: Record<string, string> = {
  8     : "Ctrl+Backspace",
  9     : "Tab",
  13    : "Enter",
  27    : "Esc",
  32    : "Space",
  127   : "Backspace",
  57414 : "Enter",
  57417 : "Left",
  57418 : "Right",
  57419 : "Up",
  57420 : "Down",
  57421 : "PgUp",
  57422 : "PgDn",
  57423 : "Home",
  57424 : "End",
  57425 : "Insert",
  57426 : "Delete",
  A     : "Up",
  B     : "Down",
  C     : "Right",
  D     : "Left",
  H     : "Home",
  F     : "End",
  Z     : "Shift+Tab",
  "1~"  : "Home",
  "3~"  : "Delete",
  "4~"  : "End",
  "5~"  : "PgUp",
  "6~"  : "PgDn",
  "7~"  : "Home",
  "8~"  : "End",
};

// kitty's keypad keys that type a character, by code: KP_0 to KP_9, the
// decimal point, /, *, -, +, = and the separator (KP_ENTER is Enter, the
// arrows and the rest of the pad KEYS')
const KEYPAD: Record<number, string> = { 57409: ".", 57410: "/", 57411: "*", 57412: "-", 57413: "+", 57415: "=", 57416: "," };
for (let k = 0; k < 10; k++) {
  KEYPAD[57399 + k] = String(k);
}

// a key's sequence cut by a read's end is awaited this long (ms) for
// the rest of it, read alone after: a bare ESC, ESC [ or ESC O (Esc, a
// legacy Alt+[ or Alt+Shift+O); a longer one, a sequence that never
// ended, is dropped after AWAIT
const ALONE = 50;

// each line's text as written, at the width it was cut to
// (screen_line_text); a line is never changed once made
const WRITTEN = new WeakMap<Paint.Line, { w: number; text: string }>();

// rows moved as a block, at least this many, are moved by the terminal
// (screen_shift) rather than written again
const BLOCK = 4;

// a terminal's input is read into one buffer this big, again and again
// (screen_read): Bun's own reader takes half a megabyte for each read, so
// each key cost a collection; a read with nothing ready is tried again
// after RETRY (ms)
const READ  = 65536;
const RETRY = 10;

// a word's character (a mark too: a letter decomposed is one word)
const WORD = /[\p{L}\p{M}\p{N}_]/u;

// modifiers, as bits of (mods - 1)
const MODS: [number, string][] = [[4, "Ctrl+"], [2, "Alt+"], [1, "Shift+"]];

// the keys with Shift that are no editing key, though the key alone is
// one: Shift and an arrow, the pick's moves (Commands.ts ARROWS)
const SHIFT_OWN = new Set(["Shift+Left", "Shift+Right", "Shift+Up", "Shift+Down"]);

// a mouse report's button: the wheel's bit, its down bit, its sideways
// bit (66, 67), a move's bit (with no button down: NONE), the right
// button; the modifiers' bits (ignored); how soon a press again in the
// same place counts twice (ms)
const WHEEL    = 64;
const DOWN     = 1;
const SIDEWAYS = 2;
const DRAG  = 32;
const NONE  = 3;
const RIGHT = 2;
const SHIFT = 4 | 8 | 16;
export const TWICE = 400;

// Screen
// ======

// the screen: on a terminal, raw, its modes on (put back as illi exits),
// the background asked; in a window (win), raw, and up unless hidden
export function screen_new(on: (key: string) => void, win?: Windowed): Screen {
  const tty = process.stdin.isTTY === true && process.stdout.isTTY === true;
  const ed  = ed_new();
  const scr: Screen = { tty, kitty: false, ed, rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, grab: null, on };
  if (tty) {
    process.stdin.setRawMode(true);
    if (win === undefined) {
      screen_ask(scr, MODES_ON);
      process.on("exit", () => scr.left || process.stdout.write(screen_off(scr)));
    } else {
      [scr.win, scr.hidden] = [win, win.hidden];
      if (!win.hidden) {
        screen_ask(scr, win.up() + FLAGS_ASK);
      }
    }
    screen_read(scr);
    return scr;
  }
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (data: string) => screen_feed(scr, data)).resume();
  return scr;
}

// what comes first, then the background asked (its answer awaited for
// AWAIT)
function screen_ask(scr: Screen, first: string): void {
  process.stdout.write(first + ASK);
  scr.asked = true;
  setTimeout(() => (scr.asked = false), AWAIT).unref();
}

// a terminal's input (fd), read into one buffer (READ) as it comes, each
// read fed as text (a character cut by a read's end waits for its rest);
// a read cut by a signal (Ctrl+Z), or with nothing ready, tried again;
// till the screen is left or the terminal is gone (in a window: lost)
export function screen_read(scr: Screen, fd = 0): void {
  const buf  = Buffer.alloc(READ);
  const text = new StringDecoder("utf8");
  const next = (): void => fs.read(fd, buf, 0, READ, null, (err, n) => {
    if (scr.left) {
      return;
    }
    if (err?.code === "EINTR" || err?.code === "EAGAIN") {
      setTimeout(next, err.code === "EAGAIN" ? RETRY : 0);
    } else if (err === null && n > 0) {
      screen_feed(scr, text.write(buf.subarray(0, n)));
      next();
    } else {
      scr.win?.lost();
    }
  });
  next();
}

// the screen's size: its columns, its rows
export function screen_size(): { w: number; h: number } {
  return { w: process.stdout.columns || 80, h: process.stdout.rows || 24 };
}

// Output
// ------

// the screen's rows, each its pieces; only those not as last written are
// written again (all, after screen_wipe), then the cursor at its spot
// (null: hidden); none, and the cursor as it was: nothing written. A row
// whose pieces are alike those last written isn't even made again
export function screen_paint(scr: Screen, rows: Piece[][], at: Spot | null): void {
  if (scr.left || scr.hidden) {
    return;
  }
  const fresh = scr.shown.length === 0;
  const drawn = (scr.drawn ??= []);
  const moved = rows.map((row, k) => fresh || !screen_alike(scr, k, row));
  let out = fresh ? "" : screen_shift(scr, rows, moved);
  for (let k = 0; k < rows.length; k++) {
    if (moved[k]) {
      const x = screen_row_text(rows[k]);
      out += fresh || scr.shown[k] !== x ? "\x1b[" + (k + 1) + ";1H" + x : "";
      scr.shown[k] = x;
    }
    drawn[k] = rows[k];
  }
  scr.shown.length = drawn.length = rows.length;
  if (!fresh && out === "" && screen_still(scr, at)) {
    return;
  }
  scr.at = at;
  process.stdout.write(SYNC_ON + HIDE + (fresh ? CLEAR : "") + out + screen_cursor(scr, at) + SYNC_OFF);
}

// rows moved as a block since last written (a chat grown or scrolled, d
// rows): from a changed row with text, in the middle of those changed,
// to each row it is alike as last written, the longest run of rows each
// alike the row d away. The terminal moves the run itself (a scroll
// region), and the rows as last written move with it (those it leaves
// blank unknown), so only the rest is written; the scroll ("": none worth
// it, BLOCK rows at least). moved: whether each row changed, kept true
function screen_shift(scr: Screen, rows: Piece[][], moved: boolean[]): string {
  const changed = moved.flatMap((m, k) => (m && rows[k].some((p) => p.line.length > 0) ? [k] : []));
  const n = Math.min(rows.length, scr.shown.length);
  let [a, b, d] = [0, -1, 0];
  for (const p of changed.length < BLOCK ? [] : [changed[changed.length >> 1], changed[changed.length >> 2], changed[(3 * changed.length) >> 2]]) {
    for (let j = 0; j < n; j++) {
      if (j === p || !screen_alike(scr, j, rows[p])) {
        continue;
      }
      let [lo, hi] = [p, p];
      while (lo > 0 && lo - 1 + j - p >= 0 && screen_alike(scr, lo - 1 + j - p, rows[lo - 1])) {
        lo--;
      }
      while (hi + 1 < n && hi + 1 + j - p < n && screen_alike(scr, hi + 1 + j - p, rows[hi + 1])) {
        hi++;
      }
      if (hi - lo > b - a) {
        [a, b, d] = [lo, hi, j - p];
      }
    }
  }
  if (b - a + 1 < BLOCK || b - a + 1 <= Math.abs(d)) {
    return "";
  }
  const [top, bot] = d > 0 ? [a, b + d] : [a + d, b];
  const [shown, drawn] = [scr.shown.slice(top, bot + 1), scr.drawn!.slice(top, bot + 1)];
  for (let r = top; r <= bot; r++) {
    const from = r + d - top;
    scr.shown[r]  = from >= 0 && from < shown.length ? shown[from] : "";
    scr.drawn![r] = from >= 0 && from < shown.length ? drawn[from] : [];
    moved[r]      = !screen_alike(scr, r, rows[r]);
  }
  return "\x1b[" + (top + 1) + ";" + (bot + 1) + "r\x1b[" + Math.abs(d) + (d > 0 ? "S" : "T") + "\x1b[r";
}

// whether row k's pieces are alike those last written there (its text
// known): each at the same column, as wide, its line the same or alike
function screen_alike(scr: Screen, k: number, row: Piece[]): boolean {
  const was = scr.drawn?.[k];
  if (was === undefined || was.length !== row.length || scr.shown[k] === "") {
    return false;
  }
  for (let i = 0; i < row.length; i++) {
    if (was[i].col !== row[i].col || was[i].w !== row[i].w || !lines_alike(was[i].line, row[i].line)) {
      return false;
    }
  }
  return true;
}

// whether two lines write alike: the same line, or run by run the same
// text in the same ink
function lines_alike(a: Paint.Line, b: Paint.Line): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let k = 0; k < a.length; k++) {
    if (a[k].x !== b[k].x || !inks_alike(a[k].s, b[k].s)) {
      return false;
    }
  }
  return true;
}

// whether two inks are alike, mark by mark (dim, bold, color, ...)
function inks_alike(a: Paint.Run["s"], b: Paint.Run["s"]): boolean {
  if (a === b) {
    return true;
  }
  for (const mark in a) {
    if (a[mark as keyof typeof a] !== b[mark as keyof typeof b]) {
      return false;
    }
  }
  return true;
}

// whether the cursor shows as last written: at the same spot in the
// same look, or hidden still
function screen_still(scr: Screen, at: Spot | null): boolean {
  return at === null ? scr.at === null : scr.at?.row === at.row && scr.at.col === at.col && (scr.blink ? BLINK : STEADY) === scr.styled;
}

// the cursor put at its spot and shown, in its look (null: left hidden)
function screen_cursor(scr: Screen, at: Spot | null): string {
  return at === null ? "" : "\x1b[" + (at.row + 1) + ";" + (at.col + 1) + "H" + SHOW + screen_style(scr);
}

// the cursor's look, if it's to change (blinking while illi waits)
function screen_style(scr: Screen): string {
  const style = scr.blink ? BLINK : STEADY;
  return style === scr.styled ? "" : (scr.styled = style);
}

// row k written again alone, if it changed, the others as last written
// (a spinner's frame, between paints); none written yet: nothing
export function screen_row(scr: Screen, k: number, row: Piece[], at: Spot | null): void {
  const x = screen_row_text(row);
  if (scr.left || scr.hidden || scr.shown.length <= k || scr.shown[k] === x) {
    return;
  }
  scr.shown[k] = x;
  (scr.drawn ??= [])[k] = row;
  process.stdout.write(SYNC_ON + HIDE + "\x1b[" + (k + 1) + ";1H" + x + screen_cursor(scr, at) + SYNC_OFF);
}

// pieces of row k written again alone, the rest of the row as it is,
// then the cursor at its spot (a spinner's frame): each piece's cells
// erased, then its line, cut to them; the row as last written then
// unknown, so the next paint writes it whole. None written yet: nothing
export function screen_cells(scr: Screen, k: number, pieces: Piece[], at: Spot | null): void {
  if (scr.left || scr.hidden || scr.shown.length <= k) {
    return;
  }
  const cells = pieces.map((p) => "\x1b[" + (p.col + 1) + "G\x1b[" + p.w + "X" + Paint.line_ansi(Paint.runs_wrap(p.line, p.w, true)[0])).join("");
  scr.shown[k] = "";
  process.stdout.write(SYNC_ON + HIDE + "\x1b[" + (k + 1) + ";1H" + cells + screen_cursor(scr, at) + SYNC_OFF);
}

// a row as written: cleared, then each piece at its column, cut to its
// width (a later piece over an earlier one)
function screen_row_text(row: Piece[]): string {
  let x = "\x1b[2K";
  for (const p of row) {
    x += "\x1b[" + (p.col + 1) + "G" + screen_line_text(p.line, p.w);
  }
  return x;
}

// a line as written, cut to w columns: made once a line and width (a
// chat's lines, laid out once, are painted again and again)
function screen_line_text(line: Paint.Line, w: number): string {
  const known = WRITTEN.get(line);
  if (known?.w === w) {
    return known.text;
  }
  const text = Paint.line_ansi(Paint.runs_wrap(line, w, true)[0]);
  WRITTEN.set(line, { w, text });
  return text;
}

// the next paint clears the screen and writes every row, and the
// cursor's look (a new size, Ctrl+L, back from a suspend)
export function screen_wipe(scr: Screen): void {
  scr.shown  = [];
  scr.styled = undefined;
  scr.title  = undefined;
}

// in a window, the screen hidden: it paints nothing till shown, and
// forgets what it wrote
export function screen_hide(scr: Screen): void {
  scr.hidden = true;
  screen_wipe(scr);
}

// in a window, the screen shown again: up (the kitty flags and the
// background asked again), then every row written anew. The focus as it
// was told before is stale (a hidden screen hears no report): taken as
// had, as at the start, so a loss told before it hid never makes every
// press a focus click
export function screen_show(scr: Screen): void {
  if (scr.win === undefined || scr.left) {
    return;
  }
  [scr.hidden, scr.away] = [false, false];
  screen_wipe(scr);
  screen_ask(scr, scr.win.up() + FLAGS_ASK);
  scr.on("");
}

// the window's title (OSC 0), written only as it changes (and after
// screen_wipe, as a terminal may have lost it); null: illi's taken off,
// the one before put back (and saved again, for illi's next)
export function screen_title(scr: Screen, text: string | null): void {
  if (!scr.tty || scr.left || scr.hidden) {
    return;
  }
  if (text === null) {
    if (scr.titled) {
      process.stdout.write(TITLE_AGAIN);
    }
    [scr.title, scr.titled] = [undefined, false];
    return;
  }
  const clean = Paint.text_clean(text);
  if (clean !== scr.title) {
    process.stdout.write(TITLE_SET + clean + TITLE_END);
    [scr.title, scr.titled] = [clean, true];
  }
}

// the screen's modes off (MODES_OFF), and the window's title put back:
// illi's emptied, if it wrote one, then the one saved popped
function screen_off(scr: Screen): string {
  const off = (scr.titled ? TITLE_NONE : "") + TITLE_POP + MODES_OFF;
  [scr.title, scr.titled] = [undefined, false];
  return off;
}

// a pipe's lines, as text
export function screen_print(lines: Paint.Line[]): void {
  process.stdout.write(lines.map((l) => l.map((r) => r.x).join("").trimEnd() + "\n").join(""));
}

// a text to the terminal's clipboard (OSC 52)
export function screen_copy(text: string): void {
  process.stdout.write("\x1b]52;c;" + Buffer.from(text).toString("base64") + "\x07");
}

// Input
// -----

// each key read, then "" (the input may have changed), unless the
// pointer only moved. In a window, the window's frames first
// (screen_wired), and no key once hidden (a switch or Ctrl+Z read here:
// those after it were meant for the profile shown next); what's left
// unread is awaited as a paste is while it is a frame's start (up to
// Wire's CAP), or while hidden (no keys come then)
export function screen_feed(scr: Screen, data: string): void {
  data = scr.rest + data;
  let cut = "";
  if (scr.win !== undefined) {
    [data, cut] = screen_wired(scr, scr.win, data);
  }
  const moved = MOVED.test(data);
  let n = 1;
  while (data !== "" && n > 0 && scr.hidden !== true) {
    n = screen_key(scr, data);
    data = data.slice(n);
  }
  const rest = scr.rest = (scr.hidden === true ? "" : data) + cut;
  clearTimeout(scr.alone);
  const framed = scr.win !== undefined && (scr.hidden === true || (rest.startsWith(wire_head(scr.win.nonce)) && rest.length <= CAP));
  if (scr.tty && rest.startsWith("\x1b") && !rest.startsWith(PASTE_ON) && !framed) {
    scr.alone = setTimeout(() => screen_alone(scr), rest.length <= 2 ? ALONE : AWAIT);
    scr.alone.unref?.();
  }
  if (!moved) {
    scr.on("");
  }
}

// in a window, the window's frames cut out of the input wherever they
// fall (it writes one between two reads of the terminal, which may end
// inside a key or a paste) and heard, before the keys around them; keys
// reaching a hidden screen dropped (sent as it hid, they were meant for
// the profile shown next); what's left: the keys, and a frame cut by the
// read's end (or its start, or an Esc), awaited
function screen_wired(scr: Screen, win: Windowed, data: string): [keys: string, cut: string] {
  const { parts, carry } = wire_cut("", data, win.nonce);
  let keys = "";
  for (const part of parts) {
    if (typeof part !== "string") {
      win.heard(part, scr);
    } else if (scr.hidden !== true) {
      keys += part;
    }
  }
  return [keys, carry];
}

// a sequence's start left unread (screen_feed), nothing more come for
// it: a bare ESC is Esc (where Esc comes as CSI 27u, one a read cut
// short, or a terminal that sends it bare anyway: never held till the
// next key), ESC [ or ESC O (] while the background is awaited) a legacy
// Alt+ that key; a longer one, a sequence never ended, dropped. A paste
// is awaited to its end, however slow
function screen_alone(scr: Screen): void {
  const rest = scr.rest;
  scr.rest = "";
  if (rest === "\x1b") {
    screen_press(scr, "Esc");
  } else if (rest.length === 2) {
    screen_press(scr, "Alt+" + rest[1]);
  }
  scr.on("");
}

// reads one key at the start of data; returns its length (0: cut short)
function screen_key(scr: Screen, data: string): number {
  const seq  = SEQ.exec(data);
  const text = /^[^\x00-\x1f\x7f]+/.exec(data);
  const code = data.charCodeAt(0);
  if (!scr.tty) {
    return screen_line(scr, data);
  }
  if (data.startsWith(PASTE_ON)) {
    return screen_paste(scr, data);
  }
  const frame = scr.win !== undefined && data.startsWith("\x1b_") ? wire_take(data, scr.win.nonce) : null;
  if (frame !== null) {
    if (frame !== 0 && frame.msg !== null) {
      scr.win!.heard(frame.msg, scr);
    }
    return frame === 0 ? 0 : frame.n;
  }
  const osc = OSC.exec(data);
  if (osc !== null) {
    screen_osc(scr, osc[1], osc[2]);
    return osc[0].length;
  }
  if ((scr.asked && OSC_CUT.test(data)) || CUT.test(data) || ((scr.kitty || scr.win !== undefined) && data === "\x1b")) {
    return 0;
  }
  if (seq !== null && seq[2] === "u" && FLAGS.test(seq[1] ?? "")) {
    scr.kitty = true;
    return seq[0].length;
  }
  if (seq !== null && MOUSE.test(seq[1] ?? "") && (seq[2] === "M" || seq[2] === "m")) {
    screen_mouse(scr, seq[1], seq[2] === "M");
    return seq[0].length;
  }
  if (seq?.[0] === FOCUS_IN || seq?.[0] === FOCUS_OUT) {
    screen_focus(scr, seq[0] === FOCUS_IN);
    return seq[0].length;
  }
  if (seq !== null) {
    const key = seq_name(seq[1] ?? "", seq[2]);
    if (seq[2] === "u" && key === KEYPAD[Number((seq[1] ?? "").split(/[;:]/)[0])]) {
      screen_text(scr, key);
    } else {
      screen_press(scr, key);
    }
    return seq[0].length;
  }
  if (code === 27 && data.length > 1 && data[1] !== "\x1b") {
    const c  = data.codePointAt(1) ?? 0;
    const ch = String.fromCodePoint(c);
    screen_press(scr, "Alt+" + (KEYS[c] ?? (c < 32 ? "Ctrl+" + String.fromCharCode(c + 64) : ch.toUpperCase())));
    return 1 + ch.length;
  }
  if (text !== null) {
    screen_text(scr, text[0]);
    return text[0].length;
  }
  screen_press(scr, KEYS[code] ?? "Ctrl+" + String.fromCharCode(code + 64));
  return 1;
}

// text typed: to what takes it first, else the input
function screen_text(scr: Screen, text: string): void {
  if (scr.type?.(text) !== true) {
    ed_type(scr.ed, text);
    scr.typed = true;
  }
}

// a key: to what grabs keys first; an editing key edits the input; any
// other goes to Term.ts
function screen_press(scr: Screen, key: string): void {
  if (scr.grab?.(key)) {
    return;
  }
  if (ed_key(scr.ed, key)) {
    scr.typed = true;
  } else {
    scr.on(key);
  }
}

// a mouse report (its params, whether pressed): the wheel as WheelUp or
// WheelDown (where: scr.point; turned sideways: nothing); the left button
// as Press (where: scr.click, how many times there: scr.clicks, whether
// it only focused the window: scr.focusing), Drag and Release, the
// pointer moving with none down as Move, the right button as RightPress,
// RightDrag and RightRelease (each where: scr.point); the middle one does
// nothing
function screen_mouse(scr: Screen, params: string, down: boolean): void {
  const [, b, col, row] = MOUSE.exec(params)!.map(Number);
  const button = b & ~SHIFT;
  const at     = { row: row - 1, col: col - 1 };
  const now    = Date.now();
  if (button & WHEEL) {
    if (!(button & SIDEWAYS)) {
      scr.point = at;
      screen_press(scr, button & DOWN ? "WheelDown" : "WheelUp");
    }
  } else if (button === DRAG || button === (DRAG | NONE)) {
    scr.point = at;
    scr.on(button === DRAG ? "Drag" : "Move");
  } else if (button === RIGHT || button === (DRAG | RIGHT)) {
    scr.point = at;
    scr.on(button === RIGHT ? (down ? "RightPress" : "RightRelease") : "RightDrag");
  } else if (button === 0 && down) {
    const again = now - scr.pressed < TWICE && at.row === scr.click.row && at.col === scr.click.col;
    scr.clicks  = again ? (scr.clicks % 3) + 1 : 1;
    scr.focusing = scr.away === true || now - (scr.gained ?? -Infinity) < FOCUS;
    [scr.click, scr.point, scr.pressed] = [at, at, now];
    scr.on("Press");
  } else if (button === 0) {
    scr.point = at;
    scr.on("Release");
  }
}

// the terminal's window gained the focus (in), or lost it: kept, never
// a key; lost, told (Away: what the pointer lit goes out)
function screen_focus(scr: Screen, on: boolean): void {
  scr.away = !on;
  if (on) {
    scr.gained = Date.now();
  } else {
    scr.on("Away");
  }
}

// a terminal's answer (OSC code ; body): its background, as #rrggbb (each
// part scaled from its digits), to Term.ts as Canvas; any other ignored
function screen_osc(scr: Screen, code: string, body: string): void {
  const rgb = code === "11" ? RGB.exec(body) : null;
  if (rgb !== null) {
    const part = (x: string) => Math.round((parseInt(x, 16) / (16 ** x.length - 1)) * 255).toString(16).padStart(2, "0");
    scr.canvas = "#" + rgb.slice(1).map(part).join("");
    scr.asked  = false;
    scr.on("Canvas");
  }
}

// stops the process (Ctrl+Z), the terminal as it found it; continued
// (fg), the screen's modes again, and every row written anew. In a
// window, the window does it (win.suspend)
export function screen_suspend(scr: Screen): void {
  if (scr.win !== undefined) {
    return scr.win.suspend();
  }
  process.stdout.write(screen_off(scr));
  process.stdin.setRawMode(false);
  process.once("SIGCONT", () => {
    process.stdin.setRawMode(true);
    process.stdout.write(MODES_ON);
    screen_wipe(scr);
    scr.on("");
  });
  process.kill(0, "SIGTSTP");
}

// the terminal as illi found it, for the program that takes it next (a
// profile's switch: illi run again, or a message before quitting): its
// modes off, its input cooked and no longer read; answers once that is
// written. The exit's own reset is skipped then: leaving the alternate
// screen twice puts the cursor back over what was written between. In a
// window, the terminal is the window's: nothing written, the PTY kept raw
export function screen_leave(scr: Screen): Promise<void> {
  scr.left = true;
  if (scr.win !== undefined) {
    process.stdin.pause();
    return Promise.resolve();
  }
  if (scr.tty) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
  return new Promise((done) => process.stdout.write(scr.tty ? screen_off(scr) : "", () => done()));
}

// a paste, typed whole (in a window, the window's frames in it are cut
// out first: screen_wired)
function screen_paste(scr: Screen, data: string): number {
  const end = data.indexOf(PASTE_OFF);
  if (end < 0) {
    return 0;
  }
  const text = data.slice(PASTE_ON.length, end).replace(/\r\n?/g, "\n");
  if (scr.paste === undefined) {
    ed_type(scr.ed, text);
  } else {
    scr.paste(text);
  }
  return end + PASTE_OFF.length;
}

// a pipe's input: typed as it comes, each newline sending it (the last
// line, without one, is sent at the input's end: Term.ts)
function screen_line(scr: Screen, data: string): number {
  const k = data.indexOf("\n");
  ed_type(scr.ed, k < 0 ? data : data.slice(0, k));
  if (k < 0) {
    return data.length;
  }
  scr.on("Enter");
  return k + 1;
}

// a sequence's key: its code's (kitty, modifyOtherKeys) or its final's
function seq_name(params: string, end: string): string {
  const [a = 1, b = 1, c = 1] = params.split(";").map((p) => Number(p.split(":")[0]) || 1);
  const code = end === "u" ? a : end === "~" && a === 27 ? c : null;
  const name = end === "~" ? a + "~" : end;
  const key  = code === null ? KEYS[name] ?? name : KEYS[code] ?? KEYPAD[code] ?? String.fromCodePoint(code).toUpperCase();
  const mods = MODS.filter(([bit]) => (b - 1) & bit).map(([, m]) => m);
  return mods.join("") + key;
}

// the input's rows in w columns, at most max of them, as many as it
// holds: from the first shown last (ed.top), moved only as far as shows
// the cursor's row, and up as rows go (all that fit show); its first row
// after the mark, the rest indented as far; a hint when empty, grey when
// off; where the cursor shows, and the first row shown and the layout (a
// click's place in them: ed_at)
export function screen_input(scr: Screen, w: number, max: number, hint: string, off: boolean): { lines: Paint.Line[]; at: Spot; top: number; laid: Laid } {
  const mark = Paint.Run(Theme.GLYPH.input, Paint.DIM);
  const pad  = Paint.Run(" ".repeat(Paint.text_width(Theme.GLYPH.input)));
  const ink  = off ? Paint.DIM : Paint.INK;
  const ed   = scr.ed;
  const mw   = Paint.text_width(Theme.GLYPH.input);
  ed.w = w - mw;
  const laid = ed_layout(ed);
  const spot = ed_place(laid, ed.pos);
  const most = Math.max(1, max);
  const top  = Math.min(Math.max(ed.top, spot.row - most + 1), spot.row, Math.max(0, laid.rows.length - most));
  const seen = laid.rows.slice(top, top + most);
  const text = ed.text === "" ? [[mark, Paint.Run(Paint.text_clean(hint), Paint.DIM)]] : seen.map((x, k) => [top + k === 0 ? mark : pad, ...input_runs(x, ink)]);
  ed.top = top;
  return { lines: text, at: { row: spot.row - top, col: spot.col + mw }, top, laid };
}

// a row of the input: its chips (a pasted text, an image) in the
// theme's accent, the rest in ink
function input_runs(row: string, ink: Paint.Run["s"]): Paint.Line {
  const chip = { ...ink, c: Draw.draw_tokens().accent };
  return row.split(TOKEN).map((x, k) => Paint.Run(x, k % 2 === 1 ? chip : ink)).filter((r) => r.x !== "");
}

// Ed
// ==

export function ed_new(): Ed {
  return { text: "", pos: 0, hist: [], at: 0, draft: "", moved: false, w: 80, top: 0, pastes: new Map(), n: 0 };
}

// a paste: a long one kept, its token typed; a short one typed. A long
// one pasted again while its token is in the input shows whole: the
// token becomes its text, the cursor at its end
export function ed_paste(ed: Ed, text: string): void {
  const body = text.replace(/\n$/, "");
  if (body.split("\n").length <= LONG_LINES && text.length <= LONG_CHARS) {
    return ed_type(ed, text);
  }
  const same = [...ed.text.matchAll(PASTED)].findLast((m) => ed.pastes.get(Number(m[1]))?.replace(/\n$/, "") === body);
  if (same !== undefined) {
    const at = same.index!;
    ed.pastes.delete(Number(same[1]));
    ed.text = ed.text.slice(0, at) + body + ed.text.slice(at + same[0].length);
    ed.pos  = at + body.length;
    return;
  }
  ed.pastes.set(++ed.n, text);
  ed_type(ed, Md.paste_label(ed.n, text));
}

// an image's token typed, a space around it; its number
export function ed_image(ed: Ed): number {
  ed_type(ed, (ed.pos === 0 || /\s$/.test(ed.text.slice(0, ed.pos)) ? "" : " ") + "[Image #" + ++ed.n + "] ");
  return ed.n;
}

// a text as sent: each paste's token its text, marked (Md.paste_mark)
export function ed_expand(ed: Ed, text: string): string {
  return text.replace(PASTED, (token, n: string) => (ed.pastes.has(Number(n)) ? Md.paste_mark(Number(n), ed.pastes.get(Number(n))!) : token));
}

// the messages sent before, as typed: each marked paste its token again
export function ed_history(ed: Ed, sent: string[]): void {
  ed.hist = sent.map((text) => text.replace(Md.PASTE, (_, _n: string, x: string) => {
    ed.pastes.set(++ed.n, x);
    return Md.paste_label(ed.n, x);
  }));
  ed.at = ed.hist.length;
}

// the images a text names, by number, in order
export function ed_images(text: string): number[] {
  return [...text.matchAll(/\[Image #(\d+)\]/g)].map((m) => Number(m[1]));
}

// the length of the token that ends (d < 0) or starts at pos; 0: none
function ed_token(text: string, pos: number, d: number): number {
  const hit = [...text.matchAll(TOKEN)].find((m) => (d < 0 ? m.index! + m[0].length === pos : m.index === pos));
  return hit === undefined ? 0 : hit[0].length;
}

// the input's rows, wrapped at ed.w columns, line by line (ed_wrap; a
// line as last wrapped at that width taken as it was). Laid out anew
// only as the text or the width changes: a key that moves the cursor,
// and the paint after any key, take the last
function ed_layout(ed: Ed): Laid {
  if (ed.laid?.text === ed.text && ed.laid.w === ed.w) {
    return ed.laid;
  }
  const was   = ed.laid?.w === ed.w ? ed.laid.wraps : new Map<string, Wrap>();
  const wraps = new Map<string, Wrap>();
  const sized = new Map<string, [string, number]>();
  const rows: string[] = [];
  const lines: Laid["lines"] = [];
  const texts = ed.text.split("\n");
  let pos = 0;
  for (const [k, text] of texts.entries()) {
    const key  = k === texts.length - 1 ? "\n" + text : text;
    const wrap = wraps.get(key) ?? was.get(key) ?? ed_wrap(text, ed.w, k === texts.length - 1, sized);
    wraps.set(key, wrap);
    lines.push({ pos, row: rows.length, wrap });
    for (const row of wrap.rows) {
      rows.push(row);
    }
    pos += text.length + 1;
  }
  return (ed.laid = { text: ed.text, w: ed.w, rows, lines, wraps });
}

// a line's rows, wrapped at w columns between words, and each place of
// the cursor (before each character, and the end). No word ends in a
// row's last column but one that starts its row: one that would goes
// down to the next row whole, so the space after it, or the cursor at
// the line's end, is beside it, and what is typed after it never takes
// it back up. A word that would cross
// the edge starts the next row whole, the space before it left at the
// end of its row; a space that finds its row full (its word starting
// the row, or the space after another) hangs past the edge,
// unshown (the row then full: what follows starts the next, a second
// space too, and the line's end, which gets a row of its own, so no
// two places show at one spot); a chip (a paste's token, an image's) is
// one word, its spaces none to break at, as a no-break space is none; a
// word wider than a row, at any character. Each character cleaned and
// measured once (sized: those measured); cuts: where each character
// starts in its row's text
function ed_wrap(text: string, w: number, last: boolean, sized: Map<string, [string, number]>): Wrap {
  const rows = [""];
  const places: Place[] = [];
  const cuts: number[] = [];
  const chips = [...text.matchAll(TOKEN)].map((m) => [m.index!, m.index! + m[0].length]);
  let [col, pos] = [0, 0];
  let word = -1;
  let [gap, hung] = [false, false];
  // the word (from places[word] on, starting at column from) moved to the
  // start of a row of its own
  const down = (from: number) => {
    const r   = rows.length - 1;
    const cut = word < places.length ? cuts[word] : rows[r].length;
    rows.push(rows[r].slice(cut));
    rows[r] = rows[r].slice(0, cut);
    for (let k = word; k < places.length; k++) {
      [places[k], cuts[k]] = [{ ...places[k], row: r + 1, col: places[k].col - from }, cuts[k] - cut];
    }
    col -= from;
  };
  for (const g of Paint.text_graphemes(text)) {
    let shown = sized.get(g);
    if (shown === undefined) {
      const x = Paint.text_clean(g);
      sized.set(g, (shown = [x, Paint.text_width(x)]));
    }
    const [x, cw] = shown;
    const space = /^[^\S\u00a0\u2007\u202f\ufeff]+$/.test(g) && !chips.some(([a, b]) => a < pos && pos < b);
    const from  = word >= 0 && word < places.length ? places[word].col : 0;
    if (space && !hung && !gap && col + cw > w && from > 0 && col - from + cw <= w) {
      down(from);
    }
    if (space && !hung && col + cw > w) {
      places.push({ pos, row: rows.length - 1, col });
      cuts.push(rows[rows.length - 1].length);
      [pos, col, word, gap, hung] = [pos + g.length, w, -1, true, true];
      continue;
    }
    word = !space && gap ? places.length : word;
    if (col + cw > w || hung) {
      const start = word >= 0 && word < places.length ? places[word].col : col;
      if (!space && word >= 0 && col - start + cw <= w) {
        down(start);
      } else {
        rows.push("");
        col = 0;
      }
      [word, hung] = [-1, false];
    }
    places.push({ pos, row: rows.length - 1, col });
    cuts.push(rows[rows.length - 1].length);
    pos += g.length;
    rows[rows.length - 1] += x;
    col += cw;
    gap = space;
  }
  const from = word >= 0 && word < places.length ? places[word].col : 0;
  if (!hung && !gap && col >= w && from > 0 && col - from < w) {
    down(from);
  } else if ((last || hung) && col >= w) {
    rows.push("");
    col = 0;
  }
  places.push({ pos, row: rows.length - 1, col });
  return { rows, places };
}

// the index of the last line ok holds for (ok: true up to some line,
// false after it), by halves
function ed_line(laid: Laid, ok: (line: Laid["lines"][number]) => boolean): number {
  let [lo, hi] = [0, laid.lines.length - 1];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    [lo, hi] = ok(laid.lines[mid]) ? [mid, hi] : [lo, mid - 1];
  }
  return lo;
}

// the place of the cursor at pos (the first at or after it, in its line)
function ed_place(laid: Laid, pos: number): Place {
  const line = laid.lines[ed_line(laid, (l) => l.pos <= pos)];
  const ps   = line.wrap.places;
  const p    = ps.find((p) => line.pos + p.pos >= pos) ?? ps[ps.length - 1];
  return { pos: line.pos + p.pos, row: line.row + p.row, col: p.col };
}

// where the cursor goes from pos a place back (d < 0) or on: over a line's
// end to the next's start; at the text's ends, stays
function ed_step(laid: Laid, pos: number, d: number): number {
  const i    = ed_line(laid, (l) => l.pos <= pos);
  const line = laid.lines[i];
  const ps   = line.wrap.places;
  const k    = ps.findIndex((p) => line.pos + p.pos >= pos);
  const j    = (k < 0 ? ps.length - 1 : k) + d;
  const to   = laid.lines[i + d];
  if (j >= 0 && j < ps.length) {
    return line.pos + ps[j].pos;
  }
  return to === undefined ? line.pos + ps[j < 0 ? 0 : ps.length - 1].pos : to.pos + to.wrap.places[d < 0 ? to.wrap.places.length - 1 : 0].pos;
}

// the places of the cursor on row r (none: past the ends)
function ed_row(laid: Laid, r: number): Place[] {
  if (r < 0 || r >= laid.rows.length) {
    return [];
  }
  const line = laid.lines[ed_line(laid, (l) => l.row <= r)];
  return line.wrap.places.filter((p) => p.row === r - line.row).map((p) => ({ pos: line.pos + p.pos, row: r, col: p.col }));
}

// where a click puts the cursor in the input laid out (laid; or a line
// laid out as it: a question's line asked, illi's form's words), shown
// from its row top: at row and column col of what shows, as screen_input
// lays it out (the mark first, the other rows indented as far). On a
// character, before it (a wide one by either half); on the mark or the
// indent, at the row's start; past the row's text, after its last
// character (a row wrapped: where the next row starts, which shows the
// cursor); past the last row, at the text's end (before the first, its
// start); inside a chip (a paste's token, an image's), at its nearer
// edge. A row with no place (a character wider than the input put on the
// next): the next row's first
export function ed_at(laid: Laid, top: number, row: number, col: number): number {
  const r = top + row;
  if (r < 0 || r >= laid.rows.length) {
    return r < 0 ? 0 : laid.text.length;
  }
  const line = laid.lines[ed_line(laid, (l) => l.row <= r)];
  const here = line.wrap.places.filter((p) => p.row === r - line.row);
  const next = line.wrap.places.find((p) => p.row > r - line.row);
  const c    = col - Paint.text_width(Theme.GLYPH.input);
  const at   = c >= Paint.text_width(laid.rows[r]) ? next ?? here[here.length - 1] : here.filter((p) => p.col <= c).pop() ?? here[0] ?? next;
  return ed_chip(laid.text, line.pos + at.pos);
}

// where a click at column col of a text shown on one row from its start
// puts the cursor (a list's search: Popup.ts): on a character, before it
// (a wide one by either half); before the text, at its start; past it,
// at its end; inside a chip, at its nearer edge
export function ed_col(text: string, col: number): number {
  let [at, pos] = [0, 0];
  for (const g of Paint.text_graphemes(text)) {
    const w = Paint.text_width(g);
    if (col < at + w) {
      break;
    }
    [at, pos] = [at + w, pos + g.length];
  }
  return ed_chip(text, pos);
}

// a place inside a chip (TOKEN) moved to its nearer edge; any other kept
function ed_chip(text: string, pos: number): number {
  const hit = [...text.matchAll(TOKEN)].find((m) => m.index! < pos && pos < m.index! + m[0].length);
  if (hit === undefined) {
    return pos;
  }
  const [from, to] = [hit.index!, hit.index! + hit[0].length];
  return pos - from < to - pos ? from : to;
}

// text typed or pasted, at the cursor
export function ed_type(ed: Ed, s: string): void {
  ed.text = ed.text.slice(0, ed.pos) + s + ed.text.slice(ed.pos);
  ed.pos += s.length;
}

// the input's text replaced, the cursor at its end
export function ed_set(ed: Ed, text: string): void {
  ed.text = text;
  ed.pos  = text.length;
}

// the /word being typed and where it starts: the input's text, a lone
// `/word`; else one mid-message that the cursor ends, after a space or a
// line's start, with no / after its first (a path is none). A message sent
// before, brought back by Up and not edited, is none (Up and Down walk
// on); null: none
export function ed_slash(ed: Ed): { word: string; from: number } | null {
  if (ed.text === ed.hist[ed.at]) {
    return null;
  }
  if (/^\/\S*$/.test(ed.text)) {
    return { word: ed.text, from: 0 };
  }
  const word = /(?:^|\s)(\/[^\s/]*)$/.exec(ed.text.slice(0, ed.pos))?.[1];
  return word === undefined || /^\S/.test(ed.text.slice(ed.pos)) ? null : { word, from: ed.pos - word.length };
}

// the names a word matches, best first, case aside: those it starts (the
// one it is first); then those it is in (at a word's start first, then
// the earliest); then those with its characters in turn (the closest
// together first). In each, the most used first (used: how often each
// was chosen), then in their order
export function ed_rank(word: string, names: string[], used: (k: number) => number = () => 0): Match[] {
  return ed_tiers(word, names, used).map(({ k, at }) => ({ k, at }));
}

// the options a word finds, best first: those whose names it starts or
// is in (ed_rank's first two kinds); then, for a word of HAY characters
// or more, those with a word in their hay (what each does) that it starts
// (case aside, any script), the more used first; then those whose names
// hold its characters in turn
export function ed_find(word: string, names: string[], hays: Array<string | undefined>, used: (k: number) => number = () => 0): Match[] {
  const named = ed_tiers(word, names, used);
  const close = new Set(named.filter((m) => m.tier < 2).map((m) => m.k));
  const said  = [...word].length < HAY ? [] : ed_words(word, hays).filter((m) => !close.has(m.k)).sort((a, b) => used(b.k) - used(a.k) || a.k - b.k);
  const by    = new Set(said.map((m) => m.k));
  const plain = ({ k, at }: Match) => ({ k, at });
  return [...named.filter((m) => m.tier < 2).map(plain), ...said, ...named.filter((m) => m.tier === 2 && !by.has(m.k)).map(plain)];
}

// the hays in which a word starts a word (case aside), each its first
// such place
function ed_words(word: string, hays: Array<string | undefined>): Match[] {
  const find = new RegExp("(?<![\\p{L}\\p{N}])" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu");
  return hays.flatMap((hay, k): Match[] => {
    const hit = hay === undefined ? null : find.exec(hay);
    return hit === null ? [] : [{ k, at: Array.from({ length: hit[0].length }, (_, j) => hit.index + j), hay: true }];
  });
}

// ed_rank's matches, each with its kind (tier: 0 starts, 1 is in, 2 its
// characters in turn)
function ed_tiers(word: string, names: string[], used: (k: number) => number): Array<Match & { tier: number }> {
  const want  = [...word].map((c) => c.toLowerCase());
  const found: Array<Match & { tier: number; cost: number }> = [];
  names.forEach((name, k) => {
    const have = [...name].map((c) => c.toLowerCase());
    const from = have.findIndex((_, i) => want.every((c, j) => have[i + j] === c));
    const seq  = from >= 0 ? null : ed_closest(have, want);
    if (from === 0) {
      found.push({ k, at: want.map((_, j) => j), tier: 0, cost: have.length === want.length ? 0 : 1 });
    } else if (from > 0) {
      found.push({ k, at: want.map((_, j) => from + j), tier: 1, cost: (/[a-z0-9]/.test(have[from - 1]) ? 1e6 : 0) + from });
    } else if (seq !== null) {
      found.push({ k, at: seq, tier: 2, cost: seq[seq.length - 1] - seq[0] });
    }
  });
  return found.sort((a, b) => a.tier - b.tier || used(b.k) - used(a.k) || a.cost - b.cost || a.k - b.k).map(({ k, at, tier }) => ({ k, at, tier }));
}

// the places of want's characters in have, in turn, the closest together
// (null: not all there)
function ed_closest(have: string[], want: string[]): number[] | null {
  let best: number[] | null = null;
  have.forEach((c, i) => {
    const seq = [i];
    for (let j = i + 1; c === want[0] && j < have.length && seq.length < want.length; j++) {
      if (have[j] === want[seq.length]) {
        seq.push(j);
      }
    }
    if (c === want[0] && seq.length === want.length && (best === null || seq[seq.length - 1] - i < best[best.length - 1] - best[0])) {
      best = seq;
    }
  });
  return best;
}

// an editing key: a new line, a move, a character or word erased;
// whether key is one. Shift with one edits as the key alone, as legacy
// terminals send it (kitty's keys and modifyOtherKeys tell Shift apart:
// Shift+Backspace erases as Backspace does), but where Shift means
// something of its own (SHIFT_OWN); Shift+Enter is a new line
export function ed_key(ed: Ed, key: string): boolean {
  const laid = ed_layout(ed);
  const back = ed_step(laid, ed.pos, -1);
  const next = ed_step(laid, ed.pos, 1);
  const word_back = ed_word(ed.text, ed.pos, -1);
  const word_next = ed_word(ed.text, ed.pos, 1);
  const move: Record<string, number> = {
    "Left": back, "Right": next, "Home": 0, "End": ed.text.length, "Ctrl+A": 0, "Ctrl+E": ed.text.length,
    "Ctrl+Left": word_back, "Alt+Left": word_back, "Alt+B": word_back,
    "Ctrl+Right": word_next, "Alt+Right": word_next, "Alt+F": word_next,
  };
  const erase: Record<string, [number, number]> = {
    "Backspace": [ed.pos - (ed_token(ed.text, ed.pos, -1) || ed.pos - back), ed.pos], "Delete": [ed.pos, ed.pos + (ed_token(ed.text, ed.pos, 1) || next - ed.pos)],
    "Ctrl+Backspace": [word_back, ed.pos], "Alt+Backspace": [word_back, ed.pos], "Ctrl+W": [word_back, ed.pos],
    "Ctrl+Delete": [ed.pos, word_next], "Alt+Delete": [ed.pos, word_next], "Alt+D": [ed.pos, word_next],
    "Ctrl+U": [0, ed.pos], "Ctrl+K": [ed.pos, ed.text.length],
  };
  const bare = key.includes("Shift+") && !SHIFT_OWN.has(key) ? key.replace("Shift+", "") : key;
  if (bare in move) {
    ed.pos   = move[bare];
    ed.moved = true;
    return true;
  }
  if (bare in erase) {
    const [a, b] = erase[bare];
    ed.text = ed.text.slice(0, a) + ed.text.slice(b);
    ed.pos  = a;
    return true;
  }
  switch (key) {
    case "Shift+Enter":
    case "Ctrl+J":
    case "Ctrl+Shift+J": {
      ed_type(ed, "\n");
      return true;
    }
    case "Up":
    case "Down": {
      ed_vert(ed, laid, ed_place(laid, ed.pos), key === "Up" ? -1 : 1);
      return true;
    }
  }
  return false;
}

// from pos, back (d < 0) or on, past the non-word characters, then the
// word's: a scan, as a regex anchored at the text's end is tried from
// each start, quadratic (a 24 KB pasted box took 0.7 s per key, so keys
// queued and the terminal froze)
function ed_word(text: string, pos: number, d: number): number {
  const char = (i: number) => (d < 0 ? [...text.slice(Math.max(0, i - 2), i)].at(-1) : [...text.slice(i, i + 2)][0]) ?? "";
  let i = pos;
  for (const word of [false, true]) {
    for (let c = char(i); c !== "" && WORD.test(c) === word; c = char(i)) {
      i += d * c.length;
    }
  }
  return i;
}

// Up (d < 0) or Down: a row, at the nearest column; past the ends (unless
// Left or Right moved the cursor in a typed input), the message sent
// before/after, the cursor not moved in it yet
function ed_vert(ed: Ed, laid: Laid, at: Place, d: number): void {
  const row = ed_row(laid, at.row + d);
  if (row.length > 0) {
    ed.pos = (row.filter((p) => p.col <= at.col).pop() ?? row[0]).pos;
    return;
  }
  const to = ed.at + d;
  if ((ed.moved && ed.text !== "") || to < 0 || to > ed.hist.length) {
    return;
  }
  if (ed.at === ed.hist.length) {
    ed.draft = ed.text;
  }
  ed.at    = to;
  ed.text  = to === ed.hist.length ? ed.draft : ed.hist[to];
  ed.pos   = ed.text.length;
  ed.moved = false;
}

// the input taken (Enter), kept in the history; empty again
export function ed_take(ed: Ed): string {
  const text = ed.text;
  if (text.trim() !== "" && text !== ed.hist[ed.hist.length - 1]) {
    ed.hist.push(text);
  }
  Object.assign(ed, { text: "", pos: 0, at: ed.hist.length, draft: "", moved: false });
  return text;
}
