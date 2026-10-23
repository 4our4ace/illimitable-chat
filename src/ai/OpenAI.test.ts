// OpenAI test
// ===========
// `bun test OpenAI.test.ts`. A failed response, or an error event, its
// input caused fails (asked again, it fails alike), one too long for the
// model's window is full (the chat refits); any other, a rate limit as a
// server error, is busy, so it is asked again. A request keeps the
// latest cache marks its vendor writes: OpenAI four (three with the end
// cached implicitly), Anthropic's room beside its system prompt and
// end, the ChatGPT backend none. A tool result's image goes in its
// function_call_output's list.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

process.env.ILLI_DIR = fs.mkdtempSync(os.tmpdir() + "/illi-openai-");

const { OpenAI } = await import("./OpenAI.ts");

const ASK: any = { speed: "slow" };

// the step of a stream that ended in a failed response with this code
function failed(code: string): string {
  const st = { res: { status: "failed", error: { code, message: code }, output: [] }, error: null, use: {} as any };
  return OpenAI.step(st, ASK).stop;
}

test("a failure its input caused fails; a rate limit or server error is busy", () => {
  expect(failed("rate_limit_exceeded")).toBe("busy");
  expect(failed("server_error")).toBe("busy");
  expect(failed("vector_store_timeout")).toBe("busy");
  expect(failed("invalid_prompt")).toBe("fail");
  expect(failed("invalid_image_format")).toBe("fail");
  expect(failed("context_length_exceeded")).toBe("full");
});

test("an error event is read alike", () => {
  const event = (code: string) => OpenAI.step({ res: null, error: { type: "error", code, message: code }, use: {} as any }, ASK).stop;
  expect(event("rate_limit_exceeded")).toBe("busy");
  expect(event("context_length_exceeded")).toBe("full");
});

test("a request keeps the latest cache marks its vendor writes", async () => {
  const { AskAI } = await import("./AskAI.ts");
  const { Anthropic } = await import("./Anthropic.ts");
  const { ChatGPT } = await import("./ChatGPT.ts");
  const blocks = ["a", "b", "c", "d", "e"].map((text) => ({ text, mark: true }));
  const ask = (end: boolean) => ({ blocks: [...blocks, { text: "z", mark: end }] }) as any;
  const kept = (wire: any, end: boolean) => AskAI.marks(ask(end).blocks, wire.marks(ask(end))).filter((b: any) => b.mark).map((b: any) => b.text).join("");
  expect([kept(OpenAI.wire, false), kept(OpenAI.wire, true)]).toEqual(["bcde", "dez"]);
  expect([kept(Anthropic.wire, false), kept(Anthropic.wire, true)]).toEqual(["cde", "ez"]);
  expect([kept(ChatGPT.wire, false), kept(ChatGPT.wire, true)]).toEqual(["", ""]);
});

test("a tool's result with an image goes as its function_call_output's list: its text, then the image as a data URL", () => {
  const item = { $: "Back" as const, backs: [{ id: "c1", out: { text: "Image a.png", fail: false, imgs: [{ type: "image/webp", data: "UklG" }] } }] };
  expect(OpenAI.input(item)).toEqual([{ type: "function_call_output", call_id: "c1", output: [{ type: "input_text", text: "Image a.png" }, { type: "input_image", image_url: "data:image/webp;base64,UklG" }] }]);
});
