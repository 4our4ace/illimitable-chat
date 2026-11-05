// Logins
// ======
// Every plan's /login page (LoginCommands.ts Page), by its provider's id:
// its folder's Login.ts, its sign-in and its accounts. An API key's
// provider has none here: /login's own page asks for its key (its facts'
// key, its code's check). A provider is added here, by its folder's page,
// beside Vendors.ts and Providers.ts.

import type { Page } from "../term/LoginCommands.ts";
import type { Term } from "../term/Term.ts";
import { PAGE as CHATGPT } from "./chatgpt/Login.ts";
import { PAGE as CLAUDE_CODE } from "./claude-code/Login.ts";

// the pages added as illi starts (Logins.add)
const ADDED: Record<string, (t: Term) => Page> = {};

export namespace Logins {

  // a plan's page, made for this terminal (none: the provider has none)
  export function of(vendor: string): ((t: Term) => Page) | undefined {
    const pages: Record<string, (t: Term) => Page> = { chatgpt: CHATGPT, "claude-code": CLAUDE_CODE, ...ADDED };
    return pages[vendor];
  }

  // a plan's page added as illi starts, its facts and code added too
  // (Vendors.add, Providers.add: a test's own provider)
  export function add(vendor: string, page: (t: Term) => Page): void {
    ADDED[vendor] = page;
  }

}
