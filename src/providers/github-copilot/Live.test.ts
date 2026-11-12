// Live test
// =========
// GitHub's real Copilot CLI, run through illi's runner as illi runs it
// (`--headless --stdio`, its home the account's folder) against a
// stand-in for the model's API (an OpenAI-compatible one served here, as
// the CLI's own bring-your-own-key provider: ILLI_COPILOT_GATEWAY,
// answering by a marker in the message, [T1]..[T6], bracketed so the
// time the CLI dates it by, as T12:00, never reads as one) and for
// illi's tools, so no model is asked, no account signs in, and nothing
// is sent to GitHub's
// models. Skipped unless ILLI_COPILOT_LIVE names the CLI to run (a
// `copilot` of the user's own: its path). A maintainer runs it before a
// release, and when GitHub's CLI changes much (docs/development.md):
//
//     ILLI_COPILOT_LIVE=$(command -v copilot) bun test --isolate src/providers/github-copilot/Live.test.ts
//
// It tries: a turn (the tokens it read told; illi's prompt alone, the
// message dated by the CLI; illi's tools alone, by their MCP names); a
// window learned from the CLI; illi's tool called and its answer echoed;
// too long for the window (full: the model's refusal, and the CLI's own
// count past it, never sent); a stop mid-stream (lost, at once); two
// calls at once on one CLI; the CLI's web fetch asking illi first
// (refused here); nothing left behind (no session's files, no log, no
// cache, no CLI running). The CLI retries a busy service (500) five times over
// seconds, so that isn't tried.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const CLI  = process.env.ILLI_COPILOT_LIVE?.trim() ?? "";
const LIVE = CLI !== "";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-copilot-live-");
for (const k of Object.keys(process.env).filter((k) => k.startsWith("ILLI_") && k !== "ILLI_COPILOT_LIVE")) {
  delete process.env[k];
}
process.env.ILLI_DIR     = DIR;
process.env.ILLI_VENDORS = "claude-api";
fs.writeFileSync(DIR + "/accounts.json", JSON.stringify({ "github-copilot": { use: "live", accounts: [{ id: "live", email: "", plan: "", org: "" }] } }));

// what the stand-in API was sent, each request's body
const SENT: any[] = [];

// a stream of chunks, as Chat Completions sends one
function sse(chunks: object[], slow = false): Response {
  const enc = new TextEncoder();
  const lines = [...chunks.map((c) => "data: " + JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "live", ...c }) + "\n\n"), "data: [DONE]\n\n"];
  return new Response(new ReadableStream({
    async start(ctl) {
      for (const line of lines) {
        ctl.enqueue(enc.encode(line));
        if (slow) {
          await Bun.sleep(20000);
        }
      }
      ctl.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
}

const say  = (text: string) => ({ choices: [{ index: 0, delta: { content: text } }] });
const stop = (why: string, read: number) => ({ choices: [{ index: 0, delta: {}, finish_reason: why }], usage: { prompt_tokens: read, completion_tokens: 3, total_tokens: read + 3 } });
const tool = (id: string, name: string, args: object) => ({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] });

// the stand-in for the model's API: each answer by the marker in the
// last user message, a step after a tool's answer by that
const API = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/models")) {
      return Response.json({ data: [{ id: "live-model", object: "model" }] });
    }
    const body: any = await req.json();
    SENT.push(body);
    const last = body.messages.at(-1);
    const user = JSON.stringify(body.messages.filter((m: any) => m.role === "user").at(-1)?.content ?? "");
    if (last.role === "tool") {
      return sse([say("It says: " + last.content), stop("stop", 1300)]);
    }
    if (user.includes("[T1]")) return sse([say("Hel"), say("lo"), stop("stop", 1200)]);
    if (user.includes("[T2]")) return sse([say("Looking. "), tool("c1", "illi-zoom", { id: 3 }), stop("tool_calls", 1250)]);
    if (user.includes("[T3]")) return Response.json({ error: { message: "This model's maximum context length is 128000 tokens. However, your messages resulted in 200000 tokens.", type: "invalid_request_error", code: "context_length_exceeded" } }, { status: 400 });
    if (user.includes("[T4]")) return sse([say("Working"), say(" on and on"), stop("stop", 10)], true);
    if (user.includes("[T5]")) return sse([say("both"), stop("stop", 10)]);
    if (user.includes("[T6]")) return sse([tool("w1", "web_fetch", { url: "https://example.invalid/page" }), stop("tool_calls", 10)]);
    return sse([say("?"), stop("stop", 1)]);
  },
});

// the stand-in for illi's tools: zoom answers "line 3", approve refuses
const TOLD: any[] = [];
const TOOLS = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  idleTimeout: 0,
  async fetch(req) {
    if (req.method !== "POST") {
      return new Response(null, { status: 405 });
    }
    const url = new URL(req.url);
    const m: any = await req.json();
    TOLD.push({ hosted: url.searchParams.has("hosted"), m });
    if (m.id === undefined) {
      return new Response(null, { status: 202 });
    }
    const ok = (result: unknown) => Response.json({ jsonrpc: "2.0", id: m.id, result });
    switch (m.method) {
      case "initialize": return ok({ protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "illi", version: "1" } });
      case "tools/list": return ok({ tools: [{ name: "zoom", description: "Look closer.", inputSchema: { type: "object", properties: { id: { type: "number" } } } }] });
      case "tools/call": return m.params.name === "approve" ? ok({ content: [{ type: "text", text: JSON.stringify({ behavior: "deny", message: "no" }) }] }) : ok({ content: [{ type: "text", text: "line 3" }] });
    }
    return Response.json({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "no method " + m.method } });
  },
});
const SERVER = "http://127.0.0.1:" + TOOLS.port + "/k/main";
process.env.ILLI_COPILOT_GATEWAY = "http://127.0.0.1:" + API.port;

