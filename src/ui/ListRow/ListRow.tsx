"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { Button as RACButton } from "react-aria-components";
import { cx } from "../cx";
import styles from "./ListRow.module.css";

/**
 * `ListRow` — a pressable or static row with `Surface`'s `variant="sunken"`
 * treatment (docs/design-system-inventory.md, P1). Composes the sunken
 * background, border, and focus ring.
 *
 * The pressable form is a RAC `Button` when `onPress` is supplied; otherwise
 * a plain `<div>`. Children must stay phrasing content with no interactive
 * descendants, so the pressable form is valid HTML (no `<button>` wrapping
 * block-level content).
 *
 * Layout: a leading content column (children) + an optional trailing slot.
 * The List view puts a `StatePill` in the trailing slot.
 *
 * Pressable Surfaces compose via `ListRow`, not via a pressable path on
 * `Surface` itself — `Surface` stays a plain `<div>` (conventions §5).
 */

export interface ListRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** The main content — must be phrasing content with no interactive descendants. */
  children?: ReactNode;
  /** When set, the row is a pressable RAC `Button` with mandatory focus ring. */
  onPress?: () => void;
  isDisabled?: boolean;
  /** Optional trailing slot (e.g. a `StatePill`). */
  trailing?: ReactNode;
  /** Screen-reader label when pressable. */
  ariaLabel?: string;
}

export const ListRow = forwardRef<HTMLElement, ListRowProps>(function ListRow(
  { children, onPress, isDisabled, trailing, className, style, ariaLabel, id, ...props },
  ref,
) {
  const classes = cx(styles.base, className);

  if (onPress) {
    return (
      <RACButton
        ref={ref as React.Ref<HTMLButtonElement>}
        onPress={onPress}
        isDisabled={isDisabled}
        aria-label={ariaLabel}
        id={id}
        className={cx(classes, styles.pressable)}
        style={style}
      >
        {children && <span className={styles.content}>{children}</span>}
        {trailing && <span className={styles.trailing}>{trailing}</span>}
      </RACButton>
    );
  }

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      id={id}
      className={classes}
      style={style}
      {...props}
    >
      {children && <span className={styles.content}>{children}</span>}
      {trailing && <span className={styles.trailing}>{trailing}</span>}
    </div>
  );
});
