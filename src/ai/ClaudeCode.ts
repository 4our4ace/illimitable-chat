// ClaudeCode
// ==========
// claude-code: the user's own Claude Code (the `claude` CLI; ILLI_CLAUDE
// names another), on their Claude plan and logged in through its own
// flow (`claude`, then /login), run whole as it ships: its system
// prompt, tools, loop and login are its own, and illi never sees a
// token. A call is one `claude -p`, streamed both ways (stream-json),
// leaving no session in Claude Code's history. One with tools
// (Ask.server) adds illi's over MCP, those Claude Code lacks (Tools.list
// `lean`), an agent's tools list keeping Claude Code's built-in ones to
// those it names, but those illi gives itself (Ask.builtins: its Agent,
// Task, TodoWrite and task tools never; its plugins stay, their MCP
// servers as below),
// allowed to run (as `-p` asks no one), its permission prompts
// asked of the user at illi's screen (Tools.approve), and illi's prompt after
// Claude Code's (from a file, so no argument limit); one without (a summary, a goal check), or
// `once` (a recap: Claude Code can't name tools it won't run, so it reads
// none of the turn's cache), runs with none
// of Claude Code's either, nor its MCP servers, commands or hooks. The
// blocks go as one user message, the last marked one before the last
// cached for an hour (MARK: else a call re-writes the whole view to the
// cache, though only its end changed; a request Claude Code marks four
// times itself is refused for it, the call ending `marks`, and the turn
// goes on with none), a message sent mid-run as another
// (taken as Claude Code echoes it; a `once` call's left, as Agent.ts
// leaves it); the input ends at the first result, so Claude Code ends
// once all it read is done, and a message sent after is left. Its
// stream: the API's own events shown live (Anthropic.read), each
// message's blocks as entries, a tool's result as its echo, illi's
// tools by their own names; a subagent's own steps (inside its Task)
// aren't shown. The last result ends the call: answered, or in plain
// words (a plan's limit and when it resets, a login missing, a chat too
// long for the window: `full`, a busy service); a turn's call, and an
// illi agent's, runs with Claude Code's compaction off, so one
// outgrowing the window ends `full` and illi folds the chat, or recaps
// the agent's log (ClaudeCode.env); the tokens its first request read,
// as its stream tells, go with its end (End.first), so the chat learns
// what Claude Code's own prompt and tools take beside it (Chat.cap). A
// stop interrupts it (SIGINT, then SIGKILL), what streamed of its
// message logged as cut off. A model's window is learned (Pick.told, by
// its canonical id) and kept for the next start: as Claude Code has it
// for a turn, asked as soon as the plan's account is in use (at the
// start, at a /login change: ClaudeCode.models, no model called), and
// as a turn's result tells it; a call with Claude Code's compaction on
// tells its autocompact window instead (500k of Opus's 1M), never
// learned; the plan's use, as each rate limit event tells it (its
// 5-hour and weekly windows), shows at the side (ClaudeCode.told).
//
// Claude Code's own MCP servers (claude mcp add, its plugins', the
// claude.ai connectors) load in a call with tools beside illi's server.
// The call's init tells them (ClaudeCode.learn: kept, illi's left out;
// /mcp and the side show them, nothing before a call has told them).
// Each call leaves out (ClaudeCode.cut), by a rule (--disallowedTools
// mcp__<name>__*: Claude Code drops their tools from the model's
// context, though it still starts them), each illi runs its own server
// of, by its name as Claude Code spells it (illi's wins: the model gets
// one copy), and each told that `off` names; with an agent's tools
// list, each told the list doesn't name too (one it names by tools
// alone: its other tools, once told), and all where it names none that
// could load (--strict-mcp-config, illi's own server kept). Till a call
// of the run has told them, those ever told stand in, by their names
// kept, case and all (claude-code.json), so `off`'s rules and a list's
// hold from a start's first call. One never told (added to Claude Code
// since, or new to illi) loads in one more call, which tells it. Claude
// Code's settings are never touched.
//
// A Claude plan's accounts (/login: Accounts.ts) are each a Claude Code
// folder, as each Claude Code login is a folder's: the user's own Claude
// Code's (as their environment names it), or one of illi's in its root
// (claude/<id>, CLAUDE_CONFIG_DIR). A call runs in the account in use's;
// a switch drops what the other's calls told (its servers, its plan's
// use). /login signs a folder in (`claude auth login`, through pipes:
// Claude Code opens its page itself, the code the page shows given it;
// it waits on the person, so only a stop ends it early), asks whom it's
// logged in as (`claude auth status`) and logs one of illi's out
// (`claude auth logout`), each of those two killed past AUTH.

