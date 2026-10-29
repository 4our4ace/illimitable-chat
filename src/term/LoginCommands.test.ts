// Login commands test
// ===================
// `bun test LoginCommands.test.ts`. /login's picker: the providers,
// ChatGPT and Claude, each saying what of it is connected, the chat's
// marked; each opens its ways in, its plan and its API key, each saying
// what it's connected with, the chat's marked; Esc goes a level up from
// each, and from the questions they ask, down to closed. An API whose
// variable is set connects on it, or on a key pasted; a key pasted shows
// as dots, is checked with its provider (the network stood in for) and,
// refused, is kept nowhere; taken, it is kept readable by its owner
// alone, in use at once, offered, and never in a note whole. A connected
// API's accounts: the one in use marked; Enter uses another; Del logs a
// kept key out, asked first (Keep it keeps it), the environment's never
// forgotten, as illi keeps no copy. The accounts are read again as the
// picker opens (another terminal's change); a list left open while
// another terminal changed them changes nothing gone, saying so; the
// last pasted key in use, forgotten, logs out of the API, the variable's
// never taken in its place unasked. Logging out of a provider,
// asked first, forgets its keys and stops its models being offered. The
// vendors setting leaving out what /login connected, /login says so and
// how. ChatGPT's accounts: each named by its email, told by its plan; a
// second signed in keeps the first apart, and Enter switches, each kept
// apart in turn with its login as renewed since; opencode's login one of
// them while illi may use it, Del leaving it to opencode (the next
// account in its place), the picker connecting it again; Del logs one
// out, asked first (one kept apart forgotten, the one in use let go);
// logging out of ChatGPT forgets all of illi's, opencode's left to it,
// ChatGPT no longer offered. The Claude plan (Claude Code stood in for):
// your Claude Code logged in, its login connects it (or a sign-in to
// another), run on as its environment names it; another account signs
// in in a folder of illi's, Claude Code's page's link told, the code
// asked as dots and given it, a wrong one saying why and Esc stopping
// it, each leaving no folder; signed in, kept and in use, its folder
// readable by its owner alone. Enter switches; Del leaves your Claude
// Code logged in, and logs one of illi's out, its folder gone; logging
// out of the Claude plan logs all of illi's out, the plan no longer
// offered, your Claude Code still logged in.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-login-commands-");
for (const k of Object.keys(process.env).filter((k) => k.startsWith("ILLI_"))) {
  delete process.env[k];
}
process.env.ILLI_DIR          = DIR;
process.env.XDG_DATA_HOME     = DIR + "/data";
process.env.ANTHROPIC_API_KEY = "sk-ant-from-env-0001";
process.env.OPENAI_API_KEY    = "";

// Claude Code stood in for: its auth commands in the folder
// CLAUDE_CONFIG_DIR names (the user's own: OWN_CLAUDE), its login a
// page's link, then a code read (good-code signs the folder in, as
// <folder>@example.com; another fails)
const OWN_CLAUDE = DIR + "/own-claude";
process.env.CLAUDE_CONFIG_DIR = OWN_CLAUDE;
process.env.ILLI_CLAUDE = DIR + "/claude-stub";
fs.writeFileSync(DIR + "/claude-stub", `#!/bin/sh
who="$CLAUDE_CONFIG_DIR/who.json"
case "$1 $2" in
  "auth status") if [ -f "$who" ]; then cat "$who"; else echo '{"loggedIn": false, "authMethod": "none"}'; exit 1; fi ;;
  "auth login")
    echo "Opening browser to sign in…"
    echo "If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&state=s1"
    printf "Paste code here if prompted > "
    read code
    if [ "$code" != "good-code" ]; then echo "OAuth error: Invalid code" >&2; exit 1; fi
    printf '{"loggedIn": true, "authMethod": "claude.ai", "email": "%s@example.com", "subscriptionType": "max", "orgName": "Org"}' "$(basename "$CLAUDE_CONFIG_DIR")" > "$who"
    echo "Login successful." ;;
  "auth logout") rm -f "$who"; echo "Successfully logged out." ;;
esac
`, { mode: 0o755 });

