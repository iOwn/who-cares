# Third-party cover is a source and a label on the Assignment, not a person

A declined (or never-answered) pickup request leaves a day At-risk, and until issue #183 the only way
back to Resolved was a **direct claim** — a member doing the pickup themselves. In practice the
other route is just as common: a parent arranges a grandparent, friend or sitter. SPEC.md listed a
"third-party assignee (named non-login stand-in)" as a v1 non-goal because it implied a new kind of
person in the model. This ADR reverses that non-goal, narrowly.

## Decision

**A third-party cover is an `Assignment` with `source: "third-party"`, `assigneeId: null` and an
optional free-text `thirdPartyLabel` ("Grandma", max 60 characters).** Nothing else is added: no
entity, no login, no contact details, nothing the app sends to the helper.

- **Day state.** `dayState()` returns `Resolved` (reason `third-party-covers`) for such an
  assignment whoever is absent — a third party cannot record an absence, so unlike a member
  assignee it is never "now absent". Surfaced as **Sorted**; still no 5th state.
- **Same semantics as a direct claim** (ADR-0001): either member can record it on any contested day,
  it replaces whatever assignment was there, and it auto-withdraws an open request. A Declined
  request stays terminal and is never re-raised.
- **One notification** — `third-party-cover` (event 13), to the other member only. It stands in for
  the "bumped" and "withdrawn" notices that same action would otherwise also send them (ADR-0018:
  one per recipient and event).
- **Schema.** `assignments.third_party_label` plus a check that a `third-party` row has no
  `assignee_id`. The check is one-directional because a deleted member nulls `assignee_id` on
  member-sourced rows.

## Alternatives considered

- **A `third_parties` table / saved helper list.** Honest model, but a CRUD surface (settings screen,
  choosing, deleting) for a household that has three or four helpers at most. A free-text label is
  enough; revisit if people retype the same names.
- **`assigneeId: null` with no source, label in a separate table.** `null` already means "nobody" and
  is At-risk (`no-one-assigned`); overloading it would make "nobody" and "covered by someone" depend
  on a side lookup. An explicit `source` keeps `dayState()` a pure read of the assignment.
- **Treating it as a `direct-claim` by the arranging parent.** Wrong picture: that parent is not
  collecting, and the other parent would be told they are.

## Consequences

- SPEC's non-goal now reads "a persisted third-party entity, login or notifying the helper".
- Anything that switches on `AssignmentSource` or reads `assigneeId` as "who collects" must treat
  `third-party` as covered (`dayState`, the calendar copy do; the at-risk cron and the app-icon badge
  derive from `dayState()` and need nothing).
