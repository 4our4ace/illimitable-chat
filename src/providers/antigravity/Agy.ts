// Agy
// ===
// Google's Antigravity CLI itself (agy), whose `agy acp` is the agent
// illi runs, unmodified: where it is, and its download, as every CLI
// illi runs is found and downloaded (Cli.ts). ILLI_ANTIGRAVITY names a
// command line of the user's own that starts its ACP server (`agy acp`,
// say), run whatever its version. Else the user's own `agy` on PATH, once
// it is MINIMUM or later (its version asked once in the background, as
// `agy --version` takes a second or more, its own update not started by
// it, and kept in agy.json beside the builds). Else illi runs the one
// build this illi is pinned to (Pinned.ts, as pin.ts takes it from
// Google's releases on GitHub), as /login downloads it into
// antigravity/agent/<version>/ of illi's root beside the accounts'
// folders; with autoupdate on, by itself once a Google account is
// connected. A version an illi update left (Google's old agy-acp-server,
// 1.4.5) goes once no illi runs it.

import { cli } from "../Cli.ts";
import { PINNED } from "./Pinned.ts";

export type { Build, Tarred, Theirs } from "../Cli.ts";

// where every archive is taken from: the CLI's releases on GitHub (each
// a version's folder of them)
export const RELEASES = "https://github.com/google-antigravity/antigravity-cli/releases/download/";

// the oldest version illi runs: the one `agy acp` was first tried with
// (1.5.0 put Google's ACP server in the CLI; 1.5.1 lists every model an
// account offers to every client; 1.5.2 shows a session its own agent's
// commands). A later pin may be newer; one older is never taken
export const MINIMUM = "1.5.2";

export const Agy = cli({
  name     : "Google's Antigravity CLI",
  maker    : "Google's",
  short    : "Google's CLI",
  plan     : "the Google AI plan",
  from     : "Google's releases on GitHub",
  grows    : "",
  vendor   : "antigravity",
  program  : "agy",
  args     : ["acp"],
  named    : "ILLI_ANTIGRAVITY",
  update   : "agy update",
  releases : RELEASES,
  tag      : "",
  minimum  : MINIMUM,
  pinned   : PINNED,
  folder   : ["antigravity", "agent"],
  file     : "agy.json",
  asks     : ["--version"],
  quiet    : () => ({ AGY_CLI_DISABLE_AUTO_UPDATE: "1" }),
});
