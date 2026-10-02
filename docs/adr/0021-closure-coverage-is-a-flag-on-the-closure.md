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
no new `DayDisplayState`, no 5th state `Legend` dot** — the grid cell keeps its normal state fill
and gains a marker (`isClosedAtHome`): a dashed teal border plus a filled "⌂ Home" strip along the
bottom edge (issue #181 — the original bare corner glyph was too easy to miss). The List tab always
lists such a day (even when quiet) with an "At home" pill, `DayDetail` leads with a *Facility
closed — care at home needed* `Callout`, and the `Legend` keys the marker as a separate item after
the four state dots (a marker key, not a state).

- **Flag, not a `kind` value.** `ClosureKind` is *provenance* (hand-entered vs derived from the
  Bundesland). Coverage is an orthogonal axis — a manual closure can be either, and a manual
  closure on a holiday date wins (ADR-0020) — *unless* it `needsCover`: since #172 the derived
  holiday then wins and the stored row is merely shadowed, because on a public holiday both
  parents are off.
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
