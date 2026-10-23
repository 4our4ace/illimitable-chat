// Question test
// =============
// `bun test Question.test.ts`. A question takes the input's place, its
// full width, the side left or right, nothing dimmed: its title and keys
// in the rule over it, the rule under it kept, half the screen's rows at
// most. The permission question with a 2,000-character command on one
// line or a 300-line one, on a screen 80 by 24 or 200 by 50: every answer
// shows (one naming the command it keeps: its start and its end), no row
// drawn twice, no control character written, no blank row between its
// rules, the cursor hidden; its lead cut, a dim line saying how much
// more. The lead scrolls by the wheel over it and by PgUp, PgDn, its
// answers staying; the wheel elsewhere scrolls the chat. A line asked
// for has the cursor in its words. The input as typed is kept under a
// question, typing going nowhere meanwhile, and comes back once it is
// answered. The pointer moving onto an answer lights it; a click does
// what Enter does, held just after the question shows and never from
// the click that only focuses the window; a double click picks once; a
// question answered elsewhere takes no click. A click outside never
// answers it: text is chosen and copied there, Ctrl+C copies it, the
// tabs answer, the line asked stays. Ctrl+P's palette pops up over a
// question; closed, the question is back, held again as it shows anew.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-question-");
process.env.ILLI_DIR = DIR;

const { term_question } = await import("./Commands.ts");
const { term_paint } = await import("./Frame.ts");
const { term_grab, term_press, term_type } = await import("./Keys.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const { status_new } = await import("./Status.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal on a screen fed by hand (its keys, text and mouse to the
// terminal), nothing painted yet, its paints written nowhere
function term(): any {
  const scr: any = { tty: true, kitty: false, ed: Screen.ed_new(), rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, left: true };
  const t: any = {
    v: View.view_new(), scr, due: false, notices: [], scroll: 0, seen: { total: 0, marks: [], row: 0, first: 0, tall: 1, col: 0, end: 0 }, ver: 0, body: null, find: null,
    pane: null, agents: [], choose: null, question: null, profs: [], hits: [], since: 0, spin: undefined, ruled: null, doing: null, subs: new Map(), side: { place: "right", width: "25%" }, status: status_new(),
    todo: false, areas: [], sel: null, sug: null, dropped: "", asking: null, box: null, aim: { row: -1, in: false, press: null, first: null }, pin: null, lit: null, pointed: false, wait: null, acted: null, quit: 0, pending: 0, imgs: new Map(), quoted: null, lead: false,
  };
  [scr.grab, scr.on, scr.type] = [(k: string) => term_grab(t, k), (k: string) => term_press(t, k), (x: string) => term_type(t, x)];
  return t;
}

// a paint now, none asked for after (a paint always due)
const paint = (t: any) => {
  term_paint(t);
  t.due = true;
};

// the mouse at a screen row and column, as a terminal reports it: the
// left button pressed (a new click: never a double one), let go, the
// pointer moved, dragged; the wheel turned down
const sgr    = (b: number, row: number, col: number, end = "M") => "\x1b[<" + b + ";" + (col + 1) + ";" + (row + 1) + end;
const press  = (t: any, row: number, col: number) => ((t.scr.pressed = 0), Screen.screen_feed(t.scr, sgr(0, row, col)));
const again  = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(0, row, col));
const let_go = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(0, row, col, "m"));
const click  = (t: any, row: number, col: number) => (press(t, row, col), let_go(t, row, col));
const move   = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(35, row, col));
const drag   = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(32, row, col));
const wheel  = (t: any, row: number, col: number) => Screen.screen_feed(t.scr, sgr(65, row, col));

// f run on a screen cols by rows
function sized<T>(cols: number, rows: number, f: () => T): T {
  const was = [Object.getOwnPropertyDescriptor(process.stdout, "columns"), Object.getOwnPropertyDescriptor(process.stdout, "rows")];
  Object.defineProperty(process.stdout, "columns", { value: cols, configurable: true });
  Object.defineProperty(process.stdout, "rows", { value: rows, configurable: true });
  try {
    return f();
  } finally {
    Object.defineProperty(process.stdout, "columns", was[0] ?? { value: undefined, configurable: true });
    Object.defineProperty(process.stdout, "rows", was[1] ?? { value: undefined, configurable: true });
  }
}

