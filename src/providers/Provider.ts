// Provider
// ========
// What a provider is to the rest of illi. Each provider has a folder in
// src/providers (its id's: claude-api, chatgpt...), and the rest of illi
// never names one: it asks the lists in this folder. A provider's parts:
//
// - its facts (Facts.ts in its folder): what illi knows of it before any
//   of its code runs. Config.ts reads them as illi starts (the vendors
//   offered, the default picks, the API keys' variables), so a facts file
//   imports nothing of illi's that reads the config: Vendors.ts lists
//   them all.
// - its code (Provider below): how a call runs on it, and what illi asks
//   of it as it runs (its account, plan and models). Providers.ts lists
//   them all.
// - its /login page, unless it runs on an API key (those share one).
//
// Types only: every file may import it.

import type { Wire } from "../ai/Agent.ts";
import type { Ask, Event, Try } from "../ai/AskAI.ts";
import type { Model } from "../ai/Pick.ts";
import type { Plan } from "../ui/View.ts";

// Types
// =====

// a maker, as /login's first picker lists it (its providers under it):
// its name, what its row says while none of its providers is connected,
// and its place in the list
export type Maker = { name: string; offers: string; order: number };

// a provider that runs on an API key: the key's name (config.KEYS), the
// variable the environment sets it in, the maker as a refused key names
// it, where a key is made, what to do when its credit is used up
export type ApiKey = { name: string; env: string; maker: string; where: string; credit: string };

// what a provider's facts may read as illi starts (Config.ts gives it,
// to setup): illi's root (every profile's), the accounts' file as last
// read (null: it won't read, and never has), a setting's value as set
// now, the file a path setting names (from the folder of the config.json
// that sets it), a path with ~ taken as the home folder
export type Context = {
  root    : string;
  store   : () => Record<string, unknown> | null;
  setting : (key: string) => string;
  place   : (key: string) => string;
  path    : (file: string) => string;
};

// a provider's facts:
// - id: as saved (a pick's vendor:model:effort:speed, models.json,
//   accounts.json), never changed once out;
// - name: as a note names it ("the Anthropic API", "your ChatGPT plan");
// - maker, row: under whom /login lists it, and its row's name there
//   ("ChatGPT plan", "Anthropic API key");
// - models: as built in (each window as the vendor states it; none: not
//   known till it tells);
// - defaults: illi's own pick on it (the first offered vendor's is
//   illi's default, while `chats` names none for it) and the
//   compactor's, while `compactor` names none: each names its model by
//   family, * for its version (opus-*: the newest of it offered,
//   Pick.newest), never by a version, or is a rule over the models it
//   offers (Rule: the cheapest, say), so it holds as the vendor's models
//   change;
// - ttl: how long it keeps a cached prefix unused (ms);
// - accounts: the shape of its entry in accounts.json (Accounts.ts):
//   keys (an API's), folders (a plan's, each account a folder: `folders`
//   names theirs in illi's root), logins (a plan's kept apart, its login
//   in a file of its own: `outside`);
// - key: it runs on an API key;
// - catalog: models.json keeps its whole list (its account's catalog),
//   not only the windows of the models built in;
// - fallback: offered while nothing is connected, so a chat has a pick
//   and /login says how to connect one;
// - dated: its calls tell the model today's date themselves, so illi's
//   own line of where it works gives the time alone (When.now);
// - setup: run once as illi starts, before the vendors offered are
//   reckoned (a login file's place);
// - outside: connected by a login kept outside accounts.json (listed
//   first among those connected)
// a default pick: its vendor:model:effort:speed text, the model named by
// family (opus-*), or a rule giving that text from the models the vendor
// offers now (each as Pick.ts has it, its price among what it tells)
export type Rule = string | ((models: Model[]) => string);

export type Facts = {
  id        : string;
  name      : string;
  maker     : Maker;
  row       : string;
  models    : Model[];
  defaults  : { pick: Rule; compactor: Rule };
  ttl       : number;
  accounts  : "keys" | "folders" | "logins";
  folders?  : string;
  key?      : ApiKey;
  catalog?  : boolean;
  fallback? : boolean;
  dated?    : boolean;
  setup?    : (ctx: Context) => void;
  outside?  : () => boolean;
};

// an MCP server a provider's own program loads in a call (Claude Code's,
// as its init tells: illi's own left out): its name as the program lists
// it, how it is (connected, failed, needs-auth, pending, disabled), its
// tools as the program names them (null: none told yet, each call having
// cut it); as the views show it, whether `off` names it and whether
// illi's own server of its name is used in its place (over)
export type Theirs = { name: string; status: string; tools: string[] | null; off: boolean; over: boolean };

// the MCP servers a provider's own program loads in its calls (Claude
// Code's), which /mcp, /settings and the side show while the chat's pick
// is on it: whose they are ("Claude Code"), the servers as its last call
// told them (null: none told yet), a server's tools by their own names,
// and the command that logs in to one waiting on a login
export type Servers = {
  by    : string;
  list  : () => Theirs[] | null;
  short : (server: Theirs) => string[];
  login : (name: string) => string;
};

// what the start says of a provider's login (Provider hint): its words,
// and whether they tell of a fault (a login file that won't read), which
// is said even while nothing is connected
export type Hint = { text: string; trouble: boolean };

// a provider's code:
// - facts: its facts (Facts.ts);
// - wire: a call runs in illi's loop on it (Agent.loop: illi sends each
//   request and runs the tools), or
// - ask: its own program runs the call (a runner: Claude Code, Google's
//   Antigravity agent), giving back the same Events and End as Agent.ask;
// - spent: a refusal that means the plan behind it is used up (said: the
//   error's words), what to do about it ("": not one);
// - ready: before a call, its model's window told (on chatgpt, the
//   account's catalog asked); null: ready, else why not;
// - windows: whether the windows known are the account's own this run
//   (none: always); while not, the chat's cut waits for them, as one
//   fitted to smaller windows kept last would fold the chat for good;
// - account: what the account in use tells, asked (at the start, after
//   /login, as the accounts change in another terminal): true once
//   something changed (its models: a catalog's list, their windows).
//   /login waits on it (LoginCommands.ts READING: 15 s at most) to ask
//   a vendor connected anew which of its models to run on, so it should
//   settle once the list is known;
// - watch: tells f each time its account, plan or catalog changed;
// - plan: its plan's limits and use, as the side shows them (null: none
//   told);
// - refused: a model this account refused as too long past its standard
//   window, learned (its window is the standard one from now on); true:
//   learned;
// - servers: the MCP servers its own program loads (Servers);
// - hint: what the start says of its login (null: nothing);
// - check: an API key checked with it, asking what costs nothing (""
//   good, else why not, never the fetch error's own words);
// - close: what it runs in the background stopped, as illi ends
export type Provider = {
  facts     : Facts;
  wire?     : Wire<any>;
  ask?      : (ask: Ask, on: (ev: Event) => void) => Try;
  spent?    : (said: string, err: any) => string;
  ready?    : (model: string, halt?: AbortSignal) => Promise<string | null>;
  windows?  : () => boolean;
  account?  : () => Promise<boolean> | void;
  watch?    : (f: () => void) => void;
  plan?     : () => Plan | null;
  refused?  : (label: string) => boolean;
  servers?  : Servers;
  hint?     : () => Hint | null;
  check?    : (key: string) => Promise<string>;
  close?    : () => void;
};
