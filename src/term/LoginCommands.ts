// Login commands
// ==============
// /login: the providers illi runs on and their accounts, where all of
// connecting is done, nothing typed into a file. Its first picker, the
// makers (ChatGPT, Claude...: each provider's facts name its maker),
// each saying what of it is connected, the one the chat runs on marked;
// Enter on one, its ways in: its plan first (ChatGPT's, Claude's through
// Claude Code, Google's through Google's Antigravity CLI), then its API
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
// logs one out (asked first); under them its Models row (which of its
// models write its summaries and run its chats: asked too as one is
// connected anew), the rows its page adds (Page.more: a program it runs
// on, to update, say), a row that connects one more, the last logs out
// of it (asked first). What's connected is offered at once, and what's
// let go is gone, here and in every illi open (config.config_accounts,
// Chat.follow), unless the vendors setting names the providers, which
// /login then says. /logout opens the same pickers. A key is never shown
// whole, nor kept anywhere but the accounts' file: not in the input's
// history, the chat or a note. All of it is one popup of one size (BOX),
// whatever the provider: its lists, its questions, and every step of a
// sign-in (login_step: its page and code, the code it asks for, what it
// waits on, a download's progress, a key checked, why it failed, with
// Try again), never a note over the input; what a step offers is a row
// of buttons (login_offer), its text chosen and copied as the chat's
// (Popup.ts); what's connected, once done, is said in the chat.

import { Accounts, ENV, type Keyed, type Store } from "../config/Accounts.ts";
import type { Vendor } from "../ai/AskAI.ts";
import { Chat } from "../chat/Chat.ts";
import { browser_open } from "./Browser.ts";
import { term_account, term_ask, term_chooser, term_model_pick, term_question } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { Logins } from "../providers/Logins.ts";
import { term_note, term_notify } from "./Notices.ts";
import { Pick } from "../ai/Pick.ts";
import type { Facts } from "../providers/Provider.ts";
import { Providers } from "../providers/Providers.ts";
import { FACTS, Vendors } from "../providers/Vendors.ts";
import { term_draw } from "./Frame.ts";
import { setting_set } from "./Settings.ts";
import { term_hint, term_unhint, type Chooser, type Term } from "./Term.ts";
import * as Paint from "../ui/Paint.ts";
import * as Screen from "../ui/Screen.ts";

// Types
// =====

// an account of a provider, as its picker shows it: its name, what it is,
// whether it's in use; what Enter and Del do on it (Del asks first, Esc
// there going back to `back`)
export type Account = { name: string; about: string; use: boolean; take: () => void; drop: (back: () => void) => void };

// a row a provider's page adds to its accounts' picker, under its
// accounts (Page.more): its name, what it says, what Enter does (in the
// picker's foot: "update it"), and what it does, given where Esc on what
// it asks goes back to
export type Row = { name: string; about: string; enter: string; pick: (back: () => void) => void };

// a provider's page (a way in: a plan, an API key): its name, its vendor,
// what its row says; its accounts (none: not connected); the rows it adds
// under them as they stand now (none: no `more`), what connects one more
// (its row's name, "": none yet), and what logs out of it all, each given
// where Esc on what it asks goes back to. A plan's is its folder's
// Login.ts (Logins.ts lists them); an API key's, login_api
export type Page = { name: string; vendor: Vendor; about: () => string; accounts: () => Account[]; more?: () => Row[]; adds: string; add: (back: () => void) => void; out: (back: () => void) => void };

// a maker's providers, as /login's first picker shows them: its name,
// what its row says while none is connected, its providers' pages (its
// plan, its API)
type Maker = { name: string; offers: string; providers: Page[] };

// an API's vendor: its facts, whose key (Provider.ts ApiKey) names its
// key in config.KEYS, its variable and where a key is made; how one is
// checked (Provider.ts check)
type Api = { facts: Facts & { key: NonNullable<Facts["key"]> }; check: (key: string) => Promise<string> };

// what a step says: lines of text (an empty one a gap), or of runs
export type Body = string | Paint.Line[];

