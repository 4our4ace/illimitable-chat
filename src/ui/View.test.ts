// View test
// =========
// `bun test View.test.ts`. What a view draws of the server's messages:
// runs of work, each keyed apart (a thought-led one too), a line over
// its items: each call with what it did and how it ended, opened alone
// by a click or all by the mode, five at most till a click shows all
// (the newest while it works); an agent's page so too, its clicks its
// own; what streams made anew only as it grows.

import { expect, test } from "bun:test";
import type { Pick } from "../ai/Pick.ts";
import * as View from "./View.ts";

const tail = (v: View.View) => View.view_tail(v).map((row) => (row.$ === "Cap" ? row.text : row.$));

// a thought (never logged: no id) after message `after`
const thought = (text: string, after: number): View.Row => ({ ...(View.entry_rows(null, "mind", text)[0] as View.Row & { $: "Msg" }), after, nth: 0 });

// a run's items, each its key, label, outcome, how it ended, whether open
const items = (run: View.Row) => (run.$ === "Act" ? run.rows.flatMap((r) => (r.$ === "Item" ? [[r.key, r.label, r.outcome, r.ok, r.open]] : [])) : []);

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
// saying what was done, over its items, a line each; what streams of it
// shows only once verbose
test("each run of work is one line saying what was done, over its items", () => {
  const v    = View.view_new();
  const rows = [
    ...View.entry_rows(1, "user", "check the logs"),
    ...View.entry_rows(2, "mind", "let me look"),
    ...View.entry_rows(3, "tool", 'shell {"command":"grep -n x a.log","description":"Find x in the log"}'),
    ...View.entry_rows(4, "echo", "a.log:3: x\n(exit 0 in 0.1 s)"),
    ...View.entry_rows(5, "tool", 'shell {"command":"wc -l a.log"}'),
    ...View.entry_rows(6, "tool", 'read {"path":"a.log"}'),
    ...View.entry_rows(7, "work", "[explorer] found it on line 3"),
    ...View.entry_rows(8, "illi", "It's on line 3."),
  ];
  const acts = View.view_acts(v, rows);
  expect(acts.map((r) => r.$)).toEqual(["Msg", "Act", "Msg"]);
  expect(acts[1]).toMatchObject({ $: "Act", id: 2, text: "Ran 2 commands, read a file · thought · explorer reported", held: [["#2", "c#3"], ["#3", "c#3"], ["#4", "c#3"], ["#5", "c#5"], ["#6", "c#6"], ["#7", "c#7"]] });
  expect(items(acts[1])).toEqual([
    ["c#3", "Find x in the log", "exit 0", true, false],
    ["c#5", "wc -l a.log", "", null, false],
    ["c#6", "Read a.log", "", null, false],
    ["c#7", "explorer's report", "1 line", null, false],
  ]);
  v.live = [{ kind: "mind", text: "hm" }, { kind: "illi", text: "So far" }];
  expect(View.view_tail(v, false).map((r) => (r.$ === "Msg" ? r.kind : r.$))).toEqual(["illi"]);
  v.verbose = true;
  expect(View.view_tail(v, false).map((r) => (r.$ === "Msg" ? r.kind : r.$))).toEqual(["mind", "illi"]);
});

// a run's line names each tool's calls in words: Claude Code's as
// illi's alike (Agent and Task as spawn) or as their own (Glob, Grep,
// WebFetch), any other's called by name; a run of results alone, got;
// a tool message not read as `name {input}`, a call by its first line,
// ending as its result says
test("a run's line says what each tool did; a call not read as one, its first line", () => {
  const v    = View.view_new();
  const run  = (...entries: Array<[View.Entry["kind"], string]>) => View.view_acts(v, entries.flatMap(([kind, text], k) => View.entry_rows(k + 1, kind, text)))[0] as View.Row & { $: "Act" };
  const grep = (k: number): [View.Entry["kind"], string] => ["tool", "Grep " + JSON.stringify({ pattern: "x" + k })];
  expect(run(grep(1), grep(2), grep(3), ["tool", 'Agent {"prompt":"look"}'], ["tool", 'Glob {"pattern":"*.ts"}'], ["tool", 'Glob {"pattern":"*.md"}'], ["tool", 'WebFetch {"url":"https://a.io"}']).text).toBe("Searched the code 3 times, started an agent, listed files 2 times, opened a page");
  expect(run(["tool", 'Task {"prompt":"look"}'], ["tool", 'NotebookEdit {"notebook_path":"a.ipynb"}']).text).toBe("Started an agent, edited a file");
  expect(run(["tool", 'mcp__github__get_issue {"id":4}']).text).toBe("Called github: get_issue");
  expect([run(["echo", "a"]).text, run(["echo", "a"], ["echo", "b"]).text]).toEqual(["Got a result", "Got 2 results"]);
  const bare = run(["tool", "projects"], ["echo", "site\nnotes"]);
  expect([bare.text, items(bare)]).toEqual(["Listed the projects", [["c#1", "projects", "", true, false]]]);
});

