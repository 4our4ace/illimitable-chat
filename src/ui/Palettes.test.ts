// Palettes test
// =============
// `bun test Palettes.test.ts`. Every palette sets each of a reply's 20
// slots to a #rrggbb color and names its background; mono sets none,
// the terminal's own ink. Each slot not faint (comments, quotes, rules
// draw faint) reads on its background: 2.9:1 at least, a hair under the
// 3:1 large text asks, so a scheme's own accent or comment tone that
// sits there is kept rather than swapped for one it never uses.

import { expect, test } from "bun:test";
import { CANVAS, PALETTES } from "./Palettes.ts";

const SLOTS = [
  "accent", "heading", "tableHeader", "strong", "emphasis", "inlineCode", "codeText", "codeCommand", "codeFlag", "codeString",
  "codeComment", "link", "path", "number", "quote", "rule", "tableRule", "bullet", "diagram", "diagramText",
];
const FAINT = ["codeComment", "quote", "rule", "tableRule"];
const HEX   = /^#[0-9a-f]{6}$/;

// a color's relative luminance (WCAG 2)
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// two colors' contrast ratio, 1 to 21
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("every palette sets each slot and its background; mono none", () => {
  for (const [name, slots] of Object.entries(PALETTES)) {
    expect(CANVAS[name as keyof typeof CANVAS]).toMatch(HEX);
    if (name === "mono") {
      expect(slots).toEqual({});
      continue;
    }
    expect(Object.keys(slots).sort()).toEqual([...SLOTS].sort());
    for (const color of Object.values(slots)) {
      expect(color).toMatch(HEX);
    }
  }
});

test("each slot not faint reads on its palette's background", () => {
  const low = Object.entries(PALETTES).flatMap(([name, slots]) =>
    Object.entries(slots as Record<string, string>)
      .filter(([slot, color]) => !FAINT.includes(slot) && contrast(color, CANVAS[name as keyof typeof CANVAS]) < 2.9)
      .map(([slot, color]) => name + " " + slot + " " + color));
  expect(low).toEqual([]);
});

// the faint ones still differ from their background
test("faint slots are not their background", () => {
  for (const [name, slots] of Object.entries(PALETTES)) {
    for (const slot of FAINT) {
      const color = (slots as Record<string, string>)[slot];
      if (color !== undefined) {
        expect(contrast(color, CANVAS[name as keyof typeof CANVAS])).toBeGreaterThan(1.2);
      }
    }
  }
});
