/**
 * Shared requirement-affordance rule for the field primitives (`TextField`,
 * `TextArea`, `DateField`).
 *
 * STANCE (docs/design-system-inventory.md §11, from the Toybox forms): the forms
 * mark only OPTIONAL fields — an "— optional" suffix on the label. Required is
 * the unmarked default; there is deliberately no "*"/"required" marker in v1
 * (short two-person forms where most fields are required). `isRequired` still
 * flows to RAC so the field is announced as required and constraint-checked.
 *
 * `isRequired` and `isOptional` are mutually exclusive. Passing both is a
 * dev-time warning and `isRequired` wins (the hint is suppressed).
 */
export function showOptionalHint(
  isRequired: boolean | undefined,
  isOptional: boolean | undefined,
): boolean {
  if (process.env.NODE_ENV !== "production" && isRequired && isOptional) {
    console.warn(
      "[ui] a field primitive received both `isRequired` and `isOptional`; they are mutually exclusive. Ignoring `isOptional`.",
    );
  }
  return Boolean(isOptional) && !isRequired;
}
