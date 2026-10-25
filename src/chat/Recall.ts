// Recall
// ======
// The radar's strong lines given to the model (Radar.ts; the side shows
// every line it finds, Related.ts, the user's eye first). A tool call that
// runs (Tools.call, past the hooks and the checks) starts a search beside
// its run, in a thread of its own (Projects.recall: neither the side's
// nor the model's own searches ever wait on it): its caller's run since
// the user's last message (the chat's agent's, or a subagent's log) with
// the call itself the newest of it, over the chat's summary lines, what
// the caller's view holds at an episode's detail or finer (its lines of
// Radar EPISODE messages or fewer: a line found there would say no more
// than they do) and its recent messages left out, and what the user
// dismissed at the side (tools.gone: Chat.dismiss, from any view). A line found is given only if strong (Radar.strong:
// anchored by a path or an error's name, two units at least, its score
// past the bar: Radar.bar, STRONG, then where the lines the user opened
// and pinned sit, read from related.json), and named nowhere in what the
// caller holds whole (#16+16, as a pin or a recall before gave it; 16+8|,
// as a zoom or a search did: Radar.named). That one rule is stateless: it
// holds across restarts, and a line falls out of it only as its naming
// leaves the caller's recent messages.
// Never slower: once the tool is done, the search is waited on WAIT ms
// at most; not answered, no line. One search runs at a time: a later
// call of its caller's step shares it (so the line a fast call's search
// found too late goes after a slower call of the same step instead of
// nowhere), any other call starting meanwhile gets none. Its thread
// starts as a turn does (Recall.wake), so no first search waits out a
// worker starting. A caller gets one line a step at most (a step's
// calls, run one after another as illi's loop does or at once as Claude
// Code may, share it: Chat.on counts each caller's steps; on claude-code
// a call may reach illi before Claude Code's stream says its step began,
// so a step may get a line more or less, never a wrong one).
// The line goes last, after what the hooks told the model, as one line
// between <history> tags (Clip.ts history_block): its id as zoom and the
// side take it, how long ago its episode ended, its summary cut short.
// illi's own memory and meta tools never get one (SKIP), nor a result
// with images (Claude Code joins their names after its text, so the line
// would not end it), nor an empty one (it would stand in for its "(no
// output)"), nor one the line would make a page longer (it would start a
// page alone: Clip.ts clip_pages). `related` on alone
// (config.RECALL; screen: the side alone; off: nothing). Covered: illi's
// own loop (chatgpt, claude-api, openai-api: shell, files, MCP and plugin
// tools), the chat's agent and its subagents alike; on claude-code only
// the tools illi serves it pass through here (the user's MCP servers'
// and plugins'), as its own Read, Edit and Bash run inside Claude Code.

import type { Out } from "../ai/Agent.ts";
import type { Block } from "../ai/AskAI.ts";
import * as config from "../config/Config.ts";
import { MAIN } from "./Logs.ts";
import { Memory } from "./Memory.ts";
import { Projects } from "./Projects.ts";
import { EPISODE, Radar, type Found, type Recall as Ask } from "./Radar.ts";
import { clip_pages, history_block, json_object } from "../tools/Clip.ts";
import type { Tools } from "../tools/Tools.ts";
import { block_name, FAILED } from "../ui/View.ts";

// Types
// =====

// a recall under way beside its call (Recall.start): whose call, the step
// it is of, the line its search finds (null: none, or it failed)
export type Pending = { who: string; step: number; found: Promise<Found | null> };

// Constants
// =========

// illi's own memory and meta tools, never given a line: zoom, search and
// date read the memory themselves, and a line after projects, todo, ask,
// skill, approve (Claude Code's permission prompt), spawn or tell would be
// noise on illi's own steps, or go round an agent's report
export const SKIP = new Set(["zoom", "search", "date", "projects", "todo", "ask", "skill", "approve", "spawn", "tell"]);

// how long a call's end waits on its search (ms): a few, so no call is
// slower for it
export const WAIT = 5;

// the most characters of a line's summary given, cut at a word's end
const SAID = 200;

// how long the bar read from the counts is kept (ms)
const KEPT = 60000;

// Globals
// =======

// the search running, its chat's tools and its recall (null: none); the
// bar as last read, and when; each subagent's view's lines, read once a
// view
let running: { tools: Tools; pending: Pending } | null = null;
let kept: { at: number; bar: number } | null = null;
const PARTS = new WeakMap<Block[], Array<[number, number]>>();

// Recall
// ======

export namespace Recall {

  // a call's recall started beside its run, if due (null: none): `related`
  // on, a tool not illi's own memory's or meta's (SKIP), its caller given
  // no line yet this step, no search running already; one running for
  // the same caller's step is shared (its line goes after whichever of
  // their calls ends first once it answered: Recall.end). Never in the
  // call's way: what fails here, or in the thread, gives no line
  export function start(tools: Tools, who: string, name: string, input: unknown): Pending | null {
    try {
      const step = tools.steps.get(who) ?? 0;
      if (!config.RECALL || SKIP.has(name) || tools.given.get(who) === step) {
        return null;
      }
      if (running !== null) {
        const { pending } = running;
        return running.tools === tools && pending.who === who && pending.step === step ? pending : null;
      }
      const ask = Recall.ask(tools, who, name, input);
      if (ask === null) {
        return null;
      }
      const found   = Projects.recall(tools.mem.store.file, ask).catch(() => null);
      const pending = { who, step, found };
      running = { tools, pending };
      void found.then(() => {
        running = running?.pending === pending ? null : running;
      });
      return pending;
    } catch {
      return null;
    }
  }

