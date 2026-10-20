cellsmith
=========

The diagram engine and markdown parser of
[cellsmith](https://github.com/4our4ace/cellsmith) (at 3b987bd), which
Illimitable draws replies with (Draw.ts, Reply.ts: its renderer's look,
ported to Illimitable's lines). Copied, not edited, so they can be copied
again when cellsmith changes:

- `markdown.ts`: cellsmith's markdown parser (blocks and inline nodes:
  numbers, paths, alerts, tasks), which Reply.ts draws; its
  `plugin/hooks/markdown.ts`.
- `pele.ts`: Pele's SVG to terminal cells (box lines, block fills,
  braille, text); cellsmith's `plugin/hooks/pele.ts`.
- `presets.ts`: cellsmith's 16 palettes; its `plugin/hooks/presets.ts`,
  its first line (a type import) made a local type.
- `vendor/`: cellsmith's `plugin/hooks/vendor/`, built by its
  `scripts/build-vendor.mjs`: Pele 1.6.0 (13 diagram types),
  beautiful-mermaid 1.1.3 (the box-art fallback) and Prism 1.30.0
  (code, 24 languages).

All MIT: cellsmith's `LICENSE` and `THIRD_PARTY_NOTICES.md` are here.