// what a popup of /login's offers, as a button (Chooser buttons: a
// step's while it waits, what it says, a line asked's with its key): its
// name, what Enter (the key) does, as the foot says it, and what it does,
// saying what it did ("": nothing); leaves: it opens what follows in the
// popup's place (Try again)
export type Act = { name: string; enter: string; run: () => string; leaves?: boolean };

// a step of /login while something runs, in its popup (login_step): what
// it runs, stopped by Esc (which goes back then); shown waiting (what it
// says, what it offers meanwhile), asking for a line (a sign-in's code,
// a secret: what Enter gives, a reason keeping it; the keys it takes
// besides), asking a question (its answers), failed (why, said; Try
// again, given what that runs), closed. Each state is the popup shown
// (null: the step was stopped), in the popup while it's free for it
// (nothing else open, the step itself, or another step), else kept for
// /login to show, so it never takes the place of a list the person
// opened meanwhile (Ctrl+P's); a failure there is a note instead
export type Step = {
  stop     : AbortController;
  wait     : (body: Body, acts?: Act[]) => Chooser | null;
  ask      : (body: Body, hint: string, foot: string, give: (text: string) => string | null, keys?: Record<string, Act>) => Chooser | null;
  question : (body: Body, names: string[], about: string[], pick: (k: number) => void) => Chooser | null;
  fail     : (why: string, again?: () => void) => void;
  close    : () => void;
};

// Constants
// =========

// how long a step's failure shows as a note, where the popup was taken
// meanwhile (login_step), till Esc or a message (ms)
const LOGIN_FAILED = 60000;

// the size of /login's popup, with its frame (the screen's room
// allowing; taller for a long list): every list, question and step of
// it, the models it asks too, so it never jumps as one goes through it,
// and every provider's sign-in reads the same
export const BOX = { w: 80, h: 14 };

// how long a provider connected anew is waited on for its models (its
// account's list: Provider.ts account) before /login asks which to run
// on (ms); past it, a note says where to choose them
export const READING      = 15000;

// Login
// =====

// the vendors connected as /login last opened, or since its last change
// of accounts (null: neither yet): what a vendor connected after a change
// is new to (login_after), whatever the change read on the way (a page
// that read the accounts again itself: ChatGPT's allowing opencode's
// login). Connected, not offered: with nothing connected, illi offers
// ChatGPT all the same (Vendors.fallback)
let seen: Vendor[] | null = null;

// /login (and /logout): the providers' picker, the accounts read again
// first (another terminal's change: a view's illi follows no chat that
// would have); while a sign-in runs, its step again (login_step), where
// something took the popup's place meanwhile
export function term_login(t: Term): void {
  if (running !== null && running.t === t && t.login === running.stop) {
    t.choose = running.c;
    t.pane   = null;
    return;
  }
  config.config_accounts();
  seen = login_connected(t);
  login_makers(t);
}

// the vendors connected, as /login's pickers show them (a page with an
// account)
function login_connected(t: Term): Vendor[] {
  return login_all(t).flatMap((m) => m.providers).filter((p) => p.accounts().length > 0).map((p) => p.vendor);
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
  term_chooser(t, "Providers", all.map((m) => m.name), about, here, (k) => login_maker(t, all[k]), { foot: () => "Enter open", size: BOX });
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
  term_chooser(t, m.name, m.providers.map((p) => p.name), m.providers.map((p) => p.about()), here, (k) => login_provider(t, m.providers[k], () => login_maker(t, m)), { foot, back: () => login_makers(t), size: BOX });
}

// a provider picked: not connected, connected; else its accounts (Esc
// on either going back to `back`)
function login_provider(t: Term, p: Page, back: () => void): void {
  return p.accounts().length === 0 ? p.add(back) : login_accounts(t, p, back);
}

