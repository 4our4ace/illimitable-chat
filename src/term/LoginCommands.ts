// Login commands
// ==============
// /login: the providers illi runs on and their accounts, where all of
// connecting is done, nothing typed into a file. Its first picker, the
// makers (ChatGPT, Claude...: each provider's facts name its maker),
// each saying what of it is connected, the one the chat runs on marked;
// Enter on one, its ways in: its plan first (ChatGPT's, Claude's through
// Claude Code, Google's through Google's Antigravity agent), then its API
// key, if it has one, each saying what it's connected with;
// Esc goes a level up, from these and from all they open (a question
// asked too). Enter on a way in not connected connects it: a plan by its
// own page (Logins.ts: each provider's folder's Login.ts, its sign-in and
// its accounts); an API by a key pasted in a line shown as dots, or the
// environment's (ANTHROPIC_API_KEY, OPENAI_API_KEY: its facts' key) if
// it's set, each checked with the provider before it's taken (Accounts.ts
// keeps a pasted one, in illi's root: every profile's; never the
// environment's). Esc stops a sign-in waiting (term_esc: t.login). On one
// connected: its accounts, the one in use marked: Enter uses one, Del
// logs one out (asked first), a row connects one more, the last logs out
// of it (asked first). What's connected is offered at once, and what's
// let go is gone, here and in every illi open (config.config_accounts,
// Chat.follow), unless the vendors setting names the providers, which
// /login then says. /logout opens the same pickers. A key is never shown
// whole, nor kept anywhere but the accounts' file: not in the input's
// history, the chat or a note.

import { Accounts, ENV, type Keyed, type Store } from "../config/Accounts.ts";
import type { Vendor } from "../ai/AskAI.ts";
import { Chat } from "../chat/Chat.ts";
import { term_account, term_ask, term_chooser, term_question } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { Logins } from "../providers/Logins.ts";
import { term_note, term_notify, term_unnotify } from "./Notices.ts";
import { Pick } from "../ai/Pick.ts";
import type { Facts } from "../providers/Provider.ts";
import { Providers } from "../providers/Providers.ts";
import { FACTS, Vendors } from "../providers/Vendors.ts";
import { term_hint, term_unhint, type Term } from "./Term.ts";

// Types
// =====

// an account of a provider, as its picker shows it: its name, what it is,
// whether it's in use; what Enter and Del do on it (Del asks first, Esc
// there going back to `back`)
export type Account = { name: string; about: string; use: boolean; take: () => void; drop: (back: () => void) => void };

// a provider's page (a way in: a plan, an API key): its name, its vendor,
// what its row says; its accounts (none: not connected); what connects
// one more (its row's name, "": none yet), and what logs out of it all,
// each given where Esc on what it asks goes back to. A plan's is its
// folder's Login.ts (Logins.ts lists them); an API key's, login_api
export type Page = { name: string; vendor: Vendor; about: () => string; accounts: () => Account[]; adds: string; add: (back: () => void) => void; out: (back: () => void) => void };

// a maker's providers, as /login's first picker shows them: its name,
// what its row says while none is connected, its providers' pages (its
// plan, its API)
type Maker = { name: string; offers: string; providers: Page[] };

// an API's vendor: its facts, whose key (Provider.ts ApiKey) names its
// key in config.KEYS, its variable and where a key is made; how one is
// checked (Provider.ts check)
type Api = { facts: Facts & { key: NonNullable<Facts["key"]> }; check: (key: string) => Promise<string> };

// Constants
// =========

// how long a sign-in's code shows: as long as ChatGPT's is good (ms), or
// till the login ends (a Claude or Google sign-in's notes too: each ends
// sooner, at ClaudeCode.ts or Antigravity.ts SIGNIN); how long a failure
// shows, till Esc or a message
export const LOGIN        = 15 * 60000;
export const LOGIN_FAILED = 60000;

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

