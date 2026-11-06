// Claude plan's /login page
// =========================
// claude-code in /login (LoginCommands.ts): its accounts, each a Claude
// Code folder (ClaudeCode.ts), connected by your Claude Code's login, or
// a sign-in (Claude Code's own, its code pasted here as dots:
// login_claude_sign; the first, with none connected and your Claude Code
// logged in to none, your own Claude Code's; else in a new folder of
// illi's, made as it starts so two terminals never share one, and logged
// out and removed if the sign-in ends without it kept; your own Claude
// Code is never logged out). Esc stops a sign-in waiting (term_esc).
// Its accounts: your Claude Code's (logging out leaves it logged in) and
// those signed in to in folders of illi's own (logging out logs them out,
// their folders gone).

import * as fs from "node:fs";
import * as path from "node:path";
import { Accounts, OWN, type Folder } from "../../config/Accounts.ts";
import * as config from "../../config/Config.ts";
import { term_ask, term_question } from "../../term/Commands.ts";
import { term_draw } from "../../term/Frame.ts";
import { LOGIN, LOGIN_FAILED, login_after, login_edit, login_sure, type Account, type Page } from "../../term/LoginCommands.ts";
import { term_note, term_notify, term_unnotify, type Notice } from "../../term/Notices.ts";
import type { Term } from "../../term/Term.ts";
import { ClaudeCode } from "./ClaudeCode.ts";

