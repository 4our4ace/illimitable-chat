// Accounts
// ========
// The providers /login connected illi to and their accounts, in one file
// in illi's root, every profile's (accounts.json; written readable by
// its owner alone, as it holds API keys and logins), an entry each by
// the provider's id, of the shape its facts name (Provider.ts accounts):
// - keys (an API's: claude-api, openai-api): the keys typed in /login,
//   and which one is in use (its id, or "env": the environment's own,
//   ANTHROPIC_API_KEY or OPENAI_API_KEY, read as illi starts and never
//   written here); connected while it's in the file;
// - folders (a plan's run by another program: claude-code, Claude Code;
//   antigravity, Google's Antigravity CLI): its accounts, each a folder
//   of that program's (the user's own Claude Code's, "own", or one of
//   illi's, a folder of its own in illi's root, <folders>/<id>, as
//   claude/c1 or antigravity/g1, as each login is a folder's), and which
//   one is in use; connected while it has an account;
// - logins (chatgpt): connected while a login is there to run on, in a
//   file of its own (ChatGPT.ts); the file keeps its accounts signed in
//   but not in use (the one in use is in its login file, renewed there),
//   and whether opencode's login is one of them (false: /login left it to
//   opencode).
// The file lists them in the order they were connected. Config.ts takes
// from it the keys in use, a plan's folder in use and, unless the vendors
// setting names them, the vendors offered; every illi with a chat looks
// at the file every 2 s (Chat.ts follow, Config.ts config_accounts), so a
// change in one terminal reaches the others. A change (edit) holds the
// file's lock (a flock on .accounts.lock beside it: Flock.ts, waiting
// WAIT at most), so two illis changing it at once take turns, each
// reading it anew under the lock and changing what it finds; a read takes
// no lock, as the file is only ever replaced whole. Written whole to a
// file of its own (made readable by its owner alone before it holds
// anything, synced to the disk), then moved over the old one, so a crash
// leaves the old or the new, never half. A file that won't read is never
// written over: its keys would be lost. As read, it keeps only the
// entries of the shapes here, an entry of another shape dropped (one of
// these shapes keeps only the fields read); a vendor not here (a newer
// illi's) is kept as it is, the file written with it.

import * as fs from "node:fs";
import * as path from "node:path";
import { Flock } from "./Flock.ts";
import { FACTS, Vendors, type Shapes, type Vendor } from "../providers/Vendors.ts";

// Types
// =====

// a key kept: its id (the file's own), the key, when it was added
export type Key = { id: string; key: string; added: string };

// an API's vendor's keys, and the one in use (an id, or "env")
export type Keyed = { use: string; keys: Key[] };

// a ChatGPT account kept while another is in use: its account
// (ChatGPT.key), the email and plan its token tells ("": none told), its
// login (opencode's shape: ChatGPT.ts entry)
export type Saved = { key: string; email: string; plan: string; entry: Record<string, unknown> };

// ChatGPT's accounts: whether opencode's login is one of them, the others
// signed in and not in use
export type Logins = { opencode: boolean; saved: Saved[] };

// a plan's account run by another program (claude-code, antigravity):
// its folder's id ("own": the program's own, the user's own Claude
// Code's; else illi's <folders>/<id>, as claude/c1 or antigravity/g1),
// the email, plan and organization the program told as it signed in
// ("": none; Google's CLI tells no email)
export type Folder = { id: string; email: string; plan: string; org: string };

// such a plan's accounts, and the one in use (its id)
export type Folders = { use: string; accounts: Folder[] };

// each shape of entry (Provider.ts accounts)
type Kinds = { keys: Keyed; folders: Folders; logins: Logins };

// the file: each provider's entry, of the shape its facts name, in the
// order it was connected
export type Store = { [V in Vendor]?: Kinds[Shapes[V]] };

// Constants
// =========

// the environment's key in use, as an API's entry names it
export const ENV = "env";

// the program's own folder (the user's own Claude Code's), as a plan's
// account's id
export const OWN = "own";

// the entries of the file illi reads (any other kept as it is: write)
const KNOWN: string[] = FACTS.map((f) => f.id);

// how long a change waits while another illi changes the file (ms)
const WAIT = 3e3;

// Accounts
// ========

export namespace Accounts {

  // the file, in illi's root
  export function file(root: string): string {
    return path.join(root, "accounts.json");
  }

