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
// compose. The mouse reports its wheel, its left button pressed (counted:
// a double click, a triple), dragged and let go, and each move (SGR), for
// Term.ts to choose text and light buttons; Shift and a drag still select
// as the terminal's own. The terminal is asked its
// background (OSC 11), which diagrams draw over (Draw.ts); its answer
// comes as input, and is never typed. The input (Ed) draws as rows
// starting `> ` and takes its editing keys (ed_key, EDITING) here; Up and
// Down past its ends walk the messages sent. A long paste shows in it as
// one token, [Pasted text #n +L lines], an attached image as [Image #n]:
// each erased whole, a paste's text put back in its place as it's sent
// (ed_expand). A lone /word is a command being typed, and one the
// cursor ends mid-message a skill's name, matched to the names (ed_slash,
// ed_rank: Term.ts lists them under the input). A list open (grab) takes keys before the input does, and a
// list searched (type) the text typed.

import * as fs from "node:fs";
import { StringDecoder } from "node:string_decoder";
import * as Draw from "./Draw.ts";
import * as Md from "./Md.ts";
import * as Paint from "./Paint.ts";
import * as Theme from "./Theme.ts";

// Types
// =====

// the input: its text, cursor, the messages sent before, the one Up and
// Down are at (hist.length: the new one), the new one meanwhile, whether
// Left or Right moved the cursor, the width its rows wrap at; the long
// pastes by their token's number, the last number given; its rows as
// last laid out, and for what text and width (ed_layout)
export type Ed = {
  text  : string;
  pos   : number;
  hist  : string[];
  at    : number;
  draft : string;
  moved : boolean;
  w     : number;
  pastes: Map<number, string>;
  n     : number;
  laid? : { text: string; w: number; rows: string[]; places: Place[] };
};

// where the cursor shows: a row, a column
export type Spot = { row: number; col: number };

// a place of the cursor in the input: its index in the text, its spot
type Place = Spot & { pos: number };

// a piece of a screen's row: a line, cut at w columns, from column col
export type Piece = { col: number; w: number; line: Paint.Line };

// a name a word typed matches: its index, the places of the characters
// matched in it
export type Match = { k: number; at: number[] };

// the screen: whether a terminal, whether it answered kitty's flags (so
// Esc comes as CSI 27u, and a bare ESC only starts a sequence), the
// input, input not read yet (cut by a read's end), the rows as last
// written ([]: none, the screen to clear), where the left button was last
// pressed, how many times there in a row (2: a double click, 3: a triple)
// and when, where the pointer is; whether the input was typed in since
// Term.ts last looked; what takes keys first (true: it took the key),
// where keys go, what takes text typed first (true: it took it; none:
// the input), what takes a paste (none: typed); the terminal's
// background (#rrggbb) once told, and whether it is awaited; whether it
// was left (screen_leave: it paints no more); whether the cursor blinks
// (illi waits), its look and its spot as last written (null: hidden);
// the pieces of the rows as last written
export type Screen = {
  tty    : boolean;
  kitty  : boolean;
  ed     : Ed;
  rest   : string;
  shown  : string[];
  click  : Spot;
  clicks : number;
  pressed: number;
  point  : Spot;
  typed  : boolean;
  grab   : ((key: string) => boolean) | null;
  on     : (key: string) => void;
  type?  : (text: string) => boolean;
  paste? : (text: string) => void;
  canvas?: string;
  asked? : boolean;
  left?  : boolean;
  blink? : boolean;
  styled?: string;
  at?    : Spot | null;
  drawn? : Piece[][];
};

// Constants
// =========

// the editing keys, as /help lists them
export const EDITING = "Arrows, Home, End, Ctrl+A, E, U, K, W, Alt+B, F, D, as in a shell; Shift+Enter or Ctrl+J, a new line; Up and Down past the ends, the messages sent. A / first lists the commands that match as you type, in a box over the input: Up and Down choose, Tab fills one in, Enter runs it (or fills it in, if it needs an argument), Esc closes the list.";

