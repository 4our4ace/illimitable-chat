// Accounts test
// =============
// `bun test Accounts.test.ts`. The accounts' file: written readable by
// its owner alone (an older file's looser mode never kept), nothing left
// beside it, read back as written; none, nothing connected; one that
// won't read never written over; a change waits on another illi's lock,
// the entries illi doesn't read kept, one that can't be saved saying why
// plainly and leaving nothing behind; a lock held past its wait given up,
// one the file system refuses gone on without; a vendor's keys of the wrong shape
// dropped, the one in use naming no key the last added (none: the
// environment's); ChatGPT's accounts of the wrong shape or twice dropped,
// opencode's login one of them unless it says not; another vendor left
// out; a key shown by its ends alone; a new key's id one not taken. As
// Config.ts follows it:
// nothing connected, ChatGPT offered (the chat says /login signs in) and
// the environment's key read but its vendor not offered; an API
// connected, offered at once, its key in use the one chosen (the
// environment's, or one kept); one whose key isn't there, not offered;
// a ChatGPT login, offered first; a pick set on a vendor let go gives way
// to its default, untold, and is back once the vendor is; the vendors
// setting naming them, the accounts change the keys alone. A Claude
// plan's accounts of the wrong shape or twice dropped, each a Claude Code
// folder (the user's own as their environment names it); connected, it
// is offered, claude-code running in its account in use's folder, and a
// switch, which moves no vendor or key, is told all the same.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-accounts-");
for (const k of Object.keys(process.env).filter((k) => k.startsWith("ILLI_"))) {
  delete process.env[k];
}
process.env.ILLI_DIR          = DIR;
process.env.XDG_DATA_HOME     = DIR + "/data";
process.env.ANTHROPIC_API_KEY = "sk-ant-from-env-0001";
process.env.OPENAI_API_KEY    = "";

const { Accounts, ENV } = await import("./Accounts.ts");
const { Flock } = await import("./Flock.ts");
const config = await import("./Config.ts");

afterAll(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
});

const STORE = DIR + "/store";
const FILE  = Accounts.file(STORE);

test("the file is written readable by its owner alone, an older one's mode not kept, nothing beside it; read back as written; none, nothing connected", () => {
  expect(Accounts.read(STORE)).toEqual({});
  fs.mkdirSync(STORE);
  fs.writeFileSync(FILE, "{}\n", { mode: 0o644 });
  fs.chmodSync(FILE, 0o644);
  const store = { "claude-api": { use: "k1", keys: [{ id: "k1", key: "sk-ant-kept-0002", added: "2026-10-29T10:00:00.000Z" }] } };
  Accounts.write(STORE, store);
  expect(fs.statSync(FILE).mode & 0o777).toBe(0o600);
  expect(fs.readdirSync(STORE)).toEqual(["accounts.json"]);
  expect(Accounts.read(STORE)).toEqual(store);
});

test("a file that won't read is never written over: its keys would be lost", () => {
  for (const bad of ["{ not json", "[1]", "null"]) {
    fs.writeFileSync(FILE, bad);
    expect(Accounts.read(STORE)).toBeNull();
    expect(Accounts.edit(STORE, () => ({}))).toBe("the accounts file " + FILE + " won't read: illi leaves it as it is");
    expect(fs.readFileSync(FILE, "utf8")).toBe(bad);
  }
  fs.rmSync(FILE);
  expect(Accounts.edit(STORE, (store) => ({ ...store, "openai-api": { use: ENV, keys: [] } }))).toBeNull();
  expect(Accounts.read(STORE)).toEqual({ "openai-api": { use: ENV, keys: [] } });
});

test("a change waits while another illi holds the file's lock, then changes what it finds; the entries illi doesn't read are kept; one that can't be saved says why in plain words, leaving nothing behind", async () => {
  fs.writeFileSync(FILE, JSON.stringify({ "claude-api": { use: ENV, keys: [] }, "newer-vendor": { keys: ["kept"] } }));
  const holder = Bun.spawn(["python3", "-I", "-c", "import fcntl,sys,time;f=open(sys.argv[1],'w');fcntl.flock(f,fcntl.LOCK_EX);print('held',flush=True);time.sleep(0.4)", STORE + "/.accounts.lock"], { stdout: "pipe" });
  const reader = holder.stdout.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain("held");
  const start = Date.now();
  expect(Accounts.edit(STORE, (store) => ({ ...store, "openai-api": { use: ENV, keys: [] } }))).toBeNull();
  expect(Date.now() - start).toBeGreaterThan(200);
  await holder.exited;
  expect(JSON.parse(fs.readFileSync(FILE, "utf8"))).toEqual({ "newer-vendor": { keys: ["kept"] }, "claude-api": { use: ENV, keys: [] }, "openai-api": { use: ENV, keys: [] } });
  expect(Accounts.edit(STORE, ({ "openai-api": _, ...rest }) => rest)).toBeNull();
  expect(Object.keys(JSON.parse(fs.readFileSync(FILE, "utf8")))).toEqual(["newer-vendor", "claude-api"]);
  expect([Accounts.owned(".accounts.lock"), Accounts.owned(".accounts.123.json")]).toEqual([true, true]);
  if (process.getuid?.() !== 0) {
    fs.chmodSync(STORE, 0o500);
    try {
      expect(Accounts.edit(STORE, () => ({}))).toBe("the accounts file couldn't be saved: illi isn't allowed to write in " + STORE);
    } finally {
      fs.chmodSync(STORE, 0o700);
    }
    expect(fs.readdirSync(STORE).sort()).toEqual([".accounts.lock", "accounts.json"]);
  }
  expect(Accounts.why({ code: "ENOSPC" }, STORE)).toBe(": the disk is full");
});

