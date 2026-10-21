// Asks test
// =========
// `bun test Asks.test.ts`. A question the chat asks shows in the picker,
// what it would do in a note: Yes allows; "don't ask again" allows for
// the run; Esc says no; "No, and say why" asks a line (Esc: back to the
// picker). One gone before it is answered closes its picker; the next
// shows once the one before is gone. A pipe answers no at once.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-asks-");
process.env.ILLI_DIR = DIR;

const { term_asks } = await import("./Asks.ts");
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

test("a question shows in the picker with a note; Enter on Yes allows it, once", () => {
  const t = term();
  asks(t, ["q1", "Bash", "rm -r build"]);
  expect(note(t)).toBe("illi asks to use Bash: rm -r build");
  expect(t.choose.title).toBe("Allow Bash?");
  expect(t.choose.names).toEqual(["Yes", "Yes, and don't ask again for Bash this run", "No", "No, and say why"]);
  term_grab(t, "Enter");
  expect(sent(t)).toEqual([{ ask: "q1", yes: true, always: false, why: "" }]);
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
  expect(sent(t)).toEqual([{ ask: "q1", yes: true, always: true, why: "" }, { ask: "q2", yes: false, always: false, why: "" }]);
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
  expect(sent(t)).toEqual([{ ask: "q1", yes: false, always: false, why: "use the clean script" }]);
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
  expect(sent(t)).toEqual([{ ask: "q1", yes: false, always: false, why: "" }]);
  term_asks(t);
  expect(sent(t)).toHaveLength(1);
});
