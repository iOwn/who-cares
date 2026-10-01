# A closure can keep the day a childcare day — coverage is a flag on the closure

A facility closure (a staff-training day, the summer break) closes the Kita, **not the need**: a
parent still has to be with the child. Until issue #166 every `Closure` removed the childcare day
(`hasClosure` in `childcareDayInputs`), so these days went quiet — no owner, no pickup request, no
at-risk escalation — which is the dangerous direction for an app whose job is surfacing uncovered
days. A public holiday is the one kind where "no cover needed" is right (ADR-0020: the parents are
off work too).

## Decision

**`Closure.needsCover?: boolean` (absent ⇒ `false`) decides whether the closure removes the day.**
A closure that `needsCover` leaves the date a childcare day; `childcareDayInputs` counts only the
other closures as `hasClosure`. That is the whole behavioural change: `isChildcareDay`, `dayState`,
pickup-request generation, the at-risk cron and the calendar all read that one gate, so a
`needsCover` day goes through Resolved / Pending / At-risk like any other day. **No new Day state,
no new `DayDisplayState`, no 5th `Legend` entry** — the grid cell keeps its normal state styling
and gains a `⌂` marker (`isClosedAtHome`), `DayDetail` says *Facility closed — care at home needed*.

- **Flag, not a `kind` value.** `ClosureKind` is *provenance* (hand-entered vs derived from the
  Bundesland). Coverage is an orthogonal axis — a manual closure can be either, and a manual
  closure on a holiday date still wins (ADR-0020) *with* its `needsCover`.
- **Default for new closures: care needed.** A wrongly hidden day is the dangerous error (the same
  argument as ADR-0020's state-wide-only rule); a parent consciously picks *No care needed* for,
  say, a municipal holiday. Migration `0013` backfills existing rows to `false`, so nothing that
  exists today changes.
- **Derived public holidays never need cover.**
- **One notification per submit.** The settings form takes a list of closure ranges and saves them
  in one action, one transaction, one bundled `closure-added` notification (ADR-0018, #131) — a
  year of closures is one entry session, not ten. Bundled copy is neutral about coverage; a single
  closure's copy says which kind it is.

## Alternatives considered

**A new Day state** (`closed-at-home`) — widens `DayState`, `DayDisplayState`, `StatePill`,
`StateDot`, `Legend` and tokens for no behavioural gain: the day behaves exactly like a normal
childcare day.

**A second closure entity / table.** Two sources of "what happens on this date", plus a precedence
rule between them, where one nullable-free boolean carries the same fact.

"Pickup" wording in requests and assignments is unchanged; on an at-home day it means "who has the
child".
