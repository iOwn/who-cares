"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ReactNode } from "react";
import {
  composeRenderProps,
  Button as RACButton,
  type ButtonProps as RACButtonProps,
} from "react-aria-components";
import { cx } from "../cx";
import styles from "./Button.module.css";

/**
 * `Button` — every non-icon action (docs/design-system-inventory.md §1). This is
 * the fully-worked reference primitive for the `src/ui/` authoring conventions:
 *
 *   - `cva` maps the prop-driven axes (`variant` / `tone` / `size` /
 *     `isFullWidth`) to IMPORTED CSS-Module class references — never string
 *     literals (docs/design-system.md §1).
 *   - interaction STATE (`hover` / `pressed` / `focus-visible` / `disabled`) is
 *     styled in Button.module.css via the `&[data-*]` attributes RAC emits —
 *     not in `cva`, not with render-prop booleans.
 *   - `className` / `style` are forwarded AND merged LAST (the caller's value is
 *     the escape hatch); `ref` forwards to the `<button>` root.
 *   - the mandatory `[data-focus-visible]` ring and the shared press affordance
 *     live in Button.module.css (see the "press recipe" note in src/ui/mixins.css).
 */

/**
 * `tone` recolours; `variant` restructures — `Button` has both (docs/design-system.md
 * §8). In v1 `tone` is realised only for `ghost` / `secondary` (a red "Remove"
 * that is not a full `destructive`, an accent "Review ›"); `neutral` / `info` /
 * `success` are accepted for lexicon consistency but are no-ops here.
 */
const button = cva(styles.base, {
  variants: {
    variant: {
      primary: styles.primary,
      secondary: styles.secondary,
      ghost: styles.ghost,
      destructive: styles.destructive,
      dashed: styles.dashed,
    },
    tone: {
      neutral: null,
      accent: styles.toneAccent,
      danger: styles.toneDanger,
      info: null,
      success: null,
    },
    size: {
      sm: styles.sizeSm,
      md: styles.sizeMd,
    },
    isFullWidth: {
      true: styles.fullWidth,
    },
  },
  defaultVariants: {
    variant: "primary",
    tone: "neutral",
    size: "md",
  },
});

export interface ButtonProps
  extends Omit<RACButtonProps, "className" | "children">,
    VariantProps<typeof button> {
  children?: ReactNode;
  /** Forwarded to the `<button>` and merged LAST. RAC's function form is supported. */
  className?: RACButtonProps["className"];
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, tone, size, isFullWidth, className, ...props },
  ref,
) {
  return (
    <RACButton
      {...props}
      ref={ref}
      className={composeRenderProps(className, (resolved) =>
        cx(button({ variant, tone, size, isFullWidth }), resolved),
      )}
    />
  );
});
