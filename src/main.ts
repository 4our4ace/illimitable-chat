#!/usr/bin/env -S bun --no-env-file --config=/dev/null
// Main
// ====
// `illi`: the chat in this folder (term/Term.ts; on a terminal, under a
// window, term/Window.ts, which runs each profile's chat on a PTY of its
// own, so a switch leaves the one before running), or, by its argument,
// `illi upgrade` (the latest in this one's place: for the one file, the
// update the chat looks for as it starts, config/Update.ts, run now; for
// a git clone, a pull), `illi uninstall` (illi and what it downloaded
// removed, the chats too if the user picks: config/Uninstall.ts),
// `illi version`, `illi help` (USAGE). The chat is imported only to run
// it, so an upgrade works whatever its settings say; a setting that
// won't do stops it with one line on why.
//
// Bun reads a bunfig.toml (its preload: code run before this) and a .env
// (variables, an ILLI_* one a setting) from the folder it starts in,
// which is the project's: a repository's own files would run as the
// user, before any trust is asked. So illi runs with neither: from the
// source by the line above (run as a program: `bun src/main.ts` passes
// no flags), the one file built without them (package.json's build,
// release.yml, install.sh); illi's own restarts keep them
// (process.execArgv: Window.ts, ProfileCommands.ts).

import * as fs from "node:fs";
import * as path from "node:path";
import { Run } from "./config/Run.ts";
import { HERE, Update, VERSION } from "./config/Update.ts";
import { Vendors } from "./providers/Vendors.ts";

// the installer (install.sh), for an illi that is neither one file nor a
// clone
const INSTALLER = "https://raw.githubusercontent.com/4our4ace/illimitable-chat/main/install.sh";

const ARGS      = process.argv.slice(2);
const HELP      = ARGS.some((a) => ["help", "--help", "-h"].includes(a));
const ASKED     = ARGS.some((a) => ["version", "--version", "-v"].includes(a));
const UPGRADE   = ARGS.includes("upgrade");
const UNINSTALL = ARGS[0] === "uninstall";
const ODD       = ARGS.find((a, k) => !["help", "--help", "-h", "version", "--version", "-v", "upgrade", ...(UNINSTALL ? ["uninstall", "--programs", "--everything"] : [])].includes(a) || (a === "uninstall" && k > 0));

// an argument that means to sign in, which the chat does (/login)
const LOGIN = /^-*(login|logout|signin|auth)$/i;

const USAGE = `Usage: illi            the chat; its tools work in this folder
       illi upgrade    the latest release in this one's place, now
       illi uninstall  illi and the CLIs it downloaded removed; it asks
                       whether your chats, settings and accounts go too
                       (--programs: they stay; --everything: they go)
       illi version    this illi's version
       illi help       this
First, run illi in a project folder and type /login to connect
${Vendors.ways()} (docs/providers.md). The chat and its settings are in ~/.illi
(ILLI_DIR); docs/config.md lists them. Other profiles' are in
~/.illi/profiles: illi opens a project in the one used last there, a
new one in the one used last anywhere (ILLI_PROFILE names one). A new
release installs itself, looked for as illi starts, and runs from the
next start (autoupdate). In the chat, /help lists every command and key.`;

// `illi upgrade`: one file, the latest release installed in its place
// (Update.upgrade: checked, then the file replaced as a whole, so the one
// running goes on; a failed download changes nothing), each step said;
// from a git clone, a pull (git from PATH's absolute folders alone:
// Run.own_path); the exit code
async function main_upgrade(): Promise<number> {
  console.log("illi " + VERSION + ": upgrading");
  if (HERE !== null) {
    return Update.upgrade(HERE);
  }
  const clone = path.dirname(import.meta.dir);
  if (fs.existsSync(path.join(clone, ".git"))) {
    return Bun.spawn(["git", "-C", clone, "pull", "--ff-only"], { env: { ...process.env, PATH: Run.own_path() }, stdio: ["inherit", "inherit", "inherit"] }).exited;
  }
  console.error("illi: " + clone + " is no git clone: install the latest with\n  curl -fsSL " + INSTALLER + " | bash");
  return 1;
}

if (HELP || ODD !== undefined) {
  if (ODD !== undefined) {
    console.error("illi: unknown argument " + ODD + "." + (LOGIN.test(ODD) ? " Sign in inside the chat: run illi, then type /login." : "") + "\n\n" + USAGE);
    process.exit(1);
  }
  console.log(USAGE);
} else if (ASKED) {
  // this line, exactly, is what an update checks a new file by before
  // putting it in place (Update.install): it must stay so, and print
  // before anything reads a setting
  console.log("illi " + VERSION);
} else if (UPGRADE) {
  process.exit(await main_upgrade());
} else if (UNINSTALL) {
  process.exit(await (await import("./config/Uninstall.ts")).uninstall(ARGS.slice(1)));
} else if (main_windowed()) {
  (await import("./term/Window.ts")).window_run();
} else {
  await main_chat();
}

// whether the chat runs under a window: on a terminal (its input and
// output), where Bun makes PTYs (not on Windows), unless this is a
// window's member already (ILLI_WINDOW; any other value, as `off`, runs
// the chat alone)
function main_windowed(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true && process.platform !== "win32" && typeof Bun.Terminal === "function" && process.env.ILLI_WINDOW === undefined;
}

// the chat; a setting that won't do (Config.ts: "config: ...") or a chat
// that won't open (Store.ts: "chat: ...") said in one line, no trace, on
// the terminal (the log takes console's by then; once the screen is up,
// as illi has left it: Term.ts term_after), and so is any other failure
// before the chat loads; one after, a crash (Term.ts term_crash: its
// trace to the log)
async function main_chat(): Promise<void> {
  let term: typeof import("./term/Term.ts") | null = null;
  try {
    term = await import("./term/Term.ts");
    await term.term_start();
  } catch (err: any) {
    const why = String(err?.message ?? err);
    if (term === null || why.startsWith("config: ") || why.startsWith("chat: ")) {
      if (term === null) {
        process.stderr.write("illi: " + why + "\n");
      } else {
        term.term_after("illi: " + why);
      }
      process.exit(1);
    }
    term.term_crash(err);
  }
}
