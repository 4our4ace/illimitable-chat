// Fail-safe test
// ==============
// `bun test failsafe.test.ts`. A chat's summaries run through the real
// Memory, AskAI and Agent loop against a fake Anthropic out of credit
// (HTTP 400, "credit balance is too low"), then back: none is clipped, and
// the tree completes once credit is back; the one summary the model
// refuses is clipped (its input's doing); a turn in the outage says BUSY.
// A model with no price known runs. A request leads single flight only
// as it is sent. A rate limit's retries say BUSY too, the vendor's words
// logged once; imports share it alike. Timers run 1000 times fast.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-failsafe-");

process.env.ILLI_DIR = DIR;

// a process reads Config once (maybe for another test)
const config = await import("../src/config/Config.ts");
config.KEYS.anthropic = "test";

const { Agent } = await import("../src/ai/Agent.ts");
const { AskAI } = await import("../src/ai/AskAI.ts");
const { Memory } = await import("../src/chat/Memory.ts");
const { MASTER } = await import("../src/tools/Tools.ts");

const SHARE = { vendor: "claude-api" as const, model: "claude-opus-5-5", effort: "medium", speed: "slow", system: MASTER, searches: 1, server: "" };

const BROKE = "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.";
const LIMIT = "This request would exceed your organization's rate limit of 80,000 output tokens per minute.";
const BUSY  = "the AI service is busy or unavailable right now";

// messages, each too long to be its own summary; the one whose summary
// the model refuses
const COUNT   = 16;
const REFUSED = 5;
const MSGS    = Array.from({ length: COUNT }, (_, k) => ({ kind: "illi" as const, text: k + " " + "word ".repeat(200) }));

const real = { setTimeout, fetch, error: console.error };
const logged: string[] = [];

// the vendor: out of credit, or rate limited (`limited` requests more),
// or answering
let broke = true;
let limited = 0;
let refused = 0;

// a streamed answer: its text, how it stopped
function answer(text: string, stop: string): Response {
  const events = [
    { type: "message_start", message: { usage: {} } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 100 } },
    { type: "message_stop" },
  ];
  return new Response(events.map((ev) => "data: " + JSON.stringify(ev) + "\n\n").join(""));
}

async function vendor(_url: string, init: any): Promise<Response> {
  const content = JSON.parse(init.body).messages[0].content;
  const task: string = content[content.length - 1].text;
  if (broke) {
    refused += 1;
    return Response.json({ type: "error", error: { type: "invalid_request_error", message: BROKE } }, { status: 400 });
  }
  if (limited > 0) {
    limited -= 1;
    return Response.json({ type: "error", error: { type: "rate_limit_error", message: LIMIT } }, { status: 429, headers: { "retry-after": "1" } });
  }
  const leaf = /compress message (\d+)/.exec(task)?.[1];
  return leaf === String(REFUSED) ? answer("", "refusal") : answer("line for " + task.split("\n")[0], "end_turn");
}

function sleep(ms: number): Promise<void> {
  return new Promise((ok) => real.setTimeout(ok, ms));
}

// every node of the tree: [part, its text or null]
function nodes(mem: any): Array<[{ l: number; i: number }, string | null]> {
  const out: Array<[{ l: number; i: number }, string | null]> = [];
  for (let l = 0; 2 ** l <= COUNT; l++) {
    for (let i = 0; i < COUNT / 2 ** l; i++) {
      out.push([{ l, i }, Memory.node(mem, { l, i })]);
    }
  }
  return out;
}

// once the vendor answers: the tree completes by itself, each node the
// model's line but the refused one, clipped
async function completes(mem: any): Promise<void> {
  for (let t = 0; t < 100 && nodes(mem).some(([, text]) => text === null); t++) {
    await sleep(50);
  }
  const source = Memory.flat(Memory.source(mem, 0, REFUSED)!);
  for (const [{ l, i }, text] of nodes(mem)) {
    expect(text).toEqual(l === 0 && i === REFUSED ? Memory.cut(source) : expect.stringMatching(/^line for Compaction:/));
  }
  expect(logged.filter((line) => line.includes("clipped"))).toEqual(["compactor: node 0/" + REFUSED + ": stopped: refusal; clipped"]);
  Memory.stop(mem);
}

// runs `go` with timers 1000 times fast, the fake vendor, the log kept
async function fast(go: () => Promise<void>): Promise<void> {
  globalThis.setTimeout = ((go: () => void, ms = 0) => real.setTimeout(go, ms / 1000)) as any;
  globalThis.fetch = vendor as any;
  console.error = (...args: unknown[]) => logged.push(args.join(" "));
  logged.length = 0;
  try {
    await go();
  } finally {
    Object.assign(globalThis, { setTimeout: real.setTimeout, fetch: real.fetch });
    console.error = real.error;
  }
}

