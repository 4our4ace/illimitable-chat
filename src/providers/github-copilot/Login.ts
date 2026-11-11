// GitHub Copilot plan's /login page
// =================================
// github-copilot in /login (LoginCommands.ts): its accounts, each a
// folder of illi's own (Copilot.ts), signed in by GitHub's Copilot CLI's
// own sign-in, in /login's popup (its device code: illi opens GitHub's
// page, which the CLI tells, and copies the code to enter there; Esc
// stops the sign-in); the CLI keeps the sign-in by the account's folder
// (its token in the system's keychain where there is one, else, asked
// first, in a file in the folder), the folder made as the sign-in starts
// so two terminals never share one, and gone again if the sign-in ends
// without it kept. A GitHub login signed in again in a new folder takes
// the place of the one it had (that folder gone, not logged out: a
// keychain's token is by the GitHub login, the new sign-in's too). An
// account whose sign-in ran out signs in again in its own folder, from
// a row under the accounts.
// The CLI is the user's own `copilot` (1.0.100 or later), else the build
// this illi is pinned to (CopilotCli.ts): with none here, adding an
// account first offers to download it, saying how big it is (Esc stops
// the download too); with another version here (an older illi's), the
// page says it needs an update, and a row under the accounts offers it
// (CliLogin.ts, as every CLI's). Accounts are named by their GitHub
// login, told by their plan; one GitHub gives no Copilot (its
// subscription ended) signs in all the same, the popup saying why and
// where to turn Copilot on, its row saying so till it's on. Logging one
// out logs its folder's CLI out and removes the folder. Accounts are
// never switched but here: illi doesn't rotate them.

import * as fs from "node:fs";
import * as path from "node:path";
import { Accounts, type Folder } from "../../config/Accounts.ts";
import * as config from "../../config/Config.ts";
import { browser_open } from "../../term/Browser.ts";
import { login_after, login_device, login_edit, login_say, login_step, login_sure, type Account, type Page, type Row } from "../../term/LoginCommands.ts";
import type { Term } from "../../term/Term.ts";
import * as Screen from "../../ui/Screen.ts";
import { cli_lack, cli_rows, cli_then } from "../CliLogin.ts";
import { Copilot, SETTINGS } from "./Copilot.ts";
import { CopilotCli } from "./CopilotCli.ts";

// the GitHub Copilot plan as a provider: its accounts, each a folder of
// illi's, named by its GitHub login, told by its plan (one to sign in
// again said so); under them, a sign-in again for the one in use that
// needs it, and this illi's build of GitHub's CLI offered while no CLI is
// here (the user's own looked for as the page opens: CopilotCli.look)
function login_copilot_provider(t: Term): Page {
  void CopilotCli.look();
  const kept = () => config.config_accounts_read()?.["github-copilot"];
  const lapsed = (a: Folder) => Copilot.lapsed(Accounts.folder(config.ROOT, "github-copilot", a.id));
  const barred = (a: Folder) => Copilot.barred(Accounts.folder(config.ROOT, "github-copilot", a.id)) !== "";
  const accounts = (): Account[] => {
    const now = kept();
    return (now?.accounts ?? []).map((a) => ({ name: login_copilot_name(a), about: [a.plan, barred(a) ? "no Copilot from GitHub" : "", lapsed(a) ? "needs signing in again" : ""].filter(Boolean).join(" · "), use: now!.use === a.id, take: () => login_copilot_use(t, a), drop: (back) => login_copilot_drop(t, a, back) }));
  };
  const about = () => {
    const now  = kept();
    const a    = now?.accounts.find((a) => a.id === now.use);
    const lack = cli_lack(CopilotCli) || (a !== undefined && lapsed(a) ? " · needs signing in again" : a !== undefined && barred(a) ? " · no Copilot from GitHub" : "");
    return a === undefined ? "your GitHub Copilot plan, through GitHub's Copilot CLI" : "connected: " + login_copilot_name(a) + lack;
  };
  const more = (): Row[] => {
    const now = kept();
    const a   = now?.accounts.find((a) => a.id === now.use);
    const again: Row[] = a !== undefined && lapsed(a) ? [{ name: "Sign in again to " + login_copilot_name(a), about: "GitHub's page, with the code illi copies", enter: "sign in", pick: (back) => login_copilot_add(t, a.id, back) }] : [];
    return [...again, ...cli_rows(t, CopilotCli)];
  };
  return { name: "GitHub Copilot plan", vendor: "github-copilot", about, accounts, more, adds: "+ add another account", add: (back) => login_copilot_add(t, null, back), out: (back) => login_copilot_out(t, back) };
}

