// Antigravity
// ===========
// antigravity: a Google AI plan's Gemini models, run by Google's own
// Antigravity CLI as an editor runs it (`agy acp`, its ACP server: Agy.ts
// finds the user's own or illi's download, run unmodified, never its
// `agy -p`): illi is its client over the Agent Client Protocol (Acp.ts),
// named illi, signed in by the CLI's own Google sign-in (`agy acp
// --login`: /login opens Google's page, the person pastes the code it
// shows: Login.ts; illi never reads the tokens). Each account is a folder
// of illi's (the HOME, the CLI's own folder (--gemini-dir) and TMPDIR of
// the CLIs run for it, the sign-in kept in a file there, never a keyring
// all accounts would share), so accounts never meet; an environment's
// Gemini, Google or Antigravity keys and settings never reach the CLI,
// which would take them in place of the sign-in, nor its own updates
// (illi runs the build it found), nor its telemetry.
//
// A call is a session of its own (session/new), as a `claude -p` is on
// claude-code: illi's prompt after Google's own (its systemPrompt append:
// Google's comes first, and says to write artifacts and file:// links,
// which the end of illi's says don't apply), in an empty folder of the
// account's, so no project's rules load (illi reads them itself), on the
// pick's model and its thinking level (its effort), where the account
// offers them (one it doesn't: the call fails, saying what it does
// offer). The models are the account's own, as the CLI lists them (Gemini
// alone: it lists every model the account has): each session made tells
// them (a sign-in's too, made for that alone), and they replace the list
// illi offers, kept for the next start, the chat told (watch). Its tools
// are illi's whole list, over MCP, run by illi, so permissions, hooks and
// background jobs are as on every provider; of Antigravity's own only its
// web search and page reading, where the call searches the web
// (Ask.searches), each asked of the user at illi's screen as Claude
// Code's are (Tools.approve, through the call's tools URL); none else. A
// call without tools (a summary, a goal check, a recap: `once`) has none.
// The blocks go as one message, the images after; a message sent mid-run
// is left for the next turn (End.left), as the CLI takes one message a
// turn. Its session's files are removed as it ends, and what the CLI
// leaves in the account's folder (its logs) once a day old. The CLI tells
// illi none of its MCP calls' results, so illi's tools are given it
// through a forwarder of illi's own (a local URL for each call), which
// logs each call with what it answered, as the chat's memory keeps every
// tool's answer.
//
// Its stream: the model's thoughts and words shown live, logged as a
// tool call follows them or the turn ends; the CLI's web tools logged
// with what they answered. The CLI says a failed request in words, as
// a message (its usage tells nothing apart, coming as it does mid-stream):
// a turn that used nothing ended on an error, as did one whose last piece
// is one of the CLI's own words for one (ERROR: the words streamed
// before it logged as cut off), never a reply. Its end in plain words:
// too long for the window (`full`: illi folds the chat), the plan's limit
// reached (when it resets), the sign-in run out (/login signs in again),
// a busy service; a stop cancels the turn (session/cancel), the CLI
// killed if it doesn't end it in CANCEL. Each step's usage tells the
// model's window, learned and kept for the next start.
//
// The CLIs run in a pool, an account's at a time: one starts as a call
// needs it (about a second), takes up to MOST sessions at once, and ends
// once none of its sessions runs; one more is started ready beside them
// (the spare), so the next call needs no start. None runs while no call
// has for IDLE, nor after illi ends (close; a CLI ends too as its input
// closes, however illi ends). A call never signs in: the CLI uses the
// sign-in its folder keeps, and with none (or one run out) the call fails
// at once, saying /login signs in again (Google's own sign-in would open
// a browser).

import * as fs from "node:fs";
import * as path from "node:path";
import type { Subprocess } from "bun";
import { AskAI, type Ask, type End, type Event, type Say, type Try } from "../../ai/AskAI.ts";
import { Agent, type Entry } from "../../ai/Agent.ts";
import { EFFORTS, Pick, type Model } from "../../ai/Pick.ts";
import { FAILED } from "../../ui/View.ts";
import * as config from "../../config/Config.ts";
import { VERSION } from "../../config/Update.ts";
import { Acp, type Conn, type Heard } from "./Acp.ts";
import { Agy } from "./Agy.ts";
import { FACTS } from "./Facts.ts";
import type { Provider } from "../Provider.ts";
import { Vendors } from "../Vendors.ts";

// Types
// =====

// a CLI running for an account (its folder, and the folder's stamp as it
// started: Antigravity.stamp), its connection, whether it's ready
// (initialized, and signed in to a gateway named), the sessions it
// started and those running, its calls by their session
type Proc = {
  conn    : Conn;
  folder  : string;
  stamp   : string;
  ready   : Promise<void>;
  started : number;
  live    : number;
  runs    : Map<string, Run>;
};

// a call as it runs: what it asks and where its events go, its CLI and
// session, its tools' path at the forwarder; the words and thoughts
// streaming, not logged yet (last: their last piece), whether the next
// piece starts an entry; the last words logged, whether any were; the
// tokens its first step read (as a step's usage tells it); whether a
// tool's answer came back; whether the turn called a tool (it took more
// than one step); the CLI's web tools' calls waiting for their answers;
// the calls through the forwarder so far; whether it was stopped (halt:
// what it waits on stops then); a stop the CLI didn't honour in CANCEL on
// a CLI others share: the call given up (gave, give), not waited for
type Run = {
  ask     : Ask;
  on      : (ev: Event) => void;
  proc    : Proc | null;
  sid     : string;
  token   : string;
  text    : string;
  mind    : string;
  last    : string;
  fresh   : boolean;
  reply   : string;
  said    : boolean;
  first   : number | null;
  grew    : boolean;
  steps   : boolean;
  calls   : Set<string>;
  n       : number;
  stopped : boolean;
  halt    : AbortController;
  gave    : Promise<null>;
  give    : () => void;
};

// Constants
// =========

// the most sessions an agent takes at once (each holds a helper of
// Google's till its agent ends)
const MOST = 4;

// how long the agents stay with no call (ms)
const IDLE = 10 * 60e3;

// how long an agent may take to start and sign in, and a session to be
// made and set (ms)
const READY = 90e3;
const SETUP = 60e3;

// how long a sign-in waits on the agent listing the account's models (ms):
// past it, the sign-in is done all the same, a call lists them
const LISTING = 15e3;

