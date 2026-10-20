// Settings
// ========
// /settings: each key of config.json (Config DEFAULTS) in the picker, its
// value now and what it does, typed to search. The lit one: Left and
// Right step it through its values, so does Enter (kept in config.json
// at once); Enter on a pick opens the model picker for it, on one typed
// in puts `/set <key> <value>` in the input to change; Delete puts its
// default back. A change applies at once or at the next start, as the
// foot says. /set changes one by its words.

import { term_home } from "./Attach.ts";
import { Chat } from "../chat/Chat.ts";
import { term_chooser, term_model_pick } from "./Commands.ts";
import * as config from "../config/Config.ts";
import { term_note } from "./Notices.ts";
import { Pick } from "../ai/Pick.ts";
import * as Screen from "../ui/Screen.ts";
import type { Term } from "./Term.ts";

// a setting as the picker shows it: the values it steps through ("pick":
// the model picker's; "text": typed in), whether a change applies at once
// (else at the next start), what it does
type Setting = { key: string; values: string[] | "pick" | "text"; now: boolean; what: string };

const SETTINGS: Setting[] = [
  { key: "pick",       values: "pick",                                       now: true,  what: "Illi's own default model" },
  { key: "agents",     values: "pick",                                       now: true,  what: "what subagents run on" },
  { key: "compactor",  values: "pick",                                       now: true,  what: "what writes the summaries" },
  { key: "suggest",    values: ["on", "off"],                                now: true,  what: "suggested replies (Tab)" },
  { key: "side",       values: ["right", "left", "off"],                     now: true,  what: "where the side panel shows" },
  { key: "side_width", values: ["20%", "25%", "30%", "35%", "40%"],          now: true,  what: "the side panel's width" },
  { key: "context",    values: ["auto", "50%", "60%", "70%", "80%", "90%"],  now: true,  what: "tokens of chat a turn sends" },
  { key: "contexts",   values: "text",                                       now: true,  what: "context by model, as JSON" },
  { key: "rules",      values: "text",                                       now: true,  what: "a file added to the prompt" },
  { key: "after",      values: "text",                                       now: true,  what: "a command after each turn" },
  { key: "vendors",    values: "text",                                       now: false, what: "where models come from" },
  { key: "models",     values: "text",                                       now: false, what: "the models offered" },
  { key: "jobs",       values: ["2", "4", "8", "16", "32"],                  now: false, what: "summaries built at once" },
  { key: "theme",      values: "text",                                       now: false, what: "the theme file" },
  { key: "mcp",        values: "text",                                       now: false, what: "the MCP servers' file" },
  { key: "login",      values: "text",                                       now: false, what: "the ChatGPT login file" },
];

// the widest a value shows in the picker, so what it does fits beside it
const WIDE = 24;

// /settings: the settings' picker, at the setting named if any
export function term_settings(t: Term, at = ""): void {
  const names = SETTINGS.map((s) => s.key);
  const about = () => {
    const shown = SETTINGS.map((s) => setting_cut(setting_shown(s.key)));
    const vw    = Math.max(...shown.map((v) => v.length));
    return SETTINGS.map((s, k) => shown[k].padEnd(vw) + "  " + s.what);
  };
  const keys = (k: number, key: string) => {
    const s    = SETTINGS[k];
    const step = ({ Left: -1, Right: 1, Enter: 1 } as Record<string, number>)[key];
    if (key !== "Delete" && (step === undefined || !Array.isArray(s.values))) {
      return false;
    }
    const vals = Array.isArray(s.values) ? s.values : [];
    const now  = vals.indexOf(config.config_value(s.key));
    const next = key === "Delete" ? null : vals[now < 0 ? (step > 0 ? 0 : vals.length - 1) : (now + step + vals.length) % vals.length];
    if (setting_set(t, s.key, next) && t.choose !== null) {
      t.choose.about = about();
    }
    return true;
  };
  const foot = (k: number) => {
    const s    = SETTINGS[k];
    const env  = config.config_env_set(s.key);
    const how  = Array.isArray(s.values) ? "◂ ▸ Enter change" : s.values === "pick" ? "Enter pick a model" : "Enter edit";
    return env !== null ? "set by " + env : how + " · Del default · " + (s.now ? "applies now" : "at the next start");
  };
  term_chooser(t, "Settings", names, about(), -1, (k) => setting_open(t, SETTINGS[k]), { find: true, keys, foot });
  t.choose!.at = Math.max(0, names.indexOf(at));
}

