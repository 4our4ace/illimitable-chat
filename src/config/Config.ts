// Config
// ======
// illi's settings. Its DIR holds config.json, the lock and the chat
// (chat/): the folder of the profile running (Profiles.ts), the ROOT
// itself ($ILLI_DIR, default ~/.illi) for the default. A profile's
// config.json goes over the root's, key by key; the ChatGPT login is the
// root's, shared. Each key of config.json (SETTINGS) may be set
// as ILLI_<KEY> instead; a path may start with "~/", and a relative one
// is taken from the folder of the config.json that names it (a
// variable's: the working folder). Each key set is checked at the start
// (config_check), so one that won't do stops illi with a word on why;
// a pick set that isn't offered here (a model or vendor gone) gives way
// to its default instead, told (NOTES). Illi's own pick defaults to the
// first vendor offered's (config_def). The providers stay apart: a
// chat's summaries and subagents run on its pick's vendor, each
// vendor's own (`compactor`, `agents`: a pick per vendor), never
// another's.
// /settings changes them (config_set), some at once, the rest at the
// next start. The API
// keys are read from the environment and removed from it, so no program
// an agent runs inherits them (config_env puts them back for a profile's
// switch).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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

// the picks set that aren't offered here, each given way to its default
// (config_gone), and what the start tells of them
const GONE = new Set<string>();
export const NOTES: string[] = [];

// a setting: its default ("": none); how /settings changes it (the
// values it steps through; "pick": in the model picker; "text": typed
// in); whether a change applies at once (read again by config_live, or
// by the terminal: Settings.ts) or at the next start; what it is, short
// (the picker shows it by the value); what holds while it's none; the
// shape its value takes (config_check), if any; whether it's a path. A
// pick's default here is chatgpt's: it follows the vendors (config_def);
// a role's (agents, compactor) is a pick per vendor, comma-separated
export type Setting = { def: string; values: string[] | "pick" | "text"; now: boolean; what: string; none?: string; shape?: [RegExp, string]; path?: boolean };

// every setting, in the order /settings lists them: a key read here
// (config_value) must be one, and one is all /settings, /set and
// config_check need; the README and the customize-illi skill say each
const TABLE = {
  pick       : { def: "chatgpt:gpt-6.1-sol:medium:slow", values: "pick", now: true, what: "illi's own default model" },
  agents     : { def: "", values: "pick", now: true, what: "what subagents run on, by provider", none: "the chat's pick" },
  compactor  : { def: "", values: "pick", now: true, what: "what writes the summaries, by provider", none: "each provider's small model" },
  suggest    : { def: "on", values: ["on", "off"], now: true, what: "suggested replies (Tab)", shape: [/^(on|off|true|false|0|1)$/i, "on or off"] },
  side       : { def: "right", values: ["right", "left", "off"], now: true, what: "where the side panel shows", shape: [/^(right|left|off)$/, "right, left or off"] },
  side_width : { def: "25%", values: ["20%", "25%", "30%", "35%", "40%"], now: true, what: "the side panel's width", shape: [/^\d+(\.\d+)?%?$/, "columns (40) or a share of the screen (30%)"] },
  context    : { def: "auto", values: ["auto", "50%", "60%", "70%", "80%", "90%"], now: true, what: "chat sent before summarizing", shape: [/^(auto|\d+|\d+(\.\d+)?%)$/, "auto, tokens (350000) or a share of the window (60%)"] },
  contexts   : { def: "", values: "text", now: true, what: "context by model, as JSON" },
  rules      : { def: DIR + "/RULES.md", values: "text", now: true, what: "your rules, every project", path: true },
  after      : { def: "", values: "text", now: true, what: "a command after each turn" },
  vendors    : { def: "chatgpt", values: "text", now: false, what: "where models come from" },
  models     : { def: "", values: "text", now: false, what: "the models offered", none: "all" },
  jobs       : { def: "8", values: ["2", "4", "8", "16", "32"], now: false, what: "summaries built at once", shape: [/^[1-9]\d*$/, "a number, 1 or more"] },
  theme      : { def: DIR + "/theme.json", values: "text", now: false, what: "the theme file", path: true },
  mcp        : { def: DIR + "/mcp.json", values: "text", now: false, what: "the MCP servers' file", path: true },
  login      : { def: "", values: "text", now: false, what: "the ChatGPT login file", none: "illi's own", path: true },
} satisfies Record<string, Setting>;
export type Key = keyof typeof TABLE;
export const SETTINGS: Record<Key, Setting> = TABLE;

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

