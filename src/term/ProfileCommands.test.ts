// Profile commands test
// =====================
// `bun test ProfileCommands.test.ts`. /profile export never writes over
// a file there; /profile import says what it left off and that the
// profile's agents, commands, skills, RULES.md and chat came with it.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-profile-commands-");
const TMP = fs.mkdtempSync(os.tmpdir() + "/illi-profile-commands-tmp-");
process.env.ILLI_DIR = DIR;
delete process.env.ILLI_PROFILE;
fs.writeFileSync(DIR + "/config.json", JSON.stringify({ side: "left" }));

const { term_profile } = await import("./ProfileCommands.ts");
const View = await import("../ui/View.ts");

afterAll(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.rmSync(TMP, { recursive: true, force: true });
});

// a terminal with no screen, only its view and notes
const term = () => ({ v: View.view_new(), scr: { tty: true }, notices: [], due: true, ver: 0 }) as any;
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