// a summed-up report or result reads as its summary till its message
// whole is known, then as it whole (an agent's report, a result)
test("a summed-up report or result reads anew once its message whole is known", () => {
  const v     = View.view_new();
  const lines = { "1+1": { text: "work: the explorer found it", to: "" }, "2+1": { text: "echo: two names", to: "" } };
  View.view_hear(v, { $: "know", nodes: lines });
  View.view_hear(v, { $: "view", parts: [[1, 1], [2, 1]], turn: 3 });
  const text = () => (View.view_body(v)[0] as View.Row & { $: "Act" }).text;
  expect([text(), View.view_body(v).flatMap(items)]).toEqual(["An agent reported", [["c#1", "the explorer found it", "", null, false], ["c#2", "two names", "", null, false]]]);
  View.view_hear(v, { $: "know", whole: { 1: { kind: "work", text: "[explorer] found it\non line 3" }, 2: { kind: "echo", text: "a\nb" } } });
  expect([text(), View.view_body(v).flatMap(items)]).toEqual(["explorer reported", [["c#1", "explorer's report", "2 lines", null, false], ["c#2", "Result", "2 lines", null, false]]]);
});

// an item opens alone (a click, /open): its call and its result whole,
// the thoughts before it (those after the run's last call, after it),
// its siblings shut; in verbose mode all open, a click shutting one
// alone; a thought, a report or a result alone an item of its own
test("an item opens alone: its call, its result and the thoughts before it, whole; its siblings stay shut", () => {
  const v    = View.view_new();
  const rows = [
    ...View.entry_rows(1, "user", "go"),
    thought("**Checking the logs**\n\nfirst", 1),
    ...View.entry_rows(2, "tool", 'shell {"command":"ls"}'),
    ...View.entry_rows(3, "echo", "a.log\n(exit 0 in 0.1 s)"),
    ...View.entry_rows(4, "tool", 'shell {"command":"cat a.log"}'),
    ...View.entry_rows(5, "echo", View.FAILED + "denied\n(exit 1 in 0.1 s)"),
    thought("it was refused", 5),
  ];
  const run  = () => View.view_acts(v, rows)[1] as View.Row & { $: "Act" };
  const kinds = (r: View.Row) => (r.$ === "Item" ? r.rows.map((x) => (x.$ === "Msg" ? x.kind : x.$)) : []);
  expect(run().rows.map((r) => (r.$ === "Item" ? r.open : r.$))).toEqual([false, false]);
  View.view_item(v, "c#4");
  expect(run().rows.map((r) => (r.$ === "Item" ? r.open : r.$))).toEqual([false, true]);
  expect(run().rows.map(kinds)).toEqual([["mind", "tool", "echo"], ["tool", "echo", "mind"]]);
  expect(items(run())[1]).toEqual(["c#4", "cat a.log", "exit 1", false, true]);
  View.view_verbose(v);
  expect(run().rows.map((r) => (r.$ === "Item" ? r.open : r.$))).toEqual([true, true]);
  View.view_item(v, "c#2");
  expect(run().rows.map((r) => (r.$ === "Item" ? r.open : r.$))).toEqual([false, true]);
  View.view_verbose(v);
  const alone = View.view_acts(v, [...View.entry_rows(1, "user", "hi"), thought("## Plan\nsay hi", 1), ...View.entry_rows(2, "echo", "sources:\na b"), ...View.entry_rows(3, "illi", "Hi.")]);
  expect(alone[1]).toMatchObject({ $: "Act", text: "Thought" });
  expect(items(alone[1])).toEqual([["c#2", "Result", "2 lines", null, false]]);
  expect(View.view_acts(v, [thought("## Plan\nsay hi", 1)]).flatMap(items)).toEqual([["cm1.0", "Plan …", "", null, false]]);
});

