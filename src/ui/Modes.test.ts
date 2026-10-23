// Modes test
// ==========
// `bun test Modes.test.ts`. The window's modes are a screen's but for the
// flags asked (each profile's illi asks as it's shown); the window's end
// empties the title and pops the one saved before the modes go off, as
// a screen's does; a switch puts the saved title back and saves it again;
// what a profile's illi cut off may have left is put right before another
// is shown.

import { expect, test } from "bun:test";
import { FLAGS_ASK, MODES_END, MODES_OFF, MODES_ON, RESET, SHOW, SYNC_OFF, TITLE_AGAIN, TITLE_POP, TITLE_PUSH, WINDOW_ON } from "./Modes.ts";

test("the window's modes are a screen's without the flags asked; its end pops the title, then the modes go off", () => {
  expect(MODES_ON.replace(FLAGS_ASK, "")).toBe(WINDOW_ON);
  expect(WINDOW_ON).not.toContain(FLAGS_ASK);
  expect(WINDOW_ON.endsWith(TITLE_PUSH)).toBe(true);
  expect(MODES_END).toBe("\x1b]0;\x07" + TITLE_POP + MODES_OFF);
  expect(TITLE_AGAIN).toBe("\x1b]0;\x07\x1b[23;0t\x1b[22;0t");
});

test("what a profile's illi cut off mid-paint may have left is put right: its synchronized write ended, a link closed, the ink plain, the scroll region whole, the cursor shown", () => {
  expect(RESET).toBe(SYNC_OFF + "\x1b]8;;\x1b\\" + "\x1b[0m" + "\x1b[r" + SHOW);
});
