import { describe, expect, it } from "vitest";
import {
  absence,
  MEMBER_1_ID,
  MEMBER_2_ID,
  makeAssignment,
  makeClosure,
  makeMember,
  makePickupRequest,
  pattern,
} from "@/testing";
import {
  buildCalendarMonth,
  dayAriaLabel,
  monthLabelOf,
  monthOf,
  shiftMonth,
} from "./calendarMonth";

const monToFri = pattern(["mon", "tue", "wed", "thu", "fri"], "2025-01-06");

describe("shiftMonth", () => {
  it.each([
    [2026, 9, 1, { year: 2026, month: 10 }],
    [2026, 12, 1, { year: 2027, month: 1 }],
    [2026, 1, -1, { year: 2025, month: 12 }],
    [2026, 6, -13, { year: 2025, month: 5 }],
    [2026, 6, 0, { year: 2026, month: 6 }],
  ] as const)("(%i-%i) + %i months", (y, m, delta, expected) => {
    expect(shiftMonth(y, m, delta)).toEqual(expected);
  });
});

describe("monthLabelOf / monthOf", () => {
  it("labels a month", () => {
    expect(monthLabelOf(2026, 9)).toBe("September 2026");
  });
  it("reads the month off a date", () => {
    expect(monthOf("2026-09-14")).toEqual({ year: 2026, month: 9 });
  });
});

