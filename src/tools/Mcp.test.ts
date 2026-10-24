// Mcp test
// ========
// `bun test Mcp.test.ts`. The user's MCP servers: a command's (its tools
// in pages, its env's ${VAR}, a call's text and images, a failure, a call
// stopped and cancelled at it), a URL's (its session, an answer in an
// event stream), one that dies, one that is no program, one disabled;
// their tools beside illi's, named apart, and an agent's allowing them by
// server; what a server says of a tool (only reads) kept, so that one
// runs unasked and another is asked first (Tools.guard).

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import { temp_dir, temp_repo } from "../../test/repo.ts";

const DIR = temp_dir("illi-mcp-");
// the chat's project: a throwaway repository, never this checkout
const CWD = temp_repo("illi-mcp-cwd-");
const CANCELLED = DIR + "/cancelled";
process.env.ILLI_DIR = DIR;
process.env.MCP_TEST_TOKEN = "t0k";

// a stdio server: echo (text and an image; only reads, it says),
// fail.me, slow (answers never; its cancel written down), fail_me (named
// as fail.me is); its tools in two pages
fs.writeFileSync(DIR + "/fake.ts", `
const fs = require("node:fs");
const tools = [
  { name: "echo", description: "Echo it", annotations: { readOnlyHint: true }, inputSchema: { $schema: "http://json-schema.org/draft-07/schema#", type: "object", properties: { text: { type: "string" } } } },
  { name: "fail.me", description: "Fails" },
  { name: "slow", description: "Waits" },
  { name: "fail_me", description: "Underscored" },
];
const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\\n");
let buf = "";
process.stdin.on("data", (d) => {
  buf += d;
  for (let i = buf.indexOf("\\n"); i >= 0; i = buf.indexOf("\\n")) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (m.method === "initialize") send({ id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fake" } } });
    if (m.method === "tools/list") send({ id: m.id, result: m.params.cursor ? { tools: tools.slice(1) } : { tools: tools.slice(0, 1), nextCursor: "2" } });
    if (m.method === "tools/call" && m.params.name === "echo") send({ id: m.id, result: { content: [{ type: "text", text: "echo: " + m.params.arguments.text + " in " + process.cwd() + " with " + process.env.TOKEN + " " + process.env.GIT_ALLOW_PROTOCOL }, { type: "image", data: "aGk=", mimeType: "image/png" }] } });
    if (m.method === "tools/call" && m.params.name === "fail.me") send({ id: m.id, result: { content: [{ type: "text", text: "bad" }], isError: true } });
    if (m.method === "tools/call" && m.params.name === "fail_me") send({ id: m.id, result: { content: [{ type: "text", text: "underscored" }] } });
    if (m.method === "notifications/cancelled") fs.writeFileSync(process.env.CANCELLED, String(m.params.requestId));
  }
});
process.stderr.write("fake up\\n");
`);

// a URL's server: a session from its start on, a call answered in an
// event stream after a notification
let sessions = 0;
const web = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: async (req) => {
  const m = await req.json();
  const json = (result: object, head: Record<string, string> = {}) => Response.json({ jsonrpc: "2.0", id: m.id, result }, { headers: head });
  if (m.method === "initialize") {
    return json({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "web" } }, { "mcp-session-id": "s1" });
  }
  sessions += req.headers.get("mcp-session-id") === "s1" ? 1 : 0;
  if (m.id === undefined) {
    return new Response(null, { status: 202 });
  }
  if (m.method === "tools/list") {
    return json({ tools: [{ name: "add", description: "Adds", inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } } } }] });
  }
  const sum = JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: String(m.params.arguments.a + m.params.arguments.b) }] } });
  const body = "event: message\ndata: " + JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: {} }) + "\n\nevent: message\ndata: " + sum + "\n\n";
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
} });
process.env.MCP_TEST_PORT = String(web.port);

fs.writeFileSync(DIR + "/mcp.json", JSON.stringify({ mcpServers: {
  fake    : { command: process.execPath, args: [DIR + "/fake.ts"], env: { TOKEN: "${MCP_TEST_TOKEN}", CANCELLED } },
  web     : { type: "http", url: "http://127.0.0.1:${MCP_TEST_PORT}/mcp" },
  dies    : { command: process.execPath, args: ["-e", "console.error('boom'); process.exit(3)"] },
  nothing : { command: "/no/such/program" },
  off     : { command: process.execPath, args: [DIR + "/fake.ts"], disabled: true },
} }));

const { Mcp } = await import("./Mcp.ts");
const { Tools } = await import("./Tools.ts");
const { Custom } = await import("../config/Custom.ts");

Mcp.start(CWD);

afterAll(() => {
  Mcp.stop();
  web.stop(true);
});

// the tools of a chat no one is at, in careful mode: a question is a
// no, at once
const asked: string[] = [];
const ask   = async (q: { tool: string }) => (asked.push(q.tool), { yes: false, always: false, said: "No one is at illi's screen to ask, so it isn't allowed." });
const tools = { mem: null as any, agents: new Map(), perm: { mode: "careful" as const, granted: new Set<string>(), refused: [], calls: new Map<string, string[]>() }, url: "", cwd: CWD, hooks: { main: () => null, ask, change: () => {} } as any };

