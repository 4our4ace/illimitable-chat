// OpenCode Go test
// ================
// `bun test OpenCodeGo.test.ts`. OpenCode's API stood in for (fetch
// answered here: no request leaves). The catalog: the models Chat
// Completions serves itself, with tools, priced, none a contributor's,
// the newest of each family, learned, offered and kept; the defaults
// the middle one by price for chats, the cheapest for summaries. A
// request names illi and the chat (one session for a chat's every
// call), sends an effort fitted to the model's own only to one that
// lists efforts, caps the reply at the model's most. A stream's
// thoughts, reply and tool calls read as they come; a turn sent back
// with its thoughts; one that ends after its finish with no usage still
// ends. Images to a model that takes them, else a note. A model's share
// of the plan used up is down, said plainly; a refused key, a request
// too long for the window, as the others.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import { temp_dir } from "../../../test/repo.ts";

const DIR = temp_dir("illi-opencode-go-");
for (const k of Object.keys(process.env).filter((k) => k.startsWith("ILLI_") || k.endsWith("_API_KEY"))) {
  delete process.env[k];
}
process.env.ILLI_DIR         = DIR;
process.env.XDG_DATA_HOME    = DIR + "/data";
process.env.OPENCODE_API_KEY = "oc_sk_test_0001";
fs.writeFileSync(DIR + "/accounts.json", JSON.stringify({ "opencode-go": { use: "env", keys: [] } }));

// the catalog as OpenCode lists it (its shape, a few of its models)
const entry = (id: string, api: string, price: number, more: any = {}) => ({
  id, object: "model", type: "chat",
  modalities   : { input: ["text", ...(more.images === false ? [] : ["image/png"])], output: ["text"] },
  capabilities : { tools: { supported: more.tools ?? true }, reasoning: { supported: more.effort !== null, effort: more.effort ?? undefined } },
  limit        : { context: more.context ?? 1000000, output: more.output ?? 131072 },
  cost         : { text: { input: { price } } },
  api          : { [api]: { compatibility: more.thinks === false ? undefined : { reasoning_field: "reasoning_content" } } },
});
const CATALOG = { object: "list", data: [
  entry("kimi-k3", "chat-completions", 3, { effort: ["max"], context: 1048576 }),
  entry("glm-5.2", "chat-completions", 1.4, { effort: ["high", "max"], images: false }),
  entry("glm-5.3", "chat-completions", 1.4, { effort: ["low", "high", "max"], images: false }),
  entry("deepseek-v4-pro", "chat-completions", 0.66, { effort: ["high", "max"], output: 384000 }),
  entry("deepseek-v4.1-flash", "chat-completions", 0.15, { effort: ["low", "high", "max"] }),
  entry("hy3", "chat-completions", 0.14, { effort: null, thinks: false, images: false, context: 256000, output: 128000 }),
  entry("gpt-6-luna", "responses", 0.1, { effort: ["none", "low", "medium", "high"] }),
  entry("claude-haiku-5-5", "messages", 0.1, { effort: ["low", "medium", "high"] }),
  entry("beam-free", "chat-completions", 0, {}),
  entry("muse-spark-1.3-contributor", "chat-completions", 0.1, {}),
  entry("no-tools-1", "chat-completions", 0.5, { tools: false }),
] };

// what came here: each request's url, headers and body; the streams the
// chat's requests are answered with, in turn (each a list of chunks, or
// a refusal: status and body)
const SENT: Array<{ url: string; headers: any; body: any }> = [];
const ANSWERS: Array<any[] | { status: number; body: string }> = [];
const SERVER = "http://tools.test/mcp";
const fetched = globalThis.fetch;
globalThis.fetch = (async (url: string, init: any = {}) => {
  const body = init.body === undefined ? null : JSON.parse(init.body);
  SENT.push({ url: String(url), headers: init.headers ?? {}, body });
  if (String(url) === SERVER) {
    const result = body.method === "tools/list" ? { tools: [{ name: "echo", description: "says it back", inputSchema: { type: "object" } }] } : { content: [{ type: "text", text: "echoed " + JSON.stringify(body.params.arguments) }] };
    return Response.json({ jsonrpc: "2.0", id: 1, result });
  }
  if (String(url).endsWith("/v1/models")) {
    const auth = init.headers?.authorization ?? "";
    return auth === "Bearer oc_sk_wrong" ? Response.json({ error: { type: "server_error", message: "Invalid credential" } }, { status: 401 }) : Response.json(CATALOG);
  }
  const next = ANSWERS.shift();
  if (next === undefined || !Array.isArray(next)) {
    return new Response(next?.body ?? "{}", { status: next?.status ?? 500 });
  }
  const sse = next.map((c) => "data: " + JSON.stringify(c) + "\n\n").join("");
  return new Response(sse, { headers: { "content-type": "text/event-stream" } });
}) as any;

