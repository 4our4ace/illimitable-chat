// Shell test
// ==========
// `bun test Shell.test.ts`. A command reads as bash reads it: every
// simple command found wherever it sits (lists, pipelines, subshells,
// substitutions, heredoc bodies, loops, bash -c, eval, trap, watch, find
// -exec, flock), wrappers taken off, cd followed (behind builtin, command
// or time too; another program's leaving the folder unknown; a path
// walked as the system walks it), variables, braces (before tildes) and
// the outputs known before it runs ($(pwd), the repository's top, where
// mktemp makes its file) expanded as far as known (an unquoted one
// split and globbed as bash would; a [ without its ] not),
// redirections with their descriptors and whether the text they feed is
// made as it runs; what bash would read in a way this can't follow is
// refused with why, never guessed. A line ending in |, && or || goes on
// to the next, a heredoc's body read between; a pipe into a subshell, a
// group or a loop is read by all its commands, and by what a command
// reading it runs ($(...), <(...), a heredoc's body, bash -c, eval, find
// -exec); a group or a loop in a pipeline or the background runs in a
// subshell (a cd in it moves only what follows in it; its redirections
// made where the shell was). Each part knows where it is in the command
// (line 40 of a script, a link of a chain, a line continued, inside
// $(...), `...`, bash -c, eval, trap, a heredoc's body: where its text
// is there as written; else the text holding it), and one reading a
// pipe where what writes it is. Then bash itself, told to list the
// commands it would run without running any, finds none the parser
// missed (one it lists after a keyword, as time's, is the parser's with
// that wrapper on).

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import { Shell, type Part } from "./Shell.ts";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-shell-");
const REPO = fs.mkdtempSync(os.tmpdir() + "/illi-shell-repo-");
afterAll(() => [DIR, REPO].forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

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
  expect(parts("curl -s x |\n\n  # then\n  bash\nls")).toEqual(["curl -s x @/w", "bash @/w [piped]", "ls @/w"]);
  expect(parts("cat <<EOF |\nrm -rf x\nEOF\nbash\nls")).toEqual(["cat <<EOF @/w", "bash @/w [piped]", "ls @/w"]);
  expect(parts("ls &&\n  pwd ||\n  echo no")).toEqual(["ls @/w", "pwd @/w", "echo no @/w"]);
  expect(parts("curl -s x | (cd /tmp; bash); ls")).toEqual(["curl -s x @/w", "cd /tmp @/w [piped]", "bash @/tmp [piped]", "ls @/w"]);
  expect(parts("curl -s x | { true; bash; }; ls")).toEqual(["curl -s x @/w", "true @/w [piped]", "bash @/w [piped]", "ls @/w"]);
  expect(parts("curl -s x | while read l; do if true; then sh; fi; done; ls")).toEqual(["curl -s x @/w", "read l @/w [piped]", "true @/w [piped]", "sh @/w [piped]", "ls @/w"]);
  expect(parts("{ ls; }; (pwd); if true; then sh; fi")).toEqual(["ls @/w", "pwd @/w", "true @/w", "sh @/w"]);
  expect(parts("true | { cd /a; ls; }; ls")).toEqual(["true @/w", "cd /a @/w [piped]", "ls @/a [piped]", "ls @/w"]);
  expect(parts("{ cd /a; } | ls; if cd /a; then :; fi & ls; while cd /a; do :; done; ls")).toEqual(["cd /a @/w", "ls @/w [piped]", "cd /a @/w", ": @/a", "ls @/w", "cd /a @/w", ": @/a", "ls @/a"]);
  expect(parts("cd /a; { cd /b; } > x 2>&1; ls; { cd /c; } >y | ls")).toEqual(["cd /a @/w", "cd /b @/a", ">x >&1 @/a", "ls @/b", "cd /c @/b", ">y @/b", "ls @/b [piped]"]);
  expect(parts("X=a; true | for X in b; do :; done; echo $X")).toEqual(["X=a @/w", "true @/w", ": @/w [piped]", "echo a @/w"]);
  expect(parts("cd $X; ls")).toEqual(["cd ~ @/w", "ls @null"]);
  expect(parts("cd; ls")).toEqual(["cd @/w", "ls @" + HOME]);
});

