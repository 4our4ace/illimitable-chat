// View test
// =========
// `bun test View.test.ts`. What a view draws of the server's messages:
// runs of work, each keyed apart (a thought-led one too), open as a
// click or the mode says; what streams made anew only as it grows.

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
  View.view_hear(v, { $: "state", ...v, wait: View.COMPACTING });
  expect(tail(v)).toEqual(["writing the recap…"]);
  View.view_hear(v, { $: "state", ...v, wait: "" });
  expect(tail(v)).toEqual([]);
});

// what runs, in words, for the line over the input: the last thing
// streaming, else the wait (a call's tool, never its input, nor the
// agents at work); no turn, agents waited on. Its tokens: the models'
// streamed characters since work began, four a token, results not
// counted; its rate: those of the two seconds before the last half second's
// start, a second's share, so it holds for half a second
test("what runs, in words", () => {
  const v = View.view_new();
  expect(View.view_doing(v)).toBeNull();
  View.view_hear(v, { $: "state", ...v, busy: true, wait: "gpt-6.1-sol" });
  expect(View.view_doing(v)).toEqual({ verb: "Waiting for gpt-6.1-sol", tokens: 0, rate: 0 });
  View.view_hear(v, { $: "delta", kind: "mind", text: "hm".repeat(200) });
  expect(View.view_doing(v)?.tokens).toBe(100);
  const step = Math.floor(Date.now() / 500) * 500 + 500;
  expect(View.view_doing(v, step)).toEqual({ verb: "Thinking", tokens: 100, rate: 50 });
  expect(View.view_doing(v, step + 499)?.rate).toBe(50);
  expect(View.view_doing(v, step + 2000)?.rate).toBe(0);
  View.view_hear(v, { $: "delta", kind: "echo", text: "x".repeat(4000) });
  View.view_hear(v, { $: "delta", agent: "explorer", kind: "illi", text: "y".repeat(398) });
  View.view_hear(v, { $: "delta", kind: "tool", text: 'shell {"command":"grep -n x a.log\\nwc -l"}' });
  View.view_hear(v, { $: "state", ...v, agents: ["explorer", "reviewer"] });
  expect(View.view_doing(v)?.verb).toBe("Running shell");
  expect(View.view_doing(v)?.tokens).toBe(210);
  View.view_hear(v, { $: "live", live: [] });
  View.view_hear(v, { $: "state", ...v, busy: false, wait: "", agents: ["explorer"] });
  expect(View.view_doing(v, Date.now() + 2500)).toEqual({ verb: "Waiting on agents", tokens: 210, rate: 0 });
  View.view_hear(v, { $: "state", ...v, agents: [] });
  View.view_hear(v, { $: "state", ...v, busy: true });
  expect(View.view_doing(v)?.tokens).toBe(0);
  View.view_hear(v, { $: "state", ...v, wait: View.COMPACTING });
  View.view_hear(v, { $: "delta", kind: "illi", text: "## Objective" });
  expect(View.view_doing(v)?.verb).toBe("Compacting the chat");
});

// the work between the person's words and illi's: one Act row per run,
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
  expect(acts[1]).toMatchObject({ $: "Act", id: 2, open: false, text: "Ran 2 commands, read a file · thought · explorer reported" });
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

