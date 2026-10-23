// Context test
// ============
// `bun test Context.test.ts`. How much of the chat a turn sends before
// older messages fold, per model (its autocompact): `autocompact` (a share
// of the window, or tokens: 400000, 400k) and each model's own in
// `autocompacts`, read under their old names too (`context`, `contexts`;
// "auto" as none); at most 70% of the window, and never so much that a
// turn can't start under 90% of it beside what a request takes besides
// the chat. A change of one model's is merged into the file as it is,
// the old name dropped. A model ChatGPT lists is learned: offered, new or
// not, its window known, kept for the next start.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR  = fs.mkdtempSync(os.tmpdir() + "/illi-context-");
const DATA = fs.mkdtempSync(os.tmpdir() + "/illi-context-data-");
process.env.ILLI_DIR = DIR;
process.env.XDG_DATA_HOME = DATA;
delete process.env.ILLI_CONTEXT;
delete process.env.ILLI_MODELS;
fs.writeFileSync(DIR + "/config.json", JSON.stringify({ context: "60%", contexts: { "gpt-6.1-sol": 350000, big: 990000, auto: "auto", kilo: "400k" } }));
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

test("a model's own, else the share the old `context` names (its \"auto\" none: 60%); at most 70% of the window, less what a request takes beside the chat", () => {
  expect(config.config_context("gpt-6.1-sol", 500000)).toBe(350000);
  expect(config.config_context("gpt-6-luna", 272000)).toBe(163200);
  expect(config.config_context("big", 272000)).toBe(190400);
  expect(config.config_context("kilo", 872000)).toBe(400000);
  expect(config.config_context("auto", 872000)).toBe(523200);
  expect(config.config_context("auto")).toBe(76800);
  expect(config.config_context("auto", 1000000, 250000)).toBe(600000);
  expect(config.config_context("auto", 1000000, 400000)).toBe(500000);
  expect(config.config_tokens("400k", 1)).toBe(400000);
  expect(config.config_tokens("60%", 872000)).toBe(523200);
  expect(config.config_tokens("auto", 872000)).toBeNull();
});

test("a model's autocompact set: merged into the file as it is now, under the new name, the old dropped; null takes it out", () => {
  fs.writeFileSync(DIR + "/config.json", JSON.stringify({ context: "60%", contexts: { "gpt-6.1-sol": 350000, other: "40%" } }));
  expect(config.config_autocompact("gpt-6-luna", "50%")).toBeNull();
  const file = JSON.parse(fs.readFileSync(DIR + "/config.json", "utf8"));
  expect([file.contexts, file.autocompacts]).toEqual([undefined, { "gpt-6.1-sol": 350000, other: "40%", "gpt-6-luna": "50%" }]);
  expect(config.config_context("gpt-6-luna", 872000)).toBe(436000);
  config.config_autocompact("gpt-6-luna", null);
  expect(config.config_context("gpt-6-luna", 872000)).toBe(523200);
});

test("a model's autocompact set goes into the file that sets autocompacts; a variable setting them changes nothing", () => {
  fs.writeFileSync(DIR + "/config.json", JSON.stringify({ autocompacts: { other: "40%" } }));
  expect(config.config_autocompact("gpt-6-luna", "300k")).toBeNull();
  expect(JSON.parse(fs.readFileSync(DIR + "/config.json", "utf8")).autocompacts).toEqual({ other: "40%", "gpt-6-luna": "300k" });
  process.env.ILLI_AUTOCOMPACTS = "{}";
  try {
    expect(config.config_autocompact("gpt-6-luna", "50%")).toMatch(/^autocompacts is set by ILLI_AUTOCOMPACTS/);
  } finally {
    delete process.env.ILLI_AUTOCOMPACTS;
  }
  expect(JSON.parse(fs.readFileSync(DIR + "/config.json", "utf8")).autocompacts["gpt-6-luna"]).toBe("300k");
  config.config_autocompact("gpt-6-luna", null);
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
