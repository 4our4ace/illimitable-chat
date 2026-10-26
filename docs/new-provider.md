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
  `DEFS`; if it runs on an API key, the key's variable in `VARS` (named
  `<KEY>_API_KEY` for the wire's `key`: Agent.ts says that name when it
  is missing) and its vendor in `KEYED`.
- An API key also goes in Agent.ts's `VENDORS` (the name a refused key
  is said with) and in `update_run`'s list (`src/config/Update.ts`),
  which keeps the keys from the `--version` it runs.
- `docs/providers.md`: the vendors at its top, a section saying how to
  sign in or set the key, and its rows in the Models tables (the
  defaults, what it tells); its name where the docs list every vendor
  (`docs/config.md`'s `vendors` and keys, the status line's
  `model.vendor` in `docs/customize.md`, the customize-illi skill,
  `README.md`).

2. The request
--------------

illi's loop (`src/ai/Agent.ts`) sends every request, retries it, runs
the tools and ends the call; a vendor gives it a `Wire`:

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

Then name the wire in `Agent.ask` (a vendor not named there runs on
OpenAI's). A vendor whose own program runs the loop (Claude Code) skips
the wire: `Agent.ask` hands the call to its runner, which must give back
a `Try` with the same `Event`s and `End`. A call `once` (a recap) runs
no tool and takes no message sent meanwhile: the runner leaves it in
`End.left`, as `Agent.loop` does (an agent's log holds it for its next
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
- `down`: the vendor refused (a wrong key, credit or plan used up).
  `Agent.spent` says what to do in plain words: add the vendor's case
  there (and to `CREDIT` for an API key).
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

An API key is read once at the start (`config.KEYS`); nothing else is
needed. A plan login needs what `ChatGPT.ts` has:

- `token()`: the login on disk, renewed before it ends, under the lock
  other tools take on that file, and written back so they stay signed in.
- `sync()`: the login file looked at (a stat, read only when it
  changed). A change of account drops everything known of the old one at
  once (its plan, its usage) and tells the chat (`watch`, which
  `Chat.ts` registers for chatgpt alone), so no screen shows one
  account's plan with another's usage.
- `follow()`: the file looked at every few seconds while illi runs: a
  login made in another terminal, or by another tool, is picked up.
- `/login` and `/logout` (`src/term/Commands.ts`): chatgpt's alone (a
  device code entered in the browser, kept in the file `login` names,
  else illi's own); a second plan login extends them. `term_account`
  then asks the plan, usage and models of the account now in use (a
  new vendor's asks go before the return it takes when chatgpt isn't
  offered, as claude-api's do).
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
- What a reply tells (Claude Code's `modelUsage[model].contextWindow`,
  by its `canonicalModel`): `Pick.told` after each reply.
- Nothing told (the OpenAI API): the windows built in, from the vendor's
  docs.

Keep what was learned for the next start with
`config.config_models_keep(vendor, Pick.list(vendor))`: models.json
holds each vendor's list on its own. At the start `config_models` takes
chatgpt's list whole and only the windows of the others' built-in
models, by id: a catalog vendor joins chatgpt's branch there. Ask the
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
saying why (`ChatGPT.ready`, called for chatgpt in `Chat.call` and
`Tools.view`; the start's cut waits in `Chat.ts` too). No window is ever
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
  window's minutes, share used and reset time), or null. Register it in
  `PLANS` (`src/tools/Tools.ts`).
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
definitions in its body. A vendor running its own agent (Claude Code)
gets illi's tools over MCP instead, its system prompt adapted
(`Tools.system`'s `hosted`, which names claude-code), and its permission
prompts routed to illi's checks. Web search is a server tool where the
vendor has one (`Ask.searches`): each search logged as a call with its
result, and the pages a reply cites but doesn't link ending the reply,
in one `Sources:` line (`OpenAI.entries`), never a result no call made.

8. Tests
--------

A wire's tests stub `fetch` or the vendor's program: a turn streamed
and its usage, each failure's `stop` and plain words (beside the wire,
`src/ai/*.test.ts`; claude-api's against a fake Anthropic in `test/`),
the login renewed and a refused token spoilt (`ChatGPT.test.ts`,
`Login.test.ts`), the models learned and kept (a catalog stubbed:
`src/config/Context.test.ts`). `src/ai/Agent.test.ts` matches each
vendor's too-long words (`FULL`); `src/config/Config.test.ts` starts
each vendor alone and checks the start's tips on keys. Tests never call
a real vendor. `test/cache.test.ts` replays a chat against a fake vendor
that caches by Anthropic's rules: a new vendor whose cache works
otherwise needs its own.