test("an outage delays summaries, never clips them; a refusal clips", () => fast(async () => {
  const mem = Memory.load(DIR + "/chat", () => SHARE);
  Memory.push(mem, MSGS);
  await sleep(300);
  expect(refused).toBeGreaterThan(2 * COUNT);
  expect(nodes(mem).filter(([, text]) => text !== null)).toEqual([]);
  expect(logged.filter((line) => line.includes("clipped"))).toEqual([]);
  expect(logged.some((line) => line.includes(BROKE.slice(0, 40)))).toBe(true);

  const turn = await AskAI.ask({ ...SHARE, blocks: [{ text: "hi", mark: true }] }, () => {}).done;
  expect(turn).toMatchObject({ ok: false, stop: "down", text: BUSY });

  broke = false;
  await completes(mem);
}));

// a model the price list never named (one the vendor added since) runs
// as any other: nothing prices a request
test("a model with no price known runs", () => fast(async () => {
  const turn = await AskAI.ask({ ...SHARE, model: "claude-next-6", blocks: [{ text: "hi", mark: true }] }, () => {}).done;
  expect(turn).toMatchObject({ ok: true, text: "line for hi" });
}));

// two calls of one prefix (as every new chat's first summaries share),
// the first held before it is sent, yielding (an import's, its model
// busy: Agent.ts). It leads no single flight, so the second goes at once
test("a request leads single flight only as it is sent", () => fast(async () => {
  const room = Agent.room(SHARE.model);
  const asked: string[] = [];
  const vend = globalThis.fetch;
  globalThis.fetch = ((url: string, init: any) => (asked.push(JSON.parse(init.body).messages[0].content.at(-1).text), vend(url, init))) as any;
  const holds = { yields: { yields: DIR } };
  for (const [why, hold] of Object.entries(holds)) {
    const blocks = (who: string) => [{ text: "<chat>\n" + why + "\n", mark: true }, { text: "</chat>\n", mark: false }, { text: who + " " + why, mark: false }];
    room.busy = why === "yields" ? 1 : 0;
    const held = AskAI.ask({ ...SHARE, blocks: blocks("held"), ...hold }, () => {});
    await sleep(20);
    const free = AskAI.ask({ ...SHARE, blocks: blocks("free") }, () => {}).done;
    expect(await Promise.race([free, sleep(300).then(() => "still waiting")])).toMatchObject({ ok: true });
    room.busy = 0;
    room.wait.splice(0).forEach((ok) => ok());
    expect(await held.done).toMatchObject({ ok: true });
  }
  expect(asked).toEqual(["free yields", "held yields"]);
}));

test("a rate limit's retries say BUSY; the vendor's words go to the log", () => fast(async () => {
  limited = 2;
  const minds: string[] = [];
  const on = (ev: any) => ev.kind === "mind" && minds.push(ev.text);
  const turn = await AskAI.ask({ ...SHARE, blocks: [{ text: "hi", mark: true }] }, on).done;
  expect(turn.ok).toBe(true);
  expect(minds).toEqual(["The AI service is busy: asking again in 1 s.", "The AI service is busy: asking again in 1 s."]);
  expect(logged).toEqual([SHARE.model + ": HTTP 429: " + LIMIT + ": its requests ask again", SHARE.model + ": none asks again"]);
}));

// two imports at a rate-limited model, one running 4 requests, the other
// 1: each asks again by one request at a time, its others waiting on it,
// so past the first refusals both get the same tries at the limit
test("imports share a busy model alike", () => fast(async () => {
  limited = 9;
  const refusals: string[] = [];
  globalThis.fetch = ((url: string, init: any) => {
    const who = JSON.parse(init.body).messages[0].content.at(-1).text;
    refusals.push(...(limited > 0 ? [who[0]] : []));
    return vendor(url, init);
  }) as any;
  const ask = (who: string) => AskAI.ask({ ...SHARE, blocks: [{ text: who, mark: false }], yields: who[0] }, () => {}).done;
  const ends = await Promise.all(["a0", "a1", "a2", "a3", "b0"].map(ask));
  expect(ends.map((end) => end.ok)).toEqual([true, true, true, true, true]);
  expect(refusals.slice(5).sort()).toEqual(["a", "a", "b", "b"]);
  expect(logged.filter((line) => line.includes(LIMIT))).toHaveLength(1);
}));
