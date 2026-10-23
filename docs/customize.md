Customize
=========

All in `~/.illi/`, for every profile; a profile may add its own
([Profiles](profiles.md)). A project's `.illi/` may hold agents, commands,
skills and plugins too, which win by name, and hooks and MCP servers,
which add to yours, once you trust its folder (the question illi asks at
its first start there; a run from a pipe or a script is never asked, so
it loads them only for a folder trusted before); the rest is read only
from yours.
[`examples/`](../examples) has samples. Or ask illi: it comes with a
skill, `customize-illi`, and writes these files itself.

- `agents/*.md`: agents. `mode: primary` ones are switched to with
  Shift+Tab; `subagent` ones are spawned by illi; `all`, the default,
  both. Each gets a color of its own; `color: "#rrggbb"` picks one.
- `commands/*.md`: `/name` sends the file, `$ARGUMENTS` filled in.
- `skills/<name>/SKILL.md`: skills, in Claude Code's format. illi loads
  one when a task matches; `/name` asks for it, at a message's start or
  anywhere in it ("Use the /imagegen skill to…"). One with `sticky: true`
  is for every reply (a tone, a format): `/name` turns it on and off, and
  while on it is in every turn's prompt, so no summary drops it.
  customize-illi suggests it when it installs a skill. Skills shared with
  other agents (opencode's, Codex's) load too: `~/.agents/skills`, under
  yours of the same name, and a trusted project's `.agents/skills`, from
  the repo's top down to the folder you start in, under its `.illi/`.
