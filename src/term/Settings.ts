// Settings
// ========
// /settings: each setting (Config SETTINGS, so a new one shows here as
// it is added there) in the picker, its value now and what it is, typed
// to search. The lit one: Left and Right step it through its values, so
// does Enter (kept in config.json at once); Enter on a pick opens the
// model picker for it (a role's: the chat's vendor's pick, the choice
// kept in its vendor's place), on `off` lists what it may turn off, on
// `sticky` the sticky skills to turn on, on one typed in puts
// `/set <key> <value>` in the input to change; Delete puts its default
// back. In a profile, a change is its own, and each row says where its
// value comes from: global (the default profile's, every profile's), the
// profile, or a variable; Delete on one of the profile's puts the global
// value back (on a global one, it does nothing there). A change applies
// at once or at the next start, as the foot says. /set changes one by
// its words.

import { Chat } from "../chat/Chat.ts";
import { Suggest } from "../chat/Suggest.ts";
import { term_chooser, term_model_pick } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { Custom } from "../config/Custom.ts";
import type { Mode } from "../tools/Guard.ts";
import { Mcp } from "../tools/Mcp.ts";
import { Plugins } from "../config/Plugins.ts";
import { term_note } from "./Notices.ts";
import { Pick } from "../ai/Pick.ts";
import * as Screen from "../ui/Screen.ts";
import { status_set } from "./Status.ts";
import { term_act, term_send, type Term } from "./Term.ts";

// the widest a value shows in the picker, so what it is fits beside it
const WIDE = 24;

// the settings, in their order
const KEYS = Object.keys(config.SETTINGS) as config.Key[];

// /settings: the settings' picker, at the setting named if any
export function term_settings(t: Term, at = ""): void {
  const about = () => {
    const shown = KEYS.map(setting_value);
    const vw    = Math.max(...shown.map((v) => v.length));
    return KEYS.map((key, k) => shown[k].padEnd(vw) + "  " + config.SETTINGS[key].what);
  };
  const from = () => (config.DIR === config.ROOT ? undefined : KEYS.map(config.config_from));
  const keys = (k: number, press: string) => {
    if (!setting_key(t, KEYS[k], press)) {
      return false;
    }
    if (t.choose !== null) {
      [t.choose.about, t.choose.aside] = [about(), from()];
    }
    return true;
  };
  term_chooser(t, "Settings", KEYS, about(), -1, (k) => setting_open(t, KEYS[k]), { find: true, keys, foot: (k) => setting_foot(KEYS[k]), aside: from() });
  t.choose!.at = Math.max(0, KEYS.indexOf(at as config.Key));
}

// a key to a setting's row (true: taken): Left and Right step it through
// its values, so does Enter (kept in config.json at once); Delete puts
// its default back
export function setting_key(t: Term, key: config.Key, press: string): boolean {
  const vals = config.SETTINGS[key].values;
  const step = ({ Left: -1, Right: 1, Enter: 1 } as Record<string, number>)[press];
  if (press === "Delete" ? config.config_from(key) === "global" && config.DIR !== config.ROOT : step === undefined || !Array.isArray(vals)) {
    return false;
  }
  const list = Array.isArray(vals) ? vals : [];
  const now  = list.indexOf(config.config_value(key));
  const next = press === "Delete" ? null : list[now < 0 ? (step > 0 ? 0 : list.length - 1) : (now + step + list.length) % list.length];
  setting_set(t, key, next);
  return true;
}

// what a setting's row's foot says: how to change it and when that
// applies, or the variable that sets it
export function setting_foot(key: config.Key): string {
  const s   = config.SETTINGS[key];
  const env = config.config_env_set(key);
  const how = Array.isArray(s.values) ? "◂ ▸ Enter change" : s.values === "pick" ? "Enter pick a model" : key === "off" || key === "sticky" ? "Enter list" : "Enter edit";
  const del = config.DIR === config.ROOT ? "Del default · " : config.config_from(key) === config.PROFILE ? "Del global · " : "";
  return env !== null ? "set by " + env : how + " · " + del + (s.now ? "applies now" : "at the next start");
}

// a setting's value as its row shows it, WIDE characters at most
export function setting_value(key: config.Key): string {
  return setting_cut(setting_shown(key));
}

