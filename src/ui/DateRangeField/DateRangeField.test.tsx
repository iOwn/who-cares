/**
 * `DateRangeField` component test — the fourth ADR-0009 interaction/a11y
 * contract (docs/design-system.md "Testing", ADR-0009). It asserts ONLY what
 * our wiring of RAC's `DateRangePicker` / `RangeCalendar` configures and could
 * regress silently — the two things the "+ I'm out" absence form depends on:
 *
 *   1. THE 4-WEEK CAP — with a fixed `maxValue`, the calendar cannot page past
 *      it ("Next" disabled), a day after it in the visible month is
 *      `aria-disabled`, and the `maxValue` day itself stays selectable. Fixed
 *      dates (not `today()`) so the assertions always run.
 *
 *   2. END-BEFORE-START FLAGGED — a controlled range whose `end` precedes its
 *      `start` puts the field in `data-invalid` and surfaces the passed-through
 *      `errorMessage`, with no cross-field code in the feature.
 *
 *   3. No false positive — an in-range, well-ordered value is neither flagged
 *      nor shows the error message.
 *
 * Renders are wrapped in `I18nProvider locale="en-US"` for deterministic RAC
 * localized strings.
 */
import type { DateValue } from "@internationalized/date";
import { CalendarDate } from "@internationalized/date";
import type { ReactNode } from "react";
import { I18nProvider } from "react-aria-components";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { DateRangeField } from "./DateRangeField";

afterEach(cleanup);

const ERROR = "The end date can't be before the start date.";

/** Fixed mid-month cap — keeps the "blocks" assertions calendar-deterministic. */
const MAX = new CalendarDate(2026, 6, 15);

function EnUs({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US">{children}</I18nProvider>;
}

const cellName = (d: DateValue) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(d.year, d.month - 1, d.day));

describe("DateRangeField — the 4-week cap", () => {
  test("blocks dates after maxValue in the calendar", async () => {
    const screen = await render(
      <DateRangeField
        label="I'm out"
        defaultValue={{ start: MAX.set({ day: 10 }), end: MAX.set({ day: 12 }) }}
        maxValue={MAX}
      />,
      { wrapper: EnUs },
    );

    // The sole button before the popover opens is the calendar trigger.
    await screen.getByRole("button").click();
    await expect.element(screen.getByRole("grid")).toBeInTheDocument();

    // Next month is entirely after maxValue → paging forward is blocked.
    // RangeCalendar renders a visible slotted nav button plus a hidden
    // screen-reader one; both carry the same label, and both go disabled.
    await expect.element(screen.getByRole("button", { name: "Next" }).first()).toBeDisabled();

    // A later day in the same visible month is not selectable.
    await expect
      .element(screen.getByRole("button", { name: new RegExp(cellName(MAX.set({ day: 20 }))) }))
      .toHaveAttribute("aria-disabled", "true");

    // The maxValue day itself stays selectable.
    await expect
      .element(screen.getByRole("button", { name: new RegExp(cellName(MAX)) }))
      .not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("DateRangeField — end before start", () => {
  test("flags the range and shows the passed-through errorMessage", async () => {
    const screen = await render(
      <DateRangeField
        label="I'm out"
        value={{ start: MAX, end: MAX.subtract({ days: 2 }) }}
        errorMessage={ERROR}
      />,
      { wrapper: EnUs },
    );

    await expect.element(screen.getByRole("group")).toHaveAttribute("data-invalid", "true");
    await expect.element(screen.getByText(ERROR)).toBeVisible();
  });

  test("does not flag a well-ordered in-range value (no false positive)", async () => {
    const screen = await render(
      <DateRangeField
        label="I'm out"
        value={{ start: MAX.subtract({ days: 3 }), end: MAX.subtract({ days: 1 }) }}
        maxValue={MAX}
        errorMessage={ERROR}
      />,
      { wrapper: EnUs },
    );

    await expect.element(screen.getByRole("group")).not.toHaveAttribute("data-invalid");
    await expect.element(screen.getByText(ERROR)).not.toBeInTheDocument();
  });
});
