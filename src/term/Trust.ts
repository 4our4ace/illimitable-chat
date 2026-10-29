// Trust
// =====
// Before illi starts in a folder on a terminal, whether the person trusts
// it: illi reads, edits and runs files there, and follows the
// instructions its AGENTS.md or CLAUDE.md holds. Asked full screen, a
// card in its middle under illimitable's logo (Logo.ts; none where the
// screen has no room for both): the folder, what trusting it lets illi
// do, and two buttons side by side (No, exit; Yes, trust it: No lit
// first; one over the other where they don't fit), before anything of the
// folder's loads or runs. A yes is kept for the project
// (Trusted.ts); home's own folder, and any above it, is asked at each
// start, never kept. A pipe is never asked: a script's run is its own
// say, though a folder's own agents, commands, skills, plugins, hooks and
// MCP servers load in it only once a terminal trusted the folder.

import { config_home } from "../config/Config.ts";
import * as Draw from "../ui/Draw.ts";
import { LOGO_H, LOGO_W, logo_lines } from "../ui/Logo.ts";
import * as Paint from "../ui/Paint.ts";
import * as Screen from "../ui/Screen.ts";
import { Trusted } from "../config/Trusted.ts";

// Types
// =====

// the question as shown: the folder, whether it is kept once trusted
// (home's own, or one above it, is not), the button lit (NO, YES)
export type Asked = { folder: string; kept: boolean; at: number };

// the screen as laid out: its rows, and where each button stands on them
// (its row, its columns from col to to, the answer it gives: NO, YES)
export type Laid = { rows: Screen.Piece[][]; buttons: Button[] };
type Button = { row: number; col: number; to: number; at: number };

// Constants
// =========

// the buttons, in order; the widest the card runs, the room kept round
// it on a narrow screen, its text's indent inside its frame, the room
// between the buttons side by side
const NO = 0, YES = 1;
const BUTTONS = ["No, exit", "Yes, trust it"];
const WIDE    = 64;
const MARGIN  = 2;
const PAD     = 2;
const GAP     = 3;

const TITLE = "Trust this folder?";
const TEXT  = "illi will read, edit and run files here, and follow its AGENTS.md or CLAUDE.md. Trust only code you know.";
const HOME  = "Your home folder, or one above it: illi asks at every start here.";
const KEYS  = "←→ choose · Enter confirm · Esc exit";

// Trust
// =====

export namespace Trust {

  // whether illi may start in cwd: trusted already, or asked (on a
  // terminal) and trusted now (Trusted.trust: kept, or home's for this
  // run); a pipe, always. The screen is the terminal's, taken already
  // (Screen.screen_new): its keys come here till the question is answered
  export async function check(scr: Screen.Screen, cwd: string): Promise<boolean> {
    const folder = Trusted.folder(cwd);
    const kept   = !Trusted.home(folder);
    if (!scr.tty || (kept && Trusted.has(folder))) {
      return true;
    }
    const yes = await Trust.ask(scr, { folder, kept, at: NO });
    if (yes) {
      Trusted.trust(folder);
    }
    return yes;
  }

  // the question, full screen, till answered: the keys as Trust.key; the
  // pointer over a button lights it, and a click on one takes it (pressed
  // and let go on it, as a popup's: a slip off it takes nothing; never
  // the click that only focused the window). Its keys are grabbed, and its
  // text taken, before the input's editing sees them (Left and Right move
  // in the input otherwise), its mouse its own till it is answered. Drawn
  // again as the terminal's size changes
  export function ask(scr: Screen.Screen, asked: Asked): Promise<boolean> {
    return new Promise((done) => {
      const on = scr.on;
      let laid: Laid = { rows: [], buttons: [] };
      let pressed: number | null = null;
      const draw = () => {
        laid = Trust.laid(asked, Screen.screen_size());
        Screen.screen_paint(scr, laid.rows, null);
      };
      const end = (yes: boolean) => {
        process.stdout.off("resize", draw);
        [scr.grab, scr.type, scr.on] = [null, undefined, on];
        done(yes);
      };
      scr.grab = (key) => {
        const out = Trust.key(asked, key);
        if (out === null) {
          draw();
        } else {
          end(out);
        }
        return true;
      };
      scr.type = (text) => {
        const out = Trust.key(asked, text.toLowerCase());
        if (out !== null) {
          end(out);
        }
        return true;
      };
      scr.on = (key) => {
        const under = Trust.under(laid, scr.point);
        if (key === "Press") {
          pressed = scr.focusing === true ? null : under;
        }
        if ((key === "Move" || key === "Drag" || (key === "Press" && pressed !== null)) && under !== null && under !== asked.at) {
          asked.at = under;
          draw();
        }
        if (key === "Release") {
          const was = pressed;
          pressed = null;
          if (was !== null && was === under) {
            end(was === YES);
          }
        }
      };
      process.stdout.on("resize", draw);
      draw();
    });
  }

