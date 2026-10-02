# The app-icon badge counts open requests **and** at-risk days

**Supersedes the count rule of ADR-0017** ("the badge is the open-request count, the same number the
bell shows"). Everything else in ADR-0017 stands: the count rides on every push, is read at dispatch
time under its own guard, is re-asserted by `useAppBadge` on change and on resume, and exists twice
(`badgeUpdateFor` / `applyAppBadge`).

## Why

ADR-0017 tied the icon to `countOpenForRecipient`. Only one of the twelve notification events
(`pickup-request-received`) ever creates an open request, so the other eleven pushed `badge: 0` and
`sw.js` *cleared* the icon — including events 9 and 10 (a day is at risk), the most urgent push in
the product. The icon was blank exactly when it should have lit up (issue #174).

## Decision

**The icon shows what needs the member: open requests addressed to them + at-risk childcare days in
the next 28 days** (`DEFAULT_ESCALATION_HORIZON_DAYS`, the cron's own horizon).

- At-risk is the live `dayState()` derivation (ADR-0003) — never stored — so `needsAttentionCount`
  (`src/domain/services/needsAttention.ts`) reuses it; there is still one implementation of "at-risk".
- An at-risk day whose open request is already addressed to the member is the same item as that
  request and is counted once.
- FYI events (closure added, pattern changed, accepted / declined / withdrawn) are not unresolved and
  never add to the count.
- **The bell stays requests-only.** The icon says "something needs you", the bell lists requests;
  at-risk days live on the calendar. The "one number in two places" rule is dropped on purpose.
- Computed twice from the same function: `loadNeedsAttentionCount` in `dispatch` (per push, loads the
  household's pattern / closures / absences / assignments / requests) and `page.tsx` over data it has
  already loaded, passed down as `AppShell`'s `iconBadgeCount`.

**Companion nudge.** iOS rejects `setAppBadge` until notification permission is granted, and the
permission prompt lives only on the `/settings` push card. `PushNudge` (decision:
`shouldShowPushNudge`) asks an installed iOS app with permission still `default` to turn
notifications on, next to `InstallPrompt`. Android Chrome has no Badging API; nothing is built.

## Consequences

Every dispatched push now costs a household's worth of reads instead of one `COUNT` (a household of
two: a handful of small tables, already what the cron loads per household). The count is failure-guarded
exactly as before — a failed read omits `badge` and `sw.js` leaves the icon alone.
The "Rejected" list of ADR-0017 (polled badge route, page-only badge, read/unread ledger) is unchanged.
