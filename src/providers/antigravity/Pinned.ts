// Pinned
// ======
// The build of Google's Antigravity CLI this illi runs (its `acp`), for
// each machine (Cli.ts cli_machine): the version tried with this illi
// (Live.test.ts), taken from the CLI's releases on GitHub. Written by
// pin.ts, not by hand: a new version is taken as docs/development.md says.

import type { Build } from "../Cli.ts";

export const PINNED: Record<string, Build> = {
  "darwin-aarch64": { version: "1.5.5", archive: "https://github.com/google-antigravity/antigravity-cli/releases/download/1.5.5/agy_cli_mac_arm64.tar.gz", sha256: "e079f5ba69d548443031d4d9a66a998fe2781c6ee9380a9bc6e9565ba7d093b7", bytes: 65509958, unpacked: 209824176, cmd: "antigravity", args: ["acp"] },
  "darwin-x86_64": { version: "1.5.5", archive: "https://github.com/google-antigravity/antigravity-cli/releases/download/1.5.5/agy_cli_mac_x64.tar.gz", sha256: "8c42c5ce94d74ad2551ebc2d5500e6cd6a0443f65f8501dac5f419937ad33021", bytes: 71220827, unpacked: 218859568, cmd: "antigravity", args: ["acp"] },
  "linux-aarch64": { version: "1.5.5", archive: "https://github.com/google-antigravity/antigravity-cli/releases/download/1.5.5/agy_cli_linux_arm64.tar.gz", sha256: "f6faff7b47ad2d9a60ebca9d774239a1cd23e53a8ca6d812c1e9583909dca655", bytes: 70187550, unpacked: 236540280, cmd: "antigravity", args: ["acp"] },
  "linux-x86_64": { version: "1.5.5", archive: "https://github.com/google-antigravity/antigravity-cli/releases/download/1.5.5/agy_cli_linux_x64.tar.gz", sha256: "bfe2c25edeadd98c2942417c9972ee0e1faa3f0afdc90711e84d5f3a633b5078", bytes: 74057768, unpacked: 247853456, cmd: "antigravity", args: ["acp"] },
};
