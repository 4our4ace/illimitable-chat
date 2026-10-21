Customize
=========

All in `~/.illi/`, for every profile; a profile may add its own
([Profiles](profiles.md)). A project's `.illi/` may hold agents, commands
and skills too, which win by name; the rest is read only from yours.
[`examples/`](../examples) has samples. Or ask illi: it comes with a
skill, `customize-illi`, and writes these files itself.

- `agents/*.md`: agents. `mode: primary` ones are switched to with
  Shift+Tab; `subagent` ones are spawned by illi; `all`, the default,
  both. Each gets a color of its own; `color: "#rrggbb"` picks one.
- `commands/*.md`: `/name` sends the file, `$ARGUMENTS` filled in.
- `skills/<name>/SKILL.md`: skills, in Claude Code's format. illi loads
  one when a task matches; `/name` asks for it.
- `mcp.json`: MCP servers, in Claude Code's `mcpServers` shape (below).
  Only yours is read, never a project's.
- `theme.json`: colors and palette: `"palette"` is `auto` (by the
  terminal's background), `mono`, `catppuccin-mocha`, `catppuccin-latte`,
  `dracula`, `nord`, `tokyo-night`, `gruvbox-dark`, `gruvbox-light`,
  `rose-pine`, `rose-pine-dawn`, `everforest`, `github-dark`,
  `github-light`, `one-dark`, `solarized-dark` or `solarized-light`;
  `colors`, `glyph`, `tool`, `ansi` and `syntax` entries go over it.
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
starting (the `off` setting does too, by name). A change applies at
illi's next start; `/mcp` lists the servers and
their tools.
