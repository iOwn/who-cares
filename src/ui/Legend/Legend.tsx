import { forwardRef, type HTMLAttributes } from "react";
import { cx } from "../cx";
import type { StatusDisplayState } from "../dayDisplayState";
import { StateDot } from "../StateDot";
import { STATUS_LABELS } from "../StatePill";
import styles from "./Legend.module.css";

/**
 * `Legend` — the key for the calendar grid + list: one `StateDot` + friendly
 * label per status-vocabulary state (docs/design-system-inventory.md, P1 list —
 * promoted to this effort by issue #43).
 *
 * A plain `<ul>` — no RAC, no interaction. Renders all 4 states in canonical
 * order by default; pass `states` to show a subset. Each dot is decorative; the
 * adjacent text label carries the meaning.
 */
const DEFAULT_ORDER: readonly StatusDisplayState[] = ["resolved", "pending", "at-risk", "closed"];

export interface LegendProps extends Omit<HTMLAttributes<HTMLUListElement>, "children"> {
  /** Which states to show, in order. Default: all 4 in canonical order. */
  states?: readonly StatusDisplayState[];
  /** Dot size — forwarded to `StateDot`. Default `sm`. */
  size?: "sm" | "md";
}

export const Legend = forwardRef<HTMLUListElement, LegendProps>(function Legend(
  { states = DEFAULT_ORDER, size = "sm", className, style, ...props },
  ref,
) {
  return (
    <ul {...props} ref={ref} className={cx(styles.base, className)} style={style}>
      {states.map((state) => (
        <li key={state} className={styles.item}>
          <StateDot state={state} size={size} />
          {STATUS_LABELS[state]}
        </li>
      ))}
    </ul>
  );
});
