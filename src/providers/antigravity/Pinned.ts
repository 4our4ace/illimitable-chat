// Pinned
// ======
// The build of Google's Antigravity CLI this illi runs (its `acp`), for
// each machine (Cli.ts cli_machine): the version tried with this illi
// (Live.test.ts), taken from the CLI's releases on GitHub. Written by
// pin.ts, not by hand: a new version is taken as docs/development.md says.

import type { Build } from "../Cli.ts";

export const PINNED: Record<string, Build> = {
  "darwin-aarch64": { version: "1.5.9", archive: "https://github.com/google-antigravity/antigravity-cli/releases/download/1.5.9/agy_cli_mac_arm64.tar.gz", sha256: "51fb8eb7e18c53d4665f0043b761f04f4d0d4b2eb046bac6c2dcbe32473b5b2e", bytes: 84294030, unpacked: 223424816, cmd: "antigravity", args: ["acp"] },
  "darwin-x86_64": { version: "1.5.9", archive: "https://github.com/google-antigravity/antigravity-cli/releases/download/1.5.9/agy_cli_mac_x64.tar.gz", sha256: "d0fb8e28c233fadbe612fa273d06b6c189932a33f1c16f0d2c1cb6732123d6c3", bytes: 89732341, unpacked: 232212288, cmd: "antigravity", args: ["acp"] },
  "linux-aarch64": { version: "1.5.9", archive: "https://github.com/google-antigravity/antigravity-cli/releases/download/1.5.9/agy_cli_linux_arm64.tar.gz", sha256: "3a18c238c7ee6661e43df7e824a7d4c1bed78aeeda09430921a0f1dbfe825bca", bytes: 90318517, unpacked: 249582256, cmd: "antigravity", args: ["acp"] },
  "linux-x86_64": { version: "1.5.9", archive: "https://github.com/google-antigravity/antigravity-cli/releases/download/1.5.9/agy_cli_linux_x64.tar.gz", sha256: "8b1f5e56779f2434a0af36f1b715a8392a084de550f8c68bc79821f95fabf3fa", bytes: 99166075, unpacked: 265700040, cmd: "antigravity", args: ["acp"] },
};
