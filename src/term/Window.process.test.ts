// Window process test
// ===================
// `bun test Window.process.test.ts`. The window run for real, in a PTY
// standing in for the person's terminal, its members a few lines of Bun
// speaking the wire: a member runs on a PTY of the terminal's size and
// follows its resizes; a switch starts the other profile, and back shows
// the first again; a quit ends both and the window exits with the shown
// one's code, the modes off; a 1 MB paste reaches the member once, whole;
// a hangup of the window ends every member; the window killed, no member
// outlives it.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import { MODES_END, WINDOW_ON } from "../ui/Modes.ts";

const DIR    = fs.mkdtempSync(os.tmpdir() + "/illi-window-");
const WINDOW = new URL("./Window.ts", import.meta.url).pathname;
const WIRE   = new URL("./Wire.ts", import.meta.url).pathname;
const FAKE   = DIR + "/member.ts";

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a member: says hello and up, then its profile and size; its size again
// on each resize; the others open on each roster; keys: s hides to work,
// b back to default, q quits (exit code 3), the bytes of a paste counted
// once it ends; `end` exits 0, `show` shows
fs.writeFileSync(FAKE, `
import * as fs from "node:fs";
import { wire_cut, wire_env_parse, wire_frame } from ${JSON.stringify(WIRE)};
const env = wire_env_parse(process.env.ILLI_WINDOW);
const profile = process.env.ILLI_PROFILE || "default";
const say = (msg) => process.stdout.write(wire_frame(msg, env.nonce));
fs.writeFileSync(process.env.PIDS + "/" + profile, String(process.pid));
process.stdin.setRawMode(true);
say({ $: "hello", v: 1, pid: process.pid, profile, root: "/r" });
const show = () => { say({ $: "up" }); process.stdout.write("member " + profile + " " + process.stdout.columns + "x" + process.stdout.rows + "\\n"); };
show();
process.stdout.on("resize", () => process.stdout.write("size " + profile + " " + process.stdout.columns + "x" + process.stdout.rows + "\\n"));
let carry = "";
let pasted = 0;
const buf = Buffer.alloc(4096);
const next = () => fs.read(0, buf, 0, 4096, null, (err, n) => {
  if (err || n === 0) process.exit(5);
  const got = wire_cut(carry, buf.toString("latin1", 0, n), env.nonce);
  carry = got.carry;
  for (const part of got.parts) {
    if (typeof part !== "string") {
      if (part.$ === "end") process.exit(0);
      if (part.$ === "show") show();
      if (part.$ === "roster") process.stdout.write("roster " + part.open.map((o) => o.profile).join(",") + "\\n");
    } else if (part === "s") {
      say({ $: "hide", to: "work" });
    } else if (part === "b") {
      say({ $: "hide", to: "default" });
    } else if (part === "q") {
      say({ $: "quit" });
      setTimeout(() => process.exit(3), 50);
    } else {
      pasted += part.length;
      if (part.endsWith("\\x1b[201~")) {
        process.stdout.write("pasted " + pasted + "\\n");
      }
    }
  }
  next();
});
next();
`);

// the window started in a PTY (its members' pids written to a folder of
// their own): its output so far, a wait for a text in it (n times), keys
// typed, the pids of the members by profile
const start = () => {
  const pids = fs.mkdtempSync(DIR + "/pids-");
  let out = "";
  const code = "import { window_run } from " + JSON.stringify(WINDOW) + "; window_run([" + JSON.stringify(process.execPath) + ", " + JSON.stringify(FAKE) + "]);";
  const proc = Bun.spawn([process.execPath, "-e", code], { env: { ...process.env, PIDS: pids }, terminal: { cols: 80, rows: 24, data: (_t, d) => (out += Buffer.from(d).toString("latin1")) } });
  const seen = async (text: string, n = 1) => {
    for (let k = 0; k < 500 && out.split(text).length - 1 < n; k++) {
      await Bun.sleep(10);
    }
    return out.split(text).length - 1 >= n;
  };
  const pid = (profile: string) => Number(fs.readFileSync(pids + "/" + profile, "utf8"));
  return { proc, out: () => out, seen, type: (keys: string) => proc.terminal!.write(keys), pid };
};

// whether a process runs
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// a wait till a process is gone, at most ms
const gone = async (pid: number, ms = 1000) => {
  for (let k = 0; k < ms / 10 && alive(pid); k++) {
    await Bun.sleep(10);
  }
  return !alive(pid);
};

test("a member runs on a PTY of the terminal's size and follows it; a switch starts the other, back shows the first; a quit ends both with the shown one's code", async () => {
  const w = start();
  expect(await w.seen("member default 80x24")).toBe(true);
  expect(w.out().indexOf(WINDOW_ON)).toBeGreaterThanOrEqual(0);
  expect(w.out().indexOf(WINDOW_ON)).toBeLessThan(w.out().indexOf("member default"));
  w.proc.terminal!.resize(100, 30);
  expect(await w.seen("size default 100x30")).toBe(true);
  w.type("s");
  expect(await w.seen("member work 100x30")).toBe(true);
  expect(await w.seen("roster default")).toBe(true);
  w.type("b");
  expect(await w.seen("member default 100x30")).toBe(true);
  const work = w.pid("work");
  w.type("q");
  expect(await w.proc.exited).toBe(3);
  expect(w.out().endsWith(MODES_END)).toBe(true);
  expect(await gone(work)).toBe(true);
  w.proc.terminal!.close();
});

test("a 1 MB paste reaches the member shown once, whole (the PTY takes less at a time: the rest is queued, never written again)", async () => {
  const w = start();
  expect(await w.seen("member default")).toBe(true);
  const paste = "\x1b[200~" + "x".repeat(1000000) + "\x1b[201~";
  w.type(paste);
  expect(await w.seen("pasted " + paste.length)).toBe(true);
  await Bun.sleep(200);
  expect(w.out().split("pasted ").length - 1).toBe(1);
  w.proc.kill("SIGHUP");
  await w.proc.exited;
  w.proc.terminal!.close();
});

test("a hangup of the window ends every member, and the window", async () => {
  const w = start();
  await w.seen("member default");
  w.type("s");
  await w.seen("member work");
  const pids = [w.pid("default"), w.pid("work")];
  w.proc.kill("SIGHUP");
  expect(await w.proc.exited).toBe(0);
  expect(await Promise.all(pids.map((p) => gone(p)))).toEqual([true, true]);
  w.proc.terminal!.close();
});

test("the window killed, no member outlives it", async () => {
  const w = start();
  await w.seen("member default");
  w.type("s");
  await w.seen("member work");
  const pids = [w.pid("default"), w.pid("work")];
  w.proc.kill("SIGKILL");
  await w.proc.exited;
  expect(await Promise.all(pids.map((p) => gone(p)))).toEqual([true, true]);
  w.proc.terminal!.close();
});
