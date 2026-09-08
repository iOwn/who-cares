import { describe, expect, it } from "vitest";
import { type DayDisplayInput, dayDisplayState } from "./dayDisplayState";

/**
 * `dayDisplayState()` is the single presentation-layer mapper from the domain
 * `Day state` (`Resolved | Pending | At-risk | n/a`, CONTEXT.md — never widened
 * in the domain) to the UI display states the calendar surfaces. It widens the
 * domain `n/a` into three presentation-only outcomes:
 *
 *   - `closed` — `n/a` because an explicit `Closure` removed a pattern weekday
 *   - `off`    — `n/a` because the weekday was never in the childcare pattern
 *   - `quiet`  — a childcare day with nothing happening (no assignment, no open
 *                request, nobody absent). The domain has no dedicated v1 state
 *                for this ("uncontested childcare day", deferred in SPEC.md), so
 *                it arrives here as `n/a` on a pattern weekday with no closure.
 *
 * The three real states pass straight through, lower-cased.
 */

/** Convenience: a fully-specified input with sensible defaults per row. */
function input(
  overrides: Partial<DayDisplayInput> & Pick<DayDisplayInput, "dayState">,
): DayDisplayInput {
  return { isPatternWeekday: true, hasClosure: false, ...overrides };
}

describe("dayDisplayState — the domain → display state mapper", () => {
  describe("real domain states pass through, lower-cased", () => {
    it("maps Resolved → resolved", () => {
      expect(dayDisplayState(input({ dayState: "Resolved" }))).toBe("resolved");
    });

    it("maps Pending → pending", () => {
      expect(dayDisplayState(input({ dayState: "Pending" }))).toBe("pending");
    });

    it("maps At-risk → at-risk", () => {
      expect(dayDisplayState(input({ dayState: "At-risk" }))).toBe("at-risk");
    });
  });

  describe("n/a widens by cause", () => {
    it("n/a with an explicit closure on a pattern weekday → closed", () => {
      expect(dayDisplayState({ dayState: "n/a", isPatternWeekday: true, hasClosure: true })).toBe(
        "closed",
      );
    });

    it("n/a on a non-pattern weekday (e.g. a weekend) → off", () => {
      expect(dayDisplayState({ dayState: "n/a", isPatternWeekday: false, hasClosure: false })).toBe(
        "off",
      );
    });

    it("n/a on a pattern weekday with no closure (uncontested childcare day) → quiet", () => {
      expect(dayDisplayState({ dayState: "n/a", isPatternWeekday: true, hasClosure: false })).toBe(
        "quiet",
      );
    });

    it("a closure takes precedence over the weekday check (defensive — a Closure implies a pattern weekday)", () => {
      expect(dayDisplayState({ dayState: "n/a", isPatternWeekday: false, hasClosure: true })).toBe(
        "closed",
      );
    });
  });

  describe("a real state always wins over the widening fields", () => {
    it("Resolved stays resolved even if a closure flag is somehow set", () => {
      expect(
        dayDisplayState({ dayState: "Resolved", isPatternWeekday: true, hasClosure: true }),
      ).toBe("resolved");
    });

    it("At-risk stays at-risk on a flagged non-pattern weekday", () => {
      expect(
        dayDisplayState({ dayState: "At-risk", isPatternWeekday: false, hasClosure: false }),
      ).toBe("at-risk");
    });
  });

  it("covers every domain Day state (no unmapped input)", () => {
    const states: DayDisplayInput["dayState"][] = ["Resolved", "Pending", "At-risk", "n/a"];
    for (const dayState of states) {
      expect(() => dayDisplayState(input({ dayState }))).not.toThrow();
    }
  });
});
