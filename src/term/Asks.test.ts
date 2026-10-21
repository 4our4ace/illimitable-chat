// Asks test
// =========
// `bun test Asks.test.ts`. A question the chat asks shows in the picker,
// what it would do in a note: Yes allows; "don't ask again" allows for
// the run; Esc says no; "No, and say why" asks a line (Esc: back to the
// picker). One gone before it is answered closes its picker; the next
// shows once the one before is gone. A pipe answers no at once. illi's
// own question (ask) shows in place of the input: Up and Down move,
// Space picks (one; several with multi), typing goes to the words of
// the user's own, Enter sends both (nothing picked: the lit option),
// Esc skips; a picker opened over it takes the keys.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-asks-");
process.env.ILLI_DIR = DIR;

const { term_asks, term_form_lines } = await import("./Asks.ts");
const { term_grab, term_type } = await import("./Keys.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal with no screen, only its view and notes
const term = (tty = true) => ({ v: View.view_new(), scr: { tty, ed: Screen.ed_new() }, choose: null, pane: null, notices: [], due: true, ver: 0, asking: null }) as any;
const note = (t: any) => t.notices.at(-1)?.text ?? "";

// the answers sent, without their message ids
const sent = (t: any) => t.v.out.map((o: any) => o.msg).filter((m: any) => m.$ === "answer").map(({ id, $, ...m }: any) => m);

// the chat's questions now: a state, then a paint
const asks = (t: any, ...qs: Array<[string, string, string]>) => {
  t.v.asks = qs.map(([id, tool, what]) => ({ id, who: "illi", tool, what }));
  term_asks(t);
};

// illi's own question, with three options
const own = (t: any, multi = false) => {
  t.v.asks = [{ id: "a1", who: "illi", tool: "ask", what: "Which database?", options: [{ label: "Postgres", about: "you know it" }, { label: "SQLite", about: "" }, { label: "MySQL", about: "" }], multi }];
  term_asks(t);
};
const text = (t: any) => term_form_lines(t, 60, 4)!.lines.map((l: any) => l.map((r: any) => r.x).join("").trimEnd());

test("a question shows in the picker with a note; Enter on Yes allows it, once", () => {
  const t = term();
  asks(t, ["q1", "Bash", "rm -r build"]);
  expect(note(t)).toBe("illi asks to use Bash: rm -r build");
  expect(t.choose.title).toBe("Allow Bash?");
  expect(t.choose.names).toEqual(["Yes", "Yes, and don't ask again for Bash this run", "No", "No, and say why"]);
  expect(t.choose.foot(0)).toBe("rm -r build");
  term_grab(t, "Enter");
  expect(sent(t)).toEqual([{ ask: "q1", yes: true, always: false, said: "" }]);
  expect(t.choose).toBeNull();
  term_asks(t);
  expect(t.choose).toBeNull();
  asks(t);
  expect(t.asking).toBeNull();
});

test("don't ask again allows for the run; Esc says no", () => {
  const t = term();
  asks(t, ["q1", "Bash", "ls"]);
  term_grab(t, "Down");
  term_grab(t, "Enter");
  asks(t, ["q2", "Write", "a.txt"]);
  term_grab(t, "Esc");
  expect(sent(t)).toEqual([{ ask: "q1", yes: true, always: true, said: "" }, { ask: "q2", yes: false, always: false, said: "" }]);
  expect(t.choose).toBeNull();
});

test("No, and say why asks a line for the model; Esc there goes back to the picker", () => {
  const t = term();
  asks(t, ["q1", "Bash", "rm -r build"]);
  ["Down", "Down", "Down", "Enter"].forEach((key) => term_grab(t, key));
  expect(t.choose.title).toBe("Why not Bash?");
  term_grab(t, "Esc");
  term_asks(t);
  expect(t.choose.title).toBe("Allow Bash?");
  ["Down", "Down", "Down", "Enter"].forEach((key) => term_grab(t, key));
  term_type(t, "use the clean script");
  term_grab(t, "Enter");
  expect(sent(t)).toEqual([{ ask: "q1", yes: false, always: false, said: "use the clean script" }]);
  expect(t.choose).toBeNull();
});

test("one gone before it is answered closes its picker, the next one shown; another picker is left alone", () => {
  const t = term();
  asks(t, ["q1", "Bash", "ls"], ["q2", "Edit", "src/a.ts"]);
  expect(t.choose.title).toBe("Allow Bash?");
  asks(t, ["q2", "Edit", "src/a.ts"]);
  expect(t.choose.title).toBe("Allow Edit?");
  expect(note(t)).toBe("illi asks to use Edit: src/a.ts");
  const mine = { title: "Pick a model" };
  t.choose = mine;
  asks(t);
  expect(t.choose).toBe(mine);
  expect(sent(t)).toEqual([]);
});

test("a question that comes while another picker is open waits for it", () => {
  const t = term();
  const mine = { title: "Pick a model" };
  t.choose = mine;
  asks(t, ["q1", "Bash", "ls"]);
  expect(t.choose).toBe(mine);
  t.choose = null;
  term_asks(t);
  expect(t.choose.title).toBe("Allow Bash?");
});

test("a pipe has no one to ask: no, at once", () => {
  const t = term(false);
  asks(t, ["q1", "Bash", "ls"]);
  expect(t.choose).toBeNull();
  expect(sent(t)).toEqual([{ ask: "q1", yes: false, always: false, said: "" }]);
  term_asks(t);
  expect(sent(t)).toHaveLength(1);
});

test("illi's own question shows in place of the input: the question, its options, a row for words of the user's own, the keys", () => {
  const t = term();
  own(t);
  expect([t.choose, t.notices]).toEqual([null, []]);
  expect(text(t)).toEqual(["illi asks", "Which database?", "› ○ Postgres  you know it", "  ○ SQLite", "  ○ MySQL", "  > Something else: type your own", "↑↓ move · Space pick · type your own · Enter send · Esc skip"]);
  expect(term_form_lines(t, 60, 4)!.at).toEqual({ row: 5, col: 4 });
});

test("Space picks one option, typing goes to the words; Enter sends both", () => {
  const t = term();
  own(t);
  term_grab(t, "Down");
  term_type(t, " ");
  term_grab(t, "Down");
  term_type(t, " ");
  expect(text(t).slice(2, 5)).toEqual(["  ○ Postgres  you know it", "  ○ SQLite", "› ● MySQL"]);
  term_type(t, "with replicas");
  term_grab(t, "Ctrl+W");
  expect(text(t)[5]).toBe("› > with");
  term_type(t, "backups");
  term_grab(t, "Enter");
  expect(sent(t)).toEqual([{ ask: "a1", yes: true, always: false, said: "picked: MySQL\nwrote: with backups" }]);
  expect(term_form_lines(t, 60, 4)).toBeNull();
});

test("with multi, Space picks several; nothing picked, Enter sends the lit option; on the words' row with none, nothing", () => {
  const t = term();
  own(t, true);
  term_type(t, " ");
  term_grab(t, "Down");
  term_grab(t, "Down");
  term_type(t, " ");
  expect(text(t).slice(0, 5)).toEqual(["illi asks · pick any", "Which database?", "  ■ Postgres  you know it", "  □ SQLite", "› ■ MySQL"]);
  term_grab(t, "Enter");
  expect(sent(t)).toEqual([{ ask: "a1", yes: true, always: false, said: "picked: Postgres, MySQL" }]);
  const u = term();
  own(u);
  term_grab(u, "Up");
  term_grab(u, "Enter");
  expect(sent(u)).toEqual([]);
  term_grab(u, "Up");
  term_grab(u, "Enter");
  expect(sent(u)).toEqual([{ ask: "a1", yes: true, always: false, said: "picked: MySQL" }]);
});

test("Esc skips illi's question; a picker opened over it takes the keys first", () => {
  const t = term();
  own(t);
  t.choose = { names: ["x"], shown: [{ k: 0, at: [] }], at: 0, keys: () => false, find: null, ask: null, pick: () => {} };
  term_grab(t, "Esc");
  expect([t.choose, sent(t)]).toEqual([null, []]);
  term_grab(t, "Esc");
  expect(sent(t)).toEqual([{ ask: "a1", yes: false, always: false, said: "" }]);
});