// Illi's own pick on each vendor, by default: the first vendor
// offered's (config_def); the compactor each vendor's own, while
// `compactor` names none for it
const DEFS: Record<Vendor, { pick: string; compactor: string }> = {
  "claude-api": { pick: "claude-api:sonnet-5.5:medium:slow",  compactor: "claude-api:haiku-5.5:medium:slow" },
  "openai-api": { pick: "openai-api:gpt-6.1-sol:medium:slow", compactor: "openai-api:gpt-6-luna:medium:slow" },
  "chatgpt"   : { pick: TABLE.pick.def,                       compactor: "chatgpt:gpt-6-luna:medium:slow" },
};

// the settings that name a pick per vendor (a role's)
const ROLED = ["agents", "compactor"] as const;
type Role = (typeof ROLED)[number];
config_gone();

// the settings read anew as config_set changes one (config_live): the
// user's rules file (a system prompt's), a shell command after each turn,
// the model picks; the rest are read once
export let RULES      = "";
export let AFTER      = "";

// the theme's file (Theme.ts) and the user's MCP servers (Mcp.ts)
export const THEME    = config_place("theme");
export const MCP      = config_place("mcp");

// a suggested reply after each turn, Tab taking it (Chat.suggest): on,
// unless off (or false, 0)
export let SUGGEST    = true;

// the side panel (Term.ts): where it shows ("right", "left", "off"), how
// wide (columns, or a share of the screen: "25%")
export let SIDE       = "";
export let SIDE_WIDTH = "";

// Illi's own pick (a new chat's, and the chat's again after an agent);
// the picks each role names, by vendor (config_role)
export let PICK!     : Pick;
let ROLES: Record<Role, Partial<Record<Vendor, Pick>>> = { agents: {}, compactor: {} };

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
config_start();
config_live();
export const CONTEXT    = Number(CONTEXT_SET) > 0 ? Number(CONTEXT_SET) : AUTO_MOST;

// how many summaries of a side build at once (Memory.ts): few, so a
// plan's rate limit holds them
export const JOBS       = Number(config_value("jobs"));

// the ChatGPT login chatgpt runs on (ChatGPT.ts): the file `login` names,
// else Illi's own (/login makes it; the root's, so every profile's) or,
// while there is none, opencode's (`opencode auth login`)
export const LOGIN_SET      = config_value("login") === "" ? null : config_place("login");
export const OWN_LOGIN      = ROOT + "/login.json";
export const OPENCODE_LOGIN = config_path((process.env.XDG_DATA_HOME ?? "~/.local/share") + "/opencode/auth.json");

// the keys, by name, and the variable each is read from
export const VARS: Record<string, string> = {
  anthropic       : "ANTHROPIC_API_KEY",
  openai          : "OPENAI_API_KEY",
};

// the vendor that runs on each key
const KEYED: Record<string, Vendor> = {
  anthropic       : "claude-api",
  openai          : "openai-api",
};
export const KEYS: Record<string, string> = Object.fromEntries(Object.entries(VARS).map(([name, v]) => [name, config_key(v)]));

// Config
// ======

// a key's value, its default if none is set
export function config_value(key: Key): string {
  return (config_raw(key) as string | undefined) ?? config_def(key);
}

