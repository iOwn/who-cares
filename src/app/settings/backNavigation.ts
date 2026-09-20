/**
 * How the Settings back arrow gets home (issue #144).
 *
 * `/` and `/settings` are both dynamic Server Components, so a fresh
 * `router.push("/")` re-renders the whole calendar on the server before
 * anything changes on screen. A `router.back()` instead restores the page
 * from Next's client cache — pages are reused on back/forward navigation, and
 * any Settings mutation (`revalidatePath`, `router.refresh()`, `cookies.set`)
 * purges that cache, so this member's own edits are never stale. The other
 * member's changes made during the visit are not picked up until the next
 * resume or pull-to-refresh (ADR-0016) — the same staleness the calendar has
 * while it simply sits open. But `router.back()` is only right when `/` really
 * is the previous history entry: a deep link or a reload landing on
 * `/settings` must push instead.
 *
 * The app shell records the hand-off in `sessionStorage` right before it
 * navigates; the Settings screen consumes the marker on mount. Storage in,
 * decision out — no `window`, no React — so it unit-tests in the `node`
 * Vitest project (`backNavigation.test.ts`) while the router wiring in
 * `AppShell.tsx` / `SettingsScreen.tsx` stays un-unit-tested (ADR-0005),
 * mirroring `refreshPolicy.ts` / `RefreshOnResume.tsx`.
 */

/** The subset of `Storage` these helpers touch — a `Map`-backed fake satisfies it. */
export interface MarkerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const OPENED_FROM_APP_KEY = "whocares.settings.openedFromApp";

/**
 * Record that Settings is about to be opened from the app shell. Call right
 * before `router.push("/settings")`. A `null` storage (or one that throws —
 * Safari private mode, a blocked-storage policy) is a silent no-op: the
 * fallback is merely the slower `push("/")`.
 */
export function markSettingsOpenedFromApp(storage: MarkerStorage | null): void {
  try {
    storage?.setItem(OPENED_FROM_APP_KEY, "1");
  } catch {
    // Storage unavailable — the back arrow will push instead of going back.
  }
}

/**
 * Whether Settings was opened from the app shell — and clear the marker, so a
 * later reload or deep link onto `/settings` in the same tab does not inherit
 * it. Call once, on the Settings screen's mount.
 */
export function consumeSettingsOpenedFromApp(storage: MarkerStorage | null): boolean {
  try {
    if (!storage || storage.getItem(OPENED_FROM_APP_KEY) === null) return false;
    storage.removeItem(OPENED_FROM_APP_KEY);
    return true;
  } catch {
    return false;
  }
}

/** `window.sessionStorage` when it can be touched, else `null`. */
export function sessionStorageOrNull(): MarkerStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
