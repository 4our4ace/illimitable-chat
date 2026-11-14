// Agent test
// ==========
// `bun test Agent.test.ts`. A refusal saying the request is too long for
// the model's window is told apart from any other; a call whose step
// read past its room ends `full` once that step's tools ran, saying so
// unless a step's tool results went in before (the request itself too
// long), else grown, as one refused as too long after them is (a step
// asked again, or a message sent mid-run, grows nothing); what its
// first request read is told, none when that one was refused. A call
// once (a recap) runs no tool: one that calls one ends unanswered; it
// takes one step, a message sent meanwhile left for the next. A call
// going on from another's keeps its vendor's cache marks in all: the
// other's count. A request carries at most PICS images, the oldest left
// out by halves (so its prefix holds for steps), the newest results'
// kept first, a line in each place; the items themselves untouched. A
// stream closed before its last event ends its step where its wire says
// it ended (an API that may leave its usage out), else it ended early.
// A patient call (a summary's) asks again as its `anew` says then, at
// once as AskAI.wake wakes it (a chat moved to another vendor); stopped,
// it asks no more. A runner's call (a vendor's own program, Agent.watched)
// that goes quiet is stopped and ends down, to try again, saying so,
// unless a request of its is open at illi's tools (a command running, a
// question waiting); stopped, it settles lost soon after even if its
// program never ends, giving back what it never took, its later events
// dropped; what it streamed since its last entry is logged cut off when
// it fails, once.

import { expect, test } from "bun:test";
import { temp_dir } from "../../test/repo.ts";

process.env.ILLI_DIR = temp_dir("illi-agent-");

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
// last calling a tool), its room `room`, maybe once, `sent` waiting as
// it starts: how it ended, the tools it ran, the steps it took, the
// messages left
async function scripted(reads: number[], room?: number, once?: boolean, sent: any[] = []) {
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
    const run = { ask, on: () => {}, sent: [...sent], abort: new AbortController(), end: AskAI.end("") };
    await Agent.loop({ auth: { token: async () => "", spoil: () => {} }, marks: () => 0 } as any, run);
    return { end: run.end, ran, steps: k, left: run.sent };
  } finally {
    Agent.step = step;
    Agent.use = use;
  }
}

test("a step read past the call's room ends it full once its tools ran; saying why only at the first step, grown past it", async () => {
  const first = await scripted([500, 10], 400);
  expect([first.end.stop, first.end.text, first.ran, first.end.first, first.end.grew]).toEqual(["full", "the turn starts past 400 tokens", ["t1"], 500, false]);
  const grown = await scripted([100, 200, 500, 10], 400);
  expect([grown.end.stop, grown.end.text, grown.ran, grown.end.first, grown.end.grew]).toEqual(["full", "", ["t1", "t2", "t3"], 100, true]);
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
    expect([run.end.stop, run.end.first, run.end.grew]).toEqual(["full", undefined, false]);
  } finally {
    Agent.step = step;
  }
});

test("a request refused as too long past the first step, its tools' results grown past the window, ends the call grown", async () => {
  const step = Agent.step;
  const use = Agent.use;
  let k = 0;
  Agent.step = async () => (k++ === 0 ? { out: [], uses: [{ id: "t1", name: "shell", input: {} }], entries: [{ kind: "tool", text: "shell" }], stop: "tools", why: "", note: "", read: 100 } : { out: [], uses: [], entries: [], stop: "full", why: "prompt is too long", note: "", read: 0 }) as any;
  Agent.use = async () => ({ text: "a long log", fail: false });
  try {
    const ask = { vendor: "chatgpt", model: "m", effort: "low", speed: "slow", system: "", blocks: [{ text: "hi", mark: false }], searches: 0, server: "", room: 400 } as any;
    const run = { ask, on: () => {}, sent: [], abort: new AbortController(), end: AskAI.end("") };
    await Agent.loop({ auth: { token: async () => "", spoil: () => {} }, marks: () => 0 } as any, run);
    expect([run.end.stop, run.end.text, run.end.first, run.end.grew]).toEqual(["full", "prompt is too long", 100, true]);
  } finally {
    Agent.step = step;
    Agent.use = use;
  }
});

