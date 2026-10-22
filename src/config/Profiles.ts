// Profiles
// ========
// illi's profiles, each its own chat and settings. The root ($ILLI_DIR,
// default ~/.illi) is the default profile's folder, and holds each other
// one's: <root>/profiles/<name>. illi opens the one asked
// ($ILLI_PROFILE), else the one used last (<root>/profile, a line), else
// the default; Config.ts takes its folder as DIR. A profile is made
// empty (profile_new), the root's setup its own (Config.ts, Custom.ts,
// Mcp.ts: the global layer), and may take the running one's chat along
// (profile_move_chat); any but the default may be renamed or deleted. A
// profile goes out as one archive (tar.gz, by the system's tar): its
// folder but the login (a login file its config names too, wherever in
// it), the locks, the log (and, the default's, the other profiles), its
// config.json and mcp.json with their secrets left out; its chat's
// SQLite files (a project each) as snapshots SQLite takes (VACUUM INTO),
// whole though an illi writes to them; the rest (agents, commands,
// skills, theme, rules) as it is.
// One comes in only as a new profile, its archive taken as untrusted:
// each entry a file or a folder, inside it, checked before a byte is
// unpacked; once unpacked, its config's keys that run a command or name a
// file here (after, rules, login, mcp, theme) dropped, its MCP servers
// off till the person turns them on. Its agents, commands, skills,
// RULES.md and chat are the profile's at once.

import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { json_object } from "../tools/Clip.ts";

// Types
// =====

// the profile running: the root, its name, its folder
export type Picked = { root: string; name: string; dir: string };

// what an import left out as untrusted: config.json's keys, the MCP
// servers turned off
export type Imported = { keys: string[]; servers: number };

// Constants
// =========

// the default profile's name (no other profile takes it); a profile's
// name, and as a person is told it
export const DEFAULT = "default";
export const NAME    = /^[a-z0-9][a-z0-9_-]*$/;
export const NAMED   = "a-z, 0-9, - and _, a letter or digit first";

// a folder that is a profile's: <root>/profiles/<name>
const FOLDER = /^(.+)\/profiles\/([a-z0-9][a-z0-9_-]*)$/;

// what a profile's folder holds that is never a profile's to give: the
// login (the root's, shared), the locks, the log; the default's folder
// also holds the others, which was used last, and when illi last looked
// for a new release of itself (Update.ts)
const OWN    = ["login.json", "locks", "illi.log"];
const ROOTED = ["profiles", "profile", "update.json"];

// the files that go out with their secrets left out, as JSON; config.json's
// keys left out of an export (a file here), and dropped from an import (a
// command run, or a file here read: the rules sent to the model, another
// login, other servers, another theme)
const CLEANED = ["config.json", "mcp.json"];
const LOCAL   = ["login"];
const UNSAFE  = ["after", "rules", "login", "mcp", "theme"];

// a key that names a secret, and a value shaped as a known key or token
const SECRET_KEY   = /key|token|secret|passw(or)?d|auth|credential|cookie|bearer/i;
const SECRET_VALUE = /\b(sk-|sk_|ghp_|gho_|ghu_|ghs_|github_pat_|glpat-|xox[abprs]-|AKIA|AIza)[A-Za-z0-9_-]{12,}|\beyJ[\w-]{8,}\.[\w-]{8,}\./;

// Profiles
// ========

// the profile running, for $ILLI_DIR (dir) and $ILLI_PROFILE (asked): a
// dir that is a profile's own folder (<root>/profiles/<name>, its root
// illi's) is that profile, in that root; else the one asked, else the one
// used last (if it's still there), else the default. One asked must be
// there
export function profile_pick(dir: string, asked?: string): Picked {
  const bare  = dir.replace(/(.)\/+$/, "$1");
  const is    = FOLDER.exec(bare);
  const owned = is !== null && profile_rooted(is[1]);
  const root  = owned ? is[1] : bare;
  const last  = profile_last(root);
  const name  = asked !== undefined && asked !== "" ? asked : owned ? is[2] : last;
  if (name !== DEFAULT && (!NAME.test(name) || !fs.existsSync(profile_dir(root, name)))) {
    throw new Error("config: no profile " + JSON.stringify(name) + " in " + root + ": start illi without ILLI_PROFILE, then /profile makes it.");
  }
  return { root, name, dir: profile_dir(root, name) };
}

