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
                   (Modes.ts), the logo in block glyphs (Logo.ts)
    src/chat/      the chat's turns (Chat.ts), its memory tree and views (Memory.ts),
                   the summaries written (Compactor.ts), its SQLite file (Store.ts),
                   its lock (Lock.ts), suggested replies (Suggest.ts), agents' logs
                   (Logs.ts), /export and /tree (Export.ts), projects (Projects.ts)
                   and their searches' threads (Seeker.ts), the radar's search of
                   past topics (Radar.ts) and its strong lines given to the model
                   (Recall.ts), a second terminal's view (Remote.ts), times as
                   people say them (When.ts), the disk
    src/ai/        the agent loop, picks, token usage
    src/providers/ the providers, a folder each (its facts, its code, its
                   /login page) and their lists (new-provider.md)
    src/tools/     shell and files, MCP servers, the prompts; the permissions:
                   what each call asks leave for (Access.ts; bash read as bash
                   reads it, Shell.ts), the rules and what "don't ask again"
                   saved (Permissions.ts)
    src/config/    settings, profiles, your agents, commands and skills (Custom.ts),
                   plugins (Plugins.ts; a plugin's folder read: Bundle.ts), hooks
                   (Hooks.ts) and the commands they and the status line run
                   (Run.ts), a project's files as last seen (Seen.ts), updates,
                   the folders you trust (Trusted.ts), the accounts /login
                   connected (Accounts.ts; a change's lock, Flock.ts)
    src/skills/    the skills built into illi (customize-illi)
    test/          tests across modules; each module's own sit beside it
    examples/      agents, a command, hooks, a plugin and a theme to copy
                   (customize.md)
    assets/        the README's banner and screenshots; logo.svg and
                   logo-on-dark.svg are the logo's source files (the
                   trust question draws it fitted in block glyphs:
                   src/ui/Logo.ts)

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
    ./src/main.ts

Run it as a program (`./src/main.ts`, or a launcher that `exec`s that
path), not as `bun src/main.ts`: its first line starts Bun with
`--no-env-file --config=/dev/null`, so a project's own `bunfig.toml`
(whose `preload` would run before illi) and `.env` (whose `ILLI_*`
variables would be settings) are never read. Every build of the one
file leaves them out too (`--no-compile-autoload-bunfig
--no-compile-autoload-dotenv`); `test/folder.test.ts` checks both.
The same test checks that a program of illi's own run by name (`bash`,
`ps`, `claude`…) is found in `PATH`'s absolute folders alone
(`Run.own_path`), never in a project's `node_modules/.bin` or `.`.

A release is a tag `vX.Y.Z` naming `package.json`'s version: the
workflow (`.github/workflows/release.yml`) type-checks and tests it,
builds one file per system (`illi-linux-x64`, `illi-linux-arm64`,
`illi-darwin-x64`, `illi-darwin-arm64`) and publishes them with their
`SHA256SUMS`. Every installed illi takes the latest as it next starts
(`src/config/Update.ts`; `autoupdate` in [Config](config.md)): it
checks the file against the sums, runs it with `--version`, which must
print exactly `illi X.Y.Z` (main.ts), then renames it over itself. `bun
run build`'s `./illi` is such a file and updates itself too
(`ILLI_AUTOUPDATE=off` keeps it); a source run never does.

Once the release is out, `.github/workflows/upgrade.yml` tries that on
each of the four systems, on GitHub's own machines, from the release
before it: `illi upgrade` must leave the new one, the chat started on a
terminal (a pty, no key pressed) must install it by itself, and a fresh
`install.sh` must too. It also runs by hand (Actions, upgrade, Run
workflow), trying the latest release against the one before.

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

