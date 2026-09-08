"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ReactNode } from "react";
import {
  composeRenderProps,
  Button as RACButton,
  type ButtonProps as RACButtonProps,
} from "react-aria-components";
import { cx } from "../cx";
import styles from "./IconButton.module.css";

/**
 * `IconButton` — an icon-only action with a REQUIRED `aria-label`
 * (docs/design-system-inventory.md §2). Built on RAC `Button`, same press /
 * focus-ring / motion contract as `Button`. `children` is the icon element
 * (`<Bell size={18} aria-hidden />`); the accessible name comes from
 * `aria-label`, never the glyph.
 */
const iconButton = cva(styles.base, {
  variants: {
    variant: {
      secondary: styles.secondary,
      ghost: styles.ghost,
    },
    size: {
      sm: styles.sizeSm,
      md: styles.sizeMd,
    },
  },
  defaultVariants: {
    variant: "secondary",
    size: "md",
  },
});

export interface IconButtonProps
  extends Omit<RACButtonProps, "className" | "children" | "aria-label">,
    VariantProps<typeof iconButton> {
  /** REQUIRED — the accessible name (the icon itself is `aria-hidden`). */
  "aria-label": string;
  /** The icon element, e.g. `<Bell size={18} aria-hidden />`. */
  children: ReactNode;
  /** Forwarded to the `<button>` and merged LAST. */
  className?: RACButtonProps["className"];
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant, size, className, ...props },
  ref,
) {
  return (
    <RACButton
      {...props}
      ref={ref}
      className={composeRenderProps(className, (resolved) =>
        cx(iconButton({ variant, size }), resolved),
      )}
    />
  );
});
