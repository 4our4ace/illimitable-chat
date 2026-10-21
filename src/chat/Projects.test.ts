// Projects test
// =============
// `bun test Projects.test.ts`. A git repo is a project, by its top
// folder's path, from any folder in it; two copies of one repo are two
// projects; outside any repo, and in a home folder that is a repo, home.
// A project's code is short and the same each time.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + "/illi-projects-"));
process.env.ILLI_DIR = DIR + "/illi";

const { Projects } = await import("./Projects.ts");
const { HOME } = await import("./Store.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a folder, made
function dir(rel: string): string {
  fs.mkdirSync(DIR + "/" + rel, { recursive: true });
  return DIR + "/" + rel;
}

test("a git repo is a project by its top folder's path, from any folder in it; two copies are two projects", () => {
  dir("code/app/.git");
  dir("code/app-copy/.git");
  const app = Projects.place(dir("code/app/src/deep"));
  expect(app).toEqual({ key: "git:" + DIR + "/code/app", name: "app-" + Projects.code(DIR + "/code/app"), path: DIR + "/code/app" });
  expect(Projects.place(DIR + "/code/app")).toEqual(app);
  expect(Projects.place(DIR + "/code/app-copy").key).not.toBe(app.key);
  expect(Projects.code(DIR + "/code/app")).toMatch(/^[0-9a-z]{6}$/);
  expect(Projects.lock(app.path)).toMatch(/^[0-9a-z]{12}$/);
  expect(Projects.lock(app.path)).not.toBe(Projects.lock(DIR + "/code/app-copy"));
});

test("a worktree's or submodule's .git file counts as a repo too", () => {
  dir("code/tree");
  fs.writeFileSync(DIR + "/code/tree/.git", "gitdir: ../app/.git/worktrees/tree\n");
  expect(Projects.place(dir("code/tree/lib")).path).toBe(DIR + "/code/tree");
});

test("outside any repo, and in a home folder that is a repo, home", () => {
  const home = dir("home");
  expect(Projects.place(dir("loose/notes"), home)).toEqual(HOME);
  dir("home/.git");
  expect(Projects.place(dir("home/Downloads"), home)).toEqual(HOME);
  expect(Projects.lock(HOME.path)).toBe("home");
});
