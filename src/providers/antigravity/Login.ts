// Google AI plan's /login page
// ============================
// antigravity in /login (LoginCommands.ts): its accounts, each a folder of
// illi's own (Antigravity.ts), signed in by Google's Antigravity CLI's own
// sign-in, in /login's popup: illi opens Google's page (the CLI tells its
// link), the person signs in there and pastes the code the page shows
// into illi, shown as dots, which gives it to the CLI (Esc stops the
// sign-in); the
// CLI keeps the sign-in in the account's folder, made as the sign-in
// starts so two terminals never share one, and gone again if the sign-in
// ends without it kept. An account whose sign-in ran out (or that Google's
// old agent signed in, before illi ran the CLI) signs in again in its own
// folder, from a row under the accounts. The CLI is the user's own `agy`
// (1.5.2 or later), else the build this illi is pinned to (Agy.ts): with
// none here, adding an account first offers to download it, saying how
// big it is (Esc stops the download too); with another version here (an
// older illi's), the page says it needs an update, and a row under the
// accounts offers it (CliLogin.ts, as every CLI's). Google's CLI tells
// no email, so an account is named by its number and its plan. Logging one out logs its folder's CLI out
// and removes the folder. Accounts are never switched but here: illi
// doesn't rotate them.

import * as fs from "node:fs";
import * as path from "node:path";
import { Accounts, type Folder } from "../../config/Accounts.ts";
import * as config from "../../config/Config.ts";
import { login_after, login_edit, login_paste, login_step, login_sure, type Account, type Page, type Row } from "../../term/LoginCommands.ts";
import type { Term } from "../../term/Term.ts";
import { Antigravity } from "./Antigravity.ts";
import { cli_lack, cli_rows, cli_then } from "../CliLogin.ts";
import { Agy } from "./Agy.ts";

// the Google AI plan as a provider: its accounts, each a folder of
// illi's, named by its number, told by the plan the CLI named (one to
// sign in again said so); under them, a sign-in again for the one in use
// that needs it, and this illi's build of Google's CLI offered while no
// CLI is here (the user's own looked for as the page opens: Agy.look)
function login_agy_provider(t: Term): Page {
  void Agy.look();
  const kept = () => config.config_accounts_read()?.antigravity;
  const lapsed = (a: Folder) => Antigravity.lapsed(Accounts.folder(config.ROOT, "antigravity", a.id));
  const accounts = (): Account[] => {
    const now = kept();
    return (now?.accounts ?? []).map((a) => ({ name: login_agy_name(a), about: [a.plan, lapsed(a) ? "needs signing in again" : ""].filter(Boolean).join(" · "), use: now!.use === a.id, take: () => login_agy_use(t, a), drop: (back) => login_agy_drop(t, a, back) }));
  };
  const about = () => {
    const now = kept();
    const a   = now?.accounts.find((a) => a.id === now.use);
    const lack = cli_lack(Agy) || (a !== undefined && lapsed(a) ? " · needs signing in again" : "");
    return a === undefined ? "your Google AI plan, through Google's Antigravity CLI" : "connected: " + login_agy_name(a) + lack;
  };
  const more = (): Row[] => {
    const now = kept();
    const a   = now?.accounts.find((a) => a.id === now.use);
    const again: Row[] = a !== undefined && lapsed(a) ? [{ name: "Sign in again to " + login_agy_name(a), about: "Google's page, then the code it shows", enter: "sign in", pick: (back) => login_agy_again(t, a.id, back) }] : [];
    return [...again, ...cli_rows(t, Agy)];
  };
  return { name: "Google AI plan", vendor: "antigravity", about, accounts, more, adds: "+ add another account", add: (back) => login_agy_add(t, back), out: (back) => login_agy_out(t, back) };
}

// an account's name: its number (Google's CLI tells no email)
function login_agy_name(a: Folder): string {
  return "Google account " + a.id.replace(/^g/, "");
}

// an account more: Google's CLI found (the user's own: Agy.look), else
// this illi's build downloaded first (asked, saying its size; one
// downloading by itself said, to wait for: cli_then), then a sign-in in a
// new folder
function login_agy_add(t: Term, back: () => void): void {
  cli_then(t, Agy, back, () => login_agy_sign(t, null, back));
}

// an account's sign-in again, in its own folder (its sign-in ran out, or
// Google's old agent made it): as one more's, Google's CLI first
function login_agy_again(t: Term, id: string, back: () => void): void {
  cli_then(t, Agy, back, () => login_agy_sign(t, id, back));
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

// a folder signed in (Antigravity.signin): an account's own (`want`:
// signed in again), else a new one (login_agy_id), in /login's popup
// (login_step: Esc stops it, back to `back`): it says it starts; as the
// CLI tells Google's page, the page opened and the code it shows asked
// for, shown as dots (login_paste; asked again, said so), given the CLI,
// the step saying it signs in meanwhile; signed in, the account kept and
// in use, said in the chat; failed, said there, Try again. A new folder
// not kept in the end (the sign-in failed or was stopped) is gone; an
// account's own stays as it was
async function login_agy_sign(t: Term, want: string | null, back: () => void): Promise<void> {
  const step = login_step(t, "Sign in with Google", back);
  let id = want;
  let asked = 0;
  let give = (_code: string) => {};
  step.wait("Starting the sign-in with Google…");
  const ask = (url: string) => login_paste(t, step, url, "with Google", (code) => {
    step.wait("Signing in with Google…");
    give(code);
    return null;
  }, false, asked++ > 0);
  try {
    id ??= login_agy_id();
    const run = Antigravity.signin(Accounts.folder(config.ROOT, "antigravity", id), step.stop.signal, ask);
    give = run.give;
    const plan = await run.done;
    step.close();
    const a = { id, email: "", plan, org: "" };
    const done = login_edit(t, (store) => {
      const was = store.antigravity?.accounts ?? [];
      return { ...store, antigravity: { use: a.id, accounts: [...was.filter((o) => o.id !== a.id), a] } };
    });
    if (done) {
      login_after(t, "antigravity", "Signed in to your Google AI plan (" + login_agy_name(a) + (plan === "" ? "" : ", " + plan) + "): illi runs on it now.");
    }
  } catch (err: any) {
    step.fail("Login failed: " + err.message + ".", () => cli_then(t, Agy, back, () => login_agy_sign(t, want, back)));
  } finally {
    if (id !== null && id !== want && !(config.config_accounts_read()?.antigravity?.accounts ?? []).some((a) => a.id === id)) {
      void login_agy_forget(id, false);
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
// CLI logged out and the folder gone; the next account in use in its
// place, none left: the plan let go
function login_agy_drop(t: Term, a: Folder, back: () => void): void {
  const name = login_agy_name(a);
  login_sure(t, "Log out of " + name + "?", "illi logs Google's CLI out of it and forgets its folder", () => {
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

// an account's folder gone, its CLIs here ended and it logged out first
// where it signed in (a logout that fails: the folder goes all the same;
// one that won't go logged, never thrown). Another terminal's CLIs of it
// take no call once the folder is made anew (its stamp: Antigravity.take)
async function login_agy_forget(id: string, signed: boolean): Promise<void> {
  const dir = Accounts.folder(config.ROOT, "antigravity", id);
  if (dir === "") {
    return;
  }
  Antigravity.forget(dir);
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
// Google's CLI stays downloaded
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
