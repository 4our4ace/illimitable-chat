// Permission commands test
// ========================
// `bun test PermCommands.test.ts`. /mode lists the four modes, the one
// now marked, the setting's said; Enter switches this session's (the
// setting's own: follow it again), said in a note; a mode typed switches
// at once, one unknown says so. /permissions lists the requests refused
// (newest first), the grants (kept, then this session's) and the rules,
// each group headed; Enter on a refused one acts by why it was refused
// (the user's no: allowed this session; read-only mode's: just it, or ask
// mode; the rules': where to change them), Enter or Delete lets a grant
// go, Enter on the rules says where they are. The side lists the latest
// refused, a click opening /permissions on one; the bottom line ends with
// the mode, yolo in the theme's error.

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

// three requests refused, oldest first: illi's push the user said no to,
// a subagent's write read-only mode refused, a delete the rules refuse;
// a grant kept and one of this session
const REFUSED = [
  { id: "r1", who: "illi", tool: "shell", what: "git push --force", why: "it rewrites history", how: "no", said: "The user said no.", at: 1, exact: ["shell=git push --force"] },
  { id: "r2", who: "reviewer-2", tool: "write", what: "src/a.ts", why: "read-only mode: changing src/a.ts", how: "mode", said: "", at: 2, exact: ["write=/w/src/a.ts"] },
  { id: "r3", who: "illi", tool: "shell", what: "rm -rf /", why: "your rules refuse rm -rf /", how: "rule", said: "", at: 3, exact: [] },
] as const;
const GRANTS = [{ grant: "shell=ls", said: "ls", saved: false }, { grant: "shell:git commit *", said: "git commit *", saved: true }];

// a terminal with no screen, in auto mode as the setting says, with
// what was refused and granted
const term = (mode = "auto") => {
  const v = View.view_new();
  v.perm = { mode: mode as any, set: "auto", refused: [...REFUSED] as any, grants: GRANTS, file: DIR + "/permissions.json", broken: "" };
  return { v, scr: { tty: true, ed: Screen.ed_new() }, choose: null, question: null, wait: null, pane: null, sug: null, ver: 0, scroll: 0, notices: [], subs: new Map(), seen: { tall: 20 }, due: true, agents: [], profs: ["default"], since: 0 } as any;
};
const note = (t: any) => t.notices.at(-1)?.text ?? "";
const lit  = (t: any) => t.choose.names[t.choose.shown[t.choose.at].k];
const foot = (t: any) => t.choose.foot(t.choose.shown[t.choose.at].k);
const keys = (t: any, ...ks: string[]) => ks.forEach((k) => term_grab(t, k));

// the acts sent, without their ids
const sent = (t: any) => t.v.out.map((o: any) => o.msg).map(({ id, ...m }: any) => m);

test("/mode: the four, the one now marked, the setting's said; Enter switches this session's, the setting's own following it again", () => {
  const t = term("ask");
  term_mode(t, "");
  expect(t.choose.names).toEqual(["auto", "ask", "read-only", "yolo"]);
  expect(t.choose.aside).toEqual(["the setting's", "", "", ""]);
  expect([t.choose.here, lit(t)]).toEqual([1, "ask"]);
  keys(t, "Down", "Down", "Enter");
  expect(note(t)).toBe("Mode: yolo, this session (everything runs, but what your rules refuse or ask).");
  term_mode(t, "");
  keys(t, "Up", "Enter");
  expect(sent(t)).toEqual([{ $: "mode", mode: "yolo" }, { $: "mode", mode: null }]);
  term_mode(t, "Read-Only");
  term_mode(t, "nope");
  expect(sent(t).at(-1)).toEqual({ $: "mode", mode: "read-only" });
  expect(note(t)).toBe("No mode nope: auto, ask, read-only or yolo.");
});

test("/permissions: refused (newest first), grants (kept, then this session's), the rules, each group headed; the lit one given", () => {
  const t = term();
  term_permissions(t);
  expect(t.choose.names).toEqual(["rm -rf /", "src/a.ts", "git push --force", "git commit *", "ls", "Your rules"]);
  expect(t.choose.heads).toEqual(["Refused", "Refused", "Refused", "Kept for this project", "This session", "Rules"]);
  expect(t.choose.about.slice(0, 3)).toEqual(["your rules refuse rm -rf /", "reviewer-2: read-only mode: changing src/a.ts", "it rewrites history"]);
  expect(foot(t)).toBe("your rules refuse it: change them to allow it");
  term_permissions(t, "r1");
  expect([lit(t), foot(t)]).toEqual(["git push --force", "Enter allow it this session and tell illi"]);
});

test("Enter on a refused one acts by why: the user's no allowed this session; read-only mode's, just it or ask mode; the rules', where to change them", () => {
  const t = term();
  term_permissions(t, "r1");
  keys(t, "Enter");
  expect(sent(t)).toEqual([{ $: "allow", refused: "r1" }]);
  expect(note(t)).toBe("Allowed this session: git push --force. illi is told it may run it again.");
  term_permissions(t, "r2");
  keys(t, "Enter");
  expect([t.choose, t.question.title, t.question.names]).toEqual([null, "Read-only mode refused it", ["Allow just this, this session", "Switch to ask mode"]]);
  keys(t, "Down", "Enter");
  expect(sent(t).at(-1)).toEqual({ $: "mode", mode: "ask" });
  term_permissions(t, "r2");
  keys(t, "Enter", "Enter");
  expect(sent(t).at(-1)).toEqual({ $: "allow", refused: "r2" });
  expect(note(t)).toBe("Allowed this session: src/a.ts. reviewer-2 is told it may run it again.");
  term_permissions(t, "r3");
  keys(t, "Enter");
  expect(sent(t)).toHaveLength(3);
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

test("a grant goes by Enter or Delete; Enter on the rules says where they are and their shape", () => {
  const t = term();
  term_permissions(t);
  keys(t, "Down", "Down", "Down", "Delete");
  expect(sent(t)).toEqual([{ $: "revoke", grant: "shell:git commit *" }]);
  expect(note(t)).toBe("No longer allowed without asking: git commit *.");
  term_permissions(t);
  keys(t, "Down", "Down", "Down", "Down", "Enter");
  expect(sent(t).at(-1)).toEqual({ $: "revoke", grant: "shell=ls" });
  term_permissions(t);
  keys(t, "Up", "Enter");
  expect(t.pane?.title).toBe("Permissions");
});

test("the side lists the latest refused, newest first, a click opening /permissions on one; the bottom line ends with the mode", () => {
  const t = term();
  const side = term_side(t, 40, 40).map(([line, run]) => [line.map((r) => r.x).join("").trimEnd(), run] as const);
  const at = side.findIndex(([text]) => text === "Refused");
  expect(side.slice(at + 1, at + 4).map(([text]) => text)).toEqual(["✗ rm -rf / · your rules refuse rm -rf /", "✗ src/a.ts · read-only mode: changing sr", "✗ git push --force · it rewrites history"]);
  side[at + 3][1]!();
  expect(lit(t)).toBe("git push --force");
  const line = (v: any, w: number) => Paint.tabs_line(v, w).map((r) => r.x).join("");
  expect(line(t.v, 80)).toEndWith(" auto mode");
  expect(line(t.v, 40)).not.toContain("mode");
  const yolo = Paint.tabs_line(term("yolo").v, 80).at(-1)!;
  expect([yolo.x, yolo.s.b, yolo.s.c]).toEqual(["yolo mode", true, Draw.draw_tokens().error]);
});