const { OpenCodeGo, PROVIDER } = await import("./OpenCodeGo.ts");
const config = await import("../../config/Config.ts");
const { Agent } = await import("../../ai/Agent.ts");
const { Pick } = await import("../../ai/Pick.ts");

afterAll(() => {
  globalThis.fetch = fetched;
  fs.rmSync(DIR, { recursive: true, force: true });
});

// a call on the plan, as a chat makes one
const ask = (model: string, more: any = {}) => Agent.ask({ vendor: "opencode-go" as any, model, effort: "medium", speed: "slow", system: "the chat's system prompt", blocks: [{ text: "hi", mark: false }], searches: 0, server: "", ...more }, () => {});
const chat = () => SENT.filter((s) => s.url.endsWith("/chat/completions"));

test("the catalog: what Chat Completions serves itself, with tools, priced, no contributor's, the newest of each family; learned, offered, kept; asked once a key; chats on the middle by price, summaries on the cheapest", async () => {
  expect(config.OFFER.vendors).toEqual(["opencode-go" as any]);
  expect(await PROVIDER.account!()).toBe(true);
  const labels = ["kimi-k3", "glm-5.3", "deepseek-v4-pro", "deepseek-v4.1-flash", "hy3"];
  expect(Pick.list("opencode-go" as any).map((m) => m.label)).toEqual(labels);
  expect(labels.every((label) => config.OFFER.models.includes(label))).toBe(true);
  expect(Pick.model("opencode-go" as any, "kimi-k3")).toEqual({ label: "kimi-k3", id: "kimi-k3", speeds: ["slow"], window: 1048576, efforts: ["max"], price: 3 });
  expect(Pick.model("opencode-go" as any, "hy3")?.efforts).toBeUndefined();
  expect(JSON.parse(fs.readFileSync(DIR + "/models.json", "utf8")).vendors["opencode-go"].map((m: any) => m.label)).toEqual(labels);
  expect([Pick.label(config.config_chats("opencode-go" as any)!), Pick.label(config.config_role("compactor", config.config_chats("opencode-go" as any)!))]).toEqual(["opencode-go:deepseek-v4-pro:medium:slow", "opencode-go:hy3:low:slow"]);
  await PROVIDER.account!();
  await PROVIDER.ready!("kimi-k3");
  expect(SENT.filter((s) => s.url.endsWith("/v1/models")).map((s) => [s.url, s.headers.authorization, s.headers["user-agent"].startsWith("illi/")])).toEqual([["https://opencode.ai/inference/go/v1/models", "Bearer oc_sk_test_0001", true]]);
});

test("a key is checked against the catalog: one it refuses said so, never in its words", async () => {
  expect([await OpenCodeGo.check("oc_sk_test_0001"), await OpenCodeGo.check("oc_sk_wrong")]).toEqual(["", "OpenCode refused the key"]);
});

test("a request names illi and the chat, one session for its every call; an effort fitted to the model's own, only to one that lists efforts; the reply capped at the model's most", async () => {
  const done = [{ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }, { choices: [], usage: { prompt_tokens: 10, completion_tokens: 1 } }];
  ANSWERS.push(done, done, done);
  await ask("kimi-k3").done;
  await ask("hy3").done;
  await ask("kimi-k3", { system: "another chat" }).done;
  const [a, b, c] = chat();
  expect([a.url, a.headers.authorization, a.headers["user-agent"], a.headers["x-opencode-session"] === b.headers["x-opencode-session"], a.headers["x-opencode-session"] === c.headers["x-opencode-session"]]).toEqual(["https://opencode.ai/inference/go/openai/v1/chat/completions", "Bearer oc_sk_test_0001", "illi/" + (await import("../../../package.json")).version, true, false]);
  expect([a.body.reasoning_effort, a.body.max_tokens, b.body.reasoning_effort, b.body.max_tokens, a.body.stream_options, a.body.tools]).toEqual(["max", 128000, undefined, 128000, { include_usage: true }, undefined]);
  expect(a.body.messages).toEqual([{ role: "system", content: "the chat's system prompt" }, { role: "user", content: "hi" }]);
});

