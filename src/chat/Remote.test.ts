// Remote test
// ===========
// `bun test Remote.test.ts`. A view in another terminal (here: over the
// lock's socket) joins the running chat as it is, one that came before
// the chat was up too; it sends a message, its body a post, and hears the
// reply, as the chat's own terminal does. A view of another version is
// refused, and so is a connection that is no view; a view whose chat's
// illi says nothing gives up, saying so, and one whose chat's socket
// isn't up is told. As the chat's illi quits, its views are told; a post
// then is answered.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";

const DIR  = fs.mkdtempSync(os.tmpdir() + "/illi-remote-");
const REPO = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + "/illi-remote-repo-"));
process.env.ILLI_DIR = DIR;
fs.mkdirSync(REPO + "/.git");

const { AskAI } = await import("../ai/AskAI.ts");
const { Chat } = await import("./Chat.ts");
const { Lock } = await import("./Lock.ts");
const { Memory } = await import("./Memory.ts");
const { Projects } = await import("./Projects.ts");
const { Remote } = await import("./Remote.ts");
const View = await import("../ui/View.ts");

afterAll(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.rmSync(REPO, { recursive: true, force: true });
});

// the model: answers "hello back"
AskAI.ask = (_, on) => {
  const [call, feed] = AskAI.tie(on, () => {}, () => {});
  queueMicrotask(() => {
    feed.on({ $: "Entry", kind: "illi", text: "hello back" });
    feed.end({ ok: true, text: "hello back", left: [] });
  });
  return call;
};

async function until(ok: () => boolean): Promise<void> {
  for (let k = 0; !ok(); k++) {
    if (k > 400) {
      throw new Error("never");
    }
    await Bun.sleep(5);
  }
}

// a view on a link, its acts sent
function view(make: (hear: (msg: any) => void) => any) {
  const v = View.view_new();
  const link = make((msg) => View.view_hear(v, msg).forEach((out) => View.link_send(v, out)));
  View.link_open(v, link);
  return { v, link };
}

const FILE = Lock.socket(Projects.lock(REPO));
const gone: Array<[string, boolean]> = [];
expect(await Lock.take(REPO, Remote.serve)).toBe(true);
const there = view((hear) => Remote.link(FILE, hear, (why, heard) => gone.push([why, heard])));
const chat = Chat.open(REPO);
Remote.share(chat);
const here = view((hear) => Chat.link(chat, hear));
const said = (v: any, text: string) => [...v.whole.values()].some((e: any) => e.text === text);

test("a view in another terminal joins the chat as it is, sends a message and hears the reply, as the chat's own terminal does", async () => {
  expect(fs.statSync(FILE).mode & 0o777).toBe(0o600);
  await until(() => there.v.up && here.v.up);
  expect([...there.v.whole.values()][0].kind).toBe("illi");
  View.view_act(there.v, { $: "Send", text: "hi from the other terminal" }).forEach((out) => View.link_send(there.v, out));
  await until(() => said(there.v, "hello back") && said(here.v, "hello back"));
  expect(said(here.v, "hi from the other terminal")).toBe(true);
  expect(Memory.message(chat.mem, 1)!.text).toBe("hi from the other terminal");
  await until(() => !chat.busy);
});

test("a view of another version is refused, and so is a connection that is no view", async () => {
  const ask = (line: string) => new Promise<string>((done) => {
    const sock = net.connect(FILE);
    let got = "";
    sock.setEncoding("utf8");
    sock.on("data", (d) => (got += d));
    sock.on("close", () => done(got));
    sock.write(line + "\n");
  });
  expect(await ask(JSON.stringify({ $: "hello", v: 99 }))).toBe(JSON.stringify({ $: "refused", why: "another version" }) + "\n");
  expect(await ask("GET / HTTP/1.1")).toBe(JSON.stringify({ $: "refused", why: "not a view" }) + "\n");
});

test("a view whose chat's illi says nothing gives up, saying so", async () => {
  const file = DIR + "/mute.sock";
  const server = net.createServer(() => {}).listen(file);
  const why: Array<[string, boolean]> = [];
  view((hear) => Remote.link(file, hear, (w, heard) => why.push([w, heard]), 50));
  await until(() => why.length > 0);
  expect(why).toEqual([["it doesn't answer (an older illi?)", false]]);
  server.close();
});

test("a view whose chat's socket isn't up yet is told so, never having heard it", async () => {
  const why: Array<[string, boolean]> = [];
  view((hear) => Remote.link(DIR + "/none.sock", hear, (w, heard) => why.push([w, heard])));
  await until(() => why.length > 0);
  expect(why).toEqual([["", false]]);
});

test("as the chat's illi quits, its views are told; a post then is answered", async () => {
  Chat.close(chat);
  await until(() => gone.length > 0);
  expect(gone).toEqual([["", true]]);
  expect(fs.existsSync(FILE)).toBe(false);
  expect(await there.link.post({ $: "say", sizes: [] }, new Blob(["late"]))).toEqual({ error: "The chat's illi quit before it took that." });
});
