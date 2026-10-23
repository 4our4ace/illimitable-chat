// Background test
// ===============
// `bun test Background.test.ts`. The background jobs as the terminal
// shows them: a section of the side (three, then how many more), the
// bottom line's count once the side doesn't show them whole; /background
// lists them, Enter or Del stops one (none: says what they are). A quit
// asked for while they run or subagents work says what it stops first;
// a profile switch asks, and staying makes no profile.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import type { Background } from "../ui/View.ts";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-background-");
process.env.ILLI_DIR = DIR;
delete process.env.ILLI_PROFILE;
fs.mkdirSync(DIR + "/profiles/work", { recursive: true });

const { term_commands } = await import("./Commands.ts");
const { term_clear, term_grab, term_type } = await import("./Keys.ts");
const { term_profile_go, term_profile } = await import("./ProfileCommands.ts");
const { term_side_drawn } = await import("./Side.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

const MIN = 60000;

// a terminal with no screen, running the chat (a view of another
// terminal's: chat null), the jobs given running; a paint always due
const term = (jobs: Background[], chat: object | null = { busy: false }) => {
  const v = { ...View.view_new(), background: jobs };
  return { v, chat, scr: { tty: true, ed: Screen.ed_new() }, choose: null, pane: null, sug: null, notices: [], agents: [], profs: ["default"], subs: new Map(), since: Date.now(), todo: false, quit: 0, due: true, ver: 0 } as any;
};

// a job, started `ago` ms back
const job = (id: number, command: string, agent = "illi", ago = 0): Background => ({ id, command, agent, since: Date.now() - ago });

// the side's lines as text (blank ones left out), each with its click
const side = (t: any, tall = 40) => term_side_drawn(t, 30, tall).items.map(([line, run]) => [line.map((r) => r.x).join("").trim(), run] as const).filter(([text]) => text !== "");

// a command typed; the messages sent, ids left out; the last note, toast
const run   = (t: any, name: string) => term_commands().find(([use]) => use.split(" ")[0] === name)![3](t, "");
const sent  = (t: any) => t.v.out.map((p: any) => { const { id, ...msg } = p.msg; return msg; });
const note  = (t: any) => t.notices.filter((n: any) => !n.toast).at(-1)?.text ?? "";
const toast = (t: any) => t.notices.filter((n: any) => n.toast).at(-1)?.text ?? "";

test("the side shows the jobs under Background, three and how many more, each its command and age; a click opens /background; cut short, it says so", () => {
  const two  = term([job(1, "npm run dev", "illi", 4 * MIN), job(2, "tail -f\n  x.log", "reviewer")]);
  const at   = side(two).findIndex(([text]) => text === "Background");
  expect(side(two).slice(at + 1, at + 3).map(([text]) => text)).toEqual(["● npm run dev  4m", "● tail -f x.log  <1m"]);
  expect(term_side_drawn(two, 30, 40).background).toBe(true);
  side(two)[at][1]!();
  expect(two.choose.title).toBe("Background jobs");
  const five = term([1, 2, 3, 4, 5].map((k) => job(k, "sleep " + k, "illi", 3 * 60 * MIN)));
  const from = side(five).findIndex(([text]) => text === "Background");
  expect(side(five).slice(from + 1, from + 5).map(([text]) => text)).toEqual(["● sleep 1  3h", "● sleep 2  3h", "● sleep 3  3h", "… 2 more"]);
  expect([term_side_drawn(five, 30, 5).background, term_side_drawn(term([]), 30, 40).background]).toEqual([false, true]);
});

test("the bottom line counts the jobs before the mode, only where the side doesn't show them; a narrow one doesn't", () => {
  const t    = term([job(1, "npm run dev"), job(2, "tail -f x.log")]);
  const text = (jobs: boolean, w = 80) => Paint.tabs_line(t.v, w, true, jobs).map((r) => r.x).join("");
  expect(text(true)).toEndWith("● 2 in background · auto mode");
  expect(text(false)).not.toContain("background");
  expect(text(true, 40)).not.toContain("background");
  expect(Paint.tabs_line(term([]).v, 80, true, true).map((r) => r.x).join("")).not.toContain("background");
});

test("/background lists each job, who started it and its age; Enter or Del stops one; none: what they are", () => {
  const none = term([]);
  run(none, "/background");
  expect([none.choose, note(none)]).toEqual([null, "No background jobs: a shell call that leaves a process running (a dev server, a watcher) shows here, and it stops when illi quits."]);
  const t = term([job(4, "npm run dev", "illi", 12 * MIN), job(7, "tail -f x.log", "reviewer")]);
  run(t, "/background");
  expect([t.choose.names, t.choose.about]).toEqual([["npm run dev", "tail -f x.log"], ["illi · 12m", "reviewer · <1m"]]);
  term_grab(t, "Enter");
  expect([sent(t), note(t), t.choose]).toEqual([[{ $: "background", stop: 4 }], "Stopped: npm run dev.", null]);
  run(t, "/background");
  expect(t.choose.keys(1, "Delete")).toBe(true);
  expect([sent(t).at(-1), note(t), t.choose]).toEqual([{ $: "background", stop: 7 }, "Stopped: tail -f x.log.", null]);
});

test("a quit asked for while jobs run or subagents work says what it stops first (Ctrl+D too); a view's quit stops nothing, so says nothing more", () => {
  const t = term([job(1, "npm run dev"), job(2, "tail -f x.log")]);
  t.v.agents = ["reviewer"];
  term_clear(t, "Ctrl+D");
  expect(toast(t)).toBe("Ctrl+D again to quit · stops 2 background jobs (/background) · 1 subagent pauses till the next start");
  expect(t.quit).toBeGreaterThan(0);
  const one = term([job(1, "npm run dev")]);
  term_clear(one, "Ctrl+C");
  expect(toast(one)).toBe("Ctrl+C again to quit · stops 1 background job (/background)");
  const view = term([job(1, "npm run dev")], null);
  term_clear(view, "Ctrl+C");
  expect(toast(view)).toBe("Ctrl+C again to quit · what runs stops, and goes on at the next start");
});

test("a profile switch while jobs run asks first, naming them; staying switches nothing, and a new profile isn't made", async () => {
  const t = term([job(1, "npm run dev"), job(2, "tail -f x.log")]);
  await term_profile_go(t, "work");
  expect([t.choose.title, t.choose.names, t.choose.lead[0][0].x]).toEqual(["Switch to work?", ["Stay", "Switch and stop them"], "2 background jobs run, and a switch stops them: npm run dev, tail -f x.log"]);
  term_grab(t, "Enter");
  expect(t.choose).toBeNull();
  term_profile(t, "");
  term_grab(t, "Down");
  term_grab(t, "Down");
  term_grab(t, "Enter");
  term_type(t, "fresh");
  term_grab(t, "Enter");
  term_grab(t, "Enter");
  await Bun.sleep(10);
  expect(t.choose?.title).toBe("Switch to fresh?");
  term_grab(t, "Enter");
  expect([t.choose, fs.existsSync(DIR + "/profiles/fresh")]).toEqual([null, false]);
});
