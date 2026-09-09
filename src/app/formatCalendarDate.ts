/**
 * The two calendar-date display formats the calendar feature uses, in one
 * place (the grid/list, the day-detail sheet, and the inbox each reached for a
 * near-identical `toLocaleDateString` wrapper before). Dates are the app's
 * zone-free `'YYYY-MM-DD'` (`src/domain/types`), so every format pins
 * `timeZone: "UTC"` to read the date back out unshifted.
 */

import type { CalendarDate } from "@/domain";

function at(date: CalendarDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** `"Mon, Jan 13"` — grid/list rows, request cards. */
export function shortDate(date: CalendarDate): string {
  return at(date).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** `"Monday, January 13, 2026"` — the day-detail sheet title. */
export function longDate(date: CalendarDate): string {
  return at(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
