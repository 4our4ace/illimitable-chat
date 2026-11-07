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
// * an rm in a case, rm -rf /* a quoted 'rm' -rf "/" and /bin/rm.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Access, type Where } from "./Access.ts";
import { Permissions, type Rule } from "./Permissions.ts";

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
