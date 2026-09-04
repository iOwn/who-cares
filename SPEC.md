# WhoCares — v1 spec

A mobile-first, desktop-capable PWA where two parents in one household coordinate daycare
pickup. Core loop: a parent declares an **absence** on a childcare day → a **pickup request**
fires to the other parent → they **accept** (day resolved) or **decline** (day at-risk). The
app keeps one resolved answer per day, flags at-risk days, and notifies via email + web push.

This document is the entry point for a build agent: it indexes the domain model, the
architecture decisions, and the feature list, and states what's explicitly out of scope. It
doesn't restate detail that already lives in `CONTEXT.md` or an ADR — follow the links.

## Domain model

[`CONTEXT.md`](./CONTEXT.md) is the canonical glossary: Household, Member, Child, Childcare
pattern, Closure, Childcare day, Absence, Pickup request, Direct claim, Assignment, Day state
(Resolved / Pending / At-risk / n/a). Read it before writing any code that touches these
terms — the names and their exact boundaries (e.g. what does and doesn't change retroactively)
are load-bearing.

## Architecture decisions

| ADR | Decision |
| --- | --- |
| [ADR-0001](./docs/adr/0001-direct-claim-overwrites-without-confirmation.md) | A direct claim overwrites any existing assignment with no confirmation step — the one case where the app *does* silently reassign, because the claim itself is an explicit human action. |
| [ADR-0002](./docs/adr/0002-childcare-pattern-is-effective-dated.md) | The childcare pattern is versioned by effective date (`{weekdays, effectiveFrom}[]`), not a single mutable value, so past childcare-day derivation stays stable across schedule changes. |
| [ADR-0003](./docs/adr/0003-at-risk-escalates-on-earlier-of-two-thresholds.md) | At-risk fires on whichever comes first — 48h since the request was raised or 48h before the childcare day — and day state is always derived live, never cached from the Assignment record. |
| [ADR-0004](./docs/adr/0004-serverless-vercel-stack-over-always-on-fly-io.md) | Runtime stack: Next.js (App Router) on Vercel Hobby, Neon Postgres, Resend email, once-daily Vercel Cron as an at-risk backstop (live computation is the real safety net). |

## Stack & hosting plan

All-serverless, $0/mo:

- **App**: Next.js (App Router), deployed on **Vercel Hobby**.
- **Database**: **Neon** Postgres (scale-to-zero free tier).
- **Auth**: self-hosted **Better Auth** — `magic-link` plugin (email via Resend) as the
  permanent bootstrap + recovery path, `passkey` plugin (wraps SimpleWebAuthn) as an additive
  fast re-entry path via progressive enrollment, shipped in v1. DB-backed opaque session
  token in a `__Host-` cookie (`HttpOnly; Secure; SameSite=Lax`), 30–60 day sliding lifetime,
  no idle timeout, signed-in-devices list with per-device revoke.
- **Identity**: no invite flow. The two parents' emails are a **deploy-time-configured
  allowlist** (env var / config) — anyone signing in with an allowlisted email joins via
  magic link. No in-app setup screen. Account recovery is magic-link-only.
- **Email**: **Resend** free tier (3,000/mo).
- **Push**: standard `web-push` + one VAPID keypair + one service worker. Store each
  `PushSubscription` server-side, drop on 404/410. iOS delivery requires the PWA to be
  installed to the Home Screen (iOS 16.4+) — onboarding must guide the install; email is the
  guaranteed fallback since push is best-effort on every platform.
- **Scheduling**: **Vercel Cron, once/day**, for the 48h at-risk escalation check. This is a
  backstop only — day state is computed live at read time regardless of when cron last ran
  (ADR-0003), so the UI is always correct; only a newly-at-risk notification can lag by up to
  a day.

Research backing these picks: `docs/research/auth-options.md` (branch `research/auth-options`)
and `docs/research/platform-hosting.md` (branch `research/platform-hosting`).

## Screens / information architecture

**Calendar-first**: the month grid is the landing screen (no persistent bottom-tab feed or
master-detail split — both considered, not taken). Day detail and absence entry ("+ I'm out")
open as modals over the grid.

- **Day-state encoding**: a filled colored dot + one-character icon badge (✓ / … / ! / –) on
  the grid cell, plus a one-line assignee/absentee label under the date. Carried into the
  day-detail modal as dot + label + a plain-language narrative line.
- **Pickup-request inbox**: reached via a bell icon + badge count in the header. Full-screen
  list on mobile viewports (no room for a side panel at phone widths); side panel on desktop.
- **Navigation**: month-at-a-time paging via `‹ ›` arrows, plus a jump-to-month picker and a
  "Today" shortcut. Backward and forward paging use the same mechanism — browsing history is
  not a separate mode. No year-at-a-glance view. The "+ I'm out" FAB always defaults to real
  today regardless of the month being browsed; tapping a day cell anchors the entry sheet to
  that day instead.
- **Grid/List tab**: each month can be viewed as the traditional **Grid**, or as a **List**
  showing only notable days (resolved / pending / at-risk / actual closures) with quiet days
  and weekends hidden. Both tabs share the same paging controls.

Explored as interactive prototypes (not merged; reference for exact behavior, not for code):
`prototypes/core-screens.prototype.html` (branch `prototype/core-screens`, variants A/B/C) and
`prototypes/calendar-navigation.prototype.html` (branch `prototype/calendar-navigation`,
variants A/B/C).

Deferred, not v1: whether an uncontested childcare day (nobody absent) should carry an
implicit "who's on duty" concept. Domain-model question, not a screens one — see Not yet
specified below.

## Feature list / user stories

**Household, auth & members**
- As a parent, I sign in via a magic link sent to my (allowlisted) email; no signup form.
- As a signed-in parent, I can enroll a passkey for faster re-entry on a trusted device.
- As a parent, I can see and revoke my other signed-in devices.

**Childcare pattern & closures**
- As a parent, I can set the household's childcare pattern (weekdays the child needs
  collecting), effective from a chosen date, without altering how past dates are derived.
