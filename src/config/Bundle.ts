// Bundle
// ======
// A plugin's folder read as a bundle, in Claude Code's plugin layout, so
// one of theirs dropped in works as far as illi's parts reach, and illi's
// own code may sit beside it. Its parts: skills (skills/<name>/SKILL.md,
// or one SKILL.md at its root: the plugin is that skill), commands
// (commands/*.md), agents (agents/*.md), hooks (hooks/hooks.json), MCP
// servers (.mcp.json), and illi code (illi.ts, .js or .mjs; index.* only
// in a folder with no other part, as a plugin folder always was: a
// Claude Code plugin's root index.js is often its MCP server, which an
// import would run inside illi). Its manifest (.claude-plugin/plugin.json,
// optional) gives its description and version, and may move parts as
// Claude Code reads it: commands and agents replace the defaults, skills
// add to them, hooks and mcpServers merge after the default file (an
// inline object too); a path starts with ./ and stays in the folder.
// Every part is found by its real path, which must stay inside the
// folder's: one linked out of it is dropped, said. What illi doesn't use
// is listed (unused); what won't read is said (troubles); reading never
// throws, as it runs at each use of a skill, command or agent.
//
//     review/
//       .claude-plugin/plugin.json   { "name": "review", "description": "..." }
//       skills/check/SKILL.md
//       commands/review.md
//       agents/reviewer.md
//       hooks/hooks.json             { "hooks": { "PostToolUse": [...] } }
//       .mcp.json                    { "mcpServers": { ... } }
//       illi.ts                      export default function (illi) { ... }

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as config from "./Config.ts";

// Types
// =====

// where a plugin's folder is: the global plugins folder, the profile's,
// the project's
export type Scope = "global" | "profile" | "project";

// a part by name: its name (its file's, its folder's), its real path
export type Part = { name: string; file: string };

// hooks or MCP servers: a file of them, or what the manifest holds inline
// (file: the manifest)
export type Source = { file: string; data?: unknown };

// a bundle: its name (its folder's), real folder and scope; its illi code
// (null: none); whether it has a Claude Code manifest, the manifest's
// name if not the folder's, its description and version; its parts;
// what illi doesn't use of it; what to know (an index not loaded); what
// won't read
export type Bundle = {
  name     : string;
  dir      : string;
  scope    : Scope;
  code     : string | null;
  claude   : boolean;
  title    : string;
  about    : string;
  version  : string;
  commands : Part[];
  agents   : Part[];
  skills   : Part[];
  hooks    : Source[];
  mcp      : Source[];
  unused   : string[];
  notes    : string[];
  troubles : string[];
};

// Constants
// =========

// a name a plugin or a part may have: a file's, as typed
const NAME = /^[a-z0-9][a-z0-9_-]*$/i;

// illi's code in a bundle; a plugin folder's index (alone, its code)
const CODE  = ["illi.ts", "illi.js", "illi.mjs"];
const INDEX = ["index.ts", "index.js", "index.mjs"];

// the manifest, and a Claude Code marketplace's (not a plugin)
const MANIFEST    = ".claude-plugin/plugin.json";
const MARKETPLACE = ".claude-plugin/marketplace.json";

// Claude Code's parts illi doesn't use: files and folders, manifest keys
const UNUSED_FILES: Array<[string, string]> = [["bin", "bin/"], ["output-styles", "output styles"], [".lsp.json", "LSP servers"], ["themes", "themes"], ["monitors", "monitors"], ["workflows", "workflows"], ["settings.json", "settings.json"]];
const UNUSED_KEYS: Array<[string, string]> = [["lspServers", "LSP servers"], ["outputStyles", "output styles"], ["userConfig", "userConfig"], ["channels", "channels"], ["dependencies", "dependencies"], ["experimental", "experimental parts"]];

// Bundle
// ======

export namespace Bundle {