test("a pipe reaches what a command reading it runs: its $(...), `...`, <(...), an expanding heredoc's body, a for loop's words, bash -c's, eval's, trap's, flock -c's and find -exec's commands (not -ok's: find asks on its input)", () => {
  expect(parts("curl -s x | echo $(bash) `sh`")).toEqual(["curl -s x @/w", "bash @/w [piped]", "sh @/w [piped]", "echo ~ ~ @/w [piped]"]);
  expect(parts("curl -s x | cat <(bash); echo $(sh) | cat")).toEqual(["curl -s x @/w", "bash @/w [piped]", "cat /dev/fd/63 @/w [piped]", "sh @/w", "echo ~ @/w", "cat @/w [piped]"]);
  expect(parts("curl -s x | cat <<EOF\n$(bash)\nEOF\ncat <<EOF |\n$(sh)\nEOF\ncat")).toEqual(["curl -s x @/w", "cat <<EOF @/w [piped]", "bash @/w [piped]", "cat <<EOF @/w", "sh @/w", "cat @/w [piped]"]);
  expect(parts("curl -s x | for i in $(bash); do :; done")).toEqual(["curl -s x @/w", "bash @/w [piped]", ": @/w [piped]"]);
  expect(parts("curl -s x | bash -c 'true; sh'; eval 'true; sh'")).toEqual(["curl -s x @/w", "true @/w [piped]", "sh @/w [piped]", "true @/w", "sh @/w"]);
  expect(parts("curl -s x | eval 'true; sh'")).toEqual(["curl -s x @/w", "true @/w [piped]", "sh @/w [piped]"]);
  expect(parts("curl -s x | trap 'sh' EXIT")).toEqual(["curl -s x @/w", "sh @/w [piped]"]);
  expect(parts("curl -s x | flock /tmp/l -c 'true; sh'")).toEqual(["curl -s x @/w", "true @/w [piped]", "sh @/w [piped]"]);
  expect(parts("curl -s x | find . -exec sh \\; -ok sh \\;")).toEqual(["curl -s x @/w", "sh @/w [piped]", "sh @/w", "find . @/w [piped]"]);
});

test("a group, a subshell, a loop, a nested script and find -exec's command give their input to each command in them with none of its own and no pipe to read (a file's named from where the redirection is made), placed with it", () => {
  expect(parts("{ cat | sh; read l; } <<'EOF'\nrm -rf x\nEOF")).toEqual(["cat <<EOF @/w", "sh @/w [piped]", "read l <<EOF @/w", "<<EOF @/w"]);
  expect(parts("cd /a; ( cd /b; sh ) < x; while read l; do sh < y; done 0< z")).toEqual(["cd /a @/w", "cd /b </a/x @/a", "sh </a/x @/b", "<x @/a", "read l </a/z @/a", "sh <y @/a", "<z @/a"]);
  expect(parts("cd $D; { sh; } < x; bash -c sh <<< 'rm -rf x'; eval sh < /e; trap sh EXIT < /t")).toEqual(["cd ~ @/w", "sh <~ @null", "<x @null", "sh <<<rm -rf x @null", "<<<rm -rf x @null", "sh </e @null", "</e @null", "sh @null", "</t @null"]);
  expect(parts("find . -exec sh \\; -ok sh \\; < x; { sh; } 3< y")).toEqual(["sh </w/x @/w", "sh @/w", "find . <x @/w", "sh @/w", "<y @/w"]);
  const command = "{\nsh\necho 1\n} < /tmp/x\nls";
  const [sh] = Shell.parse(command, "/w") as Part[];
  expect(command.slice(...Shell.held(sh))).toBe("sh\necho 1\n} < /tmp/x");
});

test("substitutions, heredoc bodies and process substitutions are read as commands that run", () => {
  expect(parts("echo $(whoami) `id`")).toEqual(["whoami @/w", "id @/w", "echo ~ ~ @/w"]);
  expect(parts("cat <<EOF > out\nhi $(date)\nEOF\nls")).toEqual(["cat <<EOF >out @/w", "date @/w", "ls @/w"]);
  expect(parts("cat <<'EOF'\n$(date)\nEOF")).toEqual(["cat <<EOF @/w"]);
  expect(parts("diff <(sort a) <(sort b)")).toEqual(["sort a @/w", "sort b @/w", "diff /dev/fd/63 /dev/fd/63 @/w"]);
  expect(Shell.parse("bash <<'EOF'\nrm -rf x\nEOF", "/w")).toMatchObject([{ redirs: [{ op: "<<", body: "rm -rf x\n" }] }]);
});

