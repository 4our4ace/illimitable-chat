// Paint test
// ==========
// `bun test Paint.test.ts`. A row's lines are laid out once per width
// and look: the background told again as it was lays nothing out anew,
// another lays all of it out again.

import { expect, test } from "bun:test";
import * as Paint from "./Paint.ts";
import type * as View from "./View.ts";

test("the background told again as it was lays nothing out anew; another, all", () => {
  const rows: View.Row[] = [{ $: "Sum", id: 7, n: 2, text: "read the logs", call: null, kind: null }];
  expect(Paint.paint_canvas("#101418")).toBe(true);
  const lit = Paint.rows_lines(rows, 60);
  expect(Paint.paint_canvas("#101418")).toBe(false);
  expect(Paint.rows_lines(rows, 60)[1]).toBe(lit[1]);
  expect(Paint.paint_canvas("#fdf6e3")).toBe(true);
  expect(Paint.rows_lines(rows, 60)[1]).not.toBe(lit[1]);
});
