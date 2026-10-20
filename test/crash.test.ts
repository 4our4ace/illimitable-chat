// Crash test
// ==========
// `bun test crash.test.ts`. An agent whose run throws still reports, as a
// failed reply.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

process.env.ILLI_DIR = fs.mkdtempSync(os.tmpdir() + "/illi-crash-");

const { Tools } = await import("../src/tools/Tools.ts");

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
