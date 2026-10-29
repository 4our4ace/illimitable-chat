// Trust test
// ==========
// `bun test Trust.test.ts`. The question takes its keys (No lit first,
// Left and Right light the button that way, Enter takes the lit one, y
// and n, Esc exits; grabbed before the input's editing) and stands in
// the screen's middle, the logo over its card (none on a short screen,
// nor a narrow one), its keys on its top edge as many as fit, its
// buttons side by side (one over the other on a narrow screen), the lit
// one filled; the folder shows home as ~, and home's says it asks each
// time. A screen too short for the card keeps the folder, the buttons
// and both edges, its text cut; shorter still, its top goes first. From
// 11 columns on no row is wider than the screen, nor a button's place
// past its edge, the buttons short where the long ones won't fit. The
// pointer over a button lights it; a click on one takes it, a slip off
// it or the click that focused the window nothing. What is kept is
// Trusted.test.ts's.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-trust-");
process.env.ILLI_DIR = DIR + "/illi";

const { Trust } = await import("./Trust.ts");
const { LOGO_H, logo_lines } = await import("../ui/Logo.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// the rows' text, each row's pieces laid over one another
const text = (rows: any[]) => rows.map((r) => r.map((p: any) => " ".repeat(p.col) + p.line.map((x: any) => x.x).join("")).join("").trimEnd());

// f run on a screen cols by rows, till it's done
async function sized<T>(cols: number, rows: number, f: () => Promise<T>): Promise<T> {
  const was = [Object.getOwnPropertyDescriptor(process.stdout, "columns"), Object.getOwnPropertyDescriptor(process.stdout, "rows")];
  Object.defineProperty(process.stdout, "columns", { value: cols, configurable: true });
  Object.defineProperty(process.stdout, "rows", { value: rows, configurable: true });
  try {
    return await f();
  } finally {
    Object.defineProperty(process.stdout, "columns", was[0] ?? { value: undefined, configurable: true });
    Object.defineProperty(process.stdout, "rows", was[1] ?? { value: undefined, configurable: true });
  }
}

test("the question's keys: No lit first; Left and Right light that way, Up, Down and Tab the other; Enter takes the lit one; y, n; Esc and Ctrl+C exit", () => {
  const asked = { folder: "/w", kept: true, at: 0 };
  expect(Trust.key(asked, "Enter")).toBe(false);
  expect(Trust.key(asked, "Right")).toBeNull();
  expect(Trust.key(asked, "Right")).toBeNull();
  expect(asked.at).toBe(1);
  expect(Trust.key(asked, "Enter")).toBe(true);
  expect(Trust.key(asked, "Left")).toBeNull();
  expect(asked.at).toBe(0);
  expect(Trust.key(asked, "Down")).toBeNull();
  expect(Trust.key(asked, "Tab")).toBeNull();
  expect(asked.at).toBe(0);
  expect([Trust.key(asked, "y"), Trust.key(asked, "n"), Trust.key(asked, "Esc"), Trust.key(asked, "Ctrl+C"), Trust.key(asked, "x")]).toEqual([true, false, false, false, null]);
});

test("the question stands in the screen's middle, the logo over its card, the folder in it and both buttons side by side, the lit one filled; home's says it asks each time", () => {
  const laid  = Trust.laid({ folder: "/work/app", kept: true, at: 0 }, { w: 100, h: 30 });
  const lines = text(laid.rows);
  const used  = lines.map((l, k) => [l, k] as const).filter(([l]) => l !== "");
  expect(laid.rows.length).toBe(30);
  const logo = logo_lines().map((l) => l.map((r) => r.x).join("").trimEnd());
  expect(used.slice(0, LOGO_H).map(([l]) => l.trim())).toEqual(logo.map((l) => l.trim()));
  expect(lines[used[0][1] + LOGO_H]).toBe("");
  expect(lines.some((l) => l.includes("╭─ Trust this folder? · <- -> Enter · Esc exit ─"))).toBe(true);
  expect(lines.some((l) => l.includes("│   /work/app"))).toBe(true);
  const row = lines.findIndex((l) => l.includes("No, exit"));
  expect(lines[row]).toMatch(/ {2}No, exit {2} {3}\[ Yes, trust it \]/);
  expect(lines[row].trim().startsWith("│")).toBe(true);
  expect(laid.buttons.map((b) => [b.row, b.at])).toEqual([[row, 0], [row, 1]]);
  const lit = laid.rows[row][0].line.find((r: any) => r.x.includes("No, exit"));
  expect(lit?.s.v).toBe(true);
  const top = used[0][1];
  const bottom = 29 - used.at(-1)![1];
  expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1);
  expect(laid.rows[top][0].col).toBeGreaterThan(0);
  const home = text(Trust.laid({ folder: os.homedir() + "/code/app", kept: false, at: 1 }, { w: 100, h: 30 }).rows).join("\n");
  expect([home.includes("~/code/app"), home.includes("Your home folder")]).toEqual([true, true]);
});

test("on a screen too short for the logo and the card, the card alone, still in the middle", () => {
  const lines = text(Trust.laid({ folder: "/w", kept: true, at: 0 }, { w: 100, h: 16 }).rows);
  const used  = lines.filter((l) => l !== "");
  expect(used[0].trim().startsWith("╭─ Trust this folder?")).toBe(true);
  expect(lines.findIndex((l) => l !== "")).toBeGreaterThan(0);
});

