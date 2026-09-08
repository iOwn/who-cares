import { forwardRef, type HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./CountBadge.module.css";

/**
 * `CountBadge` — a small numeric overlay, unrelated to day-state: the
 * notifications bell on the app header (docs/design-system-inventory.md §7).
 * Red `--color-at-risk-solid`, white text, a `--color-bg` ring so it reads when
 * it overlaps a control.
 *
 * A plain `<span>` — no RAC, no interaction state. Renders `null` at `count <= 0`
 * (nothing to show). Counts above `max` render as `{max}+`. Give it an
 * `aria-label` when the number alone is ambiguous, or `aria-hidden` when a
 * sibling control already announces the count.
 */
export interface CountBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  /** The count. `<= 0` renders nothing. */
  count: number;
  /** Counts above this cap render as `{max}+`. Default 9. */
  max?: number;
}

export const CountBadge = forwardRef<HTMLSpanElement, CountBadgeProps>(function CountBadge(
  { count, max = 9, className, style, ...props },
  ref,
) {
  if (count <= 0) return null;
  const text = count > max ? `${max}+` : String(count);
  return (
    <span {...props} ref={ref} className={cx(styles.base, className)} style={style}>
      {text}
    </span>
  );
});
