/**
 * At-risk escalation backstop (issue #55, ADR-0004, catalogue events 9 + 10).
 *
 * The pure planner (`planAtRiskEscalations`) is the seam; `runAtRiskEscalation`
 * is the repo-driven wrapper the Vercel Cron handler is a thin adapter over.
 * Both are tested here without a database (`docs/testing.md` §4).
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  ANCHOR_DATE,
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
  AtRiskEscalationRepository,
  ChildcarePatternRepository,
  Clock,
  ClosureRepository,
  MemberRepository,
  PickupRequestRepository,
} from "../ports";
import type { Absence, Assignment, PickupRequest } from "../types";
import { escalationKey, planAtRiskEscalations, runAtRiskEscalation } from "./atRiskEscalation";
import type { DayStateFacts } from "./dayState";
import {
  DAY_AT_RISK_BOTH_ABSENT_EVENT,
  DAY_AT_RISK_ESCALATED_EVENT,
} from "./notificationCatalogue";

const HOUSEHOLD_ID = "household-1";
const NOW = new Date("2025-01-06T09:00:00.000Z");

const childcareDay = (over: Partial<DayStateFacts> = {}): DayStateFacts => ({
  date: "2025-01-08",
  isChildcareDay: true,
  assignment: null,
  openRequest: null,
  absentMemberIds: [],
  ...over,
});

describe("planAtRiskEscalations", () => {
  it("emits nothing for a day that is not at-risk", () => {
    const plan = planAtRiskEscalations({
      days: [childcareDay({ absentMemberIds: [] })],
      memberIds: [MEMBER_1_ID, MEMBER_2_ID],
      alreadyNotified: new Set(),
      now: NOW,
    });
    expect(plan).toEqual([]);
  });

  it("flags a both-absent day as event 9 to both members", () => {
    const [escalation, ...rest] = planAtRiskEscalations({
      days: [childcareDay({ absentMemberIds: [MEMBER_1_ID, MEMBER_2_ID] })],
      memberIds: [MEMBER_1_ID, MEMBER_2_ID],
      alreadyNotified: new Set(),
      now: NOW,
    });
    expect(rest).toEqual([]);
    expect(escalation.event).toBe(DAY_AT_RISK_BOTH_ABSENT_EVENT);
    expect(escalation.notifications.map((n) => n.recipientId).sort()).toEqual(
      [MEMBER_1_ID, MEMBER_2_ID].sort(),
    );
    for (const n of escalation.notifications) {
      expect(n.event).toBe(DAY_AT_RISK_BOTH_ABSENT_EVENT);
      expect(n.body).toContain("2025-01-08");
    }
  });

  it("flags an escalated open request as event 10 to both members", () => {
    const request = makePickupRequest({
      date: "2025-01-08",
      state: "Open",
      raisedAt: new Date("2025-01-01T09:00:00.000Z"), // > 48h ago
    });
    const [escalation] = planAtRiskEscalations({
      days: [childcareDay({ openRequest: request, absentMemberIds: [MEMBER_1_ID] })],
      memberIds: [MEMBER_1_ID, MEMBER_2_ID],
      alreadyNotified: new Set(),
      now: NOW,
    });
    expect(escalation.event).toBe(DAY_AT_RISK_ESCALATED_EVENT);
    expect(escalation.notifications).toHaveLength(2);
  });

  it("keeps a still-pending request out of the plan", () => {
    const request = makePickupRequest({
      date: "2025-01-31",
      state: "Open",
      raisedAt: new Date("2025-01-06T08:00:00.000Z"), // 1h ago, day far off
    });
    const plan = planAtRiskEscalations({
      days: [
        childcareDay({ date: "2025-01-31", openRequest: request, absentMemberIds: [MEMBER_1_ID] }),
      ],
      memberIds: [MEMBER_1_ID, MEMBER_2_ID],
      alreadyNotified: new Set(),
      now: NOW,
    });
    expect(plan).toEqual([]);
  });

  it("skips a (date, event) pair already recorded as notified", () => {
    const plan = planAtRiskEscalations({
      days: [childcareDay({ date: "2025-01-08", absentMemberIds: [MEMBER_1_ID, MEMBER_2_ID] })],
      memberIds: [MEMBER_1_ID, MEMBER_2_ID],
      alreadyNotified: new Set([escalationKey("2025-01-08", DAY_AT_RISK_BOTH_ABSENT_EVENT)]),
      now: NOW,
    });
    expect(plan).toEqual([]);
  });

  it("still fires event 9 for a day only ever notified as event 10", () => {
    const [escalation] = planAtRiskEscalations({
      days: [childcareDay({ date: "2025-01-08", absentMemberIds: [MEMBER_1_ID, MEMBER_2_ID] })],
      memberIds: [MEMBER_1_ID, MEMBER_2_ID],
      alreadyNotified: new Set([escalationKey("2025-01-08", DAY_AT_RISK_ESCALATED_EVENT)]),
      now: NOW,
    });
    expect(escalation.event).toBe(DAY_AT_RISK_BOTH_ABSENT_EVENT);
  });

  it("never notifies about a non-childcare day", () => {
    const plan = planAtRiskEscalations({
      days: [childcareDay({ isChildcareDay: false, absentMemberIds: [MEMBER_1_ID, MEMBER_2_ID] })],
      memberIds: [MEMBER_1_ID, MEMBER_2_ID],
      alreadyNotified: new Set(),
      now: NOW,
    });
    expect(plan).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * runAtRiskEscalation — repo-driven.
 * ------------------------------------------------------------------ */

