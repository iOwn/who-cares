/**
 * The at-risk escalation backstop (SPEC.md "Notifications", ADR-0004, issue #5
 * catalogue events 9 + 10).
 *
 * Day state is always derived live at read time (ADR-0003), so a parent opening
 * the app between cron runs already sees the right state — this service exists
 * only to send the *notification* for a day that has newly become at-risk. Per
 * ADR-0004 that notification is allowed to lag by up to a day, so a single
 * once-daily Vercel Cron tick is the whole mechanism:
 *
 *   - event 9  — both parents absent on a childcare day;
 *   - event 10 — a childcare day went at-risk without both parents being away
 *     (an open request crossed a 48h threshold — ADR-0003 — or an assignee later
 *     recorded their own absence).
 *
 * Both notify **both** members (the two actor-less catalogue events).
 *
 * Two layers, both framework-free and tested without a database
 * (`docs/testing.md` §4), mirroring `pickupRequestGeneration.ts`:
 *
 *   - `planAtRiskEscalations()` — the pure decision over already-loaded
 *     `DayStateFacts`, reusing `dayState()` so the "is this day at-risk, and
 *     why?" question has exactly one implementation.
 *   - `runAtRiskEscalation()` — repo-driven; loads the household's facts for a
 *     forward window, plans, writes the "already told them" ledger, and returns
 *     the notifications for the cron handler to dispatch. The handler is a thin
 *     adapter over this (ADR-0005).
 */

import type {
  AbsenceRepository,
  AssignmentRepository,
  AtRiskEscalationRepository,
  ChildcarePatternRepository,
  Clock,
  ClosureRepository,
  MemberRepository,
  Notification,
  PickupRequestRepository,
} from "../ports";
import type { CalendarDate } from "../types";
import { isChildcareDay } from "./childcareDay";
import { type DayStateFacts, dayState } from "./dayState";
import {
  DAY_AT_RISK_BOTH_ABSENT_EVENT,
  DAY_AT_RISK_ESCALATED_EVENT,
} from "./notificationCatalogue";
import { eachDateInclusive, todayOf } from "./pickupRequestGeneration";

/** How far forward `runAtRiskEscalation` scans by default, in days. */
export const DEFAULT_ESCALATION_HORIZON_DAYS = 28;

/** One childcare day the backstop is telling both parents about. */
export interface AtRiskEscalation {
  readonly date: CalendarDate;
  /** `DAY_AT_RISK_BOTH_ABSENT_EVENT` (9) or `DAY_AT_RISK_ESCALATED_EVENT` (10). */
  readonly event: string;
  /** One notification per recipient — always both members. */
  readonly notifications: readonly Notification[];
}

export interface PlanAtRiskEscalationsParams {
  /** Already-loaded facts for each date in the scan window. */
  readonly days: readonly DayStateFacts[];
  /** The recipients — every member of the household (both). */
  readonly memberIds: readonly string[];
  /**
   * `${date}:${event}` keys the household has already been notified about —
   * built by `escalationKey`. Keyed by event, not just date, so a day already
   * flagged event 10 can still fire the more urgent event 9.
   */
  readonly alreadyNotified: ReadonlySet<string>;
  readonly now: Date;
}

/** The `alreadyNotified` set key for one `(date, event)` pair. */
export function escalationKey(date: CalendarDate, event: string): string {
  return `${date}:${event}`;
}

/** Plain, calm, factual copy per event (SPEC.md — never urgency- or guilt-toned). */
function escalationCopy(event: string, date: CalendarDate): { title: string; body: string } {
  if (event === DAY_AT_RISK_BOTH_ABSENT_EVENT) {
    return {
      title: `Pickup on ${date} needs a plan`,
      body: `You're both marked away on ${date} and no one is down for pickup. One of you can claim the day or arrange cover in the app.`,
    };
  }
  return {
    title: `Pickup on ${date} isn't settled`,
    body: `${date} is a childcare day with no one confirmed for pickup yet. Open the app to accept the request or claim the day.`,
  };
}

/**
 * The pure decision: which days in `days` are at-risk, not yet notified, and so
 * need one notification per member. Deterministic — `dayState()` does the
 * "is it at-risk?" work, this only maps the reason to an event and builds copy.
 */
