// Vendors
// =======
// Every provider's facts (Provider.ts Facts), in the order illi lists
// their models: the one list of providers that Config.ts, Pick.ts,
// Accounts.ts and AskAI.ts read, as illi starts. A provider is added
// here, by its folder's Facts.ts, and in Providers.ts, by its code;
// nothing else of illi names it. Its facts import nothing that reads the
// config, so this list loads before Config.ts does.

import { FACTS as CHATGPT } from "./chatgpt/Facts.ts";
import { FACTS as CLAUDE_API } from "./claude-api/Facts.ts";
import { FACTS as CLAUDE_CODE } from "./claude-code/Facts.ts";
import { FACTS as OPENAI_API } from "./openai-api/Facts.ts";
import type { Facts } from "./Provider.ts";

const ALL = [CLAUDE_API, OPENAI_API, CHATGPT, CLAUDE_CODE] as const;

// a provider's id, as saved
export type Vendor = (typeof ALL)[number]["id"];

// each provider's shape of entry in accounts.json, by its id
export type Shapes = { [F in (typeof ALL)[number] as F["id"]]: F["accounts"] };

export const FACTS: readonly Facts[] = ALL;

// the providers' ids, in order
export const VENDORS = ALL.map((f) => f.id) as Vendor[];

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

  // what /login connects, in words: a plan of each maker that has one,
  // or an API key ("your ChatGPT or Claude plan, or an API key")
  export function ways(): string {
    const plans = [...new Set([...FACTS].filter((f) => f.key === undefined).sort((a, b) => a.maker.order - b.maker.order).map((f) => f.maker.name))];
    const keys  = FACTS.some((f) => f.key !== undefined) ? ", or an API key" : "";
    return "your " + Vendors.list(plans, "or") + " plan" + keys;
  }

  // names in a sentence: "A", "A or B", "A, B or C"
  export function list(names: string[], and: string): string {
    return names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " " + and + " " + names.at(-1);
  }

  // the providers that run on an API key
  export function keyed(): Array<Facts & { key: NonNullable<Facts["key"]> }> {
    return FACTS.filter((f): f is Facts & { key: NonNullable<Facts["key"]> } => f.key !== undefined);
  }

}
