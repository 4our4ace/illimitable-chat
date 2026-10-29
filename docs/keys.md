Keys and commands
=================

All of these are in illi too: `/help` lists them, and Ctrl+P finds one
by a word. Your own commands and skills are typed as `/name`.

Chat
----

| Key or command | Does |
| -------------- | ---- |
| Enter | send |
| Esc | close a list; else clear the notes, and twice: stop illi and its subagents at work (a `/compact` under way too; background jobs go on: `/background`) |
| Ctrl+C | clear the input; on an empty one, stop illi and its subagents (again: quit); text chosen: copy it again |
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
| `/open #id` | open block #id and keep it open (or click it); a call of a run, by its id or its result's: open it alone (one past five too, kept in view with them) |
| `/close #id` | close block #id and keep it closed (or click anywhere in its frame); a call of a run: shut it (one past five stays counted) |
| `/fold`, Ctrl+F | fold the chat into the fewest blocks; again: unfold |
| Ctrl+Y | copy illi's last reply (a drag copies the text it covers, a double click a word) |
| Ctrl+O | show or hide the work between replies: every call of every run open (its input and result whole, the thinking before it, the agents' reports), every run's calls all listed, what streams, and the recaps under the "Compaction" lines (hidden, a click opens one alone; shown, a click closes one alone; Ctrl+O forgets those clicks, and unfolds what a click folded); on a permission question, its long command all, or folded again |
| `/export` | save this project's memory as ./illi-memory.json |
| `/tree` | save this project's whole memory tree as ./illi-tree.html |
| Ctrl+L | draw the screen again |
| Ctrl+Z | back to the shell, illi's work going on (in every profile open in this terminal; alone, with `ILLI_WINDOW=off`, it waits); fg brings it back |
| `/help` | this list |

Scroll
------

| Key or command | Does |
| -------------- | ---- |
| PgUp, PgDn | half a page up, down, so the half read before stays in view (or the wheel); at the end, the chat follows what comes |
| Ctrl+Home, Ctrl+End | the chat's top, its end |

While a list is open, these keys and the wheel move in it instead; while
a question is, these keys do, and the wheel over it (elsewhere it
scrolls the chat). The chat stays where it was.

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
| `/mcp` | your MCP servers and, on `claude-code`, Claude Code's own: how each is, on or off, the lit one's tools or why it failed; Enter turns one off or on (`off`) |
| `/mode [mode]` | what runs without asking, this session: `default` or `trust`; no mode: opens a list (in `trust` mode, click it on the bottom line too) |
| `/permissions` | the requests refused (Enter allows one again, this session), the approvals saved (Del removes one), your rules |

Projects and profiles
---------------------

| Key or command | Does |
| -------------- | ---- |
| `/projects` | your projects, each a git repo with its own chat (outside any: home), this one first: Enter says more, Del forgets one (Cancel, export a copy first, or forget) |
| `/profile [name]` | switch to that profile (its own chats, on the global setup; one login for all); no name: opens a list to make, rename, export, import or delete one |

Shortcuts
---------

Press the leader, Ctrl+X, then a key: Ctrl+X then m opens
the model list. A list open (a picker, or the commands matched as you
type a `/word`) closes first; a question at the input stays as it is.
While illi waits for that key the screen turns grey; Esc, the leader
again, a click or the wheel lets it go, and a key with no shortcut says
so. Letters work either case.

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
  shell. With Shift they edit the same (Shift+Backspace erases a
  character), but Shift and an arrow change the model and effort.
- A click in your message puts the cursor where it lands, and typing
  goes there: before the character clicked (a wide one by either half);
  past a line's text, after its last character (a line that wraps shows
  the cursor at the start of the next); on the `>` or the indent under
  it, at the line's start; on the rule under the input, at the end; in
  a pasted text's or an image's token, at its nearer edge. A message
  taller than the input scrolls only as the cursor leaves the lines
  shown, so what you click stays put. A drag over it still copies, a
  double click a word; the click that only brings the window to the
  front moves nothing.
- A message wraps between words: a word that would cross the input's
  edge starts the next line whole, and a space that finds no room left
  on its line stays at its end, unshown. No word ends in the line's last
  column unless it fills the line, so the cursor after it shows beside
  it: the word you type up to the edge goes to the next line at once,
  and nothing you type after it moves it back. A pasted text's or an
  image's token counts as one word. A word wider than the input starts a
  line and breaks at any character, as text with no spaces does.
