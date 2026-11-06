// Pin Google's Antigravity CLI
// ============================
// `bun src/providers/antigravity/pin.ts [version]`: a maintainer's step,
// never run by illi (docs/development.md). It takes a release of Google's
// Antigravity CLI from GitHub (the version named, else the latest): each
// machine's archive (MACHINES), with the sha256 and size GitHub tells of
// it, downloaded whole (into a temp folder, gone after) to check it as
// illi does (Agy.get: the sha256 as it comes) and to list its files as
// illi unpacks them (Agy.untar: their size unpacked, the CLI's program
// among them), each build checked as illi takes one (Agy.takes, the
// version MINIMUM or later), and writes them to Pinned.ts, the build each
// machine's illi runs. Live.test.ts then tries it before a release takes
// it.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Build } from "./Agy.ts";

// the CLI's releases on GitHub (its API)
const API = "https://api.github.com/repos/google-antigravity/antigravity-cli/releases/";

// each machine illi has a build for (Agy.machine), and its archive's name
// in a release
const MACHINES: Record<string, string> = {
  "darwin-aarch64": "agy_cli_mac_arm64.tar.gz",
  "darwin-x86_64" : "agy_cli_mac_x64.tar.gz",
  "linux-aarch64" : "agy_cli_linux_arm64.tar.gz",
  "linux-x86_64"  : "agy_cli_linux_x64.tar.gz",
};

// the program in each archive, and its arguments that start its ACP
// server
const CMD  = "antigravity";
const ARGS = ["acp"];

// the file written
const OUT = path.join(import.meta.dir, "Pinned.ts");

// illi's folder a temp one while Agy.ts loads (Config.ts reads its own),
// never the user's
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "illi-pin-"));
process.env.ILLI_DIR = DIR;
const { Agy } = await import("./Agy.ts");

// a URL's answer, said as illi; thrown: one not ok
async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "user-agent": "illi", accept: "application/vnd.github+json" } });
  if (!res.ok) {
    throw new Error(url + " answered " + res.status);
  }
  return res;
}

// a release's archive for a machine, downloaded, checked and listed
async function pin(version: string, machine: string, asset: any): Promise<Build> {
  const sha256 = /^sha256:([0-9a-f]{64})$/.exec(String(asset?.digest ?? ""))?.[1] ?? "";
  const build: Build = { version, archive: String(asset?.browser_download_url ?? ""), sha256, bytes: Number(asset?.size) || 0, unpacked: 1, cmd: CMD, args: ARGS };
  if (!Agy.takes(build)) {
    throw new Error(machine + ": GitHub's archive isn't one illi takes (" + JSON.stringify(build) + ")");
  }
  const file = path.join(DIR, machine + ".tar.gz");
  await Agy.get(build, file, new AbortController().signal, () => {});
  if (fs.statSync(file).size !== build.bytes) {
    throw new Error(machine + ": the archive isn't the size GitHub tells of it");
  }
  const files = await Agy.untar(fs.createReadStream(file), null);
  fs.rmSync(file, { force: true });
  if (!files.some((f) => f.name === CMD)) {
    throw new Error(machine + ": the archive has no " + CMD + " (" + files.map((f) => f.name).join(", ") + ")");
  }
  return { ...build, unpacked: files.reduce((n, f) => n + f.size, 0) };
}

try {
  const named   = process.argv[2]?.trim();
  const release = await (await get(API + (named ? "tags/" + named : "latest"))).json();
  const version = String(release?.tag_name ?? "").replace(/^v/, "");
  const assets  = Array.isArray(release?.assets) ? release.assets : [];
  const pins: Array<[string, Build]> = [];
  for (const [machine, name] of Object.entries(MACHINES)) {
    const asset = assets.find((a: any) => a?.name === name);
    if (asset === undefined) {
      throw new Error(machine + ": release " + version + " has no " + name);
    }
    const build = await pin(version, machine, asset);
    pins.push([machine, build]);
    console.log(machine + ": " + build.version + ", " + Math.round(build.bytes / 1e6) + " MB, " + Math.round(build.unpacked / 1e6) + " MB unpacked");
  }
  const lines = pins.map(([machine, b]) => "  " + JSON.stringify(machine) + ": { " + Object.entries(b).map(([k, v]) => k + ": " + JSON.stringify(v)).join(", ") + " },");
  fs.writeFileSync(OUT, `// Pinned
// ======
// The build of Google's Antigravity CLI this illi runs (its \`acp\`), for
// each machine (Agy.machine): the version tried with this illi
// (Live.test.ts), taken from the CLI's releases on GitHub. Written by
// pin.ts, not by hand: a new version is taken as docs/development.md says.

import type { Build } from "./Agy.ts";

export const PINNED: Record<string, Build> = {
${lines.join("\n")}
};
`);
  console.log("wrote " + path.relative(process.cwd(), OUT) + ": Antigravity CLI " + version);
} finally {
  fs.rmSync(DIR, { recursive: true, force: true });
}
