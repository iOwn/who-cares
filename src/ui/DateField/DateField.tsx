"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import {
  Calendar,
  CalendarCell,
  CalendarGrid,
  composeRenderProps,
  DateInput,
  DatePicker,
  DateSegment,
  type DateValue,
  FieldError,
  Group,
  Heading,
  Label,
  Popover,
  Button as RACButton,
  type DatePickerProps as RACDatePickerProps,
  Text,
} from "react-aria-components";
import { cx } from "../cx";
import styles from "./DateField.module.css";

/**
 * `DateField` — a single date with a calendar popover
 * (docs/design-system-inventory.md §13). Built on RAC `DatePicker` (a segmented
 * `DateField` + `Calendar` in a `Popover`).
 *
 * This is the fully-worked reference for the `src/ui/` FIELD conventions — the
 * counterpart of `Button` for actions (docs/design-system.md "Worked examples").
 * The patterns every other field primitive (`TextField`, `TextArea`, later
 * `DateRangeField`) follows by analogy:
 *
 *   - CONTROLLED + UNCONTROLLED — both are supported and uncontrolled is the
 *     default (`defaultValue`), per RAC's conventions (docs/design-system.md §6).
 *     Controlled via `value` + `onChange`. Nothing here holds value state.
 *   - PASSTHROUGH — `label` / `description` / `errorMessage` / `isRequired` /
 *     `isOptional` / `isDisabled` are the field-shell props; everything else
 *     (`value`, `defaultValue`, `onChange`, `minValue`, `maxValue`, `name`,
 *     `granularity`, `isReadOnly`, …) flows straight through to RAC `DatePicker`.
 *   - NO VALIDATION LOGIC — the forms boundary (docs/design-system.md §11) keeps
 *     validation + form state with features. `validationBehavior` defaults to
 *     `"aria"` so `isRequired` / `minValue` mark the field via ARIA and render
 *     `errorMessage`, but never block native form submission. A feature that
 *     wants native constraint validation passes `validationBehavior="native"`.
 *     `errorMessage` is whatever copy the feature computed; when it is omitted
 *     RAC's own localized range message shows instead (so `minValue` past-date
 *     blocking still surfaces a message — see DateField.test.tsx).
 *   - POPOVER PORTAL — the `Calendar` lives in a RAC `Popover` that portals to
 *     `<body>`; `DateField.module.css` puts it at `z-index: var(--z-popover)`
 *     so it clears the modal/scrim layer (docs/design-system.md Token model).
 *   - STATE via `&[data-*]` — focus ring (`[data-focus-within]` /
 *     `[data-focus-visible]`), `[data-invalid]`, `[data-disabled]`,
 *     `[data-selected]`, `[data-unavailable]` are all styled in the module,
 *     never with render-prop booleans (docs/design-system.md §1).
 *   - `className` / `style` forward to the `DatePicker` root and merge LAST
 *     (the escape hatch); `ref` forwards to that root `<div>`.
 */

export interface DateFieldProps
  extends Omit<RACDatePickerProps<DateValue>, "className" | "children"> {
  /** Visible field label (rendered as a RAC `<Label>`). */
  label?: ReactNode;
  /** Help text under the field, wired to the input via `aria-describedby`. */
  description?: ReactNode;
  /**
   * Error copy shown when the field is invalid. Feature-computed — the primitive
   * runs no validation. Omit it to fall back to RAC's localized range message.
   */
  errorMessage?: ReactNode;
  /** Appends a muted "optional" hint to the label (display only). */
  isOptional?: boolean;
  /** Forwarded to the `DatePicker` root and merged LAST. RAC's function form is supported. */
  className?: RACDatePickerProps<DateValue>["className"];
  /** Forwarded to the `DatePicker` root and merged LAST (the escape hatch). */
  style?: RACDatePickerProps<DateValue>["style"];
}

export const DateField = forwardRef<HTMLDivElement, DateFieldProps>(function DateField(
  { label, description, errorMessage, isOptional, className, style, ...props },
  ref,
) {
  return (
    <DatePicker
      {...props}
      ref={ref}
      validationBehavior={props.validationBehavior ?? "aria"}
      className={composeRenderProps(className, (resolved) => cx(styles.field, resolved))}
      style={style}
    >
      {label != null && (
        <Label className={styles.label}>
          {label}
          {isOptional && <span className={styles.optional}> — optional</span>}
        </Label>
      )}
      <Group className={styles.group}>
        <DateInput className={styles.input}>
          {(segment) => <DateSegment segment={segment} className={styles.segment} />}
        </DateInput>
        <RACButton className={styles.trigger}>
          <CalendarDays size={18} aria-hidden />
        </RACButton>
      </Group>
      {description != null && (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      )}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
      <Popover className={styles.popover} placement="bottom start">
        <Calendar className={styles.calendar}>
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
        </Calendar>
      </Popover>
    </DatePicker>
  );
});
