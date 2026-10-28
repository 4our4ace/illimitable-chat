Permissions
===========

Each tool call asks for an action on resources: the shell's commands, a
file's path, a folder outside the project. Rules say `allow`, `ask` or
`deny` for them. Everything inside the project runs unasked; a folder
outside it is asked about, and so is a `.env` file the read tool reads
(a shell command's `cat .env` isn't). There are two modes: `default`,
and `trust`, where nothing but a hook's ask is asked while your rules
read. No model judges a call.

Trust in a folder comes first: on a terminal, illi starts in a folder
only once you've said you trust it (the full-screen question at its
first start there, kept for the whole repo in `trust.json`; your home
folder, and any folder above it, is asked at every start). A run from a
pipe is never asked: it runs, but a project's own `.illi` agents,
commands, skills, plugins, hooks and MCP servers load only if a
terminal trusted the folder before ([Customize](customize.md)).

Modes
-----

| Mode | Runs | Asked about | Refused |
| ---- | ---- | ----------- | ------- |
| `default` | everything inside the project | a folder outside it, the read tool's `.env` read, what your rules ask | what your rules deny |
| `trust` | everything | nothing (but a hook's ask, and while your rules won't read) | what your rules deny |

- `/mode` switches it for this session. In `trust` mode the bottom
  line ends with `trust mode` in the error color; a click on it opens
  `/mode`.
- The `mode` setting ([Config](config.md)) is the default; `trust` set
  there is said at the start. `ILLI_MODE=trust` runs a script unasked.
- An older illi's modes still read: `yolo` as `trust`, `auto`,
  `careful`, `ask` and `read-only` as `default`, said at the start.
