// Machine
// =======
// The tools that touch this computer: shell, read, write, edit (TOOLS),
// run as Jobs (Tools.ts), each in its agent's working dir. A stop kills
// the job's shell and its process group. A shell call that ends leaving
// a process running in its group (`npm run dev > dev.log 2>&1 &`) is a
// background job: listed (Machine.background, State), stopped one by one
// (Machine.stop), each change told (Machine.watch). As illi quits, end()
// kills every shell's group (SHELLS), and any process marked ILLI_RUN
// that left it.
// A file changed (write over one, edit) answers as a unified diff (Diff),
// which the view draws as one (Md.ts). Config.ts took the API keys out of
// the environment the shells inherit. No read, write or edit reaches into
// a chat's folder, any profile's (CHAT): illi's own memory is zoomed, and
// another profile's chat is never its to touch. The shell isn't held so
// (the prompt asks it); a sandbox would be. A read of a png, jpeg, gif or
// webp file answers with the image itself (Image.ts fits it), which the
// model sees in that result only: the text logged says so.

import * as fs from "node:fs";
import * as path from "node:path";
import type { Out } from "../ai/Agent.ts";
import { LARGEST, image_fit } from "../ai/Image.ts";
import { CAP, clip, clip_end } from "./Clip.ts";
import * as config from "../config/Config.ts";
import { profile_chat } from "../config/Profiles.ts";
import { HEAD, IMAGES, image_kind, type Background } from "../ui/View.ts";

// Types
// =====

// a tool call to run here: its tool, its input, its agent's working dir,
// who calls it (illi, or a subagent's name; none: illi)
export type Job = { name: string; input: any; cwd: string; agent?: string };

// a shell started here: the background job it left once it ended (null:
// it still runs, or left none), whether that job is being stopped
type Shell = { job: Background | null; stopping: boolean };

// a tool as the vendors see it: its name, what it does, its input's
// JSON Schema
export type Spec = { name: string; info: string; schema: object };

// a line of a diff: kept in both texts (" "), only in the old ("-"), only
// in the new ("+")
type Op = { s: " " | "-" | "+"; x: string };

// lines a0 to a1 of an old text, b0 to b1 of a new one (ends excluded)
type Box = [number, number, number, number];

// Constants
// =========

// the shell commands run in: bash whatever the user's own is, as the
// permission checks read commands as bash does (Shell.ts) and models
// write bash; where there is none, sh
const SHELL = Bun.which("bash") ?? "/bin/sh";

// this illi's mark, set as ILLI_RUN on every process its shells start
// (each child inherits it), and how to list this user's processes with
// their environment, to find those that left their shell's group
const RUN = crypto.randomUUID();
const UID = String(process.getuid?.() ?? "");
const PS  = process.platform === "darwin" ? ["ps", "-wwE", "-U", UID, "-o", "pid=,command="] : ["ps", "-wwe", "-u", UID, "-o", "pid=,args=", "e"];

// the shells started here, kept until their process groups are empty, so
// end() kills a backgrounded job whose shell already exited; the last
// background job's number; how often the jobs are looked at while any
// run, and the wait between asking a stopped one to end and killing it
// (ms); the clock looking, what a change of them calls
const SHELLS = new Map<Bun.Subprocess, Shell>();
let NUMBER = 0;
const LOOK  = 2000;
const GRACE = 2000;
let LOOKING: ReturnType<typeof setInterval> | null = null;
let WATCH = () => {};
let SEEN = "[]";

// the lines kept around each change in a diff
const CONTEXT = 3;

// a read, write or edit refused in a chat's folder (# : the folder)
const CHAT = "# holds a chat, illi's memory (this profile's or another's): no file tool reads or changes it. Your own memory is reached with zoom; another profile's chat isn't yours.";

export const STR = { type: "string" };
export const INT = { type: "integer" };

const EDIT = { type: "object", properties: { path: STR, old: STR, new: STR, all: { type: "boolean" } }, required: ["path", "old", "new"] };

// what a command does, in words: the user's chat lists the call by them
// (Call.ts call_label), never by the command
const SAYS = { type: "string", description: "What the command does, in 5-10 words, active voice: List the files in src" };

