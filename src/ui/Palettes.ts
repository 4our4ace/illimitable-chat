// Palettes
// ========
// The palettes a reply and its diagrams draw in (Theme.PALETTE, Draw.ts):
// each named for a published color scheme, made from that scheme's own
// colors (its source's names kept, SCHEMES) by its role in a reply
// (PALETTES): code's tokens as the scheme's style guide colors them
// (keywords, strings, functions, comments, numbers), titles, links and
// types where it names them, the rest by kin (a path a cyan or teal, a
// bullet the accent). Comments, quotes and rules are faint, in its
// muted tones; every other slot reads on its background (CANVAS) at
// about 3:1 or more (Palettes.test.ts), so a role whose own color won't
// takes the scheme's nearest that will. "mono" has none: the terminal's
// own ink. The schemes' sources and licenses: THIRD_PARTY_NOTICES.md.
//
// A palette's slots: accent (third-level headings, the quote bar,
// buttons, a diagram's accent), heading, tableHeader, strong, emphasis
// (and math), inlineCode, codeText, codeCommand, codeFlag, codeString,
// codeComment (and code's header), link, path, number, quote, rule,
// tableRule, bullet, diagram (its lines), diagramText.

// Types
// =====

type Slots = Record<string, string>;

// Schemes
// =======
// Each scheme's colors as its source publishes them, by its own names

// catppuccin/palette (palette.json), Mocha and Latte
const MOCHA = {
  rosewater: "#f5e0dc", flamingo: "#f2cdcd", pink: "#f5c2e7", mauve: "#cba6f7", red: "#f38ba8", maroon: "#eba0ac", peach: "#fab387",
  yellow: "#f9e2af", green: "#a6e3a1", teal: "#94e2d5", sky: "#89dceb", sapphire: "#74c7ec", blue: "#89b4fa", lavender: "#b4befe",
  text: "#cdd6f4", subtext1: "#bac2de", subtext0: "#a6adc8", overlay2: "#9399b2", overlay1: "#7f849c", overlay0: "#6c7086",
  surface2: "#585b70", surface1: "#45475a", surface0: "#313244", base: "#1e1e2e", mantle: "#181825", crust: "#11111b",
};
const LATTE: typeof MOCHA = {
  rosewater: "#dc8a78", flamingo: "#dd7878", pink: "#ea76cb", mauve: "#8839ef", red: "#d20f39", maroon: "#e64553", peach: "#fe640b",
  yellow: "#df8e1d", green: "#40a02b", teal: "#179299", sky: "#04a5e5", sapphire: "#209fb5", blue: "#1e66f5", lavender: "#7287fd",
  text: "#4c4f69", subtext1: "#5c5f77", subtext0: "#6c6f85", overlay2: "#7c7f93", overlay1: "#8c8fa1", overlay0: "#9ca0b0",
  surface2: "#acb0be", surface1: "#bcc0cc", surface0: "#ccd0da", base: "#eff1f5", mantle: "#e6e9ef", crust: "#dce0e8",
};

// draculatheme.com/spec, Dracula Classic
const DRACULA = {
  background: "#282a36", selection: "#44475a", foreground: "#f8f8f2", comment: "#6272a4", red: "#ff5555", orange: "#ffb86c",
  yellow: "#f1fa8c", green: "#50fa7b", cyan: "#8be9fd", purple: "#bd93f9", pink: "#ff79c6",
};

// nordtheme.com, its colors and palettes: Polar Night (nord0-3), Snow
// Storm (nord4-6), Frost (nord7-10), Aurora (nord11-15)
const NORD = {
  nord0: "#2e3440", nord1: "#3b4252", nord2: "#434c5e", nord3: "#4c566a", nord4: "#d8dee9", nord5: "#e5e9f0", nord6: "#eceff4",
  nord7: "#8fbcbb", nord8: "#88c0d0", nord9: "#81a1c1", nord10: "#5e81ac", nord11: "#bf616a", nord12: "#d08770", nord13: "#ebcb8b",
  nord14: "#a3be8c", nord15: "#b48ead",
};

