// opencode-go: the models of an OpenCode Go plan (OpenCode's monthly
// plan of open models), on OpenCode's API, paid by the plan behind an
// API key (OpenCodeGo.ts). A few built in, each window, efforts and
// price as OpenCode lists them, till its catalog tells the plan's
// (OpenCodeGo.models: kept for the next start: catalog). Its models come
// and go often, so neither default names one: chats run on the middle
// one by price, the summaries on the cheapest, of those every workspace
// may run (OPEN).

import type { Model } from "../../ai/Pick.ts";
import type { Facts, Maker } from "../Provider.ts";

export const MODELS: Model[] = [
  { label: "kimi-k3",             id: "kimi-k3",             speeds: ["slow"], window: 1048576, efforts: ["max"],                price: 3 },
  { label: "glm-5.3",             id: "glm-5.3",             speeds: ["slow"], window: 1000000, efforts: ["low", "high", "max"], price: 1.4 },
  { label: "deepseek-v4-pro",     id: "deepseek-v4-pro",     speeds: ["slow"], window: 1000000, efforts: ["high", "max"],        price: 0.66 },
  { label: "deepseek-v4.1-flash", id: "deepseek-v4.1-flash", speeds: ["slow"], window: 1000000, efforts: ["low", "high", "max"], price: 0.15 },
  { label: "minimax-m3.1-flash",  id: "minimax-m3.1-flash",  speeds: ["slow"], window: 1000000, efforts: ["low", "medium", "high", "xhigh", "max"], price: 0.15 },
];

// OpenCode's provider in /login: its Go plan, by a key
export const OPENCODE: Maker = { name: "OpenCode", offers: "by OpenCode: your OpenCode Go plan, by an API key", order: 4 };

// the models a workspace runs only once its owner allows them, so never
// a default: DeepSeek's, whose region (Global) OpenCode leaves out till
// it's chosen at opencode.ai (Settings, Privacy, Regions)
const OPT_IN = /^deepseek-/;

// the models every workspace may run by price, cheapest first (a tie:
// the bigger window, then as listed); one with none told left out
const PRICED = (models: Model[]) => models.filter((m) => m.price !== undefined && !OPT_IN.test(m.label)).map((m, k) => ({ m, k })).sort((a, b) => a.m.price! - b.m.price! || (b.m.window ?? 0) - (a.m.window ?? 0) || a.k - b.k).map(({ m }) => m);

export const FACTS = {
  id       : "opencode-go" as const,
  name     : "your OpenCode Go plan",
  maker    : OPENCODE,
  row      : "OpenCode Go API key",
  models   : MODELS,
  defaults : {
    pick      : (models: Model[]) => "opencode-go:" + (PRICED(models)[Math.floor((PRICED(models).length - 1) / 2)]?.label ?? "glm-*") + ":medium:slow",
    compactor : (models: Model[]) => "opencode-go:" + (PRICED(models)[0]?.label ?? "minimax-m*-flash") + ":low:slow",
  },
  ttl      : 300e3,
  accounts : "keys" as const,
  catalog  : true,
  key      : { name: "opencode", env: "OPENCODE_API_KEY", maker: "OpenCode", where: "opencode.ai", credit: "your OpenCode credit is used up: add some at opencode.ai, then send a message" },
} satisfies Facts;
