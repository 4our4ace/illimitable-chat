Adding a provider
=================

What a new vendor needs, end to end: the request, the login, the plan
and its usage, the models with their efforts, speeds and windows, and
the screen. Each step names the file and what the vendors there already
do, so the new one can copy the closest. illi has four vendors:

| Vendor        | Paid by      | Runs in                | Wire or runner |
| ------------- | ------------ | ---------------------- | -------------- |
| `claude-api`  | an API key   | illi's own loop        | `src/ai/Anthropic.ts` |
| `openai-api`  | an API key   | illi's own loop        | `src/ai/OpenAI.ts` |
| `chatgpt`     | a plan login | illi's own loop        | `src/ai/ChatGPT.ts` (OpenAI's wire on the Codex backend) |
| `claude-code` | a plan login | the user's Claude Code | `src/ai/ClaudeCode.ts` |

1. The vendor's name
--------------------

- `src/ai/AskAI.ts`: add it to `Vendor`, and its cache's lifetime to
  `TTL` (how long the vendor keeps a prefix it cached unused).
- `src/ai/Pick.ts`: add it to `VENDORS` and its models to `MODELS`.
- `src/config/Config.ts`: its default pick and summaries' pick in
  `DEFS`; if it runs on an API key, the key's variable in `VARS` and its
  vendor in `KEYED`.
- `docs/providers.md`: a section saying how to sign in or set the key,
  and its row in the Models table.

2. The request
--------------

illi's loop (`src/ai/Agent.ts`) sends every request, retries it, runs
the tools and ends the call; a vendor gives it a `Wire`:

| Field     | What it does |
| --------- | ------------ |
| `key`     | the API key's name in `config.KEYS` ("" with `auth`) |
| `auth`    | a login instead: `token()` for each request (renewed as it nears its end), `spoil(token)` when the vendor refuses one, so the next request renews it |
| `url`, `headers`, `body` | the request: model, effort, speed, tools, system prompt, cache marks, the most it may write |
| `marks`   | how many cache breakpoints a request takes |
| `start`, `read`, `begun`, `step` | the stream: each event read into a step (text, thinking, tool calls, why it stopped) |
| `usage`   | what the request read, wrote and was cached, and the speed it ran at |
| `heard`   | the response's headers, for a plan's limits (chatgpt's) |
| `idle`    | how long a silent stream lives before it is taken as dead |

Then name the wire in `Agent.ask`. A vendor whose own program runs the
loop (Claude Code) skips the wire: `Agent.ask` hands the call to its
runner, which must give back the same `Event`s and `End`.

Failures must land in the right `stop`, since each is handled apart:

- `full`: too long for the model's window. Match the vendor's words in
  `FULL` (Agent.ts); `Chat.refit` then folds more of the chat and goes on.
- `down`: the vendor refused (a wrong key, credit or plan used up).
  `Agent.spent` says what to do in plain words: add the vendor's case
  there (and to `CREDIT` for an API key).
- `busy`: a passing failure (no connection, 429, 5xx); asked again.
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
  `tiers`). `usage` must report the speed a reply really ran at (a fast
  request may run slow), which the screen shows.
- `Pick.fit` steps a pick whose effort or speed the model lacks to the
  nearest it has, so a body never sees one the model refuses.

4. The login, and switching accounts
-------------------------------------

An API key is read once at the start (`config.KEYS`); nothing else is
needed. A plan login needs what `ChatGPT.ts` has:

- `token()`: the login on disk, renewed before it ends, under the lock
  other tools take on that file, and written back so they stay signed in.
- `sync()`: the login file looked at (a stat, read only when it
  changed). A change of account drops everything known of the old one at
  once (its plan, its usage) and tells the chat (`watch`), so no screen
  shows one account's plan with another's usage.
- `follow()`: the file looked at every few seconds while illi runs: a
  login made in another terminal, or by another tool, is picked up.
- `/login` and `/logout` (`src/term/Commands.ts`): sign-in in the
  browser, kept in illi's own file; `term_account` then asks the plan,
  usage and models of the account now in use.
- `term_hints` (`src/term/Term.ts`): the start's note when there is no
  login yet.

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
| `room`     | the share of the window a request may fill, as the vendor tells it (chatgpt's `effective_context_window_percent`; none: 90%) |

Built-in models in `MODELS` hold until the vendor answers. Ways to
learn them, from best:

- A catalog of the account's models (chatgpt's `/codex/models`): it is
  the vendor's list. Learn it with `Pick.learn(vendor, models,
  "replace")`, so a model it drops is gone and a new one is offered.
- A model list with windows (Anthropic's `GET /v1/models`, paged): learn
  the windows of the models built in, by id (`Pick.told`); the full list
  would flood the picker with every model the vendor ever had.
- What a reply tells (Claude Code's `modelUsage[model].contextWindow`,
  by its `canonicalModel`): `Pick.told` after each reply.
- Nothing told (the OpenAI API): the windows built in, from the vendor's
  docs.

Keep what was learned for the next start with
`config.config_models_keep(vendor, Pick.list(vendor))`: models.json
holds each vendor's list on its own. Ask the vendor at the start
(`term_account`), and again when the account changes. If a vendor tells
windows that are only true for some accounts, keep which account the
list is of (models.json's `account`, as chatgpt does).

A model's `window` sets how much of the chat a turn sends: its auto
compact (default 60%, at most 70%, and its `room` less what a request
takes beside the chat: `config_context`). A wrong window costs either
memory (too small) or failed turns (too big). A vendor that tells its
windows gets none built in: until it answers, nothing is folded and a
turn fails saying why (chatgpt's `NO_WINDOW`). A vendor that tells none
(the OpenAI API) gets a cautious built-in one.

6. The plan and its usage
-------------------------

For a plan login, the side shows the plan's name and how much of each
limit is used (`View.ts` `Plan`, `Limit`):

- `told()`: the account's plan now (`brand`, `tier`, its `limits`: each
  window's minutes, share used and reset time), or null. Register it in
  `PLANS` (`src/tools/Tools.ts`).
- Ask the plan and usage together (chatgpt's `usage()`), at the start,
  after `/login` and `/logout`, and when the account changes; keep each
  answer for the account it was asked for, and drop one that comes back
  after a change of account.
- Keep it current from each response's headers where the vendor sends
  them (`heard`).
- A limit used up must say which one and when it resets
  (`ChatGPT.spent`), through `Agent.spent`.

7. Tools and prompts
--------------------

A vendor in illi's loop gets illi's tools (`src/tools/`) as function
definitions in its body. A vendor running its own agent (Claude Code)
gets illi's tools over MCP instead, its system prompt adapted
(`Tools.system`'s `hosted`), and its permission prompts routed to illi's
checks. Web search is a server tool where the vendor has one (`Ask.searches`).

8. Tests
--------

Each wire has a test beside it (`src/ai/*.test.ts`) that stubs `fetch`
or the vendor's program: a turn streamed and its usage, each failure's
`stop` and plain words, the login renewed and a refused token spoilt,
the models learned (a catalog stubbed). Tests never call a real vendor.
`test/cache.test.ts` replays a chat against a fake vendor that caches by
Anthropic's rules: a new vendor whose cache works otherwise needs its own.