Google's Antigravity CLI, which the Google AI plan runs
(`src/providers/antigravity`), and GitHub's Copilot CLI, which the
GitHub Copilot plan runs (`src/providers/github-copilot`), are pinned
too, though not built in. Both are found and downloaded the same way
(`src/providers/Cli.ts`, each CLI by its spec: `Agy.ts`,
`CopilotCli.ts`): each illi runs the user's own `agy` or `copilot` when
it is its `MINIMUM` or later (the oldest version tried with illi:
`agy` 1.5.2, `copilot` 1.0.100), else the one version its `Pinned.ts`
names for its machine, the one tried with it, and /login downloads
that one, checked against the checksum there. To take a new version:
write the table anew from the CLI's releases on GitHub (its `pin.ts`,
through `src/providers/Pin.ts`: the latest release or the one named;
each machine's archive, with the checksum and size GitHub tells,
downloaded whole to check it and list its files, as illi unpacks
them). For Google's CLI, run the
live trial on it, Google's real CLI through illi's runner against a
stand-in for Google's services, no model asked nor account signed in,
nothing sent to Google (the build downloaded once into the folder
named, kept for the next trial; it checks the CLI says it's the pinned
version and tries a turn, tools, a picture, thoughts, a stop, a full
window, two calls at once and the CLI's web search, and that it leaves
nothing behind); then test and commit:

    bun src/providers/antigravity/pin.ts [version]
    ILLI_AGY_LIVE=~/.cache/illi-agy-live bun test --isolate src/providers/antigravity/Live.test.ts
    bun run test

The trial runs this machine's build alone; the others are checked
against their checksums and sizes. Once a release carries the new
version, each illi offers it in /login, and the older one goes once no
illi still running uses it. A new CLI may change what illi reads of it
(how it names illi's tools, the words it fails in, the files it leaves
in an account's folder): the trial is what tells. Raising `MINIMUM`
is for a version illi needs; a user's own CLI older than it is said,
not run.

For GitHub's CLI, the live trial runs the CLI named through illi's
runner against a stand-in for the model's API (the CLI's
bring-your-own-key provider) and for illi's tools, no account signed
in, nothing sent to GitHub's models: a turn (illi's prompt alone,
illi's tools alone), a tool called, a full window, a stop, two calls at
once on one CLI, its web fetch asking illi first, and nothing left
behind. Run it on the newly pinned release, this machine's archive
unpacked into a folder of its own (the CLI's first run unpacks about
260 MB more into `COPILOT_PKG_CACHE_HOME`, kept there for the next
trial, out of your own cache), then test and commit:

    bun src/providers/github-copilot/pin.ts [tag]
    mkdir -p ~/.cache/illi-copilot-live
    curl -fsSL https://github.com/github/copilot-cli/releases/download/<tag>/copilot-linux-x64.tar.gz | tar xz -C ~/.cache/illi-copilot-live
    ILLI_COPILOT_LIVE=~/.cache/illi-copilot-live/copilot COPILOT_PKG_CACHE_HOME=~/.cache/illi-copilot-live bun test --isolate src/providers/github-copilot/Live.test.ts
    bun run test

(`copilot-darwin-arm64.tar.gz` on an Apple silicon Mac, and so on.)

Run it before a release too, on your own `copilot`, and when GitHub's
CLI changes much. `MINIMUM` is the oldest release the trial passed
on (1.0.98 and before don't take `--disable-client-telemetry`); illi
also checks the CLI speaks its SDK's protocol (`PROTOCOL` in
`Copilot.ts`, 3), and says, not runs, one that doesn't.

The search model (`src/chat/Embed.ts`: MinishLab's potion-code-16M-v2,
for search by meaning) is pinned the same way: a Hugging Face revision
and each file's size and SHA-256 (`MODEL`). The tests run on a tiny
model of their own (`test/model.ts`) and keep `meaning` off, so none
downloads it. To check illi's encoder against the real model (its
tokens and values, as MinishLab's Python gives them), download it once
into a folder kept for the next check, then run:

    ILLI_EMBED_LIVE=~/.cache/illi-embed-live bun test --isolate src/chat/Embed.test.ts

To take a new revision or model: its files' sizes and SHA-256 (Hugging
Face's LFS hash for the table; the small files hashed yourself), the
reference values in `Embed.test.ts` anew from MinishLab's Python, and
`VECTORS` moves on by itself, so the model goes in a folder of its own
(the earlier one removed once it's in) and each file's vectors are made
anew.
