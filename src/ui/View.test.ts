// View test
// =========
// `bun test View.test.ts`. What a view draws of the server's messages.

import { expect, test } from "bun:test";
import type { Pick } from "../ai/Pick.ts";
import * as View from "./View.ts";

const tail = (v: View.View) => View.view_tail(v).map((row) => (row.$ === "Cap" ? row.text : row.$));

// a turn waiting on its model names the model the server says: the
// wait holds it, so no pick (none yet) can name none
test("a turn's wait names its model", () => {
  const v = View.view_new();
  View.view_hear(v, { $: "state", ...v, wait: "claude-opus-5-5", pick: null });
  expect(tail(v)).toEqual(["waiting for claude-opus-5-5…"]);
  View.view_hear(v, { $: "state", ...v, wait: View.SUMMARIES });
  expect(tail(v)).toEqual(["compressing earlier messages…"]);
  View.view_hear(v, { $: "state", ...v, wait: "" });
  expect(tail(v)).toEqual([]);
});

// what runs, in words, for the line over the input: the last thing
// streaming, else the wait; the agents at work after it; no turn, the
// agents waited on
test("what runs, in words", () => {
  const v = View.view_new();
  expect(View.view_doing(v)).toBeNull();
  View.view_hear(v, { $: "state", ...v, busy: true, wait: "gpt-6.1-sol" });
  expect(View.view_doing(v)).toEqual({ verb: "Waiting for gpt-6.1-sol", what: "", stop: true });
  View.view_hear(v, { $: "live", live: [{ kind: "mind", text: "hm" }] });
  expect(View.view_doing(v)?.verb).toBe("Thinking");
  View.view_hear(v, { $: "live", live: [{ kind: "mind", text: "hm" }, { kind: "tool", text: 'shell {"command":"grep -n x a.log\\nwc -l"}' }] });
  View.view_hear(v, { $: "state", ...v, agents: ["explorer", "reviewer"] });
  expect(View.view_doing(v)).toEqual({ verb: "Running shell", what: "grep -n x a.log · 2 agents at work", stop: true });
  View.view_hear(v, { $: "live", live: [] });
  View.view_hear(v, { $: "state", ...v, busy: false, wait: "", agents: ["explorer"] });
  expect(View.view_doing(v)).toEqual({ verb: "Waiting on Explorer", what: "", stop: false });
});

// the work between the person's words and Illi's: one Act row per run,
// saying what was done; open as a click or Ctrl+O says; what streams of
// it shows only once verbose
test("each run of work is one line saying what was done", () => {
  const v    = View.view_new();
  const rows = [
    ...View.entry_rows(1, "user", "check the logs"),
    ...View.entry_rows(2, "mind", "let me look"),
    ...View.entry_rows(3, "tool", 'shell {"command":"grep -n x a.log"}'),
    ...View.entry_rows(4, "echo", "a.log:3: x"),
    ...View.entry_rows(5, "tool", 'shell {"command":"wc -l a.log"}'),
    ...View.entry_rows(6, "tool", 'read {"path":"a.log"}'),
    ...View.entry_rows(7, "work", "[explorer] found it on line 3"),
    ...View.entry_rows(8, "illi", "It's on line 3."),
  ];
  const acts = View.view_acts(v, rows);
  expect(acts.map((r) => r.$)).toEqual(["Msg", "Act", "Msg"]);
  expect(acts[1]).toMatchObject({ $: "Act", id: 2, open: false, text: "Ran 2 commands, read a file · thought · Explorer reported" });
  View.view_toggle(v, 2);
  expect(View.view_acts(v, rows)[1]).toMatchObject({ open: true });
  View.view_toggle(v, 2);
  v.verbose = true;
  expect(View.view_acts(v, rows)[1]).toMatchObject({ open: true });
  v.verbose = false;
  v.live = [{ kind: "mind", text: "hm" }, { kind: "illi", text: "So far" }];
  expect(View.view_tail(v, false).map((r) => (r.$ === "Msg" ? r.kind : r.$))).toEqual(["illi"]);
  v.verbose = true;
  expect(View.view_tail(v, false).map((r) => (r.$ === "Msg" ? r.kind : r.$))).toEqual(["mind", "illi"]);
});

// the model picker's pick: model, effort and speed sent as one change,
// one note saying it (the vendor named once there are more); the pick
// already, nothing; one not offered, a note why
test("a pick set whole is one change and one note", () => {
  const v    = View.view_new();
  const pick: Pick = { vendor: "claude-api", model: "sonnet-5.5", effort: "medium", speed: "slow" };
  View.view_hear(v, { $: "state", ...v, vendors: ["claude-api"], pick });
  expect(View.view_act(v, { $: "Pick", to: pick })).toEqual([]);
  const to: Pick = { vendor: "claude-api", model: "opus-5.5", effort: "high", speed: "fast" };
  expect(View.view_act(v, { $: "Pick", to })).toEqual([{ $: "pick", to }]);
  expect(v.notes).toEqual(["Now on opus-5.5, high effort, fast."]);
  View.view_hear(v, { $: "state", ...v, vendors: ["claude-api", "openai-api"] });
  View.view_act(v, { $: "Pick", to: { ...to, effort: "low", speed: "slow" } });
  expect(v.notes.at(-1)).toBe("Now on opus-5.5 (claude-api), low effort.");
  expect(View.view_act(v, { $: "Pick", to: { ...to, speed: "ultrafast" } })).toEqual([]);
  expect(v.notes.at(-1)).toBe("No pick opus-5.5 · high · ultrafast here.");
});
