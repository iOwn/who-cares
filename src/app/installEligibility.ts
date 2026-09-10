/**
 * Pure display logic for the "Add WhoCares to your Home Screen" onboarding
 * prompt (issue #56, PWA polish).
 *
 * Boolean / string in, enum out — no `window`, no `navigator`, no React — so it
 * lives in the `node` Vitest project (`installEligibility.test.ts`) rather than
 * being exercised through the un-unit-tested client wiring (ADR-0005, ADR-0008).
 * The stateful half (the `beforeinstallprompt` event, the `display-mode` media
 * query, the dismissal in `localStorage`) lives in `InstallPrompt.tsx`.
 *
 * The manifest and the service worker are already shipped (`src/app/manifest.ts`,
 * `public/sw.js`, `ServiceWorkerRegistrar`); this only decides whether — and in
 * which form — to nudge a parent to actually install.
 */

import { needsIOSInstall } from "./settings/pushSupport";

/**
 * What the onboarding install nudge should render:
 *
 * - `"hidden"`  — already installed, dismissed, or nothing useful to offer
 *   (e.g. a desktop browser that fired no `beforeinstallprompt`).
 * - `"prompt"`  — a real deferred `beforeinstallprompt` event is in hand; show a
 *   button that calls `.prompt()`.
 * - `"ios-guidance"` — iOS / iPadOS Safari, where there is no
 *   `beforeinstallprompt`; show the "tap Share, then Add to Home Screen" steps.
 */
export type InstallPromptState = "hidden" | "prompt" | "ios-guidance";

export interface InstallPromptInput {
  /** `window.matchMedia('(display-mode: standalone)').matches` — already installed. */
  readonly standalone: boolean;
  /** `navigator.userAgent`. */
  readonly userAgent: string;
  /**
   * `navigator.maxTouchPoints` — lets `needsIOSInstall` spot an iPadOS 13+
   * device reporting a desktop Safari UA.
   */
  readonly maxTouchPoints: number;
  /** A deferred `beforeinstallprompt` event has been captured. */
  readonly canPrompt: boolean;
  /** The parent has dismissed the nudge before (persisted in `localStorage`). */
  readonly dismissed: boolean;
}

/** Decide what the onboarding install nudge should show. */
export function installPromptState(input: InstallPromptInput): InstallPromptState {
  if (input.standalone || input.dismissed) return "hidden";

  if (input.canPrompt) return "prompt";

  // No `beforeinstallprompt` on iOS/iPadOS Safari — the same "needs a Home
  // Screen install first" situation `PushCard` already detects for web push.
  const iosInstall = needsIOSInstall({
    userAgent: input.userAgent,
    maxTouchPoints: input.maxTouchPoints,
    standalone: input.standalone,
  });
  return iosInstall ? "ios-guidance" : "hidden";
}