// the Claude plan (claude-code: Claude Code run as it ships) as a
// provider: its accounts, each a Claude Code folder (ClaudeCode.ts: the
// user's own Claude Code's, and those illi signed in, a folder each in
// its root), named by the email Claude Code told, told by its plan
function login_claude_provider(t: Term): Page {
  const kept = () => config.config_accounts_read()?.["claude-code"];
  const accounts = (): Account[] => {
    const now = kept();
    const all = now?.accounts ?? [];
    return all.map((a) => ({ name: login_claude_name(a, all), about: [a.plan, a.id === OWN ? "your Claude Code" : "added in illi"].filter(Boolean).join(" · "), use: now!.use === a.id, take: () => login_claude_use(t, a), drop: (back) => login_claude_drop(t, a, back) }));
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
// it's logged in, or a sign-in to another, asked once Claude Code said,
// a note saying illi asks it meanwhile, Esc stopping it as a sign-in's:
// drawn then; not, it signs in);
// else one signed in to in a new folder of illi's. Esc on what it asks
// goes back to `back`
async function login_claude_add(t: Term, back: () => void): Promise<void> {
  if ((config.config_accounts_read()?.["claude-code"]?.accounts.length ?? 0) > 0) {
    return login_claude_sign(t, null, back);
  }
  let who: Awaited<ReturnType<typeof ClaudeCode.status>>;
  t.login?.abort();
  const stop = new AbortController();
  t.login = stop;
  const asking = term_notify(t, "Asking your Claude Code whom it's logged in as… (Esc stops)", false, 60e3);
  try {
    who = await ClaudeCode.status("");
  } catch (err: any) {
    return stop.signal.aborted ? undefined : term_note(t, err.message + ".");
  } finally {
    t.login = t.login === stop ? null : t.login;
    term_unnotify(t, asking);
  }
  if (stop.signal.aborted) {
    return;
  }
  if (who === null) {
    return login_claude_sign(t, OWN, back);
  }
  const mine = { id: OWN, ...who };
  term_question(t, "Connect Claude plan", ["Use your Claude Code's login", "Sign in to another account"], [login_claude_name(mine), "with a code at Claude's page"], (k) => {
    return k === 1 ? void login_claude_sign(t, null, back) : void login_claude_keep(t, mine, "Connected your Claude plan (" + login_claude_name(mine) + "): its models are in /model.");
  }, { back, popup: true });
  term_draw(t);
}

// a new folder of illi's, made now (readable by the user alone), so
// another illi adding one at the same moment makes the next: its id,
// none of those kept nor a folder left there. Thrown: it can't be made
function login_claude_id(): string {
  const ids = (config.config_accounts_read()?.["claude-code"]?.accounts ?? []).map((a) => a.id);
  fs.mkdirSync(path.join(config.ROOT, "claude"), { recursive: true, mode: 0o700 });
  for (let n = 1; ; n++) {
    if (ids.includes("c" + n)) {
      continue;
    }
    try {
      fs.mkdirSync(Accounts.folder(config.ROOT, "claude-code", "c" + n), { mode: 0o700 });
      return "c" + n;
    } catch (err: any) {
      if (err?.code !== "EEXIST") {
        throw err;
      }
    }
  }
}

// an account kept (in place of one of its folder) and in use from now
// on; said. false: it couldn't be kept (said)
function login_claude_keep(t: Term, a: Folder, said: string): boolean {
  const done = login_edit(t, (store) => {
    const was = store["claude-code"]?.accounts ?? [];
    return { ...store, "claude-code": { use: a.id, accounts: [...was.filter((o) => o.id !== a.id), a] } };
  });
  if (done) {
    login_after(t, "claude-code", said);
  }
  return done;
}

// a folder signed in to a Claude plan (ClaudeCode.signin): the user's own
// Claude Code's (OWN), or a new one of illi's (null: login_claude_id). A
// note says it starts (Esc stops it); Claude Code opens its page; the
// code the page shows asked for here, shown as dots (Esc stops it all,
// back to `back`), given it; signed in, whom it's logged in as kept and
// in use. One of illi's folders not kept in the end (the sign-in failed
// or was stopped, or the account couldn't be kept) is logged out and
// gone
async function login_claude_sign(t: Term, want: string | null, back: () => void): Promise<void> {
  t.login?.abort();
  const stop = new AbortController();
  t.login = stop;
  let id = want;
  let asked: Notice | null = term_notify(t, "Starting the sign-in: Claude Code opens Claude's page in your browser. Esc stops it.", false, LOGIN);
  let line: Term["choose"] = null;
  let give = (_code: string) => {};
  const ask = (url: string) => {
    if (asked !== null) {
      term_unnotify(t, asked);
    }
    asked = term_notify(t, "Sign in to Claude in your browser" + (url === "" ? "" : " (if it didn't open: " + url + ")") + ", then paste the code the page shows.", false, LOGIN);
    line = term_ask(t, "Claude plan", "paste the code from Claude's page", "", "Enter sign in · Esc stop", (code) => {
      if (code === "") {
        return "Paste the code first.";
      }
      give(code);
      return null;
    }, { secret: true, popup: true, back: () => {
      stop.abort();
      back();
    } });
  };
  try {
    id ??= login_claude_id();
    const dir = Accounts.folder(config.ROOT, "claude-code", id);
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
  } finally {
    t.login = t.login === stop ? null : t.login;
    t.choose = t.choose === line ? null : t.choose;
    if (asked !== null) {
      term_unnotify(t, asked);
    }
    term_draw(t);
    if (id !== null && id !== OWN && !(config.config_accounts_read()?.["claude-code"]?.accounts ?? []).some((a) => a.id === id)) {
      await login_claude_forget(id).catch(() => {});
    }
  }
}

// an account used from now on
function login_claude_use(t: Term, a: Folder): void {
  if (login_edit(t, (store) => (store["claude-code"]?.accounts.some((o) => o.id === a.id) ? { ...store, "claude-code": { ...store["claude-code"]!, use: a.id } } : null))) {
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
        const was = store["claude-code"];
        if (was === undefined) {
          return store;
        }
        const rest = was.accounts.filter((o) => o.id !== a.id);
        const use  = was.use === a.id ? rest[0]?.id ?? "" : was.use;
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
// with it; a logout that fails: the folder goes all the same; one that
// won't go logged, never thrown); the user's own Claude Code's never
// (OWN: nothing done)
async function login_claude_forget(id: string): Promise<void> {
  const dir = Accounts.folder(config.ROOT, "claude-code", id);
  if (dir === "") {
    return;
  }
  await ClaudeCode.logout(dir).catch(() => false);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err: any) {
    console.error("claude-code: the folder " + dir + " couldn't be removed (" + (err?.code ?? "error") + ")");
  }
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

// the page, as /login lists it (Logins.ts)
export const PAGE = login_claude_provider;
