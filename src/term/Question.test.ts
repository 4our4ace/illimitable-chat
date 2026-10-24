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
// answers staying, the command whole to its end (a note's is cut
// short); the wheel elsewhere scrolls the chat. A long command told
// where its risk is folds to its first line, the lines holding it and
// its last, a dim line for each run of the rest saying how many lines it
// hides (one short, one hiding a row at a time, one not told: never),
// its rule saying Ctrl+O all; a line wrapping to many rows (a
// 2,000-character one-liner) so too by its rows: its first, those
// holding the risk (one over two rows: both; found past tabs, control
// characters cleaned out and wide characters; wrapped anew at another
// width) and its last, "… N rows" between (never one row alone);
// Ctrl+O shows it whole and folds it again, from its
// top, the lit answer and the hold kept; a click on such a line shows it
// whole, the pointer on it lighting it; opened, it reads whole to its
// end; folded or whole on a screen 80 by 16 or 40 by 10, nothing past
// the foot, every answer, never two lines saying what is cut one over
// the other. A line asked
// for has the cursor in its words. The input as typed is kept under a
// question, typing going nowhere meanwhile, and comes back once it is
// answered. The pointer moving onto an answer lights it; a click does
// what Enter does, held just after the question shows and never from
// the click that only focuses the window; a double click picks once; a
// question answered elsewhere takes no click. A click outside never
// answers it: text is chosen and copied there, Ctrl+C copies it, the
// tabs answer, the line asked stays. Ctrl+P's palette pops up over a
// question; closed, the question is back, held again as it shows anew.
// illi's form takes the input's place too, who asks in the rule: its
// tabs, the question, its options, its words and its keys, as tall as
// its tallest tab (a shorter one blank over its keys: tabbing never
// moves the chat), the cursor in the words; over a pane, typing and a
// paste going to the words. A click on an option picks it (one to pick:
// and goes on; of any: toggled), on a tab goes there, on the words
// lights them, outside does nothing. Taller than half the screen, its
// tabs and keys hold and its lines scroll, by the keys (the lit row kept
// in view) and by the wheel over it (the lit row held while it shows,
// else the nearest; the one under the pointer lit). A theme's lit mark
// of any width leads every row as wide. Never a row past the screen's
// last, from 7 rows up, whatever else shows (the side, work running,
// many notes, a status line), and no control character from a lead; too
// short for its lead and its answers, the lead gives way whole (one row
// free: it says how many lines it has); too short for its answers, a
// line each, as many as fit about the lit one. A paste never answers it:
// the line asked takes it as one line.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-question-");
process.env.ILLI_DIR = DIR;

const { term_ask, term_question } = await import("./Commands.ts");
const { term_paint } = await import("./Frame.ts");
const { term_grab, term_press, term_type } = await import("./Keys.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const { status_new } = await import("./Status.ts");
const Theme = await import("../ui/Theme.ts");
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
const asked = (t: any, cols: number) => t.ruled.rows.slice(t.box.row - 1, t.box.row + t.box.h + 1).map((r: any[]) => text(r, cols).slice(2, cols - 1).trimEnd());

// the screen row of the question's answer named name, and a column on it
const row_of = (t: any, name: string) => t.box.row + t.box.rows.findIndex((aim: any) => aim?.k === t.question.names.indexOf(name));
const COL    = 6;
const lit    = (t: any) => t.question.names[t.question.shown[t.question.at].k];

// the answers sent, without their message ids
const sent = (t: any) => t.v.out.map((o: any) => o.msg).filter((m: any) => m.$ === "answer").map(({ id, $, ...m }: any) => m);

// illi's own questions now, each a tab: which database (one of three),
// and the cache (any of two)
const DB    = { text: "Which database?", head: "Database", options: [{ label: "Postgres", about: "you know it" }, { label: "SQLite", about: "" }, { label: "MySQL", about: "" }], multi: false };
const CACHE = { text: "Which caches?", head: "Cache", options: [{ label: "Redis", about: "" }, { label: "Memcached", about: "" }], multi: true };
const own   = (t: any, queries: any[]) => (t.v.asks = [{ id: "a1", who: "illi", tool: "ask", what: queries[0].text, queries }]);

// the screen row of row k of illi's form
const form_row = (t: any, k: number) => t.box.row + t.box.rows.findIndex((aim: any) => aim?.$ === "row" && aim.k === k);

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
        const yes  = inside.indexOf("> ○ Yes");
        const more = inside.filter((l: string) => l.startsWith("… "));
        expect(more).toEqual(t.box.ahead < t.box.lead ? [inside[yes - 1]] : []);
        expect(more.map((l: string) => l.replace(/\d+/, "N"))).toEqual(more.length === 0 ? [] : ["… N more lines · wheel, PgUp/PgDn"]);
        expect(more.map((l: string) => Number(/\d+/.exec(l)![0]))).toEqual(more.length === 0 ? [] : [t.box.lead - t.box.ahead]);
        expect(inside[yes + 1]).toStartWith("  ○ Yes, and don't ask again for rm -r ./no-such-folder-here");
        expect(inside.slice(yes + 1, -2).length).toBeLessThanOrEqual(3);
        expect(inside.at(-3)).toEndWith(" in this project");
        expect(inside.slice(-2)).toEqual(["  ○ No", "  ○ No, and say why"]);
      });
    });
  }
}

