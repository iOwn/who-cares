"use client";

import { type ComponentType, forwardRef, type ReactNode } from "react";
import {
  composeRenderProps,
  Button as RACButton,
  type ButtonProps as RACButtonProps,
} from "react-aria-components";
import { cx } from "../cx";
import styles from "./FAB.module.css";

/**
 * `FAB` — the floating "I'm out" action (docs/design-system-inventory.md §3).
 *
 * This primitive OWNS the amber `--color-highlight` role — it is the only place
 * that colour appears in the library. Both a label (`children`) and a leading
 * `icon` are REQUIRED.
 *
 * Positioning is FEATURE-OWNED: the calendar decides where the FAB sits (it is
 * not `position: fixed` here). It ships with `--z-fab` so a feature that does
 * position it stacks correctly without reaching for a raw z-index.
 */
export interface FABProps extends Omit<RACButtonProps, "className" | "children"> {
  /** Leading icon COMPONENT (not an element, not a string) — e.g. `icon={Plus}`. */
  icon: ComponentType<{ size?: number | string; "aria-hidden"?: boolean | "true" | "false" }>;
  /** The visible label — also the accessible name. */
  children: ReactNode;
  /** Forwarded to the `<button>` and merged LAST. */
  className?: RACButtonProps["className"];
}

export const FAB = forwardRef<HTMLButtonElement, FABProps>(function FAB(
  { icon: Icon, children, className, ...props },
  ref,
) {
  return (
    <RACButton
      {...props}
      ref={ref}
      className={composeRenderProps(className, (resolved) => cx(styles.base, resolved))}
    >
      <Icon size={18} aria-hidden />
      <span className={styles.label}>{children}</span>
    </RACButton>
  );
});
