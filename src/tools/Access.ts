// Access
// ======
// What a tool call asks leave for (Permissions.ts judges it): requests,
// each an action on resources and what "don't ask again" saves for it,
// in order, the first a folder outside the project (external_directory)
// when it touches one:
//
//   read, write, edit   a file: read, or edit (write too), its path
//                       from the working dir (outside the project, its
//                       absolute path, after its folder's request); "don't
//                       ask again" saves * (every file)
//   shell               each simple command, as written (shell): its
//                       leading assignments left out, wrappers kept
//                       (sudo rm -rf /), and its words as they'd expand
//                       (unquoted, ~ and the variables known filled in), a
//                       system program by name ('rm' -rf "/", /bin/rm -rf
//                       / and rm -rf "$X" with X=/ as rm -rf /: bare);
//                       each command a wrapper or a script runs (rm -rf /,
//                       bash -c's script's) and the wrapper's or script's
//                       own; "don't ask again" saves each one's head and *
//                       (git push *: arity). Folders outside: those it cds
//                       into, and paths its words or redirections name
//                       (absolute, ~, ~user, ..; a value glued to an
//                       option, --file=/x or -o/x, or after a name, of=/x;
//                       one made as it runs by its head), the stream
//                       devices left out (/dev/null, /dev/tty). A command
//                       Shell.ts can't read is split crudely into pieces,
//                       its paths found by their look, so a rule still
//                       finds most of what is in it
//   spawn, skill, ask   subagent (its agent's name), skill (its name),
//                       question
//   an MCP tool, any    its own name, on *
//
// A folder outside is the path's own if it is one, else its file's: its
// request's resource the folder and * (/x/y/*), saving its project's
// (the git repository holding it, but home or /) and * (nothing where
// that project's path holds *, ? or [). Inside: the working dir and
// the project's top (the git repository's; not /).
// illi's customization places are outside, allowed by its own rules
// (places, Permissions.base: its skills', commands' and agents' folders,
// a plugin's too, found at the load, by its real path: not the rest of
// a plugin, its code, hooks and MCP servers; its RULES.md and
// theme.json, which alone of their folder have their own
// path as resource, so allowing them allows nothing beside them). Paths
// are taken as written (. and .. worked out), links not followed.
// Claude Code's tools (hosted) ask as illi's like ones do: Bash a shell
// command, Monitor its command too (or its WebSocket's URL as a web
// fetch), Read a read, Write, Edit, MultiEdit and NotebookEdit an edit,
// Grep, Glob and LS a search of a folder (grep, glob, list), WebFetch
// and WebSearch theirs, Task and Agent a subagent, illi's own
// (mcp__illi__...) none here: they ask as they reach illi.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as config from "../config/Config.ts";
import { Custom } from "../config/Custom.ts";
import { Plugins } from "../config/Plugins.ts";
import { Shell, type Part, type Span, type Word } from "./Shell.ts";

// Types
// =====

// a request: its action, its resources, what "don't ask again" saves
// (patterns of the same action), and where each resource is in a shell
// command (null: not in one), so a question folding a long command
// still shows those lines
export type Request = { action: string; resources: string[]; save: string[]; spots: Array<Span | null> };

// where a call is judged: the working dir, the project's top, illi's own
// files allowed alone of their folders (RULES.md, theme.json)
export type Where = { cwd: string; top: string; files: string[] };

// a path's place: absolute; its resource (from the working dir inside,
// else absolute); outside, its folder's request (resource, save: ""
// where its project's path holds a wildcard character, which a pattern
// can't name alone: ~/*/* would allow every folder in home)
type Target = { absolute: string; resource: string; outside?: { resource: string; save: string } };

// a command's piece as written, and where it is
type Piece = { text: string; span: Span };

// Constants
// =========

// the commands that only move the shell (their folders asked, not they)
const CD = new Set(["cd", "chdir", "pushd", "popd"]);