// f run, what it writes to the terminal (text copied) kept from it and
// given back
function written(f: () => void): string[] {
  const write = process.stdout.write;
  const out: string[] = [];
  process.stdout.write = ((x: string) => out.push(x) > 0) as any;
  try {
    f();
  } finally {
    process.stdout.write = write;
  }
  return out;
}

// a row as painted, its pieces laid over one another, cols wide
const text = (row: any[], cols: number) => {
  const cells = Array(cols).fill(" ");
  for (const p of row) {
    [...p.line.map((r: any) => r.x).join("")].slice(0, p.w).forEach((ch, k) => (cells[p.col + k] = ch));
  }
  return cells.join("");
};

// the chat asking to run a command in the shell (don't ask again keeping
// that very command, or what is given), painted
const ask = (t: any, what: string, keep = what) => {
  t.v.asks = [{ id: "q1", who: "illi", tool: "shell", what, why: "it deletes files", keep }];
  paint(t);
};

// the question's hold over, as if shown long ago
const armed = (t: any) => (t.asking.shown -= 600);

// the question as last painted, cols wide: the rule over it, its lines,
// the rule under it, each inside the margins
const asked = (t: any, cols: number) => t.ruled.rows.slice(t.box.row - 1, t.box.row + t.box.h + 1).map((r: any[]) => text(r, cols).slice(2, cols - 3).trimEnd());

// the screen row of the question's answer named name, and a column on it
const row_of = (t: any, name: string) => t.box.row + t.box.rows.findIndex((aim: any) => aim?.k === t.question.names.indexOf(name));
const COL    = 6;
const lit    = (t: any) => t.question.names[t.question.shown[t.question.at].k];

// the answers sent, without their message ids
const sent = (t: any) => t.v.out.map((o: any) => o.msg).filter((m: any) => m.$ === "answer").map(({ id, $, ...m }: any) => m);

const LONG = "rm -r ./no-such-folder-here && echo " + "abcdefghij".repeat(197);
const TALL = "rm -r ./no-such-folder-here\n" + Array.from({ length: 299 }, (_, k) => "echo line " + (k + 1)).join("\n");

for (const [what, said] of [[LONG, "a 2,000-character command on one line"], [TALL, "a 300-line command"]]) {
  for (const [cols, rows] of [[80, 24], [200, 50]]) {
    test("the permission question with " + said + " at " + cols + "x" + rows + ": every answer shows, no row drawn twice, no control character, no blank row inside, half the rows at most, the cursor hidden", () => {
      sized(cols, rows, () => {
        const t = term();
        ask(t, what);
        const drawn = t.ruled.rows;
        expect(drawn.length).toBe(rows);
        for (const row of drawn) {
          const pieces = [...row].sort((a: any, b: any) => a.col - b.col);
          pieces.forEach((p: any, k: number) => expect(p.col + p.w).toBeLessThanOrEqual(pieces[k + 1]?.col ?? cols));
          expect(row.flatMap((p: any) => p.line).filter((r: any) => /[\x00-\x1f\x7f-\x9f]/.test(r.x))).toEqual([]);
        }
        expect(drawn.slice(t.box.row - 1, t.box.row + t.box.h + 1).every((r: any[]) => r.length === 1)).toBe(true);
        expect([t.box.col, t.box.w, t.ruled.at]).toEqual([2, cols - 5, null]);
        expect(t.box.h).toBeLessThanOrEqual(rows / 2);
        const lines = asked(t, cols);
        expect(lines[0]).toStartWith("── Allow shell? · ↑↓ Enter · Esc no ──");
        expect(lines.at(-1)).toMatch(/^─+$/);
        const inside = lines.slice(1, -1);
        expect(inside.filter((l: string) => l.trim() === "")).toEqual([]);
        expect(inside[0]).toBe("Why: it deletes files");
        expect(inside[1]).toStartWith("rm -r ./no-such-folder-here");
        const yes  = inside.indexOf("> Yes");
        const more = inside.filter((l: string) => l.startsWith("… "));
        expect(more).toEqual(t.box.ahead < t.box.lead ? [inside[yes - 1]] : []);
        expect(more.map((l: string) => l.replace(/\d+/, "N"))).toEqual(more.length === 0 ? [] : ["… N more lines · wheel, PgUp/PgDn"]);
        expect(more.map((l: string) => Number(/\d+/.exec(l)![0]))).toEqual(more.length === 0 ? [] : [t.box.lead - t.box.ahead]);
        expect(inside[yes + 1]).toStartWith("  Yes, and don't ask again for rm -r ./no-such-folder-here");
        expect(inside.slice(yes + 1, -2).length).toBeLessThanOrEqual(3);
        expect(inside.at(-3)).toEndWith(" in this project");
        expect(inside.slice(-2)).toEqual(["  No", "  No, and say why"]);
      });
    });
  }
}

