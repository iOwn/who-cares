/**
 * Cancelling / shortening an absence (SPEC.md "Absence entry", CONTEXT.md;
 * ADR-0003, issue #5 catalogue events 5 + 8).
 *
 * When an absence is cancelled or shortened, the calendar simply drops the
 * trip. The one knock-on effect is on that member's still-`Open` pickup
 * requests: a request whose day is no longer covered by any absence of that
 * requester stops needing an answer, so it auto-**Withdraws** (event 5).
 *
 * What it deliberately never does (CONTEXT.md "Assignment", ADR-0003):
 *   - It **never** touches an `Assignment` row — an accepted request's
 *     assignment stands on its own once made. No `assignments.save`, no
 *     `assignments.delete` anywhere in this module.
 *   - It **never** re-derives or re-opens a resolved day. Resolution, if the
 *     day still needs it, is a manual direct claim.
 *   - A later change to the absence does not retroactively alter an `Assignment`
 *     that already arose from an accepted request; the assignee is merely told
 *     it still stands (event 8).
 *
 * Two layers, mirroring `pickupRequestGeneration.ts`:
 *   - `planAbsenceChange()` — the pure decision over already-loaded facts.
 *   - `cancelAbsence()` / `shortenAbsence()` — repo-driven, the Server Action's
 *     thin adapter. They persist the absence change, withdraw the affected
 *     requests, and **return** the notifications for the caller to dispatch
 *     after commit.
 */

import type {
  AbsenceRepository,
  AssignmentRepository,
  MemberRepository,
  Notification,
  PickupRequestRepository,
} from "../ports";
import type { Absence, Assignment, CalendarDate, Member, PickupRequest } from "../types";
import { AbsenceInputError, eachDateInclusive } from "./pickupRequestGeneration";
import { withdrawnNotification } from "./pickupRequestResolution";

/** Catalogue event 8 — recipient: the assignee whose accepted pickup still stands. */
export const ASSIGNMENT_STANDS_EVENT = "assignment-stands";

/** New inclusive bounds for a shorten, or `null` for a full cancel. */
export type RevisedAbsenceBounds = {
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
} | null;

export interface PlanAbsenceChangeParams {
  /** The absence as it stands before the change. */
  readonly original: Absence;
  /** `null` ⇒ the absence is cancelled outright; otherwise its new bounds. */
  readonly revised: RevisedAbsenceBounds;
  /**
   * Every absence **of the original's member** as it will stand *after* the
   * change (the revised row included; the cancelled row excluded). Used to
   * decide whether a dropped day is still covered by another overlapping
   * absence of that member.
   */
  readonly requesterAbsencesAfter: readonly Absence[];
  /** Every still-`Open` pickup request in the household. */
  readonly openRequests: readonly PickupRequest[];
  /** Every assignment in the household. */
  readonly assignments: readonly Assignment[];
}

export interface AbsenceChangePlan {
  /** Days the change removes from this member's absence coverage. */
  readonly droppedDates: readonly CalendarDate[];
  /** This member's `Open` requests on a dropped day — each auto-withdraws. */
  readonly requestsToWithdraw: readonly PickupRequest[];
  /**
   * Accepted-request assignments on a dropped day — left untouched, the
   * assignee is only told they still stand.
   */
  readonly standingAssignments: readonly Assignment[];
}

function coversDate(
  bounds: { startDate: CalendarDate; endDate: CalendarDate },
  date: CalendarDate,
) {
  return bounds.startDate <= date && date <= bounds.endDate;
}

/**
 * The pure decision: which days a cancel / shorten drops from a member's
 * coverage, and which of their `Open` requests and standing assignments sit on
 * those days. Deterministic, no clock, no repository.
 */
export function planAbsenceChange(params: PlanAbsenceChangeParams): AbsenceChangePlan {
  const { original, revised, requesterAbsencesAfter, openRequests, assignments } = params;

  // A day is still covered by this member if the shortened absence still spans
  // it, or if a *different* absence of theirs does.
  const stillCovered = (date: CalendarDate): boolean =>
    (revised !== null && coversDate(revised, date)) ||
    requesterAbsencesAfter.some((a) => a.id !== original.id && coversDate(a, date));

  const droppedDates = eachDateInclusive(original.startDate, original.endDate).filter(
    (date) => !stillCovered(date),
  );
  const dropped = new Set(droppedDates);

  const requestsToWithdraw = openRequests.filter(
    (r) => r.requesterId === original.memberId && dropped.has(r.date),
  );

  const standingAssignments = assignments.filter(
    (a) => a.source === "accepted-request" && a.assigneeId !== null && dropped.has(a.date),
  );

  return { droppedDates, requestsToWithdraw, standingAssignments };
}

/* ------------------------------------------------------------------ *
 * Repo-driven services.
 * ------------------------------------------------------------------ */

export interface AbsenceCancellationDeps {
  readonly absences: AbsenceRepository;
  readonly pickupRequests: PickupRequestRepository;
  readonly assignments: AssignmentRepository;
  readonly members: MemberRepository;
}

export interface AbsenceChangeResult {
  /** The revised absence, or `null` when it was cancelled outright. */
  readonly absence: Absence | null;
  /** The requests this change auto-withdrew (now in state `Withdrawn`). */
  readonly withdrawnRequests: readonly PickupRequest[];
  /**
   * Notifications to dispatch after the transaction commits: one withdrawn
   * notice per affected request (event 5), plus one "still stands" notice per
   * assignee whose accepted pickup sat on a dropped day (event 8).
   */
  readonly notifications: readonly Notification[];
}

