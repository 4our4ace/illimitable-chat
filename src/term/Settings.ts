// Settings
// ========
// /settings: each setting (Config SETTINGS, so a new one shows here as
// it is added there) in the picker, its value now and what it is, typed
// to search. The lit one: Left and Right step it through its values, so
// does Enter (kept in config.json at once); Enter on a pick opens the
// model picker for it (a role's: the chat's vendor's pick, the choice
// kept in its vendor's place), on one typed in puts `/set <key> <value>` in the
// input to change; Delete puts its default back. A change applies at
// once or at the next start, as the foot says. /set changes one by its
// words.

import { term_home } from "./Attach.ts";
import { Chat } from "../chat/Chat.ts";
import { term_chooser, term_model_pick } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { term_note } from "./Notices.ts";
import { Pick } from "../ai/Pick.ts";
import * as Screen from "../ui/Screen.ts";
import { term_act, type Term } from "./Term.ts";

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
  const keys = (k: number, press: string) => {
    if (!setting_key(t, KEYS[k], press)) {
      return false;
    }
    if (t.choose !== null) {
      t.choose.about = about();
    }
    return true;
  };
  term_chooser(t, "Settings", KEYS, about(), -1, (k) => setting_open(t, KEYS[k]), { find: true, keys, foot: (k) => setting_foot(KEYS[k]) });
  t.choose!.at = Math.max(0, KEYS.indexOf(at as config.Key));
}

// a key to a setting's row (true: taken): Left and Right step it through
// its values, so does Enter (kept in config.json at once); Delete puts
// its default back
export function setting_key(t: Term, key: config.Key, press: string): boolean {
  const vals = config.SETTINGS[key].values;
  const step = ({ Left: -1, Right: 1, Enter: 1 } as Record<string, number>)[press];
  if (press !== "Delete" && (step === undefined || !Array.isArray(vals))) {
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
  const how = Array.isArray(s.values) ? "◂ ▸ Enter change" : s.values === "pick" ? "Enter pick a model" : "Enter edit";
  return env !== null ? "set by " + env : how + " · Del default · " + (s.now ? "applies now" : "at the next start");
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
  // contexts as JSON; text that won't parse goes on as it is, for
  // config_check to say why it won't do
  if (key === "contexts" && value !== null) {
    try {
      value = JSON.parse(text);
    } catch {
      value = text;
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
  if (key === "suggest") {
    t.chat.suggest.on = t.scr.tty && config.SUGGEST;
    Chat.unsuggest(t.chat);
    Chat.change(t.chat);
  }
  if (key === "pick" && t.v.agent === null) {
    term_act(t, { $: "Pick", to: config.PICK });
  }
  return true;
}

// a setting's value (now, else the one given) as shown: a pick as a
// person reads it (Pick.shown; a role's, each); none, what holds
// instead; a path in illi's folder by its name, else from ~
function setting_shown(key: config.Key, value?: string): string {
  const s    = config.SETTINGS[key];
  const raw  = value ?? (config.config_value(key) as unknown);
  const text = typeof raw === "string" ? raw.trim() : JSON.stringify(raw);
  if (text === "") {
    return s.none ?? "none";
  }
  const file = text.startsWith(config.DIR + "/") ? text.slice(config.DIR.length + 1) : term_home(text);
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
  return key + ": " + setting_shown(key) + ", kept in " + term_home(config.DIR) + "/config.json; " + (config.SETTINGS[key].now ? "it applies now." : "it applies at illi's next start.");
}
