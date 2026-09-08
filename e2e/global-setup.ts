import type { FullConfig } from "playwright/test";

/**
 * Global setup scaffold for the E2E smoke path (ADR-0008).
 *
 * The real smoke spec (issue #56) needs a known-good database state and an
 * authenticated session before it runs. Per ADR-0008 that comes from two
 * secret-gated routes that mount on the preview deploy only when
 * `E2E_TEST_MODE` is set:
 *
 *   POST {baseURL}/api/test/seed   — truncate-all, insert the fixed household fixture
 *   POST {baseURL}/api/test/login  — mint a Better Auth session for a named member
 *
 * #56 will call both here and persist the session (e.g. via `storageState`).
 * Until those routes exist this is a no-op so `pnpm exec playwright test --list`
 * and a future un-skipped spec both load cleanly.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) {
    // `pnpm e2e` with no target: let the (currently skipped) spec surface the
    // missing-config error rather than throwing from setup.
    return;
  }

  // TODO(#56): seed + login against `${baseURL}/api/test/*` and save storageState.
}
