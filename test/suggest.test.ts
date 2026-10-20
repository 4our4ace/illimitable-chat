// Suggest test
// ============
// `bun test suggest.test.ts`. A chat's turns through the real Memory,
// AskAI and Agent loop against a fake Anthropic: a turn that ends
// answered asks for a suggested reply that goes on from its last request
// (the same model, system prompt, tools and messages, its answer, then
// the ask; no breakpoint more, so the turn's cache serves it) and shows
// it till a message; none after a failed turn, a stop, a tool call in its
// answer, from a pipe (off); five in a row unused stop them, one used
// starts the count anew; an answer of nothing, thanks or praise, or in
// Illi's voice, is none.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-suggest-");
const CWD = fs.mkdtempSync(os.tmpdir() + "/illi-suggest-cwd-");
process.env.ILLI_DIR = DIR;
process.env.ILLI_VENDORS = "claude-api";
process.env.ILLI_PICK = "claude-api:sonnet-5.5:medium:slow";
process.env.ILLI_COMPACTOR = "claude-api:haiku-5.5:high:slow";

// a process reads Config once (maybe for another test): the fake key goes
// in it, not in the environment
const config = await import("../src/config/Config.ts");
config.KEYS.anthropic = "test";

const { Chat } = await import("../src/chat/Chat.ts");

// what a suggested reply is asked by, as it starts
const ASK = "Suggest the user's next message to Illi";

// the fake vendor: how a turn's request is answered (a reply; a tool call
// first, then a reply; refused; held till stopped), the block a
// suggestion's is answered with, and the requests of each, in order
let turn: "ok" | "tool" | "fail" | "hold" = "ok";
let answer: object = { type: "text", text: "Show me the diff" };
const asked: Array<{ kind: "turn" | "suggest"; body: any }> = [];

// a streamed answer of one block: a text, or a tool call
function stream(block: any, signal?: AbortSignal, hold = false): Response {
  const tool = block.type === "tool_use";
  const delta = tool ? { type: "input_json_delta", partial_json: JSON.stringify(block.input) } : { type: "text_delta", text: block.text };
  const events = [
    { type: "message_start", message: { usage: { input_tokens: 10 } } },
    { type: "content_block_start", index: 0, content_block: tool ? { ...block, input: {} } : { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 5 } },
    { type: "message_stop" },
  ];
  const sse = (evs: object[]) => new TextEncoder().encode(evs.map((ev) => "data: " + JSON.stringify(ev) + "\n\n").join(""));
  const body = new ReadableStream({
    start: (out) => {
      out.enqueue(sse(events.slice(0, 1)));
      if (hold) {
        signal?.addEventListener("abort", () => out.error(new Error("aborted")), { once: true });
        return;
      }
      out.enqueue(sse(events.slice(1)));
      out.close();
    },
  });
  return new Response(body);
}

const real = globalThis.fetch;
globalThis.fetch = (async (url: string, init: any) => {
  if (!String(url).startsWith("https://api.anthropic.com/")) {
    return real(url, init);
  }
  const body = JSON.parse(init.body);
  const first = body.messages[0].content.map((c: any) => c.text ?? "").join("");
  const last = body.messages.at(-1).content[0]?.text ?? "";
  if (last.startsWith(ASK)) {
    asked.push({ kind: "suggest", body });
    return stream(answer);
  }
  if (!first.includes("Turn: the user's new message")) {
    return stream({ type: "text", text: "user: said something." });
  }
  asked.push({ kind: "turn", body });
  const done = body.messages.some((m: any) => m.role === "assistant");
  if (turn === "fail") {
    return new Response(JSON.stringify({ error: { message: "invalid request" } }), { status: 400 });
  }
  if (turn === "tool" && !done) {
    return stream({ type: "tool_use", id: "t1", name: "date", input: { id: 0 } });
  }
  return stream({ type: "text", text: "Done." }, init.signal, turn === "hold");
}) as any;

async function until(ok: () => boolean): Promise<void> {
  for (let k = 0; !ok(); k++) {
    if (k > 400) {
      throw new Error("never");
    }
    await Bun.sleep(5);
  }
}

const chat = Chat.open(CWD);
chat.suggest.on = true;

// a message the user sends, as a view's would
const say = (text: string) => Chat.say(chat, crypto.randomUUID(), [], Buffer.from(text));

// the suggested replies asked so far
const suggests = () => asked.filter((a) => a.kind === "suggest");

