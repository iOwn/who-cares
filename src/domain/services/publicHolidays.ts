/**
 * German public holidays, derived — never stored (ADR-0020, issue #167).
 *
 * A public holiday is a pure function of `(date, Bundesland)`: given a
 * household's state, this module computes the dates its public holidays fall
 * on and turns them into `Closure` values with `kind: "public-holiday"`, to be
 * merged with the household's own stored closures at read time
 * (`mergeClosures`). Nothing here is persisted — there is no row, no
 * generation job, no horizon to maintain. Framework-free, pure (ADR-0005).
 *
 * **Only state-wide, unambiguous holidays are derived.** A handful of German
 * holidays are scoped to individual municipalities rather than a whole state
 * (Mariä Himmelfahrt in Bayern outside majority-Catholic municipalities,
 * Fronleichnam in parts of Sachsen/Thüringen, the Augsburger Friedensfest in
 * Augsburg alone) — deriving those risks a *false* holiday that hides a day
 * that genuinely needs a pickup, which is the dangerous direction for this
 * app. They are deliberately excluded; a parent adds them as an ordinary
 * manual closure instead (`src/app/settings/childcareActions.ts`).
 */

import type { CalendarDate, ChildcarePattern, Closure, GermanState, Weekday } from "../types";
import { resolvePatternVersion, weekdayOf } from "./childcareDay";

// `GermanState` / `GERMAN_STATES` / `isGermanState` live in `../types` (plain
// domain data, the same place `Weekday` and `PICKUP_REQUEST_STATES` live) and
// are re-exported from `../index` — nothing state-related is redeclared here.
export type { GermanState } from "../types";
export { GERMAN_STATES, isGermanState } from "../types";

/** A named public holiday on a concrete date. */
export interface PublicHoliday {
  readonly date: CalendarDate;
  /** The holiday's German name, e.g. `"Ostermontag"`. */
  readonly name: string;
}

/* ------------------------------------------------------------------ *
 * Easter Sunday — the anchor every movable feast is offset from.
 * ------------------------------------------------------------------ */

/**
 * Easter Sunday for `year`, as `'YYYY-MM-DD'`. The anonymous Gregorian
 * algorithm (Meeus/Jones/Butcher), valid for any Gregorian year — accurate for
 * every year this module's window (`publicHolidayWindow`) ever reaches. Built
 * on `Date.UTC`, the same zone-safe technique `weekdayOf` uses
 * (`./childcareDay`).
 */
