// Shell
// =====
// A shell tool's command read as bash reads it, so Access.ts can find
// what it asks leave for before it runs: every simple command in it (a
// part), wherever it sits (a pipeline, a list, a subshell, a command's
// substitution, a heredoc's body, a loop, a bash -c's script, an
// eval's, a trap's, a find -exec's), each with its words as they'd
// expand, its assignments, its redirections, where it is in the command
// (its span: a question shows the lines holding what made the checks
// ask; reading a pipe, with what writes it) and the folder it runs in
// (each cd followed, behind builtin, command or time too, in the shell
// it moves: a subshell's, a pipeline's or the background's, a group's
// or a loop's there, its own; one another program runs leaves it
// unknown), and its input as given (a heredoc, a file) to the group,
// the subshell, the loop or the nested script it is in, as its own. A
// pipe goes on past a line's end after |, as do && and ||, and into
// every command of a subshell, a group or a loop it feeds, and of what
// a command reading it runs ($(...), `...`, <(...), a heredoc's body,
// bash -c's script, an eval's, find -exec's). Wrappers that run the
// command after them (sudo, timeout, env, xargs, ...) are taken off,
// the part saying so (root: run as root, as sudoedit edits; fed: some
// of its arguments come from its input), the paths they name kept
// beside it (taken: time -o's file), the folder one moves to (env -C,
// sudo -D) its own. A program is read also with its own options before
// the words naming what it does off (git -C x push origin also as git
// push origin: GLOBALS), as written too, and with each git alias given
// to it put as git puts it; a git setting or a variable naming a command
// it runs (core.sshCommand, GIT_SSH_COMMAND, EDITOR) is read as a script
// of its own, where it runs (git's at its repository's top too), by its
// text if made as it runs (loosely too: Shell script), as written if
// this can't read it (Part rough), never leaving the command unread. A word known only as the
// command runs (a variable it never sets and the environment lacks, a
// command's output) is dynamic, its known head kept; a variable the
// command sets to plain words (X=a, for X in a b) stands for each of
// them, and a command's output known before it runs ($(pwd), $(git
// rev-parse --show-toplevel): the folder; $(mktemp): where it makes its
// file, its X's kept) for its value. What bash would read in a way this
// can't follow (case, functions, arrays, aliases, a script made as it
// runs) leaves no parts, only why: Access.ts then splits such a command
// crudely (its rules still meet most of what is in it, its paths found
// by their look), each piece read here on its own too. Past BUDGET
// scripts read (a git alias that runs itself twice), the scripts left
// are each their text alone, the rest of the command read as ever. The shell tool runs bash (Machine.ts), so this is the
// language it runs.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Types
// =====

// a word as bash would expand it: each value it can take (one, or a
// variable's several), as written (raw); dynamic: only its head (alts)
// is known before it runs; glob: an unquoted *, ?, [ or {; fd: a
// process substitution's /dev/fd file; input: one xargs gives from its
// input; at: where it starts in the text read (a nested script's own:
// Scan src); made: its values if each mktemp in it made its file, all
// else in it known (dynamic all the same: a mktemp may fail, its output
// then empty, "$d"/* then /*, so only an assignment a failure ends the
// script at takes them: cmd_run's trust)
export type Word = { alts: string[]; raw: string; dynamic: boolean; glob: boolean; fd: boolean; input?: boolean; at?: number; made?: string[] };

// a redirection: its operator (">", ">>", "<", "&>", "<<", ">&", ...) and
// its target (a file; a descriptor for >& and <&; a heredoc's delimiter),
// the descriptor written before it (2>, 3<), what it feeds the command as
// text (a heredoc's body, a here-string's), whether that text is made as
// it runs (a here-string's word; an expanding heredoc's $ or `), where
// that text starts in the command parsed if it lies there as written (a
// heredoc's body does, but in a nested script whose text was changed as
// it was read: Scan base)
export type Redir = { op: string; target: Word; num?: string; body?: string; made?: boolean; at?: number };

export type Env = { name: string; value: Word };

// a place in the command parsed: its first character, the one past its
// last
export type Span = [number, number];

// a simple command: its words (wrappers taken off), its other readings
// (plain: its program's own options before the words naming what it
// does off them, git -C x push origin as git push origin, GLOBALS; each
// git alias given with it put as git puts it), the paths its wrappers
// name (taken: time -o's file, flock's, xargs -a's), the folders its
// wrappers and options move it to as written (dirs: env -C's, git -C's
// word, each with the folder it's named from, the one in force where
// it's read: env -C /etc git -C ../x's ../x from /etc; null: known only
// as it runs), the assignments before them, its redirections, the folder it runs in
// (cwd: as its wrappers and options move it) and the one the shell is
// in as it starts (at: its redirections made there, its wrappers run
// there; null, either: known only as it runs), its words as written
// (text) and the whole command as written (full: wrappers, assignments
// and redirections too); whether it
// runs as root, takes arguments from its input (fed), reads a pipe's
// output (piped); where it is in the command parsed (span: from its
// first word to its last, a heredoc's body after its line not held), and
// reading a pipe, where what writes it is (feed: the commands before it
// in its pipeline, a group's a pipe goes into too, with the heredocs'
// bodies they read; not known, as after a group piped on, all the
// command; given the input of the group or nested script it is in, where
// that redirection is). One
// in a nested script is placed in the command itself where its text lies
// there as written (bash -c 'x', a $(...), a heredoc's body); else (an
// eval's words joined, a quote holding an escape) at the text there that
// holds it: its word, its command. rough: a script a program runs (a
// variable's, a git setting's) that this couldn't read, its text alone
// as written, which Access.ts meets crudely as it does a command
// unread; "spent": one left unread as the command's reading had read
// BUDGET scripts already, met crudely alone (its pieces not read on
// their own: Access rough)
export type Part = {
  argv   : Word[];
  plain  : Word[][];
  taken  : Word[];
  dirs   : Dir[];
  env    : Env[];
  redirs : Redir[];
  cwd    : string | null;
  at     : string | null;
  text   : string;
  full   : string;
  root   : boolean;
  fed    : boolean;
  piped  : boolean;
  span   : Span;
  feed?  : Span;
  rough? : boolean | "spent";
};

// a command being read: its words, assignments and redirections so far,
// where its text starts and ends (-1: nothing read yet)
type Cmd = { words: Word[]; env: Env[]; redirs: Redir[]; from: number; to: number };

// a folder a wrapper or option names (Part dirs): its word, and the
// folder it's named from (null: known only as it runs)
type Dir = { word: Word; from: string | null };

// how a part runs, as the wrappers before it left it (at: the shell's
// folder as its command starts, Part at), and where its command is in
// the command parsed (Part span)
type Ctx = { cwd: string | null; at: string | null; root: boolean; fed: boolean; piped: boolean; span: Span };

// a word's values as it is read; made: as Word's (undefined: no mktemp
// in it yet; null: something else in it known only as it runs, a
// command's output after it, or too many values)
type Build = { alts: string[]; dynamic: boolean; glob: boolean; made?: string[] | null };

// a heredoc waiting for its body (the lines after its command's):
// its end line, whether tabs before that are dropped (<<-), whether its
// body expands (an unquoted delimiter), whether its command reads a
// pipe (Scan inpipe as it was read: so does what its body runs), the
// shell as it was then (its body expands so)
type Doc = { delim: string; strip: boolean; expand: boolean; redir: Redir; inpipe: boolean; was: State };

// the reading: the text and where in it; the parts found; the folder
// (null: unknown), the variables set so far, whether one may have been
// set unseen (wild: a source), whether a failure ends the script
// (errexit: set -e read), whether a set -e holds as written (sete: the
// command runs at the top of a bash of its own, as illi's shell tool
// runs it), the heredocs waiting; what wrappers
// around a nested script (bash -c, eval) give its parts; whether its
// commands read another's output (inpipe: after a |, inside a group, a
// subshell or a loop a pipe goes into, inside >(...), a nested script or
// a substitution run by a command that reads one: piped); where the text
// read lies in the command parsed: from base on, as written (null: a
// nested script's, changed as it was read: its parts all placed at box,
// the text there that holds it); the pipelines read, by their parts (the
// first, the one past the last: Part feed); the scripts a command runs
// read so far (read: by text, where they run and what they're given,
// Shell script, so one that every git command of a line runs is read
// once), and how many were read (reads: BUDGET at most); what scripts
// were given of git's settings, each by a short id (ids: given_key); git's settings
// in force for what the git command being read runs (given: its -c and
// its environment's, which git passes on to what it runs, so a git
// command among them reads them as its own); the top of the git
// repository each folder is in, as looked for (tops: Shell repo)
type Scan = {
  src   : string;
  at    : number;
  base  : number | null;
  box   : Span;
  parts : Part[];
  cwd   : string | null;
  vars  : Map<string, Word>;
  wild  : boolean;
  errexit: boolean;
  sete  : boolean;
  docs  : Doc[];
  root  : boolean;
  fed   : boolean;
  inpipe: boolean;
  depth : number;
  pipes : Span[];
  read  : Set<string>;
  reads : number;
  given : Setting[];
  ids   : Map<string, string>;
  tops  : Map<string, string | null>;
};

// what a command run in a subshell changes of the shell, as it was
// before: the folder, the variables, whether one may have been set
// unseen, whether a failure ends the script (set -e) (Scan's)
type State = { cwd: string | null; vars: Map<string, Word>; wild: boolean; errexit: boolean };

// a wrapper's options: those taking a value; those that don't, and those
// whose value is only ever attached (-i, -iX); whether -5 is one (nice).
// With no `flags`, any other option is taken as one without a value (the
// root wrappers': a guess there only changes a question's words); with
// them, any other is refused, so a guess can't take the command's name
// for an option's value
type Opts = { args: string[]; flags?: string[]; tail?: string[]; num?: boolean };

// a program's own options (GLOBALS): those taking a value, those that
// don't (any other: its words left as written), those whose value is
// only ever attached (opt: --exec-path, --exec-path=x), those whose value
// is attached or a number after it (nums: make -j, -j4, -j 4); those
// naming the folder it runs in (dirs); how many of its words name what
// it does (subs: npm run build), its options all before the first;
// whether an option of one dash may be a long one (single: -chdir=x)
type Global = { args: string[]; flags: string[]; opt?: string[]; nums?: string[]; dirs?: string[]; subs: number; single?: boolean };

// a git setting given with a command: its key (null: known only as it
// runs), its value (null: none, a yes), as written; whether it may be
// any setting (any: a key known only as it runs, its value known)
type Setting = { key: string | null; value: Word | null; raw: string; any?: boolean };

// why a command can't be read
class Unread extends Error {}

// Constants
// =========

// the most values a word takes (more: dynamic); the deepest nesting of
// subshells and nested scripts read
const MOST = 16;
const NEST = 64;

// the most scripts one command's reading reads (Shell script; those read
// once already not counted): those past it are left unread, their text
// alone (Part rough "spent"), the rest of the command read as ever
const BUDGET = 2000;

// what scripts are given of git's settings (given_key), by the variables
// and by the settings they're made of: an id for each (Scan ids)
const GIVEN_VARS = new WeakMap<Map<string, Word>, string>();
const GIVEN_SETS = new WeakMap<Setting[], string>();

// what ends a word unquoted
const META = " \t\n;&|()<>";