const { term_login } = await import("./LoginCommands.ts");
const { ChatGPT } = await import("../ai/ChatGPT.ts");
const { ClaudeCode } = await import("../ai/ClaudeCode.ts");
const { Accounts, ENV } = await import("../config/Accounts.ts");
const config = await import("../config/Config.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

// the keys each provider takes, and the keys asked about, in turn
const GOOD = ["sk-ant-from-env-0001", "sk-ant-pasted-key-1234", "sk-proj-openai-key-5678"];
const ASKED: string[] = [];
const fetched = globalThis.fetch;
globalThis.fetch = (async (_url: string, init: any) => {
  const key = init.headers["x-api-key"] ?? init.headers.authorization.replace(/^Bearer /, "");
  ASKED.push(key);
  return new Response("{}", { status: GOOD.includes(key) ? 200 : 401 });
}) as any;

afterAll(() => {
  globalThis.fetch = fetched;
  fs.rmSync(DIR, { recursive: true, force: true });
});

// a terminal with no screen, only its view and notes
const term = () => ({ v: View.view_new(), scr: { tty: true, ed: Screen.ed_new() }, choose: null, question: null, wait: null, pane: null, notices: [], due: true, ver: 0, login: null, chat: null }) as any;
const note = (t: any) => t.notices.at(-1)?.text ?? "";

// the last note, once one starting so has come (a key checked)
const noted = async (t: any, start: string) => {
  for (let k = 0; k < 250 && !note(t).startsWith(start); k++) {
    await Bun.sleep(4);
  }
  return note(t);
};

// till ok, or a second has gone
const until = async (ok: () => boolean) => {
  for (let k = 0; k < 250 && !ok(); k++) {
    await Bun.sleep(4);
  }
};

// the picker's row named name picked
const pick = (t: any, name: string) => t.choose.pick(t.choose.names.indexOf(name));

// /login opened at a way in, by its name, through its maker's picker
const MAKER: Record<string, string> = { "ChatGPT plan": "ChatGPT", "OpenAI API key": "ChatGPT", "Claude plan": "Claude", "Anthropic API key": "Claude" };
const open = (t: any, name: string) => {
  term_login(t);
  pick(t, MAKER[name]);
  pick(t, name);
};

test("the picker lists the providers, ChatGPT and Claude, each opening its plan and its API key, each saying what it's connected with", () => {
  const t = term();
  term_login(t);
  expect([t.choose.title, t.choose.names, t.choose.here, t.choose.foot(0)]).toEqual(["Providers", ["ChatGPT", "Claude"], -1, "Enter open"]);
  expect(t.choose.about).toEqual(["by OpenAI: your ChatGPT plan or an API key", "by Anthropic: your Claude plan or an API key"]);
  pick(t, "ChatGPT");
  expect([t.choose.title, t.choose.names, t.choose.about]).toEqual(["ChatGPT", ["ChatGPT plan", "OpenAI API key"], ["your ChatGPT plan (Plus or Pro): Enter signs in", "a key from platform.openai.com"]]);
  term_login(t);
  pick(t, "Claude");
  expect([t.choose.title, t.choose.names, t.choose.here]).toEqual(["Claude", ["Claude plan", "Anthropic API key"], -1]);
  expect(t.choose.about).toEqual(["your Claude plan, through Claude Code", "ANTHROPIC_API_KEY is set: Enter connects it"]);
  expect(t.choose.foot(1)).toBe("Enter connect · Esc back");
  expect(config.OFFER.vendors).toEqual(["chatgpt"]);
});

test("an API whose variable is set connects on it, checked with its provider first; offered at once", async () => {
  const t = term();
  open(t, "Anthropic API key");
  expect([t.question.title, t.question.names, t.question.about]).toEqual(["Connect Anthropic API key", ["Use ANTHROPIC_API_KEY", "Paste another key"], ["sk-ant-…0001", "kept in illi's accounts"]]);
  t.question.pick(0);
  expect(await noted(t, "Connected")).toBe("Connected Anthropic API (sk-ant-…0001): its models are in /model.");
  expect(ASKED.at(-1)).toBe("sk-ant-from-env-0001");
  expect(Accounts.read(config.ROOT)).toEqual({ "claude-api": { use: ENV, keys: [] } });
  expect([config.OFFER.vendors, config.KEYS.anthropic]).toEqual([["claude-api"], "sk-ant-from-env-0001"]);
  t.v.pick = config.PICK;
  term_login(t);
  expect([t.choose.here, t.choose.about[1]]).toEqual([1, "connected: Anthropic API key"]);
  pick(t, "Claude");
  expect([t.choose.here, t.choose.about[1], t.choose.foot(1)]).toEqual([1, "connected: sk-ant-…0001", "Enter its accounts · Esc back"]);
});

test("Esc goes a level up: from a way in's accounts to its maker's ways in, to the providers, then closed; from a question, back to the list that asked it", async () => {
  const { term_choose_key } = await import("./Keys.ts");
  const esc = (t: any) => term_choose_key(t, t.question ?? t.choose, "Esc");
  const t = term();
  open(t, "Anthropic API key");
  pick(t, "+ add another key");
  expect(t.question.title).toBe("Anthropic API key");
  esc(t);
  expect([t.question, t.choose.title]).toEqual([null, "Anthropic API key"]);
  t.choose.keys(0, "Delete");
  expect(t.question.title).toBe("Log out of Anthropic API?");
  esc(t);
  expect([t.question, t.choose.title, Accounts.read(config.ROOT)?.["claude-api"]]).toEqual([null, "Anthropic API key", { use: ENV, keys: [] }]);
  esc(t);
  expect([t.choose.title, t.choose.names]).toEqual(["Claude", ["Claude plan", "Anthropic API key"]]);
  esc(t);
  expect(t.choose.title).toBe("Providers");
  esc(t);
  expect([t.choose, t.question]).toEqual([null, null]);
});

test("a key pasted shows as dots and is checked: refused, kept nowhere; taken, kept readable by its owner alone and in use, never in a note whole", async () => {
  const t = term();
  open(t, "Anthropic API key");
  expect(t.choose.names).toEqual(["sk-ant-…0001", "+ add another key", "Log out of Anthropic API key"]);
  pick(t, "+ add another key");
  expect([t.question.title, t.question.ask.hint, t.question.ask.secret]).toEqual(["Anthropic API key", "paste it here: a key from console.anthropic.com", true]);
  expect(t.question.ask.done("  ")).toBe("Paste the key first.");
  expect(t.question.ask.done("sk-ant one")).toBe("A key has no spaces or special characters in it: paste it alone, as the provider shows it.");
  expect(t.question.ask.done("sk-ant-\u200bone")).toBe("A key has no spaces or special characters in it: paste it alone, as the provider shows it.");
  expect(t.question.ask.done("sk-ant-wrong-key-9999")).toBeNull();
  expect(await noted(t, "The key wasn't")).toBe("The key wasn't connected: Anthropic refused the key.");
  expect(Accounts.read(config.ROOT)).toEqual({ "claude-api": { use: ENV, keys: [] } });
  open(t, "Anthropic API key");
  pick(t, "+ add another key");
  t.question.ask.done(" sk-ant-pasted-key-1234 ");
  expect(await noted(t, "Connected")).toBe("Connected Anthropic API (sk-ant-…1234): its models are in /model.");
  expect(Accounts.read(config.ROOT)?.["claude-api"]).toMatchObject({ use: "k1", keys: [{ id: "k1", key: "sk-ant-pasted-key-1234" }] });
  expect(fs.statSync(Accounts.file(config.ROOT)).mode & 0o777).toBe(0o600);
  expect(config.KEYS.anthropic).toBe("sk-ant-pasted-key-1234");
  expect(JSON.stringify([t.notices, t.v])).not.toContain("pasted-key");
});

test("a connected API's accounts: the one in use marked; Enter uses another; Del logs a kept key out, asked first; the environment's is never forgotten", async () => {
  const t = term();
  open(t, "Anthropic API key");
  expect([t.choose.names, t.choose.about, t.choose.here]).toEqual([["sk-ant-…0001", "sk-ant-…1234", "+ add another key", "Log out of Anthropic API key"], ["from ANTHROPIC_API_KEY", expect.stringMatching(/^added \d{4}-\d\d-\d\d$/), "", "all 2 of them"], 1]);
  expect([t.choose.foot(0), t.choose.foot(1), t.choose.foot(2), t.choose.foot(3)]).toEqual(["Enter use it · Del log it out · Esc back", "in use · Del log it out · Esc back", "Enter connect · Esc back", "Enter log out · Esc back"]);
  t.choose.pick(0);
  expect(note(t)).toBe("Anthropic API now runs on sk-ant-…0001.");
  expect(config.KEYS.anthropic).toBe("sk-ant-from-env-0001");
  open(t, "Anthropic API key");
  expect(t.choose.keys(2, "Delete")).toBe(false);
  t.choose.keys(0, "Delete");
  expect(note(t)).toBe("ANTHROPIC_API_KEY is your environment's, so illi keeps no copy of it to forget: Enter on another key uses that one.");
  t.choose.keys(1, "Delete");
  expect([t.question.title, t.question.names]).toEqual(["Log out of sk-ant-…1234?", ["Keep it", "Log out"]]);
  t.question.pick(0);
  expect(Accounts.read(config.ROOT)?.["claude-api"]?.keys.length).toBe(1);
  open(t, "Anthropic API key");
  t.choose.keys(1, "Delete");
  t.question.pick(1);
  expect(note(t)).toBe("Logged out of sk-ant-…1234.");
  expect(Accounts.read(config.ROOT)).toEqual({ "claude-api": { use: ENV, keys: [] } });
});

test("the accounts are read again as the picker opens: a key another terminal added is there", () => {
  const was = Accounts.read(config.ROOT)!;
  Accounts.write(config.ROOT, { "claude-api": { use: "k7", keys: [{ id: "k7", key: "sk-ant-other-term-7777", added: "" }] } });
  const t = term();
  open(t, "Anthropic API key");
  expect([t.choose.names[t.choose.here], config.KEYS.anthropic]).toEqual(["sk-ant-…7777", "sk-ant-other-term-7777"]);
  Accounts.write(config.ROOT, was);
  config.config_accounts(true);
});

test("a list left open while another terminal changed the accounts changes nothing gone, saying so; the last pasted key in use, forgotten, logs out of the API, the variable's never taken unasked", () => {
  const was = Accounts.read(config.ROOT)!;
  const k7 = { "claude-api": { use: "k7", keys: [{ id: "k7", key: "sk-ant-other-term-7777", added: "" }] } };
  Accounts.write(config.ROOT, k7);
  const t = term();
  open(t, "Anthropic API key");
  expect(t.choose.names.slice(0, 2)).toEqual(["sk-ant-…0001", "sk-ant-…7777"]);
  Accounts.write(config.ROOT, {});
  t.choose.pick(0);
  expect(note(t)).toBe("That changed in another terminal meanwhile: /login shows the accounts as they are now.");
  expect(Accounts.read(config.ROOT)).toEqual({});
  Accounts.write(config.ROOT, k7);
  open(t, "Anthropic API key");
  t.choose.keys(1, "Delete");
  expect([t.question.title, t.question.about[1]]).toEqual(["Log out of Anthropic API?", "illi forgets its keys and stops offering its models"]);
  t.question.pick(1);
  expect([note(t), Accounts.read(config.ROOT)]).toEqual(["Logged out of Anthropic API.", {}]);
  Accounts.write(config.ROOT, was);
  config.config_accounts(true);
});

test("logging out of a provider, asked first, forgets its keys and stops its models being offered", () => {
  const t = term();
  open(t, "Anthropic API key");
  pick(t, "Log out of Anthropic API key");
  expect([t.question.title, t.question.about[1]]).toEqual(["Log out of Anthropic API?", "illi forgets its keys and stops offering its models"]);
  t.question.pick(1);
  expect(note(t)).toBe("Logged out of Anthropic API.");
  expect(Accounts.read(config.ROOT)).toEqual({});
  expect(config.OFFER.vendors).toEqual(["chatgpt"]);
});

test("the vendors setting leaving out what /login connected, /login says so and how", async () => {
  config.config_set("vendors", "chatgpt");
  const t = term();
  open(t, "OpenAI API key");
  expect(t.question.ask.hint).toBe("paste it here: a key from platform.openai.com");
  t.question.ask.done("sk-proj-openai-key-5678");
  expect(await noted(t, "Connected")).toBe("Connected OpenAI API (sk-proj…5678): its models are in /model. Your vendors setting leaves openai-api out, though: /set vendors default lets /login decide.");
  expect([config.OFFER.vendors, config.KEYS.openai]).toEqual([["chatgpt"], "sk-proj-openai-key-5678"]);
  config.config_set("vendors", null);
  expect(config.OFFER.vendors).toEqual(["openai-api"]);
});

// a ChatGPT login of an account, its email and plan (its token unsigned:
// only read here), its refresh token as given
const login = (account: string, email: string, plan: string, refresh = "r-" + account) => {
  const claims = { "https://api.openai.com/profile": { email }, "https://api.openai.com/auth": { chatgpt_account_id: account, chatgpt_plan_type: plan } };
  return { type: "oauth", access: "e30." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".sig", refresh, expires: Date.now() + 3600e3, accountId: account };
};
const saved = () => (Accounts.read(config.ROOT)?.chatgpt?.saved ?? []).map((s) => [s.key, s.entry.refresh]);
const OPENCODE = DIR + "/data/opencode/auth.json";

test("ChatGPT's account is named by its email, told by its plan; a second signed in keeps the first apart; Enter switches, each kept apart in turn with its login as renewed since", async () => {
  fs.writeFileSync(config.OWN_LOGIN, JSON.stringify({ openai: login("acct-1", "person@example.com", "plus") }));
  const t = term();
  term_login(t);
  expect(t.choose.about[0]).toBe("connected: ChatGPT plan and OpenAI API key");
  pick(t, "ChatGPT");
  expect(t.choose.about[0]).toBe("connected: person@example.com");
  pick(t, "ChatGPT plan");
  expect([t.choose.names, t.choose.about[0], t.choose.here]).toEqual([["person@example.com", "+ add another account", "Log out of ChatGPT plan"], "plus · illi's login", 0]);
  const [device, write] = [ChatGPT.device, process.stdout.write];
  ChatGPT.device = async () => ({ url: "https://auth.openai.com/codex/device", code: "ABCD-1234", done: ChatGPT.swap(login("acct-2", "work@example.com", "team")).then((why) => {
    if (why !== null) {
      throw new Error(why);
    }
  }) });
  process.stdout.write = (() => true) as any;
  try {
    pick(t, "+ add another account");
    expect(await noted(t, "Signed in")).toMatch(/^Signed in to ChatGPT as work@example\.com\. illi keeps the login in .*login\.json and renews it there\.$/);
  } finally {
    [ChatGPT.device, process.stdout.write] = [device, write];
  }
  expect([ChatGPT.key(), saved()]).toEqual(["acct-2", [["acct-1", "r-acct-1"]]]);
  fs.writeFileSync(config.OWN_LOGIN, JSON.stringify({ openai: login("acct-2", "work@example.com", "team", "renewed") }));
  open(t, "ChatGPT plan");
  expect([t.choose.names, t.choose.about.slice(0, 2), t.choose.here]).toEqual([["work@example.com", "person@example.com", "+ add another account", "Log out of ChatGPT plan"], ["team · illi's login", "plus"], 0]);
  t.choose.pick(1);
  expect(await noted(t, "ChatGPT now")).toBe("ChatGPT now runs on person@example.com.");
  expect([ChatGPT.key(), saved()]).toEqual(["acct-1", [["acct-2", "renewed"]]]);
  expect(fs.statSync(Accounts.file(config.ROOT)).mode & 0o777).toBe(0o600);
});

test("opencode's login is one of the accounts while illi may use it: switched to, illi's own kept apart; Del leaves it to opencode, the next account in its place", async () => {
  fs.mkdirSync(DIR + "/data/opencode", { recursive: true });
  fs.writeFileSync(OPENCODE, JSON.stringify({ openai: login("acct-3", "home@example.com", "pro") }));
  const t = term();
  open(t, "ChatGPT plan");
  expect([t.choose.names.slice(0, 3), t.choose.about[1]]).toEqual([["person@example.com", "home@example.com", "work@example.com"], "pro · opencode's login"]);
  t.choose.pick(1);
  expect(await noted(t, "ChatGPT now")).toBe("ChatGPT now runs on home@example.com.");
  expect([ChatGPT.file(), fs.existsSync(config.OWN_LOGIN), saved()]).toEqual([config.OPENCODE_LOGIN, false, [["acct-2", "renewed"], ["acct-1", "r-acct-1"]]]);
  open(t, "ChatGPT plan");
  t.choose.keys(0, "Delete");
  expect([t.question.title, t.question.about[1]]).toEqual(["Stop using opencode's login?", "opencode stays signed in; illi leaves it be"]);
  t.question.pick(1);
  expect(await noted(t, "illi no longer")).toBe("illi no longer uses opencode's login. ChatGPT now runs on work@example.com.");
  expect([ChatGPT.key(), saved(), JSON.parse(fs.readFileSync(OPENCODE, "utf8")).openai.accountId]).toEqual(["acct-2", [["acct-1", "r-acct-1"]], "acct-3"]);
  open(t, "ChatGPT plan");
  expect(t.choose.names).toEqual(["work@example.com", "person@example.com", "+ add another account", "Log out of ChatGPT plan"]);
});

test("Del logs an account out, asked first: one kept apart forgotten, the one in use let go; opencode's, left to it, connects again from the picker; logging out of ChatGPT forgets all of illi's, ChatGPT no longer offered", async () => {
  const t = term();
  open(t, "ChatGPT plan");
  t.choose.keys(1, "Delete");
  expect(t.question.title).toBe("Log out of person@example.com?");
  t.question.pick(1);
  expect([note(t), saved()]).toEqual(["Logged out of person@example.com.", []]);
  open(t, "ChatGPT plan");
  t.choose.keys(0, "Delete");
  t.question.pick(1);
  expect(await noted(t, "Logged out of work")).toBe("Logged out of work@example.com.");
  expect([ChatGPT.signed(), fs.existsSync(config.OWN_LOGIN), config.OFFER.vendors]).toEqual([false, false, ["openai-api"]]);
  term_login(t);
  pick(t, "ChatGPT");
  expect(t.choose.about[0]).toBe("opencode's login is there: Enter connects it");
  pick(t, "ChatGPT plan");
  expect([t.question.title, t.question.names, t.question.about]).toEqual(["Connect ChatGPT plan", ["Use opencode's login", "Sign in to another account"], ["home@example.com", "with a code at OpenAI's page"]]);
  t.question.pick(0);
  expect([note(t), ChatGPT.key(), config.OFFER.vendors]).toEqual(["ChatGPT runs on opencode's login (home@example.com).", "acct-3", ["chatgpt", "openai-api"]]);
  open(t, "ChatGPT plan");
  pick(t, "Log out of ChatGPT plan");
  expect([t.question.title, t.question.about[1]]).toEqual(["Log out of ChatGPT?", "illi forgets its logins and stops offering ChatGPT; opencode stays signed in"]);
  t.question.pick(1);
  expect([note(t), Accounts.read(config.ROOT)?.chatgpt, config.OFFER.vendors, fs.existsSync(OPENCODE)]).toEqual(["Logged out of ChatGPT.", { opencode: false, saved: [] }, ["openai-api"], true]);
});

const claude = () => Accounts.read(config.ROOT)?.["claude-code"];
const FOLDER = (id: string) => config.ROOT + "/claude/" + id;

test("the Claude plan, your Claude Code logged in: its login connects it (or a sign-in to another); runs on it as its environment names it", async () => {
  fs.mkdirSync(OWN_CLAUDE, { recursive: true });
  fs.writeFileSync(OWN_CLAUDE + "/who.json", JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "me@example.com", subscriptionType: "max", orgName: "Org" }));
  const t = term();
  term_login(t);
  pick(t, "Claude");
  expect([t.choose.names[0], t.choose.about[0]]).toEqual(["Claude plan", "your Claude plan, through Claude Code"]);
  pick(t, "Claude plan");
  await until(() => t.question?.title === "Connect Claude plan");
  expect([t.question.title, t.question.names, t.question.about]).toEqual(["Connect Claude plan", ["Use your Claude Code's login", "Sign in to another account"], ["me@example.com", "with a code at Claude's page"]]);
  t.question.pick(0);
  expect(note(t)).toBe("Connected your Claude plan (me@example.com): its models are in /model.");
  expect([claude(), config.OFFER.vendors, config.config_claude_dir(), ClaudeCode.env({} as any).CLAUDE_CONFIG_DIR]).toEqual([{ use: "own", accounts: [{ id: "own", email: "me@example.com", plan: "max", org: "Org" }] }, ["openai-api", "claude-code"], "", OWN_CLAUDE]);
});

