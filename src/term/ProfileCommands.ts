// Profile commands
// ================
// /profile: the profiles' picker, where all a profile takes is done: Enter
// switches, Ctrl+R renames, Ctrl+E exports, Delete deletes (asked first);
// its last rows make a new one (named, then with a fresh chat or this one
// moved into it; the global setup its own) and bring one in from an
// archive. /profile <name> switches at once. On a terminal, illi runs
// under a window (Window.ts): a switch, whatever runs, hides this illi
// and shows the profile chosen (open in the window already, as it was
// left; else started), and this one runs on, hidden, till the window
// closes or illi quits (Member.ts). Alone (ILLI_WINDOW=off), a switch
// lets all this illi holds go and runs illi again in its place, in the
// profile chosen, never while it works. A profile open in the window
// can't be renamed or deleted (its illi holds its folder), nor one open
// in another terminal. Profiles.ts does the files.

import * as fs from "node:fs";
import * as path from "node:path";
import { term_file } from "./Attach.ts";
import { Chat } from "../chat/Chat.ts";
import { Lock } from "../chat/Lock.ts";
import { term_ask, term_chooser, term_question } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { Disk } from "../chat/Disk.ts";
import { Machine } from "../tools/Machine.ts";
import { WIN, member_env, member_hide, member_others } from "./Member.ts";
import { Mcp } from "../tools/Mcp.ts";
import { term_note } from "./Notices.ts";
import { Update } from "../config/Update.ts";
import * as Paint from "../ui/Paint.ts";
import { Plugins } from "../config/Plugins.ts";
import * as Profiles from "../config/Profiles.ts";
import { Run } from "../config/Run.ts";
import * as Screen from "../ui/Screen.ts";
import { status_end } from "./Status.ts";
import { term_after, type Term } from "./Term.ts";
import * as View from "../ui/View.ts";

// how long a profile's switch waits for the MCP servers to end (ms)
const LEAVE = 2000;

// the picker's rows that make a new profile, and bring one in
const NEW    = "+ new profile";
const IMPORT = "+ import a profile";

// /profile: none opens the profiles' picker; a name switches to it
export function term_profile(t: Term, arg: string): void | Promise<void> {
  return arg === "" ? term_profile_pick(t) : term_profile_go(t, arg.toLowerCase());
}

// the profiles' picker, at the one running: each one and its folder (its
// end, if long), then the rows that make one and bring one in. On a
// profile, Enter switches, Ctrl+R renames, Ctrl+E exports, Delete
// deletes (asked first); on the others, Enter asks a name or a file
export function term_profile_pick(t: Term): void {
  t.profs     = Profiles.profile_list(config.ROOT);
  const names = t.profs;
  const where = names.map((p) => config.config_home(Profiles.profile_dir(config.ROOT, p))).map((d) => (d.length <= 40 ? d : "…" + d.slice(-39)));
  const acts: Record<string, (t: Term, name: string) => unknown> = { "Ctrl+R": term_profile_rename, "Ctrl+E": term_profile_export, Delete: term_profile_delete };
  const keys  = (k: number, key: string) => {
    if (acts[key] === undefined || k >= names.length) {
      return false;
    }
    void acts[key](t, names[k]);
    return true;
  };
  const foot  = (k: number) => (k < names.length ? "Enter switch · Ctrl+R rename · Ctrl+E export · Del delete" : k === names.length ? "Enter name it" : "Enter give its file");
  const pick  = (k: number) => (k < names.length ? void term_profile_go(t, names[k]) : k === names.length ? term_profile_name(t) : term_profile_file(t));
  const about = [...where, "its own chat and settings", "from an archive Ctrl+E made"];
  term_chooser(t, "Profile", [...names, NEW, IMPORT], about, names.indexOf(config.PROFILE), pick, { keys, foot });
}

// why a name typed won't do for a new profile (null: it will)
function term_profile_why(name: string): string | null {
  return name === "" ? "Type its name first." : Profiles.profile_why(config.ROOT, name);
}

// a new profile's name asked for, then what comes along
function term_profile_name(t: Term): void {
  term_ask(t, "New profile", "its name", "", Profiles.NAMED, (text) => {
    const name = text.toLowerCase();
    const why  = term_profile_why(name);
    if (why === null) {
      term_profile_new(t, name);
    }
    return why;
  });
}

