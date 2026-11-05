// A provider no list of illi's names, added as illi starts (Vendors.add,
// Providers.add, Logins.add), runs as the others do with no change to
// the rest of illi: connected by its accounts' entry, offered, the
// default pick its own, its models and name known, a call handed to its
// program, its plan at the side, its page in /login under its maker (the
// rows it adds under its accounts with it), its accounts kept by their
// shape, what an account tells asked at the start.
// `bun test Fake.test.ts`.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-fake-provider-");
for (const k of Object.keys(process.env).filter((k) => k.startsWith("ILLI_") || k.endsWith("_API_KEY"))) {
  delete process.env[k];
}
process.env.ILLI_DIR      = DIR;
process.env.XDG_DATA_HOME = DIR + "/data";

// the fake plan connected: an account of its, the user's own folder
fs.writeFileSync(DIR + "/accounts.json", JSON.stringify({ fake: { use: "own", accounts: [{ id: "own", email: "me@fake.test", plan: "pro", org: "" }] }, later: { kept: true } }));

const { Vendors } = await import("./Vendors.ts");
const FACTS = {
  id       : "fake",
  name     : "your Fake plan",
  maker    : { name: "Fake", offers: "by Fake Inc: your Fake plan", order: 9 },
  row      : "Fake plan",
  models   : [{ label: "fake-1", id: "fake-model-1", speeds: ["slow"], window: 100000, price: 3 }, { label: "fake-mini-1", id: "fake-mini-1", speeds: ["slow"], window: 100000, price: 1 }],
  defaults : { pick: "fake:fake-*:medium:slow", compactor: (models: Array<{ label: string; price?: number }>) => "fake:" + [...models].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0].label + ":low:slow" },
  ttl      : 300e3,
  accounts : "folders" as const,
  folders  : "fake",
  dated    : true,
};
Vendors.add(FACTS);

const asked: any[] = [];
let accounts = 0;
// what its account tells next, asked (none: it asks nothing)
let telling: Promise<boolean> | undefined;
const { Providers } = await import("./Providers.ts");
Providers.add({
  facts   : FACTS,
  ask     : (ask) => {
    asked.push(ask);
    return { send: () => {}, stop: () => {}, done: Promise.resolve({ ok: true, text: "fake answer", left: [] }) };
  },
  account : () => {
    accounts++;
    return telling;
  },
  plan    : () => ({ tier: "pro", limits: [] }) as any,
  hint    : () => null,
});

const { Logins } = await import("./Logins.ts");
let updated = 0;
// connected while the accounts' file has its entry
const connected = () => "fake" in JSON.parse(fs.readFileSync(DIR + "/accounts.json", "utf8"));
Logins.add("fake", () => ({ name: "Fake plan", vendor: "fake" as any, about: () => "connected: me@fake.test", accounts: () => (connected() ? [{ name: "me@fake.test", about: "pro", use: true, take: () => {}, drop: () => {} }] : []), more: () => [{ name: "Update its program", about: "1.0 → 1.1", enter: "update it", pick: () => void updated++ }], adds: "", add: () => {}, out: () => {} }));

