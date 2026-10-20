// Config
// ======
// illi's settings. Its DIR holds config.json, the lock and the chat
// (chat/): the folder of the profile running (Profiles.ts), the ROOT
// itself ($ILLI_DIR, default ~/.illi) for the default. A profile's
// config.json goes over the root's, key by key; the ChatGPT login is the
// root's, shared. Each key of config.json (README) may be set as
// ILLI_<KEY> instead; a path may start with "~/". The API keys are read
// from the environment and removed from it, so no program an agent runs
// inherits them (config_env puts them back for a profile's switch).

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
const FILE: Record<string, string> = { ...config_file(ROOT + "/config.json"), ...config_file(PATH) };

// the models the vendors listed last (ChatGPT.ts models), learned before
// the offer is made: a new one is offered (unless `models` names those
// offered), each one's window known; kept in the root, every profile's
export const MODELS_FILE = ROOT + "/models.json";
export const MODELS_SET  = config_get("models", "") !== "";
config_models();

export const OFFER: Offer = {
  vendors : config_vendors(config_get("vendors", "chatgpt")),
  models  : config_get("models", LABELS.join()).split(",").map((m) => m.trim()),
};

export const RULES      = config_path(config_get("rules", ""));
export const THEME      = config_path(config_get("theme", DIR + "/theme.json"));

// the user's MCP servers (Mcp.ts)
export const MCP        = config_path(config_get("mcp", DIR + "/mcp.json"));
export const AFTER      = config_get("after", "");

// the side panel (Term.ts): where it shows ("right", "left", "off"), how
// wide (columns, or a share of the screen: "25%")
export const SIDE       = config_get("side", "right");
export const SIDE_WIDTH = config_get("side_width", "25%");
export const PICK       = config_run("pick", config_get("pick", "chatgpt:gpt-6.1-sol:medium:slow"));

// what every compaction runs on, a chat's and an import's alike, whatever
// the chat's pick
export const COMPACTOR  = config_run("compactor", config_get("compactor", "chatgpt:gpt-6-luna:medium:slow"));
export const AGENTS     = config_get("agents", "") ? config_run("agents", config_get("agents", "")) : null;

// how much of the chat a turn sends (Memory.cutoff), in tokens (4 bytes
// each), on a model: its `contexts` entry, else `context`: a number of
// tokens, a share of its window ("60%"), or "auto": AUTO of its window,
// at most AUTO_MOST; never past FULL of it. A model whose window no one
// told is taken to have GUESS. CONTEXT: as many as `context` names, or
// AUTO_MOST (what a call holds before any model is known)
const AUTO      = 0.7;
const AUTO_MOST = 400000;
const FULL      = 0.9;
export const GUESS      = 128000;
const CONTEXT_SET       = String(config_get("context", "auto")).trim();
const OWN_SET           = (FILE as Record<string, unknown>).contexts;
const CONTEXTS          = (typeof OWN_SET === "object" && OWN_SET !== null ? OWN_SET : {}) as Record<string, unknown>;
export const CONTEXT    = Number(CONTEXT_SET) > 0 ? Number(CONTEXT_SET) : AUTO_MOST;

// how many summaries of a side build at once (Memory.ts): few, so a
// plan's rate limit holds them
export const JOBS       = Number(config_get("jobs", "8"));

// the ChatGPT login chatgpt runs on (ChatGPT.ts): the file `login` names,
// else Illi's own (/login makes it; the root's, so every profile's) or,
// while there is none, opencode's (`opencode auth login`)
export const LOGIN_SET      = config_get("login", "") === "" ? null : config_path(config_get("login", ""));
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
  return process.env["ILLI_" + key.toUpperCase()] ?? FILE[key] ?? def;
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

// a key set in config.json, the file's other keys kept (it is read at the
// next start; the caller uses the value meanwhile)
export function config_set(key: string, value: string): void {
  const file = fs.existsSync(PATH) ? JSON.parse(fs.readFileSync(PATH, "utf8")) : {};
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(PATH, JSON.stringify({ ...file, [key]: value }, null, 2) + "\n");
}

function config_path(path: string): string {
  return path.startsWith("~/") ? os.homedir() + path.slice(1) : path;
}

function config_run(key: string, text: string): Pick {
  const [vendor, model, effort, speed] = text.split(":");
  const pick = Pick.read({ vendor, model, effort, speed }, OFFER);
  if (pick === null) {
    throw new Error("config: " + key + " is no vendor:model:effort:speed offered here: " + text);
  }
  return pick;
}

function config_vendors(text: string): Vendor[] {
  const list = text.split(",").map((v) => v.trim()) as Vendor[];
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

// a config.json's keys ({}: none); one that won't read says which
function config_file(path: string): Record<string, string> {
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
