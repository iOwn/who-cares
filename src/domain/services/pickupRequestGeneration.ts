/**
 * Absence → pickup-request generation (SPEC.md "Pickup requests", CONTEXT.md;
 * ADR-0005). The front half of the core loop: when a parent declares a one-off
 * absence, work out which childcare days inside it need the other parent asked,
 * raise one `PickupRequest` per such day, and fire a single bundled digest
 * notification for the whole absence-creation action.
 *
 * Two layers, both framework-free and tested without a database
 * (`docs/testing.md` §4):
 *
 *   - `planPickupRequests()` — the pure, table-driven decision. Given the
 *     already-loaded pattern / closures / absences / assignments / existing
 *     requests, it returns one `RequestPlanEntry` per **childcare day** in the
 *     range, each flagged `raise` or carrying a `skipReason`. Non-childcare days
 *     (weekends, closures, off-pattern) produce no entry at all.
 *   - `recordAbsence()` — the repo-driven service the Server Action is a thin
 *     adapter over. Persists the `Absence`, materialises the planned requests,
 *     and calls the `notifier` port **once** (the digest), never per day.
 *
 * The rules (SPEC.md "Pickup requests"):
 *   - childcare day, exactly one parent absent, no assignment, no prior request
 *     → raise.
 *   - both parents absent that day → no request (the day goes straight to
 *     At-risk via live derivation — ADR-0003).
 *   - the day already has an assignment (any assignee, any source) → no request.
 *   - a request already exists for that day (any state — never re-raised,
 *     CONTEXT.md) → no request.
 */

import type {
  AbsenceRepository,
  AssignmentRepository,
  ChildcarePatternRepository,
  Clock,
  ClosureRepository,
  IdGenerator,
  MemberRepository,
  Notifier,
  PickupRequestRepository,
} from "../ports";
import type {
  Absence,
  Assignment,
  CalendarDate,
  ChildcarePattern,
  Closure,
  PickupRequest,
} from "../types";
import { isChildcareDay } from "./childcareDay";

/** Why a childcare day inside an absence did *not* raise a pickup request. */
export type RequestSkipReason =
  | "both-absent"
  | "already-assigned"
  | "request-exists"
  | "requester-not-absent";

/** One childcare day inside the absence range and what the generator decided. */
export interface RequestPlanEntry {
  readonly date: CalendarDate;
  /** `true` ⇒ a `PickupRequest` should be raised for this day. */
  readonly raise: boolean;
  /** Set iff `raise` is `false`. */
  readonly skipReason?: RequestSkipReason;
}

export interface PlanPickupRequestsParams {
  /** Inclusive absence bounds. */
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
  /** The absent member the absence belongs to. */
  readonly requesterId: string;
  readonly pattern: ChildcarePattern | null;
  readonly closures: readonly Closure[];
  /**
   * Every absence in scope — **including the one being recorded**. Used both to
   * confirm the requester is actually absent on a day and to detect the
   * both-absent case.
   */
  readonly absences: readonly Absence[];
  readonly assignments: readonly Assignment[];
  /** Existing pickup requests, any state — a day that has one is never re-asked. */
  readonly existingRequests: readonly PickupRequest[];
}

/** An absence covers `date` when its inclusive `startDate`–`endDate` span it. */
function absenceCovers(absence: Absence, date: CalendarDate): boolean {
  return absence.startDate <= date && date <= absence.endDate;
}