// a request's cache breakpoints: its blocks' and its top-level one
const marks = (body: any) => [...body.system, ...body.messages.flatMap((m: any) => m.content)].filter((c: any) => c.cache_control).length + (body.cache_control ? 1 : 0);

test("a turn ended answered asks for a suggested reply on its last request, so on its cache; a message takes it away", async () => {
  turn = "tool";
  await say("what changed?");
  await until(() => chat.suggest.text !== "");
  const turns = asked.filter((a) => a.kind === "turn");
  expect(turns).toHaveLength(2);
  expect(suggests()).toHaveLength(1);
  const last = turns[1].body;
  const sug = suggests()[0].body;
  for (const key of ["model", "system", "tools", "thinking", "output_config", "speed"]) {
    expect(sug[key]).toEqual(last[key]);
  }
  expect(sug.tools.map((t: any) => t.name)).toContain("date");
  expect(sug.messages.slice(0, last.messages.length)).toEqual(last.messages);
  expect(sug.messages.slice(last.messages.length)).toEqual([
    { role: "assistant", content: [{ type: "text", text: "Done." }] },
    { role: "user", content: [{ type: "text", text: expect.stringContaining(ASK) }] },
  ]);
  expect(sug.cache_control).toEqual({ type: "ephemeral" });
  expect(marks(sug)).toBe(marks(last));
  expect(marks(sug)).toBeLessThanOrEqual(4);
  expect(sug.max_tokens).toBeLessThan(1000);
  expect(Chat.state(chat)).toMatchObject({ suggest: "Show me the diff" });
  turn = "ok";
  await say("Show me the diff");
  expect(Chat.state(chat)).toMatchObject({ suggest: "" });
  await until(() => chat.suggest.text !== "");
  expect(suggests()).toHaveLength(2);
});

test("none after a stop, a failed turn, a tool call in its answer, or from a pipe", async () => {
  const n = suggests().length;
  turn = "hold";
  await say("stop this");
  expect(chat.suggest.text).toBe("");
  await until(() => chat.call !== null && asked.at(-1)!.kind === "turn");
  Chat.interrupt(chat, "Stopped by the user.");
  await until(() => !chat.busy);
  await Bun.sleep(30);
  expect(suggests()).toHaveLength(n);
  turn = "fail";
  const error = console.error;
  console.error = () => {};
  await say("again");
  await until(() => !chat.busy);
  console.error = error;
  await Bun.sleep(30);
  expect(suggests()).toHaveLength(n);
  turn = "ok";
  answer = { type: "tool_use", id: "t2", name: "date", input: { id: 0 } };
  await say("and now?");
  await until(() => !chat.busy && suggests().length > n && chat.suggest.call === null);
  await Bun.sleep(30);
  expect(suggests()).toHaveLength(n + 1);
  expect(chat.suggest.text).toBe("");
  answer = { type: "text", text: "Show me the diff" };
  chat.suggest.on = false;
  await say("once more");
  await until(() => !chat.busy);
  await Bun.sleep(30);
  expect(suggests()).toHaveLength(n + 1);
  chat.suggest.on = true;
});

test("five in a row unused stop them; one used starts the count anew", async () => {
  chat.suggest.unused = 0;
  turn = "ok";
  answer = { type: "text", text: "\"Run the tests\"" };
  await say("go on");
  await until(() => chat.suggest.text === "Run the tests");
  for (let k = 0; k < 4; k++) {
    await say("something else " + k);
    await until(() => chat.suggest.text === "Run the tests");
  }
  expect(chat.suggest.unused).toBe(4);
  await say("Run the tests");
  await until(() => chat.suggest.text === "Run the tests");
  expect(chat.suggest.unused).toBe(0);
  for (let k = 0; k < 4; k++) {
    await say("no " + k);
    await until(() => chat.suggest.text === "Run the tests");
  }
  const n = suggests().length;
  await say("no 4");
  await until(() => !chat.busy);
  await Bun.sleep(30);
  expect(chat.suggest.unused).toBe(5);
  expect(suggests()).toHaveLength(n);
  expect(chat.suggest.text).toBe("");
});

test("an answer of nothing, or one that's no message of theirs, shows none", () => {
  for (const none of ["", "nothing", "(nothing)", "None.", "No suggestion", "Thanks!", "Looks good", "Let me run the tests", "I'll commit it", "\"Here's the diff\""]) {
    expect(Chat.line(none)).toBe("");
  }
  expect(Chat.line("\"Commit it\"")).toBe("Commit it");
  expect(Chat.line("great, now push it")).toBe("great, now push it");
  expect(Chat.line("Nothing else, push it")).toBe("Nothing else, push it");
});
