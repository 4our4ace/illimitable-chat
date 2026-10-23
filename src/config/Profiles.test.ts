// Profiles test
// =============
// `bun test Profiles.test.ts`. Which profile runs: the one asked, else
// the one used last, else the default (the root itself); a folder that
// is a profile's is that one, in its root. Config.ts on a profile: its
// folder as DIR, its config.json over the root's, the root's login, the
// keys put back for a switch; the root as the global layer: its skills,
// agents, commands and MCP servers beside the profile's (whose win by
// name), each setting said to come from the profile or global, the
// profile's `off` leaving some out, its lists (off, sticky) added to the
// root's; a shortcut of the root's dropped in a profile stays dropped.
// Names a profile takes. Secrets left out of a JSON file. An export: no
// login, locks, log or update.json, its config stripped; an import: a
// new profile only, its config's commands dropped, its MCP servers off;
// an archive with a path out of its folder, or a link, is refused before
// anything is unpacked. An export's chat is a snapshot,
// whole while an illi writes to it. The chat folder a file is in, any
// profile's, through a link too.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as Profiles from "./Profiles.ts";

const ROOT = fs.mkdtempSync(os.tmpdir() + "/illi-profiles-");
const TMP  = fs.mkdtempSync(os.tmpdir() + "/illi-profiles-tmp-");

function put(file: string, text: string): void {
  fs.mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(file, text);
}

// a tar run here; its listing
function tar(args: string[], cwd = TMP): string {
  const run = Bun.spawnSync(["tar", ...args], { cwd });
  expect(run.exitCode).toBe(0);
  return run.stdout.toString();
}

put(ROOT + "/config.json", JSON.stringify({ side: "left", vendors: "chatgpt,claude-api", anthropic_api_key: "sk-ant-0123456789abcdefghij", login: "auth/other-login.json" }));
put(ROOT + "/login.json", JSON.stringify({ openai: { access: "secret-access", refresh: "secret-refresh" } }));
put(ROOT + "/auth/other-login.json", "{}");
put(ROOT + "/locks/0123456789ab.lock", "");
put(ROOT + "/illi.log", "log\n");
put(ROOT + "/update.json", JSON.stringify({ checked: "2026-10-20T00:00:00.000Z" }));
put(ROOT + "/chat/main/2026-10-20.jsonl", '{"text":"hello from default"}\n');
put(ROOT + "/agents/reviewer.md", "---\ndescription: Reviews\n---\nReview.");
put(ROOT + "/mcp.json", JSON.stringify({ mcpServers: {
  github : { command: "npx", args: ["server-github", "--key", "ghp_0123456789abcdefABCDEF"], env: { GITHUB_TOKEN: "${GITHUB_TOKEN}", OTHER_TOKEN: "literal-token-value", PLAIN: "x" } },
  docs   : { type: "http", url: "https://example.com/mcp", headers: { Authorization: "Bearer abcdefghijklmnop" } },
  off    : { command: "off", disabled: true },
} }));

test("the default runs first: the root itself", () => {
  expect(Profiles.profile_pick(ROOT)).toEqual({ root: ROOT, name: "default", dir: ROOT });
  expect(Profiles.profile_pick(ROOT + "/")).toEqual({ root: ROOT, name: "default", dir: ROOT });
  expect(Profiles.profile_list(ROOT)).toEqual(["default"]);
});

test("a new profile: named well, never twice, never default (new is a name like any); its folder empty", () => {
  expect(Profiles.profile_why(ROOT, "Work")).toContain("Only a-z");
  expect(Profiles.profile_why(ROOT, "-x")).toContain("Only a-z");
  expect(Profiles.profile_why(ROOT, "a/b")).toContain("Only a-z");
  expect(Profiles.profile_why(ROOT, "default")).toContain("illi's own folder");
  expect(Profiles.profile_why(ROOT, "new")).toBeNull();
  expect(Profiles.profile_why(ROOT, "work")).toBeNull();
  Profiles.profile_new(ROOT, "work");
  Profiles.profile_new(ROOT, "copy");
  expect(Profiles.profile_why(ROOT, "work")).toContain("already");
  expect(fs.readdirSync(ROOT + "/profiles/work")).toEqual([]);
  fs.mkdirSync(ROOT + "/profiles/.import-x");
  fs.mkdirSync(ROOT + "/profiles/Bad");
  expect(Profiles.profile_list(ROOT)).toEqual(["default", "copy", "work"]);
});

