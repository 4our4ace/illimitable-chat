// Copilot
// =======
// github-copilot: a GitHub Copilot plan's models, run by GitHub's own
// Copilot CLI as its SDK runs it (`copilot --headless --stdio`, its
// JSON-RPC server: Rpc.ts), unmodified: the user's own once it's new
// enough, else the build this illi is pinned to, which /login downloads
// (CopilotCli.ts), run at the version it is (none of the newer ones it
// downloads of itself), signed in by the CLI's own GitHub sign-in (its
// device code, over its connection: /login opens GitHub's page and
// copies the code: Login.ts; illi never reads the token). Each account
// is a folder of illi's, the CLI's home there (COPILOT_HOME: its
// sign-in's note, its sessions' files, its logs; the token itself in the
// system's keychain where there is one, by its GitHub login), so the
// user's own Copilot settings, MCP servers, hooks, skills and plugins
// never load; an environment's GitHub tokens (they'd be taken in place
// of the sign-in) and Copilot settings never reach the CLI, nor its
// telemetry, its built-in MCP servers (GitHub's own) or a browser of its
// own. What it caches as it runs (its MCP servers' tool lists) goes in a
// folder of the account's, gone as it ends; what it unpacks of itself as
// it first runs stays where the user's own CLI keeps it, illi's build's
// in its version's folder (Copilot.unpacked), so nothing of illi's is
// left outside illi's folder.
//
// A call is a session of its own (session.create, its id illi's), as a
// `claude -p` is on claude-code: illi's prompt in place of Copilot's own
// (systemMessage replace), in an empty folder of the account's, on the
// pick's model (Copilot's id) at its effort, with no compaction, memory,
// skills or large-output files of the CLI's own (illi folds the chat and
// cuts its tools' answers itself). Its tools are illi's whole list, over
// MCP (the CLI names each illi- and its name), run by illi, so
// permissions, hooks and background jobs are as on every provider; of
// Copilot's own only its web fetch and search, where the call searches
// the web (Ask.searches), each asked of the user at illi's screen as
// Claude Code's are (Tools.approve, through the call's tools URL); none
// else. A call without tools (a summary, a goal check, a recap: `once`)
// has none. The blocks go as one message, the images attached; a message
// sent mid-run is left for the next turn (End.left). Its session's files
// are removed as it ends, each CLI's log as the CLI ends.
//
// Its stream: the model's thoughts and words shown live, logged as a
// tool call follows them or the turn ends; each tool's call logged with
// what it answered, as the CLI tells both. Its failures come as the
// CLI's own kinds: too long for the window (`full`: illi folds the chat;
// the CLI's own count past it too, which has no kind: BUDGET),
// the plan's credits used up, a rate limit (a later try may answer), a
// sign-in run out (/login signs in again), a policy of the account's
// organization, a busy service; and, whatever its kind, an account
// GitHub gives no Copilot (its subscription ended, none ever: said with
// what's open to it and where, never GitHub's raw answer; its models
// refused as they're listed tell it first: Copilot.listed); and a CLI
// that can't start (a library it lacks, a folder it may not run from),
// said with its exit code and its own last words, never tried again. A
// stop
// aborts the turn (session.abort), given up past CANCEL. Each request's
// usage tells the tokens read, the plan's use (the side's), and a
// model's window where its list told none (Auto's: the model it
// picked).
//
// The CLIs run one an account, as a call needs it (about two seconds),
// each taking any number of sessions at once, and end once no call has
// run for IDLE, or as illi ends (close, which `illi uninstall` waits on
// till they have; a CLI ends too as its input closes, however illi
// ends). A call never signs in: the CLI uses the
// sign-in its folder keeps, and with none (or one run out) the call fails
// at once, saying /login signs in again. The account's models are its
// own, as the CLI lists them (models.list: the policy's disabled ones and
// those without tools left out), asked as the chat is on the plan and as
// /login connects it, kept for the next start, the chat told (watch).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AskAI, type Ask, type End, type Event, type Say, type Try } from "../../ai/AskAI.ts";
import { Agent, type Entry } from "../../ai/Agent.ts";
import { EFFORTS, Pick, type Model } from "../../ai/Pick.ts";
import { FAILED, type Plan } from "../../ui/View.ts";
import * as config from "../../config/Config.ts";
import { VERSION } from "../../config/Update.ts";
import { CopilotCli } from "./CopilotCli.ts";
import { FACTS } from "./Facts.ts";
import { Rpc, type Conn, type Heard } from "./Rpc.ts";
import type { Provider } from "../Provider.ts";

// Types
// =====

// a CLI running for an account (its folder, and the folder's stamp as it
// started: Copilot.stamp), its connection, whether it's ready (its
// protocol told), the calls running on it now, by their session
type Proc = {
  conn   : Conn;
  folder : string;
  stamp  : string;
  ready  : Promise<void>;
  live   : number;
  runs   : Map<string, Run>;
};

// a call as it runs: what it asks and where its events go, its CLI and
// session; the words and thoughts streaming, not logged yet, whether the
// next piece starts an entry; the last words logged, whether any were;
// the tokens its first request read; whether a tool's answer came back;
// the tools called, waiting for their answers; the failure the CLI told
// (null: none); whether it was stopped (halt: what it waits on stops
// then); its end waited on (idle: the session is idle, or given up)
type Run = {
  ask     : Ask;
  on      : (ev: Event) => void;
  proc    : Proc | null;
  sid     : string;
  text    : string;
  mind    : string;
  fresh   : boolean;
  reply   : string;
  said    : boolean;
  first   : number | null;
  grew    : boolean;
  calls   : Set<string>;
  error   : any;
  stopped : boolean;
  halt    : AbortController;
  idled   : Promise<void>;
  idle    : () => void;
};

// what a sign-in tells of the account: its GitHub login, its plan
// ("Business"; "": none told), why GitHub gives it no Copilot ("": it
// does: Copilot.lack)
export type Who = { login: string; plan: string; lack: string };

// Constants
// =========

// the CLI's protocol illi speaks (its SDK's: 3), refused unless the CLI
// speaks the same, as GitHub's SDK refuses it
const PROTOCOL = 3;

