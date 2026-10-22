#!/usr/bin/env bun
// Main
// ====
// `illi`: the chat in this folder (term/Term.ts), or, by its argument,
// `illi upgrade` (the latest in this one's place: for the one file, the
// update the chat runs once a day, config/Update.ts, run now; for a git
// clone, a pull), `illi version`, `illi help` (USAGE). The chat is
// imported only to run it, so an upgrade works whatever its settings
// say; a setting that won't do stops it with one line on why.

import * as fs from "node:fs";
import * as path from "node:path";
import { HERE, Update, VERSION } from "./config/Update.ts";

// the installer (install.sh), for an illi that is neither one file nor a
// clone
const INSTALLER = "https://raw.githubusercontent.com/4our4ace/illimitable-chat/main/install.sh";

const ARGS    = process.argv.slice(2);
const HELP    = ARGS.some((a) => ["help", "--help", "-h"].includes(a));
const ASKED   = ARGS.some((a) => ["version", "--version", "-v"].includes(a));
const UPGRADE = ARGS.includes("upgrade");
const ODD     = ARGS.find((a) => !["help", "--help", "-h", "version", "--version", "-v", "upgrade"].includes(a));

// an argument that means to sign in, which the chat does (/login)
const LOGIN = /^-*(login|logout|signin|auth)$/i;

const USAGE = `Usage: illi            the chat; its tools work in this folder
       illi upgrade    the latest release in this one's place, now
       illi version    this illi's version
       illi help       this
First, run illi in a project folder and type /login to sign in with
your ChatGPT plan (Plus or Pro); your Claude plan and API keys work too
(docs/providers.md). The chat and its settings are in ~/.illi
(ILLI_DIR); docs/config.md lists them. Other profiles' are in
~/.illi/profiles: illi opens the one used last (ILLI_PROFILE names
one). A new release installs itself, looked for once a day, and runs
from the next start (autoupdate). In the chat, /help lists every
command and key.`;

// `illi upgrade`: one file, the latest release installed in its place
// (Update.upgrade: checked, then the file replaced as a whole, so the one
// running goes on; a failed download changes nothing), each step said;
// from a git clone, a pull; the exit code
async function main_upgrade(): Promise<number> {
  console.log("illi " + VERSION + ": upgrading");
  if (HERE !== null) {
    return Update.upgrade(HERE);
  }
  const clone = path.dirname(import.meta.dir);
  if (fs.existsSync(path.join(clone, ".git"))) {
    return Bun.spawn(["git", "-C", clone, "pull", "--ff-only"], { stdio: ["inherit", "inherit", "inherit"] }).exited;
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
} else {
  await main_chat();
}

// the chat; a setting that won't do (Config.ts: "config: ...") or a chat
// that won't open (Store.ts: "chat: ...") said in one line, no trace, on
// the terminal (the log takes console's by then), and so is any other
// failure before the chat loads; one after, a crash (Term.ts term_crash:
// its trace to the log)
async function main_chat(): Promise<void> {
  let crash: ((err: unknown) => void) | null = null;
  try {
    const term = await import("./term/Term.ts");
    crash = term.term_crash;
    await term.term_start();
  } catch (err: any) {
    const why = String(err?.message ?? err);
    if (crash === null || why.startsWith("config: ") || why.startsWith("chat: ")) {
      process.stderr.write("illi: " + why + "\n");
      process.exit(1);
    }
    crash(err);
  }
}
