# Integration tests run against in-process PGlite, not a Neon branch or Docker Postgres

While choosing how integration tests get a database (issue #18), the options ran from a
Neon branch per CI run, through Docker / Testcontainers, to an in-process Postgres. The
minimal-toolchain bias (no Docker, no CI secret, no database YAML for a two-user hobby app)
pointed at the last one.

**Two layers, with a deliberately small database surface.** The bulk of the suite — day-state
derivation (ADR-0003), the notification recipient matrix, absence → pickup-request generation,
effective-dated pattern resolution (ADR-0002) — is pure TypeScript over in-memory data via
fake repositories, and touches **no database at all**; that logic operates on loaded entities,
never a SQL view. A thinner DB-integration layer tests only that the real repository queries
return the right rows: the correct effective-dated pattern version for a date, absences
overlapping a range, the foreign-key graph.

**That layer runs on PGlite** (`@electric-sql/pglite`) — real PostgreSQL 17 compiled to WASM,
in-process with Vitest. One dev-dependency, no Docker, no secret, no CI service container,
and it stays parallel- and watch-mode friendly. Each test file gets a fresh `new PGlite()`;
the schema is built by running the **actual migration files** in setup, so a broken migration
fails a test rather than only production. ADR-0002 date math and ADR-0003 live derivation run
on PGlite's real PG17 planner identically to Neon.

**What this consciously gives up.** A green PGlite suite is not proof-on-Neon: it does not
exercise Neon scale-to-zero cold starts or the serverless-driver / pooler path. That residual
gap is covered by the Playwright smoke path running against the Vercel preview deployment
(ADR-0008), which hits real Neon end to end. A dedicated Neon-branch CI job would cost a
`NEON_API_KEY` secret and the free-tier branch cap to design around — disproportionate here.
There is also no two-concurrent-session write test in v1: the ADR-0001 direct-claim overwrite
is a single-row `UPDATE`, and last-writer-wins is inherent Postgres behaviour, not app logic
needing a two-session harness.

**Consequences**: migrations are exercised by being run against PGlite in setup; real-Neon
fidelity rests on the preview-deploy smoke path; a genuine race concern surfacing during the
build is a Testcontainers add-on *then*, not a v1 toolchain choice now. The ORM (Drizzle vs
Prisma) is a build-effort decision and does not affect this — both ship first-party PGlite
drivers.