// a provider's accounts' picker, the one in use marked: Enter uses one,
// Del logs one out; then its Models row (while it offers any:
// login_models_row), the rows its page adds (Page.more), the row that
// connects one more (if it can) and the one that logs out of it all; Esc
// goes back to `back`, and from what these ask, back here
function login_accounts(t: Term, p: Page, back: () => void): void {
  const again    = () => login_accounts(t, p, back);
  const accounts = p.accounts();
  const more  = [...login_models_row(t, p.vendor), ...(p.more?.() ?? [])];
  const adds  = p.adds === "" ? [] : [p.adds];
  const out   = "Log out of " + p.name;
  const names = [...accounts.map((a) => a.name), ...more.map((r) => r.name), ...adds, out];
  const about = [...accounts.map((a) => a.about), ...more.map((r) => r.about), ...adds.map(() => ""), accounts.length === 1 ? "" : "all " + accounts.length + " of them"];
  const row   = (k: number) => more[k - accounts.length];
  const keys  = (k: number, key: string) => {
    if (key !== "Delete" || k >= accounts.length) {
      return false;
    }
    accounts[k].drop(again);
    return true;
  };
  const foot  = (k: number) => (k < accounts.length ? (accounts[k].use ? "in use" : "Enter use it") + " · Del log it out" : row(k) !== undefined ? "Enter " + row(k).enter : names[k] === out ? "Enter log out" : "Enter connect") + " · Esc back";
  const pick  = (k: number) => (k < accounts.length ? accounts[k].take() : row(k) !== undefined ? row(k).pick(again) : names[k] === out ? p.out(again) : p.add(again));
  term_chooser(t, p.name, names, about, accounts.findIndex((a) => a.use), pick, { keys, foot, back, size: BOX });
}

// what follows a change of accounts: read again at once (the vendors
// offered, the keys in use), the chat told (its pick given way if its
// vendor went), the start's login note let go once no login is missing
// (term_hint), each account's catalog asked; said, with what the vendors
// setting leaves out (a vendor connected: its login kept outside the
// accounts' file there, else its entry in the file). A vendor connected
// now that wasn't as /login opened (`seen`: connected anew, by any page:
// a key, a plan's sign-in) and offered is asked its models next
// (login_models_new: what its account tells waited on, asked beside the
// chat's own, term_account; a view's illi asks it itself, its chat's illi
// asking its own); a change of account, a second key, a log out ask
// nothing more (its Models row asks)
export function login_after(t: Term, vendor: Vendor, said: string): void {
  const was = seen === null || seen.includes(vendor);
  config.config_accounts(true);
  if (t.chat !== null) {
    Chat.offered(t.chat);
  }
  if (term_hint() === "") {
    term_unhint(t);
  }
  const outside = Vendors.of(vendor)?.outside;
  const there   = outside !== undefined ? outside() : Object.keys(config.config_accounts_read() ?? {}).includes(vendor);
  const left    = config.config_named() && there && !config.OFFER.vendors.includes(vendor);
  const env  = config.config_env_set("vendors");
  const fix  = env === null ? "Your vendors setting leaves " + Pick.provider(vendor) + " out, though: /set vendors default lets /login decide." : env + " leaves " + Pick.provider(vendor) + " out, though: start illi without it to let /login decide.";
  term_note(t, said + (left ? " " + fix : ""));
  seen = login_connected(t);
  const fresh = !was && seen.includes(vendor) && config.OFFER.vendors.includes(vendor);
  const asked = term_account(t, fresh ? vendor : undefined);
  if (fresh) {
    void login_models_new(t, vendor, asked[vendor]);
  }
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
  login_question(t, title, ["Keep it", "Log out"], ["", about], (k) => (k === 1 ? done() : undefined), back);
}

// a question of /login's, in its popup at its size (BOX): its answers
// and what each is, what picking answer k does; Esc goes back to `back`.
// With `body`, what it says over its answers
export function login_question(t: Term, title: string, names: string[], about: string[], pick: (k: number) => void, back: () => void, body?: Body): void {
  term_question(t, title, names, about, pick, { back, popup: true, size: BOX, body: body === undefined ? undefined : login_lines(body) });
}

// a line /login asks for, in its popup at its size (BOX): its hint while
// empty, its foot, what Enter gives it (a reason it won't do, kept in its
// foot; null: taken); Esc goes back to `back`. A secret (a key) shows a
// dot a character
export function login_ask(t: Term, title: string, hint: string, foot: string, done: (text: string) => string | null, back: () => void, secret = false): void {
  term_ask(t, title, hint, "", foot, done, { secret, back, popup: true, size: BOX });
}

