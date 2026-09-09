"use client";

import { forwardRef } from "react";
import type { Weekday } from "@/domain";
import { ToggleGroup } from "../ToggleGroup";
import { VisuallyHidden } from "../VisuallyHidden";

/**
 * `WeekdayPicker` — `ToggleGroup` specialised to weekday keys with a
 * weekday-typed value (docs/design-system-inventory.md, P1). Used by the
 * childcare-pattern editor (Settings) and the Recurring absence form.
 *
 * Per SPEC.md there is no saved "usual days" preference — the Recurring form
 * passes no `defaultValue` and it starts blank; Settings drives it controlled
 * from the household's current pattern.
 *
 * The single-letter key is `aria-hidden`; the full weekday name is the
 * accessible label. `'use client'` — `ToggleGroup` imports RAC.
 */

const KEY_LABEL: Record<Weekday, string> = {
  mon: "M",
  tue: "T",
  wed: "W",
  thu: "T",
  fri: "F",
  sat: "S",
  sun: "S",
};

const FULL_LABEL: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** Default keys: the working week (the childcare pattern is normally weekdays). */
export const DEFAULT_WEEKDAYS: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri"];

export interface WeekdayPickerProps {
  /** Selected weekdays (controlled). */
  value?: readonly Weekday[];
  /** Initially selected weekdays (uncontrolled). Omit to start blank. */
  defaultValue?: readonly Weekday[];
  /** Called with the selected weekdays, in `days` order. */
  onChange?: (value: Weekday[]) => void;
  /** Which weekday keys to show, in order. Default: Mon–Fri. */
  days?: readonly Weekday[];
  isDisabled?: boolean;
  /** Accessible name for the group. */
  "aria-label"?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const WeekdayPicker = forwardRef<HTMLDivElement, WeekdayPickerProps>(function WeekdayPicker(
  {
    value,
    defaultValue,
    onChange,
    days = DEFAULT_WEEKDAYS,
    isDisabled,
    "aria-label": ariaLabel = "Weekdays",
    className,
    style,
  },
  ref,
) {
  return (
    <ToggleGroup
      ref={ref}
      selectionMode="multiple"
      aria-label={ariaLabel}
      isDisabled={isDisabled}
      className={className}
      style={style}
      value={value ? [...value] : undefined}
      defaultValue={defaultValue ? [...defaultValue] : undefined}
      onChange={
        onChange ? (selected) => onChange(days.filter((day) => selected.includes(day))) : undefined
      }
    >
      {days.map((day) => (
        <ToggleGroup.Item key={day} value={day}>
          <VisuallyHidden>{FULL_LABEL[day]}</VisuallyHidden>
          <span aria-hidden>{KEY_LABEL[day]}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup>
  );
});