- Shift+Enter or Ctrl+J (Ctrl+Shift+J too): a new line. Up and Down
  past the ends: the messages sent before (not once you moved the cursor
  along what you typed, by a key or a click).
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

`/model`, `/settings`, `/profile`, Ctrl+P and every other list open in
one box in the middle of the screen, as wide as their options (no name
is ever cut), the rest of the screen dimmed. While one is open it has
the keys and the mouse; the chat, the side and the input under it stay
as they are, and the input comes back as you left it when the box
closes.

Questions take the input's place instead: a permission question, illi's
own questions, a confirmation (switch profiles and stop the background
jobs? delete a profile? forget a project?) and a line asked for (a
name, a path, why not). The rule over it says what it asks and its keys
(`── Allow shell? · ↑↓ Enter · Esc no ──`), the rule under it stays, and
it takes half the screen's rows at most (fewer on a short screen), the
chat keeping the rest.
Nothing is dimmed: the chat, the side and the notes stay as they are,
and what you were typing comes back once you answer.

| Key | Does |
| --- | ---- |
| Up, Down (or Tab, Shift+Tab) | move |
| PgUp, PgDn | a page (a question's long lead, where it is cut: half a page) |
| Ctrl+O | a question's long command: show it all, or fold it again |
| Ctrl+Home, Ctrl+End | the first, the last (Home and End too, where you can't type) |
| Enter | pick |
| Esc (or Ctrl+C, Ctrl+D) | close; a question: No |
| typing | search, where the list has one, by name (Ctrl+P's by the words of what each row does too, as `/` does), or the line a question asks; it edits as the input does, and a paste goes there as one line |

- In a list the wheel scrolls it; the row under the pointer lights as it
  moves; a click does what Enter does; a click in its search puts the
  cursor where it lands, as in your message (on a search too long to
  show whole, a click on the `…` goes to where what shows starts); a
  click outside closes it. Shift+drag selects text in it, as the
  terminal does.
- On a question the row under the pointer lights and a click does what
  Enter does. What leads its answers (a command, why it is asked) shows
  whole up to half the screen, then cut, a dim line saying how much more
  (`… 212 more lines · wheel, PgUp/PgDn`): the wheel over it or PgUp,
  PgDn scroll it; the answers always show (on a screen too short for
  both, what leads them gives way). A permission question's long
  command comes folded: its first line, the lines that made illi ask,
  and its last, a dim `… 37 lines` for each stretch left out; a line
  too long for the screen so too by its rows (`… 12 rows`). Ctrl+O
  (the rule says `Ctrl+O all`) or a click on a `… 37 lines` or
  `… 12 rows` line shows all of it; Ctrl+O again (`Ctrl+O fold`) folds
  it. A click in the line a question asks for (a name, a reason) puts
  the cursor where it lands, as in your message. Everywhere else the
  mouse works as with no question: the wheel scrolls the chat, text is
  selected and copied (Ctrl+C with text selected copies it, and doesn't
  answer), the side and the tabs answer; a click outside never answers.
- Ctrl+L, Ctrl+Z and the leader work as ever; Ctrl+P opens the commands
  in a list's place (in its own, closes it), and over a question, which
  is back as the list closes.
- `/model`: Left and Right change the effort (Shift+Up and Shift+Down
  too), Tab the speed; Shift+Left and Shift+Right step the lit model's
  auto compact by 5%, its gauge under the list ("auto compact at", a bar
  of the model's window, its keys shown as Shift + <-/->; the effort's
  as <- and ->). Enter keeps it with the pick, Esc drops it.
- `/settings` (and a setting in Ctrl+P): Enter or Right steps a setting
  to its next value, Shift+Enter or Left back; Del puts its default back
  (in a profile: the global value).

Panes (`/help`, `/agents`, `/mcp` with no servers) open in the chat's place,
on a background of their own: Esc or Enter closes one, the arrows and
the pages scroll it, and typing closes it and goes to the input. A list
opens in a pane's place, closing it; a question takes the input's place
under a pane, which waits for it (the wheel still scrolls it).

When illi asks
--------------

illi may ask you questions with options, up to four at once. They take
the input's place, as every question does, a tab each, who asks in the
rule over them, the input you were typing kept for after them:

- Up and Down move, Space picks an option (one, or several where the
  question says "pick any"; ● marks what you picked), and typing writes
  words of your own: beside the options picked, or instead of them.
- Enter picks the option you're on and goes to the next question; Tab
  and Shift+Tab (Left and Right, off your words) switch tabs. PgUp and
  Ctrl+Home go to the first option, PgDn and Ctrl+End to your words.
- A click on an option picks it (one: and goes on; several: on or off),
  on a tab goes there, on your words' row puts you there, the cursor
  where it lands.
- They keep one height, their tallest tab's, so the chat stays put as
  you switch tabs. Taller than half the screen, the tabs and keys stay
  and the rest scrolls, with the option you're on, or by the wheel over
  it.
- The last tab, Review, shows all your answers: Enter sends them, Esc
  (or Ctrl+C, Ctrl+D) skips the questions. Your answers then show in
  the chat as yours.

A call the permission checks stop ([Permissions](permissions.md)) asks
at the input: why, and what it would do (a command by its lines; a
long one folded to the lines that matter, Ctrl+O for all), then
Yes; Yes, and don't ask again (only where it saves something, which it
names); No (which also stops the turn); No, and say why (a line typed,
which illi reads, and goes on). Up and Down move, Enter or a click
picks, Esc is No. A subagent's question names it.

A question that has just appeared takes no Enter, Space or click for
half a second, so a key or a click meant for the chat doesn't answer it;
Esc works at once.

The first time illi starts in a folder, it asks full screen whether you
trust it, with two buttons, No lit first: Left and Right (or Up, Down
and Tab) move between No and Yes, Enter takes the lit one, `y` and `n`
pick one, Esc (or Ctrl+C, Ctrl+D) exits. The pointer over a button
lights it (Enter then takes that one); a click takes a button pressed
and let go on it, never one that slips off it, nor the click that only
brings the window to the front.

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

Related
-------

While illi works, a small search runs over the whole chat after each
step (your message, each round of tool results, the turn's end) and
shows past topics that may be related in the side panel's Related
section: up to 4 lines, each how long ago it ended, its summary and its
id (`#1234+16`: the 16 messages from #1234). It reads the chat's own
index of its summaries, on a thread of its own: no model call. What
illi already sees in detail (the recent messages, and those its view
holds one by one) is left out, and so is what you dismissed. The list
holds still while you read it: a new line joins at its foot, and a line
leaves only once it has gone unmatched for a while, or for one far
stronger, one at a time (one you opened or pinned stays till your next
message, then goes the same way).

- A click on a line opens it at full detail: its messages whole, in a
  pane over the chat (Esc closes it).
- A click on its id pins it: the id goes into your message, naming that
  episode; illi can zoom it.
- A click on the head lists them: Enter opens one, Tab pins its id, Del
  dismisses it (until illi quits; illi isn't given it either).

Without the side panel, the bottom line counts them (`3 related`, a
click lists them).

Only strong matches reach illi itself, and not again while illi still
holds one in full (once it folds into the view's summary lines, it may
be given again). As
each of its tool calls runs (a command, a file read or changed, an MCP
or plugin tool; a subagent's too, but one started fresh, which gets
nothing of the chat), the same search runs beside it. A
line it finds is added after the call's result, as one line, only if:

- it matched a path or an error's name, with something else besides;
- it scored high enough;
- nothing illi holds in full already names it (a pin, a zoom, a line
  given before);
- illi's view doesn't already sum up that stretch as finely (in lines
  of 16 messages or fewer).

The line is `<history>#1234+16 · 3d ago · its summary</history>`, for
illi to zoom if it helps. You never see that line in the result's box:
the Related lines are where you see what was found. At most one goes
with a round of tool calls. It never makes a call slower: if the search
hasn't answered a few milliseconds after the tool is done, nothing is
added to that call (a later call of the same round, a slower one, may
still take what it found). A line you dismissed is never given.

How high is high enough starts strict and then follows you. Once you
have opened or pinned 20 lines that matched a path or an error, the bar
moves to where the lowest quarter of those lines scored, never below a
floor. The memory tools (zoom, search, date) and illi's own steps
(todo, a subagent started or told) never get a line. On the
`claude-code` provider, Claude Code runs its own files and shell, so
only the MCP and plugin tools illi serves it get one.

The `related` setting is `on` (the side, and the strong lines given to
illi), `screen` (the side only) or `off`.

Mouse and side panel
--------------------

- A click on a block opens it; a click anywhere in an open block's frame
  closes it. A drag copies the text it covers, a double click a word,
  three a line. A reply's code, lists, tables, diagrams, quotes and
  alerts have copy buttons: a click copies, though the pointer slips on
  the button before it's let go (a drag off it chooses text). Copying
  uses OSC 52, so the terminal (and tmux) must allow it.
- A click in your message puts the cursor there ([Typing](#typing)), on
  an agent's page too; a drag over it still copies. A click in a list's
  search, the line a question asks for or your words to illi's
  questions puts the cursor there too.
- The work between replies (tool calls, results, thinking, agents'
  reports) shows as a run ([Design language](design.md#runs)): a line
  saying what was done, then its calls, one line each, what each did in
  plain words and how it ended (`✓ Run the tests · exit 0`): `✓` done,
  `✗` failed, blank when no result came with it (a call stopped before
  it answered; a web search by OpenAI's or ChatGPT's models from before
  illi 0.3.1). A report, or a thought or a result with no call, is a
  line of its own. A stop answers a call illi's own tools are running,
  as failed; one Claude Code is running gets no answer. A click on a
  call's line opens that call alone, under it behind a bar: the thinking
  before it, its whole input, its whole result; its siblings stay shut.
  A click on its line again, anywhere down its bar, or anywhere in it
  shuts it. The run's own line takes no click. Past five calls, a
  `+3 more` line under them (while the run is at work, the newest five
  under a `+3 earlier` line; a call you opened stays in view, counted
  no more; it counts two at least, so a run of six shows all six): a
  click shows them all, and on the line, now `show fewer`, five again. A recap's "Compaction" line opens and
  closes the recap; inside, a click on a page folds it to one line
  (`recap · 40 lines`), and a click on that line unfolds it. What you
  clicked stays under the pointer (at the chat's end a close lands
  lower, as the chat can't scroll past its end).
- A click on a word waits a moment before it acts, so a double click
  still copies the word (one inside an open call too: a command, a
  result). Past a line's end, on a blank line or a frame's edge, on a
  call's line or its bar, on a `+3 more` line, on a recap's line, on a
  folded page's `[+]`, on a block's `/open` or an open block's top edge,
  it acts at once. A second click on the same spot right after does
  nothing, so a slow double click never undoes the fold; nor does a
  click waiting on what was opened or shut otherwise meanwhile.
- What a click would act on lights as the pointer moves over it: a
  call's line, and an open call's whole bar, heavier; a `+3 more` line;
  a recap's line and its bar; a page's bar beside it (and a folded
  one's `[+]`); a block's `/open`, an open block's top edge. It goes as
  you type, as the chat moves on by itself, and as the window loses the
  focus. While text you chose shows, nothing lights: a click then only
  lets the text go, and folds nothing.
- A drag with the right button over the chat quotes what it covers in
  your message, each line after `> `, to reply to it; a right click
  within 5 seconds takes the quote out again. A reply's buttons are left
  out of what's quoted or copied, and a right drag never starts on one.
- The wheel scrolls the chat, a pane, or the list open; over a question,
  its lead (or illi's questions' lines), where they are cut.
- The click that only brings the terminal's window to the front does
  nothing, in the chat as in a list, a question or the trust question
  (in tmux, with `set -g focus-events on`). On a reply's copy button it copies all the same, so
  after pasting elsewhere, the next copy takes one click.
- From 100 columns on, a side panel shows the primary agents by name (a
  click makes one the main agent) and beside them your sticky skills,
  each on (●) or off (◯), a click turning it on or off (under the agents
  when a name won't fit whole beside them), the subagents of this run,
  at work or done (a click shows one's tab), the background jobs (a click
  opens `/background`), the profiles once you have two (a click
  switches; one open in this terminal shows a spinner while it works,
  `?` while it asks you something, `● 2` while only its background jobs
  run), your plan's use (ChatGPT's or Claude's, once it has told it),
  the context and the memory, past topics related to the work
  ([Related](#related)), the MCP servers, Claude Code's own under a line
  of their own while the pick is on `claude-code` (a click opens `/mcp`
  on one), the
  latest requests refused (a click opens `/permissions` on one) and illi's
  to-do list, gone once every item is done or on `/clear`. The `side`
  and `side_width` settings place it.
- The bottom line ends with `trust mode` in the error color while
  that mode is on (a click opens `/mode`). Before it, the background
  jobs are counted when the side panel doesn't show them, and before
  those the related lines when there is no side panel.
- The terminal's title says `∞ <project> · illi`, one cell of dots
  tracing a figure of eight in the ∞'s place while illi works (`⠋`),
  `?` while a question waits on you (here or in another profile open
  in this terminal); the `title` setting turns it off.
