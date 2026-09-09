/**
 * Absence → pickup-request generation (`docs/testing.md` §4). The pure
 * `planPickupRequests` decision is table-driven; `recordAbsence` is exercised
 * over in-memory fake repositories — no database (ADR-0005, "Dependency
 * injection first").
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Absence,
  AbsenceRepository,
  Assignment,
  AssignmentRepository,
  ChildcarePattern,
  ChildcarePatternRepository,
  Clock,
  Closure,
  ClosureRepository,
  IdGenerator,
  Member,
  MemberRepository,
  Notifier,
  PickupRequest,
  PickupRequestRepository,
} from "@/domain";
import {
  MEMBER_1_ID,
  MEMBER_2_ID,
  absence as makeAbsenceSpan,
  makeAssignment,
  makeClosure,
  makeMember,
  makePickupRequest,
  pattern,
  resetIdCounter,
} from "@/testing";
import {
  PICKUP_REQUEST_RECEIVED_EVENT,
  planPickupRequests,
  recordAbsence,
} from "./pickupRequestGeneration";

const HOUSEHOLD_ID = "household-1";
/** Mon–Fri, effective from the anchor Monday. */
const MON_FRI: ChildcarePattern = pattern(["mon", "tue", "wed", "thu", "fri"]);

/* --- planPickupRequests: the pure, table-driven decision --- */

describe("planPickupRequests", () => {
  beforeEach(resetIdCounter);

  interface Case {
    readonly name: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly absences: readonly Absence[];
    readonly assignments?: readonly Assignment[];
    readonly existingRequests?: readonly PickupRequest[];
    readonly closures?: readonly Closure[];
    readonly expected: ReadonlyArray<{ date: string; raise: boolean; skipReason?: string }>;
  }

  const soloAbsence = (from: string, to: string): Absence =>
    makeAbsenceSpan({ from, to }, { memberId: MEMBER_1_ID });

  const cases: Case[] = [
    {
      name: "single absent parent, unassigned childcare day → raise",
      startDate: "2025-01-06",
      endDate: "2025-01-06",
      absences: [soloAbsence("2025-01-06", "2025-01-06")],
      expected: [{ date: "2025-01-06", raise: true }],
    },
    {
      name: "weekend days in the range produce no entry at all",
      startDate: "2025-01-10",
      endDate: "2025-01-13",
      absences: [soloAbsence("2025-01-10", "2025-01-13")],
      expected: [
        { date: "2025-01-10", raise: true }, // Fri
        { date: "2025-01-13", raise: true }, // Mon
      ],
    },
    {
      name: "a closure on a childcare day removes it from the plan entirely",
      startDate: "2025-01-06",
      endDate: "2025-01-07",
      absences: [soloAbsence("2025-01-06", "2025-01-07")],
      closures: [makeClosure({ date: "2025-01-06" })],
      expected: [{ date: "2025-01-07", raise: true }],
    },
    {
      name: "both parents absent that day → no request (skip both-absent)",
      startDate: "2025-01-06",
      endDate: "2025-01-06",
      absences: [
        soloAbsence("2025-01-06", "2025-01-06"),
        makeAbsenceSpan({ from: "2025-01-06", to: "2025-01-06" }, { memberId: MEMBER_2_ID }),
      ],
      expected: [{ date: "2025-01-06", raise: false, skipReason: "both-absent" }],
    },
    {
      name: "day already has an assignment → no request (skip already-assigned)",
      startDate: "2025-01-06",
      endDate: "2025-01-06",
      absences: [soloAbsence("2025-01-06", "2025-01-06")],
      assignments: [makeAssignment({ date: "2025-01-06", assigneeId: MEMBER_2_ID })],
      expected: [{ date: "2025-01-06", raise: false, skipReason: "already-assigned" }],
    },
    {
      name: "a 'nobody' assignment still blocks a request",
      startDate: "2025-01-06",
      endDate: "2025-01-06",
      absences: [soloAbsence("2025-01-06", "2025-01-06")],
      assignments: [makeAssignment({ date: "2025-01-06", assigneeId: null })],
      expected: [{ date: "2025-01-06", raise: false, skipReason: "already-assigned" }],
    },
    {
      name: "a prior request for the day → no request (skip request-exists, any state)",
      startDate: "2025-01-06",
      endDate: "2025-01-06",
      absences: [soloAbsence("2025-01-06", "2025-01-06")],
      existingRequests: [makePickupRequest({ date: "2025-01-06", state: "Declined" })],
      expected: [{ date: "2025-01-06", raise: false, skipReason: "request-exists" }],
    },
    {
      name: "requester not absent on a day inside the range → skip requester-not-absent",
      startDate: "2025-01-06",
      endDate: "2025-01-07",
      absences: [soloAbsence("2025-01-07", "2025-01-07")],
      expected: [
        { date: "2025-01-06", raise: false, skipReason: "requester-not-absent" },
        { date: "2025-01-07", raise: true },
      ],
    },
    {
      name: "a multi-day absence raises one entry per covered childcare day",
      startDate: "2025-01-06",
      endDate: "2025-01-10",
      absences: [soloAbsence("2025-01-06", "2025-01-10")],
      expected: [
        { date: "2025-01-06", raise: true },
        { date: "2025-01-07", raise: true },
        { date: "2025-01-08", raise: true },
        { date: "2025-01-09", raise: true },
        { date: "2025-01-10", raise: true },
      ],
    },
    {
      name: "no pattern at all → nothing is a childcare day → empty plan",
      startDate: "2025-01-06",
      endDate: "2025-01-10",
      absences: [soloAbsence("2025-01-06", "2025-01-10")],
      expected: [],
    },
  ];

  it.each(cases)("$name", (testCase) => {
    const entries = planPickupRequests({
      startDate: testCase.startDate,
      endDate: testCase.endDate,
      requesterId: MEMBER_1_ID,
      pattern: testCase.name.includes("no pattern") ? null : MON_FRI,
      closures: testCase.closures ?? [],
      absences: testCase.absences,
      assignments: testCase.assignments ?? [],
      existingRequests: testCase.existingRequests ?? [],
    });

    expect(
      entries.map((entry) => ({
        date: entry.date,
        raise: entry.raise,
        ...(entry.skipReason ? { skipReason: entry.skipReason } : {}),
      })),
    ).toEqual(testCase.expected);
  });
});

