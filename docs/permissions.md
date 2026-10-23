Permissions
===========

Before illi runs a shell command, reads or changes a file, or calls an
MCP tool, it checks the call. Routine work runs; a risky call is asked
about, saying why; a few are refused. The checks are fixed rules: no
model judges them.

Trust comes first: on a terminal, illi starts in a folder only once
you've said you trust it (the full-screen question at its first start
there, kept for the whole repo in `trust.json`; your home folder, and
any folder above it, is asked at every start). The checks below presume a trusted folder. A run
from a pipe is never asked: it runs, but a project's own `.illi` agents,
commands, skills, plugins, hooks and MCP servers load only if a terminal
trusted the folder before ([Customize](customize.md)).

Modes
-----

| Mode | Reads | Changes in the project | Risky calls |
| ---- | ----- | ---------------------- | ----------- |
| `auto` (default) | run | run | asked |
| `ask` | run | asked | asked |
| `read-only` | run | refused | asked |
| `yolo` | run | run | run (but a write to illi's own config) |

- `/mode` switches it for this session, or click it at the bottom
  line's right end (`read-only` in the warning color, `yolo` in the
  error color).
- The `mode` setting ([Config](config.md)) is the default; `yolo` set
  there is said at the start. `ILLI_MODE=yolo` runs a script unasked.
- Your rules hold in every mode: deny refuses and ask asks, even in
  `yolo`. So does one check of illi's own: a write to its config (any
  file in `~/.illi`, or a project's `.illi`: what it runs and is told,
  hooks and plugins among them) is asked, until you grant that file.

What is asked about
-------------------

A shell command is read as bash reads it: each command in it, wherever
it sits (pipes, `&&`, subshells, `$(...)`, heredocs, `bash -c`, `eval`,
`xargs`, `find -exec`), wrappers such as `sudo`, `timeout` and `env`
taken off, `cd` followed, variables filled in where known. The shell
tool runs bash, so what illi reads is what runs. Each command is asked
about when it:

- runs as root (`sudo`, `doas`), wipes disks, or changes a whole tree's
  permissions (`chmod -R`)
- deletes a folder (`rm -r`), except build and cache folders inside the
  project (`node_modules`, `dist`, `build`, `target`, `.venv`, ...)
- loses git work (`push --force`, `reset --hard`, `clean -f`,
  `branch -D`, `stash drop`, ...) or pushes (a plain `git push` offers
  "don't ask again" for `git push *`)
- sends data off this computer (`curl -d`, `wget --post-file`), copies
  to another computer (`scp`, `rsync host:`), publishes (`npm publish`,
  `docker push`, `gh release`), installs for the whole computer
  (`npm i -g`), or changes infrastructure (`kubectl apply`,
  `terraform apply`, `docker rm`, a cloud CLI doing anything but read:
  bare `vercel` deploys), or gives a container a folder outside the
  project (`docker run -v /:/host`)
- sets what changes what runs (`PATH=`, `LD_PRELOAD=`,
  `GIT_SSH_COMMAND=`, ...), feeds a shell code from elsewhere
  (`curl ... | sh`, `bash < <(curl ...)`, `bash <<< "$(curl ...)"`), or
  runs inline code that starts programs, changes files, reaches the
  network or reads a secret (`python -c`, `perl -e`, `node -p`)
- runs a command given in its words or options, which illi doesn't read
  (`flock`, `strace`, `parallel`, `tmux new`, `fd -x`,
  `tar --to-command`, `git rebase -x`, `rsync -e`)
- runs a program or script from outside the project (`bash /tmp/x.sh`,
  `make -f /tmp/x.mk`; a loaded plugin's own run as the project's), or
  a project tool in a folder outside it (`cd /x && npm test` runs that
  folder's scripts)
- touches a file outside the project (reading the system's folders,
  `/tmp`, your skills' folders and a loaded plugin's, and writing
  `/tmp`, are free; but a plugin's `.mcp.json`, `settings.json` and
  manifest), a secret anywhere (`.env`, keys, `~/.ssh`, `~/.aws`,
  illi's own folder), or a protected file in the project on writing
  (`.git`, `.illi`, `.claude`, `.vscode`, `.husky`, shell rc files,
  `bunfig.toml`, ...)
- holds what is known only as it runs (`$CMD` as a command, a path made
  by `$(...)`), or what illi can't follow (`case`, functions, arrays):
  asked, never guessed.

The file tools (read, write, edit) are checked for the same files. An
MCP tool its server marks as only reading runs; any other is asked the
first time, and "don't ask again" covers that tool in this project.

On `claude-code`, Claude Code's own settings apply first (your
`~/.claude` rules, its read-only tools in the folder); what it asks
about comes to illi and is checked the same way, `Bash` as the shell,
`Read`, `Grep` and `Glob` as reads, `Write` and `Edit` as changes.

Plugins' `tool.before` hooks and your `PreToolUse` hooks run before the
check, so it judges the input they leave
([Customize](customize.md#hooks)). One may refuse the call; have it
asked (its why first, with no "don't ask again"); or allow it, so it is
judged as in `yolo` mode: your rules and illi's own config are still
asked.

The question
------------

It takes the input's place, the chat over it as it was, nothing dimmed;
what you were typing comes back once you answer:

```
── Allow shell? · ↑↓ Enter · Esc no ───────────────────────────────────────────
Why: git push --force origin main rewrites or deletes history
git push --force origin main
> Yes
  Yes, and don't ask again for git push --force origin main in this project
  No
  No, and say why
───────────────────────────────────────────────────────────────────────────────
● illi                                                                auto mode
```

- Why it asks comes first, then what it would do: the whole command, by
  its lines (the side panel and `/permissions` show it cut short). One
  too long for half the screen is cut to fit, a dim line saying how much
  more; the wheel over it, or PgUp and PgDn, scroll it to its end. Past
  32,000 characters (a heredoc carrying a whole file), a dim line at its
  end says how many more aren't shown. The answers always show; on a
  screen too short for both, what leads them gives way first.
- "Don't ask again" says what it keeps, for this project: a family
  (`git push *`) for routine risks, the exact command for dangerous
  ones, a folder for files outside the project (the file itself in your
  home folder or above it). One call with a dangerous risk beside the
  others keeps just the exact command. It isn't offered for your own
  ask rules.
- The exact command is what runs: its words, where it writes
  (`> log`), and the folder a `cd` moved it to (`cd /x && ...`). One
  whose words are filled in as it runs (`$x`, `$(...)`), or whose input
  comes from elsewhere (a pipe, a file, a heredoc), is kept as the whole
  command you saw. The answer names it on one line; one too long for
  three shows how it starts and how it ends.
- No tells illi you refused, with your words if you say why; Esc is No.
  A subagent's question names it.
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
  checked. On a command illi can't follow, an allow rule applies only
  if each `*` in it stands for no `;`, `|`, `&`, newline, backtick,
  parenthesis, `<` or `>`.
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
  only routine risks; a dangerous one, a secret or a protected file
  needs the exact grant (or your allow rule).
- A change applies at the next call. A file that won't read, or a rule
  that isn't allow, ask or deny, is said, and illi asks before every
  call it checks until it's fixed.
- illi changing the file itself is always asked.

Limits
------

- Fixed checks catch the common risky commands, not every one. A program
  or script illi runs from the project (`bun run x`, `./build.sh`) does
  whatever its code says, and `auto` runs project code.
- Inline code is checked by the words it uses; disguised code passes.
- No sandbox yet: [Planned](planned.md).