import * as fs from "node:fs";
import * as os from "node:os";
import type { Subprocess } from "bun";
import { AskAI, type Ask, type Block, type End, type Event, type Img, type Say, type Try } from "./AskAI.ts";
import { Agent, type Emit, type Entry } from "./Agent.ts";
import { Anthropic } from "./Anthropic.ts";
import { Pick } from "./Pick.ts";
import { FAILED, live_push, type Limit, type Plan } from "../ui/View.ts";
import * as config from "../config/Config.ts";
import { json_object } from "../tools/Clip.ts";
import { Mcp } from "../tools/Mcp.ts";

// Types
// =====

// a call as it runs: the message streaming (its stream read so far,
// null between messages; what it showed), the messages sent mid-run
// written but not echoed yet, whether the call's own was, whether a
// reply came, the last result, whether a tool's result came back, when
// a plan's limit resets (ms; 0: none told), whether the input ended;
// what it left out of Claude Code's own MCP servers (ClaudeCode.cut:
// none loaded, or the rules), its init telling them all
// (ClaudeCode.learn) where some loaded; the tokens its first request
// read, as its stream's start tells (End.first; null: none began)
type Run = {
  ask    : Ask;
  on     : (ev: Event) => void;
  st     : any;
  seen   : Entry[];
  sent   : Say[];
  own    : boolean;
  said   : boolean;
  result : any;
  grew   : boolean;
  reset  : number;
  shut   : boolean;
  cut    : Cut;
  first  : number | null;
};

// what a call with tools leaves out of Claude Code's own MCP servers:
// all (strict: --strict-mcp-config, illi's own server kept), or each
// rule's tools (--disallowedTools)
type Cut = { strict: boolean; deny: string[] };

// a Claude Code server as its last call that loaded them told it (its
// init: illi's own left out): its name as Claude Code lists it (a
// plugin's plugin:<plugin>:<server>, a connector's claude.ai <name>),
// how it is (connected, failed, needs-auth, pending, disabled), its
// tools as Claude Code names them (null: none told yet, each call
// having cut it); as the views show it, whether `off` names it and
// whether illi's own server of its name is used in its place (over)
export type Theirs = { name: string; status: string; tools: string[] | null; off: boolean; over: boolean };

// Constants
// =========

// illi's tools as Claude Code names them, by their MCP server's name
const OURS = "mcp__illi__";

// a marked block's cache entry: an hour, as Claude Code's own are (one
// of five minutes may not follow theirs); one of a call's blocks, its
// last marked (Claude Code marks the last block itself, and its own
// prompt twice: a request holds four marks at most. At times Claude Code
// marks a second message too, where its last request ended, and the API
// refuses the five: ClaudeCode.failed, `marks`)
const MARK = { type: "ephemeral", ttl: "1h" };
const MARKS = 1;

// how long one call to illi's tools may take (ms): a subagent's work, a
// question the user answers late. Claude Code's own limit for an HTTP
// server, unless its config says one, is a minute
const WAIT = 24 * 60 * 60 * 1000;

// how long a stop waits for Claude Code to end before killing it (ms)
const KILL = 5e3;

// what a failure says: a plan's limit, a login missing, a busy service,
// a request holding more cache marks than the API takes
const LIMIT  = /usage limit|limit reached|rate.?limit|\b429\b/i;
const LOGIN  = /not logged in|please run \/login|invalid api key|authentication|oauth token|\b401\b/i;
const BUSY   = /overloaded|\b529\b|\b5\d\d\b|unavailable|timed? ?out|ECONN|network/i;
const MARKED = /maximum of \d+ blocks with cache_control/i;

// the plan's windows a rate limit event tells the share used of
// (unifiedWindows: its utilization a fraction, 1 the whole), by their
// length in minutes, as a ChatGPT plan's show (5 hours, a week); any
// other (one model's own week) left out
const WINDOWS: Record<string, number> = { five_hour: 300, seven_day: 10080 };