test("each server's tools, named by it, in pages, beside illi's", async () => {
  await Mcp.settle();
  expect(Mcp.tools().map((t) => t.name)).toEqual(["mcp__fake__echo", "mcp__fake__fail_me", "mcp__fake__slow", "mcp__fake__fail_me_2", "mcp__web__add"]);
  expect(Mcp.tools()[0]).toMatchObject({ info: "(fake) Echo it", schema: { type: "object", properties: { text: { type: "string" } } } });
  expect(JSON.stringify(Mcp.tools())).not.toContain("$schema");
  const names = Tools.list(tools, "main").map((t) => t.name);
  expect(names).toContain("shell");
  expect(names).toContain("mcp__web__add");
});

test("a call: its text and images, run in the working dir with its env (the test preload's GIT_ALLOW_PROTOCOL too: Bun gives a child only what its spawn passes); a failure", async () => {
  const out = await Tools.call(tools, "main", "mcp__fake__echo", { text: "hi" }, new AbortController().signal);
  expect(out).toEqual({ text: "echo: hi in " + CWD + " with t0k file", fail: false, imgs: [{ type: "image/png", data: "aGk=" }] });
  expect(await Mcp.call("mcp__fake__fail_me", {}, new AbortController().signal)).toMatchObject({ text: "bad", fail: true });
  expect(await Mcp.call("mcp__fake__gone", {}, new AbortController().signal)).toMatchObject({ fail: true });
});

test("what a server says of a tool is kept: one that only reads runs unasked, another is asked first (in auto, run)", async () => {
  expect(Mcp.hints("mcp__fake__echo")).toEqual({ read: true, destructive: false });
  expect(Mcp.hints("mcp__web__add")).toEqual({ read: false, destructive: false });
  expect(Mcp.hints("mcp__fake__gone")).toBeUndefined();
  const out = await Tools.call(tools, "main", "mcp__web__add", { a: 2, b: 3 }, new AbortController().signal);
  expect(out.text).toStartWith("No one is at illi's screen to ask, so it isn't allowed. Asked because mcp__web__add isn't marked by its server as only reading.");
  expect(asked).toEqual(["mcp__web__add"]);
  const auto = { ...tools, perm: { ...tools.perm, mode: "auto" as const } };
  expect(await Tools.call(auto, "main", "mcp__web__add", { a: 2, b: 3 }, new AbortController().signal)).toMatchObject({ text: "5", fail: false });
  expect(asked).toEqual(["mcp__web__add"]);
});

test("names alike after sanitising or cutting are numbered, and each called at its own tool", async () => {
  expect(await Mcp.call("mcp__fake__fail_me_2", {}, new AbortController().signal)).toMatchObject({ text: "underscored", fail: false });
  const taken = new Set(["mcp__my_srv__get", "mcp__my_srv__get_2"]);
  expect(Mcp.name("my.srv", "get", taken)).toBe("mcp__my_srv__get_3");
  const long = Mcp.name("s", "x".repeat(80));
  expect(long).toHaveLength(64);
  expect(Mcp.name("s", "x".repeat(90), new Set([long]))).toBe(long.slice(0, 62) + "_2");
});

test("a call stopped is cancelled at its server", async () => {
  const stop = new AbortController();
  const out = Mcp.call("mcp__fake__slow", {}, stop.signal);
  await Bun.sleep(50);
  stop.abort(new Error("stopped by the user"));
  expect(await out).toMatchObject({ text: "fake: stopped by the user", fail: true });
  for (let k = 0; !fs.existsSync(CANCELLED) && k < 100; k++) {
    await Bun.sleep(10);
  }
  expect(Number(fs.readFileSync(CANCELLED, "utf8"))).toBeGreaterThan(1);
});

test("a URL's server: its session kept, an answer in an event stream", async () => {
  expect(await Mcp.call("mcp__web__add", { a: 2, b: 3 }, new AbortController().signal)).toMatchObject({ text: "5", fail: false });
  expect(sessions).toBeGreaterThan(1);
});

test("a server that dies or is no program fails, told why; one disabled never starts", () => {
  const how = Object.fromEntries(Mcp.status().servers.map((s) => [s.name, s.state + (s.why === "" ? "" : ": " + s.why)]));
  expect(how.fake).toBe("ready");
  expect(how.dies).toBe("failed: exited (code 3): boom");
  expect(how.nothing).toStartWith("failed: ");
  expect(how.off).toBeUndefined();
});

test("an agent allows a server's tools by its name", () => {
  const profile = { name: "x", description: "", mode: "all", model: null, effort: null, tools: ["read", "mcp__web"], color: null, body: "", file: "" } as const;
  expect(Custom.allow({ ...profile, tools: ["read", "mcp__web"] }, Mcp.tools()).map((t) => t.name)).toEqual(["mcp__web__add"]);
  expect(Custom.allow({ ...profile, tools: ["mcp"] }, Mcp.tools())).toHaveLength(5);
});