// how long a stop waits for the agent to end the turn: then, the agent
// alone with the call is killed; one others share takes no new call (it
// ends once theirs did) and the call is given up
const CANCEL = 5e3;

// the file in an account's folder its stamp is kept in (Antigravity.stamp)
const STAMP = ".illi-stamp";

// the file in an account's folder that says the CLI signed it in (its
// version), written as /login's sign-in ends: a folder without it (the
// one Google's old agent signed in, before illi ran the CLI) signs in
// again (Antigravity.lapsed)
const SIGNED = ".illi-signed";

// how long a sign-in may wait for the person to paste Google's code (ms)
const SIGNIN = 10 * 60e3;

// how old what the CLI leaves in an account's folder (its logs, its
// crash reports, its notes of each start) must be to go (ms)
const LEFT = 24 * 60 * 60e3;

// the CLI's own folders in an account's (Antigravity.home), whose files
// go a day old: its logs, crash reports, notes of each start
const LEAVES = ["log", "crashes", "implicit"];

// the most bytes of a tool's answer the agent passes on (it cuts at about
// 48 KB whatever this says; illi's own cut its tools' answers sooner)
const OUTPUT = 1_000_000;

// the agent's web tools, where a call searches the web
const WEB = ["search_web", "read_url_content"];

// the link the CLI's sign-in tells, to Google's page
const GOOGLE = /https:\/\/accounts\.google\.com\/\S+/;

// the environment's variables a CLI never gets (Antigravity.env): Gemini,
// Google, Antigravity (its old names too) and Cloud SDK keys and
// settings; the user's own folders for settings and data, and session
// bus
const OWN = /^(GEMINI_|GOOGLE_|AGY_|ANTIGRAVITY_|JETSKI_|CLOUDSDK_|CLOUD_CODE_)|^(XDG_(CONFIG|DATA|CACHE|STATE)_HOME|XDG_RUNTIME_DIR|DBUS_SESSION_BUS_ADDRESS)$/;

// said after illi's prompt in a call with tools: the prompt names illi's
// tools as on every provider (zoom, todo...), the model gets them by their
// MCP server's name
const NAMED = "Here illi's tools come through its MCP server: each is named mcp_illi_ and its name, so zoom is mcp_illi_zoom, shell mcp_illi_shell, and so on.";

// said last: Google's own prompt, before illi's, tells of a workspace
// folder, artifacts and file:// links of Antigravity's own
const PLACE = "Antigravity's own instructions above, of a workspace folder, an artifacts folder, a brain folder and file:// links, don't apply here: the folder you work in is the one named in illi's instructions, files are reached only through illi's tools, and answers are plain text.";

// what a failure says: too long for the window, a plan's limit, a sign-in
// run out, a busy service (the API's own words, as the agent passes them)
const FULL  = /exceeds the maximum number of tokens|input token count|too many tokens|context (window|length)/i;
const LIMIT = /usage limit reached|reached your current quota|resource.?exhausted|quota.?exhausted|\b429\b/i;
const LOGIN = /sign in again|log back in|authentication (required|expired)|auth_required|not (signed|logged) in|not logged into|credentials|unauthenticated|\b401\b/i;
const BUSY  = /overloaded|unavailable|try again later|connection (was )?lost|deadline|timed? ?out|\b5\d\d\b|ECONN/i;

// how the CLI's own words for a failed request start (its quota's, its
// errors', a lost connection's; the API's, as it passes them on; a
// warning sign before them, as the CLI marks them), told apart from the
// model's by these alone
const ERROR = /^\s*(?:⚠\uFE0F?\s*)?(Usage Limit Reached|Agent execution error:|Agent connection was lost|The input token count \(\d+\) exceeds|The model (API )?is (currently )?overloaded|Servers are overloaded|Resource has been exhausted)/i;

const NO_ACCOUNT = "no Google account is in use for Antigravity: /login signs in to one";
const NO_SIGNIN  = "your Google sign-in for Antigravity has run out: /login signs in again";

// the accounts' folders whose sign-in ran out in a call this run (those
// /login offers to sign in again: Antigravity.lapsed)
const LAPSED = new Set<string>();

// the accounts' folders tidied this run (Antigravity.tidy)
const TIDIED = new Set<string>();

// the agents running, and when they end with no call (IDLE)
let procs: Proc[] = [];
let idle: Timer | null = null;

// what to call as the account's models change (one: the chat's)
let watcher = () => {};

// the forwarder of illi's tools, and the calls it serves, by their path
let forwarder: ReturnType<typeof Bun.serve> | null = null;
const RUNS = new Map<string, Run>();

// Antigravity
// ===========

export namespace Antigravity {

  // how long a stop waits for the agent to end the turn (CANCEL; a test's
  // shorter)
  export let cancel = CANCEL;

  export function ask(ask: Ask, on: (ev: Event) => void): Try {
    const left: Say[] = [];
    const end = AskAI.end("");
    const none = (text: string, stop: End["stop"]): Try => ({ send: (say) => left.push(say), stop: () => {}, done: Promise.resolve({ ...end, text, stop, left }) });
    if (ask.from !== undefined) {
      return none("Antigravity can't go on from another request", "fail");
    }
    const folder = config.config_folder("antigravity");
    if (folder === "") {
      return none(NO_ACCOUNT, "down");
    }
    let give = () => {};
    const gave = new Promise<null>((done) => (give = () => done(null)));
    const run: Run = { ask, on, proc: null, sid: "", token: crypto.randomUUID(), text: "", mind: "", last: "", fresh: false, reply: "", said: false, first: null, grew: false, steps: false, calls: new Set(), n: 0, stopped: false, halt: new AbortController(), gave, give };
    const stop = () => {
      if (run.stopped) {
        return;
      }
      run.stopped = true;
      run.halt.abort();
      const proc = run.proc;
      if (proc !== null && run.sid !== "") {
        Acp.notify(proc.conn, "session/cancel", { sessionId: run.sid });
        setTimeout(() => Antigravity.deaf(proc, run), Antigravity.cancel).unref();
      }
    };
    const done = Antigravity.run(run, folder).then((e) => ({ ...e, left }));
    return { send: (say) => left.push(say), stop, done };
  }

  // a call run: the user's own CLI looked for (Agy.look: once a run), a
  // CLI of the account taken, a session made on the pick's model, the
  // message sent, its end read; its session's files removed, its CLI let
  // go. A sign-in run out: the account's folder offered a sign-in again
  // (lapsed)
  export async function run(run: Run, folder: string): Promise<End> {
    const end = await Antigravity.turn(run, folder);
    if (end.text === NO_SIGNIN) {
      LAPSED.add(folder);
    }
    return end;
  }

