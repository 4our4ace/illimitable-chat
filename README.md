![Illimitable: one chat that never ends](assets/header.webp)

A terminal AI agent with one chat that never ends. Illi (short for
Illimitable) folds old messages into a memory tree it can zoom back
into, so it forgets nothing.

Written mostly by AI agents: expect bugs.

Install
-------

    curl -fsSL https://raw.githubusercontent.com/4our4ace/illimitable-chat/main/install.sh | bash

Then run `illi` in any project folder. `illi upgrade` updates it. Linux
and macOS; on Windows, use WSL.

From source, with [Bun](https://bun.sh):

    git clone https://github.com/4our4ace/illimitable-chat
    bun illimitable-chat/src/main.ts

Sign in with `/login` (ChatGPT Plus or Pro). An existing
[opencode](https://opencode.ai) login works too, or API keys (`vendors`
below).

How it works
------------

- **Memory tree.** Each message is summarized into one line, and lines
  merge in pairs into a binary tree. A turn sends the latest messages
  whole, up to `context`; older ones go as lines, coarser with age.
- **Zoom.** Illi can open any line back down to the original messages.
  `/compact` folds all but the last two exchanges, so turns get smaller
  (the screen keeps showing them); `/clear` empties the screen for a
  fresh topic, and Illi still remembers it all.
- **Cheap to run.** A smaller model writes the summaries in the
  background, and the view only grows at its end, so calls hit the
  prompt cache.
- **Tools.** Shell, file edits, subagents, a to-do list, MCP servers.
  `/goal <message>` keeps it working until the goal is met.
- **Drawn replies.** Mermaid diagrams, highlighted code and boxed tables,
  the way [cellsmith](https://github.com/4our4ace/cellsmith) draws them
  in Claude Code.

Keys
----

| Key                  | Does                                  |
| -------------------- | ------------------------------------- |
| Enter / Esc          | send / interrupt                      |
| Tab                  | take the suggested reply              |
| `/`                  | command list                          |
| Shift+Tab            | switch primary agent                  |
| `/model`             | pick the model, its effort and speed  |
| `/settings`          | change any setting below              |
| Ctrl+O               | show tool calls and thinking          |
| Drag, double-click   | copy text                             |
| Ctrl+Y               | copy the last reply                   |
| Alt+V                | paste an image                        |
| PgUp/PgDn, Ctrl+End  | scroll, jump to the bottom            |
| Ctrl+D               | quit (the next start resumes)         |

`/help` lists everything. From a pipe, each line is a message:
`echo "what changed?" | illi`.

Customize
---------

All in `~/.illi/`, or a project's `.illi/` (which wins by name).
`examples/` has samples. Or ask Illi: it comes with a skill,
`customize-illi`, and writes these files itself.

- `agents/*.md`: agents. `mode: primary` ones are switched to with
  Shift+Tab; `subagent` ones are spawned by Illi. Each gets a color of
  its own; `color: "#rrggbb"` picks one.
- `commands/*.md`: `/name` sends the file, `$ARGUMENTS` filled in.
- `skills/<name>/SKILL.md`: skills, in Claude Code's format.
- `mcp.json`: MCP servers, in Claude Code's `mcpServers` shape. Only
  yours is read, never a project's.
- `theme.json`: colors and palette (`"palette": "nord"`, `mono`, `auto`).

An agent:

    ---
    description: Reviews a change for bugs; never edits
    mode: subagent
    model: gpt-6.1-sol
    effort: high
    tools: zoom, shell, read
    color: "#e0af68"
    ---
    You review code changes. ...

Profiles
--------

Separate chats and settings, e.g. work and home: `/profile new work`,
`/profile work`, `/profile export`, `/profile import <file>`. Profiles
share the login, the API keys and the default's config.json. Exports
leave out the login and secrets; imports are treated as untrusted.

Config
------

`~/.illi/config.json`, or `ILLI_<KEY>` variables. All optional.
`/settings` changes them from inside Illi (`/set <key> <value>` too);
most apply at once, `vendors`, `models`, `jobs` and the files at the next
start. A key set by a variable stays as the variable says.

| Key          | Default                           | What                                             |
| ------------ | --------------------------------- | ------------------------------------------------ |
| `vendors`    | `chatgpt`                         | also `claude-api`, `openai-api` (API keys)       |
| `pick`       | `chatgpt:gpt-6.1-sol:medium:slow` | vendor:model:effort:speed (`/model` per chat)    |
| `compactor`  | `chatgpt:gpt-6-luna:medium:slow`  | writes the summaries                             |
| `agents`     | the pick                          | what subagents run on                            |
| `models`     | all                               | models offered                                   |
| `context`    | `auto`                            | tokens a turn sends: `auto` (70% of the window, at most 400k), a number, or `"60%"` |
| `contexts`   |                                   | per model: `{ "gpt-6.1-sol": 350000 }`           |
| `rules`      |                                   | a file added to every system prompt              |
| `after`      |                                   | a shell command run after each turn              |
| `side`       | `right`                           | side panel: `left`, `off`; `side_width` `25%`    |
| `suggest`    | `on`                              | a suggested reply after each turn; `off`         |
| `jobs`       | `8`                               | summaries built at once                          |
| `login`, `theme`, `mcp` | in `~/.illi/`          | other file locations                             |

API keys come from `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`. The chat is
in `~/.illi/chat`, every message kept; days over a month old are gzipped.
Back it up.

Code
----

    src/main.ts    the illi command
    src/term/      the terminal app: keys, selection, commands, side panel
    src/ui/        the chat's view, markdown, replies, diagrams, the screen
    src/chat/      the chat, its memory tree (Memory.ts), the disk
    src/ai/        model vendors, the agent loop, picks, prices
    src/tools/     shell and files, MCP servers, the prompts
    src/config/    settings, profiles, your agents, commands and skills
    test/          tests across modules; each module's own sit beside it
    vendor/        cellsmith's markdown parser and diagram engine

Each file starts with a comment on its design. `bun run test` runs the
tests, `bun run check` the type check (after `bun install`).

License
-------

Apache 2.0: LICENSE and NOTICE. `vendor/cellsmith/` and the libraries it
bundles are MIT, licenses inside.

Roadmap
-------

Planned, roughly in this order. Until then, Illi runs what it decides
to, as you: use it where you'd let it.

- **Permissions.** Rules for what Illi may run or change without asking
  (allow, ask, deny), and a prompt for the rest: once, always in this
  project, always, or no with a reason Illi reads. Secrets such as
  `~/.ssh` hidden, `.git` and shell rc files protected, the mode on the
  bottom line, and subagents' requests in the same queue, named.
- **Sandbox.** Shell commands in a bubblewrap sandbox: only the project
  and `/tmp` writable, secrets hidden, network off. Illi asks before
  anything leaves it, so work inside it needs no prompts.
- **Project trust.** A project's own `.illi` agents, commands and skills
  load only once you trust the folder.
- **An AI reviewer.** Optionally, a small model approves routine requests
  to leave the sandbox, so you're asked less.
