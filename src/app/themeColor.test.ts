import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEME_COLOR } from "./themeColor";

/**
 * Drift guards for the app's ground (issue #163).
 *
 * 1. `THEME_COLOR` — what the OS paints around the app — must equal the
 *    `--sand-50` primitive that `--color-bg` resolves to in tokens.css. The
 *    two live in different worlds (a platform-read literal vs a CSS custom
 *    property), so nothing but this test ties them together.
 * 2. `globals.css` must paint that ground on `html` and reset the UA body
 *    margin, and `.ladle/workbench.css` must mirror both — the same shape as
 *    the box-sizing and font-family mirrors that `fonts.test.ts` guards.
 */

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const tokensCss = read("../ui/tokens.css");
const globalsCss = read("./globals.css");
const workbenchCss = read("../../.ladle/workbench.css");

/** The declarations inside every `<selector> { … }` block whose selector list is exactly `selector`. */
function declarationsOf(css: string, selector: string): string {
  const blocks: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const [, selectors, body] of css.matchAll(re)) {
    const list = selectors
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.includes(selector)) blocks.push(body);
  }
  return blocks.join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("THEME_COLOR ↔ tokens.css", () => {
  it("equals the --sand-50 primitive", () => {
    const match = tokensCss.match(/--sand-50\s*:\s*(#[0-9a-f]{6})\s*;/i);
    expect(match, "tokens.css declares --sand-50 as a 6-digit hex").not.toBeNull();
    expect(THEME_COLOR.toLowerCase()).toBe(match?.[1].toLowerCase());
  });

  it("is what --color-bg resolves to", () => {
    expect(tokensCss).toMatch(/--color-bg\s*:\s*var\(--sand-50\)\s*;/);
  });
});

describe("globals.css paints the ground and resets the body margin", () => {
  it("sets html { background: var(--color-bg) }", () => {
    expect(declarationsOf(globalsCss, "html")).toMatch(/background\s*:\s*var\(--color-bg\)\s*;/);
  });

  it("sets body { margin: 0 }", () => {
    expect(declarationsOf(globalsCss, "body")).toMatch(/(^|[^-])margin\s*:\s*0\s*;/);
  });
});

describe(".ladle/workbench.css mirrors both", () => {
  it("sets html { background: var(--color-bg) }", () => {
    expect(declarationsOf(workbenchCss, "html")).toMatch(/background\s*:\s*var\(--color-bg\)\s*;/);
  });

  it("sets body { margin: 0 }", () => {
    expect(declarationsOf(workbenchCss, "body")).toMatch(/(^|[^-])margin\s*:\s*0\s*;/);
  });
});
