// Trust
// =====
// Before illi starts in a folder on a terminal, whether the person trusts
// it: illi reads, edits and runs files there, and follows the
// instructions its AGENTS.md or CLAUDE.md holds. Asked full screen, the
// question in its middle (No, exit; Yes, I trust this folder: No lit
// first), before anything of the folder's loads or runs. A yes is kept
// for the project (Trusted.ts); home's own folder, and any above it, is
// asked at each start, never kept. A pipe is never asked: a script's run is its own
// say, though a folder's own agents, commands, skills, plugins, hooks and
// MCP servers load in it only once a terminal trusted the folder.

import * as Draw from "../ui/Draw.ts";
import * as Paint from "../ui/Paint.ts";
import * as Screen from "../ui/Screen.ts";
import { GLYPH } from "../ui/Theme.ts";
import { Trusted } from "../config/Trusted.ts";

// Types
// =====

// the question as shown: the folder, whether it is kept once trusted
// (home's own, or one above it, is not), the option lit (NO, YES)
export type Asked = { folder: string; kept: boolean; at: number };

// Constants
// =========

// the options, in order; the widest the question's text runs
const NO = 0, YES = 1;
const OPTIONS = ["No, exit", "Yes, I trust this folder"];
const WIDE = 72;

const TEXT = "illi will read, edit and run files here, and follow the instructions in the folder's AGENTS.md or CLAUDE.md. Trust it only if it is your own work, your team's, or a well-known open-source project; if not, look through it first.";
const HOME = "This is your home folder, or one above it: illi asks each time it starts here.";
const KEYS = "↑↓ choose · Enter confirm · Esc exit";

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

  // the question, full screen, till answered: Up, Down and Tab move
  // between the options, y and n pick one, Enter takes the lit one; Esc
  // and Ctrl+C exit. Its keys are grabbed, and its text taken, before the
  // input's editing sees them (Up and Down move in the input otherwise).
  // Drawn again as the terminal's size changes
  export function ask(scr: Screen.Screen, asked: Asked): Promise<boolean> {
    return new Promise((done) => {
      const draw = () => Screen.screen_paint(scr, Trust.rows(asked, Screen.screen_size()), null);
      const end = (yes: boolean) => {
        process.stdout.off("resize", draw);
        scr.grab = null;
        scr.type = undefined;
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
      process.stdout.on("resize", draw);
      draw();
    });
  }

  // a key at the question: the answer it gives (null: none yet, the lit
  // option moved, or nothing)
  export function key(asked: Asked, key: string): boolean | null {
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

  // the screen's rows: the question in the middle, its lines as wide as
  // the screen lets them (WIDE at most), the folder bold, the lit option
  // marked in the accent
  export function rows(asked: Asked, { w, h }: { w: number; h: number }): Screen.Piece[][] {
    const bw     = Math.max(10, Math.min(WIDE, w - 4));
    const bold   = { ...Paint.INK, b: true };
    const accent = { ...bold, c: Draw.draw_tokens().accent };
    const wrap   = (runs: Paint.Line) => Paint.runs_wrap(runs, bw, false);
    const option = (text: string, k: number) => [Paint.Run(k === asked.at ? GLYPH.lit + " " : "  ", accent), Paint.Run(text, k === asked.at ? accent : Paint.INK)];
    const lines  = [
      ...wrap([Paint.Run("Do you trust this folder?", bold)]),
      [],
      ...wrap([Paint.Run(Paint.text_clean(asked.folder), bold)]),
      [],
      ...wrap([Paint.Run(TEXT)]),
      ...(asked.kept ? [] : [[], ...wrap([Paint.Run(HOME, Paint.DIM)])]),
      [],
      ...OPTIONS.map(option),
      [],
      ...wrap([Paint.Run(KEYS, Paint.DIM)]),
    ];
    const lw  = Math.max(...lines.map(Paint.line_width));
    const col = Math.max(0, Math.floor((w - lw) / 2));
    const top = Math.max(0, Math.floor((h - lines.length) / 2));
    return Array.from({ length: h }, (_, r) => {
      const line = lines[r - top];
      return line === undefined ? [] : [{ col, w: Math.min(lw, w - col), line }];
    });
  }
}
