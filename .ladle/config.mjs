/**
 * Ladle — the primitive workbench. `pnpm workbench` (dev) / `pnpm
 * workbench:build` (static build). See docs/design-system.md "Workbench".
 *
 * Ladle is a Vite app, not a Next app, so two Next-isms have to be re-supplied
 * here. Both are handled without a custom `vite.config`:
 *
 *   CSS Modules — Vite compiles `*.module.css` natively with the same
 *   `import styles from './X.module.css'` default-export shape Next uses, and
 *   Ladle injects `vite-tsconfig-paths` by default, so the `@/*` alias from
 *   tsconfig.json resolves in stories exactly as it does in the app. Nothing to
 *   configure — but see .ladle/workbench.module.css, which exercises the path
 *   so a regression shows up the moment the catalogue boots.
 *
 *   next/font — a Next build-time transform; it cannot run here. `appendToHead`
 *   below pulls the same two families (same pinned weights, same `latin`
 *   subset) from the Google CDN, and .ladle/workbench.css re-declares
 *   `--font-nunito` / `--font-baloo` so tokens.css composes `--font-body` /
 *   `--font-display` identically. This is the only place in the repo that talks
 *   to Google Fonts at runtime, and it is dev-tooling only — never shipped.
 * */

/**
 * The webfont URL, deliberately one unbroken literal: it was assembled from a
 * joined array once, and splitting a URL across array entries is a silent
 * corruption waiting to happen — a stray separator or a lost fragment yields a
 * URL that still looks plausible and just serves the wrong faces.
 *
 * The weights here MUST match the `next/font/google` calls in
 * src/app/layout.tsx (Nunito 400/600/700/800, Baloo 2 500/700/800). A parity
 * test (src/app/fonts.test.ts) ensures drift is caught.
 */
const googleFontsHref =
  "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Baloo+2:wght@500;700;800&display=swap";

export default {
  stories: "src/**/*.stories.{ts,tsx,mdx}",
  appendToHead: [
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="${googleFontsHref}">`,
  ].join(""),
  addons: {
    // Every primitive must render a visible focus ring (docs/design-system.md
    // "API & authoring conventions" §3), and the axe pass is cheap here even
    // though automated a11y auditing stays out of the test tiers.
    a11y: { enabled: true },
    // Mirrors --bp-sm / --bp-md / --bp-lg from tokens.css. `xsmall` is the
    // narrowest phone we care about; it has no token because no media query
    // targets it.
    width: {
      enabled: true,
      options: { xsmall: 360, sm: 480, md: 768, lg: 1024 },
      defaultState: 0,
    },
    // Dark mode is out of scope for v1 (the tokens.css stubs are empty), so the
    // theme switch would only ever toggle Ladle's own chrome. Hide it.
    theme: { enabled: false, defaultState: "light" },
  },
};
