// Profile commands test
// =====================
// `bun test ProfileCommands.test.ts`. All of it from the picker: Ctrl+E
// exports to ./illi-profile-<name>.tar.gz, never over a file there; its
// import row asks the archive's path (and a name, if its file gives
// none) and says what came with the profile. The picker lists every
// profile, then its new and import rows; the new row asks a name (a
// reason keeps the box open), then what comes along; Ctrl+R renames and
// Delete deletes (asked first) another profile, never the default.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-profile-commands-");
const TMP = fs.mkdtempSync(os.tmpdir() + "/illi-profile-commands-tmp-");
process.env.ILLI_DIR = DIR;
delete process.env.ILLI_PROFILE;
fs.writeFileSync(DIR + "/config.json", JSON.stringify({ side: "left" }));
const WAS = process.cwd();
process.chdir(TMP);

const { term_profile } = await import("./ProfileCommands.ts");
const { term_grab } = await import("./Keys.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => {
  process.chdir(WAS);
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.rmSync(TMP, { recursive: true, force: true });
});

// a terminal with no screen, only its view and notes
const term = () => ({ v: View.view_new(), scr: { tty: true, ed: Screen.ed_new() }, choose: null, pane: null, notices: [], due: true, ver: 0 }) as any;
const note = (t: any) => t.notices.at(-1)?.text ?? "";

// the last note, once one starting so has come (an export, an import)
const noted = async (t: any, start: string) => {
  for (let k = 0; k < 250 && !note(t).startsWith(start); k++) {
    await Bun.sleep(20);
  }
  return note(t);
};

test("Ctrl+E exports a profile to the folder illi works in, never over a file there", async () => {
  const t = term();
  fs.writeFileSync(TMP + "/illi-profile-default.tar.gz", "mine\n");
  term_profile(t, "");
  expect(t.choose.keys(0, "Ctrl+E")).toBe(true);
  expect(await noted(t, "Not exported")).toMatch(/^Not exported: .*illi-profile-default\.tar\.gz is there already\. Move it away first\.$/);
  expect(fs.readFileSync(TMP + "/illi-profile-default.tar.gz", "utf8")).toBe("mine\n");
  fs.rmSync(TMP + "/illi-profile-default.tar.gz");
  t.choose.keys(0, "Ctrl+E");
  expect(await noted(t, "Profile default")).toMatch(/^Profile default is in .*illi-profile-default\.tar\.gz, without the login\. \/profile imports it\.$/);
});

test("the import row asks the archive's path, then a name its file can't give, and says what came along", async () => {
  const t = term();
  term_profile(t, "");
  t.choose.pick(t.choose.names.indexOf("+ import a profile"));
  expect([t.choose.title, t.choose.ask.hint]).toEqual(["Import a profile", "the archive's path"]);
  expect(t.choose.ask.done(TMP + "/none.tar.gz")).toBe("No such file.");
  expect(t.choose.ask.done(TMP + "/illi-profile-default.tar.gz")).toBeNull();
  expect([t.choose.title, t.choose.find.text, t.choose.foot(-1)]).toEqual(["Name the imported profile", "", "a-z, 0-9, - and _, a letter or digit first"]);
  expect(t.choose.ask.done("home")).toBeNull();
  const said = await noted(t, "Imported");
  expect(said).toContain("Its agents, commands, skills and RULES.md came as they were");
  expect(said.length).toBeLessThanOrEqual(160);
  expect(fs.existsSync(DIR + "/profiles/home/config.json")).toBe(true);
});

test("the picker lists every profile, then its new and import rows; Delete asks first, never on the default", () => {
  const t = term();
  term_profile(t, "");
  expect(t.choose.names).toEqual(["default", "home", "+ new profile", "+ import a profile"]);
  expect([t.choose.here, t.choose.foot(0), t.choose.foot(2), t.choose.foot(3)]).toEqual([0, "Enter switch · Ctrl+R rename · Ctrl+E export · Del delete", "Enter name it", "Enter give its file"]);
  expect(t.choose.keys(2, "Delete")).toBe(false);
  expect(t.choose.keys(0, "Delete")).toBe(true);
  expect(note(t)).toMatch(/^The default profile is illi's own folder .* and can't be deleted\.$/);
  t.choose.keys(1, "Delete");
  expect(t.choose.title).toBe("Delete profile home?");
});

test("the new row asks a name, a reason keeping the box open, then what comes along", () => {
  const t = term();
  term_profile(t, "");
  t.choose.pick(t.choose.names.indexOf("+ new profile"));
  expect([t.choose.title, t.choose.ask.hint, t.choose.find.text]).toEqual(["New profile", "its name", ""]);
  term_grab(t, "Enter");
  expect([t.choose?.title, t.choose?.foot(-1)]).toEqual(["New profile", "Type its name first."]);
  Object.assign(t.choose.find, { text: "Home", pos: 4 });
  term_grab(t, "Enter");
  expect(t.choose.foot(-1)).toBe("There's a profile home already.");
  Object.assign(t.choose.find, { text: "work", pos: 4 });
  term_grab(t, "Enter");
  expect(t.choose.title).toBe("New profile work");
  expect(t.choose.names).toEqual(["Fresh chat", "With this chat"]);
  expect(t.choose.about[1]).toBe("this chat moves there; default starts empty");
});

test("Ctrl+R renames another profile, its old name to start from; Delete then deletes it, asked first", async () => {
  const t = term();
  term_profile(t, "");
  t.choose.keys(0, "Ctrl+R");
  expect(note(t)).toMatch(/^The default profile is illi's own folder .* and keeps its name\.$/);
  t.choose.keys(1, "Ctrl+R");
  expect([t.choose.title, t.choose.find.text]).toEqual(["Rename profile home", "home"]);
  expect(t.choose.ask.done("default")).toContain("illi's own folder");
  expect(t.choose.ask.done("house")).toBeNull();
  await noted(t, "Renamed");
  expect([note(t), fs.existsSync(DIR + "/profiles/house")]).toEqual(["Renamed profile home to house.", true]);
  term_profile(t, "");
  t.choose.keys(1, "Delete");
  t.choose.pick(0);
  expect([note(t), fs.existsSync(DIR + "/profiles/house")]).toEqual(["Kept profile house.", true]);
  term_profile(t, "");
  t.choose.keys(1, "Delete");
  t.choose.pick(1);
  await noted(t, "Deleted");
  expect([note(t), fs.existsSync(DIR + "/profiles/house")]).toEqual(["Deleted profile house.", false]);
});