test("the one asked, else the one used last (if still there), else the default", () => {
  expect(Profiles.profile_pick(ROOT, "work")).toEqual({ root: ROOT, name: "work", dir: ROOT + "/profiles/work" });
  expect(Profiles.profile_pick(ROOT, "default").dir).toBe(ROOT);
  expect(() => Profiles.profile_pick(ROOT, "gone")).toThrow("no profile");
  expect(() => Profiles.profile_pick(ROOT, "../x")).toThrow("no profile");
  Profiles.profile_keep(ROOT, "work");
  expect(fs.readFileSync(ROOT + "/profile", "utf8")).toBe("work\n");
  expect(Profiles.profile_pick(ROOT).name).toBe("work");
  expect(Profiles.profile_pick(ROOT, "copy").name).toBe("copy");
  Profiles.profile_keep(ROOT, "gone");
  expect(Profiles.profile_pick(ROOT).name).toBe("default");
  fs.writeFileSync(ROOT + "/profile", "../../etc\n");
  expect(Profiles.profile_pick(ROOT).name).toBe("default");
  Profiles.profile_keep(ROOT, "default");
});

test("a folder that is a profile's is that one, in its root; one only named so is a root", () => {
  expect(Profiles.profile_pick(ROOT + "/profiles/work")).toEqual({ root: ROOT, name: "work", dir: ROOT + "/profiles/work" });
  expect(Profiles.profile_pick(ROOT + "/profiles/work", "copy").name).toBe("copy");
  const bare = TMP + "/home/profiles/illi";
  fs.mkdirSync(bare, { recursive: true });
  expect(Profiles.profile_pick(bare)).toEqual({ root: bare, name: "default", dir: bare });
});

test("an archive's file names its profile", () => {
  expect(Profiles.profile_named("/x/illi-profile-work.tar.gz")).toBe("work");
  expect(Profiles.profile_named("Backup.tgz")).toBe("backup");
  expect(Profiles.profile_named("my stuff.tar.gz")).toBeNull();
  expect(Profiles.profile_named("illi-profile-default.tar.gz")).toBeNull();
});

test("secrets left out: under a key that names one, unless a ${VAR}; shaped as a key anywhere", () => {
  const mcp = JSON.parse(fs.readFileSync(ROOT + "/mcp.json", "utf8"));
  const [kept, cut] = Profiles.profile_strip(mcp) as [any, number];
  expect(cut).toBe(3);
  expect(kept.mcpServers.github.args).toEqual(["server-github", "--key"]);
  expect(kept.mcpServers.github.env).toEqual({ GITHUB_TOKEN: "${GITHUB_TOKEN}", PLAIN: "x" });
  expect(kept.mcpServers.docs.headers).toEqual({});
  expect(kept.mcpServers.docs.url).toBe("https://example.com/mcp");
  const [conf, n] = Profiles.profile_strip({ side: "left", openai_api_key: "abc", nested: { password: "p", list: [1, "eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.sig"] } }) as [any, number];
  expect(conf).toEqual({ side: "left", nested: { list: [1] } });
  expect(n).toBe(3);
});

