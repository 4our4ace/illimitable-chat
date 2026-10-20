---
name: customize-illi
description: Customize Illi itself - add or change its agents, slash commands, skills, MCP servers, theme, settings, or the rules added to its prompt. Use when the user asks Illi to change how it works, remember a workflow as a skill or a command, add an agent, connect a tool server, or change a setting.
---

Illi is customized with plain files, which you write with your tools:

- Illi's folder: {{illi}}
- This project's: {{project}} (agents, commands and skills only; by
  name, a project's win over Illi's folder)

Write to Illi's folder unless the user asks for this project only. /agents
shows the user every agent, command and skill, and where their files go.

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

The description is all Illi sees of a skill until it loads: say what it
does and when to use it, in the words the user would use. The body says
how. Long references, templates and scripts go in files beside SKILL.md,
named in the body, to be read as needed. The user can also type /<name> to
ask for it.

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

- mode: primary (Illi runs as it: Shift+Tab, /agent), subagent (an agent spawns
  it, as spawn's agent), or all (both, the default)
- model: a model's name, or vendor:model:effort:speed; effort: low,
  medium, high, xhigh or max
- tools: the tools it may use, by name (zoom, date, shell, read, write,
  edit, spawn, tell, todo, skill; mcp__<server> for all of a server's);
  none: every tool its role has
- color: its mark's color; none: one is made for it
- the body: its instructions, added to its system prompt

## MCP servers: mcp.json, in Illi's folder only

A project's is never read: a server is a program, and a repository's would
run on opening it. The shape is Claude Code's, so entries copy over:

```json
{ "mcpServers": {
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"],
                "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" } },
    "docs":   { "type": "http", "url": "https://example.com/mcp",
                "headers": { "Authorization": "Bearer ${DOCS_TOKEN}" } } } }
```

Secrets go in as ${VAR}, read from the environment, never in the file.

## Settings: config.json

Every profile reads {{root}}/config.json, then its own in Illi's folder.
All keys are optional, and an ILLI_<KEY> environment variable overrides
one:

- vendors: chatgpt (the default), claude-api, openai-api
- pick: what Illi runs on, as vendor:model:effort:speed; compactor: what
  writes its memory's summaries; agents: what subagents run on
- models: the models offered; context: the tokens a turn sends ("auto", a
  number, or a share like "60%"); contexts: per model
- rules: a file added to every system prompt; after: a shell command run
  after each turn
- side: right, left or off; side_width: "25%" or columns; jobs: summaries
  built at once
- suggest: on or off, a suggested reply after each turn
- theme, mcp, login: where those files are, if not in Illi's folder

The user can change any of these with /settings, or /set <key> <value>,
most at once. What you write to the file applies at the next start: for a
single setting, point the user to /settings instead.

API keys come only from ANTHROPIC_API_KEY and OPENAI_API_KEY in the
environment.

## Rules: the file `rules` names

Its text goes into every system prompt, Illi's and its agents': who the
user is, how they want work done, Illi's tone. To start one, write it
(for example {{illi}}/rules.md) and set "rules" in config.json to its
path.

## Theme: theme.json

```json
{ "palette": "nord", "colors": { "heading": "#ff9e64" }, "glyph": { "input": "❯ " } }
```

palette: catppuccin-mocha, catppuccin-latte, dracula, nord, tokyo-night,
gruvbox-dark, gruvbox-light, rose-pine, rose-pine-dawn, everforest,
github-dark, github-light, one-dark, solarized-dark, solarized-light, mono,
or auto (the default: by the terminal's background); colors: any of the
palette's over it; glyph, tool, ansi and syntax entries too.

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
- Leave Illi's own state alone: login.json, models.json, chat/, profiles/.
- Say when it applies: agents, commands, skills and the rules file's text
  at the next message; config.json, theme.json and mcp.json once illi
  starts again (Ctrl+D, then illi: the chat goes on where it was).
- Then tell the user how to use it: /<name>, Shift+Tab, or that the skill loads
  when a task matches.
