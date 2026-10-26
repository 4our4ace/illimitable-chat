// Chat test
// =========
// `bun test Chat.test.ts`. The chat in this process, the model stood in
// for: a view over the pipe sends a message and hears the reply; a /model
// while the turn's call runs picks the next call's (the wait names the
// model the running one asked); one process at a time holds a project's
// chat. A goal check and a message sent mid-run fit the chat's model. A
// main agent switch is a note of its own. A message sent as a stopped turn
// winds down is answered, and what was logged between waiting messages
// reaches the turn. What a turn's first request read beyond the chat
// lowers the chat's budget; a view sets its model's autocompact; a model
// whose window no one told moves no cut, its turn saying why (a stop
// while it waits for the catalog ends it at once). A call too long for the model's window makes the
// chat refit and the turn go on from a note, unasked (a call grown past
// its first request starts the count anew, its share kept); three in a row end
// it, saying why; with autocontinue off, the turn ends at the first,
// saying a message goes on, the three counted over the user's messages
// all the same. A view is told the state whole as it joins, then only
// what moved since its last, so each view holds the chat's state. A
// failed turn asks to try again only when a later try may answer, and
// says a reply was cut off; summaries stuck are told once;
// a save that fails is told, never thrown (a goal met still ends as
// met). The suggested reply stays as a message of the user's own goes
// (to send too) and as the chat closes (for the next start); sent, or a
// turn answered, it goes. /compact asks the chat's model for a recap in
// the turn's place, on its cache, and the agent's view starts at it, the
// screen as it was; what is logged meanwhile comes after it; failed or
// stopped, the chat is as it was, and a quit resumes nothing. /clear
// empties the to-do list beside the chat, whatever was said. A view
// switches this session's mode; a refused request allowed again is told
// to illi in the user's name, its grants this session's; a grant goes.
// A radar's line a view dismissed reaches the chat, kept once; a setting
// written at a view, whatever its key, is read again by the chat's illi
// (`related`, `sticky`, `off`, `suggest`: a suggested reply let go while
// off), each view told to read it again too.
// The loop guard counts within a turn (an agent's run too). A
// message passes the plugins' and hooks' checks (kept back, told more;
// slow ones waited on in the views' sight, a stop sending it back); their
// turn.stop makes a turn go on before its goal is checked, 8 times in a
// row at most; what they tell every call comes after where illi works.
// The time now is in where illi works, after every cache mark a later
// call reads.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import { temp_dir, temp_repo } from "../../test/repo.ts";

const DIR = temp_dir("illi-chat-");
process.env.ILLI_DIR = DIR;

// the project the chat is opened in: a throwaway repository (no
// remote), so its calls act there, never on this checkout
const REPO = temp_repo("illi-chat-work-");

const { AskAI } = await import("../ai/AskAI.ts");
const { ChatGPT } = await import("../ai/ChatGPT.ts");
const { Chat } = await import("./Chat.ts");
const { Lock } = await import("./Lock.ts");
const { Suggest } = await import("./Suggest.ts");
const { Memory } = await import("./Memory.ts");
const { Projects } = await import("./Projects.ts");

// the project the tests run in, whose chat Chat.open opens
const HERE = Projects.place(REPO);
const { Pick } = await import("../ai/Pick.ts");
const config = await import("../config/Config.ts");
const View = await import("../ui/View.ts");
const { Tools } = await import("../tools/Tools.ts");
const { Machine } = await import("../tools/Machine.ts");

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

const chat = Chat.open(REPO);

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

test("permissions over the pipe: the mode switched for this session (the setting's again with none); a refused request allowed again, illi told in the user's name; a grant let go", async () => {
  const v = View.view_new();
  View.link_open(v, Chat.link(chat, (msg) => View.view_hear(v, msg).forEach((out) => View.link_send(v, out))));
  await until(() => v.up);
  expect(v.perm).toMatchObject({ mode: "auto", set: "auto", refused: [], grants: [], file: config.PERMISSIONS, broken: "" });
  View.link_send(v, { $: "mode", mode: "read-only" });
  await until(() => v.perm.mode === "read-only");
  const out = await Tools.call(chat.tools, "main", "write", { path: "x-illi-test.txt", content: "x" }, new AbortController().signal);
  expect(out.text).toBe("Not run: illi is in read-only mode: changing x-illi-test.txt. The user can switch with /mode, or allow just this in /permissions.");
  await until(() => v.perm.refused.length === 1);
  const refused = v.perm.refused[0];
  expect(refused).toMatchObject({ who: "illi", tool: "write", what: "x-illi-test.txt", how: "mode" });
  View.link_send(v, { $: "allow", refused: refused.id });
  await until(() => v.perm.refused.length === 0 && v.perm.grants.length === 1);
  expect(v.perm.grants).toEqual([{ grant: refused.exact[0], said: "changing x-illi-test.txt", saved: false }]);
  const told = "I allowed `x-illi-test.txt` (/permissions): run it again if you still need it.";
  await until(() => Array.from({ length: chat.mem.count }, (_, i) => Memory.message(chat.mem, i)!).some((m) => m.kind === "user" && m.text === told));
  await until(() => !chat.busy);
  expect(await Tools.guard(chat.tools, "main", "write", { path: "x-illi-test.txt" }, new AbortController().signal)).toBeNull();
  View.link_send(v, { $: "revoke", grant: refused.exact[0] });
  await until(() => v.perm.grants.length === 0);
  View.link_send(v, { $: "mode", mode: null });
  await until(() => v.perm.mode === "auto");
  expect(fs.existsSync(REPO + "/x-illi-test.txt")).toBe(false);
  v.ws!.close();
});