const PASTE_ON  = "\x1b[200~";
const PASTE_OFF = "\x1b[201~";

// a paste longer than these (lines, characters) shows as a token; a
// token in the input (as a split keeps it); a pasted one's number
const LONG_LINES = 5;
const LONG_CHARS = 500;
const TOKEN  = /(\[(?:Pasted text #\d+[^\]\n]*|Image #\d+)\])/g;
const PASTED = /\[Pasted text #(\d+)[^\]\n]*\]/g;

// a write the terminal shows at once; the screen cleared; the cursor
// hidden, shown
const SYNC_ON  = "\x1b[?2026h";
const SYNC_OFF = "\x1b[?2026l";
const CLEAR    = "\x1b[2J";
const HIDE     = "\x1b[?25l";
const SHOW     = "\x1b[?25h";

// the cursor's look: a block, as terminals draw it, blinking while illi
// waits (scr.blink), else steady (as opencode's: its own default); the
// terminal's own again
const BLINK  = "\x1b[1 q";
const STEADY = "\x1b[2 q";
const PLAIN  = "\x1b[0 q";

// the alternate screen, bracketed paste, the mouse's clicks, wheel and
// every move as SGR reports, kitty's keys at flag 1 (popped before
// pushed: each screen keeps its own flags), the flags asked (a kitty
// terminal answers CSI ? flags u); off, in turn
const MODES_ON  = "\x1b[?1049h\x1b[?2004h\x1b[?1000h\x1b[?1003h\x1b[?1006h\x1b[<u\x1b[>1u\x1b[?u";
const MODES_OFF = "\x1b[<u\x1b[?1006l\x1b[?1003l\x1b[?1000l\x1b[?2004l\x1b[?1049l" + SHOW + PLAIN;

// the background asked; its answer (OSC 11 ; rgb:r/g/b, ended by BEL or
// ST) and one cut by a read's end; how long it is awaited (ms): a bare
// ESC ] then is Alt+]
const ASK      = "\x1b]11;?\x1b\\";
const OSC      = /^\x1b\](\d+);([^\x07\x1b]*)(?:\x07|\x1b\\)/;
const OSC_CUT  = /^\x1b\](?:\d+(?:;[^\x07\x1b]*)?)?\x1b?$/;
const RGB      = /^rgba?:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})/i;
const AWAIT    = 1000;

