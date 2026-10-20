// Profile commands test
// =====================
// `bun test ProfileCommands.test.ts`. /profile export never writes over
// a file there; /profile import says what it left off and that the
// profile's agents, commands, skills, RULES.md and chat came with it.
// The picker opens even with the default alone, a new profile's row
// last (Enter there asks its name; Delete on a profile asks to delete
// it); /profile new without flags asks what comes along; a rename and a
// delete (asked first) of another profile, never of the default or the
// one running.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-profile-commands-");
const TMP = fs.mkdtempSync(os.tmpdir() + "/illi-profile-commands-tmp-");
process.env.ILLI_DIR = DIR;
delete process.env.ILLI_PROFILE;
fs.writeFileSync(DIR + "/config.json", JSON.stringify({ side: "left" }));

const { term_profile } = await import("./ProfileCommands.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.rmSync(TMP, { recursive: true, force: true });
});

// a terminal with no screen, only its view and notes
const term = () => ({ v: View.view_new(), scr: { tty: true, ed: Screen.ed_new() }, choose: null, pane: null, notices: [], due: true, ver: 0 }) as any;
const note = (t: any) => t.notices.at(-1)?.text ?? "";

test("/profile export won't write over a file there", async () => {
  const t = term();
  fs.writeFileSync(TMP + "/notes.md", "mine\n");
  await term_profile(t, "export " + TMP + "/notes.md");
  expect(note(t)).toBe("Not exported: " + TMP + "/notes.md is there already. Move it away, or name another file.");
  expect(fs.readFileSync(TMP + "/notes.md", "utf8")).toBe("mine\n");
  await term_profile(t, "export " + TMP + "/out.tar.gz");
  expect(note(t)).toMatch(/^Profile default is in .*out\.tar\.gz: its chat and settings/);
});

test("/profile import says what came with the profile", async () => {
  const t = term();
  await term_profile(t, "import " + TMP + "/out.tar.gz home");
  expect(note(t)).toContain("Its agents, commands, skills, RULES.md and chat came as they were");
  expect(fs.existsSync(DIR + "/profiles/home/config.json")).toBe(true);
});

test("the picker opens with the default alone too, a new profile's row last; Enter there asks the name", () => {
  const t = term();
  term_profile(t, "");
  expect(t.choose.names).toEqual(["default", "home", "+ new profile"]);
  expect([t.choose.here, t.choose.foot(0), t.choose.foot(2)]).toEqual([0, "Enter switch · Del delete", "Enter name it"]);
  t.choose.pick(2);
  expect(t.scr.ed.text).toBe("/profile new ");
  term_profile(t, "");
  expect(t.choose.keys(0, "Delete")).toBe(true);
  expect(note(t)).toMatch(/^The default profile is Illi's own folder .* and can't be deleted\.$/);
  t.choose.keys(1, "Delete");
  expect(t.choose.title).toBe("Delete profile home?");
});

test("/profile new without flags asks what comes along", () => {
  const t = term();
  term_profile(t, "new work");
  expect(t.choose.title).toBe("New profile work");
  expect(t.choose.names).toEqual(["Empty", "With this setup", "With this chat", "With both"]);
  expect(t.choose.about[2]).toBe("this chat moves there; default starts empty");
  term_profile(t, "new work --all");
  expect(note(t)).toBe("/profile new takes --copy and --move, not --all.");
});

test("a rename and a delete (asked first) of another profile; never the default or the one running", () => {
  const t = term();
  term_profile(t, "rename default x");
  expect(note(t)).toMatch(/^The default profile is Illi's own folder .* and keeps its name\.$/);
  term_profile(t, "rename home house");
  expect([note(t), fs.existsSync(DIR + "/profiles/house")]).toEqual(["Renamed profile home to house.", true]);
  term_profile(t, "delete default");
  expect(note(t)).toMatch(/can't be deleted/);
  term_profile(t, "delete house");
  t.choose.pick(0);
  expect([note(t), fs.existsSync(DIR + "/profiles/house")]).toEqual(["Kept profile house.", true]);
  term_profile(t, "delete house");
  t.choose.pick(1);
  expect([note(t), fs.existsSync(DIR + "/profiles/house")]).toEqual(["Deleted profile house.", false]);
});
