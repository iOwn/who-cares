/**
 * Pickup-request resolution (SPEC.md "Pickup requests", CONTEXT.md; ADR-0005).
 * The back half of the core loop: the asked parent answers, and requests tidy
 * themselves up when they stop needing an answer.
 *
 * Two layers, both framework-free and tested without a database
 * (`docs/testing.md` §4), mirroring `pickupRequestGeneration.ts`:
 *
 *   - pure guards / notification builders — deterministic, no clock, no repo.
 *   - `acceptRequest` / `declineRequest` / `withdrawRequest` — repo-driven
 *     services the Server Actions are thin adapters over. Each transitions the
 *     `Open` request to exactly one terminal state, does its one side effect
 *     (accept also writes an `Assignment`), and **returns** a single
 *     `Notification` for the caller to dispatch after the transaction commits —
 *     it never touches the `notifier` port itself, so a slow send can't hold a
 *     DB transaction open.
 *
 * The rules (SPEC.md, CONTEXT.md, issue #5 catalogue):
 *   - Only an `Open` request transitions; a terminal request never reopens.
 *   - Accept → the responder becomes the assignee, an `Assignment`
 *     (`source: "accepted-request"`) is written, the day derives Resolved.
 *   - Decline → terminal `Declined`; the day derives At-risk and is never
 *     re-raised (a direct claim is the only way back — SPEC.md "Direct claim").
 *   - Auto-Withdraw when the day no longer needs an answer: the requester
 *     withdraws by hand (event 4), the absence behind it is cancelled/shortened
 *     (event 5 — `absenceCancellation.ts`), or an `Assignment` appears for the
 *     day before the response (event 6).
 *   - Each day is answered individually — there is no batch action.
 */

import type {
  AssignmentRepository,
  Clock,
  IdGenerator,
  MemberRepository,
  Notification,
  PickupRequestRepository,
} from "../ports";
import type { Assignment, Member, PickupRequest } from "../types";

/* ------------------------------------------------------------------ *
 * Notification catalogue keys (issue #5).
 * ------------------------------------------------------------------ */

/** Catalogue event 2 — recipient: the original requester. */
export const PICKUP_REQUEST_ACCEPTED_EVENT = "pickup-request-accepted";
/** Catalogue event 3 — recipient: the original requester. */
export const PICKUP_REQUEST_DECLINED_EVENT = "pickup-request-declined";
/** Catalogue events 4–6 — recipient depends on `WithdrawReason`. */
export const PICKUP_REQUEST_WITHDRAWN_EVENT = "pickup-request-withdrawn";

/**
 * Why a pickup request auto-withdrew. Drives the notification recipient and
 * copy (issue #5 catalogue events 4–6):
 *   - `requester-cancelled` — the requester withdrew it by hand (event 4);
 *     recipient is the parent who had it open to answer.
 *   - `absence-cancelled` / `absence-shortened` — the absence behind it changed
 *     so the day is no longer covered by that requester's absence (event 5);
 *     recipient is the parent who had it open to answer.
 *   - `day-claimed` — an `Assignment` appeared for the day before the response
 *     (event 6); recipient is the original requester.
 */
export type WithdrawReason =
  | "requester-cancelled"
  | "absence-cancelled"
  | "absence-shortened"
  | "day-claimed";

/* ------------------------------------------------------------------ *
 * Pure guards + notification builders.
 * ------------------------------------------------------------------ */

/**
 * A resolution failure a caller can surface to the user as-is — the message is
 * plain and non-sensitive (a stale inbox, a request the other parent already
 * answered). Anything else these services throw is a bug or an infrastructure
 * failure and should reach the user only as a generic message.
 */
export class PickupRequestStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PickupRequestStateError";
  }
}

/** Only an `Open` request can transition — narrow `request` or throw. */
export function assertOpenRequest(request: PickupRequest | null): asserts request is PickupRequest {
  if (request === null) {
    throw new PickupRequestStateError("That pickup request could no longer be found.");
  }
  if (request.state !== "Open") {
    throw new PickupRequestStateError(
      `That request is already ${request.state.toLowerCase()}, so it can't be changed now.`,
    );
  }
}