test("a radar's line dismissed at a view's side reaches the chat over the pipe, kept once till illi quits; what is no line refused", async () => {
  const v = View.view_new();
  View.link_open(v, Chat.link(chat, (msg) => View.view_hear(v, msg).forEach((out) => View.link_send(v, out))));
  await until(() => v.up);
  const said: string[] = [];
  const send = (part: unknown) => View.link_send(v, { $: "dismiss", part } as any, (a) => said.push(a.error ?? "ok"));
  send([16, 16]);
  send([16, 16]);
  send([40, 8]);
  send([3, 4]);
  send(["x", 1]);
  send([4, 0.5]);
  await until(() => said.length === 6);
  expect(said.slice(0, 3)).toEqual(["ok", "ok", "ok"]);
  expect(said.slice(3)).toEqual(["No line [3,4] to dismiss.", 'No line ["x",1] to dismiss.', "No line [4,0.5] to dismiss."]);
  expect(chat.tools.gone).toEqual([[16, 32], [40, 48]]);
  v.ws!.close();
  chat.tools.gone.length = 0;
});

test("a setting written at a view reaches the chat's illi at once, whatever its key: what another process wrote in config.json is read again, each view told to read it too", async () => {
  const v = View.view_new();
  const heard: string[] = [];
  View.link_open(v, Chat.link(chat, (msg) => {
    heard.push(msg.$);
    View.view_hear(v, msg).forEach((out) => View.link_send(v, out));
  }));
  await until(() => v.up);
  const file = config.DIR + "/config.json";
  const was  = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const on   = chat.suggest.on;
  try {
    chat.suggest.on = true;
    chat.suggest.text = chat.mem.suggest = "Commit it";
    Chat.change(chat);
    await until(() => v.suggest === "Commit it");
    // a second terminal's /settings writes the file in its own process
    fs.writeFileSync(file, JSON.stringify({ ...(was === null ? {} : JSON.parse(was)), related: "screen", sticky: "terse", off: "reviewer", suggest: "off", autocontinue: "off" }));
    expect([config.RELATED, config.RECALL, config.STICKY, config.OFF, config.SUGGEST, config.AUTOCONTINUE]).toEqual([true, true, [], [], true, true]);
    let said = "";
    heard.length = 0;
    View.link_send(v, { $: "related" }, (a) => (said = a.error ?? "ok"));
    await until(() => said !== "");
    expect([said, config.RELATED, config.RECALL, config.STICKY, config.OFF, config.SUGGEST, config.AUTOCONTINUE]).toEqual(["ok", true, false, ["terse"], ["reviewer"], false, false]);
    expect(heard.filter((m) => m === "settings" || m === "ack")).toEqual(["settings", "ack"]);
    await until(() => v.suggest === "");
    expect([chat.suggest.text, chat.mem.suggest]).toEqual(["", ""]);
  } finally {
    was === null ? fs.rmSync(file, { force: true }) : fs.writeFileSync(file, was);
    config.config_reread();
    chat.suggest.on = on;
    v.ws!.close();
  }
  expect([config.RECALL, config.STICKY, config.OFF, config.SUGGEST, config.AUTOCONTINUE]).toEqual([true, [], [], true, true]);
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
  expect(await Lock.take(REPO)).toBe(true);
  expect(fs.statSync(DIR + "/locks").mode & 0o777).toBe(0o700);
  const env = { ...process.env, ILLI_DIR: DIR };
  const code = (after = "", at = 0) => `const { Lock } = await import(${JSON.stringify(import.meta.dir + "/Lock.ts")}); while (Date.now() < ${at}) {} console.log(await Lock.take()); ${after}`;
  const proc = Bun.spawn([process.execPath, "-e", code()], { cwd: REPO, env, stdout: "pipe" });
  expect(await new Response(proc.stdout).text()).toBe("false\n");
  const repo = temp_repo("illi-chat-repo-");
  const name = Projects.lock(repo);
  const at = Date.now() + 1500;
  const many = Array.from({ length: 6 }, () => Bun.spawn([process.execPath, "-e", code("await Bun.sleep(2500); process.exit(0);", at)], { cwd: repo, env, stdout: "pipe" }));
  const said = await Promise.all(many.map((p) => new Response(p.stdout).text()));
  expect(said.sort()).toEqual(["false\n", "false\n", "false\n", "false\n", "false\n", "true\n"]);
  const gone = Bun.spawn([process.execPath, "-e", code("process.exit(0);")], { cwd: repo, env, stdout: "pipe" });
  expect(await new Response(gone.stdout).text()).toBe("true\n");
  expect(Lock.others(DIR)).toBe(0);
  const open = Bun.spawn([process.execPath, "-e", code("await Bun.sleep(60000);")], { cwd: repo, env, stdout: "pipe" });
  const reader = open.stdout.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("true\n");
  expect([Lock.others(DIR), await Lock.claim(name)]).toEqual([1, null]);
  open.kill("SIGKILL");
  await open.exited;
  expect(Lock.others(DIR)).toBe(0);
  const after = await Lock.claim(name);
  expect(after).not.toBeNull();
  after!.stop();
}, 20000);

