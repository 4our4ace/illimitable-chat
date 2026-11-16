// Access test
// ===========
// `bun test Access.test.ts`. What a call asks leave for: a file inside by
// its path from the working dir, outside by its absolute path after its
// folder's request (a file's folder, a folder's own; saving its git
// repository's); one inside by a link whose real place is outside (a
// folder's, a file's, a file not there yet) asking for that folder too,
// as if named, its resource as written and its real place's (a working
// dir or project top reached by a link: none), so a rule on a .env
// finds one through a link; illi's own RULES.md alone
// of its folder; a shell
// command's simple commands as written (assignments off, wrappers kept,
// a wrapper's script and what it runs both) and unquoted (a system
// program by name), a cd only for its folder, the folders its words and
// redirections name (not a stream device, not a pattern that only looks
// like a path; one with a space or a quote, a ~user, a value glued to an
// option or a name, a redirection made as it runs, a disk's device all
// the same), a heredoc's body never a command; one Shell.ts can't read
// split crudely, so a rule still finds what is in it; the families
// "don't ask again" saves (none for a folder whose path holds a
// wildcard), folders inside another said as the outermost by their
// paths; Claude Code's tools as illi's like ones. And
// the rules on them: sudo * denies sudo's commands, bash * a bash -c, rm
// * an rm in a case, rm -rf /* a quoted 'rm' -rf "/" and /bin/rm; git
// push * a git -C x push, git -C * the same (both readings met), its
// words as written through its family saved with that family (never git
// -C * nor git *; a blank or wildcard word, a dry run, a command short
// of its family saved exactly), so a git -C x push --force still asks;
// rm * one a git setting, an alias or GIT_SSH_COMMAND runs, one made as
// it runs or set for a shell of its own too; the folder git -C, make -C
// or sudo -D moves to asked for from the folder in force there, a
// redirection made in the shell's, a script git runs from its
// repository's top too, a wrapper's own paths (time -o, flock), git's
// path variables. Many settings met by many git commands read quickly.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as config from "../config/Config.ts";
import { Access, type Where } from "./Access.ts";
import { Permissions, type Rule } from "./Permissions.ts";
import { Shell } from "./Shell.ts";

const DIR   = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + "/illi-access-"));
const APP   = DIR + "/app";
const LIB   = DIR + "/lib";
const WHERE: Where = { cwd: APP + "/src", top: APP, files: [DIR + "/illi/RULES.md"], guarded: [DIR + "/illi/RULES.md", DIR + "/illi/skills/*"] };
const ROOT  = fs.readFileSync("/etc/passwd", "utf8").split("\n").find((l) => l.startsWith("root:"))!.split(":")[5];

fs.mkdirSync(APP + "/src", { recursive: true });
fs.mkdirSync(APP + "/.git");
fs.mkdirSync(LIB + "/repo/.git", { recursive: true });
fs.mkdirSync(LIB + "/repo/pkg");
fs.mkdirSync(DIR + "/illi");
fs.symlinkSync(LIB + "/repo/pkg", APP + "/src/out");
fs.symlinkSync(LIB + "/n.txt", APP + "/src/notes.md");
fs.symlinkSync(LIB + "/missing.txt", APP + "/src/dangle.md");
fs.symlinkSync(APP + "/README.md", APP + "/src/readme.md");
fs.symlinkSync(APP, DIR + "/app-link");
fs.writeFileSync(APP + "/.env", "KEY=1\n");
fs.writeFileSync(LIB + "/.env", "KEY=1\n");
fs.symlinkSync(APP + "/.env", APP + "/src/settings.txt");
fs.symlinkSync(LIB + "/.env", APP + "/src/lib-settings");
fs.writeFileSync(DIR + "/illi/RULES.md", "");
fs.symlinkSync(DIR + "/illi/RULES.md", APP + "/src/rules.md");

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

const shell = (command: string) => Access.shell(WHERE, command).map((r) => [r.action, r.resources, r.save]);
const judge = (command: string, rules: Rule[]) => {
  const base = Permissions.base([]);
  return Access.shell(WHERE, command).map((r) => Permissions.decide(r.action, r.resources, [...base, ...rules], []).effect);
};
const rule = (action: string, resource: string, effect: Rule["effect"]): Rule => ({ action, resource, effect });

test("files: inside by their path from the working dir; outside absolute, after their folder's request, saving its repository's", () => {
  expect(Access.requests(WHERE, "read", { path: "a.ts" })).toEqual([{ action: "read", resources: ["a.ts"], save: ["*"], spots: [null] }]);
  expect(Access.requests(WHERE, "read", { path: APP + "/README.md" })[0].resources).toEqual(["../README.md"]);
  expect(Access.requests(WHERE, "read", { path: "." })[0].resources).toEqual(["."]);
  expect(Access.requests(WHERE, "write", { path: LIB + "/repo/pkg/x.ts", content: "" })).toEqual([
    { action: "external_directory", resources: [LIB + "/repo/pkg/*"], save: [LIB + "/repo/*"], spots: [null] },
    { action: "edit", resources: [LIB + "/repo/pkg/x.ts"], save: ["*"], spots: [null] },
  ]);
  expect(Access.requests(WHERE, "edit", { edits: [{ path: "a.ts" }, { path: LIB + "/n.txt" }, { path: LIB + "/m.txt" }] })).toEqual([
    { action: "external_directory", resources: [LIB + "/*"], save: [LIB + "/*"], spots: [null] },
    { action: "edit", resources: ["a.ts", LIB + "/n.txt", LIB + "/m.txt"], save: ["*"], spots: [null, null, null] },
  ]);
  expect(Access.requests(WHERE, "write", { path: DIR + "/illi/RULES.md" })[0]).toEqual({ action: "external_directory", resources: [DIR + "/illi/RULES.md"], save: [DIR + "/illi/RULES.md"], spots: [null] });
  expect(Access.requests(WHERE, "write", { path: DIR + "/illi/config.json" })[0].resources).toEqual([DIR + "/illi/*"]);
});

