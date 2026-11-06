// Pinned
// ======
// The build of Google's Antigravity CLI this illi runs (its `acp`), for
// each machine (Agy.machine): the version tried with this illi
// (Live.test.ts), taken from the CLI's releases on GitHub. Written by
// pin.ts, not by hand: a new version is taken as docs/development.md says.

import type { Build } from "./Agy.ts";

export const PINNED: Record<string, Build> = {
  "darwin-aarch64": { version: "1.5.2", archive: "https://github.com/google-antigravity/antigravity-cli/releases/download/1.5.2/agy_cli_mac_arm64.tar.gz", sha256: "c3f56b381c4755cdd02e5de67373c24788b2a2aeade156756b4419b67253bd0c", bytes: 64486606, unpacked: 206461088, cmd: "antigravity", args: ["acp"] },
  "darwin-x86_64": { version: "1.5.2", archive: "https://github.com/google-antigravity/antigravity-cli/releases/download/1.5.2/agy_cli_mac_x64.tar.gz", sha256: "fe99ebacc6bd46b4bf2d85c718420b28b699210cf7c2e3055242e2dad7a1beb3", bytes: 70102814, unpacked: 215321248, cmd: "antigravity", args: ["acp"] },
  "linux-aarch64": { version: "1.5.2", archive: "https://github.com/google-antigravity/antigravity-cli/releases/download/1.5.2/agy_cli_linux_arm64.tar.gz", sha256: "cd155ecd9bc962037423e6826ed0b61d3b16d84d350cdc9a8c14478f24f5f235", bytes: 69123808, unpacked: 232870264, cmd: "antigravity", args: ["acp"] },
  "linux-x86_64": { version: "1.5.2", archive: "https://github.com/google-antigravity/antigravity-cli/releases/download/1.5.2/agy_cli_linux_x64.tar.gz", sha256: "da696a8dc6122a63d5ffbdd21b02c8a62d5361fba0ed7d3bc2d2619889e62711", bytes: 72934660, unpacked: 244044176, cmd: "antigravity", args: ["acp"] },
};
