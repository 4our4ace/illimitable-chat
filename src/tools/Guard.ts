// Guard
// =====
// Whether a tool call may run before it does: run, asked about (the user
// says yes or no, told why), or refused. Deterministic: the call is read
// (a shell command by Shell.ts, as bash reads it), its risks found as
// flags, each of a tier (the modes that ask it), and the mode decides
// what is left:
//
//   read-only  reads run; changes are refused; careful's flags are asked
//   ask        reads run; changes and careful's flags are asked
//   careful    reads and changes run; its flags are asked
//   auto       all runs but auto's flags (the default)
//   yolo       all runs
//
// auto's flags: a file changed, deleted or moved outside the project
// (placed as the system finds it: link/.. where the link leads, a glob's
// matches, a cd behind builtin, command or time), or read there by a
// command that may change things (a script, a build, a program illi
// doesn't know), once per folder (a folder grant; scratch free, and for
// a read the system's folders, the dependency caches and illi's
// skills); a folder there holding a secret store read (home, for its
// .ssh); a change whose file is known only as it runs ($X, $(...), what
// xargs adds); a device written; deleting what matters whole (the
// project, its .git, home, /; in a project holding home, any folder, and
// a protected file changed); an archive extracted with its names kept
// whole (tar -P, unzip -:, cpio's own way); root (sudoedit too), disks
// and their volumes (LVM's, ZFS's, diskutil's, dmsetup's), the system's
// services and settings, power, every process stopped (kill -1), a
// container given the whole computer or a folder outside; a secret,
// through any tool (as in every mode but yolo); what deletes for good on
// another computer (a push that rewrites or deletes the remote's
// history: --force, +ref, --delete, :ref, --mirror, --prune; a
// repository, release or package deleted: gh repo delete, npm unpublish;
// cloud resources and infrastructure deleted: aws s3 rm, kubectl delete,
// terraform destroy) and what makes git run a program (its hooks and
// config written, through any tool; git config's keys that name one,
// core.hooksPath, credential.helper, an alias of !...; git -c's), each
// granted only exactly; Claude Code's settings (a .claude folder's at any
// depth, home's, a .claude folder moved, copied or linked into place, or
// deleted) and illi's own config; a command named only as it runs, and
// what Shell.ts can't read. Other reads outside the project run (cat,
// grep, find, the read tool), as the network, plain pushes and deploys,
// inline code (but naming a secret), project scripts, MCP tools and the
// rest in the project do. Besides, in auto, Tools.ts's loop guard asks
// the same call made a third time in a row in a turn.
//
// careful's, the long list: the danger list (root, deleting trees,
// wiping disks, losing git work, sending data off, connecting out,
// publishing, changing the system, infrastructure or the cloud,
// assignments that change what runs, code fed into a shell from
// elsewhere, programs that run a command they're given, inline code that
// names what can run, write or reach out); paths (outside the project,
// secrets anywhere, protected files inside, devices and network
// sockets); what is known only as the command runs (a variable, a
// command's output, a folder after a cd to one, a glob as a command's
// name); a program, script or makefile from outside the project, a
// project tool run outside it; what Shell.ts can't read. Whatever these
// checks can't be sure of is asked, never run silently.
//
// Before the mode, the user's rules (Rules: allow, ask or deny, by
// pattern): deny refuses, even in yolo; ask asks every time, even in
// yolo, with no "don't ask again"; allow runs, over every flag. Grants
// ("don't ask again" answers, kept by the caller) clear flags: an exact
// one (kind=subject) any flag of that very call, a pattern (kind:pattern)
// only flags that offer one (a family of commands, a folder, an MCP
// tool); danger, secrets and protected files clear only exactly, and
// inline code offers none. A change to illi's own config is asked in
// every mode, yolo too.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as config from "../config/Config.ts";
import { Shell, type Part, type Redir, type Word } from "./Shell.ts";

// Types
// =====

export type Mode = "read-only" | "ask" | "careful" | "auto" | "yolo";
export const MODES: Mode[] = ["read-only", "ask", "careful", "auto", "yolo"];

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
// read freely besides (illi's skills', commands' and agents'), the loaded
// plugins' folders (read freely but their secrets; their scripts run as
// the project's)
export type Where = { mode: Mode; cwd: string; top: string; rules: Rules; grants: Set<string>; reads: string[]; plugins: string[] };

// a verdict: run; ask (why; the grants a "don't ask again" keeps, none
// for the user's own ask rules; the exact grants that clear it); refuse
// (why; by the user's rule, which nothing here clears; by the mode, which
// its exact grants clear)
export type Verdict =
  | { $: "allow" }
  | { $: "ask"; why: string; always: string[]; exact: string[] }
  | { $: "deny"; why: string; rule: boolean; exact: string[] };

// the modes that ask a flag: every one, yolo too (self: a change to
// illi's own config); every one but yolo (all: what auto asks); careful,
// ask and read-only (careful: the long list); auto alone (auto: what
// careful asks another way)
type Tier = "self" | "all" | "careful" | "auto";

// a reason to ask: why; what an exact grant names (kind=subject); what a
// pattern grant may clear it for (its kind and subject, the pattern a
// "don't ask again" offers), if any; the modes that ask it; whether it
// is the user's own ask rule (asked in every mode, never cleared);
// whether it is a one-off (inline code: no "don't ask again", as its
// exact grant would never match again)
type Flag = { why: string; kind: Kind; subject: string; wide: { kind: Kind; subject: string; grant: string } | null; tier: Tier; rule?: boolean; once?: boolean };

// how a command's checks flag it (look_part's: its exact subject), of
// careful's list unless told
type Flagger = (why: string, wide?: Flag["wide"], tier?: Tier, once?: boolean) => void;

// why a file is asked about (path_why): whether a folder grant may clear
// it (wide), the modes that ask it
type Reason = { why: string; wide: boolean; tier: Tier };

// what a call was found to do: refused by the user's rules (why), its
// flags, and its changes (flags only the modes read-only and ask act on);
// a shell command's whole text (look_part); the links it makes as it
// runs (ln's, as named: a .. after one isn't where it seems)
type Look = { denied: string[]; flags: Flag[]; changes: Flag[]; whole: string; links: string[] };

// a file a part reads or writes, as a word, in its folder; one a copy or
// a move lands in a folder it names, into (land)
type Use = { word: Word; write: boolean; cwd: string | null; into?: Word };

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

// the searches whose first word is a pattern (none when -e or -f gives
// it, rg's --files, ag's -g): the letters and long options that take a
// value (-A 3, -g '*.ts', --type py), by program (egrep, fgrep, zgrep as
// grep)
const SEARCHES: Record<string, [string, RegExp]> = {
  grep : ["efmABCdD", /^--(regexp|file|max-count|after-context|before-context|context|directories|devices|label|include|exclude|exclude-dir|exclude-from|binary-files|group-separator)$/],
  rg   : ["efgtTABCmMjrdE", /^--(regexp|file|glob|iglob|type|type-not|after-context|before-context|context|max-count|max-columns|threads|replace|max-depth|encoding|sort|sortr|type-add|type-clear|pre|pre-glob|ignore-file|colors|context-separator|field-match-separator|path-separator|dfa-size-limit|regex-size-limit|max-filesize|engine)$/],
  ag   : ["GgABCmp", /^--(file-search-regex|ignore|ignore-dir|path-to-ignore|depth|after|before|context|max-count)$/],
  ack  : ["ABCm", /^--(type|ignore-dir|ignore-file|match|after-context|before-context|context|max-count|output)$/],
};

// the programs and builtins whose words aren't files
const WORDS = new Set([
  "echo", "printf", "sleep", "seq", "true", "false", ":", "date", "whoami", "id", "uname", "hostname", "nproc", "export",
  "declare", "typeset", "local", "readonly", "unset", "read", "set", "shopt", "exit", "return", "break", "continue",
  "shift", "wait", "jobs", "cd", "pushd", "popd", "dirs", "let", "type", "which", "whereis", "command", "hash", "help",
  "printenv", "env", "getconf", "locale", "arch", "tty", "pgrep", "ps", "uptime", "free", "groups", "test", "[", "[[",
  "((", "basename", "dirname", "expr", "tput", "clear", "umask", "pwd", "alias", "unalias", "trap", "times", "yes",
]);

// the programs whose files are written (all their words, or, for those
// copying, the last: the rest are read; ln's all, ln_use)
const WRITERS = new Set([
  "rm", "rmdir", "unlink", "shred", "truncate", "touch", "mkdir", "tee", "chmod", "chown", "chgrp", "mv", "tar", "unzip",
  "zip", "gzip", "gunzip", "bzip2", "bunzip2", "xz", "unxz", "7z", "patch", "split", "csplit", "mkfifo", "mknod", "link",
  "rename", "chattr", "setfacl", "ar", "cpio", "sudoedit",
]);
const COPIERS = new Set(["cp", "ln", "install", "rsync", "scp"]);

// the archive and patch tools' short options that take a value, and of
// those the ones naming a file or folder (tar's archive, -C's folder,
// its lists; patch's output, folder, input, rejects, backups; unzip's
// folder; cpio's folder and archives; 7z's output and working folder,
// each named by its switch's first letter alone: -aoa names none), so a
// value glued to its letter (tar -cf/tmp/x.tar, -C/etc) is a file as
// the next word is, and another's (-p1, -b20) isn't
const ARCHIVED: Record<string, [string, string]> = {
  tar   : ["bCfFgHIKLNTVX", "CfgTX"],
  patch : ["BdDFgioprVYz", "BdiorY"],
  unzip : ["dP", "d"],
  "7z"  : ["ow", "ow"],
  cpio  : ["CDEFHIMOR", "DEFIO"],
};

// the shells, and the interpreters, that run a script or code given them;
// the shells whose language isn't bash's (their scripts can't be read)
const SHELLS = new Set(["sh", "bash", "dash", "zsh", "ksh", "ash", "mksh", "fish", "csh", "tcsh", "nu", "pwsh", "xonsh"]);
const INTERPS = /^(python[\d.]*|pypy[\d.]*|node|nodejs|bun|deno|perl|ruby|php|lua|luajit|Rscript|osascript|tclsh|wish|groovy|julia|elixir|erl|ts-node|tsx)$/;
const ODD = new Set(["fish", "csh", "tcsh", "nu", "pwsh", "xonsh"]);

// an interpreter's long options giving its code inline (node --eval=x,
// erl -eval x); its short ones are by interpreter (inline_letters)
const INLINE = /^(--eval|--print|--exec|-eval)(=|$)/;