// a run's calls each end as the result logged right after it says
// (failed: FAILED), one with none after it (stopped before it answered)
// not known; a call in a block opened alone among them; a thought
// between calls changes nothing
test("a run's calls each say how they ended: done, failed, not known", () => {
  const v    = View.view_new();
  const rows: View.Row[] = [
    ...View.entry_rows(1, "user", "push it"),
    ...View.entry_rows(2, "tool", 'shell {"command":"bun test"}'),
    ...View.entry_rows(3, "echo", "642 pass\n(exit 0 in 9s)"),
    ...View.entry_rows(4, "tool", 'shell {"command":"git push"}'),
    ...View.entry_rows(5, "echo", View.FAILED + "rejected\n(exit 1 in 1s)"),
    ...View.entry_rows(null, "mind", "it was refused"),
    { $: "Box", id: 6, n: 1, rows: View.entry_rows(6, "tool", 'web_search {"query":"bend"}') },
    ...View.entry_rows(7, "echo", "bend: a language"),
    ...View.entry_rows(8, "tool", 'read {"path":"a.log"}'),
  ];
  const run = View.view_acts(v, rows)[1];
  expect(run.$ === "Act" && run.rows.map((r) => (r.$ === "Item" ? [r.call?.name, r.call?.head, r.label, r.ok] : r.$))).toEqual([
    ["shell", "bun test", "bun test", true],
    ["shell", "git push", "git push", false],
    ["web_search", "bend", 'Searched "bend"', true],
    ["read", "a.log", "Read a.log", null],
  ]);
});

// a summed-up call ends as its result's message whole says (known by
// then, else as soon as it is), and reads as it whole, its line the call
// word for word or not;
// open, it shows its call and its result whole; illi's question ends as
// answered, though its answers end the run (shown as the user's words
// after it)
test("a summed-up call keeps its label, ends as its result says, opens whole; illi's question, as answered", () => {
  const v   = View.view_new();
  const log: View.Entry[] = [
    { kind: "user", text: "push it" },
    { kind: "tool", text: 'shell {"command":"git push","description":"Push the branch"}' },
    { kind: "echo", text: View.FAILED + "rejected\n(exit 1 in 1s)" },
    { kind: "tool", text: 'shell {"command":"bun test"}' },
    { kind: "echo", text: "642 pass\n(exit 0 in 9s)" },
    { kind: "tool", text: 'ask {"questions":[{"question":"Push again?"}]}' },
    { kind: "echo", text: View.ANSWERED + "Push again? Yes" },
    { kind: "illi", text: "Pushed." },
  ];
  const line = (id: number, e: View.Entry) => (id === 1 ? "tool: pushed the branch, refused" : e.kind + ": " + e.text.split("\n")[0]);
  log.forEach((entry, id) => View.view_hear(v, { $: "know", whole: { [id]: entry }, nodes: { [id + "+1"]: { text: line(id, entry), to: "" } } }));
  View.view_hear(v, { $: "view", parts: log.map((_, id): View.Part => [id, 1]), turn: 3 });
  const rows = View.view_body(v);
  expect(rows.map((r) => (r.$ === "Msg" ? r.kind : r.$))).toEqual(["user", "Act", "user", "illi"]);
  const run  = rows[1] as View.Row & { $: "Act" };
  expect(run.text).toBe("Ran 2 commands, asked you");
  expect(items(run)).toEqual([
    ["c#1", "Push the branch", "exit 1", false, false],
    ["c#3", "bun test", "exit 0", true, false],
    ["c#5", 'Asked "Push again?"', "", true, false],
  ]);
  View.view_item(v, "c#1");
  const open = (View.view_body(v)[1] as View.Row & { $: "Act" }).rows[0];
  const late = View.view_new();
  View.view_hear(late, { $: "know", nodes: { "1+1": { text: "tool: pushed the branch, refused", to: "" } } });
  View.view_hear(late, { $: "view", parts: [[1, 1]], turn: 3 });
  expect([(View.view_body(late)[0] as View.Row & { $: "Act" }).text, View.view_body(late).flatMap(items)]).toEqual(["Used a tool", [["c#1", "pushed the branch, refused", "", null, false]]]);
  View.view_hear(late, { $: "know", whole: { 1: log[1] } });
  expect([(View.view_body(late)[0] as View.Row & { $: "Act" }).text, View.view_body(late).flatMap(items)]).toEqual(["Ran a command", [["c#1", "Push the branch", "", null, false]]]);
  expect(open.$ === "Item" && open.rows.map((r) => (r.$ === "Msg" ? [r.id, r.kind] : r.$))).toEqual([[1, "tool"], [2, "echo"]]);
});

