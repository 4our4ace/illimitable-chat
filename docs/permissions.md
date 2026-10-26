Permissions
===========

Before illi runs a shell command, reads or changes a file, or calls an
MCP tool, it checks the call. What runs unasked depends on the mode; a
call that is asked about says why, and a few are refused. The checks are
fixed rules: no model judges them.

Trust comes first: on a terminal, illi starts in a folder only once
you've said you trust it (the full-screen question at its first start
there, kept for the whole repo in `trust.json`; your home folder, and
any folder above it, is asked at every start). The checks below presume a trusted folder. A run
from a pipe is never asked: it runs, but a project's own `.illi` agents,
commands, skills, plugins, hooks and MCP servers load only if a terminal
trusted the folder before ([Customize](customize.md)).

Modes
-----

| Mode | Runs | Asked about |
| ---- | ---- | ----------- |
| `auto` (default) | all in the project, reads outside it, the network, pushes and deploys, inline code, MCP tools | a change outside the project, secrets, root and the system, what deletes for good on another computer, what makes git or Claude Code run a program, a loop ([auto](#auto)) |
| `careful` | reads, and routine changes in the project | every risky call, and files outside the project ([careful](#careful)) |
| `ask` | reads | every change, and what `careful` asks |
| `read-only` | reads | what `careful` asks; changes are refused |
| `yolo` | everything | only your ask rules and a write to illi's own config |

- `/mode` switches it for this session, or click it at the bottom
  line's right end (`read-only` in the warning color, `yolo` in the
  error color).
- The `mode` setting ([Config](config.md)) is the default; `yolo` set
  there is said at the start. `ILLI_MODE=yolo` runs a script unasked.
- Your rules hold in every mode: deny refuses and ask asks, even in
  `yolo`. So does one check of illi's own: a write to its config (any
  file in `~/.illi`, or a project's `.illi`: what it runs and is told,
  hooks and plugins among them) is asked, until you grant that file.
- Every mode but `yolo` asks all `auto` asks: a secret, through any
  tool (and a folder outside the project holding a secret store), root
  and the system, a change outside the project, what deletes for good on
  another computer, what makes git or Claude Code run a program, and a
  loop (`read-only` refuses what changes).

How a command is read
---------------------

A shell command is read as bash reads it: each command in it, wherever
it sits (pipes, `&&`, subshells, `$(...)`, heredocs, `bash -c`, `eval`,
`xargs`, `find -exec`), wrappers such as `sudo`, `timeout`, `env` and
`flock` taken off, `cd` followed (behind `builtin`, `command` or
`time` too; in a subshell, a pipeline or the background, a group or a
loop there too, only for what follows in it), variables filled in where
known (and `$(pwd)`, `$(git rev-parse --show-toplevel)`: the folder),
each path placed where the system finds it: links followed, a `..`
after a link from where the link leads, a glob's matches looked at. A
pipe is read by every command it reaches: past a line's end after `|`
(as after `&&` and `||`), into a subshell, a group or a loop it feeds,
and into what a command reading it runs (`$(...)`, `<(...)`, a
heredoc's body, `bash -c`, `eval`, `find -exec`), so `curl ... | (bash)`
is asked as `curl ... | bash` is. The input given to a group, a loop or
a nested script (`{ sh; } <<'EOF'`, `bash -c '…' < x.sh`) is read by
the commands in it as their own, so its body is checked as
`sh <<'EOF'`'s is. A program on your `PATH` named by its path
(`~/.cargo/bin/cargo`) is that program, and one named in the project
(`.venv/bin/python`) is the project's, wherever its link leads. A
search's pattern (`grep -n '^x==' file`), git's branches, tags and
revisions (`git checkout -b token-x`) and its config keys are not
files. A sed script's own files are files (`sed
'r x'`, `s/a/b/w x`), and awk's are written when it edits them in place
(`awk -i inplace`). An option is read as its command reads it: in a
cluster (`sed -ne`, `curl -sSLo x`), a value glued to its letter
(`wget -Ox`), and, for what `auto` asks, a long option cut short (`git
push --forc` is `--force`). The shell tool runs bash, so what illi
reads is what runs.

auto
----

`auto` runs what OpenCode runs by default, and asks about what illi's
reading of the call finds reaching outside the project, at your
secrets or the system, deleting on another computer, or changing what
git or Claude Code runs unasked:

| | Runs | Asked about |
| --- | --- | --- |
| Changes | any in the project, deleting files and folders too (`rm -rf src`), and in `/tmp` | a file changed, deleted or moved outside the project (`rm -rf ../x`, `cd ~ && rm -rf code`, `echo x >> ~/.bashrc`, `mv src ../y`, `ln -s ~/.bashrc rc`), placed where the system finds it (`link/../x` from where the link leads, a glob's matches); one whose file is known only as it runs (`rm -rf "$X"`, `rm -rf $(...)`, `find . \| xargs rm`; a folder `d=$(mktemp -d)` made is known when set alone at the top, under `set -e` or `|| exit`: in `$TMPDIR` or `/tmp`, free); deleting the project itself, its `.git`, home or `/`; an archive extracted with its absolute names (`tar -xPf`, `unzip -:`); writing to a device |
| Reads | anywhere, by a program that only reads (`cat`, `grep -r`, `find`, `sed -n`, `git log`, the read tool) | a folder outside the project that holds a secret store, read as a whole (`grep -r x ~`, `ls ~/.claude`: home holds `~/.ssh`); a file outside the project read by a command that may change things (a script or program from there: `python3 ../lib/gen.py`; a build there: `cd ../lib && make`; a program illi doesn't know: `fmt-tool ../lib`), but in `/tmp`, the system's folders, the dependency caches and illi's skills |
| Secrets | `.env.example`, `.env.sample`, `.env.template`; awk and sed scripts that only mention one (`awk '/\.env/'`, `sed 's/credentials/creds/'`) | a file that may hold secrets, through any tool (`cat .env`, `cp .env.example .env`, `git show HEAD:.env`, `sed 'r .env'`, the read tool): `.env` files, keys (`*.pem`, `id_ed25519`), logins and tokens by name (`auth.json`, `credentials.json`, `.npmrc`, `.netrc`), key and credential stores (`~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config/gh/hosts.yml`), other agents' logins (Claude Code's, Codex's, opencode's), browser profiles, illi's logins; `gh auth token`, `git credential fill`; inline code naming one (`python3 -c 'open(".env")'`, `sed 'e cat .env'`), an awk program opening one (`getline < ".env"`, `-v f=.env`, `F=.env` read by `ENVIRON`) |
| System | builds, tests, installs, inline code (`python -c`), the project's scripts, git's own work (`reset --hard`, `clean -fdx`), the network (`curl \| sh`, `ssh`), `pkill`, `PATH=...` | root (`sudo`, `doas`, `sudoedit`); disks and their volumes (`mkfs`, `wipefs`, `dd of=/dev/sda`, `lvremove`, `zfs destroy`, `diskutil eraseDisk`); the system's services and settings (`systemctl`, `crontab`, `mount`); turning the computer off; `kill -1`; a container given the whole computer or a folder outside the project; a command illi can't follow (`case`) or named only as it runs (`$CMD x`) |
| Remote | plain pushes (`git push`, `--tags`, a dry run), pull requests, releases, publishing (`npm publish`), deploys (`vercel deploy`, `kubectl apply`, `terraform apply`) | what deletes for good on another computer: a push that rewrites or deletes the remote's history (`--force`, `--force-with-lease`, `+main`, `--delete`, `:old`, `--mirror`, `--prune`, however cut short: `--forc`), or git config that makes a plain push do so (`remote.origin.mirror`, a `remote.origin.push` of `+x` or `:x`, an alias of `push --force`, `git remote add --mirror=push`); `gh repo delete`, `gh release delete`, `gh api -X DELETE`, `gh pr close --delete-branch`; `npm unpublish`, `gem yank`; cloud and infrastructure deletes (`aws s3 rm`, `gcloud ... delete`, `kubectl delete`, `terraform destroy`, `helm uninstall`) |
| Config | the project's tool configs (`.husky`, `.vscode`, `.git/info/exclude`), `.claude/commands`; reading git's config and Claude Code's settings (`cat .git/config .claude/settings.json`) | what makes git run a program: its hooks and config written (`.git/hooks/*`, `.git/config`, `~/.gitconfig`), a git config key that names one (`core.hooksPath`, `core.sshCommand`, `credential.helper`, a `!` alias, a filter) set by `git config`, `git -c` or the environment (`GIT_CONFIG_KEY_0`, `GIT_CONFIG_PARAMETERS`), config read from another file (`GIT_CONFIG_GLOBAL=x`), `--upload-pack`; Claude Code's settings, what it runs unasked (`settings.json`, `settings.local.json` in any `.claude` folder, home's too; a `.claude` folder moved, copied, linked or deleted); illi's own config |
| Loops | a call again, or again with another between | the same call (tool and input) a third time in a row in one turn, by illi or an agent, illi's own tools too (a skill loaded again and again): a model stuck in a loop |

- "Don't ask again" keeps a folder for what is asked as outside the
  project: for a change, its folder; for a read, the repository holding
  it, so a sibling repo is asked once. Home itself, or a folder above
  it, is never kept: a file right in home keeps just that command.
- The rest keeps only the exact command (or file): a secret, a folder
  holding a secret store, root and the system, what deletes on another
  computer, what makes git or Claude Code run a program, illi's own
  config, what is known only as it runs. A folder grant never clears a
  secret, nor a read of a folder holding a secret store (a grant for
  `~/.config` doesn't let `grep -r token ~/.config` run), and one such
  risk beside a folder's keeps just the exact command.
- The loop guard, in every mode but `yolo`, asks each repeat after the
  second, and "don't ask again" can't quiet it: a yes lets it run and
  starts the count again, as the agent's next turn does. A hook's allow
  leaves it out.
- A link to a file is a way to change it: `ln` (and `ln -s`) to a file
  outside the project is asked as a change there.
- In a project that holds your home folder (illi run in `~`), deleting
  a folder and changing a protected file (shell rc files, `~/bin`,
  `~/.local/bin`) are asked too: home's folders aren't a project's to
  drop.
- The dependency caches, read freely even by a command that may change
  things: cargo's registry and git checkouts, rustup's toolchains, go's
  modules (`GOMODCACHE`), node's (`~/.npm`, nvm's, bun's, pnpm's and
  yarn's caches, any `node_modules`), Python's (any `site-packages`,
  pyenv's and uv's), and Maven's, Gradle's, RubyGems' and NuGet's.

careful
-------

`careful` runs reads and routine changes in the project. Besides all
`auto` asks (a secret, root and the system, a change outside the
project, what deletes for good on another computer, what makes git or
Claude Code run a program, a loop; a command that may change things run
in a folder outside the project: `cd /x && tool`), it asks about each
command that:

- changes a whole tree's permissions (`chmod -R`), destroys files for
  good (`shred`) or stops processes by name (`pkill`)
- deletes a folder (`rm -r`, `find -delete`), except build and cache
  folders inside the project (`node_modules`, `dist`, `build`,
  `target`, `.venv`, `*.egg-info`, ...)
- loses git work (`push --force`, `reset --hard`, `clean -f`,
  `branch -D`, `stash drop`, ...), pushes (a plain `git push` offers
  "don't ask again" for `git push *`), or sets git config that changes
  what git runs (any alias, a URL, `--global`)
- sends data off this computer (`curl -d`, `wget --post-file`),
  connects to another (`ssh`, `nc`) or copies to one (`scp`,
  `rsync host:`), acts on GitHub as you (`gh pr create`: "don't ask
  again" for `gh pr *`), publishes (`npm publish`, `docker push`),
  installs for the whole computer (`npm i -g`), or changes
  infrastructure (`kubectl apply`, `terraform apply`, `docker rm`, a
  cloud CLI doing anything but read: bare `vercel` deploys)
- sets what changes what runs (`PATH=`, `LD_PRELOAD=`,
  `GIT_SSH_COMMAND=`, ...), feeds a shell code from elsewhere
  (`curl ... | sh`, `bash < <(curl ...)`, `bash <<< "$(curl ...)"`),
  runs inline code that starts programs, changes files, reaches the
  network or reads a secret (`python -c`, `perl -e`, `node -p`), or an
  awk or sed script that runs, writes or loads code (awk's `system()`
  and `-l`, sed's `e` and `w`)
- runs a command given in its words or options, which illi doesn't read
  (`strace`, `parallel`, `tmux new`, `fd -x`,
  `tar --to-command`, `git rebase -x`, `rsync -e`)
- runs a program or script from outside the project (`bash /tmp/x.sh`,
  `make -f /tmp/x.mk`, `awk -f /tmp/x.awk`; a loaded plugin's own run as
  the project's), or
  a project tool in a folder outside it (`cd /x && npm test` runs that
  folder's scripts)
- touches a file outside the project (reading the system's folders,
  `/tmp`, your skills', commands' and agents' folders and a loaded
  plugin's, and writing `/tmp`, are free; but a plugin's `.mcp.json`,
  `settings.json` and manifest), or writes a protected file in the
  project (`.git`, `.illi`, `.claude`, `.vscode`, `.husky`,
  `.mcp.json`, shell rc files, `bunfig.toml`, ...)
- holds what is known only as it runs (`$CMD` as a command, a path made
  by `$(...)`), or what illi can't follow (`case`, functions, arrays,
  aliases, `set -o posix`, a `trap` on anything but `EXIT`, whose
  action may run before any later command): asked, never guessed. A
  variable the command itself sets to plain words, `$(pwd)` or the
  repository's top is known (not one bash keeps its own way, as
  `FUNCNAME` or `RANDOM`; a `cd` that `CDPATH` may lead elsewhere
  leaves the folder unknown). So
  is one set alone to a plain `$(mktemp ...)` when a failed mktemp,
  which leaves the variable empty, ends the script: after `set -e`, or
  with `|| exit` after it (no word after `exit`, a number or `$?`),
  the assignment and the `set -e` each at the top (not in an if, a
  loop, a group, a pipeline or the background, not negated nor in
  another `&&` or `||` list).
  `set -e; d=$(mktemp -d); git clone ... "$d/repo"` writes
  in `$TMPDIR` (else `/tmp`), so it runs; without the `set -e`, it's
  asked (empty, `rm -rf "$d"/*` would be `rm -rf /*`). Claude Code's
  Bash runs a command in a wrapper of its own, where a `set -e` may not
  hold, so there only `|| exit` makes the folder known.

The file tools (read, write, edit) are checked for the same files. An
MCP tool its server marks as only reading runs; in `careful` and `ask`
any other is asked the first time, and "don't ask again" covers that
tool in this project (`read-only` refuses it, `auto` runs it).

Every mode
----------

On `claude-code`, Claude Code's own settings apply first (your
`~/.claude` rules, its read-only tools in the folder); what it asks
about comes to illi and is checked the same way, by the mode, `Bash`
as the shell, `Read`, `Grep` and `Glob` as reads, `Write` and `Edit` as
changes. Its tools that touch nothing here (web search, tasks) run; one
illi doesn't know is asked the first time, as an MCP tool is (`auto`
runs it).

Plugins' `tool.before` hooks and your `PreToolUse` hooks run before the
check, so it judges the input they leave
([Customize](customize.md#hooks)). One may refuse the call; have it
asked (its why first, with no "don't ask again"); or allow it, so it is
judged as in `yolo` mode: your rules and illi's own config are still
asked, and the loop guard leaves it out.

The question
------------

It takes the input's place, the chat over it as it was, nothing dimmed;
what you were typing comes back once you answer:

```
── Allow shell? · ↑↓ Enter · Esc no ───────────────────────────────────────────
Why: git push --force origin main rewrites the remote's history
git push --force origin main
> ● Yes
  ○ Yes, and don't ask again for git push --force origin main in this project
  ○ No
  ○ No, and say why
───────────────────────────────────────────────────────────────────────────────
● illi                                                                auto mode
```

- Why it asks comes first, then what it would do: the whole command, by
  its lines (the side panel and `/permissions` show it cut short). One
  too long for half the screen is cut to fit, a dim line saying how much
  more; the wheel over it, or PgUp and PgDn, scroll it to its end. Past
  32,000 characters (a heredoc carrying a whole file), the lines holding
  what made illi ask still show, each after a dim line saying how many
  characters were left out before it, and a dim line at its end says how
  many more aren't shown. The answers always show; on a screen too short
  for both, what leads them gives way first.
- A command taller than four rows comes folded: its first line, every
  line holding what made illi ask, and its last, each stretch between
  them a dim `… 37 lines`. A line too long for the screen (a
  2,000-character `&&` chain, a minified one-liner) folds so too, by
  its rows: its first, those holding what made illi ask, and its last,
  a dim `… 12 rows` between (a row alone is never hidden; a new width
  folds it anew). What made it ask always shows, wherever it is: line
  40 of a script, the middle of a one-liner, a command inside
  `bash -c '…'` or a heredoc fed to a shell; all of a heredoc the risky
  command reads (what it writes to a git hook, what it feeds `python`),
  and all a pipe brings it (`cat <<'EOF' | bash`, `… | sudo tee
  /etc/hosts`, `… | ssh host`). Ctrl+O, or a click on a `… 37 lines` or
  `… 12 rows` line, shows the whole command; Ctrl+O again folds it (the
  rule says which: `Ctrl+O all`, `Ctrl+O fold`). One illi can't follow,
  one asked for a reason with no place in it (a hook's ask, the loop
  guard), and a file tool's or an MCP tool's call show whole.

  ```
  ── Allow shell? · ↑↓ Enter · Ctrl+O all · Esc no ──────────────────────────
  Why: rm -rf ~/projects/old-site deletes ~/projects/old-site and all in it;
  ~/projects/old-site is outside the project
  set -e
  … 37 lines
  rm -rf ~/projects/old-site
  echo done
  > ● Yes
    ○ No
    ○ No, and say why
  ───────────────────────────────────────────────────────────────────────────
  ```

  ```
  ── Allow shell? · ↑↓ Enter · Ctrl+O all · Esc no ──────────────────────────
  Why: rm -rf ~/projects/old-site deletes ~/projects/old-site and all in it;
  ~/projects/old-site is outside the project
  mkdir -p out/part-0 && mkdir -p out/part-1 && mkdir -p out/part-2 && mkdir
  … 12 rows
  out/part-39 && rm -rf ~/projects/old-site && touch out/done-0 && touch
  … 13 rows
  && touch out/done-47 && touch out/done-48
  > ● Yes
    ○ No
    ○ No, and say why
  ───────────────────────────────────────────────────────────────────────────
  ```
- "Don't ask again" says what it keeps, for this project: a folder for
  files outside the project (for a read, the repository holding it;
  just that call in your home folder itself or above it), a family
  (`git push *`, `gh pr *`) for routine risks and for a change in
  `ask`, an MCP tool for its calls, the exact command (or file) for the
  rest: a secret, root and the system, what deletes on another
  computer, what makes git or Claude Code run a program, illi's own
  config. One call with such a risk beside the others keeps just the
  exact command. It isn't offered for your own ask rules, a hook's ask,
  the loop guard, nor for inline code (`python -c`, a heredoc into
  `node`), which never runs again as it was.
- The exact command is what runs: its words, where it writes
  (`> log`), and the folder a `cd` moved it to (`cd /x && ...`). One
  whose words are filled in as it runs (`$x`, `$(...)`), or whose input
  comes from elsewhere (a pipe, a file, a heredoc), is kept as the whole
  command you saw. The answer names it on one line, past 1,000
  characters by how it starts and how it ends; the whole command you
  saw, a script or one past 72 characters, it names "this exact
  command" (it shows above), never its lines run together.
- No tells illi you refused, with your words if you say why; Esc is No.
  A click in the line asking why puts the cursor where it lands, as in
  your message ([Typing](keys.md#typing)). A subagent's question names
  it.
- A click picks as Enter does; a click outside never answers it (the
  chat scrolls, text is selected and copied as ever). For half a second
  after it appears it takes no Enter or click, so a key meant for the
  chat doesn't answer it; Esc works at once.
- With no one at the screen (a pipe), a call that would be asked is
  refused, saying so.

Refused requests
----------------

The side panel lists the latest requests refused, newest first; a click
opens `/permissions` on one. `/permissions` lists them all, then the
grants, then your rules:

- Enter on one you said no to allows it for this session and tells
  whoever asked (illi, by a message in your name; a subagent, by a
  message to it) that it may run it again.
- Enter on one `read-only` mode refused: allow just it for this
  session, or switch to `ask` mode.
- One your rules refuse is allowed only by changing them.
- Enter or Del on a grant removes it.

Rules: permissions.json
-----------------------

`permissions.json` in illi's folder (the `permissions` setting; a
profile's in its own) holds your rules and the grants "don't ask again"
keeps:

```json
{
  "rules": {
    "shell": { "git push *": "ask", "rm -rf /*": "deny", "bun *": "allow" },
    "read":  { "~/notes/*": "allow" },
    "write": { "~/scratch/*": "allow" },
    "mcp":   { "mcp__github__*": "ask" }
  },
  "projects": {
    "/home/me/app": { "granted": ["shell:git commit *", "write=/home/me/app/.npmrc"] }
  }
}
```

- `deny` refuses, `ask` asks every time (no "don't ask again"), `allow`
  runs over illi's own checks; deny wins over ask, ask over allow.
- An allow rule covers the command itself: what it writes by a
  redirection (a rule `bun *` allows `bun test`, not its
  `> ~/.bashrc`) and what its assignments set (`PATH=`) are still
  checked, and so is what the command's output is piped into (`curl *`
  allows `curl -s x`, not the `bash` in `curl -s x | bash`). On a
  command illi can't follow, and where a rule is matched against the
  whole command (for a command reading a pipe or a file), an allow rule
  applies only if each `*` in it stands for no `;`, `|`, `&`, newline,
  backtick, parenthesis, `<` or `>`.
- `*` matches anything, `\*` a star; a shell pattern that ends in a
  space and `*` matches the bare command too (`git push *` matches
  `git push`).
- A shell rule matches each command without its wrappers (`timeout 5
  bun test` matches `bun *`); a root command only a rule that names its
  `sudo`. A deny or ask rule matches a program named by its path too
  (`/bin/rm -rf x` by `rm *`).
- Paths: `~` is your home, a relative one is from the project's top; a
  write rule covers reads too.
- `granted` is illi's: `kind:pattern` or `kind=exact`. A pattern clears
  only routine risks and files outside the project; a dangerous one, a
  secret (or a folder holding a secret store), a protected file, git's
  hooks or Claude Code's settings need the exact grant (or your allow
  rule). A folder's own `*` is kept as `\*` in its grant, so it stands
  for that letter alone.
- A change applies at the next call. A file that won't read, or a rule
  that isn't allow, ask or deny, is said, and illi asks before every
  call it checks until it's fixed.
- illi changing the file itself is always asked.

Limits
------

- Fixed checks catch the common risky commands, not every one. A program
  or script illi runs from the project (`bun run x`, `./build.sh`) does
  whatever its code says, and `auto` and `careful` run project code.
- `auto` checks the shell's own commands for what they reach; what illi
  can't read runs unchecked: code piped into a shell (`curl ... | sh`),
  a command given to another program (`tmux new`, `parallel`,
  `strace`).
- Inline code (`python -c`, `node -e`, a heredoc into an interpreter,
  an awk program) isn't checked for the files it touches, only for the
  words it uses. `auto` asks only one that names a secret (an awk
  program, a name in its strings where it may open a file: `getline <
  ".env"`, but not `/\.env/`); `careful` checks what can run, write or
  reach out besides. So disguised code passes (a name made of pieces:
  `"." "env"`). A script given as a file (`sed -f`, `awk -f`) isn't
  read: it does what it says, as a project's script does. Inline code
  that writes into `~/.illi` (a `python -c` installing a skill) isn't
  seen as a change to illi's own config.
- A recursive search of the project reads its secrets too (`grep -r
  KEY .` reads `.env`): a folder is asked as a whole only for the secret
  stores it holds (home's `.ssh`, another agent's login), not for a
  secret named by its file.
- A git alias set before (`git pf` for `push --force`) runs as its name
  says, not as what it runs; one set by the command or illi (`git -c
  alias.x=...`, `git config alias.x ...`) is judged.
- A long option cut short is read as the one it starts where `auto`'s
  checks read it (git push's and git config's, git's message files and
  remote programs, sed's, awk's, curl's and wget's, `rm --recursive`,
  `cp --target-directory`, `sort --output`); `careful`'s other checks and
  other programs take it as written (`git reset --ha`, `npm i --glob`).
- A link made earlier in the same command is seen only if `ln` made it
  (`ln -s /tmp x && rm -rf x/../y` is asked); one made another way
  (`cp -s`, inline code) isn't.
- `cd` is followed as written: a `CDPATH` in illi's environment can
  take it elsewhere.
- What an archive extracts, or a git checkout lands, isn't seen by its
  names: either may bring a `.claude/settings.json` into the project
  (an archive, a `.git/hooks` file too).
- Claude Code's own `Write` and `Edit` are judged by the path as
  written, a `..` after a link taken as written (as illi's own file
  tools take it); the system climbs from where the link leads, so the
  write may land elsewhere.
- No sandbox yet, which would close these: [Planned](planned.md).
