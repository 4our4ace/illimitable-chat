// Disk test
// =========
// `bun test Disk.test.ts`. The shell that flushes, killed: the next flush
// never waits on it nor writes to it, but starts another, whether the
// shell's end was seen first or not; nothing is told failed.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-disk-");
process.env.ILLI_DIR = DIR;

const { Disk } = await import("./Disk.ts");

// a file written and flushed, at most 5 s
async function flushed(name: string): Promise<void> {
  fs.writeFileSync(DIR + "/" + name, name);
  const late = Bun.sleep(5000).then(() => "stuck");
  expect(await Promise.race([Disk.wrote(DIR + "/" + name), late])).toBeUndefined();
}

test.skipIf(process.platform !== "linux")("a killed flush shell is let go and another started", async () => {
  const errors: string[] = [];
  const error = console.error;
  console.error = (...args: unknown[]) => errors.push(args.join(" "));
  try {
    await flushed("a");
    const first = Disk.flusher()!;
    process.kill(first.pid, "SIGKILL");
    await first.exited;
    await flushed("b");
    const second = Disk.flusher()!;
    expect(second.pid).not.toBe(first.pid);

    process.kill(second.pid, "SIGKILL");
    await flushed("c");
    await flushed("d");
    const third = Disk.flusher()!;
    expect(third.pid).not.toBe(second.pid);
    await flushed("e");
    expect(Disk.flusher()).toBe(third);
  } finally {
    console.error = error;
    await Disk.end();
  }
  expect(errors).toEqual([]);
});
