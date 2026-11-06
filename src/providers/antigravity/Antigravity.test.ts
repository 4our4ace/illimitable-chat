// Antigravity test
// ================
// `bun test Antigravity.test.ts`. Google's Antigravity CLI stood in for by
// a script that speaks the Agent Client Protocol (as the real 1.5.2 does:
// Live.test.ts) and plays a scene, named by the call's message; illi's
// tools by a stand-in server. A call runs the CLI as illi (its name and
// version), never signing it in (the sign-in its folder keeps), its own
// folder the account's (HOME, TMPDIR and --gemini-dir its own, no
// telemetry, no browser of its own, no updates of its own, no Gemini,
// Google or Antigravity key or setting of the environment's, nor its
// folders or session bus), in an empty folder; illi's prompt after
// Google's with how its tools are named and what of Google's doesn't
// apply; on the pick's model at its effort's thinking level; its
// session's files gone as it ends, each CLI's log as it ends, Google's
// old agent's sign-in and what the CLI left a day old as the first
// starts. Its words and thoughts stream live and are logged whole as the
// turn ends (a step's usage mid-stream splits nothing), the tokens its
// first step read told (a step's usage, else a one-step turn's whole),
// the model's window learned and kept. illi's tools reach the CLI
// through illi's forwarder, which logs each call with its answer (the
// CLI's own note of it, named mcp_illi_, isn't logged twice); the CLI's
// permission for them is given once; its web search and page reading are
// asked of the user through the call's tools URL (approve), allowed or
// refused as that answers, and logged with what they answered; a
// workspace's trust is refused. A call without tools has none, nor the
// web's. An error the CLI says as a message (a warning sign before it,
// or not) is never a reply: busy, too long (`full`), the plan's limit
// (when it resets; words streamed before it logged as cut off), a turn
// past its window; a model the account doesn't offer fails saying what
// it does. A stop cancels the turn, what streamed logged as cut off; a
// message sent mid-run is left. The CLIs run in a pool: calls at once
// share one, a spare stands ready, one ends once its calls did, all as
// illi ends. A CLI older than 1.5.2 is refused. No sign-in, or one run
// out, ends a call at once, never waiting on a browser, and /login offers
// a sign-in again; /login's sign-in tells Google's page's link, gives the
// CLI the code pasted, tells the plan and marks the folder signed in (the
// CLIs started before take no call); a wrong code, or a stop, says so;
// its logout logs the folder out. No account, or no CLI, says what to do.

