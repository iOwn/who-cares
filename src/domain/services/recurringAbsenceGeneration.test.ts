/**
 * Recurring-mode absence generation (`docs/testing.md` §"What deserves a test"
 * point 4 — "Recurring generator: idempotent re-run skips covered days; end date
 * hard-capped at 4 weeks from today"). The pure `planRecurringAbsences` decision
 * is table-driven; `recordRecurringAbsences` is exercised over in-memory fake
 * repositories — no database (ADR-0005).
 */

import { beforeEach, describe, expect, it } from "vitest";
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
  PickupRequest,
  PickupRequestRepository,
  Weekday,
} from "@/domain";
import {
  MEMBER_1_ID,
  MEMBER_2_ID,
  absence as makeAbsenceSpan,
  makeMember,
  pattern,
  resetIdCounter,
} from "@/testing";
import {
  MAX_RECURRING_HORIZON_DAYS,
  planRecurringAbsences,
  recordRecurringAbsences,
} from "./recurringAbsenceGeneration";

const HOUSEHOLD_ID = "household-1";
/** Mon–Fri, effective from the 2025-01-06 anchor. */
const MON_FRI: ChildcarePattern = pattern(["mon", "tue", "wed", "thu", "fri"]);
/** Monday 6 Jan 2025. `today + 28` = Monday 3 Feb 2025 — the 4-week cap boundary. */
const TODAY = "2025-01-06";
const CAP_DATE = "2025-02-03";
const CLOCK_NOW = new Date(`${TODAY}T09:00:00.000Z`);

/* --- planRecurringAbsences: the pure, table-driven decision --- */

