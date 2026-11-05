// Google AI plan's /login page
// ============================
// antigravity in /login (LoginCommands.ts): its accounts, each a folder of
// illi's own (Antigravity.ts), signed in by Google's agent's own sign-in:
// illi opens Google's page (the agent tells its link; Esc stops the
// sign-in waiting, term_esc), the page sends the browser back to the
// agent, which keeps the sign-in in the account's folder, made as the
// sign-in starts so two terminals never share one, and gone again if the
// sign-in ends without it kept. The agent is Google's own (Agy.ts): with
// none here, adding an account first offers to download it, saying how
// big it is (Esc stops the download too). Google's agent tells no email,
// so an account is named by its number and its plan. Logging one out
// logs its folder's agent out and removes the folder. Accounts are never
// switched but here: illi doesn't rotate them.

import * as fs from "node:fs";
import * as path from "node:path";
import { Accounts, type Folder } from "../../config/Accounts.ts";
import * as config from "../../config/Config.ts";
import { browser_open } from "../../term/Browser.ts";
import { term_question } from "../../term/Commands.ts";
import { term_draw } from "../../term/Frame.ts";
import { LOGIN, LOGIN_FAILED, login_after, login_edit, login_sure, type Account, type Page } from "../../term/LoginCommands.ts";
import { term_notify, term_unnotify, type Notice } from "../../term/Notices.ts";
import type { Term } from "../../term/Term.ts";
import { Antigravity } from "./Antigravity.ts";
import { Agy, UNPACKED, type Build } from "./Agy.ts";

// the Google AI plan as a provider: its accounts, each a folder of
// illi's, named by its number, told by the plan the agent named
function login_agy_provider(t: Term): Page {
  const kept = () => config.config_accounts_read()?.antigravity;
  const accounts = (): Account[] => {
    const now = kept();
    return (now?.accounts ?? []).map((a) => ({ name: login_agy_name(a), about: a.plan, use: now!.use === a.id, take: () => login_agy_use(t, a), drop: (back) => login_agy_drop(t, a, back) }));
  };
  const about = () => {
    const now = kept();
    const a   = now?.accounts.find((a) => a.id === now.use);
    return a === undefined ? "your Google AI plan, through Google's Antigravity agent" : "connected: " + login_agy_name(a);
  };
  return { name: "Google AI plan", vendor: "antigravity", about, accounts, adds: "+ add another account", add: (back) => void login_agy_add(t, back), out: (back) => login_agy_out(t, back) };
}

// an account's name: its number (Google's agent tells no email)
function login_agy_name(a: Folder): string {
  return "Google account " + a.id.replace(/^g/, "");
}

// an account more: Google's agent downloaded first if none is here
// (asked, saying its size), then a sign-in
async function login_agy_add(t: Term, back: () => void): Promise<void> {
  if (Agy.command() !== null) {
    return login_agy_sign(t);
  }
  t.login?.abort();
  const stop = new AbortController();
  t.login = stop;
  const asking = term_notify(t, "Looking up Google's Antigravity agent… (Esc stops)", false, 60e3);
  let build: Build;
  let size: number;
  try {
    build = await Agy.latest(stop.signal);
    size  = await Agy.size(build, stop.signal);
  } catch (err: any) {
    if (!stop.signal.aborted) {
      term_notify(t, "Can't download Google's agent: " + err.message + ".", false, LOGIN_FAILED);
    }
    return;
  } finally {
    t.login = t.login === stop ? null : t.login;
    term_unnotify(t, asking);
  }
  const mb = (bytes: number) => Math.round(bytes / 1e6) + " MB";
  term_question(t, "Download Google's Antigravity agent?", ["Download it", "Not now"], ["antigravity-acp " + build.version + " from dl.google.com: " + (size > 0 ? mb(size) : "a few hundred MB") + ", about " + mb(UNPACKED) + " once unpacked", "the Google AI plan runs on it"], (k) => {
    if (k === 0) {
      void login_agy_fetch(t, build, size);
    }
  }, { back });
  term_draw(t);
}

// Google's agent downloaded (Esc stops it, nothing left behind), its
// progress said; then the sign-in
async function login_agy_fetch(t: Term, build: Build, size: number): Promise<void> {
  t.login?.abort();
  const stop = new AbortController();
  t.login = stop;
  let note: Notice = term_notify(t, "Downloading Google's Antigravity agent… (Esc stops)", false, LOGIN);
  let shown = -1;
  try {
    await Agy.download(build, stop.signal, (bytes, of) => {
      const share = Math.floor((bytes / (of || size || 1)) * 100);
      if (share !== shown && share % 5 === 0) {
        shown = share;
        term_unnotify(t, note);
        note = term_notify(t, "Downloading Google's Antigravity agent: " + Math.min(share, 100) + "% of " + Math.round((of || size) / 1e6) + " MB… (Esc stops)", false, LOGIN);
      }
    });
  } catch (err: any) {
    if (!stop.signal.aborted) {
      term_notify(t, "Google's agent wasn't downloaded: " + err.message + ".", false, LOGIN_FAILED);
    }
    return;
  } finally {
    t.login = t.login === stop ? null : t.login;
    term_unnotify(t, note);
  }
  term_notify(t, "Downloaded Google's Antigravity agent " + build.version + ".", false);
  return login_agy_sign(t);
}

