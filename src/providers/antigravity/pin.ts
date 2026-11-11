// Pin Google's Antigravity CLI
// ============================
// `bun src/providers/antigravity/pin.ts [version]`: a maintainer's step,
// never run by illi (docs/development.md). It takes a release of Google's
// Antigravity CLI from GitHub (the version named, else the latest) as
// every CLI's pin does (Pin.ts), and writes Pinned.ts, the build each
// machine's illi runs. Live.test.ts then tries it before a release takes
// it.

import * as path from "node:path";
import { pin } from "../Pin.ts";

await pin({
  api      : "https://api.github.com/repos/google-antigravity/antigravity-cli/releases/",
  machines : {
    "darwin-aarch64": "agy_cli_mac_arm64.tar.gz",
    "darwin-x86_64" : "agy_cli_mac_x64.tar.gz",
    "linux-aarch64" : "agy_cli_linux_arm64.tar.gz",
    "linux-x86_64"  : "agy_cli_linux_x64.tar.gz",
  },
  cmd      : "antigravity",
  args     : ["acp"],
  load     : async () => (await import("./Agy.ts")).Agy,
  out      : path.join(import.meta.dir, "Pinned.ts"),
  heading  : `// Pinned
// ======
// The build of Google's Antigravity CLI this illi runs (its \`acp\`), for
// each machine (Cli.ts cli_machine): the version tried with this illi
// (Live.test.ts), taken from the CLI's releases on GitHub. Written by
// pin.ts, not by hand: a new version is taken as docs/development.md says.
`,
}, process.argv[2]?.trim());