// runs led by a thought (never logged: no id) each keyed by the message
// the thought follows, so one opens alone and keeps its key as its first
// call comes; in verbose mode a toggle shuts that one run, and Ctrl+O
// forgets the runs toggled by hand
test("each run of work has its own key, a thought-led one too; verbose mode shuts the run toggled, Ctrl+O forgets them and the messages folded", () => {
  const v = View.view_new();
  for (const [id, kind, text] of [[1, "user", "a"], [2, "tool", 'shell {"command":"ls"}'], [3, "illi", "done"], [4, "user", "b"], [5, "tool", 'shell {"command":"pwd"}'], [6, "illi", "here"]] as const) {
    View.view_hear(v, { $: "entry", id, kind, text, at: id } as any);
  }
  const rows = () => View.view_acts(v, [...View.view_rows(v, [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]] as any).flat()]);
  v.minds.set(1, ["think on a"]);
  v.minds.set(4, ["think on b"]);
  v.turn = 0;
  const keys = () => rows().filter((r) => r.$ === "Act").map((r: any) => [r.id, r.open]);
  expect(keys()).toEqual([[-3, false], [-6, false]]);
  View.view_toggle(v, -6);
  expect(keys()).toEqual([[-3, false], [-6, true]]);
  View.view_verbose(v);
  expect(keys()).toEqual([[-3, true], [-6, true]]);
  View.view_toggle(v, -3);
  expect(keys()).toEqual([[-3, false], [-6, true]]);
  v.folds.add("#5");
  View.view_verbose(v);
  expect([v.verbose, v.acts.size, v.folds.size, keys()]).toEqual([false, 0, 0, [[-3, false], [-6, false]]]);
});

// a recap (/compact): a line across the chat, "Compaction", closed or
// open as a run of work is; its pages one line, a run of work after it
// its own
test("a recap is a line across the chat, its text under it once opened", () => {
  const v    = View.view_new();
  const rows = [
    ...View.entry_rows(1, "illi", "Done."),
    ...View.entry_rows(2, "recap", "## Objective\n- ship it"),
    ...View.entry_rows(3, "recap", "## Next move\n1. tag it"),
    ...View.entry_rows(4, "tool", 'shell {"command":"git tag"}'),
    ...View.entry_rows(5, "user", "go on"),
  ];
  const acts = View.view_acts(v, rows);
  expect(acts.map((r) => r.$)).toEqual(["Msg", "Rule", "Act", "Msg"]);
  expect(acts[1]).toMatchObject({ $: "Rule", id: 2, text: "Compaction", open: false });
  expect((acts[1] as any).rows.map((r: any) => r.id)).toEqual([2, 3]);
  View.view_toggle(v, 2);
  expect(View.view_acts(v, rows)[1]).toMatchObject({ open: true });
  expect(View.view_acts(v, [{ $: "Sum", id: 2, n: 1, text: "recap: ship it", call: null, kind: "recap" }])[0].$).toBe("Rule");
});

// the model picker's pick: model, effort and speed sent as one change,
// one note saying it (the vendor named once there are more; a speed the
// model lacks as it runs); the pick already, nothing; a model not
// offered, a note why
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
  expect(View.view_act(v, { $: "Pick", to: { ...to, speed: "ultrafast" } })).toEqual([{ $: "pick", to: { ...to, speed: "ultrafast" } }]);
  expect(v.notes.at(-1)).toBe("Now on opus-5.5 (claude-api), high effort, fast.");
  expect(View.view_act(v, { $: "Pick", to: { ...to, model: "opus-9" } })).toEqual([]);
  expect(v.notes.at(-1)).toBe("No pick opus-9 · high · fast here.");
});

// what streams keeps its rows while its text holds, so a paint lays out
// again only the message still growing
test("what streams is made anew only as it grows", () => {
  const v = View.view_new();
  v.verbose = true;
  View.view_hear(v, { $: "delta", kind: "tool", text: 'shell {"command":"ls"}', fresh: true });
  View.view_hear(v, { $: "delta", kind: "illi", text: "Here" });
  const [call, said] = View.view_tail(v);
  expect(View.view_tail(v)[0]).toBe(call);
  expect(View.view_tail(v)[1]).toBe(said);
  View.view_hear(v, { $: "delta", kind: "illi", text: " it is" });
  const grown = View.view_tail(v);
  expect(grown[0]).toBe(call);
  expect(grown[1]).not.toBe(said);
  expect(grown[1]).toMatchObject({ $: "Msg", kind: "illi", text: "Here it is" });
});