// a switch to profile `name`: in a window, at once, this illi hidden and
// running on; alone, only while illi rests (a switch would cut its turn),
// as term_restart does it; never from a pipe
export async function term_profile_go(t: Term, name: string): Promise<void> {
  t.profs = Profiles.profile_list(config.ROOT);
  if (name === config.PROFILE) {
    return term_note(t, "This is profile " + name + ".");
  }
  if (!t.profs.includes(name)) {
    return term_note(t, "No profile " + Paint.text_clean(name) + ". Profiles: " + t.profs.join(", ") + "; /profile makes one.");
  }
  if (t.scr.tty && WIN !== null) {
    return member_hide(t, name);
  }
  if (term_profile_busy(t, "switch to " + name)) {
    return;
  }
  return term_restart(t, name);
}

// why a switch can't be now (said; true): from a pipe, or while illi
// works (a switch never cuts a turn)
function term_profile_busy(t: Term, what: string): boolean {
  if (!t.scr.tty) {
    term_note(t, "A pipe runs in one profile: ILLI_PROFILE=<name> picks it.");
    return true;
  }
  if (View.view_running(t.v) || t.chat?.busy) {
    term_note(t, "illi is at work: " + what + " once it's done (Esc interrupts it). A switch never cuts a turn.");
    return true;
  }
  return false;
}

// illi run again in profile `name`: it is kept as the one used last
// (unless hidden in a window: the one shown is), all this illi holds let
// go (term_leave), `step` done (a rename, a chat moved: what needs this
// one let go; if it fails, illi runs again where it was, saying why),
// and illi runs in its place, on the same terminal and folder (in a
// window, the same PTY, shown or hidden as it is); the API keys it took
// out of the environment go back in, and ILLI_WINDOW.
// keep: the project's lock kept through the step (this project
// forgotten: no illi opens it meanwhile), let go as illi runs again.
// Background jobs running (this illi runs the chat) stop with it, so it
// asks first at the input, Stay lit, unless the caller asked already
// (asked); a switch taken is checked again (a turn begun meanwhile
// refuses it, jobs begun meanwhile are asked about)
export async function term_restart(t: Term, name: string, step?: () => void | Promise<void>, keep = false, asked = false): Promise<void> {
  const jobs = t.chat === null || asked ? [] : t.v.background;
  if (jobs.length > 0) {
    const them = jobs.length === 1 ? "it" : "them";
    const lead = (jobs.length === 1 ? "A background job runs" : jobs.length + " background jobs run") + ", and a switch stops " + them + ": " + jobs.map((j) => Paint.text_line(j.command)).join(", ");
    const shown = new Set(jobs.map((j) => j.id));
    const pick  = (k: number) => {
      if (k === 1 && !term_profile_busy(t, "switch to " + name)) {
        void term_restart(t, name, step, keep, t.v.background.every((j) => shown.has(j.id)));
      }
    };
    term_question(t, "Switch to " + name + "?", ["Stay", "Switch and stop " + them], ["keeps " + them + " running", "gone for good"], pick, { lead: [[Paint.Run(lead)]], foot: (k) => (k === 0 ? "Enter or Esc stay" : "/background shows " + them) });
    return;
  }
  await term_leave(t, keep);
  let to = name;
  try {
    await step?.();
  } catch (err: any) {
    term_after("illi: " + err.message);
    to = config.PROFILE;
  }
  if (WIN === null || WIN.shown) {
    Profiles.profile_keep(config.ROOT, to);
  }
  const self = /\$bunfs|~BUN/.test(import.meta.path) ? [] : [...process.execArgv, process.argv[1]];
  const env  = { ...config.config_env(), ...member_env(), ILLI_PROFILE: to, ...(process.env.ILLI_DIR === undefined ? {} : { ILLI_DIR: config.ROOT }) };
  try {
    process.execve!(process.execPath, [process.execPath, ...self, ...process.argv.slice(2)], env);
  } catch (err: any) {
    term_after("illi: can't run again in profile " + to + ": " + err.message);
    process.exit(1);
  }
}

