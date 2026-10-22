// Chat test
// =========
// `bun test Chat.test.ts`. The chat in this process, the model stood in
// for: a view over the pipe sends a message and hears the reply; a /model
// while the turn's call runs picks the next call's (the wait names the
// model the running one asked); one process at a time holds a project's
// chat. A goal check and a message sent mid-run fit the chat's model. A
// main agent switch is a note of its own. A message sent as a stopped turn
// winds down is answered, and what was logged between waiting messages
// reaches the turn. A call too long for the model's window makes the
// chat refit and the turn go on from a note, unasked; three in a row end
// it, saying why. A failed turn asks to try again only when a later try
// may answer, and says a reply was cut off; summaries stuck are told once;
// a save that fails is told, never thrown (a goal met still ends as
// met). The suggested reply stays as the chat closes, for the next
// start; a turn drops it.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-chat-");
process.env.ILLI_DIR = DIR;

const { AskAI } = await import("../ai/AskAI.ts");
const { Chat } = await import("./Chat.ts");
const { Memory } = await import("./Memory.ts");
const { Projects } = await import("./Projects.ts");

// the project the tests run in (this repo), whose chat Chat.open opens
const HERE = Projects.place(process.cwd());
const { Pick } = await import("../ai/Pick.ts");
const config = await import("../config/Config.ts");
const View = await import("../ui/View.ts");

// the model: answers `reply` to a call that sees the user's message, after
// `hold` resolves
let hold: Promise<void> = Promise.resolve();
AskAI.ask = (_, on) => {
  const [call, feed] = AskAI.tie(on, () => {}, () => {});
  hold.then(() => {
    feed.on({ $: "Entry", kind: "illi", text: "hello back" });
    feed.end({ ok: true, text: "hello back", left: [] });
  });
  return call;
};

async function until(ok: () => boolean): Promise<void> {
  for (let k = 0; !ok(); k++) {
    if (k > 200) {
      throw new Error("never");
    }
    await Bun.sleep(5);
  }
}

const chat = Chat.open(process.cwd());

test("a view over the pipe sends a message and hears the reply", async () => {
  const v = View.view_new();
  const hear = (msg: any) => View.view_hear(v, msg).forEach((out) => View.link_send(v, out));
  View.link_open(v, Chat.link(chat, hear));
  await until(() => v.up);
  expect([...v.whole.values()][0].kind).toBe("illi");
  View.view_act(v, { $: "Send", text: "hi" }).forEach((out) => View.link_send(v, out));
  await until(() => [...v.whole.values()].some((e) => e.kind === "illi" && e.text === "hello back"));
  const kinds = Array.from({ length: chat.mem.count }, (_, i) => Memory.message(chat.mem, i)!.kind);
  expect(kinds).toEqual(["illi", "user", "illi"]);
  expect(Memory.message(chat.mem, 1)!.text).toBe("hi");
  await until(() => !chat.busy);
  v.ws!.close();
});

test("a turn's wait names the model it runs on, not one picked since", async () => {
  let go = () => {};
  hold = new Promise((ok) => (go = ok));
  Chat.take(chat, Chat.push(chat, null, "user", "again"));
  await until(() => chat.call !== null);
  const model = chat.pick.model;
  expect(Chat.waits(chat)).toBe(model);
  const other = Pick.options(chat.pick, "model", config.OFFER).map(([, p]) => p).find((p) => p.model !== model)!;
  expect(await Chat.act(chat, { $: "pick", to: other })).toEqual({});
  expect(chat.pick.model).toBe(other.model);
  expect(Chat.waits(chat)).toBe(model);
  go();
  await until(() => !chat.busy);
});

