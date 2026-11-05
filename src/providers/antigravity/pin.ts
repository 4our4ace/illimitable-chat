// Pin Google's agent
// ==================
// `bun src/providers/antigravity/pin.ts`: a maintainer's step, never run
// by illi (docs/development.md). It takes the version of Google's agent
// (antigravity-acp) the ACP registry lists now: each machine's build (its
// archive, sha256, command and arguments), with what Google's host tells
// of it (the archive's size, and its files' size unpacked, from the
// archive's list of files, read from its last bytes alone), each checked
// as illi takes a build (Agy.takes, its command in the archive), and
// writes them to Pinned.ts, the build each machine's illi runs. Live.test.ts
// then tries it on Google's real agent before a release takes it.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Build } from "./Agy.ts";

// the ACP registry, and the agent's id in it
const REGISTRY = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
const ID = "antigravity-acp";

// the file written
const OUT = path.join(import.meta.dir, "Pinned.ts");

// illi's folder a temp one while Agy.ts loads (Config.ts reads its own),
// never the user's
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "illi-pin-"));
process.env.ILLI_DIR = DIR;
const { Agy, TAIL } = await import("./Agy.ts");

// a URL's answer, said as illi; thrown: one not ok
async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const res = await fetch(url, { headers: { "user-agent": "illi", "accept-encoding": "identity", ...headers } });
  if (!res.ok) {
    throw new Error(url + " answered " + res.status);
  }
  return res;
}

// a registry's build, with what Google's host tells of its archive
async function pin(version: string, machine: string, b: any): Promise<Build> {
  const res   = await get(String(b?.archive ?? ""), { range: "bytes=-" + TAIL });
  const total = Number(/\/(\d+)$/.exec(res.headers.get("content-range") ?? "")?.[1]);
  const tail  = Buffer.from(await res.arrayBuffer());
  if (res.status !== 206 || !(total > 0)) {
    throw new Error(machine + ": Google's host didn't answer for the archive's last bytes alone");
  }
  const end  = Agy.end(tail);
  const from = end.at - (total - tail.length);
  if (from < 0 || from + end.bytes > tail.length) {
    throw new Error(machine + ": the archive's list of files isn't in its last bytes");
  }
  const files = Agy.list(tail.subarray(from, from + end.bytes), end.count);
  const build: Build = {
    version,
    archive : String(b.archive),
    sha256  : String(b?.sha256 ?? ""),
    bytes   : total,
    unpacked: files.reduce((n, f) => n + f.size, 0),
    cmd     : String(b?.cmd ?? "").replace(/^\.\//, ""),
    args    : Array.isArray(b?.args) ? b.args.map(String) : [],
  };
  if (!Agy.takes(build) || !files.some((f) => f.name === build.cmd)) {
    throw new Error(machine + ": the registry's build isn't one illi takes (" + JSON.stringify(b) + ")");
  }
  return build;
}

try {
  const all = await (await get(REGISTRY)).json();
  const it  = (Array.isArray(all?.agents) ? all.agents : []).find((a: any) => a?.id === ID);
  if (it === undefined) {
    throw new Error("the ACP registry no longer lists " + ID);
  }
  const version = String(it.version ?? "");
  const pins: Array<[string, Build]> = [];
  for (const [machine, b] of Object.entries<any>(it.distribution?.binary ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const build = await pin(version, machine, b);
    pins.push([machine, build]);
    console.log(machine + ": " + build.version + ", " + Math.round(build.bytes / 1e6) + " MB, " + Math.round(build.unpacked / 1e6) + " MB unpacked");
  }
  const lines = pins.map(([machine, b]) => "  " + JSON.stringify(machine) + ": { " + Object.entries(b).map(([k, v]) => k + ": " + JSON.stringify(v)).join(", ") + " },");
  fs.writeFileSync(OUT, `// Pinned
// ======
// The build of Google's agent (antigravity-acp) this illi runs, for each
// machine as the ACP registry names it (Agy.machine): the version tried
// with this illi (Live.test.ts). Written by pin.ts, not by hand: a new
// version is taken as docs/development.md says.

import type { Build } from "./Agy.ts";

export const PINNED: Record<string, Build> = {
${lines.join("\n")}
};
`);
  console.log("wrote " + path.relative(process.cwd(), OUT) + ": antigravity-acp " + version);
} finally {
  fs.rmSync(DIR, { recursive: true, force: true });
}
