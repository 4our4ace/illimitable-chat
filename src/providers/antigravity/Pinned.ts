// Pinned
// ======
// The build of Google's agent (antigravity-acp) this illi runs, for each
// machine as the ACP registry names it (Agy.machine): the version tried
// with this illi (Live.test.ts). Written by pin.ts, not by hand: a new
// version is taken as docs/development.md says.

import type { Build } from "./Agy.ts";

export const PINNED: Record<string, Build> = {
  "darwin-aarch64": { version: "1.4.5", archive: "https://dl.google.com/agy-extensions/releases/macos/agy-acp-server-1.4.5-darwin-arm64.zip", sha256: "886fff7767d08994ca39eb02c3d01a7532c7325a94aa33aaf52d52068733284f", bytes: 97923855, unpacked: 301873856, cmd: "agy_acp_server.par", args: [] },
  "darwin-x86_64": { version: "1.4.5", archive: "https://dl.google.com/agy-extensions/releases/macos/agy-acp-server-1.4.5-darwin-x86_64.zip", sha256: "b39f3573c03b9acb9df028853f647527f1f3133f32bd77e78b796e48a205114a", bytes: 103577295, unpacked: 310739808, cmd: "agy_acp_server.par", args: [] },
  "linux-aarch64": { version: "1.4.5", archive: "https://dl.google.com/agy-extensions/releases/linux/agy-acp-server-1.4.5-linux-arm64.zip", sha256: "7d64246633ae094f67e3bbcd2d679e89048f91346d5339313336e7483f40f056", bytes: 307829008, unpacked: 958706857, cmd: "agy_acp_server.par", args: ["--uid="] },
  "linux-x86_64": { version: "1.4.5", archive: "https://dl.google.com/agy-extensions/releases/linux/agy-acp-server-1.4.5-linux-x86_64.zip", sha256: "923923a0d7dc8073f66cc6f78647a3107e3a7ee2b7e1a24df8b3927b5188013b", bytes: 321783181, unpacked: 960152902, cmd: "agy_acp_server.par", args: ["--uid="] },
  "windows-aarch64": { version: "1.4.5", archive: "https://dl.google.com/agy-extensions/releases/windows/agy-acp-server-1.4.5-windows-arm64.zip", sha256: "ab0a9aac8349e08ef289be6d16da8f89e3abe60eba5158032ef78c4a1220261c", bytes: 102703121, unpacked: 201615496, cmd: "agy_acp_server.exe", args: [] },
  "windows-x86_64": { version: "1.4.5", archive: "https://dl.google.com/agy-extensions/releases/windows/agy-acp-server-1.4.5-windows-x86_64.zip", sha256: "d24f4c73c9f96d4f44384e281c855a56c72d8eaa9c5b0fad7ccb1635c6b63f50", bytes: 100423655, unpacked: 203683600, cmd: "agy_acp_server.exe", args: [] },
};
