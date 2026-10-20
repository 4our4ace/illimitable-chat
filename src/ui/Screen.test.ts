// Screen's input, fed byte streams as a terminal sends them: any read may
// end anywhere (a reader held up lets the terminal's writes split at any
// byte), and no text typed or pasted may slow a key down; the mouse's
// reports. A paint writes only the rows that changed. Then the lines
// Paint lays out: a link is never cut, a frame never passes its width,
// each block's lines are marked.

import { expect, test } from "bun:test";
import * as Paint from "./Paint.ts";
import * as Screen from "./Screen.ts";
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

test("the mouse: the wheel, the left button pressed, dragged, let go, the pointer moved, never typed, whatever the reads", () => {
  splits("\x1b[<64;10;5M\x1b[<65;10;5M\x1b[<0;12;7M\x1b[<32;13;7M\x1b[<0;13;7m\x1b[<35;20;3M\x1b[<2;1;1M", (text, keys) => {
    expect(keys).toEqual(["WheelUp", "WheelDown", "Press", "Drag", "Release", "Move"]);
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

test("a lone /word is a command typed; one sent before, brought back by Up, is none till edited", () => {
  const ed = Screen.ed_new();
  Screen.ed_history(ed, ["/help"]);
  Screen.ed_type(ed, "/he");
  expect(Screen.ed_slash(ed)).toBe("/he");
  Screen.ed_type(ed, "lp me");
  expect(Screen.ed_slash(ed)).toBe(null);
  Screen.ed_set(ed, "");
  Screen.ed_key(ed, "Up");
  expect([ed.text, Screen.ed_slash(ed)]).toEqual(["/help", null]);
  Screen.ed_key(ed, "Backspace");
  expect(Screen.ed_slash(ed)).toBe("/hel");
  Screen.ed_set(ed, "say /help");
  expect(Screen.ed_slash(ed)).toBe(null);
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

test("a link is never cut", () => {
  const url = "https://x.co/" + "x".repeat(99);
  expect(Paint.runs_wrap([Paint.Run("Pay: " + url)], 76, false).map((l) => l.map((r) => r.x).join(""))).toEqual(["Pay: ", url]);
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