test("/compact: illi's recap, asked once on the turn's cache, starts the agent's view; the screen keeps what it showed; what's logged meanwhile comes after it (a main agent switch's note too), a message refused", async () => {
  await until(() => !chat.busy);
  const mem = chat.mem;
  const say = (kind: "user" | "illi" | "tool" | "echo", text: string) => Memory.push(mem, [{ kind, text }]);
  for (let k = 0; k < 4; k++) {
    say("user", "question " + k);
    say("tool", "shell {\"command\":\"ls\"}");
    say("echo", "a.txt b.txt");
    say("illi", "answer " + k);
  }
  const shown = mem.show;
  const before = mem.count;
  expect(View.view_act(View.view_new(), { $: "Send", text: "/compact" })).toEqual([{ $: "compact" }]);
  expect(View.view_act(View.view_new(), { $: "Send", text: "/compact  keep the auth details " })).toEqual([{ $: "compact", focus: "keep the auth details" }]);
  const ask = AskAI.ask;
  let asked: any = null;
  let go = () => {};
  const held = new Promise<void>((ok) => (go = ok));
  AskAI.ask = (a, on) => {
    asked = a;
    const [call, feed] = AskAI.tie(on, () => {}, () => {});
    held.then(() => {
      feed.on({ $: "Delta", kind: "illi", text: "## Objective" });
      feed.end({ ok: true, text: "## Objective\n- answer the questions\n", left: [] });
    });
    return call;
  };
  try {
    const tick = Chat.say(chat, [], Buffer.from("same tick"));
    expect(Chat.compact(chat, "keep the auth details")).toEqual({});
    expect([chat.busy, Chat.waits(chat), Chat.running(chat)]).toEqual([true, View.COMPACTING, []]);
    expect((await tick).error).toContain("writing its recap");
    expect((await Chat.say(chat, [], Buffer.from("too soon"))).error).toContain("writing its recap");
    expect(Chat.compact(chat, "").error).toContain("at work");
    Chat.note(chat, "a note meanwhile");
    let logged = false;
    Chat.logs(chat, { name: "explorer" } as any, () => (logged = true));
    expect(logged).toBe(true);
    await until(() => asked !== null);
    expect([asked.once, asked.server !== "", asked.system]).toEqual([true, true, Chat.system(chat)]);
    const task = asked.blocks.at(-1);
    expect([task.text.startsWith("Recap: the user ran /compact."), task.text.endsWith("keep the auth details"), task.mark]).toEqual([true, true, false]);
    expect(asked.blocks.map((b: any) => b.text).join("")).toContain(before - 1 + "|illi: answer 3");
    expect(mem.count).toBe(before);
    chat.switched = true;
    go();
    await until(() => !chat.busy);
  } finally {
    AskAI.ask = ask;
  }
  const recap = Memory.message(mem, before)!;
  expect([recap.kind, recap.text]).toEqual(["recap", "## Objective\n- answer the questions"]);
  expect(chat.wait).toEqual([]);
  expect([before + 1, before + 2].map((i) => Memory.message(mem, i)!.text)).toEqual([Chat.switch_note(chat), "a note meanwhile"]);
  expect([mem.view.from, mem.cut, mem.show, chat.eye.from]).toEqual([before, before, shown, shown]);
  expect(chat.live).toEqual([]);
  expect(Memory.chat(mem, mem.cut, mem.count).map((b) => b.text).join("")).not.toContain("answer 3");
  const again = Memory.load(mem.dir, () => ({}) as any, HERE);
  expect([again.view.from, again.cut, again.show]).toEqual([before, before, shown]);
  Memory.stop(again);
});

test("/compact failed or stopped leaves the chat as it was, noted; stopped, a quit resumes nothing; right after a recap, nothing to compact", async () => {
  const mem = chat.mem;
  const ask = AskAI.ask;
  const was = [mem.view.from, mem.cut, mem.show];
  const notes = () => Array.from({ length: mem.count }, (_, i) => Memory.message(mem, i)!).filter((m) => m.kind === "note").map((m) => m.text);
  try {
    Memory.push(mem, [{ kind: "user", text: "more" }]);
    AskAI.ask = (_, on) => {
      const [call, feed] = AskAI.tie(on, () => {}, () => {});
      queueMicrotask(() => feed.end({ ok: false, text: "the AI service is busy.", left: [] }));
      return call;
    };
    expect(Chat.compact(chat, "")).toEqual({});
    await until(() => !chat.busy);
    expect(notes().at(-1)).toBe("No compaction: the AI service is busy. The chat is as it was.");
    let [asked, stopped] = [false, false];
    AskAI.ask = (_, on) => {
      const [call, feed] = AskAI.tie(on, () => {}, () => ((stopped = true), feed.end({ ok: false, text: "Stopped.", stop: "lost", left: [] })));
      asked = true;
      return call;
    };
    expect(Chat.compact(chat, "")).toEqual({});
    expect(mem.work).toEqual([]);
    await until(() => asked);
    await Chat.act(chat, { $: "stop", name: View.TURN });
    await until(() => !chat.busy);
    expect([stopped, notes().at(-1)]).toEqual([true, "Compaction stopped; the chat is as it was."]);
    expect([mem.view.from, mem.cut, mem.show]).toEqual(was);
    expect(Memory.message(mem, mem.view.from)!.kind).toBe("recap");
    AskAI.ask = (_, on) => {
      const [call, feed] = AskAI.tie(on, () => {}, () => {});
      queueMicrotask(() => feed.end({ ok: true, text: "## Objective\n- more", left: [] }));
      return call;
    };
    expect(Chat.compact(chat, "")).toEqual({});
    await until(() => !chat.busy);
    Chat.note(chat, "Goal met.");
    expect(Chat.compact(chat, "").error).toBe("Nothing to compact: nothing was said since the last /clear or /compact.");
  } finally {
    AskAI.ask = ask;
  }
});