// an account's name: its GitHub login
function login_copilot_name(a: Folder): string {
  return a.email === "" ? "GitHub account " + a.id.replace(/^gh/, "") : a.email;
}

// a sign-in once GitHub's CLI is here (the user's own: CopilotCli.look),
// else once this illi's build is downloaded (asked, saying its size; one
// downloading by itself said, to wait for: cli_then), Esc on either back
// to `back`: an account's own folder's (`want`: signed in again), else a
// new one's
function login_copilot_add(t: Term, want: string | null, back: () => void): void {
  cli_then(t, CopilotCli, back, () => login_copilot_sign(t, want, back));
}

// a new folder of illi's, made now (readable by the user alone), so
// another illi adding one at the same moment makes the next: its id, none
// of those kept nor a folder left there. Thrown: it can't be made
function login_copilot_id(): string {
  const ids = (config.config_accounts_read()?.["github-copilot"]?.accounts ?? []).map((a) => a.id);
  fs.mkdirSync(path.join(config.ROOT, "copilot"), { recursive: true, mode: 0o700 });
  for (let n = 1; ; n++) {
    if (ids.includes("gh" + n)) {
      continue;
    }
    try {
      fs.mkdirSync(Accounts.folder(config.ROOT, "github-copilot", "gh" + n), { mode: 0o700 });
      return "gh" + n;
    } catch (err: any) {
      if (err?.code !== "EEXIST") {
        throw err;
      }
    }
  }
}

// a folder signed in (Copilot.signin): an account's own (`want`: signed in
// again), else a new one (login_copilot_id), in /login's popup
// (login_step: Esc stops it, back to `back`): it says it starts; as the
// CLI tells GitHub's page and its code, the code copied and the page
// opened (login_device); where the CLI can't keep its token in a
// keychain (none here: WSL, a server), asked whether to keep it in a file
// in the account's folder instead (no: the sign-in ends); signed in, the
// account kept (in place of another folder of the same GitHub login,
// gone) and in use, said in the chat; one GitHub gives no Copilot (its
// subscription ended, none ever) kept all the same, the popup saying why
// and where to turn Copilot on (login_copilot_barred); failed, said
// there, Try again. A new folder not kept in the end (the sign-in failed
// or was stopped) is gone; an account's own stays as it was
async function login_copilot_sign(t: Term, want: string | null, back: () => void): Promise<void> {
  const step = login_step(t, "Sign in to GitHub", back);
  let id = want;
  step.wait("Starting the sign-in with GitHub…");
  const ask  = (url: string, code: string) => login_device(t, step, url, code, "authorize GitHub Copilot CLI");
  const keep = () => new Promise<boolean>((done) => {
    const at = config.config_home(Accounts.folder(config.ROOT, "github-copilot", id!));
    step.question("There's no keychain here (as on WSL, or a server) for GitHub's CLI to keep its token in. It can keep it in a file in this account's folder instead: " + at + ", which only you can read.", ["Keep it in the folder", "Don't sign in"], ["as GitHub's CLI does with no keychain", "the sign-in stops, nothing kept"], (k) => {
      step.wait(k === 0 ? "Signing in to GitHub…" : "Stopping the sign-in…");
      done(k === 0);
    });
  });
  try {
    id ??= login_copilot_id();
    const who = await Copilot.signin(Accounts.folder(config.ROOT, "github-copilot", id), step.stop.signal, ask, keep);
    step.close();
    const a = { id, email: who.login, plan: who.plan, org: "" };
    const twins = (config.config_accounts_read()?.["github-copilot"]?.accounts ?? []).filter((o) => o.id !== a.id && o.email === a.email).map((o) => o.id);
    const done = login_edit(t, (store) => {
      const was = store["github-copilot"]?.accounts ?? [];
      return { ...store, "github-copilot": { use: a.id, accounts: [...was.filter((o) => o.id !== a.id && !twins.includes(o.id)), a] } };
    });
    if (done) {
      twins.forEach((o) => void login_copilot_forget(o, false));
      const name = login_copilot_name(a) + (a.plan === "" ? "" : " (" + a.plan + ")");
      if (who.lack !== "") {
        login_copilot_barred(t, name, who.lack, back);
      }
      login_after(t, "github-copilot", who.lack === "" ? "Signed in to your GitHub Copilot plan as " + name + ": illi runs on it now." : "Signed in to GitHub as " + name + ", but GitHub won't let it use Copilot yet: " + who.lack + ".");
    }
  } catch (err: any) {
    step.fail("Login failed: " + err.message + ".", () => login_copilot_add(t, want, back));
  } finally {
    if (id !== null && id !== want && !(config.config_accounts_read()?.["github-copilot"]?.accounts ?? []).some((a) => a.id === id)) {
      void login_copilot_forget(id, false);
    }
  }
}

