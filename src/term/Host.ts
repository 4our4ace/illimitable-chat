// Host
// ====
// What illi runs on, as the terminal's own parts need it: WSL with
// Windows' programs in reach, whose clipboard and browser are then the
// user's (Attach.ts, Browser.ts).

import * as fs from "node:fs";

// WSL's interop as the kernel registers it (WSL 2 may register the
// -late one), its first line saying whether it is on
const INTEROP = ["/proc/sys/fs/binfmt_misc/WSLInterop", "/proc/sys/fs/binfmt_misc/WSLInterop-late"];

// host_wsl's answer, once read
let wsl: boolean | undefined;

// whether illi runs in WSL with Windows' programs runnable (read once):
// its interop registered and on. WSL with it off is plain Linux to illi;
// a container on WSL's kernel (no binfmt_misc of its own) is not WSL
export function host_wsl(): boolean {
  wsl ??= process.platform === "linux" && INTEROP.some((file) => host_enabled(file));
  return wsl;
}

// whether an interop file says it is on (none: no)
function host_enabled(file: string): boolean {
  try {
    return fs.readFileSync(file, "utf8").startsWith("enabled");
  } catch {
    return false;
  }
}