// whether a folder is illi's root: it holds a chat, a config, the login
// or the profile used last
function profile_rooted(root: string): boolean {
  return ["chat", "config.json", "login.json", "profile"].some((part) => fs.existsSync(root + "/" + part));
}

// the profile used last, if it's still there; else the default
function profile_last(root: string): string {
  const name = fs.existsSync(root + "/profile") ? fs.readFileSync(root + "/profile", "utf8").trim() : DEFAULT;
  return NAME.test(name) && fs.existsSync(profile_dir(root, name)) ? name : DEFAULT;
}

// a profile's folder: the root itself for the default
export function profile_dir(root: string, name: string): string {
  return name === DEFAULT ? root : root + "/profiles/" + name;
}

// the chat folder a file is in, any profile's (the root's chat/, each
// profiles/<name>/chat/), its links resolved as far as it exists; null:
// none
export function profile_chat(root: string, file: string): string | null {
  const real = (p: string): string => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.dirname(p) === p ? p : path.join(real(path.dirname(p)), path.basename(p));
    }
  };
  const base = real(path.resolve(root));
  const rel  = path.relative(base, real(path.resolve(file))).split(path.sep);
  const deep = rel[0] === "chat" ? 1 : rel[0] === "profiles" && rel[2] === "chat" ? 3 : 0;
  return deep === 0 ? null : path.join(base, ...rel.slice(0, deep));
}

// the profiles: the default, then the others by name
export function profile_list(root: string): string[] {
  const dir  = root + "/profiles";
  const all  = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
  const more = all.filter((e) => e.isDirectory() && NAME.test(e.name) && e.name !== DEFAULT).map((e) => e.name);
  return [DEFAULT, ...more.sort()];
}

// the profile used last, kept for the next start
export function profile_keep(root: string, name: string): void {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(root + "/profile", name + "\n");
}

// why a name can't be a new profile's (null: it can)
export function profile_why(root: string, name: string): string | null {
  if (!NAME.test(name)) {
    return "Only " + NAMED + ".";
  }
  if (name === DEFAULT) {
    return DEFAULT + " names illi's own folder: pick another name.";
  }
  return fs.existsSync(profile_dir(root, name)) ? "There's a profile " + name + " already." : null;
}

// a new profile's folder, empty
export function profile_new(root: string, name: string): void {
  fs.mkdirSync(root + "/profiles", { recursive: true });
  fs.mkdirSync(profile_dir(root, name));
}

// a profile renamed (never the default: its folder is the root), and the
// one used last with it
export function profile_rename(root: string, from: string, to: string): void {
  fs.renameSync(profile_dir(root, from), profile_dir(root, to));
  if (profile_used(root) === from) {
    profile_keep(root, to);
  }
}

// a profile gone, its folder and all in it (never the default); the one
// used last, if it was, the default again
export function profile_delete(root: string, name: string): void {
  fs.rmSync(profile_dir(root, name), { recursive: true, force: true });
  if (profile_used(root) === name) {
    profile_keep(root, DEFAULT);
  }
}

// a profile's chat moved into a new one's folder (from, to: their
// folders), as it's made; the first starts with an empty chat. One there
// already is never written over
export function profile_move_chat(from: string, to: string): void {
  if (fs.existsSync(to + "/chat")) {
    throw new Error("profile " + path.basename(to) + " has a chat already");
  }
  if (fs.existsSync(from + "/chat")) {
    fs.renameSync(from + "/chat", to + "/chat");
  }
}

// the name kept as the one used last ("": none)
function profile_used(root: string): string {
  return fs.existsSync(root + "/profile") ? fs.readFileSync(root + "/profile", "utf8").trim() : "";
}

// the profile an archive's file names (illi-profile-<name>.tar.gz), else
// its own name, .tar.gz or .tgz dropped; null: no profile's name
export function profile_named(file: string): string | null {
  const name = path.basename(file).replace(/\.(tar\.gz|tgz)$/i, "").replace(/^illi-profile-/, "").toLowerCase();
  return NAME.test(name) && name !== DEFAULT ? name : null;
}

