# Testing & tooling

How WhoCares is tested, linted, and gated. This is the dev-setup doc a build agent follows.
The hard-to-reverse picks each have an ADR (linked per section); the rest is settled here.

**Planning-only.** This effort commits no `package.json`, no config files, and no tests.
Every "the build effort creates …" note below is a description, not a file in the tree yet.
The decisions behind all of it are on the wayfinder map
([iOwn/who-cares#15](https://github.com/iOwn/who-cares/issues/15)).

## Toolchain at a glance

| Concern | Choice | Notes |
| --- | --- | --- |
| Unit / integration runner | **Vitest** | `node` + `browser` projects (workspace); `browser` = Playwright/Chromium for the component-test tier (ADR-0009) |
| E2E | **Playwright** | Chromium only, one smoke spec in `e2e/` |
| Integration DB | **PGlite** (`@electric-sql/pglite`) | in-process PG17 WASM; no Docker, no CI service |
| ORM + migrations | **Drizzle** (`drizzle-orm`, `drizzle-kit`) | plain `.sql` migrations on disk, replayed into PGlite ([below](#orm-drizzle)) |
| Lint + format + import-sort | **Biome** (`@biomejs/biome`) | one tool, one `biome.json` |
| Git hooks | **lefthook** | one binary, one `lefthook.yml` |
| Agent lint loop | Claude Code `PostToolUse` hook | `biome check --write` on edited files |
| CI | GitHub Actions | `ci.yml` (4 jobs) + `e2e.yml` (preview smoke) |
| Dependency updates | Dependabot | grouped weekly, majors separate |
| Commit convention | Conventional Commits | documented in `docs/contributing.md`, **not enforced** |

Net new dev-dependencies for the whole test/tooling layer: `vitest`, `@playwright/test`,
`@electric-sql/pglite`, `drizzle-orm`, `drizzle-kit`, `@biomejs/biome`, `lefthook`. No
`eslint`, no `prettier`, no MSW, no commitlint, no Testcontainers.

## Test runner & the Vitest / Playwright boundary

See **[ADR-0005](./adr/0005-domain-logic-is-framework-free-and-that-line-is-the-test-boundary.md)**.

- **Domain logic is framework-free** — plain TypeScript, zero `next/*` imports, DB behind a
  repository interface. Advisory home `src/domain/**`; the hard rule is the import
  restriction, not the path.
- **The boundary is mechanical**: importable → Vitest; needs a server or a browser →
  Playwright. Server actions, route handlers, and the Vercel Cron handler are thin adapters
  over a tested domain service and are not unit-tested.
- **No RSC-in-Vitest shim.** A test that seems to need to render an RSC belongs in Playwright.
- **Dependency injection first** — mailer, push sender, clock, repository are ports; tests
  inject fakes. `vi.mock` is a fallback only where a seam genuinely cannot take injection.
  **No MSW in v1.**
- **Clock is an injected port** (`now(): Date`), not fake timers. At-risk logic compares
  `now()` against two 48h thresholds (ADR-0003) and drives no timers itself.
- **Config & layout**: a Vitest workspace of two projects — `node` (`environment: 'node'`,
  the bulk) and `browser` (Playwright provider, Chromium) for the narrow component-test tier
  (ADR-0009). Declared via `test.projects` in `vitest.config.ts` (the standalone
  `vitest.workspace.ts` file is deprecated in Vitest ≥3, removed in ≥4). `*.test.ts` →
  `node`, `*.test.tsx` → `browser`; both colocated with source. Playwright E2E specs stay in
  a top-level `e2e/`.

## DB-integration approach

See **[ADR-0006](./adr/0006-integration-tests-run-on-in-process-pglite.md)**.

Two layers:

| Layer | Covers | Runs on |
| --- | --- | --- |
| **Domain-logic tests** (the bulk) | day-state (ADR-0003), notification matrix, request generation, pattern resolution (ADR-0002) | pure TS + fake repositories, **no DB** |
| **DB-integration tests** (thinner) | the real repository queries return the right rows; the FK graph | **PGlite**, in-process |

- One fresh `new PGlite()` per test file.
- Schema built by running the **actual migration files** in setup — a broken migration fails
  a test.
- **Not covered on purpose**: no two-concurrent-session write test (ADR-0001 overwrite is a
  plain `UPDATE`); no Neon-branch CI job (the preview-deploy smoke path covers real-Neon
  fidelity).

### ORM: Drizzle

Settled in [issue #38](https://github.com/iOwn/who-cares/issues/38); no ADR, because ADR-0006
already scoped this as a build-effort call that the PGlite decision does not depend on.

**Drizzle** (`drizzle-orm` + `drizzle-kit`), over Prisma, because it fits the harness ADR-0006
describes rather than working around it:

- Migrations are **plain `.sql` files on disk**, so "build the schema by running the actual
  migration files" is literally what happens — `drizzle-orm/pglite/migrator` reads the same
  files a deploy would. Prisma's migration engine wants a live database and a shadow database
  even to diff, which is exactly the Docker-shaped dependency ADR-0006 rejected.
- Anything the schema diff cannot express is a **hand-written migration** in the same folder
  and the same journal (`pnpm db:generate:custom`). That is how the deferred constraint
  triggers land — Prisma would need the same escape hatch, but Prisma's client could not then
  see the result.
- **No codegen step and no separate schema language**: the schema is TypeScript
  (`src/db/schema.ts`), so `tsc --noEmit` covers it and there is no generated client to keep
  in sync, install-time or in CI.
- The runtime is a thin query builder with no engine binary — it stays in-process alongside
  PGlite, and imposes nothing on the framework-free domain layer (ADR-0005): repositories are
  adapters behind the ports, and nothing above them imports Drizzle.

Accepted losses: no Prisma Studio, and no `prisma migrate diff`-grade drift detection — a
migration that contradicts `schema.ts` is caught by the integration tests failing, not by a
dedicated drift check.

### Migration convention

- Files live in `src/db/migrations/` as `NNNN_snake_case_name.sql`, ordered by
  `migrations/meta/_journal.json`. Both are written by `drizzle-kit`, never by hand:
  `pnpm db:generate --name <name>` for a schema diff, `pnpm db:generate:custom --name <name>`
  for triggers, functions, and backfills.
- Statements within a file are separated by `--> statement-breakpoint`.
- Migrations are **append-only** — Drizzle records each file's hash, so editing an applied
  file corrupts the history.
- `src/db/migrate.ts` (`applyMigrations`) is the only thing that builds a schema. There is no
  `CREATE TABLE` in test setup, and no `db:push` script pointing at a live database.

### The harness in practice

```ts
const db = await createTestDatabase(); // fresh PGlite + every migration applied
afterAll(() => closeTestDatabase(db));
beforeEach(() => truncateAll(db));
```

`createTestDatabase()` lives in `src/testing/database.ts`; `seed(db, graph)` in
`src/testing/seed.ts` does raw `INSERT`s through `db.$client` and returns a `SeedReport` whose
`skipped` list names the `HouseholdGraph` entity kinds that have no table yet. A test pins that
list, so the migration that adds a table cannot land without extending `seed()`.

## What deserves a test

From [issue #22](https://github.com/iOwn/who-cares/issues/22). No ADR — this is strategy, not
architecture. Through-line: **exhaustive where the logic is derived and load-bearing,
targeted elsewhere, and a narrow component tier only where our React Aria wiring carries a
real interaction / a11y contract (ADR-0009).**

1. **Derived day-state (ADR-0003) — exhaustive, table-driven.** A pure function over fake
   data. Input space:
   `{is childcare day: pattern-version × closure} × {assignment: none / assignee-not-absent / assignee-absent} × {open-request age vs each 48h threshold} × {0,1,2 members absent that day}`.
   Every named state (Resolved / Pending / At-risk / n/a) reachable by ≥1 row; both 48h
   thresholds isolated in their own cases; the "assignee later records their own absence"
   re-flag explicitly covered; `now()` supplied per case via the injected clock.
2. **Notification recipient matrix ([issue #5](https://github.com/iOwn/who-cares/issues/5))
   — full matrix, table-driven.** ~15 rows, one per event, asserting `(recipients,
   coalescable?)`. Single non-actor member except the two actor-less events (both-absent,
   48h-silence) which notify both. Plus coalescing-window cases: two edits to the same record
   inside 5 min → one notification; different records → independent windows; an edit after
   the window → a second notification.
3. **Effective-dated pattern derivation (ADR-0002) — targeted, ~5–8 cases.** Fold into the
   same "is childcare day" helper case 1 needs. Pin: a date resolves against the version in
   effect *then*; adding a newer version leaves past derivation unchanged; boundary date ==
   `effectiveFrom`; a closure removing a day the pattern would include.
4. **Absence → pickup-request generation, and the Recurring-mode generator — unit-test both
   directly** over fake repos, table-driven. Request generation: single-absent on unassigned
   childcare day → request; both-absent → no request; absent on already-assigned day → no
   request; absent on non-childcare day / closure → nothing; one bundled digest per
   absence-creation action. Recurring generator: idempotent re-run skips covered days; end
   date hard-capped at 4 weeks from today.
5. **A narrow component-test tier.** Vitest **browser mode** (Playwright provider, Chromium) +
   `vitest-browser-react`, covering the interaction / a11y contract of four primitives only —
   `Dialog` (focus trap, Escape, focus restore), `SegmentedControl` (roving tabindex),
   `DateField` / `DateRangeField` (min/max + the 4-week cap). No tests for feature-composed
   components or pages; no visual, variant, or snapshot coverage; no `axe-core`. Non-trivial
   **pure** display logic (rolling-window date math, calendar-cell → presentation mapping,
   relative-time formatting) is still extracted into pure functions and unit-tested in the
   `node` project. See **[ADR-0009](./adr/0009-component-tests-are-a-narrow-interaction-contract-tier.md)**
   and [`docs/design-system.md`](./design-system.md).
6. **Coverage is signal, not gate.** CI reports a text summary; no threshold fails the build.
   Domain logic (`src/domain/**`) is expected near-complete; thin adapters and `src/ui/**` are
   deliberately left uncovered. Revisit only if coverage visibly drifts.

## E2E smoke scope

See **[ADR-0008](./adr/0008-e2e-is-one-smoke-path-against-the-vercel-preview-deploy.md)**.

- **One happy path**, Chromium only: magic-link sign-in → parent A declares an absence over a
  near childcare day → pickup request raised → parent B accepts → day renders **Resolved**.
- **Asserts app state only** (day state + assignment / request rows), never notification
  dispatch.
- **Target**: the Vercel **preview deployment** for the PR — real runtime, real Neon branch,
  real Resend.
- **Test seam**: `POST /api/test/seed` (wipe + insert the fixture) and `POST /api/test/login`
  (mint a Better Auth session), mounted only when `E2E_TEST_MODE` is set. Called from
  Playwright global setup.
- **CI trigger**: GitHub Actions on `deployment_status == success` for the preview.
  **Production is never smoke-tested**; `E2E_TEST_MODE` is never set there.
- **Local**: opt-in `pnpm e2e` against a personal Neon dev branch;
  `npx playwright install chromium` is the one-time setup.

## Test data / fixtures

From [issue #26](https://github.com/iOwn/who-cares/issues/26). No ADR — test infrastructure.

- **Typed factory functions** with defaults + shallow `Partial` overrides, one per entity
  (`makeHousehold`, `makeMember`, `makeChild`, `makeClosure`, `makeAbsence`,
  `makePickupRequest`, `makeAssignment`), returning **plain domain objects**. No fluent
  builder, no `@faker-js`, no random.
- **One shared module**, `src/testing/`, imported by all three consumers:
  1. domain-logic tests use the objects directly against fake repos;
  2. the PGlite layer persists them via a `seed(db, graph)` helper that does **raw `INSERT`s**
     against the migration-defined schema — *not* through the repository interfaces (those
     are the code under test);
  3. the E2E `/api/test/seed` route builds its household from the same factories.
- **Determinism**: fixed sentinel IDs (`household-1`, `m1` / `m2`, `child-1`), a fixed anchor
  date the factories default relative to, a counter-based ID generator for bulk rows. "Today"
  is always explicit per test via the injected clock.
- **One preset**: `makeTypicalHousehold()` — 2 members, 1 child, a Mon–Fri pattern effective
  from the anchor, zero closures / absences / assignments. Scenario-specific setup stays
  inline in the test that needs it; there is no library of scenario presets.
- **Fiddly bits**:
  - `pattern([...weekdays])` defaults `effectiveFrom` to the anchor; `pattern.versions([{ weekdays, effectiveFrom }, …])`
    for the multi-version case, with strictly-ascending `effectiveFrom` asserted. No string
    mini-language.
  - `absence({ from, to })` (inclusive ISO dates) **or** `absence({ from, days })` (duration
    shorthand; `days: 1` = single day); normalised internally to `startDate` / `endDate`.
- **Calendar dates**: fixtures take `'YYYY-MM-DD'` strings at the call boundary. The domain's
  **internal** calendar-date type (`string` vs `Date`-at-UTC-midnight vs Temporal
  `PlainDate`) is deliberately left to the build effort — only the factory internals convert.
- **E2E seed payload**: `makeTypicalHousehold()` with the two configured test-account emails
  injected; no absences, no assignments (the test creates the absence). The route is
  idempotent — truncate-all-then-insert each run, `E2E_TEST_MODE`-gated.

## Lint / format

See **[ADR-0007](./adr/0007-biome-all-in-for-lint-format-and-import-sorting.md)**.

- **One dev-dependency** (`@biomejs/biome`), **one config** (`biome.json`) covering lint +
  formatter + import organizer.
- **Rule sets**: Biome `recommended` (includes `a11y`) + the `next` and `react` domains.
- **Editor**: the official `biomejs.biome` VS Code extension as `editor.defaultFormatter`,
  format-on-save.
- **CI**: a single `biome ci` step (standalone binary, no writes).
- **Accepted losses**: `no-html-link-for-pages` (moderate — mitigated by review +
  `typedRoutes`), `no-css-tags` / `no-page-custom-font` (minor), no React-Compiler lint rules
  (not a v1 concern).
- **Tailwind note**: if adopted, Biome can't stably sort classes (`useSortedClasses` is
  nursery) — a small contained follow-up then, not a reason to add Prettier.

## Local guardrails

From [issue #23](https://github.com/iOwn/who-cares/issues/23). No ADR. Five layers,
earliest → last:

1. **Claude Code `PostToolUse` hook** (`.claude/settings.json`, agent-facing) — matches
   `Edit|Write|MultiEdit`, runs `biome check --write` on the touched files. Auto-fixes land
   immediately; non-auto-fixable lint violations exit non-zero so the agent fixes its own
   lint before continuing.
2. **lefthook pre-commit** (any committer) — `biome check --write --staged`, staged files
   only, re-stages fixes. Sub-second. Nothing else on pre-commit.
3. **lefthook pre-push** (optional, documented as safe to delete) — `tsc --noEmit` +
   `vitest run` + `node --test` over the `.claude/hooks/` scripts. Same checks CI runs,
   earlier.
4. **commit-msg** — none.
5. **CI** — the actual gate, non-bypassable (see next section).

**Hook manager: lefthook.** One Go binary, one `lefthook.yml`, no Node dependency tree.
`package.json` gets `prepare: lefthook install` so hooks wire on clone. Rejected: husky +
lint-staged, simple-git-hooks.

**Bypass story**:

- **Humans**: `git commit --no-verify` / `git push --no-verify` is fine in a hurry — CI
  re-checks everything. `LEFTHOOK=0` disables in bulk.
- **Agents**: **must not** use `--no-verify` — fix-or-report on a hook failure (CLAUDE.md
  rule). A `.claude/settings.json` `PreToolUse` hook on `Bash` denies commands that carry
  `--no-verify` / `-n` (including combined short clusters like `-nm`) or a `LEFTHOOK=0`
  prefix on `git commit` / `git push`, so the rule is enforced, not merely trusted. The
  hook's flag detection is scoped to the `git commit` / `git push` segment, so an unrelated
  `-n` elsewhere in a compound command (`find . -name … && git commit …`) is not a false
  positive. Covered by `.claude/hooks/deny-git-hook-bypass.test.mjs`.

## CI pipeline shape

From [issue #24](https://github.com/iOwn/who-cares/issues/24). No ADR — pipeline mechanics.

### `ci.yml` — on `pull_request` and `push` to `main`

`concurrency` with `cancel-in-progress` per ref. A shared pnpm-install/setup, then four
**parallel** jobs:

| Job | Command | Notes |
| --- | --- | --- |
| `check` | `biome ci` | lint + format + import-sort |
| `typecheck` | `tsc --noEmit` | |
| `test` | `vitest run --coverage` | runs the `node` + `browser` workspace projects in one pass; includes the PGlite integration layer — **no service container**; job also runs `npx playwright install chromium` (binary cached for `e2e.yml`) for the ADR-0009 component tier; coverage → the GitHub step summary. A dedicated `test:browser` job is the escape hatch if browser tests slow this one materially |
| `build` | `next build` | loads a committed `.env.ci` of transparently-fake values |

- **Node 22**, single version, no matrix. `.nvmrc` is the single source of truth;
  `package.json` `engines` mirrors it.
- **`.env.ci`** is committed with obviously-fake values (`DATABASE_URL=postgres://ci:ci@localhost:5432/ci`,
  dummy auth secret, dummy VAPID keypair). Safe because nothing in it is real and authed
  routes are dynamic (no build-time DB connection); doubles as a local `next build`
  sanity-check env.
- **Caching**: pnpm store (keyed on `pnpm-lock.yaml`), `.next/cache` (lockfile + source hash),
  Playwright browsers (Playwright version) in `e2e.yml`.

### `e2e.yml` — separate workflow

- Triggered on `deployment_status == success` for the **preview** deployment.
- Runs the one Chromium smoke spec against the preview URL.
- **Posts a PR comment only on failure** (run link + failing step). Green is silent — the
  commit status carries it.

### CI ↔ Vercel

**Independent.** Vercel auto-deploys the preview immediately on push (the E2E job needs it up
fast); CI runs in parallel. No "wait for checks" coupling. Production only ships on merge to
`main`, gated by branch protection.

### Required status checks for `main`

`check`, `typecheck`, `test`, `build` — all four required. **E2E smoke is not a required
check** for v1: it runs post-deploy, asynchronously, against the preview rather than the PR
head commit. E2E failure is a signal (the PR comment + the Actions tab), not a merge blocker.
Revisit once the smoke path proves stable.

### Dependency freshness

**Dependabot** (`.github/dependabot.yml`) — one grouped weekly PR for non-major updates,
majors as separate PRs, security updates on. Rides the same CI gates, so a bad bump can't
self-merge. Chosen over Renovate (more config) and manual bumping (rots between sessions).

## What the build effort creates

None of this is committed in the planning effort. When the build starts:

- `vitest.config.ts` — the `node` (`environment: 'node'`) and `browser` (Playwright/Chromium)
  projects, declared under `test.projects`. See also `docs/design-system.md` for what
  `src/ui/` adds.
- `src/testing/factories.ts`, `src/testing/seed.ts` — the shared fixture module.
- `app/api/test/login/route.ts`, `app/api/test/seed/route.ts` — `E2E_TEST_MODE`-gated seam.
- `e2e/` — one Playwright spec + `playwright.config.ts` + global setup.
- `biome.json` — lint + format + import-sort config.
- `lefthook.yml` — the pre-commit / pre-push layers.
- `.claude/settings.json` — the `PostToolUse` (biome) and `PreToolUse` (`--no-verify` deny)
  hook entries. `.claude/hooks/*.mjs` — the scripts they run, with
  `deny-git-hook-bypass.test.mjs` covering the deny logic.
- `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`, `.github/dependabot.yml`.
- `.env.ci` — committed fake build-time env.
- `.nvmrc` — `22`.
