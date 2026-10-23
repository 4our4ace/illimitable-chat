// Image test
// ==========
// `bun test image.test.ts`. A model reading an image sees it: the real
// Chat, Memory, AskAI, Agent loop and illi's own tools server against a
// fake Anthropic (no network but the tools server, a fake key), which
// asks to read a PNG and keeps each request's body. The request after
// the read carries the image inside the read's tool_result, next to its
// text; the next turn carries the text alone (the image is not kept).

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import { png } from "./png.ts";

const DIR  = fs.mkdtempSync(os.tmpdir() + "/illi-image-");
const WORK = fs.mkdtempSync(os.tmpdir() + "/illi-image-work-");
process.env.ILLI_DIR       = DIR;
process.env.ILLI_VENDORS   = "claude-api";
process.env.ILLI_PICK      = "claude-api:sonnet-5.5:medium:slow";
process.env.ILLI_COMPACTOR = "claude-api:haiku-5.5:high:slow";
fs.writeFileSync(WORK + "/shot.png", png(40, 30));

// a process reads Config once (maybe for another test): the fake key goes
// in it, not in the environment
const config = await import("../src/config/Config.ts");
config.KEYS.anthropic = "test";

const { Chat } = await import("../src/chat/Chat.ts");

// each request's body, as sent; a turn asking to look reads the PNG first
const bodies: any[] = [];
const real = globalThis.fetch;
globalThis.fetch = (async (url: string, init: any) => {
  if (String(url).startsWith("http://127.0.0.1:")) {
    return real(url, init);
  }
  if (!String(url).startsWith("https://api.anthropic.com/")) {
    throw new Error("no network in this test: " + url);
  }
  const body = JSON.parse(init.body);
  bodies.push(body);
  const look = body.messages.at(-1).content.at(-1).text?.endsWith("look at shot.png") === true;
  return answer(look ? { type: "tool_use", id: "t1", name: "read", input: {} } : { type: "text", text: "" }, look ? JSON.stringify({ path: WORK + "/shot.png" }) : "a grey box");
}) as any;

afterAll(() => {
  globalThis.fetch = real;
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.rmSync(WORK, { recursive: true, force: true });
});

// a streamed answer: one block, a tool call (its input's JSON) or text
function answer(block: any, x: string): Response {
  const tool = block.type === "tool_use";
  const events = [
    { type: "message_start", message: { usage: {} } },
    { type: "content_block_start", index: 0, content_block: block },
    { type: "content_block_delta", index: 0, delta: tool ? { type: "input_json_delta", partial_json: x } : { type: "text_delta", text: x } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 1 } },
    { type: "message_stop" },
  ];
  return new Response(events.map((ev) => "data: " + JSON.stringify(ev) + "\n\n").join(""));
}

async function until(ok: () => boolean): Promise<void> {
  for (let k = 0; !ok(); k++) {
    if (k > 2000) {
      throw new Error("never");
    }
    await Bun.sleep(5);
  }
}

test("an image read goes to the model inside its tool_result, next to its text; the next turn carries the text alone", async () => {
  const chat = Chat.open(WORK);
  Chat.take(chat, Chat.push(chat, null, "user", "look at shot.png"));
  await until(() => !chat.busy);
  const after = bodies.find((b) => JSON.stringify(b.messages.at(-1).content).includes("tool_result"))!;
  const result = after.messages.at(-1).content.find((c: any) => c.type === "tool_result");
  expect(result.content.map((c: any) => c.type)).toEqual(["text", "image"]);
  expect(result.content[0].text).toMatch(/^Image shot\.png \(png, 40×30, \d+ B\), attached to this result only/);
  expect(result.content[1].source.media_type).toBe("image/webp");
  expect(result.is_error).toBe(false);
  const from = bodies.length;
  Chat.take(chat, Chat.push(chat, null, "user", "and now?"));
  await until(() => !chat.busy);
  const next = JSON.stringify(bodies.slice(from));
  expect(next).toContain("Image shot.png (png, 40×30");
  expect(next).not.toContain(result.content[1].source.data);
  expect(next).not.toContain('"type":"image"');
});
