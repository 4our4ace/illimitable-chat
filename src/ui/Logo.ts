// Logo
// ====
// illimitable's logo (assets/logo.svg: an infinity sign, an i at its
// crossing) drawn in block glyphs, LOGO_W columns by LOGO_H rows, in the
// terminal's own text color (the svg's two files are that color on a
// light background and on a dark one). It was fitted to the svg once:
// each cell took the glyph (a block, a half or a quarter, an eighth) or
// that glyph reversed whose shape came closest to the logo's ink over the
// cell, taken as 8 by 16 dots; a reversed one with a glyph of its own
// shape (a quarter's, a half's, ▇ ▔, ▉ ▕) took that. Terminals draw
// these glyphs themselves, edge to edge, so the cells join up. Ten rows
// keep the i's dot and stem whole (six lose the dot). A new logo is
// fitted anew the same way.

import * as Paint from "./Paint.ts";

// Constants
// =========

// each row: its glyphs, and under them a ^ for each cell drawn reversed
// (the terminal's background in the glyph's shape, the text color round
// it)
const ART: [string, string][] = [
  ["                          ▃▅▆▇███▇▆▄▂", ""],
  ["        ▁▁▁             ▊████▁▁██████▇▖", "                        ^    ^^"],
  ["    ▃▅▇█████▇▅▂       ▗▆▆▖▔▔    ▔▀█████▖", ""],
  ["  ▅█████▁▂▂▁███▇▃    ▂▞▃▃▘        ▋████▉", "        ^^^^           ^^         ^"],
  ["▗█████▀▔     ▅▂██▇▄▃▇██▋          ▊████▉", "             ^^                   ^"],
  ["▎████▍          ▅█████▛          ▁▟████▋", "^               ^"],
  ["█████▌         ▂▟██████▅▃▂    ▁▃▅█████▛", ""],
  ["▍█████▅▂▁▁▁▁▃▅▇███▂▅▔▀▂█████████████▂▘", "^                 ^^  ^             ^"],
  [" ▀█████████████▁▀▔     ▔▅▃▂▁▁▁▁▂▂▀▅", "               ^        ^^^^^^^^^ ^"],
  ["   ▅▃▁▁███▁▂▃▅▔", "   ^^^^   ^^^^"],
];

export const LOGO_W = Math.max(...ART.map(([row]) => [...row].length));
export const LOGO_H = ART.length;

// Logo
// ====

// the logo's rows, each LOGO_W wide: its runs of cells drawn alike
// (plain or reversed) one run each
export function logo_lines(): Paint.Line[] {
  const reversed = { ...Paint.INK, v: true };
  return ART.map(([row, marks]) => {
    const cells = [...row.padEnd(LOGO_W)];
    const line: Paint.Line = [];
    cells.forEach((ch, k) => {
      const v    = marks[k] === "^";
      const last = line.at(-1);
      if (last !== undefined && last.s.v === v) {
        last.x += ch;
      } else {
        line.push(Paint.Run(ch, v ? reversed : Paint.INK));
      }
    });
    return line;
  });
}
