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
| Ctrl+X | the leader: the screen greys, and the next key runs its shortcut ([below](#shortcuts)) |
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
| `/export` | save this project's memory as ./illi-memory.json |
| `/tree` | save this project's whole memory tree as ./illi-tree.html |
| Ctrl+L | draw the screen again |
| Ctrl+Z | suspend; fg brings it back |
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
| `/shortcuts` | the leader and its shortcuts: Enter changes one, Del puts illi's back (or drops it), the last row adds one |
| `/set <key> [value]` | change a setting (default: back to its default); no value: says what it is |
| `/mcp` | your MCP servers: their tools, or why one failed |

Projects and profiles
---------------------

| Key or command | Does |
| -------------- | ---- |
| `/projects` | your projects, each a git repo with its own chat (outside any: home), this one first: Enter says more, Del forgets one (Cancel, export a copy first, or forget) |
| `/profile [name]` | switch to that profile (its own chats, on the global setup; one login for all); no name: opens a list to make, rename, export, import or delete one |

Shortcuts
---------

Press the leader, Ctrl+X, then a key, as in OpenCode: Ctrl+X then m opens
the model list. A list open (a picker, or the commands matched as you
type a `/word`) closes first. While illi waits for that key the screen
turns grey; Esc, the leader again, a click or the wheel lets it go, and
a key with no shortcut says so. Letters work either case.

| Key | Runs |
| --- | ---- |
| a | `/agent`: illi's primary agent |
| e | `/effort` |
| h | `/help` |
| l | `/projects` |
| m | `/model` |
| p | `/profile` |
| s | `/settings` |
| t | `/tab` |
| y | Ctrl+Y: copy illi's last reply |

`/shortcuts` lists the leader and every shortcut: Enter changes one, Del
puts illi's back (or drops a key), and the last row adds one. Ctrl+P
shows each command's shortcut beside its keys. They're kept in
`~/.illi/config.json`, as `leader` and `shortcuts`; a key maps to a
command with its words, or to a key's name, and `""` drops one of
illi's:

```json
{
  "shortcuts": { "c": "/compact", "o": "Ctrl+O", "g": "/agent reviewer", "t": "" },
  "leader": "Ctrl+G"
}
```

`leader` takes Ctrl or Alt and a letter that illi doesn't use itself:
not Ctrl+C, D, F, L, O, P, V, Y or Z, nor the input's editing keys
(Ctrl+A, E, K, U, W, Alt+B, D, F, V), nor Ctrl+H, I, J or M, which
terminals send as Backspace, Tab and Enter.

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
- `/` after a space, mid-message, lists your skills it matches (Tab or
  Enter fills one in), and each skill a message names ("Use the
  /imagegen skill to…") is one illi is told to use.

In a list
---------

`/model`, `/settings`, `/profile`, Ctrl+P and the rest. A list opens
over the input (Ctrl+P's in the screen's middle), so the keys go to it
alone; the input comes back as you left it when the list closes.

- Type to search; the search edits as the input does. Up and Down (or
  Tab) move, Enter picks, Esc closes.
- `/model`: Left and Right change the effort, Tab the speed.
- `/settings`: Left, Right and Enter change a setting, Del puts its
  default back (in a profile: the global value).

Panes (`/help`, `/agents`, `/mcp`) open in the chat's place,
on a background of their own: Esc or Enter closes one, the arrows and
the pages scroll it, and typing closes it and goes to the input.

When illi asks
--------------

illi may ask you questions with options, up to four at once. They show
in place of the input, a tab each:

- Up and Down move, Space picks an option (one, or several where the
  question says "pick any"), and typing writes words of your own: beside
  the options picked, or instead of them.
- Enter picks the option you're on and goes to the next question; Tab
  and Shift+Tab (Left and Right, off your words) switch tabs.
- The last tab, Review, shows all your answers: Enter sends them, Esc
  skips the questions. Your answers then show in the chat as yours.

Mouse and side panel
--------------------

- A click on a block opens it, on an open block's top edge closes it. A
  drag copies the text it covers, a double click a word; a reply's code
  has a copy button. Copying uses OSC 52, so the terminal (and tmux) must
  allow it.
- A drag with the right button over the chat quotes what it covers in
  your message, each line after `> `, to reply to it; a right click
  within 5 seconds takes the quote out again.
- The wheel scrolls the chat or a pane.
- From 100 columns on, a side panel shows the primary agents (a click
  makes one the main agent), the subagents at work, the sticky skills on
  (a click turns one off), the profiles once you have two (a click
  switches), a ChatGPT plan's use, the context and the memory, the MCP
  servers (a click opens `/mcp`) and illi's to-do list, gone once every
  item is done. The `side` and `side_width` settings place it.