test("on a narrow screen the buttons stand one over the other, each its own place, the card in the middle without the logo, its keys whole or left out", () => {
  const laid  = Trust.laid({ folder: "/w", kept: true, at: 1 }, { w: 40, h: 30 });
  const lines = text(laid.rows);
  const no    = lines.findIndex((l) => l.includes("No, exit"));
  const yes   = lines.findIndex((l) => l.includes("Yes, trust it"));
  expect(yes).toBe(no + 2);
  expect(laid.buttons.map((b) => [b.row, b.at])).toEqual([[no, 0], [yes, 1]]);
  expect(lines.every((l) => l.length <= 40)).toBe(true);
  const used = lines.filter((l) => l !== "");
  expect(used[0].trim()).toMatch(/^╭─ Trust this folder\? ─+╮$/);
  expect(used.every((l) => l.length - l.trimStart().length === 2 && l.length === 38)).toBe(true);
  const edge = text(Trust.laid({ folder: "/w", kept: true, at: 0 }, { w: 43, h: 30 }).rows).find((l) => l.includes("╭"))!;
  expect(edge.trim()).toMatch(/^╭─ Trust this folder\? · <- -> Enter ─+╮$/);
  expect(Trust.edge(10).map((r) => r.x).join("")).toBe(" Trust th…");
});

test("on any screen from 11 columns, no row is wider than it nor a button's place past its edge; both buttons show from 4 rows, short ones where the long won't fit", () => {
  for (let w = 11; w <= 80; w++) {
    for (let h = 4; h <= 30; h++) {
      const laid = Trust.laid({ folder: "/a/long/folder/name/that/wraps/over/lines", kept: h % 2 === 0, at: w % 2 }, { w, h });
      expect(text(laid.rows).every((l) => l.length <= w)).toBe(true);
      expect(laid.buttons.every((b) => b.col < b.to && b.to <= w)).toBe(true);
      expect(new Set(laid.buttons.map((b) => b.at)).size).toBe(2);
    }
  }
  const narrow = text(Trust.laid({ folder: "/w", kept: true, at: 0 }, { w: 16, h: 20 }).rows).join("\n");
  expect([narrow.includes("[ Yes ]"), narrow.includes("Yes, trust it")]).toEqual([true, false]);
  expect(Trust.cut([[{ x: "ab日本語", s: {} } as any], [{ x: "x", s: {} } as any]], 1, 4).map((l) => l.map((r) => r.x).join(""))).toEqual(["ab…"]);
});

test("on a screen too short for the card, its blank lines go, then its text from the end, the folder, the buttons and both edges kept", () => {
  const laid  = Trust.laid({ folder: "/work/app", kept: true, at: 0 }, { w: 60, h: 6 });
  const lines = text(laid.rows).map((l) => l.trim());
  expect(lines[0]).toStartWith("╭─ Trust this folder?");
  expect(lines[1]).toBe("│   /work/app                                          │");
  expect(lines[3]).toMatch(/… +│$/);
  expect(lines[4]).toMatch(/No, exit {5}\[ Yes, trust it \]/);
  expect(lines[5]).toStartWith("╰─");
  expect(laid.buttons.map((b) => [b.row, b.at])).toEqual([[4, 0], [4, 1]]);
  const least = Trust.laid({ folder: "/work/app", kept: true, at: 0 }, { w: 60, h: 2 });
  expect(text(least.rows).map((l) => l.trim().slice(0, 2))).toEqual(["│ ", "╰─"]);
  expect(least.buttons.map((b) => b.at)).toEqual([0, 1]);
});

test("the question grabs its keys before the input's editing, and lets go once answered, the mouse given back", async () => {
  const on  = () => {};
  const scr: any = { left: true, grab: null, type: undefined, on, point: { row: 0, col: 0 } };
  const yes = Trust.ask(scr, { folder: "/w", kept: true, at: 0 });
  expect(scr.grab("Right")).toBe(true);
  expect(scr.grab("Enter")).toBe(true);
  expect(await yes).toBe(true);
  expect([scr.grab, scr.type, scr.on]).toEqual([null, undefined, on]);
});

test("the pointer over a button lights it; a click on one takes it, a slip on it too; let go off it, or the click that focused the window, nothing", async () => {
  const scr: any = { left: true, grab: null, type: undefined, on: () => {}, point: { row: 0, col: 0 } };
  const asked = { folder: "/w", kept: true, at: 0 };
  let answer = null as boolean | null;
  await sized(100, 30, async () => {
    void Trust.ask(scr, asked).then((yes) => (answer = yes));
    const [no, yes] = Trust.laid(asked, { w: 100, h: 30 }).buttons;
    const at = (b: any, dx = 0) => (scr.point = { row: b.row, col: b.col + dx });
    at(yes, 1);
    scr.on("Move");
    expect(asked.at).toBe(1);
    at(no, 1);
    scr.focusing = true;
    scr.on("Press");
    scr.on("Release");
    scr.focusing = false;
    at(yes, 1);
    scr.on("Press");
    at(no, 1);
    scr.on("Release");
    await Promise.resolve();
    expect(answer).toBeNull();
    at(yes, 1);
    scr.on("Press");
    at(yes, 3);
    scr.on("Drag");
    scr.on("Release");
    await Promise.resolve();
    expect(answer).toBe(true);
  });
});
