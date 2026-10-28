// Permissions test
// ================
// `bun test Permissions.test.ts`. The rules: a wildcard's * and ?, a
// trailing " *" matching the bare command, patterns another covers
// folded into it; the last matching rule wins, none asks; a deny by the
// configured rules refuses whatever was saved, a saved approval clears an
// ask, trust runs what is asked; illi's own rules (.env reads asked, a
// folder outside asked but illi's places). The file: none is no rules
// and nothing saved; rules by action read in order, a hand edit seen at
// the next read, a deny or ask a later rule overrides whole found
// (shadowed); an exact approval meeting only itself; one that won't
// read, or an effect that isn't allow, ask or deny, said (never taken as
// no rules); a save adds to what the file has, a revoke leaves the rest;
// an older illi's rules and grants read as this one's (its mcp * as MCP
// tools', a folder's reads as none), a save turning that project's
// grants into approvals; a file that won't read is never written over.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import { Permissions, type Rule } from "./Permissions.ts";

const DIR  = fs.mkdtempSync(os.tmpdir() + "/illi-permissions-");
const FILE = DIR + "/sub/permissions.json";
const HOME = os.homedir();

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

const write = (data: unknown) => {
  fs.mkdirSync(DIR + "/sub", { recursive: true });
  fs.writeFileSync(FILE, typeof data === "string" ? data : JSON.stringify(data));
};
const rule = (action: string, resource: string, effect: Rule["effect"]): Rule => ({ action, resource, effect });

test("match: * anything, / too; ? one character; a trailing \" *\" matches the bare command; the rest literal", () => {
  expect(Permissions.match("git push origin main", "git push *")).toBe(true);
  expect(Permissions.match("git push", "git push *")).toBe(true);
  expect(Permissions.match("git pushy", "git push *")).toBe(false);
  expect(Permissions.match("/home/me/a/b/c.txt", "/home/me/*")).toBe(true);
  expect(Permissions.match("config/.env", "*.env")).toBe(true);
  expect(Permissions.match("a.env.local", "*.env.*")).toBe(true);
  expect(Permissions.match("ab", "a?")).toBe(true);
  expect(Permissions.match("abc", "a?")).toBe(false);
  expect(Permissions.match("a+b(c)", "a+b(c)")).toBe(true);
  expect(Permissions.match("axb", "a.b")).toBe(false);
  expect(Permissions.match("line one\nline two", "line *")).toBe(true);
  expect(Permissions.match("C:\\work\\x", "C:/work/*")).toBe(true);
  expect(Permissions.match("echo 'ünï ✓ 😀' | tr -d \"[]{}^$\"", "echo 'ünï ✓ 😀' | tr -d \"[]{}^$\"")).toBe(true);
  expect(Permissions.match("echo 😀x", "echo ?x")).toBe(true);
  expect(Permissions.match("", " *")).toBe(true);
});

test("fold: a pattern another covers is left out, a folder's covering those in it, a family its narrower ones; of patterns covering each other, the first", () => {
  expect(Permissions.fold(["/h/o/skills/*", "/h/o/skills/up/*", "/h/o/*", "/h/ox/*"])).toEqual(["/h/o/*", "/h/ox/*"]);
  expect(Permissions.fold(["git push *", "git log *"])).toEqual(["git push *", "git log *"]);
  expect(Permissions.fold(["git push *", "git *"])).toEqual(["git *"]);
  expect(Permissions.fold(["a*", "a**", "a*"])).toEqual(["a*"]);
  expect(Permissions.fold([])).toEqual([]);
});

test("evaluate: the last matching rule wins, by action and resource; none asks", () => {
  const rules = [rule("*", "*", "allow"), rule("shell", "git *", "ask"), rule("shell", "git status *", "allow")];
  expect(Permissions.evaluate("shell", "git status -s", rules).effect).toBe("allow");
  expect(Permissions.evaluate("shell", "git push", rules).effect).toBe("ask");
  expect(Permissions.evaluate("read", "x", rules).effect).toBe("allow");
  expect(Permissions.evaluate("read", "x", []).effect).toBe("ask");
  expect(Permissions.evaluate("mcp__gh__merge", "*", [rule("mcp__gh__*", "*", "deny")]).effect).toBe("deny");
  const just = { ...rule("shell", "rm -rf *", "allow"), exact: true };
  expect(Permissions.evaluate("shell", "rm -rf *", [just]).effect).toBe("allow");
  expect(Permissions.evaluate("shell", "rm -rf ~", [just]).effect).toBe("ask");
});

