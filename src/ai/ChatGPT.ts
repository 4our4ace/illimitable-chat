// ChatGPT
// =======
// The wire of chatgpt (Agent.ts): OpenAI.ts's Responses API on the Codex
// backend, paid by a ChatGPT plan. Its login (ChatGPT.file) is the file
// `login` names, else illi's own (config.OWN_LOGIN), or else opencode's
// (`opencode auth login`, ChatGPT Plus/Pro) unless /login left it to
// opencode; /login makes one with Codex's device login (a code the
// person enters at OpenAI's page; `device`), kept in the file `login`
// names, else as illi's own (ChatGPT.own). All are in opencode's shape.
// Several accounts: the one in use is the login file's, renewed there;
// the others wait in the accounts' file (Accounts.ts), their logins as
// they were when put apart. A switch (`swap`) puts one in the login file
// under the lock renewals take, keeping apart the one there as read
// under it. The backend
// takes no cache breakpoints; a prefix is cached for the session a
// request names (its header and prompt_cache_key): the hash of its model
// and system prompt, which all a chat's calls share. The token is renewed
// as it nears its end, or once the backend refuses it, under the lock
// opencode's other tools take on its file, and written back, so opencode
// stays signed in. A response with web search ends with no output items
// (the backend's quirk): they are taken as they streamed. Its usage is
// the plan's, never billed. What the account's plan is and how much of
// its rate limits (its 5-hour and weekly windows) is used are one record,
// kept for the account they are of (`told`, for the view): asked of the
// usage endpoint together (`usage`: at start, after /login and /logout,
// when the login changes on disk, as another terminal or opencode may
// change it: `sync`, `follow`), and kept current by each response's
// headers. A change of account drops the old record at once, so no view
// shows one account's plan with another's usage. The account's catalog
// (`models`: at start, after /login and /logout, on a change of account,
// by a turn that finds it not asked: `listed`) is the chatgpt list: each
// model shown offered, a new one too, one it drops gone; its window the
// most the account may set, its usual one (standard: what Codex uses
// unless set higher), its efforts and its speeds (each a service tier:
// priority is fast), kept in config.MODELS_FILE for the next start,
// naming the account. A model's window is only ever the catalog's: a
// call (a turn's, a subagent's) waits on it (`ready`), and one on a
// model it tells none never runs on a guess. A turn's first request
// refused as too long past a model's usual window makes that its whole
// one for the account.

import * as fs from "node:fs";
import { json_object } from "../tools/Clip.ts";
import * as path from "node:path";
import { dlopen } from "bun:ffi";
import type { Ask } from "./AskAI.ts";
import { Agent, type Wire } from "./Agent.ts";
import { OpenAI } from "./OpenAI.ts";
import { Pick, SPEEDS, type Model } from "./Pick.ts";
import type { Limit, Plan } from "../ui/View.ts";
import { Accounts, type Logins, type Saved } from "../config/Accounts.ts";
import * as config from "../config/Config.ts";

// Types
// =====

// a login: its tokens, when the access one ends (ms), its account
type Login = { access: string; refresh: string; expires: number; account: string };

// what a stream read (OpenAI.ts), and its output items as they ended
type State = { res: any; error: any; use: any; items: any[] };

// Constants
// =========

const URL    = "https://chatgpt.com/backend-api/codex/responses";
// the account's plan and its rate limits, as Codex's /status asks them
const USAGE  = "https://chatgpt.com/backend-api/wham/usage";
// how often the login file is looked at for a change of account (ms),
// and how long a catalog that didn't answer waits to be asked again
const FOLLOW = 5000;
const RELIST = 300e3;
// the models' list, as a Codex client this new asks it
const LIST   = "https://chatgpt.com/backend-api/codex/models?client_version=1.0.0";
// how long a call waits on the account's catalog being asked (ms); why a
// call on a model whose window the catalog hasn't told can't run (#: the
// model): its list not answered, or answered with no window for it
const LISTED = 3000;
const UNTOLD = "ChatGPT hasn't told #'s context window (its model list didn't answer), and illi never guesses one";
const NO_WINDOW = "ChatGPT's model list tells no context window for #, and illi never guesses one";

// the share of a window (%) a request may fill where the list leaves it
// out: Codex's own (effective_context_window_percent's default)
const USABLE = 95;
const AUTH   = "https://auth.openai.com";
const ISSUER = AUTH + "/oauth/token";

// how long a device login's code is good (ms)
const DEVICE = 15 * 60e3;

