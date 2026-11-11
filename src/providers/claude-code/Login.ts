// Claude plan's /login page
// =========================
// claude-code in /login (LoginCommands.ts): its accounts, each a Claude
// Code folder (ClaudeCode.ts), connected by your Claude Code's login, or
// a sign-in (Claude Code's own, in /login's popup, its code pasted
// there as dots: login_claude_sign; the first, with none connected and
// your Claude Code logged in to none, your own Claude Code's; else in a
// new folder of illi's, made as it starts so two terminals never share
// one, and logged out and removed if the sign-in ends without it kept;
// your own Claude Code is never logged out). Esc stops a sign-in waiting.
// Its accounts: your Claude Code's (logging out leaves it logged in) and
// those signed in to in folders of illi's own (logging out logs them out,
// their folders gone).

import * as fs from "node:fs";
import * as path from "node:path";
import { Accounts, OWN, type Folder } from "../../config/Accounts.ts";
import * as config from "../../config/Config.ts";
import { login_after, login_edit, login_paste, login_question, login_step, login_sure, type Account, type Page } from "../../term/LoginCommands.ts";
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
// a step of /login's saying illi asks it meanwhile, Esc stopping it as a
// sign-in's; not, it signs in); else one signed in to in a new folder of
// illi's. Esc on what it asks goes back to `back`
async function login_claude_add(t: Term, back: () => void): Promise<void> {
  if ((config.config_accounts_read()?.["claude-code"]?.accounts.length ?? 0) > 0) {
    return login_claude_sign(t, null, back);
  }
  const step = login_step(t, "Connect Claude plan", back);
  step.wait("Asking your Claude Code whom it's logged in as…");
  let who: Awaited<ReturnType<typeof ClaudeCode.status>>;
  try {
    who = await ClaudeCode.status("");
  } catch (err: any) {
    return step.fail(err.message + ".", () => void login_claude_add(t, back));
  }
  if (step.stop.signal.aborted) {
    return;
  }
  step.close();
  if (who === null) {
    return login_claude_sign(t, OWN, back);
  }
  const mine = { id: OWN, ...who };
  login_question(t, "Connect Claude plan", ["Use your Claude Code's login", "Sign in to another account"], [login_claude_name(mine), "with a code at Claude's page"], (k) => {
    return k === 1 ? void login_claude_sign(t, null, back) : void login_claude_keep(t, mine, "Connected your Claude plan (" + login_claude_name(mine) + "): its models are in /model.");
  }, back);
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
// Claude Code's (OWN), or a new one of illi's (null: login_claude_id), in
// /login's popup (login_step: Esc stops it, back to `back`): it says it
// starts; Claude Code opens its page; the code the page shows asked for,
// shown as dots (login_paste; asked again, said so), given it, the step
// saying it signs in meanwhile; signed in, whom it's logged in as kept
// and in use, said in the chat; failed, said there, Try again. One of
// illi's folders not kept in the end (the sign-in failed or was stopped,
// or the account couldn't be kept) is logged out and gone
async function login_claude_sign(t: Term, want: string | null, back: () => void): Promise<void> {
  const step = login_step(t, "Sign in to Claude", back);
  let id = want;
  let asked = 0;
  let give = (_code: string) => {};
  step.wait("Starting the sign-in: Claude Code opens Claude's page in your browser…");
  const ask = (url: string) => login_paste(t, step, url, "to Claude", (code) => {
    step.wait("Signing in to Claude…");
    give(code);
    return null;
  }, true, asked++ > 0);
  try {
    id ??= login_claude_id();
    const dir = Accounts.folder(config.ROOT, "claude-code", id);
    const run = ClaudeCode.signin(dir, step.stop.signal, ask);
    give = run.give;
    await run.done;
    const who = await ClaudeCode.status(dir);
    if (who === null) {
      throw new Error("Claude Code says it isn't logged in");
    }
    step.close();
    const a = { id, ...who };
    login_claude_keep(t, a, "Signed in to your Claude plan as " + login_claude_name(a) + ": illi runs on it now.");
  } catch (err: any) {
    step.fail("Login failed: " + err.message + ".", () => void login_claude_sign(t, want, back));
  } finally {
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
