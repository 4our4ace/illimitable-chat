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
//                       ask again" saves * (every file), an edit of
//                       illi's guarded places those places
//   shell               each simple command, as written (shell): its
//                       leading assignments left out, wrappers kept
//                       (sudo rm -rf /), and its words as they'd expand
//                       (unquoted, ~ and the variables known filled in), a
//                       system program by name ('rm' -rf "/", /bin/rm -rf
//                       / and rm -rf "$X" with X=/ as rm -rf /: bare);
//                       each command a wrapper or a script runs (rm -rf /,
//                       bash -c's script's, a git setting's or a variable's
//                       naming a command: GIT_SSH_COMMAND) and the
//                       wrapper's or script's own; a program read also with
//                       its own options before what it does off (git -C x
//                       push also as git push: Shell.ts globals) and each
//                       git alias given to it put; "don't ask again" saves
//                       each one's head and * (git push *: arity), one so
//                       read its words as written through that head (git
//                       -C x push *), the command itself where an option
//                       is among them (Access.family). Folders outside:
//                       those it cds into or a wrapper or option moves it
//                       to (sudo -D, git -C: named from the shell's
//                       folder), and paths its words (from its folder and
//                       the shell's), a wrapper's own (time -o x, flock x:
//                       Part taken) or redirections (from the shell's) name
//                       (absolute, ~, ~user, ..; a value glued to an
//                       option, --file=/x or -o/x, or after a name, of=/x;
//                       one made as it runs by its head), the stream
//                       devices left out (/dev/null, /dev/tty). A command
//                       Shell.ts can't read (or a script in one: Part
//                       rough) is split crudely into pieces,
//                       its paths found by their look, so a rule still
//                       finds most of what is in it. One left partly
//                       unread (past a check's work, Shell Work;
//                       unreadable scripts nested ROUGH deep; scripts
//                       nested past Shell's NEST; a word or a variable
//                       too long to know, or whose use illi can't tell)
//                       asks whatever the rules allow (Request failed),
//                       and saves nothing
//   spawn, skill, ask   subagent (its agent's name), skill (its name),
//                       question
//   an MCP tool, any    its own name, on *
//
// A folder outside is the path's own if it is one, else its file's: its
// request's resource the folder and * (/x/y/*), saving its project's
// (the git repository holding it, but home or /) and * (nothing where
// that project's path holds *, ? or [). Inside: the working dir and
// the project's top (the git repository's; not /), but never illi's own
// folder (its root's, its profile's), outside every project, the home
// chat's too.
// illi's customization places are outside, allowed by its own rules
// (places, Permissions.base: its skills', commands' and agents' folders,
// a plugin's too, found at the load, by its real path: not the rest of
// a plugin, its code, hooks and MCP servers; its RULES.md and
// theme.json, which alone of their folder have their own
// path as resource, so allowing them allows nothing beside them). A
// change by the file tools to those every chat follows (guarded: the
// skills', commands' and agents' folders but a project's, the RULES.md
// files) asks, by its absolute path, so wherever those are (~/.agents
// in the home chat, a plugin's in its project); "don't ask again" saves
// that place, never every change.
// A shell command's write there is the shell's alone. Paths
// are taken as written (. and .. worked out); one inside whose real place
// is outside (a link on its way, followed: one to a file not there yet
// too, which a write would make) asks for that place's folder as well,
// as if named, so a repository's link never reaches outside unasked. A
// file a link makes another (inside or out) is its real place's
// resource as well (from the working dir's real place inside, else
// absolute), so a rule on a .env, or on one of illi's own files, finds
// it through a link.
// Claude Code's own tools (hosted), as it asks leave for one: of its
// built-in ones only its web fetch and search run in illi's calls
// (ClaudeCode.args), as webfetch (the URL) and websearch (the query);
// Google's CLI's web search and page reading, on antigravity, alike,
// asked by those names (Antigravity.approve); one of Claude Code's MCP
// servers' as its own name, on *; illi's own (mcp__illi__...) none here:
// they ask as they reach illi.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as config from "../config/Config.ts";
import { Custom } from "../config/Custom.ts";
import { Plugins } from "../config/Plugins.ts";
import { Permissions } from "./Permissions.ts";
import { Shell, type Env, type Part, type Span, type Word, type Work } from "./Shell.ts";

// Types
// =====

// a request: its action, its resources, what "don't ask again" saves
// (patterns of the same action), and where each resource is in a shell
// command (null: not in one), so a question folding a long command
// still shows those lines; failed: why it wasn't all read, so it asks
// whatever the rules allow (a rule that denies still refuses it:
// Tools.guard)
export type Request = { action: string; resources: string[]; save: string[]; spots: Array<Span | null>; failed?: string };

// where a call is judged: the working dir, the project's top, illi's own
// files allowed alone of their folders (RULES.md, theme.json)
export type Where = { cwd: string; top: string; files: string[]; guarded: string[] };

// a path's place: absolute; its resource (from the working dir inside,
// else absolute); its real place's, where a link on its way makes that
// another (from the working dir's real place inside, else absolute);
// outside, its folder's request (resource, save: "" where its project's
// path holds a wildcard character, which a pattern can't name alone:
// ~/*/* would allow every folder in home)
type Target = { absolute: string; place: string; resource: string; real?: string; outside?: { resource: string; save: string } };

