# Coalesced notifications wait in a queue table drained opportunistically, not by a timer

Implementing the notification catalogue (issue #55) meant delivering issue #5's
5-minute per-record coalescing rule — "repeated edits to the same
absence/pattern/closure record within a 5-minute window collapse into one
notification of the final state, sent 5 minutes after the last edit" — on the
runtime ADR-0004 pinned: Vercel Hobby, whose only scheduled trigger is **Cron
once per day**, with no second scheduler allowed.

"Send X exactly 5 minutes from now" has no clean mechanism there. A serverless
function cannot sit idle for 5 minutes (it has already returned its response),
and ADR-0004 explicitly rejected QStash / cron-job.org for sub-daily precision.

**A queue table, drained opportunistically.** Only the two coalescable events
(childcare-pattern-changed, closure-added — every other catalogue event is
immediate) go through `pending_notifications`. Each edit `upsert`s one row keyed
by the record's `coalesceKey`, setting `send_after = now + 5min` and overwriting
the payload, so a burst of edits to the same record leaves exactly one row of
the final state. Due rows (`send_after <= now`) are flushed — dispatched, then
deleted — by `flushPendingNotifications`, which runs at the top of **every
mutating Server Action** and again on the **daily cron tick**.

**Debounce-at-dispatch was the alternative** — send the first edit immediately,
suppress the rest for 5 minutes — and it is simpler (no queue, no flush hook).
It was rejected because the notification would then carry the *first* edit's
state, not the final one, which is the opposite of what issue #5 asks for. For a
two-parent household an edit-then-correct sequence is exactly when the wrong
version matters.

**Consequences.** A coalesced notification is sent the next time *anyone* runs a
Server Action after its window closes, or at the daily cron tick, whichever
comes first — so a lone pattern edit made in a quiet house can lag by up to a
day. Judged acceptable: the two coalescable events are low-frequency and
non-urgent (a pattern change weeks out, a closure), day state is still derived
live and correct regardless, and the urgent events (requests, at-risk) never
touch this path. The cost carried forward is the flush call every mutating
action must make and the `pending_notifications` migration. Revisit if the lag
proves visible in practice, or if a cheap sub-daily trigger appears.
