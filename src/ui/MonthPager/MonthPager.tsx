"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { forwardRef, type HTMLAttributes } from "react";
import { Button } from "../Button";
import { monthLabelOf } from "../calendarMonth";
import { cx } from "../cx";
import { DialogTrigger } from "../Dialog";
import { IconButton } from "../IconButton";
import { MonthPicker } from "../MonthPicker";
import styles from "./MonthPager.module.css";

/**
 * `MonthPager` — the calendar's month navigation (docs/design-system-inventory.md,
 * P1): `‹` · a pressable month label (opens the `MonthPicker`) · `›` · a Today
 * button. Shared by the Grid and List tabs.
 *
 * Paging is symmetric and unbounded — the same `‹ ›` mechanism both directions,
 * no year view (SPEC.md "Navigation"). The Today button is blue (`secondary`),
 * never amber — amber is the `FAB`'s alone (docs/design-system-inventory.md §3).
 *
 * `'use client'` — imports RAC (`IconButton` / `Button` / `Dialog`).
 */
export interface MonthPagerProps extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> {
  /** The shown year. */
  year: number;
  /** The shown month, 1–12. */
  month: number;
  /** Page one month back. */
  onPrev: () => void;
  /** Page one month forward. */
  onNext: () => void;
  /** Jump to the month containing the real today. */
  onToday: () => void;
  /** Jump to an arbitrary `(year, month)` from the picker. */
  onJump: (year: number, month: number) => void;
}

export const MonthPager = forwardRef<HTMLDivElement, MonthPagerProps>(function MonthPager(
  { year, month, onPrev, onNext, onToday, onJump, className, style, ...props },
  ref,
) {
  return (
    <div {...props} ref={ref} className={cx(styles.base, className)} style={style}>
      <IconButton aria-label="Previous month" variant="secondary" size="sm" onPress={onPrev}>
        <ChevronLeft size={18} aria-hidden />
      </IconButton>
      <DialogTrigger>
        <Button variant="ghost" className={styles.label}>
          {monthLabelOf(year, month)}
        </Button>
        <MonthPicker year={year} month={month} onSelect={onJump} />
      </DialogTrigger>
      <IconButton aria-label="Next month" variant="secondary" size="sm" onPress={onNext}>
        <ChevronRight size={18} aria-hidden />
      </IconButton>
      <Button variant="secondary" size="sm" onPress={onToday}>
        Today
      </Button>
    </div>
  );
});
