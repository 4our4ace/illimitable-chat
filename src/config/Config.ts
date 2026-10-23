// Config
// ======
// illi's settings. Its DIR holds config.json, the lock and the chat
// (chat/): the folder of the profile running (Profiles.ts), the ROOT
// itself ($ILLI_DIR, default ~/.illi) for the default. The root is the
// global layer, every profile's: a profile's config.json goes over the
// root's, key by key (its lists of names, off and sticky, added to the
// root's); its own RULES.md and theme.json over the root's, if
// it has them; the ChatGPT login is the root's, shared. Each key of config.json (SETTINGS) may be set
// as ILLI_<KEY> instead; a path may start with "~/", and a relative one
// is taken from the folder of the config.json that names it (a
// variable's: the working folder). Each key set is checked at the start
// (config_check), so one that won't do stops illi with a word on why;
// a pick set that isn't offered here (a model or vendor gone) gives way
// to its default instead, told (NOTES). illi's own pick defaults to the
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
import type { Mode } from "./Update.ts";
import { json_object } from "../tools/Clip.ts";

// Constants
// =========

// the root (the default profile's folder, and the others'), the profile
// running ($ILLI_PROFILE, else the one used last in the working folder's
// project, else the one used last anywhere: Profiles.profile_pick) and
// its folder
const PICKED         = profile_pick(config_path(process.env.ILLI_DIR ?? "~/.illi"), process.env.ILLI_PROFILE);
export const ROOT    = PICKED.root;
export const PROFILE = PICKED.name;
export const DIR     = PICKED.dir;

// the settings that are lists of names: a profile's adds to the root's,
// so what is off or on globally is so in every profile
const ADDS = ["off", "sticky"];

// the settings read under an old name too, as their new one: in a
// config.json (each file alone, its new key winning) and as a variable
// (ILLI_CONTEXT); "auto", the old default, as none
const RENAMED: Record<string, string> = { context: "autocompact", contexts: "autocompacts" };

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

// an on/off setting's shape, and the words that turn one off
const ON_OFF: [RegExp, string] = [/^(on|off|true|false|0|1)$/i, "on or off"];
const OFFS = ["off", "false", "0"];

// the accent's values /settings steps through: the theme's own (auto),
// illi's aqua, the terminal's own colors by name (Theme.NAMED); /set
// takes a palette index or #rrggbb too
const ACCENTS = ["auto", "illi", "blue", "magenta", "cyan", "green", "yellow", "red"];

