// Project commands test
// =====================
// `bun test ProjectCommands.test.ts`. /projects lists this project first,
// then the one used last first, each with its last day, size and folder;
// Enter says more. Delete asks first, at the input in the list's place,
// Cancel lit: Cancel keeps it; Forget
// drops it, its file deleted, its images with it; a copy exported first goes to
// ./illi-project-<name>.json, never over a file there; one open in
// another terminal is kept, and so is this one, its chat run in another
// terminal (this one a view of it).

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-project-commands-");
const TMP = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + "/illi-project-commands-tmp-"));
process.env.ILLI_DIR = DIR;
fs.mkdirSync(TMP + "/.git");
const WAS = process.cwd();
process.chdir(TMP);

const { term_projects } = await import("./ProjectCommands.ts");
const { Lock } = await import("../chat/Lock.ts");
const { Memory } = await import("../chat/Memory.ts");
const { Projects } = await import("../chat/Projects.ts");
const { Store } = await import("../chat/Store.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

afterAll(() => {
  process.chdir(WAS);
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.rmSync(TMP, { recursive: true, force: true });
});

// this project's chat, and two others: site (two images) and app (one,
// the same as one of site's), used last
const HERE = Projects.place(TMP);
const mem  = Memory.load(DIR + "/chat", () => ({}) as any, HERE);
mem.hold = true;
const SITE = { key: "git:/work/site", name: "site-7q2m0d", path: "/work/site" };
const APP  = { key: "git:/work/app", name: "app-k3f9x2", path: "/work/app" };
function project(place: any, day: string, images: string[]): void {
  const store = Store.open(DIR + "/chat", place);
  Store.push(store, [{ i: 0, kind: "user", text: "work on " + place.name, date: day + "T10:00:00.000Z", size: 20, images }], place.path);
  Store.nodes(store, [{ first: 0, n: 1, text: "user: work on " + place.name }]);
  images.forEach((name) => Store.image_put(store, name, Buffer.from("img"), null));
  Store.close(store);
}
project(SITE, "2026-10-01", ["aaaaaaaaaaaaaaaa.png", "bbbbbbbbbbbbbbbb.png"]);
project(APP, "2026-10-10", ["bbbbbbbbbbbbbbbb.png"]);
const pictures = () => Store.files(mem.store).reduce((n, file) => n + Store.visit(mem.store, file, Store.pictures), 0);

// a terminal with no screen, only its view, notes and chat (view: another
// terminal's, this one a view of it)
const term = (view = false) => ({ v: View.view_new(), scr: { tty: true, ed: Screen.ed_new() }, choose: null, question: null, pane: null, notices: [], due: true, ver: 0, chat: view ? null : { mem }, mem: () => mem }) as any;
const note = (t: any) => t.notices.at(-1)?.text ?? "";
const noted = async (t: any, start: string) => {
  for (let k = 0; k < 250 && !note(t).startsWith(start); k++) {
    await Bun.sleep(20);
  }
  return note(t);
};

test("/projects lists this project first, then the one used last first, each its last day, size and folder; Enter says more", () => {
  const t = term();
  term_projects(t);
  expect(t.choose.title).toBe("Projects");
  expect(t.choose.names).toEqual([HERE.name, "app-k3f9x2", "site-7q2m0d"]);
  expect(t.choose.about[0]).toStartWith("no messages yet · ");
  expect(t.choose.about[0]).toEndWith(" · here");
  expect(t.choose.about[1]).toBe("last 2026-10-10 · 1 message · /work/app");
  t.choose.pick(2);
  expect(t.choose).toBeNull();
  expect(note(t)).toBe("site-7q2m0d · /work/site · 1 message, 2026-10-01. Lately: user: work on site-7q2m0d");
});

test("Delete asks first, at the input in the list's place, Cancel lit and keeping it; Forget drops it, its images too", async () => {
  const t = term();
  term_projects(t);
  expect(t.choose.keys(2, "Delete")).toBe(true);
  expect([t.choose, t.question.title, t.question.names, t.question.at]).toEqual([null, "Forget site-7q2m0d?", ["Cancel", "Export a copy first, then forget", "Forget"], 0]);
  expect(t.question.about[2]).toBe("1 message and 2 images, gone for good");
  t.question.pick(0);
  expect(Store.projects(mem.store).map((p) => p.name)).toContain("site-7q2m0d");
  term_projects(t);
  t.choose.keys(2, "Delete");
  t.question.pick(2);
  expect(await noted(t, "Forgot")).toBe("Forgot site-7q2m0d: 1 message and 2 images.");
  expect(Store.projects(mem.store).map((p) => p.name)).toEqual(["app-k3f9x2", HERE.name]);
  expect([pictures(), fs.readdirSync(DIR + "/chat/projects").filter((f) => f.startsWith("site"))]).toEqual([1, []]);
});

test("a copy exported first goes to ./illi-project-<name>.json, never over a file there; one open in another terminal is kept", async () => {
  const t = term();
  fs.writeFileSync(TMP + "/illi-project-app-k3f9x2.json", "mine\n");
  term_projects(t);
  t.choose.keys(1, "Delete");
  t.question.pick(1);
  expect(await noted(t, "Not forgotten")).toMatch(/^Not forgotten: .*illi-project-app-k3f9x2\.json is there already\. Move it away first\.$/);
  fs.rmSync(TMP + "/illi-project-app-k3f9x2.json");
  const lock = (await Lock.claim(Projects.lock(APP.path)))!;
  term_projects(t);
  t.choose.keys(1, "Delete");
  t.question.pick(1);
  expect(await noted(t, "app-k3f9x2 is open")).toBe("app-k3f9x2 is open in another terminal: quit illi there first, then forget it here.");
  expect(JSON.parse(fs.readFileSync(TMP + "/illi-project-app-k3f9x2.json", "utf8")).messages[0].text).toBe("work on app-k3f9x2");
  lock.stop();
  fs.rmSync(TMP + "/illi-project-app-k3f9x2.json");
  term_projects(t);
  t.choose.keys(1, "Delete");
  t.question.pick(1);
  expect(await noted(t, "Forgot")).toBe("Forgot app-k3f9x2: 1 message and 1 image.");
  expect(Object.keys(JSON.parse(fs.readFileSync(TMP + "/illi-project-app-k3f9x2.json", "utf8")).images)).toEqual(["bbbbbbbbbbbbbbbb.png"]);
  expect(Store.projects(mem.store).map((p) => p.name)).toEqual([HERE.name]);
});

test("this project, its chat run in another terminal (this one a view of it), is kept", async () => {
  const t = term(true);
  term_projects(t);
  t.choose.keys(0, "Delete");
  t.question.pick(2);
  expect(await noted(t, HERE.name)).toBe(HERE.name + "'s chat runs in another terminal: forget it there.");
  expect(Store.projects(mem.store).map((p) => p.name)).toEqual([HERE.name]);
});
