// Fail-safe test
// ==============
// `bun test failsafe.test.ts`. A chat's summaries run through the real
// Memory, AskAI and Agent loop against a fake Anthropic out of credit
// (HTTP 400, "credit balance is too low"), then back: none is clipped, and
// the tree completes once credit is back; the one summary the model
// refuses is clipped (its input's doing); a turn in the outage says, in
// plain words, that the credit is used up (the key is the user's own). A
// model with no price known runs. A rate limit's retries say BUSY, the
// vendor's words logged once, and so does its end past the tries. A login
// that won't renew ends the call at once, saying why. No connection says
// which host can't be reached; a retry-after past the longest wait ends
// the call at once; a refused key names its variable; a reply cut short
// is marked once. Timers run 1000 times fast.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-failsafe-");

process.env.ILLI_DIR = DIR;

// a process reads Config once (maybe for another test)
const config = await import("../src/config/Config.ts");
config.KEYS.anthropic = "test";

const { Agent } = await import("../src/ai/Agent.ts");
const { Anthropic } = await import("../src/ai/Anthropic.ts");
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
  expect(logged.filter((line) => line.includes("clipped"))).toEqual(["compactor: node 0/" + REFUSED + ": the model declined to answer; clipped"]);
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
  expect(turn).toMatchObject({ ok: false, stop: "down", text: "your Anthropic API credit is used up: add credit at console.anthropic.com, then send a message" });

  broke = false;
  await completes(mem);
}));

// a model the price list never named (one the vendor added since) runs
// as any other: nothing prices a request
test("a model with no price known runs", () => fast(async () => {
  const turn = await AskAI.ask({ ...SHARE, model: "claude-next-6", blocks: [{ text: "hi", mark: true }] }, () => {}).done;
  expect(turn).toMatchObject({ ok: true, text: "line for hi" });
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

test("a vendor busy past the tries ends the call saying BUSY", () => fast(async () => {
  limited = 99;
  const turn = await AskAI.ask({ ...SHARE, blocks: [{ text: "hi", mark: true }] }, () => {}).done;
  limited = 0;
  expect(turn).toMatchObject({ ok: false, stop: "down", text: BUSY });
}));

test("a login that won't renew ends the call saying why, never asked again", () => fast(async () => {
  const why = "ChatGPT login renewal failed (HTTP 401): sign in again with /login";
  let asked = 0;
  const token = async () => {
    asked += 1;
    throw new Error(why);
  };
  const wire = { ...Anthropic.wire, auth: { token, spoil: () => {} } };
  const run: any = { ask: { ...SHARE, blocks: [{ text: "hi", mark: true }] }, on: () => {}, sent: [], abort: new AbortController(), end: AskAI.end("") };
  await Agent.loop(wire, run);
  expect(run.end).toMatchObject({ ok: false, stop: "down", text: why });
  expect(asked).toBe(1);
}));

// a call's end on the fake vendor, its thoughts kept
async function turn(minds: string[] = [], entries: string[] = []): Promise<any> {
  const on = (ev: any) => (ev.kind === "mind" ? minds.push(ev.text) : ev.$ === "Entry" && entries.push(ev.text));
  return AskAI.ask({ ...SHARE, blocks: [{ text: "hi", mark: true }] }, on).done;
}

test("no connection says which host can't be reached, as it asks again and at its end", () => fast(async () => {
  globalThis.fetch = (async () => {
    throw new Error("Unable to connect. Is the computer able to access the url?");
  }) as any;
  const minds: string[] = [];
  const end = await turn(minds);
  expect(end).toMatchObject({ ok: false, stop: "down", again: true, text: "can't reach api.anthropic.com: check your connection" });
  expect(minds[0]).toBe("Can't reach api.anthropic.com: check your connection. Asking again in 2 s.");
  expect(minds.at(-1)).toBe("Can't reach api.anthropic.com: check your connection. Asking again in 60 s.");
}));

test("a retry-after past the longest wait ends the call at once, saying till when", () => fast(async () => {
  let asked = 0;
  globalThis.fetch = (async () => {
    asked += 1;
    return Response.json({ error: { type: "rate_limit_error", message: LIMIT } }, { status: 429, headers: { "retry-after": "3600" } });
  }) as any;
  const end = await turn();
  expect(asked).toBe(1);
  expect(end).toMatchObject({ ok: false, stop: "down", again: true });
  expect(end.text).toMatch(/^the AI service is busy: it asks to wait till (\w+ )?\d\d:\d\d$/);
}));

test("a refused key names its variable; an HTML page is never shown, its body logged", () => fast(async () => {
  globalThis.fetch = (async () => Response.json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, { status: 401 })) as any;
  expect((await turn()).text).toBe("Anthropic refused the API key (HTTP 401: invalid x-api-key): check ANTHROPIC_API_KEY and restart illi");
  const page = "<!DOCTYPE html><html><body>" + "Bad gateway ".repeat(100) + "</body></html>";
  globalThis.fetch = (async () => new Response(page, { status: 400 })) as any;
  logged.length = 0;
  expect(await turn()).toMatchObject({ ok: false, stop: "down", text: "HTTP 400" });
  expect(logged.some((line) => line.includes(page))).toBe(true);
}));

test("no API key ends the call saying which to set, and to restart", () => fast(async () => {
  config.KEYS.anthropic = "";
  const end = await Agent.ask({ ...SHARE, blocks: [{ text: "hi", mark: true }] }, () => {}).done;
  config.KEYS.anthropic = "test";
  expect(end).toMatchObject({ ok: false, stop: "down", text: "no API key: set ANTHROPIC_API_KEY and restart illi" });
  expect(end.again).toBeUndefined();
}));

test("a reply cut short is marked once; the call says it was cut", () => fast(async () => {
  globalThis.fetch = (async () => {
    const events = [
      { type: "message_start", message: { usage: {} } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "half a reply" } },
    ];
    return new Response(events.map((ev) => "data: " + JSON.stringify(ev) + "\n\n").join(""));
  }) as any;
  const entries: string[] = [];
  const end = await turn([], entries);
  expect(end).toMatchObject({ ok: false, stop: "down", again: true, cut: true, text: BUSY });
  expect(entries.at(-1)).toBe("half a reply\n[cut off]");
}));

test("a stop reason is said in plain words", () => fast(async () => {
  globalThis.fetch = (async () => answer("long", "max_tokens")) as any;
  expect(await turn()).toMatchObject({ ok: false, stop: "fail", text: "the reply reached the most the model may write at once" });
}));
