"use client";

import { forwardRef, type ReactNode } from "react";
import {
  composeRenderProps,
  Radio as RACRadio,
  RadioGroup as RACRadioGroup,
  type RadioGroupProps as RACRadioGroupProps,
  type RadioProps as RACRadioProps,
} from "react-aria-components";
import { cx } from "../cx";
import styles from "./SegmentedControl.module.css";

/**
 * `SegmentedControl` — 2–n mutually-exclusive segments (Grid / List, One-off /
 * Recurring); docs/design-system-inventory.md §10.
 *
 * Built on RAC `RadioGroup` + `Radio`: that is the WAI-ARIA radio-group pattern,
 * so we get the `radiogroup` / `radio` roles, a true roving tabindex (only the
 * selected segment is tab-focusable), and arrow-key navigation that moves focus
 * AND selection — all asserted in SegmentedControl.test.tsx.
 *
 * `ToggleGroup` is the sibling primitive for the multi-select / non-exclusive
 * case (weekday keys) — see src/ui/ToggleGroup.
 *
 * Uncontrolled by default (`defaultValue`); controlled via `value` + `onChange`
 * (docs/design-system.md §6). State is styled in the CSS Module via the
 * `&[data-selected]` / `&[data-focus-visible]` attributes RAC emits — never
 * render-prop booleans (§1).
 *
 * NOTE: RAC 1.21 marks the self-contained `Radio` `@deprecated` in favour of
 * `RadioField` + `RadioButton` (which wraps each option in an extra element).
 * `Radio` is not removed and keeps the segment DOM flat, so we stay on it for
 * now — migration tracked in iOwn/who-cares#73.
 */
export interface SegmentedControlProps
  extends Pick<
    RACRadioGroupProps,
    | "value"
    | "defaultValue"
    | "onChange"
    | "isDisabled"
    | "name"
    | "aria-label"
    | "aria-labelledby"
    | "style"
  > {
  /** `SegmentedControl.Item`s. */
  children: ReactNode;
  /** Forwarded to the group element and merged LAST. RAC's function form is supported. */
  className?: RACRadioGroupProps["className"];
}

interface SegmentedControlComponent
  extends React.ForwardRefExoticComponent<
    SegmentedControlProps & React.RefAttributes<HTMLDivElement>
  > {
  Item: typeof SegmentedControlItem;
}

const SegmentedControlRoot = forwardRef<HTMLDivElement, SegmentedControlProps>(
  function SegmentedControl({ className, children, ...props }, ref) {
    return (
      <RACRadioGroup
        {...props}
        ref={ref}
        orientation="horizontal"
        className={composeRenderProps(className, (resolved) => cx(styles.group, resolved))}
      >
        {children}
      </RACRadioGroup>
    );
  },
);

export interface SegmentedControlItemProps
  extends Pick<RACRadioProps, "value" | "isDisabled" | "style"> {
  /** The segment label — also its accessible name. */
  children: ReactNode;
  /** Forwarded to the segment element and merged LAST. RAC's function form is supported. */
  className?: RACRadioProps["className"];
}

const SegmentedControlItem = forwardRef<HTMLLabelElement, SegmentedControlItemProps>(
  function SegmentedControlItem({ className, ...props }, ref) {
    return (
      <RACRadio
        {...props}
        ref={ref}
        className={composeRenderProps(className, (resolved) => cx(styles.item, resolved))}
      />
    );
  },
);

export const SegmentedControl = Object.assign(SegmentedControlRoot as SegmentedControlComponent, {
  Item: SegmentedControlItem,
});