test("/clear: the agent gets nothing of the chat so far, not even its lines, and no note: the context empty, the screen too, also after a restart; the old topic's suggested reply goes; all of it still found by zoom", async () => {
  const mem = chat.mem;
  const before = mem.count;
  chat.suggest.text = mem.suggest = "Commit it";
  const told: any[] = [];
  const sock = { data: { seen: new Set<string>() }, send: (text: string) => told.push(JSON.parse(text)), close: () => {} };
  chat.socks.add(sock);
  expect(Chat.clear(chat)).toEqual({});
  chat.socks.delete(sock);
  const seen = View.view_new();
  told.forEach((m) => View.view_hear(seen, m));
  expect(seen.use.fill?.used).toBe(0);
  expect([seen.parts, View.view_count(seen)]).toEqual([[], before]);
  expect(mem.cut).toBe(before);
  expect(mem.view.from).toBe(before);
  expect(chat.eye.parts).toEqual([]);
  expect(chat.eye.from).toBe(before);
  expect(mem.count).toBe(before);
  expect(mem.view.parts).toEqual([]);
  expect(Memory.view(mem, mem.cut).map((b) => b.text).join("")).toBe("<chat>\n</chat>\n");
  expect(Memory.fill(mem)).toBe(0);
  expect(Chat.clear(chat)).toEqual({});
  expect(mem.count).toBe(before);
  const again = Memory.load(mem.dir, () => ({}) as any, HERE);
  expect([again.cut, again.show, again.view.from, again.view.parts]).toEqual([before, before, before, []]);
  expect([chat.suggest.text, again.suggest]).toEqual(["", ""]);
  for (let k = 0; k < 9; k++) {
    Memory.push(mem, [{ kind: "user", text: "after the clear " + k }]);
  }
  Memory.fit(mem);
  expect(mem.view.parts.every((part) => Memory.span(part)[0] >= before)).toBe(true);
  expect(Memory.zoom(mem, 0, 1, 0)).toContain(Memory.message(mem, 0)!.text);
});

