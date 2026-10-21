// Login test
// ==========
// `bun test Login.test.ts`. illi's own ChatGPT login, against a stand-in
// for OpenAI's auth server: opencode's is used while illi has none; the
// device login gives a code and page, is polled till the person gives it
// (no connection or a server error meanwhile only asked again), changes
// its grant for tokens (its PKCE pair) and keeps them as illi's own (an
// unreadable file of its own replaced), which is used from then on; logout lets it go. A renewal writes
// back to the file it read, whatever a /login did meanwhile.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR  = fs.mkdtempSync(os.tmpdir() + "/illi-login-");
const DATA = fs.mkdtempSync(os.tmpdir() + "/illi-login-data-");
process.env.ILLI_DIR = DIR;
process.env.XDG_DATA_HOME = DATA;
delete process.env.ILLI_LOGIN;
fs.mkdirSync(DATA + "/opencode");
fs.writeFileSync(DATA + "/opencode/auth.json", JSON.stringify({ openai: { type: "oauth", access: "opencode-access", refresh: "r", expires: Date.now() + 3600e3 } }));

const config = await import("../config/Config.ts");
const { ChatGPT } = await import("./ChatGPT.ts");

// a JWT with these claims (unsigned: only read here)
function jwt(claims: object): string {
  return ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");
}

// the auth server stood in for: what each endpoint was asked
const asked: { url: string; body: string }[] = [];
let polls = 0;
const real = globalThis.fetch;
globalThis.fetch = (async (url: string, init: any) => {
  asked.push({ url, body: String(init.body) });
  if (url.endsWith("/deviceauth/usercode")) {
    return Response.json({ device_auth_id: "dev-1", usercode: "ABCD-1234", interval: "1" });
  }
  if (url.endsWith("/deviceauth/token")) {
    polls += 1;
    if (polls === 1) {
      throw new Error("Unable to connect. Is the computer able to access the url?");
    }
    return polls < 3 ? new Response("<html>bad gateway</html>", { status: 502 }) : Response.json({ authorization_code: "code-1", code_challenge: "ch", code_verifier: "ver-1" });
  }
  const id = jwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-9" } });
  return Response.json({ access_token: "own-access", refresh_token: "own-refresh", id_token: id, expires_in: 864000 });
}) as typeof fetch;

afterAll(() => {
  globalThis.fetch = real;
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.rmSync(DATA, { recursive: true, force: true });
});

test("opencode's login is used while illi has none of its own", async () => {
  expect(ChatGPT.file()).toBe(config.OPENCODE_LOGIN);
  expect(ChatGPT.signed()).toBe(true);
  expect(await ChatGPT.token()).toBe("opencode-access");
});

test("the device login: a code and page, polled till given, its tokens kept as illi's own", async () => {
  fs.writeFileSync(config.OWN_LOGIN, "{ cut sho");
  const { url, code, done } = await ChatGPT.device(new AbortController().signal);
  expect(url).toBe("https://auth.openai.com/codex/device");
  expect(code).toBe("ABCD-1234");
  expect(JSON.parse(asked[0].body)).toEqual({ client_id: "app_EMoamEEZ73f0CkXaXp7hrann" });
  await done;
  expect(polls).toBe(3);
  expect(JSON.parse(asked[1].body)).toEqual({ device_auth_id: "dev-1", user_code: "ABCD-1234" });
  const exchange = new URLSearchParams(asked[asked.length - 1].body);
  expect(asked[asked.length - 1].url).toBe("https://auth.openai.com/oauth/token");
  expect(Object.fromEntries(exchange)).toEqual({ grant_type: "authorization_code", code: "code-1", redirect_uri: "https://auth.openai.com/deviceauth/callback", client_id: "app_EMoamEEZ73f0CkXaXp7hrann", code_verifier: "ver-1" });
  const own = JSON.parse(fs.readFileSync(config.OWN_LOGIN, "utf8")).openai;
  expect(own).toMatchObject({ type: "oauth", access: "own-access", refresh: "own-refresh", accountId: "acct-9" });
  expect(fs.statSync(config.OWN_LOGIN).mode & 0o777).toBe(0o600);
  expect(ChatGPT.file()).toBe(config.OWN_LOGIN);
  expect(await ChatGPT.token()).toBe("own-access");
}, 10000);

test("logout lets illi's own login go: opencode's is used again", async () => {
  expect(ChatGPT.logout()).toBe(true);
  expect(fs.existsSync(config.OWN_LOGIN)).toBe(false);
  expect(ChatGPT.file()).toBe(config.OPENCODE_LOGIN);
  expect(await ChatGPT.token()).toBe("opencode-access");
  expect(ChatGPT.logout()).toBe(false);
});

test("a renewal writes back to the file it read, though a /login made illi's own meanwhile", async () => {
  fs.writeFileSync(config.OPENCODE_LOGIN, JSON.stringify({ openai: { type: "oauth", access: "old-access", refresh: "r", expires: 0 }, other: { kept: true } }));
  const fresh = JSON.stringify({ openai: { type: "oauth", access: "fresh-access", refresh: "fresh-refresh", expires: Date.now() + 3600e3 } });
  const stand = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: any) => {
    fs.writeFileSync(config.OWN_LOGIN, fresh);
    return stand(url, init);
  }) as typeof fetch;
  try {
    expect((await ChatGPT.renew()).access).toBe("own-access");
  } finally {
    globalThis.fetch = stand;
  }
  expect(fs.readFileSync(config.OWN_LOGIN, "utf8")).toBe(fresh);
  expect(JSON.parse(fs.readFileSync(config.OPENCODE_LOGIN, "utf8"))).toMatchObject({ openai: { access: "own-access" }, other: { kept: true } });
  ChatGPT.logout();
});
