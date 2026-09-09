/**
 * Pickup-request resolution (`docs/testing.md` §4) — accept / decline / withdraw
 * exercised over in-memory fake repositories, no database (ADR-0005).
 *
 * The seams under test:
 *   - accept writes an `Assignment` (`source: "accepted-request"`) + no re-raise;
 *   - decline is terminal `Declined`;
 *   - each day is answered individually (two requests from one absence, accept
 *     one / decline the other);
 *   - the requester's own by-hand withdraw;
 *   - a claim that lands before the response supersedes an accept;
 *   - the notifier is called once per event, addressed per the #5 catalogue.
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
import {
  acceptRequest,
  declineRequest,
  PICKUP_REQUEST_ACCEPTED_EVENT,
  PICKUP_REQUEST_DECLINED_EVENT,
  PICKUP_REQUEST_WITHDRAWN_EVENT,
  PickupRequestStateError,
  withdrawRequest,
} from "./pickupRequestResolution";

const HOUSEHOLD_ID = "household-1";
/** The absent parent who raised the requests. */
const REQUESTER = MEMBER_1_ID;
/** The parent being asked. */
const RECIPIENT = MEMBER_2_ID;
const NOW = new Date("2025-01-04T09:00:00.000Z");

interface Fakes {
  readonly deps: Parameters<typeof acceptRequest>[0];
  readonly requests: PickupRequest[];
  readonly assignments: Assignment[];
}

