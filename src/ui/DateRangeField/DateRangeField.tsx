"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import {
  CalendarCell,
  CalendarGrid,
  DateInput,
  DateRangePicker,
  DateSegment,
  type DateValue,
  Group,
  Heading,
  Popover,
  Button as RACButton,
  type DateRangePickerProps as RACDateRangePickerProps,
  RangeCalendar,
} from "react-aria-components";
import { FieldShell, fieldRootProps } from "../FieldShell";
import { showOptionalHint } from "../fieldRequirement";
import styles from "./DateRangeField.module.css";

/**
 * `DateRangeField` — a start–end date range with a shared calendar popover
 * (docs/design-system-inventory.md P1). Built on RAC `DateRangePicker` +
 * `RangeCalendar` — the headless range picker ADR-0011 picked React Aria for,
 * specifically to carry the "+ I'm out" 4-week booking cap.
 *
 * It follows `DateField`'s FIELD conventions exactly (that file is the worked
 * reference): controlled + uncontrolled (uncontrolled default), a
 * `label` / `description` / `errorMessage` / `isOptional` shell with everything
 * else — `value`, `defaultValue`, `onChange`, `minValue`, `maxValue`, `name`,
 * `isDisabled` … — flowing straight through to RAC, `validationBehavior`
 * defaulting to `"aria"` (no validation logic in the primitive), and
 * `className` / `style` / `ref` forwarding to the picker root and merging LAST.
 *
 * Two things RAC handles for us that the feature relies on:
 *   - `maxValue` caps the calendar: days past it are `aria-disabled` and paging
 *     forward stops — this is the 4-week cap.
 *   - an end segment before the start segment marks the field `data-invalid`
 *     and surfaces `errorMessage` — no cross-field code in the feature.
 */

export interface DateRangeFieldProps
  extends Omit<RACDateRangePickerProps<DateValue>, "className" | "children"> {
  /** Visible field label (rendered as a RAC `<Label>`). */
  label?: ReactNode;
  /** Help text under the field, wired to the input via `aria-describedby`. */
  description?: ReactNode;
  /**
   * Error copy shown when the field is invalid (end-before-start, out of
   * `min`/`max`). Feature-computed — the primitive runs no validation. Omit it
   * to fall back to RAC's localized message.
   */
  errorMessage?: ReactNode;
  /**
   * Appends a muted "— optional" hint to the label (display only). Mutually
   * exclusive with `isRequired` (dev-warns; `isRequired` wins).
   */
  isOptional?: boolean;
  /** Forwarded to the `DateRangePicker` root and merged LAST. RAC's function form is supported. */
  className?: RACDateRangePickerProps<DateValue>["className"];
  /** Forwarded to the `DateRangePicker` root and merged LAST (the escape hatch). */
  style?: RACDateRangePickerProps<DateValue>["style"];
}

export const DateRangeField = forwardRef<HTMLDivElement, DateRangeFieldProps>(
  function DateRangeField(
    { label, description, errorMessage, isOptional, className, style, ...props },
    ref,
  ) {
    const optional = showOptionalHint(props.isRequired, isOptional);
    return (
      <DateRangePicker
        {...props}
        ref={ref}
        {...fieldRootProps(className, props.validationBehavior, styles.field)}
        style={style}
      >
        <FieldShell
          label={label}
          optional={optional}
          description={description}
          errorMessage={errorMessage}
        >
          <Group className={styles.group}>
            <DateInput slot="start" className={styles.input}>
              {(segment) => <DateSegment segment={segment} className={styles.segment} />}
            </DateInput>
            <span aria-hidden className={styles.dash}>
              –
            </span>
            <DateInput slot="end" className={styles.input}>
              {(segment) => <DateSegment segment={segment} className={styles.segment} />}
            </DateInput>
            <RACButton className={styles.trigger}>
              <CalendarDays size={18} aria-hidden />
            </RACButton>
          </Group>
        </FieldShell>
        <Popover className={styles.popover} placement="bottom start">
          <RangeCalendar className={styles.calendar}>
            <header className={styles.calendarHeader}>
              <RACButton slot="previous" className={styles.navButton}>
                <ChevronLeft size={16} aria-hidden />
              </RACButton>
              <Heading className={styles.calendarTitle} />
              <RACButton slot="next" className={styles.navButton}>
                <ChevronRight size={16} aria-hidden />
              </RACButton>
            </header>
            <CalendarGrid className={styles.grid}>
              {(date) => <CalendarCell date={date} className={styles.cell} />}
            </CalendarGrid>
          </RangeCalendar>
        </Popover>
      </DateRangePicker>
    );
  },
);
