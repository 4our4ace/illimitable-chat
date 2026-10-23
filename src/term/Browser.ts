// Browser
// =======
// A link opened in the user's own browser (/login's page): $BROWSER's
// programs first, each tried till one opens it (`none`: never any), then
// the system's: on WSL Windows' own handler (rundll32's url.dll, as
// xdg-utils opens a link there: no shell parses the link, and it never
// takes the terminal), macOS' open, elsewhere xdg-open on a display.
// Over SSH only $BROWSER's (the system's would open on the far
// machine); never a console browser (it can't run beside the screen).
// Each runs with the link as an argument, from its own folder, in a
// session of its own (Ctrl+Z, a closed terminal and illi's quit never
// reach it; not marked ILLI_RUN, which Machine.end kills), its input and
// output none, waited on WAIT at most.

import * as path from "node:path";
import { host_wsl } from "./Host.ts";

// Constants
// =========

// how long a browser's start is waited on (ms): one that fails says so by
// then; one still running has opened
const WAIT = 2000;

// browsers that draw in a terminal: never run from illi's
const CONSOLE = new Set(["w3m", "lynx", "links", "links2", "elinks", "www-browser", "browsh", "carbonyl"]);

// Browser
// =======

// the programs, each with its arguments, that may open url, in the order
// tried (none: not an http(s) link, $BROWSER none, or nothing here):
// $BROWSER's entries found (`:`-separated; an entry found whole is one
// program, a path with spaces too, else its words, quotes holding one
// together; `%s` is the link, else the link goes last; a console browser
// left out), then, but over SSH, the system's (wsl: WSL with Windows'
// programs in reach)
export function browser_commands(url: string, env: Record<string, string | undefined>, platform: string, wsl: boolean, which: (program: string) => string | null): string[][] {
  const link = browser_link(url);
  const set  = (env.BROWSER ?? "").trim();
  if (link === null || set.toLowerCase() === "none") {
    return [];
  }
  const own = set.split(":").flatMap((entry) => browser_entry(entry.trim(), link, which));
  if (env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY) {
    return own;
  }
  const found  = (run: string[]) => (which(run[0]) === null ? [] : [run]);
  const system = wsl ? found(["rundll32.exe", "url.dll,FileProtocolHandler", link]) : platform === "darwin" ? found(["open", link]) : env.DISPLAY || env.WAYLAND_DISPLAY ? found(["xdg-open", link]) : [];
  return [...own, ...system];
}

// url opened in the browser, each program browser_commands gives tried
// in turn till one opens it: null, none to try; else, once done, "" or
// why none did
export function browser_open(url: string, wait = WAIT): Promise<string> | null {
  const runs = browser_commands(url, process.env, process.platform, host_wsl(), (program) => Bun.which(program));
  if (runs.length === 0) {
    return null;
  }
  return (async () => {
    const whys: string[] = [];
    for (const run of runs) {
      const why = await browser_run(run, wait);
      if (why === "") {
        return "";
      }
      whys.push(why);
    }
    return whys.join("; ");
  })();
}

// a browser's program run, as the header says: "" once it exited 0 or
// still runs after wait ms, else why not, in plain words (xdg-open's own
// codes read)
export async function browser_run(run: string[], wait = WAIT): Promise<string> {
  const name = path.basename(run[0]);
  let proc: Bun.Subprocess;
  try {
    const { ILLI_RUN: _, ...env } = process.env;
    proc = Bun.spawn(run, { cwd: path.dirname(Bun.which(run[0]) ?? run[0]), env, stdin: "ignore", stdout: "ignore", stderr: "ignore", detached: true });
  } catch {
    return name + " couldn't start";
  }
  proc.unref();
  const waited = new Promise<null>((done) => setTimeout(() => done(null), wait).unref());
  const code   = await Promise.race([proc.exited, waited]);
  return code === null || code === 0 ? ""
    : proc.signalCode !== null ? name + " was killed"
    : name === "xdg-open" && code === 3 ? "xdg-open found no browser"
    : name === "xdg-open" && code === 4 ? "xdg-open's browser failed"
    : name + " exited " + code;
}

// an http(s) link as given to a browser, normalized (what could read as
// anything but a link, percent-encoded); null: not one
function browser_link(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

// one $BROWSER entry as a program and its arguments, the link put in
// (none: empty, not found, or a console browser)
function browser_entry(entry: string, link: string, which: (program: string) => string | null): string[][] {
  const words = entry !== "" && which(entry) !== null ? [entry] : [...entry.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  if (words.length === 0 || which(words[0]) === null || CONSOLE.has(path.basename(words[0]))) {
    return [];
  }
  return [words.some((w) => w.includes("%s")) ? words.map((w) => w.replaceAll("%s", link)) : [...words, link]];
}
