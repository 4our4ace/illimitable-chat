Third-party notices
===================

The libraries compiled into illi (`package.json`'s dependencies, pinned in
`bun.lock`), each under the MIT License (one icon in Pele under ISC, and
pelext's character width table, generated from Unicode's data, under the
Unicode License v3); Bun's runtime, which each release file holds, under
the licenses Bun lists for it, the LGPL among them; and the color
schemes illi's palettes are drawn from (at the end).

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

pelext's table of how many cells a terminal gives each character is
generated from the [Unicode Character Database](https://www.unicode.org/ucd/)
18.0.0, under the Unicode License v3:

```
UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 1991-2026 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.
```

pelext's own license:

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
core and 40 languages, `src/ui/Prism.ts`).

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

## Bun's runtime

illi's release files (`illi-linux-x64`, `illi-linux-arm64`,
`illi-darwin-x64`, `illi-darwin-arm64`) are made with
`bun build --compile` on Bun 1.4.3 (`.github/workflows/release.yml`),
which bundles illi's code "along with a copy of the Bun runtime"
([Bun's docs](https://github.com/oven-sh/bun/blob/bun-v1.4.3/docs/bundler/executables.mdx)).
What that runtime carries, and under which licenses, is taken from
Bun's own documents for 1.4.3 (and, where a build script is linked,
from Bun's build scripts at that tag), not from a look into the files:

- [`LICENSE.md`](https://github.com/oven-sh/bun/blob/bun-v1.4.3/LICENSE.md)
  at the tag `bun-v1.4.3`
- [`docs/project/license.mdx`](https://github.com/oven-sh/bun/blob/bun-v1.4.3/docs/project/license.mdx)
  at the same tag

The two lists differ a little, as the table below marks, and Bun's
build at that tag also compiles `rust-argon2` (for `Bun.password`), a
Cargo dependency its build scripts fetch
([`scripts/build/deps/rust-argon2.ts`](https://github.com/oven-sh/bun/blob/bun-v1.4.3/scripts/build/deps/rust-argon2.ts)),
which neither names.

Bun itself is under the MIT License.

### The LGPL parts: JavaScriptCore, WebKit, TinyCC

Bun links JavaScriptCore and WebKit statically; both are under the
LGPL-2, and so are the WebCore files from WebKit; TinyCC, linked so too,
is under the LGPL v2.1. Bun's `LICENSE.md` quotes the LGPL's term for a
library linked so, that the application be given in an object form a
user can relink with a changed library, and gives the steps to relink
Bun with a changed WebKit (clone `oven-sh/WebKit` into `vendor/WebKit`,
`bun sync-webkit-source`, then `bun run build:local`). The sources for
Bun 1.4.3:

- Bun: [oven-sh/bun at `bun-v1.4.3`](https://github.com/oven-sh/bun/tree/bun-v1.4.3)
  (commit `c6da4a4d3010e5553438c60f6bd76d981976867c`)
- WebKit, as Bun patches it: [oven-sh/WebKit at `0c06faadf65bf8e8c8ad3a5a8aca83e1e9ed653f`](https://github.com/oven-sh/WebKit/tree/0c06faadf65bf8e8c8ad3a5a8aca83e1e9ed653f),
  the commit 1.4.3 pins (`WEBKIT_VERSION` in
  [`scripts/build/deps/webkit.ts`](https://github.com/oven-sh/bun/blob/bun-v1.4.3/scripts/build/deps/webkit.ts))
- TinyCC: [oven-sh/tinycc at `05f0fafaa3be31e31d7b4b5c17dc60f62c991171`](https://github.com/oven-sh/tinycc/tree/05f0fafaa3be31e31d7b4b5c17dc60f62c991171)
  with Bun's `patches/tinycc/tcc.h.patch`, as
  [`scripts/build/deps/tinycc.ts`](https://github.com/oven-sh/bun/blob/bun-v1.4.3/scripts/build/deps/tinycc.ts)
  pins them; Bun's build leaves it out only on Android and FreeBSD
  ([`scripts/build/config.ts`](https://github.com/oven-sh/bun/blob/bun-v1.4.3/scripts/build/config.ts)),
  so for all four of illi's systems

illi's own source is this repository.

### Libraries Bun links statically

| Library | License, as Bun lists it | Listed in |
| --- | --- | --- |
| [boringssl](https://boringssl.googlesource.com/boringssl/) | [several licenses](https://boringssl.googlesource.com/boringssl/+/refs/heads/master/LICENSE) | both |
| [brotli](https://github.com/google/brotli) | MIT | both |
| [libarchive](https://github.com/libarchive/libarchive) | [several licenses](https://github.com/libarchive/libarchive/blob/master/COPYING) | both |
| [lol-html](https://github.com/cloudflare/lol-html/tree/master/c-api) | BSD 3-Clause | both |
| [ls-hpack](https://github.com/litespeedtech/ls-hpack) | MIT (license.mdx: its bundled xxhash BSD 2-Clause) | both |
| [ls-qpack](https://github.com/litespeedtech/ls-qpack) | MIT | both |
| [lsquic](https://github.com/litespeedtech/lsquic) | MIT (portions derived from Chromium proto-quic, BSD 3-Clause) | both |
| [mimalloc](https://github.com/microsoft/mimalloc) | MIT | both |
| [picohttp](https://github.com/h2o/picohttpparser) | the Perl License or the MIT License | both |
| [zstd](https://github.com/facebook/zstd) | the BSD License or GPLv2 | both |
| [simdutf](https://github.com/simdutf/simdutf) | Apache 2.0 | both |
| [tinycc](https://github.com/tinycc/tinycc) | LGPL v2.1 | both |
| [uSockets](https://github.com/uNetworking/uSockets) | Apache 2.0 | both |
| [zlib-ng](https://github.com/zlib-ng/zlib-ng) | zlib | both |
| [c-ares](https://github.com/c-ares/c-ares) | MIT | both |
| [libicu](https://github.com/unicode-org/icu) 78 | [ICU license](https://github.com/unicode-org/icu/blob/main/icu4c/LICENSE) | both |
| [libbase64](https://github.com/aklomp/base64) | BSD 2-Clause | both |
| [libuv](https://github.com/libuv/libuv) | MIT; on Windows only, so in none of illi's files | both |
| [libdeflate](https://github.com/ebiggers/libdeflate) | MIT | both |
| [libjpeg-turbo](https://github.com/libjpeg-turbo/libjpeg-turbo) | [BSD 3-Clause / IJG / zlib](https://github.com/libjpeg-turbo/libjpeg-turbo/blob/main/LICENSE.md) | both |
| [libspng](https://github.com/randy408/libspng) | BSD 2-Clause (license.mdx: portions derived from libpng, PNG Reference Library License v2) | both |
| [libwebp](https://github.com/webmproject/libwebp) | BSD 3-Clause | both |
| [highway](https://github.com/google/highway) | Apache 2.0 | both |
| a fork of [uWebSockets](https://github.com/jarred-sumner/uwebsockets) | Apache 2.0 | both |
| parts of [TigerBeetle's IO code](https://github.com/tigerbeetle/tigerbeetle/blob/532c8b70b9142c17e07737ab6d3da68d7500cbca/src/io/windows.zig#L1) | Apache 2.0 | both |
| [uucode](https://github.com/jacobsandlund/uucode) | MIT | LICENSE.md |
| `__cxa_thread_atexit` fallback from [LLVM libc++abi](https://github.com/llvm/llvm-project/blob/llvmorg-19.1.0/libcxxabi/src/cxa_thread_atexit.cpp) | Apache 2.0 with LLVM exception | LICENSE.md |
| the type checker behind `bun check`, a port of [typescript-go](https://github.com/microsoft/typescript-go), with TypeScript's diagnostic messages and `lib.*.d.ts` files | Apache 2.0 | LICENSE.md |
| [HdrHistogram_c](https://github.com/HdrHistogram/HdrHistogram_c) | CC0 1.0 or the BSD 2-Clause License | license.mdx |
| [sqlite](https://sqlite.org) | [public domain](https://sqlite.org/copyright.html); on Linux and Windows (on macOS Bun loads the system's library: [`scripts/build/deps/sqlite.ts`](https://github.com/oven-sh/bun/blob/bun-v1.4.3/scripts/build/deps/sqlite.ts)) | license.mdx |

### Packages Bun embeds

Bun embeds these packages in its binary and injects one when it is
imported, each under the MIT License: acorn, acorn-walk, assert,
browserify-zlib, buffer, constants-browserify, crypto-browserify,
domain-browser, events, https-browserify, os-browserify,
path-browserify, process, punycode, querystring-es3, stream-browserify,
stream-http, string_decoder, timers-browserify, tty-browserify, url,
util and vm-browserify.

Bun also credits its JS transpiler and Node.js module resolver as a
port of [esbuild](https://github.com/evanw/esbuild) (both lists;
LICENSE.md names its CSS lexer too), and its CSS parser as derived from
[Lightning CSS](https://github.com/parcel-bundler/lightningcss) and
[Servo](https://github.com/servo/servo) (license.mdx), naming no
license for them.

## Color schemes

illi's palettes (`src/ui/Palettes.ts`) take their colors from these
schemes' published palettes, each under the MIT License.

| Palette | Source | Copyright |
| --- | --- | --- |
| `catppuccin-mocha`, `catppuccin-latte` | [catppuccin/palette](https://github.com/catppuccin/palette) | Copyright (c) 2021 Catppuccin |
| `dracula` | [draculatheme.com/spec](https://draculatheme.com/spec) (Classic), [dracula/dracula-theme](https://github.com/dracula/dracula-theme) | Copyright (c) 2023 Dracula Theme |
| `nord` | [nordtheme/nord](https://github.com/nordtheme/nord); its comments' tone from [nordtheme/vim](https://github.com/nordtheme/vim) | Copyright (c) 2016-present Sven Greb |
| `tokyo-night` | [tokyo-night/tokyo-night-vscode-theme](https://github.com/tokyo-night/tokyo-night-vscode-theme) | Copyright (c) 2018-present Enkia |
| `gruvbox-dark`, `gruvbox-light` | [morhetz/gruvbox](https://github.com/morhetz/gruvbox), its colors as [gruvbox-contrib](https://github.com/morhetz/gruvbox-contrib)'s `color.table` lists them | Pavel Pertsev, MIT/X11 as stated in its README |
| `rose-pine`, `rose-pine-dawn` | [rosepinetheme.com/palette](https://rosepinetheme.com/palette), [rose-pine/rose-pine-palette](https://github.com/rose-pine/rose-pine-palette) | Copyright (c) mvllow |
| `everforest` | [sainnhe/everforest](https://github.com/sainnhe/everforest) (palette.md, dark, medium contrast) | Copyright (c) 2019 sainnhe |
| `github-dark`, `github-light` | [primer/primitives](https://github.com/primer/primitives) 7.10.0 via [primer/github-vscode-theme](https://github.com/primer/github-vscode-theme) | Copyright (c) 2018 GitHub Inc. |
| `one-dark` | [atom/one-dark-syntax](https://github.com/atom/one-dark-syntax) | Copyright (c) 2016 GitHub Inc. |
| `solarized-dark`, `solarized-light` | [altercation/solarized](https://github.com/altercation/solarized) | Copyright (c) 2011 Ethan Schoonover |
