// Test repositories test
// ======================
// `bun test test/repo.test.ts`. What keeps the suite off the repository
// it runs from and off the network (preload.ts, repo.ts): a test's
// repository is new, in the temp folder outside this checkout, with no
// remote; git's repository variables are cleared (a git hook running the
// suite sets them), in this process and in a shell illi runs; a push
// over ssh or https, git's own or one through illi's shell tool (auto
// mode, where a plain push runs unasked), fails with "transport not
// allowed" before it contacts anything.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { temp_dir, temp_repo } from "./repo.ts";

process.env.ILLI_DIR = temp_dir("illi-repo-");

const { Tools } = await import("../src/tools/Tools.ts");

const CHECKOUT = fs.realpathSync(path.join(import.meta.dir, ".."));
const REPO     = temp_repo("illi-repo-work-");

// git in a folder, with this process's environment (the preload's)
function git(cwd: string, ...args: string[]): { code: number; out: string } {
  const p = Bun.spawnSync(["git", ...args], { cwd, env: process.env, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: (p.stdout.toString() + p.stderr.toString()).trim() };
}

// the tools of a chat on the throwaway repository, in the default mode,
// no one there to ask (a question: a no, said so)
const ask   = async () => ({ yes: false, always: false, said: "No one is at illi's screen to ask, so it isn't allowed." });
const tools = { mem: null as any, agents: new Map(), perm: { mode: null, allowed: [], refused: [], pending: new Map() }, url: "", cwd: REPO, hooks: { main: () => null, ask, change: () => {}, stop: () => {} } as any, gone: [], steps: new Map(), given: new Map() };
const shell = (command: string) => Tools.call(tools, "main", "shell", { command }, new AbortController().signal);

test("a test's repository is new, in the temp folder outside this checkout, its own top, with no remote", () => {
  expect(REPO.startsWith(fs.realpathSync(os.tmpdir()) + "/")).toBe(true);
  expect(REPO.startsWith(CHECKOUT + "/") || CHECKOUT.startsWith(REPO + "/")).toBe(false);
  expect(git(REPO, "rev-parse", "--show-toplevel")).toEqual({ code: 0, out: REPO });
  expect(git(REPO, "remote")).toEqual({ code: 0, out: "" });
  expect(git(REPO, "rev-list", "--all")).toEqual({ code: 0, out: "" });
  expect(fs.readdirSync(REPO)).toEqual([".git"]);
});

test("git's repository variables are cleared, here and in a shell illi runs; the protocol allowed is file alone, there too", async () => {
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT", "GIT_PREFIX"]) {
    expect(process.env[name]).toBeUndefined();
  }
  expect(process.env.GIT_ALLOW_PROTOCOL).toBe("file");
  const out = await shell("echo \"${GIT_DIR-none} ${GIT_WORK_TREE-none} ${GIT_INDEX_FILE-none} $GIT_ALLOW_PROTOCOL\"; git rev-parse --show-toplevel");
  expect(out).toMatchObject({ text: expect.stringMatching(new RegExp("^none none none file\n" + REPO + "\n\\(exit 0 in ")), fail: false });
});

test("a push over ssh or https fails before it contacts anything: git's own, and one through illi's shell tool, unasked", async () => {
  expect(git(REPO, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "x").code).toBe(0);
  for (const url of ["https://example.invalid/x.git", "ssh://git@example.invalid/x.git", "git@example.invalid:x.git"]) {
    const got = git(REPO, "push", url, "HEAD");
    expect([got.code, got.out]).toEqual([128, "fatal: transport '" + (url.startsWith("https") ? "https" : "ssh") + "' not allowed"]);
  }
  expect(git(REPO, "fetch", "https://example.invalid/x.git").out).toBe("fatal: transport 'https' not allowed");
  const https = await shell("git push https://example.invalid/x.git HEAD");
  const ssh   = await shell("git push git@example.invalid:x.git HEAD");
  expect(https).toMatchObject({ text: expect.stringMatching(new RegExp("^fatal: transport 'https' not allowed\n\\(exit 128 in ")), fail: true });
  expect(ssh).toMatchObject({ text: expect.stringMatching(new RegExp("^fatal: transport 'ssh' not allowed\n\\(exit 128 in ")), fail: true });
  expect(await shell("git push --force git@example.invalid:x.git HEAD")).toMatchObject({ text: expect.stringMatching(new RegExp("^fatal: transport 'ssh' not allowed\n\\(exit 128 in ")), fail: true });
  expect(fs.readdirSync(REPO)).toEqual([".git"]);
});
