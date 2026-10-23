// Crash test
// ==========
// `bun test crash.test.ts`. An agent whose run throws still reports, as a
// failed reply. One cut by the vendor busy or out of reach reports
// unanswered (no main turn to fail alike); one refused, answered. A
// crash says one line on why and where its trace is logged, exit code 1.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import { temp_dir } from "./repo.ts";

process.env.ILLI_DIR = temp_dir("illi-crash-");

const { Tools } = await import("../src/tools/Tools.ts");

test("an agent whose run throws still reports", async () => {
  let told = "";
  const tools: any = {
    perm: { calls: new Map() },
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

test("an agent cut by the vendor out of reach reports unanswered; one refused, answered", async () => {
  const told: boolean[] = [];
  const tools: any = { perm: { calls: new Map() }, hooks: { change: () => {}, on: () => {}, report: (_agent: unknown, _text: string, stopped: boolean) => told.push(stopped) } };
  const away: any = { done: Promise.resolve({ ok: false, text: "can't reach api.anthropic.com: check your connection", left: [], stop: "down", again: true }) };
  await Tools.run(tools, { name: "Probe", call: null, replies: [], stop: false } as any, away);
  const refused: any = { done: Promise.resolve({ ok: false, text: "HTTP 400: bad", left: [], stop: "down" }) };
  await Tools.run(tools, { name: "Probe", call: null, replies: [], stop: false } as any, refused);
  expect(told).toEqual([true, false]);
});

test("a crash says one line on why and where its trace is, logged; exit code 1", async () => {
  const dir = temp_dir("illi-crashed-");
  const term = new URL("../src/term/Term.ts", import.meta.url).pathname;
  const code = "const { term_crash } = await import(" + JSON.stringify(term) + "); term_crash(new Error(\"boom\"));";
  const proc = Bun.spawn(["bun", "-e", code], { env: { ...process.env, ILLI_DIR: dir }, stdout: "pipe", stderr: "pipe" });
  const [err, exit] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  expect(exit).toBe(1);
  expect(err).toBe("illi: crashed: boom (details in " + dir + "/illi.log)\n");
  expect(fs.readFileSync(dir + "/illi.log", "utf8")).toContain("illi: crashed: Error: boom\n    at ");
  fs.rmSync(dir, { recursive: true, force: true });
});
