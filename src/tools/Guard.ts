// Guard
// =====
// Whether a tool call may run before it does: run, asked about (the user
// says yes or no, told why), or refused. Deterministic: the call is read
// (a shell command by Shell.ts, as bash reads it), its risks found as
// flags, and the mode decides what is left:
//
//   read-only  reads run; changes are refused; flags are asked
//   ask        reads run; changes and flags are asked
//   auto       reads and changes run; flags are asked
//   yolo       all runs
//
// Before the mode, the user's rules (Rules: allow, ask or deny, by
// pattern): deny refuses, even in yolo; ask asks every time, even in
// yolo, with no "don't ask again"; allow runs, over every flag. Grants
// ("don't ask again" answers, kept by the caller) clear flags: an exact
// one (kind=subject) any flag of that very call, a pattern (kind:pattern)
// only flags that offer one (a family of commands, a folder, an MCP
// tool); danger, secrets and protected files clear only exactly.
//
// Flags: the danger list (root, deleting trees, wiping disks, losing git
// work, sending data off, connecting out, publishing, changing the
// system or infrastructure, assignments that change what runs, code
// piped into a shell); paths (outside the project, secrets anywhere,
// protected files inside, devices and network sockets); what is known
// only as the command runs (a variable, a command's output, a folder
// after a cd to one, a glob as a command's name); a program or script
// from outside the project; what Shell.ts can't read. Whatever the checks
// can't be sure of is asked, never run silently.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as config from "../config/Config.ts";
import { Shell, type Part, type Word } from "./Shell.ts";

// Types
// =====

export type Mode = "read-only" | "ask" | "auto" | "yolo";
export const MODES: Mode[] = ["read-only", "ask", "auto", "yolo"];

export type Rule = "allow" | "ask" | "deny";

// what a rule or grant is about: shell commands, files read, files
// written, MCP tools
export type Kind = "shell" | "read" | "write" | "mcp";

// the user's rules: by kind, a pattern's rule (* matches anything, \*
// a star; a shell pattern ending in " *" also matches the bare command;
// a path's ~ is home, a relative one is from the project's top)
export type Rules = Partial<Record<Kind, Record<string, Rule>>>;

// an MCP tool's annotations, as its server gives them
export type Hints = { read: boolean; destructive: boolean };

// where a call is judged: the mode, the working dir, the project's top,
// the user's rules, the grants (kind=subject, kind:pattern), the folders
// read freely besides (illi's skills')
export type Where = { mode: Mode; cwd: string; top: string; rules: Rules; grants: Set<string>; reads: string[] };

// a verdict: run; ask (why; the grants a "don't ask again" keeps, none
// for the user's own ask rules; the exact grants that clear it); refuse
// (why; by the user's rule, which nothing here clears; by the mode, which
// its exact grants clear)
export type Verdict =
  | { $: "allow" }
  | { $: "ask"; why: string; always: string[]; exact: string[] }
  | { $: "deny"; why: string; rule: boolean; exact: string[] };

// a reason to ask: why; what an exact grant names (kind=subject); what a
// pattern grant may clear it for (its kind and subject, the pattern a
// "don't ask again" offers), if any; whether it is the user's own ask
// rule (never cleared)
type Flag = { why: string; kind: Kind; subject: string; wide: { kind: Kind; subject: string; grant: string } | null; rule?: boolean };

// what a call was found to do: refused by the user's rules (why), its
// flags, and its changes (flags only the modes read-only and ask act on)
type Look = { denied: string[]; flags: Flag[]; changes: Flag[] };

// a file a part reads or writes, as a word, in its folder
type Use = { word: Word; write: boolean; cwd: string | null };

// Constants
// =========

const HOME = Projects_real(process.env.HOME ?? os.homedir());

// the programs that only read (their files still checked)
const READS = new Set([
  "ls", "cat", "head", "tail", "grep", "egrep", "fgrep", "rg", "ag", "ack", "wc", "file", "stat", "du", "df", "tree",
  "diff", "cmp", "comm", "cut", "nl", "column", "jq", "realpath", "readlink", "md5sum", "sha1sum", "sha224sum",
  "sha256sum", "sha384sum", "sha512sum", "b2sum", "cksum", "sum", "od", "hexdump", "strings", "less", "more", "fold",
  "fmt", "rev", "tac", "paste", "join", "expand", "unexpand", "look", "lsof", "lsblk", "lscpu", "bat", "batcat",
  "zcat", "zless", "zgrep", "bzcat", "xzcat", "man", "info", "uniq", "tr",
]);

// the programs and builtins whose words aren't files
const WORDS = new Set([
  "echo", "printf", "sleep", "seq", "true", "false", ":", "date", "whoami", "id", "uname", "hostname", "nproc", "export",
  "declare", "typeset", "local", "readonly", "unset", "read", "set", "shopt", "exit", "return", "break", "continue",
  "shift", "wait", "jobs", "cd", "pushd", "popd", "dirs", "let", "type", "which", "whereis", "command", "hash", "help",
  "printenv", "env", "getconf", "locale", "arch", "tty", "pgrep", "ps", "uptime", "free", "groups", "test", "[", "[[",
  "((", "basename", "dirname", "expr", "tput", "clear", "umask", "pwd", "alias", "unalias", "trap", "times", "yes",
]);

// the programs whose files are written (all their words, or, for those
// copying, the last: the rest are read)
const WRITERS = new Set([
  "rm", "rmdir", "unlink", "shred", "truncate", "touch", "mkdir", "tee", "chmod", "chown", "chgrp", "mv", "tar", "unzip",
  "zip", "gzip", "gunzip", "bzip2", "bunzip2", "xz", "unxz", "7z", "patch", "split", "csplit", "mkfifo", "mknod", "link",
  "rename", "chattr", "setfacl", "ar", "cpio",
]);
const COPIERS = new Set(["cp", "ln", "install", "rsync", "scp"]);

// the shells, and the interpreters, that run a script or code given them
const SHELLS = new Set(["sh", "bash", "dash", "zsh", "ksh", "ash", "mksh", "fish", "csh", "tcsh", "nu", "pwsh", "xonsh"]);
const INTERPS = /^(python[\d.]*|pypy[\d.]*|node|nodejs|bun|deno|perl|ruby|php|lua|luajit|Rscript|osascript|tclsh|wish|groovy|julia|elixir|erl|ts-node|tsx)$/;

// an interpreter's options giving its code inline
const INLINE = new Set(["-c", "-e", "-E", "--eval", "-p", "--print", "-r", "--exec", "eval"]);

