"use client";

import { forwardRef, type ReactNode } from "react";
import {
  composeRenderProps,
  FieldError,
  Label,
  TextArea as RACTextArea,
  TextField as RACTextField,
  type TextFieldProps as RACTextFieldProps,
  Text,
} from "react-aria-components";
import { cx } from "../cx";
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
 */

export interface TextAreaProps extends Omit<RACTextFieldProps, "className" | "children"> {
  /** Visible field label (rendered as a RAC `<Label>`). */
  label?: ReactNode;
  /** Help text under the field, wired to the textarea via `aria-describedby`. */
  description?: ReactNode;
  /** Error copy shown when invalid. Feature-computed — the primitive validates nothing. */
  errorMessage?: ReactNode;
  /** Appends a muted "optional" hint to the label (display only). */
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
  return (
    <RACTextField
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
      <RACTextArea className={styles.input} placeholder={placeholder} rows={rows} />
      {description != null && (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      )}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </RACTextField>
  );
});
