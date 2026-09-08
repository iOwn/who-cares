"use client";

import { forwardRef, type ReactNode } from "react";
import {
  composeRenderProps,
  FieldError,
  Input,
  Label,
  TextField as RACTextField,
  type TextFieldProps as RACTextFieldProps,
  Text,
} from "react-aria-components";
import { cx } from "../cx";
import { showOptionalHint } from "../fieldRequirement";
import styles from "./TextField.module.css";

/**
 * `TextField` — label + single-line input + optional hint + error
 * (docs/design-system-inventory.md §11). Built on RAC `TextField` + `Input`.
 *
 * Follows the field conventions worked in full in `DateField` — controlled +
 * uncontrolled (uncontrolled default, `defaultValue`); `label` / `description` /
 * `errorMessage` / `isRequired` / `isOptional` / `isDisabled` as the field-shell
 * props with everything else (`value`, `onChange`, `type`, `name`, `maxLength`,
 * `autoComplete`, …) flowing through to RAC. `placeholder` lands on the `<Input>`
 * (RAC's `TextField` omits it). No validation logic — `validationBehavior`
 * defaults to `"aria"` (forms boundary, docs/design-system.md §11). State is
 * styled via `&[data-*]` selectors in the module; `className` / `style` merge
 * LAST onto the root; `ref` forwards to the root `<div>`.
 *
 * `isRequired` / `isOptional` — see `../fieldRequirement`: only optional fields
 * carry a visible marker ("— optional"); the two props are mutually exclusive.
 */

export interface TextFieldProps extends Omit<RACTextFieldProps, "className" | "children"> {
  /** Visible field label (rendered as a RAC `<Label>`). */
  label?: ReactNode;
  /** Help text under the field, wired to the input via `aria-describedby`. */
  description?: ReactNode;
  /** Error copy shown when invalid. Feature-computed — the primitive validates nothing. */
  errorMessage?: ReactNode;
  /**
   * Appends a muted "— optional" hint to the label (display only). Mutually
   * exclusive with `isRequired` (dev-warns; `isRequired` wins).
   */
  isOptional?: boolean;
  /** Placeholder text — forwarded to the `<Input>`. */
  placeholder?: string;
  /** Forwarded to the root and merged LAST. RAC's function form is supported. */
  className?: RACTextFieldProps["className"];
  /** Forwarded to the root and merged LAST (the escape hatch). */
  style?: RACTextFieldProps["style"];
}

export const TextField = forwardRef<HTMLDivElement, TextFieldProps>(function TextField(
  { label, description, errorMessage, isOptional, placeholder, className, style, ...props },
  ref,
) {
  const optional = showOptionalHint(props.isRequired, isOptional);
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
          {optional && <span className={styles.optional}> — optional</span>}
        </Label>
      )}
      <Input className={styles.input} placeholder={placeholder} />
      {description != null && (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      )}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </RACTextField>
  );
});