  export async function turn(run: Run, folder: string): Promise<End> {
    await Agy.look();
    if (Agy.command() === null) {
      return { ok: false, text: Agy.why(), left: [], stop: "down" };
    }
    let proc: Proc;
    try {
      proc = await Antigravity.take(folder);
    } catch (err: any) {
      return run.stopped ? Antigravity.lost(run) : Antigravity.failed(run, String(err?.message ?? err));
    }
    run.proc = proc;
    RUNS.set(run.token, run);
    try {
      if (run.stopped) {
        return Antigravity.lost(run);
      }
      const made = await Acp.call(proc.conn, "session/new", Antigravity.session(run, folder), SETUP);
      run.sid = String(made?.sessionId ?? "");
      proc.runs.set(run.sid, run);
      Antigravity.learn(made);
      const why = run.stopped ? null : await Antigravity.choose(proc.conn, run, made?.configOptions);
      if (why !== null) {
        return { ok: false, text: why, left: [], stop: "fail" };
      }
      if (run.stopped) {
        return Antigravity.lost(run);
      }
      const result = await Promise.race([Acp.call(proc.conn, "session/prompt", { sessionId: run.sid, prompt: Antigravity.prompt(run.ask) }), run.gave]);
      return result === null ? Antigravity.lost(run) : Antigravity.end(run, result);
    } catch (err: any) {
      if (run.stopped) {
        return Antigravity.lost(run);
      }
      return Antigravity.failed(run, String(err?.message ?? err));
    } finally {
      RUNS.delete(run.token);
      proc.runs.delete(run.sid);
      Antigravity.release(proc);
      Antigravity.clean(folder, run.sid);
    }
  }

  // a stop the agent didn't honour in CANCEL: an agent running this call
  // alone killed; one others share takes no new call, so it ends once
  // theirs did, and this call is given up, its session left to end with it
  export function deaf(proc: Proc, run: Run): void {
    if (!proc.runs.has(run.sid)) {
      return;
    }
    if (proc.runs.size === 1) {
      Acp.stop(proc.conn, "it didn't stop the turn");
      return;
    }
    proc.started = MOST;
    run.give();
  }

  // a session's settings: the account's empty folder; illi's tools
  // through the forwarder and the agent's web tools where the call has
  // them (none else); illi's prompt after Google's
  export function session(run: Run, folder: string): unknown {
    const tools = run.ask.server !== "" && !run.ask.once;
    const web   = tools && run.ask.searches > 0;
    const mcp   = tools ? [{ type: "http", name: "illi", url: Antigravity.forward() + "/" + run.token, headers: [] }] : [];
    return { cwd: Antigravity.work(folder), mcpServers: mcp, _meta: { antigravity: { enabledTools: web ? WEB : [], eagerMcpServers: tools ? ["illi"] : [], mcpMaxOutputBytes: OUTPUT, systemPrompt: { append: Antigravity.instructions(run.ask) } } } };
  }

  // illi's prompt, and in a call with tools how they're named there, then
  // what of Google's own doesn't apply
  export function instructions(ask: Ask): string {
    return [ask.system, ...(ask.server !== "" && !ask.once ? [NAMED] : []), PLACE].join("\n\n");
  }

  // the message: the blocks' texts, then the images
  export function prompt(ask: Ask): unknown[] {
    const text = ask.blocks.map((b) => b.text).filter((t) => t !== "").join("\n\n");
    return [{ type: "text", text }, ...(ask.imgs ?? []).map((img) => ({ type: "image", mimeType: img.type, data: img.data }))];
  }

  // the session set on the pick's model (Antigravity's model offered of
  // its family: the one at the effort's thinking level, else the family's
  // own) and its thinking level where offered; null: set, else why not
  // (the account doesn't offer the model: the Gemini models it offers)
  export async function choose(conn: Conn, run: Run, options: unknown): Promise<string | null> {
    const all    = Array.isArray(options) ? options : [];
    const model  = all.find((o: any) => o?.id === "model");
    const values = Antigravity.values(model);
    if (model === undefined) {
      return null;
    }
    const { model: id, effort } = run.ask;
    const want = [id + "-" + effort, id].find((v) => values.includes(v)) ?? values.find((v) => v.startsWith(id + "-"));
    if (want === undefined) {
      const gemini = values.filter((v) => v.startsWith("gemini-"));
      return "your Google AI plan doesn't offer " + id + " in Antigravity" + (gemini.length > 0 ? " (it offers " + Vendors.list(gemini, "and") + ")" : "") + ": /model picks another";
    }
    let now = all;
    if (model.currentValue !== want) {
      const set = await Acp.call(conn, "session/set_config_option", { sessionId: run.sid, configId: "model", value: want }, SETUP);
      now = Array.isArray(set?.configOptions) ? set.configOptions : all;
    }
    const level = now.find((o: any) => o?.id === "thinking_level");
    if (level !== undefined && level.currentValue !== effort && Antigravity.values(level).includes(effort)) {
      await Acp.call(conn, "session/set_config_option", { sessionId: run.sid, configId: "thinking_level", value: effort }, SETUP);
    }
    return null;
  }

  // a select option's values (its groups' too)
  export function values(option: any): string[] {
    const list: any[] = Array.isArray(option?.options) ? option.options : [];
    return list.flatMap((o) => (Array.isArray(o?.options) ? o.options : [o])).map((o: any) => String(o?.value ?? "")).filter((v: string) => v !== "");
  }

  // Models
  // ------

  // the models a session made tells the account offers, in the agent's
  // order: each a family (its model option's values, and the models it
  // lists, each id a family at a thinking level: gemini-3.8-flash-high),
  // its efforts the levels listed of it (else the session's thinking
  // levels), Gemini's alone; each window as known (none: told as a call
  // runs)
  export function catalog(made: any): Model[] {
    const all    = Array.isArray(made?.configOptions) ? made.configOptions : [];
    const levels = Antigravity.values(all.find((o: any) => o?.id === "thinking_level")).filter((e) => EFFORTS.includes(e));
    const listed = (Array.isArray(made?.models?.availableModels) ? made.models.availableModels : []).map((m: any) => String(m?.modelId ?? ""));
    const tells  = new RegExp("^(.+)-(" + EFFORTS.join("|") + ")$");
    const found  = new Map<string, Set<string>>();
    for (const id of [...Antigravity.values(all.find((o: any) => o?.id === "model")), ...listed]) {
      const [, family, effort] = tells.exec(id) ?? [id, id, ""];
      if (!/^gemini-[a-z0-9.-]+$/.test(family)) {
        continue;
      }
      const at = found.get(family) ?? new Set<string>();
      found.set(family, effort === "" ? at : at.add(effort));
    }
    return [...found].map(([family, at]) => {
      const own = EFFORTS.filter((e) => at.has(e));
      const efforts = own.length > 0 ? own : levels.length > 0 ? levels : undefined;
      return { label: family, id: family, speeds: ["slow"], window: Pick.model("antigravity", family)?.window, efforts };
    });
  }

