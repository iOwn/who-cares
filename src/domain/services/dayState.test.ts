/**
 * The live Day-state derivation (ADR-0003) — exhaustive, table-driven
 * (docs/testing.md §"What deserves a test" point 1).
 *
 * `dayState()` takes `isChildcareDay` as a resolved boolean; the pattern-version
 * × closure axis that produces it is exhausted in `childcareDay.test.ts`, and
 * the two are folded end-to-end in `src/ui/calendarMonth.test.ts`. Here the
 * input space is
 *   `{isChildcareDay} × {assignment: none / assignee-not-absent / assignee-absent}
 *    × {open-request age vs each 48h threshold} × {0,1,2 members absent}`,
 * with `now` supplied per case. Every named state is reachable by ≥1 row; the
 * two 48h thresholds are isolated in their own cases; the "assignee later
 * records their own absence" re-flag is covered explicitly.
 */

import { describe, expect, it } from "vitest";
import {
  ANCHOR_DATE,
  MEMBER_1_ID,
  MEMBER_2_ID,
  makeAssignment,
  makePickupRequest,
} from "@/testing";
import type { CalendarDate } from "../types";
import {
  AT_RISK_THRESHOLD_MS,
  type DayState,
  type DayStateFacts,
  type DayStateReason,
  dayState,
} from "./dayState";

const A = MEMBER_1_ID;
const B = MEMBER_2_ID;

/** A Wednesday, well clear of the anchor. */
const DAY: CalendarDate = "2025-03-05";
/** Baseline "now": 4 days before `DAY`, so neither 48h clock is near crossing. */
const NOW = new Date("2025-03-01T12:00:00.000Z");
/** Start of `DAY`, UTC — the instant the "48h before the day" clock counts back from. */
const DAY_START_MS = Date.parse(`${DAY}T00:00:00.000Z`);

function facts(over: Partial<DayStateFacts> = {}): DayStateFacts {
  return {
    date: DAY,
    isChildcareDay: true,
    assignment: null,
    openRequest: null,
    absentMemberIds: [],
    ...over,
  };
}

const request = (raisedAt: Date) => makePickupRequest({ date: DAY, raisedAt, state: "Open" });
const assignedTo = (assigneeId: string | null) => makeAssignment({ date: DAY, assigneeId });

interface Case {
  readonly name: string;
  readonly facts: DayStateFacts;
  readonly now: Date;
  readonly expected: DayState;
  /** Asserted when given — the branch discriminant the presentation layer reads. */
  readonly reason?: DayStateReason;
}

