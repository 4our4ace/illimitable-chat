// Permissions test
// ================
// `bun test Permissions.test.ts`. The permission file: none is no rules
// and no grants; the rules and a project's grants read, a hand edit seen
// at the next read; a file that won't read, or a rule that isn't allow,
// ask or deny, said (never taken as no rules); a grant kept adds to what
// the file has (others' grants, its rules, keys illi doesn't know), one
// let go leaves the rest; a file that won't read is never written over.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import { Permissions } from "./Permissions.ts";

const DIR  = fs.mkdtempSync(os.tmpdir() + "/illi-permissions-");
const FILE = DIR + "/sub/permissions.json";

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

const write = (data: unknown) => {
  fs.mkdirSync(DIR + "/sub", { recursive: true });
  fs.writeFileSync(FILE, typeof data === "string" ? data : JSON.stringify(data));
};

test("none: no rules, no grants; grants kept for a project, the file made", () => {
  expect(Permissions.read(FILE, "/w/app")).toEqual({ rules: {}, granted: [] });
  expect(Permissions.grant(FILE, "/w/app", ["shell:git push *"])).toBeNull();
  expect(Permissions.grant(FILE, "/w/app", ["shell:git push *", "read:/w/lib/*"])).toBeNull();
  expect(Permissions.read(FILE, "/w/app")).toEqual({ rules: {}, granted: ["shell:git push *", "read:/w/lib/*"] });
  expect(Permissions.read(FILE, "/w/other")).toEqual({ rules: {}, granted: [] });
  expect(fs.readdirSync(DIR + "/sub")).toEqual(["permissions.json"]);
});

test("the rules read, a hand edit seen at once; a grant keeps what else the file has; one let go leaves the rest", () => {
  write({ rules: { shell: { "git push *": "ask" } }, projects: { "/w/x": { granted: ["shell=ls"] } }, mine: 1 });
  expect(Permissions.read(FILE, "/w/x")).toEqual({ rules: { shell: { "git push *": "ask" } }, granted: ["shell=ls"] });
  write({ rules: { shell: { "git push *": "deny", "bun *": "allow" } }, projects: { "/w/x": { granted: ["shell=ls"] } }, mine: 1 });
  expect(Permissions.read(FILE, "/w/x")).toMatchObject({ rules: { shell: { "git push *": "deny", "bun *": "allow" } } });
  expect(Permissions.grant(FILE, "/w/y", ["mcp:mcp__gh__merge"])).toBeNull();
  const kept = JSON.parse(fs.readFileSync(FILE, "utf8"));
  expect(kept).toEqual({ rules: { shell: { "git push *": "deny", "bun *": "allow" } }, projects: { "/w/x": { granted: ["shell=ls"] }, "/w/y": { granted: ["mcp:mcp__gh__merge"] } }, mine: 1 });
  expect(Permissions.revoke(FILE, "/w/x", "shell=ls")).toBeNull();
  expect(Permissions.read(FILE, "/w/x")).toMatchObject({ granted: [] });
  expect(Permissions.read(FILE, "/w/y")).toMatchObject({ granted: ["mcp:mcp__gh__merge"] });
});

test("a file that won't read, or a rule that isn't allow, ask or deny, is said; such a file is never written over", () => {
  write("{ \"rules\": ");
  expect(Permissions.read(FILE, "/w/x")).toStartWith(FILE + ": ");
  expect(Permissions.grant(FILE, "/w/x", ["shell=ls"])).toStartWith(FILE + ": ");
  expect(fs.readFileSync(FILE, "utf8")).toBe("{ \"rules\": ");
  write({ rules: { shell: { "git push *": "dney" } } });
  expect(Permissions.read(FILE, "/w/x")).toBe(FILE + ": rules.shell[\"git push *\"] is \"dney\": allow, ask or deny");
  write({ rules: { bash: {} } });
  expect(Permissions.read(FILE, "/w/x")).toBe(FILE + ": rules.bash: no such kind (shell, read, write, mcp)");
  write([1]);
  expect(Permissions.read(FILE, "/w/x")).toBe(FILE + ": not a JSON object");
  write("");
  expect(Permissions.read(FILE, "/w/x")).toEqual({ rules: {}, granted: [] });
});