// a run of many items shows CALLS of them, the rest counted on a More
// line: the first and the line under them; while the run is at work, the
// newest and the line over them (the earlier counted); a click on it
// shows all (the line then a way back to fewer), as Ctrl+O does; an item
// among those not shown, opened by /open (by its call's id or its
// result's), shows with them, the More line counting the rest; shut by
// /close, it shows nothing more; a run of six shows all six (a More line
// counts two at least)
test("a long run shows five items and a More line: the first, or the newest while it works; a click shows all", () => {
  const v    = View.view_new();
  const rows = Array.from({ length: 8 }, (_, k) => [...View.entry_rows(10 + 2 * k, "tool", "shell " + JSON.stringify({ command: "step " + k })), ...View.entry_rows(11 + 2 * k, "echo", "(exit 0 in 0.1 s)")]).flat();
  const shown = (working = false) => (View.view_acts(v, rows, v, working)[0] as View.Row & { $: "Act" }).rows.map((r) => (r.$ === "Item" ? r.label : r.$ === "More" ? [r.n, r.open, r.earlier] : r.$));
  expect(shown()).toEqual(["step 0", "step 1", "step 2", "step 3", "step 4", [3, false, false]]);
  expect(shown(true)).toEqual([[3, false, true], "step 3", "step 4", "step 5", "step 6", "step 7"]);
  View.view_more(v, 10);
  expect(shown()).toEqual(["step 0", "step 1", "step 2", "step 3", "step 4", "step 5", "step 6", "step 7", [3, true, false]]);
  expect(shown(true)[0]).toEqual([3, true, true]);
  View.view_more(v, 10);
  View.view_verbose(v);
  expect(shown().length).toBe(9);
  View.view_verbose(v);
  expect(View.view_acts(v, rows.slice(0, 10))[0]).toMatchObject({ rows: Array(5).fill(expect.objectContaining({ $: "Item" })) });
  View.view_hear(v, { $: "know", whole: Object.fromEntries(rows.map((r: any) => [r.id, { kind: r.kind, text: r.text }])) });
  View.view_hear(v, { $: "view", parts: rows.map((r: any): View.Part => [r.id, 1]), turn: 10 });
  const body = () => (View.view_body(v)[0] as View.Row & { $: "Act" }).rows.map((r) => (r.$ === "Item" ? [r.label, r.open] : r.$ === "More" ? r.n : r.$));
  expect(View.view_reach(v, "#20", false)).toBe("c#20");
  expect(body()).toEqual([["step 0", false], ["step 1", false], ["step 2", false], ["step 3", false], ["step 4", false], 3]);
  expect(View.view_reach(v, "#25", true)).toBe("c#24");
  expect(body()).toEqual([["step 0", false], ["step 1", false], ["step 2", false], ["step 3", false], ["step 4", false], ["step 7", true], 2]);
  expect(View.view_reach(v, "#24", true)).toBe("c#24");
  expect(v.items.has("c#24")).toBe(true);
  expect(View.view_reach(v, "#99", true)).toBe(null);
  v.busy = true;
  expect(body()).toEqual([3, ["step 3", false], ["step 4", false], ["step 5", false], ["step 6", false], ["step 7", true]]);
  View.view_item(v, "c#10");
  expect(body()).toEqual([2, ["step 0", true], ["step 3", false], ["step 4", false], ["step 5", false], ["step 6", false], ["step 7", true]]);
  View.view_item(v, "c#12");
  expect(body().length).toBe(8);
  v.busy = false;
  expect(View.view_acts(v, rows.slice(0, 12))[0]).toMatchObject({ rows: Array(6).fill(expect.objectContaining({ $: "Item" })) });
  expect(View.view_acts(v, rows.slice(0, 14))[0]).toMatchObject({ rows: [...Array(5).fill(expect.objectContaining({ $: "Item" })), { $: "More", n: 2 }] });
});

