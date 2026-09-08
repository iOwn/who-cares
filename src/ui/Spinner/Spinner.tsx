import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Spinner.module.css";

/**
 * `Spinner` — the inline / block loading indicator: the calendar month load, the
 * inbox load (docs/design-system-inventory.md §21).
 *
 * A plain `<span role="status">` — no RAC. The spinning ring is decorative; the
 * accessible name comes from a visually-hidden label (default "Loading"). Pass
 * `label=""` to silence it when a parent region already announces the loading
 * state. The rotation is gated on `prefers-reduced-motion` — under that query
 * the ring is a static partial circle and the `role="status"` label still
 * conveys the state.
 */
const ring = cva(styles.ring, {
  variants: {
    size: {
      sm: styles.sizeSm,
      md: styles.sizeMd,
      lg: styles.sizeLg,
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export interface SpinnerProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children">,
    VariantProps<typeof ring> {
  /** Visually-hidden label announced to assistive tech. Default "Loading"; `""` silences it. */
  label?: string;
}

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size, label = "Loading", className, style, ...props },
  ref,
) {
  return (
    <span {...props} ref={ref} className={cx(styles.base, className)} style={style} role="status">
      <span className={ring({ size })} aria-hidden />
      {label ? <span className={styles.srOnly}>{label}</span> : null}
    </span>
  );
});