test("shadowed: a deny or ask a later, looser rule covers whole never decides; one a later rule repeats or makes stricter, or meets in part, does", () => {
  const rules = [rule("shell", "git push --force*", "deny"), rule("shell", "git *", "allow"), rule("read", "*.pem", "ask"), rule("*", "*", "allow"), rule("shell", "rm *", "deny"), rule("shell", "rm -rf *", "ask"), rule("edit", "*.lock", "deny"), rule("edit", "*", "allow"), rule("edit", "*.lock", "deny"), rule("webfetch", "*", "ask"), rule("webfetch", "*", "deny")];
  expect(Permissions.shadowed(rules)).toEqual([
    { rule: rules[0], by: rules[3] },
    { rule: rules[2], by: rules[3] },
  ]);
  expect(Permissions.shadowed([rule("shell", "rm /tmp/*", "deny"), rule("shell", "rm /tmp/?", "allow"), rule("shell", "git push *", "ask"), rule("shell", "git push ?*", "allow")])).toEqual([]);
  expect(Permissions.covers("git *", "git push *")).toBe(true);
  expect(Permissions.covers("git push ?*", "git push *")).toBe(false);
  expect(Permissions.covers("rm /tmp/?", "rm /tmp/*")).toBe(false);
  expect(Permissions.covers("rm /tmp/*", "rm /tmp/?")).toBe(true);
});

test("decide: a configured deny refuses whatever is saved; a saved approval clears an ask; trust runs what is asked, never what is denied", () => {
  const configured = [rule("*", "*", "allow"), rule("shell", "git push *", "ask"), rule("shell", "rm -rf /*", "deny")];
  expect(Permissions.decide("shell", ["ls", "git push"], configured, [])).toEqual({ effect: "ask", by: [1] });
  expect(Permissions.decide("shell", ["ls", "git push"], configured, [rule("shell", "git push *", "allow")])).toEqual({ effect: "allow", by: [] });
  expect(Permissions.decide("shell", ["git push", "rm -rf /x"], configured, [rule("shell", "*", "allow")])).toEqual({ effect: "deny", by: [1] });
  expect(Permissions.decide("shell", ["git push"], configured, [], "trust")).toEqual({ effect: "allow", by: [] });
  expect(Permissions.decide("shell", ["rm -rf /x"], configured, [], "trust").effect).toBe("deny");
  expect(Permissions.decide("shell", [], configured, [])).toEqual({ effect: "allow", by: [] });
});

test("base: all runs; .env reads asked, .env.example's not; a folder outside asked, illi's places not; the user's rules after win", () => {
  const base = Permissions.base(["/home/me/.illi/skills/*", "/home/me/.illi/RULES.md"]);
  expect(Permissions.decide("shell", ["rm -rf build"], base, []).effect).toBe("allow");
  expect(Permissions.decide("read", [".env"], base, []).effect).toBe("ask");
  expect(Permissions.decide("read", ["api/.env.local"], base, []).effect).toBe("ask");
  expect(Permissions.decide("read", [".env.example"], base, []).effect).toBe("allow");
  expect(Permissions.decide("external_directory", ["/tmp/*"], base, []).effect).toBe("ask");
  expect(Permissions.decide("external_directory", ["/home/me/.illi/skills/new/*"], base, []).effect).toBe("allow");
  expect(Permissions.decide("external_directory", ["/home/me/.illi/RULES.md"], base, []).effect).toBe("allow");
  expect(Permissions.decide("external_directory", ["/home/me/.illi/*"], base, []).effect).toBe("ask");
  expect(Permissions.decide("external_directory", ["/tmp/*"], [...base, rule("external_directory", "/tmp/*", "allow")], []).effect).toBe("allow");
  expect(Permissions.decide("webfetch", ["https://x"], [...base, rule("webfetch", "*", "deny")], []).effect).toBe("deny");
});

test("none: no rules, nothing saved; approvals saved by project, the file made; one let go leaves the rest", () => {
  expect(Permissions.read(FILE, "/w/app")).toEqual({ rules: [], saved: [] });
  expect(Permissions.save(FILE, "/w/app", "shell", ["git push *"])).toBeNull();
  expect(Permissions.save(FILE, "/w/app", "shell", ["git push *", "npm publish *"])).toBeNull();
  expect(Permissions.save(FILE, "/w/app", "external_directory", ["/w/lib/*"])).toBeNull();
  expect(Permissions.read(FILE, "/w/app")).toEqual({ rules: [], saved: [rule("shell", "git push *", "allow"), rule("shell", "npm publish *", "allow"), rule("external_directory", "/w/lib/*", "allow")] });
  expect(Permissions.read(FILE, "/w/other")).toEqual({ rules: [], saved: [] });
  expect(Permissions.revoke(FILE, "/w/app", "shell", "git push *")).toBeNull();
  expect((Permissions.read(FILE, "/w/app") as any).saved).toEqual([rule("shell", "npm publish *", "allow"), rule("external_directory", "/w/lib/*", "allow")]);
  expect(fs.readdirSync(DIR + "/sub")).toEqual(["permissions.json"]);
});