test("a lock another holds is waited on, then given up past its wait; one the file system refuses (no lock to take) lets the change go on without it", async () => {
  const lock = STORE + "/.accounts.lock";
  const holder = Bun.spawn(["python3", "-I", "-c", "import fcntl,sys,time;f=open(sys.argv[1],'w');fcntl.flock(f,fcntl.LOCK_EX);print('held',flush=True);time.sleep(0.6)", lock], { stdout: "pipe" });
  expect(new TextDecoder().decode((await holder.stdout.getReader().read()).value)).toContain("held");
  expect(Flock.sync(lock, 100, () => "ran")).toBeUndefined();
  await holder.exited;
  expect(Flock.sync(lock, 100, () => "ran")).toBe("ran");
  expect(Flock.take(987654)).toBe("none");
});

test("a vendor's keys of the wrong shape dropped, the one in use naming no key the last added (none: the environment's); ChatGPT's accounts of the wrong shape or twice dropped, opencode's one of them unless it says not; a vendor of neither left out", () => {
  const keys = [{ id: "k1", key: "a" }, { id: 2, key: "b" }, { id: "k3", key: "" }, { id: "k4", key: "d", added: "x" }, "k5"];
  expect(Accounts.keyed({ use: "k9", keys })).toEqual({ use: "k4", keys: [{ id: "k1", key: "a", added: "" }, { id: "k4", key: "d", added: "x" }] });
  expect(Accounts.keyed({ use: "k1", keys })).toMatchObject({ use: "k1" });
  expect(Accounts.keyed({ use: ENV, keys })).toMatchObject({ use: ENV });
  expect(Accounts.keyed({ use: "k1" })).toEqual({ use: ENV, keys: [] });
  expect(Accounts.keyed(null)).toEqual({ use: ENV, keys: [] });
  fs.writeFileSync(FILE, JSON.stringify({ chatgpt: { use: "k1" }, "claude-api": { use: ENV }, bogus: 1 }));
  expect(Accounts.read(STORE)).toEqual({ chatgpt: { opencode: true, saved: [] }, "claude-api": { use: ENV, keys: [] } });
  const entry = { type: "oauth", access: "a", refresh: "r" };
  const saved = [{ key: "acct-1", email: "a@example.com", plan: "plus", entry }, { key: "acct-1", entry }, { key: "", entry }, { key: "acct-2", entry: { access: "a" } }, { key: "acct-3", email: 3, entry }];
  expect(Accounts.logins({ opencode: false, saved })).toEqual({ opencode: false, saved: [{ key: "acct-1", email: "a@example.com", plan: "plus", entry }, { key: "acct-3", email: "", plan: "", entry }] });
});

test("a key is shown by its ends alone; a new key's id is one not taken", () => {
  expect(Accounts.mask("sk-ant-api03-abcdefghijklmnop-WXYZ")).toBe("sk-ant-…WXYZ");
  expect(Accounts.mask("sk-proj-0123456789")).toBe("sk-proj…6789");
  expect(Accounts.mask("short-key")).toBe("…ey");
  const key = (id: string) => ({ id, key: "x", added: "" });
  expect([Accounts.id([]), Accounts.id([key("k1")]), Accounts.id([key("k2")]), Accounts.id([key("k3"), key("k1")])]).toEqual(["k1", "k2", "k3", "k4"]);
});

test("nothing connected: ChatGPT offered, so the chat says /login signs in; the environment's key read, its vendor not offered", () => {
  expect(config.OFFER.vendors).toEqual(["chatgpt"]);
  expect(config.KEYS.anthropic).toBe("sk-ant-from-env-0001");
  expect(config.config_named()).toBe(false);
  expect(config.config_accounts()).toBe(false);
});

