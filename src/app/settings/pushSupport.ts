/**
 * Pure helpers for the push-enrollment card (issue #90).
 *
 * String-in / value-out, no browser globals touched at module load, so they are
 * unit-tested in the `node` project (`pushSupport.test.ts`) rather than through
 * the un-unit-tested client wiring (ADR-0005). `usePushEnrollment` owns the
 * stateful `navigator` / `PushManager` calls.
 */

/**
 * Decode a URL-safe base64 VAPID key into the `Uint8Array` that
 * `pushManager.subscribe({ applicationServerKey })` requires (the Push API
 * rejects the raw string). Lifted from the MDN / Next.js PWA reference.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Back it with a plain ArrayBuffer so it satisfies `BufferSource` for
  // `pushManager.subscribe({ applicationServerKey })` under `lib.dom`.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** iOS / iPadOS — the platforms where push needs a Home-Screen install first. */
export function isIOS(userAgent: string): boolean {
  if (/\b(iPhone|iPad|iPod)\b/.test(userAgent)) return true;
  // iPadOS 13+ reports a desktop-Safari UA; the touch-point check disambiguates
  // it from a real Mac. Callers on the server pass `navigator.maxTouchPoints`
  // via the second form below.
  return false;
}

/**
 * Whether the iOS Home-Screen-install onboarding should be shown: an iOS device
 * (incl. desktop-UA iPadOS, detected by touch points) that is not already
 * running as an installed standalone app.
 */
export function needsIOSInstall(input: {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
}): boolean {
  if (input.standalone) return false;
  const iPadOS = /\bMacintosh\b/.test(input.userAgent) && input.maxTouchPoints > 1;
  return isIOS(input.userAgent) || iPadOS;
}
