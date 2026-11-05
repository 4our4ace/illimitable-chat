Adding a provider
=================

What a new vendor needs, end to end: the request, the login, the plan
and its usage, the models with their efforts, speeds and windows, and
the screen. A provider is a folder of its own in `src/providers`, named
by its id; the rest of illi never names one, but asks three lists in
that folder. Adding one changes nothing else:

| Part | Where | What it holds |
| ---- | ----- | ------------- |
| its facts | `src/providers/<id>/Facts.ts`, listed in `Vendors.ts` | what illi knows before any of its code runs (Config.ts reads them as illi starts): its name, maker, models, default picks, API key |
| its code | its module (`src/providers/<id>/<Name>.ts`), its `PROVIDER` listed in `Providers.ts` | how a call runs on it, and what illi asks of it as it runs: its account, plan, models' windows, a refusal in plain words |
| its /login page | `src/providers/<id>/Login.ts`, listed in `Logins.ts` | a plan's sign-in and accounts; a provider on an API key has none, as /login's own page asks for its key |

The types of all three are in `src/providers/Provider.ts`.
`src/providers/Providers.test.ts` keeps it so: no file outside
`src/providers` holds a provider's id as a string, uses its code by its
namespace or imports its folder; each provider's facts, code and page
agree. `src/providers/Fake.test.ts` adds a provider no list names (as
a test may: `Vendors.add`, `Providers.add`, `Logins.add`) and runs it
end to end. illi has four vendors:

| Vendor        | Paid by      | Runs in                | Its folder |
| ------------- | ------------ | ---------------------- | ---------- |
| `claude-api`  | an API key   | illi's own loop        | `src/providers/claude-api` (`Anthropic.ts`) |
| `openai-api`  | an API key   | illi's own loop        | `src/providers/openai-api` (`OpenAI.ts`) |
| `chatgpt`     | a plan login | illi's own loop        | `src/providers/chatgpt` (`ChatGPT.ts`: OpenAI's wire on the Codex backend) |
| `claude-code` | a plan login | the user's Claude Code (another account's: in a Claude Code folder of illi's) | `src/providers/claude-code` (`ClaudeCode.ts`) |

1. Its facts
------------

`Facts.ts` exports `FACTS` (`Provider.ts` `Facts`), its id typed as
written (`"id" as const`), added to `ALL` in `Vendors.ts` (the order
illi lists their models in):

