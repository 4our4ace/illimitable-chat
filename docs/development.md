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
    vendor/        cellsmith's markdown parser and diagram engine

Each file starts with a comment on its design; the chat's SQLite file
is described end to end in [storage.md](storage.md). After `bun install`:

    bun run test     the tests
    bun run check    the type check (unused code fails it too)
    bun run start    illi from the source
    bun run build    one binary, ./illi

From source, without installing:

    git clone https://github.com/4our4ace/illimitable-chat
    bun illimitable-chat/src/main.ts
