// CopilotCli
// ==========
// GitHub's Copilot CLI itself (copilot), whose `copilot --headless
// --stdio` illi runs, unmodified: where it is, and its download, as
// every CLI illi runs is found and downloaded (Cli.ts). ILLI_COPILOT
// names a command line of the user's own, run whatever its version (one
// that doesn't speak illi's protocol is said: Copilot.known). Else the
// user's own `copilot` on PATH, once it is MINIMUM or later: its version
// asked once in the background as illi runs it (`copilot
// --no-auto-update --version`: the program's own, none of the newer ones
// it downloaded of itself), and kept in copilot.json beside the builds.
// Else illi runs the one build this illi is pinned to (Pinned.ts, as
// pin.ts takes it from GitHub's releases), as /login downloads it into
// copilot/cli/<version>/ of illi's root beside the accounts' folders;
// with autoupdate on, by itself once a GitHub account is connected. The
// CLI unpacks more of itself as it first runs: illi's build into its
// version's folder (Copilot.unpacked), gone with it.

import { cli } from "../Cli.ts";
import { PINNED } from "./Pinned.ts";

// where every archive is taken from: the CLI's releases on GitHub (each
// a tag's folder of them: v and the version)
export const RELEASES = "https://github.com/github/copilot-cli/releases/download/";

// the oldest version illi runs: the oldest that passed illi's live test
// (Live.test.ts) as illi runs it (1.0.98 and before don't take
// --disable-client-telemetry). A later pin may be newer; one older is
// never taken
export const MINIMUM = "1.0.100";

export const CopilotCli = cli({
  name     : "GitHub's Copilot CLI",
  maker    : "GitHub's",
  short    : "GitHub's CLI",
  plan     : "the GitHub Copilot plan",
  from     : "GitHub's releases",
  grows    : "and it unpacks about as much again as it first runs",
  vendor   : "github-copilot",
  program  : "copilot",
  args     : [],
  named    : "ILLI_COPILOT",
  update   : "copilot update",
  releases : RELEASES,
  tag      : "v",
  minimum  : MINIMUM,
  pinned   : PINNED,
  folder   : ["copilot", "cli"],
  file     : "copilot.json",
  asks     : ["--no-auto-update", "--version"],
  quiet    : () => ({ COPILOT_AUTO_UPDATE: "false" }),
});
