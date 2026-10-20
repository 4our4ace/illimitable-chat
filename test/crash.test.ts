// Crash and usage test
// ====================
// `bun test crash.test.ts`. An agent whose run throws still reports, as a
// failed reply; a request cut short counts the output it streamed, each
// byte a token, and its text as input when the API told none.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

process.env.ILLI_DIR = fs.mkdtempSync(os.tmpdir() + "/illi-crash-");

const { Agent } = await import("../src/ai/Agent.ts");
const { Tools } = await import("../src/tools/Tools.ts");
const { Price } = await import("../src/ai/Price.ts");

test("an agent whose run throws still reports", async () => {
  let told = "";
  const tools: any = {
    hooks: {
      change: () => {
        throw new Error("boom");
      },
      on: () => {},
      report: (_agent: unknown, text: string) => (told = text),
    },
  };
  const agent: any = { name: "Probe", call: null, replies: [], stop: false };
  const call: any = { done: Promise.resolve({ ok: true, text: "never", left: [] }) };
  await Tools.run(tools, agent, call);
  expect(agent.call).toBeNull();
  expect(told).toContain("failed: boom");
});

test("a request cut short counts what it streamed", () => {
  const api = { ...Price.usage("slow"), input: 10, write: 20, read: 30, output: 1 };
  expect(Agent.used(api, { bytes: 500, done: true }, "{}")).toEqual(api);
  expect(Agent.used(api, { bytes: 500, done: false }, "{}")).toEqual({ ...api, output: 500 });
  expect(Agent.used({ ...api, output: 900 }, { bytes: 500, done: false }, "{}").output).toBe(900);
  const none = Price.usage("slow");
  const json = JSON.stringify({ input: "héllo" });
  expect(Agent.used(none, { bytes: 7, done: false }, json)).toEqual({ ...none, write: Buffer.byteLength(json), output: 7 });
});