  // the account's models, as a session made tells them, learned: the
  // list illi offers now (one gone from it gone; one new offered, unless
  // `models` names those offered), kept for the next start, the chat
  // told; the same list as known changes nothing
  export function learn(made: any): void {
    const list  = Antigravity.catalog(made);
    const shape = (models: Model[]) => JSON.stringify(models.map((m) => [m.label, m.efforts ?? []]));
    if (list.length === 0 || shape(list) === shape(Pick.list("antigravity"))) {
      return;
    }
    const fresh = Pick.learn("antigravity", list, "replace");
    if (!config.MODELS_SET) {
      config.OFFER.models.push(...fresh.filter((label) => !config.OFFER.models.includes(label)));
    }
    config.config_models_keep("antigravity", Pick.list("antigravity"));
    watcher();
  }

  // an agent signed in for an account asked the models it offers (a
  // session made, nothing asked of a model, its files removed): learned.
  // Never fails: a call learns them too
  export async function listed(conn: Conn, folder: string): Promise<void> {
    try {
      const made = await Acp.call(conn, "session/new", { cwd: Antigravity.work(folder), mcpServers: [], _meta: { antigravity: { enabledTools: [] } } }, LISTING);
      Antigravity.learn(made);
      Antigravity.clean(folder, String(made?.sessionId ?? ""));
    } catch {}
  }

  // what to call as the account's models change (one: the chat's)
  export function watch(fn: () => void): void {
    watcher = fn;
  }

  // Stream
  // ------

  // what the agent asked or told: a session's update, to its call; a
  // permission asked, answered; anything else it asks, refused
  export function heard(proc: Proc, m: Heard): void {
    if (m.method === "session/update") {
      const run = proc.runs.get(String(m.params?.sessionId ?? ""));
      if (run !== undefined && !run.stopped) {
        Antigravity.read(run, m.params?.update ?? {});
      }
      return;
    }
    if (m.method === "session/request_permission" && m.id !== undefined) {
      void Antigravity.permit(proc, m.id, m.params ?? {});
      return;
    }
    if (m.id !== undefined) {
      Acp.refuse(proc.conn, m.id, "illi doesn't take " + m.method);
    }
  }

  // a session's update: words and thoughts streamed; one of the agent's
  // web tools called, and what it answered (illi's own are the
  // forwarder's to log); a step's usage, telling the tokens read and the
  // model's window
  export function read(run: Run, u: any): void {
    switch (u.sessionUpdate) {
      case "agent_message_chunk": {
        return Antigravity.piece(run, "illi", String(u.content?.text ?? ""));
      }
      case "agent_thought_chunk": {
        return Antigravity.piece(run, "mind", String(u.content?.text ?? ""));
      }
      case "tool_call": {
        run.steps = true;
        if (Antigravity.ours(u)) {
          return;
        }
        Antigravity.flush(run);
        const id = String(u.toolCallId ?? "");
        run.calls.add(id);
        run.on({ $: "Entry", kind: "tool", text: Antigravity.called(u), of: id });
        return;
      }
      case "tool_call_update": {
        const id = String(u.toolCallId ?? "");
        if (!run.calls.has(id) || (u.status !== "completed" && u.status !== "failed")) {
          return;
        }
        run.calls.delete(id);
        const content = Array.isArray(u.content) ? u.content.map((c: any) => c?.content ?? c) : [];
        const text = AskAI.show(content) || (typeof u.rawOutput === "string" ? u.rawOutput : "");
        run.on({ $: "Entry", kind: "echo", text: (u.status === "failed" ? FAILED : "") + (text || "(no output)"), of: id });
        run.grew = true;
        return;
      }
      case "usage_update": {
        const used = Number(u.used);
        if (used > 0) {
          run.first ??= used;
        }
        if (Pick.told("antigravity", run.ask.model, Number(u.size))) {
          config.config_models_keep("antigravity", Pick.list("antigravity"));
        }
        return;
      }
    }
  }

  // whether a tool's call is one of illi's own, through its MCP server
  // (the forwarder logs those, illi judges each as it comes): the CLI
  // names each mcp_illi_ and its name, its title "Run" and that (its
  // _meta naming the server, in its other builds)
  export function ours(u: any): boolean {
    return u?._meta?.mcp?.server === "illi" || /^mcp_illi_/.test(String(u?.name ?? "")) || /^Run mcp_illi_/.test(String(u?.title ?? ""));
  }

  // one of the agent's web tools' calls, as illi shows Claude Code's (its
  // web search by the query, its page reading by the URL), any other by
  // its title
  export function called(u: any): string {
    const input = u.rawInput ?? {};
    if (u.kind === "search") {
      return "WebSearch " + JSON.stringify({ query: String(input.query ?? "") });
    }
    if (u.kind === "fetch") {
      return "WebFetch " + JSON.stringify({ url: String(input.Url ?? input.url ?? "") });
    }
    return String(u.title ?? "tool") + " " + JSON.stringify(input);
  }

  // a piece of words or thought, shown live
  export function piece(run: Run, kind: "illi" | "mind", text: string): void {
    if (text === "") {
      return;
    }
    if (kind === "illi") {
      run.text += text;
      run.last = text;
    } else {
      run.mind += text;
    }
    run.on({ $: "Delta", kind, text, fresh: run.fresh });
    run.fresh = false;
  }

  // what streamed, logged (its thought, then its words)
  export function flush(run: Run): void {
    if (run.mind.trim() !== "") {
      run.on({ $: "Entry", kind: "mind", text: run.mind.trim() });
    }
    if (run.text.trim() !== "") {
      run.reply = run.text.trim();
      run.said = true;
      run.on({ $: "Entry", kind: "illi", text: run.reply });
    }
    [run.mind, run.text, run.last, run.fresh] = ["", "", "", true];
  }