function nameLookup(members: readonly Member[]): (id: string) => string {
  const byId = new Map(members.map((m) => [m.id, m.name]));
  return (id) => byId.get(id) ?? "the other parent";
}

async function applyAbsenceChange(
  deps: AbsenceCancellationDeps,
  original: Absence,
  revised: RevisedAbsenceBounds,
  reason: "absence-cancelled" | "absence-shortened",
): Promise<AbsenceChangeResult> {
  const allAbsences = await deps.absences.listByHousehold(original.householdId);
  const revisedAbsence: Absence | null =
    revised === null
      ? null
      : { ...original, startDate: revised.startDate, endDate: revised.endDate };

  const requesterAbsencesAfter = allAbsences
    .filter((a) => a.memberId === original.memberId)
    .map((a) => (a.id === original.id ? revisedAbsence : a))
    .filter((a): a is Absence => a !== null);

  const openRequests = (await deps.pickupRequests.listByHousehold(original.householdId)).filter(
    (r) => r.state === "Open",
  );
  const assignments = await deps.assignments.listByHousehold(original.householdId);

  const plan = planAbsenceChange({
    original,
    revised,
    requesterAbsencesAfter,
    openRequests,
    assignments,
  });

  const nameOf = nameLookup(await deps.members.listByHousehold(original.householdId));

  // Transition the affected requests to their terminal `Withdrawn` state
  // *before* touching the absence row. Never touch an `Assignment` — an
  // accepted request's assignment has no FK to the absence and stands on its
  // own (CONTEXT.md, ADR-0003).
  const withdrawnRequests: PickupRequest[] = [];
  for (const request of plan.requestsToWithdraw) {
    const withdrawn: PickupRequest = { ...request, state: "Withdrawn" };
    await deps.pickupRequests.save(withdrawn);
    withdrawnRequests.push(withdrawn);
  }

  // Now apply the absence change itself. A full cancel deletes the row; the
  // schema's `pickup_requests.absence_id ON DELETE CASCADE` then clears that
  // absence's request rows (the notifications were already built above, and a
  // re-declared absence legitimately raises fresh requests — "never re-raised"
  // guards a *Declined* answer, not a cancellation). A shorten is a plain
  // `UPDATE`, so its `Withdrawn` rows persist.
  let savedAbsence: Absence | null;
  if (revisedAbsence === null) {
    await deps.absences.delete(original.id);
    savedAbsence = null;
  } else {
    await deps.absences.save(revisedAbsence);
    savedAbsence = revisedAbsence;
  }

  const notifications: Notification[] = [
    ...plan.requestsToWithdraw.map((r) => withdrawnNotification(r, reason, nameOf)),
    ...plan.standingAssignments.map(
      (a): Notification => ({
        recipientId: a.assigneeId as string,
        event: ASSIGNMENT_STANDS_EVENT,
        title: `You're still on pickup for ${a.date}`,
        body: `${nameOf(original.memberId)}'s absence changed, but the pickup you accepted for ${a.date} still stands.`,
      }),
    ),
  ];

  return { absence: savedAbsence, withdrawnRequests, notifications };
}

export interface CancelAbsenceInput {
  readonly absenceId: string;
  /** The signed-in member — must own the absence. */
  readonly actingMemberId: string;
}

/**
 * Cancel an absence outright. Deletes the absence, auto-withdraws the member's
 * `Open` requests that it alone covered, and never touches any `Assignment`.
 */
export async function cancelAbsence(
  deps: AbsenceCancellationDeps,
  input: CancelAbsenceInput,
): Promise<AbsenceChangeResult> {
  const original = await loadOwnedAbsence(deps, input.absenceId, input.actingMemberId);
  return applyAbsenceChange(deps, original, null, "absence-cancelled");
}

export interface ShortenAbsenceInput {
  readonly absenceId: string;
  readonly actingMemberId: string;
  /** The new inclusive bounds — must sit within the original range. */
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
}

/**
 * Shorten an absence to a narrower inclusive range. Any day the range no longer
 * covers is treated exactly as a cancel treats its days.
 */
export async function shortenAbsence(
  deps: AbsenceCancellationDeps,
  input: ShortenAbsenceInput,
): Promise<AbsenceChangeResult> {
  const original = await loadOwnedAbsence(deps, input.absenceId, input.actingMemberId);

  if (input.endDate < input.startDate) {
    throw new AbsenceInputError("The end date can't be before the start date.");
  }
  if (input.startDate < original.startDate || input.endDate > original.endDate) {
    throw new AbsenceInputError("A shortened absence has to stay within the original dates.");
  }
  if (input.startDate === original.startDate && input.endDate === original.endDate) {
    throw new AbsenceInputError("Those are already the absence's dates.");
  }

  return applyAbsenceChange(
    deps,
    original,
    { startDate: input.startDate, endDate: input.endDate },
    "absence-shortened",
  );
}

async function loadOwnedAbsence(
  deps: AbsenceCancellationDeps,
  absenceId: string,
  actingMemberId: string,
): Promise<Absence> {
  const absence = await deps.absences.findById(absenceId);
  if (absence === null) {
    throw new AbsenceInputError("That absence no longer exists.");
  }
  if (absence.memberId !== actingMemberId) {
    throw new AbsenceInputError("You can only change an absence you declared.");
  }
  return absence;
}
