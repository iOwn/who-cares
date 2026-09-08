/**
 * `DateField` component test — the third ADR-0009 interaction/a11y contract
 * (docs/design-system.md "Testing", ADR-0009). It asserts ONLY behaviour our
 * wiring of RAC's `DatePicker` configures and could regress silently in a
 * refactor — not RAC internals, and not feature-level validation (the forms
 * boundary keeps validation logic out of the primitives — design-system.md §11).
 *
 * Contract under test — `minValue` blocks / flags past dates:
 *
 *   1. BLOCKS — with `minValue` = today, opening the calendar cannot page to a
 *      past month (the "previous" button is disabled) and every day cell before
 *      today in the visible month is disabled (`data-disabled` +
 *      `aria-disabled="true"`), while today's cell stays selectable.
 *
 *   2. FLAGS — with `minValue` = today and a controlled `value` three days in
 *      the past, the field enters `data-invalid` on the date-input group and
 *      surfaces the passed-through `errorMessage` — no feature validation code.
 *
 *   3. No false positive — an in-range value is neither flagged nor shows the
 *      error message.
 */
import { getLocalTimeZone, today } from "@internationalized/date";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { DateField } from "./DateField";

afterEach(cleanup);

const tz = getLocalTimeZone();
const ERROR = "Pick a date from today onward.";

describe("DateField — minValue", () => {
  test("blocks paging to past months and disables past day cells", async () => {
    const min = today(tz);
    const screen = await render(
      <DateField label="Effective from" defaultValue={min} minValue={min} />,
    );

    // Only the popover trigger button exists before the calendar opens.
    await screen.getByRole("button").click();

    const grid = screen.getByRole("grid");
    await expect.element(grid).toBeInTheDocument();

    // Cannot page back to a month that is entirely before minValue.
    const prevButton = document.querySelector<HTMLButtonElement>('[slot="previous"]');
    expect(prevButton?.disabled).toBe(true);

    const dayCells = Array.from(grid.element().querySelectorAll<HTMLElement>("td > div")).filter(
      (el) => /^\d+$/.test(el.textContent?.trim() ?? "") && !el.hasAttribute("data-outside-month"),
    );
    const todayCell = dayCells.find((c) => Number(c.textContent) === min.day);
    expect(todayCell?.hasAttribute("data-disabled")).toBe(false);

    for (const cell of dayCells) {
      const disabled = cell.hasAttribute("data-disabled");
      if (Number(cell.textContent) < min.day) {
        expect(disabled).toBe(true);
        expect(cell.getAttribute("aria-disabled")).toBe("true");
      } else {
        expect(disabled).toBe(false);
      }
    }
  });

  test("flags a value before minValue and shows the passed-through errorMessage", async () => {
    const screen = await render(
      <DateField
        label="Effective from"
        minValue={today(tz)}
        value={today(tz).subtract({ days: 3 })}
        errorMessage={ERROR}
      />,
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
    );

    await expect.element(screen.getByRole("group")).not.toHaveAttribute("data-invalid");
    await expect.element(screen.getByText(ERROR)).not.toBeInTheDocument();
  });
});
