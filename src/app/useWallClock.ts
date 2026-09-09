"use client";

import { useEffect, useState } from "react";

/**
 * The viewer's wall clock as React state, seeded from a server-rendered ISO
 * instant so the first paint matches the server HTML, then corrected to the
 * real local clock on mount and re-sampled whenever the tab regains focus /
 * visibility.
 *
 * Day state is derived live (ADR-0003), so a long-lived PWA tab must not sit on
 * a stale `now` past a 48h threshold — hence the focus / visibility re-sample.
 * Shared by the app shell (inbox timing) and the calendar (grid derivation).
 */
export function useWallClock(initialNowIso: string): Date {
  const [now, setNow] = useState(() => new Date(initialNowIso));

  useEffect(() => {
    const sync = () => setNow(new Date());
    sync();
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return now;
}
