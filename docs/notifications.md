# Notifications

How WhoCares turns a domain event into an email + a web push (issue #55, issue
#5 catalogue, SPEC.md "Notifications", ADR-0004, ADR-0014, ADR-0018).

## The pipeline

```
one user action
      │
      ▼
domain service ──returns──▶ Notification[] ──▶ dispatchAll()
                                                  │
                                       bundleNotifications()  group by (recipient, event):
                                                  │           2+ collapse into one,
                                                  ▼           a lone one passes through
                                       dispatchNotification
                                        (email + web push)
```

- **Domain services never send.** `recordAbsence`, the request-resolution
  services, `runAtRiskEscalation` and the settings actions each return
  `Notification` objects; the caller dispatches them **after** its transaction
  commits, so a slow send can't hold a DB transaction open (ADR-0005).
- **The unit is the action, not the record** (ADR-0018). Each action hands
  `dispatchAll` its whole batch exactly once, and `bundleNotifications`
  (`src/domain/services/notificationBundling.ts`) collapses that batch to at
  most one notification per `(recipient, event)`. Nothing is queued and nothing
  waits: a notification goes out with the action that caused it.
- **One tier.** Every event fires email **and** web push together (SPEC.md).
  Email is the guaranteed channel; web push is best-effort and a failed push is
  logged and swallowed.
- **`src/notifications/`** is framework-free — it reads `process.env` and the
  repository ports, nothing from `next/*`. `createNotificationServices(repos)`
  wires the real adapters; each degrades to a no-op when its credentials are
  absent (dev, CI, `next build`).

## Event catalogue

| # | Event key | Recipient | Raised by |
| --- | --- | --- | --- |
| 1 | `pickup-request-received` | other parent | `recordAbsence` / recurring generator (one bundled digest per action) |
| 2 | `pickup-request-accepted` | requester | `acceptRequest` |
| 3 | `pickup-request-declined` | requester | `declineRequest` |
| 4–6 | `pickup-request-withdrawn` | the parent who still had it (4, 5) / requester (6) | `withdrawRequest`, `absenceCancellation`, `claimDay`, `acceptRequest` (superseded) |
| 7 | `direct-claim` | bumped parent | `claimDay` |
| 8 | `assignment-stands` | assignee | `absenceCancellation` |
| 9 | `day-at-risk-both-absent` | **both** | `runAtRiskEscalation` (daily cron) |
| 10 | `day-at-risk-escalated` | **both** | `runAtRiskEscalation` (daily cron) |
| 11 | `childcare-pattern-changed` | other parent | `savePatternAction` |
| 12 | `closure-added` | other parent | `saveClosureAction` (add only) |

Every event also carries **bundled copy** of its own in
`notificationBundling.ts`, so a bundle is never written in generic wording;
`catalogue.test.ts` fails if a new event is added without it.

Recipient rule: the single non-actor member, always — never self-notify — except
the two actor-less events (9, 10) which notify both. Tone: plain, calm, factual;
never urgency- or guilt-toned, even for at-risk.

### Events 9 + 10 lag by design

Day state is derived live at read time (ADR-0003), so a parent opening the app
always sees the right state. The *notification* for a newly-at-risk day is sent
by the once-daily cron only — ADR-0004 accepts up to a day of lag, and no second
scheduler was added. `at_risk_escalations` is the "already told them" ledger,
keyed `(household, date, event)` so a day already flagged event 10 can still
fire the more urgent event 9 — but a day that goes at-risk → resolved →
at-risk again is **not** re-notified (its ledger row is permanent). Judged fine
for v1: the day still shows the right state live, and re-nagging on every
flip-flop is its own problem.

Dispatch is **claim-based** (issue #92): `runAtRiskEscalation` writes the ledger
row with `AtRiskEscalationRepository.claimNotified` — `INSERT … ON CONFLICT DO
NOTHING RETURNING` — and only keeps the notifications for `(date, event)` pairs
it actually inserted. A retried or overlapping cron run reading the same empty
ledger plans the same days but claims none, so the at-risk email + push go out
once.

The handler calls `dispatchAll` **once per household**, so a tick that finds ten
newly at-risk days sends each parent one mail listing them, not ten (ADR-0018).

## Bundling

See **ADR-0018**, which supersedes ADR-0012's 5-minute coalescing queue outright
— there is no `pending_notifications` table, no window and no flush.

`bundleNotifications(notifications)` is pure: it groups by `(recipientId,
event)` in first-seen order, passes a group of one through untouched, and
collapses a group of two or more into one notification with count-aware copy.
Each notification's optional `subjectLabel` (the childcare date) is what the
bundled body lists — up to `MAX_LISTED_SUBJECTS`, then "and N more".

`dispatchAll` is its only caller, so the bundling boundary is the **call**, and
every caller respects it by passing one action's worth:

| Caller | One call covers |
| --- | --- |
| `cancelAbsenceAction` / `shortenAbsenceAction` | every withdrawal + "still stands" that change produced |
| `claimDayAction` | the bumped parent + the withdrawn request's requester |
| `answerAllRequestsAction` | every day the "Accept all" / "Decline all" answered |
| `saveClosureAction` | every date in the closure range that was newly closed (the range commits as one transaction; the dispatch follows it) |
| `/api/cron/at-risk` | one household's newly at-risk days |

Two separate taps stay two notifications — nothing merges across actions.
Saving the pattern twice in five minutes is two mails, deliberately: two saves
are two facts.

Where a burst would otherwise span several taps, the UI makes it one tap: the
Inbox's "Accept all" / "Decline all" (shown once two or more requests are
waiting) and the settings form's closure **date range**. Neither is a new domain
path — the batch answer loops the same `acceptRequest` / `declineRequest`
services, skipping ids that have gone stale, and a range still writes one
`Closure` row per date (CONTEXT.md).

## Deploy setup

`scripts/setup-notifications.sh` walks these; the short version:

1. **Gmail SMTP** (ADR-0014) — sign in to the Gmail account WhoCares should send
   notification email from, turn on 2-Step Verification, then create an App
   Password (Google Account → Security → 2-Step Verification → App passwords).
   Set `GMAIL_USER` (the Gmail address) and `GMAIL_APP_PASSWORD` (the 16-character
   App Password, not the account password) in Vercel. Gmail SMTP caps consumer
   accounts around 500 sends/day — a non-issue for a two-user household app
   (ADR-0014).
2. **VAPID** — `npx web-push generate-vapid-keys`. Set
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   (`mailto:you@yourdomain`) in Vercel. The keypair is permanent — rotating it
   invalidates every stored subscription. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is
   **inlined at build time** (the client reads it), so a fresh deploy is required
   after setting or changing it — until then the `/settings` push card shows
   "not set up for this deployment yet".
3. **Cron** — set `CRON_SECRET` in Vercel (any long random string). Vercel sends
   it as `Authorization: Bearer <CRON_SECRET>`; the route 401s without a match
   and 503s if the var is unset. The schedule lives in `vercel.json`.

With none of these set the app still runs — it just sends nothing.

### Preview deploys send nothing (issue #139)

A deployment with the E2E test seam armed — `E2E_TEST_MODE` set and
`VERCEL_ENV !== "production"`, i.e. `isTestModeEnabled()` in
`src/testing/testMode.ts` — gets the **no-op** mailer and push sender from
`createNotificationServices()`, even though the Preview scope carries real
`GMAIL_*` credentials.

Without that gate, every preview deploy runs `e2e/smoke.spec.ts`, which seeds
the fixed household (whose members hold the two `ALLOWED_MEMBER_*_EMAIL`
addresses) and then drives a real absence → pickup request → claim. Each step
posts a genuine "Bailey will cover the pickup" mail to a real inbox. Pointing
the preview allowlist at throwaway addresses instead would still *relay* the
mail and bounce it back into the Gmail account, so the gate sits at the
adapter, not at the recipient.

**Magic-link auth mail is deliberately not gated** — it goes out through
`src/auth/config.ts`, only ever in response to a human typing their own
address, so a preview deploy stays signable-in by hand. The `overrides`
argument also still wins, so unit tests are unaffected.

## Web push delivery (issue #90, ADR-0013)

The server pipeline above is channel-agnostic; delivery to a browser needs a
registered subscription. That client half:

- **Service worker** — `public/sw.js`, a minimal static file (no offline cache):
  `push` → `showNotification` + the app-icon badge, `notificationclick` →
  focus/open the app. Served `no-cache` and registered once from the root layout
  (`ServiceWorkerRegistrar`).
- **PWA manifest** — `app/manifest.ts` (`display: standalone`) plus code-generated
  icons (`app/appIcon.tsx` → `app/icon-192.png` / `app/icon-512.png` /
  `app/apple-icon.tsx`). No binary assets in the tree.
- **Enrollment** — the push card in `/settings` (`PushCard` + `usePushEnrollment`):
  opt-in only, never prompts on load. It runs the permission prompt +
  `pushManager.subscribe({ applicationServerKey: NEXT_PUBLIC_VAPID_PUBLIC_KEY })`
  and `POST`s / `DELETE`s the subscription to **`/api/push/subscribe`**, a thin
  adapter over `PushSubscriptionRepository`. Each browser stores its own row
  (`push_subscriptions.user_agent`, migration `0008`, powers the "registered
  browsers" list).
- **iOS** — push needs a Home-Screen install (16.4+). The card detects iOS /
  desktop-UA iPadOS and, when not already `display-mode: standalone`, shows the
  Share → "Add to Home Screen" steps instead of the enable button. Email remains
  the guaranteed channel throughout (SPEC.md).

Push payload (`webPushSender` → `sw.js`):

```json
{ "title": "…", "body": "…", "url": "…?", "tag": "…?", "badge": 2 }
```

Not wired yet: a deep-linking push. `sw.js` reads `data.url`, but the server
payload (`webPushSender`) sends none, so a tapped notification opens `/`.

## App-icon badge (issue #134, ADR-0017)

The installed app's icon carries the number of **open pickup requests addressed
to the member** — the same count the header bell shows, never a broader "unread"
tally. Two halves keep it right:

- **While the app is closed** — `dispatchNotification` reads
  `pickupRequests.countOpenForRecipient` and puts it on the push as
  `PushMessage.badge`; `sw.js` mirrors it onto the icon in the `push` handler.
  Every event carries it, not just the request ones, so a withdrawal push clears
  the badge that withdrawal resolved. The count is read at **dispatch** time, so
  a bundled batch ships the number that is true as each push goes out.
- **While the app is open** — `useAppBadge` in `AppShell` re-asserts the server's
  count on change and on resume (via `useOnResume`, alongside ADR-0016's
  refresh), so the badge and the bell can never disagree.

The count → badge rule lives twice: `badgeUpdateFor` (`src/app/appBadge.ts`) and
`applyAppBadge` (`public/sw.js`), because the worker is a static file and cannot
import from `src/`. Keep the shared half — clear at zero, floor to an integer —
in step; they differ on junk input on purpose, since an absent `badge` key means
"no count was sent" and must leave the icon alone. Android Chrome has no Badging
API and iOS rejects it without notification permission — both a silent no-op.

Related but not push: the installed app also refreshes its data on resume and
on pull-to-refresh (`RefreshOnResume`, `PullToRefresh`, ADR-0016) — the
Home-Screen install hides the browser's reload control, so these stand in for it.