// /set <key> <value>: the setting changed ("default": its default back);
// a key alone: what it is and how to change it; none: the picker
export function term_set(t: Term, arg: string): void {
  const [word = ""] = arg.split(/\s+/);
  const text = arg.slice(word.length).trim();
  const key  = KEYS.find((k) => k === word);
  if (word === "") {
    return term_settings(t);
  }
  if (key === undefined) {
    return term_note(t, "No setting " + word + ". The settings: " + KEYS.join(", ") + "; /settings lists them.");
  }
  if (text === "") {
    const { what } = config.SETTINGS[key];
    const def      = config.config_default(key);
    return term_note(t, key + ": " + setting_shown(key) + ". " + what[0].toUpperCase() + what.slice(1) + ". /set " + key + " <value> changes it; /set " + key + " default puts back " + setting_shown(key, def) + ".");
  }
  let value: unknown = text === "default" ? null : text;
  // contexts and shortcuts as JSON; text that won't parse goes on as it
  // is, for config_check to say why it won't do. statusline's only when
  // it is Claude Code's statusLine (an object with a command): else a
  // command, whatever it holds
  if ((key === "contexts" || key === "shortcuts") && value !== null) {
    try {
      value = JSON.parse(text);
    } catch {
      value = text;
    }
  }
  if (key === "statusline" && text.startsWith("{")) {
    try {
      const got = JSON.parse(text);
      value = typeof got?.command === "string" ? got : text;
    } catch {
      // a command
    }
  }
  if (setting_set(t, key, value)) {
    term_note(t, setting_said(key));
  }
}

// Enter on a setting with no values to step through: a pick, the model
// picker (from the pick set, or the chat's), its choice set and the
// settings back at it; one typed in, `/set <key> <value>` in the input
export function setting_open(t: Term, key: config.Key): void {
  const env = config.config_env_set(key);
  if (key === "off") {
    return setting_off(t);
  }
  if (key === "sticky") {
    return setting_sticky(t);
  }
  if (config.SETTINGS[key].values === "pick") {
    const rows = Pick.models(t.v.vendors, t.v.models);
    const role = key === "agents" || key === "compactor" ? key : null;
    const from = role !== null && t.v.pick !== null ? config.config_role(role, t.v.pick) : config.config_pick(key) ?? t.v.pick;
    if (env !== null || from === null || rows.length === 0) {
      return term_note(t, env !== null ? key + " is set by " + env + ": unset it to change it here." : "No models offered yet.");
    }
    return term_model_pick(t, rows, "Settings: " + key, from, (p) => {
      if (setting_set(t, key, role === null ? Pick.label(p) : config.config_role_set(role, p))) {
        term_note(t, setting_said(key));
      }
      term_settings(t, key);
    });
  }
  const raw = config.config_value(key) as unknown;
  Screen.ed_set(t.scr.ed, "/set " + key + " " + (typeof raw === "string" ? raw : JSON.stringify(raw)));
  t.scr.typed = true;
}

// Enter on `off`: each skill, agent, command, MCP server and plugin, what
// it is and where it's from (built in, global, the profile, the
// project, a plugin: its part by the name it is listed by), on or off; Enter, Left or Right turns the lit one on or off,
// kept in `off` at once (a server or plugin starts or stops at the next
// start). In a
// profile, one off globally stays off: a note says where to turn it on
// (Config ADDS)
function setting_off(t: Term): void {
  const cwd   = process.cwd();
  const own   = config.DIR !== config.ROOT;
  const where = (file: string) => (file === "" ? "built in" : own && file.startsWith(config.DIR + "/") ? config.PROFILE : file.startsWith(config.ROOT + "/") ? "global" : "project");
  const rows  = [
    ...Custom.skills(cwd, true).map((s) => [s.name, "skill · " + (s.plugin == null ? where(s.dir) : "plugin " + s.plugin)]),
    ...Custom.parts(cwd, "agents", true).map((p) => [p.name, "agent · " + (p.plugin === null ? where(p.file) : "plugin " + p.plugin.name)]),
    ...Custom.parts(cwd, "commands", true).map((p) => [p.name, "command · " + (p.plugin === null ? where(p.file) : "plugin " + p.plugin.name)]),
    ...Object.entries(Mcp.read(cwd, true)).map(([name, f]) => [name, "MCP server · " + (f.plugin !== null ? "plugin " + f.plugin : where(f.file))]),
    ...Plugins.found().map((p) => [p.name, "plugin · " + where(p.dir || p.file)]),
  ];
  const global = (name: string) => own && config.config_names("off", true).includes(name.toLowerCase());
  const aside  = () => rows.map(([name]) => (!config.config_off(name) ? "on" : global(name) ? "off globally" : "off"));
  const keys   = (k: number, press: string) => {
    if (!["Enter", "Left", "Right"].includes(press)) {
      return false;
    }
    const name = rows[k][0].toLowerCase();
    const list = config.config_names("off", false);
    if (global(name)) {
      term_note(t, rows[k][0] + " is off globally: turn it on in the default profile.");
      return true;
    }
    const next = list.includes(name) ? list.filter((n) => n !== name) : [...list, name];
    if (setting_set(t, "off", next.length === 0 ? null : next.join(", ")) && t.choose !== null) {
      t.choose.aside = aside();
    }
    return true;
  };
  const foot = (k: number) => "Enter on/off · " + (/^(MCP|plugin)/.test(rows[k][1]) ? "at the next start" : "applies now");
  term_chooser(t, "Turned off" + (own ? " in " + config.PROFILE : ""), rows.map(([name]) => name), rows.map(([, about]) => about), -1, () => {}, { find: true, keys, foot, aside: aside() });
}

