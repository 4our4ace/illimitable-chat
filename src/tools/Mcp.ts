// Mcp
// ===
// The user's MCP servers, their tools beside illi's own (Tools.ts), each
// named mcp__<server>__<tool> as the vendors take it, numbered if two
// come out alike (get.user and get_user: mcp__s__get_user_2), and called
// by that name at its server. The servers are the plugins' (each
// bundle's .mcp.json and its manifest's mcpServers: Bundle.ts), then
// the user's files (Mcp.files): config.MCPS (~/.illi/mcp.json, global;
// in a profile, its own mcp.json too) and, in a trusted folder, the
// project's .illi/mcp.json, each over the ones before by name (the
// user's over a plugin's); one named in the `off` setting is left out,
// a plugin's by plugin:name too. They are in the shape Claude Code's and
// Claude Desktop's take, so an entry copies over. A server is a command
// (stdio: a JSON-RPC message a line, each way) or a URL (Streamable
// HTTP: a POST each message, answered as JSON or as an event stream).
// `${VAR}` (or `${VAR:-default}`) in a server's fields is the variable's
// value: a plugin's own (CLAUDE_PLUGIN_ROOT, CLAUDE_PLUGIN_DATA and their
// ILLI_ spellings) first, given to its command's environment too.
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
// /mcp, a note (Term.ts) and the log, its tools gone; one whose tools change is listed
// again; each change is told (the side panel shows how each is: Term.ts).
// A call stopped is cancelled at its server; the servers end with illi.
// A project's servers (its mcp.json, its plugins') are programs, so they
// run only in a folder the user trusts (Trusted.ts), and its mcp.json new
// or changed is said once at the start (Seen.ts).

import * as fs from "node:fs";
import * as path from "node:path";
import type { Out } from "../ai/Agent.ts";
import { clip, stream_events, stream_lines } from "./Clip.ts";
import { Bundle } from "../config/Bundle.ts";
import * as config from "../config/Config.ts";
import { Plugins } from "../config/Plugins.ts";
import { Seen } from "../config/Seen.ts";
import { Trusted } from "../config/Trusted.ts";
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

// a server as found: as its file says, that file (a plugin's .mcp.json
// or manifest), its plugin (null: the user's own) and what its fields
// are filled from before the environment (its plugin's: Bundle.vars)
export type Found = { def: Def; file: string; plugin: string | null; vars: Record<string, string> };

// the way to a server: a request (its result; its error thrown), a
// notification, its end (answered once its process is gone)
type Link = {
  ask   : (method: string, params: object, signal?: AbortSignal) => Promise<any>;
  tell  : (method: string, params: object) => void;
  close : () => Promise<unknown> | void;
};

