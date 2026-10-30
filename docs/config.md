Config
======

`~/.illi/config.json`, or `ILLI_<KEY>` variables. All optional. A
profile's own `config.json` goes over it, key by key; its `off` and
`sticky` add to the global lists ([Profiles](profiles.md)).

- `/settings` changes them from inside illi (`/set <key> <value>` too;
  typing `/` and a word finds each setting by its key or what it does);
  `/shortcuts` the leader and its shortcuts.
- Most apply at once; `models`, `jobs`, `theme`, `mcp`, `permissions`,
  `login` and `autoupdate` at the next start.
- A key set by a variable stays as the variable says.
- A relative path is taken from the folder of the config.json that names
  it (a variable's: the working folder).
- A value that won't do stops illi at the start, saying which. A pick
  no longer offered gives way to its default, with a note.

| Key          | Default                           | What                                             |
| ------------ | --------------------------------- | ------------------------------------------------ |
| `vendors`    | those `/login` connected          | the vendors offered, named yourself: `chatgpt`, `claude-code` (your Claude plan, through Claude Code), `claude-api`, `openai-api` (API keys); unset, what you connected in `/login` ([Providers](providers.md)) |
| `pick`       | `chatgpt:gpt-6.1-sol:medium:slow` | vendor:model:effort:speed (`/model` per chat); default: the first vendor's. Efforts: `low`, `medium`, `high`, `xhigh`, `max`; speeds: `slow`, `fast`, `ultrafast`, as a model offers them |
| `compactor`  | each vendor's small model         | writes the summaries: a pick per vendor, comma-separated |
| `agents`     | the pick                          | what subagents run on: a pick per vendor         |
| `models`     | all                               | models offered                                   |
| `autocompact` | `60%`                            | how much of the chat a turn sends before older messages fold into the tree: a share of the model's window (`"60%"`) or tokens (`400000`, `"400k"`); at most 70% of the window, and the share of it a request may fill (90%; ChatGPT's own, else 95%: [Providers](providers.md)) less what a request takes beside the chat. `/autocompact` and Shift+Left/Right in `/model` set it per model (its gauge: "auto compact at"). Read as `context` (`ILLI_CONTEXT`) too |
| `autocompacts` |                                 | per model: `{ "gpt-6.1-sol": "50%" }` (tokens apply on every provider of that model, a share follows each one's window). Read as `contexts` (`ILLI_CONTEXTS`) too |
| `autocontinue` | `on`                             | when a turn's chat outgrows the model's window mid-run, more of it is summarized and illi goes on where it was, unasked, as often as its work needs (only a chat too long in itself, even summarized, ends the turn, past three times in a row, saying so); on claude-code too, as illi turns Claude Code's own compaction off for turns, and when Anthropic refuses a request of Claude Code's over a technical limit ([Providers](providers.md#claude-plan)); `off` ends the turn there, saying so, and your next message goes on (a subagent always goes on, from a recap of its own work: [Customize](customize.md)) |
| `rules`      | `RULES.md`: the profile's, else `~/.illi`'s | your rules for every project (none: no rules) |
| `after`      |                                   | a shell command run after each turn              |
| `off`        |                                   | skills, agents, commands, MCP servers and plugins turned off, by name (a plugin's part as `plugin:name` too; `hooks.json`: all hooks); on `claude-code`, a server of Claude Code's own too, by its name as `/mcp` lists it, left out of illi's calls alone from the next call ([Providers](providers.md#claude-plan)); `/settings` lists them to turn on and off, `/mcp` the MCP servers |
| `sticky`     |                                   | sticky skills on, by name; `/name` turns one on and off ([Customize](customize.md)) |
| `mode`       | `default`                         | what runs without asking: `default` (everything inside the project; a folder outside it, the read tool's `.env` read and what your rules ask are asked about, saying why), `trust` (everything, but what your rules deny; a hook's ask is asked, and while your rules won't read, what touches your computer); an older illi's `yolo` reads as `trust`, its other modes as `default`; `/mode` switches it for a session ([Permissions](permissions.md)) |
| `permissions` | `permissions.json` in the profile's folder | your permission rules (`allow`, `ask` or `deny`, by action and pattern: `shell`, `read`, `edit`, `external_directory`, an MCP tool's name...) and, per project, what "don't ask again" saved ([Permissions](permissions.md)) |
| `side`       | `right`                           | side panel: `left`, `off`; `side_width` `25%`    |
| `related`    | `on`                              | while illi works, past topics that may be related to it, in the side panel (counted on the bottom line without it): a search of the chat's own summaries after each step, on its own thread, no model call; `on` also gives illi a strong match after a tool call's result, one line at most a round of calls, never slower ([Related](keys.md#related)); `screen` the side panel alone, nothing given to illi; `off` (`true` and `false` read as `on` and `off`) |
| `accent`     | `auto`                            | the color everything is themed in, at once: `auto` (the theme's: illi's aqua, else the palette's or `theme.json`'s), `illi`, `blue`, `magenta`, `cyan`, `green`, `yellow`, `red`, a palette index or `#rrggbb` ([Theme](customize.md#theme)) |
| `leader`     | `Ctrl+X`                          | the key before a shortcut: Ctrl or Alt and a letter illi doesn't use ([Keys](keys.md#shortcuts)) |
| `shortcuts`  | illi's own                        | the keys after the leader: `{ "c": "/compact", "o": "Ctrl+O", "t": "" }`, over illi's own (`""` drops one; a key in capitals is the lower-case one); `/shortcuts` edits them |
| `suggest`    | `on`                              | a suggested reply after each turn, shown till you send it or illi answers, kept across a restart; `off` |
| `tps`        | `on`                              | tokens a second (tok/s) on the line over the input while text streams; `off` |
| `statusline` |                                   | a shell command drawing up to 3 rows at the screen's foot from what illi tells it, or Claude Code's `statusLine` object as it is ([Status line](customize.md#status-line)) |
| `title`      | `on`                              | the terminal's title: `∞ <project> · illi` (the profile after it, but for the default), one cell of dots tracing a figure of eight in the ∞'s place (`⠋`) while illi works and `?` while a question waits on you (in any profile open in the terminal); the title before comes back as illi quits; `off` |
| `jobs`       | `8`                               | summaries built at once                          |
| `theme`      | `theme.json`: the profile's, else `~/.illi`'s | the theme's file                   |
| `mcp`        | `mcp.json` in the profile's folder | the MCP servers' file; `~/.illi/mcp.json` is read too, and a trusted project's `.illi/mcp.json` |
| `login`      | `~/.illi/login.json`, opencode's  | the ChatGPT login file, which `/login` writes    |
| `autoupdate` | `on`                              | a new release installs itself: looked for once a day (as illi starts, or within the hour while it runs), downloaded and checked in the background, it runs from the next start (a note says so); `notify` only tells; `off` never looks. The installer's one file only: a source clone never updates itself |

API keys come from `/login`, which also offers `ANTHROPIC_API_KEY` and
`OPENAI_API_KEY` if they're set ([Providers](providers.md#api-keys)).
Other variables:

| Variable       | Does                                                  |
| -------------- | ----------------------------------------------------- |
| `ILLI_DIR`     | illi's folder, instead of `~/.illi`                   |
| `ILLI_AGENTS_DIR` | the folder shared with other agents, whose `skills/` illi loads, instead of `~/.agents` |
| `ILLI_PROFILE` | the profile to start in                               |
| `ILLI_WINDOW`  | `off`: illi runs alone on a terminal, not under a window, so a profile switch quits it and starts it again in the other, never while it works ([Profiles](profiles.md)) |
| `ILLI_CLAUDE`  | the `claude` program the `claude-code` vendor runs    |
| `BROWSER`      | what opens `/login`'s page: programs `:`-separated, tried in turn (`%s` is the link, else it goes last), before the system's; `none`: never open one |
| `ILLI_INSTALL`, `ILLI_SOURCE` | where the installer puts illi; `1`: build from the source |

Your chats
----------

Each project has its own chat: a git repo's, by its top folder (a copy
elsewhere, or the repo moved, is another project), and home, for illi
started outside any repo. Each project's is one SQLite file in
`~/.illi/chat/projects/`, named after it (`app-k3f9x2.sqlite`,
`home.sqlite`), every message kept: the messages, their summaries, the
images, the agents' logs and the project's to-do list. A crash never
leaves half a write. Back them up: copy the folder while illi is closed,
or export the profile (`/profile`, Ctrl+E), which copies the chats whole
while illi runs. `/projects` lists them and forgets one: its file is
deleted, all of it at once.

A project's chat runs in one illi. Started in a second terminal in the
same project, illi joins it as another screen: the same chat, either
one typing, asking or answering. The tools work in the first one's
folder; its agents and MCP servers serve both. A setting changed in
any terminal on the chat applies to it, and to every terminal's screen,
as one changed in the first does: the first reads `config.json` again,
then each other terminal's illi does too. Quit the first, and the
second takes the chat over on its own.

What else illi keeps in `~/.illi`:

| File            | Holds                                                 |
| --------------- | ----------------------------------------------------- |
| `login.json`    | the ChatGPT login in use, which `/login` makes (else opencode's, in `~/.local/share/opencode/auth.json`) |
| `accounts.json` | what `/login` connected, readable by you alone: the API keys pasted and the one in use, ChatGPT's other accounts (and whether opencode's login is one), the Claude plan's accounts and the one in use ([Providers](providers.md#connecting-login)); changed under a lock, `.accounts.lock` beside it, so two illis take turns ([Storage](storage.md#accounts)) |
| `claude/`       | a Claude Code folder for each Claude account `/login` added beside your own Claude Code's, its login in it |
| `models.json`   | the models the vendors told last: each one's window, speeds and efforts (ChatGPT's for the account named in it: [Storage](storage.md#models)) |
| `claude-code.json` | the name of each of Claude Code's own MCP servers illi has seen, case and all, so `off` and an agent's `tools:` leave one out of the first call after a start too ([Providers](providers.md#claude-plan)) |
| `used.json`     | how often you ran each command: among those a `/word` matches alike, the most used come first; a use counts half as much 100 uses later, and a command you stopped using drops out (two illis at once each add theirs: [Storage](storage.md#usage-counts)) |
| `picked.json`   | the same for what you pick in Ctrl+P's list, kept apart |
| `related.json`  | what happened to the side's Related lines (shown, opened, pinned, dismissed), counted by each line's score, every profile's: counts and scores alone, no text, no id, no project; where those you opened and pinned score sets how strong a line must be to be given to illi ([Storage](storage.md#related-counts)) |
| `profile`       | the profile used last, for a project illi hasn't run in yet |
| `project-profiles.json` | the profile used last in each project: illi opens a project in it |
| `seen.json`     | what of each project runs as you work (its `hooks.json`, `mcp.json` and plugins), as illi last saw it (each one's hash), so one new or changed is said at the start |
| `plugin-data/`  | each plugin's own folder (`CLAUDE_PLUGIN_DATA`), kept across its updates; a profile's plugins' in the profile's folder ([Plugins](customize.md#plugins)) |
| `trust.json`    | the folders you trust illi in (a repo's top covers the repo), every profile's: the question at the start asks only for others; edit or delete it to trust less |
| `update.json`   | when illi last looked for a new release (`autoupdate`), and the one it last said it couldn't install |
| `locks/`        | a lock per project, held while its chat is open (by the system: a crash never leaves one held), the socket a second terminal joins it by, and the chat's state for the other terminals' side panel |
| `illi.log`      | what went wrong (each profile's own)                  |

`/export` writes `./illi-memory.json`, `/tree` `./illi-tree.html`.

Troubleshooting
---------------

- Something went wrong: illi logs it in its profile's folder,
  `~/.illi/illi.log` (another profile's: `~/.illi/profiles/<name>/illi.log`).
- illi didn't update itself: it looks once a day (`update.json` says
  when). A look that can't reach GitHub (offline) is tried again at
  the next start or within the hour; a release it couldn't download or
  check (a stalled download, not matching its SHA256SUMS) waits for the
  next day's look. Both are logged in `illi.log`. `illi upgrade`
  updates it now, saying each step.
- "illi can't write <folder>": illi is installed where you can't write
  (as with sudo into `/usr/local/bin`). Run `sudo illi upgrade`, or
  install it again into a folder of yours (`ILLI_INSTALL`).
- "<project> is open in another terminal, but it is another version"
  (or "it doesn't answer"): the illi there can't take a second screen,
  as after an update. Quit illi there (Ctrl+D), then start it here
  again.
- "chat: <name>.sqlite won't open": that project's file in
  `~/.illi/chat/projects/` is damaged or isn't illi's. Move it away (the
  project then starts fresh), or restore it from a backup.
- "chat: <name>.sqlite is of a newer illi": a newer illi wrote that
  file (another install, or a profile imported from one). Update illi
  to open it.