const { Copilot } = await import("./Copilot.ts");
const { CopilotCli } = await import("./CopilotCli.ts");
const { Pick } = await import("../../ai/Pick.ts");
const { FAILED } = await import("../../ui/View.ts");
CopilotCli.bin = [CLI];
Pick.learn("github-copilot", [{ label: "live-model", id: "live-model", speeds: ["slow"] }]);

const FOLDER = DIR + "/copilot/live";

afterAll(() => {
  Copilot.close();
  API.stop(true);
  TOOLS.stop(true);
  fs.rmSync(DIR, { recursive: true, force: true });
});

// a call run to its end: its events and its end
async function call(scene: string, more: Record<string, unknown> = {}) {
  const events: any[] = [];
  const run = Copilot.ask({ vendor: "github-copilot", model: "live-model", effort: "medium", speed: "slow", system: "ILLI PROMPT", blocks: [{ text: scene, mark: false }], searches: 0, server: SERVER, ...more } as any, (ev) => events.push(ev));
  return { events, end: await run.done, run };
}

const entries = (events: any[]) => events.filter((e) => e.$ === "Entry").map((e) => [e.kind, e.text]);

test.skipIf(!LIVE)("a turn: illi's prompt alone, the message dated by the CLI, illi's tools alone by their MCP names; the tokens read told; the window learned", async () => {
  const { events, end } = await call("[T1] hello");
  expect([end.ok, end.text, end.first, entries(events)]).toEqual([true, "Hello", 1200, [["illi", "Hello"]]]);
  const body = SENT.at(-1);
  expect([body.messages[0].role, String(body.messages[0].content).startsWith("ILLI PROMPT\n\n")]).toEqual(["system", true]);
  expect(body.messages[1].role).toBe("user");
  expect(JSON.stringify(body.messages[1].content)).toMatch(/<current_datetime>.*\[T1\] hello/);
  expect(body.tools.map((t: any) => t.function.name)).toEqual(["illi-zoom"]);
  expect((Pick.model("github-copilot", "live-model")?.window ?? 0) > 0).toBe(true);
}, 60000);

test.skipIf(!LIVE)("illi's tool called through its MCP server and its answer echoed, the CLI's permission given by illi", async () => {
  const { events, end } = await call("[T2] look");
  expect([end.ok, end.text]).toEqual([true, "It says: line 3"]);
  expect(entries(events)).toEqual([["illi", "Looking."], ["tool", 'zoom {"id":3}'], ["echo", "line 3"], ["illi", "It says: line 3"]]);
  expect(TOLD.filter((t) => t.m.method === "tools/call").map((t) => t.m.params.name)).toEqual(["zoom"]);
}, 60000);

test.skipIf(!LIVE)("too long for the window ends `full`: the model's refusal, and the CLI's own count past it (never sent)", async () => {
  const { end } = await call("[T3] long");
  expect([end.ok, end.stop]).toEqual([false, "full"]);
  const sent = SENT.length;
  const big = await call("[T1] " + "a line of an older talk, nothing in it\n".repeat(16000));
  expect([big.end.ok, big.end.stop, SENT.length]).toEqual([false, "full", sent]);
}, 60000);

test.skipIf(!LIVE)("a stop mid-stream ends the call at once, what streamed logged as cut off", async () => {
  const events: any[] = [];
  const run = Copilot.ask({ vendor: "github-copilot", model: "live-model", effort: "medium", speed: "slow", system: "P", blocks: [{ text: "[T4] slow", mark: false }], searches: 0, server: SERVER } as any, (ev) => events.push(ev));
  while (!events.some((e) => e.$ === "Delta")) {
    await Bun.sleep(20);
  }
  const at = Date.now();
  run.stop();
  const end = await run.done;
  expect([end.stop, entries(events), Date.now() - at < 6000]).toEqual(["lost", [["illi", "Working\n[cut off]"]], true]);
}, 60000);

test.skipIf(!LIVE)("two calls at once run on one CLI", async () => {
  const both = await Promise.all([call("[T5] a"), call("[T5] b")]);
  expect([both.map((c) => c.end.text), Copilot.running()]).toEqual([["both", "both"], 1]);
}, 60000);

test.skipIf(!LIVE)("the CLI's web fetch asks illi first, refused here; nothing left behind as illi ends", async () => {
  const { events } = await call("[T6] fetch", { searches: 1 });
  expect(TOLD.filter((t) => t.hosted).map((t) => t.m.params.arguments)).toEqual([{ tool_name: "WebFetch", input: { url: "https://example.invalid/page" } }]);
  expect(entries(events).slice(0, 2).map(([kind, text]) => [kind, kind === "echo" ? text.startsWith(FAILED) : text])).toEqual([["tool", 'WebFetch {"url":"https://example.invalid/page"}'], ["echo", true]]);
  await Bun.sleep(500);
  Copilot.close();
  await Bun.sleep(1500);
  const left = (sub: string) => (fs.existsSync(FOLDER + "/" + sub) ? fs.readdirSync(FOLDER + "/" + sub).filter((f) => !f.startsWith(".")) : []);
  expect([Copilot.running(), left("session-state"), left("logs"), left("cache")]).toEqual([0, [], [], []]);
}, 60000);