// how long the CLIs stay with no call (ms)
const IDLE = 10 * 60e3;

// how long a CLI may take to start and tell its protocol, a session to be
// made, the account to tell its models or plan (ms)
const READY = 60e3;
const SETUP = 60e3;
const ASKED = 15e3;

// how long a stop waits for the CLI to end the turn: then it's given up
const CANCEL = 5e3;

// how long a sign-in may wait for the person at GitHub's page (ms): a
// device code's life
const SIGNIN = 15 * 60e3;

// the file in an account's folder its stamp is kept in (Copilot.stamp)
const STAMP = ".illi-stamp";

// what of Copilot's own a call runs: illi's tools through its MCP server,
// and the CLI's web fetch and search, where the call searches the web
const MCP = "mcp:*";
const WEB = ["builtin:web_fetch", "builtin:web_search"];

// the plan's credits' window, as the side shows it (a month, in minutes)
const MONTH = 30 * 24 * 60;

// the environment's variables a CLI never gets (Copilot.env): GitHub
// tokens (they'd be taken in place of the sign-in), the GitHub host
// (illi signs in to github.com), Copilot's own settings (its folders
// illi names itself)
const OWN = /^(COPILOT_|GH_|GITHUB_TOKEN$)/;

// the folder in an account's that each CLI's cache is in, one a CLI
// (Copilot.cache), and how old one left by a CLI that never ended (illi
// killed) must be to go (ms)
const CACHES = "cache";
const LEFT   = 24 * 60 * 60e3;

// said after illi's prompt in a call with tools: the prompt names illi's
// tools as on every provider (zoom, todo...), the model gets them by
// their MCP server's name
const NAMED = "Here illi's tools come through its MCP server: each is named illi- and its name, so zoom is illi-zoom, shell illi-shell, and so on.";

// what a failure says, beyond the kind the CLI tells: a busy service
const BUSY = /overloaded|unavailable|try again later|timed? ?out|ECONN|socket hang up/i;

// the CLI's own refusal of a request it counts past the model's window,
// before sending it (a `query` failure, no kind of its own: "Request
// exceeds the model's prompt budget after reserving output (130042
// tokens; limit 128000)")
const BUDGET = /exceeds the model's prompt budget/i;

// what GitHub says of an account it gives no Copilot (its subscription
// ended, or it never had one: its models not listed, every request
// refused), and where an account starts Copilot Free or a plan (the
// CLI's own link for it)
const DENIED = /not authorized to use this Copilot feature|no Copilot access/i;
export const SETTINGS = "https://github.com/settings/copilot/features";

// what a call says with no account in use, and with one whose sign-in
// ran out (the second also tells /login to offer the sign-in again:
// LAPSED)
const NO_ACCOUNT = "no GitHub account is in use for Copilot: /login signs in to one";
const NO_SIGNIN  = "your GitHub sign-in for Copilot has run out: /login signs in again";

// the accounts' folders whose sign-in ran out in a call this run (those
// /login offers to sign in again: Copilot.lapsed)
const LAPSED = new Set<string>();

// the accounts' folders GitHub gives no Copilot, as last asked (their
// models refused: Copilot.listed), each with why (Copilot.lack)
const BARRED = new Map<string, string>();

// the CLIs running, and when they end with no call (IDLE); those asked
// to end, each till it has (close waits on them)
let procs: Proc[] = [];
let idle: Timer | null = null;
const ending = new Set<Promise<void>>();

// what to call as the account's models change (one: the chat's)
let watcher = () => {};

// the plan as last told, and the account's folder it was told of
let told: { folder: string; plan: Plan } | null = null;

// Copilot
// =======

export namespace Copilot {

  // how long a stop waits for the CLI to end the turn (CANCEL; a test's
  // shorter)
  export let cancel = CANCEL;

  // a call (Provider.ts ask): run on the account in use (Copilot.run),
  // its end with what was sent mid-run left for the next turn; a stop
  // aborts the turn (session.abort) and gives it up past `cancel`. One
  // that goes on from another request, or with no account in use, ends
  // at once, saying so
  export function ask(ask: Ask, on: (ev: Event) => void): Try {
    const left: Say[] = [];
    const end = AskAI.end("");
    const none = (text: string, stop: End["stop"]): Try => ({ send: (say) => left.push(say), stop: () => {}, done: Promise.resolve({ ...end, text, stop, left }) });
    if (ask.from !== undefined) {
      return none("GitHub Copilot can't go on from another request", "fail");
    }
    const folder = config.config_folder("github-copilot");
    if (folder === "") {
      return none(NO_ACCOUNT, "down");
    }
    let idle = () => {};
    const idled = new Promise<void>((done) => (idle = done));
    const run: Run = { ask, on, proc: null, sid: crypto.randomUUID(), text: "", mind: "", fresh: false, reply: "", said: false, first: null, grew: false, calls: new Set(), error: null, stopped: false, halt: new AbortController(), idled, idle };
    const stop = () => {
      if (run.stopped) {
        return;
      }
      run.stopped = true;
      run.halt.abort();
      if (run.proc !== null) {
        void Rpc.call(run.proc.conn, "session.abort", { sessionId: run.sid, reason: "user_initiated" }).catch(() => {});
      }
      setTimeout(run.idle, Copilot.cancel).unref();
    };
    const done = Copilot.run(run, folder).then((e) => ({ ...e, left }));
    return { send: (say) => left.push(say), stop, done };
  }