// a sequence: CSI params [intermediates] final, or SS3 final (kitty's:
// CSI code[:alts] [; mods] u; modifyOtherKeys': CSI 27 ; mods ; code ~;
// the mouse's: CSI < button ; col ; row M, or m as it's let go); CUT: one
// cut by the end of a read (a bare ESC too, where Esc is CSI 27u);
// FLAGS: kitty's answer to the flags asked
const SEQ   = /^\x1b(?:\[([0-9;:?<=>]*)[\x20-\x2f]*|O)([\x40-\x7e])/;
const CUT   = /^\x1b(?:\[[0-9;:?<=>\x20-\x2f]*|O)$/;
const FLAGS = /^\?\d*$/;
const MOUSE = /^<(\d+);(\d+);(\d+)$/;

// a read that is only the pointer moving, no button down (whatever the
// modifiers): nothing for Term.ts to paint
const MOVED = /^(?:\x1b\[<(?:35|39|43|47|51|55|59|63);\d+;\d+M)+$/;

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

// a legacy Alt+[ or Alt+Shift+O, read alone: a sequence's start (CSI,
// SS3) till no more comes for this long (ms)
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
const TWICE = 400;

// Screen
// ======

export function screen_new(on: (key: string) => void): Screen {
  const tty = process.stdin.isTTY === true && process.stdout.isTTY === true;
  const ed  = ed_new();
  const scr: Screen = { tty, kitty: false, ed, rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, grab: null, on };
  if (tty) {
    process.stdin.setRawMode(true);
    process.stdout.write(MODES_ON + ASK);
    process.on("exit", () => scr.left || process.stdout.write(MODES_OFF));
    scr.asked = true;
    setTimeout(() => (scr.asked = false), AWAIT).unref();
    screen_read(scr);
    return scr;
  }
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (data: string) => screen_feed(scr, data)).resume();
  return scr;
}

// a terminal's input (fd), read into one buffer (READ) as it comes, each
// read fed as text (a character cut by a read's end waits for its rest);
// a read cut by a signal (Ctrl+Z), or with nothing ready, tried again;
// till the screen is left or the terminal is gone
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
  if (scr.left) {
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
  if (scr.left || scr.shown.length <= k || scr.shown[k] === x) {
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
  if (scr.left || scr.shown.length <= k) {
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
// pointer only moved
export function screen_feed(scr: Screen, data: string): void {
  data = scr.rest + data;
  const moved = MOVED.test(data);
  let n = 1;
  while (data !== "" && n > 0) {
    n = screen_key(scr, data);
    data = data.slice(n);
  }
  scr.rest = data;
  if (/^\x1b[O[]$/.test(data)) {
    setTimeout(() => screen_alone(scr, data), ALONE).unref?.();
  }
  if (!moved) {
    scr.on("");
  }
}

// a sequence's start left unread (screen_feed) still alone after ALONE:
// a legacy Alt+[ or Alt+Shift+O
function screen_alone(scr: Screen, rest: string): void {
  if (scr.rest === rest) {
    scr.rest = "";
    screen_press(scr, "Alt+" + rest[1]);
    scr.on("");
  }
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
  const osc = OSC.exec(data);
  if (osc !== null) {
    screen_osc(scr, osc[1], osc[2]);
    return osc[0].length;
  }
  if ((scr.asked && OSC_CUT.test(data)) || CUT.test(data) || (scr.kitty && data === "\x1b")) {
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
// WheelDown (turned sideways: nothing); the left button as Press (where: scr.click, how many times
// there: scr.clicks), Drag and Release, the pointer moving with none
// down as Move, the right button as RightPress, RightDrag and
// RightRelease (each where: scr.point); the middle one does nothing
function screen_mouse(scr: Screen, params: string, down: boolean): void {
  const [, b, col, row] = MOUSE.exec(params)!.map(Number);
  const button = b & ~SHIFT;
  const at     = { row: row - 1, col: col - 1 };
  const now    = Date.now();
  if (button & WHEEL) {
    if (!(button & SIDEWAYS)) {
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
    [scr.click, scr.point, scr.pressed] = [at, at, now];
    scr.on("Press");
  } else if (button === 0) {
    scr.point = at;
    scr.on("Release");
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
// (fg), the screen's modes again, and every row written anew
export function screen_suspend(scr: Screen): void {
  process.stdout.write(MODES_OFF);
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
// screen twice puts the cursor back over what was written between
export function screen_leave(scr: Screen): Promise<void> {
  scr.left = true;
  if (scr.tty) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
  return new Promise((done) => process.stdout.write(scr.tty ? MODES_OFF : "", () => done()));
}

// a paste, typed whole
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

// the input's rows in w columns, at most max of them (the cursor's and
// those before it), as many as it holds; its first row after the mark,
// the rest indented as far; a hint when empty, grey when off; and where
// the cursor shows
export function screen_input(scr: Screen, w: number, max: number, hint: string, off: boolean): { lines: Paint.Line[]; at: Spot } {
  const mark = Paint.Run(Theme.GLYPH.input, Paint.DIM);
  const pad  = Paint.Run(" ".repeat(Paint.text_width(Theme.GLYPH.input)));
  const ink  = off ? Paint.DIM : Paint.INK;
  const ed   = scr.ed;
  const mw   = Paint.text_width(Theme.GLYPH.input);
  ed.w = w - mw;
  const { rows, places, at } = ed_layout(ed);
  const spot = places[at];
  const top  = Math.max(0, spot.row - Math.max(1, max) + 1);
  const seen = rows.slice(top, top + Math.max(1, max));
  const text = ed.text === "" ? [[mark, Paint.Run(Paint.text_clean(hint), Paint.DIM)]] : seen.map((x, k) => [top + k === 0 ? mark : pad, ...input_runs(x, ink)]);
  return { lines: text, at: { row: spot.row - top, col: spot.col + mw } };
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
  return { text: "", pos: 0, hist: [], at: 0, draft: "", moved: false, w: 80, pastes: new Map(), n: 0 };
}

// a paste: a long one kept, its token typed; a short one typed
export function ed_paste(ed: Ed, text: string): void {
  if (text.replace(/\n$/, "").split("\n").length <= LONG_LINES && text.length <= LONG_CHARS) {
    return ed_type(ed, text);
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

// the rows' texts, wrapped at ed.w columns (ed_wrap); each place of the
// cursor; the cursor's. Laid out anew only as the text or the width
// changes: a key that moves the cursor, and the paint after any key,
// take the last
function ed_layout(ed: Ed): { rows: string[]; places: Place[]; at: number } {
  if (ed.laid?.text !== ed.text || ed.laid.w !== ed.w) {
    ed.laid = { text: ed.text, w: ed.w, ...ed_wrap(ed.text, ed.w) };
  }
  const { rows, places } = ed.laid;
  return { rows, places, at: places.findIndex((p) => p.pos >= ed.pos) };
}

// a text's rows, wrapped at w columns (a character at a time), and each
// place of the cursor (before each character, and the end); each
// character cleaned and measured once
function ed_wrap(text: string, w: number): { rows: string[]; places: Place[] } {
  const rows = [""];
  const places: Place[] = [];
  const sized = new Map<string, [string, number]>();
  let col = 0;
  let pos = 0;
  for (const g of Paint.text_graphemes(text)) {
    let shown = sized.get(g);
    if (shown === undefined) {
      const x = g === "\n" ? "" : Paint.text_clean(g);
      sized.set(g, (shown = [x, Paint.text_width(x)]));
    }
    const [x, cw] = shown;
    if (g !== "\n" && col + cw > w) {
      rows.push("");
      col = 0;
    }
    places.push({ pos, row: rows.length - 1, col });
    pos += g.length;
    rows[rows.length - 1] += x;
    col += cw;
    if (g === "\n") {
      rows.push("");
      col = 0;
    }
  }
  if (col >= w) {
    rows.push("");
    col = 0;
  }
  places.push({ pos, row: rows.length - 1, col });
  return { rows, places };
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
  return found.sort((a, b) => a.tier - b.tier || used(b.k) - used(a.k) || a.cost - b.cost || a.k - b.k).map(({ k, at }) => ({ k, at }));
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
// whether key is one
export function ed_key(ed: Ed, key: string): boolean {
  const { places, at } = ed_layout(ed);
  const back = places[Math.max(0, at - 1)].pos;
  const next = places[Math.min(places.length - 1, at + 1)].pos;
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
  if (key in move) {
    ed.pos   = move[key];
    ed.moved = true;
    return true;
  }
  if (key in erase) {
    const [a, b] = erase[key];
    ed.text = ed.text.slice(0, a) + ed.text.slice(b);
    ed.pos  = a;
    return true;
  }
  switch (key) {
    case "Shift+Enter":
    case "Ctrl+J": {
      ed_type(ed, "\n");
      return true;
    }
    case "Up":
    case "Down": {
      ed_vert(ed, places, places[at], key === "Up" ? -1 : 1);
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
// before/after
function ed_vert(ed: Ed, places: Place[], at: Place, d: number): void {
  const row = places.filter((p) => p.row === at.row + d);
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
  ed.at   = to;
  ed.text = to === ed.hist.length ? ed.draft : ed.hist[to];
  ed.pos  = ed.text.length;
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
