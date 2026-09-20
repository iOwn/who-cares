/**
 * The viewer's calendar display preferences (#130) — today just "hide weekend
 * days".
 *
 * ## Why a cookie
 *
 * The grid is server-rendered, so the preference has to be readable *during*
 * the server render or the first paint shows seven columns and then reflows to
 * five. `localStorage` only lands after mount; a cookie arrives with the
 * request. A DB column would follow the parent to a second device, but Preview
 * Neon branches aren't auto-migrated (#123), and a display preference isn't
 * worth blocking a schema change on — #143 is where a durable per-member
 * preference store belongs.
 *
 * Consequence: the preference is **per browser**, not per member. One parent
 * hiding weekends never changes the other's calendar, which is the property
 * that actually matters here.
 *
 * This module is deliberately framework-free (no `next/headers`, no `"use
 * server"`) so both the Server Components that read the cookie and the client
 * card that writes it can import it, and so the parsing is unit-testable.
 */

export const HIDE_WEEKENDS_COOKIE = "wc-hide-weekends";

/** A year — long enough that a preference set once isn't quietly forgotten. */
export const HIDE_WEEKENDS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Read the preference out of a raw cookie value.
 *
 * Only the exact opt-in value counts; anything else — absent, empty, a stale
 * or hand-edited value — means "show weekends", today's behaviour. A cookie is
 * client-writable, so this never trusts it for anything beyond layout.
 */
export function parseHideWeekends(value: string | undefined): boolean {
  return value === "1";
}

/** The cookie value for a preference — the inverse of `parseHideWeekends`. */
export function serializeHideWeekends(hideWeekends: boolean): string {
  return hideWeekends ? "1" : "0";
}
