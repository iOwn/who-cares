import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { Avatar } from "../Avatar";
import { cx } from "../cx";
import styles from "./PersonChip.module.css";

/**
 * `PersonChip` — an `Avatar` + name in a bordered pill: the "Who's out" field on
 * the absence forms (docs/design-system-inventory.md §16).
 *
 * DISPLAY-ONLY in v1 — it shows the filer; the other member may be *shown* but
 * is never editable, so there is no remove affordance, no `onPress`, no RAC. A
 * plain `<span>`. The `Avatar` is decorative (`aria-hidden`) because the name is
 * right next to it as text.
 */
const chip = cva(styles.base, {
  variants: {
    size: {
      sm: styles.sizeSm,
      md: styles.sizeMd,
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export interface PersonChipProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children">,
    VariantProps<typeof chip> {
  /** The member's name. */
  name: string;
  /** Marks this person as the current user — renders "{name} (you)". */
  isYou?: boolean;
}

export const PersonChip = forwardRef<HTMLSpanElement, PersonChipProps>(function PersonChip(
  { name, isYou, size, className, style, ...props },
  ref,
) {
  return (
    <span {...props} ref={ref} className={cx(chip({ size }), className)} style={style}>
      <Avatar name={name} size={size === "sm" ? "sm" : "md"} aria-hidden />
      <span className={styles.name}>
        {name}
        {isYou ? <span className={styles.you}> (you)</span> : null}
      </span>
    </span>
  );
});