// inline code (python -c, node -e, a heredoc into an interpreter) that
// names what can run a program, change files, reach the network or read
// a secret: asked. Its names as whole words (not evaluate, execute, nor
// a URL's http://)
const RISKY = /\b(system|popen|spawn\w*|exec(?:Sync|File\w*|[lv]\w*|a\w*)?|eval|subprocess|child_process|shutil|rmtree|unlink\w*|remove|rmdir|rename\w*|chmod|chown|kill|socket|urllib\d?|requests|httpx?|fetch|curl|wget|writeFile\w*|appendFile\w*|write_text|write_bytes|__import__|getattr|importlib|compile|ctypes)\b(?!:\/\/)|\b(Deno\.\w+|Bun\.(spawn\w*|write|file|\$)|fs\.\w+|os\.\w+|open\s*\([^)]*['"][wax+])|\bimport\s*\(|\brequire\s*\(\s*['"](node:)?(fs|child_process|net|https?|http2|dgram|dns|tls|vm|worker_threads|cluster|inspector)\b|\bfrom\s+['"](node:)?(fs|child_process|net|https?|dgram|vm|worker_threads)\b|%x[^\w\s]|\bqx\s*[^\w\s]|\bSystem\.\w+|\bFile\.(rm|write|cp|rename|chmod)\w*|\brm\s*\(|(?<![\w)$])\.(env|ssh|aws|netrc|gnupg|git-credentials)\b|\bid_(rsa|dsa|ecdsa|ed25519)\b|\bcredentials\b|\.(pem|key)['"]/;

// inline code that names a secret (.env but its examples, a key or
// credential store, a key file): asked in every mode but yolo, as
// reading it any other way is
const SECRET_CODE = /(?<![\w)$])\.(env(?!\.(example|sample|template)\b)|ssh|aws|netrc|gnupg|git-credentials)\b|\bid_(rsa|dsa|ecdsa|ed25519)\b|\bcredentials\b|\.(pem|key)['"]/;

// the interpreters whose backticks run a command (perl -e 'print `id`')
const TICKS = /^(perl|ruby|php|julia)/;

// the programs that run a command given in their words (strace cmd,
// parallel ...): asked, as illi doesn't read what they run; tmux's,
// screen's, perf's and direnv's listings only read (RUNS_READ)
const RUNNERS = new Set([
  "chrt", "taskset", "numactl", "firejail", "bwrap", "systemd-run", "xvfb-run", "dbus-run-session", "dbus-launch",
  "script", "runuser", "chroot", "nsenter", "unshare", "strace", "ltrace", "valgrind", "gdb", "lldb", "perf", "entr",
  "watchexec", "nodemon", "parallel", "sem", "busybox", "toybox", "expect", "tmux", "screen", "sg", "newgrp",
  "caffeinate", "proxychains", "proxychains4", "torsocks", "torify", "faketime", "direnv", "rlwrap", "cpulimit",
  "prlimit", "systemd-inhibit", "cgexec", "ssh-agent",
]);
const RUNS_READ: Record<string, RegExp> = {
  tmux   : /^(ls|list-\w+|has-session|has|capture-pane|capturep|display-message|display|show-\w+|show|info)$/,
  perf   : /^(report|list|annotate|diff|evlist|help)$/,
  direnv : /^(status|version|help)$/,
};

// the programs that run a folder's own code (its Makefile, package.json's
// scripts, build.rs, ...): run in a folder outside the project, asked
const BUILDS = new Set([
  "make", "gmake", "just", "npm", "pnpm", "yarn", "bun", "npx", "bunx", "cargo", "go", "gradle", "mvn", "rake", "mix",
  "composer", "poetry", "uv", "pytest", "tox", "nox", "deno", "dotnet", "swift",
]);

// the cloud CLIs: their verbs that only read (aws ec2 describe-instances,
// gcloud config list), and those that act; one with no verb that reads,
// or any that acts, is asked (bare vercel deploys)
const CLOUDS = new Set(["aws", "gcloud", "az", "doctl", "fly", "flyctl", "vercel", "netlify", "heroku", "firebase", "wrangler", "serverless", "sls", "railway"]);
const CLOUD_READ = /^(describe|list|ls|get|show|logs?|status|whoami|info|inspect|view|search|wait|head|help|version|find|history|tail|check|validate|explain|print|cat|query|dev)(-[\w-]*)?$/;
const CLOUD_ACTS = /^(create|delete|deploy|destroy|put|update|remove|rm|terminate|stop|start|restart|reboot|set|unset|apply|scale|cp|mv|sync|release|promote|rollback|add|up|down|run|invoke|exec|ssh|scp|login|logout|auth|configure|publish|attach|detach|import|purge|enable|disable|modify|reset|revoke|grant|tag|untag|copy|move|upload|mb|rb|send|submit|cancel|resize|replace|patch|associate|disassociate|register|deregister|link|unlink|init|open|secrets?|env)(-[\w-]*)?$/;

// the verbs that delete for good on another computer, of the cloud CLIs,
// the clusters' and infrastructure's and GitHub's: bare (gcloud ...
// delete, aws s3 rm and rb, kubectl delete, terraform destroy, helm
// uninstall, heroku apps:destroy: each part of a topic:command), or
// saying what (aws ec2 delete-vpc, terminate-instances, gh release
// delete-asset), only where the verb's place is known (a name such as
// delete-handler is no verb); none under a CLI's own settings, kept on
// this computer (kubectl config delete-context, gh alias delete). The
// options before the verb that take the next word: aws's, the
// clusters' and infrastructure's (kubectl -n prod delete, pulumi -s dev
// destroy), gh's repository
const GONE = /^(delete|destroy|terminate|purge|remove|rm|rb|uninstall)$/;
const GONE_OF = /^(delete|terminate|purge)-[\w-]+$/;
const OWN = /^(config|configure|configurations|auth|alias|extension|ext)$/;
const AWS_VALUED = /^(--region|--profile|--output|--endpoint-url|--query|--color|--ca-bundle|--cli-read-timeout|--cli-connect-timeout|--cli-binary-format)$/;
const INFRA_VALUED = /^(-n|--namespace|--context|--kubeconfig|--cluster|--user|-s|--server|--token|--as|--kube-context|-C|--cwd|--stack)$/;
const GH_VALUED = /^(-R|--repo)$/;

// the folders inside a project rebuilt by its tools (and Python's
// *.egg-info: rebuilt_name): deleted whole freely
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

// the dependency caches, read freely in auto (the packages' sources a
// model looks up): those kept in home (cargo's and go's where their
// variables put them), and a site-packages or node_modules folder
// anywhere
const DEPS = [
  ...[".cargo/registry", ".cargo/git", ".rustup/toolchains", "go/pkg/mod", ".npm", ".nvm/versions", ".bun/install/cache", ".pnpm-store",
    ".local/share/pnpm", ".yarn/berry/cache", ".cache/yarn", ".cache/deno", ".m2/repository", ".gradle/caches", ".gem", ".pub-cache/hosted",
    ".pub-cache/git", ".nuget/packages", ".pyenv/versions", ".rbenv/versions", ".local/share/uv", ".cache/uv", ".cache/pip"].map((d) => path.join(HOME, d)),
  ...(process.env.CARGO_HOME ? ["registry", "git"].map((d) => path.join(Projects_real(process.env.CARGO_HOME!), d)) : []),
  ...(process.env.RUSTUP_HOME ? [path.join(Projects_real(process.env.RUSTUP_HOME), "toolchains")] : []),
  ...(process.env.GOMODCACHE || process.env.GOPATH ? [Projects_real(process.env.GOMODCACHE || path.join(process.env.GOPATH!.split(":")[0], "pkg/mod"))] : []),
];
const DEPS_PARTS = new Set(["site-packages", "dist-packages", "node_modules"]);

// a plugin's files read only on asking: where the user's tokens may be
// pasted (its MCP servers, its settings, its manifest's folder)
const PLUGIN_KEPT = [".mcp.json", "settings.json", ".claude-plugin"];

// secrets: files by name anywhere (.env files but the examples, keys,
// logins, and those named for the credentials, token or secrets they
// hold, but code and docs: tokens.ts, secrets.md), key and credential
// stores, other agents' logins (Claude Code's, Codex's, opencode's: by
// their place) and browser profiles under home, files of the system, and
// illi's logins (its login.json; its mcp.json, whose servers' tokens may
// be pasted in)
const SECRET_NAME = /^(\.env(\.(?!(example|sample|template)$)[^/]+)?|\.netrc|\.pgpass|\.git-credentials|\.npmrc|\.pypirc|\.vault-token|auth\.json|id_(rsa|dsa|ecdsa|ed25519)(_sk)?|.+\.(pem|key|p12|pfx|keystore|jks|kdbx))$/;
const SECRET_WORD = /(^|[._-])(credentials?|token|secrets?)([._-]|$)/i;
const CODE = /\.(m?[jt]sx?|c[jt]s|py|rs|go|java|kt|rb|php|c|cc|cpp|h|hpp|cs|swift|scala|lua|exs?|md|mdx|rst|html?|css|scss|vue|svelte|sh|snap|map)$/i;
const SECRET_HOME = [
  ".ssh", ".aws", ".gnupg", ".kube", ".docker", ".azure", ".config/gh/hosts.yml", ".config/gcloud", ".config/hub", ".config/op",
  ".config/sops", ".claude.json", ".password-store", ".cargo/credentials", ".cargo/credentials.toml", ".terraform.d", ".gem/credentials",
  ".mozilla", ".thunderbird", ".config/google-chrome", ".config/chromium", ".config/BraveSoftware", "Library/Keychains",
  "Library/Application Support/Google/Chrome", ".claude/.credentials.json", ".codex/auth.json", ".local/share/opencode/auth.json",
];
const SECRET_SYSTEM = ["/etc/shadow", "/etc/gshadow", "/etc/sudoers", "/etc/sudoers.d", "/etc/ssh"];
const SECRET_ILLI = /^(login|mcp)\.json$/;

// home's secret stores, each where it is named and where a link there
// leads (~/.ssh linked to another disk, ~/.config/gh to dotfiles)
const HOME_STORES = [...new Set(SECRET_HOME.flatMap((d) => [path.join(HOME, d), real(path.join(HOME, d))]))];

// the secret stores a folder outside the project may hold: home's, the
// other agents' logins (opencode's where its data is), illi's logins
const STORES = [
  ...HOME_STORES, real(config.OPENCODE_LOGIN), real(config.OWN_LOGIN), ...config.MCPS.map(real),
  ...(config.LOGIN_SET === null ? [] : [real(config.LOGIN_SET)]),
];

// protected inside the project (asked before a write): folders and
// files that configure tools that run code, or what illi reads; and,
// for a project that holds home, home's own (~/.local/bin, ~/bin: not a
// project's bin/)
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

// git's subcommands that only read; those whose words are files (a
// clone's but its URL; worktree's, submodule's and bundle's past their
// verb); those whose words never are (names of branches and tags,
// revisions); any other's are files if they exist, or hold a wildcard
// or a part starting with a dot (no ref's name can), as git tells a file
// from a revision (git checkout main, git log src '*.ts', git diff .env;
// ..main a range), checkout's and reset's past their first (a revision,
// then files), show's and cat-file's after a revision's colon
// (HEAD:.env), and every one's after -- (config's are keys and push's
// refs, never); of those taking files, the ones that only read them
// (stage, commit); the options of a subcommand that take the next word
// (a branch's name, checkout -b, switch -c; a message, a key, a
// revision; a message's file, -F: read), -m's elsewhere; its own options
// that take the next word (git -C dir, -c k=v, --git-dir x), so none
// hides the subcommand, and push's (-o ci.skip), so none is taken for
// its remote or a ref
const GIT_READ = new Set([
  "status", "log", "diff", "show", "blame", "annotate", "shortlog", "describe", "rev-parse", "rev-list", "ls-files",
  "ls-tree", "ls-remote", "cat-file", "grep", "show-ref", "for-each-ref", "merge-base", "name-rev", "count-objects",
  "check-ignore", "check-attr", "check-ref-format", "var", "help", "version", "whatchanged", "range-diff", "diff-tree",
  "diff-files", "diff-index", "cherry", "verify-commit", "verify-tag", "fsck", "show-branch", "get-tar-commit-id",
]);
const GIT_FILES = /^(add|rm|mv|restore|commit|apply|am|clone|init|worktree|submodule|bundle|ls-files|check-ignore|check-attr)$/;
const GIT_REFS = /^(branch|tag|switch|merge|rebase|cherry-pick|revert|reflog|notes|describe|name-rev|update-ref|symbolic-ref|show-ref|for-each-ref|merge-base|cherry|range-diff|verify-commit|verify-tag|replace)$/;
const GIT_STAGES = /^(add|commit)$/;
const GIT_SUB_VALUED: Record<string, RegExp> = {
  checkout : /^(-b|-B|--orphan)$/,
  switch   : /^(-c|-C|--create|--force-create|--orphan)$/,
  worktree : /^(-b|-B|--reason)$/,
  restore  : /^(-s|--source)$/,
  clone    : /^(-o|--origin|-b|--branch|-u|--upload-pack|--reference|--reference-if-able|--separate-git-dir|--template|--depth|--shallow-since|--shallow-exclude|-c|--config|-j|--jobs|--filter|--bundle-uri)$/,
  commit   : /^(-m|--message|-F|--file|-t|--template|-c|-C|--reuse-message|--reedit-message|--author|--date|--fixup|--squash)$/,
  tag      : /^(-m|--message|-F|--file|-u|--local-user)$/,
  merge    : /^(-m|--message|-F|--file|-s|--strategy|-X|--strategy-option)$/,
  notes    : /^(-m|--message|-F|--file|-c|-C|--reuse-message|--reedit-message|--ref)$/,
};
const GIT_MESSAGES = /^(-F|--file|-t|--template)$/;
const GIT_VALUED = /^(-C|-c|--git-dir|--work-tree|--namespace|--config-env|--attr-source|--shallow-file)$/;
const PUSH_VALUED = /^(-o|--push-option|--repo|--receive-pack|--exec)$/;

// the git config keys that make git run a program, however set (git
// config, git -c): a hook folder, a monitor, a pager, an editor, a
// program by its name's end (sshCommand, sendmailCmd, credential.helper,
// gpg.program, packObjectsHook), a merge driver, a diff's textconv or
// external, a filter, a tool's path, a remote's uploadpack (run here for
// one on this computer), the ext:: transport allowed, a file of keys
// that may (include.path); an alias or a submodule's update does if its
// value starts with ! (git_set). careful's besides: any alias, and what
// changes where git reaches (a url, a protocol, a proxy, the worktree)
const GIT_PROGRAMS = /^(core\.(hookspath|fsmonitor|askpass|gitproxy|pager|editor)|sequence\.editor|pager\..+|diff\.external|interactive\.difffilter|protocol\.(ext\.)?allow|filter\..+\.(clean|smudge|process)|(include|includeif\..+|mergetool\..+|difftool\..+|man\..+|browser\..+)\.path|.+\.(\w*command|\w*cmd|helper|\w*program|driver|textconv|\w*hook|uploadpack|receivepack))$/i;
const GIT_RUNS = /^(core\.(pager|editor|sshcommand|fsmonitor|hookspath|askpass|gitproxy|worktree)|alias\.|include\.|includeif\.|diff\.external|sequence\.editor|uploadpack\.|receivepack\.|protocol\.|url\.|http\..*proxy|.*\.(textconv|command|cmd|helper|program|driver|process|clean|smudge))/i;

// git's own config outside a repository (home's, where a link there
// leads too, and the system's): written, asked as a repository's is
const GIT_CONFIGS = [...new Set([".gitconfig", ".config/git/config"].flatMap((f) => [path.join(HOME, f), real(path.join(HOME, f))])), "/etc/gitconfig"];

// Claude Code's own folder whatever its name (home's .claude where a link
// there leads, $CLAUDE_CONFIG_DIR), besides any named .claude
const CLAUDE_DIRS = [...new Set([real(path.join(HOME, ".claude")), ...(process.env.CLAUDE_CONFIG_DIR ? [real(path.resolve(process.env.CLAUDE_CONFIG_DIR))] : [])])];

// the programs that can wipe a disk: make a file system, partition,
// erase, encrypt
const DISKS = /^(mkfs(\..+)?|mke2fs|mkdosfs|mkntfs|mkexfatfs|mkswap|wipefs|blkdiscard|fdisk|sfdisk|cfdisk|gdisk|sgdisk|parted|cryptsetup)$/;

// the volume managers (LVM's, its programs' names its verbs: lvremove as
// lvm lvremove; ZFS's; macOS's diskutil, its apfs, cs and ar verbs those
// after them; the device mapper's dmsetup), by verb: those that only
// read, run; those that destroy, make, shrink or overwrite a volume can
// wipe a disk (lvremove, zfs destroy and rollback, zpool create,
// diskutil eraseDisk, dmsetup remove); any other changes the system
// (lvextend, zfs snapshot, diskutil unmount)
const LVM = /^(lv|vg|pv)(s|display|scan|create|remove|resize|reduce|extend|convert|change|rename|split|merge|move|ck|import|importclone|export|cfgbackup|cfgrestore|mknodes)$/;
const VOLUMES: Record<string, [RegExp, RegExp]> = {
  lvm      : [/^((lv|vg|pv)(s|display|scan)|lvmdiskscan|lvmconfig|dumpconfig|config|fullreport|formats|segtypes|types|tags|systemid|version|help)$/, /^(lv(create|remove|resize|reduce|convert)|vg(create|remove|reduce)|pv(create|remove|resize))$/],
  zfs      : [/^(list|get|holds|userspace|groupspace|projectspace|diff|send|wait|help|version)$/, /^(destroy|rollback|receive|recv)$/],
  zpool    : [/^(list|status|iostat|get|history|events|wait|help|version)$/, /^(create|destroy|add|attach|replace|labelclear)$/],
  diskutil : [/^(list|info|information|activity|listFilesystems|verifyVolume|verifyDisk|help)$/i, /^(erase\w*|zeroDisk|randomDisk|secureErase|partitionDisk|reformat|resizeVolume|splitPartition|mergePartitions|addPartition|create\w*|delete\w*)$/i],
  dmsetup  : [/^(ls|info|status|table|deps|targets|version|help|udevcookies)$/, /^(remove|remove_all|create|load|reload|wipe_table)$/],
};

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
    const look: Look = { denied: [], flags: [], changes: [], whole: "", links: [] };
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
      look.flags.push({ why: "illi's check of it failed (" + String(err?.message ?? err) + ")", kind: "shell", subject: JSON.stringify(input ?? {}), wide: null, tier: "all" });
    }
    return verdict(where, look);
  }

  // one of Claude Code's tools (its permission prompt: Tools.approve), as
  // illi's would be judged: Bash a shell command; Read, LS, Grep and Glob
  // reads (a search of its folder: a glob's fixed head, as /etc/** looks
  // in /etc); Write, Edit, MultiEdit and NotebookEdit changes; an MCP tool
  // by its name (illi's own, mcp__illi__..., judged as it reaches illi);
  // those that touch nothing here run (HOSTED); any other is asked once,
  // as an MCP tool not marked as only reading is (look_tool)
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
    const look: Look = { denied: [], flags: [], changes: [], whole: "", links: [] };
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
  // ending in " *" matches the text without its words too. Strict: a *
  // covers no ; | & newline ` ( ) < or >, so it can't reach into another
  // command, a command's output or a redirection
  export function matches(pattern: string, text: string, strict = false): boolean {
    const star = strict ? "[^;|&\\n`()<>]*" : "[\\s\\S]*";
    const body = pattern.replace(/\\\*|\*|[.+?^${}()|[\]\\]/g, (c) => (c === "*" ? star : c === "\\*" ? "\\*" : "\\" + c));
    const re = pattern.endsWith(" *") && !pattern.endsWith("\\ *") ? body.slice(0, -(" " + star).length) + "(?: " + star + ")?" : body;
    return new RegExp("^" + re + "$").test(text);
  }

  // a command as an exact grant names it: root marked, its assignments,
  // words and output redirections unquoted, joined by spaces, quoted
  // again where needed; a word that expands (a variable, a command's
  // output, a ~) as written, so the grant reads as typed and holds no
  // value of the environment (wrappers such as timeout left out: they
  // don't change what runs). Given the folder it is judged from, one a cd
  // moved it from is named too (cd /x && git push --force)
  export function norm(part: Part, cwd?: string): string {
    const word = (w: Word) => (w.dynamic || w.alts.length !== 1 || /[$`]|^~/.test(w.raw) ? w.raw : quote(w.alts[0]));
    const env = part.env.map((e) => e.name + "=" + word(e.value));
    const outs = part.redirs.filter((r) => !r.op.startsWith("<")).map((r) => (r.num ?? "") + r.op + word(r.target));
    const run = [...(part.root ? ["sudo"] : []), ...env, ...part.argv.map(word), ...outs].join(" ");
    return cwd === undefined || part.cwd === null || part.cwd === cwd ? run : "cd " + quote(part.cwd) + " && " + run;
  }

}

// Verdicts
// ========

// what is left after the rules and grants, by the mode: the flags of the
// tiers it asks (asked; yolo: the user's ask rules and changes to illi's
// own config). "Don't ask again" keeps a family or folder only when every
// flag offers one: by a dangerous flag beside an outside folder's, the
// exact command alone, so a yes to it doesn't let the folder be written
// freely after; nothing for inline code (once)
function verdict(where: Where, look: Look): Verdict {
  if (look.denied.length > 0) {
    return { $: "deny", why: uniq(look.denied).join("; "), rule: true, exact: [] };
  }
  const rules = look.flags.filter((f) => f.rule === true);
  const flags = look.flags.filter((f) => f.rule === true || (asked(where.mode, f.tier) && !granted(where, f)));
  const changes = where.mode === "read-only" || where.mode === "ask" ? look.changes.filter((f) => !granted(where, f)) : [];
  const exact = (fs: Flag[]) => uniq(fs.map((f) => f.kind + "=" + f.subject));
  if (where.mode === "read-only" && changes.length > 0) {
    return { $: "deny", why: "read-only mode: " + uniq(changes.map((f) => f.why)).join("; "), rule: false, exact: exact([...changes, ...flags]) };
  }
  const all = [...flags, ...changes];
  if (all.length === 0) {
    return { $: "allow" };
  }
  const always = rules.length > 0 || all.some((f) => f.once === true) ? [] : all.some((f) => f.wide === null) ? exact(all) : uniq(all.map((f) => f.wide!.grant));
  return { $: "ask", why: uniq(all.map((f) => f.why)).join("; "), always, exact: exact(all) };
}

// whether a mode asks a flag of a tier
function asked(mode: Mode, tier: Tier): boolean {
  return tier === "self" || (mode !== "yolo" && (tier === "all" || (tier === "auto") === (mode === "auto")));
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
// (a root command's own text names its sudo), strictly if asked (a
// command illi can't read: Guard.matches)
function rule_of(where: Where, kind: Kind, any: string[], own: string[], strict = false): Rule | null {
  const rules = Object.entries(where.rules[kind] ?? {}).map(([p, r]) => [kind === "read" || kind === "write" ? rule_path(p, where.top) : p, r] as const);
  const hit = (r: Rule, texts: string[]) => rules.some(([p, x]) => x === r && texts.some((t) => Guard.matches(p, t, r === "allow" && strict)));
  return hit("deny", any) ? "deny" : hit("ask", any) ? "ask" : hit("allow", own) ? "allow" : null;
}

// a path rule's pattern, absolute: ~ home, a relative one from the top
function rule_path(p: string, top: string): string {
  return p.startsWith("~/") || p === "~" ? HOME + p.slice(1) : p.startsWith("/") || p.startsWith("*") ? p : path.join(top, p);
}

// Shell
// =====

// a shell command: the user's rules on it whole first (deny refuses it;
// one illi can't read is asked, but an allow rule whose stars cover no
// other command lets it run), then each of its parts
function look_shell(where: Where, look: Look, command: string): void {
  const parts = Shell.parse(command, where.cwd);
  const text = command.trim();
  const rule = rule_of(where, "shell", [text], [text], true);
  if (rule === "deny") {
    look.denied.push("your rules refuse " + clip(text));
    return;
  }
  if (typeof parts === "string") {
    if (rule === "ask") {
      look.flags.push({ why: "your rules ask about " + clip(text), kind: "shell", subject: text, wide: null, tier: "all", rule: true });
    }
    if (rule !== "allow") {
      look.flags.push({ why: "illi can't follow this command: " + parts, kind: "shell", subject: text, wide: null, tier: "all" });
    }
    return;
  }
  look.whole = text;
  parts.forEach((part) => look_part(where, look, part, 0));
}

// a part's flags and change: by the user's rules first (an allow rule
// covers the command itself, not what its assignments set or its
// redirections write), then each value its command's name can take (a
// loop's), its redirections, assignments and files (what a command that
// may change things reads may be what it writes: use_look), and the
// folder it runs in: a secret store (cd ~/.ssh && ls), and, in auto, one
// outside the project read by a command that may change things (cd ~/x
// && npm test runs that folder's code) or one holding a secret store
// read by any (said only if nothing else is). An exact grant names
// the part as it runs (Guard.norm: git push --force, and the folder a cd
// moved it to), but one whose input comes from elsewhere (a pipe, xargs,
// a file or heredoc read in), whose words expand as it runs ($x, $(...),
// <(...)) or whose folder is known only then names the whole command:
// `sh` alone would let any code piped into it run, `rm -rf $x` any folder
function look_part(where: Where, look: Look, part: Part, depth: number): void {
  const words = [...part.argv, ...part.env.map((e) => e.value), ...part.redirs.map((r) => r.target)];
  const whole = part.piped || part.fed || part.cwd === null || part.redirs.some((r) => r.op.startsWith("<")) || words.some((w) => w.dynamic || w.fd || /[$`]/.test(w.raw));
  const exact = whole ? look.whole : Guard.norm(part, where.cwd);
  const bare = Guard.norm(part);
  const plain = part.text;
  const rule = rule_of(where, "shell", [plain, bare, exact, ...by_name(part)], part.root ? [bare, exact] : [plain, bare, exact]);
  if (rule === "deny") {
    look.denied.push("your rules refuse " + clip(bare));
    return;
  }
  const own = rule !== "allow";
  const flag: Flagger = (why, wide = null, tier = "careful", once = false) => look.flags.push({ why, kind: "shell", subject: exact, wide, tier, once });
  if (rule === "ask") {
    look.flags.push({ why: "your rules ask about " + clip(plain), kind: "shell", subject: exact, wide: null, tier: "all", rule: true });
  }
  const before = look.flags.length;
  if (part.root && own) {
    flag(clip(plain) + " runs as root", null, "all");
  }
  for (const e of part.env) {
    env_flag(e.name, e.value, flag);
  }
  const uses: Use[] = part.redirs.flatMap((r) => redir_use(r, part.cwd));
  const writes = uses.some((u) => u.write && !DEVS.test(u.word.alts[0]));
  let acts = false;
  const head = part.argv[0];
  if (head !== undefined && own) {
    const heads = head.dynamic || head.glob ? null : head.alts;
    if (heads === null) {
      flag("the command " + head.raw + " is named only as it runs", null, "all");
      acts = true;
    } else {
      for (const name of heads) {
        const one = { ...part, argv: [{ ...head, alts: [name] }, ...part.argv.slice(1)] };
        acts = look_command(where, look, one, uses, flag, depth) || acts;
      }
    }
  }
  for (const use of uses) {
    use_look(where, look, use, flag, acts);
  }
  if (head !== undefined && own && part.cwd !== null && !look.flags.slice(before).some((f) => f.tier === "all")) {
    const dir = real(part.cwd);
    path_why(where, dir, false, acts, true).filter((r) => r.tier !== "careful").forEach((r) => flag(r.why, r.wide ? folder_wide("read", dir) : null, r.wide ? "auto" : r.tier));
  }
  if (acts || writes) {
    const pattern = "shell:" + prefix(part);
    look.changes.push({ why: where.mode === "read-only" ? clip(plain) + " may change things" : "ask mode asks before " + clip(plain), kind: "shell", subject: exact, wide: where.mode === "ask" ? { kind: "shell", subject: exact, grant: pattern } : null, tier: "careful" });
  }
}