// a key as set (a variable over config.json); undefined: not set, or a
// pick that gave way (GONE)
function config_raw(key: Key): unknown {
  return GONE.has(key) ? undefined : process.env["ILLI_" + key.toUpperCase()] ?? FILE[key];
}

// a key's default: for Illi's own pick, the first vendor's (DEFS) that
// offer has, else its first model at medium effort (none offered:
// SETTINGS'); for the rest, SETTINGS'
export function config_def(key: Key, offer?: Offer): string {
  if (key !== "pick") {
    return SETTINGS[key].def;
  }
  const on    = offer ?? OFFER;
  const def   = on.vendors.map((v) => DEFS[v].pick).find((text) => Pick.read(config_split(text), on) !== null);
  const first = Pick.models(on.vendors, on.models)[0];
  return def ?? (first === undefined ? SETTINGS[key].def : Pick.label({ vendor: first[0], model: first[1].label, effort: "medium", speed: first[1].speeds[0] }));
}

// where a key is set: its variable, else the config.json that sets it
function config_where(key: Key): string {
  return config_env_set(key) ?? (key in config_file(PATH) ? PATH : ROOT + "/config.json");
}

// the picks set as vendor:model:effort:speed that aren't offered here (a
// model or vendor gone since) given way to their defaults, each told
// (NOTES) with where it's set; one not of that shape is left to
// config_start, which stops illi. A role's pick of a vendor not offered
// waits till it is, untold
function config_gone(): void {
  const told = (key: Key, raw: string, def: string) => NOTES.push(key + " " + raw + " isn't offered here, so illi runs on " + def + " instead: change it in " + config_where(key) + (config_env_set(key) === null ? " or with /settings." : "."));
  const raw = config_raw("pick");
  if (typeof raw === "string" && raw.split(":").length === 4 && Pick.read(config_split(raw), OFFER) === null) {
    GONE.add("pick");
    told("pick", raw, config_value("pick"));
  }
  for (const key of ROLED) {
    const set = config_raw(key);
    const own = typeof set === "string" ? config_list(set).filter((text) => text.split(":").length === 4) : [];
    for (const text of own.filter((text) => OFFER.vendors.includes(text.split(":")[0] as Vendor) && Pick.read(config_split(text), OFFER) === null)) {
      const vendor = text.split(":")[0] as Vendor;
      told(key, text, key === "agents" ? "the chat's pick" : DEFS[vendor].compactor);
    }
  }
}

// what the start tells of the API keys (KEYS): one set whose vendor isn't
// offered, and how to use it (the vendors listed: a key's first while
// there is no ChatGPT login); the key missing that the pick runs on
export function config_tips(pick: Pick, signed: boolean): string[] {
  const tips: string[] = [];
  const env  = config_env_set("vendors");
  for (const [name, vendor] of Object.entries(KEYED)) {
    if (KEYS[name] !== "" && !OFFER.vendors.includes(vendor)) {
      const list = (signed ? [...OFFER.vendors, vendor] : [vendor, ...OFFER.vendors]).join(",");
      tips.push(VARS[name] + " is set, but illi doesn't offer " + vendor + ": " + (env === null ? "/set vendors " + list : env + "=" + list) + ", then start illi again.");
    }
    if (KEYS[name] === "" && pick.vendor === vendor) {
      tips.push("The chat runs on " + vendor + ", but " + VARS[name] + " isn't set: set it and start illi again, or /model picks another.");
    }
  }
  return tips;
}

// the variable that sets a key over config.json, if it's set; else null
export function config_env_set(key: Key): string | null {
  const name = "ILLI_" + key.toUpperCase();
  return process.env[name] === undefined ? null : name;
}

// the pick a setting names (a "pick" one's), as offered; none: null
export function config_pick(key: Key): Pick | null {
  const text = config_value(key);
  return text === "" ? null : config_run(key, text);
}

