/**
 * Breakpoints — the single source of truth for JS (matchMedia, React Aria
 * responsive props). The same values live as `--bp-*` custom properties in
 * tokens.css for CSS; `breakpoints.test.ts` parses tokens.css and asserts
 * parity with this file (cheap drift guard). See docs/design-system.md, #29.
 *
 * `md` (768px) is where the pickup-request inbox switches from a full-screen
 * route to a desktop side panel.
 */
export const breakpoints = { sm: 480, md: 768, lg: 1024 } as const;

export const mq = {
  sm: `(min-width: ${breakpoints.sm}px)`,
  md: `(min-width: ${breakpoints.md}px)`,
  lg: `(min-width: ${breakpoints.lg}px)`,
} as const;

export type Breakpoint = keyof typeof breakpoints;