test("/clear empties the to-do list beside the chat, so after a restart too, even with nothing said since the last /clear", () => {
  const list = [{ text: "the old topic's step", status: "active" as const }];
  Tools.todo_set(chat.tools, list);
  expect(Chat.clear(chat)).toEqual({});
  expect(Tools.todo(chat.tools)).toEqual([]);
  chat.tools.todo = undefined;
  expect(Tools.todo(chat.tools)).toEqual([]);
  Tools.todo_set(chat.tools, list);
  expect(chat.mem.cut).toBe(chat.mem.count);
  expect(Chat.clear(chat)).toEqual({});
  expect(Tools.todo(chat.tools)).toEqual([]);
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
async function refitted(ends: Array<{ text: string; grew?: boolean }>) {
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
    queueMicrotask(() => feed.end({ ok: false, text: end.text, left: [], stop: "full", grew: end.grew }));
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

test("what a turn's first request read beyond the chat it carried lowers the chat's budget; a view's autocompact act sets its model's, taken back by none", async () => {
  const real   = AskAI.ask;
  const window = Pick.window(chat.pick)!;
  AskAI.ask = (_, on) => {
    const [call, feed] = AskAI.tie(on, () => {}, () => {});
    const first = Math.round(Memory.fill(chat.mem) / 4) + window / 2;
    queueMicrotask(() => {
      feed.on({ $: "Entry", kind: "illi", text: "hello back" });
      feed.end({ ok: true, text: "hello back", left: [], first });
    });
    return call;
  };
  const v = View.view_new();
  View.link_open(v, Chat.link(chat, (msg) => View.view_hear(v, msg).forEach((out) => View.link_send(v, out))));
  try {
    await until(() => v.up);
    View.view_act(v, { $: "Send", text: "how big is the prompt?" }).forEach((out) => View.link_send(v, out));
    await until(() => chat.beside.size === 1 && !chat.busy);
    expect(Chat.cap(chat)).toBe(Math.round(Math.round(window * 0.4) * chat.fit));
    View.link_send(v, { $: "autocompact", label: chat.pick.model, value: "30%" });
    await until(() => v.use.fill?.set === "30%");
    expect([v.use.fill!.own, Chat.cap(chat)]).toEqual([true, Math.round(Math.round(window * 0.3) * chat.fit)]);
    View.link_send(v, { $: "autocompact", label: chat.pick.model, value: null });
    await until(() => v.use.fill?.own === false);
  } finally {
    AskAI.ask = real;
    chat.beside.clear();
    v.ws?.close();
  }
});

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

test("a turn grown past its room goes on without shrinking; three refits in a row with no work between end the turn, saying why", async () => {
  const fit = chat.fit;
  expect(await refitted([{ text: "", grew: true }])).toHaveLength(2);
  expect(chat.fit).toBe(fit);
  const start = { text: "the turn starts past 100 tokens" };
  const asked = await refitted([start, start, start, start]);
  expect(asked).toHaveLength(4);
  const last = Memory.message(chat.mem, chat.mem.count - 1)!;
  expect([last.kind, last.text]).toEqual(["note", "No reply: the chat won't fit " + chat.model + "'s window even summarized. /clear starts a new topic (the chat before it is kept, not sent), or /model picks a model with a bigger window."]);
  expect(chat.refits).toBe(0);
});

test("a turn working past its window again and again goes on, each call grown past its first request starting the count anew, its share kept, even one refused as too long", async () => {
  const fit = chat.fit;
  const grown = Array.from({ length: 6 }, (_, k) => ({ text: k % 2 === 0 ? "" : "HTTP 400: prompt is too long", grew: true }));
  const from = chat.mem.count;
  const asked = await refitted(grown);
  expect(asked).toHaveLength(7);
  expect(asked.slice(1).every((a) => a.text.includes("The chat outgrew " + chat.model + "'s window"))).toBe(true);
  expect(chat.fit).toBe(fit);
  const notes = Array.from({ length: chat.mem.count - from }, (_, k) => Memory.message(chat.mem, from + k)!).filter((m) => m.kind === "note");
  expect(notes.some((m) => m.text.startsWith("No reply"))).toBe(false);
  expect(chat.refits).toBe(0);
});

test("autocontinue off: a turn whose chat outgrew the window ends there, its note saying a message goes on, the share still made smaller; the refits counted over the user's messages, so past three in a row it says it won't fit", async () => {
  const fit = chat.fit;
  const long = [{ text: "HTTP 400: prompt is too long: 210000 tokens > 200000 maximum" }];
  config.config_set("autocontinue", "off");
  try {
    expect(await refitted(long)).toHaveLength(1);
    expect(last()).toBe("The chat outgrew " + chat.model + "'s window: more of it is summarized now, each summary a zoom away. Send a message to go on (autocontinue is off).");
    expect([chat.fit, chat.refits]).toEqual([fit * 0.8, 1]);
    chat.refits = 3;
    expect(await refitted(long)).toHaveLength(1);
    expect(last()).toBe("No reply: the chat won't fit " + chat.model + "'s window even summarized. /clear starts a new topic (the chat before it is kept, not sent), or /model picks a model with a bigger window.");
    expect(chat.refits).toBe(0);
  } finally {
    config.config_set("autocontinue", null);
    [chat.fit, chat.refits] = [fit * 0.8, 0];
  }
  expect(config.AUTOCONTINUE).toBe(true);
});

// the chat's last message's text
function last(): string {
  return Memory.message(chat.mem, chat.mem.count - 1)!.text;
}

test("a model whose window no one told (ChatGPT's before its catalog answers) moves no cut, takes no tokens and shows no fill; its turn says why instead of guessing one, a stop while it waits ending it at once", async () => {
  await until(() => !chat.busy);
  const [was, listed, models] = [chat.pick, ChatGPT.listed, ChatGPT.models];
  ChatGPT.listed = async () => {};
  ChatGPT.models = async () => null;
  chat.pick = { vendor: "chatgpt", model: "gpt-6-luna", effort: "medium", speed: "slow" };
  try {
    expect(Pick.window(chat.pick)).toBeUndefined();
    const cut = chat.mem.cut;
    expect([Chat.cut(chat), Chat.cap(chat), (Chat.state(chat) as any).use.fill]).toEqual([cut, 0, null]);
    expect((Chat.state(chat) as any).use.compacts).toEqual({ global: expect.any(String), sets: expect.any(Object) });
    Chat.take(chat, Chat.push(chat, null, "user", "how big is your window?"));
    await until(() => !chat.busy && last().startsWith("No reply"));
    expect(last()).toBe("No reply: ChatGPT hasn't told gpt-6-luna's context window (its model list didn't answer), and illi never guesses one. Send a message to try again.");
    expect(chat.mem.cut).toBe(cut);
    ChatGPT.models = () => new Promise(() => {});
    Chat.take(chat, Chat.push(chat, null, "user", "and now?"));
    await until(() => chat.busy);
    await Bun.sleep(20);
    Chat.stop(chat, null);
    await until(() => !chat.busy);
    expect(last()).toBe("and now?");
  } finally {
    [chat.pick, ChatGPT.listed, ChatGPT.models] = [was, listed, models];
  }
});

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
    expect(() => Suggest.drop(chat)).not.toThrow();
    expect(got.filter((m) => m.$ === "note").length).toBe(2);
  } finally {
    Memory.save = save;
    chat.socks.delete(sock);
  }
  expect(got.find((m) => m.$ === "note").text).toBe("Can't save the chat: disk full (" + chat.mem.dir + ").");
  expect(["SQLITE_FULL", "SQLITE_READONLY", "SQLITE_IOERR_WRITE", "SQLITE_BUSY", "SQLITE_MISMATCH"].map((code) => Chat.unsaved(Object.assign(new Error("as SQLite says it"), { code })))).toEqual(["disk full", "read-only disk", "the disk failed to write", "another illi kept the file busy too long", "as SQLite says it"]);
});