test("wrappers come off: root, input-fed (what xargs adds known only as it runs), env's folder and assignments; unknown options refused", () => {
  expect(parts("sudo -E -u root rm -rf /")).toEqual(["rm -rf / @/w [root]"]);
  expect(parts("timeout -s KILL 5 env -C /tmp FOO=1 bun test")).toEqual(["FOO=1 bun test @/tmp"]);
  expect(parts("xargs -0r -n1 rm < list")).toEqual(["rm ~ <list @/w [fed]"]);
  expect(parts("xargs -I{} cp {} /tmp/{}.bak; xargs -i mv {} x")).toEqual(["cp ~ ~ @/w [fed]", "mv ~ x @/w [fed]"]);
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

// each part's span as the text of the command it covers
const spans = (command: string) => (Shell.parse(command, "/w") as Part[]).map((p) => [p.text, command.slice(...p.span)]);

test("each part knows where it is in the command: line 40 of a script, a link of a && chain, a line continued, inside $(...) and `...`", () => {
  const script = Array.from({ length: 39 }, (_, k) => "echo step " + (k + 1)).join("\n") + "\nrm -rf ./old\necho done";
  const got = Shell.parse(script, "/w") as Part[];
  expect([got[39].text, script.slice(...got[39].span), script.slice(0, got[39].span[0]).split("\n").length]).toEqual(["rm -rf ./old", "rm -rf ./old", 40]);
  expect(spans("ls -la && rm -rf x || echo no; pwd")).toEqual([["ls -la", "ls -la"], ["rm -rf x", "rm -rf x"], ["echo no", "echo no"], ["pwd", "pwd"]]);
  expect(spans("FOO=1 sudo rm \\\n  -rf /x 2>/dev/null && ls")).toEqual([["rm -rf /x", "FOO=1 sudo rm \\\n  -rf /x 2>/dev/null"], ["ls", "ls"]]);
  expect(spans("echo $(rm -rf x) `rm -f y`")).toEqual([["rm -rf x", "rm -rf x"], ["rm -f y", "rm -f y"], ["echo $(rm -rf x) `rm -f y`", "echo $(rm -rf x) `rm -f y`"]]);
  expect(spans("echo `echo \\`date\\``")).toEqual([["date", "`echo \\`date\\``"], ["echo `date`", "`echo \\`date\\``"], ["echo `echo \\`date\\``", "echo `echo \\`date\\``"]]);
});

test("a nested script's parts are placed in the command itself where its text is there as written (bash -c, eval, trap, a heredoc's body), else at the text holding them", () => {
  expect(spans("bash -c 'cd /a && rm -rf x'; pwd")).toEqual([["cd /a", "cd /a"], ["rm -rf x", "rm -rf x"], ["pwd", "pwd"]]);
  expect(spans("sudo bash -lc \"ls; rm -rf x\"")).toEqual([["ls", "ls"], ["rm -rf x", "rm -rf x"]]);
  expect(spans("eval 'rm -rf x'; trap 'rm -f y' EXIT; eval rm -f z")).toEqual([["rm -rf x", "rm -rf x"], ["rm -f y", "rm -f y"], ["rm -f z", "rm -f z"]]);
  expect(spans("bash -c \"echo \\\"hi\\\"; rm -rf x\"")).toEqual([["echo \"hi\"", "\"echo \\\"hi\\\"; rm -rf x\""], ["rm -rf x", "\"echo \\\"hi\\\"; rm -rf x\""]]);
  expect(spans("bash -c \"bash -c 'rm -rf x'\"")).toEqual([["rm -rf x", "rm -rf x"]]);
  expect(spans("cat <<EOF > out\nline\nhi $(rm -rf x)\nEOF\nls")).toEqual([["cat", "cat <<EOF > out"], ["rm -rf x", "rm -rf x"], ["ls", "ls"]]);
  const doc = "bash <<'EOF'\necho one\nrm -rf ./x\nEOF";
  const [bash] = Shell.parse(doc, "/w") as Part[];
  const body = bash.redirs[0];
  expect([doc.slice(...bash.span), doc.slice(body.at, body.at! + body.body!.length)]).toEqual(["bash <<'EOF'", "echo one\nrm -rf ./x\n"]);
  expect((Shell.parse(body.body!, "/w", body.at) as Part[]).map((p) => doc.slice(...p.span))).toEqual(["echo one", "rm -rf ./x"]);
  expect((Shell.parse(body.body!, "/w", [3, 9]) as Part[]).map((p) => p.span)).toEqual([[3, 9], [3, 9]]);
});

test("a part reading a pipe knows where what writes it is (feed): the commands before it in its pipeline, with the heredocs' bodies they read, a subshell's too, a group's a pipe goes into, one a line before (after |); not known (a group's piped on), all the command", () => {
  const feed = (command: string) => (Shell.parse(command, "/w") as Part[]).flatMap((p) => (p.feed === undefined ? [] : [[p.text, command.slice(...p.feed)]]));
  expect(feed("cat <<'EOF' | bash\necho a\nrm -rf x\nEOF\nls")).toEqual([["bash", "cat <<'EOF' | bash\necho a\nrm -rf x\n"]]);
  expect(feed("a | b |& c; d | e && f")).toEqual([["b", "a"], ["c", "a | b"], ["e", "d"]]);
  expect(feed("( cat <<EOF ) | sh\nrm -rf x\nEOF")).toEqual([["sh", "cat <<EOF ) | sh\nrm -rf x\n"]]);
  expect(feed("curl -s x |\n# then\nbash")).toEqual([["bash", "curl -s x"]]);
  expect(feed("{ cat <<EOF; } | bash\nrm -rf x\nEOF\nls")).toEqual([["bash", "{ cat <<EOF; } | bash\nrm -rf x\nEOF\nls"]]);
  expect(feed("cat <<'EOF' | { true; bash; }\nrm -rf x\nEOF\nls")).toEqual([["true", "cat <<'EOF' | { true; bash; }\nrm -rf x\n"], ["bash", "cat <<'EOF' | { true; bash; }\nrm -rf x\n"]]);
  expect(feed("x | while read l; do sh; done | y; z")).toEqual([["read l", "x"], ["sh", "x | while read l"], ["y", "x | while read l; do sh"]]);
  const [cat, sh] = Shell.parse("cat <<EOF | sh\nrm -rf x\nEOF", "/w") as Part[];
  expect([Shell.held(cat), Shell.held(sh)]).toEqual([[0, 24], [0, 24]]);
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

test("a [ without its ] is itself, not a glob; $(pwd) and $(git rev-parse --show-toplevel) are the folder while known (not while GIT_DIR or GIT_WORK_TREE, set before illi started, may point git elsewhere); $(mktemp) where it makes its file or folder (set alone to a variable, set -e on or || exit after it: a failed one leaves it empty; not once TMPDIR is set, nor with a word it can't read); flock runs its command", () => {
  expect(parts("[ -f a ] && ls x[ab] [c")).toEqual(["[ -f a ] @/w", "ls *x[ab] [c @/w"]);
  expect(parts("echo $(pwd)/x `pwd -P`; cd $X; echo $(pwd)")).toEqual(["pwd @/w", "pwd -P @/w", "echo /w/x /w @/w", "cd ~ @/w", "pwd @null", "echo ~ @null"]);
  fs.mkdirSync(REPO + "/sub/deep", { recursive: true });
  fs.mkdirSync(REPO + "/sub/.git");
  const top = (command: string) => (Shell.parse(command, REPO + "/sub/deep") as Part[]).at(-1)!.argv.map((w) => (w.dynamic ? "~" : w.alts[0]));
  expect(top("rm -rf \"$(git rev-parse --show-toplevel)/dist\"")).toEqual(["rm", "-rf", REPO + "/sub/dist"]);
  expect(top("PATH=/x; rm -rf \"$(git rev-parse --show-toplevel)/dist\"")).toEqual(["rm", "-rf", "~"]);
  for (const name of ["GIT_DIR", "GIT_WORK_TREE"]) {
    process.env[name] = REPO + "/elsewhere";
    try {
      expect(top("rm -rf \"$(git rev-parse --show-toplevel)/dist\"")).toEqual(["rm", "-rf", "~"]);
    } finally {
      delete process.env[name];
    }
  }
  expect(top("source env.sh; echo $(pwd)")).toEqual(["echo", "~"]);
  // mktemp's file or folder: where it lands, its X's kept
  const tmp = process.env.TMPDIR || "/tmp";
  const made = (...ms: string[]) => ms.map((m) => top("set -e; d=" + m + "; touch \"$d\"")[1]);
  expect(top("set -e\nd=$(mktemp -d /tmp/x.XXXXXX)\ngit clone u \"$d/repo\"")).toEqual(["git", "clone", "u", "/tmp/x.XXXXXX/repo"]);
  expect(made("$(mktemp)", "$(mktemp -d -t job.XXX)", "`mktemp -p /var/tmp --suffix=.log`", "$(mktemp -d /tmp/x.XXX)/y")).toEqual([tmp + "/tmp.XXXXXXXXXX", tmp + "/job.XXX", "/var/tmp/tmp.XXXXXXXXXX.log", "/tmp/x.XXX/y"]);
  expect(made("$(mktemp --tmpdir=/var/tmp a.XXX)", "$(mktemp -dq b.XXX)", "$(mktemp ../c.XXX)")).toEqual(["/var/tmp/a.XXX", REPO + "/sub/deep/b.XXX", REPO + "/sub/c.XXX"]);
  expect(made("$(mktemp -p \"$HOME\")", "$(mktemp -t a/b)", "$(mktemp --weird)", "$(mktemp -d -t job)", "$(mktemp /nowhere-illi/x.XXX)", "$(mktemp -t x.XXX -p /tmp)")).toEqual(["~", "~", "~", "~", "~", "~"]);
  expect(top("set -e; TMPDIR=/etc; d=$(mktemp); touch \"$d\"")).toEqual(["touch", "~"]);
  expect(parts("flock -n /tmp/l rm x; flock -w 5 /tmp/l -c 'cd /tmp && ls'")).toEqual(["rm x @/w", "cd /tmp @/w", "ls @/tmp"]);
  expect(parts("flock --bogus /tmp/l rm x")).toBe("flock --bogus: an option illi doesn't know");
});

test("a variable mktemp's output is set to stands for where it makes it only where its failure ends the script: set alone, by the command's own commands (not in a subshell, a group, an if, a pipeline, the background, nor negated or in && or ||), set -e on where it holds (or || exit after it, with a number or $? at most); its output used in place, never; a trap on any signal but EXIT refused", () => {
  const d = (script: string) => parts(script + "; touch \"$d\"") as string[];
  const at = (script: string) => d(script).at(-1);
  const known = "touch /tmp/x.XXX @/w";
  const unknown = "touch ~ @/w";
  expect(at("d=$(mktemp -d /tmp/x.XXX)")).toBe(unknown);
  expect(at("d=$(mktemp -d /tmp/x.XXX) || exit 1")).toBe(known);
  for (const exits of ["|| exit", "|| exit 1", "|| exit 255", "|| exit $?", "|| exit \"$?\"", "||\n  exit"]) {
    expect([exits, at("d=$(mktemp -d /tmp/x.XXX) " + exits)]).toEqual([exits, known]);
  }
  for (const on of ["set -e", "set -euo pipefail", "set -o errexit", "set -xe", "set -o pipefail -e"]) {
    expect([on, at(on + "; d=$(mktemp -d /tmp/x.XXX)")]).toEqual([on, known]);
  }
  for (const odd of [
    "set -e; set +e; d=$(mktemp -d /tmp/x.XXX)",
    "set -e; set +o errexit; d=$(mktemp -d /tmp/x.XXX)",
    "set -e; set $X; d=$(mktemp -d /tmp/x.XXX)",
    "set -e; eval 'set +e'; d=$(mktemp -d /tmp/x.XXX)",
    "set -e; shopt -uo errexit; d=$(mktemp -d /tmp/x.XXX)",
    "set -e; shopt -u -o errexit; d=$(mktemp -d /tmp/x.XXX)",
    "set -e | true; d=$(mktemp -d /tmp/x.XXX)",
    "true && set -e; d=$(mktemp -d /tmp/x.XXX)",
    "if true; then set -e; fi; d=$(mktemp -d /tmp/x.XXX)",
    "(set -e; d=$(mktemp -d /tmp/x.XXX); touch \"$d\")",
    "set -- -e; d=$(mktemp -d /tmp/x.XXX)",
    "set -e; d=$(mktemp -d /tmp/x.XXX) && true",
    "set -e; true && d=$(mktemp -d /tmp/x.XXX)",
    "set -e; ! d=$(mktemp -d /tmp/x.XXX)",
    "set -e; if true; then d=$(mktemp -d /tmp/x.XXX); fi",
    "set -e; { d=$(mktemp -d /tmp/x.XXX); }",
    "set -e; d=$(mktemp -d /tmp/x.XXX) &",
    "set -e; d=$(mktemp -d /tmp/x.XXX) | true",
    "set -e; d=$(mktemp -d /tmp/x.XXX)$(true)",
    "set -e; d=$(mktemp -d /tmp/x.XXX) e=1",
    "set -e; d=$(mktemp -d /tmp/x.XXX) 2>/dev/null",
    "set -e; export d=$(mktemp -d /tmp/x.XXX)",
    "d=$(mktemp -d /tmp/x.XXX) || return",
    "d=$(mktemp -d /tmp/x.XXX) || exit | true",
    "d=$(mktemp -d /tmp/x.XXX) || exit &",
    "d=$(mktemp -d /tmp/x.XXX) || echo exit",
    "d=$(mktemp -d /tmp/x.XXX) || exit abc",
    "d=$(mktemp -d /tmp/x.XXX) || exit 1x",
    "d=$(mktemp -d /tmp/x.XXX) || exit $E",
    "d=$(mktemp -d /tmp/x.XXX) || exit 99999999999999999999",
    "d=$(mktemp -d -p /tmp\nX=a.XXX) || exit",
    "set -e; d=$(mktemp -d /tmp/x.XXX\ntrue)",
    "cat <<EOF; d=$(mktemp -d /tmp/x.XXX) ||\nexit\nEOF\necho hi",
    "set -e 2>no/dir/x; d=$(mktemp -d /tmp/x.XXX)",
    "set -e <missing; d=$(mktemp -d /tmp/x.XXX)",
    "set -eZ; d=$(mktemp -d /tmp/x.XXX)",
    "set -e -Z; d=$(mktemp -d /tmp/x.XXX)",
    "set -o bogus -o errexit; d=$(mktemp -d /tmp/x.XXX)",
    "set -e; d=/tmp/a; d= :",
    "bash -c 'set -e; d=$(mktemp -d /tmp/x.XXX); touch \"$d\"'",
  ]) {
    expect([odd, at(odd)]).toEqual([odd, unknown]);
  }
  expect(parts("set -e; touch \"$(mktemp -d /tmp/x.XXX)\" `mktemp`")).toEqual(["set -e @/w", "mktemp -d /tmp/x.XXX @/w", "mktemp @/w", "touch ~ ~ @/w"]);
  expect(parts("enable -n exit; d=$(mktemp -d /tmp/x.XXX) || exit")).toBe("enable -n exit");
  // a trap's action on any signal but EXIT may run before any command after it, in this shell: refused
  for (const trap of [
    "set -e; trap 'set +e' DEBUG; d=$(mktemp -d /tmp/x.XXX)",
    "trap 'set +e' DEBUG; set -e; d=$(mktemp -d /tmp/x.XXX)",
    "set -e; trap 's\"e\"t +e' DEBUG; d=$(mktemp -d /tmp/x.XXX)",
    "set -e; trap 'd=' DEBUG; d=$(mktemp -d /tmp/x.XXX)",
    "trap 'cd /' DEBUG; rm -rf home",
    "trap 'echo stopped' INT TERM",
    "trap 'echo bye' EXIT USR1",
    "trap 'echo x' $SIG",
  ]) {
    expect([trap, String(parts(trap)).startsWith("a trap on ")]).toEqual([trap, true]);
  }
  for (const trap of ["X=$(printf 'cd /'); trap \"$X\" DEBUG; rm -rf home", "trap \"$UNSET\" DEBUG; rm -rf home", "trap $X EXIT"]) {
    expect([trap, parts(trap)]).toEqual([trap, "trap runs a command made as it runs"]);
  }
  expect(String(parts("trap -- -:'||cd /' DEBUG; rm -rf home"))).toStartWith("a trap on DEBUG");
  expect(parts("trap 'echo bye' exit; trap 'echo bye' SIGEXIT 0")).toEqual(["echo bye @/w", "echo bye @/w"]);
  expect(parts("trap - DEBUG; trap '' INT; trap -p; trap -l")).toEqual(["trap - DEBUG @/w", "trap  INT @/w", "trap -p @/w", "trap -l @/w"]);
  // variables bash keeps its own way are never known, set or not
  for (const own of ["FUNCNAME", "_", "BASH_SOURCE", "DIRSTACK", "RANDOM", "LINENO", "REPLY"]) {
    expect([own, at(own + "=$(mktemp -d /tmp/x.XXX) || exit; d=$" + own)]).toEqual([own, unknown]);
  }
  // what turns aliases on, and aliases themselves, refused: an alias may stand for exit or set
  expect([parts("set -o posix"), parts("alias exit=:"), parts("alias ll='ls -l'")]).toEqual([
    "set -o posix (bash then expands aliases and keeps a builtin's assignments)",
    "alias (a name standing for other commands, which sh and POSIX mode expand)",
    "alias (a name standing for other commands, which sh and POSIX mode expand)",
  ]);
  expect(parts("alias; set -o; set +o posix")).toEqual(["alias @/w", "set -o @/w", "set +o posix @/w"]);
  // a cd CDPATH may lead elsewhere leaves the folder unknown; one by a path, as written
  expect(parts("CDPATH=/; cd home; ls; cd ./src; ls; cd /tmp; cd lib; ls")).toEqual(["CDPATH=/ @/w", "cd home @/w", "ls @null", "cd ./src @null", "ls @null", "cd /tmp @null", "cd lib @/tmp", "ls @null"]);
  // run where a set -e may not hold (Claude Code's Bash, in its own wrapper): only || exit trusted
  const wrapped = (script: string) => (Shell.parse(script + "; touch \"$d\"", "/w", 0, false) as Part[]).map(line).at(-1);
  expect([wrapped("set -e; d=$(mktemp -d /tmp/x.XXX)"), wrapped("d=$(mktemp -d /tmp/x.XXX) || exit 1")]).toEqual([unknown, known]);
});

test("variables as each command has them: a heredoc's body expands as its command's shell, a ${x=...} sets x, a shell of its own has the variables set or given it known only as it runs", () => {
  expect(parts("d=/a; cat <<EOF; d=/b\n$(ls $d)\nEOF")).toEqual(["d=/a @/w", "cat <<EOF @/w", "d=/b @/w", "ls /a @/w"]);
  expect((parts("d=; : ${d:=/etc}; ls \"$d\"; d=/a; : ${d=/b}; ls $d") as string[]).filter((l) => l.startsWith("ls"))).toEqual(["ls ~ @/w", "ls ~ @/w"]);
  expect((parts("HOME=/etc; bash -c 'ls $HOME'; d=/a bash -c 'ls $d'; d=/a eval 'ls $d'") as string[]).filter((l) => l.startsWith("ls"))).toEqual(["ls ~ @/w", "ls ~ @/w", "ls ~ @/w"]);
  expect(parts("x=1; bash -c 'y=2; ls $y'").at(-1)).toBe("ls 2 @/w");
});

test("what may set a variable unseen leaves it known only as it runs, or is refused: an assigning ${...} anywhere (nested, indirect, in an arithmetic), IFS set (bash splits where illi wouldn't), a source; names read from their words' values (read \"d\", declare \"d=\", printf -vd); a heredoc's body that sets one, time before an assignment and a nameref refused", () => {
  const last = (script: string) => (parts(script) as string[]).at(-1);
  for (const unseen of [
    "x=/a; (( ${x:=/} )); touch \"${x}home/x\"",
    "x=/a; : $(( ${x:=/} )); touch \"${x}home/x\"",
    "x=/a; : ${a:-${x:=/}}; touch \"${x}home/x\"",
    "ref=x; x=/a; : ${!ref:=/}; touch \"${x}home/x\"",
    "x=/a; source ./env.sh; touch \"${x}home/x\"",
    "x=/a; . ./a.txt; touch \"${x}home/x\"",
    "x=/a; read \"x\" <<<''; touch \"${x}home/x\"",
    "x=/a; read -r $N <<<''; touch \"${x}home/x\"",
    "x=/a; printf -vx ''; touch \"${x}home/x\"",
    "x=/a; printf -v x ''; touch \"${x}home/x\"",
    "x=/a; declare \"$N=/\"; touch \"${x}home/x\"",
    "x=/a; unset $N; touch \"${x}home/x\"",
  ]) {
    expect([unseen, last(unseen)]).toEqual([unseen, "touch ~ @/w"]);
  }
  expect(last("x=/a; declare \"x=/b\"; touch \"${x}/y\"")).toBe("touch /b/y @/w");
  expect(last("x=/a; export x=/c; touch \"${x}/y\"")).toBe("touch /c/y @/w");
  expect(last("IFS=q; d='srcq/*'; touch $d")).toBe("touch ~ @/w");
  expect(last("d='src/*'; touch \"$d\" $(pwd)")).toBe("touch src/* /w @/w");
  expect(last("IFS=/; touch $(pwd)")).toBe("touch ~ @/w");
  for (const [refused, why] of [
    ["x=; : <<E\n${x:=/}\nE\ntouch \"${x}home/x\"", "a heredoc's body that sets a variable"],
    ["x=; : <<E; touch \"${x}home/x\"\n${x:=/}\nE", "a heredoc's body that sets a variable"],
    ["d=/tmp/a; time d=; touch \"$d\"/x", "time before an assignment"],
    ["d=/tmp/a; time -p d=; touch \"$d\"/x", "time before an assignment"],
    ["declare -n d=x; d=/tmp/a; x=/; touch \"$d\"/x", "declare -n"],
    ["typeset -rn d=x", "typeset -n"],
  ]) {
    expect([refused, String(parts(refused)).startsWith(why)]).toEqual([refused, true]);
  }
  expect(parts("cat <<E\n$(echo ${x:=/})\n$((1 + 2))\nE")).toEqual(["cat <<E @/w", "echo ~ @/w"]);
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

test("a cd behind builtin, command or the keyword time moves this shell; one another program runs (sudo, env, exec, an assignment's time) leaves its folder unknown, as an eval another program runs keeps its own; sudoedit and sudo -e run as root", () => {
  for (const wrap of ["builtin", "command", "command -p", "time", "time -p"]) {
    expect(parts(wrap + " cd /tmp; ls")).toEqual(["cd /tmp @/w", "ls @/tmp"]);
  }
  expect(parts("builtin pushd /tmp; ls")).toEqual(["pushd /tmp @/w", "ls @/tmp"]);
  expect(parts("command -v cd; ls")).toEqual(["command -v cd @/w", "ls @/w"]);
  expect(parts("sudo cd /tmp; ls")).toEqual(["cd /tmp @/w [root]", "ls @null"]);
  expect(parts("env cd /tmp; ls; exec cd /; ls")).toEqual(["cd /tmp @/w", "ls @null", "cd / @null", "ls @null"]);
  expect(parts("X=1 time cd /tmp; ls")).toEqual(["X=1 cd /tmp @/w", "ls @null"]);
  expect(parts("command time cd /tmp; ls")).toEqual(["cd /tmp @/w", "ls @null"]);
  expect(parts("nohup eval 'cd /tmp'; ls")).toEqual(["cd /tmp @/w", "ls @/w"]);
  expect(parts("sudoedit /etc/hosts; sudo -e /etc/hosts")).toEqual(["sudoedit /etc/hosts @/w [root]", "sudoedit /etc/hosts @/w [root]"]);
});

test("braces expand before tildes, as bash does: {~,x}/y is home's y, ~{,/x} home and its x, ~root root's; a ~ whose name goes on past the brace known only as it runs", () => {
  expect(parts("rm -rf {~,x}/y ~{,/x}")).toEqual(["rm -rf " + HOME + "/y|x/y " + HOME + "|" + HOME + "/x @/w"]);
  expect(parts("echo > {~/.bashrc,}")).toEqual(["echo >" + HOME + "/.bashrc| @/w"]);
  expect(parts("ls {~+,x} a{~,b}")).toEqual(["ls /w|x a~|ab @/w"]);
  const root = fs.readFileSync("/etc/passwd", "utf8").split("\n").find((l) => l.startsWith("root:"))!.split(":")[5];
  expect(parts("ls {~root,x}; ls {~,x}y")).toEqual(["ls " + root + "|x @/w", "ls ~ @/w"]);
});

test("a path is walked as the system walks it: a .. from where the folder before it really is (link/.. where the link leads), a name not made yet as a plain folder; cd takes .. as written, cd -P as the system does", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + "/illi-shell-links-"));
  try {
    fs.mkdirSync(dir + "/far/deep", { recursive: true });
    fs.mkdirSync(dir + "/near");
    fs.symlinkSync(dir + "/far/deep", dir + "/near/link");
    expect([Shell.walk(dir + "/near", "link/../x"), Shell.walk(dir + "/near/link", "../x"), Shell.walk(dir, "near/new/../x"), Shell.walk(dir, "/a/./b/../c")]).toEqual([dir + "/far/x", dir + "/far/x", dir + "/near/x", "/a/c"]);
    const at = (command: string) => (Shell.parse(command, dir + "/near") as Part[]).at(-1)!.cwd;
    expect([at("cd link/.. && ls"), at("cd -P link/.. && ls"), at("cd -LP link/.. && ls"), at("cd -PL link/.. && ls")]).toEqual([dir + "/near", dir + "/far", dir + "/far", dir + "/near"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
    "touch ee |\n\n  # then\n  cat; touch ff &&\n  touch gg",
    "touch hh | (cat; cat) | { cat; } | while read x; do cat; done; touch ii",
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