export function easterSunday(year: number): CalendarDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/** `date` plus `days` whole days, staying in `'YYYY-MM-DD'` (UTC, no zone drift). */
function addDays(date: CalendarDate, days: number): CalendarDate {
  const [y, m, d] = date.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

/** `'YYYY-MM-DD'` for a fixed `month`/`day` in `year` (UTC). */
function fixedDate(year: number, month: number, day: number): CalendarDate {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/**
 * The Wednesday 11 days before 23 November (Sachsen's Buß- und Bettag rule):
 * the last Wednesday before 23 November, which is always a Wednesday 11–17
 * November inclusive.
 */
function bussUndBettag(year: number): CalendarDate {
  const nov23 = fixedDate(year, 11, 23);
  const weekday = weekdayOf(nov23);
  const order: readonly Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  // Days to step back from 23 Nov to reach the Wednesday on/before it.
  const daysBack = (order.indexOf(weekday) - order.indexOf("wed") + 7) % 7;
  return addDays(nov23, -(daysBack === 0 ? 7 : daysBack));
}

/**
 * Every state-wide, unambiguous public holiday for `state` in `year`.
 *
 * **Deliberately excluded** (municipality-scoped, not state-wide): Mariä
 * Himmelfahrt in **BY** (observed only in majority-Catholic municipalities,
 * unlike SL where it is state-wide); Fronleichnam in **SN** / **TH**
 * (municipality option, unlike the six states where it is a full state
 * holiday); the Augsburger Friedensfest (Augsburg city only); and any one-off
 * historical holiday (e.g. Berlin's 8 May 2025 80th-anniversary holiday) — none
 * of these recur reliably enough to derive safely.
 */
export function publicHolidaysIn(state: GermanState, year: number): readonly PublicHoliday[] {
  const easter = easterSunday(year);
  const holidays: PublicHoliday[] = [
    { date: fixedDate(year, 1, 1), name: "Neujahr" },
    { date: addDays(easter, -2), name: "Karfreitag" },
    { date: addDays(easter, 1), name: "Ostermontag" },
    { date: fixedDate(year, 5, 1), name: "Tag der Arbeit" },
    { date: addDays(easter, 39), name: "Christi Himmelfahrt" },
    { date: addDays(easter, 50), name: "Pfingstmontag" },
    { date: fixedDate(year, 10, 3), name: "Tag der Deutschen Einheit" },
    { date: fixedDate(year, 12, 25), name: "1. Weihnachtstag" },
    { date: fixedDate(year, 12, 26), name: "2. Weihnachtstag" },
  ];

  if (state === "BW" || state === "BY" || state === "ST") {
    holidays.push({ date: fixedDate(year, 1, 6), name: "Heilige Drei Könige" });
  }
  if (state === "BE" || state === "MV") {
    holidays.push({ date: fixedDate(year, 3, 8), name: "Internationaler Frauentag" });
  }
  if (
    state === "BW" ||
    state === "BY" ||
    state === "HE" ||
    state === "NW" ||
    state === "RP" ||
    state === "SL"
  ) {
    holidays.push({ date: addDays(easter, 60), name: "Fronleichnam" });
  }
  if (state === "SL") {
    holidays.push({ date: fixedDate(year, 8, 15), name: "Mariä Himmelfahrt" });
  }
  if (state === "TH") {
    holidays.push({ date: fixedDate(year, 9, 20), name: "Weltkindertag" });
  }
  if (
    state === "BB" ||
    state === "HB" ||
    state === "HH" ||
    state === "MV" ||
    state === "NI" ||
    state === "SN" ||
    state === "SH" ||
    state === "ST" ||
    state === "TH"
  ) {
    holidays.push({ date: fixedDate(year, 10, 31), name: "Reformationstag" });
  }
  if (state === "BW" || state === "BY" || state === "NW" || state === "RP" || state === "SL") {
    holidays.push({ date: fixedDate(year, 11, 1), name: "Allerheiligen" });
  }
  if (state === "SN") {
    holidays.push({ date: bussUndBettag(year), name: "Buß- und Bettag" });
  }

  return holidays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** `holiday:<STATE>:<date>` — a derived closure's id, never an id a real row can collide with. */
function holidayClosureId(state: GermanState, date: CalendarDate): string {
  return `holiday:${state}:${date}`;
}

export interface PublicHolidayClosuresParams {
  readonly householdId: string;
  readonly state: GermanState;
  /** The household's effective-dated pattern — holidays are filtered to its weekdays. */
  readonly pattern: ChildcarePattern | null;
  /** Inclusive window bounds, `'YYYY-MM-DD'`. */
  readonly from: CalendarDate;
  readonly to: CalendarDate;
}

/**
 * Every public holiday of `state` inside `[from, to]` that falls on a weekday
 * the household's pattern (as in effect *on that date*, ADR-0002) includes —
 * as derived `Closure` values. A holiday on a weekend, or one the pattern
 * never covers, is correctly **not** a closure at all (it would otherwise
 * render `closed` instead of `off`, defeating "hide weekend days", #130).
 */
export function publicHolidayClosures(params: PublicHolidayClosuresParams): Closure[] {
  const { householdId, state, pattern, from, to } = params;
  if (from > to) return [];

  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));

  const closures: Closure[] = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    for (const holiday of publicHolidaysIn(state, year)) {
      if (holiday.date < from || holiday.date > to) continue;
      const version = resolvePatternVersion(pattern, holiday.date);
      if (!version?.weekdays.includes(weekdayOf(holiday.date))) continue;
      closures.push({
        id: holidayClosureId(state, holiday.date),
        householdId,
        date: holiday.date,
        reason: holiday.name,
        kind: "public-holiday",
      });
    }
  }
  return closures;
}

/**
 * Merge stored closures with derived public-holiday closures, one per date —
 * a parent's own manual closure on a holiday date always wins (it carries
 * their own reason and stays editable; `saveClosureAction`'s "reuse the row
 * already on that date" write path is what keeps the two from ever
 * double-existing). Sorted by date, matching `ClosureRepository.listByHousehold`.
 */
export function mergeClosures(stored: readonly Closure[], derived: readonly Closure[]): Closure[] {
  const storedDates = new Set(stored.map((c) => c.date));
  const merged = [...stored, ...derived.filter((c) => !storedDates.has(c.date))];
  return merged.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * The window public holidays are derived across, anchored on `today`: from 1
 * January of the previous year through 31 December two years out. Generous
 * enough to cover the calendar's unbounded-in-both-directions paging for any
 * date a parent is likely to look at soon, without open-endedly expanding a
 * window every read. Paging the calendar further out shows no derived
 * holidays beyond this bound — only ever a gap in decoration, never a gap in
 * correctness (a childcare day outside the window still derives correctly;
 * it just has no public-holiday closure layered on top of it).
 */
export function publicHolidayWindow(today: CalendarDate): { from: CalendarDate; to: CalendarDate } {
  const year = Number(today.slice(0, 4));
  return { from: fixedDate(year - 1, 1, 1), to: fixedDate(year + 2, 12, 31) };
}
