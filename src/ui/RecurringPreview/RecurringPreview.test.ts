/**
 * `recurringPreviewLine` — the pure copy behind `RecurringPreview`
 * (docs/testing.md §"What deserves a test" point 5: non-trivial pure display
 * logic is extracted and unit-tested in the `node` project). The component
 * itself is a plain `Callout` wrapper and gets no test.
 */

import { describe, expect, it } from "vitest";
import { recurringPreviewLine } from "./RecurringPreview";

describe("recurringPreviewLine", () => {
  interface Case {
    readonly name: string;
    readonly toCreate: number;
    readonly alreadyCovered: number;
    readonly capped: boolean;
    readonly expected: string;
  }

  const cases: Case[] = [
    {
      name: "creates several, none skipped",
      toCreate: 4,
      alreadyCovered: 0,
      capped: false,
      expected: "Creates 4 one-day absences.",
    },
    {
      name: "creates one — singular",
      toCreate: 1,
      alreadyCovered: 0,
      capped: false,
      expected: "Creates 1 one-day absence.",
    },
    {
      name: "creates some, skips already-covered days",
      toCreate: 2,
      alreadyCovered: 1,
      capped: false,
      expected: "Creates 2 one-day absences. Skipped 1 day already covered.",
    },
    {
      name: "creates some and the range was trimmed to the horizon",
      toCreate: 3,
      alreadyCovered: 0,
      capped: true,
      expected: "Creates 3 one-day absences. Dates past four weeks from today were trimmed off.",
    },
    {
      name: "nothing to create because every matching day is already covered",
      toCreate: 0,
      alreadyCovered: 3,
      capped: false,
      expected: "Every matching day is already covered — nothing new to add.",
    },
    {
      name: "nothing to create because no weekday matches the range",
      toCreate: 0,
      alreadyCovered: 0,
      capped: false,
      expected: "No matching weekdays fall in this date range.",
    },
    {
      name: "no matches and the range was trimmed",
      toCreate: 0,
      alreadyCovered: 0,
      capped: true,
      expected:
        "No matching weekdays fall in this date range. Dates past four weeks from today were trimmed off.",
    },
  ];

  it.each(cases)("$name", ({ toCreate, alreadyCovered, capped, expected }) => {
    expect(recurringPreviewLine(toCreate, alreadyCovered, capped)).toBe(expected);
  });
});