// the plan's windows as last told, each its share used (%) and when it
// starts anew: the side shows them (ClaudeCode.told; one past its reset
// as 0%); the account in use's, its folder's
let limits: Limit[] = [];

// Claude Code's own MCP servers as its last call that loaded them told
// (Theirs, but off and over, read anew each time; null: none has yet);
// the account in use's, its folder's
let theirs: Array<Omit<Theirs, "off" | "over">> | null = null;

// the Claude Code folder of the account limits and theirs are of ("":
// the user's own Claude Code's: config.config_claude_dir)
let folder = config.config_claude_dir();

// the names Claude Code's servers were ever told by, case and all, by
// their lower case (as `off` holds them; null: NAMES not read yet), kept
// across starts in NAMES so `off`'s rules are right before a start's
// first call has told the servers (Claude Code matches a rule's server
// case and all)
let cases: Map<string, string> | null = null;
const NAMES = config.ROOT + "/claude-code.json";

const NO_CLAUDE = "Claude Code isn't installed here: install it (code.claude.com), then /login connects your Claude plan";
const NO_LOGIN  = "Claude Code isn't logged in: /login signs in to your Claude plan, then send a message";

// how long `claude auth status` and `logout` may take (ms), and a
// model's window asked (ClaudeCode.size)
const AUTH = 30e3;

// Claude Code asked a model's window (ClaudeCode.size): on its control
// channel, as a call without tools runs (none of its tools, MCP servers,
// commands or hooks; no session kept)
const SIZE = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--settings", JSON.stringify({ disableAllHooks: true })];

// the Claude plan's windows asked (ClaudeCode.models: once an account a
// start), and the account they were asked of (its folder and email)
let sized: Promise<boolean> | null = null;
let sized_by = "";

// ClaudeCode
// ==========

export namespace ClaudeCode {

  // the CLI run
  export let bin = process.env.ILLI_CLAUDE ?? "claude";

