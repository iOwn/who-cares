/**
 * The member display-name rule (issue #153). Framework-free (ADR-0005): the
 * one place that says what a valid `Member.name` is, so the settings action
 * that writes one and anything else that produces one agree.
 *
 * `bootstrapHousehold`'s `nameFromEmail` guess is deliberately *not* routed
 * through this — it is a one-time default, and changing how it is derived
 * would silently rename existing members on nothing more than a redeploy.
 */

/** The longest name a member may save — long enough for a double-barrelled name, short enough for a `PersonChip`. */
export const MAX_MEMBER_NAME_LENGTH = 40;

/** Trim and collapse internal whitespace runs to one space: `"  Alex   P "` → `"Alex P"`. */
export function normaliseMemberName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export type MemberNameValidation =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly error: string };

/**
 * Normalise `input` and say whether the result may be saved. The `error` is
 * user-facing copy — the settings card shows it as the field's error message.
 */
export function validateMemberName(input: string): MemberNameValidation {
  const name = normaliseMemberName(input);
  if (name.length === 0) return { ok: false, error: "Enter a name." };
  if (name.length > MAX_MEMBER_NAME_LENGTH) {
    return {
      ok: false,
      error: `Keep it to ${MAX_MEMBER_NAME_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, name };
}