test("rules by action, in the file's order: a pattern's effect, or one for all; ~/ as home but in a shell pattern; a save keeps what else the file has", () => {
  write({ rules: { shell: { "git push *": "ask", "rm -rf /*": "deny" }, webfetch: "ask", read: { "~/notes/*": "deny" }, external_directory: { "~/notes/*": "allow" } }, mine: 1 });
  expect(Permissions.read(FILE, "/w/x")).toEqual({ rules: [rule("shell", "git push *", "ask"), rule("shell", "rm -rf /*", "deny"), rule("webfetch", "*", "ask"), rule("read", HOME + "/notes/*", "deny"), rule("external_directory", HOME + "/notes/*", "allow")], saved: [] });
  write({ rules: { shell: { "ls ~/x": "deny" } }, mine: 1 });
  expect(Permissions.read(FILE, "/w/x")).toEqual({ rules: [rule("shell", "ls ~/x", "deny")], saved: [] });
  expect(Permissions.save(FILE, "/w/y", "mcp__gh__merge", ["*"])).toBeNull();
  expect(JSON.parse(fs.readFileSync(FILE, "utf8"))).toEqual({ rules: { shell: { "ls ~/x": "deny" } }, mine: 1, projects: { "/w/y": { saved: [{ action: "mcp__gh__merge", resource: "*" }] } } });
});

test("an older illi's file: write rules as edit's (a folder allowed, the folder too), mcp rules as their tools' (* as all MCP tools, not every action); grants as approvals (a folder's reads as none), a save making them so", () => {
  write({ rules: { write: { "~/scratch/*": "allow", "*.lock": "deny" }, mcp: { "mcp__github__*": "ask", "*": "allow", "notes*": "deny" } }, projects: { "/w/x": { granted: ["shell:git push *", "shell=ls -la", "read:/w/lib/*", "write:/w/a\\*b/*", "write=/w/x/.npmrc", "mcp:mcp__gh__*", "mcp=mcp__gh__merge", "mcp:linear*", "odd"] } } });
  expect(Permissions.read(FILE, "/w/x")).toEqual({
    rules: [rule("edit", HOME + "/scratch/*", "allow"), rule("external_directory", HOME + "/scratch/*", "allow"), rule("edit", "*.lock", "deny"), rule("mcp__github__*", "*", "ask"), rule("mcp__*", "*", "allow"), rule("mcp__notes*", "*", "deny")],
    saved: [rule("shell", "git push *", "allow"), rule("shell", "ls -la", "allow"), rule("external_directory", "/w/a*b/*", "allow"), rule("mcp__gh__*", "*", "allow"), rule("mcp__gh__merge", "*", "allow"), rule("mcp__linear*", "*", "allow")],
  });
  expect(Permissions.save(FILE, "/w/x", "shell", ["git push *", "bun test *"])).toBeNull();
  const kept = JSON.parse(fs.readFileSync(FILE, "utf8"));
  expect(kept.rules).toEqual({ write: { "~/scratch/*": "allow", "*.lock": "deny" }, mcp: { "mcp__github__*": "ask", "*": "allow", "notes*": "deny" } });
  expect(kept.projects["/w/x"].granted).toBeUndefined();
  expect(kept.projects["/w/x"].saved.map((s: any) => s.action + " " + s.resource)).toEqual(["shell git push *", "shell ls -la", "external_directory /w/a*b/*", "mcp__gh__* *", "mcp__gh__merge *", "mcp__linear* *", "shell bun test *"]);
});

test("a file that won't read, or an effect that isn't allow, ask or deny, is said; such a file is never written over", () => {
  write("{ \"rules\": ");
  expect(Permissions.read(FILE, "/w/x")).toStartWith(FILE + ": ");
  expect(Permissions.save(FILE, "/w/x", "shell", ["ls"])).toStartWith(FILE + ": ");
  expect(fs.readFileSync(FILE, "utf8")).toBe("{ \"rules\": ");
  write({ rules: { shell: { "git push *": "dney" } } });
  expect(Permissions.read(FILE, "/w/x")).toBe(FILE + ": rules.shell[\"git push *\"] is \"dney\": allow, ask or deny");
  write({ rules: { webfetch: "maybe" } });
  expect(Permissions.read(FILE, "/w/x")).toBe(FILE + ": rules.webfetch is \"maybe\": allow, ask or deny");
  write({ rules: { shell: ["ls"] } });
  expect(Permissions.read(FILE, "/w/x")).toBe(FILE + ": rules.shell must be allow, ask, deny or an object of patterns");
  write({ rules: [1] });
  expect(Permissions.read(FILE, "/w/x")).toBe(FILE + ": rules must be an object of actions");
  write([1]);
  expect(Permissions.read(FILE, "/w/x")).toBe(FILE + ": not a JSON object");
  write("");
  expect(Permissions.read(FILE, "/w/x")).toEqual({ rules: [], saved: [] });
});