  // a key at the question: the answer it gives (null: none yet, the lit
  // button moved, or nothing). Left and Right light the button that way;
  // Up, Down and Tab the other; Enter takes the lit one; y and n pick
  // one; Esc, Ctrl+C and Ctrl+D exit
  export function key(asked: Asked, key: string): boolean | null {
    if (key === "Left" || key === "Right") {
      asked.at = key === "Left" ? NO : YES;
      return null;
    }
    if (key === "Up" || key === "Down" || key === "Tab" || key === "Shift+Tab") {
      asked.at = asked.at === NO ? YES : NO;
      return null;
    }
    if (key === "Enter") {
      return asked.at === YES;
    }
    if (key === "y" || key === "n") {
      return key === "y";
    }
    return key === "Esc" || key === "Ctrl+C" || key === "Ctrl+D" ? false : null;
  }

  // the button under a spot as laid out (null: none)
  export function under(laid: Laid, p: Screen.Spot): number | null {
    return laid.buttons.find((b) => b.row === p.row && p.col >= b.col && p.col < b.to)?.at ?? null;
  }

  // the screen laid out: the logo over a card in the middle (on a screen
  // too short or narrow for both, the card alone), the card as wide as
  // the screen lets it (WIDE at most), framed dim, the question on its
  // top edge and the keys on its bottom one; in it the folder bold (~ for
  // home), what trusting it means (home's: that it is asked each time,
  // dim), then the buttons, the lit one filled in the accent, the other
  // dim between its brackets. Each button's place kept as its runs land
  // on the screen
  export function laid(asked: Asked, { w, h }: { w: number; h: number }): Laid {
    const cw     = Math.max(24, Math.min(WIDE, w - 2 * MARGIN));
    const tw     = cw - 4 - 2 * PAD;
    const bold   = { ...Paint.INK, b: true };
    const accent = Draw.draw_tokens().accent;
    const wrap   = (runs: Paint.Line) => Paint.runs_wrap(runs, tw, false);
    const mid    = (l: Paint.Line, of: number) => [Paint.Run(" ".repeat(Math.max(0, Math.floor((of - Paint.line_width(l)) / 2)))), ...l];
    const of     = new Map<Paint.Run, number>();
    const button = (k: number): Paint.Line => {
      const runs = k === asked.at ? [Paint.Run("  " + BUTTONS[k] + "  ", { ...bold, c: accent, v: true })] : [Paint.Run("[ ", Paint.DIM), Paint.Run(BUTTONS[k]), Paint.Run(" ]", Paint.DIM)];
      runs.forEach((r) => of.set(r, k));
      return runs;
    };
    const [no, yes] = [button(NO), button(YES)];
    const both   = [...no, Paint.Run(" ".repeat(GAP)), ...yes];
    const body   = [
      [],
      ...wrap([Paint.Run(Paint.text_clean(config_home(asked.folder)), bold)]),
      [],
      ...wrap([Paint.Run(TEXT)]),
      ...(asked.kept ? [] : [[], ...wrap([Paint.Run(HOME, Paint.DIM)])]),
      [],
      ...(Paint.line_width(both) <= tw ? [mid(both, tw)] : [mid(no, tw), [], mid(yes, tw)]),
      [],
    ].map((l) => (l.length === 0 ? l : [Paint.Run(" ".repeat(PAD)), ...l]));
    const card   = Paint.frame(body, cw, [Paint.Run(" " + TITLE + " ", bold)], [Paint.Run(" " + KEYS + " ", Paint.DIM)]);
    const logo   = h >= LOGO_H + 1 + card.length && w >= LOGO_W ? [...logo_lines().map((l) => mid(l, cw)), []] : [];
    const lines  = [...logo, ...card];
    const lw     = Math.max(...lines.map(Paint.line_width));
    const col    = Math.max(0, Math.floor((w - lw) / 2));
    const top    = Math.max(0, Math.floor((h - lines.length) / 2));
    const buttons: Button[] = [];
    lines.forEach((line, k) => {
      let x = col;
      for (const r of line) {
        const at   = of.get(r);
        const last = buttons.at(-1);
        const to   = x + Paint.text_width(r.x);
        if (at !== undefined && last?.row === top + k && last.at === at && last.to === x) {
          last.to = to;
        } else if (at !== undefined && top + k < h) {
          buttons.push({ row: top + k, col: x, to, at });
        }
        x = to;
      }
    });
    const rows = Array.from({ length: h }, (_, r) => {
      const line = lines[r - top];
      return line === undefined ? [] : [{ col, w: Math.min(lw, w - col), line }];
    });
    return { rows, buttons };
  }
}
