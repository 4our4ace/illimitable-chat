// Pin GitHub's Copilot CLI
// ========================
// `bun src/providers/github-copilot/pin.ts [tag]`: a maintainer's step,
// never run by illi (docs/development.md). It takes a release of GitHub's
// Copilot CLI from GitHub (the tag named, v1.0.109, else the latest) as
// every CLI's pin does (Pin.ts), and writes Pinned.ts, the build each
// machine's illi runs. Live.test.ts then tries it before a release takes
// it.

import * as path from "node:path";
import { pin } from "../Pin.ts";

await pin({
  api      : "https://api.github.com/repos/github/copilot-cli/releases/",
  machines : {
    "darwin-aarch64": "copilot-darwin-arm64.tar.gz",
    "darwin-x86_64" : "copilot-darwin-x64.tar.gz",
    "linux-aarch64" : "copilot-linux-arm64.tar.gz",
    "linux-x86_64"  : "copilot-linux-x64.tar.gz",
  },
  cmd      : "copilot",
  args     : [],
  load     : async () => (await import("./CopilotCli.ts")).CopilotCli,
  out      : path.join(import.meta.dir, "Pinned.ts"),
  heading  : `// Pinned
// ======
// The build of GitHub's Copilot CLI this illi runs, for each machine
// (Cli.ts cli_machine): the version tried with this illi (Live.test.ts),
// taken from the CLI's releases on GitHub. Written by pin.ts, not by
// hand: a new version is taken as docs/development.md says.
`,
}, process.argv[2]?.trim());
