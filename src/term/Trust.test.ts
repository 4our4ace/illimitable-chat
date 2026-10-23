// Trust test
// ==========
// `bun test Trust.test.ts`. The question takes its keys (No lit first,
// Enter takes the lit option, y and n, Esc exits; grabbed before the
// input's editing) and stands in the screen's middle; home's says it
// asks each time. What is kept is Trusted.test.ts's.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-trust-");
process.env.ILLI_DIR = DIR + "/illi";

const { Trust } = await import("./Trust.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

test("the question's keys: No lit first; Up, Down and Tab move; Enter takes the lit one; y, n; Esc and Ctrl+C exit", () => {
  const asked = { folder: "/w", kept: true, at: 0 };
  expect(Trust.key(asked, "Enter")).toBe(false);
  expect(Trust.key(asked, "Down")).toBeNull();
  expect(Trust.key(asked, "Enter")).toBe(true);
  expect(Trust.key(asked, "Tab")).toBeNull();
  expect(asked.at).toBe(0);
  expect([Trust.key(asked, "y"), Trust.key(asked, "n"), Trust.key(asked, "Esc"), Trust.key(asked, "Ctrl+C"), Trust.key(asked, "x")]).toEqual([true, false, false, false, null]);
});

test("the question stands in the screen's middle, the folder and both options on it; home's says it asks each time", () => {
  const text = (rows: any[]) => rows.map((r) => r.map((p: any) => p.line.map((x: any) => x.x).join("")).join(""));
  const rows = Trust.rows({ folder: "/work/app", kept: true, at: 0 }, { w: 100, h: 30 });
  const lines = text(rows);
  const used = lines.map((l, k) => [l, k] as const).filter(([l]) => l !== "");
  expect(rows.length).toBe(30);
  expect(lines).toContain("/work/app");
  expect(lines).toContain("❯ No, exit");
  expect(lines).toContain("  Yes, I trust this folder");
  const top = used[0][1];
  const bottom = 29 - used.at(-1)![1];
  expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1);
  expect(rows[top][0].col).toBeGreaterThan(0);
  expect(text(Trust.rows({ folder: "/home/x", kept: false, at: 1 }, { w: 100, h: 30 })).join("\n")).toContain("asks each time");
});

test("the question grabs its keys before the input's editing, and lets go once answered", async () => {
  const scr: any = { left: true, grab: null, type: undefined };
  const yes = Trust.ask(scr, { folder: "/w", kept: true, at: 0 });
  expect(scr.grab("Down")).toBe(true);
  expect(scr.grab("Enter")).toBe(true);
  expect(await yes).toBe(true);
  expect([scr.grab, scr.type]).toEqual([null, undefined]);
});