test("a call full past its first step with no tool results gone in (a step asked again, a message sent mid-run) isn't grown: its chat itself didn't fit", async () => {
  const step = Agent.step;
  const use = Agent.use;
  const wire = { auth: { token: async () => "", spoil: () => {} }, marks: () => 0 } as any;
  const ask = { vendor: "chatgpt", model: "m", effort: "low", speed: "slow", system: "", blocks: [{ text: "hi", mark: false }], searches: 0, server: "", room: 400 } as any;
  const steps = (...all: any[]) => {
    let k = 0;
    Agent.step = async () => ({ out: [], uses: [], entries: [], why: "", note: "", ...all[k++] }) as any;
  };
  Agent.use = async () => ({ text: "ok", fail: false });
  try {
    steps({ stop: "again", read: 500 }, { stop: "full", why: "prompt is too long", read: 0 });
    const paused = { ask, on: () => {}, sent: [], abort: new AbortController(), end: AskAI.end("") };
    await Agent.loop(wire, paused);
    expect([paused.end.stop, paused.end.grew]).toEqual(["full", false]);
    steps({ stop: "done", entries: [{ kind: "illi", text: "on it" }], read: 500 }, { stop: "tools", uses: [{ id: "t1", name: "shell", input: {} }], entries: [{ kind: "tool", text: "shell" }], read: 600 });
    const told = { ask, on: () => {}, sent: [{ text: "and this", imgs: [] }], abort: new AbortController(), end: AskAI.end("") };
    await Agent.loop(wire, told);
    expect([told.end.stop, told.end.text, told.end.grew]).toEqual(["full", "the turn starts past 400 tokens", false]);
  } finally {
    Agent.step = step;
    Agent.use = use;
  }
});

test("a stream that closes before its last event ends its step if its wire says it did (ended), as read, never busy to ask again; else it ended early", async () => {
  const sse = (lines: string[]) => new Response(lines.map((l) => "data: " + l + "\n\n").join("")).body!;
  const wire = { begun: () => true, read: (st: any, ev: any) => ((st.done ||= ev.finish === true), false), step: () => ({ out: [], uses: [], entries: [{ kind: "illi", text: "done" }], stop: "done", why: "", note: "" }), ended: (st: any) => st.done } as any;
  const ask = { vendor: "chatgpt", model: "m", effort: "low", speed: "slow", system: "", blocks: [], searches: 0, server: "" } as any;
  const run = { ask, on: () => {}, sent: [], abort: new AbortController(), end: AskAI.end("") } as any;
  const timer = setTimeout(() => {}, 60000);
  try {
    const read = { done: false };
    const ended = await Agent.stream(wire, run, sse(['{"a":1}', '{"finish":true}']), timer, [], { done: false }, () => {}, read);
    expect([ended.stop, ended.entries, read.done]).toEqual(["done", [{ kind: "illi", text: "done" }], true]);
    const early = await Agent.stream(wire, run, sse(['{"a":1}']), timer, [], { done: false }, () => {}, { done: false });
    expect([early.stop, early.why]).toEqual(["busy", "the stream ended early"]);
  } finally {
    clearTimeout(timer);
  }
});