// a view is told the state whole as it joins, then only the fields that
// moved since what it was told: a refusal its permissions alone, nothing
// when nothing moved; a view joining meanwhile gets it whole, and each
// view's own last state is what its next is told against. A field
// changed in place since it was told moves too; each view, taking what
// it is told over its own, holds the chat's state; one that leaves and
// joins again is told it whole
test("a view is told the state whole as it joins, then only what moved since its last", () => {
  const sock = () => {
    const got: any[] = [];
    return { got, sock: { data: { seen: new Set() }, send: (text: string) => got.push(JSON.parse(text)), close: () => {} } as any };
  };
  const states = (got: any[]) => got.filter((m) => m.$ === "state").map((m) => Object.keys(m).filter((k) => k !== "$").sort());
  const whole = () => {
    const { $, ...state } = Chat.state(chat);
    return JSON.parse(JSON.stringify(state));
  };
  const held = (got: any[]) => {
    const v: ReturnType<typeof View.view_new> = View.view_new();
    got.forEach((m) => View.view_hear(v, m));
    return JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(whole()).map((k) => [k, v[k as keyof typeof v]]))));
  };
  const [a, b] = [sock(), sock()];
  const refused = chat.tools.perm.refused;
  const r1 = { id: "r1", who: "illi", tool: "shell", what: "rm -rf /x", why: "/x is outside the project", how: "no" as const, said: "", at: 1, exact: [] };
  try {
    Chat.join(chat, a.sock);
    expect(states(a.got)[0]).toEqual(["agent", "agents", "asks", "background", "busy", "catalog", "models", "perm", "pick", "suggest", "todo", "use", "vendors", "wait"]);
    Chat.change(chat);
    expect(states(a.got).length).toBe(1);
    chat.tools.perm.refused = [...refused, r1];
    Chat.join(chat, b.sock);
    chat.tools.perm.refused = refused;
    Chat.change(chat);
    expect(states(a.got).slice(1)).toEqual([]);
    expect(states(b.got)).toEqual([states(a.got)[0], ["perm"]]);
    expect(b.got.at(-1).perm.refused).toEqual(refused);
    chat.tools.perm.refused = [...refused];
    Chat.change(chat);
    chat.tools.perm.refused.push(r1);
    Chat.change(chat);
    expect([states(a.got).slice(1), states(b.got).slice(2)]).toEqual([[["perm"]], [["perm"]]]);
    expect([held(a.got), held(b.got)]).toEqual([whole(), whole()]);
    Chat.leave(chat, a.sock);
    chat.tools.perm.refused = refused;
    Chat.change(chat);
    Chat.join(chat, a.sock);
    expect(states(a.got).slice(2)).toEqual([states(a.got)[0]]);
    expect(held(a.got)).toEqual(whole());
  } finally {
    chat.tools.perm.refused = refused;
    Chat.leave(chat, a.sock);
    Chat.leave(chat, b.sock);
  }
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

test("a suggested reply stays as a message of the user's own goes, to send too, and while the turn runs; it goes once sent or the turn answered, a stopped turn keeping it", async () => {
  await until(() => !chat.busy);
  const saved = () => Memory.load(chat.mem.dir, () => ({}) as any, HERE).suggest;
  const offer = () => {
    chat.suggest.text = chat.mem.suggest = "Commit it";
    Memory.save(chat.mem);
  };
  let go = () => {};
  offer();
  Suggest.used(chat, "also fix the typo");
  expect(chat.suggest.text).toBe("Commit it");
  Suggest.used(chat, "Commit it, please");
  expect([chat.suggest.text, saved()]).toEqual(["", ""]);
  offer();
  hold = new Promise((ok) => (go = ok));
  try {
    Chat.take(chat, Chat.push(chat, null, "user", "also fix the typo"));
    await until(() => chat.call !== null);
    expect(chat.suggest.text).toBe("Commit it");
    go();
    await until(() => !chat.busy);
    expect([chat.suggest.text, saved()]).toEqual(["", ""]);
    offer();
    hold = new Promise((ok) => (go = ok));
    Chat.take(chat, Chat.push(chat, null, "user", "and the docs"));
    await until(() => chat.call !== null);
    Chat.interrupt(chat, "Stopped by the user: illi.");
    go();
    await until(() => !chat.busy);
    expect([chat.suggest.text, saved()]).toEqual(["Commit it", "Commit it"]);
  } finally {
    hold = Promise.resolve();
    Suggest.drop(chat);
  }
});

test("a turn answered counts the suggested reply unused only if the user passed it over (an agent's report or a resumed turn passes over none), and stops one still being asked", async () => {
  await until(() => !chat.busy);
  const turn = async () => {
    Chat.take(chat, Chat.push(chat, null, "note", "an agent reported"));
    await until(() => !chat.busy);
  };
  Object.assign(chat.suggest, { text: "Commit it", unused: 0, passed: false });
  await turn();
  expect([chat.suggest.text, chat.suggest.unused]).toEqual(["", 0]);
  chat.suggest.text = "Commit it";
  Suggest.used(chat, "also fix the typo");
  await turn();
  expect([chat.suggest.text, chat.suggest.unused]).toEqual(["", 1]);
  let stopped = false;
  chat.suggest.call = { stop: () => (stopped = true), done: new Promise(() => {}) } as any;
  await turn();
  expect([stopped, chat.suggest.call, chat.suggest.unused]).toEqual([true, null, 1]);
  chat.suggest.unused = 0;
});