test("a link inside that leads outside asks for its real folder too, as if named (a folder's, a file's, a file not there yet a write would make), the path's resource as written and its real place's; one that stays inside, by its path from there; a working dir reached by a link, none", () => {
  const outside = (folder: string) => ({ action: "external_directory", resources: [folder + "/*"], save: [LIB + (folder === LIB ? "" : "/repo") + "/*"], spots: [null] });
  expect(Access.requests(WHERE, "read", { path: "out/x.ts" })).toEqual([outside(LIB + "/repo/pkg"), { action: "read", resources: ["out/x.ts", LIB + "/repo/pkg/x.ts"], save: ["*"], spots: [null, null] }]);
  expect(Access.requests(WHERE, "write", { path: "notes.md", content: "" })).toEqual([outside(LIB), { action: "edit", resources: ["notes.md", LIB + "/n.txt"], save: ["*"], spots: [null, null] }]);
  expect(Access.requests(WHERE, "write", { path: "dangle.md", content: "" })[0]).toEqual(outside(LIB));
  expect(shell("echo x > notes.md")[0]).toEqual(["external_directory", [LIB + "/*"], [LIB + "/*"]]);
  expect(Access.requests(WHERE, "read", { path: "readme.md" })).toEqual([{ action: "read", resources: ["readme.md", "../README.md"], save: ["*"], spots: [null, null] }]);
  expect(Access.requests(WHERE, "read", { path: "a.ts" })[0].resources).toEqual(["a.ts"]);
  expect(Access.requests({ ...WHERE, cwd: DIR + "/app-link/src" }, "edit", { edits: [{ path: "a.ts" }, { path: "lib/b.ts" }] })).toEqual([{ action: "edit", resources: ["a.ts", "lib/b.ts"], save: ["*"], spots: [null, null] }]);
  expect(Access.requests({ ...WHERE, cwd: DIR + "/app-link/src", top: DIR + "/app-link" }, "edit", { edits: [{ path: "../README.md" }] })).toEqual([{ action: "edit", resources: ["../README.md"], save: ["*"], spots: [null] }]);
});

test("a .env read through a link asks as the .env itself does, inside or out; a rule on the real file's path finds it", () => {
  const read = (p: string, rules: Rule[] = []) => Access.requests(WHERE, "read", { path: p }).map((r) => Permissions.decide(r.action, r.resources, [...Permissions.base([]), ...rules], []).effect);
  expect(read("../.env")).toEqual(["ask"]);
  expect(read("settings.txt")).toEqual(["ask"]);
  expect(read("lib-settings", [rule("external_directory", LIB + "/*", "allow")])).toEqual(["allow", "ask"]);
  expect(read("notes.md", [rule("external_directory", LIB + "/*", "allow"), rule("read", LIB + "/n.txt", "deny")])).toEqual(["allow", "deny"]);
});

test("a change to illi's own instructions asks, by the file tools, wherever the chat runs (illi's folder inside it, as from home, or reached by a link): \"don't ask again\" saves that place alone; reading them, or a change beside them, doesn't ask", () => {
  const base = Permissions.base([DIR + "/illi/*"], WHERE.guarded);
  const judge = (where: Where, tool: string, input: object) => Access.requests(where, tool, input).map((r) => [r.action, Permissions.decide(r.action, r.resources, base, []).effect, r.save]);
  const HOME: Where = { ...WHERE, cwd: DIR, top: DIR };
  expect(judge(WHERE, "write", { path: DIR + "/illi/skills/x/SKILL.md", content: "" })).toEqual([["external_directory", "allow", [DIR + "/illi/skills/x/*"]], ["edit", "ask", [DIR + "/illi/skills/*"]]]);
  expect(judge(HOME, "edit", { edits: [{ path: "illi/RULES.md" }, { path: "app/a.ts" }] })).toEqual([["edit", "ask", [DIR + "/illi/RULES.md"]]]);
  expect(judge(WHERE, "write", { path: "rules.md", content: "" })).toEqual([["external_directory", "allow", [DIR + "/illi/RULES.md"]], ["edit", "ask", [DIR + "/illi/RULES.md"]]]);
  expect(judge(HOME, "read", { path: "illi/RULES.md" })).toEqual([["read", "allow", ["*"]]]);
  expect(judge(HOME, "write", { path: "illi/config.json", content: "" })).toEqual([["edit", "allow", ["*"]]]);
  expect(Access.said("edit", DIR + "/illi/skills/*", APP)).toBe("changes to " + DIR + "/illi/skills/");
  expect(Permissions.decide("edit", [DIR + "/illi/RULES.md"], [...base, rule("edit", DIR + "/illi/*", "allow")], []).effect).toBe("allow");
});

test("illi's own folder is outside every project, the home chat's too: its settings, hooks and permissions asked about from there as from anywhere", () => {
  const home: Where = { ...WHERE, cwd: path.dirname(config.ROOT), top: path.dirname(config.ROOT) };
  const base = Permissions.base(Access.places(home.cwd), Access.guarded());
  const judge = (file: string) => Access.requests(home, "write", { path: file, content: "" }).map((r) => [r.action, Permissions.decide(r.action, r.resources, base, []).effect]);
  expect(judge(config.ROOT + "/hooks.json")).toEqual([["external_directory", "ask"], ["edit", "allow"]]);
  expect(judge(config.ROOT + "/permissions.json")).toEqual([["external_directory", "ask"], ["edit", "allow"]]);
  expect(judge(path.dirname(config.ROOT) + "/notes.md")).toEqual([["edit", "allow"]]);
});

test("illi's other tools, MCP tools: their own action", () => {
  expect(Access.requests(WHERE, "spawn", { tasks: ["x"] })).toEqual([{ action: "subagent", resources: ["general"], save: ["*"], spots: [null] }]);
  expect(Access.requests(WHERE, "spawn", { tasks: ["x"], agent: "reviewer" })[0].resources).toEqual(["reviewer"]);
  expect(Access.requests(WHERE, "skill", { name: "pdf" })).toEqual([{ action: "skill", resources: ["pdf"], save: ["pdf"], spots: [null] }]);
  expect(Access.requests(WHERE, "ask", {})[0].action).toBe("question");
  expect(Access.requests(WHERE, "mcp__gh__merge", {})).toEqual([{ action: "mcp__gh__merge", resources: ["*"], save: ["*"], spots: [null] }]);
  expect(Access.requests(WHERE, "zoom", { id: 3 })[0].action).toBe("zoom");
});

test("shell: each simple command as written, assignments off, wrappers kept, the command a wrapper runs too; families saved by their head", () => {
  expect(shell("FOO=1 git push origin main > out.txt 2>&1")).toEqual([["shell", ["git push origin main > out.txt 2>&1", "git push origin main"], ["git push *"]]]);
  expect(shell("npm run build && bun test src/x.test.ts | tail -5")).toEqual([["shell", ["npm run build", "bun test src/x.test.ts", "tail -5"], ["npm run build *", "bun test *", "tail *"]]]);
  expect(shell("sudo rm -rf build")).toEqual([["shell", ["sudo rm -rf build", "rm -rf build"], ["sudo *", "rm *"]]]);
  expect(shell("bash -c 'ls -la; rm x'")).toEqual([["shell", ["ls -la", "rm x", "bash -c 'ls -la; rm x'"], ["ls *", "rm *", "bash *"]]]);
  expect(shell("git commit -m 'a; b'")).toEqual([["shell", ["git commit -m 'a; b'", "git commit -m a; b"], ["git commit *"]]]);
  expect(shell("for f in *.ts; do wc -l $f; done")).toEqual([["shell", ["wc -l $f", "wc -l *.ts"], ["wc *"]]]);
  expect(shell("cat <<EOF > out.txt\nrm -rf /\nEOF\necho done")[0][1]).toEqual(["cat <<EOF > out.txt", "cat", "echo done"]);
  expect(shell("echo $(git rev-parse HEAD)")[0][1]).toEqual(["git rev-parse HEAD", "echo $(git rev-parse HEAD)"]);
});