test("one process at a time holds a project's chat, even many starting at once; its lock only its user's to reach, let go however a process ends; those held elsewhere counted", async () => {
  expect(await Chat.lock()).toBe(true);
  expect(fs.statSync(DIR + "/locks").mode & 0o777).toBe(0o700);
  const env = { ...process.env, ILLI_DIR: DIR };
  const code = (after = "", at = 0) => `const { Chat } = await import(${JSON.stringify(import.meta.dir + "/Chat.ts")}); while (Date.now() < ${at}) {} console.log(await Chat.lock()); ${after}`;
  const proc = Bun.spawn([process.execPath, "-e", code()], { env, stdout: "pipe" });
  expect(await new Response(proc.stdout).text()).toBe("false\n");
  const repo = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + "/illi-chat-repo-"));
  const name = Projects.lock(repo);
  fs.mkdirSync(repo + "/.git");
  const at = Date.now() + 1500;
  const many = Array.from({ length: 6 }, () => Bun.spawn([process.execPath, "-e", code("await Bun.sleep(2500); process.exit(0);", at)], { cwd: repo, env, stdout: "pipe" }));
  const said = await Promise.all(many.map((p) => new Response(p.stdout).text()));
  expect(said.sort()).toEqual(["false\n", "false\n", "false\n", "false\n", "false\n", "true\n"]);
  const gone = Bun.spawn([process.execPath, "-e", code("process.exit(0);")], { cwd: repo, env, stdout: "pipe" });
  expect(await new Response(gone.stdout).text()).toBe("true\n");
  expect(Chat.others(DIR)).toBe(0);
  const open = Bun.spawn([process.execPath, "-e", code("await Bun.sleep(60000);")], { cwd: repo, env, stdout: "pipe" });
  const reader = open.stdout.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("true\n");
  expect([Chat.others(DIR), await Chat.claim(name)]).toEqual([1, null]);
  open.kill("SIGKILL");
  await open.exited;
  expect(Chat.others(DIR)).toBe(0);
  const after = await Chat.claim(name);
  expect(after).not.toBeNull();
  after!.stop();
  fs.rmSync(repo, { recursive: true, force: true });
}, 20000);

test("/compact folds all but the last two exchanges for the agent, the screen still showing them; again, nothing to fold", async () => {
  await until(() => !chat.busy);
  const mem = chat.mem;
  const say = (kind: "user" | "illi" | "tool" | "echo", text: string) => Memory.push(mem, [{ kind, text }]);
  for (let k = 0; k < 4; k++) {
    say("user", "question " + k);
    say("tool", "shell {\"command\":\"ls\"}");
    say("echo", "a.txt b.txt");
    say("illi", "answer " + k);
  }
  const second = mem.count - 8;
  const shown = mem.show;
  expect(View.view_act(View.view_new(), { $: "Send", text: "/compact" })).toEqual([{ $: "compact" }]);
  expect(Chat.compact(chat)).toEqual({});
  expect(mem.cut).toBe(second);
  expect(Memory.message(mem, second)!.text).toBe("question 2");
  expect(mem.show).toBe(shown);
  expect(chat.eye.from).toBe(shown);
  expect(Memory.message(mem, mem.count - 1)!.kind).toBe("note");
  expect(Chat.compact(chat).error).toContain("Nothing to summarize");
  expect(Memory.load(mem.dir, () => ({}) as any, HERE).show).toBe(shown);
});

test("/clear: the agent gets the chat so far as lines, and the screen starts anew from its note, also after a restart; the old topic's suggested reply goes", async () => {
  const mem = chat.mem;
  const before = mem.count;
  chat.suggest.text = mem.suggest = "Commit it";
  const told: any[] = [];
  const sock = { data: { seen: new Set<string>() }, send: (text: string) => told.push(JSON.parse(text)), close: () => {} };
  chat.socks.add(sock);
  expect(Chat.clear(chat)).toEqual({});
  chat.socks.delete(sock);
  expect(told.filter((m) => m.$ === "state").at(-1)?.use.fill.used).toBe(Math.round(Memory.fill(mem) / 4));
  expect(mem.cut).toBe(before);
  expect(mem.top).toBe(before);
  expect(chat.eye.parts).toEqual([]);
  expect(chat.eye.from).toBe(before);
  expect(Memory.message(mem, before)!.kind).toBe("note");
  expect(Memory.load(mem.dir, () => ({}) as any, HERE).top).toBe(before);
  expect([chat.suggest.text, Memory.load(mem.dir, () => ({}) as any, HERE).suggest]).toEqual(["", ""]);
});