// what a role runs on for a chat on `pick`, always its vendor: the pick
// the role's setting names for that vendor, else (the compactor) the
// vendor's own default, else the chat's pick itself
export function config_role(key: Role, pick: Pick): Pick {
  const def = key === "compactor" ? Pick.read(config_split(DEFS[pick.vendor].compactor), OFFER) : null;
  return ROLES[key][pick.vendor] ?? def ?? pick;
}

// a role's setting with `pick` in its vendor's place, the other vendors'
// kept
export function config_role_set(key: Role, pick: Pick): string {
  const rest = config_list(config_value(key)).filter((text) => text !== "" && text.split(":")[0] !== pick.vendor);
  return [...rest, Pick.label(pick)].join(",");
}

// each key set (in a config.json or a variable) checked as /set checks
// one; one that won't do throws, saying where it's set
function config_start(): void {
  for (const key of Object.keys(SETTINGS) as Key[]) {
    const raw = config_raw(key);
    const why = raw === undefined ? null : config_check(key, raw, false);
    if (why !== null) {
      throw new Error("config: " + why + " (" + (config_env_set(key) ?? "config.json") + ")");
    }
  }
}

// the settings config_set may change while illi runs, read again: all
// read first, then all kept, so one that won't read leaves them as they
// were
function config_live(): void {
  const pick   = config_run("pick", config_value("pick"));
  const roles  = { agents: config_roles("agents", config_value("agents"), OFFER, false), compactor: config_roles("compactor", config_value("compactor"), OFFER, false) };
  const own    = config_contexts(config_value("contexts"));
  RULES       = config_place("rules");
  AFTER       = config_value("after");
  SUGGEST     = !["off", "false", "0"].includes(String(config_value("suggest")).trim().toLowerCase());
  SIDE        = config_value("side");
  SIDE_WIDTH  = config_value("side_width");
  PICK        = pick;
  ROLES       = roles;
  CONTEXT_SET = String(config_value("context")).trim();
  CONTEXTS    = own ?? {};
}