test("the permission question shows the command whole, not cut short as a note shows it: a 2,000-character one, folded to the rows holding its risk and its last, read to its end, page by page, once Ctrl+O shows it all", () => {
  sized(80, 24, () => {
    const t = term();
    t.v.asks = [{ id: "q1", who: "illi", tool: "shell", what: LONG.slice(0, 399) + "…", whole: LONG, spots: [[0, 27]], why: "it deletes files", keep: "rm -r ./no-such-folder-here" }];
    paint(t);
    expect([t.box.folds, asked(t, 80)[0]]).toEqual([true, "── Allow shell? · ↑↓ Enter · Ctrl+O all · Esc no " + "─".repeat(26)]);
    expect(asked(t, 80).slice(1, 5)).toEqual(["Why: it deletes files", "rm -r ./no-such-folder-here && echo abcdefghijabcdefghijabcdefghijabcdefghi", "… 25 rows", "efghij" + "abcdefghij".repeat(5)]);
    term_grab(t, "Ctrl+O");
    paint(t);
    const read: string[] = [];
    for (let k = 0; k < 30; k++) {
      asked(t, 80).slice(1, 1 + t.box.ahead).forEach((l: string, j: number) => (read[t.question.past + j] = l));
      term_grab(t, "PgDn");
      paint(t);
    }
    expect(read.length).toBe(t.box.lead);
    expect([read[0], read.slice(1).join("")]).toEqual(["Why: it deletes files", LONG]);
    expect(asked(t, 80)[1 + t.box.ahead]).toBe("… " + (t.box.lead - t.box.ahead) + " lines above · wheel, PgUp/PgDn");
  });
});

// a 40-line script whose risk is on line 39, the checks having told
// where (spots), asked to run in the shell (a new question each time),
// painted
const SCRIPT = "set -e\n" + Array.from({ length: 37 }, (_, k) => "echo step " + (k + 2) + " >> build.log").join("\n") + "\nrm -rf ~/projects/old-site\necho done";
const RISK   = [SCRIPT.indexOf("rm -rf"), SCRIPT.indexOf("rm -rf") + 26];
const FOLDED = ["Why: it deletes files", "set -e", "… 37 lines", "rm -rf ~/projects/old-site", "echo done"];
const risky  = (t: any, what = SCRIPT, spots = [RISK]) => {
  t.v.asks = [{ id: "q" + (t.asked = (t.asked ?? 0) + 1), who: "illi", tool: "shell", what: what.slice(0, 399), whole: what, spots, why: "it deletes files", keep: "" }];
  paint(t);
};

test("a long command folds to its first line, the lines holding what made the checks ask and its last, each run of the rest one dim line saying how many lines it hides; the rule says Ctrl+O shows all", () => {
  sized(80, 24, () => {
    const t = term();
    risky(t);
    const lines = asked(t, 80);
    expect(lines[0]).toBe("── Allow shell? · ↑↓ Enter · Ctrl+O all · Esc no " + "─".repeat(26));
    expect(lines.slice(1, -1)).toEqual([...FOLDED, "> ○ Yes", "  ○ No", "  ○ No, and say why"]);
    const gap = t.box.rows.findIndex((aim: any) => aim?.$ === "fold");
    expect([gap, t.box.rows[gap], t.box.folds, t.ruled.rows[t.box.row + gap][0].line.map((r: any) => r.s.d)]).toEqual([2, { $: "fold", k: 0 }, true, [true]]);
    const two = SCRIPT.replace("echo step 20 >> build.log", "chmod 777 /etc/shadow");
    const at  = two.indexOf("chmod");
    risky(t, two, [[at, at + 21], [two.indexOf("rm -rf"), two.indexOf("rm -rf") + 26]]);
    expect(asked(t, 80).slice(1, 8)).toEqual(["Why: it deletes files", "set -e", "… 18 lines", "chmod 777 /etc/shadow", "… 18 lines", "rm -rf ~/projects/old-site", "echo done"]);
    expect(t.box.rows.slice(0, 7).map((aim: any) => aim?.k ?? null)).toEqual([null, null, 0, null, 1, null, null]);
  });
});