// the builtins that set variables: a name=value of theirs names no
// folder (export PATH=~/bin:$PATH)
const SETS = new Set(["export", "declare", "typeset", "local", "readonly"]);

// how many expansions of a command's words a rule meets at most (bare):
// past it, a word's values in a row
const BARE = 16;

// the words that open a shell's own syntax, not a command (left off a
// piece's front, the piece dropped if a loop's head)
const RESERVED = new Set(["if", "then", "else", "elif", "fi", "do", "done", "while", "until", "esac", "!", "{", "}", "(", ")", "time"]);
const HEADS    = new Set(["for", "select", "case", "function"]);

// how many words name a command, by its first words (git push, npm run
// build): a family "don't ask again" saves (head and *); any other, its
// first word. illi's own table
const ARITY: Record<string, number> = {
  "git": 2, "git remote": 3, "git stash": 3, "git config": 3, "git worktree": 3, "git submodule": 3,
  "npm": 2, "npm run": 3, "npx": 2, "pnpm": 2, "pnpm run": 3, "pnpm dlx": 3, "yarn": 2, "yarn run": 3,
  "bun": 2, "bun run": 3, "bunx": 2, "deno": 2, "deno task": 3, "node": 1,
  "cargo": 2, "rustup": 2, "go": 2, "go mod": 3, "make": 2, "just": 2, "cmake": 1,
  "pip": 2, "pip3": 2, "uv": 2, "uv pip": 3, "uv tool": 3, "poetry": 2, "pipx": 2, "conda": 2,
  "python -m": 3, "python3 -m": 3, "gem": 2, "bundle": 2, "composer": 2, "mvn": 2, "gradle": 2, "dotnet": 2,
  "docker": 2, "docker compose": 3, "docker image": 3, "docker container": 3, "docker volume": 3, "docker network": 3,
  "docker-compose": 2, "podman": 2, "kubectl": 2, "helm": 2, "terraform": 2, "tofu": 2, "pulumi": 2,
  "gh": 2, "gh pr": 3, "gh issue": 3, "gh repo": 3, "gh release": 3, "gh run": 3, "gh workflow": 3, "gh api": 2,
  "aws": 3, "gcloud": 3, "az": 3, "fly": 2, "vercel": 2, "netlify": 2, "wrangler": 2,
  "brew": 2, "apt": 2, "apt-get": 2, "dnf": 2, "yum": 2, "pacman": 2, "snap": 2, "flatpak": 2,
  "systemctl": 2, "service": 3, "launchctl": 2, "tmux": 2, "illi": 2,
};

// the devices a command reads or writes as a stream, and the process's
// own descriptors: no folder asked for (any other device, a disk's, is)
const DEVICES = /^\/(?:dev\/(?:null|zero|u?random|tty|std(?:in|out|err)|fd(?:\/\d+)?)|proc\/self\/fd(?:\/\d+)?)$/;