test("shell's folders outside: a cd's (the cd no command), words and redirections naming paths; not devices, nor what only looks like a path", () => {
  expect(shell("cd " + LIB + " && rm -rf x")).toEqual([["external_directory", [LIB + "/*"], [LIB + "/*"]], ["shell", ["rm -rf x"], ["rm *"]]]);
  expect(shell("cd ..")).toEqual([]);
  expect(shell("ls ../../lib/repo/pkg > /dev/null 2>&1")).toEqual([["external_directory", [LIB + "/repo/pkg/*"], [LIB + "/repo/*"]], ["shell", ["ls ../../lib/repo/pkg > /dev/null 2>&1", "ls ../../lib/repo/pkg"], ["ls *"]]]);
  expect(shell("echo x > " + LIB + "/out.txt")[0]).toEqual(["external_directory", [LIB + "/*"], [LIB + "/*"]]);
  expect(shell("grep -r x --include=" + LIB + "/repo/pkg")[0][1]).toEqual([LIB + "/repo/pkg/*"]);
  expect(shell("ls " + LIB + "/repo/*.ts")[0][1]).toEqual([LIB + "/repo/*"]);
  expect(shell("sed -n '/start/,/end/p' f.txt; awk '/foo/ {print}' g; grep -E '/api/v1' x")).toHaveLength(1);
  expect(shell("curl https://example.com/a -o out.json")).toHaveLength(1);
  expect(shell("echo hi >> " + DIR + "/illi/RULES.md")[0]).toEqual(["external_directory", [DIR + "/illi/RULES.md"], [DIR + "/illi/RULES.md"]]);
});

test("shell's folders outside however written: a space or quote in the path, a ~user, a value glued to an option or a name, a redirection made as it runs; a disk's device", () => {
  fs.mkdirSync(LIB + "/My Dir", { recursive: true });
  expect(shell("rm -rf \"" + LIB + "/My Dir\"")[0]).toEqual(["external_directory", [LIB + "/My Dir/*"], [LIB + "/My Dir/*"]]);
  expect(shell("echo x > '" + LIB + "/a b,c'")[0][1]).toEqual([LIB + "/*"]);
  expect(shell("dd if=x of=" + LIB + "/out")[0][1]).toEqual([LIB + "/*"]);
  expect(shell("curl -o" + LIB + "/x https://x.dev")[0][1]).toEqual([LIB + "/*"]);
  expect(shell("echo x >> " + LIB + "/rc$N")[0][1]).toEqual([LIB + "/*"]);
  expect(shell("cat ~root/x")[0]).toEqual(["external_directory", [ROOT + "/*"], [ROOT + "/*"]]);
  expect(shell("ls ~nosuchuser-illi/x")[0][1]).toEqual([path.join(path.dirname(os.homedir()), "nosuchuser-illi") + "/*"]);
  expect(shell("x --path=" + LIB + "/a:" + APP + "/b")[0][1]).toEqual([LIB + "/*"]);
  expect(shell("cp x /dev/sda")[0]).toEqual(["external_directory", ["/dev/*"], ["/dev/*"]]);
  expect(shell("ls > /dev/null 2> /dev/stderr < /dev/tty")).toHaveLength(1);
  expect(shell("cut -d/ -f2 a.txt; awk -F/ '{print $NF}' x; sort -t/ -k2 a")).toHaveLength(1);
  expect(shell("export PATH=\"$HOME/.local/bin:$PATH\"; declare X=" + LIB)).toHaveLength(1);
  expect(shell("case x in *) cat ~root/x; curl -o" + LIB + "/x u; cut -d/ y ;; esac").map((r) => r[1])[0]).toEqual([ROOT + "/*", LIB + "/*"]);
});

test("a folder outside whose path holds * or ? saves nothing, a pattern of it allowing more; outermost: folders inside another by their paths, a * in a name only that character", () => {
  expect(shell("cat \"" + LIB + "/*/x\" " + LIB + "/repo/pkg/y")[0]).toEqual(["external_directory", [LIB + "/*/*", LIB + "/repo/pkg/*"], [LIB + "/repo/*"]]);
  expect(shell("cat \"" + LIB + "/a?/x\"")[0]).toEqual(["external_directory", [LIB + "/a?/*"], []]);
  expect(Access.outermost([LIB + "/*/*", LIB + "/repo/pkg/*", LIB + "/a?/*", LIB + "/ab/*"])).toEqual([LIB + "/*/*", LIB + "/repo/pkg/*", LIB + "/a?/*", LIB + "/ab/*"]);
  expect(Access.outermost([LIB + "/a/b/*", LIB + "/ab/*", LIB + "/a/*", LIB + "/a/*"])).toEqual([LIB + "/ab/*", LIB + "/a/*"]);
  expect(Access.outermost([DIR + "/illi/RULES.md", LIB + "/a/*", DIR + "/*"])).toEqual([DIR + "/*"]);
});

test("shell Shell.ts can't read: split crudely, its paths found by their look", () => {
  expect(shell("case x in *) rm -rf " + LIB + " ;; esac")).toEqual([["external_directory", [LIB + "/*"], [LIB + "/*"]], ["shell", ["rm -rf " + LIB], ["rm *"]]]);
  expect(shell("f() { cat ~/x; }; f")[1][1]).toContain("cat ~/x");
});

test("rules on shell: sudo * denies sudo's commands, bash * a bash -c's, rm * an rm a case holds; a deny wins over a later ask", () => {
  expect(judge("sudo rm -rf build", [rule("shell", "sudo *", "deny")])).toEqual(["deny"]);
  expect(judge("bash -c 'ls'", [rule("shell", "bash *", "deny")])).toEqual(["deny"]);
  expect(judge("case x in *) rm -rf y ;; esac", [rule("shell", "rm *", "deny")])).toEqual(["deny"]);
  expect(judge("X=1 rm -rf y", [rule("shell", "rm -rf *", "deny")])).toEqual(["deny"]);
  expect(judge("rm -rf \"/\"; 'rm' -rf /; /bin/rm -rf /", [rule("shell", "rm -rf /*", "deny")])).toEqual(["ask", "deny"]);
  expect(judge("for d in /tmp /var; do rm -rf \"$d/x\"; done", [rule("shell", "rm -rf /var/*", "deny")]).at(-1)).toBe("deny");
  expect(Access.shell(WHERE, "/bin/rm -rf '/'").at(-1)!.resources).toEqual(["/bin/rm -rf '/'", "rm -rf /"]);
  expect(judge("git push && git status", [rule("shell", "git push *", "ask")])).toEqual(["ask"]);
  expect(judge("git status", [rule("shell", "git push *", "ask")])).toEqual(["allow"]);
  expect(judge("cd " + LIB + " && ls", [])).toEqual(["ask", "allow"]);
  expect(judge("cd " + LIB + " && ls", [rule("external_directory", LIB + "/*", "allow")])).toEqual(["allow", "allow"]);
});