export const TOOLS: Spec[] = [
  spec("shell", "Run a command with bash (bash -c), stdout and stderr together, and return its output, then its exit code and time, as (exit 0 in 0.4 s); output past " + CAP + " characters keeps its head and tail. Each call is a new shell. The call waits until the command and everything holding its output end, so give a background job its own output file (cmd > file.log 2>&1 &). A background job shows to the user, who may stop it, and lives only while illi is open: quitting it kills every process the calls started.", { command: STR, description: SAYS }, ["command"]),
  spec("read", "Read a text file, or look at an image (png, jpeg, gif, webp: you see it, in this result only). offset: the first line to show (from 1); limit: how many lines; at: the character of the first line to start from. It ends saying the lines shown, as [lines 4-7 of 15]; output past " + CAP + " characters comes in pages, saying where to go on. To look at an image on the web, download it with shell (curl -o) and read the file.", { path: STR, offset: INT, limit: INT, at: INT }, ["path"]),
  spec("write", "Write a whole file, making its directories. Answers a unified diff of what changed (a new file: all its lines added).", { path: STR, content: STR }, ["path", "content"]),
  spec("edit", "Replace text in files: the edits in order, each on its file as the edits before it left it. old must match exactly, whitespace included, and only once, unless all is true, which replaces every match. If any edit fails, no file is changed. Answers a unified diff of each file.", { edits: { type: "array", items: EDIT, minItems: 1 } }, ["edits"]),
];

// Spec
// ====

// a tool whose input is an object of these fields, the `need` ones
// required
export function spec(name: string, info: string, fields: object, need: string[]): Spec {
  const schema = { type: "object", properties: fields, required: need };
  return { name, info, schema };
}

// Machine
// =======

export namespace Machine {

  export async function run(job: Job, signal: AbortSignal): Promise<Out> {
    const cwd = job.cwd;
    const input = job.input;
    const file = path.resolve(cwd, String(input.path));
    const each = job.name === "edit" ? (Array.isArray(input.edits) ? input.edits : []).map((e: any) => path.resolve(cwd, String(e?.path))) : job.name === "read" || job.name === "write" ? [file] : [];
    const chat = each.map((f: string) => profile_chat(config.ROOT, f)).find((c: string | null) => c !== null);
    if (chat !== undefined) {
      return { text: CHAT.replace("#", chat), fail: true };
    }
    try {
      fs.mkdirSync(cwd, { recursive: true });
      switch (job.name) {
        case "shell": {
          return await Machine.shell(cwd, String(input.command), signal, job.agent);
        }
        case "read": {
          return await Machine.read(file, Number(input.offset ?? 1), Number(input.limit ?? Infinity), Number(input.at ?? 0));
        }
        case "write": {
          return Machine.write(file, String(input.path), String(input.content));
        }
        case "edit": {
          return Machine.edit(cwd, input.edits);
        }
        default: {
          return { text: "No tool " + job.name + ".", fail: true };
        }
      }
    } catch (err: any) {
      return { text: String(err?.message ?? err), fail: true };
    }
  }

