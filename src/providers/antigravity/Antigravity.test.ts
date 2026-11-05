// Antigravity test
// ================
// `bun test Antigravity.test.ts`. Google's agent stood in for by a script
// that speaks the Agent Client Protocol and plays a scene, named by the
// call's message; illi's tools by a stand-in server. A call runs the
// agent as illi (its name and version), signed in by Google's sign-in, in
// the account's folder (HOME, GEMINI_HOME, TMPDIR its own, its tokens in
// files, no browser of its own, no Gemini or Google key of the
// environment's), in an empty folder; illi's prompt after Google's with
// how its tools are named and what of Google's doesn't apply; on the
// pick's model at its effort's thinking level; its session's files gone
// as it ends. Its words and thoughts stream live and are logged whole
// as the turn ends (a step's usage mid-stream splits nothing), the
// tokens its first step read told, the model's window learned and kept. illi's tools reach the agent through
// illi's forwarder, which logs each call with its answer; the agent's
// permission for them is given once; its web search and page reading are
// asked of the user through the call's tools URL (approve), allowed or
// refused as that answers, and logged with what they answered; a
// workspace's trust is refused. A call without tools has none, nor the
// web's. An error the agent says as a message is never a reply: busy,
// too long (`full`), the plan's limit (when it resets; words streamed
// before it logged as cut off), a turn past its window; a model the account doesn't
// offer fails saying what it does. A stop cancels the turn, what
// streamed logged as cut off; a message sent mid-run is left. The agents
// run in a pool: calls at once share one, a spare stands ready, one ends
// once its calls did, all as illi ends. A sign-in run out ends a call at
// once, never waiting on a browser; /login's sign-in tells Google's
// page's link and the plan, its logout logs the folder out. No account,
// or no agent, says what to do.

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
fs.writeFileSync(DIR + "/accounts.json", JSON.stringify({ antigravity: { use: "g1", accounts: [{ id: "g1", email: "", plan: "Google AI Pro", org: "" }] } }));