test("a question takes the input's full width with the side left or right, nothing dimmed: the head and the side as with none, only the chat's rows fewer", () => {
  for (const place of ["left", "right"]) {
    sized(160, 40, () => {
      const t = term();
      t.side.place = place;
      paint(t);
      const seen = (r: any[]) => r.map((p: any) => [p.col, p.w, p.line.map((run: any) => [run.x, run.s])]);
      const none = t.ruled.rows.slice(0, 6).map(seen);
      ask(t, "rm -r build");
      expect([t.box.col, t.box.w]).toEqual([2, 155]);
      expect(t.ruled.rows.slice(0, 6).map(seen)).toEqual(none);
      expect(asked(t, 160).slice(1, -1)).toEqual(["Why: it deletes files", "rm -r build", "> Yes", "  Yes, and don't ask again for rm -r build in this project", "  No", "  No, and say why"]);
    });
  }
});

test("a line asked for (No, and say why) takes the input's rows, its title and keys in the rule, the cursor in its words; a click outside leaves it; Esc goes back to the question", () => {
  sized(80, 24, () => {
    const t = term();
    ask(t, "ls");
    armed(t);
    term_grab(t, "Up");
    term_grab(t, "Enter");
    paint(t);
    expect(asked(t, 80)).toEqual(["── Why not shell? · Enter send · Esc back " + "─".repeat(33), "> your reason, for the model", "─".repeat(75)]);
    expect(t.ruled.at).toEqual({ row: t.box.row, col: 4 });
    term_type(t, "too risky");
    paint(t);
    expect(t.ruled.at).toEqual({ row: t.box.row, col: 13 });
    click(t, 3, 10);
    paint(t);
    expect([t.question.title, t.question.find.text, sent(t)]).toEqual(["Why not shell?", "too risky", []]);
    term_grab(t, "Esc");
    paint(t);
    expect([t.question.title, sent(t)]).toEqual(["Allow shell?", []]);
  });
});

test("the input as typed is kept under a question, typing going nowhere meanwhile, and comes back once it is answered", () => {
  sized(80, 24, () => {
    const t = term();
    Screen.ed_set(t.scr.ed, "half a thought");
    ask(t, "ls");
    expect(t.ruled.rows.some((r: any[]) => text(r, 80).includes("half a thought"))).toBe(false);
    term_type(t, "more");
    expect(t.scr.ed.text).toBe("half a thought");
    armed(t);
    term_grab(t, "Enter");
    paint(t);
    expect(sent(t)).toEqual([{ ask: "q1", yes: true, always: false, said: "" }]);
    expect([t.question, t.box, text(t.ruled.rows[21], 80).trimEnd()]).toEqual([null, null, "  > half a thought"]);
    expect(t.ruled.at).toEqual({ row: 21, col: 18 });
  });
});

test("too tall, the lead scrolls by the wheel over it and by PgUp, PgDn, the answers staying; the wheel elsewhere scrolls the chat, the question as it was", () => {
  sized(80, 24, () => {
    const t = term();
    ask(t, TALL, "rm -r ./no-such-folder-here");
    const first = () => asked(t, 80)[1];
    const tail  = () => asked(t, 80).slice(-5);
    const ends  = tail();
    expect([first(), t.box.ahead, t.question.past]).toEqual(["Why: it deletes files", 7, 0]);
    wheel(t, t.box.row + 1, COL);
    paint(t);
    expect([first(), t.question.past, tail()]).toEqual(["echo line 1", 2, ends]);
    term_grab(t, "PgDn");
    paint(t);
    expect([first(), t.question.past, tail()]).toEqual(["echo line 7", 8, ends]);
    term_grab(t, "PgUp");
    term_grab(t, "PgUp");
    paint(t);
    expect([first(), t.question.past, lit(t)]).toEqual(["Why: it deletes files", 0, "Yes"]);
    for (let k = 0; k < 60; k++) {
      term_grab(t, "PgDn");
    }
    paint(t);
    expect(asked(t, 80).slice(-8, -5)).toEqual(["echo line 298", "echo line 299", "… 294 lines above · wheel, PgUp/PgDn"]);
    expect([tail(), lit(t)]).toEqual([ends, "Yes"]);
    wheel(t, 3, COL);
    paint(t);
    expect([t.scroll, t.question.past]).toEqual([0, 294]);
    Screen.screen_feed(t.scr, sgr(64, 3, COL));
    expect([t.scroll, t.question.past]).toEqual([3, 294]);
  });
});

