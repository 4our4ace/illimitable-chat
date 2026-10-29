// Member test
// ===========
// `bun test Member.test.ts`. illi as one profile of a window: ILLI_WINDOW
// is gone from its environment once it loads, and back for a restart in
// place, shown or hidden as it is (alone, `off` as found, so illi stays
// alone); it says who it is, and its state only as it changes; hidden
// for a switch, it paints nothing, its status line stopped and a login
// let go (a press a popup took too, the pointer's place and a click
// waiting; a question shown holds its keys anew once shown again), then
// says `hide`; Ctrl+Z hides it too, the login kept, and says
// `suspend`; shown by a switch, it is up, paints whole and is kept as the
// profile used last (anywhere, and in the project); the roster notes
// another's question and its work done, once each, and the window's own
// note (one told while it started, once it's up); the person's quit
// tells the window once; `end` leaves a quit under way alone.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR   = fs.mkdtempSync(os.tmpdir() + "/illi-member-");
const NONCE = "0123456789abcdef0123456789abcdef";
process.env.ILLI_DIR    = DIR;
process.env.ILLI_WINDOW = "1:" + NONCE + ":shown";
delete process.env.ILLI_PROFILE;

const { WIN, member_env, member_hello, member_hide, member_quit, member_screen, member_state, member_attach } = await import("./Member.ts");
const Screen = await import("../ui/Screen.ts");
const { status_new } = await import("./Status.ts");
const View = await import("../ui/View.ts");
const { wire_cut, wire_frame } = await import("./Wire.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// the messages a call wrote to the window, and the bytes besides
const said = (run: () => void) => {
  const out: string[] = [];
  const write = process.stdout.write;
  process.stdout.write = ((s: string) => out.push(s)) as any;
  try {
    run();
  } finally {
    process.stdout.write = write;
  }
  const parts = wire_cut("", out.join(""), NONCE).parts;
  return { msgs: parts.filter((p) => typeof p !== "string"), bytes: parts.filter((p) => typeof p === "string").join("") };
};

// a terminal with a screen in the window, no paint due
const term = () => {
  const scr: any = { tty: true, kitty: false, ed: Screen.ed_new(), rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, grab: null, on: () => {}, win: member_screen() };
  const t: any = { v: View.view_new(), scr, chat: {}, status: status_new(), login: new AbortController(), sel: { key: "chat" }, lead: true, drift: undefined, pointed: true, wait: null, notices: [], due: true, quitting: false, profs: [], asking: { id: "q", c: null, done: false, form: null, shown: 1 }, aim: { row: 0, in: true, press: { of: null, on: "box" }, first: null } };
  member_attach(t);
  return t;
};
const notes = (t: any) => t.notices.map((n: any) => n.text);

test("ILLI_WINDOW is gone from the environment once illi loads, and back for a restart in place, shown or hidden as it is", () => {
  expect(process.env.ILLI_WINDOW).toBeUndefined();
  expect([WIN?.how, WIN?.shown]).toEqual(["shown", true]);
  expect(member_env()).toEqual({ ILLI_WINDOW: "1:" + NONCE + ":shown" });
});

test("alone (ILLI_WINDOW=off), ILLI_WINDOW is gone from the environment too, and back as found for a restart in place, so illi stays alone", () => {
  const code = "const { WIN, member_env } = await import(" + JSON.stringify(new URL("./Member.ts", import.meta.url).pathname) + "); console.log(JSON.stringify([WIN, member_env(), process.env.ILLI_WINDOW ?? null]));";
  const run  = Bun.spawnSync([process.execPath, "-e", code], { env: { ...process.env, ILLI_DIR: DIR, ILLI_WINDOW: "off" } });
  expect(JSON.parse(run.stdout.toString())).toEqual([null, { ILLI_WINDOW: "off" }, null]);
});

test("it says who it is; its state only as it changes", () => {
  expect(said(() => member_hello()).msgs).toEqual([{ $: "hello", v: 1, pid: process.pid, profile: "default", root: DIR }]);
  const t = term();
  expect(said(() => member_state(t)).msgs).toEqual([{ $: "state", asks: false, working: false, jobs: 0, holds: true }]);
  expect(said(() => member_state(t)).msgs).toEqual([]);
  t.v.busy = true;
  t.v.background = [{ id: 1, command: "npm run dev", agent: "illi", since: 0 }];
  expect(said(() => member_state(t)).msgs).toEqual([{ $: "state", asks: false, working: true, jobs: 1, holds: true }]);
});

test("hidden for a switch, it paints nothing, its status line stopped and a login let go, then says hide; shown by a switch, it is up, paints whole and is kept as the profile used last", async () => {
  const t = term();
  const login = t.login;
  t.status.set = { command: "x" };
  t.wait = { key: "#3", timer: setTimeout(() => (t.folded = true), 0) };
  expect(said(() => member_hide(t, "work")).msgs).toEqual([{ $: "hide", to: "work" }]);
  expect([t.scr.hidden, t.status.set, login.signal.aborted, t.sel, t.lead, WIN?.shown]).toEqual([true, null, true, null, false, false]);
  expect([t.aim.press, t.asking.shown, t.pointed, t.wait]).toEqual([null, null, false, null]);
  await Bun.sleep(5);
  expect(t.folded).toBeUndefined();
  expect(member_env()).toEqual({ ILLI_WINDOW: "1:" + NONCE + ":hidden" });
  let painted = 0;
  t.scr.on = () => painted++;
  const shown = said(() => Screen.screen_feed(t.scr, wire_frame({ $: "show", switch: true, note: "Not switched: x." }, NONCE)));
  expect(shown.msgs).toEqual([{ $: "up" }]);
  expect(shown.bytes.startsWith("\x1b[?u\x1b]11;?")).toBe(true);
  expect([t.scr.hidden, WIN?.shown, painted > 0, notes(t)]).toEqual([false, true, true, ["Not switched: x."]]);
  expect(fs.readFileSync(DIR + "/profile", "utf8")).toBe("default\n");
  expect(Object.values(JSON.parse(fs.readFileSync(DIR + "/project-profiles.json", "utf8")))).toEqual(["default"]);
});

test("Ctrl+Z hides it, a device login waiting kept, and tells the window, which shows it again as it comes back", () => {
  const t = term();
  const login = t.login;
  t.status.set = { command: "x" };
  expect(said(() => Screen.screen_suspend(t.scr)).msgs).toEqual([{ $: "suspend" }]);
  expect([t.scr.hidden, t.status.set, login.signal.aborted, WIN?.shown]).toEqual([true, null, false, false]);
  expect(said(() => Screen.screen_feed(t.scr, wire_frame({ $: "show" }, NONCE))).msgs).toEqual([{ $: "up" }]);
  expect([t.scr.hidden, WIN?.shown]).toEqual([false, true]);
});

test("the roster notes another profile's question and its work done, once each, and the window's own note", () => {
  const t = term();
  const roster = (open: object[], note?: string) => Screen.screen_feed(t.scr, wire_frame({ $: "roster", open: open as any, ...(note === undefined ? {} : { note }) }, NONCE));
  const work = (o: object) => ({ profile: "work", asks: false, working: false, jobs: 0, holds: true, ...o });
  const told = (open: object[], note?: string) => {
    t.notices = [];
    roster(open, note);
    return notes(t);
  };
  expect(told([work({ working: true })])).toEqual([]);
  expect(told([work({ working: true, asks: true })])).toEqual(["illi in profile work asks you something: /profile work answers it."]);
  expect(told([work({ working: true, asks: true })])).toEqual([]);
  expect(told([work({ working: false })])).toEqual(["illi in profile work is done."]);
  expect(told([work({ working: false })], "illi in profile home ended.")).toEqual(["illi in profile home ended."]);
});

test("the others open, told while it started, are heard once its terminal is up: a question waiting noted", () => {
  const t = term();
  WIN!.t = null;
  Screen.screen_feed(t.scr, wire_frame({ $: "roster", open: [{ profile: "work", asks: true, working: true, jobs: 0, holds: true }] }, NONCE));
  expect(notes(t)).toEqual([]);
  member_attach(t);
  expect(notes(t)).toEqual(["illi in profile work asks you something: /profile work answers it."]);
});

test("the person's quit tells the window once; `end` leaves a quit under way alone", () => {
  const t = term();
  t.quitting = true;
  expect(said(() => member_quit()).msgs).toEqual([{ $: "quit" }]);
  expect(said(() => member_quit()).msgs).toEqual([]);
  expect(said(() => Screen.screen_feed(t.scr, wire_frame({ $: "end" }, NONCE))).msgs).toEqual([]);
  expect(WIN?.ended).toBe(true);
});
