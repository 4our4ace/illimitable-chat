// Login commands
// ==============
// /login: the providers illi runs on and their accounts, where all of
// connecting is done, nothing typed into a file. Its first picker, the
// providers: ChatGPT and Claude, each saying what of it is connected, the
// one the chat runs on marked; Enter on one, its two ways in: ChatGPT's
// plan (Plus or Pro) or an OpenAI API key, Claude's plan (through Claude
// Code) or an Anthropic API key, each saying what it's connected with;
// Esc goes a level up, from these and from all they open (a question
// asked too). Enter on a way in not connected connects it: ChatGPT by
// its device login (its page opened, its code copied: login_chatgpt), or
// opencode's login if /login left it to opencode; Claude by your Claude
// Code's login, or a sign-in (Claude Code's own, its code pasted here as
// dots: login_claude_sign; the first, with none connected and your
// Claude Code logged in to none, your own Claude Code's; else in a
// folder of illi's); an API
// by a key pasted in a line shown as dots, or the environment's
// (ANTHROPIC_API_KEY, OPENAI_API_KEY) if it's set, each checked with
// the provider before it's taken (Accounts.ts keeps a pasted one, in
// illi's root: every profile's; never the environment's). On one
// connected: its accounts, the one in use marked: Enter uses one, Del
// logs one out (asked first), a row connects one more, the last logs
// out of it (asked first). ChatGPT's accounts: the one in use
// in its login file, opencode's while illi may use it, the others kept
// apart (ChatGPT.swap): a switch puts one in the login file and keeps
// the one there apart, so each renews in its turn. Claude's accounts:
// your Claude Code's (logging out leaves it logged in) and those signed
// in to in folders of illi's own (logging out logs them out, their
// folders gone). What's connected is offered at once, and what's let go
// is gone, here and in every illi open (config.config_accounts,
// Chat.follow), unless the vendors setting names the providers, which
// /login then says. /logout opens the same pickers. A key is never shown
// whole, nor kept anywhere but the accounts' file: not in the input's
// history, the chat or a note.

import * as fs from "node:fs";
import { Accounts, ENV, OWN, type Folder, type Keyed, type Saved } from "../config/Accounts.ts";
import { Anthropic } from "../ai/Anthropic.ts";
import type { Vendor } from "../ai/AskAI.ts";
import { browser_open } from "./Browser.ts";
import { Chat } from "../chat/Chat.ts";
import { ChatGPT } from "../ai/ChatGPT.ts";
import { ClaudeCode } from "../ai/ClaudeCode.ts";
import { term_account, term_ask, term_chooser, term_question } from "./Commands.ts";
import { term_draw } from "./Frame.ts";
import * as config from "../config/Config.ts";
import { term_note, term_notify, term_unnotify, type Notice } from "./Notices.ts";
import { OpenAI } from "../ai/OpenAI.ts";
import * as Screen from "../ui/Screen.ts";
import { term_unhint, type Term } from "./Term.ts";

// Types
// =====

// an account of a provider, as its picker shows it: its name, what it is,
// whether it's in use; what Enter and Del do on it (Del asks first, Esc
// there going back to `back`)
type Account = { name: string; about: string; use: boolean; take: () => void; drop: (back: () => void) => void };

// a provider (a way in: a plan, an API key): its name, its vendor, what
// its row says; its accounts (none: not connected); what connects one
// more (its row's name, "": none yet), and what logs out of it all, each
// given where Esc on what it asks goes back to
type Provider = { name: string; vendor: Vendor; about: () => string; accounts: () => Account[]; adds: string; add: (back: () => void) => void; out: (back: () => void) => void };

// a maker's providers, as /login's first picker shows them: its name,
// what its row says while none is connected, its providers (its plan,
// its API)
type Maker = { name: string; offers: string; providers: Provider[] };

// an API's vendor: its key's name (config.KEYS), its variable, where a
// key is made, how one is checked
type Api = { vendor: "claude-api" | "openai-api"; name: string; key: string; where: string; check: (key: string) => Promise<string> };

// Constants
// =========

// how long ChatGPT's code shows: as long as it is good (ms), or till the
// login ends; how long a failure shows, till Esc or a message
const LOGIN        = 15 * 60000;
const LOGIN_FAILED = 60000;

