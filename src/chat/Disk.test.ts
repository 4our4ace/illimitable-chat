// Disk test
// =========
// `bun test Disk.test.ts`. Writes made while a flush runs wait for the
// next and share it: a file written five times at once is flushed twice;
// a file gone since needs none; each write is answered once flushed, and
// nothing is told failed.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-disk-");
process.env.ILLI_DIR = DIR;

const { Disk } = await import("./Disk.ts");

test("writes made while a flush runs share the next; a file gone needs none; each answered once flushed", async () => {
  const errors: string[] = [];
  const error = console.error;
  console.error = (...args: unknown[]) => errors.push(args.join(" "));
  const fsync = Disk.fsync;
  const synced: string[] = [];
  Disk.fsync = (file) => fsync(file).then(() => void synced.push(file.slice(DIR.length + 1)));
  try {
    fs.writeFileSync(DIR + "/wal", "x");
    const late = Bun.sleep(5000).then(() => "stuck");
    const answers = Array.from({ length: 5 }, () => Disk.wrote(DIR + "/wal"));
    expect(await Promise.race([Promise.all(answers), late])).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect(synced).toEqual(["wal", "wal"]);
    expect(await Promise.race([Disk.wrote(DIR + "/gone"), late])).toBeUndefined();
    expect(await Promise.race([Disk.synced(), late])).toBeUndefined();
  } finally {
    Disk.fsync = fsync;
    console.error = error;
  }
  expect([synced.length, errors]).toEqual([3, []]);
});
