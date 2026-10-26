// Shell
// =====
// A shell tool's command read as bash reads it, so Guard.ts can judge it
// before it runs: every simple command in it (a part), wherever it sits
// (a pipeline, a list, a subshell, a command's substitution, a heredoc's
// body, a loop, a bash -c's script, an eval's, a trap's, a find -exec's),
// each with its words as they'd expand, its assignments, its
// redirections, where it is in the command (its span: a question shows
// the lines a risk is on; reading a pipe, with what writes it) and the
// folder it runs in (each cd followed, behind builtin, command or time
// too, in the shell it moves: a subshell's, a pipeline's or the
// background's, a group's or a loop's there, its own; one another
// program runs leaves it unknown), and its input as given (a heredoc,
// a file) to the group, the subshell, the loop or the nested script it
// is in, as its own. A pipe goes on past a line's end after |, as do &&
// and ||, and into every command of a subshell, a group or a loop it
// feeds, and of what a command reading it runs ($(...), `...`, <(...),
// a heredoc's body, bash -c's script, an eval's, find -exec's). Wrappers that run the command after them (sudo,
// timeout, env, xargs, ...) are taken off, the part saying so (root: run
// as root, as sudoedit edits; fed: some of its arguments come from its
// input). A word known only as the command runs (a variable it never
// sets and the environment lacks, a command's output) is dynamic, its
// known head kept; a variable the command sets to plain words (X=a, for
// X in a b) stands for each of them, and a command's output known before
// it runs ($(pwd), $(git rev-parse --show-toplevel): the folder;
// $(mktemp): where it makes its file, its X's kept) for its value.
// What bash would read in a way this can't follow (case, functions,
// arrays, aliases, a script made as it runs) leaves no parts, only why:
// such a command is asked about. The shell tool runs bash (Machine.ts),
// so this is the language it runs.

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

// a simple command: its words (wrappers taken off), the assignments
// before them, its redirections, the folder it runs in (null: known only
// as it runs), its words as written (text) and the whole command as
// written (full: wrappers, assignments and redirections too); whether it
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
// holds it: its word, its command
export type Part = {
  argv   : Word[];
  env    : Env[];
  redirs : Redir[];
  cwd    : string | null;
  text   : string;
  full   : string;
  root   : boolean;
  fed    : boolean;
  piped  : boolean;
  span   : Span;
  feed?  : Span;
};

// a command being read: its words, assignments and redirections so far,
// where its text starts and ends (-1: nothing read yet)
type Cmd = { words: Word[]; env: Env[]; redirs: Redir[]; from: number; to: number };

// how a part runs, as the wrappers before it left it, and where its
// command is in the command parsed (Part span)
type Ctx = { cwd: string | null; root: boolean; fed: boolean; piped: boolean; span: Span };

// a word's values as it is read; made: as Word's (undefined: no mktemp
// in it yet; null: something else in it known only as it runs, or too
// many values)
type Build = { alts: string[]; dynamic: boolean; glob: boolean; made?: string[] | null };

// a heredoc waiting for its body (the lines after its command's):
// its end line, whether tabs before that are dropped (<<-), whether its
// body expands (an unquoted delimiter), whether its command reads a
// pipe (Scan inpipe as it was read: so does what its body runs), the
// shell as it was then (its body expands so)
type Doc = { delim: string; strip: boolean; expand: boolean; redir: Redir; inpipe: boolean; was: State };

// the reading: the text and where in it; the parts found; the folder
// (null: unknown), the variables set so far, whether one may have been
// set unseen (wild: a source), the heredocs waiting; what wrappers
// around a nested script (bash -c, eval) give its parts; whether its
// commands read another's output (inpipe: after a |, inside a group, a
// subshell or a loop a pipe goes into, inside >(...), a nested script or
// a substitution run by a command that reads one: piped); where the text
// read lies in the command parsed: from base on, as written (null: a
// nested script's, changed as it was read: its parts all placed at box,
// the text there that holds it); the pipelines read, by their parts (the
// first, the one past the last: Part feed)
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
  docs  : Doc[];
  root  : boolean;
  fed   : boolean;
  inpipe: boolean;
  depth : number;
  pipes : Span[];
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

// why a command can't be read
class Unread extends Error {}

// Constants
// =========

