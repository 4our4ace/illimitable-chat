// Window test
// ===========
// `bun test window.test.ts`. The real illi, end to end, no network: on a
// terminal (a PTY standing in for it) it runs under a window, whose modes
// come on once its profile's screen is up and go off as it quits; from a
// pipe, alone, as before. Its turns on a stand-in for Claude Code that
// streams till a file appears: a switch while a turn runs shows the other
// profile at once, the one left marked at work at the side; back, its
// turn still streams and the input is as typed; a quit while it works
// says so first; its turn's end is a note in the profile shown. Closing
// the terminal leaves no illi running.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import { MODES_END, RESET, WINDOW_ON } from "../src/ui/Modes.ts";

const DIR  = fs.mkdtempSync(os.tmpdir() + "/illi-window-e2e-");
const ROOT = DIR + "/illi";
const HERE = DIR + "/project";
const DONE = DIR + "/done";
const MAIN = new URL("../src/main.ts", import.meta.url).pathname;
fs.mkdirSync(ROOT + "/profiles/work", { recursive: true });
fs.mkdirSync(HERE);
fs.writeFileSync(ROOT + "/trust.json", JSON.stringify({ folders: [fs.realpathSync(HERE)] }));

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// Claude Code stood in for: each call echoes its message, then streams
// "tick " every 200 ms till DONE is there, then ends with a reply
fs.writeFileSync(DIR + "/claude", `#!${process.execPath}
const fs = require("node:fs");
const out = (m) => process.stdout.write(JSON.stringify(m) + "\\n");
const ev = (event) => out({ type: "stream_event", event, parent_tool_use_id: null });
const lines = console[Symbol.asyncIterator]();
const first = await lines.next();
out({ ...JSON.parse(first.value), isReplay: true });
out({ type: "system", subtype: "init", mcp_servers: [] });
ev({ type: "message_start", message: { usage: { input_tokens: 10 } } });
ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
while (!fs.existsSync(${JSON.stringify(DONE)})) {
  ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "tick " } });
  await Bun.sleep(200);
}
out({ type: "assistant", message: { content: [{ type: "text", text: "finished" }], usage: { input_tokens: 10 } }, parent_tool_use_id: null });
out({ type: "result", subtype: "success", is_error: false, result: "finished" });
while (!(await lines.next()).done) {}
process.exit(0);
`, { mode: 0o755 });

// illi's environment: the temp root, Claude's API without a key (no call
// is made) or the stand-in, no update, no browser
const ENV: Record<string, string> = { ...(process.env as Record<string, string>), ILLI_DIR: ROOT, ILLI_VENDORS: "claude-api", ILLI_PICK: "claude-api:sonnet-5.5:medium:slow", ILLI_COMPACTOR: "claude-api:haiku-5.5:high:slow", ILLI_AUTOUPDATE: "off", BROWSER: "none" };
delete ENV.ANTHROPIC_API_KEY;
delete ENV.ILLI_PROFILE;
delete ENV.ILLI_WINDOW;
const CLAUDE = { ILLI_PROFILE: "default", ILLI_VENDORS: "claude-code", ILLI_PICK: "claude-code:opus-5.5:medium:slow", ILLI_COMPACTOR: "claude-code:haiku-5.5:medium:slow", ILLI_CLAUDE: DIR + "/claude" };

// illi on a terminal: its output so far (escapes kept), the same as text
// (escapes taken out) from a mark on, a wait for a text in that (or a
// match), keys typed
const start = (env: Record<string, string> = {}) => {
  let out = "";
  const proc = Bun.spawn([process.execPath, MAIN], { cwd: HERE, env: { ...ENV, ...env }, terminal: { cols: 120, rows: 36, data: (_t, d) => (out += Buffer.from(d).toString("utf8")) } });
  const text = (from = 0) => out.slice(from).replace(/\x1b(?:\[[0-?]*[ -\/]*[@-~]|[\]_][^\x07\x1b]*(?:\x07|\x1b\\)|.)/g, "");
  const seen = async (want: string | RegExp, from = 0, ms = 10000) => {
    const has = () => (typeof want === "string" ? text(from).includes(want) : want.test(text(from)));
    for (let k = 0; k < ms / 20 && !has(); k++) {
      await Bun.sleep(20);
    }
    return has();
  };
  return { proc, out: () => out, mark: () => out.length, text, seen, type: (keys: string) => proc.terminal!.write(keys) };
};

