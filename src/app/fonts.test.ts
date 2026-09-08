import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Drift guard for font-weight parity between `next/font/google` in layout.tsx
 * (runtime source of truth for the app) and the Google Fonts CDN URL in
 * .ladle/config.mjs (Ladle workbench source). Both must declare the same
 * families, weights, and subset. This test parses both sources and asserts
 * they agree.
 *
 * See .ladle/config.mjs §googleFontsHref and src/app/layout.tsx comment.
 */

const layoutTsx = readFileSync(fileURLToPath(new URL("./layout.tsx", import.meta.url)), "utf8");

const ladleConfig = readFileSync(
  fileURLToPath(new URL("../../.ladle/config.mjs", import.meta.url)),
  "utf8",
);

/**
 * Parse font weights from layout.tsx. Returns `{ <family>: { weights: [...], subset: "..." } }`.
 * Extracts weight arrays from `weight: ["400", "600", ...]` and subset from `subsets: ["latin"]`.
 */
function parseFontsFromLayout(tsx: string): Record<string, { weights: string[]; subset: string }> {
  const fonts: Record<string, { weights: string[]; subset: string }> = {};

  // Match font declarations: Nunito({...}) or Baloo_2({...})
  // Look for weight: [...] and subsets: [...] patterns
  const fontMatches = [
    {
      name: "Nunito",
      pattern:
        /const\s+nunito\s*=\s*Nunito\s*\(\{[\s\S]*?subsets:\s*\[([^\]]+)\][\s\S]*?weight:\s*\[([^\]]+)\]/,
    },
    {
      name: "Baloo_2",
      pattern:
        /const\s+baloo\s*=\s*Baloo_2\s*\(\{[\s\S]*?subsets:\s*\[([^\]]+)\][\s\S]*?weight:\s*\[([^\]]+)\]/,
    },
  ];

  for (const { name, pattern } of fontMatches) {
    const match = tsx.match(pattern);
    if (match) {
      const subsetStr = match[1].trim().replace(/["']/g, "");
      const weightStr = match[2].trim();

      // Extract weights from ["400", "600", "700", "800"] format
      const weights = weightStr
        .split(",")
        .map((w) => w.trim().replace(/["']/g, ""))
        .filter(Boolean);

      fonts[name] = {
        subset: subsetStr,
        weights,
      };
    }
  }

  return fonts;
}

/**
 * Parse Google Fonts URL from .ladle/config.mjs.
 * Returns `{ <family>: { weights: [...], subset: "..." } }`.
 * Extracts from URLs like: family=Nunito:wght@400;600;700;800&family=Baloo+2:wght@500;700;800&display=swap
 */
function parseFontsFromLadleUrl(
  config: string,
): Record<string, { weights: string[]; subset: string }> {
  const fonts: Record<string, { weights: string[]; subset: string }> = {};

  // Extract the googleFontsHref URL
  const hrefMatch = config.match(/googleFontsHref\s*=\s*["`']([^`"']+)["`']/);
  if (!hrefMatch) {
    return fonts;
  }

  const url = hrefMatch[1];

  // Parse family params: family=FontName:wght@400;600;700;800
  const familyMatches = url.matchAll(/family=([^&:]+):wght@([^&]+)/g);

  for (const match of familyMatches) {
    const familyNameEncoded = match[1]; // "Nunito" or "Baloo+2"
    const weightStr = match[2]; // "400;600;700;800"

    // Map Baloo+2 (URL-encoded) to Baloo_2 (TypeScript name)
    const familyName = familyNameEncoded === "Baloo+2" ? "Baloo_2" : familyNameEncoded;

    const weights = weightStr.split(";").filter(Boolean);

    // Google Fonts URLs don't encode the subset in this format, but the
    // query string includes &display=swap. The subset is inferred from
    // `next/font/google` defaults (which is 'latin' in layout.tsx).
    // We'll assume 'latin' for URL-sourced fonts since layout.tsx uses it.
    fonts[familyName] = {
      subset: "latin",
      weights,
    };
  }

  return fonts;
}

describe("fonts layout.tsx ↔ .ladle googleFontsHref parity", () => {
  const layoutFonts = parseFontsFromLayout(layoutTsx);
  const ladleFonts = parseFontsFromLadleUrl(ladleConfig);

  it("finds font declarations in layout.tsx", () => {
    expect(Object.keys(layoutFonts).length).toBeGreaterThan(0);
    expect(layoutFonts).toHaveProperty("Nunito");
    expect(layoutFonts).toHaveProperty("Baloo_2");
  });

  it("finds font declarations in .ladle/config.mjs googleFontsHref", () => {
    expect(Object.keys(ladleFonts).length).toBeGreaterThan(0);
    expect(ladleFonts).toHaveProperty("Nunito");
    expect(ladleFonts).toHaveProperty("Baloo_2");
  });

  it("declares exactly the same families in both sources", () => {
    expect(Object.keys(ladleFonts).sort()).toEqual(Object.keys(layoutFonts).sort());
  });

  it("uses the same subset (latin) for all fonts", () => {
    for (const family of Object.keys(layoutFonts)) {
      expect(ladleFonts[family]?.subset).toBe(layoutFonts[family]?.subset);
      expect(layoutFonts[family]?.subset).toBe("latin");
    }
  });

  it("declares the same weights for Nunito in both sources", () => {
    expect(ladleFonts.Nunito?.weights).toEqual(layoutFonts.Nunito?.weights);
  });

  it("declares the same weights for Baloo_2 in both sources", () => {
    expect(ladleFonts.Baloo_2?.weights).toEqual(layoutFonts.Baloo_2?.weights);
  });
});