  // a call run: the CLI found (the user's own looked for once a run:
  // CopilotCli.look; none here, why said), the account's taken, a session
  // made on the pick's model, the message sent, the session's end waited
  // for and read; its files removed, its CLI let go. A sign-in run out:
  // the account's folder offered a sign-in again (lapsed), till a call
  // runs on it
  export async function run(run: Run, folder: string): Promise<End> {
    await CopilotCli.look();
    if (CopilotCli.command() === null) {
      return { ok: false, text: CopilotCli.why(), left: [], stop: "down" };
    }
    let proc: Proc;
    try {
      proc = await Copilot.take(folder);
    } catch (err: any) {
      return run.stopped ? Copilot.lost(run) : Copilot.failed(run, { message: String(err?.message ?? err) });
    }
    run.proc = proc;
    proc.runs.set(run.sid, run);
    try {
      if (run.stopped) {
        return Copilot.lost(run);
      }
      await Rpc.call(proc.conn, "session.create", Copilot.session(run, folder), SETUP);
      if (run.stopped) {
        return Copilot.lost(run);
      }
      await Rpc.call(proc.conn, "session.send", { sessionId: run.sid, ...Copilot.prompt(run.ask) }, SETUP);
      await run.idled;
      const end = proc.conn.ended && !run.stopped && run.error === null ? Copilot.failed(run, { message: proc.conn.why }) : Copilot.end(run);
      if (end.text !== NO_SIGNIN) {
        LAPSED.delete(folder);
      }
      return end;
    } catch (err: any) {
      return run.stopped ? Copilot.lost(run) : Copilot.failed(run, { message: String(err?.message ?? err) });
    } finally {
      proc.runs.delete(run.sid);
      void Rpc.call(proc.conn, "sessions.delete", { sessionId: run.sid }, SETUP).catch(() => {});
      Copilot.release(proc);
    }
  }

  // a session's settings: illi's id for it, the pick's model at its effort
  // (where the model takes one), illi's prompt in place of Copilot's; the
  // account's empty folder; illi's tools through its MCP server and the
  // CLI's web tools where the call has them, none else; no compaction,
  // memory, skills or large-output files of the CLI's own; the CLI's
  // permission asked of illi. With ILLI_COPILOT_GATEWAY, the model asked
  // of an OpenAI-compatible API of the user's own (a test's stub) in place
  // of GitHub's
  export function session(run: Run, folder: string): unknown {
    const ask   = run.ask;
    const tools = ask.server !== "" && !ask.once;
    const model = Pick.model("github-copilot", ask.model);
    const takes = model?.efforts?.includes(ask.effort) ?? false;
    const gate  = Copilot.gateway();
    return {
      sessionId          : run.sid,
      clientName         : "illi",
      model              : model?.id ?? ask.model,
      ...(takes ? { reasoningEffort: ask.effort } : {}),
      systemMessage      : { mode: "replace", content: Copilot.instructions(ask) },
      workingDirectory   : Copilot.work(folder),
      mcpServers         : tools ? { illi: { type: "http", url: ask.server, tools: ["*"] } } : {},
      availableTools     : tools ? [MCP, ...(ask.searches > 0 ? WEB : [])] : [],
      streaming          : true,
      requestPermission  : true,
      infiniteSessions   : { enabled: false },
      memory             : { enabled: false },
      enableSkills       : false,
      largeOutput        : { enabled: false },
      envValueMode       : "direct",
      ...(gate !== "" ? { provider: { type: "openai", baseUrl: gate, apiKey: "illi" } } : {}),
    };
  }

  // illi's prompt, and in a call with tools how they're named there
  export function instructions(ask: Ask): string {
    return ask.server !== "" && !ask.once ? ask.system + "\n\n" + NAMED : ask.system;
  }

  // the message: the blocks' texts, the images attached
  export function prompt(ask: Ask): { prompt: string; attachments?: unknown[] } {
    const text = ask.blocks.map((b) => b.text).filter((t) => t !== "").join("\n\n");
    const imgs = (ask.imgs ?? []).map((img, k) => ({ type: "blob", data: img.data, mimeType: img.type, displayName: "image " + (k + 1) }));
    return imgs.length > 0 ? { prompt: text, attachments: imgs } : { prompt: text };
  }

  // the gateway named ("": GitHub's own service)
  export function gateway(): string {
    return process.env.ILLI_COPILOT_GATEWAY ?? "";
  }

  // Stream
  // ------

  // what the CLI asked or told: a session's event, to its call (a
  // sub-agent's left: illi runs its own); anything it asks, refused
  export function heard(proc: Proc, m: Heard): void {
    if (m.method === "session.event") {
      const run = proc.runs.get(String(m.params?.sessionId ?? ""));
      const ev  = m.params?.event;
      if (run !== undefined && ev !== undefined && ev.agentId === undefined) {
        Copilot.read(proc, run, ev);
      }
      return;
    }
    if (m.id !== undefined) {
      Rpc.refuse(proc.conn, m.id, "illi doesn't take " + m.method);
    }
  }

  // a session's event: words and thoughts streamed (a message none
  // streamed, whole); a tool called, and what it answered; a request's
  // usage (the tokens read, the plan's use), the window the CLI holds the
  // model to; a permission asked; a failure told; the session idle
  export function read(proc: Proc, run: Run, ev: any): void {
    const d = ev.data ?? {};
    switch (ev.type) {
      case "assistant.message_delta": {
        return run.stopped ? undefined : Copilot.piece(run, "illi", String(d.deltaContent ?? ""));
      }
      case "assistant.reasoning_delta": {
        return run.stopped ? undefined : Copilot.piece(run, "mind", String(d.deltaContent ?? ""));
      }
      case "assistant.message": {
        if (!run.stopped && run.text.trim() === "") {
          Copilot.piece(run, "illi", String(d.content ?? ""));
        }
        return;
      }
      case "tool.execution_start": {
        const id = String(d.toolCallId ?? "");
        Copilot.flush(run);
        run.calls.add(id);
        run.on({ $: "Entry", kind: "tool", text: Copilot.called(d), of: id });
        return;
      }
      case "tool.execution_complete": {
        const id = String(d.toolCallId ?? "");
        if (!run.calls.delete(id) || run.stopped) {
          return;
        }
        const r = d.result ?? {};
        const text = AskAI.show(Array.isArray(r.contents) ? r.contents : r.content ?? "") || String(d.error?.message ?? "");
        run.on({ $: "Entry", kind: "echo", text: (d.success === false ? FAILED : "") + (text || "(no output)"), of: id });
        run.grew = true;
        return;
      }
      case "assistant.usage": {
        const read = Number(d.inputTokens);
        if (read > 0) {
          run.first ??= read;
        }
        Copilot.quota(proc.folder, d.quotaSnapshots);
        return;
      }
      case "session.usage_info": {
        const model = Pick.model("github-copilot", run.ask.model);
        if (model !== undefined && model.window === undefined && Pick.told("github-copilot", model.id, Number(d.tokenLimit))) {
          config.config_models_keep("github-copilot", Pick.list("github-copilot"));
        }
        return;
      }
      case "permission.requested": {
        void Copilot.permit(proc, run, d);
        return;
      }
      case "session.error": {
        run.error = d;
        return;
      }
      case "session.idle": {
        run.idle();
        return;
      }
    }
  }