// the profile picker opened by the leader (Ctrl+X p), its option moved
// to (Up or Down, as many as keys), taken
const pick = async (illi: ReturnType<typeof start>, keys: string) => {
  const from = illi.mark();
  illi.type("\x18");
  await Bun.sleep(100);
  illi.type("p");
  await illi.seen("Profile · ", from);
  illi.type(keys);
  await Bun.sleep(100);
  illi.type("\r");
};

// the pids of a process's children
const children = (pid: number) => Bun.spawnSync(["pgrep", "-P", String(pid)]).stdout.toString().split("\n").filter((x) => x !== "").map(Number);

// whether a process runs
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test("on a terminal, illi runs under a window: its modes on once the screen is up, off as illi quits", async () => {
  const illi = start();
  expect(await illi.seen("auto mode")).toBe(true);
  expect(illi.out()).toContain(WINDOW_ON + RESET);
  illi.type("\x04");
  expect(await illi.proc.exited).toBe(0);
  expect(illi.out().endsWith(MODES_END)).toBe(true);
  illi.proc.terminal!.close();
});

test("from a pipe, illi runs alone, as before", async () => {
  const proc = Bun.spawn([process.execPath, MAIN], { cwd: HERE, env: ENV, stdin: new Blob([""]), stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  expect(out).not.toContain("\x1b");
});

test("a switch while a turn runs shows the other profile at once, the one left at work and marked; back, it still streams, the input as typed; a quit says so; its end is a note", async () => {
  fs.rmSync(DONE, { force: true });
  const illi = start(CLAUDE);
  expect(await illi.seen("auto mode")).toBe(true);
  illi.type("go\r");
  expect(await illi.seen("tick tick")).toBe(true);
  illi.type("my draft");
  expect(await illi.seen("> my draft")).toBe(true);
  let from = illi.mark();
  await pick(illi, "\x1b[B");
  expect(await illi.seen("● work", from)).toBe(true);
  expect(await illi.seen(/◯ default [⠀-⣿]/, from)).toBe(true);
  from = illi.mark();
  await pick(illi, "\x1b[A");
  expect(await illi.seen("● default", from)).toBe(true);
  expect(await illi.seen("> my draft", from)).toBe(true);
  const ticks = (illi.text(from).match(/tick/g) ?? []).length;
  expect(await illi.seen(new RegExp("(tick.*){" + (ticks + 3) + "}", "s"), from)).toBe(true);
  from = illi.mark();
  await pick(illi, "\x1b[B");
  expect(await illi.seen("● work", from)).toBe(true);
  from = illi.mark();
  illi.type("\x04");
  expect(await illi.seen("Ctrl+D again to quit · also ends profile default (at work)", from)).toBe(true);
  await Bun.sleep(2100);
  from = illi.mark();
  fs.writeFileSync(DONE, "");
  expect(await illi.seen("illi in profile default is done.", from)).toBe(true);
  illi.type("\x04");
  expect(await illi.proc.exited).toBe(0);
  illi.proc.terminal!.close();
}, 40000);

test("closing the terminal leaves no illi running, the profile hidden at work included", async () => {
  fs.rmSync(DONE, { force: true });
  const illi = start(CLAUDE);
  expect(await illi.seen("auto mode")).toBe(true);
  illi.type("go\r");
  expect(await illi.seen("tick")).toBe(true);
  const from = illi.mark();
  await pick(illi, "\x1b[B");
  expect(await illi.seen("● work", from)).toBe(true);
  const members = children(illi.proc.pid);
  const all = [...members, ...members.flatMap(children)];
  expect(members.length).toBe(2);
  illi.proc.terminal!.close();
  await illi.proc.exited;
  for (let k = 0; k < 100 && all.some(alive); k++) {
    await Bun.sleep(50);
  }
  expect(all.filter(alive)).toEqual([]);
  fs.writeFileSync(DONE, "");
}, 30000);
