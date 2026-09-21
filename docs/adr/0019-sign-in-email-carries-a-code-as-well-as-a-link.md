# The sign-in email carries a 6-digit code as well as the magic link

The magic link (ADR-0015) can only ever sign in the browsing context that *opens* it. An
installed Home Screen app (`display: "standalone"`, `src/app/manifest.ts`) is its own browsing
context with its own cookie storage, separate from Safari's. Tapping the link in Mail opens
Safari, `magicLinkVerify` sets `__Host-whocares.session` in Safari's jar, and the installed app
stays signed out. The only way a parent found to recover was to re-add the app to the Home
Screen from the now-signed-in Safari tab — which works solely because a fresh Home Screen app
is seeded from Safari's storage at install time. Issue #157.

Nothing in the app was broken. The sign-in flow simply had no path that completes *inside* the
context that asked for it, and on the platform the app is built around (iOS, where a Home Screen
install is the only route to push — SPEC.md "Push", ADR-0013) that is the common case, not an
edge.

**Decision: one sign-in email, two credentials.** `src/auth/config.ts` keeps the `magic-link`
plugin and adds Better Auth's `email-otp` plugin. `sendMagicLink` mints a 6-digit code through
the plugin's server-only `auth.api.createVerificationOTP` and sends *one* mail
(`src/auth/signInMail.ts`) carrying both the link and the code. `SignInScreen`'s "sent" state
becomes a code form (`inputMode="numeric"`, `autoComplete="one-time-code"` so iOS autofills it
from Mail) that redeems the code with `authClient.signIn.emailOtp` and lands on `/` — exactly
the way the passkey path already does. Under `display-mode: standalone` the confirmation copy
leads with the code and says outright that the link opens in the browser, not the app.

**Why keep the link at all.** In a browser tab, one tap is still better than six digits, and
nothing about the link is wrong there. Replacing it outright was considered and rejected as a
product call: the code fixes the standalone case without taking anything away from the browser
case.

**Why `email-otp` and not a custom approve-and-poll flow.** A flow where the installed app
polls until the link is tapped elsewhere needs a pending-sign-in table, a polling endpoint, and
its own expiry and rate-limit story — three new things to get right for the same outcome. The
plugin stores its code in the `verifications` table the link already uses (no migration), rate
limits its own endpoints, caps attempts at three, and expires in the same five minutes. Its
`signInEmailOTP` creates the user through the same `internalAdapter.createUser` as the link,
so `user.validateUserInfo` (the allowlist gate) and the `user.create.after` household bootstrap
fire identically for both paths. The plugin's public `send-verification-otp` endpoint, which
the screen never calls, gets the same allowlist drop and a code-only mail rather than being
left with a stub.

**Consequences.** SPEC.md's "Auth", "Identity" and the sign-in user story describe the email
(link or code) rather than "the magic link" as the bootstrap + recovery path; the settings copy
in `PasskeyCard` / `SignedInDevices` follows. ADR-0015's reasoning — the transport is Gmail
SMTP, a failed send throws through to the screen — is unchanged and now covers the code too,
since it rides in the same send. The E2E seam (`/api/test/login`) still drives
`magicLinkVerify` (ADR-0008); the code verify is plugin code outside the smoke path, and the
real-device check of the standalone flow is a manual acceptance step on the PR.
