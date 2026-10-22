// Prism
// =====
// Prism (prismjs) with the languages a reply's code is colored in, which
// Draw.ts loads as it first reads code: Prism's core, made global, as
// each language expects it, then the languages, each after those it
// builds on (the 24 cellsmith colors).

// a token: plain text, or a kind of text holding more
export type PrismToken = string | { type: string; alias?: string | string[]; content: PrismToken | PrismToken[] };

const Prism = require("prismjs/components/prism-core.js");
(globalThis as { Prism?: unknown }).Prism = Prism;
require("prismjs/components/prism-clike.js");
require("prismjs/components/prism-markup.js");
require("prismjs/components/prism-css.js");
require("prismjs/components/prism-javascript.js");
require("prismjs/components/prism-typescript.js");
require("prismjs/components/prism-jsx.js");
require("prismjs/components/prism-tsx.js");
require("prismjs/components/prism-python.js");
require("prismjs/components/prism-go.js");
require("prismjs/components/prism-rust.js");
require("prismjs/components/prism-java.js");
require("prismjs/components/prism-kotlin.js");
require("prismjs/components/prism-swift.js");
require("prismjs/components/prism-c.js");
require("prismjs/components/prism-cpp.js");
require("prismjs/components/prism-csharp.js");
require("prismjs/components/prism-ruby.js");
require("prismjs/components/prism-json.js");
require("prismjs/components/prism-yaml.js");
require("prismjs/components/prism-toml.js");
require("prismjs/components/prism-sql.js");
require("prismjs/components/prism-diff.js");
require("prismjs/components/prism-docker.js");
require("prismjs/components/prism-hcl.js");

// the languages known, by name (an alias too)
export const languages: Record<string, unknown> = Prism.languages;

// code's tokens by a language's grammar
export function tokenize(code: string, grammar: unknown): PrismToken[] {
  return Prism.tokenize(code, grammar);
}
