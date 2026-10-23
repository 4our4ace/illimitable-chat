// Theme file test
// ===============
// `bun test ThemeFile.test.ts`. A theme file's tokens and its older
// keys: its accent the accent (its tokens' over its accent alone), the
// palette's accent and bullets with it; a token following another; the
// user's frame as its ansi sets it, a diff's added lines too, else their
// tokens'. Each element takes its token: the user's frame, a reply's
// copy buttons and bullets, a chip, a diff's lines, a plugin's piece.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-themefile-");
process.env.ILLI_DIR = DIR;
fs.writeFileSync(DIR + "/theme.json", JSON.stringify({
  accent : "#112233",
  tokens : { accent: "#445566", link: "accent", warning: "nope" },
  ansi   : { you: "5", add: "10" },
  colors : { heading: "#ff9e64" },
}));

const Draw  = await import("./Draw.ts");
const Paint = await import("./Paint.ts");
const View  = await import("./View.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// the colors of a row's runs, by their text
const colored = (lines: any[][], c: string) => lines.flat().filter((r) => r.s.c === c).map((r) => r.x);

test("the file's tokens: its accent (its tokens' over its accent alone), links following it, the frame as its ansi says; one that won't do left out", () => {
  expect(Draw.draw_tokens()).toEqual({ accent: "#445566", you: "5", link: "#445566", success: "2", warning: "3", error: "1", dim: "" });
  const theme = Draw.draw_theme();
  expect([theme.accent, theme.bullet, theme.link, theme.heading]).toEqual(["#445566", "#445566", "#445566", "#ff9e64"]);
});

test("each element takes its token: the user's frame, copy buttons and bullets, a chip, a diff's lines", () => {
  const user  = Paint.rows_lines(View.entry_rows(1, "user", "look at [Image #1]"), 40);
  expect(user[0].every((r) => r.s.c === "5")).toBe(true);
  expect(colored(user, "#445566")).toEqual(["[Image #1]"]);
  const reply = Paint.rows_lines(View.entry_rows(2, "illi", "- one\n- two\n\n```sh\nls\n```"), 60);
  expect(colored(reply, "#445566")).toEqual(expect.arrayContaining(["⧉ copy", "• "]));
  const diff  = Paint.rows_lines(View.entry_rows(3, "echo", "--- a.ts\n+++ a.ts\n@@ -1,1 +1,1 @@\n-old\n+new"), 60);
  expect(colored(diff, "10")).toContain("new");
  expect(colored(diff, "1")).toContain("old");
});

test("a plugin's pieces take their tokens' colors", () => {
  const line = Paint.pieces_line([{ text: "ok", tone: "success" }, { text: " · " }, { text: "main", tone: "accent", bold: true }]);
  expect(line.map((r) => [r.x, r.s.c, r.s.b])).toEqual([["ok", "2", false], [" · ", "", false], ["main", "#445566", true]]);
});
