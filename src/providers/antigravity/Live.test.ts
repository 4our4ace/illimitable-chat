// Live test
// =========
// Google's real agent, the build this illi is pinned to (Pinned.ts), run
// through illi's runner against a stand-in for Google's AI API (a gateway
// served here, answering by a marker in the prompt: T0..T8), so no model
// is asked and no account signs in. Skipped unless ILLI_AGY_LIVE names a
// folder of its own, kept between runs, where the build is downloaded
// once from Google's host (its checksum the pinned one), as /login
// would; one holding anything else (illi's own folder, say) is refused. A maintainer runs it before a release takes a new version
// (docs/development.md):
//
//     ILLI_AGY_LIVE=~/.cache/illi-agy-live bun test --isolate src/providers/antigravity/Live.test.ts
//
// It tries: the agent says it's the pinned version; a turn; the next on
// the agent kept (at once); illi's tool called and its answer echoed; a
// picture; thoughts and a reply in pieces; too long for the window
// (full); a model the plan doesn't offer (said plainly); a stop during a
// tool (lost); two calls at once on one agent; the window learned; the
// agent's own web search asking illi first (refused here); nothing left
// behind (no session's files, no agent running). Google's agent retries
// a busy service (503) for minutes, so that isn't tried.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

const KEEP = process.env.ILLI_AGY_LIVE?.trim() ?? "";
const LIVE = KEEP !== "";

// the accounts' file the trial writes in its folder: its one account
const ACCOUNTS = JSON.stringify({ antigravity: { use: "live", accounts: [{ id: "live", email: "", plan: "", org: "" }] } });

// what in a folder isn't the trial's own (Google's agent, its account,
// the accounts' file it writes): an illi root's chats, logins, accounts...
function others(dir: string): string[] {
  const names = (at: string) => (fs.existsSync(at) ? fs.readdirSync(at) : []);
  const top   = names(dir).filter((n) => n !== "antigravity" && !(n === "accounts.json" && fs.readFileSync(path.join(dir, n), "utf8") === ACCOUNTS));
  return [...top, ...names(path.join(dir, "antigravity")).filter((n) => n !== "agent" && n !== "live").map((n) => "antigravity/" + n)];
}

// illi's folder the kept one (the build in it), its vendor this alone; a
// folder holding anything else (illi's own, say) refused, so no login is
// ever overwritten
if (LIVE) {
  const theirs = others(KEEP);
  if (theirs.length > 0) {
    throw new Error("ILLI_AGY_LIVE names a folder that isn't the live trial's own (it holds " + theirs.slice(0, 5).join(", ") + "): name a new one, such as ~/.cache/illi-agy-live");
  }
  for (const k of Object.keys(process.env).filter((k) => k.startsWith("ILLI_"))) {
    delete process.env[k];
  }
  fs.mkdirSync(KEEP, { recursive: true, mode: 0o700 });
  process.env.ILLI_DIR = KEEP;
  process.env.ILLI_VENDORS = "antigravity";
  fs.writeFileSync(path.join(KEEP, "accounts.json"), ACCOUNTS);
}

// the prompt's turn in a request: its marker (the last in the latest
// user turn holding one), and the parts after it (tools' answers)
function turn(body: any): { marker: string; after: any[] } {
  const contents: any[] = body?.contents ?? [];
  let k = contents.length - 1;
  while (k >= 0 && !(contents[k].role === "user" && (contents[k].parts ?? []).some((p: any) => typeof p.text === "string" && /\bT\d\b/.test(p.text)))) {
    k--;
  }
  const user = k < 0 ? "" : contents[k].parts.filter((p: any) => typeof p.text === "string").map((p: any) => p.text).join("\n");
  return { marker: [...user.matchAll(/\b(T\d)\b/g)].at(-1)?.[1] ?? "", after: contents.slice(k + 1).flatMap((c: any) => c.parts ?? []) };
}

// the stand-in's answers: a turn by its marker, each tool's answer echoed
// back
function script(body: any): { call: string; args: any } | { text: string } {
  const { marker, after } = turn(body);
  const asked = after.filter((p: any) => p.functionResponse).length;
  const names: string[] = (body?.tools ?? []).flatMap((t: any) => (t.functionDeclarations ?? []).map((f: any) => f.name));
  const find  = (s: string) => names.find((n) => n.toLowerCase().includes(s)) ?? s;
  const last  = JSON.stringify(after.filter((p: any) => p.functionResponse).at(-1) ?? null).slice(0, 4000);
  switch (marker) {
    case "T1": return { text: "Hello from the stand-in. Tools I see: " + names.join(", ") };
    case "T2": return asked === 0 ? { call: find("echo"), args: { x: "ping" } } : { text: "T2 got: " + last };
    case "T3": return asked === 0 ? { call: find("picture"), args: {} } : { text: "T3 got: " + last };
    case "T5": return asked === 0 ? { call: "search_web", args: { query: "illi agent", toolAction: "Searching the web", toolSummary: "Web search" } } : { text: "T5 got: " + last };
    case "T6": return asked === 0 ? { call: find("slow"), args: {} } : { text: "T6 got: " + last };
    default: return { text: "no marker" };
  }
}

