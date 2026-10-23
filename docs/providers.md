Providers
=========

illi runs on your ChatGPT plan, your Claude plan (through your own
Claude Code), or Anthropic and OpenAI API keys. Each is a vendor; name
the ones you use in `~/.illi/config.json`.

ChatGPT plan
------------

In the chat, type `/login` to sign in with ChatGPT Plus or Pro: illi
shows a code to enter on OpenAI's page, then keeps and renews the login
itself. An existing [opencode](https://opencode.ai) login is picked up
as it is. `chatgpt` is the default vendor.

Claude plan
-----------

For Claude Pro or Max, install [Claude Code](https://code.claude.com)
and log in there (`claude`, then `/login`); then name it as a vendor:

    { "vendors": "chatgpt,claude-code" }

illi then runs Claude Code itself, as it ships, on your login:

- **Claude Code's own prompt and tools** (its shell, files, search), with
  illi's added through MCP: zoom into the memory, the date, subagents,
  messages to them, the to-do list and skills.
- **Your token stays with Claude Code.** illi never sees it, and its
  turns stay out of Claude Code's session history.
- **Your Claude Code setup applies**: its permission rules, MCP servers
  and plugins. Its hooks are turned off inside illi's calls: your
  `~/.illi/hooks.json` is the one that runs
  ([Customize](customize.md#hooks)). A project's `CLAUDE.md` is Claude
  Code's to read, so illi doesn't add it again.
- **Permission prompts come to illi.** When Claude Code wants to run
  something its settings don't allow, illi checks it as it checks its
  own calls ([Permissions](permissions.md)): routine work runs, a risky
  call is asked about at illi's screen, saying why, and your rules and
  grants apply.
- **Summaries run with nothing extra**: `claude -p` calls with no tools,
  MCP servers, commands or hooks.
- **Plan limits are said plainly**: when your plan's limit is reached,
  illi says when it resets.

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

The vendors never mix: a chat's summaries and subagents run on its own
vendor's models. `compactor` and `agents` take one pick per vendor,
comma-separated, and a chat uses its own vendor's. All settings are in
[Config](config.md).