// what /login says in its popup at its size (BOX), as a step's failure
// does (why a download can't start, say), with what it offers as buttons
// (login_offer; again: Try again, running it); Esc goes back to `back`
export function login_say(t: Term, title: string, body: Body, back: () => void, acts: Act[] = []): Chooser {
  return login_offer(t, title, body, acts, back, "back", false, (make) => make())!;
}

// Try again as a button: what runs it
export function login_again(again: () => void): Act {
  return { name: "Try again", enter: "try again", run: () => (again(), ""), leaves: true };
}

// a popup of /login's that says something and offers its acts as
// buttons (none: Esc alone), the first lit; pressing one runs it, the
// popup shown again with what it did in its foot (the one pressed lit),
// unless it leaves (Act leaves). Esc runs `esc`, said in the foot as
// `stop` or `back`; held, a click outside doesn't close it. Each time it
// shows, by `put` (a step's: shown only while the popup is its; null:
// not shown), it is a new popup (Enter shut the one before: Keys.ts)
function login_offer(t: Term, title: string, body: Body, acts: Act[], esc: () => void, said: string, hold: boolean, put: (make: () => Chooser) => Chooser | null): Chooser | null {
  let did = "";
  let at  = -1;
  const foot  = (k: number) => [k === at && did !== "" ? did : acts.length === 0 ? "" : "Enter " + acts[k].enter, "Esc " + said].filter(Boolean).join(" · ");
  const place = (lit: number): Chooser | null => put(() => {
    const c = term_chooser(t, title, acts.map((a) => a.name), acts.map(() => ""), -1, (k) => {
      const a = acts[k];
      const told = a.run();
      if (a.leaves !== true) {
        [did, at] = [told, k];
        place(k);
      }
    }, { foot, back: esc, body: login_lines(body), size: BOX, hold, buttons: true });
    c.at = Math.max(0, lit);
    term_draw(t);
    return c;
  });
  return place(0);
}

// Steps
// =====

// the popups /login's steps showed (login_step): one of them may give way
// to the next step (a download's to its sign-in), where a list the person
// opened never does
const STEPS = new WeakSet<Chooser>();

// the step a sign-in shows now (null: none runs): /login opens it again,
// where something took the popup's place meanwhile (Ctrl+P's palette)
let running: { t: Term; c: Chooser; stop: AbortController } | null = null;

// a body's lines: a text's, split at its line ends (an empty line a gap)
export function login_lines(body: Body): Paint.Line[] {
  return typeof body !== "string" ? body : body.split("\n").map((l) => (l === "" ? [] : [Paint.Run(l)]));
}