test("rules find a command however its program's own options sit before what it does (git -C x push), and those naming an option it as written; \"don't ask again\" saves its words through its family and that family, never every use of the option; a command a git setting, an alias or a variable runs found as well", () => {
  expect(judge("git -C . push --force", [rule("shell", "git push *", "ask")])).toEqual(["ask"]);
  expect(judge("sudo npm install -g x", [rule("shell", "npm install -g *", "deny")])).toEqual(["deny"]);
  expect(judge("timeout 5 kubectl --context prod delete ns x", [rule("shell", "kubectl --context prod *", "deny")])).toEqual(["deny"]);
  expect(judge("git -c alias.push=status push", [rule("shell", "git push *", "deny")])).toEqual(["deny"]);
  expect(judge("git -c alias.p=push p", [rule("shell", "git push *", "deny")])).toEqual(["deny"]);
  expect(judge("kubectl --context prod -n x delete pod y", [rule("shell", "kubectl delete *", "ask")])).toEqual(["ask"]);
  expect(judge("GIT_SSH_COMMAND='rm -rf x' git fetch", [rule("shell", "rm *", "deny")])).toEqual(["deny"]);
  expect(judge("git -c core.pager='rm -rf x' log", [rule("shell", "rm *", "deny")])).toEqual(["deny"]);
  expect(judge("export EDITOR=\"${EDITOR:-vim}\"; sudo rm -rf build", [rule("shell", "rm *", "deny")])).toEqual(["deny"]);
  expect(judge("git -c 'alias.x=!f() { rm -rf y; }; f' x", [rule("shell", "rm *", "deny")])).toEqual(["deny"]);
  expect(shell("git -C . push origin")).toEqual([["shell", ["git -C . push origin", "git push origin"], ["git -C . push *", "git push *"]]]);
  expect(shell("make -n deploy")).toEqual([["shell", ["make -n deploy"], ["make -n deploy"]]]);
  const ask = [...Permissions.base([]), rule("shell", "git *", "ask")];
  const saved = Access.shell(WHERE, "git -C . status")[0].save.map((r) => rule("shell", r, "allow"));
  const decide = (c: string) => Permissions.decide("shell", Access.shell(WHERE, c)[0].resources, ask, saved).effect;
  expect(["git -C . status", "git -C . status -s", "git status", "git -C . push --force", "git -C . --no-literal-pathspecs push --force", "git -C ../x status"].map(decide)).toEqual(["allow", "allow", "allow", "ask", "ask", "ask"]);
});

test("the folder a program's option or a wrapper moves to asks, from the shell's folder (one known only as it runs by its known head, one with a ~ as home); a redirection is made in the shell's folder; the paths a wrapper's own words name ask, its other words not", () => {
  expect(shell("git -C " + LIB + " status")[0]).toEqual(["external_directory", [LIB + "/*"], [LIB + "/*"]]);
  expect(shell("make -C ../../lib deploy")[0][1]).toEqual([LIB + "/*"]);
  expect(shell("env -C ../../lib ls")[0][1]).toEqual([LIB + "/*"]);
  expect(shell("sudo -D " + LIB + " ls")[0][1]).toEqual([LIB + "/*"]);
  expect(shell("git -C " + LIB + "/$X log")[0][1]).toEqual([LIB + "/*"]);
  expect(shell("git -C sub log > ../../lib/out")[0][1]).toEqual([LIB + "/*"]);
  expect(shell("/usr/bin/time -o " + LIB + "/t true")[0][1]).toEqual([LIB + "/*"]);
  expect(shell("flock " + LIB + "/lock -c 'true'")[0][1]).toEqual([LIB + "/*"]);
  expect(shell("git --git-dir=" + LIB + "/repo/.git log")[0][1]).toEqual([LIB + "/repo/.git/*"]);
  expect(shell("timeout 5 git -C . status; xargs -d / echo; exec -a /bin/x ls")).toHaveLength(1);
});

test("\"don't ask again\" never saves a whole program: its family read on the program by name (/usr/bin/git, 'git'), its options quoted or not; a word up to there blank or holding * or ? saved exactly (none with a wildcard); a command short of its family, and a dry run, exactly; leading assignments off its saves, a wrapper's through its family", () => {
  const saves = (c: string) => Access.shell(WHERE, c).find((r) => r.action === "shell")!.save;
  expect(saves("/usr/bin/git -C . status")).toEqual(["/usr/bin/git -C . status *", "git -C . status *", "/usr/bin/git status *", "git status *"]);
  expect(saves("'git' -C . status")).not.toContain("git *");
  expect(saves("git '-C' . status 2>/dev/null")).toEqual(["git '-C' . status *", "git -C . status *", "git status *"]);
  expect(saves("git -C '*' status")).toEqual(["git status"]);
  expect(saves("git -C . ''")).toEqual(["git -C . ''", "git -C .", "git ''", "git"]);
  expect(saves("kubectl -n prod ''")).not.toContain("kubectl *");
  expect(saves("git")).toEqual(["git"]);
  expect(saves("npm run")).toEqual(["npm run"]);
  expect(saves("make deploy -n")).toEqual(["make deploy -n"]);
  expect(saves("make -kn deploy")).toEqual(["make -kn deploy"]);
  expect(saves("make -j4 deploy")).toEqual(["make -j4 deploy *", "make deploy *"]);
  expect(saves("git -C . push --dry-run")).toEqual(["git -C . push --dry-run", "git push --dry-run"]);
  expect(saves("N=-n; make deploy $N")).toEqual(["make deploy $N", "make deploy -n"]);
  expect(saves("D=--dry-run; git push $D")).toEqual(["git push $D", "git push --dry-run"]);
  expect(saves("make deploy $'-n'")).toEqual(["make deploy $'-n'", "make deploy -n"]);
  expect([saves("git '*'"), saves("npm run '*'"), saves("X='*'; git \"$X\"")]).toEqual([[], [], ["git \"$X\""]]);
  expect(saves("FOO=1 git -C . status")).toEqual(["git -C . status *", "git status *"]);
  expect(saves("sudo git -C . status")).toEqual(["sudo git -C . status *", "git -C . status *", "git status *"]);
});