// a new folder of illi's, made now (readable by the user alone), so
// another illi adding one at the same moment makes the next: its id, none
// of those kept nor a folder left there. Thrown: it can't be made
function login_agy_id(): string {
  const ids = (config.config_accounts_read()?.antigravity?.accounts ?? []).map((a) => a.id);
  fs.mkdirSync(path.join(config.ROOT, "antigravity"), { recursive: true, mode: 0o700 });
  for (let n = 1; ; n++) {
    if (ids.includes("g" + n)) {
      continue;
    }
    try {
      fs.mkdirSync(Accounts.folder(config.ROOT, "antigravity", "g" + n), { mode: 0o700 });
      return "g" + n;
    } catch (err: any) {
      if (err?.code !== "EEXIST") {
        throw err;
      }
    }
  }
}

// a new folder signed in (Antigravity.signin): Google's page opened as
// the agent tells its link (and said, if the browser didn't open), the
// person signs in there, the account kept and in use. One not kept in the
// end (the sign-in failed or was stopped) is gone
async function login_agy_sign(t: Term): Promise<void> {
  t.login?.abort();
  const stop = new AbortController();
  t.login = stop;
  let id: string | null = null;
  let asked: Notice | null = term_notify(t, "Starting the sign-in with Google… (Esc stops)", false, LOGIN);
  const ask = (url: string) => {
    const open = (why: string) => "Sign in with Google: " + why + "open " + url + " in a browser on this computer. illi waits for it: Esc stops.";
    if (asked !== null) {
      term_unnotify(t, asked);
    }
    const opening = t.scr.tty ? browser_open(url) : null;
    asked = term_notify(t, opening === null ? open("") : "Sign in with Google in your browser (opening it now). illi waits for it: Esc stops.", false, LOGIN);
    void opening?.then((why) => {
      if (why !== "" && t.login === stop && asked !== null) {
        term_unnotify(t, asked);
        asked = term_notify(t, open("your browser didn't open (" + why + "), so "), false, LOGIN);
      }
    });
  };
  try {
    id = login_agy_id();
    const plan = await Antigravity.signin(Accounts.folder(config.ROOT, "antigravity", id), stop.signal, ask);
    const a = { id, email: "", plan, org: "" };
    const done = login_edit(t, (store) => {
      const was = store.antigravity?.accounts ?? [];
      return { ...store, antigravity: { use: a.id, accounts: [...was.filter((o) => o.id !== a.id), a] } };
    });
    if (done) {
      login_after(t, "antigravity", "Signed in to your Google AI plan (" + login_agy_name(a) + (plan === "" ? "" : ", " + plan) + "): illi runs on it now.");
    }
  } catch (err: any) {
    if (!stop.signal.aborted) {
      term_notify(t, "Login failed: " + err.message + ".", false, LOGIN_FAILED);
    }
  } finally {
    t.login = t.login === stop ? null : t.login;
    if (asked !== null) {
      term_unnotify(t, asked);
    }
    term_draw(t);
    if (id !== null && !(config.config_accounts_read()?.antigravity?.accounts ?? []).some((a) => a.id === id)) {
      login_agy_forget(id, false);
    }
  }
}

// an account used from now on
function login_agy_use(t: Term, a: Folder): void {
  if (login_edit(t, (store) => (store.antigravity?.accounts.some((o) => o.id === a.id) ? { ...store, antigravity: { ...store.antigravity!, use: a.id } } : null))) {
    login_after(t, "antigravity", "Google AI plan now runs on " + login_agy_name(a) + ".");
  }
}

// an account logged out (asked first, Esc back to `back`): its folder's
// agent logged out and the folder gone; the next account in use in its
// place, none left: the plan let go
function login_agy_drop(t: Term, a: Folder, back: () => void): void {
  const name = login_agy_name(a);
  login_sure(t, "Log out of " + name + "?", "illi logs Google's agent out of it and forgets its folder", () => {
    void (async () => {
      await login_agy_forget(a.id, true);
      const done = login_edit(t, (store) => {
        const was = store.antigravity;
        if (was === undefined) {
          return store;
        }
        const rest = was.accounts.filter((o) => o.id !== a.id);
        const use  = was.use === a.id ? rest[0]?.id ?? "" : was.use;
        const { antigravity: _, ...others } = store;
        return rest.length === 0 ? others : { ...store, antigravity: { use, accounts: rest } };
      });
      if (done) {
        login_after(t, "antigravity", "Logged out of " + name + ".");
      }
    })();
  }, back);
}

// an account's folder gone, its agent logged out first where it signed
// in (a logout that fails: the folder goes all the same; one that won't
// go logged, never thrown)
async function login_agy_forget(id: string, signed: boolean): Promise<void> {
  const dir = Accounts.folder(config.ROOT, "antigravity", id);
  if (dir === "") {
    return;
  }
  if (signed) {
    await Antigravity.logout(dir);
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err: any) {
    console.error("antigravity: the folder " + dir + " couldn't be removed (" + (err?.code ?? "error") + ")");
  }
}

// the Google AI plan logged out (asked first, Esc back to `back`): each
// account's folder logged out and gone, the plan no longer offered;
// Google's agent stays downloaded
function login_agy_out(t: Term, back: () => void): void {
  login_sure(t, "Log out of Google AI plan?", "illi logs each account out and stops offering the Google AI plan", () => {
    void (async () => {
      const ids = (config.config_accounts_read()?.antigravity?.accounts ?? []).map((a) => a.id);
      await Promise.all(ids.map((id) => login_agy_forget(id, true)));
      if (login_edit(t, ({ antigravity: _, ...others }) => others)) {
        login_after(t, "antigravity", "Logged out of the Google AI plan.");
      }
    })();
  }, back);
}

// the page, as /login lists it (Logins.ts)
export const PAGE = login_agy_provider;