describe("planRecurringAbsences", () => {
  interface Case {
    readonly name: string;
    readonly weekdays: readonly Weekday[];
    readonly startDate: string;
    readonly endDate: string;
    readonly today?: string;
    readonly existingAbsences?: readonly Absence[];
    readonly expected: {
      readonly effectiveEndDate: string;
      readonly capped: boolean;
      readonly days: ReadonlyArray<{ date: string; alreadyCovered: boolean }>;
      readonly toCreate: readonly string[];
    };
  }

  const mine = (from: string, to: string): Absence =>
    makeAbsenceSpan({ from, to }, { memberId: MEMBER_1_ID });

  const cases: Case[] = [
    {
      name: "one weekday, two matches in range",
      weekdays: ["wed"],
      startDate: "2025-01-06",
      endDate: "2025-01-16",
      expected: {
        effectiveEndDate: "2025-01-16",
        capped: false,
        days: [
          { date: "2025-01-08", alreadyCovered: false },
          { date: "2025-01-15", alreadyCovered: false },
        ],
        toCreate: ["2025-01-08", "2025-01-15"],
      },
    },
    {
      name: "several weekdays, matches interleave in date order",
      weekdays: ["mon", "wed"],
      startDate: "2025-01-06",
      endDate: "2025-01-14",
      expected: {
        effectiveEndDate: "2025-01-14",
        capped: false,
        days: [
          { date: "2025-01-06", alreadyCovered: false },
          { date: "2025-01-08", alreadyCovered: false },
          { date: "2025-01-13", alreadyCovered: false },
        ],
        toCreate: ["2025-01-06", "2025-01-08", "2025-01-13"],
      },
    },
    {
      name: "idempotent re-run: days inside an existing absence for this member are skipped",
      weekdays: ["mon"],
      startDate: "2025-01-06",
      endDate: "2025-01-27",
      existingAbsences: [mine("2025-01-06", "2025-01-06"), mine("2025-01-13", "2025-01-13")],
      expected: {
        effectiveEndDate: "2025-01-27",
        capped: false,
        days: [
          { date: "2025-01-06", alreadyCovered: true },
          { date: "2025-01-13", alreadyCovered: true },
          { date: "2025-01-20", alreadyCovered: false },
          { date: "2025-01-27", alreadyCovered: false },
        ],
        toCreate: ["2025-01-20", "2025-01-27"],
      },
    },
    {
      name: "a multi-day existing absence covers every weekday it spans",
      weekdays: ["mon", "tue", "wed", "thu", "fri"],
      startDate: "2025-01-06",
      endDate: "2025-01-10",
      existingAbsences: [mine("2025-01-06", "2025-01-09")],
      expected: {
        effectiveEndDate: "2025-01-10",
        capped: false,
        days: [
          { date: "2025-01-06", alreadyCovered: true },
          { date: "2025-01-07", alreadyCovered: true },
          { date: "2025-01-08", alreadyCovered: true },
          { date: "2025-01-09", alreadyCovered: true },
          { date: "2025-01-10", alreadyCovered: false },
        ],
        toCreate: ["2025-01-10"],
      },
    },
    {
      name: "an existing absence for the OTHER member does not count as covered",
      weekdays: ["mon"],
      startDate: "2025-01-06",
      endDate: "2025-01-06",
      existingAbsences: [
        makeAbsenceSpan({ from: "2025-01-06", to: "2025-01-06" }, { memberId: MEMBER_2_ID }),
      ],
      expected: {
        effectiveEndDate: "2025-01-06",
        capped: false,
        days: [{ date: "2025-01-06", alreadyCovered: false }],
        toCreate: ["2025-01-06"],
      },
    },
    {
      name: "4-week cap: an end date past today+28 is clamped and flagged",
      weekdays: ["mon"],
      startDate: "2025-01-06",
      endDate: "2025-03-31",
      expected: {
        effectiveEndDate: CAP_DATE,
        capped: true,
        days: [
          { date: "2025-01-06", alreadyCovered: false },
          { date: "2025-01-13", alreadyCovered: false },
          { date: "2025-01-20", alreadyCovered: false },
          { date: "2025-01-27", alreadyCovered: false },
          { date: "2025-02-03", alreadyCovered: false },
        ],
        toCreate: ["2025-01-06", "2025-01-13", "2025-01-20", "2025-01-27", "2025-02-03"],
      },
    },
    {
      name: "4-week cap boundary: an end date exactly on today+28 is kept, not flagged capped",
      weekdays: ["mon"],
      startDate: "2025-01-27",
      endDate: CAP_DATE,
      expected: {
        effectiveEndDate: CAP_DATE,
        capped: false,
        days: [
          { date: "2025-01-27", alreadyCovered: false },
          { date: "2025-02-03", alreadyCovered: false },
        ],
        toCreate: ["2025-01-27", "2025-02-03"],
      },
    },
    {
      name: "4-week cap boundary: the day one past today+28 is excluded",
      weekdays: ["tue"],
      startDate: "2025-01-28",
      endDate: "2025-02-04", // Tuesday, one day past the 2025-02-03 cap
      expected: {
        effectiveEndDate: CAP_DATE,
        capped: true,
        days: [{ date: "2025-01-28", alreadyCovered: false }],
        toCreate: ["2025-01-28"],
      },
    },
    {
      name: "a start date in the past is floored at today",
      weekdays: ["mon"],
      startDate: "2024-12-23",
      endDate: "2025-01-13",
      expected: {
        effectiveEndDate: "2025-01-13",
        capped: false,
        days: [
          { date: "2025-01-06", alreadyCovered: false },
          { date: "2025-01-13", alreadyCovered: false },
        ],
        toCreate: ["2025-01-06", "2025-01-13"],
      },
    },
    {
      name: "no weekday in the set matches the range → empty plan",
      weekdays: ["sat", "sun"],
      startDate: "2025-01-06",
      endDate: "2025-01-10",
      expected: {
        effectiveEndDate: "2025-01-10",
        capped: false,
        days: [],
        toCreate: [],
      },
    },
    {
      name: "an empty weekday set → empty plan",
      weekdays: [],
      startDate: "2025-01-06",
      endDate: "2025-01-31",
      expected: {
        effectiveEndDate: "2025-01-31",
        capped: false,
        days: [],
        toCreate: [],
      },
    },
    {
      name: "end before start → empty plan",
      weekdays: ["mon"],
      startDate: "2025-01-13",
      endDate: "2025-01-06",
      expected: {
        effectiveEndDate: "2025-01-13",
        capped: false,
        days: [],
        toCreate: [],
      },
    },
  ];

  it.each(cases)("$name", (testCase) => {
    const plan = planRecurringAbsences({
      weekdays: testCase.weekdays,
      startDate: testCase.startDate,
      endDate: testCase.endDate,
      today: testCase.today ?? TODAY,
      memberId: MEMBER_1_ID,
      existingAbsences: testCase.existingAbsences ?? [],
    });

    expect({
      effectiveEndDate: plan.effectiveEndDate,
      capped: plan.capped,
      days: plan.days.map((d) => ({ date: d.date, alreadyCovered: d.alreadyCovered })),
      toCreate: plan.toCreate.map((c) => c.startDate),
    }).toEqual(testCase.expected);
  });

  it("every generated input is a single day for the declaring member", () => {
    const plan = planRecurringAbsences({
      weekdays: ["mon", "fri"],
      startDate: "2025-01-06",
      endDate: "2025-01-17",
      today: TODAY,
      memberId: MEMBER_1_ID,
      existingAbsences: [],
    });
    for (const input of plan.toCreate) {
      expect(input.startDate).toBe(input.endDate);
      expect(input.memberId).toBe(MEMBER_1_ID);
    }
  });

  it("MAX_RECURRING_HORIZON_DAYS is the 28-day, 4-week cap", () => {
    expect(MAX_RECURRING_HORIZON_DAYS).toBe(28);
  });
});