- In `default` mode, what stays inside the project runs whatever it
  does: deleting files, `git push --force`, `curl … | sh`, `sudo`, a
  `.env` read by a shell command, a change to `.git/hooks`, to a
  `.claude` folder or to the project's `.illi` (its hooks, plugins and
  MCP servers run from the next start, which says they changed). Add
  `ask` or `deny` rules for what you want stopped
  ([Rules](#rules-permissionsjson)).

What a call asks for
--------------------

Each call makes one or more requests, in order; a folder outside the
project always comes first:

| Call | Action | Resources | "Don't ask again" saves |
| ---- | ------ | --------- | ----------------------- |
| a folder outside the project | `external_directory` | the folder and `*` (`/srv/data/*`) | the git repository holding it and `*` (not your home folder or `/`: then the folder) |
| shell | `shell` | each simple command as written | each command's family: its head and `*` (`git push *`) |
| read | `read` | the path | `*`: every read |
| write, edit | `edit` | the path | `*`: every change |
| spawn | `subagent` | the agent's name (`general` for a plain one) | `*` |
| skill | `skill` | its name | its name |
| ask (illi's questions) | `question` | `*` | `*` |
| an MCP tool | its name (`mcp__github__merge_pr`) | `*` | `*` |
| illi's other tools | their name (`zoom`, `todo`) | `*` | `*` |

- A path inside the project is matched by its path from the working
  folder (`src/a.ts`, `../README.md` from a subfolder; an absolute one
  inside too, its `.` and `..` worked out); one outside by its full
  path. Inside means the working folder or the project's top (its git
  repository's).
- A file outside asks for its folder; a folder outside, for itself.
  Folders inside one another ask as the outermost: a command reading
  `~/notes/` and `~/notes/old/` asks about `~/notes/`, and "don't ask
  again" saves `~/notes/*`, which covers both (of any patterns it
  would save, one another covers is left out).
- A shell command's resources are each simple command in it, whole (its
  wrappers and redirections kept: `sudo rm -rf build > log`) and as the
  command it runs (`rm -rf build`), and that command as its words expand
  (unquoted, `~` and the variables known filled in: `rm -rf "$HOME"` as
  `rm -rf /home/me`), a system program by its name (`'rm' -rf "/"` and
  `/bin/rm -rf /` as `rm -rf /`), its leading assignments left out (`X=1
  rm -rf build` is `rm -rf build`), a word of several values giving a
  command for each (`for d in /tmp /var; do rm -rf $d; done` gives `rm
  -rf /tmp` and `rm -rf /var`). A script a wrapper runs gives its
  commands too, beside the wrapper's own: `bash -c 'ls; rm x'` gives
  `ls`, `rm x` and `bash -c 'ls; rm x'`. So a rule matches either. A
  `cd` is no command: it asks only for its folder, if outside.
- A shell command's folders outside: those it `cd`s into, and the paths
  its words and redirections name (an absolute path, `~`, `~user`, a
  `..`; spaces and quotes in it or not; a value glued to an option,
  `--out=/x` or `-o/x`, but a lone `/`, `cut -d/`; after a name, `dd
  of=/x`, but a variable `export` or `declare` sets; each of a list,
  `--path=/a:/b`), from the folder each command runs in. Streams
  (`/dev/null`, `/dev/zero`, `/dev/random`, `/dev/tty`, `/dev/stdin`,
  `/dev/stdout`, `/dev/stderr`, `/dev/fd`) and what only looks like a
  path (`grep -r '/api/v1'`, whose top folder `/api` isn't there) aren't
  asked; a disk's device (`/dev/sda`) is.
- A command illi's shell reader can't follow (`case`, a function, an
  array) is split crudely at `;`, `&`, `|`, newlines, `$(`, backticks
  and parentheses, quotes or not, and its paths are found by their look
  (one with a space in it up to the space), so a rule still finds most
  of what is in it: a script quoted whole with none of those in it stays
  one piece (in a `case`, `bash -c 'rm x'` matches a rule on `bash *`,
  not one on `rm *`).
- illi's own customization places are allowed outside the project: its
  skills, commands and agents folders (its own, a profile's, those
  shared in `~/.agents/skills`, and each plugin's found as illi started,
  by its real path, not one turned off), and its `RULES.md` and
  `theme.json` (where the `rules` and `theme` settings put them too).
  So illi writes a skill or a rule for itself as you ask, unasked.
  `RULES.md` and `theme.json` are allowed alone of their folder: in
  `default` mode, illi's settings, permissions, hooks and MCP servers
  beside them are still asked, and so are a plugin's code, hooks and
  MCP servers.

On `claude-code`, Claude Code's own settings apply first (yours in
`~/.claude`, a project's in its `.claude`): what they allow runs
unasked, and so does what Claude Code allows by itself (a read inside
the project, a `.env` file's too); illi never sees those calls, so your
deny rules don't refuse them. What it asks about comes to illi and
is checked the same way: `Bash` as the shell, `Monitor` too (its
command, or its WebSocket's URL as `webfetch`), `Read` as a read,
`Write`, `Edit`, `MultiEdit` and `NotebookEdit` as edits, `Grep`,
`Glob` and `LS` as `grep`, `glob` and `list` (their pattern, or the
folder's path) after their folder if outside, `WebFetch` and
`WebSearch` as `webfetch` (the URL) and `websearch` (the query), `Task`
and `Agent` as `subagent`, any other tool as its own name. illi's own
tools in it (`mcp__illi__…`) are checked as they reach illi.

How rules decide
----------------

- illi's own rules come first, then yours, then the approvals saved for
  the project ("don't ask again") and those given this session
  (`/permissions`): an approval, saved for the project or this
  session's, undoes an `ask`, yours too, never a `deny`.
- A resource takes the effect of the last rule that matches its action
  and itself; none matches: ask. illi's own rules: everything `allow`;
  `read` of `*.env` and `*.env.*` `ask`, of `*.env.example` `allow`;
  `external_directory` `ask`, but illi's customization places `allow`.
- A request is refused if any of its resources is denied by illi's
  rules and yours (a saved approval never undoes a deny), else asked if
  any is asked, else run. In `trust` mode what is asked runs.
- Every request of a call is checked for a deny before anything is
  asked: a call one rule refuses is refused at once. Then each one asked
  is asked in turn; one an earlier answer allowed meanwhile isn't.

Plugins' `tool.before` hooks and your `PreToolUse` hooks run before the
check, so it judges the input they leave
([Customize](customize.md#hooks)). One may refuse the call; have it
asked, even if the rules allow it (its why first, on the call's first
question, which offers no "don't ask again"); or allow it, so it runs
as in `trust` mode: your deny rules still refuse, and while your rules
won't read it is asked all the same.

The question
------------

It takes the input's place, the chat over it as it was, nothing dimmed;
what you were typing comes back once you answer:

```
── Allow shell? · ↑↓ Enter · Esc no ───────────────────────────────────────────
Why: it reaches outside the project: ~/notes/
cat ~/notes/todo.md
> ● Yes
  ○ Yes, and don't ask again for files in ~/notes/ in this project
  ○ No
  ○ No, and say why
───────────────────────────────────────────────────────────────────────────────
● illi
```

- Why it asks comes first: the folders outside (which), a `.env` read,
  your rule (`your rule asks about git push *`), a hook's why, or that
  illi can't read your rules. Then what it would do:
  the whole command, by its lines (the side panel and `/permissions`
  show it cut short). One too long for half the screen is cut to fit, a
  dim line saying how much more; the wheel over it, or PgUp and PgDn,
  scroll it to its end. Past 32,000 characters (a heredoc carrying a
  whole file), the lines holding what made illi ask still show, each
  after a dim line saying how many characters were left out before it,
  and a dim line at its end says how many more aren't shown. The
  answers always show; on a screen too short for both, what leads them
  gives way first.
- A command taller than four rows comes folded: its first line, every
  line holding what made illi ask (the command that reaches outside,
  the one your rule asks about), and its last, each stretch between
  them a dim `… 37 lines`. A line too long for the screen (a
  2,000-character `&&` chain, a minified one-liner) folds so too, by its
  rows: its first, those holding what made illi ask, and its last, a
  dim `… 12 rows` between (a row alone is never hidden; a new width
  folds it anew). Ctrl+O, or a click on a `… 37 lines` or `… 12 rows`
  line, shows the whole command; Ctrl+O again folds it (the rule says
  which: `Ctrl+O all`, `Ctrl+O fold`). A hook's ask with nothing else
  in the call asked shows all of the command; a file tool's or an MCP
  tool's call shows whole.

  ```
  ── Allow shell? · ↑↓ Enter · Ctrl+O all · Esc no ──────────────────────────
  Why: it reaches outside the project: ~/projects/old-site/
  set -e
  … 37 lines
  rm -rf ~/projects/old-site
  echo done
  > ● Yes
    ○ Yes, and don't ask again for files in ~/projects/old-site/ in this project
    ○ No
    ○ No, and say why
  ───────────────────────────────────────────────────────────────────────────
  ```
- "Don't ask again" says what it saves, for this project (for this
  session, if the file won't take it): a folder outside (its
  repository's), a command's family (`git push *`; for a shell command,
  each that asked: `ls && git push` saves `git push *` alone), every
  read or change, an MCP tool, a skill. It answers yes, too, every
  question waiting that it now allows. It isn't offered on a question a
  hook asked for, nor while your rules won't read. A `.env` read's saves
  every read: a later `.env` read isn't asked either.
- No refuses the call and every other question of the one who asked
  (illi, or a subagent) waiting with it, and stops its turn (illi's, its
  subagents with it): illi waits for you to say how to go on. Esc is No.
- No, and say why refuses them too, and tells the one who asked your
  words: it goes on, doing it another way. A click in the line asking
  why puts the cursor where it lands, as in your message
  ([Typing](keys.md#typing)). A subagent's question names it.
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
approvals (saved for this project, then this session's), then your
rules:

- Enter on one you said no to allows just what it asked for (that folder
  and those in it, that command exactly) for this session, and tells
  whoever asked (illi, by a message in your name; a subagent, by a
  message to it) that it may run it again.
- One your rules refuse is allowed only by changing them.
- One asked each time (a hook's ask, or while your rules won't read)
  has nothing to allow: run it again, and say yes.
- Enter or Del on an approval removes it.

Rules: permissions.json
-----------------------

`permissions.json` in illi's folder (the `permissions` setting; a
profile's in its own) holds your rules and what "don't ask again"
saved:

```json
{
  "rules": {
    "shell": { "git push *": "ask", "rm -rf /*": "deny" },
    "external_directory": { "~/notes/*": "allow", "/tmp/*": "allow" },
    "edit": { "*.lock": "deny" },
    "webfetch": "ask",
    "mcp__github__*": "ask"
  },
  "projects": {
    "/home/me/app": { "saved": [{ "action": "shell", "resource": "git commit *" }] }
  }
}
```

- Each key is an action (`*` any; a pattern too), its value one effect
  for every resource or an object of patterns and effects. The later
  rule wins over the earlier, in the file's order.
- `*` matches anything, `/` too; `?` one character; a pattern that ends
  in a space and `*` matches the bare command too (`git push *` matches
  `git push`). A `\` reads as `/`, in the pattern and what it matches,
  so no pattern names a `*` itself. A path pattern's `~/` is your home,
  a relative one is matched from the working folder (a file inside the
  project, as its path from there); a shell pattern is matched as the
  command is written.
- `/tmp` is outside the project, so it is asked. To allow it:
  `"external_directory": { "/tmp/*": "allow" }`.
- `saved` is illi's: each an action and a resource allowed, by project.
- A change applies at the next call. A file that won't read, or an
  effect that isn't `allow`, `ask` or `deny`, is said, and until it's
  fixed illi asks before every call that touches your computer or
  beyond (all but its own chat tools: `zoom`, `date`, `projects`,
  `search`, `todo`, `tell`, its questions, skills and subagents), in
  `trust` mode too.
- An older illi's file still reads, though not all of it as it did: its
  `write` rules as `edit`'s (one allowing a folder outside allowing the
  folder too; a `read` rule allowing one doesn't, so reads there are
  asked), its `mcp` rules as rules on the MCP tools they name (`"*"` as
  `mcp__*`), its grants as saved approvals (a command or a family of
  them; a folder outside by a `write` grant, a `read` grant's dropped,
  so reads there are asked again; an MCP tool; one for a single file is
  dropped). Its rules took `deny` over `ask` over `allow` whatever their
  order, a relative path from the project's top and `\*` as a star, and
  its `read` and `write` rules met what a shell command reads and writes
  too; now the last match wins (put a deny after the allow it narrows:
  illi says at the start when a later, looser rule of yours overrides a
  deny or an ask whole), a relative path is from the working folder, `\`
  reads as `/`, and file rules meet the file tools alone. The next save
  writes the grants as approvals; your rules are never rewritten.

Limits
------

- `default` mode stops nothing that stays in the project: a script, a
  build, `rm -rf`, `git push --force`, code piped into a shell. Your
  `ask` and `deny` rules are what stop such commands.
- Folders outside are found as a command is written, with the variables
  it sets and illi's environment filled in (`$HOME/x`). A path known
  only as it runs (a command's output, `$(…)`) is asked by what is known
  of it (`> /etc/$(date).log` asks for `/etc`), else not (`>
  $(mktemp)`); one inside inline code (`python -c`), and what a script
  or program opens itself aren't seen. A `~user` that `/etc/passwd`
  doesn't list (known to another user database alone) is taken as a
  folder beside your home. A path that is only text (`echo /etc`) is
  asked about all the same.
- A rule matches a command as written or as its words expand: a word
  known only as it runs stays as written (`rm -rf "$(cat dir)"` isn't
  `rm -rf /*`), `rm -fr /` isn't `rm -rf /*`, `git -C app push` isn't
  `git push *`.
- A file rule (`read`, `edit`) is for the file tools, illi's and Claude
  Code's: a shell command that reads or writes a file meets your
  `shell` rules alone (and, outside the project, the folder's
  `external_directory` ones): an `edit` rule denying `*.lock` doesn't
  stop `echo x > bun.lock`.
- Paths are matched as written: a link inside the project that leads
  outside isn't asked.
- No sandbox yet: [Planned](planned.md).
