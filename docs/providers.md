Providers
=========

illi runs on your ChatGPT plan, your Claude plan (through your own
Claude Code), or Anthropic and OpenAI API keys. Each is a vendor; name
the ones you use in `~/.illi/config.json`.

ChatGPT plan
------------

In the chat, type `/login` to sign in with ChatGPT Plus or Pro: illi
opens OpenAI's page in your browser and shows a code to enter there (it
is in your clipboard too), then keeps and renews the login itself. The
browser is your system's: on WSL Windows' default, asked through
`rundll32.exe url.dll,FileProtocolHandler` (which some security tools
flag); `BROWSER` picks another, and `BROWSER=none` opens none. Over SSH,
or with no display, the link is only shown. An existing [opencode](https://opencode.ai) login is picked up
as it is. `chatgpt` is the default vendor.

The side's Usage shows the plan the login is on and how much of its
limits is used, once ChatGPT has told it (nothing shows before), both
asked of ChatGPT together (as Codex's `/status` does) when illi
starts, after `/login` and `/logout`, and when the login changes on
disk (another terminal's `/login`, or `opencode auth login`; looked at
every few seconds), then kept current by each reply. They are
always the account's in use: a new login drops the old one's usage at
once.

Claude plan
-----------

For Claude Pro or Max, install [Claude Code](https://code.claude.com)
and log in there (`claude`, then `/login`); then name it as a vendor:

    { "vendors": "chatgpt,claude-code" }

illi then runs Claude Code itself, as it ships, on your login:

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
  the `claude mcp login` command for it), while the pick is on
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
  own calls ([Permissions](permissions.md)): routine work runs, a risky
  call is asked about at illi's screen, saying why, and your rules and
  grants apply.
- **illi's memory, not Claude Code's compaction**: a turn runs with
  Claude Code's own compaction off. When a long turn fills the window,
  illi folds more of the chat into its tree and goes on where it was,
  as on the other providers, so nothing is squashed into Claude Code's
  summary. A subagent keeps Claude Code's compaction.
- **Summaries run with nothing extra**: `claude -p` calls with no tools,
  MCP servers, commands or hooks.
- **Your plan's use at the side**: the Usage section shows how much of
  your 5-hour and weekly limits is used and when each resets, as each
  reply tells it (Claude Code names no plan, so none is named). When a
  limit is reached, illi says when it resets.

API keys
--------

Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, and name the vendor:

    { "vendors": "claude-api" }

Both run in illi's own loop, with no SDKs.

Models
------

illi's pick and the summaries' default to the first vendor's models:

| Vendor        | Pick         | Summaries   |
| ------------- | ------------ | ----------- |
| `chatgpt`     | gpt-6.1-sol  | gpt-6-luna  |
| `openai-api`  | gpt-6.1-sol  | gpt-6-luna  |
| `claude-code` | opus-5.5     | haiku-5.5   |
| `claude-api`  | sonnet-5.5   | haiku-5.5   |

To choose them, or list more vendors (the first gives the defaults):

    {
      "vendors": "claude-api,chatgpt",
      "pick": "claude-api:opus-5.5:high:slow",
      "compactor": "claude-api:haiku-5.5:medium:slow"
    }

`ILLI_VENDORS=claude-api illi` tries it without a file; `/set vendors
claude-api` in the chat works from the next start. `/model` picks the
model, its effort and speed per chat.

Each vendor tells illi its models, kept in `~/.illi/models.json` for the
next start:

| Vendor        | What it tells                                                    | When                                   |
| ------------- | ---------------------------------------------------------------- | -------------------------------------- |
| `chatgpt`     | the models your account may use, each one's window, efforts and speeds | at start, after `/login` and `/logout`, when the account changes; every 5 minutes while it doesn't answer |
| `claude-api`  | each model's window (Anthropic's Models API)                     | at start                               |
| `claude-code` | the window of the model a reply ran on                           | after each reply                       |
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
200k).

How much of the window a turn sends is each model's auto compact
([Config](config.md)): `/autocompact` sets it for the chat's model, and
`/model` shows it ("auto compact at") for each.

The vendors never mix: a chat's summaries and subagents run on its own
vendor's models. `compactor` and `agents` take one pick per vendor,
comma-separated, and a chat uses its own vendor's. All settings are in
[Config](config.md).