  // a tool's call, as illi logs it: one of illi's by its own name, the
  // CLI's web fetch and search as illi shows Claude Code's (by the URL, the
  // query), any other by its name; with its input
  export function called(d: any): string {
    const input = d.arguments ?? {};
    if (d.mcpServerName === "illi" && typeof d.mcpToolName === "string") {
      return d.mcpToolName + " " + JSON.stringify(input);
    }
    if (d.toolName === "web_fetch") {
      return "WebFetch " + JSON.stringify({ url: String(input.url ?? "") });
    }
    if (d.toolName === "web_search") {
      return "WebSearch " + JSON.stringify({ query: String(input.query ?? "") });
    }
    return String(d.toolName ?? "tool") + " " + JSON.stringify(input);
  }

  // a piece of words or thought, shown live
  export function piece(run: Run, kind: "illi" | "mind", text: string): void {
    if (text === "") {
      return;
    }
    if (kind === "illi") {
      run.text += text;
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
    [run.mind, run.text, run.fresh] = ["", "", true];
  }

  // a permission the CLI asks: illi's own tools, allowed once (illi judges
  // each as it comes); its web fetch, asked of the user as illi asks
  // Claude Code's (approve); anything else, or for a call stopped,
  // refused
  export async function permit(proc: Proc, run: Run, d: any): Promise<void> {
    const ask = d.permissionRequest ?? {};
    const answer = (yes: boolean) => Rpc.call(proc.conn, "session.permissions.handlePendingPermissionRequest", { sessionId: run.sid, requestId: d.requestId, result: yes ? { kind: "approve-once" } : { kind: "reject" } }).catch(() => {});
    if (run.stopped) {
      return void answer(false);
    }
    if (ask.kind === "mcp" && ask.serverName === "illi") {
      return void answer(true);
    }
    if (ask.kind === "url") {
      return void answer(await Copilot.approve(run, "WebFetch", { url: String(ask.url ?? "") }));
    }
    return void answer(false);
  }

  // one of the CLI's own tools asked of the user, as Claude Code's are
  // (Tools.approve, through the call's tools URL: a yes, unless a hook
  // changed its input, which the CLI can't take)
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

  // End
  // ---

  // the call's end from the session's: stopped; failed, as the CLI told
  // (what streamed before it logged as cut off); else answered
  export function end(run: Run): End {
    const first = run.first !== null ? { first: run.first } : {};
    if (run.stopped) {
      return Copilot.lost(run);
    }
    if (run.error !== null) {
      const seen: Entry[] = [{ kind: "mind", text: run.mind }, { kind: "illi", text: run.text }];
      Agent.fail("", seen).entries.forEach((e) => run.on({ $: "Entry", ...e }));
      run.said ||= run.text.trim() !== "";
      [run.mind, run.text] = ["", ""];
      return { ...Copilot.failed(run, run.error), ...first };
    }
    Copilot.flush(run);
    return { ok: true, text: run.reply, left: [], ...first };
  }

  // a failure in plain words: a CLI that didn't start (Rpc.gone: its
  // exit code and last words, as they are, a later try ending the same);
  // else by the kind the CLI tells: too long for the window (the model's
  // refusal, or the CLI's own before it sends: BUDGET); an account GitHub
  // gives no Copilot (why, as last asked:
  // Copilot.lack, with where to start a plan); a sign-in run out; the
  // plan's credits used up (when they start anew, where told); a rate
  // limit (a later try may answer); the account's organization's policy;
  // a busy service (a CLI that ended mid-call too: a later try may
  // answer); else as the CLI says it. Why no CLI is here (CopilotCli.why) is said as it is, never
  // logged as the CLI's failure
  export function failed(run: Run, e: any): End {
    const said = String(e?.message ?? "").replace(/\s+/g, " ").trim();
    const kind = String(e?.errorType ?? "");
    const cut  = { left: [], cut: run.said };
    if (CopilotCli.told(said)) {
      return { ok: false, text: said, stop: "down", ...cut };
    }
    if (kind !== "rate_limit" && kind !== "quota") {
      console.error("github-copilot: " + (kind === "" ? "" : kind + ": ") + said.slice(0, 300));
    }
    if (said.startsWith(CopilotCli.spec.name + " didn't start")) {
      return { ok: false, text: said.slice(0, 400), stop: "down", ...cut };
    }
    if (kind === "context_limit" || e?.providerErrorCode === "context_length_exceeded" || BUDGET.test(said) || Agent.full(said)) {
      return { ok: false, text: said || "the request was too long for the model's window", stop: "full", grew: run.grew, ...cut };
    }
    if (DENIED.test(said)) {
      return { ok: false, text: "GitHub won't let your account use Copilot: " + ((run.proc === null ? undefined : BARRED.get(run.proc.folder)) ?? Copilot.lack(null)), stop: "down", ...cut };
    }
    if (kind === "authentication" || /not authenticated|please authenticate/i.test(said)) {
      if (run.proc !== null) {
        LAPSED.add(run.proc.folder);
      }
      return { ok: false, text: NO_SIGNIN, stop: "down", ...cut };
    }
    if (kind === "quota") {
      const reset = Copilot.plan()?.limits[0]?.reset;
      return { ok: false, text: "your GitHub Copilot plan's usage is used up" + (reset ? ": it starts anew " + new Date(reset).toDateString() : "") + " (GitHub said: " + said.slice(0, 200) + ")", stop: "down", ...cut };
    }
    if (kind === "rate_limit") {
      return { ok: false, text: "GitHub Copilot is rate-limiting your account for now: " + said.slice(0, 200), stop: "down", again: true, ...cut };
    }
    if (kind === "authorization" || kind === "policy") {
      return { ok: false, text: "GitHub Copilot refused: " + said.slice(0, 300), stop: "down", ...cut };
    }
    if (Number(e?.statusCode) >= 500 || BUSY.test(said) || /^it ended/.test(said)) {
      return { ok: false, text: Agent.gone(""), stop: "down", again: true, ...cut };
    }
    return { ok: false, text: "GitHub Copilot said: " + said.slice(0, 300), stop: "down", ...cut };
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

  // the account's CLI for a call: the one running, else a new one (the
  // CLI's command, else the one named: a logout's). CLIs of another
  // account, or of this one's folder before it was made anew or signed in
  // again (its stamp changed, here or in another terminal), take no call:
  // those idle end. Thrown: it won't start
  export async function take(folder: string, cmd: string[] | null = null): Promise<Proc> {
    Copilot.wake();
    const stamp = Copilot.stamp(folder);
    for (const p of procs.filter((p) => (p.folder !== folder || p.stamp !== stamp) && p.live === 0)) {
      Copilot.kill(p, "another account is in use");
    }
    const p = procs.find((p) => p.folder === folder && p.stamp === stamp && !p.conn.ended) ?? Copilot.spawn(folder, cmd ?? CopilotCli.command());
    p.live++;
    try {
      await p.ready;
    } catch (err: any) {
      Copilot.release(p);
      throw new Error(String(err?.message ?? err));
    }
    return p;
  }

  // a CLI started for an account by its command (null: none here), its
  // cache a folder of its own (Copilot.cache), its protocol asked (one
  // illi doesn't speak refused): ready. Any failure to start ends it, so
  // no call takes it; as it ends, its calls end (failing, saying why), and
  // its log and cache go; one that ended by itself has what it last wrote
  // to stderr logged. Thrown: the CLI isn't here, or won't run (a folder
  // it may not run from)
  export function spawn(folder: string, cmd: string[] | null): Proc {
    if (cmd === null) {
      throw new Error(CopilotCli.why());
    }
    const p = { folder, stamp: Copilot.stamp(folder), live: 0, runs: new Map() } as unknown as Proc;
    const cache = Copilot.cache(folder);
    try {
      p.conn = Rpc.start(CopilotCli.spec.name, [...cmd, ...Copilot.flags()], Copilot.work(folder), Copilot.env(folder, cmd, cache), (_, m) => Copilot.heard(p, m));
    } catch (err: any) {
      Copilot.uncache(cache);
      throw new Error(/ENOENT|not found/i.test(String(err?.message)) ? CopilotCli.why() : CopilotCli.spec.name + " didn't start: " + String(err?.message ?? err));
    }
    p.ready = (async () => Copilot.known(await Copilot.hello(p.conn)))();
    p.ready.catch(() => Copilot.kill(p, "it didn't start"));
    const pid = p.conn.proc.pid;
    void p.conn.exited.then(() => {
      procs = procs.filter((o) => o !== p);
      p.runs.forEach((run) => run.idle());
      if (p.conn.code !== null && p.conn.tail.trim() !== "") {
        console.error("github-copilot: its CLI ended (exit " + p.conn.code + "), having written: " + p.conn.tail.trim().replace(/\s*\n\s*/g, " / "));
      }
      Copilot.unlog(folder, pid);
      Copilot.uncache(cache);
    });
    procs.push(p);
    return p;
  }

  // illi named to the CLI (as an editor names itself to it), its protocol
  // told (an older CLI's, by its ping)
  export async function hello(conn: Conn): Promise<number> {
    try {
      const told = await Rpc.call(conn, "connect", { clientInfo: { editorName: "illi", editorVersion: VERSION } }, READY);
      return Number(told?.protocolVersion);
    } catch (err: any) {
      if (err?.code !== -32601 && !/unhandled method/i.test(String(err?.message))) {
        throw err;
      }
      return Number((await Rpc.call(conn, "ping", { message: "illi" }, READY))?.protocolVersion);
    }
  }

  // the CLI's protocol taken: thrown, one illi doesn't speak, saying what
  // brings one it does
  export function known(version: number): void {
    if (version !== PROTOCOL) {
      throw new Error(version < PROTOCOL || !(version > 0) ? "your Copilot CLI is older than illi runs: `copilot update` brings a newer one" : "your Copilot CLI is newer than this illi runs (its protocol " + version + "): updating illi brings one that does");
    }
  }

  // a call's CLI let go (it stays for the next, till IDLE)
  export function release(p: Proc): void {
    p.live = Math.max(0, p.live - 1);
    Copilot.wake();
  }

  // a CLI ended (asked, then killed: Rpc.stop), no call taking it from
  // now; its calls still running end as it does, saying why. Till it has,
  // it's among those ending (close)
  export function kill(p: Proc, why: string): void {
    procs = procs.filter((o) => o !== p);
    const gone = Rpc.stop(p.conn, why);
    ending.add(gone);
    void gone.then(() => ending.delete(gone));
  }

  // the CLIs end once no call has run for IDLE
  export function wake(): void {
    if (idle !== null) {
      clearTimeout(idle);
    }
    idle = setTimeout(() => procs.filter((p) => p.live === 0).forEach((p) => Copilot.kill(p, "no call for a while")), IDLE);
    idle.unref();
  }

  // every CLI asked to end, this illi's download by itself let go
  // (CopilotCli.unlock), the downloads no illi runs any more gone (illi
  // ends: CopilotCli.tidy), all at once: a quit never waits. Done once
  // every CLI asked to end has, those of a logout just before too (a
  // little past Rpc's KILL at most), which `illi uninstall` waits for
  // (Provider.ts close)
  export function close(): Promise<void> {
    [...procs].forEach((p) => Copilot.kill(p, "illi ended"));
    CopilotCli.unlock();
    CopilotCli.tidy();
    return Promise.all([...ending]).then(() => {});
  }

  // the CLIs running (a test's look)
  export function running(): number {
    return procs.length;
  }

  // the calls the CLIs running are held by (a test's look)
  export function held(): number {
    return procs.reduce((n, p) => n + p.live, 0);
  }

  // Account
  // -------

  // the environment a CLI (its command) runs in: illi's, but any GitHub
  // token or host and Copilot setting of the environment's; its home the
  // account's folder, its cache the folder named (Copilot.cache), what it
  // unpacks of itself where that CLI keeps it (Copilot.unpacked); no
  // browser of its own (illi opens GitHub's page itself at /login), nor
  // its read of a login shell's (for shell commands of its own, which
  // illi's calls never run)
  export function env(folder: string, cmd: string[], cache: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined && !OWN.test(k)) {
        env[k] = v;
      }
    }
    return Object.assign(env, { COPILOT_HOME: folder, COPILOT_CACHE_HOME: cache, COPILOT_PKG_CACHE_HOME: Copilot.unpacked(cmd), BROWSER: "false", COPILOT_DISABLE_LOGIN_SHELL_ENV: "1" });
  }

