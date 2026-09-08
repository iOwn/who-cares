import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { breakpoints, mq } from "./breakpoints";

/**
 * Drift guard for the one wart in the token model: CSS custom properties cannot
 * appear in an `@media` prelude, so the breakpoint values necessarily live in
 * two places — `--bp-*` in tokens.css (for the literal px in CSS Module media
 * queries) and `breakpoints.ts` (the single source for JS: matchMedia, RAC
 * responsive props). This test parses tokens.css and asserts the two agree.
 *
 * See docs/design-system.md "Token model" → Breakpoints wart.
 */

const tokensCss = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");

/** Every `--bp-<name>: <n>px;` declaration in tokens.css, as `{ name: n }`. */
function parseBreakpointTokens(css: string): Record<string, number> {
  const parsed: Record<string, number> = {};
  for (const [, name, px] of css.matchAll(/--bp-([a-z0-9]+)\s*:\s*(\d+)px\s*;/g)) {
    parsed[name] = Number(px);
  }
  return parsed;
}

describe("breakpoints ↔ tokens.css parity", () => {
  const cssBreakpoints = parseBreakpointTokens(tokensCss);

  it("finds --bp-* tokens in tokens.css", () => {
    // Guards the regex itself: a silently-empty parse would make every
    // comparison below vacuously pass.
    expect(Object.keys(cssBreakpoints).length).toBeGreaterThan(0);
  });

  it("declares exactly the same breakpoint names in both files", () => {
    expect(Object.keys(cssBreakpoints).sort()).toEqual(Object.keys(breakpoints).sort());
  });

  it("declares the same pixel value for every breakpoint", () => {
    expect(cssBreakpoints).toEqual({ ...breakpoints });
  });

  it("derives each media query from its breakpoint value", () => {
    for (const [name, px] of Object.entries(breakpoints)) {
      expect(mq[name as keyof typeof mq]).toBe(`(min-width: ${px}px)`);
    }
  });
});