// the chat's last n messages, as kind: text
const lasts = (n: number) => Array.from({ length: n }, (_, k) => Memory.message(chat.mem, chat.mem.count - n + k)!).map((m) => m.kind + ": " + m.text);

test("a message past the plugins' and hooks' checks: kept back, why said; sent with what they add, a note after it; while slow ones run the views wait on them, and a stop sends it back unsent", async () => {
  const { Plugins } = await import("../config/Plugins.ts");
  await until(() => !chat.busy);
  Plugins.own("test", "", "the test", [{ hook: "message.before", run: (ev: any) => ev.text === "no" ? { block: "Not that." } : ev.text === "slow" ? new Promise((done) => ev.signal.addEventListener("abort", () => done(undefined))) : { context: "It's Friday." } }]);
  try {
    const count = chat.mem.count;
    expect(await Chat.say(chat, [], Buffer.from("no"))).toEqual({ error: "Not that." });
    expect(chat.mem.count).toBe(count);
    expect(await Chat.say(chat, [], Buffer.from("yes"))).toEqual({});
    await until(() => !chat.busy);
    expect(lasts(3)).toEqual(["user: yes", "note: From the test:\nIt's Friday.", "illi: hello back"]);
    const slow = Chat.say(chat, [], Buffer.from("slow"));
    await Bun.sleep(400);
    expect(Chat.state(chat)).toMatchObject({ busy: true, wait: "your hooks" });
    await Chat.act(chat, { $: "stop" });
    expect(await slow).toEqual({ error: "Stopped before it was sent: your message is back in the input." });
    expect([chat.checking, Chat.state(chat)]).toMatchObject([null, { busy: false, wait: "" }]);
    expect(lasts(1)).toEqual(["illi: hello back"]);
  } finally {
    Plugins.reset();
  }
});

test("a turn ending of itself: a turn.stop hook, given the reply, makes it go on from its note, before the goal is checked; past 8 in a row with no tool call it ends, saying so", async () => {
  const { Plugins } = await import("../config/Plugins.ts");
  await until(() => !chat.busy);
  const ask = AskAI.ask;
  const calls: string[] = [];
  const seen: Array<[boolean, string]> = [];
  let goes = 1;
  AskAI.ask = (a, on) => {
    if (a.blocks.at(-1)!.text.endsWith("</input>")) {
      return ask(a, on);
    }
    const goal = a.system.startsWith("You check a goal");
    calls.push(goal ? "goal" : "turn");
    const [call, feed] = AskAI.tie(on, () => {}, () => {});
    queueMicrotask(() => {
      feed.on({ $: "Entry", kind: "illi", text: goal ? "yes" : "done " + calls.length });
      feed.end({ ok: true, text: goal ? "yes" : "done " + calls.length, left: [] });
    });
    return call;
  };
  Plugins.own("test", "", "the test", [{ hook: "turn.stop", run: (ev: any) => (seen.push([ev.again, ev.reply]), goes-- > 0 ? { continue: "Run the tests." } : undefined) }]);
  try {
    chat.mem.goal = "ship it";
    expect(await Chat.say(chat, [], Buffer.from("go"))).toEqual({});
    await until(() => !chat.busy && chat.mem.goal === null);
    expect(calls).toEqual(["turn", "turn", "goal"]);
    expect(seen).toEqual([[false, "done 1"], [true, "done 2"]]);
    expect(lasts(5)).toEqual(["user: go", "illi: done 1", "note: From the test:\nRun the tests.", "illi: done 2", "note: Goal met."]);
    [goes, calls.length, seen.length] = [100, 0, 0];
    expect(await Chat.say(chat, [], Buffer.from("again"))).toEqual({});
    await until(() => !chat.busy && lasts(1)[0].startsWith("note: Hooks asked"));
    expect([calls.length, seen[0][0], seen[1][0]]).toEqual([9, false, true]);
    expect(lasts(1)).toEqual(["note: Hooks asked illi to go on 8 times in a row: it stops here till your next message."]);
    chat.goings = 5;
    Chat.on(chat, null, { $: "Entry", kind: "tool", text: "shell ls", of: "t1" });
    expect(chat.goings).toBe(0);
    delete chat.calls.t1;
    Chat.live(chat, null, []);
  } finally {
    AskAI.ask = ask;
    chat.mem.goal = null;
    Plugins.reset();
  }
});

test("what the plugins and hooks tell every call of the run comes after where illi works, out of the cache's mark", async () => {
  await until(() => !chat.busy);
  const ask = AskAI.ask;
  let blocks: any[] = [];
  AskAI.ask = (a, on) => ((blocks = a.blocks), ask(a, on));
  chat.context = Promise.resolve(["From your hooks:\nOn branch main."]);
  try {
    expect(await Chat.say(chat, [], Buffer.from("where am I"))).toEqual({});
    await until(() => blocks.length > 0 && !chat.busy);
  } finally {
    AskAI.ask = ask;
    chat.context = Promise.resolve([]);
  }
  const at = blocks.findIndex((b) => b.text.startsWith("Working dir: "));
  expect(blocks[at + 1]).toEqual({ text: "From your hooks:\nOn branch main.\n\n", mark: false });
});

