/**
 * Third-party cover (issue #183, ADR-0023) — exercised over in-memory fake
 * repositories, no database (ADR-0005), mirroring `directClaim.test.ts`.
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
import { arrangeThirdPartyCover, THIRD_PARTY_COVER_EVENT } from "./thirdPartyCover";

const HOUSEHOLD_ID = "household-1";
const ARRANGER = MEMBER_1_ID;
const OTHER = MEMBER_2_ID;
const DATE = "2025-01-07";
const NOW = new Date("2025-01-04T09:00:00.000Z");

function createFakes(
  options: { requests?: readonly PickupRequest[]; assignments?: readonly Assignment[] } = {},
) {
  const requests: PickupRequest[] = [...(options.requests ?? [])];
  const assignments: Assignment[] = [...(options.assignments ?? [])];
  const members: Member[] = [
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
    async countOpenForRecipient(memberId) {
      return requests.filter((r) => r.state === "Open" && r.recipientId === memberId).length;
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
    requesterId: ARRANGER,
    recipientId: OTHER,
    absenceId: "abs-1",
    state: "Open",
    ...over,
  });

const input = (label?: string | null, date = DATE) => ({
  householdId: HOUSEHOLD_ID,
  date,
  actingMemberId: ARRANGER,
  label,
});

beforeEach(resetIdCounter);

describe("arrangeThirdPartyCover", () => {
  it("writes a third-party assignment with a trimmed label and tells the other parent once", async () => {
    const { deps, assignments } = createFakes();

    const result = await arrangeThirdPartyCover(deps, input("  Grandma  "));

    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      date: DATE,
      assigneeId: null,
      source: "third-party",
      thirdPartyLabel: "Grandma",
    });
    expect(result.notifications).toEqual([
      expect.objectContaining({
        recipientId: OTHER,
        event: THIRD_PARTY_COVER_EVENT,
        title: "Alex arranged cover for 2025-01-07",
        body: "Alex has arranged for Grandma to do pickup on 2025-01-07.",
      }),
    ]);
  });

  it("stores a blank label as null and words the notice generically", async () => {
    const { deps, assignments } = createFakes();

    const result = await arrangeThirdPartyCover(deps, input("   "));

    expect(assignments[0]?.thirdPartyLabel).toBeNull();
    expect(result.notifications[0]?.body).toContain("someone else");
  });

  it("replaces an existing assignment and sends one notice, not a bump notice too", async () => {
    const { deps, assignments } = createFakes({
      assignments: [
        makeAssignment({ id: "a-1", date: DATE, assigneeId: OTHER, householdId: HOUSEHOLD_ID }),
      ],
    });

    const result = await arrangeThirdPartyCover(deps, input("Uncle Sam"));

    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.source).toBe("third-party");
    expect(result.replacedAssignment?.id).toBe("a-1");
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]?.event).toBe(THIRD_PARTY_COVER_EVENT);
  });

  it("auto-withdraws an open request without a separate withdrawn notice", async () => {
    const { deps, requests } = createFakes({ requests: [openRequest()] });

    const result = await arrangeThirdPartyCover(deps, input("Gran"));

    expect(requests[0]?.state).toBe("Withdrawn");
    expect(result.withdrawnRequest?.state).toBe("Withdrawn");
    expect(result.notifications.map((n) => n.event)).toEqual([THIRD_PARTY_COVER_EVENT]);
  });

  it("leaves a Declined request terminal", async () => {
    const { deps, requests } = createFakes({ requests: [openRequest({ state: "Declined" })] });

    const result = await arrangeThirdPartyCover(deps, input("Gran"));

    expect(requests[0]?.state).toBe("Declined");
    expect(result.withdrawnRequest).toBeNull();
  });

  it("never notifies the acting member", async () => {
    const { deps } = createFakes();

    const result = await arrangeThirdPartyCover(deps, input("Gran"));

    expect(result.notifications.every((n) => n.recipientId !== ARRANGER)).toBe(true);
  });

  it("sends nothing for a past day (#182) but still records the cover", async () => {
    const { deps, assignments } = createFakes({ requests: [openRequest({ date: "2025-01-02" })] });

    const result = await arrangeThirdPartyCover(deps, input("Gran", "2025-01-02"));

    expect(assignments).toHaveLength(1);
    expect(result.notifications).toEqual([]);
  });
});
