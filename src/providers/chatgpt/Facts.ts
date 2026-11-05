// chatgpt: OpenAI's models on a ChatGPT plan (ChatGPT.ts: OpenAI's wire
// on the Codex backend). Connected while a ChatGPT login is there to run
// on: the file the `login` setting names, else illi's own (/login makes
// it; the root's, so every profile's) or, while there is none, opencode's
// (`opencode auth login`) unless /login left it to opencode
// (accounts.json's chatgpt.opencode false). The accounts kept apart from
// the one in use are accounts.json's (Accounts.ts logins).

import * as fs from "node:fs";
import type { Model } from "../../ai/Pick.ts";
import { json_object } from "../../tools/Clip.ts";
import { CHATGPT, OPENAI } from "../openai-api/Facts.ts";
import type { Context, Facts } from "../Provider.ts";

// OpenAI's models on a ChatGPT plan, at one speed and no window till the
// account's catalog tells each one's speeds and windows (its
// max_context_window): a window is never guessed there
const MODELS: Model[] = OPENAI.map(({ label, id }) => ({ label, id, speeds: ["slow"] }));

// the settings and accounts as Config gave them (setup), and whether the
// login file read last, by its path (signed: one that won't read for a
// moment, as a program writes it in place, keeps what the last read said)
let ctx: Context | null = null;
let SIGNED = { file: "", on: false };

// The login file
// ==============

export namespace LoginFile {

  // the file the `login` setting names (null: none), illi's own, and
  // opencode's, as illi started
  export let set: string | null = null;
  export let own = "";
  export let opencode = "";

  // where they are, as illi starts (FACTS.setup)
  export function setup(c: Context): void {
    ctx      = c;
    set      = c.setting("login") === "" ? null : c.place("login");
    own      = c.root + "/login.json";
    opencode = c.path((process.env.XDG_DATA_HOME ?? "~/.local/share") + "/opencode/auth.json");
  }

  // the login file chatgpt runs on: the file `login` names, else illi's
  // own if it's there, else opencode's if it's there and /login didn't
  // leave it to opencode, else illi's own (none yet)
  export function file(): string {
    const kept  = ctx?.store()?.chatgpt as { opencode?: unknown } | undefined;
    const other = kept?.opencode !== false && fs.existsSync(opencode);
    return set ?? (fs.existsSync(own) || !other ? own : opencode);
  }

  // whether a login is there to run on (file): a file there that won't
  // read, as the last read of it said
  export function signed(): boolean {
    const at   = LoginFile.file();
    const data = json_object(at);
    if (data === null && SIGNED.file === at && fs.existsSync(at)) {
      return SIGNED.on;
    }
    const entry = data?.openai;
    SIGNED = { file: at, on: entry?.type === "oauth" && Boolean(entry.access) && Boolean(entry.refresh) };
    return SIGNED.on;
  }

}

export const FACTS = {
  id       : "chatgpt" as const,
  name     : "your ChatGPT plan",
  maker    : CHATGPT,
  row      : "ChatGPT plan",
  models   : MODELS,
  defaults : { pick: "chatgpt:gpt-6.1-sol:medium:slow", compactor: "chatgpt:gpt-6-luna:medium:slow" },
  ttl      : 300e3,
  accounts : "logins" as const,
  catalog  : true,
  fallback : true,
  setup    : LoginFile.setup,
  outside  : LoginFile.signed,
} satisfies Facts;