// a stand-in for Google's AI API: its models, its answers streamed
const GATEWAY = Bun.serve({ port: 0, hostname: "127.0.0.1", idleTimeout: 120, async fetch(req) {
  const url  = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => null) : null;
  const sse  = (...parts: string[]) => new Response(parts.join(""), { headers: { "content-type": "text/event-stream" } });
  const err  = (status: number, code: string, message: string) => Response.json({ error: { code: status, message, status: code } }, { status });
  if (req.method === "GET" && /\/models/.test(url.pathname)) {
    const model = (id: string, name: string) => ({ name: "models/" + id, displayName: name, inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: ["generateContent", "streamGenerateContent"] });
    return url.pathname.startsWith("/v1beta") ? Response.json({ models: [model("gemini-3.5-flash", "Gemini 3.5 Flash"), model("gemini-3.1-pro", "Gemini 3.1 Pro")] }) : Response.json({ object: "list", data: [{ id: "gemini-3.5-flash", object: "model" }] });
  }
  if (/:countTokens/.test(url.pathname)) {
    return Response.json({ totalTokens: 1234 });
  }
  if (/:(stream)?[gG]enerateContent/.test(url.pathname)) {
    const { marker } = turn(body);
    if (marker === "T8") {
      return err(400, "INVALID_ARGUMENT", "The input token count (2000000) exceeds the maximum number of tokens allowed (1048576).");
    }
    const chunk = (part: any, last: boolean, usage = { promptTokenCount: 1234, candidatesTokenCount: 12, totalTokenCount: 1246 }) => "data: " + JSON.stringify({ candidates: [{ content: { role: "model", parts: [part] }, ...(last ? { finishReason: "STOP" } : {}), index: 0 }], ...(last ? { usageMetadata: usage } : {}), modelVersion: "gemini-3.5-flash" }) + "\r\n\r\n";
    if (marker === "T0") {
      return sse(chunk({ text: "Let me think about it.", thought: true }, false), chunk({ text: "First " }, false), chunk({ text: "second " }, false), chunk({ text: "third." }, true));
    }
    const step = script(body);
    const part = "call" in step ? { functionCall: { name: step.call, args: step.args } } : { text: step.text };
    return /:stream/.test(url.pathname) ? sse(chunk(part, true)) : Response.json({ candidates: [{ content: { role: "model", parts: [part] }, finishReason: "STOP", index: 0 }], usageMetadata: { promptTokenCount: 1234, candidatesTokenCount: 12, totalTokenCount: 1246 } });
  }
  return err(404, "NOT_FOUND", "not here");
} });

// a 1x1 red picture
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

// a stand-in for illi's tools (its MCP server): echo, picture, slow (three
// seconds); no approve, so the agent's web search is refused
const TOOLS = Bun.serve({ port: 0, hostname: "127.0.0.1", idleTimeout: 120, async fetch(req) {
  if (req.method !== "POST") {
    return new Response("", { status: 405 });
  }
  const m = await req.json();
  if (m.id === undefined) {
    return new Response("", { status: 202 });
  }
  const ok = (result: unknown) => Response.json({ jsonrpc: "2.0", id: m.id, result }, { headers: { "mcp-session-id": "live" } });
  const text = (t: string) => ok({ content: [{ type: "text", text: t }] });
  if (m.method === "initialize") {
    return ok({ protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "illi", version: "0" } });
  }
  if (m.method === "tools/list") {
    const tool = (name: string, description: string, properties = {}) => ({ name, description, inputSchema: { type: "object", properties } });
    return ok({ tools: [tool("echo", "Echo x back.", { x: { type: "string" } }), tool("picture", "Return a small picture."), tool("slow", "Answer after three seconds.")] });
  }
  if (m.method === "tools/call") {
    const name = m.params?.name;
    if (name === "echo") {
      return text("ECHO:" + m.params?.arguments?.x);
    }
    if (name === "picture") {
      return ok({ content: [{ type: "image", data: PNG, mimeType: "image/png" }, { type: "text", text: "a red dot" }] });
    }
    if (name === "slow") {
      await Bun.sleep(3000);
      return text("slow done");
    }
    return ok({ content: [{ type: "text", text: "no such tool" }], isError: true });
  }
  return Response.json({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "no " + m.method } });
} });

process.env.ILLI_ANTIGRAVITY_GATEWAY = "http://127.0.0.1:" + GATEWAY.port;

const { Antigravity } = await import("./Antigravity.ts");
const { Agy } = await import("./Agy.ts");
const { Acp } = await import("./Acp.ts");
const { Pick } = await import("../../ai/Pick.ts");