// a server: its name, where it is from (its file, its plugin: Found),
// how it is (why: what failed), its tools as illi names them, each one's
// name at the server, its link
export type Server = {
  name   : string;
  file   : string;
  plugin : string | null;
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

// each file that won't read, why; the servers' start, settled; what a
// server's change (started, failed, its tools listed) calls
const TROUBLES = new Map<string, string>();

let started: Promise<void> = Promise.resolve();
let told    = () => {};

export namespace Mcp {

  // starts the servers, in the background, each change told; the
  // project's mcp.json new or changed since illi last started here said
  export function start(cwd: string, change: () => void = () => {}): void {
    told = change;
    const found = Object.entries(Mcp.read(cwd));
    const runs = found.filter(([, f]) => f.def.disabled !== true).map(([name, f]) => Mcp.open(name, f, cwd));
    started = Promise.race([Promise.all(runs).then(() => {}), Bun.sleep(SETTLE)]);
    const project = path.join(cwd, ".illi", "mcp.json");
    const n = found.filter(([, f]) => f.file === project).length;
    if (n > 0 && Seen.changed("mcp " + project, [project])) {
      Plugins.say("This project's " + config.config_home(project) + " is new or changed since illi last started here: its " + (n === 1 ? "MCP server runs" : n + " MCP servers run") + " as you work (/mcp lists them).");
    }
  }

  // once the servers starting have answered or failed (at most SETTLE)
  export function settle(): Promise<void> {
    return started;
  }

  // the user's files of servers: config.MCPS, then a trusted project's
  // .illi/mcp.json
  export function files(cwd: string): string[] {
    return [...config.MCPS, ...(Trusted.has(Trusted.folder(cwd)) ? [path.join(cwd, ".illi", "mcp.json")] : [])];
  }

  // the servers by name: the plugins' (Plugins.bundles), then those in
  // the user's files, each over one before of its name; but those turned
  // off, by name or a plugin's by plugin:name (all: those too)
  export function read(cwd: string, all = false): Record<string, Found> {
    const found: Record<string, Found> = {};
    for (const b of Plugins.bundles().filter((b) => b.mcp.length > 0)) {
      const vars = Bundle.vars(b);
      for (const source of b.mcp) {
        for (const [name, def] of Object.entries(source.data !== undefined ? mcp_servers(source.file, source.data, true) : Mcp.file(source.file, true))) {
          found[name] = { def, file: source.file, plugin: b.name, vars };
        }
      }
    }
    for (const file of Mcp.files(cwd)) {
      for (const [name, def] of Object.entries(Mcp.file(file))) {
        found[name] = { def, file, plugin: null, vars: {} };
      }
    }
    return Object.fromEntries(Object.entries(found).filter(([name, f]) => all || !(config.config_off(name) || (f.plugin !== null && config.config_off(f.plugin + ":" + name)))));
  }

  // the servers in a file, by name (bare: a plugin's, its mcpServers
  // wrapper optional); one that won't read kept as trouble (status) and
  // logged
  export function file(file: string, bare = false): Record<string, Def> {
    if (!fs.existsSync(file)) {
      TROUBLES.delete(file);
      return {};
    }
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err: any) {
      return mcp_trouble(file, String(err?.message ?? err));
    }
    return mcp_servers(file, data, bare);
  }

  // a server started: its link, its start, its tools; or why it failed
  export async function open(name: string, found: Found, cwd: string): Promise<void> {
    const { def, vars } = found;
    const server: Server = { name, file: found.file, plugin: found.plugin, state: "starting", why: "", tools: [], own: new Map(), link: null };
    SERVERS.set(name, server);
    try {
      server.link = def.url !== undefined ? Mcp.http(def, vars) : Mcp.stdio(server, def, cwd, vars);
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

  // a server's tools, all its pages, named as illi names them, apart from
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

  // each server: how it is, its tools' count, why it failed; each file
  // that won't read, why; where the user's go (none there yet: config.MCPS)
  export function status(): { servers: Server[]; troubles: string[]; files: string[] } {
    return { servers: [...SERVERS.values()], troubles: [...TROUBLES].map(([file, why]) => config.config_home(file) + ": " + why), files: config.MCPS };
  }

  // ends every server; answers once each command's process is gone
  export function stop(): Promise<void> {
    return Promise.all([...SERVERS.values()].map((s) => s.link?.close())).then(() => {});
  }

  // Transports
  // ----------

  // a command's server (its plugin's variables in its environment): a
  // message a line on its stdin and stdout; its stderr to the log; its
  // own requests answered (Mcp.serve); its end fails it
  export function stdio(server: Server, def: Def, cwd: string, vars: Record<string, string> = {}): Link {
    const env  = { ...process.env, ...vars, ...Object.fromEntries(Object.entries(def.env ?? {}).map(([k, v]) => [k, Mcp.expand(String(v), vars)])) };
    const proc = Bun.spawn([Mcp.expand(def.command ?? "", vars), ...(def.args ?? []).map((a) => Mcp.expand(String(a), vars))], {
      cwd: def.cwd === undefined ? cwd : Mcp.expand(def.cwd, vars), env, stdin: "pipe", stdout: "pipe", stderr: "pipe",
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
  export function http(def: Def, vars: Record<string, string> = {}): Link {
    const url     = Mcp.expand(def.url ?? "", vars);
    const headers = Object.fromEntries(Object.entries(def.headers ?? {}).map(([k, v]) => [k, Mcp.expand(String(v), vars)]));
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
    for await (const data of stream_events(res.body!)) {
      const msg = JSON.parse(data);
      if (msg?.id === id && (msg.result !== undefined || msg.error !== undefined)) {
        return msg;
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
      default           : return { error: { code: -32601, message: "illi doesn't do " + method } };
    }
  }

  // ${VAR} and ${VAR:-default}, the variables' values (those given
  // first, then the environment's)
  export function expand(text: string, vars: Record<string, string> = {}): string {
    return text.replace(/\$\{(\w+)(?::-([^}]*))?\}/g, (_, name: string, def?: string) => vars[name] ?? process.env[name] ?? def ?? "");
  }

  // each line a stream's bytes make, as it comes (blank ones left out)
  export async function lines(stream: ReadableStream<Uint8Array>, on: (line: string) => void): Promise<void> {
    for await (const batch of stream_lines(stream)) {
      batch.filter((l) => l.trim() !== "").forEach(on);
    }
  }

}

// a file's servers, from what it holds (bare: as a plugin's may, the
// servers with no mcpServers wrapper); what isn't servers kept as
// trouble (status)
function mcp_servers(file: string, data: any, bare: boolean): Record<string, Def> {
  const got = typeof data === "object" && data !== null && "mcpServers" in data ? data.mcpServers : bare ? data : {};
  if (typeof got !== "object" || got === null || Array.isArray(got)) {
    return mcp_trouble(file, "its mcpServers isn't an object");
  }
  const servers = Object.entries(got).filter(([, def]) => typeof def === "object" && def !== null && !Array.isArray(def));
  if (servers.length < Object.keys(got).length) {
    return mcp_trouble(file, "a server in it isn't an object");
  }
  TROUBLES.delete(file);
  return Object.fromEntries(servers) as Record<string, Def>;
}

// a file that won't read, kept as trouble and logged (once a why): none
// of its servers
function mcp_trouble(file: string, why: string): Record<string, Def> {
  if (TROUBLES.get(file) !== why) {
    console.error("illi: mcp " + file + ": " + why);
  }
  TROUBLES.set(file, why);
  return {};
}
