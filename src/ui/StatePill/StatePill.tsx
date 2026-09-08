import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "../cx";
import { STATUS_LABELS, type StatusDisplayState } from "../dayDisplayState";
import styles from "./StatePill.module.css";

/**
 * `StatePill` — a coloured dot + label with a tinted background: list rows, the
 * day-detail header (docs/design-system-inventory.md §5). Speaks the 4-state
 * status vocabulary (`resolved | pending | at-risk | closed`), the meaningful
 * subset of `dayDisplayState()`'s output.
 *
 * A plain `<span>` — no interaction state, no RAC, no `'use client'`. `state`
 * recolours via `cva` → imported class refs; the friendly label is derived
 * unless `children` overrides it. The leading dot is decorative
 * (`aria-hidden`) — the label carries the meaning.
 */
const pill = cva(styles.base, {
  variants: {
    state: {
      resolved: styles.resolved,
      pending: styles.pending,
      "at-risk": styles.atRisk,
      closed: styles.closed,
    },
    size: {
      sm: styles.sizeSm,
      md: styles.sizeMd,
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export interface StatePillProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children">,
    Omit<VariantProps<typeof pill>, "state"> {
  /** One of the 4 status-vocabulary states. */
  state: StatusDisplayState;
  /** Label override — defaults to the friendly label for `state`. */
  children?: ReactNode;
}

export const StatePill = forwardRef<HTMLSpanElement, StatePillProps>(function StatePill(
  { state, size, children, className, style, ...props },
  ref,
) {
  return (
    <span {...props} ref={ref} className={cx(pill({ state, size }), className)} style={style}>
      <span className={styles.dot} aria-hidden />
      {children ?? STATUS_LABELS[state]}
    </span>
  );
});
