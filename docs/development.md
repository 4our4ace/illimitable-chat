Development
===========

    src/main.ts    the illi command
    src/term/      the terminal app: keys, selection, commands, side panel,
                   every list in one popup (Popup.ts), every question at the
                   input (Question.ts), the trust question at the start
                   (Trust.ts), /mode and /permissions (PermCommands.ts), the
                   status line (Status.ts), the side's related lines (Related.ts),
                   the window that owns a terminal for every profile's illi
                   (Window.ts; their wire, Wire.ts; a profile's end, Member.ts)
    src/ui/        the chat's view, replies drawn from their markdown (its parser,
                   Markdown.ts; the palettes, Palettes.ts; code's languages,
                   Prism.ts), diagrams, the screen and the terminal's modes
                   (Modes.ts)
    src/chat/      the chat's turns (Chat.ts), its memory tree and views (Memory.ts),
                   the summaries written (Compactor.ts), its SQLite file (Store.ts),
                   its lock (Lock.ts), suggested replies (Suggest.ts), agents' logs
                   (Logs.ts), /export and /tree (Export.ts), projects (Projects.ts)
                   and their searches' threads (Seeker.ts), the radar's search of
                   past topics (Radar.ts) and its strong lines given to the model
                   (Recall.ts), a second terminal's view (Remote.ts), times as
                   people say them (When.ts), the disk
    src/ai/        model vendors, the agent loop, picks, token usage
    src/tools/     shell and files, MCP servers, the prompts; the permissions:
                   what each call asks leave for (Access.ts; bash read as bash
                   reads it, Shell.ts), the rules and what "don't ask again"
                   saved (Permissions.ts)
    src/config/    settings, profiles, your agents, commands and skills (Custom.ts),
                   plugins (Plugins.ts; a plugin's folder read: Bundle.ts), hooks
                   (Hooks.ts) and the commands they and the status line run
                   (Run.ts), a project's files as last seen (Seen.ts), updates,
                   the folders you trust (Trusted.ts)
    src/skills/    the skills built into illi (customize-illi)
    test/          tests across modules; each module's own sit beside it
    examples/      agents, a command, hooks, a plugin and a theme to copy
                   (customize.md)
    assets/        the README's banner and screenshots; logo.svg and
                   logo-on-dark.svg are the logo's source files, kept
                   for brand use though no page shows them

Each file starts with a comment on its design; the chat's SQLite files
are described end to end in [storage.md](storage.md), and what a new
model vendor needs in [new-provider.md](new-provider.md).

On a terminal, `illi` is a window (`src/term/Window.ts`): a small process
that owns the terminal (raw mode, its modes, its size, the signals) and
runs each profile's illi on a PTY of its own, copying the shown one's
output to the screen and the keys to it. They talk in band, over each
PTY (`Wire.ts`); the window reads no setting, so it never takes the API
keys out of the environment its profiles start with. A profile's illi is
a session leader on its PTY: the window's death, however it comes, hangs
it up. From a pipe, or with `ILLI_WINDOW=off`, illi runs alone.

illi needs Bun 1.4.3 or later, the version the release is built and
tested on (`release.yml`; `@types/bun` matches it): 1.3's `spawnSync`
could spin forever over a child already gone (bun#34069), which hung
the tests. After `bun install`:

    bun run test     the tests
    bun run check    the type check (unused code fails it too)
    bun run start    illi from the source
    bun run build    one binary, ./illi

From source, without installing:

    git clone https://github.com/4our4ace/illimitable-chat
    cd illimitable-chat && bun install
    bun src/main.ts

A release is a tag `vX.Y.Z` naming `package.json`'s version: the
workflow (`.github/workflows/release.yml`) type-checks and tests it,
builds one file per system (`illi-linux-x64`, `illi-linux-arm64`,
`illi-darwin-x64`, `illi-darwin-arm64`) and publishes them with their
`SHA256SUMS`. Every installed illi takes the latest within a day
(`src/config/Update.ts`; `autoupdate` in [Config](config.md)): it
checks the file against the sums, runs it with `--version`, which must
print exactly `illi X.Y.Z` (main.ts), then renames it over itself. `bun
run build`'s `./illi` is such a file and updates itself too
(`ILLI_AUTOUPDATE=off` keeps it); a source run never does.

The libraries illi uses are three, each pinned to one version in
`package.json` (`bun.lock` holds the exact commit or file hash) and
compiled into the binary, so a user installs none of them: Pele lays out
Mermaid diagrams, pelext draws them on the terminal's cell grid, and
Prism reads code. To take a new release of one, name its version, then
test and commit both files:

    bun add --exact pelext@github:4our4ace/pelext#v0.2.2
    bun add --exact pele@1.8.0
    bun run test

Their licenses are in `THIRD_PARTY_NOTICES.md`, and so are those of
Bun's runtime, which `bun build --compile` puts in every file it makes:
as Bun lists them for the version the release is built on, with where
the LGPL parts' sources are. A release on another Bun takes that
section anew from that version's lists.
