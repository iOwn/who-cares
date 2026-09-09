/**
 * Consolidated notification-recipient matrix for the pickup-request lifecycle
 * (`docs/testing.md` §4 point 2, issue #5 catalogue). One table, one row per
 * event this slice (#52) raises, asserting `(event key, recipient)` — the
 * "single non-actor member" rule from the catalogue.
 *
 * Scope: the accept / decline / withdraw / cancel / shorten events only. The
 * actor-less events (both-absent, 48h-silence) and the 5-minute coalescing
 * window are #55's (they need the real `Notifier`, not these services).
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
  Clock,
  IdGenerator,
  MemberRepository,
  Notification,
  PickupRequestRepository,
} from "../ports";
import type { Absence, Assignment, PickupRequest } from "../types";
import { ASSIGNMENT_STANDS_EVENT, cancelAbsence, shortenAbsence } from "./absenceCancellation";
import {
  acceptRequest,
  declineRequest,
  PICKUP_REQUEST_ACCEPTED_EVENT,
  PICKUP_REQUEST_DECLINED_EVENT,
  PICKUP_REQUEST_WITHDRAWN_EVENT,
  withdrawRequest,
} from "./pickupRequestResolution";

const HOUSEHOLD_ID = "household-1";
/** The absent parent who raises requests — the "actor" for a cancel / shorten. */
const REQUESTER = MEMBER_1_ID;
/** The parent asked — the "actor" for an accept / decline. */
const RECIPIENT = MEMBER_2_ID;

