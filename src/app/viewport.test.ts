import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Issue #173 suppresses *accidental* zoom (double-tap, iOS focus-zoom) and
 * deliberately leaves pinch-zoom alone (WCAG 1.4.4, docs/design-system.md).
 * These pin both halves so neither drifts. layout.tsx is read as text because
 * importing it pulls in next/font, which only resolves under the Next build.
 */
const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("zoom contract", () => {
  it("keeps pinch-zoom available in the viewport meta", () => {
    const layout = read("./layout.tsx");
    expect(layout).toMatch(/userScalable:\s*true/);
    const max = Number(/maximumScale:\s*(\d+)/.exec(layout)?.[1]);
    expect(max).toBeGreaterThanOrEqual(5);
  });

  it("turns double-tap zoom off on html without disabling pinch", () => {
    const css = read("./globals.css");
    expect(css).toMatch(/touch-action:\s*manipulation/);
    expect(css).not.toMatch(/touch-action:\s*(none|pan-)/);
  });

  it.each(["TextField", "TextArea", "DateField"])("%s is 16px on coarse pointers", (name) => {
    const css = read(`../ui/${name}/${name}.module.css`);
    expect(css).toMatch(
      /@media \(pointer: coarse\)\s*\{\s*\.input\s*\{\s*font-size:\s*var\(--text-lg\);/,
    );
  });
});
