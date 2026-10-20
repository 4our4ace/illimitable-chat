// Attach
// ======
// Images attached to a message: a path typed (/image), pasted or dropped
// (a Windows one under WSL too), or the clipboard's image (Alt+V), each a
// token in the input, sent with the message that names it.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { term_draw } from "./Frame.ts";
import { term_note } from "./Notices.ts";
import * as Screen from "../ui/Screen.ts";
import type { Term } from "./Term.ts";
import * as View from "../ui/View.ts";

// the largest image file attached (bytes)
const LARGEST = 20 * 2 ** 20;

// the clipboard's image under WSL, as base64 PNG (none: nothing); the
// longest a read of the clipboard may take (ms)
const CLIP_WIN  = "Add-Type -AssemblyName System.Windows.Forms, System.Drawing; $i = [Windows.Forms.Clipboard]::GetImage(); if ($i) { $m = New-Object IO.MemoryStream; $i.Save($m, [Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($m.ToArray()) }";
const CLIP_WAIT = 10000;

// attaches the image at a path: its token in the input; a file of
// another kind is refused here
export function term_image(t: Term, arg: string): void {
  const file = term_file(arg);
  if (file === null) {
    term_note(t, "No file " + arg + ".");
  } else if (!term_attach(t, file)) {
    term_note(t, "Not attached: " + arg + " is no image (or over " + LARGEST / 2 ** 20 + " MB). " + View.IMAGES);
  }
}

// a paste: a path to an image (a file dropped) attaches it; else it goes
// in the input, a long one as its token
export function term_paste(t: Term, text: string): void {
  const file = text.includes("\n") ? null : term_file(text.trim());
  if (file === null || !term_attach(t, file)) {
    Screen.ed_paste(t.scr.ed, text);
  }
}

// a path as typed, dropped or pasted to the file; null: no file there
export function term_file(arg: string): string | null {
  const file = term_path(arg);
  return file !== "" && fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

// a path as typed, dropped or pasted (quoted, its spaces escaped, ~, a
// Windows one under WSL's /mnt), whole ("": none)
export function term_path(arg: string): string {
  const bare = arg.replace(/^(['"])(.*)\1$/, "$2");
  const win  = /^([A-Za-z]):\\/.exec(bare);
  const file = win !== null ? "/mnt/" + win[1].toLowerCase() + "/" + bare.slice(3).replace(/\\/g, "/") : bare.replace(/\\(.)/g, "$1").replace(/^~(?=\/|$)/, os.homedir());
  return file === "" ? "" : path.resolve(file);
}

// a path as the head shows it: ~ for the home folder
export function term_home(file: string): string {
  return file.startsWith(os.homedir()) ? "~" + file.slice(os.homedir().length) : file;
}

// the image in a file attached, its bytes as read now (a Bun file inside
// a Blob adds nothing to it, Bun 1.3.14: the server got the text alone
// and refused the message); false: no image, or too big
function term_attach(t: Term, file: string): boolean {
  const bytes = fs.statSync(file).size <= LARGEST ? fs.readFileSync(file) : null;
  if (bytes === null || View.image_kind(bytes) === null) {
    return false;
  }
  t.imgs.set(Screen.ed_image(t.scr.ed), new Blob([bytes]));
  return true;
}

// Alt+V or Ctrl+V: the clipboard's image attached; none, a note says so
export async function term_clip(t: Term): Promise<void> {
  const bytes = await term_clipboard();
  if (bytes === null || View.image_kind(bytes) === null) {
    term_note(t, "No image in the clipboard. Text pastes as your terminal does (Ctrl+Shift+V, Ctrl+V, a right click).");
    return;
  }
  t.imgs.set(Screen.ed_image(t.scr.ed), new Blob([bytes]));
  term_draw(t);
}

// the clipboard's image, as PNG: Windows' under WSL (PowerShell, as
// base64), Wayland's, X's, macOS' (as hex); null: none, or no way to it
async function term_clipboard(): Promise<Uint8Array<ArrayBuffer> | null> {
  const wsl = process.platform === "linux" && /microsoft/i.test(os.release());
  const mac = process.platform === "darwin";
  const run = wsl ? ["powershell.exe", "-NoProfile", "-STA", "-Command", CLIP_WIN]
    : mac ? ["osascript", "-e", "the clipboard as «class PNGf»"]
    : process.env.WAYLAND_DISPLAY ? ["wl-paste", "--no-newline", "--type", "image/png"]
    : ["xclip", "-selection", "clipboard", "-t", "image/png", "-o"];
  try {
    const proc = Bun.spawn(run, { stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout: CLIP_WAIT });
    const out  = Buffer.from(await new Response(proc.stdout).arrayBuffer());
    if ((await proc.exited) !== 0 || out.length === 0) {
      return null;
    }
    const hex = mac ? /«data PNGf([0-9A-Fa-f]+)»/.exec(out.toString())?.[1] : undefined;
    return wsl ? Buffer.from(out.toString().trim(), "base64") : mac ? (hex === undefined ? null : Buffer.from(hex, "hex")) : new Uint8Array(out);
  } catch {
    return null;
  }
}
