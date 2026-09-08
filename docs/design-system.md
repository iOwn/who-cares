# Design system

How WhoCares looks and how its component library is built. This is the dev-setup doc a build
agent follows when it creates `src/ui/`. The hard-to-reverse picks each have an ADR (linked per
section); the rest is settled here.

**Mostly planning, now being built out.** The doc was written ahead of the code, so read every
"the build effort creates …" note as a to-do unless
[What the build effort creates](#what-the-build-effort-creates) marks it done — that section is
the running ledger. Landed so far: the token layer, the fonts, and the Ladle workbench
([iOwn/who-cares#41](https://github.com/iOwn/who-cares/issues/41)). Still unbuilt: every
primitive under `src/ui/<Component>/` and the component-test tier. The
decisions behind all of it are on the wayfinder map
([iOwn/who-cares#27](https://github.com/iOwn/who-cares/issues/27)); see its Decisions-so-far for
the one-line gist + link behind each choice.

## Direction: Toybox

**Warm, chunky, playful-but-productive.** A two-person household app for a recurring chore — it
should feel light and friendly, never corporate or stern, but it is a tool people use quickly
and leave, not a toy to linger in.

- **Palette**: warm off-white ground (`--sand-50`), ink-not-black text, friendly primaries —
  blue accent, amber highlight, green / amber / red day-state colours.
- **Type**: Nunito for body, Baloo 2 for display / headings — rounded, warm sans-serifs.
- **Shape**: chunky rounded tiles (`--radius-sm`…`--radius-xl`), generous 2–3px borders.
- **Depth**: hard offset "sticker" shadows (`0 3px 0 var(--ink-900)`), no blur, no soft
  elevation. The signature move.
- **Motion**: a "press" affordance — on press, a control drops `translateY(2px)` and its offset
  shadow collapses one step, like a physical button. Tokenized, disabled under
  `prefers-reduced-motion`.

Built out to 7 reference screens in `.design/*.dc.html` (untracked): `Main`, `List`,
`DayDetail`, `Inbox`, `ImOut`, `Recurring`, `Settings`. The 3 alternate directions in that
folder (`Brick` / `Material` / `Nordic`) are reference only — **Toybox is locked**.

## Styling tech

See **[ADR-0010](./adr/0010-css-modules-and-custom-property-tokens-over-tailwind.md)**.

- **CSS Modules** for component styles — one `<Component>.module.css` per primitive,
  locally-scoped class names, zero runtime, nothing for the bundler to transform beyond what
  Next.js does natively.
- **Design tokens as CSS custom properties**, two layers (see [Token model](#token-model)).
- **No Tailwind** — RAC's Tailwind plugin is optional, Biome can't stably sort utility classes
  (ADR-0007), and the design is a small closed token set that maps 1:1 onto custom properties.
  **No vanilla-extract** (needs a bundler plugin + `.css.ts` indirection for a result CSS
  Modules gives natively). **No CSS-in-JS runtime.**
- **Variants**: `cva` (`class-variance-authority`) maps variant props to imported CSS-Module
  class references; `clsx` is the only class-merge helper (aliased `cx`). No `tailwind-merge`.
- Net new styling dependencies: `class-variance-authority`, `clsx`.

## Primitive library: React Aria Components

See **[ADR-0011](./adr/0011-primitives-are-built-on-react-aria-components.md)**. Backing
research lives on the unmerged `research/primitive-library` branch
(`docs/research/primitive-library.md`), linked from decision ticket
[iOwn/who-cares#28](https://github.com/iOwn/who-cares/issues/28).

- **`react-aria-components`** (RAC) — the deciding factor was the **date-range picker**: RAC is
  the only headless option with a real screen-reader-tested `DateField` + `RangeCalendar`. Radix
  has no date primitive; Radix / shadcn both fall back to `react-day-picker` (inline grid only —
  accessible trigger, text input, `aria-live` announcement, and range-cap guard are all a
  from-scratch build).
- **The 4-week booking cap** is one line: `maxValue={today(getLocalTimeZone()).add({ weeks: 4 })}`
  — it also disables the calendar's next-month paging button at the boundary.
- **Bundle cost**: ~80–110 KB gzip for the ~6 primitives that need RAC (heaviest of the three
  candidates by ~50 KB, on a screen 2 users hit occasionally — a tie-breaker, not a blocker).
  Mitigate by **merging** `experimental.optimizePackageImports: ['react-aria-components']` into
  the existing `next.config.ts` (which already carries `agentRules: false` from #35 — add the
  key, don't replace the file) and keeping **every** RAC import inside a `'use client'` file
  (Next.js [#60246](https://github.com/vercel/next.js/issues/60246)).
- **Styling fit**: RAC exposes interaction state as data-attributes (`data-pressed`,
  `data-focus-visible`, `data-selected`, …) and a render-prop `className`. Style state in
  `*.module.css` via `&[data-pressed]` selectors — never with render-prop booleans.
- **Runner-up**: Radix + `react-day-picker`, *only* if the build effort finds RAC's bundle
  unacceptable and is willing to own an accessible date-range-picker composition + its tests.

## Token model

`src/ui/tokens.css` (live) + `src/ui/breakpoints.ts` (the JS mirror). Full
extraction + WCAG audit: [iOwn/who-cares#29](https://github.com/iOwn/who-cares/issues/29).

- **Two layers.** **Primitive** tokens (`--<hue>-<step>`, raw palette / scale, no meaning) feed
  **semantic** tokens (role-based, category-prefixed — `--color-*`, `--space-*`, `--text-*`,
  `--radius-*`, `--shadow-*`, `--z-*`, `--dur-*`, `--ease-*`, `--bp-*`, `--font-*`).
  **Components consume only semantic tokens**, never a primitive directly. Verified: no
  component needs to read a primitive.
- **One file**, `src/ui/tokens.css`, wrapped in `@layer tokens`, order primitives → semantic
  (light) → dark stubs. Imported **once per runtime** and nowhere else: `src/app/layout.tsx`
  for the app, `.ladle/components.tsx` for the workbench. Components reach tokens through the
  cascade — a component that imports `tokens.css` is a bug.
- **Units**: type + space in `rem` (root 16px); radius / border-width / shadow-offset in `px`.
- **Categories**: colour, type scale, weight / leading / tracking, space, radius, border-width,
  shadow, z-index, motion (duration + easing), breakpoints. Token number = px for space /
  radius (e.g. `--space-16` = 1rem = 16px).
- **Contrast policy**: WCAG 2.2 AA (4.5:1 body text, 3:1 large text & UI borders). Placeholder +
  disabled text exempt, self-imposed ≥3:1 floor. The #29 audit failed 5 muted greys (collapsed
  to 2 corrected tokens) and 3 of 4 state-text colours (all darkened except at-risk); the
  corrected hexes are what's in `tokens.css`. **Body default is `--text-md` (14px)** — one step
  up from the designs' 13px.
- **Viewport meta MUST allow pinch-zoom** — no `user-scalable=no` / `maximum-scale=1` (WCAG
  1.4.4). Set explicitly via the `viewport` export in `src/app/layout.tsx`
  (`maximumScale: 5`, `userScalable: true`), not left to Next's default, so the requirement has
  a comment to argue with.
- **`--color-focus-ring`** is a token the designs didn't have — the Toybox screens show no
  focus-visible state, and RAC surfaces focus via `[data-focus-visible]` which **must** be
  styled. See [API & authoring conventions](#api--authoring-conventions) §3.
- **Breakpoints wart**: CSS custom properties can't appear in an `@media` prelude. CSS Module
  media queries repeat the literal pixel value with a `/* --bp-md */` comment;
  `src/ui/breakpoints.ts` is the single source for JS (`matchMedia`, RAC responsive props).
  `src/ui/breakpoints.test.ts` (the `node` project) parses `tokens.css` for `--bp-*` and asserts
  parity with `breakpoints.ts` — names, values, and the derived `mq` strings. Its regex expects
  the literal `--bp-<name>: <n>px;` shape, so keep the declarations plain.
- **Dark mode is out of scope for v1** — `tokens.css` carries commented stubs
  (`@media (prefers-color-scheme: dark)` + `:root[data-theme="dark"]`); only the semantic block
  is ever redefined, primitive ramps stay as-is.
- **`--shadow-color` is a token** so a later dark theme can retune the offset (pure-black reads
  harsh on a dark ground).
- **The press pattern is a documented recipe, not a token**: on `:active` / `[data-pressed]`,
  `transform: translateY(2px)` and step the offset shadow down one (`lg→sm`, `md→sm`, `sm→none`),
  transition `transform var(--dur-fast) var(--ease-standard)`, neutralised under
  reduced-motion.

## Component inventory

Full spec (purpose, screens used, variants + states, rough prop sketch) in
**[`design-system-inventory.md`](./design-system-inventory.md)**, assembled from the resolution
of [iOwn/who-cares#30](https://github.com/iOwn/who-cares/issues/30). **22 P0 primitives + 13 P1
feature-composed.** The build effort turns the sketches into final signatures — neither doc
pins 22 prop signatures.

### Library location

`src/ui/`, path alias `@/ui`. **A folder in the app, not a separate package or workspace.**
Folder-per-component, `src/ui/tokens.css`, barrel export at `src/ui/index.ts`.

### Display state vs domain Day state

The domain `Day state` stays **exactly** `Resolved | Pending | At-risk | n/a` (CONTEXT.md and
code unchanged). The UI derives a **presentation-only** state via one `dayDisplayState()` mapper
in `src/ui`:

- `StatePill` / `StateDot` / `Legend`: `resolved | pending | at-risk | closed` (4 states).
- `DayCell` (grid): those 4 + `quiet` (childcare day, nothing happening — small grey dot) +
  `off` (weekday not in the pattern).
- `closed` = `n/a` caused by an explicit `Closure`; `off` = `n/a` for a non-pattern weekday.
  **Neither is ever a domain state.** This is a pure function → unit-tested in the `node`
  project (see [Testing](#testing)).

### P0 — primitives (fully specified in #30)

`Button`, `IconButton`, `FAB`, `Surface`, `StatePill`, `StateDot`, `CountBadge`, `Callout`,
`Dialog` (+ `Dialog.Header`), `SegmentedControl`, `TextField`, `TextArea`, `DateField`,
`ToggleGroup`, `Avatar`, `PersonChip`, `SectionHeading`, `AppHeader`, `RouteHeader`,
`ActionBar`, `Spinner`, `EmptyState`. Plus `VisuallyHidden` (re-exported from RAC) for static
SR-only text.

Decisions folded in from #30:

- **`FAB` is its own primitive** — the amber `--color-highlight` role lives **only** here; its
  position is feature-owned (not `position: fixed`).
- **`AppHeader` + `RouteHeader` are separate primitives** — no generic `TopBar`.
- **One `Callout`** unifies the at-risk nudge + the info panels: `tone: "danger" | "info" |
  "neutral"`, optional `title` / `action` / `footnote`, not dismissable in v1. P1
  `AbsenceImpact` / `RecurringPreview` are thin wrappers over it.
- **One `Dialog`** with `presentation: "sheet" | "center" | "fullscreen"` covers modal + bottom
  sheet + fullscreen form. The **inbox side-panel is NOT a Dialog** — it's feature layout
  (fullscreen route on mobile, panel region on desktop).
- **`Button` has no `highlight` variant** — variants are `primary | secondary | ghost |
  destructive | dashed`, sizes `md | sm`.
- **No Toast / transient-notification primitive** — confirmed out of scope. Feedback routes to
  inline `FieldError` + RAC form summary (validation), navigation back to the calendar (save
  success), an inline confirmation row (actions with no visual home), or `Callout tone="danger"`
  at the top of the form (submit / network error). Transient SR announcements go through
  `announce()` (see conventions §4).
- **`Spinner` + `EmptyState` are P0** (calendar + inbox both have a real first-paint
  empty/loading state); full-page skeletons and dedicated error components are deferred (fog),
  error UI reuses `Callout tone="danger"`.
- **`PersonChip` is display-only in v1** — shows the filer; the other member may be shown but is
  never editable.
- **`Avatar` is monochrome** — ink initial on `--color-accent-surface`, no per-member colour.

### "Closed" affordance

A UI-only display state, never a domain `Day state`. Surfaces on:

| Surface | Treatment |
| --- | --- |
| grid `DayCell` | striped bg + grey dot + generic "closed" line |
| `ListRow` | grey rail + `StatePill` "Closed" + generic narrative |
| `DayDetail` `Dialog` | grey `StatePill` + narrative **with the closure reason** if one was entered |
| `Legend` | 4th dot |
| Settings closure list | the reason verbatim (it edits the `Closure`, not day-state) |

Grid cell + list row keep a **generic** line; only `DayDetail` surfaces the free-text reason.

### P1 — feature-composed (documented lighter in #30, built with their features)

`CalendarGrid`, `DayCell`, `MonthPager`, `MonthPicker`, `Legend`, `ListRow`, `RequestCard`,
`FactList` / `FactRow`, `DateRangeField`, `WeekdayPicker`, `ClosureRow`, `AbsenceImpact`,
`RecurringPreview`.

Screens / flows (`DayDetailSheet`, `AbsenceForm`, `InboxScreen`, `ChildcareSettings`) are
**features, not library components** — excluded from the inventory.

## API & authoring conventions

Confirmed + mechanically pinned in
[iOwn/who-cares#31](https://github.com/iOwn/who-cares/issues/31). This doc pins the patterns +
2–3 worked examples + the checklist below — **not** 22 full prop signatures.

1. **Variants** — `cva` owns **prop-driven** variants only; its config maps variant props to
   **imported CSS-Module class references** (`styles.solid`), never string literals. Interaction
   **state** (`hover` / `pressed` / `focus` / `selected`) is styled in `*.module.css` via
   `&[data-pressed]` / `&[data-focus-visible]` attribute selectors RAC emits — not in `cva`, not
   with render-prop booleans. Canonical resolution:
   `className={cx(styles.base, variants({ tone, size }), typeof className === 'function' ? className(rp) : className)}`
   — RAC's function-form `className` is supported; the caller's value is **always merged last**.
2. **Passthrough & refs** — every component forwards `className` **and** `style` (merged last as
   an escape hatch) and forwards `ref` to its root DOM node.
3. **Focus ring — MANDATORY.** Every interactive primitive renders
   `outline: 2px solid var(--color-focus-ring)` + `outline-offset: 2px`, applied via
   `&[data-focus-visible]` (RAC) or native `:focus-visible` (non-RAC elements). A shared
   `focus-ring` utility class lives in the token `@layer` (`tokens.css` / a `mixins.css`).
   **Hard rule**: no component may set `outline: none` without an equivalent-or-better indicator
   in the same rule. Reviewers reject violations.
4. **Transient announcements — `announce()`**, not a hook. Re-export
   `@react-aria/live-announcer` (transitive via RAC) as `src/ui/announce.ts`:
   `announce(message, politeness = 'polite', timeout?)`. It lazily mounts its own
   visually-hidden live region to `document.body` — no provider, no layout wiring. This is where
   success / error feedback goes (there is no Toast).
5. **Polymorphism** — **no `as` / `asChild` prop** on any component (`asChild` is a Radix
   idiom). Default to concrete semantic elements; compose via RAC's built-in slot / context
   wiring (`DialogTrigger`, `Popover`, …). Sole exception: a button-styled link is a
   `<Link className={buttonStyles}>` **recipe**, not a polymorphic prop.
6. **Controlled vs uncontrolled** — support both; **uncontrolled is the default**
   (`defaultValue` / `defaultSelected`), following RAC's conventions. Controlled via `value` +
   `onChange`.
7. **`'use client'` & barrels** — each `src/ui/<Component>/<Component>.tsx` that imports RAC
   starts with `'use client'`. `src/ui/index.ts` is a **plain re-export barrel with no
   `'use client'` of its own** — the directive rides on each component file. Server Components
   that hit a boundary complaint deep-import `@/ui/<Component>`. `tokens.css` imported once in
   the root layout.
8. **Prop-naming lexicon** (keeps 22 primitives consistent):

   | prop | meaning | values |
   | --- | --- | --- |
   | `tone` | semantic colour intent | `danger \| info \| success \| neutral \| accent` |
   | `variant` | structural style where `tone` doesn't fit | e.g. Button `primary \| secondary \| ghost \| destructive \| dashed` |
   | `size` | `sm \| md \| lg` — **`md` default everywhere** | |
   | `presentation` | **Dialog only** | `sheet \| center \| fullscreen` |
   | booleans | binary state | RAC-style `is*` (`isDisabled`, not `disabled`) for anything RAC also exposes |

   `tone` recolours, `variant` restructures — `Button` has both.
9. **Motion & the press affordance** — CSS transitions only, tokenized (`--dur-*` / `--ease-*`).
   Reduced-motion zeros `--dur-*` globally **and** each component additionally drops `transform`
   / `animation` under `@media (prefers-reduced-motion: reduce)`. Press pattern (shared by
   `Button` + `FAB`, documented once): on `[data-pressed]` / `:active`,
   `transform: translateY(2px)` + step the offset shadow down one.
10. **Responsive** — mobile-first; CSS Module `@media (min-width: …)` against `--bp-*`
    **literals** with a `/* --bp-md */` comment. JS reads `src/ui/breakpoints.ts`. **Container
    queries are sanctioned for `RequestCard` + `ListRow` only** (they render in both the
    fullscreen inbox and the narrower desktop side-panel — parent-driven, not viewport-driven).
    Any new `@container` use needs reviewer sign-off.
11. **Forms boundary** — the library ships **styled field primitives** on RAC (`TextField`,
    `DateField`, `DateRangeField`, …). Validation logic + form-state management belong to each
    feature. No form-state / validation library.

### Worked examples the build doc should include

Three fully-worked components as the pattern reference (the rest follow by analogy):

- **`Button`** — `variant` × `tone` × `size` via `cva` → class refs; the press affordance
  (`[data-pressed]` translateY + shadow step); the mandatory `[data-focus-visible]` ring;
  `className` / `style` / `ref` forwarding.
- **`Callout`** — `tone` recolour; the `icon | dot` / `title` / `children` / `action` /
  `footnote` slot layout; no interaction state.
- **A field primitive** (`TextField` or `DateField`) — controlled + uncontrolled; RAC
  `TextField` / `DatePicker` wiring; `label` / `description` / `errorMessage` / `isRequired` /
  `isDisabled` passthrough; popover portal at `--z-popover`.

### Component Authoring Checklist

A PR adding a `src/ui/` primitive must:

- [ ] forward **and** merge `className` / `style` **last**
- [ ] forward `ref` to the root DOM node
- [ ] render a `[data-focus-visible]` (or `:focus-visible`) ring — **no naked `outline: none`**
- [ ] consume **only** semantic tokens (no primitive tokens, no raw hex / px)
- [ ] gate motion on `prefers-reduced-motion` (drop `transform` / `animation`, not just
      duration)
- [ ] ship a `<Component>.stories.tsx` (P0 mandatory — see [Workbench](#workbench-ladle))
- [ ] follow the `tone` / `variant` / `size` / `is*` lexicon
- [ ] `'use client'` at the top **iff** it imports RAC

## Workbench: Ladle

**`pnpm workbench`** serves it at `localhost:61000`; **`pnpm workbench:build`** produces a static
catalogue in `build/` (gitignored). Config lives in `.ladle/`.

- **Ladle** (Vite-based, CSF, minimal). Chosen over
  Storybook (heavier, its own webpack/vite config surface) for a 22-primitive catalogue.
- Colocated `<Component>.stories.tsx`, default export `{ title: 'Primitives/…' }` or
  `'Composed/…'`.
- **Mandatory for every P0 primitive**, optional for P1.
- **Coverage bar**: one story per `variant`, one per `tone`, all `size`s, a `Disabled` story,
  and a decorator that makes keyboard focus easy to eyeball. **No interaction assertions** in
  stories — that is the component-test tier's job (see [Testing](#testing)).
- **Ladle ↔ Next parity.** Ladle is a Vite app, so two Next-isms are re-supplied in `.ladle/`:
  - *CSS Modules and the `@/*` alias*: nothing to configure. Vite compiles `*.module.css` with
    the same default-export shape Next uses, and Ladle injects `vite-tsconfig-paths`, so
    `tsconfig.json`'s `@/*` resolves in stories exactly as in the app.
    `.ladle/workbench.module.css` exercises both on boot, so a regression here surfaces
    immediately rather than on the first primitive.
  - *`next/font`*: a Next build-time transform that cannot run under Vite.
    `.ladle/config.mjs` `appendToHead` pulls the same two families, same pinned weights, same
    `latin` subset from the Google CDN, and `.ladle/workbench.css` re-declares `--font-nunito` /
    `--font-baloo` so `tokens.css` composes `--font-body` / `--font-display` identically. This
    is the only place in the repo that talks to Google Fonts at runtime, and it is dev tooling
    — never shipped.
- **`.ladle/components.tsx`** exports the `Provider`: the workbench's answer to the root layout.
  It imports `tokens.css` once, supplies the two font properties, and frames each story in a
  wrapper styled purely from semantic tokens — which is why the catalogue is worth booting even
  while it is empty.
- `.ladle/` is a dot-directory, which TypeScript's wildcard includes skip, so `tsconfig.json`
  names `.ladle/**/*.ts{,x}` explicitly. Drop that and `tsc --noEmit` stops seeing the
  workbench.

## Icons

- **`lucide-react`** (a runtime dependency), ~10 icons, tree-shaken.
- **Named imports only** — `import { Bell } from 'lucide-react'`. All three of these pull the
  whole ~1,600-icon barrel into the bundle and are banned:
  - `import * as icons from 'lucide-react'`,
  - a local re-export barrel (`src/ui/icons.ts` that fans out every icon),
  - dynamic icon-by-name (`icons[props.name]`) — an icon prop takes the *component*
    (`icon={Bell}`), never a string.
- Nothing enforces this mechanically: there is no bundle-size ticket and no lint rule, so the
  discipline **is** the mitigation. `optimizePackageImports` covers `react-aria-components`
  only; `lucide-react` does not need it as long as the rule above holds.

## Fonts

- **`next/font/google`**, pinned weights: **Nunito** 400 / 600 / 700 / 800, **Baloo 2** 500 /
  700 / 800. `latin` subset. Explicit fallback stacks:
  - `--font-body: var(--font-nunito), ui-rounded, "Segoe UI", system-ui, sans-serif`
  - `--font-display: var(--font-baloo), var(--font-nunito), ui-rounded, system-ui, sans-serif`
- `next/font` injects `--font-nunito` / `--font-baloo` on `<html>` (the `variable` class pair in
  `src/app/layout.tsx`); `tokens.css` composes the full stacks from them. Both families are
  self-hosted at build time — the browser never requests Google.
- Both are variable fonts, but the weights are pinned as an explicit array anyway, so only the
  seven faces above ship. Adding a weight means editing `layout.tsx` **and**
  `.ladle/config.mjs`'s font URL, or the workbench silently synthesises it. A parity test
  (`src/app/fonts.test.ts`) ensures drift is caught.

## Testing

See **[ADR-0009](./adr/0009-component-tests-are-a-narrow-interaction-contract-tier.md)** and
`docs/testing.md` §5. Scope settled in
[iOwn/who-cares#32](https://github.com/iOwn/who-cares/issues/32).

- **A narrow component-test tier.** **Four primitives only** get automated tests, each asserting
  behaviour *our* wiring of RAC configures or could regress — not RAC internals:

  | Primitive | Assertions |
  | --- | --- |
  | `Dialog` (modal + sheet) | focus moves in on open; Escape closes; focus restores to the trigger; `role="dialog"` + `aria-modal` + labelling wired through our wrapper |
  | `SegmentedControl` | arrow-key roving tabindex; correct role; selection reflects `value` |
  | `DateField` | `minValue` blocks / flags past dates |
  | `DateRangeField` | the 4-week `maxValue` cap blocks selection; end-before-start flagged |

- **Explicitly excluded**: feature-composed / P1 components, pages, any visual / variant /
  snapshot coverage, `axe-core` / `jest-axe` full-tree scans. `ToggleGroup` is **not** tested
  (no P0 v1 instance — `WeekdayPicker` is P1). The a11y line: assert **specific** ARIA wiring by
  hand via locators; an automated audit tool stays post-v1.
- **Stack**: Vitest **browser mode**, Playwright provider, **Chromium only** (already a project
  dep for the E2E smoke, matches ADR-0008). `vitest-browser-react` for `render` + locators
  (not `@testing-library/react` wired into browser mode).
- **File convention**: `*.test.tsx` → the `browser` project; `*.test.ts` → the `node` project.
  The extension **is** the selector — no path allow-list. Component tests colocated at
  `src/ui/<Component>/<Component>.test.tsx`. Pure display logic (e.g. `dayDisplayState()`) stays
  a `.ts` function with a `.test.ts` in the `node` project even when it lives near the UI.
- **CI**: folded into the existing `test` job via a Vitest workspace (`node` + `browser`
  projects, one `vitest run`); the job gains `npx playwright install chromium` (binary already
  cached for `e2e.yml`). CI graph stays at 4 required jobs. A separate `test:browser` job is the
  documented escape hatch.
- **Coverage**: `src/ui/**` carries **no coverage expectation** — it joins "thin adapters" on
  `docs/testing.md` §6's deliberately-not-chased list.

## What the build effort creates

The running ledger. **Done** items are in the tree; the rest is still a to-do.

- **Done (#41)** — the token layer, the fonts, and the workbench:
  - `lucide-react` (runtime) and `@ladle/react` (dev) added; `pnpm-workspace.yaml` `allowBuilds`
    opts `esbuild` + `@swc/core` in (Ladle's toolchain) and `msw` out.
  - `next.config.ts` — `experimental.optimizePackageImports: ['react-aria-components']`,
    merged alongside the existing `agentRules: false`.
  - `src/app/layout.tsx` — `next/font/google` for both families at the pinned weights, their
    `variable` classes on `<html>`, the single `tokens.css` import, and an explicit `viewport`
    export that keeps pinch-zoom available.
  - `src/ui/tokens.css` — promoted from spec form (`@layer tokens`, primitives → semantic →
    dark stubs). The dark stubs stay empty until a dark theme is actually designed.
  - `src/ui/breakpoints.test.ts` — the `tokens.css` ↔ `breakpoints.ts` parity test.
  - `.ladle/` — `config.mjs`, the `Provider` in `components.tsx`, `workbench.css`,
    `workbench.module.css`; `pnpm workbench` / `pnpm workbench:build`.
- **Dependencies still to add**: `react-aria-components`, `react-aria` /
  `@internationalized/date` (as RAC pulls them), `class-variance-authority`, `clsx`; dev:
  `vitest-browser-react`, `@vitest/browser`.
- **`src/ui/mixins.css`** (optional) — the shared `focus-ring` utility if it wants its own file.
- **`src/ui/announce.ts`** — the `@react-aria/live-announcer` re-export.
- **`src/ui/index.ts`** — the plain barrel (no `'use client'`).
- **`src/ui/<Component>/`** — for each of the 22 P0 primitives: `<Component>.tsx`
  (`'use client'` when it imports RAC), `<Component>.module.css`, `<Component>.stories.tsx`,
  `index.ts`. Final prop signatures from the #30 sketches.
- **`src/ui/dayDisplayState.ts` + `.test.ts`** — the presentation-state mapper (pure, `node`
  project).
- **Component tests** — `Dialog`, `SegmentedControl`, `DateField`, `DateRangeField`
  `*.test.tsx` in the `browser` project.
- **`vitest.config.mts`** — gains the `browser` project alongside the existing `node` one.
- **CI**: `test` job gains `npx playwright install chromium` and runs the Vitest workspace.
- **P1 feature-composed components** — built alongside the features that own them, per the #30
  notes.

## Provenance

Assembled from the design-system wayfinder map
([iOwn/who-cares#27](https://github.com/iOwn/who-cares/issues/27)) once every decision ticket
(#28–#32) closed. See the map's Decisions-so-far for the one-line gist + link behind each
choice above.