test("a command's text at its top (a comment after it, a parenthesis) saves itself alone where a command read in it does, nothing where that saves nothing; git's dry runs by -n and as short as git takes them, make's long ones as short too and by MAKEFLAGS; one short of what it does behind its options; a program word with * or ?", () => {
  const saves = (c: string) => Access.shell(WHERE, c).find((r) => r.action === "shell")!.save;
  const widens = (c: string, family: string) => saves(c).some((x) => Permissions.match(family, x));
  for (const [c, real] of [
    ["N=-n; make deploy $N # dry", "make deploy"],
    ["make deploy $'-n' # dry", "make deploy"],
    ["N=-n; ( make deploy $N )", "make deploy"],
    ["( git push $'--dry-run' origin )", "git push --force origin"],
    ["git push -n origin", "git push --force origin"],
    ["git -C . push -nf origin", "git -C . push --force origin"],
    ["git push --dry origin", "git push --force origin"],
    ["make deploy --dry", "make deploy"],
    ["make deploy --just", "make deploy"],
    ["MAKEFLAGS=n make deploy", "make deploy"],
    ["git push --dr origin main", "git push --force origin"],
    ["git push --dry-run=x origin", "git push --force origin"],
    ["git push ${D:---dry-run} origin", "git push --force origin"],
    ["D=--dry-run; git push $D origin", "git push --force origin"],
    ["git remote prune -n origin", "git remote prune origin"],
    ["make deploy --dr", "make deploy"],
    ["make deploy --re", "make deploy"],
    ["make deploy MAKEFLAGS=n", "make deploy"],
    ["GNUMAKEFLAGS=-n make deploy", "make deploy"],
    ["MAKEFLAGS='k --dry-run' make deploy", "make deploy"],
    ["MAKEFLAGS=--dr make deploy", "make deploy"],
    ["N=-n; make deploy $N; x=(a)", "make deploy"],
    ["( git push $'--dry-run' ); x=(a)", "git push --force origin"],
    ["npm --prefix app run", "npm --prefix app run deploy"],
    ["git -C . stash", "git -C . stash drop"],
    ["( * x )", "rm -rf build"],
  ]) {
    expect([c, widens(c, real)]).toEqual([c, false]);
  }
  expect(saves("MAKEFLAGS=n make deploy")).toEqual([]);
  // git's -n where it isn't a dry run (commit: no hooks) saves its family
  expect(saves("git commit -n -m x")).toContain("git commit *");
});

test("each script is read once a check where it runs and as the shell is then: a variable set before, a subshell's own, git's settings given it; reading each anew loses no reading", () => {
  const external = (c: string) => Access.shell(WHERE, c).filter((r) => r.action === "external_directory").flatMap((r) => r.resources);
  expect(external("(HOME=x; EDITOR='cat $HOME/.ssh/id_rsa' true); (EDITOR='cat $HOME/.ssh/id_rsa' git commit)")).toContain(os.homedir() + "/.ssh/*");
  expect(judge("(SHELL=x; PAGER='$SHELL -c \"rm -rf y\"' true); (PAGER='$SHELL -c \"rm -rf y\"' man ls)", [rule("shell", "rm *", "deny")])).toEqual(["deny"]);
  const all = (c: string) => Access.shell(WHERE, c).flatMap((r) => r.resources);
  for (const c of [
    "(HOME=x; EDITOR='cat $HOME/.ssh/id_rsa' true); (EDITOR='cat $HOME/.ssh/id_rsa' git commit)",
    "EDITOR='vim a' git commit; X=1; EDITOR='vim a' git commit; cd /tmp; EDITOR='vim a' git commit",
    "git -c alias.p='!git -c alias.q=push q' p; git -c alias.q=status p",
    "GIT_SSH_COMMAND='ssh -i k' git fetch; GIT_SSH_COMMAND='ssh -i k' git -C .. fetch",
  ]) {
    const on = all(c);
    expect([c, Shell.unmemoed(() => all(c)).filter((x) => !on.includes(x))]).toEqual([c, []]);
  }
});

test("git aliases however given (-c, the environment by number, GIT_CONFIG_PARAMETERS, a key with no value), each value read whatever the order; an option word of several values among options taking values, or past their ways; += and a for loop's variable; a quoted assignment to env or sudo; a sendemail identity's command", () => {
  const deny = [rule("shell", "git push *", "deny"), rule("shell", "rm *", "deny")];
  for (const c of [
    "GIT_CONFIG_KEY_0=alias.x git -c alias.x=push x",
    "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.x GIT_CONFIG_VALUE_0=status git -c alias.x=push x",
    "GIT_CONFIG_PARAMETERS=\"'alias.x=status'\" git -c alias.x=push x",
    "GIT_CONFIG_KEY_1=alias.x GIT_CONFIG_VALUE_1=push GIT_CONFIG_KEY_0=alias.x GIT_CONFIG_VALUE_0=status GIT_CONFIG_COUNT=2 git x",
    "for o in -c -C; do git -c a=b $o alias.x=push x; done",
    "for o in -c -C; do git --git-dir .git $o alias.x=push x; done",
    "for a in -p --git-dir=.git; do git $a $a $a $a push; done",
    "GIT_SSH_COMMAND+='rm -rf y' git fetch",
    "export GIT_SSH_COMMAND+='rm -rf y'; git fetch",
    "GIT_SSH_COMMAND=rm; GIT_SSH_COMMAND+=' -rf y' git fetch",
    "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.x GIT_CONFIG_VALUE_0+=push git x",
    "export GIT_SSH_COMMAND; for GIT_SSH_COMMAND in 'rm -rf y'; do git fetch; done",
    "env \"A=1 2\" git push origin",
    "sudo \"A=1 2\" git push origin",
    "env \"GIT_SSH_COMMAND=rm -rf y\" git fetch",
    "git -c sendemail.identity=x -c sendemail.x.sendmailcmd='rm -rf y' send-email p",
  ]) {
    expect([c, judge(c, deny)]).toEqual([c, ["deny"]]);
  }
  // past its ways, the command asks too, whatever else allows it
  const past = Access.shell(WHERE, "for a in -p --git-dir=.git; do git $a $a $a $a status; done").at(-1)!;
  expect(past.failed).toBeDefined();
});