test("a goal check and a message sent mid-run hold no more than the chat's model takes", () => {
  const mem = chat.mem;
  const cap = Chat.cap;
  Chat.cap = () => 2000;
  try {
    for (let k = 0; k < 40; k++) {
      Memory.push(mem, [{ kind: "user", text: "long " + k + " " + "z".repeat(600) }]);
    }
    let asked: any = null;
    const ask = AskAI.ask;
    AskAI.ask = (a, on) => ((asked = a), ask(a, on));
    Chat.check(chat, "the goal");
    AskAI.ask = ask;
    const whole = asked.blocks.at(-1).text;
    expect(whole).toContain("the goal");
    expect(whole.length).toBeLessThan(2000 * 4);
    const sent: any[] = [];
    Object.assign(chat, { busy: true, call: { send: (say: any) => sent.push(say), stop: () => {}, done: new Promise(() => {}) } });
    Chat.take(chat, Chat.push(chat, null, "user", "big " + "w".repeat(9000)));
    expect(sent).toEqual([]);
    expect(chat.wait).toHaveLength(1);
  } finally {
    Chat.cap = cap;
    Object.assign(chat, { busy: false, call: null, wait: [] });
  }
});

test("a main agent switch is noted as an entry of its own, never glued to the message after it", () => {
  const mem = chat.mem;
  Object.assign(chat, { switched: true, was: { agent: null, pick: "x" } });
  const msg = Chat.push(chat, null, "user", "hello");
  expect(Memory.say(mem, msg.id, msg.end).text).toBe("hello");
  expect(Memory.message(mem, msg.id - 1)!.text).toStartWith("Main agent: ");
  expect(Memory.recent(mem, msg.id - 1, msg.id).map((b) => b.text).join("")).toContain("|note: Main agent: ");
});

test("a message sent as a stopped turn winds down gets a turn of its own", async () => {
  await until(() => !chat.busy);
  const asked: string[] = [];
  const ask = AskAI.ask;
  AskAI.ask = (a, on) => (asked.push(a.blocks.at(-1)!.text), ask(a, on));
  let go = () => {};
  hold = new Promise((ok) => (go = ok));
  try {
    Chat.take(chat, Chat.push(chat, null, "user", "first"));
    await until(() => chat.call !== null);
    Chat.interrupt(chat, "Stopped by the user: illi.");
    Chat.take(chat, Chat.push(chat, null, "user", "after the stop"));
    go();
    await until(() => asked.length === 2 && !chat.busy);
  } finally {
    AskAI.ask = ask;
    hold = Promise.resolve();
  }
  expect(asked[1]).toContain("after the stop");
  expect(asked[1]).not.toContain("first");
});

test("a turn's new text holds what was logged between its waiting messages, tagged", async () => {
  await until(() => !chat.busy);
  let asked = "";
  const ask = AskAI.ask;
  AskAI.ask = (a, on) => ((asked = a.blocks.at(-1)!.text), ask(a, on));
  try {
    const one = Chat.push(chat, null, "user", "one");
    Chat.push(chat, null, "note", "Stopped by the user: illi.");
    const two = Chat.push(chat, null, "user", "two");
    Object.assign(chat, { busy: true, wait: [one, two] });
    await Chat.call(chat);
  } finally {
    AskAI.ask = ask;
    Object.assign(chat, { busy: false, wait: [], sent: [] });
  }
  expect(asked).toEndWith("one\n\nnote: Stopped by the user: illi.\n\ntwo");
});