test("an API connected is offered at once, on the key chosen: the environment's, or one kept; one whose key isn't there, not", () => {
  Accounts.write(config.ROOT, { "claude-api": { use: ENV, keys: [] } });
  expect(config.config_accounts()).toBe(true);
  expect([config.OFFER.vendors, config.KEYS.anthropic, config.PICK.vendor]).toEqual([["claude-api"], "sk-ant-from-env-0001", "claude-api"]);
  Accounts.write(config.ROOT, { "claude-api": { use: "k1", keys: [{ id: "k1", key: "sk-ant-kept-0002", added: "" }] } });
  expect(config.config_accounts()).toBe(true);
  expect([config.OFFER.vendors, config.KEYS.anthropic]).toEqual([["claude-api"], "sk-ant-kept-0002"]);
  expect(config.config_accounts()).toBe(false);
  Accounts.write(config.ROOT, { "claude-api": { use: ENV, keys: [] }, "openai-api": { use: ENV, keys: [] } });
  expect(config.config_accounts()).toBe(true);
  expect([config.OFFER.vendors, config.KEYS.openai]).toEqual([["claude-api"], ""]);
});

test("a ChatGPT login is offered first; a pick set on a vendor let go gives way to its default, untold, and is back with it", () => {
  fs.writeFileSync(config.OWN_LOGIN, JSON.stringify({ openai: { type: "oauth", access: "a", refresh: "r", expires: Date.now() + 3600e3 } }));
  expect(config.config_accounts()).toBe(true);
  expect(config.OFFER.vendors).toEqual(["chatgpt", "claude-api"]);
  config.config_set("pick", "claude-api:sonnet-5.5:high:slow");
  expect(config.PICK).toMatchObject({ vendor: "claude-api", effort: "high" });
  const notes = config.NOTES.length;
  Accounts.write(config.ROOT, {});
  config.config_accounts();
  expect([config.OFFER.vendors, config.PICK.vendor]).toEqual([["chatgpt"], "chatgpt"]);
  Accounts.write(config.ROOT, { "claude-api": { use: ENV, keys: [] } });
  config.config_accounts();
  expect(config.PICK).toMatchObject({ vendor: "claude-api", effort: "high" });
  expect(config.NOTES.length).toBe(notes);
  config.config_set("pick", null);
});

test("the vendors setting naming them, the accounts change the keys alone; unset, /login's again", () => {
  config.config_set("vendors", "chatgpt");
  expect([config.config_named(), config.OFFER.vendors]).toEqual([true, ["chatgpt"]]);
  Accounts.write(config.ROOT, { "claude-api": { use: "k1", keys: [{ id: "k1", key: "sk-ant-kept-0003", added: "" }] } });
  expect(config.config_accounts()).toBe(true);
  expect([config.OFFER.vendors, config.KEYS.anthropic]).toEqual([["chatgpt"], "sk-ant-kept-0003"]);
  config.config_set("vendors", null);
  expect([config.config_named(), config.OFFER.vendors]).toEqual([false, ["chatgpt", "claude-api"]]);
});

test("a Claude plan's accounts of the wrong shape (an id naming no folder of illi's) or twice dropped, the one in use naming none the first; each a Claude Code folder, the user's own as their environment names it", () => {
  const all = [{ id: "own", email: "me@example.com" }, { id: "own" }, { id: "../x" }, { id: "c2", email: 3, plan: "max" }];
  expect(Accounts.folders({ use: "c9", accounts: all })).toEqual({ use: "own", accounts: [{ id: "own", email: "me@example.com", plan: "", org: "" }, { id: "c2", email: "", plan: "max", org: "" }] });
  expect(Accounts.folders(null)).toEqual({ use: "", accounts: [] });
  expect([Accounts.folder("/r", "own"), Accounts.folder("/r", "c2"), Accounts.owned("claude"), Accounts.owned("claude-code.json")]).toEqual(["", "/r/claude/c2", true, false]);
});

test("a Claude plan connected is offered, the folder claude-code runs in its account in use's; a switch, which moves no vendor or key, is told all the same", () => {
  const me = (id: string) => ({ id, email: id + "@example.com", plan: "max", org: "" });
  Accounts.write(config.ROOT, { "claude-code": { use: "own", accounts: [me("own"), me("c1")] } });
  expect(config.config_accounts()).toBe(true);
  expect([config.OFFER.vendors.includes("claude-code"), config.config_claude_dir()]).toEqual([true, ""]);
  Accounts.write(config.ROOT, { "claude-code": { use: "c1", accounts: [me("own"), me("c1")] } });
  expect([config.config_accounts(), config.config_claude_dir()]).toEqual([true, config.ROOT + "/claude/c1"]);
  expect(config.config_accounts()).toBe(false);
});
