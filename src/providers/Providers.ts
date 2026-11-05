// Providers
// =========
// Every provider's code (Provider.ts Provider), by its id: the one list
// the rest of illi asks how a call runs and what an account tells
// (Agent.ts, Chat.ts, Tools.ts, Term.ts...). A provider is added here, by
// its folder's code, in Vendors.ts, by its facts, and, a plan, in
// Logins.ts, by its /login page. The list is built
// on first use, not as this file loads: a provider's code imports what
// imports this file (Agent.ts), so its PROVIDER may not be made yet then.

import { PROVIDER as ANTIGRAVITY } from "./antigravity/Antigravity.ts";
import { PROVIDER as CHATGPT } from "./chatgpt/ChatGPT.ts";
import { PROVIDER as CLAUDE_API } from "./claude-api/Anthropic.ts";
import { PROVIDER as CLAUDE_CODE } from "./claude-code/ClaudeCode.ts";
import { PROVIDER as OPENAI_API } from "./openai-api/OpenAI.ts";
import { PROVIDER as OPENCODE_GO } from "./opencode-go/OpenCodeGo.ts";
import type { Provider } from "./Provider.ts";
import { FACTS } from "./Vendors.ts";

let ALL: Provider[] | null = null;

// those added as illi starts (Providers.add)
const ADDED: Provider[] = [];

export namespace Providers {

  // every provider, in the order of their facts (Vendors.ts)
  export function all(): Provider[] {
    if (ALL === null) {
      const made = [CLAUDE_API, OPENAI_API, CHATGPT, CLAUDE_CODE, ANTIGRAVITY, OPENCODE_GO, ...ADDED];
      ALL = FACTS.map((f) => made.find((p) => p.facts.id === f.id)).filter((p): p is Provider => p !== undefined);
    }
    return ALL;
  }

  // a provider's code added as illi starts, its facts added to Vendors.ts
  // (Vendors.add: a test's own provider)
  export function add(provider: Provider): void {
    ADDED.push(provider);
    ALL = null;
  }

  // a provider by its id (none: not known here, as a newer illi's saved
  // in a chat)
  export function of(vendor: string | undefined): Provider | undefined {
    return Providers.all().find((p) => p.facts.id === vendor);
  }

}
