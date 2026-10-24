// Anthropic test
// ==============
// `bun test Anthropic.test.ts`. A server tool's result is logged as
// failed (View.FAILED) when an error stands in its place or its command
// exited non-zero; else as it reads, so a shut run marks it done.

import { expect, test } from "bun:test";
import { Anthropic } from "./Anthropic.ts";
import { FAILED } from "../ui/View.ts";

test("a server tool's result is failed when an error stands in its place or its command exits non-zero", () => {
  const result = (content: unknown) => Anthropic.entry({ type: "web_search_tool_result", tool_use_id: "s1", content });
  expect(result({ type: "web_search_tool_result_error", error_code: "max_uses_exceeded" })?.text.startsWith(FAILED)).toBe(true);
  expect(result({ type: "bash_code_execution_result", stdout: "", stderr: "no such file", return_code: 2 })?.text).toBe(FAILED + "no such file");
  expect(result({ type: "bash_code_execution_result", stdout: "ok", stderr: "", return_code: 0 })?.text).toBe("ok");
  expect(result([{ title: "bend", url: "https://example.com/bend" }])).toEqual({ kind: "echo", text: "bend https://example.com/bend", of: "s1" });
});
