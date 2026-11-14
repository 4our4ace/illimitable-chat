// Flock test
// ==========
// `bun test Flock.test.ts`. A file changed under its own lock beside it:
// one illi at a time, another held off past the wait (f not run; where
// that's no failure, said in the log alone); a folder illi may not make
// the lock in changes the file without it, as no other illi can lock it
// there either.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-flock-");

const { Flock } = await import("./Flock.ts");
const { whole } = await import("../tools/Clip.ts");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

test("a change under the file's own lock: run, the lock beside it; another holding it past the wait: not run, said in the log where that's no failure", async () => {
  const file = DIR + "/one/data.json";
  expect(Flock.beside(file, 100, () => (whole(file, "1"), "done"))).toBe("done");
  expect([fs.readFileSync(file, "utf8"), fs.existsSync(DIR + "/one/.data.json.lock")]).toEqual(["1", true]);
  const logged: string[] = [];
  const error = console.error;
  console.error = (text: string) => logged.push(text);
  try {
    await Flock.hold(DIR + "/one/.data.json.lock", 1000, "held", async () => {
      expect(Flock.beside(file, 50, () => "ran")).toBeUndefined();
      Flock.kept(file, 50, () => whole(file, "2"));
    });
  } finally {
    console.error = error;
  }
  expect([fs.readFileSync(file, "utf8"), logged]).toEqual(["1", ["illi: another illi held " + file + " past 0.05 s, so a change to it isn't kept"]]);
});

test("a folder illi may not make the lock in: the file changed without it", () => {
  if (process.getuid?.() === 0) {
    return;
  }
  const file = DIR + "/shut/data.json";
  fs.mkdirSync(DIR + "/shut");
  fs.writeFileSync(file, "1");
  fs.chmodSync(DIR + "/shut", 0o555);
  try {
    expect(Flock.beside(file, 100, () => (whole(file, "2"), "done"))).toBe("done");
    expect([fs.readFileSync(file, "utf8"), fs.readdirSync(DIR + "/shut")]).toEqual(["2", ["data.json"]]);
  } finally {
    fs.chmodSync(DIR + "/shut", 0o755);
  }
});
