/**
 * "What needs this member" — the number on the installed app's icon (issue
 * #174, ADR-0022).
 *
 * Two kinds of item, one count:
 *   - open pickup requests addressed to the member (what the header bell shows);
 *   - at-risk childcare days in the forward window (the "this needs a plan"
 *     days that events 9 and 10 push about), derived live by `dayState()`
 *     (ADR-0003) — never stored, so the number is always current.
 *
 * An at-risk day whose open request is already addressed to the member is the
 * same item as that request, so it is counted once. FYI events (closure added,
 * pattern changed, accepted / declined) are not unresolved and never add to it.
 *
 * Pure over already-loaded data, like `dayState()` and `planAtRiskEscalations()`;
 * `loadNeedsAttentionCount()` is the repository-driven wrapper `dispatch.ts`
 * uses, and `page.tsx` calls the pure parts over the data it has already loaded.
 */

import type {
  AbsenceRepository,
  AssignmentRepository,
  ChildcarePatternRepository,
  Clock,
  ClosureRepository,
  HouseholdRepository,
  MemberRepository,
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
import { type DayStateFacts, dayState } from "./dayState";
import { eachDateInclusive, isPastDate, todayOf } from "./pickupRequestGeneration";
import { mergeClosures, publicHolidayClosures } from "./publicHolidays";

/** How far forward at-risk days are looked for, in days (the cron's horizon). */
export const DEFAULT_ESCALATION_HORIZON_DAYS = 28;

/** `'YYYY-MM-DD'` plus `days` (UTC, no zone drift). */
function addDays(date: CalendarDate, days: number): CalendarDate {
  const [y, m, d] = date.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

export interface BuildDayStateFactsParams {
  readonly pattern: ChildcarePattern | null;
  /** Stored closures **already merged** with the household's public holidays. */
  readonly closures: readonly Closure[];
  readonly absences: readonly Absence[];
  readonly assignments: readonly Assignment[];
  readonly requests: readonly PickupRequest[];
  readonly today: CalendarDate;
  readonly horizonDays: number;
}

/** The `DayStateFacts` for every date from `today` through `today + horizonDays`. */
export function buildDayStateFacts(params: BuildDayStateFactsParams): DayStateFacts[] {
  const { pattern, closures, absences, assignments, requests, today, horizonDays } = params;
  return eachDateInclusive(today, addDays(today, horizonDays)).map((date) => {
    const absentMemberIds = [
      ...new Set(
        absences.filter((a) => a.startDate <= date && date <= a.endDate).map((a) => a.memberId),
      ),
    ];
    return {
      date,
      isChildcareDay: isChildcareDay(pattern, closures, date),
      assignment: assignments.find((a) => a.date === date) ?? null,
      openRequest: requests.find((r) => r.date === date && r.state === "Open") ?? null,
      absentMemberIds,
    };
  });
}

export interface NeedsAttentionParams {
  readonly memberId: string;
  readonly requests: readonly PickupRequest[];
  readonly days: readonly DayStateFacts[];
  readonly now: Date;
}

/** Open requests addressed to `memberId` + at-risk days not already one of those. */
export function needsAttentionCount(params: NeedsAttentionParams): number {
  const { memberId, requests, days, now } = params;
  const today = now.toISOString().slice(0, 10);
  const myRequestDates = new Set(
    requests
      .filter((r) => r.state === "Open" && r.recipientId === memberId && !isPastDate(r.date, today))
      .map((r) => r.date),
  );
  const atRiskOnly = days.filter(
    (facts) => dayState(facts, now).state === "At-risk" && !myRequestDates.has(facts.date),
  ).length;
  return myRequestDates.size + atRiskOnly;
}

export interface NeedsAttentionDeps {
  readonly members: Pick<MemberRepository, "findById">;
  readonly households: Pick<HouseholdRepository, "findById">;
  readonly childcarePattern: Pick<ChildcarePatternRepository, "findByHousehold">;
  readonly closures: Pick<ClosureRepository, "listByHousehold">;
  readonly absences: Pick<AbsenceRepository, "listByHousehold">;
  readonly assignments: Pick<AssignmentRepository, "listByHousehold">;
  readonly pickupRequests: Pick<PickupRequestRepository, "listByHousehold">;
  readonly clock: Clock;
}

/**
 * Load the member's household and compute `needsAttentionCount` at `clock.now()`.
 * A member that no longer exists has nothing waiting: 0.
 */
export async function loadNeedsAttentionCount(
  deps: NeedsAttentionDeps,
  memberId: string,
  horizonDays: number = DEFAULT_ESCALATION_HORIZON_DAYS,
): Promise<number> {
  const member = await deps.members.findById(memberId);
  if (!member) return 0;
  const { householdId } = member;

  const now = deps.clock.now();
  const today = todayOf(deps.clock);
  const [pattern, storedClosures, household, absences, assignments, requests] = await Promise.all([
    deps.childcarePattern.findByHousehold(householdId),
    deps.closures.listByHousehold(householdId),
    deps.households.findById(householdId),
    deps.absences.listByHousehold(householdId),
    deps.assignments.listByHousehold(householdId),
    deps.pickupRequests.listByHousehold(householdId),
  ]);

  const closures = household?.bundesland
    ? mergeClosures(
        storedClosures,
        publicHolidayClosures({
          householdId,
          state: household.bundesland,
          pattern,
          from: today,
          to: addDays(today, horizonDays),
        }),
      )
    : storedClosures;

  const days = buildDayStateFacts({
    pattern,
    closures,
    absences,
    assignments,
    requests,
    today,
    horizonDays,
  });
  return needsAttentionCount({ memberId, requests, days, now });
}