test("a value made as it runs is read by its text, loosely past a variable; a git setting's key made as it runs taken as any; aliases followed however deep; git's settings in variables read where set and into a shell of its own; tar's command; an option word of several values read with each, a number's option before a word made as it runs both ways", () => {
  const deny = [rule("shell", "rm *", "deny"), rule("shell", "git push *", "deny")];
  for (const c of [
    "git -c \"core.pager=rm -rf y $NOPE\" log",
    "GIT_SSH_COMMAND=$NOPE'rm -rf y' git fetch",
    "git -c core.pager=$NOPE'rm -rf y' log",
    "git -c alias.p=$NOPE'!rm -rf y' p",
    "git -c alias.p=\"push $X\" p",
    "git -c alias.p='push '$X p",
    "git -c alias.$X=push p",
    "git -c $X=push p --force",
    "git -c alias.a=b -c alias.b=c -c alias.c=d -c alias.d=e -c alias.e=f -c alias.f=g -c alias.g=h -c alias.h=i -c alias.i=push a --force",
    "export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.sshCommand GIT_CONFIG_VALUE_0='rm -rf x'; bash -c 'git fetch'",
    "export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.s GIT_CONFIG_VALUE_0=push; bash -c 'git s --force'",
    "export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.sshCommand GIT_CONFIG_VALUE_0='rm -rf x'; ./build.sh",
    "git -c tar.x.command='rm -rf y' archive --format=x HEAD",
    "for o in -p -P; do git $o push --force; done",
    "git {-C,-p} . push --force",
    // settings inside an alias's value; settings git hands down to what it
    // runs (its -c, its environment's, exported or the command's own)
    "git -c 'alias.p=-c alias.q=push q' p",
    "git -c 'alias.p=-c \"alias.q=!rm -rf x\" q' p",
    "git -c alias.a='!git b' -c alias.b=push a",
    "GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=alias.a GIT_CONFIG_VALUE_0='!git b' GIT_CONFIG_KEY_1=alias.b GIT_CONFIG_VALUE_1=push git a",
    "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.p GIT_CONFIG_VALUE_0=push EDITOR='git p' git commit",
    "export GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=alias.a GIT_CONFIG_VALUE_0='!git b' GIT_CONFIG_KEY_1=alias.b GIT_CONFIG_VALUE_1=push; git a",
    // a script read again once git's settings change
    "export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.p GIT_CONFIG_VALUE_0=status; EDITOR='git p' git commit; export GIT_CONFIG_VALUE_0=push; EDITOR='git p' git commit",
    // an option word of several values, each a flag, however many
    "git {-p,-P} {-p,-P} {-p,-P} {-p,-P} push",
    "for o in -p -P -p; do git $o $o -c alias.x=push x; done",
    "git {-p,-P,--no-pager,--paginate,--no-replace-objects,--no-lazy-fetch,--no-optional-locks,--no-advice,--literal-pathspecs} push",
    // what illi can't read leaves the rest of the command read
    "git -C x push; x=(a)",
    "GIT_PAGER='rm -rf y' git log; x=(a)",
    "EDITOR='git -C x push; x=(a)' true",
    // a key made as it runs in the environment; a brace's value made so
    "K=$(cat k); GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.$K GIT_CONFIG_VALUE_0='push --force' git p",
    "git -c core.{pager,editor}=\"$X\"'rm -rf y' log",
  ]) {
    expect([c, judge(c, deny)]).toEqual([c, ["deny"]]);
  }
  expect(judge("git -c '' status", deny)).toEqual(["allow"]);
  expect(judge("make -j $N deploy", [rule("shell", "make deploy *", "ask")])).toEqual(["ask"]);
});

test("a folder named by an option is asked for from the folder in force where it's read (a wrapper's, an earlier option's); a script git runs from its repository's top too; git's path variables as paths", () => {
  expect(shell("env -C /etc git -C ../$X status")[0][1]).toEqual(["/etc/*", "/*"]);
  expect((shell("git -C ../../lib/repo -C .. status")[0][1] as string[]).sort()).toEqual([LIB + "/*", LIB + "/repo/*"]);
  expect(shell("git -C .. status")).toHaveLength(1);
  expect(shell("git -c 'alias.x=!cat ../y' x")[0][1]).toEqual([DIR + "/*"]);
  expect(shell("EDITOR='cat ../y' git commit")[0][1]).toEqual([DIR + "/*"]);
  expect(shell("GIT_DIR=../../lib/repo/.git git status")[0][1]).toEqual([LIB + "/repo/.git/*"]);
  expect(shell("export GIT_WORK_TREE=" + LIB + "; git status")[0][1]).toEqual([LIB + "/*"]);
});

test("past the work one check may do (Shell Work), the scripts and aliases left are their text alone, met crudely, and the check asks (failed) though a rule allows all it read; a rule that denies what was read still refuses it; the rest of the command read as ever; read in a moment", () => {
  const many = Array.from({ length: 2100 }, (_, i) => "EDITOR='vim a" + i + "' git commit").join("; ");
  const pagers = "export GIT_CONFIG_COUNT=50 " + Array.from({ length: 50 }, (_, i) => "GIT_CONFIG_KEY_" + i + "=core.pager GIT_CONFIG_VALUE_" + i + "='less " + i + "'").join(" ") + "; " + Array.from({ length: 40 }, (_, i) => "git -c a.b=" + i + " log").join("; ");
  const t0 = performance.now();
  const parts = Shell.parse(many + "; git -C x push", WHERE.cwd) as any[];
  expect(parts.filter((p) => p.rough === "spent").length).toBeGreaterThan(0);
  expect(parts.at(-1).text).toBe("git -C x push");
  for (const c of [many + "; git -C x push", many + "; EDITOR='rm -rf y' git commit"]) {
    expect(judge(c, [rule("shell", "git push *", "deny"), rule("shell", "rm *", "deny")])).toEqual(["deny"]);
  }
  expect(judge(pagers + "; git -C x push", [rule("shell", "git push *", "deny")])).toEqual(["deny"]);
  // all it read allowed: it asks all the same, as the rest went unread
  const spent = Access.shell(WHERE, many + "; EDITOR='/bin/rm -rf y' git commit").at(-1)!;
  expect([spent.failed, Permissions.decide("shell", spent.resources, [rule("shell", "*", "allow")], []).effect]).toEqual([expect.stringContaining("more scripts"), "allow"]);
  // one that fans out into a new folder at each step, past the work
  const fan = Access.shell(WHERE, "git -c alias.a='!git -C x a; git -C y a' a; GIT_SSH_COMMAND=\"/bin/rm -rf y\" git fetch").at(-1)!;
  expect(fan.failed).toBeDefined();
  // a nesting too deep leaves what comes after it read as ever
  expect(judge("false && git -c alias.a='!git -c alias.x=1 a; git -c alias.y=1 a' a; GIT_SSH_COMMAND=\"/bin/rm -rf y\" git fetch", [rule("shell", "rm *", "deny")])).toEqual(["deny"]);
  expect(judge("git -c alias.a='!git a 1; git a 2; git push' a", [rule("shell", "git push *", "deny")])).toEqual(["deny"]);
  expect(performance.now() - t0).toBeLessThan(5000);
});

