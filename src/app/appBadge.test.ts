import { describe, expect, it } from "vitest";
import { badgeUpdateFor } from "./appBadge";

describe("badgeUpdateFor", () => {
  it("sets the icon badge to a positive count", () => {
    expect(badgeUpdateFor(1)).toEqual({ kind: "set", count: 1 });
    expect(badgeUpdateFor(9)).toEqual({ kind: "set", count: 9 });
  });

  it("clears at zero rather than showing a 0", () => {
    // `CountBadge` renders nothing at 0 for the same reason — the bell and the
    // app icon must never disagree.
    expect(badgeUpdateFor(0)).toEqual({ kind: "clear" });
  });

  it("clears for anything that isn't a positive finite count", () => {
    // A count that arrived over the wire as junk must take the badge *off*,
    // never leave a stale number stuck on a parent's Home Screen.
    expect(badgeUpdateFor(-1)).toEqual({ kind: "clear" });
    expect(badgeUpdateFor(Number.NaN)).toEqual({ kind: "clear" });
    expect(badgeUpdateFor(Number.POSITIVE_INFINITY)).toEqual({ kind: "clear" });
  });

  it("floors a fractional count — the platform wants an integer", () => {
    expect(badgeUpdateFor(2.7)).toEqual({ kind: "set", count: 2 });
  });
});
