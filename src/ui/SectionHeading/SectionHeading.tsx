import { forwardRef, type HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./SectionHeading.module.css";

/**
 * `SectionHeading` — the uppercase, letter-spaced, muted eyebrow above a group:
 * "This week" (list), "Waiting on you" (inbox), "Closures" (settings)
 * (docs/design-system-inventory.md §17).
 *
 * A real heading element — no RAC, no interaction. `level` picks `h2`–`h4` so
 * the document outline stays correct; this is semantic-level selection, not the
 * banned `as` polymorphism (docs/design-system.md §5) — the element is always a
 * heading.
 */
export interface SectionHeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Heading level → element (`h2`–`h4`). Default 2. */
  level?: 2 | 3 | 4;
}

export const SectionHeading = forwardRef<HTMLHeadingElement, SectionHeadingProps>(
  function SectionHeading({ level = 2, className, style, children, ...props }, ref) {
    const Tag = `h${level}` as const;
    return (
      <Tag {...props} ref={ref} className={cx(styles.base, className)} style={style}>
        {children}
      </Tag>
    );
  },
);