  // where a CLI unpacks itself as it first runs (COPILOT_PKG_CACHE_HOME:
  // a version's pkg/ there, its tools and native parts, about as big as
  // the CLI): illi's build in its version's folder (cache/, gone with
  // it); the user's own where it unpacks as the user runs it, so it
  // isn't unpacked twice: their COPILOT_PKG_CACHE_HOME, else their
  // COPILOT_CACHE_HOME, else the system's cache folder's copilot/, as
  // GitHub's CLI finds it
  export function unpacked(cmd: string[]): string {
    const own = CopilotCli.ours(cmd);
    if (own !== null) {
      return path.join(own, "cache");
    }
    const env  = process.env;
    const home = os.homedir();
    return env.COPILOT_PKG_CACHE_HOME || env.COPILOT_CACHE_HOME || (process.platform === "darwin" ? path.join(home, "Library", "Caches", "copilot")
      : process.platform === "win32" ? path.join(env.LOCALAPPDATA || path.join(home, ".cache"), "copilot")
      : path.join(env.XDG_CACHE_HOME || path.join(home, ".cache"), "copilot"));
  }

  // a CLI's cache (COPILOT_CACHE_HOME: the tool lists of the MCP servers
  // it ran, one a server's URL, which is new each run of illi), a folder
  // of its own in the account's, made (readable by the user alone); those
  // a day old that no CLI removed (illi killed) gone. Its CLI's end
  // removes it (uncache), so nothing piles up
  export function cache(folder: string): string {
    const dir = path.join(folder, CACHES);
    try {
      for (const n of fs.readdirSync(dir)) {
        if (Date.now() - fs.statSync(path.join(dir, n)).mtimeMs > LEFT) {
          fs.rmSync(path.join(dir, n), { recursive: true, force: true });
        }
      }
    } catch {}
    const at = path.join(dir, crypto.randomUUID());
    fs.mkdirSync(at, { recursive: true, mode: 0o700 });
    return at;
  }