/* --- recordAbsence: the repo-driven service --- */

interface Fakes {
  readonly deps: Parameters<typeof recordAbsence>[0];
  readonly notify: ReturnType<typeof vi.fn>;
  readonly savedAbsences: Absence[];
  readonly savedRequests: PickupRequest[];
}

function createFakes(options: {
  members?: readonly Member[];
  pattern?: ChildcarePattern | null;
  closures?: readonly Closure[];
  absences?: readonly Absence[];
  assignments?: readonly Assignment[];
  existingRequests?: readonly PickupRequest[];
  now?: Date;
}): Fakes {
  const savedAbsences: Absence[] = [...(options.absences ?? [])];
  const savedRequests: PickupRequest[] = [...(options.existingRequests ?? [])];
  const savedAssignments: Assignment[] = [...(options.assignments ?? [])];

  const absenceRepo: AbsenceRepository = {
    async findById(id) {
      return savedAbsences.find((a) => a.id === id) ?? null;
    },
    async listByHousehold(householdId) {
      return savedAbsences.filter((a) => a.householdId === householdId);
    },
    async listCovering(householdId, date) {
      return savedAbsences.filter(
        (a) => a.householdId === householdId && a.startDate <= date && date <= a.endDate,
      );
    },
    async save(absence) {
      const i = savedAbsences.findIndex((a) => a.id === absence.id);
      if (i >= 0) savedAbsences[i] = absence;
      else savedAbsences.push(absence);
    },
    async delete(id) {
      const i = savedAbsences.findIndex((a) => a.id === id);
      if (i >= 0) savedAbsences.splice(i, 1);
    },
  };

  const requestRepo: PickupRequestRepository = {
    async findById(id) {
      return savedRequests.find((r) => r.id === id) ?? null;
    },
    async findByDate(householdId, date) {
      return savedRequests.find((r) => r.householdId === householdId && r.date === date) ?? null;
    },
    async listByHousehold(householdId) {
      return savedRequests.filter((r) => r.householdId === householdId);
    },
    async save(request) {
      const i = savedRequests.findIndex((r) => r.id === request.id);
      if (i >= 0) savedRequests[i] = request;
      else savedRequests.push(request);
    },
  };

  const assignmentRepo: AssignmentRepository = {
    async findByDate(householdId, date) {
      return savedAssignments.find((a) => a.householdId === householdId && a.date === date) ?? null;
    },
    async listByHousehold(householdId) {
      return savedAssignments.filter((a) => a.householdId === householdId);
    },
    async save(assignment) {
      savedAssignments.push(assignment);
    },
    async delete() {},
  };

  const patternRepo: ChildcarePatternRepository = {
    async findByHousehold() {
      return options.pattern === undefined ? MON_FRI : options.pattern;
    },
    async save() {},
  };

  const closureRepo: ClosureRepository = {
    async listByHousehold() {
      return [...(options.closures ?? [])];
    },
    async findByDate(_householdId, date) {
      return (options.closures ?? []).find((c) => c.date === date) ?? null;
    },
    async save() {},
    async delete() {},
  };

  const members = options.members ?? [
    makeMember({ id: MEMBER_1_ID, name: "Alex" }),
    makeMember({ id: MEMBER_2_ID, name: "Bailey" }),
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
  const clock: Clock = { now: () => options.now ?? new Date("2025-01-01T09:00:00.000Z") };
  const notify = vi.fn(async () => {});
  const notifier: Notifier = { notify };

  return {
    deps: {
      absences: absenceRepo,
      pickupRequests: requestRepo,
      assignments: assignmentRepo,
      childcarePattern: patternRepo,
      closures: closureRepo,
      members: memberRepo,
      clock,
      ids,
      notifier,
    },
    notify,
    savedAbsences,
    savedRequests,
  };
}

describe("recordAbsence", () => {
  it("persists the absence and raises one Open request per covered childcare day", async () => {
    const fakes = createFakes({});
    const result = await recordAbsence(fakes.deps, {
      householdId: HOUSEHOLD_ID,
      memberId: MEMBER_1_ID,
      startDate: "2025-01-06",
      endDate: "2025-01-08",
      label: "  Conference  ",
    });

    expect(result.absence).toMatchObject({
      householdId: HOUSEHOLD_ID,
      memberId: MEMBER_1_ID,
      startDate: "2025-01-06",
      endDate: "2025-01-08",
      label: "Conference",
    });
    expect(fakes.savedAbsences).toHaveLength(1);

    expect(result.requests).toHaveLength(3);
    for (const request of result.requests) {
      expect(request).toMatchObject({
        householdId: HOUSEHOLD_ID,
        requesterId: MEMBER_1_ID,
        recipientId: MEMBER_2_ID,
        absenceId: result.absence.id,
        state: "Open",
      });
      expect(request.raisedAt.toISOString()).toBe("2025-01-01T09:00:00.000Z");
    }
    expect(result.requests.map((r) => r.date)).toEqual(["2025-01-06", "2025-01-07", "2025-01-08"]);
    expect(fakes.savedRequests).toHaveLength(3);
  });

  it("omits an empty label / note", async () => {
    const fakes = createFakes({});
    const result = await recordAbsence(fakes.deps, {
      householdId: HOUSEHOLD_ID,
      memberId: MEMBER_1_ID,
      startDate: "2025-01-06",
      endDate: "2025-01-06",
      label: "   ",
      note: "",
    });
    expect(result.absence.label).toBeUndefined();
    expect(result.absence.note).toBeUndefined();
  });

  it("fires exactly one bundled digest notification for the whole absence, to the other parent", async () => {
    const fakes = createFakes({});
    await recordAbsence(fakes.deps, {
      householdId: HOUSEHOLD_ID,
      memberId: MEMBER_1_ID,
      startDate: "2025-01-06",
      endDate: "2025-01-10",
    });

    expect(fakes.notify).toHaveBeenCalledTimes(1);
    expect(fakes.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: MEMBER_2_ID,
        event: PICKUP_REQUEST_RECEIVED_EVENT,
      }),
    );
    expect(fakes.notify.mock.calls[0][0].body).toContain("5 childcare days");
  });

  it("does not notify when no request is raised", async () => {
    const fakes = createFakes({
      assignments: [makeAssignment({ date: "2025-01-06", assigneeId: MEMBER_2_ID })],
    });
    const result = await recordAbsence(fakes.deps, {
      householdId: HOUSEHOLD_ID,
      memberId: MEMBER_1_ID,
      startDate: "2025-01-06",
      endDate: "2025-01-06",
    });
    expect(result.requests).toHaveLength(0);
    expect(fakes.notify).not.toHaveBeenCalled();
  });

  it("skips the both-absent day but still asks for the rest", async () => {
    const fakes = createFakes({
      absences: [
        makeAbsenceSpan({ from: "2025-01-07", to: "2025-01-07" }, { memberId: MEMBER_2_ID }),
      ],
    });
    const result = await recordAbsence(fakes.deps, {
      householdId: HOUSEHOLD_ID,
      memberId: MEMBER_1_ID,
      startDate: "2025-01-06",
      endDate: "2025-01-08",
    });
    expect(result.requests.map((r) => r.date)).toEqual(["2025-01-06", "2025-01-08"]);
    expect(fakes.notify.mock.calls[0][0].body).toContain("2 childcare days");
  });

  it("does not re-raise a request for a day an earlier absence already covered", async () => {
    const fakes = createFakes({
      existingRequests: [makePickupRequest({ date: "2025-01-07" })],
    });
    const result = await recordAbsence(fakes.deps, {
      householdId: HOUSEHOLD_ID,
      memberId: MEMBER_1_ID,
      startDate: "2025-01-06",
      endDate: "2025-01-08",
    });
    expect(result.requests.map((r) => r.date)).toEqual(["2025-01-06", "2025-01-08"]);
  });

  it("throws when endDate precedes startDate", async () => {
    const fakes = createFakes({});
    await expect(
      recordAbsence(fakes.deps, {
        householdId: HOUSEHOLD_ID,
        memberId: MEMBER_1_ID,
        startDate: "2025-01-08",
        endDate: "2025-01-06",
      }),
    ).rejects.toThrow(/before startDate/);
  });

  it("throws when the acting member is not in the household", async () => {
    const fakes = createFakes({});
    await expect(
      recordAbsence(fakes.deps, {
        householdId: HOUSEHOLD_ID,
        memberId: "stranger",
        startDate: "2025-01-06",
        endDate: "2025-01-06",
      }),
    ).rejects.toThrow(/not in household/);
  });
});
