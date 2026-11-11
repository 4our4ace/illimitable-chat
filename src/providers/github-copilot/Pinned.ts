// Pinned
// ======
// The build of GitHub's Copilot CLI this illi runs, for each machine
// (Cli.ts cli_machine): the version tried with this illi (Live.test.ts),
// taken from the CLI's releases on GitHub. Written by pin.ts, not by
// hand: a new version is taken as docs/development.md says.

import type { Build } from "../Cli.ts";

export const PINNED: Record<string, Build> = {
  "darwin-aarch64": { version: "1.0.109", archive: "https://github.com/github/copilot-cli/releases/download/v1.0.109/copilot-darwin-arm64.tar.gz", sha256: "9c21ad663ce98f500c1f0b62e0a6d687bc1b1661e59f4c2161cc114515a01942", bytes: 136101107, unpacked: 198749024, cmd: "copilot", args: [] },
  "darwin-x86_64": { version: "1.0.109", archive: "https://github.com/github/copilot-cli/releases/download/v1.0.109/copilot-darwin-x64.tar.gz", sha256: "ce73d75d599718a7ade68a3b78d2ba84cc1c2a77e01cc4483b03579ff592199d", bytes: 148042801, unpacked: 212310864, cmd: "copilot", args: [] },
  "linux-aarch64": { version: "1.0.109", archive: "https://github.com/github/copilot-cli/releases/download/v1.0.109/copilot-linux-arm64.tar.gz", sha256: "679db06c3168457d8154cd8ce93b822f7c46d3169e61da4c0b78ac6e110c4af6", bytes: 147553377, unpacked: 212077312, cmd: "copilot", args: [] },
  "linux-x86_64": { version: "1.0.109", archive: "https://github.com/github/copilot-cli/releases/download/v1.0.109/copilot-linux-x64.tar.gz", sha256: "45a7f37e822e8c8725eda6b27deaed55dad2688ff4163ed27ec22e23293cb761", bytes: 143895052, unpacked: 213257024, cmd: "copilot", args: [] },
};
