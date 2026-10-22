// Suggest
// =======
// The user's likely next message, asked as a turn of the chat (Chat.ts)
// ends answered, on the cache: after the turn's last request and its
// answer, on what it ran on. Shown in the empty input till it is sent or
// a turn ends answered; a message of the user's own leaves it, to send
// too; a restart between keeps it (the chat's state saves it). Several
// in a row unused stop them till illi starts again.

import { AskAI, type Call } from "../ai/AskAI.ts";
import { Chat, type Chat as Running } from "./Chat.ts";
import { Tools } from "../tools/Tools.ts";

// Types
// =====

// a suggested reply (Suggest.ask): whether one is asked (a screen shows
// it: Term.ts, config.SUGGEST), whether the turn's last call was answered
// (one is asked as the turn ends), the one shown ("": none; kept in the
// memory's state, mem.suggest, so a start shows it again), its call
// running, whether a message of the user's own went while it showed
// (passed over: it counts unused once the turn is answered; an agent's
// report or a resumed turn passes over none), how many in a row went
// unused
export type Suggested = { on: boolean; due: boolean; text: string; call: Call | null; passed: boolean; unused: number };

// Constants
// =========

// a suggested reply (Suggest.ask): what the model is asked after the
// turn's last request and its answer, none its answer unless the next
// step is plain; the most tokens it writes, its thinking's too (a line is
// some 20; gpt-6-luna at high effort thought 30 to 120 more); how many in
// a row going unused stop them till illi starts again; twice the words
// it's asked for, past which one is none; answers that are none (one that
// says so, thanks or praise, illi's own voice)
const SUGGEST     = [
  "Suggest the user's next message to illi: what they'd type next, not what illi thinks they should do. They should think: I was about to type that.",
  "2 to 12 words, in their own voice and style, and specific: \"run the tests\", not \"continue\". illi offered choices: the one they'd pick. illi asked to go on: \"yes\". The work is done and the next step plain: that step, like \"commit it\".",
  "Never thanks or praise, a question, illi's voice (\"Let me\", \"I'll\"), an idea they didn't ask for, or more than one sentence.",
  "After an error or a misunderstanding, or when the next step isn't plain from what they said, answer with nothing: none beats a wrong guess. Output only the message, or nothing.",
].join("\n");
const SUGGEST_MAX = 256;
const UNUSED      = 5;
const WORDS       = 24;
const NONE        = /^\W*(nothing|none|no suggestion|silence|n\/a|thanks|thank you|looks good|lgtm|great|perfect|nice|awesome)\W*$|^(let me|i'll|i will|i've|here's|here is)\b/i;

// Suggest
// =======

export namespace Suggest {

  // the user's likely next message, asked as a turn ends answered (not
  // from a pipe, nor once UNUSED in a row went unused): after the turn's
  // last request and its answer (AskAI.last), SUGGEST, on what it ran on,
  // with its system prompt and tools, so all before SUGGEST is read from
  // the cache. Its line is shown till it is sent or a turn ends answered
  // (used, Chat.turn); a tool call, a failure or nothing back shows none.
  // A turn of Claude Code's keeps no request, so one kept on another
  // vendor never stands in
  export function ask(chat: Running): void {
    const s = chat.suggest;
    const last = AskAI.last(Tools.at(chat.tools, "main"));
    if (!s.on || s.unused >= UNUSED || last === null || last.ask.vendor !== chat.pick.vendor) {
      return;
    }
    const blocks = [{ text: SUGGEST, mark: false }];
    const ask = { ...last.ask, blocks, imgs: [], server: "", keep: false, from: last, max: SUGGEST_MAX };
    const call = (s.call = AskAI.ask(ask, () => {}));
    call.done.then((end) => {
      if (s.call === call) {
        s.call = null;
        s.text = end.ok ? Suggest.line(end.text) : "";
        chat.mem.suggest = s.text;
        Chat.save(chat);
        Chat.change(chat);
      }
    });
  }

  // a suggested reply as shown: its first line, out of any quotes round
  // it; none if it says nothing (or is NONE), or runs past WORDS words
  export function line(text: string): string {
    const line = text.trim().split("\n")[0].trim().replace(/^["“'‘](.*)["”'’]$/, "$1").trim();
    return NONE.test(line) || line.split(/\s+/).length > WORDS ? "" : line;
  }

  // the suggested reply goes, saved so, and the one being asked (sent, a
  // turn answered, /clear, the setting turned off)
  export function drop(chat: Running): void {
    chat.suggest.call?.stop();
    chat.suggest.call = null;
    chat.suggest.text = "";
    chat.suggest.passed = false;
    if (chat.mem.suggest !== "") {
      chat.mem.suggest = "";
      Chat.save(chat);
    }
  }

  // a message sent while a suggested reply shows: one that used it (it
  // starts with it) lets it go, and the count of those unused starts
  // anew; one of the user's own passes it over, leaving it, to send as
  // well, till the turn is answered
  export function used(chat: Running, text: string): void {
    const s = chat.suggest;
    if (s.text !== "" && text.trim().startsWith(s.text)) {
      s.unused = 0;
      Suggest.drop(chat);
    } else if (s.text !== "") {
      s.passed = true;
    }
  }
}
