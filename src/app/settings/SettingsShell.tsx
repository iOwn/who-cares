"use client";

import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { RouteHeader, SegmentedControl } from "@/ui";
import { usePrefetchRoute } from "../prefetchRoute";
import { consumeSettingsOpenedFromApp, sessionStorageOrNull } from "./backNavigation";
import styles from "./SettingsScreen.module.css";
import {
  SETTINGS_TAB_ORDER,
  SETTINGS_TABS,
  settingsTabForSegment,
  settingsTabFromValue,
  siblingSettingsTab,
} from "./settingsRoute";

/**
 * The Settings frame shared by both tabs (issue #143): `RouteHeader` + the
 * You / Household switch + the back-arrow logic. Rendered by
 * `./layout.tsx`, so it stays mounted while the pages under it swap — which
 * is the whole point:
 *
 * - The "opened from the app" marker (`./backNavigation.ts`, issue #144) is
 *   single-use and consumed on mount. If each tab mounted its own header,
 *   switching tabs would lose it and the back arrow would fall back to the
 *   slow `router.push("/")`. Here the `useRef` latch outlives the switch.
 * - Switching tabs is `router.replace`, not `push`: history stays
 *   `/ → /settings*`, so `router.back()` lands on the cached calendar from
 *   either tab.
 * - The sibling tab is kept prefetched, so the switch — like the gear —
 *   responds before the server's first byte.
 *
 * The shell reads no session and no data — `./layout.tsx` is deliberately
 * static, because a layout that touches `headers()` / `cookies()` makes Next
 * block navigation until it has rendered, skipping the `loading.tsx`
 * fallback entirely (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`).
 * That is why the titles are fixed per tab rather than "{child}'s childcare":
 * the child's name lives in the household page's lead line instead.
 *
 * The switch is a `SegmentedControl` (a radio group) driving `router.replace`,
 * the same shape as the calendar's Grid / List tabs. A `<nav>` of links with
 * `aria-current` would be the more literal choice; treat this as v1.
 */
export function SettingsShell({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const tab = settingsTabForSegment(useSelectedLayoutSegment());
  const { title } = SETTINGS_TABS[tab];

  // Read on mount, not during render (the server has no storage to read). The
  // marker is single-use, so only ever latch to `true` — dev Strict Mode runs
  // this effect twice and the second read comes back empty.
  const openedFromApp = useRef(false);
  useEffect(() => {
    if (consumeSettingsOpenedFromApp(sessionStorageOrNull())) openedFromApp.current = true;
  }, []);

  // Only the deep-link / reload fallback pays for a fresh `/` render; keep its
  // loading shell warm so even that case responds on the tap.
  usePrefetchRoute("/");
  usePrefetchRoute(SETTINGS_TABS[siblingSettingsTab(tab)].href);

  function goBack() {
    if (openedFromApp.current) router.back();
    else router.push("/");
  }

  function switchTab(value: string) {
    const next = settingsTabFromValue(value, tab);
    if (next !== tab) router.replace(SETTINGS_TABS[next].href);
  }

  return (
    <div className={styles.base}>
      <RouteHeader title={title} onBack={goBack} />

      <main className={styles.body}>
        <SegmentedControl
          aria-label="Settings for"
          value={tab}
          onChange={switchTab}
          className={styles.tabs}
        >
          {SETTINGS_TAB_ORDER.map((key) => (
            <SegmentedControl.Item key={key} value={key}>
              {SETTINGS_TABS[key].label}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>

        {children}
      </main>
    </div>
  );
}
