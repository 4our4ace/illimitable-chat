// Folder test
// ===========
// `bun test folder.test.ts`. Bun reads a bunfig.toml (its preload runs
// before illi) and a .env (an ILLI_* variable is a setting) from the
// folder it starts in: a project's own, so a repository's files would
// run as the user before any trust is asked. illi from its source runs
// with neither (main.ts's first line), shown on a folder planting both,
// first run with plain `bun`, as illi ran before, to show the plants do
// run there; and every place the one file is built leaves both out.

import { expect, test } from "bun:test";
import * as fs from "node:fs";
import { temp_dir } from "./repo.ts";

const MAIN = new URL("../src/main.ts", import.meta.url).pathname;
const REPO = new URL("..", import.meta.url).pathname;

// a folder whose bunfig.toml preloads a file that marks it ran, and
// whose .env names an MCP servers' file, its server marking it started
function planted(): string {
  const dir = temp_dir("illi-folder-");
  fs.writeFileSync(dir + "/bunfig.toml", 'preload = ["./planted.ts"]\n');
  fs.writeFileSync(dir + "/planted.ts", `require("node:fs").writeFileSync(${JSON.stringify(dir + "/preloaded")}, "");\n`);
  fs.writeFileSync(dir + "/.env", "ILLI_MCP=./mcp.json\n");
  fs.writeFileSync(dir + "/mcp.json", JSON.stringify({ mcpServers: { planted: { command: "sh", args: ["-c", `touch '${dir}/served'`] } } }));
  return dir;
}

// illi run from a pipe in the folder (Claude's API without a key: no
// call is made), by the command given; the marks found after
function run(dir: string, command: string[]): string[] {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), ILLI_DIR: dir + "/illi", ILLI_AUTOUPDATE: "off", BROWSER: "none" };
  delete env.ILLI_MCP;
  delete env.ANTHROPIC_API_KEY;
  Bun.spawnSync([...command], { cwd: dir, env, stdin: new Blob(["hi\n"]), stdout: "pipe", stderr: "pipe" });
  return ["preloaded", "served"].filter((mark) => fs.existsSync(dir + "/" + mark));
}

test("a folder's bunfig.toml preload and .env never reach illi run from its source", () => {
  expect(run(planted(), [process.execPath, MAIN])).toEqual(["preloaded", "served"]);
  expect(run(planted(), [MAIN])).toEqual([]);
});

test("every place the one file is built leaves a folder's bunfig.toml and .env out", () => {
  const builds = [
    JSON.parse(fs.readFileSync(REPO + "package.json", "utf8")).scripts.build,
    ...["install.sh", ".github/workflows/release.yml"].flatMap((f) => fs.readFileSync(REPO + f, "utf8").split("\n").filter((l) => l.includes("bun build"))),
  ];
  expect(builds.length).toBe(3);
  for (const b of builds) {
    expect(b).toContain("--no-compile-autoload-bunfig");
    expect(b).toContain("--no-compile-autoload-dotenv");
  }
});