  // a permission the agent asks: a workspace's trust, refused; illi's own
  // tools, allowed once (illi judges each as it comes); its web search and
  // page reading, asked of the user as illi asks Claude Code's (approve);
  // anything else, refused
  export async function permit(proc: Proc, id: number | string, p: any): Promise<void> {
    const opts: any[] = Array.isArray(p.options) ? p.options : [];
    const pick = (kind: string) => opts.find((o) => o?.kind === kind)?.optionId;
    const answer = (option: string | undefined) => Acp.answer(proc.conn, id, { outcome: option === undefined ? { outcome: "cancelled" } : { outcome: "selected", optionId: option } });
    const trust = opts.find((o) => /don.?t trust/i.test(String(o?.name ?? "")));
    if (trust !== undefined) {
      return answer(trust.optionId);
    }
    const run  = proc.runs.get(String(p.sessionId ?? ""));
    const call = p.toolCall ?? {};
    if (run === undefined || run.stopped) {
      return answer(pick("reject_once"));
    }
    if (Antigravity.ours(call)) {
      return answer(pick("allow_once"));
    }
    const input = call.rawInput ?? {};
    const web: [string, unknown] | null = call.kind === "search" ? ["WebSearch", { query: String(input.query ?? "") }] : call.kind === "fetch" ? ["WebFetch", { url: String(input.Url ?? input.url ?? "") }] : null;
    const yes = web !== null && (await Antigravity.approve(run, web[0], web[1]));
    answer(pick(yes ? "allow_once" : "reject_once"));
  }

