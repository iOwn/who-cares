# R-L: Lint & format toolchain — Biome vs ESLint-flat + Prettier

Research feeding decision ticket [#20](https://github.com/iOwn/who-cares/issues/20) (lint/format
toolchain grilling → ADR). Question source: [#19](https://github.com/iOwn/who-cares/issues/19).
Parent map: [#15](https://github.com/iOwn/who-cares/issues/15).

Compiled 2026-09-04. Facts verified against primary/first-party sources (biomejs.dev docs and
release blog, eslint.org, nextjs.org docs and release blog, the `eslint-config-next` package
source on GitHub) on that date. Where a claim rests on a third-party practitioner writeup it is
flagged inline as such. Tooling moves fast — re-check version-pinned facts before committing.

**This is a facts dump. It does not pick a winner.** The pick is ticket #20's call.

Context: WhoCares is a greenfield **Next.js App Router** app (ADR-0004), Vercel Hobby, two users,
minimal-ops bias. No `package.json` yet. The effort's standing preference is a minimal toolchain
(fewest dev-deps, fewest config files, least version churn) as the tie-breaker when a choice is
close — see map #15.

---

## 0. Headline findings

1. **`next lint` is gone.** It was deprecated in Next.js 15.5 (Aug 2025) and **removed in Next.js
   16**. New `create-next-app` now asks you to choose **ESLint, Biome, or no linter**; a greenfield
   project is not migrating away from anything, it is picking from a blank slate. Next.js 15.5's own
   blog copy calls Biome "a fast alternative" and describes ESLint as "comprehensive rules" / Biome
   as "fast with fewer rules". ([Next.js 15.5 blog](https://nextjs.org/blog/next-15-5#next-lint-deprecation),
   [Next.js 16 ESLint docs](https://nextjs.org/docs/app/api-reference/config/eslint))

2. **Config-file count: Biome 1, ESLint-flat+Prettier ~3–4.** Biome is one `biome.json` (or
   `biome.jsonc`) covering lint + format + import-sorting. The ESLint+Prettier path is
   `eslint.config.mjs` + a Prettier config + `.prettierignore` + (in practice) an
   `eslint-config-prettier` dependency to switch off formatting-related lint rules. Dev-dependency
   count: Biome is **1** package (`@biomejs/biome`); `eslint-config-next` alone pulls in **6 plugin
   packages** as direct deps (`@next/eslint-plugin-next`, `eslint-plugin-react`,
   `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-import`, `typescript-eslint`),
   plus `eslint`, `prettier`, `eslint-config-prettier`, and `prettier-plugin-tailwindcss` if Tailwind
   is used. ([Biome config docs](https://biomejs.dev/guides/configure-biome/),
   [eslint-config-next package.json](https://github.com/vercel/next.js/blob/canary/packages/eslint-config-next/package.json),
   [Next.js ESLint docs — "With Prettier"](https://nextjs.org/docs/app/api-reference/config/eslint#with-prettier))

3. **Biome 2.x ("Biotype", June 2025) added type-aware lint rules without needing `tsc`** — via its
   own lightweight inference engine, not the TypeScript compiler. Coverage is partial: the flagship
   `noFloatingPromises` rule "can detect floating promises in about 75% of the cases that would be
   detected by using typescript-eslint". So Biome no longer *needs* `typescript` installed for a
   subset of type-aware rules, but it is not at typescript-eslint parity.
   ([Biome v2 blog](https://biomejs.dev/blog/biome-v2/))

4. **The concrete `eslint-config-next` rule loss, for an App Router app, is smaller than the raw
   count suggests.** Biome's `next` domain reimplements ~10 of the ~19 Next-specific rules. Of the
   ~9 not covered, **most are Pages-Router / `pages/_document.js` rules that never fire in an
   `app/`-only codebase** (`no-duplicate-head`, `no-title-in-document-head`,
   `no-styled-jsx-in-document`, `no-script-component-in-head`, `no-typos` (Pages data-fetching
   fns)). The genuinely App-Router-relevant losses are **`no-html-link-for-pages`** (moderate),
   **`no-css-tags`** / **`no-page-custom-font`** (minor), and **`next-script-for-ga`** /
   **`no-assign-module-variable`** (trivial). Full table in §4.
   ([Biome domains](https://biomejs.dev/linter/domains/),
   [Next.js ESLint rules table](https://nextjs.org/docs/app/api-reference/config/eslint#rules))

5. **React-hooks parity: the two classic rules, yes; the new React Compiler rules, no.** Biome has
   `useHookAtTopLevel` (= `rules-of-hooks`) and `useExhaustiveDependencies` (= `exhaustive-deps`).
   It has **no equivalent** for the ~14 React-Compiler rules that now ship inside
   `eslint-plugin-react-hooks` v6+ (`set-state-in-effect`, `purity`, `immutability`, `refs`, …).
   `eslint-config-next` depends on `eslint-plugin-react-hooks` `^7`, so if it enables those in
   `recommended`, the gap widens. ([Biome domains](https://biomejs.dev/linter/domains/),
   [eslint-plugin-react-hooks README](https://github.com/facebook/react/tree/main/packages/eslint-plugin-react-hooks))

6. **a11y: Biome's coverage is broad and on by default.** Biome ships ~30 accessibility rules
   (mapped from `eslint-plugin-jsx-a11y`) in its `recommended` set. `eslint-config-next` also
   bundles `eslint-plugin-jsx-a11y` recommended. Rough parity here, with a live wrinkle on the
   ESLint side: `eslint-plugin-jsx-a11y` and `eslint-plugin-react` have lagged on ESLint 10 peer
   support (see §7). ([Biome rule sources](https://biomejs.dev/linter/rules-sources/),
   [eslint-config-next package.json](https://github.com/vercel/next.js/blob/canary/packages/eslint-config-next/package.json))

7. **Biome cannot sort Tailwind classes in a stable rule.** `useSortedClasses` exists but is a
   `nursery` rule, explicitly "only partially implemented". `prettier-plugin-tailwindcss` is the
   mature option and it needs the Prettier side. Only relevant if WhoCares adopts Tailwind (not yet
   decided). ([Biome useSortedClasses](https://biomejs.dev/linter/rules/use-sorted-classes/))

8. **Vercel is a "Prestige"/"prestige sponsor" of Biome** and Next.js first-party tooling now emits
   Biome configs — organisational alignment, not a support guarantee. Next.js core team gave no
   direct answer for ~2 years on [discussion #59347](https://github.com/vercel/next.js/discussions/59347)
   ("Support alternative linters such as Biome"); they resolved it by *removing* `next lint` so any
   linter is now equal. ([Biome v2 blog — sponsors](https://biomejs.dev/blog/biome-v2/),
   [discussion #59347](https://github.com/vercel/next.js/discussions/59347))

---

## 1. Biome 2.x — feature coverage (2026)

Current stable line is **Biome v2.5** (blog dated with the v2.5 release), **>500 lint rules** total.
([Biome v2.5 blog](https://biomejs.dev/blog/biome-v2-5/), [Biome linter overview](https://biomejs.dev/linter/))

### 1.1 Formatter

- One opinionated formatter, Prettier-philosophy (few knobs: `indentStyle`, `indentWidth`,
  `lineWidth`, plus a handful of JS/JSON-specific options).
- Languages: **JavaScript, TypeScript, JSX/TSX, JSON/JSONC, CSS, GraphQL**; **HTML formatter is
  experimental and off by default** as of v2. ([Biome formatter docs](https://biomejs.dev/formatter/),
  [Biome v2 blog — HTML formatter](https://biomejs.dev/blog/biome-v2/))
- Biome publishes a "Differences with Prettier" page; it does not claim 100% output parity, and its
  historical self-reported Prettier compatibility is ~96–97% (verify on
  [that page](https://biomejs.dev/formatter/differences-with-prettier/) before quoting a number).
- **No Tailwind class sorting** in a stable rule (see §0.7).
- Markdown/MDX: **not formatted** by Biome (out of this effort's scope anyway per map #15).

### 1.2 Linter

- Rule groups incl. `a11y`, `complexity`, `correctness`, `nursery`, `performance`, `security`,
  `style`, `suspicious`. A `recommended` preset is on by default and **includes the `a11y` group**.
- `nursery` rules are **not** enabled by `recommended` on stable releases — explicit opt-in only.
  ([Biome linter docs](https://biomejs.dev/linter/))
- **Domains** (Biome 2): technology bundles auto-activatable from detected `package.json` deps —
  `next`, `react`, `test`, `solid`, `vue`, etc. `{ "domains": { "next": "recommended" } }` (or
  `"all"`) turns on the framework rule set. ([Biome domains](https://biomejs.dev/linter/domains/))

### 1.3 Type-aware rules without `tsc`

- Biome 2 ships "the first type-aware linter that doesn't require `tsc`" — its own inference engine,
  no `typescript` package needed for the supported rules.
  ([Biome v2 blog](https://biomejs.dev/blog/biome-v2/))
- Coverage is **partial and growing**. `noFloatingPromises` ≈ 75% of typescript-eslint's detection.
  Later releases ("70+ rules spread among Vue, type-aware rules, and more" in v2.5) keep expanding
  it, but Biome does not claim typescript-eslint parity for type-aware analysis.
  ([Biome v2.5 blog](https://biomejs.dev/blog/biome-v2-5/))
- Cross-file / module-graph analysis exists in v2.5 (e.g. `noUndeclaredClasses`, `noUnusedClasses`
  spanning CSS↔JSX). ([Biome v2.5 blog](https://biomejs.dev/blog/biome-v2-5/))

### 1.4 Plugins / custom rules

- Biome 2 introduced **GritQL-based linter plugins**: match a code pattern, emit a diagnostic;
  v2.5 added **plugin-declared code fixes** (`=>`). ([Biome v2 blog](https://biomejs.dev/blog/biome-v2/),
  [Biome v2.5 blog](https://biomejs.dev/blog/biome-v2-5/))
- This is **pattern-matching, not arbitrary AST-visitor rules**. You still cannot write a
  full custom rule the way an ESLint plugin author can. Distribution mechanism for plugins was
  still "undecided, pending community feedback" as of the v2 blog.

### 1.5 Other v2 features

Monorepo support (nested `biome.json` with `"root": false` / `"extends": "//"`), revamped import
organizer (merges and sorts imports, organizes `export`s), **assists** (code actions without a
diagnostic — `useSortedKeys`, `useSortedAttributes`), file-level and range suppressions
(`// biome-ignore-all`, `// biome-ignore-start`/`-end`), configurable via the one config file.
([Biome v2 blog](https://biomejs.dev/blog/biome-v2/))

---

## 2. ESLint-flat + Prettier — shape (2026)

### 2.1 ESLint 10

- **ESLint v10.0.0 shipped February 2026.** The legacy `.eslintrc.*` / `.eslintignore` system is
  **fully removed** — flat config (`eslint.config.js`/`.mjs`/`.cjs`/`.ts`) only. CLI flags
  `--no-eslintrc`, `--env`, `--resolve-plugins-relative-to`, `--rulesdir`, `--ignore-path` are gone.
  ([ESLint v10 released](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/),
  [What's coming in ESLint 10](https://eslint.org/blog/2025/10/whats-coming-in-eslint-10.0.0/))
- A greenfield project writes flat config from the start, so the migration pain is not WhoCares'
  — but the **plugin-ecosystem churn is**: see §7.

### 2.2 `eslint-config-next`

- Two entry points: base (`eslint-config-next`) and `eslint-config-next/core-web-vitals` (base +
  Core-Web-Vitals rules bumped warning→error; this is the `create-next-app` default). Optional
  `eslint-config-next/typescript` adds `typescript-eslint` recommended.
  ([Next.js ESLint docs](https://nextjs.org/docs/app/api-reference/config/eslint))
- Bundles the **recommended** sets of `@next/eslint-plugin-next`, `eslint-plugin-react`, and
  `eslint-plugin-react-hooks` (per the docs' Reference section); the package's `dependencies` also
  include `eslint-plugin-jsx-a11y ^6.10`, `eslint-plugin-import ^2.32`, and `typescript-eslint ^8.46`
  (canary / v16 line). Peer: `eslint >=9`.
  ([eslint-config-next package.json](https://github.com/vercel/next.js/blob/canary/packages/eslint-config-next/package.json))
- Minimal flat config is ~10 lines: `import nextVitals from 'eslint-config-next/core-web-vitals'`
  then spread it. `@next/eslint-plugin-next` now defaults to flat-config format.
  ([Next.js 15.5 blog](https://nextjs.org/blog/next-15-5))

### 2.3 Prettier alongside ESLint

- Next.js docs recommend adding `eslint-config-prettier` to disable ESLint's formatting-adjacent
  rules so the two don't fight. Prettier itself is configured in a `.prettierrc` /
  `prettier.config.js` + `.prettierignore`. ([Next.js ESLint docs — "With Prettier"](https://nextjs.org/docs/app/api-reference/config/eslint#with-prettier))
- Prettier does format Markdown/YAML/etc. out of the box (Biome does not), though prose linting is
  out of scope for this effort (map #15).

---

## 3. `eslint-config-next` / `@next/eslint-plugin-next` — full rule inventory

All 21 rules enabled in `@next/eslint-plugin-next`'s `recommended` config, verbatim from the
[Next.js ESLint docs](https://nextjs.org/docs/app/api-reference/config/eslint#rules):

| Rule | What it catches |
|---|---|
| `google-font-display` | `font-display` behaviour with Google Fonts |
| `google-font-preconnect` | missing `preconnect` for Google Fonts |
| `inline-script-id` | `id` on `next/script` with inline content |
| `next-script-for-ga` | prefer `next/script` over inline GA script |
| `no-assign-module-variable` | assignment to the `module` variable |
| `no-async-client-component` | Client Components declared `async` |
| `no-before-interactive-script-outside-document` | `beforeInteractive` script strategy outside `_document` |
| `no-css-tags` | manual `<link rel="stylesheet">` tags |
| `no-document-import-in-page` | `next/document` imported outside `pages/_document` |
| `no-duplicate-head` | duplicate `<Head>` in `pages/_document` |
| `no-head-element` | raw `<head>` element |
| `no-head-import-in-document` | `next/head` in `pages/_document` |
| `no-html-link-for-pages` | `<a>` instead of `<Link>` for internal navigation |
| `no-img-element` | `<img>` instead of `next/image` (LCP / bandwidth) |
| `no-page-custom-font` | page-scoped custom `<link>` font instead of `next/font` |
| `no-script-component-in-head` | `next/script` inside `next/head` |
| `no-styled-jsx-in-document` | `styled-jsx` in `pages/_document` |
| `no-sync-scripts` | synchronous `<script>` |
| `no-title-in-document-head` | `<title>` in the `next/document` `Head` |
| `no-typos` | typos in Pages-Router data-fetching function names |
| `no-unwanted-polyfillio` | duplicate polyfills already shipped by Next.js |

Plus, via `core-web-vitals`, a subset of the above is bumped from warning to error.

---

## 4. The rule-loss list — Biome `next` domain vs `@next/eslint-plugin-next`

Biome's **`next` domain** (`biomejs.dev/linter/domains`) enables these Next-equivalent rules
(names are Biome's): `noBeforeInteractiveScriptOutsideDocument`, `noNextAsyncClientComponent`,
`useInlineScriptId`, `noImgElement`, `noSyncScripts`, `noUnwantedPolyfillio`,
`useGoogleFontPreconnect`, `noHeadElement`, `noDocumentImportInPage`, `noHeadImportInDocument`
(+ `useExhaustiveDependencies`, `useHookAtTopLevel` shared with the `react` domain).
`useGoogleFontDisplay` also exists as a Biome rule.
([Biome domains](https://biomejs.dev/linter/domains/),
[Biome rule sources](https://biomejs.dev/linter/rules-sources/))

| `@next` rule | Biome equivalent? | Matters for an **App Router** app? |
|---|---|---|
| `google-font-preconnect` | ✅ `useGoogleFontPreconnect` | — |
| `google-font-display` | ✅ `useGoogleFontDisplay` (rule exists) | — |
| `inline-script-id` | ✅ `useInlineScriptId` | — |
| `no-async-client-component` | ✅ `noNextAsyncClientComponent` | — |
| `no-before-interactive-script-outside-document` | ✅ `noBeforeInteractiveScriptOutsideDocument` | — |
| `no-document-import-in-page` | ✅ `noDocumentImportInPage` | — |
| `no-head-element` | ✅ `noHeadElement` | — |
| `no-head-import-in-document` | ✅ `noHeadImportInDocument` | — |
| `no-img-element` | ✅ `noImgElement` | — |
| `no-sync-scripts` | ✅ `noSyncScripts` | — |
| `no-unwanted-polyfillio` | ✅ `noUnwantedPolyfillio` | — |
| **`no-html-link-for-pages`** | ❌ none | **Moderate.** Flags `<a href="/internal">` where `<Link>` should be used (client nav, prefetch). Still fires in App Router. Loss = accidental raw `<a>` to an internal route slips through; caught easily in review, and TypeScript `typedRoutes` + habit mitigate. Historically this rule needed to enumerate routes from the filesystem. |
| **`no-css-tags`** | ❌ none | **Minor.** Encourages Next's CSS handling over hand-rolled `<link rel=stylesheet>`. Low frequency in a small app. |
| **`no-page-custom-font`** | ❌ none | **Minor.** Nudges toward `next/font` (perf: no layout shift, self-hosting). One-time decision when you add a font; not a recurring footgun. |
| `next-script-for-ga` | ❌ none | **Trivial.** Only relevant if adding a raw Google Analytics snippet. WhoCares is a 2-user app; likely no analytics. |
| `no-assign-module-variable` | ❌ none | **Trivial.** Extremely rare footgun (`let module = …` at module scope). |
| `no-duplicate-head` | ❌ none | **None.** `<Head>`/`pages/_document` is Pages Router only. |
| `no-title-in-document-head` | ❌ none | **None.** Pages Router `_document` only. |
| `no-styled-jsx-in-document` | ❌ none | **None.** Pages Router `_document` only. |
| `no-script-component-in-head` | ❌ none | **None/low.** Tied to `next/head` (Pages Router); App Router uses the Metadata API. |
| `no-typos` | ❌ none | **None.** Catches typos in `getServerSideProps` / `getStaticProps` etc. — Pages Router data fetching, absent in App Router. |

**Net for WhoCares (App Router, `app/` only):** the practically-felt loss is **one moderate rule
(`no-html-link-for-pages`) + two minor ones (`no-css-tags`, `no-page-custom-font`)**. The other
six "lost" rules guard Pages-Router / `_document` patterns this codebase will never contain. A
GritQL plugin could re-cover `no-html-link-for-pages`-style checks partially, but not for free.

---

## 5. `jsx-a11y` and `react-hooks` parity

### 5.1 `eslint-plugin-jsx-a11y`

- Biome maps ~30+ rules from `eslint-plugin-jsx-a11y` (e.g. `useAltText`, `useValidAriaRole`,
  `useValidAriaProps`, `noAutofocus`, `noPositiveTabindex`, `useKeyWithClickEvents`, …), and the
  `a11y` group is part of `recommended`. Coverage is broadly comparable to jsx-a11y's recommended
  set; a few niche jsx-a11y rules have no Biome counterpart (verify the exact delta on
  [rule sources](https://biomejs.dev/linter/rules-sources/) at decision time).
- `eslint-config-next` bundles `eslint-plugin-jsx-a11y` recommended.
- **Wrinkle on the ESLint side:** community reports (practitioner writeups, e.g.
  [chris.lu Next.js 16 linting](https://chris.lu/web_development/tutorials/next-js-16-linting-setup-eslint-10-flat-config))
  flag `eslint-plugin-jsx-a11y` and `eslint-plugin-react` as slow to declare ESLint 10 peer
  support, with some setups dropping a11y linting entirely during the ESLint 10 transition. Treat
  as a moving target; `eslint-config-next` canary still lists both as deps.

### 5.2 `eslint-plugin-react-hooks`

| ESLint rule | Biome |
|---|---|
| `react-hooks/rules-of-hooks` | ✅ `useHookAtTopLevel` |
| `react-hooks/exhaustive-deps` | ✅ `useExhaustiveDependencies` (inspired-by; behaviour not identical) |
| `react-hooks/set-state-in-effect`, `purity`, `immutability`, `refs`, `set-state-in-render`, `static-components`, `preserve-manual-memoization`, `error-boundaries`, `gating`, `globals`, `use-memo`, `incompatible-library`, `unsupported-syntax`, `config` (React Compiler rules, v6+) | ❌ no equivalent |

For the **two rules that matter to essentially every React codebase**, Biome has parity. The
React-Compiler rule family is newer, partly experimental (`recommended-latest`), and only bites if
you adopt the React Compiler — not a v1 concern for WhoCares, but worth noting the direction of
travel: `eslint-config-next` depends on `eslint-plugin-react-hooks ^7`.
([eslint-plugin-react-hooks README](https://github.com/facebook/react/tree/main/packages/eslint-plugin-react-hooks))

---

## 6. Editor + CI integration

| | Biome | ESLint-flat + Prettier |
|---|---|---|
| VS Code | One official extension (`biomejs.biome`), maintained by the Biome team. Set as `editor.defaultFormatter`; format-on-save + lint diagnostics + safe fixes from one LSP. | Two extensions (`dbaeumer.vscode-eslint`, `esbenp.prettier-vscode`), each configured separately; ESLint flat-config support is stable in current versions. |
| Other editors | First-party Zed extension; LSP for Neovim etc.; JetBrains via plugin. | Mature everywhere. |
| CI | Single `biome ci` command (CI-tuned reporter, no writes); official `biomejs/setup-biome` GitHub Action. Standalone binary, **Node not required** on the runner (also distributed via npm). | `eslint .` + `prettier --check .` as two steps; both need Node + `npm install` of the full plugin tree. |
| Speed | Rust, parallel. Third-party benchmarks (flagged: practitioner writeups) report **10–35× faster** than ESLint+Prettier on 500+ file projects; the practical effect cited is "pre-commit hooks that take 10s get disabled; hooks that take 0.5s stay on". ([CODERCOPS 2026](https://blog.codercops.com/blog/biome-javascript-linter-formatter-2026), [reactlibraries.com](https://www.reactlibraries.com/blog/biome-vs-prettier-eslint-next-js-15-setup-guide)) | Baseline; ESLint flat config + type-aware rules are the slow path. |
| Pre-commit | `biome check --staged --write` in one hook; or `lint-staged` calling `biome check --write`. | `lint-staged` running `eslint --fix` + `prettier --write` (two commands). Next.js docs show the `lint-staged` recipe. |

WhoCares is on **Vercel Hobby** with once-daily cron and a tiny codebase; CI runtime differences
are measured in seconds either way at this scale. The editor-setup simplicity (one extension, one
config) is the more tangible day-to-day difference for an intermittently-touched hobby app.

---

## 7. Migration friction (either direction)

- **Adopt Biome now, switch to ESLint later:** add `eslint` + `eslint-config-next` +
  `eslint.config.mjs` + Prettier + `eslint-config-prettier`; re-teach the editor/CI/hooks. Biome's
  `biome.json` has no ESLint export path, so rule-by-rule re-selection is manual. Est. half a day.
- **Adopt ESLint+Prettier now, switch to Biome later:** `biome migrate eslint` and
  `biome migrate prettier` read the existing configs and translate settings/rules automatically
  (documented first-party commands); then delete the ESLint/Prettier deps and configs. Accept the
  §4 rule gaps. Est. an hour or two.
  ([Biome migrate docs](https://biomejs.dev/guides/migrate-eslint-prettier/))
- **The reversible-vs-not asymmetry:** Biome→ESLint is more manual; ESLint→Biome is tool-assisted.
  Neither is a one-way door for a codebase this small. The sunk cost is editor/CI/hook wiring and
  team habit, not the config file.
- **Third, cheap option:** ESLint for the Next/React/a11y rules **with Biome as the formatter**
  (drop Prettier, keep `eslint-config-prettier` to silence ESLint formatting rules). Gets Biome's
  fast formatter + full `eslint-config-next` rule coverage; costs two tools + two configs and the
  ESLint speed penalty on lint. Some 2025–2026 writeups converge on this as the pragmatic middle
  (flagged: practitioner opinion). ([betterstack Biome vs ESLint](https://betterstack.com/community/guides/scaling-nodejs/biome-eslint/))

---

## 8. Next.js core-team direction

- [Discussion #59347](https://github.com/vercel/next.js/discussions/59347) ("Support alternative
  linters such as Biome"), open Dec 2023: no direct core-team reply in-thread for ~2 years. Resolved
  by the `next lint` **deprecation (15.5) and removal (16)** — the team's answer was to stop
  wrapping any linter, making Biome and ESLint equal citizens.
  ([Next.js 15.5 blog](https://nextjs.org/blog/next-15-5#next-lint-deprecation))
- `create-next-app` now prompts **ESLint / Biome / none** and, for the Biome choice, "receive[s]
  optimized configurations with Next.js and React rules plus built-in formatting".
  ([Next.js 15.5 blog](https://nextjs.org/blog/next-15-5#next-lint-deprecation))
- `next build` still runs an ESLint validation step if an ESLint config is present in 15.x; that
  auto-lint-on-build is also being removed. There is **no** build-time Biome hook — linting is
  entirely your `package.json` scripts / CI. ([Next.js 15.5 blog](https://nextjs.org/blog/next-15-5#next-lint-deprecation))
- Vercel is listed among Biome's sponsors ("Prestige" tier) on the
  [Biome v2 blog](https://biomejs.dev/blog/biome-v2/). Signals alignment; not a maintenance SLA.
- `@next/eslint-plugin-next` continues to be maintained and now defaults to flat config for ESLint
  10. Both paths are first-party-supported going forward.

---

## 9. Notable 2025–2026 writeups (secondary; corroboration only)

Flagged as practitioner opinion, not primary sources. Useful for "what does adoption actually feel
like" but every load-bearing fact above is cited to a primary source.

- [chris.lu — "Next.js 16 Linting setup using ESLint 10 flat config"](https://chris.lu/web_development/tutorials/next-js-16-linting-setup-eslint-10-flat-config)
  — detailed teardown of the ESLint 10 plugin peer-dependency churn; drops `eslint-config-next`,
  swaps `eslint-plugin-react` for `@eslint-react/eslint-plugin`, notes losing a11y linting.
- [tsepakme — "Next.js 15.5: Goodbye ESLint and Prettier, Hello Biome"](https://www.tsepakme.com/blog/nextjs-biome-migration)
- [betterstack — "Biome vs ESLint: Comparing JavaScript Linters and Formatters"](https://betterstack.com/community/guides/scaling-nodejs/biome-eslint/)
- [peal.dev — "Biome vs ESLint + Prettier — Is It Time to Switch?"](https://www.peal.dev/blog/biome-vs-eslint-prettier-new-linting-landscape)
- [CODERCOPS — "Biome in 2026: One Tool to Replace ESLint and Prettier"](https://blog.codercops.com/blog/biome-javascript-linter-formatter-2026)
- [jsmanifest — "Biome vs Oxlint in 2026"](https://jsmanifest.com/biome-oxlint-comparison-2026)
  — note **Oxlint** (Rust, ESLint-compatible rule set, no formatter) is a third entrant; out of
  scope for #19's bake-off but named here for completeness.
- [DEV — "How to Set Up Husky + Biome in a Next.js Project (2026 Guide)"](https://dev.to/imkarmakar/how-to-set-up-husky-biome-in-a-nextjs-project-2026-guide-9jh)

---

## 10. Decision inputs this leaves for #20

- **Weight of `no-html-link-for-pages`** — is losing the one moderate App-Router-relevant rule
  acceptable against the single-config / single-dep saving? (Standing minimal-toolchain bias in #15
  leans yes; #20's call.)
- **Tailwind?** If WhoCares adopts Tailwind, class-sorting needs `prettier-plugin-tailwindcss` →
  pulls the Prettier side back in, weakening Biome's one-tool advantage. Resolve the CSS-approach
  question first, or decide independent of it.
- **Formatter-only Biome + ESLint-lint** (the §7 middle path) — is the extra config worth full
  `eslint-config-next` coverage, or is that exactly the two-tool complexity the effort wants to
  avoid?
- **React Compiler** — not v1, but if it's on the roadmap the react-hooks-v6 rule family is
  ESLint-only today.
- **ESLint 10 ecosystem churn** — the ESLint path is not "stable and boring" right now; the plugin
  peer-dep situation (§7, §5.1) is in flux through 2026.

---

## Sources

Primary:
- Biome — [v2 "Biotype" blog](https://biomejs.dev/blog/biome-v2/),
  [v2.5 blog](https://biomejs.dev/blog/biome-v2-5/),
  [Linter overview](https://biomejs.dev/linter/),
  [Domains](https://biomejs.dev/linter/domains/),
  [Rule sources](https://biomejs.dev/linter/rules-sources/),
  [Formatter](https://biomejs.dev/formatter/),
  [useSortedClasses](https://biomejs.dev/linter/rules/use-sorted-classes/),
  [Configure Biome](https://biomejs.dev/guides/configure-biome/),
  [Migrate from ESLint & Prettier](https://biomejs.dev/guides/migrate-eslint-prettier/)
- Next.js — [ESLint config docs (v16)](https://nextjs.org/docs/app/api-reference/config/eslint),
  [15.5 release blog](https://nextjs.org/blog/next-15-5),
  [Upgrading to Version 16](https://nextjs.org/docs/app/guides/upgrading/version-16),
  [Discussion #59347 — alternative linters](https://github.com/vercel/next.js/discussions/59347)
- [`eslint-config-next` package.json (canary)](https://github.com/vercel/next.js/blob/canary/packages/eslint-config-next/package.json)
- ESLint — [v10.0.0 released (Feb 2026)](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/),
  [What's coming in ESLint 10](https://eslint.org/blog/2025/10/whats-coming-in-eslint-10.0.0/),
  [Configuration Migration Guide](https://eslint.org/docs/latest/use/configure/migration-guide)
- [`eslint-plugin-react-hooks` README](https://github.com/facebook/react/tree/main/packages/eslint-plugin-react-hooks)

Secondary / corroborating (practitioner writeups, flagged inline where used):
- [chris.lu — Next.js 16 linting / ESLint 10 flat config](https://chris.lu/web_development/tutorials/next-js-16-linting-setup-eslint-10-flat-config)
- [betterstack — Biome vs ESLint](https://betterstack.com/community/guides/scaling-nodejs/biome-eslint/)
- [tsepakme — Next.js 15.5: Hello Biome](https://www.tsepakme.com/blog/nextjs-biome-migration)
- [peal.dev — Biome vs ESLint + Prettier](https://www.peal.dev/blog/biome-vs-eslint-prettier-new-linting-landscape)
- [CODERCOPS — Biome in 2026](https://blog.codercops.com/blog/biome-javascript-linter-formatter-2026)
- [reactlibraries.com — Biome vs Prettier+ESLint Next.js 15 setup](https://www.reactlibraries.com/blog/biome-vs-prettier-eslint-next-js-15-setup-guide)
- [jsmanifest — Biome vs Oxlint 2026](https://jsmanifest.com/biome-oxlint-comparison-2026)
- [DEV — Husky + Biome in Next.js (2026)](https://dev.to/imkarmakar/how-to-set-up-husky-biome-in-a-nextjs-project-2026-guide-9jh)
