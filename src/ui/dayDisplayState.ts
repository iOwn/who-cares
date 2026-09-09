/**
 * The single presentation-layer mapper from the domain `Day state` to the UI
 * display states the calendar surfaces. Pure — no React, no tokens, no I/O —
 * so it lives in the `node` Vitest project (`dayDisplayState.test.ts`).
 *
 * The domain `Day state` stays EXACTLY `Resolved | Pending | At-risk | n/a`
 * (CONTEXT.md, `src/domain`) and is never widened there. This function is where
 * the UI splits the domain `n/a` into the three presentation-only outcomes the
 * Toybox screens need — `closed`, `off`, `quiet` — and lower-cases the three
 * real states. See docs/design-system.md "Display state vs domain Day state".
 */

import type { DayState } from "@/domain";

/**
 * The domain-level Day state (issue #50, `src/domain` `dayState()`), re-exported
 * under the name the presentation layer has always used for it so the two stay
 * in lock-step — `dayDisplayState()` widens its `n/a` into the display-only
 * `closed` / `off` / `quiet`.
 */
export type DomainDayState = DayState;

/** The UI display states. `StatePill` / `StateDot` / `Legend` use the first four; `DayCell` uses all six. */
export type DayDisplayState = "resolved" | "pending" | "at-risk" | "closed" | "quiet" | "off";

/**
 * The four display states the status vocabulary primitives (`StatePill`,
 * `StateDot`, `Legend`) speak — the meaningful subset of `DayDisplayState`
 * without the grid-only `quiet` / `off`. Kept as an `Extract` so it stays in
 * lock-step with the mapper's output.
 */
export type StatusDisplayState = Extract<
  DayDisplayState,
  "resolved" | "pending" | "at-risk" | "closed"
>;

/**
 * Whether a display state is one the 4-state status vocabulary (`StatePill` /
 * `StateDot` / `Legend`) can speak — i.e. not the grid-only `quiet` / `off`.
 */
export function isStatusDisplayState(state: DayDisplayState): state is StatusDisplayState {
  return state !== "quiet" && state !== "off";
}

/**
 * The friendly, user-facing label for each status-vocabulary state — shared by
 * `StatePill` (default label) and `Legend`. Kept here next to
 * `StatusDisplayState` (pure data, no React) so the two primitives don't have to
 * import from each other.
 */
export const STATUS_LABELS = {
  resolved: "Sorted",
  pending: "Waiting",
  "at-risk": "At risk",
  closed: "Closed",
} as const satisfies Record<StatusDisplayState, string>;

export interface DayDisplayInput {
  /** The domain-computed Day state for the date — passed through untouched. */
  readonly dayState: DomainDayState;
  /**
   * Whether the date's weekday is in the childcare pattern that was in effect
   * on that date (ADR-0002 — patterns are effective-dated). Only consulted when
   * `dayState` is `"n/a"`.
   */
  readonly isPatternWeekday: boolean;
  /**
   * Whether an explicit `Closure` row falls on the date. Only consulted when
   * `dayState` is `"n/a"`.
   */
  readonly hasClosure: boolean;
}

/**
 * Map a calendar date's domain Day state (plus just enough calendar context to
 * disambiguate `n/a`) to its UI display state.
 *
 * - `Resolved | Pending | At-risk` → `resolved | pending | at-risk`
 * - `n/a` + a closure → `closed` (closure wins, even on a non-pattern weekday —
 *   a `Closure` implies a pattern weekday, but be defensive)
 * - `n/a` + non-pattern weekday → `off`
 * - `n/a` + pattern weekday, no closure → `quiet` (an uncontested childcare day:
 *   nothing assigned, no open request, nobody absent — SPEC.md defers whether
 *   such a day gets an implicit "who's on duty", so today it is simply quiet)
 */
export function dayDisplayState({
  dayState,
  isPatternWeekday,
  hasClosure,
}: DayDisplayInput): DayDisplayState {
  switch (dayState) {
    case "Resolved":
      return "resolved";
    case "Pending":
      return "pending";
    case "At-risk":
      return "at-risk";
    case "n/a":
      if (hasClosure) return "closed";
      if (!isPatternWeekday) return "off";
      return "quiet";
    default: {
      const unreachable: never = dayState;
      throw new Error(`Unhandled domain Day state: ${String(unreachable)}`);
    }
  }
}
