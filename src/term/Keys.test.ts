// Keys test
// =========
// `bun test Keys.test.ts`. The suggested reply, fed keys as a terminal
// sends them: the empty input shows it as its hint, dim, the cursor at its
// start (on an agent's page, none); Tab puts it in the input, not sent;
// anything typed dismisses it, even erased, till the next one comes; with
// none shown, Tab does nothing; the picker keeps its Tab.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-keys-");
process.env.ILLI_DIR = DIR;

const { term_chooser } = await import("./Commands.ts");
const { term_grab, term_hint, term_press } = await import("./Keys.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal with a screen fed by hand (a kitty terminal), the chat's
// view the suggested reply came to; a paint always due, so none is asked
// for
function term(suggest: string): any {
  const t: any = { v: { ...View.view_new(), suggest }, dropped: "", sel: null, due: true, sug: null, choose: null, pane: null };
  t.scr = { tty: true, kitty: false, ed: Screen.ed_new(), rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, grab: (k: string) => term_grab(t, k), on: (k: string) => term_press(t, k) };
  Screen.screen_feed(t.scr, "\x1b[?1u");
  return t;
}

test("the empty input shows the suggested reply as its hint, dim, the cursor at its start; an agent's page none", () => {
  const t = term("Run the tests");
  expect(term_hint(t)).toBe("Run the tests");
  const { lines, at } = Screen.screen_input(t.scr, 40, 5, term_hint(t), false);
  expect(lines).toHaveLength(1);
  expect(lines[0][1]).toEqual(Paint.Run("Run the tests", Paint.DIM));
  expect(at).toEqual({ row: 0, col: 2 });
  t.v.page = { name: "reviewer", log: [], live: [] };
  expect(term_hint(t)).toBe("");
});

test("Tab puts the suggested reply in the input, not sent; with none shown, Tab does nothing", () => {
  const t = term("Run the tests");
  Screen.screen_feed(t.scr, "\t");
  expect(t.scr.ed.text).toBe("Run the tests");
  expect(t.v.out).toEqual([]);
  expect(term_hint(t)).toBe("");
  Screen.screen_feed(t.scr, "\x15");
  expect(t.scr.ed.text).toBe("");
  Screen.screen_feed(t.scr, "\t");
  expect(t.scr.ed.text).toBe("");
  const none = term("");
  Screen.screen_feed(none.scr, "\t");
  expect(none.scr.ed.text).toBe("");
});

test("anything typed dismisses the suggested reply, even erased, till the next one comes", () => {
  const t = term("Run the tests");
  Screen.screen_feed(t.scr, "n");
  expect(term_hint(t)).toBe("");
  Screen.screen_feed(t.scr, "\x7f");
  expect(t.scr.ed.text).toBe("");
  expect(term_hint(t)).toBe("");
  Screen.screen_feed(t.scr, "\t");
  expect(t.scr.ed.text).toBe("");
  t.v.suggest = "Commit it";
  expect(term_hint(t)).toBe("Commit it");
});

test("the picker keeps its Tab while a suggested reply shows", () => {
  const t = term("Run the tests");
  term_chooser(t, "Agent", ["Illi", "Reviewer"], ["", ""], 0, () => {});
  Screen.screen_feed(t.scr, "\t");
  expect(t.choose.at).toBe(1);
  expect(t.scr.ed.text).toBe("");
  expect(term_hint(t)).toBe("Run the tests");
});
