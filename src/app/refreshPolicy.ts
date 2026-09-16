/**
 * Pure throttle decision behind `RefreshOnResume` (issue #129, ADR-0016).
 *
 * Number in, boolean out — no `Date.now()`, no React — so it lives in the
 * `node` Vitest project (`refreshPolicy.test.ts`) while the event wiring in
 * `RefreshOnResume.tsx` stays un-unit-tested (ADR-0005), mirroring
 * `installEligibility.ts` / `InstallPrompt.tsx`.
 */

/**
 * Minimum gap between two resume-triggered refreshes. Each one re-renders the
 * whole route on the server (six repository reads on `/`), and desktop `focus`
 * fires on every click back into the window — 15 s keeps a parent who flicks
 * between apps from hammering the DB while still catching a real return.
 */
export const RESUME_REFRESH_MIN_INTERVAL_MS = 15_000;

/**
 * Whether a resume at `now` should trigger `router.refresh()`.
 *
 * `lastRefreshAt === null` means no resume-refresh has happened yet this
 * page-load — the first one always goes through, so a parent reopening the
 * installed app (the very case of #129) is never throttled, and the E2E smoke
 * can rely on a single synthetic `focus` event.
 */
export function shouldRefreshOnResume(
  lastRefreshAt: number | null,
  now: number,
  minInterval: number = RESUME_REFRESH_MIN_INTERVAL_MS,
): boolean {
  if (lastRefreshAt === null) return true;
  return now - lastRefreshAt >= minInterval;
}
