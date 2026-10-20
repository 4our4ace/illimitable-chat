// Profile commands
// ================
// /profile: the profiles' picker (a new one made from it too), a switch
// (all this illi holds let go, and illi run again in its place, in the
// profile chosen), a new one (empty, with this one's setup, with this
// chat moved into it, or both), a rename, a delete (asked first), an
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

// the picker's row that makes a new profile
const NEW = "+ new profile";

// /profile: none opens the profiles' picker; new, rename, delete, export
// and import do theirs; else the profile named is switched to
export function term_profile(t: Term, arg: string): void | Promise<void> {
  const verb = arg.split(/\s+/)[0].toLowerCase();
  const rest = arg.slice(verb.length).trim();
  const VERBS: Record<string, (t: Term, rest: string) => void | Promise<void>> = {
    new    : term_profile_new,
    rename : term_profile_rename,
    delete : term_profile_delete,
    export : term_profile_export,
    import : term_profile_import,
  };
  if (arg === "") {
    return term_profile_pick(t);
  }
  return VERBS[verb] !== undefined ? VERBS[verb](t, rest) : term_profile_go(t, arg.toLowerCase());
}

// the profiles' picker, at the one running: each one and its folder (its
// end, if long), then a new one's row; Enter switches (on the new row:
// `/profile new ` in the input, to name it), Delete deletes the lit one
// (asked first)
export function term_profile_pick(t: Term): void {
  t.profs     = Profiles.profile_list(config.ROOT);
  const names = t.profs;
  const where = names.map((p) => term_home(Profiles.profile_dir(config.ROOT, p))).map((d) => (d.length <= 40 ? d : "…" + d.slice(-39)));
  const keys  = (k: number, key: string) => {
    if (key !== "Delete" || k >= names.length) {
      return false;
    }
    term_profile_delete(t, names[k]);
    return true;
  };
  const foot  = (k: number) => (k < names.length ? "Enter switch · Del delete" : "Enter name it");
  const pick  = (k: number) => (k < names.length ? void term_profile_go(t, names[k]) : term_profile_name(t));
  term_chooser(t, "Profile", [...names, NEW], [...where, "its own chat and settings"], names.indexOf(config.PROFILE), pick, { keys, foot });
}

// a new profile's name asked for: `/profile new ` in the input
export function term_profile_name(t: Term): void {
  Screen.ed_set(t.scr.ed, "/profile new ");
  t.scr.typed = true;
}

// a switch to profile `name`, only while Illi rests (a switch would cut
// its turn), as term_restart does it
export async function term_profile_go(t: Term, name: string): Promise<void> {
  t.profs = Profiles.profile_list(config.ROOT);
  if (name === config.PROFILE) {
    return term_note(t, "This is profile " + name + ".");
  }
  if (!t.profs.includes(name)) {
    return term_note(t, "No profile " + Paint.text_clean(name) + ". Profiles: " + t.profs.join(", ") + "; /profile new <name> makes one.");
  }
  if (term_profile_busy(t, "switch to " + name)) {
    return;
  }
  return term_restart(t, name);
}

// why a switch can't be now (said; true): from a pipe, or while Illi
// works (a switch never cuts a turn)
function term_profile_busy(t: Term, what: string): boolean {
  if (!t.scr.tty) {
    term_note(t, "A pipe runs in one profile: ILLI_PROFILE=<name> picks it.");
    return true;
  }
  if (View.view_running(t.v) || t.chat.busy) {
    term_note(t, "Illi is at work: " + what + " once it's done (Esc interrupts it). A switch never cuts a turn.");
    return true;
  }
  return false;
}

