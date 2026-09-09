"use client";

import { useRouter } from "next/navigation";
import type { CalendarDate, ChildcarePattern, Closure, Member } from "@/domain";
import { AppHeader } from "@/ui";
import { Calendar } from "./Calendar";

export interface AppShellProps {
  readonly childName: string;
  readonly pattern: ChildcarePattern | null;
  readonly closures: readonly Closure[];
  readonly members: readonly Member[];
  /** The real current date as the server saw it (`'YYYY-MM-DD'`, UTC). */
  readonly initialToday: CalendarDate;
  /** The real current instant as the server saw it (ISO). */
  readonly initialNow: string;
}

/**
 * The authenticated app shell (issues #47, #48, #49): `AppHeader` + the real
 * calendar. A Client Component because `AppHeader`'s `onOpenRequests` /
 * `onOpenSettings` are function props and `Calendar` owns paging state.
 * `requestCount` is hardcoded to 0 and the bell is a no-op until the
 * pickup-request inbox exists (#52); the gear routes to `/settings` (the
 * app-shell's only entry point to it).
 */
export function AppShell({
  childName,
  pattern,
  closures,
  members,
  initialToday,
  initialNow,
}: AppShellProps) {
  const router = useRouter();
  return (
    <>
      <AppHeader
        childName={childName}
        requestCount={0}
        onOpenRequests={() => {}}
        onOpenSettings={() => router.push("/settings")}
      />
      <main aria-label="Calendar">
        <Calendar
          pattern={pattern}
          closures={closures}
          members={members}
          initialToday={initialToday}
          initialNow={initialNow}
        />
      </main>
    </>
  );
}
