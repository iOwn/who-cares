import { expect, test } from "playwright/test";
import { STORAGE_STATE } from "./global-setup";

/**
 * The one E2E smoke path (ADR-0008, issue #56).
 *
 *   parent A (seeded session) declares a one-off absence over a near childcare
 *   day → a pickup request is raised for parent B → parent B accepts it → the
 *   day renders **Resolved** ("Sorted") for both.
 *
 * One pass over auth → DB write → the derived day-state read model → the request
 * lifecycle → UI. Assertions are on **app state only** — the day's display
 * state, the request reaching parent B's inbox, the assignee shown — never on
 * notification dispatch (that is covered at the adapter boundary in Vitest).
 *
 * The mid-flow day state is asserted as pending **or** at-risk: a request on a
 * childcare day inside the 48h lead window is At-risk immediately (ADR-0003),
 * and the target here is deliberately near, so which of the two shows depends on
 * the day of the week the run happens to land on. Either way a request exists —
 * the unambiguous check is parent B's bell count.
 *
 * `e2e/global-setup.ts` has already called `POST /api/test/seed` and
 * `POST /api/test/login` for both parents and saved a `storageState` each.
 */

const hasTarget = Boolean(process.env.PLAYWRIGHT_BASE_URL);

/** The header bell: `aria-label` is "Requests" at 0, "Requests, N pending" otherwise. */
const BELL = /^Requests(,|$)/;

// Parent A is the default actor; parent B gets its own context inside the test.
test.use({ storageState: STORAGE_STATE.a });

/**
 * The soonest Mon–Fri strictly after today, in **UTC**. The app derives "today"
 * in UTC on the server and the day-cell / sheet labels all pin `timeZone: "UTC"`
 * (`dayAriaLabel`, `formatCalendarDate`), and `longLabel` below matches that —
 * so a UTC CI runner and a local run agree on which cell to click.
 */
function nearChildcareDay(from = new Date()): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** `"Monday, January 13, 2026"` — how the day cell / sheet title spell the date. */
function longLabel(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

test.describe("smoke", () => {
  test.skip(!hasTarget, "set PLAYWRIGHT_BASE_URL to run the E2E smoke path");

  test("absence -> pickup request -> accept -> day resolves", async ({ page, browser }) => {
    const target = nearChildcareDay();
    const targetDay = longLabel(target);
    const targetInThisMonth = target.getUTCMonth() === new Date().getUTCMonth();

    // --- Parent A: declare the absence -----------------------------------
    await page.goto("/");
    await expect(page).toHaveTitle(/WhoCares/i);
    await expect(page.getByRole("button", { name: BELL })).toBeVisible();

    if (!targetInThisMonth) {
      await page.getByRole("button", { name: "Next month" }).click();
    }

    // Open the day cell, then the "+ I'm out" sheet anchored to it. Target
    // buttons unique to each sheet rather than a shared `getByRole("dialog")`,
    // which would be ambiguous during the day-detail → absence-form swap.
    await page.getByRole("button", { name: new RegExp(escapeRegExp(targetDay)) }).click();
    await page.getByRole("button", { name: /I.?m out this day/i }).click();

    const save = page.getByRole("button", { name: /Save absence/i });
    await save.click();
    await expect(save).toBeHidden();

    // The request is raised: the day is no longer quiet — pending, or (on a near
    // day inside the 48h window) at-risk.
    const REQUEST_RAISED = new RegExp(
      `${escapeRegExp(targetDay)}.*pickup (request waiting|at risk)`,
    );
    await expect(page.getByRole("button", { name: REQUEST_RAISED })).toBeVisible({
      timeout: 15_000,
    });

    // --- Parent B: the request arrived, and gets accepted ---------------
    const contextB = await browser.newContext({ storageState: STORAGE_STATE.b });
    const pageB = await contextB.newPage();
    await pageB.goto("/");

    // Unambiguous "a request exists": the header bell now carries a count.
    const bellB = pageB.getByRole("button", { name: /^Requests, 1 pending/ });
    await expect(bellB).toBeVisible({ timeout: 15_000 });
    await bellB.click();

    const requests = pageB.getByRole("complementary", { name: "Pickup requests" });
    await expect(requests.getByText(/Alex is out/)).toBeVisible();
    await requests.getByRole("button", { name: "Accept" }).first().click();

    // --- Both parents now see the day Resolved ------------------------
    await expect(
      pageB.getByRole("button", { name: new RegExp(`${escapeRegExp(targetDay)}.*pickup sorted`) }),
    ).toBeVisible({ timeout: 15_000 });

    await page.reload();
    if (!targetInThisMonth) {
      await page.getByRole("button", { name: "Next month" }).click();
    }
    const resolvedCell = page.getByRole("button", {
      name: new RegExp(`${escapeRegExp(targetDay)}.*pickup sorted`),
    });
    await expect(resolvedCell).toBeVisible();

    // The assignment row names parent B as the assignee.
    await resolvedCell.click();
    const resolvedDetail = page.getByRole("dialog");
    await expect(resolvedDetail.getByText("Sorted")).toBeVisible();
    await expect(resolvedDetail.getByText(/Bailey is on pickup/)).toBeVisible();

    await contextB.close();
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
