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
// its own, and its models' windows, as its catalog would)

import * as fs from "node:fs";
import * as os from "node:os";

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