// /set <key> <value>: the setting changed ("default": its default back);
// a key alone: what it is and how to change it; none: the picker
export function term_set(t: Term, arg: string): void {
  const [key = ""] = arg.split(/\s+/);
  const text = arg.slice(key.length).trim();
  const s    = SETTINGS.find((s) => s.key === key);
  if (key === "") {
    return term_settings(t);
  }
  if (s === undefined) {
    return term_note(t, "No setting " + key + ". The settings: " + SETTINGS.map((s) => s.key).join(", ") + "; /settings lists them.");
  }
  if (text === "") {
    return term_note(t, key + ": " + setting_shown(key) + ". " + s.what[0].toUpperCase() + s.what.slice(1) + ". /set " + key + " <value> changes it; /set " + key + " default puts back " + (config.DEFAULTS[key] === "" ? "none" : config.DEFAULTS[key]) + ".");
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
    term_note(t, setting_said(s));
  }
}

// Enter on a setting with no values to step through: a pick, the model
// picker (from the pick set, or the chat's), its choice set and the
// settings back at it; one typed in, `/set <key> <value>` in the input
function setting_open(t: Term, s: Setting): void {
  if (s.values === "pick") {
    const rows = Pick.models(t.v.vendors, t.v.models);
    const set  = s.key === "pick" ? config.PICK : s.key === "compactor" ? config.COMPACTOR : config.AGENTS;
    const from = set ?? t.v.pick;
    if (from === null || rows.length === 0 || config.config_env_set(s.key) !== null) {
      return term_note(t, config.config_env_set(s.key) !== null ? s.key + " is set by " + config.config_env_set(s.key) + ": unset it to change it here." : "No models offered yet.");
    }
    return term_model_pick(t, rows, "Settings: " + s.key, from, (p) => {
      if (setting_set(t, s.key, Pick.label(p))) {
        term_note(t, setting_said(s));
      }
      term_settings(t, s.key);
    });
  }
  const raw = config.config_value(s.key) as unknown;
  Screen.ed_set(t.scr.ed, "/set " + s.key + " " + (typeof raw === "string" ? raw : JSON.stringify(raw)));
  t.scr.typed = true;
}

// a setting to a value (null: its default), in config.json, and what
// the terminal holds of it anew (the side panel, whether replies are
// suggested); true if set. One a variable sets, or that won't do, isn't:
// a note says why
function setting_set(t: Term, key: string, value: unknown): boolean {
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
function setting_shown(key: string): string {
  const raw   = config.config_value(key) as unknown;
  const text  = typeof raw === "string" ? raw.trim() : JSON.stringify(raw);
  const NONE: Record<string, string> = { agents: "the chat's pick", models: "all", contexts: "none", rules: "none", after: "none", login: "Illi's own" };
  if (text === "") {
    return NONE[key] ?? "none";
  }
  const file = text.startsWith(config.DIR + "/") ? text.slice(config.DIR.length + 1) : term_home(text);
  return ["pick", "agents", "compactor"].includes(key) ? text.split(":").slice(1).join(" ") : ["rules", "theme", "mcp", "login"].includes(key) ? file : text;
}

// a value cut to WIDE characters, an ellipsis at its end
function setting_cut(text: string): string {
  return text.length <= WIDE ? text : text.slice(0, WIDE - 1) + "…";
}

// a change, as a note says it: the value now, kept, when it applies
function setting_said(s: Setting): string {
  return s.key + ": " + setting_shown(s.key) + ", kept in " + term_home(config.DIR) + "/config.json; " + (s.now ? "it applies now." : "it applies at illi's next start.");
}
