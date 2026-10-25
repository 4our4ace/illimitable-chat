// Screen's input, fed byte streams as a terminal sends them: any read may
// end anywhere (a reader held up lets the terminal's writes split at any
// byte), and no text typed or pasted may slow a key down; the mouse's
// reports (the wheel's place too), the focus told (a press that only
// focuses the window marked, its loss told). A click on the input puts
// the cursor where it lands: on a character before it, whole; past a
// row's text after it; on the mark at the row's start; under the last
// row at the end; in a chip at its nearer edge; a tall input scrolls
// only as the cursor leaves the rows shown. A paint writes only the rows that changed, those moved as a
// block moved by the terminal. Then the lines Paint lays out: a link
// wider than a line breaks at its edge, its pieces each opening it whole;
// a word of several runs is kept whole; a frame never passes its width;
// each block's lines are marked. A word finds options by name, then by
// a word of what they do, then by its letters. The window's title, written as it
// changes, put back as illi's goes. In a window (Window.ts), frames in
// the input are heard, never typed, however the reads cut them (one
// written between two reads of a key or a paste leaves them whole; one
// cut is awaited however slow); keys reaching a hidden screen, or read
// after one that hid it, are dropped; hidden, the screen writes nothing;
// shown, it says it's up, asks the kitty flags and the background, then
// writes every row, the focus told before it hid no longer held; Ctrl+Z
// goes to the window, leaving writes nothing, and the PTY's end tells
// the window gone.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as Draw from "./Draw.ts";
import * as Paint from "./Paint.ts";
import * as Reply from "./Reply.ts";
import * as Screen from "./Screen.ts";
import * as Theme from "./Theme.ts";
import * as View from "./View.ts";
import { wire_frame } from "../term/Wire.ts";

function fresh(tty: boolean, ed: Screen.Screen["ed"], on: (k: string) => unknown): Screen.Screen {
  return { tty, kitty: false, ed, rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, grab: null, on };
}

// a screen fed by hand: a kitty terminal (it answered the flags asked),
// keys pressed logged
function screen(): { scr: Screen.Screen; keys: string[] } {
  const keys: string[] = [];
  const ed  = Screen.ed_new();
  const scr = fresh(true, ed, (k) => k !== "" && keys.push(k));
  Screen.screen_feed(scr, "\x1b[?1u");
  return { scr, keys };
}

// stream fed in two reads, cut at each place: what was typed, keys pressed
function splits(stream: string, check: (text: string, keys: string[]) => void): void {
  for (let k = 0; k <= stream.length; k++) {
    const { scr, keys } = screen();
    Screen.screen_feed(scr, stream.slice(0, k));
    Screen.screen_feed(scr, stream.slice(k));
    check(scr.ed.text, keys);
  }
}

const BOX = "  ▀▀▀▀▀▀▀▀\r  ╭─ 1x · /close #12345 ───╮\r  │ Done, it works. │\r  │                 │\r  ╰─────────────────╯\r";

test("a paste never sends, whatever its reads", () => {
  splits("\x1b[200~" + BOX + "\x1b[201~", (text, keys) => {
    expect(keys).toEqual([]);
    expect(text).toBe(BOX.replace(/\r/g, "\n"));
  });
});

test("a long paste is one token, erased whole, its text put back as sent; a short one typed", () => {
  const ed   = Screen.ed_new();
  const long = Array.from({ length: 12 }, (_, k) => "line " + k).join("\n");
  Screen.ed_type(ed, "see ");
  Screen.ed_paste(ed, long);
  Screen.ed_paste(ed, " ok");
  Screen.ed_paste(ed, "x".repeat(600));
  expect(ed.text).toBe("see [Pasted text #1 +12 lines] ok[Pasted text #2, 600 chars]");
  const sent = Screen.ed_expand(ed, ed.text);
  expect(sent).toBe('see <pasted n="1">\n' + long + '\n</pasted> ok<pasted n="2">\n' + "x".repeat(600) + "\n</pasted>");
  Screen.ed_key(ed, "Backspace");
  expect(ed.text).toBe("see [Pasted text #1 +12 lines] ok");
  ed.pos = 4;
  Screen.ed_key(ed, "Delete");
  expect(ed.text).toBe("see  ok");
  expect(Screen.ed_expand(ed, "[Pasted text #9 +3 lines]")).toBe("[Pasted text #9 +3 lines]");
});

test("a long paste pasted again while its token is in the input shows whole, in the token's place, the cursor at its end; a third makes a token anew", () => {
  const ed   = Screen.ed_new();
  const long = Array.from({ length: 9 }, (_, k) => "line " + k).join("\n");
  Screen.ed_paste(ed, long + "\n");
  Screen.ed_type(ed, " and ");
  Screen.ed_paste(ed, "x".repeat(600));
  Screen.ed_paste(ed, long);
  expect(ed.text).toBe(long + " and [Pasted text #2, 600 chars]");
  expect(ed.pos).toBe(long.length);
  expect(Screen.ed_expand(ed, ed.text)).toBe(long + ' and <pasted n="2">\n' + "x".repeat(600) + "\n</pasted>");
  Screen.ed_paste(ed, long);
  expect(ed.text).toBe(long + "[Pasted text #3 +9 lines] and [Pasted text #2, 600 chars]");
});

test("a message sent shows each paste whole, as pasted; its history, read again, its token", () => {
  const ed   = Screen.ed_new();
  const long = Array.from({ length: 8 }, (_, k) => "row " + k + (k === 3 ? " [FireAnt]" : "")).join("\n") + "\n";
  Screen.ed_paste(ed, long);
  Screen.ed_type(ed, " fix [Image #4]");
  const sent  = Screen.ed_expand(ed, ed.text);
  const shown = Paint.rows_lines(View.entry_rows(1, "user", sent), 60).map((l) => l.map((r) => r.x).join("").replace(/^\s*│|│\s*$/g, "").trim());
  expect(shown.join("\n")).toContain("row 0\n");
  expect(shown.join("\n")).toContain("row 3 [FireAnt]\n");
  expect(shown.join("\n")).not.toContain("[Pasted text");
  expect(shown).toContain("fix [Image #4]");
  const chips = Paint.rows_lines(View.entry_rows(1, "user", sent), 60).flat().filter((r) => r.s.c === Draw.draw_tokens().accent && !/[│─╭╮╰╯]/.test(r.x)).map((r) => r.x);
  expect(chips).toEqual(["[Image #4]"]);
  const later = Screen.ed_new();
  Screen.ed_history(later, ["hi", sent]);
  expect(later.hist).toEqual(["hi", "[Pasted text #1 +8 lines] fix [Image #4]"]);
  expect(Screen.ed_expand(later, later.hist[1])).toBe(sent);
});

test("an image's token, spaced from the words, named in order", () => {
  const ed = Screen.ed_new();
  Screen.ed_type(ed, "look");
  expect(Screen.ed_image(ed)).toBe(1);
  Screen.ed_type(ed, "and ");
  expect(Screen.ed_image(ed)).toBe(2);
  expect(ed.text).toBe("look [Image #1] and [Image #2] ");
  expect(Screen.ed_images(ed.text + " [Image #1]")).toEqual([1, 2, 1]);
});

