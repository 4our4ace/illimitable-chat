// Context test
// ============
// `bun test Context.test.ts`. How much of the chat a turn sends, per
// model: `context` (a number, a share of the window, or auto: 70% of it,
// at most 400k) and each model's own in `contexts`, never past 90% of its
// window. A model ChatGPT lists is learned: offered, new or not, its
// window known, kept for the next start.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR  = fs.mkdtempSync(os.tmpdir() + "/illi-context-");
const DATA = fs.mkdtempSync(os.tmpdir() + "/illi-context-data-");
process.env.ILLI_DIR = DIR;
process.env.XDG_DATA_HOME = DATA;
delete process.env.ILLI_CONTEXT;
delete process.env.ILLI_MODELS;
fs.writeFileSync(DIR + "/config.json", JSON.stringify({ context: "60%", contexts: { "gpt-6.1-sol": 350000, big: 990000, auto: "auto" } }));
fs.writeFileSync(DIR + "/models.json", JSON.stringify({ vendors: { chatgpt: [{ label: "gpt-7-kept", id: "gpt-7-kept", speeds: ["slow"], window: 400000 }] } }));
fs.mkdirSync(DATA + "/opencode");
fs.writeFileSync(DATA + "/opencode/auth.json", JSON.stringify({ openai: { type: "oauth", access: "e30.e30.sig", refresh: "r", expires: Date.now() + 3600e3 } }));

const config = await import("./Config.ts");
const { Pick } = await import("../ai/Pick.ts");
const { ChatGPT } = await import("../ai/ChatGPT.ts");

afterAll(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.rmSync(DATA, { recursive: true, force: true });
});

test("a model's own number, else the share `context` names, else auto; never past 90% of the window", () => {
  expect(config.config_context("gpt-6.1-sol", 500000)).toBe(350000);
  expect(config.config_context("gpt-6-luna", 272000)).toBe(163200);
  expect(config.config_context("big", 272000)).toBe(244800);
  expect(config.config_context("auto", 1000000)).toBe(400000);
  expect(config.config_context("auto", 500000)).toBe(350000);
  expect(config.config_context("auto", 272000)).toBe(190400);
  expect(config.config_context("auto")).toBe(89600);
});

test("the models kept from the last start are offered, their windows known", () => {
  expect(config.OFFER.models).toContain("gpt-7-kept");
  expect(Pick.window({ vendor: "chatgpt", model: "gpt-7-kept", effort: "low", speed: "slow" })).toBe(400000);
});

test("ChatGPT's list: a new model shown is offered and kept, a hidden one not, a known one's window told", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ models: [
    { slug: "gpt-6-luna", visibility: "list", priority: 5, context_window: 300000 },
    { slug: "gpt-7-nova", visibility: "list", priority: 1, context_window: 1000000 },
    { slug: "gpt-secret", visibility: "hide", priority: 2, context_window: 272000 },
  ] })) as unknown as typeof fetch;
  try {
    expect(await ChatGPT.models()).toEqual(["gpt-7-nova"]);
  } finally {
    globalThis.fetch = real;
  }
  expect(config.OFFER.models).toContain("gpt-7-nova");
  expect(config.OFFER.models).not.toContain("gpt-secret");
  expect(Pick.window({ vendor: "chatgpt", model: "gpt-7-nova", effort: "low", speed: "slow" })).toBe(1000000);
  expect(Pick.window({ vendor: "chatgpt", model: "gpt-6-luna", effort: "low", speed: "slow" })).toBe(300000);
  expect(JSON.parse(fs.readFileSync(config.MODELS_FILE, "utf8")).vendors.chatgpt.map((m: any) => m.label)).toEqual(["gpt-7-nova", "gpt-6-luna"]);
});