// a command's piece as written, and where it is; what "don't ask again"
// saves for it, where not its family's (Access.family); odd: it saves
// itself alone (Access readings: a dry run, a word blank or holding * or
// ?, one short of what it does); crude: a piece of a command illi can't
// read (rough), its family taken crudely (Access family)
type Piece = { text: string; span: Span; save?: string[]; odd?: boolean; crude?: boolean };

// what a command's reading met: its pieces to meet the rules, the
// folders outside it touches, and whether some of it was left unread
// (a script past the check's work, Shell Work; unreadable ones nested
// ROUGH deep; one nested too deep, Part rough "deep"; a word whose use
// illi can't tell), so it asks
type Met = { pieces: Piece[]; found: Array<{ target: Target; span: Span | null }>; unread: boolean };

// one check's reading of a command: the work its readings share (Shell
// Work), and the scripts it couldn't read met so far (rough: one met
// again where it was, as a script read over and over leaves it, adds
// nothing); how much more text its parts' readings may make (text: TEXT
// at first)
type Check = { work: Work; rough: Set<string>; text: number };

// Constants
// =========

// the commands that only move the shell (their folders asked, not they)
const CD = new Set(["cd", "chdir", "pushd", "popd"]);

// the builtins that set variables: a name=value of theirs names no
// folder (export PATH=~/bin:$PATH)
const SETS = new Set(["export", "declare", "typeset", "local", "readonly"]);

// the variables naming where git keeps or finds a repository's files, its
// work tree or its settings: a value given, set or exported names a path
// as an argument does (GIT_DIR=../x/.git git status)
const GIT_PATHS = new Set(["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG"]);

// how many expansions of a command's words a rule meets at most (bare):
// past it, a word's values in a row
const BARE = 16;

// how deep a command illi can't read has its pieces read on their own
// (rough): a script in a piece that can't be read either is one deeper;
// one deeper still is left unread, so it asks
const ROUGH = 4;

// how much text a check's parts' readings make at most (readings: a word
// of many values gives a command its values in a row, each reading of
// it as long), so a loop's long values put in thousands of commands ask
// rather than take seconds and hundreds of megabytes: past it, each part
// is met as written alone, and the command asks
const TEXT = 1 << 22;

// the longest command illi reads (none typed is near it; a model writing
// a file through a heredoc may pass it): a longer one is met by its crude
// pieces alone (rough, ROUGH deep), and asks, so a check takes a moment
// however long the command
const COMMAND = 1 << 17;

// how much of a command past COMMAND is met (crudely, each piece read on
// its own under the check's work): the rest isn't, so a rule that denies
// what is there asks instead (Linux on 4 KB pages runs none past 128 KB
// in one argument, as illi passes it; macOS takes 1 MB in all)
const RUN = 1 << 18;

// the longest path the system opens (PATH_MAX): a longer one names no
// place it can reach, so it is taken as written (real)
const PATH_MAX = 4096;

// why a command left partly unread asks (Request failed)
const UNREAD = "it runs more scripts, or nests them deeper, than illi reads, or holds a word too long to read, or whose use illi can't tell";

// the git commands whose -n is a dry run (dry)
const GIT_DRY = new Set(["push", "add", "mv", "rm", "clean", "prune"]);

// make's long options that make a dry run, taken as short as any start
// of each (dry)
const MAKE_DRY = ["dry-run", "just-print", "recon", "touch", "question"];

// a word wholly made as it runs, as the rules' families read it (dry):
// one variable, a command's output, a $'...' read crudely
const MADE = /^["']?(?:\$(?:\{[^}]*\}|[A-Za-z_]\w*|\d|\(.*\)|'[^']*')|`.*`)["']?$/;

// the shell's own tests and sums, whose words bash may take as a sum and
// run what an array's index in it holds: a command's family never saved
const TESTS = new Set(["[[", "((", "let"]);

// a word wholly made as it runs, unquoted (a variable, a command's
// output): bash drops it where it comes out blank
const BLANK = /^(?:\$(?:\{[^}]*\}|[A-Za-z_]\w*|\d|\(.*\))|`.*`)$/s;

