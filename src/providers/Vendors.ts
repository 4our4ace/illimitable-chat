// Vendors
// =======
// Every provider's facts (Provider.ts Facts), in the order illi lists
// their models: the one list of providers that Config.ts, Pick.ts,
// Accounts.ts and AskAI.ts read, as illi starts. A provider is added
// here, by its folder's Facts.ts, in Providers.ts, by its code, and, a
// plan, in Logins.ts, by its /login page; nothing else of illi names it.
// Its facts import nothing that reads the config, so this list loads
// before Config.ts does.

import { FACTS as ANTIGRAVITY } from "./antigravity/Facts.ts";
import { FACTS as CHATGPT } from "./chatgpt/Facts.ts";
import { FACTS as CLAUDE_API } from "./claude-api/Facts.ts";
import { FACTS as CLAUDE_CODE } from "./claude-code/Facts.ts";
import { FACTS as OPENAI_API } from "./openai-api/Facts.ts";
import { FACTS as OPENCODE_GO } from "./opencode-go/Facts.ts";
import type { Facts } from "./Provider.ts";

const ALL = [CLAUDE_API, OPENAI_API, CHATGPT, CLAUDE_CODE, ANTIGRAVITY, OPENCODE_GO] as const;

// a provider's id, as saved
export type Vendor = (typeof ALL)[number]["id"];

// each provider's shape of entry in accounts.json, by its id
export type Shapes = { [F in (typeof ALL)[number] as F["id"]]: F["accounts"] };

export const FACTS: Facts[] = [...ALL];

// the providers' ids, in order
export const VENDORS = FACTS.map((f) => f.id) as Vendor[];

export namespace Vendors {

  // a provider's facts (an id not known here, as a newer illi's saved in
  // a chat: none)
  export function of(vendor: string): Facts | undefined {
    return FACTS.find((f) => f.id === vendor);
  }

  // the one offered while nothing is connected
  export function fallback(): Facts {
    return FACTS.find((f) => f.fallback) ?? FACTS[0];
  }

  // the makers, in /login's order (Provider.ts Maker)
  export function makers(): string[] {
    return [...new Set([...FACTS].sort((a, b) => a.maker.order - b.maker.order).map((f) => f.maker.name))];
  }

  // what /login connects, in words: each plan by its own row's name, in
  // its maker's order, or an API key ("your ChatGPT, Claude or Google AI
  // plan, or an API key")
  export function ways(): string {
    const plans = [...new Set([...FACTS].filter((f) => f.key === undefined).sort((a, b) => a.maker.order - b.maker.order).map((f) => f.row.replace(/\s*plan$/i, "")))];
    const keys  = FACTS.some((f) => f.key !== undefined) ? ", or an API key" : "";
    return "your " + Vendors.list(plans, "or") + " plan" + keys;
  }

  // names in a sentence: "A", "A or B", "A, B or C"
  export function list(names: string[], and: string): string {
    return names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " " + and + " " + names.at(-1);
  }

  // a provider added to the list as illi starts, before Config.ts and
  // Pick.ts load (a test's own, which no list here names: its code to
  // Providers.add, its page to Logins.add)
  export function add(facts: Facts): void {
    FACTS.push(facts);
    VENDORS.push(facts.id as Vendor);
  }

  // the providers that run on an API key
  export function keyed(): Array<Facts & { key: NonNullable<Facts["key"]> }> {
    return FACTS.filter((f): f is Facts & { key: NonNullable<Facts["key"]> } => f.key !== undefined);
  }

}