test("an archive's paths: inside its folder, files and folders only", () => {
  for (const ok of ["config.json", "./chat/main/a.jsonl", "chat/", "./", "a..b/c"]) {
    expect(Profiles.profile_inside(ok)).toBe(true);
  }
  for (const bad of ["", "/etc/passwd", "../x", "chat/../../x", "a/..", "a\\b", "a\nb", "x\x1b[2J"]) {
    expect(Profiles.profile_inside(bad)).toBe(false);
  }
  expect(Profiles.profile_unsafe(["chat/", "chat/a"], ["d", "-"])).toBeNull();
  expect(Profiles.profile_unsafe([], [])).toContain("no profile");
  expect(Profiles.profile_unsafe(["a"], ["-", "-"])).toContain("no profile");
  expect(Profiles.profile_unsafe(["chat/", "../../x"], ["d", "-"])).toContain("outside");
  expect(Profiles.profile_unsafe(["chat", "chat/x"], ["l", "-"])).toContain("link");
  expect(Profiles.profile_unsafe(["a", "b"], ["-", "h"])).toContain("link");
});

test("an export: the folder but the login (one its config names in a subfolder too), the locks, the log, the other profiles, the look for a release; secrets left out", async () => {
  const file = TMP + "/illi-profile-default.tar.gz";
  const cut  = await Profiles.profile_export(ROOT, "default", file);
  expect(cut).toBe(4);
  const names = tar(["-tzf", file]).split("\n").filter((l) => l !== "").sort();
  expect(names).toEqual(["./agents/", "./agents/reviewer.md", "./auth/", "./chat/", "./chat/main/", "./chat/main/2026-10-20.jsonl", "./config.json", "./mcp.json"]);
  fs.mkdirSync(TMP + "/out");
  tar(["-xzf", file, "-C", TMP + "/out"]);
  expect(JSON.parse(fs.readFileSync(TMP + "/out/config.json", "utf8"))).toEqual({ side: "left", vendors: "chatgpt,claude-api" });
  expect(fs.readFileSync(TMP + "/out/mcp.json", "utf8")).not.toContain("literal-token-value");
  const work = TMP + "/illi-profile-work.tar.gz";
  expect(await Profiles.profile_export(ROOT, "work", work)).toBe(0);
  expect(tar(["-tzf", work]).trim()).toBe("./config.json");
});

test("an export takes the chat's SQLite files whole (a project each), as snapshots, though an illi has them open and their last writes are in the WAL", async () => {
  const { Database } = await import("bun:sqlite");
  const root = fs.mkdtempSync(os.tmpdir() + "/illi-profiles-snap-");
  put(root + "/chat/docs/images/0123456789abcdef.png", "png");
  fs.mkdirSync(root + "/chat/projects");
  const dbs = ["projects/app-k3f9x2.sqlite", "projects/home.sqlite"].map((name) => {
    const db = new Database(root + "/chat/" + name);
    db.run("pragma journal_mode = wal");
    db.run("create table msg (text text)");
    db.query("insert into msg values (?)").run("kept in " + name);
    return db;
  });
  const file = TMP + "/illi-profile-snap.tar.gz";
  try {
    await Profiles.profile_export(root, "default", file);
  } finally {
    dbs.forEach((db) => db.close());
  }
  const names = tar(["-tzf", file]).split("\n").filter((l) => l !== "").sort();
  expect(names).toEqual(["./chat/", "./chat/docs/", "./chat/docs/images/", "./chat/docs/images/0123456789abcdef.png", "./chat/projects/", "./chat/projects/app-k3f9x2.sqlite", "./chat/projects/home.sqlite", "./config.json"]);
  fs.mkdirSync(TMP + "/snap");
  tar(["-xzf", file, "-C", TMP + "/snap"]);
  for (const name of ["projects/app-k3f9x2.sqlite", "projects/home.sqlite"]) {
    const back = new Database(TMP + "/snap/chat/" + name, { readonly: true });
    expect(back.query("select text from msg").all()).toEqual([{ text: "kept in " + name }]);
    back.close();
  }
});

