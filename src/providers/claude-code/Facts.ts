// claude-code: Claude's models on a Claude plan, through the user's
// Claude Code (ClaudeCode.ts). Its accounts are Claude Code folders: the
// user's own Claude Code's, or one of illi's own in claude/ of illi's
// root, as each Claude Code login is a folder's.

import type { Model } from "../../ai/Pick.ts";
import { CLAUDE, HAIKU, OPUS, SONNET } from "../claude-api/Facts.ts";
import type { Facts } from "../Provider.ts";

// Claude's models at their standard speed, each one's window 200k till
// Claude Code tells it, as soon as the plan is connected
// (ClaudeCode.models: 1M where the plan has long context)
const FABLE : Model = { label: "fable-5.1", id: "claude-fable-5-1", speeds: ["slow"] };

export const FACTS = {
  id       : "claude-code" as const,
  name     : "your Claude plan",
  maker    : CLAUDE,
  row      : "Claude plan",
  models   : [FABLE, OPUS, SONNET, HAIKU].map((m) => ({ ...m, speeds: ["slow"], window: 200000 })),
  defaults : { pick: "claude-code:opus-5.5:medium:slow", compactor: "claude-code:haiku-5.5:medium:slow" },
  ttl      : 300e3,
  accounts : "folders" as const,
  folders  : "claude",
  dated    : true,
} satisfies Facts;
