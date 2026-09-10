/**
 * Framework-free "is this date a childcare day?" derivation (ADR-0002, ADR-0005).
 *
 * A **childcare day** is a concrete date the child needs collecting: included by
 * the childcare pattern version in effect *on that date* and not removed by a
 * `Closure` (CONTEXT.md). It is derived, never stored.
 *
 * This is the shared helper the calendar grid (#49) and the live day-state
 * derivation (#50) both build on. The seam:
 *
 *   - `weekdayOf(date)` — a pure `'YYYY-MM-DD' → Weekday` map (UTC, no zone drift).
 *   - `resolvePatternVersion(pattern, date)` — the version whose `effectiveFrom`
 *     is the latest that is `<= date`; `null` if `date` precedes every version
 *     (or there is no pattern).
 *   - `childcareDayInputs(pattern, closures, date)` — the `{ isPatternWeekday,
 *     hasClosure }` pair the presentation mapper `dayDisplayState()` consumes.
 *   - `isChildcareDay(pattern, closures, date)` — the boolean, folded from those
 *     inputs: a pattern weekday with no closure.
 *
 * Nothing here reads a clock or a repository — callers pass the already-loaded
 * `ChildcarePattern` and `Closure[]`.
 */

import type {
  CalendarDate,
  ChildcarePattern,
  ChildcarePatternVersion,
  Closure,
  Weekday,
} from "../types";

/** `Date.prototype.getUTCDay()` order: 0 = Sunday … 6 = Saturday. */
const WEEKDAYS_BY_UTC_DAY: readonly Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * The weekday a `'YYYY-MM-DD'` date falls on. Built on a `Date` pinned to
 * UTC-midnight — the same technique as `src/testing/factories.ts`'s `addDays` —
 * so it never drifts across a timezone.
 */
export function weekdayOf(date: CalendarDate): Weekday {
  const [year, month, day] = date.split("-").map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return WEEKDAYS_BY_UTC_DAY[utcDay];
}

/**
 * The childcare pattern version in effect on `date`: the one with the latest
 * `effectiveFrom` that is still `<= date` (inclusive — a date exactly on a
 * version's `effectiveFrom` resolves to that version). `null` when there is no
 * pattern, or `date` precedes the earliest version — either way, `date` is not a
 * childcare day. `'YYYY-MM-DD'` strings compare chronologically, so no parsing
 * is needed; the scan is defensive about version order rather than trusting it.
 */
export function resolvePatternVersion(
  pattern: Pick<ChildcarePattern, "versions"> | null | undefined,
  date: CalendarDate,
): ChildcarePatternVersion | null {
  if (!pattern) return null;
  let resolved: ChildcarePatternVersion | null = null;
  for (const version of pattern.versions) {
    if (version.effectiveFrom <= date) {
      if (resolved === null || version.effectiveFrom > resolved.effectiveFrom) {
        resolved = version;
      }
    }
  }
  return resolved;
}

/**
 * Would saving `weekdays` effective from `effectiveFrom` actually change the
 * childcare schedule? Compares the proposed weekdays against the version that
 * *resolves as effective for `effectiveFrom`* (`resolvePatternVersion`), not
 * just a version whose `effectiveFrom` is an exact match.
 *
 * So a future-dated version that merely restates the currently-effective
 * weekdays is a no-op — it moves no pickups and must not fire the
 * "childcare pattern changed" notification (issue #92). `true` when there is no
 * resolvable prior version (a genuinely new pattern) or the weekday sets differ.
 */
export function patternVersionChangesSchedule(
  pattern: Pick<ChildcarePattern, "versions"> | null | undefined,
  weekdays: readonly Weekday[],
  effectiveFrom: CalendarDate,
): boolean {
  const prior = resolvePatternVersion(pattern, effectiveFrom);
  if (!prior) return true;
  return [...prior.weekdays].sort().join() !== [...weekdays].sort().join();
}

/** The two calendar facts `dayDisplayState()` needs to widen a domain `n/a`. */
export interface ChildcareDayInputs {
  /** `date`'s weekday is in the pattern version that was in effect *then*. */
  readonly isPatternWeekday: boolean;
  /** An explicit `Closure` row falls on `date`. */
  readonly hasClosure: boolean;
}

/**
 * The `{ isPatternWeekday, hasClosure }` pair for `date`, resolved against the
 * effective-dated pattern (ADR-0002) and the closure list. The companion to
 * `isChildcareDay` — `dayDisplayState()` in `src/ui` consumes this directly.
 */
export function childcareDayInputs(
  pattern: ChildcarePattern | null | undefined,
  closures: readonly Closure[],
  date: CalendarDate,
): ChildcareDayInputs {
  const version = resolvePatternVersion(pattern, date);
  return {
    isPatternWeekday: version?.weekdays.includes(weekdayOf(date)) ?? false,
    hasClosure: closures.some((closure) => closure.date === date),
  };
}

/**
 * Whether `date` is a childcare day: a weekday the pattern version in effect
 * then includes, with no `Closure` on it. Adding a *newer* pattern version never
 * changes the answer for an earlier date, because resolution only ever looks
 * backward from `date`.
 */
export function isChildcareDay(
  pattern: ChildcarePattern | null | undefined,
  closures: readonly Closure[],
  date: CalendarDate,
): boolean {
  const { isPatternWeekday, hasClosure } = childcareDayInputs(pattern, closures, date);
  return isPatternWeekday && !hasClosure;
}
