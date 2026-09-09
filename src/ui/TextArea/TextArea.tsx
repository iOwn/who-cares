"use client";

import { forwardRef, type ReactNode } from "react";
import {
  TextArea as RACTextArea,
  TextField as RACTextField,
  type TextFieldProps as RACTextFieldProps,
} from "react-aria-components";
import { FieldShell, fieldRootProps } from "../FieldShell";
import { showOptionalHint } from "../fieldRequirement";
import styles from "./TextArea.module.css";

/**
 * `TextArea` — the same field shell as `TextField`, multi-line (the "Note" field)
 * (docs/design-system-inventory.md §12). Built on RAC `TextField` + `TextArea`
 * so it shares the label / description / error / `aria-describedby` wiring.
 *
 * Follows the field conventions worked in full in `DateField`: controlled +
 * uncontrolled (uncontrolled default, `defaultValue`); `label` / `description` /
 * `errorMessage` / `isRequired` / `isOptional` / `isDisabled` as the field-shell
 * props, everything else flowing through to RAC; `placeholder` / `rows` land on
 * the `<textarea>`. No validation logic (`validationBehavior` defaults to
 * `"aria"` — forms boundary, docs/design-system.md §11). CSS `resize: vertical`
 * only; no JS auto-grow in v1. State via `&[data-*]`; `className` / `style` merge
 * LAST onto the root; `ref` forwards to the root `<div>`.
 *
 * `isRequired` / `isOptional` — see `../fieldRequirement`: only optional fields
 * carry a visible marker ("— optional"); the two props are mutually exclusive.
 *
 * The label / optional / description / error shell and the
 * `validationBehavior` / `composeRenderProps` root wiring are shared with
 * `TextField` / `DateField` via `../FieldShell` (issue #74).
 */

export interface TextAreaProps extends Omit<RACTextFieldProps, "className" | "children"> {
  /** Visible field label (rendered as a RAC `<Label>`). */
  label?: ReactNode;
  /** Help text under the field, wired to the textarea via `aria-describedby`. */
  description?: ReactNode;
  /** Error copy shown when invalid. Feature-computed — the primitive validates nothing. */
  errorMessage?: ReactNode;
  /**
   * Appends a muted "— optional" hint to the label (display only). Mutually
   * exclusive with `isRequired` (dev-warns; `isRequired` wins).
   */
  isOptional?: boolean;
  /** Placeholder text — forwarded to the `<textarea>`. */
  placeholder?: string;
  /** Visible rows — forwarded to the `<textarea>` (default 3). */
  rows?: number;
  /** Forwarded to the root and merged LAST. RAC's function form is supported. */
  className?: RACTextFieldProps["className"];
  /** Forwarded to the root and merged LAST (the escape hatch). */
  style?: RACTextFieldProps["style"];
}

export const TextArea = forwardRef<HTMLDivElement, TextAreaProps>(function TextArea(
  {
    label,
    description,
    errorMessage,
    isOptional,
    placeholder,
    rows = 3,
    className,
    style,
    ...props
  },
  ref,
) {
  const optional = showOptionalHint(props.isRequired, isOptional);
  return (
    <RACTextField
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
        <RACTextArea className={styles.input} placeholder={placeholder} rows={rows} />
      </FieldShell>
    </RACTextField>
  );
});