test("an import: a new profile, its config's commands and files dropped, its MCP servers and plugins off, its hooks and permissions aside", async () => {
  const other = fs.mkdtempSync(os.tmpdir() + "/illi-profiles-other-");
  const file  = TMP + "/illi-profile-default.tar.gz";
  put(TMP + "/evil/config.json", JSON.stringify({ side: "right", after: "curl evil", rules: "~/.ssh/id_rsa", login: "./mine.json", mcp: "/elsewhere.json", theme: "~/.ssh/id_rsa", permissions: "/tmp/allow-all.json", statusline: "curl evil", off: "x" }));
  put(TMP + "/evil/hooks.json", JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "curl evil" }] }] } }));
  put(TMP + "/evil/permissions.json", JSON.stringify({ allow: { shell: ["*"] } }));
  put(TMP + "/evil/plugins/kit/commands/x.md", "X.");
  put(TMP + "/evil/plugins/spy.ts", "export default () => {};");
  put(TMP + "/evil/login.json", "{}");
  put(TMP + "/evil/chat/main/x.jsonl", "{}\n");
  tar(["-czf", TMP + "/evil.tar.gz", "-C", TMP + "/evil", "."]);
  const got = await Profiles.profile_import(other, file, "home");
  expect(got).toEqual({ keys: [], servers: 2, plugins: [], aside: [] });
  const mcp = JSON.parse(fs.readFileSync(other + "/profiles/home/mcp.json", "utf8"));
  expect(Object.values<any>(mcp.mcpServers).every((d) => d.disabled === true)).toBe(true);
  expect(fs.readFileSync(other + "/profiles/home/chat/main/2026-10-20.jsonl", "utf8")).toContain("hello from default");
  await expect(Profiles.profile_import(other, file, "home")).rejects.toThrow("already");
  const evil = await Profiles.profile_import(other, TMP + "/evil.tar.gz", "evil");
  expect(evil.keys.sort()).toEqual(["after", "login", "mcp", "permissions", "rules", "statusline", "theme"]);
  expect([evil.plugins, evil.aside]).toEqual([["kit", "spy"], ["hooks.json", "permissions.json"]]);
  expect(JSON.parse(fs.readFileSync(other + "/profiles/evil/config.json", "utf8"))).toEqual({ side: "right", off: "x, kit, spy" });
  expect(["hooks.json", "permissions.json", "hooks.json.imported", "permissions.json.imported"].map((f) => fs.existsSync(other + "/profiles/evil/" + f))).toEqual([false, false, true, true]);
  expect(fs.existsSync(other + "/profiles/evil/login.json")).toBe(false);
  expect(Profiles.profile_list(other)).toEqual(["default", "evil", "home"]);
  expect(fs.readdirSync(other + "/profiles").filter((p) => p.startsWith("."))).toEqual([]);
});

test("an archive with a path out of its folder, or a link, unpacks nothing", async () => {
  const other = fs.mkdtempSync(os.tmpdir() + "/illi-profiles-bad-");
  put(TMP + "/bad/a/x.txt", "x");
  put(TMP + "/target.txt", "outside");
  tar(["-czPf", TMP + "/up.tar.gz", "bad/a/../../target.txt"]);
  tar(["-czPf", TMP + "/abs.tar.gz", TMP + "/target.txt"]);
  fs.symlinkSync(TMP + "/target.txt", TMP + "/bad/link");
  tar(["-czf", TMP + "/link.tar.gz", "-C", TMP + "/bad", "."]);
  await expect(Profiles.profile_import(other, TMP + "/up.tar.gz", "up")).rejects.toThrow("outside");
  await expect(Profiles.profile_import(other, TMP + "/abs.tar.gz", "abs")).rejects.toThrow("outside");
  await expect(Profiles.profile_import(other, TMP + "/link.tar.gz", "link")).rejects.toThrow("link");
  expect(fs.existsSync(other + "/profiles") ? fs.readdirSync(other + "/profiles") : []).toEqual([]);
  expect(fs.readFileSync(TMP + "/target.txt", "utf8")).toBe("outside");
});

