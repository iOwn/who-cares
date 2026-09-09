/**
 * Pure month-grid math for the calendar feature (#49) — no React, no tokens, no
 * I/O, so it lives in the `node` Vitest project (`calendarMonth.test.ts`).
 * ADR-0009: non-trivial pure display logic is extracted and unit-tested here
 * rather than through a component test.
 *
 * It folds the framework-free childcare-day derivation (`childcareDayInputs`,
 * `src/domain`) together with the presentation mapper (`dayDisplayState`) into
 * the per-date lookup a `CalendarGrid` / list view renders. Until day-state
 * lands (#50) every date's domain `Day state` is `n/a`, so a cell is only ever
 * `quiet` (a childcare day), `off` (a non-pattern weekday) or `closed`.
 */

import {
  type CalendarDate,
  type ChildcarePattern,
  type Closure,
  childcareDayInputs,
} from "@/domain";
import { type DayDisplayState, dayDisplayState } from "./dayDisplayState";

/** Monday-first weekday headers for the grid. */
export const WEEKDAY_HEADERS = ["M", "T", "W", "T", "F", "S", "S"] as const;

export interface CalendarDayView {
  /** `'YYYY-MM-DD'`. */
  readonly date: CalendarDate;
  /** 1–31. */
  readonly dayOfMonth: number;
  /** `false` for the leading / trailing days that belong to the adjacent month. */
  readonly inMonth: boolean;
  /** `true` only for the real, current calendar date. */
  readonly isToday: boolean;
  /** The UI display state (see the module doc for the #49 subset). */
  readonly displayState: DayDisplayState;
  /**
   * The one-line "who" label under the date. In #49 this is `"closed"` for a
   * closure and empty otherwise — day-state (`"asked {name}"`, an assignee
   * name, …) arrives with #50.
   */
  readonly whoLabel: string;
  /**
   * Full date + state, for a `DayCell`'s screen-reader label — the visible grid
   * is otherwise a wall of bare numbers. `""` for the adjacent-month blanks.
   */
  readonly ariaLabel: string;
}

export interface CalendarMonthView {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  /** e.g. `"September 2026"`. */
  readonly label: string;
  /** 5–6 rows of exactly 7 days, Monday-first, with leading/trailing blanks. */
  readonly weeks: readonly (readonly CalendarDayView[])[];
  /** The in-month days that are worth surfacing in the List view (not `quiet` / `off`). */
  readonly notableDays: readonly CalendarDayView[];
}

/* --- internal UTC date helpers (mirrors src/testing/factories.ts) --- */

function isoOf(year: number, month: number, day: number): CalendarDate {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function addDays(date: CalendarDate, n: number): CalendarDate {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Weekday of the 1st of the month, Monday = 0 … Sunday = 6. */
function leadingBlankCount(year: number, month: number): number {
  const sundayZero = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return (sundayZero + 6) % 7;
}

const NOT_NOTABLE: ReadonlySet<DayDisplayState> = new Set(["quiet", "off"]);

/** The state phrase a `DayCell` aria-label ends with, per display state. */
const STATE_PHRASE: Record<DayDisplayState, string> = {
  resolved: "pickup sorted",
  pending: "pickup request waiting",
  "at-risk": "pickup at risk",
  closed: "childcare closed",
  quiet: "childcare day",
  off: "no childcare",
};

/** `"Wednesday, January 8, 2025 — childcare closed"` — a `DayCell`'s SR label. */
export function dayAriaLabel(date: CalendarDate, displayState: DayDisplayState): string {
  const [y, m, d] = date.split("-").map(Number);
  const long = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${long} — ${STATE_PHRASE[displayState]}`;
}

/** `"September 2026"` for `(2026, 9)`. */
export function monthLabelOf(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Step a `{ year, month }` (1–12) by `delta` whole months, unbounded. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (((zeroBased % 12) + 12) % 12) + 1 };
}

/** The `{ year, month }` a `'YYYY-MM-DD'` falls in. */
export function monthOf(date: CalendarDate): { year: number; month: number } {
  const [year, month] = date.split("-").map(Number);
  return { year, month };
}

export interface BuildCalendarMonthParams {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  readonly pattern: ChildcarePattern | null;
  readonly closures: readonly Closure[];
  /** The real current date, `'YYYY-MM-DD'` — supplied, never read from a clock here. */
  readonly today: CalendarDate;
}

/** Build the full month grid + notable-day list for `(year, month)`. */
export function buildCalendarMonth({
  year,
  month,
  pattern,
  closures,
  today,
}: BuildCalendarMonthParams): CalendarMonthView {
  const firstOfMonth = isoOf(year, month, 1);
  const leading = leadingBlankCount(year, month);
  const total = leading + daysInMonth(year, month);
  const rows = Math.ceil(total / 7);

  const days: CalendarDayView[] = [];
  for (let cell = 0; cell < rows * 7; cell += 1) {
    const date = addDays(firstOfMonth, cell - leading);
    const [cellYear, cellMonth, cellDay] = date.split("-").map(Number);
    const inMonth = cellYear === year && cellMonth === month;
    const { isPatternWeekday, hasClosure } = childcareDayInputs(pattern, closures, date);
    const displayState = dayDisplayState({ dayState: "n/a", isPatternWeekday, hasClosure });
    days.push({
      date,
      dayOfMonth: cellDay,
      inMonth,
      isToday: date === today,
      displayState,
      whoLabel: displayState === "closed" ? "closed" : "",
      ariaLabel: inMonth ? dayAriaLabel(date, displayState) : "",
    });
  }

  const weeks: CalendarDayView[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return {
    year,
    month,
    label: monthLabelOf(year, month),
    weeks,
    notableDays: days.filter((day) => day.inMonth && !NOT_NOTABLE.has(day.displayState)),
  };
}
