import { forwardRef, type HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./ActionBar.module.css";

/**
 * `ActionBar` — sticky bottom container for a full-width primary action
 * (docs/design-system-inventory.md §20). ImOut, Recurring, Settings forms.
 *
 * A plain `<div>` — no RAC, no interaction of its own. `children` is
 * typically a single full-width `Button`. A gradient fade-in above the bar
 * signals scrollable content underneath, rather than a hard border.
 */
export interface ActionBarProps extends HTMLAttributes<HTMLDivElement> {}

export const ActionBar = forwardRef<HTMLDivElement, ActionBarProps>(function ActionBar(
  { className, style, children, ...props },
  ref,
) {
  return (
    <div {...props} ref={ref} className={cx(styles.base, className)} style={style}>
      {children}
    </div>
  );
});
