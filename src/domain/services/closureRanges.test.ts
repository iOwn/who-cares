import { describe, expect, it } from "vitest";
import type { Closure } from "../types";
import { groupClosureRanges } from "./closureRanges";
import { eachDateInclusive } from "./pickupRequestGeneration";

const closure = (date: string, extra: Partial<Closure> = {}): Closure => ({
  id: `c-${date}`,
  householdId: "h",
  date,
  kind: "manual",
  ...extra,
});
const days = (start: string, end: string, extra: Partial<Closure> = {}) =>
  eachDateInclusive(start, end).map((d) => closure(d, extra));

describe("groupClosureRanges (issue #171)", () => {
  it("returns nothing for no closures", () => {
    expect(groupClosureRanges([])).toEqual([]);
  });

  it("keeps a lone day as a group of one", () => {
    expect(groupClosureRanges([closure("2026-08-04")])).toEqual([
      {
        ids: ["c-2026-08-04"],
        startDate: "2026-08-04",
        endDate: "2026-08-04",
        dayCount: 1,
        needsCover: false,
      },
    ]);
  });

  it("groups a Mon–Fri week", () => {
    const [range, ...rest] = groupClosureRanges(days("2026-08-03", "2026-08-07"));
    expect(rest).toEqual([]);
    expect(range).toMatchObject({ startDate: "2026-08-03", endDate: "2026-08-07", dayCount: 5 });
  });

  it("groups a multi-week range stored with its weekends as one", () => {
    const ranges = groupClosureRanges(days("2026-08-04", "2026-08-22"));
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({
      startDate: "2026-08-04",
      endDate: "2026-08-22",
      dayCount: 19,
    });
  });

  it("bridges Friday to Monday, counting stored days only", () => {
    const ranges = groupClosureRanges([closure("2026-08-07"), closure("2026-08-10")]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({
      startDate: "2026-08-07",
      endDate: "2026-08-10",
      dayCount: 2,
    });
  });

  it("does not bridge other gaps", () => {
    expect(groupClosureRanges([closure("2026-08-06"), closure("2026-08-10")])).toHaveLength(2);
    expect(groupClosureRanges([closure("2026-08-04"), closure("2026-08-06")])).toHaveLength(2);
    // Saturday → Monday is not a Friday bridge.
    expect(groupClosureRanges([closure("2026-08-08"), closure("2026-08-10")])).toHaveLength(2);
  });

  it("splits on a different reason or kind, ignoring surrounding whitespace", () => {
    expect(
      groupClosureRanges([
        closure("2026-08-03", { reason: "Training" }),
        closure("2026-08-04", { reason: "Summer" }),
      ]),
    ).toHaveLength(2);
    expect(
      groupClosureRanges([closure("2026-08-03"), closure("2026-08-04", { needsCover: true })]),
    ).toHaveLength(2);
    expect(
      groupClosureRanges([
        closure("2026-08-03", { reason: "Training " }),
        closure("2026-08-04", { reason: "Training" }),
      ]),
    ).toHaveLength(1);
  });

  it("sorts unsorted input", () => {
    const ranges = groupClosureRanges([
      closure("2026-08-05"),
      closure("2026-08-03"),
      closure("2026-08-04"),
    ]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].ids).toEqual(["c-2026-08-03", "c-2026-08-04", "c-2026-08-05"]);
  });

  it("groups across month and year boundaries and past 31 days", () => {
    expect(groupClosureRanges(days("2026-12-29", "2027-01-03"))).toHaveLength(1);
    const long = groupClosureRanges(days("2026-07-20", "2026-08-31"));
    expect(long).toHaveLength(1);
    expect(long[0].dayCount).toBe(43);
  });

  it("carries reason and kind onto the range", () => {
    const [range] = groupClosureRanges(
      days("2026-08-03", "2026-08-04", { reason: "Summer break", needsCover: true }),
    );
    expect(range).toMatchObject({ reason: "Summer break", needsCover: true });
  });
});
