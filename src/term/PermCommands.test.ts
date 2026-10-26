// Permission commands test
// ========================
// `bun test PermCommands.test.ts`. /mode lists the two modes, the one
// now marked, the setting's said; Enter switches this session's (the
// setting's own: follow it again), said in a note; a mode typed switches
// at once, one unknown says so. /permissions lists the requests refused
// (newest first), the approvals (saved, then this session's) and the
// rules, each group headed; Enter on a refused one acts by why it was
// refused (the user's no: allowed this session; the rules': where to
// change them), Enter or Delete lets an approval go, Enter on the rules
// says where they are. The side lists the latest refused, a click
// opening /permissions on one; the bottom line ends with trust mode, in
// the theme's error, and says nothing of the default.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-perm-commands-");
process.env.ILLI_DIR = DIR;

const { term_mode, term_permissions } = await import("./PermCommands.ts");
const { term_grab } = await import("./Keys.ts");
const { term_side } = await import("./Side.ts");
const Draw = await import("../ui/Draw.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// three requests refused, oldest first: illi's read the user said no to
// with words, a subagent's write it said a plain no to, a delete the
// rules refuse; an approval saved and one of this session
const REFUSED = [
  { id: "r1", who: "illi", tool: "shell", what: "cat ~/notes/a.md", why: "it reaches outside the project: ~/notes/", how: "no", said: "The user said no.", at: 1, exact: [{ action: "external_directory", resource: "/home/me/notes/*" }] },
  { id: "r2", who: "reviewer-2", tool: "write", what: "/etc/a.conf", why: "it reaches outside the project: /etc/", how: "stop", said: "The user said no, asked at illi's screen.", at: 2, exact: [{ action: "external_directory", resource: "/etc/*" }] },
  { id: "r3", who: "illi", tool: "shell", what: "rm -rf /", why: "your rule denies rm -rf /*", how: "rule", said: "", at: 3, exact: [] },
] as const;
const GRANTS = [{ action: "external_directory", resource: "/tmp/*", said: "files in /tmp/", saved: false }, { action: "shell", resource: "git commit *", said: "git commit *", saved: true }];

// a terminal with no screen, in the default mode as the setting says,
// with what was refused and approved
const term = (mode = "default") => {
  const v = View.view_new();
  v.perm = { mode: mode as any, set: "default", refused: [...REFUSED] as any, grants: GRANTS, file: DIR + "/permissions.json", broken: "" };
  return { v, scr: { tty: true, ed: Screen.ed_new() }, choose: null, question: null, wait: null, pane: null, sug: null, ver: 0, scroll: 0, notices: [], subs: new Map(), seen: { tall: 20 }, due: true, agents: [], profs: ["default"], since: 0 } as any;
};
const note = (t: any) => t.notices.at(-1)?.text ?? "";
const lit  = (t: any) => t.choose.names[t.choose.shown[t.choose.at].k];
const foot = (t: any) => t.choose.foot(t.choose.shown[t.choose.at].k);
const keys = (t: any, ...ks: string[]) => ks.forEach((k) => term_grab(t, k));

// the acts sent, without their ids
const sent = (t: any) => t.v.out.map((o: any) => o.msg).map(({ id, ...m }: any) => m);

test("/mode: the two, the one now marked, the setting's said; Enter switches this session's, the setting's own following it again", () => {
  const t = term("trust");
  term_mode(t, "");
  expect(t.choose.names).toEqual(["default", "trust"]);
  expect(t.choose.aside).toEqual(["the setting's", ""]);
  expect(t.choose.about).toEqual(["all runs but folders outside, .env reads, what rules ask", "all runs but what your rules deny"]);
  expect([t.choose.here, lit(t)]).toEqual([1, "trust"]);
  keys(t, "Up", "Enter");
  expect(note(t)).toBe("Mode: default, this session (all runs but folders outside, .env reads, what rules ask).");
  term_mode(t, "");
  keys(t, "Enter");
  expect(sent(t)).toEqual([{ $: "mode", mode: null }, { $: "mode", mode: "trust" }]);
  term_mode(t, "Trust");
  expect(sent(t).at(-1)).toEqual({ $: "mode", mode: "trust" });
  expect(note(t)).toBe("Mode: trust, this session (all runs but what your rules deny).");
  term_mode(t, "yolo");
  expect(note(t)).toBe("No mode yolo: default or trust.");
});

test("/permissions: refused (newest first), approvals (saved, then this session's), the rules, each group headed; the lit one given", () => {
  const t = term();
  term_permissions(t);
  expect(t.choose.names).toEqual(["rm -rf /", "/etc/a.conf", "cat ~/notes/a.md", "git commit *", "files in /tmp/", "Your rules"]);
  expect(t.choose.heads).toEqual(["Refused", "Refused", "Refused", "Saved for this project", "This session", "Rules"]);
  expect(t.choose.about.slice(0, 5)).toEqual(["your rule denies rm -rf /*", "reviewer-2: it reaches outside the project: /etc/", "it reaches outside the project: ~/notes/", "shell git commit *", "external_directory /tmp/*"]);
  expect(foot(t)).toBe("your rules refuse it: change them to allow it");
  term_permissions(t, "r1");
  expect([lit(t), foot(t)]).toEqual(["cat ~/notes/a.md", "Enter allow it this session and tell illi"]);
});

test("Enter on a refused one acts by why: the user's no (a plain one too) allowed this session; the rules', where to change them", () => {
  const t = term();
  term_permissions(t, "r1");
  keys(t, "Enter");
  expect(sent(t)).toEqual([{ $: "allow", refused: "r1" }]);
  expect(note(t)).toBe("Allowed this session: cat ~/notes/a.md. illi is told it may run it again.");
  term_permissions(t, "r2");
  keys(t, "Enter");
  expect(sent(t).at(-1)).toEqual({ $: "allow", refused: "r2" });
  expect(note(t)).toBe("Allowed this session: /etc/a.conf. reviewer-2 is told it may run it again.");
  term_permissions(t, "r3");
  keys(t, "Enter");
  expect(sent(t)).toHaveLength(2);
  expect(note(t)).toBe("Your rules refuse rm -rf /: change them in " + DIR + "/permissions.json to allow it.");
});

test("one asked each time (a hook asked it: nothing to allow) says so, and how to run it; nothing is sent", () => {
  const t = term();
  t.v.perm.refused.push({ id: "r4", who: "illi", tool: "shell", what: "make deploy", why: "your PreToolUse hook asks", how: "no", said: "", at: 4, exact: [] });
  term_permissions(t, "r4");
  expect(foot(t)).toBe("asked each time: have it run again, and say yes");
  keys(t, "Enter");
  expect(sent(t)).toEqual([]);
  expect(note(t)).toBe("make deploy is asked each time (your PreToolUse hook asks): have it run again, and say yes.");
});

test("an approval goes by Enter or Delete; Enter on the rules says where they are and their shape", () => {
  const t = term();
  term_permissions(t);
  keys(t, "Down", "Down", "Down", "Delete");
  expect(sent(t)).toEqual([{ $: "revoke", action: "shell", resource: "git commit *" }]);
  expect(note(t)).toBe("No longer allowed without asking: git commit *.");
  term_permissions(t);
  keys(t, "Down", "Down", "Down", "Down", "Enter");
  expect(sent(t).at(-1)).toEqual({ $: "revoke", action: "external_directory", resource: "/tmp/*" });
  term_permissions(t);
  keys(t, "Up", "Enter");
  expect(t.pane?.title).toBe("Permissions");
});

test("the side lists the latest refused, newest first, a click opening /permissions on one; the bottom line ends with trust mode, the default unsaid", () => {
  const t = term();
  const side = term_side(t, 40, 40).map(([line, run]) => [line.map((r) => r.x).join("").trimEnd(), run] as const);
  const at = side.findIndex(([text]) => text === "Refused");
  expect(side.slice(at + 1, at + 4).map(([text]) => text)).toEqual(["✗ rm -rf / · your rule denies rm -rf /*", "✗ /etc/a.conf · it reaches outside the p", "✗ cat ~/notes/a.md · it reaches outside"]);
  side[at + 3][1]!();
  expect(lit(t)).toBe("cat ~/notes/a.md");
  const line = (v: any, w: number) => Paint.tabs_line(v, w).map((r) => r.x).join("");
  expect(line(t.v, 80)).not.toContain("mode");
  expect(line(term("trust").v, 80)).toEndWith(" trust mode");
  expect(line(term("trust").v, 40)).not.toContain("mode");
  const trust = Paint.tabs_line(term("trust").v, 80).at(-1)!;
  expect([trust.x, trust.s.b, trust.s.c]).toEqual(["trust mode", true, Draw.draw_tokens().error]);
});