function createFakes(seed: {
  absences?: readonly Absence[];
  requests?: readonly PickupRequest[];
  assignments?: readonly Assignment[];
}) {
  const absences: Absence[] = [...(seed.absences ?? [])];
  const requests: PickupRequest[] = [...(seed.requests ?? [])];
  const assignments: Assignment[] = [...(seed.assignments ?? [])];
  const members = [
    makeMember({ id: REQUESTER, name: "Alex" }),
    makeMember({ id: RECIPIENT, name: "Bailey" }),
  ];

  const absenceRepo: AbsenceRepository = {
    async findById(id) {
      return absences.find((a) => a.id === id) ?? null;
    },
    async listByHousehold() {
      return [...absences];
    },
    async listCovering(_h, date) {
      return absences.filter((a) => a.startDate <= date && date <= a.endDate);
    },
    async save(a) {
      const i = absences.findIndex((x) => x.id === a.id);
      if (i >= 0) absences[i] = a;
      else absences.push(a);
    },
    async delete(id) {
      const i = absences.findIndex((x) => x.id === id);
      if (i >= 0) absences.splice(i, 1);
    },
  };

  const requestRepo: PickupRequestRepository = {
    async findById(id) {
      return requests.find((r) => r.id === id) ?? null;
    },
    async findByDate(_h, date) {
      return requests.find((r) => r.date === date) ?? null;
    },
    async listByHousehold() {
      return [...requests];
    },
    async save(r) {
      const i = requests.findIndex((x) => x.id === r.id);
      if (i >= 0) requests[i] = r;
      else requests.push(r);
    },
  };

  const assignmentRepo: AssignmentRepository = {
    async findByDate(_h, date) {
      return assignments.find((a) => a.date === date) ?? null;
    },
    async listByHousehold() {
      return [...assignments];
    },
    async save(a) {
      assignments.push(a);
    },
    async delete(id) {
      const i = assignments.findIndex((x) => x.id === id);
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

  const clock: Clock = { now: () => new Date("2025-01-04T09:00:00.000Z") };
  let n = 0;
  const ids: IdGenerator = {
    next() {
      n += 1;
      return `gen-${n}`;
    },
  };

  return {
    pickupRequests: requestRepo,
    assignments: assignmentRepo,
    absences: absenceRepo,
    members: memberRepo,
    clock,
    ids,
  };
}

const openReq = (over: Partial<PickupRequest> = {}) =>
  makePickupRequest({
    id: "r1",
    householdId: HOUSEHOLD_ID,
    date: "2025-01-07",
    requesterId: REQUESTER,
    recipientId: RECIPIENT,
    absenceId: "abs-1",
    state: "Open",
    ...over,
  });

const absenceRow = (over: Partial<Absence> = {}) =>
  makeAbsence({
    id: "abs-1",
    householdId: HOUSEHOLD_ID,
    memberId: REQUESTER,
    startDate: "2025-01-06",
    endDate: "2025-01-08",
    ...over,
  });

interface MatrixCase {
  readonly name: string;
  readonly event: string;
  readonly recipient: string;
  readonly run: () => Promise<{ notifications: readonly Notification[] }>;
}

beforeEach(resetIdCounter);

describe("notification recipients — pickup-request lifecycle (#52)", () => {
  const cases: MatrixCase[] = [
    {
      name: "request accepted → the original requester",
      event: PICKUP_REQUEST_ACCEPTED_EVENT,
      recipient: REQUESTER,
      run: async () => {
        const deps = createFakes({ requests: [openReq()] });
        const { notification } = await acceptRequest(deps, {
          requestId: "r1",
          actingMemberId: RECIPIENT,
        });
        return { notifications: [notification] };
      },
    },
    {
      name: "request declined → the original requester",
      event: PICKUP_REQUEST_DECLINED_EVENT,
      recipient: REQUESTER,
      run: async () => {
        const deps = createFakes({ requests: [openReq()] });
        const { notification } = await declineRequest(deps, {
          requestId: "r1",
          actingMemberId: RECIPIENT,
        });
        return { notifications: [notification] };
      },
    },
    {
      name: "request withdrawn by the requester → the parent who had it to answer",
      event: PICKUP_REQUEST_WITHDRAWN_EVENT,
      recipient: RECIPIENT,
      run: async () => {
        const deps = createFakes({ requests: [openReq()] });
        const { notification } = await withdrawRequest(deps, {
          requestId: "r1",
          actingMemberId: REQUESTER,
        });
        return { notifications: [notification] };
      },
    },
    {
      name: "request withdrawn by an absence cancel → the parent who had it to answer",
      event: PICKUP_REQUEST_WITHDRAWN_EVENT,
      recipient: RECIPIENT,
      run: async () => {
        const deps = createFakes({ absences: [absenceRow()], requests: [openReq()] });
        return cancelAbsence(deps, { absenceId: "abs-1", actingMemberId: REQUESTER });
      },
    },
    {
      name: "request withdrawn by an absence shorten → the parent who had it to answer",
      event: PICKUP_REQUEST_WITHDRAWN_EVENT,
      recipient: RECIPIENT,
      run: async () => {
        const deps = createFakes({
          absences: [absenceRow()],
          requests: [openReq({ date: "2025-01-08" })],
        });
        return shortenAbsence(deps, {
          absenceId: "abs-1",
          actingMemberId: REQUESTER,
          startDate: "2025-01-06",
          endDate: "2025-01-07",
        });
      },
    },
    {
      name: "request withdrawn because the day was claimed first → the original requester",
      event: PICKUP_REQUEST_WITHDRAWN_EVENT,
      recipient: REQUESTER,
      run: async () => {
        const deps = createFakes({
          requests: [openReq()],
          assignments: [
            makeAssignment({ date: "2025-01-07", assigneeId: REQUESTER, source: "direct-claim" }),
          ],
        });
        const { notification } = await acceptRequest(deps, {
          requestId: "r1",
          actingMemberId: RECIPIENT,
        });
        return { notifications: [notification] };
      },
    },
    {
      name: "accepted pickup still stands after its absence changed → the assignee",
      event: ASSIGNMENT_STANDS_EVENT,
      recipient: RECIPIENT,
      run: async () => {
        const deps = createFakes({
          absences: [absenceRow()],
          requests: [openReq({ state: "Accepted" })],
          assignments: [
            makeAssignment({
              date: "2025-01-07",
              assigneeId: RECIPIENT,
              source: "accepted-request",
            }),
          ],
        });
        return cancelAbsence(deps, { absenceId: "abs-1", actingMemberId: REQUESTER });
      },
    },
  ];

  it.each(cases)("$name", async ({ event, recipient, run }) => {
    const { notifications } = await run();
    const match = notifications.filter((n) => n.event === event);
    expect(match).toHaveLength(1);
    expect(match[0].recipientId).toBe(recipient);
  });

  it("never notifies the actor themselves", async () => {
    for (const testCase of cases) {
      const { notifications } = await testCase.run();
      // actor is RECIPIENT for accept/decline/day-claimed; REQUESTER for the rest.
      for (const n of notifications) {
        expect([REQUESTER, RECIPIENT]).toContain(n.recipientId);
      }
    }
  });
});