  // a CLI's cache gone (one that won't go: left, a day's tidy takes it)
  export function uncache(cache: string): void {
    try {
      fs.rmSync(cache, { recursive: true, force: true });
    } catch {}
  }

  // the CLI's arguments after its command: its JSON-RPC server on its
  // stdio, as GitHub's SDK starts it (the version installed, none of the
  // newer ones it downloads of itself, nor a download meanwhile), no
  // telemetry, none of its built-in MCP servers (GitHub's own)
  export function flags(): string[] {
    return ["--headless", "--no-auto-update", "--stdio", "--disable-client-telemetry", "--disable-builtin-mcps"];
  }

  // the account's empty folder the CLI works in (no project's rules load
  // from it), made
  export function work(folder: string): string {
    const dir = path.join(folder, "work");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  }

  // a CLI's log gone as it ends (its file names its process)
  export function unlog(folder: string, pid: number | undefined): void {
    try {
      for (const f of fs.readdirSync(path.join(folder, "logs")).filter((f) => f.endsWith("-" + pid + ".log"))) {
        fs.rmSync(path.join(folder, "logs", f), { force: true });
      }
    } catch {}
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
    Copilot.stamp(folder);
  }

  // whether an account's folder needs signing in again: its sign-in ran
  // out in a call this run
  export function lapsed(folder: string): boolean {
    return LAPSED.has(folder);
  }

  // an account's CLIs ended (it's logged out here)
  export function forget(folder: string): void {
    procs.filter((p) => p.folder === folder).forEach((p) => Copilot.kill(p, "its account was logged out"));
    LAPSED.delete(folder);
  }

