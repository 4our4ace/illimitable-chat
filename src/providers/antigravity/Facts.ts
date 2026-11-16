// antigravity: Gemini's models on a Google AI plan, through Google's own
// Antigravity CLI as editors run it (`agy acp`, run unmodified:
// Antigravity.ts), signed in with its own Google sign-in. Its accounts
// are folders of illi's own, in antigravity/ of illi's root, each the
// CLI's home (its sign-in, its sessions' files), as each sign-in is a
// folder's; the CLI itself, the user's own or as /login downloads it, is
// kept beside them (Agy.ts).

import type { Model } from "../../ai/Pick.ts";
import type { Facts, Maker } from "../Provider.ts";

// Gemini's maker, as /login lists it
export const GEMINI: Maker = { name: "Gemini", offers: "by Google: your Google AI plan, through Antigravity", order: 3 };

// the Gemini models a Google AI plan runs in Antigravity, each a family
// (Antigravity offers a model at each of its thinking levels: an effort
// here), as a Google AI Ultra account's agent listed them: an account's
// own list replaces these as its CLI tells it (Antigravity.learn: at the
// sign-in, each call), kept for the next start (catalog). Each one's
// window is the most the CLI takes (WINDOW) till a call on it is refused
// past its standard one (STANDARD)
const MODELS: Model[] = [
  { label: "gemini-4-argon",   id: "gemini-4-argon",   speeds: ["slow"], efforts: ["low", "medium", "high"] },
  { label: "gemini-3.8-flash", id: "gemini-3.8-flash", speeds: ["slow"], efforts: ["low", "medium", "high"] },
];

// the most a call on a model the CLI runs takes, in illi's tokens (4
// bytes each): the CLI fits a call in what Google's service lets it take
// of that model, in tokens of its own count (3 bytes a token), its own
// prompt and tools' with it, whatever the model's own 1M (as the CLI's
// records tell it). That's 512k (1.5 MB) on Gemini 4 Carbon, Argon and
// Hydrogen, 256k (768 KB) on 3.8 Flash, measured on a Google AI Ultra
// account (November 2026), the same on every CLI; the service never
// tells it, and changes it unannounced. So each model's window is this
// most, till a call on it is refused as too long (Antigravity cap): the
// standard window from then on (STANDARD: 256k of the CLI's count, what
// every model took), kept for a week (Pick held). What a step's usage tells (Antigravity.read:
// the model's own 1M) only ever lowers it (Pick.told)
const WINDOW   = 384000;
const STANDARD = 192000;

export const FACTS = {
  id       : "antigravity" as const,
  name     : "your Google AI plan",
  maker    : GEMINI,
  row      : "Google AI plan",
  models   : MODELS,
  window   : WINDOW,
  standard : STANDARD,
  defaults : { pick: "antigravity:gemini-*-flash:high:slow", compactor: "antigravity:gemini-*-flash:low:slow" },
  ttl      : 300e3,
  accounts : "folders" as const,
  folders  : "antigravity",
  catalog  : true,
  dated    : true,
} satisfies Facts;
