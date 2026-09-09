/**
 * Pure relative-time formatting for the pickup-request inbox (#51). ADR-0009:
 * non-trivial pure display logic is extracted here and unit-tested in the
 * `node` project (`relativeTime.test.ts`) rather than through a component test.
 *
 * The copy is plain and factual, never urgency-toned (SPEC.md "Notifications"
 * — "calm and factual, never urgency- or guilt-toned, even for at-risk").
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A short "how long ago" phrase for an instant in the past, e.g. `"just now"`,
 * `"3 hours ago"`, `"2 days ago"`. A future or present instant is `"just now"`.
 */
export function timeAgo(instant: Date, now: Date): string {
  const elapsed = now.getTime() - instant.getTime();
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), "hour");
  return plural(Math.floor(elapsed / DAY), "day");
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/**
 * The pickup-request timing line. Before either ADR-0003 48h threshold it reads
 * as a neutral "asked {ago}"; once escalated it states the fact plainly.
 */
export function requestTimingLine(raisedAt: Date, now: Date, escalated: boolean): string {
  if (escalated) {
    return `Still no answer — asked ${timeAgo(raisedAt, now)}.`;
  }
  return `Asked ${timeAgo(raisedAt, now)}.`;
}
