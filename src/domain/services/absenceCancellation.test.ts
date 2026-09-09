/**
 * Cancelling / shortening an absence (`docs/testing.md` §4). The pure
 * `planAbsenceChange` decision is table-driven; `cancelAbsence` /
 * `shortenAbsence` run over in-memory fake repositories, no database (ADR-0005).
 *
 * The load-bearing guarantees (CONTEXT.md "Assignment", ADR-0003, issue #52):
 *   - a cancel / shorten auto-withdraws the member's `Open` requests on days it
 *     no longer covers — one notification each (event 5);
 *   - it never deletes or rewrites an `Assignment` — an accepted day keeps its
 *     assignment;
 *   - a later change to the absence does not retroactively alter that
 *     assignment; the assignee is only told it still stands (event 8).
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  MEMBER_1_ID,
  MEMBER_2_ID,
  makeAbsence,
  makeAssignment,
  makeMember,
  makePickupRequest,
  resetIdCounter,
} from "@/testing";
import type {
  AbsenceRepository,
  AssignmentRepository,
  MemberRepository,
  PickupRequestRepository,
} from "../ports";
import type { Absence, Assignment, Member, PickupRequest } from "../types";
import {
  ASSIGNMENT_STANDS_EVENT,
  cancelAbsence,
  planAbsenceChange,
  shortenAbsence,
} from "./absenceCancellation";
import { AbsenceInputError } from "./pickupRequestGeneration";
import { PICKUP_REQUEST_WITHDRAWN_EVENT } from "./pickupRequestResolution";

const HOUSEHOLD_ID = "household-1";
const REQUESTER = MEMBER_1_ID;
const RECIPIENT = MEMBER_2_ID;

/* --- planAbsenceChange: the pure decision --- */

describe("planAbsenceChange", () => {
  beforeEach(resetIdCounter);

  const original: Absence = makeAbsence({
    id: "abs-1",
    memberId: REQUESTER,
    startDate: "2025-01-06",
    endDate: "2025-01-08",
  });

  const req = (date: string, over: Partial<PickupRequest> = {}) =>
    makePickupRequest({
      date,
      requesterId: REQUESTER,
      recipientId: RECIPIENT,
      absenceId: "abs-1",
      state: "Open",
      ...over,
    });

  it("cancel drops every day and marks every Open request of that member for withdrawal", () => {
    const plan = planAbsenceChange({
      original,
      revised: null,
      requesterAbsencesAfter: [],
      openRequests: [req("2025-01-06"), req("2025-01-07"), req("2025-01-08")],
      assignments: [],
    });
    expect(plan.droppedDates).toEqual(["2025-01-06", "2025-01-07", "2025-01-08"]);
    expect(plan.requestsToWithdraw.map((r) => r.date)).toEqual([
      "2025-01-06",
      "2025-01-07",
      "2025-01-08",
    ]);
  });

  it("shorten drops only the days past the new end", () => {
    const plan = planAbsenceChange({
      original,
      revised: { startDate: "2025-01-06", endDate: "2025-01-07" },
      requesterAbsencesAfter: [{ ...original, endDate: "2025-01-07" }],
      openRequests: [req("2025-01-06"), req("2025-01-07"), req("2025-01-08")],
      assignments: [],
    });
    expect(plan.droppedDates).toEqual(["2025-01-08"]);
    expect(plan.requestsToWithdraw.map((r) => r.date)).toEqual(["2025-01-08"]);
  });

  it("keeps a request whose day is still covered by another absence of the same member", () => {
    const plan = planAbsenceChange({
      original,
      revised: null,
      requesterAbsencesAfter: [
        makeAbsence({
          id: "abs-2",
          memberId: REQUESTER,
          startDate: "2025-01-07",
          endDate: "2025-01-07",
        }),
      ],
      openRequests: [req("2025-01-06"), req("2025-01-07")],
      assignments: [],
    });
    expect(plan.droppedDates).toEqual(["2025-01-06", "2025-01-08"]);
    expect(plan.requestsToWithdraw.map((r) => r.date)).toEqual(["2025-01-06"]);
  });

  it("never marks a non-Open request or another member's request", () => {
    const plan = planAbsenceChange({
      original,
      revised: null,
      requesterAbsencesAfter: [],
      openRequests: [req("2025-01-06", { requesterId: RECIPIENT })],
      assignments: [],
    });
    expect(plan.requestsToWithdraw).toHaveLength(0);
  });

  it("reports accepted-request assignments on dropped days as standing, untouched", () => {
    const plan = planAbsenceChange({
      original,
      revised: null,
      requesterAbsencesAfter: [],
      openRequests: [],
      assignments: [
        makeAssignment({ date: "2025-01-07", assigneeId: RECIPIENT, source: "accepted-request" }),
        makeAssignment({ date: "2025-01-08", assigneeId: RECIPIENT, source: "direct-claim" }),
      ],
    });
    expect(plan.standingAssignments.map((a) => a.date)).toEqual(["2025-01-07"]);
  });
});