// the OAuth client the login was made for (Codex's, which opencode signs in as)
const CLIENT = "app_EMoamEEZ73f0CkXaXp7hrann";

// a token is renewed this long before it ends
const EARLY = 300e3;

// how long a renewal waits for another tool's lock
const LOCKED = 30e3;

const NO_LOGIN = "no ChatGPT login: type /login to sign in (or sign in with opencode: `opencode auth login`)";

// flock(2)'s operations
const EX = 2;
const NB = 4;
const UN = 8;

// the plan's windows, as a response's headers name them (x-codex-<window>-
// used-percent, -window-minutes, -reset-after-seconds, -reset-at): each a
// rate limit the plan may have (5 hours, a week; one told 0 minutes long
// is none: in 2026-10, a plan's primary was its week, its secondary none)
const WINDOWS = ["primary", "secondary"];

// the login in use, and its file as it was when read (sync); the token
// the backend refused; the renewal running; how many changes of account
// so far (an answer asked before one is dropped); the account's plan as
// last told (its key: the account it is of); what to call as it changes
// (Chat.change);
// whether a failed ask was logged; the login file followed
let held: Login | null = null;
let seen = "";
let spoiled = "";
let renewing: Promise<Login> | null = null;
let epoch = 0;
let record: { key: string; tier: string; limits: Limit[] } | null = null;
let watcher: () => void = () => {};
let logged = false;
let following: ReturnType<typeof setInterval> | undefined;
// the account whose catalog was last asked, and when; the ask running;
// the account whose catalog last answered
let asked = "";
let tried = 0;
let listing: Promise<string[] | null> | null = null;
let answered = "";

// ChatGPT
// =======

export namespace ChatGPT {

  // a token good for a request (the login as on disk now: sync); a login
  // made while it renewed wins over the renewal
  export async function token(): Promise<string> {
    ChatGPT.sync();
    if (held === null || !ChatGPT.good(held)) {
      const at = epoch;
      renewing ??= ChatGPT.renew().finally(() => (renewing = null));
      const got = await renewing;
      if (epoch !== at) {
        return ChatGPT.token();
      }
      held = got;
    }
    return held.access;
  }

  // the login file looked at (a stat; read again only once it changed:
  // its path, inode, size or times): the login in it held; a change of
  // account drops the old account's record and tells the watcher (true:
  // it changed). A rewrite for the same account (a renewal, illi's or
  // opencode's) keeps the record
  export function sync(): boolean {
    const file = ChatGPT.file();
    let now = "";
    try {
      const st = fs.statSync(file);
      now = [file, st.ino, st.size, st.mtimeMs, st.ctimeMs].join(" ");
    } catch {}
    if (now === seen) {
      return false;
    }
    seen = now;
    const was = ChatGPT.key();
    try {
      held = now === "" ? null : ChatGPT.login(ChatGPT.entry(file).entry);
    } catch {
      held = null;
    }
    if (ChatGPT.key() === was) {
      return false;
    }
    epoch += 1;
    record = null;
    watcher();
    return true;
  }

  // the login file followed while illi runs (each FOLLOW): an account
  // whose plan nothing told yet (a change of account, seen here or by a
  // request's token) asks it (usage), and one whose catalog wasn't asked
  // yet asks that (models), again each RELIST while it doesn't answer
  // (offline at the start)
  export function follow(): void {
    following ??= setInterval(() => {
      ChatGPT.sync();
      if (record === null && ChatGPT.key() !== "") {
        void ChatGPT.usage();
      }
      const key = ChatGPT.key();
      if (key !== "" && (asked !== key || (answered !== key && listing === null && Date.now() - tried > RELIST))) {
        void ChatGPT.models();
      }
    }, FOLLOW);
    following.unref?.();
  }

  // what to call as the plan or the account changes (one: the chat's)
  export function watch(fn: () => void): void {
    watcher = fn;
  }

  // the account a token is of ("": none known), and the one in use: its
  // account id, else its user
  export function key(token = held?.access ?? ""): string {
    if (token === "") {
      return "";
    }
    const claims = ChatGPT.claims(token);
    return ChatGPT.account_id(token) || claims.chatgpt_user_id || claims.sub || "";
  }

  // the account id a token's requests name: the login's, if it is the one
  // held, else its own claim
  export function account_id(token: string): string {
    return (token === held?.access ? held.account : "") || ChatGPT.claims(token).chatgpt_account_id || "";
  }

