import { expect, test } from "playwright/test";

/**
 * The one E2E smoke path (ADR-0008) — PLACEHOLDER.
 *
 * Full flow, to be implemented in issue #56:
 *   magic-link member signs in -> parent A declares an absence covering a near
 *   childcare day -> the pickup request is raised -> parent B accepts -> the day
 *   renders **Resolved**.
 *
 * Exercises auth -> DB write -> derived day-state read model -> request
 * lifecycle -> UI in a single pass. Assertions are on app state only.
 *
 * Skipped until #56 wires up `e2e/global-setup.ts` (seed + login via the
 * `E2E_TEST_MODE` seam) and the app has the screens to drive.
 */
test.skip("absence -> pickup request -> accept -> day resolves", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/WhoCares/i);
});
