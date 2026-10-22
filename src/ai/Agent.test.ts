// Agent test
// ==========
// `bun test Agent.test.ts`. A refusal saying the request is too long for
// the model's window is told apart from any other; a call whose step
// read past its room ends `full` once that step's tools ran, saying so
// only if it was the first step (the request itself too long).

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

process.env.ILLI_DIR = fs.mkdtempSync(os.tmpdir() + "/illi-agent-");

const { Agent } = await import("./Agent.ts");
const { AskAI } = await import("./AskAI.ts");

test("a refusal's body says the request is too long for the window, each vendor's way", () => {
  expect(Agent.full('{"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 210345 tokens > 200000 maximum"}}')).toBe(true);
  expect(Agent.full('{"error":{"message":"input length and `max_tokens` exceed context limit: 190000 + 32000 > 200000, decrease input length or `max_tokens` and try again"}}')).toBe(true);
  expect(Agent.full('{"error":{"message":"Your input exceeds the context window of this model. Please adjust your input and try again.","code":"context_length_exceeded"}}')).toBe(true);
  expect(Agent.full('{"error":{"message":"invalid x-api-key","type":"authentication_error"}}')).toBe(false);
  expect(Agent.full('{"error":{"message":"Rate limit reached","code":"rate_limit_exceeded"}}')).toBe(false);
});

// a call run on scripted steps (each reading `read` tokens, the first n
// calling a tool), its room `room`: how it ended, the tools it ran
async function scripted(reads: number[], room: number) {
  const step = Agent.step;
  const use = Agent.use;
  const ran: string[] = [];
  let k = 0;
  Agent.step = async () => {
    const read = reads[k++];
    const uses = k < reads.length ? [{ id: "t" + k, name: "shell", input: {} }] : [];
    return { out: [], uses, entries: [], stop: uses.length > 0 ? "tools" : "done", why: "", note: "", read } as any;
  };
  Agent.use = async (_run, _tools, u) => (ran.push(u.id), { text: "ok", fail: false });
  try {
    const ask = { vendor: "chatgpt", model: "m", effort: "low", speed: "slow", system: "", blocks: [{ text: "hi", mark: false }], searches: 0, server: "", room } as any;
    const run = { ask, on: () => {}, sent: [], abort: new AbortController(), end: AskAI.end("") };
    await Agent.loop({ auth: { token: async () => "", spoil: () => {} }, marks: () => 0 } as any, run);
    return { end: run.end, ran };
  } finally {
    Agent.step = step;
    Agent.use = use;
  }
}

test("a step read past the call's room ends it full once its tools ran; saying why only at the first step", async () => {
  const first = await scripted([500, 10], 400);
  expect([first.end.stop, first.end.text, first.ran]).toEqual(["full", "the turn starts past 400 tokens", ["t1"]]);
  const grown = await scripted([100, 200, 500, 10], 400);
  expect([grown.end.stop, grown.end.text, grown.ran]).toEqual(["full", "", ["t1", "t2", "t3"]]);
  const fits = await scripted([100, 200, 300], 400);
  expect([fits.end.ok, fits.end.stop, fits.ran]).toEqual([true, undefined, ["t1", "t2"]]);
});
