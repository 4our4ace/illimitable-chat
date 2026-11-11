// Uninstall
// =========
// `illi uninstall`: illi removed from this computer, as the user picks
// (asked on a terminal; --programs or --everything picks it for a
// script):
//
//   programs    illi itself (the one file the installer put in place:
//               Update.ts HERE) and the CLIs it downloaded for its
//               plans (each provider's programs: Google's Antigravity
//               CLI, GitHub's Copilot CLI); the chats, settings and
//               accounts stay in illi's folder, for an illi installed
//               again
//   everything  that, and illi's folder whole (ILLI_DIR, default
//               ~/.illi: every profile's chats, settings, keys and
//               accounts), each account of a plan's own program logged
//               out by it first (each provider's logout: its sign-in
//               gone, a keychain's too, which deleting the folder would
//               leave), asked once more, as the chats can't come back;
//               the CLIs that logged them out waited for till they
//               ended (each provider's close), so none writes the
//               folder anew as it goes
//
// Never while another illi runs (one holding a project's chat: Lock.ts),
// as it would write the folder anew. illi's folder goes whole only where
// it is illi's (it holds a chat, a config, a login or accounts) and isn't
// the home folder or one holding it; one ILLI_DIR names, only where illi
// made it (Profiles.ts MARK), else everything isn't offered. An illi run from its source (a
// clone) leaves the clone, saying so. What's not illi's stays: a
// project's own .illi folder, ~/.agents, the user's own Claude Code, agy
// and copilot, and what they keep (docs/config.md, Removing illi), but
// one sign-in: GitHub's CLI keeps a keychain's token by the GitHub
// login, so an account's logout takes it from the user's own copilot of
// that login too. Each step is said, then what's left; the exit code: 0
// removed, 1 not.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { MARK } from "./Profiles.ts";
import { HERE, VERSION } from "./Update.ts";

// Types
// =====

// what goes: the programs alone, or everything
export type Pick = "programs" | "everything";

// Constants
// =========

// what makes a folder look like illi's: one of these in it (Profiles.ts
// reads a root by the same), or its mark that illi made it (MARK)
const ROOTED = ["chat", "config.json", "login.json", "profile", "accounts.json", MARK];

// Uninstall
// =========