  // a plugin's folder read: its parts, code, manifest; null if it is no
  // plugin (none of them, or it won't read)
  export function read(dir: string, name: string, scope: Scope): Bundle | null {
    const root = real(dir);
    if (root === null) {
      return null;
    }
    const b: Bundle = { name, dir: root, scope, code: null, claude: false, title: "", about: "", version: "", commands: [], agents: [], skills: [], hooks: [], mcp: [], unused: [], notes: [], troubles: [] };
    const man = manifest(b);
    b.commands = man.commands === undefined ? mds(b, "commands") : listed(b, "commands", man.commands, (file) => (is_dir(file) ? mds_in(b, file) : md_file(b, "commands", file)));
    b.agents = man.agents === undefined ? mds(b, "agents") : listed(b, "agents", man.agents, (file) => (is_dir(file) ? agent_dir(b, file) : md_file(b, "agents", file)));
    const named = man.skills === undefined ? [] : listed(b, "skills", man.skills, (file) => (fs.existsSync(path.join(file, "SKILL.md")) ? [{ name: file === b.dir ? b.name : path.basename(file), file }] : skills_in(b, file)));
    const own = skills_in(b, path.join(b.dir, "skills"));
    const lone = man.skills === undefined && !fs.existsSync(path.join(b.dir, "skills")) && fs.existsSync(path.join(b.dir, "SKILL.md"));
    b.skills = [...own, ...named, ...(lone ? [{ name: b.name, file: b.dir }] : [])];
    b.hooks = [...file_part(b, "hooks/hooks.json"), ...sources(b, "hooks", man.hooks)];
    b.mcp = [...file_part(b, ".mcp.json"), ...sources(b, "mcpServers", man.mcpServers)];
    const parts = b.commands.length + b.agents.length + b.skills.length + b.hooks.length + b.mcp.length > 0;
    const code = CODE.map((f) => path.join(b.dir, f)).find(is_file);
    const index = INDEX.map((f) => path.join(b.dir, f)).find(is_file);
    b.code = code ?? (index !== undefined && !parts && !b.claude ? index : null);
    if (code === undefined && index !== undefined && b.code === null) {
      b.notes.push("its " + path.basename(index) + " isn't loaded as illi code beside other parts (illi's code goes in illi.ts)");
    }
    b.unused = [...UNUSED_FILES.filter(([f]) => fs.existsSync(path.join(b.dir, f))).map(([, said]) => said), ...UNUSED_KEYS.filter(([k]) => man[k] !== undefined).map(([, said]) => said)].filter((x, k, all) => all.indexOf(x) === k);
    return b.code !== null || parts || b.claude ? b : null;
  }

  // why a folder in a plugins folder is no plugin, if it looks meant as
  // one (a marketplace, a name illi can't take); null: it isn't meant as
  // one (or it is a plugin)
  export function misfit(dir: string, entry: string): string | null {
    if (fs.existsSync(path.join(dir, MARKETPLACE)) && !fs.existsSync(path.join(dir, MANIFEST))) {
      return "a Claude Code marketplace, not a plugin: copy the plugins you want from it into this folder";
    }
    const meant = fs.existsSync(path.join(dir, MANIFEST)) || [...CODE, ...INDEX, "skills", "commands", "agents", "hooks", ".mcp.json", "SKILL.md"].some((f) => fs.existsSync(path.join(dir, f)));
    return !NAME.test(entry) && meant ? "a name illi can't take: letters, digits, - and _" : null;
  }

  // what a bundle's hooks and MCP servers are given: its folder, and its
  // data folder (kept across updates: by scope, so a project's plugin
  // never shares a global one's of its name)
  export function vars(b: Bundle): Record<string, string> {
    const data = Bundle.data(b);
    return { CLAUDE_PLUGIN_ROOT: b.dir, ILLI_PLUGIN_ROOT: b.dir, CLAUDE_PLUGIN_DATA: data, ILLI_PLUGIN_DATA: data };
  }

