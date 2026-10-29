// Access test
// ===========
// `bun test Access.test.ts`. What a call asks leave for: a file inside by
// its path from the working dir, outside by its absolute path after its
// folder's request (a file's folder, a folder's own; saving its git
// repository's); illi's own RULES.md alone of its folder; a shell
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
const WHERE: Where = { cwd: APP + "/src", top: APP, files: [DIR + "/illi/RULES.md"] };
const ROOT  = fs.readFileSync("/etc/passwd", "utf8").split("\n").find((l) => l.startsWith("root:"))!.split(":")[5];

fs.mkdirSync(APP + "/src", { recursive: true });
fs.mkdirSync(APP + "/.git");
fs.mkdirSync(LIB + "/repo/.git", { recursive: true });
fs.mkdirSync(LIB + "/repo/pkg");
fs.mkdirSync(DIR + "/illi");

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

test("Claude Code's tools, as illi's like ones: Bash a shell command, Monitor's too, Read, Write, Edit, Grep, Glob, LS, the web, a subagent; illi's own none", () => {
  expect(Access.hosted(WHERE, "Bash", { command: "git push" })).toEqual(Access.shell(WHERE, "git push"));
  expect(Access.hosted(WHERE, "Monitor", { command: "tail -f " + LIB + "/log" })).toEqual(Access.shell(WHERE, "tail -f " + LIB + "/log"));
  expect(Access.hosted(WHERE, "Monitor", { ws: { url: "wss://x.dev/s" } })[0]).toMatchObject({ action: "webfetch", resources: ["wss://x.dev/s"] });
  expect(Access.hosted(WHERE, "Read", { file_path: APP + "/src/a.ts" })[0].resources).toEqual(["a.ts"]);
  expect(Access.hosted(WHERE, "Edit", { file_path: LIB + "/x" }).map((r) => r.action)).toEqual(["external_directory", "edit"]);
  expect(Access.hosted(WHERE, "NotebookEdit", { notebook_path: "n.ipynb" })[0]).toMatchObject({ action: "edit", resources: ["n.ipynb"] });
  expect(Access.hosted(WHERE, "Grep", { pattern: "TODO", path: LIB })).toEqual([
    { action: "external_directory", resources: [LIB + "/*"], save: [LIB + "/*"], spots: [null] },
    { action: "grep", resources: ["TODO"], save: ["*"], spots: [null] },
  ]);
  expect(Access.hosted(WHERE, "Glob", { pattern: LIB + "/repo/**/*.ts" })[0].resources).toEqual([LIB + "/repo/*"]);
  expect(Access.hosted(WHERE, "LS", {})).toEqual([{ action: "list", resources: ["."], save: ["*"], spots: [null] }]);
  expect(Access.hosted(WHERE, "WebFetch", { url: "https://x.dev" })[0]).toMatchObject({ action: "webfetch", resources: ["https://x.dev"] });
  expect(Access.hosted(WHERE, "Task", { subagent_type: "Explore" })[0]).toMatchObject({ action: "subagent", resources: ["Explore"] });
  expect(Access.hosted(WHERE, "mcp__illi__zoom", {})).toEqual([]);
  expect(Access.hosted(WHERE, "TodoWrite", {})[0].action).toBe("TodoWrite");
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
