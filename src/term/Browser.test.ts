// Browser test
// ============
// `bun test Browser.test.ts`. Which programs may open a link, in turn:
// $BROWSER's entries found (one found whole even with spaces, else its
// words, quotes holding one together; the link for %s, else last; a
// console browser left out; `none`: nothing at all), even over SSH; then
// the system's but over SSH: WSL's Windows handler, macOS' open, xdg-open
// only on a display (on WSL too, after Windows'); never a link that isn't
// http(s), and the link normalized. A program run for real (never a
// browser: the preload sets BROWSER none, and SSH_TTY keeps the system's
// out): its arguments as given, from its own folder, in a session of its
// own, its output dropped; a failure, a kill, one not found said in plain words; one
// still running taken as opened; the next tried after one that fails.
// /login's notice: true whether the browser opens or not, and put right
// in place when it didn't.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-browser-");
process.env.ILLI_DIR = DIR + "/illi";

const { browser_commands, browser_open, browser_run } = await import("./Browser.ts");
const { term_commands } = await import("./Commands.ts");
const { ChatGPT } = await import("../ai/ChatGPT.ts");
const Screen = await import("../ui/Screen.ts");
const View = await import("../ui/View.ts");

const URL = "https://auth.openai.com/codex/device";

afterAll(() => {
  process.env.BROWSER = "none";
  delete process.env.SSH_TTY;
  fs.rmSync(DIR, { recursive: true, force: true });
});

// the commands chosen, with only the programs named found
const pick = (env: Record<string, string>, platform: string, wsl: boolean, found: string[], url = URL) => browser_commands(url, env, platform, wsl, (p: string) => (found.includes(p) ? "/bin/" + p : null));

// a script of DIR's, executable: its path
const script = (name: string, body: string) => {
  fs.writeFileSync(DIR + "/" + name, "#!/bin/sh\n" + body + "\n", { mode: 0o755 });
  return DIR + "/" + name;
};

test("$BROWSER's entries found come first, in turn (one found whole, spaces and all; quotes hold one together; the link for %s, else last), even over SSH; a console browser never; none: nothing at all", () => {
  const ff = "/mnt/c/Program Files/Mozilla Firefox/firefox.exe";
  expect(pick({ BROWSER: "nope:firefox --new-tab" }, "linux", false, ["firefox"])).toEqual([["firefox", "--new-tab", URL]]);
  expect(pick({ BROWSER: ff }, "linux", true, [ff, "rundll32.exe"])).toEqual([[ff, URL], ["rundll32.exe", "url.dll,FileProtocolHandler", URL]]);
  expect(pick({ BROWSER: "'/opt/my browser/run' --app=%s --x" }, "linux", false, ["/opt/my browser/run"])).toEqual([["/opt/my browser/run", "--app=" + URL, "--x"]]);
  expect(pick({ BROWSER: "w3m:lynx:chromium", SSH_TTY: "/dev/pts/1" }, "linux", false, ["w3m", "lynx", "chromium", "xdg-open"])).toEqual([["chromium", URL]]);
  expect(pick({ BROWSER: "None" }, "darwin", false, ["open"])).toEqual([]);
});

test("the system's after them: WSL's Windows handler, then xdg-open on a display (WSLg's too), macOS' open; none over SSH or without a display", () => {
  expect(pick({ DISPLAY: ":0" }, "linux", true, ["rundll32.exe", "xdg-open", "wslview"])).toEqual([["rundll32.exe", "url.dll,FileProtocolHandler", URL], ["xdg-open", URL]]);
  expect(pick({ DISPLAY: ":0" }, "linux", true, ["xdg-open"])).toEqual([["xdg-open", URL]]);
  expect(pick({}, "linux", true, [])).toEqual([]);
  expect(pick({}, "darwin", false, ["open"])).toEqual([["open", URL]]);
  expect(pick({ WAYLAND_DISPLAY: "wayland-0" }, "linux", false, ["xdg-open"])).toEqual([["xdg-open", URL]]);
  expect(pick({ DISPLAY: ":0" }, "linux", false, ["xdg-open", "rundll32.exe"])).toEqual([["xdg-open", URL]]);
  expect(pick({}, "linux", false, ["xdg-open"])).toEqual([]);
  expect(pick({ SSH_CONNECTION: "10.0.0.2 50000 10.0.0.1 22" }, "darwin", false, ["open"])).toEqual([]);
  expect(pick({ SSH_CLIENT: "10.0.0.2 50000 22" }, "linux", true, ["rundll32.exe"])).toEqual([]);
});

