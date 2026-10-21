Profiles
========

Separate chats and settings, e.g. work and home, each in its own folder:
the default in `~/.illi`, the others in `~/.illi/profiles/<name>`.

`/profile` opens the list (the side panel shows them too), and all of it
happens there:

| Key or row          | Does                                         |
| ------------------- | -------------------------------------------- |
| Enter               | switch                                       |
| Ctrl+R              | rename                                       |
| Ctrl+E              | export to `./illi-profile-<name>.tar.gz`     |
| Del                 | delete                                       |
| + new profile       | asks a name, then what comes along           |
| + import a profile  | asks for an archive                          |

A new profile can bring nothing, this profile's setup, this chat (moved,
so this profile starts fresh), or both. `/profile work` switches
straight away; `ILLI_PROFILE=<name> illi` starts in one.

Profiles share the login, the API keys and the default's config.json.
illi's memory is the running profile's chat alone: its read, write and
edit tools refuse every chat folder, and its prompt keeps the shell out
of other profiles' too.

Export and import
-----------------

- An export leaves out the login (and a login file its config names
  inside the profile's folder), the lock and the log.
- It strips config.json and mcp.json of secrets: by key name, or shaped
  like a known key or token.
- The rest goes as it is: the chat, agents, commands, skills, theme.json
  and RULES.md.
- An import is treated as untrusted: its config's `after`, `rules`,
  `login`, `mcp` and `theme` are dropped and its MCP servers turned off.
- Its agents, commands, skills, RULES.md and chat come in as they are, at
  work once you switch to it.