// the APIs, as their providers
const APIS: Api[] = [
  { vendor: "claude-api", name: "Anthropic API key", key: "anthropic", where: "console.anthropic.com", check: Anthropic.check },
  { vendor: "openai-api", name: "OpenAI API key",    key: "openai",    where: "platform.openai.com",   check: OpenAI.check },
];

// Login
// =====

// /login (and /logout): the providers' picker, the accounts read again
// first (another terminal's change: a view's illi follows no chat that
// would have)
export function term_login(t: Term): void {
  config.config_accounts();
  login_makers(t);
}

// the makers' picker, each saying what of its is connected, the one the
// chat runs on marked; Enter opens its ways in
function login_makers(t: Term): void {
  const all  = login_all(t);
  const here = all.findIndex((m) => m.providers.some((p) => p.vendor === t.v.pick?.vendor));
  const about = all.map((m) => {
    const on = m.providers.filter((p) => p.accounts().length > 0);
    return on.length === 0 ? m.offers : "connected: " + on.map((p) => p.name).join(" and ");
  });
  term_chooser(t, "Providers", all.map((m) => m.name), about, here, (k) => login_maker(t, all[k]), { foot: () => "Enter open" });
}

// the makers, in the picker's order, each its plan first, then its API
function login_all(t: Term): Maker[] {
  const [anthropic, openai] = APIS.map((api) => login_api(t, api));
  return [
    { name: "ChatGPT", offers: "by OpenAI: your ChatGPT plan or an API key", providers: [login_chatgpt_provider(t), openai] },
    { name: "Claude",  offers: "by Anthropic: your Claude plan or an API key", providers: [login_claude_provider(t), anthropic] },
  ];
}

// a maker's ways in, each saying what it's connected with, the one the
// chat runs on marked: Enter connects one, or opens its accounts; Esc
// goes back to the makers
function login_maker(t: Term, m: Maker): void {
  const here = m.providers.findIndex((p) => p.vendor === t.v.pick?.vendor);
  const foot = (k: number) => (m.providers[k].accounts().length === 0 ? "Enter connect" : "Enter its accounts") + " · Esc back";
  term_chooser(t, m.name, m.providers.map((p) => p.name), m.providers.map((p) => p.about()), here, (k) => login_provider(t, m.providers[k], () => login_maker(t, m)), { foot, back: () => login_makers(t) });
}

// a provider picked: not connected, connected; else its accounts (Esc
// on either going back to `back`)
function login_provider(t: Term, p: Provider, back: () => void): void {
  return p.accounts().length === 0 ? p.add(back) : login_accounts(t, p, back);
}

// a provider's accounts' picker, the one in use marked: Enter uses one,
// Del logs one out; then the row that connects one more (if it can) and
// the one that logs out of it all; Esc goes back to `back`, and from
// what these ask, back here
function login_accounts(t: Term, p: Provider, back: () => void): void {
  const again    = () => login_accounts(t, p, back);
  const accounts = p.accounts();
  const adds  = p.adds === "" ? [] : [p.adds];
  const out   = "Log out of " + p.name;
  const names = [...accounts.map((a) => a.name), ...adds, out];
  const about = [...accounts.map((a) => a.about), ...adds.map(() => ""), accounts.length === 1 ? "" : "all " + accounts.length + " of them"];
  const keys  = (k: number, key: string) => {
    if (key !== "Delete" || k >= accounts.length) {
      return false;
    }
    accounts[k].drop(again);
    return true;
  };
  const foot  = (k: number) => (k < accounts.length ? (accounts[k].use ? "in use" : "Enter use it") + " · Del log it out" : names[k] === out ? "Enter log out" : "Enter connect") + " · Esc back";
  const pick  = (k: number) => (k < accounts.length ? accounts[k].take() : names[k] === out ? p.out(again) : p.add(again));
  term_chooser(t, p.name, names, about, accounts.findIndex((a) => a.use), pick, { keys, foot, back });
}