// tokyo-night-vscode-theme's README palette, Night, named by its uses
const TOKYO_NIGHT = {
  red: "#f7768e", orange: "#ff9e64", yellow: "#e0af68", parameter: "#cfc9c2", green: "#9ece6a", teal: "#73daca", regex: "#b4f9f8",
  support: "#2ac3de", cyan: "#7dcfff", blue: "#7aa2f7", magenta: "#bb9af7", variable: "#c0caf5", foreground: "#a9b1d6",
  markdown: "#9aa5ce", comment: "#565f89", black: "#414868", background: "#1a1b26",
};

// gruvbox's palette (gruvbox-contrib's color.table) as each mode takes
// it: dark, its bright colors on dark0; light, its faded ones on light0
const GRUVBOX_DARK = {
  bg0: "#282828", bg3: "#665c54", bg4: "#7c6f64", fg0: "#fbf1c7", fg1: "#ebdbb2", fg3: "#bdae93", fg4: "#a89984", gray: "#928374",
  red: "#fb4934", green: "#b8bb26", yellow: "#fabd2f", blue: "#83a598", purple: "#d3869b", aqua: "#8ec07c", orange: "#fe8019",
};
const GRUVBOX_LIGHT: typeof GRUVBOX_DARK = {
  bg0: "#fbf1c7", bg3: "#bdae93", bg4: "#a89984", fg0: "#282828", fg1: "#3c3836", fg3: "#665c54", fg4: "#7c6f64", gray: "#928374",
  red: "#9d0006", green: "#79740e", yellow: "#b57614", blue: "#076678", purple: "#8f3f71", aqua: "#427b58", orange: "#af3a03",
};

// rosepinetheme.com/palette, Rosé Pine and Rosé Pine Dawn, by role
const ROSE_PINE = {
  base: "#191724", surface: "#1f1d2e", overlay: "#26233a", muted: "#6e6a86", subtle: "#908caa", text: "#e0def4", love: "#eb6f92",
  gold: "#f6c177", rose: "#ebbcba", pine: "#31748f", foam: "#9ccfd8", iris: "#c4a7e7", highlightMed: "#403d52", highlightHigh: "#524f67",
};
const ROSE_PINE_DAWN: typeof ROSE_PINE = {
  base: "#faf4ed", surface: "#fffaf3", overlay: "#f2e9e1", muted: "#9893a5", subtle: "#797593", text: "#464261", love: "#b4637a",
  gold: "#ea9d34", rose: "#d7827e", pine: "#286983", foam: "#56949f", iris: "#907aa9", highlightMed: "#dfdad9", highlightHigh: "#cecacd",
};

// everforest's palette.md, dark, medium contrast
const EVERFOREST = {
  bg0: "#2d353b", bg4: "#4f585e", fg: "#d3c6aa", red: "#e67e80", orange: "#e69875", yellow: "#dbbc7f", green: "#a7c080",
  aqua: "#83c092", blue: "#7fbbb3", purple: "#d699b6", grey0: "#7a8478", grey1: "#859289", grey2: "#9da9a0",
};

// primer/primitives 7.10.0, as GitHub's own VS Code theme takes it: its
// functional colors and its syntax ("prettylights") colors
const GITHUB_DARK = {
  canvas: "#0d1117", fg: "#c9d1d9", muted: "#8b949e", border: "#30363d", accent: "#58a6ff", comment: "#8b949e", constant: "#79c0ff",
  entity: "#d2a8ff", keyword: "#ff7b72", string: "#a5d6ff", heading: "#1f6feb",
};
const GITHUB_LIGHT: typeof GITHUB_DARK = {
  canvas: "#ffffff", fg: "#24292f", muted: "#57606a", border: "#d0d7de", accent: "#0969da", comment: "#6e7781", constant: "#0550ae",
  entity: "#8250df", keyword: "#cf222e", string: "#0a3069", heading: "#0550ae",
};

// atom/one-dark-syntax's colors.less (its HSL values as #rrggbb)
const ONE_DARK = {
  bg: "#282c34", mono1: "#abb2bf", mono2: "#828997", mono3: "#5c6370", cyan: "#56b6c2", blue: "#61afef", purple: "#c678dd",
  green: "#98c379", red: "#e06c75", orange: "#d19a66", orange2: "#e5c07b", accent: "#528bff",
};