// `illi uninstall` and its arguments (--programs, --everything): the
// exit code
export async function uninstall(args: string[]): Promise<number> {
  const picked: Pick | null = args.includes("--everything") ? "everything" : args.includes("--programs") ? "programs" : null;
  if (args.includes("--everything") && args.includes("--programs")) {
    console.error("illi: uninstall takes --programs or --everything, not both");
    return 1;
  }
  delete process.env.ILLI_PROFILE;
  let parts: Awaited<ReturnType<typeof uninstall_load>>;
  try {
    parts = await uninstall_load();
  } catch (err: any) {
    const why = String(err?.message ?? err);
    console.error("illi: " + why + (why.startsWith("config: ") ? "\nFix that, then run illi uninstall again, or remove illi by hand: docs/config.md, Removing illi." : ""));
    return 1;
  }
  const { config, Lock, Providers, Accounts } = parts;
  const root = config.ROOT;
  console.log("illi " + VERSION + ": uninstalling");
  const busy = uninstall_dirs(root).reduce((n, dir) => n + Lock.others(dir), 0);
  if (busy > 0) {
    console.error("illi: illi is open in " + (busy === 1 ? "another terminal" : busy + " other terminals") + ": quit it there first (Ctrl+D), then run illi uninstall again.");
    return 1;
  }
  const programs = Providers.all().flatMap((p) => (p.programs?.() ?? []).filter((at) => fs.existsSync(at)).map((at) => ({ at, what: p.facts.row })));
  const whole    = uninstall_whole(root);
  const pick     = picked ?? (await uninstall_ask(root, programs.map((p) => p.at), whole));
  if (pick === null) {
    console.log("Nothing was removed.");
    return 1;
  }
  if (pick === "everything" && whole !== null) {
    console.error("illi: " + uninstall_show(root) + " isn't removed whole, as " + whole + ": nothing was removed. If all in it is illi's, delete it yourself; else delete illi's files there (docs/config.md, Removing illi).");
    return 1;
  }
  let ok = true;
  if (pick === "everything") {
    const store = config.config_accounts_read() ?? {};
    const outs = Providers.all().filter((p) => p.logout !== undefined && p.facts.accounts === "folders").flatMap((p) => ((store as any)[p.facts.id]?.accounts ?? []).map((a: { id: string; email: string }) => ({ p, a, dir: Accounts.folder(root, p.facts.id, a.id) }))).filter((o) => o.dir !== "" && fs.existsSync(o.dir));
    const said = await Promise.all(outs.map(async ({ p, a, dir }) => {
      const name = (a.email || "account " + a.id.replace(/^\D+/, "")) + " (" + p.facts.row + ")";
      const done = await p.logout!(dir).catch(() => false);
      return done ? "Logged out of " + name + "." : "Couldn't log out of " + name + ": its sign-in may stay in your system's keychain.";
    }));
    said.forEach((line) => console.log(line));
    await Promise.all(Providers.all().map((p) => p.close?.()));
    ok = uninstall_remove(root, "illi's folder: your chats, settings and accounts") && ok;
  } else {
    for (const { at, what } of programs) {
      ok = uninstall_remove(at, "the " + what + "'s CLI", !fs.statSync(at).isDirectory()) && ok;
    }
  }
  if (HERE !== null) {
    ok = uninstall_remove(HERE.exec, "illi") && ok;
  } else {
    console.log("This illi runs from its source in " + uninstall_show(path.resolve(import.meta.dir, "..", "..")) + ": delete that folder, and the illi on your PATH that starts it, yourself.");
  }
  if (!ok) {
    return 1;
  }
  const done = HERE !== null ? "illi is uninstalled." : "illi is uninstalled but for its source.";
  console.log(pick === "everything" || !fs.existsSync(root) ? done : done + " Your chats, settings and accounts are still in " + uninstall_show(root) + ": an illi installed again finds them, and deleting the folder removes them.");
  return 0;
}

// what the uninstall asks of illi: its settings (Config.ts: as it loads
// it reads config.json, a broken one thrown, saying which), the project
// locks, the providers, the accounts' folders; loaded once ILLI_PROFILE
// is let go, so a profile gone never stops it
async function uninstall_load() {
  const config = await import("./Config.ts");
  const { Lock } = await import("../chat/Lock.ts");
  const { Providers } = await import("../providers/Providers.ts");
  const { Accounts } = await import("./Accounts.ts");
  return { config, Lock, Providers, Accounts };
}

// the folders whose projects an illi may hold: the root (the default
// profile's) and each other profile's
function uninstall_dirs(root: string): string[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(path.join(root, "profiles"));
  } catch {}
  return [root, ...names.map((n) => path.join(root, "profiles", n))];
}

