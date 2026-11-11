// Copilot test
// ============
// `bun test Copilot.test.ts`. GitHub's Copilot CLI stood in for by a
// script that speaks its SDK's JSON-RPC (Content-Length framed, as the
// real 1.0.109 does: Live.test.ts) and plays a scene, named by the call's
// message; illi's tools by a stand-in server. A call runs the CLI as illi
// (named to it as an editor) in the account's folder (its COPILOT_HOME),
// no GitHub token or host nor Copilot setting of the environment's, no
// browser of its own, no telemetry, none of its built-in MCP servers, in
// an empty folder, its cache a folder of its own there, gone as it ends,
// what it unpacks of itself where the user's own CLI keeps it (illi's
// build: in its version's folder); illi's prompt in place of Copilot's,
// with how its tools are named; on the pick's model at its effort where
// the model takes one; illi's tools over MCP, Copilot's own but its web tools left
// out, none of its compaction, memory, skills or large-output files; its
// session gone as it ends. Its words and thoughts stream live and are
// logged whole, the tokens its first request read told, a window the
// list told none of learned and kept. Each tool's call is logged with
// its answer; the CLI's permission for illi's own is given once; its web
// fetch is asked of the user through the call's tools URL (approve),
// allowed or refused as that answers. A call without tools has none, nor
// the web's. Each failure the CLI tells lands as its kind says: too long
// (`full`, what streamed logged as cut off), a sign-in run out (/login
// offers a sign-in again), the plan's credits, a rate limit, a policy, a
// busy service, a CLI that died; one that can't start says why (its exit
// code, its own last words) and isn't tried again. A stop aborts the turn, what streamed
// logged as cut off; a message sent mid-run is left. Calls at once share
// one CLI; a CLI whose protocol illi doesn't speak is refused and ends;
// all end as illi ends. The account's models are its own, as the CLI
// lists them, kept for the next start, the chat told; its plan's use
// told. /login's sign-in tells GitHub's page and the code, and whom it
// signed in as; a failed one says the CLI's words; one stopped while the
// CLI starts ends at once, no page told, the CLI let go; its logout logs
// the folder out. No account, or no CLI, says what to do. The CLI: each
// machine's pinned build is one illi takes (1.0.100 or later, from
// GitHub's releases); the user's own runs once it's 1.0.100 or later, its
// version asked as illi runs it (`--no-auto-update --version`), an older
// one said; illi's build runs from its version's folder, unpacking itself
// there; the user's own unpacks where it does as the user runs it.

