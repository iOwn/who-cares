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
| CI | GitHub Actions | `ci.yml` (4 jobs) + `e2e.yml` (preview smoke); `claude.yml` is a mention-triggered assistant, not a gate |
| Dependency updates | Dependabot | grouped weekly, majors separate |
| Commit convention | Conventional Commits | documented in `docs/contributing.md`, **not enforced** |

Net new dev-dependencies for the whole test/tooling layer: `vitest`,
`@vitest/browser-playwright`, `vitest-browser-react`, `playwright` / `@playwright/test`,
`@electric-sql/pglite`, `drizzle-orm`, `drizzle-kit`, `@biomejs/biome`, `lefthook`. No
`eslint`, no `prettier`, no MSW, no commitlint, no Testcontainers.

## Test runner & the Vitest / Playwright boundary

See **[ADR-0005](./adr/0005-domain-logic-is-framework-free-and-that-line-is-the-test-boundary.md)**.

- **Domain logic is framework-free** — plain TypeScript, zero `next/*` imports, DB behind a
  repository interface. Advisory home `src/domain/**`; the hard rule is the import
  restriction, not the path.
- **The boundary is mechanical**: importable → Vitest; needs a server or a browser →
  Playwright. Server actions, route handlers, and the Vercel Cron handler are thin adapters
  over a tested domain service and are not unit-tested — with two deliberate exceptions,
  both of which `vi.mock` the wiring to assert a cross-cutting contract that no domain test
  and no E2E smoke (ADR-0008 never asserts dispatch) can cover:
  `src/app/settings/childcareActions.test.ts` (a closure date range is one action and
  therefore one bundled notification) and `src/app/requestActions.test.ts` (the "Accept all"
  loop is one `dispatchAll`, and a stale id is skipped rather than fatal) — both issue #131,
  ADR-0018. This is not licence to unit-test action *bodies* — the domain behaviour still
  belongs in a pure helper.
- **No RSC-in-Vitest shim.** A test that seems to need to render an RSC belongs in Playwright.
- **Dependency injection first** — mailer, push sender, clock, repository are ports; tests
  inject fakes. `vi.mock` is a fallback only where a seam genuinely cannot take injection.
  **No MSW in v1.**
- **Clock is an injected port** (`now(): Date`), not fake timers. At-risk logic compares
  `now()` against two 48h thresholds (ADR-0003) and drives no timers itself.
- **Config & layout**: a Vitest workspace of two projects — `node` (`environment: 'node'`,
  the bulk) and `browser` (Playwright provider, Chromium) for the narrow component-test tier
  (ADR-0009). Declared via `test.projects` in `vitest.config.mts` (the standalone
  `vitest.workspace.ts` file is deprecated in Vitest ≥3, removed in ≥4). `*.test.ts` →
  `node`, `*.test.tsx` → `browser`; both colocated with source. **The file extension is the
  only selector** — there is no path allow-list, so a `.test.tsx` anywhere under `src/` runs
  in the browser. `pnpm test` (`vitest run`) executes both projects in one pass;
  `pnpm test:node` / `pnpm test:browser` run one at a time. Playwright E2E specs stay in a
  top-level `e2e/`.
