/**
 * Pure month-grid math for the calendar feature (#49) — no React, no tokens, no
 * I/O, so it lives in the `node` Vitest project (`calendarMonth.test.ts`).
 * ADR-0009: non-trivial pure display logic is extracted and unit-tested here
 * rather than through a component test.
 *
 * It folds the framework-free childcare-day derivation (`childcareDayInputs`,
 * `src/domain`) and the live Day-state derivation (`dayState`, ADR-0003)
 * together with the presentation mapper (`dayDisplayState`) into the per-date
 * lookup a `CalendarGrid` / list view / day-detail modal renders. The
 * assignment / request / absence inputs are optional — omit them (as the #49
 * calendar did before #51 persists any) and every childcare day is simply
 * `quiet`.
 */

import {
  type Absence,
  type Assignment,
  type CalendarDate,
  type ChildcarePattern,
  type Closure,
  childcareDayInputs,
  type DayState,
  type DayStateReason,
  dayState,
  type Member,
  type PickupRequest,
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
  /** The UI display state — the domain `dayState` widened for display. */
  readonly displayState: DayDisplayState;
  /** The raw, live-derived domain Day state (never widened, never stored). */
  readonly dayState: DayState;
  /**
   * The one-line "who" label under the date: an assignee name, `"asked {name}"`,
   * `"both away"`, `"closed"`, … — empty for a quiet or off day.
   */
  readonly whoLabel: string;
  /**
   * The plain-language narrative line, calm and factual (SPEC.md) — always a
   * full sentence. Generic for a closure; `DayDetail` (only) appends
   * `closureReason` (docs/design-system.md "Closed affordance").
   */
  readonly narrative: string;
  /** The closure's free-text reason, when this day is `closed` and one was entered. */
  readonly closureReason?: string;
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

/**
 * `"Wednesday, January 8, 2025 — childcare closed"` — a `DayCell`'s SR label.
 * The `whoLabel` ("Alex", "asked Bailey", "both away", …) is appended for the
 * contested states so a screen-reader user gets the same "who" line sighted
 * users see in the cell; it is skipped for `closed` (the phrase already says it)
 * and empty for `quiet` / `off`.
 */
export function dayAriaLabel(
  date: CalendarDate,
  displayState: DayDisplayState,
  whoLabel = "",
): string {
  const [y, m, d] = date.split("-").map(Number);
  const long = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const base = `${long} — ${STATE_PHRASE[displayState]}`;
  return whoLabel && whoLabel !== "closed" ? `${base}, ${whoLabel}` : base;
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

/** An absence covers `date` when its inclusive `startDate`–`endDate` range spans it. */
function absenceCovers(absence: Absence, date: CalendarDate): boolean {
  return absence.startDate <= date && date <= absence.endDate;
}

interface DayCopy {
  /** The one-line "who" label under the grid date. */
  readonly whoLabel: string;
  /**
   * The plain-language narrative line — **generic** for a closure (the
   * free-text reason is DayDetail-only, docs/design-system.md "Closed
   * affordance"); the caller appends the reason there.
   */
  readonly narrative: string;
}

interface DescribeDayParams {
  readonly displayState: DayDisplayState;
  /** The branch `dayState()` took — the single source of truth for the copy. */
  readonly reason: DayStateReason;
  readonly assignment: Assignment | null;
  readonly openRequest: PickupRequest | null;
  /** `id → display name`; falls back to a generic phrase when a member is unknown. */
  readonly nameOf: (id: string) => string;
}

/**
 * The `{ whoLabel, narrative }` copy for a day. The `n/a` trio (`closed` / `off`
 * / `quiet`) is disambiguated by `displayState`; every contested state's copy is
 * keyed off the `dayState()` `reason` so the pill and the sentence can't drift.
 */
function describeDay({
  displayState,
  reason,
  assignment,
  openRequest,
  nameOf,
}: DescribeDayParams): DayCopy {
  if (displayState === "closed") {
    return { whoLabel: "closed", narrative: "No childcare on this day." };
  }
  if (displayState === "off") {
    return { whoLabel: "", narrative: "Not a childcare day." };
  }

  const quiet: DayCopy = {
    whoLabel: "",
    narrative: "A normal childcare day. Nobody has flagged being away.",
  };

  switch (reason) {
    case "not-childcare-day":
    case "uncontested":
      return quiet;
    case "assignee-covers": {
      const who = assignment?.assigneeId ? nameOf(assignment.assigneeId) : "Someone";
      return { whoLabel: who, narrative: `${who} is on pickup.` };
    }
    case "request-pending": {
      const asked = openRequest ? nameOf(openRequest.recipientId) : "the other parent";
      const by = openRequest ? nameOf(openRequest.requesterId) : "A parent";
      return {
        whoLabel: `asked ${asked}`,
        narrative: `${by} asked ${asked} to cover this pickup. No answer yet.`,
      };
    }
    case "both-absent":
      return {
        whoLabel: "both away",
        narrative: "Both of you are away and nobody is covering pickup yet.",
      };
    case "assignee-now-absent": {
      const who = assignment?.assigneeId ? nameOf(assignment.assigneeId) : "The assignee";
      return {
        whoLabel: `${who} now away`,
        narrative: `${who} was covering this day but is now away too. Nobody is on pickup.`,
      };
    }
    case "request-escalated": {
      const asked = openRequest ? nameOf(openRequest.recipientId) : "the other parent";
      return {
        whoLabel: "no answer",
        narrative: `The pickup request to ${asked} has gone unanswered. This day needs attention.`,
      };
    }
    case "no-one-assigned":
    case "uncovered-no-request":
      return {
        whoLabel: "needs cover",
        narrative: "Nobody is covering pickup and there is no open request.",
      };
    default: {
      const unreachable: never = reason;
      throw new Error(`Unhandled Day-state reason: ${String(unreachable)}`);
    }
  }
}

export interface BuildCalendarMonthParams {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  readonly pattern: ChildcarePattern | null;
  readonly closures: readonly Closure[];
  /** The real current date, `'YYYY-MM-DD'` — supplied, never read from a clock here. */
  readonly today: CalendarDate;
  /** Assignments for the household. Omit before #51 persists any. */
  readonly assignments?: readonly Assignment[];
  /** Pickup requests for the household (any state — only `"Open"` ones drive Day state). */
  readonly pickupRequests?: readonly PickupRequest[];
  /** Absences for the household. */
  readonly absences?: readonly Absence[];
  /** Members, for resolving assignee / requester / recipient display names. */
  readonly members?: readonly Member[];
  /**
   * The real current instant, for the ADR-0003 48h threshold math. Defaults to
   * `new Date()` — pass it explicitly from tests and anywhere determinism matters.
   */
  readonly now?: Date;
}

/** Build the full month grid + notable-day list for `(year, month)`. */
export function buildCalendarMonth({
  year,
  month,
  pattern,
  closures,
  today,
  assignments = [],
  pickupRequests = [],
  absences = [],
  members = [],
  now = new Date(),
}: BuildCalendarMonthParams): CalendarMonthView {
  const firstOfMonth = isoOf(year, month, 1);
  const leading = leadingBlankCount(year, month);
  const total = leading + daysInMonth(year, month);
  const rows = Math.ceil(total / 7);

  const nameByMember = new Map(members.map((m) => [m.id, m.name]));
  const nameOf = (id: string) => nameByMember.get(id) ?? "the other parent";

  // Index the point-lookup inputs once rather than re-scanning per cell. Absences
  // stay a list — they match by range, and v1 holds only a handful.
  const assignmentByDate = new Map(assignments.map((a) => [a.date, a]));
  const openRequestByDate = new Map(
    pickupRequests.filter((r) => r.state === "Open").map((r) => [r.date, r]),
  );
  const closureByDate = new Map(closures.map((c) => [c.date, c]));

  const days: CalendarDayView[] = [];
  for (let cell = 0; cell < rows * 7; cell += 1) {
    const date = addDays(firstOfMonth, cell - leading);
    const [cellYear, cellMonth, cellDay] = date.split("-").map(Number);
    const inMonth = cellYear === year && cellMonth === month;

    const { isPatternWeekday, hasClosure } = childcareDayInputs(pattern, closures, date);
    const assignment = assignmentByDate.get(date) ?? null;
    const openRequest = openRequestByDate.get(date) ?? null;
    const absentMemberIds = [
      ...new Set(absences.filter((a) => absenceCovers(a, date)).map((a) => a.memberId)),
    ];

    const { state, reason } = dayState(
      {
        date,
        isChildcareDay: isPatternWeekday && !hasClosure,
        assignment,
        openRequest,
        absentMemberIds,
      },
      now,
    );
    const displayState = dayDisplayState({ dayState: state, isPatternWeekday, hasClosure });
    const closureReason = closureByDate.get(date)?.reason;
    const { whoLabel, narrative } = describeDay({
      displayState,
      reason,
      assignment,
      openRequest,
      nameOf,
    });

    days.push({
      date,
      dayOfMonth: cellDay,
      inMonth,
      isToday: date === today,
      displayState,
      dayState: state,
      whoLabel,
      narrative,
      closureReason,
      ariaLabel: inMonth ? dayAriaLabel(date, displayState, whoLabel) : "",
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
