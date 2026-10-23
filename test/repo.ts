// Test folders
// ============
// The folders a test file works in, made in the system's temp folder
// (never in this checkout) and removed after its tests (afterAll), so no
// run leaves them behind. temp_repo: a throwaway git repository (git
// init, no remote) for a test that opens a chat or runs tool calls: its
// shell, git and file calls act on it, never on the repository the tests
// run from, and with no remote (and the preload's GIT_ALLOW_PROTOCOL) a
// push has nowhere to go. Both give the folder's real path.

import { afterAll } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

// a temp folder, its name starting with `name`, removed after the file's
// tests
export function temp_dir(name: string): string {
  const dir = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + "/" + name));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// a temp git repository, no remote, removed after the file's tests. git
// runs with this process's environment (the preload's: no repository
// variables, so GIT_DIR can't point it at another repository)
export function temp_repo(name: string): string {
  const dir = temp_dir(name);
  const git = Bun.spawnSync(["git", "init", "-q", dir], { env: process.env, stdout: "ignore", stderr: "pipe" });
  if (git.exitCode !== 0) {
    throw new Error("git init " + dir + ": " + git.stderr.toString());
  }
  return dir;
}