  // the account's plan and rate limits asked of the usage endpoint
  // together, while the account it asks for is still the one in use
  // (true: told). Asked, the account holds an untold record, so `follow`
  // doesn't ask again meanwhile. A failure leaves it untold (logged once),
  // and never spoils the token
  export async function usage(): Promise<boolean> {
    const at = epoch;
    if (ChatGPT.key() !== "" && record === null) {
      record = { key: ChatGPT.key(), tier: "", limits: [] };
    }
    try {
      const token = await ChatGPT.token();
      const res   = await fetch(USAGE, { headers: { authorization: "Bearer " + token, "chatgpt-account-id": ChatGPT.account_id(token), originator: "illi", "user-agent": "illi" }, signal: AbortSignal.timeout(15e3) });
      const told  = res.ok && (res.headers.get("content-type") ?? "").includes("json") ? ChatGPT.told_by(await res.json(), Date.now()) : null;
      if (told === null) {
        throw new Error("HTTP " + res.status);
      }
      if (epoch !== at || ChatGPT.key(token) !== ChatGPT.key()) {
        return false;
      }
      record = { key: ChatGPT.key(token), ...told };
      watcher();
      return true;
    } catch (err: any) {
      if (!logged) {
        logged = true;
        console.error("chatgpt: the plan's usage wasn't told: " + err?.message);
      }
      return false;
    }
  }

  // the usage endpoint's answer as a plan: its type, each window it tells
  // (its share used, its length, when it starts anew); null: no plan in it
  export function told_by(body: any, now: number): { tier: string; limits: Limit[] } | null {
    if (typeof body?.plan_type !== "string") {
      return null;
    }
    const limits = [body.rate_limit?.primary_window, body.rate_limit?.secondary_window].flatMap((w: any): Limit[] => {
      const used   = Number(w?.used_percent);
      const length = Number(w?.limit_window_seconds);
      const after  = Number(w?.reset_after_seconds);
      const at     = Number(w?.reset_at);
      const reset  = Number.isFinite(after) ? now + after * 1000 : Number.isFinite(at) ? at * 1000 : now;
      return Number.isFinite(used) && length > 0 ? [{ window: Math.round(length / 60), used, reset }] : [];
    });
    return { tier: body.plan_type, limits };
  }

  // the backend refused this token: the next request renews it
  export function spoil(token: string): void {
    spoiled = token;
  }

  export function good(login: Login): boolean {
    return login.access !== spoiled && login.expires > Date.now() + EARLY;
  }

