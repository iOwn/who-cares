import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cx } from "../cx";
import type { StatusDisplayState } from "../dayDisplayState";
import styles from "./StateDot.module.css";

/**
 * `StateDot` — a bare coloured circle in the status vocabulary: `Legend`, the
 * at-risk nudge `Callout`, inline runs of text (docs/design-system-inventory.md
 * §6).
 *
 * A plain `<span>` — no RAC, no interaction state. Decorative by default
 * (`aria-hidden`); pass `label` when the dot is the *only* carrier of meaning
 * and it becomes `role="img"` with that accessible name.
 */
const dot = cva(styles.base, {
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

export interface StateDotProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children">,
    Omit<VariantProps<typeof dot>, "state"> {
  /** One of the 4 status-vocabulary states. */
  state: StatusDisplayState;
  /** When set, the dot is exposed to assistive tech under this name; otherwise decorative. */
  label?: string;
}

export const StateDot = forwardRef<HTMLSpanElement, StateDotProps>(function StateDot(
  { state, size, label, className, style, ...props },
  ref,
) {
  const classes = cx(dot({ state, size }), className);
  if (label) {
    return (
      <span {...props} ref={ref} className={classes} style={style} role="img" aria-label={label} />
    );
  }
  return <span {...props} ref={ref} className={classes} style={style} aria-hidden />;
});
