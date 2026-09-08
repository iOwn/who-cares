import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Avatar.module.css";

/**
 * `Avatar` — a member's initial (docs/design-system-inventory.md §15).
 *
 * MONOCHROME by design: an ink initial on `--color-accent-surface`, the SAME
 * for every member — there is no per-member colour in v1 (the inventory calls
 * this out explicitly). A plain `<span>`, no RAC.
 *
 * By default it is exposed to assistive tech as `role="img"` labelled with
 * `name`. Pass `aria-hidden` when a sibling already shows the name as text — as
 * `PersonChip` does.
 */
const avatar = cva(styles.base, {
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

export interface AvatarProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children">,
    VariantProps<typeof avatar> {
  /** The member's name — the initial is derived from it, and it is the accessible name. */
  name: string;
}

function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { name, size, className, style, "aria-hidden": ariaHidden, ...props },
  ref,
) {
  const classes = cx(avatar({ size }), className);
  if (ariaHidden) {
    return (
      <span {...props} ref={ref} className={classes} style={style} aria-hidden>
        {initial(name)}
      </span>
    );
  }
  return (
    <span {...props} ref={ref} className={classes} style={style} role="img" aria-label={name}>
      <span aria-hidden>{initial(name)}</span>
    </span>
  );
});
