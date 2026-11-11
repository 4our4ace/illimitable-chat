// ChatGPT plan's /login page
// ==========================
// chatgpt in /login (LoginCommands.ts): connected by its device login
// (its page opened, its code copied, in /login's popup: login_chatgpt),
// or opencode's login if /login left it to opencode. Esc stops a sign-in
// waiting.
// Its accounts: the one in use in its login file, opencode's while illi
// may use it, the others kept apart (ChatGPT.swap): a switch puts one in
// the login file and keeps the one there apart, so each renews in its
// turn.

import * as fs from "node:fs";
import type { Saved } from "../../config/Accounts.ts";
import * as config from "../../config/Config.ts";
import { login_after, login_device, login_question, login_step, login_sure, type Account, type Page } from "../../term/LoginCommands.ts";
import { term_note } from "../../term/Notices.ts";
import type { Term } from "../../term/Term.ts";
import { ChatGPT } from "./ChatGPT.ts";
import { LoginFile } from "./Facts.ts";

// ChatGPT as a provider: the account in use (its login file's, renewed
// there), opencode's login while illi may use it and it isn't the one in
// use, then the accounts kept apart (ChatGPT.swap); each named by its
// email, told by its plan and where its login is
function login_chatgpt_provider(t: Term): Page {
  const accounts = (): Account[] => {
    const file  = ChatGPT.file();
    const using = ChatGPT.kept(file);
    const ours  = file !== LoginFile.opencode;
    const other = LoginFile.set === null && ours && ChatGPT.logins().opencode ? ChatGPT.kept(LoginFile.opencode) : null;
    const where = LoginFile.set !== null ? "the file `login` names" : ours ? "illi's login" : "opencode's login";
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
  const add = (back: () => void) => (login_chatgpt_opencode() !== null ? login_chatgpt_connect(t, back) : void login_chatgpt(t, back));
  return { name: "ChatGPT plan", vendor: "chatgpt", about, accounts, adds: "+ add another account", add: (back) => (accounts().length === 0 ? add(back) : void login_chatgpt(t, back)), out: (back) => login_chatgpt_out(t, back) };
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
  return LoginFile.set === null && !ChatGPT.logins().opencode ? ChatGPT.kept(LoginFile.opencode) : null;
}

// ChatGPT not connected while opencode's login is there, left to opencode:
// that one, or a sign-in to another (Esc back to `back`)
function login_chatgpt_connect(t: Term, back: () => void): void {
  const other = login_chatgpt_opencode()!;
  login_question(t, "Connect ChatGPT plan", ["Use opencode's login", "Sign in to another account"], [login_chatgpt_name(other), "with a code at OpenAI's page"], (k) => {
    if (k === 1) {
      return void login_chatgpt(t, back);
    }
    const why = ChatGPT.allow(true);
    return why !== null ? term_note(t, "Can't change the accounts: " + why + ".") : login_after(t, "chatgpt", "ChatGPT runs on opencode's login (" + login_chatgpt_name(other) + ").");
  }, back);
}

// ChatGPT's device login, in /login's popup (login_step: Esc stops it,
// back to `back`): its page and code said (the code copied, the page
// opened: login_device), the login kept once the person gives it (in the
// file `login` names, else as illi's own; the account there before kept
// apart: ChatGPT.swap), said in the chat; failed, said there, Try again;
// again, a new code (the last one let go)
export async function login_chatgpt(t: Term, back: () => void = () => {}): Promise<void> {
  const step = login_step(t, "Sign in to ChatGPT", back);
  step.wait("Asking OpenAI for a code…");
  try {
    const { url, code, done } = await ChatGPT.device(step.stop.signal);
    login_device(t, step, url, code, "sign in");
    await done;
    step.close();
    const now = ChatGPT.kept(ChatGPT.own());
    login_after(t, "chatgpt", "Signed in to ChatGPT" + (now === null ? "" : " as " + login_chatgpt_name(now)) + ". illi keeps the login in " + config.config_home(ChatGPT.own()) + (LoginFile.set === null ? "" : " (the file `login` names)") + " and renews it there.");
  } catch (err: any) {
    step.fail("Login failed: " + err.message + ".", () => void login_chatgpt(t, back));
  }
}

// an account used from now on: one kept apart put in the login file in
// place of the one there (kept apart in turn), or opencode's (null: illi's
// own let go for it, kept apart)
async function login_chatgpt_use(t: Term, s: Saved | null): Promise<void> {
  const why = await ChatGPT.swap(s === null ? null : s.entry, true);
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
  if (using && LoginFile.set !== null) {
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
  const why  = next === null ? null : await ChatGPT.swap(next.entry, true);
  const now  = ChatGPT.kept(ChatGPT.file());
  login_after(t, "chatgpt", said + (why !== null ? " Can't switch accounts: " + why + "." : now === null ? "" : " ChatGPT now runs on " + login_chatgpt_name(now) + "."));
}

// ChatGPT logged out (asked first, Esc back to `back`): illi's own login
// and the accounts kept apart forgotten, opencode's left to opencode,
// ChatGPT no longer offered; a file `login` names is left
function login_chatgpt_out(t: Term, back: () => void): void {
  if (LoginFile.set !== null) {
    return login_chatgpt_named(t);
  }
  const other = fs.existsSync(LoginFile.opencode);
  login_sure(t, "Log out of ChatGPT?", "illi forgets its logins and stops offering ChatGPT" + (other ? "; opencode stays signed in" : ""), () => {
    t.login?.abort();
    ChatGPT.logout();
    const why = ChatGPT.edit(() => ({ opencode: false, saved: [] }));
    return why !== null ? term_note(t, "Can't change the accounts: " + why + ".") : login_after(t, "chatgpt", "Logged out of ChatGPT.");
  }, back);
}

// the login in use is the file `login` names, which illi never lets go
function login_chatgpt_named(t: Term): void {
  term_note(t, "illi uses the login in " + config.config_home(LoginFile.set!) + " (the login setting): logging out leaves it. /set login default switches back at the next start.");
}

// the page, as /login lists it (Logins.ts)
export const PAGE = login_chatgpt_provider;
