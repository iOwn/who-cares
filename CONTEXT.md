# WhoCares

WhoCares helps the two parents in one household keep exactly one of them
responsible for collecting their child from childcare each day, by turning
"I can't do it that day" into an explicit request the other parent answers.

## Language

### The household

**Household**:
The single family unit the app serves — its members, its child, its
childcare pattern and closures. A first-class entity; v1 runs exactly one.

**Member**:
A parent — one of exactly two per household — who signs in and can be held
responsible for pickups.
_Avoid_: User, account

**Child**:
The person collected from childcare. Carries only a display name in v1;
exactly one per household.

### The childcare calendar

**Childcare pattern**:
The weekdays on which the child is normally in childcare and needs
collecting. One per household. (Shape and editing rules: issue #6.)

**Closure**:
A single date on which a weekday the pattern would include has no childcare
after all — public holiday, facility closed, child off sick.
_Avoid_: Holiday, day off

**Childcare day**:
A concrete date the child needs collecting: included by the childcare
pattern and not removed by a closure. A derived concept computed from
pattern + closures, never a stored record.
_Avoid_: Pickup day, care day

### Coordination

**Absence**:
A member's declaration that they are unavailable for pickup across a range
of consecutive dates (startDate–endDate, inclusive). Carries an optional
free-text label and note, neither of which changes app behaviour.
_Avoid_: Unavailability, trip, out-of-office

**Pickup request**:
Raised automatically when an absence covers a childcare day; asks the
other member to take responsibility for that day's pickup. One per covered
childcare day, answered by accept or decline. (Lifecycle: issue #3.)
_Avoid_: Wish, ask

**Assignment**:
The record of who is responsible for collecting the child on a given
childcare day. At most one per date; its assignee is a member or nobody.
Arises from an accepted pickup request or a member directly claiming the
day.
_Avoid_: Responsibility, duty, slot

**At-risk day**:
A childcare day whose pickup is not safely covered. A derived status that
drives UI highlighting and notifications. (Exact predicate: issue #4.)
_Avoid_: Gap, conflict
