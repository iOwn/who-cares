"use client";

import type { ReactNode } from "react";
import { composeRenderProps, FieldError, Label, Text } from "react-aria-components";
import { cx } from "./cx";
import styles from "./field.module.css";

/**
 * Shared internals for the RAC field primitives (`TextField`, `TextArea`,
 * `DateField`, and the coming `DateRangeField` — issue #74). A shared
 * implementation detail like `cx` / `fieldRequirement`, **not** a public
 * primitive: it is not re-exported from `src/ui/index.ts`.
 *
 * Each field primitive still owns its own RAC root component (`TextField`,
 * `DatePicker`, …) — that differs per primitive — and its own control
 * (`Input`, `TextArea`, the date-segment `Group`). This module factors out
 * only what was byte-for-byte identical across all of them:
 *
 *   - the `<Label>` / `<Text slot="description">` / `<FieldError>` JSX shell
 *     (`FieldShell`, wrapping the primitive's own control as `children`);
 *   - the `validationBehavior` default + `composeRenderProps` root-class
 *     wiring (`fieldRootProps`).
 *
 * The CSS behind the label / optional-hint / description / error rules lives
 * in `./field.module.css`, pulled into each component's own module via
 * `composes:`.
 */

export interface FieldShellProps {
  /** Visible field label (rendered as a RAC `<Label>`). Omitted entirely when `null`/`undefined`. */
  label?: ReactNode;
  /** Whether to append the muted "— optional" hint — see `./fieldRequirement`. */
  optional: boolean;
  /** Help text, wired to the control via `aria-describedby`. Omitted entirely when `null`/`undefined`. */
  description?: ReactNode;
  /** Error copy shown when the field is invalid. Feature-computed — the shell validates nothing. */
  errorMessage?: ReactNode;
  /** The primitive's own control (e.g. an `<Input>`, `<TextArea>`, or date-segment `<Group>`). */
  children: ReactNode;
}

/** Renders the label/optional-hint/control/description/error shell shared by every field primitive. */
export function FieldShell({
  label,
  optional,
  description,
  errorMessage,
  children,
}: FieldShellProps) {
  return (
    <>
      {label != null && (
        <Label className={styles.label}>
          {label}
          {optional && <span className={styles.optional}> — optional</span>}
        </Label>
      )}
      {children}
      {description != null && (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      )}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </>
  );
}

/**
 * The root-prop wiring shared by every field primitive: `validationBehavior`
 * defaults to `"aria"` (the forms boundary, docs/design-system.md §11) and
 * `className` composes the primitive's base layout class with the caller's
 * `className`, merged LAST (RAC's function form of `className` is supported).
 */
export function fieldRootProps<RenderProps>(
  className: string | ((renderProps: RenderProps) => string) | undefined,
  validationBehavior: "aria" | "native" | undefined,
  base: string,
): {
  className: (renderProps: RenderProps) => string;
  validationBehavior: "aria" | "native";
} {
  return {
    className: composeRenderProps(className, (resolved) => cx(base, resolved)),
    validationBehavior: validationBehavior ?? "aria",
  };
}
