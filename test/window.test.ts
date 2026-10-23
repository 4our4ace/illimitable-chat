// Window test
// ===========
// `bun test window.test.ts`. The real illi, end to end, no network: on a
// terminal (a PTY standing in for it) it runs under a window, whose modes
// come on once its profile's screen is up and go off as it quits; from a
// pipe, alone, as before.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import { MODES_END, RESET, WINDOW_ON } from "../src/ui/Modes.ts";

const DIR  = fs.mkdtempSync(os.tmpdir() + "/illi-window-e2e-");
const ROOT = DIR + "/illi";
const HERE = DIR + "/project";
const MAIN = new URL("../src/main.ts", import.meta.url).pathname;
fs.mkdirSync(ROOT + "/profiles/work", { recursive: true });
fs.mkdirSync(HERE);
fs.writeFileSync(ROOT + "/trust.json", JSON.stringify({ folders: [fs.realpathSync(HERE)] }));

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// illi's environment: the temp root, Claude's API without a key (no call
// is made), no update, no browser
const ENV: Record<string, string> = { ...(process.env as Record<string, string>), ILLI_DIR: ROOT, ILLI_VENDORS: "claude-api", ILLI_PICK: "claude-api:sonnet-5.5:medium:slow", ILLI_COMPACTOR: "claude-api:haiku-5.5:high:slow", ILLI_AUTOUPDATE: "off", BROWSER: "none" };
delete ENV.ANTHROPIC_API_KEY;
delete ENV.ILLI_PROFILE;
delete ENV.ILLI_WINDOW;

// illi on a terminal: its output so far (escapes kept), a wait for a text
// in it (n times), keys typed
const start = (cols = 120, rows = 36) => {
  let out = "";
  const proc = Bun.spawn([process.execPath, MAIN], { cwd: HERE, env: ENV, terminal: { cols, rows, data: (_t, d) => (out += Buffer.from(d).toString("utf8")) } });
  const seen = async (text: string, n = 1, ms = 10000) => {
    for (let k = 0; k < ms / 20 && out.split(text).length - 1 < n; k++) {
      await Bun.sleep(20);
    }
    return out.split(text).length - 1 >= n;
  };
  return { proc, out: () => out, seen, type: (keys: string) => proc.terminal!.write(keys) };
};

test("on a terminal, illi runs under a window: its modes on once the screen is up, off as illi quits", async () => {
  const illi = start();
  expect(await illi.seen("auto mode")).toBe(true);
  expect(illi.out()).toContain(WINDOW_ON + RESET);
  illi.type("\x04");
  expect(await illi.proc.exited).toBe(0);
  expect(illi.out().endsWith(MODES_END)).toBe(true);
  illi.proc.terminal!.close();
});

test("from a pipe, illi runs alone, as before", async () => {
  const proc = Bun.spawn([process.execPath, MAIN], { cwd: HERE, env: ENV, stdin: new Blob([""]), stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  expect(out).not.toContain("\x1b");
});
