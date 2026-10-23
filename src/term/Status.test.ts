// Status test
// ===========
// `bun test Status.test.ts`. A command's output parsed into the screen's
// runs: SGR colors (16, 256, #rrggbb, colon forms too), bold, dim and
// their offs; links (OSC 8, ended by BEL or ST; a scheme not kept,
// unlinked); every other escape dropped (cursor moves, modes, a title,
// the clipboard, device strings, one cut short), as they carry across
// lines. What it is told: Claude Code's fields from the chat's state,
// the context's shares null till told, the plan's limits by their
// windows, the main agent only when there is one. It runs once the state
// is known, its rows drawn between the input and the bottom line (3 at
// most, cut to the width, padded, the height held); the same state runs
// it no more, a change meanwhile again once it ends; a non-zero exit
// blanks them, said once; a change of the setting kills the run in
// flight and drops its result.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import type { Line } from "../ui/Paint.ts";

const DIR = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + "/illi-status-"));
process.env.ILLI_DIR = DIR;

const config = await import("../config/Config.ts");
const { status_end, status_input, status_new, status_parse, status_rows, status_set, status_hear, status_stop } = await import("./Status.ts");
const { term_paint } = await import("./Frame.ts");
const Paint = await import("../ui/Paint.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a script of the user's, made executable
const sh = (name: string, body: string) => {
  fs.writeFileSync(DIR + "/" + name, "#!/bin/sh\n" + body + "\n");
  fs.chmodSync(DIR + "/" + name, 0o755);
  return DIR + "/" + name;
};

// a terminal on a screen fed by hand, the chat's state told (its pick),
// its notes kept; what it paints written nowhere
function term(): any {
  const scr = { tty: true, kitty: false, ed: Screen.ed_new(), rest: "", shown: [], click: { row: 0, col: 0 }, clicks: 0, pressed: 0, point: { row: 0, col: 0 }, typed: false, grab: null, on: () => {} };
  const v = { ...View.view_new(), pick: { vendor: "claude-api", model: "sonnet-5.5", effort: "high", speed: "slow" } };
  return {
    v, scr, due: false, notices: [], scroll: 0, seen: { total: 0, marks: [], row: 0, first: 0, tall: 1, col: 0, end: 0 }, ver: 0, body: null, find: null,
    pane: null, agents: [], choose: null, profs: [], hits: [], since: 0, spin: undefined, ruled: null, doing: null, subs: new Map(), side: { place: "off", width: "25%" }, status: status_new(),
    todo: false, areas: [], sel: null, sug: null, dropped: "", asking: null,
  };
}
const write = process.stdout.write;
process.stdout.write = (() => true) as any;
afterAll(() => {
  process.stdout.write = write;
});

// a condition met (2 s at most)
async function until(f: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !f(); i++) {
    await Bun.sleep(10);
  }
}

// a line's runs as text and what of their ink isn't plain
const runs = (l: Line) => l.map((r) => [r.x, Object.fromEntries(Object.entries(r.s).filter(([k, x]) => x !== (Paint.INK as any)[k]))]);
const text = (l: Line) => l.map((r) => r.x).join("");

test("SGR colors, bold, dim and their offs, in every form, carried across lines; a reset keeps the link", () => {
  const [a, b] = status_parse("\x1b[1;31mred\x1b[22m plain\x1b[39m\x1b[38;5;208mo\x1b[38;2;1;2;3mt\x1b[38:2::4:5:6mc\x1b[38:5:9mx\n\x1b[2;44mdim\x1b[0m end\x1b[93;101m!\n\n");
  expect(runs(a)).toEqual([["red", { b: true, c: "1" }], [" plain", { c: "1" }], ["o", { c: "208" }], ["t", { c: "#010203" }], ["c", { c: "#040506" }], ["x", { c: "9" }]]);
  expect(runs(b)).toEqual([["dim", { c: "9", d: true, g: "4" }], [" end", {}], ["!", { c: "11", g: "9" }]]);
  expect(status_parse("")).toEqual([]);
  expect(status_parse("\n\n")).toEqual([]);
});