// what follows a change of accounts: read again at once (the vendors
// offered, the keys in use), the chat told (its pick given way if its
// vendor went), the start's login note let go once ChatGPT is no longer
// what the chat waits on, each account's catalog asked; said, with what
// the vendors setting leaves out
function login_after(t: Term, vendor: Vendor, said: string): void {
  config.config_accounts(true);
  if (t.chat !== null) {
    Chat.offered(t.chat);
  }
  if (!config.OFFER.vendors.includes("chatgpt") || ChatGPT.signed()) {
    term_unhint(t);
  }
  term_account(t);
  const left = config.config_named() && (vendor === "chatgpt" ? ChatGPT.signed() : Object.keys(config.config_accounts_read() ?? {}).includes(vendor)) && !config.OFFER.vendors.includes(vendor);
  const env  = config.config_env_set("vendors");
  const fix  = env === null ? "Your vendors setting leaves " + vendor + " out, though: /set vendors default lets /login decide." : env + " leaves " + vendor + " out, though: start illi without it to let /login decide.";
  term_note(t, said + (left ? " " + fix : ""));
}

// a change to the accounts' file, said if it fails (true: done)
function login_edit(t: Term, f: Parameters<typeof Accounts.edit>[1]): boolean {
  const why = Accounts.edit(config.ROOT, f);
  if (why !== null) {
    term_note(t, "Can't change the accounts: " + why + ".");
  }
  return why === null;
}

// a question that asks before a log out (Enter on its second answer;
// Esc goes back to `back`)
function login_sure(t: Term, title: string, about: string, done: () => void, back: () => void): void {
  term_question(t, title, ["Keep it", "Log out"], ["", about], (k) => (k === 1 ? done() : undefined), { back });
}

// Claude plan
// ===========

// the Claude plan (claude-code: Claude Code run as it ships) as a
// provider: its accounts, each a Claude Code folder (ClaudeCode.ts: the
// user's own Claude Code's, and those illi signed in, a folder each in
// its root), named by the email Claude Code told, told by its plan
function login_claude_provider(t: Term): Provider {
  const kept = () => config.config_accounts_read()?.["claude-code"];
  const accounts = (): Account[] => {
    const now = kept();
    const all = now?.accounts ?? [];
    return all.map((a) => ({ name: login_claude_name(a, all), about: [a.plan, a.id === OWN ? "your Claude Code" : "illi's own folder"].filter(Boolean).join(" · "), use: now!.use === a.id, take: () => login_claude_use(t, a), drop: (back) => login_claude_drop(t, a, back) }));
  };
  const about = () => {
    const now = kept();
    const a   = now?.accounts.find((a) => a.id === now.use);
    return a === undefined ? "your Claude plan, through Claude Code" : "connected: " + login_claude_name(a, now!.accounts);
  };
  return { name: "Claude plan", vendor: "claude-code", about, accounts, adds: "+ add another account", add: (back) => void login_claude_add(t, back), out: (back) => login_claude_out(t, back) };
}

// an account's name: the email Claude Code told (none: whose folder it
// is), its organization too where another of all has its email
function login_claude_name(a: Folder, all: Folder[] = []): string {
  const twin = all.some((o) => o.id !== a.id && o.email === a.email && a.org !== "");
  return a.email === "" ? (a.id === OWN ? "your Claude Code" : "account " + a.id) : twin ? a.email + " (" + a.org + ")" : a.email;
}

// an account more: none yet, the user's own Claude Code's (its login, if
// it's logged in, or a sign-in to another, asked once Claude Code said:
// drawn then; not, it signs in); else one signed in to in a folder of
// illi's. Esc on what it asks goes back to `back`
async function login_claude_add(t: Term, back: () => void): Promise<void> {
  if ((config.config_accounts_read()?.["claude-code"]?.accounts.length ?? 0) > 0) {
    return login_claude_sign(t, login_claude_id(), back);
  }
  let who: Awaited<ReturnType<typeof ClaudeCode.status>>;
  try {
    who = await ClaudeCode.status("");
  } catch (err: any) {
    return term_note(t, err.message + ".");
  }
  if (who === null) {
    return login_claude_sign(t, OWN, back);
  }
  const mine = { id: OWN, ...who };
  term_question(t, "Connect Claude plan", ["Use your Claude Code's login", "Sign in to another account"], [login_claude_name(mine), "with a code at Claude's page"], (k) => {
    return k === 1 ? void login_claude_sign(t, login_claude_id(), back) : login_claude_keep(t, mine, "Connected your Claude plan (" + login_claude_name(mine) + "): its models are in /model.");
  }, { back });
  term_draw(t);
}

