// Shell
// =====
// A shell tool's command read as bash reads it, so Guard.ts can judge it
// before it runs: every simple command in it (a part), wherever it sits
// (a pipeline, a list, a subshell, a command's substitution, a heredoc's
// body, a loop, a bash -c's script, an eval's, a trap's, a find -exec's),
// each with its words as they'd expand, its assignments, its
// redirections and the folder it runs in (each cd followed). Wrappers
// that run the command after them (sudo, timeout, env, xargs, ...) are
// taken off, the part saying so (root: run as root; fed: some of its
// arguments come from its input). A word known only as the command runs
// (a variable it never sets and the environment lacks, a command's
// output) is dynamic, its known head kept; a variable the command sets
// to plain words (X=a, for X in a b) stands for each of them.
// What bash would read in a way this can't follow (case, functions,
// arrays, aliases, a script made as it runs) leaves no parts, only why:
// such a command is asked about. The shell tool runs bash (Machine.ts),
// so this is the language it runs.

import * as os from "node:os";
import * as path from "node:path";

// Types
// =====

// a word as bash would expand it: each value it can take (one, or a
// variable's several), as written (raw); dynamic: only its head (alts)
// is known before it runs; glob: an unquoted *, ?, [ or {; fd: a
// process substitution's /dev/fd file
export type Word = { alts: string[]; raw: string; dynamic: boolean; glob: boolean; fd: boolean };

// a redirection: its operator (">", ">>", "<", "&>", "<<", ">&", ...) and
// its target (a file; a descriptor for >& and <&; a heredoc's delimiter),
// what it feeds the command as text (a heredoc's body, a here-string's)
export type Redir = { op: string; target: Word; body?: string };

export type Env = { name: string; value: Word };

// a simple command: its words (wrappers taken off), the assignments
// before them, its redirections, the folder it runs in (null: known only
// as it runs), its words as written (text) and the whole command as
// written (full: wrappers, assignments and redirections too); whether it
// runs as root, takes arguments from its input (fed), reads a pipe's
// output (piped)
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
};

// a command being read: its words, assignments and redirections so far,
// where its text starts and ends (-1: nothing read yet)
type Cmd = { words: Word[]; env: Env[]; redirs: Redir[]; from: number; to: number };

// how a part runs, as the wrappers before it left it
type Ctx = { cwd: string | null; root: boolean; fed: boolean; piped: boolean };

// a word's values as it is read
type Build = { alts: string[]; dynamic: boolean; glob: boolean };

// a heredoc waiting for its body (the lines after its command's):
// its end line, whether tabs before that are dropped (<<-), whether its
// body expands (an unquoted delimiter)
type Doc = { delim: string; strip: boolean; expand: boolean; redir: Redir };

// the reading: the text and where in it; the parts found; the folder
// (null: unknown), the variables set so far, whether one may have been
// set unseen (wild: a source), the heredocs waiting; what wrappers
// around a nested script (bash -c, eval) give its parts
type Scan = {
  src   : string;
  at    : number;
  parts : Part[];
  cwd   : string | null;
  vars  : Map<string, Word>;
  wild  : boolean;
  docs  : Doc[];
  root  : boolean;
  fed   : boolean;
  depth : number;
};

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

// the reserved words that only group commands: read past
const SKIP = new Set(["if", "then", "elif", "else", "fi", "do", "done", "while", "until", "!", "{", "}"]);

// those whose commands this doesn't follow
const REFUSE = new Set(["case", "esac", "select", "function", "coproc"]);

// the redirections, longest first
const REDIRS = ["<<<", "<<-", "&>>", "<<", "<>", "<&", ">>", ">|", ">&", "&>", "<", ">"];

// the shells whose -c runs a script
const SHELLS = new Set(["sh", "bash", "dash", "zsh", "ksh", "ash", "mksh"]);

// the folders whose programs are the system's: named by their path, still
// the same program (/usr/bin/rm is rm); a program elsewhere is its own
const BINS = new Set(["/bin", "/sbin", "/usr/bin", "/usr/sbin", "/usr/local/bin", "/usr/local/sbin", "/opt/homebrew/bin"]);

