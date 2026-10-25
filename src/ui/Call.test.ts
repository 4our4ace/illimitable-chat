// Call test
// =========
// `bun test Call.test.ts`. A call read as people read it: its tool's
// name (an MCP server's or a plugin's after its server; illi's own as
// Claude Code names them, by their own), what it did in plain words (a
// label: each tool's own, else its name and its most telling short
// value; calls from before descriptions read well too), and how it
// ended (a command's exit, a read's lines, a change's lines; a failure,
// how).

import { expect, test } from "bun:test";
import * as Call from "./Call.ts";

// a call logged as its tool and input, read
const call = (name: string, input: object) => Call.call_parse(name + " " + JSON.stringify(input));

// its label, given its result if any
const label = (name: string, input: object, result: string | null = null) => Call.call_label(call(name, input), result);

test("a call's tool: an MCP server's and a plugin's after their server (read as any tool's, whatever its name), illi's own as Claude Code names them by their own name", () => {
  expect([call("shell", { command: "ls" })].map((c) => [c.name, c.from, c.raw, Call.call_tool(c)])).toEqual([["shell", "", "shell", "shell"]]);
  expect([call("mcp__github__get_issue", {}), call("plugin__notes__add", {}), call("mcp__illi__zoom", {}), Call.call_parse("projects")].map((c) => c.raw)).toEqual(["mcp__github__get_issue", "plugin__notes__add", "zoom", ""]);
  expect(Call.call_tool(call("mcp__github__get_issue", { id: 4 }))).toBe("github: get_issue");
  expect(Call.call_tool(call("plugin__notes__add", { text: "x" }))).toBe("notes: add");
  expect(call("mcp__illi__zoom", { id: 12 })).toMatchObject({ name: "zoom", from: "", head: "#12" });
  expect(call("mcp__illi__mcp__github__get_issue", { id: 4 })).toMatchObject({ name: "get_issue", from: "github" });
  expect(call("mcp__fs__read", { path: "a.ts" })).toMatchObject({ name: "read", from: "fs", head: '"a.ts"' });
  expect(Call.call_parse("not a call")).toMatchObject({ name: "", head: "not a call" });
});

// a command by the words its caller gave it, else its first line: a
// leading cd left out, " …" where more lines follow or it was cut; a
// command of any length read in about the time a short one is
test("a command's label: its description, else its first line", () => {
  expect(label("shell", { command: "ls -la src", description: "List the files in src" })).toBe("List the files in src");
  expect(label("shell", { command: "bun test   src/ui" })).toBe("bun test src/ui");
  expect(label("shell", { command: "cd /tmp/x && git status --short" })).toBe("git status --short");
  expect(label("shell", { command: "cd 'a b'; ls" })).toBe("ls");
  expect(label("shell", { command: "cd src" })).toBe("cd src");
  expect(label("shell", { command: "\n\n  set -e\nbun test\n" })).toBe("set -e …");
  expect(label("shell", { command: "echo " + "x".repeat(400) })).toBe("echo " + "x".repeat(193) + " …");
  expect(label("shell", { command: "ls", description: "  " })).toBe("ls");
  expect(label("Bash", { command: "npm test", description: "Run the tests" })).toBe("Run the tests");
  expect(label("Bash", { command: "npm test" })).toBe("npm test");
  const big   = call("shell", { command: "cat > a.txt <<EOF\n" + "lorem ipsum dolor ".repeat(60000) + "\nEOF" });
  const start = performance.now();
  for (let k = 0; k < 20; k++) {
    expect(Call.call_label(big)).toBe("cat > a.txt <<EOF …");
  }
  expect(performance.now() - start).toBeLessThan(200);
});

