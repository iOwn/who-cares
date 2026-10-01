"use client";

import { Check, ChevronDown } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import {
  ListBox,
  ListBoxItem,
  Popover,
  Button as RACButton,
  Select as RACSelect,
  type SelectProps as RACSelectProps,
  SelectValue,
} from "react-aria-components";
import { FieldShell, fieldRootProps } from "../FieldShell";
import { showOptionalHint } from "../fieldRequirement";
import styles from "./Select.module.css";

/**
 * `Select` — label + a single-choice dropdown + optional hint + error (issue
 * #167). Built on RAC `Select` (`Button` + `Popover` + `ListBox`), the same
 * field conventions `DateField` works through in full (ADR-0011).
 *
 * Added for the household Bundesland picker (`src/app/settings/BundeslandCard`)
 * — the first place `src/ui` needed a plain closed-set dropdown rather than a
 * `ToggleGroup` (too tall for 16 long German state names) or a `DateField`
 * (not a date). `options` is a flat `{ value, label }` list rather than
 * free-form `children`, since every caller so far is exactly that shape; a
 * future caller needing custom item content is a reason to widen this, not a
 * reason to add a second primitive.
 *
 *   - CONTROLLED + UNCONTROLLED, uncontrolled default (`defaultValue`), same
 *     as every other field primitive.
 *   - `value` / `onChange` are `T | null` (RAC's "no selection" `Key`,
 *     narrowed to the option type) — `placeholder` is what renders for `null`,
 *     e.g. "None"; a `Select` wanting a value-less state (unset Bundesland)
 *     needs no separate boolean.
 *   - `label` / `description` / `errorMessage` / `isRequired` / `isOptional` /
 *     `isDisabled` are the field-shell props; `validationBehavior` defaults to
 *     `"aria"` (the forms boundary, docs/design-system.md §11).
 *   - POPOVER PORTAL — the `ListBox` lives in a RAC `Popover` at
 *     `--z-popover`, same as `DateField`'s calendar.
 *   - STATE via `&[data-*]` selectors, never render-prop booleans.
 *   - `className` / `style` merge LAST onto the root; `ref` forwards to it.
 */

export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
}

export interface SelectProps<T extends string>
  extends Omit<
    RACSelectProps<{ id: T; label: ReactNode }>,
    | "className"
    | "children"
    | "items"
    | "selectedKey"
    | "defaultSelectedKey"
    | "onSelectionChange"
    | "onChange"
  > {
  /** Visible field label (rendered as a RAC `<Label>`). */
  label?: ReactNode;
  /** Help text under the field, wired to the control via `aria-describedby`. */
  description?: ReactNode;
  /** Error copy shown when invalid. Feature-computed — the primitive validates nothing. */
  errorMessage?: ReactNode;
  /** Appends a muted "— optional" hint to the label. Mutually exclusive with `isRequired`. */
  isOptional?: boolean;
  /** The choices, in display order. */
  options: readonly SelectOption<T>[];
  /** Selected value (controlled), or `null` for no selection. */
  value?: T | null;
  /** Initially selected value (uncontrolled), or `null` to start unselected. */
  defaultValue?: T | null;
  /** Called with the newly selected value, or `null` when cleared. */
  onChange?: (value: T | null) => void;
  /** Forwarded to the root and merged LAST. RAC's function form is supported. */
  className?: RACSelectProps<{ id: T; label: ReactNode }>["className"];
  /** Forwarded to the root and merged LAST (the escape hatch). */
  style?: RACSelectProps<{ id: T; label: ReactNode }>["style"];
}

/** `Select`'s generic signature needs a manual cast at the `forwardRef` boundary — RAC does the same internally. */
type SelectComponent = <T extends string>(
  props: SelectProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => ReactNode;

export const Select = forwardRef(function Select<T extends string>(
  {
    label,
    description,
    errorMessage,
    isOptional,
    options,
    placeholder,
    value,
    defaultValue,
    onChange,
    className,
    style,
    ...props
  }: SelectProps<T>,
  ref: React.Ref<HTMLDivElement>,
) {
  const optional = showOptionalHint(props.isRequired, isOptional);
  const items = options.map((o) => ({ id: o.value, label: o.label }));

  return (
    <RACSelect
      {...props}
      ref={ref}
      {...fieldRootProps(className, props.validationBehavior, styles.field)}
      style={style}
      placeholder={placeholder}
      selectedKey={value === undefined ? undefined : value}
      defaultSelectedKey={defaultValue ?? undefined}
      onSelectionChange={onChange ? (key) => onChange((key as T | null) ?? null) : undefined}
    >
      <FieldShell
        label={label}
        optional={optional}
        description={description}
        errorMessage={errorMessage}
      >
        <RACButton className={styles.trigger}>
          <SelectValue className={styles.value} />
          <ChevronDown size={16} aria-hidden className={styles.chevron} />
        </RACButton>
      </FieldShell>
      <Popover className={styles.popover} placement="bottom start">
        <ListBox items={items} className={styles.listbox}>
          {(item) => (
            <ListBoxItem id={item.id} textValue={String(item.label)} className={styles.option}>
              <span className={styles.optionLabel}>{item.label}</span>
              <Check size={16} aria-hidden className={styles.check} />
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </RACSelect>
  );
}) as SelectComponent;