// Enter on `sticky`: each sticky skill, where its on and off is kept
// (global, or the profile), on or off; Enter, Left or Right turns the
// lit one on or off (Custom.stick), from the next turn
function setting_sticky(t: Term): void {
  const skills = Custom.skills(process.cwd()).filter((s) => s.sticky);
  if (skills.length === 0) {
    return term_note(t, "No sticky skills yet: a skill with sticky: true in its front matter is one.");
  }
  const aside = () => skills.map((s) => (config.config_sticky(s.name) ? "on" : "off"));
  const keys  = (k: number, press: string) => {
    if (!["Enter", "Left", "Right"].includes(press)) {
      return false;
    }
    const why = Custom.stick(skills[k], !config.config_sticky(skills[k].name));
    if (why !== null) {
      term_note(t, why);
    } else if (t.choose !== null) {
      t.choose.aside = aside();
    }
    return true;
  };
  const about = skills.map((s) => (Custom.global(s) ? "global" : config.PROFILE) + (s.description === "" ? "" : " · " + s.description));
  term_chooser(t, "Sticky skills", skills.map((s) => s.name), about, -1, () => {}, { find: true, keys, foot: () => "Enter on/off · from the next turn", aside: aside() });
}

// a setting to a value (null: its default), in config.json, and what
// the terminal holds of it anew (the side panel, whether replies are
// suggested; the pick, the chat's too while illi's own agent is the main
// one); true if set. One a variable sets, or that won't do, isn't: a
// note says why
export function setting_set(t: Term, key: config.Key, value: unknown): boolean {
  const env = config.config_env_set(key);
  if (env !== null) {
    term_note(t, key + " is set by " + env + ", over config.json: unset it to change it here.");
    return false;
  }
  try {
    config.config_set(key, value);
  } catch (err: any) {
    term_note(t, err.message);
    return false;
  }
  t.side = { place: config.SIDE, width: config.SIDE_WIDTH };
  if (key === "suggest" && t.chat !== null) {
    t.chat.suggest.on = t.scr.tty && config.SUGGEST;
    Suggest.drop(t.chat);
    Chat.change(t.chat);
  }
  if (key === "pick" && t.v.agent === null) {
    term_act(t, { $: "Pick", to: config.PICK });
  }
  if (key === "mode") {
    term_send(t, { $: "mode", mode: config.config_value("mode") as Mode });
  }
  if (key === "statusline") {
    status_set(t);
  }
  return true;
}

// a setting's value (now, else the one given) as shown: a pick as a
// person reads it (Pick.shown; a role's, each); none, what holds
// instead; a path in illi's folder by its name, else from ~
function setting_shown(key: config.Key, value?: string): string {
  const s    = config.SETTINGS[key];
  const raw  = value ?? (key === "statusline" ? config.STATUSLINE?.command ?? "" : (config.config_value(key) as unknown));
  const text = typeof raw === "string" ? raw.trim() : JSON.stringify(raw);
  if (text === "") {
    return s.none ?? "none";
  }
  const file = text.startsWith(config.DIR + "/") ? text.slice(config.DIR.length + 1) : config.config_home(text);
  const shown = (one: string) => {
    const [vendor, model, effort, speed] = one.trim().split(":");
    return Pick.shown({ vendor, model, effort, speed } as Pick);
  };
  return s.values === "pick" ? text.split(",").map(shown).join(", ") : s.path ? file : text;
}

// a value cut to WIDE characters, an ellipsis at its end
function setting_cut(text: string): string {
  return text.length <= WIDE ? text : text.slice(0, WIDE - 1) + "…";
}

// a change, as a note says it: the value now, kept, when it applies
function setting_said(key: config.Key): string {
  return key + ": " + setting_shown(key) + ", kept in " + config.config_home(config.DIR) + "/config.json; " + (config.SETTINGS[key].now ? "it applies now." : "it applies at illi's next start.");
}
