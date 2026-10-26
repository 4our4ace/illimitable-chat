// Logs
// ====
// The agents' logs of a chat (Memory.ts), in the project's file beside
// it (Store.ts): one per agent, by its name and a tag (a name freed goes
// on to a new agent, with a log of its own). A name's log is the one it
// last took; a log is read whole, by its name or by its log, and its
// agent's calls get it from its last recap on, its first note and
// illi's messages to it kept whole (view).

import type { Kind } from "../ai/AskAI.ts";
import { Memory, type Root } from "./Memory.ts";
import * as names from "./Names.ts";
import { Store } from "./Store.ts";

// Constants
// =========

// an agent's name: a letter, then letters, digits, _ and -; its log's,
// the name and a tag (one name, freed, is used again: each log its own),
// the tag and the name back from a file
const AGENT = /^[A-Za-z][A-Za-z0-9_-]*$/;
const LOG   = /^([A-Za-z][A-Za-z0-9_-]*)(?:\.([0-9a-z]+))?$/;

// the caller name of the chat's own agent (its tools URL's: Tools.ts),
// never an agent's
export const MAIN = "main";

// the bytes a line's mark of what Logs.fit cut takes, at most ("\n[...
// 123456789 characters cut ...]\n")
const CUT = 40;

// Logs
// ====

export namespace Logs {

  // read whole, by name (its log as now) or by log (a name and its tag,
  // as a report names it: that one, though the name went on to another);
  // never a path
  export function read(mem: Memory, name: string): Root[] | null {
    const log  = LOG.test(name) ? (name.includes(".") ? name : Logs.log(mem, name)) : null;
    const work = log === null ? null : Store.work(mem.store, log);
    return work?.map((e) => ({ ...e, size: Memory.bytes(Memory.plain({ ...e, size: 0 })) })) ?? null;
  }

  // a name's log as now: the one it last took (kept), else in the file
  // the newest so named; none: null
  export function log(mem: Memory, name: string): string | null {
    const known = mem.logs.get(name);
    if (known !== undefined || !AGENT.test(name)) {
      return known ?? null;
    }
    const log = Store.log_of(mem.store, name);
    if (log !== null) {
      mem.logs.set(name, log);
    }
    return log;
  }

  // a new agent's name, its log made: its user's agent's name (own), else
  // numbered past those taken (own-2 on); none (or not a name): a random
  // one (Names.ts) not taken. A name is taken while its agent is (taken
  // tells: at work, or of this run); one freed is used again, with a log
  // of its own (the name and a tag: the time). A user's agent named MAIN
  // is refused: its calls would pass for the chat's own
  export function start(mem: Memory, own: string | null, taken: (name: string) => boolean): string {
    if (own === MAIN) {
      throw new Error("No agent can be named " + MAIN + ": that name is illi's own. Rename the agent's file (" + MAIN + ".md) to spawn it.");
    }
    const base = own !== null && AGENT.test(own) ? own : null;
    for (let n = 1; ; n++) {
      const name = base === null ? names.name_random() : n === 1 ? base : base + "-" + n;
      for (let k = 0; !taken(name); k++) {
        const log = name + "." + (Date.now() * 100 + k).toString(36);
        if (!Store.log_new(mem.store, log, name)) {
          continue;
        }
        mem.logs.set(name, log);
        mem.agents.set(name, 0);
        return name;
      }
    }
  }

  // its length read once, then counted (mem.agents)
  export function push(mem: Memory, name: string, kind: Kind, text: string): number {
    const log = Logs.log(mem, name) ?? name;
    const n = mem.agents.get(name) ?? Store.work_count(mem.store, log);
    const root = Memory.root(n, { kind, text });
    Store.work_push(mem.store, log, name, root);
    mem.agents.set(name, n + 1);
    return root.i;
  }

  export function show(mem: Memory, name: string): string {
    return Logs.read(mem, name)?.map(Logs.line).join("\n\n") ?? "No agent " + name + ".";
  }

  // its log as its calls get it (none: empty): whole till its first
  // recap (Tools.recap: it outgrew its model's window); past one, what it
  // is (its first note) and illi's messages to it (its task, all it was
  // told since: user) whole, then its last recap and all after it. What
  // it leaves out is a zoom away (show), but for one started fresh,
  // which has no zoom
  export function view(mem: Memory, name: string): Root[] {
    const log = Logs.read(mem, name) ?? [];
    const at  = log.findLastIndex((e) => e.kind === "recap");
    return at < 0 ? log : log.filter((e, k) => k === 0 || k >= at || e.kind === "user");
  }

  // a log's lines (line) in `most` bytes or so (UTF-8, as models read
  // it; the gaps between lines and the marks of what it cut counted, CUT
  // bytes each): past it, each line longer than a common length (the
  // longest first: tool results, as a rule) keeps its head and tail to
  // it, half its bytes each (reach), saying how many characters it cut
  // (a surrogate pair kept whole),
  // and none is cut that its mark wouldn't make shorter, so no result,
  // however long, pushes a recap's request past its model's window
  // (Tools.recap). A log of more lines than even their marks fit in
  // `most` comes cut as far as it goes
  export function fit(log: Root[], most = Infinity): string {
    const lines = log.map(Logs.line);
    const sizes = lines.map(Memory.bytes);
    const gaps  = 2 * Math.max(0, lines.length - 1);
    const sum   = (cap: number) => sizes.reduce((n, b) => n + (b > cap + CUT ? cap + CUT : b), gaps);
    if (sum(Infinity) <= most) {
      return lines.join("\n\n");
    }
    let [lo, hi] = [0, sizes.reduce((n, b) => Math.max(n, b), 0)];
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      [lo, hi] = sum(mid) <= most ? [mid, hi] : [lo, mid - 1];
    }
    const cut = (s: string, b: number) => {
      if (b <= lo + CUT) {
        return s;
      }
      const [head, tail] = [reach(s, lo / 2, false), reach(s, lo / 2, true)];
      return s.slice(0, head) + "\n[... " + (tail - head) + " characters cut ...]\n" + s.slice(tail);
    };
    return lines.map((s, k) => cut(s, sizes[k])).join("\n\n");
  }

  export function line(root: Root): string {
    return root.i + "|" + Memory.plain(root);
  }
}

// how far a string's head of `most` UTF-8 bytes at most reaches (back:
// where its tail of so many starts), a code point kept whole (a lone
// surrogate counted as its replacement's 3 bytes, as Memory.bytes counts)
function reach(s: string, most: number, back: boolean): number {
  let [k, n] = [back ? s.length : 0, 0];
  while (back ? k > 0 : k < s.length) {
    const c    = s.charCodeAt(back ? k - 1 : k);
    const pair = back ? k > 1 && c >> 10 === 0x37 && s.charCodeAt(k - 2) >> 10 === 0x36 : c >> 10 === 0x36 && s.charCodeAt(k + 1) >> 10 === 0x37;
    const w    = pair ? 4 : c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    if (n + w > most) {
      break;
    }
    n += w;
    k += (back ? -1 : 1) * (pair ? 2 : 1);
  }
  return k;
}
