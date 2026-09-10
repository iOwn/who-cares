/**
 * The hard gate on the E2E test seam (issue #56, ADR-0008).
 *
 * `POST /api/test/seed` and `POST /api/test/login` mount only when
 * `E2E_TEST_MODE` is set — on the Vercel **preview** deploy, never production
 * (`/api/test/seed` truncates the database and production holds the one real
 * household). Both routes call `assertTestModeEnabled()` first and return a bare
 * 404 otherwise, so the seam is indistinguishable from a non-existent route
 * anywhere it is not deliberately switched on.
 *
 * Pure and env-only, so it is unit-tested in the `node` project
 * (`testMode.test.ts`) without spinning up a route.
 */

/** Values of `E2E_TEST_MODE` that count as "on". Anything else (incl. unset) is off. */
const ENABLED_VALUES = new Set(["1", "true", "on", "yes"]);

type EnvLike = Record<string, string | undefined>;

/** Whether the E2E test seam is switched on for this deployment. */
export function isTestModeEnabled(env: EnvLike = process.env): boolean {
  const raw = env.E2E_TEST_MODE;
  return typeof raw === "string" && ENABLED_VALUES.has(raw.trim().toLowerCase());
}

/** A response type that mimics a route that does not exist. */
export class TestModeDisabledError extends Error {
  constructor() {
    super("E2E test seam is disabled");
    this.name = "TestModeDisabledError";
  }
}

/**
 * Throw {@link TestModeDisabledError} unless the seam is enabled. Route handlers
 * catch it and return `new Response(null, { status: 404 })`.
 */
export function assertTestModeEnabled(env: EnvLike = process.env): void {
  if (!isTestModeEnabled(env)) throw new TestModeDisabledError();
}