// the words that open a shell's own syntax, not a command (left off a
// piece's front, the piece dropped if a loop's head: its words after in,
// on a line of their own too)
const RESERVED = new Set(["if", "then", "else", "elif", "fi", "do", "done", "while", "until", "esac", "!", "{", "}", "(", ")", "time", "coproc"]);
const HEADS    = new Set(["for", "select", "case", "function", "in"]);

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
  // prompt: Tools.approve; Google's CLI's web tools by the same names):
  // its web fetch the URL, its web search the query, any other its name;
  // illi's own (mcp__illi__) none: they ask as they reach illi
  export function hosted(tool: string, input: any): Request[] {
    switch (tool) {
      case "WebFetch"  : return [plain("webfetch", String(input?.url ?? ""))];
      case "WebSearch" : return [plain("websearch", String(input?.query ?? ""))];
    }
    return tool.startsWith("mcp__illi__") ? [] : [plain(tool, "*")];
  }

  // a shell command's requests: the folders outside it touches, then its
  // commands (Shell.ts's parts, the wrappers' and scripts' own too, and
  // its simple commands at its top as written: tops; one it can't read,
  // in crude pieces, each read on its own too: rough), all its readings
  // sharing one check's work (Shell Work); one past COMMAND long met by
  // its crude pieces alone. One left partly unread asks
  // (Request failed: past that work, past COMMAND, unreadable scripts nested ROUGH
  // deep, scripts or the command itself nested past Shell's NEST, a word
  // or a variable too long to know, a word whose use illi can't tell:
  // Shell DEEP, SPENT), what was read still meeting the rules that deny
  export function shell(where: Where, command: string): Request[] {
    const check: Check = { work: Shell.work(), rough: new Set(), text: TEXT };
    const long = command.length > COMMAND;
    const text = command.length > RUN ? command.slice(0, RUN) : command;
    const parts = long ? Shell.SPENT : Shell.parse(command, where.cwd, 0, true, check.work);
    REALS = new Map();
    let met: Met;
    try {
      met = typeof parts === "string" ? rough(where, text, where.cwd, null, 0, check) : met_parts(where, parts, 0, check);
    } catch {
      // a failure meeting it (a bug, the stack outgrown) never lets it
      // through: its crude pieces alone, and it asks
      met = { pieces: [...outer(text), ...crude(text)].map((p) => ({ ...p, crude: true })), found: [], unread: true };
    } finally {
      REALS = null;
    }
    const pieces = typeof parts === "string" ? met.pieces : [...met.pieces, ...tops(command, met.pieces)];
    const runs = commands(pieces);
    const shell: Request = { action: "shell", resources: runs.map((r) => r.text), save: [...new Set(runs.flatMap((r) => r.save ?? [Access.family(r.text, r.crude)]))].filter((x) => x !== ""), spots: runs.map((r) => r.span) };
    if (met.unread || parts === Shell.DEEP || parts === Shell.SPENT) {
      return [...external(met.found), { ...shell, ...(runs.length === 0 ? { resources: [command], spots: [null] } : {}), failed: UNREAD }];
    }
    return [...external(met.found), ...(runs.length === 0 ? [] : [shell])];
  }

  // a path's place (Target), from the working dir (~ as home); outside,
  // its folder's request: a folder's own (kind, else as the system has
  // it), a file's its folder's, one of illi's own files (Where files)
  // the file itself
  export function target(where: Where, p: string, kind?: "file" | "directory"): Target {
    const absolute = path.resolve(where.cwd, p === "~" ? os.homedir() : p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p);
    const place = real(absolute);
    if (inside(where, absolute)) {
      const resource = slash(path.relative(where.cwd, absolute) || ".");
      const back     = inside(where, place) || (!mine(place) && (under(place, real(where.cwd)) || (where.top !== path.parse(where.top).root && under(place, real(where.top)))));
      const seen     = back ? slash(path.relative(real(where.cwd), place) || ".") : slash(place);
      return { absolute, place, resource, ...(seen === resource ? {} : { real: seen }), ...(back ? {} : { outside: Access.target(where, place, kind).outside }) };
    }
    const seen = place === absolute ? {} : { real: slash(place) };
    if (where.files.includes(absolute)) {
      return { absolute, place, resource: slash(absolute), ...seen, outside: { resource: slash(absolute), save: slash(absolute) } };
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
    return { absolute, place, resource: slash(absolute), ...seen, outside: { resource: slash(path.join(folder, "*")), save: WILD.test(top) ? "" : slash(path.join(top, "*")) } };
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

  // of illi's places, those every chat follows, an edit there asked
  // (Permissions.base), wherever the chat runs: the skills', commands'
  // and agents' folders of its root, its profile and each plugin, and
  // the skills shared with other agents (not a project's own, which it
  // keeps in sight); its RULES.md files (its root's, its profile's, the
  // `rules` setting's; not theme.json, which only paints)
  export function guarded(): string[] {
    const dirs  = (["skills", "commands", "agents"] as const).flatMap((k) => [config.ROOT, config.DIR, ...Plugins.roots()].map((d) => path.join(d, k, "*")));
    const rules = [...[config.ROOT, config.DIR].map((d) => path.join(d, "RULES.md")), ...(config.RULES === "" ? [] : [config.RULES])];
    return [...new Set([...dirs, path.join(config.AGENTS_DIR, "skills", "*"), ...rules].map(slash))];
  }

  // what of illi's own a change to `resources` touches (those its guarded
  // places hold: guarded), in words, in this order: its agents, skills,
  // commands, rules (RULES.md, where the `rules` setting puts it too)
  export function owned(resources: string[]): string[] {
    const guarded = Access.guarded();
    const kinds   = resources.flatMap((r) => guarded.filter((g) => Permissions.match(r, g)).map((g) => /\/(skills|commands|agents)\/\*$/.exec(g)?.[1] ?? "rules"));
    return ["agents", "skills", "commands", "rules"].filter((k) => kinds.includes(k));
  }

  // illi's own files allowed alone of their folders: its RULES.md and
  // theme.json, its root's and its profile's, and those the `rules` and
  // `theme` settings name
  export function own(): string[] {
    const set = [config.RULES, config.THEME].filter((f) => f !== "");
    return [...new Set([...[config.ROOT, config.DIR].flatMap((d) => [path.join(d, "RULES.md"), path.join(d, "theme.json")]), ...set])];
  }

  // what "don't ask again" saves for a command: its family (the words
  // that name it, Access.arity, its program by name) and any more after
  // them; the command itself where an option is among those words,
  // quoted or not (git -C x status as it is, never git -C *: a later git
  // -C x push that illi can't read without its options would take it),
  // one is blank or holds * or ? (a rule's own wildcards: git '*' would
  // save git * *, '*' x * *), it is a dry run (dry: approving make deploy
  // -n never approves make deploy), or it is short of its family's words
  // (git, npm run alone: never git *), or it is a test or a sum of the
  // shell's own (TESTS: [[ 1 -eq 'a[$(x)]' ]] runs x); "" (nothing saved) where that
  // command holds a * or ?, as it would save more than itself (git '*'
  // as git *). Crude (a piece of a command illi can't read: Access
  // rough), a word that looks wholly made as it runs ($N) may be a dry
  // run's; else such a word was read for what it is (a loop's $f)
  export function family(text: string, crude = false): string {
    const all = words(text);
    const names = all.map((w) => w.replace(/['"\\]/g, ""));
    names[0] = Shell.program(Shell.lit(names[0] ?? "")) || (names[0] ?? "");
    const n = Access.arity(names).length;
    const odd = TESTS.has(names[0]) || names.slice(1, n).some((v) => v.startsWith("-")) || names.slice(0, n).some((v) => v.trim() === "" || /[*?]/.test(v)) || dry(crude ? names : names.filter((v) => !MADE.test(v))) || (crude && all.slice(1).some((v) => MADE.test(v))) || n < Access.wanted(names);
    return !odd ? all.slice(0, n).join(" ") + " *" : /[*?]/.test(text) ? "" : text;
  }

  // how many words name a command (ARITY), of its words as written: its
  // family's, though fewer are given
  export function wanted(tokens: string[]): number {
    for (let n = Math.min(tokens.length, 3); n > 0; n--) {
      const k = ARITY[tokens.slice(0, n).join(" ")];
      if (k !== undefined) {
        return k;
      }
    }
    return 1;
  }

  // the words that name a command (ARITY), of its words as written
  export function arity(tokens: string[]): string[] {
    return tokens.slice(0, Access.wanted(tokens));
  }

  // what "don't ask again" saves, in words (the question's: "Yes, and
  // don't ask again for ... in this project")
  export function said(action: string, resource: string, top: string): string {
    if (resource === "*") {
      return action === "read" ? "any file read" : action === "edit" ? "any file change" : action === "subagent" ? "any subagent" : action;
    }
    if (action === "edit") {
      return "changes to " + shown(resource.endsWith("/*") ? resource.slice(0, -2) : resource, top) + (resource.endsWith("/*") ? "/" : "");
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

// a file tool's: the folders outside, then the action on the paths; an
// edit in one of illi's guarded places by its absolute path too (inside,
// as from home, its resource is relative), "don't ask again" saving
// those places alone, never every change
function file(where: Where, action: string, paths: unknown[]): Request[] {
  const targets   = paths.filter((p): p is string => typeof p === "string" && p !== "").map((p) => Access.target(where, p, "file"));
  const own       = action !== "edit" ? [] : targets.flatMap((t) => [t.absolute, t.place]).map(slash).filter((p) => where.guarded.some((g) => Permissions.match(p, g)));
  const resources = [...new Set([...targets.flatMap((t) => (t.real === undefined ? [t.resource] : [t.resource, t.real])), ...own])];
  const save      = own.length === 0 ? ["*"] : [...new Set(where.guarded.filter((g) => own.some((p) => Permissions.match(p, g))))];
  return [...external(targets.map((target) => ({ target, span: null }))), ...(resources.length === 0 ? [] : [{ action, resources, save, spots: resources.map(() => null) }])];
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
// assignments (an array's element's too, x[0]=1) and shell words (do,
// then, !, coproc and its name, a ( glued to what follows) left off (its
// saves too, so a family is taken from what it runs: x=(a); X=1 make
// deploy saves make deploy *, never *), a loop's or case's head and a cd
// dropped, each once
// (what it saves as the first that says; crude where any piece of that
// text was)
function commands(pieces: Piece[]): Piece[] {
  const out: Piece[] = [];
  const by = new Map<string, Piece>();
  for (const p of pieces) {
    const ws = tokens(p.text);
    let k = 0;
    while (k < ws.length) {
      const w = ws[k].raw;
      if (/^\((?!\()./s.test(w)) {
        // a subshell's ( glued to its first word: (X=1 make deploy
        ws[k] = { raw: w.slice(1), at: ws[k].at + 1 };
      } else if (w === "coproc" && /^[A-Za-z_]\w*$/.test(ws[k + 1]?.raw ?? "") && /^(?:\{|\(|if|while|until|for|case|select)/.test(ws[k + 2]?.raw ?? "")) {
        // coproc NAME { ...: its name before what it runs
        k += 2;
      } else if (RESERVED.has(w) || /^[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=/.test(w)) {
        k++;
      } else {
        break;
      }
    }
    if (k >= ws.length || HEADS.has(ws[k].raw) || CD.has(ws[k].raw)) {
      continue;
    }
    const text = p.text.slice(ws[k].at).trim();
    const lead = p.text.slice(0, ws[k].at);
    const save = p.save?.map((x) => (x.startsWith(lead) ? x.slice(lead.length).trim() : x));
    const known = by.get(text);
    if (known !== undefined) {
      known.save ??= save;
      known.crude ||= p.crude;
    } else if (text !== "") {
      const one: Piece = { text, span: p.span, ...(save === undefined ? {} : { save }), ...(p.crude === true ? { crude: true } : {}) };
      by.set(text, one);
      out.push(one);
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

// a command's simple commands at its top (outer), each saving itself
// alone where a command read in it saves itself alone (Piece odd: a dry
// run, a word blank or holding * or ?, one short of what it does), or
// nothing where one saves nothing, so its text as written (a comment
// after it, a parenthesis, a variable not yet filled in) never saves
// that command's family in its place (the odd ones in order, each
// outer one's found by where it starts: a command of many thousand
// parts checked in a moment)
function tops(cmd: string, met: Piece[]): Piece[] {
  const odds = met.filter((m) => m.odd === true).sort((a, b) => a.span[0] - b.span[0]);
  return outer(cmd).map((o) => {
    let lo = 0;
    for (let hi = odds.length; lo < hi; ) {
      const mid = (lo + hi) >> 1;
      odds[mid].span[0] < o.span[0] ? (lo = mid + 1) : (hi = mid);
    }
    const odd: Piece[] = [];
    for (let k = lo; k < odds.length && odds[k].span[0] <= o.span[1]; k++) {
      odds[k].span[1] <= o.span[1] && odd.push(odds[k]);
    }
    return odd.length === 0 ? o : { ...o, save: /[*?]/.test(o.text) || odd.some((m) => m.save?.length === 0) ? [] : [o.text], odd: true };
  });
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

// the plain values a command illi can't read gives its variables as
// written (P=push, P='a b', for o in a b), each name's BARE at most: its
// pieces are read on their own, so none knows them (filled)
function crude_vars(text: string): Map<string, string[]> {
  const vars = new Map<string, string[]>();
  const unquote = (v: string) => v.replace(/^(['"])(.*)\1$/s, "$2");
  const put = (name: string, v: string) => {
    const values = vars.get(name) ?? [];
    values.length < BARE && !values.includes(v) && values.push(v);
    vars.set(name, values);
  };
  for (const m of text.matchAll(/(?<![^\s;&|(){}])([A-Za-z_]\w*)=('[^']*'|"[^"$`\\]*"|[^\s;&|()<>$`'"\\]*)(?=[\s;&|()]|$)/g)) {
    put(m[1], unquote(m[2]));
  }
  for (const m of text.matchAll(/(?<![^\s;&|(){}])for\s+([A-Za-z_]\w*)\s+in\s+([^;&|\n`$()]*)/g)) {
    words(m[2]).forEach((w) => put(m[1], unquote(w)));
  }
  return vars;
}

// pieces of a command illi can't read, each using a variable it gives a
// plain value to (crude_vars) put with each value too (x=(a); P=push; git
// $P: git push), BARE ways at most, so a rule meets what it runs, each
// saving nothing (a value it may not hold then: F=; F=--dry-run; git push
// $F); their text the check's (Check text: past it, none more)
function filled(pieces: Piece[], vars: Map<string, string[]>, check: Check): Piece[] {
  if (vars.size === 0) {
    return pieces;
  }
  const out = [...pieces];
  for (const p of pieces) {
    if (check.text <= 0) {
      break;
    }
    let ways = [p.text];
    for (const m of new Set([...p.text.matchAll(/\$\{?([A-Za-z_]\w*)\}?/g)].map((m) => m[1]))) {
      const values = vars.get(m);
      if (values !== undefined && ways.length * values.length <= BARE) {
        const use = new RegExp("\\$(?:\\{" + m + "\\}|" + m + "(?!\\w))", "g");
        ways = ways.flatMap((w) => values.map((v) => w.replace(use, () => v)));
      }
    }
    ways.filter((w) => w !== p.text).forEach((text) => {
      check.text -= text.length;
      out.push({ text, span: p.span, save: [] });
    });
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

// a command's parts as Shell.ts read them, met: the folders outside it
// they touch (where each runs, the paths its words name, its
// redirections'), and its pieces to meet the rules (readings; a script
// in it this can't read, roughly: rough, `depth` deep), its readings
// sharing the check's work; whether any of it was left unread (Met)
function met_parts(where: Where, parts: Part[], depth: number, check: Check): Met {
  const found: Array<{ target: Target; span: Span | null }> = [];
  const pieces: Piece[] = [];
  let unread = false;
  for (const p of parts) {
    const at = p.at ?? where.cwd;
    const run = p.cwd ?? at;
    const froms = [...new Set([run, at])];
    if (p.cwd !== null && p.cwd !== where.cwd) {
      found.push({ target: Access.target(where, p.cwd, "directory"), span: p.span });
    }
    const program = Shell.program(p.argv[0]);
    const cd = CD.has(program);
    const sets = SETS.has(program);
    const named = (w: Word, dir: boolean, set: boolean) => paths(w, dir, set).forEach((v) => froms.forEach((from) => {
      const t = path_target(where, v, from, dir ? "directory" : null);
      t !== null && found.push({ target: t, span: p.span });
    }));
    [...p.argv.slice(1), ...p.plain.flatMap((r) => r.slice(1)).filter((w) => !p.argv.includes(w))].filter((w) => !p.dirs.some((d) => d.word === w)).forEach((w) => named(w, cd, sets));
    p.taken.forEach((w) => named(w, false, false));
    p.env.filter((e) => GIT_PATHS.has(e.name)).forEach((e) => named(e.value, false, false));
    sets && p.argv.slice(1).forEach((w) => {
      const m = /^([A-Za-z_]\w*)=/.exec(w.alts[0] ?? "");
      m !== null && GIT_PATHS.has(m[1]) && named(Shell.cut(w, m[0].length), false, false);
    });
    p.dirs.forEach((d) => paths(d.word, false, false).forEach((v) => (d.from === null ? froms : [d.from]).forEach((from) => {
      const t = path_target(where, v, from, "directory");
      t !== null && found.push({ target: t, span: p.span });
    })));
    for (const r of p.redirs) {
      if (r.op.startsWith("<<") || (r.op.includes("&") && /^(?:\d+|-)$/.test(r.target.alts[0] ?? ""))) {
        continue;
      }
      r.target.alts.forEach((v) => {
        const t = path_target(where, v, at, null, true);
        t !== null && found.push({ target: t, span: p.span });
      });
    }
    if (p.rough !== undefined && p.rough !== false) {
      const deep = p.rough === "spent" ? ROUGH : depth + 1;
      const key = [p.text, run, p.span, deep].join("\0");
      unread ||= p.rough === "deep";
      if (!check.rough.has(key)) {
        check.rough.add(key);
        const met = rough(where, p.text, run, p.span, deep, check, true);
        add(pieces, met.pieces);
        add(found, met.found);
        unread ||= met.unread;
      }
    } else if (!cd && check.text <= 0) {
      add(pieces, [{ text: p.full, span: p.span }, { text: p.text, span: p.span }]);
      unread = true;
    } else if (!cd) {
      const read = readings(p);
      read.forEach((r) => (check.text -= r.text.length));
      add(pieces, read);
    }
  }
  return { pieces, found, unread };
}

// a list's items put at another's end, one by one (a push of them all at
// once, as arguments, overflows the stack past some thousands)
function add<T>(to: T[], items: T[]): void {
  for (const item of items) {
    to.push(item);
  }
}

// a command illi can't read (or a script in one: Part rough), met
// crudely: its pieces (outer, crude: its rules still meet most of what is
// in it) and the paths it names by their look, from `from`; each where
// it is in it, or all at `span`. Each piece is read on its own too, where
// Shell.ts reads it (met_parts, ROUGH deep at most), so a construct it
// can't follow (an array, a case) leaves the rest of the command read as
// ever (git -C x push; x=(a): git push too); these only add to what the
// crude reading meets, never take from it, and share the check's work.
// A script's (own: Part rough) is read whole on its own too, as it may
// be read so (one nested too deep, one read loosely: GIT_PAGER=$NOPE'/bin/rm
// -rf y' as /bin/rm -rf y, so as rm -rf y too); a whole command isn't,
// as it was just read so. A script Shell.ts left unread past that work
// (Part rough "spent") isn't read so, nor one ROUGH deep: left unread
// (Met), so the check asks; so too where a piece nests deeper than Shell.ts
// reads (Shell DEEP: x=(a); eval eval ... git push, its crude pieces
// never meeting what runs at its end)
function rough(where: Where, text: string, from: string, span: Span | null, depth: number, check: Check, own = false): Met {
  // its variables' plain values put in only where its pieces are read on
  // (short of ROUGH: one left unread past that asks all the same)
  const split = depth >= ROUGH ? [...outer(text), ...crude(text)] : filled([...outer(text), ...crude(text)], crude_vars(text), check);
  const pieces: Piece[] = split.map((p) => ({ ...p, ...(span === null ? {} : { span }), crude: true }));
  const found: Array<{ target: Target; span: Span | null }> = [];
  for (const m of text.matchAll(/(^|[\s=('"<>|;&`]|(?<=\s)-[A-Za-z])((?:~[\w.-]*|\.\.)?\/[^\s'"`;|&<>()$]*|\.\.(?=$|[\s'"`;|&<>)])|~[\w.-]*(?=$|[\s'"`;|&<>)]))/g)) {
    if ((m[1].startsWith("-") && m[2] === "/") || (m[1] === "=" && m[2].startsWith("~") && /^\s?$/.test(text[m.index! - 1] ?? ""))) {
      // a lone / glued to an option (cut -d/); [[ a =~ b ]]'s operator
      continue;
    }
    const at = m.index! + m[1].length;
    const t = path_target(where, m[2], from, null);
    t !== null && found.push({ target: t, span: span ?? [at, at + m[2].length] });
  }
  if (depth >= ROUGH) {
    return { pieces, found, unread: true };
  }
  // the check's text spent (filled's, the readings'): some of it unmet
  let unread = check.text <= 0;
  const seen = new Set(own ? [] : [text.trim()]);
  for (const piece of split) {
    if (seen.has(piece.text)) {
      continue;
    }
    seen.add(piece.text);
    const parts = Shell.parse(piece.text, from, span ?? piece.span[0], true, check.work);
    if (typeof parts !== "string") {
      const met = met_parts(where, parts, depth + 1, check);
      // a piece filled with a variable's value meets the rules, saving
      // nothing (filled: F=; F=--dry-run; git push $F never saves git push *)
      const quiet = piece.save !== undefined;
      add(pieces, met.pieces.map((p) => ({ ...p, ...(span === null ? {} : { span }), ...(quiet ? { save: [] } : {}) })));
      add(found, met.found.map((f) => (span === null ? f : { ...f, span })));
      unread ||= met.unread;
    }
    unread ||= parts === Shell.DEEP || parts === Shell.SPENT;
  }
  return { pieces, found, unread };
}

// a part's commands to meet the rules: as written whole (wrappers too),
// its words as written and as they'd expand (Shell bare), then each of
// its other readings likewise (Part plain: its program's own options
// off, a git alias put as git puts it), so a rule naming an option (git
// -c *, kubectl --context prod *) meets the first, one on what it does
// (git push *) the others. One read so saves its words as written
// through those naming what it does, its family measured on the words
// as they'd run (/usr/bin/git -C x status as git status: git -C x
// status *, never git -C * nor git *): approved, it runs again as it
// is, and a git -C x push still asks. Where a word up to there is blank
// or holds * or ? (git -C '*' status), each saves itself alone, one
// with a * or ? none, those being a rule's wildcards; so too a dry run
// as its words would expand (N=-n; make deploy $N; one its own options
// read off name: git -C x push -n), and one short of the words naming
// what it does (npm --prefix x run), with options to take off or not.
// Each one that saves itself alone is marked so (Piece odd)
function readings(p: Part): Piece[] {
  const [one, ...more] = p.plain;
  const named = one === undefined ? -1 : p.argv.indexOf(one[Math.max(0, Access.arity(named_words(one)).length - 1)]);
  const fam = named >= 0 ? named : Access.arity(named_words(p.argv)).length - 1;
  const what = named_words(one ?? p.argv);
  const short = Access.arity(what).length < Access.wanted(what);
  const odd = short || dry(dry_words(p.argv), p.env) || p.plain.some((r) => dry(dry_words(r), p.env)) || p.argv.slice(0, fam + 1).some((w) => (w.dynamic ? [w.raw] : w.alts).some((v) => v.trim() === "" || /[*?]/.test(v)));
  // a dry run by what it's given (MAKEFLAGS=n make deploy) saves nothing:
  // its text as matched leaves that out, and would stand for the real run
  const given = dry(dry_words(p.argv), p.env) && !dry(dry_words(p.argv)) && !p.plain.some((r) => dry(dry_words(r)));
  const exact = (text: string) => ({ save: given || /[*?]/.test(text) ? [] : [text], odd: true });
  const lead = p.full.indexOf(p.text);
  const through = p.argv.slice(0, named + 1);
  const save = (text: string, by: string[]) => (odd ? exact(text) : named < 0 ? {} : { save: by });
  return [
    { text: p.full, span: p.span, ...(p.full === p.text ? {} : lead < 0 ? save(p.full, []) : save(p.full, [p.full.slice(0, lead) + through.map((w) => w.raw).join(" ") + " *"])) },
    { text: p.text, span: p.span, ...save(p.text, [through.map((w) => w.raw).join(" ") + " *"]) },
    ...bare(p.argv).map((text) => ({ text, span: p.span, ...save(text, bare(through).map((b) => b + " *")) })),
    ...[one, ...more].filter((r) => r !== undefined).flatMap((r) => [r.map((w) => w.raw).join(" "), ...bare(r)]).map((text) => ({ text, span: p.span, ...(odd ? exact(text) : {}) })),
  ];
}

// whether a command (its words as the rules' families read them, and
// what it's given: env) may be a dry run, whose approval mustn't stand
// for the real one: --dry-run anywhere (git push, npm publish, kubectl
// apply, helm, rsync), or any start of it (--dr, --dry-run=x: as git and
// make take a long option); git's -n where it is one (GIT_DRY, among
// its words: git push -n, git remote prune -n; alone or among others,
// -nf); make's -n, -t, -q anywhere (it reads its options after the
// targets too; alone or among others, -kn, before an option taking a
// value), any start of its long ones (--just-print, --recon, --touch,
// --question: --re), or its flags given in any way (MAKEFLAGS, MFLAGS,
// GNUMAKEFLAGS: by the environment, as an argument); a word that is
// wholly made as it runs ($N, "$N", ${D:---dry-run}, $'-n'), which may
// be any of these. A guess that's too wide only saves a command alone
function dry(names: string[], env: Env[] = []): boolean {
  const make = names[0] === "make" || names[0] === "gmake";
  const git = names[0] === "git" && names.slice(1).some((w) => GIT_DRY.has(w));
  const long = (v: string, all: string[]) => {
    const m = /^--([^=]+)/.exec(v);
    return m !== null && all.some((o) => o.startsWith(m[1]));
  };
  return names.slice(1).some((v) => long(v, ["dry-run"]) || MADE.test(v) || (git && /^-[^-oe]*n/.test(v)) || (make && (long(v, MAKE_DRY) || /^-[^-CfIjloOW]*[ntq]/.test(v) || /^(?:MAKEFLAGS|MFLAGS|GNUMAKEFLAGS)=/.test(v)))) || (make && env.some((e) => /^(?:MAKEFLAGS|MFLAGS|GNUMAKEFLAGS)$/.test(e.name)));
}

// a command's words as the rules' families read them: its program by
// name (/usr/bin/git, 'git' as git), each word as it'd expand where it
// has one value (as written where it has several, or is known only as
// it runs)
function named_words(argv: Word[]): string[] {
  return argv.map((w, k) => (k === 0 && Shell.program(w) !== "" ? Shell.program(w) : !w.dynamic && w.alts.length === 1 ? w.alts[0] : w.raw));
}

// a command's words as a dry run is looked for in them (dry): its
// program by name, each value of a word of several (for o in -n -f; do
// git push $o), one known only as it runs as written
function dry_words(argv: Word[]): string[] {
  return argv.flatMap((w, k) => (k === 0 && Shell.program(w) !== "" ? [Shell.program(w)] : w.dynamic ? [w.raw] : w.alts));
}

// a command's words as they'd expand (unquoted, ~ and the variables
// known filled in; one known only as it runs as written), its program by
// name if a system one (/bin/rm as rm): so a rule on rm -rf /* meets
// 'rm' -rf "/" too. A word of several values (a brace's, a loop's
// variable's) gives a command for each (past BARE, its values in a row),
// so a rule on rm -rf /var/* meets for d in /tmp /var; do rm -rf $d; done.
// A variable's value bash splits into words is put so (Shell spread; its
// several known values too, Word split: for o in 'push -f' x; do git $o),
// and a blank one is no word at all: for o in '' x; do git $o push meets
// git push *. So too the first word: a command for each of its values
// (for o in ls rm; do $o -rf y: rm -rf y), a blank one leaving the next
// word the program (for o in '' x; do $o git push: git push), as may one
// wholly made as it runs (BLANK: sudo -u$U $O rm y meets rm *)
function bare(argv: Word[]): string[] {
  const [head, ...rest] = argv;
  if (head === undefined) {
    return [];
  }
  const program = Shell.program(head);
  const made = (w: Word) => w.dynamic && !Array.isArray(w.split);
  let out = program !== "" && program.trim() === program ? [program] : made(head) ? [head.raw, ...(BLANK.test(head.raw) ? [""] : [])] : Shell.spread(head).map((v) => v ?? "");
  const put = (o: string, v: string | null) => (v === null ? o : o + " " + v);
  for (const w of rest) {
    const values = made(w) ? [w.raw] : Shell.spread(w);
    out = out.length * values.length > BARE ? out.map((o) => put(o, values.filter((v) => v !== null).join(" "))) : out.flatMap((o) => values.map((v) => put(o, v)));
  }
  return [...new Set(out.map((o) => o.trim()))].filter((o) => o !== "");
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

// a path's real place: each link on its way followed, one whose target
// isn't there too (a write through it makes that file), as far as links
// go (a loop: where it stops); what isn't there yet, as written below
// the real folder holding it. Worked out once a shell check (REALS)
function real(p: string, hops = 0): string {
  if (p.length > PATH_MAX) {
    return p;
  }
  const known = hops === 0 ? REALS?.get(p) : undefined;
  if (known !== undefined) {
    return known;
  }
  const got = real_of(p, hops);
  if (hops === 0) {
    REALS?.set(p, got);
  }
  return got;
}

function real_of(p: string, hops: number): string {
  try {
    return fs.realpathSync(p);
  } catch {}
  const up = path.dirname(p);
  if (up === p) {
    return p;
  }
  const at = path.join(real(up, hops), path.basename(p));
  try {
    if (hops < 40 && fs.lstatSync(at).isSymbolicLink()) {
      return real(path.resolve(path.dirname(at), fs.readlinkSync(at)), hops + 1);
    }
  } catch {}
  return at;
}

// whether a path is inside: the working dir, or the project's top (not
// /), but never illi's own folder (mine)
function inside(where: Where, absolute: string): boolean {
  return !mine(absolute) && (under(absolute, where.cwd) || (where.top !== path.parse(where.top).root && under(absolute, where.top)));
}

// whether a path is in illi's own folder (its root, its profile's, as
// named and as they really are): outside every project, the home chat's
// too, where it is in the working dir, so its settings, hooks and
// permissions are asked about as from anywhere else
function mine(absolute: string): boolean {
  return [config.ROOT, config.DIR].some((d) => under(absolute, d) || under(absolute, really(d)));
}

// a folder's real path, worked out once (illi's own, asked at each path
// a call names)
const REAL = new Map<string, string>();

// the real places worked out in the shell check under way (Access.shell:
// the files don't change within it, and its paths share their folders);
// null: none under way
let REALS: Map<string, string> | null = null;
function really(dir: string): string {
  let got = REAL.get(dir);
  if (got === undefined) {
    REAL.set(dir, (got = real(dir)));
  }
  return got;
}

// the project a folder is in: the git repository holding it (but home
// or /), else the folder. Its folders past PATH_MAX long are passed over,
// as none the system opens can hold a .git
function project(folder: string): string {
  const home = os.homedir();
  const fits = folder.length <= PATH_MAX ? folder : folder.slice(0, Math.max(1, folder.lastIndexOf("/", PATH_MAX)));
  for (let dir = fits; dir !== path.dirname(dir) && dir !== home; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      return dir;
    }
  }
  return folder;
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