// a step of /login while something runs (a sign-in, a download, a key
// checked), in its popup at its size (BOX), titled; Esc stops it and goes
// back to `back`. `own`: it's the sign-in running (t.login: one before
// it stopped; term_esc stops it as nothing shows it; /login shows it
// again). Each of its states shows while the popup is free for it
// (Step), held against a click outside while it runs; failed, it says why
// with Try again, Esc back. A step lets go of t.login and `running`
// (release) as Esc stops it, as it fails and as it closes: a caller
// that ends it any other way (stopped from outside: Member.ts
// member_hide) closes it too, or /login would show it again
export function login_step(t: Term, title: string, back: () => void, own = true): Step {
  const stop = new AbortController();
  if (own) {
    t.login?.abort();
    t.login = stop;
  }
  let cur: Chooser | null = null;
  const free    = () => t.choose === null || t.choose === cur || STEPS.has(t.choose);
  const release = () => {
    t.login = t.login === stop ? null : t.login;
    running = running?.stop === stop ? null : running;
  };
  const esc  = () => {
    stop.abort();
    release();
    back();
  };
  const put  = (make: () => Chooser): Chooser | null => {
    if (stop.signal.aborted) {
      return null;
    }
    const shown = free();
    const [was, pane] = [t.choose, t.pane];
    const c = make();
    STEPS.add(c);
    cur = c;
    running = own && t.login === stop ? { t, c, stop } : running;
    if (!shown) {
      [t.choose, t.pane] = [was, pane];
    }
    term_draw(t);
    return c;
  };
  const wait = (body: Body, acts: Act[] = []): Chooser | null => login_offer(t, title, body, acts, esc, "stop", true, put);
  const ask = (body: Body, hint: string, foot: string, give: (text: string) => string | null, keys: Record<string, Act> = {}): Chooser | null => {
    const said = [foot, ...Object.entries(keys).map(([key, a]) => key + " " + a.enter), "Esc stop"].join(" · ");
    const acts = Object.values(keys);
    return put(() => {
      const run = (a: Act) => {
        const did = a.run();
        c.foot = () => (did === "" ? said : did + " · Esc stop");
        term_draw(t);
      };
      const c: Chooser = term_ask(t, title, hint, "", said, give, { secret: true, popup: true, back: esc, body: login_lines(body), size: BOX, hold: true, keys: (key) => {
        const a = keys[key];
        if (a !== undefined) {
          run(a);
        }
        return a !== undefined;
      }, names: acts.map((a) => a.name), press: (k) => run(acts[k]) });
      return c;
    });
  };
  const question = (body: Body, names: string[], about: string[], pick: (k: number) => void): Chooser | null => {
    return put(() => term_question(t, title, names, about, pick, { foot: () => "Esc stop", back: esc, popup: true, body: login_lines(body), size: BOX, hold: true }));
  };
  const fail = (why: string, again?: () => void): void => {
    release();
    if (stop.signal.aborted) {
      return;
    }
    if (!free()) {
      term_notify(t, why, false, LOGIN_FAILED);
      term_draw(t);
      return;
    }
    login_offer(t, title, why, again === undefined ? [] : [login_again(again)], back, "back", false, put);
  };
  const close = (): void => {
    release();
    t.choose = cur !== null && t.choose === cur ? null : t.choose;
    term_draw(t);
  };
  return { stop, wait, ask, question, fail, close };
}

// a device code's step (ChatGPT's, GitHub's): the code copied, the page
// opened in the browser (on a terminal: one that won't open said, to open
// it oneself), both said with what the person does there (`then`) and
// how long the code is good; meanwhile the page opened again, the code
// and the link copied again, each by a button (login_offer)
export function login_device(t: Term, step: Step, url: string, code: string, then: string, minutes = 15): void {
  Screen.screen_copy(code);
  const opening = t.scr.tty ? browser_open(url) : null;
  const bold    = { ...Paint.INK, b: true };
  const body    = (how: string): Paint.Line[] => [
    [Paint.Run("Open "), Paint.Run(url, bold), Paint.Run(" and enter this code:")],
    [],
    [Paint.Run("    "), Paint.Run(code, bold)],
    [],
    [Paint.Run(how + " The code is good for " + minutes + " minutes; illi waits for you to " + then + " there.")],
  ];
  const acts: Act[] = [
    { name: "Open the page", enter: "open it in your browser", run: () => (browser_open(url) === null ? "No browser to open it here" : "Opened it in your browser") },
    { name: "Copy the code", enter: "copy it", run: () => (Screen.screen_copy(code), "Copied the code") },
    { name: "Copy the link", enter: "copy it", run: () => (Screen.screen_copy(url), "Copied the link") },
  ];
  const c = step.wait(body(opening === null ? "illi copied the code." : "illi opened the page in your browser and copied the code."), acts);
  void opening?.then((why) => {
    if (why !== "" && c !== null) {
      c.body = body("Your browser didn't open (" + why + "): open the page yourself. illi copied the code.");
      term_draw(t);
    }
  });
}