  // runs a command, in its own process group (detached), every process
  // marked ILLI_RUN, its output decoded as one stream (a char split over
  // reads stays whole; a broken one at its end shows) and cut as it
  // comes. A stop kills the group and ends the wait at once, whatever
  // still holds its output. One that ends leaving a process in its group
  // (not stopped) is a background job of whoever called it
  export async function shell(cwd: string, command: string, signal: AbortSignal, agent = "illi"): Promise<Out> {
    Machine.look();
    const start = performance.now();
    const proc = Bun.spawn([SHELL, "-c", "exec 2>&1\n" + command], {
      cwd      : cwd,
      env      : { ...process.env, ILLI_RUN: RUN },
      stdin    : "ignore",
      stdout   : "pipe",
      stderr   : "ignore",
      detached : true,
    });
    const out = clip();
    const shell: Shell = { job: null, stopping: false };
    SHELLS.set(proc, shell);
    const reader = proc.stdout.pipeThrough(new TextDecoderStream()).getReader();
    const kill = () => {
      Machine.kill(-proc.pid);
      reader.cancel().catch(() => {});
    };
    signal.addEventListener("abort", kill, { once: true });
    try {
      for (let got = await reader.read(); !got.done; got = await reader.read()) {
        out.add(got.value);
      }
    } catch {}
    signal.removeEventListener("abort", kill);
    const code = await proc.exited;
    if (Machine.group(proc) && signal.aborted) {
      kill();
    } else if (Machine.group(proc)) {
      shell.job = { id: ++NUMBER, command: command.replace(/\s+/g, " ").replace(/[\x00-\x1f\x7f-\x9f]/g, "").trim(), agent, since: Date.now() };
      Machine.look();
    }
    const time = ((performance.now() - start) / 1000).toFixed(1) + " s";
    const exit = signal.aborted ? "stopped" : proc.signalCode ? "killed by " + (typeof proc.signalCode === "number" ? "signal " : "") + proc.signalCode : "exit " + code;
    const text = out.text().replace(/\n$/, "");
    return { text: (text === "" ? "" : text + "\n") + "(" + exit + " in " + time + ")", fail: exit !== "exit 0" };
  }

  // whether a shell's process group may still hold a job: the shell runs,
  // or it is gone but its id names no live process and its group still
  // has one
  export function group(proc: Bun.Subprocess): boolean {
    const ended = proc.exitCode !== null || proc.signalCode !== null;
    return !ended || (!Machine.alive(proc.pid) && Machine.alive(-proc.pid));
  }

