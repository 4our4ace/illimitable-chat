// Request test
// ============
// `bun test request.test.ts`. What a turn's request holds, as the vendor
// gets it: the real Chat, Memory, AskAI and Agent loop against a fake
// Anthropic that answers every call and keeps each request's body (no
// network but illi's own tools server, a fake key). A chat that fits goes whole; /compact sends all
// but the last exchanges as the view's lines, each message in one place
// only; /clear sends nothing of the chat before it, not even a line, also
// once the chat is opened again; no request marks more than the four
// cache breakpoints Anthropic takes.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-request-");
process.env.ILLI_DIR = DIR;

// a process reads Config once (maybe for another test): the fake key goes
// in it, not in the environment
const config = await import("../src/config/Config.ts");
config.KEYS.anthropic = "test";

const { Chat } = await import("../src/chat/Chat.ts");
const { Memory } = await import("../src/chat/Memory.ts");

// the old topic: short messages (each its own line, so no summary is
// asked), one fact among them
const OLD = Array.from({ length: 24 }, (_, k) => ({ kind: (k % 2 === 0 ? "user" : "illi") as "user" | "illi", text: "old " + k + (k === 6 ? ": the codename is PELICAN" : "") }));

// each request's body, as sent
const bodies: any[] = [];
const real = globalThis.fetch;
globalThis.fetch = (async (url: string, init: any) => {
  if (String(url).startsWith("http://127.0.0.1:")) {
    return real(url, init);
  }
  if (!String(url).startsWith("https://api.anthropic.com/")) {
    throw new Error("no network in this test: " + url);
  }
  const body = JSON.parse(init.body);
  bodies.push(body);
  const task = body.messages[0].content.at(-1).text as string;
  return answer(task.startsWith("Compaction:") ? "line for " + task.split("\n")[0] : "OK");
}) as any;

afterAll(() => {
  globalThis.fetch = real;
  fs.rmSync(DIR, { recursive: true, force: true });
});

// a streamed answer of `text`
function answer(text: string): Response {
  const events = [
    { type: "message_start", message: { usage: {} } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
    { type: "message_stop" },
  ];
  return new Response(events.map((ev) => "data: " + JSON.stringify(ev) + "\n\n").join(""));
}

async function until(ok: () => boolean): Promise<void> {
  for (let k = 0; !ok(); k++) {
    if (k > 1000) {
      throw new Error("never");
    }
    await Bun.sleep(5);
  }
}

// a turn on `text`: its first request's chat, as the model reads it: the
// view's lines (by id, and the message after each), the messages whole
// (by id), all its text, its cache breakpoints
async function turn(chat: any, text: string): Promise<{ lines: number[]; ends: number[]; whole: number[]; text: string; marks: number }> {
  const from = bodies.length;
  Chat.take(chat, Chat.push(chat, null, "user", text));
  await until(() => !chat.busy);
  const body = bodies.slice(from).find((b) => b.messages[0].content.at(-1).text.endsWith(text))!;
  const all = body.messages[0].content.map((c: any) => c.text).join("");
  const view = /<chat>\n([\s\S]*?)<\/chat>/.exec(all)![1];
  const recent = /<recent>\n([\s\S]*?)<\/recent>/.exec(all)?.[1] ?? "";
  const ids = (s: string, re: RegExp) => [...s.matchAll(re)].map((m) => Number(m[1]));
  const ends = [...view.matchAll(/^(\d+)\+(\d+)\|/gm)].map((m) => Number(m[1]) + Number(m[2]));
  return { lines: ids(view, /^(\d+)\+\d+\|/gm), ends, whole: ids(recent, /^(\d+)\|/gm), text: all, marks: JSON.stringify(body).split('"cache_control"').length - 1 };
}

test("a chat that fits goes whole; /compact sends all but the last exchanges as lines; /clear sends nothing before it, opened again too", async () => {
  let chat = Chat.open(process.cwd());
  const mem = chat.mem;
  Memory.push(mem, OLD);
  await until(() => Memory.first(mem) >= mem.count);

  const fits = await turn(chat, "first question");
  expect(fits.lines).toEqual([]);
  expect(fits.whole).toEqual(Array.from({ length: OLD.length + 1 }, (_, k) => k));
  expect(fits.text).toContain("PELICAN");

  expect(Chat.compact(chat)).toEqual({});
  const cut = mem.cut;
  const compact = await turn(chat, "second question");
  expect(Memory.message(mem, cut)!.text).toBe("old 22");
  expect(compact.lines.length).toBeGreaterThan(0);
  expect(compact.whole[0]).toBe(cut);
  expect(Math.max(...compact.ends)).toBeLessThanOrEqual(cut);

  const before = mem.count;
  expect(Chat.clear(chat)).toEqual({});
  const clear = await turn(chat, "a new topic");
  expect([clear.lines, clear.whole]).toEqual([[], []]);
  for (const gone of ["PELICAN", "old 1", "first question", "second question"]) {
    expect(clear.text).not.toContain(gone);
  }

  Chat.close(chat);
  chat = Chat.open(process.cwd());
  const again = await turn(chat, "after a restart");
  expect(again.lines.every((id) => id >= before)).toBe(true);
  expect(again.whole.every((id) => id >= before)).toBe(true);
  expect(again.text).not.toContain("PELICAN");
  expect(again.text).toContain("a new topic");

  for (const t of [fits, compact, clear, again]) {
    expect(t.marks).toBeLessThanOrEqual(4);
  }
  expect(bodies.every((b) => JSON.stringify(b).split('"cache_control"').length - 1 <= 4)).toBe(true);
  Chat.close(chat);
});