// a sign-in's step that asks for the code its page shows (Google's,
// Claude's): what to do said (sign in `who`, then paste the code here;
// `again`: asked again, the code before didn't sign in), how the page
// opened (`opened`: by its program, else by illi, on a terminal: one
// that won't open said), its link; the code asked for, shown as dots
// (none: asked for first), given the sign-in (`give`: a reason it won't
// do, kept; null: taken). Ctrl+O opens the page again, Ctrl+Y copies its
// link (no link told: neither)
export function login_paste(t: Term, step: Step, url: string, who: string, give: (code: string) => string | null, opened = false, again = false): void {
  const opening = opened || !t.scr.tty || url === "" ? null : browser_open(url);
  const how     = (why: string) => why !== "" ? "Your browser didn't open (" + why + "): open this page yourself:" : opened ? "Its page opened in your browser (if it didn't, open this one):" : opening !== null ? "illi opened its page in your browser (if it didn't, open this one):" : "Open this page in a browser:";
  const body    = (why: string): Paint.Line[] => [
    [Paint.Run((again ? "That code didn't sign in. " : "") + "Sign in " + who + " in your browser, then paste the code the page shows here.")],
    ...(url === "" ? [] : [[], [Paint.Run(how(why))], [Paint.Run(url, Paint.DIM)]]),
  ];
  const keys: Record<string, Act> = url === "" ? {} : {
    "Ctrl+O": { name: "Open the page", enter: "open the page", run: () => (browser_open(url) === null ? "No browser to open it here" : "Opened the page in your browser") },
    "Ctrl+Y": { name: "Copy the link", enter: "copy its link", run: () => (Screen.screen_copy(url), "Copied the link") },
  };
  const c = step.ask(body(""), "paste the code from the page", "Enter sign in", (code) => (code.trim() === "" ? "Paste the code first" : give(code.trim())), keys);
  void opening?.then((why) => {
    if (why !== "" && c !== null) {
      c.body = body(why);
      term_draw(t);
    }
  });
}

// Models
// ======

// a provider connected anew: its models read first (what its account
// tells: Provider.ts account, waited on READING ms at most, a step of
// /login's saying so while the screen is free for it, Esc not waiting;
// one that asks nothing, as known), then asked (login_models), the page
// that connected it done first (a sign-in's own end: t.login let go).
// Nothing asked if it offers fewer than two; its list not come in time
// (or not waited on), or the screen at something else by then (a list,
// a question, a sign-in, text typed), a note says where to choose them
async function login_models_new(t: Term, vendor: Vendor, reading: Promise<boolean> | undefined): Promise<void> {
  const busy = () => t.choose !== null || t.question !== null || t.login !== null || t.scr.ed.text !== "";
  let came    = true;
  let skipped = false;
  if (reading === undefined) {
    await Promise.resolve();
  } else {
    const step = busy() ? null : login_step(t, "Models on " + Pick.provider(vendor), () => {}, false);
    step?.wait("Reading the models " + Pick.provider(vendor) + " offers…");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late    = new Promise<false>((done) => (timer = setTimeout(() => done(false), READING)));
    const stopped = new Promise<false>((done) => step?.stop.signal.addEventListener("abort", () => done(false), { once: true }));
    came = await Promise.race([reading.then(() => true, () => false), late, stopped]);
    clearTimeout(timer);
    skipped = step?.stop.signal.aborted === true;
    step?.close();
  }
  const rows = Pick.models([vendor], config.OFFER.models);
  if (!config.OFFER.vendors.includes(vendor) || rows.length < 2) {
    return;
  }
  if (!came || busy()) {
    return term_note(t, (came || skipped ? "" : "Its list of models didn't come. ") + "/login, " + (Vendors.of(vendor)?.row ?? vendor) + ", Models chooses which of them " + Pick.provider(vendor) + " runs on.");
  }
  login_models(t, vendor);
  term_draw(t);
}

// a provider's Models row, while it offers any: what its chats and their
// summaries run on now; Enter asks both again (login_models)
function login_models_row(t: Term, vendor: Vendor): Row[] {
  const chats = config.OFFER.vendors.includes(vendor) ? config.config_chats(vendor) : null;
  if (chats === null) {
    return [];
  }
  const sums = config.config_role("compactor", chats);
  return [{ name: "Models", about: "chats: " + Pick.shown(chats) + ", summaries: " + Pick.shown(sums), enter: "choose them", pick: (back) => login_models(t, vendor, back) }];
}