  // whether a process (pid) or a process group (-pid) exists
  export function alive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      return err.code === "EPERM";
    }
  }

  export function kill(pid: number, sig: NodeJS.Signals = "SIGKILL"): void {
    try {
      process.kill(pid, sig);
    } catch {}
  }

  // the background jobs running, oldest first (but those being stopped)
  export function background(): Background[] {
    return [...SHELLS].flatMap(([proc, s]) => (s.job !== null && !s.stopping && Machine.group(proc) ? [s.job] : []));
  }

  // what a change of the background jobs calls (the chat: its state to
  // the views)
  export function watch(fn: () => void): void {
    WATCH = fn;
  }

  // a background job stopped: its group asked to end, killed GRACE after
  // if it still holds one (each only while Machine.group says it is its
  // own, so a reused id is never hit); false: no such job running
  export function stop(id: number): boolean {
    const found = [...SHELLS].find(([, s]) => s.job?.id === id && !s.stopping);
    if (found === undefined) {
      return false;
    }
    const [proc, s] = found;
    if (!Machine.group(proc)) {
      Machine.look();
      return false;
    }
    s.stopping = true;
    Machine.kill(-proc.pid, "SIGTERM");
    setTimeout(() => Machine.group(proc) && Machine.kill(-proc.pid), GRACE).unref();
    Machine.look();
    return true;
  }

  // the shells whose groups are empty let go; the jobs, if changed since,
  // told (WATCH); the clock looking again in LOOK while any job is left
  export function look(): void {
    SHELLS.forEach((_, proc) => Machine.group(proc) || SHELLS.delete(proc));
    const now = JSON.stringify(Machine.background().map((j) => j.id));
    if (now !== SEEN) {
      SEEN = now;
      WATCH();
    }
    const any = [...SHELLS.values()].some((s) => s.job !== null);
    if (any && LOOKING === null) {
      LOOKING = setInterval(() => Machine.look(), LOOK);
      LOOKING.unref();
    } else if (!any && LOOKING !== null) {
      clearInterval(LOOKING);
      LOOKING = null;
    }
  }

  // as this illi quits: kills every shell's process group (a job still in
  // it dies), then any process that left its group (ILLI_RUN), so none is
  // left orphaned
  export function end(): void {
    for (const proc of SHELLS.keys()) {
      if (Machine.group(proc)) {
        Machine.kill(-proc.pid);
      }
    }
    const ps = Bun.spawnSync(PS).stdout.toString();
    for (const line of ps.split("\n")) {
      if (line.includes("ILLI_RUN=" + RUN)) {
        Machine.kill(Number(line.trim().split(" ")[0]));
      }
    }
  }

  // `limit` lines from line `offset`, from its character `at`: a page of
  // them (Clip.ts), and past it where to go on; failed if there are none.
  // An image (by its first bytes) answers as one instead (Machine.image)
  export async function read(file: string, offset: number, limit: number, at: number): Promise<Out> {
    if (image_kind(Machine.head(file)) !== null) {
      return await Machine.image(file);
    }
    const data = fs.readFileSync(file);
    if (data.includes(0)) {
      return { text: "A binary file of " + data.length + " bytes: read takes text, and images. " + IMAGES, fail: true };
    }
    const lines = data.toString("utf8").replace(/\n$/, "").split("\n");
    const from  = Math.max(1, offset);
    const rows  = lines.slice(from - 1, from - 1 + limit);
    if (rows.length === 0) {
      return { text: "No lines from line " + from + ": the file has " + lines.length + ".", fail: true };
    }
    const text  = rows.join("\n");
    const end   = clip_end(text, at);
    const whole = end === text.length;
    const head  = text.slice(0, end).split("\n");
    const next  = from + head.length - 1;
    const col   = head[head.length - 1].length;
    const last  = whole ? from + rows.length - 1 : col === 0 ? next - 1 : next;
    const go    = whole ? "" : "; go on with offset " + next + (col === 0 ? "" : ", at " + col);
    const shown = "\n[lines " + from + "-" + last + " of " + lines.length + go + "]";
    return { text: text.slice(at, end).replace(/\n$/, "") + shown, fail: false };
  }

  // an image file read: itself, fitted (Image.ts), and a line saying what
  // it is and that it comes with this result only; one too large, or one
  // that won't do, failed, saying why
  export async function image(file: string): Promise<Out> {
    const name = path.basename(file);
    const fd   = fs.openSync(file, "r");
    let bytes: Buffer;
    try {
      const size = fs.fstatSync(fd).size;
      if (size > LARGEST) {
        return { text: "Image " + name + ": " + Machine.size(size) + ", too large to read (" + LARGEST / 2 ** 20 + " MB at most).", fail: true };
      }
      bytes = Buffer.alloc(size);
      bytes = bytes.subarray(0, fs.readSync(fd, bytes, 0, size, 0));
    } finally {
      fs.closeSync(fd);
    }
    const fit = await image_fit(bytes);
    if (typeof fit === "string") {
      return { text: "Image " + name + ": " + fit + ".", fail: true };
    }
    const scaled = fit.sent.w === fit.w && fit.sent.h === fit.h ? "" : ", sent scaled to " + fit.sent.w + "×" + fit.sent.h;
    const text   = "Image " + name + " (" + fit.kind.split("/")[1] + ", " + fit.w + "×" + fit.h + ", " + Machine.size(bytes.length) + scaled + "), attached to this result only: read it again to see it later.";
    return { text, fail: false, imgs: [{ type: fit.type, data: Buffer.from(fit.bytes).toString("base64") }] };
  }

  // a size in bytes, in words: 812 B, 92 KB, 2.1 MB
  export function size(n: number): string {
    return n < 1024 ? n + " B" : n < 2 ** 20 ? Math.round(n / 1024) + " KB" : (n / 2 ** 20).toFixed(1) + " MB";
  }

  // a file's first HEAD bytes (fewer: all it has)
  export function head(file: string): Uint8Array {
    const fd = fs.openSync(file, "r");
    try {
      const buf = new Uint8Array(HEAD);
      return buf.subarray(0, fs.readSync(fd, buf, 0, HEAD, 0));
    } finally {
      fs.closeSync(fd);
    }
  }


  // a file (named as given: shown) written whole: its diff (a new one's,
  // all its lines added), so a write reads as an edit
  export function write(file: string, shown: string, content: string): Out {
    const was = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return { text: text_diff(shown, was, content), fail: false };
  }

  // the edits, in order, each on its file as the ones before left it;
  // every file is written only once all of them apply, so a failed one
  // changes none. Each file, named as its first edit gives it, answers
  // its diff
  export function edit(cwd: string, edits: unknown): Out {
    const list  = Array.isArray(edits) ? edits : [];
    const files = new Map<string, { shown: string; was: string; text: string }>();
    for (const [k, e] of list.entries()) {
      const file  = path.resolve(cwd, String(e?.path));
      const known = files.get(file);
      const was   = known?.was ?? (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
      const text  = known?.text ?? was ?? "";
      const old   = String(e?.old ?? "");
      const count = old === "" ? 0 : text.split(old).length - 1;
      const why   = was === null ? "no such file" : count === 0 ? "old was not found" : count > 1 && e.all !== true ? "old matches " + count + " times; give more context, or all" : "";
      if (why !== "") {
        return { text: "Edit " + (k + 1) + " (" + e?.path + "): " + why + ". No file was changed.", fail: true };
      }
      files.set(file, { shown: known?.shown ?? String(e.path), was: was!, text: text.split(old).join(String(e.new)) });
    }
    if (files.size === 0) {
      return { text: "edits is empty: give a list of {path, old, new}.", fail: true };
    }
    for (const [file, f] of files) {
      fs.writeFileSync(file, f.text);
    }
    const diffs = [...files.values()].map((f) => text_diff(f.shown, f.was, f.text));
    return { text: diffs.join("\n"), fail: false };
  }

  // ms, or till the signal aborts: none, if it already did (an abort
  // event comes once)
  export function nap(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((ok) => {
      const timer = setTimeout(ok, signal.aborted ? 0 : ms);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        ok();
      });
    });
  }

}