// all this illi holds let go, as a quit does, but waited on (the
// execve after fires no exit): the plugins told it quits (their quit
// hooks, SessionEnd's commands), a /login sign-in waiting let go, the chat
// stopped (what it cut goes on at its next start), the agents' processes,
// the hooks' and status line's commands and the MCP servers ended, a new
// release's download given up (its folder gone), every write flushed,
// the lock released (keep: kept, its views let go), the terminal as it
// was
async function term_leave(t: Term, keep = false): Promise<void> {
  await Plugins.quit(process.cwd(), "other");
  status_end(t);
  t.login?.abort();
  t.v.ws?.close();
  if (t.chat !== null) {
    Chat.close(t.chat, keep);
  }
  Machine.end();
  Run.end();
  Update.drop();
  await Promise.race([Mcp.stop(), Bun.sleep(LEAVE)]);
  await Disk.synced();
  Lock.release(keep);
  await Screen.screen_leave(t.scr);
}

// what new profile `name` starts with, asked at the input: a fresh chat,
// or this one (moved: this one starts with an empty chat); the global
// setup either way
function term_profile_new(t: Term, name: string): void {
  const here = config.PROFILE;
  const rows: Array<[string, string, boolean]> = [
    ["Fresh chat",     "the global settings, skills and MCP servers; its own chat", false],
    ["With this chat", "this chat moves there; " + here + " starts empty",           true],
  ];
  term_question(t, "New profile " + name, rows.map((r) => r[0]), rows.map((r) => r[1]), (k) => void term_profile_make(t, name, rows[k][2]));
}

// a new profile made, and switched to (move: with this chat, moved as
// this illi lets it go); made as this illi lets go, so a switch not made
// (background jobs kept running: term_restart) makes none. In a window, a
// fresh one is made and switched to at once, whatever runs
async function term_profile_make(t: Term, name: string, move: boolean): Promise<void> {
  if (!move && t.scr.tty && WIN !== null) {
    Profiles.profile_new(config.ROOT, name);
    t.profs = Profiles.profile_list(config.ROOT);
    return member_hide(t, name);
  }
  if (term_profile_busy(t, "make " + name) || (move && (await term_profile_elsewhere(t, config.PROFILE, "moving its chat")))) {
    return;
  }
  const dir = Profiles.profile_dir(config.ROOT, name);
  return term_restart(t, name, () => {
    Profiles.profile_new(config.ROOT, name);
    if (move) {
      Profiles.profile_move_chat(config.DIR, dir);
    }
  });
}

// a profile renamed, its new name asked for (starting as its old);
// never the default (its folder is the root). This one's is done as illi
// runs again under its new name
function term_profile_rename(t: Term, from: string): void {
  if (from === Profiles.DEFAULT) {
    return term_note(t, "The default profile is illi's own folder (" + config.config_home(config.ROOT) + ") and keeps its name.");
  }
  term_ask(t, "Rename profile " + from, "its new name", from, Profiles.NAMED, (text) => {
    const to  = text.toLowerCase();
    const why = term_profile_why(to);
    if (to === from || why !== null) {
      return to === from ? null : why;
    }
    void term_profile_elsewhere(t, from, "renaming it").then((busy) => {
      if (busy) {
        return;
      }
      if (from !== config.PROFILE) {
        Profiles.profile_rename(config.ROOT, from, to);
        t.profs = Profiles.profile_list(config.ROOT);
        term_note(t, "Renamed profile " + from + " to " + to + ".");
      } else if (!term_profile_busy(t, "rename it")) {
        void term_restart(t, to, () => Profiles.profile_rename(config.ROOT, from, to));
      }
    });
    return null;
  });
}

// whether illi runs in profile `name` hidden in this window, or in
// another terminal (said; true): its folder can't change under it
async function term_profile_elsewhere(t: Term, name: string, what: string): Promise<boolean> {
  if (name !== config.PROFILE && member_others().some((o) => o.profile === name)) {
    term_note(t, "Profile " + name + " runs hidden in this window: quit illi and start it again before " + what + ".");
    return true;
  }
  const n = Lock.others(Profiles.profile_dir(config.ROOT, name));
  if (n > 0) {
    term_note(t, "illi runs in profile " + name + " in " + (n === 1 ? "another terminal" : n + " other terminals") + ": quit it there before " + what + ".");
  }
  return n > 0;
}