const config = await import("../config/Config.ts");
const { Accounts } = await import("../config/Accounts.ts");
const { Agent } = await import("../ai/Agent.ts");
const { Pick } = await import("../ai/Pick.ts");
const { Chat } = await import("../chat/Chat.ts");
const { Tools } = await import("../tools/Tools.ts");
const { login_after, term_login } = await import("../term/LoginCommands.ts");
const { term_hint } = await import("../term/Term.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

test("connected by its accounts' entry: offered, the default pick its own, its models and name known", () => {
  expect([config.OFFER.vendors, config.config_value("pick"), config.config_has("fake"), config.config_folder("fake" as any)]).toEqual([["fake" as any], "fake:fake-1:medium:slow", true, ""]);
  expect([Pick.provider("fake" as any), Pick.model("fake" as any, "fake-1")?.window, config.OFFER.models.includes("fake-1")]).toEqual(["your Fake plan", 100000, true]);
  expect(term_hint()).toBe("");
  expect(config.config_role("compactor", { vendor: "fake" as any, model: "fake-1", effort: "high", speed: "slow" })).toEqual({ vendor: "fake" as any, model: "fake-mini-1", effort: "low", speed: "slow" });
});

test("a call handed to its program, as a runner's; its plan asked for the side; what its account tells asked at the start", async () => {
  const run = Agent.ask({ vendor: "fake" as any, model: "fake-model-1", effort: "medium", speed: "slow", system: "", blocks: [{ text: "hi", mark: false }], searches: 0, server: "" }, () => {});
  expect([(await run.done).text, asked.length, asked[0].model]).toEqual(["fake answer", 1, "fake-model-1"]);
  const tools = { todo: [], mem: {}, cwd: DIR, perm: { allowed: [], refused: [] }, mode: null } as any;
  expect(Tools.state(tools, "fake" as any).use.plan).toEqual({ tier: "pro", limits: [] } as any);
  Chat.account({} as any);
  expect(accounts).toBe(1);
});

test("its page in /login, under its maker; the rows it adds under its accounts", () => {
  const t = { v: View.view_new(), scr: { tty: true, ed: Screen.ed_new() }, choose: null, question: null, wait: null, pane: null, notices: [], due: true, ver: 0, login: null, chat: null } as any;
  term_login(t);
  expect(t.choose.names).toContain("Fake");
  t.choose.pick(t.choose.names.indexOf("Fake"));
  expect([t.choose.names, t.choose.abouts ?? t.choose.about]).toEqual([["Fake plan"], ["connected: me@fake.test"]]);
  t.choose.pick(0);
  expect([t.choose.names, t.choose.about, t.choose.foot(1), t.choose.foot(2)]).toEqual([["me@fake.test", "Models", "Update its program", "Log out of Fake plan"], ["pro", "chats: fake-1 · medium, summaries: fake-mini-1 · low", "1.0 → 1.1", ""], "Enter choose them · Esc back", "Enter update it · Esc back"]);
  t.choose.pick(2);
  expect(updated).toBe(1);
});

test("its accounts kept by their shape, an entry no provider reads kept as it was", () => {
  const two = { use: "f2", accounts: [{ id: "own", email: "me@fake.test", plan: "pro", org: "" }, { id: "f2", email: "two@fake.test", plan: "", org: "" }] };
  expect(Accounts.edit(config.ROOT, (store) => Accounts.put(store, "fake", two))).toBeNull();
  expect([Accounts.folders_in(Accounts.read(config.ROOT), "fake"), JSON.parse(fs.readFileSync(DIR + "/accounts.json", "utf8")).later]).toEqual([two, { kept: true }]);
  expect([config.config_accounts(true), config.config_folder("fake" as any)]).toEqual([true, DIR + "/fake/f2"]);
});

// Enter on a list's row k, as Keys.ts does it: the list shut, then its pick
const enter = (t: any, k: number) => {
  const c  = t.choose;
  t.choose = null;
  c.pick(k);
};

// a terminal with no screen; /login opened on it while the fake plan
// wasn't connected, then connected (its entry put back), the picker shut
const fresh = () => {
  const t    = { v: View.view_new(), scr: { tty: true, ed: Screen.ed_new() }, choose: null, question: null, wait: null, pane: null, notices: [], due: true, ver: 0, login: null, chat: null } as any;
  const kept = fs.readFileSync(DIR + "/accounts.json", "utf8");
  fs.writeFileSync(DIR + "/accounts.json", JSON.stringify({ later: { kept: true } }));
  term_login(t);
  t.choose = null;
  expect(config.OFFER.vendors).not.toContain("fake");
  fs.writeFileSync(DIR + "/accounts.json", kept);
  return t;
};

// till ok, or a second has gone
const until = async (ok: () => boolean) => {
  for (let k = 0; k < 250 && !ok(); k++) {
    await Bun.sleep(4);
  }
};

test("connected anew, asked which model writes its summaries, then which its chats run on: what runs lit, kept unwritten; another kept by family; asked again by its Models row, not by a change of account", async () => {
  const t = fresh();
  login_after(t, "fake" as any, "Connected.");
  await until(() => t.choose !== null);
  expect([t.choose.title, t.choose.names, t.choose.about, t.choose.at]).toEqual(["Summaries on your Fake plan: which model writes them?", ["fake-1", "fake-mini-1"], ["100k context  $3.00/M in", "100k context  $1.00/M in"], 1]);
  enter(t, 1);
  expect([t.choose.title, t.choose.at, config.config_value("compactor")]).toEqual(["Chats on your Fake plan: which model do they run on?", 0, ""]);
  enter(t, 1);
  expect([t.choose, config.config_value("chats"), config.config_value("compactor"), config.PICK]).toEqual([null, "fake:fake-mini-*:medium:slow", "", { vendor: "fake" as any, model: "fake-mini-1", effort: "medium", speed: "slow" }]);
  expect(t.notices.at(-1).text).toBe("Your Fake plan: chats run on fake-mini-1 · medium, summaries on fake-mini-1 · low.");
  login_after(t, "fake" as any, "Fake plan now runs on two@fake.test.");
  await Bun.sleep(5);
  expect(t.choose).toBeNull();
  term_login(t);
  enter(t, t.choose.names.indexOf("Fake"));
  enter(t, 0);
  enter(t, t.choose.names.indexOf("Models"));
  expect(t.choose.title).toBe("Summaries on your Fake plan: which model writes them?");
  enter(t, 0);
  enter(t, 0);
  expect([config.config_value("compactor"), config.config_value("chats")]).toEqual(["fake:fake-*:low:slow", "fake:fake-*:medium:slow"]);
  config.config_set("compactor", "");
  config.config_set("chats", "");
});

test("a sign-in still ending as its account's connected (its wait let go after): asked once it has", async () => {
  const t = fresh();
  t.login = new AbortController();
  try {
    login_after(t, "fake" as any, "Signed in.");
  } finally {
    t.login = null;
  }
  await until(() => t.choose !== null);
  expect([t.choose?.title, t.notices.at(-1).text]).toEqual(["Summaries on your Fake plan: which model writes them?", "Signed in."]);
});

test("its models read first, a note saying so while they come; a list that never comes says where to choose them", async () => {
  let tell = (_: boolean) => {};
  telling = new Promise<boolean>((done) => (tell = done));
  const t = fresh();
  login_after(t, "fake" as any, "Connected.");
  await Bun.sleep(5);
  expect([t.choose, t.notices.at(-1).text]).toEqual([null, "Reading the models your Fake plan offers…"]);
  tell(true);
  await until(() => t.choose !== null);
  expect([t.choose?.title, t.notices.map((n: any) => n.text)]).toEqual(["Summaries on your Fake plan: which model writes them?", ["Connected."]]);
  telling = Promise.reject(new Error("offline"));
  const u = fresh();
  login_after(u, "fake" as any, "Connected.");
  await until(() => u.notices.at(-1).text !== "Reading the models your Fake plan offers…" && u.notices.at(-1).text !== "Connected.");
  expect([u.choose, u.notices.at(-1).text]).toEqual([null, "Its list of models didn't come. /login, Fake plan, Models chooses which of them your Fake plan runs on."]);
  telling = undefined;
});

test("connected anew while the screen is at something else: a note says where to choose its models instead", async () => {
  const t = fresh();
  t.scr.ed.text = "a message being typed";
  login_after(t, "fake" as any, "Connected.");
  await Bun.sleep(5);
  expect([t.choose, t.notices.at(-1).text]).toEqual([null, "/login, Fake plan, Models chooses which of them your Fake plan runs on."]);
});