// `contexts` as an object (a variable's, or text, parsed as JSON); none:
// {}; null: not one
function config_contexts(value: unknown): Record<string, unknown> | null {
  try {
    const got = typeof value === "string" ? (value.trim() === "" ? {} : JSON.parse(value)) : value ?? {};
    return typeof got === "object" && got !== null && !Array.isArray(got) ? got : null;
  } catch {
    return null;
  }
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
export function config_set(key: Key, value: unknown): void {
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
  GONE.delete(key);
  config_live();
}

// why a key can't take a value (null: it can), the other keys as they
// are: its shape (a number or a yes taken as its text); the picks
// offered both by this illi (read anew at once) and at the next start (a
// vendor or a model taken out may leave one that won't start; one added
// is offered only then). A pick not set is its default on the vendors
// then (config_def), so only one set must be offered now. A role's picks
// (one per vendor) must each be offered if their vendor is, the key's
// being set (`strict`; else, as at the start, one not offered waits); one
// of a vendor not offered waits till it is. A file named needn't be
// there: none is none
export function config_check(key: string, value: unknown, strict = true): string | null {
  if (!(key in SETTINGS)) {
    return "No setting " + key + ". The settings: " + Object.keys(SETTINGS).join(", ") + ".";
  }
  const shape = SETTINGS[key as Key].shape;
  const plain = typeof value === "number" || typeof value === "boolean" ? String(value) : value;
  const text  = plain === null ? config_default(key as Key) : typeof plain === "string" ? plain.trim() : "";
  const get   = (k: Key) => (k === key ? text : config_value(k));
  const set   = (k: Key) => k === key || config_raw(k) !== undefined;
  if (key === "contexts") {
    const got = value === null ? {} : config_contexts(value);
    const bad = got === null || Object.values(got).some((v) => !SETTINGS.context.shape![0].test(String(v)));
    return bad ? "contexts takes each model's context, like {\"gpt-6.1-sol\": 350000}." : null;
  }
  if (typeof plain !== "string" && plain !== null) {
    return key + " takes text.";
  }
  if (shape !== undefined && !shape[0].test(text)) {
    return key + " takes " + shape[1] + ".";
  }
  const later = { vendors: OFFER.vendors, models: OFFER.models };
  try {
    later.vendors = config_vendors(get("vendors"));
    later.models  = key === "models" ? config_list(text || LABELS.join()) : OFFER.models;
    config_run("pick", set("pick") ? get("pick") : config_def("pick", later), later);
    for (const k of ROLED) {
      config_roles(k, get(k), later, strict && k === key);
    }
  } catch (err: any) {
    return err.message.replace(/^config: /, "");
  }
  const now = (text: string) => Pick.read(config_split(text), OFFER) !== null;
  const own = ROLED.includes(key as Role) && strict ? config_list(text).filter((one) => OFFER.vendors.includes(one.split(":")[0] as Vendor)) : [];
  const off = [...(set("pick") && !now(get("pick")) ? ["pick " + get("pick")] : []), ...own.filter((one) => !now(one)).map((one) => key + " " + one)];
  if (off.length > 0) {
    return off[0] + " is offered from the next start (vendors and models change then): set it once illi starts again.";
  }
  return null;
}

// a path a setting names, "~/" the home folder, a relative one taken from
// base (none: kept as it is)
function config_path(text: string, base?: string): string {
  const home = text.startsWith("~/") ? os.homedir() + text.slice(1) : text;
  return base === undefined || home === "" ? home : path.resolve(base, home);
}

// the path a key names, from the folder of the config.json that sets it
function config_place(key: Key): string {
  return config_path(config_value(key), config_base(key));
}

// the folder a key's relative path is taken from: the working folder for
// a variable's, else that of the config.json that sets it (the profile's,
// or the root's under it)
function config_base(key: Key): string {
  return config_env_set(key) !== null ? process.cwd() : key in config_file(PATH) ? DIR : ROOT;
}

// a role's setting read: its picks by vendor, one each; one of a vendor
// not offered waits till it is; one of an offered vendor that isn't
// offered throws (`strict`), else waits too
function config_roles(key: Role, text: string, offer = OFFER, strict = true): Partial<Record<Vendor, Pick>> {
  const roles: Partial<Record<Vendor, Pick>> = {};
  const seen = new Set<Vendor>();
  for (const one of config_list(text).filter((one) => one !== "")) {
    const vendor = one.split(":")[0] as Vendor;
    if (one.split(":").length !== 4 || !VENDORS.includes(vendor)) {
      throw new Error("config: " + key + " takes a vendor:model:effort:speed per provider, comma-separated: " + one);
    }
    if (seen.has(vendor)) {
      throw new Error("config: " + key + " takes one pick per provider: two for " + vendor);
    }
    seen.add(vendor);
    const pick = offer.vendors.includes(vendor) ? Pick.read(config_split(one), offer) : null;
    if (pick === null && strict && offer.vendors.includes(vendor)) {
      config_run(key, one, offer);
    }
    if (pick !== null) {
      roles[vendor] = pick;
    }
  }
  return roles;
}

function config_run(key: string, text: string, offer = OFFER): Pick {
  const pick = Pick.read(config_split(text), offer);
  if (pick === null) {
    throw new Error("config: " + key + " is no vendor:model:effort:speed offered here: " + text);
  }
  return pick;
}

// a pick's text, in its parts
function config_split(text: string): { vendor: string; model: string; effort: string; speed: string } {
  const [vendor, model, effort, speed] = text.split(":");
  return { vendor, model, effort, speed };
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

// what a key comes back to with config.json's own entry taken out
// (/set key default, Delete in /settings): in a profile, the root's
// config.json's, else its default
export function config_default(key: Key): string {
  const root = PATH === ROOT + "/config.json" ? undefined : config_file(ROOT + "/config.json")[key];
  return root === undefined ? config_def(key) : typeof root === "string" ? root : JSON.stringify(root);
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