| Field | What it is |
| ----- | ---------- |
| `id` | as saved: in a pick (`vendor:model:effort:speed`), `models.json`, `accounts.json`; never changed once out |
| `name` | as a note names it: "the Anthropic API", "your ChatGPT plan" (`Pick.provider`) |
| `maker`, `row` | under whom /login lists it (`Maker`: its name, what its row says while none of its providers is connected, its place; a maker's plan before its API key) and its row's name ("ChatGPT plan", "Anthropic API key") |
| `models` | as built in (5: their windows, efforts and speeds) |
| `defaults` | illi's own pick on it (the first offered vendor's is illi's default pick) and the summaries', while `compactor` names none for it |
| `ttl` | how long it keeps a cached prefix unused, in ms (`AskAI.wait`) |
| `accounts` | its entry's shape in `accounts.json` (`Accounts.ts`): `keys` (an API's), `folders` (a plan its own program runs, each account a folder: `folders` names theirs in illi's root), `logins` (a plan whose login is a file of its own: `outside`) |
| `key` | it runs on an API key: the key's name in `config.KEYS`, the variable the environment sets it in (named `<KEY>_API_KEY`), the maker a refused key is said with, where a key is made, what to do once its credit is used up |
| `catalog` | `models.json` keeps its whole list (its account's catalog), not only the windows of the models built in |
| `fallback` | offered while nothing is connected (one provider: chatgpt), so a chat has a pick and the start says /login connects one |
| `dated` | its calls tell the model today's date themselves, so illi's own line of where it works gives the time alone |
| `setup`, `outside` | `setup(ctx)` runs once as illi starts, given the settings and accounts it may read (`Context`), before the vendors offered are reckoned; `outside()`: connected by a login kept outside `accounts.json` (chatgpt's login file: `LoginFile`), listed first among those connected |

A facts file imports nothing that reads the config (types, `node:`
modules, `src/tools/Clip.ts`, another provider's facts), so the list
loads before Config.ts does. From the facts, illi reckons the vendors
connected (`config_has`, `config_connected`), the keys and their
variables (`config.VARS`, `KEYS`: an API key is taken out of the
environment as illi starts, so no program an agent runs inherits it),
the default picks, the start's notes and what /login and `illi help`
say it connects (`Vendors.ways`).

Then `docs/providers.md`: the vendors at its top, a section saying how
to sign in or set the key, and its rows in the Models tables (the
defaults, what it tells); its name where the docs list every vendor
(`docs/config.md`'s `vendors` and keys, the status line's
`model.vendor` in `docs/customize.md`, the customize-illi skill,
`README.md`).

2. The request
--------------

Its code exports `PROVIDER` (`Provider.ts` `Provider`), added to
`made` in `Providers.ts`; the list is built on first use, as the
provider's code imports what imports that list. illi's loop
(`src/ai/Agent.ts`) sends every request, retries it, runs the tools and
ends the call; a vendor gives it a `Wire` (`PROVIDER.wire`):

| Field     | What it does |
| --------- | ------------ |
| `key`     | the API key's name in `config.KEYS` (with `auth`, the vendor's name: no key is read) |
| `auth`    | a login instead: `token()` for each request (renewed as it nears its end), `spoil(token)` when the vendor refuses one, so the next request renews it |
| `url`, `headers`, `body` | the request: model, effort, speed, tools, system prompt, cache marks, the most it may write |
| `marks`   | how many cache breakpoints a request takes |
| `start`, `read`, `step` | the stream: each event read into a step (text, thinking, tool calls, why it stopped, a `note` to show) |
| `begun`   | the event that says the response has begun (a request waiting on the same prefix goes then) |
| `usage`   | what the request read, wrote and was cached (the speed it ran at too, for `step`'s note) |
| `heard`   | the response's headers, for a plan's limits (chatgpt's) |
| `idle`    | how long a silent stream lives before it is taken as dead |

A vendor whose own program runs the loop (Claude Code) has no wire but
a runner (`PROVIDER.ask`): `Agent.ask` hands it the call, and it must
give back a `Try` with the same `Event`s and `End`. A provider has one
of the two. A call `once` (a recap) runs
no tool and takes no message sent meanwhile: the runner leaves it in
`End.left`, as Agent.ts does (an agent's log holds it for its next
call).

Failures must land in the right `stop`, since each is handled apart:

- `full`: too long for the model's window. Match the vendor's words in
  `FULL` (Agent.ts), and have `step` say `full` for the stream's own
  sign (Anthropic's `model_context_window_exceeded`); `Chat.refit` then
  folds more of the chat and goes on (a subagent's call: `Tools.refit`
  recaps its log and it goes on from the recap). One that comes once a
  step's tool results went in is `grew` (the turn's own work outgrew the
  window: its share stays, and the count of refits starts anew, a
  subagent's too); `Agent.loop` sets it for a wire, a runner of its own
  loop must set it itself (Claude Code's, once a tool's result came
  back).
- `marks`: the request held more cache marks than the API takes. Only
  Claude Code's runner says it: Claude Code marks a request itself, at
  times all four the API allows, and illi's one beside them is refused
  (`MARKED`, ClaudeCode.ts). Its advisor was the one known cause (once
  it has answered, Claude Code's own marks fill all four), so illi's
  calls run with it off (`ClaudeCode.env`); this stays for any other.
  `Chat.unmark` goes on from a note, the next call with no block marked
  (`AskAI.unmarked`), once; a subagent's run does the same
  (`Tools.run`).
- `down`: the vendor refused (a wrong key, credit or plan used up).
  `Agent.spent` says what to do in plain words: a plan's own refusals
  (its usage limit) are read by `PROVIDER.spent(said, err)`; an API
  key's credit used up, by its facts' `key.credit`.
- `busy`: a passing failure (no connection, 429, 5xx); asked again,
  `TRIES` times at most, then the call ends `down` (`again`: a later
  try may answer).
- `fail`: the model's own answer failed (a refusal, a stop reason in
  `STOPS`).

3. Effort and speed
-------------------

- Effort: `Ask.effort` is the pick's (`low` … `max`, or the vendor's own
  names, see 5). The body sends it as the vendor names it (Anthropic's
  `output_config.effort`, OpenAI's `reasoning.effort`, Claude Code's
  `--effort`).
- Speed: `slow` is the standard one; `fast` and `ultrafast` are what a
  model lists in its `speeds`. The body turns a speed into the vendor's
  own (Anthropic: `speed: "fast"` and a beta header; OpenAI: a service
  tier; chatgpt: the tier its catalog names, kept in the model's
  `tiers`). `step`'s `note` must say when a reply ran at another speed
  than asked (`ran at slow speed`: a fast request may run slow), which
  the screen shows.
- `Pick.fit` steps a pick whose effort or speed the model lacks to the
  nearest it has, so a body never sees one the model refuses.

4. The login, and switching accounts
-------------------------------------

An API key is the one `/login` chose for its vendor, else the
environment's (`config.KEYS`, changed in place as `accounts.json`
changes: `config_accounts`); the wire reads it at each call, so nothing
else is needed, but what it asks once a key (the windows its models
list tells, as `Anthropic.models` does) must ask again for a new one
(`PROVIDER.account`). /login's own page asks for the key and checks it
with `PROVIDER.check(key)`, asking a list that costs nothing; its reason
never the fetch error's own text, which may hold a header's whole
value, the key. A plan login needs what `ChatGPT.ts` has (a runner's,
like Claude Code's, is its own: a folder an account, `ClaudeCode.ts`):

- `token()`: the login on disk, renewed before it ends, under the lock
  other tools take on that file, and written back so they stay signed in.
- `sync()`: the login file looked at (a stat, read only when it
  changed). A change of account drops everything known of the old one at
  once (its plan, its usage) and tells the chat (`PROVIDER.watch`), so
  no screen shows one account's plan with another's usage.
- `follow()`: the file looked at every few seconds while illi runs: a
  login made in another terminal, or by another tool, is picked up.
- `PROVIDER.account()`: what the account in use tells, asked at the
  start, after `/login` and as the accounts change in another terminal
  (`Chat.account`: each vendor offered); a promise of whether something
  changed (its models' windows), the chat redrawn then.
- `PROVIDER.hint()`: what the start says of its login (a fault, such as
  a login file that won't read, said even with nothing connected; else
  what its login lacks, with the vendors setting naming it); with
  nothing connected, the start says how /login connects any provider
  (`term_hint`).
- `PROVIDER.close()`: what it runs in the background stopped, as illi
  ends.
- `/login` and `/logout` (`src/term/LoginCommands.ts`): a plan's page
  is its folder's `Login.ts` (`PAGE`, a `Page`, listed in `Logins.ts`),
  under its maker: its row's text, its accounts (the one in use marked,
  what Enter and Del do on each), what connects one more and what logs
  out of it all. Its sign-in runs there (chatgpt's device code,
  claude-code's `claude auth login` through pipes), its accounts kept in
  `src/config/Accounts.ts`'s file (`~/.illi/accounts.json`: the shape
  its facts name, `Accounts.keys_in`, `folders_in`, `logins_in` and `put`
  for the entry), which Config.ts reads into the vendors offered and
  every illi follows. `login_after` then reads it again, moves a chat
  off a vendor gone (`Chat.offered`) and runs `term_account`, which
  asks each account in use what it tells (`PROVIDER.account`).

5. Models, windows, efforts and speeds
--------------------------------------

Nothing about a model should be guessed where the vendor tells it. A
model (`Pick.ts` `Model`) has:

| Field      | Meaning |
| ---------- | ------- |
| `label`    | as illi shows it (`gpt-6.1-sol`) |
| `id`       | as the vendor names it in requests |
| `speeds`   | `slow`, and `fast`/`ultrafast` where it has them |
| `window`   | the whole context window the vendor states (input and output share it) |
| `standard` | the vendor's usual window, when smaller (chatgpt's `context_window` below its `max_context_window`) |
| `efforts`  | the efforts it takes, in the vendor's names (none: illi's five) |
| `tiers`    | the id each speed is sent as |
| `room`     | the share of the window a request may fill, as the vendor tells it (chatgpt's `effective_context_window_percent`, else Codex's 95%; a vendor that tells none: 90%) |

Built-in models in `MODELS` hold until the vendor answers. Ways to
learn them, from best:

- A catalog of the account's models (chatgpt's `/codex/models`): it is
  the vendor's list. Learn it with `Pick.learn(vendor, models,
  "replace")`, so a model it drops is gone; the labels it returns, new
  to illi, are offered once added to `config.OFFER.models` (unless
  `config.MODELS_SET`: the `models` setting names those offered).
- A model list with windows (Anthropic's `GET /v1/models`, paged): learn
  the windows of the models built in, by id (`Pick.told`); the full list
  would flood the picker with every model the vendor ever had.
- A runner asked before any message (Claude Code's control channel:
  `get_context_usage`, its `rawMaxTokens`, one Claude Code a model, as
  a turn runs it: `ClaudeCode.models`), and what a reply tells (its
  `modelUsage[model].contextWindow`, by its `canonicalModel`):
  `Pick.told` each. Ask it as the turn runs: Claude Code tells its
  autocompact window (500k of Opus's 1M) while its compaction is on, so
  a summary's reply, which runs with it on, tells none.
- Nothing told (the OpenAI API): the windows built in, from the vendor's
  docs.

Keep what was learned for the next start with
`config.config_models_keep(vendor, Pick.list(vendor))`: models.json
holds each vendor's list on its own. At the start `config_models` takes
a catalog vendor's list whole (its facts' `catalog`: chatgpt's) and only
the windows of the others' built-in models, by id. Ask the
vendor at the start (`term_account`), and again when the account
changes (chatgpt's `follow`). models.json's `account` and `capped`
(the models that account refused past their usual window) are
chatgpt's alone, one slot: a vendor whose windows are only true for
some accounts needs its own.

A model's `window` sets how much of the chat a turn sends: its auto
compact (default 60%, at most 70%, and its `room` less what a request
takes beside the chat: `config_context`). A wrong window costs either
memory (too small) or failed turns (too big). A vendor whose windows
differ by account (chatgpt) gets none built in: until it answers,
nothing is folded, and a turn or a subagent waits for it, then fails
saying why (`PROVIDER.ready`, asked in `Chat.call` and `Tools.view`;
the start's cut waits in `Chat.ts` too, while `PROVIDER.windows()` says
the windows known aren't the account's own yet). An account found to
take less than a model's whole window (chatgpt's refusal past its
standard one) is learned by `PROVIDER.refused(label)`. No window is ever
guessed (`config_context` takes one, always). The others that tell
theirs (Anthropic's API, Claude Code) get built-in ones till they tell;
one that tells none (the OpenAI API), the ones its docs state.

6. The plan and its usage
-------------------------

For a plan login, the side shows the plan's name and how much of each
limit is used (`View.ts` `Plan`, `Limit`), once at least one limit is
told: a vendor that tells none shows no Usage at all, not even the
plan's name.

- `told()`: the account's plan now (`brand`, `tier`, its `limits`: each
  window's minutes, share used and reset time), or null: its
  `PROVIDER.plan`, which the side asks for the chat's vendor
  (`Tools.state`).
- Ask the plan and usage together (chatgpt's `usage()`), at the start,
  after `/login` and `/logout`, and when the account changes; keep each
  answer for the account it was asked for, and drop one that comes back
  after a change of account.
- Keep it current from each response's headers where the vendor sends
  them (`heard`), or, for a runner, from what its stream tells
  (claude-code's rate limit events: `ClaudeCode.windows`).
- A limit used up must say which one and when it resets
  (`ChatGPT.spent`), through `Agent.spent`.

7. Tools and prompts
--------------------

A vendor in illi's loop gets illi's tools (`src/tools/`) as function
definitions in its body. A vendor running its own loop (Claude Code)
gets illi's prompt in place of its own and the same tools over MCP
instead, illi running each (`Tools.list`'s `hosted` adds the `approve`
tool, through which its permission prompts reach illi's checks). MCP
servers of its program's own (Claude Code's) show in /mcp, /settings and
the side while the chat's pick is on it: `PROVIDER.servers` (whose they
are, the servers as its last call told them, a server's tools by their
own names, the command that logs in to one). A vendor that tells the
model the date itself (its facts' `dated`) gets illi's line of where it
works with the time alone (`Tools.here`). Web
search is a server tool where the vendor has one (`Ask.searches`):
each search logged as a call with its result, and the pages a reply
cites but doesn't link ending the reply, in one `Sources:` line (`OpenAI.entries`), never a result no call made.
The citation marks a ChatGPT model writes in its text (U+E200 `cite`
... U+E201) stay in the chat as they came; the screen and `/copy`
leave them out (`Md.cites_hide`), since only ChatGPT's own app knows
the pages they name.

8. Tests
--------

A wire's tests stub `fetch` or the vendor's program: a turn streamed
and its usage, each failure's `stop` and plain words (beside the wire,
in its folder; claude-api's against a fake Anthropic in `test/`),
the login renewed and a refused token spoilt (`ChatGPT.test.ts`,
`Login.test.ts`), the models learned and kept (a catalog stubbed:
`src/config/Context.test.ts`). `src/ai/Agent.test.ts` matches each
vendor's too-long words (`FULL`); `src/config/Config.test.ts` starts
each vendor alone and checks the start's tips on keys. Tests never call
a real vendor. `test/cache.test.ts` replays a chat against a fake vendor
that caches by Anthropic's rules: a new vendor whose cache works
otherwise needs its own. `src/providers/Providers.test.ts` checks the
new provider's facts, code and page agree, and that nothing outside
`src/providers` names it; `src/providers/Fake.test.ts` is the shape of
one run end to end with no list naming it.
