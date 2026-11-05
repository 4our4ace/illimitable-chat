// Acp
// ===
// A connection to an agent that speaks the Agent Client Protocol
// (agentclientprotocol.com), as illi is its client: JSON-RPC 2.0, one
// message a line, on the agent's stdin and stdout. A call waits for its
// answer (an error's message thrown, its code and data kept on the
// error); what the agent asks of illi (a permission) and tells it (a
// session's updates) go to `heard`, each line it writes to stderr to
// `said`. The agent ending fails every call waiting, saying why; a stop
// asks it to end (SIGTERM), then ends it (SIGKILL) past KILL. Closing its
// input ends it too, as it does when illi ends however it ends.

import type { Subprocess } from "bun";
import { AskAI } from "../../ai/AskAI.ts";

// Types
// =====

// a message the agent sent that answers none of illi's: a notification,
// or a request of its own (with its id, to answer)
export type Heard = { method: string; params: any; id?: number | string };

// a connection: the agent's process, the calls waiting for their
// answers, whether it ended and why, the last of what it wrote to stderr
export type Conn = {
  proc   : Subprocess<"pipe", "pipe", "pipe">;
  next   : number;
  waits  : Map<number, { done: (result: any) => void; fail: (err: Error) => void }>;
  ended  : boolean;
  why    : string;
  tail   : string;
  exited : Promise<void>;
};

// Constants
// =========

// how long a stop waits for the agent to end before killing it (ms)
const KILL = 3e3;

// how much of what the agent wrote to stderr is kept, to say why it ended
const TAIL = 4096;

// Acp
// ===

export namespace Acp {

  // the agent started (thrown at once: it isn't there); `heard` gets what
  // it asks and tells, `said` each line of its stderr
  export function start(cmd: string[], cwd: string, env: Record<string, string>, heard: (conn: Conn, m: Heard) => void, said: (conn: Conn, line: string) => void): Conn {
    const proc = Bun.spawn(cmd, { cwd, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    const conn: Conn = { proc, next: 0, waits: new Map(), ended: false, why: "", tail: "", exited: Promise.resolve() };
    const out = (async () => {
      try {
        for await (const line of AskAI.lines(proc.stdout)) {
          Acp.read(conn, line, heard);
        }
      } catch {}
    })();
    const err = (async () => {
      try {
        for await (const line of AskAI.lines(proc.stderr)) {
          conn.tail = (conn.tail + line + "\n").slice(-TAIL);
          said(conn, line);
        }
      } catch {}
    })();
    conn.exited = (async () => {
      const code = await proc.exited;
      await Promise.race([Promise.all([out, err]), Bun.sleep(500)]);
      Acp.end(conn, conn.why || "it ended (exit code " + code + ")");
    })();
    return conn;
  }

  // a line from the agent: an answer to a call of illi's, else heard
  export function read(conn: Conn, line: string, heard: (conn: Conn, m: Heard) => void): void {
    let m: any;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    if (m === null || typeof m !== "object") {
      return;
    }
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
      const err = new Error(String(m.error?.data?.message ?? m.error?.message ?? "the agent refused"));
      Object.assign(err, { code: m.error?.code, data: m.error?.data });
      wait.fail(err);
    } else {
      wait.done(m.result ?? {});
    }
  }

  // a call, its answer waited for (ms: given up past it, 0: never); thrown:
  // the agent's error, or it ended
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
      Acp.write(conn, { jsonrpc: "2.0", id, method, params });
    });
  }

  // a notification (no answer)
  export function notify(conn: Conn, method: string, params: unknown): void {
    Acp.write(conn, { jsonrpc: "2.0", method, params });
  }

  // a request of the agent's answered, or refused
  export function answer(conn: Conn, id: number | string, result: unknown): void {
    Acp.write(conn, { jsonrpc: "2.0", id, result });
  }

  export function refuse(conn: Conn, id: number | string, message: string): void {
    Acp.write(conn, { jsonrpc: "2.0", id, error: { code: -32601, message } });
  }

  // a message to the agent (none once it ended)
  export function write(conn: Conn, msg: unknown): void {
    if (conn.ended) {
      return;
    }
    try {
      conn.proc.stdin.write(JSON.stringify(msg) + "\n");
      conn.proc.stdin.flush();
    } catch {
      Acp.end(conn, "its input closed");
    }
  }

  // the agent asked to end, then ended past KILL; why, as calls waiting
  // are told
  export function stop(conn: Conn, why: string): void {
    if (!conn.ended) {
      conn.why ||= why;
      conn.proc.kill("SIGTERM");
      setTimeout(() => conn.proc.kill("SIGKILL"), KILL).unref();
    }
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
