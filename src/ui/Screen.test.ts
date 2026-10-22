// Screen's input, fed byte streams as a terminal sends them: any read may
// end anywhere (a reader held up lets the terminal's writes split at any
// byte), and no text typed or pasted may slow a key down; the mouse's
// reports. A paint writes only the rows that changed, those moved as a
// block moved by the terminal. Then the lines Paint lays out: a link
// wider than a line breaks at its edge, its pieces each opening it whole;
// a word of several runs is kept whole; a frame never passes its width;
// each block's lines are marked.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as Paint from "./Paint.ts";
import * as Reply from "./Reply.ts";
import * as Screen from "./Screen.ts";
import * as Theme from "./Theme.ts";
import * as View from "./View.ts";

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
  const chips = Paint.rows_lines(View.entry_rows(1, "user", sent), 60).flat().filter((r) => r.s.c === "6").map((r) => r.x);
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

test("each block's lines are marked: a summary's all, an open one's top edge", () => {
  const sum = (id: number, n: number): View.Row => ({ $: "Sum", id, n, text: "a summary", call: null, kind: null });
  const box: View.Row = { $: "Box", id: 4, n: 4, text: "", rows: [sum(4, 2), sum(6, 2)] };
  const marks: Paint.Mark[] = [];
  const lines = Paint.rows_lines([sum(0, 4), box], 60, marks, 1);
  const at = (m: Paint.Mark) => lines[m.from - 1].map((r) => r.x).join("");
  expect(marks.map((m) => [m.id, m.n, m.open, m.to - m.from])).toEqual([[0, 4, false, 3], [4, 4, true, 1], [4, 2, false, 3], [6, 2, false, 3]]);
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
    expect([Paint.text_width(head), head]).toEqual([40, "─".repeat(13) + (open ? " ▾ " : " ▸ ") + "Compaction " + "─".repeat(13)]);
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
