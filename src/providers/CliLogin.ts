// CLI downloads in /login
// =======================
// What a plan's /login page (antigravity/Login.ts, github-copilot/
// Login.ts) says and offers of the CLI the plan runs on (Cli.ts) while
// none is here. The page's line says the CLI isn't here, is downloading,
// or needs an update; a row under the accounts offers this illi's build
// (its version and size; one downloading by itself: how far it got).
// Adding an account, or signing one in again, finds the user's own CLI
// first; with none, it offers the download, saying how big it is, then
// signs in once it's done, each in /login's popup (Esc stops the
// download, nothing left behind).

import { term_draw } from "../term/Frame.ts";
import { login_lines, login_question, login_say, login_step, type Row } from "../term/LoginCommands.ts";
import { term_note } from "../term/Notices.ts";
import type { Term } from "../term/Term.ts";
import type { Build, Cli } from "./Cli.ts";

// what the page's line says of the CLI after the account ("": it's here)
export function cli_lack(c: Cli): string {
  return c.ready() ? "" : " · " + c.spec.short + " " + (c.progress() !== null ? "is downloading" : c.other() === null ? "isn't here" : "needs an update");
}

// the row under the accounts while no CLI is here: this illi's build
// offered (an update of an older version here), or how far its download
// by itself got; none: the CLI is here, or no build for this machine
export function cli_rows(t: Term, c: Cli): Row[] {
  const b = c.pin;
  if (b === null || c.ready()) {
    return [];
  }
  const was = c.other();
  const up  = cli_older(c, was);
  const how = c.progress();
  if (how !== null) {
    return [{ name: (up ? "Updating " : "Downloading ") + c.spec.name, about: (up ? was + " → " : "") + b.version + ", " + (how.share === null ? "in another illi" : how.share + "% of " + cli_mb(b.bytes)), enter: "see how far", pick: (back) => back() }];
  }
  return [{ name: (up ? "Update " : "Download ") + c.spec.name, about: (up ? was + " → " : "") + b.version + ", " + cli_mb(b.bytes), enter: up ? "update it" : "download it", pick: (back) => cli_offer(t, c, back, null) }];
}

// whether a version here is older than this illi's build (one to update)
function cli_older(c: Cli, was: string | null): was is string {
  return was !== null && c.pin !== null && c.newer(was, c.pin.version) > 0;
}

// a size said in MB
function cli_mb(bytes: number): string {
  return Math.round(bytes / 1e6) + " MB";
}

// a sign-in once the CLI is here (the user's own looked for first:
// Cli.look): now if it is; else once this illi's build is downloaded
// (asked first, Esc back to `back`); one downloading by itself said, to
// wait for
export function cli_then(t: Term, c: Cli, back: () => void, sign: () => Promise<void>): void {
  void c.look().then(() => {
    if (c.ready()) {
      void sign();
    } else if (c.progress() !== null) {
      login_say(t, c.spec.name, c.why() + ".", back);
    } else {
      cli_offer(t, c, back, sign);
    }
  });
}

// this illi's build offered (Esc back to `back`), what it takes said, in
// place of an older version here; downloaded, the sign-in asked for
// follows (`then`). None for this machine: said
export function cli_offer(t: Term, c: Cli, back: () => void, then: (() => Promise<void>) | null): void {
  const b = c.pin;
  if (b === null) {
    login_say(t, c.spec.name, c.why() + ".", back);
    return;
  }
  const s    = c.spec;
  const was  = c.other();
  const up   = cli_older(c, was);
  const what = s.name.replace(s.maker + " ", "") + " " + (up ? was + " → " : "") + b.version + " from " + s.from + ": " + cli_mb(b.bytes) + ", " + cli_mb(b.unpacked) + " once unpacked" + (s.grows === "" ? "" : ", " + s.grows);
  const why  = up ? "this illi runs " + b.version + "; " + was + " goes once no illi runs it" : was !== null ? "this illi runs " + b.version + "; " + was + ", a newer illi's, stays" : s.plan + " runs on it (or install " + s.program + " " + s.minimum + " or later yourself)";
  login_question(t, (up ? "Update " : "Download ") + s.name + "?", [up ? "Update it" : "Download it", "Not now"], [what, why], (k) => {
    if (k === 0) {
      void cli_fetch(t, c, b, up, then, back);
    }
  }, back);
  term_draw(t);
}

// the CLI downloaded in /login's popup (a step: Esc stops it, nothing
// left behind, back to `back`), how far it got said; failed, said there,
// Try again; then the sign-in asked for, if one is, in the popup's place,
// else back to `back`, said in the chat
async function cli_fetch(t: Term, c: Cli, b: Build, up: boolean, then: (() => Promise<void>) | null, back: () => void): Promise<void> {
  const name = c.spec.name;
  const step = login_step(t, (up ? "Update " : "Download ") + name, back);
  const say  = (share: number) => (up ? "Updating " : "Downloading ") + name + " " + b.version + " from " + c.spec.from + ": " + share + "% of " + cli_mb(b.bytes) + "…";
  const shown = step.wait(say(0));
  let at = 0;
  try {
    await c.download(b, step.stop.signal, (bytes, of) => {
      const share = Math.min(100, Math.floor((bytes / (of || b.bytes)) * 100));
      if (share !== at && shown !== null) {
        at = share;
        shown.body = login_lines(say(share));
        term_draw(t);
      }
    });
  } catch (err: any) {
    step.fail(name + " wasn't " + (up ? "updated" : "downloaded") + ": " + err.message + ".", () => void cli_fetch(t, c, b, up, then, back));
    return;
  }
  if (then !== null) {
    return then();
  }
  step.close();
  term_note(t, (up ? "Updated " + name + " to " : "Downloaded " + name + " ") + b.version + ".");
  back();
}