import { afterAll, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-copilot-");
for (const k of Object.keys(process.env).filter((k) => k.startsWith("ILLI_"))) {
  delete process.env[k];
}
process.env.ILLI_DIR          = DIR;
process.env.ILLI_VENDORS      = "claude-api";
process.env.FAKE_LOG          = DIR + "/log.jsonl";
process.env.GH_TOKEN          = "must-not-reach";
process.env.GITHUB_TOKEN      = "must-not-reach";
process.env.COPILOT_MODEL     = "must-not-reach";
process.env.COPILOT_CACHE_HOME = DIR + "/cache";
fs.writeFileSync(DIR + "/accounts.json", JSON.stringify({ "github-copilot": { use: "gh1", accounts: [{ id: "gh1", email: "octocat", plan: "", org: "" }] } }));

// the stand-in CLI: logs what it's started with and each request; signs
// in over its connection (session.accounts.login) as the real one does,
// telling GitHub's page and a code; plays the scene its message names;
// takes FAKE_START ms to start (to answer connect)
const FAKE = String.raw`
const fs = require("node:fs");
const log = (o) => fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ pid: process.pid, ...o }) + "\n");
const e = process.env;
log({ env: { HOME: e.COPILOT_HOME, BROWSER: e.BROWSER, SHELLENV: e.COPILOT_DISABLE_LOGIN_SHELL_ENV, GH: e.GH_TOKEN ?? null, GITHUB: e.GITHUB_TOKEN ?? null, MODEL: e.COPILOT_MODEL ?? null, CACHE: e.COPILOT_CACHE_HOME ?? null, PKG: e.COPILOT_PKG_CACHE_HOME ?? null }, args: process.argv.slice(2), cwd: process.cwd() });
const SIGNED = e.COPILOT_HOME + "/signed-in";
{
const out = (m) => { const body = Buffer.from(JSON.stringify(m)); process.stdout.write("Content-Length: " + body.length + "\r\n\r\n"); process.stdout.write(body); };
const ev = (sessionId, type, data = {}) => out({ jsonrpc: "2.0", method: "session.event", params: { sessionId, event: { type, data, id: crypto.randomUUID() } } });
const sessions = new Map();
const permits = new Map();
const aborts = new Map();
const permit = (sid, requestId, permissionRequest) => new Promise((done) => { permits.set(requestId, done); ev(sid, "permission.requested", { requestId, permissionRequest }); });
const say = (sid, text) => ev(sid, "assistant.message_delta", { messageId: "m", deltaContent: text });
const think = (sid, text) => ev(sid, "assistant.reasoning_delta", { reasoningId: "r", deltaContent: text });
const usage = (sid, n, quota = {}) => ev(sid, "assistant.usage", { model: "x", inputTokens: n, outputTokens: 5, quotaSnapshots: quota });
const idle = (sid) => { ev(sid, "assistant.turn_end", { turnId: "0" }); ev(sid, "session.idle", {}); };
const fail = (sid, data) => { ev(sid, "assistant.turn_end", { turnId: "0" }); ev(sid, "session.error", data); ev(sid, "session.idle", {}); };
const QUOTA = { chat: { isUnlimitedEntitlement: true, entitlementRequests: -1, usedRequests: 3, remainingPercentage: 100 }, premium_interactions: { isUnlimitedEntitlement: false, entitlementRequests: 1000, usedRequests: 250, remainingPercentage: 75, resetDate: "2026-12-01T00:00:00Z", overage: 0 } };
async function play(sid, scene) {
  const s = sessions.get(sid);
  ev(sid, "user.message", { content: scene });
  ev(sid, "session.usage_info", { tokenLimit: 128000, currentTokens: 900 });
  if (scene === "turn") {
    think(sid, "thinking"); say(sid, "Hel"); say(sid, "lo"); usage(sid, 1500, QUOTA);
    ev(sid, "assistant.message", { messageId: "m", content: "Hello", toolRequests: [] });
    return idle(sid);
  }
  if (scene === "whole") {
    usage(sid, 1200);
    ev(sid, "assistant.message", { messageId: "m", content: "All at once", toolRequests: [] });
    return idle(sid);
  }
  if (scene === "tool") {
    say(sid, "Let me "); say(sid, "look."); usage(sid, 1400);
    ev(sid, "assistant.message", { messageId: "m", content: "Let me look.", toolRequests: [{ toolCallId: "c1", name: "illi-zoom" }] });
    ev(sid, "tool.execution_start", { toolCallId: "c1", toolName: "illi-zoom", arguments: { id: 3 }, mcpServerName: "illi", mcpToolName: "zoom" });
    const ok = await permit(sid, "p1", { kind: "mcp", serverName: "illi", toolName: "illi-zoom", toolTitle: "zoom", args: { id: 3 } });
    log({ permitted: "zoom", result: ok });
    const res = await fetch(s.mcpServers.illi.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "zoom", arguments: { id: 3 } } }) });
    const r = (await res.json()).result;
    ev(sid, "tool.execution_complete", { toolCallId: "c1", success: true, result: { content: r.content[0].text, contents: r.content } });
    say(sid, "Done."); usage(sid, 1600);
    return idle(sid);
  }
  if (scene === "web") {
    ev(sid, "tool.execution_start", { toolCallId: "w1", toolName: "web_fetch", arguments: { url: "https://example.invalid/page" } });
    const ok = await permit(sid, "p2", { kind: "url", url: "https://example.invalid/page", intention: "read it" });
    log({ permitted: "url", result: ok });
    const yes = ok.kind === "approve-once";
    ev(sid, "tool.execution_complete", yes ? { toolCallId: "w1", success: true, result: { content: "found: illi" } } : { toolCallId: "w1", success: false, error: { message: "The user rejected this tool call." } });
    say(sid, yes ? "Found it." : "Couldn't."); usage(sid, 1700);
    return idle(sid);
  }
  if (scene === "other") {
    const ok = await permit(sid, "p3", { kind: "shell", fullCommandText: "rm -rf /" });
    log({ permitted: "shell", result: ok });
    say(sid, "ok");
    return idle(sid);
  }
  if (scene === "long") {
    say(sid, "Part of it");
    return fail(sid, { errorType: "context_limit", message: "prompt token count of 200000 exceeds the limit of 128000", statusCode: 400 });
  }
  if (scene === "signedout") return fail(sid, { errorType: "authentication", message: "Not authenticated. Please authenticate first." });
  if (scene === "credits") return fail(sid, { errorType: "quota", errorCode: "quota_exceeded", message: "You have no AI credits left this month." });
  if (scene === "rate") return fail(sid, { errorType: "rate_limit", errorCode: "user_global_rate_limited", message: "Sorry, you've been rate-limited.", statusCode: 429 });
  if (scene === "policy") return fail(sid, { errorType: "policy", message: "Copilot CLI is disabled by your organization's policy." });
  if (scene === "barred") return fail(sid, { message: 'Execution failed: model resolution leaf failed: GenericFailure, {"kind":"http","status":403,"statusText":"Forbidden","body":"unauthorized: not authorized to use this Copilot feature\\n"}' });
  if (scene === "down") return fail(sid, { errorType: "query", message: "Failed to get response from the AI model; retried 5 times. Last error: 500 boom", statusCode: 500 });
  if (scene === "odd") return fail(sid, { errorType: "query", message: "400 The model does not support tools" });
  if (scene === "die") { say(sid, "Starting"); setTimeout(() => process.exit(3), 50); return; }
  if (scene === "slow") {
    say(sid, "Working");
    await new Promise((done) => aborts.set(sid, done));
    ev(sid, "abort", { reason: "user_initiated" });
    return idle(sid);
  }
  if (scene === "deaf") { say(sid, "Working"); return; }
  if (scene === "hold") { await new Promise((done) => setTimeout(done, 400)); say(sid, "held"); return idle(sid); }
  say(sid, "?");
  return idle(sid);
}
// the sign-in's next step, as the person allows it at GitHub's page
// (FAKE_LOGIN: consent, the token kept in the folder asked first, no
// keychain here; fail, the code ran out; hold, never, till cancelled)
const holds = new Map();
async function advance(params) {
  await new Promise((done) => setTimeout(done, 50));
  const signed = () => (fs.writeFileSync(SIGNED, "octocat"), { kind: "completed", result: { status: "completed" } });
  if (params.input === "allow") return signed();
  if (params.input === "decline") return { kind: "completed", result: { status: "declined" } };
  if (e.FAKE_LOGIN === "fail") return { kind: "error", message: "the device code expired" };
  if (e.FAKE_LOGIN === "consent") return { kind: "completed", result: { status: "needs-plaintext-consent" } };
  if (e.FAKE_LOGIN === "hold") { await new Promise((done) => holds.set(params.flowId, done)); return { kind: "error", message: "cancelled" }; }
  return signed();
}
async function handle(m) {
  switch (m.method) {
    case "connect": await new Promise((done) => setTimeout(done, Number(e.FAKE_START ?? 0))); return { protocolVersion: Number(e.FAKE_PROTOCOL ?? 3) };
    case "ping": return { message: "pong", protocolVersion: Number(e.FAKE_PROTOCOL ?? 3) };
    case "session.create": sessions.set(m.params.sessionId, m.params); return { sessionId: m.params.sessionId };
    case "session.send": setTimeout(() => play(m.params.sessionId, m.params.prompt), 10); return { messageId: "u1" };
    case "session.abort": aborts.get(m.params.sessionId)?.(); return { success: true };
    case "sessions.delete": return {};
    case "session.permissions.handlePendingPermissionRequest": permits.get(m.params.requestId)?.(m.params.result); return { success: true };
    case "account.getCurrentAuth": return fs.existsSync(SIGNED) ? { authInfo: { type: "user", host: "https://github.com", login: "octocat", copilotUser: e.FAKE_BARRED ? { copilot_plan: "individual", access_type_sku: "subscription_ended", can_signup_for_limited: true } : { copilot_plan: "business" } } } : {};
    case "account.logout": fs.rmSync(SIGNED, { force: true }); return { hasMoreUsers: false };
    case "session.accounts.login.begin": return sessions.has(m.params.sessionId) ? { flowId: "f1", step: { kind: "device-code", userCode: "ABCD-1234", verificationUri: "https://github.com/login/device", expiresIn: 899, interval: 5 } } : null;
    case "session.accounts.login.advance": return advance(m.params);
    case "session.accounts.login.cancel": holds.get(m.params.flowId)?.(); return {};
    case "account.getQuota": return { quotaSnapshots: QUOTA };
    case "models.list": if (e.FAKE_BARRED) throw { code: -32603, message: 'Request models.list failed with message: GenericFailure, {"kind":"http","status":403,"statusText":"Forbidden","body":"unauthorized: not authorized to use this Copilot feature\\n"}' }; return { models: [
      { id: "claude-sonnet-9.1", name: "Claude Sonnet 9.1", capabilities: { supports: { toolCalls: true, vision: true }, limits: { max_prompt_tokens: 128000, max_context_window_tokens: 160000 } }, supportedReasoningEfforts: ["low", "medium", "high", "xhigh"], billing: { tokenPrices: { batchSize: 1000000, inputPrice: 300, outputPrice: 1500 } } },
      { id: "gpt-9.2", name: "GPT-9.2", capabilities: { supports: { toolCalls: true }, limits: { max_prompt_tokens: 272000, max_context_window_tokens: 400000 } }, supportedReasoningEfforts: ["none", "low", "medium", "high"], billing: { tokenPrices: { batchSize: 1000000, inputPrice: 125, outputPrice: 1000 } } },
      { id: "auto", name: "Auto", capabilities: { supports: { toolCalls: true } }, billing: { discountPercent: 10 } },
      { id: "banned-1", name: "Banned", policy: { state: "disabled" }, capabilities: { supports: { toolCalls: true } } },
      { id: "chatty-1", name: "No tools", capabilities: { supports: { toolCalls: false } } },
    ] };
  }
  return null;
}
let buf = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  for (;;) {
    const at = buf.indexOf("\r\n\r\n");
    if (at < 0) break;
    const n = Number(/Content-Length: (\d+)/i.exec(buf.subarray(0, at).toString())[1]);
    if (buf.length < at + 4 + n) break;
    const m = JSON.parse(buf.subarray(at + 4, at + 4 + n).toString());
    buf = buf.subarray(at + 4 + n);
    if (m.method === undefined) continue;
    log({ method: m.method, params: m.params });
    handle(m).then((result) => out(result === null ? { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Unhandled method " + m.method } } : { jsonrpc: "2.0", id: m.id, result }), (error) => out({ jsonrpc: "2.0", id: m.id, error }));
  }
});
process.stdin.on("end", () => process.exit(0));
}
`;
fs.writeFileSync(DIR + "/copilot.js", FAKE);

// the stand-in for illi's tools: zoom answers "line 3"; approve as APPROVE
// says; each request kept
let APPROVE = "allow";
const TOLD: any[] = [];
const TOOLS = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const m: any = await req.json();
    TOLD.push({ hosted: url.searchParams.has("hosted"), path: url.pathname, m });
    if (m.method === "tools/call" && m.params.name === "approve") {
      return Response.json({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: JSON.stringify(APPROVE === "allow" ? { behavior: "allow" } : { behavior: "deny", message: "no" }) }] } });
    }
    return Response.json({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "line 3" }], isError: false } });
  },
});
const SERVER = "http://127.0.0.1:" + TOOLS.port + "/k/main";