  // the login on disk, renewed under its lock if it nears its end (another
  // tool may have renewed it meanwhile), and written back to the file it
  // was read from (looked up once: a /login meanwhile may change which),
  // unless the file changed while the renewal was asked (a /login there,
  // which takes no lock): the file's login wins
  export async function renew(): Promise<Login> {
    const file = ChatGPT.file();
    const disk = ChatGPT.login(ChatGPT.entry(file).entry);
    if (ChatGPT.good(disk)) {
      return disk;
    }
    return ChatGPT.locked(file, async () => {
      const { data, entry } = ChatGPT.entry(file);
      const now = ChatGPT.login(entry);
      if (ChatGPT.good(now)) {
        return now;
      }
      const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: now.refresh, client_id: CLIENT });
      const res = await ChatGPT.reach(ISSUER, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
      if (!res.ok) {
        throw new Error("ChatGPT login renewal failed (HTTP " + res.status + "): sign in again with /login");
      }
      const got: any = await res.json();
      const since = ChatGPT.entry(file).entry;
      return since.access === entry.access ? ChatGPT.keep(file, data, entry, got, now) : ChatGPT.login(since);
    });
  }

  // tokens got, kept in a login file (its other entries kept, an old
  // login's refresh token if none came)
  export function keep(file: string, data: any, entry: any, got: any, was: Login | null): Login {
    data.openai = { ...entry, ...ChatGPT.fresh(got, was) };
    ChatGPT.write(file, data);
    return ChatGPT.login(data.openai);
  }

  // tokens got, as a login's entry (opencode's shape), an old login's
  // refresh token if none came
  export function fresh(got: any, was: Login | null): Record<string, unknown> {
    return {
      type      : "oauth",
      access    : got.access_token,
      refresh   : got.refresh_token ?? was?.refresh,
      expires   : Date.now() + (got.expires_in ?? 3600) * 1000,
      accountId : ChatGPT.claims(got.id_token ?? "").chatgpt_account_id ?? was?.account,
    };
  }

  // a login file written whole: a file of its own, readable by its owner
  // alone, then moved over
  export function write(file: string, data: any): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(file), ".auth." + process.pid + ".json");
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  // the login file: the one config names, else illi's own if there, else
  // opencode's if there and /login didn't leave it to opencode, else
  // illi's own (none yet: config.config_login_file)
  export function file(): string {
    return config.config_login_file();
  }

  // the file /login keeps its login in: the one config names, else illi's own
  export function own(): string {
    return config.LOGIN_SET ?? config.OWN_LOGIN;
  }

  // why the login file is unreadable ("": it reads, or there is none)
  export function unread(): string {
    const file = ChatGPT.file();
    return fs.existsSync(file) && json_object(file) === null ? "The ChatGPT login file " + file + " is unreadable: /login replaces it." : "";
  }


  // whether a login is there to run on
  export function signed(): boolean {
    try {
      ChatGPT.entry();
      return true;
    } catch {
      return false;
    }
  }

  // a fetch whose failure to reach its host (no connection) says so
  // (Agent.unreached); a stop's is thrown as it is
  export async function reach(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (err: any) {
      if (init.signal?.aborted) {
        throw err;
      }
      console.error("chatgpt: " + url + ": " + err?.message);
      throw new Error(Agent.unreached(url));
    }
  }

  // Codex's device login: a code the person enters at OpenAI's page (url),
  // and the login it grants (done: polled for till then, at most DEVICE;
  // stop ends it), kept in ChatGPT.own
  export async function device(stop: AbortSignal): Promise<{ url: string; code: string; done: Promise<void> }> {
    const res = await ChatGPT.reach(AUTH + "/api/accounts/deviceauth/usercode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: CLIENT }), signal: stop });
    if (!res.ok) {
      throw new Error("ChatGPT's device login would not start (HTTP " + res.status + ")");
    }
    const got: any = await res.json();
    const code = String(got.user_code ?? got.usercode ?? "");
    const every = Math.max(1, Number(got.interval) || 5) * 1000;
    return { url: AUTH + "/codex/device", code, done: ChatGPT.granted(String(got.device_auth_id ?? ""), code, every, stop) };
  }

  // a device login's grant, asked for every `every` ms till the person
  // gives it (403 or 404: not yet; no connection or a server error: asked
  // again), changed for tokens (its PKCE pair came with it), put in
  // ChatGPT.own (swap: its other entries kept, one unreadable replaced;
  // another account there kept apart) and used from the next request on
  export async function granted(id: string, code: string, every: number, stop: AbortSignal): Promise<void> {
    const json = { "content-type": "application/json" };
    for (const until = Date.now() + DEVICE; Date.now() < until; ) {
      await Bun.sleep(every);
      if (stop.aborted) {
        throw new Error("the login was stopped");
      }
      const res = await ChatGPT.reach(AUTH + "/api/accounts/deviceauth/token", { method: "POST", headers: json, body: JSON.stringify({ device_auth_id: id, user_code: code }), signal: stop }).catch((err) => {
        if (stop.aborted) {
          throw err;
        }
        return null;
      });
      if (res === null || res.status === 403 || res.status === 404 || res.status === 429 || res.status >= 500) {
        continue;
      }
      if (!res.ok) {
        throw new Error("ChatGPT's device login failed (HTTP " + res.status + ")");
      }
      const grant: any = await res.json();
      const body = new URLSearchParams({ grant_type: "authorization_code", code: grant.authorization_code, redirect_uri: AUTH + "/deviceauth/callback", client_id: CLIENT, code_verifier: grant.code_verifier });
      const tokens = await ChatGPT.reach(ISSUER, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, signal: stop });
      if (!tokens.ok) {
        throw new Error("ChatGPT's device login got no tokens (HTTP " + tokens.status + ")");
      }
      const why = await ChatGPT.swap(ChatGPT.fresh(await tokens.json(), null));
      if (why !== null) {
        throw new Error(why);
      }
      return;
    }
    throw new Error("the code expired after 15 minutes: /login for another");
  }

  // illi's own login removed (opencode's, if there and /login didn't leave
  // it to opencode, is used again); false: there was none, or `login`
  // names the file in use (never removed here)
  export function logout(): boolean {
    if (config.LOGIN_SET !== null || !fs.existsSync(config.OWN_LOGIN)) {
      return false;
    }
    fs.rmSync(config.OWN_LOGIN);
    ChatGPT.sync();
    return true;
  }

  // a login's account as /login shows it: its key (ChatGPT.key), the
  // email and plan its token tells ("": none told)
  export function ident(access: string): { key: string; email: string; plan: string } {
    const all  = ChatGPT.claims(access);
    const text = (x: unknown) => (typeof x === "string" ? x : "");
    return { key: ChatGPT.key(access), email: text(all["https://api.openai.com/profile"]?.email), plan: text(all.chatgpt_plan_type) };
  }

  // the login in a file as an account (null: none there that reads)
  export function kept(file: string): Saved | null {
    try {
      const { entry } = ChatGPT.entry(file);
      const id = ChatGPT.ident(entry.access);
      return id.key === "" ? null : { ...id, entry };
    } catch {
      return null;
    }
  }

  // the accounts as last read (Accounts.ts): whether opencode's login is
  // one, those kept apart
  export function logins(): Logins {
    return config.config_accounts_read()?.chatgpt ?? { opencode: true, saved: [] };
  }

  // the accounts changed by f (Accounts.ts: read just before, the rest of
  // the file kept), then read again (config.config_accounts). null: done;
  // else why not
  export function edit(f: (logins: Logins) => Logins): string | null {
    const why = Accounts.edit(config.ROOT, (store) => ({ ...store, chatgpt: f(store.chatgpt ?? { opencode: true, saved: [] }) }));
    config.config_accounts(true);
    return why;
  }

  // an account kept apart forgotten
  export function forget(key: string): string | null {
    return ChatGPT.edit((logins) => ({ ...logins, saved: logins.saved.filter((s) => s.key !== key) }));
  }

  // opencode's login one of the accounts (used while illi has none of its
  // own), or left to opencode (never used, opencode still signed in)
  export function allow(on: boolean): string | null {
    const why = ChatGPT.edit((logins) => ({ ...logins, opencode: on }));
    ChatGPT.sync();
    return why;
  }

  // a login put in illi's own file (ChatGPT.own) in place of the one there
  // (null: that one let go, so opencode's is used if it may be), under the
  // lock its renewals take: the one it replaces kept apart (read under the
  // lock, as each renewal spends its refresh token: a copy from before
  // wouldn't renew), the one put there kept apart no longer. A switch
  // (switching: an account /login listed) takes the one put there by its
  // key from the accounts read under the lock, for the same reason, and
  // writes nothing if the file holds it already (another terminal put it
  // there, maybe renewed since). A file `login` names is never let go.
  // null: done; else why not
  export async function swap(entry: Record<string, unknown> | null, switching = false): Promise<string | null> {
    const file = ChatGPT.own();
    if (entry === null && config.LOGIN_SET !== null) {
      return "illi uses the login in " + config.config_home(file) + " (the login setting), which it leaves be";
    }
    const key = entry === null ? "" : ChatGPT.key(String(entry.access));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const why = await ChatGPT.locked(file, async () => {
      const was = ChatGPT.kept(file);
      if (switching && was !== null && was.key === key) {
        return null;
      }
      const put = switching && entry !== null ? Accounts.read(config.ROOT)?.chatgpt?.saved.find((s) => s.key === key)?.entry : entry;
      if (put === undefined) {
        return "that account was logged out in another terminal meanwhile";
      }
      const set = was === null || was.key === key ? null : ChatGPT.edit((logins) => ({ ...logins, saved: [...logins.saved.filter((s) => s.key !== was.key), was] }));
      if (set !== null) {
        return set;
      }
      if (put === null) {
        fs.rmSync(file, { force: true });
      } else {
        ChatGPT.write(file, { ...(json_object(file) ?? {}), openai: put });
      }
      return null;
    });
    const done = why ?? (key === "" ? null : ChatGPT.forget(key));
    ChatGPT.sync();
    return done;
  }

  // the login file, and its entry for OpenAI; one unreadable says so
  export function entry(file = ChatGPT.file()): { data: any; entry: any } {
    if (!fs.existsSync(file)) {
      throw new Error(NO_LOGIN);
    }
    const data = json_object(file);
    if (data === null) {
      throw new Error("the ChatGPT login file " + file + " is unreadable: /login replaces it");
    }
    const entry = data.openai;
    if (entry?.type !== "oauth" || !entry.access || !entry.refresh) {
      throw new Error(NO_LOGIN);
    }
    return { data, entry };
  }

  export function login(entry: any): Login {
    const account = entry.accountId ?? ChatGPT.claims(entry.access).chatgpt_account_id ?? "";
    return { access: entry.access, refresh: entry.refresh, expires: entry.expires ?? 0, account };
  }

  // a JWT's claims, OpenAI's own under theirs
  export function claims(jwt: string): any {
    try {
      const all = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
      return { ...all, ...all["https://api.openai.com/auth"] };
    } catch {
      return {};
    }
  }

  // fn, holding the lock opencode's other tools take on the login file
  // (flock on <file>.lock); with no flock here, without it
  export async function locked<T>(file: string, fn: () => Promise<T>): Promise<T> {
    const flock = ChatGPT.flock();
    const lock = file + ".lock";
    const fd = fs.openSync(lock, "w");
    try {
      const until = Date.now() + LOCKED;
      while (flock !== null && flock(fd, EX | NB) !== 0) {
        if (Date.now() > until) {
          throw new Error("the ChatGPT login is locked by another program: " + lock);
        }
        await Bun.sleep(50);
      }
      return await fn();
    } finally {
      flock?.(fd, UN);
      fs.closeSync(fd);
    }
  }

  export function flock(): ((fd: number, op: number) => number) | null {
    try {
      const libc = process.platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6";
      const lib = dlopen(libc, { flock: { args: ["i32", "i32"], returns: "i32" } });
      return (fd, op) => lib.symbols.flock(fd, op) as number;
    } catch {
      return null;
    }
  }

  // the session a call's requests name, which all a chat's share
  export function session(ask: Ask): string {
    return Bun.hash(ask.model + "\n" + ask.system).toString(16);
  }

  // the account's catalog asked (one ask at a time): the models it shows
  // (not hidden), best first, are the chatgpt list now, a model it drops
  // gone; offered (new ones too, unless `models` names those offered),
  // the watcher told, and kept for the next start, naming the account.
  // The labels new to illi; null: not told (no login, offline, the
  // account changed meanwhile: the list as it was stays)
  export function models(): Promise<string[] | null> {
    [asked, tried] = [ChatGPT.key(), Date.now()];
    listing ??= ChatGPT.catalog().finally(() => (listing = null));
    return listing;
  }

  export async function catalog(): Promise<string[] | null> {
    try {
      const token = await ChatGPT.token();
      const at    = epoch;
      const init  = { headers: { authorization: "Bearer " + token, "chatgpt-account-id": ChatGPT.account_id(token), originator: "illi" }, signal: AbortSignal.timeout(15e3) };
      const res   = await fetch(LIST, init);
      const list: any[] = res.ok ? ((await res.json()) as any).models ?? [] : [];
      const shown = list.filter((m) => m?.visibility === "list" && typeof m.slug === "string").sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
      const kept  = shown.map(ChatGPT.model);
      const key   = ChatGPT.key(token);
      if (epoch !== at || key !== ChatGPT.key()) {
        asked = "";
        return null;
      }
      if (kept.length === 0) {
        return null;
      }
      const file   = config.config_models_file();
      const capped = file.account === key && Array.isArray(file.capped) ? file.capped.filter((label) => kept.some((m) => m.label === label)) : [];
      for (const m of kept.filter((m) => capped.includes(m.label) && m.standard !== undefined)) {
        [m.window, m.standard] = [m.standard, undefined];
      }
      const fresh = Pick.learn("chatgpt", kept, "replace");
      if (!config.MODELS_SET) {
        config.OFFER.models.push(...fresh.filter((label) => !config.OFFER.models.includes(label)));
      }
      config.config_models_keep("chatgpt", kept, { account: key, capped });
      answered = key;
      watcher();
      return fresh;
    } catch {
      return null;
    }
  }

  // a catalog's model as illi keeps it: its window the most the account
  // may set (max_context_window, else context_window), the usual one
  // (standard) when below it; its efforts (supported_reasoning_levels, in
  // order); its speeds, standard and each service tier it offers
  // (priority: fast, ultrafast), each one's tier id kept to send; the
  // share of the window a request may fill (effective_context_window_percent,
  // else USABLE)
  export function model(m: any): Model {
    const usual  = Number(m.context_window) || 0;
    const usable = Number(m.effective_context_window_percent) || 0;
    const window = Number(m.max_context_window) || usual || undefined;
    const levels = Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels : [];
    const named  = levels.map((l: any) => (typeof l === "string" ? l : l?.effort)).filter((e: unknown): e is string => typeof e === "string" && e !== "");
    const ids    = (Array.isArray(m.service_tiers) ? m.service_tiers : []).map((t: any) => String(typeof t === "string" ? t : t?.id ?? ""));
    const tiers  = Object.fromEntries(ids.flatMap((id: string) => (id === "priority" ? [["fast", id]] : id === "ultrafast" ? [["ultrafast", id]] : [])));
    const speeds = SPEEDS.filter((sp) => sp === "slow" || sp in tiers);
    return {
      label    : m.slug,
      id       : m.slug,
      speeds,
      window,
      standard : window !== undefined && usual > 0 && usual < window ? usual : undefined,
      efforts  : named.length === 0 ? undefined : [...new Set<string>(named)],
      tiers    : Object.keys(tiers).length === 0 ? undefined : tiers,
      room     : (usable > 0 && usable <= 100 ? usable : USABLE) / 100,
    };
  }

  // the account's catalog, waited on at most `ms` (a turn's first cut
  // waits on it: the windows kept last may be smaller, and a cut never
  // moves back); asked now if the account in use wasn't yet (a turn
  // resumed at the start comes before the terminal asks it)
  export async function listed(ms: number): Promise<void> {
    ChatGPT.sync();
    if (asked !== ChatGPT.key() && ChatGPT.key() !== "") {
      void ChatGPT.models();
    }
    if (listing !== null) {
      await Promise.race([listing, Bun.sleep(ms)]);
    }
  }

  // a call on model `label` made ready (a turn's, a subagent's): the
  // account's catalog waited on, LISTED at most (the windows kept last
  // may be smaller, and a cut never moves back), then asked again while
  // it tells the model no window (a stop, halt, waits no more). Why the
  // call can't run: its window still not told, which illi never guesses;
  // null: it can
  export async function ready(label: string, halt?: AbortSignal): Promise<string | null> {
    const told = () => Pick.model("chatgpt", label)?.window !== undefined;
    await ChatGPT.listed(LISTED);
    if (!told() && halt?.aborted !== true) {
      const stopped = new Promise<void>((done) => halt?.addEventListener("abort", () => done(), { once: true }));
      await Promise.race([ChatGPT.models(), stopped]);
    }
    return told() ? null : (ChatGPT.catalogued() ? NO_WINDOW : UNTOLD).replace("#", label);
  }

  // whether the catalog of the account in use answered this run, so the
  // windows known are its own, not those kept last (a cut fitted to
  // smaller ones would fold the chat for good)
  export function catalogued(): boolean {
    return answered !== "" && answered === ChatGPT.key();
  }

  // a model this account refused as too long past its standard window:
  // that window is its whole one from now on, kept for this account
  export function refused(label: string): boolean {
    const model = Pick.model("chatgpt", label);
    const key   = ChatGPT.key();
    if (model?.standard === undefined || key === "") {
      return false;
    }
    [model.window, model.standard] = [model.standard, undefined];
    const file   = config.config_models_file();
    const capped = file.account === key && Array.isArray(file.capped) ? file.capped : [];
    config.config_models_keep("chatgpt", Pick.list("chatgpt"), { account: key, capped: [...new Set([...capped, label])] });
    watcher();
    return true;
  }

  export function headers(token: string, ask: Ask): Record<string, string> {
    const claims = ChatGPT.claims(token);
    const out: Record<string, string> = {
      authorization        : "Bearer " + token,
      "chatgpt-account-id" : ChatGPT.account_id(token),
      originator           : "illi",
      "user-agent"         : "illi",
      session_id           : ChatGPT.session(ask),
      "content-type"       : "application/json",
      accept               : "text/event-stream",
    };
    const residency = claims.chatgpt_compute_residency;
    if (residency && residency !== "no_constraint") {
      out["x-openai-internal-codex-residency"] = residency;
    }
    return out;
  }

  // OpenAI.ts's body, keyed by its session, its cache mode and search cap
  // dropped (the backend refuses them, and cache marks: Wire.marks, none),
  // a speed past the standard one sent as the catalog's tier for it
  export function body(...args: Parameters<typeof OpenAI.body>): unknown {
    const body: any = OpenAI.body(...args);
    const tier = args[0].speed === "slow" ? undefined : Pick.by_id("chatgpt", args[0].model)?.tiers?.[args[0].speed];
    return { ...body, service_tier: tier ?? body.service_tier, prompt_cache_options: undefined, max_tool_calls: undefined, prompt_cache_key: ChatGPT.session(args[0]) };
  }

  // the plan's limits a response's headers tell: each window's share
  // used, its length, when it starts anew; one that tells none keeps
  // those known. Only a response to the account in use (its token's) is
  // heard: one from an account since left changes nothing
  export function hear(headers: Headers, token: string): void {
    const key = ChatGPT.key(token);
    if (key === "" || key !== ChatGPT.key()) {
      return;
    }
    const now  = Date.now();
    const told = WINDOWS.flatMap((w): Limit[] => {
      const num    = (name: string) => Number(headers.get("x-codex-" + w + "-" + name) ?? NaN);
      const used   = num("used-percent");
      const window = num("window-minutes");
      const after  = num("reset-after-seconds");
      const at     = num("reset-at");
      const reset  = Number.isFinite(after) ? now + after * 1000 : Number.isFinite(at) ? at * 1000 : now;
      return Number.isFinite(used) && window > 0 ? [{ window, used, reset }] : [];
    });
    if (told.length > 0) {
      record = { key, tier: record?.key === key ? record.tier : "", limits: told };
      watcher();
    }
  }

  // a plan's limit used up (the backend's usage_limit_reached): which
  // window (the fullest the headers told), and when it starts anew, as the
  // error tells (resets_at, resets_in_seconds), else as that window does
  export function spent(err: any): string {
    const now  = Date.now();
    const full = [...(ChatGPT.told()?.limits ?? [])].sort((a, b) => b.used - a.used || b.reset - a.reset)[0];
    const at   = Number(err?.resets_at) > 0 ? Number(err.resets_at) * 1000 : Number(err?.resets_in_seconds) > 0 ? now + Number(err.resets_in_seconds) * 1000 : full?.reset ?? 0;
    const name = full === undefined ? "usage" : ChatGPT.window(full.window);
    return "your ChatGPT plan's " + name + " limit is used up" + (at > now ? "; it resets at " + Agent.when(at) : "");
  }

  // a window, by its minutes, as a limit's name: 5-hour, weekly, 2-day
  export function window(minutes: number): string {
    if (minutes === 10080) {
      return "weekly";
    }
    if (minutes % 1440 === 0) {
      return minutes / 1440 + "-day";
    }
    return minutes % 60 === 0 ? minutes / 60 + "-hour" : minutes + "-minute";
  }

  // the plan the login in use is on, as its token says: plus, pro… ("":
  // none in use, or not told)
  export function tier(): string {
    const type = held === null ? "" : ChatGPT.claims(held.access).chatgpt_plan_type;
    return typeof type === "string" ? type : "";
  }

  // the plan of the account in use as the views show it: its record's
  // (the usage endpoint's type over the token's), else the token's alone
  // with no limits (never another account's); null: no account in use
  export function told(): Plan | null {
    const key = ChatGPT.key();
    if (key === "") {
      return null;
    }
    const own = record?.key === key ? record : null;
    return { brand: "ChatGPT", tier: own?.tier || ChatGPT.tier(), limits: own?.limits ?? [] };
  }

  // one stream event (OpenAI.read); the last, if its response lists no
  // output, gets the items that streamed
  export function read(st: State, ev: any, on: Parameters<typeof OpenAI.read>[2]): boolean {
    if (ev.type === "response.output_item.done") {
      st.items[ev.output_index ?? st.items.length] = ev.item;
    }
    const last = OpenAI.read(st, ev, on);
    if (last && st.res !== null && (st.res.output ?? []).length === 0) {
      st.res = { ...st.res, output: st.items.filter((item) => item !== undefined) };
    }
    return last;
  }

  export const wire: Wire<State> = {
    key     : "chatgpt",
    idle    : 1200e3,
    url     : URL,
    auth    : { token: () => ChatGPT.token(), spoil: (token) => ChatGPT.spoil(token) },
    heard   : (res, token) => ChatGPT.hear(res.headers, token),
    headers : (token, ask) => ChatGPT.headers(token, ask),
    body    : (...args) => ChatGPT.body(...args),
    marks   : () => 0,
    start   : (ask) => ({ res: null, error: null, use: { input: 0, write: 0, read: 0, speed: ask.speed }, items: [] }),
    read    : (st, ev, on) => ChatGPT.read(st, ev, on),
    begun   : (ev) => ev.type === "response.output_item.added",
    step    : (st, ask) => OpenAI.step(st, ask),
    usage   : (st) => st.use,
  };

}