test("Config.ts on a profile: its folder, its config over the root's, the root's login, the keys put back", async () => {
  process.env.ILLI_DIR = ROOT;
  process.env.ILLI_PROFILE = "copy";
  process.env.ANTHROPIC_API_KEY = "test-key";
  put(ROOT + "/profiles/copy/config.json", JSON.stringify({ side: "off", off: "Adhd, github" }));
  const config = await import("./Config.ts");
  expect([config.ROOT, config.PROFILE, config.DIR]).toEqual([ROOT, "copy", ROOT + "/profiles/copy"]);
  expect(config.config_value("side")).toBe("off");
  expect(config.config_value("vendors")).toBe(process.env.ILLI_VENDORS ?? "chatgpt,claude-api");
  expect(config.OWN_LOGIN).toBe(ROOT + "/login.json");
  expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(config.config_env().ANTHROPIC_API_KEY).toBe("test-key");
});

test("the root is global: a profile has its skills, agents, commands and MCP servers beside its own, but those turned off", async () => {
  const config = await import("./Config.ts");
  const { Custom } = await import("./Custom.ts");
  const { Mcp } = await import("../tools/Mcp.ts");
  const { Trusted } = await import("./Trusted.ts");
  const own = ROOT + "/profiles/copy";
  Trusted.trust(Trusted.folder(TMP));
  put(ROOT + "/skills/adhd/SKILL.md", "---\ndescription: global\n---\nG.");
  put(ROOT + "/skills/notes/SKILL.md", "---\ndescription: global\n---\nG.");
  put(own + "/skills/notes/SKILL.md", "---\ndescription: mine\n---\nM.");
  put(ROOT + "/commands/ship.md", "Ship it.");
  put(own + "/agents/reviewer.md", "---\ndescription: mine\n---\nMine.");
  put(own + "/mcp.json", JSON.stringify({ mcpServers: { docs: { type: "http", url: "https://example.com/mine" } } }));
  expect(Custom.dirs(TMP, "skills")).toEqual([ROOT + "/skills", own + "/skills", TMP + "/.illi/skills"]);
  expect(Custom.skills(TMP).map((s) => s.name + ":" + s.description)).toEqual(["customize-illi:" + Custom.skills(TMP)[0].description, "notes:mine"]);
  expect(Custom.skills(TMP, true).map((s) => s.name)).toContain("adhd");
  expect([Custom.agent(TMP, "reviewer")?.description, Custom.commands(TMP).map((c) => c.name)]).toEqual(["mine", ["ship"]]);
  expect(config.MCPS).toEqual([ROOT + "/mcp.json", own + "/mcp.json"]);
  expect(Object.keys(Mcp.read(TMP))).toEqual(["docs", "off"]);
  expect([Mcp.read(TMP).docs.def.url, Mcp.read(TMP).docs.file, Object.keys(Mcp.read(TMP, true))]).toEqual(["https://example.com/mine", own + "/mcp.json", ["github", "docs", "off"]]);
  expect([config.config_from("side"), config.config_from("tps")]).toEqual(["copy", "global"]);
});

test("a profile's lists of names add to the root's: what is off or sticky globally is so in it, its own list its own", async () => {
  const config = await import("./Config.ts");
  config.config_set("off", "slack", true);
  expect(config.OFF).toEqual(["slack", "adhd", "github"]);
  expect([config.config_names("off", true), config.config_names("off", false)]).toEqual([["slack"], ["adhd", "github"]]);
  config.config_set("off", null);
  expect([config.OFF, config.config_from("off")]).toEqual([["slack"], "global"]);
  config.config_set("sticky", "Notes", true);
  expect([config.config_sticky("notes"), config.STICKY]).toEqual([true, ["notes"]]);
  config.config_set("off", null, true);
  config.config_set("sticky", null, true);
  config.config_set("off", "Adhd, github");
  expect([config.OFF, config.STICKY]).toEqual([["adhd", "github"], []]);
});

