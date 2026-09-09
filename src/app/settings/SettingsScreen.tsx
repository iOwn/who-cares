"use client";

import { useRouter } from "next/navigation";
import type { CalendarDate, ChildcarePattern, Closure } from "@/domain";
import { RouteHeader, SectionHeading } from "@/ui";
import { ChildcareSettings } from "./ChildcareSettings";
import { PasskeyCard } from "./PasskeyCard";
import styles from "./SettingsScreen.module.css";
import { type DeviceView, SignedInDevices } from "./SignedInDevices";

export interface SettingsScreenProps {
  readonly childName: string;
  readonly devices: readonly DeviceView[];
  /** Childcare-pattern + closures sections (issue #49). */
  readonly pattern: ChildcarePattern | null;
  readonly closures: readonly Closure[];
  /** `'YYYY-MM-DD'` (the server's today) — default "effective from" date. */
  readonly today: CalendarDate;
}

/**
 * The Settings screen shell (issue #48). Client component so `RouteHeader`'s
 * `onBack` can call the router. Each concern is a self-contained section: the
 * two auth-hygiene ones here, plus the childcare-pattern / closures sections
 * from issue #49 (`ChildcareSettings`).
 */
export function SettingsScreen({
  childName,
  devices,
  pattern,
  closures,
  today,
}: SettingsScreenProps) {
  const router = useRouter();
  const title = childName ? `${childName}’s childcare` : "Settings";

  return (
    <div className={styles.base}>
      <RouteHeader title={title} onBack={() => router.push("/")} />

      <main className={styles.body}>
        <section className={styles.section} aria-labelledby="settings-passkey-heading">
          <SectionHeading id="settings-passkey-heading">Sign in faster</SectionHeading>
          <PasskeyCard />
        </section>

        <section className={styles.section} aria-labelledby="settings-devices-heading">
          <SectionHeading id="settings-devices-heading">Signed-in devices</SectionHeading>
          <SignedInDevices devices={devices} />
        </section>

        <ChildcareSettings pattern={pattern} closures={closures} today={today} />
      </main>
    </div>
  );
}
