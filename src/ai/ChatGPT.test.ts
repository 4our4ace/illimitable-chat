// ChatGPT test
// ============
// `bun test ChatGPT.test.ts`. The login on a file of our own (config.LOGIN_SET),
// renewed against a stand-in for OpenAI's token endpoint: a good token is
// used as it is; one near its end, or refused, is renewed once however many
// ask, and written back with the file's other entries kept. The plan's
// limits, as a response's headers tell them.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-chatgpt-");
const FILE = DIR + "/auth.json";
process.env.ILLI_LOGIN = FILE;
process.env.ILLI_DIR = DIR;

const { ChatGPT } = await import("./ChatGPT.ts");

// a JWT with these claims (unsigned: only read here)
function jwt(claims: object): string {
  return ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");
}

const ACCOUNT = { "https://api.openai.com/auth": { chatgpt_account_id: "acct-1" } };

function write(access: string, expires: number): void {
  const openai = { type: "oauth", access, refresh: "r-0", expires };
  fs.writeFileSync(FILE, JSON.stringify({ anthropic: { type: "api", key: "kept" }, openai }));
}

// fetch stood in for: each renewal it was asked, and the tokens it gives
const asked: URLSearchParams[] = [];
const real = globalThis.fetch;
globalThis.fetch = (async (url: string, init: any) => {
  asked.push(new URLSearchParams(String(init.body)));
  await Bun.sleep(20);
  const access = jwt({ ...ACCOUNT, n: asked.length });
  return Response.json({ access_token: access, refresh_token: "r-" + asked.length, id_token: jwt(ACCOUNT), expires_in: 864000 });
}) as typeof fetch;

afterAll(() => {
  globalThis.fetch = real;
  fs.rmSync(DIR, { recursive: true, force: true });
});

test("a good token is used as it is, its account read from it", async () => {
  const access = jwt(ACCOUNT);
  write(access, Date.now() + 3600e3);
  expect(await ChatGPT.token()).toBe(access);
  expect(asked.length).toBe(0);
  expect(ChatGPT.headers(access, { model: "m", system: "s" } as any)["chatgpt-account-id"]).toBe("acct-1");
});

test("a token near its end is renewed once, however many ask, and written back", async () => {
  write(jwt(ACCOUNT), Date.now() + 60e3);
  ChatGPT.spoil(await ChatGPT.token().catch(() => ""));
  asked.length = 0;
  const tokens = await Promise.all([ChatGPT.token(), ChatGPT.token(), ChatGPT.token()]);
  expect(new Set(tokens).size).toBe(1);
  expect(asked.length).toBe(1);
  expect(asked[0].get("grant_type")).toBe("refresh_token");
  expect(asked[0].get("refresh_token")).toBe("r-0");
  const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  expect(data.anthropic).toEqual({ type: "api", key: "kept" });
  expect(data.openai).toMatchObject({ type: "oauth", access: tokens[0], refresh: "r-1", accountId: "acct-1" });
  expect(data.openai.expires).toBeGreaterThan(Date.now() + 863000e3);
  expect(fs.statSync(FILE).mode & 0o777).toBe(0o600);
});

test("a token the backend refused is renewed on the next request", async () => {
  const before = await ChatGPT.token();
  ChatGPT.spoil(before);
  const after = await ChatGPT.token();
  expect(after).not.toBe(before);
  expect(JSON.parse(fs.readFileSync(FILE, "utf8")).openai.refresh).toBe("r-" + asked.length);
});

test("renewal waits for another program's lock on the file", async () => {
  const holder = Bun.spawn(["python3", "-I", "-c", "import fcntl,sys,time;f=open(sys.argv[1],'w');fcntl.flock(f,fcntl.LOCK_EX);print('held',flush=True);time.sleep(0.5)", FILE + ".lock"], { stdout: "pipe" });
  const reader = holder.stdout.getReader();
  await reader.read();
  ChatGPT.spoil(await ChatGPT.token());
  const start = Date.now();
  await ChatGPT.token();
  expect(Date.now() - start).toBeGreaterThan(300);
  await holder.exited;
});

test("no login file says how to sign in", async () => {
  fs.rmSync(FILE);
  ChatGPT.spoil(await ChatGPT.token());
  await expect(ChatGPT.token()).rejects.toThrow("opencode auth login");
});

test("a response's headers tell the plan's limits, a window 0 minutes long none; one telling none keeps them", () => {
  const now = Date.now();
  ChatGPT.hear(new Headers({
    "x-codex-primary-used-percent"        : "23",
    "x-codex-primary-window-minutes"      : "300",
    "x-codex-primary-reset-after-seconds" : "7800",
    "x-codex-secondary-used-percent"      : "61",
    "x-codex-secondary-window-minutes"    : "10080",
    "x-codex-secondary-reset-at"          : String(Math.round(now / 1000) + 3 * 86400),
  }));
  const [hours, week] = ChatGPT.limits();
  expect(hours).toMatchObject({ window: 300, used: 23 });
  expect(Math.abs(hours.reset - (now + 7800e3))).toBeLessThan(1000);
  expect(week).toMatchObject({ window: 10080, used: 61 });
  expect(Math.abs(week.reset - (now + 3 * 86400e3))).toBeLessThan(1000);
  ChatGPT.hear(new Headers({ "content-type": "text/event-stream" }));
  expect(ChatGPT.limits()).toHaveLength(2);
  ChatGPT.hear(new Headers({ "x-codex-primary-used-percent": "1", "x-codex-primary-window-minutes": "10080", "x-codex-primary-reset-after-seconds": "588282", "x-codex-secondary-used-percent": "0", "x-codex-secondary-window-minutes": "0" }));
  expect(ChatGPT.limits()).toEqual([{ window: 10080, used: 1, reset: expect.any(Number) }]);
});
