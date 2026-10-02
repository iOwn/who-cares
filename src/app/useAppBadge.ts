"use client";

import { useEffect } from "react";
import { badgeUpdateFor } from "./appBadge";
import { useOnResume } from "./useOnResume";

/**
 * Mirror `count` onto the installed app's icon badge (issues #134, #174, ADR-0017,
 * ADR-0022). `count` is what needs the member — open requests plus at-risk days —
 * not the header bell's number.
 *
 * The other half of the feature lives in `public/sw.js`, which sets the badge
 * from the `badge` field of a push payload — that is what keeps the icon right
 * while the app is closed. This hook is the in-app half: it re-asserts the
 * server's count whenever the app is actually open, so the icon never lingers
 * on a stale number after a push.
 *
 * Re-applying on resume is not redundant with the `count` effect. If a push
 * moved the badge while the app was backgrounded and the count React last
 * rendered is unchanged, the effect alone would not re-fire and the service
 * worker's number would stick. `RefreshOnResume` (ADR-0016) refreshes the RSC
 * tree on the same resume, so by then this is re-asserting fresh server truth.
 *
 * Best-effort everywhere: Android Chrome does not implement the Badging API at
 * all, and on iOS 16.4+ it rejects until notification permission is granted.
 * Both are a silent no-op — the in-app bell already covers those parents.
 */
export function useAppBadge(count: number): void {
  useEffect(() => {
    apply(count);
  }, [count]);

  useOnResume(() => apply(count));
}

function apply(count: number): void {
  if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;

  const update = badgeUpdateFor(count);
  const applied =
    update.kind === "set" ? navigator.setAppBadge(update.count) : navigator.clearAppBadge();

  // A rejection here means "this platform or this permission state won't show a
  // badge", which is not an error worth surfacing anywhere.
  void applied?.catch(() => {});
}
