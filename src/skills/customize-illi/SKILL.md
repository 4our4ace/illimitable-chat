---
name: customize-illi
description: Customize illi itself - add or change its agents, slash commands, skills, MCP servers, plugins, hooks, theme and accent color, settings, or the rules added to its prompt. Use when the user asks illi to change how it works or looks, remember a workflow as a skill or a command, add an agent, connect a tool server, write a plugin or a hook, run a command whenever illi does something, or change a setting.
---

illi is customized with plain files, which you write with your tools:

- The global folder, every profile's: {{root}}
- illi's folder, this profile's own: {{illi}} (the same, in the default
  profile; a profile's agents, commands, skills and MCP servers go beside
  the global ones, and win by name)
- This project's: {{project}} (agents, commands, skills, plugins, hooks
  and mcp.json only; by name, a project's win over the others; its hooks
  and MCP servers add to the user's)

Write to illi's folder unless the user asks for every profile (the global
folder) or this project only. Skills shared with other agents load too
(~/.agents/skills, and a project's .agents/skills), under illi's own of
the same name: write there only when the user wants a skill every agent
of theirs uses. /agents shows the user every agent, command,
skill, plugin and hook, and where their files go; the `off` setting turns
one off (a plugin's part as plugin:name; hooks.json: all hooks).

# What goes where

## A skill: skills/<name>/SKILL.md

Instructions for a kind of task, loaded when a task matches. The format is
Claude Code's, so the user's skills from there copy over.

```markdown
---
description: Ships a release - tags it, writes the changelog, uploads it. Use when the user says release, ship or publish.
---
1. ...
```

The description is all illi sees of a skill until it loads: say what it
does and when to use it, in the words the user would use. The body says
how. Long references, templates and scripts go in files beside SKILL.md,
named in the body, to be read as needed. The user can also type /<name> to
ask for it. That /<name> comes with every skill: never write a command of a
skill's name, which would hide it. For rules that should last, make the
skill sticky instead of a command that says "until I say stop".

A sticky skill is one for every reply, not a task: a way to write, a
language, a tone. With `sticky: true` in its front matter, /<name> turns it
on and off, and while on its whole text is in every turn's system prompt,
so no summary drops it. When you install or write a skill, read it and
suggest one way before writing:

- sticky, if it reads as rules for every reply: tone, format, language,
  "for the rest of the session", "until told to stop"
- not sticky, if it is steps for a kind of task: make an image, review a
  PDF, ship a release

Say what sticky costs: its SKILL.md's bytes / 4 tokens in every turn
(cached, so about a tenth of that is billed); for one over 8 KB, suggest
trimming it first. Ask, and add `sticky: true` only on a yes. A global
sticky skill's on and off is every profile's; a profile's own, that
profile's.

## A command: commands/<name>.md

A message the user sends by typing /<name>. The body is the message;
$ARGUMENTS in it becomes the words typed after the name (with none in it,
they go after it). Its front matter's description shows in the command
list.

## An agent: agents/<name>.md

```markdown
---
description: Reviews a change for bugs; never edits
mode: subagent
model: gpt-6.1-sol
effort: high
tools: zoom, shell, read
color: "#e0af68"
---
You review code changes. ...
```

- mode: primary (illi runs as it: Shift+Tab, /agent), subagent (an agent spawns
  it, as spawn's agent), or all (both, the default)
- model: a model's name, or vendor:model:effort:speed; effort: low,
  medium, high, xhigh or max
- tools: the tools it may use, by name (zoom, date, shell, read, write,
  edit, spawn, tell, todo, skill; mcp__<server> for all of a server's);
  none: every tool its role has
- color: its mark's color; none: one is made for it
- the body: its instructions, added to its system prompt

## MCP servers: mcp.json, in illi's folder or the global one

{{root}}/mcp.json is every profile's; a profile's own goes over it by
name, and a trusted project's .illi/mcp.json adds its own (said at the
start when new or changed). The shape is Claude Code's, so entries copy
over:

```json
{ "mcpServers": {
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"],
                "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" } },
    "docs":   { "type": "http", "url": "https://example.com/mcp",
                "headers": { "Authorization": "Bearer ${DOCS_TOKEN}" } } } }
```

Secrets go in as ${VAR}, read from the environment, never in the file.

## Settings: config.json

Every profile reads {{root}}/config.json, then its own in illi's folder.
All keys are optional, and an ILLI_<KEY> environment variable overrides
one:

- vendors: chatgpt (the default), claude-code (the user's Claude plan,
  through their own Claude Code, logged in there), claude-api, openai-api
- pick: what illi runs on, as vendor:model:effort:speed (default: the
  first vendor's); compactor: what writes its memory's summaries; agents:
  what subagents run on. Those two take a pick per vendor,
  comma-separated, and a chat uses its own vendor's: vendors never mix.
  Unset, the compactor is the vendor's small model, agents the chat's
  pick
- models: the models offered; context: the tokens a turn sends ("auto", a
  number, or a share like "60%"); contexts: per model
- rules: the rules file, RULES.md in illi's folder (else the global
  folder's) unless set; after: a shell command run after each turn
- off: skills, agents, commands, MCP servers and plugins turned off, by
  name (a plugin's part as plugin:name; hooks.json: all hooks),
  comma-separated; a profile's adds to the global list (one off globally
  is off in every profile)
- sticky: the sticky skills on, by name, the same way; /<name> keeps it
  for the user
- mode: what runs without asking: auto (the default: reads, and changes
  inside the project; a risky call is asked about, saying why), ask
  (every change asked), read-only (changes refused), yolo (everything,
  but what the user's rules refuse or ask); /mode switches it for a
  session, /permissions lists what was refused and the grants kept
- permissions: the permission file, permissions.json in illi's folder
  unless set: the user's rules ({"rules": {"shell": {"git push *":
  "ask"}}}: allow, ask or deny by pattern, for shell, read, write and
  mcp) and the grants "don't ask again" keeps per project. Changing it
  is always asked: offer the rule, and let the user say yes
- side: right, left or off; side_width: "25%" or columns; jobs: summaries
  built at once
- accent: the color everything on the screen is themed in, at once: auto
  (the theme's; illi's aqua by default), illi, blue, magenta, cyan,
  green, yellow, red, a palette index or #rrggbb. For "make it orange",
  point the user to /settings or /set accent #ff9e64
- leader: the key before a shortcut (default Ctrl+X: Ctrl or Alt and a
  letter illi doesn't use; pressed, the screen greys till the next key,
  which runs its shortcut); shortcuts: the keys after it, as an object
  over illi's own (a /agent, e /effort, h /help, l /projects, m /model,
  p /profile, s /settings, t /tab, y Ctrl+Y), each a command with its
  words or a key's name: {"c": "/compact", "o": "Ctrl+O", "t": ""} ("" drops
  one of illi's). The user changes these from inside illi with
  /shortcuts (Enter changes one, Del drops it or puts illi's back, the
  last row adds one), which applies at once: for one shortcut, point them
  there