/** Every `'YYYY-MM-DD'` from `start` to `end` inclusive, chronological. */
export function eachDateInclusive(start: CalendarDate, end: CalendarDate): CalendarDate[] {
  if (end < start) return [];
  const dates: CalendarDate[] = [];
  const [y, m, d] = start.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  while (cursor.getTime() <= endMs) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * The pure decision: one entry per childcare day in `[startDate, endDate]`,
 * each flagged `raise` or carrying a `skipReason`. Deterministic, no clock, no
 * repository — the same seam `dayState()` and `childcareDay` follow.
 */
export function planPickupRequests(params: PlanPickupRequestsParams): RequestPlanEntry[] {
  const { startDate, endDate, requesterId, pattern, closures, absences, assignments } = params;

  const assignedDates = new Set(assignments.map((a) => a.date));
  const requestedDates = new Set(params.existingRequests.map((r) => r.date));

  const entries: RequestPlanEntry[] = [];
  for (const date of eachDateInclusive(startDate, endDate)) {
    if (!isChildcareDay(pattern, closures, date)) continue;

    const absentIds = new Set(
      absences.filter((a) => absenceCovers(a, date)).map((a) => a.memberId),
    );

    if (!absentIds.has(requesterId)) {
      entries.push({ date, raise: false, skipReason: "requester-not-absent" });
    } else if (absentIds.size >= 2) {
      entries.push({ date, raise: false, skipReason: "both-absent" });
    } else if (assignedDates.has(date)) {
      entries.push({ date, raise: false, skipReason: "already-assigned" });
    } else if (requestedDates.has(date)) {
      entries.push({ date, raise: false, skipReason: "request-exists" });
    } else {
      entries.push({ date, raise: true });
    }
  }
  return entries;
}

export interface RecordAbsenceDeps {
  readonly absences: AbsenceRepository;
  readonly pickupRequests: PickupRequestRepository;
  readonly assignments: AssignmentRepository;
  readonly childcarePattern: ChildcarePatternRepository;
  readonly closures: ClosureRepository;
  readonly members: MemberRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly notifier: Notifier;
}

export interface RecordAbsenceInput {
  readonly householdId: string;
  /** The member declaring the absence. */
  readonly memberId: string;
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
  readonly label?: string;
  readonly note?: string;
}

export interface RecordAbsenceResult {
  readonly absence: Absence;
  /** The pickup requests raised by this absence, one per covered childcare day. */
  readonly requests: readonly PickupRequest[];
  /** The plan behind `requests` — every childcare day in range and its verdict. */
  readonly plan: readonly RequestPlanEntry[];
}

/** Event key from the notification catalogue (issue #5). */
export const PICKUP_REQUEST_RECEIVED_EVENT = "pickup-request-received";

function requestDigestBody(count: number, requesterName: string): string {
  const days = count === 1 ? "one childcare day" : `${count} childcare days`;
  return `${requesterName} is out and asked you to cover pickup on ${days}. Open the app to accept or decline each day.`;
}

/**
 * Record a one-off absence and raise its pickup requests.
 *
 * Persists the `Absence`, then plans and materialises one `PickupRequest`
 * (state `Open`, `raisedAt = clock.now()`) per covered childcare day, then
 * calls the `notifier` port **once** with a bundled digest addressed to the
 * other parent — never one notification per day (SPEC.md "Pickup requests";
 * each day inside the digest stays individually accept/declinable, handled in
 * #52). Returns nothing to dispatch when no request fired.
 *
 * The caller runs this against repositories bound to one transaction so the
 * absence and its requests commit together.
 */
export async function recordAbsence(
  deps: RecordAbsenceDeps,
  input: RecordAbsenceInput,
): Promise<RecordAbsenceResult> {
  if (input.endDate < input.startDate) {
    throw new Error(`absence endDate ${input.endDate} is before startDate ${input.startDate}`);
  }

  const members = await deps.members.listByHousehold(input.householdId);
  const requester = members.find((m) => m.id === input.memberId);
  if (!requester) {
    throw new Error(`member ${input.memberId} is not in household ${input.householdId}`);
  }
  const other = members.find((m) => m.id !== input.memberId);
  if (!other) {
    throw new Error(`household ${input.householdId} has no second member to ask`);
  }

  const absence: Absence = {
    id: deps.ids.next(),
    householdId: input.householdId,
    memberId: input.memberId,
    startDate: input.startDate,
    endDate: input.endDate,
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };
  await deps.absences.save(absence);

  // Sequential, not `Promise.all`: the caller runs this inside one transaction,
  // and a single DB connection cannot serve parallel statements.
  const pattern = await deps.childcarePattern.findByHousehold(input.householdId);
  const closures = await deps.closures.listByHousehold(input.householdId);
  const allAbsences = await deps.absences.listByHousehold(input.householdId);
  const assignments = await deps.assignments.listByHousehold(input.householdId);
  const existingRequests = await deps.pickupRequests.listByHousehold(input.householdId);

  const plan = planPickupRequests({
    startDate: input.startDate,
    endDate: input.endDate,
    requesterId: input.memberId,
    pattern,
    closures,
    absences: allAbsences,
    assignments,
    existingRequests,
  });

  const raisedAt = deps.clock.now();
  const requests: PickupRequest[] = plan
    .filter((entry) => entry.raise)
    .map((entry) => ({
      id: deps.ids.next(),
      householdId: input.householdId,
      date: entry.date,
      requesterId: input.memberId,
      recipientId: other.id,
      absenceId: absence.id,
      state: "Open" as const,
      raisedAt,
    }));

  for (const request of requests) {
    await deps.pickupRequests.save(request);
  }

  if (requests.length > 0) {
    await deps.notifier.notify({
      recipientId: other.id,
      event: PICKUP_REQUEST_RECEIVED_EVENT,
      title: `${requester.name} asked you to cover pickup`,
      body: requestDigestBody(requests.length, requester.name),
    });
  }

  return { absence, requests, plan };
}
