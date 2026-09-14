# Auth stays magic-link; Gmail SMTP was the actual fix, not `emailAndPassword`

**This supersedes ADR-0014's auth half** (`magicLink` → `emailAndPassword`, env-seeded users).
That switch (#110/#111) was started and then deliberately stopped mid-implementation: only the
admin plugin, `scripts/seed-members.mjs`, the `MEMBER_*_PASSWORD` vars, and migration `0009`
landed, never the actual `sendMagicLink` → `signIn.email` swap in `src/auth/config.ts`. #111 is
closed as superseded by this issue (#117); #118 removes the dormant scaffolding outright,
independently, in parallel with this ticket.

**The real root cause was never the auth mechanism.** ADR-0014 conflated two independent
problems under one trigger — Resend rejecting the operator's `@gmail.com` send-from address for
lack of a verifiable domain (SPF/DKIM) — and picked *two* fixes: move notifications to Gmail
SMTP, and replace magic-link with `emailAndPassword` for auth. Only the first half of that was
ever the actual bug. Magic-link sign-in mail failing to send (issue #100) was a Resend delivery
failure, identical in kind to the notification failure ADR-0014 already fixed for the other
consumer. Swapping auth mechanisms was solving the wrong layer: `sendMagicLink` doesn't care
which transport sends its email, so moving *that* call from `resend.emails.send` to the same
`createGmailMailer` adapter notifications already uses (`src/notifications/gmailMailer.ts`, #112)
fixes #100 completely, with no auth-mechanism change at all.

**Decision: `magicLink` stays; `emailAndPassword` is not adopted.** `src/auth/config.ts`'s
`sendMagicLink` now builds its own Gmail SMTP mailer via `requireGmailConfig()`
(`src/auth/env.ts`) + `createGmailMailer` (reused from `src/notifications/`), instead of the
`Resend` client. `RESEND_API_KEY` / `EMAIL_FROM` are gone from `src/auth/**` and `.env.ci`; the
`resend` package is now unused entirely and has been dropped from `package.json`.

**Why magic-link's own delivery risk is acceptable on Gmail SMTP.** ADR-0014 already accepted
Gmail SMTP's ~500 sends/day cap and ToS grey area for notification email, reasoning that a
two-user household app is nowhere near that ceiling. The same reasoning applies here, with one
difference worth naming: a notification send failure degrades gracefully (the underlying
mutation already committed; a missed at-risk email is a nuisance, not a lockout), while a
magic-link send failure blocks the *only* way to authenticate. That is why, unlike
`src/notifications/`'s `getGmailConfig()` (returns `null`, degrades to a no-op mailer),
`src/auth/env.ts`'s `requireGmailConfig()` follows the same `requireEnv` pattern as
`DATABASE_URL` / `BETTER_AUTH_SECRET`: a missing Gmail credential is a fatal misconfiguration at
module load, and a send failure at runtime throws — through Better Auth's endpoint handler,
through `authClient.signIn.magicLink()`'s `{ error }` result, into `SignInScreen`'s existing
error `Callout`. Nothing here is swallowed; that swallowing is exactly what made #100 invisible
in the first place.

**Why not password auth anyway, now that the scaffolding half-exists.** `emailAndPassword` adds
real, permanent complexity — a password reset story with no self-service flow (ADR-0014's own
"the seed is the reset mechanism" was already a workaround), a second credential to keep in sync
with the allowlist, and an admin-plugin surface area (`auth.api.createUser`, role/ban columns)
that exists solely to bootstrap two fixed accounts. None of that buys anything a fixed two-person
household needs: passkey is already the fast everyday path (progressive enrollment, issue #48),
and magic-link was already the bootstrap + recovery path before ADR-0014 touched it. Once Gmail
SMTP makes magic-link reliable, there is no remaining problem for `emailAndPassword` to solve —
only complexity it would add. `#110`'s scaffolding (admin plugin, seed script, `MEMBER_*_PASSWORD`
vars, migration `0009`) is therefore removed outright, not kept dormant behind a flag: #118
executes that removal as a separate, independent PR.

**Consequences.** SPEC.md's "Auth" and "Identity" bullets revert to describing magic-link as the
sole sign-in mechanism and its own recovery path (undoing the wording #110's PR introduced);
"Email" now names Gmail SMTP instead of Resend for both consumers. Issue #100 (magic-link send
failures are swallowed) is closed as **fixed**, not superseded — Gmail SMTP's adapter throws on
a failed send (`src/notifications/gmailMailer.test.ts` already covers that contract; the auth
side's own test seam is `src/auth/env.test.ts`'s `requireGmailConfig` coverage, since
`src/auth/config.ts` itself stays exercised by the E2E smoke path per ADR-0005, not unit tests).
A real end-to-end send (a magic-link email actually arriving via Gmail SMTP in production) could
not be verified from this sandbox — no outbound SMTP access — and is called out as a required
manual follow-up for the operator in the PR that implements this.
