"use client";

import { useEffect, useRef } from "react";

/**
 * Run `callback` whenever the app "resumes" — the tab becomes visible again,
 * the window regains focus, or the page is restored from the back/forward
 * cache (`pageshow` with `persisted`, which fires neither of the other two).
 *
 * Exists because an installed PWA (`display: standalone`) is a long-lived tab
 * that gets backgrounded and reopened for days. Two things need to react to
 * that: the wall clock (`useWallClock`, ADR-0003's live derivation) and the
 * data itself (`RefreshOnResume`, issue #129 / ADR-0016).
 *
 * The callback is held in a ref so the listeners are registered exactly once
 * and callers don't have to memoise.
 */
export function useOnResume(callback: () => void): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const resume = () => callbackRef.current();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") resume();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resume();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
}