const FOLDER = path.join(KEEP, "antigravity", "live");
const SERVER = "http://127.0.0.1:" + TOOLS.port + "/mcp";

afterAll(() => {
  Antigravity.close();
  GATEWAY.stop(true);
  TOOLS.stop(true);
  if (LIVE) {
    fs.rmSync(FOLDER, { recursive: true, force: true });
    fs.rmSync(path.join(KEEP, "accounts.json"), { force: true });
  }
});

// a call: how it ended, what it showed (entries' kind and text), how long
// it took (ms)
async function call(text: string, more: any = {}, during?: (run: any, ev: any) => void): Promise<{ end: any; shown: string[]; ms: number }> {
  const events: any[] = [];
  const t0  = performance.now();
  const run: any = Antigravity.ask({ vendor: "antigravity", model: "gemini-3.5-flash", effort: "medium", speed: "slow", system: "You are illi's model (a live test).", blocks: [{ text, mark: false }], searches: 0, server: SERVER, ...more } as any, (ev: any) => {
    events.push(ev);
    during?.(run, ev);
  });
  const end = await run.done;
  return { end, shown: events.filter((e) => e.$ === "Entry").map((e) => e.kind + ": " + e.text), ms: performance.now() - t0 };
}

test.skipIf(!LIVE)("Google's real agent, the pinned build, through illi's runner against a stand-in API", async () => {
  if (Agy.pin === null) {
    throw new Error(Agy.why());
  }
  if (!Agy.ready()) {
    await Agy.download(Agy.pin, AbortSignal.timeout(900e3), () => {});
  }
  const cmd = Agy.command()!;
  expect(cmd[0]).toBe(path.join(Agy.home(), Agy.pin.version, Agy.pin.cmd));

  // the agent says it's the pinned version
  const conn  = Acp.start(cmd, Antigravity.work(FOLDER), Antigravity.env(FOLDER), () => {}, () => {});
  const hello = await Acp.call(conn, "initialize", Antigravity.hello(), 90e3);
  Acp.stop(conn, "its version read");
  expect(hello?.agentInfo).toMatchObject({ name: "antigravity-acp", version: Agy.pin.version });

  // a turn, then the next on the agent kept, at once
  const one = await call("T1 hello");
  expect(one.end).toMatchObject({ ok: true });
  expect(one.end.text).toContain("mcp_illi_echo");
  const two = await call("T1 hello again");
  expect([two.end.ok, two.ms < 1500]).toEqual([true, true]);

  // illi's tool called, its answer echoed; a picture
  const echo = await call("T2 echo");
  expect([echo.end.ok, echo.shown.slice(0, 2)]).toEqual([true, ['tool: echo {"x":"ping"}', "echo: ECHO:ping"]]);
  const pic = await call("T3 picture");
  expect(pic.end.ok).toBe(true);
  expect(pic.shown).toContain("echo: [image]\na red dot");

  // thoughts, and a reply in pieces
  const thought = await call("T0 thoughts and pieces");
  expect([thought.end.ok, thought.end.text, thought.shown[0]]).toEqual([true, "First second third.", "mind: Let me think about it."]);

  // too long for the window; a model the plan doesn't offer
  expect((await call("T8 too long")).end).toMatchObject({ ok: false, stop: "full" });
  const none = await call("T1 on a model not offered", { model: "gemini-3.8-flash" });
  expect(none.end).toMatchObject({ ok: false, stop: "fail" });
  expect(none.end.text).toContain("doesn't offer gemini-3.8-flash");

  // a stop during a tool
  const stopped = await call("T6 slow, stopped", {}, (run, ev) => {
    if (ev.$ === "Entry" && ev.kind === "tool") {
      setTimeout(() => run.stop(), 500);
    }
  });
  expect(stopped.end).toMatchObject({ ok: false, stop: "lost" });

  // two calls at once, on one agent; the window learned
  const both = await Promise.all([call("T1 at once A"), call("T1 at once B")]);
  expect([both[0].end.ok, both[1].end.ok, Antigravity.running(), Pick.model("antigravity", "gemini-3.5-flash")?.window]).toEqual([true, true, 1, 1048576]);

  // the agent's own web search asks illi first (refused here)
  const web = await call("T5 web search", { searches: 1 });
  expect(web.end.ok).toBe(true);
  expect(web.end.text).toContain("search_web");

  // nothing left behind
  Antigravity.close();
  const home = path.join(FOLDER, ".gemini", "antigravity-acp");
  expect([fs.readdirSync(path.join(home, "conversations")), fs.readdirSync(path.join(home, "brain"))]).toEqual([[], []]);
  await Bun.sleep(1500);
  const ps = Bun.spawnSync(["ps", "-eo", "args"]).stdout.toString().split("\n");
  expect(ps.filter((line) => line.startsWith(Agy.home()))).toEqual([]);
}, 1_200_000);
