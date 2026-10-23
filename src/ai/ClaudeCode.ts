// ClaudeCode
// ==========
// claude-code: the user's own Claude Code (the `claude` CLI; ILLI_CLAUDE
// names another), on their Claude plan and logged in through its own
// flow (`claude`, then /login), run whole as it ships: its system
// prompt, tools, loop and login are its own, and illi never sees a
// token. A call is one `claude -p`, streamed both ways (stream-json),
// leaving no session in Claude Code's history. One with tools
// (Ask.server) adds illi's over MCP, those Claude Code lacks (Tools.list
// `lean`), allowed to run (as `-p` asks no one), its permission prompts
// asked of the user at illi's screen (Tools.approve), and illi's prompt after
// Claude Code's (from a file, so no argument limit); one without (a summary, a goal check), or
// `once` (a recap: Claude Code can't name tools it won't run, so it reads
// none of the turn's cache), runs with none
// of Claude Code's either, nor its MCP servers, commands or hooks. The
// blocks go as one user message, the last marked one before the last
// cached for an hour (MARK: else a call re-writes the whole view to the
// cache, though only its end changed), a message sent mid-run as another
// (taken as Claude Code echoes it); the input ends at the first result,
// so Claude Code ends once all it read is done, and a message sent after
// is left. Its stream: the API's own events shown live (Anthropic.read),
// each message's blocks as entries, a tool's result as its echo, illi's
// tools by their own names; a subagent's own steps (inside its Task)
// aren't shown. The last result ends the call: answered, or in plain
// words (a plan's limit and when it resets, a login missing, a chat too
// long for the window: `full`, a busy service). A stop interrupts it
// (SIGINT, then SIGKILL), what streamed of its message logged as cut
// off. A model's window, as a result tells it, is learned (Pick.told).

import * as fs from "node:fs";
import * as os from "node:os";
import type { Subprocess } from "bun";
import { AskAI, type Ask, type Block, type End, type Event, type Img, type Say, type Try } from "./AskAI.ts";
import { Agent, type Emit, type Entry } from "./Agent.ts";
import { Anthropic } from "./Anthropic.ts";
import { Pick } from "./Pick.ts";
import { live_push } from "../ui/View.ts";

// Types
// =====

// a call as it runs: the message streaming (its stream read so far,
// null between messages; what it showed), the messages sent mid-run
// written but not echoed yet, whether the call's own was, whether a
// reply came, the last result, when a plan's limit resets (ms; 0: none
// told), whether the input ended
type Run = {
  ask    : Ask;
  on     : (ev: Event) => void;
  st     : any;
  seen   : Entry[];
  sent   : Say[];
  own    : boolean;
  said   : boolean;
  result : any;
  reset  : number;
  shut   : boolean;
};

// Constants
// =========

// illi's tools as Claude Code names them, by their MCP server's name
const OURS = "mcp__illi__";

// a marked block's cache entry: an hour, as Claude Code's own are (one
// of five minutes may not follow theirs); one of a call's blocks, its
// last marked (Claude Code marks the last block itself, and its own
// prompt: a request holds its four marks at most)
const MARK = { type: "ephemeral", ttl: "1h" };
const MARKS = 1;

// how long one call to illi's tools may take (ms): a subagent's work, a
// question the user answers late. Claude Code's own limit for an HTTP
// server, unless its config says one, is a minute
const WAIT = 24 * 60 * 60 * 1000;

// how long a stop waits for Claude Code to end before killing it (ms)
const KILL = 5e3;

// what a failure says: a plan's limit, a login missing, a busy service
const LIMIT = /usage limit|limit reached|rate.?limit|\b429\b/i;
const LOGIN = /not logged in|please run \/login|invalid api key|authentication|oauth token|\b401\b/i;
const BUSY  = /overloaded|\b529\b|\b5\d\d\b|unavailable|timed? ?out|ECONN|network/i;

const NO_CLAUDE = "Claude Code isn't installed here: install it (code.claude.com), log in with claude, then send a message";
const NO_LOGIN  = "Claude Code isn't logged in: run claude in a terminal, log in there (/login), then send a message";

// ClaudeCode
// ==========

export namespace ClaudeCode {

  // the CLI run
  export let bin = process.env.ILLI_CLAUDE ?? "claude";