// the pick asked on a terminal: what each takes said, then a second ask
// for everything (each answer the next line typed, one typed ahead kept);
// everything not offered where illi's folder isn't removed whole (whole:
// why), said so; null: stopped (Enter, the input ended, or no terminal:
// said how to pick)
async function uninstall_ask(root: string, programs: string[], whole: string | null): Promise<Pick | null> {
  if (!process.stdin.isTTY) {
    console.error("illi: uninstall asks what to remove on a terminal; here, run illi uninstall --programs (illi and the CLIs it downloaded) or --everything (also your chats, settings and accounts)");
    return null;
  }
  const home = uninstall_show(root);
  const size = (paths: string[]) => uninstall_mb(paths.reduce((n, at) => n + uninstall_size(at), 0) + (HERE === null ? 0 : uninstall_size(HERE.exec)));
  const kept = uninstall_size(root) - programs.reduce((n, at) => n + uninstall_size(at), 0);
  const rl    = readline.createInterface({ input: process.stdin, output: process.stdout });
  const lines = rl[Symbol.asyncIterator]();
  const ask   = async (q: string) => {
    process.stdout.write(q);
    const got = await lines.next();
    return got.done ? "" : String(got.value).trim();
  };
  try {
    console.log("");
    console.log("  1  illi and the CLIs it downloaded (" + size(programs) + "). Your chats, settings and accounts");
    console.log("     stay in " + home + " (" + uninstall_mb(kept) + "), for an illi you install again.");
    if (whole === null) {
      console.log("  2  Everything: also your chats, settings and accounts in " + home + ", every profile's,");
      console.log("     each account logged out first.");
    } else {
      console.log("  Not everything: " + home + " isn't removed whole, as " + whole + ".");
      console.log("  If all in it is illi's, delete it yourself (docs/config.md, Removing illi).");
    }
    console.log("");
    const k = await ask(whole === null ? "Which? 1 or 2 (Enter stops): " : "1 to go on (Enter stops): ");
    if (k === "1") {
      return "programs";
    }
    if (k !== "2" || whole !== null) {
      return null;
    }
    const sure = (await ask("Your chats can't come back once they're gone (/profile's export, Ctrl+E, copies them first).\nType yes to remove everything: ")).toLowerCase();
    return sure === "yes" ? "everything" : null;
  } finally {
    rl.close();
  }
}

// why illi's folder isn't removed whole (null: it may be): it's the
// home folder or holds it, or it isn't illi's; one ILLI_DIR names (not
// ~/.illi) only where illi made it (its MARK: Config.ts config_private),
// as one that was there before may hold the user's own files beside
// illi's
function uninstall_whole(root: string): string | null {
  const at   = path.resolve(root);
  const home = path.resolve(os.homedir());
  if (at === path.parse(at).root || at === home || home.startsWith(at + path.sep)) {
    return "it's your home folder, or holds it";
  }
  if (!fs.existsSync(at)) {
    return null;
  }
  if (!ROOTED.some((part) => fs.existsSync(path.join(at, part)))) {
    return "it doesn't look like illi's folder";
  }
  if (at !== path.join(home, ".illi") && !fs.existsSync(path.join(at, MARK))) {
    return "illi didn't make it (ILLI_DIR names a folder that was there before), so it may hold files that aren't illi's";
  }
  return null;
}

// a file or folder removed, said with what it was and its size (none
// there, or `quiet`, as a CLI's version file beside its downloads: not
// said; a CLI just ended writing in it meanwhile: tried again); false: it
// couldn't be, said why
function uninstall_remove(at: string, what: string, quiet = false): boolean {
  if (!fs.existsSync(at)) {
    return true;
  }
  const mb = uninstall_mb(uninstall_size(at));
  try {
    fs.rmSync(at, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    if (!quiet) {
      console.log("Removed " + uninstall_show(at) + " (" + what + ", " + mb + ").");
    }
    return true;
  } catch (err: any) {
    console.error("illi: " + uninstall_show(at) + " couldn't be removed (" + (err?.code ?? err?.message ?? "error") + ")" + (err?.code === "EACCES" || err?.code === "EPERM" ? ": it isn't yours to remove (as with sudo into /usr/local/bin); remove it yourself: sudo rm -r " + at : ""));
    return false;
  }
}

// a file's or folder's size in bytes, its links not followed (one that
// won't read: 0)
function uninstall_size(at: string): number {
  try {
    const st = fs.lstatSync(at);
    return st.isDirectory() ? fs.readdirSync(at).reduce((n, f) => n + uninstall_size(path.join(at, f)), 0) : st.size;
  } catch {
    return 0;
  }
}

// a size said in MB
function uninstall_mb(bytes: number): string {
  return Math.round(bytes / 1e6) + " MB";
}

// a path said with the home folder as ~
function uninstall_show(at: string): string {
  const home = os.homedir();
  return at === home ? "~" : at.startsWith(home + path.sep) ? "~" + at.slice(home.length) : at;
}