test("a file tool's label: the file, a read's lines if only some; an edit's files, two then how many more", () => {
  expect(label("read", { path: "src/a.ts" })).toBe("Read src/a.ts");
  expect(label("read", { path: "src/a.ts", offset: 40, limit: 40 })).toBe("Read src/a.ts, lines 40-79");
  expect(label("read", { path: "src/a.ts", offset: 40 })).toBe("Read src/a.ts from line 40");
  expect(label("read", { path: "src/a.ts", limit: 10 })).toBe("Read src/a.ts, lines 1-10");
  expect(label("read", { path: "src/a.ts", offset: 1 })).toBe("Read src/a.ts");
  expect(label("write", { path: "notes.md", content: "x" })).toBe("Wrote notes.md");
  expect(label("edit", { edits: [{ path: "a.ts", old: "x", new: "y" }, { path: "a.ts", old: "z", new: "w" }] })).toBe("Edited a.ts");
  expect(label("edit", { edits: [{ path: "a.ts" }, { path: "b.ts" }] })).toBe("Edited a.ts, b.ts");
  expect(label("edit", { edits: ["a", "b", "c", "d"].map((f) => ({ path: f + ".ts" })) })).toBe("Edited a.ts, b.ts and 2 more");
  expect(label("edit", { path: "a.ts", old: "x", new: "y" })).toBe("edit a.ts");
  expect(label("Read", { file_path: "/w/a.ts", offset: 5, limit: 2 })).toBe("Read /w/a.ts, lines 5-6");
  expect(label("Write", { file_path: "/w/a.ts" })).toBe("Wrote /w/a.ts");
  expect([label("Edit", { file_path: "a.ts" }), label("MultiEdit", { file_path: "b.ts" }), label("NotebookEdit", { notebook_path: "c.ipynb" })]).toEqual(["Edited a.ts", "Edited b.ts", "Edited c.ipynb"]);
});

// the web search OpenAI's and ChatGPT's models log (their action), and
// Anthropic's (its query alone); Claude Code's own
test("a web search's label: its query (several: the first, then how many more), the page it opened, the text it looked for", () => {
  expect(label("web_search", { type: "search", query: "bun test isolate" })).toBe('Searched "bun test isolate"');
  expect(label("web_search", { type: "search", queries: ["LLM agent memory", "agent harness", "recall"] })).toBe('Searched "LLM agent memory" +2');
  expect(label("web_search", { query: "bend" })).toBe('Searched "bend"');
  expect(label("web_search", { type: "search" })).toBe("Searched the web");
  expect(label("web_search", { type: "open_page", url: "https://www.anthropic.com/engineering/x" })).toBe("Opened anthropic.com/engineering/x");
  expect(label("web_search", { type: "open_page" })).toBe("Opened a page");
  expect(label("web_search", { type: "find", url: "http://example.com/a", pattern: "cache" })).toBe('Found "cache" in example.com/a');
  expect(label("web_search", { type: "find_in_page", pattern: "cache" })).toBe('Found "cache" in page');
  expect(label("WebSearch", { query: "bend" })).toBe('Searched "bend"');
  expect(label("WebFetch", { url: "https://example.com/p", prompt: "sum it up" })).toBe("Opened example.com/p");
  expect(call("web_search", { type: "search", queries: ["a b", "c"] }).head).toBe("a b\nc");
  expect(call("web_search", { type: "find", url: "https://example.com", pattern: "x" })).toMatchObject({ head: "https://example.com", blocks: [{ k: "find", x: "x" }] });
});

