# Styling is CSS Modules plus a two-layer design-token layer in CSS custom properties, not Tailwind

Charting the design-system map (issue #27) needed a styling technology before any component
decision could be made. The candidates were Tailwind (v4), CSS Modules with design tokens as
CSS custom properties, vanilla-extract, and plain global CSS. The choice was provisionally made
while charting and confirmed by the primitive-library research (issue #28), which found that
React Aria Components (RAC) styles cleanly either way and forces nothing.

**CSS Modules for component styles.** Each primitive owns a `<Component>.module.css` next to its
`.tsx`. Locally-scoped class names, no naming convention to police, zero runtime, and nothing
for the bundler to transform beyond what Next.js already does. A test that renders a component
sees real CSS class names, not a utility soup.

**A two-layer token system in CSS custom properties.** `src/ui/tokens.css` defines **primitive**
tokens (raw palette and scales — `--sand-500`, `--blue-500`) which feed **semantic** tokens
(role-based — `--color-text-muted`, `--color-at-risk-surface`, `--space-16`, `--radius-lg`).
Components consume **only** semantic tokens. The file is wrapped in `@layer tokens` and imported
once in the root layout. Dark mode is out of scope for v1 but the semantic layer is structured
so a later theme is a redefinition block, not a rewrite (ADR forward-compat only — no palette is
designed here).

**Variants map to classes with `cva`.** `class-variance-authority` maps variant props
(`tone`, `variant`, `size`) to CSS-Module class names; `clsx` is the only class-merging helper
(no `tailwind-merge` — there are no utility classes to deduplicate). Interaction state
(`data-pressed`, `data-focus-visible`, …) is styled in the `.module.css` via RAC's data
attributes, not in `cva`.

**Why not Tailwind.** RAC's Tailwind plugin is optional, not required, so Tailwind buys no
integration advantage here. Against it: Biome cannot stably sort utility classes
(`useSortedClasses` is nursery — ADR-0007), the design is a small closed set of tokens that maps
one-to-one onto custom properties rather than an open utility space, and utility strings on RAC
render-prop `className` functions read badly. Tailwind v4 would also be the only option pulling
in a required build-time toolchain step. **Why not vanilla-extract:** it needs a bundler plugin
and a `.css.ts` indirection for a zero-runtime result CSS Modules already gives natively under
Next.js. **Why not plain global CSS:** no scoping.

**Consequences.** The library ships one `tokens.css`, a `<Component>.module.css` per primitive,
and `cva` + `clsx` as the only styling dependencies. `next/font/google` supplies the two font
families as CSS variables on `<html>`. There is no Tailwind config, no PostCSS config beyond the
Next.js default, and no CSS-in-JS runtime. Motion is CSS transitions against `--dur-*` / `--ease-*`
tokens, disabled under `prefers-reduced-motion`. If a future need for utility classes emerges,
adding Tailwind alongside CSS Modules is possible but would reopen the Biome class-sorting
question.
