// Chat test
// =========
// `bun test Chat.test.ts`. The chat in this process, the model stood in
// for: a view over the pipe sends a message and hears the reply; a /model
// while the turn's call runs picks the next call's (the wait names the
// model the running one asked); one process at a time holds the chat.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-chat-");
process.env.ILLI_DIR = DIR;

const { AskAI } = await import("../ai/AskAI.ts");
const { Chat } = await import("./Chat.ts");
const { Memory } = await import("./Memory.ts");
const { Pick } = await import("../ai/Pick.ts");
const config = await import("../config/Config.ts");
const View = await import("../ui/View.ts");

// the model: answers `reply` to a call that sees the user's message, after
// `hold` resolves
let hold: Promise<void> = Promise.resolve();
AskAI.ask = (ask, on) => {
  const [call, feed] = AskAI.tie(on, ask.bill, () => {}, () => {});
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
  View.link_open(v, Chat.link(chat, hear, async () => true));
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
  expect(await Chat.act(chat, "pick", { $: "pick", to: other })).toEqual({});
  expect(chat.pick.model).toBe(other.model);
  expect(Chat.waits(chat)).toBe(model);
  go();
  await until(() => !chat.busy);
});

test("one process at a time holds the chat", async () => {
  await Chat.lock();
  const code = `const { Chat } = await import(${JSON.stringify(import.meta.dir + "/Chat.ts")}); await Chat.lock().then(() => console.log("held"), (e) => console.log(e.message));`;
  const proc = Bun.spawn([process.execPath, "-e", code], { env: { ...process.env, ILLI_DIR: DIR }, stdout: "pipe" });
  const out = await new Response(proc.stdout).text();
  expect(out).toContain("already open");
});

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
  expect(Chat.compact(chat).error).toContain("Nothing to compact");
  expect(Memory.load(mem.dir, () => ({}) as any).show).toBe(shown);
});
