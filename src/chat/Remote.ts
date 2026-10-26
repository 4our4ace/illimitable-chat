// Remote
// ======
// Another terminal on a project's running chat. The illi that holds the
// project (Lock.take) serves views on its lock's socket too: another illi
// started in that project joins as one more view, the screens alike, each
// able to do what the other can. The pipe is Chat.link's, in JSON lines
// over the socket: the chat's messages one way, the person's acts the
// other. The view's first line names the protocol's version (another's
// refused: the illis differ); an act with a body (a message's images)
// goes as a post, its body in base64, answered by its id.
//
// The view's illi runs no chat of its own, nor agents, nor MCP servers;
// what it reads itself (an export, the tree, the projects) it reads from
// the file. A setting it writes in config.json it tells the chat's illi,
// which reads the file again (Settings.ts setting_follow) and tells every
// view to read it again too (setting_told), whichever terminal wrote it.
// When the chat's illi quits, the view's runs again (Term.ts): it holds
// the chat then, or joins one that got there first. The illi holding a
// project may be a profile left running hidden in a window (Window.ts):
// it serves its views all the same.

import * as net from "node:net";
import { Chat, type Chat as Running } from "./Chat.ts";
import type { Answer, Link, Pipe } from "../ui/View.ts";

// Constants
// =========

// the protocol's version: a view and its chat's illi agree on it
const VERSION = 3;

// how long a view waits for the chat's first message, ms (none: the
// illi there serves no views; it may be opening a big chat first)
const MUTE = 15000;

// how far behind a view's socket may fall, bytes not yet taken (its
// terminal stopped, Ctrl+Z): past it, let go; it joins again anew
const LAG = 64 * 1024 * 1024;

// Globals
// =======

// the chat views join, once it is up (the lock comes first)
let up: (chat: Running) => void = () => {};
const host = new Promise<Running>((done) => (up = done));

// Remote
// ======

export namespace Remote {

  // the chat up: views join it, those that came before it too
  export function share(chat: Running): void {
    up(chat);
  }

  // a connection to the lock: a view once it says hello (its version
  // this one's), its acts answered as a pipe's; gone, it leaves
  export function serve(sock: net.Socket): void {
    let view: { data: { seen: Set<string> }; send: (text: string) => void } | null = null;
    sock.on("close", () => view !== null && void host.then((chat) => Chat.leave(chat, view!)));
    Remote.lines(sock, async (line) => {
      const msg = Remote.parse(line);
      const chat = await host;
      if (view === null && msg?.$ === "hello" && msg.v === VERSION) {
        view = { data: { seen: new Set() }, send: (text) => Remote.write(sock, text) };
        return Chat.join(chat, view);
      }
      if (view === null) {
        Remote.write(sock, JSON.stringify({ $: "refused", why: msg?.$ === "hello" ? "another version" : "not a view" }));
        return void sock.end();
      }
      if (msg?.$ === "post") {
        const out = await Chat.posted(chat, msg.msg, new Blob([Buffer.from(String(msg.body), "base64")]));
        return Remote.write(sock, JSON.stringify({ ...out, $: "posted", id: msg.id }));
      }
      void Chat.answer(chat, view, line);
    });
  }

  // the view's end, in another illi: a link over the lock's socket at
  // `file`; gone: the chat's illi let it go (why: it refused this one, or
  // said nothing for `mute` ms; "": it quit, or its socket wasn't up),
  // and whether it had spoken
  export function link(file: string, hear: Link["hear"], gone: (why: string, heard: boolean) => void, mute = MUTE): Link {
    const sock  = net.connect(file);
    const posts = new Map<string, (out: Answer) => void>();
    let [why, heard, shut] = ["", false, false];
    const quiet = setTimeout(() => {
      why = "it doesn't answer (an older illi?)";
      sock.destroy();
    }, mute);
    sock.on("error", () => {});
    sock.on("close", () => {
      clearTimeout(quiet);
      posts.forEach((done) => done({ error: "The chat's illi quit before it took that." }));
      posts.clear();
      if (!shut) {
        gone(why, heard);
      }
    });
    Remote.write(sock, JSON.stringify({ $: "hello", v: VERSION }));
    const pipe: Pipe = {
      onmessage : null,
      send      : (text) => Remote.write(sock, text),
      close     : () => {
        shut = true;
        sock.end();
      },
    };
    Remote.lines(sock, (line) => {
      const msg = Remote.parse(line);
      if (!heard) {
        heard = true;
        clearTimeout(quiet);
      }
      if (msg?.$ === "posted") {
        const { $: _, id, ...out } = msg;
        posts.get(id)?.(out);
        return void posts.delete(id);
      }
      if (msg?.$ === "refused") {
        return void (why = "it is " + msg.why);
      }
      pipe.onmessage?.({ data: line });
    });
    const post = async (msg: object, body: Blob): Promise<Answer> => {
      const data = Buffer.from(await body.arrayBuffer()).toString("base64");
      return new Promise((done) => {
        if (sock.destroyed) {
          return done({ error: "The chat's illi quit before it took that." });
        }
        const id = crypto.randomUUID();
        posts.set(id, done);
        Remote.write(sock, JSON.stringify({ $: "post", id, msg, body: data }));
      });
    };
    return { open: () => pipe, post, hear };
  }

  // a socket's lines, each to `each` (a line not yet ended, kept)
  export function lines(sock: net.Socket, each: (line: string) => void): void {
    let rest = "";
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => {
      if (!chunk.includes("\n")) {
        rest += chunk;
        return;
      }
      const parts = (rest + chunk).split("\n");
      rest = parts.pop()!;
      parts.filter((line) => line !== "").forEach(each);
    });
  }

  // a line written, unless the socket is gone (or fell LAG behind: let
  // go)
  export function write(sock: net.Socket, line: string): void {
    if (sock.writableLength > LAG) {
      sock.destroy();
    }
    if (!sock.destroyed && sock.writable) {
      sock.write(line + "\n");
    }
  }

  // a line's JSON (null: not JSON, or not an object)
  export function parse(line: string): any {
    try {
      const msg = JSON.parse(line);
      return msg !== null && typeof msg === "object" ? msg : null;
    } catch {
      return null;
    }
  }

}
