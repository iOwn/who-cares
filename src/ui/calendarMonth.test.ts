import { describe, expect, it } from "vitest";
import { makeClosure, pattern } from "@/testing";
import { buildCalendarMonth, monthLabelOf, monthOf, shiftMonth } from "./calendarMonth";

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
