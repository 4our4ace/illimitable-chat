Config
======

`~/.illi/config.json`, or `ILLI_<KEY>` variables. All optional. A
profile's own `config.json` goes over it, key by key ([Profiles](profiles.md)).

- `/settings` changes them from inside illi (`/set <key> <value>` too).
- Most apply at once; `vendors`, `models`, `jobs`, `theme`, `mcp` and
  `login` at the next start.
- A key set by a variable stays as the variable says.
- A relative path is taken from the folder of the config.json that names
  it (a variable's: the working folder).
- A value that won't do stops illi at the start, saying which. A pick
  no longer offered gives way to its default, with a note.

| Key          | Default                           | What                                             |
| ------------ | --------------------------------- | ------------------------------------------------ |
| `vendors`    | `chatgpt`                         | also `claude-code` (your Claude plan, through Claude Code), `claude-api`, `openai-api` (API keys): see [Providers](providers.md) |
| `pick`       | `chatgpt:gpt-6.1-sol:medium:slow` | vendor:model:effort:speed (`/model` per chat); default: the first vendor's |
| `compactor`  | each vendor's small model         | writes the summaries: a pick per vendor, comma-separated |
| `agents`     | the pick                          | what subagents run on: a pick per vendor         |
| `models`     | all                               | models offered                                   |
| `context`    | `auto`                            | tokens a turn sends: `auto` (70% of the window, at most 400k), a number, or `"60%"` |
| `contexts`   |                                   | per model: `{ "gpt-6.1-sol": 350000 }`           |
| `rules`      | `RULES.md`: the profile's, else `~/.illi`'s | your rules for every project (none: no rules) |
| `after`      |                                   | a shell command run after each turn              |
| `off`        |                                   | skills, agents, commands and MCP servers turned off, by name; `/settings` lists them to turn on and off |
| `side`       | `right`                           | side panel: `left`, `off`; `side_width` `25%`    |
| `suggest`    | `on`                              | a suggested reply after each turn; `off`         |
| `tps`        | `on`                              | tokens a second (tok/s) on the line over the input while text streams; `off` |
| `jobs`       | `8`                               | summaries built at once                          |
| `theme`      | `theme.json`: the profile's, else `~/.illi`'s | the theme's file                   |
| `mcp`        | `mcp.json` in the profile's folder | the MCP servers' file; `~/.illi/mcp.json` is read too |
| `login`      | `~/.illi/login.json`, opencode's  | the ChatGPT login file, which `/login` writes    |

API keys come from `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`.

Your chat
---------

The chat is in `~/.illi/chat`, every message kept; days over a month old
are gzipped. Back it up.

Troubleshooting
---------------

- Something went wrong: illi logs it in its profile's folder,
  `~/.illi/illi.log` (another profile's: `~/.illi/profiles/<name>/illi.log`).
- "illi is already open in another terminal": a profile's chat runs in
  one illi at a time. Quit it there (Ctrl+D), or start another profile:
  `ILLI_PROFILE=<name> illi`.
