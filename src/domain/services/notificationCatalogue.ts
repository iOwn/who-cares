/**
 * The notification event catalogue (issue #5, SPEC.md "Notifications") — the one
 * place every event key lives.
 *
 * The 12 events are produced across the functional slices: events 1–8 by the
 * pickup-request services (#51–#53), events 9–10 by the at-risk escalation
 * service (`./atRiskEscalation`), events 11–12 by the childcare-settings actions
 * (#49, wired in #55). This module does not produce any of them — it names
 * them, so the full-matrix test and `./notificationBundling` have a single
 * source of truth for "what events are there?".
 *
 * Framework-free and pure (ADR-0005): string constants, nothing else.
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

/** Catalogue event 11 — the childcare pattern changed; recipient: the other member. */
export const CHILDCARE_PATTERN_CHANGED_EVENT = "childcare-pattern-changed";
/** Catalogue event 12 — a closure was added; recipient: the other member. */
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
