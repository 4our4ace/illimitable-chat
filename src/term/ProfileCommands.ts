// Profile commands
// ================
// /profile: the profiles' picker, a switch (all this illi holds let go,
// and illi run again in its place, in the profile chosen), a new one, an
// export and an import (Profiles.ts does the files).

import * as fs from "node:fs";
import * as path from "node:path";
import { term_file, term_home, term_path } from "./Attach.ts";
import { Chat } from "../chat/Chat.ts";
import { term_chooser } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { Disk } from "../chat/Disk.ts";
import { Machine } from "../tools/Machine.ts";
import { Mcp } from "../tools/Mcp.ts";
import { term_note } from "./Notices.ts";
import * as Paint from "../ui/Paint.ts";
import * as Profiles from "../config/Profiles.ts";
import * as Screen from "../ui/Screen.ts";
import type { Term } from "./Term.ts";
import * as View from "../ui/View.ts";

// how long a profile's switch waits for the MCP servers to end (ms)
const LEAVE = 2000;

// /profile: none opens the profiles' picker; new, export and import do
// theirs; else the profile named is switched to
export function term_profile(t: Term, arg: string): void | Promise<void> {
  const verb = arg.split(/\s+/)[0].toLowerCase();
  const rest = arg.slice(verb.length).trim();
  if (arg === "") {
    return term_profile_pick(t);
  }
  return verb === "new" ? term_profile_new(t, rest) : verb === "export" ? term_profile_export(t, rest) : verb === "import" ? term_profile_import(t, rest) : term_profile_go(t, arg.toLowerCase());
}

// the profiles' picker, at the one running: each one and its folder (its
// end, if long)
export function term_profile_pick(t: Term): void {
  t.profs = Profiles.profile_list(config.ROOT);
  if (t.profs.length < 2) {
    return term_note(t, "Only the default profile so far (" + term_home(config.ROOT) + "): /profile new <name> makes another, with its own chat and settings.");
  }
  const names = t.profs;
  const where = names.map((p) => term_home(Profiles.profile_dir(config.ROOT, p))).map((d) => (d.length <= 40 ? d : "…" + d.slice(-39)));
  term_chooser(t, "Profile", names, where, names.indexOf(config.PROFILE), (k) => void term_profile_go(t, names[k]));
}

// a switch to profile `name`, only while Illi rests (a switch would cut
// its turn): it is kept as the one used last, all this illi holds let go
// (term_leave), and illi runs again in its place, on the same terminal
// and folder, in that profile; the API keys it took out of the
// environment go back in for it
export async function term_profile_go(t: Term, name: string): Promise<void> {
  t.profs = Profiles.profile_list(config.ROOT);
  if (name === config.PROFILE) {
    return term_note(t, "This is profile " + name + ".");
  }
  if (!t.profs.includes(name)) {
    return term_note(t, "No profile " + Paint.text_clean(name) + ". Profiles: " + t.profs.join(", ") + "; /profile new <name> makes one.");
  }
  if (!t.scr.tty) {
    return term_note(t, "A pipe runs in one profile: ILLI_PROFILE=" + name + " picks it.");
  }
  if (View.view_running(t.v) || t.chat.busy) {
    return term_note(t, "Illi is at work: switch to " + name + " once it's done (Esc interrupts it). A switch never cuts a turn.");
  }
  Profiles.profile_keep(config.ROOT, name);
  await term_leave(t);
  const self = process.argv[1]?.startsWith("/$bunfs/") ? [] : [...process.execArgv, process.argv[1]];
  const env  = { ...config.config_env(), ILLI_PROFILE: name, ...(process.env.ILLI_DIR === undefined ? {} : { ILLI_DIR: config.ROOT }) };
  try {
    process.execve!(process.execPath, [process.execPath, ...self, ...process.argv.slice(2)], env);
  } catch (err: any) {
    process.stderr.write("illi: can't run again in profile " + name + ": " + err.message + "\n");
    process.exit(1);
  }
}

// all this illi holds let go, as a quit does, but waited on: the device
// login let go, the chat stopped (what it cut goes on at its next start),
// the agents' processes and the MCP servers ended, every write flushed,
// the lock released, the terminal as it was
async function term_leave(t: Term): Promise<void> {
  t.login?.abort();
  t.v.ws?.close(View.QUIT);
  Chat.close(t.chat);
  Machine.end();
  await Promise.race([Mcp.stop(), Bun.sleep(LEAVE)]);
  await Disk.end();
  Chat.unlock();
  await Screen.screen_leave(t.scr);
}

