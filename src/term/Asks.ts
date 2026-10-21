// Asks
// ====
// A question the chat asks (View Question: Claude Code asking leave to
// use a tool, Tools.approve) in the picker, as it comes: Yes; Yes, and
// not again for that tool this run; No (Esc too); No, and say why (a
// line typed, for the model). What it would do shows above, as a note.
// One answered elsewhere, or dropped (a stop), closes its picker; one
// that comes while another picker is open waits for it to close. A
// pipe has no one to ask: no, at once.

import { term_ask, term_chooser } from "./Commands.ts";
import { term_note } from "./Notices.ts";
import { term_send, type Term } from "./Term.ts";
import type { Question } from "../ui/View.ts";

// the answers, in the picker's order
const YES = 0, ALWAYS = 1, NO = 2, WHY = 3;

// the question first asked, shown till it is answered or gone
export function term_asks(t: Term): void {
  const q = t.v.asks[0] ?? null;
  if (t.asking !== null && t.asking.id !== q?.id) {
    if (t.asking.c !== null && t.choose === t.asking.c) {
      t.choose = null;
    }
    t.asking = null;
  }
  if (q === null) {
    return;
  }
  if (t.asking === null) {
    t.asking = { id: q.id, c: null, done: false };
    term_note(t, q.who + " asks to use " + q.tool + (q.what === "" ? "." : ": " + q.what));
    if (!t.scr.tty) {
      return term_answer(t, q, false, false, "");
    }
  }
  if (!t.asking.done && t.choose === null) {
    term_ask_open(t, q);
  }
}

// the picker for a question
function term_ask_open(t: Term, q: Question): void {
  const names = ["Yes", "Yes, and don't ask again for " + q.tool + " this run", "No", "No, and say why"];
  const keys  = (_k: number, key: string) => {
    if (key !== "Esc" && key !== "Ctrl+C") {
      return false;
    }
    t.choose = null;
    term_answer(t, q, false, false, "");
    return true;
  };
  const pick = (k: number) => {
    if (k === WHY) {
      term_ask(t, "Why not " + q.tool + "?", "your reason, for the model", "", "Enter send · Esc back", (why) => (term_answer(t, q, false, false, why), null));
      t.asking!.c = t.choose;
      return;
    }
    term_answer(t, q, k !== NO, k === ALWAYS, "");
  };
  term_chooser(t, "Allow " + q.tool + "?", names, names.map(() => ""), YES, pick, { keys, foot: () => "Enter answer · Esc no" });
  t.asking!.c = t.choose;
}

function term_answer(t: Term, q: Question, yes: boolean, always: boolean, why: string): void {
  t.asking = { id: q.id, c: null, done: true };
  term_send(t, { $: "answer", ask: q.id, yes, always, why });
}
