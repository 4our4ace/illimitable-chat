// Login set test
// ==============
// `bun test LoginSet.test.ts`. With `login` naming a file, /login keeps
// its tokens there (its other entries kept), the file in use, never as
// Illi's own; /logout leaves that file.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-login-set-");
process.env.ILLI_DIR   = DIR;
process.env.ILLI_LOGIN = DIR + "/auth/chatgpt.json";
fs.mkdirSync(DIR + "/auth");
fs.writeFileSync(DIR + "/auth/chatgpt.json", JSON.stringify({ other: { kept: true } }));

const config = await import("../config/Config.ts");
const { ChatGPT } = await import("./ChatGPT.ts");

const real = globalThis.fetch;
globalThis.fetch = (async (url: string) => {
  if (url.endsWith("/deviceauth/usercode")) {
    return Response.json({ device_auth_id: "dev-1", usercode: "ABCD-1234", interval: "1" });
  }
  if (url.endsWith("/deviceauth/token")) {
    return Response.json({ authorization_code: "code-1", code_challenge: "ch", code_verifier: "ver-1" });
  }
  return Response.json({ access_token: "set-access", refresh_token: "set-refresh", expires_in: 864000 });
}) as typeof fetch;

afterAll(() => {
  globalThis.fetch = real;
  fs.rmSync(DIR, { recursive: true, force: true });
});

test("/login keeps its tokens in the file `login` names, which is the one used; /logout leaves it", async () => {
  expect(ChatGPT.own()).toBe(config.LOGIN_SET!);
  await (await ChatGPT.device(new AbortController().signal)).done;
  expect(JSON.parse(fs.readFileSync(config.LOGIN_SET!, "utf8"))).toMatchObject({ openai: { access: "set-access" }, other: { kept: true } });
  expect(fs.existsSync(config.OWN_LOGIN)).toBe(false);
  expect(ChatGPT.file()).toBe(config.LOGIN_SET!);
  expect(await ChatGPT.token()).toBe("set-access");
  expect(ChatGPT.logout()).toBe(false);
  expect(fs.existsSync(config.LOGIN_SET!)).toBe(true);
});