  // a bundle's data folder, made (a failure logged: what needs it says
  // so itself)
  export function data(b: Bundle): string {
    const key = b.scope === "project" ? b.name + "-" + crypto.createHash("sha256").update(b.dir).digest("hex").slice(0, 8) : b.name;
    const dir = path.join(b.scope === "profile" ? config.DIR : config.ROOT, "plugin-data", key);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err: any) {
      console.error("illi: plugin " + b.name + ": " + dir + ": " + String(err?.message ?? err));
    }
    return dir;
  }

  // a part's text with the bundle's variables in it (${CLAUDE_PLUGIN_ROOT},
  // ${CLAUDE_PLUGIN_DATA}, illi's ${ILLI_...} spellings; a skill's own
  // folder, ${CLAUDE_SKILL_DIR})
  export function fill(text: string, b: Bundle, skill?: string): string {
    if (!text.includes("${")) {
      return text;
    }
    const data = /\$\{(CLAUDE|ILLI)_PLUGIN_DATA\}/.test(text) ? Bundle.data(b) : "";
    return text
      .replace(/\$\{(CLAUDE|ILLI)_PLUGIN_ROOT\}/g, () => b.dir)
      .replace(/\$\{(CLAUDE|ILLI)_PLUGIN_DATA\}/g, () => data)
      .replace(/\$\{CLAUDE_SKILL_DIR\}/g, () => skill ?? b.dir);
  }

  // what a bundle's parts hold that illi won't do, for /agents: a
  // command's !`cmd` lines and @file references, ${user_config.*} in its
  // hooks or MCP servers (read on asking: never at each use)
  export function inspect(b: Bundle): string[] {
    const out: string[] = [];
    const bodies = b.commands.map((c) => text_of(c.file));
    if (bodies.some((t) => /^\s*!`/m.test(t) || /(^|\s)!`[^`]+`/.test(t))) {
      out.push("a command runs !`...` lines, which illi doesn't run");
    }
    if (bodies.some((t) => /(^|\s)@[\w./-]+\.\w+/.test(t))) {
      out.push("a command names @files, which illi doesn't attach");
    }
    const given = [...b.hooks, ...b.mcp].map((s) => (s.data === undefined ? text_of(s.file) : JSON.stringify(s.data))).join("\n");
    if (given.includes("${user_config.")) {
      out.push("its hooks or MCP servers use ${user_config...}, which illi doesn't have: those stay empty");
    }
    return out;
  }

}

// the manifest's fields (none: no manifest), its trouble said; whether
// there is one, its name, description and version kept
function manifest(b: Bundle): Record<string, unknown> {
  const file = path.join(b.dir, MANIFEST);
  if (!fs.existsSync(file)) {
    return {};
  }
  b.claude = true;
  const data = json_read(b, file);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {};
  }
  const man = data as Record<string, unknown>;
  b.title = typeof man.name === "string" && man.name !== b.name ? man.name : "";
  b.about = typeof man.description === "string" ? man.description.trim() : "";
  b.version = typeof man.version === "string" ? man.version.trim() : "";
  return man;
}

// a kind's .md files at the bundle's default folder (commands/, agents/)
function mds(b: Bundle, kind: string): Part[] {
  return mds_in(b, path.join(b.dir, kind));
}

// the .md files in a folder, by name (a name illi can take), each inside
// the bundle
function mds_in(b: Bundle, dir: string): Part[] {
  return entries(dir).filter((f) => f.endsWith(".md") && NAME.test(f.slice(0, -3))).flatMap((f) => {
    const file = inside(b, path.join(dir, f));
    return file !== null && is_file(file) ? [{ name: f.slice(0, -3), file }] : [];
  });
}

// a command or agent the manifest names as a file: an .md file of a name
// illi can take; else said
function md_file(b: Bundle, key: string, file: string): Part[] {
  const name = path.basename(file, ".md");
  if (!file.endsWith(".md") || !NAME.test(name)) {
    b.troubles.push("its manifest's " + key + " names " + path.relative(b.dir, file) + ": illi takes .md files named with letters, digits, - and _");
    return [];
  }
  return [{ name, file }];
}