  // the file as it is (none: nothing connected); null: it won't read
  export function read(root: string): Store | null {
    const data = Accounts.raw(root);
    return data === null ? null : Accounts.store(data);
  }

  // the file's JSON object (none: {}); null: it won't read, or holds
  // something else
  export function raw(root: string): Record<string, unknown> | null {
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(Accounts.file(root), "utf8"));
    } catch (err: any) {
      return err?.code === "ENOENT" ? {} : null;
    }
    return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  }

  // the entries illi reads of the file's object, each as read, by the
  // shape its provider's facts name
  export function store(data: Record<string, unknown>): Store {
    const store: Record<string, Keyed | Folders | Logins> = {};
    for (const [vendor, value] of Object.entries(data)) {
      const shape = Vendors.of(vendor)?.accounts;
      if (shape !== undefined) {
        store[vendor] = shape === "keys" ? Accounts.keyed(value) : shape === "folders" ? Accounts.folders(value) : Accounts.logins(value);
      }
    }
    return store as Store;
  }

  // a provider's entry, if its shape is keys (an API's), folders (a
  // plan's run by another program) or logins (a plan's kept apart)
  export function keys_in(store: Store | null | undefined, vendor: string): Keyed | undefined {
    return Vendors.of(vendor)?.accounts === "keys" ? ((store as Record<string, Keyed> | null | undefined)?.[vendor]) : undefined;
  }

  export function folders_in(store: Store | null | undefined, vendor: string): Folders | undefined {
    return Vendors.of(vendor)?.accounts === "folders" ? ((store as Record<string, Folders> | null | undefined)?.[vendor]) : undefined;
  }

  export function logins_in(store: Store | null | undefined, vendor: string): Logins | undefined {
    return Vendors.of(vendor)?.accounts === "logins" ? ((store as Record<string, Logins> | null | undefined)?.[vendor]) : undefined;
  }

  // a store with a provider's entry put (or, none, taken out), the others
  // as they were, in their order
  export function put(store: Store, vendor: string, entry: Keyed | Folders | Logins | undefined): Store {
    const { [vendor]: _, ...others } = store as Record<string, unknown>;
    return (entry === undefined ? others : vendor in store ? { ...store, [vendor]: entry } : { ...others, [vendor]: entry }) as Store;
  }

  // a folders entry's accounts as read (a plan's run by another
  // program): those of the right shape (an id that names a folder: "own",
  // else letters and digits), each once; the one in use naming none, the
  // first
  export function folders(value: any): Folders {
    const text = (x: unknown) => (typeof x === "string" ? x : "");
    const all  = (Array.isArray(value?.accounts) ? value.accounts : []).filter((a: any) => typeof a?.id === "string" && /^[a-z0-9]+$/.test(a.id));
    const accounts = all.filter((a: any, k: number) => all.findIndex((o: any) => o.id === a.id) === k).map((a: any): Folder => ({ id: a.id, email: text(a.email), plan: text(a.plan), org: text(a.org) }));
    const use = accounts.some((a: Folder) => a.id === value?.use) ? value.use : accounts[0]?.id ?? "";
    return { use, accounts };
  }

  // ChatGPT's accounts as read: those of the right shape, each account
  // once; opencode's login one of them unless it says not
  export function logins(value: any): Logins {
    const text  = (x: unknown) => (typeof x === "string" ? x : "");
    const valid = (s: any) => typeof s?.key === "string" && s.key !== "" && typeof s.entry?.access === "string" && typeof s.entry.refresh === "string";
    const saved = (Array.isArray(value?.saved) ? value.saved : []).filter(valid).map((s: any): Saved => ({ key: s.key, email: text(s.email), plan: text(s.plan), entry: s.entry }));
    return { opencode: value?.opencode !== false, saved: saved.filter((s: Saved, k: number) => saved.findIndex((o: Saved) => o.key === s.key) === k) };
  }

  // an API vendor's entry as read: its keys of the right shape, the one
  // in use (one that names no key: the last added, else the environment's)
  export function keyed(value: any): Keyed {
    const keys = (Array.isArray(value?.keys) ? value.keys : []).filter((k: any): k is Key => typeof k?.id === "string" && typeof k.key === "string" && k.key !== "").map((k: Key) => ({ id: k.id, key: k.key, added: typeof k.added === "string" ? k.added : "" }));
    const use  = typeof value?.use === "string" && (value.use === ENV || keys.some((k: Key) => k.id === value.use)) ? value.use : keys.at(-1)?.id ?? ENV;
    return { use, keys };
  }

  // the file changed by f, under its lock, as it is just then (f giving
  // it back as it was: nothing written), the entries illi doesn't read
  // kept. null: changed; else why not, in plain words: it won't read,
  // another illi held it past WAIT, or it couldn't be saved
  export function edit(root: string, f: (store: Store) => Store): string | null {
    try {
      fs.mkdirSync(root, { recursive: true });
      const why = Flock.sync(path.join(root, ".accounts.lock"), WAIT, () => {
        const data = Accounts.raw(root);
        if (data === null) {
          return "the accounts file " + Accounts.file(root) + " won't read: illi leaves it as it is";
        }
        const now  = Accounts.store(data);
        const next = f(now);
        if (next !== now) {
          Accounts.write(root, next, Object.fromEntries(Object.entries(data).filter(([k]) => !KNOWN.includes(k))));
        }
        return null;
      });
      return why === undefined ? "another illi is changing the accounts just now: try again in a moment" : why;
    } catch (err: any) {
      return "the accounts file couldn't be saved" + Accounts.why(err, root);
    }
  }

  // why a file in `root` couldn't be saved, in plain words (": ..."; ""
  // if the system said nothing it names)
  export function why(err: any, root: string): string {
    const words: Record<string, string> = { ENOSPC: "the disk is full", EDQUOT: "the disk quota is used up", EACCES: "illi isn't allowed to write in " + root, EPERM: "illi isn't allowed to write in " + root, EROFS: root + " is read-only" };
    const code = typeof err?.code === "string" ? err.code : "";
    return words[code] !== undefined ? ": " + words[code] : code !== "" ? " (" + code + ")" : "";
  }

  // the file written whole, with `rest` (entries illi doesn't read) kept:
  // a file of its own, readable by its owner alone before anything is in
  // it, synced to the disk, then moved over the old one (the folder then
  // synced, so the move lasts too); the file of its own gone if any of
  // it fails
  export function write(root: string, store: Store, rest: Record<string, unknown> = {}): void {
    fs.mkdirSync(root, { recursive: true });
    const tmp = path.join(root, ".accounts." + process.pid + ".json");
    try {
      const fd = fs.openSync(tmp, "w", 0o600);
      try {
        fs.fchmodSync(fd, 0o600);
        fs.writeFileSync(fd, JSON.stringify({ ...rest, ...store }, null, 2) + "\n");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, Accounts.file(root));
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      throw err;
    }
    try {
      const dir = fs.openSync(root, "r");
      try {
        fs.fsyncSync(dir);
      } finally {
        fs.closeSync(dir);
      }
    } catch {}
  }

  // the file as it looks (its inode, size and time; "": none), to tell a
  // change without reading it
  export function stamp(root: string): string {
    try {
      const s = fs.statSync(Accounts.file(root));
      return s.ino + ":" + s.size + ":" + s.mtimeMs;
    } catch {
      return "";
    }
  }

  // whether a key could be one: printable ASCII, no space (one with a
  // character pasted from elsewhere, an invisible one, would go into a
  // request's header, which fails saying the header's whole value)
  export function plain(key: string): boolean {
    return /^[\x21-\x7e]+$/.test(key);
  }

  // a key as shown: its start and end around an ellipsis, never whole
  export function mask(key: string): string {
    return key.length <= 12 ? "…" + key.slice(-2) : key.slice(0, 7) + "…" + key.slice(-4);
  }

  // whether a file of illi's root is the accounts' (the file, its lock,
  // or one being written to move over it; a plan's folders, as claude/),
  // never a profile's to give
  export function owned(name: string): boolean {
    return name === "accounts.json" || name === ".accounts.lock" || FACTS.some((f) => f.folders === name) || /^\.accounts\.\d+\.json$/.test(name);
  }

  // a plan's account's folder, by the provider's id and the account's
  // ("": the program's own, as its environment names it)
  export function folder(root: string, vendor: string, id: string): string {
    const dir = Vendors.of(vendor)?.folders;
    return id === OWN || id === "" || dir === undefined ? "" : path.join(root, dir, id);
  }

  // a new key's id, none of those kept
  export function id(keys: Key[]): string {
    for (let n = keys.length + 1; ; n++) {
      if (!keys.some((k) => k.id === "k" + n)) {
        return "k" + n;
      }
    }
  }

}