function createFakes(
  options: {
    requests?: readonly PickupRequest[];
    assignments?: readonly Assignment[];
    members?: readonly Member[];
  } = {},
): Fakes {
  const requests: PickupRequest[] = [...(options.requests ?? [])];
  const assignments: Assignment[] = [...(options.assignments ?? [])];

  const pickupRequests: PickupRequestRepository = {
    async findById(id) {
      return requests.find((r) => r.id === id) ?? null;
    },
    async findByDate(householdId, date) {
      return requests.find((r) => r.householdId === householdId && r.date === date) ?? null;
    },
    async listByHousehold(householdId) {
      return requests.filter((r) => r.householdId === householdId);
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
    async listByHousehold(householdId) {
      return assignments.filter((a) => a.householdId === householdId);
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

  const members = options.members ?? [
    makeMember({ id: REQUESTER, name: "Alex" }),
    makeMember({ id: RECIPIENT, name: "Bailey" }),
  ];
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

  let counter = 0;
  const ids: IdGenerator = {
    next() {
      counter += 1;
      return `gen-${counter}`;
    },
  };
  const clock: Clock = { now: () => NOW };

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
    date: "2025-01-06",
    requesterId: REQUESTER,
    recipientId: RECIPIENT,
    state: "Open",
    ...over,
  });

beforeEach(resetIdCounter);

describe("acceptRequest", () => {
  it("transitions the request to Accepted and writes an accepted-request Assignment", async () => {
    const fakes = createFakes({ requests: [openRequest()] });

    const result = await acceptRequest(fakes.deps, {
      requestId: "req-1",
      actingMemberId: RECIPIENT,
    });

    expect(result.request.state).toBe("Accepted");
    expect(result.superseded).toBe(false);
    expect(result.assignment).toMatchObject({
      householdId: HOUSEHOLD_ID,
      date: "2025-01-06",
      assigneeId: RECIPIENT,
      source: "accepted-request",
      createdAt: NOW,
    });
    expect(fakes.assignments).toHaveLength(1);
    expect(fakes.requests[0].state).toBe("Accepted");
  });

  it("notifies the original requester once, with the accepted event", async () => {
    const fakes = createFakes({ requests: [openRequest()] });
    const { notification } = await acceptRequest(fakes.deps, {
      requestId: "req-1",
      actingMemberId: RECIPIENT,
    });
    expect(notification).toMatchObject({
      recipientId: REQUESTER,
      event: PICKUP_REQUEST_ACCEPTED_EVENT,
    });
  });

  it("auto-withdraws instead of accepting when an Assignment already exists for the day", async () => {
    const fakes = createFakes({
      requests: [openRequest()],
      assignments: [
        makeAssignment({
          id: "asg-x",
          date: "2025-01-06",
          assigneeId: REQUESTER,
          source: "direct-claim",
        }),
      ],
    });

    const result = await acceptRequest(fakes.deps, {
      requestId: "req-1",
      actingMemberId: RECIPIENT,
    });

    expect(result.superseded).toBe(true);
    expect(result.request.state).toBe("Withdrawn");
    expect(result.assignment).toBeNull();
    // The pre-existing claim is untouched — still exactly one assignment.
    expect(fakes.assignments).toHaveLength(1);
    expect(fakes.assignments[0].id).toBe("asg-x");
    expect(result.notification).toMatchObject({
      recipientId: REQUESTER,
      event: PICKUP_REQUEST_WITHDRAWN_EVENT,
    });
  });

  it("rejects a non-Open request", async () => {
    const fakes = createFakes({ requests: [openRequest({ state: "Declined" })] });
    await expect(
      acceptRequest(fakes.deps, { requestId: "req-1", actingMemberId: RECIPIENT }),
    ).rejects.toBeInstanceOf(PickupRequestStateError);
  });

  it("rejects an accept from anyone but the addressed recipient", async () => {
    const fakes = createFakes({ requests: [openRequest()] });
    await expect(
      acceptRequest(fakes.deps, { requestId: "req-1", actingMemberId: REQUESTER }),
    ).rejects.toBeInstanceOf(PickupRequestStateError);
  });
});

describe("declineRequest", () => {
  it("transitions the request to terminal Declined and writes no Assignment", async () => {
    const fakes = createFakes({ requests: [openRequest()] });

    const result = await declineRequest(fakes.deps, {
      requestId: "req-1",
      actingMemberId: RECIPIENT,
    });

    expect(result.request.state).toBe("Declined");
    expect(fakes.assignments).toHaveLength(0);
    expect(result.notification).toMatchObject({
      recipientId: REQUESTER,
      event: PICKUP_REQUEST_DECLINED_EVENT,
    });
  });

  it("rejects a decline of an already-terminal request", async () => {
    const fakes = createFakes({ requests: [openRequest({ state: "Accepted" })] });
    await expect(
      declineRequest(fakes.deps, { requestId: "req-1", actingMemberId: RECIPIENT }),
    ).rejects.toBeInstanceOf(PickupRequestStateError);
  });
});

describe("each day answered individually", () => {
  it("accepts one request and declines another that came from the same absence", async () => {
    const day1 = openRequest({ id: "req-1", date: "2025-01-06", absenceId: "abs-1" });
    const day2 = openRequest({ id: "req-2", date: "2025-01-07", absenceId: "abs-1" });
    const fakes = createFakes({ requests: [day1, day2] });

    await acceptRequest(fakes.deps, { requestId: "req-1", actingMemberId: RECIPIENT });
    await declineRequest(fakes.deps, { requestId: "req-2", actingMemberId: RECIPIENT });

    expect(fakes.requests.find((r) => r.id === "req-1")?.state).toBe("Accepted");
    expect(fakes.requests.find((r) => r.id === "req-2")?.state).toBe("Declined");
    expect(fakes.assignments.map((a) => a.date)).toEqual(["2025-01-06"]);
  });
});

describe("withdrawRequest", () => {
  it("lets the requester withdraw their own Open request, notifying the recipient", async () => {
    const fakes = createFakes({ requests: [openRequest()] });

    const result = await withdrawRequest(fakes.deps, {
      requestId: "req-1",
      actingMemberId: REQUESTER,
    });

    expect(result.request.state).toBe("Withdrawn");
    expect(result.notification).toMatchObject({
      recipientId: RECIPIENT,
      event: PICKUP_REQUEST_WITHDRAWN_EVENT,
    });
  });

  it("rejects a withdraw from the recipient (only the requester can)", async () => {
    const fakes = createFakes({ requests: [openRequest()] });
    await expect(
      withdrawRequest(fakes.deps, { requestId: "req-1", actingMemberId: RECIPIENT }),
    ).rejects.toBeInstanceOf(PickupRequestStateError);
  });
});
