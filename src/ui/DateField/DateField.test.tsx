/**
 * `DateField` component test — the third ADR-0009 interaction/a11y contract
 * (docs/design-system.md "Testing", ADR-0009). It asserts ONLY behaviour our
 * wiring of RAC's `DatePicker` configures and could regress silently in a
 * refactor — not RAC internals, and not feature-level validation (the forms
 * boundary keeps validation logic out of the primitives — design-system.md §11).
 *
 * Contract under test — `minValue` blocks / flags past dates:
 *
 *   1. BLOCKS — with a fixed mid-month `minValue`, opening the calendar cannot
 *      page to an earlier month (the "Previous" button is disabled), an earlier
 *      same-month day cell is `aria-disabled`, and the `minValue` day itself
 *      stays selectable. Fixed date (not `today()`) so the assertion always
 *      runs. Asserted via role + accessible name, not DOM structure.
 *
 *   2. FLAGS — with `minValue` = today and a controlled `value` three days in
 *      the past, the field enters `data-invalid` on the date-input group and
 *      surfaces the passed-through `errorMessage` — no feature validation code.
 *
 *   3. No false positive — an in-range value is neither flagged nor shows the
 *      error message.
 *
 * Renders are wrapped in `I18nProvider locale="en-US"` so RAC's localized
 * strings (nav-button labels, calendar-cell names) are deterministic regardless
 * of the test runner's browser locale.
 */
import type { DateValue } from "@internationalized/date";
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import type { ReactNode } from "react";
import { I18nProvider } from "react-aria-components";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { DateField } from "./DateField";

afterEach(cleanup);

const tz = getLocalTimeZone();
const ERROR = "Pick a date from today onward.";

/** Fixed mid-month boundary — keeps the "blocks" assertions calendar-deterministic. */
const MID_MONTH_MIN = new CalendarDate(2026, 6, 15);

function EnUs({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US">{children}</I18nProvider>;
}

/**
 * RAC names each calendar-cell button with its full localized date; a substring
 * of that (weekday + month + day + year) is a stable, DOM-shape-independent
 * handle under the forced en-US locale.
 */
const cellName = (d: DateValue) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(d.year, d.month - 1, d.day));

describe("DateField — minValue", () => {
  test("blocks dates before minValue in the calendar", async () => {
    const screen = await render(
      <DateField label="Effective from" defaultValue={MID_MONTH_MIN} minValue={MID_MONTH_MIN} />,
      { wrapper: EnUs },
    );

    // The sole button before the popover opens is the calendar trigger.
    await screen.getByRole("button").click();
    await expect.element(screen.getByRole("grid")).toBeInTheDocument();

    // The previous month is entirely before minValue → paging back is blocked.
    await expect.element(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    // An earlier day in the same visible month is not selectable.
    await expect
      .element(
        screen.getByRole("button", { name: new RegExp(cellName(MID_MONTH_MIN.set({ day: 10 }))) }),
      )
      .toHaveAttribute("aria-disabled", "true");

    // The minValue day itself stays selectable.
    await expect
      .element(screen.getByRole("button", { name: new RegExp(cellName(MID_MONTH_MIN)) }))
      .not.toHaveAttribute("aria-disabled", "true");
  });

  test("flags a value before minValue and shows the passed-through errorMessage", async () => {
    const screen = await render(
      <DateField
        label="Effective from"
        minValue={today(tz)}
        value={today(tz).subtract({ days: 3 })}
        errorMessage={ERROR}
      />,
      { wrapper: EnUs },
    );

    await expect.element(screen.getByRole("group")).toHaveAttribute("data-invalid", "true");
    await expect.element(screen.getByText(ERROR)).toBeVisible();
  });

  test("does not flag an in-range value (no false positive)", async () => {
    const screen = await render(
      <DateField
        label="Effective from"
        minValue={today(tz)}
        value={today(tz).add({ days: 3 })}
        errorMessage={ERROR}
      />,
      { wrapper: EnUs },
    );

    await expect.element(screen.getByRole("group")).not.toHaveAttribute("data-invalid");
    await expect.element(screen.getByText(ERROR)).not.toBeInTheDocument();
  });
});