const cases: readonly Case[] = [
  // --- not a childcare day → always n/a ---
  {
    name: "not a childcare day, nothing else",
    facts: facts({ isChildcareDay: false }),
    now: NOW,
    expected: "n/a",
  },
  {
    name: "not a childcare day, even with an absence + a stale request",
    facts: facts({
      isChildcareDay: false,
      openRequest: request(new Date(NOW.getTime() - 5 * AT_RISK_THRESHOLD_MS)),
      absentMemberIds: [A],
    }),
    now: NOW,
    expected: "n/a",
  },

  // --- uncontested childcare day ---
  {
    name: "childcare day, nothing assigned, no request, nobody away",
    facts: facts(),
    now: NOW,
    expected: "n/a",
    reason: "uncontested",
  },

  // --- Resolved ---
  {
    name: "assigned to A, nobody away",
    facts: facts({ assignment: assignedTo(A) }),
    now: NOW,
    expected: "Resolved",
    reason: "assignee-covers",
  },
  {
    name: "assigned to A, B is away — A still covers",
    facts: facts({ assignment: assignedTo(A), absentMemberIds: [B] }),
    now: NOW,
    expected: "Resolved",
  },
  {
    name: "one absent, but assigned to the other, present member",
    facts: facts({ assignment: assignedTo(B), absentMemberIds: [A] }),
    now: NOW,
    expected: "Resolved",
  },

  // --- assignee later records their own absence: re-flag, Assignment untouched ---
  {
    name: "assigned to A, then A records their own absence for the day → re-flag",
    facts: facts({ assignment: assignedTo(A), absentMemberIds: [A] }),
    now: NOW,
    expected: "At-risk",
    reason: "assignee-now-absent",
  },
  {
    name: "assigned to nobody (explicit null) on a childcare day",
    facts: facts({ assignment: assignedTo(null) }),
    now: NOW,
    expected: "At-risk",
    reason: "no-one-assigned",
  },

  // --- both members absent → straight to At-risk, no request raised ---
  {
    name: "both away, no assignment, no request",
    facts: facts({ absentMemberIds: [A, B] }),
    now: NOW,
    expected: "At-risk",
    reason: "both-absent",
  },
  {
    name: "both away wins even over a still-fresh open request",
    facts: facts({
      absentMemberIds: [A, B],
      openRequest: request(new Date(NOW.getTime() - 1_000)),
    }),
    now: NOW,
    expected: "At-risk",
  },
  {
    name: "both away wins even over an assignment to one of them",
    facts: facts({ absentMemberIds: [A, B], assignment: assignedTo(A) }),
    now: NOW,
    expected: "At-risk",
  },

  // --- Pending vs At-risk: an open request, isolating each 48h threshold ---
  {
    name: "open request, fresh, day still far off → Pending",
    facts: facts({ absentMemberIds: [A], openRequest: request(new Date(NOW.getTime() - 60_000)) }),
    now: NOW,
    expected: "Pending",
    reason: "request-pending",
  },
  {
    name: "threshold 1 only: exactly 48h since the request was raised → At-risk",
    facts: facts({
      absentMemberIds: [A],
      openRequest: request(new Date(NOW.getTime() - AT_RISK_THRESHOLD_MS)),
    }),
    now: NOW,
    expected: "At-risk",
    reason: "request-escalated",
  },
  {
    name: "threshold 1 only: 1 minute short of 48h since raised → still Pending",
    facts: facts({
      absentMemberIds: [A],
      openRequest: request(new Date(NOW.getTime() - AT_RISK_THRESHOLD_MS + 60_000)),
    }),
    now: NOW,
    expected: "Pending",
  },
  {
    name: "threshold 2 only: request raised seconds ago, but now is exactly 48h before the day → At-risk",
    facts: facts({
      absentMemberIds: [A],
      openRequest: request(new Date(DAY_START_MS - AT_RISK_THRESHOLD_MS - 1_000)),
    }),
    now: new Date(DAY_START_MS - AT_RISK_THRESHOLD_MS),
    expected: "At-risk",
  },
  {
    name: "threshold 2 only: one minute before the 48h-before-the-day mark → still Pending",
    facts: facts({
      absentMemberIds: [A],
      openRequest: request(new Date(DAY_START_MS - AT_RISK_THRESHOLD_MS - 120_000)),
    }),
    now: new Date(DAY_START_MS - AT_RISK_THRESHOLD_MS - 60_000),
    expected: "Pending",
  },

  // --- an absent member with no open request left (Declined / Withdrawn) ---
  {
    name: "one away, nothing assigned, request already terminal (no open request)",
    facts: facts({ absentMemberIds: [A] }),
    now: NOW,
    expected: "At-risk",
    reason: "uncovered-no-request",
  },
];

describe("dayState — the live derivation (ADR-0003)", () => {
  it.each(cases)("$name → $expected", ({ facts: input, now, expected, reason }) => {
    const result = dayState(input, now);
    expect(result.state).toBe(expected);
    if (reason !== undefined) expect(result.reason).toBe(reason);
  });

  it("every named Day state is reachable from the table", () => {
    const reached = new Set(cases.map((c) => dayState(c.facts, c.now).state));
    expect(reached).toEqual(new Set<DayState>(["Resolved", "Pending", "At-risk", "n/a"]));
  });

  it("is a pure read — deriving twice does not mutate the facts or the Assignment", () => {
    const assignment = assignedTo(A);
    const input = facts({ assignment, absentMemberIds: [A] });
    const snapshot = structuredClone(input);
    dayState(input, NOW);
    dayState(input, NOW);
    expect(input).toEqual(snapshot);
    expect(assignment.assigneeId).toBe(A);
  });
});

describe("dayState — anchor-relative sanity", () => {
  it("does not treat the anchor date as special", () => {
    expect(dayState(facts({ date: ANCHOR_DATE, isChildcareDay: true }), NOW).state).toBe("n/a");
  });
});
