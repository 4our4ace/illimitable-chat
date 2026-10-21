// Rules test
// ==========
// `bun test Rules.test.ts`. The user's rules in every system prompt: their
// RULES.md (named even while there is none, so illi knows where it goes;
// a missing one is no rules, never an error; a long one cut, saying so),
// then the project's: from the repo's top (the folder holding .git, else
// the working folder alone) down to the working folder, in each folder
// its AGENTS.md, else its CLAUDE.md.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-rules-");
process.env.ILLI_DIR = DIR + "/illi";
delete process.env.ILLI_RULES;

const { Tools } = await import("./Tools.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a file written, its folders made
function write(file: string, text: string): void {
  fs.mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(file, text);
}

const OWN = DIR + "/illi/RULES.md";

test("no RULES.md and no project files: the rules name where RULES.md goes, and say none yet", () => {
  fs.mkdirSync(DIR + "/bare", { recursive: true });
  expect(Tools.rules(DIR + "/bare")).toBe("# The user's rules\n\nFor every project, in " + OWN + ":\n\n(none yet)");
  expect(Tools.system("head", DIR + "/bare").startsWith("head\n\n# The user's rules\n\n")).toBe(true);
});

test("RULES.md goes in whole; one too long is cut, saying so", () => {
  write(OWN, "- answer in German\n");
  expect(Tools.rules(DIR + "/bare")).toContain(OWN + ":\n\n- answer in German");
  write(OWN, "x".repeat(50000));
  expect(Tools.rules(DIR + "/bare")).toContain("(cut here: only its first 40 KB are read)");
  fs.rmSync(OWN);
});

test("a repo's AGENTS.md (else CLAUDE.md) in each folder from its top down to the working folder", () => {
  const top = DIR + "/repo";
  fs.mkdirSync(top + "/.git", { recursive: true });
  write(top + "/AGENTS.md", "root rules");
  write(top + "/CLAUDE.md", "not read: AGENTS.md is there");
  write(top + "/pkg/CLAUDE.md", "pkg rules");
  write(top + "/other/AGENTS.md", "not on the way");
  const cwd = top + "/pkg/sub";
  fs.mkdirSync(cwd, { recursive: true });
  expect(Tools.project(cwd)).toEqual([top + "/AGENTS.md", top + "/pkg/CLAUDE.md"]);
  const rules = Tools.rules(cwd);
  expect(rules).toContain("This project's, in AGENTS.md:\n\nroot rules\n\nThis project's, in pkg/CLAUDE.md:\n\npkg rules");
  expect(rules).not.toContain("not read");
  expect(rules).not.toContain("not on the way");
});

test("out of a repo, only the working folder's own file", () => {
  write(DIR + "/loose/AGENTS.md", "a folder above");
  fs.mkdirSync(DIR + "/loose/child", { recursive: true });
  expect(Tools.project(DIR + "/loose/child")).toEqual([]);
  expect(Tools.project(DIR + "/loose")).toEqual([DIR + "/loose/AGENTS.md"]);
});