// the stand-in agent: logs what it's started with and each request; plays
// the scene its prompt names
const FAKE = String.raw`
const fs = require("node:fs");
const log = (o) => fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ pid: process.pid, ...o }) + "\n");
log({ env: { HOME: process.env.HOME, GEMINI_HOME: process.env.GEMINI_HOME, TMPDIR: process.env.TMPDIR, BROWSER: process.env.BROWSER, STORE: process.env.AGY_ACP_FORCE_FILE_STORAGE, KEY: process.env.GEMINI_API_KEY ?? null, GOOGLE: process.env.GOOGLE_API_KEY ?? null }, cwd: process.cwd() });
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
const MODELS = ["gemini-3.8-flash-low", "gemini-3.8-flash-medium", "gemini-3.8-flash-high", "gemini-3.1-pro-low", "gemini-3.1-pro-high"];
const options = (model) => [{ id: "model", currentValue: model, type: "select", options: MODELS.map((value) => ({ value, name: value })) }, { id: "thinking_level", currentValue: "high", type: "select", options: ["low", "medium", "high"].map((value) => ({ value, name: value })) }];
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
    const call = { toolCallId: "m1", title: "illi_zoom", kind: "other", rawInput: { arguments: { id: 3 } }, _meta: { mcp: { tool: "zoom", server: "illi" }, is_mcp_tool_call: true } };
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
  if (scene.includes("busy")) {
    say(sid, "The model is overloaded. Please try again later.");
    return { stopReason: "end_turn" };
  }
  if (scene.includes("long")) {
    say(sid, "The input token count (2000000) exceeds the maximum number of tokens allowed (1048576).");
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
    case "initialize": return { protocolVersion: 1, agentCapabilities: {}, authMethods: [{ id: "oauth-personal", name: "Log in with Google" }] };
    case "authenticate": {
      if (process.env.FAKE_AUTHFAIL) {
        return null;
      }
      if (process.env.FAKE_SIGNIN) {
        process.stderr.write("Open the following link to authenticate the ACP server: https://accounts.example/auth?x=1\n");
        await new Promise((done) => setTimeout(done, process.env.FAKE_SIGNIN === "gone" ? 600000 : 100));
      }
      return { _meta: { antigravity: { tier: { name: "Google AI Pro", id: "g1-pro-tier" } } } };
    }
    case "session/new": {
      const sid = crypto.randomUUID();
      sessions.set(sid, { mcp: m.params.mcpServers });
      const home = process.env.GEMINI_HOME + "/antigravity-acp";
      fs.mkdirSync(home + "/conversations", { recursive: true });
      fs.mkdirSync(home + "/brain/" + sid, { recursive: true });
      fs.writeFileSync(home + "/conversations/" + sid + ".db", "");
      fs.writeFileSync(home + "/conversations/" + sid + ".meta", "");
      return { sessionId: sid, configOptions: options("gemini-3.8-flash-high") };
    }
    case "session/set_config_option": return { configOptions: options(m.params.configId === "model" ? m.params.value : "gemini-3.8-flash-high") };
    case "session/prompt": return prompt(m.params);
    case "logout": return {};
  }
  return null;
}
(async () => {
  for await (const line of console) {
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.method === undefined) { waits.get(m.id)?.(m); waits.delete(m.id); continue; }
    log({ method: m.method, params: m.params });
    if (m.method === "session/cancel") { cancels.get(m.params.sessionId)?.(); continue; }
    if (m.id === undefined) continue;
    handle(m).then((result) => out(result === null ? { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "no " + m.method } } : { jsonrpc: "2.0", id: m.id, result }));
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

const FOLDER = DIR + "/antigravity/g1";

afterAll(() => {
  Antigravity.close();
  TOOLS.stop(true);
  fs.rmSync(DIR, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(process.env.FAKE_LOG!, { force: true });
  TOLD.length = 0;
  APPROVE = "allow";
  delete process.env.FAKE_SIGNIN;
  delete process.env.FAKE_AUTHFAIL;
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

test("a turn: the agent run as illi in the account's folder, illi's prompt after Google's, the pick's model and level; its words logged whole; its window learned; its session's files gone", async () => {
  const { events, end } = await call("turn");
  expect([end.ok, end.text, end.first]).toEqual([true, "Hello", 1500]);
  expect(events.filter((e) => e.$ === "Delta").map((e) => [e.kind, e.text])).toEqual([["mind", "thinking"], ["illi", "Hel"], ["illi", "lo"]]);
  expect(entries(events)).toEqual([["mind", "thinking"], ["illi", "Hello"]]);
  const log = logged();
  const env = log.find((l) => l.env !== undefined);
  expect(env.env).toEqual({ HOME: FOLDER, GEMINI_HOME: FOLDER + "/.gemini", TMPDIR: FOLDER + "/tmp", BROWSER: "false", STORE: "1", KEY: null, GOOGLE: null });
  expect(fs.realpathSync(env.cwd)).toBe(fs.realpathSync(FOLDER + "/work"));
  const hello = log.find((l) => l.method === "initialize").params;
  expect([hello.clientInfo.name, hello.clientCapabilities.terminal, log.find((l) => l.method === "authenticate").params]).toEqual(["illi", false, { methodId: "oauth-personal" }]);
  const made = log.find((l) => l.method === "session/new").params;
  expect([made.cwd, made.mcpServers.length, made.mcpServers[0].name, made._meta.antigravity.enabledTools, made._meta.antigravity.eagerMcpServers]).toEqual([FOLDER + "/work", 1, "illi", [], ["illi"]]);
  expect(made.mcpServers[0].url).toStartWith("http://127.0.0.1:");
  const append: string = made._meta.antigravity.systemPrompt.append;
  expect([append.startsWith("ILLI PROMPT\n\n"), append.includes("mcp_illi_zoom"), append.includes("file:// links, don't apply here")]).toEqual([true, true, true]);
  expect(log.filter((l) => l.method === "session/set_config_option").map((l) => [l.params.configId, l.params.value])).toEqual([["model", "gemini-3.8-flash-medium"], ["thinking_level", "medium"]]);
  expect(log.find((l) => l.method === "session/prompt").params.prompt).toEqual([{ type: "text", text: "turn" }]);
  expect([fs.readdirSync(FOLDER + "/.gemini/antigravity-acp/conversations"), fs.readdirSync(FOLDER + "/.gemini/antigravity-acp/brain")]).toEqual([[], []]);
  expect(Pick.model("antigravity", "gemini-3.8-flash")?.window).toBe(1000000);
  expect(JSON.parse(fs.readFileSync(DIR + "/models.json", "utf8")).vendors.antigravity.find((m: any) => m.id === "gemini-3.8-flash").window).toBe(1000000);
});

test("illi's tools reach the agent through the forwarder, each logged with its answer, its words before it logged first; the agent's permission given once", async () => {
  const { events, end } = await call("tool");
  expect([end.ok, end.text]).toEqual([true, "Done."]);
  const es = events.filter((e) => e.$ === "Entry");
  expect(es.map((e) => [e.kind, e.text])).toEqual([["illi", "Let me look."], ["tool", 'zoom {"id":3}'], ["echo", "line 3"], ["illi", "Done."]]);
  expect(es[1].of).toBe(es[2].of);
  expect(TOLD.map((t) => [t.hosted, t.path, t.m.method, t.m.params?.name])).toEqual([[false, "/k/main", "tools/call", "zoom"]]);
  const log = logged();
  expect(log.find((l) => l.permitted === "zoom").outcome).toEqual({ outcome: "selected", optionId: "allow" });
  expect(log.find((l) => l.mcp !== undefined).mcp.result.content).toEqual([{ type: "text", text: "line 3" }]);
});

test("the agent's web search, where the call searches, asked of the user (approve) and logged with what it found; its page reading refused as the user refuses it", async () => {
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

test("an error the agent says as a message is never a reply: busy, too long, the plan's limit (words before it kept), a turn past its window", async () => {
  const busy = await call("busy");
  expect([busy.end.ok, busy.end.stop, busy.end.again, busy.end.text]).toEqual([false, "down", true, Agent.gone("")]);
  expect(entries(busy.events)).toEqual([]);
  const long = await call("long");
  expect([long.end.stop, entries(long.events)]).toEqual(["full", []]);
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
  expect(end.text).toStartWith("your Google AI plan doesn't offer gemini-9 in Antigravity (it offers gemini-3.8-flash-low,");
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

test("the pool: calls at once share an agent, a spare stands ready, one ends once its calls did, all as illi ends", async () => {
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
});

test("an account's folder made anew (a logout, then a sign-in that got its id) never runs on the agents started before; a logout here ends them at once", async () => {
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

test("a stop the agent doesn't honour: an agent others share isn't killed (theirs go on), the call given up and the agent taking no more; alone, it's killed", async () => {
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

test("a stop reaches illi's tool running through the forwarder, though the agent goes on for another call", async () => {
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

test("an agent that fails to start ends, so no later call takes it", async () => {
  Antigravity.close();
  process.env.FAKE_AUTHFAIL = "1";
  expect((await call("turn")).end.ok).toBe(false);
  await Bun.sleep(300);
  expect(Antigravity.running()).toBe(0);
  delete process.env.FAKE_AUTHFAIL;
  expect((await call("turn")).end.ok).toBe(true);
  Antigravity.close();
});

test("a sign-in run out ends a call at once, never waiting on a browser", async () => {
  Antigravity.close();
  process.env.FAKE_SIGNIN = "gone";
  const t0 = Date.now();
  const { end } = await call("turn");
  expect([end.ok, end.stop, end.text]).toEqual([false, "down", "your Google sign-in for Antigravity has run out: /login signs in again"]);
  expect(Date.now() - t0).toBeLessThan(10e3);
  Antigravity.close();
});

test("/login's sign-in tells Google's page's link and the plan; its logout logs the folder out", async () => {
  process.env.FAKE_SIGNIN = "wait";
  const links: string[] = [];
  const plan = await Antigravity.signin(DIR + "/antigravity/g2", new AbortController().signal, (url) => links.push(url));
  expect([plan, links]).toEqual(["Google AI Pro", ["https://accounts.example/auth?x=1"]]);
  delete process.env.FAKE_SIGNIN;
  expect(await Antigravity.logout(DIR + "/antigravity/g2")).toBe(true);
  expect(logged().filter((l) => l.method === "logout").length).toBe(1);
  const stop = new AbortController();
  process.env.FAKE_SIGNIN = "gone";
  const asked = Antigravity.signin(DIR + "/antigravity/g3", stop.signal, () => stop.abort());
  await expect(asked).rejects.toThrow("the sign-in was stopped");
});

test("no account, or no agent, says what to do", async () => {
  fs.writeFileSync(DIR + "/accounts.json", "{}");
  config.config_accounts(true);
  expect((await call("turn")).end.text).toBe("no Google account is in use for Antigravity: /login signs in to one");
  fs.writeFileSync(DIR + "/accounts.json", JSON.stringify({ antigravity: { use: "g1", accounts: [{ id: "g1", email: "", plan: "", org: "" }] } }));
  config.config_accounts(true);
  const bin = Agy.bin;
  Agy.bin = null;
  expect((await call("turn")).end.text).toBe("Google's Antigravity agent isn't here: /login downloads it");
  Agy.bin = bin;
});