describe("buildCalendarMonth", () => {
  it("lays out Monday-first weeks with leading/trailing blanks", () => {
    // September 2025: the 1st is a Monday, so no leading blank.
    const view = buildCalendarMonth({
      year: 2025,
      month: 9,
      pattern: monToFri,
      closures: [],
      today: "2025-09-15",
    });

    expect(view.label).toBe("September 2025");
    expect(view.weeks[0][0]).toMatchObject({ date: "2025-09-01", inMonth: true, dayOfMonth: 1 });
    expect(view.weeks.every((week) => week.length === 7)).toBe(true);
    // 30 days + 0 leading = 5 rows exactly.
    expect(view.weeks).toHaveLength(5);
  });

  it("marks a leading blank for a month that does not start on Monday", () => {
    // February 2025 starts on a Saturday → 5 leading blanks.
    const view = buildCalendarMonth({
      year: 2025,
      month: 2,
      pattern: monToFri,
      closures: [],
      today: "2025-02-01",
    });
    expect(view.weeks[0].slice(0, 5).every((day) => !day.inMonth)).toBe(true);
    expect(view.weeks[0][5]).toMatchObject({ date: "2025-02-01", inMonth: true });
  });

  it("derives quiet / off / closed display states and today", () => {
    const view = buildCalendarMonth({
      year: 2025,
      month: 1,
      pattern: monToFri,
      closures: [makeClosure({ date: "2025-01-08" })],
      today: "2025-01-15",
    });
    const byDate = new Map(view.weeks.flat().map((day) => [day.date, day]));

    expect(byDate.get("2025-01-08")).toMatchObject({ displayState: "closed", whoLabel: "closed" });
    expect(byDate.get("2025-01-09")).toMatchObject({ displayState: "quiet", whoLabel: "" });
    expect(byDate.get("2025-01-11")).toMatchObject({ displayState: "off" }); // Saturday
    expect(byDate.get("2025-01-02")).toMatchObject({ displayState: "off" }); // before pattern
    expect(byDate.get("2025-01-15")?.isToday).toBe(true);
  });

  it("gives in-month cells a full date + state aria-label, blanks none", () => {
    const view = buildCalendarMonth({
      year: 2025,
      month: 1,
      pattern: monToFri,
      closures: [makeClosure({ date: "2025-01-08" })],
      today: "2025-01-15",
    });
    const byDate = new Map(view.weeks.flat().map((day) => [day.date, day]));

    expect(byDate.get("2025-01-08")?.ariaLabel).toBe(
      "Wednesday, January 8, 2025 — childcare closed",
    );
    expect(byDate.get("2025-01-09")?.ariaLabel).toBe("Thursday, January 9, 2025 — childcare day");
    expect(byDate.get("2025-01-11")?.ariaLabel).toBe("Saturday, January 11, 2025 — no childcare");
    // Leading blank from December is not in-month → no label.
    expect(view.weeks[0].find((day) => !day.inMonth)?.ariaLabel).toBe("");
  });

  it("dayAriaLabel formats date + state phrase", () => {
    expect(dayAriaLabel("2026-09-14", "at-risk")).toBe(
      "Monday, September 14, 2026 — pickup at risk",
    );
  });

  it("folds live Day state (#50) over seeded assignments / requests / absences", () => {
    const members = [
      makeMember({ id: MEMBER_1_ID, name: "Alex" }),
      makeMember({ id: MEMBER_2_ID, name: "Bailey" }),
    ];
    // A Monday, so the Fri "pending" day is still > 48h out and neither
    // escalation clock has fired.
    const now = new Date("2025-01-06T09:00:00.000Z");

    const view = buildCalendarMonth({
      year: 2025,
      month: 1,
      pattern: monToFri,
      closures: [makeClosure({ date: "2025-01-20", reason: "Staff day" })],
      members,
      assignments: [
        makeAssignment({ date: "2025-01-09", assigneeId: MEMBER_1_ID }),
        makeAssignment({ date: "2025-01-07", assigneeId: MEMBER_2_ID }),
      ],
      pickupRequests: [
        makePickupRequest({
          date: "2025-01-10",
          requesterId: MEMBER_1_ID,
          recipientId: MEMBER_2_ID,
          raisedAt: new Date("2025-01-06T08:00:00.000Z"),
        }),
        // Raised days ago → past the 48h-since-raised threshold.
        makePickupRequest({
          date: "2025-01-31",
          requesterId: MEMBER_2_ID,
          recipientId: MEMBER_1_ID,
          raisedAt: new Date("2025-01-03T08:00:00.000Z"),
        }),
      ],
      absences: [
        absence({ from: "2025-01-08", to: "2025-01-08" }, { memberId: MEMBER_1_ID }),
        absence({ from: "2025-01-08", to: "2025-01-08" }, { memberId: MEMBER_2_ID }),
        absence({ from: "2025-01-07", to: "2025-01-07" }, { memberId: MEMBER_2_ID }),
      ],
      today: "2025-01-06",
      now,
    });
    const byDate = new Map(view.weeks.flat().map((day) => [day.date, day]));

    expect(byDate.get("2025-01-09")).toMatchObject({
      dayState: "Resolved",
      displayState: "resolved",
      whoLabel: "Alex",
      narrative: "Alex is on pickup.",
    });
    expect(byDate.get("2025-01-10")).toMatchObject({
      dayState: "Pending",
      displayState: "pending",
      whoLabel: "asked Bailey",
    });
    expect(byDate.get("2025-01-08")).toMatchObject({
      dayState: "At-risk",
      displayState: "at-risk",
      whoLabel: "both away",
    });
    // Assigned to Bailey, but Bailey is absent that day → re-flag, assignment untouched.
    expect(byDate.get("2025-01-07")).toMatchObject({
      dayState: "At-risk",
      whoLabel: "Bailey now away",
    });
    expect(byDate.get("2025-01-31")).toMatchObject({
      dayState: "At-risk",
      whoLabel: "no answer",
      narrative: "The pickup request to Alex has gone unanswered. This day needs attention.",
    });
    // The contested "who" line rides into the SR label too.
    expect(byDate.get("2025-01-08")?.ariaLabel).toBe(
      "Wednesday, January 8, 2025 — pickup at risk, both away",
    );
    // Untouched days still derive quiet / closed.
    expect(byDate.get("2025-01-13")?.displayState).toBe("quiet");
    // The list row / grid cell narrative stays generic; only the closureReason
    // field carries the free text (DayDetail is the only surface that shows it).
    expect(byDate.get("2025-01-20")).toMatchObject({
      displayState: "closed",
      narrative: "No childcare on this day.",
      closureReason: "Staff day",
    });
  });

  it("day-state copy: explicit-nobody assignment, and an unknown member id", () => {
    const view = buildCalendarMonth({
      year: 2025,
      month: 1,
      pattern: monToFri,
      closures: [],
      // No `members` passed → names fall back to a generic phrase.
      assignments: [makeAssignment({ date: "2025-01-08", assigneeId: null })],
      pickupRequests: [
        makePickupRequest({
          date: "2025-01-20", // well clear of both 48h clocks at `now`
          requesterId: MEMBER_1_ID,
          recipientId: MEMBER_2_ID,
          raisedAt: new Date("2025-01-08T08:00:00.000Z"),
        }),
      ],
      absences: [absence({ from: "2025-01-20", to: "2025-01-20" }, { memberId: MEMBER_1_ID })],
      today: "2025-01-08",
      now: new Date("2025-01-08T09:00:00.000Z"),
    });
    const byDate = new Map(view.weeks.flat().map((day) => [day.date, day]));

    expect(byDate.get("2025-01-08")).toMatchObject({
      dayState: "At-risk",
      whoLabel: "needs cover",
      narrative: "Nobody is covering pickup and there is no open request.",
    });
    // Unknown member ids → the generic fallback, not `undefined`.
    expect(byDate.get("2025-01-20")).toMatchObject({
      dayState: "Pending",
      whoLabel: "asked the other parent",
      narrative: "the other parent asked the other parent to cover this pickup. No answer yet.",
    });
  });

  it("notableDays is in-month closures / states only — weekends and quiet days hidden", () => {
    const view = buildCalendarMonth({
      year: 2025,
      month: 1,
      pattern: monToFri,
      closures: [
        makeClosure({ date: "2025-01-08", reason: "Staff day" }),
        makeClosure({ date: "2025-01-20" }),
      ],
      today: "2025-01-15",
    });
    expect(view.notableDays.map((day) => day.date)).toEqual(["2025-01-08", "2025-01-20"]);
  });
});