// illi run again in profile `name`: it is kept as the one used last, all
// this illi holds let go (term_leave), `step` done (a rename, a chat
// moved: what needs this one let go; if it fails, illi runs again where
// it was, saying why), and illi runs in its place, on the same terminal
// and folder; the API keys it took out of the environment go back in
async function term_restart(t: Term, name: string, step?: () => void): Promise<void> {
  await term_leave(t);
  let to = name;
  try {
    step?.();
  } catch (err: any) {
    process.stderr.write("illi: " + err.message + "\n");
    to = config.PROFILE;
  }
  Profiles.profile_keep(config.ROOT, to);
  const self = process.argv[1]?.startsWith("/$bunfs/") ? [] : [...process.execArgv, process.argv[1]];
  const env  = { ...config.config_env(), ILLI_PROFILE: to, ...(process.env.ILLI_DIR === undefined ? {} : { ILLI_DIR: config.ROOT }) };
  try {
    process.execve!(process.execPath, [process.execPath, ...self, ...process.argv.slice(2)], env);
  } catch (err: any) {
    process.stderr.write("illi: can't run again in profile " + to + ": " + err.message + "\n");
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

// /profile new <name> [--copy] [--move]: the profile made, then
// switched to; --copy: with this one's settings, agents, commands and
// skills; --move: this chat moved into it (this one starts with an empty
// chat). Neither given, a picker asks what comes along
function term_profile_new(t: Term, arg: string): void | Promise<void> {
  const words = arg.split(/\s+/).filter((w) => w !== "");
  const flags = words.filter((w) => w.startsWith("--"));
  const name  = words.find((w) => !w.startsWith("--"))?.toLowerCase() ?? "";
  const bad   = flags.find((f) => f !== "--copy" && f !== "--move");
  const why   = name === "" ? "Name it: /profile new <name>." : bad !== undefined ? "/profile new takes --copy and --move, not " + Paint.text_clean(bad) + "." : Profiles.profile_why(config.ROOT, name);
  if (why !== null) {
    return term_note(t, why);
  }
  if (flags.length > 0) {
    return term_profile_make(t, name, flags.includes("--copy"), flags.includes("--move"));
  }
  const here = config.PROFILE;
  const rows: Array<[string, string, boolean, boolean]> = [
    ["Empty",           "a fresh chat and settings",                        false, false],
    ["With this setup", here + "'s config, agents, commands, skills",       true,  false],
    ["With this chat",  "this chat moves there; " + here + " starts empty", false, true],
    ["With both",       "the setup copied, and this chat moved",            true,  true],
  ];
  term_chooser(t, "New profile " + name, rows.map((r) => r[0]), rows.map((r) => r[1]), -1, (k) => void term_profile_make(t, name, rows[k][2], rows[k][3]));
}

// a new profile made (copy: this one's setup), and switched to (move:
// with this chat, moved as this illi lets it go)
async function term_profile_make(t: Term, name: string, copy: boolean, move: boolean): Promise<void> {
  if (term_profile_busy(t, "make " + name)) {
    return;
  }
  Profiles.profile_new(config.ROOT, name, copy ? config.DIR : null);
  const dir = Profiles.profile_dir(config.ROOT, name);
  return term_restart(t, name, move ? () => Profiles.profile_move_chat(config.DIR, dir) : undefined);
}

// /profile rename [name] <new>: a profile (this one, or the one named)
// renamed; never the default (its folder is the root). This one's is
// done as illi runs again under its new name
function term_profile_rename(t: Term, arg: string): void | Promise<void> {
  const words = arg.split(/\s+/).filter((w) => w !== "").map((w) => w.toLowerCase());
  const [from, to] = words.length === 2 ? words : [config.PROFILE, words[0] ?? ""];
  t.profs = Profiles.profile_list(config.ROOT);
  const why =
    words.length === 0 || words.length > 2 ? "/profile rename <new> renames this one; /profile rename <name> <new>, another." :
    !t.profs.includes(from) ? "No profile " + Paint.text_clean(from) + ". Profiles: " + t.profs.join(", ") + "." :
    from === Profiles.DEFAULT ? "The default profile is Illi's own folder (" + term_home(config.ROOT) + ") and keeps its name." :
    Profiles.profile_why(config.ROOT, to);
  if (why !== null) {
    return term_note(t, why);
  }
  if (from !== config.PROFILE) {
    Profiles.profile_rename(config.ROOT, from, to);
    t.profs = Profiles.profile_list(config.ROOT);
    return term_note(t, "Renamed profile " + from + " to " + to + ".");
  }
  if (term_profile_busy(t, "rename it")) {
    return;
  }
  return term_restart(t, to, () => Profiles.profile_rename(config.ROOT, from, to));
}

// /profile delete <name>: a profile and all it holds gone, once the
// person says so in a picker; never the default, nor the one running
export function term_profile_delete(t: Term, arg: string): void {
  const name = arg.trim().toLowerCase();
  t.profs = Profiles.profile_list(config.ROOT);
  const why =
    name === "" ? "Which one? /profile delete <name>." :
    !t.profs.includes(name) ? "No profile " + Paint.text_clean(name) + ". Profiles: " + t.profs.join(", ") + "." :
    name === Profiles.DEFAULT ? "The default profile is Illi's own folder (" + term_home(config.ROOT) + ") and can't be deleted." :
    name === config.PROFILE ? "This is profile " + name + ": switch to another first (/profile)." :
    null;
  if (why !== null) {
    return term_note(t, why);
  }
  const gone = () => {
    Profiles.profile_delete(config.ROOT, name);
    t.profs = Profiles.profile_list(config.ROOT);
    term_note(t, "Deleted profile " + name + ".");
  };
  const about = ["", "its chat and setup, gone for good"];
  const foot  = () => "/profile export " + name + " keeps a copy first";
  term_chooser(t, "Delete profile " + name + "?", ["Keep it", "Delete it"], about, -1, (k) => (k === 1 ? gone() : term_note(t, "Kept profile " + name + ".")), { foot });
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
    term_note(t, "Imported profile " + name + " into " + term_home(Profiles.profile_dir(config.ROOT, name!)) + "." + (off.length === 0 ? "" : " Left off, as the archive is untrusted: " + off.join("; ") + ".") + " Its agents, commands, skills, RULES.md and chat came as they were, at work as soon as you switch to it: look at them first. /profile " + name + " switches to it.");
  } catch (err: any) {
    term_note(t, "Not imported. " + err.message);
  }
}
