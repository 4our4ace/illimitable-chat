// Config
// ======
// illi's settings. Its DIR holds config.json, the lock and the chat
// (chat/): the folder of the profile running (Profiles.ts), the ROOT
// itself ($ILLI_DIR, default ~/.illi) for the default. A profile's
// config.json goes over the root's, key by key; the ChatGPT login is the
// root's, shared. Each key of config.json (README, DEFAULTS) may be set
// as ILLI_<KEY> instead; a path may start with "~/". /settings changes
// them (config_set), some at once, the rest at the next start. The API
// keys are read from the environment and removed from it, so no program
// an agent runs inherits them (config_env puts them back for a profile's
// switch).

import * as fs from "node:fs";
import * as os from "node:os";
import type { Vendor } from "../ai/AskAI.ts";
import { LABELS, VENDORS, Pick, type Offer } from "../ai/Pick.ts";
import { profile_pick } from "./Profiles.ts";

// Constants
// =========

// the root (the default profile's folder, and the others'), the profile
// running ($ILLI_PROFILE, else the one used last) and its folder
const PICKED         = profile_pick(config_path(process.env.ILLI_DIR ?? "~/.illi"), process.env.ILLI_PROFILE);
export const ROOT    = PICKED.root;
export const PROFILE = PICKED.name;
export const DIR     = PICKED.dir;

const PATH = DIR + "/config.json";
let FILE: Record<string, unknown> = config_files();

// each key's value while config.json and the environment set none
// ("": none; models: all offered; agents: the chat's pick)
export const DEFAULTS: Record<string, string> = {
  vendors    : "chatgpt",
  pick       : "chatgpt:gpt-6.1-sol:medium:slow",
  compactor  : "chatgpt:gpt-6-luna:medium:slow",
  agents     : "",
  models     : "",
  context    : "auto",
  contexts   : "",
  rules      : "",
  after      : "",
  side       : "right",
  side_width : "25%",
  suggest    : "on",
  jobs       : "8",
  login      : "",
  theme      : DIR + "/theme.json",
  mcp        : DIR + "/mcp.json",
};

// the models the vendors listed last (ChatGPT.ts models), learned before
// the offer is made: a new one is offered (unless `models` names those
// offered), each one's window known; kept in the root, every profile's
export const MODELS_FILE = ROOT + "/models.json";
export const MODELS_SET  = config_value("models") !== "";
config_models();

export const OFFER: Offer = {
  vendors : config_vendors(config_value("vendors")),
  models  : config_list(config_value("models") || LABELS.join()),
};

// the settings read anew as config_set changes one (Live): the user's
// rules file (a system prompt's), a shell command after each turn, the
// model picks; the rest are read once
export let RULES      = "";
export let AFTER      = "";
export const THEME    = config_path(config_value("theme"));

// the user's MCP servers (Mcp.ts)
export const MCP      = config_path(config_value("mcp"));

// a suggested reply after each turn, Tab taking it (Chat.suggest): on,
// unless off (or false, 0)
export let SUGGEST    = true;

// the side panel (Term.ts): where it shows ("right", "left", "off"), how
// wide (columns, or a share of the screen: "25%")
export let SIDE       = "";
export let SIDE_WIDTH = "";

// Illi's own pick (a new chat's, and the chat's again after an agent);
// what every compaction runs on, a chat's and an import's alike,
// whatever the chat's pick; what subagents run on (null: the chat's pick)
export let PICK!     : Pick;
export let COMPACTOR!: Pick;
export let AGENTS    : Pick | null = null;

// how much of the chat a turn sends (Memory.cutoff), in tokens (4 bytes
// each), on a model: its `contexts` entry, else `context`: a number of
// tokens, a share of its window ("60%"), or "auto": AUTO of its window,
// at most AUTO_MOST; never past FULL of it. A model whose window no one
// told is taken to have GUESS. CONTEXT: as many as `context` names at
// the start, or AUTO_MOST (what a call holds before any model is known)
const AUTO      = 0.7;
const AUTO_MOST = 400000;
const FULL      = 0.9;
export const GUESS      = 128000;
let CONTEXT_SET         = "";
let CONTEXTS: Record<string, unknown> = {};
config_live();
export const CONTEXT    = Number(CONTEXT_SET) > 0 ? Number(CONTEXT_SET) : AUTO_MOST;

