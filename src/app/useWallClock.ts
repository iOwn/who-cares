"use client";

import { useEffect, useState } from "react";
import { useOnResume } from "./useOnResume";

/**
 * The viewer's wall clock as React state, seeded from a server-rendered ISO
 * instant so the first paint matches the server HTML, then corrected to the
 * real local clock on mount and re-sampled whenever the app resumes
 * (`useOnResume`).
 *
 * Day state is derived live (ADR-0003), so a long-lived PWA tab must not sit on
 * a stale `now` past a 48h threshold — hence the resume re-sample. Shared by
 * the app shell (inbox timing) and the calendar (grid derivation).
 */
export function useWallClock(initialNowIso: string): Date {
  const [now, setNow] = useState(() => new Date(initialNowIso));

  useEffect(() => {
    setNow(new Date());
  }, []);
  useOnResume(() => setNow(new Date()));

  return now;
}
