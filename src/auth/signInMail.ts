/**
 * The sign-in email's copy (issue #157, ADR-0019) — pure, so the `node`
 * Vitest project can pin it down (`signInMail.test.ts`) while
 * `src/auth/config.ts` itself stays exercised only by the E2E smoke path
 * (ADR-0005). Same split as `src/notifications/copy.ts`.
 *
 * One email carries two credentials: the magic link (for whichever browser
 * opens it) and a 6-digit code (for an installed Home Screen app, which is
 * its own browsing context and can never receive the link — Mail hands it to
 * Safari). The code-only variant backs the plugin's public
 * `/email-otp/send-verification-otp` endpoint, which `SignInScreen` never
 * calls but which exists regardless.
 *
 * The code sits on its own line with nothing around it — iOS autofills a
 * one-time code from Mail only when it can pick the digits out cleanly.
 */

export interface SignInMailInput {
  /** The magic-link verify URL; omitted for the code-only variant. */
  readonly url?: string;
  readonly otp: string;
}

export function signInMail({ url, otp }: SignInMailInput): { subject: string; body: string } {
  const subject = "Sign in to WhoCares";
  if (url === undefined) {
    return {
      subject,
      body: `Enter this code in WhoCares to sign in:\n\n${otp}\n\nThis code expires in 5 minutes.`,
    };
  }
  return {
    subject,
    body:
      `Tap to sign in to WhoCares:\n\n${url}\n\n` +
      `Opened WhoCares from your Home Screen? Enter this code there instead:\n\n${otp}\n\n` +
      "Both expire in 5 minutes.",
  };
}