// how many summaries of a side build at once (Memory.ts): few, so a
// plan's rate limit holds them
export const JOBS       = Number(config_value("jobs"));

// the ChatGPT login chatgpt runs on (ChatGPT.ts): the file `login` names,
// else Illi's own (/login makes it; the root's, so every profile's) or,
// while there is none, opencode's (`opencode auth login`)
export const LOGIN_SET      = config_value("login") === "" ? null : config_path(config_value("login"));
export const OWN_LOGIN      = ROOT + "/login.json";
export const OPENCODE_LOGIN = config_path((process.env.XDG_DATA_HOME ?? "~/.local/share") + "/opencode/auth.json");

// the keys, by name, and the variable each is read from
const VARS: Record<string, string> = {
  anthropic       : "ANTHROPIC_API_KEY",
  openai          : "OPENAI_API_KEY",
};
export const KEYS: Record<string, string> = Object.fromEntries(Object.entries(VARS).map(([name, v]) => [name, config_key(v)]));

// Config
// ======

export function config_get(key: string, def: string): string {
  return process.env["ILLI_" + key.toUpperCase()] ?? (FILE[key] as string | undefined) ?? def;
}

// a key's value, its default (DEFAULTS) if none is set
export function config_value(key: string): string {
  return config_get(key, DEFAULTS[key] ?? "");
}

// the variable that sets a key over config.json, if it's set; else null
export function config_env_set(key: string): string | null {
  const name = "ILLI_" + key.toUpperCase();
  return process.env[name] === undefined ? null : name;
}

// the settings config_set may change while illi runs, read again
function config_live(): void {
  const agents = config_value("agents");
  const own    = FILE.contexts;
  RULES       = config_path(config_value("rules"));
  AFTER       = config_value("after");
  SUGGEST     = !["off", "false", "0"].includes(String(config_value("suggest")).trim().toLowerCase());
  SIDE        = config_value("side");
  SIDE_WIDTH  = config_value("side_width");
  PICK        = config_run("pick", config_value("pick"));
  COMPACTOR   = config_run("compactor", config_value("compactor"));
  AGENTS      = agents === "" ? null : config_run("agents", agents);
  CONTEXT_SET = String(config_value("context")).trim();
  CONTEXTS    = (typeof own === "object" && own !== null ? own : {}) as Record<string, unknown>;
}

// the tokens of the chat a turn sends on a model (CONTEXT's rules), its
// window as known (none: GUESS)
export function config_context(label: string, window = GUESS): number {
  const set    = String(CONTEXTS[label] ?? CONTEXT_SET).trim();
  const share  = /^(\d+(?:\.\d+)?)%$/.exec(set);
  const tokens = set === "auto" ? Math.min(AUTO_MOST, window * AUTO) : share !== null ? (window * Number(share[1])) / 100 : Number(set);
  return Math.round(Math.min(tokens > 0 ? tokens : Math.min(AUTO_MOST, window * AUTO), window * FULL));
}

// the models listed last, learned (a file that won't read: none)
function config_models(): void {
  try {
    const kept = JSON.parse(fs.readFileSync(MODELS_FILE, "utf8"));
    for (const vendor of Object.keys(kept.vendors ?? {})) {
      if (VENDORS.includes(vendor as Vendor)) {
        Pick.learn(vendor as Vendor, kept.vendors[vendor]);
      }
    }
  } catch {}
}

