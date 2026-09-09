/**
 * Recurring-mode absence generation (SPEC.md "Absence entry" → Recurring;
 * `docs/testing.md` §"What deserves a test" point 4; issue #54).
 *
 * The Recurring tab of the "+ I'm out" form lets a parent pick a weekday set and
 * a date range instead of a single span. This module turns that choice into a
 * batch of **ordinary one-off `Absence`s** — one per matching weekday in range —
 * and records each through exactly the same path a hand-entered one-off takes
 * (`recordAbsence` → `planPickupRequests`). Nothing here persists a recurrence
 * rule of its own: once generated, the absences are indistinguishable from any
 * other.
 *
 * Two layers, both framework-free (ADR-0005), matching the shape of
 * `pickupRequestGeneration`:
 *
 *   - `planRecurringAbsences()` — the pure, table-driven decision. Given
 *     `{ weekdays, startDate, endDate, today, memberId, existingAbsences }` it
 *     returns every matching weekday in the (capped) range, each flagged
 *     `alreadyCovered`, plus the `toCreate` list of single-day absence inputs
 *     for the days that are *not* yet covered. The 4-week-from-today cap is
 *     applied **here**, in the generator, not just in the form field.
 *   - `recordRecurringAbsences()` — the repo-driven service the Server Action is
 *     a thin adapter over. Runs the plan, then calls `recordAbsence` once per
 *     `toCreate` day (so each generated absence raises its pickup requests just
 *     as a one-off does), and returns a single bundled digest for the whole
 *     batch — one notification per form submission, not one per day.
 *
 * Idempotency falls out of the plan: a day already inside an existing absence
 * for the same member is flagged `alreadyCovered` and never re-created, so
 * re-running the same weekday/range selection is a silent no-op.
 */

import type { Notification } from "../ports";
import type { Absence, CalendarDate, PickupRequest, Weekday } from "../types";
import { weekdayOf } from "./childcareDay";
import {
  AbsenceInputError,
  eachDateInclusive,
  MAX_ABSENCE_SPAN_DAYS,
  PICKUP_REQUEST_RECEIVED_EVENT,
  pickupRequestDigestBody,
  type RecordAbsenceDeps,
  type RecordAbsenceResult,
  recordAbsence,
} from "./pickupRequestGeneration";

/**
 * How far ahead the recurring generator will reach: the last day it will create
 * an absence for is this many days after real today. The same 28-day figure as
 * the one-off form's `MAX_ABSENCE_SPAN_DAYS` cap (SPEC.md "Absence entry" — "end
 * date hard-capped at 4 weeks from today"), named separately because this bound
 * is measured **from today**, whereas `MAX_ABSENCE_SPAN_DAYS` bounds the length
 * of a single absence span.
 */
export const MAX_RECURRING_HORIZON_DAYS = MAX_ABSENCE_SPAN_DAYS;

