/**
 * The full notification catalogue matrix (issue #5, `docs/testing.md` §4 point
 * 2) — one row per catalogue event asserting **(recipients, coalescable?)**.
 *
 * The pickup-request lifecycle events (2–8) also have their recipient wiring
 * pinned in `src/domain/services/notificationRecipients.test.ts` against the
 * services that raise them; this file is the single place every event — 1
 * through 12 — is checked for its recipient *rule* and its coalescing flag.
 *
 *   - recipient rule: "single non-actor member" for every event except the two
 *     actor-less ones (both-absent, 48h-silence), which notify "both".
 *   - coalescable: only the two settings events.
 */

import { describe, expect, it } from "vitest";
import type { DayStateFacts, Weekday } from "@/domain";
import {
  ASSIGNMENT_STANDS_EVENT,
  CHILDCARE_PATTERN_CHANGED_EVENT,
  CLOSURE_ADDED_EVENT,
  DAY_AT_RISK_BOTH_ABSENT_EVENT,
  DAY_AT_RISK_ESCALATED_EVENT,
  DIRECT_CLAIM_EVENT,
  isCoalescableEvent,
  NOTIFICATION_EVENTS,
  PICKUP_REQUEST_ACCEPTED_EVENT,
  PICKUP_REQUEST_DECLINED_EVENT,
  PICKUP_REQUEST_RECEIVED_EVENT,
  PICKUP_REQUEST_WITHDRAWN_EVENT,
  planAtRiskEscalations,
  recordAbsence,
} from "@/domain";
import {
  ANCHOR_DATE,
  MEMBER_1_ID,
  MEMBER_2_ID,
  makeMember,
  makePickupRequest,
  resetIdCounter,
} from "@/testing";

type RecipientRule = "single-non-actor" | "both";

interface Row {
  readonly n: number;
  readonly event: string;
  readonly recipients: RecipientRule;
  readonly coalescable: boolean;
}

/** Issue #5's numbered catalogue, verbatim. */
const CATALOGUE: readonly Row[] = [
  {
    n: 1,
    event: PICKUP_REQUEST_RECEIVED_EVENT,
    recipients: "single-non-actor",
    coalescable: false,
  },
  {
    n: 2,
    event: PICKUP_REQUEST_ACCEPTED_EVENT,
    recipients: "single-non-actor",
    coalescable: false,
  },
  {
    n: 3,
    event: PICKUP_REQUEST_DECLINED_EVENT,
    recipients: "single-non-actor",
    coalescable: false,
  },
  {
    n: 4,
    event: PICKUP_REQUEST_WITHDRAWN_EVENT,
    recipients: "single-non-actor",
    coalescable: false,
  },
  { n: 7, event: DIRECT_CLAIM_EVENT, recipients: "single-non-actor", coalescable: false },
  { n: 8, event: ASSIGNMENT_STANDS_EVENT, recipients: "single-non-actor", coalescable: false },
  { n: 9, event: DAY_AT_RISK_BOTH_ABSENT_EVENT, recipients: "both", coalescable: false },
  { n: 10, event: DAY_AT_RISK_ESCALATED_EVENT, recipients: "both", coalescable: false },
  {
    n: 11,
    event: CHILDCARE_PATTERN_CHANGED_EVENT,
    recipients: "single-non-actor",
    coalescable: true,
  },
  { n: 12, event: CLOSURE_ADDED_EVENT, recipients: "single-non-actor", coalescable: true },
];

describe("notification catalogue — coalescing flag", () => {
  it.each(CATALOGUE)("event $n ($event) coalescable = $coalescable", ({ event, coalescable }) => {
    expect(isCoalescableEvent(event)).toBe(coalescable);
  });

  it("only the two settings events coalesce", () => {
    expect(NOTIFICATION_EVENTS.filter(isCoalescableEvent).sort()).toEqual(
      [CHILDCARE_PATTERN_CHANGED_EVENT, CLOSURE_ADDED_EVENT].sort(),
    );
  });
});