  // an account's folder signed in to GitHub by the CLI's own sign-in, as
  // GitHub's SDK signs in (session.accounts.login, by device code, in a
  // session made for it alone; the folder made first, readable by the
  // user alone): as the CLI tells GitHub's page and the code to enter
  // there, `ask` is told both, and the CLI waits for the person to allow
  // it there. It keeps the token in the system's keychain; with none
  // (WSL, a server), it asks to keep it in the account's folder instead
  // (its config.json), which `keep` asks the person (no: not kept, so not
  // signed in). Signed in: whom it's signed in as asked, and the models it
  // offers learned (Copilot.whom), then the folder's stamp made anew
  // (renew); done, who. Stop cancels it, as does SIGNIN passing, from its
  // first step on: while the CLI starts (seconds, as it first unpacks
  // itself), the sign-in ends at once and the CLI, once started, is let
  // go; a stop already asked starts none; and neither `ask` nor `keep` is
  // called past one (no page opened, no code copied, after the person
  // left). Thrown: why it didn't sign in (the CLI isn't here: why)
  export async function signin(folder: string, stop: AbortSignal, ask: (url: string, code: string) => void, keep: () => Promise<boolean>): Promise<Who> {
    const late  = AbortSignal.timeout(SIGNIN);
    const over  = () => stop.aborted || late.aborted;
    const why   = () => new Error(stop.aborted ? "the sign-in was stopped" : "no sign-in came in " + SIGNIN / 60e3 + " minutes, so illi stopped waiting");
    const ended = new Promise<never>((_, fail) => {
      const end = () => fail(why());
      if (over()) {
        return end();
      }
      stop.addEventListener("abort", end, { once: true });
      late.addEventListener("abort", end, { once: true });
    });
    ended.catch(() => {});
    if (over()) {
      throw why();
    }
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const taken = Copilot.take(folder);
    let p: Proc;
    try {
      p = await Promise.race([taken, ended]);
    } catch (err) {
      void taken.then(Copilot.release, () => {});
      throw err;
    }
    const sid = crypto.randomUUID();
    const call = (method: string, params: object, ms = SETUP) => Promise.race([Rpc.call(p.conn, method, { sessionId: sid, ...params }, ms), ended]);
    let flow = "";
    let done = false;
    try {
      await call("session.create", { clientName: "illi", workingDirectory: Copilot.work(folder), availableTools: [], mcpServers: {}, envValueMode: "direct" });
      const begun = await call("session.accounts.login.begin", { kind: "githubDotCom", method: "device-code" });
      flow = String(begun?.flowId ?? "");
      const next = (input?: string) => call("session.accounts.login.advance", { flowId: flow, ...(input === undefined ? {} : { input }) }, 0);
      for (let step = begun?.step; ; ) {
        const kind = String(step?.kind ?? "");
        if (over()) {
          throw why();
        }
        if (kind === "device-code") {
          ask(String(step.verificationUri ?? ""), String(step.userCode ?? ""));
          step = await next();
        } else if (kind === "awaiting" || kind === "needs-interaction") {
          step = await next();
        } else if (kind === "completed" && step.result?.status === "needs-plaintext-consent") {
          const yes = await Promise.race([keep(), ended]);
          step = await next(yes ? "allow" : "decline");
        } else if (kind === "completed" && step.result?.status === "completed") {
          done = true;
          break;
        } else if (kind === "completed" && step.result?.status === "declined") {
          done = true;
          throw new Error("illi didn't keep GitHub's token, so the account isn't signed in");
        } else if (kind === "error") {
          done = true;
          throw new Error("GitHub's sign-in said “" + String(step.message ?? "").trim() + "”");
        } else {
          throw new Error("GitHub's sign-in asked for what illi doesn't do (" + (kind === "completed" ? String(step.result?.status) : kind || "nothing") + ")");
        }
      }
      LAPSED.delete(folder);
      const who = await Promise.race([Copilot.whom(p), ended]);
      if (who === null) {
        throw new Error("the Copilot CLI says it isn't signed in");
      }
      Copilot.renew(folder);
      return who;
    } finally {
      if (flow !== "" && !done) {
        void Rpc.call(p.conn, "session.accounts.login.cancel", { sessionId: sid, flowId: flow }, ASKED).catch(() => {});
      }
      void Rpc.call(p.conn, "sessions.delete", { sessionId: sid }, ASKED).catch(() => {});
      Copilot.release(p);
    }
  }

  // whom an account's folder is signed in as, asked of its CLI (null: no
  // one), the models it offers and its plan's use learned meanwhile
  // (Copilot.whom). Thrown: the CLI won't start
  export async function who(folder: string): Promise<Who | null> {
    const p = await Copilot.take(folder);
    try {
      return await Copilot.whom(p);
    } finally {
      Copilot.release(p);
    }
  }

  // whom a CLI is signed in as (null: no one), the models it offers and
  // its plan's use learned meanwhile (Copilot.learn, Copilot.quota)
  export async function whom(p: Proc): Promise<Who | null> {
    const auth = (await Rpc.call(p.conn, "account.getCurrentAuth", {}, ASKED))?.authInfo;
    if (typeof auth?.login !== "string" || auth.login === "") {
      return null;
    }
    await Copilot.listed(p, auth.copilotUser);
    return { login: auth.login, plan: Copilot.tier(auth.copilotUser), lack: BARRED.get(p.folder) ?? "" };
  }

  // why GitHub gives an account no Copilot, as its Copilot user tells
  // (none told: why it may be): its subscription ended, else it has none;
  // then what's open to it (Copilot Free, where GitHub says it may start
  // it), and where (SETTINGS)
  export function lack(user: any): string {
    const ended = String(user?.access_type_sku ?? "") === "subscription_ended";
    const free  = user?.can_signup_for_limited === true;
    if (user === null || user === undefined) {
      return "it has no Copilot plan it can use (its subscription may have ended): see " + SETTINGS + " (Copilot Free, or a plan)";
    }
    const why = ended ? "its Copilot subscription has ended" : "it has no Copilot plan";
    return free ? why + ". Copilot Free is open to it: turn it on at " + SETTINGS + " (or " + (ended ? "renew a plan" : "get a plan") + " there)" : why + ": " + (ended ? "renew it" : "get one") + " at " + SETTINGS;
  }

  // why GitHub gives an account's folder no Copilot, as last asked ("":
  // it does, or not asked yet)
  export function barred(folder: string): string {
    return BARRED.get(folder) ?? "";
  }

  // an account's plan as GitHub names it ("Free", "Business"; "": none
  // told)
  export function tier(user: any): string {
    const plan = /^free/i.test(String(user?.access_type_sku ?? "")) ? "free" : String(user?.copilot_plan ?? "");
    return plan === "individual" || plan === "" ? "" : plan[0].toUpperCase() + plan.slice(1);
  }

  // an account's folder logged out (the CLI's own logout: its token gone
  // from the keychain, where there is one), by the CLI or, none here, by
  // another version downloaded (a logout asks no model: CopilotCli.any);
  // false: it couldn't
  export async function logout(folder: string): Promise<boolean> {
    await CopilotCli.look();
    const cmd = CopilotCli.any();
    if (cmd === null || !fs.existsSync(folder)) {
      return false;
    }
    let p: Proc;
    try {
      p = await Copilot.take(folder, cmd);
    } catch {
      return false;
    }
    try {
      const auth = (await Rpc.call(p.conn, "account.getCurrentAuth", {}, ASKED))?.authInfo;
      if (auth !== undefined && auth !== null) {
        await Rpc.call(p.conn, "account.logout", { authInfo: auth }, ASKED);
      }
      return true;
    } catch {
      return false;
    } finally {
      Copilot.release(p);
      Copilot.forget(folder);
    }
  }

  // Models and plan
  // ---------------

