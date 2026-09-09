/**
 * The live **Day state** derivation (ADR-0003, CONTEXT.md "Day state").
 *
 * A childcare day surfaces as exactly one of `Resolved | Pending | At-risk |
 * n/a`, computed at read time and **never stored** — it re-evaluates against the
 * current assignment, the open pickup request's age, and who is absent every
 * time it is read (ADR-0003 "day state can't be cached from the Assignment
 * alone").
 *
 * `dayState()` is pure over already-loaded data: the caller resolves "is this a
 * childcare day?" (`isChildcareDay`, `./childcareDay`), the one open request for
 * the date, the assignment, and the absent-member ids, then passes them in with
 * an explicit `now`. Nothing here reads a clock or a repository — the same seam
 * `./childcareDay` follows, and the reason the whole thing drops into the `node`
 * Vitest project.
 *
 * It returns the state **and** a `reason` discriminant — the branch it took —
 * so the presentation layer can pick its copy off a single source of truth
 * rather than re-deriving the same predicates (`src/ui/calendarMonth.ts`). The
 * `n/a` → `closed` / `off` / `quiet` widening still lives in
 * `src/ui/dayDisplayState.ts`, not here.
 */

import type { Assignment, CalendarDate, PickupRequest } from "../types";

/**
 * The derived status a childcare day surfaces as (CONTEXT.md). Stays EXACTLY
 * these four names in code and the glossary; the UI shows friendlier labels.
 */
export type DayState = "Resolved" | "Pending" | "At-risk" | "n/a";

/**
 * Which branch `dayState()` took — a discriminant the presentation layer maps
 * to copy so the pill and the sentence can never disagree.
 */
export type DayStateReason =
  | "not-childcare-day"
  | "assignee-covers"
  | "uncontested"
  | "both-absent"
  | "assignee-now-absent"
  | "no-one-assigned"
  | "request-pending"
  | "request-escalated"
  | "uncovered-no-request";

export interface DayStateResult {
  readonly state: DayState;
  readonly reason: DayStateReason;
}

/** 48 hours in milliseconds — both ADR-0003 escalation clocks span this. */
export const AT_RISK_THRESHOLD_MS = 48 * 60 * 60 * 1000;

/** The already-loaded facts about one date that `dayState()` folds into a state. */
export interface DayStateFacts {
  /** The date being derived, `'YYYY-MM-DD'`. */
  readonly date: CalendarDate;
  /**
   * Whether `date` is a childcare day at all — a pattern weekday with no
   * closure (`isChildcareDay`, `./childcareDay`). `false` ⇒ the state is always
   * `n/a`, whatever else is passed.
   */
  readonly isChildcareDay: boolean;
  /** The assignment for `date`, or `null`. Its `assigneeId` may itself be `null` (nobody). */
  readonly assignment: Assignment | null;
  /**
   * The single **open** pickup request for `date`, or `null`. Callers pass a
   * request only while its `state` is `"Open"` — a Declined / Withdrawn request
   * is not an open request and the day falls back to needing a direct claim.
   */
  readonly openRequest: PickupRequest | null;
  /**
   * Ids of the members absent on `date` — **distinct**, 0–2 entries. The
   * "both members absent" branch is `length >= 2`, so the caller must dedupe
   * (overlapping absence rows for one member collapse to one id).
   */
  readonly absentMemberIds: readonly string[];
}

/**
 * Whether an open pickup request raised at `raisedAt` for `childcareDay` has
 * crossed either ADR-0003 escalation threshold by `now`: 48h since it was
 * raised (long silence on a far-out request), **or** 48h before the childcare
 * day itself (a near-term request that never got a fair silence window). The
 * day flips to At-risk the instant either is crossed — whichever comes first.
 *
 * "48h before the day" counts back from the day's **UTC midnight**, matching
 * the app's zone-free `'YYYY-MM-DD'` date model (`../types`). For a viewer well
 * off UTC this leans a few hours early or late — a deliberate, documented
 * trade-off, not a bug: the alternative (a per-viewer zone) has no home in a
 * model where a childcare day is a bare date.
 */
export function hasCrossedAtRiskThreshold(
  raisedAt: Date,
  childcareDay: CalendarDate,
  now: Date,
): boolean {
  const nowMs = now.getTime();
  const sinceRaised = nowMs - raisedAt.getTime() >= AT_RISK_THRESHOLD_MS;
  const dayStartMs = Date.parse(`${childcareDay}T00:00:00.000Z`);
  const withinLeadTime = nowMs >= dayStartMs - AT_RISK_THRESHOLD_MS;
  return sinceRaised || withinLeadTime;
}

/**
 * Derive a childcare day's live Day state (+ reason) from its current facts and
 * `now`.
 *
 * - Not a childcare day → `n/a`.
 * - An assignee who is **not** absent that day → `Resolved` (an accepted
 *   request or a direct claim; the assignee covers it).
 * - Otherwise no safe assignee. Both members absent → `At-risk` immediately
 *   (no request is ever raised).
 * - An open request → `Pending` until it crosses either 48h threshold
 *   (ADR-0003), then `At-risk`.
 * - No open request but the day is contested — an assignee who has since
 *   recorded their own absence (the Assignment row is left untouched — ADR-0003),
 *   or a lone absent member whose request was Declined / Withdrawn → `At-risk`.
 * - Nothing assigned, no request, nobody away → `n/a` (an uncontested day).
 */
export function dayState(facts: DayStateFacts, now: Date): DayStateResult {
  const { date, isChildcareDay, assignment, openRequest, absentMemberIds } = facts;

  if (!isChildcareDay) return { state: "n/a", reason: "not-childcare-day" };

  const assigneeId = assignment?.assigneeId ?? null;
  const assigneeCovers = assigneeId !== null && !absentMemberIds.includes(assigneeId);
  if (assigneeCovers) return { state: "Resolved", reason: "assignee-covers" };

  // No safe assignee from here: nobody assigned, "nobody" explicitly assigned,
  // or the assignee has since recorded their own absence for this date.

  // Both members absent → straight to At-risk; no request is ever raised.
  if (absentMemberIds.length >= 2) return { state: "At-risk", reason: "both-absent" };

  if (openRequest !== null) {
    return hasCrossedAtRiskThreshold(openRequest.raisedAt, date, now)
      ? { state: "At-risk", reason: "request-escalated" }
      : { state: "Pending", reason: "request-pending" };
  }

  // A contested childcare day with no open request to fall back on.
  if (assigneeId !== null && absentMemberIds.includes(assigneeId)) {
    return { state: "At-risk", reason: "assignee-now-absent" };
  }
  if (assignment !== null) return { state: "At-risk", reason: "no-one-assigned" };
  if (absentMemberIds.length >= 1) return { state: "At-risk", reason: "uncovered-no-request" };

  // Uncontested childcare day: nothing assigned, no request, nobody away.
  return { state: "n/a", reason: "uncontested" };
}
