import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lintCss, parseSizeTokens, stripComments } from "./tokenUsage";

/**
 * Lint rule: component and feature CSS may only use the predefined tokens.
 * Runs in the `node` project, so it gates pre-push and CI like any other test.
 * (Biome can't express this — its custom rules don't see CSS values.)
 *
 * The rule itself is `tokenUsage.ts` (pure); the last block below seeds it with bad input.
 *
 * Rules, applied to every `.css` under `src/` except `tokens.css`:
 *   1. no raw colours (hex, rgb/hsl/hwb/lab/lch/oklab/oklch/color(), or a named colour)
 *   2. no primitive tokens (`--blue-500`) — components consume semantic tokens only
 *   3. every `var(--x)` resolves to a token (tokens.css) or a custom property declared
 *      in `src/` (CSS declaration or a `"--x"` key set from TSX)
 *   4. spacing / border / radius / type / shadow / z-index / grid-track / motion-duration
 *      properties take tokens, not raw lengths (0 and percentages are fine)
 *
 *   5. a raw width/height whose value equals a `--size-*` token must use the token (one-off
 *      sizes with no token — pips, skeletons, max-widths — stay raw on purpose, ADR-0024)
 *
 * Not covered (issue #190): `outline` (#191), inline `style={{}}` in TSX and the `animation`
 * shorthand (#193), `top`/`right`/`bottom`/`left`.
 *
 * See docs/design-system.md "Token model" and the Component Authoring Checklist.
 * A deliberate exception goes in `ALLOWED` with the reason, not a looser rule.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const TOKENS = join(SRC, "ui", "tokens.css");

/**
 * `file|declaration` → why a raw value is deliberate. Keyed by the declaration text, not the
 * line number, so unrelated edits don't invalidate it. Keep this short.
 */
const ALLOWED: Record<string, string> = {
  "ui/Callout/Callout.module.css|margin-top: 0.0625rem;":
    "optical 1px nudge aligning the icon with the first text line",
  "ui/Callout/Callout.module.css|margin-top: 0.1875rem;":
    "optical 3px nudge aligning the dot with the first text line",
  "app/RouteSkeleton.module.css|height: 2.25rem;":
    "tab-strip skeleton; its height only coincides with --size-icon-36",
  "ui/Spinner/Spinner.module.css|margin: -1px;":
    "the standard visually-hidden recipe (1px box, -1px margin)",
};

/** Custom properties supplied by react-aria-components at runtime, not declared in src/. */
const EXTERNAL_PROPERTIES = new Set(["--trigger-width"]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(path);
    return [path];
  });
}

const files = walk(SRC);
const cssFiles = files.filter((f) => f.endsWith(".css") && f !== TOKENS);

const read = (path: string) => readFileSync(path, "utf8");

