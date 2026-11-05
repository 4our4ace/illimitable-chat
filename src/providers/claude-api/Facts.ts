// claude-api: Claude's models on the Anthropic API, paid by an API key
// (Anthropic.ts). Its models as built in, each window as Anthropic states
// it, till its Models API tells the key's own (Anthropic.models: the
// newest of each line, kept for the next start: catalog); Claude Code's
// (claude-code) are these too till it lists its own.

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
  defaults : { pick: "claude-api:sonnet-*:medium:slow", compactor: "claude-api:haiku-*:medium:slow" },
  ttl      : 300e3,
  accounts : "keys" as const,
  catalog  : true,
  key      : { name: "anthropic", env: "ANTHROPIC_API_KEY", maker: "Anthropic", where: "console.anthropic.com", credit: "your Anthropic API credit is used up: add credit at console.anthropic.com, then send a message" },
} satisfies Facts;
