// Md test
// =======
// `bun test Md.test.ts`. How the little markdown of a message reads.

import { expect, test } from "bun:test";
import * as Md from "./Md.ts";

const kinds = (src: string) => Md.md_parse(src).map((b) => (b.$ === "List" ? "List:" + (b.k ? "1." : "-") + b.x.length : b.$));

// a list is of one kind: numbered items after bullets start a list of
// their own, and bullets after numbered ones
test("a list holds items of one kind", () => {
  expect(kinds("- a\n  more\n- b\n1. c\n2. d\n- e")).toEqual(["List:-2", "List:1.2", "List:-1"]);
});

// a rule ends the paragraph above it, as a heading or a list does
test("a rule right under a paragraph is a rule", () => {
  expect(kinds("para\n---\nnext")).toEqual(["Para", "Rule", "Para"]);
  expect(kinds("a\n|x|y|\n|-|-|\n|1|2|")).toEqual(["Para", "Tabl"]);
  expect(kinds("a\n| not a table |\nb")).toEqual(["Para"]);
});