  // recall's thread started ahead of the first call's search (a worker
  // takes longer to start than a call's end waits: WAIT), as a turn
  // starts with `related` on (Chat.turn)
  export function wake(): void {
    if (config.RECALL) {
      Projects.wake();
    }
  }

  // what a call's search asks (null: its caller not known): its call as it
  // will be logged; what its caller's view leaves out and what it holds
  // whole: the chat's agent's view's lines before its cut, those of
  // EPISODE messages or fewer left out (what the view says of them is as
  // fine as a line found there), and its recent messages from the cut on
  // (Memory.turn); a subagent's view's lines as it was spawned or told
  // (its log is its own, never in the chat's lines), those of EPISODE
  // messages or fewer left out, the chat after them not searched. The
  // dismissed left out of both
  export function ask(tools: Tools, who: string, name: string, input: unknown): Ask | null {
    const mem  = tools.mem;
    const call = name + " " + JSON.stringify(input ?? {});
    if (who === MAIN) {
      const lines = Memory.before(mem.view.parts, mem.cut).map((p): [number, number] => [Memory.span(p)[0], 2 ** p.l]);
      const { end, out } = Radar.left([...lines, [mem.cut, Math.max(1, mem.count - mem.cut)]], mem.cut, tools.gone, EPISODE);
      return { chat: mem.store.chat, log: null, call, end, out, from: mem.cut, bar: Recall.bar() };
    }
    const agent = tools.agents.get(who);
    if (agent === undefined) {
      return null;
    }
    const { end, out } = Radar.left(Recall.parts(agent.view), Infinity, tools.gone, EPISODE);
    return { chat: mem.store.chat, log: agent.log ?? who, call, end, out, from: 0, bar: Recall.bar() };
  }

  // a call's result once it ran, with the line its recall found, if one
  // is still due: its search waited on WAIT ms at most (not answered: no
  // line, and the call no slower); none once the call was stopped,
  // `related` turned from on, another call of its step was given one, or
  // the user dismissed it meanwhile; nor after a result with images, an
  // empty one (the loop, Agent.use, and Claude Code's echo say "(no
  // output)" of it, which the line would take the place of), or one the
  // line would make a page longer
  export async function end(tools: Tools, pending: Pending | null, out: Out, signal: AbortSignal): Promise<Out> {
    if (pending === null) {
      return out;
    }
    let timer: Timer | undefined;
    const late  = new Promise<null>((done) => (timer = setTimeout(() => done(null), WAIT)));
    const found = await Promise.race([pending.found, late]).finally(() => clearTimeout(timer));
    try {
      const gone = found === null || tools.gone.some(([a, b]) => found.first < b && a < found.first + found.n);
      if (gone || signal.aborted || !config.RECALL || (out.imgs?.length ?? 0) > 0 || out.text === "" || tools.given.get(pending.who) === pending.step) {
        return out;
      }
      const block  = history_block(Recall.line(found));
      const logged = (out.fail ? FAILED : "") + out.text;
      if (clip_pages(logged + block).length !== clip_pages(logged).length) {
        return out;
      }
      tools.given.set(pending.who, pending.step);
      return { ...out, text: out.text + block };
    } catch {
      return out;
    }
  }

  // a line as given: its id as zoom and the side take it
  // (View.block_name), how long ago its episode ended (Radar.age), its
  // summary on one line (Radar.text) cut to SAID characters
  export function line(f: Found, now = Date.now()): string {
    const age = Radar.age(f.date, now);
    return [block_name(f.first, f.n), ...(age === "" ? [] : [age + " ago"]), Recall.cut(Radar.text(f.text), SAID)].join(" · ");
  }

  // a text cut to `most` characters (whole ones, not halves of a pair) at
  // a word's end (one ending in its last third), an ellipsis ending it
  export function cut(text: string, most: number): string {
    const chars = Array.from(text);
    if (chars.length <= most) {
      return text;
    }
    const head  = chars.slice(0, most - 1).join("");
    const space = head.lastIndexOf(" ");
    return (space > (head.length * 2) / 3 ? head.slice(0, space) : head).replace(/[\s,;:.]+$/, "") + "…";
  }

  // the bar a line given must reach (Radar.bar), from the counts the side
  // keeps (config.RELATED_FILE), read again once KEPT passed
  export function bar(now = Date.now()): number {
    if (kept === null || now - kept.at >= KEPT || now < kept.at) {
      kept = { at: now, bar: Radar.bar(json_object(config.RELATED_FILE)) };
    }
    return kept.bar;
  }

  // a caller's step begun (Chat.on: a call of it came, none waiting), so
  // its calls from now on share one line
  export function step(tools: Tools, who: string): void {
    tools.steps.set(who, (tools.steps.get(who) ?? 0) + 1);
  }

  // a subagent's view's lines, [id, n] each (its blocks are Memory.view's,
  // "id+n|text" a line), read once a view
  export function parts(view: Block[]): Array<[number, number]> {
    let parts = PARTS.get(view);
    if (parts === undefined) {
      parts = view.flatMap((b) => [...b.text.matchAll(/^(\d+)\+(\d+)\|/gm)].map((m): [number, number] => [Number(m[1]), Number(m[2])]));
      PARTS.set(view, parts);
    }
    return parts;
  }

}