  // the account in use asked what it tells (as the chat is on the plan,
  // as /login connects it): its models and its plan's use, once there's a
  // CLI to ask (with autoupdate on and none here, this illi's build
  // downloaded by itself first: CopilotCli.auto); true: its models
  // changed. Never fails (a call tells too)
  export async function account(): Promise<boolean> {
    const folder = config.config_folder("github-copilot");
    if (folder === "" || Copilot.gateway() !== "") {
      return false;
    }
    await CopilotCli.look();
    await CopilotCli.auto(config.AUTOUPDATE, true);
    if (CopilotCli.command() === null) {
      return false;
    }
    try {
      const p = await Copilot.take(folder);
      try {
        return await Copilot.listed(p);
      } finally {
        Copilot.release(p);
      }
    } catch {
      return false;
    }
  }

  // a CLI's account asked its models (learned) and its plan's use (told);
  // its models refused as GitHub gives it no Copilot, why kept (BARRED:
  // its Copilot user as told, else asked), listed, let go. true: its
  // models changed. Never fails
  export async function listed(p: Proc, user?: any): Promise<boolean> {
    let denied = false;
    const [list, quota] = await Promise.all([
      Rpc.call(p.conn, "models.list", {}, ASKED).catch((err) => ((denied = DENIED.test(String(err?.message ?? err))), null)),
      Rpc.call(p.conn, "account.getQuota", {}, ASKED).catch(() => null),
    ]);
    Copilot.quota(p.folder, quota?.quotaSnapshots);
    if (denied) {
      const who = user ?? (await Rpc.call(p.conn, "account.getCurrentAuth", {}, ASKED).catch(() => null))?.authInfo?.copilotUser;
      BARRED.set(p.folder, Copilot.lack(who ?? null));
    } else if (list !== null) {
      BARRED.delete(p.folder);
    }
    return list === null ? false : Copilot.learn(list);
  }

  // the models the CLI lists the account offers, in its order: each by
  // Copilot's id, but one its organization's policy disabled or one
  // without tools; its window the whole context (input and output), the
  // share of it a request may fill its prompt's own limit; its efforts
  // those illi names; its price in USD a million tokens read (an AI credit
  // a cent)
  export function catalog(list: any): Model[] {
    const all: any[] = Array.isArray(list?.models) ? list.models : [];
    return all.filter((m) => typeof m?.id === "string" && m.id !== "" && m.policy?.state !== "disabled" && m.capabilities?.supports?.toolCalls !== false).map((m) => {
      const limits  = m.capabilities?.limits ?? {};
      const prompt  = Number(limits.max_prompt_tokens) || undefined;
      const window  = Number(limits.max_context_window_tokens) || prompt;
      const efforts = (Array.isArray(m.supportedReasoningEfforts) ? m.supportedReasoningEfforts : []).filter((e: string) => EFFORTS.includes(e));
      const prices  = m.billing?.tokenPrices ?? {};
      const price   = Number(prices.batchSize) > 0 && Number.isFinite(Number(prices.inputPrice)) ? (Number(prices.inputPrice) * 1e4) / Number(prices.batchSize) : undefined;
      const room    = prompt !== undefined && window !== undefined && prompt < window ? prompt / window : undefined;
      return { label: m.id, id: m.id, speeds: ["slow"], window, room, efforts: efforts.length > 0 ? efforts : undefined, price };
    });
  }

  // the account's models, as the CLI lists them, learned: the list illi
  // offers now (one gone from it gone; one new offered, unless `models`
  // names those offered; a window the list tells none of kept as a call
  // told it), kept for the next start, the chat told; the same list as
  // known changes nothing. true: it changed
  export function learn(list: any): boolean {
    const models = Copilot.catalog(list).map((m) => ({ ...m, window: m.window ?? Pick.model("github-copilot", m.label)?.window }));
    const shape  = (ms: Model[]) => JSON.stringify(ms.map((m) => [m.label, m.efforts ?? [], m.window ?? 0, m.room ?? 0, m.price ?? -1]));
    if (models.length === 0 || shape(models) === shape(Pick.list("github-copilot"))) {
      return false;
    }
    const fresh = Pick.learn("github-copilot", models, "replace");
    if (!config.MODELS_SET) {
      config.OFFER.models.push(...fresh.filter((label) => !config.OFFER.models.includes(label)));
    }
    config.config_models_keep("github-copilot", Pick.list("github-copilot"));
    watcher();
    return true;
  }

  // what to call as the account's models change (one: the chat's)
  export function watch(fn: () => void): void {
    watcher = fn;
  }

  // the plan's use as the CLI tells it, for an account's folder: its
  // credits' share used and when they start anew (the first limited
  // quota of its premium requests or chat; none limited: not told)
  export function quota(folder: string, snapshots: any): void {
    const all = snapshots !== null && typeof snapshots === "object" ? snapshots : {};
    const q = [all.premium_interactions, all.chat].find((s: any) => s !== undefined && s !== null && !s.isUnlimitedEntitlement && Number(s.entitlementRequests) > 0);
    if (q === undefined) {
      return;
    }
    const used  = Math.min(100, Math.max(0, 100 - Number(q.remainingPercentage)));
    const reset = Date.parse(String(q.resetDate ?? ""));
    told = { folder, plan: { brand: "Copilot", tier: "", limits: [{ window: MONTH, used, reset: Number.isFinite(reset) ? reset : 0 }] } };
  }

  // the plan of the account in use, as last told (null: none told, or
  // told of another account)
  export function plan(): Plan | null {
    return told !== null && told.folder === config.config_folder("github-copilot") ? told.plan : null;
  }

}

// github-copilot's code, as the rest of illi asks it (Provider.ts): a
// call run by GitHub's CLI itself (a runner); while the chat is on it (at
// the start, as the chat moves to it, after /login: Chat.account), the
// account's models and plan asked (this illi's CLI downloaded first by
// itself, with autoupdate on and none here); the chat told as the
// account's models change, and as a download by itself ends
// (CopilotCli.notes); an account logged out by the CLI, and the
// CLI's downloads, as `illi uninstall` asks; its CLIs ended as illi ends
// (their end waited for by the uninstall), its download by itself let
// go, and the downloads no illi runs any more gone
export const PROVIDER: Provider = {
  facts    : FACTS,
  ask      : Copilot.ask,
  account  : Copilot.account,
  watch    : Copilot.watch,
  notes    : CopilotCli.notes,
  plan     : Copilot.plan,
  logout   : Copilot.logout,
  programs : CopilotCli.programs,
  close    : Copilot.close,
};
