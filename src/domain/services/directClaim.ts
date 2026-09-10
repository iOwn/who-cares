/**
 * Direct claim (SPEC.md "Direct claim", ADR-0001, CONTEXT.md; issue #5
 * catalogue events 6 + 7).
 *
 * The explicit-human-action override: a parent claims a childcare day outright,
 * assigned or not. The newest claim wins with **no confirmation step** (ADR-0001)
 * — the one case where the app silently reassigns, because the claim itself is
 * the deliberate human action the "never auto-reassign" rule is about. It is
 * also the only route back to coverage after a pickup request is Declined or
 * Withdrawn (there is no in-app re-ask).
 *
 * Framework-free and tested without a database (`docs/testing.md` §4), mirroring
 * `pickupRequestResolution.ts`:
 *
 *   - `claimDay` is repo-driven; the Server Action is a thin adapter over it.
 *     It writes the new `Assignment` (`source: "direct-claim"`), overwriting any
 *     existing one for the day (delete-then-insert — `UNIQUE (household_id, date)`
 *     is on the row, not the id, so replacing it is the caller's job, not the
 *     adapter's), auto-withdraws an `Open` pickup request that sat on the day
 *     (event 6), and **returns** the notifications for the caller to dispatch
 *     after the transaction commits — it never touches the `notifier` port.
 *
 * The rules:
 *   - The previously-assigned parent, if any (a real member, not "nobody" and
 *     not the claimant), is notified **after the fact**, not asked first
 *     (event 7).
 *   - An `Open` pickup request on the day auto-withdraws; its original requester
 *     is told the day is covered now (event 6 — `withdrawnNotification` with
 *     reason `"day-claimed"`).
 *   - The acting member is never notified about their own claim (the
 *     "never self-notify" rule, issue #5) — this drops the event-6 notice when
 *     the claimant happens to be the request's requester.
 *   - A claim on an at-risk day (the assignee has since gone absent) resolves it
 *     with no extra logic here — `dayState()` derives Resolved from the new
 *     assignment at read time.
 */

import type {
  AssignmentRepository,
  Clock,
  IdGenerator,
  MemberRepository,
  Notification,
  PickupRequestRepository,
} from "../ports";
import type { Assignment, CalendarDate, Member, PickupRequest } from "../types";
import { withdrawnNotification } from "./pickupRequestResolution";

/** Catalogue event 7 — recipient: the previously-assigned member, if any. */
export const DIRECT_CLAIM_EVENT = "direct-claim";

function nameLookup(members: readonly Member[]): (id: string) => string {
  const byId = new Map(members.map((m) => [m.id, m.name]));
  return (id) => byId.get(id) ?? "the other parent";
}

/** The event-7 notice to the parent a claim bumped off the day. */
function directClaimNotification(
  assignment: Assignment,
  previousAssigneeId: string,
  claimantName: string,
): Notification {
  return {
    recipientId: previousAssigneeId,
    event: DIRECT_CLAIM_EVENT,
    title: `${claimantName} took over pickup on ${assignment.date}`,
    body: `${claimantName} claimed pickup for ${assignment.date}, so you're no longer down for that day.`,
  };
}

export interface DirectClaimDeps {
  readonly pickupRequests: PickupRequestRepository;
  readonly assignments: AssignmentRepository;
  readonly members: MemberRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface ClaimDayInput {
  readonly householdId: string;
  readonly date: CalendarDate;
  /** The signed-in member doing the claiming — becomes the assignee. */
  readonly actingMemberId: string;
}

export interface ClaimDayResult {
  /** The new `direct-claim` assignment now covering the day. */
  readonly assignment: Assignment;
  /** The assignment this claim overwrote, or `null` if the day was unassigned. */
  readonly replacedAssignment: Assignment | null;
  /** The `Open` pickup request this claim auto-withdrew, in its `Withdrawn` state, or `null`. */
  readonly withdrawnRequest: PickupRequest | null;
  /**
   * Notifications to dispatch after the transaction commits: the event-7 notice
   * to a bumped parent, and/or the event-6 notice to a withdrawn request's
   * requester. Never addressed to the acting member.
   */
  readonly notifications: readonly Notification[];
}

/**
 * Claim a childcare day outright. Overwrites any existing assignment; withdraws
 * an open pickup request on the day; leaves the notifications to the caller.
 */
export async function claimDay(
  deps: DirectClaimDeps,
  input: ClaimDayInput,
): Promise<ClaimDayResult> {
  const { householdId, date, actingMemberId } = input;

  const members = await deps.members.listByHousehold(householdId);
  const nameOf = nameLookup(members);

  const replaced = await deps.assignments.findByDate(householdId, date);

  const assignment: Assignment = {
    id: deps.ids.next(),
    householdId,
    date,
    assigneeId: actingMemberId,
    source: "direct-claim",
    createdAt: deps.clock.now(),
  };

  // `UNIQUE (household_id, date)` is on the row — swap by delete-then-insert so
  // the new claim doesn't collide with the one it replaces.
  if (replaced !== null) {
    await deps.assignments.delete(replaced.id);
  }
  await deps.assignments.save(assignment);

  const notifications: Notification[] = [];

  // Event 7 — the parent who held the day is told after the fact (never asked).
  if (replaced !== null && replaced.assigneeId !== null && replaced.assigneeId !== actingMemberId) {
    notifications.push(
      directClaimNotification(assignment, replaced.assigneeId, nameOf(actingMemberId)),
    );
  }

  // Event 6 — an open request on the day no longer needs an answer.
  const openRequest = await deps.pickupRequests.findByDate(householdId, date);
  let withdrawnRequest: PickupRequest | null = null;
  if (openRequest !== null && openRequest.state === "Open") {
    withdrawnRequest = { ...openRequest, state: "Withdrawn" };
    await deps.pickupRequests.save(withdrawnRequest);
    notifications.push(withdrawnNotification(openRequest, "day-claimed", nameOf));
  }

  return {
    assignment,
    replacedAssignment: replaced,
    withdrawnRequest,
    // Never notify the actor about their own claim (issue #5 "never self-notify").
    notifications: notifications.filter((n) => n.recipientId !== actingMemberId),
  };
}
