// Pick
// ====
// What a chat's calls run on, kept in its log: a vendor (claude-api,
// openai-api, chatgpt: OpenAI's models on a ChatGPT plan, claude-code:
// Claude's on a Claude plan, through Claude Code), a model of its, an
// effort and a speed; label
// vendor:model:effort:speed, shown to a person as model · effort (a
// speed past the standard one after them). A chat that saved none takes
// the config's (`def`). A move steps one part along the picks that differ in it
// (`options`), wrapping (up and down stop at the ends): next, prev and
// model every vendor's models, effort, speed (a model lacking one takes
// its fastest below), up and down the efforts, never the speed; given a
// value (`to`), to the pick whose part it is. A saved pick illi
// doesn't offer gives way to def, never to a pick like it.

import type { Vendor } from "./AskAI.ts";

// Types
// =====

// model: by its label
export type Pick = {
  vendor : Vendor;
  model  : string;
  effort : string;
  speed  : string;
};

// a key's change to the pick
export type Move = "next" | "prev" | "model" | "up" | "down" | "effort" | "speed";

// a model: as shown, as the vendor names it, its speeds; its context
// window, the whole of it as its vendor tells it (input and output share
// it); standard: the vendor's usual window when below that (ChatGPT's
// context_window, which Codex uses unless set higher); its efforts, as its
// vendor names them (none told: EFFORTS); the service tier each speed
// sends (none: OpenAI.body's own names); room: the share of its window a
// request may fill, as its vendor tells it (ChatGPT's
// effective_context_window_percent, else Codex's 95%; none: config.ROOM)
export type Model = { label: string; id: string; speeds: string[]; window?: number; standard?: number; efforts?: string[]; tiers?: Record<string, string>; room?: number };

// what a server offers: vendors, and models by label
export type Offer = { vendors: Vendor[]; models: string[] };

// Constants
// =========

export const VENDORS: Vendor[] = ["claude-api", "openai-api", "chatgpt", "claude-code"];

// each vendor's models as built in, each window as its vendor states it
// (ChatGPT's catalog tells them anew: learn; Anthropic's Models API and
// Claude Code's results, each window: told)
const OPUS  : Model = { label: "opus-5.5",   id: "claude-opus-5-5",   speeds: ["slow", "fast"], window: 1000000 };
const SONNET: Model = { label: "sonnet-5.5", id: "claude-sonnet-5-5", speeds: ["slow"],         window: 1000000 };
const HAIKU : Model = { label: "haiku-5.5",  id: "claude-haiku-5-5",  speeds: ["slow"],         window: 1000000 };
const OPENAI: Model[] = [
  { label: "gpt-6-luna",  id: "gpt-6-luna",  speeds: ["slow", "fast"],              window: 1050000 },
  { label: "gpt-6.1-sol", id: "gpt-6.1-sol", speeds: ["slow", "fast"],              window: 1050000 },
  { label: "gpt-6-astra", id: "gpt-6-astra", speeds: ["slow", "fast", "ultrafast"], window: 1050000 },
];

// the same on a ChatGPT plan (ChatGPT.ts), at one speed and no window
// till the account's catalog tells each one's speeds and windows (its
// max_context_window): a window is never guessed there
const CHATGPT: Model[] = OPENAI.map(({ label, id }) => ({ label, id, speeds: ["slow"] }));

// Claude's on a Claude plan, through Claude Code (ClaudeCode.ts), at its
// standard speed; each one's window 200k till Claude Code tells it, as
// soon as the plan is connected (ClaudeCode.models: 1M where the plan
// has long context)
const FABLE : Model = { label: "fable-5.1", id: "claude-fable-5-1", speeds: ["slow"] };
const CLAUDE: Model[] = [FABLE, OPUS, SONNET, HAIKU].map((m) => ({ ...m, speeds: ["slow"], window: 200000 }));

// each vendor's models, at the speeds it runs them
const MODELS: Record<Vendor, Model[]> = {
  "claude-api" : [OPUS, SONNET, HAIKU],
  "openai-api" : OPENAI,
  "chatgpt"    : CHATGPT,
  "claude-code": CLAUDE,
};

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export const SPEEDS = ["slow", "fast", "ultrafast"];

export const LABELS = [...new Set(Object.values(MODELS).flat().map((m) => m.label))];

