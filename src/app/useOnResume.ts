"use client";

import { useEffect, useEffectEvent } from "react";

/**
 * Run `callback` whenever the app "resumes" — the tab becomes visible again,
 * the window regains focus, or the page is restored from the back/forward
 * cache (`pageshow` with `persisted` — browsers also raise `visibilitychange`
 * on a restore, but not all of them reliably, so both are listened to).
 *
 * Exists because an installed PWA (`display: standalone`) is a long-lived tab
 * that gets backgrounded and reopened for days. Two things need to react to
 * that: the wall clock (`useWallClock`, ADR-0003's live derivation) and the
 * data itself (`RefreshOnResume`, issue #129 / ADR-0016).
 *
 * The callback goes through `useEffectEvent` so the listeners are registered
 * exactly once, always see the latest callback, and callers don't have to
 * memoise.
 */
export function useOnResume(callback: () => void): void {
  const resume = useEffectEvent(() => callback());

  useEffect(() => {
    const onFocus = () => resume();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") resume();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resume();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
}
