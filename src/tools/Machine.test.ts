// Machine test
// ============
// `bun test Machine.test.ts`. The device tools' answers at their edges;
// an image read, seen (fitted: scaled, its see-through kept, a broken
// one, a huge one or one too large refused); the background jobs a shell
// call leaves; no read, write or edit in a chat's folder, any profile's.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as config from "../config/Config.ts";
import { Machine } from "./Machine.ts";
import { png } from "../../test/png.ts";
import { temp_dir } from "../../test/repo.ts";

const DIR = temp_dir("illi-machine-");

afterAll(() => Machine.end());

// whether ok holds within a second
async function soon(ok: () => boolean): Promise<boolean> {
  for (let k = 0; k < 50 && !ok(); k++) {
    await Bun.sleep(20);
  }
  return ok();
}

test("a read past a file's end says so, never an empty range", async () => {
  const file = DIR + "/three";
  fs.writeFileSync(file, "a\nb\nc\n");
  expect(await Machine.read(file, 3, Infinity, 0)).toEqual({ text: "c\n[lines 3-3 of 3]", fail: false });
  expect(await Machine.read(file, 9, Infinity, 0)).toEqual({ text: "No lines from line 9: the file has 3.", fail: true });
  expect(await Machine.read(file, 2, 0, 0)).toEqual({ text: "No lines from line 2: the file has 3.", fail: true });
});

test("an image read is seen: itself (a small one), scaled to fit (a big one), see-through kept; the text says it comes with this result only; offset ignored", async () => {
  fs.writeFileSync(DIR + "/dot.txt", png(4, 3));
  const small = await Machine.read(DIR + "/dot.txt", 5, 1, 0);
  expect(small.text).toMatch(/^Image dot\.txt \(png, 4×3, \d+ B\), attached to this result only: read it again to see it later\.$/);
  expect([small.fail, small.imgs!.length, small.imgs![0].type]).toEqual([false, 1, "image/webp"]);
  const lines = new Bun.Image(Buffer.from(small.imgs![0].data, "base64"));
  expect([(await lines.metadata()).width, (await lines.metadata()).height]).toEqual([4, 3]);
  fs.writeFileSync(DIR + "/wide.png", png(3136, 40, true));
  const big = await Machine.read(DIR + "/wide.png", 1, Infinity, 0);
  expect(big.text).toContain("(png, 3136×40, ");
  expect(big.text).toContain(", sent scaled to 1568×20), attached");
  const seen = await new Bun.Image(Buffer.from(big.imgs![0].data, "base64")).metadata();
  expect([seen.width, seen.height, seen.format]).toEqual([1568, 20, "webp"]);
});

test("an image that won't do is refused, saying why: cut short, too many pixels, too large; any other binary says what read takes", async () => {
  const whole = png(64, 64);
  fs.writeFileSync(DIR + "/cut.png", whole.subarray(0, whole.length - 30));
  expect(await Machine.read(DIR + "/cut.png", 1, Infinity, 0)).toEqual({ text: "Image cut.png: a png that won't decode (cut short or broken).", fail: true });
  const huge = png(1, 1);
  huge.writeUInt32BE(20000, 16);
  huge.writeUInt32BE(20000, 20);
  fs.writeFileSync(DIR + "/huge.png", huge);
  expect(await Machine.read(DIR + "/huge.png", 1, Infinity, 0)).toEqual({ text: "Image huge.png: a png of more than 67 million pixels, too many to decode.", fail: true });
  const fd = fs.openSync(DIR + "/large.png", "w");
  fs.writeSync(fd, png(1, 1));
  fs.ftruncateSync(fd, 21 * 2 ** 20);
  fs.closeSync(fd);
  expect(await Machine.read(DIR + "/large.png", 1, Infinity, 0)).toEqual({ text: "Image large.png: 21.0 MB, too large to read (20 MB at most).", fail: true });
  fs.writeFileSync(DIR + "/blob", Buffer.from([1, 0, 2]));
  expect(await Machine.read(DIR + "/blob", 1, Infinity, 0)).toEqual({ text: "A binary file of 3 bytes: read takes text, and images. Images are png, jpeg, gif or webp.", fail: true });
});

