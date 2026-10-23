// Keys test
// =========
// `bun test Keys.test.ts`. The suggested reply, fed keys as a terminal
// sends them: the empty input shows it as its hint, dim, the cursor at its
// start (on an agent's page, none); Tab puts it in the input, not sent;
// anything typed dismisses it, even erased, till the next one comes; with
// none shown, Tab does nothing; the picker keeps its Tab. On an agent's
// page, Esc twice and Ctrl+C still interrupt illi (one Esc says a second
// does; with no turn, it interrupts nothing); Enter on an empty input
// does nothing, anywhere; a message or a chat's
// command typed there comes back to the input, a note saying why. Ctrl+C
// closes a picker, as Esc does. Shift+Tab goes back to illi's own agent
// from one that can't run. A key runs the command whose keys name it.
// The terminal's background told lays the chat out again only when it
// changed. A popup has every key but Ctrl+L, Ctrl+Z, Ctrl+P and the
// leader: under a picker PgUp, PgDn, Ctrl+Home and Ctrl+End move its lit
// row, never the chat (Home and End edit its search, or move without
// one); keys it doesn't use do nothing; Ctrl+D closes it, the input
// kept; Ctrl+P closes the palette it opened; a question takes Down and
// Enter over the commands suggested; a paste goes to its search as one
// line (none: nowhere), never the input. The leader let go by the wheel
// passes it on to what has it.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-keys-");
process.env.ILLI_DIR = DIR;

