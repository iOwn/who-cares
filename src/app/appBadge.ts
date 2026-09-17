/**
 * Pure decision behind the app-icon badge (issue #134, ADR-0017).
 *
 * Number in, variant out — no `navigator`, no React — so it lives in the `node`
 * Vitest project (`appBadge.test.ts`) while the `navigator.setAppBadge` wiring
 * in `useAppBadge.ts` stays un-unit-tested (ADR-0005), mirroring
 * `refreshPolicy.ts` / `RefreshOnResume.tsx` and
 * `installEligibility.ts` / `InstallPrompt.tsx`.
 *
 * `public/sw.js` has its own `applyAppBadge` for the `badge` field of a push
 * payload — it is a static file outside the bundle and cannot import this one.
 * What must stay in step is the shared half: clear at zero, floor to an integer.
 * The two deliberately differ on junk input, because their inputs differ. Here
 * the count always exists, so anything unusable clears the icon. There the key
 * may be absent entirely, which means "the server sent no count" and must leave
 * the icon exactly as it was rather than wiping a good badge.
 */

/** Set the icon badge to `count`, or take it off the icon entirely. */
export type BadgeUpdate =
  | { readonly kind: "set"; readonly count: number }
  | { readonly kind: "clear" };

/**
 * What the icon should show for `count` unresolved items.
 *
 * Zero clears rather than showing a "0" — `CountBadge` renders nothing at 0 for
 * the same reason, and `setAppBadge(0)` is specified to clear anyway. Anything
 * not a positive finite number (a negative, `NaN`, a count that arrived over
 * the wire as something else) clears too: an unreadable count must never leave
 * a stale number stuck on a parent's Home Screen.
 */
export function badgeUpdateFor(count: number): BadgeUpdate {
  if (!Number.isFinite(count) || count < 1) return { kind: "clear" };
  return { kind: "set", count: Math.floor(count) };
}
