import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Surface.module.css";

/**
 * `Surface` — the bordered container ("card / tile"): inbox cards, list rows,
 * settings closure rows, the day-detail sheet body
 * (docs/design-system-inventory.md §4).
 *
 * Deliberately minimal: a plain `<div>`, no interaction behaviour, no `as` prop
 * (docs/design-system.md §5 bans `as` / `asChild` — a feature that needs a
 * different element, e.g. a `<li>` in a list, wraps or nests its own).
 * Pressable rows are `Surface` + a nested link / `Button`, not a pressable
 * Surface. No `'use client'` — it imports no RAC.
 */
const surface = cva(styles.base, {
  variants: {
    variant: {
      default: styles.default,
      sunken: styles.sunken,
      danger: styles.danger,
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface SurfaceProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof surface> {}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { variant, className, ...props },
  ref,
) {
  return <div {...props} ref={ref} className={cx(surface({ variant }), className)} />;
});
