"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ReactNode } from "react";
import { Button as RACButton, VisuallyHidden } from "react-aria-components";
import { cx } from "../cx";
import type { DayDisplayState } from "../dayDisplayState";
import styles from "./DayCell.module.css";

/**
 * `DayCell` — one day in the calendar month grid
 * (docs/design-system-inventory.md, P1). Composes a state marker + a one-char
 * state-icon badge + a one-line "who" label under the date number.
 *
 * The `state` display enum is the full six: the four status-vocabulary states
 * plus `quiet` (a childcare day with nothing happening — a small neutral dot)
 * and `off` (a weekday the pattern never included — a flat, borderless tile).
 * `isToday` is ORTHOGONAL to state — a heavy border + `--shadow-md` on whatever
 * the cell already is.
 *
 * The state dot / badge are decorative (`aria-hidden`); pass `ariaLabel` with
 * the full date + state so a screen-reader user gets the real context on the
 * root element rather than a bare day number.
 *
 * In #49 cells only ever render `quiet` / `off` / `closed` (no day-state yet);
 * the `whoLabel` is `"closed"` for a closure and empty otherwise. #50 fills in
 * the rest (assignee name / "asked {name}" / "both out" / …).
 *
 * Pressable only when `onPress` is supplied — then it is a RAC `Button` (opens
 * the day-detail sheet, #50); otherwise a plain `<div>`.
 */

const STATE_ICON: Partial<Record<DayDisplayState, string>> = {
  resolved: "✓",
  pending: "…",
  "at-risk": "!",
  closed: "–",
};

const cell = cva(styles.base, {
  variants: {
    state: {
      resolved: styles.resolved,
      pending: styles.pending,
      "at-risk": styles.atRisk,
      closed: styles.closed,
      quiet: styles.quiet,
      off: styles.off,
    },
    today: { true: styles.today },
  },
});

export interface DayCellProps extends Omit<VariantProps<typeof cell>, "state"> {
  /** 1–31. */
  dayOfMonth: number;
  /** The UI display state. */
  state: DayDisplayState;
  /** The one-line label under the date (assignee / "asked …" / "closed"). */
  whoLabel?: string;
  /** Heavy border + shadow — the real current date. Orthogonal to `state`. */
  isToday?: boolean;
  /** Full date + state, for the screen-reader label on the root element. */
  ariaLabel?: string;
  /** When set, the cell is a pressable RAC `Button`. */
  onPress?: () => void;
  isDisabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const DayCell = forwardRef<HTMLElement, DayCellProps>(function DayCell(
  { dayOfMonth, state, whoLabel, isToday, ariaLabel, onPress, isDisabled, className, style },
  ref,
) {
  const icon = STATE_ICON[state];
  const classes = cx(cell({ state, today: isToday }), className);

  // When `ariaLabel` is given it carries the full date + state, so the visible
  // number / "who" line become decorative to a screen reader (they'd otherwise
  // read as a bare, contextless "3").
  const decorative = ariaLabel != null;

  const inner: ReactNode = (
    <>
      {decorative ? <VisuallyHidden>{ariaLabel}</VisuallyHidden> : null}
      <span className={styles.date} aria-hidden={decorative || undefined}>
        {dayOfMonth}
      </span>
      {state === "quiet" ? (
        <span className={styles.quietDot} aria-hidden />
      ) : icon != null ? (
        <span className={styles.badge} aria-hidden>
          {icon}
        </span>
      ) : null}
      {whoLabel ? (
        <span className={styles.who} aria-hidden={decorative || undefined}>
          {whoLabel}
        </span>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <RACButton
        ref={ref as React.Ref<HTMLButtonElement>}
        onPress={onPress}
        isDisabled={isDisabled}
        aria-label={ariaLabel}
        className={cx(classes, styles.pressable)}
        style={style}
      >
        {inner}
      </RACButton>
    );
  }

  return (
    <div ref={ref as React.Ref<HTMLDivElement>} className={classes} style={style}>
      {inner}
    </div>
  );
});