/** The parent a request was addressed to must be the one accepting / declining it. */
function assertRecipient(request: PickupRequest, actingMemberId: string): void {
  if (request.recipientId !== actingMemberId) {
    throw new PickupRequestStateError("That request was sent to the other parent.");
  }
}

/** Only the parent who raised a request can withdraw it by hand. */
function assertRequester(request: PickupRequest, actingMemberId: string): void {
  if (request.requesterId !== actingMemberId) {
    throw new PickupRequestStateError("Only the parent who raised that request can withdraw it.");
  }
}

function nameLookup(members: readonly Member[]): (id: string) => string {
  const byId = new Map(members.map((m) => [m.id, m.name]));
  return (id) => byId.get(id) ?? "the other parent";
}

/** The `Assignment` an accepted request writes — `source: "accepted-request"`. */
export function assignmentFromAcceptedRequest(
  request: PickupRequest,
  id: string,
  createdAt: Date,
): Assignment {
  return {
    id,
    householdId: request.householdId,
    date: request.date,
    assigneeId: request.recipientId,
    source: "accepted-request",
    createdAt,
  };
}

function acceptedNotification(request: PickupRequest, recipientName: string): Notification {
  return {
    recipientId: request.requesterId,
    event: PICKUP_REQUEST_ACCEPTED_EVENT,
    title: `${recipientName} is covering pickup`,
    body: `${recipientName} accepted your pickup request for ${request.date}.`,
  };
}

function declinedNotification(request: PickupRequest, recipientName: string): Notification {
  return {
    recipientId: request.requesterId,
    event: PICKUP_REQUEST_DECLINED_EVENT,
    title: `${recipientName} can't cover ${request.date}`,
    body: `${recipientName} declined your pickup request for ${request.date}. That day needs a direct claim now.`,
  };
}

/**
 * The withdrawn-request notification (issue #5 catalogue events 4–6). The
 * recipient and copy follow `reason`.
 */
export function withdrawnNotification(
  request: PickupRequest,
  reason: WithdrawReason,
  nameOf: (id: string) => string,
): Notification {
  const requesterName = nameOf(request.requesterId);
  const recipientName = nameOf(request.recipientId);
  switch (reason) {
    case "requester-cancelled":
      return {
        recipientId: request.recipientId,
        event: PICKUP_REQUEST_WITHDRAWN_EVENT,
        title: `${requesterName} withdrew a pickup request`,
        body: `${requesterName} no longer needs you to cover pickup on ${request.date}.`,
      };
    case "absence-cancelled":
    case "absence-shortened":
      return {
        recipientId: request.recipientId,
        event: PICKUP_REQUEST_WITHDRAWN_EVENT,
        title: `${requesterName}'s absence changed`,
        body: `${requesterName}'s absence changed, so their pickup request for ${request.date} was withdrawn.`,
      };
    case "day-claimed":
      return {
        recipientId: request.requesterId,
        event: PICKUP_REQUEST_WITHDRAWN_EVENT,
        title: `Pickup on ${request.date} is covered`,
        body: `Pickup on ${request.date} is now covered, so your request to ${recipientName} was withdrawn.`,
      };
  }
}

/* ------------------------------------------------------------------ *
 * Repo-driven services.
 * ------------------------------------------------------------------ */

