"use client";

import { AppHeader } from "@/ui";
import styles from "./AppShell.module.css";

export interface AppShellProps {
  readonly childName: string;
}

/**
 * The authenticated app shell (issue #47): `AppHeader` + a placeholder
 * calendar region. A Client Component because `AppHeader.onOpenRequests` is a
 * function prop — Server Components can't pass those across the boundary.
 * `requestCount` is hardcoded to 0 and the bell is a no-op until the pickup-
 * request inbox exists (#52) and the calendar grid replaces the placeholder
 * (#49/#50).
 */
export function AppShell({ childName }: AppShellProps) {
  return (
    <>
      <AppHeader childName={childName} requestCount={0} onOpenRequests={() => {}} />
      <main className={styles.calendar} aria-label="Calendar">
        <p>The calendar is coming soon.</p>
      </main>
    </>
  );
}