// runs led by a thought (never logged: no id) each keyed by the message
// the thought follows, so no two share one and each keeps its key as
// its first call comes; Ctrl+O forgets what clicks opened, the items,
// the More lines, the recaps and their pages folded, on every page
test("each run of work has its own key, a thought-led one too; Ctrl+O forgets the clicks, on every page", () => {
  const v = View.view_new();
  for (const [id, kind, text] of [[1, "user", "a"], [2, "tool", 'shell {"command":"ls"}'], [3, "illi", "done"], [4, "user", "b"], [5, "tool", 'shell {"command":"pwd"}'], [6, "illi", "here"]] as const) {
    View.view_hear(v, { $: "entry", id, kind, text, at: id } as any);
  }
  const rows = () => View.view_acts(v, [...View.view_rows(v, [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]] as any).flat()]);
  v.minds.set(1, ["think on a"]);
  v.minds.set(4, ["think on b"]);
  v.turn = 0;
  const keys = () => rows().filter((r) => r.$ === "Act").map((r: any) => [r.id, r.held]);
  expect(keys()).toEqual([[-3, [["m1.0", "c#2"], ["#2", "c#2"]]], [-6, [["m4.0", "c#5"], ["#5", "c#5"]]]]);
  View.view_act(v, { $: "Goto", name: "Scout" });
  View.view_item(View.view_shown(v), "c#1");
  View.view_act(v, { $: "Goto", name: null });
  [v.acts, v.folds, v.items, v.mores].forEach((s: Set<any>) => s.add(1));
  View.view_verbose(v);
  expect([v.verbose, v.acts.size, v.folds.size, v.items.size, v.mores.size, v.pages.get("Scout")?.shown?.items.size]).toEqual([true, 0, 0, 0, 0, 0]);
});

// an agent's page: its log in runs as the chat's, each message keyed by
// its place in it, its clicks its own (the chat's item of the same key
// stays as it was); its last run at work while the agent is
test("an agent's page shows its work in runs, its clicks its own", () => {
  const v = View.view_new();
  View.view_act(v, { $: "Goto", name: "Scout" });
  View.view_hear(v, { $: "agent", name: "Scout", found: true });
  const log: Array<[View.Entry["kind"], string]> = [["note", "subagent"], ["user", "look"], ...Array.from({ length: 7 }, (_, k): Array<[View.Entry["kind"], string]> => [["tool", "read " + JSON.stringify({ path: "f" + k })], ["echo", "x\n[lines 1-1 of 1]"]]).flat(), ["illi", "Found it."]];
  log.forEach(([kind, text], id) => View.view_hear(v, { $: "entry", agent: "Scout", id, kind, text }));
  View.view_hear(v, { $: "state", ...v, agents: ["Scout"] });
  const body = () => View.view_body(v);
  expect(body().map((r) => (r.$ === "Msg" ? r.kind : r.$ === "Cap" ? r.text : r.$))).toEqual(["Scout · at work", "note", "user", "Act", "illi"]);
  const run  = () => body()[3] as View.Row & { $: "Act" };
  expect(run().rows.map((r) => (r.$ === "Item" ? r.label : r.$))).toEqual(["Read f0", "Read f1", "Read f2", "Read f3", "Read f4", "More"]);
  View.view_hear(v, { $: "state", ...v, agents: [] });
  View.view_item(View.view_shown(v), "c#2");
  expect(run().rows[0]).toMatchObject({ key: "c#2", label: "Read f0", outcome: "1 line", open: true });
  expect(v.items.size).toBe(0);
  View.view_act(v, { $: "Goto", name: null });
  View.view_act(v, { $: "Goto", name: "Scout" });
  expect(run().rows[0]).toMatchObject({ key: "c#2", open: true });
  View.view_hear(v, { $: "entry", agent: "Scout", id: 0, kind: "note", text: "subagent" });
  expect(View.view_shown(v).items.size).toBe(0);
});

// a recap (/compact): a line across the chat, "Compaction", closed or
// open by a click or the mode; its pages one line, a run of work after
// it its own
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
  View.view_verbose(v);
  expect(View.view_acts(v, rows)[1]).toMatchObject({ open: true });
  View.view_toggle(v, 2);
  expect(View.view_acts(v, rows)[1]).toMatchObject({ open: false });
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