test("links by BEL or ST kept, one of another scheme unlinked; every other escape dropped, one cut short too", () => {
  const [l] = status_parse("\x1b]8;;https://x.dev/a\x07site\x1b]8;;\x07 \x1b]8;id=1;file:///tmp/f\x1b\\f\x1b]8;;\x1b\\ \x1b]8;;javascript:alert(1)\x07js\x1b]8;;\x07");
  expect(runs(l)).toEqual([["site", { k: "https://x.dev/a" }], [" ", {}], ["f", { k: "file:///tmp/f" }], [" js", {}]]);
  const odd = "a\x1b[2J\x1b[H\x1b[?25l\x1b]0;title\x07\x1b]52;c;aGk=\x07\x1bPq#0;1\x1b\\\x1b7b\x1b(B\x9b31mc\x07\x08\rd\x1b[31";
  expect(status_parse(odd).map(text)).toEqual(["abcd"]);
  expect(runs(status_parse("x\x9b32my")[0])).toEqual([["x", {}], ["y", { c: "2" }]]);
  expect(status_parse("one\r\ntwo\x1b]8;;https://a").map(text)).toEqual(["one", "two"]);
  expect(status_parse("\x1b]0;t\nline2\nline3").map(text)).toEqual(["", "line2", "line3"]);
  expect(runs(status_parse("\x1b]8;;https://x.dev\x9clink\x1b]8;;\x9c rest")[0])).toEqual([["link", { k: "https://x.dev" }], [" rest", {}]]);
  expect(status_parse("\x90qpayload\x9cafter\x9fapc\x9cend").map(text)).toEqual(["afterend"]);
  expect(status_parse("a\n\x1b[0m\n\x1b]8;;\x07").map(text)).toEqual(["a"]);
});

test("refreshInterval: 1 to a day in seconds; none, 0 or not a number: none", () => {
  const every = (refreshInterval: unknown) => config.config_statusline({ command: "x", refreshInterval })!.refresh;
  expect([every(undefined), every(0), every(-3), every("5"), every(null), every(0.5), every(5), every(1e9)]).toEqual([0, 0, 0, 0, 0, 1, 5, 86400]);
  expect([config.config_statusline("{ echo a; }")?.command, config.config_statusline("{\"type\": \"command\"}"), config.config_statusline("  ")]).toEqual(["{ echo a; }", null, null]);
});

test("what it is told: Claude Code's fields from the chat's state; the shares null till told; the plan's limits by window; the agent only when one", () => {
  const v = term().v;
  const cwd = DIR;
  const bare = status_input(v, cwd, "id1") as any;
  expect(bare).toMatchObject({ hook_event_name: "Status", session_id: "id1", cwd, workspace: { current_dir: cwd, project_dir: cwd }, model: { id: "sonnet-5.5", display_name: "sonnet-5.5", vendor: "claude-api" }, effort: { level: "high" }, fast_mode: false, permission_mode: "auto", busy: false, agents: [] });
  expect([bare.context_window, "agent" in bare, "rate_limits" in bare, typeof bare.version]).toEqual([{ used_percentage: null, remaining_percentage: null }, false, false, "string"]);
  const told = status_input({ ...v, agent: "coder", busy: true, use: { fill: { used: 32000, cap: 90000, window: 128000 }, plan: { brand: "ChatGPT", tier: "pro", limits: [{ window: 300, used: 23, reset: 1_800_000_000_000 }, { window: 60, used: 5, reset: 0 }] } } }, cwd, "id1") as any;
  expect([told.context_window, told.agent, told.rate_limits]).toEqual([{ context_window_size: 128000, total_input_tokens: 32000, used_percentage: 25, remaining_percentage: 75, summarize_at: 90000 }, { name: "coder" }, { five_hour: { used_percentage: 23, resets_at: 1_800_000_000 } }]);
});

