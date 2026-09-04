# R-DB: DB-integration test strategy options

Research feeding the DB-integration test strategy decision on the test & tooling map
([#15](https://github.com/iOwn/who-cares/issues/15)). Question source:
[#17](https://github.com/iOwn/who-cares/issues/17). This is a **facts-gathering** ticket —
it lays out each option with its real tradeoffs and current status; it does **not** pick a
winner (that is the next ticket).

Compiled 2026-09-04. Figures verified against primary/first-party sources (Neon docs,
PGlite docs + repo, Testcontainers docs, GitHub Actions docs, Vitest docs, PostgreSQL
manual) on that date, cited inline. Free tiers and WASM builds move fast — re-check before
committing.

---

## Scope / constraints assumed for WhoCares

- **Stack is pinned** (ADR-0004): Next.js App Router on Vercel Hobby, **Neon** Postgres,
  Resend, Better Auth, once-daily Vercel Cron. ORM is not yet chosen but is "likely Drizzle
  or Prisma" (#17).
- **Minimal-toolchain bias** (map standing preference): fewest dev-deps, fewest config
  files, least version churn to babysit on a hobby app touched intermittently. Tie-breaker
  when a choice is close.
- **Vitest** is the confirmed unit/integration runner; **Playwright** owns E2E (thin smoke
  path only). The open question is the runner/E2E boundary, not the runner.
- **CI is GitHub Actions.** Free tier for a private repo: Linux minutes are metered
  (2,000/mo on Free), so wall-clock per run matters a little but is not a hard wall.
- **What actually needs DB-integration testing** (map Notes): the derived **day-state
  logic** (Resolved / Pending / At-risk / n/a, computed live per ADR-0003) and the
  **12-event notification recipient matrix**. Both are read-model / query-shaped logic over
  a schema with effective-dated rows (ADR-0002), derived state (never cached), and the
  usual FK graph (household → member/child → pattern/closure/absence → pickup request →
  assignment).
- Schema is **small** and uses **no exotic Postgres** — no PostGIS, no `pg_cron` (cron is
  Vercel-side), no logical replication, no custom C extensions. Plausibly `citext` or a
  `CHECK`/exclusion constraint or two; date math; maybe a materialized/derived view.

---

## The option landscape at a glance

| Option | Where Postgres runs | Per-test isolation | First-run cost in CI | Fidelity to Neon prod | Main catch |
|---|---|---|---|---|---|
| **A. PGlite** | In-process WASM, same Node as Vitest | New in-memory instance per file/test (cheap) | ~0 (npm dep only) | WASM build of PG 17, single-user; **not** the Neon server | Feature gaps vs server Postgres; not the real engine |
| **B. Neon branch-per-run** | Neon cloud (real prod engine) | One ephemeral branch per CI run (or per PR) | API round-trips + compute cold start (seconds) | **Highest** — literally Neon | Network in tests; free-tier branch/compute/egress budget; hard to run offline/local |
| **C. Testcontainers** | Docker container on the runner | Fresh container per suite; or rollback/template inside | Image pull + container boot (seconds–tens of seconds first run) | Real Postgres, your chosen major version; not Neon-specific | Needs Docker (fine on GitHub-hosted Linux; friction locally on some setups) |
| **D. GH Actions `services:` Postgres** | Service container alongside the job | Must add your own: txn rollback / template DB / schema-per-worker | Image pull, once per job (seconds) | Real Postgres, your version | Isolation is your problem; one shared instance for the whole job |
| **E. Local/service Postgres + txn rollback** | Any of C/D, or a local install | Wrap each test in a transaction, `ROLLBACK` after | Same as C or D | Real Postgres | Rollback semantics leak (see §E); can't test code that manages its own transactions |
| **F. Template-DB cloning** (pgtestdb / IntegreSQL pattern) | Any real Postgres (C/D/local) | `CREATE DATABASE ... TEMPLATE` per test — ~10–40 ms | Same as C or D + ~500 ms one-time template build | Real Postgres | Needs admin rights on a test-only server; extra helper lib or script |

A/B are "which Postgres". C/D are "how to get a real Postgres in CI". E/F are **isolation
strategies** that layer on top of C, D, or a local instance — they are not mutually
exclusive with them.

---

## A. PGlite (in-process WASM Postgres)

**What it is.** `@electric-sql/pglite` is a build of real PostgreSQL compiled to
WebAssembly and packaged as a TS/JS library — "run Postgres in the browser, Node.js and
Bun, with no need to install any other dependencies", "under 3 MB Gzipped". It does **not**
use a Linux VM; it is "simply Postgres in WASM".
([pglite.dev/docs/about](https://pglite.dev/docs/about))

**Current status (2026-09).**
- Tracks **PostgreSQL 17** — the real query planner, type system, and functions, compiled
  to WASM. ([electric.ax — PGlite v0.4 announcement, 2026-03-25](https://electric.ax/blog/2026/03/25/announcing-pglite-v04);
  corroborated by multiple 2026 write-ups)
- **v0.4** (March 2026) decoupled `initdb` into its own WASM process, added **PostGIS**,
  and — most relevant here — added **connection multiplexing** so "tools expecting multiple
  connections" work over PGlite's single underlying connection.
  ([electric.ax — v0.4](https://electric.ax/blog/2026/03/25/announcing-pglite-v04))
- Adoption is now large: ~13M weekly downloads across packages; **Prisma bundles PGlite in
  its CLI** for local dev. ([electric.ax — v0.4](https://electric.ax/blog/2026/03/25/announcing-pglite-v04))
- Drizzle ships a first-party `drizzle-orm/pglite` driver and a "Get started with Drizzle
  and PGlite" guide. ([orm.drizzle.team/docs/connect-pglite](https://orm.drizzle.team/docs/connect-pglite))

**Why it fits the testing use case.** PGlite's own docs pitch testing as a primary use
case: *"PGlite is very fast to start and tear down. It's perfect for unit tests — you can
have a unique fresh Postgres for each test."* In-memory mode means no disk, no daemon, no
Docker; a `new PGlite()` per test file (or per test) is the isolation mechanism, and it
composes cleanly with Vitest file-level parallelism and watch mode.
([pglite.dev/docs/about](https://pglite.dev/docs/about))

**The catch — it is not the Neon server, and not 100% of server Postgres:**
- **Single-user mode.** PGlite runs Postgres's single-user bootstrap mode because
  Emscripten binaries can't `fork()`. Pre-v0.4 this meant literally one client connection
  ("too many clients" on a second connect); v0.4 multiplexing hides that from most tools,
  but it is still one backend process underneath — **no true connection concurrency**, so
  it cannot exercise lock contention, `SELECT ... FOR UPDATE` races between sessions,
  serialization failures, or `pg_stat_activity`-style behaviour.
  ([pglite.dev/docs/about](https://pglite.dev/docs/about);
  [electric.ax — v0.4](https://electric.ax/blog/2026/03/25/announcing-pglite-v04))
- **No server features:** no listening on a port, no `psql` wire access by default (there
  is an optional `pglite-socket` shim), no logical/streaming replication, no hot standby,
  no background workers / `pg_cron`.
  ([pglite.dev/docs/about](https://pglite.dev/docs/about); pglite repo README)
- **Extensions must be pre-bundled** at build time — you cannot `CREATE EXTENSION` an
  arbitrary extension at runtime. Bundled/available today include `pgvector`, PostGIS,
  `pgcrypto`, `pg_uuidv7`, `pgTAP`, `pg_hashids`, `citext` and the common `contrib` set;
  the community-extension list is curated, not "all of PGXN".
  ([pglite.dev/extensions](https://pglite.dev/extensions/);
  [electric.ax — v0.4](https://electric.ax/blog/2026/03/25/announcing-pglite-v04))
- **PL/pgSQL is supported** (it is built in), as are triggers and full-text search
  (`tsvector`/`tsquery`). ([pglite repo README](https://github.com/electric-sql/pglite))
- **`LISTEN`/`NOTIFY`** works only within the single connection context — cross-session
  notification is not meaningful given single-user mode.
- Neon-specific surface (the `neon` serverless driver's HTTP/WebSocket transport, Neon's
  connection pooler, scale-to-zero cold starts, branch semantics) is **not** modelled at
  all — PGlite tests the SQL, not the Neon platform.

**Migration compatibility.** Because it is real PG 17 SQL, Drizzle-kit / Prisma Migrate
SQL generally applies unchanged; the failure mode is a migration that uses an extension or
server feature PGlite doesn't bundle. Prisma bundling PGlite in its own CLI is a strong
signal that mainstream migration SQL round-trips.

**Net.** Lowest-friction, fastest, zero-infra option; the price is that a green PGlite
suite is not proof the same SQL behaves identically on Neon, and it structurally cannot
test anything involving multiple concurrent database sessions.

---

## B. Neon ephemeral branch-per-test-run

**What it is.** Neon branching is copy-on-write: a branch is an instant clone of a parent
branch's data at a point in time; "writes to a branch are saved as a delta" and "creating a
branch does not increase load on the parent branch or affect it in any way".
([neon.com/docs/introduction/branching](https://neon.com/docs/introduction/branching))
The CI pattern: create a throwaway branch at the start of a run (or per PR), point the test
DB URL at it, run migrations + tests, delete the branch at the end.
([neon.com/docs/guides/branching-test-queries](https://neon.com/docs/guides/branching-test-queries))

**Tooling.** First-party GitHub Actions:
- `neondatabase/create-branch-action` — inputs `project_id`, `api_key`, optional
  `branch_name`, `parent_branch`, `database`, `role`, `expires_at`, `suspend_timeout`;
  outputs `db_url`, `db_url_pooled`, `branch_id`, `db_host`, `password`, and `created`
  (bool: newly created vs reused).
  ([github.com/neondatabase/create-branch-action](https://github.com/neondatabase/create-branch-action))
- `neondatabase/delete-branch-action` — cleanup, typically wired to PR `closed`.
  ([neon.com/docs/guides/branching-github-actions](https://neon.com/docs/guides/branching-github-actions))
- Same operations available via `neonctl` CLI (`neon branches create` /
  `neon branches delete`) and the REST API with a `NEON_API_KEY`.
  ([neon.com/docs/guides/branching-test-queries](https://neon.com/docs/guides/branching-test-queries))

**Free-plan budget (the real constraint).** Per project, Free plan
([neon.com/docs/introduction/plans](https://neon.com/docs/introduction/plans);
[neon.com/faqs/free-plan-limits-and-quotas](https://neon.com/faqs/free-plan-limits-and-quotas)):

| Quota | Free plan value |
|---|---|
| Branches | **10 per project** (creation fails at the 11th until you delete/upgrade) |
| Compute | **100 CU-hours / project / month**; autoscale up to 2 CU (~8 GB RAM) |
| Scale-to-zero | after **5 min** idle, **cannot be disabled** on Free |
| Storage | 0.5 GB / project |
| Public network transfer (egress) | **5 GB / project / month** |
| Projects | 100 |

Notes and gotchas:
- The "10 branches" figure is current (Jan 2026 pricing change). Some cached third-party
  pages still say "5 active branches" — the first-party plans/FAQ pages say 10.
- Branch creation is advertised as "instant" / seconds; **there is no published latency
  SLA**. In practice a `create-branch-action` step is a few seconds of API work, plus a
  **compute cold start** (scale-to-zero) the first time the branch's endpoint is hit.
- Each branch you actually query needs a **compute endpoint**, and every second it is
  awake burns the shared **100 CU-hour** pool. A branch-per-run at, say, 30 CI runs/day ×
  ~1–2 min awake × 0.25 CU is well inside budget; a branch-per-*test* with many parallel
  Vitest workers each waking a compute is not the intended shape and can blow CU-hours and
  the 10-branch cap. Neon's own guidance: keep dev/test branch computes pinned small
  (e.g. 0.25 CU). ([neon.com/blog/how-to-make-the-most-of-neons-free-plan](https://neon.com/blog/how-to-make-the-most-of-neons-free-plan))
- Neon does not publicly document a hard "max concurrently active computes" number for
  Free — treat "10 branches + a small CU-hour pool" as the effective ceiling.
- **`expires_at`** on the create action gives branches a TTL so a failed/cancelled job
  doesn't leak a branch forever.

**Fidelity.** Highest of all options — the test runs against the exact engine, extensions,
pooler, and quirks (including scale-to-zero cold-start latency and the Neon serverless
driver path) that production uses. This is the only option that can catch a
"works locally, breaks on Neon" problem before deploy.

**Downsides.**
- **Tests now need the network and a secret.** Slower and flakier than in-process; a Neon
  incident or a rate-limit breaks CI. Local `vitest` runs need their own branch or a
  fallback DB, so contributors need a Neon key or a second strategy anyway.
- **Not obviously the right tool for hundreds of fast unit-ish integration tests** — it
  shines for a small, high-value suite (migration smoke, a few end-to-end query checks)
  and for PR preview environments, less so as the everyday inner loop.
- Free-tier branch limit means **serialising CI** (one run's branch at a time) or careful
  cleanup; concurrent PRs each holding a branch eat the 10 fast.

---

## C. Testcontainers (ephemeral Docker Postgres)

**What it is.** `@testcontainers/postgresql` (Testcontainers for Node.js) starts a
throwaway `postgres` Docker container from your test process, waits for it to be ready,
hands you a connection string, and tears it down after — "lightweight, throwaway instances
of common databases ... or anything else that can run in a Docker container".
([node.testcontainers.org](https://node.testcontainers.org/))

**On GitHub Actions.**
- **Docker is preinstalled** on GitHub-hosted `ubuntu-latest` runners; Testcontainers docs
  and Docker's own blog confirm "GitHub Actions provides a Docker environment by default,
  we don't have to configure anything".
  ([docker.com — Running Testcontainers tests using GitHub Actions](https://www.docker.com/blog/running-testcontainers-tests-using-github-actions/))
  Caveat: the newer **`ubuntu-slim`** runners run unprivileged and are **not** suitable for
  Docker-in-Docker / Testcontainers — use `ubuntu-latest`.
- **Startup cost** = image pull (first run, uncached — tens of seconds for `postgres`,
  less for `postgres:17-alpine`) + container boot (a few seconds) + the **Ryuk** reaper
  sidecar (~1 s, cleans up leaked containers). Subsequent runs can cache the image layer
  via `actions/cache` or a pre-pull step. Testcontainers Cloud exists specifically to
  offload this, but it is a paid product and out of scope for a $0 hobby app.
- **Reliability.** Generally solid on GitHub-hosted runners in 2026; the known footguns
  are (a) running migrations inside a container `--health-cmd` (Docker calls it repeatedly
  → concurrent migration runs; use an advisory lock), and (b) `ubuntu-slim` / self-hosted
  runners without a real Docker socket. `testcontainers.reuse.enable=true` speeds local
  reruns but is explicitly **not** for CI.

**Fidelity.** Real Postgres, the exact major/minor you pin, with real connection
concurrency and the ability to `CREATE EXTENSION` anything in the image. Still **not
Neon** — no pooler, no scale-to-zero, no serverless driver path.

**Isolation.** A fresh container per test file is clean but slow (seconds each). The usual
pattern is **one container per suite** + an in-suite isolation strategy (E or F below).

**Downsides for this project.** Adds a Docker dependency to every contributor's inner loop
(fine on Linux/modern Docker Desktop, friction on locked-down machines); heavier than
PGlite for what is a tiny schema; the minimal-toolchain bias counts against it unless
concurrency-sensitive tests genuinely need it.

---

## D. GitHub Actions `services:` Postgres container

**What it is.** GitHub Actions can run a Postgres **service container** alongside the job:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
```

([docs.github.com — Creating PostgreSQL service containers](https://docs.github.com/en/actions/use-cases-and-examples/using-containerized-services/creating-postgresql-service-containers))

- **Runner jobs** (the common case) must map `ports:` and connect via `localhost:5432`.
- **Container jobs** (the whole job runs in a container) skip port mapping and reach the DB
  by its service label as hostname (`postgres:5432`).
- The **health check** gates the job start so tests don't race a not-yet-ready Postgres.

**vs Testcontainers.** Same real-Postgres fidelity, but the container lifecycle is owned by
**Actions YAML**, not the test code — so it only exists in CI, and local `vitest` runs need
a different way to get a Postgres (a local install, `docker run`, or PGlite). GitHub's docs
frame the choice as "ownership and isolation, not speed": Testcontainers gives per-test /
per-suite ownership from code; `services:` gives one shared instance per job.

**Isolation is entirely your problem** — one Postgres instance serves the whole job, so you
need E or F (transaction rollback, template DB, or a schema/database per Vitest worker) to
keep tests from stepping on each other.

**Downsides.** Local/CI parity gap (the DB setup lives in two places); no isolation out of
the box; still not Neon.

---

## E. Per-test transaction rollback (isolation strategy, layers on C/D/local)

**The pattern.** Open a transaction before each test, run the test inside it, `ROLLBACK`
after. Postgres discards everything the test wrote; the next test sees the same baseline
with no `TRUNCATE`/reseed. A rollback is far cheaper than `TRUNCATE ... CASCADE` + reseed,
so the suite stays fast as it grows.
([lobste.rs / "Start with a clean slate: integration testing with PostgreSQL"](https://lobste.rs/s/84ysx5/start_with_clean_slate_integration))

**Known limits (these are the facts the decision needs):**
- **Code that manages its own transactions defeats it.** If the code under test calls
  `COMMIT` / `BEGIN` itself (or the ORM does), a naive outer transaction is either
  committed through or errors. The standard fix is the ORM-level "run the test on a raw
  connection in a real transaction, and map the ORM's `commit`/`rollback` onto
  **SAVEPOINTs** inside it" (SQLAlchemy's `join_transaction_mode`, Django's
  `TestCase`, Rails' fixture transactions). Whether Drizzle / Prisma have a clean hook for
  this is an **open question for the decision ticket** — Prisma's `$transaction` and
  Drizzle's `db.transaction()` both support nesting via savepoints, but wiring "every test
  is a savepoint that always rolls back" is not a documented first-class feature of either
  the way it is in Django/Rails.
- **A single error aborts the whole transaction** — a test that expects a constraint
  violation mid-test then continues will hit `current transaction is aborted`; needs a
  savepoint around the expected failure.
- **`DEFERRABLE` FK / constraint timing** can differ from production because everything is
  inside one never-committed transaction; deferred-constraint behaviour at commit is not
  exercised.
- **Parallelism.** All tests sharing one connection means the suite is effectively
  **serial per connection**. To parallelise you need one connection (and its own wrapping
  transaction) per Vitest worker — which works, but then workers must not share rows, and
  you're back to needing a database or schema per worker anyway.
- **Sequences / `SERIAL` / identity columns** are not rolled back (sequence advances
  survive rollback), so tests must not assert on exact generated IDs.
- Cannot test anything that depends on **another session seeing committed data**
  (triggers firing cross-session, `LISTEN`/`NOTIFY`, advisory locks, `FOR UPDATE`
  contention).

**Net.** Fastest isolation for a mostly-serial suite of pure read/query tests — which is
close to what WhoCares needs (day-state derivation, recipient matrix). The risk is the ORM
transaction-hook question and the "no cross-session" ceiling.

---

## F. Template-database cloning (isolation strategy, layers on C/D/local)

**The pattern.** Build a template database once (run all migrations, mark
`datistemplate=true`), then for each test `CREATE DATABASE test_xxx TEMPLATE template_base`
— Postgres copies the files at the filesystem level, far faster than re-running migrations.
Drop the test DB after. Reference implementations: **pgtestdb** (Go),
**IntegreSQL** (language-agnostic HTTP service), and the pattern is widely written up.
([github.com/peterldowns/pgtestdb](https://github.com/peterldowns/pgtestdb);
[github.com/allaboutapps/integresql](https://github.com/allaboutapps/integresql);
[brandur.org/fragments/pgtestdb](https://brandur.org/fragments/pgtestdb))

**Numbers (from primary write-ups):**
- Template build (once): ~500 ms for ~1000 migrations on a RAM-backed server; WhoCares has
  a handful of migrations, so tens of ms. ([pgtestdb README](https://github.com/peterldowns/pgtestdb))
- Clone per test: **"on the order of 10s of milliseconds"** — cited figures ~10 ms
  (pgtestdb), ~40 ms for a ~14 MB template.
  ([pgtestdb README](https://github.com/peterldowns/pgtestdb);
  [brandur.org](https://brandur.org/fragments/pgtestdb))
- brandur's benchmark: template clone (~98 ms mean setup) is competitive with a
  schema-per-test approach (~99 ms), but a schema approach that **reuses** pre-migrated
  schemas won a full-suite wall-clock comparison 14.5 s vs 51 s — i.e. the fastest thing is
  reusing a migrated schema, not re-cloning.

**Requirements / limits:**
- Needs **admin (`CREATEDB`) rights** on a **dedicated test Postgres** — the docs are
  emphatic: never point it at prod. Fine against Testcontainers / `services:` / a local
  instance; **not possible against Neon** the same way (Neon's branch *is* its clone
  primitive, and Neon roles aren't superuser).
- **`CREATE DATABASE ... TEMPLATE` fails if any other session is connected to the
  template.** ([PostgreSQL manual — Template Databases](https://www.postgresql.org/docs/current/manage-ag-templatedbs.html))
  Test harness must keep the template connection-free.
- Real per-test isolation (separate database) → **parallelism-safe**: pgtestdb explicitly
  supports parallel tests, each getting its own DB, using advisory locks to run migrations
  once.
- Extra moving part: a helper library or ~30 lines of setup script; leftover test DBs on
  failure need a sweep.

**Net.** Best "real Postgres + true isolation + parallel-safe" combo when running against
C or D. The Neon-branch option (B) is conceptually the same idea (clone-per-run) but at the
platform level and slower per clone.

---

## Cross-cutting: how Vitest parallelism interacts with all of this

([vitest.dev/guide/parallelism](https://vitest.dev/guide/parallelism))

- **Test files run in parallel** across workers (`pool: 'forks'` default, or `'threads'`);
  **tests within a file run sequentially** unless marked `.concurrent`.
- Concurrency is bounded by `maxWorkers`. `fileParallelism: false` disables cross-file
  parallelism "if tests depend on shared external resources" — the escape hatch when using
  one shared DB with no per-worker isolation.
- Each forked/threaded worker is its own process/context — so a per-worker DB or schema (a
  DB URL derived from `process.env.VITEST_POOL_ID` / `VITEST_WORKER_ID`) is the idiomatic
  way to get parallel DB tests. This is the seam that makes F (or "schema per worker")
  attractive and that pure transaction-rollback (E) has to work around.
- `globalSetup` runs once for the whole run (start container / create branch / build
  template); `beforeEach`/`afterEach` or a test fixture does per-test isolation.

---

## Migration-compatibility notes (Drizzle / Prisma)

- **Drizzle** ships first-party drivers for both `neon-serverless` / `node-postgres` and
  `pglite` (`drizzle-orm/pglite`), and `drizzle-kit` can push/migrate against any of them.
  Its "get started" docs still present Docker Postgres as the default local option.
  ([orm.drizzle.team/docs/connect-pglite](https://orm.drizzle.team/docs/connect-pglite);
  [orm.drizzle.team/docs/get-started/postgresql-new](https://orm.drizzle.team/docs/get-started/postgresql-new))
  Community threads on "in-memory Postgres for Vitest with Drizzle + PGlite" are active and
  the maintainers treat it as a supported path.
  ([drizzle-orm#4205 / discussion #4216](https://github.com/drizzle-team/drizzle-orm/discussions/4216))
- **Prisma** bundles PGlite in its CLI for local dev as of 2026, which is strong evidence
  that Prisma Migrate SQL applies cleanly to PGlite for a normal schema.
  ([electric.ax — PGlite v0.4](https://electric.ax/blog/2026/03/25/announcing-pglite-v04))
- The only migration-compat risk across A–F is an extension or server feature the target
  doesn't have: PGlite (must be pre-bundled), or a bare `services:`/Testcontainers image
  missing a `contrib` module (use `postgres:17` not a stripped image, or `CREATE
  EXTENSION` in a setup step).

---

## What this means for WhoCares specifically (facts, not a pick)

- **The meat of what needs testing** — live day-state derivation and the notification
  recipient matrix — is **single-session read/query logic over seeded rows**. Every option
  A–F can host that. It does **not** inherently need multi-connection concurrency, so
  PGlite's single-user ceiling is not automatically disqualifying.
- **Effective-dated pattern rows (ADR-0002)** and **"derive, never cache" state
  (ADR-0003)** are pure SQL/date-math semantics — PGlite (real PG 17 planner) and any real
  Postgres behave identically here. No exotic feature is in play from the spec as written.
- **Where prod fidelity could bite:** Neon **scale-to-zero cold starts** (first query after
  idle is slow — matters for the Vercel Cron job and first request of the day) and the
  **Neon serverless driver / pooler** path. Only option **B** exercises those; A/C/D/E/F
  cannot, by construction. Whether that risk warrants B for a two-user app is the
  decision's call.
- **Minimal-toolchain bias** points at **A (PGlite)**: one dev-dep, no Docker, no secret,
  no CI YAML for a database, parallel- and watch-mode-friendly. The cost is accepting that
  "green locally ≠ proven on Neon" and adding, at most, a tiny **B**-style migration/query
  smoke job against a real Neon branch if that gap feels too large.
- **If the ORM turns out to need real concurrency tests** (e.g. testing the pickup-request
  race in ADR-0001's "direct claim overwrites" path under two simultaneous writers), that
  is the one scenario PGlite can't cover and C/D + F can.
- **CI minutes / Neon budget:** a private-repo GitHub Free plan has 2,000 Linux min/mo;
  PGlite adds near-zero, Testcontainers adds ~10–30 s/run, a Neon branch adds a few
  seconds + CU-hours. All comfortably affordable at this project's cadence; the Neon
  **10-branch cap** is the only hard limit worth designing around (serialise CI, set
  `expires_at`, delete on PR close).

---

## Open questions for the decision ticket

1. Do Drizzle / Prisma expose a clean "wrap every test in an always-rolled-back
   transaction/savepoint" hook, or does isolation have to be database/schema-per-test (F /
   per-worker)?
2. Is there any v1 test that genuinely needs two concurrent DB sessions (the direct-claim
   overwrite race)? If yes, PGlite alone is insufficient.
3. Is a small real-Neon smoke job (migrations apply + a handful of representative queries,
   option B, serialised, `expires_at`) worth the network dependency to close the
   "proven on Neon" gap — or is that Playwright's job against the preview deployment?
4. Chosen ORM (separate ticket) constrains 1 and the driver matrix.

---

## Sources

Primary / first-party:
- PGlite — [About / how it works](https://pglite.dev/docs/about),
  [Getting started](https://pglite.dev/docs/),
  [Extensions catalogue](https://pglite.dev/extensions/),
  [pglite-socket](https://pglite.dev/docs/pglite-socket),
  [repo README](https://github.com/electric-sql/pglite)
- Electric — [Announcing PGlite v0.4: PostGIS, connection multiplexing, new architecture (2026-03-25)](https://electric.ax/blog/2026/03/25/announcing-pglite-v04)
- Neon — [Plans & limits](https://neon.com/docs/introduction/plans),
  [Free plan limits and quotas FAQ](https://neon.com/faqs/free-plan-limits-and-quotas),
  [Branching overview](https://neon.com/docs/introduction/branching),
  [Testing queries with Neon branches](https://neon.com/docs/guides/branching-test-queries),
  [Branching with GitHub Actions](https://neon.com/docs/guides/branching-github-actions),
  [Scale to zero](https://neon.com/docs/introduction/scale-to-zero),
  [How to make the most of Neon's Free plan](https://neon.com/blog/how-to-make-the-most-of-neons-free-plan)
- [github.com/neondatabase/create-branch-action](https://github.com/neondatabase/create-branch-action)
- Testcontainers for Node.js — [docs home](https://node.testcontainers.org/)
- Docker — [Running Testcontainers tests using GitHub Actions and Testcontainers Cloud](https://www.docker.com/blog/running-testcontainers-tests-using-github-actions/)
- GitHub Docs — [Creating PostgreSQL service containers](https://docs.github.com/en/actions/use-cases-and-examples/using-containerized-services/creating-postgresql-service-containers),
  [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- Vitest — [Parallelism guide](https://vitest.dev/guide/parallelism),
  [pool config](https://vitest.dev/config/pool)
- PostgreSQL manual — [Template Databases](https://www.postgresql.org/docs/current/manage-ag-templatedbs.html)
- Drizzle ORM — [Connect PGlite](https://orm.drizzle.team/docs/connect-pglite),
  [Get started with PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new),
  [in-memory Postgres for Vitest — discussion #4216](https://github.com/drizzle-team/drizzle-orm/discussions/4216)
- [peterldowns/pgtestdb](https://github.com/peterldowns/pgtestdb),
  [allaboutapps/integresql](https://github.com/allaboutapps/integresql)

Secondary / corroborating (used for reasoning and numbers where first-party benchmarks don't exist, flagged inline):
- [brandur.org — pgtestdb's template cloning approach to testing is fast](https://brandur.org/fragments/pgtestdb)
- [lobste.rs — "Start with a clean slate: integration testing with PostgreSQL" (discussion)](https://lobste.rs/s/84ysx5/start_with_clean_slate_integration)
- [Cybertec — Subtransactions and performance in PostgreSQL](https://www.cybertec-postgresql.com/en/subtransactions-and-performance-in-postgresql/)
- [oneuptime.com — How to set up database testing in GitHub Actions (2025-12)](https://oneuptime.com/blog/post/2025-12-20-database-testing-github-actions/view)
- [qaskills.sh — PostgreSQL service-container health check in GitHub Actions](https://qaskills.sh/blog/github-actions-service-container-health-check-postgres)
