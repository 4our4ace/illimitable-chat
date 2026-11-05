// Providers
// =========
// Every provider's code (Provider.ts Provider), by its id: the one list
// the rest of illi asks how a call runs and what an account tells
// (Agent.ts, Chat.ts, Tools.ts, Term.ts...). A provider is added here, by
// its folder's code, and in Vendors.ts, by its facts. The list is built
// on first use, not as this file loads: a provider's code imports what
// imports this file (Agent.ts), so its PROVIDER may not be made yet then.

import { PROVIDER as CHATGPT } from "./chatgpt/ChatGPT.ts";
import { PROVIDER as CLAUDE_API } from "./claude-api/Anthropic.ts";
import { PROVIDER as CLAUDE_CODE } from "./claude-code/ClaudeCode.ts";
import { PROVIDER as OPENAI_API } from "./openai-api/OpenAI.ts";
import type { Provider } from "./Provider.ts";
import { FACTS } from "./Vendors.ts";

let ALL: Provider[] | null = null;

export namespace Providers {

  // every provider, in the order of their facts (Vendors.ts)
  export function all(): Provider[] {
    if (ALL === null) {
      const made = [CLAUDE_API, OPENAI_API, CHATGPT, CLAUDE_CODE];
      ALL = FACTS.map((f) => made.find((p) => p.facts.id === f.id)).filter((p): p is Provider => p !== undefined);
    }
    return ALL;
  }

  // a provider by its id (none: not known here, as a newer illi's saved
  // in a chat)
  export function of(vendor: string | undefined): Provider | undefined {
    return Providers.all().find((p) => p.facts.id === vendor);
  }

}
