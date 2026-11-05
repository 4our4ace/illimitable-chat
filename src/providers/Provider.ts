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
//
// Types only: every file may import it.

import type { Model } from "../ai/Pick.ts";

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
//   illi's default) and the compactor's, while `compactor` names none;
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
export type Facts = {
  id        : string;
  name      : string;
  maker     : Maker;
  row       : string;
  models    : Model[];
  defaults  : { pick: string; compactor: string };
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
