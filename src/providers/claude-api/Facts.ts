// claude-api: Claude's models on the Anthropic API, paid by an API key
// (Anthropic.ts). Its models as built in, each window as Anthropic states
// it (its Models API tells them anew: Anthropic.models); Claude Code's
// (claude-code) are these too.

import type { Model } from "../../ai/Pick.ts";
import type { Facts, Maker } from "../Provider.ts";

export const OPUS  : Model = { label: "opus-5.5",   id: "claude-opus-5-5",   speeds: ["slow", "fast"], window: 1000000 };
export const SONNET: Model = { label: "sonnet-5.5", id: "claude-sonnet-5-5", speeds: ["slow"],         window: 1000000 };
export const HAIKU : Model = { label: "haiku-5.5",  id: "claude-haiku-5-5",  speeds: ["slow"],         window: 1000000 };

// Claude's providers in /login: its plan (claude-code), then its API
export const CLAUDE: Maker = { name: "Claude", offers: "by Anthropic: your Claude plan or an API key", order: 2 };

export const FACTS = {
  id       : "claude-api" as const,
  name     : "the Anthropic API",
  maker    : CLAUDE,
  row      : "Anthropic API key",
  models   : [OPUS, SONNET, HAIKU],
  defaults : { pick: "claude-api:sonnet-5.5:medium:slow", compactor: "claude-api:haiku-5.5:medium:slow" },
  ttl      : 300e3,
  accounts : "keys" as const,
  key      : { name: "anthropic", env: "ANTHROPIC_API_KEY", maker: "Anthropic", where: "console.anthropic.com", credit: "your Anthropic API credit is used up: add credit at console.anthropic.com, then send a message" },
} satisfies Facts;