import { afterAll, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-antigravity-");
for (const k of Object.keys(process.env).filter((k) => k.startsWith("ILLI_"))) {
  delete process.env[k];
}
process.env.ILLI_DIR       = DIR;
process.env.ILLI_VENDORS   = "claude-api";
process.env.FAKE_LOG       = DIR + "/log.jsonl";
process.env.GEMINI_API_KEY = "must-not-reach";
process.env.GOOGLE_API_KEY = "must-not-reach";
process.env.ANTIGRAVITY_APP_DATA_DIR = "must-not-reach";
process.env.XDG_CONFIG_HOME = "must-not-reach";
process.env.DBUS_SESSION_BUS_ADDRESS = "must-not-reach";
fs.writeFileSync(DIR + "/accounts.json", JSON.stringify({ antigravity: { use: "g1", accounts: [{ id: "g1", email: "", plan: "Google AI Pro", org: "" }] } }));

// the stand-in CLI: logs what it's started with and each request; leaves
// its log and a note of its start in its folder, as the real one does;
// signs in (--login) as the real one does, by the code pasted; plays the
// scene its prompt names
const FAKE = String.raw`
const fs = require("node:fs");
const log = (o) => fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ pid: process.pid, ...o }) + "\n");
const e = process.env;
log({ env: { HOME: e.HOME, TMPDIR: e.TMPDIR, BROWSER: e.BROWSER, NOUPDATE: e.AGY_CLI_DISABLE_AUTO_UPDATE, KEY: e.GEMINI_API_KEY ?? null, GOOGLE: e.GOOGLE_API_KEY ?? null, APPDATA: e.ANTIGRAVITY_APP_DATA_DIR ?? null, XDG: e.XDG_CONFIG_HOME ?? null, DBUS: e.DBUS_SESSION_BUS_ADDRESS ?? null }, args: process.argv.slice(2), cwd: process.cwd() });
const GEM = process.argv[process.argv.indexOf("--gemini-dir") + 1];
const HOME = GEM + "/antigravity-cli";
fs.mkdirSync(HOME + "/log", { recursive: true });
fs.mkdirSync(HOME + "/implicit", { recursive: true });
fs.writeFileSync(HOME + "/log/acp-server-20261106_120000-" + process.pid + ".log", "started");
fs.writeFileSync(HOME + "/implicit/" + crypto.randomUUID() + ".pb", "");
if (process.argv.includes("--login")) {
  process.stdout.write("Open this link in a browser to log in with Google:\n\n  https://accounts.google.com/o/oauth2/auth?x=1\n\nThen paste the authorization code, or the full URL of the page you land on, and press Enter:\n");
  (async () => {
    for await (const line of console) {
      log({ pasted: line });
      if (line.trim() === "good-code") {
        fs.writeFileSync(HOME + "/signed-in", "");
        process.stdout.write("Logged in.\n");
        process.exit(0);
      }
      process.stderr.write("Error: couldn't sign in: invalid_grant\n");
      process.exit(1);
    }
    process.stderr.write("Error: login cancelled: no authorization code was entered\n");
    process.exit(1);
  })();
}
const out = (m) => process.stdout.write(JSON.stringify(m) + "\n");
let next = 1000;
const waits = new Map();
const cancels = new Map();
const sessions = new Map();
const ask = (method, params) => new Promise((done) => { const id = ++next; waits.set(id, done); out({ jsonrpc: "2.0", id, method, params }); });
const update = (sessionId, u) => out({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: u } });
const say = (sid, text) => update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text } });
const think = (sid, text) => update(sid, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text } });
const used = (sid, n) => update(sid, { sessionUpdate: "usage_update", used: n, size: 1000000 });
const USAGE = { inputTokens: 1400, outputTokens: 100, totalTokens: 1500 };
const OPTS = [{ optionId: "allow_always", name: "Allow Always (risky)", kind: "allow_always" }, { optionId: "allow", name: "Allow", kind: "allow_once" }, { optionId: "deny", name: "Deny", kind: "reject_once" }];
const FAMILIES = ["gemini-4-argon", "gemini-3.8-flash", "claude-opus-test"];
const LISTED = ["gemini-4-argon-medium", "gemini-4-argon-high", "gemini-4-argon-low", "gemini-3.8-flash-high", "gemini-3.8-flash-medium", "gemini-3.8-flash-low", "claude-opus-test-thinking", "gpt-oss-test-medium"];
const options = (model) => [{ id: "model", currentValue: model, type: "select", category: "model", options: FAMILIES.map((value) => ({ value, name: value })) }, { id: "thinking_level", currentValue: "high", type: "select", category: "thought_level", options: ["low", "medium", "high"].map((value) => ({ value, name: value })) }, { id: "mode", currentValue: "default", type: "select", category: "mode", options: [{ value: "default", name: "Default" }] }];
const models = () => ({ availableModels: LISTED.map((modelId) => ({ modelId, name: modelId, description: modelId })), currentModelId: "gemini-3.8-flash-high" });
async function prompt(p) {
  const sid = p.sessionId;
  const scene = p.prompt.map((c) => c.text ?? "").join("");
  used(sid, 0);
  if (scene.includes("turn")) {
    think(sid, "thinking"); say(sid, "Hel"); used(sid, 1500); say(sid, "lo");
    return { stopReason: "end_turn", usage: USAGE };
  }
  if (scene.includes("tool")) {
    say(sid, "Let me "); say(sid, "look.");
    const call = { toolCallId: "m1", name: "mcp_illi_zoom", title: "Run mcp_illi_zoom", kind: "other", rawInput: { toolSummary: "zoom", id: 3 } };
    update(sid, { sessionUpdate: "tool_call", status: "pending", ...call });
    const ok = await ask("session/request_permission", { sessionId: sid, toolCall: call, options: OPTS });
    log({ permitted: "zoom", outcome: ok.result?.outcome });
    const res = await fetch(sessions.get(sid).mcp[0].url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "zoom", arguments: { id: 3 }, _meta: { progressToken: sid + ":1" } } }) });
    log({ mcp: await res.json() });
    update(sid, { sessionUpdate: "tool_call_update", toolCallId: "m1", status: "completed", content: [{ type: "content", content: { type: "text", text: "Calling MCP tool" } }] });
    used(sid, 1600); say(sid, "Done."); used(sid, 1700);
    return { stopReason: "end_turn", usage: USAGE };
  }
  if (scene.includes("web") || scene.includes("fetch")) {
    const call = scene.includes("web") ? { toolCallId: "w1", title: "Run search_web?", kind: "search", rawInput: { query: "illi agent" } } : { toolCallId: "f1", title: "Run read_url_content?", kind: "fetch", rawInput: { Url: "https://example.invalid/page" } };
    update(sid, { sessionUpdate: "tool_call", status: "pending", ...call });
    const ok = await ask("session/request_permission", { sessionId: sid, toolCall: call, options: OPTS });
    const yes = ok.result?.outcome?.optionId === "allow";
    log({ permitted: call.kind, outcome: ok.result?.outcome });
    update(sid, yes ? { sessionUpdate: "tool_call_update", toolCallId: call.toolCallId, status: "completed", content: [{ type: "content", content: { type: "text", text: "found: illi" } }] } : { sessionUpdate: "tool_call_update", toolCallId: call.toolCallId, status: "failed", rawOutput: "Rejected by user" });
    used(sid, 1600); say(sid, yes ? "Found it." : "Couldn't."); used(sid, 1700);
    return { stopReason: "end_turn", usage: USAGE };
  }
  if (scene.includes("trust")) {
    const ok = await ask("session/request_permission", { sessionId: sid, toolCall: { toolCallId: "t1", title: "Trust this workspace?", kind: "other" }, options: [{ optionId: "trust", name: "Trust Workspace", kind: "allow_once" }, { optionId: "untrust", name: "Don't Trust", kind: "reject_once" }] });
    log({ permitted: "trust", outcome: ok.result?.outcome });
    say(sid, "ok"); used(sid, 10);
    return { stopReason: "end_turn", usage: USAGE };
  }
  if (scene.includes("plain")) {
    say(sid, "plain");
    return { stopReason: "end_turn", usage: USAGE };
  }
  if (scene.includes("quiet")) {
    update(sid, { sessionUpdate: "tool_call", toolCallId: "q1", name: "mcp_illi_zoom", title: "Run mcp_illi_zoom", kind: "other", status: "in_progress", rawInput: { id: 1 } });
    update(sid, { sessionUpdate: "tool_call_update", toolCallId: "q1", name: "mcp_illi_zoom", status: "completed" });
    say(sid, "quiet");
    return { stopReason: "end_turn", usage: { ...USAGE, inputTokens: 2800 } };
  }
  if (scene.includes("busy")) {
    say(sid, "The model is overloaded. Please try again later.");
    return { stopReason: "end_turn" };
  }
  if (scene.includes("swamped")) {
    say(sid, "Done so far."); say(sid, "⚠ Servers are overloaded, try again later.");
    return { stopReason: "end_turn", usage: USAGE };
  }
  if (scene.includes("long")) {
    say(sid, "⚠ The input token count (2000000) exceeds the maximum number of tokens allowed (1048576).");
    return { stopReason: "end_turn" };
  }
  if (scene.includes("limit")) {
    say(sid, "Part "); say(sid, "one."); used(sid, 1500);
    say(sid, "Usage Limit Reached\n\nYou have reached your current quota for this period. Your limit will reset in 4 hours, 2 minutes.");
    return { stopReason: "refusal", usage: USAGE };
  }
  if (scene.includes("capped")) {
    think(sid, "pondering"); say(sid, "A long answer that ran"); used(sid, 1500); say(sid, " past the cap");
    return { stopReason: "max_tokens", usage: USAGE };
  }
  if (scene.includes("declined")) {
    say(sid, "I can't help with that.");
    return { stopReason: "refusal", usage: USAGE };
  }
  if (scene.includes("max")) {
    return { stopReason: "max_tokens", usage: USAGE };
  }
  if (scene.includes("deaf")) {
    say(sid, "Working");
    await new Promise(() => {});
  }
  if (scene.includes("sleepy")) {
    say(sid, "Calling");
    const asked = fetch(sessions.get(sid).mcp[0].url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "sleepy", arguments: {} } }) }).catch(() => {});
    await new Promise((done) => cancels.set(sid, done));
    return { stopReason: "cancelled", usage: USAGE };
  }
  if (scene.includes("slow")) {
    say(sid, "Working");
    await new Promise((done) => cancels.set(sid, done));
    return { stopReason: "cancelled", usage: USAGE };
  }
  if (scene.includes("hold")) {
    await new Promise((done) => setTimeout(done, scene.includes("more") ? 1500 : 400));
    say(sid, "held"); used(sid, 10);
    return { stopReason: "end_turn", usage: USAGE };
  }
  say(sid, "?"); used(sid, 1);
  return { stopReason: "end_turn", usage: USAGE };
}
async function handle(m) {
  switch (m.method) {
    case "initialize": return { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "Antigravity ACP Server", version: process.env.FAKE_VERSION ?? "1.5.2" }, authMethods: [{ id: "oauth-personal", name: "Log in with Google" }] };
    case "authenticate": return { _meta: { antigravity: { tier: { name: "Google AI Pro", id: "g1-pro-tier" } } } };
    case "session/new": {
      if (process.env.FAKE_SIGNEDOUT) {
        throw { code: -32000, message: "Authentication required" };
      }
      const sid = crypto.randomUUID();
      sessions.set(sid, { mcp: m.params.mcpServers });
      fs.mkdirSync(HOME + "/conversations", { recursive: true });
      fs.mkdirSync(HOME + "/brain/" + sid, { recursive: true });
      fs.writeFileSync(HOME + "/conversations/" + sid + ".pb", "");
      return { sessionId: sid, configOptions: options("gemini-3.8-flash"), models: models() };
    }
    case "session/set_config_option": return { configOptions: options(m.params.configId === "model" ? m.params.value : "gemini-3.8-flash") };
    case "session/prompt": return prompt(m.params);
    case "logout": return {};
  }
  return null;
}
if (!process.argv.includes("--login")) (async () => {
  for await (const line of console) {
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.method === undefined) { waits.get(m.id)?.(m); waits.delete(m.id); continue; }
    log({ method: m.method, params: m.params });
    if (m.method === "session/cancel") { cancels.get(m.params.sessionId)?.(); continue; }
    if (m.id === undefined) continue;
    handle(m).then((result) => out(result === null ? { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "no " + m.method } } : { jsonrpc: "2.0", id: m.id, result }), (error) => out({ jsonrpc: "2.0", id: m.id, error }));
  }
  process.exit(0);
})();
`;
fs.writeFileSync(DIR + "/agent.js", FAKE);

// the stand-in for illi's tools: zoom answers "line 3"; approve as APPROVE
// says; each request kept
let APPROVE = "allow";
const TOLD: any[] = [];
const SLEPT: string[] = [];
const TOOLS = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const m: any = await req.json();
    TOLD.push({ hosted: url.searchParams.has("hosted"), path: url.pathname, m });
    if (m.method === "tools/call" && m.params.name === "approve") {
      return Response.json({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: JSON.stringify(APPROVE === "allow" ? { behavior: "allow" } : { behavior: "deny", message: "no" }) }] } });
    }
    if (m.method === "tools/call" && m.params.name === "sleepy") {
      const quit = await Promise.race([Bun.sleep(2000).then(() => false), new Promise<boolean>((done) => req.signal.addEventListener("abort", () => done(true)))]);
      SLEPT.push(quit ? "stopped" : "slept");
      return Response.json({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "woke" }] } });
    }
    if (m.method === "tools/call") {
      return Response.json({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "line 3" }], isError: false } });
    }
    return Response.json({ jsonrpc: "2.0", id: m.id, result: {} });
  },
});
const SERVER = "http://127.0.0.1:" + TOOLS.port + "/k/main";

