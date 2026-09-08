import { type ComponentType, forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "../cx";
import styles from "./EmptyState.module.css";

/**
 * `EmptyState` — the first-paint "nothing here" panel: the list with no notable
 * days, the inbox all-caught-up, the first run with no pattern set
 * (docs/design-system-inventory.md §22). Error UI reuses `Callout tone="danger"`
 * instead — this is only for the benign empty case.
 *
 * A plain `<div>` — no RAC, no interaction. The optional icon is decorative; the
 * `title` carries the message. `action` is a slot for a `Button` / link.
 */
type IconComponent = ComponentType<{
  size?: number | string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Decorative leading icon COMPONENT (`icon={Inbox}`), not an element. */
  icon?: IconComponent;
  /** The message — required. */
  title: ReactNode;
  /** An optional second line. */
  description?: ReactNode;
  /** An optional action affordance (a `Button`, a link). */
  action?: ReactNode;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon: Icon, title, description, action, className, style, ...props },
  ref,
) {
  return (
    <div {...props} ref={ref} className={cx(styles.base, className)} style={style}>
      {Icon != null && (
        <span className={styles.icon} aria-hidden>
          <Icon size={22} aria-hidden />
        </span>
      )}
      <p className={styles.title}>{title}</p>
      {description != null && <p className={styles.description}>{description}</p>}
      {action != null && <div className={styles.action}>{action}</div>}
    </div>
  );
});
