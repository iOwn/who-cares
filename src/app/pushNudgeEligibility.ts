/**
 * Pure decision behind the "turn on notifications" nudge (issue #174,
 * ADR-0022) — no `window`, no `navigator`, no React, so it lives in the `node`
 * Vitest project (`pushNudgeEligibility.test.ts`) while `PushNudge.tsx` keeps the browser
 * wiring, mirroring `installEligibility.ts` / `InstallPrompt.tsx`.
 *
 * Why it exists: on iOS 16.4+ `setAppBadge` is rejected until notification
 * permission is granted, and the permission prompt only lives on the
 * `/settings` push card. An installed parent who never opened it gets no icon
 * badge from either the service worker or `useAppBadge` — silently.
 *
 * Shown only where that is the actual gap: an installed (`standalone`) iOS /
 * iPadOS app that supports notifications and whose permission is still
 * `default`. `denied` is a browser-settings matter the nudge cannot fix, and
 * `granted` is done.
 */

import { isIOS } from "./settings/pushSupport";

export interface PushNudgeInput {
  /** `window.matchMedia('(display-mode: standalone)').matches` — installed. */
  readonly standalone: boolean;
  readonly userAgent: string;
  /** `navigator.maxTouchPoints` — spots iPadOS 13+ reporting a desktop UA. */
  readonly maxTouchPoints: number;
  /** `Notification.permission`, or `null` when the Notification API is absent. */
  readonly permission: NotificationPermission | null;
  /** The parent has dismissed the nudge before (persisted in `localStorage`). */
  readonly dismissed: boolean;
}

export function shouldShowPushNudge(input: PushNudgeInput): boolean {
  if (!input.standalone || input.dismissed) return false;
  if (input.permission !== "default") return false;
  const iPadOS = /\bMacintosh\b/.test(input.userAgent) && input.maxTouchPoints > 1;
  return isIOS(input.userAgent) || iPadOS;
}
