/**
 * The token-usage rule as a pure function, so `tokenUsage.test.ts` can both run it over the
 * repo's CSS and seed it with known-bad input. See that file for the rules and the rationale.
 */

export interface Violation {
  /** 1-based line of the offending declaration. */
  line: number;
  message: string;
  /** Normalised `property: value;` — the key shape used by the test's `ALLOWED` map. */
  declaration: string;
}

const PRIMITIVE_TOKEN = /--(?:amber|blue|green|ink|red|sand|teal|violet)-\d+/;
const RAW_COLOR_FN =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i;
const RAW_LENGTH = /(?<![\w.-])-?\d*\.?\d+(?:px|r?em|ch|vh|vw|ms|s)\b/i;

/** CSS named colours. `transparent` / `currentcolor` / `inherit` are deliberately not here. */
const NAMED_COLORS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet
brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue
darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange
darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise
darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen
fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred
indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta
maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red
rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet
wheat white whitesmoke yellow yellowgreen`.split(/\s+/),
);

const SIDES = "(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?";

/** Properties whose values must come from the scale tokens, not raw lengths. */
const TOKENIZED_PROPERTY = new RegExp(
  `^(?:${[
    `padding${SIDES}`,
    `margin${SIDES}`,
    "(?:row-|column-)?gap",
    `border${SIDES}(?:-width)?`,
    "border-(?:top|bottom|start|end)-(?:left|right|start|end)-radius",
    "border-radius",
    "font-size",
    "line-height",
    "letter-spacing",
    "box-shadow",
    "z-index",
    "transition(?:-duration)?",
    "animation-duration",
    "grid-template-(?:columns|rows)",
  ].join("|")})$`,
  "i",
);

/** Properties that can carry a colour keyword. */
const COLOR_PROPERTY = new RegExp(
  `^(?:color|background(?:-color)?|fill|stroke|caret-color|accent-color|text-decoration-color|(?:border|outline|column-rule)${SIDES}(?:-color)?|box-shadow|text-shadow)$`,
  "i",
);

/** Blank out comments but keep newlines so reported line numbers stay right. */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/** Remove `fn( … )` calls with balanced parentheses. */
function removeCalls(value: string, fn: string): string {
  const open = new RegExp(`^${fn}\\(`, "i");
  let out = "";
  let i = 0;
  while (i < value.length) {
    const head = open.exec(value.slice(i));
    if (!head || /[\w-]/.test(value[i - 1] ?? "")) {
      out += value[i++];
      continue;
    }
    let depth = 1;
    i += head[0].length;
    while (i < value.length && depth > 0) {
      if (value[i] === "(") depth++;
      else if (value[i] === ")") depth--;
      i++;
    }
  }
  return out;
}

/**
 * `known` = every custom property that resolves (tokens.css, other declarations, TSX keys,
 * runtime-supplied ones).
 */
export function lintCss(source: string, known: ReadonlySet<string>): Violation[] {
  const css = stripComments(source);
  const violations: Violation[] = [];

  // A declaration is any `;`/`{`/`}`-delimited chunk shaped `property: value`. Splitting on
  // those (not on newlines) handles multi-line values and one-line rules like `a { x: y }`.
  for (const chunk of css.matchAll(/[^{};]+/g)) {
    const raw = chunk[0];
    const decl = /^\s*([a-z-]+|--[\w-]+)\s*:\s*([\s\S]+?)\s*$/i.exec(raw);
    if (!decl) continue;
    const property = decl[1];
    const value = decl[2].replace(/\s+/g, " ").replace(/\s*!important$/i, "");
    const declaration = `${property}: ${value};`;
    const offset = (chunk.index ?? 0) + (raw.length - raw.trimStart().length);
    const line = css.slice(0, offset).split("\n").length;
    const report = (message: string) => violations.push({ line, message, declaration });
    const isCustom = property.startsWith("--");

    if (RAW_COLOR_FN.test(value)) report("raw colour — use a --color-* token");
    if (PRIMITIVE_TOKEN.test(value)) report("primitive token — use the semantic token");
    for (const [, name] of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (!known.has(name)) report(`unknown token ${name}`);
    }

    // Keep var() fallbacks in view (a raw length hiding in one is still raw); drop only the
    // `var(--name,` head. env() safe-area fallbacks are platform values, not design values.
    const bare = removeCalls(value, "env")
      .replace(/var\(\s*--[\w-]+\s*,?/gi, "(")
      .replace(/--[\w-]+/g, "");

    if (!isCustom && COLOR_PROPERTY.test(property)) {
      for (const word of bare.toLowerCase().match(/[a-z]+/g) ?? []) {
        if (NAMED_COLORS.has(word)) report(`named colour "${word}" — use a --color-* token`);
      }
    }
    if (!isCustom && TOKENIZED_PROPERTY.test(property) && RAW_LENGTH.test(bare)) {
      report(`raw length in ${property} — use a token`);
    }
  }
  return violations;
}
