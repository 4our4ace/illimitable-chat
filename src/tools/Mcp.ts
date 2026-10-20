// Mcp
// ===
// The user's MCP servers, their tools beside Illi's own (Tools.ts), each
// named mcp__<server>__<tool> as the vendors take it, numbered if two
// come out alike (get.user and get_user: mcp__s__get_user_2), and called
// by that name at its server. The servers are in config.MCP
// (~/.illi/mcp.json), in the shape Claude Code's and Claude Desktop's
// take, so an entry copies over. A server is a command (stdio: a JSON-RPC
// message a line, each way) or a URL (Streamable HTTP: a POST each
// message, answered as JSON or as an event stream). `${VAR}` (or
// `${VAR:-default}`) in a server's fields is the variable's value.
//
//     { "mcpServers": {
//         "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"],
//                     "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" } },
//         "docs":   { "type": "http", "url": "https://example.com/mcp",
//                     "headers": { "Authorization": "Bearer ${DOCS_TOKEN}" } } } }
//
// All start with illi, in the background, in the working dir; the tools
// listed wait till each has answered or failed (at most SETTLE), so a
// message sent at once still gets them. A server that fails is told in
// /mcp and the log, its tools gone; one whose tools change is listed
// again; each change is told (the side panel shows how each is: Term.ts).
// A call stopped is cancelled at its server; the servers end with illi.
// The project's own servers are never read: a server is a program, and a
// repository's would run on opening it.

import * as fs from "node:fs";
import type { Out } from "../ai/Agent.ts";
import { clip } from "./Clip.ts";
import * as config from "../config/Config.ts";
import type { Spec } from "./Machine.ts";

// Types
// =====

// a server as the file says: a command (its args, env, dir), or a URL
// (its headers); disabled: not started
type Def = {
  command?  : string;
  args?     : string[];
  env?      : Record<string, string>;
  cwd?      : string;
  type?     : string;
  url?      : string;
  headers?  : Record<string, string>;
  disabled? : boolean;
};

// the way to a server: a request (its result; its error thrown), a
// notification, its end (answered once its process is gone)
type Link = {
  ask   : (method: string, params: object, signal?: AbortSignal) => Promise<any>;
  tell  : (method: string, params: object) => void;
  close : () => Promise<unknown> | void;
};

// a server: its name, how it is (why: what failed), its tools as Illi
// names them, each one's name at the server, its link
export type Server = {
  name  : string;
  state : "starting" | "ready" | "failed";
  why   : string;
  tools : Spec[];
  own   : Map<string, string>;
  link  : Link | null;
};

// Constants
// =========

// the protocol asked for
const VERSION = "2025-06-18";

// how long a server may take to answer its start; how long the tools
// listed wait for the servers starting (ms)
const START  = 30000;
const SETTLE = 15000;

// the longest tool name the vendors take, and what a name may hold
const LONGEST = 64;
const NAMED   = /[^A-Za-z0-9_-]/g;

// Mcp
// ===

const SERVERS = new Map<string, Server>();

// the servers' start, settled; what was wrong with the file ("": none);
// what a server's change (started, failed, its tools listed) calls
let started: Promise<void> = Promise.resolve();
let trouble = "";
let told    = () => {};

export namespace Mcp {

  // starts the user's servers, in the background, each change told
  export function start(cwd: string, change: () => void = () => {}): void {
    told = change;
    const runs = Object.entries(Mcp.read()).filter(([, def]) => def.disabled !== true).map(([name, def]) => Mcp.open(name, def, cwd));
    started = Promise.race([Promise.all(runs).then(() => {}), Bun.sleep(SETTLE)]);
  }

  // once the servers starting have answered or failed (at most SETTLE)
  export function settle(): Promise<void> {
    return started;
  }

  // the servers in the file, by name; a file that won't read is told
  export function read(): Record<string, Def> {
    if (!fs.existsSync(config.MCP)) {
      return {};
    }
    try {
      const file = JSON.parse(fs.readFileSync(config.MCP, "utf8"));
      return file.mcpServers ?? {};
    } catch (err: any) {
      trouble = config.MCP + ": " + err.message;
      console.error("illi: mcp " + trouble);
      return {};
    }
  }

