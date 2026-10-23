// Run
// ===
// A shell command of the user's, run as illi's hooks (Hooks.ts) and its
// status line (Status.ts) run one: in sh, in a folder, more variables
// given, its input as text on its stdin; its exit code, output and
// errors back, each read up to a cap. It runs in its own process group,
// so its time limit (and a stop) ends all it started: asked to end, then
// killed a grace after. Once it ends, its output is waited for a settle
// at most (a job it left in the background may hold the pipe, and is left
// to run). One tracked is killed by Run.end as illi quits or runs again
// (an execve fires no exit, so that one calls it too); one not
// (SessionEnd's) outlives illi. One reaped has what it left running
// killed once its output is in (a command run again and again would
// pile its jobs up).

// Types
// =====

// a command's run: its exit code (null: it never ended of itself, why
// says why), its output and errors (read up to the cap)
export type Ran = { code: number | null; why: string; out: string; err: string };

// how a command runs: its folder, the variables over illi's own, its
// input, its time limit (ms), a stop; whether Run.end kills it (tracked:
// yes), the most of its output and errors read (cap: bytes; full: past
// it, killed, as one that never stops printing), the wait between asking
// it to end and killing it (grace), and for its output once it ended
// (settle) (ms); whether what it left running is killed then (reap)
export type Options = {
  cwd      : string;
  env      : Record<string, string>;
  input    : string;
  timeout  : number;
  signal?  : AbortSignal;
  tracked? : boolean;
  cap?     : number;
  full?    : boolean;
  grace?   : number;
  settle?  : number;
  reap?    : boolean;
};

// Constants
// =========

const CAP    = 64 * 1024;
const GRACE  = 2000;
const SETTLE = 1000;

// the process groups tracked, running
const RUNNING = new Set<number>();

// Run
// ===

export namespace Run {

  export async function run(command: string, o: Options): Promise<Ran> {
    const [cap, grace, settle] = [o.cap ?? CAP, o.grace ?? GRACE, o.settle ?? SETTLE];
    let proc: Bun.Subprocess<Blob, "pipe", "pipe">;
    try {
      proc = Bun.spawn(["/bin/sh", "-c", command], { cwd: o.cwd, env: { ...process.env, ...o.env }, stdin: new Blob([o.input]), stdout: "pipe", stderr: "pipe", detached: true });
    } catch (err: any) {
      return { code: null, why: "couldn't start (" + String(err?.message ?? err) + ")", out: "", err: "" };
    }
    if (o.tracked !== false) {
      RUNNING.add(proc.pid);
    }
    let why = "";
    const end = (said: string, now: boolean) => {
      why ||= said;
      group_kill(proc.pid, now ? "SIGKILL" : "SIGTERM");
      if (!now) {
        setTimeout(() => group_kill(proc.pid, "SIGKILL"), grace).unref();
      }
    };
    const timer = setTimeout(() => end("ran past its " + o.timeout / 1000 + " s", false), o.timeout);
    const stop = () => end("was stopped", true);
    o.signal?.addEventListener("abort", stop, { once: true });
    if (o.signal?.aborted) {
      stop();
    }
    const full = o.full === true ? () => end("gave more than " + Math.round(cap / 1024) + " KB", true) : () => {};
    const [out, err] = [capped(proc.stdout, cap, full), capped(proc.stderr, cap, () => {})];
    const code = await proc.exited;
    clearTimeout(timer);
    o.signal?.removeEventListener("abort", stop);
    RUNNING.delete(proc.pid);
    await Promise.race([Promise.all([out.done, err.done]), new Promise((done) => setTimeout(done, settle).unref())]);
    out.stop();
    err.stop();
    if (o.reap === true) {
      group_kill(proc.pid, "SIGKILL");
    }
    return { code: why === "" ? code : null, why, out: out.text(), err: err.text() };
  }

  // every command tracked still running killed, so none outlives illi:
  // as it quits, and before it runs again in its own place
  export function end(): void {
    RUNNING.forEach((pid) => group_kill(pid, "SIGKILL"));
    RUNNING.clear();
  }

}

// a stream read up to cap bytes (the rest read and dropped; full called
// once it is reached), its text once done; stop: its reading given up
function capped(stream: ReadableStream<Uint8Array>, cap: number, full: () => void): { text: () => string; done: Promise<void>; stop: () => void } {
  const parts: Uint8Array[] = [];
  let size = 0;
  const reader = stream.getReader();
  const done = (async () => {
    try {
      for (let got = await reader.read(); !got.done; got = await reader.read()) {
        if (size < cap) {
          parts.push(got.value.subarray(0, cap - size));
          size += Math.min(got.value.length, cap - size);
          if (size >= cap) {
            full();
          }
        }
      }
    } catch {
      // its pipe broke as it was killed, or the reading stopped
    }
  })();
  return { text: () => Buffer.concat(parts).toString("utf8"), done, stop: () => void reader.cancel().catch(() => {}) };
}

// a process group sent a signal (gone already: nothing)
function group_kill(pid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(-pid, sig);
  } catch {
    // ended
  }
}
