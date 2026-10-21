// Palette test
// ============
// `bun test Palette.test.ts`. Ctrl+P lists, in the screen's middle, each
// command (its /name, else its first key; its keys at the right) and each
// setting (its value at the right), but no key that means
// something only pressed; a search finds a word in what one does too.
// Enter runs a command (or its key's), puts one that needs words in the
// input; on a setting it steps an on/off (so do Left and Right; Delete
// puts its default back), and opens /settings' way for one typed in.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-palette-");
process.env.ILLI_DIR = DIR;
process.env.ILLI_VENDORS = "claude-api";
process.env.ILLI_PICK = "claude-api:sonnet-5.5:medium:slow";
delete process.env.ILLI_TPS;
delete process.env.ILLI_AFTER;

const config = await import("../config/Config.ts");
const { term_palette } = await import("./Palette.ts");
const { term_grab, term_type } = await import("./Keys.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal with no screen; a paint always due, so none is asked for
const term = () => ({ v: View.view_new(), scr: { tty: true, ed: Screen.ed_new() }, side: { place: "right", width: "25%" }, choose: null, pane: null, sug: null, ver: 0, scroll: 0, notices: [], due: true }) as any;

// the palette searched for `find`, its first match lit
const open = (find = "") => {
  const t = term();
  term_palette(t);
  term_type(t, find);
  return t;
};
const lit   = (t: any) => t.choose.names[t.choose.shown[t.choose.at].k];
const aside = (t: any) => t.choose.aside[t.choose.shown[t.choose.at].k];
const right = (t: any, name: string) => t.choose.aside[t.choose.names.indexOf(name)];
const file  = () => JSON.parse(fs.readFileSync(DIR + "/config.json", "utf8"));

test("Ctrl+P lists each command and each setting with its value, but no key that means something only pressed", () => {
  const t = open();
  expect([t.choose.title, t.choose.middle]).toEqual(["Commands", 88]);
  expect(t.choose.names).toEqual(expect.arrayContaining(["/model", "/fold", "/goal", "Ctrl+Y", "Ctrl+O", "Shift+Tab", "Ctrl+PgDn", "set tps", "set side"]));
  expect(right(t, "Ctrl+PgDn")).toBe("Ctrl+PgUp");
  for (const key of ["Enter", "Esc", "Ctrl+C", "Ctrl+P", "PgUp, PgDn", "Shift+Up, Shift+Down"]) {
    expect(t.choose.names).not.toContain(key);
  }
  expect([t.choose.about[t.choose.names.indexOf("set tps")], right(t, "set tps")]).toEqual(["tokens a second while text streams", "on"]);
  expect([right(t, "/fold"), right(t, "/goal")]).toEqual(["Ctrl+F", ""]);
  expect(t.choose.about[t.choose.names.indexOf("/fold")]).toBe("fold the chat into the fewest blocks");
});

test("a search finds a word in what a command does, not only in its name", () => {
  expect(lit(open("copy illi"))).toBe("Ctrl+Y");
  expect(lit(open("/mod"))).toBe("/model");
});

test("Enter runs a command, or its key's; one that needs words goes in the input to finish", () => {
  const t = open("/settings");
  term_grab(t, "Enter");
  expect(t.choose.title).toBe("Settings");
  const v = open("Ctrl+O");
  term_grab(v, "Enter");
  expect([v.choose, v.v.verbose]).toEqual([null, true]);
  const g = open("/goal");
  expect(g.choose.foot(g.choose.shown[g.choose.at].k)).toBe("Enter type it in");
  term_grab(g, "Enter");
  expect([g.choose, g.scr.ed.text]).toEqual([null, "/goal "]);
});

test("on a setting, Enter and Right step an on/off, kept at once; Delete puts its default back; one typed in goes to /set", () => {
  const t = open("set tps");
  term_grab(t, "Enter");
  expect([file().tps, config.TPS, aside(t)]).toEqual(["off", false, "off"]);
  term_grab(t, "Right");
  expect(config.TPS).toBe(true);
  term_grab(t, "Delete");
  expect([file().tps, config.TPS]).toEqual([undefined, true]);
  const a = open("set after");
  term_grab(a, "Enter");
  expect([a.choose, a.scr.ed.text]).toEqual([null, "/set after "]);
});
