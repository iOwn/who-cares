# Off Resend: email+password auth with env-seeded users, Gmail SMTP for notifications

> **Superseded (auth half only) by [ADR-0015](./0015-magic-link-stays-gmail-smtp-fixes-auth-email.md).**
> Sign-in stays `magicLink`, not `emailAndPassword` — the actual fix for Resend's `@gmail.com`
> problem was moving the mail transport, not the auth mechanism. The Gmail SMTP half below
> (notifications) is unaffected and still stands.

The operator's send-from address is `@gmail.com`, which Resend can't send from — there's no
verifiable domain to attach SPF/DKIM to. That single constraint forced two independent
Resend consumers to move at once: Better Auth's `magicLink` sign-in (email is the delivery
mechanism the flow itself depends on) and the at-risk notification email (`docs/notifications.md`,
ADR-0012/0013). Issue #101 charted the switch; this records where it landed.

**Auth: `magicLink` → `emailAndPassword`, with env-seeded users instead of a sign-up form.**
`src/auth/config.ts` drops the `magicLink` plugin and adds `emailAndPassword: { enabled: true,
disableSignUp: true }` — `disableSignUp` because there is still no invite flow (SPEC.md
"Identity"): the two household members are not visitors who sign themselves up, they're a
fixed, deploy-configured pair. `passkey` and `nextCookies()` are untouched, and so is the
allowlist gate (`validateUserInfo`) and the `databaseHooks.user.create.after` household
bootstrap (#103).

With public sign-up off, the two members' credential users are created server-side instead,
by a new `scripts/seed-members.mjs` (`pnpm db:seed`) calling Better Auth's admin-plugin API,
`auth.api.createUser` — the same hasher `signIn.email` verifies against, and the same
bootstrap hook fires, because both routes bottom out in the identical `createWithHooks` path
(#104's static trace of the 1.7.3 source; a live smoke check against a scratch DB is a
required step of the build, not yet run). The two members' env-configured emails move from
one comma-separated `ALLOWED_MEMBER_EMAILS` into `ALLOWED_MEMBER_A_EMAIL` /
`ALLOWED_MEMBER_B_EMAIL`, slot-aligned with two new password vars, `MEMBER_A_PASSWORD` /
`MEMBER_B_PASSWORD` (#105). Passkey remains the primary fast path for everyday sign-in once a
member has logged in once with the password; the password exists mainly to bootstrap that
first session and to serve as the recovery path below.

**No self-service recovery — the seed is the reset mechanism.** There is no
forgot-password flow. Better Auth's `createUser` endpoint isn't upsert-shaped and its
`setUserPassword` needs a real admin session unavailable to a bare script, so
`scripts/seed-members.mjs` is written to converge state on every run: given the current env
values, it creates a missing user, heals a missing credential, and *always* re-hashes and
overwrites an existing credential's password to match the current `MEMBER_*_PASSWORD` (#105).
Recovering a forgotten password is therefore: the operator sets a new
`MEMBER_A_PASSWORD`/`MEMBER_B_PASSWORD` value and re-runs the seed, then tells that member
the new password out-of-band (#106). SPEC.md's "Account recovery is magic-link-only" line is
superseded by this — the wording lands with the build, once the seed doc it links to exists.

**Notification email: Resend → nodemailer over Gmail SMTP.** `src/notifications/resendMailer.ts`
is replaced by a nodemailer transport authenticated with a Gmail App Password
(`GMAIL_USER`/`GMAIL_APP_PASSWORD`). The `Mailer` port (`src/domain/ports.ts`) doesn't change —
this is an adapter swap, keeping the existing check-`error`/throw behavior. Resend's code and
its dependency are deleted outright, not left dormant behind a flag: grep confirmed auth and
notifications were its only two consumers, and both go away with this decision (#107).

**Trade-offs accepted.** Gmail SMTP caps consumer accounts at roughly 500 sends/day and its
ToS treats automated/bulk sending as a grey area — acceptable here because this is a two-user
household app, nowhere near that ceiling, but it is a ceiling a future multi-household version
of this app would hit immediately. The two members' passwords live in plain env vars (Vercel
Environment Variables), not a secrets manager — consistent with how every other credential in
this stack (`DATABASE_URL`, `RESEND_API_KEY` previously) is already handled. Removing Resend is
deliberate but reversible: it's the natural adapter to re-add behind the same `Mailer` port if
the operator ever acquires a real domain to verify SPF/DKIM against, at which point Gmail's
send cap and ToS grey area both stop applying.

**Explicitly not built.** Rate-limiting/lockout on password sign-in and email verification
were both considered and rejected for this switch: Better Auth's default protections are
judged sufficient for a two-user household app, and the allowlist gate remains the actual
security boundary — email verification would be redundant with it, not additive (#102).

**Consequences.** This ADR supersedes SPEC.md's "Auth" and "Identity" bullets (magic-link
language throughout) and the Resend half of ADR-0004 (`Runtime stack`) — both get their
wording updated in the build PR that implements this, not here. [Better Auth 1.7.3:
programmatic credential-user creation — hashing & bootstrap hook firing](https://github.com/iOwn/who-cares/blob/research/better-auth-seed-hashing/docs/research/better-auth-seed-hashing.md)
carries the full source-level trace this decision leans on. The related outage bug, [Magic-link
send: Resend errors are swallowed, so failures look like success](https://github.com/iOwn/who-cares/issues/100),
becomes moot once `magicLink` is removed and closes separately as superseded once this lands.