function createFakes(seed: {
  absences?: readonly Absence[];
  requests?: readonly PickupRequest[];
  assignments?: readonly Assignment[];
  notifiedDates?: readonly string[];
  /**
   * Simulate a racing cron run: `listNotified` always reports an empty ledger
   * even though `claimNotified` still dedupes against the rows already written.
   * A second `runAtRiskEscalation` then re-plans every day but claims none.
   */
  staleReads?: boolean;
}) {
  const absences = [...(seed.absences ?? [])];
  const requests = [...(seed.requests ?? [])];
  const assignments = [...(seed.assignments ?? [])];
  const notified: { date: string; event: string }[] = (seed.notifiedDates ?? []).map((d) => ({
    date: d,
    event: DAY_AT_RISK_BOTH_ABSENT_EVENT,
  }));

  const members: MemberRepository = {
    async findById(id) {
      return (
        [
          makeMember({ id: MEMBER_1_ID, name: "Alex" }),
          makeMember({ id: MEMBER_2_ID, name: "Bailey" }),
        ].find((m) => m.id === id) ?? null
      );
    },
    async findByEmail() {
      return null;
    },
    async listByHousehold() {
      return [
        makeMember({ id: MEMBER_1_ID, name: "Alex" }),
        makeMember({ id: MEMBER_2_ID, name: "Bailey" }),
      ];
    },
    async save() {},
  };

  const childcarePattern: ChildcarePatternRepository = {
    async findByHousehold() {
      return {
        id: HOUSEHOLD_ID,
        householdId: HOUSEHOLD_ID,
        versions: [{ weekdays: ["mon", "tue", "wed", "thu", "fri"], effectiveFrom: ANCHOR_DATE }],
      };
    },
    async save() {},
  };

  const closures: ClosureRepository = {
    async listByHousehold() {
      return [];
    },
    async findByDate() {
      return null;
    },
    async save() {},
    async delete() {},
  };

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
    async save() {},
    async delete() {},
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
    async save() {},
  };

  const assignmentRepo: AssignmentRepository = {
    async findByDate(_h, date) {
      return assignments.find((a) => a.date === date) ?? null;
    },
    async listByHousehold() {
      return [...assignments];
    },
    async save() {},
    async delete() {},
  };

  const recorded: { date: string; event: string }[] = [];
  const atRiskEscalations: AtRiskEscalationRepository = {
    async listNotified() {
      return seed.staleReads ? [] : notified.map((r) => ({ ...r }));
    },
    async claimNotified(_h, date, event) {
      if (notified.some((r) => r.date === date && r.event === event)) return false;
      notified.push({ date, event });
      recorded.push({ date, event });
      return true;
    },
  };

  const clock: Clock = { now: () => new Date(NOW.getTime()) };

  return {
    deps: {
      members,
      childcarePattern,
      closures,
      absences: absenceRepo,
      pickupRequests: requestRepo,
      assignments: assignmentRepo,
      atRiskEscalations,
      clock,
    },
    recorded,
  };
}

beforeEach(resetIdCounter);

