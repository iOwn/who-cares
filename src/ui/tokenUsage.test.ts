import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Lint rule: component and feature CSS may only use the predefined tokens.
 * Runs in the `node` project, so it gates pre-push and CI like any other test.
 * (Biome can't express this — its custom rules don't see CSS values.)
 *
 * Rules, applied to every `.css` under `src/` except `tokens.css`:
 *   1. no raw colours (hex / rgb / hsl / hwb / lab / lch / oklab / oklch / color())
 *   2. no primitive tokens (`--blue-500`) — components consume semantic tokens only
 *   3. every `var(--x)` resolves to a token (tokens.css) or a custom property declared
 *      in `src/` (CSS declaration or a `"--x"` key set from TSX)
 *   4. spacing / radius / type / shadow / z-index / motion properties take tokens, not
 *      raw lengths (0 and percentages are fine)
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

/** Blank out comments but keep newlines so reported line numbers stay right. */
const stripComments = (css: string) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

const read = (path: string) => readFileSync(path, "utf8");

const PRIMITIVE_TOKEN = /--(?:amber|blue|green|ink|red|sand|teal|violet)-\d+/;
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
const RAW_LENGTH = /(?<![\w.-])-?\d*\.?\d+(?:px|r?em|ch|vh|vw|ms|s)\b/;

/** Properties whose values must come from the scale tokens. */
const TOKENIZED_PROPERTY =
  /^(?:padding|margin|gap|row-gap|column-gap|border-radius|border-(?:top|bottom|start|end)-(?:left|right|start|end)-radius|font-size|line-height|letter-spacing|box-shadow|z-index|transition(?:-duration)?|animation-duration)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?$/;

function declaredCustomProperties(): Set<string> {
  const declared = new Set<string>(EXTERNAL_PROPERTIES);
  for (const [, name] of stripComments(read(TOKENS)).matchAll(/(--[\w-]+)\s*:/g))
    declared.add(name);
  for (const file of files) {
    const text = file.endsWith(".css")
      ? stripComments(read(file))
      : file.match(/\.tsx?$/)
        ? read(file)
        : "";
    for (const [, name] of text.matchAll(/(--[\w-]+)\s*:/g)) declared.add(name);
    for (const [, name] of text.matchAll(/["'`](--[\w-]+)["'`]/g)) declared.add(name);
  }
  return declared;
}

interface Violation {
  where: string;
  message: string;
}

function lint(): Violation[] {
  const declared = declaredCustomProperties();
  const violations: Violation[] = [];

  for (const file of cssFiles) {
    const css = stripComments(read(file));
    const rel = relative(SRC, file).replaceAll("\\", "/");
    const lines = css.split("\n");

    lines.forEach((text, i) => {
      const where = `${rel}:${i + 1}`;
      const decl = text.match(/^\s*([a-z-]+|--[\w-]+)\s*:\s*(.+?);?\s*$/);
      const property = decl?.[1];
      const value = decl?.[2] ?? "";
      const report = (message: string) => {
        if (`${rel}|${text.trim()}` in ALLOWED) return;
        violations.push({ where, message: `${message}: ${text.trim()}` });
      };

      if (RAW_COLOR.test(text)) report("raw colour — use a --color-* token");
      if (PRIMITIVE_TOKEN.test(text)) report("primitive token — use the semantic token");
      for (const [, name] of text.matchAll(/var\((--[\w-]+)/g)) {
        if (!declared.has(name)) report(`unknown token ${name}`);
      }
      if (property && !property.startsWith("--") && TOKENIZED_PROPERTY.test(property)) {
        // Strip var(...) fallbacks and env() safe-area fallbacks before looking for raw lengths.
        const bare = value.replace(/var\([^)]*\)|env\([^)]*\)/g, "");
        if (RAW_LENGTH.test(bare)) report(`raw length in ${property} — use a token`);
      }
    });
  }
  return violations;
}

describe("CSS uses only predefined tokens", () => {
  it("scans the CSS it is meant to scan", () => {
    // A silently-empty glob would make the rule vacuously pass.
    expect(cssFiles.length).toBeGreaterThan(10);
    expect(declaredCustomProperties().has("--color-text")).toBe(true);
  });

  it("has no raw colours, primitive tokens, unknown tokens or raw scale values", () => {
    const violations = lint();
    expect(violations.map((v) => `${v.where}  ${v.message}`)).toEqual([]);
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
