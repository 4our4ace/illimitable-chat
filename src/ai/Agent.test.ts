// Agent test
// ==========
// `bun test Agent.test.ts`. A refusal saying the request is too long for
// the model's window is told apart from any other; a call whose step
// read past its room ends `full` once that step's tools ran, saying so
// only if it was the first step (the request itself too long); what its
// first request read is told, none when that one was refused. A call
// once (a recap) runs no tool: one that calls one ends unanswered. A call
// going on from another's keeps its vendor's cache marks in all: the
// other's count. A request carries at most PICS images, the oldest left
// out by halves (so its prefix holds for steps), the newest results'
// kept first, a line in each place; the items themselves untouched.

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

// a call run on scripted steps (each reading `read` tokens, all but the
// last calling a tool), its room `room`, maybe once: how it ended, the
// tools it ran
async function scripted(reads: number[], room?: number, once?: boolean) {
  const step = Agent.step;
  const use = Agent.use;
  const ran: string[] = [];
  let k = 0;
  Agent.step = async () => {
    const read = reads[k++];
    const uses = k < reads.length ? [{ id: "t" + k, name: "shell", input: {} }] : [];
    const entries = uses.length > 0 ? [{ kind: "tool", text: "shell" }] : [{ kind: "illi", text: "the recap" }];
    return { out: [], uses, entries, stop: uses.length > 0 ? "tools" : "done", why: "", note: "", read } as any;
  };
  Agent.use = async (_run, _tools, u) => (ran.push(u.id), { text: "ok", fail: false });
  try {
    const ask = { vendor: "chatgpt", model: "m", effort: "low", speed: "slow", system: "", blocks: [{ text: "hi", mark: false }], searches: 0, server: "", room, once } as any;
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
  expect([first.end.stop, first.end.text, first.ran, first.end.first]).toEqual(["full", "the turn starts past 400 tokens", ["t1"], 500]);
  const grown = await scripted([100, 200, 500, 10], 400);
  expect([grown.end.stop, grown.end.text, grown.ran, grown.end.first]).toEqual(["full", "", ["t1", "t2", "t3"], 100]);
  const fits = await scripted([100, 200, 300], 400);
  expect([fits.end.ok, fits.end.stop, fits.ran]).toEqual([true, undefined, ["t1", "t2"]]);
});

test("a first request refused as too long (streamed, its usage nothing) tells no read: the chat learns nothing from it", async () => {
  const step = Agent.step;
  Agent.step = async () => ({ out: [], uses: [], entries: [], stop: "full", why: "context_length_exceeded", note: "", read: 0 }) as any;
  try {
    const ask = { vendor: "chatgpt", model: "m", effort: "low", speed: "slow", system: "", blocks: [{ text: "hi", mark: false }], searches: 0, server: "" } as any;
    const run = { ask, on: () => {}, sent: [], abort: new AbortController(), end: AskAI.end("") };
    await Agent.loop({ auth: { token: async () => "", spoil: () => {} }, marks: () => 0 } as any, run);
    expect([run.end.stop, run.end.first]).toEqual(["full", undefined]);
  } finally {
    Agent.step = step;
  }
});

test("a call once runs no tool: one calling a tool ends unanswered, one writing ends answered", async () => {
  const tool = await scripted([10, 10], undefined, true);
  expect([tool.end.ok, tool.end.text, tool.ran]).toEqual([false, "it called a tool", []]);
  const text = await scripted([10], undefined, true);
  expect([text.end.ok, text.end.text, text.ran]).toEqual([true, "the recap", []]);
});

test("a call going on from another's keeps its vendor's cache marks in all, the other's counted", async () => {
  const step = Agent.step;
  let items: any[] = [];
  Agent.step = async (_wire, _run, _key, make) => {
    items = [...(make(1) as any[])];
    return { out: [], uses: [], entries: [], stop: "done", why: "", note: "", read: 0 } as any;
  };
  try {
    const from = { ask: { blocks: [{ text: "end", mark: true }] }, items: [{ $: "User", parts: [{ text: "a", mark: true }, { text: "b", mark: true }], imgs: [] }], tools: [] };
    const ask = { vendor: "claude-api", model: "m", effort: "low", speed: "slow", system: "", blocks: [{ text: "more", mark: true }], searches: 0, server: "", from } as any;
    const run = { ask, on: () => {}, sent: [], abort: new AbortController(), end: AskAI.end("") };
    const wire = { auth: { token: async () => "", spoil: () => {} }, marks: () => 2, body: (_ask: any, its: any[]) => its };
    await Agent.loop(wire as any, run as any);
    expect(items.at(-1).parts).toEqual([{ text: "more", mark: false }]);
    await Agent.loop({ ...wire, marks: () => 3 } as any, { ...run, end: AskAI.end("") } as any);
    expect(items.at(-1).parts).toEqual([{ text: "more", mark: true }]);
  } finally {
    Agent.step = step;
  }
});

test("a request carries at most 20 images: the oldest left out by halves, the same for steps; the last results' kept first; a line in each place, the items untouched", () => {
  const img  = (n: number) => ({ type: "image/png", data: "p" + n });
  const back = (from: number, n: number) => ({ $: "Back" as const, backs: Array.from({ length: n }, (_, k) => ({ id: "c" + (from + k), out: { text: "read " + (from + k), fail: false, imgs: [img(from + k)] } })) });
  const user = { $: "User" as const, parts: [{ text: "look", mark: false }], imgs: [img(0), img(1), img(2)] };
  const kept = (items: any[]) => items.flatMap((i) => (i.$ === "User" ? i.imgs : i.$ === "Back" ? i.backs.flatMap((b: any) => b.out.imgs ?? []) : [])).map((x: any) => x.data);
  const few  = [user, back(3, 5)];
  expect(Agent.thin(few)).toBe(few);
  const items = [user, back(3, 10), { $: "Turn" as const, out: [] }, back(13, 8)];
  const thin  = Agent.thin(items);
  expect(kept(thin)).toEqual(["p10", "p11", "p12", ...Array.from({ length: 8 }, (_, k) => "p" + (13 + k))]);
  expect((thin[0] as any).parts.at(-1).text).toBe("[image left out of this request (at most 20 go in one): ask for it again to see it]");
  expect((thin[1] as any).backs[0].out.text).toBe("read 3\n[image left out of this request (at most 20 go in one): ask for it again to see it]");
  expect((thin[1] as any).backs[7].out.text).toBe("read 10");
  expect(kept(items).length).toBe(21);
  const next = Agent.thin([...items, back(21, 1)]);
  expect(JSON.stringify(next.slice(0, 4))).toBe(JSON.stringify(thin));
  const many = Agent.thin([user, back(3, 25)]);
  expect(kept(many)).toEqual(Array.from({ length: 20 }, (_, k) => "p" + (8 + k)));
});
