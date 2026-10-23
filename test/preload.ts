// Test preload
// ============
// Before any test file: illi's folder and opencode's data (its login)
// in a temp folder of this run's process, so no test, however it is run
// (one file, all at once without --isolate, without the test script's
// variables), reads or writes the user's own ~/.illi, login or the skills
// shared with other agents (~/.agents). A test
// file sets its own ILLI_DIR over this one as it starts. The folders of
// runs ended are removed as the next one starts. No browser opens
// (Browser.ts: BROWSER none), whatever a test does. The vendors are the
// test script's while none are set (a file run alone runs as in the
// suite: on claude-api, whose windows are built in; a file on ChatGPT sets
// its own, and its models' windows, as its catalog would).
// git can't reach another repository nor leave the machine: its
// repository variables (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...: what
// `git rev-parse --local-env-vars` lists, set as a git hook runs the
// suite) are cleared, so a test's git acts on the folder it runs in (a
// throwaway repository: repo.ts), and GIT_ALLOW_PROTOCOL allows only
// file://, so no push, fetch or clone goes over the network, even from a
// real repository. Bun gives a child the environment it started with
// unless the spawn passes `env`: illi's shell tool, hooks and MCP servers
// pass process.env, so these reach them (test/repo.test.ts)

import * as fs from "node:fs";
import * as os from "node:os";

// git's repository variables (git rev-parse --local-env-vars, and those
// older gits had), and a config given by count (GIT_CONFIG_KEY_0, ...)
const GIT_LOCAL = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT", "GIT_OBJECT_DIRECTORY", "GIT_DIR",
  "GIT_WORK_TREE", "GIT_IMPLICIT_WORK_TREE", "GIT_GRAFT_FILE", "GIT_INDEX_FILE", "GIT_NO_REPLACE_OBJECTS", "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX", "GIT_SHALLOW_FILE", "GIT_COMMON_DIR", "GIT_INTERNAL_SUPER_PREFIX",
];
for (const name of Object.keys(process.env)) {
  if (GIT_LOCAL.includes(name) || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(name)) {
    delete process.env[name];
  }
}
process.env.GIT_ALLOW_PROTOCOL = "file";

const TEMP = os.tmpdir();
const DIR  = TEMP + "/illi-test-" + process.pid;

for (const name of fs.readdirSync(TEMP).filter((n) => /^illi-test-\d+$/.test(n))) {
  if (!alive(Number(name.slice(10)))) {
    fs.rmSync(TEMP + "/" + name, { recursive: true, force: true });
  }
}
fs.mkdirSync(DIR, { recursive: true });
process.env.ILLI_DIR        = DIR + "/illi";
process.env.XDG_DATA_HOME   = DIR + "/data";
process.env.ILLI_AGENTS_DIR = DIR + "/agents";
process.env.BROWSER         = "none";
process.env.ILLI_VENDORS   ??= "claude-api";
process.env.ILLI_PICK      ??= "claude-api:sonnet-5.5:medium:slow";
process.env.ILLI_COMPACTOR ??= "claude-api:haiku-5.5:high:slow";

// whether a process runs
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
