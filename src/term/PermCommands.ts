// Permission commands
// ===================
// /mode: what runs without asking for this session (Permissions.ts's
// modes: default, trust), in a list, each with what it does, the one now
// marked; picking the setting's own goes back to following it
// (/settings changes it for good). /permissions: the requests refused
// (newest first: what, who asked, why), the approvals (saved for the
// project, then this session's), then the rules file. Enter on a refused
// one allows it again, by why it was refused: the user's no (or no one
// there to ask), for this session, the one who asked told it may run it
// again; the user's rules', only by changing them, which it says where.
// Enter or Delete on an approval lets it go; Enter on the rules says
// where they are and their shape. The side's Refused lines (Side.ts)
// open it on theirs.

import { term_chooser, term_pane_text } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { MODES, type Mode } from "../tools/Permissions.ts";
import { term_note } from "./Notices.ts";
import { term_send, type Term } from "./Term.ts";
import type { Grant, Refused } from "../ui/View.ts";

// the modes in the order the list shows them, and what each does
const ORDER: Mode[] = ["default", "trust"];
const ABOUT: Record<Mode, string> = {
  "default" : "all runs but folders outside, .env reads, what rules ask",
  "trust"   : "all runs but what your rules deny",
};

// the rules' shape, as /permissions shows it
const SHAPE = `{
  "rules": {
    "shell": { "git push *": "ask", "rm -rf /*": "deny" },
    "external_directory": { "~/notes/*": "allow", "/tmp/*": "allow" },
    "edit": { "*.lock": "deny" },
    "mcp__github__*": "ask"
  }
}`;

// /mode: a mode given, switched to; none, the list
export function term_mode(t: Term, arg: string): void {
  const mode = arg.trim().toLowerCase();
  if (mode !== "") {
    return MODES.includes(mode as Mode) ? mode_set(t, mode as Mode) : term_note(t, "No mode " + arg.trim() + ": default or trust.");
  }
  const aside = ORDER.map((m) => (m === t.v.perm.set ? "the setting's" : ""));
  term_chooser(t, "Mode, this session", ORDER, ORDER.map((m) => ABOUT[m]), ORDER.indexOf(t.v.perm.mode), (k) => mode_set(t, ORDER[k]), { aside, foot: () => "Enter switch · /settings changes the default" });
}

// a mode for this session (the setting's: follow it again), said
function mode_set(t: Term, mode: Mode): void {
  term_send(t, { $: "mode", mode: mode === t.v.perm.set ? null : mode });
  term_note(t, "Mode: " + mode + ", this session (" + ABOUT[mode] + ").");
}

// /permissions, the refused one given lit (its id; none: the first row)
export function term_permissions(t: Term, lit = ""): void {
  const perm    = t.v.perm;
  const refused = [...perm.refused].reverse();
  const grants  = [...perm.grants.filter((g) => g.saved), ...perm.grants.filter((g) => !g.saved)];
  const names   = [...refused.map((r) => one_line(r.what) || r.tool), ...grants.map((g) => g.said), "Your rules"];
  const about   = [...refused.map((r) => (r.who === "illi" ? "" : r.who + ": ") + r.why), ...grants.map((g) => g.action + " " + g.resource), config.config_home(perm.file) + (perm.broken === "" ? "" : " · won't read")];
  const heads   = [...refused.map(() => "Refused"), ...grants.map((g) => (g.saved ? "Saved for this project" : "This session")), "Rules"];
  const pick    = (k: number) => (k < refused.length ? refused_pick(t, refused[k]) : k < refused.length + grants.length ? grant_drop(t, grants[k - refused.length]) : rules_show(t));
  const keys    = (k: number, key: string) => {
    if (key !== "Delete" || k < refused.length || k >= refused.length + grants.length) {
      return false;
    }
    t.choose = null;
    grant_drop(t, grants[k - refused.length]);
    return true;
  };
  const foot    = (k: number) => (k < refused.length ? refused_foot(refused[k]) : k < refused.length + grants.length ? "Enter or Del remove it" : "Enter where they are, and their shape");
  term_chooser(t, "Permissions", names, about, -1, pick, { keys, foot, heads });
  t.choose!.at = Math.max(0, refused.findIndex((r) => r.id === lit));
}

// what Enter does to a refused request, by why it was refused (one
// asked each time, with nothing to allow: a hook's ask, or rules that
// won't read, a way to run it)
function refused_foot(r: Refused): string {
  return r.how !== "rule" && r.exact.length === 0 ? "asked each time: have it run again, and say yes" : r.how === "rule" ? "your rules refuse it: change them to allow it" : "Enter allow it this session and tell " + r.who;
}

// Enter on a refused request: the user's no, allowed for this session;
// the user's rules', where they are; one asked each time (nothing to
// allow), how to run it
function refused_pick(t: Term, r: Refused): void {
  if (r.how === "rule") {
    return term_note(t, "Your rules refuse " + one_line(r.what) + ": change them in " + config.config_home(t.v.perm.file) + " to allow it.");
  }
  if (r.exact.length === 0) {
    return term_note(t, one_line(r.what) + " is asked each time (" + r.why + "): have it run again, and say yes.");
  }
  refused_allow(t, r);
}

// a refused request allowed for this session, the one who asked told
function refused_allow(t: Term, r: Refused): void {
  term_send(t, { $: "allow", refused: r.id });
  term_note(t, "Allowed this session: " + one_line(r.what) + ". " + (r.who === "illi" ? "illi" : r.who) + " is told it may run it again.");
}

// an approval let go
function grant_drop(t: Term, g: Grant): void {
  term_send(t, { $: "revoke", action: g.action, resource: g.resource });
  term_note(t, "No longer allowed without asking: " + g.said + ".");
}

// where the rules are, whether they read, their shape
function rules_show(t: Term): void {
  const perm = t.v.perm;
  const file = config.config_home(perm.file);
  const text = [
    "Your permission rules are in " + file + (perm.broken === "" ? "." : ", which won't read: " + perm.broken + ". Until it does, illi asks before every call it checks."),
    "",
    "Each rule is an action (`shell`, `read`, `edit`, `external_directory` for folders outside the project, `webfetch`, an MCP tool's name; `*` any), a pattern and allow, ask or deny; the last rule that matches wins, after illi's own (all runs; folders outside the project and .env reads ask). deny refuses, even in trust mode; ask asks, but in trust mode. `*` matches anything, and a pattern that ends in a space and `*` matches the bare command too (`git push *` matches `git push`); a path's `~` is your home, a file in the project is matched by its path from the working folder, one outside by its full path.",
    "",
    "```json\n" + SHAPE + "\n```",
    "",
    "A change applies at illi's next call. What \"don't ask again\" saves is in the same file, under projects.",
  ];
  term_pane_text(t, "Permissions", text.join("\n"));
}

// a text as one line, as the list shows it
function one_line(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
