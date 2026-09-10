/**
 * Direct claim (`docs/testing.md` §4) — the explicit-human-action override,
 * exercised over in-memory fake repositories, no database (ADR-0005).
 *
 * The seams under test (SPEC.md "Direct claim", ADR-0001, issue #5 catalogue
 * events 6 + 7):
 *   - a claim on an unassigned day writes an `Assignment` (`source:
 *     "direct-claim"`), no notification;
 *   - a claim over someone else's assignment deletes the old row, writes a new
 *     one, and notifies the bumped parent after the fact (event 7);
 *   - an `Open` pickup request on the day auto-withdraws, the requester is told
 *     (event 6);
 *   - the acting member is never notified about their own claim.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  MEMBER_1_ID,
  MEMBER_2_ID,
  makeAssignment,
  makeMember,
  makePickupRequest,
  resetIdCounter,
} from "@/testing";
import type {
  AssignmentRepository,
  Clock,
  IdGenerator,
  MemberRepository,
  PickupRequestRepository,
} from "../ports";
import type { Assignment, Member, PickupRequest } from "../types";
import { claimDay, DIRECT_CLAIM_EVENT } from "./directClaim";
import { PICKUP_REQUEST_WITHDRAWN_EVENT } from "./pickupRequestResolution";

const HOUSEHOLD_ID = "household-1";
const CLAIMANT = MEMBER_1_ID;
const OTHER = MEMBER_2_ID;
const DATE = "2025-01-07";
const NOW = new Date("2025-01-04T09:00:00.000Z");

function createFakes(
  options: {
    requests?: readonly PickupRequest[];
    assignments?: readonly Assignment[];
    members?: readonly Member[];
  } = {},
) {
  const requests: PickupRequest[] = [...(options.requests ?? [])];
  const assignments: Assignment[] = [...(options.assignments ?? [])];
  const members = options.members ?? [
    makeMember({ id: MEMBER_1_ID, name: "Alex" }),
    makeMember({ id: MEMBER_2_ID, name: "Bailey" }),
  ];

  const pickupRequests: PickupRequestRepository = {
    async findById(id) {
      return requests.find((r) => r.id === id) ?? null;
    },
    async findByDate(householdId, date) {
      return requests.find((r) => r.householdId === householdId && r.date === date) ?? null;
    },
    async listByHousehold() {
      return [...requests];
    },
    async save(request) {
      const i = requests.findIndex((r) => r.id === request.id);
      if (i >= 0) requests[i] = request;
      else requests.push(request);
    },
  };

  const assignmentRepo: AssignmentRepository = {
    async findByDate(householdId, date) {
      return assignments.find((a) => a.householdId === householdId && a.date === date) ?? null;
    },
    async listByHousehold() {
      return [...assignments];
    },
    async save(assignment) {
      const i = assignments.findIndex((a) => a.id === assignment.id);
      if (i >= 0) assignments[i] = assignment;
      else assignments.push(assignment);
    },
    async delete(id) {
      const i = assignments.findIndex((a) => a.id === id);
      if (i >= 0) assignments.splice(i, 1);
    },
  };

  const memberRepo: MemberRepository = {
    async findById(id) {
      return members.find((m) => m.id === id) ?? null;
    },
    async findByEmail(email) {
      return members.find((m) => m.email === email) ?? null;
    },
    async listByHousehold() {
      return [...members];
    },
    async save() {},
  };

  const clock: Clock = { now: () => NOW };
  const ids: IdGenerator = { next: () => "new-assignment" };

  return {
    deps: { pickupRequests, assignments: assignmentRepo, members: memberRepo, clock, ids },
    requests,
    assignments,
  };
}

const openRequest = (over: Partial<PickupRequest> = {}) =>
  makePickupRequest({
    id: "req-1",
    householdId: HOUSEHOLD_ID,
    date: DATE,
    requesterId: OTHER,
    recipientId: CLAIMANT,
    absenceId: "abs-1",
    state: "Open",
    ...over,
  });

beforeEach(resetIdCounter);

describe("claimDay", () => {
  it("claims an unassigned day: writes a direct-claim assignment, no notification", async () => {
    const { deps, assignments } = createFakes();

    const result = await claimDay(deps, {
      householdId: HOUSEHOLD_ID,
      date: DATE,
      actingMemberId: CLAIMANT,
    });

    expect(result.assignment).toMatchObject({
      id: "new-assignment",
      householdId: HOUSEHOLD_ID,
      date: DATE,
      assigneeId: CLAIMANT,
      source: "direct-claim",
      createdAt: NOW,
    });
    expect(result.replacedAssignment).toBeNull();
    expect(result.withdrawnRequest).toBeNull();
    expect(result.notifications).toEqual([]);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].assigneeId).toBe(CLAIMANT);
  });

  it("overwrites the other parent's assignment: deletes the old row, notifies them (event 7)", async () => {
    const existing = makeAssignment({
      id: "old-assignment",
      householdId: HOUSEHOLD_ID,
      date: DATE,
      assigneeId: OTHER,
      source: "accepted-request",
    });
    const { deps, assignments } = createFakes({ assignments: [existing] });

    const result = await claimDay(deps, {
      householdId: HOUSEHOLD_ID,
      date: DATE,
      actingMemberId: CLAIMANT,
    });

    expect(result.replacedAssignment).toMatchObject({ id: "old-assignment", assigneeId: OTHER });
    // Exactly one row for the day — the new direct claim.
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({ id: "new-assignment", assigneeId: CLAIMANT });

    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({
      event: DIRECT_CLAIM_EVENT,
      recipientId: OTHER,
    });
  });

  it("auto-withdraws an open pickup request on the day and tells the requester (event 6)", async () => {
    const { deps, requests } = createFakes({
      // Claimant is the recipient of a request the other parent raised.
      requests: [openRequest({ requesterId: OTHER, recipientId: CLAIMANT })],
    });

    const result = await claimDay(deps, {
      householdId: HOUSEHOLD_ID,
      date: DATE,
      actingMemberId: CLAIMANT,
    });

    expect(result.withdrawnRequest).toMatchObject({ id: "req-1", state: "Withdrawn" });
    expect(requests[0].state).toBe("Withdrawn");
    expect(result.notifications).toEqual([
      expect.objectContaining({
        event: PICKUP_REQUEST_WITHDRAWN_EVENT,
        recipientId: OTHER,
      }),
    ]);
  });

  it("handles an open request AND a nobody-assignment on the same day", async () => {
    const nobody = makeAssignment({
      id: "old-assignment",
      date: DATE,
      assigneeId: null,
      source: "direct-claim",
    });
    const { deps, assignments, requests } = createFakes({
      assignments: [nobody],
      requests: [openRequest({ requesterId: OTHER, recipientId: CLAIMANT })],
    });

    const result = await claimDay(deps, {
      householdId: HOUSEHOLD_ID,
      date: DATE,
      actingMemberId: CLAIMANT,
    });

    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({ id: "new-assignment", assigneeId: CLAIMANT });
    expect(requests[0].state).toBe("Withdrawn");
    // Nobody was bumped (assigneeId was null) — only the event-6 requester notice.
    expect(result.notifications).toEqual([
      expect.objectContaining({ event: PICKUP_REQUEST_WITHDRAWN_EVENT, recipientId: OTHER }),
    ]);
  });

  it("claiming a day you already cover: writes a fresh row, never self-notifies", async () => {
    const mine = makeAssignment({
      id: "old-assignment",
      date: DATE,
      assigneeId: CLAIMANT,
      source: "accepted-request",
    });
    const { deps, assignments } = createFakes({ assignments: [mine] });

    const result = await claimDay(deps, {
      householdId: HOUSEHOLD_ID,
      date: DATE,
      actingMemberId: CLAIMANT,
    });

    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({ id: "new-assignment", source: "direct-claim" });
    expect(result.notifications).toEqual([]);
  });

  it("never notifies the acting member (claimant withdraws their own open request)", async () => {
    const { deps } = createFakes({
      // Claimant raised the request themselves (they're absent) then claims anyway.
      requests: [openRequest({ requesterId: CLAIMANT, recipientId: OTHER })],
    });

    const result = await claimDay(deps, {
      householdId: HOUSEHOLD_ID,
      date: DATE,
      actingMemberId: CLAIMANT,
    });

    for (const n of result.notifications) {
      expect(n.recipientId).not.toBe(CLAIMANT);
    }
  });
});
