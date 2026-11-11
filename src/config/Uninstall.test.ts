// Uninstall test
// ==============
// `bun test Uninstall.test.ts`. `illi uninstall` run as a program, its
// home and illi's folder temp ones (nothing of the user's within reach):
// --programs removes the CLIs illi downloaded (each provider's
// programs) and keeps the chats, settings and accounts; --everything logs
// each account of a plan's own program out by it (Claude Code's, stood in
// for), then removes illi's folder whole; neither, off a terminal, says
// how to pick and removes nothing; both refused. Never while another illi
// holds a project's chat; never illi's folder whole where it's the home
// folder, holds it, or isn't illi's. An illi run from its source says the
// source is left.

import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TMP  = fs.mkdtempSync(os.tmpdir() + "/illi-uninstall-");
const MAIN = path.join(import.meta.dir, "..", "main.ts");

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

// a home with illi's folder in it: a chat, a config, the CLIs illi
// downloaded (Google's and GitHub's), a Claude account of illi's and the
// user's own
function home(name: string): { home: string; root: string } {
  const home = path.join(TMP, name);
  const root = path.join(home, ".illi");
  const file = (rel: string, data = "x") => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), data);
  };
  file("chat/projects/home.sqlite");
  file("config.json", "{}");
  file("antigravity/agent/1.5.2/antigravity");
  file("antigravity/agy.json", "{}");
  file("antigravity/g1/.gemini/settings.json");
  file("copilot/cli/1.0.109/copilot");
  file("copilot/copilot.json", "{}");
  file("claude/c1/.claude.json");
  file("accounts.json", JSON.stringify({ "claude-code": { use: "c1", accounts: [{ id: "own", email: "", plan: "", org: "" }, { id: "c1", email: "someone@example.com", plan: "max", org: "" }] } }));
  const claude = path.join(home, "bin", "claude");
  fs.mkdirSync(path.dirname(claude), { recursive: true });
  fs.writeFileSync(claude, "#!/bin/sh\necho \"$* $CLAUDE_CONFIG_DIR\" >> " + path.join(home, "claude.log") + "\n", { mode: 0o755 });
  return { home, root };
}

// `illi uninstall` run with these arguments, in that home: its output and
// exit code
async function run(where: { home: string; root?: string }, ...args: string[]): Promise<{ out: string; code: number }> {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: where.home, ILLI_CLAUDE: path.join(where.home, "bin", "claude"), ILLI_VENDORS: "claude-api" };
  if (where.root !== undefined) {
    env.ILLI_DIR = where.root;
  }
  const proc = Bun.spawn([process.execPath, "--no-env-file", MAIN, "uninstall", ...args], { env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { out: out + err, code };
}

test("--programs removes the CLIs illi downloaded and keeps the chats, settings and accounts; illi's source is left, said", async () => {
  const at = home("programs");
  const { out, code } = await run({ home: at.home }, "--programs");
  expect(code).toBe(0);
  expect(fs.existsSync(at.root + "/antigravity/agent") || fs.existsSync(at.root + "/antigravity/agy.json") || fs.existsSync(at.root + "/copilot/cli") || fs.existsSync(at.root + "/copilot/copilot.json")).toBe(false);
  expect([fs.existsSync(at.root + "/chat/projects/home.sqlite"), fs.existsSync(at.root + "/antigravity/g1"), fs.existsSync(at.root + "/claude/c1"), fs.existsSync(at.root + "/accounts.json")]).toEqual([true, true, true, true]);
  expect(out).toContain("Removed ~/.illi/copilot/cli (the GitHub Copilot plan's CLI, 0 MB).");
  expect(out).toContain("Removed ~/.illi/antigravity/agent (the Google AI plan's CLI, 0 MB).");
  expect(out).toContain("This illi runs from its source in ");
  expect(out).toContain("illi is uninstalled but for its source. Your chats, settings and accounts are still in ~/.illi");
  expect([fs.existsSync(at.home + "/claude.log"), out.includes("copilot.json")]).toEqual([false, false]);
});

test("--everything logs each account of a plan's own program out by it (illi's alone, never the user's own Claude Code), then removes illi's folder whole", async () => {
  const at = home("everything");
  const { out, code } = await run({ home: at.home }, "--everything");
  expect(code).toBe(0);
  expect(fs.readFileSync(at.home + "/claude.log", "utf8")).toBe("auth logout " + at.root + "/claude/c1\n");
  expect(out).toContain("Logged out of someone@example.com (Claude plan).");
  expect(out).toContain("Removed ~/.illi (illi's folder: your chats, settings and accounts, ");
  expect(fs.existsSync(at.root)).toBe(false);
  expect(fs.existsSync(at.home + "/bin/claude")).toBe(true);
});

test("neither off a terminal says how to pick, both are refused; nothing removed", async () => {
  const at = home("neither");
  const none = await run({ home: at.home });
  expect([none.code, none.out]).toEqual([1, expect.stringContaining("run illi uninstall --programs (illi and the CLIs it downloaded) or --everything")]);
  const both = await run({ home: at.home }, "--programs", "--everything");
  expect([both.code, both.out]).toEqual([1, expect.stringContaining("not both")]);
  expect(fs.existsSync(at.root + "/copilot/cli/1.0.109/copilot")).toBe(true);
});

test("never while another illi holds a project's chat", async () => {
  const at = home("busy");
  fs.mkdirSync(at.root + "/locks", { recursive: true });
  const db = new Database(at.root + "/locks/home.lock", { create: true });
  db.run("pragma journal_mode = memory");
  db.run("begin exclusive");
  try {
    const { out, code } = await run({ home: at.home }, "--everything");
    expect([code, out]).toEqual([1, expect.stringContaining("illi is open in another terminal: quit it there first")]);
    expect(fs.existsSync(at.root + "/chat")).toBe(true);
  } finally {
    db.close();
  }
});

test("never illi's folder whole where it's the home folder or holds it, or isn't illi's", async () => {
  const at = home("guard");
  fs.writeFileSync(at.home + "/mine.txt", "keep");
  fs.cpSync(at.root, at.home, { recursive: true });
  const homed = await run({ home: at.home, root: at.home }, "--everything");
  expect([homed.code, homed.out]).toEqual([1, expect.stringContaining("~ isn't removed whole, as it's your home folder, or holds it: nothing was removed")]);
  expect([fs.existsSync(at.home + "/mine.txt"), fs.existsSync(at.home + "/claude.log")]).toEqual([true, false]);
  const other = path.join(at.home, "notes");
  fs.mkdirSync(other);
  fs.writeFileSync(other + "/todo.txt", "keep");
  const odd = await run({ home: at.home, root: other }, "--everything");
  expect([odd.code, odd.out]).toEqual([1, expect.stringContaining("~/notes isn't removed whole, as it doesn't look like illi's folder")]);
  expect(fs.existsSync(other + "/todo.txt")).toBe(true);
});
