/**
 * Pure presentation helpers for the signed-in-devices list (issue #48).
 *
 * A Better Auth `session` row carries a raw `userAgent` string and timestamps;
 * the Settings UI wants a friendly device label and a relative "last active"
 * line. Both derivations are string-in / string-out with no I/O, so they live
 * here and are unit-tested in the `node` project (`deviceInfo.test.ts`) rather
 * than exercised through the un-unit-tested auth wiring (ADR-0005 / ADR-0008).
 *
 * `describeUserAgent` is deliberately coarse — a best-effort "Browser on OS"
 * good enough for a two-person household to recognise their own devices, not a
 * full UA-parsing library.
 */

interface Match {
  readonly test: RegExp;
  readonly label: string;
}

/** Order matters: more specific engines first (Edge/Opera before Chrome). */
const BROWSERS: readonly Match[] = [
  { test: /\bEdg(?:iOS|A)?\//, label: "Edge" },
  { test: /\bOPR\/|\bOpera\//, label: "Opera" },
  { test: /\bFirefox\/|\bFxiOS\//, label: "Firefox" },
  { test: /\bCriOS\//, label: "Chrome" },
  { test: /\bChrome\/|\bChromium\//, label: "Chrome" },
  { test: /\bSafari\//, label: "Safari" },
];

const OSES: readonly Match[] = [
  { test: /\biPhone\b/, label: "iPhone" },
  { test: /\biPad\b/, label: "iPad" },
  { test: /\bAndroid\b/, label: "Android" },
  { test: /\bWindows NT\b/, label: "Windows" },
  { test: /\bMac OS X\b|\bMacintosh\b/, label: "macOS" },
  { test: /\bCrOS\b/, label: "ChromeOS" },
  { test: /\bLinux\b/, label: "Linux" },
];

/** A friendly "Chrome on macOS" style label. Falls back gracefully. */
export function describeUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent?.trim();
  if (!ua) return "Unknown device";

  const browser = BROWSERS.find((m) => m.test.test(ua))?.label;
  const os = OSES.find((m) => m.test.test(ua))?.label;

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return "Unknown device";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A short relative "last active" line: "Just now", "5 minutes ago", "3 hours
 * ago", "2 days ago", then an absolute date past a week. A future timestamp
 * (clock skew) reads as "Just now".
 */
export function formatLastActive(when: Date, now: Date = new Date()): string {
  const diff = now.getTime() - when.getTime();

  if (diff < MINUTE) return "Just now";
  if (diff < HOUR) return plural(Math.floor(diff / MINUTE), "minute");
  if (diff < DAY) return plural(Math.floor(diff / HOUR), "hour");
  if (diff < 7 * DAY) return plural(Math.floor(diff / DAY), "day");

  return `on ${when.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}