test("only an http(s) link is opened, normalized: anything that could read as more than a link percent-encoded", () => {
  for (const url of ["file:///etc/passwd", "javascript:alert(1)", "-a https://a.b", "not a link"]) {
    expect([url, pick({}, "darwin", false, ["open"], url)]).toEqual([url, []]);
  }
  expect(pick({}, "darwin", false, ["open"], "HTTPS://A.b/x y\"$`‮\x1bz")).toEqual([["open", "https://a.b/x%20y%22$%60%E2%80%AE%1Bz"]]);
});

test("a program run for real: its arguments as given, from its own folder, in a session of its own, its output dropped; a failure, a kill and one not found said plainly; one still running, opened", async () => {
  const log = DIR + "/log";
  const ok  = script("ok", 'printf "%s\\n" "$@" "$(pwd)" "$(ps -o sid= -p $$ | tr -d " ")" "$$" > ' + log + "; head -c 1000000 /dev/zero; head -c 1000000 /dev/zero >&2");
  expect(await browser_run([ok, "--flag", URL])).toBe("");
  const [flag, url, cwd, sid, pid] = fs.readFileSync(log, "utf8").trim().split("\n");
  expect([flag, url, cwd, sid]).toEqual(["--flag", URL, DIR, pid]);
  expect(await browser_run([script("bad", "exit 3")])).toBe("bad exited 3");
  expect(await browser_run([script("shot", "kill -9 $$")])).toBe("shot was killed");
  expect(await browser_run([DIR + "/missing"])).toBe("missing couldn't start");
  expect(await browser_run([script("slow", "sleep 2")], 50)).toBe("");
});

test("browser_open tries each in turn till one opens it, saying why none did; none to try: null", async () => {
  process.env.SSH_TTY = "/dev/pts/9";
  const log = DIR + "/second";
  process.env.BROWSER = script("first", "exit 1") + ":" + script("second", "echo \"$1\" > " + log);
  expect(await browser_open(URL)).toBe("");
  expect(fs.readFileSync(log, "utf8")).toBe(URL + "\n");
  process.env.BROWSER = script("one", "exit 1") + ":" + script("two", "exit 2");
  expect(await browser_open(URL)).toBe("one exited 1; two exited 2");
  process.env.BROWSER = "none";
  expect(browser_open(URL)).toBeNull();
});

test("/login's notice: the link and code either way, 'opening in your browser' while it tries; a browser that fails puts it right in place", async () => {
  process.env.SSH_TTY = "/dev/pts/9";
  process.env.BROWSER = script("broken", "sleep 0.2; exit 5");
  const device = ChatGPT.device;
  let grant = () => {};
  ChatGPT.device = async () => ({ url: URL, code: "ABCD-1234", done: new Promise<void>((done) => (grant = done)) });
  const t: any = { v: View.view_new(), scr: { tty: true, ed: Screen.ed_new() }, choose: null, pane: null, notices: [], due: true, ver: 0, login: null };
  const write = process.stdout.write;
  process.stdout.write = (() => true) as any;
  try {
    const login = term_commands().find(([use]) => use === "/login")![3](t, "") as Promise<void>;
    await Bun.sleep(20);
    expect(t.notices.map((n: any) => n.text)).toEqual(["Sign in to ChatGPT at " + URL + " (opening in your browser) with the code ABCD-1234 (copied; it is good for 15 minutes). illi waits for it."]);
    for (let k = 0; k < 100 && !t.notices[0].text.includes("didn't"); k++) {
      await Bun.sleep(20);
    }
    expect(t.notices.map((n: any) => n.text)).toEqual(["Sign in to ChatGPT: your browser didn't open (broken exited 5), so open " + URL + " and enter the code ABCD-1234 (copied; it is good for 15 minutes). illi waits for it."]);
    expect(t.notices[0].until).toBeGreaterThan(Date.now() + 14 * 60000);
    grant();
    await login;
  } finally {
    process.stdout.write = write;
    ChatGPT.device = device;
  }
  expect(t.notices.map((n: any) => n.text).join("\n")).toMatch(/^Signed in to ChatGPT\./);
});