// the model's turn calls ending as `ends` says, in turn (then answered;
// a summary's call answered as ever): the last block of each turn call
// asked, and its room
async function refitted(ends: Array<{ text: string }>) {
  await until(() => !chat.busy);
  const asked: Array<{ text: string; room?: number }> = [];
  const ask = AskAI.ask;
  AskAI.ask = (a, on) => {
    if (a.blocks.at(-1)!.text.endsWith("</input>")) {
      return ask(a, on);
    }
    const end = ends[asked.length];
    asked.push({ text: a.blocks.at(-1)!.text, room: a.room });
    if (end === undefined) {
      return ask(a, on);
    }
    const [call, feed] = AskAI.tie(on, () => {}, () => {});
    queueMicrotask(() => feed.end({ ok: false, text: end.text, left: [], stop: "full" }));
    return call;
  };
  try {
    Chat.take(chat, Chat.push(chat, null, "user", "a long one"));
    await until(() => !chat.busy && chat.wait.length === 0);
  } finally {
    AskAI.ask = ask;
  }
  return asked;
}

test("a call too long for the model's window: a turn's share shrinks, and the turn goes on from a note, unasked", async () => {
  const fit = chat.fit;
  const asked = await refitted([{ text: "HTTP 400: prompt is too long: 210000 tokens > 200000 maximum" }]);
  expect(asked).toHaveLength(2);
  expect(asked[1].text).toContain("The chat outgrew " + chat.model + "'s window");
  expect(chat.fit).toBeCloseTo(fit * 0.8);
  const notes = Array.from({ length: chat.mem.count }, (_, i) => Memory.message(chat.mem, i)!).filter((m) => m.kind === "note");
  expect(notes.some((m) => m.text.startsWith("No reply"))).toBe(false);
  const window = Pick.window(chat.pick);
  expect(asked[0].room).toBe(window === undefined ? undefined : Math.round(window * 0.9));
});

test("a turn grown past its room goes on without shrinking; three refits in a row end the turn, saying why", async () => {
  const fit = chat.fit;
  expect(await refitted([{ text: "" }])).toHaveLength(2);
  expect(chat.fit).toBe(fit);
  const asked = await refitted([{ text: "" }, { text: "" }, { text: "" }, { text: "" }]);
  expect(asked).toHaveLength(4);
  const last = Memory.message(chat.mem, chat.mem.count - 1)!;
  expect([last.kind, last.text]).toEqual(["note", "No reply: the chat won't fit " + chat.model + "'s window even summarized. /clear starts a fresh screen, or /model picks a model with a bigger window."]);
  expect(chat.refits).toBe(0);
});

// the chat's last message's text
function last(): string {
  return Memory.message(chat.mem, chat.mem.count - 1)!.text;
}

test("a failed turn asks to try again only when a later try may answer; a reply begun is cut off", () => {
  Chat.failed(chat, "the AI service is busy or unavailable right now", { ok: false, text: "", left: [], stop: "down", again: true });
  expect(last()).toBe("No reply: the AI service is busy or unavailable right now. Send a message to try again.");
  Chat.failed(chat, "no API key: set ANTHROPIC_API_KEY and restart illi", { ok: false, text: "", left: [], stop: "down" });
  expect(last()).toBe("No reply: no API key: set ANTHROPIC_API_KEY and restart illi.");
  Chat.failed(chat, "the AI service is busy or unavailable right now", { ok: false, text: "", left: [], stop: "down", again: true, cut: true });
  expect(last()).toStartWith("Reply cut off: the AI service is busy");
  Chat.failed(chat, "boom");
  expect(last()).toBe("No reply: boom. Send a message to try again.");
});

test("summaries stuck are told once, again only after one is built", () => {
  const count = () => Array.from({ length: chat.mem.count }, (_, i) => Memory.message(chat.mem, i)!.text).filter((t) => t.startsWith("Summaries are stuck")).length;
  const was = count();
  chat.mem.stuck!("your ChatGPT plan's 5-hour limit is used up; it resets at 14:05");
  chat.mem.stuck!("your ChatGPT plan's 5-hour limit is used up; it resets at 14:05");
  expect(count()).toBe(was + 1);
  expect(last()).toBe("Summaries are stuck: your ChatGPT plan's 5-hour limit is used up; it resets at 14:05; retrying every minute.");
  chat.mem.stuck!("");
  chat.mem.stuck!("down");
  expect(count()).toBe(was + 2);
});

