// Context test
// ============
// `bun test Context.test.ts`. How much of the chat a turn sends before
// older messages fold, per model (its autocompact): `autocompact` (a share
// of the window, or tokens: 400000, 400k) and each model's own in
// `autocompacts`, read under their old names too (`context`, `contexts`;
// "auto" as none); at most 70% of the window, and never so much that a
// turn can't start under 90% of it beside what a request takes besides
// the chat. A change of one model's is merged into the file as it is,
// the old name dropped. ChatGPT's catalog is the chatgpt list: each
// model's whole window, its usual one, efforts and speeds, kept naming the
// account (another vendor's kept too); a pick its model can't run as asked
// runs at the nearest; a refusal past the usual window teaches it for the
// account; a compactor whose model it dropped runs on its first one.
// Anthropic's model list tells the built-in models' windows.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR  = fs.mkdtempSync(os.tmpdir() + "/illi-context-");
const DATA = fs.mkdtempSync(os.tmpdir() + "/illi-context-data-");
process.env.ILLI_DIR = DIR;
process.env.XDG_DATA_HOME = DATA;
process.env.ILLI_VENDORS = "claude-api,chatgpt";
delete process.env.ILLI_CONTEXT;
delete process.env.ILLI_MODELS;
fs.writeFileSync(DIR + "/config.json", JSON.stringify({ context: "60%", contexts: { "gpt-6.1-sol": 350000, big: 990000, auto: "auto", kilo: "400k" } }));
fs.writeFileSync(DIR + "/models.json", JSON.stringify({ vendors: { chatgpt: [{ label: "gpt-7-kept", id: "gpt-7-kept", speeds: ["slow"], window: 400000 }], "claude-code": [{ label: "opus-5.5", id: "claude-opus-5-5", speeds: ["slow"], window: 1000000 }] } }));
fs.mkdirSync(DATA + "/opencode");
const ACCESS = "e30." + Buffer.from(JSON.stringify({ chatgpt_account_id: "acct-1" })).toString("base64url") + ".sig";
fs.writeFileSync(DATA + "/opencode/auth.json", JSON.stringify({ openai: { type: "oauth", access: ACCESS, refresh: "r", expires: Date.now() + 3600e3 } }));

const config = await import("./Config.ts");
const { Pick } = await import("../ai/Pick.ts");
const { ChatGPT } = await import("../ai/ChatGPT.ts");
const { Anthropic } = await import("../ai/Anthropic.ts");

// fetch answering each URL asked with `answer`'s JSON for it, while fn runs
async function fetching<T>(answer: (url: string) => unknown, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const got = answer(String(url));
    return got instanceof Response ? got : Response.json(got);
  }) as unknown as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

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

// the catalog ChatGPT's backend gives this account: sol at 872k (its
// usual 272k), four efforts, fast as priority; luna at 272k, two efforts
const CATALOG = { models: [
  { slug: "gpt-6-luna", visibility: "list", priority: 2, context_window: 272000, supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }] },
  { slug: "gpt-6.1-sol", visibility: "list", priority: 1, context_window: 272000, max_context_window: 872000, supported_reasoning_levels: ["low", "medium", "high", "xhigh"].map((effort) => ({ effort })), service_tiers: [{ id: "priority" }] },
  { slug: "gpt-hidden", visibility: "hide", priority: 0, context_window: 272000 },
] };

test("ChatGPT's catalog is the chatgpt list: each model's whole window, its usual one, efforts and speeds; kept naming the account, another vendor's kept too", async () => {
  expect(await fetching(() => CATALOG, () => ChatGPT.models())).toEqual([]);
  const [sol, luna] = Pick.list("chatgpt");
  expect(Pick.list("chatgpt").map((m) => m.label)).toEqual(["gpt-6.1-sol", "gpt-6-luna"]);
  expect(sol).toEqual({ label: "gpt-6.1-sol", id: "gpt-6.1-sol", speeds: ["slow", "fast"], window: 872000, standard: 272000, efforts: ["low", "medium", "high", "xhigh"], tiers: { fast: "priority" } });
  expect(luna).toMatchObject({ speeds: ["slow"], window: 272000, standard: undefined, efforts: ["low", "medium"] });
  const file = JSON.parse(fs.readFileSync(config.MODELS_FILE, "utf8"));
  expect([file.account, file.capped, Object.keys(file.vendors).sort()]).toEqual(["acct-1", [], ["chatgpt", "claude-code"]]);
  expect(config.config_context("gpt-6.1-sol", 872000)).toBe(523200);
});