// ethanschoonover.com/solarized: its base tones, dark to light, and its
// accents, shared by both modes
const SOLARIZED = {
  base03: "#002b36", base02: "#073642", base01: "#586e75", base00: "#657b83", base0: "#839496", base1: "#93a1a1", base2: "#eee8d5",
  base3: "#fdf6e3", yellow: "#b58900", orange: "#cb4b16", red: "#dc322f", magenta: "#d33682", violet: "#6c71c4", blue: "#268bd2",
  cyan: "#2aa198", green: "#859900",
};

// Roles
// =====

// Catppuccin, by its style guide: keywords mauve, functions and links
// blue, strings green, numbers peach, types yellow, comments overlay 2,
// titles red (its rainbow's first), labels subtext 0, borders overlay 0,
// bold the text; mauve the accent. Latte's peach, yellow, pink and
// sapphire, too pale on its base, give way to maroon, mauve and teal
function palette_catppuccin(c: typeof MOCHA, light: boolean): Slots {
  return {
    accent     : c.mauve,
    heading    : c.red,
    tableHeader: light ? c.maroon : c.yellow,
    strong     : c.text,
    emphasis   : light ? c.mauve : c.pink,
    inlineCode : c.teal,
    codeText   : c.text,
    codeCommand: c.blue,
    codeFlag   : c.mauve,
    codeString : c.green,
    codeComment: c.overlay2,
    link       : c.blue,
    path       : light ? c.teal : c.sapphire,
    number     : light ? c.maroon : c.peach,
    quote      : c.overlay2,
    rule       : c.overlay0,
    tableRule  : c.overlay0,
    bullet     : c.mauve,
    diagram    : c.subtext0,
    diagramText: c.text,
  };
}

// Dracula, by its spec: keywords pink, functions green, types cyan,
// strings yellow, numbers orange, comments its comment, headings purple
// (its accent too); links cyan
function palette_dracula(c: typeof DRACULA): Slots {
  return {
    accent     : c.purple,
    heading    : c.purple,
    tableHeader: c.cyan,
    strong     : c.foreground,
    emphasis   : c.yellow,
    inlineCode : c.green,
    codeText   : c.foreground,
    codeCommand: c.green,
    codeFlag   : c.pink,
    codeString : c.yellow,
    codeComment: c.comment,
    link       : c.cyan,
    path       : c.pink,
    number     : c.orange,
    quote      : c.comment,
    rule       : c.comment,
    tableRule  : c.comment,
    bullet     : c.purple,
    diagram    : c.comment,
    diagramText: c.foreground,
  };
}

// Nord, by its colors' uses: nord8 the primary accent and functions,
// nord9 keywords, nord7 types, nord14 strings, nord15 numbers, nord3
// comments and guides, nord4 the text, nord6 text that needs attention;
// a quote in nord4 (nord3 is too faint for prose)
function palette_nord(c: typeof NORD): Slots {
  return {
    accent     : c.nord8,
    heading    : c.nord8,
    tableHeader: c.nord7,
    strong     : c.nord6,
    emphasis   : c.nord13,
    inlineCode : c.nord14,
    codeText   : c.nord4,
    codeCommand: c.nord8,
    codeFlag   : c.nord9,
    codeString : c.nord14,
    codeComment: c.nord3,
    link       : c.nord8,
    path       : c.nord7,
    number     : c.nord15,
    quote      : c.nord4,
    rule       : c.nord3,
    tableRule  : c.nord3,
    bullet     : c.nord8,
    diagram    : c.nord9,
    diagramText: c.nord4,
  };
}

// Tokyo Night, by its palette's uses: markdown headings and code cyan,
// markdown links teal, function names blue (the accent), keywords
// magenta, strings green, numbers orange, comments its comment
function palette_tokyo_night(c: typeof TOKYO_NIGHT): Slots {
  return {
    accent     : c.blue,
    heading    : c.cyan,
    tableHeader: c.yellow,
    strong     : c.variable,
    emphasis   : c.magenta,
    inlineCode : c.cyan,
    codeText   : c.foreground,
    codeCommand: c.blue,
    codeFlag   : c.magenta,
    codeString : c.green,
    codeComment: c.comment,
    link       : c.teal,
    path       : c.support,
    number     : c.orange,
    quote      : c.comment,
    rule       : c.black,
    tableRule  : c.black,
    bullet     : c.blue,
    diagram    : c.markdown,
    diagramText: c.foreground,
  };
}

