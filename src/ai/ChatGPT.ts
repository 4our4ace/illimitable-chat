// ChatGPT
// =======
// The wire of chatgpt (Agent.ts): OpenAI.ts's Responses API on the Codex
// backend, paid by a ChatGPT plan. Its login (ChatGPT.file) is Illi's own
// (config.OWN_LOGIN), made by /login with Codex's device login (a code
// the person enters at OpenAI's page; `device`), or else opencode's
// (`opencode auth login`, ChatGPT Plus/Pro); both are in opencode's shape.
// The backend
// takes no cache breakpoints; a prefix is cached for the session a
// request names (its header and prompt_cache_key): the hash of its model
// and system prompt, which all a chat's calls share. The token is renewed
// as it nears its end, or once the backend refuses it, under the lock
// opencode's other tools take on its file, and written back, so opencode
// stays signed in. A response with web search ends with no output items
// (the backend's quirk): they are taken as they streamed. Its usage is
// the plan's, never billed; each response's headers tell how much of the
// plan's rate limits (its 5-hour and weekly windows) is used (`limits`,
// for the view). The backend lists its models (`models`): each one shown
// is offered, a new one too, its context window known (Pick.ts), kept in
// config.MODELS_FILE for the next start.

import * as fs from "node:fs";
import * as path from "node:path";
import { dlopen } from "bun:ffi";
import type { Ask } from "./AskAI.ts";
import { type Wire } from "./Agent.ts";
import { OpenAI } from "./OpenAI.ts";
import { Pick } from "./Pick.ts";
import { Price } from "./Price.ts";
import type { Limit } from "../ui/View.ts";
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
// the models' list, as a Codex client this new asks it
const LIST   = "https://chatgpt.com/backend-api/codex/models?client_version=1.0.0";
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

// the login in use; the token the backend refused; the renewal running;
// the plan's limits, as the last response that told them did
let held: Login | null = null;
let spoiled = "";
let renewing: Promise<Login> | null = null;
let plan: Limit[] = [];

// ChatGPT
// =======

export namespace ChatGPT {

  // a token good for a request
  export async function token(): Promise<string> {
    if (held === null || !ChatGPT.good(held)) {
      renewing ??= ChatGPT.renew().finally(() => (renewing = null));
      held = await renewing;
    }
    return held.access;
  }

  // the backend refused this token: the next request renews it
  export function spoil(token: string): void {
    spoiled = token;
  }

  export function good(login: Login): boolean {
    return login.access !== spoiled && login.expires > Date.now() + EARLY;
  }

