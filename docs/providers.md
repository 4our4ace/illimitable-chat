Providers
=========

illi runs on your ChatGPT plan, your Claude plan (through your own
Claude Code), or Anthropic and OpenAI API keys. Each is a vendor.

Connecting: /login
------------------

Type `/login` in the chat (`/logout` opens the same screen). It lists
the providers, **ChatGPT** and **Claude**, each saying what of it is
connected, the one the chat runs on marked. Enter on one opens its two
ways in: its plan (**ChatGPT plan**, **Claude plan**) and an API key
(**OpenAI API key**, **Anthropic API key**), each saying what it's
connected with. Esc goes back a level, from every list and question
`/login` opens:

- **Enter on a way in not connected** connects it: a sign-in for a
  plan, a key for an API.
- **Enter on one connected** opens its accounts, the one in use marked.
  Enter on another switches to it, at once and in every illi you have
  open; Del logs one out (asked first); `+ add another …` connects one
  more, which is then the one in use; the last row logs out of the
  provider (asked first).

What you connect is offered at once (`/model` lists its models), and
what you log out of is gone at once: a chat on it moves to another
provider's default model, saying so (a turn running finishes first).
Every profile shares the same accounts. illi keeps them in
`~/.illi/accounts.json`, readable by you alone; a profile you export
leaves it out, with the logins and Claude Code folders below
([Profiles](profiles.md)). The `vendors` setting, if you set it, names
the vendors offered instead ([Config](config.md)); `/login` then says
when it leaves out one you connected.

With nothing connected illi offers `chatgpt`, and the chat says
`/login` connects a provider.

ChatGPT plan
------------

Pick **ChatGPT**, then **ChatGPT plan**, in `/login` to sign in with
ChatGPT Plus or Pro:
illi opens OpenAI's page in your browser and shows a code to enter
there (it is in your clipboard too), then keeps and renews the login
itself. The browser is your system's: on WSL Windows' default, asked
through `rundll32.exe url.dll,FileProtocolHandler` (which some security
tools flag); `BROWSER` picks another, and `BROWSER=none` opens none.
Over SSH, or with no display, the link is only shown.

Each account shows by its email and plan. **+ add another account**
signs in to one more. The account in use is in illi's login file
(`~/.illi/login.json`, or the file the `login` setting names); the
others wait in `accounts.json`. A switch puts the account you pick in
the login file and keeps the one that was there, its login as last
renewed, so each renews in its turn. Logging out of the account in use
moves to the next one.