test("another account signs in in a folder of illi's: Claude Code's page's link told, the code asked as dots and given it; a wrong one says why, Esc stops it, each leaving no folder; signed in, kept and in use", async () => {
  const t = term();
  const add = async () => {
    open(t, "Claude plan");
    pick(t, "+ add another account");
    await until(() => t.question?.title === "Claude plan");
  };
  open(t, "Claude plan");
  expect([t.choose.names, t.choose.about[0], t.choose.here]).toEqual([["me@example.com", "+ add another account", "Log out of Claude plan"], "max · your Claude Code", 0]);
  await add();
  expect([t.question.ask.hint, t.question.ask.secret, note(t)]).toEqual(["paste the code from Claude's page", true, "Sign in to Claude in your browser (if it didn't open: https://claude.com/cai/oauth/authorize?code=true&state=s1), then paste the code the page shows."]);
  expect(t.question.ask.done("")).toBe("Paste the code first.");
  t.question.ask.done("bad-code");
  expect(await noted(t, "Login failed")).toBe("Login failed: OAuth error: Invalid code.");
  expect([t.question, fs.existsSync(FOLDER("c1"))]).toEqual([null, false]);
  await add();
  t.question.back();
  await until(() => t.login === null);
  expect([t.question, t.choose.title, fs.existsSync(FOLDER("c1")), note(t)]).toEqual([null, "Claude plan", false, "Login failed: OAuth error: Invalid code."]);
  await add();
  t.question.ask.done("good-code");
  expect(await noted(t, "Signed in")).toBe("Signed in to your Claude plan as c1@example.com: illi runs on it now.");
  expect(claude()).toEqual({ use: "c1", accounts: [{ id: "own", email: "me@example.com", plan: "max", org: "Org" }, { id: "c1", email: "c1@example.com", plan: "max", org: "Org" }] });
  expect([config.config_claude_dir(), ClaudeCode.env({} as any).CLAUDE_CONFIG_DIR, fs.statSync(FOLDER("c1")).mode & 0o777]).toEqual([FOLDER("c1"), FOLDER("c1"), 0o700]);
});

