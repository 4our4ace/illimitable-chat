// OpenAI test
// ===========
// `bun test OpenAI.test.ts`. A failed response, or an error event, its
// input caused fails (asked again, it fails alike), one too long for the
// model's window is full (the chat refits); any other, a rate limit as a
// server error, is busy, so it is asked again. A request keeps the
// latest cache marks its vendor writes: OpenAI four (three with the end
// cached implicitly), Anthropic's room beside its system prompt and
// end, the ChatGPT backend none. A tool result's image goes in its
// function_call_output's list. A web search is logged with its result,
// failed as its status says; one unfinished, alone.

import { expect, test } from "bun:test";
import { temp_dir } from "../../test/repo.ts";

process.env.ILLI_DIR = temp_dir("illi-openai-");

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

test("a reply's cited pages it doesn't link already end it, in one line; no result is logged for them, as no call found them; utm_source taken off", () => {
  const cite = (url: string, title: string) => ({ type: "url_citation", url, title });
  const reply = (text: string, ...annotations: object[]) => OpenAI.entries({ type: "message", content: [{ type: "output_text", text, annotations }] });
  const linked = "https://a.example/x?utm_source=openai";
  expect(reply("It is so ([a.example](" + linked + ")).", cite(linked, "A"), cite("https://b.example/y?q=1&utm_source=openai", "B again"))).toEqual([
    { kind: "illi", text: "It is so ([a.example](https://a.example/x)).\n\nSources: [B again](https://b.example/y?q=1)" },
  ]);
  expect(reply("Plain.", cite("https://c.example/?utm_source=openai&p=2", "C [1]"))).toEqual([{ kind: "illi", text: "Plain.\n\nSources: [C \\[1\\]](https://c.example/?p=2)" }]);
  expect(reply("No pages.")).toEqual([{ kind: "illi", text: "No pages." }]);
  expect(reply("utm_source=openaix stays")).toEqual([{ kind: "illi", text: "utm_source=openaix stays" }]);
});

test("a web search is logged with its result: searched, or failed as its status says; one left unfinished, alone, as a call stopped before it answered", () => {
  const search = (status: string) => OpenAI.entries({ type: "web_search_call", id: "ws_1", status, action: { type: "search", query: "bend" } });
  expect(search("completed")).toEqual([
    { kind: "tool", text: 'web_search {"type":"search","query":"bend"}', of: "ws_1" },
    { kind: "echo", text: "searched", of: "ws_1" },
  ]);
  expect(search("failed")[1]).toEqual({ kind: "echo", text: "error: the search failed", of: "ws_1" });
  expect([search("searching"), search("in_progress")]).toEqual([0, 1].map(() => [{ kind: "tool", text: 'web_search {"type":"search","query":"bend"}' }]));
});
