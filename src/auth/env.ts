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
 * The two allowlisted parent emails, in slot order — `ALLOWED_MEMBER_A_EMAIL`
 * / `ALLOWED_MEMBER_B_EMAIL` (issue #110; previously one comma-separated
 * `ALLOWED_MEMBER_EMAILS`, split so each slot pairs 1:1 with its own
 * `MEMBER_*_PASSWORD` below). SPEC.md "Identity": deploy-time-configured, no
 * invite flow, no in-app setup screen. Every consumer goes through this
 * function, so the split is invisible to them.
 *
 * Lower-cased here, at the one boundary where the env value enters the
 * system: Better Auth lower-cases `user.email` itself (its `userSchema`), so
 * this keeps the email `bootstrapHousehold` writes to `members.email`
 * matching what `getCurrentSession` later looks up via
 * `session.user.email` — a mixed-case env value would otherwise create a
 * `Member` that a real (lower-cased) session email never finds.
 */
export function getAllowlistedEmails(): AllowlistedEmails {
  const a = requireEnv("ALLOWED_MEMBER_A_EMAIL").trim().toLowerCase();
  const b = requireEnv("ALLOWED_MEMBER_B_EMAIL").trim().toLowerCase();

  if (a.length === 0 || b.length === 0) {
    throw new Error(
      `ALLOWED_MEMBER_A_EMAIL and ALLOWED_MEMBER_B_EMAIL must both be non-empty, got "${a}" and "${b}"`,
    );
  }

  return [a, b];
}

/**
 * The two members' credential-login passwords (issue #110), slot-aligned
 * with `getAllowlistedEmails()` — `MEMBER_A_PASSWORD` is Member A's password,
 * same slot as `ALLOWED_MEMBER_A_EMAIL`. The only consumer is
 * `scripts/seed-members.mjs`; nothing else needs a member's password
 * (sign-in itself is still magic-link, per ADR-0014, until the follow-on
 * switch to `emailAndPassword`).
 *
 * Not trimmed or lower-cased — unlike emails, a password is an opaque
 * secret, and silently mutating it would just make the env value diverge
 * from what the operator actually typed.
 */
export function getMemberPasswords(): readonly [string, string] {
  return [requireEnv("MEMBER_A_PASSWORD"), requireEnv("MEMBER_B_PASSWORD")];
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