// Secrets
// -------

// a JSON value, its secrets left out: a string under a key that names one
// (unless it only names a variable, ${VAR}), and any string shaped as a
// known key or token; how many it left out
export function profile_strip(value: unknown): [unknown, number] {
  let cut = 0;
  const strip = (x: unknown, key: string): unknown => {
    if (typeof x === "string" && ((SECRET_KEY.test(key) && !x.includes("${")) || SECRET_VALUE.test(x))) {
      cut += 1;
      return undefined;
    }
    if (Array.isArray(x)) {
      return x.map((y) => strip(y, key)).filter((y) => y !== undefined);
    }
    if (typeof x === "object" && x !== null) {
      return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, strip(y, k)]).filter(([, y]) => y !== undefined));
    }
    return x;
  };
  const kept = strip(value, "");
  return [kept, cut];
}

// an object without some keys; the keys it had of them
function profile_omit(x: any, keys: string[]): [any, string[]] {
  const plain = typeof x === "object" && x !== null && !Array.isArray(x);
  const had   = plain ? keys.filter((k) => k in x) : [];
  return [plain ? Object.fromEntries(Object.entries(x).filter(([k]) => !keys.includes(k))) : {}, had];
}

// Archives
// --------

// a profile's archive, at file (absolute): its folder but what is never
// a profile's to give (OWN, ROOTED), and a login file its config names
// anywhere in it (a relative path from the folder, as Config.ts takes
// it); config.json and mcp.json with their secrets left out; how many
export async function profile_export(root: string, name: string, file: string): Promise<number> {
  const dir   = profile_dir(root, name);
  const tmp   = fs.mkdtempSync(path.join(os.tmpdir(), "illi-export-"));
  const conf  = json_object(dir + "/config.json");
  const login = typeof conf?.login === "string" && conf.login !== "" ? path.relative(dir, path.resolve(dir, conf.login.replace(/^~(?=\/)/, os.homedir()))) : "";
  const local = login !== "" && profile_inside(login) ? ["--exclude=./" + login] : [];
  const skip  = [...OWN, ...CLEANED, ...(name === DEFAULT ? ROOTED : []), login];
  let cut = 0;
  try {
    for (const part of CLEANED) {
      const json = json_object(dir + "/" + part);
      if (json === null && part !== "config.json") {
        continue;
      }
      const [kept, n] = profile_strip(part === "config.json" ? profile_omit(json ?? {}, LOCAL)[0] : json);
      cut += n;
      fs.writeFileSync(tmp + "/" + part, JSON.stringify(kept, null, 2) + "\n");
    }
    const snap  = profile_snapshot(dir + "/chat", tmp + "/chat");
    const parts = fs.readdirSync(dir).filter((p) => !skip.includes(p) && !(snap && p === "chat")).map((p) => "./" + p);
    const chat  = snap ? fs.readdirSync(dir + "/chat").filter((p) => p !== "projects").map((p) => "./chat/" + p) : [];
    const clean = fs.readdirSync(tmp).map((p) => "./" + p);
    await profile_tar(["-czhf", file, ...local, "-C", dir, ...parts, ...chat, "-C", tmp, ...clean]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return cut;
}

// a chat folder's SQLite files (projects/*.sqlite) copied whole into
// another folder, each as it is now, though an illi writes to it; false:
// it has no folder
function profile_snapshot(chat: string, into: string): boolean {
  if (!fs.existsSync(chat)) {
    return false;
  }
  const projects = fs.existsSync(chat + "/projects") ? fs.readdirSync(chat + "/projects").filter((f) => f.endsWith(".sqlite")).map((f) => "/projects/" + f) : [];
  fs.mkdirSync(into, { recursive: true });
  for (const file of projects) {
    fs.mkdirSync(path.dirname(into + file), { recursive: true });
    const db = new Database(chat + file, { readwrite: true });
    try {
      db.run("pragma busy_timeout = 5000");
      db.run("vacuum into ?", [into + file]);
    } finally {
      db.close();
    }
  }
  return true;
}

// an archive (file: absolute) unpacked as new profile `name`: its entries
// listed and checked first, unpacked aside, checked again on disk (files
// and folders only, none linked), what is never a profile's taken out,
// then moved in place; config.json's UNSAFE keys dropped, its MCP servers
// turned off (said back: Imported)
export async function profile_import(root: string, file: string, name: string): Promise<Imported> {
  const names = (await profile_tar(["-tzf", file])).split("\n").filter((l) => l !== "");
  const types = (await profile_tar(["-tvzf", file])).split("\n").filter((l) => l !== "").map((l) => l[0]);
  const why   = profile_unsafe(names, types);
  if (why !== null) {
    throw new Error(why);
  }
  fs.mkdirSync(root + "/profiles", { recursive: true });
  const tmp = fs.mkdtempSync(root + "/profiles/.import-");
  try {
    await profile_tar(["-xzf", file, "--no-same-owner", "-C", tmp]);
    profile_walk(tmp, "");
    for (const part of [...OWN, ...ROOTED]) {
      fs.rmSync(tmp + "/" + part, { recursive: true, force: true });
    }
    const conf = json_object(tmp + "/config.json");
    const [kept, keys] = profile_omit(conf, UNSAFE);
    if (fs.existsSync(tmp + "/config.json")) {
      fs.writeFileSync(tmp + "/config.json", JSON.stringify(kept, null, 2) + "\n");
    }
    const mcp  = json_object(tmp + "/mcp.json");
    const defs = typeof mcp?.mcpServers === "object" && mcp.mcpServers !== null ? Object.values<any>(mcp.mcpServers).filter((d) => typeof d === "object" && d !== null) : [];
    const on   = defs.filter((d) => d.disabled !== true);
    on.forEach((d) => (d.disabled = true));
    if (on.length > 0) {
      fs.writeFileSync(tmp + "/mcp.json", JSON.stringify(mcp, null, 2) + "\n");
    }
    const why = profile_why(root, name);
    if (why !== null) {
      throw new Error(why);
    }
    fs.renameSync(tmp, profile_dir(root, name));
    return { keys, servers: on.length };
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw err;
  }
}

// why an archive's listing won't unpack as a profile (null: it will):
// each entry a file (-) or a folder (d), never a link or a device, and
// its path inside the profile's folder
export function profile_unsafe(names: string[], types: string[]): string | null {
  if (names.length === 0 || names.length !== types.length) {
    return "The archive lists no profile.";
  }
  const out = names.find((n) => !profile_inside(n));
  if (out !== undefined) {
    return "The archive holds a path outside its folder: " + JSON.stringify(out) + ". Nothing was unpacked.";
  }
  const odd = names.find((_, k) => types[k] !== "-" && types[k] !== "d");
  return odd === undefined ? null : "The archive holds a link or a special file: " + JSON.stringify(odd) + ". Nothing was unpacked.";
}

// whether an archive's path stays inside its folder: relative, no `..`,
// no backslash or control character
export function profile_inside(name: string): boolean {
  return name !== "" && !name.startsWith("/") && !/[\\\x00-\x1f\x7f]/.test(name) && !name.split("/").includes("..");
}

// a folder unpacked holds files and folders only, none a hard link (one
// to a file outside would be that file); else it throws
function profile_walk(dir: string, rel: string): void {
  for (const e of fs.readdirSync(dir + rel)) {
    const at = rel + "/" + e;
    const st = fs.lstatSync(dir + at);
    if (st.isDirectory()) {
      profile_walk(dir, at);
    } else if (!st.isFile() || st.nlink > 1) {
      throw new Error("The archive held a link or a special file: " + JSON.stringify(at.slice(1)) + ". Nothing was kept.");
    }
  }
}

// tar run, on its args: what it printed; failed, why (its last word)
async function profile_tar(args: string[]): Promise<string> {
  const proc = Bun.spawn(["tar", ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) {
    throw new Error("tar: " + (err.trim().split("\n").at(-1) || "exited " + code));
  }
  return out;
}