// an exit, as the command after a || (its own: not piped nor in the
// background, which would run it in a subshell; not a heredoc's body
// read between, scan_list), with no word, a number
// or $? (exit abc, exit 1x: bash says so and goes on). A return, at the
// top of a script not sourced, fails and goes on
const EXITS = /^\s*exit(?:[ \t]+(?:\d{1,3}|\$\?|"\$\?"))?(?:[ \t]*(?:[;\n]|$)|[ \t]+#)/;

// the signal a trap's action runs at that comes only as the shell ends
const END = /^(?:(?:SIG)?EXIT|0)$/i;

// the variables bash keeps its own way: an assignment to them lost or
// changed (FUNCNAME=/x leaves it empty), or their value changing by
// itself (RANDOM, LINENO, REPLY after a read): never known
const SPECIAL = /^(?:BASH\w*|FUNCNAME|_|DIRSTACK|GROUPS|RANDOM|SRANDOM|SECONDS|EPOCH\w+|LINENO|PIPESTATUS|PPID|UID|EUID|HISTCMD|OPTIND|OPTARG|REPLY|MAPFILE|SHELLOPTS|COMP_\w+|READLINE_\w+)$/;

// set's one-letter options and its -o names: any other makes the whole
// set fail, its -e with it
const SET_FLAGS = /^[-+][abefhkmnptuvxBCEHPTo]+$/;
const SET_NAMES = new Set(["allexport", "braceexpand", "emacs", "errexit", "errtrace", "functrace", "hashall", "histexpand", "history", "ignoreeof", "interactive-comments", "keyword", "monitor", "noclobber", "noexec", "noglob", "nolog", "notify", "nounset", "onecmd", "physical", "pipefail", "posix", "privileged", "verbose", "vi", "xtrace"]);

// the special builtins: an assignment before one lasts in POSIX mode and
// in sh (dash), so its variables are known only as it runs after
const SPECIALS = new Set([":", ".", "source", "break", "continue", "eval", "exec", "exit", "export", "readonly", "return", "set", "shift", "times", "trap", "unset"]);

// the reserved words that only group commands: read past
const SKIP = new Set(["if", "then", "elif", "else", "fi", "do", "done", "while", "until", "!", "{", "}"]);

// those whose commands this doesn't follow
const REFUSE = new Set(["case", "esac", "select", "function", "coproc"]);

// the reserved words opening a group or a loop, and those closing one: a
// pipe into one is read by all its commands, and one in a pipeline runs
// in a subshell
const OPENS  = new Set(["{", "if", "while", "until", "for"]);
const CLOSES = new Set(["}", "fi", "done"]);

// the redirections, longest first
const REDIRS = ["<<<", "<<-", "&>>", "<<", "<>", "<&", ">>", ">|", ">&", "&>", "<", ">"];

// the shells whose -c runs a script
const SHELLS = new Set(["sh", "bash", "dash", "zsh", "ksh", "ash", "mksh"]);

// the folders whose programs are the system's, or the user's own on
// their PATH (~/.cargo/bin, ~/.bun/bin): named by their path, still the
// same program (/usr/bin/rm is rm, ~/.cargo/bin/cargo cargo); a program
// elsewhere is its own
const SYSTEM_BINS = ["/bin", "/sbin", "/usr/bin", "/usr/sbin", "/usr/local/bin", "/usr/local/sbin", "/opt/homebrew/bin"];
const BINS = new Set([...SYSTEM_BINS, ...(process.env.PATH ?? "").split(":").filter((d) => path.isAbsolute(d)).map((d) => path.resolve(d))]);

// the wrappers that run the command after their options, each with its
// options (Opts), the words after them before the command (then:
// timeout's duration, flock's file), whether those name a file (held),
// and the options whose value is a file (files: time -o's)
const WRAPS: Record<string, Opts & { then?: number; held?: boolean; files?: string[] }> = {
  builtin  : { args: [], flags: [] },
  chronic  : { args: [], flags: ["-e", "-v"] },
  command  : { args: [], flags: ["-p"] },
  env      : { args: ["-u", "--unset", "-C", "--chdir", "-S", "--split-string"], flags: ["-i", "--ignore-environment", "-0", "--null", "-v", "--debug"] },
  exec     : { args: ["-a"], flags: ["-c", "-l"] },
  flock    : { args: ["-w", "--timeout", "-E", "--conflict-exit-code"], flags: ["-s", "--shared", "-x", "-e", "--exclusive", "-u", "--unlock", "-n", "--nb", "--nonblock", "-o", "--close", "-F", "--no-fork", "--verbose"], then: 1, held: true },
  ionice   : { args: ["-c", "--class", "-n", "--classdata", "-p", "--pid", "-P", "--pgid", "-u", "--uid"], flags: ["-t", "--ignore"] },
  nice     : { args: ["-n", "--adjustment"], flags: [], num: true },
  nohup    : { args: [], flags: [] },
  setsid   : { args: [], flags: ["-c", "--ctty", "-f", "--fork", "-w", "--wait"] },
  stdbuf   : { args: ["-i", "-o", "-e", "--input", "--output", "--error"], flags: [] },
  time     : { args: ["-f", "--format", "-o", "--output"], flags: ["-p", "-v", "--verbose", "-a", "--append", "-q", "--quiet", "--portability"], files: ["-o", "--output"] },
  timeout  : { args: ["-s", "--signal", "-k", "--kill-after"], flags: ["--preserve-status", "--foreground", "-v", "--verbose"], then: 1 },
  unbuffer : { args: [], flags: ["-p"] },
  xargs    : { args: ["-a", "--arg-file", "-d", "--delimiter", "-E", "-I", "-L", "--max-lines", "-n", "--max-args", "-P", "--max-procs", "-s", "--max-chars", "--process-slot-var"], flags: ["-0", "--null", "-r", "--no-run-if-empty", "-t", "--verbose", "-p", "--interactive", "-x", "--exit", "-o", "--open-tty", "--show-limits"], tail: ["-e", "-i", "-l"], files: ["-a", "--arg-file"] },
};

// the wrappers that are this shell's own (a cd after them moves it);
// time only as the keyword: unquoted, a command's first word
const OWN = new Set(["builtin", "command", "time"]);

// the wrappers that run it as root, with their options that take a value
const ROOTS: Record<string, string[]> = {
  sudo   : ["-u", "--user", "-g", "--group", "-h", "--host", "-p", "--prompt", "-C", "--close-from", "-D", "--chdir", "-r", "--role", "-t", "--type", "-T", "--command-timeout", "-U", "--other-user"],
  doas   : ["-u", "-C"],
  pkexec : ["--user"],
  run0   : ["-u", "--user", "-D", "--chdir"],
};

// a root wrapper's options whose value is a file (doas -C: its config)
const ROOT_FILES: Record<string, string[]> = { doas: ["-C"] };

// the programs whose own options may come before the words naming what
// they do, read also with them off (git -C x push origin as git push
// origin, as a wrapper is), so a rule on git push * finds it: each with
// its options as its help gives them (Global). Only options that always
// take a value are among args: one whose value is optional is in opt or
// nums, so it never takes the command's next word. An option not listed
// leaves the command as written alone, as do those changing whether it
// runs at all (make -n, -t, -q: a rule on make deploy * must not be
// saved from a dry run). gh's -R and go's -C go after the words naming
// what they do, so neither is here
const GLOBALS: Record<string, Global> = {
  git      : { args: ["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--attr-source", "--shallow-file"], flags: ["-p", "--paginate", "-P", "--no-pager", "--no-replace-objects", "--no-lazy-fetch", "--no-optional-locks", "--no-advice", "--bare", "--literal-pathspecs", "--no-literal-pathspecs", "--glob-pathspecs", "--noglob-pathspecs", "--icase-pathspecs"], opt: ["--exec-path"], dirs: ["-C"], subs: 1 },
  kubectl  : { args: ["-n", "--namespace", "--context", "--cluster", "--user", "--kubeconfig", "-s", "--server", "--token", "--as", "--as-group", "--as-uid", "--request-timeout", "--cache-dir", "--certificate-authority", "--client-certificate", "--client-key", "--tls-server-name", "--username", "--password", "-v", "--v"], flags: ["--insecure-skip-tls-verify", "--match-server-version", "--warnings-as-errors"], subs: 1 },
  helm     : { args: ["-n", "--namespace", "--kube-context", "--kubeconfig", "--kube-apiserver", "--kube-token", "--registry-config", "--repository-config", "--repository-cache"], flags: ["--debug"], subs: 1 },
  docker   : { args: ["-H", "--host", "-c", "--context", "--config", "-l", "--log-level", "--tlscacert", "--tlscert", "--tlskey"], flags: ["-D", "--debug", "--tls", "--tlsverify"], subs: 1 },
  podman   : { args: ["--connection", "-c", "--url", "--identity", "--root", "--runroot", "--log-level"], flags: ["--remote", "-r"], subs: 1 },
  npm      : { args: ["--prefix", "-C", "-w", "--workspace", "--userconfig", "--cache", "--registry", "--loglevel"], flags: ["-g", "--global", "-ws", "--workspaces", "-s", "--silent", "-q", "--quiet", "-d", "--verbose", "-y", "--yes", "--no-color"], dirs: ["--prefix", "-C"], subs: 2 },
  pnpm     : { args: ["-C", "--dir", "-F", "--filter"], flags: ["-r", "--recursive", "-w", "--workspace-root", "-s", "--silent"], dirs: ["-C", "--dir"], subs: 2 },
  yarn     : { args: ["--cwd"], flags: ["-s", "--silent"], dirs: ["--cwd"], subs: 2 },
  bun      : { args: ["--cwd", "--env-file"], flags: ["--silent", "--bun"], opt: ["--config"], dirs: ["--cwd"], subs: 2 },
  npx      : { args: ["-p", "--package"], flags: ["-y", "--yes", "--no", "-q", "--quiet"], subs: 1 },
  bunx     : { args: ["-p", "--package"], flags: ["--bun"], subs: 1 },
  make     : { args: ["-C", "--directory", "-f", "--file", "--makefile", "-I", "--include-dir", "-o", "--old-file", "-W", "--what-if", "--new-file", "--assume-new", "--assume-old"], flags: ["-s", "--silent", "--quiet", "-k", "--keep-going", "-S", "--no-keep-going", "--stop", "-B", "--always-make", "-i", "--ignore-errors", "-e", "--environment-overrides", "-r", "--no-builtin-rules", "-R", "--no-builtin-variables", "-w", "--print-directory", "--no-print-directory", "-L", "--check-symlink-times", "--warn-undefined-variables", "--trace"], opt: ["-O", "--output-sync", "--debug"], nums: ["-j", "--jobs", "-l", "--load-average", "--max-load"], dirs: ["-C", "--directory"], subs: 1 },
  cargo    : { args: ["-C", "--config", "-Z", "--color"], flags: ["-q", "--quiet", "-v", "--verbose", "--frozen", "--locked", "--offline"], dirs: ["-C"], subs: 1 },
  uv       : { args: ["--directory", "--project", "--config-file", "--cache-dir", "--color"], flags: ["-q", "--quiet", "-v", "--verbose", "--offline", "--no-cache", "-n", "--native-tls", "--no-progress", "--preview", "--isolated"], dirs: ["--directory"], subs: 2 },
  poetry   : { args: ["-C", "--directory", "-P", "--project"], flags: ["-q", "--quiet", "-v", "--verbose", "-n", "--no-interaction", "--no-ansi", "--no-plugins", "--no-cache"], dirs: ["-C", "--directory"], subs: 1 },
  terraform: { args: ["-chdir"], flags: [], dirs: ["-chdir"], subs: 1, single: true },
  tofu     : { args: ["-chdir"], flags: [], dirs: ["-chdir"], subs: 1, single: true },
  systemctl: { args: ["-H", "--host", "-M", "--machine"], flags: ["--user", "--system", "-q", "--quiet", "--now", "--no-block", "--no-pager"], subs: 1 },
  tmux     : { args: ["-L", "-S", "-f", "-T"], flags: ["-2", "-C", "-l", "-N", "-u", "-v", "-D"], subs: 1 },
  aws      : { args: ["--profile", "--region", "--output", "--endpoint-url", "--query", "--ca-bundle", "--cli-read-timeout", "--cli-connect-timeout", "--color"], flags: ["--debug", "--no-verify-ssl", "--no-paginate", "--no-sign-request", "--no-cli-pager"], subs: 2 },
  gcloud   : { args: ["--project", "--account", "--configuration", "--format", "--verbosity", "--impersonate-service-account", "--billing-project", "--flags-file"], flags: ["-q", "--quiet", "--log-http", "--no-user-output-enabled"], subs: 2 },
  az       : { args: ["--subscription", "-o", "--output", "--query"], flags: ["--debug", "--verbose", "--only-show-errors"], subs: 2 },
};

// git's settings whose value is a command it runs (-c key=value), as
// git help --config gives them: read as a script of their own. An
// alias's is one only past a !, else it stands for git's words (Shell
// git_settings); a submodule's update only past a !, else a way to
// update
const GIT_RUNS = /^(?:core\.(?:sshcommand|pager|editor|fsmonitor|askpass|gitproxy|alternaterefscommand)|tar\..+\.command|sequence\.editor|diff\.external|diff\..+\.(?:textconv|command)|(?:diff|merge)tool\..+\.cmd|merge\..+\.driver|filter\..+\.(?:clean|smudge|process)|credential(?:\..+)?\.helper|gpg(?:\..+)?\.program|gpg\.ssh\.defaultkeycommand|pager\..+|interactive\.difffilter|remote\..+\.(?:uploadpack|receivepack)|trailer\..+\.(?:cmd|command)|sendemail\.(?:tocmd|cccmd|headercmd|sendmailcmd)|submodule\..+\.update|imap\.tunnel|web\.browser|browser\..+\.cmd|man\..+\.cmd|uploadpack\.packobjectshook)$/i;

// a setting's value that is a yes or a no (pager.diff=false), never a
// command
const GIT_BOOL = /^(?:true|false|yes|no|on|off|1|0|)$/i;

// the variables giving git settings (Shell git_env): read where they are
// set too, and kept into a shell of its own (bash -c), as exported ones
// reach it
const GIT_CONF = /^GIT_CONFIG_(?:KEY_\d+|VALUE_\d+|PARAMETERS|COUNT)$/;

// how many ways an option word of several values is read at most
// (Shell ways)
const WAYS = 8;

// the variables that name a command a program runs (git's, ssh's, any
// editor's or pager's): one set (given to a command, exported or
// assigned) to plain words is read as a script of its own, as what
// sets it may run it
const RUNS = new Set(["GIT_SSH_COMMAND", "GIT_SSH", "GIT_EDITOR", "GIT_SEQUENCE_EDITOR", "GIT_PAGER", "GIT_EXTERNAL_DIFF", "GIT_ASKPASS", "GIT_PROXY_COMMAND", "SSH_ASKPASS", "EDITOR", "VISUAL", "PAGER", "MANPAGER", "GH_EDITOR", "GH_PAGER", "KUBE_EDITOR", "SUDO_EDITOR", "BROWSER"]);

// the builtins whose name=value words set variables (export EDITOR=x)
const DECLARES = new Set(["export", "declare", "typeset", "local", "readonly"]);

// watch's options that take a value
const WATCH = ["-n", "--interval", "-q", "--equexit"];

// find's actions that run a command on what it finds
const EXECS = new Set(["-exec", "-execdir", "-ok", "-okdir"]);

// a variable known only as the command runs
const DYN: Word = { alts: [""], raw: "", dynamic: true, glob: false, fd: false };

// $'...''s escapes
const ESC: Record<string, string> = { n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", e: "\x1b", E: "\x1b", f: "\f", v: "\v", "\\": "\\", "'": "'", '"': '"', "?": "?" };

// the variables an arithmetic sets (x = 1, x += 1, x++, --x)
const SETS = /([A-Za-z_]\w*)\s*(?:[-+*\/%&|^]|<<|>>)?=(?!=)|([A-Za-z_]\w*)\s*(?:\+\+|--)|(?:\+\+|--)\s*([A-Za-z_]\w*)/g;

// Shell
// =====

export namespace Shell {

  // a command's parts, read as bash would in cwd; a string: why it can't
  // be read so (any failure of the reading too: never a throw, so a bug
  // here asks rather than lets a command through). Their spans count from
  // `at`, so a heredoc's body read again is placed in the command holding
  // it (Redir at); at a span instead, all of them are placed there (a body
  // whose text isn't there as written). Not sete: run where a set -e in
  // it may not hold (a wrapper illi doesn't make, as Claude Code's Bash
  // runs it in: an eval inside a && list ignores it), so none is trusted
  export function parse(command: string, cwd: string, at: number | Span = 0, sete = true): Part[] | string {
    const [base, box]: [number | null, Span] = typeof at === "number" ? [at, [at, at + command.length]] : [null, at];
    const s: Scan = { src: command, at: 0, base, box, parts: [], cwd, vars: new Map(), wild: false, errexit: false, sete, docs: [], root: false, fed: false, inpipe: false, depth: 0, pipes: [], read: new Set(), reads: 0, given: [], ids: new Map(), tops: new Map() };
    try {
      scan_list(s, "");
      pipe_feeds(s);
      return s.parts;
    } catch (err: any) {
      return err instanceof Unread ? err.message : "illi failed to read it (" + String(err?.message ?? err) + ")";
    }
  }

  // a user's home folder, as ~name names it: their passwd entry's, the
  // user illi runs as by that name its home; null: not found (the
  // system's other user databases may know them)
  export function home(name: string): string | null {
    try {
      const entry = fs.readFileSync("/etc/passwd", "utf8").split("\n").find((l) => l.startsWith(name + ":"))?.split(":")[5];
      if (entry) {
        return entry;
      }
    } catch {}
    return name === os.userInfo().username ? os.homedir() : null;
  }

  // the program a word names: its name ("" for one known only as it
  // runs, a glob, or named by a path outside the system's folders: its
  // own)
  export function program(w: Word | undefined): string {
    if (w === undefined || w.dynamic || w.glob || w.alts.length !== 1) {
      return "";
    }
    const x = w.alts[0];
    return !x.includes("/") ? x : BINS.has(path.dirname(x)) ? path.basename(x) : "";
  }

  // a plain word, as if written unquoted
  export function lit(x: string): Word {
    return { alts: [x], raw: x, dynamic: false, glob: false, fd: false };
  }

  // a path from a folder as the system finds it: each .. from where the
  // folder before it really is (link/.. is the folder holding the link's
  // target, not the one holding the link; only cd takes .. as written),
  // the rest as named; a name that doesn't exist yet as a plain folder's
  export function walk(cwd: string, p: string): string {
    let at = path.isAbsolute(p) ? "/" : cwd;
    for (const name of p.split("/")) {
      if (name === "..") {
        at = path.dirname(really(at));
      } else if (name !== "" && name !== ".") {
        at = path.join(at, name);
      }
    }
    return at;
  }

  // where a part is in the command parsed, with the heredocs' bodies it
  // reads (after its line: Redir at) and what writes the pipe it reads
  // or gives it its input (Part feed): all it acts on
  export function held(part: Part): Span {
    return span_join(part_reach(part), part.feed ?? part.span);
  }

  // a word from its nth character on (an option's value: --to=x; as
  // written too where those characters are, quoted or not: "k=$v" as
  // "$v", placed nowhere then, as it isn't there as written)
  export function cut(w: Word, n: number): Word {
    const known = w.alts.every((a) => a.length >= n);
    const head = w.alts[0].slice(0, n);
    const quoted = /^["']/.test(w.raw) && w.raw.slice(1, 1 + n) === head && !/["'\\$`]/.test(head);
    const raw = w.raw.startsWith(head) ? w.raw.slice(n) : quoted ? w.raw[0] + w.raw.slice(1 + n) : w.raw;
    const at = w.at === undefined || raw === w.raw ? w.at : quoted ? undefined : w.at + n;
    const { made, ...rest } = w;
    const cut = made?.every((a) => a.length >= n) ? { made: made.map((a) => a.slice(n)) } : {};
    return known ? { ...rest, alts: w.alts.map((a) => a.slice(n)), raw, at, ...cut } : { ...DYN, raw };
  }

  // a wrapper's options (Opts), taken off its words: the words after
  // them, the values of those taking one (-n 5, -n5, --name=5, -0n5), and
  // the first it doesn't know (null: none)
  export function opts(words: Word[], o: Opts): { rest: Word[]; got: Map<string, Word>; odd: string | null } {
    const got = new Map<string, Word>();
    const known = (x: string) => o.flags === undefined || o.flags.includes(x) || (o.num === true && /^-\d+$/.test(x));
    let k = 0;
    while (k < words.length) {
      const w = words[k];
      const x = w.alts[0];
      if (w.dynamic || w.alts.length !== 1 || !x.startsWith("-") || x === "-") {
        break;
      }
      k++;
      if (x === "--") {
        break;
      }
      const eq = x.indexOf("=");
      const long = x.startsWith("--") ? (eq > 0 ? x.slice(0, eq) : x) : null;
      if (long !== null && o.args.includes(long)) {
        got.set(long, eq > 0 ? Shell.cut(w, eq + 1) : words[k++] ?? DYN);
      } else if (long !== null || /^-\d+$/.test(x)) {
        if (!known(x) || eq > 0) {
          return { rest: words.slice(k - 1), got, odd: x };
        }
      } else {
        for (let i = 1; i < x.length; i++) {
          const one = "-" + x[i];
          if (o.args.includes(one)) {
            got.set(one, i + 1 < x.length ? Shell.cut(w, i + 1) : words[k++] ?? DYN);
            break;
          }
          if (o.tail?.includes(one)) {
            got.set(one, Shell.cut(w, i + 1));
            break;
          }
          if (!known(one)) {
            return { rest: words.slice(k - 1), got, odd: x };
          }
        }
      }
    }
    return { rest: words.slice(k), got, odd: null };
  }

}

// Reading
// =======

// commands till the text ends, or (close ")") the ) that closes them. A
// line ending in |, &&, || goes on to the next (a heredoc's body read
// between), as bash reads it; a subshell, a group or a loop a pipe goes
// into reads it in all its commands, as does all a command reading it
// runs, read while it is (Scan inpipe: the group's, or the pipe just
// read; back as it closes). A group or a loop in a pipeline or the
// background runs in a subshell, as bash runs it: a cd in it moves the
// commands after it in it, not those after it (State); the redirections
// after one are made where the shell was as it began, its input given
// to the commands in it (stdin_give), as a subshell's is. Each
// pipeline's parts kept (Scan pipes)
function scan_list(s: Scan, close: string): void {
  let cmd = cmd_new();
  let piped = false;
  let goes = false;
  let head = -1;
  let neg = false;
  let andor = false;
  const outer = s.inpipe;
  let level = outer;
  let closed: { was: State | null; from: number } | null = null;
  const groups: Array<{ level: boolean; piped: boolean; was: State; from: number; head: number }> = [];
  const group = (word: string, was: State | null) => {
    if (was !== null) {
      groups.push({ level, piped, was, from: s.parts.length, head });
      level ||= piped;
      piped = false;
    } else if (CLOSES.has(word) && groups.length > 0) {
      const g = groups.pop()!;
      level = g.level;
      if (g.piped) {
        state_put(s, g.was);
        s.pipes.push([g.head, s.parts.length]);
        head = g.head;
      }
      closed = { was: g.piped ? null : g.was, from: g.from };
    }
    s.inpipe = level || piped;
  };
  const end = (op: string) => {
    const pipe  = op === "|" || op === "|&";
    const sub   = pipe || op === "&";
    const after = cmd.words.length === 0 && cmd.env.length === 0 ? closed : null;
    const to    = s.parts.length;
    const at    = place(s, cmd.from, cmd.to);
    const now   = after?.was == null ? null : state_of(s);
    const list  = op === "&&" || op === "||";
    const exits = op === "||" && s.docs.length === 0 && EXITS.test(s.src.slice(s.at));
    const plain = s.depth === 0 && groups.length === 0 && !neg && !piped && !sub && !andor;
    closed = null;
    if (after?.was != null) {
      state_put(s, after.was);
    }
    cmd_end(s, cmd, piped, sub, plain && !list, plain && (list ? exits : s.errexit));
    [andor, neg] = [list, false];
    if (after !== null) {
      stdin_give(s, after.from, to, cmd.redirs, s.cwd, at);
    }
    if (now !== null && !sub) {
      state_put(s, now);
    }
    if (piped && !pipe) {
      s.pipes.push([head, s.parts.length]);
    }
    piped = pipe;
    goes = pipe || op === "&&" || op === "||";
    head = pipe ? head : -1;
    cmd = cmd_new();
    s.inpipe = level || piped;
  };
  for (;;) {
    blank(s, false);
    const from = s.at;
    const c = s.src[s.at];
    const two = s.src.slice(s.at, s.at + 2);
    head = head < 0 ? s.parts.length : head;
    goes &&= c === "\n" || c === "#";
    if (c === undefined) {
      if (close !== "") {
        throw new Unread("a " + close + " is missing");
      }
      end("");
      docs_read(s);
      s.inpipe = outer;
      return;
    }
    if (c === "#") {
      while (s.at < s.src.length && s.src[s.at] !== "\n") {
        s.at++;
      }
      continue;
    }
    if (c === "\n") {
      s.at++;
      if (!goes) {
        end("\n");
      }
      docs_read(s);
      continue;
    }
    if (c === ")") {
      if (close !== ")") {
        throw new Unread("a ) without its (");
      }
      s.at++;
      end("");
      s.inpipe = outer;
      return;
    }
    if (c === ";") {
      if (two === ";;" || two === ";&") {
        throw new Unread("case");
      }
      s.at++;
      end(";");
      continue;
    }
    if (two === "&&" || two === "||" || two === "|&") {
      s.at += 2;
      end(two);
      continue;
    }
    if ((c === "&" && two !== "&>") || c === "|") {
      s.at++;
      end(c);
      continue;
    }
    if (c === "(" && two !== "((") {
      if (!cmd_empty(cmd)) {
        throw new Unread("a ( after a command's words (a function or an array)");
      }
      const from = s.parts.length;
      s.at++;
      scope(s, () => scan_list(s, ")"));
      closed = { was: null, from };
      continue;
    }
    if (two === "((" && cmd_empty(cmd)) {
      cmd.words.push(Shell.lit("(("));
      s.at = arith(s, s.at + 2);
    } else if (two === "<(" || two === ">(") {
      cmd_word(s, cmd, scan_proc(s));
    } else if (c === "<" || c === ">" || two === "&>") {
      scan_redir(s, cmd);
    } else if (cmd_empty(cmd) && two === "[[" && /^[\s]?$/.test(s.src[s.at + 2] ?? "")) {
      scan_test(s, cmd);
    } else {
      const word = scan_word(s);
      if (word.raw === "") {
        throw new Unread("a " + c + " where bash doesn't take one");
      }
      if ((s.src[s.at] === "<" || s.src[s.at] === ">") && /^(\d+|\{[A-Za-z_]\w*\})$/.test(word.raw)) {
        scan_redir(s, cmd, word.raw);
      } else {
        const was = cmd_empty(cmd) && OPENS.has(word.raw) ? state_of(s) : null;
        if (!cmd_word(s, cmd, word)) {
          neg ||= word.raw === "!";
          group(word.raw, was);
          continue;
        }
      }
    }
    if (cmd.from < 0) {
      cmd.from = from;
    }
    cmd.to = s.at;
  }
}

// spaces, tabs, a line's end escaped; newlines too if nl
function blank(s: Scan, nl: boolean): void {
  for (;;) {
    const c = s.src[s.at];
    if (c === " " || c === "\t" || (nl && c === "\n")) {
      s.at++;
    } else if (c === "\\" && s.src[s.at + 1] === "\n") {
      s.at += 2;
    } else {
      return;
    }
  }
}

// a word: quotes taken off, escapes and expansions done as far as known
function scan_word(s: Scan): Word {
  const start = s.at;
  const b: Build = { alts: [""], dynamic: false, glob: false };
  for (;;) {
    const c = s.src[s.at];
    if (c === undefined || META.includes(c)) {
      break;
    }
    if (c === "\\") {
      const n = s.src[s.at + 1];
      s.at += n === undefined ? 1 : 2;
      if (n !== undefined && n !== "\n") {
        add(b, [n]);
      }
    } else if (c === "'") {
      const e = s.src.indexOf("'", s.at + 1);
      if (e < 0) {
        throw new Unread("a ' isn't closed");
      }
      add(b, [s.src.slice(s.at + 1, e)]);
      s.at = e + 1;
    } else if (c === "$" && s.src[s.at + 1] === "'") {
      s.at += 2;
      add(b, [scan_ansi(s)]);
    } else if (c === "$" && s.src[s.at + 1] === '"') {
      s.at++;
    } else if (c === '"') {
      s.at++;
      scan_quoted(s, b);
    } else if (c === "$") {
      scan_dollar(s, b, !/^[A-Za-z_]\w*\+?=/.test(s.src.slice(start, s.at)));
    } else if (c === "`") {
      output(s, b, scan_tick(s), !/^[A-Za-z_]\w*\+?=/.test(s.src.slice(start, s.at)));
    } else if (c === "~" && (s.at === start || /^[A-Za-z_]\w*\+?=$/.test(s.src.slice(start, s.at)))) {
      scan_tilde(s, b);
    } else if (c === "{" && brace(s.src, s.at) !== null) {
      const x = brace(s.src, s.at)!;
      if (x === "many") {
        unknown(b);
        add(b, [c]);
        s.at++;
      } else {
        const alts = s.at === start ? brace_tilde(s, x.alts, s.src[x.end]) : x.alts;
        if (alts === null) {
          unknown(b);
        }
        add(b, alts ?? []);
        b.glob ||= x.alts.some((a) => /[*?[]/.test(a));
        s.at = x.end;
      }
    } else {
      b.glob ||= c === "*" || c === "?" || (c === "[" && closes(s.src, s.at));
      add(b, [c]);
      s.at++;
    }
  }
  return { alts: b.alts, raw: s.src.slice(start, s.at), dynamic: b.dynamic, glob: b.glob, fd: false, at: start, ...(Array.isArray(b.made) ? { made: b.made } : {}) };
}

// whether a [ at src[at] opens a bracket expression: a ] closes it
// before its word ends (else bash takes it as itself, as in [ -f x ])
function closes(src: string, at: number): boolean {
  for (let i = at + 1; i < src.length; i++) {
    const c = src[i];
    if (c === "]") {
      return true;
    }
    if (META.includes(c)) {
      return false;
    }
    if (c === "\\") {
      i++;
    } else if (c === "'" || c === '"') {
      i = src.indexOf(c, i + 1);
      if (i < 0) {
        return false;
      }
    }
  }
  return false;
}

// a brace expansion at src[at] (a {): where it ends and its values ({a,b}:
// a and b; {1..3}, {a..c}: each; nested ones too); "many": past MOST
// values, or holding what this doesn't expand (quotes, $, `, \: the word
// is then known only as it runs, its characters still read one by one, so
// a command in it is still found); null: not one (no comma nor .. at its
// top, or the word ends first), a plain {
function brace(src: string, at: number): { end: number; alts: string[] } | "many" | null {
  const items: string[] = [];
  let [depth, from, odd] = [0, at + 1, false];
  for (let i = at; i < src.length; i++) {
    const c = src[i];
    if (META.includes(c)) {
      return null;
    }
    odd ||= "'\"$`\\".includes(c);
    if (c === "{") {
      depth++;
    } else if (c === "," && depth === 1) {
      items.push(src.slice(from, i));
      from = i + 1;
    } else if (c === "}" && --depth === 0) {
      items.push(src.slice(from, i));
      const seq = items.length === 1 ? brace_seq(items[0]) : null;
      if (items.length < 2 && seq === null) {
        return null;
      }
      const each = seq !== null ? (seq === "many" ? null : seq) : items.map(brace_all);
      const alts = odd || each === null || each.some((x) => x === null) ? null : each.flatMap((x) => x ?? []);
      return alts === null || alts.length > MOST ? "many" : { end: i + 1, alts };
    }
  }
  return null;
}

// a text with every brace expansion in it done (null: too many values)
function brace_all(text: string): string[] | null {
  for (let i = 0; i < text.length; i++) {
    const x = text[i] === "{" ? brace(text, i) : null;
    if (x === "many") {
      return null;
    }
    if (x !== null) {
      const tail = brace_all(text.slice(x.end));
      const out = tail === null ? null : x.alts.flatMap((a) => tail.map((t) => text.slice(0, i) + a + t));
      return out === null || out.length > MOST ? null : out;
    }
  }
  return [text];
}

// {1..5} or {a..e}'s values (an optional step after another ..); null:
// not a sequence; "many": past MOST
function brace_seq(item: string): string[] | "many" | null {
  const num = /^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/.exec(item);
  const chr = /^([a-zA-Z])\.\.([a-zA-Z])(?:\.\.(-?\d+))?$/.exec(item);
  const m = num ?? chr;
  if (m === null) {
    return null;
  }
  const [a, b] = num !== null ? [Number(m[1]), Number(m[2])] : [m[1].charCodeAt(0), m[2].charCodeAt(0)];
  const step = Math.abs(Number(m[3] ?? 1)) || 1;
  if (Math.abs(b - a) / step + 1 > MOST) {
    return "many";
  }
  const out: string[] = [];
  for (let x = a; a <= b ? x <= b : x >= b; x += a <= b ? step : -step) {
    out.push(num !== null ? String(x) : String.fromCharCode(x));
  }
  return out;
}

// text added to each value a word can take (none once it is dynamic: its
// known head stays); past MOST values, nothing of it is known
function add(b: Build, xs: string[]): void {
  if (Array.isArray(b.made)) {
    b.made = b.made.flatMap((a) => xs.map((x) => a + x));
    b.made = b.made.length > MOST ? null : b.made;
  }
  if (!b.dynamic) {
    b.alts = b.alts.flatMap((a) => xs.map((x) => a + x));
    if (b.alts.length > MOST) {
      unknown(b);
      b.alts = [""];
    }
  }
}

// a word known only as it runs from here on, whatever a mktemp in it
// makes (Build made: none)
function unknown(b: Build): void {
  b.dynamic = true;
  b.made = null;
}

// inside double quotes, from after the opening one: $ and ` still expand
function scan_quoted(s: Scan, b: Build): void {
  for (;;) {
    const c = s.src[s.at];
    const n = s.src[s.at + 1];
    if (c === undefined) {
      throw new Unread('a " isn\'t closed');
    }
    if (c === '"') {
      s.at++;
      return;
    }
    if (c === "\\" && n !== undefined && "$`\"\\\n".includes(n)) {
      s.at += 2;
      if (n !== "\n") {
        add(b, [n]);
      }
    } else if (c === "$") {
      scan_dollar(s, b);
    } else if (c === "`") {
      output(s, b, scan_tick(s));
    } else {
      add(b, [c]);
      s.at++;
    }
  }
}

// a $: an arithmetic, a command's output, a variable, or itself; split:
// unquoted, outside an assignment, where bash splits a value into words
// and globs it (var_put). A ${x=...} or ${x:=...} sets x: known only as
// it runs after; any other = in one (nested, ${!x:=...}, a pattern) may
// set any: all forgotten
function scan_dollar(s: Scan, b: Build, split = false): void {
  const rest = s.src.slice(s.at, s.at + 3);
  if (rest === "$((") {
    s.at = arith(s, s.at + 3);
    unknown(b);
    return;
  }
  if (rest.startsWith("$(")) {
    const from = s.at + 2;
    s.at = from;
    scope(s, () => scan_list(s, ")"));
    output(s, b, s.src.slice(from, s.at - 1), split);
    return;
  }
  if (rest.startsWith("${")) {
    const end = brace_end(s, s.at + 2);
    const body = s.src.slice(s.at + 2, end - 1);
    s.at = end;
    if (/`|\$\(/.test(body)) {
      throw new Unread("a command inside ${...}");
    }
    const set = /^([A-Za-z_]\w*):?=/.exec(body);
    if (/^[A-Za-z_]\w*$/.test(body)) {
      var_put(s, b, body, split);
    } else {
      unknown(b);
    }
    if (set !== null && !body.slice(set[0].length).includes("=")) {
      var_set(s, set[1], DYN);
    } else if (body.includes("=")) {
      forget(s);
    }
    return;
  }
  const name = /^\$([A-Za-z_]\w*)/.exec(s.src.slice(s.at));
  if (name !== null) {
    s.at += name[0].length;
    var_put(s, b, name[1], split);
  } else if (/^\$[0-9@*#?$!-]/.test(rest)) {
    s.at += 2;
    unknown(b);
  } else {
    add(b, ["$"]);
    s.at++;
  }
}

// a variable's values put in a word: as the command set it, else as the
// environment has it (PWD: the folder followed); else known only as it
// runs (as is any after a source: it may have set them; any bash keeps
// its own way, SPECIAL). Split (bash
// splits an unquoted value into words, and globs it): one holding a
// space is known only as it runs (x="rm -rf src"; $x is three words, a
// command), one holding *, ? or [ a glob
function var_put(s: Scan, b: Build, name: string, split = false): void {
  if (SPECIAL.test(name)) {
    unknown(b);
    return;
  }
  const v = s.vars.get(name);
  const known = v !== undefined ? v.alts : name === "PWD" ? (s.cwd === null ? null : [s.cwd]) : s.wild || name === "OLDPWD" || process.env[name] === undefined ? null : [process.env[name]!];
  if (known === null || (split && (ifs(s) || known.some((x) => /[ \t\n]/.test(x))))) {
    unknown(b);
    return;
  }
  add(b, known);
  b.glob ||= v?.glob === true || (split && known.some((x) => /[*?[]/.test(x)));
  if (v?.dynamic === true) {
    unknown(b);
  }
}

// whether IFS may be set (by the command, or by a source), so bash may
// split a value where illi wouldn't (IFS=/ splits /a into "" and a);
// bash takes none from the environment
function ifs(s: Scan): boolean {
  return s.wild || s.vars.has("IFS");
}

// a command's output put in a word: the folder for pwd (-L, -P), the
// repository's top (the nearest folder up holding .git) for git rev-parse
// --show-toplevel; else, or once a source or an assignment (PATH,
// GIT_DIR, TMPDIR) may have changed what they'd say, or while the
// environment's GIT_DIR or GIT_WORK_TREE points git elsewhere, known only
// as it runs (as is one of several lines, its status the last's). The
// file or folder mktemp makes (temp) is known only if
// it makes it (Word made: a failed one's output is empty; a command's
// output after it, whose status the assignment's would be, drops it).
// Split as var_put's
function output(s: Scan, b: Build, inner: string, split = false): void {
  const cmd = inner.includes("\n") ? "" : inner.trim().replace(/\s+/g, " ");
  b.made = Array.isArray(b.made) ? null : b.made;
  const odd = s.cwd === null || s.wild || ["PATH", "GIT_DIR", "GIT_WORK_TREE", "TMPDIR"].some((n) => s.vars.has(n));
  const git = cmd === "git rev-parse --show-toplevel" && process.env.GIT_DIR === undefined && process.env.GIT_WORK_TREE === undefined;
  const known = odd ? null : /^pwd( -[LP])?$/.test(cmd) ? s.cwd : git ? git_top(s.cwd!) : null;
  const made = odd || known !== null ? null : temp(cmd, s.cwd!);
  const was = b.made === null ? null : (b.made ?? (b.dynamic ? null : b.alts));
  if (made !== null && was !== null && !(split && (ifs(s) || /[ \t\n*?[]/.test(made)))) {
    b.made = was.length > MOST ? null : was.map((a) => a + made);
    b.dynamic = true;
    return;
  }
  if (known === null || (split && (ifs(s) || /[ \t\n]/.test(known)))) {
    unknown(b);
    return;
  }
  add(b, [known]);
  b.glob ||= split && /[*?[]/.test(known);
}

// where mktemp makes its file or folder, its X's kept (a new name in that
// folder, so a check judges where it is): its template (tmp.XXXXXXXXXX
// if none) in -p's or --tmpdir's folder; in TMPDIR's (else /tmp) with -t,
// a bare --tmpdir or no template; else as the template says, from the
// folder it runs in. Only where it would make it: a template ending in
// three X's at least (GNU's -t takes a template, BSD's a prefix; with
// those X's either lands there), a suffix with no /, a folder there now.
// null: not mktemp, not read so (a word quoted or expanded, an option
// it doesn't know, -t with -p: TMPDIR's or -p's), or one that fails
function temp(cmd: string, cwd: string): string | null {
  const words = cmd.split(" ");
  if (words[0] !== "mktemp" || words.some((w) => !/^[\w.\/@%+=:,-]+$/.test(w))) {
    return null;
  }
  let [dir, template, suffix, t, tmpdir]: [string | null, string | null, string, boolean, boolean] = [null, null, "", false, false];
  for (let k = 1; k < words.length; k++) {
    const w = words[k];
    if (/^-[dqu]+$/.test(w) || ["--directory", "--quiet", "--dry-run"].includes(w)) {
      continue;
    }
    if (w === "-t" || w === "--tmpdir" || w === "--tmpdir=") {
      [t, tmpdir] = [t || w === "-t", true];
    } else if (w.startsWith("--tmpdir=")) {
      dir = w.slice("--tmpdir=".length);
    } else if (w.startsWith("--suffix=")) {
      suffix = w.slice("--suffix=".length);
    } else if (w === "-p" && k + 1 < words.length) {
      dir = words[++k];
    } else if (!w.startsWith("-") && template === null) {
      template = w;
    } else {
      return null;
    }
  }
  const away = dir !== null || tmpdir || template === null;
  const name = template ?? "tmp.XXXXXXXXXX";
  if ((t && dir !== null) || (away && name.includes("/")) || !/X{3,}$/.test(name) || suffix.includes("/")) {
    return null;
  }
  const at = path.resolve(cwd, away ? (dir ?? (process.env.TMPDIR || "/tmp")) : ".", name);
  try {
    return fs.statSync(path.dirname(at)).isDirectory() ? at + suffix : null;
  } catch {
    return null;
  }
}

// a folder's repository top: it or the nearest folder above holding a
// .git (a worktree's file too); null: none
function git_top(dir: string): string | null {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, ".git"))) {
      return d;
    }
    if (path.dirname(d) === d) {
      return null;
    }
  }
}

// past a ${...} from its body's start: after its closing }
function brace_end(s: Scan, from: number): number {
  let depth = 0;
  for (let i = from; i < s.src.length; i++) {
    const c = s.src[i];
    if (c === "\\") {
      i++;
    } else if (c === "'") {
      i = s.src.indexOf("'", i + 1);
      if (i < 0) {
        break;
      }
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      if (depth === 0) {
        return i + 1;
      }
      depth--;
    }
  }
  throw new Unread("a ${ isn't closed");
}

// an arithmetic from its body's start (after $(( or (( ): where it ends
// (after its )) ). One holding a command can't be read; the variables
// it sets are known only as it runs
function arith(s: Scan, from: number): number {
  let depth = 0;
  for (let i = from; i < s.src.length; i++) {
    const c = s.src[i];
    if (c === "(") {
      depth++;
    } else if (c === ")" && depth > 0) {
      depth--;
    } else if (c === ")") {
      if (s.src[i + 1] !== ")") {
        break;
      }
      const body = s.src.slice(from, i);
      if (/`|\$\(/.test(body)) {
        throw new Unread("a command inside an arithmetic");
      }
      for (const m of body.matchAll(SETS)) {
        var_set(s, m[1] ?? m[2] ?? m[3], DYN);
      }
      if (body.includes("${")) {
        forget(s);
      }
      return i + 2;
    }
  }
  throw new Unread("an arithmetic isn't closed");
}

// a `command`: its text (\`, \$, \\ unescaped) read as a subshell's
// (placed as written, but with one of those in it: at the whole `...`);
// the text returned
function scan_tick(s: Scan): string {
  const start = s.at;
  let inner = "";
  let i = s.at + 1;
  for (;;) {
    const c = s.src[i];
    const n = s.src[i + 1];
    if (c === undefined) {
      throw new Unread("a ` isn't closed");
    }
    if (c === "`") {
      break;
    }
    if (c === "\\" && n !== undefined && "`$\\".includes(n)) {
      inner += n;
      i += 2;
    } else {
      inner += c;
      i++;
    }
  }
  s.at = i + 1;
  const same = inner.length === i - start - 1;
  scope(s, () => scan_text(s, inner, same ? start + 1 : null, place(s, start, s.at)));
  return inner;
}

// $'...' from after its quote: its text, escapes done
function scan_ansi(s: Scan): string {
  let out = "";
  for (;;) {
    const c = s.src[s.at];
    if (c === undefined) {
      throw new Unread("a $' isn't closed");
    }
    s.at++;
    if (c === "'") {
      return out;
    }
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = s.src[s.at] ?? "";
    const code = /^x([0-9a-fA-F]{1,2})|^u([0-9a-fA-F]{1,4})|^U([0-9a-fA-F]{1,8})|^([0-7]{1,3})|^c(.)/.exec(s.src.slice(s.at));
    if (ESC[n] !== undefined) {
      out += ESC[n];
      s.at++;
    } else if (code !== null) {
      const point = code[5] !== undefined ? code[5].charCodeAt(0) & 31 : parseInt(code[1] ?? code[2] ?? code[3] ?? code[4], code[4] !== undefined ? 8 : 16);
      if (point > 0x10ffff) {
        throw new Unread("a $'\\U' past Unicode");
      }
      out += String.fromCodePoint(point);
      s.at += code[0].length;
    } else {
      out += "\\" + n;
      s.at++;
    }
  }
}

// a ~ starting a word (or an assignment's value): the home folder; ~+,
// the folder followed; another user's, by their passwd entry (one not
// there, or ~-, known only as it runs). One a brace goes on (~{,/x}) as
// bash takes it: the braces first, then each value's ~ (brace_tilde)
function scan_tilde(s: Scan, b: Build): void {
  const rest = s.src.slice(s.at);
  const m = /^~([A-Za-z0-9._-]*|[+-])(?=\/|[\s;&|()<>]|$)/.exec(rest);
  if (m === null) {
    const name = /^~[A-Za-z0-9._+-]*/.exec(rest)![0];
    const x = rest[name.length] === "{" ? brace(s.src, s.at + name.length) : null;
    const alts = x === null || x === "many" ? null : brace_tilde(s, x.alts.map((a) => name + a), s.src[x.end]);
    if (x !== null && alts === null) {
      unknown(b);
    }
    add(b, alts ?? ["~"]);
    b.glob ||= x !== null && x !== "many" && x.alts.some((a) => /[*?[]/.test(a));
    s.at = x === null || x === "many" ? s.at + 1 : x.end;
    return;
  }
  s.at += m[0].length;
  const home = tilde(s, m[1]);
  if (home === null) {
    unknown(b);
  }
  add(b, home ?? []);
}

// a ~'s folder by its name (home's for none, ~+ the folder followed,
// another user's: Shell.home); null: known only as it runs
function tilde(s: Scan, name: string): string[] | null {
  if (name === "+" || name === "-") {
    return name === "+" && s.cwd !== null ? [s.cwd] : null;
  }
  if (name !== "") {
    const home = Shell.home(name);
    return home === null ? null : [home];
  }
  const b: Build = { alts: [""], dynamic: false, glob: false };
  var_put(s, b, "HOME");
  return b.dynamic ? null : b.alts;
}

// a brace's values at a word's start, a ~ starting one expanded as a
// word's (bash expands braces first: {~,x}/y is ~/y and x/y); null: one
// known only as it runs (another user's not in passwd; a ~ whose name
// goes on past the brace)
function brace_tilde(s: Scan, alts: string[], next: string | undefined): string[] | null {
  const out: string[] = [];
  for (const a of alts) {
    const m = /^~[^/]*/.exec(a);
    const ends = m === null || m[0].length < a.length || next === undefined || next === "/" || META.includes(next);
    const home = m === null || !ends ? null : tilde(s, m[0].slice(1));
    if (m !== null && home === null) {
      return null;
    }
    out.push(...(home === null ? [a] : home.map((h) => h + a.slice(m![0].length))));
  }
  return out;
}

// <(...) or >(...): its commands, a subshell's (>(...)'s reading the
// command's output, as a pipe's); the word, a /dev/fd file
function scan_proc(s: Scan): Word {
  const start = s.at;
  const was = s.inpipe;
  s.inpipe ||= s.src[s.at] === ">";
  s.at += 2;
  try {
    scope(s, () => scan_list(s, ")"));
  } finally {
    s.inpipe = was;
  }
  return { alts: ["/dev/fd/63"], raw: s.src.slice(start, s.at), dynamic: false, glob: false, fd: true };
}

// a redirection and its target, the descriptor before it if written; a
// heredoc's body waits for the line's end
function scan_redir(s: Scan, cmd: Cmd, num?: string): void {
  const op = REDIRS.find((o) => s.src.startsWith(o, s.at)) ?? ">";
  s.at += op.length;
  blank(s, false);
  const two = s.src.slice(s.at, s.at + 2);
  const target = two === "<(" || two === ">(" ? scan_proc(s) : scan_word(s);
  if (target.raw === "") {
    throw new Unread("a redirection without its target");
  }
  if (op === "<<" || op === "<<-") {
    if (target.dynamic || target.alts.length !== 1) {
      throw new Unread("a heredoc's delimiter made as it runs");
    }
  }
  const as = op === "<<<" ? verbatim(target) : null;
  const redir: Redir = op === "<<<" ? { op, target, num, body: target.alts[0] + "\n", made: target.dynamic || target.alts.length !== 1, ...(as === null || s.base === null ? {} : { at: s.base + as }) } : { op, target, num };
  if (op === "<<" || op === "<<-") {
    s.docs.push({ delim: target.alts[0], strip: op === "<<-", expand: !/['"\\]/.test(target.raw), redir, inpipe: s.inpipe, was: state_of(s) });
  }
  cmd.redirs.push(redir);
}

// the heredocs' bodies, from the line after their command's, each where
// it starts in the command parsed: an unquoted delimiter's body expands,
// so the commands in it run, with the shell as its command had it (was:
// not as the commands after it on its line leave it). One that sets a
// variable (${x:=...}) is refused: bash sets it as its command runs,
// before the commands after it on its line, which illi read first
function docs_read(s: Scan): void {
  const docs = s.docs;
  s.docs = [];
  for (const doc of docs) {
    const from = s.at;
    let body = "";
    while (s.at < s.src.length) {
      const nl = s.src.indexOf("\n", s.at);
      const end = nl < 0 ? s.src.length : nl;
      const line = s.src.slice(s.at, end);
      s.at = nl < 0 ? end : end + 1;
      if ((doc.strip ? line.replace(/^\t+/, "") : line) === doc.delim) {
        break;
      }
      body += line + "\n";
    }
    doc.redir.body = body;
    doc.redir.made = doc.expand && /\$\S|`/.test(body);
    if (s.base !== null) {
      doc.redir.at = s.base + from;
    }
    if (doc.expand) {
      const now = state_of(s);
      state_put(s, doc.was);
      const seen = new Map(s.vars);
      scan_body(s, body, from, doc.inpipe);
      if (s.wild !== doc.was.wild || s.vars.size !== seen.size || [...s.vars].some(([k, v]) => seen.get(k) !== v)) {
        throw new Unread("a heredoc's body that sets a variable (bash sets it as its command runs, before the commands after it)");
      }
      state_put(s, now);
    }
  }
}

// an expanding heredoc's body (from `from` in the text read): its $ and `
// read as in double quotes, reading a pipe as its command does (inpipe:
// the line it was on has ended by now)
function scan_body(s: Scan, body: string, from: number, inpipe: boolean): void {
  const [src, at, base, box, was] = [s.src, s.at, s.base, s.box, s.inpipe];
  Object.assign(s, { src: body, at: 0, inpipe, ...placed(s, from, box, body.length) });
  try {
    const b: Build = { alts: [""], dynamic: false, glob: false };
    while (s.at < s.src.length) {
      const c = s.src[s.at];
      if (c === "\\") {
        s.at += 2;
      } else if (c === "$") {
        scan_dollar(s, b);
      } else if (c === "`") {
        scan_tick(s);
      } else {
        s.at++;
      }
    }
  } finally {
    Object.assign(s, { src, at, base, box, inpipe: was });
  }
}

// [[ ... ]]: a test, its operators words; its words still expand
function scan_test(s: Scan, cmd: Cmd): void {
  s.at += 2;
  cmd.words.push(Shell.lit("[["));
  for (;;) {
    blank(s, true);
    if (s.at >= s.src.length) {
      throw new Unread("a [[ isn't closed");
    }
    if (s.src.startsWith("]]", s.at) && /^[\s;&|)]?$/.test(s.src[s.at + 2] ?? "")) {
      s.at += 2;
      cmd.words.push(Shell.lit("]]"));
      return;
    }
    const op = ["&&", "||", "(", ")", "<", ">", "|"].find((o) => s.src.startsWith(o, s.at));
    if (op !== undefined) {
      s.at += op.length;
      cmd.words.push(Shell.lit(op));
    } else {
      const word = scan_word(s);
      if (word.raw === "") {
        throw new Unread("a " + s.src[s.at] + " inside [[ ]]");
      }
      cmd.words.push(word);
    }
  }
}

// for NAME in WORDS (after the for): NAME stands for each of the words
// (none listed: the script's arguments, known only as it runs); for ((...))
function scan_for(s: Scan): void {
  blank(s, false);
  if (s.src.startsWith("((", s.at)) {
    s.at = arith(s, s.at + 2);
    return;
  }
  const name = scan_word(s);
  if (!/^[A-Za-z_]\w*$/.test(name.raw)) {
    throw new Unread("a for loop without its name");
  }
  blank(s, false);
  const next = META.includes(s.src[s.at] ?? ";") ? null : scan_word(s);
  if (next !== null && next.raw !== "in" && next.raw !== "do") {
    throw new Unread("a for loop's " + next.raw);
  }
  const values: Word[] = [];
  while (next?.raw === "in") {
    blank(s, false);
    const c = s.src[s.at];
    if (c === undefined || c === ";" || c === "\n") {
      break;
    }
    if (META.includes(c)) {
      throw new Unread("a for loop's " + c);
    }
    values.push(scan_word(s));
  }
  const alts = values.flatMap((v) => v.alts);
  const many = alts.length > MOST || alts.length === 0;
  var_set(s, name.raw, next?.raw !== "in" ? DYN : { alts: many ? [""] : alts, raw: "", dynamic: alts.length > MOST || values.some((v) => v.dynamic), glob: values.some((v) => v.glob), fd: false });
}

// a command's text read as another's, in this one's scope (scope() around
// it for a subshell's), placed in the command parsed as written from `at`
// in the text read now (null: changed as it was read; its parts all at
// box, the text holding it there: placed)
function scan_text(s: Scan, text: string, at: number | null, box: Span): void {
  const [src, pos, docs, base, outer] = [s.src, s.at, s.docs, s.base, s.box];
  Object.assign(s, { src: text, at: 0, docs: [], ...placed(s, at, box, text.length) });
  try {
    deeper(s, () => scan_list(s, ""));
  } finally {
    Object.assign(s, { src, at: pos, docs, base, box: outer });
  }
}

// where a text read in this one's place lies in the command parsed (Scan
// base, box): as written from `at` in the text read now; else (null, or
// this one's own text isn't there as written) all of it at box, the text
// there that holds it
function placed(s: Scan, at: number | null, box: Span, length: number): { base: number | null; box: Span } {
  const base = at === null || s.base === null ? null : s.base + at;
  return { base, box: base === null ? box : [base, base + length] };
}

// where a stretch of the text read is in the command parsed
function place(s: Scan, from: number, to: number): Span {
  return s.base === null ? s.box : [s.base + from, s.base + to];
}

// each part reading a pipe placed with what writes it (Part feed): the
// parts before it in each pipeline it is in (one in a subshell piped on
// is in that pipeline too, as is one in a group or a loop a pipe goes
// into), with the heredocs' bodies they read, once the bodies are read
// (after their lines); where that isn't known (a group's or a loop's
// piped on, { ...; } | sh; >(...)'s), all the command read
function pipe_feeds(s: Scan): void {
  for (const [from, to] of s.pipes) {
    let feed: Span | null = null;
    for (let k = from; k < to; k++) {
      const part = s.parts[k];
      if (feed !== null && part.piped) {
        part.feed = span_join(feed, part.feed ?? feed);
      }
      feed = span_join(feed ?? part.span, part_reach(part));
    }
  }
  for (const part of s.parts) {
    part.feed ??= part.piped ? s.box : undefined;
  }
}

// where a part is with the heredocs' bodies it reads
function part_reach(part: Part): Span {
  return part.redirs.reduce((at, r) => ((r.op !== "<<" && r.op !== "<<-") || r.at === undefined || r.body === undefined ? at : span_join(at, [r.at, r.at + r.body.length])), part.span);
}

// the least span holding two
function span_join(a: Span, b: Span): Span {
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
}

// where a word's one value starts in the text read, if it lies there as
// written: bare, or inside quotes that change nothing in it (null:
// several values, one made as it runs, an escape, an expansion)
function verbatim(w: Word): number | null {
  const x = w.alts[0];
  if (w.at === undefined || w.dynamic || w.alts.length !== 1) {
    return null;
  }
  return w.raw === x ? w.at : w.raw === "'" + x + "'" || w.raw === '"' + x + '"' ? w.at + 1 : null;
}

// a subshell's run: the folder and variables it changes are its own
function scope(s: Scan, run: () => void): void {
  const was = state_of(s);
  deeper(s, run);
  state_put(s, was);
}

// the shell as a subshell would leave it (State), to put back
function state_of(s: Scan): State {
  return { cwd: s.cwd, vars: new Map(s.vars), wild: s.wild, errexit: s.errexit };
}

function state_put(s: Scan, was: State): void {
  Object.assign(s, { cwd: was.cwd, vars: was.vars, wild: was.wild, errexit: was.errexit });
}

// every variable known only as it runs from here on: none kept, any read
// unknown (wild), as after a source or a set illi can't name
function forget(s: Scan): void {
  s.vars = new Map();
  s.wild = true;
}

// a nested reading, NEST deep at most
function deeper(s: Scan, run: () => void): void {
  if (++s.depth > NEST) {
    throw new Unread("commands nested too deep");
  }
  try {
    run();
  } finally {
    s.depth--;
  }
}

// Commands
// ========

function cmd_new(): Cmd {
  return { words: [], env: [], redirs: [], from: -1, to: -1 };
}

function cmd_empty(cmd: Cmd): boolean {
  return cmd.words.length === 0 && cmd.env.length === 0 && cmd.redirs.length === 0;
}

// a word added to a command: where a command starts, a reserved word
// grouping commands is read past, a for loop read, an assignment kept as
// one; false: nothing of the command was read
function cmd_word(s: Scan, cmd: Cmd, word: Word): boolean {
  if (cmd_empty(cmd)) {
    if (SKIP.has(word.raw)) {
      return false;
    }
    if (word.raw === "for") {
      scan_for(s);
      return false;
    }
    if (REFUSE.has(word.raw)) {
      throw new Unread(word.raw);
    }
  }
  const set = cmd.words.length === 0 ? /^([A-Za-z_]\w*)(\+?)=/.exec(word.raw) : null;
  if (set === null) {
    cmd.words.push(word);
  } else if (s.src[s.at] === "(") {
    throw new Unread("an array");
  } else {
    cmd.env.push({ name: set[1], value: set[2] === "+" ? DYN : Shell.cut(word, set[0].length) });
  }
  return true;
}

// a command read whole, ended by op: its parts. One in a pipeline or in
// the background runs in a subshell: its cd and variables don't last.
// top: it runs whenever the command does (the command's own, not in a
// subshell, a group, a loop, an if, a pipeline, the background, nor on
// either side of && or ||, nor negated); trust: so but for an || exit
// after it, and a failure in it ends the script (set -e, or that exit)
function cmd_end(s: Scan, cmd: Cmd, piped: boolean, forked: boolean, top = false, trust = false): void {
  if (cmd_empty(cmd)) {
    return;
  }
  const run = () => cmd_run(s, cmd, s.src.slice(cmd.from, cmd.to).trim(), piped, top, trust);
  if (piped || forked) {
    scope(s, run);
  } else {
    run();
  }
}

// a command's parts (an assignment alone: one without words, its
// variables set), and what it changes of the shell after it (cmd_after).
// One variable set alone (no redirection either) to what a mktemp makes
// (Word made), its failure ending the script (trust: so the variable
// never stays empty), stands for where it makes it. A command with a
// redirection is no top for cmd_after (one failing, set never runs); a
// special builtin's assignments may last (SPECIALS)
function cmd_run(s: Scan, cmd: Cmd, full: string, piped: boolean, top: boolean, trust: boolean): void {
  const ctx = { cwd: s.cwd, at: s.cwd, root: s.root, fed: s.fed, piped: piped || s.inpipe, span: place(s, cmd.from, cmd.to) };
  if (cmd.words.length === 0) {
    const one = trust && cmd.env.length === 1 && cmd.redirs.length === 0 ? cmd.env[0] : null;
    const env = one?.value.made === undefined ? cmd.env : [{ name: one.name, value: { ...one.value, alts: one.value.made, dynamic: false, made: undefined } }];
    env.forEach((e) => var_set(s, e.name, e.value));
    runs(s, env, ctx);
    part_push(s, [], env, cmd.redirs, full, ctx);
    return;
  }
  const run = unwrap(s, cmd.words, cmd.env, cmd.redirs, full, ctx);
  if (run !== null) {
    if (run.own && SPECIALS.has(Shell.program(run.argv[0]))) {
      cmd.env.forEach((e) => var_set(s, e.name, DYN));
    }
    cmd_after(s, run.argv, run.own, top && cmd.redirs.length === 0);
  }
}

// what a builtin changes of the shell for the commands after it (own: run
// by this shell, a wrapper of its own before it at most): the folder (cd,
// pushd: to its target, -P's as the system finds it; to home; popd, cd
// -, a name CDPATH may lead elsewhere: unknown), the variables (set to
// plain words as written, else known only as it runs; named by their
// words' values, as the builtin reads them: one named only as it runs,
// or a source, forgets all: forget), a name for another variable
// (declare -n) refused; aliases on, a command
// hashed to a path, a builtin loaded or one turned off can't be followed.
// A cd another program runs (sudo cd, env cd, exec cd) leaves the folder
// unknown. errexit (set -e, as -euo pipefail; set -o errexit) turns on
// only by a set the command runs whenever it runs (top: cmd_end), where
// it holds as written (Scan sete); off by
// any (+e, +o errexit), a set of words known only as it runs or one that
// fails (an option it doesn't know: SET_FLAGS, SET_NAMES), any shopt -o
// (shopt -uo errexit) or a shopt of words known only as it runs; set -o
// posix and an alias refused
function cmd_after(s: Scan, argv: Word[], own: boolean, top = false): void {
  const name = Shell.program(argv[0]);
  const args = argv.slice(1);
  const value = (a: Word) => (a.dynamic || a.alts.length !== 1 ? null : a.alts[0]);
  const odd = args.some((a) => value(a) === null);
  const names = args.map(value).filter((x): x is string => x !== null && /^[A-Za-z_]\w*$/.test(x));
  if (!own) {
    if (name === "cd" || name === "pushd" || name === "popd") {
      s.cwd = null;
    }
    return;
  }
  switch (name) {
    case "cd":
    case "pushd": {
      const opts = args.filter((a) => /^-[LPe@]+$/.test(a.raw));
      const to = args.find((a) => !/^-[LPe@]+$/.test(a.raw) && a.raw !== "--");
      const one = to === undefined || (!to.dynamic && to.alts.length === 1) ? to?.alts[0] : null;
      const home = process.env.HOME ?? os.homedir();
      const physical = /P[^L]*$/.test(opts.map((a) => a.raw).join(""));
      const from = one === undefined || one === null || path.isAbsolute(one) ? "/" : s.cwd;
      const searched = typeof one === "string" && !/^(?:\/|\.\.?(?:\/|$))/.test(one) && (s.wild || s.vars.has("CDPATH") || !!process.env.CDPATH);
      s.cwd = one === undefined ? (name === "cd" ? home : null) : one === null || one === "-" || /^[+-]\d+$/.test(one) || from === null || searched ? null : physical ? Shell.walk(from, one) : path.resolve(from, one);
      return;
    }
    case "popd": {
      s.cwd = null;
      return;
    }
    case "source":
    case ".": {
      forget(s);
      s.errexit = false;
      return;
    }
    case "export":
    case "declare":
    case "typeset":
    case "local":
    case "readonly": {
      if (name !== "export" && name !== "readonly" && args.some((a) => /^-\w*n/.test(value(a) ?? a.raw))) {
        throw new Unread(name + " -n (a name for another variable)");
      }
      for (const a of args) {
        const set = /^([A-Za-z_]\w*)(\+?)=/.exec(value(a) ?? a.raw);
        if (set !== null) {
          var_set(s, set[1], set[2] === "+" ? DYN : Shell.cut(a, set[0].length));
        } else if (value(a) === null) {
          forget(s);
        }
      }
      return;
    }
    case "read":
    case "mapfile":
    case "readarray":
    case "getopts":
    case "printf": {
      const into = args.map(value).flatMap((x) => /^-v([A-Za-z_]\w*)$/.exec(x ?? "")?.[1] ?? []);
      if (name === "printf" && !args.some((a) => /^-v/.test(value(a) ?? a.raw))) {
        return;
      }
      if (odd) {
        forget(s);
      }
      [...names, ...into].forEach((n) => var_set(s, n, DYN));
      return;
    }
    case "set": {
      const opts: Array<[string, string, string | undefined]> = [];
      for (let k = 0; k < args.length; k++) {
        const flag = value(args[k]);
        if (flag === null) {
          s.errexit = false;
          return;
        }
        if (flag === "--" || flag === "-" || !/^[-+]/.test(flag)) {
          break;
        }
        const named = flag.includes("o") && k + 1 < args.length ? value(args[++k]) : undefined;
        if (!SET_FLAGS.test(flag) || named === null || (named !== undefined && !SET_NAMES.has(named))) {
          s.errexit = false;
          return;
        }
        if (flag[0] === "-" && named === "posix") {
          throw new Unread("set -o posix (bash then expands aliases and keeps a builtin's assignments)");
        }
        opts.push([flag[0], flag.slice(1), named]);
      }
      for (const [sign, letters, named] of opts) {
        if (letters.includes("e") || named === "errexit") {
          s.errexit = sign === "-" ? s.errexit || (top && s.sete) : false;
        }
      }
      return;
    }
    case "let": {
      args.forEach((a) => [...a.alts[0].matchAll(SETS)].forEach((m) => var_set(s, m[1] ?? m[2] ?? m[3], DYN)));
      return;
    }
    case "unset": {
      if (odd) {
        forget(s);
      } else if (!args.some((a) => value(a) === "-f")) {
        names.forEach((n) => var_set(s, n, Shell.lit("")));
      }
      return;
    }
    case "alias": {
      if (args.some((a) => a.dynamic || a.raw.includes("="))) {
        throw new Unread("alias (a name standing for other commands, which sh and POSIX mode expand)");
      }
      return;
    }
    case "shopt":
    case "hash":
    case "enable": {
      s.errexit &&= name !== "shopt" || !args.some((a) => a.dynamic || /^-\w*o/.test(a.raw));
      if (args.some((a) => a.raw === "expand_aliases" || (name === "hash" && a.raw === "-p") || (name === "enable" && /^-\w*[fn]/.test(a.raw)))) {
        throw new Unread(name + " " + args.map((a) => a.raw).join(" "));
      }
      return;
    }
  }
}

// a command's wrappers taken off, each as it runs what follows it (the
// words xargs adds known only as it runs: one more word, or, with -I,
// each word holding its mark); a
// shell's -c script, an eval's words, a trap's action and a watch's
// command read as commands of their own; find's -exec commands too, each
// {} standing for what find searches (its start folders). The words then
// run, and whether this shell runs them (own: no wrapper but its own,
// OWN, before them; an eval another program runs is a shell of its own);
// null: a nested script read instead. A trap's action is read only on
// EXIT (END): on any other signal (DEBUG, ERR, INT) it may run before
// any command after it, in this shell, so what illi read of those can't
// hold: refused. The paths the wrappers name (time -o's file, flock's,
// xargs -a's, env -C's and sudo -D's folders) go with the part (Part
// taken); where a script is read in the command's place, with a part of
// their own (the redirections too). A folder a wrapper moves to (env -C,
// sudo -D) is the command's. Its program is read with its own options
// off too (Shell globals). A variable naming a command (RUNS) the
// command is given (VAR=x cmd, env's, sudo's) or sets (export) is read
// as a script of its own (Shell script)
function unwrap(s: Scan, words: Word[], env: Env[], redirs: Redir[], full: string, ctx: Ctx): { argv: Word[]; own: boolean } | null {
  let argv = words;
  let own = true;
  const taken: Word[] = [];
  const dirs: Dir[] = [];
  const aside = () => (redirs.length > 0 || taken.length > 0 || dirs.length > 0) && part_push(s, [], env, redirs, full, ctx, { taken, dirs });
  runs(s, env, ctx);
  for (;;) {
    const name = Shell.program(argv[0]);
    const rest = argv.slice(1);
    if (name === "su" || name === "sudoedit") {
      ctx = { ...ctx, root: true };
      break;
    }
    if (ROOTS[name] !== undefined) {
      const { rest: after, got } = Shell.opts(rest, { args: ROOTS[name] });
      const used = rest.slice(0, rest.length - after.length);
      const edit = name === "sudo" && used.some((w) => w.raw === "--edit" || /^-[^-ughpCDrtTU]*e/.test(w.raw));
      const dir = got.get("-D") ?? got.get("--chdir");
      taken.push(...(ROOT_FILES[name] ?? []).flatMap((o) => got.get(o) ?? []));
      dirs.push(...(dir === undefined || name === "doas" ? [] : [{ word: dir, from: ctx.cwd }]));
      ctx = { ...ctx, root: true, ...(dir === undefined || name === "doas" ? {} : { cwd: moved(ctx.cwd, dir) }) };
      own = false;
      const given = name === "sudo" && !edit ? assigns(after) : { sets: [], rest: after };
      env = [...env, ...given.sets];
      runs(s, given.sets, ctx);
      argv = edit ? [Shell.lit("sudoedit"), ...after] : given.rest;
      continue;
    }
    const wrap = WRAPS[name];
    if (wrap !== undefined) {
      if (name === "command" && /^-[vV]/.test(rest[0]?.raw ?? "")) {
        break;
      }
      own &&= OWN.has(name) && !argv[0].alts[0].includes("/") && (name !== "time" || (argv === words && env.length === 0 && argv[0].raw === "time"));
      const { rest: after, got, odd } = Shell.opts(rest, wrap);
      if (odd !== null) {
        throw new Unread(name + " " + odd + ": an option illi doesn't know");
      }
      let next = after.slice(wrap.then ?? 0);
      taken.push(...(wrap.files ?? []).flatMap((o) => got.get(o) ?? []), ...(wrap.held === true ? after.slice(0, wrap.then ?? 0) : []));
      if (name === "time" && /^[A-Za-z_]\w*\+?=/.test(next[0]?.raw ?? "")) {
        throw new Unread("time before an assignment (bash sets it; a program of that name never runs)");
      }
      if (name === "env") {
        if (got.has("-S") || got.has("--split-string")) {
          throw new Unread("env -S splits a string into a command");
        }
        const dir = got.get("-C") ?? got.get("--chdir");
        if (dir !== undefined) {
          dirs.push({ word: dir, from: ctx.cwd });
          ctx = { ...ctx, cwd: moved(ctx.cwd, dir) };
        }
        const given = assigns(next);
        env = [...env, ...given.sets];
        runs(s, given.sets, ctx);
        next = given.rest;
      }
      if (name === "xargs") {
        const mark = got.get("-I")?.alts[0] ?? (got.has("-i") ? got.get("-i")!.alts[0] || "{}" : null);
        ctx = { ...ctx, fed: true };
        next = next.length === 0 ? [Shell.lit("echo")] : next;
        next = mark === null || got.get("-I")?.dynamic ? [...next, { ...DYN, input: true }] : next.map((w) => (w.alts.some((a) => a.includes(mark)) ? { ...DYN, raw: w.raw, input: true } : w));
      }
      if (name === "flock" && /^(-c|--command)$/.test(next[0]?.raw ?? "")) {
        nested(s, next[1] ?? DYN, ctx, true, undefined, redirs, env);
        aside();
        return null;
      }
      if (next.length === 0) {
        argv = name === "exec" ? [] : argv;
        break;
      }
      argv = next;
      continue;
    }
    if (SHELLS.has(name)) {
      const script = shell_script(rest);
      if (script !== null) {
        nested(s, script, ctx, true, undefined, redirs, env);
        aside();
        return null;
      }
    }
    const known = (w: Word | undefined) => (w === undefined || w.dynamic || w.alts.length !== 1 ? null : w.alts[0]);
    const trap = known(rest[0]) === "--" ? rest.slice(1) : rest;
    const lists = /^-[lpP]+$/.test(known(rest[0]) ?? "");
    const none = known(trap[0]) === "-" || known(trap[0]) === "";
    if (name === "eval" || name === "watch" || (name === "trap" && !lists && trap.length >= 2 && !none)) {
      const words = name === "trap" ? trap.slice(0, 1) : name === "watch" ? watch_words(rest) : rest;
      if (words === null) {
        argv = Shell.opts(rest, { args: WATCH }).rest;
        own = false;
        continue;
      }
      if (words.some((w) => w.dynamic || w.alts.length !== 1)) {
        throw new Unread(name + " runs a command made as it runs");
      }
      const mid = name === "trap" ? trap.slice(1).find((w) => w.dynamic || w.alts.length !== 1 || !END.test(w.alts[0])) : undefined;
      if (mid !== undefined) {
        throw new Unread("a trap on " + mid.raw + " (its action may run before any command after it, changing what illi read)");
      }
      nested(s, Shell.lit(words.map((w) => w.alts[0]).join(" ")), ctx, name !== "eval" || !own, words, name === "trap" ? [] : redirs, env);
      aside();
      return null;
    }
    break;
  }
  const read = globals(s, argv, env, ctx);
  if (read !== null) {
    ctx = read.ctx;
    dirs.push(...read.dirs);
  }
  const sets = DECLARES.has(Shell.program(argv[0])) ? argv.slice(1).flatMap((w) => {
    const m = /^([A-Za-z_]\w*)=/.exec(w.alts[0]);
    return m === null ? [] : [{ name: m[1], value: Shell.cut(w, m[0].length) }];
  }) : [];
  runs(s, sets, ctx);
  if (Shell.program(argv[0]) === "find") {
    argv = find_execs(s, argv, ctx, redirs);
  }
  part_push(s, argv, env, redirs, full, ctx, { taken, dirs, plain: read?.readings });
  return { argv, own };
}

// the assignments a wrapper gives the command before its name (env X=1
// cmd, sudo X=1 cmd), and the words after them
function assigns(words: Word[]): { sets: Env[]; rest: Word[] } {
  const sets: Env[] = [];
  let k = 0;
  for (; k < words.length && /^[A-Za-z_]\w*=/.test(words[k].raw); k++) {
    const set = /^([A-Za-z_]\w*)=/.exec(words[k].raw)!;
    sets.push({ name: set[1], value: Shell.cut(words[k], set[0].length) });
  }
  return { sets, rest: words.slice(k) };
}

// the folder a command moves to (env -C, sudo -D, git -C): its word's one
// value, from the folder before it (null: known only as it runs; one
// starting with a ~ bash left as written, which a program may take for
// home or not)
function moved(cwd: string | null, w: Word): string | null {
  if (w.dynamic || w.alts.length !== 1 || w.alts[0].startsWith("~")) {
    return null;
  }
  return path.isAbsolute(w.alts[0]) ? w.alts[0] : cwd === null ? null : path.resolve(cwd, w.alts[0]);
}

// a program's own options before the words naming what it does (GLOBALS)
// taken off them, a reading of the command beside it as written (Part
// plain: git -C x -c k=v push origin also as git push origin), so a rule
// on git push * finds it, and one naming an option (git -c *) the
// command as written; the folder one names the one it runs in (its cwd).
// Git's settings given with it (-c, --config-env, and by its
// environment: Shell git_env) read as git reads them (Shell
// git_settings), its aliases each a reading of their own. null: no
// option taken off and no setting read (as written alone; an option it
// doesn't know before those words leaves no reading, as a value can't be
// told from a word, nor does no word naming what it does: git --version,
// whose family would be every git command). An option word of several
// values (git $o push, for o in -p -P) is read with each (WAYS at most);
// a number's option before a word made as it runs (make -j $N deploy)
// both with that word its value and without
function globals(s: Scan, argv: Word[], env: Env[], ctx: Ctx): { readings: Word[][]; ctx: Ctx; dirs: Dir[] } | null {
  const name = Shell.program(argv[0]);
  const g = GLOBALS[name];
  if (g === undefined) {
    return null;
  }
  const passes = ways(argv, g).flatMap((each) => {
    const one = strip(each, g, ctx.cwd);
    return one.doubt ? [one, strip(each, g, ctx.cwd, true)] : [one];
  });
  const [pass] = passes;
  const at = pass.odd || pass.cwd === undefined ? ctx : { ...ctx, cwd: pass.cwd };
  const readings = passes.filter((p) => p.took && !p.odd && p.kept.length > 1).map((p) => [...p.kept, ...p.rest]);
  const dirs = passes.flatMap((p) => p.dirs).filter((d, k, all) => all.findIndex((o) => o.word === d.word && o.from === d.from) === k);
  if (name === "git") {
    const settings = passes.flatMap((p) => p.settings).filter((o, k, all) => all.findIndex((x) => x.v === o.v) === k).flatMap((o) => given(s, o.v, o.env, env));
    readings.push(...git_settings(s, [...settings, ...git_env(s, env)], readings[0] ?? argv, at, env, s.given));
  }
  return readings.length === 0 && dirs.length === 0 ? null : { readings, ctx: at, dirs };
}

// a command's words, each option word of several known values before
// the first that isn't one taken a value at a time (WAYS at most): as
// written where none is. One whose every value is a flag (Shell
// global_flag) needs none, as each is passed over alike; one that would
// take the ways past WAYS stays as it is, a word of several values,
// which no option is told from (Shell global_opt): the command then has
// no reading with its options off
function ways(argv: Word[], g: Global): Word[][] {
  let out = [argv];
  for (let k = 1; k < argv.length; k++) {
    const w = argv[k];
    if (w.dynamic || !w.alts.every((a) => a.startsWith("-"))) {
      break;
    }
    if (w.alts.length > 1 && !w.alts.every((a) => global_flag(a, g)) && out.length * w.alts.length <= WAYS) {
      out = out.flatMap((o) => w.alts.map((a) => [...o.slice(0, k), Shell.lit(a), ...o.slice(k + 1)]));
    }
  }
  return out;
}

// a program's own options before the words naming what it does taken off
// (Global): the words kept (its program and those, then the rest as they
// are), the folder it moves to (undefined: none named; null: known only
// as it runs) and the words naming it (dirs: -C x's x, -Cx, each from
// the folder in force there: -C a -C b's b from a), the values
// of git's -c and --config-env, whether any came off, and whether one it
// doesn't know came first (odd: no reading; one past it taken as a flag,
// so the settings after it are read), whether a number's option came
// before a word made as it runs (doubt: read again with `eat`, that word
// its value)
function strip(argv: Word[], g: Global, cwd: string | null, eat = false): { kept: Word[]; rest: Word[]; cwd?: string | null; dirs: Dir[]; settings: Array<{ v: Word; env: boolean }>; took: boolean; odd: boolean; doubt: boolean } {
  const kept = [argv[0]];
  const dirs: Dir[] = [];
  const settings: Array<{ v: Word; env: boolean }> = [];
  let to: string | null | undefined = undefined;
  let took = false;
  let odd = false;
  let doubt = false;
  let k = 1;
  while (k < argv.length && kept.length <= g.subs) {
    const w = argv[k];
    if (!w.alts.every((a) => /^-./.test(a))) {
      kept.push(w);
      k++;
      continue;
    }
    if (kept.length > 1) {
      break;
    }
    const o = global_opt(argv, k, g, eat);
    if (o === null) {
      odd = true;
      k++;
      continue;
    }
    took = true;
    if (g.dirs?.includes(o.name)) {
      const from: string | null = to === undefined ? cwd : to;
      dirs.push({ word: argv[k + o.n - 1], from });
      to = o.value === null ? null : moved(from, o.value);
    }
    if (o.name === "-c" || o.name === "--config-env") {
      settings.push({ v: o.value!, env: o.name === "--config-env" });
    }
    doubt ||= o.doubt === true;
    k += o.n;
  }
  return { kept, rest: argv.slice(k), cwd: to, dirs, settings, took, odd, doubt };
}

// one of a program's own options (Global) at words[k]: its name, its
// value (attached, even empty: --namespace=; else the next word; none
// for a flag, or an optional one with none attached), how many words it
// takes; null: one it doesn't have, its value missing, or a word known
// only as it runs (or of several values, unless each is a flag: Shell
// global_flag) that isn't one with its value attached
// (--namespace="$NS", -n$NS). A number's option before a word
// made as it runs (or of several values) takes it with `eat`, else none
// (doubt: it may)
function global_opt(words: Word[], k: number, g: Global, eat = false): { name: string; value: Word | null; n: number; doubt?: boolean } | null {
  const w = words[k];
  const x = w.alts[0];
  if (!w.dynamic && w.alts.every((a) => global_flag(a, g))) {
    return { name: x, value: null, n: 1 };
  }
  const dyn = w.dynamic || w.alts.length !== 1;
  const eq = x.indexOf("=");
  const next = words[k + 1];
  const unsure = next !== undefined && (next.dynamic || next.alts.length !== 1);
  const num = next !== undefined && ((!unsure && /^\d+(?:\.\d+)?$/.test(next.alts[0])) || (eat && unsure));
  const attached = (name: string, from: number) => ({ name, value: Shell.cut(w, from), n: 1 });
  if (x.startsWith("--") || (g.single === true && x.length > 2)) {
    const name = eq > 0 ? x.slice(0, eq) : x;
    if (eq > 0 && (g.args.includes(name) || g.nums?.includes(name) || g.opt?.includes(name))) {
      return attached(name, eq + 1);
    }
    if (dyn) {
      return null;
    }
    if (g.args.includes(name)) {
      return next === undefined ? null : { name, value: next, n: 2 };
    }
    if (g.nums?.includes(name) || g.opt?.includes(name)) {
      return g.nums?.includes(name) && num ? { name, value: next!, n: 2 } : { name, value: null, n: 1, doubt: g.nums?.includes(name) && unsure };
    }
    return g.flags.includes(name) ? { name, value: null, n: 1 } : null;
  }
  if (!dyn && g.flags.includes(x)) {
    return { name: x, value: null, n: 1 };
  }
  for (let i = 1; i < x.length; i++) {
    const one = "-" + x[i];
    const glued = i + 1 < x.length || dyn;
    if (g.args.includes(one)) {
      return glued ? attached(one, i + 1) : next === undefined ? null : { name: one, value: next, n: 2 };
    }
    if (g.nums?.includes(one) || g.opt?.includes(one)) {
      return glued ? attached(one, i + 1) : g.nums?.includes(one) && num ? { name: one, value: next!, n: 2 } : { name: one, value: null, n: 1, doubt: g.nums?.includes(one) && unsure };
    }
    if (!g.flags.includes(one)) {
      return null;
    }
  }
  return dyn ? null : { name: x, value: null, n: 1 };
}

// whether a word's value is one of a program's own flags (Global), or
// its short ones run together (-pP), taking no value either way
function global_flag(a: string, g: Global): boolean {
  return g.flags.includes(a) || (g.single !== true && /^-[^-]/.test(a) && [...a.slice(1)].every((c) => g.flags.includes("-" + c)));
}

// a git setting given by -c (key=value; a key alone: a yes), or by
// --config-env (key=VARIABLE: the value that variable holds as the
// command runs, the command's own, the shell's, or the environment's),
// one for each of its word's values; one whose key is known only as it
// runs with the value written after its = (loose) may be any setting
// (any: alias.$X=push), else it's as written (key null). Of a word of
// several values (alias.{p,q}=x), each one's value is its text after
// the =; one made as it runs too (core.{pager,editor}="$X"y), what's
// written after its = as well, read loosely (Shell said)
function given(s: Scan, v: Word, env: boolean, vars: Env[]): Setting[] {
  if (v.dynamic && !v.alts[0].includes("=")) {
    const t = loose(v);
    const eq = t.indexOf("=");
    return [eq < 0 || env ? { key: null, value: null, raw: v.raw } : { key: null, value: Shell.lit(t.slice(eq + 1).trim()), raw: v.raw, any: true }];
  }
  return v.alts.map((a): Setting => {
    const eq = a.indexOf("=");
    if (eq < 0) {
      return { key: a, value: null, raw: v.raw };
    }
    const value = v.alts.length === 1 ? Shell.cut(v, eq + 1) : v.dynamic ? { ...DYN, alts: [a.slice(eq + 1)], raw: v.raw.slice(v.raw.indexOf("=") + 1) } : Shell.lit(a.slice(eq + 1));
    if (!env) {
      return { key: a.slice(0, eq), value, raw: v.raw };
    }
    const name = value.dynamic || value.alts.length !== 1 ? null : value.alts[0];
    const held = name === null ? undefined : vars.find((e) => e.name === name)?.value ?? s.vars.get(name) ?? (process.env[name] === undefined ? undefined : Shell.lit(process.env[name]!));
    return { key: a.slice(0, eq), value: held ?? { ...DYN, raw: "$" + (name ?? value.raw) }, raw: v.raw };
  });
}

// git's settings its environment gives the command (GIT_CONFIG_KEY_n and
// GIT_CONFIG_VALUE_n, as GIT_CONFIG_COUNT counts them; and
// GIT_CONFIG_PARAMETERS, quoted as git quotes them), from what the
// command is given and what the shell set before it (exported or not:
// read either way); one known only as it runs as written, but a key
// made as it runs with its value given: any setting, by that value's
// text (Setting any, as -c alias.$K=push)
function git_env(s: Scan, env: Env[]): Setting[] {
  const vars = new Map<string, Word>([...s.vars, ...env.map((e): [string, Word] => [e.name, e.value])]);
  const out: Setting[] = [];
  for (const [name, w] of vars) {
    const n = /^GIT_CONFIG_KEY_(\d+)$/.exec(name)?.[1];
    if (n !== undefined) {
      const value = vars.get("GIT_CONFIG_VALUE_" + n) ?? null;
      const raw = name + "=" + w.raw;
      out.push(...(!w.dynamic ? w.alts.map((key) => ({ key, value, raw })) : value === null ? [{ key: null, value: null, raw }] : said(value).map((t): Setting => ({ key: null, value: Shell.lit(t), raw, any: true }))));
    }
    if (name === "GIT_CONFIG_PARAMETERS") {
      const split = w.dynamic ? null : w.alts.map(git_split);
      if (split === null || split.some((x) => x === null)) {
        out.push({ key: null, value: null, raw: name + "=" + w.raw });
        continue;
      }
      for (const item of split.flat() as string[]) {
        const eq = item.indexOf("=");
        out.push(eq < 0 ? { key: item, value: null, raw: item } : { key: item.slice(0, eq), value: Shell.lit(item.slice(eq + 1)), raw: item });
      }
    }
  }
  return out;
}

// git's settings given with a command, read as git reads them: each that
// runs a command (GIT_RUNS) a script of its own, run where git runs it
// (Shell scripts: the top of its repository too; a credential helper
// named alone as git's credential-<name>; a yes or a no none; a
// submodule's update only past a !); its aliases (the last given of a
// name standing) each a reading of the command (`base`: its options off)
// with the word naming it put as git puts it (its value split as git
// splits it, its options off again, the settings among them taken as
// these are, one standing for another followed,
// each once: a git builtin of that name wins over one, so the command as
// written stays a reading too; a word naming it made as it runs, each
// one given), a ! one a script with the words after it, and every other
// ! one given a script too (a word made as it runs may name it). A value
// made as it runs is read by its text (Shell said: an alias's a reading
// or a script, so git -c alias.p="push $X" p is git push); one whose key
// is known only as it runs stands for any setting: a script, and an
// alias of the word naming what the command does. One known only as it
// runs whole is read loosely (Shell script)
function git_settings(s: Scan, settings: Setting[], base: Word[], ctx: Ctx, env: Env[] = [], inherited: Setting[] = []): Word[][] {
  const was = s.given;
  s.given = [...inherited, ...settings];
  try {
    return git_reads(s, settings, inherited, base, ctx, env);
  } finally {
    s.given = was;
  }
}

// git_settings's readings: its own settings, those it inherited from the
// git that runs it (their aliases alone: the scripts they name were read
// as that git was), all given on to what it runs (Scan given), an
// alias's own as it's taken
function git_reads(s: Scan, settings: Setting[], inherited: Setting[], base: Word[], ctx: Ctx, env: Env[]): Word[][] {
  const aliases = new Map<string, Word>();
  const wild: Word[] = [];
  for (const { key, value, any } of inherited) {
    const alias = key === null ? null : /^alias\.(.+)$/i.exec(key);
    if (any === true && value !== null) {
      wild.push(value);
    } else if (alias !== null && alias !== undefined) {
      value === null ? aliases.delete(alias[1].toLowerCase()) : aliases.set(alias[1].toLowerCase(), value);
    }
  }
  const take = ({ key, value, raw, any }: Setting): void => {
    if (any === true && value !== null) {
      wild.push(value);
      scripts(s, Shell.lit(value.alts[0].replace(/^!/, "")), ctx);
      return;
    }
    if (key === null) {
      scripts(s, { ...DYN, raw }, ctx);
      return;
    }
    const alias = /^alias\.(.+)$/i.exec(key);
    if (alias !== null) {
      value === null ? aliases.delete(alias[1].toLowerCase()) : aliases.set(alias[1].toLowerCase(), value);
      return;
    }
    if (value === null || !GIT_RUNS.test(key) || (!value.dynamic && value.alts.every((a) => GIT_BOOL.test(a.trim())))) {
      return;
    }
    const bang = !value.dynamic && value.alts.every((a) => a.startsWith("!"));
    if (/^submodule\./i.test(key) && !bang) {
      return;
    }
    if (/^credential/i.test(key) && !bang && !value.dynamic && value.alts.every((a) => !a.trim().startsWith("/"))) {
      scripts(s, Shell.lit(value.alts.map((a) => "git credential-" + a.trim()).join("\n")), ctx);
      return;
    }
    scripts(s, bang ? Shell.cut(value, 1) : value, ctx);
  };
  settings.forEach(take);
  const readings: Word[][] = [];
  const named = new Set<string>();
  // an alias's value as git would run it with `words` after its name: a
  // ! one a script, else a reading
  const run = (text: string, words: Word[]): Word[] | null => {
    const rest = words.slice(2).map((w) => " " + (w.dynamic || w.alts.length !== 1 ? w.raw : quoted(w.alts[0]))).join("");
    if (text.startsWith("!")) {
      scripts(s, Shell.lit(text.slice(1) + rest), ctx);
      return null;
    }
    const split = git_split(text);
    return split === null || split.length === 0 ? null : [words[0], ...split.map(Shell.lit), ...words.slice(2)];
  };
  const head = base[1];
  const starts = head === undefined ? [] : head.dynamic ? [...aliases.keys()] : head.alts;
  for (const start of starts) {
    let words = !head.dynamic && head.alts.length === 1 ? base : [base[0], Shell.lit(start), ...base.slice(2)];
    const seen = new Set<string>();
    for (;;) {
      const sub = words[1] === undefined || words[1].dynamic || words[1].alts.length !== 1 ? null : words[1].alts[0].toLowerCase();
      const v = sub === null ? undefined : aliases.get(sub);
      if (v === undefined || seen.has(sub!)) {
        break;
      }
      seen.add(sub!);
      named.add(sub!);
      if (v.dynamic || v.alts.length !== 1) {
        said(v).forEach((t) => {
          const r = run(t, words);
          r !== null && readings.push(r);
        });
        break;
      }
      const next = run(v.alts[0], words);
      if (next === null) {
        break;
      }
      const again = strip(next, GLOBALS.git, ctx.cwd);
      const more = again.settings.filter((o, k, each) => each.findIndex((x) => x.v === o.v) === k).flatMap((o) => given(s, o.v, o.env, env));
      s.given = [...s.given, ...more];
      more.forEach(take);
      words = again.took && !again.odd && again.kept.length > 1 ? [...again.kept, ...again.rest] : next;
      readings.push(words);
    }
  }
  if (head !== undefined) {
    wild.forEach((v) => {
      const r = run(v.alts[0], base);
      r !== null && readings.push(r);
    });
  }
  for (const [name, v] of aliases) {
    if (!named.has(name)) {
      said(v).filter((t) => t.startsWith("!")).forEach((t) => scripts(s, Shell.lit(t.slice(1)), ctx));
    }
  }
  return readings;
}

// a value split into words as git splits an alias's: at blanks, outside
// quotes; '...' as written, "..." and a \ outside '...' taking the
// character after as written (null: a quote left open)
function git_split(text: string): string[] | null {
  const out: string[] = [];
  let word: string | null = null;
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote === "" && /\s/.test(c)) {
      word !== null && out.push(word);
      word = null;
      continue;
    }
    word ??= "";
    if (c === "\\" && quote !== "'" && i + 1 < text.length) {
      word += text[++i];
    } else if ((c === '"' || c === "'") && (quote === "" || quote === c)) {
      quote = quote === "" ? c : "";
    } else {
      word += c;
    }
  }
  if (quote !== "") {
    return null;
  }
  word !== null && out.push(word);
  return out;
}

// a word as one in a script, quoted
function quoted(x: string): string {
  return "'" + x.replaceAll("'", "'\\''") + "'";
}

// the variables naming a command (RUNS) set to words, read as a script
// each (Shell scripts), run where the command runs; git's settings in
// variables (GIT_CONF) read where they are set, so one a later program
// (a script, bash -c) gives git is met though no git command is read
function runs(s: Scan, env: Env[], ctx: Ctx): void {
  const conf = env.some((e) => GIT_CONF.test(e.name)) ? git_env(s, env) : [];
  const was = s.given;
  s.given = [...was, ...conf];
  try {
    for (const e of env.filter((e) => RUNS.has(e.name))) {
      scripts(s, e.value, ctx);
    }
  } finally {
    s.given = was;
  }
  if (conf.length > 0) {
    git_settings(s, conf, [], ctx);
  }
}

// a script run by a program read where the program runs and, as git
// runs those its settings and variables name (an editor, a pager, an
// alias, its ssh command) at the top of the repository it is in, there
// too (Shell repo): whatever program is given it (EDITOR=x crontab -e
// too), so a path in it is named from both folders
function scripts(s: Scan, w: Word, ctx: Ctx): void {
  script(s, w, ctx);
  const top = repo(s, ctx.cwd);
  if (top !== null && top !== ctx.cwd) {
    script(s, w, { ...ctx, cwd: top });
  }
}

// the top of the git repository a folder is in (the nearest folder
// holding .git, the folder too), looked for once a reading; null: none,
// or a folder known only as it runs
function repo(s: Scan, cwd: string | null): string | null {
  if (cwd === null) {
    return null;
  }
  if (!s.tops.has(cwd)) {
    let top: string | null = null;
    for (let d = cwd; top === null; d = path.dirname(d)) {
      if (fs.existsSync(path.join(d, ".git"))) {
        top = d;
      } else if (path.dirname(d) === d) {
        break;
      }
    }
    s.tops.set(cwd, top);
  }
  return s.tops.get(cwd)!;
}

// a value naming a command a program runs (a variable's, a git
// setting's) read as a script of its own, run where the program runs;
// one made as it runs by its text if one double-quoted string ("ssh -i
// $KEY" as ssh -i $KEY, its variables as the shell has them), else by
// its known head and loosely too (Shell loose: $NOPE'rm -rf y' as rm -rf
// y, its text alone). One this can't read (a script bash would read in a
// way this can't follow, a head cut short) is its text alone (Part
// rough), so a rule still meets it, and nothing else in the command goes
// unread. Each is read once a reading where it runs (Scan read)
function script(s: Scan, w: Word, ctx: Ctx): void {
  const inside = quoted_inside(w);
  const text = !w.dynamic ? w.alts : [inside ?? w.alts[0]];
  const key = [ctx.cwd, ctx.root, ctx.fed, ctx.piped, s.depth, s.wild, w.dynamic, w.raw, ...text, given_key(s)].join("\0");
  if (s.read.has(key)) {
    return;
  }
  if (++s.reads > BUDGET) {
    text.every((t) => t.trim() === "") || part_rough(s, text.join("\n").trim(), ctx, "spent");
    s.read.add(key);
    return;
  }
  if (!text.every((t) => t.trim() === "") && !attempt(s, () => nested(s, w.dynamic ? Shell.lit(text[0]) : w, ctx, true))) {
    part_rough(s, text.join("\n").trim(), ctx);
  }
  const more = w.dynamic && inside === undefined ? loose(w) : "";
  if (more !== "" && more !== text[0].trim()) {
    part_rough(s, more, ctx);
  }
  s.read.add(key);
}

// what a script read is given of git's settings (a git command in it
// reads them): those in force a git there takes (Scan given: aliases,
// and any of a key made as it runs: git_reads) and the variables setting
// them (GIT_CONF), as text, so a script read again once they change is
// read anew (Shell script); as two short ids (Scan ids), kept for the
// variables and the settings they were made of (GIVEN_VARS, GIVEN_SETS),
// as neither changes in place (var_set)
function given_key(s: Scan): string {
  const word = (w: Word | null) => (w === null ? "" : w.raw + "\x01" + w.alts.join("\x01"));
  const id = (text: string) => {
    let one = s.ids.get(text);
    if (one === undefined) {
      s.ids.set(text, (one = String(s.ids.size)));
    }
    return one;
  };
  let vars = GIVEN_VARS.get(s.vars);
  if (vars === undefined) {
    GIVEN_VARS.set(s.vars, (vars = id([...s.vars].filter(([n]) => GIT_CONF.test(n)).map(([n, v]) => n + "=" + word(v)).join("\0"))));
  }
  let sets = GIVEN_SETS.get(s.given);
  if (sets === undefined) {
    GIVEN_SETS.set(s.given, (sets = id(s.given.filter((g) => g.any === true || /^alias\./i.test(g.key ?? "")).map((g) => g.raw + "\x01" + (g.key ?? "") + "\x01" + word(g.value)).join("\0"))));
  }
  return vars + "/" + sets;
}

// a variable set in the shell read; one of git's settings (GIT_CONF) in
// a new map, so what a script was given before stays as it was
// (given_key)
function var_set(s: Scan, name: string, value: Word): void {
  if (GIT_CONF.test(name)) {
    s.vars = new Map(s.vars);
  }
  s.vars.set(name, value);
}

// a word that is one double-quoted string, its text inside as bash
// reads it (its variables as written); undefined: it isn't
function quoted_inside(w: Word): string | undefined {
  return /^"((?:[^"\\]|\\.)*)"$/s.exec(w.raw)?.[1].replace(/\\([$`"\\\n])/g, (_, c: string) => (c === "\n" ? "" : c));
}

// a word made as it runs, its texts as a program would be given them:
// its one double-quoted string's inside, else its known head and its
// loose text (Shell loose); one known, its values
function said(w: Word): string[] {
  if (!w.dynamic) {
    return w.alts;
  }
  const inside = quoted_inside(w);
  return [...new Set((inside === undefined ? [w.alts[0], loose(w)] : [inside]).map((t) => t.trim()).filter((t) => t !== ""))];
}

// a word made as it runs as loose text: its quotes off, each variable it
// expands and each command's output it takes the end of a line (what it
// holds unknown; a substitution is read as itself), so what is written
// after one is read too ($NOPE'rm -rf y' as rm -rf y)
function loose(w: Word): string {
  const r = w.raw;
  let out = "";
  let single = false;
  for (let i = 0; i < r.length; i++) {
    const c = r[i];
    if (single || c === "'") {
      single = c === "'" ? !single : single;
      out += c === "'" ? "" : c;
      continue;
    }
    if (c === "\\") {
      out += r[++i] ?? "";
    } else if (c === "`") {
      const end = r.indexOf("`", i + 1);
      i = end < 0 ? r.length : end;
      out += "\n";
    } else if (c === "$" && r[i + 1] === "(") {
      for (let depth = 0; i < r.length; i++) {
        depth += r[i] === "(" ? 1 : r[i] === ")" ? -1 : 0;
        if (r[i] === ")" && depth === 0) {
          break;
        }
      }
      out += "\n";
    } else if (c === "$" && /^\$(?:\{[^}]*\}|[A-Za-z_]\w*|\d|[@*#?$!-])/.test(r.slice(i))) {
      i += /^\$(?:\{[^}]*\}|[A-Za-z_]\w*|\d|[@*#?$!-])/.exec(r.slice(i))![0].length - 1;
      out += "\n";
    } else if (c !== '"') {
      out += c;
    }
  }
  return out.trim();
}

// a script's text alone, as a part this can't read (Part rough; spent:
// one left unread past BUDGET)
function part_rough(s: Scan, text: string, ctx: Ctx, rough: true | "spent" = true): void {
  part_push(s, [{ ...DYN, raw: text }], [], [], text, ctx);
  s.parts[s.parts.length - 1].rough = rough;
}

// a reading that may be refused (Unread): undone if it is, false
function attempt(s: Scan, read: () => void): boolean {
  const [parts, pipes, was, root, fed, inpipe, done] = [s.parts.length, s.pipes.length, state_of(s), s.root, s.fed, s.inpipe, new Set(s.read)];
  try {
    read();
    return true;
  } catch (err) {
    if (!(err instanceof Unread)) {
      throw err;
    }
    s.parts.length = parts;
    s.pipes.length = pipes;
    state_put(s, was);
    Object.assign(s, { root, fed, inpipe, read: done });
    return false;
  }
}

// a nested script's commands, run by a wrapper (its root; its input:
// fed, the pipe it reads, what its redirections give: its commands'
// too, stdin_give): in a shell of its own (sub: bash -c, watch: its
// folder and variables its own, the variables only the environment's;
// those this shell set or the command gives (env), which it may export,
// known only as it runs; errexit off; a trap's EXIT action read so too:
// it runs in this shell, but only as it ends, the variables as they are
// then), else in this one (eval; the variables the command gives known
// only as it runs). Its
// parts are placed where its words are (one word whose one value is
// there as written: each where it is in it; else at the words, at the
// command when they are made up)
function nested(s: Scan, script: Word, ctx: Ctx, sub: boolean, words: Word[] = [script], redirs: Redir[] = [], env: Env[] = []): void {
  if (script.dynamic) {
    throw new Unread("a shell runs a script made as it runs");
  }
  const from = s.parts.length;
  const at   = script.alts.length === 1 && words.length === 1 ? verbatim(words[0]) : null;
  const last = words.at(-1);
  const box  = last !== undefined && words.every((w) => w.at !== undefined) ? place(s, words[0].at!, last.at! + last.raw.length) : ctx.span;
  const [root, fed, cwd, inpipe] = [s.root, s.fed, s.cwd, s.inpipe];
  Object.assign(s, { root: ctx.root, fed: ctx.fed, cwd: ctx.cwd, inpipe: ctx.piped });
  try {
    for (const text of script.alts) {
      if (sub) {
        scope(s, () => {
          s.vars = new Map([...s.vars.keys(), ...env.map((e) => e.name)].map((n) => [n, GIT_CONF.test(n) ? (env.find((e) => e.name === n)?.value ?? s.vars.get(n) ?? DYN) : DYN]));
          s.errexit = false;
          scan_text(s, text, at, box);
        });
      } else {
        env.forEach((e) => var_set(s, e.name, DYN));
        scan_text(s, text, at, box);
      }
    }
  } finally {
    Object.assign(s, { root, fed, inpipe });
    s.cwd = sub ? cwd : s.cwd;
  }
  stdin_give(s, from, s.parts.length, redirs, cwd, ctx.span);
}

// a shell's script given with -c (bash -c 'x', bash -lc 'x'); null: none
// (it runs a file, or reads its input)
function shell_script(args: Word[]): Word | null {
  let c = false;
  for (let k = 0; k < args.length; k++) {
    const x = args[k].alts[0];
    if (args[k].dynamic || !/^[-+]/.test(x) || x === "-" || x === "--") {
      return c && x !== "--" ? args[k] ?? null : c ? args[k + 1] ?? null : null;
    }
    if (/^[-+][oO]$/.test(x) || x === "--rcfile" || x === "--init-file") {
      k++;
    } else if (/^-[A-Za-z]+$/.test(x) && x.includes("c")) {
      c = true;
    }
  }
  return null;
}

// a watch's command as words to read as a script (null: -x, its words
// the command itself)
function watch_words(args: Word[]): Word[] | null {
  const { rest } = Shell.opts(args, { args: WATCH });
  return args.some((a) => a.raw === "-x" || a.raw === "--exec") ? null : rest;
}

// find's -exec commands taken out as parts of their own, {} standing for
// its start folders, each reading the pipe find reads (-ok's and
// -okdir's none: find asks on its input); the find left without them
function find_execs(s: Scan, argv: Word[], ctx: Ctx, redirs: Redir[]): Word[] {
  const starts = find_starts(argv);
  const keep: Word[] = [];
  for (let k = 0; k < argv.length; k++) {
    if (!EXECS.has(argv[k].raw)) {
      keep.push(argv[k]);
      continue;
    }
    let j = k + 1;
    while (j < argv.length && argv[j].alts[0] !== ";" && !(argv[j].alts[0] === "+" && argv[j - 1].raw === "{}")) {
      j++;
    }
    const inner = argv.slice(k + 1, j).map((w) => (w.alts.some((a) => a.includes("{}")) ? found(w, starts) : w));
    const ok = argv[k].raw.startsWith("-ok");
    const from = s.parts.length;
    if (inner.length > 0) {
      unwrap(s, inner, [], [], inner.map((w) => w.raw).join(" "), { ...ctx, piped: ctx.piped && !ok });
    }
    stdin_give(s, from, ok ? from : s.parts.length, redirs, s.cwd, ctx.span);
    k = j;
  }
  return keep;
}

// the folders a find searches: its words after its own options, till its
// expression starts (none: .)
function find_starts(argv: Word[]): Word[] {
  let k = 1;
  while (k < argv.length && /^-([HLP]|D|O\d*)$/.test(argv[k].raw)) {
    k += argv[k].raw === "-D" ? 2 : 1;
  }
  const starts: Word[] = [];
  for (; k < argv.length && !/^[-(!,]/.test(argv[k].alts[0]); k++) {
    starts.push(argv[k]);
  }
  return starts.length === 0 ? [Shell.lit(".")] : starts;
}

// a word with each {} put as each of find's start folders: something
// under them (a glob)
function found(w: Word, starts: Word[]): Word {
  const alts = w.alts.flatMap((a) => starts.flatMap((st) => st.alts.map((x) => a.replaceAll("{}", x))));
  return { ...w, alts: alts.slice(0, MOST), glob: true, dynamic: w.dynamic || starts.some((st) => st.dynamic) };
}

// the input a group, a subshell, a nested script or find -exec's command
// is given (its last <, <<, <<<, <& or <> on descriptor 0) given to each
// command it runs (the parts from, to) with none of its own and no pipe
// to read, so a shell among them reads it as it would its own: sh
// <<'EOF' and { sh; } <<'EOF' alike. A heredoc's the same (its body read
// after its line); a file's named from cwd, the folder the redirection
// is made in (null, a relative one: known only as it runs); each placed
// with where it is given (at: Part feed)
function stdin_give(s: Scan, from: number, to: number, redirs: Redir[], cwd: string | null, at: Span): void {
  const r = redirs.filter(stdin).at(-1);
  if (r === undefined || from >= to) {
    return;
  }
  const w = r.target;
  const local = !r.op.startsWith("<<") && r.op !== "<&" && !w.fd && !w.dynamic && w.alts.some((a) => !path.isAbsolute(a));
  const given = !local ? r : { ...r, target: cwd === null ? { ...DYN, raw: w.raw } : { ...w, alts: w.alts.map((a) => (path.isAbsolute(a) ? a : cwd + "/" + a)), at: undefined } };
  for (const part of s.parts.slice(from, to)) {
    if (!part.piped && !part.redirs.some(stdin)) {
      part.redirs = [...part.redirs, given];
      part.feed = at;
    }
  }
}

// whether a redirection is a command's input: on descriptor 0
function stdin(r: Redir): boolean {
  return r.op.startsWith("<") && (r.num === undefined || r.num === "0");
}

function part_push(s: Scan, argv: Word[], env: Env[], redirs: Redir[], full: string, ctx: Ctx, more: { taken?: Word[]; dirs?: Dir[]; plain?: Word[][] } = {}): void {
  s.parts.push({ argv, plain: more.plain ?? [], taken: more.taken ?? [], dirs: more.dirs ?? [], env, redirs, cwd: ctx.cwd, at: ctx.at, text: argv.map((w) => w.raw).join(" "), full, root: ctx.root, fed: ctx.fed, piped: ctx.piped, span: ctx.span });
}

// a folder's real place (links followed) if it exists, else as named
function really(dir: string): string {
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
}
