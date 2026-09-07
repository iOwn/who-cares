# R-28: Headless primitive library — React Aria Components vs Radix + react-day-picker vs shadcn/ui

Research feeding decision ticket [#28](https://github.com/iOwn/who-cares/issues/28) (primitive
library pick for the WhoCares component library). Parent map:
[#27](https://github.com/iOwn/who-cares/issues/27). Blocks build ticket
[#31](https://github.com/iOwn/who-cares/issues/31).

Compiled 2026-09-07. Facts verified against primary / first-party sources on that date:
react-aria.adobe.com + react-spectrum.adobe.com docs, the `adobe/react-spectrum` repo and
GitHub discussions, `radix-ui` release notes on radix-ui.com, daypicker.dev docs + the npm
registry manifest, ui.shadcn.com docs, nextjs.org docs, and Bundlephobia's size API. Where a
number comes from a maintainer comment rather than a doc it is flagged inline. Versions move
fast — re-check pinned facts before the build effort starts.

**This doc picks a winner.** See §7. The map (#27) owns ratifying it.

Context: WhoCares is a greenfield **Next.js App Router** app on Vercel Hobby, React 19, Biome,
mobile-first PWA, **exactly two users**. Styling tech is *provisionally* **CSS Modules + design
tokens as CSS custom properties** (map #27, "Settled while charting"), explicitly **not
Tailwind**. The one screen with a hard date requirement is **"I'm out"** (absence entry): a
**date range** whose end date is **hard-capped 4 weeks from today**, plus a recurring mode with
a weekday multi-select. ~6 interactive primitives are in the P0 inventory: Dialog/Sheet,
ToggleGroup/SegmentedControl, Popover, Switch/Checkbox, **DateRangePicker**, Menu.

---

## 0. Headline findings

1. **Only React Aria Components (RAC) ships a real headless date-range picker.** Radix has
   **no** calendar or date primitive and no plan to add one — it is a 5-year-old open request
   ([radix-ui/primitives discussion #969](https://github.com/radix-ui/primitives/discussions/969)).
   Both the Radix path and shadcn/ui get their date picker from **`react-day-picker`**, which is
   an **inline calendar grid only**: no text/segmented date field, no popover wiring, no
   selection-announcement live region — the docs say so explicitly and tell you to build those
   yourself ([daypicker.dev input-fields guide](https://daypicker.dev/guides/input-fields),
   [accessibility guide](https://daypicker.dev/guides/accessibility)).

2. **The 4-week end-date cap is a one-liner in RAC and a hand-rolled matcher in the others.**
   RAC `DateRangePicker` takes `minValue` / `maxValue` (`DateValue`), plus `isDateUnavailable`
   and `validate`; `maxValue` both disables out-of-range cells **and** disables the calendar's
   "next" paging button at the boundary (react-stately exposes
   `isNextVisibleRangeInvalid()` / `isPreviousVisibleRangeInvalid()` which the RAC
   `Button slot="next"` consumes). `react-day-picker` needs
   `disabled={{ after: <date> }}` + `endMonth={<date>}` + your own guard that a dragged range
   can't extend past the cap. ([react-aria DateRangePicker](https://react-aria.adobe.com/DateRangePicker),
   [react-spectrum useCalendar](https://react-spectrum.adobe.com/react-aria/useCalendar.html),
   [daypicker.dev navigation](https://daypicker.dev/docs/navigation) +
   [PropsRange](https://daypicker.dev/api/react/interfaces/PropsRange))

3. **RSC posture is a wash.** Every interactive primitive in all three libraries is a client
   component. RAC's package literally depends on `client-only` (v1.21.1 manifest), so the whole
   library is a client boundary. Radix added "full RSC compatibility" + `'use client'`
   directives across all primitives (release notes 2024-06-19, further `'use client'` fixes
   2026-06-06). shadcn copies components with `"use client"` where needed. In an App-Router app
   you wrap interactive UI in `'use client'` islands regardless of which you pick — no
   library makes a leaf server-renderable.

4. **Bundle cost is close enough not to be the deciding factor** — all three land in the
   ~55–110 KB gzip range for the 6 primitives, dominated by the date picker. RAC is the
   heaviest and the hardest to measure (see §4); Radix + `react-day-picker` is the lightest;
   shadcn is Radix + `react-day-picker` + ~10 KB of `cva` / `tailwind-merge` / `clsx`.

5. **shadcn/ui is a poor fit and would force reopening the CSS-Modules decision.** shadcn is
   not a dependency — it is a CLI that copies Tailwind-v4 + `cva` components into your repo,
   themed via `oklch()` CSS variables consumed through Tailwind's `@theme` directive and
   `bg-*` / `text-*` utilities ([ui.shadcn.com theming](https://ui.shadcn.com/docs/theming),
   [components.json](https://ui.shadcn.com/docs/components-json)). Taking shadcn means adopting
   Tailwind v4 as the styling engine. §6 sketches that cost.

6. **RAC styles cleanly with CSS Modules.** State is exposed as **data attributes**
   (`data-selected`, `data-focused`, `data-hovered`, `data-pressed`, `data-disabled`, …) and
   **render-prop `className` functions**; `className` / `style` are plain props; default classes
   follow `react-aria-ComponentName`. The Tailwind plugin
   (`tailwindcss-react-aria-components`) is explicitly **optional** sugar. A
   `.module.css` file selecting `.cell[data-selected]` is exactly the intended usage.
   ([react-aria styling](https://react-aria.adobe.com/styling))

---

## 1. The candidates, precisely

| | React Aria Components | Radix Primitives + react-day-picker | shadcn/ui |
|---|---|---|---|
| What it is | npm dependency: headless components + hooks, Adobe | npm dependencies: `radix-ui` (or `@radix-ui/react-*`) + `react-day-picker` | CLI that copies source into your repo; components are built **on** Radix + `react-day-picker` |
| Vendor / governance | Adobe, `adobe/react-spectrum` monorepo, very active | WorkOS (acquired from Modulz), `radix-ui/primitives`; `react-day-picker` is a solo maintainer (gpbl) | shadcn (Vercel), `shadcn-ui/ui` |
| Date-range picker | **Built in** (`DateRangePicker`, `RangeCalendar`, `DateField`) | Not provided — compose `Popover` + `react-day-picker` `mode="range"` yourself | Recipe in docs — `Popover` + `Calendar` (`react-day-picker`), copied in, you own it |
| Styling model | data-attributes + render props; `className`/`style` props; framework-agnostic | data-attributes (`data-state`, `data-disabled`, …); `asChild`; framework-agnostic. `react-day-picker` = classNames map + CSS vars | **Tailwind v4 + `cva`**, `oklch()` CSS vars via `@theme` |
| Latest version (2026-09-07) | `react-aria-components` 1.21.1 | `radix-ui` 1.6.7 / individual `@radix-ui/react-*` 1.1–2.1; `react-day-picker` 10.0.1 | tracks Radix + rdp; Tailwind v4 |
| React 19 | Yes | Yes (since 2024-06-19) | Yes |

---

## 2. Accessibility

### 2.1 The date-range picker (the deciding capability)

**React Aria Components — `DateRangePicker`.** This is the reason RAC exists in this shortlist.

- **Segmented date field**, not a free-text input: each of month / day / year is an
  independently focusable spinbutton (arrow keys adjust, type to overwrite, `Tab` between
  segments). This is the WAI-ARIA-APG-recommended pattern and is what makes it usable with a
  screen reader without a live-region hack. ([react-aria DateField](https://react-aria.adobe.com/DateField))
- **Calendar grid**: `role="grid"`, full keyboard nav (arrows, `PageUp`/`PageDown` for
  month, `Shift+PageUp/Down` for year, `Home`/`End`), roving tabindex, and **"localized screen
  reader messages are included to announce when the selection and visible date range change"**,
  including touch-screen-reader support. ([react-spectrum RangeCalendar](https://react-spectrum.adobe.com/react-aria/RangeCalendar.html))
- **Range semantics**: after a start date is picked, selection is constrained to contiguous
  available dates until the first unavailable date, unless `allowsNonContiguousRanges`.
- **Constraint props**: `minValue`, `maxValue`, `isDateUnavailable(date) => boolean`,
  `isRequired`, `validate`, `isInvalid`, `validationBehavior="native" | "aria"`. Values are
  `@internationalized/date` objects (`CalendarDate`), not JS `Date` — no timezone foot-guns.
- **Boundary behaviour for the 4-week cap**: set
  `maxValue={today(getLocalTimeZone()).add({ weeks: 4 })}`. Cells past it render disabled;
  react-stately's `isNextVisibleRangeInvalid()` returns true at the boundary and the RAC
  `Button slot="next"` is disabled automatically. `minValue={today(...)}` blocks past dates the
  same way. One extra `validate` or `isDateUnavailable` can enforce "start ≥ today" business
  rules. ([react-aria DateRangePicker](https://react-aria.adobe.com/DateRangePicker),
  [react-spectrum useCalendar](https://react-spectrum.adobe.com/react-aria/useCalendar.html))
- **Form integration**: emits `startName` / `endName` hidden inputs as ISO-8601 strings.

**Radix + `react-day-picker` / shadcn.** `react-day-picker` gives you a good **inline calendar
grid** and no more:

- Provides out of the box: keyboard nav (arrows, `PageUp`/`Down`, `Home`/`End`), focus
  management on interaction, ARIA labelling via the `labels` prop, APG-guided grid semantics.
  ([daypicker.dev accessibility](https://daypicker.dev/guides/accessibility))
- **You must build yourself** (docs are explicit):
  1. the **trigger + popover** wiring (Radix `Popover` — fine, that's a solid primitive);
  2. an **`aria-live` region** to announce the selected range (docs suggest the `footer` prop);
  3. any **text/segmented input** — "DayPicker doesn't come with an input field component";
     there is **no** segmented `DateField` equivalent, examples use a plain
     `<input type="text">` + `date-fns` parsing, and the docs warn "there may be some
     limitations based on your accessibility goals" for the input path;
  4. the **range cap logic** (see §2.3).
- Range-mode props: `min` / `max` = *number of nights* (not calendar bounds), `disabled`
  (Matcher, incl. `{ before, after }` / `{ from, to }`), `excludeDisabled`, `required`,
  `startMonth` / `endMonth` for navigation bounds.
  ([daypicker.dev PropsRange](https://daypicker.dev/api/react/interfaces/PropsRange),
  [selection-modes](https://daypicker.dev/docs/selection-modes))

Net: with Radix/shadcn the "I'm out" date range is a **from-scratch accessible-widget build**
on top of a calendar grid. With RAC it is a themed, pre-solved component. For a 2-person app
where nobody is going to run an axe audit, RAC's "correct by default" is worth a lot.

### 2.2 The other five primitives

All three are strong here and roughly equivalent — these are the well-trodden APG patterns
(dialog focus-trap + `Escape` + scroll-lock, menu/listbox roving tabindex + typeahead, popover
dismiss + focus return, switch/checkbox `role` + labelling).

- **RAC**: `Dialog`/`Modal`, `Menu`, `Popover`, `Switch`, `Checkbox`, `ToggleButtonGroup` —
  one vendor, one interaction model, `@react-aria/*` internals shared across them so behaviour
  is consistent. FocusScope, overlay positioning, and the dismiss/restore-focus logic are
  Adobe-maintained and heavily tested with real ATs.
- **Radix**: `Dialog`, `DropdownMenu`, `Popover`, `Switch`, `Checkbox`, `ToggleGroup` — mature,
  widely deployed, `data-state` attributes, `asChild` composition.
- **shadcn**: the above Radix components, copied into the repo with Tailwind classes baked in.

### 2.3 Hard-capping the range end at "today + 4 weeks"

- **RAC**: `maxValue` prop (+ optional `isDateUnavailable`/`validate`). Disables cells, disables
  the next-month button, blocks keyboard nav past the bound, surfaces validity to the field.
  ~1 line.
- **`react-day-picker`**: `disabled={{ after: cap }}` to grey out cells, `endMonth={cap}` to
  stop month paging, and — because a range drag can still *span* a disabled day —
  `excludeDisabled` and/or an `onSelect` guard that rejects/clamps `range.to > cap`. Also a
  manual `aria-live` update so a SR user hears the clamp. ~15–30 lines + testing.

---

## 3. RSC / `'use client'` posture

| | Detail | Source |
|---|---|---|
| RAC | `react-aria-components` depends on **`client-only`** → importing it in a server component throws. The whole library is a client boundary by design. No `SSRProvider` needed on React 18/19 (that was pre-v1). Next.js App-Router guide: wrap in a `'use client'` `provider.tsx`, and match server/client **locale** (`lang`/`dir` on `<html>`, `I18nProvider`). Reads a CSP `nonce` meta tag automatically. | [npm manifest 1.21.1](https://registry.npmjs.org/react-aria-components/latest), [react-aria frameworks](https://react-aria.adobe.com/frameworks) |
| Radix | "Full RSC compatibility" since 2024-06-19; missing `'use client'` directives patched 2026-06-06. Non-interactive bits (`Slot`) can render server-side; interactive primitives are client. | [radix-ui releases](https://www.radix-ui.com/primitives/docs/overview/releases) |
| `react-day-picker` | Uses hooks → must live in a `'use client'` component. Package doesn't ship the directive; consumer's calendar wrapper carries it. | [npm manifest 10.0.1](https://registry.npmjs.org/react-day-picker/latest) |
| shadcn | Copied components include `"use client"` where needed (e.g. the date-picker recipe). | [ui.shadcn.com date-picker](https://ui.shadcn.com/docs/components/date-picker) |

**Practical upshot:** identical in practice. WhoCares will have a handful of `'use client'`
islands (the "I'm out" form, the toggle group, menus, dialogs) no matter what. Server
components stay server components; you just don't import primitives into them. This is **not** a
differentiator.

One RAC-specific note: because the package is `client-only` and historically tree-shook poorly
under the Next.js bundler (see §4), you want every RAC import inside a `'use client'` file and
`experimental.optimizePackageImports` set — not RAC imported into a shared server module.

---

## 4. Bundle cost (measured)

Method: Bundlephobia size API (min / min+gzip), 2026-09-07, latest versions. **Caveat up
front:** Bundlephobia measures a full package import with no tree-shaking and no dependency
de-duplication across sibling packages, so for RAC and for multi-package Radix it **overstates**
real cost. Maintainer-quoted real numbers and the de-duped meta-package number are used to
bracket reality.

### 4.1 React Aria Components

| Package | min | gzip | note |
|---|---:|---:|---|
| `react-aria-components` @1.21.1 (whole) | 975 KB | 274 KB | **not representative** — full barrel, no tree-shake |
| `@internationalized/date` @3.12.4 | 33 KB | 11 KB | pulled in by any date component |
| `@react-aria/datepicker` @3.17.1 | 99 KB | 30 KB | the datepicker hook stack (Bundlephobia, shared internals not deduped) |

Maintainer / issue-tracker reality:

- Devon Govett (maintainer): a `Button` is **~8.1 KB minified+brotli**; components **share**
  `@react-aria/*` internals so you "only load those once" —
  ["Law of Diminishing Bundle Size Increases"](https://github.com/adobe/react-spectrum/discussions/5636).
- Next.js [issue #60246](https://github.com/vercel/next.js/issues/60246): without `'use client'`
  the Next bundler pulls **~140 KB** of RAC per page even for one `<Button>`; **with**
  `'use client'` it code-splits down to **~40 KB**; a split-out `Menu` chunk is **~30 KB gzip**.
  Next.js has since added packages to `optimizePackageImports` and RAC tree-shakes correctly
  under Vite; the mitigation is real but you must configure it.
- **Realistic estimate for the WhoCares 6 primitives incl. `DateRangePicker`:**
  **~80–110 KB gzip**, of which the date picker (`DateField` + `RangeCalendar` +
  `@internationalized/date`) is roughly half. Heaviest of the three options.

### 4.2 Radix Primitives + react-day-picker

Individual packages (Bundlephobia, min / gzip) — **these double-count shared internals**
(`@radix-ui/react-primitive`, `-context`, `-use-*`, floating-ui):

| Package | min | gzip |
|---|---:|---:|
| `@radix-ui/react-dialog` @1.1.23 | 38 KB | 12.6 KB |
| `@radix-ui/react-popover` @1.1.23 | 65 KB | 22.6 KB |
| `@radix-ui/react-dropdown-menu` @2.1.24 | 89 KB | 29.4 KB |
| `@radix-ui/react-toggle-group` @1.1.19 | 22 KB | 7.7 KB |
| `@radix-ui/react-switch` @1.3.7 | 12 KB | 4.5 KB |
| `@radix-ui/react-checkbox` @1.3.11 | 15 KB | 5.4 KB |

De-dup anchor: the **whole `radix-ui` @1.6.7 meta-package — every primitive — is 249 KB min /
71.7 KB gzip**. So the 5–6 we need, de-duped, land **~30–45 KB gzip**.

Date piece: `react-day-picker` @10.0.1 = **67 KB min / 19.3 KB gzip**; deps `date-fns` @4 +
`@date-fns/tz` (both tree-shakeable; `date-fns` is in Next's default `optimizePackageImports`)
add **~5–15 KB gzip** depending on how many helpers you use. Call it **~25–35 KB gzip**.

**Radix + rdp total: ~55–80 KB gzip.** Lightest option.

### 4.3 shadcn/ui

Runtime deps = **the Radix path** (it *is* Radix + `react-day-picker` copied in) **plus**:

| Package | min | gzip |
|---|---:|---:|
| `class-variance-authority` @0.7.1 | 1.3 KB | 0.7 KB |
| `tailwind-merge` @3.6.0 | 29 KB | 9.0 KB |
| `clsx` | ~0.5 KB | ~0.3 KB |

`cva` is already in the map's API conventions for **all** options, so the only shadcn-specific
JS add is `tailwind-merge` + `clsx` ≈ **~9–10 KB gzip**. Tailwind's utility CSS is a separate
(CSS, not JS) payload — small for a 7-screen app with JIT purging, but non-zero.

**shadcn total: ~65–90 KB gzip JS + Tailwind CSS.** Middle of the pack; not a reason to pick it
and not a reason to reject it.

### 4.4 Verdict on bundle

Spread is ~55 KB (Radix) to ~110 KB (RAC) gzip. For a 2-user PWA on Vercel, **a ~50 KB gzip
delta is not decisive** — it's ~1 extra small chunk, cached after first load, on a screen
(the absence form) users hit occasionally. Accessibility-correctness and build-effort cost
dominate. Bundle is a tie-breaker, not the tie.

---

## 5. Styling fit with CSS Modules + CSS-custom-property tokens

| | Mechanism | CSS-Modules fit |
|---|---|---|
| **RAC** | State as **data attributes** (`data-selected`, `data-focused`, `data-hovered`, `data-pressed`, `data-disabled`, `data-invalid`, `data-focus-visible`, …). `className` and `style` accept **plain strings or render-prop functions** `(state) => string`. Default classes `react-aria-*`. CSS variables exposed where layout needs them (e.g. `--trigger-width` on popovers). Tailwind plugin is **optional**. | **Excellent.** `styles.cell` + `[data-selected]` / `[data-focus-visible]` selectors in a `.module.css`, `className={styles.cell}`, tokens via `var(--color-...)`. Zero runtime, RSC-safe CSS, no build plugin. Exactly the documented non-Tailwind path. |
| **Radix** | State as `data-state="open|closed|checked|…"`, `data-disabled`, `data-side`, etc. `asChild` merges props onto your element. `react-day-picker` = a `classNames`/`modifiersClassNames` map + `--rdp-*` CSS vars. | **Very good.** Same data-attribute story. `react-day-picker` wants a class map object (slightly more wiring than RAC's inline `className`) but is CSS-Modules-friendly and ships unstyled. |
| **shadcn** | **Tailwind v4 utilities baked into copied JSX** + `cva` variants + `oklch()` CSS vars consumed via `@theme` → `bg-background` / `text-foreground` utilities. `tailwind-merge` to dedupe caller overrides. | **Poor** without adopting Tailwind. The components arrive as walls of `className="flex h-9 items-center rounded-md border bg-transparent px-3 …"`. Stripping that to CSS Modules = rewriting every copied component, at which point you're not using shadcn, you're using Radix. |

RAC and Radix both suit the provisional **CSS Modules + tokens-as-custom-properties** decision
with **no change**. shadcn does not.

---

## 6. If shadcn/ui were the pick — what reversing the CSS-Modules decision costs

shadcn is **not recommended** (§7), but per the ticket, here is the reconciliation it would
force:

1. **Adopt Tailwind CSS v4** as the styling engine: add `tailwindcss` + `@tailwindcss/postcss`
   (or the Vite plugin), a `globals.css` with `@import "tailwindcss"` + `@theme`, and wire
   Ladle to load it too. Replaces "zero-runtime CSS Modules, no build plugin" with a
   PostCSS/Tailwind build step. Contradicts map #27's stated rationale for CSS Modules
   ("zero runtime, RSC-native, no build plugin").
2. **Re-express the token layer as Tailwind `@theme` variables.** The two-layer
   primitive→semantic model still works (Tailwind v4 tokens *are* CSS custom properties), but
   they now live in `@theme` blocks and are consumed as generated utilities
   (`bg-surface`, `text-muted`) rather than `var(--color-surface)` in `.module.css`. Every
   component authored against utilities, not scoped classes.
3. **`cn()` helper + `tailwind-merge`** become load-bearing infra (already partly planned via
   `cva`).
4. **Biome**: add Tailwind-class linting/sorting expectations; Biome has a `useSortedClasses`
   assist but it's less mature than `prettier-plugin-tailwindcss`. Minor.
5. **`tw-animate-css`** (shadcn's v4 animation dep) enters the stack; the map's "CSS transitions
   only, tokenized, `prefers-reduced-motion`" motion rule needs re-checking against it.
6. **Ownership model shift**: components are copied source you maintain and re-sync by hand, not
   a versioned dependency. For 6 primitives that's arguably fine, but the date-range picker is
   *still* a from-scratch `react-day-picker` composition (§2.1) — shadcn doesn't solve the one
   hard problem, it just hands you a Tailwind-flavoured starting point.
7. **Dark mode**: shadcn assumes a `.dark` class + duplicated `oklch()` block. Map has dark mode
   out of scope for v1 but "structured as a later redefinition block" — compatible, but it's
   shadcn's structure, not ours.

Rough effort: 0.5–1 day of stack re-plumbing + re-authoring the token doc + threading Tailwind
through Ladle/Next/`next/font`, **plus** you still build the accessible date-range picker
yourself. Net negative versus RAC.

---

## 7. Recommendation: **React Aria Components**

**Pick `react-aria-components`.** Confirms the map's existing lean.

Why:

1. **It solves the one hard, non-negotiable requirement** — an accessible date-range picker
   with keyboard + screen-reader support and a hard `maxValue` cap — as a first-class,
   pre-tested component. The other two options make that a from-scratch accessible-widget build
   on `react-day-picker`, which for a 2-person team with no a11y-audit budget is the wrong risk
   to take.
2. **One vendor, one interaction model** across all 6 primitives, Adobe-maintained, tested with
   real assistive tech, shared internals.
3. **Styles cleanly with CSS Modules + custom-property tokens** via data attributes and
   render-prop `className` — the provisional styling decision (#27) **stands, no change**.
4. **RSC posture is fine** — identical to the alternatives in practice; `'use client'` islands
   either way.
5. **Bundle is the only real knock** (~80–110 KB gzip vs ~55–80 for Radix). Mitigation:
   keep every RAC import in a `'use client'` file and add
   `experimental.optimizePackageImports: ['react-aria-components']` to `next.config`. For this
   app's size and user count the delta is immaterial.

**Runner-up: Radix Primitives + `react-day-picker`.** Choose this only if the build effort
finds RAC's bundle genuinely unacceptable *and* is willing to own an accessible date-range
picker composition (trigger + Radix `Popover` + `react-day-picker` range mode + `aria-live`
announcements + `disabled`/`endMonth` cap logic + its tests). Lightest bundle; excellent
CSS-Modules fit; but it moves the project's hardest UI problem from "configured" to "built and
maintained."

**Not recommended: shadcn/ui.** It doesn't provide the date picker either (same
`react-day-picker` composition), and it forces reopening the CSS-Modules + tokens decision to
adopt Tailwind v4 (§6) for no accessibility gain. Its ownership model and Tailwind theming are
a genuine mismatch with map #27's settled styling direction.

---

## 8. What changes in the map (#27) Notes

**Nothing changes.** The recommendation is React Aria Components, which is the map's existing
lean, so:

- **Primitive library → React Aria Components**: confirmed. The date-range picker for "I'm out"
  was the deciding factor, as predicted.
- **Styling tech → CSS Modules + tokens-as-CSS-custom-properties**: the "*Contingent — see fog
  if the research picks shadcn/ui*" caveat **resolves in favour of keeping CSS Modules**. The
  "Styling-tech reconciliation" item under "Not yet specified" **evaporates** (does not
  graduate).
- **API conventions → `cva` for variants**: unaffected; `cva` is styling-agnostic and used
  regardless.
- Suggested new decision-line for the map's "Decisions so far":
  *"#28 — Primitive library: **React Aria Components** (`react-aria-components`). Only option
  with a real headless accessible date-range picker (`maxValue` caps the "I'm out" end date in
  one line); styles fine with CSS Modules via data-attributes; ~80–110 KB gzip for 6 primitives,
  mitigated with `optimizePackageImports`. CSS-Modules styling decision stands. See
  `docs/research/primitive-library.md`."*

Build-effort follow-ups (not map decisions):

- Add `experimental.optimizePackageImports: ['react-aria-components']` to `next.config`.
- Pin `react-aria-components`, `@internationalized/date` in `package.json`; keep them in lockstep.
- The P1 `DateRangeField` / `WeekdayPicker` inventory items map to RAC `DateRangePicker` +
  `ToggleButtonGroup` (multi-select) respectively.

---

## 9. Sources

Primary / first-party:

- React Aria: [DateRangePicker](https://react-aria.adobe.com/DateRangePicker),
  [DateField](https://react-aria.adobe.com/DateField),
  [Calendar](https://react-aria.adobe.com/Calendar),
  [styling](https://react-aria.adobe.com/styling),
  [frameworks (Next.js/SSR)](https://react-aria.adobe.com/frameworks);
  React Spectrum legacy docs: [RangeCalendar](https://react-spectrum.adobe.com/react-aria/RangeCalendar.html),
  [useCalendar](https://react-spectrum.adobe.com/react-aria/useCalendar.html),
  [SSR](https://react-spectrum.adobe.com/react-aria/ssr.html)
- `react-aria-components` npm manifest: <https://registry.npmjs.org/react-aria-components/latest>
- adobe/react-spectrum: [bundle-size discussion #5636](https://github.com/adobe/react-spectrum/discussions/5636)
- vercel/next.js: [tree-shaking issue #60246](https://github.com/vercel/next.js/issues/60246),
  [optimizePackageImports docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports)
- Radix: [releases / RSC + `radix-ui` package](https://www.radix-ui.com/primitives/docs/overview/releases),
  [DatePicker primitive request #969](https://github.com/radix-ui/primitives/discussions/969)
- react-day-picker: [selection modes](https://daypicker.dev/docs/selection-modes),
  [PropsRange](https://daypicker.dev/api/react/interfaces/PropsRange),
  [navigation](https://daypicker.dev/docs/navigation),
  [accessibility guide](https://daypicker.dev/guides/accessibility),
  [input-fields guide](https://daypicker.dev/guides/input-fields),
  npm manifest <https://registry.npmjs.org/react-day-picker/latest>
- shadcn/ui: [date-picker](https://ui.shadcn.com/docs/components/date-picker),
  [theming](https://ui.shadcn.com/docs/theming),
  [components.json](https://ui.shadcn.com/docs/components-json),
  [Next.js install](https://ui.shadcn.com/docs/installation/next)
- Bundlephobia size API (`bundlephobia.com/api/size?package=…`), 2026-09-07, for every KB
  figure in §4.
