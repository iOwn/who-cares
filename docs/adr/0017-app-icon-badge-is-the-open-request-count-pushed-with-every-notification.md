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
only long enough to become an email and a push, never an inbox row.
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
batch dispatched after a multi-day action resolves requests as it goes, so the
icon should show what is true when each push actually goes out. (This also
covered the coalescing queue that ADR-0012 once held the notification in; that
queue is gone — ADR-0018 — and the rule outlived it.)
The read has its own guard, separate from the send: the badge is a nicety and
the notification is the point, so a failed count costs the icon a number and
nothing else. `badge` then goes out `undefined`, `webPushSender` omits the key,
and `sw.js` leaves whatever is on the icon alone rather than wiping a good badge
over one bad payload. Email is unaffected throughout — it is the guaranteed
channel (SPEC.md) and is already sent before any of this.

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
commented to point at each other, and their shared half (clear at zero, floor to
an integer) must be kept in step. They differ on junk input by design, because
their inputs differ: the client always has a count, so anything unusable clears;
the worker may get no `badge` key at all, which means no count was sent and the
icon must be left as it is. Android Chrome does
not implement the Badging API and iOS 16.4+ rejects it until notification
permission is granted; both are a silent no-op, with no messaging in `/settings`,
because the in-app bell already covers those parents. The pure decision is
unit-tested in the `node` project; the `navigator` wiring and the worker are not
(ADR-0005, ADR-0009), and the OS badge is not observable from Playwright, so the
E2E smoke (ADR-0008) is unchanged and a real-device pass on an installed iOS app
is part of this change's verification.
