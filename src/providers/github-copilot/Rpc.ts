// Rpc
// ===
// A connection to GitHub's Copilot CLI as its SDK runs it (`copilot
// --headless --stdio`), illi its client: JSON-RPC 2.0 on the CLI's stdin
// and stdout, each message after a Content-Length header (the framing of
// the language server protocol, which the SDK's connection speaks). A
// call waits for its answer (an error's message thrown, its code and data
// kept on the error); what the CLI asks of illi and tells it (a session's
// events) go to `heard`. The CLI ending fails every call waiting, saying
// why: one that ended before it told anything didn't start, said with its
// exit code and the last line it wrote to stderr (a library it lacks, a
// folder it may not run from), as the CLI is named. A stop asks it to end
// (SIGTERM), then ends it (SIGKILL) past KILL, its end to wait for.
// Closing its input ends it too, as it does when illi ends however it
// ends.

import type { Subprocess } from "bun";

// Types
// =====

// a message the CLI sent that answers none of illi's: a notification, or
// a request of its own (with its id, to answer)
export type Heard = { method: string; params: any; id?: number | string };

// a connection: the CLI's process and what its sentences call it, the
// calls waiting for their answers, whether it told anything yet, whether
// it ended and why, its exit code where it ended by itself (null: it
// runs, or illi ended it), the last of what it wrote to stderr, its end
// (the process gone, every call waiting failed)
export type Conn = {
  proc   : Subprocess<"pipe", "pipe", "pipe">;
  name   : string;
  next   : number;
  waits  : Map<number, { done: (result: any) => void; fail: (err: Error) => void }>;
  began  : boolean;
  ended  : boolean;
  why    : string;
  code   : number | null;
  tail   : string;
  exited : Promise<void>;
};

// Constants
// =========

// how long a stop waits for the CLI to end before killing it (ms)
const KILL = 3e3;

// how much of what the CLI wrote to stderr is kept, to say why it ended,
// and how much of its last line is said
const TAIL = 4096;
const LAST = 300;

// how long a write the CLI's input refused waits for the CLI's end, which
// says why (ms): then the closed input is all there is to say
const SHUT = 2e3;

// the end of a message's header, and its length in it
const BREAK  = Buffer.from("\r\n\r\n");
const LENGTH = /^content-length:\s*(\d+)\s*$/im;

// Rpc
// ===

export namespace Rpc {

