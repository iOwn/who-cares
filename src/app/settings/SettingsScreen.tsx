"use client";

import { useRouter } from "next/navigation";
import { RouteHeader, SectionHeading } from "@/ui";
import { PasskeyCard } from "./PasskeyCard";
import styles from "./SettingsScreen.module.css";
import { type DeviceView, SignedInDevices } from "./SignedInDevices";

export interface SettingsScreenProps {
  readonly childName: string;
  readonly devices: readonly DeviceView[];
}

/**
 * The Settings screen shell (issue #48). Client component so `RouteHeader`'s
 * `onBack` can call the router. Each concern is a self-contained section so a
 * parallel effort (issue #49's childcare-pattern / closures sections) can drop
 * its own `<section>` in here without touching this file's existing ones.
 */
export function SettingsScreen({ childName, devices }: SettingsScreenProps) {
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
      </main>
    </div>
  );
}