test("the time now opens where illi works: unmarked, after every mark a later call reads, so a new minute never changes a cached prefix", async () => {
  await until(() => !chat.busy);
  const ask = AskAI.ask;
  let asked: any = null;
  AskAI.ask = (a, on) => ((asked = a), ask(a, on));
  try {
    expect(await Chat.say(chat, [], Buffer.from("what day is it"))).toEqual({});
    await until(() => asked !== null && !chat.busy);
  } finally {
    AskAI.ask = ask;
  }
  const at = asked.blocks.findIndex((b: any) => b.text.startsWith("Working dir: "));
  expect(asked.blocks[at].text).toMatch(/\nNow: [A-Z][a-z]{2} \d{4}-\d\d-\d\d \d\d:\d\d UTC\S*\n\n$/);
  expect(asked.blocks.slice(at, -1).every((b: any) => !b.mark)).toBe(true);
  expect(asked.blocks.at(-1).mark).toBe(true);
  expect(AskAI.keys(asked).length).toBeGreaterThan(0);
  expect(AskAI.keys(asked).length).toBeLessThanOrEqual(at);
});

test("background jobs over the pipe: a shell call's in every view's state, its caller named, and in what illi's calls start with; a view's stop ends it; as illi quits, those left are noted", async () => {
  const v = View.view_new();
  View.link_open(v, Chat.link(chat, (msg) => View.view_hear(v, msg).forEach((out) => View.link_send(v, out))));
  await until(() => v.up);
  expect(v.background).toEqual([]);
  const live = new AbortController().signal;
  const out = await Tools.call(chat.tools, "main", "shell", { command: "sleep 30 > /dev/null 2>&1 & echo $!" }, live);
  const pid = Number(out.text.split("\n")[0]);
  await until(() => v.background.length === 1);
  expect(v.background[0]).toMatchObject({ command: "sleep 30 > /dev/null 2>&1 & echo $!", agent: "illi" });
  expect(Tools.at_work(chat.tools).text).toContain("Background jobs now (what shell calls left running): \n- sleep 30 > /dev/null 2>&1 & echo $! (illi's, running 1 min)");
  View.link_send(v, { $: "background", stop: v.background[0].id });
  await until(() => v.background.length === 0 && !Machine.alive(pid));
  expect(Tools.at_work(chat.tools).text).toContain("Background jobs now (what shell calls left running): none.");
  await Machine.shell(chat.tools.cwd, "sleep 30 > /dev/null 2>&1 &", live, "reviewer");
  Chat.leaving(chat);
  expect(Memory.message(chat.mem, chat.mem.count - 1)).toMatchObject({ kind: "note", text: "illi quit, stopping its background jobs: sleep 30 > /dev/null 2>&1 & (reviewer's)." });
  Machine.end();
  v.ws!.close();
});

test("the loop guard starts each turn fresh: a command polled once a turn is never a loop, three in a turn are; an agent's run, a name used again, starts fresh too", async () => {
  const poll = (who = "main") => Tools.call(chat.tools, who, "shell", { command: "echo poll" }, new AbortController().signal);
  const looped = "No one is at illi's screen to ask, so it isn't allowed. Asked because the same call a third time in a row";
  await until(() => !chat.busy);
  expect(Tools.mode(chat.tools)).toBe("auto");
  for (let k = 0; k < 3; k++) {
    expect((await poll()).text).toStartWith("poll\n");
    expect((await poll()).text).toStartWith("poll\n");
    Chat.take(chat, Chat.push(chat, null, "user", "check again"));
    await until(() => !chat.busy);
  }
  expect((await poll()).text).toStartWith("poll\n");
  expect((await poll()).text).toStartWith("poll\n");
  expect((await poll()).text).toStartWith(looped);
  expect((await poll("reviewer")).text).toStartWith("poll\n");
  expect((await poll("reviewer")).text).toStartWith("poll\n");
  expect(Tools.start(chat.tools, { $: "sub", effort: null, agent: "reviewer" }, "look again", [])).toBe("reviewer");
  expect((await poll("reviewer")).text).toStartWith("poll\n");
  const said = () => Array.from({ length: chat.mem.count }, (_, i) => Memory.message(chat.mem, i)!);
  await until(() => said().some((m) => m.kind === "work" && m.text.includes("reviewer")));
  await until(() => !chat.busy && said().at(-1)!.kind === "illi");
  chat.tools.perm.refused.length = 0;
});

test("the suggested reply stays as the chat closes, so the next start shows it (a screen that asks for none, none); let go, saved so", async () => {
  const last = AskAI.last;
  AskAI.last = () => ({ ask: { ...Pick.ask(chat.pick), blocks: [] } }) as any;
  Object.assign(chat.suggest, { on: true, unused: 0 });
  try {
    Suggest.ask(chat);
    await until(() => chat.suggest.text !== "");
  } finally {
    AskAI.last = last;
  }
  const saved = () => Memory.load(chat.mem.dir, () => ({}) as any, HERE).suggest;
  const shown = () => (Chat.state(chat) as any).suggest;
  expect([chat.suggest.text, saved(), shown()]).toEqual(["hello back", "hello back", "hello back"]);
  chat.suggest.on = false;
  expect(shown()).toBe("");
  Suggest.drop(chat);
  expect(saved()).toBe("");
  chat.suggest.text = chat.mem.suggest = "Commit it";
  Memory.save(chat.mem);
  Chat.close(chat, true);
  expect(saved()).toBe("Commit it");
});