function declaredCustomProperties(): Set<string> {
  const declared = new Set<string>(EXTERNAL_PROPERTIES);
  for (const [, name] of stripComments(read(TOKENS)).matchAll(/(--[\w-]+)\s*:/g)) {
    declared.add(name);
  }
  for (const file of files) {
    const text = file.endsWith(".css")
      ? stripComments(read(file))
      : /\.tsx?$/.test(file)
        ? read(file)
        : "";
    for (const [, name] of text.matchAll(/(--[\w-]+)\s*:/g)) declared.add(name);
    for (const [, name] of text.matchAll(/["'`](--[\w-]+)["'`]/g)) declared.add(name);
  }
  return declared;
}

function lintRepo(): string[] {
  const known = declaredCustomProperties();
  const sizeTokens = parseSizeTokens(read(TOKENS));
  return cssFiles.flatMap((file) => {
    const rel = relative(SRC, file).replaceAll("\\", "/");
    return lintCss(read(file), known, sizeTokens)
      .filter((v) => !(`${rel}|${v.declaration}` in ALLOWED))
      .map((v) => `${rel}:${v.line}  ${v.message}: ${v.declaration}`);
  });
}

describe("CSS uses only predefined tokens", () => {
  it("scans the CSS it is meant to scan", () => {
    // A silently-empty glob would make the rule vacuously pass.
    expect(cssFiles.length).toBeGreaterThan(10);
    expect(declaredCustomProperties().has("--color-text")).toBe(true);
  });

  it("has no raw colours, primitive tokens, unknown tokens or raw scale values", () => {
    expect(lintRepo()).toEqual([]);
  });

  it("does not allow-list anything that no longer exists", () => {
    const stale = Object.keys(ALLOWED).filter((key) => {
      const [file, declaration] = key.split("|");
      try {
        return !read(join(SRC, file)).includes(declaration);
      } catch {
        return true;
      }
    });
    expect(stale).toEqual([]);
  });
});

describe("lintCss (seeded with known-bad input)", () => {
  const known = new Set(["--space-8", "--color-text", "--blue-500", "--border"]);
  const messages = (css: string) => lintCss(css, known).map((v) => v.message);
  const flags = (css: string, fragment: string) =>
    expect(messages(css).some((m) => m.includes(fragment))).toBe(true);
  const clean = (css: string) => expect(messages(css)).toEqual([]);

  it("flags raw colours: hex, functions, named", () => {
    flags(".a { color: #fff; }", "raw colour");
    flags(".a { color: #FFFFFF80; }", "raw colour");
    flags(".a { background: RGB(0 0 0 / 50%); }", "raw colour");
    flags(".a { border: var(--border) solid red; }", 'named colour "red"');
    flags(".a { box-shadow: 0 0 var(--space-8) Tomato; }", 'named colour "tomato"');
    flags(".a { background: color-mix(in srgb, red, white); }", "raw colour");
  });

  it("allows colour keywords that aren't colours", () => {
    clean(".a { color: currentcolor; background: transparent; border: none; }");
    clean(".a { border: var(--border) solid var(--color-text); }");
  });

  it("does not mistake selectors for colours", () => {
    clean("#bad, #beef { color: var(--color-text); }");
  });

  it("flags primitive and unknown tokens", () => {
    flags(".a { color: var(--blue-500); }", "primitive token");
    flags(".a { gap: var(--space-99); }", "unknown token --space-99");
  });

  it("flags raw lengths, including odd spellings", () => {
    flags(".a { padding: 12px; }", "raw length in padding");
    flags(".a { padding: 4PX; }", "raw length in padding");
    flags(".a { margin: -.5rem; }", "raw length in margin");
    flags(".a { gap: 8px !important; }", "raw length in gap");
    flags(".a { padding: var(--space-8) 3px; }", "raw length in padding");
    flags(".a { transition: opacity 120ms; }", "raw length in transition");
    flags(".a { border: 2px solid var(--color-text); }", "raw length in border");
    flags(".a { grid-template-columns: 1fr 120px; }", "raw length in grid-template-columns");
  });

  it("flags a raw dimension that equals a size token, in any unit spelling", () => {
    const sizes = new Map([
      [40, "--size-control-md"],
      [24, "--size-icon-24"],
    ]);
    const sized = (css: string) => lintCss(css, known, sizes).map((v) => v.message);
    expect(sized(".a { min-height: 2.5rem; }")).toEqual([
      "raw 2.5rem in min-height — use --size-control-md",
    ]);
    expect(sized(".a { height: 40px; }")).toHaveLength(1);
    expect(sized(".a { width: calc(100% - 1.5rem); }")).toHaveLength(1);
    expect(sized(".a { width: min(24rem, 90vw); }")).toEqual([]);
  });

  it("leaves other dimensions, other properties and custom properties alone", () => {
    const sizes = new Map([[40, "--size-control-md"]]);
    const sized = (css: string) => lintCss(css, known, sizes).map((v) => v.message);
    expect(sized(".a { min-height: 2.6rem; width: 100%; max-width: 22rem; }")).toEqual([]);
    expect(sized(".a { flex-basis: 2.5rem; }")).toEqual([]);
    expect(
      lintCss(".a { min-height: var(--size-control-md); }", new Set(["--size-control-md"]), sizes),
    ).toEqual([]);
    expect(lintCss(".a { height: 2.5rem; }", known)).toEqual([]);
  });

  it("reads size tokens from tokens.css text", () => {
    const css =
      "/* --size-x: 9rem; */ :root { --size-a: 2.5rem; --size-b: 24px; --space-8: 0.5rem; }";
    expect([...parseSizeTokens(css)]).toEqual([
      [40, "--size-a"],
      [24, "--size-b"],
    ]);
  });

  it("sees what a line-based scan would miss", () => {
    flags(".a { padding: 4px }", "raw length in padding");
    flags(
      ".a {\n  box-shadow:\n    0 0 var(--space-8) var(--color-text),\n    0 2px 0 var(--color-text);\n}",
      "raw length in box-shadow",
    );
    flags("@media (min-width: 768px) { .a { gap: 6px; } }", "raw length in gap");
    flags("@keyframes k { to { padding: 5px; } }", "raw length in padding");
  });

  it("reports the line where a multi-line declaration starts", () => {
    const [v] = lintCss(".a {\n  color: var(--color-text);\n  padding:\n    7px;\n}", known);
    expect(v.line).toBe(3);
  });

  it("looks inside var() fallbacks, with balanced parentheses", () => {
    flags(".a { padding: var(--space-8, calc(1px + 2px)); }", "raw length in padding");
    clean(".a { padding: var(--space-8, 0) var(--space-8); }");
  });

  it("accepts the tokenised and the exempt", () => {
    clean(".a { padding: var(--space-8) 0; margin: 0 auto; gap: calc(var(--space-8) * 2); }");
    clean(".a { top: calc(env(safe-area-inset-top, 0px) - var(--space-8)); width: 12rem; }");
    clean(".a { border-radius: 50%; z-index: var(--space-8, 1); }");
    clean("/* padding: 4px; color: red; */ .a { color: var(--color-text); }");
  });

  it("strips comments but keeps line numbers", () => {
    expect(stripComments("a\n/* x\ny */\nb").split("\n")).toHaveLength(4);
  });
});