const { Antigravity } = await import("./Antigravity.ts");
const { Agy } = await import("./Agy.ts");
const { Pick } = await import("../../ai/Pick.ts");
const { Agent } = await import("../../ai/Agent.ts");
const config = await import("../../config/Config.ts");
const { FAILED } = await import("../../ui/View.ts");
Agy.bin = [process.execPath, DIR + "/agent.js"];
Agy.which = async () => null;

const FOLDER = DIR + "/antigravity/g1";

// the account's folder as Google's old agent left it (its sign-in), and
// what the CLI left there: a day old, and new
const CLI = FOLDER + "/.gemini/antigravity-cli";
const AGO = new Date(Date.now() - 2 * 86400e3);
fs.mkdirSync(FOLDER + "/.gemini/antigravity-acp", { recursive: true });
fs.writeFileSync(FOLDER + "/.gemini/antigravity-acp/acp_token.json", "{}");
for (const [sub, name, old] of [["log", "acp-server-old-1.log", true], ["implicit", "old.pb", true], ["crashes", "old.txt", true], ["log", "acp-server-new-2.log", false]] as const) {
  fs.mkdirSync(CLI + "/" + sub, { recursive: true });
  fs.writeFileSync(CLI + "/" + sub + "/" + name, "");
  if (old) {
    fs.utimesSync(CLI + "/" + sub + "/" + name, AGO, AGO);
  }
}

