/**
 * `isChildcareDay` and its seam (`weekdayOf`, `resolvePatternVersion`,
 * `childcareDayInputs`) — the effective-dated-pattern derivation of ADR-0002.
 *
 * Targeted, table-driven (docs/testing.md §"What deserves a test" point 3): a
 * date resolves against the version in effect *then*; a newer version never
 * changes an earlier date; the `date == effectiveFrom` boundary is inclusive; a
 * closure removes an otherwise-included day; a date before the earliest version
 * is not a childcare day; a non-pattern weekday is not.
 */

import { describe, expect, it } from "vitest";
import { makeClosure, pattern } from "@/testing";
import type { ChildcarePattern, Closure } from "../types";
import {
  childcareDayInputs,
  isChildcareDay,
  patternVersionChangesSchedule,
  resolvePatternVersion,
  weekdayOf,
} from "./childcareDay";

describe("weekdayOf", () => {
  it.each([
    ["2025-01-06", "mon"],
    ["2025-01-08", "wed"],
    ["2025-01-11", "sat"],
    ["2025-01-12", "sun"],
    ["2024-02-29", "thu"], // leap day, no zone drift
  ] as const)("%s → %s", (date, weekday) => {
    expect(weekdayOf(date)).toBe(weekday);
  });
});

describe("isChildcareDay — the effective-dated derivation (ADR-0002)", () => {
  const monToFri = pattern(["mon", "tue", "wed", "thu", "fri"], "2025-01-06");
  const monToFriThenMonOnly = pattern.versions([
    { weekdays: ["mon", "tue", "wed", "thu", "fri"], effectiveFrom: "2025-01-06" },
    { weekdays: ["mon"], effectiveFrom: "2025-06-02" },
  ]);

  const cases: ReadonlyArray<{
    name: string;
    pattern: ChildcarePattern | null;
    closures: readonly Closure[];
    date: string;
    expected: boolean;
  }> = [
    {
      name: "a weekday the sole version includes",
      pattern: monToFri,
      closures: [],
      date: "2025-01-08", // Wed
      expected: true,
    },
    {
      name: "a non-pattern weekday (Saturday) under a Mon–Fri version",
      pattern: monToFri,
      closures: [],
      date: "2025-01-11", // Sat
      expected: false,
    },
    {
      name: "a date before the earliest version is not a childcare day",
      pattern: monToFri,
      closures: [],
      date: "2025-01-02", // Thu, but before effectiveFrom
      expected: false,
    },
    {
      name: "boundary: date == effectiveFrom resolves to that version (inclusive)",
      pattern: monToFri,
      closures: [],
      date: "2025-01-06", // Mon, exactly the effectiveFrom
      expected: true,
    },
    {
      name: "a closure removes a day the pattern would include",
      pattern: monToFri,
      closures: [makeClosure({ date: "2025-01-08" })],
      date: "2025-01-08", // Wed
      expected: false,
    },
    {
      name: "adding a newer version leaves a PAST date deriving from the old one",
      pattern: monToFriThenMonOnly,
      closures: [],
      date: "2025-01-08", // Wed — before the Mon-only version
      expected: true,
    },
    {
      name: "a date under the newer version derives from it (Wed no longer included)",
      pattern: monToFriThenMonOnly,
      closures: [],
      date: "2025-06-04", // Wed — after the Mon-only version took effect
      expected: false,
    },
    {
      name: "no pattern at all → not a childcare day",
      pattern: null,
      closures: [],
      date: "2025-01-08",
      expected: false,
    },
  ];

  it.each(cases)("$name", ({ pattern: pat, closures, date, expected }) => {
    expect(isChildcareDay(pat, closures, date)).toBe(expected);
  });
});

describe("resolvePatternVersion — the seam #50 builds on", () => {
  const versioned = pattern.versions([
    { weekdays: ["mon", "tue"], effectiveFrom: "2025-01-06" },
    { weekdays: ["mon", "tue", "wed"], effectiveFrom: "2025-03-03" },
  ]);

  it("returns null before the earliest version", () => {
    expect(resolvePatternVersion(versioned, "2025-01-01")).toBeNull();
  });

  it("returns the earlier version for a date between the two", () => {
    expect(resolvePatternVersion(versioned, "2025-02-01")?.effectiveFrom).toBe("2025-01-06");
  });

  it("returns the later version on and after its effectiveFrom", () => {
    expect(resolvePatternVersion(versioned, "2025-03-03")?.effectiveFrom).toBe("2025-03-03");
    expect(resolvePatternVersion(versioned, "2025-09-01")?.effectiveFrom).toBe("2025-03-03");
  });

  it("returns null for a missing pattern", () => {
    expect(resolvePatternVersion(null, "2025-03-03")).toBeNull();
  });
});

describe("patternVersionChangesSchedule — the settings-notification gate (issue #92)", () => {
  const monToFri = pattern(["mon", "tue", "wed", "thu", "fri"], "2025-01-06");

  it("is true when there is no pattern yet", () => {
    expect(patternVersionChangesSchedule(null, ["mon"], "2025-01-06")).toBe(true);
  });

  it("is true when the new version precedes every existing version", () => {
    expect(patternVersionChangesSchedule(monToFri, ["mon", "tue"], "2025-01-01")).toBe(true);
  });

  it("is false for a future-dated version that restates the currently-effective weekdays", () => {
    // No version starts on 2025-06-02, but Mon–Fri resolves as effective there.
    expect(
      patternVersionChangesSchedule(monToFri, ["fri", "mon", "wed", "thu", "tue"], "2025-06-02"),
    ).toBe(false);
  });

  it("is true for a future-dated version that changes the weekdays", () => {
    expect(patternVersionChangesSchedule(monToFri, ["mon", "tue"], "2025-06-02")).toBe(true);
  });

  it("compares against the exact-date version when one exists", () => {
    const twoVersions = pattern.versions([
      { weekdays: ["mon", "tue"], effectiveFrom: "2025-01-06" },
      { weekdays: ["mon", "tue", "wed"], effectiveFrom: "2025-03-03" },
    ]);
    expect(patternVersionChangesSchedule(twoVersions, ["mon", "tue", "wed"], "2025-03-03")).toBe(
      false,
    );
    expect(patternVersionChangesSchedule(twoVersions, ["mon"], "2025-03-03")).toBe(true);
  });
});

describe("childcareDayInputs — the presentation seam", () => {
  const monToFri = pattern(["mon", "tue", "wed", "thu", "fri"], "2025-01-06");

  it("reports isPatternWeekday + hasClosure independently", () => {
    expect(
      childcareDayInputs(monToFri, [makeClosure({ date: "2025-01-08" })], "2025-01-08"),
    ).toEqual({ isPatternWeekday: true, hasClosure: true });

    expect(childcareDayInputs(monToFri, [], "2025-01-11")).toEqual({
      isPatternWeekday: false,
      hasClosure: false,
    });
  });
});