/** Add `n` whole days to a `'YYYY-MM-DD'` date, staying in `'YYYY-MM-DD'` (UTC, no zone drift). */
function addDays(date: CalendarDate, n: number): CalendarDate {
  const [year, month, day] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** A single-day one-off absence the generator wants created. */
export interface RecurringAbsenceInput {
  readonly memberId: string;
  /** `startDate === endDate` — every generated absence is exactly one day. */
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
}

/** One matching weekday inside the (capped) range and whether it is already covered. */
export interface RecurringAbsenceDay {
  readonly date: CalendarDate;
  /** `true` ⇒ an existing absence for this member already spans `date`; it will be skipped. */
  readonly alreadyCovered: boolean;
}

export interface PlanRecurringAbsencesParams {
  /** The weekday set the parent picked. Order and duplicates don't matter. */
  readonly weekdays: readonly Weekday[];
  /** Inclusive range bounds the parent picked. */
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
  /** Real today, `'YYYY-MM-DD'` — the origin of the 4-week cap and the past-date floor. */
  readonly today: CalendarDate;
  /** The member declaring the absences. */
  readonly memberId: string;
  /** Every absence already on file for the household (used for the idempotency skip). */
  readonly existingAbsences: readonly Absence[];
}

export interface RecurringAbsencePlan {
  /** The range end after the 4-week-from-today cap (and never before the start). */
  readonly effectiveEndDate: CalendarDate;
  /** The picked `endDate` was past the cap and was clamped to `effectiveEndDate`. */
  readonly capped: boolean;
  /** Every matching weekday in `[max(startDate, today), effectiveEndDate]`, chronological. */
  readonly days: readonly RecurringAbsenceDay[];
  /** One single-day absence input per matching weekday that is not `alreadyCovered`. */
  readonly toCreate: readonly RecurringAbsenceInput[];
}

/** An existing absence covers `date` when its inclusive span contains it. */
function absenceCovers(absence: Absence, date: CalendarDate): boolean {
  return absence.startDate <= date && date <= absence.endDate;
}

/**
 * The pure decision: which single-day absences a weekday-set + date-range
 * selection should create. Deterministic — no clock (today is passed in), no
 * repository. The 4-week-from-today cap and the "no past days" floor are both
 * enforced here so a hand-crafted Server Action call can't walk an unbounded
 * range.
 */
export function planRecurringAbsences(params: PlanRecurringAbsencesParams): RecurringAbsencePlan {
  const { weekdays, startDate, endDate, today, memberId, existingAbsences } = params;

  const weekdaySet = new Set<Weekday>(weekdays);
  const capDate = addDays(today, MAX_RECURRING_HORIZON_DAYS);

  // Floor the start at today (the field enforces this too) and cap the end at
  // four weeks out — both silently, matching the one-off form's field bounds.
  const effectiveStart = startDate < today ? today : startDate;
  const capped = endDate > capDate;
  let effectiveEndDate = capped ? capDate : endDate;
  // An end before the (floored) start can't yield any day; keep the field
  // non-empty and let the range guard below produce the empty plan.
  if (effectiveEndDate < effectiveStart) effectiveEndDate = effectiveStart;

  const coveringForMember = existingAbsences.filter((a) => a.memberId === memberId);

  const days: RecurringAbsenceDay[] = [];
  if (weekdaySet.size > 0 && endDate >= effectiveStart) {
    for (const date of eachDateInclusive(effectiveStart, effectiveEndDate)) {
      if (!weekdaySet.has(weekdayOf(date))) continue;
      const alreadyCovered = coveringForMember.some((a) => absenceCovers(a, date));
      days.push({ date, alreadyCovered });
    }
  }

  const toCreate: RecurringAbsenceInput[] = days
    .filter((day) => !day.alreadyCovered)
    .map((day) => ({ memberId, startDate: day.date, endDate: day.date }));

  return { effectiveEndDate, capped, days, toCreate };
}

export interface RecordRecurringAbsencesInput {
  readonly householdId: string;
  /** The member declaring the absences. */
  readonly memberId: string;
  readonly weekdays: readonly Weekday[];
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
  /** Free-text label / note applied identically to every generated absence. */
  readonly label?: string;
  readonly note?: string;
}

export interface RecordRecurringAbsencesResult {
  /** The plan behind the batch — every matching day, its coverage, the cap verdict. */
  readonly plan: RecurringAbsencePlan;
  /** The absences actually created this call (empty on an idempotent re-run). */
  readonly absences: readonly Absence[];
  /** Every pickup request raised across the whole batch. */
  readonly requests: readonly PickupRequest[];
  /**
   * A single bundled digest for the other parent covering the whole batch, or
   * `null` when no request fired. The caller dispatches it after the
   * transaction commits — this service never touches the `notifier` port, the
   * same contract `recordAbsence` follows.
   */
  readonly notification: Notification | null;
}

/**
 * Generate and record a batch of one-off absences from a weekday-set + range
 * selection.
 *
 * Plans the days (applying the 4-week cap and skipping days already covered),
 * then records each remaining day through `recordAbsence` so every generated
 * absence raises its pickup requests exactly as a hand-entered one-off would.
 * The per-day digests `recordAbsence` returns are discarded in favour of one
 * bundled digest for the whole submission.
 *
 * The caller runs this against repositories bound to a single transaction, so
 * the whole batch — every absence and every request — commits together.
 * Sequential, not `Promise.all`: one DB connection can't serve parallel
 * statements, and each `recordAbsence` must see the rows the previous one wrote.
 */
export async function recordRecurringAbsences(
  deps: RecordAbsenceDeps,
  input: RecordRecurringAbsencesInput,
): Promise<RecordRecurringAbsencesResult> {
  if (input.weekdays.length === 0) {
    throw new AbsenceInputError("Pick at least one weekday to repeat.");
  }
  if (input.endDate < input.startDate) {
    throw new AbsenceInputError("The end date can't be before the start date.");
  }

  const today = deps.clock.now().toISOString().slice(0, 10);
  const existingAbsences = await deps.absences.listByHousehold(input.householdId);

  const plan = planRecurringAbsences({
    weekdays: input.weekdays,
    startDate: input.startDate,
    endDate: input.endDate,
    today,
    memberId: input.memberId,
    existingAbsences,
  });

  const absences: Absence[] = [];
  const requests: PickupRequest[] = [];
  for (const day of plan.toCreate) {
    const outcome: RecordAbsenceResult = await recordAbsence(deps, {
      householdId: input.householdId,
      memberId: input.memberId,
      startDate: day.startDate,
      endDate: day.endDate,
      ...(input.label?.trim() ? { label: input.label.trim() } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    });
    absences.push(outcome.absence);
    requests.push(...outcome.requests);
  }

  const notification = await buildBatchDigest(deps, input, requests);
  return { plan, absences, requests, notification };
}

/** One digest for the whole batch, addressed to the other parent — or `null` if nothing fired. */
async function buildBatchDigest(
  deps: Pick<RecordAbsenceDeps, "members">,
  input: RecordRecurringAbsencesInput,
  requests: readonly PickupRequest[],
): Promise<Notification | null> {
  if (requests.length === 0) return null;

  const members = await deps.members.listByHousehold(input.householdId);
  const requester = members.find((m) => m.id === input.memberId);
  const other = members.find((m) => m.id !== input.memberId);
  // If either were missing, the first `recordAbsence` would already have thrown.
  if (!requester || !other) return null;

  return {
    recipientId: other.id,
    event: PICKUP_REQUEST_RECEIVED_EVENT,
    title: `${requester.name} asked you to cover pickup`,
    body: pickupRequestDigestBody(requests.length, requester.name),
  };
}