export function planAtRiskEscalations(params: PlanAtRiskEscalationsParams): AtRiskEscalation[] {
  const escalations: AtRiskEscalation[] = [];

  for (const facts of params.days) {
    const { state, reason } = dayState(facts, params.now);
    if (state !== "At-risk") continue;

    const event =
      reason === "both-absent" ? DAY_AT_RISK_BOTH_ABSENT_EVENT : DAY_AT_RISK_ESCALATED_EVENT;
    if (params.alreadyNotified.has(escalationKey(facts.date, event))) continue;

    const { title, body } = escalationCopy(event, facts.date);

    escalations.push({
      date: facts.date,
      event,
      notifications: params.memberIds.map((recipientId) => ({
        recipientId,
        event,
        title,
        body,
      })),
    });
  }

  return escalations;
}

/* ------------------------------------------------------------------ *
 * Repo-driven service.
 * ------------------------------------------------------------------ */

export interface AtRiskEscalationDeps {
  readonly members: MemberRepository;
  readonly childcarePattern: ChildcarePatternRepository;
  readonly closures: ClosureRepository;
  readonly absences: AbsenceRepository;
  readonly pickupRequests: PickupRequestRepository;
  readonly assignments: AssignmentRepository;
  readonly atRiskEscalations: AtRiskEscalationRepository;
  readonly clock: Clock;
}

export interface RunAtRiskEscalationInput {
  readonly householdId: string;
  /** Days forward from today to scan. Defaults to `DEFAULT_ESCALATION_HORIZON_DAYS`. */
  readonly horizonDays?: number;
}

export interface RunAtRiskEscalationResult {
  readonly escalations: readonly AtRiskEscalation[];
  /** Every notification to dispatch — flattened across `escalations`. */
  readonly notifications: readonly Notification[];
}

/**
 * Scan a household's childcare days for the next `horizonDays`, notify both
 * parents about each that is newly at-risk, and record it in the ledger so a
 * later cron tick does not re-send.
 *
 * The ledger write happens here (not in the caller) so the cron handler stays a
 * thin adapter and this whole decision is unit-tested. A dispatch that fails
 * after the ledger row is written is not retried — acceptable for a calm,
 * whole-day-granularity notification (ADR-0004), and the day's *state* is still
 * correct live regardless.
 */
export async function runAtRiskEscalation(
  deps: AtRiskEscalationDeps,
  input: RunAtRiskEscalationInput,
): Promise<RunAtRiskEscalationResult> {
  const { householdId } = input;
  const horizonDays = input.horizonDays ?? DEFAULT_ESCALATION_HORIZON_DAYS;

  const members = await deps.members.listByHousehold(householdId);
  const memberIds = members.map((m) => m.id);

  const today = todayOf(deps.clock);
  const horizonEnd = addDays(today, horizonDays);

  const pattern = await deps.childcarePattern.findByHousehold(householdId);
  const closures = await deps.closures.listByHousehold(householdId);
  const absences = await deps.absences.listByHousehold(householdId);
  const assignments = await deps.assignments.listByHousehold(householdId);
  const requests = await deps.pickupRequests.listByHousehold(householdId);
  const alreadyNotified = new Set(
    (await deps.atRiskEscalations.listNotified(householdId)).map((r) =>
      escalationKey(r.date, r.event),
    ),
  );

  const days: DayStateFacts[] = eachDateInclusive(today, horizonEnd).map((date) => {
    const openRequest = requests.find((r) => r.date === date && r.state === "Open") ?? null;
    const absentMemberIds = [
      ...new Set(
        absences.filter((a) => a.startDate <= date && date <= a.endDate).map((a) => a.memberId),
      ),
    ];
    return {
      date,
      isChildcareDay: isChildcareDay(pattern, closures, date),
      assignment: assignments.find((a) => a.date === date) ?? null,
      openRequest,
      absentMemberIds,
    };
  });

  const escalations = planAtRiskEscalations({
    days,
    memberIds,
    alreadyNotified,
    now: deps.clock.now(),
  });

  const notifiedAt = deps.clock.now();
  for (const escalation of escalations) {
    await deps.atRiskEscalations.record(householdId, escalation.date, escalation.event, notifiedAt);
  }

  return {
    escalations,
    notifications: escalations.flatMap((e) => e.notifications),
  };
}

/** `'YYYY-MM-DD'` plus `days` (UTC, no zone drift). */
function addDays(date: CalendarDate, days: number): CalendarDate {
  const [y, m, d] = date.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}
