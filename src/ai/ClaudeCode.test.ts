// ClaudeCode test
// ===============
// `bun test ClaudeCode.test.ts`. Claude Code stood in for by a script
// that plays a scene, named by the call's message: a turn runs Claude
// Code whole with illi's prompt after its own and illi's tools added
// (lean), the view's marked block cached for an hour, its stream shown
// live and logged, illi's tools by their own
// names, the tokens its first request read told (none if that was
// refused), and the model's window learned (by its canonical id) and kept,
// as a call with Claude Code's compaction off tells it (one with it on
// tells its autocompact window: none learned). The Claude plan's windows
// are asked as soon as its account is in use, as a turn has them, on
// Claude Code's control channel, no model called: each learned and
// kept, asked once an account (another asked anew); one that won't
// read, none told, or no Claude Code changes nothing; a call without tools has none of Claude Code's, an agent's tools list
// only the built-in ones it names (--tools); a message sent mid-run is
// taken as it is echoed, one sent after the end left, as is one sent to
// a call once (a recap), never written; a plan's limit, a missing login, a chat
// too long (grown, once a tool's result came back; the message its API
// error stands in never a reply) and a crash end it in plain words, a
// request holding more cache marks than the API takes ends it `marks`
// (a reply begun cut), a
// turn's call (its room set) with Claude Code's compaction off, so illi
// folds the chat; a stop cuts it; a missing
// CLI says to install it. A rate limit event's 5-hour and weekly windows
// are the Claude plan's use (each its share used and reset, kept till
// told again; a model's own window left out). Claude Code's own MCP
// servers, as a call's init tells them, are kept (illi's left out; one
// a call cut, its tools as told before), and their names, case and
// all; one `off` names leaves illi's calls by a rule; an agent's tools
// list keeps those it names (a server, its tools, mcp: all), naming
// none its call loads none (--strict-mcp-config); illi's own server of
// a name wins while it runs, told or not (failed: Claude Code's stays).
// Before any call of the run told them, the rules are by name: those
// `off` names (case and all as told before), illi's own servers' and,
// for an agent's list, those ever told it doesn't name; a list naming
// one that could load loads it, and the call tells them, one named by
// its tools alone whole, its tools then told; a list naming only
// servers off or illi's own loads none. A name is spelled as Claude
// Code spells it in its tools'. A Claude plan's account in use is the
// Claude Code folder its calls run in (the user's own: as the
// environment names it); a switch drops what the other's calls told.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-claude-code-");
process.env.ILLI_DIR = DIR;
process.env.FAKE_LOG = DIR + "/log.json";

const { ClaudeCode } = await import("./ClaudeCode.ts");
const { Pick } = await import("./Pick.ts");
const { Mcp } = await import("../tools/Mcp.ts");
const config = await import("../config/Config.ts");
const { Accounts } = await import("../config/Accounts.ts");

// a stand-in MCP server of illi's own: it starts, and lists one tool
// (at /bad, it fails)
const OWN = Bun.serve({
  port: 0,
  async fetch(req) {
    if (new URL(req.url).pathname === "/bad") {
      return new Response("down", { status: 500 });
    }
    const msg: any = await req.json();
    const result = msg.method === "initialize" ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "own" } } : { tools: [{ name: "get_issue", inputSchema: { type: "object" } }] };
    return msg.id === undefined ? new Response(null, { status: 202 }) : Response.json({ jsonrpc: "2.0", id: msg.id, result });
  },
});

afterAll(() => {
  OWN.stop(true);
  fs.rmSync(DIR, { recursive: true, force: true });
});

