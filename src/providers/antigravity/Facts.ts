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
// window is the CLI's (WINDOW)
const MODELS: Model[] = [
  { label: "gemini-4-argon",   id: "gemini-4-argon",   speeds: ["slow"], efforts: ["low", "medium", "high"] },
  { label: "gemini-3.8-flash", id: "gemini-3.8-flash", speeds: ["slow"], efforts: ["low", "medium", "high"] },
];

// the window of every model the CLI runs, in illi's tokens (4 bytes
// each): the CLI fits a call in 256k tokens of its own count (3 bytes a
// token: 768 KB), its own prompt and tools' with it, whatever the model's
// own 1M (Gemini 4 Carbon's, Argon's, 3.8 Flash's, as the CLI's records
// tell them), so no more of a chat reaches the model; what a step's usage
// tells (Antigravity.read) holds only below it (Pick.told)
const WINDOW = 192000;

export const FACTS = {
  id       : "antigravity" as const,
  name     : "your Google AI plan",
  maker    : GEMINI,
  row      : "Google AI plan",
  models   : MODELS,
  window   : WINDOW,
  defaults : { pick: "antigravity:gemini-*-flash:high:slow", compactor: "antigravity:gemini-*-flash:low:slow" },
  ttl      : 300e3,
  accounts : "folders" as const,
  folders  : "antigravity",
  catalog  : true,
  dated    : true,
} satisfies Facts;
