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
| `[+]` | shut: a click opens it (`GLYPH.shut`) | a run of work's head, a recap's line, a message folded in a run, the side's to-do folded |
| `[-]` | open: a click shuts it (`GLYPH.open`) | an open run's head, an open recap's line, the side's to-do shown whole |
| `>` | the lit row: Enter picks it (`GLYPH.lit`) | lists, questions, the trust question, the commands suggested |
| `> ` | the message you type (`GLYPH.input`) | the input, your words in a question, a line a list asks for |
| `>` | the to-do item at work (`GLYPH.active`) | the side's to-do, the todo tool |
| `□` `■` | to do, done; an option among several | the to-do; a question that takes several |
| `○` `●` | an option, the one picked | a question that takes one; the picks on the questions' Review tab |
| `◯` `●` | one of a set, the one in use (`GLYPH.tab`, `GLYPH.here`) | the tabs; the model, agent, profile, mode or project in use in a list; the side's agents, sticky skills (on, off) and profiles |
| `●` | running (success) | background jobs, MCP servers ready |
| `◌` | starting | MCP servers at the side |
| `✓` `✗` | done, failed | `✓` a subagent at the side, a question answered (its tab); `✗` an MCP server, a refused request |
| `<-` | back | the side's way back from an agent's page |
| `·` | between the parts of one line | everywhere |
| `…` | cut here | any text cut to fit |
| `│` | an open run's rows (lit, `┃`: a click there opens or closes the run) | the chat |
| `─ ╭ ╮ ╰ ╯` | frames and rules | popups, the commands suggested, messages and open blocks in the chat; panes and the input between rules |
| `█ ▌ ░` | a gauge: full, half, empty | the auto compact in `/model` |
| `█` | a bar: the share used (in the accent; warning past 70%, error past 90%), the rest dim | the side's context and plan use |
| `∞` traced in braille dots | illi at work | the work line |
| a braille cell, its dots going round | illi at work | the title, the side's subagents and profiles at work |
| `⌕` | search | a list's search line |
| `↓` | the chat's end; tokens written | Jump to Bottom; the work line |

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