- `mcp.json`: MCP servers, in Claude Code's `mcpServers` shape (below).
- `theme.json`: the accent, the other colors, the palette and glyphs
  ([Theme](#theme), below). The `accent` setting alone recolors
  everything, at once: `/settings`, or `/set accent cyan`.
- `plugins/`: plugins, each a folder of commands, skills, agents, hooks
  and MCP servers (a Claude Code plugin as it is), and code that runs
  inside illi ([Plugins](#plugins), below).
- `hooks.json`: shell commands run at what illi does, in Claude Code's
  hook format ([Hooks](#hooks), below).
- the `statusline` setting: a command of yours drawing rows at the
  screen's foot, as Claude Code's status line ([Status line](#status-line),
  below).
- `RULES.md`: your rules for every project, in every prompt. illi writes
  it when you ask ("add that to my rules"), never on its own. A
  project's own `AGENTS.md` (else `CLAUDE.md`) is read too, from the
  repo's top down to the folder you start in.

Agents
------

    ---
    description: Reviews a change for bugs; never edits
    mode: subagent
    model: gpt-6.1-sol
    effort: high
    tools: zoom, shell, read
    color: "#e0af68"
    ---
    You review code changes. ...

MCP servers
-----------

```json
{ "mcpServers": {
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"],
                "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" } },
    "docs":   { "type": "http", "url": "https://example.com/mcp",
                "headers": { "Authorization": "Bearer ${DOCS_TOKEN}" } } } }
```

Secrets go in as `${VAR}`, read from the environment, never in the file.
A server may also have a `cwd`, and `"disabled": true` keeps it from
starting (the `off` setting does too, by name). A trusted project's
`.illi/mcp.json` adds its servers (said at the start when it is new or
changed since illi last started there), and a plugin's come under
yours: by name, a profile's take the place of the global ones, a
project's of both, and any of yours of a plugin's. A change applies at
illi's next start; `/mcp` lists the servers, where each is from, and
their tools.

Theme
-----

Every colored part of the screen takes its color from one of a few
tokens, so one change recolors all of its kind alike:

| Token     | Colors                                                  | Default |
| --------- | ------------------------------------------------------- | ------- |
| `accent`  | copy buttons, the side's bars, the spinner and the ∞, list matches, titles, chips, the text you select, quotes, bullets | illi's aqua; a named palette's own accent |
| `you`     | the frame round your messages                           | the accent, softer (mixed toward the background) |
| `link`    | links in replies                                        | the palette's |
| `success` | a server up, an agent done, lines added                 | the terminal's green |
| `warning` | a bar past 70%                                          | its yellow |
| `error`   | a server down, a bar past 90%, lines removed            | its red |
| `dim`     | the secondary text                                      | the terminal's faint |

A token's value is `#rrggbb`, a palette index (`0`-`255`), a color's
name (`red`, `green`, `yellow`, `blue`, `magenta`, `cyan`: the
terminal's own, so they read on any background), `illi` (its aqua), or
another token's name, to follow it (`"you": "accent"` makes the frame
the full accent).

```json
{
  "accent": "#7dcfff",
  "tokens": { "you": "accent", "dim": "8" },
  "palette": "nord",
  "colors": { "heading": "#ff9e64" },
  "glyph": { "input": "❯ " }
}
```

- `accent`: the accent; `tokens`: any token (its `accent` wins over the
  one alone).
- `palette`: what replies and diagrams draw in: `auto` (by the
  terminal's background), `mono`, `catppuccin-mocha`,
  `catppuccin-latte`, `dracula`, `nord`, `tokyo-night`, `gruvbox-dark`,
  `gruvbox-light`, `rose-pine`, `rose-pine-dawn`, `everforest`,
  `github-dark`, `github-light`, `one-dark`, `solarized-dark` or
  `solarized-light`. An accent not the palette's own is its accent and
  bullets too; links set, its links.
- `colors`: any of the palette's slots (`heading`, `inlineCode`, `path`,
  `number`, `codeString`...), over it.
- `glyph`, `tool` (a mark before a tool's name, by tool: none by
  default), `syntax` (code by kind, while the
  terminal's background is unknown) and `ansi` (`block`, `ink`: the tool
  calls' fill and its text; `you`, `add`, `del`: the frame and a diff's
  lines, over their tokens) as before.

What wins, lowest first: the defaults, `theme.json`, a plugin's theme,
the `accent` setting (unless `auto`). The file is read as illi starts;
the setting applies at once.

Status line
-----------

A shell command of yours draws a few rows at the screen's foot, between
the input and the bottom line, from what illi tells it, as Claude Code's
`statusLine` does: a script written for Claude Code works with little
change. Set it in `config.json` as a command, or as Claude Code's object,
pasted as it is:

```json
{ "statusline": { "type": "command", "command": "~/.illi/statusline.sh", "padding": 1, "refreshInterval": 5 } }
```

or `/set statusline ~/.illi/statusline.sh`, which applies at once
(`/set statusline default` takes it off). `padding` puts spaces before
each row; `refreshInterval` (seconds, 1 to 86400; another value: none)
runs it again that often, beside the runs below.

It runs in `sh`, in the folder illi started in, with `COLUMNS` (the
width its rows may take), `LINES`, `ILLI_PROJECT_DIR` and
`CLAUDE_PROJECT_DIR` set, and gets JSON on its input:

| Field | Holds |
| ----- | ----- |
| `hook_event_name` | `"Status"` |
| `session_id` | the chat's id: one per project and profile, the same across starts |
| `cwd`, `workspace.current_dir` | the folder illi works in |
| `workspace.project_dir` | the project's top |
| `model.id`, `model.display_name` | the model, as illi names it (`sonnet-5.5`) |
| `model.vendor` | illi's: `chatgpt`, `claude-code`, `claude-api`, `openai-api` |
| `effort.level` | the effort |
| `fast_mode` | the speed is fast (or faster) |
| `version` | illi's |
| `context_window.used_percentage`, `remaining_percentage` | how full the window is, as whole percents; `null` till the first turn tells |
| `context_window.context_window_size`, `total_input_tokens` | the model's window, the tokens a turn sends now (once told) |
| `context_window.summarize_at` | illi's: the tokens past which old messages fold into the memory tree |
| `agent.name` | the main agent, when not illi's own |
| `permission_mode` | illi's mode: `auto`, `ask`, `read-only`, `yolo` |
| `rate_limits.five_hour`, `seven_day` | the plan's limits as its vendor tells them: `used_percentage`, `resets_at` (epoch seconds); only when told |
| `profile`, `busy`, `agents` | illi's: the profile, whether a turn runs, the subagents at work |

Not given: `transcript_path`, `cost`, `output_style`, `vim`, `worktree`.
A field illi doesn't know is left out, so read one with a fallback
(jq's `// empty`, or `// 0`):

```sh
#!/bin/sh
# ~/.illi/statusline.sh
jq -r '"\(.model.display_name) · \(.context_window.used_percentage // 0)% · \(.workspace.current_dir | split("/") | last)"'
```

Without jq, any language that reads JSON does:

```sh
#!/bin/sh
python3 -c 'import json,sys; d=json.load(sys.stdin); print("\033[36m%s\033[0m %s%%" % (d["model"]["display_name"], d["context_window"].get("used_percentage") or 0))'
```

- It runs once the chat is up, then as what it is told changes (the
  model, effort or speed, the main agent, the mode, a turn's start and
  end, how full the chat is, the width), 300 ms after the last change
  (a second at most), and every `refreshInterval` if set. One runs at a
  time; a change meanwhile runs it again once it ends.
- Each line of its output on exit 0 is a row, 3 at most, cut to the
  width. Colors (16, 256 and `#rrggbb`), bold, dim, italic, underline,
  inverse, strike and links (OSC 8: `http`, `https`, `file`, `mailto`)
  show; any other escape (cursor moves, a title, the clipboard) is
  dropped. Empty output, or another exit, blanks the rows; the room they
  took is kept till the setting changes, so the chat doesn't jump.
- It gets 5 s; past that it is killed and its rows stay as they were.
  Output past 16 KB kills it and blanks them. A job it leaves running in
  the background is killed once its output is in, as it runs again and
  again. A failure (it can't start, exits otherwise, runs past its time,
  prints too much) is said once, and logged in `illi.log` each time.
- Every terminal's illi runs its own, a second terminal's view too; a
  pipe has none.

Plugins
-------

A plugin is a folder in `~/.illi/plugins/` (every profile), a profile's
`plugins/` or a project's `.illi/plugins/`, laid out as Claude Code's,
so a Claude Code plugin works copied in as it is:

    review/
      .claude-plugin/plugin.json   { "name": "review", "description": "...", "version": "1.0.0" }
      commands/review.md           /review
      skills/check/SKILL.md        a skill
      agents/reviewer.md           an agent
      hooks/hooks.json             hooks, as a hooks.json's
      .mcp.json                    MCP servers (the "mcpServers" wrapper optional)
      illi.ts                      code that runs inside illi (below)

Each part is optional; one `SKILL.md` at the folder's top makes the
plugin that one skill. Install one by copying or cloning it in:

    git clone https://github.com/someone/review ~/.illi/plugins/review

- Its parts join yours by name: yours win, then a later plugin over an
  earlier (global, profile, project; by name), and none takes the name
  of one of illi's own commands. A part another hides is listed as
  `plugin:name` (`/review:check`), and every plugin's part answers to
  that too. The `off` setting turns a plugin off by its name, or one
  part as `plugin:name`. By name, a profile's plugin takes the place of
  a global one, a project's of both.
- The manifest is optional, and read as Claude Code reads it: its
  `commands` and `agents` (paths) replace those folders, `skills` adds
  to them, `hooks` and `mcpServers` (a path, or the block itself) add
  to the files. A path starts with `./` and stays in the folder; one
  leading out (a link too) is left out, said.
- Its [hooks](#hooks) run before yours, so your checks see what they
  changed; its `disableAllHooks` is passed over. Its hook commands and
  MCP servers get `CLAUDE_PLUGIN_ROOT` (its folder) and
  `CLAUDE_PLUGIN_DATA` (a folder of its own under
  `~/.illi/plugin-data/`, kept across updates), and illi's spellings
  `ILLI_PLUGIN_ROOT` and `ILLI_PLUGIN_DATA`; MCP fields and its parts'
  text get them filled in (`${CLAUDE_PLUGIN_ROOT}`), a skill's
  `${CLAUDE_SKILL_DIR}` too. Its commands take `$1`..`$9` (the words
  given) beside `$ARGUMENTS`.
- `/agents` lists each plugin: what it gives, its version, what illi
  doesn't use of it, and what won't read (said at the start too); and a
  folder that looks meant as one but isn't (a marketplace, a name with
  a space).
- A project's plugins load only in a folder you trust; one new or
  changed since illi last started there is said at the start. Which
  plugins there are is read as illi starts, and their code, hooks and
  MCP servers with it; a plugin's commands, skills and agents are read
  as they're used, so one added to it works at once.

A plugin runs as you: its code, hooks and MCP servers run on your
computer with all illi can do. Install only what you trust. illi reads
a plugin's folder without asking, as a skill's (but its `.mcp.json`,
`settings.json`, manifest and secrets), runs its scripts as a
project's, and asks before it writes there.

### Claude Code plugins

Skills, commands, agents, hooks, MCP servers and the variables carry
over. What differs:

- An agent's `tools:` take Claude Code's names, read as illi's: `Read`
  read, `Write` write, `Edit` and `MultiEdit` edit, `Bash` shell, `Task`
  spawn, `TodoWrite` todo; `Glob`, `Grep` and `LS` shell, if `Bash`,
  `Write` or `Edit` is listed too (else it can't search, said in
  `/agents`). `model: inherit` is your pick; `sonnet`, `opus`, `haiku`
  or `fable` alone the newest of it offered, else your pick. (Your own
  agents are read so too.)
- Hooks: a `Bash` matcher takes illi's `shell` ([Beside Claude
  Code's](#beside-claude-codes)); one naming only Claude Code's other
  tools runs only on `claude-code`'s own calls, said at the start.
- Its own MCP servers' tools are `mcp__<server>__<tool>`: Claude Code's
  `mcp__plugin_<plugin>_<server>__` is read as that, in its agents and
  matchers.
- Not done: a command's `` !`cmd` `` lines and `@file` references (said
  in `/agents`), `${user_config.*}` (empty: illi has no userConfig),
  `bin/` on your PATH, output styles, LSP servers, themes, monitors,
  workflows, channels, its `settings.json` (`/agents` says what of a
  plugin illi doesn't use).
- A root `index.js` beside other parts is often its MCP server, so illi
  never imports it: illi's code goes in `illi.ts`.
- On `claude-code`, Claude Code still loads its own enabled plugins
  inside its calls.

### Code

A plugin's code (`illi.ts`, `.js` or `.mjs` in its folder; or a `.ts`,
`.js` or `.mjs` file alone in a plugins folder, or a folder with only an
`index.ts`) runs inside illi: it reads files, runs programs and changes
what the model is told. It loads as illi starts, before the chat opens;
code that fails to load says why, and the rest of its plugin still
applies.

```ts
// ~/.illi/plugins/guard.ts
export default function (illi) {
  illi.on("tool.before", (call) =>
    call.tool === "shell" && /\brm -rf\b/.test(call.input.command ?? "")
      ? { block: "Not rm -rf: move it to a trash folder instead." }
      : undefined);
  illi.on("turn.end", ({ stopped }) => { if (stopped === null) illi.note("Done."); });
  illi.command("today", "the date", () => new Date().toDateString());
  illi.status(() => [{ text: "guarded", tone: "success" }]);
}
```

Its default export is a function, given `illi`:

| Member | Does |
| ------ | ---- |
| `api`, `name`, `dir`, `cwd`, `profile`, `version` | the API's version (1), the plugin's name and folder (a file plugin's: the plugins folder it is in), the project's folder, the profile, illi's version |
| `on(hook, fn)` | a hook (below) |
| `command(name, about, fn)` | `/name words` runs `fn(words)`; text it returns is a note. A command of illi's or yours of that name wins |
| `tool({ name, description, schema, run })` | a tool the model may call, named `plugin__<plugin>__<name>` (an agent's `tools: plugin__<plugin>` allows them all); `run(input, call)` returns text, or `{ text, fail }` |
| `side(w => lines)` | lines at the side, under the MCP servers |
| `status(() => line)` | a piece of the bottom line |
| `theme({ accent, tokens, colors })` | colors over `theme.json` |
| `note(text)`, `send(text)`, `redraw()`, `log(...)` | a note on the screen, a message sent as yours, the screen drawn again, a line in `illi.log` |

A line is text, `{ text, tone, bold, dim }` (`tone` a token's name, so
it follows the theme) or a list of those.
[`examples/plugins/`](../examples/plugins) has a plugin and
`illi.d.ts`, the API's types.

| Hook | Given | May return |
| ---- | ----- | ---------- |
| `start` | `{ cwd, profile, chat }` (`chat`: this illi runs the chat, not a second terminal's view of it) | |
| `quit` | `{ cwd, reason }` (`prompt_input_exit`: you quit; `other`: a signal, a crash); illi waits 1.5 s at most | |
| `context` | `{ cwd }`, once, as the chat opens | `{ context }`: text the model reads in every call of this run |
| `turn.start` | `{ cwd }` | |
| `turn.end` | `{ cwd, stopped }` (why it stopped; `null`: it ended) | |
| `turn.stop` | `{ cwd, again, reply, signal }`: a turn ending of itself (`again`: a hook made it go on since your last message; `reply`: illi's last reply) | `{ continue: "why" }`: it goes on, the model reading why |
| `message` | `{ id, kind, text, agent }`, each message logged (`agent`: `null` for the chat's) | |
| `message.before` | `{ text, cwd, signal }`: a message of yours, before it is sent | `{ block: "why" }`: kept back, why said, the text back in your input; `{ context }`: a note after it, which the model reads |
| `notify` | `{ cwd, type, text }`: illi waits on you (`permission_prompt`: a question for leave, unanswered 6 s; `question`: its question tool's; `idle_prompt`: a reply left 60 s) | |
| `tool.before` | `{ tool, input, agent, cwd, signal }` | `{ block: "why" }` to refuse the call; `{ input }` to run it on other input; `{ allow: true }` to run it without illi's own checks; `{ ask: "why" }` to have it asked; `{ context }` to add to what the model reads after its answer |
| `tool.after` | the same, and `output: { text, fail }` | `{ text, fail }`: what the model reads |

`tool.before` sees every tool call, Claude Code's own tools too (as
they ask leave); `tool.after` every call illi runs (Claude Code runs its
own, so it doesn't see theirs).

- Hooks run one after another: the plugins in the order they load
  (global, profile, project; by name), each one's in the order it gave
  them, then the [hooks](#hooks) files' commands (the plugins', then
  yours). `start`, the turns, messages and
  waits come in order, and illi never waits for them; each hook gets
  30 s.
- `tool.before` hooks run before you're asked to allow a call, so you
  are asked about what will run; each sees the input as the one before
  left it. The first refusal is final; else an ask is asked (the first
  one's why, with no "don't ask again"); else an allow runs it as `yolo`
  mode would (your rules and illi's own config are still asked:
  [Permissions](permissions.md)). An allow vouches for the input it saw:
  a later hook's change takes it back. One that fails or takes over
  30 s refuses the call: a check never lets one through by failing.
- `turn.stop` makes a turn go on 8 times in a row at most with no tool
  call between; then it ends, saying so. `message.before` and
  `turn.stop` get the turn's `signal`: Esc stops them (a message stopped
  goes back to your input, unsent).
- A plugin that won't load, or a hook that fails, is said once and
  logged in `illi.log`; illi goes on without it. A side or bottom-line
  maker that fails is dropped till illi starts again.
- Each illi loads them: a second terminal's view runs their commands,
  lines and pieces; the chat's hooks run where the chat does.
- A change applies at the next start.

Hooks
-----

Shell commands run at what illi does, in Claude Code's hook format: a
`hooks.json` holds its `hooks` block, so one written for Claude Code
pastes in. Each of `~/.illi/hooks.json` (every profile), a profile's
own and a project's `.illi/hooks.json` (once you trust its folder)
applies, in that order, after the [plugins'](#plugins) (so yours see
the input as theirs left it); a command given twice runs once. They're
read as illi starts, and `/agents` lists them. A project's file that is
new, or changed since illi last started there, is said at the start.
`"disableAllHooks": true` in any of yours (a plugin's is passed over),
or the `off` setting naming `hooks.json`, turns them all off.

A hook runs as you, like a plugin: a project's hooks file runs its
commands on your computer as you work there. illi asks before it writes
one (any file in `~/.illi` or a project's `.illi`), even in `yolo` mode.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "shell", "hooks": [{ "type": "command", "command": "~/.illi/hooks/guard.sh" }] }
    ],
    "PostToolUse": [
      { "matcher": "write|edit", "hooks": [{ "type": "command", "command": "jq -r '.tool_input.path // .tool_input.edits[].path' | xargs bunx prettier --write" }] }
    ],
    "Notification": [
      { "hooks": [{ "type": "command", "command": "notify-send illi \"$(jq -r .message)\"" }] }
    ]
  }
}
```

[`examples/hooks.json`](../examples/hooks.json) and
[`examples/hooks/guard.sh`](../examples/hooks/guard.sh) are a start.

### Events

| Event | When | Matcher on | A command may |
| ----- | ---- | ---------- | ------------- |
| `PreToolUse` | before a tool's call, before illi checks it | the tool's name | refuse it, change its input, allow it, have it asked, add to what the model reads after it |
| `PostToolUse` | after a call that ran without failing | the tool's name | add to what the model reads |
| `UserPromptSubmit` | a message of yours, before it is sent | | keep it back (it goes back to your input), add a note the model reads |
| `Stop` | a turn ends of itself (not stopped by you) | | make illi go on, the model reading why |
| `Notification` | illi waits on you: a question for leave unanswered 6 s, its question tool's, a reply left 60 s | `permission_prompt`, `question`, `idle_prompt` | tell you (a sound, a desktop notice) |
| `SessionStart` | the chat opens | `startup` | add context the model reads in every call of this run |
| `SessionEnd` | illi quits | `prompt_input_exit` (you quit), `other` | |

A matcher that is none, `""` or `*` takes all; one of only letters,
digits, `_`, `-`, spaces, `|` and commas takes those names exactly
(`write|edit`); anything else is a regular expression found anywhere in
the name (`mcp__.*`).

Tool names and inputs are illi's: `shell` `{ command }`, `read`
`{ path, offset, limit, at }`, `write` `{ path, content }`, `edit`
`{ edits: [{ path, old, new, all }] }` (the file tools' paths given
whole, from `/`), `zoom`, `date`, `spawn`, `tell`, `todo`, `skill`,
`ask`, `mcp__<server>__<tool>`, `plugin__<plugin>__<tool>`.

### What a command gets

It runs in `sh`, in the folder illi started in, with `ILLI_PROJECT_DIR`
and `CLAUDE_PROJECT_DIR` set to the project's top (a plugin's, its
`CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` too), and gets JSON on
its input:

| Field | Events |
| ----- | ------ |
| `hook_event_name`, `cwd`, `permission_mode` (illi's mode: `auto`, `ask`, `read-only`, `yolo`) | all |
| `tool_name`, `tool_input` | `PreToolUse`, `PostToolUse` |
| `agent_id`, `agent_type` (the subagent's name) | the same, on a subagent's call |
| `tool_response`: `{ text, fail }` (an image a tool gives, as a read of one, isn't in it) | `PostToolUse` |
| `prompt` | `UserPromptSubmit` |
| `stop_hook_active` (a hook made this turn go on already), `last_assistant_message` | `Stop` |
| `message`, `title`, `notification_type` | `Notification` |
| `source` (`startup`) | `SessionStart` |
| `reason` | `SessionEnd` |

### What it answers

- Exit 0: output that is a JSON object is read (below); other output is
  context for `UserPromptSubmit` and `SessionStart`, and passed over
  elsewhere.
- Exit 2 blocks, its error output saying why: a tool's call is refused
  (the model reads why), `PostToolUse` tells the model, a message is
  kept back, a turn goes on; elsewhere it is said to you.
- Any other exit: JSON on its output is still read; with none, it
  failed.
- A command that fails (it can't start or run, runs past its time,
  exits otherwise with no JSON, or gives JSON that won't parse) is said
  once and logged in `illi.log` each time, and illi goes on without it;
  but a `PreToolUse` one refuses the call. `"onFailure": "block"` or
  `"continue"` beside a command sets it.

| JSON field | Events | Means |
| ---------- | ------ | ----- |
| `systemMessage` | all | a note to you |
| `continue: false`, `stopReason` | `PreToolUse`, `PostToolUse` | the turn stops, why said (the call refused) |
| | `UserPromptSubmit` | the message kept back, why said |
| | elsewhere | why said |
| `hookSpecificOutput.permissionDecision` | `PreToolUse` | `deny`, `ask` or `allow` (Claude Code's older `decision: "block"` / `"approve"` too) |
| `hookSpecificOutput.permissionDecisionReason` | `PreToolUse` | why: a deny's for the model, an ask's for you |
| `hookSpecificOutput.updatedInput` | `PreToolUse` | the input the call runs on |
| `hookSpecificOutput.additionalContext` | `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart` | what the model reads (after the call's answer, after the message, in every call) |
| | `Stop` | the turn goes on, the model reading it |
| `decision: "block"`, `reason` | `PostToolUse`, `UserPromptSubmit`, `Stop` | as exit 2, `reason` why |

### How they run

- After your plugins' code, one after another, the plugins' before
  yours: each `PreToolUse` sees the input
  as the one before left it, and decisions fold as plugins' do (a
  refusal is final; then an ask; then an allow, taken back by a later
  change of the input). An allow runs the call as `yolo` mode would:
  your rules and illi's own config are still asked.
- `timeout` beside a command, in seconds; illi's own: 60 s, 30 s for
  `UserPromptSubmit`, 1.5 s for `SessionEnd` (at most 60: illi waits for
  them as it quits). Past it a command is asked to end, then killed 2 s
  after; Esc kills a tool's, a message's or a turn's end's at once, and
  quitting kills any still running (but `SessionEnd`'s).
- Its output is read up to 64 KB; what the model is told from one
  event's commands, up to 10,000 characters. A job it leaves in the
  background isn't waited for.
- `Stop` makes a turn go on 8 times in a row at most with no tool call
  between. `Notification`'s commands are started, not waited for.
- Every illi reads them, but the chat's events fire only where the chat
  runs, not in a second terminal's view of it. A change applies at the
  next start.

### Beside Claude Code's

- illi's tool names and inputs (above), not Claude Code's. A matcher
  naming `Bash` takes illi's `shell` too (its input is alike,
  `{ command }`), and the command is told `tool_name: "Bash"`; one
  naming only Claude Code's other tools (`Write|Edit`: their inputs
  differ) is said at the start. On `claude-code`, its own tools come
  under their names as they ask leave; illi turns
  your `~/.claude` hooks off inside it, so `hooks.json` is the one file
  that runs, and only `PreToolUse`'s refusal, input and decision reach
  those tools (Claude Code runs them, so `PostToolUse` doesn't see them).
- No `session_id` or `transcript_path`: one chat per project, which `cwd`
  names. `permission_mode` holds illi's modes.
- Only `command` hooks, and the seven events above.
- They run one after another, not at once, and illi's time limits are
  shorter (60 s, not 10 minutes).