  // one of the agent's own tools asked of the user, as Claude Code's are
  // (Tools.approve, through the call's tools URL: a yes, unless a hook
  // changed its input, which the agent can't take)
  export async function approve(run: Run, tool: string, input: unknown): Promise<boolean> {
    if (run.ask.server === "") {
      return false;
    }
    try {
      const res  = await fetch(run.ask.server + "?hosted", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "approve", arguments: { tool_name: tool, input } } }), signal: run.halt.signal });
      const said = JSON.parse((await res.json())?.result?.content?.[0]?.text ?? "{}");
      return said?.behavior === "allow" && said.updatedInput === undefined;
    } catch {
      return false;
    }
  }

  // Forwarder
  // ---------

  // the forwarder's base URL, started as a call first needs it
  export function forward(): string {
    forwarder ??= Bun.serve({ port: 0, hostname: "127.0.0.1", idleTimeout: 0, fetch: Antigravity.relay });
    return "http://127.0.0.1:" + forwarder.port;
  }

  // a request of the agent's to illi's tools, passed on to the call's
  // tools URL as it came (stopped as the agent drops it, or the call
  // stops); a tool's call logged as it goes, with what it answered as that
  // comes back
  export async function relay(req: Request): Promise<Response> {
    const run = RUNS.get(new URL(req.url).pathname.slice(1));
    if (run === undefined) {
      return new Response(null, { status: 404 });
    }
    const body = req.method === "POST" ? await req.text() : undefined;
    const msg  = Agent.parse(body ?? "") as any;
    const call = msg?.method === "tools/call" ? msg.params ?? {} : null;
    const id   = call === null ? "" : "agy-" + run.token.slice(0, 8) + "-" + ++run.n;
    if (call !== null) {
      Antigravity.flush(run);
      run.on({ $: "Entry", kind: "tool", text: String(call.name ?? "") + " " + JSON.stringify(call.arguments ?? {}), of: id });
    }
    const headers: Record<string, string> = {};
    for (const h of ["content-type", "accept", "mcp-protocol-version", "mcp-session-id"]) {
      const v = req.headers.get(h);
      if (v !== null) {
        headers[h] = v;
      }
    }
    let res: Response;
    let text: string;
    try {
      res  = await fetch(run.ask.server, { method: req.method, headers, body, signal: AbortSignal.any([req.signal, run.halt.signal]) });
      text = await res.text();
    } catch {
      return new Response(null, { status: 502 });
    }
    if (call !== null && !run.stopped) {
      const r = (Agent.parse(text) as any)?.result;
      run.on({ $: "Entry", kind: "echo", text: (r?.isError ? FAILED : "") + (AskAI.show(r?.content) || "(no output)"), of: id });
      run.grew = true;
    }
    return new Response(text, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } });
  }

  // End
  // ---

  // the call's end from the turn's: answered, unless its words were an
  // error said as a message (the turn used nothing, or their last piece
  // is the agent's own words for one: those before it logged as cut off),
  // or it stopped another way: past the most tokens with nothing said, too
  // long for the window (`full`); else what it said logged and the stop in
  // plain words (Agent.stopped: the most the model may write at once, a
  // refusal), as illi's own loop ends one
  export function end(run: Run, result: any): End {
    const stop  = String(result?.stopReason ?? "");
    const used  = result?.usage !== undefined && result?.usage !== null;
    const error = run.text.trim() !== "" && (!used || ERROR.test(run.last));
    const read  = Number(result?.usage?.inputTokens);
    const first = run.first !== null ? { first: run.first } : !run.steps && read > 0 ? { first: read } : {};
    if (run.stopped || stop === "cancelled") {
      return Antigravity.lost(run);
    }
    if (error) {
      const said   = used ? run.last.trim() : run.text.trim();
      const before = used ? run.text.slice(0, run.text.length - run.last.length) : "";
      Agent.fail("", [{ kind: "mind", text: run.mind }, { kind: "illi", text: before }]).entries.forEach((e) => run.on({ $: "Entry", ...e }));
      run.said ||= before.trim() !== "";
      [run.mind, run.text, run.last] = ["", "", ""];
      return { ...Antigravity.failed(run, said), ...first };
    }
    if (stop === "end_turn" || stop === "") {
      Antigravity.flush(run);
      return { ok: true, text: run.reply, left: [], ...first };
    }
    if (stop === "max_tokens" && !run.said && run.text.trim() === "") {
      return { ok: false, text: "the request was too long for the model's window", left: [], stop: "full", grew: run.grew, ...first };
    }
    Antigravity.flush(run);
    const why = stop === "max_turn_requests" ? "Antigravity ended the turn: it took more steps than it allows in one" : Agent.stopped(stop, "Antigravity ended the turn (" + (stop || "no reason told") + ")");
    return { ok: false, text: why, left: [], stop: "fail", cut: run.said, ...first };
  }

  // a failure in plain words: too long for the window; the plan's limit
  // (when it resets, as the agent tells it); a sign-in run out; a busy
  // service (a later try may answer); else as the agent says it
  export function failed(run: Run, words: string): End {
    const said = words.replace(/^\s*⚠\uFE0F?\s*/, "");
    const cut  = { left: [], cut: run.said };
    if (!Agy.told(said) && said !== NO_SIGNIN) {
      console.error("antigravity: " + said.replace(/\s+/g, " ").slice(0, 300));
    }
    if (Agent.full(said) || FULL.test(said)) {
      return { ok: false, text: said, stop: "full", grew: run.grew, ...cut };
    }
    if (LIMIT.test(said)) {
      const reset = /your limit will reset (in|on) ([^.]+)\./i.exec(said);
      return { ok: false, text: "your Google AI plan's usage limit is reached" + (reset === null ? "" : ": it resets " + reset[1] + " " + reset[2]) + "; /model picks another model meanwhile", stop: "down", again: true, ...cut };
    }
    if (said === NO_SIGNIN || LOGIN.test(said)) {
      return { ok: false, text: NO_SIGNIN, stop: "down", ...cut };
    }
    if (Agy.told(said)) {
      return { ok: false, text: said, stop: "down", ...cut };
    }
    if (BUSY.test(said) || /^it ended/.test(said)) {
      return { ok: false, text: Agent.gone(""), stop: "down", again: true, ...cut };
    }
    return { ok: false, text: "Antigravity said: " + said.replace(/\s+/g, " ").trim().slice(0, 300), stop: "down", ...cut };
  }

  // a stopped call's end: what streamed, logged as cut off
  export function lost(run: Run): End {
    const seen: Entry[] = [{ kind: "mind", text: run.mind }, { kind: "illi", text: run.text }];
    Agent.fail("stopped", seen).entries.forEach((e) => run.on({ $: "Entry", ...e }));
    [run.mind, run.text] = ["", ""];
    return { ok: false, text: "stopped", left: [], stop: "lost", cut: run.said };
  }

  // CLIs
  // ----

  // a CLI of the account's for a call: one running a session with room
  // for more, else the spare, else a new one; a spare started beside it
  // at once. CLIs of another account, or of this one's folder before it
  // was made anew or signed in again (its stamp changed, here or in
  // another terminal), take no call: those idle end. Thrown: it won't
  // start
  export async function take(folder: string): Promise<Proc> {
    Antigravity.wake();
    const stamp = Antigravity.stamp(folder);
    for (const p of procs.filter((p) => (p.folder !== folder || p.stamp !== stamp) && p.live === 0)) {
      Antigravity.kill(p, "another account is in use");
    }
    for (const p of procs.filter((p) => p.folder === folder && p.stamp !== stamp)) {
      p.started = MOST;
    }
    const p = procs.find((p) => p.folder === folder && p.live > 0 && p.started < MOST && !p.conn.ended) ?? procs.find((p) => p.folder === folder && p.started === 0 && !p.conn.ended) ?? Antigravity.spawn(folder);
    p.started++;
    p.live++;
    if (!procs.some((o) => o.folder === folder && o.stamp === stamp && o.started === 0)) {
      try {
        Antigravity.spawn(folder);
      } catch {}
    }
    try {
      await p.ready;
    } catch (err: any) {
      Antigravity.release(p);
      throw new Error(String(err?.message ?? err));
    }
    return p;
  }

  // a CLI started for an account (its folder tidied first, once a run),
  // initialized (one older than MINIMUM refused: Antigravity.known), and
  // signed in to the gateway named, if one is (ready); never to Google:
  // the CLI uses the sign-in the folder keeps, a call failing at once
  // without one. Any failure to start ends it (so no call takes it), its
  // log going with it. Thrown: the CLI isn't here
  export function spawn(folder: string): Proc {
    const cmd = Agy.command();
    if (cmd === null) {
      throw new Error(Agy.why());
    }
    Antigravity.tidy(folder);
    const p = { folder, stamp: Antigravity.stamp(folder), started: 0, live: 0, runs: new Map() } as unknown as Proc;
    try {
      p.conn = Acp.start([...cmd, ...Antigravity.flags(folder)], Antigravity.work(folder), Antigravity.env(folder), (_, m) => Antigravity.heard(p, m), () => {});
    } catch (err: any) {
      throw new Error(/ENOENT|not found|EACCES/i.test(String(err?.message)) ? Agy.why() : String(err?.message ?? err));
    }
    p.ready = (async () => {
      Antigravity.known(await Acp.call(p.conn, "initialize", Antigravity.hello(), READY));
      if (Antigravity.gateway() !== "") {
        await Acp.call(p.conn, "authenticate", Antigravity.auth(), READY);
      }
    })();
    p.ready.catch(() => Antigravity.kill(p, "it didn't start"));
    const pid = p.conn.proc.pid;
    void p.conn.exited.then(() => {
      procs = procs.filter((o) => o !== p);
      Antigravity.unlog(folder, pid);
    });
    procs.push(p);
    return p;
  }

  // the CLI's answer to initialize taken: thrown, one older than illi
  // runs (MINIMUM: ILLI_ANTIGRAVITY's may be), as it says its version
  export function known(told: any): void {
    const version = String(told?.agentInfo?.version ?? "");
    if (/^\d+(\.\d+)*$/.test(version) && !Agy.least(version)) {
      throw new Error(Agy.older(version));
    }
  }

  // a call's CLI let go: one with no session running, that ran one, ends
  export function release(p: Proc): void {
    p.live = Math.max(0, p.live - 1);
    if (p.live === 0 && p.started > 0) {
      Antigravity.kill(p, "its calls ended");
    }
    Antigravity.wake();
  }

  export function kill(p: Proc, why: string): void {
    procs = procs.filter((o) => o !== p);
    Acp.stop(p.conn, why);
  }

  // the CLIs end once no call has run for IDLE (the spare too)
  export function wake(): void {
    if (idle !== null) {
      clearTimeout(idle);
    }
    idle = setTimeout(() => procs.filter((p) => p.live === 0).forEach((p) => Antigravity.kill(p, "no call for a while")), IDLE);
    idle.unref();
  }

  // every CLI ended, and the forwarder; the downloads no illi runs any
  // more gone (illi ends: Agy.tidy)
  export function close(): void {
    [...procs].forEach((p) => Antigravity.kill(p, "illi ended"));
    forwarder?.stop(true);
    forwarder = null;
    Agy.tidy();
  }

  // the CLIs running (a test's look)
  export function running(): number {
    return procs.length;
  }

  // Account
  // -------

  // the environment a CLI runs in: illi's, but any Gemini, Google or
  // Antigravity key or setting (the CLI would take one in place of the
  // sign-in, or another endpoint), and the user's own folders for its
  // settings and data (XDG's) and session bus (its keyring: the sign-in
  // goes to a file in the folder, never a keyring all accounts would
  // share); HOME and TMPDIR the account's folder's; no browser of its own
  // (BROWSER=false: illi opens Google's page itself at /login, as it does
  // ChatGPT's), nor its own updates. With ILLI_ANTIGRAVITY_GATEWAY, an AI
  // API gateway of the user's own in place of Google's services (a test's
  // stub)
  export function env(folder: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined && !OWN.test(k)) {
        env[k] = v;
      }
    }
    Object.assign(env, { HOME: folder, TMPDIR: path.join(folder, "tmp"), BROWSER: "false", AGY_CLI_DISABLE_AUTO_UPDATE: "1" });
    const gateway = Antigravity.gateway();
    if (gateway !== "") {
      Object.assign(env, { AGY_ACP_ENABLE_GATEWAY_AUTH: "1", AGY_LLM_GATEWAY_URL: gateway });
    }
    return env;
  }

  // the CLI's arguments after its command: its own folder the account's
  // (its settings, sign-in, sessions and logs), no telemetry; with a
  // gateway, Google's Cloud Code service the gateway too, so nothing goes
  // to Google
  export function flags(folder: string): string[] {
    const gateway = Antigravity.gateway();
    return ["--gemini-dir", Antigravity.home(folder, ""), "--disable-telemetry", ...(gateway !== "" ? ["--cloud_code_endpoint", gateway] : [])];
  }

  // the AI API gateway named ("": Google's own services)
  export function gateway(): string {
    return process.env.ILLI_ANTIGRAVITY_GATEWAY ?? "";
  }

  // illi as the CLI's client: its name and version, none of the client's
  // files or terminals offered (illi's tools are its own)
  export function hello(): unknown {
    const auth = Antigravity.gateway() !== "" ? { auth: { _meta: { gateway: true } } } : {};
    return { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false, ...auth }, clientInfo: { name: "illi", title: "illi", version: VERSION } };
  }

  // the sign-in a CLI uses: the gateway named, else Google's (the one its
  // folder keeps: asked only as /login's sign-in ends, never in a call)
  export function auth(): unknown {
    const gateway = Antigravity.gateway();
    return gateway !== "" ? { methodId: "gateway", _meta: { gateway: { baseUrl: gateway } } } : { methodId: "oauth-personal" };
  }

  // the account's empty folder the CLI works in (no project's rules load
  // from it), and its temporary one, made
  export function work(folder: string): string {
    const dir = path.join(folder, "work");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(folder, "tmp"), { recursive: true, mode: 0o700 });
    return dir;
  }

  // the CLI's own folder in an account's (--gemini-dir), or one of the
  // folders in its data there ("": the folder itself)
  export function home(folder: string, sub: string): string {
    return sub === "" ? path.join(folder, ".gemini") : path.join(folder, ".gemini", "antigravity-cli", sub);
  }

  // an account's folder's stamp: a random one written as the folder is
  // first used, so a folder removed and made anew under the same id (a
  // logout, then a sign-in), or signed in again (renew), is told apart
  // from the one a CLI started in ("": the folder isn't there)
  export function stamp(folder: string): string {
    const file = path.join(folder, STAMP);
    try {
      return fs.readFileSync(file, "utf8").trim();
    } catch {}
    try {
      fs.writeFileSync(file, crypto.randomUUID() + "\n", { flag: "wx", mode: 0o600 });
    } catch {}
    try {
      return fs.readFileSync(file, "utf8").trim();
    } catch {
      return "";
    }
  }

  // an account's folder's stamp made anew: the CLIs started before (here
  // and in other terminals) take no call, those idle end (take)
  export function renew(folder: string): void {
    fs.rmSync(path.join(folder, STAMP), { force: true });
    Antigravity.stamp(folder);
  }

  // whether an account's folder needs signing in again: the CLI never
  // signed it in (SIGNED: Google's old agent did), or its sign-in ran out
  // in a call this run
  export function lapsed(folder: string): boolean {
    return LAPSED.has(folder) || !fs.existsSync(path.join(folder, SIGNED));
  }

  // an account's CLIs ended (it's logged out here)
  export function forget(folder: string): void {
    procs.filter((p) => p.folder === folder).forEach((p) => Antigravity.kill(p, "its account was logged out"));
  }

  // a session's files gone from the account's folder (its conversation
  // and the CLI's notes of it)
  export function clean(folder: string, sid: string): void {
    if (!/^[A-Za-z0-9-]+$/.test(sid)) {
      return;
    }
    try {
      for (const f of fs.readdirSync(Antigravity.home(folder, "conversations")).filter((f) => f.startsWith(sid + "."))) {
        fs.rmSync(path.join(Antigravity.home(folder, "conversations"), f), { force: true });
      }
    } catch {}
    fs.rmSync(path.join(Antigravity.home(folder, "brain"), sid), { recursive: true, force: true });
  }

  // a CLI's log gone as it ends (its file names its process)
  export function unlog(folder: string, pid: number | undefined): void {
    try {
      for (const f of fs.readdirSync(Antigravity.home(folder, "log")).filter((f) => f.endsWith("-" + pid + ".log"))) {
        fs.rmSync(path.join(Antigravity.home(folder, "log"), f), { force: true });
      }
    } catch {}
  }

  // an account's folder tidied, once a run: Google's old agent's folder
  // gone (its sign-in, which the CLI doesn't take; illi doesn't read it),
  // and what the CLI leaves there a day old (LEAVES: its logs, crash
  // reports, notes of each start; a younger one may be another terminal's
  // CLI's, still running). One that won't go is left, never failing
  export function tidy(folder: string): void {
    if (TIDIED.has(folder)) {
      return;
    }
    TIDIED.add(folder);
    fs.rmSync(path.join(Antigravity.home(folder, ""), "antigravity-acp"), { recursive: true, force: true });
    for (const sub of LEAVES) {
      try {
        for (const f of fs.readdirSync(Antigravity.home(folder, sub))) {
          const at = path.join(Antigravity.home(folder, sub), f);
          if (Date.now() - fs.statSync(at).mtimeMs > LEFT) {
            fs.rmSync(at, { recursive: true, force: true });
          }
        }
      } catch {}
    }
  }

  // an account's folder signed in to a Google AI plan by the CLI's own
  // sign-in (`acp --login`, through pipes; the folder made first, readable
  // by the user alone): as it tells Google's page's link, and each time it
  // asks again, `ask` is told the link to open; `give` gives the CLI what
  // the person pasted (the code the page shows, or its address). Signed
  // in: the folder marked so (SIGNED) and its stamp made anew (renew),
  // then the CLI asked what it tells of the plan ("Google AI Pro"; "":
  // none told) and the models it offers (listed); done, the plan. Stop
  // kills it, as does SIGNIN passing; thrown (done): why it didn't sign
  // in; at once: the CLI isn't here
  export function signin(folder: string, stop: AbortSignal, ask: (url: string) => void): { give: (code: string) => void; done: Promise<string> } {
    const cmd = Agy.command();
    if (cmd === null) {
      throw new Error(Agy.why());
    }
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    Antigravity.tidy(folder);
    let proc: Subprocess<"pipe", "pipe", "pipe">;
    try {
      proc = Bun.spawn([...cmd, "--login", ...Antigravity.flags(folder)], { cwd: Antigravity.work(folder), env: Antigravity.env(folder), stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    } catch {
      throw new Error(Agy.why());
    }
    const kill = () => proc.kill("SIGKILL");
    stop.addEventListener("abort", kill, { once: true });
    let late = false;
    const timer = setTimeout(() => ((late = true), kill()), SIGNIN);
    let said = "";
    let asked = 0;
    const from = proc.stdout.getReader();
    const read = (async () => {
      const text = new TextDecoder();
      for (let got = await from.read(); !got.done; got = await from.read()) {
        said += text.decode(got.value, { stream: true });
        const url = GOOGLE.exec(said)?.[0];
        for (const asks = url === undefined ? 0 : Math.max(1, said.split(/paste the authorization code/i).length - 1); asked < asks; asked++) {
          ask(url!);
        }
      }
    })().catch(() => {});
    const errs = new Response(proc.stderr).text().catch(() => "");
    const give = (code: string) => {
      try {
        proc.stdin.write(code.trim() + "\n");
        proc.stdin.flush();
      } catch {}
    };
    const done = (async () => {
      const code = await proc.exited;
      clearTimeout(timer);
      stop.removeEventListener("abort", kill);
      Antigravity.unlog(folder, proc.pid);
      if (stop.aborted) {
        throw new Error("the sign-in was stopped");
      }
      if (late) {
        throw new Error("no code came in " + SIGNIN / 60e3 + " minutes, so illi stopped waiting");
      }
      await Promise.race([read, Bun.sleep(500)]);
      void from.cancel().catch(() => {});
      if (code !== 0) {
        const lines = (said + "\n" + (await Promise.race([errs, Bun.sleep(500).then(() => "")]))).split("\n").map((l) => l.trim().replace(/^Error:\s*/, ""));
        const last  = lines.filter((l) => l !== "" && !GOOGLE.test(l) && !/^(Open this link|Then paste)/.test(l)).at(-1);
        throw new Error(last === undefined ? "Google's sign-in ended (exit " + code + ")" : "Google's sign-in said “" + last + "”");
      }
      fs.writeFileSync(path.join(folder, SIGNED), (Agy.installed()?.version ?? Agy.pin?.version ?? "") + "\n", { mode: 0o600 });
      LAPSED.delete(folder);
      Antigravity.renew(folder);
      return Antigravity.plan(folder, cmd);
    })();
    return { give, done };
  }

  // what a CLI just signed in tells of the plan ("Google AI Pro"; "":
  // none told, as it tells it to Google's sign-in, its folder's kept),
  // the models it offers learned (listed). Never fails: a call learns
  // them too
  export async function plan(folder: string, cmd: string[]): Promise<string> {
    let conn: Conn;
    try {
      conn = Acp.start([...cmd, ...Antigravity.flags(folder)], Antigravity.work(folder), Antigravity.env(folder), (c, m) => m.id !== undefined && Acp.refuse(c, m.id, "not while signing in"), () => {});
    } catch {
      return "";
    }
    try {
      Antigravity.known(await Acp.call(conn, "initialize", Antigravity.hello(), READY));
      const told = await Acp.call(conn, "authenticate", Antigravity.auth(), LISTING).catch(() => null);
      await Antigravity.listed(conn, folder);
      return String(told?._meta?.antigravity?.tier?.name ?? "");
    } catch {
      return "";
    } finally {
      Acp.stop(conn, "signed in");
      void conn.exited.then(() => Antigravity.unlog(folder, conn.proc.pid));
    }
  }

  // an account's folder logged out (the CLI's own logout: its sign-in
  // gone), by the CLI or, none here, by another version downloaded (a
  // logout asks no model: Agy.any); false: it couldn't
  export async function logout(folder: string): Promise<boolean> {
    await Agy.look();
    const cmd = Agy.any();
    if (cmd === null || !fs.existsSync(folder)) {
      return false;
    }
    let conn: Conn;
    try {
      conn = Acp.start([...cmd, ...Antigravity.flags(folder)], Antigravity.work(folder), Antigravity.env(folder), (c, m) => m.id !== undefined && Acp.refuse(c, m.id, "not while logging out"), () => {});
    } catch {
      return false;
    }
    try {
      await Acp.call(conn, "initialize", Antigravity.hello(), READY);
      await Acp.call(conn, "logout", {}, READY);
      return true;
    } catch {
      return false;
    } finally {
      Acp.stop(conn, "logged out");
    }
  }

}

// antigravity's code, as the rest of illi asks it (Provider.ts): a call
// run by Google's CLI itself (a runner); while the chat is on it (at the
// start, as the chat moves to it, after /login: Chat.account), this
// illi's build of the CLI downloaded by itself where autoupdate is on, an
// account is connected and no CLI is here (Agy.auto); the chat told as
// the account's models change; its CLIs ended as illi ends, and the
// downloads no illi runs any more gone
export const PROVIDER: Provider = {
  facts   : FACTS,
  ask     : Antigravity.ask,
  account : () => Agy.auto(config.AUTOUPDATE, config.config_folder("antigravity") !== "") ?? undefined,
  watch   : Antigravity.watch,
  close   : Antigravity.close,
};
