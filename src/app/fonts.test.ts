import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Drift guard for font-weight parity between `next/font/google` in layout.tsx
 * (runtime source of truth for the app) and the Google Fonts CDN URL in
 * .ladle/config.mjs (Ladle workbench source). Both must declare the same
 * families, weights, and subset, in the same order.
 *
 * This test dynamically discovers all font families declared in layout.tsx,
 * parses each independently, and compares against the Ladle URL. Adding a
 * third family to layout.tsx but not the URL (or vice versa) is caught.
 *
 * See .ladle/config.mjs §googleFontsHref and src/app/layout.tsx comment.
 */

const layoutTsx = readFileSync(fileURLToPath(new URL("./layout.tsx", import.meta.url)), "utf8");

const ladleConfig = readFileSync(
  fileURLToPath(new URL("../../.ladle/config.mjs", import.meta.url)),
  "utf8",
);

/**
 * Parse all `next/font/google` font families from layout.tsx.
 * Returns `{ <FamilyName>: { weights: [...], subset: "..." } }`.
 * Dynamically discovers families: finds `const <var> = <Family>({...})` patterns,
 * then extracts `weight` and `subsets` from each call's own block.
 * Handles both array (`weight: ["400", "600"]`) and string (`weight: "400"`) forms.
 */
function parseFontsFromLayout(tsx: string): Record<string, { weights: string[]; subset: string }> {
  const fonts: Record<string, { weights: string[]; subset: string }> = {};

  // Find all font family calls: `const <var> = <Family>({...})`
  // Match: `const varName = FamilyName({...})`
  // Using a pattern that captures the family name and extracts the whole call block
  const familyCallPattern = /const\s+\w+\s*=\s*(\w+)\s*\(\{([^}]+)\}\s*\)/g;

  for (const match of tsx.matchAll(familyCallPattern)) {
    const familyName = match[1]; // e.g., "Nunito", "Baloo_2"
    const blockContent = match[2]; // everything inside {...}

    // Extract subsets array from this call's block: `subsets: ["latin"]` or `subsets: ["latin", ...]`
    const subsetMatch = blockContent.match(/subsets:\s*\[\s*["']([^"']+)["']/);
    if (!subsetMatch) continue;
    const subset = subsetMatch[1];

    // Extract weight from this call's block: handles both forms
    // - Array: `weight: ["400", "600", ...]`
    // - String: `weight: "400"` (single value)
    const weightArrayMatch = blockContent.match(/weight:\s*\[\s*([^\]]+)\s*\]/);
    const weightStringMatch = blockContent.match(/weight:\s*["'](\d+)["']/);

    let weights: string[] = [];
    if (weightArrayMatch) {
      // Array form: ["400", "600", "700", "800"]
      const weightStr = weightArrayMatch[1];
      weights = weightStr
        .split(",")
        .map((w) => w.trim().replace(/["']/g, ""))
        .filter(Boolean);
    } else if (weightStringMatch) {
      // String form: "400"
      weights = [weightStringMatch[1]];
    }

    if (weights.length > 0) {
      fonts[familyName] = {
        subset,
        weights: weights.sort(), // Sort for order-insensitive comparison
      };
    }
  }

  return fonts;
}

/**
 * Parse Google Fonts URL from .ladle/config.mjs googleFontsHref.
 * Returns `{ <family>: { weights: [...], subset: "..." } }`.
 * Extracts from URLs like: family=Nunito:wght@400;600;700;800&family=Baloo+2:wght@500;700;800&subset=latin&display=swap
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

  // Parse the subset parameter from URL (e.g., `&subset=latin`), default to "latin"
  const subsetMatch = url.match(/[?&]subset=([^&]+)/);
  const defaultSubset = subsetMatch ? subsetMatch[1] : "latin";

  // Parse family params: family=FontName:wght@400;600;700;800
  const familyMatches = url.matchAll(/family=([^&:]+):wght@([^&]+)/g);

  for (const match of familyMatches) {
    const familyNameEncoded = match[1]; // "Nunito" or "Baloo+2"
    const weightStr = match[2]; // "400;600;700;800"

    // Map Baloo+2 (URL-encoded) to Baloo_2 (TypeScript name)
    const familyName = familyNameEncoded === "Baloo+2" ? "Baloo_2" : familyNameEncoded;

    const weights = weightStr.split(";").filter(Boolean).sort(); // Sort for order-insensitive comparison

    fonts[familyName] = {
      subset: defaultSubset,
      weights,
    };
  }

  return fonts;
}

describe("fonts layout.tsx ↔ .ladle googleFontsHref parity", () => {
  const layoutFonts = parseFontsFromLayout(layoutTsx);
  const ladleFonts = parseFontsFromLadleUrl(ladleConfig);

  it("discovers font declarations in layout.tsx", () => {
    // Must find at least the two expected families; adding a third is caught
    // by the "same families" test below.
    expect(Object.keys(layoutFonts).length).toBeGreaterThanOrEqual(2);
  });

  it("discovers font declarations in .ladle/config.mjs googleFontsHref", () => {
    expect(Object.keys(ladleFonts).length).toBeGreaterThanOrEqual(2);
  });

  it("declares exactly the same families in both sources", () => {
    // This test catches:
    // - Adding a family to layout.tsx without adding it to the URL
    // - Adding a family to the URL without adding it to layout.tsx
    // - Removing a family from one without the other
    expect(Object.keys(ladleFonts).sort()).toEqual(Object.keys(layoutFonts).sort());
  });

  it("uses the same subset for all families", () => {
    for (const family of Object.keys(layoutFonts)) {
      const layoutSubset = layoutFonts[family]?.subset;
      const ladleSubset = ladleFonts[family]?.subset;
      expect(ladleSubset).toBe(layoutSubset);
    }
  });

  it("declares the same weights (unordered) for each family", () => {
    for (const family of Object.keys(layoutFonts)) {
      const layoutWeights = layoutFonts[family]?.weights;
      const ladleWeights = ladleFonts[family]?.weights;
      // Both are pre-sorted, so direct comparison is order-insensitive
      expect(ladleWeights).toEqual(layoutWeights);
    }
  });
});
