// Compactor
// =========
// The lines of a chat's memory tree (Memory.ts) written: a node whose
// source fits NODE bytes is that source, built at once with no call;
// else a compaction writes it: a call like a turn, on the chat's
// compactor (its pick's vendor's: config_role), with the same system
// prompt (`share`), no tools, and the compactions' own view (`seen`) up
// to the node's `ctx`; a line too long is asked anew (build). The call
// asks till it is answered (AskAI patient: an outage only delays a node,
// never harms it); answered with no line (a refusal: its input's doing),
// its node is its source clipped. JOBS build at once, in the order the
// messages came. A try cut after a line keeps the best one; a node cut
// as the chat ends (Memory.stop) builds at the next start.

import { AskAI, type Block, type Call } from "../ai/AskAI.ts";
import * as config from "../config/Config.ts";
import { Pick } from "../ai/Pick.ts";
import { Memory, type Part } from "./Memory.ts";

// Constants
// =========

// a node's most bytes: a line of the tree; the compactions at once; the
// tries at a line that fits
export const NODE = 512;
const JOBS  = config.JOBS;
const TRIES = 5;

// a ruler, not a sample line: the compactor copied a sample's content
const SCALE = "-".repeat(NODE);

// a compaction's task, before its <input>: one message to compress
// (level 0), or two lines to merge
const LEAF = `Compaction: compress message {id} into one line of at most ${NODE} bytes
(about 70 words), the length of this ruler:
${SCALE}
<input>
`;

const MERGE = `Compaction: merge lines {a} and {b}, adjacent, into one line of at most
${NODE} bytes (about 70 words), the length of this ruler:
${SCALE}
<chat> may hold their messages, {id} to {end}, in more detail: take details
of them from there too.
<input>
`;

// Compactor
// =========

export namespace Compactor {

  // the nodes to build; those whose source fits take no call: built at
  // once, together (as jobs, a chain of them held the event loop)
  export function pump(mem: Memory): void {
    let built = false;
    for (let free = Compactor.starts(mem); free.length > 0 && !mem.done; free = Compactor.starts(mem)) {
      Memory.keep(mem, free);
      built = true;
    }
    if (built) {
      Memory.fit(mem);
    }
  }

  // unless held, the nodes ready up to the JOBS-th line not built, in
  // the order the messages came (`ctx`; at a tie, a merge first), while
  // JOBS run. The jobs started; the nodes whose source fits
  export function starts(mem: Memory): Array<Part & { text: string }> {
    const free: Array<Part & { text: string }> = [];
    if (mem.hold) {
      return free;
    }
    const end = Memory.first(mem, JOBS - 1);
    const next: Part[] = [];
    mem.ready.forEach((queue, l) => {
      for (let k = 0; k < queue.length && Memory.ctx(l, queue[k]) <= end; k++) {
        next.push({ l, i: queue[k] });
      }
    });
    next.sort((a, b) => Memory.ctx(a.l, a.i) - Memory.ctx(b.l, b.i) || b.l - a.l);
    for (const { l, i } of next) {
      if (mem.done || mem.busy.size >= JOBS) {
        break;
      }
      const text = mem.busy.has(Memory.slot(l, i)) ? null : Memory.source(mem, l, i);
      if (text !== null && Memory.bytes(text) <= NODE) {
        free.push({ l, i, text });
      } else if (text !== null) {
        Compactor.job(mem, l, i, text);
      }
    }
    return free;
  }

  // a node cut (the chat ended: Memory.stop) builds at the next start
  export function job(mem: Memory, l: number, i: number, text: string): void {
    const key = Memory.slot(l, i);
    mem.busy.add(key);
    Compactor.build(mem, l, i, text).finally(() => {
      mem.busy.delete(key);
      Compactor.pump(mem);
      Memory.fit(mem);
    }).catch((err) => {
      console.error("compactor: node " + l + "/" + i + ": " + (err?.message ?? err));
    });
  }

