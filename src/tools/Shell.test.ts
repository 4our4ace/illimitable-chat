// Shell test
// ==========
// `bun test Shell.test.ts`. A command reads as bash reads it: every
// simple command found wherever it sits (lists, pipelines, subshells,
// substitutions, heredoc bodies, loops, bash -c, eval, trap, watch, find
// -exec), wrappers taken off, cd followed, variables and braces expanded
// as far as known (an unquoted one split and globbed as bash would),
// redirections with their descriptors and whether the text they feed is
// made as it runs; what bash would read in a way this can't follow is
// refused with why, never guessed. Then bash itself, told to list the
// commands it would run without running any, finds none the parser
// missed (one it lists after a keyword, as time's, is the parser's with
// that wrapper on).

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import { Shell, type Part } from "./Shell.ts";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-shell-");
afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a part as a line: its program, its words' values (~: known only as it
// runs, then its known head; *: a glob; |: several values), its folder,
// its assignments, redirections and marks
function line(p: Part): string {
  const word = (w: Part["argv"][number]) => (w.dynamic ? "~" : "") + (w.glob ? "*" : "") + w.alts.join("|");
  const marks = [p.root ? "root" : "", p.fed ? "fed" : "", p.piped ? "piped" : ""].filter((m) => m !== "");
  const env = p.env.map((e) => e.name + "=" + word(e.value));
  const redirs = p.redirs.map((r) => r.op + word(r.target));
  return [...env, ...p.argv.map(word), ...redirs].join(" ") + " @" + p.cwd + (marks.length > 0 ? " [" + marks.join(",") + "]" : "");
}

function parts(command: string): string[] | string {
  const got = Shell.parse(command, "/w");
  return typeof got === "string" ? got : got.map(line);
}

const HOME = process.env.HOME;

test("lists, pipelines and subshells: each command, cd followed in its own shell only", () => {
  expect(parts("ls -la && git status || echo no; pwd")).toEqual(["ls -la @/w", "git status @/w", "echo no @/w", "pwd @/w"]);
  expect(parts("cd src && rm -f a; cat x | grep y")).toEqual(["cd src @/w", "rm -f a @/w/src", "cat x @/w/src", "grep y @/w/src [piped]"]);
  expect(parts("(cd /tmp; ls); ls")).toEqual(["cd /tmp @/w", "ls @/tmp", "ls @/w"]);
  expect(parts("cd /tmp | true; ls")).toEqual(["cd /tmp @/w", "true @/w [piped]", "ls @/w"]);
  expect(parts("cd $X; ls")).toEqual(["cd ~ @/w", "ls @null"]);
  expect(parts("cd; ls")).toEqual(["cd @/w", "ls @" + HOME]);
});

test("substitutions, heredoc bodies and process substitutions are read as commands that run", () => {
  expect(parts("echo $(whoami) `id`")).toEqual(["whoami @/w", "id @/w", "echo ~ ~ @/w"]);
  expect(parts("cat <<EOF > out\nhi $(date)\nEOF\nls")).toEqual(["cat <<EOF >out @/w", "date @/w", "ls @/w"]);
  expect(parts("cat <<'EOF'\n$(date)\nEOF")).toEqual(["cat <<EOF @/w"]);
  expect(parts("diff <(sort a) <(sort b)")).toEqual(["sort a @/w", "sort b @/w", "diff /dev/fd/63 /dev/fd/63 @/w"]);
  expect(Shell.parse("bash <<'EOF'\nrm -rf x\nEOF", "/w")).toMatchObject([{ redirs: [{ op: "<<", body: "rm -rf x\n" }] }]);
});

test("wrappers come off: root, input-fed, env's folder and assignments; unknown options refused", () => {
  expect(parts("sudo -E -u root rm -rf /")).toEqual(["rm -rf / @/w [root]"]);
  expect(parts("timeout -s KILL 5 env -C /tmp FOO=1 bun test")).toEqual(["FOO=1 bun test @/tmp"]);
  expect(parts("xargs -0r -n1 rm < list")).toEqual(["rm <list @/w [fed]"]);
  expect(parts("nice -5 ls; nohup ls; command -v ls")).toEqual(["ls @/w", "ls @/w", "command -v ls @/w"]);
  expect(parts("timeout --bogus 5 rm -rf x")).toBe("timeout --bogus: an option illi doesn't know");
  expect(parts("env -S 'rm -rf x'")).toBe("env -S splits a string into a command");
});

