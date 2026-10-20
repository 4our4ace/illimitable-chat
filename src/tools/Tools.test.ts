// Tools test
// ==========
// `bun test Tools.test.ts`. The master's to-do list (todo), its alone: a
// list given whole replaces the one before, kept in the chat's folder and
// told to a view at once, and named in its calls' messages; one with two
// items active, or an item without text or a status, changes nothing; an
// empty one clears it; a restart reads it back. What the views are told
// of the calls: the input the main agent's last request read.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-tools-");
process.env.ILLI_DIR = DIR;

const { AskAI } = await import("../ai/AskAI.ts");
const { Chat } = await import("../chat/Chat.ts");
const { Tools } = await import("./Tools.ts");
const View = await import("../ui/View.ts");

const chat = Chat.open(process.cwd());
const FILE = DIR + "/chat/todo.json";

// the todo tool called by the master
function todo(items: unknown) {
  return Tools.call(chat.tools, "main", "todo", { items }, new AbortController().signal);
}

async function until(ok: () => boolean): Promise<void> {
  for (let k = 0; !ok(); k++) {
    if (k > 200) {
      throw new Error("never");
    }
    await Bun.sleep(5);
  }
}

test("the todo tool is the master's alone", () => {
  expect(Tools.list(chat.tools, "main").map((t) => t.name)).toContain("todo");
  expect(Tools.list(chat.tools, "Ada").map((t) => t.name)).not.toContain("todo");
});

test("a list given whole replaces the one before, kept in the chat's folder and told to a view at once", async () => {
  const v = View.view_new();
  View.link_open(v, Chat.link(chat, (msg) => void View.view_hear(v, msg), async () => true));
  await until(() => v.up);
  expect(v.todo).toEqual([]);
  expect(await todo([{ text: "Old", status: "active" }])).toMatchObject({ fail: false });
  const list = [{ text: "Read the code", status: "done" }, { text: "Write  the\ntests", status: "active" }, { text: "Run them", status: "pending" }];
  expect(await todo(list)).toEqual({ text: "1 of 3 done; active: Write the tests.", fail: false });
  await until(() => v.todo.length === 3);
  expect(v.todo.map((x) => x.text)).toEqual(["Read the code", "Write the tests", "Run them"]);
  expect(JSON.parse(fs.readFileSync(FILE, "utf8"))).toEqual(v.todo);
  expect(Tools.at_work(chat.tools).text).toContain("1 of 3 done; active: Write the tests.\n- done: Read the code\n- active: Write the tests\n- pending: Run them\n");
  v.ws!.close();
});

test("two items active, or an item without text or a status, changes nothing", async () => {
  const before = JSON.stringify(Tools.todo(chat.tools));
  expect(await todo([{ text: "a", status: "active" }, { text: "b", status: "active" }])).toMatchObject({ fail: true, text: expect.stringContaining("one active at a time") });
  expect(await todo([{ text: " ", status: "pending" }])).toMatchObject({ fail: true });
  expect(await todo([{ text: "a", status: "started" }])).toMatchObject({ fail: true });
  expect(await todo("a")).toMatchObject({ fail: true });
  expect(JSON.stringify(Tools.todo(chat.tools))).toBe(before);
  expect(fs.readFileSync(FILE, "utf8")).toContain("Write the tests");
});

test("a restart reads the list back; an empty one clears it", async () => {
  expect(Tools.todo_load(FILE)).toEqual(Tools.todo(chat.tools));
  expect(await todo([])).toEqual({ text: "The to-do list is cleared.", fail: false });
  expect(Tools.todo_load(FILE)).toEqual([]);
  expect(Tools.at_work(chat.tools).text).not.toContain("to-do");
  expect(Tools.todo_load(DIR + "/none.json")).toEqual([]);
});

test("the views are told the input the main agent's last request read, not an agent's", () => {
  expect(Chat.state(chat)).toMatchObject({ use: { tokens: null, limits: [] } });
  AskAI.read(Tools.at(chat.tools, "main"), 41000);
  AskAI.read(Tools.at(chat.tools, "Ada"), 9);
  AskAI.read("", 7);
  expect(Chat.state(chat)).toMatchObject({ use: { tokens: 41000 } });
});
