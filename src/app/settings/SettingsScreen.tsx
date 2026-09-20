"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { CalendarDate, ChildcarePattern, Closure } from "@/domain";
import { RouteHeader, SectionHeading } from "@/ui";
import { usePrefetchRoute } from "../prefetchRoute";
import { consumeSettingsOpenedFromApp, sessionStorageOrNull } from "./backNavigation";
import { ChildcareSettings } from "./ChildcareSettings";
import { PasskeyCard } from "./PasskeyCard";
import { type PushBrowserView, PushCard } from "./PushCard";
import styles from "./SettingsScreen.module.css";
import { type DeviceView, SignedInDevices } from "./SignedInDevices";
import { WeekendDaysCard } from "./WeekendDaysCard";

export interface SettingsScreenProps {
  readonly childName: string;
  readonly devices: readonly DeviceView[];
  /** This member's registered push browsers (issue #90). */
  readonly pushBrowsers: readonly PushBrowserView[];
  /** Childcare-pattern + closures sections (issue #49). */
  readonly pattern: ChildcarePattern | null;
  readonly closures: readonly Closure[];
  /** `'YYYY-MM-DD'` (the server's today) — default "effective from" date. */
  readonly today: CalendarDate;
  /** This browser's "hide weekend days" preference (issue #130). */
  readonly hideWeekends: boolean;
}

/**
 * The Settings screen shell (issue #48). Client component so `RouteHeader`'s
 * `onBack` can call the router. Each concern is a self-contained section: the
 * two auth-hygiene ones here, plus the childcare-pattern / closures sections
 * from issue #49 (`ChildcareSettings`).
 *
 * The back arrow goes `router.back()` when the app shell opened this screen —
 * that restores the calendar from the client cache instead of re-rendering it
 * on the server — and falls back to `router.push("/")` for a deep link or a
 * reload, where there is no cached calendar behind us (issue #144,
 * `./backNavigation.ts`).
 */
export function SettingsScreen({
  childName,
  devices,
  pushBrowsers,
  pattern,
  closures,
  today,
  hideWeekends,
}: SettingsScreenProps) {
  const router = useRouter();
  const title = childName ? `${childName}’s childcare` : "Settings";

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
  function goBack() {
    if (openedFromApp.current) router.back();
    else router.push("/");
  }

  return (
    <div className={styles.base}>
      <RouteHeader title={title} onBack={goBack} />

      <main className={styles.body}>
        <section className={styles.section} aria-labelledby="settings-passkey-heading">
          <SectionHeading id="settings-passkey-heading">Sign in faster</SectionHeading>
          <PasskeyCard />
        </section>

        <section className={styles.section} aria-labelledby="settings-devices-heading">
          <SectionHeading id="settings-devices-heading">Signed-in devices</SectionHeading>
          <SignedInDevices devices={devices} />
        </section>

        <section className={styles.section} aria-labelledby="settings-push-heading">
          <SectionHeading id="settings-push-heading">Notifications</SectionHeading>
          <PushCard browsers={pushBrowsers} />
        </section>

        <section className={styles.section} aria-labelledby="settings-calendar-heading">
          <SectionHeading id="settings-calendar-heading">Calendar</SectionHeading>
          <WeekendDaysCard hideWeekends={hideWeekends} />
        </section>

        <ChildcareSettings pattern={pattern} closures={closures} today={today} />
      </main>
    </div>
  );
}