// the most values a word takes (more: dynamic); the deepest nesting of
// subshells and nested scripts read
const MOST = 16;
const NEST = 64;

// what ends a word unquoted
const META = " \t\n;&|()<>";

// an exit, as the command after a || (its own: not piped nor in the
// background, which would run it in a subshell). A return, at the top
// of a script not sourced, fails and goes on
const EXITS = /^\s*exit(?:[ \t]+[\w$?-]+)?(?:[ \t]*(?:[;\n]|$)|[ \t]+#)/;

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
// options (Opts), and the words after them before the command (timeout's
// duration, flock's file)
const WRAPS: Record<string, Opts & { then?: number }> = {
  builtin  : { args: [], flags: [] },
  chronic  : { args: [], flags: ["-e", "-v"] },
  command  : { args: [], flags: ["-p"] },
  env      : { args: ["-u", "--unset", "-C", "--chdir", "-S", "--split-string"], flags: ["-i", "--ignore-environment", "-0", "--null", "-v", "--debug"] },
  exec     : { args: ["-a"], flags: ["-c", "-l"] },
  flock    : { args: ["-w", "--timeout", "-E", "--conflict-exit-code"], flags: ["-s", "--shared", "-x", "-e", "--exclusive", "-u", "--unlock", "-n", "--nb", "--nonblock", "-o", "--close", "-F", "--no-fork", "--verbose"], then: 1 },
  ionice   : { args: ["-c", "--class", "-n", "--classdata", "-p", "--pid", "-P", "--pgid", "-u", "--uid"], flags: ["-t", "--ignore"] },
  nice     : { args: ["-n", "--adjustment"], flags: [], num: true },
  nohup    : { args: [], flags: [] },
  setsid   : { args: [], flags: ["-c", "--ctty", "-f", "--fork", "-w", "--wait"] },
  stdbuf   : { args: ["-i", "-o", "-e", "--input", "--output", "--error"], flags: [] },
  time     : { args: ["-f", "--format", "-o", "--output"], flags: ["-p", "-v", "--verbose", "-a", "--append", "-q", "--quiet", "--portability"] },
  timeout  : { args: ["-s", "--signal", "-k", "--kill-after"], flags: ["--preserve-status", "--foreground", "-v", "--verbose"], then: 1 },
  unbuffer : { args: [], flags: ["-p"] },
  xargs    : { args: ["-a", "--arg-file", "-d", "--delimiter", "-E", "-I", "-L", "--max-lines", "-n", "--max-args", "-P", "--max-procs", "-s", "--max-chars", "--process-slot-var"], flags: ["-0", "--null", "-r", "--no-run-if-empty", "-t", "--verbose", "-p", "--interactive", "-x", "--exit", "-o", "--open-tty", "--show-limits"], tail: ["-e", "-i", "-l"] },
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
  // whose text isn't there as written)
  export function parse(command: string, cwd: string, at: number | Span = 0): Part[] | string {
    const [base, box]: [number | null, Span] = typeof at === "number" ? [at, [at, at + command.length]] : [null, at];
    const s: Scan = { src: command, at: 0, base, box, parts: [], cwd, vars: new Map(), wild: false, errexit: false, docs: [], root: false, fed: false, inpipe: false, depth: 0, pipes: [] };
    try {
      scan_list(s, "");
      pipe_feeds(s);
      return s.parts;
    } catch (err: any) {
      return err instanceof Unread ? err.message : "illi failed to read it (" + String(err?.message ?? err) + ")";
    }
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

  // a word from its nth character on (an option's value: --to=x)
  export function cut(w: Word, n: number): Word {
    const known = w.alts.every((a) => a.length >= n);
    const raw = w.raw.startsWith(w.alts[0].slice(0, n)) ? w.raw.slice(n) : w.raw;
    const at = w.at === undefined || raw === w.raw ? w.at : w.at + n;
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
    const exits = op === "||" && EXITS.test(s.src.slice(s.at));
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
// it runs after
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
    if (set !== null) {
      s.vars.set(set[1], DYN);
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
// runs (as is any after a source: it may have set them). Split (bash
// splits an unquoted value into words, and globs it): one holding a
// space is known only as it runs (x="rm -rf src"; $x is three words, a
// command), one holding *, ? or [ a glob
function var_put(s: Scan, b: Build, name: string, split = false): void {
  const v = s.vars.get(name);
  const known = v !== undefined ? v.alts : name === "PWD" ? (s.cwd === null ? null : [s.cwd]) : s.wild || name === "OLDPWD" || process.env[name] === undefined ? null : [process.env[name]!];
  if (known === null || (split && known.some((x) => /[ \t\n]/.test(x)))) {
    unknown(b);
    return;
  }
  add(b, known);
  b.glob ||= v?.glob === true || (split && known.some((x) => /[*?[]/.test(x)));
  if (v?.dynamic === true) {
    unknown(b);
  }
}

// a command's output put in a word: the folder for pwd (-L, -P), the
// repository's top (the nearest folder up holding .git) for git rev-parse
// --show-toplevel; else, or once a source or an assignment (PATH,
// GIT_DIR, TMPDIR) may have changed what they'd say, or while the
// environment's GIT_DIR or GIT_WORK_TREE points git elsewhere, known only
// as it runs. The file or folder mktemp makes (temp) is known only if
// it makes it (Word made: a failed one's output is empty; a command's
// output after it, whose status the assignment's would be, drops it).
// Split as var_put's
function output(s: Scan, b: Build, inner: string, split = false): void {
  const cmd = inner.trim().replace(/\s+/g, " ");
  b.made = Array.isArray(b.made) ? null : b.made;
  const odd = s.cwd === null || s.wild || ["PATH", "GIT_DIR", "GIT_WORK_TREE", "TMPDIR"].some((n) => s.vars.has(n));
  const git = cmd === "git rev-parse --show-toplevel" && process.env.GIT_DIR === undefined && process.env.GIT_WORK_TREE === undefined;
  const known = odd ? null : /^pwd( -[LP])?$/.test(cmd) ? s.cwd : git ? git_top(s.cwd!) : null;
  const made = odd || known !== null ? null : temp(cmd, s.cwd!);
  const was = b.made === null ? null : (b.made ?? (b.dynamic ? null : b.alts));
  if (made !== null && was !== null && !(split && /[ \t\n*?[]/.test(made))) {
    b.made = was.length > MOST ? null : was.map((a) => a + made);
    b.dynamic = true;
    return;
  }
  if (known === null || (split && /[ \t\n]/.test(known))) {
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
        s.vars.set(m[1] ?? m[2] ?? m[3], DYN);
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
// the folder followed; another user's, or ~-, known only as it runs. One
// a brace goes on (~{,/x}) as bash takes it: the braces first, then each
// value's ~ (brace_tilde)
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

// a ~'s folder by its name (home's for none, ~+ the folder followed);
// null: known only as it runs
function tilde(s: Scan, name: string): string[] | null {
  if (name !== "") {
    return name === "+" && s.cwd !== null ? [s.cwd] : null;
  }
  const b: Build = { alts: [""], dynamic: false, glob: false };
  var_put(s, b, "HOME");
  return b.dynamic ? null : b.alts;
}

// a brace's values at a word's start, a ~ starting one expanded as a
// word's (bash expands braces first: {~,x}/y is ~/y and x/y); null: one
// known only as it runs (another user's; a ~ whose name goes on past
// the brace)
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
// not as the commands after it on its line leave it)
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
      scan_body(s, body, from, doc.inpipe);
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
  s.vars.set(name.raw, next?.raw !== "in" ? DYN : { alts: many ? [""] : alts, raw: "", dynamic: alts.length > MOST || values.some((v) => v.dynamic), glob: values.some((v) => v.glob), fd: false });
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
// either side of && or ||, nor negated); trust: so, a failure in it ends
// the script (set -e, or || exit after it)
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
// One variable set alone to what a mktemp makes (Word made), its failure
// ending the script (trust: so the variable never stays empty), stands
// for where it makes it
function cmd_run(s: Scan, cmd: Cmd, full: string, piped: boolean, top: boolean, trust: boolean): void {
  const ctx = { cwd: s.cwd, root: s.root, fed: s.fed, piped: piped || s.inpipe, span: place(s, cmd.from, cmd.to) };
  if (cmd.words.length === 0) {
    const one = trust && cmd.env.length === 1 && cmd.redirs.length === 0 ? cmd.env[0] : null;
    const env = one?.value.made === undefined ? cmd.env : [{ name: one.name, value: { ...one.value, alts: one.value.made, dynamic: false, made: undefined } }];
    env.forEach((e) => s.vars.set(e.name, e.value));
    part_push(s, [], env, cmd.redirs, full, ctx);
    return;
  }
  const run = unwrap(s, cmd.words, cmd.env, cmd.redirs, full, ctx);
  if (run !== null) {
    cmd_after(s, run.argv, run.own, top);
  }
}

// what a builtin changes of the shell for the commands after it (own: run
// by this shell, a wrapper of its own before it at most): the folder (cd,
// pushd: to its target, -P's as the system finds it; to home; popd, cd
// -: unknown), the variables (set to plain words as written, else known
// only as it runs), all of them after a source; aliases on, a command
// hashed to a path, a builtin loaded or one turned off can't be followed.
// A cd another program runs (sudo cd, env cd, exec cd) leaves the folder
// unknown. errexit (set -e, as -euo pipefail; set -o errexit) turns on
// only by a set the command runs whenever it runs (top: cmd_end); off by
// any (+e, +o errexit), a set of words known only as it runs, or any
// shopt -o (shopt -uo errexit)
function cmd_after(s: Scan, argv: Word[], own: boolean, top = false): void {
  const name = Shell.program(argv[0]);
  const args = argv.slice(1);
  const names = args.filter((a) => /^[A-Za-z_]\w*$/.test(a.raw)).map((a) => a.raw);
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
      s.cwd = one === undefined ? (name === "cd" ? home : null) : one === null || one === "-" || /^[+-]\d+$/.test(one) || from === null ? null : physical ? Shell.walk(from, one) : path.resolve(from, one);
      return;
    }
    case "popd": {
      s.cwd = null;
      return;
    }
    case "source":
    case ".": {
      s.wild = true;
      return;
    }
    case "export":
    case "declare":
    case "typeset":
    case "local":
    case "readonly": {
      for (const a of args) {
        const set = /^([A-Za-z_]\w*)(\+?)=/.exec(a.raw);
        if (set !== null) {
          s.vars.set(set[1], set[2] === "+" ? DYN : Shell.cut(a, set[0].length));
        }
      }
      return;
    }
    case "read":
    case "mapfile":
    case "readarray":
    case "getopts":
    case "printf": {
      if (name !== "printf" || args.some((a) => a.raw === "-v")) {
        names.forEach((n) => s.vars.set(n, DYN));
      }
      return;
    }
    case "set": {
      for (let k = 0; k < args.length; k++) {
        const flag = args[k].dynamic || args[k].alts.length !== 1 ? null : /^([-+])([A-Za-z]+)$/.exec(args[k].alts[0]);
        const opt  = flag?.[2].includes("o") ? args[++k] : undefined;
        if (flag === null || opt?.dynamic || (opt !== undefined && opt.alts.length !== 1)) {
          s.errexit &&= !args[k].dynamic && args[k].alts.length === 1;
          break;
        }
        if (flag[2].includes("e") || opt?.alts[0] === "errexit") {
          s.errexit = flag[1] === "-" ? s.errexit || top : false;
        }
      }
      return;
    }
    case "let": {
      args.forEach((a) => [...a.alts[0].matchAll(SETS)].forEach((m) => s.vars.set(m[1] ?? m[2] ?? m[3], DYN)));
      return;
    }
    case "unset": {
      if (!args.some((a) => a.raw === "-f")) {
        names.forEach((n) => s.vars.set(n, Shell.lit("")));
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
// null: a nested script read instead. A trap's action that may run set
// or shopt turns errexit off: it runs in this shell, whenever it fires
function unwrap(s: Scan, words: Word[], env: Env[], redirs: Redir[], full: string, ctx: Ctx): { argv: Word[]; own: boolean } | null {
  let argv = words;
  let own = true;
  for (;;) {
    const name = Shell.program(argv[0]);
    const rest = argv.slice(1);
    if (name === "su" || name === "sudoedit") {
      ctx = { ...ctx, root: true };
      break;
    }
    if (ROOTS[name] !== undefined) {
      const after = Shell.opts(rest, { args: ROOTS[name] }).rest;
      const edit = name === "sudo" && rest.slice(0, rest.length - after.length).some((w) => w.raw === "--edit" || /^-[^-ughpCDrtTU]*e/.test(w.raw));
      ctx = { ...ctx, root: true };
      own = false;
      argv = edit ? [Shell.lit("sudoedit"), ...after] : after;
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
      if (name === "env") {
        if (got.has("-S") || got.has("--split-string")) {
          throw new Unread("env -S splits a string into a command");
        }
        const dir = got.get("-C") ?? got.get("--chdir");
        if (dir !== undefined) {
          ctx = { ...ctx, cwd: dir.dynamic || dir.alts.length !== 1 ? null : path.isAbsolute(dir.alts[0]) ? dir.alts[0] : ctx.cwd === null ? null : path.resolve(ctx.cwd, dir.alts[0]) };
        }
        while (next.length > 0 && /^[A-Za-z_]\w*=/.test(next[0].raw)) {
          const set = /^([A-Za-z_]\w*)=/.exec(next[0].raw)!;
          env = [...env, { name: set[1], value: Shell.cut(next[0], set[0].length) }];
          next = next.slice(1);
        }
      }
      if (name === "xargs") {
        const mark = got.get("-I")?.alts[0] ?? (got.has("-i") ? got.get("-i")!.alts[0] || "{}" : null);
        ctx = { ...ctx, fed: true };
        next = next.length === 0 ? [Shell.lit("echo")] : next;
        next = mark === null || got.get("-I")?.dynamic ? [...next, { ...DYN, input: true }] : next.map((w) => (w.alts.some((a) => a.includes(mark)) ? { ...DYN, raw: w.raw, input: true } : w));
      }
      if (name === "flock" && /^(-c|--command)$/.test(next[0]?.raw ?? "")) {
        nested(s, next[1] ?? DYN, ctx, true, undefined, redirs, env);
        if (redirs.length > 0) {
          part_push(s, [], env, redirs, full, ctx);
        }
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
        if (redirs.length > 0) {
          part_push(s, [], env, redirs, full, ctx);
        }
        return null;
      }
    }
    const trap = rest[0]?.raw === "--" ? rest.slice(1) : rest;
    if (name === "eval" || name === "watch" || (name === "trap" && trap.length >= 2 && !/^-/.test(trap[0].raw) && trap[0].alts[0] !== "")) {
      const words = name === "trap" ? trap.slice(0, 1) : name === "watch" ? watch_words(rest) : rest;
      if (words === null) {
        argv = Shell.opts(rest, { args: WATCH }).rest;
        own = false;
        continue;
      }
      if (words.some((w) => w.dynamic || w.alts.length !== 1)) {
        throw new Unread(name + " runs a command made as it runs");
      }
      s.errexit &&= name !== "trap" || !/\b(?:set|shopt)\b/.test(words[0].alts[0]);
      nested(s, Shell.lit(words.map((w) => w.alts[0]).join(" ")), ctx, name !== "eval" || !own, words, name === "trap" ? [] : redirs, env);
      if (redirs.length > 0) {
        part_push(s, [], env, redirs, full, ctx);
      }
      return null;
    }
    break;
  }
  if (Shell.program(argv[0]) === "find") {
    argv = find_execs(s, argv, ctx, redirs);
  }
  part_push(s, argv, env, redirs, full, ctx);
  return { argv, own };
}

// a nested script's commands, run by a wrapper (its root; its input:
// fed, the pipe it reads, what its redirections give: its commands'
// too, stdin_give): in a shell of its own (sub: bash -c, trap, watch:
// its folder and variables its own, the variables only the
// environment's; those this shell set or the command gives (env), which
// it may export, known only as it runs; errexit off), else in this one
// (eval; the variables the command gives known only as it runs). Its
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
          s.vars = new Map([...s.vars.keys(), ...env.map((e) => e.name)].map((n) => [n, DYN]));
          s.errexit = false;
          scan_text(s, text, at, box);
        });
      } else {
        env.forEach((e) => s.vars.set(e.name, DYN));
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

function part_push(s: Scan, argv: Word[], env: Env[], redirs: Redir[], full: string, ctx: Ctx): void {
  s.parts.push({ argv, env, redirs, cwd: ctx.cwd, text: argv.map((w) => w.raw).join(" "), full, root: ctx.root, fed: ctx.fed, piped: ctx.piped, span: ctx.span });
}

// a folder's real place (links followed) if it exists, else as named
function really(dir: string): string {
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
}