  // node (l,i)'s summary: its view to the node and its task, asked till
  // a line fits (a leaf's tagged with its message's kind: tagged), TRIES
  // lines at most, the shortest kept. Each try sends those blocks, never
  // a try's words or thoughts; one after a line too long adds only its
  // size and where the limit cuts it (`over`): never more than the first
  // and that note. No line (a refusal: its input's
  // doing; or too long for the compactor's window): its source clipped;
  // a try cut (a stop) throws, unless a line came
  export async function build(mem: Memory, l: number, i: number, text: string): Promise<void> {
    const task = { text: Compactor.task(l, i) + text + "\n</input>", mark: false };
    const upto = Math.min(Memory.ctx(l, i), Memory.first(mem));
    const blocks = [...Memory.view(mem, upto, mem.seen.parts), task];
    const lines: string[] = [];
    let end = await Compactor.compact(mem, l, i, Compactor.ask(mem, blocks));
    while (end.ok && end.text.trim() !== "") {
      const line = Compactor.tagged(l, text, Compactor.bare(end.text.trim()));
      lines.push(line);
      if (Memory.bytes(line) <= NODE || lines.length === TRIES || mem.done) {
        break;
      }
      const note = { text: Compactor.over(line), mark: false };
      end = await Compactor.compact(mem, l, i, Compactor.ask(mem, [...blocks, note]));
    }
    if (lines.length === 0 && !end.ok && end.stop !== "fail" && end.stop !== "full") {
      throw new Error(end.text);
    }
    if (lines.length === 0) {
      console.error("compactor: node " + l + "/" + i + ": " + (end.ok ? "an empty line" : end.text) + "; clipped");
    }
    const line = lines.length === 0 ? Compactor.clip(Memory.flat(text)) : lines.reduce((a, b) => (Memory.bytes(b) < Memory.bytes(a) ? b : a));
    Memory.keep(mem, [{ l, i, text: line }]);
    mem.stuck?.("");
  }

  // a line without a label the compactor put first ("Merged line:"),
  // though the prompt asks for none
  export function bare(line: string): string {
    return line.replace(/^(?:(?:merged|compressed|combined|one) )?(?:line|summary):\s*/i, "");
  }

  // a leaf's line starting with its message's kind, as the task asks
  // ("user: ..."), where the compactor left it out: one message is one
  // item. A line tagged already, or a merge's, as it is
  export function tagged(l: number, source: string, line: string): string {
    const kind = l === 0 ? /^([a-z]+): /.exec(source)?.[1] : undefined;
    const has = /^(user|work|mind|illi|tool|echo|note):/.test(line);
    return kind === undefined || has ? line : kind + ": " + line;
  }

  // a call of a summary, its blocks, on the compactor of the chat's
  // pick's vendor; a try that failed told (mem.stuck)
  export function ask(mem: Memory, blocks: Block[]): Call {
    const share = mem.share();
    return AskAI.ask({ ...share, ...Pick.ask(config.config_role("compactor", share)), blocks, patient: true, stuck: (why) => mem.stuck?.(why) }, () => {});
  }

  // a summary's try: its call's end, the call held in `calls` till then
  export function compact(mem: Memory, l: number, i: number, call: Call): Call["done"] {
    mem.calls.set(call, { l, i });
    return call.done.finally(() => mem.calls.delete(call));
  }

  // node (l,i)'s task, but its input
  export function task(l: number, i: number): string {
    const [a, z] = Memory.span({ l, i });
    const n = 2 ** l / 2;
    const fill: Array<[string, string]> = [["{a}", a + "+" + n], ["{b}", a + n + "+" + n], ["{id}", String(a)], ["{end}", String(z)]];
    return fill.reduce((t, [k, v]) => t.replace(k, v), l === 0 ? LEAF : MERGE);
  }

  // a text's first NODE bytes
  export function clip(text: string): string {
    return Buffer.from(text, "utf8").subarray(0, NODE).toString("utf8").replace(/\uFFFD+$/, "");
  }

  export function over(line: string): string {
    return `Too long: your last line for this <input> was ${Memory.bytes(line)} bytes,
over the ${NODE}-byte limit. Write the whole line again, cutting just
enough of the least valuable items to fit before this cut:
${Compactor.clip(line)}| ← LIMIT`;
  }
}
