Profiles
========

Separate chats, e.g. work and home: the default in `~/.illi`, the others
in `~/.illi/profiles/<name>`.

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
in one.

Global and a profile's own
--------------------------

`~/.illi` is global: every profile gets its settings, skills, agents,
commands, MCP servers, `RULES.md` and theme. A profile's folder holds only
what is its own:

| In the profile's folder      | Does                                      |
| ---------------------------- | ----------------------------------------- |
| `config.json`                | its settings, over the global ones key by key |
| `skills/`, `agents/`, `commands/` | beside the global ones; by name, its own win |
| `mcp.json`                   | servers beside the global ones; by name, its own win |
| `RULES.md`, `theme.json`     | used instead of the global ones, if there |

- In a profile, `/settings` changes the profile's own value. Each row
  says where its value comes from (`global` or the profile), and Del
  puts the global one back.
- The `off` setting turns global ones off for a profile: Enter on it in
  `/settings` lists every skill, agent, command and MCP server to turn on
  and off.
- The login, the API keys and the models list are shared.

illi's memory is the running profile's chat alone: its read, write and
edit tools refuse every chat folder, and its prompt keeps the shell out
of other profiles' too.

Export and import
-----------------

- An export carries the profile's own folder; imported, it goes over the
  importing illi's global setup. It leaves out the login (and a login
  file its config names inside the profile's folder), the lock and the
  log.
- It strips config.json and mcp.json of secrets: by key name, or shaped
  like a known key or token.
- The rest goes as it is: the chat, agents, commands, skills, theme.json
  and RULES.md.
- An import is treated as untrusted: its config's `after`, `rules`,
  `login`, `mcp` and `theme` are dropped and its MCP servers turned off.
- Its agents, commands, skills, RULES.md and chat come in as they are, at
  work once you switch to it.
