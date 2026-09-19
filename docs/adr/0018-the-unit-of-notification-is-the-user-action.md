# The unit of notification is the user action, not the record

**This supersedes [ADR-0012](./0012-coalesced-notifications-queue-drained-opportunistically.md)**
in full: the `pending_notifications` queue, the 5-minute window, and the
opportunistic flush are gone.

Issue #131 reported notifications arriving in bursts. The coalescing queue was
supposed to be the defence against that, and it turned out to be defending the
wrong thing — neither burst source went anywhere near it.

**Where the bursts actually came from.** First, **fan-out inside a single
action**: `cancelAbsence` / `shortenAbsence` return one notification per
affected request plus one per standing assignment, so cancelling a two-week
absence sent about ten emails and ten pushes off one tap; the daily cron did the
same, one mail per member per newly-at-risk day. Event 1 had already solved this
with a bundled digest (`pickupRequestDigestBody`) — events 5, 8, 9 and 10 never
got the same treatment. Second, **repeated actions**: the Inbox answered each
day individually and deliberately offered no batch action, so five days meant
five taps and five mails.

**Why the queue wasn't the answer.** It barely collapsed anything:
`closureCoalesceKey` was keyed per *date*, so a holiday week made five rows, not
one, and the pattern editor is explicit-submit, so one save was already one
mail. The only thing it genuinely collapsed was saving the *same* pattern twice
inside five minutes. It also *manufactured* bursts — `claimDue` grabbed every
due row in one `DELETE … RETURNING` and `dispatchAll` sent them back to back.
And its timing was unpredictable: `send_after` only marked a row eligible, and
with ADR-0004 allowing one cron per day and no serverless function able to wait
five minutes, a queued row went out at the next mutating Server Action or the
06:00 tick, whichever came first. Reads did not flush, so simply opening the app
was not enough; worst case an "accepted" mail sat unsent overnight and then
landed in a clump.

**The rule that replaces it: one action produces at most one notification per
`(recipient, event)`, bundled at the dispatch boundary and sent immediately.**
No scheduler, no queue, no lag. `bundleNotifications()`
(`src/domain/services/notificationBundling.ts`) is a pure function that groups a
batch by `(recipientId, event)` and collapses each group of two or more into one
count-aware notification; a group of one passes through untouched, so the
per-day copy the domain services already write is unchanged in the common case.
Notifications carry an optional `subjectLabel` — the date — so a bundle lists
its days instead of degrading to a bare count.

It is applied at exactly one place: `dispatchAll`
(`src/notifications/dispatch.ts`), the choke point every action's notifications
already flowed through. That single hook covers cancel / shorten, `claimDay`,
the settings actions, the batch inbox answer and the daily cron at once, and no
caller has to know bundling exists. The boundary is the call: one `dispatchAll`
per action, and the cron makes one call per household.

**Where a burst spanned several taps, the UI makes it one tap.** The Inbox gains
"Accept all" / "Decline all" (one action looping the existing `acceptRequest` /
`declineRequest` services, skipping ids that have gone stale), and the closure
form takes a date range — still one `Closure` row per date, per CONTEXT.md, just
one action and one notification.

| What you do | Before | After |
| --- | --- | --- |
| Cancel a two-week absence | ~10 mails | 1 |
| Cron finds 10 newly at-risk days | 10 mails each | 1 each |
| Answer 5 requests | 5 taps → 5 mails | 1 tap → 1 mail |
| Add a holiday week of closures | 5 taps → 5 mails, delayed and clumped | 1 tap → 1 mail, immediate |
| Save the pattern twice in 5 min | 1 mail | 2 mails |

**Debounce-at-dispatch was rejected again**, for the same reason ADR-0012 gave:
it would carry the *first* edit's state. Bundling sidesteps that objection
entirely — it never has to choose a version, because everything it collapses
comes from one action and is therefore one state.

**Consequences.** Two deliberate pattern saves five minutes apart are now two
mails instead of one. That is accepted, and is the honest reading: two saves are
two facts, and the old behaviour only ever merged them by accident of timing.
Bundled copy is name-free — a two-parent household has exactly one "other
parent" — which is a small loss of warmth in the uncommon case, paid for by
never being wrong about who did what. Every catalogue event carries explicit
bundled copy (`catalogue.test.ts` pins that none is missing), so adding a
thirteenth event means writing its bundled wording too. The migration
(`0011_drop_pending_notifications`) is a `DROP TABLE`: rolling back past it
means re-creating the table, and any row still queued at deploy time is dropped
unsent. With one parent's worth of rows in a two-user app, judged fine.
