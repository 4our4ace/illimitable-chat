Third-party notices
===================

The libraries compiled into illi (`package.json`'s dependencies, pinned in
`bun.lock`), each under the MIT License, and the code adapted from
prismantis (at the end), under the MIT License too.

## Pele

[Pele](https://github.com/obsidianmd/pele) lays out the Mermaid diagrams.

```
MIT License

Copyright (c) 2026 kepano

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

The reset icon of the zoom controls is "rotate-ccw" from Lucide v1.14.0
(https://lucide.dev), under the ISC License:

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## pelext

[pelext](https://github.com/4our4ace/pelext) draws Pele's layouts on the
terminal's cell grid.

```
MIT License

Copyright (c) 2026 4our4ace

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Prism

[Prism](https://github.com/PrismJS/prism) reads the code in replies (its
core and 24 languages, `src/ui/Prism.ts`).

```
MIT LICENSE

Copyright (c) 2012 Lea Verou

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## prismantis

[prismantis](https://github.com/NahumLitvin/prismantis) 0.14.0: how illi
draws a reply is adapted from its `hooks/` (`markdown.ts`, `presets.ts`,
`render.tsx`, `mermaid.tsx`): the markdown parser (`src/ui/Markdown.ts`),
the palettes (`src/ui/Palettes.ts`), the languages Prism loads
(`src/ui/Prism.ts`), most of `src/ui/Reply.ts`, and parts of
`src/ui/Draw.ts` and `src/ui/Theme.ts`.

```
MIT License

Copyright (c) 2026 Nahum Litvin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Each palette maps a published color scheme onto illi's slots. All are
MIT licensed.

| Palette | Source | Copyright |
| --- | --- | --- |
| `catppuccin-mocha`, `catppuccin-latte` | [catppuccin/palette](https://github.com/catppuccin/palette) | Copyright (c) 2021 Catppuccin |
| `dracula` | [dracula/dracula-theme](https://github.com/dracula/dracula-theme) | Copyright (c) 2023 Dracula Theme |
| `nord` | [nordtheme/nord](https://github.com/nordtheme/nord) | Copyright (c) 2016-present Sven Greb |
| `tokyo-night` | [tokyo-night/tokyo-night-vscode-theme](https://github.com/tokyo-night/tokyo-night-vscode-theme) | Copyright (c) 2018-present Enkia |
| `gruvbox-dark`, `gruvbox-light` | [morhetz/gruvbox](https://github.com/morhetz/gruvbox) | Pavel Pertsev, MIT/X11 as stated in its README |
| `rose-pine`, `rose-pine-dawn` | [rose-pine/rose-pine-palette](https://github.com/rose-pine/rose-pine-palette) | Copyright (c) mvllow |
| `everforest` | [sainnhe/everforest](https://github.com/sainnhe/everforest) | Copyright (c) 2019 sainnhe |
| `github-dark`, `github-light` | [primer/primitives](https://github.com/primer/primitives) 7.10.0 via [primer/github-vscode-theme](https://github.com/primer/github-vscode-theme) | Copyright (c) 2018 GitHub Inc. |
| `one-dark` | [atom/one-dark-syntax](https://github.com/atom/one-dark-syntax) | Copyright (c) 2016 GitHub Inc. |
| `solarized-dark`, `solarized-light` | [altercation/solarized](https://github.com/altercation/solarized) | Copyright (c) 2011 Ethan Schoonover |