// the wrappers that run the command after their options, each with its
// options (Opts), and the words after them before the command (timeout's
// duration)
const WRAPS: Record<string, Opts & { then?: number }> = {
  builtin  : { args: [], flags: [] },
  chronic  : { args: [], flags: ["-e", "-v"] },
  command  : { args: [], flags: ["-p"] },
  env      : { args: ["-u", "--unset", "-C", "--chdir", "-S", "--split-string"], flags: ["-i", "--ignore-environment", "-0", "--null", "-v", "--debug"] },
  exec     : { args: ["-a"], flags: ["-c", "-l"] },
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
  // here asks rather than lets a command through)
  export function parse(command: string, cwd: string): Part[] | string {
    const s: Scan = { src: command, at: 0, parts: [], cwd, vars: new Map(), wild: false, docs: [], root: false, fed: false, depth: 0 };
    try {
      scan_list(s, "");
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

  // a word from its nth character on (an option's value: --to=x)
  export function cut(w: Word, n: number): Word {
    const known = w.alts.every((a) => a.length >= n);
    const raw = w.raw.startsWith(w.alts[0].slice(0, n)) ? w.raw.slice(n) : w.raw;
    return known ? { ...w, alts: w.alts.map((a) => a.slice(n)), raw } : { ...DYN, raw };
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

// commands till the text ends, or (close ")") the ) that closes them
function scan_list(s: Scan, close: string): void {
  let cmd = cmd_new();
  let piped = false;
  const end = (op: string) => {
    cmd_end(s, cmd, piped, op === "|" || op === "|&" || op === "&");
    piped = op === "|" || op === "|&";
    cmd = cmd_new();
  };
  for (;;) {
    blank(s, false);
    const from = s.at;
    const c = s.src[s.at];
    const two = s.src.slice(s.at, s.at + 2);
    if (c === undefined) {
      if (close !== "") {
        throw new Unread("a " + close + " is missing");
      }
      end("");
      docs_read(s);
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
      end("\n");
      docs_read(s);
      continue;
    }
    if (c === ")") {
      if (close !== ")") {
        throw new Unread("a ) without its (");
      }
      s.at++;
      end("");
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
      s.at++;
      scope(s, () => scan_list(s, ")"));
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
        scan_redir(s, cmd);
      } else if (!cmd_word(s, cmd, word)) {
        continue;
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
      scan_dollar(s, b);
    } else if (c === "`") {
      scan_tick(s);
      b.dynamic = true;
    } else if (c === "~" && (s.at === start || /^[A-Za-z_]\w*\+?=$/.test(s.src.slice(start, s.at)))) {
      scan_tilde(s, b);
    } else if (c === "{" && brace(s.src, s.at) !== null) {
      const x = brace(s.src, s.at)!;
      if (x === "many") {
        b.dynamic = true;
        add(b, [c]);
        s.at++;
      } else {
        add(b, x.alts);
        b.glob ||= x.alts.some((a) => /[*?[]/.test(a));
        s.at = x.end;
      }
    } else {
      b.glob ||= "*?[".includes(c);
      add(b, [c]);
      s.at++;
    }
  }
  return { alts: b.alts, raw: s.src.slice(start, s.at), dynamic: b.dynamic, glob: b.glob, fd: false };
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
  if (!b.dynamic) {
    b.alts = b.alts.flatMap((a) => xs.map((x) => a + x));
    if (b.alts.length > MOST) {
      b.dynamic = true;
      b.alts = [""];
    }
  }
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
      scan_tick(s);
      b.dynamic = true;
    } else {
      add(b, [c]);
      s.at++;
    }
  }
}

// a $: an arithmetic, a command's output, a variable, or itself
function scan_dollar(s: Scan, b: Build): void {
  const rest = s.src.slice(s.at, s.at + 3);
  if (rest === "$((") {
    s.at = arith(s, s.at + 3);
    b.dynamic = true;
    return;
  }
  if (rest.startsWith("$(")) {
    s.at += 2;
    scope(s, () => scan_list(s, ")"));
    b.dynamic = true;
    return;
  }
  if (rest.startsWith("${")) {
    const end = brace_end(s, s.at + 2);
    const body = s.src.slice(s.at + 2, end - 1);
    s.at = end;
    if (/`|\$\(/.test(body)) {
      throw new Unread("a command inside ${...}");
    }
    if (/^[A-Za-z_]\w*$/.test(body)) {
      var_put(s, b, body);
    } else {
      b.dynamic = true;
    }
    return;
  }
  const name = /^\$([A-Za-z_]\w*)/.exec(s.src.slice(s.at));
  if (name !== null) {
    s.at += name[0].length;
    var_put(s, b, name[1]);
  } else if (/^\$[0-9@*#?$!-]/.test(rest)) {
    s.at += 2;
    b.dynamic = true;
  } else {
    add(b, ["$"]);
    s.at++;
  }
}

// a variable's values put in a word: as the command set it, else as the
// environment has it (PWD: the folder followed); else known only as it
// runs (as is any after a source: it may have set them)
function var_put(s: Scan, b: Build, name: string): void {
  const v = s.vars.get(name);
  if (v !== undefined) {
    add(b, v.alts);
    b.glob ||= v.glob;
    b.dynamic ||= v.dynamic;
    return;
  }
  const known = name === "PWD" ? s.cwd : s.wild || name === "OLDPWD" ? null : process.env[name] ?? null;
  if (known === null) {
    b.dynamic = true;
  } else {
    add(b, [known]);
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
function scan_tick(s: Scan): void {
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
  scope(s, () => scan_text(s, inner));
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
// the folder followed; another user's, or ~-, known only as it runs
function scan_tilde(s: Scan, b: Build): void {
  const m = /^~([A-Za-z0-9._-]*|[+-])(?=\/|[\s;&|()<>]|$)/.exec(s.src.slice(s.at));
  if (m === null) {
    add(b, ["~"]);
    s.at++;
    return;
  }
  s.at += m[0].length;
  if (m[1] === "") {
    var_put(s, b, "HOME");
  } else if (m[1] === "+" && s.cwd !== null) {
    add(b, [s.cwd]);
  } else {
    b.dynamic = true;
  }
}

// <(...) or >(...): its commands, a subshell's; the word, a /dev/fd file
function scan_proc(s: Scan): Word {
  const start = s.at;
  s.at += 2;
  scope(s, () => scan_list(s, ")"));
  return { alts: ["/dev/fd/63"], raw: s.src.slice(start, s.at), dynamic: false, glob: false, fd: true };
}

// a redirection and its target; a heredoc's body waits for the line's end
function scan_redir(s: Scan, cmd: Cmd): void {
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
  const redir: Redir = op === "<<<" ? { op, target, body: target.alts[0] + "\n" } : { op, target };
  if (op === "<<" || op === "<<-") {
    s.docs.push({ delim: target.alts[0], strip: op === "<<-", expand: !/['"\\]/.test(target.raw), redir });
  }
  cmd.redirs.push(redir);
}

// the heredocs' bodies, from the line after their command's: an unquoted
// delimiter's body expands, so the commands in it run
function docs_read(s: Scan): void {
  const docs = s.docs;
  s.docs = [];
  for (const doc of docs) {
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
    if (doc.expand) {
      scan_body(s, body);
    }
  }
}

// an expanding heredoc's body: its $ and ` read as in double quotes
function scan_body(s: Scan, body: string): void {
  const [src, at] = [s.src, s.at];
  Object.assign(s, { src: body, at: 0 });
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
    Object.assign(s, { src, at });
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
// it for a subshell's)
function scan_text(s: Scan, text: string): void {
  const [src, at, docs] = [s.src, s.at, s.docs];
  Object.assign(s, { src: text, at: 0, docs: [] });
  try {
    deeper(s, () => scan_list(s, ""));
  } finally {
    Object.assign(s, { src, at, docs });
  }
}

// a subshell's run: the folder and variables it changes are its own
function scope(s: Scan, run: () => void): void {
  const [cwd, vars, wild] = [s.cwd, new Map(s.vars), s.wild];
  deeper(s, run);
  Object.assign(s, { cwd, vars, wild });
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
// the background runs in a subshell: its cd and variables don't last
function cmd_end(s: Scan, cmd: Cmd, piped: boolean, forked: boolean): void {
  if (cmd_empty(cmd)) {
    return;
  }
  const run = () => cmd_run(s, cmd, s.src.slice(cmd.from, cmd.to).trim(), piped);
  if (piped || forked) {
    scope(s, run);
  } else {
    run();
  }
}

// a command's parts (an assignment alone: one without words, its
// variables set), and what it changes of the shell after it (cmd_after)
function cmd_run(s: Scan, cmd: Cmd, full: string, piped: boolean): void {
  const ctx = { cwd: s.cwd, root: s.root, fed: s.fed, piped };
  if (cmd.words.length === 0) {
    cmd.env.forEach((e) => s.vars.set(e.name, e.value));
    part_push(s, [], cmd.env, cmd.redirs, full, ctx);
    return;
  }
  unwrap(s, cmd.words, cmd.env, cmd.redirs, full, ctx);
  cmd_after(s, cmd.words);
}

// what a builtin changes of the shell for the commands after it: the
// folder (cd, pushd: to its target; to home; popd, cd -: unknown), the
// variables (set to plain words as written, else known only as it runs),
// all of them after a source; aliases on, a command hashed to a path or a
// builtin loaded can't be followed
function cmd_after(s: Scan, argv: Word[]): void {
  const name = Shell.program(argv[0]);
  const args = argv.slice(1);
  const names = args.filter((a) => /^[A-Za-z_]\w*$/.test(a.raw)).map((a) => a.raw);
  switch (name) {
    case "cd":
    case "pushd": {
      const to = args.find((a) => !/^-[LPe@]+$/.test(a.raw) && a.raw !== "--");
      const one = to === undefined || (!to.dynamic && to.alts.length === 1) ? to?.alts[0] : null;
      const home = process.env.HOME ?? os.homedir();
      s.cwd = one === undefined ? (name === "cd" ? home : null) : one === null || one === "-" || /^[+-]\d+$/.test(one) ? null : path.isAbsolute(one) ? path.resolve(one) : s.cwd === null ? null : path.resolve(s.cwd, one);
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
      if (args.some((a) => a.raw === "expand_aliases" || (name === "hash" && a.raw === "-p") || (name === "enable" && a.raw === "-f"))) {
        throw new Unread(name + " " + args.map((a) => a.raw).join(" "));
      }
      return;
    }
  }
}

// a command's wrappers taken off, each as it runs what follows it; a
// shell's -c script, an eval's words, a trap's action and a watch's
// command read as commands of their own; find's -exec commands too, each
// {} standing for what find searches (its start folders)
function unwrap(s: Scan, words: Word[], env: Env[], redirs: Redir[], full: string, ctx: Ctx): void {
  let argv = words;
  for (;;) {
    const name = Shell.program(argv[0]);
    const rest = argv.slice(1);
    if (name === "su") {
      ctx = { ...ctx, root: true };
      break;
    }
    if (ROOTS[name] !== undefined) {
      ctx = { ...ctx, root: true };
      argv = Shell.opts(rest, { args: ROOTS[name] }).rest;
      continue;
    }
    const wrap = WRAPS[name];
    if (wrap !== undefined) {
      if (name === "command" && /^-[vV]/.test(rest[0]?.raw ?? "")) {
        break;
      }
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
        ctx = { ...ctx, fed: true };
        next = next.length === 0 ? [Shell.lit("echo")] : next;
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
        nested(s, script, ctx, true);
        if (redirs.length > 0) {
          part_push(s, [], env, redirs, full, ctx);
        }
        return;
      }
    }
    const trap = rest[0]?.raw === "--" ? rest.slice(1) : rest;
    if (name === "eval" || name === "watch" || (name === "trap" && trap.length >= 2 && !/^-/.test(trap[0].raw) && trap[0].alts[0] !== "")) {
      const words = name === "trap" ? trap.slice(0, 1) : name === "watch" ? watch_words(rest) : rest;
      if (words === null) {
        argv = Shell.opts(rest, { args: WATCH }).rest;
        continue;
      }
      if (words.some((w) => w.dynamic || w.alts.length !== 1)) {
        throw new Unread(name + " runs a command made as it runs");
      }
      nested(s, Shell.lit(words.map((w) => w.alts[0]).join(" ")), ctx, name !== "eval");
      if (redirs.length > 0) {
        part_push(s, [], env, redirs, full, ctx);
      }
      return;
    }
    break;
  }
  if (Shell.program(argv[0]) === "find") {
    argv = find_execs(s, argv, ctx);
  }
  part_push(s, argv, env, redirs, full, ctx);
}

// a nested script's commands, run by a wrapper (its root, its input):
// in a shell of its own (sub: bash -c, trap, watch: its folder and
// variables its own, the variables only the environment's), else in this
// one (eval)
function nested(s: Scan, script: Word, ctx: Ctx, sub: boolean): void {
  if (script.dynamic) {
    throw new Unread("a shell runs a script made as it runs");
  }
  const [root, fed, cwd] = [s.root, s.fed, s.cwd];
  Object.assign(s, { root: ctx.root, fed: ctx.fed, cwd: ctx.cwd });
  try {
    for (const text of script.alts) {
      if (sub) {
        scope(s, () => {
          s.vars = new Map();
          scan_text(s, text);
        });
      } else {
        scan_text(s, text);
      }
    }
  } finally {
    Object.assign(s, { root, fed });
    s.cwd = sub ? cwd : s.cwd;
  }
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
// its start folders; the find left without them
function find_execs(s: Scan, argv: Word[], ctx: Ctx): Word[] {
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
    if (inner.length > 0) {
      unwrap(s, inner, [], [], inner.map((w) => w.raw).join(" "), { ...ctx, piped: false });
    }
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

function part_push(s: Scan, argv: Word[], env: Env[], redirs: Redir[], full: string, ctx: Ctx): void {
  s.parts.push({ argv, env, redirs, cwd: ctx.cwd, text: argv.map((w) => w.raw).join(" "), full, root: ctx.root, fed: ctx.fed, piped: ctx.piped });
}