test("Enter switches; Del leaves your Claude Code logged in, logs one of illi's out (its folder gone); logging out of the Claude plan logs all of illi's out, the plan no longer offered", async () => {
  const t = term();
  open(t, "Claude plan");
  expect([t.choose.names, t.choose.about.slice(0, 2), t.choose.here]).toEqual([["me@example.com", "c1@example.com", "+ add another account", "Log out of Claude plan"], ["max · your Claude Code", "max · illi's own folder"], 1]);
  t.choose.pick(0);
  expect([note(t), config.config_claude_dir()]).toEqual(["Claude plan now runs on me@example.com.", ""]);
  open(t, "Claude plan");
  t.choose.keys(0, "Delete");
  expect([t.question.title, t.question.about[1]]).toEqual(["Stop using your Claude Code's login?", "Claude Code stays logged in; illi leaves it be"]);
  t.question.pick(1);
  expect(await noted(t, "illi no longer")).toBe("illi no longer uses your Claude Code's login.");
  expect([claude()?.use, claude()?.accounts.map((a) => a.id), fs.existsSync(OWN_CLAUDE + "/who.json")]).toEqual(["c1", ["c1"], true]);
  open(t, "Claude plan");
  t.choose.keys(0, "Delete");
  expect([t.question.title, t.question.about[1]]).toEqual(["Log out of c1@example.com?", "illi logs its Claude Code out and forgets the folder"]);
  t.question.pick(1);
  expect(await noted(t, "Logged out of c1")).toBe("Logged out of c1@example.com.");
  expect([fs.existsSync(FOLDER("c1")), claude(), config.OFFER.vendors]).toEqual([false, undefined, ["openai-api"]]);
  open(t, "Claude plan");
  await until(() => t.question?.title === "Connect Claude plan");
  t.question.pick(0);
  open(t, "Claude plan");
  pick(t, "+ add another account");
  await until(() => t.question?.title === "Claude plan");
  t.question.ask.done("good-code");
  await noted(t, "Signed in");
  open(t, "Claude plan");
  pick(t, "Log out of Claude plan");
  expect(t.question.about[1]).toBe("illi logs its own folders out and stops offering the Claude plan; your Claude Code stays logged in");
  t.question.pick(1);
  expect(await noted(t, "Logged out of the")).toBe("Logged out of the Claude plan.");
  expect([fs.existsSync(FOLDER("c1")), claude(), config.OFFER.vendors, fs.existsSync(OWN_CLAUDE + "/who.json")]).toEqual([false, undefined, ["openai-api"], true]);
});