  export function ask(ask: Ask, on: (ev: Event) => void): Try {
    const end = AskAI.end("");
    const left: Say[] = [];
    const none = (text: string, stop: End["stop"]): Try => {
      Object.assign(end, { text, stop, left });
      return { send: (say) => left.push(say), stop: () => {}, done: Promise.resolve(end) };
    };
    if (ask.from !== undefined) {
      return none("Claude Code can't go on from another request", "fail");
    }
    const file = ClaudeCode.prompt(ask.system);
    let proc: Subprocess<"pipe", "pipe", "pipe">;
    try {
      proc = Bun.spawn([ClaudeCode.bin, ...ClaudeCode.args(ask, file)], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: ClaudeCode.env() });
    } catch (err: any) {
      fs.rmSync(file, { force: true });
      return none(/ENOENT|not found/i.test(String(err?.message)) ? NO_CLAUDE : String(err?.message ?? err), "down");
    }
    const run: Run = { ask, on, st: null, seen: [], sent: [], own: false, said: false, result: null, reset: 0, shut: false };
    let stopped = false;
    // a line to Claude Code's input; false: it ended (it exited)
    const write = (msg: unknown) => {
      try {
        proc.stdin.write(JSON.stringify(msg) + "\n");
        proc.stdin.flush();
        return true;
      } catch {
        run.shut = true;
        return false;
      }
    };
    const shut = () => {
      if (!run.shut) {
        run.shut = true;
        try {
          proc.stdin.end();
        } catch {}
      }
    };
    write(ClaudeCode.user(ask.blocks, ask.imgs ?? []));
    const send = (say: Say) => {
      if (run.shut || stopped || !write(ClaudeCode.user([{ text: say.text, mark: false }], say.imgs))) {
        left.push(say);
        return;
      }
      run.sent.push(say);
    };
    const stop = () => {
      if (!stopped) {
        stopped = true;
        proc.kill("SIGINT");
        setTimeout(() => proc.kill("SIGKILL"), KILL).unref();
      }
    };
    const done = (async () => {
      const errs = new Response(proc.stderr).text();
      try {
        for await (const line of AskAI.lines(proc.stdout)) {
          const m: any = Agent.parse(line);
          if (m !== null && !stopped) {
            ClaudeCode.read(run, m);
          }
          if (m?.type === "result") {
            shut();
          }
        }
      } catch {}
      shut();
      const code = await proc.exited;
      fs.rmSync(file, { force: true });
      if (stopped) {
        Agent.fail("stopped", run.st === null ? [] : run.seen).entries.forEach((e) => on({ $: "Entry", ...e }));
        return { ...end, text: "stopped", stop: "lost", left: [...run.sent, ...left] } as End;
      }
      return { ...ClaudeCode.end(run, (await errs).trim(), code), left: [...run.sent, ...left] };
    })();
    return { send, stop, done };
  }

  // a call's arguments: streamed both ways, on its pick, illi's prompt
  // after Claude Code's (its file), never Claude Code's hooks (illi's own
  // hooks file is the one that runs, and a repository's .claude settings
  // would run its hooks in a folder never trusted: -p trusts any); with
  // tools, illi's (its MCP server, the lean list, allowed; illi's ask for
  // Claude Code's own), else (or once) none, nor Claude Code's servers or
  // commands
  export function args(ask: Ask, file: string): string[] {
    const io = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--replay-user-messages", "--no-session-persistence"];
    const pick = ["--model", ask.model, "--effort", ask.effort, "--append-system-prompt-file", file, "--settings", JSON.stringify({ disableAllHooks: true })];
    if (ask.server === "" || ask.once) {
      return [...io, ...pick, "--tools", "", "--strict-mcp-config", "--disable-slash-commands"];
    }
    const mcp = { mcpServers: { illi: { type: "http", url: ask.server + "?lean", timeout: WAIT } } };
    return [...io, ...pick, "--mcp-config", JSON.stringify(mcp), "--allowedTools", "mcp__illi", "--disallowedTools", "AskUserQuestion", "--permission-prompt-tool", "mcp__illi__approve"];
  }

  // illi's prompt in a file of its own, readable by the user alone
  export function prompt(system: string): string {
    const file = os.tmpdir() + "/illi-claude-" + crypto.randomUUID() + ".md";
    fs.writeFileSync(file, system, { mode: 0o600 });
    return file;
  }

  // the environment Claude Code runs in: illi's, but the mark of a Claude
  // Code session around illi (as when illi runs inside one)
  export function env(): Record<string, string> {
    const env = { ...process.env } as Record<string, string>;
    delete env.CLAUDECODE;
    return env;
  }

  // a user message as Claude Code reads it: its blocks' texts (none
  // empty), the last marked one before the last cached (MARK, MARKS),
  // then its images
  export function user(blocks: Block[], imgs: Img[]): unknown {
    const all = blocks.filter((b) => b.text !== "");
    const texts = [...AskAI.marks(all.slice(0, -1), MARKS), ...all.slice(-1)];
    const content = texts.map((b, k) => ({ type: "text", text: b.text, ...(b.mark && k < texts.length - 1 ? { cache_control: MARK } : {}) }));
    return { type: "user", message: { role: "user", content: [...content, ...imgs.map(Anthropic.image)] } };
  }

  // one line of the stream; a subagent's own steps skipped
  export function read(run: Run, m: any): void {
    if (m.parent_tool_use_id) {
      return;
    }
    switch (m.type) {
      case "stream_event": {
        return ClaudeCode.live(run, ClaudeCode.named(m.event));
      }
      case "assistant": {
        const entries = Anthropic.entries((m.message?.content ?? []).map(ClaudeCode.named));
        run.said ||= entries.some((e) => e.kind === "illi");
        entries.forEach((e) => run.on({ $: "Entry", ...e }));
        return;
      }
      case "user": {
        return ClaudeCode.heard(run, m);
      }
      case "result": {
        run.result = m;
        for (const [id, use] of Object.entries<any>(m.modelUsage ?? {})) {
          Pick.told("claude-code", id, Number(use?.contextWindow ?? 0));
        }
        return;
      }
      case "rate_limit_event": {
        const info = m.rate_limit_info ?? {};
        run.reset = info.status === "rejected" && Number(info.resetsAt) > 0 ? Number(info.resetsAt) * 1000 : run.reset;
        return;
      }
      case "system": {
        return ClaudeCode.system(run, m);
      }
    }
  }

  // an API event, shown live: a message starts its own stream read
  export function live(run: Run, ev: any): void {
    if (ev.type === "message_start") {
      run.st = Anthropic.wire.start(run.ask);
      run.seen = [];
    }
    if (run.st === null) {
      return;
    }
    const on: Emit = (kind, text, fresh) => {
      live_push(run.seen, kind, text, fresh);
      run.on({ $: "Delta", kind, text, fresh });
    };
    if (Anthropic.read(run.st, ev, on)) {
      run.st = null;
    }
  }

  // a user line: tool results, each its call's echo; else a message
  // echoed, the call's own first, then those sent mid-run, in turn
  export function heard(run: Run, m: any): void {
    const content = m.message?.content;
    const results = Array.isArray(content) ? content.filter((c: any) => c.type === "tool_result") : [];
    for (const r of results) {
      run.on({ $: "Entry", kind: "echo", text: (r.is_error ? "error: " : "") + (AskAI.show(r.content) || "(no output)"), of: r.tool_use_id });
    }
    if (results.length > 0 || m.isSynthetic === true || m.isMeta === true) {
      return;
    }
    if (!run.own) {
      run.own = true;
      return;
    }
    const say = run.sent.shift();
    if (say !== undefined) {
      run.on({ $: "Entry", kind: "user", text: say.text });
    }
  }

  // a system line: a retry, a thought; illi's tools not connecting, logged
  export function system(run: Run, m: any): void {
    if (m.subtype === "api_retry") {
      const secs = Math.ceil(Number(m.retry_delay_ms ?? 0) / 1000);
      run.on({ $: "Entry", kind: "mind", text: "The AI service is busy: asking again" + (secs > 0 ? " in " + secs + " s." : ".") });
    }
    const ours = (m.mcp_servers ?? []).find((s: any) => s.name === "illi");
    if (m.subtype === "init" && ours !== undefined && ours.status !== "connected") {
      console.error("claude-code: illi's tools: " + ours.status);
    }
  }

  // a block (or an event starting one) with illi's tool by its own name
  export function named(b: any): any {
    const block = b?.content_block ?? b;
    if (typeof block?.name !== "string" || !block.name.startsWith(OURS)) {
      return b;
    }
    const own = { ...block, name: block.name.slice(OURS.length) };
    return b.content_block === undefined ? own : { ...b, content_block: own };
  }

  // the call's end from its last result (none: Claude Code's own words,
  // or its exit code)
  export function end(run: Run, err: string, code: number): End {
    const r = run.result;
    if (r !== null && r.subtype === "success" && !r.is_error) {
      return { ok: true, text: String(r.result ?? ""), left: [] };
    }
    const said = r === null ? err || "Claude Code ended (exit code " + code + ") with no reply" : String(r.result || (r.errors ?? []).join("\n") || r.subtype);
    if (r !== null || err !== "") {
      console.error("claude-code: " + said.slice(0, 300));
    }
    return { ...ClaudeCode.failed(said, r?.api_error_status ?? null, run.reset), left: [], cut: run.said };
  }

  // a failure in plain words: too long for the window; a plan's limit
  // (when it resets, if told); a login missing; a busy service (a later
  // try may answer); else as Claude Code says it
  export function failed(said: string, status: number | null, reset: number): End {
    if (Agent.full(said)) {
      return { ok: false, text: said, left: [], stop: "full" };
    }
    if (status === 429 || reset > 0 || LIMIT.test(said)) {
      const when = reset > Date.now() ? ": it resets at " + Agent.when(reset) : "";
      return { ok: false, text: "your Claude plan's usage limit is reached" + when + "; /model picks another model meanwhile", left: [], stop: "down", again: true };
    }
    if (status === 401 || LOGIN.test(said)) {
      return { ok: false, text: NO_LOGIN, left: [], stop: "down" };
    }
    if (status === 529 || (status ?? 0) >= 500 || BUSY.test(said)) {
      return { ok: false, text: Agent.gone(""), left: [], stop: "down", again: true };
    }
    return { ok: false, text: said.replace(/\s+/g, " ").trim().slice(0, 300), left: [], stop: "down" };
  }

}