  // a server started: its link, its start, its tools; or why it failed
  export async function open(name: string, def: Def, cwd: string): Promise<void> {
    const server: Server = { name, state: "starting", why: "", tools: [], own: new Map(), link: null };
    SERVERS.set(name, server);
    try {
      server.link = def.url !== undefined ? Mcp.http(def) : Mcp.stdio(server, def, cwd);
      const hello = { protocolVersion: VERSION, capabilities: { roots: { listChanged: false } }, clientInfo: { name: "illi", version: "1" } };
      await server.link.ask("initialize", hello, AbortSignal.timeout(START));
      server.link.tell("notifications/initialized", {});
      await Mcp.list(server);
      server.state = server.state === "failed" ? "failed" : "ready";
      told();
    } catch (err: any) {
      Mcp.fail(server, err?.name === "TimeoutError" ? "no answer in " + START / 1000 + " s" : String(err?.message ?? err));
    }
  }

  // a server's tools, all its pages, named as Illi names them, apart from
  // the other servers' tools and each other
  export async function list(server: Server): Promise<void> {
    const got: any[] = [];
    let cursor: string | undefined;
    do {
      const page = await server.link!.ask("tools/list", cursor === undefined ? {} : { cursor });
      got.push(...(page?.tools ?? []));
      cursor = page?.nextCursor;
    } while (cursor !== undefined && cursor !== null);
    const own = new Map<string, string>();
    const taken = new Set([...SERVERS.values()].filter((s) => s !== server).flatMap((s) => [...s.own.keys()]));
    server.tools = got.map((t) => {
      const name = Mcp.name(server.name, String(t.name), taken);
      taken.add(name);
      own.set(name, String(t.name));
      return { name, info: "(" + server.name + ") " + (t.description ?? t.title ?? ""), schema: Mcp.schema(t.inputSchema) };
    });
    server.own = own;
    told();
  }

  // a tool's name for the vendors: mcp__server__tool, what they take
  // only, LONGEST at most; one taken already numbered (_2, _3...)
  export function name(server: string, tool: string, taken: Set<string> = new Set()): string {
    const base = ("mcp__" + server.replace(NAMED, "_") + "__" + tool.replace(NAMED, "_")).slice(0, LONGEST);
    let name = base;
    for (let n = 2; taken.has(name); n++) {
      name = base.slice(0, LONGEST - String(n).length - 1) + "_" + n;
    }
    return name;
  }

  // a tool's input schema as the vendors take it: an object, no $schema
  export function schema(given: any): object {
    const { $schema, ...rest } = given !== null && typeof given === "object" ? given : {};
    return { type: "object", properties: {}, ...rest };
  }

  export function fail(server: Server, why: string): void {
    server.state = "failed";
    server.why   = why;
    server.tools = [];
    server.own   = new Map();
    server.link?.close();
    console.error("illi: mcp " + server.name + ": " + why);
    told();
  }

  // the tools of the servers ready, by server name
  export function tools(): Spec[] {
    return [...SERVERS.values()].filter((s) => s.state === "ready").sort((a, b) => a.name.localeCompare(b.name)).flatMap((s) => s.tools);
  }

  // a tool called at its server: its text (clipped as a command's output
  // is: head and tail), its images, whether it failed
  export async function call(name: string, args: unknown, signal: AbortSignal): Promise<Out> {
    const server = [...SERVERS.values()].find((s) => s.state === "ready" && s.own.has(name));
    if (server === undefined) {
      return { text: "No tool " + name + ": its server isn't ready (/mcp).", fail: true };
    }
    try {
      const res = await server.link!.ask("tools/call", { name: server.own.get(name), arguments: args ?? {} }, signal);
      return Mcp.out(res);
    } catch (err: any) {
      return { text: server.name + ": " + String(err?.message ?? err), fail: true };
    }
  }