// an account signed in that GitHub gives no Copilot, said in /login's
// popup: why (Copilot.lack), and that once Copilot is on there it runs,
// no sign-in again; its buttons open GitHub's Copilot page and copy its
// link; Esc back to `back`
function login_copilot_barred(t: Term, name: string, lack: string, back: () => void): void {
  const page = SETTINGS;
  login_say(t, "Signed in to GitHub", "Signed in as " + name + ", but GitHub won't let it use Copilot yet: " + lack + ".\n\nOnce Copilot is on there, illi runs on this account: no need to sign in again.", back, [
    { name: "Open the page", enter: "open GitHub's Copilot page", run: () => (browser_open(page) === null ? "No browser to open it here" : "Opened it in your browser") },
    { name: "Copy the link", enter: "copy its link", run: () => (Screen.screen_copy(page), "Copied the link") },
  ]);
}

// an account used from now on
function login_copilot_use(t: Term, a: Folder): void {
  if (login_edit(t, (store) => (store["github-copilot"]?.accounts.some((o) => o.id === a.id) ? { ...store, "github-copilot": { ...store["github-copilot"]!, use: a.id } } : null))) {
    login_after(t, "github-copilot", "GitHub Copilot plan now runs on " + login_copilot_name(a) + ".");
  }
}

// an account logged out (asked first, Esc back to `back`): its folder's
// CLI logged out and the folder gone; the next account in use in its
// place, none left: the plan let go
function login_copilot_drop(t: Term, a: Folder, back: () => void): void {
  const name = login_copilot_name(a);
  login_sure(t, "Log out of " + name + "?", "illi logs GitHub's CLI out of it and forgets its folder", () => {
    void (async () => {
      await login_copilot_forget(a.id, true);
      const done = login_edit(t, (store) => {
        const was = store["github-copilot"];
        if (was === undefined) {
          return store;
        }
        const rest = was.accounts.filter((o) => o.id !== a.id);
        const use  = was.use === a.id ? rest[0]?.id ?? "" : was.use;
        const { "github-copilot": _, ...others } = store;
        return rest.length === 0 ? others : { ...store, "github-copilot": { use, accounts: rest } };
      });
      if (done) {
        login_after(t, "github-copilot", "Logged out of " + name + ".");
      }
    })();
  }, back);
}

// an account's folder gone, its CLIs here ended and it logged out first
// where it signed in (`signed`; a logout that fails: the folder goes all
// the same; one that won't go logged, never thrown). Another terminal's
// CLIs of it take no call once the folder is made anew (its stamp:
// Copilot.take)
async function login_copilot_forget(id: string, signed: boolean): Promise<void> {
  const dir = Accounts.folder(config.ROOT, "github-copilot", id);
  if (dir === "") {
    return;
  }
  if (signed) {
    await Copilot.logout(dir);
  }
  Copilot.forget(dir);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err: any) {
    console.error("github-copilot: the folder " + dir + " couldn't be removed (" + (err?.code ?? "error") + ")");
  }
}

// the GitHub Copilot plan logged out (asked first, Esc back to `back`):
// each account's folder logged out and gone, the plan no longer offered
function login_copilot_out(t: Term, back: () => void): void {
  login_sure(t, "Log out of GitHub Copilot plan?", "illi logs each account out and stops offering the GitHub Copilot plan", () => {
    void (async () => {
      const ids = (config.config_accounts_read()?.["github-copilot"]?.accounts ?? []).map((a) => a.id);
      await Promise.all(ids.map((id) => login_copilot_forget(id, true)));
      if (login_edit(t, ({ "github-copilot": _, ...others }) => others)) {
        login_after(t, "github-copilot", "Logged out of the GitHub Copilot plan.");
      }
    })();
  }, back);
}

// the page, as /login lists it (Logins.ts)
export const PAGE = login_copilot_provider;
