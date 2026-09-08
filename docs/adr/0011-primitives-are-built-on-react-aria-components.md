# The `src/ui/` primitives are built on React Aria Components, not Radix or shadcn/ui

Charting the design-system map (issue #27) needed a headless primitive library before the
component inventory (#30) or the API conventions (#31) could be pinned. The candidates were
**React Aria Components** (RAC, Adobe), **Radix Primitives + `react-day-picker`**, and
**shadcn/ui**. Research (issue #28, branch `research/primitive-library`) verified the facts
below against first-party docs, npm manifests, and Bundlephobia on 2026-09-07.

**The date-range picker decides it.** The "I'm out" absence form needs a date range whose end
is hard-capped four weeks from today, fully keyboard- and screen-reader-operable. RAC is the
**only** option with a real headless, SR-tested picker — a segmented `DateField` (each of
month / day / year an independently focusable spinbutton, the WAI-ARIA APG pattern) plus a
`RangeCalendar` that ships localized announcements when the selection or visible range changes.
Radix has **no** date primitive and no plan to add one (a five-year-old open request). Both
Radix and shadcn get their picker from `react-day-picker`, which is an inline calendar grid
only: the accessible trigger, text input, `aria-live` selection announcement, and range-cap
guard are all a from-scratch build — its own docs say so.

**The 4-week cap is one line.** `maxValue={today(getLocalTimeZone()).add({ weeks: 4 })}`
disables out-of-range cells *and* the calendar's next-month paging button at the boundary
(react-stately's `isNextVisibleRangeInvalid()` feeds the `Button slot="next"`).
`minValue={today(...)}` blocks past dates the same way. Values are `@internationalized/date`
objects, not JS `Date` — no timezone foot-guns. The `react-day-picker` equivalent is
`disabled={{ after }}` + `endMonth` + a hand-rolled guard that a dragged range can't overshoot.

**Styling fit is a non-issue — it does not reopen ADR-0010.** RAC exposes interaction state as
data attributes (`data-pressed`, `data-focus-visible`, `data-selected`, …) and a render-prop
`className`; `className` / `style` are plain props. A `.module.css` selecting
`&[data-pressed]` is the intended usage; the `tailwindcss-react-aria-components` plugin is
optional sugar. shadcn/ui was the only candidate that would have forced Tailwind v4 (it themes
through `@theme` + utilities), and it doesn't solve the date-picker problem either — so it was
rejected on both counts.

**RSC posture is a wash.** Every interactive primitive in all three libraries is a client
component; RAC's package depends on `client-only`. An App-Router app wraps interactive UI in
`'use client'` islands regardless of the pick.

**Bundle cost is a tie-breaker, not the tie.** For the ~6 primitives that need RAC: RAC
~80–110 KB gzip (heaviest, date picker ≈ half), Radix + `react-day-picker` ~55–80 KB
(lightest), shadcn ~65–90 KB + Tailwind CSS. ~50 KB gzip spread on a screen two users hit
occasionally. Bundlephobia's 274 KB figure for RAC is a non-tree-shaken full-barrel number.

**Consequences**: `react-aria-components` (pulling `react-aria` / `@internationalized/date`)
joins the dependency list. Mitigate the bundle with
`experimental.optimizePackageImports: ['react-aria-components']` in `next.config.ts` and keep
**every** RAC import inside a `'use client'` file (Next.js #60246). `VisuallyHidden` and
`@react-aria/live-announcer` are re-exported from `src/ui/` rather than reimplemented. The four
primitives whose RAC wiring carries a real interaction / a11y contract — `Dialog`,
`SegmentedControl`, `DateField`, `DateRangeField` — get the narrow component-test tier
(ADR-0009). **Runner-up**: Radix + `react-day-picker`, *only* if the build effort finds RAC's
bundle unacceptable and is willing to own an accessible date-range-picker composition and its
tests.
