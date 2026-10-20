#!/usr/bin/env bun
// Main
// ====
// `illi`: the chat in this folder (term/Term.ts), or, by its argument,
// `illi upgrade` (the latest in this one's place), `illi version`, `illi
// help` (USAGE). The chat is imported only to run it, so an upgrade
// works whatever its settings say.

import * as fs from "node:fs";
import * as path from "node:path";
import pkg from "../package.json" with { type: "json" };

// this illi's version
const VERSION = pkg.version;

// whether this illi is one file (bun build --compile: the installer's),
// not run by bun from its source
const COMPILED = /\$bunfs|~BUN/.test(import.meta.path);

// the installer (install.sh), which `illi upgrade` runs again
const INSTALLER = "https://raw.githubusercontent.com/4our4ace/illimitable-chat/main/install.sh";

const ARGS    = process.argv.slice(2);
const HELP    = ARGS.some((a) => ["help", "--help", "-h"].includes(a));
const ASKED   = ARGS.some((a) => ["version", "--version", "-v"].includes(a));
const UPGRADE = ARGS.includes("upgrade");
const ODD     = ARGS.find((a) => !["help", "--help", "-h", "version", "--version", "-v", "upgrade"].includes(a));

const USAGE = `Usage: illi            the chat; its tools work in this folder
       illi upgrade    the latest release in this one's place
       illi version    this illi's version
       illi help       this
The chat and its settings are in ~/.illi (ILLI_DIR); the README lists
them. Other profiles' are in ~/.illi/profiles: illi opens the one used
last (ILLI_PROFILE names one). In the chat, /help lists every command and
key.`;

// `illi upgrade`: one file, the installer run again into its folder (the
// file replaced as a whole, so the one running goes on); from a git
// clone, a pull; the exit code
async function main_upgrade(): Promise<number> {
  const run = (cmd: string[], env = process.env) => Bun.spawn(cmd, { env, stdio: ["inherit", "inherit", "inherit"] }).exited;
  console.log("illi " + VERSION + ": upgrading");
  if (COMPILED) {
    return run(["bash", "-c", "curl -fsSL " + INSTALLER + " | bash"], { ...process.env, ILLI_INSTALL: path.dirname(process.execPath) });
  }
  const clone = path.dirname(import.meta.dir);
  if (fs.existsSync(path.join(clone, ".git"))) {
    return run(["git", "-C", clone, "pull", "--ff-only"]);
  }
  console.error("illi: " + clone + " is no git clone: install the latest with\n  curl -fsSL " + INSTALLER + " | bash");
  return 1;
}

if (HELP || ODD !== undefined) {
  if (ODD !== undefined) {
    console.error("illi: no argument " + ODD + ".\n\n" + USAGE);
    process.exit(1);
  }
  console.log(USAGE);
} else if (ASKED) {
  console.log("illi " + VERSION);
} else if (UPGRADE) {
  process.exit(await main_upgrade());
} else {
  const { term_start } = await import("./term/Term.ts");
  await term_start();
}
