# At-risk escalates on the earlier of two thresholds; an absent assignee re-flags without touching the Assignment record

While defining the at-risk predicate (issue #4), two sub-decisions needed a real trade-off.

**Escalation timing.** An open pickup request could escalate to At-risk purely on silence
(48h since it was raised), but that alone lets a request raised close to the childcare day
sit as merely "Pending" right up to — or past — the day itself, when it's already too late
to matter. We considered capping escalation at the day's start instead, but that still lets
a distant, long-unanswered request coast as Pending until the day arrives even after it's
clearly overdue for attention. So escalation fires on whichever of two thresholds comes
first: 48h since the request was raised (catches long silence on far-out requests), or 48h
before the childcare day itself (catches near-term requests that never get a fair silence
window). Both clocks run from the moment the request opens; the day flips to At-risk the
instant either one is crossed.

**Assignee becomes absent.** A Resolved day's assignee can later record their own absence
covering that date. We considered leaving the day's displayed state as Resolved, since the
Assignment record is unaffected — but that hides a real coverage gap, contradicting the
whole point of at-risk flagging. So the day's *state* (Resolved/Pending/At-risk) is derived
live and re-evaluates the assignee's own absence; the underlying Assignment record is left
untouched either way, consistent with assignments not changing retroactively elsewhere in
the model. A direct claim is what actually resolves it, same as any other at-risk day.

**Consequences**: day state can't be cached from the Assignment alone — it must be
recomputed against current absences and request ages each time it's read.
