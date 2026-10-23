// Trusted
// =======
// The folders the user trusts illi in (Trust.ts asks, at the start on a
// terminal): each kept by its project's folder (its git repo's top, else
// the folder itself; either one's subfolders trusted with it) in
// trust.json in illi's own folder, every profile's; home's own folder,
// and each above it (/home, /), is trusted only for the run it was
// answered in, never kept, as keeping it would trust every folder under
// it. What a project brings that runs or
// instructs (its .illi agents, commands and skills: Custom.ts) loads only
// in a trusted folder, so a pipe (never asked) runs a folder's own only
// once a terminal trusted it.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as config from "./Config.ts";
import { Projects } from "../chat/Projects.ts";

// Constants
// =========

const FILE = config.ROOT + "/trust.json";

// the folders trusted for this run only (home's, or one above it), and
// the kept ones as last read (null: not read yet)
const RUN = new Set<string>();
let KEPT: string[] | null = null;

// Trusted
// =======

export namespace Trusted {

  // the folder trust is kept for: the git repo's top, else cwd itself
  export function folder(cwd: string): string {
    const place = Projects.place(cwd);
    return place.path !== "" ? place.path : Projects.real(cwd);
  }

  // whether it is home's own folder, or one above it (/home, /): trusted
  // for a run, never kept
  export function home(folder: string): boolean {
    const home = Projects.real(os.homedir());
    return home === folder || home.startsWith(folder.endsWith(path.sep) ? folder : folder + path.sep);
  }

  // whether a folder, or one it is in, is trusted
  export function has(folder: string): boolean {
    const under = (f: string) => folder === f || folder.startsWith(f.endsWith(path.sep) ? f : f + path.sep);
    return RUN.has(folder) || Trusted.kept().some(under);
  }

  // the folders kept (none, or a file of another shape: none; home or
  // one above it, kept by an older illi: not)
  export function kept(): string[] {
    if (KEPT === null) {
      try {
        const got = JSON.parse(fs.readFileSync(FILE, "utf8"))?.folders;
        KEPT = Array.isArray(got) ? got.filter((f): f is string => typeof f === "string" && !Trusted.home(f)) : [];
      } catch {
        KEPT = [];
      }
    }
    return KEPT;
  }

  // a folder trusted from now on: kept (the file written whole and then
  // put in place, so a crash between leaves the old one), or, home's or
  // one above it, for this run
  export function trust(folder: string): void {
    RUN.add(folder);
    if (Trusted.home(folder)) {
      return;
    }
    KEPT = null;
    const folders = [...new Set([...Trusted.kept(), folder])].sort();
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify({ folders }, null, 2) + "\n");
    fs.renameSync(FILE + ".tmp", FILE);
    KEPT = folders;
  }

}