/* --- recordRecurringAbsences: the repo-driven batch service --- */

interface FakeOptions {
  readonly members?: readonly Member[];
  readonly pattern?: ChildcarePattern | null;
  readonly closures?: readonly Closure[];
  readonly absences?: readonly Absence[];
  readonly assignments?: readonly Assignment[];
  readonly existingRequests?: readonly PickupRequest[];
  readonly now?: Date;
}

interface Fakes {
  readonly deps: Parameters<typeof recordRecurringAbsences>[0];
  readonly savedAbsences: Absence[];
  readonly savedRequests: PickupRequest[];
}

function createFakes(options: FakeOptions = {}): Fakes {
  const savedAbsences: Absence[] = [...(options.absences ?? [])];
  const savedRequests: PickupRequest[] = [...(options.existingRequests ?? [])];
  const savedAssignments: Assignment[] = [...(options.assignments ?? [])];

  const absences: AbsenceRepository = {
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

  const pickupRequests: PickupRequestRepository = {
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

  const assignments: AssignmentRepository = {
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

  const childcarePattern: ChildcarePatternRepository = {
    async findByHousehold() {
      return options.pattern === undefined ? MON_FRI : options.pattern;
    },
    async save() {},
  };

  const closures: ClosureRepository = {
    async listByHousehold() {
      return [...(options.closures ?? [])];
    },
    async findByDate(_householdId, date) {
      return (options.closures ?? []).find((c) => c.date === date) ?? null;
    },
    async save() {},
    async delete() {},
  };

  const memberList = options.members ?? [
    makeMember({ id: MEMBER_1_ID, name: "Alex" }),
    makeMember({ id: MEMBER_2_ID, name: "Bailey" }),
  ];
  const members: MemberRepository = {
    async findById(id) {
      return memberList.find((m) => m.id === id) ?? null;
    },
    async findByEmail(email) {
      return memberList.find((m) => m.email === email) ?? null;
    },
    async listByHousehold() {
      return [...memberList];
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
  const clock: Clock = { now: () => options.now ?? CLOCK_NOW };

  return {
    deps: {
      absences,
      pickupRequests,
      assignments,
      childcarePattern,
      closures,
      members,
      clock,
      ids,
    },
    savedAbsences,
    savedRequests,
  };
}

const baseInput = {
  householdId: HOUSEHOLD_ID,
  memberId: MEMBER_1_ID,
  weekdays: ["mon"] as Weekday[],
  startDate: "2025-01-06",
  endDate: "2025-01-20",
};

describe("recordRecurringAbsences", () => {
  beforeEach(resetIdCounter);

  it("creates one single-day absence per matching weekday and raises its requests", async () => {
    const fakes = createFakes();
    const result = await recordRecurringAbsences(fakes.deps, baseInput);

    expect(result.absences.map((a) => [a.startDate, a.endDate])).toEqual([
      ["2025-01-06", "2025-01-06"],
      ["2025-01-13", "2025-01-13"],
      ["2025-01-20", "2025-01-20"],
    ]);
    expect(fakes.savedAbsences).toHaveLength(3);
    expect(result.requests.map((r) => r.date)).toEqual(["2025-01-06", "2025-01-13", "2025-01-20"]);
    for (const request of result.requests) {
      expect(request).toMatchObject({
        requesterId: MEMBER_1_ID,
        recipientId: MEMBER_2_ID,
        state: "Open",
      });
    }
  });

  it("applies the label / note to every generated absence", async () => {
    const fakes = createFakes();
    const result = await recordRecurringAbsences(fakes.deps, {
      ...baseInput,
      label: "  Office day  ",
      note: "  in the London office  ",
    });
    for (const created of result.absences) {
      expect(created).toMatchObject({ label: "Office day", note: "in the London office" });
    }
  });

  it("returns one bundled digest for the whole batch, addressed to the other parent", async () => {
    const fakes = createFakes();
    const result = await recordRecurringAbsences(fakes.deps, baseInput);

    expect(result.notification).toMatchObject({
      recipientId: MEMBER_2_ID,
      event: "pickup-request-received",
    });
    expect(result.notification?.body).toContain("3 childcare days");
  });

  it("is idempotent: a second identical run creates nothing and sends no digest", async () => {
    const fakes = createFakes();
    await recordRecurringAbsences(fakes.deps, baseInput);
    expect(fakes.savedAbsences).toHaveLength(3);

    const rerun = await recordRecurringAbsences(fakes.deps, baseInput);
    expect(rerun.absences).toHaveLength(0);
    expect(rerun.requests).toHaveLength(0);
    expect(rerun.notification).toBeNull();
    expect(fakes.savedAbsences).toHaveLength(3);
    expect(rerun.plan.days.every((d) => d.alreadyCovered)).toBe(true);
  });

  it("fills only the gap when an overlapping selection is re-run with a wider range", async () => {
    const fakes = createFakes();
    await recordRecurringAbsences(fakes.deps, baseInput); // Mondays 06, 13, 20

    const wider = await recordRecurringAbsences(fakes.deps, {
      ...baseInput,
      endDate: "2025-02-03",
    });
    expect(wider.absences.map((a) => a.startDate)).toEqual(["2025-01-27", "2025-02-03"]);
    expect(fakes.savedAbsences).toHaveLength(5);
  });

  it("hard-caps the range at 4 weeks from today even when a longer range is passed", async () => {
    const fakes = createFakes();
    const result = await recordRecurringAbsences(fakes.deps, {
      ...baseInput,
      endDate: "2025-06-30",
    });
    expect(result.plan.capped).toBe(true);
    expect(result.absences.map((a) => a.startDate)).toEqual([
      "2025-01-06",
      "2025-01-13",
      "2025-01-20",
      "2025-01-27",
      "2025-02-03",
    ]);
  });

  it("rejects a submission with no weekday picked", async () => {
    const fakes = createFakes();
    await expect(
      recordRecurringAbsences(fakes.deps, { ...baseInput, weekdays: [] }),
    ).rejects.toThrow(/at least one weekday/i);
    expect(fakes.savedAbsences).toHaveLength(0);
  });

  it("raises no digest when every generated day is already assigned", async () => {
    const fakes = createFakes({
      assignments: [
        makeAbsenceSpanAssignment("2025-01-06"),
        makeAbsenceSpanAssignment("2025-01-13"),
        makeAbsenceSpanAssignment("2025-01-20"),
      ],
    });
    const result = await recordRecurringAbsences(fakes.deps, baseInput);
    expect(result.absences).toHaveLength(3);
    expect(result.requests).toHaveLength(0);
    expect(result.notification).toBeNull();
  });
});

function makeAbsenceSpanAssignment(date: string): Assignment {
  return {
    id: `assignment-${date}`,
    householdId: HOUSEHOLD_ID,
    date,
    assigneeId: MEMBER_2_ID,
    source: "direct-claim",
    createdAt: new Date(`${date}T09:00:00.000Z`),
  };
}