// a path's character a pattern takes as a wildcard (Permissions.match:
// * and ?; [ too, kept clear of)
const WILD = /[*?[]/;

// the top folders known to exist, by name (a path whose top folder
// doesn't is no path: a regex, a pattern, /start/,/end/p)
const TOPS = new Map<string, boolean>();

// Access
// ======

export namespace Access {

  // the requests a call of illi's makes, in order
  export function requests(where: Where, tool: string, input: any): Request[] {
    switch (tool) {
      case "shell" : return Access.shell(where, String(input?.command ?? ""));
      case "read"  : return file(where, "read", [input?.path]);
      case "write" : return file(where, "edit", [input?.path]);
      case "edit"  : return file(where, "edit", (Array.isArray(input?.edits) ? input.edits : []).map((e: any) => e?.path));
      case "spawn" : return [plain("subagent", String(input?.agent || "general"))];
      case "skill" : return [{ ...plain("skill", String(input?.name ?? "")), save: [String(input?.name ?? "")] }];
      case "ask"   : return [plain("question", "*")];
    }
    return [plain(tool, "*")];
  }

  // the requests one of Claude Code's tools makes (its permission
  // prompt: Tools.approve), as illi's like ones do; illi's own
  // (mcp__illi__) none: they ask as they reach illi
  export function hosted(where: Where, tool: string, input: any): Request[] {
    const dir = (p: unknown) => (typeof p === "string" && p !== "" ? p : where.cwd);
    switch (tool) {
      case "Bash"         : return Access.shell(where, String(input?.command ?? ""));
      case "Monitor"      : return typeof input?.command === "string" ? Access.shell(where, input.command) : [plain("webfetch", String(input?.ws?.url ?? ""))];
      case "Read"         : return file(where, "read", [input?.file_path]);
      case "Write"        :
      case "Edit"         :
      case "MultiEdit"    : return file(where, "edit", [input?.file_path]);
      case "NotebookEdit" : return file(where, "edit", [input?.notebook_path]);
      case "Grep"         : return search(where, "grep", dir(input?.path), String(input?.pattern ?? ""));
      case "Glob"         : return search(where, "glob", glob_root(path.resolve(where.cwd, dir(input?.path)), String(input?.pattern ?? "")), String(input?.pattern ?? ""));
      case "LS"           : return search(where, "list", dir(input?.path), null);
      case "WebFetch"     : return [plain("webfetch", String(input?.url ?? ""))];
      case "WebSearch"    : return [plain("websearch", String(input?.query ?? ""))];
      case "Task"         :
      case "Agent"        : return [plain("subagent", String(input?.subagent_type || "general"))];
    }
    return tool.startsWith("mcp__illi__") ? [] : [plain(tool, "*")];
  }

  // a shell command's requests: the folders outside it touches, then its
  // commands (Shell.ts's parts, the wrappers' and scripts' own too; one
  // it can't read, in crude pieces)
  export function shell(where: Where, command: string): Request[] {
    const parts = Shell.parse(command, where.cwd);
    const found: Array<{ target: Target; span: Span | null }> = [];
    const pieces: Piece[] = [];
    if (typeof parts === "string") {
      pieces.push(...outer(command), ...crude(command));
      for (const m of command.matchAll(/(^|[\s=('"<>|;&`]|(?<=\s)-[A-Za-z])((?:~[\w.-]*|\.\.)?\/[^\s'"`;|&<>()$]*|\.\.(?=$|[\s'"`;|&<>)]))/g)) {
        if (m[1].startsWith("-") && m[2] === "/") {
          continue;
        }
        const at = m.index! + m[1].length;
        const t = path_target(where, m[2], where.cwd, null);
        t !== null && found.push({ target: t, span: [at, at + m[2].length] });
      }
    } else {
      for (const p of parts) {
        const run = p.cwd ?? where.cwd;
        if (p.cwd !== null && p.cwd !== where.cwd) {
          found.push({ target: Access.target(where, p.cwd, "directory"), span: p.span });
        }
        const program = Shell.program(p.argv[0]);
        const cd = CD.has(program);
        const sets = SETS.has(program);
        p.argv.slice(1).forEach((w) => paths(w, cd, sets).forEach((v) => {
          const t = path_target(where, v, run, cd ? "directory" : null);
          t !== null && found.push({ target: t, span: p.span });
        }));
        for (const r of p.redirs) {
          if (r.op.startsWith("<<") || (r.op.includes("&") && /^(?:\d+|-)$/.test(r.target.alts[0] ?? ""))) {
            continue;
          }
          r.target.alts.forEach((v) => {
            const t = path_target(where, v, run, null, true);
            t !== null && found.push({ target: t, span: p.span });
          });
        }
        if (!cd) {
          pieces.push({ text: p.full, span: p.span }, { text: p.text, span: p.span }, ...bare(p).map((text) => ({ text, span: p.span })));
        }
      }
      pieces.push(...outer(command));
    }
    const runs = commands(pieces);
    return [...external(found), ...(runs.length === 0 ? [] : [{ action: "shell", resources: runs.map((r) => r.text), save: [...new Set(runs.map((r) => Access.arity(words(r.text)).join(" ") + " *"))], spots: runs.map((r) => r.span) }])];
  }

  // a path's place (Target), from the working dir (~ as home); outside,
  // its folder's request: a folder's own (kind, else as the system has
  // it), a file's its folder's, one of illi's own files (Where files)
  // the file itself
  export function target(where: Where, p: string, kind?: "file" | "directory"): Target {
    const absolute = path.resolve(where.cwd, p === "~" ? os.homedir() : p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p);
    if (inside(where, absolute)) {
      return { absolute, resource: slash(path.relative(where.cwd, absolute) || ".") };
    }
    if (where.files.includes(absolute)) {
      return { absolute, resource: slash(absolute), outside: { resource: slash(absolute), save: slash(absolute) } };
    }
    const type = kind ?? (() => {
      try {
        return fs.statSync(absolute).isDirectory() ? "directory" : "file";
      } catch {
        return null;
      }
    })();
    const folder = type === "directory" ? absolute : path.dirname(absolute);
    const top    = project(folder);
    return { absolute, resource: slash(absolute), outside: { resource: slash(path.join(folder, "*")), save: WILD.test(top) ? "" : slash(path.join(top, "*")) } };
  }

  // whether a folder's resource (the folder and *) holds a character a
  // pattern takes as a wildcard: as a pattern it would meet other folders
  // too (~/*/* every folder in home), so it's taken as it is
  export function wild(resource: string): boolean {
    return WILD.test(resource.endsWith("/*") ? resource.slice(0, -2) : resource);
  }

  // folders outside (each its resource: the folder and *), those inside
  // another of them left out, by their paths: a * or ? in a folder's
  // name is that character, so ~/*/ hides no ~/.ssh/
  export function outermost(resources: string[]): string[] {
    const all = [...new Set(resources)];
    return all.filter((r) => !all.some((o) => o !== r && o.endsWith("/*") && r.startsWith(o.slice(0, -1))));
  }

  // illi's customization places, as the patterns its own rules allow
  // folders outside by (Permissions.base): its skills', commands' and
  // agents' folders (its root's, its profile's, each plugin's, those
  // shared, a project's), and its own files (own)
  export function places(cwd: string): string[] {
    const dirs = (["skills", "commands", "agents"] as const).flatMap((k) => [...[config.ROOT, config.DIR, ...Plugins.roots()].map((d) => path.join(d, k)), ...Custom.dirs(cwd, k)]);
    return [...new Set(dirs.map((d) => slash(path.join(d, "*")))), ...Access.own().map(slash)];
  }

  // illi's own files allowed alone of their folders: its RULES.md and
  // theme.json, its root's and its profile's, and those the `rules` and
  // `theme` settings name
  export function own(): string[] {
    const set = [config.RULES, config.THEME].filter((f) => f !== "");
    return [...new Set([...[config.ROOT, config.DIR].flatMap((d) => [path.join(d, "RULES.md"), path.join(d, "theme.json")]), ...set])];
  }

  // the words that name a command (ARITY), of its words as written
  export function arity(tokens: string[]): string[] {
    for (let n = Math.min(tokens.length, 3); n > 0; n--) {
      const k = ARITY[tokens.slice(0, n).join(" ")];
      if (k !== undefined) {
        return tokens.slice(0, k);
      }
    }
    return tokens.slice(0, 1);
  }

  // what "don't ask again" saves, in words (the question's: "Yes, and
  // don't ask again for ... in this project")
  export function said(action: string, resource: string, top: string): string {
    if (resource === "*") {
      return action === "read" ? "any file read" : action === "edit" ? "any file change" : action === "subagent" ? "any subagent" : action;
    }
    if (action === "external_directory") {
      return "files in " + shown(resource.endsWith("/*") ? resource.slice(0, -2) : resource, top) + (resource.endsWith("/*") ? "/" : "");
    }
    return action === "shell" ? resource : action + " " + resource;
  }

}

// Requests
// ========

// one action on one resource, "don't ask again" saving * of it
function plain(action: string, resource: string): Request {
  return { action, resources: [resource], save: ["*"], spots: [null] };
}

// a file tool's: the folders outside, then the action on the paths
function file(where: Where, action: string, paths: unknown[]): Request[] {
  const targets = paths.filter((p): p is string => typeof p === "string" && p !== "").map((p) => Access.target(where, p, "file"));
  const resources = [...new Set(targets.map((t) => t.resource))];
  return [...external(targets.map((target) => ({ target, span: null }))), ...(resources.length === 0 ? [] : [{ action, resources, save: ["*"], spots: resources.map(() => null) }])];
}

// a search of a folder: the folder if outside, then the action on its
// pattern (none: the folder's resource)
function search(where: Where, action: string, dir: string, pattern: string | null): Request[] {
  const target = Access.target(where, dir, "directory");
  return [...external([{ target, span: null }]), plain(action, pattern ?? target.resource)];
}

// the folders outside, as one request (each folder once, first seen
// first; one that saves nothing left out of its saves); none outside:
// none
function external(found: Array<{ target: Target; span: Span | null }>): Request[] {
  const seen = new Map<string, { save: string; span: Span | null }>();
  for (const { target, span } of found) {
    if (target.outside !== undefined && !seen.has(target.outside.resource)) {
      seen.set(target.outside.resource, { save: target.outside.save, span });
    }
  }
  return seen.size === 0 ? [] : [{ action: "external_directory", resources: [...seen.keys()], save: [...new Set([...seen.values()].map((v) => v.save).filter((s) => s !== ""))], spots: [...seen.values()].map((v) => v.span) }];
}

// Shell
// =====

// the commands of a shell command's pieces, as matched: each its leading
// assignments and shell words (do, then, !) left off, a loop's or case's
// head and a cd dropped, each once
function commands(pieces: Piece[]): Piece[] {
  const out: Piece[] = [];
  for (const p of pieces) {
    const ws = tokens(p.text);
    let k = 0;
    while (k < ws.length && (RESERVED.has(ws[k].raw) || /^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(ws[k].raw))) {
      k++;
    }
    if (k >= ws.length || HEADS.has(ws[k].raw) || CD.has(ws[k].raw)) {
      continue;
    }
    const text = p.text.slice(ws[k].at).trim();
    if (text !== "" && !out.some((o) => o.text === text)) {
      out.push({ text, span: p.span });
    }
  }
  return out;
}

// a command's words as written (quotes kept), each where it starts
function tokens(text: string): Array<{ raw: string; at: number }> {
  return [...text.matchAll(/(?:'[^']*'?|"(?:\\.|[^"\\])*"?|\\.|[^\s'"\\])+/gs)].map((m) => ({ raw: m[0], at: m.index! }));
}

function words(text: string): string[] {
  return tokens(text).map((t) => t.raw);
}

// a command's simple commands at its top, as written (a script given to
// bash -c or eval whole, so a rule on the wrapper finds it): split at ;
// & | and newlines outside quotes, $(...), `...` and (...), a heredoc's
// body skipped, a comment too
function outer(cmd: string): Piece[] {
  const out: Piece[] = [];
  const stack: string[] = [];
  const docs: Array<{ end: string; tabs: boolean }> = [];
  let start = 0;
  const cut = (end: number, next: number) => {
    const raw = cmd.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    text !== "" && out.push({ text, span: [start + lead, start + lead + text.length] });
    start = next;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    const top = stack.at(-1);
    if (top === "'") {
      c === "'" && stack.pop();
      continue;
    }
    if (c === "\\") {
      i++;
      continue;
    }
    if (top === "\"" || top === "`") {
      if (c === top) {
        stack.pop();
      } else if (c === "$" && cmd[i + 1] === "(") {
        stack.push("(");
        i++;
      } else if (c === "`" && top === "\"") {
        stack.push("`");
      }
      continue;
    }
    if (c === "'" || c === "\"" || c === "`") {
      stack.push(c);
    } else if (c === "(") {
      stack.push("(");
    } else if (c === ")" && top === "(") {
      stack.pop();
    } else if (c === "#" && (i === 0 || /\s/.test(cmd[i - 1]))) {
      const nl = cmd.indexOf("\n", i);
      i = (nl < 0 ? cmd.length : nl) - 1;
    } else if (c === "<" && cmd[i + 1] === "<" && cmd[i + 2] !== "<") {
      const m = /^<<(-?)\s*(?:'([^']*)'|"([^"]*)"|\\?([^\s;&|<>()]+))/.exec(cmd.slice(i));
      if (m !== null) {
        docs.push({ end: m[2] ?? m[3] ?? m[4], tabs: m[1] === "-" });
        i += m[0].length - 1;
      }
    } else if (c === "\n" && docs.length > 0) {
      let at = i + 1;
      for (const d of docs.splice(0)) {
        while (at < cmd.length) {
          const nl = cmd.indexOf("\n", at);
          const line = cmd.slice(at, nl < 0 ? cmd.length : nl);
          at = nl < 0 ? cmd.length : nl + 1;
          if ((d.tabs ? line.replace(/^\t+/, "") : line) === d.end) {
            break;
          }
        }
      }
      if (stack.length === 0) {
        cut(i, at);
      }
      i = at - 1;
    } else if (stack.length === 0 && (c === ";" || c === "\n" || (c === "&" && cmd[i - 1] !== ">" && cmd[i - 1] !== "<" && cmd[i + 1] !== ">") || (c === "|" && cmd[i - 1] !== ">"))) {
      const two = c !== "\n" && (cmd[i + 1] === c || (c === "|" && cmd[i + 1] === "&")) ? 1 : 0;
      cut(i, i + 1 + two);
      i += two;
    }
  }
  cut(cmd.length, cmd.length);
  return out;
}

// a command Shell.ts can't read, in crude pieces: split at every ; & |
// newline, $( ` ( and ), quotes or not, so a rule finds a command
// wherever it sits
function crude(cmd: string): Piece[] {
  const out: Piece[] = [];
  const re = /[;&|\n`()]|\$\(/g;
  let start = 0;
  for (const m of [...cmd.matchAll(re), null]) {
    const end = m === null ? cmd.length : m.index!;
    const raw = cmd.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    text !== "" && out.push({ text, span: [start + lead, start + lead + text.length] });
    start = m === null ? end : end + m[0].length;
  }
  return out;
}

// a word's values that may name a path: each value (a dynamic word's,
// its head; one whose ~user the system's passwd lacks, as written) and
// what follows its first = (dd of=/x; not a variable a builtin sets:
// sets), each of a list's (a:b); an option's glued value (--file=/x, or
// a short one's past its letter: -o/x, but a lone /, cut -d/), never
// the option; a glob's head before its first wild character
function paths(w: Word, cd: boolean, sets: boolean): string[] {
  const user = w.dynamic ? /^~[\w.-]+(?:\/[^\s'"$`*?[{\\]*)?/.exec(w.raw) : null;
  return [...(user === null ? [] : [user[0]]), ...w.alts.flatMap((v) => {
    const option = v.startsWith("-") && !cd;
    const glued = v.includes("=") && (option || !sets) ? v.slice(v.indexOf("=") + 1).split(":") : [];
    const short = option && /^-[^-]/.test(v) && v.slice(2) !== "/" ? [v.slice(2)] : [];
    const values = option ? [...glued, ...short] : [v, ...glued];
    return values.map((value) => (w.glob ? value.slice(0, value.search(/[*?[{]|$/)) : value)).filter((plain) => plain !== "");
  })];
}

// a command's words as they'd expand (unquoted, ~ and the variables
// known filled in; one known only as it runs as written), its program by
// name if a system one (/bin/rm as rm): so a rule on rm -rf /* meets
// 'rm' -rf "/" too. A word of several values (a brace's, a loop's
// variable's) gives a command for each (past BARE, its values in a row),
// so a rule on rm -rf /var/* meets for d in /tmp /var; do rm -rf $d; done
function bare(p: Part): string[] {
  const [head, ...rest] = p.argv;
  if (head === undefined) {
    return [];
  }
  let out = [Shell.program(head) || (head.dynamic ? head.raw : head.alts.join(" "))];
  for (const w of rest) {
    const values = w.dynamic ? [w.raw] : w.alts;
    out = out.length * values.length > BARE ? out.map((o) => o + " " + values.join(" ")) : out.flatMap((o) => values.map((v) => o + " " + v));
  }
  return out.map((o) => o.trim());
}

// a path's ~ as the home it names (Shell.home; a user the system's
// passwd lacks, beside illi's user's home, as the system most likely
// keeps it); anything else as it is
function home_of(v: string): string {
  const m = /^~([^/]*)(.*)$/s.exec(v);
  if (m === null) {
    return v;
  }
  return (m[1] === "" ? os.homedir() : Shell.home(m[1]) ?? path.join(path.dirname(os.homedir()), m[1])) + m[2];
}


// a path a command names (absolute, ~ or holding ..; a redirection's
// any), from its folder, if a path at all: not a stream device, its top
// folder there (/start/,/end/p is none)
// null: none
function path_target(where: Where, v: string, from: string, kind: "directory" | null, any = false): ReturnType<typeof Access.target> | null {
  const named = any || v.startsWith("/") || v.startsWith("~") || v.split("/").includes("..");
  if (!named) {
    return null;
  }
  const absolute = path.resolve(from, home_of(v));
  if (DEVICES.test(absolute) || !top_exists(absolute)) {
    return null;
  }
  return Access.target(where, absolute, kind ?? undefined);
}

function top_exists(absolute: string): boolean {
  const top = absolute.split("/")[1] ?? "";
  if (!TOPS.has(top)) {
    TOPS.set(top, fs.existsSync("/" + top));
  }
  return TOPS.get(top)!;
}

// Paths
// =====

// whether a path is inside: the working dir, or the project's top (not
// /)
function inside(where: Where, absolute: string): boolean {
  return under(absolute, where.cwd) || (where.top !== path.parse(where.top).root && under(absolute, where.top));
}

// the project a folder is in: the git repository holding it (but home
// or /), else the folder
function project(folder: string): string {
  const home = os.homedir();
  for (let dir = folder; dir !== path.dirname(dir) && dir !== home; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      return dir;
    }
  }
  return folder;
}

// a glob's folder: its head before the first part holding a wild
// character
function glob_root(dir: string, pattern: string): string {
  const parts = pattern.split("/");
  const k = parts.findIndex((p) => /[*?[\]{}]/.test(p));
  return path.resolve(dir, (k < 0 ? parts.slice(0, -1) : parts.slice(0, k)).join("/") || ".");
}

function under(file: string, dir: string): boolean {
  return file === dir || file.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);
}

// a path as said: from the project's top, home as ~
function shown(file: string, top: string): string {
  const home = os.homedir();
  return file === top ? "this project" : under(file, top) ? path.relative(top, file) : under(file, home) ? "~" + file.slice(home.length) : file;
}

function slash(p: string): string {
  return p.replaceAll("\\", "/");
}