// Diff
// ====

// a file's change as a unified diff: its name as old and new file, then
// each run of changes in a hunk with CONTEXT lines around it (runs that
// close share one), clipped as a command's output. Lines keep their "\n",
// so a last one without it differs, and says so as git does
function text_diff(file: string, was: string, now: string): string {
  const [a, b] = [text_lines(was), text_lines(now)];
  const ops = lines_diff(a, b);
  const at  : [number, number][] = [];
  let [i, j] = [0, 0];
  for (const op of ops) {
    at.push([i, j]);
    i += op.s === "+" ? 0 : 1;
    j += op.s === "-" ? 0 : 1;
  }
  const keys  = ops.flatMap((op, k) => (op.s === " " ? [] : [k]));
  const hunks : [number, number][] = [];
  for (const k of keys) {
    const top = hunks[hunks.length - 1];
    if (top !== undefined && k - top[1] <= 2 * CONTEXT) {
      top[1] = k + 1;
    } else {
      hunks.push([k, k + 1]);
    }
  }
  if (hunks.length === 0) {
    return file + " is unchanged.";
  }
  const out = clip();
  out.add("--- " + file + "\n+++ " + file);
  for (const [lo, hi] of hunks) {
    const a    = Math.max(0, lo - CONTEXT);
    const b    = Math.min(ops.length, hi + CONTEXT);
    const run  = ops.slice(a, b);
    const olds = run.filter((op) => op.s !== "+").length;
    const news = run.filter((op) => op.s !== "-").length;
    const head = "@@ -" + (at[a][0] + (olds === 0 ? 0 : 1)) + "," + olds + " +" + (at[a][1] + (news === 0 ? 0 : 1)) + "," + news + " @@";
    out.add("\n" + head + run.map((op) => "\n" + op.s + op.x.replace(/\n$/, "")).join(""));
  }
  return out.text();
}

// the shortest script from lines a to lines b: their lines kept (the
// most, lines_match), and in each gap between two the old lines
// dropped, then the new added, as git shows them. A line only one text
// has is never kept, so the match runs without them (a file rewritten
// whole needs no search)
function lines_diff(a: string[], b: string[]): Op[] {
  const [in_a, in_b] = [new Set(a), new Set(b)];
  const ia    = a.flatMap((x, i) => (in_b.has(x) ? [i] : []));
  const ib    = b.flatMap((x, j) => (in_a.has(x) ? [j] : []));
  const pairs = lines_match(ia.map((i) => a[i]), ib.map((j) => b[j]), [0, ia.length, 0, ib.length], []);
  const ops   : Op[] = [];
  let [i, j] = [0, 0];
  for (const [p, q] of pairs) {
    ops_push(ops, "-", a, i, ia[p]);
    ops_push(ops, "+", b, j, ib[q]);
    ops.push({ s: " ", x: a[ia[p]] });
    [i, j] = [ia[p] + 1, ib[q] + 1];
  }
  ops_push(ops, "-", a, i, a.length);
  return ops_push(ops, "+", b, j, b.length);
}

