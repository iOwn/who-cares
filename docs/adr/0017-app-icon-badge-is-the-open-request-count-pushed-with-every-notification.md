# The app-icon badge is the open-request count, pushed with every notification

An installed WhoCares (`display: standalone`, ADR-0013) sits on the Home Screen
with no chrome and, once closed, no way to say that something is waiting. Push
notifications land in the tray and are dismissed or missed; after that the icon
looks identical whether a parent owes an answer or not. Issue #134 asks for the
count of unresolved items on the icon itself — the Badging API
(`navigator.setAppBadge` / `clearAppBadge`).

**The badge count is open pickup requests addressed to the member — the same
number the header bell shows.** `AppShell` already derives it (`state === "Open"
&& recipientId === me`) for `CountBadge`; the icon shows that and nothing else.
The alternative readings were considered and dropped: at-risk days are derived
live from pattern + closures + absences (ADR-0003) and have no cheap scalar
query, and would also make the icon disagree with the bell; a true unread count
across all twelve notification events would need a per-member read-state table,
and a `Notification` in this codebase is a transient event object that exists
only long enough to become an email and a push (ADR-0012), never an inbox row.
One definition of "unresolved", shown in two places, is the point.

**The count rides along in every push payload.** `dispatchNotification` reads
`countOpenForRecipient` and passes it as `PushMessage.badge`;
`webPushSender` serialises it; `public/sw.js` mirrors it onto the icon from the
`push` handler. This is the only path that can move the badge while the app is
closed, which is the entire feature. Putting it on *every* event rather than
only the request ones is what makes it self-correcting — a withdrawal push
carries the lower count that withdrawal produced, so the icon converges on truth
without anyone opening the app.

**The count is read at dispatch time, not when the notification is built.** A
coalescable event can sit in `pending_notifications` for five minutes
(ADR-0012); the icon should show what is true when the push actually goes out.
Reading it inside the existing push `try` also means a failed count degrades
exactly like a failed push — logged and swallowed, email still sent, since email
is the guaranteed channel (SPEC.md).

**The app re-asserts the count whenever it is open.** `useAppBadge`, called from
`AppShell`, applies the count on change and again on resume through the shared
`useOnResume` hook. The resume re-apply is not redundant with the change effect:
if a push moved the badge while the app was backgrounded and the server's count
is unchanged from the last render, the effect alone would not re-fire and the
service worker's number would stick. `RefreshOnResume` (ADR-0016) refreshes the
RSC tree on that same resume, so by then this is re-asserting fresh server truth.

**Rejected.** A `GET /api/me/badge-count` polled by the service worker — a new
authenticated route and a `fetch` handler in a worker ADR-0013 deliberately
keeps cache-free and tiny, to deliver a number the push already had in hand.
Setting the badge only from the page — much smaller, but the badge would be
stale exactly when it matters, sitting on the Home Screen after a new request
arrived. Persisting a read/unread ledger — storage and a lifecycle for a number
the domain can already answer.

**Consequences.** Every dispatched notification costs one extra `COUNT` query
against `pickup_requests` for a household of two; no index was added. The rule
that turns a count into a badge exists twice — `badgeUpdateFor` in
`src/app/appBadge.ts` and `applyAppBadge` in `public/sw.js` — because the worker
is a static file outside the bundle and cannot import from `src/`; both are
commented to point at each other and must be kept in step. Android Chrome does
not implement the Badging API and iOS 16.4+ rejects it until notification
permission is granted; both are a silent no-op, with no messaging in `/settings`,
because the in-app bell already covers those parents. The pure decision is
unit-tested in the `node` project; the `navigator` wiring and the worker are not
(ADR-0005, ADR-0009), and the OS badge is not observable from Playwright, so the
E2E smoke (ADR-0008) is unchanged and a real-device pass on an installed iOS app
is part of this change's verification.
