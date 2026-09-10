# Notifications

How WhoCares turns a domain event into an email + a web push (issue #55, issue
#5 catalogue, SPEC.md "Notifications", ADR-0004, ADR-0012).

## The pipeline

```
domain service ──returns──▶ Notification[] ──▶ Notifier.notify()
                                                  │
                             coalescable? ────────┤
                              no  │               │  yes
                                  ▼               ▼
                       dispatchNotification   pending_notifications
                       (email + web push)     (upsert, send_after = now+5min)
                                  ▲               │
                                  └── flushPendingNotifications ◀── every Server Action
                                                                    + daily Vercel Cron
```

- **Domain services never send.** `recordAbsence`, the request-resolution
  services, `runAtRiskEscalation` and the settings actions each return
  `Notification` objects; the caller dispatches them **after** its transaction
  commits, so a slow send can't hold a DB transaction open (ADR-0005).
- **One tier.** Every event fires email **and** web push together (SPEC.md).
  Email is the guaranteed channel; web push is best-effort and a failed push is
  logged and swallowed.
- **`src/notifications/`** is framework-free — it reads `process.env` and the
  repository ports, nothing from `next/*`. `createNotificationServices(repos)`
  wires the real adapters; each degrades to a no-op when its credentials are
  absent (dev, CI, `next build`).

## Event catalogue

| # | Event key | Recipient | Coalescable | Raised by |
| --- | --- | --- | --- | --- |
| 1 | `pickup-request-received` | other parent | no | `recordAbsence` / recurring generator (one bundled digest per action) |
| 2 | `pickup-request-accepted` | requester | no | `acceptRequest` |
| 3 | `pickup-request-declined` | requester | no | `declineRequest` |
| 4–6 | `pickup-request-withdrawn` | the parent who still had it (4, 5) / requester (6) | no | `withdrawRequest`, `absenceCancellation`, `claimDay`, `acceptRequest` (superseded) |
| 7 | `direct-claim` | bumped parent | no | `claimDay` |
| 8 | `assignment-stands` | assignee | no | `absenceCancellation` |
| 9 | `day-at-risk-both-absent` | **both** | no | `runAtRiskEscalation` (daily cron) |
| 10 | `day-at-risk-escalated` | **both** | no | `runAtRiskEscalation` (daily cron) |
| 11 | `childcare-pattern-changed` | other parent | **yes** | `savePatternAction` |
| 12 | `closure-added` | other parent | **yes** | `saveClosureAction` (add only) |

Recipient rule: the single non-actor member, always — never self-notify — except
the two actor-less events (9, 10) which notify both. Tone: plain, calm, factual;
never urgency- or guilt-toned, even for at-risk.

### Events 9 + 10 lag by design

Day state is derived live at read time (ADR-0003), so a parent opening the app
always sees the right state. The *notification* for a newly-at-risk day is sent
by the once-daily cron only — ADR-0004 accepts up to a day of lag, and no second
scheduler was added. `at_risk_escalations` is the "already told them" ledger so a
day is never nagged twice.

## Coalescing

See **ADR-0012**. Only events 11 + 12. Each edit `upsert`s one
`pending_notifications` row keyed by the record (`event:householdId` for the
pattern, `event:householdId:date` for a closure), window `now + 5min`. Repeated
edits to the same record collapse into one notification of the final state.
`flushPendingNotifications` — run by every mutating Server Action and the daily
cron — dispatches due rows.

## Deploy setup

`scripts/setup-notifications.sh` walks these; the short version:

1. **Resend** — create an API key, verify a sending domain. Set `RESEND_API_KEY`
   and `EMAIL_FROM` (e.g. `WhoCares <notify@yourdomain>`) in Vercel.
2. **VAPID** — `npx web-push generate-vapid-keys`. Set
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   (`mailto:you@yourdomain`) in Vercel. The keypair is permanent — rotating it
   invalidates every stored subscription.
3. **Cron** — set `CRON_SECRET` in Vercel (any long random string). Vercel sends
   it as `Authorization: Bearer <CRON_SECRET>`; the route 401s without a match
   and 503s if the var is unset. The schedule lives in `vercel.json`.

With none of these set the app still runs — it just sends nothing.

## Not yet built (follow-up)

The service worker, the PWA manifest, the push-subscription enrollment UI + API
route, and the iOS Home-Screen-install onboarding are a separate ticket. Until
then the `PushSender` adapter has no subscriptions to send to and web push is
inert; email carries every notification.
