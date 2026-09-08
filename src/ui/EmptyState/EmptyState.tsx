import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "../cx";
import type { IconComponent } from "../icon";
import styles from "./EmptyState.module.css";

/**
 * `EmptyState` — the first-paint "nothing here" panel: the list with no notable
 * days, the inbox all-caught-up, the first run with no pattern set
 * (docs/design-system-inventory.md §22). Error UI reuses `Callout tone="danger"`
 * instead — this is only for the benign empty case.
 *
 * A plain `<div>` — no RAC, no interaction. The optional icon is decorative; the
 * `title` renders as a real heading (`h2`–`h4` via `level`) so it lands in the
 * document outline for screen-reader navigation. `action` is a slot for a
 * `Button` / link.
 */
export interface EmptyStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "children"> {
  /** Decorative leading icon COMPONENT (`icon={Inbox}`), not an element. */
  icon?: IconComponent;
  /** The message — required. Renders as the heading. */
  title: ReactNode;
  /** Heading level for `title` → element (`h2`–`h4`). Default 2. */
  level?: 2 | 3 | 4;
  /** An optional second line. */
  description?: ReactNode;
  /** An optional action affordance (a `Button`, a link). */
  action?: ReactNode;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon: Icon, title, level = 2, description, action, className, style, ...props },
  ref,
) {
  const Heading = `h${level}` as const;
  return (
    <div {...props} ref={ref} className={cx(styles.base, className)} style={style}>
      {Icon != null && (
        <span className={styles.icon} aria-hidden>
          <Icon size={22} aria-hidden />
        </span>
      )}
      <Heading className={styles.title}>{title}</Heading>
      {description != null && <p className={styles.description}>{description}</p>}
      {action != null && <div className={styles.action}>{action}</div>}
    </div>
  );
});
