// openai-api: OpenAI's models on its API, paid by an API key (OpenAI.ts).
// Its models as built in, each window as OpenAI states it; a ChatGPT
// plan's (chatgpt) are these too.

import type { Model } from "../../ai/Pick.ts";
import type { Facts, Maker } from "../Provider.ts";

export const OPENAI: Model[] = [
  { label: "gpt-6-luna",  id: "gpt-6-luna",  speeds: ["slow", "fast"],              window: 1050000 },
  { label: "gpt-6.1-sol", id: "gpt-6.1-sol", speeds: ["slow", "fast"],              window: 1050000 },
  { label: "gpt-6-astra", id: "gpt-6-astra", speeds: ["slow", "fast", "ultrafast"], window: 1050000 },
];

// OpenAI's providers in /login: its ChatGPT plan (chatgpt), then its API
export const CHATGPT: Maker = { name: "ChatGPT", offers: "by OpenAI: your ChatGPT plan or an API key", order: 1 };

export const FACTS = {
  id       : "openai-api" as const,
  name     : "the OpenAI API",
  maker    : CHATGPT,
  row      : "OpenAI API key",
  models   : OPENAI,
  defaults : { pick: "openai-api:gpt-6.1-sol:medium:slow", compactor: "openai-api:gpt-6-luna:medium:slow" },
  ttl      : 1800e3,
  accounts : "keys" as const,
  key      : { name: "openai", env: "OPENAI_API_KEY", maker: "OpenAI", where: "platform.openai.com", credit: "your OpenAI API quota is used up: add credit at platform.openai.com, then send a message" },
} satisfies Facts;