// a key set in config.json (null: taken out, so its default holds), the
// file's other keys kept; what changes while illi runs (config_live) is
// read again, the rest at the next start. One that won't do (config_check)
// throws, the file untouched
export function config_set(key: string, value: unknown): void {
  const why = config_check(key, value);
  if (why !== null) {
    throw new Error(why);
  }
  const file = fs.existsSync(PATH) ? JSON.parse(fs.readFileSync(PATH, "utf8")) : {};
  if (value === null) {
    delete file[key];
  } else {
    file[key] = value;
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(PATH, JSON.stringify(file, null, 2) + "\n");
  FILE = config_files();
  config_live();
}

// why a key can't take a value (null: it can), the other keys as they
// are: its shape; the picks offered still (a vendor or a model taken out
// may leave one that won't start)
export function config_check(key: string, value: unknown): string | null {
  const text = value === null ? DEFAULTS[key] ?? "" : typeof value === "string" ? value.trim() : "";
  const get  = (k: string) => (k === key ? text : config_value(k));
  const SHAPES: Record<string, [RegExp, string]> = {
    suggest    : [/^(on|off|true|false|0|1)$/i, "on or off"],
    side       : [/^(right|left|off)$/, "right, left or off"],
    side_width : [/^\d+(\.\d+)?%?$/, "columns (40) or a share of the screen (30%)"],
    context    : [/^(auto|\d+|\d+(\.\d+)?%)$/, "auto, tokens (350000) or a share of the window (60%)"],
    jobs       : [/^[1-9]\d*$/, "a number, 1 or more"],
  };
  if (!(key in DEFAULTS)) {
    return "No setting " + key + ". The settings: " + Object.keys(DEFAULTS).join(", ") + ".";
  }
  if (key === "contexts") {
    const bad = value !== null && (typeof value !== "object" || Array.isArray(value) || Object.values(value).some((v) => !SHAPES.context[0].test(String(v))));
    return bad ? "contexts takes each model's context, like {\"gpt-6.1-sol\": 350000}." : null;
  }
  if (typeof value !== "string" && value !== null) {
    return key + " takes text.";
  }
  if (key in SHAPES && !SHAPES[key][0].test(text)) {
    return key + " takes " + SHAPES[key][1] + ".";
  }
  if (key === "rules" && text !== "" && !fs.existsSync(config_path(text))) {
    return "No file " + text + " for the rules.";
  }
  try {
    const offer = { vendors: config_vendors(get("vendors")), models: key === "models" ? config_list(text || LABELS.join()) : OFFER.models };
    for (const k of ["pick", "compactor", "agents"].filter((k) => get(k) !== "")) {
      config_run(k, get(k), offer);
    }
  } catch (err: any) {
    return err.message.replace(/^config: /, "");
  }
  return null;
}

function config_path(path: string): string {
  return path.startsWith("~/") ? os.homedir() + path.slice(1) : path;
}

function config_run(key: string, text: string, offer = OFFER): Pick {
  const [vendor, model, effort, speed] = text.split(":");
  const pick = Pick.read({ vendor, model, effort, speed }, offer);
  if (pick === null) {
    throw new Error("config: " + key + " is no vendor:model:effort:speed offered here: " + text);
  }
  return pick;
}

function config_vendors(text: string): Vendor[] {
  const list = config_list(text) as Vendor[];
  const bad = list.find((v) => !VENDORS.includes(v));
  if (bad !== undefined) {
    throw new Error("config: vendors can't offer " + bad);
  }
  return list;
}

function config_key(name: string): string {
  const key = (process.env[name] ?? "").trim();
  delete process.env[name];
  return key;
}

// a comma-separated list's items
function config_list(text: string): string[] {
  return text.split(",").map((x) => x.trim());
}

// the root's config.json, the profile's over it, key by key
function config_files(): Record<string, unknown> {
  return { ...config_file(ROOT + "/config.json"), ...config_file(PATH) };
}

// a config.json's keys ({}: none); one that won't read says which
function config_file(path: string): Record<string, unknown> {
  try {
    return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : {};
  } catch (err: any) {
    throw new Error("config: " + path + ": " + err.message);
  }
}

// the environment as illi found it, the keys it took out put back: what
// a profile's switch starts illi again with
export function config_env(): Record<string, string> {
  const keys = Object.entries(VARS).filter(([name]) => KEYS[name] !== "").map(([name, v]) => [v, KEYS[name]]);
  return { ...(process.env as Record<string, string>), ...Object.fromEntries(keys) };
}
