/**
 * Env-var reading for the auth wiring. Loud on a missing var — `.env.ci`
 * (`docs/testing.md` "CI pipeline shape") carries fake-but-present values so
 * `next build` never trips this; a real deploy missing one is a
 * misconfiguration that should fail immediately, not fall back silently.
 */

import type { AllowlistedEmails } from "@/domain";
import type { GmailMailerConfig } from "@/notifications/gmailMailer";

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
 * `ALLOWED_MEMBER_EMAILS`). SPEC.md "Identity": deploy-time-configured, no
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

/**
 * Gmail SMTP config for magic-link sign-in mail (ADR-0015). Unlike
 * `src/notifications/env.ts`'s `getGmailConfig` — which returns `null` and
 * lets `./services.ts` degrade to a no-op mailer — a missing credential here
 * goes through `requireEnv` and is fatal, same as every other auth config
 * value in this file. Magic link is the sole sign-in bootstrap path
 * (SPEC.md "Auth"); a deploy that can't send it is broken, not degraded.
 *
 * `GMAIL_USER` is trimmed and `GMAIL_APP_PASSWORD` has every whitespace
 * character stripped, not just trimmed at the ends — both match
 * `src/notifications/env.ts`'s reader of the same two vars, so a value with
 * incidental whitespace (a trailing newline pasted into Vercel, or Google's
 * UI displaying the 16-character App Password grouped into four 4-character
 * blocks) behaves identically for both consumers.
 *
 * `requireEnv` only rejects a falsy *raw* value, so a whitespace-only env var
 * is truthy going in and would otherwise trim/strip down to `""` silently —
 * exactly the failure mode this function exists to rule out. Both values are
 * re-checked for emptiness after trimming/stripping, the same way
 * `getAllowlistedEmails` above re-checks its two emails post-trim.
 */
export function requireGmailConfig(): GmailMailerConfig {
  const user = requireEnv("GMAIL_USER").trim();
  if (user.length === 0) {
    throw new Error("GMAIL_USER must not be blank");
  }

  const appPassword = requireEnv("GMAIL_APP_PASSWORD").replace(/\s+/g, "");
  if (appPassword.length === 0) {
    throw new Error("GMAIL_APP_PASSWORD must not be blank");
  }

  return { user, appPassword };
}
