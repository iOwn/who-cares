/**
 * The screens `/verify-ui` knows how to reach (issue #203).
 *
 * Pure data + Playwright page steps; nothing here imports `playwright`, so
 * `matrix.mjs` (and its `node --test` suite) can read the table without a
 * browser. Selectors are the ones `e2e/smoke.spec.ts` already relies on.
 *
 * `owners` are the source paths whose change makes a scene worth looking at;
 * `matrix.mjs` maps a PR diff onto scenes with them. Shared code (`src/ui/**`,
 * `globals.css`, `layout.tsx`) is handled there, not listed per scene.
 */

/** The header bell: `aria-label` is "Requests" at 0, "Requests, N pending" otherwise. */
const BELL = /^Requests(,|$)/;

/**
 * Soonest Mon-Fri strictly after today, in UTC — the same rule as
 * `nearChildcareDay` in `e2e/smoke.spec.ts` (the app derives "today" in UTC).
 */
function nearChildcareDay(from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** `"Monday, January 13, 2026"` — how the day cell / sheet title spell the date. */
function longLabel(d) {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openHome(page) {
  await page.goto("/");
  await page.getByRole("button", { name: BELL }).waitFor();
}

async function openDayDetail(page) {
  await openHome(page);
  const target = nearChildcareDay();
  const now = new Date();
  if (target.getUTCMonth() !== now.getUTCMonth()) {
    await page.getByRole("button", { name: "Next month" }).click();
  }
  await page.getByRole("button", { name: new RegExp(escapeRegExp(longLabel(target))) }).click();
  await page.getByRole("dialog").waitFor();
}

export const SCENES = [
  {
    name: "sign-in",
    auth: false,
    scrolls: false,
    owners: [/^src\/app\/SignInScreen/],
    run: async (page) => {
      await page.goto("/");
      await page.locator("main").waitFor();
    },
  },
  {
    name: "calendar-grid",
    auth: true,
    scrolls: true,
    owners: [/^src\/app\/(Calendar|AppShell|PullToRefresh|RouteSkeleton|loading)/],
    run: openHome,
  },
  {
    name: "calendar-list",
    auth: true,
    scrolls: true,
    owners: [/^src\/app\/(Calendar|AppShell|PullToRefresh|RouteSkeleton|loading)/],
    run: async (page) => {
      await openHome(page);
      await page.getByRole("radiogroup", { name: "Calendar view" }).getByText("List").click();
    },
  },
  {
    name: "day-detail",
    auth: true,
    scrolls: true,
    owners: [/^src\/app\/(DayDetail|Calendar|AppShell)/],
    run: openDayDetail,
  },
  {
    name: "im-out",
    auth: true,
    scrolls: true,
    owners: [/^src\/app\/(AbsenceForm|DayDetail|AppShell)/],
    run: async (page) => {
      await openDayDetail(page);
      await page.getByRole("button", { name: /I.?m out this day/i }).click();
      await page.getByRole("button", { name: /Save absence/i }).waitFor();
    },
  },
  {
    name: "inbox",
    auth: true,
    scrolls: true,
    owners: [/^src\/app\/(Inbox|AppShell)/],
    run: async (page) => {
      await openHome(page);
      await page.getByRole("button", { name: BELL }).click();
      await page.getByRole("complementary", { name: "Pickup requests" }).waitFor();
    },
  },
  {
    name: "settings",
    auth: true,
    scrolls: true,
    // Everything under settings/ except the household sub-route.
    owners: [/^src\/app\/settings\/(?!household\/)/],
    run: async (page) => {
      await page.goto("/settings");
      await page.locator("main").waitFor();
    },
  },
  {
    name: "settings-household",
    auth: true,
    scrolls: true,
    // Shared settings code (SettingsShell, cards) reaches this route too.
    owners: [/^src\/app\/settings\//],
    run: async (page) => {
      await page.goto("/settings/household");
      await page.locator("main").waitFor();
    },
  },
];
