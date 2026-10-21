// ClaudeCode test
// ===============
// `bun test ClaudeCode.test.ts`. Claude Code stood in for by a script
// that plays a scene, named by the call's message: a turn runs Claude
// Code whole with illi's prompt after its own and illi's tools added
// (lean), the view's marked block cached for an hour, its stream shown
// live and logged, illi's tools by their own
// names, and the model's window learned; a call without tools has none
// of Claude Code's; a message sent mid-run is taken as it is echoed, one
// sent after the end is left; a plan's limit, a missing login, a chat
// too long and a crash end it in plain words; a stop cuts it; a missing
// CLI says to install it.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-claude-code-");
process.env.ILLI_DIR = DIR;
process.env.FAKE_LOG = DIR + "/log.json";

const { ClaudeCode } = await import("./ClaudeCode.ts");
const { Pick } = await import("./Pick.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// the stand-in: logs its arguments, illi's prompt and its input; echoes
// each message as Claude Code does (--replay-user-messages); plays the
// scene its first message names
const FAKE = String.raw`#!/usr/bin/env bun
const fs = require("node:fs");
const args = process.argv.slice(2);
const file = args[args.indexOf("--append-system-prompt-file") + 1];
const log = { args, prompt: fs.readFileSync(file, "utf8"), input: [] };
const save = () => fs.writeFileSync(process.env.FAKE_LOG, JSON.stringify(log));
const out = (m) => process.stdout.write(JSON.stringify(m) + "\n");
const ev = (event) => out({ type: "stream_event", event, parent_tool_use_id: null });
const result = (m) => out({ type: "result", subtype: "success", is_error: false, ...m });
const lines = console[Symbol.asyncIterator]();
const next = async (ms) => {
  const got = await Promise.race([lines.next(), Bun.sleep(ms).then(() => null)]);
  if (got === null || got.done) return null;
  const m = JSON.parse(got.value);
  log.input.push(m);
  save();
  out({ ...m, isReplay: true });
  return m;
};
const first = await next(5000);
const scene = first.message.content.map((c) => c.text).join("");
out({ type: "system", subtype: "init", mcp_servers: [{ name: "illi", status: "connected" }] });
if (scene.includes("turn")) {
  ev({ type: "message_start", message: { usage: { input_tokens: 10, cache_read_input_tokens: 90 } } });
  ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
  ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } });
  ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } });
  out({ type: "assistant", message: { content: [{ type: "text", text: "Hello" }], usage: { input_tokens: 10, cache_read_input_tokens: 90 } }, parent_tool_use_id: null });
  out({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "mcp__illi__zoom", input: { id: 3 } }] }, parent_tool_use_id: null });
  out({ type: "assistant", message: { content: [{ type: "text", text: "a subagent's step" }] }, parent_tool_use_id: "task-1" });
  out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "line 3" }] }] }, parent_tool_use_id: null });
  result({ result: "Hello", modelUsage: { "claude-opus-5-5": { contextWindow: 1000000 } } });
} else if (scene.includes("send")) {
  await next(3000);
  result({ result: "got both" });
} else if (scene.includes("limit")) {
  out({ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: Math.floor(Date.now() / 1000) + 3600 } });
  result({ is_error: true, api_error_status: 429, result: "Claude AI usage limit reached" });
} else if (scene.includes("login")) {
  result({ is_error: true, result: "Not logged in · Please run /login" });
} else if (scene.includes("long")) {
  result({ is_error: true, result: "Prompt is too long" });
} else if (scene.includes("crash")) {
  process.stderr.write("boom\n");
  process.exit(3);
} else if (scene.includes("hang")) {
  ev({ type: "message_start", message: { usage: {} } });
  ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
  ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "half a rep" } });
  await Bun.sleep(30000);
}
while ((await next(5000)) !== null) {}
process.exit(0);
`;
fs.writeFileSync(DIR + "/claude", FAKE, { mode: 0o755 });
ClaudeCode.bin = DIR + "/claude";

// a call on opus with `text` as its message (tools: illi's, as a turn's),
// run to its end: its events, end and log
async function call(text: string, tools = true, during?: (c: any, events: any[]) => Promise<void>) {
  const events: any[] = [];
  const ask = { vendor: "claude-code", model: "claude-opus-5-5", effort: "high", speed: "slow", system: "illi's prompt", blocks: [{ text: "the view", mark: true }, { text: text, mark: true }], searches: 0, server: tools ? "http://127.0.0.1:1/key/main" : "" } as any;
  const c = ClaudeCode.ask(ask, (ev) => events.push(ev));
  await during?.(c, events);
  const end = await c.done;
  return { events, end, log: JSON.parse(fs.readFileSync(DIR + "/log.json", "utf8")), c };
}

const until = async (ok: () => boolean) => {
  for (let k = 0; !ok(); k++) {
    if (k > 400) {
      throw new Error("never");
    }
    await Bun.sleep(5);
  }
};

test("a turn runs Claude Code whole, illi's prompt after its own and illi's tools added; its stream shown and logged", async () => {
  const { events, end, log } = await call("turn");
  expect(log.args).toContain("--mcp-config");
  expect(JSON.parse(log.args[log.args.indexOf("--mcp-config") + 1])).toEqual({ mcpServers: { illi: { type: "http", url: "http://127.0.0.1:1/key/main?lean", timeout: 86400000 } } });
  expect(log.args.slice(log.args.indexOf("--allowedTools"), log.args.indexOf("--allowedTools") + 2)).toEqual(["--allowedTools", "mcp__illi"]);
  expect(log.args.slice(log.args.indexOf("--disallowedTools"), log.args.indexOf("--disallowedTools") + 2)).toEqual(["--disallowedTools", "AskUserQuestion"]);
  expect(log.args.slice(log.args.indexOf("--permission-prompt-tool"), log.args.indexOf("--permission-prompt-tool") + 2)).toEqual(["--permission-prompt-tool", "mcp__illi__approve"]);
  expect(log.args).not.toContain("--tools");
  expect(log.args).not.toContain("--system-prompt");
  expect(log.args.slice(log.args.indexOf("--model"), log.args.indexOf("--model") + 4)).toEqual(["--model", "claude-opus-5-5", "--effort", "high"]);
  expect(log.prompt).toBe("illi's prompt");
  expect(log.input[0].message.content).toEqual([{ type: "text", text: "the view", cache_control: { type: "ephemeral", ttl: "1h" } }, { type: "text", text: "turn" }]);
  expect(events.filter((e) => e.$ === "Delta").map((e) => e.text)).toEqual(["Hel", "lo"]);
  const entries = events.filter((e) => e.$ === "Entry").map(({ kind, text, of }) => ({ kind, text, of }));
  expect(entries).toEqual([
    { kind: "illi", text: "Hello", of: undefined },
    { kind: "tool", text: 'zoom {"id":3}', of: "t1" },
    { kind: "echo", text: "line 3", of: "t1" },
  ]);
  expect(end).toMatchObject({ ok: true, text: "Hello", left: [] });
  expect(Pick.window({ vendor: "claude-code", model: "opus-5.5", effort: "high", speed: "slow" })).toBe(1000000);
  expect(fs.existsSync(log.args[log.args.indexOf("--append-system-prompt-file") + 1])).toBe(false);
});

test("a call without tools has none of Claude Code's, nor its MCP servers, commands or hooks", async () => {
  const { log } = await call("turn", false);
  expect(log.args.slice(log.args.indexOf("--tools"), log.args.indexOf("--tools") + 2)).toEqual(["--tools", ""]);
  expect(log.args).toContain("--strict-mcp-config");
  expect(log.args).toContain("--disable-slash-commands");
  expect(log.args).not.toContain("--mcp-config");
  expect(JSON.parse(log.args[log.args.indexOf("--settings") + 1])).toEqual({ disableAllHooks: true });
});

test("a message sent mid-run is taken as Claude Code echoes it; one sent after the end is left", async () => {
  const { events, end, c } = await call("send", true, async (c) => {
    await until(() => fs.existsSync(DIR + "/log.json") && JSON.parse(fs.readFileSync(DIR + "/log.json", "utf8")).input.length === 1);
    c.send({ text: "and this", imgs: [] });
  });
  expect(events.filter((e) => e.$ === "Entry" && e.kind === "user").map((e) => e.text)).toEqual(["and this"]);
  expect(end).toMatchObject({ ok: true, text: "got both", left: [] });
  c.send({ text: "too late", imgs: [] });
  expect(end.left).toEqual([]);
});

test("a plan's limit, a missing login, a chat too long and a crash end the call in plain words", async () => {
  const limit = (await call("limit")).end;
  expect(limit).toMatchObject({ ok: false, stop: "down", again: true });
  expect(limit.text).toMatch(/^your Claude plan's usage limit is reached: it resets at \d\d:\d\d; \/model picks another model meanwhile$/);
  expect((await call("login")).end).toMatchObject({ ok: false, stop: "down", text: "Claude Code isn't logged in: run claude in a terminal, log in there (/login), then send a message" });
  expect((await call("long")).end).toMatchObject({ ok: false, stop: "full" });
  expect((await call("crash")).end).toMatchObject({ ok: false, stop: "down", text: "boom" });
});

test("a stop cuts the call, what streamed logged as cut off; messages not taken are left", async () => {
  const { events, end } = await call("hang", true, async (c, events) => {
    await until(() => events.some((e) => e.$ === "Delta"));
    c.send({ text: "never read", imgs: [] });
    c.stop();
  });
  expect(end).toMatchObject({ ok: false, text: "stopped", stop: "lost" });
  expect(end.left.map((s: any) => s.text)).toEqual(["never read"]);
  expect(events.filter((e) => e.$ === "Entry").map((e) => e.text)).toEqual(["half a rep\n[cut off]"]);
});

test("a missing CLI says to install it", async () => {
  const bin = ClaudeCode.bin;
  ClaudeCode.bin = DIR + "/no-such-claude";
  try {
    const end = await ClaudeCode.ask({ vendor: "claude-code", model: "m", effort: "low", speed: "slow", system: "", blocks: [], searches: 0, server: "" } as any, () => {}).done;
    expect(end).toMatchObject({ ok: false, stop: "down", text: "Claude Code isn't installed here: install it (code.claude.com), log in with claude, then send a message" });
  } finally {
    ClaudeCode.bin = bin;
  }
});
