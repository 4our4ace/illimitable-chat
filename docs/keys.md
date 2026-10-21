Keys and commands
=================

All of these are in illi too: `/help` lists them, and Ctrl+P finds one
by a word. Your own commands and skills are typed as `/name`.

Chat
----

| Key or command | Does |
| -------------- | ---- |
| Enter | send; on an empty input, interrupt illi |
| Esc | close a list; else clear the notes, and twice: interrupt illi (agents go on) |
| Ctrl+C | clear the input; on an empty one, interrupt illi (again: quit) |
| Ctrl+D | clear the input; on an empty one, quit |
| Tab | take the suggested reply |
| Ctrl+P | all commands and settings in one list, typed to search |
| `/goal <message>` | send a goal: illi goes on until it is met |
| `/halt` | drop the goal; the turn running ends as it would |
| `/clear` | an empty screen for a new topic; illi still remembers the chat before |
| `/compact` | summarize all but the last two exchanges, so each turn sends less; the screen keeps them |
| `/image <path>` | attach an image to the next message (or paste or drop the file) |
| Alt+V, Ctrl+V | attach the clipboard's image (the terminal's own paste brings text) |
| `/open #id` | open block #id and keep it open (or click it) |
| `/close #id` | close block #id and keep it closed (or click its top edge) |
| `/fold`, Ctrl+F | fold the chat into the fewest blocks; again: unfold |
| Ctrl+Y | copy illi's last reply (a drag copies the text it covers, a double click a word) |
| Ctrl+O | show or hide the work between replies: tools, thinking, agents' reports |
| `/export` | save the memory as ./illi-memory.json |
| `/tree` | save the whole memory tree as ./illi-tree.html |
| Ctrl+L | draw the screen again |
| Ctrl+Z | suspend; fg brings it back |
| `/quit` | leave: what runs stops, and goes on at the next start |
| `/help` | this list |

Scroll
------

| Key or command | Does |
| -------------- | ---- |
| PgUp, PgDn | a page up, down (or the wheel); at the end, the chat follows what comes |
| Ctrl+Home, Ctrl+End | the chat's top, its end |

Pick
----

| Key or command | Does |
| -------------- | ---- |
| Shift+Left, Shift+Right | the model before, the next |
| Shift+Up, Shift+Down | more effort, less |
| `/model [name]` | model, effort and speed in one list (Left and Right: effort, Tab: speed); a name: that model |
| `/effort [level]` | set the effort; no level: lists them |
| `/speed [speed]` | set the speed; no speed: lists them |

Agents
------

| Key or command | Does |
| -------------- | ---- |
| Shift+Tab | illi runs as the next primary agent (or click one at the side) |
| `/agent [name]` | illi runs as that primary agent (illi: its own); no name: opens a list |
| `/agents` | your agents, commands and skills, and where their files go |
| Ctrl+PgDn, Ctrl+PgUp | the next tab, the one before: the chat's, each subagent's at work |
| `/tab [name]` | go to that agent's tab; no name: lists the tabs |
| `/stop [name]` | stop all work, agents too; a name: only that agent |

Setup
-----

| Key or command | Does |
| -------------- | ---- |
| `/login` | sign in to ChatGPT (Plus or Pro) with a code; illi keeps the login and renews it |
| `/logout` | remove illi's own ChatGPT login (opencode's, if any, is used again) |
| `/settings` | all the settings: type to search, Left, Right or Enter change one, Del puts its default back |
| `/set <key> [value]` | change a setting (default: back to its default); no value: says what it is |
| `/side [where\|width]` | the side panel: right, left or off, or its width (40 or 30%); alone: says how it is |
| `/mcp` | your MCP servers: their tools, or why one failed |

Profiles
--------

| Key or command | Does |
| -------------- | ---- |
| `/profile [name]` | switch to that profile (its own chat, on the global setup; one login for all); no name: opens a list to make, rename, export, import or delete one |

Typing
------

- Arrows, Home, End, Ctrl+A, Ctrl+E, Ctrl+U, Ctrl+K, Ctrl+W, Alt+B,
  Alt+F, Alt+D, Ctrl+Left, Ctrl+Right and Ctrl+Backspace edit as in a
  shell.
- Shift+Enter or Ctrl+J: a new line. Up and Down past the ends: the
  messages sent before.
- A long paste shows as one token; Alt+V (or Ctrl+V) attaches the
  clipboard's image: Linux needs `wl-paste` or `xclip`, WSL uses
  `powershell.exe`, macOS `osascript`.
- `/` first lists the commands it matches: Up and Down choose, Tab fills
  one in, Enter runs it, Esc closes the list. Among those matched alike,
  the ones you run most come first.

In a list
---------

`/model`, `/settings`, `/profile`, Ctrl+P and the rest:

- Type to search; the search edits as the input does. Up and Down (or
  Tab) move, Enter picks, Esc closes.
- `/model`: Left and Right change the effort, Tab the speed.
- `/settings`: Left, Right and Enter change a setting, Del puts its
  default back (in a profile: the global value).

Mouse and side panel
--------------------

- A click on a block opens it, on an open block's top edge closes it. A
  drag copies the text it covers, a double click a word; a reply's code
  has a copy button. Copying uses OSC 52, so the terminal (and tmux) must
  allow it.
- The wheel scrolls the chat or a pane.
- From 100 columns on, a side panel shows the primary agents (a click
  makes one the main agent), the subagents at work, the profiles (a
  click switches), a ChatGPT plan's use, the context and the memory, the
  MCP servers (a click opens `/mcp`) and illi's to-do list. `/side` or
  the `side` setting places it.
