// Trusted test
// ============
// `bun test Trusted.test.ts`. A folder is trusted for its git repo's top,
// else for itself, its subfolders too, once kept; home's own folder, and
// each above it, is trusted for the run only, never kept; a project's own
// agents, commands and skills load only in a trusted folder.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-trusted-");
process.env.ILLI_DIR = DIR + "/illi";

const { Trusted } = await import("./Trusted.ts");
const { Custom } = await import("./Custom.ts");
const { Projects } = await import("../chat/Projects.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

test("a folder is trusted for its repo's top, else itself, its subfolders too, once kept", () => {
  const repo = Projects.real(DIR) + "/repo";
  fs.mkdirSync(repo + "/.git", { recursive: true });
  fs.mkdirSync(repo + "/src/deep", { recursive: true });
  fs.mkdirSync(DIR + "/loose/inner", { recursive: true });
  expect(Trusted.folder(repo + "/src/deep")).toBe(repo);
  expect(Trusted.folder(DIR + "/loose")).toBe(Projects.real(DIR) + "/loose");
  expect(Trusted.has(repo)).toBe(false);
  Trusted.trust(repo);
  expect([Trusted.has(repo), Trusted.has(repo + "/src"), Trusted.has(repo + "-other")]).toEqual([true, true, false]);
  expect(JSON.parse(fs.readFileSync(DIR + "/illi/trust.json", "utf8")).folders).toEqual([repo]);
});

test("home's own folder, and each above it, is trusted for the run, never kept", () => {
  const home = Projects.real(os.homedir());
  expect([Trusted.home(home), Trusted.home(path.dirname(home)), Trusted.home("/"), Trusted.home(home + "/app")]).toEqual([true, true, true, false]);
  Trusted.trust(home);
  Trusted.trust("/");
  expect([Trusted.has(home), Trusted.has("/"), Trusted.has(path.dirname(home))]).toEqual([true, true, false]);
  expect(Trusted.kept()).not.toContain(home);
  expect(Trusted.kept()).not.toContain("/");
});

test("a project's own agents, commands and skills load only in a trusted folder", () => {
  const app = Projects.real(DIR) + "/app";
  fs.mkdirSync(app + "/.illi/commands", { recursive: true });
  fs.writeFileSync(app + "/.illi/commands/hello.md", "Say hello.\n");
  expect(Custom.dirs(app, "commands")).not.toContain(app + "/.illi/commands");
  expect([...Custom.files(app, "commands").keys()]).not.toContain("hello");
  Trusted.trust(app);
  expect(Custom.dirs(app, "commands")).toContain(app + "/.illi/commands");
  expect([...Custom.files(app, "commands").keys()]).toContain("hello");
});
