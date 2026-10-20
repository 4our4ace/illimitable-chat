// Theme test
// ==========
// `bun test Theme.test.ts`. A theme's entries are checked as it is read:
// a color is a palette index (0-255) or #rrggbb, a glyph or a tool's
// emoji never holds a control character; a palette index past 15 is the
// 256 colors' SGR.

import { expect, test } from "bun:test";
import * as Paint from "./Paint.ts";
import * as Theme from "./Theme.ts";

test("a theme's colors that won't do are left out; its glyphs and tools lose their control characters", () => {
  const own = Theme.theme_check({
    ansi   : { block: "", ink: "blue", add: "120", del: "256", you: "#336699" },
    syntax : { keyword: "4", string: 7 },
    glyph  : { input: "\x1b]52;c;eA==\x07> ", tab: 3 },
    tool   : { shell: "$\x1b[2J" },
    palette: "nord",
  });
  expect(own.ansi).toEqual({ block: "", add: "120", you: "#336699" });
  expect(own.syntax).toEqual({ keyword: "4" });
  expect(own.glyph).toEqual({ input: "]52;c;eA==> " });
  expect(own.tool).toEqual({ shell: "$[2J" });
  expect(own.palette).toBe("nord");
  expect(Theme.theme_check(null)).toEqual({ ansi: {}, glyph: {}, tool: {}, syntax: {}, palette: undefined, diagrams: undefined, colors: undefined });
});

test("a palette index is its basic SGR to 15, the 256 colors' past it; any other none", () => {
  expect([Paint.color_sgr(38, "1"), Paint.color_sgr(38, "9"), Paint.color_sgr(48, "15")]).toEqual([";31", ";91", ";107"]);
  expect([Paint.color_sgr(38, "16"), Paint.color_sgr(48, "208")]).toEqual([";38;5;16", ";48;5;208"]);
  expect([Paint.color_sgr(38, "256"), Paint.color_sgr(38, "blue"), Paint.color_sgr(38, "")]).toEqual(["", "", ""]);
});
