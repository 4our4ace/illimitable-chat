// Frame test
// ==========
// `bun test Frame.test.ts`. A paint comes as the work at hand is done,
// never in its middle; asked for again within a frame, it waits for the
// frame's end, all asked for meanwhile in one paint. The terminal's
// title names illi and the project, a small ∞ traced in the ∞'s place
// while work runs. A click on the side's second column
// (the sticky skills beside the agents) hits what it shows, the side on
// either hand. A /word's setting lights the letters matched in its key.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-frame-");
process.env.ILLI_DIR = DIR;

const { term_draw, term_orbit, term_paint, term_title } = await import("./Frame.ts");
const { Projects } = await import("../chat/Projects.ts");
const Screen = await import("../ui/Screen.ts");
const { status_new } = await import("./Status.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal on a screen fed by hand, nothing painted yet
function term(): any {
  const scr = { tty: true, kitty: false, ed: Screen.ed_new(), rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, grab: null, on: () => {} };
  return {
    v: View.view_new(), scr, due: false, notices: [], scroll: 0, seen: { total: 0, marks: [], row: 0, first: 0, tall: 1, col: 0, end: 0 }, ver: 0, body: null, find: null,
    pane: null, agents: [], choose: null, profs: [], hits: [], since: 0, spin: undefined, ruled: null, doing: null, subs: new Map(), side: { place: "right", width: "25%" }, status: status_new(),
    todo: false, areas: [], sel: null, sug: null, dropped: "", asking: null, box: null, aim: { row: -1, in: false, press: null, first: null }, pin: null, lit: null, pointed: false,
  };
}

// what f writes to the terminal; the window's titles apart (in titles)
async function written(f: (out: string[]) => Promise<void>, titles: string[] = []): Promise<string[]> {
  const out: string[] = [];
  const write = process.stdout.write;
  process.stdout.write = ((s: string) => (s.startsWith("\x1b]0;") ? titles : out).push(s)) as any;
  try {
    await f(out);
  } finally {
    process.stdout.write = write;
  }
  return out;
}

// the work at hand done: all the event loop had to do
const done = () => new Promise((ok) => setImmediate(ok));

test("a paint comes as the work at hand is done; asked again within a frame, at its end, all asked meanwhile in one", async () => {
  const t = term();
  const out = await written(async (out) => {
    Screen.ed_type(t.scr.ed, "a");
    term_draw(t);
    await Promise.resolve();
    expect(out).toHaveLength(0);
    await done();
    expect(out).toHaveLength(1);
    Screen.ed_type(t.scr.ed, "b");
    term_draw(t);
    Screen.ed_type(t.scr.ed, "c");
    term_draw(t);
    await done();
    expect(out).toHaveLength(1);
    await Bun.sleep(40);
  });
  const plain = out.map((s) => s.replace(/\x1b\[[0-9;]*m/g, ""));
  expect(plain).toHaveLength(2);
  expect(plain[0]).toContain("> a\x1b");
  expect(plain[1]).toContain("> abc\x1b");
  expect(t.due).toBe(false);
});

test("while work runs, a tick writes the ∞'s changed cells alone, the rule whole only as its words change", async () => {
  const t = term();
  t.v.busy = true;
  const out = await written(async () => {
    term_paint(t);
    await Bun.sleep(1150);
    t.v.busy = false;
    term_paint(t);
  });
  const ticks = out.slice(1, -1);
  const whole = ticks.filter((s) => s.includes("Working")).map((s) => s.replace(/\x1b\[[0-9;]*m/g, ""));
  const cells = ticks.filter((s) => !s.includes("Working"));
  expect(whole.length).toBeGreaterThanOrEqual(2);
  expect(whole.at(-1)).toContain("Working · 1s");
  expect(cells.length).toBeGreaterThanOrEqual(8);
  expect(cells.every((s) => s.length < 160 && /[⠀-⣿]/.test(s) && !s.includes("─"))).toBe(true);
  expect(t.spin).toBeUndefined();
});

test("the terminal's title names illi and the project, written as it changes: a spinner in the ∞'s place while work runs, ? while a question waits, ∞ once done; again after a wipe", async () => {
  const t = term();
  const top = Projects.place(process.cwd()).path;
  const osc = (mark: string) => "\x1b]0;" + mark + " illi · " + (top === "" ? "home" : path.basename(top)) + "\x07";
  const titles: string[] = [];
  await written(async () => {
    term_paint(t);
    term_paint(t);
    t.v.busy = true;
    term_paint(t);
    await Bun.sleep(1100);
    t.v.asks = [{}];
    term_title(t);
    Object.assign(t.v, { busy: false, asks: [] });
    term_paint(t);
    Screen.screen_wipe(t.scr);
    term_paint(t);
  }, titles);
  const spun = titles.slice(1, -3);
  expect([titles[0], ...titles.slice(-3)]).toEqual([osc("∞"), osc("?"), osc("∞"), osc("∞")]);
  expect(spun.length).toBeGreaterThanOrEqual(2);
  expect(spun.every((s, k) => /^\x1b\]0;[⠀-⣿] illi · /.test(s) && s !== titles[k])).toBe(true);
});

test("the title's mark while work runs: one braille cell, a trail of 3 dots a step round its edge, all its 8 steps apart; the trail's every place, the cell's edge whole", () => {
  const frames = Array.from({ length: 8 }, (_, k) => term_orbit(k));
  const dots   = (s: string) => (s.charCodeAt(0) - 0x2800).toString(2).replaceAll("0", "").length;
  expect(frames.every((f) => [...f].length === 1)).toBe(true);
  expect(new Set(frames).size).toBe(8);
  expect(frames.map(dots)).toEqual(Array(8).fill(3));
  expect([term_orbit(8), term_orbit(-1)]).toEqual([frames[0], frames[7]]);
  expect(String.fromCharCode(0x2800 | frames.reduce((b, f) => b | (f.charCodeAt(0) - 0x2800), 0))).toBe("⣿");
});

for (const place of ["right", "left"]) {
  test("the side's sticky skills beside its agents, the side on the " + place + ": a click on one hits it, not the agent on its row", async () => {
    const { Custom } = await import("../config/Custom.ts");
    const config = await import("../config/Config.ts");
    fs.mkdirSync(DIR + "/skills/terse", { recursive: true });
    fs.writeFileSync(DIR + "/skills/terse/SKILL.md", "---\ndescription: Short replies\nsticky: true\n---\nBe terse.");
    Custom.stick(Custom.skill(process.cwd(), "terse")!, true);
    const cols = Object.getOwnPropertyDescriptor(process.stdout, "columns");
    Object.defineProperty(process.stdout, "columns", { value: 160, configurable: true });
    try {
      const t = term();
      t.side.place = place;
      await written(async () => term_paint(t));
      const line = (row: any[]) => row.map((p) => p.line.map((r: any) => r.x).join("")).join("");
      const row  = t.ruled.rows.findIndex((r: any[]) => line(r).includes(" terse"));
      const side = t.ruled.rows[row].find((p: any) => p.line.map((r: any) => r.x).join("").includes("terse"));
      const col  = side.col + side.line.map((r: any) => r.x).join("").indexOf("terse");
      const hits = t.hits.filter((h: any) => h.row === row);
      expect(hits).toHaveLength(2);
      expect(hits[0].to).toBe(hits[1].col);
      hits.find((h: any) => col >= h.col && col < h.to).run();
      expect(config.STICKY).toEqual([]);
    } finally {
      Object.defineProperty(process.stdout, "columns", cols ?? { value: undefined, configurable: true });
      fs.rmSync(DIR + "/skills/terse", { recursive: true });
    }
  });
}

test("a /word's setting suggested as /set <key>: the letters it matched lit in its key, not in /set", async () => {
  const { term_suggest } = await import("./Commands.ts");
  const cols = Object.getOwnPropertyDescriptor(process.stdout, "columns");
  Object.defineProperty(process.stdout, "columns", { value: 160, configurable: true });
  try {
    const t = term();
    Screen.ed_set(t.scr.ed, "/side");
    t.sug = term_suggest(t);
    await written(async () => term_paint(t));
    const shown = t.ruled.rows.flat().map((p: any) => p.line.map((r: any) => (r.s?.b ? r.x.toUpperCase() : r.x)).join(""));
    expect(shown.find((l: string) => l.includes("side_width") || l.includes("SIDE_width"))).toContain("/set SIDE_width");
  } finally {
    Object.defineProperty(process.stdout, "columns", cols ?? { value: undefined, configurable: true });
  }
});