test("a stream's thoughts, reply and tool calls read as they come; the turn sent back with its thoughts, the result as a tool message; a stream ending after its finish with no usage still ends", async () => {
  SENT.length = 0;
  ANSWERS.push([
    { choices: [{ delta: { role: "assistant", reasoning_content: "Let me " } }] },
    { choices: [{ delta: { reasoning_content: "check." } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "echo", arguments: "{\"a\":" } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "1}" } }] }, finish_reason: "tool_calls" }] },
    { choices: [], usage: { prompt_tokens: 120, completion_tokens: 9, prompt_tokens_details: { cached_tokens: 100 } } },
  ], [
    { choices: [{ delta: { content: "It said " } }] },
    { choices: [{ delta: { content: "a=1." }, finish_reason: "stop" }] },
  ]);
  const entries: any[] = [];
  const run = Agent.ask({ vendor: "opencode-go" as any, model: "deepseek-v4-pro", effort: "medium", speed: "slow", system: "s", blocks: [{ text: "go", mark: false }], searches: 0, server: SERVER }, (ev) => ev.$ === "Entry" && entries.push([ev.kind, ev.text]));
  const end = await run.done;
  expect([end.ok, end.text]).toEqual([true, "It said a=1."]);
  expect(entries).toEqual([["mind", "Let me check."], ["tool", "echo {\"a\":1}"], ["echo", "echoed {\"a\":1}"], ["illi", "It said a=1."]]);
  const [first, second] = chat();
  expect(first.body.tools).toEqual([{ type: "function", function: { name: "echo", description: "says it back", parameters: { type: "object" } } }]);
  expect(first.body.reasoning_effort).toBe("high");
  expect(second.body.messages.slice(2)).toEqual([
    { role: "assistant", content: null, reasoning_content: "Let me check.", tool_calls: [{ id: "call_1", type: "function", function: { name: "echo", arguments: "{\"a\":1}" } }] },
    { role: "tool", tool_call_id: "call_1", content: "echoed {\"a\":1}" },
  ]);
});

test("its usage read: the prompt less what the cache gave", () => {
  const use = { input: 0, write: 0, read: 0, speed: "slow" };
  OpenCodeGo.usage(use, { prompt_tokens: 120, prompt_tokens_details: { cached_tokens: 100 } });
  expect(use).toEqual({ input: 20, write: 0, read: 100, speed: "slow" });
});

test("images go to a model that takes them, a tool's after its results; to one that takes none, a note in their place; a turn's thoughts kept from a model that streams none", () => {
  const img = { type: "image/png", data: "iVBO" };
  const user = { $: "User" as const, parts: [{ text: "see", mark: false }], imgs: [img] };
  const takes = { images: true, output: 1000, thinks: true };
  const none  = { images: false, output: 1000, thinks: false };
  expect(OpenCodeGo.messages(user, takes)).toEqual([{ role: "user", content: [{ type: "text", text: "see" }, { type: "image_url", image_url: { url: "data:image/png;base64,iVBO" } }] }]);
  expect(OpenCodeGo.messages(user, none)).toEqual([{ role: "user", content: "see\n[an image left out: this model takes none]" }]);
  const back = { $: "Back" as const, backs: [{ id: "c1", out: { text: "Image a.png", fail: false, imgs: [img, img] } }] };
  expect(OpenCodeGo.messages(back, takes)).toEqual([
    { role: "tool", tool_call_id: "c1", content: "Image a.png\n[its 2 images follow in the next message]" },
    { role: "user", content: [{ type: "text", text: "The images the tool results above returned:" }, { type: "image_url", image_url: { url: "data:image/png;base64,iVBO" } }, { type: "image_url", image_url: { url: "data:image/png;base64,iVBO" } }] },
  ]);
  expect(OpenCodeGo.messages(back, none)).toEqual([{ role: "tool", tool_call_id: "c1", content: "Image a.png\n[2 images left out: this model takes none]" }]);
  const turn = { $: "Turn" as const, out: [{ role: "assistant", content: "x", reasoning_content: "y" }] };
  expect([OpenCodeGo.messages(turn, none), OpenCodeGo.messages(turn, takes)]).toEqual([[{ role: "assistant", content: "x", reasoning_content: undefined }], [{ role: "assistant", content: "x", reasoning_content: "y" }]]);
});

test("a model's share of the plan used up is down, said plainly; a refused key says /login replaces it; an error mid-stream too long for the window is full; a reply cut at its most fails", async () => {
  ANSWERS.push({ status: 429, body: JSON.stringify({ type: "error", error: { type: "GoUsageLimitError", message: "Go usage limit exceeded" }, metadata: { limitName: "5 hour" } }) });
  const limited = await ask("kimi-k3").done;
  expect([limited.stop, limited.text]).toEqual(["down", "this model's share of your OpenCode Go plan is used up for now (each model has its own 5-hour, weekly and monthly limit): /model picks another, or wait till it resets"]);
  ANSWERS.push({ status: 401, body: JSON.stringify({ error: { type: "server_error", message: "Invalid credential" } }) });
  const refused = await ask("kimi-k3").done;
  expect([refused.stop, refused.text]).toEqual(["down", "OpenCode refused the API key (HTTP 401: Invalid credential): /login replaces it"]);
  ANSWERS.push([{ error: { message: "This model's maximum context length is 1000000 tokens" } }]);
  expect((await ask("kimi-k3").done).stop).toBe("full");
  ANSWERS.push([{ choices: [{ delta: { content: "and so" }, finish_reason: "length" }] }, { choices: [], usage: { prompt_tokens: 1 } }]);
  const cut = await ask("kimi-k3").done;
  expect([cut.stop, cut.text]).toEqual(["fail", "the reply reached the most the model may write at once"]);
});