// a terminal of h rows, w columns, as far as a paint drives it: the
// cursor put, a line cleared, a column, cells erased, a scroll region and
// its scroll up or down, text (one column a character); all else (inks,
// modes) left out. Its rows as text, their ends' spaces dropped
function tty(writes: string[], h: number, w: number): string[] {
  const rows = Array.from({ length: h }, () => Array<string>(w).fill(" "));
  let [row, col, top, bot] = [0, 0, 0, h - 1];
  const scroll = (n: number) => {
    for (let k = 0; k < Math.abs(n); k++) {
      const blank = Array<string>(w).fill(" ");
      if (n > 0) {
        rows.splice(top, 1);
        rows.splice(bot, 0, blank);
      } else {
        rows.splice(bot, 1);
        rows.splice(top, 0, blank);
      }
    }
  };
  for (const s of writes) {
    for (const m of s.matchAll(/\x1b\[([?0-9;]*)([ -\/]?[@-~])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|([^\x1b])/g)) {
      const [ps, f, ch] = [m[1] ?? "", m[2], m[3]];
      const n = ps.split(";").map((x) => Number(x) || 0);
      if (ch !== undefined) {
        rows[row][col++] = ch;
      } else if (f === "H") {
        [row, col] = [Math.max(1, n[0]) - 1, Math.max(1, n[1] ?? 1) - 1];
      } else if (f === "G") {
        col = Math.max(1, n[0]) - 1;
      } else if (f === "K" && ps === "2") {
        rows[row].fill(" ");
      } else if (f === "X") {
        rows[row].fill(" ", col, col + Math.max(1, n[0]));
      } else if (f === "J" && ps === "2") {
        rows.forEach((r) => r.fill(" "));
      } else if (f === "r") {
        [top, bot, row, col] = [ps === "" ? 0 : n[0] - 1, ps === "" ? h - 1 : n[1] - 1, 0, 0];
      } else if (f === "S" || f === "T") {
        scroll(f === "S" ? Math.max(1, n[0]) : -Math.max(1, n[0]));
      }
    }
  }
  return rows.map((r) => r.join("").trimEnd());
}

test("rows moved as a block are scrolled by the terminal, only those left written; the screen as painted, whichever way", () => {
  const { scr } = screen();
  const out: string[] = [];
  const write = process.stdout.write;
  process.stdout.write = ((s: string) => out.push(s)) as any;
  const lines = Array.from({ length: 30 }, (_, k): Paint.Line => [Paint.Run("line " + k + " of the chat")]);
  const frame = (from: number, box = false) => [
    [{ col: 0, w: 40, line: [Paint.Run("head")] }],
    ...Array.from({ length: 9 }, (_, k) => [{ col: 2, w: 36, line: lines[from + k] }, ...(box && k >= 6 ? [{ col: 4, w: 10, line: [Paint.Run("[box " + k + "]")] }] : [])]),
    [{ col: 2, w: 36, line: [Paint.Run("────")] }],
    [{ col: 2, w: 36, line: [Paint.Run("> typed")] }],
  ];
  const text  = (row: Screen.Piece[]) => {
    const cells = Array<string>(40).fill(" ");
    for (const p of row) {
      [...p.line.map((r) => r.x).join("").slice(0, p.w).trimEnd()].forEach((c, i) => (cells[p.col + i] = c));
    }
    return cells.join("").trimEnd();
  };
  const shown = (rows: Screen.Piece[][]) => tty(out, 12, 40).every((x, k) => x === text(rows[k]));
  const seen: boolean[] = [];
  try {
    for (const [from, box] of [[0, false], [2, false], [3, false], [0, false], [5, true], [7, true], [20, false]] as [number, boolean][]) {
      Screen.screen_paint(scr, frame(from, box), { row: 11, col: 9 });
      seen.push(shown(frame(from, box)));
    }
  } finally {
    process.stdout.write = write;
  }
  expect(seen).toEqual([true, true, true, true, true, true, true]);
  expect(out[1]).toContain("\x1b[2;10r\x1b[2S\x1b[r");
  expect(out[1]).toContain("line 9 ");
  expect(out[1]).not.toContain("line 5 ");
  expect(out[3]).toContain("\x1b[2;10r\x1b[3T\x1b[r");
  expect(out[3]).not.toContain("line 5 ");
  expect(out.at(-1)).not.toMatch(/\x1b\[\d+;\d+r/);
});

test("the terminal's input, read into one buffer, keeps a character cut by a read's end whole; left, it is read no more", async () => {
  const dir  = fs.mkdtempSync(os.tmpdir() + "/illi-read-");
  Bun.spawnSync(["mkfifo", dir + "/in"]);
  const fd   = fs.openSync(dir + "/in", "r+");
  const { scr } = screen();
  const sent = Buffer.from("héllo 𝒜");
  try {
    Screen.screen_read(scr, fd);
    fs.writeSync(fd, sent.subarray(0, 2));
    await Bun.sleep(50);
    expect(scr.ed.text).toBe("h");
    fs.writeSync(fd, sent.subarray(2));
    await Bun.sleep(50);
    expect(scr.ed.text).toBe("héllo 𝒜");
    scr.left = true;
    fs.writeSync(fd, "x");
    await Bun.sleep(50);
    expect(scr.ed.text).toBe("héllo 𝒜");
  } finally {
    fs.closeSync(fd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a paste goes to what takes it, else it is typed", () => {
  const { scr } = screen();
  const got: string[] = [];
  scr.paste = (text) => got.push(text);
  Screen.screen_feed(scr, "\x1b[200~a\r\nb\x1b[201~");
  expect(got).toEqual(["a\nb"]);
  expect(scr.ed.text).toBe("");
});

test("kitty's keys never leak into the text, whatever their reads", () => {
  splits("hello!?\x1b[118;1:3u\x1b[27u\x1b[13;2u", (text, keys) => {
    expect(text).toBe("hello!?\n");
    expect(keys).toEqual(["V", "Esc"]);
  });
});

test("kitty's keypad types its characters; its arrows and the rest of the pad are keys", () => {
  const { scr, keys } = screen();
  Screen.screen_feed(scr, "\x1b[57400u\x1b[57409u\x1b[57399u\x1b[57413u\x1b[57415u\x1b[57410u");
  expect(scr.ed.text).toBe("1.0+=/");
  Screen.screen_feed(scr, "\x1b[57417u\x1b[57420u\x1b[57421u\x1b[57426u\x1b[57400;5u");
  expect(keys).toEqual(["PgUp", "Ctrl+1"]);
  expect(scr.ed.text).toBe("1.0+=");
});

test("the wheel turned sideways scrolls nothing", () => {
  const { scr, keys } = screen();
  Screen.screen_feed(scr, "\x1b[<66;5;5M\x1b[<67;5;5M\x1b[<64;5;5M\x1b[<65;5;5M");
  expect(keys).toEqual(["WheelUp", "WheelDown"]);
});

test("a legacy Alt+[ or Alt+Shift+O, alone, is a key after a moment, never the start of the next", async () => {
  const keys: string[] = [];
  const scr = fresh(true, Screen.ed_new(), (k) => k !== "" && keys.push(k));
  Screen.screen_feed(scr, "\x1b[");
  await Bun.sleep(80);
  Screen.screen_feed(scr, "\x1bO");
  await Bun.sleep(80);
  Screen.screen_feed(scr, "a");
  expect(keys).toEqual(["Alt+[", "Alt+O"]);
  expect(scr.ed.text).toBe("a");
});

test("a bare ESC from a kitty terminal is Esc after a moment, never held till the next key; the rest of a cut sequence come in time, the key it is; one never ended, dropped", async () => {
  const { scr, keys } = screen();
  Screen.screen_feed(scr, "\x1b");
  expect(keys).toEqual([]);
  await Bun.sleep(80);
  expect(keys).toEqual(["Esc"]);
  Screen.screen_feed(scr, "\x1b");
  await Bun.sleep(10);
  Screen.screen_feed(scr, "[27u");
  await Bun.sleep(80);
  expect(keys).toEqual(["Esc", "Esc"]);
  Screen.screen_feed(scr, "\x1b[<35;4");
  await Bun.sleep(1100);
  Screen.screen_feed(scr, "a");
  expect(keys).toEqual(["Esc", "Esc"]);
  expect(scr.ed.text).toBe("a");
});

test("a word move goes over a decomposed letter whole", () => {
  const ed = Screen.ed_new();
  Screen.ed_type(ed, "cafe\u0301 noir");
  ed.pos = 0;
  Screen.ed_key(ed, "Alt+F");
  expect(ed.text.slice(0, ed.pos)).toBe("cafe\u0301");
});

test("the input's cursor and wrap follow the prompt's own width; its hint is cleaned", () => {
  const { scr } = screen();
  const was = Theme.GLYPH.input;
  Theme.GLYPH.input = "❯❯❯ ";
  try {
    Screen.ed_type(scr.ed, "hello");
    expect(Screen.screen_input(scr, 20, 3, "", false).at).toEqual({ row: 0, col: 9 });
    expect(scr.ed.w).toBe(16);
  } finally {
    Theme.GLYPH.input = was;
  }
  const empty = screen();
  const hint  = Screen.screen_input(empty.scr, 40, 3, "go\x1b]52;c;eA==\x07 on", false).lines[0][1].x;
  expect(hint).toBe("go]52;c;eA== on");
});

test("the input laid out line by line: Left and Right cross a line's end, Up and Down keep the column over wrapped rows, a full last row gives the cursor one of its own; an edit lays out its line alone", () => {
  const { scr } = screen();
  const spot = () => Screen.screen_input(scr, 6, 20, "", false).at;
  const col  = Paint.text_width(Theme.GLYPH.input);
  Screen.ed_type(scr.ed, "abcd\n世界ab\nwxyzwxyzw");
  scr.ed.w = 6 - col;
  const w = scr.ed.w;
  expect(w).toBe(4);
  expect(spot()).toEqual({ row: 5, col: col + 1 });
  Screen.ed_key(scr.ed, "Up");
  expect([scr.ed.pos, spot()]).toEqual([15, { row: 4, col: col + 1 }]);
  Screen.ed_key(scr.ed, "Up");
  Screen.ed_key(scr.ed, "Up");
  expect([scr.ed.pos, spot()]).toEqual([8, { row: 2, col: col + 1 }]);
  Screen.ed_key(scr.ed, "Up");
  expect([scr.ed.pos, spot()]).toEqual([5, { row: 1, col }]);
  scr.ed.pos = 5;
  Screen.ed_key(scr.ed, "Left");
  expect([scr.ed.pos, spot()]).toEqual([4, { row: 0, col: col + 4 }]);
  Screen.ed_key(scr.ed, "Right");
  Screen.ed_key(scr.ed, "Right");
  expect(scr.ed.pos).toBe(6);
  scr.ed.pos = scr.ed.text.length;
  Screen.ed_key(scr.ed, "Backspace");
  expect(spot()).toEqual({ row: 5, col });
  Screen.ed_type(scr.ed, "w");
  expect(spot()).toEqual({ row: 5, col: col + 1 });
  const laid = scr.ed.laid!;
  Screen.ed_type(scr.ed, "!");
  spot();
  expect(scr.ed.laid!.lines[0].wrap).toBe(laid.lines[0].wrap);
  expect(scr.ed.laid!.lines[2].wrap).not.toBe(laid.lines[2].wrap);
});

test("a pipe's last line, without a newline, waits in the input for the end", () => {
  const sent: string[] = [];
  const ed  = Screen.ed_new();
  const scr = fresh(false, ed, (k) => k === "Enter" && sent.push(Screen.ed_take(ed)));
  Screen.screen_feed(scr, "one\ntw");
  Screen.screen_feed(scr, "o");
  expect(sent).toEqual(["one"]);
  expect(ed.text).toBe("two");
});

test("Alt and a character outside the BMP is one key, none of it typed", () => {
  const keys: string[] = [];
  const scr  = fresh(true, Screen.ed_new(), (k) => k !== "" && keys.push(k));
  Screen.screen_feed(scr, "\x1b😀a\x1bx");
  expect(keys).toEqual(["Alt+😀", "Alt+X"]);
  expect(scr.ed.text).toBe("a");
});

test("a pasted box in the history keeps each key fast", () => {
  const big = ("  ╭─ 1x · /close #12346 " + "─".repeat(240) + "╮\n  │ │ hi?" + " ".repeat(230) + "│ │\n  " + "▀".repeat(240) + "\n").repeat(100);
  const { scr } = screen();
  scr.ed.hist = ["hi", big];
  scr.ed.at   = 2;
  const t0 = performance.now();
  for (const key of ["Up", "Up", "Up", "Ctrl+Left", "Alt+Backspace", "Up", "Left", "Down", "Down"]) {
    Screen.ed_key(scr.ed, key);
    Screen.screen_input(scr, 120, 40, "", false);
  }
  expect(performance.now() - t0).toBeLessThan(500);
});

test("the input: the mark on its first row alone, the rest indented; as tall as its rows, shrinking as they go", () => {
  const { scr } = screen();
  const rows = () => Screen.screen_input(scr, 80, 10, "hint", false).lines.map((l) => l.map((r) => r.x).join(""));
  Screen.ed_type(scr.ed, "first\nsecond");
  expect(rows()).toEqual(["> first", "  second"]);
  for (let k = 0; k < "\nsecond".length; k++) {
    Screen.ed_key(scr.ed, "Backspace");
  }
  expect(rows()).toEqual(["> first"]);
});

// the input holding text, w wide, max rows at most, the cursor at pos:
// its rows as shown, the first of them, where the cursor shows, and
// where a click at a row and column of what shows puts it (ed_at)
function clicked(text: string, w: number, max = 10, pos = text.length): { rows: string[]; top: number; spot: Screen.Spot; at: (row: number, col: number) => number } {
  const scr = fresh(true, Screen.ed_new(), () => {});
  Screen.ed_set(scr.ed, text);
  scr.ed.pos = pos;
  const { lines, at, top, laid } = Screen.screen_input(scr, w, max, "hint", false);
  return { rows: lines.map((l) => l.map((r) => r.x).join("")), top, spot: at, at: (row, col) => Screen.ed_at(laid, top, row, col) };
}

test("a click on the input: before the character it lands on (a wide one by either half, a letter and its marks whole), after a row's text past it, at a row's start on the mark or the indent", () => {
  const one = clicked("hello world", 20);
  expect([2, 4, 12, 13, 19].map((c) => one.at(0, c))).toEqual([0, 2, 10, 11, 11]);
  expect([0, 1].map((c) => one.at(0, c))).toEqual([0, 0]);
  const lines = clicked("ab\ncdef\n", 20);
  expect(lines.rows).toEqual(["> ab", "  cdef", "  "]);
  expect([lines.at(0, 9), lines.at(1, 0), lines.at(1, 1), lines.at(1, 3), lines.at(1, 9), lines.at(2, 5)]).toEqual([2, 3, 3, 4, 7, 8]);
  const wide = clicked("a世😀b", 20);
  expect([3, 4, 5, 6, 7, 8].map((c) => wide.at(0, c))).toEqual([1, 1, 2, 2, 4, 5]);
  const marked = clicked("café x", 20);
  expect([5, 6, 7].map((c) => marked.at(0, c))).toEqual([3, 5, 6]);
});

test("a click past a wrapped row's text puts the cursor after its last character (shown where the next row starts), where typing lands right after it; a row a wide character left short too", () => {
  const wrap = clicked("abcdefgh\nxy", 6);
  expect(wrap.rows).toEqual(["> abcd", "  efgh", "  xy"]);
  expect([wrap.at(0, 5), wrap.at(0, 6), wrap.at(0, 7), wrap.at(1, 2), wrap.at(1, 6), wrap.at(2, 3)]).toEqual([3, 4, 4, 4, 8, 10]);
  expect(clicked("abcdefgh\nxy", 6, 10, 4).spot).toEqual({ row: 1, col: 2 });
  const short = clicked("abc世d", 6);
  expect(short.rows).toEqual(["> abc", "  世d"]);
  expect([short.at(0, 5), short.at(1, 2), short.at(1, 3), short.at(1, 4), short.at(1, 5)]).toEqual([3, 3, 3, 4, 5]);
  const typed = Screen.ed_new();
  Screen.ed_set(typed, "abc世d");
  typed.pos = short.at(0, 5);
  Screen.ed_type(typed, "x");
  expect(clicked(typed.text, 6).rows).toEqual(["> abcx", "  世d"]);
  const full = clicked("abcd", 6);
  expect(full.rows).toEqual(["> abcd", "  "]);
  expect([full.at(0, 6), full.at(1, 4)]).toEqual([4, 4]);
});

test("a click on an input scrolled to its cursor lands on the row shown there; past the text's last row, at its end (past the rows shown, on one laid out under them: that one); before its first, at its start; on an empty input's hint, at 0", () => {
  const text = Array.from({ length: 10 }, (_, k) => "line " + k).join("\n");
  const end  = clicked(text, 20, 3);
  expect([end.top, end.rows]).toEqual([7, ["  line 7", "  line 8", "  line 9"]]);
  expect([end.at(0, 2), end.at(1, 4), end.at(3, 4), end.at(5, 0)]).toEqual([49, 58, text.length, text.length]);
  const start = clicked(text, 20, 3, 0);
  expect([start.top, start.rows]).toEqual([0, ["> line 0", "  line 1", "  line 2"]]);
  expect([start.at(3, 4), start.at(-1, 4)]).toEqual([23, 0]);
  const empty = clicked("", 20);
  expect(empty.rows).toEqual(["> hint"]);
  expect([empty.at(0, 4), empty.at(1, 0)]).toEqual([0, 0]);
});

test("a click inside a chip (an image's, a paste's) puts the cursor at its nearer edge, never inside it; a chip wrapped over rows too", () => {
  const chips = clicked("see [Image #1] and [Pasted text #2 +12 lines] ok", 80);
  expect([6, 7, 10, 11, 15, 16].map((c) => chips.at(0, c))).toEqual([4, 4, 4, 14, 14, 14]);
  expect([24, 33, 34, 47].map((c) => chips.at(0, c))).toEqual([19, 19, 45, 45]);
  const wrapped = clicked("ab [Pasted text #2 +12 lines]", 12);
  expect(wrapped.rows).toEqual(["> ab [Pasted", "   text #2 +", "  12 lines]"]);
  expect([wrapped.at(0, 4), wrapped.at(0, 12), wrapped.at(1, 10), wrapped.at(2, 11)]).toEqual([2, 3, 29, 29]);
});

test("a click on the input follows the prompt's own width", () => {
  const was = Theme.GLYPH.input;
  Theme.GLYPH.input = "❯❯❯ ";
  try {
    const wide = clicked("hello", 20);
    expect([0, 3, 4, 5, 12].map((c) => wide.at(0, c))).toEqual([0, 0, 0, 1, 5]);
  } finally {
    Theme.GLYPH.input = was;
  }
});

test("an input taller than it shows scrolls only as the cursor leaves the rows shown (so a click leaves them in place), and back as rows go, as many shown as fit", () => {
  const { scr } = screen();
  const top = () => Screen.screen_input(scr, 20, 3, "", false).top;
  Screen.ed_set(scr.ed, Array.from({ length: 10 }, (_, k) => "line " + k).join("\n"));
  expect(top()).toBe(7);
  const tops: number[] = [];
  for (const key of ["Up", "Up", "Up", "Down", "Down", "Down"]) {
    Screen.ed_key(scr.ed, key);
    tops.push(top());
  }
  expect(tops).toEqual([7, 7, 6, 6, 6, 7]);
  const { laid } = Screen.screen_input(scr, 20, 3, "", false);
  scr.ed.pos = Screen.ed_at(laid, 7, 0, 4);
  expect([scr.ed.pos, top()]).toEqual([51, 7]);
  Screen.ed_key(scr.ed, "Ctrl+E");
  for (let k = 0; k < "\nline 8\nline 9".length; k++) {
    Screen.ed_key(scr.ed, "Backspace");
  }
  expect(top()).toBe(5);
});

test("the mouse: the wheel, the left button pressed, dragged, let go, the pointer moved, the right button the same, the middle one nothing; never typed, whatever the reads", () => {
  splits("\x1b[<64;10;5M\x1b[<65;10;5M\x1b[<0;12;7M\x1b[<32;13;7M\x1b[<0;13;7m\x1b[<35;20;3M\x1b[<2;1;1M\x1b[<34;2;1M\x1b[<2;2;1m\x1b[<1;1;1M", (text, keys) => {
    expect(keys).toEqual(["WheelUp", "WheelDown", "Press", "Drag", "Release", "Move", "RightPress", "RightDrag", "RightRelease"]);
    expect(text).toBe("");
  });
  const { scr } = screen();
  Screen.screen_feed(scr, "\x1b[<0;12;7M");
  expect(scr.click).toEqual({ row: 6, col: 11 });
  Screen.screen_feed(scr, "\x1b[<32;15;8M");
  expect([scr.click, scr.point]).toEqual([{ row: 6, col: 11 }, { row: 7, col: 14 }]);
  Screen.screen_feed(scr, "\x1b[<65;30;4M");
  expect(scr.point).toEqual({ row: 3, col: 29 });
});

test("the focus gained and lost, whatever the reads, is never typed, nothing to paint: gained no key, lost told (Away); a press while it's lost, or within 150 ms of its coming back, only focuses the window", () => {
  splits("a\x1b[Ib\x1b[O", (text, keys) => {
    expect([text, keys]).toEqual(["ab", ["Away"]]);
  });
  const seen: string[] = [];
  const scr = fresh(true, Screen.ed_new(), (k) => seen.push(k));
  Screen.screen_feed(scr, "\x1b[O");
  Screen.screen_feed(scr, "\x1b[I\x1b[O");
  expect([seen, scr.typed]).toEqual([["Away", "Away"], false]);
  const press = (col: number) => {
    Screen.screen_feed(scr, "\x1b[<0;" + col + ";5M");
    Screen.screen_feed(scr, "\x1b[<0;" + col + ";5m");
    return scr.focusing;
  };
  const lost = press(5);
  Screen.screen_feed(scr, "\x1b[I");
  const soon = press(6);
  scr.gained! -= 200;
  expect([lost, soon, press(7)]).toEqual([true, true, false]);
});

test("a press again in the same place soon is a double click, then a triple; elsewhere, one", () => {
  const { scr } = screen();
  const counts = ["\x1b[<0;5;5M\x1b[<0;5;5m", "\x1b[<0;5;5M\x1b[<0;5;5m", "\x1b[<0;5;5M", "\x1b[<0;9;5M"].map((x) => (Screen.screen_feed(scr, x), scr.clicks));
  expect(counts).toEqual([1, 2, 3, 1]);
});

test("the pointer only moving tells nothing to paint; typing is told", () => {
  const seen: string[] = [];
  const scr = fresh(true, Screen.ed_new(), (k) => seen.push(k));
  Screen.screen_feed(scr, "\x1b[<35;20;3M\x1b[<43;21;3M");
  expect(seen).toEqual(["Move", "Move"]);
  expect(scr.typed).toBe(false);
  Screen.screen_feed(scr, "a");
  expect(seen.slice(2)).toEqual([""]);
  expect(scr.typed).toBe(true);
});

test("the terminal's background, told whatever the reads, is never typed", () => {
  const answer = "\x1b]11;rgb:1e1e/1e1e/2e2e\x1b\\";
  for (let k = 0; k <= answer.length + 2; k++) {
    const { scr, keys } = screen();
    scr.asked = true;
    const stream = "a" + answer + "b";
    Screen.screen_feed(scr, stream.slice(0, k));
    Screen.screen_feed(scr, stream.slice(k));
    expect(scr.ed.text).toBe("ab");
    expect(keys).toEqual(["Canvas"]);
    expect(scr.canvas).toBe("#1e1e2e");
  }
  const { scr } = screen();
  Screen.screen_feed(scr, "\x1b]11;rgb:ff/80/00\x07");
  expect(scr.canvas).toBe("#ff8000");
});

test("a list open takes keys first; PgUp and PgDn are keys", () => {
  const { scr, keys } = screen();
  scr.grab = (k) => k === "Up";
  Screen.screen_feed(scr, "ab\x1b[A\x1b[5~\x1b[6~\x1b[1;5H");
  expect(keys).toEqual(["PgUp", "PgDn", "Ctrl+Home"]);
  expect(scr.ed.text).toBe("ab");
});

test("a word matches the name it is first, then those it starts, in their order, then those it is in, then those with its characters in turn", () => {
  const names = ["goal", "image", "model", "mcp", "agent", "agents", "effort", "Memo"];
  const rank  = (word: string) => Screen.ed_rank(word, names).map((m) => names[m.k]);
  expect(rank("")).toEqual(names);
  expect(rank("m")).toEqual(["model", "mcp", "Memo", "image"]);
  expect(rank("ag")).toEqual(["agent", "agents", "image"]);
  expect(rank("mdl")).toEqual(["model"]);
  expect(rank("ME")).toEqual(["Memo", "image", "model"]);
  expect(rank("xyz")).toEqual([]);
  expect(Screen.ed_rank("mod", ["model", "mod"]).map((m) => m.k)).toEqual([1, 0]);
  expect(Screen.ed_rank("ent", names).map((m) => m.at)).toEqual([[2, 3, 4], [2, 3, 4]]);
  expect(Screen.ed_rank("mdl", names)[0].at).toEqual([0, 2, 4]);
});

test("in a word, at a word's start first; characters in turn, the closest together first; the most used first among alike", () => {
  const names = ["/profile  switch to that profile (its own chat, settings, agents and MCP servers)", "/i-have-adhd  skill: short steps"];
  expect(Screen.ed_rank("ihave", names).map((m) => m.k)).toEqual([1, 0]);
  expect(Screen.ed_rank("ihave", names)[0].at).toEqual([1, 3, 4, 5, 6]);
  expect(Screen.ed_rank("s", ["opus", "gpt-sol"]).map((m) => m.k)).toEqual([1, 0]);
  const used = [0, 9];
  expect(Screen.ed_rank("set", ["set", "settings"], (k) => used[k]).map((m) => m.k)).toEqual([1, 0]);
  expect(Screen.ed_rank("set", ["set", "settings"]).map((m) => m.k)).toEqual([0, 1]);
  expect(Screen.ed_rank("set", ["reset", "settings"], (k) => [9, 0][k]).map((m) => m.k)).toEqual([1, 0]);
});

test("a lone /word is a command typed, one mid-message that the cursor ends a skill's name; one sent before, brought back by Up, is none till edited", () => {
  const ed = Screen.ed_new();
  Screen.ed_history(ed, ["/help"]);
  Screen.ed_type(ed, "/he");
  expect(Screen.ed_slash(ed)).toEqual({ word: "/he", from: 0 });
  Screen.ed_type(ed, "lp me");
  expect(Screen.ed_slash(ed)).toBe(null);
  Screen.ed_set(ed, "");
  Screen.ed_key(ed, "Up");
  expect([ed.text, Screen.ed_slash(ed)]).toEqual(["/help", null]);
  Screen.ed_key(ed, "Backspace");
  expect(Screen.ed_slash(ed)).toEqual({ word: "/hel", from: 0 });
  Screen.ed_set(ed, "say /help");
  expect(Screen.ed_slash(ed)).toEqual({ word: "/help", from: 4 });
  Screen.ed_set(ed, "use /ima now");
  ed.pos = 8;
  expect(Screen.ed_slash(ed)).toEqual({ word: "/ima", from: 4 });
  ed.pos = 7;
  expect(Screen.ed_slash(ed)).toBe(null);
  for (const text of ["see /usr/bin", "and/or", "a / b"]) {
    Screen.ed_set(ed, text);
    expect(Screen.ed_slash(ed)).toBe(null);
  }
});

test("a paint writes only the rows that changed", () => {
  const { scr } = screen();
  const out: string[] = [];
  const write = process.stdout.write;
  process.stdout.write = ((s: string) => out.push(s)) as any;
  const row = (x: string): Screen.Piece[] => [{ col: 2, w: 20, line: [Paint.Run(x)] }];
  try {
    Screen.screen_paint(scr, [row("one"), row("two"), row("three")], { row: 2, col: 4 });
    Screen.screen_paint(scr, [row("one"), row("TWO"), row("three")], { row: 2, col: 4 });
  } finally {
    process.stdout.write = write;
  }
  expect(out[0]).toContain("\x1b[2J");
  expect(out[0]).toContain("three");
  expect(out[1]).not.toContain("\x1b[2J");
  expect(out[1]).toContain("\x1b[2;1H\x1b[2K\x1b[3G");
  expect(out[1]).toContain("TWO");
  expect(out[1]).not.toContain("one");
  expect(out[1]).not.toContain("three");
  expect(out[1]).toContain("\x1b[3;5H");
});

test("a paint with nothing changed writes nothing; the cursor moved, its look changed or hidden, the cursor alone", () => {
  const { scr } = screen();
  const out: string[] = [];
  const write = process.stdout.write;
  process.stdout.write = ((s: string) => out.push(s)) as any;
  const rows = () => [[{ col: 2, w: 20, line: [Paint.Run("one")] }], [{ col: 2, w: 20, line: [Paint.Run("two")] }]];
  try {
    Screen.screen_paint(scr, rows(), { row: 1, col: 4 });
    Screen.screen_paint(scr, rows(), { row: 1, col: 4 });
    expect(out).toHaveLength(1);
    Screen.screen_paint(scr, rows(), { row: 1, col: 5 });
    scr.blink = true;
    Screen.screen_paint(scr, rows(), { row: 1, col: 5 });
    Screen.screen_paint(scr, rows(), null);
    Screen.screen_paint(scr, rows(), null);
  } finally {
    process.stdout.write = write;
  }
  expect(out).toHaveLength(4);
  expect(out.slice(1).some((s) => s.includes("one") || s.includes("two"))).toBe(false);
  expect(out[1]).toContain("\x1b[2;6H");
  expect(out[2]).toContain("\x1b[1 q");
  expect(out[3]).not.toContain("\x1b[?25h");
});

test("a row is written again as its text or ink change, cut at another width, or once its cells were written alone", () => {
  const { scr } = screen();
  const out: string[] = [];
  const write = process.stdout.write;
  process.stdout.write = ((s: string) => out.push(s)) as any;
  const line = [Paint.Run("one"), Paint.Run(" two", Paint.DIM)];
  const rows = (l: Paint.Line, w = 20) => [[{ col: 2, w, line: l }], [{ col: 2, w: 20, line: [Paint.Run("rest")] }]];
  const at = { row: 1, col: 4 };
  try {
    Screen.screen_paint(scr, rows(line), at);
    Screen.screen_paint(scr, rows([Paint.Run("one"), Paint.Run(" two", Paint.DIM)]), at);
    Screen.screen_paint(scr, rows([Paint.Run("one"), Paint.Run(" two", { ...Paint.DIM, c: "4" })]), at);
    Screen.screen_paint(scr, rows([Paint.Run("one"), Paint.Run(" too", { ...Paint.DIM, c: "4" })]), at);
    Screen.screen_paint(scr, rows(line), at);
    Screen.screen_paint(scr, rows(line, 5), at);
    Screen.screen_cells(scr, 1, [{ col: 2, w: 1, line: [Paint.Run("R")] }], at);
    Screen.screen_paint(scr, rows(line, 5), at);
  } finally {
    process.stdout.write = write;
  }
  const plain = out.map((s) => s.replace(/\x1b\[[0-9;]*m/g, ""));
  expect(plain).toHaveLength(7);
  expect(plain[1]).toContain("one two");
  expect(plain[2]).toContain("one too");
  expect(plain[3]).toContain("one two");
  expect(plain[4]).toContain("one t\x1b");
  expect(plain[6]).toContain("rest");
  expect(plain.slice(1, 6).some((s) => s.includes("rest"))).toBe(false);
});

test("words: Ctrl+W, Alt+B, Alt+F", () => {
  const { scr } = screen();
  const ed = scr.ed;
  Object.assign(ed, { text: "olá mundo 𝒜b  ", pos: 15 });
  Screen.ed_key(ed, "Ctrl+W");
  expect(ed.text).toBe("olá mundo ");
  Screen.ed_key(ed, "Alt+B");
  expect(ed.pos).toBe(4);
  Screen.ed_key(ed, "Alt+F");
  expect(ed.pos).toBe(9);
});

test("a link wider than a line breaks at its edge, never past it; each piece opens it whole", () => {
  const url   = "https://x.co/" + "x".repeat(99);
  const lines = Paint.runs_wrap([Paint.Run("Pay: "), Paint.Run(url, { ...Paint.INK, u: true, k: url })], 76, false);
  expect(lines.map((l) => l.map((r) => r.x).join(""))).toEqual([("Pay: " + url).slice(0, 76), ("Pay: " + url).slice(76)]);
  expect(lines.flat().filter((r) => r.x !== "Pay: ").every((r) => r.s.k === url)).toBe(true);
  const rows = Paint.rows_lines(View.entry_rows(1, "user", "See https://example.com/" + "a".repeat(60) + " now"), 40);
  expect(rows.every((l) => Paint.line_width(l) <= 40)).toBe(true);
});

test("a word of several runs (code, bold) is kept whole at a wrap", () => {
  const text = (lines: Paint.Line[]) => lines.map((l) => l.map((r) => r.x).join("").trimEnd());
  expect(text(Reply.reply_lines("I changed `src/ai/ChatGPT.ts`, `Login.test.ts` and `Term.ts`.", 27))).toEqual(["I changed", "src/ai/ChatGPT.ts,", "Login.test.ts and Term.ts."]);
  expect(text(Reply.reply_lines("a **bold**ness", 8))).toEqual(["a", "boldness"]);
  expect(text(Paint.runs_wrap([Paint.Run("a xxxxxxxxxxxxxxxxx yy")], 8, false))).toEqual(["a xxxxxx", "xxxxxxxx", "xxx yy"]);
});

test("a code block's label is cleaned and cut at the width, a reply's and a call's", () => {
  const reply = Reply.reply_lines("```ab\x1b]52;c;eA==\x07" + "x".repeat(40) + "\ncode\n```", 20);
  const call  = Paint.rows_lines(View.entry_rows(1, "tool", 'run {"\\u001b]52;c;eA==\\u0007' + "k".repeat(40) + '": "a b c d e f g h i j k l m n o p q r s t u v w x y z a b c", "b": 1}'), 20);
  for (const lines of [reply, call]) {
    expect(lines.flat().some((r) => /[\x00-\x1f]/.test(r.x))).toBe(false);
    expect(Math.max(...lines.map(Paint.line_width))).toBeLessThanOrEqual(20);
  }
});

test("a frame never passes its width, however long its title", () => {
  const diff = "--- a/" + "dir/".repeat(30) + "f.ts\n+++ b/" + "dir/".repeat(30) + "f.ts\n@@ -1,1 +1,1 @@\n-x\n+y";
  const rows = View.entry_rows(1, "echo", diff);
  expect(Paint.rows_lines(rows, 60).map((l) => Paint.text_width(l.map((r) => r.x).join("")))).toEqual([60, 60, 60, 60]);
});

test("a fill, the background untold, is a dim bar; told, a shade of it, never the palette's gray", () => {
  const sum  = (w: number) => Paint.rows_lines([{ $: "Sum", id: 7, n: 2, text: "read the logs", call: null, kind: null }], w);
  const bare = sum(60);
  expect(bare.map((l) => l.map((r) => r.x).join("").trimEnd())).toEqual(["▎ 2x     read the logs  /open #7+2"]);
  expect(bare.flat().every((r) => r.s.g === "")).toBe(true);
  Paint.paint_canvas("#0d1117");
  const lit = sum(61);
  expect(new Set(lit.flat().map((r) => r.s.g).filter((g) => g !== ""))).toEqual(new Set(["#20242a"]));
  expect(lit[0].map((r) => r.x).join("")).toMatch(/^▄+$/);
  expect(lit.flat().some((r) => r.s.c === "0" || r.s.g === "7")).toBe(false);
});

test("each block's lines are marked: a summary's all, an open one's whole frame, a gap in it the block's above", () => {
  const sum = (id: number, n: number): View.Row => ({ $: "Sum", id, n, text: "a summary", call: null, kind: null });
  const box: View.Row = { $: "Box", id: 4, n: 4, rows: [sum(4, 2), sum(6, 2)] };
  const marks: Paint.Mark[] = [];
  const lines = Paint.rows_lines([sum(0, 4), box], 60, marks, 1);
  const at = (m: Paint.Mark) => lines[m.from - 1].map((r) => r.x).join("");
  expect(marks.map((m) => [m.id, m.n, m.open, m.to - m.from])).toEqual([[0, 4, false, 3], [4, 4, true, 9], [4, 2, false, 4], [6, 2, false, 3]]);
  expect(at(marks[0])).toMatch(/^▄+$/);
  expect(at(marks[1])).toContain("/close #4+4");
  expect(lines[marks[2].from].map((r) => r.x).join("")).toContain("/open #4+2");
});

test("a recap's line spans the width, its name in the middle; a click on it toggles it, its text under a bar once open", () => {
  const msg = View.entry_rows(7, "recap", "## Objective")[0];
  for (const open of [false, true]) {
    const marks: Paint.Mark[] = [];
    const lines = Paint.rows_lines([{ $: "Rule", id: 7, text: "Compaction", open, rows: [msg] }], 40, marks);
    const head = lines[0].map((r) => r.x).join("");
    const mid  = " " + (open ? Theme.GLYPH.open : Theme.GLYPH.shut) + " Compaction ";
    const fill = 40 - Paint.text_width(mid);
    expect([Paint.text_width(head), head]).toEqual([40, "─".repeat(fill >> 1) + mid + "─".repeat(fill - (fill >> 1))]);
    expect(marks[0]).toMatchObject({ id: 7, act: true, open });
    expect(lines.length > 1).toBe(open);
  }
});

test("a line cut at columns: a wide character either cuts taken whole, a button's runs still copying", () => {
  const copy = () => "x";
  const line: Paint.Line = [Paint.Run("ab"), Paint.Run("界c"), { ...Paint.Run("[ ⧉ go ]"), copy }];
  const text = (l: Paint.Line) => l.map((r) => r.x).join("");
  expect(Paint.line_cut(line, 1, 4).map(text)).toEqual(["a", "b界", "c[ ⧉ go ]"]);
  expect(Paint.line_cut(line, 3, 3).map(text)).toEqual(["ab", "界", "c[ ⧉ go ]"]);
  expect(Paint.line_cut(line, 0, Infinity).map(text)).toEqual(["", "ab界c[ ⧉ go ]", ""]);
  const lit = Paint.line_mark(line, 5, 13, (s) => ({ ...s, v: true }));
  expect(text(lit)).toBe(text(line));
  expect(lit.filter((r) => r.s.v).map((r) => r.x)).toEqual(["[ ⧉ go ]"]);
  expect(lit.find((r) => r.s.v)?.copy).toBe(copy);
});

test("the window's title is written only as it changes, cleaned, and again after a wipe; taken off, the one before comes back, only if illi wrote one", () => {
  const out: string[] = [];
  const write = process.stdout.write;
  process.stdout.write = ((s: string) => out.push(s)) as any;
  try {
    const scr = fresh(true, Screen.ed_new(), () => {});
    Screen.screen_title(scr, null);
    Screen.screen_title(scr, "∞ illi · a\x1b]0;b\x07");
    Screen.screen_title(scr, "∞ illi · a\x1b]0;b\x07");
    Screen.screen_wipe(scr);
    Screen.screen_title(scr, "∞ illi · a\x1b]0;b\x07");
    Screen.screen_title(scr, null);
    Screen.screen_title(scr, null);
    Screen.screen_title(fresh(false, Screen.ed_new(), () => {}), "∞ illi · a");
  } finally {
    process.stdout.write = write;
  }
  expect(out).toEqual(["\x1b]0;∞ illi · a]0;b\x07", "\x1b]0;∞ illi · a]0;b\x07", "\x1b]0;\x07\x1b[23;0t\x1b[22;0t"]);
});

test("a word finds options by name first, then (from three letters) by a word of what they do it starts, in any script, then by its letters in turn", () => {
  const names = ["clear", "login", "background", "mode", "news"];
  const hays  = ["start a new topic", "renews it", "what a shell call left going", "what runs without asking", undefined];
  const found = (word: string) => Screen.ed_find(word, names, hays).map((m) => names[m.k] + (m.hay ? " (hay " + m.at.join(",") + ")" : ""));
  expect(found("new")).toEqual(["news", "clear (hay 8,9,10)"]);
  expect(found("run")).toEqual(["mode (hay 5,6,7)", "background"]);
  expect(found("ne")).toEqual(["news"]);
  expect(Screen.ed_find("при", ["a", "b"], ["запустить", "привет мир"]).map((m) => m.k)).toEqual([1]);
  expect(Screen.ed_find("a.b", ["x"], ["a.b c"]).map((m) => m.hay)).toEqual([true]);
  expect(Screen.ed_find("x(", ["x"], ["y"]).map((m) => m.k)).toEqual([]);
});

// a screen in a window: what it heard from the window, what its end of
// it was told (up asked, Ctrl+Z, lost), keys pressed
const NONCE = "0123456789abcdef0123456789abcdef";
function windowed(kitty = true): { scr: Screen.Screen; heard: object[]; told: string[]; keys: string[] } {
  const keys: string[] = [];
  const scr = fresh(true, Screen.ed_new(), (k) => k !== "" && keys.push(k));
  Screen.screen_feed(scr, kitty ? "\x1b[?1u" : "");
  const heard: object[] = [];
  const told: string[] = [];
  scr.win = { nonce: NONCE, hidden: false, heard: (msg) => heard.push(msg), up: () => (told.push("up"), "<up>"), suspend: () => told.push("suspend"), lost: () => told.push("lost") };
  return { scr, heard, told, keys };
}

// what a call wrote to the terminal
function written(run: () => void): string {
  const out: string[] = [];
  const write = process.stdout.write;
  process.stdout.write = ((s: string) => out.push(s)) as any;
  try {
    run();
  } finally {
    process.stdout.write = write;
  }
  return out.join("");
}

test("in a window, the window's frames are heard, never typed or pressed (no Alt+_), however the reads cut them; a paste's too", () => {
  const show = wire_frame({ $: "show", switch: true }, NONCE);
  const stream = "a" + show + "b\x1b[200~x" + wire_frame({ $: "end" }, NONCE) + "y\x1b[201~c";
  for (const kitty of [true, false]) {
    for (let k = 0; k <= stream.length; k++) {
      const { scr, heard, keys } = windowed(kitty);
      Screen.screen_feed(scr, stream.slice(0, k));
      Screen.screen_feed(scr, stream.slice(k));
      expect([heard, keys, scr.ed.text]).toEqual([[{ $: "show", switch: true }, { $: "end" }], [], "abxyc"]);
    }
  }
  const { scr, heard } = windowed();
  Screen.screen_feed(scr, wire_frame({ $: "end" }, "f".repeat(32)));
  expect(heard).toEqual([]);
});

test("in a window, a frame the window wrote between two reads of a key or a paste's end is heard, the key and the paste kept whole", () => {
  const roster = wire_frame({ $: "roster", open: [] }, NONCE);
  const { scr, heard, keys } = windowed();
  Screen.screen_feed(scr, "x\x1b[200~pasted\x1b[20");
  Screen.screen_feed(scr, roster + "1~z\x1b[5");
  Screen.screen_feed(scr, roster + "~");
  expect([heard.length, scr.ed.text, keys]).toEqual([2, "xpastedz", ["PgUp"]]);
});

test("in a window, a frame cut by a read is awaited however slow its rest (the screen held up), never typed", async () => {
  const show = wire_frame({ $: "show" }, NONCE);
  const { scr, heard } = windowed();
  Screen.screen_feed(scr, show.slice(0, 50));
  await Bun.sleep(1100);
  Screen.screen_feed(scr, show.slice(50));
  expect([heard, scr.ed.text]).toEqual([[{ $: "show" }], ""]);
});

test("in a window, keys read after one that hides the screen (a switch typed ahead) are dropped, never typed or pressed", () => {
  const { scr, keys } = windowed();
  scr.on = (k) => (k === "Enter" ? Screen.screen_hide(scr) : k !== "" && keys.push(k));
  Screen.screen_feed(scr, "/profile work\rhello\r\x03");
  expect([scr.ed.text, keys, scr.rest]).toEqual(["/profile work", [], ""]);
});

test("in a window, keys reaching a hidden screen (sent as it hid) are dropped, never typed or pressed, a lone Esc left too; frames still heard", async () => {
  const { scr, heard, keys } = windowed();
  Screen.screen_hide(scr);
  Screen.screen_feed(scr, "hello\r\x03\x1b[200~p\x1b[201~\x1b");
  await Bun.sleep(80);
  Screen.screen_feed(scr, wire_frame({ $: "show" }, NONCE));
  expect([heard, keys, scr.ed.text]).toEqual([[{ $: "show" }], [], ""]);
  scr.hidden = false;
  Screen.screen_feed(scr, "k");
  expect(scr.ed.text).toBe("k");
});

test("in a window, a hidden screen writes nothing; shown, it says it's up, asks the kitty flags and the background, then writes every row", () => {
  const { scr, told } = windowed();
  const rows = [[{ col: 0, w: 10, line: [Paint.Run("hello")] }]];
  written(() => Screen.screen_paint(scr, rows, null));
  Screen.screen_hide(scr);
  expect(written(() => {
    Screen.screen_paint(scr, rows, null);
    Screen.screen_row(scr, 0, rows[0], null);
    Screen.screen_title(scr, "∞ illi");
  })).toBe("");
  scr.on = () => Screen.screen_paint(scr, rows, null);
  const out = written(() => Screen.screen_show(scr));
  expect(out.startsWith("<up>\x1b[?u\x1b]11;?\x1b\\")).toBe(true);
  expect(out).toContain("\x1b[2J");
  expect(out).toContain("hello");
  expect([told, scr.hidden, scr.asked]).toEqual([["up"], false, true]);
});

test("in a window, the focus lost before the screen hid is stale once it's shown again (no report reached it hidden): a press then is a click", () => {
  const { scr } = windowed();
  Screen.screen_feed(scr, "\x1b[O");
  Screen.screen_hide(scr);
  Screen.screen_feed(scr, "\x1b[I");
  written(() => Screen.screen_show(scr));
  Screen.screen_feed(scr, "\x1b[<0;5;5M");
  expect(scr.focusing).toBe(false);
  Screen.screen_feed(scr, "\x1b[<0;5;5m\x1b[O\x1b[<0;6;5M");
  expect(scr.focusing).toBe(true);
});

test("in a window, Ctrl+Z goes to the window; leaving writes nothing; the PTY's end tells the window gone", async () => {
  const { scr, told } = windowed();
  expect(written(() => Screen.screen_suspend(scr))).toBe("");
  expect(told).toEqual(["suspend"]);
  const fd = fs.openSync("/dev/null", "r");
  try {
    Screen.screen_read(scr, fd);
    for (let k = 0; k < 50 && !told.includes("lost"); k++) {
      await Bun.sleep(10);
    }
    expect(told).toEqual(["suspend", "lost"]);
  } finally {
    fs.closeSync(fd);
  }
  let left = "";
  const pause = process.stdin.pause;
  process.stdin.pause = (() => process.stdin) as any;
  try {
    left = written(() => void Screen.screen_leave(scr));
  } finally {
    process.stdin.pause = pause;
  }
  expect([left, scr.left]).toEqual(["", true]);
});
