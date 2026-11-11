// github-copilot: the models of a GitHub Copilot plan (Claude's, GPT's,
// Gemini's and others, as GitHub serves them), through GitHub's own
// Copilot CLI run as its SDK runs it (`copilot --headless --stdio`, the
// user's own install or the one /login downloads, unmodified: Copilot.ts,
// CopilotCli.ts), signed in with its own GitHub sign-in. Its accounts
// are folders of illi's own, in copilot/ of illi's root, each the CLI's
// home (COPILOT_HOME: its sign-in, its sessions' files), as each sign-in
// is a folder's.

import type { Model } from "../../ai/Pick.ts";
import type { Facts, Maker } from "../Provider.ts";

// GitHub's maker, as /login lists it
export const GITHUB: Maker = { name: "GitHub", offers: "by GitHub: your Copilot plan, through GitHub's Copilot CLI", order: 5 };

// Copilot's own pick of a model for each call (its Auto, on every plan,
// the Free one too): the one built in, till the account's own list
// replaces it (Copilot.learn: at the sign-in, as the chat moves to it),
// kept for the next start (catalog). Its window isn't known till a call
// tells it
const MODELS: Model[] = [
  { label: "auto", id: "auto", speeds: ["slow"] },
];

// the models offered by price, cheapest first (one with none told left
// out: Auto, whose price is the model it picks)
const PRICED = (models: Model[]) => models.filter((m) => m.price !== undefined).sort((a, b) => a.price! - b.price!);

// the first of these families the account offers, by its name with *
// for its version (claude-sonnet-*: its newest), else Auto, else the
// first model it offers
const FIRST = (models: Model[], families: string[]) => {
  const like = (family: string) => new RegExp("^" + family.replace("*", "\\d+(?:\\.\\d+)*") + "$");
  return families.find((f) => models.some((m) => like(f).test(m.label))) ?? (models.some((m) => m.label === "auto") ? "auto" : models[0]?.label ?? "auto");
};

export const FACTS = {
  id       : "github-copilot" as const,
  name     : "your GitHub Copilot plan",
  maker    : GITHUB,
  row      : "GitHub Copilot plan",
  models   : MODELS,
  defaults : {
    pick      : (models: Model[]) => "github-copilot:" + FIRST(models, ["claude-sonnet-*", "gpt-*"]) + ":medium:slow",
    compactor : (models: Model[]) => "github-copilot:" + (PRICED(models)[0]?.label ?? FIRST(models, ["claude-haiku-*"])) + ":low:slow",
  },
  ttl      : 300e3,
  accounts : "folders" as const,
  folders  : "copilot",
  catalog  : true,
  dated    : true,
} satisfies Facts;
