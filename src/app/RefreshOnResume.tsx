"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { shouldRefreshOnResume } from "./refreshPolicy";
import { useOnResume } from "./useOnResume";

/**
 * Re-fetches the current route whenever the app resumes (issue #129, ADR-0016).
 *
 * Both authenticated routes render a snapshot on the server and hand it to a
 * client screen; nothing re-fetches while the tab stays open. An installed PWA
 * has no reload button, so a parent reopening it from the Home Screen would
 * otherwise see yesterday's requests. `router.refresh()` re-runs the Server
 * Components and merges the payload without disturbing client state — an open
 * dialog, the inbox, calendar paging all survive.
 *
 * Mounted once in the root layout so `/` and `/settings` both get it. Throttled
 * by `shouldRefreshOnResume`; the first resume after load is never throttled.
 * Renders nothing.
 */
export function RefreshOnResume() {
  const router = useRouter();
  const lastRefreshAt = useRef<number | null>(null);

  useOnResume(() => {
    const now = Date.now();
    if (!shouldRefreshOnResume(lastRefreshAt.current, now)) return;
    lastRefreshAt.current = now;
    router.refresh();
  });

  return null;
}