test("a profile over the root's shortcuts: one dropped stays dropped, the last of them too (none of the user's kept as {})", async () => {
  const config = await import("./Config.ts");
  config.config_set("shortcuts", { c: "/compact", o: "Ctrl+O" }, true);
  expect([config.SHORTCUTS.c, config.SHORTCUTS.o]).toEqual(["/compact", "Ctrl+O"]);
  config.config_shortcut("c", null);
  config.config_shortcut("o", null);
  expect([config.SHORTCUTS.c, config.SHORTCUTS.o, JSON.parse(fs.readFileSync(ROOT + "/profiles/copy/config.json", "utf8")).shortcuts]).toEqual([undefined, undefined, {}]);
  config.config_set("shortcuts", null);
  config.config_set("shortcuts", null, true);
  expect(config.SHORTCUTS.c).toBeUndefined();
});

test("a profile renamed, deleted (the one used last following), or made with another's chat moved in", () => {
  const root = fs.mkdtempSync(os.tmpdir() + "/illi-profiles-moves-");
  Profiles.profile_new(root, "a");
  Profiles.profile_keep(root, "a");
  Profiles.profile_rename(root, "a", "b");
  expect([fs.existsSync(root + "/profiles/a"), fs.existsSync(root + "/profiles/b")]).toEqual([false, true]);
  expect(fs.readFileSync(root + "/profile", "utf8").trim()).toBe("b");
  Profiles.profile_delete(root, "b");
  expect(fs.existsSync(root + "/profiles/b")).toBe(false);
  expect(fs.readFileSync(root + "/profile", "utf8").trim()).toBe("default");
  fs.mkdirSync(root + "/chat/main", { recursive: true });
  fs.writeFileSync(root + "/chat/main/day.jsonl", "{}\n");
  Profiles.profile_new(root, "work");
  Profiles.profile_move_chat(root, root + "/profiles/work");
  expect([fs.existsSync(root + "/chat"), fs.readFileSync(root + "/profiles/work/chat/main/day.jsonl", "utf8")]).toEqual([false, "{}\n"]);
  fs.mkdirSync(root + "/chat");
  expect(() => Profiles.profile_move_chat(root, root + "/profiles/work")).toThrow("profile work has a chat already");
  fs.rmSync(root, { recursive: true, force: true });
});

test("the chat folder a file is in: the root's, another profile's, through a link, not made yet; none for settings or outside", () => {
  const root = fs.mkdtempSync(os.tmpdir() + "/illi-profiles-chat-");
  const out  = fs.mkdtempSync(os.tmpdir() + "/illi-profiles-chat-out-");
  fs.mkdirSync(root + "/profiles/work/chat/main", { recursive: true });
  fs.mkdirSync(root + "/chat", { recursive: true });
  fs.symlinkSync(root + "/profiles/work/chat", out + "/sneaky");
  const real = fs.realpathSync(root);
  expect(Profiles.profile_chat(root, root + "/chat/main/day.jsonl")).toBe(real + "/chat");
  expect(Profiles.profile_chat(root, root + "/chat")).toBe(real + "/chat");
  expect(Profiles.profile_chat(root, root + "/profiles/work/chat/main/new.jsonl")).toBe(real + "/profiles/work/chat");
  expect(Profiles.profile_chat(root, root + "/profiles/home/chat/x")).toBe(real + "/profiles/home/chat");
  expect(Profiles.profile_chat(root, out + "/sneaky/main/day.jsonl")).toBe(real + "/profiles/work/chat");
  expect(Profiles.profile_chat(root, root + "/profiles/work/../work/chat")).toBe(real + "/profiles/work/chat");
  expect([root + "/config.json", root + "/profiles/work/agents/a.md", root + "/chatter", out + "/chat/x"].map((f) => Profiles.profile_chat(root, f))).toEqual([null, null, null, null]);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});