test("a save that fails is told to the views, never thrown (what ran, the suggested reply), in plain words (SQLite's too)", () => {
  const got: any[] = [];
  const sock: any = { data: { seen: new Set() }, send: (text: string) => got.push(JSON.parse(text)), close: () => {} };
  const save = Memory.save;
  chat.socks.add(sock);
  Memory.save = () => {
    throw Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
  };
  try {
    chat.mem.work = ["changed"];
    expect(() => Chat.change(chat)).not.toThrow();
    chat.mem.suggest = chat.suggest.text = "Commit it";
    expect(() => Chat.unsuggest(chat)).not.toThrow();
    expect(got.filter((m) => m.$ === "note").length).toBe(2);
  } finally {
    Memory.save = save;
    chat.socks.delete(sock);
  }
  expect(got.find((m) => m.$ === "note").text).toBe("Can't save the chat: disk full (" + chat.mem.dir + ").");
  expect(["SQLITE_FULL", "SQLITE_READONLY", "SQLITE_IOERR_WRITE", "SQLITE_BUSY", "SQLITE_MISMATCH"].map((code) => Chat.unsaved(Object.assign(new Error("as SQLite says it"), { code })))).toEqual(["disk full", "read-only disk", "the disk failed to write", "another illi kept the file busy too long", "as SQLite says it"]);
});

test("a goal met whose save fails still ends the turn as met, the failure told", async () => {
  const got: any[] = [];
  const sock: any = { data: { seen: new Set() }, send: (text: string) => got.push(JSON.parse(text)), close: () => {} };
  const [save, wait] = [Memory.save, chat.wait];
  const [call, feed] = AskAI.tie(() => {}, () => {}, () => {});
  chat.socks.add(sock);
  Object.assign(chat, { wait: [] });
  chat.mem.goal = "ship it";
  Memory.save = () => {
    throw Object.assign(new Error("SQLITE_FULL: database or disk is full"), { code: "SQLITE_FULL" });
  };
  try {
    feed.end({ ok: true, text: "yes", left: [] });
    expect(await Chat.checked(chat, { call, goal: "ship it" }, new AbortController())).toBe(true);
  } finally {
    Memory.save = save;
    chat.wait = wait;
    chat.socks.delete(sock);
  }
  expect([chat.mem.goal, got.map((m) => m.$ + ": " + m.text)] as unknown[]).toEqual([null, ["note: Can't save the chat: disk full (" + chat.mem.dir + ").", "entry: Goal met."]]);
});

test("the suggested reply stays as the chat closes, so the next start shows it (a screen that asks for none, none); a turn's start drops it", async () => {
  const last = AskAI.last;
  AskAI.last = () => ({ ask: { ...Pick.ask(chat.pick), blocks: [] } }) as any;
  Object.assign(chat.suggest, { on: true, unused: 0 });
  try {
    Chat.suggest(chat);
    await until(() => chat.suggest.text !== "");
  } finally {
    AskAI.last = last;
  }
  const saved = () => Memory.load(chat.mem.dir, () => ({}) as any, HERE).suggest;
  const shown = () => (Chat.state(chat) as any).suggest;
  expect([chat.suggest.text, saved(), shown()]).toEqual(["hello back", "hello back", "hello back"]);
  chat.suggest.on = false;
  expect(shown()).toBe("");
  Chat.unsuggest(chat);
  expect(saved()).toBe("");
  chat.suggest.text = chat.mem.suggest = "Commit it";
  Memory.save(chat.mem);
  Chat.close(chat, true);
  expect(saved()).toBe("Commit it");
});
