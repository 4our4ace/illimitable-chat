Keys and commands
=================

All of these are in illi too: `/help` lists them, and Ctrl+P finds one
by a word. Your own commands and skills are typed as `/name`.

Chat
----

| Key or command | Does |
| -------------- | ---- |
| Enter | send |
| Esc | close a list; else clear the notes, and twice: interrupt illi (a `/compact` under way too; agents go on) |
| Ctrl+C | clear the input; on an empty one, interrupt illi (again: quit); text chosen: copy it again |
| Ctrl+D | clear the input; on an empty one, quit, every profile open in this terminal too (while background jobs run, subagents or another profile are at work, it says what a quit stops: again to quit) |
| Tab | take the suggested reply (it stays after a message of your own, to send as well, till illi answers) |
| Ctrl+P | all commands and settings in one list, typed to search |
| Ctrl+X | the leader: the screen greys, and the next key runs its shortcut ([below](#shortcuts)) |
| `/goal <message>` | send a goal: illi goes on until it is met |
| `/halt` | drop the goal; the turn running ends as it would |
| `/clear` | start a new topic: the chat before is kept and looked up when needed, not sent |
| `/compact [focus]` | illi writes a recap of the chat and goes on from it alone (the chat before is kept and looked up when needed, not sent); focus: what the recap should keep |
| `/image <path>` | attach an image to the next message (or paste or drop the file) |
| Alt+V, Ctrl+V | attach the clipboard's image (the terminal's own paste brings text) |
| `/open #id` | open block #id and keep it open (or click it) |
| `/close #id` | close block #id and keep it closed (or click anywhere in its frame) |
| `/fold`, Ctrl+F | fold the chat into the fewest blocks; again: unfold |
| Ctrl+Y | copy illi's last reply (a drag copies the text it covers, a double click a word) |
| Ctrl+O | show or hide the work between replies: tools, thinking, agents' reports, and the recaps under the "Compaction" lines (hidden, a click opens one alone; shown, a click closes one alone; Ctrl+O forgets those clicks, and unfolds what a click folded) |
| `/export` | save this project's memory as ./illi-memory.json |
| `/tree` | save this project's whole memory tree as ./illi-tree.html |
| Ctrl+L | draw the screen again |
| Ctrl+Z | back to the shell, illi's work going on (in every profile open in this terminal; alone, with `ILLI_WINDOW=off`, it waits); fg brings it back |
| `/help` | this list |

Scroll
------

| Key or command | Does |
| -------------- | ---- |
| PgUp, PgDn | a page up, down (or the wheel); at the end, the chat follows what comes |
| Ctrl+Home, Ctrl+End | the chat's top, its end |

While a list or a question is open, these keys and the wheel move in it
instead; the chat stays where it was.

Pick
----

| Key or command | Does |
| -------------- | ---- |
| Shift+Left, Shift+Right | the model before, the next |
| Shift+Up, Shift+Down | more effort, less |
| `/model [name]` | model, effort, speed and auto compact in one list (Left and Right: effort, Tab: speed, Shift+Left and Shift+Right: auto compact, shown as Shift + <-/->); a name: that model |
| `/effort [level]` | set the effort; no level: lists them |
| `/autocompact [value]` | how much of the chat a turn sends before older messages fold, for the chat's model: a share of its window (50%), a size (300k) or default; no value: says it |

Agents
------

| Key or command | Does |
| -------------- | ---- |
| Shift+Tab | illi runs as the next primary agent (or click one at the side) |
| `/agent [name]` | illi runs as that primary agent (illi: its own); no name: opens a list |
| `/agents` | your agents, commands, skills, plugins and hooks, and where their files go |
| Ctrl+PgDn, Ctrl+PgUp | the next tab, the one before: the chat's, each subagent's at work |
| `/tab [name]` | go to that agent's tab; no name: lists the tabs |
| `/stop [name]` | stop all work, agents too; a name: only that agent |
| `/background` | the background jobs: what a shell call left running (a dev server, a watcher); Enter or Del stops one ([below](#background-jobs)) |

Setup
-----

| Key or command | Does |
| -------------- | ---- |
| `/login` | sign in to ChatGPT (Plus or Pro) with a code, its page opened in your browser; illi keeps the login and renews it |
| `/logout` | remove illi's own ChatGPT login (opencode's, if any, is used again) |
| `/settings` | all the settings: type to search, Left, Right or Enter change one, Del puts its default back |
| `/shortcuts` | the leader and its shortcuts: Enter changes one, Del puts illi's back (or drops it), the last row adds one |
| `/set <key> [value]` | change a setting (default: back to its default); no value: opens `/settings` at it. A `/word` finds every setting too, by its key or what it does |
| `/mcp` | your MCP servers: their tools, or why one failed |
| `/mode [mode]` | what runs without asking, this session: `auto`, `ask`, `read-only` or `yolo`; no mode: opens a list (or click it on the bottom line) |
| `/permissions` | the requests refused (Enter allows one again, this session), the grants kept (Del removes one), your rules |

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
type a `/word`) closes first; a question illi asks shows again once the
shortcut has run. While illi waits for that key the screen turns grey;
Esc, the leader again, a click or the wheel lets it go, and a key with
no shortcut says so. Letters work either case.

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
- illi sees an image file it reads (png, jpeg, gif or webp, up to 20 MB;
  scaled to 1568 px on its longest side), in that tool result only: the
  chat keeps the line saying what it was, so a later turn reads it again
  to look. A request carries at most 20 images, the newest.
- A long paste shows as one token; pasted again while its token is in
  the input, it shows whole in the token's place. Alt+V (or Ctrl+V)
  attaches the clipboard's image: Linux needs `wl-paste` or `xclip`, WSL
  uses `powershell.exe`, macOS `osascript`.
- `/` first lists the commands it matches: by name first, then (from
  three letters on) those whose description has a word it starts, that
  word lit (`/new` lists `/clear`, "start a new topic"), then names with
  its letters in turn. Up and Down choose, Tab fills one in, Enter runs
  it (one found by its description is filled in first, so a second
  Enter runs what shows), a click on one does what Enter does, Esc
  closes the list. Among those matched alike, the ones you run most
  come first. After the commands come the
  settings it matches, by key or by what they do, as `/set <key>`:
  Enter opens `/settings` at one, Tab fills it in to type a value
  (`/sid` finds `/set side`).
- `/` after a space, mid-message, lists your skills it matches (Tab or
  Enter fills one in), and each skill a message names ("Use the
  /imagegen skill to…") is one illi is told to use.

Lists and questions
-------------------

`/model`, `/settings`, `/profile`, Ctrl+P and every other list, and
each question illi asks, open in one box in the middle of the screen,
as wide as their options (no name is ever cut), the rest of the screen
dimmed. While one is open it has the keys and the mouse; the chat, the
side and the input under it stay as they are, and the input comes back
as you left it when the box closes.

| Key | Does |
| --- | ---- |
| Up, Down (or Tab, Shift+Tab) | move |
| PgUp, PgDn | a page |
| Ctrl+Home, Ctrl+End | the first, the last (Home and End too, where you can't type) |
| Enter | pick |
| Esc (or Ctrl+C, Ctrl+D) | close; a question: No |
| typing | search, where the list has one, by name (Ctrl+P's by the words of what each row does too, as `/` does); it edits as the input does, and a paste goes there as one line |

- The wheel scrolls the list; the row under the pointer lights as it
  moves; a click does what Enter does; a click outside closes a list
  (a question stays till you answer). Shift+drag selects text in it,
  as the terminal does.
- Ctrl+L, Ctrl+Z and the leader work as ever; Ctrl+P opens the commands
  in a list's place (in its own, closes it).
- `/model`: Left and Right change the effort (Shift+Up and Shift+Down
  too), Tab the speed; Shift+Left and Shift+Right step the lit model's
  auto compact by 5%, its gauge under the list ("auto compact at", a bar
  of the model's window, its keys shown as Shift + <-/->; the effort's
  as <- and ->). Enter keeps it with the pick, Esc drops it.
- `/settings` (and a setting in Ctrl+P): Enter or Right steps a setting
  to its next value, Shift+Enter or Left back; Del puts its default back
  (in a profile: the global value).

Panes (`/help`, `/agents`, `/mcp`) open in the chat's place,
on a background of their own: Esc or Enter closes one, the arrows and
the pages scroll it, and typing closes it and goes to the input. A list
(and a permission question) opens in a pane's place, closing it; illi's
own questions open over a pane, which waits under them.

When illi asks
--------------

illi may ask you questions with options, up to four at once. They show
in the screen's middle, as every list does, a tab each, the input you
were typing left under them:

- Up and Down move, Space picks an option (one, or several where the
  question says "pick any"), and typing writes words of your own: beside
  the options picked, or instead of them.
- Enter picks the option you're on and goes to the next question; Tab
  and Shift+Tab (Left and Right, off your words) switch tabs. PgUp and
  Ctrl+Home go to the first option, PgDn and Ctrl+End to your words.
- A click on an option picks it (one: and goes on; several: on or off),
  on a tab goes there, on your words' row puts you there.
- The last tab, Review, shows all your answers: Enter sends them, Esc
  (or Ctrl+C, Ctrl+D) skips the questions. Your answers then show in
  the chat as yours.

A call the permission checks stop ([Permissions](permissions.md)) asks
in the screen's middle: what it would do and why, then Yes; Yes, and
don't ask again (only where it keeps something, which it names); No;
No, and say why (a line typed, which illi reads). Up and Down move,
Enter or a click picks, Esc is No; a click outside leaves it open. A
subagent's question names it.

A question that has just appeared takes no Enter, Space or click for
half a second, so a key or a click meant for the chat doesn't answer it;
Esc works at once.

The first time illi starts in a folder, it asks full screen whether you
trust it: Up, Down and Tab move between No and Yes, Enter takes the lit
one, `y` and `n` pick one, Esc (or Ctrl+C) exits.

Background jobs
---------------

A shell call that starts a process in the background, its output going
to a file (`npm run dev > dev.log 2>&1 &`), ends while that process
runs on: a background job. Whoever started it, illi or a subagent, it
shows in the side panel's Background section (a click opens
`/background`); without the side panel, or with it too full, the bottom
line counts them (`● 2 in background`, a click opens `/background`).
`/background` lists each one, who started it and how long it has run:
Enter or Del stops it.

They live only while illi does. A profile switch keeps them running,
hidden with their profile ([Profiles](profiles.md)); a quit stops them,
so Ctrl+D (or a second Ctrl+C) first says how many it stops; illi is
told they were stopped, so it starts them again if it needs them. A
process that left its group (`setsid`, a daemon) isn't listed but is
stopped at the quit all the same. On the `claude-code` provider, Claude Code runs the shell, so its
background jobs don't show here.

Mouse and side panel
--------------------

- A click on a block opens it; a click anywhere in an open block's frame
  closes it. A drag copies the text it covers, a double click a word,
  three a line; a reply's code has a copy button. Copying uses OSC 52,
  so the terminal (and tmux) must allow it.
- The work between replies (tool calls, results, thinking, agents'
  reports): a click on a run's line, or anywhere down the bar at its
  left, opens or closes the whole run. Inside an open run, a click on a
  call, a result, a thought or a report folds it to one line (`result ·
  1,204 lines`), wherever you are in it; a click on that line unfolds it.
  What you clicked stays under the pointer (at the chat's end a close
  lands lower, as the chat can't scroll past its end).
- A click on a word waits a moment before it acts, so a double click
  still copies the word. Past a line's end, on a blank line or a frame's
  edge, on a run's line or its bar, on a folded message's `[+]`, on a
  block's `/open` or an open block's top edge, it acts at once. A second
  click on the same spot right after does nothing, so a slow double
  click never undoes the fold.
- What a click would act on lights as the pointer moves over it: a run's
  line and its whole bar, heavier; a message's bar beside it (and a
  folded one's `[+]`); a block's `/open`, an open block's top edge. It
  goes as you type, as the chat moves on by itself, and as the window
  loses the focus. While text you chose shows, nothing lights: a click
  then only lets the text go, and folds nothing.
- A drag with the right button over the chat quotes what it covers in
  your message, each line after `> `, to reply to it; a right click
  within 5 seconds takes the quote out again. A reply's buttons are left
  out of what's quoted or copied, and a right drag never starts on one.
- The wheel scrolls the chat, a pane, or the list or question open.
- The click that only brings the terminal's window to the front does
  nothing, in the chat as in a list or a question (in tmux, with `set -g
  focus-events on`).
- From 100 columns on, a side panel shows the primary agents by name (a
  click makes one the main agent) and beside them your sticky skills,
  each on (●) or off (◯), a click turning it on or off (under the agents
  when a name won't fit whole beside them), the subagents of this run,
  at work or done (a click shows one's tab), the background jobs (a click
  opens `/background`), the profiles once you have two (a click
  switches; one open in this terminal shows a spinner while it works,
  `?` while it asks you something, `● 2` while only its background jobs
  run), a ChatGPT plan's use, the context and the memory, the MCP
  servers (a click opens `/mcp`), the latest requests refused (a click
  opens `/permissions` on one) and illi's to-do list, gone once every
  item is done or on `/clear`. The `side` and `side_width` settings
  place it.
- The bottom line ends with the mode (a click opens `/mode`):
  `read-only` in the warning color, `yolo` in the error color. Before
  it, the background jobs are counted when the side panel doesn't show
  them.
- The terminal's title says `∞ illi · <project>`, one cell of dots
  going round in the ∞'s place while illi works (`⠋`), `?` while a
  question waits on you (here or in another profile open in this
  terminal); the `title` setting turns it off.