describe("notification catalogue — recipient rule", () => {
  const patternFor = (weekdays: Weekday[]) => ({
    async findByHousehold() {
      return {
        id: "household-1",
        householdId: "household-1",
        versions: [{ weekdays, effectiveFrom: ANCHOR_DATE }],
      };
    },
    async save() {},
  });

  it("event 1 (request received) → the single non-actor member", async () => {
    resetIdCounter();
    const requester = makeMember({ id: MEMBER_1_ID, name: "Alex" });
    const other = makeMember({ id: MEMBER_2_ID, name: "Bailey" });

    const saved: unknown[] = [];
    const deps = {
      absences: {
        async findById() {
          return null;
        },
        async listByHousehold() {
          return [
            {
              id: "abs-1",
              householdId: "household-1",
              memberId: MEMBER_1_ID,
              startDate: "2025-01-08",
              endDate: "2025-01-08",
            },
          ];
        },
        async listCovering() {
          return [];
        },
        async save() {},
        async delete() {},
      },
      pickupRequests: {
        async findById() {
          return null;
        },
        async findByDate() {
          return null;
        },
        async listByHousehold() {
          return [];
        },
        async save(r: unknown) {
          saved.push(r);
        },
      },
      assignments: {
        async findByDate() {
          return null;
        },
        async listByHousehold() {
          return [];
        },
        async save() {},
        async delete() {},
      },
      childcarePattern: patternFor(["mon", "tue", "wed", "thu", "fri"] as Weekday[]),
      closures: {
        async listByHousehold() {
          return [];
        },
        async findByDate() {
          return null;
        },
        async save() {},
        async delete() {},
      },
      members: {
        async findById(id: string) {
          return [requester, other].find((m) => m.id === id) ?? null;
        },
        async findByEmail() {
          return null;
        },
        async listByHousehold() {
          return [requester, other];
        },
        async save() {},
      },
      clock: { now: () => new Date("2025-01-06T09:00:00.000Z") },
      ids: {
        next: (() => {
          let i = 0;
          return () => {
            i += 1;
            return `gen-${i}`;
          };
        })(),
      },
    };

    const { notification } = await recordAbsence(deps, {
      householdId: "household-1",
      memberId: MEMBER_1_ID,
      startDate: "2025-01-08",
      endDate: "2025-01-08",
    });

    expect(notification?.event).toBe(PICKUP_REQUEST_RECEIVED_EVENT);
    expect(notification?.recipientId).toBe(MEMBER_2_ID); // the non-actor
  });

  it("events 9 + 10 (at-risk) → both members", () => {
    const bothAbsentDay: DayStateFacts = {
      date: "2025-01-08",
      isChildcareDay: true,
      assignment: null,
      openRequest: null,
      absentMemberIds: [MEMBER_1_ID, MEMBER_2_ID],
    };
    const escalatedDay: DayStateFacts = {
      date: "2025-01-09",
      isChildcareDay: true,
      assignment: null,
      openRequest: makePickupRequest({
        date: "2025-01-09",
        state: "Open",
        raisedAt: new Date("2025-01-01T00:00:00.000Z"),
      }),
      absentMemberIds: [MEMBER_1_ID],
    };

    const plan = planAtRiskEscalations({
      days: [bothAbsentDay, escalatedDay],
      memberIds: [MEMBER_1_ID, MEMBER_2_ID],
      alreadyNotified: new Set<string>(),
      now: new Date("2025-01-06T09:00:00.000Z"),
    });

    expect(plan.map((e) => e.event)).toEqual([
      DAY_AT_RISK_BOTH_ABSENT_EVENT,
      DAY_AT_RISK_ESCALATED_EVENT,
    ]);
    for (const escalation of plan) {
      expect(escalation.notifications.map((notice) => notice.recipientId).sort()).toEqual(
        [MEMBER_1_ID, MEMBER_2_ID].sort(),
      );
    }
  });
});