export interface PickupRequestResolutionDeps {
  readonly pickupRequests: PickupRequestRepository;
  readonly assignments: AssignmentRepository;
  readonly members: MemberRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface AcceptRequestInput {
  readonly requestId: string;
  /** The signed-in member accepting — must be the request's `recipientId`. */
  readonly actingMemberId: string;
}

export interface AcceptRequestResult {
  /** The request in its new terminal state — `Accepted`, or `Withdrawn` if a claim beat it. */
  readonly request: PickupRequest;
  /** The `Assignment` written by the accept, or `null` when the accept was superseded. */
  readonly assignment: Assignment | null;
  /**
   * `true` ⇒ an `Assignment` already existed for the day (a direct claim landed
   * first), so the request auto-withdrew (event 6) instead of being accepted.
   */
  readonly superseded: boolean;
  /** The single notification to dispatch after the transaction commits. */
  readonly notification: Notification;
}

/**
 * Accept a pickup request: the responder becomes the assignee, an `Assignment`
 * is written, and the day derives Resolved (`dayState`).
 *
 * If an `Assignment` already exists for the day — a direct claim landed before
 * the response — the request auto-withdraws (event 6) rather than colliding with
 * the one-assignment-per-date invariant; `result.superseded` says so.
 */
export async function acceptRequest(
  deps: PickupRequestResolutionDeps,
  input: AcceptRequestInput,
): Promise<AcceptRequestResult> {
  const request = await deps.pickupRequests.findById(input.requestId);
  assertOpenRequest(request);
  assertRecipient(request, input.actingMemberId);

  const members = await deps.members.listByHousehold(request.householdId);
  const nameOf = nameLookup(members);

  const existing = await deps.assignments.findByDate(request.householdId, request.date);
  if (existing !== null) {
    const withdrawn: PickupRequest = { ...request, state: "Withdrawn" };
    await deps.pickupRequests.save(withdrawn);
    return {
      request: withdrawn,
      assignment: null,
      superseded: true,
      notification: withdrawnNotification(request, "day-claimed", nameOf),
    };
  }

  const accepted: PickupRequest = { ...request, state: "Accepted" };
  await deps.pickupRequests.save(accepted);

  const assignment = assignmentFromAcceptedRequest(request, deps.ids.next(), deps.clock.now());
  await deps.assignments.save(assignment);

  return {
    request: accepted,
    assignment,
    superseded: false,
    notification: acceptedNotification(request, nameOf(request.recipientId)),
  };
}

export interface DeclineRequestInput {
  readonly requestId: string;
  /** The signed-in member declining — must be the request's `recipientId`. */
  readonly actingMemberId: string;
}

export interface DeclineRequestResult {
  readonly request: PickupRequest;
  readonly notification: Notification;
}

/**
 * Decline a pickup request: it goes to terminal `Declined`, the day derives
 * At-risk, and it is never re-raised.
 */
export async function declineRequest(
  deps: PickupRequestResolutionDeps,
  input: DeclineRequestInput,
): Promise<DeclineRequestResult> {
  const request = await deps.pickupRequests.findById(input.requestId);
  assertOpenRequest(request);
  assertRecipient(request, input.actingMemberId);

  const members = await deps.members.listByHousehold(request.householdId);
  const declined: PickupRequest = { ...request, state: "Declined" };
  await deps.pickupRequests.save(declined);

  return {
    request: declined,
    notification: declinedNotification(request, nameLookup(members)(request.recipientId)),
  };
}

export interface WithdrawRequestInput {
  readonly requestId: string;
  /** The signed-in member withdrawing — must be the request's `requesterId`. */
  readonly actingMemberId: string;
}

export interface WithdrawRequestResult {
  readonly request: PickupRequest;
  readonly notification: Notification;
}

/**
 * The requester withdraws their own still-`Open` request by hand (issue #5
 * catalogue event 4). The absence-driven auto-withdraw path lives in
 * `absenceCancellation.ts`.
 */
export async function withdrawRequest(
  deps: PickupRequestResolutionDeps,
  input: WithdrawRequestInput,
): Promise<WithdrawRequestResult> {
  const request = await deps.pickupRequests.findById(input.requestId);
  assertOpenRequest(request);
  assertRequester(request, input.actingMemberId);

  const members = await deps.members.listByHousehold(request.householdId);
  const withdrawn: PickupRequest = { ...request, state: "Withdrawn" };
  await deps.pickupRequests.save(withdrawn);

  return {
    request: withdrawn,
    notification: withdrawnNotification(request, "requester-cancelled", nameLookup(members)),
  };
}
