"use client";

import { forwardRef, type HTMLAttributes } from "react";
import type { CalendarDate } from "@/domain";
import type { CalendarMonthView } from "../calendarMonth";
import { WEEKDAY_HEADERS } from "../calendarMonth";
import { cx } from "../cx";
import { DayCell } from "../DayCell";
import styles from "./CalendarGrid.module.css";

/**
 * `CalendarGrid` — the 7-column month grid (docs/design-system-inventory.md,
 * P1). A weekday header row (Monday-first) + 5–6 week rows of `DayCell`s, with
 * the adjacent-month leading/trailing days rendered as flat blanks.
 *
 * It takes a ready-built `CalendarMonthView` (`buildCalendarMonth`,
 * `src/ui/calendarMonth`) — the layout maths and the pattern/closure derivation
 * both live there, not here. `onDayPress` makes the in-month cells pressable;
 * omit it for a read-only grid.
 *
 * A `<section>` labelled by the month so screen-reader users can find the grid;
 * `'use client'` — it forwards `onDayPress` onto the composed `DayCell`s.
 */
export interface CalendarGridProps extends Omit<HTMLAttributes<HTMLElement>, "onSelect"> {
  /** The month to render — from `buildCalendarMonth`. */
  month: CalendarMonthView;
  /** Called with the pressed day's date; when set, in-month cells are pressable. */
  onDayPress?: (date: CalendarDate) => void;
}

export const CalendarGrid = forwardRef<HTMLElement, CalendarGridProps>(function CalendarGrid(
  { month, onDayPress, className, style, ...props },
  ref,
) {
  return (
    <section
      {...props}
      ref={ref}
      aria-label={`${month.label} calendar`}
      className={cx(styles.base, className)}
      style={style}
    >
      <div className={styles.headerRow} aria-hidden>
        {WEEKDAY_HEADERS.map((label, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 7-item static header
            key={i}
            className={cx(styles.headerCell, i >= 5 && styles.headerWeekend)}
          >
            {label}
          </span>
        ))}
      </div>
      <div className={styles.grid}>
        {month.weeks.map((week, w) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: weeks are positional
          <div key={w} className={styles.week}>
            {week.map((day) =>
              day.inMonth ? (
                <DayCell
                  key={day.date}
                  dayOfMonth={day.dayOfMonth}
                  state={day.displayState}
                  whoLabel={day.whoLabel}
                  isToday={day.isToday}
                  ariaLabel={day.ariaLabel}
                  onPress={onDayPress ? () => onDayPress(day.date) : undefined}
                />
              ) : (
                <div key={day.date} className={styles.blank} aria-hidden />
              ),
            )}
          </div>
        ))}
      </div>
    </section>
  );
});