test("the pointer moving onto an answer lights it; a click does what Enter does, held just after the question shows, never from the click that only focuses the window", () => {
  sized(80, 24, () => {
    const t = term();
    ask(t, "ls");
    const no = row_of(t, "No");
    move(t, no, COL);
    expect(lit(t)).toBe("No");
    click(t, no, COL);
    expect([sent(t), t.question.title]).toEqual([[], "Allow shell?"]);
    armed(t);
    Screen.screen_feed(t.scr, "\x1b[O");
    click(t, no, COL);
    Screen.screen_feed(t.scr, "\x1b[I");
    click(t, no, COL);
    expect(sent(t)).toEqual([]);
    t.scr.gained -= 200;
    click(t, no, COL);
    expect([sent(t), t.question]).toEqual([[{ ask: "q1", yes: false, always: false, said: "" }], null]);
  });
});

test("a confirmation at the input: a double click on an answer picks once, its second press going nowhere; a question answered elsewhere takes no click", () => {
  sized(80, 24, () => {
    const t = term();
    const picked: number[] = [];
    term_question(t, "Delete profile work?", ["Cancel", "Delete"], ["", ""], (k) => picked.push(k));
    paint(t);
    expect(asked(t, 80)[0]).toStartWith("── Delete profile work? · ↑↓ Enter ──");
    const r = row_of(t, "Delete");
    click(t, r, COL);
    paint(t);
    again(t, r, COL);
    let_go(t, r, COL);
    expect([picked, t.scr.clicks, t.question, t.sel]).toEqual([[1], 2, null, null]);
    ask(t, "ls");
    armed(t);
    const yes = row_of(t, "Yes");
    t.v.asks = [];
    click(t, yes, COL);
    expect([sent(t), t.question]).toEqual([[], null]);
  });
});

test("a click outside never answers a question: text is chosen and copied there, Ctrl+C copies it again, the tabs answer", () => {
  sized(80, 24, () => {
    const t = term();
    ask(t, "ls");
    armed(t);
    t.areas.unshift({ key: "chat", lines: [[Paint.Run("some words here")]], first: 0, row: 2, col: 2, w: 20, tall: 1 });
    const copied = written(() => {
      press(t, 2, 2);
      drag(t, 2, 6);
      let_go(t, 2, 6);
      Screen.screen_feed(t.scr, "\x03");
    });
    const some = "\x1b]52;c;" + Buffer.from("some").toString("base64") + "\x07";
    expect([copied, t.notices.map((n: any) => n.text)]).toEqual([[some, some], ["Copied 4 characters"]]);
    expect([sent(t), t.question.title]).toEqual([[], "Allow shell?"]);
    const mode = t.hits.find((h: any) => h.row === 23 && h.to === 2 + 75);
    click(t, 23, mode.col);
    expect([t.choose.title, sent(t), t.question.title]).toEqual(["Mode, this session", [], "Allow shell?"]);
  });
});

test("Ctrl+P's palette pops up over a question, which keeps its place; closed, the question is back, held again as it shows anew", () => {
  sized(80, 24, () => {
    const t = term();
    ask(t, "ls");
    armed(t);
    const q = t.question;
    Screen.screen_feed(t.scr, "\x10");
    paint(t);
    expect([t.choose.title, t.question, t.box.of]).toEqual(["Commands", q, t.choose]);
    term_grab(t, "Esc");
    paint(t);
    expect([t.choose, t.question, t.box.of]).toEqual([null, q, q]);
    term_grab(t, "Enter");
    expect(sent(t)).toEqual([]);
    armed(t);
    term_grab(t, "Enter");
    expect(sent(t)).toEqual([{ ask: "q1", yes: true, always: false, said: "" }]);
  });
});