test("a command doesn't fold where folding hides nothing: one of four rows or fewer, one whose hidden runs are a row each (lines or rows of a line), one whose risk is all of it, one not told where its risk is; its rule says no Ctrl+O, which then does nothing", () => {
  sized(80, 24, () => {
    const t = term();
    const short = "cd /tmp\nrm -rf ./x";
    risky(t, short, [[8, 18]]);
    expect([asked(t, 80).slice(1, 4), t.box.folds]).toEqual([["Why: it deletes files", "cd /tmp", "rm -rf ./x"], false]);
    const five = "echo a\necho b\nrm -rf ./x\necho c\necho d";
    risky(t, five, [[14, 24]]);
    expect([asked(t, 80).slice(1, 7), t.box.folds]).toEqual([["Why: it deletes files", "echo a", "echo b", "rm -rf ./x", "echo c", "echo d"], false]);
    const rows = Array.from({ length: 14 }, (_, k) => "mkdir -p out/part-" + k).join(" && ");
    risky(t, rows, [spot(rows, "mkdir -p out/part-7", "part-7")]);
    expect([asked(t, 80).slice(2, 7).every((l: string) => l.startsWith("mkdir") || l.startsWith("out/") || l.startsWith("-p ")), asked(t, 80)[7], t.box.folds]).toEqual([true, "> ○ Yes", false]);
    risky(t, SCRIPT, [[0, SCRIPT.length]]);
    expect([asked(t, 80)[3], t.box.folds]).toEqual(["echo step 2 >> build.log", false]);
    t.v.asks = [{ id: "q-plain", who: "illi", tool: "shell", what: SCRIPT.slice(0, 399), whole: SCRIPT, why: "it deletes files", keep: "" }];
    paint(t);
    expect([asked(t, 80)[0], asked(t, 80)[2], t.box.folds, t.question.fold]).toEqual(["── Allow shell? · ↑↓ Enter · Esc no " + "─".repeat(39), "set -e", false, undefined]);
    term_grab(t, "Ctrl+O");
    paint(t);
    expect([asked(t, 80)[3], t.v.verbose]).toEqual(["echo step 2 >> build.log", false]);
  });
});

test("Ctrl+O shows a folded command whole, and folds it again: its lead from its top each time, the lit answer kept, the hold on Enter as it was; the rule says what Ctrl+O does next", () => {
  sized(80, 24, () => {
    const t = term();
    risky(t);
    const shown = t.asking.shown;
    term_grab(t, "Down");
    term_grab(t, "Ctrl+O");
    paint(t);
    expect(asked(t, 80)[0]).toBe("── Allow shell? · ↑↓ Enter · Ctrl+O fold · Esc no " + "─".repeat(25));
    expect(asked(t, 80).slice(1, 5)).toEqual(["Why: it deletes files", "set -e", "echo step 2 >> build.log", "echo step 3 >> build.log"]);
    expect([t.box.lead, t.box.folds, lit(t)]).toEqual([41, true, "No"]);
    term_grab(t, "PgDn");
    paint(t);
    expect(t.question.past).toBeGreaterThan(0);
    term_grab(t, "Ctrl+O");
    paint(t);
    expect([asked(t, 80).slice(1, 6), t.question.past, lit(t), t.asking.shown, t.v.verbose, sent(t)]).toEqual([FOLDED, 0, "No", shown, false, []]);
  });
});

test("a click on a line saying what a fold hides shows the command whole, held by nothing (it answers nothing); the pointer on that line lights it", () => {
  sized(80, 24, () => {
    const t = term();
    risky(t);
    const gap = t.box.row + 2;
    const ink = () => t.ruled.rows[gap][0].line.map((r: any) => [r.x, r.s.d]);
    move(t, gap, COL);
    paint(t);
    expect([ink(), lit(t)]).toEqual([[["… 37 lines", false]], "Yes"]);
    move(t, gap + 1, COL);
    paint(t);
    expect(ink()).toEqual([["… 37 lines", true]]);
    click(t, gap, COL);
    paint(t);
    expect([t.question.fold.open, sent(t), asked(t, 80)[3], t.box.rows.some((aim: any) => aim?.$ === "fold")]).toEqual([true, [], "echo step 2 >> build.log", false]);
  });
});

