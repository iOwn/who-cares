/**
 * Env-var reading for the auth wiring. Loud on a missing var — `.env.ci`
 * (`docs/testing.md` "CI pipeline shape") carries fake-but-present values so
 * `next build` never trips this; a real deploy missing one is a
 * misconfiguration that should fail immediately, not fall back silently.
 */

import type { BetterAuthOptions } from "better-auth";
import type { AllowlistedEmails } from "@/domain";
import type { GmailMailerConfig } from "@/notifications/gmailMailer";

type EnvLike = Record<string, string | undefined>;

export function requireEnv(name: string): string {
  return requireEnvFrom(process.env, name);
}

function requireEnvFrom(env: EnvLike, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** What `betterAuth({ baseURL })` accepts: a static origin, or the per-request host config. */
export type AuthBaseURL = NonNullable<BetterAuthOptions["baseURL"]>;

/**
 * The Better Auth `baseURL` for this deployment (issue #152).
 *
 * Better Auth builds every magic link — and derives `trustedOrigins` — from
 * `baseURL`. On production that is the one `BETTER_AUTH_URL`. A Vercel
 * **preview** deploy has no fixed host: each deployment gets its own
 * `who-cares-<hash>-….vercel.app` plus a per-branch alias, while
 * `BETTER_AUTH_URL` (scoped to both environments) still holds the production
 * origin. With the static string a preview mailed a link pointing at
 * production, whose database never stored the token — every preview sign-in
 * ended in `INVALID_TOKEN`.
 *
 * On preview this therefore returns Better Auth's dynamic config instead: the
 * request's `Host` is matched against the deployment's own two hostnames,
 * which Vercel exposes as the system vars `VERCEL_URL` / `VERCEL_BRANCH_URL`,
 * so the link (and the session cookie, and the origin check) land on the host
 * the user actually opened. Exact hosts, not `*.vercel.app` — a wildcard
 * would trust every other Vercel app's origin. `BETTER_AUTH_URL` stays as the
 * `fallback` for a request from any other host (a custom alias), which then
 * behaves exactly as before.
 *
 * Anywhere else (production, local, CI build) the static string is returned
 * unchanged, so this changes nothing for the live deploy.
 */
export function getAuthBaseURL(env: EnvLike = process.env): AuthBaseURL {
  const fallback = requireEnvFrom(env, "BETTER_AUTH_URL");
  if (env.VERCEL_ENV !== "preview") return fallback;

  const allowedHosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL]
    .map((host) => host?.trim())
    .filter((host): host is string => Boolean(host));
  if (allowedHosts.length === 0) return fallback;

  return { allowedHosts, protocol: "https", fallback };
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
 * Gmail SMTP config for the sign-in mail (ADR-0015). Unlike
 * `src/notifications/env.ts`'s `getGmailConfig` — which returns `null` and
 * lets `./services.ts` degrade to a no-op mailer — a missing credential here
 * goes through `requireEnv` and is fatal, same as every other auth config
 * value in this file. The sign-in email (link + code, issue #157) is the
 * sole bootstrap path (SPEC.md "Auth"); a deploy that can't send it is broken, not degraded.
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
