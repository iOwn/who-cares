/**
 * Third-party cover (issue #183, ADR-0023) — a parent records that they have
 * arranged someone outside the household (grandparent, friend, sitter) to do
 * pickup on a childcare day. The second way back to coverage besides a direct
 * claim (`./directClaim`).
 *
 * The third party is not an entity and never signs in or hears from the app: it
 * is an `Assignment` with `source: "third-party"`, `assigneeId: null` and an
 * optional free-text label. Like a direct claim it is an explicit human action,
 * so the newest action wins with no confirmation step (ADR-0001): it replaces
 * any existing assignment and auto-withdraws an `Open` request on the day.
 *
 * Notifications are returned for the caller to dispatch after commit. The other
 * member gets exactly one `third-party-cover` notice (never the actor); if they
 * were also the withdrawn request's requester, or the bumped assignee, this one
 * notice stands in for those — one per (recipient, event) and no pile-up.
 */

import type {
  AssignmentRepository,
  Clock,
  IdGenerator,
  MemberRepository,
  Notification,
  PickupRequestRepository,
} from "../ports";
import type { Assignment, CalendarDate, PickupRequest } from "../types";
import { isPastDate, todayOf } from "./pickupRequestGeneration";

/** Catalogue event 13 — recipient: the member who did not arrange the cover. */
export const THIRD_PARTY_COVER_EVENT = "third-party-cover";

/** Longest label we store; the UI field and the Server Action both enforce it. */
export const MAX_THIRD_PARTY_LABEL_LENGTH = 60;

/** Trim a label; blank → `null`. Length is the caller's check against `MAX_THIRD_PARTY_LABEL_LENGTH`. */
export function normalizeThirdPartyLabel(label: string | null | undefined): string | null {
  const trimmed = (label ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export interface ThirdPartyCoverDeps {
  readonly pickupRequests: PickupRequestRepository;
  readonly assignments: AssignmentRepository;
  readonly members: MemberRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface ArrangeThirdPartyCoverInput {
  readonly householdId: string;
  readonly date: CalendarDate;
  /** The signed-in member who arranged it. */
  readonly actingMemberId: string;
  /** Optional free text, already within `MAX_THIRD_PARTY_LABEL_LENGTH`. */
  readonly label?: string | null;
}

export interface ArrangeThirdPartyCoverResult {
  readonly assignment: Assignment;
  readonly replacedAssignment: Assignment | null;
  /** The `Open` request this cover auto-withdrew, in its `Withdrawn` state, or `null`. */
  readonly withdrawnRequest: PickupRequest | null;
  /** Dispatch after commit. Never addressed to the acting member. */
  readonly notifications: readonly Notification[];
}

export async function arrangeThirdPartyCover(
  deps: ThirdPartyCoverDeps,
  input: ArrangeThirdPartyCoverInput,
): Promise<ArrangeThirdPartyCoverResult> {
  const { householdId, date, actingMemberId } = input;
  const label = normalizeThirdPartyLabel(input.label);

  const members = await deps.members.listByHousehold(householdId);
  const actorName = members.find((m) => m.id === actingMemberId)?.name ?? "The other parent";

  const replaced = await deps.assignments.findByDate(householdId, date);
  const assignment: Assignment = {
    id: deps.ids.next(),
    householdId,
    date,
    assigneeId: null,
    source: "third-party",
    thirdPartyLabel: label,
    createdAt: deps.clock.now(),
  };
  // `UNIQUE (household_id, date)` is on the row — delete-then-insert, as `claimDay`.
  if (replaced !== null) await deps.assignments.delete(replaced.id);
  await deps.assignments.save(assignment);

  // An open request on the day no longer needs an answer. Withdrawn silently:
  // the one `third-party-cover` notice below tells the other parent what changed.
  const openRequest = await deps.pickupRequests.findByDate(householdId, date);
  let withdrawnRequest: PickupRequest | null = null;
  if (openRequest !== null && openRequest.state === "Open") {
    withdrawnRequest = { ...openRequest, state: "Withdrawn" };
    await deps.pickupRequests.save(withdrawnRequest);
  }

  // A past day is inert (#182): nobody is notified about it.
  const notifications: Notification[] = [];
  if (!isPastDate(date, todayOf(deps.clock))) {
    const who = label ?? "someone else";
    for (const member of members) {
      if (member.id === actingMemberId) continue;
      notifications.push({
        recipientId: member.id,
        event: THIRD_PARTY_COVER_EVENT,
        title: `${actorName} arranged cover for ${date}`,
        body: `${actorName} has arranged for ${who} to do pickup on ${date}.`,
        subjectLabel: date,
      });
    }
  }

  return { assignment, replacedAssignment: replaced, withdrawnRequest, notifications };
}