const { Copilot } = await import("./Copilot.ts");
const { CopilotCli } = await import("./CopilotCli.ts");
const { Pick } = await import("../../ai/Pick.ts");
const { FAILED } = await import("../../ui/View.ts");
CopilotCli.bin = [process.execPath, DIR + "/copilot.js"];
CopilotCli.which = async () => null;
Copilot.cancel = 300;

const FOLDER = DIR + "/copilot/gh1";
fs.mkdirSync(FOLDER, { recursive: true });
fs.writeFileSync(FOLDER + "/signed-in", "octocat");
Pick.learn("github-copilot", [{ label: "claude-sonnet-9.1", id: "claude-sonnet-9.1", speeds: ["slow"], window: 160000, efforts: ["low", "medium", "high"] }]);

afterAll(() => {
  Copilot.close();
  TOOLS.stop(true);
  fs.rmSync(DIR, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(process.env.FAKE_LOG!, { force: true });
  TOLD.length = 0;
  APPROVE = "allow";
  delete process.env.FAKE_PROTOCOL;
  delete process.env.FAKE_LOGIN;
  delete process.env.FAKE_BARRED;
  delete process.env.FAKE_START;
});

// what the stand-in logged
function logged(): any[] {
  return fs.existsSync(process.env.FAKE_LOG!) ? fs.readFileSync(process.env.FAKE_LOG!, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
}

// a call run to its end: its events and its end
async function call(scene: string, more: Record<string, unknown> = {}) {
  const events: any[] = [];
  const run = Copilot.ask({ vendor: "github-copilot", model: "claude-sonnet-9.1", effort: "medium", speed: "slow", system: "ILLI PROMPT", blocks: [{ text: scene, mark: false }], searches: 0, server: SERVER, ...more } as any, (ev) => events.push(ev));
  return { events, end: await run.done, run };
}

const entries = (events: any[]) => events.filter((e) => e.$ === "Entry").map((e) => [e.kind, e.text]);

test("a turn: the CLI run as illi in the account's folder, none of the environment's GitHub tokens or Copilot settings; illi's prompt in place of Copilot's, the pick's model at its effort, illi's tools alone; its words logged whole; its session gone", async () => {
  const { events, end } = await call("turn");
  expect([end.ok, end.text, end.first]).toEqual([true, "Hello", 1500]);
  expect(events.filter((e) => e.$ === "Delta").map((e) => [e.kind, e.text])).toEqual([["mind", "thinking"], ["illi", "Hel"], ["illi", "lo"]]);
  expect(entries(events)).toEqual([["mind", "thinking"], ["illi", "Hello"]]);
  const log = logged();
  const start = log.find((l) => l.env !== undefined);
  expect({ ...start.env, CACHE: start.env.CACHE.replace(/[^/]+$/, "<run>") }).toEqual({ HOME: FOLDER, BROWSER: "false", SHELLENV: "1", GH: null, GITHUB: null, MODEL: null, CACHE: FOLDER + "/cache/<run>", PKG: DIR + "/cache" });
  expect(start.args).toEqual(["--headless", "--no-auto-update", "--stdio", "--disable-client-telemetry", "--disable-builtin-mcps"]);
  expect(fs.realpathSync(start.cwd)).toBe(fs.realpathSync(FOLDER + "/work"));
  expect(log.find((l) => l.method === "connect").params.clientInfo.editorName).toBe("illi");
  const made = log.find((l) => l.method === "session.create").params;
  expect([made.model, made.reasoningEffort, made.clientName, made.workingDirectory, made.availableTools, made.mcpServers, made.requestPermission, made.streaming]).toEqual(["claude-sonnet-9.1", "medium", "illi", FOLDER + "/work", ["mcp:*"], { illi: { type: "http", url: SERVER, tools: ["*"] } }, true, true]);
  expect([made.infiniteSessions, made.memory, made.enableSkills, made.largeOutput, made.provider]).toEqual([{ enabled: false }, { enabled: false }, false, { enabled: false }, undefined]);
  expect([made.systemMessage.mode, made.systemMessage.content.startsWith("ILLI PROMPT\n\n"), made.systemMessage.content.includes("illi-zoom")]).toEqual(["replace", true, true]);
  expect(log.find((l) => l.method === "session.send").params).toEqual({ sessionId: made.sessionId, prompt: "turn" });
  for (let k = 0; k < 50 && !logged().some((l) => l.method === "sessions.delete"); k++) {
    await Bun.sleep(20);
  }
  expect(logged().find((l) => l.method === "sessions.delete")?.params).toEqual({ sessionId: made.sessionId });
  const whole = await call("whole", { effort: "max" });
  expect([whole.end.text, entries(whole.events), logged().findLast((l) => l.method === "session.create").params.reasoningEffort]).toEqual(["All at once", [["illi", "All at once"]], undefined]);
});

test("illi's tools: each call logged with its answer, the words before it first; the CLI's permission for them given once", async () => {
  const { events, end } = await call("tool");
  expect([end.ok, end.text, end.first]).toEqual([true, "Done.", 1400]);
  const es = events.filter((e) => e.$ === "Entry");
  expect(es.map((e) => [e.kind, e.text])).toEqual([["illi", "Let me look."], ["tool", 'zoom {"id":3}'], ["echo", "line 3"], ["illi", "Done."]]);
  expect(es[1].of).toBe(es[2].of);
  expect(TOLD.map((t) => [t.hosted, t.path, t.m.params?.name])).toEqual([[false, "/k/main", "zoom"]]);
  expect(logged().find((l) => l.permitted === "zoom").result).toEqual({ kind: "approve-once" });
});

test("the CLI's web fetch, where the call searches, asked of the user (approve), allowed or refused as that answers; any other permission refused", async () => {
  const web = await call("web", { searches: 1 });
  expect(logged().find((l) => l.method === "session.create").params.availableTools).toEqual(["mcp:*", "builtin:web_fetch", "builtin:web_search"]);
  expect(entries(web.events)).toEqual([["tool", 'WebFetch {"url":"https://example.invalid/page"}'], ["echo", "found: illi"], ["illi", "Found it."]]);
  expect(TOLD.map((t) => [t.hosted, t.m.params.name, t.m.params.arguments])).toEqual([[true, "approve", { tool_name: "WebFetch", input: { url: "https://example.invalid/page" } }]]);
  APPROVE = "deny";
  const no = await call("web", { searches: 1 });
  expect([logged().findLast((l) => l.permitted === "url").result, entries(no.events)[1]]).toEqual([{ kind: "reject" }, ["echo", FAILED + "The user rejected this tool call."]]);
  await call("other");
  expect(logged().find((l) => l.permitted === "shell").result).toEqual({ kind: "reject" });
});

test("a call without tools has none, nor the web's, nor their naming", async () => {
  await call("turn", { server: "", searches: 1 });
  const made = logged().find((l) => l.method === "session.create").params;
  expect([made.availableTools, made.mcpServers, made.systemMessage.content]).toEqual([[], {}, "ILLI PROMPT"]);
  await call("turn", { once: true });
  expect(logged().find((l) => l.method === "session.create").params.availableTools).toEqual([]);
});

test("each failure lands as the CLI's kind says: too long (what streamed cut off), the plan's credits, a rate limit, a policy, a busy service, its own words", async () => {
  const long = await call("long");
  expect([long.end.ok, long.end.stop, entries(long.events)]).toEqual([false, "full", [["illi", "Part of it\n[cut off]"]]]);
  const credits = await call("credits");
  expect([credits.end.stop, credits.end.text]).toEqual(["down", "your GitHub Copilot plan's usage is used up: it starts anew " + new Date("2026-12-01T00:00:00Z").toDateString() + " (GitHub said: You have no AI credits left this month.)"]);
  const rate = await call("rate");
  expect([rate.end.stop, rate.end.again, rate.end.text]).toEqual(["down", true, "GitHub Copilot is rate-limiting your account for now: Sorry, you've been rate-limited."]);
  const policy = await call("policy");
  expect([policy.end.stop, policy.end.text]).toEqual(["down", "GitHub Copilot refused: Copilot CLI is disabled by your organization's policy."]);
  const down = await call("down");
  expect([down.end.stop, down.end.again]).toEqual(["down", true]);
  const odd = await call("odd");
  expect(odd.end.text).toBe("GitHub Copilot said: 400 The model does not support tools");
});

test("a sign-in run out ends the call saying /login signs in again, offered there till a call runs on it", async () => {
  const out = await call("signedout");
  expect([out.end.stop, out.end.text, Copilot.lapsed(FOLDER)]).toEqual(["down", "your GitHub sign-in for Copilot has run out: /login signs in again", true]);
  await call("turn");
  expect(Copilot.lapsed(FOLDER)).toBe(false);
});

test("a CLI that dies mid-call ends it as busy; the next call starts another", async () => {
  const died = await call("die");
  expect([died.end.ok, died.end.stop, died.end.again]).toEqual([false, "down", true]);
  const next = await call("turn");
  expect(next.end.text).toBe("Hello");
});

test("a CLI that can't start says why, with its exit code and its own last words, and isn't tried again; a sign-in says the same", async () => {
  Copilot.close();
  await Bun.sleep(100);
  const bin = CopilotCli.bin;
  fs.writeFileSync(DIR + "/broken", "#!/bin/sh\necho 'starting' >&2\necho 'copilot: error while loading shared libraries: libfoo.so: cannot open shared object file' >&2\nexit 127\n", { mode: 0o755 });
  CopilotCli.bin = [DIR + "/broken"];
  try {
    const why = "GitHub's Copilot CLI didn't start (exit 127): copilot: error while loading shared libraries: libfoo.so: cannot open shared object file";
    const { end } = await call("turn");
    expect([end.ok, end.stop, end.again, end.text]).toEqual([false, "down", undefined, why]);
    await expect(Copilot.signin(DIR + "/copilot/gh10", new AbortController().signal, () => {}, async () => true)).rejects.toThrow(why);
    expect(Copilot.running()).toBe(0);
  } finally {
    CopilotCli.bin = bin;
  }
});

test("a sign-in stopped while the CLI starts ends at once: no page or code told, no session made, the CLI let go once it started; one stopped before it began starts no CLI", async () => {
  Copilot.close();
  await Bun.sleep(100);
  process.env.FAKE_START = "1000";
  const stop = new AbortController();
  const asked: string[] = [];
  const held = Copilot.signin(DIR + "/copilot/gh8", stop.signal, (url) => asked.push(url), async () => true);
  for (let n = 0; n < 250 && !logged().some((l) => l.method === "connect"); n++) {
    await Bun.sleep(20);
  }
  stop.abort();
  await expect(held).rejects.toThrow("the sign-in was stopped");
  expect([Copilot.running(), Copilot.held()]).toEqual([1, 1]);
  for (let n = 0; n < 250 && Copilot.held() > 0; n++) {
    await Bun.sleep(20);
  }
  await Bun.sleep(100);
  expect([asked, Copilot.held(), logged().filter((l) => l.method !== undefined).map((l) => l.method)]).toEqual([[], 0, ["connect"]]);
  Copilot.close();
  await Bun.sleep(100);
  fs.rmSync(process.env.FAKE_LOG!, { force: true });
  await expect(Copilot.signin(DIR + "/copilot/gh9", AbortSignal.abort(), (url) => asked.push(url), async () => true)).rejects.toThrow("the sign-in was stopped");
  expect([asked, Copilot.running(), logged(), fs.existsSync(DIR + "/copilot/gh9")]).toEqual([[], 0, [], false]);
});

test("a stop aborts the turn, what streamed logged as cut off; one the CLI doesn't end is given up; a message sent mid-run is left", async () => {
  const events: any[] = [];
  const run = Copilot.ask({ vendor: "github-copilot", model: "claude-sonnet-9.1", effort: "medium", speed: "slow", system: "P", blocks: [{ text: "slow", mark: false }], searches: 0, server: SERVER } as any, (ev) => events.push(ev));
  while (!events.some((e) => e.$ === "Delta")) {
    await Bun.sleep(10);
  }
  run.send({ text: "and another thing", imgs: [] });
  run.stop();
  const end = await run.done;
  expect([end.stop, end.left.map((s) => s.text), entries(events)]).toEqual(["lost", ["and another thing"], [["illi", "Working\n[cut off]"]]]);
  expect(logged().find((l) => l.method === "session.abort").params.sessionId).toBe(logged().find((l) => l.method === "session.create").params.sessionId);
  const deaf: any[] = [];
  const held = Copilot.ask({ vendor: "github-copilot", model: "claude-sonnet-9.1", effort: "medium", speed: "slow", system: "P", blocks: [{ text: "deaf", mark: false }], searches: 0, server: SERVER } as any, (ev) => deaf.push(ev));
  while (!deaf.some((e) => e.$ === "Delta")) {
    await Bun.sleep(10);
  }
  held.stop();
  expect((await held.done).stop).toBe("lost");
});

test("calls at once share one CLI; one whose protocol illi doesn't speak is refused and ends; all end as illi ends", async () => {
  Copilot.close();
  await Bun.sleep(100);
  const both = await Promise.all([call("hold"), call("hold")]);
  expect(both.map((c) => c.end.text)).toEqual(["held", "held"]);
  expect([Copilot.running(), new Set(logged().filter((l) => l.env !== undefined).map((l) => l.pid)).size]).toEqual([1, 1]);
  Copilot.close();
  await Bun.sleep(100);
  process.env.FAKE_PROTOCOL = "4";
  const newer = await call("turn");
  expect([newer.end.stop, newer.end.text]).toEqual(["down", "GitHub Copilot said: your Copilot CLI is newer than this illi runs (its protocol 4): updating illi brings one that does"]);
  process.env.FAKE_PROTOCOL = "2";
  expect((await call("turn")).end.text).toContain("`copilot update` brings a newer one");
  await Bun.sleep(100);
  expect([Copilot.running(), fs.readdirSync(FOLDER + "/cache")]).toEqual([0, []]);
});

test("the account's models, as the CLI lists them, are those offered: the policy's disabled ones and those without tools left out; windows, efforts and prices kept for the next start, the chat told; the plan's use told", async () => {
  let told = 0;
  Copilot.watch(() => told++);
  expect(await Copilot.account()).toBe(true);
  expect(Pick.list("github-copilot").map((m) => [m.label, m.window, m.room, m.efforts, m.price])).toEqual([
    ["claude-sonnet-9.1", 160000, 0.8, ["low", "medium", "high", "xhigh"], 3],
    ["gpt-9.2", 400000, 0.68, ["low", "medium", "high"], 1.25],
    ["auto", undefined, undefined, undefined, undefined],
  ]);
  expect(JSON.parse(fs.readFileSync(DIR + "/models.json", "utf8")).vendors["github-copilot"].map((m: any) => m.id)).toEqual(["claude-sonnet-9.1", "gpt-9.2", "auto"]);
  expect([told, await Copilot.account(), told]).toEqual([1, false, 1]);
  expect(Copilot.plan()).toEqual({ brand: "Copilot", tier: "", limits: [{ window: 43200, used: 25, reset: Date.parse("2026-12-01T00:00:00Z") }] });
  await call("turn", { model: "auto" });
  expect(Pick.model("github-copilot", "auto")?.window).toBe(128000);
  expect([await Copilot.account(), Pick.model("github-copilot", "auto")?.window]).toEqual([false, 128000]);
});

test("/login's sign-in, over the CLI's connection, tells GitHub's page and the code, then whom it signed in as and the plan; with no keychain it asks to keep the token in the folder (no: not signed in); a failed one says the CLI's words; a stopped one is cancelled; its logout logs the folder out", async () => {
  const folder = DIR + "/copilot/gh2";
  const asked: string[][] = [];
  let kept = 0;
  const keep = async () => (kept++, true);
  const who = await Copilot.signin(folder, new AbortController().signal, (url, code) => asked.push([url, code]), keep);
  expect([asked, who, kept]).toEqual([[["https://github.com/login/device", "ABCD-1234"]], { login: "octocat", plan: "Business", lack: "" }, 0]);
  expect(logged().find((l) => l.method === "session.accounts.login.begin").params).toMatchObject({ kind: "githubDotCom", method: "device-code" });
  process.env.FAKE_LOGIN = "consent";
  expect(await Copilot.signin(DIR + "/copilot/gh4", new AbortController().signal, () => {}, keep)).toEqual({ login: "octocat", plan: "Business", lack: "" });
  expect([kept, logged().some((l) => l.method === "session.accounts.login.advance" && l.params.input === "allow")]).toEqual([1, true]);
  await expect(Copilot.signin(DIR + "/copilot/gh5", new AbortController().signal, () => {}, async () => false)).rejects.toThrow("illi didn't keep GitHub's token, so the account isn't signed in");
  process.env.FAKE_LOGIN = "fail";
  await expect(Copilot.signin(DIR + "/copilot/gh3", new AbortController().signal, () => {}, keep)).rejects.toThrow("GitHub's sign-in said “the device code expired”");
  process.env.FAKE_LOGIN = "hold";
  const stop = new AbortController();
  const held = Copilot.signin(DIR + "/copilot/gh6", stop.signal, () => setTimeout(() => stop.abort(), 100), keep);
  await expect(held).rejects.toThrow("the sign-in was stopped");
  for (let n = 0; n < 50 && !logged().some((l) => l.method === "session.accounts.login.cancel"); n++) {
    await Bun.sleep(20);
  }
  expect(logged().find((l) => l.method === "session.accounts.login.cancel")?.params).toMatchObject({ flowId: "f1" });
  await Bun.sleep(300);
  expect(await Copilot.logout(folder)).toBe(true);
  expect([logged().some((l) => l.method === "account.logout"), fs.existsSync(folder + "/signed-in")]).toEqual([true, false]);
});

test("an account GitHub gives no Copilot (its subscription ended): signed in all the same, why told with what's open to it and where; a turn refused says so, never GitHub's raw answer", async () => {
  process.env.FAKE_BARRED = "1";
  const folder = DIR + "/copilot/gh7";
  const who = await Copilot.signin(folder, new AbortController().signal, () => {}, async () => true);
  const why = "its Copilot subscription has ended. Copilot Free is open to it: turn it on at https://github.com/settings/copilot/features (or renew a plan there)";
  expect([who, Copilot.barred(folder)]).toEqual([{ login: "octocat", plan: "", lack: why }, why]);
  expect(Copilot.lack({ access_type_sku: "monthly_subscriber_quota", copilot_plan: "individual" })).toBe("it has no Copilot plan: get one at https://github.com/settings/copilot/features");
  const { end } = await call("barred");
  expect([end.ok, end.stop, end.text]).toEqual([false, "down", expect.stringMatching(/^GitHub won't let your account use Copilot: (its Copilot subscription has ended\.|it has no Copilot plan it can use)/)]);
  expect(end.text).not.toContain("GenericFailure");
});

test("no account, or no CLI, says what to do", async () => {
  const [bin, pin] = [CopilotCli.bin, CopilotCli.pin];
  [CopilotCli.bin, CopilotCli.pin] = [null, null];
  const none = await call("turn");
  expect([none.end.stop, none.end.text]).toEqual(["down", CopilotCli.why()]);
  expect(CopilotCli.why()).toStartWith("GitHub's Copilot CLI has no build for this machine");
  [CopilotCli.bin, CopilotCli.pin] = [bin, pin];
  fs.writeFileSync(DIR + "/accounts.json", "{}");
  const config = await import("../../config/Config.ts");
  config.config_accounts(true);
  const nobody = await call("turn");
  expect([nobody.end.stop, nobody.end.text]).toEqual(["down", "no GitHub account is in use for Copilot: /login signs in to one"]);
});

test("the CLI: each pinned build one illi takes; the user's own run once it's 1.0.100 or later, asked as illi runs it; illi's build run from its version's folder, unpacking itself there; the user's own where it keeps it", async () => {
  const { PINNED } = await import("./Pinned.ts");
  const { MINIMUM, RELEASES } = await import("./CopilotCli.ts");
  fs.writeFileSync(DIR + "/accounts.json", JSON.stringify({ "github-copilot": { use: "gh1", accounts: [{ id: "gh1", email: "octocat", plan: "", org: "" }] } }));
  (await import("../../config/Config.ts")).config_accounts(true);
  const all = Object.values(PINNED);
  expect([Object.keys(PINNED).sort(), all.every((b) => CopilotCli.takes(b)), new Set(all.map((b) => b.version)).size, MINIMUM]).toEqual([["darwin-aarch64", "darwin-x86_64", "linux-aarch64", "linux-x86_64"], true, 1, "1.0.100"]);
  expect([all[0].archive.startsWith(RELEASES + "v" + all[0].version + "/"), all[0].cmd, all[0].args]).toEqual([true, "copilot", []]);
  expect(CopilotCli.takes({ ...all[0], archive: RELEASES + all[0].version + "/copilot-linux-x64.tar.gz" })).toBe(false);
  const [bin, pin, which] = [CopilotCli.bin, CopilotCli.pin, CopilotCli.which];
  CopilotCli.bin = null;
  const own = DIR + "/bin/copilot";
  const theirs = (version: string) => {
    fs.mkdirSync(DIR + "/bin", { recursive: true });
    fs.writeFileSync(own, "#!/bin/sh\necho \"$*\" >> " + DIR + "/bin/asked\n[ \"$*\" = \"--no-auto-update --version\" ] && printf 'GitHub Copilot CLI " + version + ".\\nRun copilot update to check for updates.\\n'\n", { mode: 0o755 });
    fs.utimesSync(own, new Date(), new Date(Date.now() + Math.random() * 1e6));
  };
  theirs("1.0.101");
  CopilotCli.which = async () => own;
  CopilotCli.unlook();
  expect([await CopilotCli.look(), CopilotCli.command(), fs.readFileSync(DIR + "/bin/asked", "utf8")]).toEqual([{ at: own, version: "1.0.101" }, [own], "--no-auto-update --version\n"]);
  theirs("1.0.98");
  CopilotCli.unlook();
  CopilotCli.pin = { ...all[0], sha256: "f".repeat(64) };
  expect([await CopilotCli.look(), CopilotCli.why()]).toEqual([null, "GitHub's Copilot CLI isn't here: /login downloads it (your own copilot is 1.0.98, older than the 1.0.100 illi runs: `copilot update` brings it current)"]);
  CopilotCli.which = async () => null;
  CopilotCli.unlook();
  const at = CopilotCli.home() + "/1.0.200";
  fs.mkdirSync(at, { recursive: true });
  fs.writeFileSync(at + "/copilot", "#!/bin/sh\nexec " + process.execPath + " " + DIR + "/copilot.js \"$@\"\n", { mode: 0o755 });
  CopilotCli.pin = { ...all[0], version: "1.0.200", sha256: "e".repeat(64) };
  fs.writeFileSync(at + "/agent.json", JSON.stringify({ cmd: "copilot", args: [], sha256: "e".repeat(64) }));
  Copilot.close();
  await Bun.sleep(100);
  const turn = await call("turn");
  const started = logged().find((l) => l.env !== undefined);
  expect([turn.end.text, CopilotCli.command(), started.env.PKG, CopilotCli.ours([at + "/copilot"]), CopilotCli.ours([own])]).toEqual(["Hello", [at + "/copilot"], at + "/cache", at, null]);
  Copilot.close();
  await Bun.sleep(100);
  const env = { ...process.env };
  try {
    expect(Copilot.unpacked([own])).toBe(DIR + "/cache");
    process.env.COPILOT_PKG_CACHE_HOME = DIR + "/pkg";
    expect(Copilot.unpacked([own])).toBe(DIR + "/pkg");
    delete process.env.COPILOT_PKG_CACHE_HOME;
    delete process.env.COPILOT_CACHE_HOME;
    process.env.XDG_CACHE_HOME = DIR + "/xdg";
    expect(Copilot.unpacked([own])).toBe(process.platform === "darwin" ? os.homedir() + "/Library/Caches/copilot" : DIR + "/xdg/copilot");
  } finally {
    Object.assign(process.env, env);
    delete process.env.COPILOT_PKG_CACHE_HOME;
    if (env.XDG_CACHE_HOME === undefined) {
      delete process.env.XDG_CACHE_HOME;
    }
  }
  fs.rmSync(CopilotCli.home(), { recursive: true, force: true });
  [CopilotCli.bin, CopilotCli.pin, CopilotCli.which] = [bin, pin, which];
  CopilotCli.which = async () => null;
  CopilotCli.unlook();
});