test("it runs once the state is known: its rows above the bottom line, 3 at most, cut and padded, the height held; the same state runs it no more", async () => {
  const seen = DIR + "/seen.txt";
  const cmd = sh("rows.sh", "cat >> " + seen + "; echo \"$COLUMNS\" > " + DIR + "/cols.txt; printf '\\033[32mone\\033[0m\\ntwo %0200d\\nthree\\nfour\\n' 0");
  config.config_set("statusline", { type: "command", command: cmd, padding: 2 });
  const t = term();
  t.v.pick = null;
  status_set(t);
  await Bun.sleep(100);
  expect(fs.existsSync(seen)).toBe(false);
  t.v.pick = term().v.pick;
  status_hear(t);
  await until(() => t.status.rows.length > 0);
  expect([t.status.rows.map(text), t.status.held]).toEqual([["one", "two " + "0".repeat(200), "three"], 3]);
  expect(JSON.parse(fs.readFileSync(seen, "utf8"))).toMatchObject({ hook_event_name: "Status", model: { id: "sonnet-5.5" } });
  const w = Screen.screen_size().w - 5;
  expect(fs.readFileSync(DIR + "/cols.txt", "utf8").trim()).toBe(String(w - 2));
  const rows = status_rows(t, w, 10);
  expect(rows.map((r) => [Paint.line_width(r) <= w, text(r).startsWith("  ")])).toEqual([[true, true], [true, true], [true, true]]);
  expect(status_rows(t, w, 1)).toHaveLength(1);
  term_paint(t);
  const drawn = t.ruled.rows.map((row: any[]) => row.map((p) => text(p.line)).join(""));
  const h = Screen.screen_size().h;
  expect(drawn.slice(h - 4, h - 1).map((r: string) => r.trim().slice(0, 5))).toEqual(["one", "two 0", "three"]);
  status_hear(t);
  await Bun.sleep(500);
  expect(fs.readFileSync(seen, "utf8").trim().split("\n")).toHaveLength(1);
  status_stop(t);
});

test("a job it leaves running is killed once its output is in; once illi leaves, nothing runs it again", async () => {
  const pid = DIR + "/job.pid";
  config.config_set("statusline", sh("job.sh", "sleep 30 & echo $! > " + pid + "; echo hi"));
  const t = term();
  status_set(t);
  await until(() => t.status.rows.length === 1);
  await Bun.sleep(50);
  const alive = (n: number) => {
    try {
      process.kill(n, 0);
      return true;
    } catch {
      return false;
    }
  };
  expect(alive(Number(fs.readFileSync(pid, "utf8")))).toBe(false);
  status_end(t);
  fs.rmSync(pid);
  t.v.busy = true;
  status_hear(t, true);
  await Bun.sleep(300);
  expect([fs.existsSync(pid), t.status.held, status_rows(t, 80, 10)]).toEqual([false, 0, []]);
});

test("a change while it runs runs it again once it ends, told the change", async () => {
  const seen = DIR + "/busy.txt";
  config.config_set("statusline", sh("busy.sh", "cat >> " + seen + "; sleep 0.3; echo ok"));
  const t = term();
  status_set(t);
  await Bun.sleep(100);
  t.v.busy = true;
  status_hear(t);
  expect(t.status.due).toBe(true);
  await until(() => fs.existsSync(seen) && fs.readFileSync(seen, "utf8").trim().split("\n").length === 2);
  expect(fs.readFileSync(seen, "utf8").trim().split("\n").map((l) => JSON.parse(l).busy)).toEqual([false, true]);
  status_stop(t);
});

test("a non-zero exit blanks the rows, said once; a change of the setting drops the run in flight", async () => {
  const t = term();
  config.config_set("statusline", sh("ok.sh", "echo fine"));
  status_set(t);
  await until(() => t.status.rows.length === 1);
  config.config_set("statusline", sh("bad.sh", "echo no >&2; exit 3"));
  status_set(t);
  await until(() => t.notices.length > 0);
  expect([t.status.rows, t.status.held, t.notices.map((n: any) => n.text)]).toEqual([[], 1, ["Your status line command " + DIR + "/bad.sh exited 3: no (illi.log has more)."]]);
  status_hear(t, true);
  await Bun.sleep(300);
  expect(t.notices).toHaveLength(1);
  config.config_set("statusline", sh("slow.sh", "sleep 30; echo late"));
  status_set(t);
  await Bun.sleep(100);
  const run = t.status.run;
  expect(run).not.toBeNull();
  config.config_set("statusline", sh("next.sh", "echo next"));
  status_set(t);
  expect(run.signal.aborted).toBe(true);
  await until(() => t.status.rows.length === 1);
  expect(t.status.rows.map(text)).toEqual(["next"]);
  status_stop(t);
  config.config_set("statusline", null);
  status_set(t);
  expect([t.status.set, t.status.held, status_rows(t, 80, 10)]).toEqual([null, 0, []]);
});