test("a call once runs no tool: one calling a tool ends unanswered, one writing ends answered; one step only, a message sent meanwhile left for the next call", async () => {
  const tool = await scripted([10, 10], undefined, true);
  expect([tool.end.ok, tool.end.text, tool.ran]).toEqual([false, "it called a tool", []]);
  const text = await scripted([10], undefined, true);
  expect([text.end.ok, text.end.text, text.ran]).toEqual([true, "the recap", []]);
  const told = { text: "also count the files", imgs: [] };
  const sent = await scripted([10], undefined, true, [told]);
  expect([sent.end.ok, sent.end.text, sent.steps, sent.left]).toEqual([true, "the recap", 1, [told]]);
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

test("a patient call asks again as its anew says then (a summary's: the compactor of the chat's pick now), at once as AskAI.wake wakes it (one during a try: as that try fails); stopped, no more", async () => {
  const start = AskAI.start;
  const asked: string[] = [];
  AskAI.start = ((ask: any) => {
    asked.push(ask.vendor);
    const end = ask.vendor === "claude-code" ? { ok: true, text: "the summary", left: [] } : { ...AskAI.end("403 Forbidden"), stop: "down" };
    return { send: () => {}, stop: () => {}, done: ask.vendor === "slow" ? Bun.sleep(30).then(() => end) : Promise.resolve(end) };
  }) as any;
  try {
    let vendor = "github-copilot";
    const stuck: string[] = [];
    const ask = () => ({ vendor, model: "m", effort: "low", speed: "slow", system: "", blocks: [], searches: 0, server: "", patient: true, stuck: (why: string) => stuck.push(why), anew: ask }) as any;
    const call = AskAI.ask(ask(), () => {});
    await Bun.sleep(20);
    expect([asked, stuck]).toEqual([["github-copilot"], ["403 Forbidden"]]);
    vendor = "claude-code";
    AskAI.wake();
    expect(await call.done).toEqual({ ok: true, text: "the summary", left: [] });
    expect(asked).toEqual(["github-copilot", "claude-code"]);
    vendor = "slow";
    const mid = AskAI.ask(ask(), () => {});
    await Bun.sleep(5);
    vendor = "claude-code";
    AskAI.wake();
    expect(await mid.done).toEqual({ ok: true, text: "the summary", left: [] });
    expect(asked).toEqual(["github-copilot", "claude-code", "slow", "claude-code"]);
    vendor = "github-copilot";
    const held = AskAI.ask(ask(), () => {});
    await Bun.sleep(20);
    held.stop();
    AskAI.wake();
    expect((await held.done).ok).toBe(false);
    expect(asked).toEqual(["github-copilot", "claude-code", "slow", "claude-code", "github-copilot"]);
  } finally {
    AskAI.start = start;
  }
});

// a runner scripted by hand: what it got sent, its events, how it ends
function runner() {
  let on: (ev: any) => void = () => {};
  let finish: (end: any) => void = () => {};
  const r = {
    stops: 0,
    sent: [] as any[],
    emit: (ev: any) => on(ev),
    end: (end: any) => finish(end),
    run: (_ask: any, tell: (ev: any) => void) => {
      on = tell;
      return { send: (say: any) => r.sent.push(say), stop: () => r.stops++, done: new Promise<any>((done) => (finish = done)) };
    },
  };
  return r;
}

const SERVER = "http://127.0.0.1:1/k/main";
const runner_ask = { vendor: "claude-code", model: "m", effort: "low", speed: "slow", system: "", blocks: [], searches: 0, server: SERVER + "?t=1" } as any;

test("a runner's call quiet past its limit is stopped and ends down, to try again, its streamed text logged cut off; never while a request of its is open at illi's tools", async () => {
  const quiet = 120;
  const r = runner();
  const seen: any[] = [];
  const call = Agent.watched(r.run, runner_ask, (ev) => seen.push(ev), quiet, 50);
  r.emit({ $: "Delta", kind: "illi", text: "half a re" });
  r.emit({ $: "Delta", kind: "illi", text: "ply" });
  const end = await call.done;
  expect(r.stops).toBe(1);
  expect(end).toMatchObject({ ok: false, stop: "down", again: true, cut: true });
  expect(end.text).toContain("no word from your Claude plan");
  expect(seen.filter((ev) => ev.$ === "Entry")).toEqual([{ $: "Entry", kind: "illi", text: "half a reply\n[cut off]" }]);

  // a command running at illi's tools: the silence isn't the call's
  const busy = runner();
  const call2 = Agent.watched(busy.run, runner_ask, () => {}, quiet, 50);
  AskAI.opened(SERVER, 1);
  await Bun.sleep(quiet * 4);
  expect(busy.stops).toBe(0);
  AskAI.opened(SERVER, -1);
  busy.end({ ok: true, text: "done", left: [] });
  expect(await call2.done).toEqual({ ok: true, text: "done", left: [] });
});

test("a runner's call stopped settles lost soon after though its program never ends: what it never took given back, its later events dropped", async () => {
  const r = runner();
  const seen: any[] = [];
  const call = Agent.watched(r.run, runner_ask, (ev) => seen.push(ev), 60_000, 50);
  const one = { text: "first", imgs: [] };
  const two = { text: "second", imgs: [] };
  call.send(one);
  call.send(two);
  expect(r.sent).toEqual([one, two]);
  r.emit({ $: "Entry", kind: "user", text: "first" });
  call.stop();
  call.stop();
  const end = await call.done;
  expect(r.stops).toBe(1);
  expect(end).toMatchObject({ ok: false, stop: "lost", text: "stopped", left: [two] });
  r.emit({ $: "Delta", kind: "illi", text: "late" });
  r.end({ ok: false, text: "stopped", left: [], stop: "lost" });
  expect(seen).toEqual([{ $: "Entry", kind: "user", text: "first" }]);
});

test("a runner's call that fails logs what streamed since its last entry, cut off, once: none where its runner logged its own", async () => {
  const r = runner();
  const seen: any[] = [];
  const call = Agent.watched(r.run, runner_ask, (ev) => seen.push(ev), 60_000, 50);
  r.emit({ $: "Delta", kind: "illi", text: "said" });
  r.emit({ $: "Entry", kind: "illi", text: "said" });
  r.emit({ $: "Delta", kind: "mind", text: "thinking on" });
  r.end({ ok: false, text: "it ended", left: [], stop: "down" });
  const end = await call.done;
  expect(end.cut).toBe(true);
  expect(seen.filter((ev) => ev.$ === "Entry")).toEqual([{ $: "Entry", kind: "illi", text: "said" }, { $: "Entry", kind: "mind", text: "thinking on\n[cut off]" }]);

  const own = runner();
  const seen2: any[] = [];
  const call2 = Agent.watched(own.run, runner_ask, (ev) => seen2.push(ev), 60_000, 50);
  own.emit({ $: "Delta", kind: "illi", text: "half" });
  own.emit({ $: "Entry", kind: "illi", text: "half\n[cut off]" });
  own.end({ ok: false, text: "it ended", left: [], stop: "down", cut: true });
  expect(await call2.done).toMatchObject({ cut: true });
  expect(seen2.filter((ev) => ev.$ === "Entry")).toHaveLength(1);

  // a reply logged, a tool run, then half a second message: that half
  // kept too, though the runner says a reply had begun
  const more = runner();
  const seen4: any[] = [];
  const call4 = Agent.watched(more.run, runner_ask, (ev) => seen4.push(ev), 60_000, 50);
  more.emit({ $: "Entry", kind: "illi", text: "first part" });
  more.emit({ $: "Entry", kind: "tool", text: "shell" });
  more.emit({ $: "Delta", kind: "illi", text: "second ha" });
  more.end({ ok: false, text: "it ended", left: [], stop: "down", cut: true });
  expect(await call4.done).toMatchObject({ cut: true });
  expect(seen4.filter((ev) => ev.$ === "Entry").map((ev) => ev.text)).toEqual(["first part", "shell", "second ha\n[cut off]"]);

  // a reply logged, then a tool run (or a message taken), then a failure
  // with nothing more said: no reply cut, as illi's loop says, though the
  // runner says one had begun
  for (const between of ["tool", "user"]) {
    const after = runner();
    const call5 = Agent.watched(after.run, runner_ask, () => {}, 60_000, 50);
    after.emit({ $: "Entry", kind: "illi", text: "I'll look" });
    after.emit({ $: "Entry", kind: between, text: "shell" });
    after.end({ ok: false, text: "busy", left: [], stop: "down", cut: true });
    expect((await call5.done).cut).toBeUndefined();
  }

  // answered: nothing more logged
  const fine = runner();
  const seen3: any[] = [];
  const call3 = Agent.watched(fine.run, runner_ask, (ev) => seen3.push(ev), 60_000, 50);
  fine.emit({ $: "Delta", kind: "illi", text: "all" });
  fine.end({ ok: true, text: "all", left: [] });
  await call3.done;
  expect(seen3.filter((ev) => ev.$ === "Entry")).toHaveLength(0);
});

test("a runner's failed end logs nothing it streamed where the runner settled it (End.owned: the vendor's error said as text) or the call goes again refitted (full)", async () => {
  for (const end of [{ ok: false, text: "The model is overloaded.", left: [], stop: "down", again: true, owned: true }, { ok: false, text: "too long", left: [], stop: "full" }]) {
    const r = runner();
    const seen: any[] = [];
    const call = Agent.watched(r.run, runner_ask, (ev) => seen.push(ev), 60_000, 50);
    r.emit({ $: "Delta", kind: "illi", text: "The model is overloaded." });
    r.end(end);
    expect((await call.done).cut).toBeUndefined();
    expect(seen.filter((ev) => ev.$ === "Entry")).toEqual([]);
  }
});

test("a runner's call quiet only by events is kept while its runner reads messages (beat); a reply or the vendor's own end that lands after a quiet stop stands; a machine asleep counts no quiet; a program failing outright ends the call with why", async () => {
  const quiet = 120;
  let beat = () => {};
  const r = runner();
  const run = (ask: any, tell: any, b: () => void) => ((beat = b), r.run(ask, tell));
  const call = Agent.watched(run, runner_ask, () => {}, quiet, 50);
  for (let n = 0; n < 8; n++) {
    await Bun.sleep(quiet / 3);
    beat();
  }
  expect(r.stops).toBe(0);
  r.end({ ok: true, text: "kept", left: [] });
  expect(await call.done).toEqual({ ok: true, text: "kept", left: [] });

  // the stop sent, the answer came all the same
  const late = runner();
  const call2 = Agent.watched(late.run, runner_ask, () => {}, quiet, 5_000);
  for (let n = 0; n < 50 && late.stops === 0; n++) {
    await Bun.sleep(quiet / 4);
  }
  expect(late.stops).toBe(1);
  late.end({ ok: true, text: "fine", left: [] });
  expect(await call2.done).toEqual({ ok: true, text: "fine", left: [] });

  // the stop sent, the vendor's own end came first: it stands (full
  // goes again refitted, never as a quiet call's down)
  const full = runner();
  const call5 = Agent.watched(full.run, runner_ask, () => {}, quiet, 5_000);
  for (let n = 0; n < 50 && full.stops === 0; n++) {
    await Bun.sleep(quiet / 4);
  }
  full.end({ ok: false, text: "too long", left: [], stop: "full" });
  expect(await call5.done).toMatchObject({ ok: false, text: "too long", stop: "full" });

  // the clock jumps far past `quiet` between two ticks (asleep, or a
  // clock set anew): none of it counts
  const now = Date.now;
  let ahead = 0;
  Date.now = () => now() + ahead;
  try {
    const slept = runner();
    const call3 = Agent.watched(slept.run, runner_ask, () => {}, quiet, 50);
    ahead = quiet * 100;
    await Bun.sleep(quiet * 0.75);
    expect(slept.stops).toBe(0);
    slept.end({ ok: true, text: "awake", left: [] });
    expect((await call3.done).ok).toBe(true);
  } finally {
    Date.now = now;
  }

  // its done rejects: the call ends, saying why, what was sent given back
  const broke = runner();
  const run4 = (ask: any, tell: any) => ({ ...broke.run(ask, tell), done: Promise.reject(new Error("no such file")) });
  const call4 = Agent.watched(run4, runner_ask, () => {}, quiet, 50);
  call4.send({ text: "more", imgs: [] });
  expect(await call4.done).toEqual({ ok: false, text: "no such file", left: [{ text: "more", imgs: [] }] });
});