// each vendor as a note names it to the person (its id is the settings')
const PROVIDERS: Record<Vendor, string> = {
  "claude-api" : "the Anthropic API",
  "openai-api" : "the OpenAI API",
  "chatgpt"    : "your ChatGPT plan",
  "claude-code": "your Claude plan",
};

// Pick
// ====

export namespace Pick {

  export function model(vendor: Vendor, label: string): Model | undefined {
    return MODELS[vendor].find((m) => m.label === label);
  }

  // a vendor's models as it tells them: a known one takes what it's told
  // (its window, standard window, speeds, efforts, tiers), a new one is
  // added; `replace`: they are the vendor's list now (a catalog: one it
  // drops is gone). The labels new to LABELS
  export function learn(vendor: Vendor, models: Model[], how: "add" | "replace" = "add"): string[] {
    const fresh: string[] = [];
    const list = MODELS[vendor];
    if (how === "replace" && models.length > 0) {
      list.splice(0, list.length, ...models.map((m) => ({ ...m })));
    }
    for (const m of models) {
      const known = Pick.model(vendor, m.label);
      if (known === undefined) {
        list.push({ ...m });
      } else if (how !== "replace") {
        Object.assign(known, Object.fromEntries(Object.entries(m).filter(([key, v]) => v !== undefined && key !== "label" && key !== "id")));
      }
      if (!LABELS.includes(m.label)) {
        LABELS.push(m.label);
        fresh.push(m.label);
      }
    }
    return fresh;
  }

  // a vendor's models as known now (each a copy), to keep
  export function list(vendor: Vendor): Model[] {
    return MODELS[vendor].map((m) => ({ ...m }));
  }

  // the tokens a pick's model takes in (none: not known)
  export function window(pick: Pick): number | undefined {
    return Pick.model(pick.vendor, pick.model)?.window;
  }

  // the share of its window a pick's model's request may fill, as its
  // vendor tells it (none: not told)
  export function room(pick: Pick): number | undefined {
    return Pick.model(pick.vendor, pick.model)?.room;
  }

  // a vendor's model by the id it runs as
  export function by_id(vendor: Vendor, id: string): Model | undefined {
    return MODELS[vendor].find((m) => m.id === id);
  }

  // a vendor's model, by the id it runs as, takes `window` tokens in, as
  // its vendor told (a model not known: none); true: that's news
  export function told(vendor: Vendor, id: string, window: number): boolean {
    const model = Pick.by_id(vendor, id);
    if (model === undefined || !(window > 0) || model.window === window) {
      return false;
    }
    model.window = window;
    return true;
  }

  export function on(pick: Pick, vendor: Vendor, model: Model): Pick {
    const below = SPEEDS.slice(0, SPEEDS.indexOf(pick.speed) + 1);
    const speed = below.filter((s) => model.speeds.includes(s)).pop() ?? "slow";
    return { ...pick, vendor, model: model.label, speed };
  }

  // the models offered (by label) of these vendors, each with its vendor
  export function models(vendors: Vendor[], labels: string[]): Array<[Vendor, Model]> {
    return vendors.flatMap((v) => MODELS[v].filter((m) => labels.includes(m.label)).map((m): [Vendor, Model] => [v, m]));
  }

  // each with the part the move steps
  export function options(pick: Pick, move: Move, { vendors, models }: Offer): Array<[string, Pick]> {
    const speeds = Pick.model(pick.vendor, pick.model)?.speeds ?? [];
    const all = (vs: Vendor[]) => Pick.models(vs, models).map(([v, m]): [string, Pick] => [m.label, Pick.on(pick, v, m)]);
    switch (move) {
      case "next":
      case "prev":
      case "model": {
        return all(vendors);
      }
      case "up":
      case "down":
      case "effort": {
        return Pick.efforts(pick).map((effort) => [effort, { ...pick, effort }]);
      }
      case "speed": {
        return speeds.map((speed) => [speed, { ...pick, speed }]);
      }
    }
  }