describe("runAtRiskEscalation", () => {
  it("notifies both parents once for a both-absent childcare day and records the ledger", async () => {
    const { deps, recorded } = createFakes({
      absences: [
        makeAbsence({
          id: "a1",
          memberId: MEMBER_1_ID,
          startDate: "2025-01-08",
          endDate: "2025-01-08",
        }),
        makeAbsence({
          id: "a2",
          memberId: MEMBER_2_ID,
          startDate: "2025-01-08",
          endDate: "2025-01-08",
        }),
      ],
    });

    const result = await runAtRiskEscalation(deps, { householdId: HOUSEHOLD_ID, horizonDays: 14 });

    expect(result.escalations.map((e) => e.date)).toEqual(["2025-01-08"]);
    expect(result.notifications).toHaveLength(2);
    expect(result.notifications.every((n) => n.event === DAY_AT_RISK_BOTH_ABSENT_EVENT)).toBe(true);
    expect(recorded).toEqual([{ date: "2025-01-08", event: DAY_AT_RISK_BOTH_ABSENT_EVENT }]);
  });

  it("does not re-notify a day already in the ledger", async () => {
    const { deps, recorded } = createFakes({
      absences: [
        makeAbsence({
          id: "a1",
          memberId: MEMBER_1_ID,
          startDate: "2025-01-08",
          endDate: "2025-01-08",
        }),
        makeAbsence({
          id: "a2",
          memberId: MEMBER_2_ID,
          startDate: "2025-01-08",
          endDate: "2025-01-08",
        }),
      ],
      notifiedDates: ["2025-01-08"],
    });

    const result = await runAtRiskEscalation(deps, { householdId: HOUSEHOLD_ID, horizonDays: 14 });

    expect(result.notifications).toEqual([]);
    expect(recorded).toEqual([]);
  });

  it("dispatches nothing on a re-run once the ledger row is claimed, even if the read is stale (issue #92)", async () => {
    const bothAbsent = {
      absences: [
        makeAbsence({
          id: "a1",
          memberId: MEMBER_1_ID,
          startDate: "2025-01-08",
          endDate: "2025-01-08",
        }),
        makeAbsence({
          id: "a2",
          memberId: MEMBER_2_ID,
          startDate: "2025-01-08",
          endDate: "2025-01-08",
        }),
      ],
      staleReads: true,
    };
    const { deps, recorded } = createFakes(bothAbsent);

    const first = await runAtRiskEscalation(deps, { householdId: HOUSEHOLD_ID, horizonDays: 14 });
    expect(first.notifications).toHaveLength(2);
    expect(recorded).toEqual([{ date: "2025-01-08", event: DAY_AT_RISK_BOTH_ABSENT_EVENT }]);

    // A retried / overlapping run: it still plans the day (stale empty read) but
    // `claimNotified` loses the race, so it dispatches nothing.
    const second = await runAtRiskEscalation(deps, { householdId: HOUSEHOLD_ID, horizonDays: 14 });
    expect(second.notifications).toEqual([]);
    expect(second.escalations).toEqual([]);
    expect(recorded).toHaveLength(1);
  });

  it("ignores weekends and days outside the horizon", async () => {
    const { deps } = createFakes({
      absences: [
        // 2025-01-11 is a Saturday — not a childcare day under Mon–Fri.
        makeAbsence({
          id: "a1",
          memberId: MEMBER_1_ID,
          startDate: "2025-01-11",
          endDate: "2025-01-11",
        }),
        makeAbsence({
          id: "a2",
          memberId: MEMBER_2_ID,
          startDate: "2025-01-11",
          endDate: "2025-01-11",
        }),
        // 2025-03-01 is well past a 14-day horizon.
        makeAbsence({
          id: "a3",
          memberId: MEMBER_1_ID,
          startDate: "2025-03-01",
          endDate: "2025-03-01",
        }),
        makeAbsence({
          id: "a4",
          memberId: MEMBER_2_ID,
          startDate: "2025-03-01",
          endDate: "2025-03-01",
        }),
      ],
    });

    const result = await runAtRiskEscalation(deps, { householdId: HOUSEHOLD_ID, horizonDays: 14 });
    expect(result.escalations).toEqual([]);
  });

  it("leaves a resolved day alone", async () => {
    const { deps } = createFakes({
      assignments: [
        makeAssignment({ date: "2025-01-08", assigneeId: MEMBER_1_ID, source: "direct-claim" }),
      ],
      absences: [
        makeAbsence({
          id: "a1",
          memberId: MEMBER_2_ID,
          startDate: "2025-01-08",
          endDate: "2025-01-08",
        }),
      ],
    });

    const result = await runAtRiskEscalation(deps, { householdId: HOUSEHOLD_ID, horizonDays: 14 });
    expect(result.escalations).toEqual([]);
  });
});