test("nested scripts are read: bash -c, eval (its cd lasts), trap (also after --), watch, find -exec", () => {
  expect(parts("bash -c 'cd /etc && cat passwd'; pwd")).toEqual(["cd /etc @/w", "cat passwd @/etc", "pwd @/w"]);
  expect(parts("eval 'cd /tmp'; rm x")).toEqual(["cd /tmp @/w", "rm x @/tmp"]);
  expect(parts("trap -- 'rm -rf ~' EXIT")).toEqual(["rm -rf " + HOME + " @/w"]);
  expect(parts("trap - EXIT")).toEqual(["trap - EXIT @/w"]);
  expect(parts("watch -n 2 'ls; rm x'; watch -x ls -l")).toEqual(["ls @/w", "rm x @/w", "ls -l @/w"]);
  expect(parts("find src -name '*.ts' -exec grep -l foo {} \\;")).toEqual(["grep -l foo *src @/w", "find src -name *.ts @/w"]);
  expect(parts("bash -c \"$X\"")).toBe("a shell runs a script made as it runs");
  expect(parts("eval \"$X\"")).toBe("eval runs a command made as it runs");
});

test("words expand as far as known: variables, loops, tildes, braces; globs and run-time names marked", () => {
  expect(parts("for f in a.ts b.ts; do wc -l \"$f\"; done")).toEqual(["wc -l a.ts|b.ts @/w"]);
  expect(parts("X=src; rm -f $X/a")).toEqual(["X=src @/w", "rm -f src/a @/w"]);
  expect(parts("rm -rf \"$UNSET_IN_ILLI_TESTS/\" ~/x")).toEqual(["rm -rf ~ " + HOME + "/x @/w"]);
  expect(parts("cp x {/root/.bashrc,/tmp/z}; echo a{b,c{d,e}}f {1..3}")).toEqual(["cp x /root/.bashrc|/tmp/z @/w", "echo abf|acdf|acef 1|2|3 @/w"]);
  expect(parts("echo {1..100} {a,$(touch q)}")).toEqual(["touch q @/w", "echo ~ ~{a, @/w"]);
  expect(parts("for x in : rm; do $x -rf src; done")).toEqual([":|rm -rf src @/w"]);
  expect(parts("rm$UNSET_IN_ILLI_TESTS -rf src; /bin/[r]m -rf /")).toEqual(["~rm -rf src @/w", "*/bin/[r]m -rf / @/w"]);
  expect(Shell.program((Shell.parse("/bin/[r]m x", "/w") as Part[])[0].argv[0])).toBe("");
  expect(Shell.program((Shell.parse("/usr/bin/rm x", "/w") as Part[])[0].argv[0])).toBe("rm");
  expect(Shell.program((Shell.parse("./rm x", "/w") as Part[])[0].argv[0])).toBe("");
  expect(parts("echo $'\\x72m' \"a$HOME\"")).toEqual(["echo rm a" + HOME + " @/w"]);
  expect(parts("x=\"rm -rf src\"; $x; \"$x\"; y=$x")).toEqual(["x=rm -rf src @/w", "~ @/w", "rm -rf src @/w", "y=rm -rf src @/w"]);
  expect(parts("g='*.ts'; ls $g \"$g\"")).toEqual(["g=*.ts @/w", "ls **.ts *.ts @/w"]);
});