// the stand-in: logs its arguments, illi's prompt and its input; echoes
// each message as Claude Code does (--replay-user-messages); plays the
// scene its first message names. Asked a model's window on its control
// channel, it answers it as FAKE_SIZES has it (junk: a line that won't
// read), each asking noted in asked.txt beside the log
const FAKE = String.raw`#!/usr/bin/env bun
const fs = require("node:fs");
const args = process.argv.slice(2);
const file = args.includes("--append-system-prompt-file") ? args[args.indexOf("--append-system-prompt-file") + 1] : null;
const log = { args, prompt: file === null ? null : fs.readFileSync(file, "utf8"), input: [], compact: process.env.DISABLE_COMPACT ?? null, folder: process.env.CLAUDE_CONFIG_DIR ?? null };
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
if (first.type === "control_request") {
  const model = args[args.indexOf("--model") + 1];
  const size  = JSON.parse(process.env.FAKE_SIZES ?? "{}")[model];
  fs.appendFileSync(require("node:path").dirname(process.env.FAKE_LOG) + "/asked.txt", JSON.stringify({ model, args, compact: log.compact, folder: log.folder, asked: first.request }) + "\n");
  process.stdout.write(size === "junk" ? "junk\n" : JSON.stringify({ type: "control_response", response: { subtype: "success", request_id: first.request_id, response: { model, rawMaxTokens: size } } }) + "\n");
  process.exit(0);
}
const scene = first.message.content.map((c) => c.text).join("");
// init: illi's server, and, unless --strict-mcp-config, Claude Code's own
// (init.json beside the log), their tools but those a rule denies
const strict = args.includes("--strict-mcp-config");
const deny = args.includes("--disallowedTools") ? args[args.indexOf("--disallowedTools") + 1].split(",") : [];
const told = fs.existsSync(require("node:path").dirname(process.env.FAKE_LOG) + "/init.json") ? JSON.parse(fs.readFileSync(require("node:path").dirname(process.env.FAKE_LOG) + "/init.json", "utf8")) : { mcp_servers: [], tools: [] };
const tools = ["mcp__illi__zoom", ...(strict ? [] : told.tools)].filter((t) => !deny.some((r) => (r.endsWith("__*") ? t.startsWith(r.slice(0, -1)) : t === r)));
out({ type: "system", subtype: "init", mcp_servers: [{ name: "illi", status: "connected" }, ...(strict ? [] : told.mcp_servers)], tools });
if (scene.includes("turn")) {
  ev({ type: "message_start", message: { usage: { input_tokens: 10, cache_read_input_tokens: 90 } } });
  ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
  ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } });
  ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } });
  out({ type: "assistant", message: { content: [{ type: "text", text: "Hello" }], usage: { input_tokens: 10, cache_read_input_tokens: 90 } }, parent_tool_use_id: null });
  out({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "mcp__illi__zoom", input: { id: 3 } }] }, parent_tool_use_id: null });
  out({ type: "assistant", message: { content: [{ type: "text", text: "a subagent's step" }] }, parent_tool_use_id: "task-1" });
  out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "line 3" }] }] }, parent_tool_use_id: null });
  result({ result: "Hello", modelUsage: { "claude-opus-5-5[1m]": { contextWindow: 1000000, canonicalModel: "claude-opus-5-5" } } });
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
} else if (scene.includes("grown")) {
  ev({ type: "message_start", message: { usage: { input_tokens: 5, cache_creation_input_tokens: 20, cache_read_input_tokens: 175 } } });
  out({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "mcp__illi__zoom", input: { id: 3 } }] }, parent_tool_use_id: null });
  out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "line 3" }] }] }, parent_tool_use_id: null });
  out({ type: "assistant", message: { model: "<synthetic>", content: [{ type: "text", text: "Prompt is too long" }] }, error: "invalid_request", is_api_error_message: true, parent_tool_use_id: null });
  result({ is_error: true, result: "Prompt is too long" });
} else if (scene.includes("marks")) {
  const why = "API Error: 400 A maximum of 4 blocks with cache_control may be provided. Found 5.";
  out({ type: "assistant", message: { content: [{ type: "text", text: "Looking." }] }, parent_tool_use_id: null });
  out({ type: "assistant", message: { model: "<synthetic>", content: [{ type: "text", text: why }] }, error: "unknown", is_api_error_message: true, api_error_status: 400, parent_tool_use_id: null });
  result({ is_error: true, api_error_status: 400, terminal_reason: "api_error", result: why });
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

// a call on opus with `text` as its message (tools: illi's, as a turn's;
// more: the ask's other fields, an agent's tools list), run to its end:
// its events, end and log
async function call(text: string, tools = true, during?: (c: any, events: any[]) => Promise<void>, more: object = {}) {
  const events: any[] = [];
  const ask = { vendor: "claude-code", model: "claude-opus-5-5", effort: "high", speed: "slow", system: "illi's prompt", blocks: [{ text: "the view", mark: true }, { text: text, mark: true }], searches: 0, server: tools ? "http://127.0.0.1:1/key/main" : "", ...more } as any;
  const c = ClaudeCode.ask(ask, (ev) => events.push(ev));
  await during?.(c, events);
  const end = await c.done;
  return { events, end, log: JSON.parse(fs.readFileSync(DIR + "/log.json", "utf8")), c };
}

// Claude Code's own servers as its next calls' init tells them, but
// those --strict-mcp-config or a rule leaves out (the fake's)
const INIT = {
  mcp_servers: [{ name: "github", status: "connected" }, { name: "claude.ai Gmail", status: "connected" }, { name: "plugin:p:db", status: "needs-auth" }, { name: "notes", status: "connected" }],
  tools: ["mcp__github__get_issue", "mcp__github__list_prs", "mcp__claude_ai_Gmail__search", "mcp__claude_ai_Gmail__send", "mcp__notes__add", "mcp__notes__find", "mcp__notes__drop"],
};

// illi's own MCP server `name` started (the stand-in), or failing
const own = (name: string, ok = true) => Mcp.open(name, { def: { type: "http", url: OWN.url.href + (ok ? "" : "bad") }, file: DIR + "/mcp.json", plugin: null, vars: {} }, DIR);

// a call's rules (--disallowedTools), and whether it loads none of
// Claude Code's servers (--strict-mcp-config)
const denied = (args: string[]) => args[args.indexOf("--disallowedTools") + 1];
const strict = (args: string[]) => args.includes("--strict-mcp-config");

const until = async (ok: () => boolean) => {
  for (let k = 0; !ok(); k++) {
    if (k > 400) {
      throw new Error("never");
    }
    await Bun.sleep(5);
  }
};

test("before any call of the run has told Claude Code's servers: by name, those off (case and all as told before), illi's own and, for an agent's list, those ever told it doesn't name leave the call; a list that names one that could load loads it, and the call tells them all; one naming only servers off or illi's own loads none", async () => {
  fs.writeFileSync(DIR + "/claude-code.json", JSON.stringify({ servers: ["claude.ai Gmail", "notes", "slack"] }));
  config.config_set("off", "claude.ai gmail, linear, illi");
  await own("github");
  await own("docs", false);
  const listed = (await call("turn", true, undefined, { listed: ["read", "mcp__github", "mcp__linear__find"] })).log.args;
  expect(strict(listed)).toBe(true);
  expect(JSON.parse(listed[listed.indexOf("--mcp-config") + 1]).mcpServers.illi.url).toBe("http://127.0.0.1:1/key/main?lean");
  expect(denied(listed)).toBe("AskUserQuestion");
  expect(ClaudeCode.servers()).toBeNull();
  const main = "http://127.0.0.1:1/key/main";
  expect(ClaudeCode.cut({ server: main } as any)).toEqual({ strict: false, deny: ["mcp__github__*", "mcp__claude_ai_Gmail__*", "mcp__linear__*"] });
  expect(ClaudeCode.cut({ server: main, listed: ["mcp__docs"] } as any)).toEqual({ strict: false, deny: ["mcp__github__*", "mcp__claude_ai_Gmail__*", "mcp__notes__*", "mcp__slack__*", "mcp__linear__*"] });
  // notes, never told its tools, loads whole in the call, which tells them
  fs.writeFileSync(DIR + "/init.json", JSON.stringify(INIT));
  const first = (await call("turn", true, undefined, { listed: ["read", "mcp__notes__find"] })).log.args;
  expect(strict(first)).toBe(false);
  expect(denied(first)).toBe("AskUserQuestion,mcp__github__*,mcp__claude_ai_Gmail__*,mcp__slack__*,mcp__linear__*");
  expect(ClaudeCode.servers()).toEqual([
    { name: "github", status: "connected", tools: null, off: false, over: true },
    { name: "claude.ai Gmail", status: "connected", tools: null, off: true, over: false },
    { name: "plugin:p:db", status: "needs-auth", tools: [], off: false, over: false },
    { name: "notes", status: "connected", tools: ["mcp__notes__add", "mcp__notes__find", "mcp__notes__drop"], off: false, over: false },
  ]);
  expect(JSON.parse(fs.readFileSync(DIR + "/claude-code.json", "utf8"))).toEqual({ servers: ["claude.ai Gmail", "github", "notes", "plugin:p:db", "slack"] });
  expect(denied((await call("turn", true, undefined, { listed: ["read", "mcp__notes__find"] })).log.args)).toBe("AskUserQuestion,mcp__github__*,mcp__claude_ai_Gmail__*,mcp__plugin_p_db__*,mcp__notes__add,mcp__notes__drop");
  config.config_set("off", null);
  fs.rmSync(DIR + "/init.json");
  Mcp.fail(Mcp.status().servers.find((s) => s.name === "github")!, "stopped");
});

test("a turn runs Claude Code whole, illi's prompt after its own and illi's tools added; its stream shown and logged, the tokens its first request read told", async () => {
  const { events, end, log } = await call("turn", true, undefined, { room: 900 });
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
  expect(end).toMatchObject({ ok: true, text: "Hello", left: [], first: 100 });
  expect(Pick.window({ vendor: "claude-code", model: "opus-5.5", effort: "high", speed: "slow" })).toBe(1000000);
  expect(JSON.parse(fs.readFileSync(DIR + "/models.json", "utf8")).vendors["claude-code"].find((m: any) => m.label === "opus-5.5").window).toBe(1000000);
  expect(fs.existsSync(log.args[log.args.indexOf("--append-system-prompt-file") + 1])).toBe(false);
});

test("the Claude plan's windows are asked as soon as its account is in use, as a turn has them, no model called: each learned and kept, asked once an account; junk, none told or no Claude Code change nothing; a call with compaction on tells no window", async () => {
  const opus   = { vendor: "claude-code", model: "opus-5.5", effort: "high", speed: "slow" } as const;
  const sonnet = { ...opus, model: "sonnet-5.5" };
  const haiku  = { ...opus, model: "haiku-5.5" };
  const asked  = () => (fs.existsSync(DIR + "/asked.txt") ? fs.readFileSync(DIR + "/asked.txt", "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
  process.env.FAKE_SIZES = JSON.stringify({ "claude-opus-5-5": 990000, "claude-sonnet-5-5": 500000, "claude-haiku-5-5": "junk" });
  try {
    expect(await ClaudeCode.models()).toBe(true);
    expect([Pick.window(opus), Pick.window(sonnet), Pick.window(haiku), Pick.window({ ...opus, model: "fable-5.1" })]).toEqual([990000, 500000, 200000, 200000]);
    expect(JSON.parse(fs.readFileSync(DIR + "/models.json", "utf8")).vendors["claude-code"].find((m: any) => m.label === "sonnet-5.5").window).toBe(500000);
    const all = asked();
    expect(all.map((a) => a.model).sort()).toEqual(["claude-fable-5-1", "claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5"]);
    expect(all.every((a) => a.compact === "1" && a.args.includes("--strict-mcp-config") && a.args.includes("--no-session-persistence") && a.args[a.args.indexOf("--tools") + 1] === "")).toBe(true);
    expect(all[0].asked).toEqual({ subtype: "get_context_usage", detail: "summary" });
    expect(await ClaudeCode.models()).toBe(true);
    expect(asked().length).toBe(4);
    await call("turn");
    expect(Pick.window(opus)).toBe(990000);
    await call("turn", true, undefined, { room: 900 });
    expect(Pick.window(opus)).toBe(1000000);
    const me = (id: string) => ({ id, email: id + "@example.com", plan: "max", org: "" });
    Accounts.write(config.ROOT, { "claude-code": { use: "c1", accounts: [me("own"), me("c1")] } });
    config.config_accounts(true);
    process.env.FAKE_SIZES = "{}";
    expect(await ClaudeCode.models()).toBe(false);
    expect([asked().length, asked().at(-1).folder]).toEqual([8, config.ROOT + "/claude/c1"]);
    const bin = ClaudeCode.bin;
    ClaudeCode.bin = DIR + "/no-such-claude";
    try {
      expect(await ClaudeCode.size("", "claude-opus-5-5")).toBe(0);
    } finally {
      ClaudeCode.bin = bin;
    }
  } finally {
    delete process.env.FAKE_SIZES;
    Accounts.write(config.ROOT, {});
    config.config_accounts(true);
  }
});

test("a call without tools has none of Claude Code's, nor its MCP servers, commands or hooks", async () => {
  const { log } = await call("turn", false);
  expect(log.args.slice(log.args.indexOf("--tools"), log.args.indexOf("--tools") + 2)).toEqual(["--tools", ""]);
  expect(log.args).toContain("--strict-mcp-config");
  expect(log.args).toContain("--disable-slash-commands");
  expect(log.args).not.toContain("--mcp-config");
  expect(JSON.parse(log.args[log.args.indexOf("--settings") + 1])).toEqual({ disableAllHooks: true });
});

test("an agent's tools list keeps Claude Code's own to those it names (none named: none); no list keeps them all", () => {
  const ask = { vendor: "claude-code", model: "claude-opus-5-5", effort: "high", speed: "slow", system: "", blocks: [], searches: 0, server: "http://127.0.0.1:1/key/sub" } as any;
  const tools = (builtins?: string[] | null) => {
    const args = ClaudeCode.args({ ...ask, builtins }, "prompt.md");
    expect(args.slice(args.indexOf("--permission-prompt-tool"), args.indexOf("--permission-prompt-tool") + 2)).toEqual(["--permission-prompt-tool", "mcp__illi__approve"]);
    return args.includes("--tools") ? args[args.indexOf("--tools") + 1] : null;
  };
  expect(tools(["Read", "Grep", "Bash"])).toBe("Read,Grep,Bash");
  expect(tools([])).toBe("");
  expect(tools(null)).toBeNull();
  expect(tools()).toBeNull();
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

test("a call once (a recap) takes no message sent mid-run: it is left for the next call, never written to Claude Code", async () => {
  const { events, end, log } = await call("send", true, async (c) => {
    await until(() => fs.existsSync(DIR + "/log.json") && JSON.parse(fs.readFileSync(DIR + "/log.json", "utf8")).input.length === 1);
    c.send({ text: "and this", imgs: [] });
  }, { once: true });
  expect(events.filter((e) => e.$ === "Entry" && e.kind === "user")).toEqual([]);
  expect([end.ok, end.left, log.input.length]).toEqual([true, [{ text: "and this", imgs: [] }], 1]);
});

test("a plan's limit, a missing login, a chat too long (grown once a tool's result came back) and a crash end the call in plain words", async () => {
  const limit = (await call("limit")).end;
  expect(limit).toMatchObject({ ok: false, stop: "down", again: true });
  expect(limit.text).toMatch(/^your Claude plan's usage limit is reached: it resets at (\w{3} )?\d\d:\d\d; \/model picks another model meanwhile$/);
  expect((await call("login")).end).toMatchObject({ ok: false, stop: "down", text: "Claude Code isn't logged in: /login signs in to your Claude plan, then send a message" });
  const long = (await call("long")).end;
  expect([long, long.first]).toMatchObject([{ ok: false, stop: "full", grew: false }, undefined]);
  const grown = await call("grown", true, undefined, { room: 900 });
  expect(grown.end).toMatchObject({ ok: false, stop: "full", grew: true, cut: false, first: 200 });
  expect(grown.events.filter((e) => e.$ === "Entry" && e.kind === "illi")).toEqual([]);
  expect(grown.log.compact).toBe("1");
  expect((await call("long", true)).log.compact).toBeNull();
  expect((await call("crash")).end).toMatchObject({ ok: false, stop: "down", text: "boom" });
});

test("a request holding more cache marks than the API takes (Claude Code's own four beside illi's) ends the call `marks`, a reply begun cut", async () => {
  const { events, end } = await call("marks");
  expect(end).toMatchObject({ ok: false, stop: "marks", cut: true, text: "API Error: 400 A maximum of 4 blocks with cache_control may be provided. Found 5." });
  expect(events.filter((e) => e.$ === "Entry" && e.kind === "illi").map((e) => e.text)).toEqual(["Looking."]);
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
    expect(end).toMatchObject({ ok: false, stop: "down", text: "Claude Code isn't installed here: install it (code.claude.com), then /login connects your Claude plan" });
  } finally {
    ClaudeCode.bin = bin;
  }
});

test("a rate limit event's windows are the Claude plan's use at the side: each window's share and reset, kept till told again; one a model's own left out", () => {
  const at = Math.floor(Date.now() / 1000) + 3600;
  ClaudeCode.windows({ status: "allowed", unifiedWindows: { five_hour: { utilization: 0.34, resetsAt: at, status: "allowed" } } });
  expect(ClaudeCode.told()).toEqual({ brand: "Claude", tier: "", limits: [{ window: 300, used: 34, reset: at * 1000 }] });
  ClaudeCode.windows({ unifiedWindows: { seven_day: { utilization: 0.071, resetsAt: at + 86400 }, seven_day_opus: { utilization: 0.5, resetsAt: at } } });
  expect(ClaudeCode.told()!.limits).toEqual([{ window: 300, used: 34, reset: at * 1000 }, { window: 10080, used: 7.1, reset: (at + 86400) * 1000 }]);
  ClaudeCode.windows({ status: "rejected", resetsAt: at });
  expect(ClaudeCode.told()!.limits.length).toBe(2);
});

test("Claude Code's servers its init tells are kept, but illi's own; one off leaves illi's calls by a rule, its tools as told before", async () => {
  fs.writeFileSync(DIR + "/init.json", JSON.stringify(INIT));
  await call("turn");
  expect(ClaudeCode.servers()!.map((s) => [s.name, s.tools?.length ?? null])).toEqual([["github", 2], ["claude.ai Gmail", 2], ["plugin:p:db", 0], ["notes", 3]]);
  expect(ClaudeCode.servers()!.some((s) => s.name === "illi")).toBe(false);
  config.config_set("off", "claude.ai gmail, notes");
  const { log } = await call("turn");
  expect(strict(log.args)).toBe(false);
  expect(denied(log.args)).toBe("AskUserQuestion,mcp__claude_ai_Gmail__*,mcp__notes__*");
  expect(ClaudeCode.servers()!.map((s) => [s.name, s.off, s.tools?.length ?? null])).toEqual([["github", false, 2], ["claude.ai Gmail", true, 2], ["plugin:p:db", false, 0], ["notes", true, 3]]);
  config.config_set("off", null);
  expect(denied((await call("turn")).log.args)).toBe("AskUserQuestion");
});

test("an agent's tools list keeps of Claude Code's servers those it names (a server, its tools, or mcp: all); naming none, its call loads none; one it names that wasn't told loads if it's there, every one told but named left out; a call without tools loads none either way", async () => {
  fs.writeFileSync(DIR + "/init.json", JSON.stringify(INIT));
  await call("turn");
  const args = async (listed: string[]) => (await call("turn", true, undefined, { listed })).log.args;
  expect(denied(await args(["read", "mcp__claude_ai_Gmail"]))).toBe("AskUserQuestion,mcp__github__*,mcp__plugin_p_db__*,mcp__notes__*");
  expect(denied(await args(["mcp__notes__find"]))).toBe("AskUserQuestion,mcp__github__*,mcp__claude_ai_Gmail__*,mcp__plugin_p_db__*,mcp__notes__add,mcp__notes__drop");
  expect(denied(await args(["mcp"]))).toBe("AskUserQuestion");
  for (const listed of [["read", "zoom"], []]) {
    const got = await args(listed);
    expect([listed, strict(got), denied(got)]).toEqual([listed, true, "AskUserQuestion"]);
  }
  const linear = await args(["mcp__linear"]);
  expect([strict(linear), denied(linear)]).toEqual([false, "AskUserQuestion,mcp__github__*,mcp__claude_ai_Gmail__*,mcp__plugin_p_db__*,mcp__notes__*"]);
  expect(ClaudeCode.servers()!.map((s) => s.tools?.length ?? null)).toEqual([2, 2, 0, 3]);
  config.config_set("off", "notes");
  expect(strict(await args(["mcp__notes"]))).toBe(true);
  config.config_set("off", null);
  const none = ClaudeCode.args({ vendor: "claude-code", model: "m", effort: "low", speed: "slow", system: "", blocks: [], searches: 0, server: "", listed: ["mcp"] } as any, "prompt.md");
  expect([strict(none), none.includes("--mcp-config"), none.includes("--disallowedTools")]).toEqual([true, false, false]);
});

test("a server both illi's own and Claude Code's: illi's wins while it runs, so the model gets one copy, though Claude Code's wasn't told yet; failed, Claude Code's stays", async () => {
  fs.writeFileSync(DIR + "/init.json", JSON.stringify(INIT));
  await own("github");
  await own("web");
  const { log } = await call("turn");
  expect(denied(log.args)).toBe("AskUserQuestion,mcp__github__*,mcp__web__*");
  Mcp.fail(Mcp.status().servers.find((s) => s.name === "web")!, "stopped");
  expect(denied((await call("turn")).log.args)).toBe("AskUserQuestion,mcp__github__*");
  expect(ClaudeCode.servers()!.find((s) => s.name === "github")).toMatchObject({ over: true, tools: ["mcp__github__get_issue", "mcp__github__list_prs"] });
  expect(strict((await call("turn", true, undefined, { listed: ["mcp__github"] })).log.args)).toBe(true);
  Mcp.fail(Mcp.status().servers.find((s) => s.name === "github")!, "stopped");
  expect(denied((await call("turn")).log.args)).toBe("AskUserQuestion");
  expect(ClaudeCode.servers()!.find((s) => s.name === "github")!.over).toBe(false);
});

test("a server's name as Claude Code spells it in its tools': a character it doesn't take as _, a claude.ai connector's runs of _ as one, none at its ends", () => {
  expect(ClaudeCode.spell("my.server")).toBe("my_server");
  expect(ClaudeCode.spell("plugin:my-plugin:database-tools")).toBe("plugin_my-plugin_database-tools");
  expect(ClaudeCode.spell("claude.ai Claude Docs")).toBe("claude_ai_Claude_Docs");
  expect(ClaudeCode.spell("claude.ai Box (Beta)")).toBe("claude_ai_Box_Beta");
  expect(ClaudeCode.spell("odd  name.")).toBe("odd__name_");
});

test("a Claude plan's account in use is a Claude Code folder its calls run in (the user's own: as the environment names it); a switch drops what the other's calls told, its servers and its plan's use", async () => {
  fs.writeFileSync(DIR + "/init.json", JSON.stringify(INIT));
  const was = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = DIR + "/mine";
  try {
    expect((await call("turn")).log.folder).toBe(DIR + "/mine");
    ClaudeCode.windows({ unifiedWindows: { five_hour: { utilization: 0.5, resetsAt: Math.floor(Date.now() / 1000) + 3600 } } });
    expect([ClaudeCode.servers()?.length, ClaudeCode.told() !== null]).toEqual([4, true]);
    const me = (id: string) => ({ id, email: id + "@example.com", plan: "max", org: "" });
    Accounts.write(config.ROOT, { "claude-code": { use: "c1", accounts: [me("own"), me("c1")] } });
    config.config_accounts(true);
    expect([config.config_claude_dir(), ClaudeCode.servers(), ClaudeCode.told()]).toEqual([config.ROOT + "/claude/c1", null, null]);
    expect((await call("turn")).log.folder).toBe(config.ROOT + "/claude/c1");
    Accounts.write(config.ROOT, { "claude-code": { use: "own", accounts: [me("own"), me("c1")] } });
    config.config_accounts(true);
    expect([ClaudeCode.servers(), (await call("turn")).log.folder]).toEqual([null, DIR + "/mine"]);
  } finally {
    was === undefined ? delete process.env.CLAUDE_CONFIG_DIR : (process.env.CLAUDE_CONFIG_DIR = was);
    Accounts.write(config.ROOT, {});
    config.config_accounts(true);
  }
});
