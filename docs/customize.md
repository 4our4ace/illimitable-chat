Customize
=========

All in `~/.illi/`, for every profile; a profile may add its own
([Profiles](profiles.md)). A project's `.illi/` may hold agents, commands,
skills and plugins too, which win by name, once you trust its folder (the
question illi asks at its first start there; a run from a pipe or a
script is never asked, so it loads them only for a folder trusted
before); the rest is read only from yours.
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
  customize-illi suggests it when it installs a skill.
- `mcp.json`: MCP servers, in Claude Code's `mcpServers` shape (below).
  Only yours is read, never a project's.
- `theme.json`: the accent, the other colors, the palette and glyphs
  ([Theme](#theme), below). The `accent` setting alone recolors
  everything, at once: `/settings`, or `/set accent cyan`.
- `plugins/`: TS or JS modules that run inside illi, with hooks on what
  it does ([Plugins](#plugins), below).
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
- `glyph`, `tool` (each tool's emoji), `syntax` (code by kind, while the
  terminal's background is unknown) and `ansi` (`block`, `ink`: the tool
  calls' fill and its text; `you`, `add`, `del`: the frame and a diff's
  lines, over their tokens) as before.

What wins, lowest first: the defaults, `theme.json`, a plugin's theme,
the `accent` setting (unless `auto`). The file is read as illi starts;
the setting applies at once.

Plugins
-------

A plugin is code of yours that runs inside illi: a `.ts`, `.js` or
`.mjs` file in `~/.illi/plugins/` (every profile), a profile's
`plugins/` or a project's `.illi/plugins/`, or a folder there with an
`index.ts`. A project's load only in a folder you trust; by name, a
profile's wins over a global one and a project's over both; the `off`
setting turns one off. They load as illi starts, before the chat
opens; `/agents` lists them, and one that fails says why.

A plugin runs as you, with all illi can do: it reads files, runs
programs and changes what the model is told. Install only code you
trust.

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
| `api`, `name`, `dir`, `cwd`, `profile`, `version` | the API's version (1), the plugin's name and folder, the project's folder, the profile, illi's version |
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
| `quit` | `{ cwd }` (illi doesn't wait for it) | |
| `turn.start` | `{ cwd }` | |
| `turn.end` | `{ cwd, stopped }` (why it stopped; `null`: it ended) | |
| `message` | `{ id, kind, text, agent }`, each message logged (`agent`: `null` for the chat's) | |
| `tool.before` | `{ tool, input, agent, cwd }` | `{ block: "why" }` to refuse the call, `{ input }` to run it on other input |
| `tool.after` | the same, and `output: { text, fail }` | `{ text, fail }`: what the model reads |

`tool.before`, `tool.after` and plugins' tools take effect once tool
calls pass through plugins.

- Hooks run one after another: the plugins in the order they load
  (global, profile, project; by name), each one's in the order it gave
  them. `start`, the turns and messages come in order, and illi never
  waits for them; each hook gets 30 s.
- `tool.before` hooks run before you're asked to allow a call, so you
  are asked about what will run; each sees the input as the one before
  left it, and the first refusal is final. One that fails or takes over
  30 s refuses the call: a check never lets one through by failing.
- A plugin that won't load, or a hook that fails, is said once and
  logged in `illi.log`; illi goes on without it. A side or bottom-line
  maker that fails is dropped till illi starts again.
- Each illi loads them: a second terminal's view runs their commands,
  lines and pieces; the chat's hooks run where the chat does.
- A change applies at the next start.