// gruvbox, by its own highlighting: titles, functions and strings green,
// keywords red, types yellow, numbers purple, markdown code aqua, links
// blue, italics fg3, comments gray; orange the accent
function palette_gruvbox(c: typeof GRUVBOX_DARK): Slots {
  return {
    accent     : c.orange,
    heading    : c.green,
    tableHeader: c.yellow,
    strong     : c.fg0,
    emphasis   : c.fg3,
    inlineCode : c.aqua,
    codeText   : c.fg1,
    codeCommand: c.green,
    codeFlag   : c.red,
    codeString : c.green,
    codeComment: c.gray,
    link       : c.blue,
    path       : c.aqua,
    number     : c.purple,
    quote      : c.gray,
    rule       : c.bg4,
    tableRule  : c.bg4,
    bullet     : c.orange,
    diagram    : c.fg4,
    diagramText: c.fg1,
  };
}

// Rosé Pine, by its roles: functions pine, strings gold, builtins love,
// booleans rose, object keys foam, links and hints iris (the accent),
// comments muted, borders highlight high. Dawn's gold and rose, too pale
// on its base, give way to pine, foam, love and iris
function palette_rose_pine(c: typeof ROSE_PINE, light: boolean): Slots {
  return {
    accent     : c.iris,
    heading    : light ? c.love : c.rose,
    tableHeader: light ? c.pine : c.gold,
    strong     : c.text,
    emphasis   : light ? c.iris : c.rose,
    inlineCode : c.foam,
    codeText   : c.text,
    codeCommand: c.pine,
    codeFlag   : c.love,
    codeString : light ? c.foam : c.gold,
    codeComment: c.muted,
    link       : c.iris,
    path       : c.pine,
    number     : light ? c.love : c.rose,
    quote      : c.subtle,
    rule       : c.highlightHigh,
    tableRule  : c.highlightHigh,
    bullet     : c.iris,
    diagram    : c.subtle,
    diagramText: c.text,
  };
}

// Everforest, by its highlighting semantics: titles orange, keywords
// red, types yellow, functions and strings green (the accent), constants
// aqua, identifiers blue, numbers purple, comments and borders grey1
function palette_everforest(c: typeof EVERFOREST): Slots {
  return {
    accent     : c.green,
    heading    : c.orange,
    tableHeader: c.yellow,
    strong     : c.fg,
    emphasis   : c.purple,
    inlineCode : c.aqua,
    codeText   : c.fg,
    codeCommand: c.green,
    codeFlag   : c.red,
    codeString : c.green,
    codeComment: c.grey1,
    link       : c.blue,
    path       : c.aqua,
    number     : c.purple,
    quote      : c.grey1,
    rule       : c.grey0,
    tableRule  : c.grey0,
    bullet     : c.green,
    diagram    : c.grey1,
    diagramText: c.fg,
  };
}

// GitHub, by its syntax colors: keywords, entities (functions), strings,
// constants, comments, markup headings; bold, italics and table heads in
// its text; its accent links and the accent, its border the rules
function palette_github(c: typeof GITHUB_DARK): Slots {
  return {
    accent     : c.accent,
    heading    : c.heading,
    tableHeader: c.fg,
    strong     : c.fg,
    emphasis   : c.fg,
    inlineCode : c.string,
    codeText   : c.fg,
    codeCommand: c.entity,
    codeFlag   : c.keyword,
    codeString : c.string,
    codeComment: c.comment,
    link       : c.accent,
    path       : c.constant,
    number     : c.constant,
    quote      : c.muted,
    rule       : c.border,
    tableRule  : c.border,
    bullet     : c.accent,
    diagram    : c.muted,
    diagramText: c.fg,
  };
}