test("a check that would grow without end (an alias's script running itself in a new folder each time, aliases in a long row named by a word made as it runs, scripts nested in scripts) takes no more than a moment", () => {
  const n = (k: number) => [...Array(k).keys()];
  for (const c of [
    "git -c alias.a='!git -C x a; git -C y a; git -C z a' a",
    "git " + n(800).map((i) => "-c alias.a" + i + "=a" + (i + 1)).join(" ") + " $Y",
    "git -c alias.a='!git -c alias.x=1 a; git -c alias.y=1 a; " + n(200).map((i) => "git -C d" + i + " s" + i).join("; ") + "' a",
    "x=(a); " + n(100).map((i) => "git -c alias.a" + i + "='!git -c alias.x=1 a" + i + "; git -c alias.y=1 a" + i + "' a" + i).join("; "),
  ]) {
    const t0 = performance.now();
    Access.shell(WHERE, c);
    expect(performance.now() - t0).toBeLessThan(3000);
  }
});

test("git's settings in the environment, many, met by many git commands, read in a moment", () => {
  const many = (m: number, n: number) => "export GIT_CONFIG_COUNT=" + m + " " + Array.from({ length: m }, (_, i) => "GIT_CONFIG_KEY_" + i + "=core.pager GIT_CONFIG_VALUE_" + i + "='less; less'").join(" ") + "; " + Array.from({ length: n }, () => "git log").join("; ");
  const t0 = performance.now();
  Access.shell(WHERE, many(120, 600));
  expect(performance.now() - t0).toBeLessThan(3000);
});

test("a script nested too deep asks, read again on its own so a rule that denies it still refuses it, and a like script after it is read as ever; one read loosely, as its own text too", () => {
  const deep = (n: number, c: string) => "( ".repeat(n) + c + " )".repeat(n);
  const deny = [rule("shell", "rm *", "deny"), rule("shell", "git push *", "deny")];
  const pager = "GIT_PAGER='/bin/rm -rf y' git log";
  const nested = "git -c alias.x=push -c core.pager='bash -c \"bash -c \\\"git x\\\"\"' log";
  for (const c of [deep(63, pager), deep(63, pager) + "; " + pager, deep(60, nested) + "; " + nested, "GIT_PAGER=$NOPE'/bin/rm -rf y' git log"]) {
    expect([c.slice(-60), judge(c, deny).includes("deny")]).toEqual([c.slice(-60), true]);
    const all = (x: string) => Access.shell(WHERE, x).flatMap((r) => r.resources);
    const on = all(c);
    expect([c.slice(-60), Shell.unmemoed(() => all(c)).filter((x) => !on.includes(x))]).toEqual([c.slice(-60), []]);
  }
  // read on its own, the alias git was given is gone: it asks
  for (const c of [deep(63, "GIT_PAGER='less' git log"), deep(60, nested), "( ".repeat(70) + "ls" + " )".repeat(70)]) {
    expect(Access.shell(WHERE, c).at(-1)!.failed).toBeDefined();
  }
});

test("an option word of several values read with each, whatever their order, values not options too (each value its own words, as bash splits it); one known only as it runs among a program's options asks", () => {
  const deny = [rule("shell", "git push *", "deny"), rule("shell", "rm *", "deny")];
  for (const c of [
    "for o in -p -c; do git $o alias.x=push x; done",
    "for o in --no-pager -c; do git $o alias.x=push x; done",
    "for o in -c status; do git $o alias.x=push x; done",
    "for o in status -c; do git $o alias.x=push x; done",
    "for o in '' -c; do git $o alias.x=push x; done",
    "for o in -p -C; do git -c alias.x=push $o status x; done",
    "for o in -c status; do git $o core.pager='rm -rf y' log; done",
  ]) {
    expect([c, judge(c, deny)]).toEqual([c, ["deny"]]);
  }
  // a value bash splits at its blanks is known only as it runs: it asks
  for (const c of ["git $O alias.x=push x", "git ${O:--c} alias.x=push x", "git \"$O\" alias.x=push x", "for o in '-c alias.x=push' -p; do git $o x; done", "O='-c alias.x=push'; git $O x"]) {
    expect([c, Access.shell(WHERE, c).at(-1)!.failed]).toEqual([c, expect.any(String)]);
  }
  expect(Access.shell(WHERE, "git -C \"$DIR\" status").at(-1)!.failed).toBeUndefined();
});

test("an assignment's += on one made before it in the same command; a word of several values given env or sudo, each an assignment; one that may be an assignment or the program asks", () => {
  const deny = [rule("shell", "rm *", "deny")];
  for (const c of [
    "GIT_SSH_COMMAND=/bin/r GIT_SSH_COMMAND+='m -rf y' git fetch",
    "export GIT_SSH_COMMAND=/bin/r GIT_SSH_COMMAND+='m -rf y'; git fetch",
    "declare -x GIT_SSH_COMMAND=/bin/r GIT_SSH_COMMAND+='m -rf y'; git fetch",
    "for V in 'GIT_SSH_COMMAND=rm -rf y' X=1; do env \"$V\" git fetch; done",
    "for V in GIT_SSH_COMMAND GIT_EDITOR; do env $V='rm -rf y' git fetch; done",
    "for V in GIT_SSH_COMMAND GIT_EDITOR; do sudo $V='rm -rf y' git fetch; done",
  ]) {
    expect([c, judge(c, deny)]).toEqual([c, ["deny"]]);
  }
  expect(Access.shell(WHERE, "for V in X=1 true; do env \"$V\" git fetch; done").at(-1)!.failed).toBeDefined();
});

test("a variable's value grown past what illi holds asks; many variables, scripts among them, read in a moment", () => {
  const n = (k: number) => [...Array(k).keys()];
  const grown = Access.shell(WHERE, "X=aaaaaaaa; " + n(26).map(() => "X=$X$X").join("; ") + "; echo $X").at(-1)!;
  expect(grown.failed).toBeDefined();
  for (const c of [
    n(20000).map((i) => "A" + i + "=1").join("; "),
    n(2500).map((i) => "A" + i + "=1; EDITOR=e").join("; "),
    n(400).map((i) => "GIT_CONFIG_KEY_" + i + "=alias.a GIT_CONFIG_VALUE_" + i + "=v" + i).join(" ") + "; " + n(1000).map(() => "git b").join("; "),
    "git " + n(400).map((i) => "-c alias.a=v" + i).join(" ") + " -c alias.z='!" + n(800).map(() => "git b").join("; ") + "' z",
  ]) {
    const t0 = performance.now();
    Access.shell(WHERE, c);
    expect([c.slice(0, 40), performance.now() - t0 < 1500]).toEqual([c.slice(0, 40), true]);
  }
});