/* --- cancelAbsence / shortenAbsence: repo-driven --- */

interface Fakes {
  readonly deps: Parameters<typeof cancelAbsence>[0];
  readonly absences: Absence[];
  readonly requests: PickupRequest[];
  readonly assignments: Assignment[];
  readonly deletedAssignmentIds: string[];
  readonly savedAssignmentIds: string[];
}

function createFakes(options: {
  absences?: readonly Absence[];
  requests?: readonly PickupRequest[];
  assignments?: readonly Assignment[];
  members?: readonly Member[];
}): Fakes {
  const absences: Absence[] = [...(options.absences ?? [])];
  const requests: PickupRequest[] = [...(options.requests ?? [])];
  const assignments: Assignment[] = [...(options.assignments ?? [])];
  const deletedAssignmentIds: string[] = [];
  const savedAssignmentIds: string[] = [];

  const absenceRepo: AbsenceRepository = {
    async findById(id) {
      return absences.find((a) => a.id === id) ?? null;
    },
    async listByHousehold(householdId) {
      return absences.filter((a) => a.householdId === householdId);
    },
    async listCovering(householdId, date) {
      return absences.filter(
        (a) => a.householdId === householdId && a.startDate <= date && date <= a.endDate,
      );
    },
    async save(absence) {
      const i = absences.findIndex((a) => a.id === absence.id);
      if (i >= 0) absences[i] = absence;
      else absences.push(absence);
    },
    async delete(id) {
      const i = absences.findIndex((a) => a.id === id);
      if (i >= 0) absences.splice(i, 1);
    },
  };

  const requestRepo: PickupRequestRepository = {
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
      savedAssignmentIds.push(assignment.id);
      const i = assignments.findIndex((a) => a.id === assignment.id);
      if (i >= 0) assignments[i] = assignment;
      else assignments.push(assignment);
    },
    async delete(id) {
      deletedAssignmentIds.push(id);
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

  return {
    deps: {
      absences: absenceRepo,
      pickupRequests: requestRepo,
      assignments: assignmentRepo,
      members: memberRepo,
    },
    absences,
    requests,
    assignments,
    deletedAssignmentIds,
    savedAssignmentIds,
  };
}

const absenceRow = (over: Partial<Absence> = {}) =>
  makeAbsence({
    id: "abs-1",
    householdId: HOUSEHOLD_ID,
    memberId: REQUESTER,
    startDate: "2025-01-06",
    endDate: "2025-01-08",
    ...over,
  });

const openReq = (over: Partial<PickupRequest> = {}) =>
  makePickupRequest({
    householdId: HOUSEHOLD_ID,
    requesterId: REQUESTER,
    recipientId: RECIPIENT,
    absenceId: "abs-1",
    state: "Open",
    ...over,
  });

beforeEach(resetIdCounter);

describe("cancelAbsence", () => {
  it("deletes the absence and withdraws every Open request it alone covered", async () => {
    const fakes = createFakes({
      absences: [absenceRow()],
      requests: [
        openReq({ id: "r6", date: "2025-01-06" }),
        openReq({ id: "r7", date: "2025-01-07" }),
      ],
    });

    const result = await cancelAbsence(fakes.deps, {
      absenceId: "abs-1",
      actingMemberId: REQUESTER,
    });

    expect(fakes.absences).toHaveLength(0);
    expect(result.absence).toBeNull();
    // Rows persist in a terminal state with the dangling absence link dropped —
    // the DB's ON DELETE SET NULL does the same to any it doesn't reach here.
    expect(fakes.requests.map((r) => r.state)).toEqual(["Withdrawn", "Withdrawn"]);
    expect(fakes.requests.map((r) => r.absenceId)).toEqual([null, null]);
    expect(result.withdrawnRequests.map((r) => r.id)).toEqual(["r6", "r7"]);
  });

  it("fires exactly one withdrawn notification per affected request, addressed to the recipient", async () => {
    const fakes = createFakes({
      absences: [absenceRow()],
      requests: [
        openReq({ id: "r6", date: "2025-01-06" }),
        openReq({ id: "r7", date: "2025-01-07" }),
      ],
    });

    const { notifications } = await cancelAbsence(fakes.deps, {
      absenceId: "abs-1",
      actingMemberId: REQUESTER,
    });

    expect(notifications).toHaveLength(2);
    for (const n of notifications) {
      expect(n).toMatchObject({ recipientId: RECIPIENT, event: PICKUP_REQUEST_WITHDRAWN_EVENT });
    }
  });

  it("never unassigns anyone — an accepted day keeps its Assignment after the absence is cancelled", async () => {
    const fakes = createFakes({
      absences: [absenceRow()],
      requests: [openReq({ id: "r7", date: "2025-01-07", state: "Accepted" })],
      assignments: [
        makeAssignment({
          id: "asg-7",
          date: "2025-01-07",
          assigneeId: RECIPIENT,
          source: "accepted-request",
        }),
      ],
    });

    await cancelAbsence(fakes.deps, { absenceId: "abs-1", actingMemberId: REQUESTER });

    expect(fakes.deletedAssignmentIds).toEqual([]);
    expect(fakes.savedAssignmentIds).toEqual([]);
    expect(fakes.assignments).toHaveLength(1);
    expect(fakes.assignments[0]).toMatchObject({ id: "asg-7", assigneeId: RECIPIENT });
  });

  it("tells the assignee their accepted pickup still stands (event 8), and does not re-raise the request", async () => {
    const fakes = createFakes({
      absences: [absenceRow()],
      requests: [openReq({ id: "r7", date: "2025-01-07", state: "Accepted" })],
      assignments: [
        makeAssignment({
          id: "asg-7",
          date: "2025-01-07",
          assigneeId: RECIPIENT,
          source: "accepted-request",
        }),
      ],
    });

    const { notifications, withdrawnRequests } = await cancelAbsence(fakes.deps, {
      absenceId: "abs-1",
      actingMemberId: REQUESTER,
    });

    expect(withdrawnRequests).toHaveLength(0);
    expect(fakes.requests[0].state).toBe("Accepted");
    expect(notifications).toEqual([
      expect.objectContaining({ recipientId: RECIPIENT, event: ASSIGNMENT_STANDS_EVENT }),
    ]);
  });

  it("rejects a cancel of someone else's absence", async () => {
    const fakes = createFakes({ absences: [absenceRow()] });
    await expect(
      cancelAbsence(fakes.deps, { absenceId: "abs-1", actingMemberId: RECIPIENT }),
    ).rejects.toBeInstanceOf(AbsenceInputError);
  });

  it("rejects a cancel of a missing absence", async () => {
    const fakes = createFakes({ absences: [] });
    await expect(
      cancelAbsence(fakes.deps, { absenceId: "nope", actingMemberId: REQUESTER }),
    ).rejects.toBeInstanceOf(AbsenceInputError);
  });
});

describe("shortenAbsence", () => {
  it("withdraws only the requests on days the new range no longer covers", async () => {
    const fakes = createFakes({
      absences: [absenceRow()],
      requests: [
        openReq({ id: "r6", date: "2025-01-06" }),
        openReq({ id: "r7", date: "2025-01-07" }),
        openReq({ id: "r8", date: "2025-01-08" }),
      ],
    });

    const result = await shortenAbsence(fakes.deps, {
      absenceId: "abs-1",
      actingMemberId: REQUESTER,
      startDate: "2025-01-06",
      endDate: "2025-01-07",
    });

    expect(result.absence).toMatchObject({ startDate: "2025-01-06", endDate: "2025-01-07" });
    expect(fakes.requests.find((r) => r.id === "r6")?.state).toBe("Open");
    expect(fakes.requests.find((r) => r.id === "r7")?.state).toBe("Open");
    expect(fakes.requests.find((r) => r.id === "r8")?.state).toBe("Withdrawn");
    // The absence still exists after a shorten, so the withdrawn row keeps its link.
    expect(fakes.requests.find((r) => r.id === "r8")?.absenceId).toBe("abs-1");
    expect(result.withdrawnRequests.map((r) => r.id)).toEqual(["r8"]);
  });

  it("does not retroactively alter an Assignment that arose from an accepted request", async () => {
    const fakes = createFakes({
      absences: [absenceRow()],
      requests: [openReq({ id: "r8", date: "2025-01-08", state: "Accepted" })],
      assignments: [
        makeAssignment({
          id: "asg-8",
          date: "2025-01-08",
          assigneeId: RECIPIENT,
          source: "accepted-request",
        }),
      ],
    });

    await shortenAbsence(fakes.deps, {
      absenceId: "abs-1",
      actingMemberId: REQUESTER,
      startDate: "2025-01-06",
      endDate: "2025-01-07",
    });

    expect(fakes.deletedAssignmentIds).toEqual([]);
    expect(fakes.savedAssignmentIds).toEqual([]);
    expect(fakes.assignments[0]).toMatchObject({ id: "asg-8", assigneeId: RECIPIENT });
  });

  it("rejects a range that isn't inside the original", async () => {
    const fakes = createFakes({ absences: [absenceRow()] });
    await expect(
      shortenAbsence(fakes.deps, {
        absenceId: "abs-1",
        actingMemberId: REQUESTER,
        startDate: "2025-01-06",
        endDate: "2025-01-12",
      }),
    ).rejects.toBeInstanceOf(AbsenceInputError);
  });
});