- **Browser-mode setup**: the browser project needs a Chromium binary. Run
  **`pnpm test:browser:setup`** (`playwright install chromium`) once after cloning —
  `pnpm test` fails with a Playwright "browser not installed" error until you do. The same
  binary serves the E2E workflow. Packages: `@vitest/browser-playwright` (the `playwright()`
  provider — Vitest ≥5 ships each provider as its own package and pulls `@vitest/browser` in
  transitively, so don't install that one directly), `playwright`, and `vitest-browser-react`
  for `render` + locators. Browser mode is always **headless**, locally as well as in CI —
  `pnpm test` never opens a window.

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
- Replaying the `.sql` files is the only thing that builds a schema — there is no
  `CREATE TABLE` in test setup, and no `db:push` (no diff-and-shove at a live database).
  Two replayers, same files and journal: `src/db/migrate.ts` (`applyMigrations`) into
  in-process PGlite for the tests, and `pnpm db:migrate` (`scripts/db-migrate.mjs`) into a
  live `DATABASE_URL` via the `neon-serverless` driver for deploys. `pnpm db:migrate inspect`
  reports what is pending without applying it.
- **Applied automatically in production** by `.github/workflows/db-migrate.yml` on every push
  to `main`, against the `PRODUCTION_DATABASE_URL` repo secret (issue #98). This runs
  independently of the Vercel production deploy — there's no ordering guarantee between the
  two — which is why migrations stay additive-first and the whole pending batch runs in one
  transaction (`scripts/db-migrate.mjs` rolls back on any failure rather than landing a
  half-migrated schema).

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
   — full matrix, table-driven.** ~15 rows, one per event, asserting `(recipients, bundled
   copy)`. Single non-actor member except the two actor-less events (both-absent,
   48h-silence) which notify both. Plus the **per-action bundling** cases (issue #131,
   ADR-0018): several same-event notifications from one action → one notification; a lone
   one → untouched; two separate actions → two notifications. Split across four files:
   `src/domain/services/notificationRecipients.test.ts` (events 2–8 recipient wiring against
   the services that raise them), `src/notifications/catalogue.test.ts` (all 12 events'
   bundled copy + the actor-less events' "both" rule),
   `src/domain/services/notificationBundling.test.ts` (the pure grouping + copy rules), and
   `src/notifications/notifier.test.ts` (that `dispatchAll` actually applies them).
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
   and [`docs/design-system.md`](./design-system.md). `src/ui/browser-mode.test.tsx` is not
   part of the tier — it is a smoke test for the runner itself (JSX compiles, Chromium boots,
   `render` + locators work), so a failing primitive test can be told apart from a broken
   toolchain.
6. **Coverage is signal, not gate.** CI reports a text summary; no threshold fails the build.
   Domain logic (`src/domain/**`) is expected near-complete; thin adapters and `src/ui/**` are
   deliberately left uncovered. Revisit only if coverage visibly drifts.

## E2E smoke scope

See **[ADR-0008](./adr/0008-e2e-is-one-smoke-path-against-the-vercel-preview-deploy.md)**.

- **One happy path**, Chromium only: magic-link sign-in → parent A declares an absence over a
  near childcare day → pickup request raised → parent B accepts → day renders **Resolved**.
- **Asserts app state only** (day state + assignment / request rows), never notification
  dispatch — and as of issue #139 there is no dispatch to assert: a deploy with the seam armed
  gets the no-op mailer + push sender, so the smoke run cannot post real "Bailey will cover the
  pickup" mail to the `ALLOWED_MEMBER_*_EMAIL` inboxes. See
  [`notifications.md`](./notifications.md#preview-deploys-send-nothing-issue-139).
- **Target**: the Vercel **preview deployment** for the PR — real runtime, real Neon branch,
  real Gmail SMTP (ADR-0015 — auth's `sendMagicLink` is fatal at module load without it, so the
  preview deploy won't boot without real `GMAIL_USER`/`GMAIL_APP_PASSWORD` regardless of whether
  this path exercises a send).
- **Test seam** (`src/app/api/test/`, gate in `src/testing/testMode.ts`): `POST /api/test/seed` (`TRUNCATE` every table + re-insert
  `buildE2eHouseholdGraph(getAllowlistedEmails())` — idempotent, truncate-then-insert each call)
  and `POST /api/test/login` `{ member: "a" | "b" }` (plants a magic-link verification token then
  runs `auth.api.magicLinkVerify`, relaying its `Set-Cookie` to the caller — still the link path
  after issue #157 added the 6-digit code to the same email; the code verify is plugin code and
  stays outside the smoke path). Both call
  `assertTestModeEnabled()` first and return a bare **404** unless `E2E_TEST_MODE` is one of
  `1` / `true` / `on` / `yes`. `e2e/global-setup.ts` calls seed once, then login for each parent,
  saving a `storageState` per parent under `e2e/.auth/` (gitignored).
- **CI trigger**: GitHub Actions (`e2e.yml`) on `deployment_status == success` for the `Preview`
  environment. Not a required check; a failure posts one PR comment, green is silent.
  **Production is never smoke-tested**; `E2E_TEST_MODE` is never set there.
- **Preview prerequisite**: `E2E_TEST_MODE=1` must be set on the Vercel **Preview** environment
  (Project → Settings → Environment Variables, Preview scope only) or every preview deploy
  triggers a failing `e2e.yml` run. `deployment_status` workflows only run from the copy of
  `e2e.yml` on `main`, so the first real end-to-end validation is a follow-up once this lands
  (ADR-0008). `GMAIL_USER`/`GMAIL_APP_PASSWORD` are also a hard prerequisite as of ADR-0015 —
  unlike `E2E_TEST_MODE`, missing them doesn't fail one `e2e.yml` run, it fails the preview
  deploy's own `next build`/boot before E2E ever gets to run.
- **Vercel Authentication bypass** (issue #99): if Deployment Protection / Vercel
  Authentication is on for Preview, the preview URL 401s every request — including the test
  seam — before it reaches the app. `VERCEL_AUTOMATION_BYPASS_SECRET` must then be generated
  in Vercel (Project → Settings → Deployment Protection → Protection Bypass for Automation)
  and stored as a GitHub Actions secret of the same name; `e2e.yml` passes it through as an
  env var, and `e2e/vercel-bypass.ts` turns it into the `x-vercel-protection-bypass` /
  `x-vercel-set-bypass-cookie` headers Playwright sends. Unset, it's a no-op — needed only
  while the Preview environment has that protection enabled.
- **Preview sign-in by hand** (issue #152): a preview has no fixed host, so `src/auth/config.ts`
  hands Better Auth a per-request `baseURL` on `VERCEL_ENV=preview` (`getAuthBaseURL` in
  `src/auth/env.ts` — the deployment's own `VERCEL_URL` / `VERCEL_BRANCH_URL` as
  `allowedHosts`, `BETTER_AUTH_URL` as the fallback). The magic link a preview mails therefore
  points back at that preview, not at production. Passkeys are **not** covered —
  `PASSKEY_RP_ID` / `PASSKEY_ORIGIN` are still the production values, so enrol/sign-in with a
  passkey only works on production; on a preview, use the magic link.

### Driving a protected preview by hand (or as an agent)

Vercel Authentication answers every request with a 302 to vercel.com SSO (pages) or
`401 {"error":{"message":"Protected deployment"}}` (APIs) until the caller is either a
vercel.com session in the browser or carries the bypass secret. A human just signs in to
vercel.com; anything scripted uses the same secret `e2e.yml` does. Keep it in `.env.local`
as `VERCEL_AUTOMATION_BYPASS_SECRET` (gitignored; Project → Settings → Deployment
Protection → Protection Bypass for Automation shows the value).

```sh
PREVIEW=https://who-cares-git-<branch>-florians-projects-3fc478e2.vercel.app   # or the per-deploy URL
BYPASS="x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET"

# 1. (optional) reset to the fixed smoke household — destructive, preview DB only
curl -sS -X POST -H "$BYPASS" "$PREVIEW/api/test/seed"

# 2. mint a session for parent A (or "b"); keep the cookies
curl -sS -X POST -H "$BYPASS" -H "content-type: application/json" \
  -c cookies.txt --data '{"member":"a"}' "$PREVIEW/api/test/login"

# 3. every later request carries both the bypass header and the session cookie
curl -sS -H "$BYPASS" -b cookies.txt "$PREVIEW/settings"
```

Adding `-H "x-vercel-set-bypass-cookie: true"` to the first call makes Vercel also set a
bypass cookie, so a browser-driven session (Playwright, a Chrome tool) only needs the header
once. `/api/test/{seed,login}` are 404 anywhere `E2E_TEST_MODE` isn't set, so this recipe is
preview-only by construction.

### Running `pnpm e2e` locally

Against a **personal Neon dev branch** (never a shared DB — seed is destructive):

1. One-time: `npx playwright install chromium` (or `pnpm test:browser:setup`).
2. Point `.env` at your Neon dev branch and set the full auth env set
   (`DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `ALLOWED_MEMBER_A_EMAIL`,
   `ALLOWED_MEMBER_B_EMAIL` (issue #110; split from one `ALLOWED_MEMBER_EMAILS`),
   `GMAIL_USER`, `GMAIL_APP_PASSWORD` (ADR-0015 — `src/auth/config.ts` now sends
   magic-link mail over Gmail SMTP and fails at module load without these; no
   longer optional the way they are for notifications), `PASSKEY_RP_ID`,
   `PASSKEY_ORIGIN`) **plus `E2E_TEST_MODE=1`**. `POST /api/test/login` signs in via
   `magicLinkVerify`, which creates its own Better Auth user against the domain rows
   `POST /api/test/seed` just inserted directly.
3. `pnpm build && pnpm start` (or `pnpm dev`) in one shell.
4. In another: `PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm e2e`.

With `PLAYWRIGHT_BASE_URL` unset, `pnpm e2e` still lists / type-checks — the spec skips itself
and global setup is a no-op.

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
  3. the E2E `/api/test/seed` route builds its household from the same factories, via the pure
     `buildE2eHouseholdGraph(emails)` in `src/testing/e2eHousehold.ts`.
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
   `vitest run --project node` (node project only, to stay fast; CI runs node + browser +
   coverage) + `node --test` over the `.claude/hooks/` scripts. Same checks CI runs, earlier.
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

`concurrency` with `cancel-in-progress` per ref. A shared pnpm-install/setup (the
`.github/actions/setup` composite action — pnpm + Node-from-`.nvmrc` + frozen install), then
four **parallel** jobs:

| Job | Command | Notes |
| --- | --- | --- |
| `check` | `biome ci` | lint + format + import-sort |
| `typecheck` | `tsc --noEmit` | |
| `test` | `vitest run --coverage` | runs the `node` + `browser` workspace projects in one pass; includes the PGlite integration layer — **no service container**; job also runs `pnpm test:browser:setup` (`playwright install chromium`, binary cached for `e2e.yml`) for the ADR-0009 component tier; coverage → the GitHub step summary. A dedicated `test:browser` job is the escape hatch if browser tests slow this one materially |
| `build` | `next build` | `cp .env.ci .env` first — Next 16 auto-loads `.env` / `.env.production`, never `.env.ci` — then build against the committed transparently-fake values |

- **Node 22**, single version, no matrix. `.nvmrc` is the single source of truth;
  `package.json` `engines` mirrors it.
- **`.env.ci`** is committed with obviously-fake values (`DATABASE_URL=postgres://ci:ci@localhost:5432/ci`,
  dummy auth secret, dummy VAPID keypair). Safe because nothing in it is real and authed
  routes are dynamic (no build-time DB connection); doubles as a local `next build`
  sanity-check env.
- **Caching**: pnpm store (keyed on `pnpm-lock.yaml`, via `actions/setup-node`), `.next/cache`
  (lockfile + source hash), Playwright browsers (keyed on the Playwright version) in both
  `e2e.yml` and the `test` job, which installs Chromium for the `browser` project.

### `e2e.yml` — separate workflow

- Triggered on `deployment_status`; the job is gated on `state == 'success'` and the
  `Preview` environment. The preview URL comes from
  `github.event.deployment_status.environment_url` (the deployed site), falling back to
  `target_url` (the Vercel inspector page), exported as `PLAYWRIGHT_BASE_URL`.
- Runs the one Chromium smoke spec against the preview URL.
- **Posts a PR comment only on failure** (run link + failing step). Green is silent — the
  commit status carries it. The comment resolves the PR from the deployment commit SHA.
- `deployment_status` workflows only run from the copy of the file on the default branch, so
  `e2e.yml` **cannot be exercised from its own PR** — a follow-up validation run against a
  real preview deploy is needed once it lands on `main`.

### `claude.yml` — separate workflow, not a gate

- Triggered by `@claude` in an issue title/body, an issue comment, a PR review, or a PR
  review comment. Runs [`anthropics/claude-code-action@v1`](https://github.com/anthropics/claude-code-action).
- **Only accounts with write access can trigger it.** The action's `allowed_non_write_users`
  input is left unset (default: empty), which is the boundary that matters on a public repo —
  the workflow's `if:` condition is only a cheap pre-filter so an ordinary comment doesn't
  boot a runner.
- Authenticates with the `CLAUDE_CODE_OAUTH_TOKEN` repo secret (a Claude subscription token
  from `claude setup-token`), not an `ANTHROPIC_API_KEY` — so a run draws on the
  subscription's usage instead of adding per-token billing. Actions minutes are free while
  the repo is public.
- Pairs `actions/checkout` with the same `.github/actions/setup` composite every `ci.yml` job
  uses — the runner image has Node but no pnpm, so without it nothing below can run.
- `claude_args` allows only this repo's own checks (`pnpm lint`, `pnpm test:node`,
  `tsc --noEmit`, plus a frozen install). Not `pnpm build` (needs a `.env` that only `ci.yml`
  supplies) and not `pnpm test` (that's both Vitest projects, and the `browser` one needs the
  Playwright Chromium only `ci.yml`'s `test` job installs). The full suite stays CI's job.
- The write-access gate covers who *triggers* a run, not what Claude *reads* during one: a
  mention on a fork's PR feeds attacker-authored content to a job holding `contents: write`.
  Branch protection and the narrow allowlist are the backstops.
- Not a required status check, and unrelated to the four below.

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

- `vitest.config.mts` — the `node` (`environment: 'node'`) and `browser` (Playwright/Chromium)
  projects, declared under `test.projects`. See also `docs/design-system.md` for what
  `src/ui/` adds.
- `src/testing/factories.ts`, `src/testing/seed.ts` — the shared fixture module.
- `src/app/api/test/{seed,login}/route.ts` + `src/testing/testMode.ts` — `E2E_TEST_MODE`-gated
  seam.
- `e2e/` — one Playwright spec + `playwright.config.ts` + global setup.
- `biome.json` — lint + format + import-sort config.
- `lefthook.yml` — the pre-commit / pre-push layers.
- `.claude/settings.json` — the `PostToolUse` (biome) and `PreToolUse` (`--no-verify` deny)
  hook entries. `.claude/hooks/*.mjs` — the scripts they run, with
  `deny-git-hook-bypass.test.mjs` covering the deny logic.
- `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`, `.github/workflows/claude.yml`,
  `.github/dependabot.yml`.
- `.env.ci` — committed fake build-time env.
- `.nvmrc` — `22`.