  // the login on disk, renewed under its lock if it nears its end (another
  // tool may have renewed it meanwhile), and written back
  export async function renew(): Promise<Login> {
    const disk = ChatGPT.login(ChatGPT.entry().entry);
    if (ChatGPT.good(disk)) {
      return disk;
    }
    return ChatGPT.locked(async () => {
      const { data, entry } = ChatGPT.entry();
      const now = ChatGPT.login(entry);
      if (ChatGPT.good(now)) {
        return now;
      }
      const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: now.refresh, client_id: CLIENT });
      const res = await fetch(ISSUER, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
      if (!res.ok) {
        throw new Error("ChatGPT login renewal failed (HTTP " + res.status + "): sign in again with /login");
      }
      const got: any = await res.json();
      return ChatGPT.keep(ChatGPT.file(), data, entry, got, now);
    });
  }

  // tokens got, kept in a login file (its other entries kept, an old
  // login's refresh token if none came): written whole, then moved over
  export function keep(file: string, data: any, entry: any, got: any, was: Login | null): Login {
    data.openai = {
      ...entry,
      type      : "oauth",
      access    : got.access_token,
      refresh   : got.refresh_token ?? was?.refresh,
      expires   : Date.now() + (got.expires_in ?? 3600) * 1000,
      accountId : ChatGPT.claims(got.id_token ?? "").chatgpt_account_id ?? was?.account,
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(file), ".auth." + process.pid + ".json");
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
    return ChatGPT.login(data.openai);
  }

  // the login file: the one config names, else Illi's own if there, else
  // opencode's if there, else Illi's own (none yet)
  export function file(): string {
    return config.LOGIN_SET ?? (fs.existsSync(config.OWN_LOGIN) || !fs.existsSync(config.OPENCODE_LOGIN) ? config.OWN_LOGIN : config.OPENCODE_LOGIN);
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

  // Codex's device login: a code the person enters at OpenAI's page (url),
  // and the login it grants (done: polled for till then, at most DEVICE;
  // stop ends it), kept as Illi's own
  export async function device(stop: AbortSignal): Promise<{ url: string; code: string; done: Promise<void> }> {
    const res = await fetch(AUTH + "/api/accounts/deviceauth/usercode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: CLIENT }), signal: stop });
    if (!res.ok) {
      throw new Error("ChatGPT's device login would not start (HTTP " + res.status + ")");
    }
    const got: any = await res.json();
    const code = String(got.user_code ?? got.usercode ?? "");
    const every = Math.max(1, Number(got.interval) || 5) * 1000;
    return { url: AUTH + "/codex/device", code, done: ChatGPT.granted(String(got.device_auth_id ?? ""), code, every, stop) };
  }

  // a device login's grant, asked for every `every` ms till the person
  // gives it (403 or 404: not yet), changed for tokens (its PKCE pair came
  // with it), kept as Illi's own login and used from the next request on
  export async function granted(id: string, code: string, every: number, stop: AbortSignal): Promise<void> {
    const json = { "content-type": "application/json" };
    for (const until = Date.now() + DEVICE; Date.now() < until; ) {
      await Bun.sleep(every);
      if (stop.aborted) {
        throw new Error("the login was stopped");
      }
      const res = await fetch(AUTH + "/api/accounts/deviceauth/token", { method: "POST", headers: json, body: JSON.stringify({ device_auth_id: id, user_code: code }), signal: stop });
      if (res.status === 403 || res.status === 404) {
        continue;
      }
      if (!res.ok) {
        throw new Error("ChatGPT's device login failed (HTTP " + res.status + ")");
      }
      const grant: any = await res.json();
      const body = new URLSearchParams({ grant_type: "authorization_code", code: grant.authorization_code, redirect_uri: AUTH + "/deviceauth/callback", client_id: CLIENT, code_verifier: grant.code_verifier });
      const tokens = await fetch(ISSUER, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, signal: stop });
      if (!tokens.ok) {
        throw new Error("ChatGPT's device login got no tokens (HTTP " + tokens.status + ")");
      }
      const own = fs.existsSync(config.OWN_LOGIN) ? JSON.parse(fs.readFileSync(config.OWN_LOGIN, "utf8")) : {};
      ChatGPT.keep(config.OWN_LOGIN, own, {}, await tokens.json(), null);
      held = null;
      return;
    }
    throw new Error("the code expired after 15 minutes: /login for another");
  }

  // Illi's own login removed (opencode's, if there, is used again); false:
  // there was none
  export function logout(): boolean {
    if (!fs.existsSync(config.OWN_LOGIN)) {
      return false;
    }
    fs.rmSync(config.OWN_LOGIN);
    held = null;
    return true;
  }

  // the login file, and its entry for OpenAI
  export function entry(): { data: any; entry: any } {
    const file = ChatGPT.file();
    if (!fs.existsSync(file)) {
      throw new Error(NO_LOGIN);
    }
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
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
  export async function locked<T>(fn: () => Promise<T>): Promise<T> {
    const flock = ChatGPT.flock();
    const lock = ChatGPT.file() + ".lock";
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

  // the models the backend shows (not hidden), best first: offered (new
  // ones too, unless `models` names those offered) and kept with their
  // windows; null: not told (no login, offline: those kept last stay)
  export async function models(): Promise<string[] | null> {
    try {
      const token  = await ChatGPT.token();
      const claims = ChatGPT.claims(token);
      const init   = { headers: { authorization: "Bearer " + token, "chatgpt-account-id": held?.account || claims.chatgpt_account_id || "", originator: "illi" }, signal: AbortSignal.timeout(15e3) };
      const res    = await fetch(LIST, init);
      const list: any[] = res.ok ? ((await res.json()) as any).models ?? [] : [];
      const shown  = list.filter((m) => m?.visibility === "list" && typeof m.slug === "string").sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
      const kept   = shown.map((m) => ({ label: m.slug, id: m.slug, speeds: ["slow"], window: Number(m.context_window) || undefined }));
      if (kept.length === 0) {
        return null;
      }
      fs.writeFileSync(config.MODELS_FILE, JSON.stringify({ at: new Date().toISOString(), vendors: { chatgpt: kept } }, null, 2) + "\n");
      const fresh = Pick.learn("chatgpt", kept);
      if (!config.MODELS_SET) {
        config.OFFER.models.push(...fresh.filter((label) => !config.OFFER.models.includes(label)));
      }
      return fresh;
    } catch {
      return null;
    }
  }

  export function headers(token: string, ask: Ask): Record<string, string> {
    const claims = ChatGPT.claims(token);
    const out: Record<string, string> = {
      authorization        : "Bearer " + token,
      "chatgpt-account-id" : held?.account || claims.chatgpt_account_id || "",
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

  // OpenAI.ts's body, its cache marks and search cap dropped (the backend
  // refuses them), keyed by its session
  export function body(...args: Parameters<typeof OpenAI.body>): unknown {
    const body: any = OpenAI.body(...args);
    for (const item of body.input) {
      for (const part of Array.isArray(item.content) ? item.content : []) {
        delete part.prompt_cache_breakpoint;
      }
    }
    return { ...body, prompt_cache_options: undefined, max_tool_calls: undefined, prompt_cache_key: ChatGPT.session(args[0]) };
  }

  // the plan's limits a response's headers tell: each window's share
  // used, its length, when it starts anew; one that tells none keeps
  // those known
  export function hear(headers: Headers): void {
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
    plan = told.length > 0 ? told : plan;
  }

  // the plan's limits, as last told (none: not yet)
  export function limits(): Limit[] {
    return plan;
  }

  // the plan the login in use is on, as its token says: plus, pro… ("":
  // none in use, or not told)
  export function tier(): string {
    const type = held === null ? "" : ChatGPT.claims(held.access).chatgpt_plan_type;
    return typeof type === "string" ? type : "";
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
    heard   : (res) => ChatGPT.hear(res.headers),
    headers : (token, ask) => ChatGPT.headers(token, ask),
    body    : (...args) => ChatGPT.body(...args),
    count   : async () => null,
    start   : (ask) => ({ res: null, error: null, use: Price.usage(ask.speed), items: [] }),
    read    : (st, ev, on) => ChatGPT.read(st, ev, on),
    begun   : (ev) => ev.type === "response.output_item.added",
    step    : (st, ask) => OpenAI.step(st, ask),
    usage   : (st) => st.use,
  };

}