- suggest: on or off, a suggested reply after each turn
- tps: on or off, tokens a second (tok/s) on the line over the input while
  text streams
- statusline: a shell command drawing up to 3 rows at the screen's foot
  from what illi tells it as JSON on stdin (the model, folder, context,
  mode...), or Claude Code's statusLine object pasted as it is
  ({ "type": "command", "command": "...", "refreshInterval": 5 });
  docs/customize.md lists the fields. A script goes in illi's folder
  (statusline.sh, made executable); applies at once
- title: on or off, the terminal's title (∞ illi · project, the profile
  after it but for the default; a spinner while illi works)
- theme, mcp: where those files are, if not in illi's folder (theme:
  else the global folder's; the global mcp.json is read too); login: the
  ChatGPT login file, if not {{root}}/login.json (the shared one /login
  makes) or else opencode's
- autoupdate: on (the default: a new release of illi, looked for once a
  day, installs itself and runs from the next start), notify (only
  tells; `illi upgrade` installs it) or off (never looks)
- a relative path is taken from the folder of the config.json naming it

The user can change any of these with /settings, or /set <key> <value>,
most at once (/ and a word finds a setting by its key or what it does;
/set <key> alone opens /settings at it). What you write to the file
applies at the next start: for a single setting, point the user to
/settings instead.

API keys come only from ANTHROPIC_API_KEY and OPENAI_API_KEY in the
environment.

## Rules: RULES.md, and a project's AGENTS.md

