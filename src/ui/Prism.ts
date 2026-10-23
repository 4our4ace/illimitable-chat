// Prism
// =====
// Prism, with the languages a reply's code is read in (Draw.ts
// draw_code; a shell's is read there, never here). Prism's languages are
// scripts that add themselves to a global Prism, so its core comes
// first, then each language after those it builds on or reaches into
// (markup before what embeds in it, yaml before markdown's front
// matter). Each is named here in full, never looked up, so the binary
// bundles them all. This module loads only as the first code not a
// shell's is drawn: Prism takes tens of ms.

// Types
// =====

// a piece of code as Prism reads it: text, or a token (its type, its
// aliases, what it holds)
export type PrismToken = string | { type: string; alias?: string | string[]; content: PrismToken | PrismToken[] };

type Core = { languages: Record<string, unknown>; tokenize: (code: string, grammar: unknown) => PrismToken[] };

// Prism
// =====

const prism = require("prismjs/components/prism-core.js") as Core;
require("prismjs/components/prism-markup.js");
require("prismjs/components/prism-css.js");
require("prismjs/components/prism-clike.js");
require("prismjs/components/prism-regex.js");
require("prismjs/components/prism-javascript.js");
require("prismjs/components/prism-typescript.js");
require("prismjs/components/prism-jsx.js");
require("prismjs/components/prism-tsx.js");
require("prismjs/components/prism-json.js");
require("prismjs/components/prism-yaml.js");
require("prismjs/components/prism-markdown.js");
require("prismjs/components/prism-diff.js");
require("prismjs/components/prism-python.js");
require("prismjs/components/prism-c.js");
require("prismjs/components/prism-cpp.js");
require("prismjs/components/prism-csharp.js");
require("prismjs/components/prism-java.js");
require("prismjs/components/prism-kotlin.js");
require("prismjs/components/prism-scala.js");
require("prismjs/components/prism-go.js");
require("prismjs/components/prism-rust.js");
require("prismjs/components/prism-swift.js");
require("prismjs/components/prism-dart.js");
require("prismjs/components/prism-ruby.js");
require("prismjs/components/prism-markup-templating.js");
require("prismjs/components/prism-php.js");
require("prismjs/components/prism-perl.js");
require("prismjs/components/prism-lua.js");
require("prismjs/components/prism-r.js");
require("prismjs/components/prism-haskell.js");
require("prismjs/components/prism-elixir.js");
require("prismjs/components/prism-zig.js");
require("prismjs/components/prism-sql.js");
require("prismjs/components/prism-graphql.js");
require("prismjs/components/prism-scss.js");
require("prismjs/components/prism-toml.js");
require("prismjs/components/prism-ini.js");
require("prismjs/components/prism-docker.js");
require("prismjs/components/prism-makefile.js");
require("prismjs/components/prism-nix.js");
require("prismjs/components/prism-hcl.js");
require("prismjs/components/prism-latex.js");

// each grammar by its name and its aliases (Prism's helpers, extend and
// the like, are among them: a grammar is an object)
export const languages: Record<string, unknown> = prism.languages;

// code as a grammar reads it
export function tokenize(code: string, grammar: unknown): PrismToken[] {
  return prism.tokenize(code, grammar);
}