An existing [opencode](https://opencode.ai) login (`opencode auth
login`) is one of the accounts and is used while illi has no login of
its own. Del on it leaves it to opencode: illi stops using it, and
opencode stays signed in. `/login` offers to connect it again. Logging
out of ChatGPT forgets illi's own logins and leaves opencode's to
opencode, and ChatGPT is no longer offered.

The side's Usage shows the plan the login is on and how much of its
limits is used, once ChatGPT has told it (nothing shows before), both
asked of ChatGPT together (as Codex's `/status` does) when illi
starts, after `/login` and `/logout`, and when the login changes on
disk (another terminal's `/login`, or `opencode auth login`; looked at
every few seconds), then kept current by each reply. They are
always the account's in use: a new login, or a switch, drops the old
one's usage at once.

Claude plan
-----------

For Claude Pro, Max, Team or Enterprise, install [Claude
Code](https://code.claude.com), then pick **Claude**, then **Claude
plan**, in `/login` (without Claude Code installed, `/login` says so).
If Claude Code is logged in, illi offers its login, or a sign-in to
another account; if it isn't, the sign-in logs your own Claude Code
in. illi signs in through Claude Code itself: Claude Code opens
Claude's page in your browser (illi shows the link too), and you paste
the code the page shows into illi, where it shows as dots. Esc there
stops the sign-in.

Each account shows by its email and plan:

- **Your own Claude Code's**: the login in your Claude Code folder
  (`~/.claude`, or the one `CLAUDE_CONFIG_DIR` names). Del makes illi
  stop using it; Claude Code stays logged in.
- **Another account** (**+ add another account**) gets a Claude Code
  folder of its own, `~/.illi/claude/<id>`, as Claude Code keeps one
  login per folder (on macOS, one Keychain entry per folder). That
  folder is a separate Claude Code: your main one's settings, MCP
  servers, plugins and `CLAUDE.md` aren't in it. Del logs it out and
  removes the folder.

The account you pick is the one illi's calls run on. The side's Usage
and Claude Code's MCP servers (below) are that account's: a switch
drops the other account's until a call tells them. Logging out of the
Claude plan logs illi's own folders out and removes them; your own
Claude Code stays logged in.

illi then runs Claude Code itself, as it ships, on the account's login:

- **Claude Code's own prompt and tools** (its shell, files, search), with
  illi's added through MCP: zoom into the memory, the date, subagents,
  messages to them, the to-do list and skills. An agent's `tools:`
  limits both: `tools: zoom, Read, Grep` gives that agent illi's zoom
  and, of Claude Code's built-in tools, Read and Grep alone. Of Claude
  Code's own MCP servers (below), it keeps only those it names:
  `mcp__github` keeps that one, `mcp__github__get_issue` that tool of
  it, `mcp` all; naming none of them, or only ones turned off or run by
  illi itself, it loads none. illi leaves the others out by name: those
  it has seen (below). One it has never seen, as one just added to
  Claude Code, loads in one call, which shows it to illi, and so does
  the whole of a server named by its tools alone until illi has seen
  its tools: that call may carry more than the list names. Claude
  Code's plugins stay, their MCP servers counted among its own.
- **Your token stays with Claude Code.** illi never sees it, and its
  turns stay out of Claude Code's session history.
- **Your Claude Code setup applies**: its permission rules, MCP servers
  and plugins. Its hooks are turned off inside illi's calls: your
  `~/.illi/hooks.json` is the one that runs
  ([Customize](customize.md#hooks)). A project's `CLAUDE.md` is Claude
  Code's to read, so illi doesn't add it again.
- **Claude Code's MCP servers in illi**: those you added to Claude Code
  (`claude mcp add`, its plugins', claude.ai connectors) load in illi's
  calls beside illi's own. illi learns them from the first call that
  loads them, and `/mcp` and the side show them from then on, in the
  terminal whose illi holds the chat, each marked as Claude Code's, how
  it is and its tools (none show before; one that needs a login names
  the `claude mcp login` command for it; the side counts those not
  connected, a login needed or still pending, in one line, `+ 17 more
  not connected`, which opens `/mcp`), while the pick is on
  `claude-code`: on another vendor, whose calls don't load them, they
  don't show (the `off` setting's list still names them).
  `off`, or Enter on one in `/mcp`, takes one out of illi's calls by its
  name as `/mcp` lists it, from the next call: Claude Code still starts
  it, but its tools leave the model's context, so they cost no tokens,
  and Claude Code itself is never changed. Being by name, it turns off a
  server of illi's own by that name too, from illi's next start (`/mcp`
  says so on both). While illi runs a server of its own by the same
  name, illi's alone reaches the model (failed, Claude Code's stays), so
  the model gets one copy. illi keeps the names it has seen
  (`claude-code.json`), so `off` and an agent's `tools:` take one out
  from the first call after a start too (one it has never seen loads in
  one call, which shows it).
- **Permission prompts come to illi.** When Claude Code wants to run
  something its settings don't allow, illi checks it as it checks its
  own calls ([Permissions](permissions.md)): what stays in the project
  runs, a folder outside it is asked about at illi's screen, saying
  why, and your rules and saved approvals apply.
- **The whole window**: as soon as the plan is connected, and at each
  start, illi asks Claude Code each model's window, sending no message
  (1M on a plan with long context). A turn gets all of it, as Claude
  Code's own compaction, which would stop at its autocompact window
  (500k of Opus's 1M), is off.
- **illi's memory, not Claude Code's compaction**: a turn runs with
  Claude Code's own compaction off. When a long turn fills the window,
  illi folds more of the chat into its tree and goes on where it was,
  as on the other providers (`autocontinue`: [Config](config.md)), so
  nothing is squashed into Claude Code's summary. A subagent runs with
  it off too: when its context fills, it writes a recap of its own work
  and goes on from it ([Customize](customize.md)).
- **Kept for the next turn**: illi asks Anthropic to keep the chat it
  sends at hand, so the next turn finds it there, quick and cheap, and
  only what is new is read in full. Claude Code asks the same for parts
  of each request, and now and then (after an advisor call, say) the
  two together ask for more than Anthropic allows, so it refuses the
  request (in its words, "A maximum of 4 blocks with cache_control").
  illi then goes on where it was without its own ask, its note saying
  only that the request was refused over a technical limit and nothing
  is lost, and the next turn asks again (`autocontinue` off: the note
  says your next message goes on). That one step may still find the
  chat kept from before, but after a long run of work it reads the
  whole chat anew, once.
- **Summaries run with nothing extra**: `claude -p` calls with no tools,
  MCP servers, commands or hooks.
- **Your plan's use at the side**: the Usage section shows how much of
  your 5-hour and weekly limits is used and when each resets, as each
  reply tells it (Claude Code names no plan, so none is named). When a
  limit is reached, illi says when it resets.

API keys
--------

In `/login`, pick **Claude**, then **Anthropic API key**, or
**ChatGPT**, then **OpenAI API key**, and paste a key. It shows as
dots, and illi checks it with the provider before taking it (a key the
provider refuses isn't kept). illi keeps a pasted key in
`accounts.json` and shows it only by its ends (`sk-ant-…WXYZ`): never
in the chat, a note or the input's history. If `ANTHROPIC_API_KEY` or
`OPENAI_API_KEY` is set, `/login` offers that key; illi never copies
it, so it only lasts while the variable is set.

Once connected, the variable's key is listed with the keys you pasted.
**+ add another key** adds a key; Enter on one switches to it, and Del
forgets a pasted one. Forgetting the last pasted key while it's in use
logs out of the API (asked first): illi never moves to the variable's
key without asking, so Enter connects it again if you want it. **Log
out of …** stops the API altogether. Both APIs run in illi's own loop,
with no SDKs.

Models
------

illi's pick and the summaries' default to the first vendor's models:

| Vendor        | Pick         | Summaries   |
| ------------- | ------------ | ----------- |
| `chatgpt`     | gpt-6.1-sol  | gpt-6-luna  |
| `openai-api`  | gpt-6.1-sol  | gpt-6-luna  |
| `claude-code` | opus-5.5     | haiku-5.5   |
| `claude-api`  | sonnet-5.5   | haiku-5.5   |

The vendors offered are those you connected, ChatGPT first, then the
others in the order you connected them. To choose the models, or to
name the vendors yourself (the first gives the defaults):

    {
      "vendors": "claude-api,chatgpt",
      "pick": "claude-api:opus-5.5:high:slow",
      "compactor": "claude-api:haiku-5.5:medium:slow"
    }

`ILLI_VENDORS=claude-api illi` tries it without a file; `/set vendors
claude-api` in the chat applies at once, and `/set vendors default`
goes back to what `/login` connected. `/model` picks the model, its
effort and speed per chat.

Each vendor tells illi its models, kept in `~/.illi/models.json` for the
next start:

| Vendor        | What it tells                                                    | When                                   |
| ------------- | ---------------------------------------------------------------- | -------------------------------------- |
| `chatgpt`     | the models your account may use, each one's window, efforts and speeds | at start, after `/login` and `/logout`, when the account changes; every 5 minutes while it doesn't answer |
| `claude-api`  | each model's window (Anthropic's Models API)                     | at start, after `/login`               |
| `claude-code` | each model's window, as Claude Code has it for a turn (asked, no message sent); the window of the model a turn's reply ran on | at start, after `/login`; after each turn's reply |
| `openai-api`  | nothing: its windows are built in (1.05M)                        |                                        |

On ChatGPT the list is your account's own: a model it adds is offered
at once (unless `models` names those offered), one it drops is gone. A
model's window is exactly what Codex's model list says is the most your
account may use (`max_context_window`, else `context_window`), and the
share of it a request may fill is its
`effective_context_window_percent` (95% where the list leaves it out,
as Codex takes it): illi has no ChatGPT window of its
own and never guesses one. Nothing is folded at the start till the
list answers. A turn (or a subagent) waits a few seconds for it, then
goes on the windows it told last (kept in `models.json`); on a model it
never told a window for, it waits for the list longer, and if there is
still none, it says so and sends nothing. Past a model's usual window
(`context_window`) a plan may count usage differently; that's yours to
weigh. If your account refuses a chat that long at a turn's start, illi
keeps to the usual window for that model from then on. A pick whose
effort or speed the model doesn't have runs at the nearest one it has.
The other vendors' windows are built in until they tell (Claude Code's:
200k, which it tells right away: 1M on a plan with long context).

How much of the window a turn sends is each model's auto compact
([Config](config.md)): `/autocompact` sets it for the chat's model, and
`/model` shows it ("auto compact at") for each.

The vendors never mix: a chat's summaries and subagents run on its own
vendor's models. `compactor` and `agents` take one pick per vendor,
comma-separated, and a chat uses its own vendor's. All settings are in
[Config](config.md).
