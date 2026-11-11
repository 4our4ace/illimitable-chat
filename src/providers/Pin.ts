// Pin
// ===
// A maintainer's step, never run by illi (docs/development.md): a release
// of a CLI illi runs taken from GitHub (the version named, else the
// latest) as the build each machine's illi runs, its Pinned.ts written
// (each CLI's pin.ts: `bun src/providers/<vendor>/pin.ts [version]`).
// Each machine's archive (the machines named) with the sha256 and size
// GitHub tells of it, downloaded whole (into a temp folder, gone after)
// to check it as illi does (Cli.get: the sha256 as it comes) and to list
// its files as illi unpacks them (Cli.untar: their size unpacked, the
// CLI's program among them), each build checked as illi takes one
// (Cli.takes, the version its minimum or later). The CLI's Live.test.ts
// then tries it before a release takes it.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Build, Cli } from "./Cli.ts";

// a CLI's pin: its releases on GitHub (the API's URL, ending in
// releases/), each machine's archive's name in a release, the program in
// it and its arguments; the CLI itself (loaded once illi's folder is a
// temp one: Config.ts reads its own as it loads, never the user's here);
// the Pinned.ts written, and the comment heading it
export type Pinning = {
  api      : string;
  machines : Record<string, string>;
  cmd      : string;
  args     : string[];
  load     : () => Promise<Cli>;
  out      : string;
  heading  : string;
};

// a URL's answer, said as illi; thrown: one not ok
async function pin_get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "user-agent": "illi", accept: "application/vnd.github+json" } });
  if (!res.ok) {
    throw new Error(url + " answered " + res.status);
  }
  return res;
}

// a release's archive for a machine, downloaded into `dir`, checked and
// listed
async function pin_one(p: Pinning, c: Cli, dir: string, version: string, machine: string, asset: any): Promise<Build> {
  const sha256 = /^sha256:([0-9a-f]{64})$/.exec(String(asset?.digest ?? ""))?.[1] ?? "";
  const build: Build = { version, archive: String(asset?.browser_download_url ?? ""), sha256, bytes: Number(asset?.size) || 0, unpacked: 1, cmd: p.cmd, args: p.args };
  if (!c.takes(build)) {
    throw new Error(machine + ": GitHub's archive isn't one illi takes (" + JSON.stringify(build) + ")");
  }
  const file = path.join(dir, machine + ".tar.gz");
  await c.get(build, file, new AbortController().signal, () => {});
  if (fs.statSync(file).size !== build.bytes) {
    throw new Error(machine + ": the archive isn't the size GitHub tells of it");
  }
  const files = await c.untar(fs.createReadStream(file), null);
  fs.rmSync(file, { force: true });
  if (!files.some((f) => f.name === p.cmd)) {
    throw new Error(machine + ": the archive has no " + p.cmd + " (" + files.map((f) => f.name).join(", ") + ")");
  }
  return { ...build, unpacked: files.reduce((n, f) => n + f.size, 0) };
}

// the release named (none: the latest) pinned: each machine's build,
// said as it's taken, then Pinned.ts written
export async function pin(p: Pinning, named: string | undefined): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "illi-pin-"));
  process.env.ILLI_DIR = dir;
  try {
    const c       = await p.load();
    const release = await (await pin_get(p.api + (named ? "tags/" + named : "latest"))).json();
    const version = String(release?.tag_name ?? "").replace(/^v/, "");
    const assets  = Array.isArray(release?.assets) ? release.assets : [];
    const pins: Array<[string, Build]> = [];
    for (const [machine, name] of Object.entries(p.machines)) {
      const asset = assets.find((a: any) => a?.name === name);
      if (asset === undefined) {
        throw new Error(machine + ": release " + version + " has no " + name);
      }
      const build = await pin_one(p, c, dir, version, machine, asset);
      pins.push([machine, build]);
      console.log(machine + ": " + build.version + ", " + Math.round(build.bytes / 1e6) + " MB, " + Math.round(build.unpacked / 1e6) + " MB unpacked");
    }
    const lines = pins.map(([machine, b]) => "  " + JSON.stringify(machine) + ": { " + Object.entries(b).map(([k, v]) => k + ": " + JSON.stringify(v)).join(", ") + " },");
    fs.writeFileSync(p.out, p.heading + `
import type { Build } from "../Cli.ts";

export const PINNED: Record<string, Build> = {
${lines.join("\n")}
};
`);
    console.log("wrote " + path.relative(process.cwd(), p.out) + ": " + c.spec.name + " " + version);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
