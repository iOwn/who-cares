"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  Absence,
  Assignment,
  CalendarDate,
  ChildcarePattern,
  Closure,
  Member,
  PickupRequest,
} from "@/domain";
import { AppHeader } from "@/ui";
import styles from "./AppShell.module.css";
import { Calendar } from "./Calendar";
import { Inbox } from "./Inbox";

export interface AppShellProps {
  readonly childName: string;
  readonly currentMemberId: string;
  readonly pattern: ChildcarePattern | null;
  readonly closures: readonly Closure[];
  readonly members: readonly Member[];
  readonly absences: readonly Absence[];
  readonly assignments: readonly Assignment[];
  readonly pickupRequests: readonly PickupRequest[];
  /** The real current date as the server saw it (`'YYYY-MM-DD'`, UTC). */
  readonly initialToday: CalendarDate;
  /** The real current instant as the server saw it (ISO). */
  readonly initialNow: string;
}

/**
 * The authenticated app shell (issues #47–#51): `AppHeader` + the calendar +
 * the pickup-request inbox. A Client Component — `AppHeader`'s handlers are
 * function props, `Calendar` owns paging state, and the bell toggles the inbox.
 *
 * The bell's count is the number of **open** requests addressed to the current
 * member; the inbox lists those. The shell wraps its children in a
 * `container-type` context so the inbox can switch between full-screen and
 * side-panel by container width, not viewport (`Inbox.module.css`).
 */
export function AppShell({
  childName,
  currentMemberId,
  pattern,
  closures,
  members,
  absences,
  assignments,
  pickupRequests,
  initialToday,
  initialNow,
}: AppShellProps) {
  const router = useRouter();
  const [inboxOpen, setInboxOpen] = useState(false);
  const [now, setNow] = useState(() => new Date(initialNow));

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

  const myOpenRequests = useMemo(
    () =>
      pickupRequests
        .filter((r) => r.state === "Open" && r.recipientId === currentMemberId)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    [pickupRequests, currentMemberId],
  );

  return (
    <div className={styles.shell}>
      <AppHeader
        childName={childName}
        requestCount={myOpenRequests.length}
        onOpenRequests={() => setInboxOpen(true)}
        onOpenSettings={() => router.push("/settings")}
      />
      <main aria-label="Calendar">
        <Calendar
          currentMemberId={currentMemberId}
          pattern={pattern}
          closures={closures}
          members={members}
          absences={absences}
          assignments={assignments}
          pickupRequests={pickupRequests}
          initialToday={initialToday}
          initialNow={initialNow}
        />
      </main>
      <Inbox
        isOpen={inboxOpen}
        onClose={() => setInboxOpen(false)}
        requests={myOpenRequests}
        members={members}
        now={now}
      />
    </div>
  );
}