const { term_asks } = await import("./Asks.ts");
const { term_paste } = await import("./Attach.ts");
const { term_chooser } = await import("./Commands.ts");
const { term_grab, term_hint, term_next, term_press, term_type } = await import("./Keys.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal with a screen fed by hand (a kitty terminal), the chat's
// view the suggested reply came to; a paint always due, so none is asked
// for
function term(suggest: string): any {
  const t: any = { v: { ...View.view_new(), suggest }, dropped: "", sel: null, due: true, sug: null, choose: null, pane: null, notices: [], agents: [], quit: 0, ver: 0, scroll: 0, subs: new Map(), pending: 0, asking: null, box: null, lead: false };
  t.scr = { tty: true, kitty: false, ed: Screen.ed_new(), rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, grab: (k: string) => term_grab(t, k), on: (k: string) => term_press(t, k), type: (x: string) => term_type(t, x) };
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

test("anything typed dismisses the suggested reply, even erased, till the next one comes or a message of one's own goes; sent, it stays hidden", () => {
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
  Screen.screen_feed(t.scr, "also fix the typo\r");
  expect([t.scr.ed.text, term_hint(t)]).toEqual(["", "Commit it"]);
  Screen.screen_feed(t.scr, "\t");
  expect(t.scr.ed.text).toBe("Commit it");
  Screen.screen_feed(t.scr, "\r");
  expect([t.scr.ed.text, term_hint(t)]).toEqual(["", ""]);
});

test("a key runs the command whose keys name it, the second of its keys too", () => {
  const t = term("");
  t.seen = { tall: 20 };
  Screen.screen_feed(t.scr, "\x1b[5~");
  expect(t.scroll).toBe(18);
  Screen.screen_feed(t.scr, "\x1b[6~");
  expect(t.scroll).toBe(0);
});

test("the picker keeps its Tab while a suggested reply shows", () => {
  const t = term("Run the tests");
  term_chooser(t, "Agent", ["illi", "reviewer"], ["", ""], 0, () => {});
  Screen.screen_feed(t.scr, "\t");
  expect(t.choose.at).toBe(1);
  expect(t.scr.ed.text).toBe("");
  expect(term_hint(t)).toBe("Run the tests");
});

// the messages sent to the chat, each without its id; the last note
const sent = (t: any) => t.v.out.map((p: any) => { const { id, ...msg } = p.msg; return msg; });
const note = (t: any) => t.notices.filter((n: any) => !n.toast).at(-1)?.text ?? "";

test("on an agent's page, Esc twice and Ctrl+C interrupt illi's turn; Enter on an empty input, on any page, does nothing", () => {
  for (const key of ["\x1b[27u\x1b[27u", "\x03"]) {
    const t = term("");
    t.v.busy = true;
    t.v.page = { name: "reviewer", log: [], live: [] };
    Screen.screen_feed(t.scr, key);
    expect([key, sent(t)]).toEqual([key, [{ $: "stop", name: View.TURN }]]);
  }
  for (const page of [null, { name: "reviewer", log: [], live: [] }]) {
    const t = term("Commit it");
    Object.assign(t.v, { busy: true, page });
    Screen.screen_feed(t.scr, "\r");
    expect(sent(t)).toEqual([]);
  }
});

test("one Esc says a second interrupts, and a second does; with no turn running, Esc interrupts nothing", () => {
  const t = term("");
  t.v.busy = true;
  Screen.screen_feed(t.scr, "\x1b[27u");
  expect(sent(t)).toEqual([]);
  expect(t.notices.at(-1).text).toBe("Esc again to interrupt");
  Screen.screen_feed(t.scr, "\x1b[27u");
  expect(sent(t)).toEqual([{ $: "stop", name: View.TURN }]);
  const idle = term("");
  Screen.screen_feed(idle.scr, "\x1b[27u\x1b[27u");
  expect(sent(idle)).toEqual([]);
});

test("on an agent's page, a message or a chat's command comes back to the input, a note saying why", () => {
  for (const typed of ["hello", "/compact", "/goal fix it", "/halt", "/clear"]) {
    const t = term("");
    t.v.page = { name: "reviewer", log: [], live: [] };
    Screen.screen_feed(t.scr, typed + "\r");
    expect([typed, t.scr.ed.text, sent(t)]).toEqual([typed, typed, []]);
    expect(note(t)).toMatch(/^Messages go to illi/);
  }
});

test("Ctrl+C closes a picker, as Esc does: no interrupt, no quit armed", () => {
  const t = term("");
  t.v.busy = true;
  term_chooser(t, "Agent", ["illi", "reviewer"], ["", ""], 0, () => {});
  Screen.screen_feed(t.scr, "\x03");
  expect([t.choose, t.quit, sent(t)]).toEqual([null, 0, []]);
});

test("Shift+Tab goes back to illi's own agent from one that can't run; with none to go to, a note", () => {
  const t = term("");
  t.v.agent = "gone";
  term_next(t);
  expect(sent(t)).toEqual([{ $: "main", name: null }]);
  const own = term("");
  term_next(own);
  expect([sent(own), note(own)]).toEqual([[], expect.stringMatching(/^No primary agents yet/)]);
});

test("the terminal's background told lays the chat out again only when it changed", () => {
  const t = term("");
  t.scr.canvas = "#102030";
  term_press(t, "Canvas");
  const ver = t.ver;
  term_press(t, "Canvas");
  t.scr.canvas = "#203040";
  term_press(t, "Canvas");
  expect([ver, t.ver]).toEqual([1, 2]);
});

// a list of n options (with a search, if find), its options named o0, o1...
const list = (t: any, n: number, find = false) => term_chooser(t, "List", Array.from({ length: n }, (_, k) => "o" + k), Array(n).fill(""), -1, () => {}, { find });

test("under a picker, PgUp and PgDn move its lit row a page, Ctrl+Home and Ctrl+End to its ends, never the chat; Home and End edit its search, or move without one", () => {
  const t = term("");
  t.seen = { tall: 20 };
  list(t, 30);
  t.box = { of: t.choose, tall: 10, ahead: 0, lead: 0 };
  const at = (keys: string) => (Screen.screen_feed(t.scr, keys), t.choose.at);
  expect([at("\x1b[6~"), at("\x1b[6~"), at("\x1b[5~"), at("\x1b[1;5F"), at("\x1b[1;5H"), at("\x1b[F"), at("\x1b[H")]).toEqual([9, 18, 9, 29, 0, 29, 0]);
  expect(t.scroll).toBe(0);
  const u = term("");
  list(u, 30, true);
  Screen.screen_feed(u.scr, "o2\x1b[H");
  expect([u.choose.find.pos, u.choose.at]).toEqual([0, 0]);
  Screen.screen_feed(u.scr, "\x1b[F");
  expect([u.choose.find.pos, u.choose.at]).toEqual([2, 0]);
});

test("under a picker, keys it doesn't use do nothing: Ctrl+O, Shift+Left, Ctrl+PgDn; Ctrl+D closes it, the input kept, no quit armed; Ctrl+P closes the palette it opened", () => {
  const t = term("");
  Screen.ed_set(t.scr.ed, "my draft");
  list(t, 3);
  Screen.screen_feed(t.scr, "\x0f\x1b[1;2D\x1b[6;5~");
  expect([t.v.verbose, t.v.out, t.choose.title]).toEqual([false, [], "List"]);
  Screen.screen_feed(t.scr, "\x04");
  expect([t.choose, t.scr.ed.text, t.quit]).toEqual([null, "my draft", 0]);
  Screen.screen_feed(t.scr, "\x10");
  expect(t.choose.title).toBe("Commands");
  Screen.screen_feed(t.scr, "\x10");
  expect([t.choose, t.scr.ed.text]).toEqual([null, "my draft"]);
});

test("with the input a /word and a question open, Down and Enter go to the question, not the commands suggested", () => {
  const t = term("");
  Screen.ed_set(t.scr.ed, "/mo");
  t.v.asks = [{ id: "q1", who: "illi", tool: "Bash", what: "ls", why: "", keep: "" }];
  term_asks(t);
  t.asking.shown = 0;
  Screen.screen_feed(t.scr, "\x1b[B\r");
  expect([sent(t), t.scr.ed.text]).toEqual([[{ $: "answer", ask: "q1", yes: false, always: false, said: "" }], "/mo"]);
});

test("a paste goes to a popup's search as one line; without one, nowhere; never to the input under it", () => {
  const t = term("");
  Screen.ed_set(t.scr.ed, "my draft");
  list(t, 3, true);
  term_paste(t, "o\n1");
  expect([t.choose.find.text, t.scr.ed.text]).toEqual(["o 1", "my draft"]);
  list(t, 3);
  term_paste(t, "anything");
  expect(t.scr.ed.text).toBe("my draft");
});

test("the leader let go by the wheel passes it on to what has it: a pane scrolls, not the chat", () => {
  const t = term("");
  t.seen = { tall: 20 };
  t.pane = { title: "Help", make: () => [], w: 0, lines: [], scroll: 0 };
  Screen.screen_feed(t.scr, "\x18");
  expect(t.lead).toBe(true);
  Screen.screen_feed(t.scr, "\x1b[<65;10;5M");
  expect([t.lead, t.pane.scroll, t.scroll]).toEqual([false, 3, 0]);
});