// the makers, in the picker's order (their facts' maker.order), each its
// plan first (its page: Logins.ts), then its API; a provider with neither
// a key nor a page isn't listed
function login_all(t: Term): Maker[] {
  const makers = [...FACTS].sort((a, b) => a.maker.order - b.maker.order).map((f) => f.maker.name).filter((name, k, all) => all.indexOf(name) === k);
  return makers.map((name) => {
    const its   = FACTS.filter((f) => f.maker.name === name).sort((a, b) => Number(a.key !== undefined) - Number(b.key !== undefined));
    const pages = its.flatMap((f): Page[] => {
      const check = Providers.of(f.id)?.check;
      const page  = f.key !== undefined && check !== undefined ? login_api(t, { facts: f as Api["facts"], check }) : Logins.of(f.id)?.(t);
      return page === undefined ? [] : [page];
    });
    return { name, offers: its[0].maker.offers, providers: pages };
  }).filter((m) => m.providers.length > 0);
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
function login_provider(t: Term, p: Page, back: () => void): void {
  return p.accounts().length === 0 ? p.add(back) : login_accounts(t, p, back);
}

// a provider's accounts' picker, the one in use marked: Enter uses one,
// Del logs one out; then the row that connects one more (if it can) and
// the one that logs out of it all; Esc goes back to `back`, and from
// what these ask, back here
function login_accounts(t: Term, p: Page, back: () => void): void {
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
// vendor went), the start's login note let go once no login is missing
// (term_hint), each account's catalog asked; said, with what the vendors
// setting leaves out (a vendor connected: its login kept outside the
// accounts' file there, else its entry in the file)
export function login_after(t: Term, vendor: Vendor, said: string): void {
  config.config_accounts(true);
  if (t.chat !== null) {
    Chat.offered(t.chat);
  }
  if (term_hint() === "") {
    term_unhint(t);
  }
  term_account(t);
  const outside = Vendors.of(vendor)?.outside;
  const there   = outside !== undefined ? outside() : Object.keys(config.config_accounts_read() ?? {}).includes(vendor);
  const left    = config.config_named() && there && !config.OFFER.vendors.includes(vendor);
  const env  = config.config_env_set("vendors");
  const fix  = env === null ? "Your vendors setting leaves " + Pick.provider(vendor) + " out, though: /set vendors default lets /login decide." : env + " leaves " + Pick.provider(vendor) + " out, though: start illi without it to let /login decide.";
  term_note(t, said + (left ? " " + fix : ""));
}

// a change to the accounts' file, said if it fails (true: done); f gives
// null where what it changes is gone from the file as read just before
// (another terminal's change while this one's list was open: nothing
// written, the list to be opened again)
export function login_edit(t: Term, f: (store: Store) => Store | null): boolean {
  let gone = false;
  const why = Accounts.edit(config.ROOT, (store) => f(store) ?? ((gone = true), store));
  if (why !== null) {
    term_note(t, "Can't change the accounts: " + why + ".");
  } else if (gone) {
    config.config_accounts(true);
    term_note(t, "That changed in another terminal meanwhile: /login shows the accounts as they are now.");
  }
  return why === null && !gone;
}

// a question that asks before a log out (Enter on its second answer;
// Esc goes back to `back`)
export function login_sure(t: Term, title: string, about: string, done: () => void, back: () => void): void {
  term_question(t, title, ["Keep it", "Log out"], ["", about], (k) => (k === 1 ? done() : undefined), { back });
}

// APIs
// ====

// an API's vendor as a provider: its keys, the environment's first (only
// once it's connected: a key set for other programs isn't taken unasked)
function login_api(t: Term, api: Api): Page {
  const env   = () => config.config_env_key(api.facts.key.name);
  const kept  = () => Accounts.keys_in(config.config_accounts_read(), api.facts.id);
  const named = config.VARS[api.facts.key.name];
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
    const key = config.KEYS[api.facts.key.name];
    return now !== undefined ? (key !== "" ? "connected: " + Accounts.mask(key) : "connected, but " + named + " isn't set here") : env() !== "" ? named + " is set: Enter connects it" : "a key from " + api.facts.key.where;
  };
  const add = (back: () => void) => (kept() === undefined && env() !== "" ? login_api_env(t, api, back) : login_api_ask(t, api, back));
  return { name: api.facts.row, vendor: api.facts.id as Vendor, about, accounts, adds: "+ add another key", add, out: (back) => login_api_out(t, api, back) };
}

// an API not connected whose variable is set: that key, or another (Esc
// back to `back`)
function login_api_env(t: Term, api: Api, back: () => void): void {
  const named = config.VARS[api.facts.key.name];
  const key   = config.config_env_key(api.facts.key.name);
  term_question(t, "Connect " + api.facts.row, ["Use " + named, "Paste another key"], [Accounts.mask(key), "kept in illi's accounts"], (k) => (k === 0 ? void login_api_take(t, api, key, ENV) : login_api_ask(t, api, back)), { back });
}

// a key asked for, shown as dots, then checked and kept (Esc back to
// `back`)
function login_api_ask(t: Term, api: Api, back: () => void): void {
  term_ask(t, api.facts.row, "paste it here: a key from " + api.facts.key.where, "", "Enter connect · Esc back", (text) => {
    const key = text.trim();
    if (key === "") {
      return "Paste the key first.";
    }
    if (!Accounts.plain(key)) {
      return "A key has no spaces or special characters in it: paste it alone, as the provider shows it.";
    }
    void login_api_take(t, api, key, null);
    return null;
  }, true, back);
}

// a key checked with its provider, then taken: the environment's (ENV) in
// use, or a pasted one kept and in use; refused, said (one that can't be
// a key, Accounts.plain, never sent)
async function login_api_take(t: Term, api: Api, key: string, id: string | null): Promise<void> {
  if (!Accounts.plain(key)) {
    return term_note(t, "The key wasn't connected: it has a space or a character no key has.");
  }
  const checking = term_notify(t, "Checking the key with " + api.facts.row.replace(/ API key$/, "") + "…", false, 30000);
  const why = await api.check(key);
  term_unnotify(t, checking);
  if (why !== "") {
    return term_note(t, "The key wasn't connected: " + why + ".");
  }
  const added = new Date().toISOString();
  const vendor = api.facts.id as Vendor;
  const done = login_edit(t, (store) => {
    const was: Keyed = Accounts.keys_in(store, vendor) ?? { use: ENV, keys: [] };
    const same = was.keys.find((k) => k.key === key);
    const use  = id ?? same?.id ?? Accounts.id(was.keys);
    const keys = id !== null || same !== undefined ? was.keys : [...was.keys, { id: use, key, added }];
    return Accounts.put(store, vendor, { use, keys });
  });
  if (done) {
    login_after(t, vendor, "Connected " + api.facts.row.replace(/ key$/, "") + " (" + Accounts.mask(key) + "): its models are in /model.");
  }
}

// a key of a connected API used from now on (shown: as its row shows it)
function login_api_use(t: Term, api: Api, id: string, shown: string): void {
  const vendor = api.facts.id as Vendor;
  const there  = (was: Keyed | undefined) => was !== undefined && (id === ENV ? config.config_env_key(api.facts.key.name) !== "" : was.keys.some((k) => k.id === id));
  if (login_edit(t, (store) => { const was = Accounts.keys_in(store, vendor); return there(was) ? Accounts.put(store, vendor, { ...was!, use: id }) : null; })) {
    login_after(t, vendor, api.facts.row.replace(/ key$/, "") + " now runs on " + shown + ".");
  }
}

// a key logged out (asked first, Esc back to `back`): a pasted one
// forgotten (the last one left, or the last pasted one in use, the
// provider let go: the environment's is never taken in its place
// unasked); the environment's can't be, as illi keeps no copy of it,
// unless it's the last, which lets the provider go
function login_api_drop(t: Term, api: Api, id: string, back: () => void): void {
  const vendor = api.facts.id as Vendor;
  const now = Accounts.keys_in(config.config_accounts_read(), vendor);
  if (now === undefined) {
    return;
  }
  const rest = now.keys.filter((k) => k.id !== id);
  if (id === ENV) {
    return rest.length > 0 ? term_note(t, config.VARS[api.facts.key.name] + " is your environment's, so illi keeps no copy of it to forget: Enter on another key uses that one.") : login_api_out(t, api, back);
  }
  if (rest.length === 0 && (now.use === id || config.config_env_key(api.facts.key.name) === "")) {
    return login_api_out(t, api, back);
  }
  const key = now.keys.find((k) => k.id === id)?.key ?? "";
  login_sure(t, "Log out of " + Accounts.mask(key) + "?", "illi forgets the key", () => {
    const done = login_edit(t, (store) => {
      const was = Accounts.keys_in(store, vendor);
      const keys = was?.keys.filter((k) => k.id !== id) ?? [];
      return was === undefined ? store : Accounts.put(store, vendor, { use: was.use === id ? keys.at(-1)?.id ?? ENV : was.use, keys });
    });
    if (done) {
      login_after(t, vendor, "Logged out of " + Accounts.mask(key) + ".");
    }
  }, back);
}

// an API let go (asked first, Esc back to `back`): its pasted keys
// forgotten, its vendor no longer offered
function login_api_out(t: Term, api: Api, back: () => void): void {
  const name   = api.facts.row.replace(/ key$/, "");
  const vendor = api.facts.id as Vendor;
  login_sure(t, "Log out of " + name + "?", "illi forgets its keys and stops offering its models", () => {
    if (login_edit(t, (store) => Accounts.put(store, vendor, undefined))) {
      login_after(t, vendor, "Logged out of " + name + ".");
    }
  }, back);
}
