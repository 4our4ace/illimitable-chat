// Seen
// ====
// The project's files that run as you work (its hooks.json, mcp.json and
// plugins), as illi last saw them, by a hash of their paths and
// contents: one new or changed since is said once at the start (its
// caller says what), then kept as seen. Kept in seen.json in illi's
// folder, out of the repository's reach.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as config from "./Config.ts";
import { Flock } from "./Flock.ts";
import { whole } from "../tools/Clip.ts";

export namespace Seen {

  // whether what a key names (its files: those there, by path and
  // contents) is new or changed since last seen; kept as seen now. None
  // there: nothing to see
  export function changed(key: string, files: string[]): boolean {
    const hash = crypto.createHash("sha256");
    let any = false;
    for (const file of [...files].sort()) {
      try {
        hash.update(file + "\0").update(fs.readFileSync(file)).update("\0");
        any = true;
      } catch {
        // not there: not part of it
      }
    }
    return any && seen_keep(key, hash.digest("hex"));
  }

}

// whether a key's value differs from the one kept (none kept: it does);
// the new one kept then, under the file's lock (Flock kept: another
// illi's key kept at that moment kept too), written whole (Clip whole);
// one that can't be written said, still taken as new
function seen_keep(key: string, now: string): boolean {
  const file = path.join(config.ROOT, "seen.json");
  const read = (): Record<string, string> => {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      return typeof data === "object" && data !== null && !Array.isArray(data) ? data : {};
    } catch {
      return {};
    }
  };
  if (read()[key] === now) {
    return false;
  }
  try {
    Flock.kept(file, config.LOCKED, () => whole(file, JSON.stringify({ ...read(), [key]: now }, null, 2) + "\n"));
  } catch (err: any) {
    console.error("illi: " + file + ": " + String(err?.message ?? err));
  }
  return true;
}