test("opened, a folded command reads whole to its end, page by page", () => {
  sized(80, 24, () => {
    const t = term();
    risky(t);
    term_grab(t, "Ctrl+O");
    paint(t);
    const read: string[] = [];
    for (let k = 0; k < 20; k++) {
      asked(t, 80).slice(1, 1 + t.box.ahead).forEach((l: string, j: number) => (read[t.question.past + j] = l));
      term_grab(t, "PgDn");
      paint(t);
    }
    expect([read.length, read[0], read.slice(1).join("\n")]).toEqual([t.box.lead, "Why: it deletes files", SCRIPT]);
  });
});

// a 2,000-character one-liner whose risk is in its middle, and one
// whose risk runs on over two rows at 80 columns; where a risk is in a
// command, from its first words to its last
const ONE  = Array.from({ length: 40 }, (_, k) => "mkdir -p out/part-" + k).join(" && ") + " && rm -rf ~/projects/old-site && " + Array.from({ length: 49 }, (_, k) => "touch out/done-" + k).join(" && ");
const TWO  = Array.from({ length: 40 }, (_, k) => "mkdir -p out/part-" + k).join(" && ") + " && rm -rf ~/projects/old-site ~/projects/older-site ~/projects/oldest-site ~/projects/first-site && " + Array.from({ length: 46 }, (_, k) => "touch out/done-" + k).join(" && ");
const spot = (what: string, from: string, to: string) => [what.indexOf(from), what.indexOf(to) + to.length];

// the lead of the question as last painted, read whole page by page
const whole = (t: any, cols: number) => {
  const read: string[] = [];
  for (let k = 0; k < 40; k++) {
    asked(t, cols).slice(1, 1 + t.box.ahead).forEach((l: string, j: number) => (read[t.question.past + j] = l));
    term_grab(t, "PgDn");
    paint(t);
  }
  return read;
};

test("a 2,000-character one-liner folds by its rows: its first, the one holding what made the checks ask and its last, each run of the rest one dim line saying how many rows it hides; a risk over two rows shows both; Ctrl+O, or a click on such a line, shows it all", () => {
  sized(80, 24, () => {
    const t = term();
    risky(t, ONE, [spot(ONE, "rm -rf", "old-site")]);
    expect(asked(t, 80)[0]).toBe("── Allow shell? · ↑↓ Enter · Ctrl+O all · Esc no " + "─".repeat(26));
    expect(asked(t, 80).slice(1, -1)).toEqual(["Why: it deletes files", "mkdir -p out/part-0 && mkdir -p out/part-1 && mkdir -p out/part-2 && mkdir", "… 12 rows", "out/part-39 && rm -rf ~/projects/old-site && touch out/done-0 && touch", "… 13 rows", "&& touch out/done-47 && touch out/done-48", "> ○ Yes", "  ○ No", "  ○ No, and say why"]);
    expect([t.box.rows.slice(0, 6), t.ruled.rows[t.box.row + 4][0].line.map((r: any) => r.s.d)]).toEqual([[null, null, { $: "fold", k: 0 }, null, { $: "fold", k: 1 }, null], [true]]);
    term_grab(t, "Ctrl+O");
    paint(t);
    const all = whole(t, 80);
    expect([all.length, all.slice(1).join(" ")]).toEqual([t.box.lead, ONE]);
    risky(t, TWO, [spot(TWO, "rm -rf", "first-site")]);
    expect(asked(t, 80).slice(3, 7)).toEqual(["… 12 rows", "out/part-39 && rm -rf ~/projects/old-site ~/projects/older-site", "~/projects/oldest-site ~/projects/first-site && touch out/done-0 && touch", "… 12 rows"]);
    click(t, t.box.row + 2, COL);
    paint(t);
    expect([t.question.fold.open, sent(t), t.box.rows.some((aim: any) => aim?.$ === "fold"), whole(t, 80).slice(1).join(" ")]).toEqual([true, [], false, TWO]);
  });
});

