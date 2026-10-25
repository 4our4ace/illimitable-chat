Design language
===============

How illi looks and reads on the screen: its marks, how it shows keys,
its words. A draft: nothing here is final, it fills out as choices are
made, and a choice that proves wrong changes here first, then in the
code. The marks are illi's defaults; each one in `GLYPH`
(`src/ui/Theme.ts`) can be set in `theme.json` ([Customize](customize.md)).

Rules
-----

- **Words before marks.** A mark must read without a legend. Where a
  word fits, use the word; a mark only where terminals commonly use it.
- **ASCII where a mark means something to do**: arrows, open and shut,
  the lit row. Every font draws ASCII at full size and one column wide.
- **No small triangles** (`▸ ▾ ▴ ◂ ▶`, nor `› ‹ ❯`). They shrink to
  dots in many fonts, and terminals disagree on their width.
- **No emoji** in anything illi draws (tool headers, notes, the side,
  the title). Terminals give them one column or two, and they read as
  noise. A reply keeps what the model writes.
- **Ink by role, never by hue.** Dim is there but not the point; the
  accent is what acts or is lit; bold is names and keys. Color comes
  only from the tokens (`accent`, `success`, `warning`, `error`), so a
  theme changes all of it.
- **Numbers, not nagging.** illi shows what something costs (the
  window, the tokens, the plan's limits) and leaves the choice to you.
  It doesn't warn about costs a provider sets.

Marks
-----

| Mark | Means | Where |
| ---- | ----- | ----- |
| `[+]` | shut: a click opens it (`GLYPH.shut`) | a recap's line, a page folded in a recap, the side's to-do folded |
| `[-]` | open: a click shuts it (`GLYPH.open`) | an open recap's line, the side's to-do shown whole |
| `•` | a run of work (`GLYPH.run`) | the line over a run's calls ([Runs](#runs)) |
| `>` | the lit row: Enter picks it (`GLYPH.lit`) | lists, questions, the trust question, the commands suggested |
| `> ` | the message you type (`GLYPH.input`) | the input, your words in a question, a line a question asks for |
| `>` | the to-do item at work (`GLYPH.active`) | the side's to-do, the todo tool |
| `□` `■` | to do, done; an option among several | the to-do; a question that takes several |
| `○` `●` | an answer, the one lit (the answer Enter gives) or picked (`GLYPH.option`, `GLYPH.here`) | every question that takes one (the permission question, a confirmation, illi's own); the picks on the questions' Review tab |
| `◯` `●` | one of a set, the one in use (`GLYPH.tab`, `GLYPH.here`) | the tabs; the model, agent, profile, mode or project in use in a list; the side's agents, sticky skills (on, off) and profiles |
| `●` | running (success) | background jobs, MCP servers ready |
| `◌` | starting | MCP servers at the side |
| `✓` `✗` | done, failed (`GLYPH.ok`, `GLYPH.failed`) | a run's calls (`✓` dim, `✗` in the error's color); `✓` a subagent at the side, a question answered (its tab); `✗` an MCP server, a refused request |
| `<-` | back | the side's way back from an agent's page |
| `·` | between the parts of one line | everywhere |
| `…` | cut here | any text cut to fit; the lines a folded command leaves out (`… 37 lines`; a long line's rows, `… 12 rows`: a click shows them); a command's first line when more follow |
| `+3` | that many more, not shown | a run's calls past five (`+3 more`, `+3 earlier`: a click shows them); a web search's queries past the first (`Searched "bun test" +2`); an edit's files past two, in words (`Edited a.ts, b.ts and 3 more`), so the count never reads as lines added |
| `│` | an open call's rows, an open recap's (lit, `┃`: a click there shuts it) | the chat |
| `─ ╭ ╮ ╰ ╯` | frames and rules | popups, the commands suggested, messages and open blocks in the chat; panes, and the input (or a question in its place, its title in the rule over it) between rules |
| `█ ▌ ░` | a gauge: full, half, empty | the auto compact in `/model` |
| `█` | a bar: the share used (in the accent; warning past 70%, error past 90%), the rest dim | the side's context and plan use |
| `∞` traced in braille dots | illi at work | the work line |
| a braille cell, three of its six dots tracing a figure of eight | illi at work | the title, the side's subagents and profiles at work |
| `⌕` | search | a list's search line |
| `↓` | the chat's end; tokens written | Jump to Bottom; the work line |
| `[ ⧉ copy ]` | a button: a click copies (`⧉ md`, `⧉ art`, `⧉ source`, `⧉ copy reply`) | over or beside a reply's lists, tables, code, diagrams, quotes and alerts; a reply's end |
| `•` `◦` | a list's item, one nested deeper | replies |
| `[✓]` `[ ]` | a task done, to do | replies' lists |

Runs
----

The work between your words and illi's reply (its tool calls, their
results, its thinking, the agents' reports) shows as a run: one dim
line saying what was done, then its calls, a line each, what each did
in plain words, then how it ended:

```
• Ran 3 commands, read a file · thought
  ✓ List the files in src · exit 0
  ✓ Read src/ui/View.ts · 1,204 lines
  ✗ Run the tests · exit 1
  ✓ Check git status · exit 0
```

- **The line** says what was done, counted by tool (`Ran 3 commands`,
  `Searched the web`; Claude Code's tools as illi's alike, or in words
  of their own: `Searched the code 3 times`; any other tool,
  `Called github: get_issue`; a call summed up before its message is
  known, `Used a tool`), then `thought`, then the agents that reported
  (a run of results alone, `Got 2 results`). It takes no click: each
  call does.
- **A call's line** is `✓ <what it did> · <how it ended>`: `✗` in the
  error's color for one that failed, blank for one with no result (a
  call stopped before it answered). What it did is the shell call's
  `description` (the model gives it, in five to ten words), else the
  command's first line (a leading `cd <dir> &&` left out, `…` when more
  lines follow); a file tool's file (`Read src/a.ts, lines 40-79`,
  `Edited a.ts, b.ts`); a web search's query, page or text looked for
  (`Searched "bend"`, `Opened example.com/path`, `Found "x" in page`);
  illi's own tools in words (`Searched memory for "auto compact"`,
  `Looked back at #123`, `Started FireAnt`, `Updated the to-do list`); an
  MCP server's or a plugin's tool as `server: tool` and its first
  telling value; any other tool, or one whose input lacks the field its
  words are about, its name and its most telling short value; a call
  logged not as `name {input}`, its first line. How it ended: a
  command's exit (`exit 0`, `exit 2`, `stopped`, `killed by SIGKILL`,
  `killed by signal 34`), a read's lines, a change's lines (`+12 -3`),
  `failed`; nothing where the mark says all. Never a raw input: what
  doesn't fit is cut, the outcome kept whole (with no room for what it
  did, the outcome alone).