// a part's texts with its program's path cut to its name (/bin/rm -rf x
// as rm -rf x), so a deny or ask rule on a program holds wherever it lives
function by_name(part: Part): string[] {
  const head = part.argv[0];
  if (head === undefined || head.dynamic || head.alts.length !== 1 || !head.alts[0].includes("/")) {
    return [];
  }
  const base = path.basename(head.alts[0]);
  const text = part.text.startsWith(head.raw) ? [base + part.text.slice(head.raw.length)] : [];
  return [...text, Guard.norm({ ...part, argv: [Shell.lit(base), ...part.argv.slice(1)] })];
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
// uses; a program named by its path, where it is, not where a link
// there leads: a project's .venv/bin/python is the project's, read if
// it is outside); whether it changes things
function look_command(where: Where, look: Look, part: Part, uses: Use[], flag: Flagger, depth: number): boolean {
  const head = part.argv[0];
  const alt = head.alts[0];
  const base = path.basename(alt);
  const name = Shell.program(head);
  const args = part.argv.slice(1);
  const text = clip(part.text);
  const use = (w: Word, write: boolean, into?: Word) => uses.push({ word: w, write, cwd: part.cwd, into });
  if (alt.includes("/") && name === "") {
    const file = part.cwd === null && !path.isAbsolute(alt) ? null : placed(path.resolve(part.cwd ?? "/", alt));
    if (file === null || (!under(file, where.top) && !where.plugins.some((d) => under(file, d)))) {
      flag(text + " runs a program from " + (file === null ? "a folder known only as it runs" : shown(path.dirname(file), where.top)));
      use(head, false);
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
    if (/^(e|f|z)?grep$|^(rg|ag|ack)$/.test(name)) {
      search_use(name, args, use);
    } else {
      args_use(args, false, use);
    }
    return false;
  }
  if (WRITERS.has(base)) {
    args_use(args, true, use);
    if (base === "mv") {
      const into = copier_into(args);
      land(base, args, positional(args).filter((w) => w !== into), into, part.cwd, use);
    }
    return true;
  }
  if (COPIERS.has(base)) {
    const into = copier_into(args);
    const dirs = base === "install" && args.some((a) => /^(-d|--directory)$/.test(a.alts[0]));
    const pos = positional(args).filter((w) => w !== into);
    if (into !== null) {
      use(into, true);
    }
    if (base === "ln") {
      look.links.push(...ln_use(args, pos, into, part.cwd, uses));
    } else {
      pos.forEach((w, k) => use(w, dirs || (into === null && k === pos.length - 1)));
    }
    if (!dirs) {
      land(base, args, pos, into, part.cwd, use);
    }
    return true;
  }
  args_use(args, false, use);
  return true;
}

// the danger list, by the command's base name (wherever it lives): its
// flags pushed, and whether it changes things (null: not on the list,
// judged as any other)
function command_danger(where: Where, look: Look, part: Part, base: string, args: Word[], use: (w: Word, write: boolean, into?: Word) => void, flag: Flagger, depth: number): boolean | null {
  const text = clip(part.text);
  const xs = args.map((a) => (a.dynamic ? "" : a.alts[0]));
  const has = (...names: string[]) => xs.some((x) => names.includes(x) || names.some((n) => n.startsWith("--") && x.startsWith(n + "=")));
  const short = (c: string) => xs.some((x) => /^-[a-zA-Z]+$/.test(x) && x.includes(c));
  const pos = positional(args);
  const sub = pos[0]?.alts[0] ?? "";
  const verbs = pos.map((w) => (w.dynamic ? "" : w.alts[0]));
  const asks = xs.length === 1 && /^(--version|--help|-h|-V|version|help)$/.test(xs[0]);
  const given = asks ? null : runs_given(base, sub, xs, has);
  if (given !== null) {
    flag(text + given);
  }
  if (BUILDS.has(base) && !asks && (part.cwd === null || !under(real(part.cwd), where.top))) {
    flag(text + " runs the code of " + (part.cwd === null ? "a folder known only as it runs" : shown(real(part.cwd), where.top)));
  }
  const volume = LVM.test(base) ? "lvm" : base;
  switch (DISKS.test(base) ? "mkfs" : VOLUMES[volume] !== undefined ? "volume" : base) {
    case "make":
    case "gmake": {
      make_look(where, part, args, flag);
      return null;
    }
    case "git": {
      return git_look(part, args, use, flag);
    }
    case "tar":
    case "patch":
    case "unzip":
    case "7z":
    case "cpio": {
      archive_look(part, base, args, use, flag);
      return true;
    }
    case "volume": {
      const [reads, wipes] = VOLUMES[volume];
      const verb = volume !== base ? base : /^(apfs|ap|cs|coreStorage|appleRAID|ar)$/i.test(base === "diskutil" ? sub : "") ? verbs[1] ?? "" : sub;
      if (!reads.test(verb) && !asks) {
        flag(text + (wipes.test(verb) ? " can wipe a disk" : " changes the system"), null, "all");
      }
      return !reads.test(verb) && !asks;
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
        const targets = pos.flatMap((w) => named(w, part.cwd, true) ?? [null]);
        const vital = targets.find((f) => f !== null && vital_of(where, f));
        if (vital !== undefined) {
          flag(text + " deletes " + shown(vital!, where.top) + ", a folder that matters", null, "all");
        } else if (!pos.every((w) => rebuilt(where, w, part.cwd))) {
          flag(text + " deletes " + pos.map((w) => w.raw).join(" ") + " and all in it", null, homely(where));
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
            flag(text + " writes to a whole device", null, "all");
          }
        }
      }
      return true;
    }
    case "mkfs": {
      flag(text + " can wipe a disk", null, "all");
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
        flag(text + " stops every process you own", null, "all");
      }
      return true;
    }
    case "shutdown":
    case "reboot":
    case "poweroff":
    case "halt":
    case "init":
    case "telinit": {
      flag(text + " turns the computer off or restarts it", null, "all");
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
        flag(text + " changes the system", null, "all");
      }
      return !reads;
    }
    case "curl":
    case "wget": {
      return net_look(part, base, args, use, flag);
    }
    case "ssh":
    case "ssh-copy-id":
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
      land(base, args, pos, null, part.cwd, use);
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
        flag(text + " gives a container the whole computer", null, "all");
      }
      for (const m of mounts(args, xs)) {
        const files = named(m, part.cwd);
        const out = files?.find((f) => !under(f, where.top) && !SCRATCH.some((d) => under(f, d)));
        if (files === null || out !== undefined) {
          flag(text + " gives a container " + (files === null ? "a folder known only as it runs" : shown(out!, where.top)), null, "all");
        }
      }
      if (verb === "push" || (/^(image|manifest|buildx)$/.test(verb) && pos[1]?.alts[0] === "push") || (pos.some((w) => w.alts[0] === "build") && has("--push"))) {
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
      const [head = "", next = ""] = positional(args, INFRA_VALUED).map((w) => (w.dynamic ? "" : w.alts[0]));
      const reads = /^(get|describe|logs|top|explain|version|api-resources|api-versions|cluster-info|plan|validate|fmt|show|output|init|list|ls|status|history|template|lint|search|repo|preview|whoami|config)$/.test(head) && !(head === "config" && /^(set|use-context|delete)/.test(next));
      if (!reads && (GONE.test(head) || (/^(stack|workspace)$/.test(head) && GONE.test(next)) || has("-destroy"))) {
        flag(text + " deletes real infrastructure", null, "all");
      } else if (!reads) {
        flag(text + " changes real infrastructure");
      }
      return !reads;
    }
    case "gh": {
      const verb = pos[1]?.alts[0] ?? "";
      const lost = gh_lost(args, xs, has);
      if (sub === "auth" && (verb === "token" || has("--show-token", "-t"))) {
        flag(text + " prints your GitHub token: its output may hold secrets", null, "all");
      } else if (lost !== null) {
        flag(text + lost, null, "all");
      } else if (sub === "api" ? has("-X", "--method", "-f", "-F", "--field", "--raw-field", "--input") || xs.some((x) => /^-X./.test(x)) : /^(create|merge|close|delete|edit|comment|review|reopen|ready|run|set|remove|upload|rename|archive|transfer|fork|sync|deploy|enable|disable|cancel|rerun|lock|unlock|pin|unpin|install|upgrade|login|logout|refresh|setup-git|ssh)$/.test(verb)) {
        flag(text + " acts on GitHub as you", { kind: "shell", subject: Guard.norm(part), grant: "shell:" + prefix(part) });
      }
      return true;
    }
  }
  if (CLOUDS.has(base)) {
    const reads = asks || (verbs.some((x) => CLOUD_READ.test(x)) && !verbs.some((x) => CLOUD_ACTS.test(x)));
    if (!reads && gone(base, args)) {
      flag(text + " deletes cloud resources", null, "all");
    } else if (!reads) {
      flag(text + " changes cloud resources");
    } else if (verbs.some((x) => /secret|token|password|credential/i.test(x))) {
      flag(text + " may print a secret");
    }
    return !reads;
  }
  if (publishes(base, sub, xs)) {
    flag(text + " publishes for everyone");
    return true;
  }
  const back = unpublishes(base, verbs);
  if (back !== null) {
    flag(text + (back ? " deletes a published package for everyone" : " changes a published package for everyone"), null, back ? "all" : "careful");
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

// git: its own options (-C, -c, --git-dir: GIT_VALUED, their values
// skipped; -c's key and --exec-path's folder, and a remote's program
// given, --upload-pack, asked in auto too, as git config's), the
// subcommand's danger, and whether it only reads; its files (written,
// but those it stages), its positional words as the subcommand takes
// them (GIT_FILES, GIT_REFS: a branch or tag named token-x is no file),
// but one known only as it runs: a revision (git diff $(git merge-base
// ...)), unless after -- or the subcommand takes files; a message's file
// read (commit -F); push's, config's, clone's, worktree's, submodule's
// and bundle's say which of theirs are (paths)
function git_look(part: Part, args: Word[], use: (w: Word, write: boolean) => void, flag: Flagger): boolean {
  const text = clip(part.text);
  let k = 0;
  for (; k < args.length; k++) {
    const a = args[k];
    const x = a.dynamic ? "" : a.alts[0];
    const eq = /^--[\w-]+=/.exec(x)?.[0] ?? "";
    const opt = eq === "" ? x : eq.slice(0, -1);
    if (!GIT_VALUED.test(opt)) {
      if (/^--exec-path=/.test(x)) {
        flag(text + " changes where git finds the programs it runs", null, "all");
      } else if (!x.startsWith("-") || a.dynamic) {
        break;
      }
      continue;
    }
    const v = eq === "" ? args[++k] : Shell.cut(a, eq.length);
    if (v === undefined) {
      continue;
    }
    if (opt === "-C" || opt === "--git-dir" || opt === "--work-tree" || opt === "--shallow-file") {
      use(v, opt === "--git-dir" || opt === "--work-tree");
    } else if (opt === "-c" || opt === "--config-env") {
      const head = v.alts[0];
      const sets = v.dynamic ? [[head.includes("=") ? head.slice(0, head.indexOf("=")) : null, null]] : v.alts.map((kv) => (kv.includes("=") ? [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)] : [kv, "true"]));
      sets.forEach(([key, value]) => git_set(key, opt === "-c" ? value : null, text, flag));
    }
  }
  const sub = args[k]?.dynamic ? "" : args[k]?.alts[0] ?? "";
  const rest = args.slice(k + 1);
  const xs = rest.map((a) => (a.dynamic ? "" : a.alts[0]));
  const has = (...names: string[]) => xs.some((x) => names.includes(x) || names.some((n) => n.startsWith("--") && x.startsWith(n + "=")));
  const short = (c: string) => xs.some((x) => /^-[a-zA-Z]+$/.test(x) && x.includes(c));
  const pos = positional(rest, GIT_SUB_VALUED[sub]);
  const first = pos[0]?.alts[0] ?? "";
  let read = GIT_READ.has(sub);
  let paths: Word[] | null = null;
  switch (sub) {
    case "push": {
      push_look(rest, text, flag, Guard.norm(part));
      paths = positional(rest, PUSH_VALUED).slice(0, 1).filter((w) => !w.dynamic && w.alts.every((x) => /^[./]/.test(x)));
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
      const write = config_look(rest, text, flag);
      if (write && has("--global", "--system")) {
        flag(text + " changes git for every repository");
      }
      paths = rest.flatMap((a, j) => (xs[j] === "-f" || xs[j] === "--file" ? rest.slice(j + 1, j + 2) : /^--file=/.test(xs[j]) ? [Shell.cut(a, 7)] : []));
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
    case "clone": {
      paths = pos.filter((w) => w.dynamic || !/^[^/\s]*:/.test(w.alts[0]));
      break;
    }
    case "bundle": {
      paths = pos.slice(1, 2);
      break;
    }
    case "worktree": {
      read = first === "list";
      paths = first === "add" ? pos.slice(1, 2) : pos.slice(1);
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
      paths = first === "foreach" ? [] : pos.slice(first === "add" ? 2 : 1);
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
    case "rebase": {
      if (has("-x", "--exec") || xs.some((x) => /^-x./.test(x))) {
        flag(text + " runs a command at each commit");
      }
      break;
    }
    case "bisect": {
      if (first === "run") {
        flag(text + " runs a command at each step");
      }
      break;
    }
    case "difftool": {
      if (has("-x", "--extcmd") || xs.some((x) => /^-x./.test(x))) {
        flag(text + " runs a program on each change");
      }
      break;
    }
  }
  if (has("--upload-pack", "--receive-pack", "--exec") || ((sub === "clone" || sub === "ls-remote") && (has("-u") || xs.some((x) => /^-u./.test(x))))) {
    flag(text + " runs a program it's given", null, "all");
  }
  const o = sub === "format-patch" || sub === "archive";
  const outs = rest.flatMap((a, j) => (xs[j] === "--output" || xs[j] === "--output-directory" || (o && xs[j] === "-o") ? rest.slice(j + 1, j + 2) : /^--output(-directory)?=/.test(xs[j]) ? [Shell.cut(a, xs[j].indexOf("=") + 1)] : o && /^-o./.test(xs[j]) ? [Shell.cut(a, 2)] : []));
  outs.forEach((w) => use(w, true));
  if (/^(commit|tag|merge|notes)$/.test(sub)) {
    option_values(rest, GIT_MESSAGES).filter((w) => w.dynamic || w.alts[0] !== "-").forEach((w) => use(w, false));
  }
  const dash = rest.findIndex((a) => !a.dynamic && a.alts[0] === "--");
  const files = GIT_FILES.test(sub) || has("--no-index");
  const here = (w: Word) => part.cwd === null || w.alts.some((x) => /[*?[]/.test(x) || (!/^\.\.\.?[^./]/.test(x) && x.split("/").some((c) => c.startsWith("."))) || fs.existsSync(path.resolve(part.cwd!, x)));
  const file = (w: Word) => (dash >= 0 && rest.indexOf(w) > dash) || files || (!GIT_REFS.test(sub) && !w.dynamic && (here(w) || (/^(checkout|reset)$/.test(sub) && w !== pos[0])));
  const blobs = /^(show|cat-file)$/.test(sub) ? pos.filter((w) => !w.dynamic && !file(w) && /^[^:]*:./.test(w.alts[0])).map((w) => Shell.cut(w, w.alts[0].indexOf(":") + 1)) : [];
  (paths ?? [...pos.filter((w) => !outs.includes(w) && file(w)), ...blobs]).forEach((w) => use(w, !read && !GIT_STAGES.test(sub)));
  return !read || outs.length > 0;
}

// git push: what it deletes for good on the remote, each by every value
// its words can take (asked in every mode but yolo, exactly): its history
// rewritten (--force, -f in a cluster, --force-with-lease, a +ref; and
// --force-if-includes, only with one of those), its refs deleted
// (--delete, -d, an empty source :ref), mirrored or pruned (--mirror,
// --prune); else, or as a dry run (a word that is one in each value), it
// sends commits (git push *). A ref or option known only as it runs, or
// from xargs, is taken as plain
function push_look(rest: Word[], text: string, flag: Flagger, exact: string): void {
  const vals = rest.flatMap((a) => (a.dynamic ? [] : a.alts));
  const any = (re: RegExp) => vals.some((x) => re.test(x));
  const refs = positional(rest, PUSH_VALUED).slice(1).flatMap((w) => (w.dynamic ? [] : w.alts));
  const deletes = any(/^(--delete|-[a-zA-Z]*d[a-zA-Z]*)$/);
  const gone = deletes ? refs : refs.filter((r) => /^:./.test(r)).map((r) => r.slice(1));
  const dry = rest.some((a) => !a.dynamic && a.alts.every((x) => /^(--dry-run|-[a-zA-Z]*n[a-zA-Z]*)$/.test(x)));
  const lost = dry ? [] : [
    ...(any(/^--mirror$/) ? [" rewrites the remote's history and deletes what only it has"] : any(/^(--force|--force-with-lease(=.*)?|-[a-zA-Z]*f[a-zA-Z]*)$/) || refs.some((r) => r.startsWith("+")) ? [" rewrites the remote's history"] : []),
    ...(deletes || gone.length > 0 ? [" deletes " + (gone.join(" ") || "what it names") + " on the remote"] : []),
    ...(any(/^--prune$/) ? [" deletes the remote's branches this repository doesn't have"] : []),
  ];
  lost.forEach((why) => flag(text + why, null, "all"));
  if (lost.length === 0) {
    flag(text + " sends commits to a remote", { kind: "shell", subject: exact, grant: "shell:git push *" });
  }
}

// git config: whether it writes; each key it sets judged (git_set) with
// its value, past the options that take one (-f file, --type bool) and a
// verb (git config set k v); one renamed into place, or set in an editor
// (--rename-section, --edit), as one known only as it runs. Unset and
// removed keys run nothing
function config_look(rest: Word[], text: string, flag: Flagger): boolean {
  const xs = rest.map((a) => (a.dynamic ? "" : a.alts[0]));
  const has = (...names: string[]) => xs.some((x) => names.includes(x) || names.some((n) => n.startsWith("--") && x.startsWith(n + "=")));
  const words = positional(rest, /^(-f|--file|--blob|--type|--default|--comment|--value)$/);
  const verb = /^(get|list|set|unset|edit|rename-section|remove-section)$/.test(words[0]?.alts[0] ?? "") ? words[0].alts[0] : "";
  const [key, value] = verb === "" ? words : words.slice(1);
  const asks = has("--get", "--get-all", "--get-regexp", "--get-urlmatch", "--list", "-l", "--show-origin", "--show-scope", "--name-only") || verb === "get" || verb === "list";
  const write = !asks && (words.length >= 2 || has("--unset", "--unset-all", "--add", "--replace-all", "--rename-section", "--remove-section", "-e", "--edit") || verb === "set" || verb === "unset" || verb === "edit");
  if (!write || has("--unset", "--unset-all", "--remove-section") || verb === "unset" || verb === "remove-section") {
    return write;
  }
  if (has("--rename-section", "-e", "--edit") || verb === "rename-section" || verb === "edit" || key === undefined) {
    git_set(null, null, text, flag);
    return write;
  }
  const values = value === undefined ? ["true"] : value.dynamic ? [null] : value.alts;
  for (const k of key.dynamic ? [null] : key.alts) {
    values.forEach((v) => git_set(k, v, text, flag));
  }
  return write;
}

// a git config key set to a value (null: known only as it runs), judged:
// one that makes git run a program (GIT_PROGRAMS; an alias or a
// submodule's update of !...), in every mode but yolo, but if its value
// runs nothing (a pager or editor of QUIET's, as env_flag's; a yes or
// no; /dev/null; none of these as a path: a hook folder named true);
// careful's others (GIT_RUNS); a key known only as it runs, as one that
// makes git run a program
function git_set(key: string | null, value: string | null, text: string, flag: Flagger): void {
  if (key === null) {
    flag(text + " may set git config that makes git run a program", null, "all");
    return;
  }
  const quiet = value !== null && (value === "/dev/null" || (!/path$/i.test(key) && (QUIET.has(value) || /^(true|false|yes|no|on|off|[01])$/i.test(value))));
  const bang = /^(alias\..+|submodule\..+\.update)$/i.test(key) && (value === null || value.startsWith("!"));
  if (GIT_PROGRAMS.test(key) || bang) {
    if (!quiet) {
      flag(key + (/^include/i.test(key) ? " makes git read config from another file, which can run a program" : " makes git run a program"), null, "all");
    }
  } else if (GIT_RUNS.test(key)) {
    flag(text + " sets git config that changes what git runs");
  }
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

// a shell, an interpreter, source: its inline code (naming what can run,
// write, reach out or read a secret: flagged; an interpreter's naming a
// secret, in every mode but yolo; perl -pi's files written),
// its script (from outside the project: flagged), or, with neither, the
// code it reads from its input (stdin_look; a pipe's: flagged)
function runner_look(where: Where, look: Look, part: Part, base: string, args: Word[], use: (w: Word, write: boolean) => void, flag: Flagger, depth: number): boolean {
  const text = clip(part.text);
  const sourced = base === "source" || base === ".";
  const inline = sourced ? null : inline_code(base, args);
  if (inline !== null) {
    if (SHELLS.has(base) || inline.some((w) => w.dynamic || risky(base, w.alts.join("\n")))) {
      flag(text + " runs code illi can't check", null, "careful", true);
    }
    if (!SHELLS.has(base) && inline.some((w) => SECRET_CODE.test(w.alts.join("\n")))) {
      flag(text + " names a file that may hold secrets", null, "all", true);
    }
    const inplace = /^(perl|ruby)/.test(base) && args.some((a) => !a.dynamic && /^-[A-Za-z]*i/.test(a.alts[0]));
    positional(args).filter((w) => !inline.includes(w)).forEach((w) => use(w, inplace));
    return true;
  }
  const module = /^(python|pypy)/.test(base) ? args.findIndex((a) => a.alts[0] === "-m") : -1;
  if (module >= 0) {
    const rest = args.slice(module + 2);
    const xs = rest.map((a) => (a.dynamic ? "" : a.alts[0]));
    const has = (...names: string[]) => xs.some((x) => names.includes(x) || names.some((n) => n.startsWith("--") && x.startsWith(n + "=")));
    if (/^pip3?$/.test(args[module + 1]?.alts[0] ?? "") && installs("pip", positional(rest)[0]?.alts[0] ?? "", xs, has)) {
      flag(text + " installs or removes software for the whole computer");
    }
    return true;
  }
  const script = sourced ? args[0] : SHELLS.has(base) ? shell_file(args) : interp_file(base, args);
  if (script === undefined || (!script.dynamic && script.alts[0] === "-")) {
    const input = part.redirs.filter((r) => r.op.startsWith("<") && (r.num === undefined || r.num === "0")).at(-1);
    if (input !== undefined) {
      stdin_look(where, look, part, base, input, flag, depth);
    } else if (part.piped) {
      flag(text + " runs code that comes through a pipe");
    }
    return true;
  }
  if (script.fd) {
    flag(text + " runs code a command writes");
    return true;
  }
  const files = named(script, part.cwd);
  const away = (f: string) => !under(f, where.top) && !where.plugins.some((d) => under(f, d));
  if (files === null || files.some(away)) {
    flag(text + " runs a script from " + (files === null ? "a place known only as it runs" : shown(path.dirname(files.find(away)!), where.top)));
  }
  use(script, false);
  args.filter((a) => a !== script && !a.alts[0].startsWith("-")).forEach((a) => use(a, false));
  return true;
}

// a shell's or interpreter's code from its input: a heredoc's or a
// here-string's text (a shell's read as commands of their own, an
// interpreter's checked by its words, one naming a secret asked in
// every mode but yolo; made as it runs, as an expanding
// heredoc's $x is: flagged), a file (a script: from outside the project,
// flagged), a command's output (< <(curl ...)) or a descriptor's: flagged
function stdin_look(where: Where, look: Look, part: Part, base: string, r: Redir, flag: Flagger, depth: number): void {
  const text = clip(part.text);
  if (r.body === undefined) {
    if (r.op === "<&" || r.target.fd) {
      if (r.target.fd || !/^(-|0)$/.test(r.target.alts[0])) {
        flag(text + " runs code a command writes");
      }
      return;
    }
    const files = named(r.target, part.cwd);
    const out = files?.find((f) => f !== "/dev/null" && !under(f, where.top));
    if (files === null || out !== undefined) {
      flag(text + " runs a script from " + (files === null ? "a place known only as it runs" : shown(path.dirname(out!), where.top)));
    }
    return;
  }
  if (r.made === true) {
    flag(text + " runs code made as it runs", null, "careful", true);
  } else if (SHELLS.has(base) && !ODD.has(base) && depth < 8) {
    const inner = Shell.parse(r.body, part.cwd ?? where.cwd);
    if (typeof inner === "string") {
      flag(text + " runs a script illi can't follow: " + inner, null, "all");
    } else {
      inner.forEach((p) => look_part(where, look, p, depth + 1));
    }
  } else if (!INTERPS.test(base) || risky(base, r.body)) {
    flag(text + " runs code illi can't check", null, "careful", true);
  }
  if (r.made !== true && INTERPS.test(base) && SECRET_CODE.test(r.body)) {
    flag(text + " names a file that may hold secrets", null, "all", true);
  }
}

// a runner's inline code, each word it may be (null: none given inline):
// a long option's (--eval=x, --eval x, deno eval x), or a short one's of
// its letters (python -c, perl -e, node -p): in a cluster (-Bc) the rest
// of it if that isn't only letters, else that and the next word. Every
// one is found, so a cluster that only looks like one can't hide another
function inline_code(base: string, args: Word[]): Word[] | null {
  const letters = inline_letters(base);
  const none: Word = { alts: [""], raw: "", dynamic: true, glob: false, fd: false };
  const out: Word[] = [];
  let found = false;
  args.forEach((a, k) => {
    const x = a.dynamic ? "" : a.alts[0];
    const next = args[k + 1] ?? none;
    const long = INLINE.exec(x);
    if (long !== null || (base === "deno" && k === 0 && x === "eval")) {
      found = true;
      out.push(long?.[2] === "=" ? Shell.cut(a, long[0].length) : next);
      return;
    }
    const short = letters === "" || x.startsWith("--") ? null : new RegExp("^-[A-Za-z]*?[" + letters + "]").exec(x);
    if (short !== null) {
      found = true;
      const rest = Shell.cut(a, short[0].length);
      if (/[^A-Za-z]/.test(rest.alts[0])) {
        out.push(rest);
      } else {
        out.push(...(rest.alts[0] === "" ? [] : [rest]), next);
      }
    }
  });
  return found ? out : null;
}

// the letters of a runner's short options giving its code inline
function inline_letters(base: string): string {
  return SHELLS.has(base) || /^(python|pypy)/.test(base) ? "c" : /^perl/.test(base) ? "eE" : /^(node|nodejs|bun|ts-node|tsx)$/.test(base) ? "ep" : /^php/.test(base) ? "r" : /^(deno|tclsh|wish|erl)$/.test(base) ? "" : "e";
}

// whether inline code names what can run a program, change files, reach
// out or read a secret (RISKY; perl's, ruby's, php's and julia's
// backticks run a command); AppleScript can drive any app: always
function risky(base: string, code: string): boolean {
  return RISKY.test(code) || (TICKS.test(base) && code.includes("`")) || base === "osascript";
}

// a shell's script, past its options (-o's and --rcfile's values too);
// undefined: none, its commands from its input (no word, or -s)
function shell_file(args: Word[]): Word | undefined {
  for (let k = 0; k < args.length; k++) {
    const x = args[k].alts[0];
    if (args[k].dynamic || !/^[-+]/.test(x) || x === "-") {
      return args[k];
    }
    if (x === "--") {
      return args[k + 1];
    }
    if (/^[-+][oO]$/.test(x) || x === "--rcfile" || x === "--init-file") {
      k++;
    } else if (/^-[A-Za-z]+$/.test(x) && x.includes("s")) {
      return undefined;
    }
  }
  return undefined;
}

// an interpreter's script, past its options and the values of those that
// take the next word (python -W x, ruby -r x, node --require x); php's -f
// and julia's -L name it; undefined: none, its code from its input
function interp_file(base: string, args: Word[]): Word | undefined {
  const short = /^(python|pypy)/.test(base) ? "WX" : /^(node|nodejs|bun|ts-node|tsx|deno)$/.test(base) ? "rC" : /^perl/.test(base) ? "I" : /^ruby/.test(base) ? "IrCE" : /^php/.test(base) ? "cdzt" : /^(lua|luajit)$/.test(base) ? "l" : base === "julia" ? "pt" : base === "elixir" ? "rS" : base === "osascript" ? "ls" : "";
  for (let k = 0; k < args.length; k++) {
    const x = args[k].alts[0];
    if (args[k].dynamic || !x.startsWith("-") || x === "-") {
      return args[k];
    }
    if (x === "--" || (/^php/.test(base) && x === "-f") || (base === "julia" && x === "-L")) {
      return args[k + 1];
    }
    if ((x.length === 2 && short.includes(x[1])) || /^--(require|import|loader|experimental-loader|conditions|env-file|cp|classpath)$/.test(x) || x === "-cp") {
      k++;
    }
  }
  return undefined;
}

// a program that runs a command it's given, in its words (RUNNERS) or an
// option's value (tar --to-command, rsync -e, fd -x, sort
// --compress-program, zip -TT): why, or null
function runs_given(base: string, sub: string, xs: string[], has: (...names: string[]) => boolean): string | null {
  if (RUNNERS.has(base) && !RUNS_READ[base]?.test(sub) && !(base === "screen" && has("-ls", "-list"))) {
    return " runs a command given in its words";
  }
  const short = (re: RegExp) => xs.some((x) => /^-[A-Za-z]/.test(x) && re.test(x));
  switch (base) {
    case "fd":
    case "fdfind": {
      return has("-x", "--exec", "-X", "--exec-batch") ? " runs a command on each file it finds" : null;
    }
    case "tar": {
      const old = /^[A-Za-z]*[IF][A-Za-z]*$/.test(xs[0] ?? "");
      return has("--to-command", "--use-compress-program", "--checkpoint-action", "--info-script", "--new-volume-script", "--rsh-command") || short(/^-[A-Za-z]*[IF]/) || old ? " runs a program it's given" : null;
    }
    case "sort": {
      return has("--compress-program") ? " runs a program it's given" : null;
    }
    case "rg": {
      return has("--pre") ? " runs a program on each file it searches" : null;
    }
    case "rsync": {
      return has("--rsh", "--rsync-path") || short(/^-[A-Za-z]*e/) ? " runs a program it's given" : null;
    }
    case "zip": {
      return has("--unzip-command") || xs.some((x) => x.startsWith("-TT")) ? " runs a program it's given" : null;
    }
    case "vi":
    case "vim":
    case "nvim":
    case "ex":
    case "view": {
      return has("-c", "--cmd", "-S") || xs.some((x) => x.startsWith("+")) ? " runs editor commands it's given" : null;
    }
  }
  return null;
}

// make: a makefile from outside the project (-f, or the folder's own
// where -C or a cd takes it) flagged: its recipes run as written
function make_look(where: Where, part: Part, args: Word[], flag: (why: string) => void): void {
  const text = clip(part.text);
  const value = (k: number, long: RegExp, short: string) => {
    const x = args[k].dynamic ? "" : args[k].alts[0];
    return x === short || long.test(x) && !x.includes("=") ? args[k + 1] ?? null : long.test(x) ? Shell.cut(args[k], x.indexOf("=") + 1) : x.startsWith(short) && x.length > 2 ? Shell.cut(args[k], 2) : undefined;
  };
  let dir: string | null = part.cwd;
  const files: (Word | null)[] = [];
  for (let k = 0; k < args.length; k++) {
    const d = value(k, /^--directory(=|$)/, "-C");
    const f = value(k, /^--(file|makefile)(=|$)/, "-f");
    if (d !== undefined) {
      dir = d === null || d.dynamic || d.alts.length !== 1 || dir === null ? null : path.resolve(dir, d.alts[0]);
    } else if (f !== undefined) {
      files.push(f);
    }
  }
  const places = files.length === 0 ? [dir] : files.map((f) => (f === null || dir === null ? null : named(f, dir)?.[0] ?? null));
  const out = places.find((f) => f === null || !under(real(f), where.top));
  if (out !== undefined) {
    flag(text + " runs a makefile from " + (out === null ? "a place known only as it runs" : shown(real(out), where.top)));
  }
}

// an archive or patch tool: its files all written (as WRITERS'), a value
// glued to its option's letter among them where it names one (ARCHIVED:
// tar -cf/tmp/x.tar, -xf a.tar -C/out, unzip -d/out, 7z -o/out); one
// extracting with its names kept whole (tar -P, --absolute-names; unzip
// -:; 7z -spf; cpio's own way, but --no-absolute-filenames) lands its
// files anywhere: asked in every mode but yolo, exactly
function archive_look(part: Part, base: string, args: Word[], use: (w: Word, write: boolean) => void, flag: Flagger): void {
  const [valued, paths] = ARCHIVED[base];
  const xs = args.map((a) => (a.dynamic ? "" : a.alts[0]));
  const long = (name: string) => xs.some((x) => x.length > 3 && name.startsWith(x));
  const opts = base === "tar" && /^[A-Za-z]+$/.test(xs[0] ?? "") ? [xs[0]] : [];
  args_use(args, true, use);
  args.forEach((a, k) => {
    if (!/^-[^-]/.test(xs[k])) {
      return;
    }
    const at = base === "7z" ? 1 : [...xs[k].slice(1)].findIndex((c) => valued.includes(c)) + 1;
    opts.push(base === "7z" || at === 0 ? xs[k].slice(1) : xs[k].slice(1, at + 1));
    if (at > 0 && at + 1 < xs[k].length && paths.includes(xs[k][at])) {
      use(Shell.cut(a, at + 1), true);
    }
  });
  const letters = opts.join("");
  const anywhere = base === "tar" ? (letters.includes("x") || long("--extract") || long("--get")) && (letters.includes("P") || long("--absolute-names"))
    : base === "unzip" ? letters.includes(":")
    : base === "cpio" ? (letters.includes("i") || long("--extract")) && !long("--no-absolute-filenames")
    : base === "7z" && /^[ex]$/.test(positional(args)[0]?.alts[0] ?? "") && opts.some((o) => /^spf2?$/.test(o));
  if (anywhere) {
    flag(clip(part.text) + " extracts files wherever their names say (absolute names kept)", null, "all");
  }
}

// a container's host folders (docker -v src:dst, --mount source=src):
// those named by a path, not a volume's name
function mounts(args: Word[], xs: string[]): Word[] {
  const out: Word[] = [];
  args.forEach((a, k) => {
    const v = xs[k] === "-v" || xs[k] === "--volume" || xs[k] === "--mount" ? args[k + 1] : /^--(volume|mount)=/.test(xs[k]) ? Shell.cut(a, xs[k].indexOf("=") + 1) : /^-v./.test(xs[k]) ? Shell.cut(a, 2) : undefined;
    if (v === undefined) {
      return;
    }
    if (v.dynamic) {
      out.push(v);
      return;
    }
    const x = v.alts[0];
    const src = x.includes("=") ? /(?:^|,)(?:source|src)=([^,]*)/.exec(x)?.[1] : x.split(":")[0];
    if (src !== undefined && /^[/.~]/.test(src)) {
      out.push(Shell.lit(src.startsWith("~") ? HOME + src.slice(1) : src));
    }
  });
  return out;
}

// what a copy, a move or a link into a folder writes there: each
// source's name in it (cp -r x/.claude . writes ./.claude; a glob's
// matches' names; rsync's x/ its contents, as x/. any copier's: the
// folder itself; a lone ln's, the folder it runs in), judged where the
// folder's own question doesn't ask it already (use_look); none for -T,
// a remote folder, a target that isn't one (it is the new name), nor one
// known only as it runs (asked as such)
function land(base: string, args: Word[], pos: Word[], into: Word | null, cwd: string | null, use: (w: Word, write: boolean, into?: Word) => void): void {
  const xs = args.map((a) => (a.dynamic ? "" : a.alts[0]));
  const lone = base === "ln" && into === null && pos.length === 1;
  const target = into ?? (lone ? Shell.lit(".") : pos.length > 1 ? pos[pos.length - 1] : null);
  const sources = into === null && !lone ? pos.slice(0, -1) : pos;
  const plain = base !== "rsync" && base !== "scp" && xs.some((x) => x === "--no-target-directory" || /^-[A-Za-z]*T/.test(x));
  if (target === null || target.dynamic || target.glob || cwd === null || plain || target.alts.some((t) => /^[^/\s]*:/.test(t))) {
    return;
  }
  const folder = into !== null || lone || sources.length > 1 || target.alts.every((t) => t.endsWith("/") || is_dir(real(Shell.walk(cwd, t))));
  for (const s of folder ? sources : []) {
    for (const alt of s.dynamic ? [] : s.alts) {
      const g = s.glob ? alt.search(/[*?[]/) : -1;
      const at = alt.lastIndexOf("/", g) + 1;
      const whole = /(^|\/)\.\.?$/.test(alt) || (base === "rsync" && alt.endsWith("/"));
      const names = whole ? [] : g < 0 ? [path.basename(alt)] : alt.includes("/", g) ? [] : (glob_names(real(Shell.walk(cwd, alt.slice(0, at) || ".")), alt.slice(at)) ?? []).slice(0, 200);
      for (const t of target.alts) {
        names.forEach((n) => use(Shell.lit(path.join(t, n)), true, target));
      }
    }
  }
}

// ln's files, all written: a link to a file is a way to change it (a
// hard link's or a symbolic one's), so its target counts as its name
// does; a symbolic one's target, unless -r, from the link's folder. The
// links it makes, as named (in a folder named, each target's name there)
function ln_use(args: Word[], pos: Word[], into: Word | null, cwd: string | null, uses: Use[]): string[] {
  const xs = args.map((a) => (a.dynamic ? "" : a.alts[0]));
  const symbolic = xs.some((x) => x === "--symbolic" || (/^-[A-Za-z]+$/.test(x) && x.includes("s")));
  const relative = xs.some((x) => x === "--relative" || (/^-[A-Za-z]+$/.test(x) && x.includes("r")));
  const dest = into ?? (pos.length > 1 ? pos[pos.length - 1] : null);
  const at = dest === null || cwd === null ? cwd : dest.dynamic || dest.alts.length !== 1 ? null : path.resolve(cwd, dest.alts[0]);
  const dir = at === null || dest === null ? at : dest === into || dest.alts[0].endsWith("/") || is_dir(at) ? at : path.dirname(at);
  pos.forEach((w) => uses.push({ word: w, write: true, cwd: w !== dest && symbolic && !relative ? dir : cwd }));
  return at === null || dir === null ? [] : pos.filter((w) => w !== dest && !w.dynamic).flatMap((w) => w.alts.map((x) => (dir === at ? path.join(dir, path.basename(x)) : at)));
}

// a copier's folder named by -t (cp -t dir a b, -rt dir, -tdir,
// --target-directory=dir), or null; a cluster's letters before its t
// take no value (not install's -o, -g, -m, nor cp's -S)
function copier_into(args: Word[]): Word | null {
  for (let k = 0; k < args.length; k++) {
    const x = args[k].dynamic ? "" : args[k].alts[0];
    if (x === "--") {
      break;
    }
    const m = /^(?:--target-directory=?|-(?:(?![ogmS])[A-Za-z])*?t)(.*)$/s.exec(x);
    if (m !== null) {
      return m[1] !== "" ? Shell.cut(args[k], x.length - m[1].length) : args[k + 1] ?? null;
    }
  }
  return null;
}

// a search's files: its words but its pattern and its options' values; a
// file of patterns (-f) read too
function search_use(name: string, args: Word[], use: (w: Word, write: boolean) => void): void {
  const base = /^(rg|ag|ack)$/.test(name) ? name : "grep";
  const [letters, longs] = SEARCHES[base];
  const pos: Word[] = [];
  let given = base === "rg" && args.some((a) => !a.dynamic && a.alts[0] === "--files");
  let ended = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    const x = a.dynamic ? "" : a.alts[0];
    if (ended || a.dynamic || !x.startsWith("-") || x === "-") {
      pos.push(a);
    } else if (x === "--") {
      ended = true;
    } else if (x.startsWith("--")) {
      const eq = x.indexOf("=");
      const opt = eq > 0 ? x.slice(0, eq) : x;
      const value = eq > 0 ? Shell.cut(a, eq + 1) : longs.test(opt) ? args[++k] : undefined;
      given ||= opt === "--regexp" || opt === "--file";
      if (opt === "--file" && value !== undefined) {
        use(value, false);
      }
    } else {
      const at = [...x.slice(1)].findIndex((c) => letters.includes(c)) + 1;
      if (at > 0) {
        const value = at + 1 < x.length ? Shell.cut(a, at + 1) : args[++k];
        given ||= (base !== "ag" && (x[at] === "e" || x[at] === "f")) || (base === "ag" && x[at] === "g");
        if (base !== "ag" && x[at] === "f" && value !== undefined) {
          use(value, false);
        }
      }
    }
  }
  (given ? pos : pos.slice(1)).forEach((w) => use(w, false));
}

// find, fd, sed, sort, awk: read-only unless an option or a script makes
// them write or run things
function reader_look(where: Where, part: Part, base: string, args: Word[], use: (w: Word, write: boolean) => void, flag: Flagger): boolean {
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
        const from = starts.length === 0 ? [Shell.lit(".")] : starts;
        const files = from.flatMap((w) => named(w, part.cwd, false, true) ?? [null]);
        const vital = files.find((f): f is string => f !== null && vital_of(where, f));
        if (vital !== undefined || files.includes(null)) {
          flag(text + " deletes what it finds in " + (vital === undefined ? "a folder known only as it runs" : shown(vital, where.top) + ", a folder that matters"), null, "all");
        } else if (!from.every((w) => rebuilt(where, w, part.cwd))) {
          flag(text + " deletes what it finds in " + from.map((w) => w.raw).join(" ") + " and below", null, homely(where));
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
  return sed_split(script).map((c) => c.trim().replace(/^\{|\}$/g, "").trim()).every((c) => SAFE.test(c));
}

// a sed script's commands: split at each ; and newline, but those inside
// an address's /regex/, an s or y command's parts, or the text of an a,
// i or c (to its line's end)
function sed_split(script: string): string[] {
  const out: string[] = [];
  let [from, k, head] = [0, 0, true];
  const past = (parts: number) => {
    const d = script[k++];
    for (let p = 0; p < parts && k < script.length; k++) {
      if (script[k] === "\\") {
        k++;
      } else if (script[k] === d) {
        p++;
      }
    }
  };
  while (k < script.length) {
    const c = script[k];
    if (c === ";" || c === "\n") {
      out.push(script.slice(from, k));
      [from, head] = [++k, true];
    } else if (!head) {
      k++;
    } else if (c === "/") {
      past(1);
    } else if (/[\d$,~+!{}\sIM]/.test(c)) {
      k++;
    } else if ((c === "s" || c === "y") && k + 1 < script.length) {
      k++;
      past(2);
      head = false;
    } else if (c === "a" || c === "i" || c === "c") {
      const nl = script.indexOf("\n", k);
      k = nl < 0 ? script.length : nl;
      head = false;
    } else {
      [k, head] = [k + 1, false];
    }
  }
  return [...out, script.slice(from)];
}

// whether a program publishes for everyone
function publishes(base: string, sub: string, xs: string[]): boolean {
  return (/^(npm|pnpm|yarn|bun|cargo|deno|uv|poetry|flutter|dart|vsce|ovsx)$/.test(base) && sub === "publish")
    || (base === "gem" && sub === "push") || (base === "twine" && sub === "upload") || (base === "mvn" && xs.includes("deploy"))
    || (base === "gradle" && xs.some((x) => /^publish/.test(x)));
}

// whether a program takes a published package back: deleted for good
// (true: npm's, pnpm's and yarn's unpublish, a gem yanked, whose version
// can't be pushed again), or only kept from new installs (false: cargo
// yank, npm deprecate, undone by --undo or an empty message); null:
// neither
function unpublishes(base: string, verbs: string[]): boolean | null {
  const [sub, next] = verbs;
  if ((/^(npm|pnpm|yarn)$/.test(base) && sub === "unpublish") || (base === "yarn" && sub === "npm" && next === "unpublish") || (base === "gem" && sub === "yank")) {
    return true;
  }
  return (base === "cargo" && sub === "yank") || (base === "npm" && sub === "deprecate") ? false : null;
}

// whether a cloud CLI deletes for good on another computer: aws by its
// operation, past its service and its options (aws ec2 delete-vpc, s3
// rm: GONE, GONE_OF), any other by a bare verb among its words (each part
// of a topic:command); none under the CLI's own settings (OWN)
function gone(base: string, args: Word[]): boolean {
  const words = positional(args, base === "aws" ? AWS_VALUED : undefined).map((w) => (w.dynamic ? "" : w.alts[0]));
  if (OWN.test(words[0] ?? "")) {
    return false;
  }
  return base === "aws" ? GONE.test(words[1] ?? "") || GONE_OF.test(words[1] ?? "") : words.some((v) => v.split(":").some((x) => GONE.test(x)));
}

// what gh deletes for good on GitHub (why), or null: a noun's delete,
// its verb past -R's repository (gh repo delete, release delete-asset,
// secret remove; under the nouns of nouns, repo deploy-key delete: the
// nouns said), an api call of DELETE (or of a method known only as it
// runs), a pull request closed with its branch deleted
function gh_lost(args: Word[], xs: string[], has: (...names: string[]) => boolean): string | null {
  const words = positional(args, GH_VALUED).map((w) => (w.dynamic ? "" : w.alts[0]));
  const [sub = "", verb = ""] = words;
  if (sub === "api") {
    const methods = xs.flatMap((x, k) => (x === "-X" || x === "--method" ? [xs[k + 1] ?? ""] : /^-X./.test(x) ? [x.slice(2)] : /^--method=/.test(x) ? [x.slice(9)] : []));
    return methods.some((m) => m === "" || /^delete$/i.test(m)) ? " deletes what it names on GitHub" : null;
  }
  if (sub === "pr" && verb === "close" && has("-d", "--delete-branch")) {
    return " deletes the pull request's branch on GitHub";
  }
  const k = /^(deploy-key|autolink)$/.test(verb) ? 2 : 1;
  if (OWN.test(sub) || !(GONE.test(words[k] ?? "") || /^delete-[\w-]+$/.test(words[k] ?? ""))) {
    return null;
  }
  const noun = words.slice(0, k).map((w) => (w === "repo" ? "repository" : w)).join(" ");
  const of = /^\w+-(.+)$/.exec(words[k])?.[1];
  return " deletes the " + noun + (of === undefined ? "" : "'s " + of) + " on GitHub";
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
    || (base === "pacman" && xs.some((x) => /^-[SRU]/.test(x)))
    || (base === "nix-env" && xs.some((x) => /^-[A-Za-z]*[ieu]/.test(x) && !x.startsWith("--") || /^--(install|uninstall|upgrade|set)$/.test(x)));
}

// MCP
// ===

// a tool by its name (an MCP tool, or one of Claude Code's illi doesn't
// know): by the user's rules on its name first (their mcp rules); one
// that only reads runs (in read-only too); any other runs in auto and
// yolo, is refused in read-only, and is asked the first time in careful
// and ask (why: what it may do), "don't ask again" covering the tool
// from then on
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
    look.flags.push({ why: "your rules ask about " + tool, kind: "mcp", subject: tool, wide: null, tier: "all", rule: true });
  }
  if (why === null) {
    return;
  }
  const wide = { kind: "mcp" as const, subject: tool, grant: "mcp:" + tool.replace(/\*/g, "\\*") };
  look.flags.push({ why: tool + why, kind: "mcp", subject: tool, wide, tier: "careful" });
  look.changes.push({ why: where.mode === "read-only" ? tool + " may change things" : "ask mode asks before " + tool, kind: "mcp", subject: tool, wide: where.mode === "ask" ? wide : null, tier: "careful" });
}

// Files
// =====

// a file read or written by a file tool (a folder: read, as a search's),
// judged where the tool puts it (Machine.ts: its .. as written, not as a
// shell's command walks it); a write naming none is asked
function look_file(where: Where, look: Look, file: unknown, write: boolean): void {
  if (typeof file !== "string" || file === "") {
    if (write) {
      look.flags.push({ why: "it names no file to change", kind: "write", subject: "", wide: null, tier: "all" });
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
    look.flags.push({ why: "your rules ask about " + shown(abs, where.top), kind, subject: abs, wide: null, tier: "all", rule: true });
  }
  for (const r of path_why(where, abs, write)) {
    look.flags.push({ why: r.why, kind, subject: abs, wide: r.wide ? folder_wide(kind, abs) : null, tier: r.tier });
  }
  if (write) {
    look.changes.push({ why: where.mode === "read-only" ? "changing " + shown(abs, where.top) : "ask mode asks before changing " + shown(abs, where.top), kind, subject: abs, wide: where.mode === "ask" ? { kind, subject: abs, grant: "write:" + where.top + "/*" } : null, tier: "careful" });
  }
}

// a file a part reads or writes, judged: the user's path rules, then
// where it is (outside the project, a secret, protected, a device; a
// read by a command that may change things, acts, as one that may be a
// write); one known only as it runs asked (in auto, a write's; one xargs
// gives, a write's alone: its reads are its program's, look_command). A
// glob's entries outside are said by their folder, once; what lands in a
// folder (land) only where no reason of the folder's own asks it already
// (in as many modes, cleared by no more than a grant clearing its)
function use_look(where: Where, look: Look, use: Use, flag: Flagger, acts: boolean): void {
  const files = named(use.word, use.cwd, false, use.write, use.write ? look.links : []);
  if (files === null) {
    if (use.write || use.word.input !== true) {
      flag((use.word.raw || "what xargs adds") + " is known only as it runs", null, use.write ? "all" : "careful");
    }
    return;
  }
  const kind: Kind = use.write ? "write" : "read";
  const said = new Set<string>();
  const near = use.into === undefined ? [] : (named(use.into, use.cwd, false, true) ?? []).flatMap((f) => path_why(where, f, true, acts));
  const covered = (r: Reason) => near.some((f) => (!f.wide || r.wide) && (f.tier === r.tier || f.tier === "self" || (f.tier === "all" && r.tier !== "self")));
  for (const file of files) {
    const rule = path_rule(where, file, use.write);
    if (rule === "deny") {
      look.denied.push("your rules refuse " + (use.write ? "changing " : "reading ") + shown(file, where.top));
    } else if (rule === "ask") {
      look.flags.push({ why: "your rules ask about " + shown(file, where.top), kind: "shell", subject: "", wide: null, tier: "all", rule: true });
    } else if (rule !== "allow") {
      for (const r of path_why(where, file, use.write, acts)) {
        if (!(r.wide && use.word.glob && said.has(path.dirname(file))) && !covered(r)) {
          flag(r.why, r.wide ? folder_wide(kind, file) : null, r.tier);
          said.add(r.wide ? file : "");
        }
      }
    }
  }
}

// what "don't ask again" keeps for a file outside the project: its
// folder (a folder named, itself), for a read the repository holding it
// (a sibling repo's top); none for home, or / or a folder above home, as
// that would cover all of home
function folder_wide(kind: Kind, file: string): Flag["wide"] {
  const folder = is_dir(file);
  const dir = folder ? file : path.dirname(file);
  const at = (kind === "read" ? repo_of(dir) : null) ?? dir;
  return under(HOME, at) ? null : { kind, subject: folder ? file + "/" : file, grant: kind + ":" + at + "/*" };
}

// whether a path is a folder (one this user can't look at, /root: no)
function is_dir(file: string): boolean {
  try {
    return fs.statSync(file, { throwIfNoEntry: false })?.isDirectory() === true;
  } catch {
    return false;
  }
}

// the repository a folder is in, below home: it or the nearest folder
// above holding a .git; null: none
function repo_of(dir: string): string | null {
  for (let d = dir; !under(HOME, d) && path.dirname(d) !== d; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, ".git"))) {
      return d;
    }
  }
  return null;
}

// the user's rule for a file: its kind's (a read also by write rules)
function path_rule(where: Where, file: string, write: boolean): Rule | null {
  return rule_of(where, write ? "write" : "read", [file], [file]) ?? (write ? null : rule_of(where, "write", [], [file]));
}

// why a file is asked about, each reason with the modes that ask it:
// illi's own config written (in every mode); a secret, read or written
// through any tool (in every mode but yolo), before the folders read
// freely (illi's skills', a plugin's); a device written; git's hooks or
// config, or Claude Code's settings (what it runs unasked), written
// anywhere (git_file, claude_file: in every mode but yolo, never by a
// folder grant); inside the project, a protected file written
// (careful's, but in home: homely); outside it, any but scratch, or the
// system's folders read: a change in every mode but yolo, a read
// careful's (in auto too if maybe, by a command that may change things:
// but in a dependency cache), and a folder holding a secret store read,
// in auto (careful asks it as outside).
// The folder a command runs in is a secret's by its place alone, not
// its name (a project named secrets). None: it isn't asked
function path_why(where: Where, file: string, write: boolean, maybe = false, folder = false): Reason[] {
  const at = shown(file, where.top);
  if (NET.test(file)) {
    return [{ why: at + " opens a network connection", wide: false, tier: "careful" }];
  }
  if (DEVS.test(file)) {
    return [];
  }
  if (write && (under(file, Projects_real(config.ROOT)) || under(file, path.join(where.top, ".illi")))) {
    return [{ why: at + " is illi's own config (what it runs and is told)", wide: false, tier: "self" }];
  }
  const kept = where.plugins.some((d) => plugin_kept(file, d)) ? "kept" : secret(file, where.top);
  if (kept === "kept" || (kept === "name" && !folder)) {
    return [{ why: at + " may hold secrets", wide: false, tier: "all" }];
  }
  if (!write && (where.reads.some((d) => under(file, d)) || where.plugins.some((d) => under(file, d)))) {
    return [];
  }
  if (file.startsWith("/dev/") && write) {
    return [{ why: at + " is a device", wide: false, tier: "all" }];
  }
  const runs = write ? git_file(file) ?? claude_file(file) : null;
  if (runs !== null) {
    return [{ why: at + runs, wide: false, tier: "all" }];
  }
  if (under(file, where.top)) {
    return write && guarded(file, where.top) ? [{ why: at + " configures tools or illi (protected)", wide: false, tier: homely(where) }] : [];
  }
  if (SCRATCH.some((d) => under(file, d)) || (!write && SYSTEM.some((d) => under(file, d)))) {
    return [];
  }
  const away: Reason = { why: at + " is outside the project", wide: true, tier: write || (maybe && !deps(file)) ? "all" : "careful" };
  return !write && STORES.some((s) => s !== file && under(s, file)) ? [{ why: at + " may hold secrets", wide: false, tier: "auto" }, away] : [away];
}

// what writing a file does to git, if git finds a program to run there
// (why), or null: a .git folder's hooks or config, anywhere (a
// repository's, a submodule's under modules/, a worktree's
// config.worktree, the common folder a worktree's .git file names, as
// any write names it), a .git itself (a worktree's file: where they
// are), git's own config in home or the system's. Neither is in the
// project's history, so a change there shows in no diff; a hook folder
// that is (.husky, core.hooksPath's) is the project's
function git_file(file: string): string | null {
  const parts = file.split(path.sep);
  const at = parts.lastIndexOf(".git");
  const rest = parts.slice(at + 1);
  if (at < 0) {
    return GIT_CONFIGS.includes(file) ? " is git's config, which can make git run a program" : null;
  }
  return rest.length === 0 ? " is where git finds its hooks and config" : rest.at(-1) === "hooks" ? " is where git finds its hooks" : rest.includes("hooks") ? " is a git hook, which git runs" : /^config(\.worktree)?$/.test(rest.at(-1)!) ? " is git's config, which can make git run a program" : null;
}

// what writing a file does to Claude Code, if it reads its settings
// there (why), or null: a .claude folder's settings.json or
// settings.local.json at any depth (home's, a project's, a package's in
// it; Claude Code's own folder whatever its name, CLAUDE_DIRS), or such a
// folder itself (a move or copy onto it lands its settings); named in
// any letter case, as a disk that ignores case finds them
function claude_file(file: string): string | null {
  const own = (dir: string) => path.basename(dir).toLowerCase() === ".claude" || CLAUDE_DIRS.includes(dir);
  return own(file) ? " holds Claude Code's settings (what it runs unasked)" : own(path.dirname(file)) && /^settings(\.local)?\.json$/i.test(path.basename(file)) ? " sets what Claude Code runs unasked" : null;
}

// whether a file is in a dependency cache
function deps(file: string): boolean {
  return DEPS.some((d) => under(file, d)) || file.split(path.sep).some((p) => DEPS_PARTS.has(p));
}

// whether a plugin's file may hold the user's tokens, its folder given:
// its MCP servers' file, its settings, its manifest's folder (a secret)
function plugin_kept(file: string, dir: string): boolean {
  const rel = path.relative(dir, file);
  return under(file, dir) && PLUGIN_KEPT.some((k) => rel === k || rel.startsWith(k + path.sep));
}

// whether a file may hold secrets: kept in a secret store of home's
// (where it is named or a link there leads) or the system's, opencode's
// login where its data is, or one of illi's logins, unless the project
// is inside that store and the file inside the project (a repo kept in
// ~/.aws: its files are the project's, the store's others still
// secret); else by its name anywhere; null: neither
function secret(file: string, top: string): "kept" | "name" | null {
  const held = (dir: string) => under(file, dir) && !(under(top, dir) && under(file, top));
  const login = (held(Projects_real(config.ROOT)) && SECRET_ILLI.test(path.basename(file))) || (config.LOGIN_SET !== null && file === real(config.LOGIN_SET));
  return HOME_STORES.some(held) || SECRET_SYSTEM.some(held) || held(real(config.OPENCODE_LOGIN)) || login ? "kept" : secret_name(path.basename(file)) ? "name" : null;
}

// whether a file's name is a secret's
function secret_name(name: string): boolean {
  return SECRET_NAME.test(name) || (SECRET_WORD.test(name) && !CODE.test(name));
}

// the tier of deleting a folder in the project, or changing a protected
// file there: careful's, but in a project that holds home (illi run in
// ~), where auto asks them too: home's folders and rc files aren't a
// project's to drop
function homely(where: Where): Tier {
  return under(HOME, where.top) ? "all" : "careful";
}

// whether a file inside the project is protected
function guarded(file: string, top: string): boolean {
  const rel = path.relative(top, file);
  const parts = rel.split(path.sep);
  return parts.some((p) => PROTECTED_DIRS.has(p)) || PROTECTED_FILES.has(rel) || PROTECTED_DEEP.some((d) => under(file, path.join(HOME, d))) || parts.at(-1) === ".git";
}

// whether deleting a folder whole loses what matters: /, a top-level
// folder, home or one above it, the project or one above it, its .git
function vital_of(where: Where, file: string): boolean {
  return file === "/" || path.dirname(file) === "/" || under(HOME, file) || under(where.top, file) || file === path.join(where.top, ".git");
}

// whether a word names only folders the project's tools rebuild (or,
// outside the project, scratch's own), so deleting it whole is routine;
// a project kept in /tmp is still a project. A glob, only if all it can
// match is one (*.egg-info), in a folder of the project's
function rebuilt(where: Where, w: Word, cwd: string | null): boolean {
  const each = (a: string) => /^\*[^*?[]+$/.test(path.basename(a)) && rebuilt_name("x" + path.basename(a).slice(1));
  if (w.dynamic || (w.glob && !w.alts.every(each))) {
    return false;
  }
  const files = named(w, cwd);
  return files !== null && files.every((f) => (under(f, where.top) ? w.glob || (f !== where.top && rebuilt_name(path.basename(f))) : SCRATCH.some((d) => under(f, d) && f !== d) && !under(where.top, f)));
}

// whether a folder's name is one a project's tools rebuild
function rebuilt_name(name: string): boolean {
  return REBUILT.has(name) || name.endsWith(".egg-info");
}

// the files a word names, real paths (links followed; a .. from where
// the folder before it really is: Shell.walk): each of its values; for a
// glob its folder, and the entries its last part matches (gone: as a
// delete takes it, its folder only if it can match all of it: *, .*); a
// glob before a / (*/x, */../y) each match's path on too, and the path
// as written (a match made as it runs); null: known only as it runs (a
// variable, a folder after a cd to one; for a write, a glob before a ..
// matching too much to look through, or a .. after a link the command
// makes first: unseen)
function named(w: Word, cwd: string | null, gone = false, write = gone, links: string[] = []): string[] | null {
  if (w.dynamic) {
    return null;
  }
  const out: string[] = [];
  for (const alt of w.alts) {
    const g = w.glob ? alt.search(/[*?[]/) : -1;
    if (!path.isAbsolute(alt) && cwd === null) {
      return null;
    }
    const from = cwd ?? "/";
    if (links.length > 0 && unseen(from, alt, links)) {
      return null;
    }
    if (g < 0) {
      out.push(real(Shell.walk(from, alt)));
      continue;
    }
    const at = alt.lastIndexOf("/", g) + 1;
    const end = alt.indexOf("/", g);
    const dir = real(Shell.walk(from, alt.slice(0, at) || "."));
    const glob = alt.slice(at, end < 0 ? alt.length : end);
    if (!gone || (end < 0 && /^[*?.]+$/.test(glob))) {
      out.push(dir);
    }
    if (end < 0) {
      out.push(...glob_entries(dir, glob));
      continue;
    }
    const names = glob_names(dir, glob);
    const rest = alt.slice(end);
    if ((names === null || names.length > 200) && write && /(^|\/)\.\.(\/|$)/.test(rest)) {
      return null;
    }
    out.push(real(Shell.walk(from, alt)));
    for (const n of names !== null && names.length <= 200 ? names : []) {
      const more = named({ ...w, alts: [path.join(dir, n) + rest], glob: /[*?[]/.test(rest) }, "/", gone, write);
      if (more === null) {
        return null;
      }
      out.push(...more);
    }
  }
  return out;
}

// whether a path's .. follows a link not there yet, one of those the
// command makes first (ln -s /tmp x && rm -rf x/../y climbs from /tmp)
function unseen(cwd: string, p: string, links: string[]): boolean {
  let at = path.isAbsolute(p) ? "/" : cwd;
  for (const name of p.split("/")) {
    if (name === ".." && !fs.existsSync(at) && links.some((l) => under(at, l))) {
      return true;
    }
    at = Shell.walk(at, name);
  }
  return false;
}

// a folder's names a glob's part matches (a leading dot only by one);
// null: a folder too big to look through
function glob_names(dir: string, glob: string): string[] | null {
  try {
    const names = fs.readdirSync(dir);
    if (names.length > 2000) {
      return null;
    }
    const re = new RegExp("^" + glob.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]") + "$");
    return names.filter((n) => re.test(n) && (glob.startsWith(".") || !n.startsWith(".")));
  } catch {
    return [];
  }
}

// a folder's entries a glob's last part matches, as real paths (200 at
// most; a folder too big to look through: none)
function glob_entries(dir: string, glob: string): string[] {
  return (glob_names(dir, glob) ?? []).slice(0, 200).map((n) => real(path.join(dir, n)));
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

// a part's words that aren't options, nor the values of those that take
// the next word (valued: -m's message, unless told)
function positional(args: Word[], valued = /^(-m|--message)$/): Word[] {
  const out: Word[] = [];
  let ended = false;
  for (let k = 0; k < args.length; k++) {
    const x = args[k].dynamic ? args[k].alts[0] : args[k].alts[0];
    if (!ended && !args[k].dynamic && valued.test(x)) {
      k++;
    } else if (!ended && !args[k].dynamic && x === "--") {
      ended = true;
    } else if (ended || args[k].dynamic || !x.startsWith("-") || x === "-") {
      out.push(args[k]);
    }
  }
  return out;
}

// the values of the options a regex names (-F x, -Fx, --file x,
// --file=x)
function option_values(args: Word[], names: RegExp): Word[] {
  return args.flatMap((a, k) => {
    const x = a.dynamic ? "" : a.alts[0];
    const eq = /^--[\w-]+=/.exec(x)?.[0] ?? "";
    return names.test(x) ? args.slice(k + 1, k + 2) : eq !== "" && names.test(eq.slice(0, -1)) ? [Shell.cut(a, eq.length)] : /^-[A-Za-z]./.test(x) && names.test(x.slice(0, 2)) ? [Shell.cut(a, 2)] : [];
  });
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

// where a file is named: its folder's real place, itself as named (a
// link left as it is)
function placed(file: string): string {
  return path.join(real(path.dirname(file)), path.basename(file));
}

function Projects_real(dir: string): string {
  try {
    return fs.realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}
