// Machine test
// ============
// `bun test Machine.test.ts`. The device tools' answers at their edges;
// no read, write or edit in a chat's folder, any profile's.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as config from "../config/Config.ts";
import { Machine } from "./Machine.ts";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-machine-");

test("a read past a file's end says so, never an empty range", () => {
  const file = DIR + "/three";
  fs.writeFileSync(file, "a\nb\nc\n");
  expect(Machine.read(file, 3, Infinity, 0)).toEqual({ text: "c\n[lines 3-3 of 3]", fail: false });
  expect(Machine.read(file, 9, Infinity, 0)).toEqual({ text: "No lines from line 9: the file has 3.", fail: true });
  expect(Machine.read(file, 2, 0, 0)).toEqual({ text: "No lines from line 2: the file has 3.", fail: true });
});

test("a shell's output is decoded whole: a char split over writes, a broken one at its end", async () => {
  const live = new AbortController().signal;
  const split = await Machine.shell(DIR, "printf 'a\\303'; sleep 0.1; printf '\\251b'", live);
  expect(split.text).toStartWith("aéb\n(exit 0 in ");
  const broken = await Machine.shell(DIR, "printf 'ab\\303'", live);
  expect(broken.text).toStartWith("ab�\n(exit 0 in ");
});

test("no read, write or edit reaches a chat's folder, this profile's or another's; elsewhere they work", async () => {
  const live = new AbortController().signal;
  const run  = (name: string, input: object) => Machine.run({ name, input, cwd: DIR }, live);
  expect(config.ROOT.startsWith(os.tmpdir() + "/")).toBe(true);
  fs.mkdirSync(config.ROOT + "/chat/main", { recursive: true });
  fs.writeFileSync(config.ROOT + "/chat/main/day.jsonl", "{}\n");
  const read = await run("read", { path: config.ROOT + "/chat/main/day.jsonl" });
  expect(read.fail).toBe(true);
  expect(read.text).toEndWith("holds a chat, Illi's memory (this profile's or another's): no file tool reads or changes it. Your own memory is reached with zoom; another profile's chat isn't yours.");
  expect((await run("write", { path: config.ROOT + "/profiles/work/chat/x.jsonl", content: "x" })).fail).toBe(true);
  expect(fs.existsSync(config.ROOT + "/profiles/work")).toBe(false);
  fs.writeFileSync(DIR + "/mine.txt", "a\n");
  const edits = [{ path: DIR + "/mine.txt", old: "a", new: "b" }, { path: config.ROOT + "/chat/main/day.jsonl", old: "{}", new: "[]" }];
  expect((await run("edit", { edits })).fail).toBe(true);
  expect([fs.readFileSync(DIR + "/mine.txt", "utf8"), fs.readFileSync(config.ROOT + "/chat/main/day.jsonl", "utf8")]).toEqual(["a\n", "{}\n"]);
  expect((await run("edit", { edits: edits.slice(0, 1) })).fail).toBe(false);
  expect((await run("write", { path: DIR + "/new.txt", content: "x" })).fail).toBe(false);
});
