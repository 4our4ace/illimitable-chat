// The providers' lists, and the rest of illi kept from naming one: no
// file outside src/providers holds a provider's id as a string, uses a
// provider's code by its namespace, or imports anything of
// src/providers but its lists and types (Provider.ts, Providers.ts,
// Vendors.ts, Logins.ts). Each provider's facts, code and page agree:
// its code and facts by one id, a call run on a wire or by its own
// program (one of the two), an API key's provider able to check a key,
// a plan's page in /login, its default picks its own models.
// `bun test Providers.test.ts`.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

const { FACTS, Vendors } = await import("./Vendors.ts");
const { Providers } = await import("./Providers.ts");
const { Logins } = await import("./Logins.ts");

const SRC = path.join(import.meta.dir, "..");

// every source file of illi's but the providers' and the tests
function core(dir = SRC): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const at = path.join(dir, e.name);
    if (e.isDirectory()) {
      return at === path.join(SRC, "providers") ? [] : core(at);
    }
    return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [at] : [];
  });
}

// a file's code: its lines but those that are comments alone
function code(file: string): string[] {
  return fs.readFileSync(file, "utf8").split("\n").filter((line) => !/^\s*\/\//.test(line));
}

test("no file outside src/providers names a provider: its id, its code's namespace, its folder", () => {
  const ids     = FACTS.map((f) => f.id);
  const named   = new RegExp("[\"'`](" + ids.map((id) => id.replace(/[-]/g, "\\-")).join("|") + ")([\"'`:])");
  const spaces  = fs.readdirSync(path.join(SRC, "providers"), { withFileTypes: true }).filter((e) => e.isDirectory()).flatMap((e) => fs.readdirSync(path.join(SRC, "providers", e.name)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "Facts.ts" && f !== "Login.ts").map((f) => f.slice(0, -3)));
  const used    = new RegExp("(?<![\\w\"'.])(" + spaces.join("|") + ")\\.[a-z_]");
  const imports = /from "[^"]*providers\/(?!(Provider|Providers|Vendors|Logins)\.ts")[^"]*"/;
  const found   = core().flatMap((file) => code(file).flatMap((line, k) => (named.test(line) || used.test(line) || imports.test(line) ? [path.relative(SRC, file) + ":" + (k + 1) + ": " + line.trim()] : [])));
  expect(spaces.length).toBeGreaterThan(0);
  expect(found).toEqual([]);
});

test("each provider's facts, code and page agree", () => {
  const ids = FACTS.map((f) => f.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(Providers.all().map((p) => p.facts.id)).toEqual(ids);
  for (const f of FACTS) {
    const p = Providers.of(f.id)!;
    expect([f.id, p.facts === f, (p.wire === undefined) !== (p.ask === undefined)]).toEqual([f.id, true, true]);
    expect([f.id, f.key !== undefined ? p.check !== undefined : Logins.of(f.id) !== undefined]).toEqual([f.id, true]);
    expect([f.id, f.accounts === "folders" ? f.folders !== undefined : true, f.accounts === "keys" ? f.key !== undefined : true]).toEqual([f.id, true, true]);
    for (const pick of [f.defaults.pick, f.defaults.compactor]) {
      const [vendor, model] = pick.split(":");
      expect([pick, vendor, f.models.some((m) => m.label === model)]).toEqual([pick, f.id, true]);
    }
  }
  // a maker's providers say it the same way, and one of them falls back
  for (const f of FACTS) {
    expect(FACTS.filter((o) => o.maker.name === f.maker.name).every((o) => o.maker.offers === f.maker.offers && o.maker.order === f.maker.order)).toBe(true);
  }
  expect(FACTS.filter((f) => f.fallback).length).toBe(1);
  expect(Vendors.fallback().fallback).toBe(true);
});

test("what /login connects, in words, from the makers", () => {
  expect([Vendors.ways(), Vendors.list(["A"], "or"), Vendors.list(["A", "B", "C"], "and")]).toEqual(["your ChatGPT, Claude or Gemini plan, or an API key", "A", "A, B and C"]);
});
