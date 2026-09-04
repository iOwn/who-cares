# Biome (all-in) for lint, format, and import-sorting, over ESLint-flat + Prettier

Picking the lint/format toolchain (issue #19 research, issue #20 decision) was a genuine
bake-off. `next lint` was removed in Next 16, so this is a greenfield pick with nothing to
migrate away from.

**Biome does all three jobs — lint, format, import-sorting — from one tool.** One
dev-dependency (`@biomejs/biome`), one config file (`biome.json`), the `recommended` rule set
(which includes the `a11y` group) plus the `next` and `react` domains. The alternative,
ESLint-flat + Prettier, is roughly ten dependencies and three-to-four config files, with the
`eslint-config-next` plugin tree on top. The minimal-toolchain bias is this effort's explicit
tie-breaker and the gap is wide, so Biome wins. The Biome-format / ESLint-lint hybrid was also
rejected — it keeps both dependency trees.

**Accepted costs, eyes open.** Biome has no equivalent of `no-html-link-for-pages`: a stray
raw `<a href="/internal">` can slip past the linter, mitigated by review habit and TypeScript
`typedRoutes`. `no-css-tags` and `no-page-custom-font` are also unmatched but minor and
one-time. The remaining unmatched `eslint-config-next` rules only guard Pages-Router patterns
this `app/`-only codebase will never contain. Biome has no React-Compiler lint rules (those
are ESLint-only) — not a v1 concern, and it does have the classic hook rules.

**Why not wait for ESLint to settle.** The ESLint 10 transition is in active flux right now
(flat-config-only, with `eslint-plugin-jsx-a11y` / `eslint-plugin-react` lagging on peer
support). Adopting that churn to gain a handful of Next-specific rules is a poor trade for a
hobby app touched intermittently.

**Consequences**: CI runs a single `biome ci` step; the editor uses the official
`biomejs.biome` extension as the default formatter; the pre-commit hook runs
`biome check --write` on staged files (ADR context: issue #23). If WhoCares later adopts
Tailwind, class-sorting is a small contained follow-up — Biome's `useSortedClasses` is
nursery-grade — not a reason to reintroduce Prettier. Reversal is tool-assisted
(`biome migrate eslint`) if it ever comes to that.