test("a word grown past what illi holds, or given more of the variables' text than a check reads, asks in a moment, though a reading holding it is refused after; many variables, met by many subshells, scripts and git commands, read in a moment", () => {
  const n = (k: number) => [...Array(k).keys()];
  const X = "X=aaaaaaaa; " + n(12).map(() => "X=$X$X").join("; ") + "; ";
  const vars = n(5000).map((i) => "A" + i + "=1").join(" ") + "; ";
  const deny = [rule("shell", "git push *", "deny")];
  const push = "X='git push;'; " + n(13).map(() => "X=$X$X").join("; ") + "; ";
  for (const c of [push + 'bash -c "$X$X"', push + "eval $X$X", push + 'echo "$X$X"']) {
    expect([c.slice(-14), Access.shell(WHERE, c).at(-1)!.failed]).toEqual([c.slice(-14), expect.any(String)]);
  }
  for (const c of [
    X + "echo " + "$X".repeat(8000),
    X + "echo " + n(8000).map(() => "$X").join(" "),
    X + 'bash -c "' + "$X".repeat(600) + '"',
    X + n(800).map((i) => "A" + i + "=$X; EDITOR=e" + i + " crontab -e").join("; "),
    X + n(3000).map((i) => 'bash -c "$X; e' + i + '"').join("; "),
  ]) {
    const t0 = performance.now();
    const failed = Access.shell(WHERE, c).at(-1)!.failed;
    expect([c.slice(-30), failed, performance.now() - t0 < 1500]).toEqual([c.slice(-30), expect.any(String), true]);
  }
  for (const c of [
    vars + n(5000).map(() => "git status").join("; "),
    vars + n(5000).map(() => "( : )").join("; "),
    vars + n(5000).map((i) => "{ e" + i + "; }").join("; "),
    vars + n(5000).map((i) => "bash -c 'e" + i + "'").join("; "),
    vars + n(5000).map((i) => "EDITOR=e" + i + " crontab -e").join("; "),
    vars + n(5000).map((i) => "echo $(e" + i + ")").join("; "),
    n(5000).map((i) => "make -n d" + i).join("; "),
  ]) {
    const t0 = performance.now();
    judge(c, deny);
    expect([c.slice(-30), performance.now() - t0 < 1500]).toEqual([c.slice(-30), true]);
  }
});

test("a command illi can't read saves each command in it by its family, its leading assignments and shell words off, never every command; nested deeper than it reads, it asks", () => {
  const wrong = (save: string[]) => save.filter((s) => s === "*" || /^(?:[A-Za-z_]\w*\+?=|(?:!|time|do|then|\{)(?:\s|$))/.test(s));
  for (const [c, family] of [
    ["x=(a); X=1 make deploy", "make deploy *"],
    ["for o in a b; do eval \"ls $o\"; done", "eval *"],
    ["case x in x) X=1 rm -rf y;; esac", "rm *"],
    ["x=(a); X=1 Y=2 git push", "git push *"],
    ["x=(a); ! ls", "ls *"],
    ["x=(a); time ls", "ls *"],
    ["x=(a); { ls; }", "ls *"],
  ]) {
    const save = Access.shell(WHERE, c).find((r) => r.action === "shell")!.save;
    expect([c, save.includes(family), wrong(save)]).toEqual([c, true, []]);
  }
  const ev = "eval ".repeat(70);
  for (const c of ["x=(a); " + ev + "git push", "case x in x) " + ev + "git push;; esac", "EDITOR='x=(a); " + ev + "git push' crontab -e", "x=(a); " + "watch ".repeat(70) + "git push", "x=(a); trap '" + ev + "git push' EXIT"]) {
    expect([c.slice(0, 20), Access.shell(WHERE, c).at(-1)!.failed]).toEqual([c.slice(0, 20), expect.any(String)]);
  }
});

test("a word known only as it runs among a program's options asks, but for an option with its value glued in it (a short one's blank value taking the next word, read so too); a variable's blank value is no word at all", () => {
  const deny = [rule("shell", "git push *", "deny")];
  for (const c of ["git --git-dir=$D $O alias.x=push x", "git -C$D $O alias.x=push x", "git -$O alias.x=push x", "git -${X:-c} alias.x=push x", 'git "-$X" alias.x=push x']) {
    expect([c, Access.shell(WHERE, c).at(-1)!.failed]).toEqual([c, expect.any(String)]);
  }
  for (const c of ['git -C"$DIR" status', 'git --git-dir="$D" log', "make -j$(nproc) all", "cargo --manifest-path=$M build", "kubectl --context=$CTX get pods", "git -C$D status"]) {
    expect([c, Access.shell(WHERE, c).at(-1)!.failed]).toEqual([c, undefined]);
  }
  for (const c of ["git -C$D x -c alias.y=push y", "for o in '' x; do git $o push; done", "o=; git $o push", "O=''; git $O push"]) {
    expect([c, judge(c, deny).includes("deny")]).toEqual([c, true]);
  }
});

test("Claude Code's tools that ask in illi's calls, as illi's like ones: its web fetch and search theirs, one of its MCP servers' by its name; illi's own none", () => {
  expect(Access.hosted("WebFetch", { url: "https://x.dev" })[0]).toMatchObject({ action: "webfetch", resources: ["https://x.dev"] });
  expect(Access.hosted("WebSearch", { query: "bun ffi" })[0]).toMatchObject({ action: "websearch", resources: ["bun ffi"] });
  expect(Access.hosted("mcp__illi__zoom", {})).toEqual([]);
  expect(Access.hosted("mcp__github__get_issue", {})).toEqual([{ action: "mcp__github__get_issue", resources: ["*"], save: ["*"], spots: [null] }]);
});

test("arity: a family's head by its first words; any other, the first word", () => {
  expect(Access.arity(["git", "push", "origin"])).toEqual(["git", "push"]);
  expect(Access.arity(["git", "remote", "add", "x"])).toEqual(["git", "remote", "add"]);
  expect(Access.arity(["python", "-m", "pytest", "-x"])).toEqual(["python", "-m", "pytest"]);
  expect(Access.arity(["rm", "-rf", "x"])).toEqual(["rm"]);
  expect(Access.arity(["git"])).toEqual(["git"]);
});

test("said: what \"don't ask again\" saves, in words", () => {
  expect(Access.said("read", "*", APP)).toBe("any file read");
  expect(Access.said("edit", "*", APP)).toBe("any file change");
  expect(Access.said("shell", "git push *", APP)).toBe("git push *");
  expect(Access.said("external_directory", os.homedir() + "/notes/*", APP)).toBe("files in ~/notes/");
  expect(Access.said("mcp__gh__merge", "*", APP)).toBe("mcp__gh__merge");
});
