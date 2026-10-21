Planned
=======

Planned, roughly in this order. Until then, illi runs what it decides
to, as you: use it where you'd let it.

- **Permissions.** Rules for what illi may run or change without asking
  (allow, ask, deny), and a prompt for the rest: once, always in this
  project, always, or no with a reason illi reads (on `claude-code`,
  Claude Code's own prompts already come to illi's screen). Secrets such
  as `~/.ssh` hidden, `.git` and shell rc files protected, the mode on
  the bottom line, and subagents' requests in the same queue, named.
- **Sandbox.** Shell commands in a bubblewrap sandbox: only the project
  and `/tmp` writable, secrets hidden, network off. illi asks before
  anything leaves it, so work inside it needs no prompts.
- **Project trust.** A project's own `.illi` agents, commands and skills
  load only once you trust the folder.
- **An AI reviewer.** Optionally, a small model approves routine requests
  to leave the sandbox, so you're asked less.
