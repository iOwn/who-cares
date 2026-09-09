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

/**
 * The WebAuthn Relying Party config for the `passkey` plugin (issue #48).
 *
 * Kept as explicit env rather than derived from `BETTER_AUTH_URL` so a preview
 * deploy on a different host is a config change, not a code change, and so the
 * RP ID (which a browser binds a credential to permanently) is never guessed:
 *
 * - `PASSKEY_RP_ID` — the registrable domain the credential is scoped to:
 *   `localhost` in dev, the bare host (no scheme, no port, no path) in prod.
 * - `PASSKEY_ORIGIN` — the full origin WebAuthn ceremonies occur at
 *   (scheme + host + optional port), no trailing slash.
 * - `PASSKEY_RP_NAME` — human-readable label shown in the OS passkey prompt;
 *   optional, defaults to "WhoCares".
 */
export interface PasskeyRelyingParty {
  readonly rpID: string;
  readonly rpName: string;
  readonly origin: string;
}

export function getPasskeyRelyingParty(): PasskeyRelyingParty {
  return {
    rpID: requireEnv("PASSKEY_RP_ID"),
    rpName: process.env.PASSKEY_RP_NAME?.trim() || "WhoCares",
    origin: requireEnv("PASSKEY_ORIGIN").replace(/\/+$/, ""),
  };
}