// One Dark, by its syntax: keywords and italics purple, functions blue,
// strings and raw markup green, constants and bold orange, classes the
// second orange, headings red, links cyan, comments mono 3; its accent
function palette_one_dark(c: typeof ONE_DARK): Slots {
  return {
    accent     : c.accent,
    heading    : c.red,
    tableHeader: c.orange2,
    strong     : c.orange,
    emphasis   : c.purple,
    inlineCode : c.green,
    codeText   : c.mono1,
    codeCommand: c.blue,
    codeFlag   : c.purple,
    codeString : c.green,
    codeComment: c.mono3,
    link       : c.cyan,
    path       : c.cyan,
    number     : c.orange,
    quote      : c.mono3,
    rule       : c.mono3,
    tableRule  : c.mono3,
    bullet     : c.accent,
    diagram    : c.mono2,
    diagramText: c.mono1,
  };
}

// Solarized, by its own highlighting: statements (keywords) green,
// identifiers blue, constants (strings, numbers) cyan, types yellow,
// titles orange, underlined violet; each mode's body text, comments
// (secondary) and emphasized tones, lines a step off the body text
function palette_solarized(c: typeof SOLARIZED, light: boolean): Slots {
  const [body, comment, emphasized, line] = light ? [c.base00, c.base1, c.base01, c.base0] : [c.base0, c.base01, c.base1, c.base00];
  return {
    accent     : c.blue,
    heading    : c.orange,
    tableHeader: c.yellow,
    strong     : emphasized,
    emphasis   : c.magenta,
    inlineCode : c.cyan,
    codeText   : body,
    codeCommand: c.blue,
    codeFlag   : c.green,
    codeString : c.cyan,
    codeComment: comment,
    link       : c.violet,
    path       : c.cyan,
    number     : c.cyan,
    quote      : comment,
    rule       : comment,
    tableRule  : comment,
    bullet     : c.blue,
    diagram    : line,
    diagramText: body,
  };
}

// Palettes
// ========

export const PALETTES = {
  "catppuccin-mocha": palette_catppuccin(MOCHA, false),
  "catppuccin-latte": palette_catppuccin(LATTE, true),
  "dracula"         : palette_dracula(DRACULA),
  "nord"            : palette_nord(NORD),
  "tokyo-night"     : palette_tokyo_night(TOKYO_NIGHT),
  "gruvbox-dark"    : palette_gruvbox(GRUVBOX_DARK),
  "gruvbox-light"   : palette_gruvbox(GRUVBOX_LIGHT),
  "rose-pine"       : palette_rose_pine(ROSE_PINE, false),
  "rose-pine-dawn"  : palette_rose_pine(ROSE_PINE_DAWN, true),
  "everforest"      : palette_everforest(EVERFOREST),
  "github-dark"     : palette_github(GITHUB_DARK),
  "github-light"    : palette_github(GITHUB_LIGHT),
  "one-dark"        : palette_one_dark(ONE_DARK),
  "solarized-dark"  : palette_solarized(SOLARIZED, false),
  "solarized-light" : palette_solarized(SOLARIZED, true),
  "mono"            : {},
} satisfies Record<string, Partial<Slots>>;

export type PaletteName = keyof typeof PALETTES;

// each palette's background: its scheme's main one (mono's black)
export const CANVAS: Record<PaletteName, string> = {
  "catppuccin-mocha": MOCHA.base,
  "catppuccin-latte": LATTE.base,
  "dracula"         : DRACULA.background,
  "nord"            : NORD.nord0,
  "tokyo-night"     : TOKYO_NIGHT.background,
  "gruvbox-dark"    : GRUVBOX_DARK.bg0,
  "gruvbox-light"   : GRUVBOX_LIGHT.bg0,
  "rose-pine"       : ROSE_PINE.base,
  "rose-pine-dawn"  : ROSE_PINE_DAWN.base,
  "everforest"      : EVERFOREST.bg0,
  "github-dark"     : GITHUB_DARK.canvas,
  "github-light"    : GITHUB_LIGHT.canvas,
  "one-dark"        : ONE_DARK.bg,
  "solarized-dark"  : SOLARIZED.base03,
  "solarized-light" : SOLARIZED.base3,
  "mono"            : "#000000",
};
