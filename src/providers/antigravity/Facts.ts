// antigravity: Gemini's models on a Google AI plan, through Google's own
// agent for editors (antigravity-acp, run unmodified: Antigravity.ts),
// signed in with its own Google sign-in. Its accounts are folders of
// illi's own, in antigravity/ of illi's root, each the agent's home (its
// sign-in, its sessions' files), as each sign-in is a folder's; the agent
// itself, as /login downloads it, is kept beside them (Agy.ts).

import type { Model } from "../../ai/Pick.ts";
import type { Facts, Maker } from "../Provider.ts";

// Gemini's maker, as /login lists it
export const GEMINI: Maker = { name: "Gemini", offers: "by Google: your Google AI plan, through Antigravity", order: 3 };

// the Gemini models a Google AI plan runs in Antigravity, each a family
// (Antigravity offers a model at each of its thinking levels: an effort
// here), as a Google AI Ultra account's agent listed them: an account's
// own list replaces these as its agent tells it (Antigravity.learn: at
// the sign-in, each call), kept for the next start (catalog). Each
// window as Antigravity states it (each call tells it again:
// Antigravity.read; none: not told yet)
const WINDOW = 1048576;
const MODELS: Model[] = [
  { label: "gemini-4-argon",   id: "gemini-4-argon",   speeds: ["slow"], efforts: ["low", "medium", "high"] },
  { label: "gemini-3.8-flash", id: "gemini-3.8-flash", speeds: ["slow"], window: WINDOW, efforts: ["low", "medium", "high"] },
];

export const FACTS = {
  id       : "antigravity" as const,
  name     : "your Google AI plan",
  maker    : GEMINI,
  row      : "Google AI plan",
  models   : MODELS,
  defaults : { pick: "antigravity:gemini-*-flash:high:slow", compactor: "antigravity:gemini-*-flash:low:slow" },
  ttl      : 300e3,
  accounts : "folders" as const,
  folders  : "antigravity",
  catalog  : true,
  dated    : true,
} satisfies Facts;
