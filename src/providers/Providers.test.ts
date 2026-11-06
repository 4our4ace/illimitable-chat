// The providers' lists, and the rest of illi kept from naming one: no
// file outside src/providers holds a provider's id as a string, uses a
// provider's code by its namespace, or imports anything of
// src/providers but its lists and types (Provider.ts, Providers.ts,
// Vendors.ts, Logins.ts). Each provider's facts, code and page agree:
// its code and facts by one id, a call run on a wire or by its own
// program (one of the two), an API key's provider able to check a key,
// a plan's page in /login, its default picks its own models, each named
// by family (opus-*: the newest of it), never by a version, or a rule over
// its models (the cheapest, say) that gives one of them.
// `bun test Providers.test.ts`.

import { expect, test } from "bun:test";
import type { Vendor } from "./Vendors.ts";
import * as fs from "node:fs";
import * as path from "node:path";

const { FACTS, Vendors } = await import("./Vendors.ts");
const { Providers } = await import("./Providers.ts");
const { Logins } = await import("./Logins.ts");
const { Pick } = await import("../ai/Pick.ts");

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
    // named as a note names it, its title (a head over its models) the rest
    expect([f.id, /^(?:the|your) \S/.test(f.name), Pick.title(f.id as Vendor)]).toEqual([f.id, true, f.name.replace(/^(?:the|your) /, "")]);
    for (const rule of [f.defaults.pick, f.defaults.compactor]) {
      const pick = typeof rule === "string" ? rule : rule(f.models);
      const [vendor, model] = pick.split(":");
      const newest = model.includes("*") ? Pick.newest(f.id as Vendor, model, f.models.map((m) => m.label)) : model;
      const named  = typeof rule !== "string" || (model.includes("*") && !/\d/.test(model));
      expect([pick, vendor, named, f.models.some((m) => m.label === newest)]).toEqual([pick, f.id, true, true]);
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
  expect([Vendors.ways(), Vendors.list(["A"], "or"), Vendors.list(["A", "B", "C"], "and")]).toEqual(["your ChatGPT, Claude or Google AI plan, or an API key", "A", "A, B and C"]);
});