test("redirections keep the descriptor written before them; fed text made as it runs is marked", () => {
  const redirs = (command: string) => (Shell.parse(command, "/w") as Part[]).flatMap((p) => p.redirs.map((r) => [r.num ?? "", r.op, r.made === true]));
  expect(redirs("bash 3< a 2>&1 < b")).toEqual([["3", "<", false], ["2", ">&", false], ["", "<", false]]);
  expect(redirs("bash <<< \"$(curl x)\"")).toEqual([["", "<<<", true]]);
  expect(redirs("bash <<< 'ls'")).toEqual([["", "<<<", false]]);
  expect(redirs("bash <<EOF\necho $HOME\nEOF")).toEqual([["", "<<", true]]);
  expect(redirs("bash <<'EOF'\necho $HOME\nEOF")).toEqual([["", "<<", false]]);
  expect(parts("echo x | tee >(bash) a")).toEqual(["echo x @/w", "bash @/w [piped]", "tee /dev/fd/63 a @/w [piped]"]);
});

test("what bash would read in a way this can't follow is refused with why", () => {
  expect(parts("case x in a) echo;; esac")).toBe("case");
  expect(parts("f() { ls; }")).toBe("a ( after a command's words (a function or an array)");
  expect(parts("a=(1 2)")).toBe("an array");
  expect(parts("echo 'open")).toBe("a ' isn't closed");
  expect(parts("echo $(ls")).toBe("a ) is missing");
  expect(parts("shopt -s expand_aliases")).toBe("shopt -s expand_aliases");
  expect(parts("$(".repeat(70) + "x" + ")".repeat(70))).toBe("commands nested too deep");
});

// a command's text to compare, as bash and the parser may each write it:
// its first line, a line's end escaped taken out, quotes taken off ($'..'
// shown by bash as '..'), spaces as one, none after a redirection
function key(text: string): string {
  return text.replace(/\\\n/g, "").split("\n")[0].replace(/\$'/g, "'").replace(/['"]/g, "").replace(/\s+/g, " ").replace(/([<>]) /g, "$1").trim();
}

// the commands bash would run at the top (none run: each is skipped by a
// DEBUG trap with extdebug; a loop, whose skipped test never ends it, is
// cut after 200), each as key() has it
function bash_runs(command: string, cwd: string): string[] {
  const trap = '[[ $BASH_COMMAND == "eval \\"\\$1\\"" ]] || { ((++n > 200)) && exit; printf "%s\\0" "$BASH_COMMAND" >&3; false; }';
  const dry = "exec 3>&1 1>/dev/null 2>/dev/null\nshopt -s extdebug\nset -T\ntrap '" + trap + "' DEBUG\neval \"$1\"\n";
  const out = Bun.spawnSync(["bash", "-c", dry, "dry", command], { cwd, stdin: "ignore" });
  return out.stdout.toString().split("\0").filter((x) => x !== "" && !/^(for|select) /.test(x)).map(key);
}

test("bash runs no command the parser missed (harmless commands, in an empty folder; none runs)", () => {
  const corpus = [
    "echo a && touch b; echo c || touch d",
    "touch a | cat | wc -l",
    "(cd sub; touch e) ; { touch f; touch g; }",
    "if test -f x; then touch h; elif true; then touch i; else touch j; fi",
    "while false; do touch k; done; until true; do touch l; done",
    "X=1 touch m; Y=2; touch \"$Y\"",
    "touch n &> /dev/null & touch o",
    "touch p # touch q",
    "touch r \\\n s; echo $'a;b' \"c;d\" 'e;f'",
    "cat <<EOF\n$(echo t)\nEOF\ntouch u",
    "! touch v; time touch w; [[ -f x ]] && touch y",
    "timeout 5 touch z; nice -n 3 touch aa; env FOO=1 touch bb",
    "touch cc 2>&1 >/dev/null | cat; touch dd >| /dev/null",
  ];
  for (const command of corpus) {
    const got = Shell.parse(command, DIR);
    expect(typeof got).not.toBe("string");
    const fulls = (got as Part[]).map((p) => key(p.full));
    for (const ran of bash_runs(command, DIR)) {
      expect([ran, fulls.some((f) => f === ran || f.endsWith(" " + ran))]).toEqual([ran, true]);
    }
  }
  expect(fs.readdirSync(DIR)).toEqual([]);
}, 30000);