- **A click on a call** opens it alone, under its line behind a bar:
  the thoughts that led to it, its whole input (the whole command, every
  query, the URL), its whole result. Its siblings stay shut; a click on
  its line, its bar or anywhere in it shuts it. A report, or a thought
  or a result with no call, is a line of its own the same way.
- **Past five calls** a line counts the rest (`+3 more`, under the
  first five); while the run is at work it shows the newest five, the
  count over them (`+3 earlier`). A call opened alone (a click, `/open`)
  stays in view with them, counted no more. The line counts two at
  least: a run of six shows all six. A click on it shows them all (it
  then reads `show fewer`), again five.
- Ctrl+O opens every call of every run, and shows what streams; a click
  then shuts one alone.
- An agent's page shows its work the same way.

Replies
-------

illi's replies are markdown drawn (`src/ui/Reply.ts`): headings boxed
or ruled, lists hung under their bullets, tables boxed (too narrow for
a box, a record a row), alerts in a round box of their color, quotes
behind a bar, Mermaid diagrams drawn (one that won't draw stays code),
tables and diagrams side by side while they fit. Code is read in 40
languages (Prism; a shell's by illi), every kind of token colored: by
the palette's slots, or, the terminal's background unknown, by its own
colors (`syntax` in [Customize](customize.md)); a diff's lines green and
red, as every diff's.

Keys
----

- Left and right show as `<-` and `->`: `Shift + <-/->`,
  `effort: <- high ->`, `<- -> Enter change`.
- Other keys by the name on the key: Enter, Esc, Tab, Space, PgUp,
  Ctrl+P, Shift+Enter.
- Up and down show as `↑↓` for now (open, below).
- A box's keys sit on its edge, after its title, ` · ` between them:
  `Model · ↑↓ Enter · Esc`.
- The docs name keys as words (Left, Shift+Right), the screen as above.

Words
-----

- Names lowercase: illi, illimitable.
- Say what happens, in plain words: "auto compact at 60%", not
  "autocompact"; "the chat's window isn't known yet", not an error code.
- Short: a hint is a few words, a note a sentence or two.

Open
----

- `↑↓` in the keys: keep them, or words (`Up/Down`)?
- `⌕` before a search, `↓` on Jump to Bottom and before the tokens.
- `□ ■ ○ ● ◯`: keep the shapes, or ASCII (`[ ] [x] ( ) (*)`)?
- The to-do's `>` at work beside `□` and `■`.
