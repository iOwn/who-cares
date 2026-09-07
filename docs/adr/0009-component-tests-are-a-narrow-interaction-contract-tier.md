# A narrow component-test tier covers the interaction & a11y contract of a named set of primitives

The design-system effort (issue #27) introduces `src/ui/` — a component library built on React
Aria Components (RAC). ADR-0005 concluded that component tests had "no standing tier in v1":
React components were left to manual review plus the one Playwright smoke path, with only
non-trivial *pure* display logic extracted and unit-tested. A component library changes that
calculus for a small, specific set of primitives.

**A narrow component-test tier now exists.** Four primitives — `Dialog`, `SegmentedControl`,
`DateField`, `DateRangeField` — carry automated tests for their interaction and accessibility
contract: focus trap / Escape / focus-restore on the dialog, roving tabindex and arrow-key nav
on the segmented control, and `minValue` / `maxValue` enforcement (including the four-week
booking cap) on the date fields. These are the primitives where the app's own configuration of
RAC — not RAC's internals — is load-bearing and easy to regress silently in a refactor.

**Everything else stays untested at the component level.** No tests for feature-composed
components, screens, or pages. No visual, variant, or snapshot coverage. No `axe-core` or other
full-tree accessibility scan — the tests hand-assert specific ARIA wiring (`getByRole`,
`aria-modal`, focus location) and nothing broader. An automated a11y audit tool remains a
post-v1 consideration.

**This is consistent with ADR-0005, not an exception to it.** ADR-0005's boundary is mechanical:
importable without a server or browser → Vitest; needs a server or a browser → Playwright.
`src/ui/` primitives import zero `next/*`, so they sit on the Vitest side of that line by the
same rule that sends RSCs to Playwright. The tier is a *narrowing-in* — a named handful of
primitives with a real contract — not a return to broad component testing.

**Stack.** Vitest browser mode with the Playwright provider, Chromium only (matching ADR-0008),
plus `vitest-browser-react` for rendering and locators rather than `@testing-library/react`
wired into browser mode. Test files use the `.test.tsx` extension, which selects the `browser`
Vitest project; `.test.ts` files stay in the `node` project. Component tests are colocated with
their component under `src/ui/<Component>/<Component>.test.tsx`. The browser tests run inside the
existing `test` CI job via a Vitest workspace (`node` + `browser` projects); the job installs
the Chromium binary, already cached for the E2E workflow.

**Consequences.** ADR-0005's consequence sentence "Component tests have no standing tier in v1"
is superseded by this ADR, and `docs/testing.md` point 5 is rewritten accordingly. The `test`
CI job gains a browser dependency and a slightly longer runtime; if that becomes material, a
dedicated `test:browser` job is the fallback. Coverage is unaffected — `src/ui/**` is not chased
for coverage, consistent with `docs/testing.md` point 6. Non-trivial pure display logic (the
calendar-cell → presentation mapping, relative-time formatting) continues to be extracted into
functions and unit-tested in the `node` project.
