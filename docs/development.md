Development
===========

    src/main.ts    the illi command
    src/term/      the terminal app: keys, selection, commands, side panel
    src/ui/        the chat's view, markdown, replies, diagrams, the screen
    src/chat/      the chat, its memory tree (Memory.ts), its SQLite file (Store.ts),
                   projects (Projects.ts) and their search's thread (Seeker.ts), a
                   second terminal's view (Remote.ts), the disk
    src/ai/        model vendors, the agent loop, picks, token usage
    src/tools/     shell and files, MCP servers, the prompts
    src/config/    settings, profiles, your agents, commands and skills
    src/skills/    the skills built into illi (customize-illi)
    test/          tests across modules; each module's own sit beside it
    vendor/        cellsmith's markdown parser and palettes
    assets/        the README's banner and screenshots; logo.svg and
                   logo-on-dark.svg are the logo's source files, kept
                   for brand use though no page shows them

Each file starts with a comment on its design; the chat's SQLite files
are described end to end in [storage.md](storage.md). After `bun install`:

    bun run test     the tests
    bun run check    the type check (unused code fails it too)
    bun run start    illi from the source
    bun run build    one binary, ./illi

From source, without installing:

    git clone https://github.com/4our4ace/illimitable-chat
    cd illimitable-chat && bun install
    bun src/main.ts

The libraries illi is built with are three, each pinned to one version
in `package.json` (`bun.lock` holds the exact commit or file hash) and
compiled into the binary, so a user installs none of them: Pele lays out
Mermaid diagrams, pelext draws them on the terminal's cell grid, and
Prism reads code. To take a new release of one, name its version, then
test and commit both files:

    bun add --exact pelext@github:4our4ace/pelext#v0.2.2
    bun add --exact pele@1.8.0
    bun run test