test("illi's own tools' labels: memory, agents, skills, the to-do list, questions", () => {
  expect(label("search", { words: "auto compact" })).toBe('Searched memory for "auto compact"');
  expect(label("search", { words: "x", project: "all" })).toBe('Searched memory for "x" in every project');
  expect(label("search", { words: "x", project: "site" })).toBe('Searched memory for "x" in site');
  expect(label("zoom", { id: 123, n: 1 })).toBe("Looked back at #123");
  expect(label("zoom", { id: 120, n: 8 })).toBe("Looked back at #120+8");
  expect(label("zoom", { id: "Scout" })).toBe("Looked back at Scout's chat");
  expect(label("mcp__illi__zoom", { id: 7, project: "site" })).toBe("Looked back at #7 in site");
  expect(label("date", { id: 123 })).toBe("Checked the date of #123");
  expect(label("projects", {})).toBe("Listed the projects");
  expect(label("spawn", { tasks: ["look"] })).toBe("Started an agent");
  expect(label("spawn", { tasks: ["a", "b"], agent: "reviewer" })).toBe("Started 2 reviewer agents");
  expect(label("spawn", { tasks: ["a", "b"] }, "Started Scout, Scout-2. Each one's report will reach you as a message when it finishes.")).toBe("Started Scout, Scout-2");
  expect(label("tell", { name: "Scout", message: "go on" })).toBe("Messaged Scout");
  expect([label("skill", { name: "imagegen" }), label("skill", { name: "terse", on: true }), label("skill", { name: "terse", on: false })]).toEqual(["Loaded skill imagegen", "Turned on skill terse", "Turned off skill terse"]);
  expect([label("todo", { items: [{ text: "a", status: "done" }] }), label("todo", { items: [] }), label("TodoWrite", { todos: [] })]).toEqual(["Updated the to-do list", "Cleared the to-do list", "Updated the to-do list"]);
  expect(label("ask", { questions: [{ question: "Which database?", head: "Database" }, { question: "Auth?" }] })).toBe('Asked "Database" +1');
  expect(label("ask", { questions: [{ question: "Push again?" }] })).toBe('Asked "Push again?"');
  expect(label("ask", { queries: [{ text: "Push again?" }] })).toBe("ask");
  expect([label("Glob", { pattern: "src/**/*.ts" }), label("Grep", { pattern: "TODO", path: "src" }), label("Task", { subagent_type: "explorer", prompt: "x" })]).toEqual(["Listed files matching src/**/*.ts", 'Searched for "TODO" in src', "Started explorer"]);
  expect([label("Agent", { subagent_type: "explorer", prompt: "x" }), label("Agent", { prompt: "x" })]).toEqual(["Started explorer", "Started an agent"]);
});

// a label whose field it is about is missing or blank reads as any
// tool's (its name, then its most telling value), never as words left
// hanging; a tool message that isn't `name {input}`, its first line
test("a label with its field missing reads as any tool's; a call not read as one, its first line", () => {
  const bare = (name: string, input: object) => [name, label(name, input)];
  expect([bare("read", {}), bare("write", { path: " " }), bare("tell", { message: "go on" }), bare("zoom", {}), bare("date", {}), bare("search", { words: "" }), bare("skill", { on: true })]).toEqual([
    ["read", "read"], ["write", "write"], ["tell", 'tell "go on"'], ["zoom", "zoom"], ["date", "date"], ["search", "search"], ["skill", "skill"],
  ]);
  expect([label("spawn", { tasks: [] }), label("edit", { edits: [{}] }), label("web_search", { type: "find", url: "https://a.io" }), label("Read", { limit: 10 }), label("Grep", { path: "src" }), label("Glob", {}), label("WebSearch", {}), label("WebFetch", {})]).toEqual([
    "spawn", "edit", "web_search https://a.io", "Read 10", "Grep src", "Glob", "WebSearch", "WebFetch",
  ]);
  expect([Call.call_label(Call.call_parse("projects")), Call.call_label(Call.call_parse("look up the thing\nand more"))]).toEqual(["projects", "look up the thing …"]);
});

// a label cut where it is too long never splits a character drawn by
// two UTF-16 units (an emoji): the cut falls before it
test("a long label is cut whole characters at a time", () => {
  const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  for (const k of [195, 196, 197, 198, 199, 200]) {
    const text = "a".repeat(k) + "😀".repeat(10);
    expect([label("shell", { command: "ls", description: text }), label("write", { path: text }), label("lookup", { key: text })].filter((l) => lone.test(l))).toEqual([]);
  }
});