// lines i to j of xs, each as an op of mark s
function ops_push(ops: Op[], s: Op["s"], xs: string[], i: number, j: number): Op[] {
  for (let k = i; k < j; k++) {
    ops.push({ s, x: xs[k] });
  }
  return ops;
}

// the lines of a and b kept in a box of them, as their pairs [i, j]
// pushed in order: a longest common subsequence (Myers, in linear space):
// the common head and tail; between them, unless a side is empty, the
// middle snake (box_snake), and each part around it done alike. Time
// (n+m)·d, d the lines changed
function lines_match(a: string[], b: string[], box: Box, pairs: [number, number][]): [number, number][] {
  let [a0, a1, b0, b1] = box;
  let tail = 0;
  for (; a0 < a1 && b0 < b1 && a[a0] === b[b0]; a0++, b0++) {
    pairs.push([a0, b0]);
  }
  for (; a0 < a1 && b0 < b1 && a[a1 - 1] === b[b1 - 1]; a1--, b1--) {
    tail++;
  }
  if (a0 < a1 && b0 < b1) {
    const [x, u, y, v] = box_snake(a, b, [a0, a1, b0, b1]);
    lines_match(a, b, [a0, x, b0, y], pairs);
    for (let k = 0; k < u - x; k++) {
      pairs.push([x + k, y + k]);
    }
    lines_match(a, b, [u, a1, v, b1], pairs);
  }
  for (let k = 0; k < tail; k++) {
    pairs.push([a1 + k, b1 + k]);
  }
  return pairs;
}

// a text's lines, each with its "\n" (the last may lack it), and the
// "\ No newline at end of file" git puts after such a line in a diff
function text_lines(text: string): string[] {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  return lines.map((l) => (l.endsWith("\n") ? l : l + "\n\\ No newline at end of file"));
}

// a box's middle snake, as the box it spans: where a shortest path from
// its top corner meets one from its bottom, both grown a step d at a
// time, each keeping the furthest x reached on each diagonal k = x - y
// (vf from the top, vb from the bottom, counted back)
function box_snake(a: string[], b: string[], [a0, a1, b0, b1]: Box): Box {
  const [n, m] = [a1 - a0, b1 - b0];
  const delta = n - m;
  const off   = n + m + 1;
  const vf    = new Int32Array(2 * off + 1);
  const vb    = new Int32Array(2 * off + 1);
  for (let d = 0; ; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && vf[off + k - 1] < vf[off + k + 1]) ? vf[off + k + 1] : vf[off + k - 1] + 1;
      const x0 = x;
      while (x < n && x - k < m && a[a0 + x] === b[b0 + x - k]) {
        x++;
      }
      vf[off + k] = x;
      const c = delta - k;
      if (delta % 2 !== 0 && Math.abs(c) < d && x + vb[off + c] >= n) {
        return [a0 + x0, a0 + x, b0 + x0 - k, b0 + x - k];
      }
    }
    for (let c = -d; c <= d; c += 2) {
      let x = c === -d || (c !== d && vb[off + c - 1] < vb[off + c + 1]) ? vb[off + c + 1] : vb[off + c - 1] + 1;
      const x0 = x;
      while (x < n && x - c < m && a[a1 - 1 - x] === b[b1 - 1 - x + c]) {
        x++;
      }
      vb[off + c] = x;
      const k = delta - c;
      if (delta % 2 === 0 && Math.abs(k) <= d && x + vf[off + k] >= n) {
        return [a1 - x, a1 - x0, b1 - x + c, b1 - x0 + c];
      }
    }
  }
}
