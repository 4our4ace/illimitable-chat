// Theme test
// ==========
// `bun test Theme.test.ts`. A theme's entries are checked as it is read:
// a color is a palette index (0-255) or #rrggbb, a glyph or a tool's
// emoji never holds a control character, a token is a color, a color's
// name or another token's; a palette index past 15 is the 256 colors'
// SGR. The tokens: by default illi's aqua the accent (the terminal's
// cyan, its background untold), the user's frame the accent made softer
// toward the background, the links the palette's; the accent setting
// over a plugin's theme, a token naming another following it, the dim
// one in place of the terminal's faint. No drawing code names a color
// of its own: each takes a token's.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as config from "../config/Config.ts";
import * as Draw from "./Draw.ts";
import * as Paint from "./Paint.ts";
import * as Theme from "./Theme.ts";

// the dark background catppuccin-mocha draws on, and illi's aqua on it
const DARK = "#1e1e2e";
const AQUA = "#81f8fb";

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
  expect(Theme.theme_check(null)).toEqual({ ansi: {}, glyph: {}, tool: {}, syntax: {}, palette: undefined, colors: undefined, tokens: {} });
});

test("a theme's tokens: colors, colors' names, illi, other tokens' names; its accent alone the accent's, its tokens' over it; any other left out", () => {
  const own = Theme.theme_check({ accent: "#112233", tokens: { accent: "#7DCFFF", you: "Accent", link: "blue", dim: "8", success: "illi", error: "crimson", warning: "\x1b[31m", bogus: "1" } });
  expect(own.tokens).toEqual({ accent: "#7DCFFF", you: "accent", link: "blue", dim: "8", success: "illi" });
  expect(Theme.theme_check({ accent: "cyan" }).tokens).toEqual({ accent: "cyan" });
});

test("a palette index is its basic SGR to 15, the 256 colors' past it; any other none", () => {
  expect([Paint.color_sgr(38, "1"), Paint.color_sgr(38, "9"), Paint.color_sgr(48, "15")]).toEqual([";31", ";91", ";107"]);
  expect([Paint.color_sgr(38, "16"), Paint.color_sgr(48, "208")]).toEqual([";38;5;16", ";48;5;208"]);
  expect([Paint.color_sgr(38, "256"), Paint.color_sgr(38, "blue"), Paint.color_sgr(38, "")]).toEqual(["", "", ""]);
});

test("the background untold: the accent the terminal's cyan (illi's), the frame the same, the rest the terminal's own", () => {
  expect(Draw.draw_tokens()).toEqual({ accent: "6", you: "6", link: "4", success: "2", warning: "3", error: "1", dim: "" });
  expect([Draw.draw_theme().accent, Draw.draw_theme().bullet]).toEqual(["6", "6"]);
});

test("the background told: illi's aqua the accent, the palette's accent and bullets too, its syntax kept; the frame the aqua made softer", () => {
  const was = Draw.draw_stamp();
  Paint.paint_canvas(DARK);
  expect(Draw.draw_stamp()).toBe(was + 1);
  const tokens = Draw.draw_tokens();
  const theme  = Draw.draw_theme();
  expect([tokens.accent, theme.accent, theme.bullet, tokens.link, theme.link, theme.codeFlag]).toEqual([AQUA, AQUA, AQUA, "#89b4fa", "#89b4fa", "#f38ba8"]);
  expect(tokens.you).toBe(Draw.draw_mix(AQUA, DARK, 0.4));
  expect(tokens.you).not.toBe(AQUA);
});

test("the accent setting recolors at once (a new look); a color's name is the terminal's own, the frame then the accent itself; auto: illi's again", () => {
  const was = Draw.draw_stamp();
  config.config_set("accent", "magenta");
  expect(Draw.draw_stamp()).toBe(was + 1);
  expect([Draw.draw_tokens().accent, Draw.draw_tokens().you, Draw.draw_theme().accent, Draw.draw_theme().bullet]).toEqual(["5", "5", "5", "5"]);
  config.config_set("accent", "#FF9E64");
  expect([Draw.draw_tokens().accent, Draw.draw_tokens().you]).toEqual(["#FF9E64", Draw.draw_mix("#FF9E64", DARK, 0.4)]);
  config.config_set("accent", null);
  expect(Draw.draw_tokens().accent).toBe(AQUA);
  expect(config.config_check("accent", "purple")).toMatch(/^accent takes auto, illi/);
  expect(config.config_check("accent", "300")).toMatch(/^accent takes/);
});

test("each accent /settings offers is a color: illi's, or the terminal's own by name", () => {
  for (const value of config.SETTINGS.accent.values as string[]) {
    config.config_set("accent", value);
    const accent = Draw.draw_tokens().accent;
    expect([value, value === "auto" || value === "illi" ? accent === AQUA : accent === Theme.NAMED[value]]).toEqual([value, true]);
  }
  config.config_set("accent", null);
});

test("a plugin's theme goes over the file's, the setting over it; a token naming another follows it, a loop is none", () => {
  Theme.theme_plug({ accent: "#00ff00", tokens: { link: "accent", error: "error", success: "lime" }, colors: { heading: "#ff0000", bad: "red" } });
  expect([Draw.draw_tokens().accent, Draw.draw_tokens().link, Draw.draw_theme().link, Draw.draw_tokens().error, Draw.draw_tokens().success]).toEqual(["#00ff00", "#00ff00", "#00ff00", "", "2"]);
  expect([Draw.draw_theme().heading, "bad" in Draw.draw_theme()]).toEqual(["#ff0000", false]);
  config.config_set("accent", "red");
  expect([Draw.draw_tokens().accent, Draw.draw_tokens().link]).toEqual(["1", "1"]);
  config.config_set("accent", null);
});

test("the dim token, set, colors dim text of no color of its own in place of the terminal's faint", () => {
  expect(Paint.line_ansi([Paint.Run("x", Paint.DIM)])).toContain("\x1b[0;2m");
  Theme.theme_plug({ tokens: { dim: "8" } });
  expect(Paint.line_ansi([Paint.Run("x", Paint.DIM)])).toContain("\x1b[0;90m");
  expect(Paint.line_ansi([Paint.Run("x", { ...Paint.DIM, c: "1" })])).toContain("\x1b[0;2;31m");
});

test("no drawing code names a color of its own: each takes a token's (Draw.draw_tokens)", () => {
  const dirs  = [import.meta.dir, import.meta.dir + "/../term"];
  const files = dirs.flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => d + "/" + f)).filter((f) => !/[\\/](Draw|Theme)\.ts$/.test(f));
  const found = files.flatMap((f) => fs.readFileSync(f, "utf8").split("\n").filter((l) => /\bc: *"\d|draw_theme\(\)\.(accent|link)|\?\? "\d"/.test(l)).map((l) => f + ": " + l.trim()));
  expect(found).toEqual([]);
});