- As a parent, I can add a closure (single date, optional free-text reason) that removes a
  childcare day the pattern would otherwise include.

**Absence entry**
- As a parent, I can declare a one-off absence over a date range, with an optional label and
  note.
- As a parent, I can enter a **Recurring** absence instead: pick weekdays + a start/end date
  range (end date hard-capped at 4 weeks from today), which generates one ordinary `Absence`
  per matching weekday. Idempotent — re-running silently skips days I've already covered. No
  saved "usual office days" preference in v1; the weekday picker starts blank every time.
- As a parent, I can cancel or shorten an absence; this never auto-unassigns anyone — the
  calendar drops the trip, any existing assignment stands, both parents are notified, and
  resolution (if needed) is manual.

**Pickup requests**
- When my absence covers a childcare day with no existing assignment and I'm the only one
  absent, a pickup request auto-fires to the other parent.
- If we're both absent on the same childcare day, no request is raised — it goes straight to
  at-risk.
- As the requested parent, I can **Accept** (I become the assignee, day resolves) or
  **Decline** (day goes to at-risk; the request is terminal, never re-raised — see ADR
  discussion in the Pickup-request lifecycle decision). Each day is accepted/declined
  individually; there's no batch-accept even when several requests arrive from one absence.
- A request auto-**Withdraws** if its absence is cancelled/shortened, or if the day gets
  claimed out from under it before I respond.

**Direct claim**
- As a parent, I can claim any childcare day outright — assigned or not — bypassing the
  request flow. The newest claim wins with no confirmation step (ADR-0001); the previously
  assigned parent, if any, is notified after the fact, not asked first.
- Direct claim is the *only* path back to coverage after a request is Declined or Withdrawn —
  there's no in-app re-ask.

**At-risk surfacing**
- A childcare day shows as **Resolved**, **Pending**, **At-risk**, or n/a, computed live, never
  stored (ADR-0003).
- A day goes At-risk when: both parents are absent (immediately, no request raised); or an
  open request crosses 48h since it was raised, or 48h before the childcare day, whichever
  comes first; or a day's own assignee later records their own absence covering that date
  (the Assignment record itself is untouched — a direct claim is what actually resolves it).

**Notifications**
- Every event fires email + web push together — one tier, no informational-only channel.
- Recipient is always the single non-actor member, except the two actor-less events
  (both-absent, 48h-silence) which notify both.
- Edits to the same absence/pattern/closure record within a 5-minute window coalesce into one
  notification of the final state.
- Full event catalogue (12 events, exact recipients and coalescing behavior per event): see
  the Notification events catalogue decision, linked from `CONTEXT.md`'s revision history /
  the map's Decisions-so-far.
- Copy tone is plain, calm, and factual — never urgency- or guilt-toned, even for at-risk.

**Calendar / history**
- The primary view is a 4-week-ish rolling window; navigation (month paging, Grid/List tabs,
  FAB anchoring) is unbounded and symmetric in both directions, per the Screens section above.
- History is retained and browsable via the same paging mechanism as future dates — it's not
  a separate mode.

## Non-goals (out of scope for v1)

- Calendar import (Google/Outlook) — manual entry only.
- Native mobile apps — PWA only.
- Drop-off coordination — pickup only.
- More than one child; more than two logins (more than two members).
- Time-of-day scheduling / half-days — whole-day only, free-text notes carry nuance.
- Complex recurrence rules (monthly, "nth weekday", per-occurrence exceptions on a series) —
  the only recurring concepts are the effective-dated childcare pattern and the closures list,
  plus the Recurring-mode absence generator, which persists no rule of its own.
- In-app chat / messaging.
- Any automatic reassignment or load-balancing logic — every change of assignee is an explicit
  human action (direct claim, or accepting a request).
- Fairness / pickup-count ledger.
- Third-party assignee (grandparent / sitter as a named non-login stand-in) — v1 assignee is a
  Member or nobody.
- Public multi-tenant signup — v1 is a single hard-wired household via a deploy-time allowlist.
- Re-ask / "ask again" after a Decline or Withdrawn request — would reintroduce an in-app
  negotiation loop; direct claim already covers it.
- A persisted "usual office days" preference for the Recurring absence form — every submission
  starts blank in v1.

## Not yet specified (fast-follow candidates, not blocking v1 build)

- **"Who asked, how often" insight**: surfacing the pattern of *asks* (who requests pickup,
  typical lead time), not raw counts.
- **Implicit "who's on duty" on an uncontested day**: whether a childcare day where neither
  parent is absent should carry a default/implicit assignee concept, broadening Assignment
  beyond absence-driven claims/requests. Touches the domain model — needs its own decision
  before implementation, not assumed by this spec.
- **Persisted "usual office days" preference**: pre-populating the Recurring-mode weekday
  picker from a saved per-Member preference instead of starting blank.

## Provenance

Assembled from the WhoCares wayfinder map
([iOwn/who-cares#1](https://github.com/iOwn/who-cares/issues/1)) once every decision ticket
closed. See the map's Decisions-so-far for the one-line gist + link behind each choice above.