test("the rows holding a risk are found where the line shows it, past tabs (two spaces each), control characters cleaned out and wide characters; another width wraps and folds it anew, the risk's row still shown", () => {
  for (const pad of ["\t".repeat(150), "\x07".repeat(450), "漢字😀".repeat(80)]) {
    const what = ONE.replace(" && rm -rf", " && printf '" + pad + "' && rm -rf");
    for (const cols of [80, 120]) {
      sized(cols, 30, () => {
        const t = term();
        risky(t, what, [spot(what, "rm -rf", "old-site")]);
        const lines = asked(t, cols).slice(2, -4);
        expect([t.box.folds, lines.join(" ").includes("rm -rf ~/projects/old-site"), lines.filter((l: string) => /^… \d+ rows$/.test(l)).length]).toEqual([true, true, 2]);
        expect(lines[0]).toStartWith(cols === 80 ? "mkdir -p out/part-0 && mkdir -p out/part-1 && mkdir -p out/part-2 && mkdir" : "mkdir -p out/part-0 && mkdir -p out/part-1 && mkdir -p out/part-2 && mkdir -p out/part-3 && mkdir -p out/part-4");
      });
    }
  }
});

for (const [cols, rows] of [[80, 16], [40, 10]]) {
  for (const [what, at, said] of [[SCRIPT, RISK, "a 40-line script"], [ONE, spot(ONE, "rm -rf", "old-site"), "a 2,000-character one-liner"]] as const) {
    test("folded or whole at " + cols + "x" + rows + ", " + said + ": the question paints nothing past the screen's foot, every answer shows, no two lines saying what is cut one over the other", () => {
      sized(cols, rows, () => {
        const t = term();
        risky(t, what, [at]);
        for (const open of [false, true, false]) {
          expect([open, t.ruled.rows.length, t.box.folds, t.question.fold.open]).toEqual([open, rows, true, open]);
          expect(t.box.row + t.box.h).toBeLessThan(rows - 1);
          const inside = asked(t, cols).slice(1, -1);
          expect(inside.slice(-3).map((l: string) => l.replace(/^> /, "  "))).toEqual(["  ○ Yes", "  ○ No", "  ○ No, and say why"]);
          expect(inside.filter((l: string, k: number) => l.startsWith("… ") && inside[k + 1]?.startsWith("… "))).toEqual([]);
          expect(asked(t, cols).at(-1)).toMatch(/^─+$/);
          for (let k = 0; k < 12; k++) {
            term_grab(t, "PgDn");
            paint(t);
            const now = asked(t, cols).slice(1, -1);
            expect(now.filter((l: string, j: number) => l.startsWith("… ") && now[j + 1]?.startsWith("… "))).toEqual([]);
          }
          term_grab(t, "Ctrl+O");
          paint(t);
        }
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
      expect(asked(t, 160).slice(1, -1)).toEqual(["Why: it deletes files", "rm -r build", "> ○ Yes", "  ○ Yes, and don't ask again for rm -r build in this project", "  ○ No", "  ○ No, and say why"]);
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
    expect([first(), t.box.ahead, t.question.past]).toEqual(["Why: it deletes files", 6, 0]);
    wheel(t, t.box.row + 1, COL);
    paint(t);
    expect([first(), t.question.past, tail()]).toEqual(["echo line 1", 2, ends]);
    term_grab(t, "PgDn");
    paint(t);
    expect([first(), t.question.past, tail()]).toEqual(["echo line 6", 7, ends]);
    term_grab(t, "PgUp");
    term_grab(t, "PgUp");
    paint(t);
    expect([first(), t.question.past, lit(t)]).toEqual(["Why: it deletes files", 0, "Yes"]);
    for (let k = 0; k < 60; k++) {
      term_grab(t, "PgDn");
    }
    paint(t);
    expect(asked(t, 80).slice(-9, -6)).toEqual(["echo line 298", "echo line 299", "… 295 lines above · wheel, PgUp/PgDn"]);
    expect([tail(), lit(t)]).toEqual([ends, "Yes"]);
    wheel(t, 3, COL);
    paint(t);
    expect([t.scroll, t.question.past]).toEqual([0, 295]);
    Screen.screen_feed(t.scr, sgr(64, 3, COL));
    expect([t.scroll, t.question.past]).toEqual([3, 295]);
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
    expect(asked(t, 80)[0]).toStartWith("── Delete profile work? · ↑↓ Enter · Esc ──");
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

test("illi's form takes the input's place, its full width, who asks in the rule: tabs, question, options, words, keys; as tall as its tallest tab, a shorter one blank over its keys, so tabbing moves nothing; the cursor in the words; the input as typed back once it is skipped", () => {
  sized(110, 34, () => {
    const t = term();
    Screen.ed_set(t.scr.ed, "my draft");
    own(t, [DB, CACHE]);
    paint(t);
    expect([t.box.of, t.box.col, t.box.w, t.box.h]).toEqual([t.asking.form, 2, 105, 7]);
    expect(asked(t, 110)).toEqual(["── illi asks " + "─".repeat(92), " Database   Cache   Review", "Which database?  pick one", "> ○ Postgres  you know it", "  ○ SQLite", "  ○ MySQL", "  > Something else: type your own", "↑↓ move · Space pick · type your own · Enter next · Tab switch · Esc skip", "─".repeat(105)]);
    expect(t.ruled.rows.some((r: any[]) => text(r, 110).includes("my draft"))).toBe(false);
    expect([t.ruled.at, t.scr.blink]).toEqual([{ row: t.box.row + 5, col: 2 + 4 }, true]);
    const chat = (u: any) => u.ruled.rows.slice(0, u.box.row - 1).map((r: any[]) => text(r, 110));
    const was  = [chat(t), t.box.row, t.box.h];
    term_grab(t, "Tab");
    paint(t);
    expect(asked(t, 110).slice(2, -1)).toEqual(["Which caches?  pick any", "> □ Redis", "  □ Memcached", "  > Something else: type your own", "", "↑↓ move · Space pick · type your own · Enter next · Tab switch · Esc skip"]);
    expect([chat(t), t.box.row, t.box.h]).toEqual(was);
    term_grab(t, "Tab");
    paint(t);
    expect(asked(t, 110).slice(1, -1)).toEqual([" Database   Cache   Review", "Which database?", "  no answer", "Which caches?", "  no answer", "", "Enter send · Shift+Tab back · Esc skip"]);
    expect([chat(t), t.box.row, t.box.h, t.ruled.at]).toEqual([...was, null]);
    term_grab(t, "Esc");
    paint(t);
    expect([sent(t).length, t.box, text(t.ruled.rows[31], 110).trimEnd()]).toEqual([1, null, "  > my draft"]);
  });
});

test("with a pane open illi's form takes the input's place under it: typing and a paste go to its words, the pane kept; Esc skips it, the pane still there", async () => {
  const { term_paste } = await import("./Attach.ts");
  sized(110, 34, () => {
    const t = term();
    t.pane = { title: "Help", make: () => [[Paint.Run("help text")]], w: 0, lines: [], scroll: 0 };
    own(t, [DB]);
    paint(t);
    expect(t.box?.of).toBe(t.asking.form);
    term_type(t, "near");
    term_paste(t, "by\nme");
    expect([t.asking.form.each[0].ed.text, t.pane?.title, t.scr.ed.text]).toEqual(["nearby\nme", "Help", ""]);
    term_grab(t, "Esc");
    paint(t);
    expect([t.v.out.map((o: any) => o.msg.$), t.box, t.pane?.title]).toEqual([["answer"], null, "Help"]);
  });
});

test("a click in illi's form: on an option, one to pick picks it and goes on, of any toggles it (just shown: lit only); on a tab, there; on the words, lit; outside, nothing", () => {
  sized(110, 34, () => {
    const t = term();
    own(t, [DB, CACHE]);
    paint(t);
    const f = t.asking.form;
    click(t, form_row(t, 1), COL);
    expect([f.each[0].at, f.each[0].picked, f.tab]).toEqual([1, [], 0]);
    armed(t);
    click(t, form_row(t, 1), COL);
    expect([f.each[0].picked, f.tab]).toEqual([[1], 1]);
    paint(t);
    click(t, form_row(t, 1), COL);
    click(t, form_row(t, 0), COL);
    click(t, form_row(t, 1), COL);
    expect([f.each[1].picked, f.tab]).toEqual([[0], 1]);
    click(t, form_row(t, 2), COL);
    expect(f.each[1].at).toBe(2);
    const tabs = t.box.rows[0];
    click(t, t.box.row, t.box.col + tabs[0].col + 2);
    expect(f.tab).toBe(0);
    paint(t);
    click(t, 3, 10);
    click(t, t.box.row + t.box.h - 1, COL);
    click(t, t.box.row - 1, COL);
    expect([f.tab, f.each[0].picked, t.v.out, t.asking.done]).toEqual([0, [1], [], false]);
  });
});

test("illi's form taller than half the screen: its tabs and keys hold, its lines scroll to keep the lit row in view; the wheel over it scrolls them, the lit row held while it shows, else the nearest, the row under the pointer lit, stopping at their ends; the wheel elsewhere scrolls the chat", () => {
  sized(100, 20, () => {
    const t = term();
    const many = { text: "Which one?", head: "One", options: Array.from({ length: 20 }, (_, k) => ({ label: "o" + k, about: "" })), multi: false };
    own(t, [many]);
    paint(t);
    const f = t.asking.form;
    expect([t.box.h, t.box.lines]).toEqual([10, 8]);
    for (let k = 0; k < 10; k++) {
      term_grab(t, "Down");
    }
    paint(t);
    const shown = asked(t, 100).slice(1, -1).map((l: string) => l.trim());
    expect([f.top, shown[0], shown[1], shown.at(-2), shown.at(-1)]).toEqual([4, "One   Review", "○ o3", "> ○ o10", "↑↓ move · Space pick · type your own · Enter next · Tab switch · Esc skip"]);
    const turn = (key: string) => {
      term_grab(t, key);
      paint(t);
      return [f.top, f.each[0].at];
    };
    t.scr.point = { row: t.box.row, col: t.box.col + 5 };
    expect([turn("WheelDown"), turn("WheelDown"), turn("WheelDown"), turn("WheelDown")]).toEqual([[6, 10], [8, 10], [10, 10], [12, 11]]);
    expect([turn("WheelDown"), turn("WheelDown")]).toEqual([[14, 13], [14, 13]]);
    t.scr.point = { row: t.box.row + t.box.list + 2, col: t.box.col + 5 };
    expect(turn("WheelUp")).toEqual([12, 13]);
    expect(turn("WheelUp")).toEqual([10, 11]);
    Screen.screen_feed(t.scr, sgr(64, 3, COL));
    expect([t.scroll, f.top]).toEqual([3, 10]);
    term_grab(t, "Ctrl+End");
    paint(t);
    expect([f.top, t.ruled.at]).toEqual([14, { row: t.box.row + 1 + 21 - 14, col: t.box.col + 4 }]);
  });
});

test("a lit mark wider than >: the form's options and words lead as wide, the cursor after them; a question's answers too", () => {
  const was = Theme.GLYPH.lit;
  Theme.GLYPH.lit = "->";
  try {
    sized(160, 40, () => {
      const t = term();
      own(t, [DB]);
      paint(t);
      expect(asked(t, 160).slice(3, 7)).toEqual(["-> ○ Postgres  you know it", "   ○ SQLite", "   ○ MySQL", "   > Something else: type your own"]);
      expect(t.ruled.at).toEqual({ row: t.box.row + 5, col: 2 + 5 });
      const u = term();
      ask(u, "ls");
      expect(asked(u, 160).slice(3, 7)).toEqual(["-> ○ Yes", "   ○ Yes, and don't ask again for ls in this project", "   ○ No", "   ○ No, and say why"]);
    });
  } finally {
    Theme.GLYPH.lit = was;
  }
});

test("never a row past the screen's last: a question of any kind, the side left, right or off, work running or not, many notes and a status line, from 7 rows up; every row drawn once, no control character (a lead's neither), the rules round it, every answer shown from 10 rows, the cursor in it where it takes typing", () => {
  const many  = { text: "Which one?", head: "One", options: Array.from({ length: 20 }, (_, k) => ({ label: "o" + k, about: "" })), multi: false };
  const kinds: Record<string, (t: any) => void> = {
    tall    : (t) => (t.v.asks = [{ id: "q1", who: "illi", tool: "shell", what: TALL, why: "it deletes \x1b[31mfiles\x07", keep: TALL }]),
    confirm : (t) => term_question(t, "Delete profile work?", ["Keep it", "Delete it"], ["", "its chat and setup, gone for good"], () => {}, { lead: [[Paint.Run("a lead with \x1b[1m control \x07 characters\r")]] }),
    line    : (t) => term_ask(t, "New profile", "its name", "a name", "letters, digits", () => null),
    form    : (t) => own(t, [DB, many]),
  };
  for (const [cols, rows] of [[200, 50], [80, 24], [80, 18], [40, 12], [40, 10], [30, 8], [20, 7]]) {
    for (const place of ["right", "left", "off"]) {
      for (const busy of [false, true]) {
        for (const [kind, make] of Object.entries(kinds)) {
          sized(cols, rows, () => {
            const t = term();
            t.side.place = place;
            if (busy) {
              [t.v.busy, t.v.live] = [true, [{ kind: "illi", text: "words streaming" }]];
            }
            t.notices = Array.from({ length: 8 }, (_, k) => ({ text: "note " + k + " long enough to wrap on a narrow screen", until: Date.now() + 60000, toast: false }));
            [t.status.held, t.status.rows] = [3, [[Paint.Run("one")], [Paint.Run("two")], [Paint.Run("three")]]];
            Screen.ed_set(t.scr.ed, "my draft");
            make(t);
            paint(t);
            clearTimeout(t.spin);
            const drawn = t.ruled.rows;
            const said  = cols + "x" + rows + " " + place + (busy ? " busy " : " idle ") + kind;
            expect([said, drawn.length]).toEqual([said, rows]);
            for (const row of drawn) {
              const pieces = [...row].sort((a: any, b: any) => a.col - b.col);
              pieces.forEach((p: any, k: number) => expect([said, p.col + p.w <= (pieces[k + 1]?.col ?? cols)]).toEqual([said, true]));
              expect([said, row.flatMap((p: any) => p.line).filter((r: any) => /[\x00-\x1f\x7f-\x9f]/.test(r.x))]).toEqual([said, []]);
            }
            const lines = asked(t, cols);
            expect([said, lines[0].startsWith("── "), /^─+$/.test(lines.at(-1)), drawn.some((r: any[]) => text(r, cols).includes("my draft"))]).toEqual([said, true, true, false]);
            if (kind === "tall" || kind === "confirm") {
              const shown = new Set(t.box.rows.filter((aim: any) => aim?.$ === "option").map((aim: any) => aim.k));
              expect([said, rows < 10 || shown.size === t.question.names.length, lines.slice(1, -1).includes("")]).toEqual([said, true, false]);
              expect([said, t.ruled.at]).toEqual([said, null]);
            } else if (kind === "line") {
              expect([said, t.ruled.at.row >= t.box.row && t.ruled.at.row < t.box.row + t.box.h]).toEqual([said, true]);
            }
          });
        }
      }
    }
  }
}, 30000);

test("too short for its lead and its answers, the lead gives way whole (one row free: that row alone says how many lines it has, the wheel and the pages leaving it be); too short for its answers, they show a line each, as many as fit, moving with the lit one", () => {
  sized(80, 12, () => {
    const t = term();
    ask(t, TALL, "rm -r ./no-such-folder-here");
    armed(t);
    expect(asked(t, 80).slice(1, -1)).toEqual(["Why: it deletes files", "… 300 more lines · wheel, PgUp/PgDn", "> ○ Yes", "  ○ Yes, and don't ask again for rm -r ./no-such-folder-here in this …", "  ○ No", "  ○ No, and say why"]);
  });
  sized(80, 11, () => {
    const t = term();
    ask(t, TALL, "rm -r ./no-such-folder-here");
    armed(t);
    expect(asked(t, 80).slice(1, -1)).toEqual(["… 301 more lines", "> ○ Yes", "  ○ Yes, and don't ask again for rm -r ./no-such-folder-here in this …", "  ○ No", "  ○ No, and say why"]);
    wheel(t, t.box.row + 2, COL);
    term_grab(t, "PgDn");
    paint(t);
    expect([t.question.past ?? 0, lit(t)]).toEqual([0, "No, and say why"]);
  });
  sized(80, 8, () => {
    const t = term();
    ask(t, TALL, "rm -r ./no-such-folder-here");
    armed(t);
    expect(asked(t, 80).slice(1, -1)).toEqual(["> ○ Yes", "  ○ Yes, and don't ask again for rm -r ./no-such-folder-here in this …"]);
    term_grab(t, "Down");
    term_grab(t, "Down");
    paint(t);
    expect(asked(t, 80).slice(1, -1)).toEqual(["  ○ Yes, and don't ask again for rm -r ./no-such-folder-here in this …", "> ○ No"]);
    click(t, row_of(t, "Yes, and don't ask again for rm -r ./no-such-folder-here in this project"), COL);
    expect(sent(t)).toEqual([{ ask: "q1", yes: true, always: true, said: "" }]);
  });
});

test("a paste never answers a question: on the permission question it goes nowhere, the input as typed kept, even one ending in a new line; on the line asked it goes in as one line, waiting for Enter", async () => {
  const { term_paste } = await import("./Attach.ts");
  sized(80, 24, () => {
    const t = term();
    t.scr.paste = (x: string) => term_paste(t, x);
    Screen.ed_set(t.scr.ed, "half a thought");
    ask(t, "ls");
    armed(t);
    Screen.screen_feed(t.scr, "\x1b[200~yes\n\x1b[201~");
    expect([sent(t), t.question.title, t.scr.ed.text]).toEqual([[], "Allow shell?", "half a thought"]);
    term_grab(t, "Up");
    term_grab(t, "Enter");
    Screen.screen_feed(t.scr, "\x1b[200~too\nrisky\n\x1b[201~");
    expect([sent(t), t.question.title, t.question.find.text, t.scr.ed.text]).toEqual([[], "Why not shell?", "too risky ", "half a thought"]);
  });
});