test("a shell's output is decoded whole: a char split over writes, a broken one at its end", async () => {
  const live = new AbortController().signal;
  const split = await Machine.shell(DIR, "printf 'a\\303'; sleep 0.1; printf '\\251b'", live);
  expect(split.text).toStartWith("aéb\n(exit 0 in ");
  const broken = await Machine.shell(DIR, "printf 'ab\\303'", live);
  expect(broken.text).toStartWith("ab�\n(exit 0 in ");
});

test("a shell call that ends leaving a process in its group is a background job of its caller, told as it comes and goes; one stopped ends; a call leaving none, or stopped, leaves none", async () => {
  const live = new AbortController().signal;
  let told = 0;
  Machine.watch(() => told++);
  await Machine.shell(DIR, "true", live);
  expect([Machine.background(), told]).toEqual([[], 0]);
  const out = await Machine.shell(DIR, " sleep 30 > /dev/null 2>&1 & echo $!\n", live, "reviewer");
  const pid = Number(out.text.split("\n")[0]);
  const [job] = Machine.background();
  expect([Machine.background().length, job.command, job.agent, told]).toEqual([1, "sleep 30 > /dev/null 2>&1 & echo $!", "reviewer", 1]);
  expect(Machine.stop(job.id)).toBe(true);
  expect([Machine.background(), told, Machine.stop(job.id)]).toEqual([[], 2, false]);
  expect(await soon(() => !Machine.alive(pid))).toBe(true);
  const short = await Machine.shell(DIR, "sleep 0.2 > /dev/null 2>&1 &", live);
  expect([short.fail, Machine.background().map((j) => j.agent), told]).toEqual([false, ["illi"], 3]);
  expect(await soon(() => Machine.background().length === 0)).toBe(true);
  Machine.look();
  expect(told).toBe(4);
  const stop = new AbortController();
  setTimeout(() => stop.abort(), 100);
  await Machine.shell(DIR, "sleep 30 > /dev/null 2>&1 & sleep 5", stop.signal);
  Machine.look();
  expect([Machine.background(), told]).toEqual([[], 4]);
  const ended = await Machine.shell(DIR, "sleep 0.1 > /dev/null 2>&1 & printf 'a\\033]52;c;eA==\\007b'", live);
  const [gone] = Machine.background();
  expect(Machine.stop(gone.id)).toBe(true);
  expect([ended.fail, gone.command]).toEqual([false, "sleep 0.1 > /dev/null 2>&1 & printf 'a\\033]52;c;eA==\\007b'"]);
  Machine.watch(() => {});
});

test("no read, write or edit reaches a chat's folder, this profile's or another's; elsewhere they work", async () => {
  const live = new AbortController().signal;
  const run  = (name: string, input: object) => Machine.run({ name, input, cwd: DIR }, live);
  expect(config.ROOT.startsWith(os.tmpdir() + "/")).toBe(true);
  fs.mkdirSync(config.ROOT + "/chat/main", { recursive: true });
  fs.writeFileSync(config.ROOT + "/chat/main/day.jsonl", "{}\n");
  const read = await run("read", { path: config.ROOT + "/chat/main/day.jsonl" });
  expect(read.fail).toBe(true);
  expect(read.text).toEndWith("holds a chat, illi's memory (this profile's or another's): no file tool reads or changes it. Your own memory is reached with zoom; another profile's chat isn't yours.");
  expect((await run("write", { path: config.ROOT + "/profiles/work/chat/x.jsonl", content: "x" })).fail).toBe(true);
  expect(fs.existsSync(config.ROOT + "/profiles/work")).toBe(false);
  fs.writeFileSync(DIR + "/mine.txt", "a\n");
  const edits = [{ path: DIR + "/mine.txt", old: "a", new: "b" }, { path: config.ROOT + "/chat/main/day.jsonl", old: "{}", new: "[]" }];
  expect((await run("edit", { edits })).fail).toBe(true);
  expect([fs.readFileSync(DIR + "/mine.txt", "utf8"), fs.readFileSync(config.ROOT + "/chat/main/day.jsonl", "utf8")]).toEqual(["a\n", "{}\n"]);
  expect((await run("edit", { edits: edits.slice(0, 1) })).fail).toBe(false);
  expect((await run("write", { path: DIR + "/new.txt", content: "x" })).fail).toBe(false);
});
