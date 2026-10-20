// Notices test
// ============
// `bun test Notices.test.ts`. The terminal's notices, one list with one
// clock: a note goes by itself once its time is up, said again it shows
// once, a third pushes the oldest out (a held one stays; while work runs,
// a second does), Esc takes the notes (a toast stays its time), the view's notes
// come in as notes, and a pipe gets each note once.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-notices-");
process.env.ILLI_DIR = DIR;

const { term_note, term_toast, term_unnote, term_shown } = await import("./Notices.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a terminal with no screen: a paint always due, so none is asked for
const term = (tty = true) => ({ notices: [], expire: undefined, due: true, v: { notes: [] as string[], busy: false, agents: [] }, scr: { tty } }) as any;

test("a note goes once its time is up; said again, it shows once", async () => {
  const t = term();
  term_note(t, "gpt-6.1-sol has no fast.", 40);
  term_note(t, "gpt-6.1-sol has no fast.", 40);
  term_note(t, "stays a while");
  expect(term_shown(t).notes).toEqual(["gpt-6.1-sol has no fast.", "stays a while"]);
  await Bun.sleep(80);
  expect(term_shown(t).notes).toEqual(["stays a while"]);
  clearTimeout(t.expire);
});

test("a third note pushes the oldest out, a second while work runs; a held one stays", () => {
  const t = term();
  ["one", "two", "three"].forEach((text) => term_note(t, text));
  expect(term_shown(t).notes).toEqual(["two", "three"]);
  term_unnote(t);
  term_note(t, "the login's code", 60000);
  ["one", "two"].forEach((text) => term_note(t, text));
  expect(term_shown(t).notes).toEqual(["the login's code", "two"]);
  term_unnote(t);
  t.v.busy = true;
  ["one", "two"].forEach((text) => term_note(t, text));
  expect(term_shown(t).notes).toEqual(["two"]);
  clearTimeout(t.expire);
});

test("Esc takes the notes, the toast stays its time; the view's notes come in", async () => {
  const t = term();
  term_note(t, "a note");
  term_toast(t, "Copied 3 characters", 40);
  term_unnote(t);
  expect(term_shown(t)).toEqual({ notes: [], toast: "Copied 3 characters" });
  await Bun.sleep(80);
  expect(term_shown(t).toast).toBe("");
  t.v.notes.push("No agent x.");
  expect(term_shown(t).notes).toEqual(["No agent x."]);
  clearTimeout(t.expire);
});

test("a pipe gets each note once", () => {
  const t = term(false);
  term_note(t, "said once");
  expect(term_shown(t).notes).toEqual(["said once"]);
  expect(term_shown(t).notes).toEqual([]);
});