// /profile new <name> [--copy]: the profile made (--copy: with this one's
// settings, agents, commands and skills), then switched to
function term_profile_new(t: Term, arg: string): void | Promise<void> {
  const words = arg.split(/\s+/).filter((w) => w !== "");
  const copy  = words.includes("--copy");
  const name  = words.find((w) => w !== "--copy")?.toLowerCase() ?? "";
  const why   = name === "" ? "Name it: /profile new <name> [--copy]." : Profiles.profile_why(config.ROOT, name);
  if (why !== null) {
    return term_note(t, why);
  }
  Profiles.profile_new(config.ROOT, name, copy ? config.DIR : null);
  t.profs = Profiles.profile_list(config.ROOT);
  term_note(t, "Made profile " + name + " in " + term_home(Profiles.profile_dir(config.ROOT, name)) + (copy ? ", with this one's settings, agents, commands and skills." : "."));
  return term_profile_go(t, name);
}

// /profile export [name] [file]: a profile (this one, or the one named)
// as one archive, at file (a folder: in it) or ./illi-profile-<name>.tar.gz,
// never over a file there; this one's chat flushed first
async function term_profile_export(t: Term, arg: string): Promise<void> {
  const first = arg.split(/\s+/)[0].toLowerCase();
  t.profs     = Profiles.profile_list(config.ROOT);
  const name  = t.profs.includes(first) ? first : config.PROFILE;
  const typed = name === first ? arg.slice(first.length).trim() : arg;
  const named = "illi-profile-" + name + ".tar.gz";
  const given = term_path(typed);
  const file  = given === "" ? path.resolve(named) : fs.existsSync(given) && fs.statSync(given).isDirectory() ? path.join(given, named) : given;
  if (name !== first && Profiles.NAME.test(first) && !/[./]/.test(arg)) {
    return term_note(t, "No profile " + first + ". Profiles: " + t.profs.join(", ") + "; a file to write to has a . or a / in it.");
  }
  if (fs.existsSync(file)) {
    return term_note(t, "Not exported: " + term_home(file) + " is there already. Move it away, or name another file.");
  }
  try {
    if (name === config.PROFILE) {
      await Disk.synced();
    }
    const cut = await Profiles.profile_export(config.ROOT, name, file);
    term_note(t, "Profile " + name + " is in " + term_home(file) + ": its chat and settings, no login or lock" + (cut === 0 ? "." : "; " + cut + " secret" + (cut === 1 ? "" : "s") + " left out of its config.") + " /profile import brings it in.");
  } catch (err: any) {
    term_note(t, "Not exported. " + err.message);
  }
}

// /profile import <file> [name]: an archive in as a new profile, named as
// given or by its file; what it left out said, and what came with it
async function term_profile_import(t: Term, arg: string): Promise<void> {
  const last  = arg.split(/\s+/).at(-1) ?? "";
  const whole = term_file(arg);
  const file  = whole ?? term_file(arg.slice(0, arg.length - last.length).trim());
  const name  = whole !== null ? Profiles.profile_named(whole) : last.toLowerCase();
  if (file === null) {
    return term_note(t, arg === "" ? "Which archive? /profile import <file> [name]." : "No file " + Paint.text_clean(arg) + ".");
  }
  const why = name === null ? "" : Profiles.profile_why(config.ROOT, name);
  if (why !== null) {
    return term_note(t, (why + (whole === null ? "" : " Name it: /profile import " + arg + " <name>.")).trim());
  }
  try {
    const got = await Profiles.profile_import(config.ROOT, file, name!);
    const off = [
      ...(got.keys.length === 0 ? [] : ["its config's " + got.keys.join(", ") + " (they run a command or read a file here)"]),
      ...(got.servers === 0 ? [] : [got.servers + " MCP server" + (got.servers === 1 ? "" : "s") + ", now \"disabled\": true in its mcp.json"]),
    ];
    t.profs = Profiles.profile_list(config.ROOT);
    term_note(t, "Imported profile " + name + " into " + term_home(Profiles.profile_dir(config.ROOT, name!)) + "." + (off.length === 0 ? "" : " Left off, as the archive is untrusted: " + off.join("; ") + ".") + " Its agents, commands, skills and chat came as they were, at work as soon as you switch to it: look at them first. /profile " + name + " switches to it.");
  } catch (err: any) {
    term_note(t, "Not imported. " + err.message);
  }
}