test("a pick whose effort or speed its model lacks is kept, run at the nearest it has; fast is sent as the catalog's tier", () => {
  const offer = { vendors: ["chatgpt" as const], models: config.OFFER.models };
  const def   = { vendor: "chatgpt" as const, model: "gpt-6.1-sol", effort: "medium", speed: "slow" };
  const saved = { vendor: "chatgpt" as const, model: "gpt-6-luna", effort: "xhigh", speed: "fast" };
  expect(Pick.load(saved, offer, def)).toEqual(saved);
  expect(Pick.fit(saved)).toEqual({ ...saved, effort: "medium", speed: "slow" });
  expect(Pick.shown(saved)).toBe("gpt-6-luna · medium");
  const ask = (model: string, speed: string) => ({ model, speed, effort: "medium", system: "s", searches: 0, blocks: [], imgs: [] }) as any;
  expect((ChatGPT.body(ask("gpt-6.1-sol", "fast"), [], [], 1000) as any).service_tier).toBe("priority");
  expect((ChatGPT.body(ask("gpt-6.1-sol", "slow"), [], [], 1000) as any).service_tier).toBe("default");
});

test("a request refused as too long past the usual window makes it the model's whole one for the account, kept through the catalog asked again", async () => {
  expect(ChatGPT.refused("gpt-6.1-sol")).toBe(true);
  expect(Pick.model("chatgpt", "gpt-6.1-sol")).toMatchObject({ window: 272000, standard: undefined });
  expect(ChatGPT.refused("gpt-6.1-sol")).toBe(false);
  expect(JSON.parse(fs.readFileSync(config.MODELS_FILE, "utf8")).capped).toEqual(["gpt-6.1-sol"]);
  await fetching(() => CATALOG, () => ChatGPT.models());
  expect(Pick.model("chatgpt", "gpt-6.1-sol")).toMatchObject({ window: 272000, standard: undefined });
});

test("a compactor whose default model the catalog dropped runs on the vendor's first model at the default's effort", () => {
  const chat = { vendor: "chatgpt" as const, model: "gpt-6-luna", effort: "low", speed: "slow" };
  expect(config.config_role("compactor", chat)).toEqual({ vendor: "chatgpt", model: "gpt-6-luna", effort: "medium", speed: "slow" });
  Pick.learn("chatgpt", Pick.list("chatgpt").filter((m) => m.label !== "gpt-6-luna"), "replace");
  expect(config.config_role("compactor", chat)).toEqual({ vendor: "chatgpt", model: "gpt-6.1-sol", effort: "medium", speed: "slow" });
});

test("Anthropic's model list, page after page, tells the built-in models' windows, kept; a failure says why", async () => {
  const pages: Record<string, unknown> = {
    "": { data: [{ id: "claude-opus-5-5", max_input_tokens: 900000 }, { id: "claude-old-1", max_input_tokens: 100000 }], has_more: true, last_id: "claude-old-1" },
    "claude-old-1": { data: [{ id: "claude-haiku-5-5", max_input_tokens: 400000 }], has_more: false, last_id: "claude-haiku-5-5" },
  };
  const page = (url: string) => pages[new URL(url).searchParams.get("after_id") ?? ""];
  expect(await fetching(page, () => Anthropic.models("key"))).toBe(true);
  expect(["opus-5.5", "haiku-5.5", "sonnet-5.5"].map((model) => Pick.window({ vendor: "claude-api", model, effort: "low", speed: "slow" }))).toEqual([900000, 400000, 1000000]);
  expect(Pick.model("claude-api", "claude-old-1")).toBeUndefined();
  expect(JSON.parse(fs.readFileSync(config.MODELS_FILE, "utf8")).vendors["claude-api"].map((m: any) => m.window)).toEqual([900000, 1000000, 400000]);
  expect(fetching(() => new Response("no", { status: 401 }), () => Anthropic.list("key"))).rejects.toThrow("HTTP 401");
});