afterAll(() => {
  Antigravity.close();
  TOOLS.stop(true);
  fs.rmSync(DIR, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(process.env.FAKE_LOG!, { force: true });
  TOLD.length = 0;
  APPROVE = "allow";
  delete process.env.FAKE_SIGNEDOUT;
  delete process.env.FAKE_VERSION;
});

// what the stand-in logged
function logged(): any[] {
  return fs.existsSync(process.env.FAKE_LOG!) ? fs.readFileSync(process.env.FAKE_LOG!, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
}

// a call run to its end: its events and its end
async function call(scene: string, more: Record<string, unknown> = {}) {
  const events: any[] = [];
  const run = Antigravity.ask({ vendor: "antigravity", model: "gemini-3.8-flash", effort: "medium", speed: "slow", system: "ILLI PROMPT", blocks: [{ text: scene, mark: false }], searches: 0, server: SERVER, ...more } as any, (ev) => events.push(ev));
  return { events, end: await run.done, run };
}

const entries = (events: any[]) => events.filter((e) => e.$ === "Entry").map((e) => [e.kind, e.text]);

test("a turn: the CLI run as illi in the account's folder, never signed in by illi, illi's prompt after Google's, the pick's model and level; its words logged whole; its window learned; its session's files gone, Google's old agent's sign-in and what the CLI left a day old too", async () => {
  const { events, end } = await call("turn");
  expect([end.ok, end.text, end.first]).toEqual([true, "Hello", 1500]);
  expect(events.filter((e) => e.$ === "Delta").map((e) => [e.kind, e.text])).toEqual([["mind", "thinking"], ["illi", "Hel"], ["illi", "lo"]]);
  expect(entries(events)).toEqual([["mind", "thinking"], ["illi", "Hello"]]);
  const log = logged();
  const env = log.find((l) => l.env !== undefined);
  expect(env.env).toEqual({ HOME: FOLDER, TMPDIR: FOLDER + "/tmp", BROWSER: "false", NOUPDATE: "1", KEY: null, GOOGLE: null, APPDATA: null, XDG: null, DBUS: null });
  expect(env.args).toEqual(["--gemini-dir", FOLDER + "/.gemini", "--disable-telemetry"]);
  expect(fs.realpathSync(env.cwd)).toBe(fs.realpathSync(FOLDER + "/work"));
  const hello = log.find((l) => l.method === "initialize").params;
  expect([hello.clientInfo.name, hello.clientCapabilities.terminal, log.some((l) => l.method === "authenticate")]).toEqual(["illi", false, false]);
  const made = log.find((l) => l.method === "session/new").params;
  expect([made.cwd, made.mcpServers.length, made.mcpServers[0].name, made._meta.antigravity.enabledTools, made._meta.antigravity.eagerMcpServers]).toEqual([FOLDER + "/work", 1, "illi", [], ["illi"]]);
  expect(made.mcpServers[0].url).toStartWith("http://127.0.0.1:");
  const append: string = made._meta.antigravity.systemPrompt.append;
  expect([append.startsWith("ILLI PROMPT\n\n"), append.includes("mcp_illi_zoom"), append.includes("file:// links, don't apply here")]).toEqual([true, true, true]);
  expect(log.filter((l) => l.method === "session/set_config_option").map((l) => [l.params.configId, l.params.value])).toEqual([["thinking_level", "medium"]]);
  expect(log.find((l) => l.method === "session/prompt").params.prompt).toEqual([{ type: "text", text: "turn" }]);
  expect([fs.readdirSync(CLI + "/conversations"), fs.readdirSync(CLI + "/brain")]).toEqual([[], []]);
  expect([fs.existsSync(FOLDER + "/.gemini/antigravity-acp"), fs.readdirSync(CLI + "/crashes"), fs.readdirSync(CLI + "/implicit").includes("old.pb"), ["acp-server-old-1.log", "acp-server-new-2.log"].map((f) => fs.existsSync(CLI + "/log/" + f))]).toEqual([false, [], false, [false, true]]);
  expect(Pick.model("antigravity", "gemini-3.8-flash")?.window).toBe(1000000);
  expect(JSON.parse(fs.readFileSync(DIR + "/models.json", "utf8")).vendors.antigravity.find((m: any) => m.id === "gemini-3.8-flash").window).toBe(1000000);
});

test("illi's tools reach the CLI through the forwarder, each logged with its answer (the CLI's own note of it not logged again), its words before it logged first; the CLI's permission given once; the tokens read told of a one-step turn alone", async () => {
  const { events, end } = await call("tool");
  expect([end.ok, end.text]).toEqual([true, "Done."]);
  const plain = await call("plain");
  const quiet = await call("quiet");
  expect([plain.end.first, quiet.end.first, entries(quiet.events)]).toEqual([1400, undefined, [["illi", "quiet"]]]);
  const es = events.filter((e) => e.$ === "Entry");
  expect(es.map((e) => [e.kind, e.text])).toEqual([["illi", "Let me look."], ["tool", 'zoom {"id":3}'], ["echo", "line 3"], ["illi", "Done."]]);
  expect(es[1].of).toBe(es[2].of);
  expect(TOLD.map((t) => [t.hosted, t.path, t.m.method, t.m.params?.name])).toEqual([[false, "/k/main", "tools/call", "zoom"]]);
  const log = logged();
  expect(log.find((l) => l.permitted === "zoom").outcome).toEqual({ outcome: "selected", optionId: "allow" });
  expect(log.find((l) => l.mcp !== undefined).mcp.result.content).toEqual([{ type: "text", text: "line 3" }]);
});

test("the CLI's web search, where the call searches, asked of the user (approve) and logged with what it found; its page reading refused as the user refuses it", async () => {
  const web = await call("web", { searches: 1 });
  expect(entries(web.events)).toEqual([["tool", 'WebSearch {"query":"illi agent"}'], ["echo", "found: illi"], ["illi", "Found it."]]);
  expect(logged().find((l) => l.method === "session/new").params._meta.antigravity.enabledTools).toEqual(["search_web", "read_url_content"]);
  expect(TOLD.map((t) => [t.hosted, t.m.params.name, t.m.params.arguments])).toEqual([[true, "approve", { tool_name: "WebSearch", input: { query: "illi agent" } }]]);
  expect(logged().find((l) => l.permitted === "search").outcome.optionId).toBe("allow");
  APPROVE = "deny";
  const fetched = await call("fetch", { searches: 1 });
  expect(entries(fetched.events)).toEqual([["tool", 'WebFetch {"url":"https://example.invalid/page"}'], ["echo", FAILED + "Rejected by user"], ["illi", "Couldn't."]]);
  expect(logged().find((l) => l.permitted === "fetch").outcome.optionId).toBe("deny");
  expect(TOLD.at(-1).m.params.arguments).toEqual({ tool_name: "WebFetch", input: { url: "https://example.invalid/page" } });
});

test("a workspace's trust refused; a call without tools has none, nor the web's, nor their naming", async () => {
  await call("trust");
  expect(logged().find((l) => l.permitted === "trust").outcome.optionId).toBe("untrust");
  const { end } = await call("turn", { server: "", searches: 1 });
  expect(end.ok).toBe(true);
  const made = logged().filter((l) => l.method === "session/new").at(-1).params;
  expect([made.mcpServers, made._meta.antigravity.enabledTools, made._meta.antigravity.eagerMcpServers, made._meta.antigravity.systemPrompt.append.includes("mcp_illi_")]).toEqual([[], [], [], false]);
  const once = await call("turn", { once: true });
  expect([once.end.ok, logged().filter((l) => l.method === "session/new").at(-1).params.mcpServers]).toEqual([true, []]);
});

test("an error the CLI says as a message (a warning sign before it, or not) is never a reply: busy, too long, the plan's limit (words before it kept), a turn past its window", async () => {
  const busy = await call("busy");
  expect([busy.end.ok, busy.end.stop, busy.end.again, busy.end.text]).toEqual([false, "down", true, Agent.gone("")]);
  expect(entries(busy.events)).toEqual([]);
  const long = await call("long");
  expect([long.end.stop, entries(long.events)]).toEqual(["full", []]);
  const swamped = await call("swamped");
  expect([swamped.end.ok, swamped.end.stop, swamped.end.again, entries(swamped.events)]).toEqual([false, "down", true, [["illi", "Done so far.\n[cut off]"]]]);
  const limit = await call("limit");
  expect([limit.end.stop, limit.end.again, limit.end.text, limit.end.cut]).toEqual(["down", true, "your Google AI plan's usage limit is reached: it resets in 4 hours, 2 minutes; /model picks another model meanwhile", true]);
  expect(entries(limit.events)).toEqual([["illi", "Part one.\n[cut off]"]]);
  const max = await call("max");
  expect(max.end.stop).toBe("full");
});

test("a turn past the most the model may write, or declined, keeps what it said and ends in plain words, as illi's own loop ends one", async () => {
  const capped = await call("capped");
  expect([capped.end.ok, capped.end.stop, capped.end.text, capped.end.cut]).toEqual([false, "fail", "the reply reached the most the model may write at once", true]);
  expect(entries(capped.events)).toEqual([["mind", "pondering"], ["illi", "A long answer that ran past the cap"]]);
  const declined = await call("declined");
  expect([declined.end.stop, declined.end.text, entries(declined.events)]).toEqual(["fail", "the model declined to answer", [["illi", "I can't help with that."]]]);
});

test("a model the account doesn't offer fails, saying what it does", async () => {
  const { end } = await call("turn", { model: "gemini-9" });
  expect([end.ok, end.stop]).toEqual([false, "fail"]);
  expect(end.text).toBe("your Google AI plan doesn't offer gemini-9 in Antigravity (it offers gemini-4-argon and gemini-3.8-flash): /model picks another");
});

test("the account's models, as its CLI lists them, are those offered: each family at its levels, Gemini's alone, windows kept; one new offered, one gone dropped, kept for the next start, the chat told; a call set on one", async () => {
  const told: number[] = [];
  Antigravity.watch(() => told.push(1));
  await call("turn", { model: "gemini-4-argon", effort: "low" });
  expect(logged().filter((l) => l.method === "session/set_config_option").map((l) => [l.params.configId, l.params.value])).toEqual([["model", "gemini-4-argon"], ["thinking_level", "low"]]);
  const shown = () => Pick.list("antigravity").map((m: any) => [m.label, m.efforts, m.window]);
  expect(shown()).toEqual([["gemini-4-argon", ["low", "medium", "high"], 1000000], ["gemini-3.8-flash", ["low", "medium", "high"], 1000000]]);
  const real = { configOptions: [{ id: "model", currentValue: "gemini-3.8-flash", options: [{ value: "gemini-5-test", name: "Gemini 5 Test" }, { value: "gemini-3.8-flash", name: "Gemini 3.8 Flash" }] }, { id: "thinking_level", currentValue: "high", options: [{ value: "low" }, { value: "high" }] }], models: { availableModels: [{ modelId: "gemini-5-test-high" }, { modelId: "gemini-5-test-low" }, { modelId: "gemini-3.8-flash-high" }, { modelId: "gemini-3.8-flash-medium" }, { modelId: "gemini-3.8-flash-low" }] } };
  Antigravity.learn(real);
  expect(shown()).toEqual([["gemini-5-test", ["low", "high"], undefined], ["gemini-3.8-flash", ["low", "medium", "high"], 1000000]]);
  expect([config.OFFER.models.includes("gemini-5-test"), told.length]).toEqual([true, 1]);
  expect(JSON.parse(fs.readFileSync(DIR + "/models.json", "utf8")).vendors.antigravity.map((m: any) => m.label)).toEqual(["gemini-5-test", "gemini-3.8-flash"]);
  Antigravity.learn(real);
  expect(told.length).toBe(1);
  expect(Antigravity.catalog({ configOptions: [{ id: "model", options: [{ value: "gemini-3.8-flash" }] }, { id: "thinking_level", options: [{ value: "low" }, { value: "high" }] }] }).map((m: any) => [m.label, m.efforts])).toEqual([["gemini-3.8-flash", ["low", "high"]]]);
  expect(Antigravity.catalog({}).length).toBe(0);
  await call("turn");
  expect([shown().map((m) => m[0]), told.length]).toEqual([["gemini-4-argon", "gemini-3.8-flash"], 2]);
  Antigravity.watch(() => {});
});

test("a stop cancels the turn, what streamed logged as cut off; a message sent mid-run is left", async () => {
  const events: any[] = [];
  const run = Antigravity.ask({ vendor: "antigravity", model: "gemini-3.8-flash", effort: "medium", speed: "slow", system: "", blocks: [{ text: "slow", mark: false }], searches: 0, server: SERVER } as any, (ev) => {
    events.push(ev);
    if (ev.$ === "Delta") {
      run.send({ text: "meanwhile", imgs: [] });
      run.stop();
    }
  });
  const end = await run.done;
  expect([end.ok, end.stop, end.left]).toEqual([false, "lost", [{ text: "meanwhile", imgs: [] }]]);
  expect(entries(events)).toEqual([["illi", "Working\n[cut off]"]]);
  expect(logged().some((l) => l.method === "session/cancel")).toBe(true);
});

test("the pool: calls at once share a CLI, a spare stands ready, one ends once its calls did, all as illi ends", async () => {
  Antigravity.close();
  const both = await Promise.all([call("hold"), call("hold")]);
  expect(both.map((b) => b.end.text)).toEqual(["held", "held"]);
  const log = logged();
  const pids = new Set(log.filter((l) => l.method === "session/new").map((l) => l.pid));
  expect(pids.size).toBe(1);
  await Bun.sleep(300);
  expect(Antigravity.running()).toBe(1);
  const spare = log.filter((l) => l.env !== undefined).map((l) => l.pid).find((p) => !pids.has(p));
  expect(spare).toBeDefined();
  const next = await call("turn");
  expect(logged().filter((l) => l.method === "session/new").at(-1).pid).toBe(spare);
  expect(next.end.ok).toBe(true);
  Antigravity.close();
  expect(Antigravity.running()).toBe(0);
  await Bun.sleep(300);
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  expect([...pids, spare!].some(alive)).toBe(false);
  expect([...pids, spare!].filter((pid) => fs.existsSync(CLI + "/log/acp-server-20261106_120000-" + pid + ".log"))).toEqual([]);
});

test("an account's folder made anew (a logout, then a sign-in that got its id) never runs on the CLIs started before; a logout here ends them at once", async () => {
  Antigravity.close();
  await call("turn");
  const before = new Set(logged().filter((l) => l.env !== undefined).map((l) => l.pid));
  expect(Antigravity.running()).toBe(1);
  fs.rmSync(FOLDER, { recursive: true, force: true });
  fs.mkdirSync(FOLDER);
  fs.rmSync(process.env.FAKE_LOG!, { force: true });
  expect((await call("turn")).end.ok).toBe(true);
  expect(before.has(logged().find((l) => l.method === "session/new").pid)).toBe(false);
  Antigravity.forget(FOLDER);
  expect(Antigravity.running()).toBe(0);
});

test("a stop the CLI doesn't honour: a CLI others share isn't killed (theirs go on), the call given up and the CLI taking no more; alone, it's killed", async () => {
  Antigravity.close();
  const was = Antigravity.cancel;
  Antigravity.cancel = 300;
  try {
    const events: any[] = [];
    const deaf = Antigravity.ask({ vendor: "antigravity", model: "gemini-3.8-flash", effort: "medium", speed: "slow", system: "", blocks: [{ text: "deaf", mark: false }], searches: 0, server: SERVER } as any, (ev) => {
      events.push(ev);
      if (ev.$ === "Delta") {
        deaf.stop();
      }
    });
    const other = call("hold more");
    const [end, held] = await Promise.all([deaf.done, other]);
    expect([end.stop, held.end.ok, held.end.text]).toEqual(["lost", true, "held"]);
    expect(new Set(logged().filter((l) => l.method === "session/new").map((l) => l.pid)).size).toBe(1);
    const alone = Antigravity.ask({ vendor: "antigravity", model: "gemini-3.8-flash", effort: "medium", speed: "slow", system: "", blocks: [{ text: "deaf", mark: false }], searches: 0, server: SERVER } as any, (ev) => ev.$ === "Delta" && alone.stop());
    expect((await alone.done).stop).toBe("lost");
  } finally {
    Antigravity.cancel = was;
    Antigravity.close();
  }
});

test("a stop reaches illi's tool running through the forwarder, though the CLI goes on for another call", async () => {
  Antigravity.close();
  SLEPT.length = 0;
  const other = call("hold more");
  const sleepy = Antigravity.ask({ vendor: "antigravity", model: "gemini-3.8-flash", effort: "medium", speed: "slow", system: "", blocks: [{ text: "sleepy", mark: false }], searches: 0, server: SERVER } as any, (ev) => ev.$ === "Entry" && ev.kind === "tool" && setTimeout(() => sleepy.stop(), 100));
  expect((await sleepy.done).stop).toBe("lost");
  await other;
  await Bun.sleep(200);
  expect(SLEPT).toEqual(["stopped"]);
  Antigravity.close();
});

test("a CLI that fails to start (one older than 1.5.2) ends, so no later call takes it", async () => {
  Antigravity.close();
  process.env.FAKE_VERSION = "1.5.1";
  const old = await call("turn");
  expect([old.end.ok, old.end.stop, old.end.text]).toEqual([false, "down", "Google's Antigravity CLI 1.5.1 is older than the 1.5.2 illi runs: `agy update` brings it current"]);
  await Bun.sleep(300);
  expect(Antigravity.running()).toBe(0);
  delete process.env.FAKE_VERSION;
  expect((await call("turn")).end.ok).toBe(true);
  Antigravity.close();
});

test("no sign-in, or one run out, ends a call at once, never signing in nor waiting on a browser; /login offers a sign-in again", async () => {
  Antigravity.close();
  fs.writeFileSync(FOLDER + "/.illi-signed", "1.5.2\n");
  expect(Antigravity.lapsed(FOLDER)).toBe(false);
  process.env.FAKE_SIGNEDOUT = "1";
  const t0 = Date.now();
  const { end } = await call("turn");
  expect([end.ok, end.stop, end.text]).toEqual([false, "down", "your Google sign-in for Antigravity has run out: /login signs in again"]);
  expect(Date.now() - t0).toBeLessThan(10e3);
  expect([logged().some((l) => l.method === "authenticate"), Antigravity.lapsed(FOLDER), Antigravity.lapsed(DIR + "/antigravity/never")]).toEqual([false, true, true]);
  Antigravity.close();
});

test("/login's sign-in tells Google's page's link, gives the CLI the code pasted, tells the plan, marks the folder signed in (the CLIs started before take no call); a wrong code or a stop says so; its logout logs the folder out", async () => {
  const g2 = DIR + "/antigravity/g2";
  const links: string[] = [];
  const run = Antigravity.signin(g2, new AbortController().signal, (url) => {
    links.push(url);
    run.give("  good-code ");
  });
  expect([await run.done, links]).toEqual(["Google AI Pro", ["https://accounts.google.com/o/oauth2/auth?x=1"]]);
  const log = logged();
  expect([log[0].args, log.find((l) => l.pasted !== undefined).pasted, log.find((l) => l.method === "authenticate").params]).toEqual([["--login", "--gemini-dir", g2 + "/.gemini", "--disable-telemetry"], "good-code", { methodId: "oauth-personal" }]);
  const listed = log.find((l) => l.method === "session/new").params;
  expect([listed.mcpServers, listed._meta.antigravity.enabledTools, log.some((l) => l.method === "session/prompt")]).toEqual([[], [], false]);
  await Bun.sleep(300);
  expect([fs.readdirSync(g2 + "/.gemini/antigravity-cli/conversations"), fs.readdirSync(g2 + "/.gemini/antigravity-cli/brain"), fs.readdirSync(g2 + "/.gemini/antigravity-cli/log"), Antigravity.lapsed(g2)]).toEqual([[], [], [], false]);
  expect(await Antigravity.logout(g2)).toBe(true);
  expect(logged().filter((l) => l.method === "logout").length).toBe(1);

  Antigravity.close();
  await call("turn");
  const before = Antigravity.stamp(FOLDER);
  const again = Antigravity.signin(FOLDER, new AbortController().signal, () => again.give("good-code"));
  await again.done;
  fs.rmSync(process.env.FAKE_LOG!, { force: true });
  expect([Antigravity.stamp(FOLDER) !== before, Antigravity.lapsed(FOLDER), (await call("turn")).end.ok]).toEqual([true, false, true]);
  expect(new Set(logged().filter((l) => l.env !== undefined).map((l) => l.pid)).size).toBe(2);
  Antigravity.close();

  const wrong = Antigravity.signin(DIR + "/antigravity/g3", new AbortController().signal, () => wrong.give("bad-code"));
  await expect(wrong.done).rejects.toThrow("Google's sign-in said “couldn't sign in: invalid_grant”");
  const stop = new AbortController();
  const asked = Antigravity.signin(DIR + "/antigravity/g4", stop.signal, () => stop.abort());
  await expect(asked.done).rejects.toThrow("the sign-in was stopped");
});

test("no account, no CLI, or only another version of it, says what to do, never logged as the CLI's failure", async () => {
  fs.writeFileSync(DIR + "/accounts.json", "{}");
  config.config_accounts(true);
  expect((await call("turn")).end.text).toBe("no Google account is in use for Antigravity: /login signs in to one");
  fs.writeFileSync(DIR + "/accounts.json", JSON.stringify({ antigravity: { use: "g1", accounts: [{ id: "g1", email: "", plan: "", org: "" }] } }));
  config.config_accounts(true);
  const bin = Agy.bin;
  const pin = Agy.pin;
  Agy.bin = null;
  Agy.pin = { version: "1.5.3", archive: "https://github.com/google-antigravity/antigravity-cli/releases/download/1.5.3/agy_cli_linux_x64.tar.gz", sha256: "a".repeat(64), bytes: 1, unpacked: 1, cmd: "antigravity", args: ["acp"] };
  expect((await call("turn")).end.text).toBe("Google's Antigravity CLI isn't here: /login downloads it");
  const old = Agy.home() + "/1.5.2";
  fs.mkdirSync(old, { recursive: true });
  fs.writeFileSync(old + "/agent.json", JSON.stringify({ cmd: "antigravity", args: ["acp"], sha256: "b".repeat(64) }));
  fs.writeFileSync(old + "/antigravity", "");
  const said = "Google's Antigravity CLI 1.5.2 is here, and this illi runs 1.5.3: /login updates it";
  expect((await call("turn")).end).toMatchObject({ ok: false, text: said, stop: "down" });
  const logged: string[] = [];
  const error = console.error;
  console.error = (...a: any[]) => void logged.push(a.join(" "));
  try {
    expect(Antigravity.failed({ said: false, grew: false } as any, Agy.why())).toMatchObject({ ok: false, text: said, stop: "down" });
  } finally {
    console.error = error;
  }
  expect(logged).toEqual([]);
  fs.rmSync(Agy.home(), { recursive: true, force: true });
  Agy.bin = bin;
  Agy.pin = pin;
});