// inline code (python -c, node -e, a heredoc into an interpreter) that
// names what can run a program, change files or reach the network: asked
const RISKY = /\b(system|popen|spawn\w*|exec\w*|eval|subprocess|child_process|shutil|rmtree|unlink\w*|remove|rmdir|rename\w*|chmod|chown|kill|socket|urllib|requests|httpx?|fetch|curl|wget|writeFile\w*|appendFile\w*|write_text|write_bytes|__import__|getattr|importlib|compile|ctypes|Deno\.\w+|Bun\.(spawn\w*|write|file|\$)|fs\.\w+|os\.\w+|open\s*\([^)]*['"][wax+])/;

// the folders inside a project rebuilt by its tools: deleted whole freely
const REBUILT = new Set([
  "node_modules", "dist", "build", "out", "target", "coverage", ".next", ".nuxt", ".svelte-kit", ".turbo", ".cache",
  ".parcel-cache", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox", ".venv", "venv", ".gradle",
  ".dart_tool", ".expo", ".angular", ".output", ".vercel", "tmp", ".tmp",
]);

// outside the project: where anything may be written (scratch), and read
// besides (the system's folders); in /dev only these files
const SCRATCH = [...new Set(["/tmp", "/var/tmp", Projects_real(os.tmpdir()), Projects_real(process.env.TMPDIR ?? "/tmp")])];
const DEVS = /^\/dev\/(null|zero|stdin|stdout|stderr|tty|u?random|fd\/\d+)$|^\/proc\/self\/fd\/\d+$/;
const NET = /^\/dev\/(tcp|udp)\//;
const SYSTEM = ["/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64", "/libx32", "/opt", "/etc", "/proc", "/sys", "/nix", "/snap", "/System", "/Library", "/Applications", "/private/etc"];

// secrets: files by name anywhere, folders and files under home, files
// of the system
const SECRET_NAME = /^(\.env(\.(?!(example|sample|template|dist)$)[^/]+)?|\.netrc|\.pgpass|\.git-credentials|\.npmrc|\.pypirc|\.vault-token|id_(rsa|dsa|ecdsa|ed25519)(_sk)?|.+\.(pem|key|p12|pfx|keystore|jks|kdbx))$/;
const SECRET_HOME = [
  ".ssh", ".aws", ".gnupg", ".kube", ".docker", ".azure", ".config/gh", ".config/gcloud", ".config/hub", ".config/op",
  ".config/sops", ".local/share/opencode", ".codex", ".claude", ".claude.json", ".password-store", ".cargo/credentials",
  ".cargo/credentials.toml", ".terraform.d", ".gem/credentials", ".mozilla", ".thunderbird", ".config/google-chrome",
  ".config/chromium", ".config/BraveSoftware", "Library/Keychains", "Library/Application Support/Google/Chrome",
];
const SECRET_SYSTEM = ["/etc/shadow", "/etc/gshadow", "/etc/sudoers", "/etc/sudoers.d", "/etc/ssh"];

// protected inside the project (asked before a write): folders and
// files that configure tools that run code, or what illi reads
const PROTECTED_DIRS = new Set([".git", ".illi", ".claude", ".vscode", ".idea", ".husky", ".devcontainer", ".cargo", ".mvn", ".yarn"]);
const PROTECTED_FILES = new Set([
  ".gitmodules", ".gitconfig", ".envrc", ".npmrc", ".yarnrc", ".yarnrc.yml", "bunfig.toml", ".pre-commit-config.yaml",
  "lefthook.yml", ".lefthook.yml", ".mcp.json", ".claude.json", ".bashrc", ".bash_profile", ".bash_login", ".zshrc",
  ".zprofile", ".zshenv", ".zlogin", ".profile", ".inputrc",
]);
const PROTECTED_DEEP = [".config/git", ".config/fish", ".local/bin", "bin"];

// the assignments that change what runs (5.2), and the values of the
// pager and editor ones that are harmless
const RUNS = /^(PATH|IFS|CDPATH|ENV|BASH_ENV|SHELLOPTS|BASHOPTS|GLOBIGNORE|BASH_XTRACEFD|PROMPT_COMMAND|PS4|LD_\w+|DYLD_\w+|GIT_SSH_COMMAND|GIT_SSH|GIT_EXTERNAL_DIFF|GIT_EDITOR|GIT_ASKPASS|GIT_EXEC_PATH|GIT_CONFIG\w*|SSH_ASKPASS|SUDO_ASKPASS|NODE_OPTIONS|PERL5OPT|PERL5LIB|RUBYOPT|PYTHONSTARTUP|PYTHONPATH|LESSOPEN|LESSCLOSE|EDITOR|VISUAL|PAGER|GIT_PAGER|MANPAGER|BROWSER)$/;
const QUIET = new Set(["", "cat", "less", "less -R", "less -FRX", "more", "true", "head"]);

// git's subcommands that only read, and the config keys that run programs
const GIT_READ = new Set([
  "status", "log", "diff", "show", "blame", "annotate", "shortlog", "describe", "rev-parse", "rev-list", "ls-files",
  "ls-tree", "ls-remote", "cat-file", "grep", "show-ref", "for-each-ref", "merge-base", "name-rev", "count-objects",
  "check-ignore", "check-attr", "check-ref-format", "var", "help", "version", "whatchanged", "range-diff", "diff-tree",
  "diff-files", "diff-index", "cherry", "verify-commit", "verify-tag", "fsck", "show-branch", "get-tar-commit-id",
]);
const GIT_RUNS = /^(core\.(pager|editor|sshcommand|fsmonitor|hookspath|askpass|gitproxy|worktree)|alias\.|include\.|includeif\.|diff\.external|sequence\.editor|uploadpack\.|receivepack\.|protocol\.|url\.|http\..*proxy|.*\.(textconv|command|cmd|helper|program|driver|process|clean|smudge))/i;

// Claude Code's tools that touch nothing on this computer, or only what
// was already allowed (a shell's output, stopping it): run (Guard.hosted)
const HOSTED = new Set(["WebFetch", "WebSearch", "Task", "Agent", "TodoWrite", "TodoRead", "TaskOutput", "BashOutput", "TaskStop", "KillShell", "KillBash"]);

// the programs a "don't ask again" covers by their first word after the
// program too (git push *, npm install *)
const SUBS = new Set([
  "git", "npm", "pnpm", "yarn", "bun", "npx", "bunx", "cargo", "go", "docker", "podman", "kubectl", "helm", "terraform",
  "tofu", "gh", "pip", "pip3", "uv", "poetry", "deno", "make", "just", "brew", "apt", "apt-get", "dnf", "yum", "pacman",
  "systemctl", "dotnet", "mvn", "gradle", "swift", "flutter", "rails", "rake", "composer", "mix", "nix", "gcloud", "aws",
  "az", "ssh", "python", "python3", "node",
]);

// Guard
// =====

export namespace Guard {

  // a tool call's verdict: shell, read, write, edit, an MCP tool (by its
  // hints); any other tool (illi's own) runs
  export function check(where: Where, tool: string, input: any, hints?: Hints): Verdict {
    const look: Look = { denied: [], flags: [], changes: [] };
    try {
      if (tool === "shell") {
        look_shell(where, look, String(input?.command ?? ""));
      } else if (tool === "read" || tool === "write") {
        look_file(where, look, input?.path, tool === "write");
      } else if (tool === "edit") {
        (Array.isArray(input?.edits) ? input.edits : []).forEach((e: any) => look_file(where, look, e?.path, true));
      } else if (tool.startsWith("mcp__")) {
        const h = hints ?? { read: false, destructive: false };
        look_tool(where, look, tool, h.read && !h.destructive ? null : h.destructive ? " may destroy data, its server says" : " isn't marked by its server as only reading");
      } else {
        return { $: "allow" };
      }
    } catch (err: any) {
      look.flags.push({ why: "illi's check of it failed (" + String(err?.message ?? err) + ")", kind: "shell", subject: JSON.stringify(input ?? {}), wide: null });
    }
    return verdict(where, look);
  }

  // one of Claude Code's tools (its permission prompt: Tools.approve), as
  // illi's would be judged: Bash a shell command; Read, LS, Grep and Glob
  // reads (a search of its folder: a glob's fixed head, as /etc/** looks
  // in /etc); Write, Edit, MultiEdit and NotebookEdit changes; an MCP tool
  // by its name (illi's own, mcp__illi__..., judged as it reaches illi);
  // those that touch nothing here run (HOSTED); any other is asked once
  export function hosted(where: Where, tool: string, input: any): Verdict {
    const dir = (p: unknown) => (typeof p === "string" && p !== "" ? p : where.cwd);
    switch (tool) {
      case "Bash"         : return Guard.check(where, "shell", { command: input?.command });
      case "Read"         : return Guard.check(where, "read", { path: dir(input?.file_path) });
      case "LS"           :
      case "Grep"         : return Guard.check(where, "read", { path: dir(input?.path) });
      case "Glob"         : return Guard.check(where, "read", { path: glob_root(path.resolve(where.cwd, dir(input?.path)), String(input?.pattern ?? "")) });
      case "Write"        :
      case "Edit"         :
      case "MultiEdit"    : return Guard.check(where, "write", { path: input?.file_path });
      case "NotebookEdit" : return Guard.check(where, "write", { path: input?.notebook_path });
    }
    if (HOSTED.has(tool) || tool.startsWith("mcp__illi__")) {
      return { $: "allow" };
    }
    if (tool.startsWith("mcp__")) {
      return Guard.check(where, tool, input);
    }
    const look: Look = { denied: [], flags: [], changes: [] };
    look_tool(where, look, tool, " is a Claude Code tool illi doesn't know");
    return verdict(where, look);
  }

  // a grant's words, as a question's "don't ask again" shows it
  export function said(grant: string, top: string): string {
    const m = /^(shell|read|write|mcp)([:=])(.*)$/s.exec(grant);
    if (m === null) {
      return grant;
    }
    const [, kind, how, what] = m;
    const folder = how === ":" && what.endsWith("/*") ? shown(what.slice(0, -2), top) : null;
    if (kind === "shell" || kind === "mcp") {
      return what;
    }
    if (folder !== null) {
      return (kind === "read" ? "reads in " : "changes in ") + (folder === "." ? "this project" : folder + "/");
    }
    return (kind === "read" ? "reading " : "changing ") + shown(what, top);
  }

  // whether a pattern matches a text: * anything, \* a star; a pattern
  // ending in " *" matches the text without its words too
  export function matches(pattern: string, text: string): boolean {
    const body = pattern.replace(/\\\*|\*|[.+?^${}()|[\]\\]/g, (c) => (c === "*" ? "[\\s\\S]*" : c === "\\*" ? "\\*" : "\\" + c));
    const re = pattern.endsWith(" *") && !pattern.endsWith("\\ *") ? body.slice(0, -" [\\s\\S]*".length) + "(?: [\\s\\S]*)?" : body;
    return new RegExp("^" + re + "$").test(text);
  }

  // a command as an exact grant names it: root marked, its assignments
  // and words unquoted, joined by spaces, quoted again where needed
  // (wrappers such as timeout left out: they don't change what runs)
  export function norm(part: Part): string {
    const word = (w: Word) => (w.dynamic || w.alts.length !== 1 ? w.raw : quote(w.alts[0]));
    const env = part.env.map((e) => e.name + "=" + word(e.value));
    return [...(part.root ? ["sudo"] : []), ...env, ...part.argv.map(word)].join(" ");
  }

}

// Verdicts
// ========

// what is left after the rules and grants, by the mode
function verdict(where: Where, look: Look): Verdict {
  if (look.denied.length > 0) {
    return { $: "deny", why: uniq(look.denied).join("; "), rule: true, exact: [] };
  }
  const rules = look.flags.filter((f) => f.rule === true);
  const flags = where.mode === "yolo" ? rules : look.flags.filter((f) => f.rule === true || !granted(where, f));
  const changes = where.mode === "read-only" || where.mode === "ask" ? look.changes.filter((f) => !granted(where, f)) : [];
  const exact = (fs: Flag[]) => uniq(fs.map((f) => f.kind + "=" + f.subject));
  if (where.mode === "read-only" && changes.length > 0) {
    return { $: "deny", why: "read-only mode: " + uniq(changes.map((f) => f.why)).join("; "), rule: false, exact: exact([...changes, ...flags]) };
  }
  const all = [...flags, ...changes];
  if (all.length === 0) {
    return { $: "allow" };
  }
  const always = rules.length > 0 ? [] : uniq(all.map((f) => f.wide?.grant ?? f.kind + "=" + f.subject));
  return { $: "ask", why: uniq(all.map((f) => f.why)).join("; "), always, exact: exact(all) };
}

// whether a grant clears a flag: an exact one of its very call, or a
// pattern over what it offers one for (a write grant covers reads too)
function granted(where: Where, f: Flag): boolean {
  if (where.grants.has(f.kind + "=" + f.subject)) {
    return true;
  }
  const wide = f.wide;
  if (wide === null) {
    return false;
  }
  const kinds = wide.kind === "read" ? ["read", "write"] : [wide.kind];
  return [...where.grants].some((g) => kinds.some((k) => (g === k + "=" + wide.subject) || (g.startsWith(k + ":") && Guard.matches(g.slice(k.length + 1), wide.subject))));
}

// the user's rule for a subject, of those of a kind: deny, then ask, then
// allow (null: none). Deny and ask match any of `any`; allow only `own`
// (a root command's own text names its sudo)
function rule_of(where: Where, kind: Kind, any: string[], own: string[]): Rule | null {
  const rules = Object.entries(where.rules[kind] ?? {}).map(([p, r]) => [kind === "read" || kind === "write" ? rule_path(p, where.top) : p, r] as const);
  const hit = (r: Rule, texts: string[]) => rules.some(([p, x]) => x === r && texts.some((t) => Guard.matches(p, t)));
  return hit("deny", any) ? "deny" : hit("ask", any) ? "ask" : hit("allow", own) ? "allow" : null;
}

// a path rule's pattern, absolute: ~ home, a relative one from the top
function rule_path(p: string, top: string): string {
  return p.startsWith("~/") || p === "~" ? HOME + p.slice(1) : p.startsWith("/") || p.startsWith("*") ? p : path.join(top, p);
}

// Shell
// =====

function look_shell(where: Where, look: Look, command: string): void {
  const parts = Shell.parse(command, where.cwd);
  const text = command.trim();
  const rule = rule_of(where, "shell", [text], [text]);
  if (rule === "deny") {
    look.denied.push("your rules refuse " + clip(text));
    return;
  }
  if (typeof parts === "string") {
    if (rule === "ask") {
      look.flags.push({ why: "your rules ask about " + clip(text), kind: "shell", subject: text, wide: null, rule: true });
    }
    if (rule !== "allow") {
      look.flags.push({ why: "illi can't follow this command: " + parts, kind: "shell", subject: text, wide: null });
    }
    return;
  }
  parts.forEach((part) => look_part(where, look, part, 0));
}

// a part's flags and change: by the user's rules first, then each value
// its command's name can take (a loop's), its redirections, assignments
// and files
function look_part(where: Where, look: Look, part: Part, depth: number): void {
  const exact = Guard.norm(part);
  const plain = part.text;
  const rule = rule_of(where, "shell", [plain, exact], part.root ? [exact] : [plain, exact]);
  if (rule === "deny") {
    look.denied.push("your rules refuse " + clip(exact));
    return;
  }
  if (rule === "allow") {
    return;
  }
  const flag = (why: string, wide: Flag["wide"] = null) => look.flags.push({ why, kind: "shell", subject: exact, wide });
  if (rule === "ask") {
    look.flags.push({ why: "your rules ask about " + clip(plain), kind: "shell", subject: exact, wide: null, rule: true });
  }
  if (part.root) {
    flag(clip(plain) + " runs as root");
  }
  for (const e of part.env) {
    env_flag(e.name, e.value, flag);
  }
  const uses: Use[] = part.redirs.flatMap((r) => redir_use(r, part.cwd));
  let change = uses.some((u) => u.write && !DEVS.test(u.word.alts[0]));
  const head = part.argv[0];
  if (head !== undefined) {
    const heads = head.dynamic || head.glob ? null : head.alts;
    if (heads === null) {
      flag("the command " + head.raw + " is named only as it runs");
      change = true;
    } else {
      for (const name of heads) {
        const one = { ...part, argv: [{ ...head, alts: [name] }, ...part.argv.slice(1)] };
        change = look_command(where, look, one, uses, flag, depth) || change;
      }
    }
  }
  for (const use of uses) {
    use_look(where, look, use, flag);
  }
  if (change) {
    const pattern = "shell:" + prefix(part);
    look.changes.push({ why: where.mode === "read-only" ? clip(plain) + " may change things" : "ask mode asks before " + clip(plain), kind: "shell", subject: exact, wide: where.mode === "ask" ? { kind: "shell", subject: exact, grant: pattern } : null });
  }
}

// an assignment that changes what runs (PATH, LD_PRELOAD, a pager that
// isn't one): flagged
function env_flag(name: string, value: Word, flag: (why: string) => void): void {
  if (RUNS.test(name) && !(/^(EDITOR|VISUAL|PAGER|GIT_PAGER|MANPAGER)$/.test(name) && !value.dynamic && value.alts.every((a) => QUIET.has(a)))) {
    flag("it sets " + name + ", which changes what runs");
  }
}

// a redirection's file: written (>, >>, >|, &>, <>, >& to a file), or read
// (<); none for a heredoc, a here-string, a descriptor
function redir_use(r: Part["redirs"][number], cwd: string | null): Use[] {
  if (r.op === "<<" || r.op === "<<-" || r.op === "<<<" || r.target.fd) {
    return [];
  }
  if ((r.op === ">&" || r.op === "<&") && !r.target.dynamic && /^(\d+|-)$/.test(r.target.alts[0])) {
    return [];
  }
  return [{ word: r.target, write: r.op !== "<" && r.op !== "<&", cwd }];
}

// a command (its name one value): its danger flags and files (pushed to
// uses); whether it changes things
function look_command(where: Where, look: Look, part: Part, uses: Use[], flag: (why: string, wide?: Flag["wide"]) => void, depth: number): boolean {
  const head = part.argv[0];
  const alt = head.alts[0];
  const base = path.basename(alt);
  const name = Shell.program(head);
  const args = part.argv.slice(1);
  const text = clip(part.text);
  const use = (w: Word, write: boolean) => uses.push({ word: w, write, cwd: part.cwd });
  if (alt.includes("/")) {
    const file = part.cwd === null && !path.isAbsolute(alt) ? null : real(path.resolve(part.cwd ?? "/", alt));
    if (file === null || (!under(file, where.top) && name === "")) {
      flag(text + " runs a program from " + (file === null ? "a folder known only as it runs" : shown(path.dirname(file), where.top)));
    }
  }
  if (part.fed && !READS.has(name) && !WORDS.has(name)) {
    flag(text + " takes its arguments from its input (xargs)");
  }
  const danger = command_danger(where, look, part, base, args, use, flag, depth);
  if (danger !== null) {
    return danger;
  }
  if (WORDS.has(name) || (args.length === 1 && /^(--version|--help|-h|-V|version|help)$/.test(args[0].alts[0]))) {
    if (name === "export" || name === "declare" || name === "typeset" || name === "local" || name === "readonly") {
      args.forEach((a) => {
        const set = /^([A-Za-z_]\w*)\+?=/.exec(a.raw);
        if (set !== null) {
          env_flag(set[1], Shell.cut(a, set[0].length), flag);
        }
      });
    }
    return name === "trap" || name === "alias";
  }
  if (READS.has(name)) {
    args_use(args, false, use);
    return false;
  }
  if (WRITERS.has(base)) {
    args_use(args, true, use);
    return true;
  }
  if (COPIERS.has(base)) {
    const pos = positional(args);
    pos.forEach((w, k) => use(w, base === "mv" || k === pos.length - 1));
    return true;
  }
  args_use(args, false, use);
  return true;
}

// the danger list, by the command's base name (wherever it lives): its
// flags pushed, and whether it changes things (null: not on the list,
// judged as any other)
function command_danger(where: Where, look: Look, part: Part, base: string, args: Word[], use: (w: Word, write: boolean) => void, flag: (why: string, wide?: Flag["wide"]) => void, depth: number): boolean | null {
  const text = clip(part.text);
  const xs = args.map((a) => (a.dynamic ? "" : a.alts[0]));
  const has = (...names: string[]) => xs.some((x) => names.includes(x) || names.some((n) => n.startsWith("--") && x.startsWith(n + "=")));
  const short = (c: string) => xs.some((x) => /^-[a-zA-Z]+$/.test(x) && x.includes(c));
  const pos = positional(args);
  const sub = pos[0]?.alts[0] ?? "";
  switch (base) {
    case "git": {
      return git_look(part, args, use, flag);
    }
    case "rm":
    case "rmdir":
    case "unlink":
    case "shred": {
      pos.forEach((w) => use(w, true));
      if (base === "shred") {
        flag(text + " destroys files for good");
      }
      if (base === "rm" && (short("r") || short("R") || has("--recursive"))) {
        const targets = pos.flatMap((w) => named(w, part.cwd) ?? [null]);
        const vital = targets.find((f) => f !== null && vital_of(where, f));
        if (vital !== undefined) {
          flag(text + " deletes " + shown(vital!, where.top) + ", a folder that matters");
        } else if (!pos.every((w) => rebuilt(where, w, part.cwd))) {
          flag(text + " deletes " + pos.map((w) => w.raw).join(" ") + " and all in it");
        }
      }
      return true;
    }
    case "dd": {
      for (const a of args) {
        const m = /^(if|of)=/.exec(a.raw);
        if (m !== null) {
          const w = Shell.cut(a, m[0].length);
          use(w, m[1] === "of");
          if (m[1] === "of" && /^\/dev\//.test(w.alts[0]) && !DEVS.test(w.alts[0])) {
            flag(text + " writes to a whole device");
          }
        }
      }
      return true;
    }
    case "mkfs":
    case "wipefs":
    case "fdisk":
    case "sfdisk":
    case "parted":
    case "mkswap":
    case "cryptsetup": {
      flag(text + " can wipe a disk");
      return true;
    }
    case "chmod":
    case "chown":
    case "chgrp": {
      args_use(args, true, use);
      if (short("R") || has("--recursive")) {
        flag(text + " changes the permissions of a whole tree");
      }
      return true;
    }
    case "pkill":
    case "killall":
    case "killall5": {
      flag(text + " stops processes by name, maybe not illi's own");
      return true;
    }
    case "kill": {
      if (xs.some((x) => x === "-1") || (has("--") && xs.includes("-1"))) {
        flag(text + " stops every process you own");
      }
      return true;
    }
    case "shutdown":
    case "reboot":
    case "poweroff":
    case "halt":
    case "init":
    case "telinit": {
      flag(text + " turns the computer off or restarts it");
      return true;
    }
    case "systemctl":
    case "service":
    case "launchctl":
    case "crontab":
    case "at":
    case "atrm":
    case "batch":
    case "mount":
    case "umount":
    case "swapon":
    case "swapoff":
    case "modprobe":
    case "insmod":
    case "rmmod":
    case "sysctl":
    case "passwd":
    case "chpasswd":
    case "useradd":
    case "userdel":
    case "usermod":
    case "groupadd":
    case "visudo":
    case "chsh":
    case "iptables":
    case "nft":
    case "ufw":
    case "firewall-cmd": {
      const reads = (base === "systemctl" && /^(status|show|list-\S+|is-\S+|cat|help)$/.test(sub)) || (base === "launchctl" && /^(list|print)$/.test(sub)) || (base === "crontab" && has("-l")) || (base === "sysctl" && !short("w") && !xs.some((x) => x.includes("=")));
      if (!reads) {
        flag(text + " changes the system");
      }
      return !reads;
    }
    case "curl":
    case "wget": {
      return net_look(part, base, args, use, flag);
    }
    case "ssh":
    case "mosh":
    case "sftp":
    case "ftp":
    case "telnet":
    case "nc":
    case "ncat":
    case "netcat":
    case "socat": {
      flag(text + " connects to another computer");
      return true;
    }
    case "scp":
    case "rsync": {
      pos.forEach((w, k) => use(w, k === pos.length - 1));
      if (base === "scp" || pos.some((w) => /^[^/\s]*:/.test(w.alts[0]) && !/^[A-Za-z]:\\/.test(w.alts[0]))) {
        flag(text + " copies to or from another computer");
      }
      if (base === "rsync" && xs.some((x) => x.startsWith("--delete"))) {
        flag(text + " deletes files at its target");
      }
      return true;
    }
    case "docker":
    case "podman": {
      const verb = sub;
      const gone = /^(rm|rmi|kill|prune)$/.test(verb) || pos.some((w) => w.alts[0] === "prune") || (verb === "volume" && pos[1]?.alts[0] === "rm") || (verb === "compose" && pos.some((w) => w.alts[0] === "down") && (has("-v", "--volumes", "--rmi")));
      if (gone) {
        flag(text + " deletes containers, images or volumes");
      }
      if (has("--privileged") || xs.some((x) => /^(\/|\/var\/run\/docker\.sock)(:|$)/.test(x))) {
        flag(text + " gives a container the whole computer");
      }
      if (verb === "push") {
        flag(text + " publishes an image");
      }
      return true;
    }
    case "kubectl":
    case "oc":
    case "helm":
    case "terraform":
    case "tofu":
    case "pulumi": {
      const reads = /^(get|describe|logs|top|explain|version|api-resources|api-versions|cluster-info|plan|validate|fmt|show|output|init|list|ls|status|history|template|lint|search|repo|preview|whoami|config)$/.test(sub) && !(sub === "config" && /^(set|use-context|delete)/.test(pos[1]?.alts[0] ?? ""));
      if (!reads) {
        flag(text + " changes real infrastructure");
      }
      return !reads;
    }
    case "aws":
    case "gcloud":
    case "az":
    case "doctl":
    case "fly":
    case "flyctl":
    case "vercel":
    case "netlify":
    case "heroku": {
      const acts = xs.some((x) => /^(create|delete|deploy|destroy|put|update|remove|rm|terminate|stop|start|set|apply|scale|--prod|cp|mv|sync|release|promote|rollback)/.test(x));
      if (acts) {
        flag(text + " changes cloud resources");
      }
      return true;
    }
    case "gh": {
      const verb = pos[1]?.alts[0] ?? "";
      if (sub === "api" ? has("-X", "--method", "-f", "-F", "--field", "--raw-field", "--input") : /^(create|merge|close|delete|edit|comment|review|reopen|ready|run|set|remove|upload|rename|archive|transfer|fork|sync|deploy|enable|disable|cancel|rerun|lock|unlock|pin|unpin)$/.test(verb)) {
        flag(text + " acts on GitHub as you", { kind: "shell", subject: Guard.norm(part), grant: "shell:" + prefix(part) });
      }
      return true;
    }
  }
  if (publishes(base, sub, xs)) {
    flag(text + " publishes for everyone");
    return true;
  }
  const install = installs(base, sub, xs, has);
  if (install) {
    flag(text + " installs or removes software for the whole computer", { kind: "shell", subject: Guard.norm(part), grant: "shell:" + prefix(part) });
    return true;
  }
  if (SHELLS.has(base) || INTERPS.test(base) || base === "source" || base === ".") {
    return runner_look(where, look, part, base, args, use, flag, depth);
  }
  if (base === "find" || base === "fd" || base === "sed" || base === "sort" || base === "awk" || base === "gawk" || base === "mawk" || base === "nawk") {
    return reader_look(where, part, base, args, use, flag);
  }
  return null;
}

// git: its own options (-C, -c, --git-dir), the subcommand's danger, and
// whether it only reads; its positional words are its files
function git_look(part: Part, args: Word[], use: (w: Word, write: boolean) => void, flag: (why: string, wide?: Flag["wide"]) => void): boolean {
  const text = clip(part.text);
  let k = 0;
  for (; k < args.length; k++) {
    const a = args[k];
    const x = a.dynamic ? "" : a.alts[0];
    if (x === "-C" || x === "--git-dir" || x === "--work-tree" || x === "--namespace") {
      const v = args[++k];
      if (v !== undefined) {
        use(v, x !== "-C");
      }
    } else if (x === "-c") {
      const kv = args[++k];
      if (kv === undefined || kv.dynamic || GIT_RUNS.test(kv.alts[0])) {
        flag(text + " sets git config that runs a program");
      }
    } else if (/^--(git-dir|work-tree)=/.test(x)) {
      use(Shell.cut(a, x.indexOf("=") + 1), true);
    } else if (/^--(exec-path|config-env)/.test(x)) {
      flag(text + " changes what git runs");
    } else if (!x.startsWith("-") || a.dynamic) {
      break;
    }
  }
  const sub = args[k]?.dynamic ? "" : args[k]?.alts[0] ?? "";
  const rest = args.slice(k + 1);
  const xs = rest.map((a) => (a.dynamic ? "" : a.alts[0]));
  const has = (...names: string[]) => xs.some((x) => names.includes(x) || names.some((n) => n.startsWith("--") && x.startsWith(n + "=")));
  const short = (c: string) => xs.some((x) => /^-[a-zA-Z]+$/.test(x) && x.includes(c));
  const pos = positional(rest);
  const first = pos[0]?.alts[0] ?? "";
  let read = GIT_READ.has(sub);
  switch (sub) {
    case "push": {
      if (has("--force", "--force-with-lease", "--force-if-includes", "--mirror", "--delete", "--prune") || short("f") || short("d") || pos.some((w) => /^[+:]/.test(w.alts[0]))) {
        flag(text + " rewrites or deletes history on the remote");
      } else {
        flag(text + " sends commits to a remote", { kind: "shell", subject: Guard.norm(part), grant: "shell:git push *" });
      }
      break;
    }
    case "reset": {
      if (has("--hard", "--merge")) {
        flag(text + " throws away uncommitted changes");
      }
      break;
    }
    case "clean": {
      read = has("-n", "--dry-run") || short("n");
      if (!read && (short("f") || has("--force"))) {
        flag(text + " deletes untracked files for good");
      }
      break;
    }
    case "checkout": {
      const files = pos.some((w) => w.alts[0] === "." || (!w.dynamic && part.cwd !== null && fs.existsSync(path.resolve(part.cwd, w.alts[0]))));
      if (has("-f", "--force") || xs.includes("--") || files) {
        flag(text + " throws away uncommitted changes to files");
      }
      break;
    }
    case "restore": {
      if (!has("--staged", "-S") || has("--worktree", "-W")) {
        flag(text + " throws away uncommitted changes to files");
      }
      break;
    }
    case "switch": {
      if (has("--discard-changes", "-f", "--force")) {
        flag(text + " throws away uncommitted changes");
      }
      break;
    }
    case "branch": {
      if (has("-D") || (has("-d", "--delete") && has("-f", "--force"))) {
        flag(text + " deletes a branch even if unmerged");
      }
      read = pos.length === 0 && !has("-d", "-D", "--delete", "-m", "-M", "--move", "-c", "-C", "--copy", "-u", "--set-upstream-to", "--unset-upstream", "--edit-description", "-f", "--force");
      break;
    }
    case "tag": {
      read = pos.length === 0 || has("-l", "--list", "-v", "--verify");
      break;
    }
    case "remote": {
      read = pos.length === 0 || first === "show" || first === "get-url";
      break;
    }
    case "config": {
      const asks = has("--get", "--get-all", "--get-regexp", "--get-urlmatch", "--list", "-l", "--show-origin", "--show-scope", "--name-only") || first === "get" || first === "list";
      const write = !asks && (pos.length >= 2 || has("--unset", "--unset-all", "--add", "--replace-all", "--rename-section", "--remove-section", "-e", "--edit") || first === "set" || first === "unset" || first === "edit");
      if (write && has("--global", "--system")) {
        flag(text + " changes git for every repository");
      }
      if (write && pos.some((w) => w.dynamic || GIT_RUNS.test(w.alts[0]))) {
        flag(text + " sets git config that runs a program");
      }
      read = !write;
      break;
    }
    case "stash": {
      read = first === "list" || first === "show";
      if (first === "drop" || first === "clear") {
        flag(text + " deletes stashed changes");
      }
      break;
    }
    case "worktree": {
      read = first === "list";
      if (first === "remove" && has("-f", "--force")) {
        flag(text + " deletes a worktree's uncommitted changes");
      }
      break;
    }
    case "notes": {
      read = pos.length === 0 || first === "list" || first === "show";
      break;
    }
    case "submodule": {
      read = pos.length === 0 || first === "status" || first === "summary";
      if (first === "foreach") {
        flag(text + " runs a command in each submodule");
      }
      break;
    }
    case "reflog": {
      read = pos.length === 0 || first === "show";
      if (first === "expire" || first === "delete") {
        flag(text + " drops what git keeps to undo mistakes");
      }
      break;
    }
    case "filter-branch":
    case "filter-repo": {
      flag(text + " rewrites the whole history");
      break;
    }
    case "update-ref": {
      if (has("-d")) {
        flag(text + " deletes a ref");
      }
      break;
    }
    case "grep": {
      if (has("-O", "--open-files-in-pager") || xs.some((x) => /^-O./.test(x))) {
        flag(text + " runs a program on what it finds");
      }
      break;
    }
    case "send-email": {
      flag(text + " sends email", { kind: "shell", subject: Guard.norm(part), grant: "shell:git send-email *" });
      break;
    }
  }
  pos.forEach((w) => use(w, !read));
  return !read;
}

// curl and wget: data sent to a host that isn't this computer flagged;
// files they write (-o, -O, --output-dir, a cookie jar) and read (-T,
// -d @file, -K) are its files; a plain fetch only reads (curl's)
function net_look(part: Part, base: string, args: Word[], use: (w: Word, write: boolean) => void, flag: (why: string) => void): boolean {
  const text = clip(part.text);
  const SENDS = base === "curl" ? /^(-d|--data.*|-F|--form.*|-T|--upload-file|--json)$/ : /^(--post-data|--post-file|--body-data|--body-file|--method)$/;
  const WRITES = base === "curl" ? /^(-o|--output|--output-dir|-c|--cookie-jar|-D|--dump-header|--trace|--trace-ascii|--stderr)$/ : /^(-O|--output-document|-P|--directory-prefix|-o|--output-file|-a|--append-output)$/;
  const READS_ = base === "curl" ? /^(-K|--config|-T|--upload-file|-b|--cookie)$/ : /^(-i|--input-file|--post-file|--body-file|--load-cookies)$/;
  const VALUED = base === "curl" ? /^(-[A-Za-z]|--[a-z-]+)$/ : /^-[A-Za-z]$/;
  let sends = false;
  let writes = base === "wget";
  const urls: string[] = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    const x = a.dynamic ? "" : a.alts[0];
    const eq = x.startsWith("--") ? x.indexOf("=") : -1;
    const opt = eq > 0 ? x.slice(0, eq) : x;
    const value = eq > 0 ? Shell.cut(a, eq + 1) : null;
    if (!x.startsWith("-") || x === "-") {
      urls.push(x);
      continue;
    }
    sends ||= SENDS.test(opt) || ((opt === "-X" || opt === "--request") && /^(POST|PUT|PATCH|DELETE)$/i.test(value?.alts[0] ?? args[k + 1]?.alts[0] ?? ""));
    const takes = WRITES.test(opt) || READS_.test(opt) || SENDS.test(opt) || (opt === "-X" || opt === "--request" || opt === "-H" || opt === "--header" || opt === "-u" || opt === "--user" || opt === "-A" || opt === "-e" || opt === "-x" || opt === "--proxy" || opt === "-w" || opt === "-m" || opt === "--max-time" || opt === "--url");
    const v = value ?? (takes && VALUED.test(opt) ? args[++k] : undefined);
    if (v === undefined) {
      continue;
    }
    if (opt === "--url") {
      urls.push(v.alts[0]);
    } else if (WRITES.test(opt) && !(base === "wget" && v.alts[0] === "-")) {
      use(v, true);
      writes = true;
    } else if (READS_.test(opt) || /^@/.test(v.alts[0])) {
      use(/^@/.test(v.alts[0]) ? Shell.cut(v, 1) : v, false);
    } else if (base === "wget" && (opt === "-O" || opt === "--output-document") && v.alts[0] === "-") {
      writes = false;
    }
  }
  const local = urls.length > 0 && urls.every((u) => /^(https?:\/\/)?(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/.test(u));
  if (sends && !local) {
    flag(text + " sends data off this computer");
  }
  return writes || (base === "curl" && args.some((a) => a.alts[0] === "-O" || a.alts[0] === "--remote-name"));
}

// a shell, an interpreter, source: its script (from outside the project:
// flagged), its inline code (naming what can run, write or reach out:
// flagged), code from a pipe (flagged), a heredoc's commands into a shell
// (read as commands of their own)
function runner_look(where: Where, look: Look, part: Part, base: string, args: Word[], use: (w: Word, write: boolean) => void, flag: (why: string) => void, depth: number): boolean {
  const text = clip(part.text);
  const sourced = base === "source" || base === ".";
  const inline = args.findIndex((a) => !a.dynamic && INLINE.has(a.alts[0]));
  if (inline >= 0 && !sourced) {
    const code = args[inline + 1];
    if (SHELLS.has(base) || code === undefined || code.dynamic || RISKY.test(code.alts.join("\n"))) {
      flag(text + " runs code illi can't check");
    }
    return true;
  }
  const script = sourced ? args[0] : args.find((a) => a.dynamic || !a.alts[0].startsWith("-") || a.alts[0] === "-");
  const fed = part.redirs.find((r) => r.body !== undefined);
  if (script === undefined || script.alts[0] === "-") {
    if (fed !== undefined && SHELLS.has(base) && !["fish", "csh", "tcsh", "nu", "pwsh", "xonsh"].includes(base) && depth < 8) {
      const inner = Shell.parse(fed.body!, part.cwd ?? where.cwd);
      if (typeof inner === "string") {
        flag(text + " runs a script illi can't follow: " + inner);
      } else {
        inner.forEach((p) => look_part(where, look, p, depth + 1));
      }
    } else if (fed !== undefined) {
      if (RISKY.test(fed.body!) || !INTERPS.test(base)) {
        flag(text + " runs code illi can't check");
      }
    } else if (part.piped) {
      flag(text + " runs code that comes through a pipe");
    }
    return true;
  }
  if (script.fd) {
    flag(text + " runs code a command writes");
    return true;
  }
  if (["fish", "csh", "tcsh", "nu", "pwsh", "xonsh"].includes(base) && args.some((a) => a.alts[0] === "-c")) {
    flag(text + " runs a script illi can't read");
  }
  const files = named(script, part.cwd);
  if (files === null || files.some((f) => !under(f, where.top))) {
    flag(text + " runs a script from " + (files === null ? "a place known only as it runs" : shown(path.dirname(files.find((f) => !under(f, where.top))!), where.top)));
  }
  use(script, false);
  args.filter((a) => a !== script && !a.alts[0].startsWith("-")).forEach((a) => use(a, false));
  return true;
}

// find, fd, sed, sort, awk: read-only unless an option or a script makes
// them write or run things
function reader_look(where: Where, part: Part, base: string, args: Word[], use: (w: Word, write: boolean) => void, flag: (why: string) => void): boolean {
  const text = clip(part.text);
  const xs = args.map((a) => (a.dynamic ? "" : a.alts[0]));
  switch (base) {
    case "find": {
      const starts: Word[] = [];
      let k = 0;
      while (k < args.length && /^-([HLP]|D|O\d*)$/.test(xs[k])) {
        k += xs[k] === "-D" ? 2 : 1;
      }
      for (; k < args.length && !/^[-(!,]/.test(xs[k]); k++) {
        starts.push(args[k]);
      }
      const deletes = xs.includes("-delete");
      const writes = args.flatMap((_a, j) => (/^-fprint0?$|^-fprintf$|^-fls$/.test(xs[j]) && args[j + 1] !== undefined ? [args[j + 1]] : []));
      (starts.length === 0 ? [Shell.lit(".")] : starts).forEach((w) => use(w, deletes));
      writes.forEach((w) => use(w, true));
      if (deletes) {
        const files = (starts.length === 0 ? [Shell.lit(".")] : starts).flatMap((w) => named(w, part.cwd) ?? [null]);
        if (files.some((f) => f === null || vital_of(where, f))) {
          flag(text + " deletes everything it finds in a folder that matters");
        }
      }
      return deletes || writes.length > 0;
    }
    case "fd": {
      const pos = positional(args);
      pos.slice(1).forEach((w) => use(w, false));
      return xs.some((x) => /^(-x|--exec|-X|--exec-batch)$/.test(x));
    }
    case "sort": {
      const out = args.flatMap((a, j) => (xs[j] === "-o" || xs[j] === "--output" ? [args[j + 1]] : /^--output=/.test(xs[j]) ? [Shell.cut(a, 9)] : /^-o./.test(xs[j]) ? [Shell.cut(a, 2)] : [])).filter((w): w is Word => w !== undefined);
      out.forEach((w) => use(w, true));
      positional(args).filter((w) => !out.includes(w)).forEach((w) => use(w, false));
      return out.length > 0;
    }
    case "sed": {
      const inplace = xs.some((x) => /^-[a-zA-Z]*i/.test(x) && !x.startsWith("--") || x.startsWith("--in-place"));
      const scripts = args.flatMap((a, j) => (xs[j] === "-e" || xs[j] === "--expression" ? [args[j + 1]] : /^--expression=/.test(xs[j]) ? [Shell.cut(a, 13)] : [])).filter((w): w is Word => w !== undefined);
      const file = xs.some((x) => x === "-f" || x.startsWith("--file"));
      const pos = positional(args.filter((a) => !scripts.includes(a)));
      const all = scripts.length > 0 || file ? scripts : pos.slice(0, 1);
      const files = scripts.length > 0 || file ? pos : pos.slice(1);
      if (file || all.some((w) => w.dynamic || !sed_safe(w.alts.join("\n")))) {
        flag(all.some((w) => /(^|[;{}\n])\s*[^;]*\be(\s|;|$)|s(.).*\2.*\2[a-zA-Z0-9]*e/.test(w.alts.join("\n"))) ? text + " runs a shell command (sed's e)" : text + " runs a sed script illi can't check");
      }
      files.forEach((w) => use(w, inplace));
      return inplace;
    }
    default: {
      const progs = args.flatMap((_a, j) => (xs[j] === "-f" || xs[j] === "--file" ? [args[j + 1]] : [])).filter((w): w is Word => w !== undefined);
      const pos = positional(args.filter((a, j) => !progs.includes(a) && !(j > 0 && /^(-F|-v|--assign|--field-separator)$/.test(xs[j - 1]))));
      const prog = progs.length > 0 ? null : pos[0];
      const code = prog?.alts.join("\n") ?? "";
      progs.forEach((w) => use(w, false));
      (prog === null ? pos : pos.slice(1)).filter((w) => !/^[A-Za-z_]\w*=/.test(w.raw)).forEach((w) => use(w, false));
      if (prog === undefined || prog?.dynamic || /\bsystem\s*\(|(?<![|])\|(?![|])\s*["\w$(&]|\|\s*getline|\/dev\/(tcp|udp)/.test(code)) {
        flag(text + " runs a command from awk");
      } else if (/\bprint(f)?\b[^;}]*>|\bfflush\b/.test(code)) {
        flag(text + " writes files from awk");
      }
      return progs.length > 0;
    }
  }
}

// whether a sed script fits the safe grammar: substitutions without e or
// w, printing, deleting, quitting, appending and inserting text, moving
// between lines and the hold space
function sed_safe(script: string): boolean {
  const ADDR = String.raw`(?:\d+|\$|\/(?:\\.|[^\/\\])*\/[IM]*)`;
  const SAFE = new RegExp("^(?:" + ADDR + "(?:,(?:" + ADDR + "|[+~]\\d+))?)?\\s*!?\\s*(?:[pdqQ=nNPDhHgGxlz]|[qQ]\\d+|[aic]\\\\?.*|y(.)(?:\\\\.|(?!\\1).)*\\1(?:\\\\.|(?!\\1).)*\\1|s(.)(?:\\\\.|(?!\\2).)*\\2(?:\\\\.|(?!\\2).)*\\2[gpiImM0-9]*)?$");
  return script.split(/[;\n]/).map((c) => c.trim().replace(/^\{|\}$/g, "").trim()).every((c) => SAFE.test(c));
}

// whether a program publishes for everyone
function publishes(base: string, sub: string, xs: string[]): boolean {
  return (/^(npm|pnpm|yarn|bun|cargo|deno|uv|poetry|flutter|dart|vsce|ovsx)$/.test(base) && sub === "publish")
    || (base === "gem" && sub === "push") || (base === "twine" && sub === "upload") || (base === "mvn" && xs.includes("deploy"))
    || (base === "gradle" && xs.some((x) => /^publish/.test(x)));
}

// whether a program installs or removes software for the whole computer
function installs(base: string, sub: string, xs: string[], has: (...names: string[]) => boolean): boolean {
  const verbs = /^(install|i|add|uninstall|remove|rm|un|update|up|upgrade|reinstall|link|unlink|tap|untap|purge|autoremove|dist-upgrade|full-upgrade)$/;
  const global = has("-g", "--global", "--location=global");
  return (/^(npm|pnpm|bun)$/.test(base) && verbs.test(sub) && global)
    || (base === "yarn" && sub === "global")
    || (/^pip3?$/.test(base) && verbs.test(sub) && has("--user", "--break-system-packages", "--target", "--root", "--prefix"))
    || (/^(pipx|cargo|go|gem)$/.test(base) && /^(install|uninstall)$/.test(sub))
    || (base === "uv" && sub === "tool" && /^(install|uninstall|upgrade)$/.test(xs[1] ?? ""))
    || (/^(brew|apt|apt-get|dnf|yum|zypper|apk|snap|flatpak|port|choco|winget|nix-env)$/.test(base) && verbs.test(sub))
    || (base === "pacman" && xs.some((x) => /^-[SRU]/.test(x)));
}

// MCP
// ===

// a tool by its name (an MCP tool, or one of Claude Code's illi doesn't
// know): by the user's rules on its name first (their mcp rules); one
// that only reads runs (in read-only too); any other is asked the first
// time (why: what it may do), "don't ask again" covering the tool from
// then on
function look_tool(where: Where, look: Look, tool: string, why: string | null): void {
  const rule = rule_of(where, "mcp", [tool], [tool]);
  if (rule === "deny") {
    look.denied.push("your rules refuse " + tool);
    return;
  }
  if (rule === "allow") {
    return;
  }
  if (rule === "ask") {
    look.flags.push({ why: "your rules ask about " + tool, kind: "mcp", subject: tool, wide: null, rule: true });
  }
  if (why === null) {
    return;
  }
  const wide = { kind: "mcp" as const, subject: tool, grant: "mcp:" + tool.replace(/\*/g, "\\*") };
  look.flags.push({ why: tool + why, kind: "mcp", subject: tool, wide });
  look.changes.push({ why: where.mode === "read-only" ? tool + " may change things" : "ask mode asks before " + tool, kind: "mcp", subject: tool, wide: where.mode === "ask" ? wide : null });
}

// Files
// =====

// a file read or written (a folder: read, as a search's), judged; a
// write naming none is asked
function look_file(where: Where, look: Look, file: unknown, write: boolean): void {
  if (typeof file !== "string" || file === "") {
    if (write) {
      look.flags.push({ why: "it names no file to change", kind: "write", subject: "", wide: null });
    }
    return;
  }
  const abs = real(path.resolve(where.cwd, file));
  const kind: Kind = write ? "write" : "read";
  const rule = path_rule(where, abs, write);
  if (rule === "deny") {
    look.denied.push("your rules refuse " + (write ? "changing " : "reading ") + shown(abs, where.top));
    return;
  }
  if (rule === "allow") {
    return;
  }
  if (rule === "ask") {
    look.flags.push({ why: "your rules ask about " + shown(abs, where.top), kind, subject: abs, wide: null, rule: true });
  }
  const why = path_why(where, abs, write);
  if (why !== null) {
    const folder = !write && fs.statSync(abs, { throwIfNoEntry: false })?.isDirectory() === true;
    const dir = folder ? abs : path.dirname(abs);
    look.flags.push({ why: why.why, kind, subject: abs, wide: why.wide ? { kind, subject: folder ? abs + "/" : abs, grant: kind + ":" + dir + "/*" } : null });
  }
  if (write) {
    look.changes.push({ why: where.mode === "read-only" ? "changing " + shown(abs, where.top) : "ask mode asks before changing " + shown(abs, where.top), kind, subject: abs, wide: where.mode === "ask" ? { kind, subject: abs, grant: "write:" + where.top + "/*" } : null });
  }
}

// a file a part reads or writes, judged: the user's path rules, then
// where it is (outside the project, a secret, protected, a device);
// known only as it runs: asked
function use_look(where: Where, look: Look, use: Use, flag: (why: string, wide?: Flag["wide"]) => void): void {
  const files = named(use.word, use.cwd);
  if (files === null) {
    flag((use.word.raw || "a file") + " is known only as it runs");
    return;
  }
  const kind: Kind = use.write ? "write" : "read";
  for (const file of files) {
    const rule = path_rule(where, file, use.write);
    if (rule === "deny") {
      look.denied.push("your rules refuse " + (use.write ? "changing " : "reading ") + shown(file, where.top));
    } else if (rule === "ask") {
      look.flags.push({ why: "your rules ask about " + shown(file, where.top), kind: "shell", subject: "", wide: null, rule: true });
    } else if (rule !== "allow") {
      const why = path_why(where, file, use.write);
      if (why !== null) {
        flag(why.why, why.wide ? { kind, subject: file, grant: kind + ":" + path.dirname(file) + "/*" } : null);
      }
    }
  }
}

// the user's rule for a file: its kind's (a read also by write rules)
function path_rule(where: Where, file: string, write: boolean): Rule | null {
  return rule_of(where, write ? "write" : "read", [file], [file]) ?? (write ? null : rule_of(where, "write", [], [file]));
}

// why a file is asked about (wide: a folder grant may clear it); null:
// it isn't
function path_why(where: Where, file: string, write: boolean): { why: string; wide: boolean } | null {
  const at = shown(file, where.top);
  if (NET.test(file)) {
    return { why: at + " opens a network connection", wide: false };
  }
  if (DEVS.test(file)) {
    return null;
  }
  if (!write && where.reads.some((d) => under(file, d))) {
    return null;
  }
  if (secret(file)) {
    return { why: at + " may hold secrets", wide: false };
  }
  if (file.startsWith("/dev/") && write) {
    return { why: at + " is a device", wide: false };
  }
  if (under(file, where.top)) {
    return write && guarded(file, where.top) ? { why: at + " configures tools or illi (protected)", wide: false } : null;
  }
  if (SCRATCH.some((d) => under(file, d)) || (!write && SYSTEM.some((d) => under(file, d)))) {
    return null;
  }
  return { why: at + " is outside the project", wide: true };
}

function secret(file: string): boolean {
  return SECRET_NAME.test(path.basename(file)) || SECRET_HOME.some((d) => under(file, path.join(HOME, d))) || SECRET_SYSTEM.some((d) => under(file, d)) || under(file, Projects_real(config.ROOT));
}

// whether a file inside the project is protected
function guarded(file: string, top: string): boolean {
  const rel = path.relative(top, file);
  const parts = rel.split(path.sep);
  return parts.some((p) => PROTECTED_DIRS.has(p)) || PROTECTED_FILES.has(rel) || PROTECTED_DEEP.some((d) => rel === d || rel.startsWith(d + path.sep)) || parts.at(-1) === ".git";
}

// whether deleting a folder whole loses what matters: /, a top-level
// folder, home or one above it, the project or one above it, its .git
function vital_of(where: Where, file: string): boolean {
  return file === "/" || path.dirname(file) === "/" || under(HOME, file) || under(where.top, file) || file === path.join(where.top, ".git");
}

// whether a word names only folders the project's tools rebuild (or,
// outside the project, scratch's own), so deleting it whole is routine;
// a project kept in /tmp is still a project
function rebuilt(where: Where, w: Word, cwd: string | null): boolean {
  if (w.glob || w.dynamic) {
    return false;
  }
  const files = named(w, cwd);
  return files !== null && files.every((f) => (under(f, where.top) ? f !== where.top && REBUILT.has(path.basename(f)) : SCRATCH.some((d) => under(f, d) && f !== d) && !under(where.top, f)));
}

// the files a word names, real paths (links followed): each of its
// values; for a glob its folder, and the entries its last part matches;
// null: known only as it runs (a variable, a folder after a cd to one)
function named(w: Word, cwd: string | null): string[] | null {
  if (w.dynamic) {
    return null;
  }
  const out: string[] = [];
  for (const alt of w.alts) {
    const g = w.glob ? alt.search(/[*?[]/) : -1;
    const head = g < 0 ? alt : alt.slice(0, g);
    if (!path.isAbsolute(head) && cwd === null) {
      return null;
    }
    const abs = path.resolve(cwd ?? "/", head);
    if (g < 0) {
      out.push(real(abs));
      continue;
    }
    const dir = head === "" || head.endsWith("/") ? abs : path.dirname(abs);
    out.push(real(dir));
    const last = alt.slice(alt.lastIndexOf("/", g) + 1);
    if (!last.includes("/")) {
      out.push(...glob_entries(dir, last));
    }
  }
  return out;
}

// a folder's entries a glob's last part matches (a leading dot only by
// one), as real paths; a folder too big to look through: none
function glob_entries(dir: string, glob: string): string[] {
  try {
    const names = fs.readdirSync(dir);
    if (names.length > 2000) {
      return [];
    }
    const re = new RegExp("^" + glob.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]") + "$");
    return names.filter((n) => re.test(n) && (glob.startsWith(".") || !n.startsWith("."))).slice(0, 200).map((n) => real(path.join(dir, n)));
  } catch {
    return [];
  }
}

// Words
// =====

// where a glob looks from a folder: as far as its pattern is fixed
// (src/*.ts: src; /etc/**: /etc; **/x: the folder itself)
function glob_root(dir: string, pattern: string): string {
  const parts = pattern.split("/");
  const k = parts.findIndex((p) => /[*?[\]{}]/.test(p));
  return path.resolve(dir, (k < 0 ? parts.slice(0, -1) : parts.slice(0, k)).join("/") || ".");
}

// a part's words that aren't options, nor -m's message
function positional(args: Word[]): Word[] {
  const out: Word[] = [];
  let ended = false;
  for (let k = 0; k < args.length; k++) {
    const x = args[k].dynamic ? args[k].alts[0] : args[k].alts[0];
    if (!ended && !args[k].dynamic && (x === "-m" || x === "--message")) {
      k++;
    } else if (!ended && !args[k].dynamic && x === "--") {
      ended = true;
    } else if (ended || args[k].dynamic || !x.startsWith("-") || x === "-") {
      out.push(args[k]);
    }
  }
  return out;
}

// a part's words used as files: those that aren't options, and long
// options' values (--out=x); -m's message never
function args_use(args: Word[], write: boolean, use: (w: Word, write: boolean) => void): void {
  positional(args).forEach((w) => use(w, write));
  for (const a of args) {
    const x = a.alts[0];
    const eq = x.indexOf("=");
    if (!a.dynamic && x.startsWith("--") && eq > 0 && x !== "--message") {
      use(Shell.cut(a, eq + 1), write);
    }
  }
}

// the family a "don't ask again" covers: the command and, for those that
// have them, its subcommand, then anything (git push *)
function prefix(part: Part): string {
  const head = part.argv[0];
  if (head === undefined) {
    return "*";
  }
  const name = Shell.program(head) || head.raw;
  const sub = SUBS.has(name) ? positional(part.argv.slice(1)).find((w) => !w.dynamic && !/^[-+]/.test(w.alts[0])) : undefined;
  const words = [part.root ? "sudo " + quote(name) : quote(name), ...(sub === undefined ? [] : [quote(sub.alts[0])])];
  return words.join(" ").replace(/\*/g, "\\*") + " *";
}

// a word quoted for a shell where needed
function quote(x: string): string {
  return x !== "" && /^[A-Za-z0-9_./:=@%+,^-]+$/.test(x) ? x : "'" + x.replace(/'/g, "'\\''") + "'";
}

// a path as a question shows it: from the project's top (. for itself),
// from home (~), else whole
function shown(file: string, top: string): string {
  return file === top ? "." : under(file, top) ? path.relative(top, file) : under(file, HOME) ? "~" + file.slice(HOME.length) : file;
}

function clip(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > 80 ? one.slice(0, 79) + "…" : one;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

// whether a path is a folder's or under it
function under(file: string, dir: string): boolean {
  return file === dir || file.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);
}

// a path's real place: links followed as far as it exists, the rest kept;
// a file descriptor's (/dev/fd/3, /dev/stdin: the command's own, not
// illi's) kept as it is
function real(file: string): string {
  if (DEVS.test(file)) {
    return file;
  }
  let [head, tail] = [file, ""];
  for (let k = 0; k < 256; k++) {
    try {
      return path.join(fs.realpathSync(head), tail);
    } catch {
      const up = path.dirname(head);
      if (up === head) {
        return file;
      }
      tail = path.join(path.basename(head), tail);
      head = up;
    }
  }
  return file;
}

function Projects_real(dir: string): string {
  try {
    return fs.realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}
