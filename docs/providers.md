Providers
=========

illi runs on your ChatGPT plan, your Claude plan (through your own
Claude Code), your Google AI plan (through Google's Antigravity agent),
or Anthropic and OpenAI API keys. Each is a vendor.

Connecting: /login
------------------

Type `/login` in the chat (`/logout` opens the same screen). It lists
the providers, **ChatGPT**, **Claude** and **Gemini**, each saying what
of it is connected, the one the chat runs on marked. Enter on one opens
its ways in: its plan (**ChatGPT plan**, **Claude plan**, **Google AI
plan**) and, for ChatGPT and Claude, an API key (**OpenAI API key**,
**Anthropic API key**), each saying what it's connected with. Esc goes back a level, from every list and question
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
leaves it out, with the logins and the Claude Code and Antigravity
folders below
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
itself. The code is good for 15 minutes, and illi waits for it till
then; Esc stops waiting. The browser is your system's: on WSL Windows'
default, asked through `rundll32.exe url.dll,FileProtocolHandler`
(which some security tools flag); `BROWSER` picks another, and
`BROWSER=none` opens none. Over SSH, or with no display, the link is
only shown.

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
the code the page shows into illi, where it shows as dots. Esc stops
the sign-in, as soon as it starts; with no code after 10 minutes, illi
stops it itself. When it fails, the note gives Claude Code's own words.
A sign-in that doesn't end with the account kept (failed, stopped, or
the accounts file couldn't be saved) logs its folder out again and
removes it, so no login is left behind unlisted.

Each account shows by its email and plan:

- **Your own Claude Code's**: the login in your Claude Code folder
  (`~/.claude`, or the one `CLAUDE_CONFIG_DIR` names). Del makes illi
  stop using it; Claude Code stays logged in.
- **Another account** (**+ add another account**; its row says "added
  in illi") gets a Claude Code folder of its own,
  `~/.illi/claude/<id>`, as Claude Code keeps one login per folder (on
  macOS, one Keychain entry per folder). That folder is a separate
  Claude Code: your main one's settings, MCP servers, plugins and
  `CLAUDE.md` aren't in it. Del logs it out and removes the folder.

The account you pick is the one illi's calls run on. The side's Usage
and Claude Code's MCP servers (below) are that account's: a switch
drops the other account's until a call tells them. Logging out of the
Claude plan logs illi's own folders out and removes them; your own
Claude Code stays logged in.

illi then runs Claude Code itself, as it ships, on the account's login:

- **illi's prompt and tools, Claude Code's loop**: Claude Code runs a
  turn's steps, but the model gets illi's prompt in place of Claude
  Code's (of Claude Code's own words only a line saying it is a Claude
  agent stays) and illi's own tools, the ones it has on every provider
  (shell, read, write, edit, zoom into the memory, the date, subagents
  and messages to them, the to-do list, skills), which illi serves
  Claude Code over MCP and runs itself. So illi is the same agent on
  every provider: its permissions, hooks, background jobs and Related
  lines work here as everywhere else, and subagents show at illi's
  side. Of Claude Code's own tools only its web search and fetch stay,
  as illi has none of its own. Its shell, files, skills, subagents,
  to-do list, background tasks and the tools it has for a long session
  of its own (scheduled tasks, monitors, workflows…) are left out, and
  so is its tool search, so illi's tools are there from the first step.
  Skills kept in Claude Code's own folder (`~/.claude/skills`) don't
  load: one copied to `~/.agents/skills` or `~/.illi/skills` works on
  every provider ([Customize](customize.md)). An agent's `tools:` limits
  illi's tools as on every provider. Of Claude Code's own MCP servers
  (below), it keeps only those it names:
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
- **Under illi's own name**: each request names the program that sent
  it, and illi's name `illi`, not `sdk-cli`, which every `claude -p`
  names by default. Users report a plan's limits filling about twice
  as fast under `sdk-cli`
  ([anthropics/claude-code#97074](https://github.com/anthropics/claude-code/issues/97074)).
  Under another name Claude Code would
  also add an artifact tool and send one more request each run, to
  title its session: illi turns both off.
- **Your own Claude Code settings apply, a project's don't**: illi's
  calls read your user settings alone: your permission rules (for its
  web fetch and its MCP servers' tools; illi's own tools follow illi's
  rules), MCP servers, plugins and your own `~/.claude/CLAUDE.md`. A
  project's `.claude` settings and rules, `CLAUDE.md`,
  `CLAUDE.local.md`, `AGENTS.md` and `.mcp.json` don't load in Claude
  Code: illi reads the project's `AGENTS.md` or `CLAUDE.md` itself, as
  on every provider, so it reaches the model once, and a repository's
  settings would otherwise apply in a folder you never told Claude Code
  to trust. A project's MCP servers go in its `.illi/mcp.json`, which
  illi loads on every provider once you trust the folder
  ([Customize](customize.md#mcp-servers)). Its hooks are turned off inside illi's calls: your
  `~/.illi/hooks.json` is the one that runs
  ([Customize](customize.md#hooks)).
- **Claude Code's MCP servers in illi**: those you added to Claude Code
  (`claude mcp add`, its plugins', claude.ai connectors) load in illi's
  calls beside illi's own. Their tools go whole with every request, as
  illi's do (Claude Code's tool search is off), so each one connected
  takes room in every call: `off` or an agent's `tools:` (above) leaves
  out those you don't need. One waiting on a login is left out by
  itself, as its only tools would be the login's, which can't finish
  inside illi's call; once you log in (`claude mcp login`), the call
  after the next loads it. illi learns them from the first call that
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
  the model gets one copy. illi keeps the names it has seen, and which
  wait on a login (`claude-code.json`), so `off`, an agent's `tools:`
  and a login missing take one out from the first call after a start
  too (one it has never seen loads in one call, which shows it).
- **Permission prompts come to illi.** illi's own tools are checked by
  illi, as on every provider ([Permissions](permissions.md)). When
  Claude Code wants to run one of its own (a web fetch, a tool of one
  of its MCP servers) that your Claude Code settings don't allow, illi
  checks it the same way: your rules and saved approvals apply, and
  what they leave open is asked at illi's screen, saying why.
- **The whole window**: as soon as the plan is connected, at each
  start, and when another terminal switches the account, illi asks
  Claude Code each model's window, one model after another, sending no
  message (1M on a plan with long context). A turn gets all of it, as
  Claude Code's own compaction, which would stop at its autocompact
  window (500k of Opus's 1M), is off.
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
  of each request. After its advisor answers it asks for more, and the
  two together ask for more than Anthropic allows, so it refuses the
  request (in its words, "A maximum of 4 blocks with cache_control"):
  the reason the advisor is off in illi (below). Should a request still
  be refused so, illi goes on where it was without its own ask, its note
  saying only that the request was refused over a technical limit and
  nothing is lost, and the next turn asks again (`autocontinue` off: the
  note says your next message goes on). That one step may still find the
  chat kept from before, but after a long run of work it reads the whole
  chat anew, once.
- **No advisor**: illi runs Claude Code with its advisor off
  (`CLAUDE_CODE_DISABLE_ADVISOR_TOOL`), even when your Claude Code
  settings turn it on; Claude Code on its own still uses it. Inside
  illi the advisor's answer comes back locked, so illi could neither
  show it nor keep it in its memory, and once it had answered, the next
  request was refused (above).
- **No Claude Code memory**: illi runs Claude Code with its own memory
  off (`CLAUDE_CODE_DISABLE_AUTO_MEMORY`), so the model neither reads
  nor writes the notes Claude Code keeps for a project in its folder
  (`~/.claude/projects/<project>/memory/`); Claude Code on its own still
  keeps them. Its `CLAUDE.md` files are instructions, not those notes:
  the account's folder's (your own Claude Code's in `~/.claude`) still
  loads, on the Claude plan alone; the project's is illi's to read
  (above). illi's memory is the chat itself, your rules (`RULES.md`) and
  the project's `AGENTS.md` or `CLAUDE.md`, the same on every provider:
  a note you want kept for good belongs in one of those.
- **Summaries run with nothing extra**: `claude -p` calls with no tools,
  MCP servers, commands or hooks.
- **Your plan's use at the side**: the Usage section shows how much of
  your 5-hour and weekly limits is used and when each resets, as each
  reply tells it (Claude Code names no plan, so none is named). When a
  limit is reached, illi says when it resets.

Google AI plan
--------------

For Google AI Pro or Ultra, pick **Gemini**, then **Google AI plan**, in
`/login`. illi runs Google's own agent for editors, `antigravity-acp`,
as an editor such as Zed does: unmodified, over the Agent Client
Protocol, under illi's own name, signed in with Google's own sign-in.
Google's forum answers have said this use, an official unmodified
agent in an ACP client with its native sign-in, for one person's
interactive work, is allowed on a consumer plan, with the Gemini models
in it; what Google allows is Google's to say, so check its terms
([antigravity.google/terms](https://antigravity.google/terms)). illi
never reads the agent's sign-in, never runs `agy -p`, and never
switches accounts on its own.

- **The agent**: each illi runs one version of Google's agent, the one
  it was tried with (`src/providers/antigravity/Pinned.ts` names it), as
  T3 Code does. With none here,
  adding an account first offers to download it, saying its size
  (about 320 MB on Linux, 960 MB once unpacked; about 100 MB on a Mac
  or Windows). illi takes it only from Google's own `dl.google.com`,
  checks it as it comes against the checksum this illi carries (as the
  [ACP registry](https://agentclientprotocol.com) listed it), unpacks
  it into `~/.illi/antigravity/agent/<version>/` and keeps it for every
  profile; Esc stops the download, leaving nothing behind. When an illi
  update moves to a newer version, the plan says so as a turn starts,
  and /login offers it under your accounts (**Update Google's
  Antigravity agent**); the older one goes once no illi still running
  uses it. To use one you installed yourself, set `ILLI_ANTIGRAVITY` to
  its command line (on Linux `…/agy_acp_server.par --uid=`): illi runs
  it whatever its version, so keeping it current is yours.
- **Signing in**: illi opens Google's page in your browser (and shows
  the link); once you sign in there, Google sends the browser back to
  the agent on this computer, which keeps the sign-in. Esc stops it.
  Each account gets a folder of its own, `~/.illi/antigravity/<id>/`,
  readable by you alone: the agent's home, its sign-in kept in files
  there, never in a keychain all accounts would share. Google's agent
  tells no email, so an account shows as **Google account 1**, 2, …,
  with the plan it names. Logging one out logs the agent out of it and
  removes its folder.
- **Your prompt, after Google's**: the agent puts Google's own
  instructions first and illi's after them; illi's say which of
  Google's (its workspace, artifacts and `file://` links) don't apply.
- **illi's tools**: a turn runs in Google's agent with illi's tools
  over MCP, run by illi, so your permissions, hooks and background
  jobs work as on every provider. Of the agent's own tools only its web
  search and page reading are on, where a turn searches the web, each
  asked at illi's screen as Claude Code's are. It runs in an empty
  folder, so no project's rules load twice (illi reads them itself), and
  no Gemini or Google key of your environment reaches it.
- **Each turn starts fresh**: a turn is a session of the agent's own,
  with the chat illi sends, and its files are removed as it ends. The
  agent keeps nothing at hand between turns, so each reads the chat in
  full.
- **The models**: the Gemini models your account offers in Antigravity
  (each at its thinking levels: the effort), as Google's agent lists
  them when you sign in and as each turn starts: a model your plan adds
  is offered at once (unless `models` names those offered), one it
  drops is gone, and the list is kept for the next start. Other makers'
  models the agent may list are left out. Before your first sign-in,
  illi shows the list a Google AI Ultra account had (Gemini 4 Argon,
  Gemini 3.8 Flash). With two accounts on different plans, the list is
  the one whose agent told it last; a model the account in use doesn't
  offer says what it does offer. Each turn tells the model's window,
  which illi keeps.
- **What's different**: a message you send mid-turn waits for the next
  one; a tool's answer reaches the model cut at about 48 KB (illi's own
  tools cut theirs sooner); when Google is busy or your plan's limit
  is reached, the agent may retry quietly for minutes before it says
  so (Esc stops the turn); each agent takes about 325 MB, and each turn
  it ran about 160 MB more till the agent ends. illi starts one as a
  turn needs it (turns running at once share one, four at most) and
  ends it once its turns have; it keeps one more ready so the next turn
  needn't wait, which ends after 10 minutes with no turn. None is left
  once illi ends.

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
| `antigravity` | gemini-3.8-flash | gemini-3.8-flash (low) |
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
| `claude-api`  | each model's window (Anthropic's Models API)                     | at start, after `/login` (here or in another terminal) |
| `claude-code` | each model's window, as Claude Code has it for a turn (asked, no message sent); the window of the model a turn's reply ran on | at start, after `/login` (here or in another terminal); after each turn's reply |
| `antigravity` | the models your account may use, each at its thinking levels; the window of the model a turn ran on | the models at sign-in and as each turn starts; the window during each turn |
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
