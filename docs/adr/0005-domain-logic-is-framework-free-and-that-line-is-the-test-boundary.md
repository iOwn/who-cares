# Domain logic sits in framework-free modules; the import/runtime line is the Vitest/Playwright boundary

While picking the test runner (issue #16), the real decision wasn't *which* runner — Vitest was
settled while charting — but where its boundary with Playwright sits, and how to keep that
boundary from becoming a running judgement call.

**Domain logic is framework-free.** The derived logic that carries this app — day-state
derivation (ADR-0003), the notification recipient matrix, absence → pickup-request generation,
effective-dated childcare-pattern resolution (ADR-0002) — lives in plain TypeScript modules
with **zero `next/*` imports**. Database access sits behind a repository interface, never a
direct call. The advisory home is `src/domain/**`, but the hard rule is the import restriction,
not the path; the build effort finalises the tree.

**That line is the test boundary, and it falls out mechanically.** If a behaviour can be
exercised by importing a function, it is a Vitest test. If it needs a running server or a
browser, it is a Playwright test (scope: ADR-0008). Server actions, route handlers, and the
Vercel Cron handler are thin (~3-line) adapters over a tested domain service — nothing in them
is unit-tested; the Playwright smoke path covers the wiring. We considered an in-Vitest RSC /
App-Router shim (`vitest-environment-nextjs` and similar) and rejected it: if a test appears to
need to render an RSC, that is the signal it belongs in Playwright, not that the runner needs
patching.

**Dependency injection follows from keeping domain code framework-free.** The mailer, push
sender, clock, and repository are passed into domain services as ports; tests inject fakes.
No MSW in v1. In particular the clock is an injected port (`now(): Date`), not fake timers —
the at-risk logic compares `now()` against two 48h thresholds (ADR-0003) and drives no timers
of its own, so an explicit parameter beats `vi.setSystemTime`.

**Consequences**: the Next layer is never unit-tested in-framework; RSC and App-Router coverage
is Playwright-only. A single `environment: 'node'` Vitest config is enough; a jsdom project is
added lazily if a component test is ever written. Component tests have no standing tier in v1 —
non-trivial *pure* display logic is extracted into functions and unit-tested, React components
themselves are left to manual review plus the smoke path. `*.test.ts` files are colocated with
source; Playwright specs live in a top-level `e2e/`.
