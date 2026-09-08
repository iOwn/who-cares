"use client";

import { forwardRef, type ReactNode } from "react";
import {
  composeRenderProps,
  ToggleButton as RACToggleButton,
  ToggleButtonGroup as RACToggleButtonGroup,
  type ToggleButtonGroupProps as RACToggleButtonGroupProps,
  type ToggleButtonProps as RACToggleButtonProps,
} from "react-aria-components";
import { cx } from "../cx";
import styles from "./ToggleGroup.module.css";

/**
 * `ToggleGroup` — a generic multi- or single-select key row
 * (docs/design-system-inventory.md §14). The P1 `WeekdayPicker` wraps this.
 *
 * Built on RAC `ToggleButtonGroup` + `ToggleButton` — arrow-key navigation
 * comes from RAC (a `toolbar` for `selectionMode="multiple"`, a `radiogroup`
 * with a roving tabindex for `"single"`). Not in the ADR-0009 component-test
 * tier (no P0 v1 instance): it ships with stories only.
 *
 * `SegmentedControl` is the sibling primitive for the exclusive, tab-like case.
 *
 * The scalar-array `value` / `onChange` here wrap RAC's `Set<Key>` selection
 * API. Uncontrolled by default (`defaultValue`); controlled via `value` +
 * `onChange` (docs/design-system.md §6). State is styled via the
 * `&[data-selected]` / `&[data-focus-visible]` attributes RAC emits (§1).
 */
export interface ToggleGroupProps
  extends Pick<
    RACToggleButtonGroupProps,
    | "selectionMode"
    | "disallowEmptySelection"
    | "isDisabled"
    | "orientation"
    | "aria-label"
    | "aria-labelledby"
    | "style"
  > {
  /** Selected values (controlled). */
  value?: string[];
  /** Initially selected values (uncontrolled). */
  defaultValue?: string[];
  /** Called with the full selected-value array on any change. */
  onChange?: (value: string[]) => void;
  /** `ToggleGroup.Item`s. */
  children: ReactNode;
  /** Forwarded to the group element and merged LAST. RAC's function form is supported. */
  className?: RACToggleButtonGroupProps["className"];
}

interface ToggleGroupComponent
  extends React.ForwardRefExoticComponent<ToggleGroupProps & React.RefAttributes<HTMLDivElement>> {
  Item: typeof ToggleGroupItem;
}

const ToggleGroupRoot = forwardRef<HTMLDivElement, ToggleGroupProps>(function ToggleGroup(
  { selectionMode = "multiple", value, defaultValue, onChange, className, children, ...props },
  ref,
) {
  return (
    <RACToggleButtonGroup
      {...props}
      ref={ref}
      selectionMode={selectionMode}
      selectedKeys={value}
      defaultSelectedKeys={defaultValue}
      onSelectionChange={
        onChange ? (keys) => onChange([...keys].map((key) => String(key))) : undefined
      }
      className={composeRenderProps(className, (resolved) => cx(styles.group, resolved))}
    >
      {children}
    </RACToggleButtonGroup>
  );
});

export interface ToggleGroupItemProps extends Pick<RACToggleButtonProps, "isDisabled" | "style"> {
  /**
   * The item's identifier in the group selection. RAC uses `id` purely as the
   * `selectedKeys` key for a grouped `ToggleButton` and strips it from the
   * rendered `<button>` (verified: two groups sharing item values emit zero
   * `id` attributes) — so this is NOT a global DOM id and cannot collide.
   */
  value: string;
  /** The item label — also its accessible name. */
  children: ReactNode;
  /** Forwarded to the item element and merged LAST. RAC's function form is supported. */
  className?: RACToggleButtonProps["className"];
}

const ToggleGroupItem = forwardRef<HTMLButtonElement, ToggleGroupItemProps>(
  function ToggleGroupItem({ value, className, ...props }, ref) {
    return (
      <RACToggleButton
        {...props}
        ref={ref}
        id={value}
        className={composeRenderProps(className, (resolved) => cx(styles.item, resolved))}
      />
    );
  },
);

export const ToggleGroup = Object.assign(ToggleGroupRoot as ToggleGroupComponent, {
  Item: ToggleGroupItem,
});
