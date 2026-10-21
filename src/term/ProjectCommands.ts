// Project commands
// ================
// /projects: the projects (Projects.ts), in a list in the screen's middle
// as Ctrl+P's, this one first, then the one used last first: each its
// name, its last day and its messages, its folder (last: the longest),
// typed to search. Enter says more of one; Delete asks to forget it:
// Cancel (lit), a copy exported first (./illi-project-<name>.json, never
// over a file), or forget. A project forgotten is gone from the file,
// its images too (Store.forget); its lock is held meanwhile, so one open
// in another terminal is kept (quit it there first). This one,
// forgotten, starts anew: illi runs again.

import * as fs from "node:fs";
import { Chat } from "../chat/Chat.ts";
import { term_chooser } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { Memory } from "../chat/Memory.ts";
import { term_note } from "./Notices.ts";
import { term_restart } from "./ProfileCommands.ts";
import { Projects } from "../chat/Projects.ts";
import { Store, type Project } from "../chat/Store.ts";
import type { Term } from "./Term.ts";

// the most columns the list takes, the screen's width allowing
const WIDE = 72;

// the list
export function term_projects(t: Term): void {
  const store = t.mem().store;
  const all   = Store.projects(store);
  const list  = [...all.filter((p) => p.id === store.project), ...all.filter((p) => p.id !== store.project)];
  const keys  = (k: number, key: string) => {
    if (key !== "Delete" || list[k] === undefined) {
      return false;
    }
    project_ask(t, list[k]);
    return true;
  };
  const about = list.map((p) => project_about(p) + (p.id === store.project ? " · here" : ""));
  term_chooser(t, "Projects", list.map((p) => p.name), about, 0, (k) => project_more(t, list[k]), { find: true, keys, foot: () => "Enter more · Del forget", middle: WIDE });
}

// a project's last day and size, its folder
function project_about(p: Project): string {
  const when = p.last === null ? "no messages yet" : "last " + p.last.slice(0, 10) + " · " + project_count(p);
  return when + " · " + project_where(p);
}

// a project's folder
function project_where(p: Project): string {
  return p.path === "" ? "outside any git repo" : config.config_home(p.path);
}

// a project's messages, counted
function project_count(p: Project): string {
  return p.count + (p.count === 1 ? " message" : " messages");
}

// more of a project, as a note: its folder, its days, its latest line
function project_more(t: Term, p: Project): void {
  t.choose = null;
  const [first, last] = [p.first?.slice(0, 10), p.last?.slice(0, 10)];
  const when = p.first === null ? "no messages yet" : project_count(p) + ", " + (first === last ? last : first + " to " + last);
  term_note(t, p.name + " · " + project_where(p) + " · " + when + (p.lately === "" ? "." : ". Lately: " + Projects.clip(p.lately)));
}

// whether to forget a project, asked: Cancel lit
function project_ask(t: Term, p: Project): void {
  const pics  = Store.pictures(t.mem().store, p.id);
  const what  = project_count(p) + (pics === 0 ? "" : " and " + pics + (pics === 1 ? " image" : " images"));
  const names = ["Cancel", "Export a copy first, then forget", "Forget"];
  const about = ["keep it", "./illi-project-" + p.name + ".json, then forgotten", what + ", gone for good"];
  const pick  = (k: number) => {
    t.choose = null;
    if (k > 0) {
      project_forget(t, p, k === 1).catch((err) => term_note(t, "Not forgotten: " + (err?.message ?? err) + "."));
    }
  };
  term_chooser(t, "Forget " + p.name + "?", names, about, -1, pick, { foot: (k) => (k === 0 ? "Enter or Esc keep it" : "can't be undone"), middle: WIDE });
}

// a project forgotten, a copy exported first if asked; its lock held
// meanwhile (none: it is open in another terminal, kept). This one: illi
// runs again, the project's chat empty, its lock held till then (run in
// another terminal, this one a view of it: kept, forgotten there)
async function project_forget(t: Term, p: Project, copy: boolean): Promise<void> {
  const mem  = t.mem();
  const here = p.id === mem.store.project;
  const of   = Store.project(mem.store, p.name);
  if (of === null) {
    return term_note(t, p.name + " is forgotten already.");
  }
  if (here && t.chat === null) {
    return term_note(t, p.name + "'s chat runs in another terminal: forget it there.");
  }
  if (copy) {
    const out = process.cwd() + "/illi-project-" + p.name + ".json";
    if (fs.existsSync(out)) {
      return term_note(t, "Not forgotten: " + config.config_home(out) + " is there already. Move it away first.");
    }
    await Bun.write(out, [...Memory.dump(here ? mem : Memory.glance(mem, of.project, of.chat))].join(""));
    term_note(t, "A copy of " + p.name + " is in " + config.config_home(out) + ".");
  }
  if (here) {
    return term_restart(t, config.PROFILE, () => {
      const store = Store.open(mem.dir, null);
      try {
        Store.forget(store, p.id);
      } finally {
        Store.close(store);
      }
    }, true);
  }
  const pics = Store.pictures(mem.store, p.id);
  if (!(await project_held(p, () => Store.forget(mem.store, p.id)))) {
    return term_note(t, p.name + " is open in another terminal: quit illi there first, then forget it here.");
  }
  term_note(t, "Forgot " + p.name + ": " + project_count(p) + (pics === 0 ? "" : " and " + pics + (pics === 1 ? " image" : " images")) + ".");
}

// `step` done holding a project's lock, so no illi opens it meanwhile;
// false: one has it open, nothing done
async function project_held(p: Project, step: () => void): Promise<boolean> {
  const lock = await Chat.claim(Projects.lock(p.path));
  if (lock === null) {
    return false;
  }
  try {
    step();
    return true;
  } finally {
    lock.stop();
  }
}
