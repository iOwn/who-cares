# E2E is one smoke path against the Vercel preview deployment, via a secret-gated test seam

While scoping E2E for v1 (issue #21), the pull was toward a full Playwright suite with its own
database. The minimal-toolchain bias, the absence of a CI database (ADR-0006), and the fact
that the one real household lives in production pointed somewhere much smaller.

**One thin smoke path, one happy flow.** A magic-link member signs in → parent A declares an
absence covering a near childcare day → the pickup request is raised → parent B accepts → the
day renders **Resolved**. That exercises auth → DB write → the derived day-state read model →
the request lifecycle → UI in a single pass. Decline, at-risk, and direct-claim are left to
Vitest domain tests, where they are cheap and exhaustive; there is no second E2E path in v1.
Assertions are on app state only — the day shows Resolved and the assignment / request rows
are correct — never on notification dispatch, which is covered at the adapter boundary in
Vitest.

**Against the Vercel preview deployment.** The PR's preview is the real serverless runtime, a
real Neon branch, and real Resend — the highest-fidelity target available, and already
load-bearing for ADR-0005 and ADR-0006, which lean on this path to cover real-Neon behaviour.
A GitHub Actions job keyed on `deployment_status == success` for the preview runs the one
Chromium spec.

**A secret-gated test seam supplies auth and data.** Two API routes mount only when
`E2E_TEST_MODE` is set on the deploy: `POST /api/test/seed` wipes and inserts a fixed household
fixture, `POST /api/test/login` mints a Better Auth session for a named member. Playwright's
global setup calls both. The magic-link *email* path is not smoke-covered — real mailbox
interception (Mailosaur / MailSlurp) was rejected as an external, flakier dependency.

**Consequences**: the preview deployment carries the `E2E_TEST_MODE` test-seam routes;
**production is never smoke-tested** — `/api/test/seed` is destructive and prod holds the one
real household, so `E2E_TEST_MODE` is never set there. Post-merge confidence is the preview run
on the PR plus a manual check. Local E2E is opt-in (`pnpm e2e` against a personal Neon dev
branch). Revisit if the seam ever needs to exist in production.
