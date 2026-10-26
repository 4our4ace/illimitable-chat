Profiles
========

Separate setups and chats, e.g. work and personal: the default in
`~/.illi`, the others in `~/.illi/profiles/<name>`. Each profile keeps a
chat per project (each git repo, and home outside them); most people
need just the one profile.

`/profile` opens the list (the side panel shows them too), and all of it
happens there:

| Key or row          | Does                                         |
| ------------------- | -------------------------------------------- |
| Enter               | switch                                       |
| Ctrl+R              | rename                                       |
| Ctrl+E              | export to `./illi-profile-<name>.tar.gz`     |
| Del                 | delete                                       |
| + new profile       | asks a name, then: a fresh chat, or this one moved there |
| + import a profile  | asks for an archive                          |

`/profile work` switches straight away; `ILLI_PROFILE=<name> illi` starts
in one. Otherwise illi opens a project in the profile you last used
there, and a project it hasn't run in yet in the one you used last
anywhere. A profile that illi has open in another terminal (in any
project), or hidden in this one, can't be renamed, deleted or have its
chats moved: quit illi there first.

A switch never stops anything. The profile you leave keeps running,
hidden, until you close the terminal or quit illi there: its turn
streams on, its subagents, background jobs and MCP servers keep going,
and a question it asks waits for you. Switching back shows it as you
left it (the chat where you scrolled, what you had typed), at once; a
profile not open yet starts as illi does. The side panel marks each
profile open in the terminal: a spinner while it works, `?` while a
question waits on you, `● 2` while only its background jobs run; a note
says when one asks you something or is done, and the title's mark turns
`?` for a question in any of them. Ctrl+D (or a second Ctrl+C) quits
every profile open in the terminal, first saying which at work it ends
too; Ctrl+Z hands the terminal back while all of them go on.

Behind it, `illi` on a terminal is a small window process that runs
each profile's illi on a pseudo-terminal of its own
([development](development.md)). With `ILLI_WINDOW=off`, or from a
pipe, illi runs alone, and a switch quits it and starts it again in the
other profile, never while it works.

Global and a profile's own
--------------------------

`~/.illi` is global: every profile gets its settings, skills, agents,
commands, MCP servers, plugins, hooks, `RULES.md` and theme. A profile's
folder holds only what is its own:

| In the profile's folder      | Does                                      |
| ---------------------------- | ----------------------------------------- |
| `config.json`                | its settings, over the global ones key by key |
| `skills/`, `agents/`, `commands/` | beside the global ones; by name, its own win |
| `mcp.json`                   | servers beside the global ones; by name, its own win |
| `plugins/`, `hooks.json`     | beside the global ones; by name, its own plugins win |
| `permissions.json`           | its own rules and saved approvals; the global file isn't read |
| `RULES.md`, `theme.json`     | used instead of the global ones, if there |

- In a profile, `/settings` changes the profile's own value. Each row
  says where its value comes from (`global` or the profile), and Del
  puts the global one back.
- The `off` setting turns global ones off for a profile: Enter on it in
  `/settings` lists every skill, agent, command, MCP server and plugin to
  turn on and off. A profile's list adds to the global one: what is off globally
  is off in every profile.
- A sticky skill's on and off goes with the skill: a global one's is
  every profile's, a profile's own skill's that profile's.
- The login, the API keys and the models list are shared.

illi's memory is the running profile's chats alone: its read, write and
edit tools refuse every chat folder, and its prompt keeps the shell out
of other profiles' too.

Export and import
-----------------

- An export carries the profile's own folder; imported, it goes over the
  importing illi's global setup. It leaves out the login (and a login
  file its config names inside the profile's folder), the lock and the
  log; the default's, what every profile shares too: the other profiles,
  the models the vendors told (naming your ChatGPT account), the folders
  you trust, the commands' counts.
- It strips config.json and mcp.json of secrets: by key name, or shaped
  like a known key or token.
- The chat's SQLite files go as snapshots SQLite takes, whole even while
  illi writes to them. The rest goes as it is: agents, commands, skills,
  plugins, hooks.json, permissions.json, theme.json and RULES.md.
- An import is treated as untrusted: nothing in it runs a command till
  you turn it on. Its config's `after`, `rules`, `login`, `mcp`, `theme`,
  `permissions` and `statusline` are dropped; its MCP servers and plugins
  are turned off (`/settings`, `off`, turns one on); its `hooks.json` and
  `permissions.json` are kept aside as `hooks.json.imported` and
  `permissions.json.imported` (rename one back to use it).
- Its agents, commands, skills, RULES.md and chat come in as they are, at
  work once you switch to it: look through an archive from elsewhere
  before you import it.