  // a call's result: its text parts (a resource's text, a link's URI), its
  // structured content if no text, its images
  export function out(res: any): Out {
    const parts: any[] = Array.isArray(res?.content) ? res.content : [];
    const text = parts.map((p) => {
      switch (p.type) {
        case "text"          : return String(p.text ?? "");
        case "resource"      : return p.resource?.text ?? "[resource " + (p.resource?.uri ?? "") + "]";
        case "resource_link" : return "[" + (p.name ?? "resource") + ": " + p.uri + "]";
        case "audio"         : return "[audio]";
        default              : return "";
      }
    }).filter((x) => x !== "").join("\n");
    const imgs = parts.filter((p) => p.type === "image").map((p) => ({ type: String(p.mimeType), data: String(p.data) }));
    const all  = text === "" && res?.structuredContent !== undefined ? JSON.stringify(res.structuredContent) : text;
    const kept = clip();
    kept.add(all);
    return { text: kept.text(), fail: res?.isError === true, imgs };
  }

  // each server: how it is, its tools' count, why it failed; what was
  // wrong with the file
  export function status(): { servers: Server[]; trouble: string; file: string } {
    return { servers: [...SERVERS.values()], trouble, file: config.MCP };
  }

  // ends every server; answers once each command's process is gone
  export function stop(): Promise<void> {
    return Promise.all([...SERVERS.values()].map((s) => s.link?.close())).then(() => {});
  }

  // Transports
  // ----------