  // the CLI started, named as its sentences call it (thrown at once: it
  // isn't there); `heard` gets what it asks and tells. Its end, unless
  // illi asked for it (stop), is said with its exit code (gone)
  export function start(name: string, cmd: string[], cwd: string, env: Record<string, string>, heard: (conn: Conn, m: Heard) => void): Conn {
    const proc = Bun.spawn(cmd, { cwd, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    const conn: Conn = { proc, name, next: 0, waits: new Map(), began: false, ended: false, why: "", code: null, tail: "", exited: Promise.resolve() };
    const out = Rpc.each(proc.stdout, (() => {
      let buf: Buffer = Buffer.alloc(0);
      return (chunk: Uint8Array) => void (buf = Rpc.take(Buffer.concat([buf, chunk]), (body) => Rpc.read(conn, body, heard)));
    })());
    const text = new TextDecoder();
    const err = Rpc.each(proc.stderr, (chunk) => void (conn.tail = (conn.tail + text.decode(chunk, { stream: true })).slice(-TAIL)));
    conn.exited = (async () => {
      const code = await proc.exited;
      await Promise.race([Promise.all([out, err]), Bun.sleep(500)]);
      if (conn.why === "") {
        conn.code = code;
      }
      Rpc.end(conn, Rpc.gone(conn, code));
    })();
    return conn;
  }

  // why a CLI that ended by itself did: one that told nothing didn't
  // start, said by its name with the last line it wrote to stderr; one
  // that had, it ended
  export function gone(conn: Conn, code: number): string {
    if (conn.began) {
      return "it ended (exit code " + code + ")";
    }
    const last = conn.tail.split("\n").map((l) => l.trim()).filter((l) => l !== "").at(-1);
    return conn.name + " didn't start (exit " + code + ")" + (last === undefined ? "" : ": " + last.slice(0, LAST));
  }

  // each chunk of a stream as it comes, till it ends (never thrown)
  export async function each(from: ReadableStream<Uint8Array>, got: (chunk: Uint8Array) => void): Promise<void> {
    const reader = from.getReader();
    try {
      for (let r = await reader.read(); !r.done; r = await reader.read()) {
        got(r.value);
      }
    } catch {}
  }

  // what came so far: each whole message's body given to `got`, what's
  // left of the next one kept (a header without its length: dropped)
  export function take(buf: Buffer, got: (body: string) => void): Buffer {
    for (;;) {
      const at = buf.indexOf(BREAK);
      if (at < 0) {
        return buf;
      }
      const size = LENGTH.exec(buf.subarray(0, at).toString("latin1"));
      if (size === null) {
        buf = buf.subarray(at + BREAK.length);
        continue;
      }
      const end = at + BREAK.length + Number(size[1]);
      if (buf.length < end) {
        return buf;
      }
      got(buf.subarray(at + BREAK.length, end).toString("utf8"));
      buf = buf.subarray(end);
    }
  }

  // a message from the CLI: an answer to a call of illi's, else heard
  export function read(conn: Conn, body: string, heard: (conn: Conn, m: Heard) => void): void {
    let m: any;
    try {
      m = JSON.parse(body);
    } catch {
      return;
    }
    if (m === null || typeof m !== "object") {
      return;
    }
    conn.began = true;
    if (typeof m.method === "string") {
      heard(conn, { method: m.method, params: m.params ?? {}, ...(m.id !== undefined ? { id: m.id } : {}) });
      return;
    }
    const wait = conn.waits.get(m.id);
    if (wait === undefined) {
      return;
    }
    conn.waits.delete(m.id);
    if (m.error !== undefined) {
      const err = new Error(String(m.error?.message ?? "the CLI refused"));
      Object.assign(err, { code: m.error?.code, data: m.error?.data });
      wait.fail(err);
    } else {
      wait.done(m.result ?? null);
    }
  }

  // a call, its answer waited for (ms: given up past it, 0: never); thrown:
  // the CLI's error, or it ended
  export function call(conn: Conn, method: string, params: unknown, ms = 0): Promise<any> {
    if (conn.ended) {
      return Promise.reject(new Error(conn.why));
    }
    const id = ++conn.next;
    return new Promise((done, fail) => {
      let late: Timer | undefined;
      conn.waits.set(id, {
        done: (result) => (clearTimeout(late), done(result)),
        fail: (err) => (clearTimeout(late), fail(err)),
      });
      if (ms > 0) {
        late = setTimeout(() => {
          conn.waits.delete(id);
          fail(new Error("it didn't answer " + method + " in " + Math.round(ms / 1000) + " seconds"));
        }, ms);
      }
      Rpc.write(conn, { jsonrpc: "2.0", id, method, params });
    });
  }

  // a request of the CLI's answered, or refused
  export function answer(conn: Conn, id: number | string, result: unknown): void {
    Rpc.write(conn, { jsonrpc: "2.0", id, result });
  }

  export function refuse(conn: Conn, id: number | string, message: string): void {
    Rpc.write(conn, { jsonrpc: "2.0", id, error: { code: -32601, message } });
  }

  // a message to the CLI, after its header (none once it ended). An
  // input that won't take it is a CLI ending: its end says why (its exit
  // code, what it wrote), waited for SHUT before the closed input is all
  // that's said
  export function write(conn: Conn, msg: unknown): void {
    if (conn.ended) {
      return;
    }
    const body = Buffer.from(JSON.stringify(msg), "utf8");
    try {
      conn.proc.stdin.write("Content-Length: " + body.length + "\r\n\r\n");
      conn.proc.stdin.write(body);
      conn.proc.stdin.flush();
    } catch {
      void Promise.race([conn.exited, Bun.sleep(SHUT)]).then(() => Rpc.end(conn, "its input closed"));
    }
  }

  // the CLI asked to end, then ended past KILL; why, as calls waiting
  // are told. Its end, a little past KILL at most, for one who waits on
  // it (`illi uninstall`, before it removes the CLI's folder)
  export function stop(conn: Conn, why: string): Promise<void> {
    if (!conn.ended) {
      conn.why ||= why;
      conn.proc.kill("SIGTERM");
      setTimeout(() => conn.proc.kill("SIGKILL"), KILL).unref();
    }
    return conn.exited;
  }

  // the connection ended: every call waiting fails, saying why
  export function end(conn: Conn, why: string): void {
    if (conn.ended) {
      return;
    }
    conn.ended = true;
    conn.why ||= why;
    const waits = [...conn.waits.values()];
    conn.waits.clear();
    waits.forEach((w) => w.fail(new Error(conn.why)));
    try {
      conn.proc.stdin.end();
    } catch {}
  }

}
