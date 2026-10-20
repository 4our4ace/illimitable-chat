// Settings
// ========
// /settings: each setting (Config SETTINGS, so a new one shows here as
// it is added there) in the picker, its value now and what it is, typed
// to search. The lit one: Left and Right step it through its values, so
// does Enter (kept in config.json at once); Enter on a pick opens the
// model picker for it, on one typed in puts `/set <key> <value>` in the
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
import type { Term } from "./Term.ts";

// the widest a value shows in the picker, so what it is fits beside it
const WIDE = 24;

// the settings, in their order
const KEYS = Object.keys(config.SETTINGS) as config.Key[];

// /settings: the settings' picker, at the setting named if any
export function term_settings(t: Term, at = ""): void {
  const about = () => {
    const shown = KEYS.map((key) => setting_cut(setting_shown(key)));
    const vw    = Math.max(...shown.map((v) => v.length));
    return KEYS.map((key, k) => shown[k].padEnd(vw) + "  " + config.SETTINGS[key].what);
  };
  const keys = (k: number, press: string) => {
    const vals = config.SETTINGS[KEYS[k]].values;
    const step = ({ Left: -1, Right: 1, Enter: 1 } as Record<string, number>)[press];
    if (press !== "Delete" && (step === undefined || !Array.isArray(vals))) {
      return false;
    }
    const list = Array.isArray(vals) ? vals : [];
    const now  = list.indexOf(config.config_value(KEYS[k]));
    const next = press === "Delete" ? null : list[now < 0 ? (step > 0 ? 0 : list.length - 1) : (now + step + list.length) % list.length];
    if (setting_set(t, KEYS[k], next) && t.choose !== null) {
      t.choose.about = about();
    }
    return true;
  };
  const foot = (k: number) => {
    const s   = config.SETTINGS[KEYS[k]];
    const env = config.config_env_set(KEYS[k]);
    const how = Array.isArray(s.values) ? "◂ ▸ Enter change" : s.values === "pick" ? "Enter pick a model" : "Enter edit";
    return env !== null ? "set by " + env : how + " · Del default · " + (s.now ? "applies now" : "at the next start");
  };
  term_chooser(t, "Settings", KEYS, about(), -1, (k) => setting_open(t, KEYS[k]), { find: true, keys, foot });
  t.choose!.at = Math.max(0, KEYS.indexOf(at as config.Key));
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
    const { what, def } = config.SETTINGS[key];
    return term_note(t, key + ": " + setting_shown(key) + ". " + what[0].toUpperCase() + what.slice(1) + ". /set " + key + " <value> changes it; /set " + key + " default puts back " + (def === "" ? "none" : def) + ".");
  }
  let value: unknown = text === "default" ? null : text;
  if (key === "contexts" && value !== null) {
    try {
      value = JSON.parse(text);
    } catch {
      return term_note(t, "contexts takes JSON, like {\"gpt-6.1-sol\": 350000}.");
    }
  }
  if (setting_set(t, key, value)) {
    term_note(t, setting_said(key));
  }
}

// Enter on a setting with no values to step through: a pick, the model
// picker (from the pick set, or the chat's), its choice set and the
// settings back at it; one typed in, `/set <key> <value>` in the input
function setting_open(t: Term, key: config.Key): void {
  const env = config.config_env_set(key);
  if (config.SETTINGS[key].values === "pick") {
    const rows = Pick.models(t.v.vendors, t.v.models);
    const from = config.config_pick(key) ?? t.v.pick;
    if (env !== null || from === null || rows.length === 0) {
      return term_note(t, env !== null ? key + " is set by " + env + ": unset it to change it here." : "No models offered yet.");
    }
    return term_model_pick(t, rows, "Settings: " + key, from, (p) => {
      if (setting_set(t, key, Pick.label(p))) {
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
// suggested); true if set. One a variable sets, or that won't do, isn't:
// a note says why
function setting_set(t: Term, key: config.Key, value: unknown): boolean {
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
  return true;
}

// a setting's value as shown: a pick by its model, effort and speed;
// none, what holds instead; a path in Illi's folder by its name, else
// from ~
function setting_shown(key: config.Key): string {
  const s    = config.SETTINGS[key];
  const raw  = config.config_value(key) as unknown;
  const text = typeof raw === "string" ? raw.trim() : JSON.stringify(raw);
  if (text === "") {
    return s.none ?? "none";
  }
  const file = text.startsWith(config.DIR + "/") ? text.slice(config.DIR.length + 1) : term_home(text);
  return s.values === "pick" ? text.split(":").slice(1).join(" ") : s.path ? file : text;
}

// a value cut to WIDE characters, an ellipsis at its end
function setting_cut(text: string): string {
  return text.length <= WIDE ? text : text.slice(0, WIDE - 1) + "…";
}

// a change, as a note says it: the value now, kept, when it applies
function setting_said(key: config.Key): string {
  return key + ": " + setting_shown(key) + ", kept in " + term_home(config.DIR) + "/config.json; " + (config.SETTINGS[key].now ? "it applies now." : "it applies at illi's next start.");
}
