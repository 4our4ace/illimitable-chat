// Profile window test
// ===================
// `bun test ProfileWindow.test.ts`. /profile in a window (Window.ts): a
// switch hides this illi at once, whatever runs (a turn, background
// jobs), and nothing asks; a fresh profile is made and switched to at
// once; a profile open hidden in the window can't be renamed or deleted;
// a pipe still runs in one profile.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR   = fs.mkdtempSync(os.tmpdir() + "/illi-profile-window-");
const NONCE = "0123456789abcdef0123456789abcdef";
process.env.ILLI_DIR    = DIR;
process.env.ILLI_WINDOW = "1:" + NONCE + ":shown";
delete process.env.ILLI_PROFILE;
fs.mkdirSync(DIR + "/profiles/work", { recursive: true });
fs.mkdirSync(DIR + "/profiles/home", { recursive: true });

const { member_attach, member_screen } = await import("./Member.ts");
const { term_profile, term_profile_go } = await import("./ProfileCommands.ts");
const { term_grab, term_type } = await import("./Keys.ts");
const Screen = await import("../ui/Screen.ts");
const { status_new } = await import("./Status.ts");
const View = await import("../ui/View.ts");
const { wire_cut, wire_frame } = await import("./Wire.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// the messages a call wrote to the window
const said = async (run: () => unknown) => {
  const out: string[] = [];
  const write = process.stdout.write;
  process.stdout.write = ((s: string) => out.push(s)) as any;
  try {
    await run();
  } finally {
    process.stdout.write = write;
  }
  return wire_cut("", out.join(""), NONCE).parts.filter((p) => typeof p !== "string");
};

// a terminal in the window, at work: a turn and a background job
const term = (tty = true) => {
  const scr: any = { tty, kitty: false, ed: Screen.ed_new(), rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, grab: null, on: () => {}, win: member_screen() };
  const v = { ...View.view_new(), busy: true, background: [{ id: 1, command: "npm run dev", agent: "illi", since: 0 }] };
  const t: any = { v, scr, chat: { busy: true }, status: status_new(), login: null, sel: null, lead: false, drift: undefined, notices: [], due: true, choose: null, pane: null, sug: null, profs: [], quitting: false, ver: 0 };
  member_attach(t);
  return t;
};
const note = (t: any) => t.notices.at(-1)?.text ?? "";

test("a switch hides this illi at once, whatever runs, and nothing asks", async () => {
  const t = term();
  expect(await said(() => term_profile_go(t, "work"))).toEqual([{ $: "hide", to: "work" }]);
  expect([t.choose, t.scr.hidden, t.notices]).toEqual([null, true, []]);
});

test("a fresh profile is made and switched to at once, whatever runs", async () => {
  const t = term();
  term_profile(t, "");
  t.choose.pick(t.choose.names.indexOf("+ new profile"));
  term_type(t, "fresh");
  term_grab(t, "Enter");
  expect(t.choose.title).toBe("New profile fresh");
  expect(await said(() => t.choose.pick(0))).toEqual([{ $: "hide", to: "fresh" }]);
  expect(fs.existsSync(DIR + "/profiles/fresh")).toBe(true);
});

test("a profile open hidden in the window can't be renamed or deleted", async () => {
  const t = term();
  Screen.screen_feed(t.scr, wire_frame({ $: "roster", open: [{ profile: "work", asks: false, working: true, jobs: 0, holds: true }] }, NONCE));
  term_profile(t, "");
  t.choose.keys(t.choose.names.indexOf("work"), "Ctrl+R");
  t.choose.ask.done("job");
  await Bun.sleep(10);
  expect(note(t)).toBe("Profile work runs hidden in this window: quit illi and start it again before renaming it.");
  term_profile(t, "");
  t.choose.keys(t.choose.names.indexOf("work"), "Delete");
  t.choose.pick(1);
  await Bun.sleep(10);
  expect(note(t)).toBe("Profile work runs hidden in this window: quit illi and start it again before deleting it.");
  expect(fs.existsSync(DIR + "/profiles/work")).toBe(true);
  term_profile(t, "");
  t.choose.keys(t.choose.names.indexOf("home"), "Ctrl+R");
  t.choose.ask.done("house");
  await Bun.sleep(10);
  expect([note(t), fs.existsSync(DIR + "/profiles/house")]).toEqual(["Renamed profile home to house.", true]);
});

test("a pipe still runs in one profile", async () => {
  const t = term(false);
  expect(await said(() => term_profile_go(t, "work"))).toEqual([]);
  expect(note(t)).toBe("A pipe runs in one profile: ILLI_PROFILE=<name> picks it.");
});