  // a command's server: a message a line on its stdin and stdout; its
  // stderr to the log; its own requests answered (Mcp.serve); its end
  // fails it
  export function stdio(server: Server, def: Def, cwd: string): Link {
    const env  = { ...process.env, ...Object.fromEntries(Object.entries(def.env ?? {}).map(([k, v]) => [k, Mcp.expand(String(v))])) };
    const proc = Bun.spawn([Mcp.expand(def.command ?? ""), ...(def.args ?? []).map((a) => Mcp.expand(String(a)))], {
      cwd: def.cwd === undefined ? cwd : Mcp.expand(def.cwd), env, stdin: "pipe", stdout: "pipe", stderr: "pipe",
    });
    const wait = new Map<number, (msg: any) => void>();
    let id   = 0;
    let said = "";
    const send = (msg: object) => {
      try {
        proc.stdin.write(JSON.stringify(msg) + "\n");
        proc.stdin.flush();
      } catch {
        // gone: its end fails it
      }
    };
    const hear = (msg: any) => {
      if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
        wait.get(msg.id)?.(msg);
        wait.delete(msg.id);
      } else if (msg.method === "notifications/tools/list_changed") {
        Mcp.list(server).catch((err) => console.error("illi: mcp " + server.name + ": " + err.message));
      } else if (msg.id !== undefined && typeof msg.method === "string") {
        send({ jsonrpc: "2.0", id: msg.id, ...Mcp.serve(msg.method, cwd) });
      }
    };
    Mcp.lines(proc.stdout, (line) => {
      try {
        hear(JSON.parse(line));
      } catch {
        // not a message: a server's stray print
      }
    });
    Mcp.lines(proc.stderr, (line) => {
      said = line;
      console.error("mcp " + server.name + ": " + line);
    });
    proc.exited.then((code) => {
      const why = "exited (code " + code + ")" + (said === "" ? "" : ": " + said);
      wait.forEach((done) => done({ error: { message: why } }));
      wait.clear();
      if (server.state !== "failed") {
        Mcp.fail(server, why);
      }
    });
    return {
      ask: (method, params, signal) => new Promise((ok, no) => {
        const n = ++id;
        const stop = () => {
          wait.delete(n);
          if (method !== "initialize") {
            send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: n, reason: "stopped" } });
          }
          no(signal?.reason ?? new Error("stopped"));
        };
        if (signal?.aborted) {
          return stop();
        }
        signal?.addEventListener("abort", stop, { once: true });
        wait.set(n, (msg) => {
          signal?.removeEventListener("abort", stop);
          return msg.error !== undefined ? no(new Error(String(msg.error.message))) : ok(msg.result);
        });
        send({ jsonrpc: "2.0", id: n, method, params });
      }),
      tell  : (method, params) => send({ jsonrpc: "2.0", method, params }),
      close : () => {
        proc.kill();
        return proc.exited;
      },
    };
  }

  // a URL's server: each message POSTed (its session's id and protocol
  // version once known), its answer JSON or an event stream; a request
  // stopped is told cancelled
  export function http(def: Def): Link {
    const url     = Mcp.expand(def.url ?? "");
    const headers = Object.fromEntries(Object.entries(def.headers ?? {}).map(([k, v]) => [k, Mcp.expand(String(v))]));
    let session: string | null = null;
    let version: string | null = null;
    let id = 0;
    const post = async (msg: any, signal?: AbortSignal): Promise<any> => {
      const head = { ...headers, "content-type": "application/json", accept: "application/json, text/event-stream" };
      const res  = await fetch(url, {
        method  : "POST",
        headers : { ...head, ...(session === null ? {} : { "mcp-session-id": session }), ...(version === null ? {} : { "mcp-protocol-version": version }) },
        body    : JSON.stringify(msg),
        signal,
      });
      session = res.headers.get("mcp-session-id") ?? session;
      if (msg.id === undefined) {
        await res.body?.cancel();
        return null;
      }
      if (!res.ok) {
        throw new Error("HTTP " + res.status + " " + (await res.text()).slice(0, 200).trim());
      }
      const reply = (res.headers.get("content-type") ?? "").includes("text/event-stream") ? await Mcp.events(res, msg.id) : await res.json();
      if (reply?.error !== undefined) {
        throw new Error(String(reply.error.message));
      }
      return reply?.result;
    };
    const tell = (method: string, params: object) => void post({ jsonrpc: "2.0", method, params }).catch(() => {});
    return {
      ask: async (method, params, signal) => {
        const n = ++id;
        signal?.addEventListener("abort", () => method !== "initialize" && tell("notifications/cancelled", { requestId: n, reason: "stopped" }), { once: true });
        const result = await post({ jsonrpc: "2.0", id: n, method, params }, signal);
        version = method === "initialize" ? String(result?.protocolVersion ?? VERSION) : version;
        return result;
      },
      tell,
      close : () => {},
    };
  }

  // the answer to request id in an event stream: each event's data lines,
  // joined, a message
  export async function events(res: Response, id: number): Promise<any> {
    const dec = new TextDecoder();
    let rest  = "";
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      rest += dec.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
      for (let at = rest.indexOf("\n\n"); at >= 0; at = rest.indexOf("\n\n")) {
        const data = rest.slice(0, at).split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
        rest = rest.slice(at + 2);
        const msg = data === "" ? null : JSON.parse(data);
        if (msg?.id === id && (msg.result !== undefined || msg.error !== undefined)) {
          await res.body?.cancel().catch(() => {});
          return msg;
        }
      }
    }
    throw new Error("its answer never came");
  }

  // a server's own request answered: ping, and the roots (the working
  // dir); no other
  export function serve(method: string, cwd: string): object {
    switch (method) {
      case "ping"       : return { result: {} };
      case "roots/list" : return { result: { roots: [{ uri: "file://" + cwd, name: "working dir" }] } };
      default           : return { error: { code: -32601, message: "illi does no " + method } };
    }
  }

  // ${VAR} and ${VAR:-default}, the variables' values
  export function expand(text: string): string {
    return text.replace(/\$\{(\w+)(?::-([^}]*))?\}/g, (_, name: string, def?: string) => process.env[name] ?? def ?? "");
  }

  // each line a stream's bytes make, as it comes
  export async function lines(stream: ReadableStream<Uint8Array>, on: (line: string) => void): Promise<void> {
    const dec = new TextDecoder();
    let rest  = "";
    for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
      rest += dec.decode(chunk, { stream: true });
      const parts = rest.split("\n");
      rest = parts.pop() ?? "";
      parts.filter((l) => l.trim() !== "").forEach(on);
    }
  }

}