  // a pick a step on (the next model or the one before, round; more
  // effort or less, stopping at the ends; the next speed), or to the part
  // `to` names (one it alone holds will do), stepped from where it runs
  // (fit: an effort the model lacks steps from the nearest it has, never
  // from the list's start); null: none such
  export function move(pick: Pick, move: Move, offer: Offer, to?: string): Pick | null {
    const list = Pick.options(pick, move, offer);
    const n    = list.length;
    const runs = Pick.label(Pick.fit(pick));
    const at   = list.findIndex(([, p]) => Pick.label(Pick.fit(p)) === runs);
    const d    = move === "prev" || move === "down" ? -1 : 1;
    const ends = move === "up" || move === "down";
    const next = ends ? Math.max(0, Math.min(n - 1, at + d)) : (at + d + n) % n;
    const like = list.filter(([part]) => part.toLowerCase().includes(String(to).toLowerCase()));
    const hit  = to === undefined ? list[next] : list.find(([part]) => part === to) ?? (like.length === 1 ? like[0] : undefined);
    return hit === undefined ? null : hit[1];
  }

  export function label(pick: Pick): string {
    return [pick.vendor, pick.model, pick.effort, pick.speed].join(":");
  }

  // a vendor as a note names it ("the Anthropic API"; up: starting a
  // sentence)
  export function provider(vendor: Vendor, up = false): string {
    const name = PROVIDERS[vendor];
    return up ? name[0].toUpperCase() + name.slice(1) : name;
  }

  // as a person reads it, as it runs (fit): model · effort, the speed
  // only if not the standard one (gpt-6.1-sol · medium · fast)
  export function shown(pick: Pick): string {
    const p = Pick.fit(pick);
    return [p.model, p.effort, ...(p.speed === "slow" ? [] : [p.speed])].join(" · ");
  }

  // the efforts a pick's model takes, as its vendor names them (none
  // told: EFFORTS)
  export function efforts(pick: Pick): string[] {
    return Pick.model(pick.vendor, pick.model)?.efforts ?? EFFORTS;
  }

  // a pick as its model runs it: an effort or speed it lacks stepped to
  // the nearest it has (an effort by its place in EFFORTS, the lower on
  // a tie; a speed to the fastest below, else the standard one). Never
  // kept: the pick asked stays, and runs as asked once the model has it
  // again (a catalog may drop and bring back a speed)
  export function fit(pick: Pick): Pick {
    const model = Pick.model(pick.vendor, pick.model);
    if (model === undefined) {
      return pick;
    }
    const has    = Pick.efforts(pick);
    const rank   = (e: string) => (EFFORTS.includes(e) ? EFFORTS.indexOf(e) : EFFORTS.length);
    const effort = has.includes(pick.effort) ? pick.effort : [...has].sort((a, b) => Math.abs(rank(a) - rank(pick.effort)) - Math.abs(rank(b) - rank(pick.effort)) || rank(a) - rank(b))[0] ?? pick.effort;
    const below  = SPEEDS.slice(0, SPEEDS.indexOf(pick.speed) + 1);
    const speed  = model.speeds.includes(pick.speed) ? pick.speed : below.filter((sp) => model.speeds.includes(sp)).pop() ?? model.speeds[0] ?? "slow";
    return { ...pick, effort, speed };
  }

  // a speed as a person reads it: slow is the standard one
  export function speed(speed: string): string {
    return speed === "slow" ? "standard" : speed;
  }

  // as a call takes it: as its model runs it (fit), the model by its id
  export function ask(pick: Pick): Pick {
    const fitted = Pick.fit(pick);
    const model  = Pick.model(pick.vendor, pick.model);
    return { ...fitted, model: model?.id ?? pick.model };
  }

  // as the chat runs it; null: none. Its model must be offered, its
  // effort and speed words illi knows (an effort its model names too);
  // one the model lacks is kept as asked (fit runs it as it can), so a
  // saved pick never gives way for a speed a catalog dropped
  export function read(x: any, offer: Offer): Pick | null {
    const model = offer.vendors.includes(x?.vendor) && offer.models.includes(x?.model) ? Pick.model(x.vendor, x.model) : undefined;
    if (model === undefined || !(EFFORTS.includes(x.effort) || (model.efforts ?? []).includes(x.effort)) || !SPEEDS.includes(x.speed)) {
      return null;
    }
    return { vendor: x.vendor, model: x.model, effort: x.effort, speed: x.speed };
  }

  // the pick saved (the chat's log keeps it: Memory.ts) if offered, else
  // def (Config checks it is offered)
  export function load(saved: object | null, offer: Offer, def: Pick): Pick {
    return Pick.read(saved ?? def, offer) ?? def;
  }

}
