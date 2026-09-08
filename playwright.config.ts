import { defineConfig, devices } from "playwright/test";

/**
 * Playwright config for the one E2E smoke path (ADR-0008).
 *
 * There is exactly one spec and one browser. It runs in CI from `e2e.yml`
 * against the Vercel preview deployment once its `deployment_status` is
 * `success`, and locally via `pnpm e2e` against a personal Neon dev branch.
 *
 * `baseURL` comes from `PLAYWRIGHT_BASE_URL`:
 *   - `e2e.yml` exports it from `github.event.deployment_status.target_url`
 *   - locally you set it yourself (e.g. `PLAYWRIGHT_BASE_URL=http://localhost:3000`)
 *
 * The bare `playwright` package (not `@playwright/test`) is the devDependency,
 * so the test runner is imported from `playwright/test`.
 *
 * The real smoke spec is issue #56; `e2e/smoke.spec.ts` is a skipped placeholder
 * until then, and `e2e/global-setup.ts` is a scaffold for the seed/login calls
 * that spec will need.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // No local web server: E2E always targets an already-deployed URL.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