// any other call: its name (an MCP server's or a plugin's after its
// server), then its most telling field given, else its first short
// value (a phrase quoted); none: the name alone
test("any other call's label: its name, then its most telling short value", () => {
  expect(label("mcp__github__get_issue", { owner: "x", repo: "y", id: 42 })).toBe("github: get_issue 42");
  expect(label("mcp__github__create_issue", { title: "Fix the bug", body: "long ".repeat(40) })).toBe('github: create_issue "Fix the bug"');
  expect(label("mcp__fetch__fetch", { url: "https://example.com", max_length: 5000 })).toBe("fetch: fetch https://example.com");
  expect(label("plugin__notes__add", { tags: ["a"], text: "remember the milk" })).toBe('notes: add "remember the milk"');
  expect(label("mcp__fs__read", { path: "a.ts" })).toBe("fs: read a.ts");
  expect(label("lookup", { items: [1, 2] })).toBe("lookup");
  expect(label("lookup", { note: "x".repeat(80), key: "k1" })).toBe("lookup k1");
  expect(label("lookup", { pattern: "a\nb" })).toBe('lookup "a …"');
  expect(label("x".repeat(300), {})).toBe("x".repeat(200) + "…");
});

// how a call ended: a command's exit (stopped, killed: Machine.shell;
// Claude Code's Bash, failing, by its code), a read's lines, a change's
// lines added and removed; failed, else stopped; not known, nothing
test("a call's outcome: a command's exit, a read's lines, a change's lines; a failure, how; not known, none", () => {
  const out = (name: string, input: object, ok: boolean | null, result: string) => Call.call_outcome(call(name, input), ok, result);
  expect(out("shell", { command: "ls" }, true, "a\nb\n(exit 0 in 0.1 s)")).toBe("exit 0");
  expect(out("shell", { command: "bun test" }, false, "1 fail\n(exit 2 in 9.4 s)")).toBe("exit 2");
  expect(out("shell", { command: "sleep 9" }, false, "(stopped in 1.2 s)")).toBe("stopped");
  expect(out("shell", { command: "yes" }, false, "y\n(killed by SIGKILL in 3.0 s)")).toBe("killed by SIGKILL");
  expect(out("shell", { command: "yes" }, false, "y\n(killed by signal 34 in 1.2 s)")).toBe("killed by signal 34");
  expect(out("shell", { command: "rm -rf /" }, false, "Not run: the user's permission rules refuse it (rm).")).toBe("failed");
  expect(out("shell", { command: "ls" }, true, "x".repeat(100000) + "\n(exit 0 in 0.1 s)")).toBe("exit 0");
  expect(out("Bash", { command: "false" }, false, "Exit code 1\nboom")).toBe("exit 1");
  expect(out("Bash", { command: "true" }, true, "(no output)")).toBe("");
  expect(out("read", { path: "a.ts" }, true, "x\ny\n[lines 1-1204 of 1204]")).toBe("1,204 lines");
  expect(out("read", { path: "a.ts", offset: 4 }, true, "x\n[lines 4-4 of 15; go on with offset 5]")).toBe("1 line");
  expect(out("read", { path: "a.png" }, true, "Image a.png (png, 10×10, 92 B), attached to this result only: read it again to see it later.")).toBe("");
  expect(out("read", { path: "b.ts" }, false, "ENOENT: no such file")).toBe("failed");
  expect(out("write", { path: "a.ts" }, true, "--- a.ts\n+++ a.ts\n@@ -0,0 +1,2 @@\n+one\n+two")).toBe("+2");
  expect(out("edit", { edits: [] }, true, "--- a.ts\n+++ a.ts\n@@ -1,3 +1,3 @@\n a\n--- x\n+++ y\n c\n--- b.ts\n+++ b.ts\n@@ -1 +1 @@\n-p\n+q")).toBe("+2 -2");
  expect(out("write", { path: "a.ts" }, true, "a.ts is unchanged.")).toBe("unchanged");
  expect(out("zoom", { id: 4 }, false, "(stopped)")).toBe("stopped");
  expect(out("zoom", { id: 4 }, true, "user: hi")).toBe("");
  expect(out("web_search", { query: "bend" }, null, "")).toBe("");
  expect(out("mcp__x__shell", { command: "ls" }, true, "(exit 0 in 0.1 s)")).toBe("");
});