// a provider's models, asked: the one that writes its chats' summaries
// (compactor), then the one its chats run on (chats), each picker lit on
// what runs now (the setting's choice, else the provider's own: its
// facts' defaults). Enter on that as it is leaves the setting as it is
// (a default follows the provider's list as it changes); another is kept
// in the setting (login_models_keep). Esc on the first skips both, on the
// second keeps the first; either goes to `back` if given. Said once done
function login_models(t: Term, vendor: Vendor, back?: () => void): void {
  const rows  = Pick.models([vendor], config.OFFER.models);
  const chats = config.config_chats(vendor);
  if (chats === null) {
    return;
  }
  const sums  = config.config_role("compactor", chats);
  const on    = Pick.provider(vendor);
  term_model_pick(t, rows, "Summaries on " + on + ": which model writes them?", sums, (s) => {
    if (!login_models_keep(t, "compactor", sums, s)) {
      return back?.();
    }
    term_model_pick(t, rows, "Chats on " + on + ": which model do they run on?", chats, (c) => {
      if (login_models_keep(t, "chats", chats, c)) {
        login_models_said(t, vendor);
      }
      back?.();
    }, false, back, BOX);
  }, false, back, BOX);
}

// a model chosen for a role on its vendor (`now`: what ran), kept in the
// role's setting unless it's what ran: by family (Pick.family) while it's
// the newest of it offered, so the setting follows as newer ones come,
// else by itself (an older one chosen stays); false: not kept (said)
function login_models_keep(t: Term, role: "compactor" | "chats", now: Pick, chose: Pick): boolean {
  if (Pick.label(chose) === Pick.label(now)) {
    return true;
  }
  const family = Pick.family(chose.model);
  const named  = family !== chose.model && Pick.newest(chose.vendor, family, config.OFFER.models) === chose.model ? { ...chose, model: family } : chose;
  return setting_set(t, role, config.config_role_set(role, named));
}

// a provider's models as now chosen, said; where new chats start too,
// while that's another provider (the first offered's, or `pick`)
function login_models_said(t: Term, vendor: Vendor): void {
  const chats = config.config_chats(vendor);
  if (chats === null) {
    return;
  }
  const sums  = config.config_role("compactor", chats);
  const first = config.PICK.vendor === vendor ? "" : " New chats start on " + Pick.provider(config.PICK.vendor) + ": /model moves a chat to " + Pick.provider(vendor) + ".";
  term_note(t, Pick.provider(vendor, true) + ": chats run on " + Pick.shown(chats) + ", summaries on " + Pick.shown(sums) + "." + first);
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
  login_question(t, "Connect " + api.facts.row, ["Use " + named, "Paste another key"], [Accounts.mask(key), "kept in illi's accounts"], (k) => (k === 0 ? void login_api_take(t, api, key, ENV, back) : login_api_ask(t, api, back)), back);
}

// a key asked for, shown as dots, then checked and kept (Esc back to
// `back`)
function login_api_ask(t: Term, api: Api, back: () => void): void {
  login_ask(t, api.facts.row, "paste it here: a key from " + api.facts.key.where, "Enter connect · Esc back", (text) => {
    const key = text.trim();
    if (key === "") {
      return "Paste the key first.";
    }
    if (!Accounts.plain(key)) {
      return "A key has no spaces or special characters in it: paste it alone, as the provider shows it.";
    }
    void login_api_take(t, api, key, null, back);
    return null;
  }, back, true);
}

// a key checked with its provider (a step of /login's saying so: Esc
// stops waiting, back to `back`), then taken: the environment's (ENV) in
// use, or a pasted one kept and in use; refused, said there, Try again
// (the environment's checked again, else another asked for); one that
// can't be a key (Accounts.plain) never sent
async function login_api_take(t: Term, api: Api, key: string, id: string | null, back: () => void): Promise<void> {
  const again = () => (id === ENV ? void login_api_take(t, api, key, id, back) : login_api_ask(t, api, back));
  if (!Accounts.plain(key)) {
    login_say(t, api.facts.row, "The key wasn't connected: it has a space or a character no key has.", back, [login_again(again)]);
    return;
  }
  const step = login_step(t, api.facts.row, back, false);
  step.wait("Checking the key with " + api.facts.row.replace(/ API key$/, "") + "…");
  const why = await api.check(key);
  if (step.stop.signal.aborted) {
    return;
  }
  if (why !== "") {
    return step.fail("The key wasn't connected: " + why + ".", again);
  }
  step.close();
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
