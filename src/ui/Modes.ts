// Modes
// =====
// The terminal's sequences illi writes, as constants: its modes on and
// off, the title, the cursor, a synchronized write, bracketed paste.
// Screen.ts writes them for a terminal of its own; the window (term/
// Window.ts), which owns the terminal for every profile's illi under it,
// writes the modes once for all of them. Nothing here reads a setting, so
// the window can import it without Config.ts.

// a paste's brackets
export const PASTE_ON  = "\x1b[200~";
export const PASTE_OFF = "\x1b[201~";

// a write the terminal shows at once; the screen cleared; the cursor
// hidden, shown
export const SYNC_ON  = "\x1b[?2026h";
export const SYNC_OFF = "\x1b[?2026l";
export const CLEAR    = "\x1b[2J";
export const HIDE     = "\x1b[?25l";
export const SHOW     = "\x1b[?25h";

// the cursor's look: a block, as terminals draw it, blinking while illi
// waits, else steady (as opencode's: its own default); the terminal's
// own again
export const BLINK  = "\x1b[1 q";
export const STEADY = "\x1b[2 q";
export const PLAIN  = "\x1b[0 q";

// the terminal's title (OSC 0) set; saved on the terminal's stack
// (XTWINOPS) and put back from it; one emptied, so a terminal without
// the stack falls back to its own, not to illi's; the one saved put back
// and saved again, the stack as deep as before (another profile shown)
export const TITLE_SET   = "\x1b]0;";
export const TITLE_END   = "\x07";
export const TITLE_PUSH  = "\x1b[22;0t";
export const TITLE_POP   = "\x1b[23;0t";
export const TITLE_NONE  = TITLE_SET + TITLE_END;
export const TITLE_AGAIN = TITLE_NONE + TITLE_POP + TITLE_PUSH;

// kitty's keys: the flags asked (a kitty terminal answers CSI ? flags u)
export const FLAGS_ASK = "\x1b[?u";

// the alternate screen, bracketed paste, the mouse's clicks, wheel and
// every move as SGR reports, the focus gained and lost (Screen.ts
// FOCUS_IN, FOCUS_OUT), kitty's keys at flag 1 (popped before
// pushed: each screen keeps its own flags), the flags asked, the
// terminal's title saved (TITLE_PUSH); off, in turn. The window's
// (WINDOW_ON) asks no flags: each profile's illi asks as it's shown
const ON = "\x1b[?1049h\x1b[?2004h\x1b[?1000h\x1b[?1003h\x1b[?1006h\x1b[?1004h\x1b[<u\x1b[>1u";
export const MODES_ON  = ON + FLAGS_ASK + TITLE_PUSH;
export const WINDOW_ON = ON + TITLE_PUSH;
export const MODES_OFF = "\x1b[<u\x1b[?1004l\x1b[?1006l\x1b[?1003l\x1b[?1000l\x1b[?2004l\x1b[?1049l" + SHOW + PLAIN;

// the modes off as the window ends: the title illi wrote emptied, the
// one saved popped, then MODES_OFF (as Screen.ts screen_off with a title
// written)
export const MODES_END = TITLE_NONE + TITLE_POP + MODES_OFF;

// what a profile's illi may have left on the terminal (cut off mid-paint,
// or crashed) put right before another is shown: a synchronized write
// ended, a link (OSC 8) closed, the ink plain, the scroll region the
// whole screen, the cursor shown
export const RESET = SYNC_OFF + "\x1b]8;;\x1b\\\x1b[0m\x1b[r" + SHOW;

// the background asked (OSC 11)
export const ASK = "\x1b]11;?\x1b\\";