{{illi}}/RULES.md (else {{root}}/RULES.md, or the file the "rules"
setting names) goes into every
system prompt, illi's and its agents', for every project: who the user is,
how they want work done, illi's tone. Change it only when the user asks
(never on your own): then write it for them as short lines (create it if
it isn't there), keep it tidy, and say what you changed. A missing file is
just no rules.

A project's own AGENTS.md (else CLAUDE.md) is read too, in each folder from
the repo's top down to where illi started. Change those only when the user
asks: they belong to the project.

## Theme: theme.json

```json
{ "accent": "#7dcfff", "tokens": { "you": "accent", "dim": "8" },
  "palette": "nord", "colors": { "heading": "#ff9e64" }, "glyph": { "input": "❯ " } }
```

Every colored part of the screen takes one of these tokens: accent
(buttons, bars, spinner, matches, chips, bullets), you (the frame round
the user's messages; the accent, softer, by default), link, success,
warning, error, dim (the secondary text). A token's value is #rrggbb, a
palette index, a color's name (red, green, yellow, blue, magenta, cyan),
illi, or another token's name to follow it. palette: catppuccin-mocha,
catppuccin-latte, dracula, nord, tokyo-night, gruvbox-dark,
gruvbox-light, rose-pine, rose-pine-dawn, everforest, github-dark,
github-light, one-dark, solarized-dark, solarized-light, mono, or auto
(the default: by the terminal's background); colors: any of the
palette's slots over it; glyph, tool, ansi and syntax entries too. The
accent setting goes over the file's accent.

## Plugins: plugins/<name>/

A plugin is a folder in Claude Code's plugin layout, so a Claude Code
plugin copies in as it is (or `git clone <url> plugins/<name>`):
commands/*.md, skills/<name>/SKILL.md, agents/*.md, hooks/hooks.json,
.mcp.json, an optional .claude-plugin/plugin.json ({ "name",
"description", "version" }), and illi.ts for code. Its parts join the
user's by name (the user's win; a hidden one is plugin:name); its hook
commands and MCP servers get ${CLAUDE_PLUGIN_ROOT} (its folder) and
${CLAUDE_PLUGIN_DATA} (its own kept folder).

For "make a plugin that adds commands/skills/agents" (to share or keep
together): a folder of those files, no code. Write illi.ts only when the
user asks for behavior a file can't give: code that runs inside illi as
the user, with hooks on what it does (a turn's start and end, each
message, a message before it is sent, a turn ending of itself, the user
waited on, a tool's call before and after it runs), commands, tools,
side lines, a piece of the bottom line and colors; illi's
docs/customize.md lists the API. Say first what code will do: it runs
with all illi's rights. A project's plugins load only in a folder the
user trusts. Code, hooks and MCP servers load as illi starts; commands,
skills and agents at once.

## Hooks: hooks.json

Shell commands run at what illi does, in Claude Code's hook format: the
file holds its `hooks` block, so a Claude Code user's pastes in. For "run
X whenever illi edits a file", "notify me when illi waits", "never let it
touch Y": a hook, not a plugin.

```json
{ "hooks": {
    "PostToolUse": [{ "matcher": "write|edit",
                      "hooks": [{ "type": "command", "command": "jq -r '.tool_input.path // .tool_input.edits[].path' | xargs bunx prettier --write" }] }] } }
```

Events: PreToolUse (refuse, change, allow or ask a tool's call; exit 2
refuses, stderr why), PostToolUse, UserPromptSubmit, Stop, Notification,
SessionStart, SessionEnd. Matchers and tool inputs are illi's, not Claude
Code's: shell {command}, read/write {path, ...}, edit {edits: [{path, old,
new}]}; `Bash` takes shell too (told tool_name "Bash"); Claude Code's
other names (Write, Edit...) match only Claude Code's own calls on the
claude-code vendor, said at the start. A command gets the event as JSON on stdin;
docs/customize.md lists the fields and answers. Say what a hook will run
before writing it: it runs as the user, on every matching event. The user
is asked before you write the file, whatever the mode.

# Doing it cleanly

- A name is letters, digits, - and _, starting with a letter or digit; the
  file's (or a skill's folder's) name is the name.
- Read a file before changing it; change what was asked and keep the rest.
  Never delete or replace one without asking.
- For more than a small change the user asked for, say what you'll write,
  and where, first.
- Keep JSON valid: parse a file after editing it (python3 -m json.tool
  FILE).
- Keep secrets out of these files.
- Leave illi's own state alone: login.json, models.json, update.json,
  profile, project-profiles.json, chat/, profiles/.
- Say when it applies: agents, commands, skills (a plugin's too) and the
  rules file's text at the next message; config.json, theme.json,
  mcp.json, hooks.json, a plugin's code, hooks and MCP servers, and a new
  plugin, once illi starts again (Ctrl+D, then `illi`: the chat goes on where it was).
- Then tell the user how to use it: /<name>, Shift+Tab, or that the skill loads
  when a task matches.
