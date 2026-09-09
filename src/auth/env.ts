/**
 * Env-var reading for the auth wiring. Loud on a missing var — `.env.ci`
 * (`docs/testing.md` "CI pipeline shape") carries fake-but-present values so
 * `next build` never trips this; a real deploy missing one is a
 * misconfiguration that should fail immediately, not fall back silently.
 */

import type { AllowlistedEmails } from "@/domain";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * The two allowlisted parent emails, in slot order (`ALLOWED_MEMBER_EMAILS`,
 * comma-separated). SPEC.md "Identity": deploy-time-configured, no invite
 * flow, no in-app setup screen.
 *
 * Lower-cased here, at the one boundary where the env value enters the
 * system: Better Auth lower-cases `user.email` itself (its `userSchema`), so
 * this keeps the email `bootstrapHousehold` writes to `members.email`
 * matching what `getCurrentSession` later looks up via
 * `session.user.email` — a mixed-case env value would otherwise create a
 * `Member` that a real (lower-cased) session email never finds.
 */
export function getAllowlistedEmails(): AllowlistedEmails {
  const emails = requireEnv("ALLOWED_MEMBER_EMAILS")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

  if (emails.length !== 2) {
    throw new Error(
      `ALLOWED_MEMBER_EMAILS must list exactly two emails, got ${emails.length}: "${emails.join(", ")}"`,
    );
  }

  return [emails[0], emails[1]];
}