  export function ask(ask: Ask, on: (ev: Event) => void): Try {
    ClaudeCode.account();
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
    // what the call leaves out of Claude Code's servers, as its arguments
    // say it (args reads it too, at once, from the same state)
    const cut = ClaudeCode.cut(ask);
    let proc: Subprocess<"pipe", "pipe", "pipe">;
    try {
      proc = Bun.spawn([ClaudeCode.bin, ...ClaudeCode.args(ask, file)], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: ClaudeCode.env(ask) });
    } catch (err: any) {
      fs.rmSync(file, { force: true });
      return none(/ENOENT|not found/i.test(String(err?.message)) ? NO_CLAUDE : String(err?.message ?? err), "down");
    }
    const run: Run = { ask, on, st: null, seen: [], sent: [], own: false, said: false, result: null, grew: false, reset: 0, shut: false, cut, first: null };
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
      if (ask.once || run.shut || stopped || !write(ClaudeCode.user([{ text: say.text, mark: false }], say.imgs))) {
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
  // Claude Code's own, of its built-in ones only those an agent's tools
  // list names, if it has one, but those illi gives itself: --tools), and
  // Claude Code's own MCP servers but what the call leaves out
  // (ClaudeCode.cut: all, --strict-mcp-config, or by rule,
  // --disallowedTools beside AskUserQuestion), else (or once) none, nor
  // Claude Code's servers or commands
  export function args(ask: Ask, file: string): string[] {
    const io = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--replay-user-messages", "--no-session-persistence"];
    const pick = ["--model", ask.model, "--effort", ask.effort, "--append-system-prompt-file", file, "--settings", JSON.stringify({ disableAllHooks: true })];
    if (ask.server === "" || ask.once) {
      return [...io, ...pick, "--tools", "", "--strict-mcp-config", "--disable-slash-commands"];
    }
    const mcp = { mcpServers: { illi: { type: "http", url: ask.server + "?lean", timeout: WAIT } } };
    const own = ask.builtins == null ? [] : ["--tools", ask.builtins.join(",")];
    const cut = ClaudeCode.cut(ask);
    const strict = cut.strict ? ["--strict-mcp-config"] : [];
    return [...io, ...pick, ...own, "--mcp-config", JSON.stringify(mcp), ...strict, "--allowedTools", "mcp__illi", "--disallowedTools", ["AskUserQuestion", ...cut.deny].join(","), "--permission-prompt-tool", "mcp__illi__approve"];
  }

  // what a call with tools leaves out of Claude Code's own MCP servers
  // (a call without loads none: args), so the model reads no tool it
  // isn't to have. The servers weighed: those last told, else, till a
  // call of this run tells them, those ever told, by the names kept
  // (ClaudeCode.cased; their tools not known). By rule, whole: each
  // server illi runs its own of, by name, told or not (over: illi's wins,
  // so the model gets one copy); each weighed that `off` names (none told
  // yet: each name `off` holds, case and all as told before, else as
  // written); with an agent's tools list (Ask.listed: mcp all,
  // mcp__github that server, mcp__github__get_issue those tools), each
  // weighed it doesn't name, and of one it names by tools alone its other
  // tools once told (not yet: none, so the call tells them). A server
  // never told loads in the call, whose init then tells it (one added to
  // Claude Code since, or one a list names that this run hasn't seen), so
  // a list never waits on a call without one to learn them. A list whose
  // names could load none (it names none, or only servers off or illi's
  // own) loads none (strict). A rule never reaches illi's own tools
  // (mcp__illi__...)
  export function cut(ask: Ask): Cut {
    if (ask.server === "" || ask.once) {
      return { strict: true, deny: [] };
    }
    const listed  = ask.listed?.filter((t) => t === "mcp" || t.startsWith("mcp__")) ?? null;
    const known   = ClaudeCode.servers();
    const own     = ClaudeCode.own().map(ClaudeCode.spell);
    const offs    = config.OFF.map((name) => ClaudeCode.spell(ClaudeCode.cased().get(name) ?? name));
    const weighed = known ?? [...ClaudeCode.cased().values()].map((name) => ({ name, tools: null, off: config.config_off(name), over: own.includes(ClaudeCode.spell(name)) }));
    const head    = (name: string) => "mcp__" + ClaudeCode.spell(name);
    const names   = (name: string, t: string) => t === head(name) || t.startsWith(head(name) + "__");
    const named   = (s: { name: string }) => (listed ?? ["mcp"]).filter((t) => t === "mcp" || names(s.name, t));
    // whether a name of a list could load a server: mcp, one weighed
    // neither off nor over, or one never told, unless off or illi's own
    const could = (t: string) => {
      const s = weighed.find((w) => names(w.name, t));
      const bare = t.slice("mcp__".length).split("__")[0];
      return t === "mcp" || (s === undefined ? !own.includes(bare) && !offs.includes(bare) : !s.off && !s.over);
    };
    if (listed !== null && !listed.some(could)) {
      return { strict: true, deny: [] };
    }
    const told = weighed.flatMap((s) => {
      const these = named(s);
      if (s.off || s.over || these.length === 0) {
        return [head(s.name) + "__*"];
      }
      if (s.tools === null || these.some((t) => !t.startsWith(head(s.name) + "__"))) {
        return [];
      }
      return s.tools.filter((t) => !these.includes(t));
    });
    const by = (spelled: string[]) => spelled.map((name) => "mcp__" + name + "__*");
    return { strict: false, deny: [...new Set([...by(own), ...told, ...(known === null ? by(offs) : [])])].filter((rule) => !rule.startsWith(OURS)) };
  }

  // Claude Code's own MCP servers as its last call that loaded them told
  // (null: none has yet), each whether `off` names it and whether illi's
  // own server of its name, running (not failed), is used in its place
  export function servers(): Theirs[] | null {
    ClaudeCode.account();
    const own = new Set(ClaudeCode.own().map(ClaudeCode.spell));
    return theirs?.map((s) => ({ ...s, off: config.config_off(s.name), over: own.has(ClaudeCode.spell(s.name)) })) ?? null;
  }

  // the names of illi's own MCP servers running (starting or ready: one
  // failed gives the model no copy, so Claude Code's of its name stays)
  export function own(): string[] {
    return Mcp.status().servers.filter((s) => s.state !== "failed").map((s) => s.name);
  }

  // a server's name as Claude Code spells it in its tools' names
  // (mcp__<name>__<tool>): each character but a letter, digit, _ or - as
  // _; a claude.ai connector's runs of _ then as one, none at its ends
  export function spell(name: string): string {
    const out = name.replace(/[^A-Za-z0-9_-]/g, "_");
    return name.startsWith("claude.ai ") ? out.replace(/_+/g, "_").replace(/^_|_$/g, "") : out;
  }

  // a call's init, where it loaded Claude Code's servers: each (but
  // illi's own), how it is, its tools as the init lists them (one the
  // call cut keeps those told before, if any: its tools may be left out
  // of the list); their names kept, case and all (NAMES)
  export function learn(m: any, cut: Cut): void {
    const tools = (Array.isArray(m.tools) ? m.tools : []).map(String).filter((t: string) => t.startsWith("mcp__"));
    const told  = (Array.isArray(m.mcp_servers) ? m.mcp_servers : []).filter((s: any) => typeof s?.name === "string" && s.name !== "illi");
    theirs = told.map((s: any) => {
      const head = "mcp__" + ClaudeCode.spell(s.name) + "__";
      const got  = tools.filter((t: string) => t.startsWith(head));
      const was  = theirs?.find((w) => w.name === s.name)?.tools ?? null;
      const left = cut.deny.some((rule) => rule.startsWith(head));
      return { name: s.name, status: String(s.status ?? ""), tools: !left ? got : (was ?? (got.length > 0 ? got : null)) };
    });
    const names = ClaudeCode.cased();
    const news  = theirs!.filter((s) => names.get(s.name.toLowerCase()) !== s.name);
    if (news.length > 0) {
      news.forEach((s) => names.set(s.name.toLowerCase(), s.name));
      ClaudeCode.keep([...names.values()]);
    }
  }

  // the names Claude Code's servers were ever told by, case and all, by
  // their lower case (NAMES read once)
  export function cased(): Map<string, string> {
    cases ??= new Map((json_object(NAMES)?.servers ?? []).filter((n: unknown) => typeof n === "string").map((n: string) => [n.toLowerCase(), n]));
    return cases;
  }

  // names kept in NAMES beside those there (another illi's too), every
  // profile's, the file written in one piece
  export function keep(names: string[]): void {
    const tmp = NAMES + "." + process.pid + ".tmp";
    const all = new Set([...(json_object(NAMES)?.servers ?? []).filter((n: unknown) => typeof n === "string"), ...names]);
    try {
      fs.mkdirSync(config.ROOT, { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify({ servers: [...all].sort() }, null, 2) + "\n");
      fs.renameSync(tmp, NAMES);
    } catch (err: any) {
      console.error("claude-code: " + NAMES + " wasn't kept: " + err?.message);
    }
  }

  // illi's prompt in a file of its own, readable by the user alone
  export function prompt(system: string): string {
    const file = os.tmpdir() + "/illi-claude-" + crypto.randomUUID() + ".md";
    fs.writeFileSync(file, system, { mode: 0o600 });
    return file;
  }

  // the environment Claude Code runs in: illi's, but the mark of a Claude
  // Code session around illi (as when illi runs inside one); a call illi
  // refits (Ask.room: a turn's, an agent's) with Claude Code's compaction
  // off (DISABLE_COMPACT), so one outgrowing the window ends "Prompt is
  // too long" (`full`) and illi folds the chat into its tree, or recaps
  // the agent's log (Tools.refit), never Claude Code's summary; one
  // without room (a summary, a goal check, a recap) keeps it
  export function env(ask: Ask): Record<string, string> {
    const env = ClaudeCode.folder_env(config.config_claude_dir());
    if (ask.room !== undefined) {
      env.DISABLE_COMPACT = "1";
    }
    return env;
  }

  // the environment Claude Code runs in for a folder: illi's, but the
  // mark of a Claude Code session around illi; one of illi's folders
  // named (CLAUDE_CONFIG_DIR; "": the user's own Claude Code's, as illi's
  // environment names it)
  export function folder_env(dir: string): Record<string, string> {
    const env = { ...process.env } as Record<string, string>;
    delete env.CLAUDECODE;
    if (dir !== "") {
      env.CLAUDE_CONFIG_DIR = dir;
    }
    return env;
  }

  // a Claude Code auth command in a folder (folder_env): what it printed
  // and its exit code, killed past AUTH; thrown: Claude Code isn't here
  export async function auth(dir: string, args: string[]): Promise<{ out: string; code: number }> {
    let proc: Subprocess<"ignore", "pipe", "pipe">;
    try {
      proc = Bun.spawn([ClaudeCode.bin, "auth", ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", env: ClaudeCode.folder_env(dir) });
    } catch (err: any) {
      throw new Error(/ENOENT|not found/i.test(String(err?.message)) ? NO_CLAUDE : String(err?.message ?? err));
    }
    const late = setTimeout(() => proc.kill("SIGKILL"), AUTH);
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited, new Response(proc.stderr).text()]);
    clearTimeout(late);
    return { out, code };
  }

  // whom a folder's Claude Code is logged in as (`claude auth status`):
  // its email, plan (an API key's login: how) and organization ("": none
  // told); null: not logged in. Thrown: Claude Code isn't here, or didn't
  // say
  export async function status(dir: string): Promise<{ email: string; plan: string; org: string } | null> {
    const { out } = await ClaudeCode.auth(dir, ["status", "--json"]);
    let data: any;
    try {
      data = JSON.parse(out);
    } catch {
      throw new Error("Claude Code didn't say whom it's logged in as");
    }
    const text = (x: unknown) => (typeof x === "string" ? x : "");
    return data?.loggedIn !== true ? null : { email: text(data.email), plan: text(data.subscriptionType) || (data.authMethod === "claude.ai" ? "" : text(data.authMethod)), org: text(data.orgName) };
  }

  // a folder's Claude Code logged out (`claude auth logout`; false: it
  // said it couldn't)
  export async function logout(dir: string): Promise<boolean> {
    return (await ClaudeCode.auth(dir, ["logout"])).code === 0;
  }

  // a folder signed in to a Claude plan (`claude auth login --claudeai`,
  // through pipes; one of illi's made first, readable by the user alone):
  // Claude Code opens its page itself, and each time it asks for the code
  // the page shows, `ask` is told the page's link ("": none told); `give`
  // gives it one; done as it exits (signed in; else, thrown, why not in
  // its last words). Stop kills it. Thrown at once: Claude Code isn't here
  export function signin(dir: string, stop: AbortSignal, ask: (url: string) => void): { give: (code: string) => void; done: Promise<void> } {
    if (dir !== "") {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    let proc: Subprocess<"pipe", "pipe", "pipe">;
    try {
      proc = Bun.spawn([ClaudeCode.bin, "auth", "login", "--claudeai"], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: ClaudeCode.folder_env(dir) });
    } catch (err: any) {
      throw new Error(/ENOENT|not found/i.test(String(err?.message)) ? NO_CLAUDE : String(err?.message ?? err));
    }
    const kill = () => proc.kill("SIGKILL");
    stop.addEventListener("abort", kill, { once: true });
    let said = "";
    let asked = 0;
    const read = (async () => {
      const text = new TextDecoder();
      const from = proc.stdout.getReader();
      for (let got = await from.read(); !got.done; got = await from.read()) {
        said += text.decode(got.value, { stream: true });
        for (const prompts = said.split(/paste (?:the )?code/i).length - 1; asked < prompts; asked++) {
          ask(/https:\/\/\S+(?=\s)/.exec(said)?.[0] ?? "");
        }
      }
    })().catch(() => {});
    const errs = new Response(proc.stderr).text();
    const give = (code: string) => {
      try {
        proc.stdin.write(code + "\n");
        proc.stdin.flush();
      } catch {}
    };
    const done = (async () => {
      const code = await proc.exited;
      await read;
      stop.removeEventListener("abort", kill);
      if (stop.aborted) {
        throw new Error("the login was stopped");
      }
      if (code !== 0) {
        const lines = (said + "\n" + (await errs)).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").split("\n").map((l) => l.trim());
        throw new Error(lines.filter((l) => l !== "" && !/paste (?:the )?code/i.test(l)).at(-1) ?? "Claude Code's login ended (exit " + code + ")");
      }
    })();
    return { give, done };
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

  // one line of the stream; a subagent's own steps skipped, and the
  // message an API error stands in (is_api_error_message: "Prompt is too
  // long", a plan's limit), whose why the result tells, never a reply
  export function read(run: Run, m: any): void {
    if (m.parent_tool_use_id) {
      return;
    }
    switch (m.type) {
      case "stream_event": {
        return ClaudeCode.live(run, ClaudeCode.named(m.event));
      }
      case "assistant": {
        if (m.is_api_error_message === true) {
          return;
        }
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
        const news = run.ask.room === undefined ? [] : Object.entries<any>(m.modelUsage ?? {}).filter(([id, use]) => Pick.told("claude-code", String(use?.canonicalModel ?? id), Number(use?.contextWindow ?? 0)));
        if (news.length > 0) {
          config.config_models_keep("claude-code", Pick.list("claude-code"));
        }
        return;
      }
      case "rate_limit_event": {
        const info = m.rate_limit_info ?? {};
        run.reset = info.status === "rejected" && Number(info.resetsAt) > 0 ? Number(info.resetsAt) * 1000 : run.reset;
        ClaudeCode.windows(info);
        return;
      }
      case "system": {
        return ClaudeCode.system(run, m);
      }
    }
  }

  // a rate limit event's windows (unifiedWindows), each its share used
  // and when it starts anew, kept for the side (ClaudeCode.told); those
  // it doesn't tell kept as last told
  export function windows(info: any): void {
    const told = Object.entries<any>(info?.unifiedWindows ?? {}).flatMap(([name, w]): Limit[] => {
      const window = WINDOWS[name];
      const used   = Number(w?.utilization);
      const reset  = Number(w?.resetsAt) * 1000;
      return window === undefined || !Number.isFinite(used) || !(reset > 0) ? [] : [{ window, used: Math.round(used * 1000) / 10, reset }];
    });
    limits = [...limits.filter((l) => !told.some((t) => t.window === l.window)), ...told].sort((a, b) => a.window - b.window);
  }

  // the Claude plan as the views show it, once a call told its usage
  // (null: none told yet); Claude Code names no plan, so none is named
  export function told(): Plan | null {
    ClaudeCode.account();
    return limits.length === 0 ? null : { brand: "Claude", tier: "", limits };
  }

  // the account in use looked at: another (a /login switch, here or in
  // another terminal) drops what the old one's calls told (its servers,
  // its plan's use)
  export function account(): void {
    const now = config.config_claude_dir();
    if (now !== folder) {
      [folder, theirs, limits] = [now, null, []];
    }
  }

  // the windows of the Claude plan's models, as a turn of the account in
  // use has them (a plan's are its own: one without long context gets
  // 200k), each learned and kept for the next start; asked once an
  // account a start (its folder, and whom it's logged in as: one signed
  // in since is asked anew), so a window is right before any message.
  // true: a window changed
  export function models(): Promise<boolean> {
    const dir  = config.config_claude_dir();
    const kept = config.config_accounts_read()?.["claude-code"];
    const by   = dir + "\n" + (kept?.accounts.find((a) => a.id === kept.use)?.email ?? "");
    if (sized_by !== by) {
      [sized, sized_by] = [null, by];
    }
    sized ??= Promise.all(Pick.list("claude-code").map(async (m) => Pick.told("claude-code", m.id, await ClaudeCode.size(dir, m.id)))).then((told) => {
      const news = told.some(Boolean);
      if (news) {
        config.config_models_keep("claude-code", Pick.list("claude-code"));
      }
      return news;
    });
    return sized;
  }

  // a model's window as Claude Code in a folder has it for a turn (its
  // compaction off: ClaudeCode.env), asked on its control channel
  // (get_context_usage, summed up: no model called, nothing counted), a
  // Claude Code each (set_model leaves the window as it was), stopped
  // once it said; 0: none told (Claude Code isn't here, or said nothing
  // that reads by AUTH)
  export async function size(dir: string, id: string): Promise<number> {
    let proc: Subprocess<"pipe", "pipe", "ignore">;
    try {
      proc = Bun.spawn([ClaudeCode.bin, ...SIZE, "--model", id], { stdin: "pipe", stdout: "pipe", stderr: "ignore", env: { ...ClaudeCode.folder_env(dir), DISABLE_COMPACT: "1" } });
    } catch {
      return 0;
    }
    const late = setTimeout(() => proc.kill("SIGKILL"), AUTH);
    try {
      proc.stdin.write(JSON.stringify({ type: "control_request", request_id: "size", request: { subtype: "get_context_usage", detail: "summary" } }) + "\n");
      proc.stdin.flush();
      const text = new TextDecoder();
      const from = proc.stdout.getReader();
      let said = "";
      for (let got = await from.read(); !got.done; got = await from.read()) {
        const lines = (said + text.decode(got.value, { stream: true })).split("\n");
        said = lines.pop()!;
        for (const line of lines) {
          let m: any;
          try {
            m = JSON.parse(line);
          } catch {
            continue;
          }
          if (m?.type === "control_response" && m.response?.request_id === "size") {
            const window = Number(m.response.response?.rawMaxTokens);
            return Number.isInteger(window) && window > 0 ? window : 0;
          }
        }
      }
      return 0;
    } catch {
      return 0;
    } finally {
      clearTimeout(late);
      proc.kill();
    }
  }

  // an API event, shown live: a message starts its own stream read; the
  // first, the tokens its request read (the chat, and all Claude Code's
  // prompt and tools take beside it: End.first)
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
    } else if (ev.type === "message_start") {
      run.first ??= run.st.use.input + run.st.use.write + run.st.use.read;
    }
  }

  // a user line: tool results, each its call's echo (the call grew:
  // its first request fit, Claude Code having no room of illi's); else a
  // message echoed, the call's own first, then those sent mid-run, in turn
  export function heard(run: Run, m: any): void {
    const content = m.message?.content;
    const results = Array.isArray(content) ? content.filter((c: any) => c.type === "tool_result") : [];
    for (const r of results) {
      run.on({ $: "Entry", kind: "echo", text: (r.is_error ? FAILED : "") + (AskAI.show(r.content) || "(no output)"), of: r.tool_use_id });
    }
    run.grew ||= results.length > 0;
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

  // a system line: a retry, a thought; illi's tools not connecting,
  // logged; Claude Code's own servers, where the call loaded them, learned
  export function system(run: Run, m: any): void {
    if (m.subtype === "api_retry") {
      const secs = Math.ceil(Number(m.retry_delay_ms ?? 0) / 1000);
      run.on({ $: "Entry", kind: "mind", text: "The AI service is busy: asking again" + (secs > 0 ? " in " + secs + " s." : ".") });
    }
    const ours = (m.mcp_servers ?? []).find((s: any) => s.name === "illi");
    if (m.subtype === "init" && ours !== undefined && ours.status !== "connected") {
      console.error("claude-code: illi's tools: " + ours.status);
    }
    if (m.subtype === "init" && !run.cut.strict) {
      ClaudeCode.learn(m, run.cut);
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
  // or its exit code); one too long for the window after a tool's result
  // came back grew (End.grew); the tokens its first request read, if told
  // (End.first)
  export function end(run: Run, err: string, code: number): End {
    const r = run.result;
    const first = run.first ? { first: run.first } : {};
    if (r !== null && r.subtype === "success" && !r.is_error) {
      return { ok: true, text: String(r.result ?? ""), left: [], ...first };
    }
    const said = r === null ? err || "Claude Code ended (exit code " + code + ") with no reply" : String(r.result || (r.errors ?? []).join("\n") || r.subtype);
    if (r !== null || err !== "") {
      console.error("claude-code: " + said.slice(0, 300));
    }
    const end = ClaudeCode.failed(said, r?.api_error_status ?? null, run.reset);
    return { ...end, left: [], cut: run.said, grew: end.stop === "full" && run.grew, ...first };
  }

  // a failure in plain words: too long for the window; more cache marks
  // than the API takes (`marks`: illi's one beside Claude Code's four);
  // a plan's limit (when it resets, if told); a login missing; a busy
  // service (a later try may answer); else as Claude Code says it
  export function failed(said: string, status: number | null, reset: number): End {
    if (Agent.full(said)) {
      return { ok: false, text: said, left: [], stop: "full" };
    }
    if (MARKED.test(said)) {
      return { ok: false, text: said, left: [], stop: "marks" };
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