// a folder the manifest names as agents: none, said (Claude Code takes
// only files there too)
function agent_dir(b: Bundle, file: string): Part[] {
  b.troubles.push("its manifest's agents takes .md files, not the folder " + path.relative(b.dir, file));
  return [];
}

// the skills in a folder: each subfolder holding a SKILL.md, inside the
// bundle
function skills_in(b: Bundle, dir: string): Part[] {
  return entries(dir).filter((f) => NAME.test(f)).flatMap((f) => {
    const file = inside(b, path.join(dir, f));
    return file !== null && is_file(path.join(file, "SKILL.md")) ? [{ name: f, file }] : [];
  });
}

// a manifest's paths for a kind (a path, or a list of them), each
// starting with ./ (skills: or .), inside the bundle and there, made into
// parts; what won't do said
function listed(b: Bundle, key: string, value: unknown, make: (file: string) => Part[]): Part[] {
  const paths = typeof value === "string" ? [value] : Array.isArray(value) && value.every((v) => typeof v === "string") ? (value as string[]) : null;
  if (paths === null) {
    b.troubles.push("its manifest's " + key + " isn't a path or a list of them" + (key === "commands" && typeof value === "object" ? " (illi doesn't read commands given as a map)" : ""));
    return [];
  }
  return paths.flatMap((p) => {
    const file = manifest_path(b, key, p, key === "skills");
    return file === null ? [] : make(file);
  });
}

// the hooks or MCP servers the manifest adds: a path, an inline object
// (with no wrapper), or a list of either
function sources(b: Bundle, key: string, value: unknown): Source[] {
  if (value === undefined) {
    return [];
  }
  const man = path.join(b.dir, MANIFEST);
  return (Array.isArray(value) ? value : [value]).flatMap((v): Source[] => {
    if (typeof v === "string") {
      const file = manifest_path(b, key, v, false);
      return file === null ? [] : [{ file }];
    }
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      return [{ file: man, data: v }];
    }
    b.troubles.push("its manifest's " + key + " holds something that is no path or object");
    return [];
  });
}

// a default part file, if there and inside the bundle
function file_part(b: Bundle, rel: string): Source[] {
  const file = inside(b, path.join(b.dir, rel));
  return file !== null && is_file(file) ? [{ file }] : [];
}

// a manifest path's real file: ./ first (or ".", where the root may be
// meant), inside the bundle, there; null, said why
function manifest_path(b: Bundle, key: string, p: string, root: boolean): string | null {
  if (!(p.startsWith("./") || (root && p === "."))) {
    b.troubles.push("its manifest's " + key + " path " + p + " doesn't start with ./");
    return null;
  }
  const file = path.join(b.dir, p);
  if (!fs.existsSync(file)) {
    b.troubles.push("its manifest's " + key + " path " + p + " isn't there");
    return null;
  }
  return inside(b, file);
}

// a path's real one, if inside the bundle's real folder; else null, said
// (a link out of it)
function inside(b: Bundle, p: string): string | null {
  const file = real(p);
  if (file === null) {
    return null;
  }
  if (file !== b.dir && !file.startsWith(b.dir + path.sep)) {
    b.troubles.push(path.relative(b.dir, p) + " leads out of the plugin's folder, so it is left out");
    return null;
  }
  return file;
}

// a JSON file's data; one that won't read said, undefined
function json_read(b: Bundle, file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err: any) {
    b.troubles.push(path.relative(b.dir, file) + " won't read: " + String(err?.message ?? err));
    return undefined;
  }
}

// a folder's entries, sorted (none: it isn't one, or won't read)
function entries(dir: string): string[] {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
}

// a path's real one (null: not there, or it won't resolve)
function real(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

function is_file(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function is_dir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// a file's text ("": it won't read)
function text_of(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}