// a profile and all it holds gone, once the person says so at the
// input; never the default, nor the one running
export function term_profile_delete(t: Term, name: string): void {
  const why =
    name === Profiles.DEFAULT ? "The default profile is illi's own folder (" + config.config_home(config.ROOT) + ") and can't be deleted." :
    name === config.PROFILE ? "This is profile " + name + ": switch to another first." :
    null;
  if (why !== null) {
    return term_note(t, why);
  }
  const gone = async () => {
    if (await term_profile_elsewhere(t, name, "deleting it")) {
      return;
    }
    Profiles.profile_delete(config.ROOT, name);
    t.profs = Profiles.profile_list(config.ROOT);
    term_note(t, "Deleted profile " + name + ".");
  };
  const about = ["", "its chat and setup, gone for good"];
  const foot  = () => "Ctrl+E in /profile exports a copy first";
  term_question(t, "Delete profile " + name + "?", ["Keep it", "Delete it"], about, (k) => (k === 1 ? void gone() : term_note(t, "Kept profile " + name + ".")), { foot });
}

// a profile as one archive, ./illi-profile-<name>.tar.gz, never over a
// file there; this one's chat flushed first
async function term_profile_export(t: Term, name: string): Promise<void> {
  const file = path.resolve("illi-profile-" + name + ".tar.gz");
  if (fs.existsSync(file)) {
    return term_note(t, "Not exported: " + config.config_home(file) + " is there already. Move it away first.");
  }
  try {
    if (name === config.PROFILE) {
      await Disk.synced();
    }
    const cut = await Profiles.profile_export(config.ROOT, name, file);
    term_note(t, "Profile " + name + " is in " + config.config_home(file) + ", without the logins" + (cut === 0 ? " or API keys" : ", API keys or " + cut + " secret" + (cut === 1 ? "" : "s")) + ". /profile imports it.");
  } catch (err: any) {
    term_note(t, "Not exported. " + err.message);
  }
}

// an archive's path asked for, then it is brought in, named by its file
// (illi-profile-<name>.tar.gz), else as asked
function term_profile_file(t: Term): void {
  term_ask(t, "Import a profile", "the archive's path", "", "an archive Ctrl+E made in /profile", (text) => {
    const file = term_file(text);
    if (file === null) {
      return text === "" ? "Type its path first." : "No such file.";
    }
    const name = Profiles.profile_named(file);
    const why  = name === null ? "" : term_profile_why(name);
    if (why === null) {
      void term_profile_import(t, file, name!);
      return null;
    }
    term_ask(t, "Name the imported profile", "its name", name ?? "", why === "" ? Profiles.NAMED : why, (text) => {
      const named = text.toLowerCase();
      const no    = term_profile_why(named);
      if (no === null) {
        void term_profile_import(t, file, named);
      }
      return no;
    });
    return null;
  });
}

// an archive in as profile `name`; what it left out said, and what came
// with it
async function term_profile_import(t: Term, file: string, name: string): Promise<void> {
  try {
    const got = await Profiles.profile_import(config.ROOT, file, name);
    const off = [
      ...got.keys,
      ...(got.servers === 0 ? [] : [got.servers + " MCP server" + (got.servers === 1 ? "" : "s")]),
      ...(got.plugins.length === 0 ? [] : ["the plugin" + (got.plugins.length === 1 ? " " : "s ") + got.plugins.join(", ") + " (/settings, off, turns one on)"]),
    ];
    const aside = got.aside.length === 0 ? "" : " Kept aside: " + got.aside.map((f) => f + " as " + f + ".imported").join(", ") + " (rename one back to use it).";
    t.profs = Profiles.profile_list(config.ROOT);
    term_note(t, "Imported profile " + name + "." + (off.length === 0 ? "" : " Turned off, as untrusted: " + off.join(", ") + ".") + aside + " Its agents, commands, skills and RULES.md came as they were: look at them before you switch.");
  } catch (err: any) {
    term_note(t, "Not imported. " + err.message);
  }
}
