/**
 * The notification event catalogue (issue #5, SPEC.md "Notifications") — the one
 * place every event key and its coalescing classification live.
 *
 * The 12 events are produced across the functional slices: events 1–8 by the
 * pickup-request services (#51–#53), events 9–10 by the at-risk escalation
 * service (`./atRiskEscalation`), events 11–12 by the childcare-settings actions
 * (#49, wired in #55). This module does not produce any of them — it classifies
 * them, so the `Notifier` (`src/notifications/`) and the full-matrix test have a
 * single source of truth for "does this event coalesce?".
 *
 * Framework-free and pure (ADR-0005): string constants and a `Set` membership
 * check, nothing else.
 */

import { ASSIGNMENT_STANDS_EVENT } from "./absenceCancellation";
import { DIRECT_CLAIM_EVENT } from "./directClaim";
import { PICKUP_REQUEST_RECEIVED_EVENT } from "./pickupRequestGeneration";
import {
  PICKUP_REQUEST_ACCEPTED_EVENT,
  PICKUP_REQUEST_DECLINED_EVENT,
  PICKUP_REQUEST_WITHDRAWN_EVENT,
} from "./pickupRequestResolution";

/* ------------------------------------------------------------------ *
 * Event keys the at-risk backstop and the settings actions own.
 * The pickup-request event keys are re-exported from their own services.
 * ------------------------------------------------------------------ */

/** Catalogue event 9 — both parents absent on a childcare day; recipients: both members. */
export const DAY_AT_RISK_BOTH_ABSENT_EVENT = "day-at-risk-both-absent";
/**
 * Catalogue event 10 — a childcare day became at-risk without both parents being
 * away (an open request crossed a 48h threshold, or an assignee later went
 * absent). Recipients: both members. Fires on the cron tick.
 */
export const DAY_AT_RISK_ESCALATED_EVENT = "day-at-risk-escalated";

/** Catalogue event 11 — the childcare pattern changed; recipient: the other member. Coalescable. */
export const CHILDCARE_PATTERN_CHANGED_EVENT = "childcare-pattern-changed";
/** Catalogue event 12 — a closure was added; recipient: the other member. Coalescable. */
export const CLOSURE_ADDED_EVENT = "closure-added";

/**
 * Every event key in the catalogue, for the full-matrix test to iterate. Order
 * follows issue #5's numbered list.
 */
export const NOTIFICATION_EVENTS = [
  PICKUP_REQUEST_RECEIVED_EVENT,
  PICKUP_REQUEST_ACCEPTED_EVENT,
  PICKUP_REQUEST_DECLINED_EVENT,
  PICKUP_REQUEST_WITHDRAWN_EVENT,
  DIRECT_CLAIM_EVENT,
  ASSIGNMENT_STANDS_EVENT,
  DAY_AT_RISK_BOTH_ABSENT_EVENT,
  DAY_AT_RISK_ESCALATED_EVENT,
  CHILDCARE_PATTERN_CHANGED_EVENT,
  CLOSURE_ADDED_EVENT,
] as const;

/**
 * The events that coalesce: repeated edits to the *same record* within a
 * 5-minute rolling window collapse into one notification of the final state
 * (issue #5, SPEC.md). Only the two settings events — every request-lifecycle
 * and at-risk event is immediate and one-shot.
 */
export const COALESCABLE_EVENTS: ReadonlySet<string> = new Set([
  CHILDCARE_PATTERN_CHANGED_EVENT,
  CLOSURE_ADDED_EVENT,
]);

/** The rolling coalescing window, in milliseconds (issue #5: 5 minutes). */
export const COALESCE_WINDOW_MS = 5 * 60 * 1000;

/** Whether `event` collapses repeated same-record edits into one notification. */
export function isCoalescableEvent(event: string): boolean {
  return COALESCABLE_EVENTS.has(event);
}