// every setting, in the order /settings lists them: a key read here
// (config_value) must be one, and one is all /settings, /set and
// config_check need; docs/config.md and the customize-illi skill say each
const TABLE = {
  pick       : { def: "chatgpt:gpt-6.1-sol:medium:slow", values: "pick", now: true, what: "illi's own default model" },
  agents     : { def: "", values: "pick", now: true, what: "what subagents run on, by provider", none: "the chat's pick" },
  compactor  : { def: "", values: "pick", now: true, what: "what writes the summaries, by provider", none: "each provider's small model" },
  suggest    : { def: "on", values: ["on", "off"], now: true, what: "suggested replies (Tab)", shape: ON_OFF },
  tps        : { def: "on", values: ["on", "off"], now: true, what: "tokens a second while text streams", shape: ON_OFF },
  statusline : { def: "", values: "text", now: true, what: "a command drawing lines at the foot", none: "none" },
  title      : { def: "on", values: ["on", "off"], now: true, what: "the terminal's title: ∞ illi · project", shape: ON_OFF },
  side       : { def: "right", values: ["right", "left", "off"], now: true, what: "where the side panel shows", shape: [/^(right|left|off)$/, "right, left or off"] },
  side_width : { def: "25%", values: ["20%", "25%", "30%", "35%", "40%"], now: true, what: "the side panel's width", shape: [/^\d+(\.\d+)?%?$/, "columns (40) or a share of the screen (30%)"] },
  accent     : { def: "auto", values: ACCENTS, now: true, what: "the color everything is themed in", shape: [new RegExp("^(" + ACCENTS.join("|") + "|#[0-9a-f]{6}|25[0-5]|2[0-4]\\d|1?\\d?\\d)$", "i"), "auto, illi (its aqua), a color's name (" + ACCENTS.slice(2).join(", ") + "), a palette index (0-255) or #rrggbb"] },
  leader     : { def: "Ctrl+X", values: "text", now: true, what: "the key before a shortcut", shape: [/^(ctrl|alt)\+[a-z]$/i, "Ctrl or Alt and a letter, like Ctrl+X"] },
  shortcuts  : { def: "", values: "text", now: true, what: "the keys after the leader, as JSON", none: "illi's own" },
  autocompact : { def: "60%", values: ["40%", "50%", "60%", "70%"], now: true, what: "chat sent before older messages fold, of the model's window", shape: [/^(\d+(\.\d+)?k?|\d+(\.\d+)?%)$/i, "a share of the window (60%) or tokens (400000, 400k)"] },
  autocompacts: { def: "", values: "text", now: true, what: "autocompact by model, as JSON" },
  rules      : { def: config_own("RULES.md"), values: "text", now: true, what: "your rules, every project", path: true },
  after      : { def: "", values: "text", now: true, what: "a command after each turn" },
  off        : { def: "", values: "text", now: true, what: "skills, agents, commands, MCP servers, plugins (or a plugin's part, as plugin:name) and hooks.json turned off", none: "none" },
  sticky     : { def: "", values: "text", now: true, what: "sticky skills on, in every turn", none: "none" },
  mode       : { def: "auto", values: ["auto", "ask", "read-only", "yolo"], now: true, what: "what runs without asking", shape: [/^(read-only|ask|auto|yolo)$/, "read-only, ask, auto or yolo"] },
  permissions: { def: DIR + "/permissions.json", values: "text", now: false, what: "your permission rules and grants", path: true },
  vendors    : { def: "chatgpt", values: "text", now: false, what: "where models come from" },
  models     : { def: "", values: "text", now: false, what: "the models offered", none: "all" },
  jobs       : { def: "8", values: ["2", "4", "8", "16", "32"], now: false, what: "summaries built at once", shape: [/^[1-9]\d*$/, "a number, 1 or more"] },
  theme      : { def: config_own("theme.json"), values: "text", now: false, what: "the theme file", path: true },
  mcp        : { def: DIR + "/mcp.json", values: "text", now: false, what: "the MCP servers' file", path: true },
  login      : { def: "", values: "text", now: false, what: "the ChatGPT login file", none: "illi's own", path: true },
  autoupdate : { def: "on", values: ["on", "notify", "off"], now: false, what: "illi updating itself", shape: [/^(on|notify|off|true|false|0|1)$/i, "on, notify or off"] },
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

// illi's own pick on each vendor, by default: the first vendor
// offered's (config_def); the compactor each vendor's own, while
// `compactor` names none for it
const DEFS: Record<Vendor, { pick: string; compactor: string }> = {
  "claude-api" : { pick: "claude-api:sonnet-5.5:medium:slow",  compactor: "claude-api:haiku-5.5:medium:slow" },
  "openai-api" : { pick: "openai-api:gpt-6.1-sol:medium:slow", compactor: "openai-api:gpt-6-luna:medium:slow" },
  "chatgpt"    : { pick: TABLE.pick.def,                       compactor: "chatgpt:gpt-6-luna:medium:slow" },
  "claude-code": { pick: "claude-code:opus-5.5:medium:slow",   compactor: "claude-code:haiku-5.5:medium:slow" },
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

// the theme's file (Theme.ts) and the user's MCP servers (Mcp.ts): in a
// profile, the root's mcp.json too, its servers under the profile's
export const THEME    = config_place("theme");
export const MCP      = config_place("mcp");
export const MCPS     = DIR === ROOT ? [MCP] : [...new Set([ROOT + "/mcp.json", MCP])];

// the user's permission rules and the grants kept (Permissions.ts); a
// mode of yolo set is said at the start, as nothing is asked then
export const PERMISSIONS = config_place("permissions");
if (config_value("mode") === "yolo") {
  NOTES.push("mode is yolo: every call runs unasked, but what your permission rules refuse or ask. /mode switches it for this session.");
}

// the skills, agents, commands, MCP servers, plugins and hooks turned
// off, and the sticky skills on, by name, in lower case (Custom.ts,
// Mcp.ts, Plugins.ts, Hooks.ts); each the root's list and the profile's
// together (ADDS)
export let OFF: string[] = [];
export let STICKY: string[] = [];

// whether a skill, agent, command or MCP server is turned off (OFF)
export function config_off(name: string): boolean {
  return OFF.includes(name.toLowerCase());
}

// whether a sticky skill is on (STICKY)
export function config_sticky(name: string): boolean {
  return STICKY.includes(name.toLowerCase());
}

// a list's own names (ADDS), in lower case: the root's config.json's
// (root), else the running profile's
export function config_names(key: "off" | "sticky", root: boolean): string[] {
  return config_list(String(config_file(root ? ROOT + "/config.json" : PATH)[key] ?? "").toLowerCase()).filter((name) => name !== "");
}

// a suggested reply after each turn, Tab taking it (Suggest.ask): on,
// unless off (or false, 0)
export let SUGGEST    = true;

// the models' speed on the line over the input while text streams
// (tok/s, Frame.ts): on, unless off (or false, 0)
export let TPS        = true;

// the terminal's title (Frame.ts term_title): on, unless off (or false,
// 0)
export let TITLE      = true;

// the status line (Status.ts): a shell command of the user's drawing rows
// at the screen's foot, the spaces before each, how often it runs again
// of itself (s; 0: only as what it is told changes); null: none
export type Statusline = { command: string; padding: number; refresh: number };
const REFRESH_MOST = 86400;
export let STATUSLINE: Statusline | null = null;

// the side panel (Term.ts): where it shows ("right", "left", "off"), how
// wide (columns, or a share of the screen: "25%")
export let SIDE       = "";
export let SIDE_WIDTH = "";

// the accent (Theme.theme_tokens): "auto" (the theme's own), illi's
// aqua, a color's name, a palette index or #rrggbb
export let ACCENT     = "";

// the leader (Commands.ts term_lead), as a key's name ("Ctrl+X"), and the
// shortcuts: a key after it (a character; a letter either case) and what
// it runs (a /command with its words, or a key's name: Ctrl+Y), illi's
// with the user's over them ("" drops one). Not a key illi takes (the
// input's editing keys take theirs first), nor one a terminal sends as
// another (Ctrl+M is Enter, Ctrl+I Tab...)
export let LEADER     = "";
export let SHORTCUTS: Record<string, string> = {};
export const OWN_SHORTCUTS: Record<string, string> = { a: "/agent", e: "/effort", h: "/help", l: "/projects", m: "/model", p: "/profile", s: "/settings", t: "/tab", y: "Ctrl+Y" };
export const TAKEN = ["Ctrl+A", "Ctrl+C", "Ctrl+D", "Ctrl+E", "Ctrl+F", "Ctrl+H", "Ctrl+I", "Ctrl+J", "Ctrl+K", "Ctrl+L", "Ctrl+M", "Ctrl+O", "Ctrl+P", "Ctrl+U", "Ctrl+V", "Ctrl+W", "Ctrl+Y", "Ctrl+Z", "Alt+B", "Alt+D", "Alt+F", "Alt+V"];

// illi's own pick (a new chat's, and the chat's again after an agent);
// the picks each role names, by vendor (config_role)
export let PICK!     : Pick;
let ROLES: Record<Role, Partial<Record<Vendor, Pick>>> = { agents: {}, compactor: {} };

// how much of the chat a turn sends before older messages fold into the
// tree (its autocompact: Memory.cutoff), in tokens (4 bytes each), on a
// model: its `autocompacts` entry, else `autocompact`: a share of its
// window ("60%") or tokens ("400000", "400k"); at most MOST of the
// window. ROOM: what of the window a turn may read before it ends to
// fold more (Chat.ts, Agent.ts), what the prompt and tools take beside
// the chat left out of the autocompact too. A model whose window no one
// told is taken to have GUESS
export const MOST       = 0.7;
export const ROOM       = 0.9;
export const GUESS      = 128000;
let AUTOCOMPACT_SET     = "";
let AUTOCOMPACTS: Record<string, unknown> = {};

config_start();
config_live();
if (STATUSLINE === null && String(config_raw("statusline") ?? "").trim() !== "") {
  NOTES.push("statusline isn't a command or Claude Code's statusLine object (" + config_where("statusline") + "), so there is none: /set statusline <command> sets one.");
}
// how many summaries of a side build at once (Memory.ts): few, so a
// plan's rate limit holds them
export const JOBS       = Number(config_value("jobs"));

// what illi does with a new release of itself (Update.ts), looked for as
// it starts: installs it ("on", true), only tells of it ("notify"), never
// looks (off, false, 0)
export const AUTOUPDATE: Mode = config_update(String(config_value("autoupdate")).trim().toLowerCase());

// the ChatGPT login chatgpt runs on (ChatGPT.ts): the file `login` names,
// else illi's own (/login makes it; the root's, so every profile's) or,
// while there is none, opencode's (`opencode auth login`)
export const LOGIN_SET      = config_value("login") === "" ? null : config_place("login");
export const OWN_LOGIN      = ROOT + "/login.json";
export const OPENCODE_LOGIN = config_path((process.env.XDG_DATA_HOME ?? "~/.local/share") + "/opencode/auth.json");

// the folder of what illi shares with other agents (opencode's, Codex's):
// its skills/ (~/.agents/skills), as a project's .agents/skills
export const AGENTS_DIR = config_path(process.env.ILLI_AGENTS_DIR ?? "~/.agents");

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
  const env  = config_env_set(key);
  const said = env === null || process.env[env] === "auto" ? undefined : process.env[env];
  return GONE.has(key) ? undefined : said ?? FILE[key];
}

// a key's default: for illi's own pick, the first vendor's (DEFS) that
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

// where a key's value comes from, as /settings says it: its variable,
// this profile (its own config.json sets it), else global (the root's)
export function config_from(key: Key): string {
  return config_env_set(key) ?? (DIR !== ROOT && key in config_file(PATH) ? PROFILE : "global");
}

// a file of the profile's own, if it has one; else the root's, global
function config_own(name: string): string {
  return DIR === ROOT || fs.existsSync(DIR + "/" + name) ? DIR + "/" + name : ROOT + "/" + name;
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
  const old   = Object.keys(RENAMED).find((was) => RENAMED[was] === key);
  const names = ["ILLI_" + key.toUpperCase(), ...(old === undefined ? [] : ["ILLI_" + old.toUpperCase()])];
  return names.find((name) => process.env[name] !== undefined) ?? null;
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
  const own    = config_object(config_value("autocompacts"));
  const keys   = config_shortcuts(config_value("shortcuts"));
  RULES       = config_place("rules");
  AFTER       = config_value("after");
  OFF         = [...new Set(config_list(config_value("off").toLowerCase()).filter((name) => name !== ""))];
  STICKY      = [...new Set(config_list(config_value("sticky").toLowerCase()).filter((name) => name !== ""))];
  SUGGEST     = !OFFS.includes(String(config_value("suggest")).trim().toLowerCase());
  TPS         = !OFFS.includes(String(config_value("tps")).trim().toLowerCase());
  TITLE       = !OFFS.includes(String(config_value("title")).trim().toLowerCase());
  STATUSLINE  = config_statusline(config_raw("statusline"));
  SIDE        = config_value("side");
  SIDE_WIDTH  = config_value("side_width");
  ACCENT      = String(config_value("accent")).trim();
  PICK        = pick;
  ROLES       = roles;
  AUTOCOMPACT_SET = String(config_value("autocompact")).trim();
  AUTOCOMPACTS    = own ?? {};
  LEADER      = config_leader(String(config_value("leader")));
  SHORTCUTS   = keys ?? OWN_SHORTCUTS;
}

// `autoupdate`'s value, in lower case, as a mode: off (false, 0), notify,
// else on
function config_update(value: string): Mode {
  return OFFS.includes(value) ? "off" : value === "notify" ? "notify" : "on";
}

// the leader as a key's name: ctrl+x as Ctrl+X
function config_leader(value: string): string {
  const [mod = "", key = ""] = value.trim().split("+");
  return mod.slice(0, 1).toUpperCase() + mod.slice(1).toLowerCase() + "+" + key.toUpperCase();
}

// `statusline` as Status.ts runs it: a command, or Claude Code's
// statusLine object (or its JSON; text that won't parse is a command,
// as `{ a; b; }` is): { type: "command" (or none), command, padding (0 at
// least), refreshInterval (s, 1 to REFRESH_MOST; another value: none) },
// its other keys passed over; null: none (unset, empty), or not one
export function config_statusline(value: unknown): Statusline | null {
  const text = typeof value === "string" ? value.trim() : null;
  const got  = (text === null ? config_object(value) : text.startsWith("{") ? config_object(text) : null) ?? (text === null ? null : { command: text });
  if (got === null || typeof got.command !== "string" || got.command.trim() === "" || (got.type !== undefined && got.type !== "command")) {
    return null;
  }
  const number = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const every = number(got.refreshInterval);
  return { command: got.command.trim(), padding: Math.max(0, Math.floor(number(got.padding))), refresh: every > 0 ? Math.min(REFRESH_MOST, Math.max(1, every)) : 0 };
}

// `shortcuts` (an object, or its JSON) over OWN_SHORTCUTS, each key in lower
// case; null: not one, or a key not one character, or what it runs not
// text
function config_shortcuts(value: unknown): Record<string, string> | null {
  const got = config_object(value);
  if (got === null || Object.entries(got).some(([k, run]) => [...k].length !== 1 || k.trim() === "" || typeof run !== "string")) {
    return null;
  }
  const all = { ...OWN_SHORTCUTS };
  for (const [k, run] of Object.entries(got as Record<string, string>)) {
    if (run.trim() === "") {
      delete all[k.toLowerCase()];
    } else {
      all[k.toLowerCase()] = run.trim();
    }
  }
  return all;
}

// the user's own shortcuts (as set: a variable's, else config.json's),
// each key in lower case, as config_shortcuts reads them
function config_shortcuts_mine(): Record<string, string> {
  const mine = (config_object(config_raw("shortcuts")) ?? {}) as Record<string, string>;
  return Object.fromEntries(Object.entries(mine).map(([k, run]) => [k.toLowerCase(), run]));
}

// whether the user set a key after the leader (to what illi's isn't, or
// to none)
export function config_shortcut_mine(key: string): boolean {
  return key.toLowerCase() in config_shortcuts_mine();
}

// a key after the leader set (run: a /command or a key's name; "": none;
// null: illi's again, else none), kept in config.json; one set as illi's
// has it, or to none where illi has none, is no change of the user's. In
// a profile over the global file's shortcuts, none left is kept as {}
// (taken out, the global's would hold again)
export function config_shortcut(key: string, run: string | null): void {
  const mine = { ...config_shortcuts_mine() };
  const k    = key.toLowerCase();
  if (run === null) {
    delete mine[k];
  } else {
    mine[k] = run;
  }
  for (const [x, r] of Object.entries(mine)) {
    if (OWN_SHORTCUTS[x] === r || (r === "" && OWN_SHORTCUTS[x] === undefined)) {
      delete mine[x];
    }
  }
  const under = DIR !== ROOT && config_file(ROOT + "/config.json").shortcuts !== undefined;
  config_set("shortcuts", Object.keys(mine).length === 0 && !under ? null : mine);
}

// a setting that is an object (a variable's, or text, parsed as JSON);
// none: {}; null: not one
function config_object(value: unknown): Record<string, unknown> | null {
  try {
    const got = typeof value === "string" ? (value.trim() === "" ? {} : JSON.parse(value)) : value ?? {};
    return typeof got === "object" && got !== null && !Array.isArray(got) ? got : null;
  } catch {
    return null;
  }
}

// the tokens of the chat a turn sends on a model: its autocompact (its
// own, else the global one) of its window as known (none: GUESS), at most
// config_most
export function config_context(label: string, window = GUESS, overhead = 0): number {
  const set  = String(AUTOCOMPACTS[label] ?? AUTOCOMPACT_SET);
  const want = config_tokens(set, window) ?? config_tokens(SETTINGS.autocompact.def, window)!;
  return Math.max(1, Math.round(Math.min(want, config_most(window, overhead))));
}

// a model's autocompact as set: its own (`autocompacts`), else the global
export function config_autocompact_of(label: string): { set: string; own: boolean } {
  const own = AUTOCOMPACTS[label];
  return own === undefined || config_tokens(String(own), 1) === null ? { set: AUTOCOMPACT_SET || SETTINGS.autocompact.def, own: false } : { set: String(own), own: true };
}

// the most a model's autocompact may be: MOST of its window, and a turn
// at it starting under ROOM of it beside what else a request takes
// (overhead)
export function config_most(window: number, overhead = 0): number {
  return Math.round(Math.min(window * MOST, window * ROOM - overhead));
}

// an autocompact as tokens of a window: a share of it (60%), tokens
// (400000, 400k); null: none of these
export function config_tokens(text: string, window: number): number | null {
  const set   = text.trim().toLowerCase();
  const share = /^(\d+(?:\.\d+)?)%$/.exec(set);
  const k     = /^(\d+(?:\.\d+)?)k$/.exec(set);
  const n     = share !== null ? (window * Number(share[1])) / 100 : k !== null ? Number(k[1]) * 1000 : set === "" ? NaN : Number(set);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// a model's autocompact set (null: its own taken out, so the global one
// holds), merged into `autocompacts` in the config.json that sets it (the
// profile's, else the root's; neither: the profile's) as the file is now:
// two illis setting one each keep both; why not (a variable sets them)
export function config_autocompact(label: string, value: string | null): string | null {
  const env = config_env_set("autocompacts");
  if (env !== null) {
    return "autocompacts is set by " + env + ": unset it to change a model's autocompact here.";
  }
  const root = PATH !== ROOT + "/config.json" && !("autocompacts" in config_file(PATH)) && "autocompacts" in config_file(ROOT + "/config.json");
  const all  = { ...(config_object(config_file(root ? ROOT + "/config.json" : PATH).autocompacts) ?? {}) };
  if (value === null) {
    delete all[label];
  } else {
    all[label] = value;
  }
  config_set("autocompacts", Object.keys(all).length === 0 ? null : all, root);
  return null;
}

// the models listed last, learned (a file that won't read: none)
function config_models(): void {
  const kept = json_object(MODELS_FILE)?.vendors ?? {};
  for (const vendor of Object.keys(kept).filter((v) => VENDORS.includes(v as Vendor))) {
    Pick.learn(vendor as Vendor, kept[vendor]);
  }
}

// a key set in config.json (null: taken out, so its default holds), the
// file's other keys kept; what changes while illi runs (config_live) is
// read again, the rest at the next start. One that won't do (config_check)
// throws, the file untouched
export function config_set(key: Key, value: unknown, root = false): void {
  const why = config_check(key, value);
  if (why !== null) {
    throw new Error(why);
  }
  const [dir, at] = root ? [ROOT, ROOT + "/config.json"] : [DIR, PATH];
  const file = fs.existsSync(at) ? JSON.parse(fs.readFileSync(at, "utf8")) : {};
  if (value === null) {
    delete file[key];
  } else {
    file[key] = value;
  }
  for (const was of Object.keys(RENAMED).filter((was) => RENAMED[was] === key)) {
    delete file[was];
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(at, JSON.stringify(file, null, 2) + "\n");
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
  if (key === "shortcuts") {
    return value === null || config_shortcuts(value) !== null ? null : "shortcuts takes each key after the leader and what it runs, like {\"m\": \"/model\"}.";
  }
  if (key === "leader" && typeof value === "string" && TAKEN.includes(config_leader(value))) {
    return "leader takes a key illi doesn't take itself; " + config_leader(value) + " is one.";
  }
  if (key === "statusline") {
    return value === null || (typeof plain === "string" && plain.trim() === "") || config_statusline(value) !== null || !strict ? null : "statusline takes a command, or Claude Code's statusLine, like {\"type\": \"command\", \"command\": \"~/.illi/statusline.sh\", \"refreshInterval\": 5}.";
  }
  if (key === "autocompacts") {
    const got = value === null ? {} : config_object(value);
    const bad = got === null || Object.values(got).some((v) => !SETTINGS.autocompact.shape![0].test(String(v)));
    return bad ? "autocompacts takes each model's autocompact, like {\"gpt-6.1-sol\": \"50%\"}." : null;
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

// a project's top: the nearest folder up from cwd holding .git, else
// cwd itself
export function config_top(cwd: string): string {
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    if (dir === path.dirname(dir)) {
      return path.resolve(cwd);
    }
  }
}

// the folders from a project's top (config_top) down to cwd
export function config_down(cwd: string): string[] {
  const top  = config_top(cwd);
  const dirs: string[] = [];
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    dirs.unshift(dir);
    if (dir === top || dir === path.dirname(dir)) {
      return dirs;
    }
  }
}

// a path as illi shows it: ~ for the home folder
export function config_home(file: string): string {
  return file.startsWith(os.homedir()) ? "~" + file.slice(os.homedir().length) : file;
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

// the root's config.json, the profile's over it, key by key; a list
// (ADDS) the two together
function config_files(): Record<string, unknown> {
  const [root, own] = [config_file(ROOT + "/config.json"), DIR === ROOT ? {} : config_file(PATH)];
  const both = ADDS.filter((key) => key in root && key in own).map((key) => [key, root[key] + ", " + own[key]]);
  return { ...root, ...own, ...Object.fromEntries(both) };
}

// a config.json's keys ({}: none), an old name read as its new one
// (RENAMED); one that won't read says which
function config_file(path: string): Record<string, unknown> {
  let data: Record<string, unknown>;
  try {
    data = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : {};
  } catch (err: any) {
    throw new Error("config: " + path + ": " + err.message);
  }
  for (const [was, now] of Object.entries(RENAMED).filter(([was]) => was in data)) {
    const old  = data[was];
    const each = typeof old === "object" || String(old).trim().startsWith("{") ? config_object(old) : null;
    delete data[was];
    if (!(now in data) && old !== "auto") {
      data[now] = each === null ? old : Object.fromEntries(Object.entries(each).filter(([, v]) => v !== "auto"));
    }
  }
  return data;
}

// the environment as illi found it, the keys it took out put back: what
// a profile's switch starts illi again with
export function config_env(): Record<string, string> {
  const keys = Object.entries(VARS).filter(([name]) => KEYS[name] !== "").map(([name, v]) => [v, KEYS[name]]);
  return { ...(process.env as Record<string, string>), ...Object.fromEntries(keys) };
}
