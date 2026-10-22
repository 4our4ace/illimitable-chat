cellsmith
=========

Two files of [cellsmith](https://github.com/4our4ace/cellsmith) (at
91c03a1), which illimitable draws replies with (Reply.ts, Draw.ts: its
renderer's look, ported to illimitable's lines). Copied, not edited, so
they can be copied again when cellsmith changes:

- `markdown.ts`: cellsmith's markdown parser (blocks and inline nodes:
  numbers, paths, alerts, tasks), which Reply.ts draws; its
  `plugin/hooks/markdown.ts`.
- `presets.ts`: cellsmith's 16 palettes; its `plugin/hooks/presets.ts`,
  its first line (a type import) made a local type.

The diagrams and the code's colors come from libraries instead
(`package.json`: Pele, pelext, Prism; `THIRD_PARTY_NOTICES.md` at the
top). MIT: cellsmith's `LICENSE` is here, and `THIRD_PARTY_NOTICES.md`
keeps the parts of cellsmith's notices these files need.