// a new folder of illi's id, none of those kept nor a folder left there
function login_claude_id(): string {
  const ids = (config.config_accounts_read()?.["claude-code"]?.accounts ?? []).map((a) => a.id);
  for (let n = 1; ; n++) {
    if (!ids.includes("c" + n) && !fs.existsSync(Accounts.folder(config.ROOT, "c" + n))) {
      return "c" + n;
    }
  }
}

// an account kept (in place of one of its folder) and in use from now
// on; said
function login_claude_keep(t: Term, a: Folder, said: string): void {
  const done = login_edit(t, (store) => {
    const was = store["claude-code"]?.accounts ?? [];
    return { ...store, "claude-code": { use: a.id, accounts: [...was.filter((o) => o.id !== a.id), a] } };
  });
  if (done) {
    login_after(t, "claude-code", said);
  }
}

// a folder signed in to a Claude plan (ClaudeCode.signin): Claude Code
// opens its page; the code the page shows asked for here, shown as dots
// (Esc stops it all, back to `back`), given it; signed in, whom it's
// logged in as kept and in use. One of illi's folders that never signed
// in goes
async function login_claude_sign(t: Term, id: string, back: () => void): Promise<void> {
  t.login?.abort();
  const stop = new AbortController();
  t.login = stop;
  const dir = Accounts.folder(config.ROOT, id);
  let asked: Notice | null = null;
  let line: Term["question"] = null;
  let give = (_code: string) => {};
  const ask = (url: string) => {
    if (asked !== null) {
      term_unnotify(t, asked);
    }
    asked = term_notify(t, "Sign in to Claude in your browser" + (url === "" ? "" : " (if it didn't open: " + url + ")") + ", then paste the code the page shows.", false, LOGIN);
    term_ask(t, "Claude plan", "paste the code from Claude's page", "", "Enter sign in · Esc stop", (code) => {
      if (code === "") {
        return "Paste the code first.";
      }
      give(code);
      return null;
    }, true, () => {
      stop.abort();
      back();
    });
    line = t.question;
  };
  try {
    const run = ClaudeCode.signin(dir, stop.signal, ask);
    give = run.give;
    await run.done;
    const who = await ClaudeCode.status(dir);
    if (who === null) {
      throw new Error("Claude Code says it isn't logged in");
    }
    const a = { id, ...who };
    login_claude_keep(t, a, "Signed in to your Claude plan as " + login_claude_name(a) + ": illi runs on it now.");
  } catch (err: any) {
    if (!stop.signal.aborted) {
      term_notify(t, "Login failed: " + err.message + ".", false, LOGIN_FAILED);
    }
    if (id !== OWN && !(config.config_accounts_read()?.["claude-code"]?.accounts ?? []).some((a) => a.id === id)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  } finally {
    t.login = t.login === stop ? null : t.login;
    t.question = t.question === line ? null : t.question;
    if (asked !== null) {
      term_unnotify(t, asked);
    }
    term_draw(t);
  }
}

// an account used from now on
function login_claude_use(t: Term, a: Folder): void {
  if (login_edit(t, (store) => ({ ...store, "claude-code": { ...store["claude-code"]!, use: a.id } }))) {
    login_after(t, "claude-code", "Claude plan now runs on " + login_claude_name(a) + ".");
  }
}

// an account logged out (asked first, Esc back to `back`): the user's
// own Claude Code's left be (still logged in, only no longer used), one
// of illi's logged out and its folder gone; the next account in use in
// its place, none left: the Claude plan let go
function login_claude_drop(t: Term, a: Folder, back: () => void): void {
  const own  = a.id === OWN;
  const name = login_claude_name(a);
  const ask  = own ? ["Stop using your Claude Code's login?", "Claude Code stays logged in; illi leaves it be"] : ["Log out of " + name + "?", "illi logs its Claude Code out and forgets the folder"];
  login_sure(t, ask[0], ask[1], () => {
    void (async () => {
      if (!own) {
        await login_claude_forget(a.id);
      }
      const done = login_edit(t, (store) => {
        const rest = (store["claude-code"]?.accounts ?? []).filter((o) => o.id !== a.id);
        const use  = store["claude-code"]?.use === a.id ? rest[0]?.id ?? "" : store["claude-code"]!.use;
        const { "claude-code": _, ...others } = store;
        return rest.length === 0 ? others : { ...store, "claude-code": { use, accounts: rest } };
      });
      if (done) {
        login_after(t, "claude-code", own ? "illi no longer uses your Claude Code's login." : "Logged out of " + name + ".");
      }
    })();
  }, back);
}

// one of illi's folders logged out and gone (its Claude Code's login
// with it; a logout that fails: the folder goes all the same)
async function login_claude_forget(id: string): Promise<void> {
  const dir = Accounts.folder(config.ROOT, id);
  await ClaudeCode.logout(dir).catch(() => false);
  fs.rmSync(dir, { recursive: true, force: true });
}

// the Claude plan logged out (asked first, Esc back to `back`): illi's
// folders logged out and gone, the plan no longer offered; the user's
// own Claude Code stays logged in
function login_claude_out(t: Term, back: () => void): void {
  login_sure(t, "Log out of Claude plan?", "illi logs its own folders out and stops offering the Claude plan; your Claude Code stays logged in", () => {
    void (async () => {
      const ids = (config.config_accounts_read()?.["claude-code"]?.accounts ?? []).map((a) => a.id).filter((id) => id !== OWN);
      await Promise.all(ids.map(login_claude_forget));
      if (login_edit(t, ({ "claude-code": _, ...others }) => others)) {
        login_after(t, "claude-code", "Logged out of the Claude plan.");
      }
    })();
  }, back);
}

// APIs
// ====

// an API's vendor as a provider: its keys, the environment's first (only
// once it's connected: a key set for other programs isn't taken unasked)
function login_api(t: Term, api: Api): Provider {
  const env   = () => config.config_env_key(api.key);
  const kept  = () => config.config_accounts_read()?.[api.vendor];
  const named = config.VARS[api.key];
  const accounts = (): Account[] => {
    const now = kept();
    if (now === undefined) {
      return [];
    }
    const own = env() === "" ? [] : [{ name: Accounts.mask(env()), about: "from " + named, use: now.use === ENV, id: ENV }];
    const all = [...own, ...now.keys.map((k) => ({ name: Accounts.mask(k.key), about: k.added === "" ? "" : "added " + k.added.slice(0, 10), use: now.use === k.id, id: k.id }))];
    return all.map((a) => ({ ...a, take: () => login_api_use(t, api, a.id, a.name), drop: (back: () => void) => login_api_drop(t, api, a.id, back) }));
  };
  const about = () => {
    const now = kept();
    const key = config.KEYS[api.key];
    return now !== undefined ? (key !== "" ? "connected: " + Accounts.mask(key) : "connected, but " + named + " isn't set here") : env() !== "" ? named + " is set: Enter connects it" : "a key from " + api.where;
  };
  const add = (back: () => void) => (kept() === undefined && env() !== "" ? login_api_env(t, api, back) : login_api_ask(t, api, back));
  return { name: api.name, vendor: api.vendor, about, accounts, adds: "+ add another key", add, out: (back) => login_api_out(t, api, back) };
}

// an API not connected whose variable is set: that key, or another (Esc
// back to `back`)
function login_api_env(t: Term, api: Api, back: () => void): void {
  const named = config.VARS[api.key];
  const key   = config.config_env_key(api.key);
  term_question(t, "Connect " + api.name, ["Use " + named, "Paste another key"], [Accounts.mask(key), "kept in illi's accounts"], (k) => (k === 0 ? void login_api_take(t, api, key, ENV) : login_api_ask(t, api, back)), { back });
}

// a key asked for, shown as dots, then checked and kept (Esc back to
// `back`)
function login_api_ask(t: Term, api: Api, back: () => void): void {
  term_ask(t, api.name, "paste it here: a key from " + api.where, "", "Enter connect · Esc back", (text) => {
    const key = text.trim();
    if (key === "") {
      return "Paste the key first.";
    }
    if (/\s/.test(key)) {
      return "A key has no spaces in it: paste it alone.";
    }
    void login_api_take(t, api, key, null);
    return null;
  }, true, back);
}

// a key checked with its provider, then taken: the environment's (ENV) in
// use, or a pasted one kept and in use; refused, said
async function login_api_take(t: Term, api: Api, key: string, id: string | null): Promise<void> {
  const checking = term_notify(t, "Checking the key with " + api.name.replace(/ API key$/, "") + "…", false, 30000);
  const why = await api.check(key);
  term_unnotify(t, checking);
  if (why !== "") {
    return term_note(t, "The key wasn't connected: " + why + ".");
  }
  const added = new Date().toISOString();
  const done = login_edit(t, (store) => {
    const was: Keyed = store[api.vendor] ?? { use: ENV, keys: [] };
    const same = was.keys.find((k) => k.key === key);
    const use  = id ?? same?.id ?? Accounts.id(was.keys);
    const keys = id !== null || same !== undefined ? was.keys : [...was.keys, { id: use, key, added }];
    return { ...store, [api.vendor]: { use, keys } };
  });
  if (done) {
    login_after(t, api.vendor, "Connected " + api.name.replace(/ key$/, "") + " (" + Accounts.mask(key) + "): its models are in /model.");
  }
}

// a key of a connected API used from now on (shown: as its row shows it)
function login_api_use(t: Term, api: Api, id: string, shown: string): void {
  if (login_edit(t, (store) => ({ ...store, [api.vendor]: { ...store[api.vendor]!, use: id } }))) {
    login_after(t, api.vendor, api.name.replace(/ key$/, "") + " now runs on " + shown + ".");
  }
}

// a key logged out (asked first, Esc back to `back`): a pasted one
// forgotten (the last one left, the provider let go); the environment's
// can't be, as illi keeps no copy of it, unless it's the last, which
// lets the provider go
function login_api_drop(t: Term, api: Api, id: string, back: () => void): void {
  const now = config.config_accounts_read()?.[api.vendor];
  if (now === undefined) {
    return;
  }
  const rest = now.keys.filter((k) => k.id !== id);
  if (id === ENV) {
    return rest.length > 0 ? term_note(t, config.VARS[api.key] + " is your environment's, so illi keeps no copy of it to forget: Enter on another key uses that one.") : login_api_out(t, api, back);
  }
  if (rest.length === 0 && config.config_env_key(api.key) === "") {
    return login_api_out(t, api, back);
  }
  const key = now.keys.find((k) => k.id === id)?.key ?? "";
  login_sure(t, "Log out of " + Accounts.mask(key) + "?", "illi forgets the key", () => {
    const done = login_edit(t, (store) => {
      const was = store[api.vendor];
      const keys = was?.keys.filter((k) => k.id !== id) ?? [];
      return was === undefined ? store : { ...store, [api.vendor]: { use: was.use === id ? keys.at(-1)?.id ?? ENV : was.use, keys } };
    });
    if (done) {
      login_after(t, api.vendor, "Logged out of " + Accounts.mask(key) + ".");
    }
  }, back);
}

// an API let go (asked first, Esc back to `back`): its pasted keys
// forgotten, its vendor no longer offered
function login_api_out(t: Term, api: Api, back: () => void): void {
  const name = api.name.replace(/ key$/, "");
  login_sure(t, "Log out of " + name + "?", "illi forgets its keys and stops offering its models", () => {
    if (login_edit(t, (store) => Object.fromEntries(Object.entries(store).filter(([vendor]) => vendor !== api.vendor)))) {
      login_after(t, api.vendor, "Logged out of " + name + ".");
    }
  }, back);
}

// ChatGPT
// =======

// ChatGPT as a provider: the account in use (its login file's, renewed
// there), opencode's login while illi may use it and it isn't the one in
// use, then the accounts kept apart (ChatGPT.swap); each named by its
// email, told by its plan and where its login is
function login_chatgpt_provider(t: Term): Provider {
  const accounts = (): Account[] => {
    const file  = ChatGPT.file();
    const using = ChatGPT.kept(file);
    const ours  = file !== config.OPENCODE_LOGIN;
    const other = config.LOGIN_SET === null && ours && ChatGPT.logins().opencode ? ChatGPT.kept(config.OPENCODE_LOGIN) : null;
    const where = config.LOGIN_SET !== null ? "the file `login` names" : ours ? "illi's login" : "opencode's login";
    const all = [
      ...(using === null ? [] : [{ s: using, where, use: true, take: () => {}, drop: (back: () => void) => (ours ? login_chatgpt_drop(t, using, true, back) : login_chatgpt_leave(t, back)) }]),
      ...(other === null || other.key === using?.key ? [] : [{ s: other, where: "opencode's login", use: false, take: () => void login_chatgpt_use(t, null), drop: (back: () => void) => login_chatgpt_leave(t, back) }]),
      ...ChatGPT.logins().saved.filter((s) => s.key !== using?.key && s.key !== other?.key).map((s) => ({ s, where: "", use: false, take: () => void login_chatgpt_use(t, s), drop: (back: () => void) => login_chatgpt_drop(t, s, false, back) })),
    ];
    return all.map((a) => ({ name: login_chatgpt_name(a.s, all.map((b) => b.s)), about: [a.s.plan, a.where].filter(Boolean).join(" · "), use: a.use, take: a.take, drop: a.drop }));
  };
  const about = () => {
    const using = ChatGPT.kept(ChatGPT.file());
    return using !== null ? "connected: " + login_chatgpt_name(using) : login_chatgpt_opencode() !== null ? "opencode's login is there: Enter connects it" : "your ChatGPT plan (Plus or Pro): Enter signs in";
  };
  const add = (back: () => void) => (login_chatgpt_opencode() !== null ? login_chatgpt_connect(t, back) : void login_chatgpt(t));
  return { name: "ChatGPT plan", vendor: "chatgpt", about, accounts, adds: "+ add another account", add: (back) => (accounts().length === 0 ? add(back) : void login_chatgpt(t)), out: (back) => login_chatgpt_out(t, back) };
}

// an account's name: its email (none told: its account's start), its
// account's start too where another of all has its email (one email,
// two workspaces)
function login_chatgpt_name(s: Saved, all: Saved[] = []): string {
  const twin = all.some((o) => o.key !== s.key && o.email === s.email);
  return s.email === "" ? "account " + s.key.slice(0, 12) : twin ? s.email + " (" + s.key.slice(0, 8) + ")" : s.email;
}

// opencode's login, while /login left it to opencode (null: none there,
// it is one of the accounts, or `login` names the file)
function login_chatgpt_opencode(): Saved | null {
  return config.LOGIN_SET === null && !ChatGPT.logins().opencode ? ChatGPT.kept(config.OPENCODE_LOGIN) : null;
}

// ChatGPT not connected while opencode's login is there, left to opencode:
// that one, or a sign-in to another (Esc back to `back`)
function login_chatgpt_connect(t: Term, back: () => void): void {
  const other = login_chatgpt_opencode()!;
  term_question(t, "Connect ChatGPT plan", ["Use opencode's login", "Sign in to another account"], [login_chatgpt_name(other), "with a code at OpenAI's page"], (k) => {
    if (k === 1) {
      return void login_chatgpt(t);
    }
    const why = ChatGPT.allow(true);
    return why !== null ? term_note(t, "Can't change the accounts: " + why + ".") : login_after(t, "chatgpt", "ChatGPT runs on opencode's login (" + login_chatgpt_name(other) + ").");
  }, { back });
}

// ChatGPT's device login: its page and code said (the code copied), the
// login kept once the person gives it (in the file `login` names, else
// as illi's own; the account there before kept apart: ChatGPT.swap);
// again, a new code (the last one let go)
export async function login_chatgpt(t: Term): Promise<void> {
  t.login?.abort();
  const stop = new AbortController();
  t.login = stop;
  let asked: Notice | null = null;
  try {
    const { url, code, done } = await ChatGPT.device(stop.signal);
    Screen.screen_copy(code);
    const until   = Date.now() + LOGIN;
    const opening = t.scr.tty ? browser_open(url) : null;
    const open    = (why: string) => "Sign in to ChatGPT: " + why + "open " + url + " and enter the code " + code + " (copied; it is good for 15 minutes). illi waits for it.";
    asked = term_notify(t, opening === null ? open("") : "Sign in to ChatGPT at " + url + " (opening in your browser) with the code " + code + " (copied; it is good for 15 minutes). illi waits for it.", false, LOGIN);
    void opening?.then((why) => {
      if (why !== "" && t.login === stop && asked !== null) {
        term_unnotify(t, asked);
        asked = term_notify(t, open("your browser didn't open (" + why + "), so "), false, Math.max(0, until - Date.now()));
      }
    });
    await done;
    const now = ChatGPT.kept(ChatGPT.own());
    login_after(t, "chatgpt", "Signed in to ChatGPT" + (now === null ? "" : " as " + login_chatgpt_name(now)) + ". illi keeps the login in " + config.config_home(ChatGPT.own()) + (config.LOGIN_SET === null ? "" : " (the file `login` names)") + " and renews it there.");
  } catch (err: any) {
    if (!stop.signal.aborted) {
      term_notify(t, "Login failed: " + err.message + ".", false, LOGIN_FAILED);
    }
  } finally {
    t.login = t.login === stop ? null : t.login;
    if (asked !== null) {
      term_unnotify(t, asked);
    }
  }
}

// an account used from now on: one kept apart put in the login file in
// place of the one there (kept apart in turn), or opencode's (null: illi's
// own let go for it, kept apart)
async function login_chatgpt_use(t: Term, s: Saved | null): Promise<void> {
  const why = await ChatGPT.swap(s === null ? null : s.entry);
  if (why !== null) {
    return term_note(t, "Can't switch accounts: " + why + ".");
  }
  const now = ChatGPT.kept(ChatGPT.file());
  login_after(t, "chatgpt", now === null ? "ChatGPT has no login to run on now." : "ChatGPT now runs on " + login_chatgpt_name(now) + ".");
}

// an account logged out (asked first, Esc back to `back`): one kept
// apart forgotten; the one in use (illi's own login, or the file `login`
// names: never) let go, the next taking its place (login_chatgpt_next)
function login_chatgpt_drop(t: Term, s: Saved, using: boolean, back: () => void): void {
  if (using && config.LOGIN_SET !== null) {
    return login_chatgpt_named(t);
  }
  const name = login_chatgpt_name(s);
  login_sure(t, "Log out of " + name + "?", "illi forgets its login", () => {
    if (using) {
      t.login?.abort();
      ChatGPT.logout();
    }
    const why = ChatGPT.forget(s.key);
    if (why !== null) {
      return term_note(t, "Can't change the accounts: " + why + ".");
    }
    return using ? void login_chatgpt_next(t, "Logged out of " + name + ".") : login_after(t, "chatgpt", "Logged out of " + name + ".");
  }, back);
}

// opencode's login left to opencode (asked first, Esc back to `back`):
// never used, opencode still signed in; the next account taking its
// place if it was in use
function login_chatgpt_leave(t: Term, back: () => void): void {
  login_sure(t, "Stop using opencode's login?", "opencode stays signed in; illi leaves it be", () => {
    const why = ChatGPT.allow(false);
    return why !== null ? term_note(t, "Can't change the accounts: " + why + ".") : void login_chatgpt_next(t, "illi no longer uses opencode's login.");
  }, back);
}

// what runs once the account in use went: opencode's, if illi may use it
// (ChatGPT.file), else the first kept apart, put in the login file; said
async function login_chatgpt_next(t: Term, said: string): Promise<void> {
  const next = ChatGPT.signed() ? null : ChatGPT.logins().saved[0] ?? null;
  const why  = next === null ? null : await ChatGPT.swap(next.entry);
  const now  = ChatGPT.kept(ChatGPT.file());
  login_after(t, "chatgpt", said + (why !== null ? " Can't switch accounts: " + why + "." : now === null ? "" : " ChatGPT now runs on " + login_chatgpt_name(now) + "."));
}

// ChatGPT logged out (asked first, Esc back to `back`): illi's own login
// and the accounts kept apart forgotten, opencode's left to opencode,
// ChatGPT no longer offered; a file `login` names is left
function login_chatgpt_out(t: Term, back: () => void): void {
  if (config.LOGIN_SET !== null) {
    return login_chatgpt_named(t);
  }
  const other = fs.existsSync(config.OPENCODE_LOGIN);
  login_sure(t, "Log out of ChatGPT?", "illi forgets its logins and stops offering ChatGPT" + (other ? "; opencode stays signed in" : ""), () => {
    t.login?.abort();
    ChatGPT.logout();
    const why = ChatGPT.edit(() => ({ opencode: false, saved: [] }));
    return why !== null ? term_note(t, "Can't change the accounts: " + why + ".") : login_after(t, "chatgpt", "Logged out of ChatGPT.");
  }, back);
}

// the login in use is the file `login` names, which illi never lets go
function login_chatgpt_named(t: Term): void {
  term_note(t, "illi uses the login in " + config.config_home(config.LOGIN_SET!) + " (the login setting): logging out leaves it. /set login default switches back at the next start.");
}
